// デジタルバッジ（集めた種類の数が 10・20・30・36 に届くと、もらえる）
//
// ・もらった日は、この端末の中（localStorage）に、収集箱の記録とは別のキーで残す（収集箱の記録の形は変えない）
// ・一度もらったバッジは、「箱から出す」で数が減っても残す
// ・バッジはこの端末の記録（自己申告）で出るもので、景品の証明ではない（画面にも必ず添える）
// ・この機能を入れる前から記録している人には、収集箱を開いたときに静かに渡す（お祝いの画面は、記録した瞬間だけ）
import { counts, loadBox, isTemp } from '../store.js';

export const BADGES = [
  { n: 10, id: 'hama', name: 'はじめての浜', img: 'assets/img/badges/badge-10.webp' },
  { n: 20, id: 'shiosai', name: '潮騒', ruby: 'しおさい', img: 'assets/img/badges/badge-20.webp' },
  { n: 30, id: 'mekiki', name: '浜の目利き', img: 'assets/img/badges/badge-30.webp' },
  { n: 36, id: 'kasen', name: '三十六歌仙', img: 'assets/img/badges/badge-36.webp' },
];

export const PRIZE_NOTE = '景品は、実物の収集箱を施設で確認してもらうと、もらえます。';

const BASE = location.pathname.replace(/[^/]*$/, '') || '/';
const KEY = `m36shells:${BASE}:badges`;
let tempEarned = null; // 保存できない環境・一時記録のとき（この画面の間だけ）

function read() {
  if (tempEarned) return tempEarned;
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

function write(v, temp) {
  if (temp) { tempEarned = v; return; }
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { tempEarned = v; }
}

// もらったバッジ：{ 10: 'ISO日時', ... }
export function earnedBadges() {
  return read();
}

// 今の記録で届いたバッジを渡す。新しくもらったバッジの一覧を返す（多い順に並べた最後が一番上の段階）
export function syncBadges(rec = loadBox()) {
  const filled = counts(rec).filled;
  const earned = { ...read() };
  const fresh = [];
  for (const b of BADGES) {
    if (filled >= b.n && !earned[b.n]) { earned[b.n] = new Date().toISOString(); fresh.push(b); }
  }
  if (fresh.length) write(earned, isTemp(rec));
  return fresh;
}

// 次のバッジ（まだもらっていないもの）まで、あと何種類か（すべてもらっていれば null）
export function nextBadge(rec = loadBox()) {
  const filled = counts(rec).filled;
  const earned = read();
  const b = BADGES.find((x) => !earned[x.n]);
  return b ? { badge: b, left: Math.max(0, b.n - filled) } : null;
}

// 収集箱の記録を「すべて消す」ときは、バッジも消す
export function clearBadges() {
  tempEarned = null;
  try { localStorage.removeItem(KEY); } catch { /* 何もしない */ }
}
