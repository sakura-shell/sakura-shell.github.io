// 箱の記録（この端末・このブラウザの中だけ。外部には送らない）
//
// 3種類を区別する:
//   永続記録 … localStorage に保存。次に開いたときも残る
//   下書き   … 読み取り・修正の途中の内容（各画面が持つ。保存を押すまで永続記録を変えない）
//   一時記録 … 保存できない環境などで「この画面を開いている間だけ使う」を選んだ記録。閉じると消える
//
// 保存キーは公開パスごとに分ける（同じドメインの別サイトと混ざらないように）。
//
// 記録の状態は「箱に入れた（貝あり）」と「空き」の2つ（2026-10-08〜）。
// 形式（v: 3）:
// { v: 3, savedAt: ISO日時, source: "manual"|"scan",
//   cells: { "12": { s: "filled", t: 更新日時, img?: 箱の写真の切り抜き(dataURL) } } }
// cells にあるのは「箱に入れた」番号だけ。載っていない番号は「空き」。
//
// 以前の形式（v: 2。貝あり／空き／要確認／未記録の4つ）は、読み込むときに v: 3 へ移す。
//   貝あり → 箱に入れた（日時・写真もそのまま）／ 要確認・空き・未記録 → 空き
//   移す前の記録は、別のキー（…:box:v2-backup）にそのまま残す（消さない）。

const APP = 'm36shells';
const BASE = location.pathname.replace(/[^/]*$/, '') || '/';
const KEY = `${APP}:${BASE}:box`;
const MIGRATED = `${KEY}:migrated-from-v1`;
const BACKUP = `${KEY}:unreadable-backup`;
const V2_BACKUP = `${KEY}:v2-backup`;
const V3_NOTE = `${KEY}:v3-note`; // 移したときの内容（収集箱の画面で一度だけ知らせる）
const LEGACY_KEY = 'm36:box:v1'; // 試作版の保存キー

export const STATES = ['filled', 'empty'];
export const STATE_LABEL = { filled: '貝あり', empty: '空き' };

let available = null;
let temp = null; // 一時記録
let lastError = null; // 'corrupt' など

export function storageAvailable() {
  if (available !== null) return available;
  try {
    const k = `${APP}:test`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    available = true;
  } catch {
    available = false;
  }
  return available;
}

// 以前の形式の状態も受け付ける（読み込み時に「箱に入れた」以外を空きにする）
const OLD_STATES = ['filled', 'empty', 'check'];

function validCells(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const cells = {};
  for (const [no, c] of Object.entries(obj)) {
    const n = Number(no);
    if (!(n >= 1 && n <= 36) || !c || !OLD_STATES.includes(c.s)) return null;
    if (c.s !== 'filled') continue; // 空き（以前の 要確認・空き）は持たない
    cells[n] = { s: 'filled', t: typeof c.t === 'string' ? c.t : null };
    if (typeof c.img === 'string' && c.img.startsWith('data:image/')) cells[n].img = c.img;
  }
  return cells;
}

// version: 読み込む形式（1, 2, 3）
function parseRecord(raw, version) {
  try {
    const rec = JSON.parse(raw);
    if (!rec || rec.v !== version) return null;
    const cells = validCells(rec.cells);
    if (!cells) return null;
    return { v: 3, savedAt: rec.savedAt || null, source: rec.source || 'manual', cells };
  } catch {
    return null;
  }
}

// 以前の形式（v: 2）の記録を v: 3 に移す。元の記録は退避して消さない
function migrateV2(raw) {
  const rec = parseRecord(raw, 2);
  if (!rec) return null;
  let old = {};
  try { old = JSON.parse(raw).cells || {}; } catch { /* 上で確かめ済み */ }
  const n = (st) => Object.values(old).filter((c) => c?.s === st).length;
  try {
    if (!localStorage.getItem(V2_BACKUP)) localStorage.setItem(V2_BACKUP, raw);
    localStorage.setItem(KEY, JSON.stringify(rec));
    localStorage.setItem(V3_NOTE, JSON.stringify({ at: new Date().toISOString(), filled: n('filled'), check: n('check'), empty: n('empty') }));
  } catch { /* 書き込めなくても、読み込んだ内容は使える（次に保存したときに v: 3 になる） */ }
  return rec;
}

// 移したときの内容（まだ知らせていないときだけ）。{ filled, check, empty } または null
export function migrationNote() {
  try {
    const v = JSON.parse(localStorage.getItem(V3_NOTE) || 'null');
    return v && !v.seen ? v : null;
  } catch {
    return null;
  }
}

export function dismissMigrationNote() {
  try {
    const v = JSON.parse(localStorage.getItem(V3_NOTE) || 'null');
    if (v) localStorage.setItem(V3_NOTE, JSON.stringify({ ...v, seen: true }));
  } catch { /* 何もしない */ }
}

