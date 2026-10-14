// 初めて開いた人への案内画面（views/welcome.js）を出すかどうか。通常のトップ（#/）を最初に開いたときだけ
//
// ・出さないとき：2回目以降（表示した時点で印を残す。途中で閉じても次は出さない）／
//   すでに記録や設定がある端末（この機能を入れる前から使っている人）／
//   図鑑・個別の貝などのアドレスから開いたとき（その目的のページを優先し、訪問済みとして印を残す）／
//   ホーム画面のアイコンから開いたとき／印を保存できない環境（くり返し出して操作を邪魔しない）
// ・印は収集箱の記録とは別のキー（m36shells:intro）。以前の短い導入の印もそのまま使う
// ・見たかどうかは、この端末の中（localStorage）に印を残すだけ。閲覧の記録は取らない
// ・AI判定の準備は、この案内とは関係なく裏で進む（app.js）
import { loadBox } from '../store.js';
import { isStandalone } from './install.js';

const KEY = 'm36shells:intro';
// この機能を入れる前から使っている端末の目印（保存されていれば、導入は出さない）
const USED_KEYS = ['m36shells:box-view', 'm36shells:list-size', 'm36shells:device', 'm36shells:staff'];

function read() { try { return localStorage.getItem(KEY); } catch { return 'unavailable'; } }
function mark(v) { try { localStorage.setItem(KEY, v); } catch { /* 保存できなくても、この画面の間は出さない */ } }

let shownThisPage = false;

export function introNeeded() {
  if (shownThisPage || isStandalone()) return false;
  const v = read();
  if (v) return false; // 見た・スキップした・保存できない環境
  let used = false;
  try { used = !!loadBox() || USED_KEYS.some((k) => localStorage.getItem(k) !== null); } catch { used = true; }
  if (used) { mark('existing-user'); return false; }
  return true;
}

// 最初に開いたアドレスを知らせる（app.js から1回だけ）。トップ以外から開いたら、訪問済みにする
export function noteEntry(path) {
  if (path !== '/' && !read()) mark('deeplink');
}

// 見た印を残す（how：'shown'＝表示した／'start'＝「貝さがしをはじめる」／'skip'＝スキップ／'guide'＝参加方法へ）
export function markIntro(how) {
  shownThisPage = true;
  mark(how);
}
