// 箱の読み取り（ブラウザ内の画像処理のみ。外部送信なし）
//
// 流れ:
//   1. detectBox   … 水色の箱の範囲（四すみ）を推定する
//   2. rectify     … 四すみを使って箱を真上から見た画像に変換する
//   3. readCells   … 各マスの中央付近が「箱の底の水色」かどうかで 貝あり／空／要確認 を判定する
// 貝の種類は判定しない。番号は箱の位置から決まる。

const TAU = 360;

export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += TAU;
  }
  return [h, max ? d / max : 0, max / 255];
}

function hueDist(a, b) {
  const d = Math.abs(a - b) % TAU;
  return d > 180 ? TAU - d : d;
}

// 箱の水色（実物の箱は H≈190〜200°の水色）。彩度のしきい値は写真ごとに決める
function isBoxHue(h, v) {
  return h >= 175 && h <= 215 && v >= 0.4;
}

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
}

// 画像を縮小してから、水色の最大領域を探し、四すみを返す
export function detectBox(img) {
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const sat = new Float32Array(w * h).fill(-1);
  const sats = [];
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / scale));
      const i = (sy * img.width + sx) * 4;
      const [hh, ss, vv] = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
      if (isBoxHue(hh, vv) && ss > 0.15) {
        sat[y * w + x] = ss;
        sats.push(ss);
      }
    }
  }
  sats.sort((a, b) => a - b);
  // 写真の色味（明るさ・印刷物など）で彩度が変わるため、水色の画素の上位の彩度を基準にする
  const satThr = Math.min(0.42, Math.max(0.18, percentile(sats, 0.8) * 0.55));
  const raw = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (sat[p] >= satThr) raw[p] = 1;
  // 細い線（ふたの縁など）で箱とつながらないよう、少し削ってから領域を探す
  const R = 2;
  const mask = erode(raw, w, h, R);
  // 最大の連結領域
  const label = new Int32Array(w * h);
  let best = { id: 0, size: 0 };
  let id = 0;
  const stack = [];
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || label[p]) continue;
    id++;
    let size = 0;
    stack.push(p);
    label[p] = id;
    while (stack.length) {
      const q = stack.pop();
      size++;
      const qx = q % w;
      const qy = (q - qx) / w;
      if (qx > 0 && mask[q - 1] && !label[q - 1]) { label[q - 1] = id; stack.push(q - 1); }
      if (qx < w - 1 && mask[q + 1] && !label[q + 1]) { label[q + 1] = id; stack.push(q + 1); }
      if (qy > 0 && mask[q - w] && !label[q - w]) { label[q - w] = id; stack.push(q - w); }
      if (qy < h - 1 && mask[q + w] && !label[q + w]) { label[q + w] = id; stack.push(q + w); }
    }
    if (size > best.size) best = { id, size };
  }
  const areaRatio = best.size / (w * h);
  if (areaRatio < 0.08) return { quad: null, reason: 'not-found', areaRatio };

  // 行ごとの左右端から凸包を作り、面積最大の四角形を探す
  const pts = [];
  for (let y = 0; y < h; y++) {
    let minX = -1;
    let maxX = -1;
    for (let x = 0; x < w; x++) {
      if (label[y * w + x] === best.id) {
        if (minX < 0) minX = x;
        maxX = x;
      }
    }
    if (minX >= 0) {
      pts.push([minX, y]);
      if (maxX !== minX) pts.push([maxX + 1, y]);
    }
  }
  const hull = convexHull(pts);
  const quad = maxAreaQuad(hull);
  if (!quad) return { quad: null, reason: 'not-found', areaRatio };
  const qArea = polygonArea(quad);
  const fill = best.size / qArea; // 四角形の中に占める水色の割合
  const scaled = expandQuad(orderClockwise(quad), R).map(([x, y]) => [x / scale, y / scale]);
  // 貝や仕切りの影で水色が減るため、四角形の中の水色が4割程度あれば箱とみなす
  const ok = fill > 0.38 && qArea / (w * h) > 0.1;
  return { quad: scaled, reason: ok ? 'ok' : 'weak', areaRatio, fill };
}

function erode(src, w, h, r) {
  // 横方向→縦方向の順に最小値フィルタ
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r && v; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w || !src[y * w + xx]) v = 0;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1;
      for (let k = -r; k <= r && v; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h || !tmp[yy * w + x]) v = 0;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// 四角形を各頂点方向に d だけ広げる（削った分を戻す）
