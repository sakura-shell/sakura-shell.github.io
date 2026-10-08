// 画面の切り替え（ハッシュ #/... によるルーティング）
import { loadData, setDevFromQuery, setStaffFromQuery, isDev } from './data.js';
import { gateNeeded, showGate } from './lib/gate.js';
import { identifierEnabled, prepareIdentifier } from './lib/identify.js';
import { maybeShowInstallHint } from './lib/install.js'; // ホーム画面に追加の知らせ（beforeinstallprompt）を最初から受け取る
import { introNeeded, showIntro } from './lib/intro.js';
import { h, ic } from './ui.js';
import * as home from './views/home.js';
import * as list from './views/list.js';
import * as detail from './views/detail.js';
import * as compare from './views/compare.js';
import * as identify from './views/identify.js';
import * as box from './views/box.js';
import * as scan from './views/scan.js';
import * as about from './views/about.js';
import * as guide from './views/guide.js';
import * as collect from './views/collect.js';

const routes = [
  { re: /^\/$/, view: home, tab: 'home' },
  { re: /^\/list$/, view: list, tab: 'list' },
  { re: /^\/shell\/(\d+)$/, view: detail, tab: 'list' },
  { re: /^\/compare\/(photo|\d+)(?:\/(\d+))?$/, view: compare, tab: 'list' },
  { re: /^\/identify$/, view: identify, tab: 'identify' },
  { re: /^\/box$/, view: box, tab: 'box' },
  { re: /^\/scan$/, view: scan, tab: 'box' },
  { re: /^\/about$/, view: about, tab: 'home' },
  { re: /^\/guide$/, view: guide, tab: 'home' },
  { re: /^\/collect$/, view: collect, tab: 'identify' },
];

const TABS = [
  { key: 'home', href: '#/', label: 'ホーム', icon: 'home' },
  { key: 'list', href: '#/list', label: '図鑑', icon: 'search' },
  { key: 'identify', href: '#/identify', label: '写真で調べる', icon: 'camera' },
  { key: 'box', href: '#/box', label: '収集箱', icon: 'box' },
];

const root = document.getElementById('app');
let data = null;
let current = null; // { view, cleanup, guard }
let currentHash = null;
let lastIndex = -1; // 履歴の中で、このアプリ内の何番目の画面か
const scrollMemory = new Map(); // 戻ったときにスクロール位置を戻すため

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}

export function navigate(to, { replace = false } = {}) {
  if (replace) {
    history.replaceState(history.state, '', to);
    render();
  } else {
    location.hash = to.replace(/^#/, '');
  }
}

// クエリだけ更新（履歴を増やさない）
export function setQuery(params) {
  const { path } = parseHash();
  const qs = new URLSearchParams(params).toString();
  const url = `#${path}${qs ? `?${qs}` : ''}`;
  history.replaceState(history.state, '', url);
  currentHash = location.hash;
}

export function goBack(fallback = '#/') {
  if (history.state?.i > 0) history.back();
  else navigate(fallback, { replace: true });
}

function tabbar(activeKey) {
  return h('nav', { class: 'tabbar', 'aria-label': 'メインメニュー' },
    h('ul', null, TABS.map((t) => h('li', null,
      h('a', { href: t.href, 'aria-current': t.key === activeKey ? 'page' : null },
        h('span', { class: 'tab-ic' }, ic(t.icon)), t.label)))));
}

async function onHashChange() {
  if (location.hash === currentHash) return;
  if (current?.guard) {
    const ok = await current.guard();
    if (!ok) {
      // 元の画面に戻す（確認中の内容を失わないため）。pushState は hashchange を起こさない
      history.pushState({ i: lastIndex + 1 }, '', currentHash);
      lastIndex++;
      return;
    }
  }
  render();
}

async function render() {
  const { path, query } = parseHash();
  const route = routes.find((r) => r.re.test(path));
  if (!route) { navigate('#/', { replace: true }); return; }
  const match = path.match(route.re);
  setDevFromQuery(query);
  setStaffFromQuery(query);
  try { current?.cleanup?.(); } catch { /* 何もしない */ }
  if (currentHash) scrollMemory.set(currentHash, window.scrollY);
  const prevIndex = lastIndex;
  current = null;
  currentHash = location.hash || '#/';
  if (typeof history.state?.i !== 'number') history.replaceState({ i: lastIndex + 1 }, '', location.href);
  lastIndex = history.state.i;
  const goingBack = lastIndex < prevIndex;

  const ctx = {
    data, query, params: match.slice(1), navigate, setQuery, goBack,
    setGuard(fn) { if (current) current.guard = fn; },
    setDirty(fn) { if (current) current.dirty = fn; },
    onCleanup(fn) { if (current) current.cleanup = fn; },
  };
  current = { view: route.view };
  let el;
  try {
    el = await route.view.render(ctx);
  } catch (e) {
    console.error(e);
    el = h('main', { class: 'page', id: 'main' },
      h('div', { class: 'card stack', style: { marginTop: '24px' } },
        h('h1', { style: { fontSize: '20px' } }, '表示できませんでした'),
        h('p', { class: 'muted' }, 'もう一度お試しください。'),
        h('a', { class: 'btn', href: '#/' }, 'ホームへ')));
  }
  if (currentHash !== (location.hash || '#/')) return; // 描画中に別の画面へ移った
  const hideTabbar = el.dataset?.tabbar === 'hide';
  const banner = data.preview || isDev()
    ? h('div', { class: 'preview-banner', role: 'note' },
      data.preview ? '確認用プレビュー：照合待ちの情報を含みます' : '',
      isDev() ? '（開発用モード）' : '')
    : '';
  root.replaceChildren(banner, el, hideTabbar ? '' : tabbar(el.dataset?.tab || route.tab));
  if (el.classList?.contains('page')) el.classList.add('enter'); // ふわっと現れる（動きを減らす設定では止まる）
  // ブラウザの「戻る」では、前に見ていた位置に戻す（一覧の探し直しを減らす）
  const saved = scrollMemory.get(currentHash);
  window.scrollTo(0, goingBack && saved ? saved : 0);
  const title = el.dataset?.title;
  document.title = title ? `${title}｜36 shells Collection` : '36 shells Collection｜増穂浦の三十六歌仙貝';
  // 画面の見出しにフォーカスを移す（読み上げ用）
  const heading = el.querySelector('h1');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
}

// 手が空いたときに実行する（対応していないブラウザでは少し待ってから）
function whenIdle(fn, timeout) {
  if ('requestIdleCallback' in window) requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 1200);
}

