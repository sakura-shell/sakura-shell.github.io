// ホーム画面に追加（アプリのように使う）の案内
//
// ・Android の Chrome などで「インストールできる」とブラウザが知らせてきたときだけ、追加のボタンを出す
// ・ホーム画面から開いているとき（追加済み）は、ボタンも手順も出さない
// ・iPhone の Safari にはボタンを出す仕組みがないので、手順だけを載せる
// ・インストールを強制する表示はしない。開いた直後には出さない
// ・追加すると「次からすぐ開ける」ことだけを伝える。記録が安全・永久に残るとは書かない
//   （記録は端末の中だけ。バックアップや端末どうしの同期ではない。くわしくは「このサイトについて」）
// ・ホームには、控えめな1行の入口（「ホーム画面に追加」）を置く。ホーム画面から開いているときは出さない
// ・はじめの案内では、ロゴの下に短く案内し、手順は「追加方法を見る」を開いたときだけ見せる
// ・小さな案内（maybeShowInstallHint）は、初めて貝を記録したあとに一度だけ。閉じたら自動では出さない
import { h, ic, toast, openSheet } from '../ui.js';

let deferred = null; // ブラウザの「インストールできます」の知らせ（beforeinstallprompt）

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // ブラウザの自動の案内は出さず、案内のページのボタンからだけ出す
  deferred = e;
  window.dispatchEvent(new CustomEvent('m36:installable'));
});
// 追加が終わったとブラウザが知らせたときだけ「追加しました」と出す（ボタンを押しただけでは出さない）
window.addEventListener('appinstalled', () => { deferred = null; toast('ホーム画面に追加しました'); });

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

// 案内の欄（はじめの案内・このサイトについて で使う）。追加済みなら短い一文だけ
// Android：使っているブラウザに合わせた手順
function androidSteps() {
  const ua = navigator.userAgent;
  const [name, steps] = /SamsungBrowser/.test(ua)
    ? ['Android（Samsung Internet）', ['下の「≡」（メニュー）を押す', '「ページを追加」→「ホーム画面」を押す']]
    : /Firefox/.test(ua)
      ? ['Android（Firefox）', ['右上の「︙」（メニュー）を押す', '「インストール」または「ホーム画面に追加」を押す']]
      : ['Android（Chrome）', ['右上の「︙」（メニュー）を押す', '「ホーム画面に追加」または「アプリをインストール」を押す']];
  return h('div', { class: 'stack-sm' }, h('p', { class: 'small strong' }, name), h('ol', { class: 'small plain-steps' }, steps.map((t) => h('li', null, t))));
}

