// この貝はなんだろう：拾った貝を撮って、AIの判定（使えるとき）と図鑑の写真との見比べで調べる
import { h, ic, notice, lightbox, confirmSheet, openSheet, shellImg, phrase } from '../ui.js';
import { loadBox } from '../store.js';
import { openCamera } from '../lib/camera.js';
import { fileToCanvas, pickImageFile, canvasToDataURL } from '../lib/image.js';
import { identify, initIdentifier, IDENTIFIER } from '../lib/identify.js';
import { page } from './common.js';
import { isDev } from '../data.js';
import { foundBlock } from './record.js';
import { shellCard, filterChips, applyFilters, noResult } from './parts.js';

// 撮った写真はこの画面を開いている間だけ保持する（端末に保存・送信しない）
export const session = { photos: [], result: null, filters: { shape: '', color: '', box: '' }, checks: {} };

// 次の貝を調べる：撮った写真と結果を消して、写真で調べる画面へ
export function nextShell() {
  session.photos = []; session.result = null; session.checks = {};
  location.hash = `#/identify?next=${Date.now()}`; // 同じ画面にいても描き直すよう、毎回ちがうアドレスにする
}
const LABELS = ['表', '裏', '横'];

export async function render(ctx) {
  const { data } = ctx;
  const rec = loadBox();
  await initIdentifier(data);
  const ai = IDENTIFIER.available;
  const main = page(ctx, { title: 'この貝はなんだろう', back: '#/' });
  const body = h('div', { class: 'stack' });
  main.append(body);
  let busy = false;

  async function addPhoto(useCamera) {
    const label = LABELS[session.photos.length] || '横';
    let cv = null;
    if (useCamera) cv = await openCamera({ mode: 'shell', maxSide: 1200 });
    else {
      const file = await pickImageFile();
      if (!file) return;
      try { cv = await fileToCanvas(file, 1200); } catch (e) { draw(e.message); return; }
    }
    if (!cv) return;
    session.photos.push({ src: canvasToDataURL(cv, 900), label });
    session.result = null;
    draw();
    if (ai) runAI();
  }

  async function runAI() {
    busy = true;
    draw();
    try {
      session.result = await identify(session.photos);
    } catch (e) {
      console.error(e);
      session.result = { status: 'error' };
    }
    busy = false;
    draw();
  }

  function draw(errorText) {
    body.replaceChildren();
    if (!session.photos.length) {
      body.append(...[
        h('div', { class: 'notice pink' }, ic('compare'),
          ai
            ? h('p', null, h('strong', null, phrase('AIが写真から、', '似ている貝を探します。')), phrase('最後は図鑑の写真と', '見比べて確かめてね。'))
            : h('p', null, h('strong', null, phrase('撮った写真と', '図鑑を見比べます。')), phrase('自動判定は', 'ありません。'))),
        h('section', { class: 'card stack' },
          h('div', { class: 'guide-art' }, shellGuideArt()),
          h('ol', { class: 'tips' },
            h('li', null, h('span', { class: 'n' }, '1'), h('span', null, phrase('貝を1つだけ、', '手のひらや無地の上に置く'))),
            h('li', null, h('span', { class: 'n' }, '2'), h('span', null, phrase('近づいて、', '貝全体を大きく写す'))),
            h('li', null, h('span', { class: 'n' }, '3'), h('span', null, phrase('裏側も撮ると、', '見分けやすくなります')))),
          errorText ? notice('warn', 'alert', h('p', null, errorText)) : null,
          h('button', { class: 'btn block', type: 'button', onclick: () => addPhoto(true) }, ic('camera'), 'カメラで撮る'),
          h('button', { class: 'btn block secondary', type: 'button', onclick: () => addPhoto(false) }, ic('image'), '写真を選ぶ')),
        h('p', { class: 'small muted center' }, phrase('写真はこの端末の中だけで使い、', '送信・保存しません。')),
        h('a', { class: 'btn block ghost', href: '#/list' }, ic('search'), '写真を使わず一覧から探す'),
        isDev() ? h('a', { class: 'btn block soft', href: '#/collect' }, ic('plus'), '学習用の写真を集める（スタッフ用）') : null,
      ].filter(Boolean));
      return;
    }

    // 撮った写真（上に固定して、見比べながらスクロールできる）
    const more = session.photos.length < 3;
    const strip = h('div', { class: 'sticky-photos' },
      h('div', { class: 'user-photos' },
        session.photos.map((p) => h('button', { class: 'user-photo', type: 'button', 'aria-label': `撮った写真（${p.label}）を拡大`, onclick: () => lightbox(p.src, `あなたの写真（${p.label}）`) },
          h('img', { src: p.src, alt: '' }), h('span', { class: 'photo-label' }, p.label))),
        more ? h('button', { class: 'add-photo', type: 'button', disabled: busy, onclick: () => chooseAdd() },
          ic('plus'), `${LABELS[session.photos.length]}も撮る`) : null,
        h('button', { class: 'btn small ghost', type: 'button', style: { marginLeft: 'auto' }, onclick: async () => {
          if (await confirmSheet({ title: '写真を消して撮り直しますか？', ok: '撮り直す', cancel: 'やめる' })) {
            session.photos = []; session.result = null; session.checks = {}; draw();
          }
        } }, '撮り直す')));
    body.append(strip);
    if (errorText) body.append(notice('warn', 'alert', h('p', null, errorText)));
    if (ai) {
      if (busy) {
        body.append(h('section', { class: 'card stack-sm center ai-loading', 'aria-live': 'polite' },
          h('div', { class: 'spinner' }),
          h('p', null, 'AIが調べています…'),
          h('p', { class: 'xsmall muted' }, phrase('はじめて使うときは、', '準備に少し時間がかかります'))));
      } else if (session.result) {
        body.append(resultPanel(data, session.result));
      }
    }

    // 見比べて探す
    const grid = h('div', { class: 'shell-grid' });
    const count = h('p', { class: 'small muted' });
    const chipsHolder = h('div');
    const update = () => {
      const list = applyFilters(data.species, session.filters, rec);
      count.textContent = `${list.length}種類　押すと「この貝かな？」で確かめられます`;
      grid.replaceChildren(...(list.length
        ? list.map((sp) => shellCard(data, sp, rec, { href: `#/compare/photo/${sp.no}` }))
        : [noResult(() => { session.filters = { shape: '', color: '', box: '' }; chipsHolder.replaceChildren(filterChips(data, session.filters, rec, update)); update(); })]));
    };
    chipsHolder.append(filterChips(data, session.filters, rec, update));
    update();
    body.append(h('section', { class: 'stack-sm' },
      h('h2', { class: 'section-title' }, ai ? '36種類の写真から探す' : phrase('下の写真から、', '似ている貝を選んでね。')),
      chipsHolder, count, grid));

    body.append(h('section', { class: 'card flat stack-sm' },
      h('h3', { class: 'section-title' }, 'どれにも似ていないとき'),
      h('p', { class: 'small' }, '36種類以外の貝かもしれません。増穂浦には、36種類のほかにもたくさんの貝があります。')));
  }

  // 追加の写真：カメラか写真の選択か
  function chooseAdd() {
    openSheet((close) => h('div', { class: 'stack' },
      h('h2', { style: { fontSize: '19px' } }, `${LABELS[session.photos.length]}の写真を追加`),
      h('button', { class: 'btn block', type: 'button', onclick: () => { close(); addPhoto(true); } }, ic('camera'), 'カメラで撮る'),
      h('button', { class: 'btn block secondary', type: 'button', onclick: () => { close(); addPhoto(false); } }, ic('image'), '写真を選ぶ'),
      h('button', { class: 'btn block ghost', type: 'button', onclick: close }, 'やめる')));
  }

  draw();
  return main;
}

