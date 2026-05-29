// ── Geração do relatório de impressão / PDF ───────────────────────────────────
import { dbAll } from './db.js';
import { despesas, cfg, limiteEduc, netDespesa, sumNet, sumValor, sumReembolso } from './state.js';
import { brl, fmtDate, fmtSize, escH, catLabel, pagLabel, benLabel, isImg, isPdf } from './helpers.js';

export async function printReport() {
  const ano    = cfg.ano || '2024';
  const anoDecl = +ano + 1;
  const sorted  = [...despesas].sort((a, b) => (a.pagador || '').localeCompare(b.pagador || ''));

  // Tabela de despesas
  const rows = sorted.map(d => `<tr>
    <td>${escH(d.desc)}${d.obs ? `<br><small style="color:#888">${escH(d.obs)}</small>` : ''}</td>
    <td class="${d.categoria === 'saude' ? 'p-cat-s' : 'p-cat-e'}">${catLabel(d.categoria)}</td>
    <td>${pagLabel(d.pagador)}</td>
    <td>${benLabel(d.beneficiario)}</td>
    <td>${fmtDate(d.data)}</td>
    <td class="amount">${brl(d.valor)}</td>
    <td class="amount reemb">${d.reembolso > 0 ? brl(d.reembolso) : '—'}</td>
    <td class="amount ded">${brl(netDespesa(d))}</td>
  </tr>`).join('');

  // Documentos agrupados por categoria|pagador
  const allFiles = await dbAll();
  const fileMap  = {};
  allFiles.forEach(f => { fileMap[f.id] = f; });

  const groups = {};
  for (const d of despesas) {
    for (const aid of (d.attachmentIds || [])) {
      const f = fileMap[aid];
      if (!f) continue;
      const k = `${d.categoria}|${d.pagador}`;
      if (!groups[k]) groups[k] = { cat: d.categoria, pag: d.pagador, items: [] };
      groups[k].items.push({ f, d });
    }
  }

  let docsHtml = '';
  for (const k of Object.keys(groups).sort()) {
    const g = groups[k];
    docsHtml += `<div class="print-docs-group">
      <div class="print-docs-group-title">${catLabel(g.cat)} – ${pagLabel(g.pag)}</div>
      <table class="print-doc-table">
        <thead><tr><th>Miniatura</th><th>Arquivo</th><th>Despesa</th><th>Beneficiário</th><th>Data</th></tr></thead>
        <tbody>
          ${g.items.map(({ f, d }) => `<tr>
            <td>${isImg(f.type) ? `<img class="print-thumb" src="${f.dataUrl}">` : `<span>${isPdf(f.type) ? 'PDF' : 'Arquivo'}</span>`}</td>
            <td>${escH(f.name)}</td>
            <td>${escH(d.desc)}</td>
            <td>${benLabel(d.beneficiario)}</td>
            <td>${fmtDate(d.data)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // Resumo por declarante
  let sumHtml = '<div class="print-summary-grid">';
  for (const p of [{ key: 'titular', nome: cfg.titular }, { key: 'conjuge', nome: cfg.conjuge }]) {
    const pd = despesas.filter(d => d.pagador === p.key);
    const sn = sumNet(pd.filter(d => d.categoria === 'saude'));
    const en = sumNet(pd.filter(d => d.categoria === 'educacao'));
    const ed = Math.min(en, limiteEduc());
    sumHtml += `<div class="print-person-box">
      <h3>${escH(p.nome)}</h3>
      <div class="print-row"><span>Saúde (líquido)</span><span>${brl(sn)}</span></div>
      <div class="print-row"><span>Educação (bruto)</span><span>${brl(en)}</span></div>
      ${en > limiteEduc() ? `<div class="print-row" style="color:#7A4A0A"><span>↳ Excedente</span><span>${brl(en - limiteEduc())}</span></div>` : ''}
      <div class="print-row"><span>Educação (após limite)</span><span>${brl(ed)}</span></div>
      <div class="print-row grand"><span>Total dedutível</span><span>${brl(sn + ed)}</span></div>
    </div>`;
  }
  sumHtml += '</div>';

  const nDocs = allFiles.filter(f => despesas.some(d => (d.attachmentIds || []).includes(f.id))).length;

  document.getElementById('print-area').innerHTML = `
    <div class="print-header">
      <h1>Relatório IRPF ${anoDecl} – Saúde &amp; Educação</h1>
      <p>Ano-calendário ${ano} · Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      <p>${escH(cfg.titular)} &amp; ${escH(cfg.conjuge)} · Filho/a: ${escH(cfg.filho)} · ${despesas.length} lançamentos · ${nDocs} documentos</p>
    </div>

    <div class="print-section-title">1. Todas as despesas</div>
    <table class="print-table">
      <thead>
        <tr><th>Descrição</th><th>Categoria</th><th>Pago por</th><th>Beneficiário</th><th>Data</th>
            <th class="amount">Valor</th><th class="amount">Reembolso</th><th class="amount">Dedutível</th></tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="font-weight:700;background:#f9f9f9">
          <td colspan="5">TOTAL</td>
          <td class="amount">${brl(sumValor(despesas))}</td>
          <td class="amount reemb">${brl(sumReembolso(despesas))}</td>
          <td class="amount ded">${brl(sumNet(despesas))}</td>
        </tr>
      </tbody>
    </table>

    <div class="print-section-title">2. Resumo por declarante</div>
    ${sumHtml}
    <p style="margin-top:12px;font-size:8.5pt;color:#555">
      <strong>Nota:</strong> Limite educação IRPF ${anoDecl}: ${brl(limiteEduc())}/pessoa.
      Saúde dedutível sem limite, descontados reembolsos do plano.
    </p>

    ${docsHtml ? `<div class="print-section-title" style="margin-top:20px">3. Documentos anexados por categoria</div>${docsHtml}` : ''}

    <div class="print-footer">Organizador IR – Saúde &amp; Educação · Ano-calendário ${ano}</div>`;

  window.print();
}
