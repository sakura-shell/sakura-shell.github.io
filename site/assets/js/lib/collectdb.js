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

// 書き出し済みの印を付ける
export function markExported(ids, when) {
  return tx('readwrite', (s) => {
    for (const id of ids) {
      const req = s.get(id);
      req.onsuccess = () => { const r = req.result; if (r) { r.exportedAt = when; s.put(r); } };
    }
  });
}

export function deleteExported() {
  return tx('readwrite', (s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (c.value.exportedAt) c.delete();
      c.continue();
    };
  });
}

// iPhone などで、しばらく開かないと保存データが消されにくいよう、端末に保存の継続を頼む
export async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* 頼めなくても保存はできる */ }
}

// 送付できた写真：送付日時を記録し、画像は消して端末の空きを増やす（数の集計には残す）
export function markSent(id, when) {
  return tx('readwrite', (s) => {
    const req = s.get(id);
    req.onsuccess = () => { const r = req.result; if (r) { r.sentAt = when; r.blob = null; s.put(r); } };
  });
}
