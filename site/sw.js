// オフライン対応（海岸で電波が弱いときのため）
//
// ・キャッシュ名に「アプリ名＋公開パス＋版」を付け、同じドメインの別サイトのキャッシュには触れない
// ・削除するのは、このアプリ・この公開パスの古い版だけ
// ・画像は保存済みを先に使う。ページ・データは通信を優先するが、3秒で返らなければ保存済みを使う
// ・版（VERSION）を上げると、基本のファイルを取り直す。データや写真を差し替えたら VERSION を上げること
const VERSION = '2026.10.05-r16';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `m36shells:${SCOPE}:`;
const CACHE = PREFIX + VERSION;
const TIMEOUT_MS = 3000;

const CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/style.css',
  'assets/js/app.js',
  'assets/js/data.js',
  'assets/js/store.js',
  'assets/js/ui.js',
  'assets/js/icons.js',
  'assets/js/lib/boxreader.js',
  'assets/js/lib/camera.js',
  'assets/js/lib/image.js',
  'assets/js/lib/identify.js',
  'assets/js/lib/gate.js',
  'assets/js/lib/embed.js',
  'assets/js/lib/viewer3d.js',
  'assets/js/views/about.js',
  'assets/js/views/box.js',
  'assets/js/views/boxgrid.js',
  'assets/js/views/common.js',
  'assets/js/views/compare.js',
  'assets/js/views/detail.js',
  'assets/js/views/home.js',
  'assets/js/views/identify.js',
  'assets/js/views/list.js',
  'assets/js/views/matchcheck.js',
  'assets/js/views/parts.js',
  'assets/js/views/scan.js',
  'assets/js/views/record.js',
  'assets/js/views/guide.js',
  'assets/js/views/collect.js',
  'assets/js/lib/zip.js',
  'assets/js/lib/collectdb.js',
  'data/shells.json',
  'data/config.json',
  'assets/img/brand/hero.jpg',
  'assets/img/brand/logo-36shells.png',
  'assets/img/brand/icon-192.png',
  'assets/img/brand/pattern.svg',
  ...Array.from({ length: 36 }, (_, i) => `assets/img/shells/${String(i + 1).padStart(2, '0')}-sheet.jpg`),
];

// shells.json に登録された写真（一覧用の小さい画像と、1枚目の表示用）も保存する
async function photoList() {
  try {
    const data = await (await fetch('data/shells.json', { cache: 'reload' })).json();
    const list = new Set();
    for (const sp of data.species) {
      const [first, ...rest] = sp.photos || [];
      if (first) { list.add(first.src); if (first.thumb) list.add(first.thumb); }
      for (const p of rest) if (p.thumb) list.add(p.thumb);
    }
    return [...list];
  } catch {
    return [];
  }
}

self.addEventListener('install', (e) => {
  // 取り直しは HTTP キャッシュを通さずに行う
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    const photos = (await photoList()).filter((u) => !CORE.includes(u));
    // 写真は1枚ずつ（1枚失敗しても全体を止めない）
    await Promise.all(photos.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面から「オフラインの準備ができているか」を聞かれたとき
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'status' || !e.ports[0]) return;
  caches.open(CACHE).then(async (c) => {
    let cached = 0;
    for (const u of CORE) if (await c.match(new URL(u, self.registration.scope).href)) cached++;
    e.ports[0].postMessage({ ready: cached === CORE.length, cached, total: CORE.length, version: VERSION });
  });
});

function fromCache(req) {
  return caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }));
}

function put(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

// 通信を優先。一定時間で返らないときは保存済みを先に返し、通信の結果は次回のために保存する
function networkFirst(req, fetchReq) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => fromCache(req).then(finish), TIMEOUT_MS);
    fetchReq()
      .then((res) => { clearTimeout(timer); put(req, res); finish(res); })
      .catch(() => {
        clearTimeout(timer);
        fromCache(req).then((r) => {
          if (r) finish(r);
          else if (req.mode === 'navigate') fromCache(new Request(new URL('index.html', self.registration.scope))).then((i) => finish(i || Response.error()));
          else finish(Response.error());
        });
      });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameScope = url.origin === self.location.origin && url.pathname.startsWith(SCOPE);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameScope && !font) return; // 3D表示の部品など外部のものはブラウザに任せる

  // 画像とフォント：保存済みを先に使う
  if (font || url.pathname.includes('/assets/img/')) {
    e.respondWith(fromCache(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  // ページ・プログラム・データ：通信を優先（HTTP キャッシュは使わず確認する）
  const fetchReq = () => (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' }));
  e.respondWith(networkFirst(req, fetchReq));
});
