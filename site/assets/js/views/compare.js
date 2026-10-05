// 2つを並べて見比べる（貝と貝、または撮った写真と貝）
import { h, ic, notice, shellImg, shapeTag, lightbox, pendingTag, photoThumbs } from '../ui.js';
import { loadBox } from '../store.js';
import { page } from './common.js';
import { shellCard, filterChips, applyFilters, noResult } from './parts.js';
import { session } from './identify.js';
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

  const left = isPhoto ? photoColumn() : shellColumn(data, a);
  const right = shellColumn(data, b);
  return tab(page(ctx, { title: isPhoto ? 'この貝かな？' : '見比べる', back: backTo },
    h('div', { class: 'stack' },
      h('div', { class: 'compare' }, left, right),
      h('p', { class: 'xsmall muted' }, '写真の大きさは実物の大きさとは関係ありません。'),
      isPhoto ? matchCheck(data, b, session) : null,
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn small secondary', href: `#/compare/${aRaw}` }, ic('compare'), '貝を変える'),
        isPhoto ? h('a', { class: 'btn small soft', href: '#/identify' }, '一覧へ戻る') : null))), isPhoto);
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

function shellColumn(data, sp) {
  const photos = sp.v.photos;
  const sw = photos.length ? photoSwitcher(photos, `${sp.v.name}の参考写真`) : null;
  return h('div', { class: 'col' },
    h('div', { class: 'compare-label' }, '図鑑の写真'),
    sw
      ? h('button', { class: 'ph', type: 'button', style: { border: 0, cursor: 'zoom-in' }, 'aria-label': `${sp.v.name}の写真を拡大`, onclick: () => lightbox(sw.current().src, `${sp.no}番 ${sp.v.name}`) }, sw.img)
      : h('div', { class: 'ph' }, shellImg(sp)),
    h('div', { class: 'body' },
      sw?.seg,
      h('div', null, h('span', { class: 'no-badge' }, sp.no)),
      h('div', { class: 'nm' }, sp.v.name),
      h('div', { class: 'tags' }, shapeTag(data, sp)),
      sp.v.features.length ? h('ul', { class: 'feature-list small' }, sp.v.features.map((f) => h('li', null, f.text, f.status !== 'confirmed' ? pendingTag() : null))) : null,
      h('a', { class: 'btn small secondary', href: `#/shell/${sp.no}` }, '詳細')));
}

function photoColumn() {
  const sw = photoSwitcher(session.photos, 'あなたが撮った貝の写真');
  return h('div', { class: 'col' },
    h('div', { class: 'compare-label' }, 'あなたの写真'),
    h('button', { class: 'ph user', type: 'button', style: { border: 0, cursor: 'zoom-in' }, 'aria-label': '写真を拡大', onclick: () => lightbox(sw.current().src, `あなたの写真（${sw.current().label}）`) }, sw.img),
    h('div', { class: 'body' }, sw.seg));
}
