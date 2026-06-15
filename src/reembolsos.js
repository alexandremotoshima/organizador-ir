// ── Aba Reembolsos ────────────────────────────────────────────────────────────
import { despesas, cfg, saveDespesasToStorage } from './state.js';
import { brl, fmtDate, escH } from './helpers.js';
import { syncDespesaToSheet } from './sheet-write.js';

// ── Carta de reembolso complementar ──────────────────────────────────────────
const PLANO_NOMES = {
  bradesco: 'Bradesco Saúde',
  sa_kc:    'Sulamérica Saúde',
  sa_part:  'Sulamérica Saúde',
};

// Para cada plano, qual é o plano "destino" da carta complementar
const CARTA_DESTINO = {
  sa_kc:    'bradesco',
  sa_part:  'bradesco',
  bradesco: 'sa_kc',
};

export const PLANOS = [
  { key: 'bradesco', label: 'Bradesco',  sub: 'Ale',  badge: 'b-tit'  },
  { key: 'sa_part',  label: 'Sul. PART', sub: 'Dani', badge: 'b-conj' },
  { key: 'sa_kc',    label: 'Sul. KC',   sub: 'Dani', badge: 'b-conj' },
];

const STATUS = {
  solicitar:  { label: 'Solicitar',  cls: 'rb-solicitar'  },
  solicitado: { label: 'Solicitado', cls: 'rb-solicitado' },
  concluido:  { label: 'Concluído',  cls: 'rb-concluido'  },
  na:         { label: 'N/A',        cls: 'rb-na'         },
};

// ── Estado de ordenação ───────────────────────────────────────────────────────
let rbSortField = 'data';
let rbSortDir   = -1;   // -1 = desc, 1 = asc

const STATUS_ORDER = { solicitar: 0, solicitado: 1, na: 2, concluido: 3 };

window._rbSort = function(field) {
  if (rbSortField === field) rbSortDir *= -1;
  else { rbSortField = field; rbSortDir = -1; }
  renderReembolsos();
};

// Garante que a despesa tem o array reembolsos com todas as entradas dos planos
function ensureReembolsos(d) {
  if (!d.reembolsos) d.reembolsos = [];
  for (const p of PLANOS) {
    if (!d.reembolsos.find(r => r.plano === p.key)) {
      d.reembolsos.push({ plano: p.key, status: 'na', valor: 0 });
    }
  }
}

