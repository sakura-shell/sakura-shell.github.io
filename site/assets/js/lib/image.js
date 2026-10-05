// 写真ファイルの読み込み（端末内だけで処理。外部へは送らない）

export const MAX_FILE_BYTES = 40 * 1024 * 1024;

export class ImageLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// File/Blob → 長辺 maxSide 以下の canvas。スマホの向き情報（EXIF）はブラウザが反映する
export async function fileToCanvas(file, maxSide = 1600) {
  if (!file) throw new ImageLoadError('none', '写真が選ばれていません。');
  if (file.type && !file.type.startsWith('image/')) {
    throw new ImageLoadError('type', '写真（画像ファイル）を選んでください。');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageLoadError('size', '写真の容量が大きすぎます（40MBまで）。');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      const heic = /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
      i.onerror = () => reject(new ImageLoadError('decode', heic
        ? 'このブラウザでは HEIC 形式の写真を読み込めません。カメラで撮り直すか、JPEG の写真を選んでください。'
        : 'この写真は読み込めませんでした。別の写真を選ぶか、撮り直してください。'));
      i.src = url;
    });
    return drawScaled(img, img.naturalWidth, img.naturalHeight, maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawScaled(source, w, h, maxSide) {
  if (!w || !h) throw new ImageLoadError('decode', 'この写真は読み込めませんでした。');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale);
  cv.height = Math.round(h * scale);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, cv.width, cv.height);
  return cv;
}

export function canvasToDataURL(cv, maxSide = 900, quality = 0.82) {
  const scale = Math.min(1, maxSide / Math.max(cv.width, cv.height));
  if (scale === 1) return cv.toDataURL('image/jpeg', quality);
  return drawScaled(cv, cv.width, cv.height, maxSide).toDataURL('image/jpeg', quality);
}

// 隠れた <input type=file> で写真を選ぶ。capture=true ならカメラを直接開く（対応端末のみ）
export function pickImageFile({ capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let settled = false;
    const finish = (f) => { if (settled) return; settled = true; input.remove(); resolve(f); };
    input.addEventListener('change', () => finish(input.files?.[0] || null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}
