// ── Estado global ─────────────────────────────────────────────────────────────
const LS_DESP = 'ir_despesas_v3';
const LS_CFG  = 'ir_config_v2';

// Atualizar quando a Receita Federal publicar novo valor
export const DEFAULT_LIMITE_EDUC = 3561.50;

export let despesas    = [];
export let pendingFiles = []; // [{name, type, size, dataUrl, id?}]
export let cfg = {
  titular:    'Ale',
  conjuge:    'Dani',
  filho:      'Filho/a',
  ano:        '2024',
  limiteEduc: DEFAULT_LIMITE_EDUC,
};

// ── Persistência de despesas ──────────────────────────────────────────────────
export function loadDespesas() {
  try {
    const raw = localStorage.getItem(LS_DESP);
    despesas = raw ? JSON.parse(raw) : getDemoData();
  } catch {
    despesas = getDemoData();
  }
}

export function saveDespesasToStorage() {
  localStorage.setItem(LS_DESP, JSON.stringify(despesas));
}

export function addDespesa(d) {
  despesas.push(d);
  saveDespesasToStorage();
}

export function removeDespesa(id) {
  despesas = despesas.filter(d => d.id !== id);
  saveDespesasToStorage();
}

export function replaceDespesas(list) {
  despesas = list;
  saveDespesasToStorage();
}

// ── Configurações ─────────────────────────────────────────────────────────────
export function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (raw) Object.assign(cfg, JSON.parse(raw));
  } catch { /* usa defaults */ }
}

export function saveCfgToStorage() {
  localStorage.setItem(LS_CFG, JSON.stringify(cfg));
}

export function updateCfg(partial) {
  Object.assign(cfg, partial);
  saveCfgToStorage();
}

// ── Pending files (formulário) ────────────────────────────────────────────────
export function addPendingFile(f)     { pendingFiles.push(f); }
export function removePendingFile(i)  { pendingFiles.splice(i, 1); }
export function clearPendingFiles()   { pendingFiles.length = 0; }
export function setPendingFiles(list) { pendingFiles.length = 0; pendingFiles.push(...list); }

// ── Limites calculados ────────────────────────────────────────────────────────
export const limiteEduc = () => cfg.limiteEduc ?? DEFAULT_LIMITE_EDUC;

// ── Aggregations ──────────────────────────────────────────────────────────────
export const netDespesa   = d  => d.valor - (d.reembolso || 0);
export const sumNet       = arr => arr.reduce((s, d) => s + netDespesa(d), 0);
export const sumValor     = arr => arr.reduce((s, d) => s + d.valor, 0);
export const sumReembolso = arr => arr.reduce((s, d) => s + (d.reembolso || 0), 0);

// ── Dados de demonstração ─────────────────────────────────────────────────────
function getDemoData() {
  return [
    { id: 1, desc: 'Plano de saúde familiar – 1º semestre', categoria: 'saude',    beneficiario: 'filho',   pagador: 'titular', valor: 1800, reembolso: 0,   data: '2024-06-30', obs: '',                     attachmentIds: [] },
    { id: 2, desc: 'Consulta pediatra',                      categoria: 'saude',    beneficiario: 'filho',   pagador: 'conjuge', valor: 350,  reembolso: 120, data: '2024-03-15', obs: 'Reembolso parcial plano', attachmentIds: [] },
    { id: 3, desc: 'Mensalidade colégio + material',         categoria: 'educacao', beneficiario: 'filho',   pagador: 'titular', valor: 4200, reembolso: 0,   data: '2024-12-15', obs: '',                     attachmentIds: [] },
    { id: 4, desc: 'Ortodontia',                             categoria: 'saude',    beneficiario: 'filho',   pagador: 'conjuge', valor: 900,  reembolso: 400, data: '2024-08-20', obs: '',                     attachmentIds: [] },
    { id: 5, desc: 'Plano de saúde – 2º semestre',           categoria: 'saude',    beneficiario: 'filho',   pagador: 'conjuge', valor: 1920, reembolso: 0,   data: '2024-12-31', obs: '',                     attachmentIds: [] },
  ];
}
