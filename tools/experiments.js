// AI判定の精度を上げる方法を比べる実験（開発用）。tools/experiments.html から読み込み、
// tools/run_experiments.py が画面を出さない Chrome で動かす。
//
// 評価に使うのは、学習に使っていない「別の個体」の写真だけ：
//   box   … 完成見本の箱（references/box_sample.jpeg）の36マス
//   flyer … チラシに載っている箱の写真（tools/fixtures/flyer_box.jpg）の36マス（低解像度）
//   test  … training/test/ の実物写真
// 比べるもの：
//   prep（前処理）  crop＝今の切り出し／mask＝貝のまわり（背景）を灰色で塗る／maskwb＝さらに色かぶりを直す
//   feat（特徴）    last＝今の最後の層の平均／multi＝途中の層も合わせる／gem＝最後の層を強い所を重く平均
//   color（色）     貝の部分の色の分布（色相・彩度・明るさ）を特徴に足す重み（0＝足さない）
//   head（分類）    linear＝今の線形の分類器／centroid＝種類ごとの平均との近さ／knn＝いちばん近い1枚
//   aug             1枚あたりの水増しの枚数
import { loadTf, cropSubject, loadImage, otsu } from '../site/assets/js/lib/embed.js';
import { detectBox, orderClockwise, guessBoxCorners, rectify, cellRect } from '../site/assets/js/lib/boxreader.js';

const SIZE = 224;
const MODEL_URL = '../site/vendor/mobilenet_v1_0.50_224/model.json';
const log = (t) => { document.getElementById('log').textContent += `\n${t}`; };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- データ ----------
let DATA = null;
async function loadData() {
  if (DATA) return DATA;
  const shells = await (await fetch('../site/data/shells.json')).json();
  const manifest = await (await fetch('../training/manifest.json', { cache: 'no-cache' })).json();
  const train = [];
  for (const it of manifest.items) {
    try { train.push({ label: it.label, group: it.group, img: await loadImage(it.src) }); } catch { /* 読めない写真は飛ばす */ }
  }
  const evals = {
    box: await boxCells(shells, '../references/box_sample.jpeg'),
    flyer: await boxCells(shells, '../tools/fixtures/flyer_box.jpg'),
    test: [],
  };
  try {
    const t = await (await fetch('../training/test/index.json', { cache: 'no-cache' })).json();
    for (const it of t.items) evals.test.push({ label: it.label, img: await loadImage(it.src) });
  } catch { /* なし */ }
  DATA = { shells, train, evals };
  log(`学習 ${train.length}枚・見本の箱 ${evals.box.length}・チラシの箱 ${evals.flyer.length}・別の個体 ${evals.test.length}`);
  return DATA;
}

async function boxCells(shells, src) {
  const img = await loadImage(src);
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const det = detectBox(id);
  if (!det.quad) { log(`箱を見つけられません: ${src}`); return []; }
  const corners = guessBoxCorners(orderClockwise(det.quad));
  const W = 1260, H = Math.round(W / shells.box.aspect);
  const rect = rectify(id, corners, W, H);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  rc.getContext('2d').putImageData(new ImageData(rect.data, W, H), 0, 0);
  return shells.species.map((sp) => {
    const r = cellRect(rect, sp.box.row, sp.box.col, shells.box);
    const c = document.createElement('canvas'); c.width = 140; c.height = 200;
    c.getContext('2d').drawImage(rc, r.x, r.y, r.w, r.h, 0, 0, 140, 200);
    return { label: String(sp.no), img: c };
  });
}

// ---------- 前処理 ----------
// 224x224 の切り出しから、貝の部分（前景）の印を作る（外周の色＝背景との違い）
function foreground(canvas) {
  const S = canvas.width;
  const d0 = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S, S);
  const border = [];
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
    const k = (y * S + x) * 4; border.push([d0.data[k], d0.data[k + 1], d0.data[k + 2]]);
  }
  const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const bg = [0, 1, 2].map((c) => med(border.map((p) => p[c])));
  const dist = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) { const k = p * 4; dist[p] = Math.hypot(d0.data[k] - bg[0], d0.data[k + 1] - bg[1], d0.data[k + 2] - bg[2]); }
  const thr = Math.max(25, otsu(dist));
  const m = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) m[p] = dist[p] > thr ? 1 : dist[p] > thr * 0.6 ? 0.5 : 0;
  return { data: d0, mask: m };
}