const pctText = (p) => `${Math.round(p * 100)}%`;

// 候補の一覧（写真・番号・名前・％の棒）
function candidateList(data, cands) {
  return h('ol', { class: 'ai-list' }, cands.map(({ no, p }) => {
    const sp = data.byNo[no];
    return h('li', null,
      h('a', { class: 'ai-row', href: `#/compare/photo/${no}`, 'aria-label': `${no}番 ${sp.v.name}、${pctText(p)}。この貝かな？で確かめる` },
        h('span', { class: 'ph' }, shellImg(sp)),
        h('span', { class: 'grow' },
          h('span', { class: 'ai-name' }, h('span', { class: 'no-badge' }, no), sp.v.name),
          h('span', { class: 'ai-bar', 'aria-hidden': 'true' }, h('span', { style: { width: `${Math.max(2, Math.round(p * 100))}%` } }))),
        h('span', { class: 'ai-pct' }, pctText(p)),
        ic('chevron', 'go')));
  }));
}

function evaluationNote(ev) {
  if (!ev) return null;
  const parts = [];
  if (ev.val) parts.push(`学習に使っていない写真${ev.val.n}枚で、1位が正解 ${Math.round(ev.val.top1)}%`);
  if (ev.box) parts.push(`見本の箱の写真${ev.box.n}枚で、1位が正解 ${Math.round(ev.box.top1)}%・3位以内 ${Math.round(ev.box.top3)}%`);
  if (!parts.length) return null;
  return h('p', { class: 'xsmall muted' }, `AIの成績（${ev.date?.slice(0, 10) || ''}）：${parts.join('、')}`);
}

