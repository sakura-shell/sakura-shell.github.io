// 初めての方へ：参加のしかた・収集箱の受け取り・景品（config.json の event。運営が確認した内容だけ）
import { h, ic, phrase } from '../ui.js';
import { page } from './common.js';

const mapUrl = (name) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} 石川県志賀町`)}`;

export function render(ctx) {
  const { data } = ctx;
  const ev = data.config.event;
  const main = page(ctx, { title: '初めての方へ', back: '#/' });
  const body = h('div', { class: 'stack' });
  main.append(body);
  if (!ev || ev.status !== 'confirmed') {
    body.append(h('div', { class: 'card stack-sm' }, h('p', null, '参加のご案内は準備中です。')));
    return main;
  }
  body.append(
    h('section', { class: 'card stack-sm guide-hero' },
      h('h2', { class: 'guide-title' }, phrase('増穂浦海岸で、', '36種類の秘貝を探そう。')),
      h('p', { class: 'guide-fee' }, '参加費 ', h('strong', null, ev.fee))),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '参加のしかた'),
      h('ol', { class: 'guide-steps' }, ev.steps.map((t, i) => h('li', null, h('span', { class: 'step-no' }, i + 1), h('span', null, t))))),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '収集箱（コレクションBOX）を受け取れる施設'),
      h('ul', { class: 'guide-places' }, ev.pickup.map((name) => h('li', null,
        h('span', { class: 'grow' }, name),
        h('a', { class: 'btn small soft', href: mapUrl(name), target: '_blank', rel: 'noopener' }, ic('map'), '地図'))))),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '景品（集めた種類の数に応じて）'),
      h('ul', { class: 'guide-prizes' }, ev.prizes.map((p) => h('li', null,
        h('span', { class: 'prize-n' }, h('strong', null, p.n), '種'),
        h('span', { class: 'grow' }, h('span', { class: 'block' }, p.text), p.note ? h('span', { class: 'xsmall muted block' }, `※${p.note}`) : null)))),
      h('ul', { class: 'small plain-list' }, ev.prizeNotes.map((t) => h('li', null, t)))),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, 'このサイトでできること'),
      h('div', { class: 'stack-sm' },
        h('a', { class: 'btn block', href: '#/identify' }, ic('camera'), '写真で調べる（この貝はなんだろう）'),
        h('a', { class: 'btn block secondary', href: '#/list' }, ic('search'), '貝の図鑑を見る'),
        h('a', { class: 'btn block secondary', href: '#/box' }, ic('box'), '収集箱を記録する'))),
  );
  return main;
}
