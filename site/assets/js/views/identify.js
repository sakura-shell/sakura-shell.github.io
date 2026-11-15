// この貝はなんだろう：拾った貝を撮って、AIの判定（使えるとき）と図鑑の写真との見比べで調べる
import { h, ic, notice, lightbox, confirmSheet, openSheet, shellImg, phrase, shapeIc } from '../ui.js';
import { loadBox } from '../store.js';
import { openCamera } from '../lib/camera.js';
import { fileToCanvas, pickImageFile, canvasToDataURL } from '../lib/image.js';
import { identify, identifierEnabled, prepareIdentifier, aiStatus, IDENTIFIER } from '../lib/identify.js';
import { page } from './common.js';
import { isStaff } from '../data.js';
import { foundBlock } from './record.js';
import { shellCard } from './parts.js';
import { availableShapes, availableColors } from '../data.js';

// 撮った写真はこの画面を開いている間だけ保持する（端末に保存・送信しない）
export const session = { photos: [], result: null, filters: { shape: '', color: '', box: '' }, checks: {} };

// 次の貝を調べる：撮った写真と結果を消して、写真で調べる画面へ
export function nextShell() {
  session.photos = []; session.result = null; session.checks = {};
  location.hash = `#/identify?next=${Date.now()}`; // 同じ画面にいても描き直すよう、毎回ちがうアドレスにする
}
const LABELS = ['表', '裏', '横'];

// 形・色で、その種類が候補に入るか（形や色が登録されていない種類は、しぼっても外さない）
export function matchesFilters(sp, f) {
  return (!f.shape || !sp.v.shape || sp.v.shape === f.shape)
    && (!f.color || !sp.v.colors.length || sp.v.colors.includes(f.color));
}

// 選んだ形・色を短い言葉で（例：二枚貝・白）
function filterText(data, f) {
  return [f.shape && data.shapes[f.shape]?.label, f.color && data.colorPalette[f.color]?.label].filter(Boolean).join('・');
}

// ①形 ②色 をえらぶ部品。onChange は選ぶたびに呼ぶ
function pickers(data, f, onChange) {
  const shapes = availableShapes(data);
  const colors = availableColors(data);
  const choice = (label, pressed, onclick, icon, cls = '') => h('button', {
    class: `find-choice ${cls}`, type: 'button', 'aria-pressed': String(pressed), onclick,
  }, icon || null, h('span', null, label));
  const shapeRow = h('div', { class: 'find-row shapes', role: 'group', 'aria-label': '形をえらぶ' });
  const colorRow = h('div', { class: 'find-row colors', role: 'group', 'aria-label': '色をえらぶ' });
  const draw = () => {
    shapeRow.replaceChildren(
      ...shapes.map((k) => choice(data.shapes[k].label, f.shape === k, () => { f.shape = f.shape === k ? '' : k; draw(); onChange(); }, shapeIc(k))),
      choice('わからない', !f.shape, () => { f.shape = ''; draw(); onChange(); }, null, 'any'));
    colorRow.replaceChildren(
      ...colors.map((k) => choice(data.colorPalette[k].label, f.color === k, () => { f.color = f.color === k ? '' : k; draw(); onChange(); },
        h('span', { class: 'dot', style: { background: data.colorPalette[k].hex } }))),
      choice('わからない', !f.color, () => { f.color = ''; draw(); onChange(); }, null, 'any'));
  };
  draw();
  return [
    h('p', { class: 'find-step' }, h('span', { class: 'n' }, '1'), '形'), shapeRow,
    h('p', { class: 'find-step' }, h('span', { class: 'n' }, '2'), 'いちばん多い色'), colorRow,
  ];
}