// AI判定の先回りの準備。画面を出したあと、手が空いたときに2段階で行う
//   1段目：分類器・TensorFlow.js・MobileNet のファイルを読み込む（通信だけ。Service Worker が保存する）
//   2段目：モデルを組み立てて慣らしの計算をする（少し重いので、1段目のあと、さらに手が空いたとき）
// 写真を撮ったときは、ここで始めた準備をそのまま使う（lib/identify.js・lib/embed.js が1回だけ準備する）
//   通信量を節約する設定・とても遅い回線（2G）では、ホームでは先読みしない（写真で調べる画面を開いたときに準備する）。
//   メモリの少ない端末では、ホームではファイルの読み込みまでにして、モデルの組み立ては写真で調べる画面で行う
function warmUpAI() {
  const conn = navigator.connection;
  const slow = conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '');
  const ai = identifierEnabled(data) && !slow;
  const lowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
  whenIdle(async () => {
    if (ai && await prepareIdentifier(data, 1) && !lowMemory) whenIdle(() => prepareIdentifier(data, 2), 4000);
    cachePhotosLater();
  }, 3000);
}

// オフライン用に図鑑の写真を保存してもらう（AI の先読みのあと。回線を取り合わないように）
function cachePhotosLater() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'cache-photos' })).catch(() => {});
}

async function boot() {
  try {
    data = await loadData();
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('main', { class: 'page' },
      h('div', { class: 'card stack', style: { marginTop: '24px' } },
        h('h1', { style: { fontSize: '20px' } }, 'データを読み込めませんでした'),
        h('p', { class: 'muted' }, '通信状態を確認して、もう一度開いてください。'),
        h('button', { class: 'btn', onclick: () => location.reload() }, '再読み込み'))));
    return;
  }
  // 確認用プレビューの合言葉（設定されているときだけ）
  if (gateNeeded(data.config)) await showGate(root, data.config);
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', (e) => {
    if (current?.dirty?.()) { e.preventDefault(); e.returnValue = ''; }
  });
  await render();
  warmUpAI(); // 導入を出していても、AIの準備は裏で進める
  // 初めて開いた人への短い導入（ホームから開いたときだけ。閉じたら、ホーム画面に追加の小さな案内を一度だけ）
  if (parseHash().path === '/' && introNeeded()) {
    showIntro(data, (how) => { if (how !== 'guide') maybeShowInstallHint('intro', 600); });
  }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン対応なしで続行 */ });
  });
}

boot();
