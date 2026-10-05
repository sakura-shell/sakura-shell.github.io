import { h, ic, svg, formatDate, phrase, ring } from '../ui.js';
import { artIcon } from '../icons.js';
import { loadBox, counts, storageAvailable, isTemp } from '../store.js';
import { brandShown, scanAvailable } from '../data.js';

export function render(ctx) {
  const { data } = ctx;
  const rec = loadBox();
  const c = counts(rec);
  const main = h('main', { class: 'page stack', id: 'main' });

  // ロゴ（再訪時は小さく）
  if (brandShown(data)) {
    main.append(h('div', { class: `hero${rec ? ' compact' : ''}` },
      h('img', { src: 'assets/img/brand/hero.jpg', alt: 'MASUHOGAURA 36 shells Collection　Beachcombing SHIKA TOWN NOTO ISHIKAWA', width: 685, height: 464 })),
      h('div', { class: 'wave-band', 'aria-hidden': 'true' }));
  } else {
    main.append(h('p', { class: 'text-logo' }, 'MASUHOGAURA 36 shells Collection'));
  }
  main.append(h('div', { class: 'stack-sm' },
    h('h1', { class: 'lead' }, h('span', null, '増穂浦海岸で、'), h('span', null, '36種類の秘貝を探そう。'))));

  if (rec) {
    main.append(h('a', { class: 'record-strip', href: '#/box' },
      ring(c.filled, 36, true),
      h('span', { class: 'grow' },
        h('span', { class: 'phrase' }, h('strong', null, '収集箱の記録'), c.check ? h('span', { class: 'warn-text' }, `要確認 ${c.check}`) : null),
        h('span', { class: 'small block' }, phrase(`36種類のうち、`, `${c.filled}種類を集めました`)),
        h('span', { class: 'xsmall muted block' }, isTemp(rec) ? '一時表示・閉じると消えます' : `${formatDate(rec.savedAt)} 保存`)),
      h('span', { class: 'go-label' }, '見る', ic('chevron'))));
  }

  const scan = scanAvailable(data);
  main.append(h('nav', { class: 'actions', 'aria-label': 'おもな操作' },
    action('#/list', 'cream', 'search', '貝を探す', phrase('36種類の', '貝の写真を見る')),
    action('#/identify', 'pink', 'identify', 'この貝はなんだろう', phrase('拾った貝を、', '写真で見比べる')),
    action(scan ? '#/box' : '#/box?edit=1', 'sky', 'box', '収集箱を記録する', phrase('取った貝を', '記録する')),
  ));

  if (!storageAvailable()) {
    main.append(h('div', { class: 'notice warn' }, ic('alert'),
      h('p', null, 'この画面では記録を保存できません（プライベートモードなど）。記録は「この画面を開いている間だけ」使えます。')));
  }

  main.append(h('div', { class: 'footer-links' },
    h('a', { href: '#/about' }, 'このサイトについて')));
  return main;
}

function action(href, color, art, label, desc) {
  return h('a', { class: `action ${color}`, href },
    svg(artIcon(art), 'art'),
    h('span', null, h('span', { class: 'label' }, label), h('span', { class: 'desc' }, desc)),
    ic('chevron', 'go'));
}
