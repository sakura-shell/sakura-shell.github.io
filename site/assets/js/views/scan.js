// 箱を読み取る（試験中の機能。config.json の features.boxScan で公開を切り替える）
// 手順: 1 撮影 → 2 範囲・向き → 3 確認・保存
import { h, ic, fill, toast, confirmSheet, openSheet, notice, formatDate, shellImg, lightbox, phrase } from '../ui.js';
import { loadBox, saveBox, counts, STATE_LABEL, storageAvailable, useTemp, saveLabel, isTemp } from '../store.js';
import { scanAvailable, scanIsPublic } from '../data.js';
import { openCamera } from '../lib/camera.js';
import { fileToCanvas, pickImageFile } from '../lib/image.js';
import {
  detectBox, orderClockwise, guessBoxCorners, rotateCorners, squareToQuad, mapPoint, rectify, readCells, cellRect, validateCorners,
} from '../lib/boxreader.js';
import { page } from './common.js';
import { zoomableBox, legend } from './boxgrid.js';

const RECT_W = 1260;
const STEP_NAMES = ['撮影', '範囲・向き', '確認・保存'];
const CORNER_NAMES = ['左上', '右上', '右下', '左下'];
// 確認画面で選べる状態（読み取りで決めきれなかったマス check は、どちらかを選ぶまで保存できない）
const REVIEW_STATES = ['filled', 'empty'];
const REVIEW_LABEL = { filled: '箱に入れる', empty: '空き', check: 'どちらか選ぶ' };

