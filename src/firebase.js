// ── Firebase / Firestore – base de dados compartilhada ────────────────────────
import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyA52ZZVum4VtN3EiXgdN9j_AlHkoulHiro',
  authDomain:        'ir-project-8f4fb.firebaseapp.com',
  projectId:         'ir-project-8f4fb',
  storageBucket:     'ir-project-8f4fb.firebasestorage.app',
  messagingSenderId: '913312153447',
  appId:             '1:913312153447:web:37f61a0418f47890b7f9c2',
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const REF = doc(db, 'ir-data', 'familia-motoshima');

let _lastSavedAt = null;
let _saveTimer   = null;

/** Lê os dados do Firestore uma vez */
export async function fsLoad() {
  try {
    const snap = await getDoc(REF);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[FS] load falhou (offline?):', e.message);
    return null;
  }
}

/** Salva no Firestore com debounce de 1,5s para evitar writes excessivos */
export function fsSave(despesas, config) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      const at = new Date().toISOString();
      _lastSavedAt = at;
      await setDoc(REF, { despesas, config, updatedAt: at });
    } catch (e) {
      console.warn('[FS] save falhou:', e.message);
    }
  }, 1500);
}

/** Escuta mudanças em tempo real e chama callback quando outro dispositivo salva */
export function fsListen(callback) {
  return onSnapshot(REF,
    snap => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const data = snap.data();
      if (data.updatedAt === _lastSavedAt) return; // eco do próprio save
      callback(data);
    },
    e => console.warn('[FS] listen erro:', e.message)
  );
}
