import { h, ic } from '../ui.js';
import { STATE_LABEL } from '../store.js';

// 実物の箱と同じ 4行×9列 のマス。番号の位置はマスターデータの box.row / box.col に従う
// cells: { [no]: { s, img } }。タップは「選ぶ」だけで、状態は変えない
export function boxGrid(data, { cells = {}, selected = null, highlight = null, changed = null, zoom = false, mini = false, allThumbs = false, onTap } = {}) {
  const grid = h('div', {
    class: `box${zoom ? ' zoom' : ''}${mini ? ' mini' : ''}`,
    role: mini ? 'img' : 'group',
    'aria-label': mini ? `箱の中の位置（${highlight}番）` : '箱の36マス（右上が1番）',
  });
  for (let row = 1; row <= data.box.rows; row++) {
    for (let col = 1; col <= data.box.cols; col++) {
      const sp = data.byPos[`${row}-${col}`];
      const cell = cells[sp.no];
      const state = cell?.s === 'filled' ? 'filled' : (cell?.s === 'check' ? 'check' : 'empty'); // check は読み取りの確認中だけ
      const cls = ['cell'];
      if (highlight === sp.no) cls.push('hl');
      if (changed?.has(sp.no)) cls.push('changed');
      const el = h(mini ? 'div' : 'button', {
        class: cls.join(' '),
        type: mini ? null : 'button',
        dataset: { state, no: sp.no, col },
        style: { gridRow: row, gridColumn: col },
        'aria-current': selected === sp.no ? 'true' : null,
        'aria-label': mini ? null : `${sp.no}番 ${sp.v.name}：${STATE_LABEL[state] || 'どちらか選ぶ'}${changed?.has(sp.no) ? '（前回と違う）' : ''}`,
        onclick: onTap ? () => onTap(sp.no) : null,
      });
      if (!mini && cell?.img && (state === 'filled' || allThumbs)) el.append(h('img', { class: 'thumb', src: cell.img, alt: '' }));
      el.append(h('span', { class: 'num' }, sp.no));
      if (!mini) {
        el.append(markFor(state));
        el.append(h('span', { class: 'nm' }, sp.v.name));
      }
      grid.append(el);
    }
  }
  return grid;
}

function markFor(state) {
  const m = h('span', { class: 'mark', 'aria-hidden': 'true' });
  if (state === 'filled') m.append(ic('check'));
  else if (state === 'check') m.append('?'); // 読み取りで決めきれなかったマス（保存前に選んでもらう）
  return m;
}

// withUndecided：箱の読み取りの確認中（決めきれなかったマスがあるとき）だけ「?」を出す
export function legend({ withUndecided = false } = {}) {
  return h('div', { class: 'legend', 'aria-hidden': 'true' },
    h('span', null, h('i', { class: 'l-filled' }, '✓'), '箱に入れた（貝あり）'),
    h('span', null, h('i', { class: 'l-empty' }), '空き'),
    withUndecided ? h('span', null, h('i', { class: 'l-check' }, '?'), 'どちらか選ぶ') : null);
}

// 拡大表示の切り替え付きの箱。拡大中は、箱のどの範囲を見ているかを小さな帯で示す
export function zoomableBox(data, opts) {
  let zoom = !!opts.zoom;
  const scroller = h('div', { class: 'box-scroll' });
  const btn = h('button', { class: 'btn small soft', type: 'button' });
  const strip = h('div', { class: 'range-strip', 'aria-hidden': 'true' },
    Array.from({ length: data.box.cols }, () => h('span')));
  const hint = h('p', { class: 'xsmall muted range-hint' }, '← 横に動かせます →');
  const rangeWrap = h('div', { class: 'range-wrap' }, strip, hint);

  const updateRange = () => {
    if (!zoom) return;
    const s = scroller.getBoundingClientRect();
    const cells = scroller.querySelectorAll('.cell[data-state]');
    const visible = new Set();
    cells.forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.right > s.left + 8 && r.left < s.right - 8) visible.add(Number(c.dataset.col));
    });
    [...strip.children].forEach((seg, i) => seg.classList.toggle('on', visible.has(i + 1)));
  };
  scroller.addEventListener('scroll', () => requestAnimationFrame(updateRange), { passive: true });

  const draw = () => {
    scroller.replaceChildren(boxGrid(data, { ...opts, zoom }));
    btn.replaceChildren(ic(zoom ? 'zoomOut' : 'zoomIn'), zoom ? '全体を見る' : '拡大する');
    btn.setAttribute('aria-pressed', String(zoom));
    rangeWrap.hidden = !zoom;
    if (zoom) requestAnimationFrame(() => { scrollToCell(scroller, opts.selected); updateRange(); });
  };
  btn.addEventListener('click', () => { zoom = !zoom; opts.onZoom?.(zoom); draw(); });
  draw();
  return {
    el: scroller,
    zoomButton: btn,
    range: rangeWrap,
    redraw(newOpts) { Object.assign(opts, newOpts); const x = scroller.scrollLeft; draw(); scroller.scrollLeft = x; updateRange(); },
    focusCell(no) { if (zoom) { scrollToCell(scroller, no); updateRange(); } },
    get zoom() { return zoom; },
  };
}

function scrollToCell(scroller, no) {
  const target = no ? scroller.querySelector(`[data-no="${no}"]`) : null;
  if (target) {
    const r = target.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    scroller.scrollLeft += r.left - s.left - s.width / 2 + r.width / 2;
  } else {
    scroller.scrollLeft = scroller.scrollWidth; // 1番のある右端から
  }
}
