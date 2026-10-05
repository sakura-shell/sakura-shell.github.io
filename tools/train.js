// AI判定の学習と評価（開発用）。tools/train.html から読み込む
import { loadTf, loadBackbone, cropSubject, loadImage, otsu, BACKBONE, DIM } from '../site/assets/js/lib/embed.js';
import { predictFromFeature, decide } from '../site/assets/js/lib/identify.js';
import { detectBox, orderClockwise, guessBoxCorners, rectify, cellRect } from '../site/assets/js/lib/boxreader.js';

const $ = (id) => document.getElementById(id);
const logEl = $('log');
const log = (t) => { logEl.textContent += `\n${t}`; };
let exported = null;

// 再現できる乱数
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const BACKGROUNDS = ['#d9c7a2', '#c9b48a', '#e8c9ae', '#f2f0ea', '#9c9c96', '#5e5a52', '#45bfe3', '#b8d8e0', '#ffffff'];

// 貝の部分だけを取り出して、背景・向き・大きさ・明るさを変えた画像を作る
function augment(base, rand) {
  const S = base.width;
  const ctx0 = base.getContext('2d', { willReadFrequently: true });
  const src = ctx0.getImageData(0, 0, S, S);
  // 背景（外周の色）と違う画素＝貝
  const border = [];
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
    const k = (y * S + x) * 4; border.push([src.data[k], src.data[k + 1], src.data[k + 2]]);
  }
  const med = (a) => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const bg = [0, 1, 2].map((c) => med(border.map((p) => p[c])));
  const d = new Float32Array(S * S);
  for (let p = 0; p < S * S; p++) { const k = p * 4; d[p] = Math.hypot(src.data[k] - bg[0], src.data[k + 1] - bg[1], src.data[k + 2] - bg[2]); }
  const thr = Math.max(25, otsu(d));
  const fg = document.createElement('canvas'); fg.width = S; fg.height = S;
  const fctx = fg.getContext('2d');
  const out = fctx.createImageData(S, S);
  for (let p = 0; p < S * S; p++) {
    const k = p * 4;
    out.data[k] = src.data[k]; out.data[k + 1] = src.data[k + 1]; out.data[k + 2] = src.data[k + 2];
    out.data[k + 3] = d[p] > thr ? 255 : d[p] > thr * 0.6 ? 128 : 0;
  }
  fctx.putImageData(out, 0, 0);

  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = BACKGROUNDS[Math.floor(rand() * BACKGROUNDS.length)];
  ctx.fillRect(0, 0, S, S);
  // ざらつき（砂や手のひらの質感の代わり）
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${rand() * 0.12})`;
    ctx.fillRect(rand() * S, rand() * S, 2 + rand() * 4, 2 + rand() * 4);
  }
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(rand() * Math.PI * 2);
  const sc = 0.75 + rand() * 0.4;
  ctx.scale(rand() < 0.5 ? -sc : sc, sc);
  ctx.filter = `brightness(${0.8 + rand() * 0.4}) contrast(${0.85 + rand() * 0.3}) saturate(${0.8 + rand() * 0.4})`;
  ctx.drawImage(fg, -S / 2, -S / 2);
  ctx.restore();
  return c;
}

// 画像（canvas）の配列 → 特徴の配列（左右反転との平均、長さ1にそろえる）
async function embedAll(canvases, label) {
  const tf = await loadTf();
  const model = await loadBackbone();
  const out = [];
  for (let i = 0; i < canvases.length; i += 16) {
    const chunk = canvases.slice(i, i + 16);
    const arr = tf.tidy(() => {
      const imgs = chunk.map((c) => tf.browser.fromPixels(c).toFloat().div(127.5).sub(1));
      const batch = tf.stack(imgs.concat(imgs.map((t) => t.reverse(1))));
      const f = model.predict(batch).reshape([chunk.length * 2, DIM]);
      const [a, b] = tf.split(f, 2, 0);
      const m = a.add(b).div(2);
      return m.div(m.norm('euclidean', 1, true));
    });
    const data = await arr.data();
    arr.dispose();
    for (let j = 0; j < chunk.length; j++) out.push(Float32Array.from(data.slice(j * DIM, (j + 1) * DIM)));
    if (label) logEl.textContent = logEl.textContent.replace(/\n特徴を計算中.*$/, '') + `\n特徴を計算中（${label}）${Math.min(i + 16, canvases.length)} / ${canvases.length}`;
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

// 多クラスのロジスティック回帰（線形の分類器）を学習する
async function trainLinear(X, Y, labels, epochs = 120) {
  const tf = await loadTf();
  const C = labels.length;
  const xs = tf.tensor2d(X.flatMap((x) => Array.from(x)), [X.length, DIM]);
  const ys = tf.oneHot(tf.tensor1d(Y, 'int32'), C).toFloat();
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: C, inputShape: [DIM], kernelRegularizer: tf.regularizers.l2({ l2: 1e-4 }) }));
  model.compile({ optimizer: tf.train.adam(0.01), loss: (t, p) => tf.losses.softmaxCrossEntropy(t, p) });
  // yieldEvery: 'never'：画面の描画を待たない（画面が隠れていても止まらない）
  await model.fit(xs, ys, { epochs, batchSize: 64, shuffle: true, verbose: 0, yieldEvery: 'never' });
  const [kernel, bias] = model.getWeights();
  const W = Array.from(await kernel.data());
  const b = Array.from(await bias.data());
  xs.dispose(); ys.dispose(); model.dispose();
  return { W, b };
}

function prototypes(X, Y, labels) {
  const P = {};
  labels.forEach((l, c) => {
    const v = new Float32Array(DIM);
    let n = 0;
    X.forEach((x, i) => { if (Y[i] === c) { for (let d = 0; d < DIM; d++) v[d] += x[d]; n++; } });
    let norm = 0;
    for (let d = 0; d < DIM; d++) norm += v[d] * v[d];
    norm = Math.sqrt(norm) || 1;
    P[l] = Array.from(v, (t) => +(t / norm).toFixed(5));
  });
  return P;
}

function makeModel(weights, protos, labels, temperature, openSet) {
  const m = {
    format: 1, backbone: BACKBONE, dim: DIM, labels,
    W: weights.W.map((v) => +v.toFixed(5)), b: weights.b.map((v) => +v.toFixed(5)),
    temperature, prototypes: protos, openSet,
    decision: { likely: 0.6, margin: 0.2, similar: 0.5 },
  };
  m._W = Float32Array.from(m.W);
  m._protos = Object.fromEntries(Object.entries(protos).map(([k, v]) => [k, Float32Array.from(v)]));
  return m;
}

const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// 評価：正解の順位、正解の確率、1位の確率、判定の内訳
function evaluate(model, samples) {
  const rows = samples.map((s) => {
    const probs = predictFromFeature(model, s.x);
    const res = decide(model, probs, s.x);
    const ranked = model.labels.map((l, i) => ({ l, p: probs[i] })).sort((a, b) => b.p - a.p);
    const rank = ranked.findIndex((r) => r.l === s.label) + 1;
    return { ...s, rank, pTrue: probs[model.labels.indexOf(s.label)], top: ranked[0], status: res.status };
  });
  const n = rows.length;
  const pct = (k) => Math.round((k / (n || 1)) * 1000) / 10;
  const mean = (a) => Math.round((a.reduce((x, y) => x + y, 0) / (a.length || 1)) * 1000) / 10;
  const status = {};
  rows.forEach((r) => { status[r.status] = (status[r.status] || 0) + 1; });
  const correctLikely = rows.filter((r) => r.status === 'likely' && r.rank === 1).length;
  const likely = rows.filter((r) => r.status === 'likely').length;
  return {
    rows,
    summary: {
      n,
      top1: pct(rows.filter((r) => r.rank === 1).length),
      top3: pct(rows.filter((r) => r.rank <= 3).length),
      top5: pct(rows.filter((r) => r.rank <= 5).length),
      meanTrueP: mean(rows.map((r) => r.pTrue)),
      meanTopP: mean(rows.map((r) => r.top.p)),
      status,
      likelyPrecision: likely ? Math.round((correctLikely / likely) * 1000) / 10 : null,
    },
  };
}

function tableOf(title, ev) {
  const s = ev.summary;
  const wrap = document.createElement('section');
  wrap.innerHTML = `<h2>${title}</h2><p>${s.n}枚：1位で正解 ${s.top1}%・3位以内 ${s.top3}%・5位以内 ${s.top5}%・正解の確率の平均 ${s.meanTrueP}%・1位の確率の平均 ${s.meanTopP}%・判定の内訳 ${JSON.stringify(s.status)}${s.likelyPrecision != null ? `・「可能性が高い」と出たときの正解率 ${s.likelyPrecision}%` : ''}</p>`;
  const t = document.createElement('table');
  t.innerHTML = '<tr><th>正解</th><th>画像</th><th>正解の順位</th><th>正解の確率</th><th>1位（確率）</th><th>判定</th></tr>';
  for (const r of ev.rows.slice(0, 80)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.label}</td><td></td><td class="${r.rank === 1 ? 'ok' : r.rank > 5 ? 'ng' : ''}">${r.rank}</td><td>${Math.round(r.pTrue * 100)}%</td><td>${r.top.l}（${Math.round(r.top.p * 100)}%）</td><td>${r.status}</td>`;
    if (r.canvas) { const c = r.canvas; c.style.width = '48px'; c.style.height = '48px'; tr.children[1].append(c); }
    t.append(tr);
  }
  wrap.append(t);
  return wrap;
}

