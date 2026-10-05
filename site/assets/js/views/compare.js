// 2つを並べて見比べる（貝と貝、または撮った写真と貝）
import { h, ic, notice, shellImg, shapeTag, lightbox, pendingTag, photoThumbs, phrase } from '../ui.js';
import { loadBox } from '../store.js';
import { page } from './common.js';
import { shellCard, filterChips, applyFilters, noResult } from './parts.js';
import { session, nextShell } from './identify.js';
import { foundBlock } from './record.js';
import { isStaff } from '../data.js';
import { addPhoto } from '../lib/collectdb.js';
import { matchCheck } from './matchcheck.js';


export function render(ctx) {
  const { data } = ctx;
  const [aRaw, bRaw] = ctx.params;
  const isPhoto = aRaw === 'photo';
  const a = isPhoto ? null : data.byNo[Number(aRaw)];
  const b = bRaw ? data.byNo[Number(bRaw)] : null;
  const rec = loadBox();
  const backTo = isPhoto ? '#/identify' : a ? `#/shell/${a.no}` : '#/list';

  if (isPhoto && !session.photos.length) {
    return tab(page(ctx, { title: '見比べる', back: '#/identify' },
      h('div', { class: 'stack' },
        notice('warn', 'alert', h('p', null, '見比べる写真がありません（ページを開き直すと写真は消えます）。')),
        h('a', { class: 'btn block', href: '#/identify' }, ic('camera'), '貝を撮る'))), isPhoto);
  }
  if (!isPhoto && !a) {
    return page(ctx, { title: '見比べる', back: '#/list' }, h('a', { class: 'btn block', href: '#/list' }, '一覧へ'));
  }

  // 相手を選ぶ（撮った写真の見比べでは、なあに？画面の絞り込みを引き継ぐ）
  if (!b) {
    const filters = isPhoto ? session.filters : { shape: a?.v.shape || '', color: '', box: '' };
    const grid = h('div', { class: 'shell-grid' });
    const chipsHolder = h('div');
    const update = () => {
      const list = applyFilters(data.species, filters, rec).filter((sp) => sp !== a);
      grid.replaceChildren(...(list.length ? list.map((sp) => shellCard(data, sp, rec, {
        onclick: () => ctx.navigate(`#/compare/${aRaw}/${sp.no}`, { replace: true }),
      })) : [noResult(() => { filters.shape = ''; filters.color = ''; filters.box = ''; chipsHolder.replaceChildren(filterChips(data, filters, rec, update)); update(); })]));
    };
    chipsHolder.append(filterChips(data, filters, rec, update));
    update();
    return tab(page(ctx, { title: '見比べる貝を選ぶ', back: backTo },
      h('div', { class: 'stack' },
        a ? h('div', { class: 'sel-panel card' }, h('div', { class: 'ph' }, shellImg(a)), h('div', null, h('span', { class: 'no-badge' }, a.no), h('div', { class: 'nm' }, a.v.name)))
          : h('p', { class: 'small muted' }, 'あなたの写真と見比べる貝を選んでください。'),
        a?.v.shape ? h('p', { class: 'small muted' }, `同じ「${data.shapes[a.v.shape].label}」から表示しています。`) : null,
        chipsHolder,
        grid)), isPhoto);
  }

  const left = isPhoto ? photoColumn() : shellColumn(a);
  const right = shellColumn(b);
  return tab(page(ctx, { title: isPhoto ? 'この貝かな？' : '見比べる', back: backTo },
    h('div', { class: 'stack' },
      h('div', { class: 'compare' }, left, right),
      h('p', { class: 'xsmall muted' }, '写真の大きさは実物の大きさとは関係ありません。'),
      isPhoto ? h('section', { class: 'card stack-sm found-card' },
        h('h3', { class: 'section-title' }, phrase('この貝で', '合っていたら')),
        foundBlock(data, b, { onNext: nextShell }),
        isStaff() ? saveForTraining(b) : null) : null,
      isPhoto ? featureCard(data, b) : compareTable(data, a, b),
      isPhoto ? matchCheck(data, b, session) : null,
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn small secondary', href: `#/compare/${aRaw}` }, ic('compare'), '貝を変える'),
        isPhoto ? h('a', { class: 'btn small soft', href: '#/identify' }, '一覧へ戻る') : null))), isPhoto);

  // 貝の写真（名前を写真の上に置き、写真の枚数が違っても左右の名前がそろうようにする）
  function shellColumn(x) {
    const photos = x.v.photos;
    const sw = photos.length ? photoSwitcher(photos, `${x.no}番 ${x.v.name}の写真`) : null;
    return h('div', { class: 'col' },
      h('div', { class: 'col-head' },
        h('span', { class: 'no-badge' }, x.no),
        h('a', { class: 'nm', href: `#/shell/${x.no}` }, x.v.name)),
      sw
        ? h('button', { class: 'ph', type: 'button', 'aria-label': `${x.v.name}の写真を拡大`, onclick: () => lightbox(sw.current().src, `${x.no}番 ${x.v.name}`) }, sw.img)
        : h('div', { class: 'ph' }, shellImg(x)),
      sw?.seg ? h('div', { class: 'col-thumbs' }, sw.seg) : null);
  }
}

