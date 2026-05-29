// ── Export e Import JSON ──────────────────────────────────────────────────────
import { dbAll, dbPut } from './db.js';
import { despesas, cfg, replaceDespesas, updateCfg } from './state.js';
import { today } from './helpers.js';
import { loadCfg } from './config.js';
import { renderAll } from './ui.js';
import { toast } from './modal.js';

const PAGES_URL = 'https://alexandremotoshima.github.io/organizador-ir/';

function encodeB64(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    (_, p) => String.fromCharCode(parseInt(p, 16))));
}

function decodeB64(b64) {
  return decodeURIComponent(atob(b64).split('').map(
    c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
}

export async function exportJSON() {
  const allFiles = await dbAll();
  const payload  = {
    version:     3,
    exportedAt:  new Date().toISOString(),
    config:      cfg,
    despesas,
    attachments: allFiles,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `ir-backup-${cfg.ano || '2024'}-${today()}.json`;
  a.click();
  toast('Backup exportado (inclui anexos)!');
}

// ── Sync via URL hash ─────────────────────────────────────────────────────────
export function gerarLinkSync() {
  const payload = { version: 3, syncAt: new Date().toISOString(), config: cfg, despesas };
  const encoded = encodeB64(JSON.stringify(payload));
  const url     = `${PAGES_URL}#sync=${encoded}`;
  window.open(url, '_blank');
  toast('Abrindo GitHub Pages para sincronizar…');
}

export function checkSyncURL() {
  const hash = window.location.hash;
  if (!hash.startsWith('#sync=')) return;
  try {
    const data = JSON.parse(decodeB64(hash.slice(6)));
    if (!data.despesas) return;
    replaceDespesas(data.despesas);
    if (data.config) { updateCfg(data.config); loadCfg(); }
    renderAll();
    history.replaceState(null, null, window.location.pathname);
    toast(`✓ ${data.despesas.length} despesas sincronizadas do app local!`);
  } catch (e) {
    console.warn('Sync URL inválida:', e);
  }
}

export function importJSON(evt) {
  const file = evt.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.despesas) { toast('Arquivo inválido'); return; }

      replaceDespesas(data.despesas);

      if (data.config) {
        updateCfg(data.config);
        loadCfg(); // atualiza campos de UI
      }

      if (data.attachments) {
        for (const f of data.attachments) await dbPut(f);
      }

      renderAll();
      toast(`${data.despesas.length} despesas e ${(data.attachments || []).length} anexos importados!`);
    } catch (ex) {
      toast('Erro ao importar: ' + ex.message);
    }
  };
  reader.readAsText(file);
  evt.target.value = '';
}
