// はじめの案内：初めて開いた人への案内画面であり、参加の案内のページ（ホームの「はじめの案内を見る」から。以前の #/guide もここ）
//   通常のトップ #/ を最初に開いたときは、ホームの代わりにこの画面を出す（views/home.js）
//
// 上から：ロゴと見出し → 体験の短い紹介 → 参加の3ステップ → 収集箱を受け取れる施設 → 景品 → ホーム画面に追加
//   → お問い合わせ・案内の時点 → 「貝さがしをはじめる」
// ・下へ読み進めると、各欄が順にふわっと現れる（透明から少し上へ。動きは小さく、ゆっくり）
// ・背景の貝と波は、読む邪魔にならない程度にゆっくり動く
// ・動きを減らす設定の端末では、動かさずに最初から表示する
// ・料金・施設・景品の条件は、確認済みのイベント設定（config.json の event）から表示する（画面に直接書かない）
// ・「スキップ」はいつでも押せる位置に置く
import { h, ic, shellImg } from '../ui.js';
import { markIntro } from '../lib/intro.js';
import { installSection, markInstallHintShown } from '../lib/install.js';

const PHOTO_NOS = [5, 9, 7]; // さくら貝・なでしこ貝・紫貝（ピンク・オレンジ・むらさき）

const mapUrl = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} 石川県${place.address || '志賀町'}`)}`;
const telLink = (tel) => h('a', { class: 'tel', href: `tel:${tel.replace(/-/g, '')}` }, `TEL ${tel}`);
const jpDate = (d) => d.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日');

// 収集箱を受け取れる施設（住所・電話・地図）と参加費・アクセス
function placesSection(ev) {
  return h('section', { class: 'welcome-section card stack-sm reveal', id: 'welcome-places', 'aria-labelledby': 'welcome-places-title' },
    h('h2', { class: 'section-title', id: 'welcome-places-title' }, '収集箱を受け取れる施設'),
    ev.fee ? h('p', { class: 'guide-fee' }, '参加費 ', h('strong', null, ev.fee)) : null,
    h('ul', { class: 'guide-places' }, ev.pickup.map((p) => {
      const place = typeof p === 'string' ? { name: p } : p;
      return h('li', null,
        h('span', { class: 'grow' },
          h('span', { class: 'block place-name' }, place.name),
          place.address ? h('span', { class: 'small block' }, place.address) : null,
          place.tel ? h('span', { class: 'small block' }, telLink(place.tel)) : null),
        h('a', { class: 'btn small soft', href: mapUrl(place), target: '_blank', rel: 'noopener' }, ic('map'), '地図'));
    })),
    ev.access ? h('p', { class: 'small guide-access' }, h('strong', null, 'アクセス'), `　${ev.access}`) : null);
}

// 景品（集めた種類の数に応じて）と、このサイトのバッジ
function prizesSection(ev) {
  return h('section', { class: 'welcome-section card stack-sm reveal', 'aria-labelledby': 'welcome-prizes-title' },
    h('h2', { class: 'section-title', id: 'welcome-prizes-title' }, '景品（集めた種類の数に応じて）'),
    h('ul', { class: 'guide-prizes' }, ev.prizes.map((p) => h('li', null,
      h('span', { class: 'prize-n' }, h('strong', null, p.n), '種'),
      h('span', { class: 'grow' }, h('span', { class: 'block' }, p.text), p.note ? h('span', { class: 'xsmall muted block' }, `※${p.note}`) : null)))),
    ev.prizeNotes?.length ? h('ul', { class: 'small plain-list' }, ev.prizeNotes.map((t) => h('li', null, t))) : null,
    h('p', { class: 'small welcome-badge-note' }, 'このサイトの収集箱に記録すると、10・20・30・36種類で称号のバッジももらえます。景品は、実物の収集箱を施設で確認してもらうと、もらえます。'));
}

// お問い合わせと、案内の時点・最新情報
function contactSection(ev) {
  if (!ev.contact && !ev.checkedAt) return null;
  return h('section', { class: 'welcome-section card stack-sm reveal', 'aria-labelledby': 'welcome-contact-title' },
    h('h2', { class: 'section-title', id: 'welcome-contact-title' }, 'お問い合わせ'),
    ev.contact ? h('div', null,
      h('p', { class: 'place-name' }, ev.contact.name),
      h('p', { class: 'small' }, telLink(ev.contact.tel)),
      ev.contact.address ? h('p', { class: 'xsmall muted' }, ev.contact.address) : null) : null,
    ev.checkedAt ? h('p', { class: 'xsmall muted' }, `この案内は ${jpDate(ev.checkedAt)} 時点の内容です。`,
      ev.official ? h('span', null, '最新の情報は ', h('a', { href: ev.official.url, target: '_blank', rel: 'noopener' }, ev.official.label), ' でご確認ください。') : null) : null);
}

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
  const main = h('main', { class: `page welcome${anim ? ' js-anim' : ''}`, id: 'main', dataset: { tabbar: 'hide', title: 'はじめの案内' } },
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

    // 4. 収集箱を受け取れる施設 ／ 5. 景品
    ev ? placesSection(ev) : null,
    ev ? prizesSection(ev) : null,

    // 6. ホーム画面に追加
    installSection(data, { compact: true, className: 'welcome-section card stack-sm reveal' }),

    // 7. お問い合わせ・案内の時点
    ev ? contactSection(ev) : null,

    // 8. はじめる
    h('section', { class: 'welcome-cta reveal' },
      h('button', { class: 'btn block found-btn', type: 'button', onclick: () => finish('start') }, '貝さがしをはじめる'),
      h('p', { class: 'xsmall muted center' }, '集めた記録は、この端末の中だけに保存されます。')),
  );

  // 下へ読み進めたら、ふわっと現れる。一度現れたものは、スクロールを戻しても消さない・くり返さない
  // 以前の「初めての方へ」（#/guide）から来たときは、受け取れる施設の欄から見せる
  if (location.hash.startsWith('#/guide')) {
    requestAnimationFrame(() => main.querySelector('#welcome-places')?.scrollIntoView({ block: 'start' }));
  }
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
