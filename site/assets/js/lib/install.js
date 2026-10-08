// ホーム画面に追加（アプリのように使う）の案内
//
// ・Android の Chrome などで「インストールできる」とブラウザが知らせてきたときだけ、追加のボタンを出す
// ・ホーム画面から開いているとき（追加済み）は、ボタンも手順も出さない
// ・iPhone の Safari にはボタンを出す仕組みがないので、手順だけを載せる
// ・インストールを強制する表示はしない
import { h, ic, toast } from '../ui.js';

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

function platform() {
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
    h('p', { class: 'small' }, 'アプリのように、ホーム画面のアイコンからすぐ開けます。一度電波のある場所で開いておくと、電波が弱い海岸でも使えます。'),
    btnHolder,
    ...(pf === 'android' ? [android, ios] : [ios, android]),
    h('ul', { class: 'xsmall muted plain-list' },
      h('li', null, '記録はこの端末の中だけに保存されます。ほかの端末やブラウザとは同じになりません（同期はしません）。'),
      pf === 'ios' ? h('li', null, 'iPhone では、ホーム画面から開いたときと Safari で開いたときで、記録が別々になることがあります。ホーム画面から開くようにすると迷いません。') : null,
      gate ? h('li', null, '確認用プレビューでは、ホーム画面から初めて開いたときに、合言葉をもう一度聞かれることがあります。') : null));
}
