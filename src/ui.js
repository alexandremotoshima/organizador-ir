// ── Render das abas: Painel, Despesas, Resumo ─────────────────────────────────
import { despesas, cfg, limiteEduc, netDespesa, sumNet, sumValor, sumReembolso, removeDespesa } from './state.js';
import { brl, fmtDate, escH, initials, catLabel, pagLabel, benLabel, catBadgeCls, pagBadgeCls, benBadgeCls, isImg, isPdf, fmtSize } from './helpers.js';
import { toggleAttach } from './docs.js';

// ── Estado de seleção múltipla ────────────────────────────────────────────────
let selectionMode = false;
let selectedIds   = new Set();

export function toggleSelectionMode() {
  selectionMode = !selectionMode;
  if (!selectionMode) selectedIds.clear();
  renderDespesas();
}

export function toggleSelectAll() {
  const fC = document.getElementById('ff-cat').value;
  const fP = document.getElementById('ff-pag').value;
  const fB = document.getElementById('ff-ben').value;
  const visible = despesas.filter(
    d => (!fC || d.categoria === fC) && (!fP || d.pagador === fP) && (!fB || d.beneficiario === fB)
  );
  const allSelected = visible.every(d => selectedIds.has(d.id));
  visible.forEach(d => allSelected ? selectedIds.delete(d.id) : selectedIds.add(d.id));
  renderDespesas();
}

export function toggleItemSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);

  const item = document.querySelector(`.expense-item[data-id="${id}"]`);
  if (item) item.classList.toggle('selected', selectedIds.has(id));
  const cb = document.getElementById(`chk-${id}`);
  if (cb) cb.checked = selectedIds.has(id);

  const delBtn = document.getElementById('btn-delete-selected');
  if (delBtn) {
    delBtn.textContent = `Excluir (${selectedIds.size})`;
    delBtn.disabled = selectedIds.size === 0;
  }
}

export async function deleteSelected() {
  if (!selectedIds.size) return;
  const { showModal, closeModal, toast } = await import('./modal.js');
  const { dbDel } = await import('./db.js');
  const ids = [...selectedIds];
  const n   = ids.length;
  showModal(
    `Excluir ${n} despesa${n !== 1 ? 's' : ''}?`,
    'Esta ação não pode ser desfeita.',
    [
      { label: 'Cancelar', cls: 'btn', cb: closeModal },
      { label: 'Excluir',  cls: 'btn btn-danger', cb: async () => {
        for (const id of ids) {
          const d = despesas.find(x => x.id === id);
          if (d) for (const aid of (d.attachmentIds || [])) await dbDel(aid);
          removeDespesa(id);
        }
        selectedIds.clear();
        selectionMode = false;
        renderAll();
        closeModal();
        toast(`${n} despesa${n !== 1 ? 's' : ''} excluída${n !== 1 ? 's' : ''}`);
      }},
    ]
  );
}

// ── Utilitário de switch de tabs ──────────────────────────────────────────────
export function switchTab(id) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + id).classList.remove('hidden');
  document.querySelector(`[data-tab="${id}"]`).classList.add('active');
  document.querySelector('.main').classList.toggle('main--wide', id === 'reembolsos');

  if (id === 'dashboard')   renderDashboard();
  if (id === 'despesas')    renderDespesas();
  if (id === 'documentos')  import('./docs.js').then(m => m.renderDocs());
  if (id === 'resumo')      renderResumo();
  if (id === 'reembolsos')  import('./reembolsos.js').then(m => m.renderReembolsos());
  if (id === 'config')      renderStorageInfo();
}

export function renderAll() {
  renderDashboard();
  renderDespesas();
  renderResumo();
}

