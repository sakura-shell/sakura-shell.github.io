// 収集箱への記録（貝の詳細・収集箱の画面で共通）
// 押すとすぐ、この端末・このブラウザに保存する。間違えたときは「取り消す」で元に戻せる。
import { h, ic, toast, toastAction, openSheet, formatDate, shellImg } from '../ui.js';
import { loadBox, setCell, restoreCell, useTemp, STATE_LABEL, cellState } from '../store.js';

// 記録の状態は2つ：「箱に入れた（貝あり）」と「空き」
export const FOUND_LABEL = '見つけた！箱に入れる';
export const REMOVE_LABEL = '箱から出す（空きにする）';

// 状態の意味（凡例の説明）
export const STATE_HELP = {
  filled: '見つけて、箱に入れた貝',
  empty: 'まだ入れていない（記録していない番号も空き）',
};

// この記録はアプリの中だけのもの。実物の箱は変わらないことを、短く添える
export const RECORD_NOTE = 'この端末の記録だけが変わります（実物の箱はそのままです）。';

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
  const what = state === 'filled' ? '「箱に入れた」と記録しました' : '「空き」と記録しました';
  toastAction(`${no}番 ${sp.v.name}：${what}${res.droppedImages ? '（容量のため箱の写真は省きました）' : ''}`, '取り消す', () => {
    const back = restoreCell(no, res.prev);
    toast(back.ok ? '元に戻しました' : '元に戻せませんでした', 2600);
    onDone?.();
  });
}

// 大きな選択ボタン：空きなら「見つけた！箱に入れる」、入れてあれば「箱から出す」
export function choiceButtons(data, no, current, onDone, { onPicked } = {}) {
  const pick = (st) => { onPicked?.(); recordCell(data, no, st, onDone); };
  return h('div', { class: 'choice', role: 'group', 'aria-label': `${no}番の記録` },
    current === 'filled'
      ? h('p', { class: 'recorded' }, ic('check'), h('span', null, '箱に入れた（貝あり）'))
      : h('button', { class: 'choice-main', type: 'button', onclick: () => pick('filled') },
        ic('check'), h('span', null, h('span', { class: 'cl' }, FOUND_LABEL))),
    current === 'filled'
      ? h('button', { class: 'btn block secondary small', type: 'button', onclick: () => pick('empty') }, REMOVE_LABEL)
      : null);
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

// 貝の詳細に置く記録の欄（空きなら「見つけた！箱に入れる」、入れてあれば「箱に入れた」と「箱から出す」）
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
        h('p', { class: 'recorded' }, ic('check'), h('span', null, '箱に入れた（貝あり）'), when ? h('span', { class: 'xsmall muted' }, when) : ''),
        h('button', { class: 'btn block secondary small', type: 'button', onclick: () => recordCell(data, sp.no, 'empty', draw) }, REMOVE_LABEL));
    } else {
      wrap.append(
        h('button', { class: 'btn block found-btn', type: 'button', 'aria-label': `見つけた！ ${sp.no}番 ${sp.v.name}を箱に入れたと記録する`, onclick: () => recordCell(data, sp.no, 'filled', draw) },
          ic('check'), FOUND_LABEL));
    }
    wrap.append(h('p', { class: 'xsmall muted' }, RECORD_NOTE));
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
        ? h('p', { class: 'recorded' }, ic('check'), h('span', null, justSaved ? `${sp.no}番 ${sp.v.name}を「箱に入れた」と記録しました` : `${sp.no}番 ${sp.v.name}は箱に入れてあります（貝あり）`))
        : h('button', { class: 'btn block found-btn', type: 'button', 'aria-label': `見つけた！ ${sp.no}番 ${sp.v.name}を箱に入れたと記録する`, onclick: () => recordCell(data, sp.no, 'filled', () => draw(true)) },
          ic('check'), FOUND_LABEL),
      state === 'filled' && onNext
        ? h('button', { class: 'btn block secondary', type: 'button', onclick: onNext }, ic('camera'), '次の貝を調べる')
        : null,
      state === 'filled'
        ? h('a', { class: 'small', href: '#/box' }, '収集箱の記録を見る')
        : h('p', { class: 'xsmall muted' }, `${sp.no}番 ${sp.v.name}として記録します。${RECORD_NOTE}間違えたときは「取り消す」で戻せます。`),
    ].filter(Boolean));
  };
  draw(false);
  return wrap;
}
