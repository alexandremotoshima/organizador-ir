// ── Aba Documentos e Lightbox ─────────────────────────────────────────────────
import { dbGet, dbAll, dbDel, dbPut } from './db.js';
import { despesas, saveDespesasToStorage } from './state.js';
import { brl, fmtDate, fmtSize, escH, catLabel, pagLabel, benLabel, catBadgeCls, pagBadgeCls, benBadgeCls, isImg, isPdf, fileIcon } from './helpers.js';

let lbFile     = null;
let docsSelMode = false;
let docsSelected = new Map(); // fid → did
let _lastItems   = [];

export function toggleDocsSelMode() {
  docsSelMode = !docsSelMode;
  if (!docsSelMode) docsSelected.clear();
  renderDocs();
}

export function toggleDocsSelectAll() {
  const allSelected = _lastItems.length > 0 && _lastItems.every(({ f }) => docsSelected.has(f.id));
  if (allSelected) _lastItems.forEach(({ f })    => docsSelected.delete(f.id));
  else             _lastItems.forEach(({ f, d }) => docsSelected.set(f.id, d.id));
  renderDocs();
}

export async function deleteSelectedDocs() {
  if (!docsSelected.size) return;
  const { showModal, closeModal, toast } = await import('./modal.js');
  const entries = [...docsSelected.entries()];
  const n = entries.length;
  showModal(
    `Excluir ${n} documento${n !== 1 ? 's' : ''}?`,
    'Os arquivos serão removidos permanentemente.',
    [
      { label: 'Cancelar', cls: 'btn', cb: closeModal },
      { label: 'Excluir',  cls: 'btn btn-danger', cb: async () => {
        for (const [fid, did] of entries) {
          await dbDel(fid);
          const d = despesas.find(x => x.id === did);
          if (d) d.attachmentIds = (d.attachmentIds || []).filter(id => id !== fid);
        }
        saveDespesasToStorage();
        docsSelected.clear();
        docsSelMode = false;
        closeModal();
        toast(`${n} documento${n !== 1 ? 's' : ''} excluído${n !== 1 ? 's' : ''}`);
        renderDocs();
      }},
    ]
  );
}

window._toggleDocSel = function(fid, did) {
  if (docsSelected.has(fid)) docsSelected.delete(fid);
  else docsSelected.set(fid, did);
  document.querySelectorAll(`[data-docfid="${fid}"]`).forEach(el =>
    el.classList.toggle('doc-selected', docsSelected.has(fid))
  );
  document.querySelectorAll(`[data-doccb="${fid}"]`).forEach(cb =>
    (cb.checked = docsSelected.has(fid))
  );
  _updateSelBtns();
};

function _updateSelBtns() {
  const selBtn = document.getElementById('btn-docs-sel-mode');
  const allBtn = document.getElementById('btn-docs-sel-all');
  const delBtn = document.getElementById('btn-docs-del-sel');
  if (selBtn) selBtn.textContent = docsSelMode ? 'Cancelar' : 'Selecionar';
  if (allBtn) {
    allBtn.classList.toggle('hidden', !docsSelMode);
    const allSel = _lastItems.length > 0 && _lastItems.every(({ f }) => docsSelected.has(f.id));
    allBtn.textContent = allSel ? 'Nenhum' : 'Todos';
  }
  if (delBtn) {
    delBtn.classList.toggle('hidden', !docsSelMode);
    delBtn.textContent = `Excluir (${docsSelected.size})`;
    delBtn.disabled = docsSelected.size === 0;
  }
}

