// 収集箱の記録：箱で見る／番号順リスト。押すとすぐ保存し、「取り消す」で戻せる
import { h, ic, toast, confirmSheet, formatDate, shellImg, notice, lightbox, ring, phrase } from '../ui.js';
import { loadBox, clearBox, counts, STATE_LABEL, isTemp, endTemp, loadError, storageAvailable } from '../store.js';
import { scanAvailable, scanIsPublic } from '../data.js';
import { page } from './common.js';
import { zoomableBox, legend } from './boxgrid.js';
import { choiceButtons, openChoiceSheet, STATE_HELP } from './record.js';

const VIEW_KEY = 'm36shells:box-view';

export function render(ctx) {
  const { data, query } = ctx;
  let rec = loadBox();
  const readError = loadError();
  let selected = Number(query.get('sel')) || null;
  // 表示：箱で見る（map）／番号順リスト（list）。前回の選択を覚えておく
  let view = query.get('view') || (query.get('edit') === '1' && !selected ? 'list' : null);
  if (!view) { try { view = localStorage.getItem(VIEW_KEY) || 'map'; } catch { view = 'map'; } }
  if (selected) view = 'map';

  const main = page(ctx, { title: '収集箱の記録', back: '#/' });
  const body = h('div', { class: 'stack' });
  main.append(body);

  const stateOf = (no) => rec?.cells?.[no]?.s || 'unknown';
  let boxView = null;
  let focusPanel = !!selected;

  const reload = () => { rec = loadBox(); if (main.isConnected || !body.childElementCount) redraw(); };

  function onTap(no) {
    selected = no;
    focusPanel = true;
    redraw();
  }

  function move(delta) {
    selected = ((selected || 1) - 1 + delta + 36) % 36 + 1;
    focusPanel = true;
    boxView?.focusCell(selected);
    redraw();
  }

  function nextOf(state) {
    for (let k = 1; k <= 36; k++) {
      const no = ((selected || 0) + k - 1) % 36 + 1;
      if (stateOf(no) === state) return no;
    }
    return null;
  }

  function setView(v) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* 覚えられなくても動く */ }
    draw();
  }

  function redraw() {
    const x = boxView?.el.scrollLeft || 0;
    const y = window.scrollY;
    draw();
    if (boxView) boxView.el.scrollLeft = x;
    window.scrollTo(0, y);
  }

  function draw() {
    const c = counts(rec);
    body.replaceChildren();

    if (readError === 'corrupt') {
      body.append(notice('warn', 'alert', h('p', { class: 'small' }, '保存されていた記録を読み込めませんでした。元のデータは消さずに残してあります。新しく記録すると保存できます。')));
    }

    // まとめ
    body.append(h('div', { class: 'card stack-sm' },
      h('div', { class: 'summary-row' },
        ring(c.filled),
        h('div', { class: 'grow' },
          h('p', { class: 'summary-title' }, phrase('36種類のうち、', `${c.filled}種類を集めました`)),
          h('p', { class: 'small muted' }, `要確認 ${c.check}・空き ${c.empty}・未記録 ${c.unknown}`),
          rec ? h('p', { class: 'xsmall muted' }, isTemp(rec) ? '一時記録・ページを閉じると消えます' : `${formatDate(rec.savedAt)} 保存`) : null)),
      h('p', { class: 'xsmall muted' },
        storageAvailable() ? '記録は押すとすぐ、この端末・このブラウザの中に保存されます（外部には送りません）。' : 'この環境では保存できないため、ページを閉じるまでの一時記録になります。',
        '記録は目安です。実物の箱を確かめてください。')));

    if (c.check) {
      body.append(h('button', { class: 'btn block warn-btn', type: 'button', onclick: () => { selected = 0; const no = nextOf('check'); selected = no; view = 'map'; focusPanel = true; draw(); } },
        h('span', { class: 'q', 'aria-hidden': 'true' }, '?'), `要確認 ${c.check}件を確かめる`));
    }

    // 表示の切り替え
    body.append(h('div', { class: 'seg seg-wide', role: 'group', 'aria-label': '表示の切り替え' },
      [['map', '箱で見る'], ['list', '番号順リスト']].map(([k, label]) => h('button', {
        type: 'button', 'aria-pressed': String(view === k), onclick: () => setView(k),
      }, label))));

    if (view === 'list') {
      body.append(h('p', { class: 'xsmall muted' }, '番号を押すと、大きなボタンで記録できます。'), listView());
    } else {
      const opts = { cells: rec?.cells || {}, selected, onTap, zoom: boxView ? boxView.zoom : false };
      boxView = zoomableBox(data, opts);
      const boxBlock = h('div', { class: 'stack-sm' },
        h('div', { class: 'row between' }, h('p', { class: 'small muted' }, '右上が1番です'), boxView.zoomButton),
        boxView.range,
        boxView.el,
        legend());
      if (selected) {
        // 選んだマスの記録カードを箱の上に置く（箱は位置の確認用。記録は大きなボタンで）
        const panel = selPanel(selected);
        body.append(panel, boxBlock);
        if (focusPanel) requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else {
        body.append(h('p', { class: 'small muted center' }, phrase('マスを押すと、', '大きなボタンで記録できます')), boxBlock);
      }
      focusPanel = false;
    }

    // 状態の意味
    body.append(h('section', { class: 'card flat stack-sm' },
      h('h3', { class: 'section-title' }, '記録の意味'),
      h('ul', { class: 'state-help' }, ['filled', 'check', 'empty', 'unknown'].map((s) => h('li', null,
        h('span', { class: 'state-pill', dataset: { state: s } }, STATE_LABEL[s]), STATE_HELP[s])))));

    // そのほかの操作
    const actions = h('div', { class: 'stack-sm' });
    if (scanAvailable(data)) {
      actions.append(h('a', { class: 'btn block secondary', href: '#/scan' }, ic('camera'), scanIsPublic(data) ? '収集箱を撮って読み取る' : '収集箱を撮って読み取る（試験版）'));
    }
    if (rec) actions.append(h('a', { class: 'btn block soft', href: '#/list?box=empty' }, ic('search'), '空いているマスの貝を探す'));
    body.append(actions);
    if (isTemp(rec)) {
      body.append(h('div', { class: 'center' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { endTemp(); rec = loadBox(); draw(); toast('一時記録をやめました'); } }, '一時記録をやめる')));
    } else if (rec) {
      body.append(h('div', { class: 'center' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: async () => {
          if (!(await confirmSheet({ title: 'この端末の記録をすべて消しますか？', body: 'このブラウザに保存した収集箱の記録を消します。実物の箱の中身は変わりません。消した記録は元に戻せません。', ok: '消す', cancel: 'やめる', danger: true }))) return;
          if (!clearBox()) { toast('記録を消せませんでした。もう一度お試しください。', 4000); return; }
          rec = null;
          selected = null;
          toast('記録を消しました');
          draw();
        } }, 'この端末の記録をすべて消す')));
    }
  }

  // 選んだマスの記録カード：大きなボタン・前後の番号・詳細へ
  function selPanel(no) {
    const sp = data.byNo[no];
    const state = stateOf(no);
    const cell = rec?.cells?.[no];
    const checks = counts(rec).check;
    return h('section', { class: 'card stack-sm sel-card', 'aria-label': `${no}番のマス` },
      h('div', { class: 'sel-panel' },
        h('div', { class: 'ph' }, shellImg(sp)),
        h('div', { class: 'grow' },
          h('div', { class: 'row' }, h('span', { class: 'no-badge' }, no), h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state])),
          h('div', { class: 'nm' }, sp.v.name),
          h('a', { class: 'small', href: `#/shell/${no}` }, '詳細を見る')),
        state === 'filled' && cell?.img
          ? h('button', { class: 'user-photo', type: 'button', 'aria-label': 'あなたの箱の写真を拡大', onclick: () => lightbox(cell.img, `${no}番のマス（あなたの箱の写真）`) },
            h('img', { src: cell.img, alt: '' }), h('span', { class: 'photo-label' }, '箱'))
          : null),
      choiceButtons(data, no, state, reload),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small secondary', type: 'button', onclick: () => move(-1) }, ic('back'), '前の番号'),
        h('button', { class: 'btn small secondary', type: 'button', onclick: () => move(1) }, '次の番号', ic('chevron'))),
      checks ? h('button', { class: 'btn small soft block', type: 'button', onclick: () => { const n = nextOf('check'); if (n) { selected = n; focusPanel = true; boxView?.focusCell(n); redraw(); } } }, `次の要確認へ（残り${checks}）`) : null);
  }

  // 番号順のリスト：1行ずつ大きく。押すと大きな選択カードが開く
  function listView() {
    const ul = h('ul', { class: 'record-list', 'aria-label': '番号順のリスト' });
    for (let no = 1; no <= 36; no++) {
      const sp = data.byNo[no];
      const state = stateOf(no);
      ul.append(h('li', null, h('button', { type: 'button', dataset: { state }, 'aria-label': `${no}番 ${sp.v.name}（${STATE_LABEL[state]}）を記録する`, onclick: () => openChoiceSheet(data, no, reload) },
        h('span', { class: 'no-badge' }, no),
        h('span', { class: 'ph' }, shellImg(sp, { thumb: true })),
        h('span', { class: 'nm grow' }, sp.v.name),
        h('span', { class: 'state-pill', dataset: { state } }, state === 'filled' ? '✓ 貝あり' : STATE_LABEL[state]))));
    }
    return ul;
  }

  draw();
  return main;
}
