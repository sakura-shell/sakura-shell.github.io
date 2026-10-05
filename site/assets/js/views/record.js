// 収集箱への記録（貝の詳細・収集箱の画面で共通）
// 押すとすぐ、この端末・このブラウザに保存する。間違えたときは「取り消す」で元に戻せる。
import { h, ic, toast, toastAction, openSheet, formatDate, shellImg } from '../ui.js';
import { loadBox, setCell, restoreCell, useTemp, STATE_LABEL, cellState } from '../store.js';

// 記録の選び方。「見つけた！」を中心に、ほかは短い説明つき
export const CHOICES = [
  { s: 'filled', label: '見つけた！', desc: '箱に入れた（貝あり）', primary: true },
  { s: 'check', label: '自信がない', desc: '合っているか確かめたい（要確認）' },
  { s: 'empty', label: 'まだ', desc: 'まだ入れていない（空き）' },
  { s: 'unknown', label: '記録を消す', desc: '記録していない状態に戻す' },
];

// 4つの状態の意味（凡例の説明）
export const STATE_HELP = {
  filled: '箱に入れた',
  check: '合っているか確かめたい',
  empty: 'まだ入れていない',
  unknown: 'まだ記録していない',
};

// 記録して保存し、「取り消す」を出す。onDone は保存・取り消しのあとに呼ぶ（画面の描き直し）
export function recordCell(data, no, state, onDone) {
  const sp = data.byNo[no];
  const res = setCell(no, state);
  if (!res.ok) {
    // 保存できない環境：この画面を開いている間だけ使う
    openSheet((close) => h('div', { class: 'stack' },
      h('h2', { style: { fontSize: '19px' } }, '保存できませんでした'),
      h('p', { class: 'small' }, 'この環境（プライベートモードなど）では、記録を端末に保存できません。「この画面を開いている間だけ使う」を選ぶと、ページを閉じるまで記録を使えます。'),
      h('button', { class: 'btn block', type: 'button', onclick: () => { close(); useTemp(res.cells); toast('この画面を開いている間だけ使います'); onDone?.(); } }, 'この画面を開いている間だけ使う'),
      h('button', { class: 'btn block ghost', type: 'button', onclick: close }, 'やめる')));
    return;
  }
  onDone?.();
  const what = state === 'unknown' ? '記録を消しました' : `「${STATE_LABEL[state]}」で保存しました`;
  toastAction(`${no}番 ${sp.v.name}：${what}${res.droppedImages ? '（容量のため箱の写真は省きました）' : ''}`, '取り消す', () => {
    const back = restoreCell(no, res.prev);
    toast(back.ok ? '元に戻しました' : '元に戻せませんでした', 2600);
    onDone?.();
  });
}

// 大きな選択ボタン（「見つけた！」を大きく、ほかは下に並べる）
export function choiceButtons(data, no, current, onDone, { onPicked } = {}) {
  const pick = (s) => { onPicked?.(); recordCell(data, no, s, onDone); };
  const [main, ...rest] = CHOICES;
  return h('div', { class: 'choice', role: 'group', 'aria-label': `${no}番の記録` },
    h('button', { class: `choice-main${current === main.s ? ' on' : ''}`, type: 'button', 'aria-pressed': String(current === main.s), onclick: () => pick(main.s) },
      ic('check'), h('span', null, h('span', { class: 'cl' }, main.label), h('span', { class: 'cd' }, main.desc))),
    h('div', { class: 'choice-sub' }, rest.map((c) => h('button', {
      // 「記録を消す」は操作なので、未記録のマスでも選択中の色にしない
      type: 'button', 'aria-pressed': String(c.s !== 'unknown' && current === c.s), dataset: { state: c.s },
      onclick: () => pick(c.s),
    }, h('span', { class: 'cl' }, c.label), h('span', { class: 'cd' }, c.desc)))));
}

