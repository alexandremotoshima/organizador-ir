// ── Importação via planilha Excel + pasta de comprovantes ─────────────────────
import { addDespesa, despesas, saveDespesasToStorage } from './state.js';
import { dbPut }      from './db.js';
import { escH }       from './helpers.js';
import { renderAll }  from './ui.js';
import { toast }      from './modal.js';

let _parsed  = [];           // despesas lidas do Excel
let _folders = new Map();    // nomePasta → File[]  (subpastas com vários arquivos)
let _files   = new Map();    // nomeArquivo → File  (arquivos soltos na raiz)
let _syncUrl = null;         // URL usada na última busca via Google Sheets

// ── Carrega SheetJS via CDN (lazy) ───────────────────────────────────────────
async function loadXLSX() {
  if (window.XLSX) return window.XLSX;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timeout. Verifique a conexão com a internet.')), 10000
    );
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload  = () => { clearTimeout(timer); resolve(window.XLSX); };
    s.onerror = () => { clearTimeout(timer); reject(new Error('Falha ao carregar SheetJS.')); };
    document.head.appendChild(s);
  });
}

// ── Helpers de parsing ────────────────────────────────────────────────────────
function parseBRL(v) {
  if (typeof v === 'number') return v;           // raw:true → número direto
  if (!v) return 0;
  const s = v.toString().replace(/R\$\s*/g, '').replace(/\s/g, '').trim();
  if (!s) return 0;
  // Detecta separador decimal: se vírgula existe e vem depois do ponto → BR "1.234,56"
  if (s.includes(',') && s.includes('.')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (s.includes(',')) return parseFloat(s.replace(',', '.')) || 0;  // "850,00"
  return parseFloat(s) || 0;                     // "850.00" ou "850"
}

// Detecta se o CSV usa MM/DD/YYYY ou DD/MM/YYYY varrendo TODAS as datas.
// Conta evidências de cada formato e usa o mais forte — assim datas ambíguas
// (ambos os componentes ≤ 12) seguem o mesmo padrão das não-ambíguas.
function detectDateFmt(dateValues) {
  let ddmm = 0, mmdd = 0;
  for (const v of dateValues) {
    if (!v) continue;
    const m = v.toString().match(/(\d{1,2})\/(\d{1,2})\/\d{4}/);
    if (!m) continue;
    const a = parseInt(m[1]), b = parseInt(m[2]);
    if (a > 12) ddmm++; // 1º parte > 12 → só pode ser dia → DD/MM
    if (b > 12) mmdd++; // 2º parte > 12 → só pode ser dia → MM/DD
  }
  if (mmdd > ddmm) return 'MM/DD';
  if (ddmm > 0)    return 'DD/MM';
  return 'DD/MM'; // tudo ambíguo → padrão BR
}

function parseDate(v, fmt = 'DD/MM') {
  if (!v) return '';
  if (v instanceof Date) {
    // Usa UTC para evitar que timezone negativa (ex: UTC-3) vire o dia anterior
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Serial do Excel: dias desde 1900-01-01 (25569 = diferença até 1970-01-01)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const dt = new Date(ms);
    const y  = dt.getUTCFullYear();
    const m  = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d  = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = v.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); // já em ISO
  const match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);  // sem anchors: aceita hora no fim
  if (!match) return '';
  const [p1, p2, year] = [match[1], match[2], match[3]];
  const [dd, mm] = fmt === 'MM/DD' ? [p2, p1] : [p1, p2];
  return `${year}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

function normBool(v) {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s === 'sim' || s === 's' || s === 'x' || s === '✓' || s === 'ok' || s === '1' || s === 'true';
}

// Busca pasta ou arquivo cujo nome contenha MM.DD ou DD.MM
function findBestMatch(date, map) {
  if (!date || !map.size) return null;
  const [, mm, dd] = date.split('-');
  const p1 = `${mm}.${dd}`;   // 01.16
  const p2 = `${dd}.${mm}`;   // 16.01
  return [...map.keys()].find(n => n.includes(p1) || n.includes(p2)) || null;
}

// ── Busca planilha direto do Google Sheets ────────────────────────────────────
export async function fetchSheetFromUrl() {
  const urlInput = document.getElementById('import-sheet-url');
  const url      = urlInput?.value.trim();
  const statusEl = document.getElementById('import-status');

  if (!url) { statusEl.textContent = 'Cole o link da planilha antes.'; return; }

  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    statusEl.textContent = 'Link inválido. Use o link de compartilhamento do Google Sheets.';
    return;
  }

  const sheetId  = match[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid      = gidMatch?.[1] ?? '0';
  const csvUrl   = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  statusEl.textContent = 'Buscando planilha…';
  document.getElementById('btn-fetch-sheet').disabled = true;

  try {
    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const file = new File([text], 'planilha.csv', { type: 'text/csv' });
    await onSheetChange(file);
    _syncUrl = url;
    // Registra URL imediatamente; count/at são atualizados ao confirmar importação
    const prev = (() => { try { return JSON.parse(localStorage.getItem('ir_sync') || '{}'); } catch { return {}; } })();
    localStorage.setItem('ir_sync', JSON.stringify({ url, at: prev.at || new Date().toISOString(), count: prev.count ?? 0 }));
  } catch (e) {
    const isCors = e instanceof TypeError;
    statusEl.textContent = isCors
      ? 'Bloqueio CORS: abra a planilha → Arquivo → Compartilhar → "Qualquer pessoa com o link" e tente novamente.'
      : `Erro ao buscar planilha: ${e.message}`;
  } finally {
    document.getElementById('btn-fetch-sheet').disabled = false;
  }
}

// ── Overlay: abrir / fechar ───────────────────────────────────────────────────
export function openImportOverlay() {
  document.getElementById('import-overlay').classList.remove('hidden');
  try {
    const sync = JSON.parse(localStorage.getItem('ir_sync') || '{}');
    const el = document.getElementById('import-sheet-url');
    if (el && sync.url && !el.value) el.value = sync.url;
  } catch { /* ignore */ }
}

export function closeImportOverlay() {
  _parsed = [];
  _folders.clear();
  _files.clear();
  ['import-xlsx-input', 'import-folder-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const urlInput = document.getElementById('import-sheet-url');
  if (urlInput) urlInput.value = '';
  document.getElementById('import-preview').innerHTML = '';
  document.getElementById('import-status').textContent = '';
  document.getElementById('btn-confirm-import').disabled = true;
  document.getElementById('btn-confirm-import').textContent = 'Importar despesas';
  document.getElementById('import-overlay').classList.add('hidden');
}

// ── Seleção manual via dropdown (override) ────────────────────────────────────
// value: "folder:nome" | "file:nome" | ""
window._importSetFile = function(idx, value) {
  const exp = _parsed[idx];
  if (!exp) return;
  if (value.startsWith('folder:')) {
    exp.selectedFolder = value.slice(7);
    exp.selectedFile   = null;
  } else if (value.startsWith('file:')) {
    exp.selectedFile   = value.slice(5);
    exp.selectedFolder = null;
  } else {
    exp.selectedFolder = null;
    exp.selectedFile   = null;
  }
  // Atualiza visual da linha
  const sel = document.querySelector(`select[data-idx="${idx}"]`);
  if (sel) sel.className = `import-file-select ${value ? 'import-select-ok' : 'import-select-miss'}`;
  updateSummaryLine();
};

function updateSummaryLine() {
  const novas = _parsed.filter(e => !e.duplicate);
  const vinc  = novas.filter(e => e.selectedFolder || e.selectedFile).length;
  const sem   = novas.length - vinc;
  const dup   = _parsed.length - novas.length;
  const el    = document.getElementById('import-summary-line');
  if (!el) return;
  el.innerHTML =
    `<strong style="color:var(--teal)">${novas.length}</strong> nova${novas.length !== 1 ? 's' : ''} · ` +
    (dup > 0 ? `<strong style="color:var(--muted)">${dup} já importada${dup !== 1 ? 's' : ''} (ignoradas)</strong> · ` : '') +
    `<strong>${_folders.size}</strong> pasta${_folders.size !== 1 ? 's' : ''} + ` +
    `<strong>${_files.size}</strong> arquivo${_files.size !== 1 ? 's' : ''} avulso${_files.size !== 1 ? 's' : ''} · ` +
    `<strong style="color:var(--teal)">${vinc}</strong> vinculado${vinc !== 1 ? 's' : ''}` +
    (sem > 0 ? ` · <strong style="color:var(--amber)">${sem} sem comprovante</strong>` : '');
}

// ── Leitura da planilha ───────────────────────────────────────────────────────
export async function onSheetChange(file) {
  const statusEl = document.getElementById('import-status');
  statusEl.textContent = 'Lendo planilha…';
  try {
    const XLSX  = await loadXLSX();
    const isCSV = file.name.toLowerCase().endsWith('.csv');
    const wb    = isCSV
      ? XLSX.read(await file.text(), { type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

    if (rows.length < 2) throw new Error('Planilha sem dados.');

    const normalize = h => (h == null ? '' : String(h)).replace(/^﻿/, '').trim().toUpperCase();

    // Localiza a linha de cabeçalho (busca nas primeiras 10 linhas)
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const r = rows[i].map(normalize);
      if (r.some(h => h === 'DATA') && r.some(h => h.includes('VALOR'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) {
      throw new Error(`Cabeçalho não encontrado. Primeira linha: ${rows[0].map(normalize).filter(Boolean).join(' | ')}`);
    }

    const hdrs = rows[headerIdx].map(normalize);
    const col  = (...terms) => hdrs.findIndex(h => terms.some(t => h.includes(t)));

    const nextValor = (stIdx) =>
      (stIdx >= 0 && (hdrs[stIdx + 1] || '').includes('VALOR')) ? stIdx + 1 : -1;

    // Prefere a coluna DATA MM/DD ou DATA MM/DD/YYYY (correlação com diretórios MM.DD) se existir
    const dataMmDdIdx = hdrs.findIndex(h => /DATA\s*MM\/DD(?:\/YYYY)?/i.test(h));
    const C = {
      data:     dataMmDdIdx >= 0 ? dataMmDdIdx : col('DATA'),
      medico:   col('MÉDICO', 'MEDICO'),
      espec:    col('ESPECIALIDADE'),
      valor:    col('VALOR TOT', 'VALOR TOTAL'),
      pagoPor:  col('PAGO PO', 'PAGO POR'),
      naoR:     col('NÃO REEM', 'NAO REEM', 'NÃO REEMB', 'NAO REEMB', 'NÃO REEMBOLSADO', 'NAO REEMBOLSADO'),
      bradSt:   col('BRADESCO', 'BRADESC'),
      saPartSt: col('SULAMERICA PA', 'SUL AMERICA PA', 'SULAM. PART', 'SULAMERICA PART', 'SA PART', 'SA_PART'),
      saKcSt:   col('SULAMERICA KC', 'SUL AMERICA KC', 'SULAM. KC', 'SA KC', 'SA_KC'),
      comprov:  col('COMPROVANTE', 'COMPROVA', 'COMPROV'),
      nfiscal:  col('NOTA FISCAL', 'NOTA FIS', 'N. FISCAL'),
      pedido:   col('PEDIDO MED', 'PEDIDO MÉD', 'PED. MED', 'PEDIDO MÉDICO', 'PEDIDO MEDICO'),
    };
    // Coluna de valor de cada plano = coluna seguinte ao status se for "VALOR"
    C.bradVl   = nextValor(C.bradSt)   >= 0 ? nextValor(C.bradSt)   : col('VL BRAD',    'VALOR BRAD',    'BRADESCO VL');
    C.saPartVl = nextValor(C.saPartSt) >= 0 ? nextValor(C.saPartSt) : col('VL SA PART', 'VALOR SA PART', 'SULAM PART VL');
    C.saKcVl   = nextValor(C.saKcSt)  >= 0 ? nextValor(C.saKcSt)   : col('VL SA KC',   'VALOR SA KC',   'SULAM KC VL');
    if (C.naoR < 0) C.naoR = hdrs.length - 1;

    if (C.data < 0 || C.valor < 0) {
      throw new Error(`Colunas não encontradas. Cabeçalhos lidos: ${hdrs.join(' | ')}`);
    }

    // Se existe coluna DATA MM/DD, o formato é sempre MM/DD (sem auto-detect)
    const dateFmt = dataMmDdIdx >= 0 ? 'MM/DD'
      : detectDateFmt(rows.slice(headerIdx + 1).map(r => r[C.data]));

    _parsed = rows.slice(headerIdx + 1)
      .filter(r => {
        const pago  = r[C.pagoPor]?.toString().trim();
        const valor = parseBRL(r[C.valor]);
        return r[C.data] && (valor > 0 || pago === 'Retorno');
      })
      .map((r, i) => {
        const medico = r[C.medico]?.toString().trim() || '';
        const espec  = r[C.espec]?.toString().trim()  || '';
        const desc   = C.desc >= 0 ? r[C.desc]?.toString().trim() || '' : medico + (espec ? ` – ${espec}` : '');
        const pago   = r[C.pagoPor]?.toString().trim();
        const valor  = parseBRL(r[C.valor]);
        const naoR   = parseBRL(r[C.naoR]);
        const date    = parseDate(r[C.data], dateFmt);
        const rawDate = date
          ? `${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`
          : String(r[C.data] ?? '').trim();
        const normRb = (cellVal) => {
          const v = (cellVal ?? '').toString().trim().toLowerCase();
          if (v === 'solicitar' || v === 'a solicitar') return 'solicitar';
          if (v === 'solicitado' || v === 'aguardando' || v === 'enviado') return 'solicitado';
          if (v === 'concluido' || v === 'concluído' || v === 'ok' || v === 'sim') return 'concluido';
          return 'na';
        };
        return {
          _i: i,
          date,
          rawDate,
          desc,
          pagador:        pago === 'Ale' ? 'titular' : pago === 'Dani' ? 'conjuge' : 'titular',
          valor,
          reembolso:      Math.max(0, valor - naoR),
          reembolsos: [
            { plano: 'bradesco', status: C.bradSt   >= 0 ? normRb(r[C.bradSt])   : 'na', valor: C.bradVl   >= 0 ? parseBRL(r[C.bradVl])   : 0 },
            { plano: 'sa_part',  status: C.saPartSt >= 0 ? normRb(r[C.saPartSt]) : 'na', valor: C.saPartVl >= 0 ? parseBRL(r[C.saPartVl]) : 0 },
            { plano: 'sa_kc',    status: C.saKcSt   >= 0 ? normRb(r[C.saKcSt])   : 'na', valor: C.saKcVl   >= 0 ? parseBRL(r[C.saKcVl])   : 0 },
          ],
          comprovante:   C.comprov >= 0 ? normBool(r[C.comprov]) : false,
          notaFiscal:    C.nfiscal >= 0 ? normBool(r[C.nfiscal]) : false,
          pedidoMedico:  C.pedido  >= 0 ? normBool(r[C.pedido])  : false,
          selectedFolder: null,
          selectedFile:   null,
        };
      });

    // Marca duplicatas — mesma data + descrição + valor já existente
    for (const exp of _parsed) {
      exp.duplicate = despesas.some(d =>
        d.data === exp.date &&
        d.valor === exp.valor &&
        d.desc  === exp.desc
      );
    }

    // Re-aplica match se a pasta já foi carregada antes
    if (_folders.size || _files.size) applyAutoMatch();

    statusEl.textContent = '';
    renderPreview();
  } catch (e) {
    statusEl.textContent = `Erro: ${e.message}`;
    _parsed = [];
    renderPreview();
  }
}

// ── Leitura da pasta de comprovantes ─────────────────────────────────────────
export function onFolderChange(fileList) {
  _folders.clear();
  _files.clear();

  for (const f of fileList) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    if (parts.length >= 2) {
      // Pasta imediatamente pai do arquivo (funciona para raiz/pasta/arq e pasta/arq)
      const folder = parts[parts.length - 2];
      if (!_folders.has(folder)) _folders.set(folder, []);
      _folders.get(folder).push(f);
    } else {
      // Arquivo solto sem pasta
      _files.set(f.name, f);
    }
  }

  applyAutoMatch();
  renderPreview();
}

function applyAutoMatch() {
  for (const exp of _parsed) {
    const folder = findBestMatch(exp.date, _folders);
    if (folder) {
      exp.selectedFolder = folder;
      exp.selectedFile   = null;
    } else {
      exp.selectedFolder = null;
      exp.selectedFile   = findBestMatch(exp.date, _files);
    }
  }
}

// ── Preview da tabela ─────────────────────────────────────────────────────────
function renderPreview() {
  const el         = document.getElementById('import-preview');
  const confirmBtn = document.getElementById('btn-confirm-import');

  if (!_parsed.length) {
    el.innerHTML = '';
    confirmBtn.disabled = true;
    return;
  }

  const brl      = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hasItems = _folders.size > 0 || _files.size > 0;

  const buildOptions = (exp) => {
    const curVal = exp.selectedFolder ? `folder:${exp.selectedFolder}`
                 : exp.selectedFile   ? `file:${exp.selectedFile}` : '';
    let opts = `<option value="">— nenhum —</option>`;
    if (_folders.size) {
      opts += `<optgroup label="Pastas">`;
      for (const [name, files] of _folders) {
        const v = `folder:${name}`;
        opts += `<option value="${escH(v)}" ${curVal === v ? 'selected' : ''}>
          📁 ${escH(name)} (${files.length} arquivo${files.length !== 1 ? 's' : ''})
        </option>`;
      }
      opts += `</optgroup>`;
    }
    if (_files.size) {
      opts += `<optgroup label="Arquivos avulsos">`;
      for (const name of _files.keys()) {
        const v = `file:${name}`;
        opts += `<option value="${escH(v)}" ${curVal === v ? 'selected' : ''}>${escH(name)}</option>`;
      }
      opts += `</optgroup>`;
    }
    return opts;
  };

  const newCount = _parsed.filter(e => !e.duplicate).length;
  const dupCount = _parsed.length - newCount;

  el.innerHTML = `
    <div class="import-summary" id="import-summary-line"></div>
    <div class="import-table-wrap">
      <table class="import-table">
        <thead><tr>
          <th>Data</th><th>Descrição</th><th>Pagador</th>
          <th style="text-align:right">Valor</th>
          <th style="text-align:right">Reemb.</th>
          <th>Comprovante</th>
        </tr></thead>
        <tbody>
          ${_parsed.map((exp, idx) => {
            const matched = !!(exp.selectedFolder || exp.selectedFile);
            const cls = hasItems ? (matched ? 'import-select-ok' : 'import-select-miss') : '';
            return `<tr style="${exp.duplicate ? 'opacity:.4' : ''}">
              <td style="white-space:nowrap;font-weight:500">${exp.rawDate}</td>
              <td>
                ${escH(exp.desc)}
                ${exp.duplicate ? `<span class="badge" style="font-size:10px;background:var(--border);color:var(--muted);margin-left:4px">Já importado</span>` : ''}
              </td>
              <td><span class="badge ${exp.pagador === 'titular' ? 'b-tit' : 'b-conj'}" style="font-size:10.5px">${exp.pagador}</span></td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${brl(exp.valor)}</td>
              <td style="text-align:right;font-variant-numeric:tabular-nums">${exp.reembolso > 0 ? brl(exp.reembolso) : '—'}</td>
              <td>${exp.duplicate ? '—' : hasItems
                ? `<select class="import-file-select ${cls}" data-idx="${idx}"
                     onchange="window._importSetFile(${idx}, this.value)">
                     ${buildOptions(exp)}
                   </select>`
                : `<span style="color:var(--muted);font-size:12px">carregue a pasta →</span>`
              }</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  confirmBtn.disabled = newCount === 0;
  updateSummaryLine();
}

// ── Confirma e cria as despesas ───────────────────────────────────────────────
export async function confirmImport() {
  if (!_parsed.length) { toast('Nenhuma despesa para importar'); return; }
  const btn = document.getElementById('btn-confirm-import');
  btn.disabled = true;

  const toImport = _parsed.filter(e => !e.duplicate);
  if (!toImport.length) {
    toast('Todas as despesas já foram importadas anteriormente');
    btn.disabled = false;
    return;
  }

  try {
    for (let i = 0; i < toImport.length; i++) {
      btn.textContent = `Importando ${i + 1}/${toImport.length}…`;
      const exp   = toImport[i];
      const aids  = [];
      const filesToUpload = exp.selectedFolder
        ? (_folders.get(exp.selectedFolder) || [])
        : exp.selectedFile
          ? [_files.get(exp.selectedFile)].filter(Boolean)
          : [];

      for (const file of filesToUpload) {
        const dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload  = e => res(e.target.result);
          reader.onerror = () => rej(new Error(`Falha ao ler ${file.name}`));
          reader.readAsDataURL(file);
        });
        const fid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await dbPut({
          id: fid, name: file.name, type: file.type,
          folder: exp.selectedFolder || null,
          size: file.size, dataUrl, createdAt: new Date().toISOString(),
        });
        aids.push(fid);
      }

      addDespesa({
        id:            Date.now() + i * 100,
        desc:          exp.desc,
        categoria:     'saude',
        beneficiario:  'filho',
        pagador:       exp.pagador,
        valor:         exp.valor,
        reembolso:     exp.reembolso,
        reembolsos:    exp.reembolsos || [],
        comprovante:   exp.comprovante  || false,
        notaFiscal:    exp.notaFiscal   || false,
        pedidoMedico:  exp.pedidoMedico || false,
        data:          exp.date,
        obs:           '',
        attachmentIds: aids,
      });
    }

    const n    = toImport.length;
    const nAnx = toImport.reduce((s, e) => {
      if (e.selectedFolder) return s + (_folders.get(e.selectedFolder) || []).length;
      if (e.selectedFile)   return s + 1;
      return s;
    }, 0);
    if (_syncUrl) {
      localStorage.setItem('ir_sync', JSON.stringify({ url: _syncUrl, at: new Date().toISOString(), count: n }));
    }
    closeImportOverlay();
    renderAll();
    toast(`${n} despesa${n !== 1 ? 's' : ''} importada${n !== 1 ? 's' : ''} · ${nAnx} anexo${nAnx !== 1 ? 's' : ''} vinculado${nAnx !== 1 ? 's' : ''}`);
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = 'Importar despesas';
    toast(`Erro ao importar: ${e.message}`);
  }
}

// ── Sincroniza com planilha: conta novos + atualiza existentes ────────────────
// Retorna { newCount, total, updated, error }
export async function syncSheet() {
  const raw = localStorage.getItem('ir_sync');
  if (!raw) return { error: 'Nenhuma sincronização registrada' };
  let sync;
  try { sync = JSON.parse(raw); } catch { return { error: 'Dados inválidos' }; }
  if (!sync.url) return { error: 'URL não encontrada' };

  const match = sync.url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return { error: 'URL inválida' };
  const sheetId  = match[1];
  const gidMatch = sync.url.match(/[#&?]gid=(\d+)/);
  const gid      = gidMatch?.[1] ?? '0';
  const csvUrl   = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  try {
    const resp = await fetch(csvUrl, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();

    const XLSX = await loadXLSX();
    const wb   = XLSX.read(text, { type: 'string' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (rows.length < 2) return { newCount: 0, total: 0, updated: 0 };

    const normalize = h => (h == null ? '' : String(h)).replace(/^﻿/, '').trim().toUpperCase();
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const r = rows[i].map(normalize);
      if (r.some(h => h === 'DATA') && r.some(h => h.includes('VALOR'))) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return { error: 'Cabeçalho não encontrado' };

    const hdrs = rows[headerIdx].map(normalize);
    const col  = (...terms) => hdrs.findIndex(h => terms.some(t => h.includes(t)));
    const nextValor = (stIdx) =>
      (stIdx >= 0 && (hdrs[stIdx + 1] || '').includes('VALOR')) ? stIdx + 1 : -1;

    // Prefere a coluna DATA MM/DD ou DATA MM/DD/YYYY (correlação com diretórios MM.DD) se existir
    const dataMmDdIdx = hdrs.findIndex(h => /DATA\s*MM\/DD(?:\/YYYY)?/i.test(h));
    const C = {
      data:     dataMmDdIdx >= 0 ? dataMmDdIdx : col('DATA'),
      medico:   col('MÉDICO', 'MEDICO'),
      espec:    col('ESPECIALIDADE'),
      valor:    col('VALOR TOT', 'VALOR TOTAL'),
      pagoPor:  col('PAGO PO', 'PAGO POR'),
      naoR:     col('NÃO REEM', 'NAO REEM', 'NÃO REEMB', 'NAO REEMB', 'NÃO REEMBOLSADO', 'NAO REEMBOLSADO'),
      bradSt:   col('BRADESCO', 'BRADESC'),
      saPartSt: col('SULAMERICA PA', 'SUL AMERICA PA', 'SULAM. PART', 'SULAMERICA PART', 'SA PART', 'SA_PART'),
      saKcSt:   col('SULAMERICA KC', 'SUL AMERICA KC', 'SULAM. KC', 'SA KC', 'SA_KC'),
      comprov:  col('COMPROVANTE', 'COMPROVA', 'COMPROV'),
      nfiscal:  col('NOTA FISCAL', 'NOTA FIS', 'N. FISCAL'),
      pedido:   col('PEDIDO MED', 'PEDIDO MÉD', 'PED. MED', 'PEDIDO MÉDICO', 'PEDIDO MEDICO'),
    };
    C.bradVl   = nextValor(C.bradSt)   >= 0 ? nextValor(C.bradSt)   : col('VL BRAD',    'VALOR BRAD',    'BRADESCO VL');
    C.saPartVl = nextValor(C.saPartSt) >= 0 ? nextValor(C.saPartSt) : col('VL SA PART', 'VALOR SA PART', 'SULAM PART VL');
    C.saKcVl   = nextValor(C.saKcSt)  >= 0 ? nextValor(C.saKcSt)   : col('VL SA KC',   'VALOR SA KC',   'SULAM KC VL');
    if (C.naoR < 0) C.naoR = hdrs.length - 1;

    const normRb = v => {
      const s = (v ?? '').toString().trim().toLowerCase();
      if (s === 'solicitar' || s === 'a solicitar') return 'solicitar';
      if (s === 'solicitado' || s === 'aguardando' || s === 'enviado') return 'solicitado';
      if (s === 'concluido' || s === 'concluído' || s === 'ok' || s === 'sim') return 'concluido';
      return 'na';
    };

    const dateFmt = dataMmDdIdx >= 0 ? 'MM/DD'
      : detectDateFmt(rows.slice(headerIdx + 1).map(r => r[C.data]));

    let newCount = 0, updated = 0;
    const dataRows = rows.slice(headerIdx + 1).filter(r => {
      const pago  = r[C.pagoPor]?.toString().trim();
      const valor = parseBRL(r[C.valor]);
      return r[C.data] && (valor > 0 || pago === 'Retorno');
    });

    for (const row of dataRows) {
      const date   = parseDate(row[C.data], dateFmt);
      const medico = row[C.medico]?.toString().trim() || '';
      const espec  = row[C.espec]?.toString().trim()  || '';
      const desc   = C.desc >= 0 ? row[C.desc]?.toString().trim() || '' : medico + (espec ? ` – ${espec}` : '');
      const valor  = parseBRL(row[C.valor]);

      const d = despesas.find(x => x.data === date && x.valor === valor && x.desc === desc);
      if (!d) {
        if (!date) continue; // data inválida, pula
        // Auto-adiciona linha nova da planilha
        const pago  = row[C.pagoPor]?.toString().trim();
        const naoR  = parseBRL(row[C.naoR]);
        const maxId = despesas.reduce((m, x) => Math.max(m, x.id || 0), 0);
        despesas.push({
          id:            maxId + 1 + newCount,
          desc,
          categoria:     'saude',
          beneficiario:  'filho',
          pagador:       pago === 'Ale' ? 'titular' : pago === 'Dani' ? 'conjuge' : 'titular',
          valor,
          reembolso:     Math.max(0, valor - naoR),
          reembolsos: [
            { plano: 'bradesco', status: C.bradSt   >= 0 ? normRb(row[C.bradSt])   : 'na', valor: C.bradVl   >= 0 ? parseBRL(row[C.bradVl])   : 0 },
            { plano: 'sa_part',  status: C.saPartSt >= 0 ? normRb(row[C.saPartSt]) : 'na', valor: C.saPartVl >= 0 ? parseBRL(row[C.saPartVl]) : 0 },
            { plano: 'sa_kc',    status: C.saKcSt   >= 0 ? normRb(row[C.saKcSt])   : 'na', valor: C.saKcVl   >= 0 ? parseBRL(row[C.saKcVl])   : 0 },
          ],
          comprovante:   C.comprov >= 0 ? normBool(row[C.comprov]) : false,
          notaFiscal:    C.nfiscal >= 0 ? normBool(row[C.nfiscal]) : false,
          pedidoMedico:  C.pedido  >= 0 ? normBool(row[C.pedido])  : false,
          data:          date,
          obs:           '',
          attachmentIds: [],
        });
        newCount++;
        continue;
      }

      let changed = false;
      if (C.comprov  >= 0) { const v = normBool(row[C.comprov]);  if (d.comprovante  !== v) { d.comprovante  = v; changed = true; } }
      if (C.nfiscal  >= 0) { const v = normBool(row[C.nfiscal]);  if (d.notaFiscal   !== v) { d.notaFiscal   = v; changed = true; } }
      if (C.pedido   >= 0) { const v = normBool(row[C.pedido]);   if (d.pedidoMedico !== v) { d.pedidoMedico = v; changed = true; } }

      if (!d.reembolsos) d.reembolsos = [];
      for (const p of [
        { key: 'bradesco', stCol: C.bradSt,   vlCol: C.bradVl   },
        { key: 'sa_part',  stCol: C.saPartSt, vlCol: C.saPartVl },
        { key: 'sa_kc',    stCol: C.saKcSt,   vlCol: C.saKcVl   },
      ]) {
        if (p.stCol < 0 && p.vlCol < 0) continue;
        let r = d.reembolsos.find(x => x.plano === p.key);
        if (!r) { r = { plano: p.key, status: 'na', valor: 0 }; d.reembolsos.push(r); }
        if (p.stCol >= 0) { const st = normRb(row[p.stCol]); if (r.status !== st) { r.status = st; changed = true; } }
        if (p.vlCol >= 0) { const vl = parseBRL(row[p.vlCol]); if (r.valor  !== vl) { r.valor  = vl; changed = true; } }
      }

      if (changed) updated++;
    }

    if (updated > 0 || newCount > 0) saveDespesasToStorage();
    return { newCount, total: dataRows.length, updated };
  } catch (e) {
    return { error: e instanceof TypeError ? 'Bloqueio CORS — verifique o compartilhamento da planilha' : e.message };
  }
}
