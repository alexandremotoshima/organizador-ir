// ── Formulário de despesa e upload de arquivos ────────────────────────────────
import { dbPut, dbGet, dbDel } from './db.js';
import {
  pendingFiles, addPendingFile, removePendingFile, clearPendingFiles, setPendingFiles,
  despesas, addDespesa, removeDespesa, limiteEduc,
} from './state.js';
import { brl, escH, today, fmtSize, isImg, isPdf, fileIcon } from './helpers.js';
import { renderAll, switchTab } from './ui.js';
import { toast } from './modal.js';

// ── Setup do drag-and-drop ────────────────────────────────────────────────────
export function setupDrop() {
  const zone = document.getElementById('dropzone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
}

export function handleFiles(files) {
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = e => {
      addPendingFile({ name: file.name, type: file.type, size: file.size, dataUrl: e.target.result });
      renderChips();
    };
    reader.readAsDataURL(file);
  }
}

export function renderChips() {
  document.getElementById('attach-pending').innerHTML = pendingFiles.map((f, i) => `
    <div class="attach-chip">
      ${isImg(f.type)
        ? `<img src="${f.dataUrl}" style="width:20px;height:20px;object-fit:cover;border-radius:2px;flex-shrink:0">`
        : `<span style="flex-shrink:0">${fileIcon(f.type, 14)}</span>`}
      <span title="${escH(f.name)}">${escH(f.name)}</span>
      <span style="color:var(--muted);font-size:10px;flex-shrink:0">${fmtSize(f.size)}</span>
      <button class="rm" onclick="window._rmPending(${i})" title="Remover">×</button>
    </div>`).join('');
}

export function removePending(i) {
  removePendingFile(i);
  renderChips();
}

// ── Preview do valor dedutível ────────────────────────────────────────────────
export function updateNetPreview() {
  const v  = parseFloat(document.getElementById('f-valor').value) || 0;
  const r  = parseFloat(document.getElementById('f-reemb').value) || 0;
  const el = document.getElementById('net-preview');
  if (r > 0 && v > 0) {
    document.getElementById('net-val').textContent = brl(v - r);
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ── Salvar despesa ────────────────────────────────────────────────────────────
export async function saveDespesa() {
  const desc  = document.getElementById('f-desc').value.trim();
  const valor = parseFloat(document.getElementById('f-valor').value);

  if (!desc || !valor || valor <= 0) {
    document.getElementById('form-error').classList.remove('hidden');
    return;
  }
  document.getElementById('form-error').classList.add('hidden');

  // Salva arquivos pendentes no IndexedDB
  const aids = [];
  for (const pf of pendingFiles) {
    const fid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await dbPut({ id: fid, name: pf.name, type: pf.type, size: pf.size, dataUrl: pf.dataUrl, createdAt: new Date().toISOString() });
    aids.push(fid);
  }

  addDespesa({
    id:            Date.now(),
    desc,
    categoria:     document.getElementById('f-cat').value,
    beneficiario:  document.getElementById('f-ben').value,
    pagador:       document.getElementById('f-pag').value,
    valor,
    reembolso:     parseFloat(document.getElementById('f-reemb').value) || 0,
    data:          document.getElementById('f-data').value,
    obs:           document.getElementById('f-obs').value.trim(),
    attachmentIds: aids,
  });

  document.getElementById('form-success').classList.remove('hidden');
  setTimeout(() => document.getElementById('form-success').classList.add('hidden'), 3000);

  clearForm();
  renderAll();
  toast(`Despesa salva${aids.length ? ` com ${aids.length} anexo${aids.length !== 1 ? 's' : ''}` : ''}`);
}

// ── Limpar formulário ─────────────────────────────────────────────────────────
export function clearForm() {
  ['f-desc', 'f-obs', 'f-valor', 'f-reemb'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-data').value = today();
  document.getElementById('net-preview').classList.add('hidden');
  document.getElementById('form-error').classList.add('hidden');
  clearPendingFiles();
  renderChips();
  document.getElementById('f-files').value = '';
}

// ── Editar despesa (carrega no form e remove do array) ────────────────────────
export async function editDespesa(id) {
  const d = despesas.find(x => x.id === id);
  if (!d) return;

  switchTab('adicionar');

  document.getElementById('f-desc').value  = d.desc;
  document.getElementById('f-cat').value   = d.categoria;
  document.getElementById('f-ben').value   = d.beneficiario;
  document.getElementById('f-pag').value   = d.pagador;
  document.getElementById('f-valor').value = d.valor;
  document.getElementById('f-reemb').value = d.reembolso || '';
  document.getElementById('f-data').value  = d.data || today();
  document.getElementById('f-obs').value   = d.obs || '';

  // Precarrega anexos existentes como pending
  clearPendingFiles();
  for (const aid of (d.attachmentIds || [])) {
    const f = await dbGet(aid);
    if (f) addPendingFile({ id: aid, ...f });
  }
  renderChips();
  updateNetPreview();

  removeDespesa(id);
  toast('Edite os campos e salve novamente');
}

// ── Deletar despesa ───────────────────────────────────────────────────────────
export async function deleteDespesa(id) {
  const { showModal, closeModal } = await import('./modal.js');
  showModal('Excluir despesa?', 'Esta ação não pode ser desfeita.', [
    { label: 'Cancelar', cls: 'btn', cb: closeModal },
    { label: 'Excluir',  cls: 'btn btn-danger', cb: async () => {
      const d = despesas.find(x => x.id === id);
      if (d) for (const aid of (d.attachmentIds || [])) await dbDel(aid);
      removeDespesa(id);
      renderAll();
      closeModal();
      toast('Despesa excluída');
    }},
  ]);
}
