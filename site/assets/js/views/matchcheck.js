// 「この貝で合っているかな？」見比べチェック
// 利用者が写真を見比べて、項目ごとに「似ている／ちがう／わからない」を選ぶ。
// 表示するのは本人が選んだ結果の数だけ（自動の判定ではない）。
//
// AIの判定を使っているときは、その貝の％も並べて出す。
import { h, ic, lightbox } from '../ui.js';

// どの貝にも当てはまる、見比べる観点（貝ごとの特徴を断定するものではない）
const BASE_ITEMS = [
  { key: 'shape', label: '全体の形', hint: '丸い・三角っぽい・細長い・巻いている など' },
  { key: 'color', label: '色', hint: '白・ピンク・オレンジ・茶・むらさき など' },
  { key: 'pattern', label: '模様', hint: 'すじ・点・うず・もようの入り方' },
  { key: 'edge', label: 'ふち', hint: 'ぎざぎざ・なめらか・切れ目がある など' },
];
const ANSWERS = [['yes', '似ている'], ['no', 'ちがう'], ['unsure', 'わからない']];

export function matchCheck(data, sp, session) {
  session.checks ||= {};
  const answers = (session.checks[sp.no] ||= {});
  // 確認済みの見分けるポイントがあれば、観点に加える
  const items = BASE_ITEMS.concat(sp.v.features.filter((f) => f.status === 'confirmed').map((f, i) => ({ key: `f${i}`, label: '見分けるポイント', hint: f.text })));

  const summary = h('div', { class: 'check-summary', 'aria-live': 'polite' });
  const list = h('ul', { class: 'check-list' });

  const drawSummary = () => {
    const n = items.length;
    const yes = items.filter((it) => answers[it.key] === 'yes').length;
    const no = items.filter((it) => answers[it.key] === 'no').length;
    const unsure = items.filter((it) => answers[it.key] === 'unsure').length;
    const done = yes + no + unsure;
    const parts = [h('p', { class: 'check-count' }, h('strong', null, `${n}つのうち${yes}つ`), 'が似ている',
      no ? `・${no}つがちがう` : '', unsure ? `・${unsure}つがわからない` : '')];
    parts.push(h('div', { class: 'check-dots', 'aria-hidden': 'true' },
      items.map((it) => h('span', { class: `dot-${answers[it.key] || 'none'}` }))));
    let msg = null;
    if (done < n) msg = h('p', { class: 'small muted' }, `あと${n - done}つ、見比べてみましょう。`);
    else if (no) {
      msg = h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, 'ちがうところがあります。ほかの貝とも見比べてみましょう。'),
        h('a', { class: 'btn small secondary', href: '#/compare/photo' }, ic('compare'), 'ほかの貝と見比べる'));
    } else if (yes === n) {
      msg = h('div', { class: 'stack-sm' },
        h('p', { class: 'small' }, h('strong', null, `${sp.no}番 ${sp.v.name}かもしれません。`), '箱に入れる前に、もう一度写真とよく見比べてね。'),
        h('div', { class: 'btn-row' },
          h('a', { class: 'btn small secondary', href: `#/shell/${sp.no}` }, '詳細を見る'),
          h('a', { class: 'btn small', href: `#/box?sel=${sp.no}` }, ic('box'), `${sp.no}番を記録`)));
    } else {
      msg = h('p', { class: 'small' }, 'わからないところは、裏側も撮ったり、写真を拡大したりすると見比べやすくなります。');
    }
    summary.replaceChildren(...parts, msg);
  };

  for (const it of items) {
    const seg = h('div', { class: 'seg check-seg', role: 'group', 'aria-label': `${it.label}：似ているか` },
      ANSWERS.map(([val, label]) => h('button', {
        type: 'button', 'aria-pressed': String(answers[it.key] === val),
        onclick: (e) => {
          answers[it.key] = answers[it.key] === val ? undefined : val;
          seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget && answers[it.key] === val)));
          drawSummary();
        },
      }, label)));
    list.append(h('li', null,
      h('div', null, h('strong', null, it.label), h('span', { class: 'hint' }, it.hint)),
      seg));
  }
  drawSummary();

  // 答えている間も2枚の写真が見えるよう、小さく上に固定する
  const mine = session.photos[0];
  const ref = sp.v.photos[0];
  const pair = h('div', { class: 'check-sticky' },
    mine ? h('button', { class: 'user-photo', type: 'button', 'aria-label': 'あなたの写真を拡大', onclick: () => lightbox(mine.src, 'あなたの写真') },
      h('img', { src: mine.src, alt: '' }), h('span', { class: 'photo-label' }, 'あなた')) : null,
    ref ? h('button', { class: 'user-photo ref', type: 'button', 'aria-label': '図鑑の写真を拡大', onclick: () => lightbox(ref.src, `${sp.no}番 ${sp.v.name}`) },
      h('img', { src: ref.src, alt: '' }), h('span', { class: 'photo-label' }, '図鑑')) : null,
    h('span', { class: 'small' }, h('span', { class: 'no-badge' }, sp.no), ' ', sp.v.name));

  return h('section', { class: 'card stack-sm match-check' },
    h('h2', { class: 'section-title' }, 'この貝で合っているかな？'),
    h('p', { class: 'small muted' }, 'あなたの写真と図鑑の写真を見比べて、1つずつ選んでね。'),
    pair,
    list,
    summary,
    h('p', { class: 'xsmall muted' }, 'この結果は、あなたが見比べて選んだものです。自動の判定ではありません。'),
    aiScore(sp, session));
}

// AIの判定があるとき：この貝の％と順位
function aiScore(sp, session) {
  const all = session.result?.all;
  if (!all) return null;
  const i = all.findIndex((x) => x.no === sp.no);
  if (i < 0) return null;
  return h('div', { class: 'ai-mini' },
    h('p', null, ic('magic'), ' AIの判定：', h('strong', null, `${Math.round(all[i].p * 100)}%`), `（36種類中 ${i + 1}番目）`),
    h('p', { class: 'xsmall muted' }, 'AIの判定は目安です。見比べチェックと合わせて確かめてね。'));
}
