// 貝の詳細：写真 → 名前 → 見分けるポイント → 見比べ → 箱の位置 の順
import { h, ic, shellName, stars, shapeTag, lightbox, notice, formatDate, pendingTag, shellImg, photoThumbs } from '../ui.js';
import { loadBox, STATE_LABEL } from '../store.js';
import { positionLabel } from '../data.js';
import { hasModel, mount3D } from '../lib/viewer3d.js';
import { page } from './common.js';
import { boxGrid } from './boxgrid.js';

const VIEW_LABEL = { front: '表', back: '裏', side: '横', sheet: '参考写真' };
const viewName = (p) => VIEW_LABEL[p.view] || p.label || '';

export function render(ctx) {
  const { data } = ctx;
  const no = Number(ctx.params[0]);
  const sp = data.byNo[no];
  if (!sp) {
    return page(ctx, { title: '見つかりません', back: '#/list' },
      h('div', { class: 'card stack' }, h('p', null, '1〜36の番号を選んでください。'), h('a', { class: 'btn', href: '#/list' }, '一覧へ')));
  }
  const rec = loadBox();
  const main = page(ctx, { title: `${sp.no}番 ${sp.v.name}`, back: '#/list' });
  const photos = sp.v.photos;

  // 写真（表・裏・横があれば切り替え）
  let photoBox;
  if (photos.length) {
    let current = 0;
    const imgEl = h('img', { src: photos[0].src, alt: `${sp.no}番 ${sp.v.name}の参考写真` });
    const photoBtn = h('button', { class: 'photo-main', type: 'button', 'aria-label': '写真を拡大', onclick: () => lightbox(photos[current].src, `${sp.no}番 ${sp.v.name}`) }, imgEl);
    const cap = h('p', { class: 'photo-cap' });
    const seg = photos.length > 1 ? photoThumbs(photos, (i) => show(i), { label: '写真を選ぶ', name: `${sp.v.name}の` }) : null;
    const show = (i) => {
      current = i;
      const p = photos[i];
      imgEl.src = p.src;
      // 低解像度の写真は、ぼやけないよう小さめに表示する
      photoBtn.classList.toggle('low-res', p.quality === 'low');
      // 出典・許諾の表示はしない（記録は shells.json と ASSETS.md に残す）
      cap.textContent = p.view === 'sheet' ? '参考写真（36種類一覧から切り出し）'
        : photos.length > 1 ? `${i + 1} / ${photos.length}` : '';
      seg?.pick(i);
    };
    show(0);
    photoBox = h('div', { class: 'stack-sm' }, photoBtn, seg, cap);
  } else {
    photoBox = h('div', { class: 'photo-main low-res' }, shellImg(sp));
  }

  // 名前
  const pend = sp.v.pending;
  const title = h('div', { class: 'title-block' },
    h('span', { class: 'no-badge' }, sp.no),
    h('div', { class: 'grow' },
      h('h2', null, shellName(sp)),
      sp.v.sheetName
        ? h('p', { class: 'small muted' }, `［${sp.v.sheetName}］`, h('span', { class: 'xsmall' }, '　一覧表の表記'))
        : null,
      h('div', { class: 'tags' },
        shapeTag(data, sp),
        sp.v.rarity ? h('span', { class: 'tag pink' }, stars(sp.v.rarity)) : null,
        pend.size && data.preview ? pendingTag('照合待ちの情報を含みます') : null)));

  // 見分けるポイント（表示してよいものがあるときだけ）
  const feats = sp.v.features;
  const featureCard = feats.length
    ? h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '見分けるポイント'),
      h('ul', { class: 'feature-list' }, feats.map((f) => h('li', null, ic('shell'), h('div', null, f.text)))),
      feats.some((f) => f.status !== 'confirmed') && data.preview ? pendingTag('照合待ち：内容を確認中') : null)
    : null;

  // 見比べ
  const compareCard = h('section', { class: 'card stack-sm' },
    h('h3', { class: 'section-title' }, feats.length ? 'ほかの貝と見比べる' : '見比べて確かめる'),
    feats.length ? null : h('p', { class: 'small muted' }, '見分けるポイントは準備中です。写真を見比べて確かめてください。'),
    sp.v.similar.length
      ? h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, '似ている貝'),
        sp.v.similar.map((s) => h('a', { class: 'btn block secondary', href: `#/compare/${sp.no}/${s.no}` },
          ic('compare'), h('span', null, `${s.no}番 ${data.byNo[s.no].v.name}と見比べる`, s.point ? h('span', { class: 'xsmall block' }, s.point) : null))))
      : null,
    h('a', { class: 'btn block soft', href: `#/compare/${sp.no}` }, ic('compare'), '見比べる貝を選ぶ'));

  // 箱の位置と記録
  const cell = rec?.cells?.[sp.no];
  const state = cell?.s || 'unknown';
  const boxCard = h('section', { class: 'card stack-sm' },
    h('h3', { class: 'section-title' }, '収集箱の位置'),
    h('p', { class: 'small' }, positionLabel(sp)),
    boxGrid(data, { mini: true, highlight: sp.no }),
    h('div', { class: 'row between wrap' },
      h('p', { class: 'small' }, '記録：', h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state]),
        cell?.t && !rec.temp ? h('span', { class: 'xsmall muted' }, `　${formatDate(cell.t)}`) : null),
      h('a', { class: 'btn small secondary', href: `#/box?edit=1&sel=${sp.no}` }, ic('edit'), '記録を直す')));

  // 3D・AR（実物に基づくモデルがあるときだけ）
  let modelCard = null;
  if (data.config.features?.model3d && hasModel(sp, data)) {
    const viewerArea = h('div', { class: 'stack-sm' });
    const msg = h('div');
    const btn = h('button', { class: 'btn block', type: 'button' }, ic('cube'), '3Dで見る');
    btn.addEventListener('click', async () => {
      btn.remove();
      const r = await mount3D(viewerArea, sp, { onMessage: (m) => msg.replaceChildren(notice('warn', 'alert', h('p', null, m))) });
      if (!r.ok) msg.replaceChildren(notice('warn', 'alert', h('p', null, r.message)));
    });
    modelCard = h('section', { class: 'card stack-sm' }, h('h3', { class: 'section-title' }, '3Dで見る'),
      h('p', { class: 'small muted' }, '指で回すと、いろいろな角度から見られます。'),
      sp.model.status !== 'confirmed' ? pendingTag('照合待ち：作成した3Dモデルを実物と照合中') : null,
      btn, viewerArea, msg);
  }

  const prev = data.byNo[sp.no - 1];
  const next = data.byNo[sp.no + 1];
  const pager = h('nav', { class: 'pager', 'aria-label': '前後の貝' },
    prev ? h('a', { class: 'pager-link prev', href: `#/shell/${prev.no}`, 'aria-label': `前の貝 ${prev.no}番 ${prev.v.name}` }, ic('back'),
      h('span', null, h('span', { class: 'dir' }, '前の貝'), h('span', { class: 'pn' }, `${prev.no} ${prev.v.name}`))) : h('span'),
    next ? h('a', { class: 'pager-link next', href: `#/shell/${next.no}`, 'aria-label': `次の貝 ${next.no}番 ${next.v.name}` },
      h('span', null, h('span', { class: 'dir' }, '次の貝'), h('span', { class: 'pn' }, `${next.no} ${next.v.name}`)), ic('chevron')) : h('span'));

  // 3Dは写真のすぐ下（いろいろな角度から見られる）
  main.append(h('div', { class: 'stack' }, photoBox, modelCard, title, featureCard, compareCard, boxCard, pager));
  return main;
}
