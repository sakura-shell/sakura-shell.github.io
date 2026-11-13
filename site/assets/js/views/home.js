// ホーム：スクロールせずに1画面で完結させる（2026-11-13 依頼者の指示）
//
// 上から：ロゴ（横幅いっぱい・切らない）→ 最近記録した貝 → 写真で調べる → 貝の図鑑・収集箱（集めた数つき）
//   → ホーム画面に追加（控えめな1行。ホーム画面から開いているときは出さない）→ このサイトについて／表示 → 下のタブ
// ・高さは、実際に見えている画面の高さ（app.js が --app-h に入れる）に合わせる。収まらないときは、
//   内容を切って隠すのではなく、段階的に小さくまとめる（fit()）：
//     1 最近の貝を小さな1行に → 2 「ホーム画面に追加」を「このサイトについて」の中だけに → 3 最近の貝をしまう・説明の文をしまう
//   ロゴは、残った高さに合わせて全体を縮める（切らない）。横向きの低い画面では、ロゴを左・操作を右に並べる
// ・「はじめの案内」「このサイトについて」「表示」は補助の入口（主要なカードにはしない）
// ・最近の貝は、記録に残っている日時（各マスの t）から新しい順に出す。日時のない記録しかないときは「集めた貝」と書く
import { h, ic, svg, shellImg } from '../ui.js';
import { artIcon } from '../icons.js';
import { loadBox, counts, storageAvailable, isTemp } from '../store.js';
import { brandShown } from '../data.js';
import { introNeeded, markIntro } from '../lib/intro.js';
import { canOfferInstall, openInstallGuide } from '../lib/install.js';
import { openDisplaySheet } from '../lib/display.js';
import * as welcome from './welcome.js';

const MAX_FIT = 3;

// 集めた貝を、記録した日時の新しい順に最大3つ。dated：日時から並べられたか
function recentShells(data, rec) {
  const filled = Object.entries(rec?.cells || {})
    .filter(([, c]) => c?.s === 'filled')
    .map(([no, c]) => ({ sp: data.byNo[Number(no)], t: Date.parse(c.t || '') }))
    .filter((x) => x.sp);
  const dated = filled.length > 0 && filled.every((x) => !Number.isNaN(x.t));
  filled.sort((a, b) => (dated ? b.t - a.t : 0) || a.sp.no - b.sp.no);
  return { list: filled.slice(0, 3).map((x) => x.sp), dated };
}