function expandQuad(q, d) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map(([x, y]) => {
    const len = Math.hypot(x - cx, y - cy) || 1;
    const k = (d * Math.SQRT2) / len;
    return [x + (x - cx) * k, y + (y - cy) * k];
  });
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// 凸包の頂点から面積最大の四角形を選ぶ（頂点数を間引いて総当たり）
function maxAreaQuad(hull) {
  let h = hull;
  if (h.length < 4) return null;
  if (h.length > 40) {
    const step = h.length / 40;
    h = Array.from({ length: 40 }, (_, i) => hull[Math.floor(i * step)]);
  }
  const n = h.length;
  let best = null;
  let bestA = -1;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [h[a], h[b], h[c], h[d]];
          const ar = polygonArea(q);
          if (ar > bestA) { bestA = ar; best = q; }
        }
  return best;
}

// 画像上で 左上→右上→右下→左下 の順に並べる
export function orderClockwise(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 順（右→下→左→上）なので、左上（x+y 最小）から始める
  let start = 0;
  let min = Infinity;
  sorted.forEach((p, i) => { if (p[0] + p[1] < min) { min = p[0] + p[1]; start = i; } });
  return [0, 1, 2, 3].map((k) => sorted[(start + k) % 4]);
}

// 箱は横長（9列）。写真の中で縦長に写っていたら、長い辺が上下に来るよう回して並べる。
// 戻り値は [箱の左上, 右上, 右下, 左下]（1番のマスは右上）。
export function guessBoxCorners(quadCW) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const top = (d(quadCW[0], quadCW[1]) + d(quadCW[3], quadCW[2])) / 2;
  const side = (d(quadCW[1], quadCW[2]) + d(quadCW[0], quadCW[3])) / 2;
  return top >= side * 0.95 ? quadCW.slice() : rotateCorners(quadCW, 1);
}

// 向きを90°回す（箱のどの角を左上とみなすかをずらす）
export function rotateCorners(c, times = 1) {
  const k = ((times % 4) + 4) % 4;
  return [0, 1, 2, 3].map((i) => c[(i + k) % 4]);
}

// 単位正方形 (0,0)(1,0)(1,1)(0,1) → 四すみ への射影変換
export function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  return [
    x1 - x0 + g * x1, x3 - x0 + h * x3, x0,
    y1 - y0 + g * y1, y3 - y0 + h * y3, y0,
    g, h, 1,
  ];
}

export function mapPoint(H, u, v) {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

// 四すみの内側を outW x outH の画像に展開する（バイリニア補間）
export function rectify(img, corners, outW, outH) {
  const H = squareToQuad(corners);
  const out = new Uint8ClampedArray(outW * outH * 4);
  const { data, width, height } = img;
  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) / outW;
      let [sx, sy] = mapPoint(H, u, v);
      sx -= 0.5; sy -= 0.5;
      const o = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) {
        out[o + 3] = 255;
        continue;
      }
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * width + x0) * 4, i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const a = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
        const b = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
        out[o + c] = a * (1 - fy) + b * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: outW, height: outH };
}

// 箱を展開した画像上での各マスの矩形（row/col は 1 始まり、col は左から）
export function cellRect(rect, row, col, layout) {
  const { rows, cols, innerMargin } = layout;
  const mx = rect.width * innerMargin.x;
  const my = rect.height * innerMargin.y;
  const cw = (rect.width - mx * 2) / cols;
  const ch = (rect.height - my * 2) / rows;
  return { x: mx + (col - 1) * cw, y: my + (row - 1) * ch, w: cw, h: ch };
}

export const THRESHOLDS = {
  filled: 0.1, // 水色でない画素の割合がこれ以上なら「貝あり」
  empty: 0.025, // これ以下で、かつ淡い色の割合も低ければ「空」
  pale: 0.2, // 淡い色（白っぽい・半透明の貝）の割合がこれ以上なら「要確認」
  minBoxBlue: 0.35, // 全マスの中で水色が占める割合がこれ未満なら、範囲がずれている可能性
};