// ── Render da aba Documentos ──────────────────────────────────────────────────
export async function renderDocs() {
  const fC   = document.getElementById('df-cat').value;
  const fP   = document.getElementById('df-pag').value;
  const view = document.getElementById('df-view').value;
  const el   = document.getElementById('docs-content');

  el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:1rem 0">Carregando…</div>';

  const allFiles = await dbAll();
  const fileMap  = {};
  allFiles.forEach(f => { fileMap[f.id] = f; });

  const items = [];
  for (const d of despesas) {
    if (fC && d.categoria !== fC) continue;
    if (fP && d.pagador   !== fP) continue;
    for (const aid of (d.attachmentIds || [])) {
      const f = fileMap[aid];
      if (f) items.push({ f, d });
    }
  }

  _lastItems = items;
  document.getElementById('docs-summary').textContent =
    `${items.length} documento${items.length !== 1 ? 's' : ''}`;
  _updateSelBtns();

  if (!items.length) {
    el.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>Nenhum documento. Adicione anexos ao criar ou editar uma despesa.</div>`;
    return;
  }

  // ── Agrupamento ──────────────────────────────────────────────────────────
  const groupBy = document.getElementById('df-group')?.value || 'categoria';
  const groups  = new Map();

  for (const item of items) {
    let key, label;
    if (groupBy === 'consulta') {
      key   = String(item.d.id);
      label = `__consulta__`;
    } else if (groupBy === 'pasta') {
      key   = item.f.folder || '__sem_pasta__';
      label = `__pasta__`;
    } else {
      key   = `${item.d.categoria}|${item.d.pagador}`;
      label = `__categoria__`;
    }
    if (!groups.has(key)) groups.set(key, { key, label, item0: item, items: [] });
    groups.get(key).items.push(item);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    if (groupBy === 'consulta') return (b.item0.d.data || '').localeCompare(a.item0.d.data || '');
    return a.key.localeCompare(b.key, 'pt-BR');
  });

  let html = '';
  for (const g of sortedGroups) {
    let titleHtml;
    if (groupBy === 'consulta') {
      const d  = g.item0.d;
      const cc = catBadgeCls(d.categoria);
      const pc = pagBadgeCls(d.pagador);
      titleHtml = `<span class="badge ${cc}">${catLabel(d.categoria)}</span>
        <span class="badge ${pc}">${pagLabel(d.pagador)}</span>
        <strong style="font-size:13px">${escH(d.desc)}</strong>
        <span style="font-size:11px;color:var(--muted)">${fmtDate(d.data)}</span>`;
    } else if (groupBy === 'pasta') {
      const nome = g.key === '__sem_pasta__' ? 'Sem pasta' : g.key;
      titleHtml = `<span style="font-size:14px">📁</span> <strong style="font-size:13px">${escH(nome)}</strong>`;
    } else {
      const cc = catBadgeCls(g.item0.d.categoria);
      const pc = pagBadgeCls(g.item0.d.pagador);
      titleHtml = `<span class="badge ${cc}">${catLabel(g.item0.d.categoria)}</span>
        <span class="badge ${pc}">${pagLabel(g.item0.d.pagador)}</span>`;
    }

    html += `<div class="group-title">
      ${titleHtml}
      <span style="font-size:11px;font-weight:400;margin-left:4px">${g.items.length} doc${g.items.length !== 1 ? 's' : ''}</span>
    </div>`;

    if (view === 'grid') {
      html += `<div class="docs-grid">`;
      for (const { f, d } of g.items) {
        const bc    = benBadgeCls(d.beneficiario);
        const thumb = isImg(f.type)
          ? `<img src="${f.dataUrl}" style="width:100%;height:100%;object-fit:cover">`
          : `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
              ${fileIcon(f.type, 36)}
              ${isPdf(f.type) ? '<span style="font-size:10px;color:var(--red);font-weight:600">PDF</span>' : ''}
            </div>`;
        const isSel = docsSelected.has(f.id);
        html += `<div class="doc-card${isSel ? ' doc-selected' : ''}" data-docfid="${f.id}"
            onclick="${docsSelMode ? `window._toggleDocSel('${f.id}',${d.id})` : `window._openLightbox('${f.id}')`}">
          ${docsSelMode ? `<label class="docs-sel-check" onclick="event.stopPropagation()">
            <input type="checkbox" data-doccb="${f.id}" ${isSel ? 'checked' : ''}
              onchange="window._toggleDocSel('${f.id}',${d.id})">
          </label>` : ''}
          <div class="doc-thumb">${thumb}</div>
          <div class="doc-info">
            <div class="doc-filename" title="${escH(f.name)}">${escH(f.name)}</div>
            <div class="doc-expense">${escH(d.desc)}</div>
            <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
              <span class="badge ${bc}" style="font-size:10px">${benLabel(d.beneficiario)}</span>
              <span style="font-size:10px;color:var(--muted)">${fmtDate(d.data)}</span>
            </div>
          </div>
          ${!docsSelMode ? `<button class="doc-del-btn" title="Excluir"
            onclick="event.stopPropagation();window._delDoc('${f.id}',${d.id})">✕</button>` : ''}
        </div>`;
      }
      html += `</div>`;
    } else {
      // Vista de lista
      html += `<div class="card" style="margin-bottom:.5rem;padding:.75rem 1rem">`;
      for (const { f, d } of g.items) {
        const bc  = benBadgeCls(d.beneficiario);
        const ico = isImg(f.type)
          ? `<img src="${f.dataUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">`
          : `<div style="width:36px;height:36px;background:${isPdf(f.type) ? 'var(--red-l)' : 'var(--bg)'};border-radius:4px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">${fileIcon(f.type, 18)}</div>`;
        const isSel2 = docsSelected.has(f.id);
        html += `<div class="expense-item${isSel2 ? ' selected' : ''}" data-docfid="${f.id}"
            style="cursor:pointer"
            onclick="${docsSelMode ? `window._toggleDocSel('${f.id}',${d.id})` : `window._openLightbox('${f.id}')`}">
          ${docsSelMode ? `<label class="expense-check" onclick="event.stopPropagation()">
            <input type="checkbox" data-doccb="${f.id}" ${isSel2 ? 'checked' : ''}
              onchange="window._toggleDocSel('${f.id}',${d.id})">
          </label>` : ''}
          <div style="flex-shrink:0">${ico}</div>
          <div class="expense-body">
            <div style="font-size:13px;font-weight:500">${escH(f.name)}</div>
            <div style="font-size:11.5px;color:var(--muted)">${escH(d.desc)}</div>
            <div class="expense-badges">
              <span class="badge ${bc}" style="font-size:10px">${benLabel(d.beneficiario)}</span>
            </div>
          </div>
          <div class="expense-amount" style="font-size:12px;color:var(--muted)">
            ${fmtDate(d.data)}<br>${fmtSize(f.size)}<br>
            ${!docsSelMode ? `
            <button class="btn btn-sm mt-1" onclick="event.stopPropagation();window._dlFile('${f.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>Baixar
            </button>
            <button class="btn btn-sm btn-danger mt-1" onclick="event.stopPropagation();window._delDoc('${f.id}',${d.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>` : ''}
          </div>
        </div>`;
      }
      html += `</div>`;
    }
  }
  el.innerHTML = html;
}

// ── Exclusão de documento ─────────────────────────────────────────────────────
window._delDoc = async function(fid, did) {
  const { showModal, closeModal, toast } = await import('./modal.js');
  showModal(
    'Excluir documento?',
    'O arquivo será removido permanentemente e desvinculado da consulta.',
    [
      { label: 'Cancelar', cls: 'btn', cb: closeModal },
      { label: 'Excluir',  cls: 'btn btn-danger', cb: async () => {
        await dbDel(fid);
        const d = despesas.find(x => x.id === did);
        if (d) {
          d.attachmentIds = (d.attachmentIds || []).filter(id => id !== fid);
          saveDespesasToStorage();
        }
        closeModal();
        toast('Documento excluído');
        renderDocs();
      }},
    ]
  );
};

// ── Expand de anexos inline na lista de despesas ──────────────────────────────
export async function toggleAttach(eid, did) {
  const el = document.getElementById(eid);
  if (el.classList.contains('open')) { el.classList.remove('open'); return; }
  el.classList.add('open');
  el.innerHTML = '<span style="font-size:12px;color:var(--muted)">Carregando…</span>';

  const d    = despesas.find(x => x.id === did);
  const aids = d?.attachmentIds || [];
  if (!aids.length) { el.innerHTML = ''; return; }

  const files = await Promise.all(aids.map(id => dbGet(id)));
  el.innerHTML = `<div class="attach-list">
    ${files.filter(Boolean).map(f => `
      <div class="attach-chip" onclick="window._openLightbox('${f.id}')">
        ${isImg(f.type)
          ? `<img src="${f.dataUrl}" style="width:20px;height:20px;object-fit:cover;border-radius:2px;flex-shrink:0">`
          : `<span style="flex-shrink:0">${fileIcon(f.type, 14)}</span>`}
        <span title="${escH(f.name)}">${escH(f.name)}</span>
        <span style="color:var(--muted);font-size:10px;flex-shrink:0">${fmtSize(f.size)}</span>
      </div>`).join('')}
  </div>`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
export async function openLightbox(fid) {
  const f = await dbGet(fid);
  if (!f) return;
  lbFile = f;

  document.getElementById('lb-title').textContent = f.name;
  const body = document.getElementById('lb-body');

  if (isImg(f.type)) {
    body.innerHTML = `<img src="${f.dataUrl}" alt="${escH(f.name)}">`;
  } else if (isPdf(f.type)) {
    body.innerHTML = `<iframe src="${f.dataUrl}" style="width:100%;height:70vh;border:none;border-radius:4px"></iframe>`;
  } else {
    body.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted)">
      ${fileIcon(f.type, 48)}
      <p style="margin-top:12px">${escH(f.name)}</p>
      <p style="font-size:13px">${fmtSize(f.size)}</p>
    </div>`;
  }
  document.getElementById('lightbox').classList.remove('hidden');
}

