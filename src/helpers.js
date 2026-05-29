// ── Formatadores e utilitários puros ─────────────────────────────────────────
import { cfg, limiteEduc } from './state.js';

export const brl = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const fmtDate = d =>
  d ? `${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(0,4)}` : '';

export const fmtSize = b =>
  b > 1_048_576 ? (b / 1_048_576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB';

export const today = () => new Date().toISOString().slice(0, 10);

/** Escapa HTML para evitar XSS ao inserir strings do usuário via innerHTML */
export const escH = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Iniciais do nome (até 2 letras) */
export const initials = name =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

// ── Classificadores de tipo de arquivo ───────────────────────────────────────
export const isImg = type => type && type.startsWith('image/');
export const isPdf = type => type && type.includes('pdf');

/** Ícone SVG para tipo de arquivo (para não-imagens) */
export const fileIcon = (type, sz = 18) => {
  if (isPdf(type)) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="${sz}" height="${sz}">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" width="${sz}" height="${sz}">
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
  </svg>`;
};

// ── Labels de domínio ─────────────────────────────────────────────────────────
export const catLabel = c => c === 'saude' ? 'Saúde' : 'Educação';
export const pagLabel = p => p === 'titular' ? cfg.titular : cfg.conjuge;
export const benLabel = b =>
  b === 'titular' ? cfg.titular : b === 'conjuge' ? cfg.conjuge : cfg.filho;

// ── Classes de badge por chave ────────────────────────────────────────────────
export const catBadgeCls = c => c === 'saude' ? 'b-saude' : 'b-educ';
export const pagBadgeCls = p => p === 'titular' ? 'b-tit' : 'b-conj';
export const benBadgeCls = b =>
  b === 'titular' ? 'b-tit' : b === 'conjuge' ? 'b-conj' : 'b-filho';
