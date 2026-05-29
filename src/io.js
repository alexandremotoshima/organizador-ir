// ── Export e Import JSON ──────────────────────────────────────────────────────
import { dbAll, dbPut } from './db.js';
import { despesas, cfg, replaceDespesas, updateCfg } from './state.js';
import { today } from './helpers.js';
import { loadCfg } from './config.js';
import { renderAll } from './ui.js';
import { toast } from './modal.js';

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
