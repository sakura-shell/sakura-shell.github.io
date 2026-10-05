import { icon, shapeIcon } from './icons.js';

// 小さな DOM ビルダー: h('div', {class: 'x', onclick}, 'text', child)
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

// 記録の進み具合のリング（filled / 36）
export function ring(filled, total = 36, small = false) {
  const p = Math.round((filled / total) * 100);
  return h('div', { class: `ring${small ? ' small' : ''}`, style: { '--p': p }, role: 'img', 'aria-label': `${total}マス中${filled}マスに貝あり` },
    h('span', null, filled, small ? null : h('small', null, `/ ${total}`)));
}

// 日本語の文を、意味のまとまりの途中で折り返さないようにする
// phrase('実物を見ながら、', '手で記録する') → 折り返すなら「、」の後で
export function phrase(...parts) {
  return h('span', { class: 'phrase' }, parts.map((p) => h('span', null, p)));
}

// replaceChildren の null を読み飛ばす版（素の replaceChildren は null を "null" と表示してしまう）
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.append(c);
    else el.append(document.createTextNode(String(c)));
  }
}

export function svg(markup, cls) {
  const span = document.createElement('span');
  span.innerHTML = markup;
  const s = span.firstElementChild;
  if (s) {
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    if (cls) s.setAttribute('class', cls);
  }
  return s || span;
}

export const ic = (name, cls) => svg(icon(name), cls);
export const shapeIc = (shape, cls) => svg(shapeIcon(shape), cls);

// 貝の名前（ふりがなは表示してよい場合だけ）
export function shellName(sp) {
  const name = sp.v.name;
  const ruby = sp.v.ruby;
  if (!ruby) return document.createTextNode(name);
  const idx = name.indexOf(ruby.base);
  if (idx < 0) return document.createTextNode(name);
  const frag = document.createDocumentFragment();
  if (idx > 0) frag.append(name.slice(0, idx));
  frag.append(h('ruby', null, ruby.base, h('rt', null, ruby.text)));
  frag.append(name.slice(idx + ruby.base.length));
  return frag;
}

// 確認用プレビューで、照合がまだの情報に付ける印
export function pendingTag(text = '照合待ち') {
  return h('span', { class: 'tag pending' }, text);
}

export function stars(n) {
  return h('span', { class: 'stars', 'aria-label': `レア度 星${n}つ` }, h('span', { class: 'stars-label' }, 'レア度'), '★'.repeat(n));
}

export function shapeTag(data, sp) {
  if (!sp.v.shape) return null;
  return h('span', { class: 'tag' }, shapeIc(sp.v.shape), data.shapes[sp.v.shape].label);
}

export function photoSrc(sp, { thumb = false } = {}) {
  const p = sp.v.photos[0];
  return (thumb && p?.thumb) || p?.src || '';
}

// 写真が複数あるときの切り替え（小さな写真を横に並べる）。戻り値の .pick(i) で選択中を変える
export function photoThumbs(photos, onPick, { label = '写真を選ぶ', name = '', small = false } = {}) {
  const wrap = h('div', { class: `thumbs${small ? ' small' : ''}`, role: 'group', 'aria-label': label });
  const pick = (i) => wrap.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  photos.forEach((p, i) => wrap.append(h('button', {
    type: 'button', 'aria-pressed': String(i === 0),
    'aria-label': `${name}${p.view === 'sheet' ? '一覧表の写真' : p.label || `写真${i + 1}`}`,
    onclick: () => { pick(i); onPick(i); },
  }, h('img', { src: p.thumb || p.src, alt: '', loading: 'lazy', decoding: 'async' }))));
  wrap.pick = pick;
  return wrap;
}

// 写真がない（または表示できない）ときは「写真準備中」の枠を出す。thumb: true で一覧用の小さい画像
export function shellImg(sp, { thumb = false, ...attrs } = {}) {
  const src = photoSrc(sp, { thumb });
  if (!src) return h('div', { class: 'no-photo', role: 'img', 'aria-label': `${sp.no}番 ${sp.v.name}：写真準備中` }, ic('shell'), h('span', null, '写真準備中'));
  return h('img', { src, alt: `${sp.no}番 ${sp.v.name}の参考写真`, loading: 'lazy', decoding: 'async', ...attrs });
}

// ダイアログを閉じたら、開く前の場所へフォーカスを戻す
function remember() {
  const prev = document.activeElement;
  return () => { if (prev && document.contains(prev)) prev.focus({ preventScroll: true }); };
}

// ---- トースト ----
let toastTimer;
// 操作ボタン付きのお知らせ（「取り消す」など）
export function toastAction(msg, label, onAction, ms = 6000) {
  document.querySelector('.toast')?.remove();
  const btn = h('button', { class: 'toast-action', type: 'button' }, label);
  const t = h('div', { class: 'toast has-action', role: 'status' }, h('span', null, msg), btn);
  btn.addEventListener('click', () => { t.remove(); onAction(); });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

export function toast(msg, ms = 2600) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}

// ---- 下から出る確認シート ----
export function confirmSheet({ title, body, ok = 'はい', cancel = 'やめる', danger = false }) {
  return new Promise((resolve) => {
    const back = remember();
    const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
    const done = (v) => { dlg.close(); dlg.remove(); back(); resolve(v); };
    dlg.append(h('div', { class: 'sheet-body stack' },
      h('h2', { id: 'sheet-title', style: { fontSize: '19px' } }, title),
      body ? h('p', { class: 'muted' }, body) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn secondary', onclick: () => done(false) }, cancel),
        h('button', { class: `btn${danger ? ' danger' : ''}`, onclick: () => done(true) }, ok)),
    ));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// 任意の中身を下から出す
export function openSheet(buildContent) {
  const back = remember();
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => { if (dlg.open) dlg.close(); dlg.remove(); back(); };
  const body = h('div', { class: 'sheet-body stack' });
  body.append(buildContent(close));
  dlg.append(body);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return close;
}

// ---- 拡大表示 ----
export function lightbox(src, caption) {
  const back = remember();
  const dlg = h('dialog', { class: 'lightbox', 'aria-label': caption || '拡大表示' });
  const close = () => { dlg.close(); dlg.remove(); back(); };
  dlg.append(
    h('div', { class: 'lb', onclick: close }, h('img', { src, alt: caption || '' })),
    h('button', { class: 'icon-btn close', 'aria-label': '閉じる', onclick: close }, ic('close')),
    caption ? h('p', { class: 'lb-cap' }, caption) : null,
  );
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
}

export function notice(kind, iconName, ...content) {
  return h('div', { class: `notice ${kind || ''}` }, ic(iconName), h('div', null, ...content));
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// カタカナ→ひらがな、全角数字→半角、空白除去
export function normalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
    .toLowerCase();
}
