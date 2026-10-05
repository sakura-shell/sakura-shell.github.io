// 拾った貝のAI判定（ブラウザ内。写真は外部に送らない）
//
// 仕組み：
//   1. lib/embed.js で写真から特徴（512個の数）を取り出す
//   2. site/models/classifier.json（tools/train.html で学習して作る）で、36種類＋「それ以外」の確率を出す
//   3. どの種類の代表の特徴とも離れているときは「36種類以外かもしれない」とする
//
// 表示の可否は config.json の features.identify で決める：
//   "off"＝使わない / "dev"＝開発用モード（?dev=1）だけ / "preview"＝確認用プレビューで試験版として出す /
//   "public"＝一般の利用者にも出す
// "public" にするのは、別に用意した評価用の写真で正解率を確かめ、運営が決めた基準を満たしてから。
//
// identify() の結果：
//   { status: 'likely' | 'similar' | 'outside' | 'unclear', candidates: [{ no, p }], other: 0〜1 | null }
//   p は 0〜1（画面では％で表示）

import { embed, loadImage, useFallbackBackend, BACKBONE, DIM } from './embed.js';
import { isDev } from '../data.js';

const MODEL_URL = new URL('../../../models/classifier.json', import.meta.url).href;
let modelPromise = null;

export const IDENTIFIER = {
  available: false,
  reason: '学習済みのデータがまだないため、AI判定は準備中です。',
  evaluation: null,
  model: null,
};

// 使えるかどうかを調べる（分類器のファイルがあり、設定で有効なとき）
export async function initIdentifier(data) {
  const mode = data.config.features?.identify || 'off';
  // "preview"＝確認用プレビュー（config.mode が preview）のときだけ使う試験版
  if (mode === 'off' || (mode === 'dev' && !isDev()) || (mode === 'preview' && !data.preview && !isDev())) {
    IDENTIFIER.available = false;
    return IDENTIFIER;
  }
  const model = await loadModel().catch(() => null);
  if (!model) {
    IDENTIFIER.available = false;
    IDENTIFIER.reason = '学習済みのデータ（models/classifier.json）がまだないため、AI判定は準備中です。';
    return IDENTIFIER;
  }
  IDENTIFIER.available = true;
  IDENTIFIER.model = model;
  IDENTIFIER.evaluation = model.evaluation || null;
  IDENTIFIER.mode = mode;
  return IDENTIFIER;
}

export function loadModel() {
  modelPromise ||= fetch(MODEL_URL, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error('no model');
    return r.json();
  }).then((m) => {
    if (m.format !== 1 || m.backbone !== BACKBONE || m.dim !== DIM) throw new Error('model format');
    m._W = Float32Array.from(m.W);
    m._protos = Object.fromEntries(Object.entries(m.prototypes).map(([k, v]) => [k, Float32Array.from(v)]));
    return m;
  }).catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}

// 特徴 → 各ラベルの確率
export function predictFromFeature(model, x) {
  const C = model.labels.length;
  const logits = new Float32Array(C);
  for (let c = 0; c < C; c++) {
    let s = model.b[c];
    for (let d = 0; d < model.dim; d++) s += x[d] * model._W[d * C + c];
    logits[c] = s / (model.temperature || 1);
  }
  const m = Math.max(...logits);
  let z = 0;
  const p = logits.map((l) => { const e = Math.exp(l - m); z += e; return e; });
  return Array.from(p, (v) => v / z);
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// 判定の結果を決める（しきい値は classifier.json の decision で変えられる）
export function decide(model, probs, x) {
  const rule = { likely: 0.6, margin: 0.2, similar: 0.5, ...(model.decision || {}) };
  const ranked = model.labels.map((label, i) => ({ label, p: probs[i] })).sort((a, b) => b.p - a.p);
  const shells = ranked.filter((r) => r.label !== 'other').map((r) => ({ no: Number(r.label), p: r.p }));
  const other = model.labels.includes('other') ? probs[model.labels.indexOf('other')] : null;
  // いちばん近い種類の代表との近さ
  let maxSim = -1;
  for (const [label, proto] of Object.entries(model._protos)) {
    if (label !== 'other') maxSim = Math.max(maxSim, cosine(x, proto));
  }
  const far = model.openSet?.minSimilarity != null && maxSim < model.openSet.minSimilarity;
  const top = shells[0], second = shells[1] || { p: 0 };
  let status;
  if (ranked[0].label === 'other' || far) status = 'outside';
  else if (top.p >= rule.likely && top.p - second.p >= rule.margin) status = 'likely';
  else if (shells.slice(0, 3).reduce((s, r) => s + r.p, 0) >= rule.similar) status = 'similar';
  else status = 'unclear';
  return { status, candidates: shells.slice(0, 5), all: shells, other, similarity: maxSim };
}

// 撮った写真（最大3枚）→ 判定。複数枚のときは特徴を平均する
export async function identify(photos) {
  if (!IDENTIFIER.available || !photos.length) return { status: 'unavailable' };
  const model = IDENTIFIER.model;
  const feats = [];
  for (const p of photos) {
    const img = await loadImage(p.src);
    // 「判定の工夫（4枚の平均）」は 2026-10-05 の比較で効果がなかったため、1枚で判定する（スマホでの待ち時間を短く）
    let f;
    try {
      f = await embed(img);
      if (!f.every(Number.isFinite)) throw new Error('nan');
    } catch (e) {
      // iPhone などで画像処理（WebGL）がうまく動かないときは、計算方法を切り替えてもう一度
      if (!(await useFallbackBackend())) throw e;
      f = await embed(img);
    }
    feats.push(f);
  }
  const x = new Float32Array(DIM);
  for (const f of feats) for (let d = 0; d < DIM; d++) x[d] += f[d] / feats.length;
  let n = 0;
  for (let d = 0; d < DIM; d++) n += x[d] * x[d];
  n = Math.sqrt(n) || 1;
  for (let d = 0; d < DIM; d++) x[d] /= n;
  return decide(model, predictFromFeature(model, x), x);
}