function prep(canvas, mode) {
  if (mode === 'crop') return canvas;
  const S = canvas.width;
  const { data, mask } = foreground(canvas);
  const out = document.createElement('canvas'); out.width = S; out.height = S;
  const ctx = out.getContext('2d');
  const o = ctx.createImageData(S, S);
  // 色かぶりを直す：貝の部分の平均の色を灰色に寄せる（半分だけ）
  let gain = [1, 1, 1];
  if (mode === 'maskwb') {
    const sum = [0, 0, 0]; let n = 0;
    for (let p = 0; p < S * S; p++) if (mask[p] >= 1) { const k = p * 4; sum[0] += data.data[k]; sum[1] += data.data[k + 1]; sum[2] += data.data[k + 2]; n++; }
    if (n > 50) { const mean = sum.map((v) => v / n); const g = (mean[0] + mean[1] + mean[2]) / 3; gain = mean.map((v) => 0.5 + 0.5 * (g / Math.max(1, v))); }
  }
  for (let p = 0; p < S * S; p++) {
    const k = p * 4, a = mask[p];
    for (let c = 0; c < 3; c++) o.data[k + c] = Math.min(255, data.data[k + c] * gain[c]) * a + 128 * (1 - a);
    o.data[k + 3] = 255;
  }
  ctx.putImageData(o, 0, 0);
  return out;
}

// 貝の部分の色の分布（色相12×彩度3×明るさ3）
function colorHist(canvas) {
  const S = canvas.width;
  const { data, mask } = foreground(canvas);
  const h = new Float32Array(12 * 3 * 3);
  for (let p = 0; p < S * S; p++) {
    if (mask[p] < 1) continue;
    const k = p * 4;
    const r = data.data[k] / 255, g = data.data[k + 1] / 255, b = data.data[k + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    let hue = 0;
    if (dl > 1e-6) hue = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    const s = mx ? dl / mx : 0;
    const hi = Math.min(11, Math.floor(hue * 2)), si = Math.min(2, Math.floor(s * 3)), vi = Math.min(2, Math.floor(mx * 3));
    h[(hi * 3 + si) * 3 + vi]++;
  }
  let n = 0; for (const v of h) n += v * v; n = Math.sqrt(n) || 1;
  return h.map((v) => v / n);
}

// ---------- 水増し（学習用） ----------
function augment(base, rand) {
  const S = base.width;
  const { data, mask } = foreground(base);
  const fg = document.createElement('canvas'); fg.width = S; fg.height = S;
  const fctx = fg.getContext('2d');
  const o = fctx.createImageData(S, S);
  for (let p = 0; p < S * S; p++) { const k = p * 4; o.data[k] = data.data[k]; o.data[k + 1] = data.data[k + 1]; o.data[k + 2] = data.data[k + 2]; o.data[k + 3] = mask[p] * 255; }
  fctx.putImageData(o, 0, 0);
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const bgs = ['#d9c7a2', '#c9b48a', '#e8c9ae', '#f2f0ea', '#9c9c96', '#5e5a52', '#45bfe3', '#7FD2EC', '#b8d8e0', '#ffffff'];
  ctx.fillStyle = bgs[Math.floor(rand() * bgs.length)];
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2 + (rand() - 0.5) * S * 0.15, S / 2 + (rand() - 0.5) * S * 0.15);
  ctx.rotate(rand() * Math.PI * 2);
  const sc = 0.7 + rand() * 0.45;
  ctx.scale(rand() < 0.5 ? -sc : sc, sc);
  const blur = rand() < 0.3 ? rand() * 1.4 : 0;
  ctx.filter = `brightness(${0.7 + rand() * 0.6}) contrast(${0.8 + rand() * 0.45}) saturate(${0.75 + rand() * 0.55}) hue-rotate(${Math.round((rand() - 0.5) * 16)}deg)${blur ? ` blur(${blur.toFixed(2)}px)` : ''}`;
  if (rand() < 0.6) { ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 6 + rand() * 10; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3; }
  ctx.drawImage(fg, -S / 2, -S / 2);
  ctx.restore();
  return c;
}