// ── Limpeza de dados: remove duplicatas com descrições inválidas ───────────────
export function cleanupDuplicates() {
  const INVALID_DESC = new Set(['Solicitar', 'Solicitado', 'Concluído', 'Concluido', 'N/A', 'NA']);
  
  // Agrupa despesas por (data + valor)
  const groups = new Map();
  for (const d of despesas) {
    const key = `${d.data}|${d.valor}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  
  // Para cada grupo com múltiplas despesas, remove as com descrição inválida
  const toRemove = [];
  for (const [key, items] of groups.entries()) {
    if (items.length <= 1) continue;
    
    // Separa válidas e inválidas
    const valid   = items.filter(d => !INVALID_DESC.has(d.desc?.trim()));
    const invalid = items.filter(d => INVALID_DESC.has(d.desc?.trim()));
    
    // Se houver válidas, remove as inválidas
    if (valid.length > 0 && invalid.length > 0) {
      toRemove.push(...invalid);
    } else if (valid.length === 0 && invalid.length > 1) {
      // Se todas são inválidas, mantém a primeira e remove o resto
      toRemove.push(...invalid.slice(1));
    }
  }
  
  // Remove as duplicatas
  for (const d of toRemove) {
    const idx = despesas.findIndex(x => x.id === d.id);
    if (idx >= 0) despesas.splice(idx, 1);
  }
  
  if (toRemove.length > 0) {
    console.log(`[Cleanup] Removidas ${toRemove.length} despesa(s) duplicada(s) com descrição inválida`);
    saveDespesasToStorage();
  }
  
  return toRemove.length;
}

export function renderReembolsos() {
  const fPlano  = document.getElementById('rb-filter-plano')?.value  || '';
  const fStatus = document.getElementById('rb-filter-status')?.value || '';

  despesas.forEach(ensureReembolsos);

  // ── Resumo por plano ──────────────────────────────────────────────────────
  const summaryEl = document.getElementById('rb-summary');
  if (summaryEl) {
    summaryEl.innerHTML = PLANOS.map(p => {
      const all       = despesas.flatMap(d => d.reembolsos || []).filter(r => r.plano === p.key);
      const solicit   = all.filter(r => r.status === 'solicitar');
      const vlTotal   = all.reduce((s, r) => s + (r.valor || 0), 0);
      return `<div class="metric">
        <div class="metric-label">
          ${p.label} <span class="badge ${p.badge}" style="font-size:10px;vertical-align:middle">${p.sub}</span>
        </div>
        <div class="metric-value" style="font-size:18px">
          ${solicit.length > 0
            ? `<span style="color:var(--amber)">${solicit.length} a solicitar</span>`
            : `<span style="color:var(--teal)">Em dia</span>`}
        </div>
        <div class="metric-sub">${vlTotal > 0 ? `${brl(vlTotal)} reembolsado` : 'Nenhum reembolso'}</div>
      </div>`;
    }).join('');
  }

  // ── Tabela ────────────────────────────────────────────────────────────────
  const filtered = despesas
    .filter(d => {
      if (!fPlano && !fStatus) return true;
      return (d.reembolsos || []).some(r =>
        (!fPlano  || r.plano  === fPlano) &&
        (!fStatus || r.status === fStatus)
      );
    })
    .sort((a, b) => {
      let va, vb;
      if (['bradesco', 'sa_part', 'sa_kc'].includes(rbSortField)) {
        const ra = (a.reembolsos || []).find(r => r.plano === rbSortField);
        const rb = (b.reembolsos || []).find(r => r.plano === rbSortField);
        va = STATUS_ORDER[ra?.status ?? 'na'] ?? 1;
        vb = STATUS_ORDER[rb?.status ?? 'na'] ?? 1;
      } else if (rbSortField === 'valor') {
        va = a.valor || 0; vb = b.valor || 0;
      } else if (rbSortField === 'desc') {
        return rbSortDir * (a.desc || '').localeCompare(b.desc || '', 'pt-BR');
      } else {
        return rbSortDir * ((b.data || '').localeCompare(a.data || '') * -1);
      }
      return rbSortDir * (va - vb);
    });

  // ── Cabeçalho com indicadores de ordenação ────────────────────────────────
  const theadRow = document.getElementById('rb-thead-row');
  if (theadRow) {
    const ind = (f) => rbSortField === f ? (rbSortDir === -1 ? ' ↓' : ' ↑') : '';
    const thCls = (f) => `class="rb-th-sort${rbSortField === f ? ' rb-th-active' : ''}"`;
    theadRow.innerHTML = `
      <th ${thCls('data')}    onclick="window._rbSort('data')">Data${ind('data')}</th>
      <th ${thCls('desc')}    onclick="window._rbSort('desc')">Descrição${ind('desc')}</th>
      <th ${thCls('valor')}   onclick="window._rbSort('valor')" style="text-align:right">Valor${ind('valor')}</th>
      <th style="text-align:center;font-size:11.5px" title="Comprovante de pagamento">Comprov.</th>
      <th style="text-align:center;font-size:11.5px" title="Nota fiscal">NF</th>
      <th style="text-align:center;font-size:11.5px" title="Pedido médico">Ped. Méd.</th>
      ${PLANOS.map(p => `<th ${thCls(p.key)} onclick="window._rbSort('${p.key}')">
        ${p.label} <span class="badge ${p.badge}" style="font-size:10px;vertical-align:middle">${p.sub}</span>${ind(p.key)}
      </th>`).join('')}`;
  }

  const tbody = document.getElementById('rb-table-body');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${6 + PLANOS.length}"
      style="text-align:center;color:var(--muted);padding:2rem">
      Nenhuma consulta encontrada</td></tr>`;
    return;
  }

  // ── Rodapé com totais ─────────────────────────────────────────────────────
  const tfoot = document.getElementById('rb-tfoot');
  if (tfoot) {
    const totalValor = filtered.reduce((s, d) => s + (d.valor || 0), 0);
    const nComp = filtered.filter(d => d.comprovante).length;
    const nNF   = filtered.filter(d => d.notaFiscal).length;
    const nPed  = filtered.filter(d => d.pedidoMedico).length;
    const n     = filtered.length;
    const planTotals = PLANOS.map(p => {
      const counts = { solicitar: 0, solicitado: 0, concluido: 0, na: 0 };
      let vlTotal = 0;
      filtered.forEach(d => {
        const r = (d.reembolsos || []).find(x => x.plano === p.key);
        counts[r?.status || 'na']++;
        vlTotal += r?.valor || 0;
      });
      const parts = [];
      if (counts.solicitar  > 0) parts.push(`<span style="color:var(--amber)">${counts.solicitar} solicitar</span>`);
      if (counts.solicitado > 0) parts.push(`<span style="color:var(--blue,#3b82f6)">${counts.solicitado} solicitado</span>`);
      if (counts.concluido  > 0) parts.push(`<span style="color:var(--teal)">${counts.concluido} concluído</span>`);
      if (vlTotal > 0) parts.push(`<span style="color:var(--muted)">${brl(vlTotal)}</span>`);
      return `<td class="rb-cell" style="font-size:11px;text-align:center">${parts.join('<br>') || '—'}</td>`;
    }).join('');

    tfoot.innerHTML = `<tr style="background:var(--bg);font-weight:600;font-size:12px;border-top:2px solid var(--border)">
      <td style="padding:8px 10px;color:var(--muted)" colspan="2">${n} consulta${n !== 1 ? 's' : ''}</td>
      <td style="text-align:right;padding:8px 10px;font-variant-numeric:tabular-nums">${brl(totalValor)}</td>
      <td style="text-align:center;padding:8px 4px;font-size:11px" title="Comprovantes">${nComp}/${n}</td>
      <td style="text-align:center;padding:8px 4px;font-size:11px" title="Notas fiscais">${nNF}/${n}</td>
      <td style="text-align:center;padding:8px 4px;font-size:11px" title="Pedidos médicos">${nPed}/${n}</td>
      ${planTotals}
    </tr>`;
  }

  tbody.innerHTML = filtered.map(d => {
    const planCells = PLANOS.map(p => {
      const r   = (d.reembolsos || []).find(x => x.plano === p.key) || { status: 'na', valor: 0 };
      const cls = STATUS[r.status]?.cls || 'rb-na';
      const opts = Object.entries(STATUS).map(([k, v]) =>
        `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v.label}</option>`
      ).join('');
      const showCarta = CARTA_DESTINO[p.key] && r.status === 'concluido' && r.valor > 0;
      const destLabel = showCarta ? PLANO_NOMES[CARTA_DESTINO[p.key]] : '';
      return `<td class="rb-cell">
        <select class="rb-status-select ${cls}"
          onchange="window._rbSetStatus(${d.id},'${p.key}',this.value)">
          ${opts}
        </select>
        ${(r.status === 'concluido' || r.valor > 0)
          ? `<input type="number" class="rb-valor-input" value="${r.valor || ''}"
               step="0.01" min="0" placeholder="0,00"
               onchange="window._rbSetValor(${d.id},'${p.key}',this.value)">`
          : ''}
        ${showCarta
          ? `<button class="rb-carta-btn" title="Gerar carta de reembolso complementar para ${destLabel}"
               onclick="window._rbGerarCarta(${d.id},'${p.key}')">📄 Carta</button>`
          : ''}
      </td>`;
    }).join('');

    const docChk = (field, title) =>
      `<td class="rb-cell" style="text-align:center">
        <input type="checkbox" title="${title}" ${d[field] ? 'checked' : ''}
          onchange="window._rbSetDoc(${d.id},'${field}',this.checked)"
          style="width:15px;height:15px;cursor:pointer;accent-color:var(--teal)">
      </td>`;

    return `<tr>
      <td style="white-space:nowrap;font-size:12.5px;color:var(--muted)">${d.data ? fmtDate(d.data) : '—'}</td>
      <td style="font-size:13px">${escH(d.desc)}</td>
      <td style="text-align:right;font-size:12.5px;font-variant-numeric:tabular-nums">${brl(d.valor)}</td>
      ${docChk('comprovante',  'Comprovante de pagamento')}
      ${docChk('notaFiscal',   'Nota fiscal')}
      ${docChk('pedidoMedico', 'Pedido médico')}
      ${planCells}
    </tr>`;
  }).join('');
}