// AIの判定の表示。％は「この写真がその貝である見込み」の目安
export function resultPanel(data, result) {
  const cand = result.candidates || [];
  const top = cand[0] && data.byNo[cand[0].no];
  const footer = [
    h('p', { class: 'small' }, phrase('AIの判定は目安です。', '候補を押して、図鑑の写真と', '見比べて確かめてね。')),
    evaluationNote(IDENTIFIER.evaluation),
    IDENTIFIER.mode === 'dev' ? h('p', { class: 'xsmall dev-note' }, h('span', { class: 'dev-label' }, '開発用'), '一般の利用者には表示していません（精度を確かめてから公開）') : null,
    IDENTIFIER.mode === 'preview' ? h('p', { class: 'xsmall dev-note' }, h('span', { class: 'dev-label' }, '試験版'), '確認用プレビューだけで表示しています（実物の写真で精度を確かめてから公開）') : null,
  ];
  const card = (title, ...kids) => h('section', { class: 'card stack-sm ai-card', 'aria-live': 'polite' },
    h('p', { class: 'ai-kicker' }, ic('magic'), 'AIの判定'), h('h2', { class: 'ai-title' }, title), ...kids, ...footer);

  switch (result.status) {
    case 'likely':
      return card(h('span', null, phrase(`「${top.v.name}」`, 'の可能性が高そう'), h('span', { class: 'ai-big' }, pctText(cand[0].p))),
        candidateList(data, cand.slice(0, 3)),
        h('div', { class: 'quick-record' }, foundBlock(data, top, { onNext: nextShell, lead: phrase(`見比べて「${top.v.name}」で合っていたら、`, 'そのまま記録できます。') })));
    case 'similar':
      return card(phrase('似ている候補が', 'あります'),
        h('p', { class: 'small' }, '上から順に、図鑑の写真と見比べてみましょう。'),
        candidateList(data, cand.slice(0, 3)));
    case 'outside':
      return card(phrase('36種類以外の貝', 'かもしれません'),
        result.other != null ? h('p', { class: 'small' }, `36種類以外の見込み：${pctText(result.other)}`) : null,
        h('p', { class: 'small' }, '念のため、近い候補とも見比べてみましょう。'),
        candidateList(data, cand.slice(0, 3)));
    case 'unclear':
      return card(phrase('AIでは', '決めきれませんでした'),
        h('p', { class: 'small' }, phrase('近い順の候補です。', '明るい場所で大きく撮り直すか、', '裏側も撮ると変わることがあります。')),
        candidateList(data, cand.slice(0, 5)));
    case 'error':
      return notice('warn', 'alert', h('p', null, 'AIの判定ができませんでした。写真を見比べて探してください。'));
    default:
      return null;
  }
}

function shellGuideArt() {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 200 150" fill="none" stroke="#262C74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="30" y="6" width="140" height="138" rx="16" fill="#fff"/>
    <circle cx="100" cy="68" r="44" fill="#FBE8EF" stroke="#FFE36B" stroke-width="3"/>
    <path d="M100 44c-14 0-24 11-24 24 0 4.8 1.7 8.7 4.8 11.4h38.4c3.1-2.7 4.8-6.6 4.8-11.4 0-13-10-24-24-24z" fill="#F6C3D5"/>
    <path d="M100 44v35.4M89 47.3L94 79.4M111 47.3L106 79.4M80.4 56.3l7.6 23.1M119.6 56.3L112 79.4"/>
    <path d="M92.5 79.4l-1.8 8h18.6l-1.8-8" fill="#F6C3D5"/>
    <circle cx="100" cy="132" r="5"/>
  </svg>`;
  return wrap.firstElementChild;
}
