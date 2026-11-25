// スタッフが机の白い紙の上で撮った写真（貝が中央に小さく写っている）から、中央の貝のまわりを正方形に切り出す。
// 利用者には「貝を枠いっぱいに写す」よう案内しているので、学習用の写真もそれに近い見え方にそろえる。
export function centerShellCrop(img, { scale = 2.2, out = 600 } = {}) {
  const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
  const s = 240 / Math.max(W0, H0);
  const w = Math.round(W0 * s), h = Math.round(H0 * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  // まわりの明るさ（大きくぼかした画像）との差で、紙の上の物を見つける
  const R = 14;
  const lum = new Float32Array(w * h), sat = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = px[p * 4], g = px[p * 4 + 1], b = px[p * 4 + 2];
    lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    sat[p] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += lum[y * w + x]; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row; } }
  const boxMean = (x, y) => {
    const xa = Math.max(0, x - R), xb = Math.min(w, x + R + 1), ya = Math.max(0, y - R), yb = Math.min(h, y + R + 1);
    return (integ[yb * (w + 1) + xb] - integ[ya * (w + 1) + xb] - integ[yb * (w + 1) + xa] + integ[ya * (w + 1) + xa]) / ((xb - xa) * (yb - ya));
  };
  const mask = new Uint8Array(w * h);
  const xL = Math.round(w * 0.18), xR = Math.round(w * 0.82), yT = Math.round(h * 0.18), yB = Math.round(h * 0.82);
  for (let y = yT; y < yB; y++) for (let x = xL; x < xR; x++) {
    const p = y * w + x;
    const dl = Math.abs(lum[p] - boxMean(x, y));
    if (dl > 14 || sat[p] > 40) mask[p] = 1;
  }
  // つながった塊のうち、中央に近く、ある程度の大きさのものを貝とする
  const seen = new Uint8Array(w * h); let best = null; let closeup = false;
  const cx0 = w / 2, cy0 = h / 2;
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || seen[p]) continue;
    const st = [p]; seen[p] = 1; let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sx = 0, sy = 0, sl = 0;
    while (st.length) {
      const q = st.pop(); const x = q % w, y = (q / w) | 0; n++; sx += x; sy += y; sl += lum[q];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const r of [q - 1, q + 1, q - w, q + w, q - w - 1, q - w + 1, q + w - 1, q + w + 1]) {
        if (r >= 0 && r < w * h && mask[r] && !seen[r] && Math.abs((r % w) - x) <= 1) { seen[r] = 1; st.push(r); }
      }
    }
    if (n < 12) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // 大きく写した写真（貝が中央を広くおおう）は、切り出さずにそのまま使う
    if ((bw > w * 0.3 || bh > h * 0.3) && x0 < cx0 && x1 > cx0 && y0 < cy0 && y1 > cy0 && sl / n >= 70) closeup = true;
    if (bw > w * 0.5 || bh > h * 0.5) continue; // 紙の端・机などの大きな物は除く
    if (sl / n < 70) continue; // 黒いクリップなど（貝はここまで暗くない）
    if (Math.max(bw, bh) / Math.min(bw, bh) > 4.5) continue; // 箸のような細長い物
    if (x0 <= xL || x1 >= xR - 1 || y0 <= yT || y1 >= yB - 1) continue; // 探す範囲の外から続く物（紙の端・机・容器）
    const d = Math.hypot(sx / n - cx0, sy / n - cy0);
    const score = d - Math.sqrt(n) * 1.5;
    if (!best || score < best.score) best = { score, x0, y0, x1, y1, n, d };
  }
  // 中央近くに貝らしい大きさの物があれば、それを切り出す（手のひら・箸が中央を横切っていても）。なければ大きく写した写真とみなす
  const clear = best && best.n >= 25 && best.d < w * 0.2;
  let cx, cy, side;
  if (closeup && !clear) { cx = w / 2; cy = h / 2; side = w * 0.42; } // 中央を広めに（手のひら・箸の先の貝も入る）
  else if (best) {
    cx = (best.x0 + best.x1) / 2; cy = (best.y0 + best.y1) / 2;
    side = Math.max(best.x1 - best.x0 + 1, best.y1 - best.y0 + 1) * scale;
    side = Math.max(side, w * 0.14);
  } else { img.found = false; return img; } // 見つからないときは、そのまま（サイトと同じ切り出しにまかせる）
  const o = document.createElement('canvas'); o.width = out; o.height = out;
  const octx = o.getContext('2d');
  octx.fillStyle = '#eee'; octx.fillRect(0, 0, out, out);
  octx.drawImage(img, (cx - side / 2) / s, (cy - side / 2) / s, side / s, side / s, 0, 0, out, out);
  o.found = !!best;
  return o;
}
