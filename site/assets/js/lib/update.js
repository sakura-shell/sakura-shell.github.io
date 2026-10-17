// 新しい版の知らせ（修正や新しい機能を公開したとき）
//
// ・新しい版は裏で準備される（sw.js の install）。準備ができたら「新しい版があります。更新しますか？」と聞き、
//   「更新する」を押したときだけ切り替えて、開き直す。押すまでは今の版のまま使える
// ・初めて開いたとき（まだ古い版がない）は聞かない
// ・撮影中・記録の途中・ほかの画面（お祝い・案内など）が開いているときは、終わるまで待ってから聞く
// ・「あとで」を押したら、しばらく聞かない。次に開いたとき（開いたままなら6時間あと、画面に戻ってきたとき）に、また聞く
// ・ホーム画面から開いたアプリは、閉じずに残っていることがある（とくに iPhone）。
//   画面に戻ってきたときにも、新しい版がないか確かめる（10分に1回まで）
// ・収集箱の記録・バッジ（localStorage）には触れない
import { h } from '../ui.js';

const CHECK_INTERVAL = 10 * 60 * 1000;
const ASK_AGAIN = 6 * 60 * 60 * 1000;

let reg = null;
let isBusy = () => false;
let asked = false; // 聞いた（「あとで」を含む）
let askedAt = 0;
let waitTimer = null;
let reloading = false;
let lastCheck = Date.now();

// 今動いている Service Worker が、更新を聞く仕組みに対応しているか（r23 までは、すぐに切り替わる仕組み）
function supportsPrompt(sw) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(true), 2000);
    ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(!!e.data?.prompt); };
    try { sw.postMessage({ type: 'status' }, [ch.port2]); } catch { clearTimeout(timer); resolve(true); }
  });
}

// 新しい版が待っているとき
async function onWaiting() {
  const waiting = reg?.waiting;
  const active = navigator.serviceWorker.controller;
  if (!waiting || !active || asked) return;
  // 以前の版（通信を優先して開く仕組み）から移るときは、画面はすでに新しい版で開いているので、聞かずに切り替える
  if (!(await supportsPrompt(active))) { waiting.postMessage({ type: 'skip-waiting' }); return; }
  offerWhenFree();
}

function offerWhenFree() {
  clearInterval(waitTimer);
  if (!isBusy()) { offer(); return; }
  waitTimer = setInterval(() => {
    if (asked || !reg?.waiting) { clearInterval(waitTimer); return; }
    if (!isBusy()) { clearInterval(waitTimer); offer(); }
  }, 3000);
}

function offer() {
  if (asked || !reg?.waiting) return;
  asked = true;
  askedAt = Date.now();
  const prev = document.activeElement;
  const dlg = h('dialog', { class: 'update-dlg', 'aria-labelledby': 'update-title', 'aria-describedby': 'update-text' });
  const close = () => { if (dlg.open) dlg.close(); dlg.remove(); prev?.focus?.({ preventScroll: true }); };
  const later = h('button', { class: 'btn block secondary', type: 'button', onclick: close }, 'あとで');
  const go = h('button', { class: 'btn block', type: 'button', onclick: () => apply(go, later) }, '更新する');
  dlg.append(h('div', { class: 'update-card' },
    h('h2', { id: 'update-title' }, '新しい版があります'),
    h('p', { id: 'update-text' }, '修正や新しい機能が入った版に更新します。よろしいですか？'),
    h('p', { class: 'small muted' }, '更新しても、集めた記録やバッジは消えません。'),
    h('div', { class: 'stack-sm update-actions' }, go, later)));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  go.focus({ preventScroll: true });
}

// 「更新する」：待っている新しい版に切り替えて、開き直す
function apply(go, later) {
  go.disabled = true; later.disabled = true;
  go.textContent = '更新しています…';
  reloading = true;
  const waiting = reg?.waiting;
  if (!waiting) { location.reload(); return; } // ほかの画面ですでに切り替わった
  waiting.postMessage({ type: 'skip-waiting' });
  setTimeout(() => location.reload(), 6000); // 切り替えの知らせが届かないときの予備
}

function watch(worker) {
  worker?.addEventListener('statechange', () => {
    if (worker.state === 'installed') onWaiting();
  });
}

// app.js から1回だけ呼ぶ。busy：今は聞かない方がよいとき true を返す
export function setupUpdates(registration, { busy } = {}) {
  if (!registration || reg) return;
  reg = registration;
  if (busy) isBusy = busy;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
  });
  if (reg.waiting) onWaiting();
  watch(reg.installing);
  reg.addEventListener('updatefound', () => watch(reg.installing));
  // 画面に戻ってきたときにも確かめる（ホーム画面から開いたアプリが残っていたとき）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (asked && reg.waiting && Date.now() - askedAt > ASK_AGAIN && !document.querySelector('dialog.update-dlg')) { asked = false; onWaiting(); }
    if (Date.now() - lastCheck < CHECK_INTERVAL) return;
    lastCheck = Date.now();
    reg.update().catch(() => { /* 電波がないときは、次の機会に */ });
  });
}
