// 初めての方へ：参加のしかた・収集箱の受け取り・景品（config.json の event。運営が確認した内容だけ）
import { h, ic, phrase } from '../ui.js';
import { page } from './common.js';

const mapUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} 石川県${place.address || '志賀町'}`)}`;
const telLink = (tel) => h('a', { class: 'tel', href: `tel:${tel.replace(/-/g, '')}` }, `TEL ${tel}`);

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
  body.append(...[
    h('section', { class: 'card stack-sm guide-hero' },
      h('h2', { class: 'guide-title' }, phrase('増穂浦海岸で、', '36種類の秘貝を探そう。')),
      h('p', { class: 'guide-fee' }, '参加費 ', h('strong', null, ev.fee)),
      ev.checkedAt ? h('p', { class: 'xsmall muted' }, `この案内は ${ev.checkedAt.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')} 時点の内容です。`,
        ev.official ? h('span', null, '最新の情報は ', h('a', { href: ev.official.url, target: '_blank', rel: 'noopener' }, ev.official.label), ' でご確認ください。') : null) : null),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '参加のしかた'),
      h('ol', { class: 'guide-steps' }, ev.steps.map((t, i) => h('li', null, h('span', { class: 'step-no' }, i + 1), h('span', null, t))))),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '収集箱（コレクションBOX）を受け取れる施設'),
      h('ul', { class: 'guide-places' }, ev.pickup.map((p) => {
        const place = typeof p === 'string' ? { name: p } : p;
        return h('li', null,
          h('span', { class: 'grow' },
            h('span', { class: 'block place-name' }, place.name),
            place.address ? h('span', { class: 'small block' }, place.address) : null,
            place.tel ? h('span', { class: 'small block' }, telLink(place.tel)) : null),
          h('a', { class: 'btn small soft', href: mapUrl(place), target: '_blank', rel: 'noopener' }, ic('map'), '地図'));
      })),
      ev.access ? h('p', { class: 'small guide-access' }, h('strong', null, 'アクセス'), `　${ev.access}`) : null),
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '景品（集めた種類の数に応じて）'),
      h('ul', { class: 'guide-prizes' }, ev.prizes.map((p) => h('li', null,
        h('span', { class: 'prize-n' }, h('strong', null, p.n), '種'),
        h('span', { class: 'grow' }, h('span', { class: 'block' }, p.text), p.note ? h('span', { class: 'xsmall muted block' }, `※${p.note}`) : null)))),
      h('ul', { class: 'small plain-list' }, ev.prizeNotes.map((t) => h('li', null, t)))),
    ev.contact ? h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, 'お問い合わせ'),
      h('p', { class: 'place-name' }, ev.contact.name),
      h('p', { class: 'small' }, telLink(ev.contact.tel)),
      h('p', { class: 'xsmall muted' }, ev.contact.address)) : null,
    h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, 'このサイトでできること'),
      h('div', { class: 'stack-sm' },
        h('a', { class: 'btn block', href: '#/identify' }, ic('camera'), '写真で調べる（この貝はなんだろう）'),
        h('a', { class: 'btn block secondary', href: '#/list' }, ic('search'), '貝の図鑑を見る'),
        h('a', { class: 'btn block secondary', href: '#/box' }, ic('box'), '収集箱を記録する'))),
  ].filter(Boolean));
  return main;
}
