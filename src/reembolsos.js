// ── Aba Reembolsos ────────────────────────────────────────────────────────────
import { despesas, saveDespesasToStorage } from './state.js';
import { brl, fmtDate, escH } from './helpers.js';

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
  renderReembolsos();
};

window._rbSetValor = function(expId, plano, valor) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  ensureReembolsos(d);
  const r = d.reembolsos.find(x => x.plano === plano);
  if (r) r.valor = parseFloat(String(valor).replace(',', '.')) || 0;
  saveDespesasToStorage();
};

window._rbSetDoc = function(expId, field, checked) {
  const d = despesas.find(x => x.id === expId);
  if (!d) return;
  d[field] = checked;
  saveDespesasToStorage();
};
