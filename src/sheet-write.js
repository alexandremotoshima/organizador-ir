// ── Sync bidirecional: app → Google Sheets via Apps Script ────────────────────
import { cfg } from './state.js';

const STATUS_TO_SHEET = {
  solicitar:  'SOLICITAR',
  solicitado: 'Aguardando',
  concluido:  'Concluído',
  na:         'NA',
};

export async function syncDespesaToSheet(d) {
  const url = cfg.scriptUrl;
  if (!url) return;

  const updates = {};
  for (const r of (d.reembolsos || [])) {
    updates[r.plano] = { status: STATUS_TO_SHEET[r.status] || 'NA', valor: r.valor || 0 };
  }
  updates.comprovante  = d.comprovante;
  updates.notaFiscal   = d.notaFiscal;
  updates.pedidoMedico = d.pedidoMedico;

  const body = JSON.stringify({ date: d.data, desc: d.desc, valor: d.valor, updates });

  try {
    // mode: no-cors é necessário pois Apps Script não envia CORS headers em POST
    await fetch(url, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
  } catch (e) {
    console.warn('[Sheet write]', e.message);
  }
}
