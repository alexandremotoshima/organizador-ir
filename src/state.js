// ── Estado global ─────────────────────────────────────────────────────────────
// Fonte de verdade: Firestore. localStorage não é usado para dados.

export const DEFAULT_LIMITE_EDUC = 3561.50;

export let despesas     = [];
export let pendingFiles = [];
export let cfg = {
  titular:    'Ale',
  conjuge:    'Dani',
  filho:      'Filho/a',
  ano:        '2024',
  limiteEduc: DEFAULT_LIMITE_EDUC,
  scriptUrl:  '',
};

// ── Boot (sem localStorage) ───────────────────────────────────────────────────
export function loadDespesas() { despesas = []; }
export function loadCfg()      { /* config vem do Firestore */ }

// ── Hook de save — chama o Firestore após cada alteração ──────────────────────
let _onSave = null;
export function setFSSaveHook(fn) { _onSave = fn; }

export function saveDespesasToStorage() {
  if (_onSave) _onSave(despesas, cfg);
}

export function saveCfgToStorage() {
  if (_onSave) _onSave(despesas, cfg);
}

/** Atualiza despesas em memória SEM disparar save (ao receber dados do Firestore) */
export function replaceDespesasQuiet(list) {
  despesas = list;
}

export function addDespesa(d)    { despesas.push(d); saveDespesasToStorage(); }
export function removeDespesa(id){ despesas = despesas.filter(d => d.id !== id); saveDespesasToStorage(); }
export function replaceDespesas(list){ despesas = list; saveDespesasToStorage(); }

export function updateCfg(partial) {
  Object.assign(cfg, partial);
  saveCfgToStorage();
}

// ── Pending files (formulário) ────────────────────────────────────────────────
export function addPendingFile(f)     { pendingFiles.push(f); }
export function removePendingFile(i)  { pendingFiles.splice(i, 1); }
export function clearPendingFiles()   { pendingFiles.length = 0; }
export function setPendingFiles(list) { pendingFiles.length = 0; pendingFiles.push(...list); }

// ── Limites e aggregations ────────────────────────────────────────────────────
export const limiteEduc   = () => cfg.limiteEduc ?? DEFAULT_LIMITE_EDUC;
export const netDespesa   = d   => d.valor - (d.reembolso || 0);
export const sumNet       = arr => arr.reduce((s, d) => s + netDespesa(d), 0);
export const sumValor     = arr => arr.reduce((s, d) => s + d.valor, 0);
export const sumReembolso = arr => arr.reduce((s, d) => s + (d.reembolso || 0), 0);
