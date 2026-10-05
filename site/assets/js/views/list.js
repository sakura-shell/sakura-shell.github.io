import { h, ic } from '../ui.js';
import { searchSpecies } from '../data.js';
import { loadBox } from '../store.js';
import { page } from './common.js';
import { shellCard, filterChips, applyFilters, noResult } from './parts.js';

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

  const grid = h('div', { class: 'shell-grid' });
  const count = h('p', { class: 'small muted', 'aria-live': 'polite' });
  const chipsHolder = h('div');

  const reset = () => {
    state.q = ''; state.shape = ''; state.color = ''; state.box = '';
    input.value = '';
    chipsHolder.replaceChildren(filterChips(data, state, rec, update));
    update();
  };

  function update() {
    const found = applyFilters(searchSpecies(data, state.q), state, rec);
    count.textContent = `${found.length}種類`;
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
  return page(ctx, { title: '貝を探す', back: '#/' },
    h('div', { class: 'stack' }, form, chipsHolder, count, grid));
}
