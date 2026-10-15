// バッジの画面部品：お祝い（もらった瞬間）とバッジ帳（収集箱の画面）
import { h, svg } from '../ui.js';
import { icon, shapeIcon } from '../icons.js';
import { BADGES, PRIZE_NOTE, earnedBadges, nextBadge } from '../lib/badges.js';
import { counts } from '../store.js';

// いまの称号（もらった中でいちばん上）
const current = (earned) => [...BADGES].reverse().find((b) => earned[b.n]) || null;

const md = (iso) => { const d = new Date(iso); return Number.isNaN(d) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`; };

// もらった瞬間のお祝い。紙ふぶきのように、淡い貝がゆっくり舞う（動きを減らす設定では舞わない）
// others：同時にもらった、ほかのバッジの数（読み取りで一気に増えたときなど）
export function celebrate(badge, filled, others = 0) {
  const prev = document.activeElement;
  const dlg = h('dialog', { class: 'celebrate', 'aria-labelledby': 'celebrate-title' });
  const close = () => { if (dlg.open) dlg.close(); dlg.remove(); prev?.focus?.({ preventScroll: true }); };
  // 紙ふぶき：サイトと同じ貝の絵（扇形・二枚貝・巻貝・笠貝）
  const shapes = [icon('shell'), shapeIcon('bivalve'), shapeIcon('gastropod'), shapeIcon('limpet')];
  const confetti = h('div', { class: 'confetti', 'aria-hidden': 'true' },
    Array.from({ length: 14 }, (_, i) => h('span', {
      class: 'piece',
      style: { '--x': `${(i * 37) % 100}%`, '--d': `${(i % 7) * 0.3}s`, '--r': `${(i * 53) % 360}deg`, '--s': `${0.7 + ((i * 29) % 5) / 10}` },
    }, svg(shapes[i % shapes.length]))));
  dlg.append(confetti, h('div', { class: 'celebrate-card' },
    h('img', { class: 'celebrate-badge', src: badge.img, alt: `バッジ「${badge.name}」`, width: 256, height: 256 }),
    h('h2', { id: 'celebrate-title' }, others === BADGES.indexOf(badge) ? '称号をゲット！' : '称号アップ！'), // 初めての称号なら「ゲット」
    h('p', { class: 'celebrate-count' }, `${filled >= 36 ? '36種類 すべて' : `${badge.n}種類`} 集めました`),
    h('p', { class: 'celebrate-name' }, 'あなたは', h('span', { class: 'block celebrate-title-name' }, `「${badge.name}」`), 'になりました'),
    others ? h('p', { class: 'small' }, `とちゅうの称号のバッジ（${others}つ）も、バッジ帳に入りました`) : null,
    h('p', { class: 'xsmall muted' }, PRIZE_NOTE),
    h('div', { class: 'stack-sm celebrate-actions' },
      h('button', { class: 'btn block', type: 'button', onclick: close }, '続ける'),
      h('a', { class: 'btn block secondary', href: '#/box?badges=1', onclick: close }, 'バッジ帳を見る'))));
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('.celebrate-actions .btn')?.focus({ preventScroll: true });
}

// バッジ帳：もらったバッジは色つき＋もらった日、まだのバッジは灰色＋あと何種類
export function badgeBook(rec) {
  const earned = earnedBadges();
  const filled = counts(rec).filled;
  const next = nextBadge(rec);
  return h('section', { class: 'card stack-sm badge-book', id: 'badges', 'aria-labelledby': 'badge-book-title' },
    h('h2', { class: 'section-title', id: 'badge-book-title' }, 'バッジ帳'),
    current(earned) ? h('p', { class: 'small' }, 'いまの称号：', h('strong', { class: 'badge-current' }, current(earned).name)) : null,
    next ? h('p', { class: 'small' }, `あと${next.left}種類で「${next.badge.name}」に${current(earned) ? '昇格' : 'なれます'}`) : h('p', { class: 'small' }, 'すべての称号がそろいました。あなたは三十六歌仙です！'),
    h('ul', { class: 'badge-grid' }, BADGES.map((b) => {
      const got = earned[b.n];
      return h('li', { class: got ? 'got' : 'locked' },
        h('img', { src: b.img, alt: '', width: 128, height: 128, loading: 'lazy' }),
        h('span', { class: 'badge-name' }, b.name),
        h('span', { class: 'xsmall muted' }, got ? `${md(got)}にもらいました` : `${b.n}種類で（あと${Math.max(0, b.n - filled)}種類）`),
        h('span', { class: 'visually-hidden' }, got ? 'もらったバッジ' : 'まだのバッジ'));
    })),
    h('p', { class: 'xsmall muted' }, `バッジは、この端末の記録で表示されます。${PRIZE_NOTE}`));
}

// まとめの欄に置く、小さなバッジの列（押すとバッジ帳へ）
export function badgeStrip(rec, onOpen) {
  const earned = earnedBadges();
  const cur = current(earned);
  return h('button', { class: 'badge-strip', type: 'button', 'aria-label': `バッジ帳を見る（いまの称号：${cur ? cur.name : 'まだありません'}）`, onclick: onOpen },
    h('span', { class: 'badge-strip-icons' }, BADGES.map((b) => h('img', { src: b.img, alt: '', width: 36, height: 36, class: earned[b.n] ? 'got' : 'locked' }))),
    h('span', { class: 'small strong' }, cur ? cur.name : '称号はまだ'),
    h('span', { class: 'go-label' }, 'バッジ帳'));
}