// ── Handlers globais (inline onclick) ────────────────────────────────────────
window._rbSetStatus = function(expId, plano, status) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  ensureReembolsos(d);
  const r = d.reembolsos.find(x => x.plano === plano);
  if (r) {
    r.status = status;
    if (status !== 'concluido') r.valor = 0;
  }
  saveDespesasToStorage();
  syncDespesaToSheet(d);
  renderReembolsos();
};

window._rbSetValor = function(expId, plano, valor) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  ensureReembolsos(d);
  const r = d.reembolsos.find(x => x.plano === plano);
  if (r) r.valor = parseFloat(String(valor).replace(',', '.')) || 0;
  saveDespesasToStorage();
  syncDespesaToSheet(d);
};

window._rbSetDoc = function(expId, field, checked) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  d[field] = checked;
  saveDespesasToStorage();
  syncDespesaToSheet(d);
};

window._rbGerarCarta = function(expId, planoReembolsante) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  const r = (d.reembolsos || []).find(x => x.plano === planoReembolsante);
  if (!r || !r.valor) return;

  const planoDestKey   = CARTA_DESTINO[planoReembolsante];
  const planoPagouNome = PLANO_NOMES[planoReembolsante];
  const planoDestNome  = PLANO_NOMES[planoDestKey];
  const dataHoje       = new Date().toLocaleDateString('pt-BR');
  const dataConsulta   = fmtDate(d.data);
  const valorTotal     = brl(d.valor);
  const valorReemb     = brl(r.valor);
  const beneficiario   = escH(cfg.filho === 'Filho/a' ? 'Lucas Naoki Motoshima' : cfg.filho);
  const titular        = escH(cfg.titular);
  const descricao      = escH(d.desc.charAt(0).toLowerCase() + d.desc.slice(1));

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Solicitação de Reembolso Complementar</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;max-width:720px;margin:60px auto;color:#222;line-height:1.85;font-size:14px}
    .date{text-align:right;color:#666;margin-bottom:1.8rem;font-size:13px}
    .addressee{margin-bottom:.4rem;font-weight:700}
    .subject{margin-bottom:2rem;font-weight:700}
    p{margin-bottom:1.2rem;text-align:justify}
    ul{margin:.4rem 0 1.2rem 2rem}
    li{margin-bottom:.4rem}
    .sig{margin-top:4rem}
    .btn{display:block;margin:2.5rem auto 0;padding:10px 28px;font-size:14px;background:#1a7a5e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:Arial,sans-serif}
    .btn:hover{background:#155f49}
    @media print{.btn{display:none}body{margin:30px}}
  </style>
</head>
<body>
  <p class="date">${dataHoje}</p>
  <p class="addressee">A/C: ${planoDestNome}</p>
  <p class="subject">Assunto: Solicitação de reembolso complementar – Coordenação de benefícios</p>

  <p>Solicito reembolso complementar referente à ${descricao} realizada pelo beneficiário <strong>${beneficiario}</strong>, em <strong>${dataConsulta}</strong>, no valor total de <strong>${valorTotal}</strong>.</p>

  <p>Informo que o atendimento foi inicialmente submetido ao plano <strong>${planoPagouNome}</strong>, que efetuou reembolso parcial no valor de <strong>${valorReemb}</strong>, conforme demonstrativo anexado.</p>

  <p>Dessa forma, solicito a análise do reembolso complementar referente ao valor remanescente não ressarcido, conforme regras de coordenação de benefícios entre operadoras.</p>

  <p><strong>Documentos anexos:</strong></p>
  <ul>
    <li>Nota fiscal/recibo</li>
    <li>Comprovante de pagamento</li>
    <li>Demonstrativo de reembolso do ${planoPagouNome}</li>
  </ul>

  <button class="btn" onclick="window.print()">Imprimir / Salvar como PDF</button>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Permita pop-ups para gerar a carta.'); return; }
  win.document.write(html);
  win.document.close();
};