async function boxCells() {
  const data = await (await fetch('../site/data/shells.json')).json();
  const img = await loadImage('../references/box_sample.jpeg');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const corners = guessBoxCorners(orderClockwise(detectBox(id).quad));
  const W = 1260, H = Math.round(W / data.box.aspect);
  const rect = rectify(id, corners, W, H);
  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
  rc.getContext('2d').putImageData(new ImageData(rect.data, W, H), 0, 0);
  return data.species.map((sp) => {
    const r = cellRect(rect, sp.box.row, sp.box.col, data.box);
    const c = document.createElement('canvas'); c.width = 140; c.height = 200;
    c.getContext('2d').drawImage(rc, r.x, r.y, r.w, r.h, 0, 0, 140, 200);
    return { label: String(sp.no), canvas: cropSubject(c) };
  });
}

$('run').addEventListener('click', async () => {
  $('run').disabled = true;
  $('save').disabled = true;
  $('report').replaceChildren();
  logEl.textContent = '開始';
  try {
    await loadBackbone();
    log('MobileNet を読み込みました');
    const data = await (await fetch('../site/data/shells.json')).json();
    const items = [];
    if ($('useCatalog').checked) {
      for (const sp of data.species) for (const p of sp.photos) items.push({ label: String(sp.no), src: `../site/${p.src}`, group: `${sp.no}/catalog-${p.view}`, split: 'train' });
    }
    if ($('useTraining').checked) {
      const r = await fetch('../training/manifest.json', { cache: 'no-cache' });
      if (r.ok) { const m = await r.json(); items.push(...m.items); log(`学習用の写真：${m.items.length}枚`); } else log('training/manifest.json はありません（図鑑の写真だけで学習します）');
    }
    const useVal = $('useVal').checked;
    const nAug = Number($('aug').value);
    const rand = rng(20260930);
    const trainCanvases = [], trainLabels = [], valSamples = [];
    const labelSet = new Set();
    for (const it of items) {
      let img;
      try { img = await loadImage(it.src); } catch { log(`読み込めない写真: ${it.src}`); continue; }
      const base = cropSubject(img);
      labelSet.add(it.label);
      if (it.split === 'val' && useVal) valSamples.push({ label: it.label, canvas: base, group: it.group });
      else {
        trainCanvases.push(base); trainLabels.push(it.label);
        for (let k = 0; k < nAug; k++) { trainCanvases.push(augment(base, rand)); trainLabels.push(it.label); }
      }
    }
    const labels = [...labelSet].sort((a, b) => (a === 'other') - (b === 'other') || Number(a) - Number(b));
    log(`ラベル ${labels.length}種類・学習用の画像 ${trainCanvases.length}枚（水増し込み）・評価用 ${valSamples.length}枚`);
    const X = await embedAll(trainCanvases, '学習用');
    const Y = trainLabels.map((l) => labels.indexOf(l));
    const valX = valSamples.length ? await embedAll(valSamples.map((s) => s.canvas), '評価用') : [];
    valSamples.forEach((s, i) => { s.x = valX[i]; });

    // 1回目：学習用だけで学習し、評価用・見本の箱で評価する
    log('学習中（1回目：評価のため）…');
    let w1 = await trainLinear(X, Y, labels);
    const protos1 = prototypes(X, Y, labels);
    // 確率の調整（温度）：評価用の写真があれば、そこでの当てはまりが一番よい値を選ぶ
    let temperature = 1;
    if (valSamples.length) {
      let best = Infinity;
      for (const T of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]) {
        const m = makeModel(w1, protos1, labels, T, null);
        const nll = valSamples.reduce((s, v) => s - Math.log(Math.max(1e-6, predictFromFeature(m, v.x)[labels.indexOf(v.label)])), 0);
        if (nll < best) { best = nll; temperature = T; }
      }
      log(`確率の調整（温度）: ${temperature}`);
    }
    // 36種類以外の判定に使う「近さ」の下限：評価用（学習に使っていない実物の写真）と、その種類の代表との近さの下位5%。
    // 評価用の写真がないときは決められないので使わない（図鑑の写真だけから決めると、実物の写真のほとんどを「36種類以外」にしてしまう）
    let openSet = { minSimilarity: null };
    const sims = valSamples.filter((v) => v.label !== 'other').map((v) => cos(v.x, protos1[v.label])).sort((a, b) => a - b);
    // 36種類以外の貝の写真（other）がないときは決めない（同じ個体の写真だけで決めると厳しすぎ、別の個体を「36種類以外」と誤る）
    if (sims.length >= 20 && labels.includes('other')) openSet = { minSimilarity: +(sims[Math.floor(sims.length * 0.05)] * 0.97).toFixed(4) };
    log(`36種類以外の判定（近さの下限）: ${openSet.minSimilarity ?? '使わない（評価用の写真か、36種類以外の貝の写真が足りない）'}`);
    const m1 = makeModel(w1, protos1, labels, temperature, openSet);
    const evaluation = { date: new Date().toISOString(), backbone: BACKBONE, labels: labels.length, trainImages: items.filter((i) => i.split !== 'val' || !useVal).length, augment: nAug, val: null, box: null };
    if (valSamples.length) {
      const ev = evaluate(m1, valSamples);
      evaluation.val = ev.summary;
      $('report').append(tableOf('評価用に分けた写真（学習に使っていない個体）', ev));
    }

    // 2回目：評価用も含めてすべてで学習し、サイト用に保存する
    let Xall = X, Yall = Y;
    if (valSamples.length) {
      Xall = X.concat(valSamples.map((v) => v.x));
      Yall = Y.concat(valSamples.map((v) => labels.indexOf(v.label)));
      log('学習中（2回目：すべての写真で）…');
      w1 = await trainLinear(Xall, Yall, labels);
    }
    const protos = prototypes(Xall, Yall, labels);
    const final = makeModel(w1, protos, labels, temperature, openSet);

    if ($('useBox').checked) {
      log('見本の箱の写真で評価中…');
      const cells = await boxCells();
      const cx = await embedAll(cells.map((c) => c.canvas), '見本の箱');
      cells.forEach((c, i) => { c.x = cx[i]; });
      const ev = evaluate(final, cells);
      evaluation.box = ev.summary;
      $('report').append(tableOf('完成見本の箱の写真（各マスの実物の貝。学習に使っていない）', ev));
    }
    const { _W, _protos, ...json } = final;
    json.evaluation = evaluation;
    json.samples = Object.fromEntries(labels.map((l) => [l, items.filter((i) => i.label === l).length]));
    json.trainedAt = evaluation.date;
    exported = json;
    log(`完了。評価用：${evaluation.val ? `1位で正解 ${evaluation.val.top1}%（${evaluation.val.n}枚）` : 'なし'}・見本の箱：${evaluation.box ? `1位で正解 ${evaluation.box.top1}%・5位以内 ${evaluation.box.top5}%（${evaluation.box.n}枚）` : 'なし'}`);
    $('save').disabled = false;
    window.__train = { evaluation };
  } catch (e) {
    console.error(e);
    log(`エラー: ${e.message}`);
  } finally {
    $('run').disabled = false;
  }
});

$('save').addEventListener('click', async () => {
  if (!exported) return;
  const body = JSON.stringify(exported);
  const r = await fetch('/__save/classifier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const r2 = await fetch('/__save/evaluation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exported.evaluation, null, 1) });
  log(r.ok && r2.ok ? `保存しました：site/models/classifier.json（${Math.round(body.length / 1024)}KB）と docs/ai-evaluation.json` : '保存できませんでした（tools/serve.py で開いていますか？）');
});
