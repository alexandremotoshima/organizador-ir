// ── IndexedDB — camada de persistência para arquivos/anexos ──────────────────
const DB_NAME  = 'ir_att';
const DB_VER   = 1;
const DB_STORE = 'files';

export let db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(DB_STORE)) {
        d.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e);
  });
}

export function dbPut(obj) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(obj);
    req.onsuccess = resolve;
    req.onerror   = reject;
  });
}

export function dbGet(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(id);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = reject;
  });
}

export function dbDel(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id);
    req.onsuccess = resolve;
    req.onerror   = reject;
  });
}

export function dbAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = reject;
  });
}