export function closeLightbox(e) {
  if (!e || e.target === document.getElementById('lightbox')) {
    document.getElementById('lightbox').classList.add('hidden');
  }
}

export function dlCurrentLightbox() {
  if (lbFile) dlDataUrl(lbFile.dataUrl, lbFile.name);
}

export async function dlFile(id) {
  const f = await dbGet(id);
  if (f) dlDataUrl(f.dataUrl, f.name);
}

function dlDataUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

// ── Importação só de documentos ───────────────────────────────────────────────
let _idocs = []; // [{file, despesaId}]

function _folderOf(file) {
  const parts = (file.webkitRelativePath || '').split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : null;
}

function _autoMatchDoc(file) {
  // Tenta pelo nome da pasta primeiro (ex: "01.16 - Dra Danielle"), depois pelo nome do arquivo
  const candidate = _folderOf(file) || file.name;
  const m = candidate.match(/(\d{2})\.(\d{2})/);
  if (!m) return null;
  const [, a, b] = m;
  const found = despesas.find(d => {
    if (!d.data) return false;
    const [, mm, dd] = d.data.split('-');
    return (a === mm && b === dd) || (a === dd && b === mm);
  });
  return found?.id ?? null;
}

function _renderIdocsPreview() {
  const el  = document.getElementById('idocs-preview');
  const btn = document.getElementById('btn-confirm-idocs');
  if (!_idocs.length) { el.innerHTML = ''; if (btn) btn.disabled = true; return; }

  const sorted = despesas.slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const expOpts = sorted.map(d =>
    `<option value="${d.id}">${fmtDate(d.data)} – ${escH(d.desc)}</option>`
  ).join('');

  const hasFolders = _idocs.some(i => i.folder);
  const newCount = _idocs.filter(i => !i.duplicate).length;
  const dupCount = _idocs.length - newCount;

  el.innerHTML = `
    <div class="import-summary" style="margin-bottom:10px">
      <strong style="color:var(--teal)">${newCount}</strong> novo${newCount !== 1 ? 's' : ''} para importar
      ${dupCount > 0 ? ` · <span style="color:var(--muted)">${dupCount} já importado${dupCount !== 1 ? 's' : ''} (serão ignorados)</span>` : ''}
    </div>
    <div class="import-table-wrap"><table class="import-table">
    <thead><tr>
      ${hasFolders ? '<th>Pasta</th>' : ''}
      <th>Arquivo</th><th>Tamanho</th><th>Vincular à consulta</th><th></th>
    </tr></thead>
    <tbody>
      ${_idocs.map((item, idx) => `<tr style="${item.duplicate ? 'opacity:.45' : ''}">
        ${hasFolders ? `<td style="font-size:12px;color:var(--muted);white-space:nowrap">
          ${item.folder ? `📁 ${escH(item.folder)}` : '—'}
        </td>` : ''}
        <td style="font-size:13px">
          ${escH(item.file.name)}
          ${item.duplicate ? `<span class="badge" style="font-size:10px;background:var(--border);color:var(--muted);margin-left:4px">Já importado</span>` : ''}
        </td>
        <td style="font-size:12px;color:var(--muted);white-space:nowrap">${fmtSize(item.file.size)}</td>
        <td>${item.duplicate ? '<span style="font-size:12px;color:var(--muted)">—</span>' :
          `<select class="import-file-select ${item.despesaId ? 'import-select-ok' : 'import-select-miss'}"
              data-docimp="${idx}" onchange="window._idocSetExp(${idx},this.value)">
            <option value="">— sem vínculo —</option>
            ${sorted.map(d =>
              `<option value="${d.id}" ${item.despesaId === d.id ? 'selected' : ''}>${fmtDate(d.data)} – ${escH(d.desc)}</option>`
            ).join('')}
          </select>`}
        </td>
        <td>${!item.duplicate ? `<button class="btn btn-sm btn-danger" onclick="window._idocRemove(${idx})" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>` : ''}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
  if (btn) btn.disabled = newCount === 0;
}

