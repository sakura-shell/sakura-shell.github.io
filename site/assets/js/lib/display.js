// 表示の設定（アプリの中の文字・ボタン・余白の大きさ）
//
// ・「標準」と「大きめ」の2つ。アプリの中の表示だけを変える（ブラウザや端末の拡大率は変えない）
// ・選んだ設定は、この端末の中（localStorage）に、収集箱の記録とは別のキーで残す。記録・バッジには触れない
// ・ブラウザで開いても、ホーム画面のアイコンから開いても、「このサイトについて」とホームの「表示」から変えられる
// ・画面の大きさからの自動の切り替えはしない（選ぶのは利用者）。ピンチでの拡大や、端末の文字拡大も止めない
import { h, openSheet } from '../ui.js';

const KEY = 'm36shells:display';
const MODES = ['standard', 'large'];
export const DISPLAY_LABEL = { standard: '標準', large: '大きめ' };
export const DISPLAY_HELP = '文字やボタンが小さく感じるときは、「大きめ」を選べます。この設定はアプリ内の表示を調整します。ブラウザの拡大率などによっては、ブラウザ側の設定も確認してください。';

let memory = 'standard'; // 保存できない環境では、この画面の間だけ

export function getDisplay() {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.includes(v) ? v : memory;
  } catch {
    return memory;
  }
}

// 画面に反映する（html の data-display。大きさは style.css の変数で決める）
export function applyDisplay() {
  const v = getDisplay();
  if (v === 'standard') delete document.documentElement.dataset.display;
  else document.documentElement.dataset.display = v;
  window.dispatchEvent(new CustomEvent('m36:display'));
}

export function setDisplay(v) {
  if (!MODES.includes(v)) return;
  memory = v;
  try {
    if (v === 'standard') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch { /* 保存できなくても、この画面の間は使える */ }
  applyDisplay();
}

// 設定の部品（「このサイトについて」と、ホームの「表示」から開くシートで共通）
export function displayControl() {
  const wrap = h('div', { class: 'stack-sm display-control' });
  const draw = () => {
    const cur = getDisplay();
    wrap.replaceChildren(...[
      h('div', { class: 'seg seg-wide', role: 'group', 'aria-label': '表示の大きさ' },
        MODES.map((m) => h('button', {
          type: 'button', 'aria-pressed': String(cur === m), onclick: () => { setDisplay(m); draw(); },
        }, DISPLAY_LABEL[m]))),
      cur === 'standard' ? null : h('button', { class: 'btn small ghost', type: 'button', onclick: () => { setDisplay('standard'); draw(); } }, '標準に戻す'),
      h('p', { class: 'small' }, DISPLAY_HELP),
    ].filter(Boolean));
  };
  draw();
  return wrap;
}

export function openDisplaySheet() {
  openSheet((close) => h('div', { class: 'stack' },
    h('h2', { style: { fontSize: 'var(--fs-20)' } }, '表示'),
    displayControl(),
    h('button', { class: 'btn block secondary', type: 'button', onclick: close }, '閉じる')));
}