// ---------- 特徴 ----------
let NET = null;
const FEAT_LAYERS = { last: ['conv_pw_13_relu'], multi: ['conv_pw_11_relu', 'conv_pw_12_relu', 'conv_pw_13_relu'], gem: ['conv_pw_13_relu'], mid: ['conv_pw_11_relu'] };
async function featureModel(kind) {
  const tf = await loadTf();
  NET ||= await tf.loadLayersModel(MODEL_URL);
  const outs = FEAT_LAYERS[kind].map((n) => NET.getLayer(n).output);
  return tf.model({ inputs: NET.inputs, outputs: outs });
}

// DINOv2-small（transformers.js・ONNX Runtime。2026-10-08 にご了承いただいた読み込み）
const TJS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.0';
let DINO = null;
async function dino() {
  if (DINO) return DINO;
  const T = await import(TJS_URL);
  T.env.allowLocalModels = false;
  const processor = await T.AutoProcessor.from_pretrained('Xenova/dinov2-small');
  const model = await T.AutoModel.from_pretrained('Xenova/dinov2-small', { dtype: 'q8', device: 'wasm' });
  DINO = { T, processor, model };
  log('DINOv2-small を読み込みました');
  return DINO;
}

function flipCanvas(c) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const ctx = o.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0);
  return o;
}

async function embedDino(canvases, kind) {
  const { T, processor, model } = await dino();
  const res = [];
  const norm = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); };
  for (let i = 0; i < canvases.length; i += 8) {
    const chunk = canvases.slice(i, i + 8);
    const imgs = chunk.concat(chunk.map(flipCanvas)).map((c) => T.RawImage.fromCanvas(c));
    const inputs = await processor(imgs);
    const out = await model(inputs);
    const hs = out.last_hidden_state; // [2n, 1+patches, 384]
    const [B, L, D] = hs.dims;
    const data = hs.data;
    const vecs = [];
    for (let b = 0; b < B; b++) {
      const cls = new Float32Array(D), mean = new Float32Array(D);
      for (let d = 0; d < D; d++) cls[d] = data[b * L * D + d];
      for (let t = 1; t < L; t++) for (let d = 0; d < D; d++) mean[d] += data[(b * L + t) * D + d] / (L - 1);
      vecs.push(kind === 'dinomean' ? Float32Array.from([...norm(cls), ...norm(mean)]) : norm(cls));
    }
    const n = chunk.length;
    for (let j = 0; j < n; j++) res.push(norm(vecs[j].map((v, d) => v + vecs[j + n][d])));
    if (i % 160 === 0) log(`DINOv2 ${i + n} / ${canvases.length}`);
  }
  return res;
}

async function embed(canvases, kind) {
  if (kind === 'dino' || kind === 'dinomean') return embedDino(canvases, kind);
  const tf = await loadTf();
  const model = await featureModel(kind);
  const res = [];
  for (let i = 0; i < canvases.length; i += 16) {
    const chunk = canvases.slice(i, i + 16);
    const vec = tf.tidy(() => {
      const imgs = chunk.map((c) => tf.browser.fromPixels(c).toFloat().div(127.5).sub(1));
      const batch = tf.stack(imgs.concat(imgs.map((t) => t.reverse(1))));
      let outs = model.predict(batch);
      if (!Array.isArray(outs)) outs = [outs];
      const parts = outs.map((o) => {
        let f;
        if (kind === 'gem') f = o.clipByValue(1e-6, 1e6).pow(3).mean([1, 2]).pow(1 / 3);
        else f = o.mean([1, 2]);
        const n = chunk.length;
        const [a, b] = tf.split(f, 2, 0);
        const m = a.add(b).div(2);
        return m.div(m.norm('euclidean', 1, true));
      });
      const cat = parts.length > 1 ? tf.concat(parts, 1) : parts[0];
      return cat.div(cat.norm('euclidean', 1, true));
    });
    const dim = vec.shape[1];
    const d = await vec.data();
    vec.dispose();
    for (let j = 0; j < chunk.length; j++) res.push(Float32Array.from(d.slice(j * dim, (j + 1) * dim)));
    await new Promise((r) => setTimeout(r, 0));
  }
  return res;
}

function withColor(feats, hists, w) {
  if (!w) return feats;
  return feats.map((f, i) => {
    const v = new Float32Array(f.length + hists[i].length);
    v.set(f); for (let k = 0; k < hists[i].length; k++) v[f.length + k] = hists[i][k] * w;
    let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n);
    return v.map((x) => x / n);
  });
}

