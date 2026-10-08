import { h, ic, svg, formatDate, phrase, ring } from '../ui.js';
import { artIcon } from '../icons.js';
import { loadBox, counts, storageAvailable, isTemp } from '../store.js';
import { brandShown } from '../data.js';

export function render(ctx) {
  const { data } = ctx;
  const rec = loadBox();
  const c = counts(rec);
  const main = h('main', { class: 'page home', id: 'main' });
  const left = h('div', { class: 'home-brand stack' });
  const right = h('div', { class: 'home-actions stack' });
  main.append(left, right);

  // ロゴ（再訪時は小さく）
  if (brandShown(data)) {
    left.append(h('div', { class: `hero${rec ? ' compact' : ''}` },
      h('img', { src: 'assets/img/brand/hero.jpg', alt: 'MASUHOGAURA 36 shells Collection　Beachcombing SHIKA TOWN NOTO ISHIKAWA', width: 685, height: 464 })),
      h('div', { class: 'wave-band', 'aria-hidden': 'true' }));
  } else {
    left.append(h('p', { class: 'text-logo' }, 'MASUHOGAURA 36 shells Collection'));
  }
  left.append(h('h1', { class: 'lead' }, h('span', null, '増穂浦海岸で、'), h('span', null, '36種類の秘貝を探そう。')));

  if (rec) {
    right.append(h('a', { class: 'record-strip', href: '#/box' },
      ring(c.filled, 36, true),
      h('span', { class: 'grow' },
        h('span', { class: 'phrase' }, h('strong', null, '収集箱の記録'), h('span', { class: 'small' }, phrase(`36種類のうち、`, `${c.filled}種類を集めました`))),
        h('span', { class: 'xsmall muted block' }, isTemp(rec) ? '一時表示・閉じると消えます' : `${formatDate(rec.savedAt)} 保存`)),
      h('span', { class: 'go-label' }, '見る', ic('chevron'))));
  }

  // おもな操作：現地では「写真で調べる」が中心
  // スマホでは「写真で調べる」を大きく1つ、図鑑と収集箱は横に2つ並べる（最初の画面で全体が見えるように）
  right.append(h('nav', { class: 'actions', 'aria-label': 'おもな操作' },
    action('#/identify', 'pink primary', 'identify', '写真で調べる', phrase('この貝はなんだろう？', '拾った貝を撮って調べる')),
    action('#/list', 'cream half', 'search', '貝の図鑑', phrase('36種類の', '写真を見る')),
    action('#/box', 'sky half', 'box', '収集箱', phrase('拾った貝を', '記録する')),
  ));

  if (data.config.event?.status === 'confirmed') {
    right.append(h('a', { class: 'guide-link', href: '#/guide' }, ic('guide'),
      h('span', { class: 'grow' }, h('strong', { class: 'block' }, '初めての方へ'), h('span', { class: 'small' }, phrase('参加のしかた・', '箱の受け取り・', '景品'))),
      ic('chevron')));
  }

  if (!storageAvailable()) {
    right.append(h('div', { class: 'notice warn' }, ic('alert'),
      h('p', null, 'この画面では記録を保存できません（プライベートモードなど）。記録は「この画面を開いている間だけ」使えます。')));
  }

  right.append(h('div', { class: 'footer-links' },
    h('a', { href: '#/about' }, 'このサイトについて')));
  return main;
}

function action(href, color, art, label, desc) {
  return h('a', { class: `action ${color}`, href },
    svg(artIcon(art), 'art'),
    h('span', null, h('span', { class: 'label' }, label), h('span', { class: 'desc' }, desc)),
    ic('chevron', 'go'));
}
