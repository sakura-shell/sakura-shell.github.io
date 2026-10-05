// 箱の記録（この端末・このブラウザの中だけ。外部には送らない）
//
// 3種類を区別する:
//   永続記録 … localStorage に保存。次に開いたときも残る
//   下書き   … 読み取り・修正の途中の内容（各画面が持つ。保存を押すまで永続記録を変えない）
//   一時記録 … 保存できない環境などで「この画面を開いている間だけ使う」を選んだ記録。閉じると消える
//
// 保存キーは公開パスごとに分ける（同じドメインの別サイトと混ざらないように）。
// 形式（v: 2）:
// { v: 2, savedAt: ISO日時, source: "manual"|"scan",
//   cells: { "12": { s: "filled"|"empty"|"check", t: 更新日時, img?: 箱の写真の切り抜き(dataURL) } } }
// 未記録の番号は cells に含めない。

const APP = 'm36shells';
const BASE = location.pathname.replace(/[^/]*$/, '') || '/';
const KEY = `${APP}:${BASE}:box`;
const MIGRATED = `${KEY}:migrated-from-v1`;
const BACKUP = `${KEY}:unreadable-backup`;
const LEGACY_KEY = 'm36:box:v1'; // 試作版の保存キー

export const STATES = ['filled', 'empty', 'check'];
export const STATE_LABEL = { filled: '貝あり', empty: '空き', check: '要確認', unknown: '未記録' };

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

function validCells(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const cells = {};
  for (const [no, c] of Object.entries(obj)) {
    const n = Number(no);
    if (!(n >= 1 && n <= 36) || !c || !STATES.includes(c.s)) return null;
    cells[n] = { s: c.s, t: typeof c.t === 'string' ? c.t : null };
    if (c.s === 'filled' && typeof c.img === 'string' && c.img.startsWith('data:image/')) cells[n].img = c.img;
  }
  return cells;
}

function parseRecord(raw, version) {
  try {
    const rec = JSON.parse(raw);
    if (!rec || rec.v !== version) return null;
    const cells = validCells(rec.cells);
    if (!cells) return null;
    return { v: 2, savedAt: rec.savedAt || null, source: rec.source || 'manual', cells };
  } catch {
    return null;
  }
}

// 記録を読む。一時記録を使っているときはそれを返す
export function loadBox() {
  lastError = null;
  if (temp) return temp;
  if (!storageAvailable()) return null;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw) {
    const rec = parseRecord(raw, 2);
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
  const rec = { v: 2, savedAt: new Date().toISOString(), source, cells };
  try {
    // 読めなかった古い記録は、上書きする前に一度だけ退避しておく
    const old = localStorage.getItem(KEY);
    if (old && !parseRecord(old, 2) && !localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, old);
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

// この画面を開いている間だけ使う記録。永続記録は変えない
export function useTemp(cells) {
  temp = { v: 2, temp: true, savedAt: null, source: 'temp', cells };
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
  const c = { filled: 0, empty: 0, check: 0, unknown: 36 };
  if (!record) return c;
  for (const cell of Object.values(record.cells)) {
    if (c[cell.s] !== undefined) {
      c[cell.s]++;
      c.unknown--;
    }
  }
  return c;
}

export function cellState(record, no) {
  return record?.cells?.[no]?.s || 'unknown';
}

// 「貝あり32・要確認4で保存」のような保存ボタンの文言
export function saveLabel(cells) {
  const c = counts({ cells });
  const parts = [`貝あり${c.filled}`];
  if (c.check) parts.push(`要確認${c.check}`);
  return `${parts.join('・')}で保存`;
}