function _relTime(isoStr) {
  const ms  = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(ms / 60000);
  const h   = Math.floor(min / 60);
  const d   = Math.floor(h / 24);
  if (d >= 1) return `há ${d} dia${d !== 1 ? 's' : ''}`;
  if (h >= 1) return `há ${h} hora${h !== 1 ? 's' : ''}`;
  if (min >= 1) return `há ${min} min`;
  return 'agora mesmo';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function renderDashboard() {
  const total  = sumValor(despesas);
  const reembs = sumReembolso(despesas);
  const saudeD = sumNet(despesas.filter(d => d.categoria === 'saude'));
  const educN  = sumNet(despesas.filter(d => d.categoria === 'educacao'));
  const educD  = Math.min(educN, limiteEduc());
  const nDocs  = despesas.reduce((s, d) => s + (d.attachmentIds || []).length, 0);

  let syncCard = '';
  try {
    const syncRaw = localStorage.getItem('ir_sync');
    if (syncRaw) {
      const sync = JSON.parse(syncRaw);
      const relT = _relTime(sync.at);
      const cnt  = sync.count ?? 0;
      syncCard = `<div class="metric" id="sync-metric">
        <div class="metric-label">Planilha sincronizada</div>
        <div class="metric-value" style="font-size:17px" id="sync-status-val">${relT}</div>
        <div class="metric-sub" id="sync-status-sub">${cnt} consulta${cnt !== 1 ? 's' : ''} importada${cnt !== 1 ? 's' : ''}</div>
        <button class="btn btn-sm" style="margin-top:6px;font-size:11px;width:100%" onclick="window._syncSheet(this)">Sincronizar planilha</button>
      </div>`;
    }
  } catch { /* ignore */ }

  document.getElementById('metric-grid').innerHTML = `
    <div class="metric accent">
      <div class="metric-label">Total gasto</div>
      <div class="metric-value">${brl(total)}</div>
      <div class="metric-sub">${despesas.length} lançamentos · ${nDocs} anexo${nDocs !== 1 ? 's' : ''}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Reembolsos</div>
      <div class="metric-value">${brl(reembs)}</div>
      <div class="metric-sub">do plano de saúde</div>
    </div>
    <div class="metric">
      <div class="metric-label">Saúde dedutível</div>
      <div class="metric-value text-teal">${brl(saudeD)}</div>
      <div class="metric-sub">sem limite anual</div>
    </div>
    <div class="metric">
      <div class="metric-label">Educação dedutível</div>
      <div class="metric-value text-blue">${brl(educD)}</div>
      <div class="metric-sub">limite ${brl(limiteEduc())}/pessoa</div>
    </div>
    ${syncCard}`;

  const al = document.getElementById('dashboard-alert');
  if (educN > limiteEduc()) {
    al.className = 'alert alert-warn mb-2';
    al.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/></svg>
      <span>Educação: ${brl(educN)} vs. limite ${brl(limiteEduc())}. Excedente <strong>${brl(educN - limiteEduc())}</strong> não dedutível.</span>`;
  } else {
    al.className = 'hidden';
  }

  const ts = sumNet(despesas.filter(d => d.categoria === 'saude'    && d.pagador === 'titular'));
  const te = Math.min(sumNet(despesas.filter(d => d.categoria === 'educacao' && d.pagador === 'titular')), limiteEduc());
  const cs = sumNet(despesas.filter(d => d.categoria === 'saude'    && d.pagador === 'conjuge'));
  const ce = Math.min(sumNet(despesas.filter(d => d.categoria === 'educacao' && d.pagador === 'conjuge')), limiteEduc());

  document.getElementById('person-cards').innerHTML =
    personCard('av-tit', cfg.titular, ts, te) + personCard('av-conj', cfg.conjuge, cs, ce);
}

function personCard(avc, nome, s, e) {
  return `<div class="card">
    <div class="person-header">
      <div class="person-avatar ${avc}">${initials(nome)}</div>
      <div><div class="person-name">${escH(nome)}</div><div class="person-sub">Declarante</div></div>
    </div>
    <div class="total-row"><span class="label">Saúde</span><span>${brl(s)}</span></div>
    <div class="total-row"><span class="label">Educação</span><span>${brl(e)}</span></div>
    <div class="total-grand"><span>Total dedutível</span><span class="text-teal">${brl(s + e)}</span></div>
  </div>`;
}

// ── Despesas ──────────────────────────────────────────────────────────────────
export function renderDespesas() {
  const fC = document.getElementById('ff-cat').value;
  const fP = document.getElementById('ff-pag').value;
  const fB = document.getElementById('ff-ben').value;

  const fS = document.getElementById('ff-sort')?.value || 'data-desc';
  const list = despesas
    .filter(d => (!fC || d.categoria === fC) && (!fP || d.pagador === fP) && (!fB || d.beneficiario === fB))
    .sort((a, b) => {
      switch (fS) {
        case 'data-asc':       return (a.data  || '').localeCompare(b.data  || '');
        case 'valor-desc':     return (b.valor || 0) - (a.valor || 0);
        case 'valor-asc':      return (a.valor || 0) - (b.valor || 0);
        case 'desc-asc':       return (a.desc  || '').localeCompare(b.desc  || '', 'pt-BR');
        case 'pagador-asc':    return (a.pagador || '').localeCompare(b.pagador || '');
        case 'categoria-asc':  return (a.categoria || '').localeCompare(b.categoria || '');
        default:               return (b.data  || '').localeCompare(a.data  || ''); // data-desc
      }
    });

  document.getElementById('filter-summary').textContent =
    `${list.length} item${list.length !== 1 ? 's' : ''} · ${brl(sumNet(list))} dedutível`;

  const selBtn = document.getElementById('btn-select-mode');
  const allBtn = document.getElementById('btn-select-all');
  const delBtn = document.getElementById('btn-delete-selected');
  if (selBtn) selBtn.textContent = selectionMode ? 'Cancelar' : 'Selecionar';
  if (allBtn) {
    allBtn.classList.toggle('hidden', !selectionMode);
    const allSelected = list.length > 0 && list.every(d => selectedIds.has(d.id));
    allBtn.textContent = allSelected ? 'Nenhum' : 'Todos';
  }
  if (delBtn) {
    delBtn.classList.toggle('hidden', !selectionMode);
    delBtn.textContent = `Excluir (${selectedIds.size})`;
    delBtn.disabled = selectedIds.size === 0;
  }

  const el = document.getElementById('despesas-list');
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
        <polyline points="13 2 13 9 20 9"/>
      </svg>Nenhuma despesa encontrada</div>`;
    return;
  }

  el.innerHTML = list.map(d => {
    const aids       = d.attachmentIds || [];
    const nd         = netDespesa(d);
    const isSelected = selectedIds.has(d.id);
    return `<div class="expense-item${isSelected ? ' selected' : ''}" data-id="${d.id}">
      ${selectionMode ? `<label class="expense-check">
        <input type="checkbox" id="chk-${d.id}" ${isSelected ? 'checked' : ''} onchange="window._toggleItemSelection(${d.id})">
      </label>` : ''}
      <div class="expense-body">
        <div class="expense-title">${escH(d.desc)}</div>
        <div class="expense-badges">
          <span class="badge ${catBadgeCls(d.categoria)}">${catLabel(d.categoria)}</span>
          <span class="badge ${pagBadgeCls(d.pagador)}">Pago: ${pagLabel(d.pagador)}</span>
          <span class="badge ${benBadgeCls(d.beneficiario)}">Benef.: ${benLabel(d.beneficiario)}</span>
          ${d.reembolso > 0 ? `<span class="badge b-reemb">Reemb. ${brl(d.reembolso)}</span>` : ''}
        </div>
        <div class="expense-meta">${fmtDate(d.data)}${d.obs ? ' · ' + escH(d.obs) : ''}</div>
        ${aids.length ? `<span class="attach-toggle" onclick="window._toggleAttach('ae${d.id}',${d.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>${aids.length} anexo${aids.length !== 1 ? 's' : ''}</span>` : ''}
        <div class="attach-expand" id="ae${d.id}"></div>
      </div>
      <div class="expense-amount">
        <div class="expense-net">${brl(nd)}</div>
        ${d.reembolso > 0 ? `<div class="expense-gross">${brl(d.valor)}</div>` : ''}
        ${!selectionMode ? `<div style="margin-top:5px;display:flex;gap:3px;justify-content:flex-end">
          <button class="btn btn-sm" onclick="window._editDespesa(${d.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-sm btn-danger" onclick="window._deleteDespesa(${d.id})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Resumo IR ─────────────────────────────────────────────────────────────────
export function renderResumo() {
  const people = [
    { key: 'titular', nome: cfg.titular, avc: 'av-tit' },
    { key: 'conjuge', nome: cfg.conjuge, avc: 'av-conj' },
  ];
  let html = '';
  for (const p of people) {
    const pd  = despesas.filter(d => d.pagador === p.key);
    const sl  = pd.filter(d => d.categoria === 'saude');
    const el  = pd.filter(d => d.categoria === 'educacao');
    const sn  = sumNet(sl);
    const en  = sumNet(el);
    const ed  = Math.min(en, limiteEduc());

    html += `<div class="card" style="margin-bottom:1rem">
      <div class="person-header">
        <div class="person-avatar ${p.avc}">${initials(p.nome)}</div>
        <div>
          <div class="person-name">${escH(p.nome)}</div>
          <div class="person-sub">Ficha: Pagamentos Efetuados – IRPF ${+cfg.ano + 1}</div>
        </div>
      </div>
      <div class="section-label">Saúde – sem limite</div>
      ${!sl.length ? `<p style="font-size:13px;color:var(--muted);margin-bottom:10px">Nenhum lançamento</p>`
        : sl.map(d => `<div class="total-row">
          <span class="label">${escH(d.desc)}
            <span class="badge b-filho" style="font-size:10px">${benLabel(d.beneficiario)}</span>
          </span>
          <span>${brl(netDespesa(d))}</span>
        </div>`).join('')}
      <div class="total-row fw-6"><span>Subtotal saúde</span><span class="text-teal">${brl(sn)}</span></div>

      <div class="section-label" style="margin-top:1rem">Educação – limite ${brl(limiteEduc())}/pessoa</div>
      ${!el.length ? `<p style="font-size:13px;color:var(--muted);margin-bottom:10px">Nenhum lançamento</p>`
        : el.map(d => `<div class="total-row">
          <span class="label">${escH(d.desc)}
            <span class="badge b-filho" style="font-size:10px">${benLabel(d.beneficiario)}</span>
          </span>
          <span>${brl(netDespesa(d))}</span>
        </div>`).join('')}
      ${en > limiteEduc() ? `<div class="alert alert-warn" style="font-size:12px;margin:5px 0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        </svg>Bruto ${brl(en)} · excedente ${brl(en - limiteEduc())} não dedutível</div>` : ''}
      <div class="total-row fw-6"><span>Subtotal educação (após limite)</span><span class="text-blue">${brl(ed)}</span></div>
      <div class="total-grand"><span>Total dedutível – ${escH(p.nome)}</span><span class="text-teal">${brl(sn + ed)}</span></div>
    </div>`;
  }
  document.getElementById('resumo-content').innerHTML = html;
}

// ── Config: storage info ──────────────────────────────────────────────────────
export async function renderStorageInfo() {
  const { dbAll } = await import('./db.js');
  const all   = await dbAll();
  const bytes = all.reduce((s, f) => s + f.size, 0);
  const { fmtSize } = await import('./helpers.js');
  document.getElementById('storage-info').textContent =
    `IndexedDB: ${all.length} arquivo${all.length !== 1 ? 's' : ''} · ${fmtSize(bytes)} armazenados`;
}