// 記録を読む。一時記録を使っているときはそれを返す
export function loadBox() {
  lastError = null;
  if (temp) return temp;
  if (!storageAvailable()) return null;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw) {
    const rec = parseRecord(raw, 3) || migrateV2(raw);
    if (!rec) lastError = 'corrupt'; // 壊れていても消さない（保存時に退避してから上書き）
    return rec;
  }
  return migrateLegacy();
}

// 試作版（m36:box:v1）の記録を、内容を確かめてから新しいキーへ写す。旧データは消さない
function migrateLegacy() {
  try {
    if (localStorage.getItem(MIGRATED)) return null;
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const rec = parseRecord(raw, 1);
    if (!rec) return null;
    localStorage.setItem(KEY, JSON.stringify(rec));
    localStorage.setItem(MIGRATED, new Date().toISOString());
    return rec;
  } catch {
    return null;
  }
}

export function loadError() {
  return lastError;
}

export function isTemp(rec) {
  return !!rec?.temp;
}

// 保存。戻り値: { ok, droppedImages?, record?, error? }
export function saveBox({ source = 'manual', cells }) {
  if (!storageAvailable()) return { ok: false, error: 'unavailable' };
  const rec = { v: 3, savedAt: new Date().toISOString(), source, cells: onlyFilled(cells) };
  try {
    // 読めなかった古い記録は、上書きする前に一度だけ退避しておく
    const old = localStorage.getItem(KEY);
    if (old && !parseRecord(old, 3) && !parseRecord(old, 2) && !localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, old);
  } catch { /* 退避できなくても保存は続ける */ }
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
    temp = null;
    return { ok: true, record: rec };
  } catch {
    // 容量不足のときは、切り抜き画像を外して状態だけ保存し直す
    try {
      const slim = { ...rec, cells: {} };
      for (const [no, c] of Object.entries(rec.cells)) slim.cells[no] = { s: c.s, t: c.t };
      localStorage.setItem(KEY, JSON.stringify(slim));
      temp = null;
      return { ok: true, droppedImages: true, record: slim };
    } catch (e2) {
      return { ok: false, error: e2?.name || 'save-failed' };
    }
  }
}

// 「箱に入れた」番号だけを残す
function onlyFilled(cells) {
  const out = {};
  for (const [no, c] of Object.entries(cells || {})) if (c?.s === 'filled') out[no] = c;
  return out;
}

// 1マスだけ記録してすぐ保存する（押すたびに保存）。state: 'filled'（箱に入れる）| 'empty'（箱から出す）
// 戻り値: { ok, prev（取り消し用の元の状態。空きなら null）, temp?, error? }
export function setCell(no, state) {
  const rec = loadBox();
  const cells = {};
  for (const [k, c] of Object.entries(rec?.cells || {})) cells[k] = { ...c };
  const prev = cells[no] ? { ...cells[no] } : null;
  if (state === 'filled') {
    cells[no] = { s: 'filled', t: new Date().toISOString() };
    if (prev?.img) cells[no].img = prev.img; // 箱の写真は入れたままなら残す
  } else {
    delete cells[no]; // 空きに戻す（写真・日時も消す）
  }
  return { ...writeCells(cells, rec), prev };
}

// 取り消し：1マスを元の状態に戻す
export function restoreCell(no, prev) {
  const rec = loadBox();
  const cells = {};
  for (const [k, c] of Object.entries(rec?.cells || {})) cells[k] = { ...c };
  if (prev) cells[no] = prev; else delete cells[no];
  return writeCells(cells, rec);
}

function writeCells(cells, rec) {
  if (isTemp(rec)) { useTemp(cells); return { ok: true, temp: true }; }
  const res = saveBox({ source: 'manual', cells });
  return res.ok ? { ok: true, droppedImages: res.droppedImages } : { ok: false, error: res.error, cells };
}

// この画面を開いている間だけ使う記録。永続記録は変えない
export function useTemp(cells) {
  temp = { v: 3, temp: true, savedAt: null, source: 'temp', cells: onlyFilled(cells) };
  return temp;
}

export function endTemp() {
  temp = null;
}

// 記録を消す。実際に消えたことを確かめてから true を返す
export function clearBox() {
  if (temp) { temp = null; return true; }
  try {
    localStorage.removeItem(KEY);
    localStorage.setItem(MIGRATED, localStorage.getItem(MIGRATED) || 'cleared'); // 旧記録を再び取り込まない
    return localStorage.getItem(KEY) === null;
  } catch {
    return false;
  }
}

export function counts(record) {
  let filled = 0;
  for (const cell of Object.values(record?.cells || {})) if (cell?.s === 'filled') filled++;
  return { filled, empty: 36 - filled };
}

export function cellState(record, no) {
  return record?.cells?.[no]?.s === 'filled' ? 'filled' : 'empty';
}

// 「貝あり12で保存」のような保存ボタンの文言
export function saveLabel(cells) {
  return `貝あり${counts({ cells }).filled}で保存`;
}
