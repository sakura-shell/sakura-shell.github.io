// 学習用の写真を、この端末の中（IndexedDB）に貯める。書き出すまで外部には送らない
const DB = 'm36shells-collect';
const STORE = 'photos';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

// { label: '5' | 'other', group: '5-20261005-1', blob: Blob, t: ISO日時, note }
export function addPhoto(rec) { return tx('readwrite', (s) => s.add(rec)); }
export function allPhotos() { return tx('readonly', (s) => s.getAll()); }
export function deletePhoto(id) { return tx('readwrite', (s) => s.delete(id)); }
export function clearPhotos() { return tx('readwrite', (s) => s.clear()); }