export function render(ctx) {
  const { data } = ctx;
  const layout = data.box;
  const prevRec = loadBox();

  // 公開前（試験中）は、開発用モードでだけ使える
  if (!scanAvailable(data)) {
    return page(ctx, { title: '収集箱を読み取る', back: '#/box' },
      h('div', { class: 'stack' },
        notice('', 'info', h('p', null, '箱を撮って読み取る機能は、いま試験中です。実物の箱を見ながら、手で記録してください。')),
        h('a', { class: 'btn block', href: '#/box?view=list' }, ic('edit'), '手で記録する')));
  }

  const s = {
    step: 'start',
    photo: null, // canvas（端末内のみ）
    corners: null, // 箱の [左上, 右上, 右下, 左下]（1番は右上）
    detect: null,
    active: 0, // 調整中の角
    orientationOk: false,
    draft: null, // 下書き { [no]: { s, img, score } }
    readWarning: null,
    selected: null,
    edited: false, // 読み取り後に手で直したか
    cancelled: false,
  };

  ctx.setGuard(async () => {
    if (s.step === 'start') return true;
    return confirmSheet({ title: '読み取りをやめますか？', body: '確認中の結果は保存されません。前の記録はそのまま残ります。', ok: 'やめる', cancel: '続ける' });
  });
  ctx.setDirty(() => s.step !== 'start');

  const main = page(ctx, { title: '収集箱を読み取る', back: '#/box', hideTabbar: true });
  const body = h('div', { class: 'stack' });
  main.append(body);

  const stepsBar = (n) => h('ol', { class: 'steps-text', 'aria-label': `手順 ${n} / 3` },
    STEP_NAMES.map((name, i) => h('li', { class: i + 1 === n ? 'on' : i + 1 < n ? 'done' : '', 'aria-current': i + 1 === n ? 'step' : null }, `${i + 1} ${name}`)));

  // ---------- 1. 撮影 ----------
  function drawStart(errorText) {
    s.step = 'start';
    fill(body,
      stepsBar(1),
      scanIsPublic(data) ? null : notice('warn', 'alert', h('p', { class: 'small' }, '試験中の機能です。結果は必ず実物と見比べて確かめてください。')),
      h('section', { class: 'card stack' },
        h('h2', null, '箱全体を撮影します'),
        h('div', { class: 'guide-art' }, guideArt()),
        h('ol', { class: 'tips' },
          h('li', null, h('span', { class: 'n' }, '1'), h('span', null, 'ふたを外して、四すみまで入るように箱全体を写す')),
          h('li', null, h('span', { class: 'n' }, '2'), h('span', null, 'できるだけ真上から。影や光の反射が少ない場所で')),
          h('li', null, h('span', { class: 'n' }, '3'), h('span', null, '向きは次の画面で合わせられます'))),
        errorText ? notice('warn', 'alert', h('p', null, errorText)) : null,
        h('button', { class: 'btn block', type: 'button', onclick: fromCamera }, ic('camera'), 'カメラで撮る'),
        h('button', { class: 'btn block secondary', type: 'button', onclick: fromFile }, ic('image'), '写真を選ぶ')),
      h('p', { class: 'small muted' }, '読み取りはこの端末の中だけで行い、写真は送信しません。保存するのは、各マスの小さな切り抜き画像と状態だけです。'),
      prevRec && !isTemp(prevRec) ? notice('ok', 'save', h('p', { class: 'small' }, `前の記録（${formatDate(prevRec.savedAt)}・貝あり ${counts(prevRec).filled}/36）は、確認して保存するまで変わりません。`)) : null,
      h('a', { class: 'btn block ghost', href: '#/box?view=list' }, ic('edit'), '写真を使わず手で記録する'),
    );
  }

  async function fromCamera() {
    const cv = await openCamera({ mode: 'box' });
    if (cv) usePhoto(cv);
  }

  async function fromFile() {
    const file = await pickImageFile();
    if (!file) return;
    try {
      usePhoto(await fileToCanvas(file, 1600));
    } catch (e) {
      drawStart(e.message);
    }
  }

  function usePhoto(cv) {
    s.photo = cv;
    s.photoURL = cv.toDataURL('image/jpeg', 0.85);
    s.imageData = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
    s.draft = null;
    s.edited = false;
    autoDetect();
    drawAdjust();
  }

  function autoDetect() {
    const det = detectBox(s.imageData);
    s.detect = det;
    s.orientationOk = false;
    if (det.quad) {
      s.corners = guessBoxCorners(orderClockwise(det.quad));
    } else {
      // 見つからないときは、写真の中央に仮の枠を置く
      const W = s.photo.width, H = s.photo.height;
      const bw = W * 0.8, bh = Math.min(H * 0.8, bw / layout.aspect);
      const x0 = (W - bw) / 2, y0 = (H - bh) / 2;
      s.corners = [[x0, y0], [x0 + bw, y0], [x0 + bw, y0 + bh], [x0, y0 + bh]];
    }
  }

  // ---------- 2. 範囲・向き ----------
  function drawAdjust() {
    s.step = 'adjust';
    const W = s.photo.width, H = s.photo.height;
    const img = h('img', { src: s.photoURL, alt: '撮影した箱の写真', draggable: 'false' });
    const NS = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(NS, 'svg');
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.setAttribute('preserveAspectRatio', 'none');
    svgEl.setAttribute('tabindex', '0');
    svgEl.setAttribute('aria-label', '箱の範囲。矢印キーで選んだ角を動かせます');
    const r = Math.max(W, H) * 0.028;
    const frame = h('div', { class: 'adjust-img' }, h('div', { class: 'adjust-inner' }, img, svgEl));
    const problem = h('div', { 'aria-live': 'polite' });
    const readBtn = h('button', { class: 'btn block', type: 'button', onclick: runRead }, '読み取る');
    const okCheck = h('input', { type: 'checkbox', id: 'orient-ok' });
    okCheck.checked = s.orientationOk;

    const refresh = () => {
      redraw();
      const v = validateCorners(s.corners, W, H);
      const msg = { cross: '四すみの順番が入れかわっているか、辺が交差しています。角を箱の四すみに合わせ直してください。', small: '枠が小さすぎます。箱の四すみに合わせてください。', narrow: '枠が細すぎます。箱の四すみに合わせてください。' };
      problem.replaceChildren(v.ok ? '' : notice('warn', 'alert', h('p', { class: 'small' }, msg[v.reason])));
      readBtn.disabled = !v.ok || !s.orientationOk;
    };
    okCheck.addEventListener('change', () => { s.orientationOk = okCheck.checked; refresh(); });

    function redraw() {
      svgEl.replaceChildren();
      const c = s.corners;
      const poly = document.createElementNS(NS, 'polygon');
      poly.setAttribute('class', 'quad');
      poly.setAttribute('points', c.map((p) => p.join(',')).join(' '));
      svgEl.append(poly);
      const Hm = squareToQuad(c);
      const mx = layout.innerMargin.x, my = layout.innerMargin.y;
      const line = (u0, v0, u1, v1) => {
        const a = mapPoint(Hm, u0, v0), b = mapPoint(Hm, u1, v1);
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('class', 'grid-line');
        l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]);
        svgEl.append(l);
      };
      for (let i = 0; i <= layout.cols; i++) { const u = mx + (i * (1 - 2 * mx)) / layout.cols; line(u, my, u, 1 - my); }
      for (let j = 0; j <= layout.rows; j++) { const v = my + (j * (1 - 2 * my)) / layout.rows; line(mx, v, 1 - mx, v); }
      // 1番のマスの印
      const one = data.byNo[1].box;
      const cu = mx + ((one.col - 0.5) * (1 - 2 * mx)) / layout.cols;
      const cv = my + ((one.row - 0.5) * (1 - 2 * my)) / layout.rows;
      const [ox, oy] = mapPoint(Hm, cu, cv);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'one'); dot.setAttribute('cx', ox); dot.setAttribute('cy', oy); dot.setAttribute('r', r * 0.95);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'one-t'); t.setAttribute('x', ox); t.setAttribute('y', oy); t.setAttribute('font-size', r * 1.2);
      t.textContent = '1';
      svgEl.append(dot, t);
      c.forEach((p, i) => {
        const hc = document.createElementNS(NS, 'circle');
        hc.setAttribute('class', `handle${i === s.active ? ' active' : ''}`);
        hc.setAttribute('cx', p[0]); hc.setAttribute('cy', p[1]); hc.setAttribute('r', r);
        svgEl.append(hc);
      });
    }

    // ドラッグで四すみを動かす
    let dragging = -1;
    const toImg = (e) => {
      const b = svgEl.getBoundingClientRect();
      return [Math.min(W, Math.max(0, ((e.clientX - b.left) / b.width) * W)), Math.min(H, Math.max(0, ((e.clientY - b.top) / b.height) * H))];
    };
    // 写真の外側の余白でも角をつかめるよう、外枠で受け取る
    frame.addEventListener('pointerdown', (e) => {
      const p = toImg(e);
      let best = -1, bd = Infinity;
      s.corners.forEach((c, i) => { const d = Math.hypot(c[0] - p[0], c[1] - p[1]); if (d < bd) { bd = d; best = i; } });
      if (bd > r * 4) return;
      dragging = best;
      selectCorner(best);
      frame.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    frame.addEventListener('pointermove', (e) => {
      if (dragging < 0) return;
      s.corners[dragging] = toImg(e);
      s.orientationOk = false; okCheck.checked = false;
      refresh();
    });
    const end = () => { dragging = -1; };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);

    // ドラッグの代わり：角を選んで、上下左右ボタン（またはキーボードの矢印）で動かす
    const step = Math.max(W, H) * 0.01;
    const nudge = (dx, dy) => {
      const p = s.corners[s.active];
      s.corners[s.active] = [Math.min(W, Math.max(0, p[0] + dx * step)), Math.min(H, Math.max(0, p[1] + dy * step))];
      s.orientationOk = false; okCheck.checked = false;
      refresh();
    };
    svgEl.addEventListener('keydown', (e) => {
      const map = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (map[e.key]) { e.preventDefault(); nudge(...map[e.key]); }
    });
    const cornerSeg = h('div', { class: 'seg corner-seg', role: 'group', 'aria-label': '動かす角' },
      CORNER_NAMES.map((name, i) => h('button', { type: 'button', 'aria-pressed': String(i === s.active), onclick: () => selectCorner(i) }, name)));
    function selectCorner(i) {
      s.active = i;
      cornerSeg.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      redraw();
    }
    const pad = h('div', { class: 'nudge-pad', role: 'group', 'aria-label': '選んだ角を動かす' },
      h('button', { type: 'button', class: 'up', 'aria-label': '上へ', onclick: () => nudge(0, -1) }, '↑'),
      h('button', { type: 'button', class: 'left', 'aria-label': '左へ', onclick: () => nudge(-1, 0) }, '←'),
      h('button', { type: 'button', class: 'right', 'aria-label': '右へ', onclick: () => nudge(1, 0) }, '→'),
      h('button', { type: 'button', class: 'down', 'aria-label': '下へ', onclick: () => nudge(0, 1) }, '↓'));

    const det = s.detect;
    const status = det?.reason === 'ok'
      ? notice('ok', 'check', h('p', { class: 'small' }, '箱の範囲を自動で合わせました。黄色い枠が箱のふちに合っているか確かめてください。'))
      : det?.quad
        ? notice('warn', 'alert', h('p', { class: 'small' }, '箱の範囲を合わせましたが、ずれているかもしれません。四すみを箱の角に合わせてください。'))
        : notice('warn', 'alert', h('p', { class: 'small' }, '箱の場所を見つけられませんでした。四すみを箱の角に合わせてください。'));

    const rotate = (k) => { s.corners = rotateCorners(s.corners, k); s.orientationOk = false; okCheck.checked = false; refresh(); };

    fill(body,
      stepsBar(2),
      status,
      frame,
      h('section', { class: 'card stack-sm' },
        h('h2', { style: { fontSize: '17px' } }, '向きの確認'),
        h('p', { class: 'small' }, phrase(h('strong', null, 'ピンクの「1」'), 'が、', '1番のマス', '（すだれ貝を入れるマス）に', '重なるように', '回してください。')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn small secondary', type: 'button', onclick: () => rotate(2) }, ic('rotate'), '上下を反対に'),
          h('button', { class: 'btn small secondary', type: 'button', onclick: () => rotate(1) }, ic('rotate'), '90°回す')),
        h('label', { class: 'check-row', for: 'orient-ok' }, okCheck, h('span', null, '「1」が1番のマスに重なっている')),
        h('a', { class: 'btn small ghost', href: '#/box?view=list' }, '空の箱などで向きが分からない → 手で記録する')),
      h('details', { class: 'card flat adjust-tools' },
        h('summary', null, '角を細かく動かす'),
        h('div', { class: 'stack-sm' }, h('p', { class: 'xsmall muted' }, '角を選んで、矢印で少しずつ動かせます。写真の上をドラッグしても動かせます。'), cornerSeg, pad)),
      problem,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small soft', type: 'button', onclick: () => { autoDetect(); okCheck.checked = false; refresh(); toast(s.detect.quad ? '自動で合わせ直しました' : '箱を見つけられませんでした'); } }, ic('magic'), '自動で合わせる'),
        h('button', { class: 'btn small soft', type: 'button', onclick: () => drawStart() }, ic('retake'), '撮り直す')),
      h('div', { class: 'bottom-actions' }, readBtn),
    );
    refresh();
  }

  // ---------- 読み取り ----------
  async function runRead() {
    if (s.draft && s.edited) {
      const ok = await confirmSheet({ title: '読み取り直しますか？', body: '確認画面で手で直した内容は消えます。', ok: '読み取り直す', cancel: 'やめる' });
      if (!ok) return;
    }
    s.cancelled = false;
    fill(body, stepsBar(3), h('div', { class: 'card stack center' }, h('div', { class: 'spinner' }), h('p', null, '読み取り中…'),
      h('button', { class: 'btn small secondary', type: 'button', onclick: () => { s.cancelled = true; drawAdjust(); } }, 'やめる')));
    setTimeout(() => {
      if (s.cancelled) return;
      try {
        const RH = Math.round(RECT_W / layout.aspect);
        const rect = rectify(s.imageData, s.corners, RECT_W, RH);
        const res = readCells(rect, layout);
        if (s.cancelled) return;
        const rc = document.createElement('canvas');
        rc.width = RECT_W; rc.height = RH;
        rc.getContext('2d').putImageData(new ImageData(rect.data, RECT_W, RH), 0, 0);
        s.draft = {};
        for (const cell of res.cells) {
          const sp = data.byPos[`${cell.row}-${cell.col}`];
          s.draft[sp.no] = { s: cell.state, img: cellThumb(rc, rect, cell.row, cell.col) };
        }
        s.readWarning = res.warning;
        s.selected = null;
        s.edited = false;
        drawReview();
      } catch (e) {
        console.error(e);
        fill(body, stepsBar(3), notice('warn', 'alert', h('p', null, '読み取りに失敗しました。前の記録はそのまま残っています。')),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn secondary', type: 'button', onclick: drawAdjust }, '範囲を直す'),
            h('button', { class: 'btn', type: 'button', onclick: () => drawStart() }, '撮り直す')));
      }
    }, 30);
  }

  function cellThumb(rc, rect, row, col) {
    const r = cellRect(rect, row, col, layout);
    const cv = document.createElement('canvas');
    cv.width = 84; cv.height = 120;
    cv.getContext('2d').drawImage(rc, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.72);
  }

  // ---------- 3. 確認・保存 ----------
  let boxView = null;
  const prevState = (no) => (prevRec ? (prevRec.cells[no]?.s === 'filled' ? 'filled' : 'empty') : null);
  const changedSet = () => {
    const set = new Set();
    if (prevRec) for (let no = 1; no <= 36; no++) if (prevState(no) !== s.draft[no].s) set.add(no);
    return set;
  };

  function nextWhere(pred) {
    for (let k = 1; k <= 36; k++) {
      const no = ((s.selected || 0) + k - 1) % 36 + 1;
      if (pred(no)) return no;
    }
    return null;
  }

  function jump(no, emptyMsg) {
    if (!no) { toast(emptyMsg); return; }
    s.selected = no;
    boxView?.focusCell(no);
    redrawReview(true);
  }

  function drawReview(focusPanel = false) {
    s.step = 'review';
    const c = counts({ cells: s.draft });
    const undecided = Object.values(s.draft).filter((d) => d.s === 'check').length;
    const changed = changedSet();
    const opts = { cells: s.draft, selected: s.selected, changed: prevRec ? changed : null, allThumbs: true, zoom: boxView?.zoom, onTap };
    boxView = zoomableBox(data, opts);
    const panel = s.selected ? selPanel(s.selected) : null;

    fill(body,
      stepsBar(3),
      h('div', { class: 'card stack-sm' },
        h('p', { class: 'unsaved' }, 'まだ保存していません'),
        h('div', { class: 'box-summary' },
          h('span', { class: 'small muted' }, '貝あり'), h('span', { class: 'big' }, c.filled, h('small', null, ' / 36'))),
        h('p', { class: 'small muted' }, `空き ${c.empty - undecided}`, undecided ? `・どちらか選ぶ ${undecided}` : '',
          prevRec ? `・前回と違うマス ${changed.size}` : '')),
      s.readWarning ? notice('warn', 'alert', h('p', { class: 'small' }, '箱の範囲や向きがずれているかもしれません。結果がおかしいときは「範囲・向きを直す」から合わせ直してください。')) : null,
      notice('', 'hand', h('p', { class: 'small' }, '自動の結果は間違うことがあります。実物の箱と見比べて、違うマスを直してください。',
        undecided ? h('strong', null, `「?」のマス（読み取りで決めきれなかった${undecided}マス）は、「箱に入れる」か「空き」を選ぶと保存できます。`) : null)),
      h('div', { class: 'btn-row' },
        undecided ? h('button', { class: 'btn small soft', type: 'button', onclick: () => jump(nextWhere((no) => s.draft[no].s === 'check'), '「?」のマスはありません') }, `次の「?」のマス（${undecided}）`) : null,
        prevRec ? h('button', { class: 'btn small soft', type: 'button', disabled: !changed.size, onclick: () => jump(nextWhere((no) => changed.has(no)), '前回と違うマスはありません') }, `次の変更マス（${changed.size}）`) : null),
      h('div', { class: 'stack-sm' },
        h('div', { class: 'row between' }, h('p', { class: 'small muted' }, prevRec ? '赤い点：前回と違うマス' : '右上が1番です'), boxView.zoomButton),
        boxView.range,
        boxView.el,
        legend({ withUndecided: undecided > 0 })),
      panel,
      h('button', { class: 'btn block ghost small', type: 'button', onclick: drawAdjust }, '範囲・向きを直す'),
      !storageAvailable() ? notice('warn', 'alert', h('p', { class: 'small' }, 'この環境では保存できません。「この画面だけで使う」でページを閉じるまで使えます。')) : null,
      h('div', { class: 'bottom-actions' },
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn secondary', type: 'button', onclick: async () => {
            if (await confirmSheet({ title: '撮り直しますか？', body: 'この読み取り結果は保存されません。', ok: '撮り直す', cancel: '戻る' })) drawStart();
          } }, ic('retake'), '撮り直す'),
          undecided
            ? h('button', { class: 'btn', type: 'button', onclick: () => jump(nextWhere((no) => s.draft[no].s === 'check'), '') }, `あと${undecided}マス選ぶ`)
            : storageAvailable()
              ? h('button', { class: 'btn', type: 'button', onclick: save }, saveLabel(cellsToSave()))
              : h('button', { class: 'btn', type: 'button', onclick: () => useTempAndGo() }, 'この画面だけで使う'))),
    );
    if (focusPanel && panel) requestAnimationFrame(() => panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  // マスをタップすると選ぶだけ。状態は下のボタンで切り替える
  function onTap(no) {
    s.selected = no;
    redrawReview(true);
  }

  function redrawReview(focusPanel) {
    const x = boxView?.el.scrollLeft || 0;
    const y = window.scrollY;
    drawReview(focusPanel);
    boxView.el.scrollLeft = x;
    window.scrollTo(0, y);
  }

  function selPanel(no) {
    const sp = data.byNo[no];
    const d = s.draft[no];
    const before = prevState(no);
    const picker = h('div', { class: 'state-picker', role: 'group', 'aria-label': `${no}番の状態` },
      REVIEW_STATES.map((st) => h('button', {
        type: 'button', 'aria-pressed': String(d.s === st),
        onclick: () => { d.s = st; s.edited = true; redrawReview(false); },
      }, st === 'filled' ? ic('check') : null, REVIEW_LABEL[st])));
    return h('section', { class: 'card stack-sm sel-card', 'aria-label': `${no}番のマス` },
      h('div', { class: 'sel-panel' },
        h('button', { class: 'user-photo', type: 'button', 'aria-label': 'あなたの箱の写真を拡大', onclick: () => lightbox(d.img, `${no}番のマス（あなたの箱の写真）`) },
          h('img', { src: d.img, alt: '' }), h('span', { class: 'photo-label' }, '箱')),
        h('div', { class: 'grow' },
          h('div', { class: 'row' }, h('span', { class: 'no-badge' }, no), h('span', { class: 'state-pill', dataset: { state: d.s } }, d.s === 'check' ? 'どちらか選ぶ' : STATE_LABEL[d.s])),
          h('div', { class: 'nm' }, sp.v.name),
          before !== null ? h('p', { class: 'xsmall' }, `前回：${STATE_LABEL[before]} → 今回：${d.s === 'check' ? '？' : STATE_LABEL[d.s]}`) : null),
        h('div', { class: 'ph' }, shellImg(sp), h('span', { class: 'photo-label' }, '図鑑'))),
      picker);
  }

  function cellsToSave() {
    const now = new Date().toISOString();
    const cells = {};
    for (let no = 1; no <= 36; no++) {
      const d = s.draft[no];
      if (d.s !== 'filled') continue; // 保存するのは「箱に入れた」マスだけ（決めきれなかったマスを勝手に入れない）
      cells[no] = { s: 'filled', t: now, img: d.img }; // 空きの画像は保存しない
    }
    return cells;
  }

  function save() {
    const res = saveBox({ source: 'scan', cells: cellsToSave() });
    if (!res.ok) {
      openSheet((close) => h('div', { class: 'stack' },
        h('h2', { style: { fontSize: '19px' } }, '保存できませんでした'),
        h('p', { class: 'small' }, '前の記録はそのまま残っています。「この画面を開いている間だけ使う」を選ぶと、ページを閉じるまでこの結果を使えます。'),
        h('button', { class: 'btn block', type: 'button', onclick: () => { close(); useTempAndGo(); } }, 'この画面を開いている間だけ使う'),
        h('button', { class: 'btn block ghost', type: 'button', onclick: close }, '確認に戻る')));
      return;
    }
    s.step = 'start'; // 保存済みなので離脱の確認は不要
    toast(res.droppedImages ? '保存しました（容量のため箱の写真は省きました）' : '保存しました');
    ctx.navigate('#/box', { replace: true });
  }

  function useTempAndGo() {
    useTemp(cellsToSave());
    s.step = 'start';
    toast('この画面を開いている間だけ使います');
    ctx.navigate('#/box', { replace: true });
  }

  drawStart();
  return main;
}

function guideArt() {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg viewBox="0 0 200 150" fill="none" stroke="#2E3A6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="30" y="6" width="140" height="138" rx="16" fill="#fff"/>
    <rect x="42" y="36" width="116" height="80" rx="4" fill="#7FD2EC" stroke="#FFE36B" stroke-width="3"/>
    <path d="M42 56h116M42 76h116M42 96h116M54.9 36v80M67.8 36v80M80.7 36v80M93.6 36v80M106.4 36v80M119.3 36v80M132.2 36v80M145.1 36v80" stroke-width="1.2"/>
    <circle cx="100" cy="132" r="5"/>
  </svg>`;
  return wrap.firstElementChild;
}
