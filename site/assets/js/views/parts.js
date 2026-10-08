import { h, ic, shapeIc, shellImg } from '../ui.js';
import { cellState, counts, STATE_LABEL } from '../store.js';
import { availableShapes, availableColors } from '../data.js';

// 一覧のカード（番号・写真・名前。星は意味の確認前なので出さない）
export function shellCard(data, sp, rec, { href, onclick } = {}) {
  const state = cellState(rec, sp.no);
  const tag = href ? 'a' : 'button';
  const badge = rec && state === 'filled' ? h('span', { class: 'have-badge filled' }, ic('check'), '収集済') : null;
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

// 収集箱の記録での絞り込み。状態は「箱に入れた（貝あり）」と「空き」の2つ
// （キーの todo は以前のアドレス #/list?box=todo との互換のため。以前の empty・unknown・check も空きとして扱う）
export const BOX_FILTERS = [
  { key: 'todo', label: 'これから探す（空き）' },
  { key: 'filled', label: '箱に入れた' },
];
const OLD_BOX_KEYS = { empty: 'todo', unknown: 'todo', check: 'todo' };
export const normalizeBoxKey = (key) => OLD_BOX_KEYS[key] || key;

export function boxMatch(rec, no, key) {
  const s = cellState(rec, no);
  return normalizeBoxKey(key) === 'todo' ? s === 'empty' : s === 'filled';
}

// 絞り込み。state = { shape, color, box }（box: '' | 'todo' | 'filled'）
export function filterChips(data, state, rec, onChange) {
  const wrap = h('div', { class: 'stack-sm filter-groups' });
  const shapes = availableShapes(data);
  const colors = availableColors(data);
  const group = (label, row, note) => h('div', { class: 'filter-group' }, h('p', { class: 'filter-label' }, label), row, note || null);
  const draw = () => {
    wrap.replaceChildren();
    if (shapes.length) {
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '形で絞り込む' });
      row.append(chip('すべての形', !state.shape, () => { state.shape = ''; }));
      for (const key of shapes) row.append(chip(data.shapes[key].label, state.shape === key, () => { state.shape = key; }, shapeIc(key)));
      wrap.append(group('形', row));
    }
    if (rec) {
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '収集箱の記録で絞り込む' });
      for (const f of BOX_FILTERS) {
        const n = data.species.filter((sp) => boxMatch(rec, sp.no, f.key)).length;
        if (!n && f.key !== 'todo' && state.box !== f.key) continue; // 0件の条件は出さない（これから探すは常に出す）
        row.append(chip(`${f.label}（${n}）`, state.box === f.key, () => { state.box = state.box === f.key ? '' : f.key; }, f.key === 'todo' ? ic('box') : null));
      }
      wrap.append(group('収集箱の記録', row));
    }
    if (colors.length) {
      const row = h('div', { class: 'chip-wrap', role: 'group', 'aria-label': '色で絞り込む' });
      row.append(chip('すべての色', !state.color, () => { state.color = ''; }));
      for (const key of colors) {
        const col = data.colorPalette[key];
        row.append(chip(col.label, state.color === key, () => { state.color = state.color === key ? '' : key; },
          h('span', { class: 'dot', style: { background: col.hex } })));
      }
      wrap.append(group('色', row));
    }
  };
  function chip(label, pressed, set, icon) {
    return h('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(pressed),
      onclick: () => { set(); draw(); onChange(state); },
    }, icon, label);
  }
  draw();
  wrap.redraw = draw;
  return wrap;
}

export function applyFilters(list, state, rec) {
  return list.filter((sp) => {
    if (state.shape && sp.v.shape !== state.shape) return false;
    if (state.box && !boxMatch(rec, sp.no, state.box)) return false;
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
  if (state.box) out.push(BOX_FILTERS.find((f) => f.key === state.box)?.label);
  return out.filter(Boolean);
}

export function hasFilter(state) {
  return !!(state.shape || state.box || state.color || state.q);
}

// 0件のとき。reason があれば、0件になった理由と次の操作を出す
export function noResult(onReset, reason) {
  return h('div', { class: 'empty-state', style: { gridColumn: '1 / -1' } },
    h('p', null, reason?.title || '見つかりませんでした。'),
    reason ? null : h('p', { class: 'small' }, '番号（1〜36）や、ひらがなの名前でも探せます。'),
    h('div', { class: 'stack-sm', style: { maxWidth: '320px', margin: '8px auto 0' } },
      ...(reason?.actions || []).map((a) => h('button', { class: 'btn small', type: 'button', onclick: a.onclick }, a.label)),
      h('button', { class: 'btn small secondary', type: 'button', onclick: onReset }, '条件を解除してすべて見る')));
}
