import { h } from '../ui.js';
import { scanAvailable, isDev } from '../data.js';
import { page } from './common.js';
import { installSection } from '../lib/install.js';

export function render(ctx) {
  const { data } = ctx;
  const cfg = data.config;
  const models = data.species.filter((s) => s.model?.status === 'confirmed').length;
  // AI判定を使えるか（判定の画面を開く前でも、設定から分かるようにする）
  const idMode = cfg.features?.identify || 'off';
  const aiShown = idMode === 'public' || (idMode === 'preview' && (data.preview || isDev())) || (idMode === 'dev' && isDev());
  const ul = (...items) => h('ul', { class: 'small plain-list' }, items.filter(Boolean).map((t) => h('li', null, t)));
  const operator = cfg.operator?.status === 'confirmed' ? cfg.operator.name : null;
  const contact = cfg.contact?.status === 'confirmed' ? cfg.contact.text : null;
  const offline = h('span', null, '確認中…');
  checkOffline(offline);

  return page(ctx, { title: 'このサイトについて', back: '#/' },
    h('div', { class: 'stack' },
      h('section', { class: 'card stack-sm' },
        h('h2', null, '三十六歌仙貝のデジタルガイド'),
        h('p', { class: 'small' }, '増穂浦海岸で36種類の貝を集める「MASUHOGAURA 36 shells Collection」のための道具です。実物のコレクションBOXと一緒に使います。'),
        h('dl', { class: 'kv small' },
          h('dt', null, 'サイトの運営'), h('dd', null, operator || (data.preview ? '（確認中）' : '―')),
          contact || data.preview ? h('dt', null, 'イベント・サイトのお問い合わせ') : null,
          contact || data.preview ? h('dd', null, contact || '（確認中）', cfg.contact?.status === 'confirmed' && cfg.contact.tel ? h('a', { class: 'tel block', href: `tel:${cfg.contact.tel.replace(/-/g, '')}` }, '電話をかける') : null) : null,
          h('dt', null, '内容の更新日'), h('dd', null, cfg.contentUpdated),
          h('dt', null, '版'), h('dd', null, cfg.appVersion))),
      h('section', { class: 'card stack-sm' },
        h('h3', { class: 'section-title' }, '収集箱の記録について'),
        ul('記録はこの端末のこのブラウザの中だけに保存します。ログインや登録はありません。ほかの端末・ほかのブラウザとは同期しません。',
          'ブラウザのデータを消したとき、別の端末・別のブラウザでは記録が残りません。実物の箱を見ながら、いつでも記録し直せます。',
          '保存できない環境では「この画面を開いている間だけ使う」を選べます（閉じると消えます）。',
          '記録は目安です。実物の箱を確かめてください。')),
      h('section', { class: 'card stack-sm' },
        h('h3', { class: 'section-title' }, '写真と通信について'),
        ul('撮った写真は、この端末の中だけで使います。どこにも送信しません。',
          'ページを開くときは、このサイトのファイルを読み込みます。文字の表示に Google Fonts を使います（写真は含みません）。',
          models ? '3D表示を開いたときだけ、表示用の部品を jsDelivr から読み込みます（写真は含みません）。' : null,
          'アクセス解析・広告・位置情報の取得はしていません。')),
      h('section', { class: 'card stack-sm' },
        h('h3', { class: 'section-title' }, 'オフラインで使うには'),
        h('p', { class: 'small' }, '一度、電波のある場所でこのサイトを開くと、基本の画面・データ・写真（AI判定を使えるときは、その準備のファイルも）が端末に保存され、電波が弱くても使えるようになります。'),
        h('p', { class: 'small' }, 'この端末の準備：', offline)),
      installSection(data),
      h('section', { class: 'card stack-sm' },
        h('h3', { class: 'section-title' }, '写真と情報について'),
        ul('番号・名前・箱の位置は、36種類一覧の資料にもとづいています。',
          '一般公開では、確認できた情報と写真だけを表示します。',
          data.preview ? 'この確認用プレビューでは、確認中の情報も「照合待ち」と付けて表示しています。' : null)),
      (() => {
        // まだ使えない機能（なければ見出しごと出さない）
        const items = [
          aiShown ? null : '貝の自動判定（撮った写真と図鑑を見比べて探せます）',
          scanAvailable(data) ? null : '収集箱を撮って自動で読み取る機能（試験中。手で記録できます）',
          cfg.features?.model3d && !models ? '3D表示・実物大AR' : null,
        ].filter(Boolean);
        return items.length ? h('section', { class: 'card stack-sm' }, h('h3', { class: 'section-title' }, 'まだ使えない機能'), ul(...items)) : null;
      })(),
    ));
}

// Service Worker に、基本のファイルの保存がすんだかを聞く
async function checkOffline(el) {
  const set = (t) => { el.textContent = t; };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sw = reg?.active;
    if (!sw) { set('未準備（電波のある場所で開き直してください）'); return; }
    const res = await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('timeout')), 3000);
      ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      sw.postMessage({ type: 'status' }, [ch.port2]);
    });
    set(res.ready ? `準備できています${res.ai ? '（AI判定も使えます）' : ''}` : `準備中（${res.cached} / ${res.total}）。電波のある場所でしばらく開いたままにしてください`);
  } catch {
    set('確認できませんでした');
  }
}
