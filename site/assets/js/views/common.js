import { h, ic } from '../ui.js';
import { brandShown } from '../data.js';

// 各画面の外枠（戻るボタン・見出し・ロゴ）
export function page(ctx, { title, back = '#/', hideTabbar = false, className = '' }, ...children) {
  const main = h('main', { class: `page ${hideTabbar ? 'no-tabbar' : ''} ${className}`, id: 'main' });
  main.dataset.title = title;
  if (hideTabbar) main.dataset.tabbar = 'hide';
  const bar = h('header', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: () => ctx.goBack(back) }, ic('back')) : null,
    h('h1', null, title),
    brandShown(ctx.data)
      ? h('a', { class: 'logo-pill', href: '#/', 'aria-label': 'ホームへ' }, h('img', { src: 'assets/img/brand/logo-36shells.png', alt: '36 shells' }))
      : h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'ホームへ' }, ic('home')));
  main.append(bar, ...children.flat().filter(Boolean));
  return main;
}