window._idocRemove = function(idx) {
  _idocs.splice(idx, 1);
  _renderIdocsPreview();
};

window._idocSetExp = function(idx, val) {
  if (_idocs[idx]) _idocs[idx].despesaId = val ? Number(val) : null;
  const sel = document.querySelector(`select[data-docimp="${idx}"]`);
  if (sel) sel.className = `import-file-select ${val ? 'import-select-ok' : 'import-select-miss'}`;
};

export function openImportDocsOverlay() {
  document.getElementById('import-docs-overlay').classList.remove('hidden');
}

export function closeImportDocsOverlay() {
  _idocs = [];
  ['idocs-files-input', 'idocs-folder-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('idocs-preview').innerHTML = '';
  const btn = document.getElementById('btn-confirm-idocs');
  if (btn) { btn.disabled = true; btn.textContent = 'Importar documentos'; }
  document.getElementById('import-docs-overlay').classList.add('hidden');
}

export async function onDocsFilesChange(fileList) {
  if (!fileList || fileList.length === 0) return;

  const el = document.getElementById('idocs-preview');
  if (el) el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:.5rem 0">Lendo arquivos…</div>';

  try {
    const allDbFiles = await dbAll();
    const dbNameById = {};
    allDbFiles.forEach(f => { dbNameById[f.id] = f.name; });

    _idocs = [...fileList]
      .filter(f => !f.name.startsWith('.') && f.size > 0)
      .map(file => {
        const folder    = _folderOf(file);
        const despesaId = _autoMatchDoc(file);
        let duplicate = false;
        if (despesaId != null) {
          const d = despesas.find(x => x.id === despesaId);
          duplicate = !!(d?.attachmentIds || []).some(id => dbNameById[id] === file.name);
        }
        return { file, folder, despesaId, duplicate };
      });

    if (_idocs.length === 0) {
      if (el) el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:.5rem 0">Nenhum arquivo válido encontrado.</div>';
      return;
    }
    _renderIdocsPreview();
  } catch (err) {
    const { toast } = await import('./modal.js');
    toast(`Erro ao ler arquivos: ${err.message}`);
    if (el) el.innerHTML = '';
  }
}

export async function confirmDocsImport() {
  const { toast } = await import('./modal.js');
  if (!_idocs.length) { toast('Nenhum arquivo selecionado'); return; }

  const toImport = _idocs.filter(i => !i.duplicate);
  if (!toImport.length) { toast('Todos os arquivos já foram importados anteriormente'); return; }

  const btn = document.getElementById('btn-confirm-idocs');
  btn.disabled = true;

  try {
    let linked = 0;
    for (let i = 0; i < toImport.length; i++) {
      const item = toImport[i];
      btn.textContent = `Importando… (${i + 1}/${toImport.length})`;

      const dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result);
        reader.onerror = () => rej(new Error(`Falha ao ler "${item.file.name}"`));
        reader.readAsDataURL(item.file);
      });

      const fid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await dbPut({
        id: fid, name: item.file.name, type: item.file.type || 'application/octet-stream',
        size: item.file.size, folder: item.folder || null, dataUrl,
        createdAt: new Date().toISOString(),
      });

      if (item.despesaId) {
        const d = despesas.find(x => x.id === item.despesaId);
        if (d) { (d.attachmentIds = d.attachmentIds || []).push(fid); linked++; }
      }
    }
    saveDespesasToStorage();

    const n = toImport.length;
    closeImportDocsOverlay();
    renderDocs();
    toast(`${n} arquivo${n !== 1 ? 's' : ''} importado${n !== 1 ? 's' : ''} · ${linked} vinculado${linked !== 1 ? 's' : ''}`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Importar documentos';
    toast(`Erro: ${err.message}`);
  }
}
