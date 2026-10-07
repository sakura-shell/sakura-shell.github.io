import { h, ic } from '../ui.js';
import { searchSpecies } from '../data.js';
import { loadBox, counts } from '../store.js';
import { page } from './common.js';
import { shellCard, filterChips, applyFilters, noResult, hasFilter, BOX_FILTERS, boxMatch } from './parts.js';

const OPEN_KEY = 'm36shells:list-filter-open';

export function render(ctx) {
  const { data, query } = ctx;
  const rec = loadBox();
  const box = query.get('box') || (query.get('todo') === '1' ? 'todo' : '');
  const state = {
    q: query.get('q') || '',
    shape: query.get('shape') || '',
    color: query.get('color') || '',
    box: rec && BOX_FILTERS.some((f) => f.key === box) ? box : '',
  };

  // 写真の大きさ（大きく＝2列／小さく＝3列）。端末ごとに覚えておく
  let big = true;
  try { big = localStorage.getItem('m36shells:list-size') !== 'small'; } catch { /* 既定は大きく */ }
  // 絞り込みの開閉（閉じても条件は残る）
  let open = false;
  try { open = sessionStorage.getItem(OPEN_KEY) === '1'; } catch { /* 既定は閉じる */ }

  const grid = h('div', { class: `shell-grid${big ? ' big' : ''}` });
  const count = h('p', { class: 'filter-count', 'aria-live': 'polite' });
  const tags = h('div', { class: 'filter-tags' });
  const panel = h('div', { class: 'filter-panel card flat', id: 'filter-panel' });
  const toggleBtn = h('button', { class: 'chip filter-toggle', type: 'button', 'aria-controls': 'filter-panel', onclick: () => setOpen(!open) });
  const sizeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': '写真の大きさ' },
    [[true, '大きく'], [false, '小さく']].map(([v, label]) => h('button', {
      type: 'button', 'aria-pressed': String(big === v),
      onclick: (e) => {
        big = v; grid.classList.toggle('big', big);
        try { localStorage.setItem('m36shells:list-size', big ? 'big' : 'small'); } catch { /* 覚えなくても動く */ }
        sizeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
      },
    }, label)));
  const chips = filterChips(data, state, rec, () => update());
  panel.append(chips);

  function setOpen(v) {
    open = v;
    try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* 覚えなくても動く */ }
    drawToggle();
  }

  function activeCount() {
    return [state.shape, state.color, state.box].filter(Boolean).length;
  }

  function drawToggle() {
    panel.hidden = !open;
    toggleBtn.setAttribute('aria-expanded', String(open));
    const n = activeCount();
    toggleBtn.replaceChildren(...[ic('search'), '絞り込み', n ? h('span', { class: 'badge' }, n) : null, h('span', { class: `caret${open ? ' up' : ''}`, 'aria-hidden': 'true' }, '▾')].filter(Boolean));
  }

  const reset = () => {
    state.q = ''; state.shape = ''; state.color = ''; state.box = '';
    input.value = '';
    chips.redraw();
    update();
  };

  // 選んでいる条件を、外せるタグで出す
  function drawTags() {
    const list = [];
    const tag = (label, clear) => h('button', { class: 'chip tag-chip', type: 'button', 'aria-label': `「${label}」の条件を外す`, onclick: () => { clear(); chips.redraw(); update(); } }, label, ic('close'));
    if (state.q) list.push(tag(`「${state.q}」`, () => { state.q = ''; input.value = ''; }));
    if (state.shape) list.push(tag(data.shapes[state.shape]?.label, () => { state.shape = ''; }));
    if (state.box) list.push(tag(BOX_FILTERS.find((f) => f.key === state.box)?.label, () => { state.box = ''; }));
    if (state.color) list.push(tag(data.colorPalette[state.color]?.label, () => { state.color = ''; }));
    if (list.length > 1 || (list.length && !state.q)) list.push(h('button', { class: 'btn small ghost', type: 'button', onclick: reset }, 'すべて解除'));
    tags.replaceChildren(...list);
    tags.hidden = !list.length;
  }

  // 0件のとき：理由が記録の絞り込みなら、その説明と次の操作を出す
  function reasonFor(found) {
    if (found.length || !state.box) return null;
    const withoutBox = applyFilters(searchSpecies(data, state.q), { ...state, box: '' }, rec);
    if (!withoutBox.length) return null; // 記録以外の条件でも0件なら、ふつうの案内
    const n = (key) => data.species.filter((sp) => boxMatch(rec, sp.no, key)).length;
    const go = (key) => () => { state.box = key; chips.redraw(); update(); };
    const c = counts(rec);
    const actions = [];
    if (state.box !== 'unknown' && n('unknown')) actions.push({ label: `まだ記録していない ${n('unknown')}種類を見る`, onclick: go('unknown') });
    if (state.box !== 'todo' && n('todo')) actions.push({ label: `これから探す ${n('todo')}種類を見る`, onclick: go('todo') });
    const titles = {
      empty: '空きと記録したマスはありません。',
      unknown: 'まだ記録していない貝はありません。',
      check: '要確認のマスはありません。',
      filled: c.filled ? 'この条件で集めた貝はありません。' : 'まだ集めた貝はありません。',
      todo: 'これから探す貝はありません。すべて集まっています！',
    };
    return { title: titles[state.box] || '見つかりませんでした。', actions };
  }

  function update() {
    const found = applyFilters(searchSpecies(data, state.q), state, rec);
    count.textContent = hasFilter(state) ? `${found.length}種類（36種類中）` : '36種類';
    drawTags();
    drawToggle();
    if (found.length) grid.replaceChildren(...found.map((sp) => shellCard(data, sp, rec, { href: `#/shell/${sp.no}` })));
    else grid.replaceChildren(noResult(reset, reasonFor(found)));
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

  update();
  return page(ctx, { title: '貝の図鑑', back: '#/' },
    h('div', { class: 'stack list-top' },
      form,
      h('div', { class: 'filter-bar' }, toggleBtn, tags),
      panel,
      h('div', { class: 'row between list-meta' }, count, sizeSeg),
      grid));
}
