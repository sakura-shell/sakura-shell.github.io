// 写真から「特徴ベクトル」を取り出す（ブラウザ内の画像認識。写真は外部に送らない）
//
// 使うもの：TensorFlow.js と MobileNet v1（幅0.50・224px）。どちらも site/vendor/ に同梱（Apache-2.0）。
// MobileNet は一般的な写真で学習済みのモデルで、最後の分類の手前（512個の数）を「写真の特徴」として使う。
// 36種類の見分けは、この特徴を使って別に学習した小さな分類器（lib/identify.js）が行う。

const VENDOR = new URL('../../../vendor/', import.meta.url);
const TF_URL = new URL('tfjs/tf.min.js', VENDOR).href;
const MODEL_URL = new URL('mobilenet_v1_0.50_224/model.json', VENDOR).href;
export const BACKBONE = 'mobilenet_v1_0.50_224';
export const DIM = 512;
const SIZE = 224;

let tfPromise = null;
let netPromise = null;

export function loadTf() {
  if (window.tf) return Promise.resolve(window.tf);
  tfPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TF_URL;
    s.onload = () => resolve(window.tf);
    s.onerror = () => { tfPromise = null; reject(new Error('tfjs')); };
    document.head.append(s);
  });
  return tfPromise;
}

export function loadBackbone() {
  netPromise ||= (async () => {
    const tf = await loadTf();
    const net = await tf.loadLayersModel(MODEL_URL);
    const layer = net.getLayer('global_average_pooling2d_1');
    const model = tf.model({ inputs: net.inputs, outputs: layer.output });
    // 最初の1回は準備に時間がかかるので、空の画像で慣らしておく
    tf.tidy(() => model.predict(tf.zeros([1, SIZE, SIZE, 3])));
    return model;
  })().catch((e) => { netPromise = null; throw e; });
  return netPromise;
}

// 写真の中の貝のまわりを正方形に切り出した canvas（背景との色の違いで大まかに探す）
export function cropSubject(source, { margin = 0.14 } = {}) {
  const w0 = source.naturalWidth || source.videoWidth || source.width;
  const h0 = source.naturalHeight || source.videoHeight || source.height;
  const s = 96 / Math.max(w0, h0);
  const w = Math.max(8, Math.round(w0 * s)), h = Math.max(8, Math.round(h0 * s));
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(source, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);
  // 外周の色の中央値＝背景
  const border = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) { const i = (y * w + x) * 4; border.push([data[i], data[i + 1], data[i + 2]]); }
  }
  const med = (arr) => arr.slice().sort((a, b) => a - b)[arr.length >> 1];
  const bg = [0, 1, 2].map((c) => med(border.map((p) => p[c])));
  const d = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    d[p] = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  }
  const thr = Math.max(30, otsu(d));
  let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[y * w + x] > thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  let cx, cy, side;
  if (n < w * h * 0.02 || (x1 - x0) > w * 0.97 && (y1 - y0) > h * 0.97) {
    // 見つからない・背景と区別できないときは、中央の正方形
    side = Math.min(w, h); cx = w / 2; cy = h / 2;
  } else {
    cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    side = Math.max(x1 - x0, y1 - y0) * (1 + margin * 2);
  }
  const out = document.createElement('canvas');
  out.width = SIZE; out.height = SIZE;
  const octx = out.getContext('2d');
  octx.fillStyle = `rgb(${bg.join(',')})`;
  octx.fillRect(0, 0, SIZE, SIZE);
  const sx = (cx - side / 2) / s, sy = (cy - side / 2) / s, ss = side / s;
  octx.drawImage(source, sx, sy, ss, ss, 0, 0, SIZE, SIZE);
  return out;
}

// 224x224 の canvas → 特徴（長さ1にそろえた512個の数）。左右反転した画像との平均を使う
export async function embedCanvas(canvas224) {
  const tf = await loadTf();
  const model = await loadBackbone();
  const v = tf.tidy(() => {
    const img = tf.browser.fromPixels(canvas224).toFloat().div(127.5).sub(1);
    const batch = tf.stack([img, img.reverse(1)]);
    const f = model.predict(batch).reshape([2, DIM]).mean(0);
    return f.div(f.norm());
  });
  const out = await v.data();
  v.dispose();
  return Float32Array.from(out);
}

export async function embed(source) {
  return embedCanvas(cropSubject(source));
}

// 複数の canvas の特徴をまとめて計算し、平均して長さ1にそろえる
export async function embedMean(canvases) {
  const tf = await loadTf();
  const model = await loadBackbone();
  const v = tf.tidy(() => {
    const imgs = canvases.map((c) => tf.browser.fromPixels(c).toFloat().div(127.5).sub(1));
    const batch = tf.stack(imgs.concat(imgs.map((t) => t.reverse(1))));
    const f = model.predict(batch).reshape([canvases.length * 2, DIM]);
    const n = f.div(f.norm('euclidean', 1, true)).mean(0);
    return n.div(n.norm());
  });
  const out = await v.data();
  v.dispose();
  return Float32Array.from(out);
}

function rotate90(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.height; c.height = canvas.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}

// 判定の工夫：切り出し方（ふつう・きつめ・ゆるめ）と向き（90度回転）を変えた4枚の平均で判定する。
// 貝の切り出しが少しずれても、結果がぶれにくくなる
export function ttaCanvases(source) {
  const main = cropSubject(source);
  return [main, cropSubject(source, { margin: 0.04 }), cropSubject(source, { margin: 0.32 }), rotate90(main)];
}

export async function embedTTA(source) {
  return embedMean(ttaCanvases(source));
}

export function otsu(values) {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return 0;
  const bins = 64;
  const hist = new Float64Array(bins);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestT = 0;
  for (let t = 0; t < bins; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = values.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; bestT = t; }
  }
  return ((bestT + 1) / bins) * max;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
