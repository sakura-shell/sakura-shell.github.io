// ホーム画面に追加（アプリのように使う）の案内
//
// ・Android の Chrome などで「インストールできる」とブラウザが知らせてきたときだけ、追加のボタンを出す
// ・ホーム画面から開いているとき（追加済み）は、ボタンも手順も出さない
// ・iPhone の Safari にはボタンを出す仕組みがないので、手順だけを載せる
// ・インストールを強制する表示はしない。開いた直後には出さない
// ・小さな案内（maybeShowInstallHint）は、導入を閉じたあとか、初めて貝を記録したあとに一度だけ。閉じたら自動では出さない
import { h, ic, toast, openSheet } from '../ui.js';

let deferred = null; // ブラウザの「インストールできます」の知らせ（beforeinstallprompt）

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // ブラウザの自動の案内は出さず、案内のページのボタンからだけ出す
  deferred = e;
  window.dispatchEvent(new CustomEvent('m36:installable'));
});
window.addEventListener('appinstalled', () => { deferred = null; });

// ホーム画面から開いているか（追加済み）
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

// 案内の欄（初めての方へ・このサイトについて で使う）。追加済みなら短い一文だけ
export function installSection(data) {
  if (isStandalone()) {
    return h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, 'ホーム画面から開いています'),
      h('p', { class: 'small' }, '記録はこの端末の中に保存されます。ほかの端末やブラウザとは同じになりません。'));
  }
  const pf = platform();
  const btnHolder = h('div');
  const drawButton = () => {
    btnHolder.replaceChildren(deferred
      ? h('button', { class: 'btn small secondary', type: 'button', onclick: async () => {
        const ev = deferred;
        deferred = null;
        ev.prompt();
        const choice = await ev.userChoice.catch(() => null);
        if (choice?.outcome === 'accepted') toast('ホーム画面に追加しました');
        drawButton();
      } }, ic('plus'), 'ホーム画面に追加する')
      : '');
  };
  drawButton();
  window.addEventListener('m36:installable', drawButton);

  const ios = h('div', { class: 'stack-sm' },
    h('p', { class: 'small strong' }, 'iPhone（Safari）'),
    h('ol', { class: 'small plain-steps' },
      h('li', null, 'Safari でこのページを開く'),
      h('li', null, '画面下（iPad は上）の共有ボタン（四角から上向きの矢印）を押す'),
      h('li', null, '「ホーム画面に追加」→「追加」を押す')));
  const android = h('div', { class: 'stack-sm' },
    h('p', { class: 'small strong' }, 'Android（Chrome）'),
    h('ol', { class: 'small plain-steps' },
      h('li', null, 'Chrome でこのページを開く'),
      h('li', null, '右上の「︙」（メニュー）を押す'),
      h('li', null, '「ホーム画面に追加」または「アプリをインストール」を押す')));
  const gate = data?.config?.previewGate && data.preview;
  return h('section', { class: 'card stack-sm' },
    h('h3', { class: 'section-title' }, 'ホーム画面に追加すると便利です'),
    h('p', { class: 'small' }, 'アプリのように、ホーム画面のアイコンからすぐ開けます。追加しなくても、記録はこの端末に保存されます。'),
    btnHolder,
    ...(pf === 'android' ? [android, ios] : [ios, android]),
    h('ul', { class: 'xsmall muted plain-list' },
      h('li', null, '記録はこの端末の中だけに保存されます。ほかの端末やブラウザとは同じになりません（同期はしません）。'),
      pf === 'ios' ? h('li', null, 'iPhone では、ホーム画面から開いたときと Safari で開いたときで、記録が別々になることがあります。ホーム画面から開くようにすると迷いません。') : null,
      gate ? h('li', null, '確認用プレビューでは、ホーム画面から初めて開いたときに、合言葉をもう一度聞かれることがあります。') : null));
}

// ---- 小さな案内（一度だけ） ----
const HINT_KEY = 'm36shells:install-hint';
let hintEl = null;

function hintSeen() { try { return !!localStorage.getItem(HINT_KEY); } catch { return true; } }

// reason：'intro'（導入を閉じた）| 'record'（初めて記録した）。delay：ほかの知らせと重ならないよう待つ時間
export function maybeShowInstallHint(reason, delay = 0) {
  if (isStandalone() || hintSeen() || hintEl) return;
  const pf = platform();
  // 追加の操作ができる環境だけ（ボタンを出せる／iPhone・Android は手順を出せる）
  if (!deferred && pf === 'other') return;
  setTimeout(() => {
    if (isStandalone() || hintSeen() || hintEl) return;
    try { localStorage.setItem(HINT_KEY, `${reason}:${new Date().toISOString().slice(0, 10)}`); } catch { /* 何もしない */ }
    const close = () => { hintEl?.remove(); hintEl = null; };
    const action = deferred
      ? h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const ev = deferred; deferred = null; close();
        ev.prompt();
        const choice = await ev.userChoice.catch(() => null);
        if (choice?.outcome === 'accepted') toast('ホーム画面に追加しました');
      } }, '追加する')
      : h('button', { class: 'btn small', type: 'button', onclick: () => { close(); showSteps(pf); } }, '追加のしかた');
    hintEl = h('aside', { class: 'install-hint', role: 'status', 'aria-label': 'ホーム画面に追加' },
      h('p', { class: 'small' }, h('strong', { class: 'block' }, 'ホーム画面に追加すると、次からすぐ開けます'),
        '集めた記録はこの端末に保存されます。'),
      h('div', { class: 'install-hint-actions' }, action,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '閉じる', onclick: close }, ic('close'))));
    document.body.append(hintEl);
  }, delay);
}

function showSteps(pf) {
  openSheet((close) => h('div', { class: 'stack' },
    h('h2', { style: { fontSize: '19px' } }, 'ホーム画面に追加する'),
    pf === 'ios'
      ? h('ol', { class: 'small plain-steps' },
        h('li', null, '画面下（iPad は上）の共有ボタン（四角から上向きの矢印）を押す'),
        h('li', null, '「ホーム画面に追加」→「追加」を押す'))
      : h('ol', { class: 'small plain-steps' },
        h('li', null, '右上の「︙」（メニュー）を押す'),
        h('li', null, '「ホーム画面に追加」または「アプリをインストール」を押す')),
    pf === 'ios' ? h('p', { class: 'xsmall muted' }, 'iPhone では、ホーム画面から開いたときと Safari で開いたときで、記録が別々になることがあります。') : null,
    h('p', { class: 'xsmall muted' }, '追加しなくても、記録はこの端末に保存されます。くわしくは「初めての方へ」にもあります。'),
    h('button', { class: 'btn block secondary', type: 'button', onclick: close }, '閉じる')));
}
