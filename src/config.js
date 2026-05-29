// ── Aba de configurações ──────────────────────────────────────────────────────
import { cfg, updateCfg, DEFAULT_LIMITE_EDUC } from './state.js';
import { renderAll } from './ui.js';

/** Atualiza o texto das opções de selects que referenciam nomes de pessoas */
export function updatePersonLabels() {
  document.querySelectorAll('option[value="titular"]').forEach(o => { o.textContent = cfg.titular; });
  document.querySelectorAll('option[value="conjuge"]').forEach(o => { o.textContent = cfg.conjuge; });
  document.querySelectorAll('option[value="filho"]').forEach(o   => { o.textContent = cfg.filho;   });
}

/** Carrega os valores de cfg nos campos de formulário */
export function loadCfg() {
  document.getElementById('cfg-titular').value = cfg.titular || '';
  document.getElementById('cfg-conjuge').value = cfg.conjuge || '';
  document.getElementById('cfg-filho').value   = cfg.filho   || '';
  document.getElementById('cfg-ano').value     = cfg.ano     || '2024';
  document.getElementById('cfg-limite').value  = cfg.limiteEduc ?? DEFAULT_LIMITE_EDUC;
  updatePersonLabels();
}

/** Lê os campos e persiste */
export function saveCfg() {
  updateCfg({
    titular:    document.getElementById('cfg-titular').value.trim() || 'Ale',
    conjuge:    document.getElementById('cfg-conjuge').value.trim() || 'Dani',
    filho:      document.getElementById('cfg-filho').value.trim()   || 'Filho/a',
    ano:        document.getElementById('cfg-ano').value            || '2024',
    limiteEduc: parseFloat(document.getElementById('cfg-limite').value) || DEFAULT_LIMITE_EDUC,
  });
  updatePersonLabels();
  renderAll();
}
