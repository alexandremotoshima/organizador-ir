// ── Modal e Toast ─────────────────────────────────────────────────────────────

export function showModal(title, body, actions) {
  const btns = actions.map(a =>
    `<button class="${a.cls}" id="mb${a.label.replace(/\s/g, '')}">${a.label}</button>`
  ).join('');

  document.getElementById('modal-content').innerHTML = `
    <h3>${title}</h3>
    <p style="font-size:14px;color:var(--muted)">${body}</p>
    <div class="modal-actions">${btns}</div>`;

  document.getElementById('modal-backdrop').classList.remove('hidden');

  actions.forEach(a =>
    document.getElementById('mb' + a.label.replace(/\s/g, '')).addEventListener('click', a.cb)
  );
}

export function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}