// ---------- 分類 ----------
async function trainLinear(X, Y, C, { l2 = 1e-4, epochs = 120, weights = null } = {}) {
  const tf = await loadTf();
  const D = X[0].length;
  const xs = tf.tensor2d(X.flatMap((x) => Array.from(x)), [X.length, D]);
  const ys = tf.oneHot(tf.tensor1d(Y, 'int32'), C).toFloat();
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: C, inputShape: [D], kernelRegularizer: tf.regularizers.l2({ l2 }) }));
  model.compile({ optimizer: tf.train.adam(0.01), loss: (t, p) => tf.losses.softmaxCrossEntropy(t, p) });
  // weights：1枚ごとの重み（多い種類・多い個体の写真を軽くする）。重みの分だけ写真を選ぶ確率を変えて学習する
  let fitX = xs, fitY = ys;
  if (weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    const r = rng(7);
    const idx = [];
    for (let k = 0; k < X.length; k++) {
      let u = r() * total, j = 0;
      while (j < weights.length - 1 && u > weights[j]) { u -= weights[j]; j++; }
      idx.push(j);
    }
    const it = tf.tensor1d(idx, 'int32');
    fitX = tf.gather(xs, it); fitY = tf.gather(ys, it); it.dispose();
  }
  await model.fit(fitX, fitY, { epochs, batchSize: 64, shuffle: true, verbose: 0, yieldEvery: 'never' });
  if (weights) { fitX.dispose(); fitY.dispose(); }
  const [k, b] = model.getWeights();
  const W = await k.array(), B = await b.array();
  xs.dispose(); ys.dispose(); model.dispose();
  return (x) => { const s = new Float32Array(C); for (let c = 0; c < C; c++) { let v = B[c]; for (let d = 0; d < D; d++) v += x[d] * W[d][c]; s[c] = v; } return s; };
}

function centroidScorer(X, Y, C) {
  const D = X[0].length;
  const P = Array.from({ length: C }, () => new Float32Array(D));
  X.forEach((x, i) => { for (let d = 0; d < D; d++) P[Y[i]][d] += x[d]; });
  P.forEach((p) => { let n = 0; for (const v of p) n += v * v; n = Math.sqrt(n) || 1; for (let d = 0; d < D; d++) p[d] /= n; });
  return (x) => P.map((p) => { let s = 0; for (let d = 0; d < D; d++) s += p[d] * x[d]; return s; });
}

function knnScorer(X, Y, C) {
  return (x) => {
    const s = new Float32Array(C).fill(-9);
    X.forEach((t, i) => { let v = 0; for (let d = 0; d < t.length; d++) v += t[d] * x[d]; if (v > s[Y[i]]) s[Y[i]] = v; });
    return s;
  };
}

function score(scorer, samples, labels) {
  let t1 = 0, t3 = 0, t5 = 0;
  const ranks = [];
  for (const s of samples) {
    const sc = scorer(s.x);
    const target = sc[labels.indexOf(s.label)];
    const rank = 1 + Array.from(sc).filter((v) => v > target).length;
    ranks.push(rank);
    if (rank === 1) t1++; if (rank <= 3) t3++; if (rank <= 5) t5++;
  }
  const n = samples.length || 1;
  return { n: samples.length, top1: +(100 * t1 / n).toFixed(1), top3: +(100 * t3 / n).toFixed(1), top5: +(100 * t5 / n).toFixed(1), ranks };
}

// ---------- 実験の本体 ----------
const CACHE = new Map(); // 同じ前処理・特徴・水増しの特徴は使い回す

