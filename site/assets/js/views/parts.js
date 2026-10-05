import { h, ic, shapeIc, shellImg } from '../ui.js';
import { cellState, counts, STATE_LABEL } from '../store.js';
import { availableShapes, availableColors } from '../data.js';

// 一覧のカード（番号・写真・名前。星は意味の確認前なので出さない）
export function shellCard(data, sp, rec, { href, onclick } = {}) {
  const state = cellState(rec, sp.no);
  const tag = href ? 'a' : 'button';
  const badge = rec && (state === 'filled' || state === 'check')
    ? h('span', { class: `have-badge ${state}` }, state === 'filled' ? ic('check') : '?', state === 'filled' ? '収集済' : '要確認')
    : null;
  return h(tag, {
    class: 'shell-card', href, onclick, type: href ? null : 'button',
    'aria-label': `${sp.no}番 ${sp.v.name}${rec ? `（収集箱の記録：${STATE_LABEL[state]}）` : ''}`,
  },
  h('div', { class: 'ph' }, shellImg(sp, { thumb: true })),
  h('span', { class: 'no-badge' }, sp.no),
  badge,
  h('div', { class: 'meta' },
    h('div', { class: 'nm' }, sp.v.name),
    sp.v.shape ? h('div', { class: 'sub' }, data.shapes[sp.v.shape].label) : null));
}

// 絞り込み。state = { shape, color, box }（box: '' | 'empty' | 'check' | 'unknown'）
export function filterChips(data, state, rec, onChange) {
  const wrap = h('div', { class: 'stack-sm' });
  const shapes = availableShapes(data);
  const colors = availableColors(data);
  const draw = () => {
    wrap.replaceChildren();
    if (shapes.length) {
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '形で絞り込む' });
      row.append(chip('すべての形', !state.shape, () => { state.shape = ''; }));
      for (const key of shapes) row.append(chip(data.shapes[key].label, state.shape === key, () => { state.shape = key; }, shapeIc(key)));
      wrap.append(row);
    }
    if (rec) {
      const c = counts(rec);
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '収集箱の記録で絞り込む' });
      const boxChip = (key, label, n) => chip(`${label}（${n}）`, state.box === key, () => { state.box = state.box === key ? '' : key; }, key === 'empty' ? ic('box') : null);
      row.append(boxChip('empty', '空きマスの貝', c.empty));
      if (c.check) row.append(boxChip('check', '要確認', c.check));
      if (c.unknown) row.append(boxChip('unknown', '未記録', c.unknown));
      wrap.append(row);
    }
    if (colors.length) {
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '色で絞り込む' });
      row.append(chip('すべての色', !state.color, () => { state.color = ''; }));
      for (const key of colors) {
        const col = data.colorPalette[key];
        row.append(chip(col.label, state.color === key, () => { state.color = state.color === key ? '' : key; },
          h('span', { class: 'dot', style: { background: col.hex } })));
      }
      wrap.append(row);
    }
  };
  function chip(label, pressed, set, icon) {
    return h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(pressed),
      onclick: () => { set(); draw(); onChange(state); },
    }, icon, label);
  }
  draw();
  return wrap;
}

export function applyFilters(list, state, rec) {
  return list.filter((sp) => {
    if (state.shape && sp.v.shape !== state.shape) return false;
    if (state.box && cellState(rec, sp.no) !== state.box) return false;
    if (state.color && !sp.v.colors.includes(state.color)) return false;
    return true;
  });
}

// 今の絞り込み条件を短い言葉で（例：「さくら」・二枚貝・ピンク）
export function filterLabels(data, state) {
  const out = [];
  if (state.q) out.push(`「${state.q}」`);
  if (state.shape) out.push(data.shapes[state.shape]?.label);
  if (state.color) out.push(data.colorPalette[state.color]?.label);
  if (state.box) out.push({ empty: '空きマスの貝', check: '要確認', unknown: '未記録' }[state.box]);
  return out.filter(Boolean);
}

export function hasFilter(state) {
  return !!(state.shape || state.box || state.color || state.q);
}

// 0件のとき
export function noResult(onReset) {
  return h('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } },
    h('p', null, '見つかりませんでした。'),
    h('p', { class: 'small' }, '番号（1〜36）や、ひらがなの名前でも探せます。'),
    h('button', { class: 'btn small secondary', type: 'button', onclick: onReset }, '条件を解除してすべて見る'));
}
