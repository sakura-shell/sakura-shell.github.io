// 確認用プレビューの「合言葉」の画面
//
// 検証段階のサイトを、合言葉を知っている人だけが使えるようにする（うっかり見られるのを防ぐ程度。
// ファイル自体は公開の場所に置いてあるので、本当の意味での非公開ではない）。
// config.json の previewGate: { "salt": "…", "hash": "…" } があり、mode が "public" でないときだけ出す。
// 合言葉の設定・変更・解除は tools/set_passphrase.py で行う（合言葉そのものはファイルに書かない）。
// 一度正しく入れると、その端末・ブラウザでは次から聞かない。

import { h } from '../ui.js';

const KEY = 'm36shells:gate';

export function gateNeeded(config) {
  const g = config.previewGate;
  if (!g?.hash || config.mode === 'public') return false;
  try { return localStorage.getItem(KEY) !== g.hash; } catch { return true; }
}

// 合言葉の画面を出し、正しく入れられたら resolve する
export function showGate(root, config) {
  const g = config.previewGate;
  return new Promise((resolve) => {
    const input = h('input', {
      class: 'gate-input', type: 'password', id: 'gate-pass', autocomplete: 'off', autocapitalize: 'off',
      spellcheck: 'false', enterkeyhint: 'go', 'aria-describedby': 'gate-msg',
    });
    const msg = h('p', { class: 'small gate-msg', id: 'gate-msg', role: 'status' });
    const form = h('form', { class: 'stack-sm' },
      h('label', { class: 'small', for: 'gate-pass' }, '合言葉'),
      input,
      h('label', { class: 'xsmall row gate-show' },
        h('input', { type: 'checkbox', onchange: (e) => { input.type = e.target.checked ? 'text' : 'password'; } }),
        '合言葉を表示する'),
      msg,
      h('button', { class: 'btn block', type: 'submit' }, '開く'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = normalize(input.value);
      if (!value) { msg.textContent = '合言葉を入れてください。'; return; }
      if (sha256(g.salt + value) === g.hash) {
        try { localStorage.setItem(KEY, g.hash); } catch { /* 保存できなくても、この画面の間は使える */ }
        resolve();
      } else {
        msg.textContent = '合言葉が違います。もう一度入れてください。';
        input.select();
      }
    });
    root.replaceChildren(h('main', { class: 'page stack gate', id: 'main' },
      h('p', { class: 'text-logo' }, h('span', { class: 'block' }, 'MASUHOGAURA'), h('span', { class: 'block' }, '36 shells Collection')),
      h('div', { class: 'card stack-sm' },
        h('h1', { style: { fontSize: '20px' } }, '確認用のサイトです'),
        h('p', { class: 'small' }, '関係者の方は、お知らせした合言葉を入れてください。'),
        form)));
    setTimeout(() => input.focus(), 50);
  });
}

// 全角・半角、大文字・小文字の違いは区別しない
function normalize(s) {
  return String(s || '').normalize('NFKC').trim().toLowerCase();
}

// SHA-256（http のスマホ確認用サーバーでも動くように、ブラウザの暗号機能を使わずに計算する）
export function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);
  const W = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += hh;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}