// 選択シート（番号順リストや詳細から開く大きな選択カード）
export function openChoiceSheet(data, no, onDone) {
  const sp = data.byNo[no];
  const rec = loadBox();
  const state = cellState(rec, no);
  openSheet((close) => h('div', { class: 'stack' },
    h('div', { class: 'sel-panel' },
      h('div', { class: 'ph' }, shellImg(sp)),
      h('div', { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'no-badge' }, no), h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state])),
        h('div', { class: 'nm' }, sp.v.name))),
    choiceButtons(data, no, state, onDone, { onPicked: close }),
    h('button', { class: 'btn block ghost', type: 'button', onclick: close }, '閉じる')));
}

// 貝の詳細に置く記録の欄（未記録なら「見つけた！」、記録済みなら「記録済み」と「記録を変更」）
export function recordBlock(data, sp) {
  const wrap = h('div', { class: 'stack-sm' });
  const draw = () => {
    const rec = loadBox();
    const state = cellState(rec, sp.no);
    const cell = rec?.cells?.[sp.no];
    const when = cell?.t && !rec.temp ? formatDate(cell.t) : '';
    wrap.replaceChildren();
    if (state === 'filled') {
      wrap.append(
        h('p', { class: 'recorded' }, ic('check'), h('span', null, '記録済み（貝あり）'), when ? h('span', { class: 'xsmall muted' }, when) : ''),
        h('button', { class: 'btn block secondary', type: 'button', onclick: () => openChoiceSheet(data, sp.no, draw) }, ic('edit'), '記録を変更'));
    } else {
      wrap.append(...[
        h('button', { class: 'btn block found-btn', type: 'button', onclick: () => recordCell(data, sp.no, 'filled', draw) },
          ic('check'), '見つけた！ 収集箱に記録する'),
        state !== 'unknown'
          ? h('p', { class: 'small' }, '今の記録：', h('span', { class: 'state-pill', dataset: { state } }, STATE_LABEL[state]), when ? h('span', { class: 'xsmall muted' }, `　${when}`) : null)
          : null,
        h('button', { class: 'btn block ghost small', type: 'button', onclick: () => openChoiceSheet(data, sp.no, draw) }, 'そのほかの記録（自信がない・まだ など）'),
      ].filter(Boolean));
    }
    wrap.append(h('p', { class: 'xsmall muted' }, '記録は、この端末・このブラウザの中に保存されます（外部には送りません）。'));
  };
  draw();
  return wrap;
}

// 写真で調べたあとに、その場で記録する欄（「この貝だった！」→ 記録 → 次の貝を調べる）
// onNext：次の貝を調べる（撮った写真を消して、写真で調べる画面へ）
export function foundBlock(data, sp, { onNext, lead } = {}) {
  const wrap = h('div', { class: 'stack-sm' });
  const draw = (justSaved) => {
    const rec = loadBox();
    const state = cellState(rec, sp.no);
    wrap.replaceChildren(...[
      lead ? h('p', { class: 'small' }, lead) : null,
      state === 'filled'
        ? h('p', { class: 'recorded' }, ic('check'), h('span', null, justSaved ? `${sp.no}番 ${sp.v.name}を記録しました` : `${sp.no}番 ${sp.v.name}は記録済み（貝あり）`))
        : h('button', { class: 'btn block found-btn', type: 'button', onclick: () => recordCell(data, sp.no, 'filled', () => draw(true)) },
          ic('check'), `この貝だった！ ${sp.no}番を記録する`),
      state === 'filled' && onNext
        ? h('button', { class: 'btn block secondary', type: 'button', onclick: onNext }, ic('camera'), '次の貝を調べる')
        : null,
      state === 'filled'
        ? h('a', { class: 'small', href: '#/box' }, '収集箱の記録を見る')
        : h('p', { class: 'xsmall muted' }, '押すとすぐ収集箱に記録されます。間違えたときは「取り消す」で戻せます。'),
    ].filter(Boolean));
  };
  draw(false);
  return wrap;
}