const KINDS = [['shape', '形'], ['color', '色・模様'], ['surface', '表面'], ['other', 'そのほか']];

// 2つの貝の特徴を、同じ項目ごとに左右に並べる
function compareTable(data, a, b) {
  const cell = (sp, kind) => {
    const items = sp.v.features.filter((f) => (f.kind || 'other') === kind);
    return h('div', { class: 'cmp-cell' }, items.length ? items.map((f) => h('p', null, f.text)) : h('p', { class: 'muted' }, '―'));
  };
  const rows = [];
  if (a.v.shape || b.v.shape) {
    rows.push(h('div', { class: 'cmp-row' },
      h('div', { class: 'cmp-label' }, '分類'),
      h('div', { class: 'cmp-cell' }, shapeTag(data, a) || h('p', { class: 'muted' }, '―')),
      h('div', { class: 'cmp-cell' }, shapeTag(data, b) || h('p', { class: 'muted' }, '―'))));
  }
  for (const [kind, label] of KINDS) {
    if (![a, b].some((sp) => sp.v.features.some((f) => (f.kind || 'other') === kind))) continue;
    rows.push(h('div', { class: 'cmp-row' }, h('div', { class: 'cmp-label' }, label), cell(a, kind), cell(b, kind)));
  }
  if (!rows.length) return h('p', { class: 'small muted' }, '見分けるポイントは準備中です。写真を見比べて確かめてください。');
  const pending = [a, b].some((sp) => sp.v.features.some((f) => f.status !== 'confirmed'));
  return h('section', { class: 'card stack-sm cmp-card' },
    h('h3', { class: 'section-title' }, '見比べるポイント'),
    h('div', { class: 'cmp-names', 'aria-hidden': 'true' }, h('span', null, `${a.no} ${a.v.name}`), h('span', null, `${b.no} ${b.v.name}`)),
    ...rows,
    pending && data.preview ? h('p', { class: 'xsmall muted' }, pendingTag('照合待ち'), ' 特徴の内容は確認中です') : null);
}

// 撮った写真と見比べるとき：相手の貝の見分けるポイント
function featureCard(data, sp) {
  if (!sp.v.features.length) return null;
  const pending = sp.v.features.some((f) => f.status !== 'confirmed');
  return h('section', { class: 'card stack-sm' },
    h('h3', { class: 'section-title' }, `${sp.v.name}の見分けるポイント`),
    h('ul', { class: 'feature-list small' }, sp.v.features.map((f) => h('li', null, ic('shell'), h('div', null, f.text)))),
    pending && data.preview ? h('p', { class: 'xsmall muted' }, pendingTag('照合待ち'), ' 特徴の内容は確認中です') : null);
}

function tab(main, isPhoto) {
  if (isPhoto) main.dataset.tab = 'identify';
  return main;
}

// 写真の向き切り替え（素材がある向きだけボタンを出す）
function photoSwitcher(items, alt) {
  let i = 0;
  const img = h('img', { src: items[0].src, alt });
  const seg = items.length > 1 ? photoThumbs(items, (k) => { i = k; img.src = items[k].src; }, { label: '写真を選ぶ', small: true }) : null;
  return { img, seg, current: () => items[i] };
}

function photoColumn() {
  const sw = photoSwitcher(session.photos, 'あなたが撮った貝の写真');
  return h('div', { class: 'col' },
    h('div', { class: 'col-head' }, h('span', { class: 'nm' }, 'あなたの写真')),
    h('button', { class: 'ph user', type: 'button', 'aria-label': '写真を拡大', onclick: () => lightbox(sw.current().src, `あなたの写真（${sw.current().label}）`) }, sw.img),
    sw.seg ? h('div', { class: 'col-thumbs' }, sw.seg) : null);
}

// スタッフ用：撮った写真を、この貝の学習用写真として端末に保存する（開発用モードのときだけ）
function saveForTraining(sp) {
  const btn = h('button', { class: 'btn block soft small', type: 'button', onclick: async () => {
    btn.disabled = true;
    const group = `${String(sp.no).padStart(2, '0')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-id${Date.now() % 100000}`;
    let ok = 0;
    for (const p of session.photos) {
      try {
        const blob = await (await fetch(p.src)).blob();
        await addPhoto({ label: String(sp.no), group, blob, t: new Date().toISOString(), note: '写真で調べるから保存' });
        ok++;
      } catch { /* 保存できなかった写真は飛ばす */ }
    }
    btn.textContent = ok ? `学習用に${ok}枚保存しました` : '保存できませんでした';
  } }, ic('plus'), `撮った写真を「${sp.v.name}」の学習用に保存（スタッフ用）`);
  return btn;
}
