// 収集箱の記録：見る／手で記録する・直す
import { h, ic, toast, confirmSheet, openSheet, formatDate, shellImg, notice, lightbox, ring, phrase } from '../ui.js';
import {
  loadBox, saveBox, clearBox, counts, STATE_LABEL, storageAvailable, isTemp, useTemp, endTemp, loadError, saveLabel,
} from '../store.js';
import { scanAvailable, scanIsPublic } from '../data.js';
import { page } from './common.js';
import { zoomableBox, legend } from './boxgrid.js';

const EDIT_STATES = ['filled', 'empty', 'check', 'unknown'];

export function render(ctx) {
  const { data, query } = ctx;
  let rec = loadBox();
  const readError = loadError();
  let editing = false;
  let editView = 'map'; // 'map'（箱の配置）| 'list'（番号順リスト）
  let selected = Number(query.get('sel')) || null;
  let work = null; // 修正中の下書き
  let dirty = false;

  const startEdit = (sel) => {
    editing = true;
    work = {};
    for (const [no, c] of Object.entries(rec?.cells || {})) work[no] = { ...c };
    dirty = false;
    selected = sel || selected || 1;
    draw();
  };
  const endEdit = () => {
    editing = false; work = null; dirty = false;
    ctx.setQuery(selected ? { sel: selected } : {}); // 再読み込みで修正中に戻らないように
    draw();
  };

  ctx.setGuard(async () => {
    if (!editing || !dirty) return true;
    return confirmSheet({ title: '修正を保存せずに移動しますか？', body: '修正した内容は保存されません。', ok: '保存せずに移動', cancel: '戻る' });
  });
  ctx.setDirty(() => editing && dirty);

  const main = page(ctx, { title: '収集箱の記録', back: '#/' });
  const body = h('div', { class: 'stack' });
  main.append(body);

  const cellsNow = () => (editing ? work : rec?.cells || {});
  const stateOf = (no) => cellsNow()[no]?.s || 'unknown';

  let boxView = null;
  let focusPanel = false;

  function onTap(no) {
    selected = no;
    focusPanel = true;
    redraw();
    // 修正中は、箱の上にあるパネルが見える位置へ移る
    if (editing) requestAnimationFrame(() => body.querySelector('.sel-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  function setState(no, s) {
    const prev = work[no];
    if (s === 'unknown') delete work[no]; // 未記録に戻す（写真・日時も消す）
    else {
      work[no] = { s, t: new Date().toISOString() };
      if (s === 'filled' && prev?.s === 'filled' && prev.img) work[no].img = prev.img; // 箱の写真は貝ありのときだけ残す
    }
    dirty = true;
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

  function goNextCheck() {
    const no = nextOf('check');
    if (!no) { toast('要確認のマスはありません'); return; }
    selected = no;
    focusPanel = true;
    boxView?.focusCell(no);
    redraw();
  }

  function redraw() {
    const x = boxView?.el.scrollLeft || 0;
    const y = window.scrollY;
    draw();
    if (boxView) boxView.el.scrollLeft = x;
    window.scrollTo(0, y);
  }

  function save() {
    const res = saveBox({ source: 'manual', cells: work });
    if (!res.ok) { offerTemp('保存できませんでした。'); return; }
    rec = loadBox() || res.record;
    toast(res.droppedImages ? '保存しました（容量のため箱の写真は省きました）' : '保存しました');
    endEdit();
  }

  // 保存できないとき：この画面を開いている間だけ使う
  function offerTemp(reason) {
    openSheet((close) => h('div', { class: 'stack' },
      h('h2', { style: { fontSize: '19px' } }, reason),
      h('p', { class: 'small' }, '「この画面を開いている間だけ使う」を選ぶと、一覧や箱の画面でこの記録を使えます。ページを閉じると消えます。前に保存した記録は変わりません。'),
      h('button', { class: 'btn block', type: 'button', onclick: () => { close(); rec = useTemp(work); toast('この画面を開いている間だけ使います'); endEdit(); } }, 'この画面を開いている間だけ使う'),
      h('button', { class: 'btn block ghost', type: 'button', onclick: close }, '修正に戻る')));
  }

  function draw() {
    const cells = cellsNow();
    const c = counts({ cells });
    body.replaceChildren();

    if (readError === 'corrupt' && !editing) {
      body.append(notice('warn', 'alert', h('p', { class: 'small' }, '保存されていた記録を読み込めませんでした。元のデータは消さずに残してあります。新しく記録して保存できます。')));
    }

    if (editing) {
      body.append(h('div', { class: 'edit-banner', role: 'status' }, ic('edit'),
        h('span', { class: 'grow' }, '記録を修正中（未保存）'),
        h('span', { class: 'small' }, `貝あり ${c.filled}/36`)));
      body.append(h('p', { class: 'xsmall muted' }, phrase('実物の箱を見ながら、', '貝を入れたマスを', '記録してください。')));
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '表示の切り替え' },
        [['map', '箱で選ぶ'], ['list', '番号順リスト']].map(([k, label]) => h('button', {
          type: 'button', 'aria-pressed': String(editView === k), onclick: () => { editView = k; draw(); },
        }, label)));
      body.append(seg);
    } else {
      body.append(h('div', { class: 'card stack-sm' },
        h('div', { class: 'summary-row' },
          ring(c.filled),
          h('div', { class: 'grow' },
            h('p', { class: 'summary-title' }, `貝あり ${c.filled}マス`),
            h('p', { class: 'small muted' }, `空き ${c.empty}・要確認 ${c.check}・未記録 ${c.unknown}`),
            rec ? h('p', { class: 'xsmall muted' }, isTemp(rec) ? '一時表示・ページを閉じると消えます' : `${formatDate(rec.savedAt)} 保存`) : null)),
        h('p', { class: 'xsmall muted' }, '記録は目安です。実物の箱を確かめてください。')));
      if (!rec) {
        body.append(notice('', 'info', h('p', { class: 'small' }, 'まだ記録がありません。実物の箱を見ながら、貝を入れたマスを記録できます。')));
      }
      if (c.check) {
        body.append(h('button', { class: 'btn block warn-btn', type: 'button', onclick: () => { selected = 0; startEdit(nextOf('check') || 1); } },
          h('span', { class: 'q', 'aria-hidden': 'true' }, '?'), `要確認 ${c.check}件を確かめる`));
      }
    }

    // 箱（またはリスト）
    if (editing && editView === 'list') {
      body.append(listEditor());
    } else {
      const opts = { cells, selected, onTap, zoom: boxView ? boxView.zoom : editing };
      boxView = zoomableBox(data, opts);
      const boxBlock = h('div', { class: 'stack-sm' },
        h('div', { class: 'row between' }, h('p', { class: 'small muted' }, '右上が1番です'), boxView.zoomButton),
        boxView.range,
        boxView.el,
        legend());
      if (editing) {
        // 修正中は、選んだマスのパネルを箱の上に置く（マスを選んでも、パネルと箱が同時に見える）
        body.append(editPanel(selected || 1), boxBlock);
      } else if (selected) {
        const panel = viewPanel(selected);
        body.append(boxBlock, panel);
        if (focusPanel) requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else {
        body.append(boxBlock, h('p', { class: 'small muted center' }, 'マスをタップすると、番号と名前を大きく表示します'));
      }
      focusPanel = false;
    }

    // 操作
    if (editing) {
      const canSave = storageAvailable();
      body.append(h('div', { class: 'bottom-actions' },
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
            if (dirty && !(await confirmSheet({ title: '修正をやめますか？', body: '修正した内容は保存されません。', ok: 'やめる', cancel: '続ける' }))) return;
            endEdit();
          } }, 'やめる'),
          canSave
            ? h('button', { class: 'btn', type: 'button', disabled: !dirty, onclick: save }, saveLabel(work))
            : h('button', { class: 'btn', type: 'button', onclick: () => { rec = useTemp(work); toast('この画面を開いている間だけ使います'); endEdit(); } }, 'この画面だけで使う'))));
      if (!canSave) body.append(notice('warn', 'alert', h('p', { class: 'small' }, 'この環境では保存できません。「この画面だけで使う」を押すと、ページを閉じるまで使えます。')));
    } else {
      const actions = h('div', { class: 'stack-sm' },
        h('button', { class: 'btn block', type: 'button', onclick: () => startEdit() }, ic('edit'), rec ? '記録を手で直す' : '手で記録する'));
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
            if (!(await confirmSheet({ title: 'この端末の記録を消しますか？', body: 'このブラウザに保存した箱の記録を消します。実物の箱の中身は変わりません。消した記録は元に戻せません。', ok: '消す', cancel: 'やめる', danger: true }))) return;
            if (!clearBox()) { toast('記録を消せませんでした。もう一度お試しください。', 4000); return; }
            rec = null;
            selected = null;
            toast('記録を消しました');
            draw();
          } }, 'この端末の記録を消す')));
      }
    }
  }

  // 見るときのパネル：「詳細を見る」と「このマスを直す」を分ける
  function viewPanel(no) {
    const sp = data.byNo[no];
    const cells = cellsNow();
    const state = stateOf(no);
    return h('section', { class: 'card stack sel-card', 'aria-label': `${no}番のマス` },
      h('div', { class: 'sel-panel' },
        h('div', { class: 'ph' }, shellImg(sp)),
        h('div', { class: 'grow' },
          h('div', { class: 'row' }, h('span', { class: 'no-badge' }, no), h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state])),
          h('div', { class: 'nm' }, sp.v.name)),
        state === 'filled' && cells[no]?.img
          ? h('button', { class: 'user-photo', type: 'button', 'aria-label': 'あなたの箱の写真を拡大', onclick: () => lightbox(cells[no].img, `${no}番のマス（あなたの箱の写真）`) },
            h('img', { src: cells[no].img, alt: '' }), h('span', { class: 'photo-label' }, '箱'))
          : null),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn small', href: `#/shell/${no}` }, '詳細を見る'),
        h('button', { class: 'btn small secondary', type: 'button', onclick: () => startEdit(no) }, ic('edit'), 'このマスを直す')));
  }

  // 修正パネル：大きい状態ボタン・前後の移動・次の要確認
  function editPanel(no) {
    const sp = data.byNo[no];
    const state = stateOf(no);
    const checks = counts({ cells: work }).check;
    return h('section', { class: 'card stack-sm sel-card', 'aria-label': `${no}番のマスを修正` },
      h('div', { class: 'sel-panel' },
        h('div', { class: 'ph' }, shellImg(sp)),
        h('div', { class: 'grow' },
          h('div', { class: 'row' }, h('span', { class: 'no-badge' }, no), h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state])),
          h('div', { class: 'nm' }, sp.v.name))),
      h('div', { class: 'state-picker four', role: 'group', 'aria-label': `${no}番の状態` },
        EDIT_STATES.map((s) => h('button', { type: 'button', 'aria-pressed': String(state === s), onclick: () => setState(no, s) },
          s === 'filled' ? ic('check') : null, s === 'unknown' ? '未記録に戻す' : STATE_LABEL[s]))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small secondary', type: 'button', onclick: () => move(-1) }, ic('back'), '前の番号'),
        h('button', { class: 'btn small secondary', type: 'button', onclick: () => move(1) }, '次の番号', ic('chevron'))),
      checks ? h('button', { class: 'btn small soft block', type: 'button', onclick: goNextCheck }, `次の要確認へ（残り${checks}）`) : null);
  }

  // 番号順のリスト（箱の配置は組み替えず、操作だけを大きくする補助）
  function listEditor() {
    const ul = h('ul', { class: 'edit-list', 'aria-label': '番号順のリスト' });
    for (let no = 1; no <= 36; no++) {
      const sp = data.byNo[no];
      const state = stateOf(no);
      const sel = h('select', { 'aria-label': `${no}番 ${sp.v.name}の状態`, onchange: (e) => { setState(no, e.target.value); } },
        EDIT_STATES.map((s) => h('option', { value: s, selected: s === state ? true : null }, STATE_LABEL[s])));
      ul.append(h('li', { dataset: { state } },
        h('span', { class: 'no-badge' }, no),
        h('span', { class: 'ph' }, shellImg(sp)),
        h('span', { class: 'nm grow' }, sp.v.name),
        sel));
    }
    return ul;
  }

  if (query.get('edit') === '1') startEdit(selected);
  else draw();
  return main;
}
