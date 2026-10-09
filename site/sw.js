// オフライン対応（海岸で電波が弱いときのため）
//
// ・キャッシュ名に「アプリ名＋公開パス＋版」を付け、同じドメインの別サイトのキャッシュには触れない
// ・削除するのは、このアプリ・この公開パスの古い版だけ
// ・画像は保存済みを先に使う。ページ・データは通信を優先するが、3秒で返らなければ保存済みを使う
// ・版（VERSION）を上げると、基本のファイルを取り直す。データや写真を差し替えたら VERSION を上げること
// ・AI判定のファイル（TensorFlow.js・MobileNet・分類器 約7MB）は、基本のファイルとは別の保管場所（AI_CACHE）に、
//   画面が先回りの準備で読み込んだときに保存する（install では取らない。容量不足・通信失敗でも基本の画面は使える）。
//   TensorFlow.js と MobileNet は中身が変わらないので、保存済みを先に使う（毎回の確認をしない）。
//   入れ替えるときは AI_VERSION を上げる。分類器（models/classifier.json）は保存済みを先に使い、裏で新しいものに更新する
// ・収集箱の記録（localStorage）には触れない
const VERSION = '2026.10.09-r21';
const AI_VERSION = 'tfjs-mobilenet050-1';
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `m36shells:${SCOPE}:`;
const CACHE = PREFIX + VERSION;
const AI_CACHE = `${PREFIX}ai:${AI_VERSION}`;
const AI_FILES = /\/vendor\/(tfjs|mobilenet_v1_0\.50_224)\//;
const CLASSIFIER = /\/models\/classifier\.json$/;
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
  'assets/js/lib/install.js',
  'assets/js/lib/intro.js',
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
  // 取り直しは HTTP キャッシュを通さずに行う。install では基本のファイルだけ（図鑑の写真は後で）
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

// 図鑑の写真（約5MB）の保存。画面から頼まれたときに、まだ保存していない写真だけ取る。
// 初めて開いたときに AI のファイルと回線を取り合わないよう、画面は AI の先読みが終わってから頼む（app.js）
let photosRunning = null;
function cachePhotos() {
  photosRunning ||= (async () => {
    const c = await caches.open(CACHE);
    const photos = (await photoList()).filter((u) => !CORE.includes(u));
    // 4枚ずつ（1枚失敗しても全体を止めない）
    for (let i = 0; i < photos.length; i += 4) {
      await Promise.all(photos.slice(i, i + 4).map(async (u) => {
        if (await c.match(new URL(u, self.registration.scope).href)) return;
        await c.add(new Request(u, { cache: 'reload' })).catch(() => {});
      }));
    }
  })().finally(() => { photosRunning = null; });
  return photosRunning;
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // このアプリの古い版だけを消す（今の AI_CACHE は版をまたいで使う）
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== AI_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'cache-photos') e.waitUntil(cachePhotos());
});

// 画面から「AI判定のファイルを保存して」と頼まれたとき（先回りの準備で読み込んだファイル）。
// このアプリの AI のファイルだけを受け付け、まだ保存していないものだけ取る（ブラウザに残っていれば通信しない）
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-ai' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(AI_CACHE).then(async (c) => {
    for (const u of e.data.urls.slice(0, 200)) {
      let url;
      try { url = new URL(u); } catch { continue; }
      if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) continue;
      if (!AI_FILES.test(url.pathname) && !CLASSIFIER.test(url.pathname)) continue;
      if (await c.match(url.href, { ignoreSearch: true })) continue;
      try {
        const res = await fetch(url.href);
        if (res.ok) await c.put(url.href, res);
      } catch { /* 通信失敗・容量不足は無視（次に開いたときにまた頼まれる） */ }
    }
  }));
});

// 画面から「オフラインの準備ができているか」を聞かれたとき
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'status' || !e.ports[0]) return;
  caches.open(CACHE).then(async (c) => {
    let cached = 0;
    for (const u of CORE) if (await c.match(new URL(u, self.registration.scope).href)) cached++;
    // AI判定のファイル（先回りの準備で保存したもの）が揃っているか
    const ai = await caches.open(AI_CACHE).then(async (a) => {
      const need = ['vendor/tfjs/tf.min.js', 'vendor/mobilenet_v1_0.50_224/model.json', 'models/classifier.json'];
      for (const u of need) if (!(await a.match(new URL(u, self.registration.scope).href, { ignoreSearch: true }))) return false;
      return true;
    }).catch(() => false);
    e.ports[0].postMessage({ ready: cached === CORE.length, cached, total: CORE.length, version: VERSION, ai });
  });
});

function fromCache(req) {
  return caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }));
}

// AI判定のファイル：保存済みを先に使う。なければ通信して保存（保存に失敗しても、そのまま使う）
function aiCacheFirst(req) {
  return caches.open(AI_CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) c.put(req, res.clone()).catch(() => {}); // 容量不足などは無視
    return res;
  })));
}

// 分類器：保存済みを先に使い、裏で新しいものを取って次回に備える
function aiStaleWhileRevalidate(e, req) {
  return caches.open(AI_CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const update = fetch(req.url, { cache: 'no-cache' }).then((res) => {
      if (res.ok) return c.put(req, res.clone()).catch(() => {}).then(() => res);
      return res;
    });
    if (hit) { e.waitUntil(update.catch(() => {})); return hit; }
    return update;
  });
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

  // AI判定のファイル
  if (sameScope && AI_FILES.test(url.pathname)) { e.respondWith(aiCacheFirst(req)); return; }
  if (sameScope && CLASSIFIER.test(url.pathname)) { e.respondWith(aiStaleWhileRevalidate(e, req)); return; }

  // 画像とフォント：保存済みを先に使う
  if (font || url.pathname.includes('/assets/img/')) {
    e.respondWith(fromCache(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  // ページ・プログラム・データ：通信を優先（HTTP キャッシュは使わず確認する）
  const fetchReq = () => (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' }));
  e.respondWith(networkFirst(req, fetchReq));
});