// AIの結果を、選んだ形・色の種類の中だけにしぼる（その中で確からしさを付け直す）。
// しぼった中でも、いちばん上が十分に抜けているときだけ「近そう」にする
const SURE_IN = 0.75;
function restrictResult(data, result, f) {
  if (!result?.all || !(f.shape || f.color) || result.status === 'error') return result;
  const inSet = result.all.filter((r) => data.byNo[r.no] && matchesFilters(data.byNo[r.no], f));
  if (!inSet.length) return result;
  const total = inSet.reduce((s, r) => s + r.p, 0) || 1;
  const all = inSet.map((r) => ({ no: r.no, p: r.p / total }));
  const top = all[0], second = all[1] || { p: 0 };
  const status = result.status === 'outside' ? 'outside'
    : top.p >= SURE_IN && top.p - second.p >= 0.4 ? 'likely' : 'unclear';
  return { ...result, status, candidates: all.slice(0, 5), all, filtered: filterText(data, f), raw: result };
}

export async function render(ctx) {
  const { data } = ctx;
  const rec = loadBox();
  // AIの準備は待たずに画面を出す（準備はホームで始まっていれば、その続き。まだならここで始める）
  const ai = identifierEnabled(data);
  if (ai) prepareIdentifier(data, 2);
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

  // AIの準備状況（短く。準備中でも撮影できる。失敗したら図鑑で探す道へ）
  const statusEl = h('p', { class: 'xsmall ai-status', 'aria-live': 'polite' });
  const drawStatus = () => {
    const st = aiStatus();
    statusEl.dataset.state = st;
    statusEl.replaceChildren(...({
      loading: [h('span', { class: 'dot' }), 'AIの準備中…（このまま撮れます）'],
      ready: [ic('check'), 'AIの準備ができました'],
      failed: ['AIの準備ができませんでした。', h('a', { href: '#/list' }, '図鑑で見比べて探す')],
      idle: ['撮ると、AIの準備を始めます'],
    }[st] || []));
  };
  drawStatus();
  window.addEventListener('m36:ai-status', drawStatus);

  // 「もう一度試す」
  const retry = () => { if (session.photos.length && !busy) runAI(); };
  window.addEventListener('m36:retry-ai', retry);
  ctx.onCleanup?.(() => { window.removeEventListener('m36:retry-ai', retry); window.removeEventListener('m36:ai-status', drawStatus); });

  async function runAI() {
    busy = true;
    draw();
    try {
      await prepareIdentifier(data, 2); // 準備がまだなら、ここで終わるのを待つ（終わっていればすぐ進む）
      session.result = IDENTIFIER.available
        ? restrictResult(data, await identify(session.photos), session.filters)
        : { status: 'error', message: IDENTIFIER.reason };
    } catch (e) {
      console.error(e);
      session.result = { status: 'error', message: String(e?.message || e).slice(0, 120) };
    }
    busy = false;
    draw();
  }

  function draw(errorText) {
    body.replaceChildren();
    if (!session.photos.length) {
      // 最初の画面：説明は短く、「カメラで撮る」「写真を選ぶ」がすぐ見えるように。撮り方のコツは開いて読める
      body.append(...[
        h('section', { class: 'card stack-sm identify-start' },
          h('p', { class: 'identify-lead' }, ai
            ? phrase('写真から', '似ている貝の候補を出します。', '最後は図鑑の写真と見比べてね。')
            : phrase('撮った写真と', '図鑑を見比べて探します。')),
          h('p', { class: 'small identify-tip' }, ic('shell'), phrase('貝を1つだけ、', '手のひらか白い紙にのせて、', '近づいて大きく撮ってね')),
          ai ? statusEl : null,
          h('details', { class: 'tips-more' },
            h('summary', null, '撮り方のコツ'),
            h('ol', { class: 'tips' },
              h('li', null, h('span', { class: 'n' }, '1'), h('span', null, phrase('貝を1つだけ、', '手のひらや無地の上に置く'))),
              h('li', null, h('span', { class: 'n' }, '2'), h('span', null, phrase('近づいて、', '貝全体を大きく写す'))),
              h('li', null, h('span', { class: 'n' }, '3'), h('span', null, phrase('裏側も撮ると、', '見分けやすくなります'))))),
          errorText ? notice('warn', 'alert', h('p', null, errorText)) : null,
          ai ? h('div', { class: 'stack-sm pre-pick' },
            h('p', { class: 'small strong' }, '先に、形と色をえらんでください'),
            h('p', { class: 'xsmall muted' }, 'えらぶと、その中からAIが探すので当たりやすくなります。わからなければ、そのまま撮ってOKです。'),
            ...pickers(data, session.filters, () => {})) : null,
          h('button', { class: 'btn block', type: 'button', onclick: () => addPhoto(true) }, ic('camera'), 'カメラで撮る'),
          h('button', { class: 'btn block secondary', type: 'button', onclick: () => addPhoto(false) }, ic('image'), '写真を選ぶ'),
          h('p', { class: 'xsmall muted center' }, phrase('写真はこの端末の中だけで使い、', '送信・保存しません。'))),
        h('a', { class: 'btn block ghost', href: '#/list' }, ic('search'), '写真を使わず一覧から探す'),
        isStaff() ? h('a', { class: 'btn block soft', href: '#/collect' }, ic('plus'), '学習用の写真を集める（スタッフ用）') : null,
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

    // 形と色で探す（いちばん確実な探し方。AIの結果がどうであっても出す）
    body.append(findSection());

    body.append(h('section', { class: 'card flat stack-sm' },
      h('h3', { class: 'section-title' }, 'どれにも似ていないとき'),
      h('p', { class: 'small' }, '36種類以外の貝かもしれません。増穂浦には、36種類のほかにもたくさんの貝があります。')));
  }

  // 形と色で探す：①形 → ②色 を選ぶと候補がしぼれる。押すと、撮った写真と図鑑の写真を並べて見比べる
  // ・形や色が登録されていない種類（読み取れなかったもの）は、しぼっても外さない（見落とさないため）
  // ・AIの結果があるときは、しぼった中を「AIが近いと見た順」に並べる（答えではなく、並べ方の手伝い）
  // ・選んだ形と色は session.filters に残し、見比べる画面でも引き継ぐ
  function findSection() {
    const f = session.filters;
    const sec = h('section', { class: 'card stack-sm find-guide', id: 'find', 'aria-labelledby': 'find-title' });
    const grid = h('div', { class: 'shell-grid' });
    const count = h('p', { class: 'small find-count', 'aria-live': 'polite' });
    const update = () => {
      const base = session.result?.raw || session.result;
      const order = base?.all ? new Map(base.all.map((r, i) => [r.no, i])) : null;
      const list = data.species.filter((sp) => matchesFilters(sp, f));
      if (order) list.sort((x, y) => (order.get(x.no) ?? 99) - (order.get(y.no) ?? 99));
      count.textContent = `${list.length}種類${f.shape || f.color ? 'にしぼりました' : ''}。押すと、撮った写真と並べて見比べられます${order ? '（AIが近いと見た順）' : ''}`;
      grid.replaceChildren(...list.map((sp) => shellCard(data, sp, rec, { href: `#/compare/photo/${sp.no}` })));
    };
    sec.append(
      h('h2', { class: 'section-title', id: 'find-title' }, '形と色で探す'),
      h('p', { class: 'small' }, '貝を見ながら、形と色を選んでください。候補がしぼれます。'),
      ...pickers(data, f, update),
      count, grid);
    update();
    return sec;
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

// AIを「答え」に見せる条件（2026-11-16：砂浜で外れが多かったため、classifier.json の likely より厳しくする）
const SURE = 0.75;

// 「形と色で探す」へ移る（同じ画面の下にある）
function goFind() {
  document.getElementById('find')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 候補の一覧（写真・番号・名前）。％や棒は出さない（数字が答えの確からしさに見えてしまうため）
function candidateList(data, cands) {
  return h('ol', { class: 'ai-list' }, cands.map(({ no }) => {
    const sp = data.byNo[no];
    return h('li', null,
      h('a', { class: 'ai-row', href: `#/compare/photo/${no}`, 'aria-label': `${no}番 ${sp.v.name}。撮った写真と見比べる` },
        h('span', { class: 'ph' }, shellImg(sp)),
        h('span', { class: 'grow' }, h('span', { class: 'ai-name' }, h('span', { class: 'no-badge' }, no), sp.v.name)),
        h('span', { class: 'ai-go' }, '見比べる'),
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
  const sure = result.status === 'likely' && cand[0]?.p >= SURE;
  const findBtn = (primary) => h('button', { class: `btn block ${primary ? '' : 'secondary'} find-btn`, type: 'button', onclick: goFind },
    ic('search'), primary ? '形と色で探す' : '候補にない・ちがうときは、形と色で探す');
  const footer = [
    evaluationNote(IDENTIFIER.evaluation),
    IDENTIFIER.mode === 'dev' ? h('p', { class: 'xsmall dev-note' }, h('span', { class: 'dev-label' }, '開発用'), '一般の利用者には表示していません（精度を確かめてから公開）') : null,
    IDENTIFIER.mode === 'preview' ? h('p', { class: 'xsmall dev-note' }, h('span', { class: 'dev-label' }, '試験版'), '確認用プレビューだけで表示しています（実物の写真で精度を確かめてから公開）') : null,
  ];
  const card = (title, ...kids) => h('section', { class: 'card stack-sm ai-card', 'aria-live': 'polite' },
    h('p', { class: 'ai-kicker' }, ic('magic'), 'AIの判定'), h('h2', { class: 'ai-title' }, title),
    result.filtered ? h('p', { class: 'xsmall ai-filtered' }, `えらんだ形と色（${result.filtered}）の種類の中で比べました`) : null,
    ...kids.filter(Boolean), ...footer.filter(Boolean));
  // 自信がないときの候補は、たたんで「参考」として見せる
  const hintList = (n) => h('details', { class: 'tips-more ai-hints' },
    h('summary', null, `AIの近い候補（参考・${Math.min(n, cand.length)}つ）`), candidateList(data, cand.slice(0, n)));
  const retake = h('p', { class: 'xsmall muted' }, phrase('撮り直すときは、', '貝を手のひらか白い紙にのせて、', '明るい場所で近づいて撮ると、', '結果が変わることがあります。'));

  switch (result.status) {
    case 'likely':
    case 'similar':
    case 'unclear':
      if (sure) {
        return card(phrase(`「${top.v.name}」に`, '近そうです'),
          h('p', { class: 'small' }, phrase('AIの判定は目安です。', '押して、図鑑の写真と見比べて確かめてね。')),
          candidateList(data, cand.slice(0, 3)),
          findBtn(false),
          h('div', { class: 'quick-record' }, foundBlock(data, top, { onNext: nextShell, lead: phrase(`見比べて「${top.v.name}」で合っていたら、`, 'そのまま記録できます。') })));
      }
      return card(phrase('AIでは、', 'はっきりしません'),
        h('p', { class: 'small' }, phrase('形と色で探すと確実です。', '下で選んでみてください。')),
        findBtn(true),
        hintList(5),
        retake);
    case 'outside':
      return card(phrase('36種類以外の貝', 'かもしれません'),
        h('p', { class: 'small' }, phrase('念のため、', '形と色で探して、', '図鑑の写真とも見比べてみましょう。')),
        findBtn(true),
        hintList(3),
        retake);
    case 'error':
      return notice('warn ai-error', 'alert', h('div', { class: 'stack-sm' },
        h('p', null, 'AIの判定ができませんでした。電波のよい場所で「もう一度試す」を押すか、下の一覧から写真を見比べて探してください。'),
        h('button', { class: 'btn small', type: 'button', onclick: () => window.dispatchEvent(new CustomEvent('m36:retry-ai')) }, 'もう一度試す'),
        result.message ? h('p', { class: 'xsmall muted' }, `（くわしい理由：${result.message}）`) : null));
    default:
      return null;
  }
}
