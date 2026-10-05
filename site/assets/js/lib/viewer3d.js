// 3D表示・AR表示（Google <model-viewer>、Apache-2.0、無料）
// 3Dモデルがある種類でだけ、ボタンを押したときに読み込む（重い素材を最初から読まない）
//
// マスターデータの model の形式:
// "model": {
//   "src": "models/01.glb",           glTF バイナリ（必須）
//   "iosSrc": "models/01.usdz",       iPhone の AR 用（任意）
//   "style": "sakura",                色・質感を加工したモデル（任意）。画面に加工の注記を出す
//   "backSrc": "models/01-back.glb",  裏返して撮った「裏」のモデル（任意）。置いたまま撮ると下の面は写らないため、
//                                     表と裏を別のモデルにして「表／裏」で切り替える。このときカメラは上半分だけ回る
//   "unit": "m",                      モデルの単位（glTF は m）
//   "source": "2026年○月 志賀町が標本を3Dスキャン",
//   "license": "志賀町",
//   "status": "confirmed"             実物の標本に基づくと確認済みなら confirmed
// }
// "specimenSize": { "lengthMm": 42, "source": "標本を実測", "status": "confirmed" }
// AR の実物大表示は、model.status と specimenSize.status がどちらも confirmed のときだけ出す。

import { h, ic } from '../ui.js';

// 同梱した model-viewer（site/vendor/model-viewer/。BSD-3-Clause）を使う。電波が弱くても開けるように
const MV_URL = new URL('../../../vendor/model-viewer/model-viewer.min.js', import.meta.url).href;
let loading = null;

// 3D表示を出すか。確認済みのモデル、または確認用プレビューでは作成済み（照合待ち）のモデルも出す
export function hasModel(sp, data) {
  const m = sp.model;
  if (!m?.src) return false;
  return m.status === 'confirmed' || (!!data?.preview && m.status === 'transcribed');
}

export function arReady(sp) {
  return hasModel(sp) && sp.specimenSize?.status === 'confirmed';
}

function loadModelViewer() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = MV_URL;
      s.onload = () => customElements.whenDefined('model-viewer').then(resolve);
      s.onerror = () => { loading = null; reject(new Error('model-viewer')); };
      document.head.append(s);
    });
  }
  return loading;
}

const VIEWS = {
  front: { label: '表', orbit: '0deg 75deg auto' },
  back: { label: '裏', orbit: '180deg 105deg auto' },
  side: { label: '横', orbit: '90deg 90deg auto' },
};

// 表と裏が別のモデルのとき（片面ずつ）。下からは見えないので、上から斜めに見る
const SIDES = {
  front: { label: '表', orbit: '20deg 35deg auto' },
  back: { label: '裏', orbit: '20deg 35deg auto' },
};

// container に 3D ビューアを作る。戻り値: Promise<{ ok, message }>
export async function mount3D(container, sp, { onMessage } = {}) {
  container.replaceChildren(h('div', { class: 'viewer3d', style: { display: 'grid', placeItems: 'center' } }, h('div', { class: 'spinner', 'aria-label': '読み込み中' })));
  try {
    await loadModelViewer();
  } catch {
    container.replaceChildren();
    return { ok: false, message: '3D表示を読み込めませんでした。通信状態を確認するか、写真でご覧ください。' };
  }
  const mv = document.createElement('model-viewer');
  mv.setAttribute('src', sp.model.src);
  mv.setAttribute('alt', `${sp.no}番 ${sp.v.name}の3Dモデル`);
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('touch-action', 'pan-y');
  mv.setAttribute('interaction-prompt', 'none');
  mv.setAttribute('shadow-intensity', '0.6');
  const twoSided = !!sp.model.backSrc;
  const views = twoSided ? SIDES : VIEWS;
  mv.setAttribute('camera-orbit', views.front.orbit);
  if (twoSided) mv.setAttribute('max-camera-orbit', 'auto 85deg auto');
  if (arReady(sp)) {
    mv.setAttribute('ar', '');
    mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
    mv.setAttribute('ar-scale', 'fixed'); // 実寸（モデルの単位どおり）で置く
    if (sp.model.iosSrc) mv.setAttribute('ios-src', sp.model.iosSrc);
    // 標準の AR ボタンは使わず、下のボタンから起動する
    mv.append(h('span', { slot: 'ar-button', style: { display: 'none' } }));
  }
  const wrap = h('div', { class: 'viewer3d' }, mv);
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': twoSided ? '表と裏' : '向き' });
  let current = 'front';
  for (const [key, v] of Object.entries(views)) {
    seg.append(h('button', { type: 'button', 'aria-pressed': String(key === 'front'), onclick: (e) => {
      if (twoSided && key !== current) mv.setAttribute('src', key === 'back' ? sp.model.backSrc : sp.model.src);
      current = key;
      mv.cameraOrbit = v.orbit;
      mv.fieldOfView = 'auto';
      mv.jumpCameraToGoal?.();
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    } }, v.label));
  }
  const reset = h('button', { class: 'btn small soft', type: 'button', onclick: () => {
    mv.cameraOrbit = views[current].orbit;
    mv.fieldOfView = 'auto';
    mv.jumpCameraToGoal?.();
  } }, '元の大きさに戻す');

  const controls = h('div', { class: 'stack-sm' },
    h('div', { class: 'row wrap between' }, seg, reset),
    h('p', { class: 'xsmall muted' }, twoSided
      ? '裏側は「裏」に切り替えて見てください。2本の指で拡大できます。'
      : '指で回すと裏側まで見られます。2本の指で拡大できます。'),
    sp.model.style ? h('p', { class: 'xsmall muted' }, '色と質感は、見やすいようにイラスト風に加工しています。実物の色とは異なることがあります。') : null);

  const result = { ok: true };
  mv.addEventListener('error', () => {
    container.replaceChildren();
    onMessage?.('3Dモデルを読み込めませんでした。写真でご覧ください。');
  });

  if (arReady(sp)) {
    const arBtn = h('button', { class: 'btn block secondary', type: 'button' }, ic('ar'), 'ARで実物大を見る');
    const arNote = h('p', { class: 'xsmall muted' },
      `標本の大きさ（${sp.specimenSize.lengthMm}mm）をもとにした目安です。貝には個体差があり、端末によって表示の大きさがずれることがあります。`);
    arBtn.addEventListener('click', () => {
      if (!mv.canActivateAR) {
        onMessage?.('この端末ではARを使えません。3Dか写真でご覧ください。');
        return;
      }
      mv.activateAR();
    });
    mv.addEventListener('ar-status', (e) => {
      if (e.detail.status === 'failed') onMessage?.('ARを起動できませんでした。3Dか写真でご覧ください。');
    });
    controls.append(arBtn, arNote);
  }
  container.replaceChildren(wrap, controls);
  return result;
}
