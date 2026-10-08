// 初めて開いた人への短い導入（ホームを出したあと、最初の1回だけ）
//
// ・「スキップ」と「始める」をいつも見える位置に置く。くわしい内容は「初めての方へ」（#/guide）へ
// ・出さないとき：2回目以降／すでに記録や設定がある端末（この機能を入れる前から使っている人）／
//   ホーム以外のアドレスから開いたとき（共有されたリンクなど）／ホーム画面から開いたとき
// ・見たかどうかは、この端末の中（localStorage）に印を残すだけ。閲覧の記録は取らない
// ・AI判定の準備は、この導入とは関係なく裏で進む（app.js）
import { h, ic, phrase } from '../ui.js';
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

// 導入を出す。閉じたら onDone(how) を呼ぶ（how：'start' | 'skip'）
export function showIntro(data, onDone) {
  shownThisPage = true;
  const ev = data.config.event?.status === 'confirmed' ? data.config.event : null;
  const prev = document.activeElement;
  const dlg = h('dialog', { class: 'intro', 'aria-labelledby': 'intro-title' });
  const close = (how) => {
    mark(how);
    if (dlg.open) dlg.close();
    dlg.remove();
    prev?.focus?.({ preventScroll: true });
    onDone?.(how);
  };
  const step = (n, title, text) => h('li', null, h('span', { class: 'step-no' }, n), h('span', null, h('strong', { class: 'block' }, title), h('span', { class: 'small' }, text)));
  dlg.append(
    h('div', { class: 'intro-top' },
      h('p', { class: 'intro-kicker' }, 'MASUHOGAURA 36 shells Collection'),
      h('button', { class: 'btn small ghost intro-skip', type: 'button', onclick: () => close('skip') }, 'スキップ')),
    h('div', { class: 'intro-body' },
      h('h2', { id: 'intro-title' }, phrase('増穂浦海岸で、', '36種類の秘貝を探そう')),
      h('ol', { class: 'intro-steps' },
        step(1, '収集箱を受け取る', ev ? `3つの施設で、参加費${ev.fee}で受け取れます` : '受け取り場所は「初めての方へ」で確認できます'),
        step(2, '海岸で貝を探して調べる', '拾った貝は「写真で調べる」や「貝の図鑑」で確かめられます'),
        step(3, '集めた数に応じて景品', '収集箱を施設に持っていくと、スタッフが確認します')),
      h('p', { class: 'xsmall muted' }, phrase('このサイトの記録は、', 'この端末の中だけに保存されます。')),
      h('a', { class: 'small intro-more', href: '#/guide', onclick: () => close('guide') }, ic('guide'), '詳しく見る（参加費・受け取り場所・景品）')),
    h('div', { class: 'intro-actions' },
      h('button', { class: 'btn block', type: 'button', onclick: () => close('start') }, '始める')),
  );
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close('skip'); });
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('.intro-actions .btn')?.focus({ preventScroll: true });
}
