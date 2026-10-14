// 初めて開いた人への案内画面（通常のトップ #/ を最初に開いたときだけ。views/home.js から出す）
//
// 上から：ロゴと見出し → 体験の短い紹介 → 参加の3ステップ → 参加方法・受け取り場所へ → ホーム画面に追加 → 「貝さがしをはじめる」
// ・下へ読み進めると、紹介・ステップ・追加の案内が順にふわっと現れる（透明から少し上へ。動きは小さく、ゆっくり）
// ・背景の貝と波は、読む邪魔にならない程度にゆっくり動く
// ・動きを減らす設定の端末では、動かさずに最初から表示する
// ・料金・景品の条件は、確認済みのイベント設定（config.json の event）から表示する（画面に直接書かない）
// ・「スキップ」はいつでも押せる位置に置く
import { h, ic, svg, shellImg } from '../ui.js';
import { artIcon } from '../icons.js';
import { markIntro } from '../lib/intro.js';
import { installSection, markInstallHintShown } from '../lib/install.js';

const PHOTO_NOS = [5, 9, 7]; // さくら貝・なでしこ貝・紫貝（ピンク・オレンジ・むらさき）

export function render(ctx) {
  const { data } = ctx;
  const ev = data.config.event?.status === 'confirmed' ? data.config.event : null;
  // 案内画面で追加の方法を見せるので、あとから小さな案内は出さない
  markInstallHintShown('welcome');

  const finish = (how) => {
    markIntro(how);
    ctx.navigate('#/', { replace: true }); // ふつうのホームを出す
  };

  // 参加の3ステップ（数や条件はイベント設定から）
  const minPrize = ev?.prizes?.length ? Math.min(...ev.prizes.map((p) => p.n)) : null;
  const steps = [
    ['収集箱を受け取る。', ev ? `${ev.pickup?.length ? `${ev.pickup.length}つの施設で受け取れます` : '施設で受け取れます'}${ev.fee ? `（参加費 ${ev.fee}）` : ''}` : null],
    ['海岸で貝を探し、写真や図鑑で調べる。', '拾った貝は「写真で調べる」と「貝の図鑑」で確かめられます'],
    ['集めた収集箱を施設で確認してもらう。', minPrize ? `集めた種類の数に応じて、${minPrize}種類から景品があります` : null],
  ];

  const photos = PHOTO_NOS.map((no) => data.byNo[no]).filter(Boolean)
    .map((sp, i) => h('figure', { class: 'welcome-photo', style: { '--i': i } }, shellImg(sp, { thumb: true }), h('figcaption', null, sp.v.name)));

  // 隠してから現れる演出は、動きを減らす設定でなく、現れる合図（IntersectionObserver）が使えるときだけ（js-anim）。
  // それ以外は、最初から全部見える
  const anim = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window;
  const main = h('main', { class: `page welcome${anim ? ' js-anim' : ''}`, id: 'main', dataset: { tabbar: 'hide', title: 'ようこそ' } },
    h('div', { class: 'welcome-bg', 'aria-hidden': 'true' }, h('span', { class: 'drift' }), h('span', { class: 'waves' })),
    h('div', { class: 'welcome-skip' },
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => finish('skip') }, 'スキップ')),

    // 1. ロゴと見出し
    h('header', { class: 'welcome-hero' },
      h('div', { class: 'welcome-logo float-in' },
        h('img', { src: 'assets/img/brand/hero.jpg', alt: 'MASUHOGAURA 36 shells Collection　Beachcombing SHIKA TOWN NOTO ISHIKAWA', width: 685, height: 464 })),
      h('h1', { class: 'welcome-title float-in', style: { '--d': '.25s' } }, '海辺の小さな宝探しへ。'),
      h('p', { class: 'welcome-lead float-in', style: { '--d': '.5s' } }, 'ひとつ拾うたび、自分だけのコレクションに。'),
      h('p', { class: 'welcome-scroll float-in', style: { '--d': '.9s' }, 'aria-hidden': 'true' }, ic('chevron'))),

    // 2. 体験の短い紹介
    h('section', { class: 'welcome-section reveal' },
      h('p', { class: 'welcome-text' }, '増穂浦の海岸で、36種類の貝を探してみませんか。拾った貝を調べて、集めた思い出をこのサイトに記録できます。'),
      photos.length ? h('div', { class: 'welcome-photos' }, photos) : null),

    // 3. 参加の3ステップ
    h('section', { class: 'welcome-section card reveal' },
      h('h2', { class: 'section-title' }, '参加の3ステップ'),
      h('ol', { class: 'welcome-steps' }, steps.map(([t, sub], i) => h('li', { class: 'reveal', style: { '--d': `${0.12 * i}s` } },
        h('span', { class: 'step-no' }, i + 1),
        h('span', null, h('strong', { class: 'block' }, t), sub ? h('span', { class: 'small muted' }, sub) : null))))),

    // 4. 参加方法・受け取り場所
    h('a', { class: 'guide-link reveal', href: '#/guide', onclick: () => markIntro('guide') },
      svg(artIcon('box'), 'welcome-link-art'),
      h('span', { class: 'grow' }, h('strong', { class: 'block' }, '参加方法・収集箱の受け取り場所'), h('span', { class: 'small' }, '施設の場所・地図・景品の条件はこちら')),
      ic('chevron')),

    // 5. ホーム画面に追加
    installSection(data, { compact: true, className: 'welcome-section card stack-sm reveal' }),

    // 6. はじめる
    h('section', { class: 'welcome-cta reveal' },
      h('button', { class: 'btn block found-btn', type: 'button', onclick: () => finish('start') }, '貝さがしをはじめる'),
      h('p', { class: 'xsmall muted center' }, '集めた記録は、この端末の中だけに保存されます。')),
  );

  // 下へ読み進めたら、ふわっと現れる。一度現れたものは、スクロールを戻しても消さない・くり返さない
  if (anim) {
    requestAnimationFrame(() => {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      main.querySelectorAll('.reveal').forEach((el) => io.observe(el));
      ctx.onCleanup?.(() => io.disconnect());
    });
  }
  return main;
}