// compact：初めての方への案内画面用。使っている端末の手順だけを短く
export function installSection(data, { compact = false, className = 'card stack-sm' } = {}) {
  if (isStandalone()) return null; // ホーム画面から開いているとき（追加済み）は、この欄を出さない
  const pf = platform();
  const btnHolder = h('div');
  const drawButton = () => {
    btnHolder.replaceChildren(deferred
      ? h('button', { class: 'btn small secondary', type: 'button', onclick: async () => {
        const ev = deferred;
        deferred = null;
        ev.prompt();
        await ev.userChoice.catch(() => null); // やめても、そのまま使える
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
  if (compact) {
    // はじめの案内の中：ボタンで追加できる環境ではボタン、手順は「追加方法を見る」で開く（初めの画面を長くしない）
    const steps = pf === 'ios' ? [ios] : pf === 'android' ? [androidSteps()] : [ios, android];
    return h('section', { class: className },
      h('h2', { class: 'section-title' }, 'ホーム画面に追加すると、次からすぐ開けます'),
      h('p', { class: 'small' }, 'アイコンから、この貝さがしガイドを開けます。追加せずにそのまま使うこともできます。'),
      btnHolder,
      h('details', { class: 'tips-more' }, h('summary', null, '追加方法を見る'), h('div', { class: 'stack-sm' }, ...steps)));
  }
  return h('section', { class: className },
    h('h3', { class: 'section-title' }, 'ホーム画面に追加すると、次からすぐ開けます'),
    h('p', { class: 'small' }, 'アイコンから、この貝さがしガイドを開けます。追加せずにそのまま使うこともできます。'),
    btnHolder,
    ...(pf === 'android' ? [android, ios] : [ios, android]),
    h('ul', { class: 'xsmall muted plain-list' },
      h('li', null, '追加しても、記録の保存のしかたは変わりません。記録はこの端末の中だけに保存され、バックアップや、ほかの端末との同期はしません。'),
      pf === 'ios' ? h('li', null, 'iPhone では、ホーム画面のアイコンから開いたときと Safari で開いたときで、記録が別々になることがあります。') : null,
      gate ? h('li', null, '確認用プレビューでは、ホーム画面から初めて開いたときに、合言葉をもう一度聞かれることがあります。') : null));
}

// ---- 小さな案内（一度だけ） ----
const HINT_KEY = 'm36shells:install-hint';
let hintEl = null;

function hintSeen() { try { return !!localStorage.getItem(HINT_KEY); } catch { return true; } }

// 案内画面で追加の方法を見せたときは、あとから小さな案内を出さない（同じことを何度も勧めない）
export function markInstallHintShown(reason) {
  try { if (!localStorage.getItem(HINT_KEY)) localStorage.setItem(HINT_KEY, `${reason}:${new Date().toISOString().slice(0, 10)}`); } catch { /* 何もしない */ }
}

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
        await ev.userChoice.catch(() => null); // やめても、そのまま使える
      } }, '追加する')
      : h('button', { class: 'btn small', type: 'button', onclick: () => { close(); showSteps(pf); } }, '追加のしかた');
    hintEl = h('aside', { class: 'install-hint', role: 'status', 'aria-label': 'ホーム画面に追加' },
      h('p', { class: 'small' }, h('strong', { class: 'block' }, 'ホーム画面に追加すると、次からすぐ開けます'),
        '追加せずにそのまま使うこともできます。'),
      h('div', { class: 'install-hint-actions' }, action,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': '閉じる', onclick: close }, ic('close'))));
    document.body.append(hintEl);
  }, delay);
}

// ホームの「ホーム画面に追加」の1行から開く。ブラウザが追加の確認を出せるときはそれを、出せないときは手順を見せる
// （押しただけで「追加しました」とは出さない。追加をやめても、そのまま使える）
export function canOfferInstall() {
  return !isStandalone() && (!!deferred || platform() !== 'other');
}

export async function openInstallGuide() {
  if (deferred) {
    const ev = deferred; deferred = null;
    ev.prompt();
    await ev.userChoice.catch(() => null);
    window.dispatchEvent(new CustomEvent('m36:installable'));
    return;
  }
  showSteps(platform());
}

function showSteps(pf) {
  openSheet((close) => h('div', { class: 'stack' },
    h('h2', { style: { fontSize: '19px' } }, 'ホーム画面に追加する'),
    pf === 'ios'
      ? h('ol', { class: 'small plain-steps' },
        h('li', null, '画面下（iPad は上）の共有ボタン（四角から上向きの矢印）を押す'),
        h('li', null, '「ホーム画面に追加」→「追加」を押す'))
      : androidSteps(),
    pf === 'ios' ? h('p', { class: 'xsmall muted' }, 'iPhone では、ホーム画面から開いたときと Safari で開いたときで、記録が別々になることがあります。') : null,
    h('p', { class: 'xsmall muted' }, '追加せずにそのまま使うこともできます。くわしくは「このサイトについて」にあります。'),
    h('button', { class: 'btn block secondary', type: 'button', onclick: close }, '閉じる')));
}

// ---- 画面が縮小されて表示されているとき ----
// Safari の「ページの拡大/縮小」を小さくしている、または「デスクトップ用Webサイトを表示」になっていると、
// スマホなのに横幅が実際の2倍近くあるように描かれ、文字もボタンも小さくなる（2026-11-09 依頼者の端末で発生）。
// 端末・ブラウザ側の設定なので、サイトからは戻せない。見分けは補助（推定）で、これを理由に表示設定を勝手に変えない
export function looksZoomedOut() {
  if (!(navigator.maxTouchPoints > 0)) return false;
  const short = Math.min(screen.width, screen.height);
  const long = Math.max(screen.width, screen.height);
  if (!short || short > 500) return false;
  const deviceWidth = window.innerWidth > window.innerHeight ? long : short;
  return window.innerWidth > deviceWidth * 1.3;
}

// 起動直後の警告にはしない（2026-11-13 依頼者の指示）。「このサイトについて」の「表示」の欄にだけ、補足として出す
export function zoomedOutNotice() {
  if (!looksZoomedOut()) return null;
  const ios = platform() === 'ios';
  return h('p', { class: 'small zoom-note' },
    h('strong', null, 'この端末では、画面が実際より小さく描かれているようです。'),
    ios
      ? (isStandalone()
        ? '設定アプリ →「アプリ」→「Safari」の「ページの拡大/縮小」と「デスクトップ用Webサイトを表示」で、このサイトを100%・オフに戻すと、元の大きさになります。'
        : 'Safari のアドレス欄の「ぁあ」から、大きさを100%に戻すか、「モバイル用Webサイトを表示」を選ぶと、元の大きさになります。')
      : 'ブラウザの拡大・縮小を100%に戻すか、「PC版サイト」の表示をオフにすると、元の大きさになります。');
}
