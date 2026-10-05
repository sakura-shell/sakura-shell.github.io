import { h, ic } from '../ui.js';
import { searchSpecies } from '../data.js';
import { loadBox } from '../store.js';
import { page } from './common.js';
import { shellCard, filterChips, applyFilters, noResult, filterLabels, hasFilter } from './parts.js';

export function render(ctx) {
  const { data, query } = ctx;
  const rec = loadBox();
  const box = query.get('box') || (query.get('todo') === '1' ? 'empty' : '');
  const state = {
    q: query.get('q') || '',
    shape: query.get('shape') || '',
    color: query.get('color') || '',
    box: rec && ['empty', 'check', 'unknown'].includes(box) ? box : '',
  };

  // 写真の大きさ（大きく＝2列／小さく＝3列）。端末ごとに覚えておく
  let big = true;
  try { big = localStorage.getItem('m36shells:list-size') !== 'small'; } catch { /* 既定は大きく */ }
  const grid = h('div', { class: `shell-grid${big ? ' big' : ''}` });
  const count = h('p', { class: 'filter-count', 'aria-live': 'polite' });
  const conds = h('p', { class: 'small filter-conds' });
  const clearBtn = h('button', { class: 'btn small secondary', type: 'button', onclick: () => reset() }, ic('close'), '条件をクリア');
  const status = h('div', { class: 'filter-status' }, h('div', { class: 'grow' }, count, conds), clearBtn);
  const sizeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '写真の大きさ' },
    [[true, '大きく'], [false, '小さく']].map(([v, label]) => h('button', {
      type: 'button', 'aria-pressed': String(big === v),
      onclick: (e) => {
        big = v; grid.classList.toggle('big', big);
        try { localStorage.setItem('m36shells:list-size', big ? 'big' : 'small'); } catch { /* 覚えなくても動く */ }
        sizeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      },
    }, label)));
  const chipsHolder = h('div');

  const reset = () => {
    state.q = ''; state.shape = ''; state.color = ''; state.box = '';
    input.value = '';
    chipsHolder.replaceChildren(filterChips(data, state, rec, update));
    update();
  };

  function update() {
    const found = applyFilters(searchSpecies(data, state.q), state, rec);
    const labels = filterLabels(data, state);
    count.textContent = labels.length ? `36種類中 ${found.length}種類` : `36種類すべて`;
    conds.textContent = labels.length ? `絞り込み：${labels.join('・')}` : '';
    conds.hidden = !labels.length;
    clearBtn.hidden = !hasFilter(state);
    if (found.length) grid.replaceChildren(...found.map((sp) => shellCard(data, sp, rec, { href: `#/shell/${sp.no}` })));
    else grid.replaceChildren(noResult(reset));
    const params = {};
    if (state.q) params.q = state.q;
    if (state.shape) params.shape = state.shape;
    if (state.color) params.color = state.color;
    if (state.box) params.box = state.box;
    ctx.setQuery(params);
  }

  const input = h('input', {
    type: 'search', inputmode: 'search', enterkeyhint: 'search', autocomplete: 'off',
    placeholder: '番号や名前（例：12、さくら）', value: state.q, 'aria-label': '番号や名前で探す',
    oninput: (e) => { state.q = e.target.value; update(); },
  });
  const form = h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); input.blur(); } },
    ic('search'), input,
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': '入力を消す', onclick: () => { input.value = ''; state.q = ''; update(); input.focus(); } }, ic('close')));

  chipsHolder.append(filterChips(data, state, rec, update));
  update();
  return page(ctx, { title: '貝の図鑑', back: '#/' },
    h('div', { class: 'stack' }, form, chipsHolder, status, h('div', { class: 'row between' }, h('span', { class: 'xsmall muted' }, '写真の大きさ'), sizeSeg), grid));
}