export function render(ctx) {
  // 通常のトップを初めて開いたときだけ、はじめの案内（表示した時点で印を残し、次からはふつうのホーム）
  if (introNeeded()) {
    markIntro('shown');
    return welcome.render(ctx);
  }
  const { data } = ctx;
  const rec = loadBox();
  const c = counts(rec);
  const main = h('main', { class: 'home2', id: 'main' });

  // 1. ロゴ（横幅いっぱい。全体を見せる）
  const hero = brandShown(data)
    ? h('div', { class: 'h2-hero' },
      h('img', { src: 'assets/img/brand/hero.jpg', alt: 'MASUHOGAURA 36 shells Collection　Beachcombing SHIKA TOWN NOTO ISHIKAWA', width: 685, height: 464 }))
    : h('div', { class: 'h2-hero text' }, h('p', { class: 'text-logo' }, 'MASUHOGAURA 36 shells Collection'));
  // 見出し：ロゴ（チラシの表紙）と同じ内容なので、画面には出さず、読み上げ用に残す
  const title = h('h1', { class: 'visually-hidden' }, 'MASUHOGAURA 36 shells Collection：増穂浦海岸で、36種類の秘貝を探そう');

  // 2. 最近記録した貝（0件のときは、短い始め方）
  let recent;
  if (c.filled > 0) {
    const { list, dated } = recentShells(data, rec);
    recent = h('section', { class: 'h2-recent', 'aria-labelledby': 'h2-recent-title' },
      h('h2', { id: 'h2-recent-title' }, c.filled >= 36 ? '36種類そろいました' : dated ? '最近記録した貝' : '集めた貝'),
      h('ul', null, list.map((sp, i) => h('li', null,
        h('a', { href: `#/shell/${sp.no}`, class: `tone-${i % 3}`, 'aria-label': `${sp.no}番 ${sp.v.name}` },
          h('span', { class: 'ph' }, shellImg(sp, { thumb: true, alt: '' })),
          h('span', { class: 'nm' }, sp.v.name))))));
  } else {
    recent = h('section', { class: 'h2-recent empty' },
      h('p', null, ic('shell'), h('span', null, '拾った貝を調べて、収集箱に記録しよう')));
  }

  // 3. 写真で調べる　4. 貝の図鑑・収集箱（集めた数）
  const temp = isTemp(rec);
  const actions = h('nav', { class: 'h2-actions', 'aria-label': 'おもな操作' },
    h('a', { class: 'h2-card primary', href: '#/identify' },
      svg(artIcon('identify'), 'art'),
      h('span', { class: 'grow' }, h('span', { class: 'label' }, '写真で調べる'), h('span', { class: 'desc' }, '撮影する・写真を選ぶ')),
      ic('chevron', 'go')),
    h('a', { class: 'h2-card half cream', href: '#/list' },
      h('span', { class: 'head' }, ic('search'), h('span', { class: 'label' }, '貝の図鑑')),
      h('span', { class: 'desc' }, '36種類を見比べる')),
    h('a', { class: 'h2-card half sky', href: '#/box', 'aria-label': `収集箱：36種類のうち${c.filled}種類を集めました${temp ? '（一時記録）' : ''}` },
      h('span', { class: 'head' }, ic('box'), h('span', { class: 'label' }, '収集箱')),
      h('span', { class: 'count', 'aria-hidden': 'true' }, h('strong', null, c.filled), h('span', null, ' / 36 種類'))));

  // 5. ホーム画面に追加（控えめな1行。追加の確認を出せる・手順を見せられる環境で、ホーム画面から開いていないときだけ）
  const installHolder = h('div', { class: 'h2-install-holder' });
  const drawInstall = () => {
    installHolder.replaceChildren(canOfferInstall()
      ? h('button', { class: 'h2-row h2-install', type: 'button', onclick: openInstallGuide },
        ic('plus'), h('span', { class: 'grow' }, 'ホーム画面に追加'), ic('chevron', 'go'))
      : '');
    fit();
  };

  // 6. このサイトについて／表示（保存できない環境の知らせも、ここに短く）
  const aux = h('div', { class: 'h2-aux' },
    h('a', { href: '#/about' }, 'このサイトについて'),
    !storageAvailable() || temp ? h('span', { class: 'h2-temp', role: 'note' }, temp ? '一時記録（閉じると消えます）' : '記録を保存できない設定です') : null,
    h('button', { type: 'button', onclick: openDisplaySheet }, ic('search'), '表示'));

  const body = h('div', { class: 'h2-body' }, recent, actions, installHolder, aux);
  main.append(hero, title, body);

  // 収まり具合に合わせて、段階的にまとめる。まず横向きの低い画面かを見て、次に収まるまで段階を上げる
  function fit() {
    if (!main.isConnected) return;
    const land = window.innerWidth > window.innerHeight * 1.15 && window.innerHeight < 560;
    main.classList.toggle('land', land);
    for (let level = 0; level <= MAX_FIT; level++) {
      main.dataset.fit = String(level);
      const overflow = main.scrollHeight > main.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1;
      // ロゴが小さくなりすぎるとき（本来の高さの6割より小さい）も、下をまとめてロゴに場所をゆずる
      const natural = hero.clientWidth * 464 / 685;
      const heroSmall = !land && brandShown(data) && level < MAX_FIT && hero.clientHeight < natural * 0.6;
      if (!overflow && !heroSmall) break;
    }
  }
  // 画面に出たらすぐ合わせる（描画の合図を待たない。裏に回っていても、最初から収まった形にする）。
  // そのあとは、画面の大きさ・文字の読み込み・表示の設定が変わるたびに合わせ直す
  const onResize = () => { fit(); requestAnimationFrame(fit); };
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => fit()) : null;
  ro?.observe(main);
  window.addEventListener('resize', onResize);
  window.addEventListener('m36:display', onResize);
  window.addEventListener('m36:installable', drawInstall);
  document.fonts?.ready?.then(onResize);
  ctx.onCleanup?.(() => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('m36:display', onResize);
    window.removeEventListener('m36:installable', drawInstall);
    ro?.disconnect();
  });
  setTimeout(drawInstall, 0);
  return main;
}