// 各マスを判定する。戻り値: { cells: [{row,col,state,score,pale}], warning }
// 迷うマスは「要確認」にして、利用者に確認してもらう。
export function readCells(rect, layout, thresholds = THRESHOLDS) {
  const { data, width } = rect;
  // 1) 箱の底の色相と彩度を推定（全マス中央部の水色の中央値）
  const hues = [];
  const cellSats = [];
  const regions = [];
  for (let row = 1; row <= layout.rows; row++) {
    for (let col = 1; col <= layout.cols; col++) {
      const r = cellRect(rect, row, col, layout);
      // 仕切りと影を避けて中央部だけ見る
      const ix = r.w * 0.2, iy = r.h * 0.14;
      const reg = {
        row, col,
        x0: Math.round(r.x + ix), x1: Math.round(r.x + r.w - ix),
        y0: Math.round(r.y + iy), y1: Math.round(r.y + r.h - iy),
      };
      regions.push(reg);
      for (let y = reg.y0; y < reg.y1; y += 3) {
        for (let x = reg.x0; x < reg.x1; x += 3) {
          const i = (y * width + x) * 4;
          const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
          if (s > 0.15 && v > 0.3 && h > 170 && h < 220) {
            hues.push(h);
            cellSats.push(s);
          }
        }
      }
    }
  }
  hues.sort((a, b) => a - b);
  const baseHue = hues.length ? hues[Math.floor(hues.length / 2)] : 195;
  cellSats.sort((a, b) => a - b);
  const floorSat = Math.max(0.12, percentile(cellSats, 0.5) * 0.45);

  let blueTotal = 0, allTotal = 0;
  const cells = regions.map((reg) => {
    let fg = 0, total = 0, blue = 0;
    const px = [];
    for (let y = reg.y0; y < reg.y1; y += 2) {
      for (let x = reg.x0; x < reg.x1; x += 2) {
        const i = (y * width + x) * 4;
        const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        const [h, s, v] = hsv;
        total++;
        px.push(hsv);
        if (v < 0.22) continue; // 濃い影は判断に使わない
        const isFloor = hueDist(h, baseHue) < 20 && s > floorSat;
        if (isFloor) blue++;
        else fg++;
      }
    }
    // 淡い色の割合: マス内の底の彩度より明らかに白っぽく、影ではない（明るい）画素
    const S = px.map((p) => p[1]).sort((a, b) => a - b);
    const V = px.map((p) => p[2]).sort((a, b) => a - b);
    const s85 = percentile(S, 0.85);
    const vMed = percentile(V, 0.5);
    const pale = px.length ? px.filter((p) => p[1] < 0.72 * s85 && p[2] > vMed * 0.95).length / px.length : 0;

    blueTotal += blue;
    allTotal += total;
    const score = total ? fg / total : 0;
    let state = 'check';
    if (score >= thresholds.filled) state = 'filled';
    else if (score <= thresholds.empty && pale < thresholds.pale) state = 'empty';
    return { row: reg.row, col: reg.col, state, score, pale };
  });
  const blueRatio = allTotal ? blueTotal / allTotal : 0;
  let warning = null;
  if (blueRatio < thresholds.minBoxBlue && cells.filter((c) => c.state === 'filled').length > 30) {
    // 箱の底がほとんど見えない＝範囲や向きがずれている可能性が高い
    warning = 'low-blue';
  }
  return { cells, baseHue, floorSat, blueRatio, warning };
}

// 利用者が動かした四すみが、読み取りに使える形かを確かめる
// 戻り値: { ok: true } または { ok: false, reason: 'cross' | 'small' | 'narrow' }
export function validateCorners(c, width, height) {
  // 4辺が交差しない凸の四角形（すべての角で同じ向きに曲がる）
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const cr = cross(c[i], c[(i + 1) % 4], c[(i + 2) % 4]);
    if (Math.abs(cr) < 1e-6) return { ok: false, reason: 'cross' };
    const s = Math.sign(cr);
    if (sign && s !== sign) return { ok: false, reason: 'cross' };
    sign = s;
  }
  if (polygonArea(c) < width * height * 0.06) return { ok: false, reason: 'small' };
  const minSide = Math.min(...c.map((p, i) => Math.hypot(p[0] - c[(i + 1) % 4][0], p[1] - c[(i + 1) % 4][1])));
  if (minSide < Math.max(width, height) * 0.08) return { ok: false, reason: 'narrow' };
  return { ok: true };
}