async function features({ prep: pm, feat, aug, seed = 1, add }) {
  const addAug = !!(add && add.length);
  const key = JSON.stringify({ pm, feat, aug, seed, addAug });
  if (CACHE.has(key)) return CACHE.get(key);
  const { train, evals } = await loadData();
  const rand = rng(20260930 + seed);
  const tCanv = [], tLab = [], tGroup = [];
  for (const it of train) {
    const base = cropSubject(it.img);
    tCanv.push(base); tLab.push(it.label); tGroup.push(it.group);
    for (let k = 0; k < aug; k++) { tCanv.push(augment(base, rand)); tLab.push(it.label); tGroup.push(it.group); }
  }
  const tPrep = tCanv.map((c) => prep(c, pm));
  const X = await embed(tPrep, feat);
  const H = tCanv.map((c) => colorHist(c));
  const E = {};
  for (const [name, list] of Object.entries(evals)) {
    const canv = list.map((s) => cropSubject(s.img));
    const xs = await embed(canv.map((c) => prep(c, pm)), feat);
    E[name] = list.map((s, i) => ({ label: s.label, x: xs[i], h: colorHist(canv[i]) }));
  }
  // 評価用の一組を学習に足すとき用：水増しした特徴（学習用と同じ枚数）
  const Eaug = {};
  if (addAug) {
    for (const [name, list] of Object.entries(evals)) {
      if (name === 'test') continue;
      const canv = [], meta = [];
      for (const s of list) {
        const base = cropSubject(s.img);
        canv.push(base); meta.push(s.label);
        for (let k = 0; k < aug; k++) { canv.push(augment(base, rand)); meta.push(s.label); }
      }
      const xs = await embed(canv.map((c) => prep(c, pm)), feat);
      Eaug[name] = meta.map((label, i) => ({ label, x: xs[i], h: colorHist(canv[i]) }));
    }
  }
  const out = { X, H, labels: tLab, groups: tGroup, E, Eaug };
  CACHE.set(key, out);
  return out;
}

window.runExperiment = async (cfg) => {
  const t0 = performance.now();
  const f = await features(cfg);
  const labels = [...new Set(f.labels)].sort((a, b) => (a === 'other') - (b === 'other') || Number(a) - Number(b));
  let Y = f.labels.map((l) => labels.indexOf(l));
  let X = withColor(f.X, f.H, cfg.color || 0);
  // 別の個体を学習に足したら、どれだけ上がるかの試算：評価用の一組（例：見本の箱）を学習に加え、残りで評価する
  const addSets = cfg.add || [];
  for (const name of addSets) {
    const extra = f.Eaug?.[name] || f.E[name];
    X = X.concat(withColor(extra.map((s) => s.x), extra.map((s) => s.h), cfg.color || 0));
    Y = Y.concat(extra.map((s) => labels.indexOf(s.label)));
  }
  // balance: 'class'＝種類ごとに同じ重み／'group'＝個体（写真のまとまり）ごとに同じ重みで、さらに種類ごとにそろえる
  let weights = null;
  if (cfg.balance) {
    const groups = f.groups.concat(Array(Y.length - f.groups.length).fill('extra'));
    const nClass = {}, nGroup = {}, groupsOfClass = {};
    Y.forEach((y, i) => { nClass[y] = (nClass[y] || 0) + 1; const g = `${y}|${groups[i]}`; nGroup[g] = (nGroup[g] || 0) + 1; (groupsOfClass[y] ||= new Set()).add(g); });
    weights = Y.map((y, i) => cfg.balance === 'class' ? 1 / nClass[y] : 1 / (nGroup[`${y}|${groups[i]}`] * groupsOfClass[y].size));
  }
  let scorer;
  if (cfg.head === 'centroid') scorer = centroidScorer(X, Y, labels.length);
  else if (cfg.head === 'knn') scorer = knnScorer(X, Y, labels.length);
  else scorer = await trainLinear(X, Y, labels.length, { l2: cfg.l2 ?? 1e-4, epochs: cfg.epochs ?? 120, weights });
  const result = { cfg };
  let all = [];
  for (const [name, list] of Object.entries(f.E)) {
    if (addSets.includes(name)) continue;
    const samples = withColor(list.map((s) => s.x), list.map((s) => s.h), cfg.color || 0).map((x, i) => ({ label: list[i].label, x }));
    const r = score(scorer, samples, labels);
    result[name] = { n: r.n, top1: r.top1, top3: r.top3, top5: r.top5 };
    if (name !== 'test') all = all.concat(r.ranks);
    if (cfg.ranks) result[`${name}Ranks`] = r.ranks;
  }
  const n = all.length || 1;
  result.both = { n: all.length, top1: +(100 * all.filter((r) => r === 1).length / n).toFixed(1), top3: +(100 * all.filter((r) => r <= 3).length / n).toFixed(1), top5: +(100 * all.filter((r) => r <= 5).length / n).toFixed(1) };
  result.sec = Math.round((performance.now() - t0) / 1000);
  return result;
};

window.ready = (async () => { await loadTf(); await loadData(); return true; })();
