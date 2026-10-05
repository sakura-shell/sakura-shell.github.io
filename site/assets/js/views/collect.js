// 学習用の写真を集める（運営スタッフ用。スタッフ用QRコード ?staff=1&key=… で一度開いた端末だけ）
// 海岸で撮った写真に正しい番号を付けて「送付」すると、運営の Google ドライブに届く（tools/collect_server/Code.gs）。
// 電波がないときは端末に貯めておき、あとで送付する。パソコンでは python3 tools/fetch_collected.py で受け取って学習し直す。
// 送付先が設定されていないときは、これまでどおり ZIP で書き出す。
import { h, ic, toast, confirmSheet, notice, shellImg, phrase } from '../ui.js';
import { isStaff, staffKey } from '../data.js';
import { fileToCanvas, pickImageFile, pickImageFiles } from '../lib/image.js';
import { openCamera } from '../lib/camera.js';
import { addPhoto, allPhotos, markExported, deleteExported, askPersist, markSent } from '../lib/collectdb.js';
import { makeZip } from '../lib/zip.js';
import { page } from './common.js';

const GOAL_PHOTOS = 30; // 1種類あたりの目安
const GOAL_GROUPS = 3; // 別の個体の数の目安
const STATE_KEY = 'm36shells:collect';

function today() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// この端末の印（ほかのスタッフの写真と名前が重ならないように）
function deviceId() {
  try {
    let id = localStorage.getItem('m36shells:device');
    if (!id) { id = Math.random().toString(36).slice(2, 6); localStorage.setItem('m36shells:device', id); }
    return id;
  } catch { return 'x'; }
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

function canvasToBlob(cv, quality = 0.88) {
  return new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', quality));
}

export async function render(ctx) {
  const { data } = ctx;
  const main = page(ctx, { title: '学習用の写真を集める', back: '#/' });
  const body = h('div', { class: 'stack' });
  main.append(body);
  if (!isStaff()) {
    body.append(notice('', 'info', h('p', null, 'この画面は運営スタッフ用です。スタッフ用のQRコード（URLの最後が ?staff=1）から開いてください。')));
    return main;
  }
  // 選んでいる貝と、いま撮っている個体の番号（端末に覚えておく）
  let st = { label: '', n: 1 };
  try { st = { ...st, ...JSON.parse(sessionStorage.getItem(STATE_KEY) || '{}') }; } catch { /* 初期値 */ }
  const saveState = () => { try { sessionStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch { /* 覚えなくても動く */ } };
  let photos = [];
  let busy = false;
  const endpoint = data.config.collect?.endpoint || '';
  const key = staffKey();
  const canSend = !!(endpoint && key);
  let progress = null; // 送付中 { done, total }

  async function refresh() {
    try { photos = await allPhotos(); } catch { photos = []; }
    draw();
  }

  const group = () => `${st.label === 'other' ? 'other' : String(st.label).padStart(2, '0')}-${today()}-${deviceId()}-kai${st.n}`;

  // 送付：まだ送っていない写真を1枚ずつ送る。届いた写真は端末から画像を消す（数の記録は残す）
  async function sendAll() {
    const list = photos.filter((p) => !p.sentAt && p.blob);
    if (!list.length || !canSend) return;
    if (navigator.onLine === false) { toast('電波がありません。電波のある所で、もう一度「送付する」を押してください', 4500); return; }
    busy = true; progress = { done: 0, total: list.length }; draw();
    let failed = 0;
    let keyError = false;
    for (const p of list) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 事前確認（CORS）を起こさない送り方
          body: JSON.stringify({ key, label: p.label, group: p.group, name: `${p.group}-${String(p.id).padStart(6, '0')}`, data: await blobToBase64(p.blob), t: p.t, note: p.note || '' }),
        });
        const j = await res.json();
        if (!j.ok) throw new Error(j.error || 'error');
        await markSent(p.id, new Date().toISOString());
      } catch (e) {
        failed++;
        if (e?.message === 'key') { keyError = true; break; }
      }
      progress.done++; draw();
    }
    busy = false; progress = null;
    if (keyError) toast('送付できませんでした（合鍵が違います）。スタッフ用のQRコードから開き直してください', 6000);
    else if (failed) toast(`${list.length - failed}枚を送付しました。${failed}枚は送れませんでした。電波のよい所で、もう一度「送付する」を押してください`, 6000);
    else toast(`${list.length}枚を送付しました。ありがとうございます！`, 4000);
    refresh();
  }

  async function addFrom(useCamera) {
    if (!st.label) { toast('先に、どの貝かを選んでください'); return; }
    let canvases = [];
    if (useCamera) {
      const cv = await openCamera({ mode: 'shell', maxSide: 1600 });
      if (cv) canvases = [cv];
    } else {
      const files = await pickImageFiles();
      for (const f of files) {
        try { canvases.push(await fileToCanvas(f, 1600)); } catch (e) { toast(e.message, 4000); }
      }
    }
    if (!canvases.length) return;
    busy = true; draw();
    askPersist();
    let ok = 0;
    for (const cv of canvases) {
      const blob = await canvasToBlob(cv);
      if (!blob) continue;
      try { await addPhoto({ label: String(st.label), group: group(), blob, t: new Date().toISOString() }); ok++; } catch { /* 容量不足など */ }
    }
    busy = false;
    toast(ok ? `${ok}枚を保存しました（${labelName(st.label)}・${st.n}個目の貝）` : '保存できませんでした（端末の空き容量を確かめてください）', 3200);
    refresh();
  }

  function labelName(label) {
    if (label === 'other') return '36種類以外の貝';
    const sp = data.byNo[Number(label)];
    return sp ? `${sp.no}番 ${sp.v.name}` : '';
  }

  // ZIP で書き出す。onlyNew：まだ書き出していない写真だけ
  async function exportZip(onlyNew) {
    const list = (onlyNew ? photos.filter((p) => !p.exportedAt) : photos).filter((p) => p.blob);
    if (!list.length) return;
    busy = true; draw();
    const files = [];
    for (const p of list) {
      const dir = p.label === 'other' ? 'other' : String(p.label).padStart(2, '0');
      // ファイル名は写真ごとの番号（何度書き出しても同じ名前。取り込み時に重ならない）
      files.push({ name: `photos/${dir}/${p.group}/${String(p.id).padStart(6, '0')}.jpg`, data: new Uint8Array(await p.blob.arrayBuffer()) });
    }
    const zip = makeZip(files);
    const stamp = new Date();
    const name = `shell-photos-${today()}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}.zip`;
    const a = h('a', { href: URL.createObjectURL(zip), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    try { await markExported(list.map((p) => p.id), stamp.toISOString()); } catch { /* 印が付けられなくても書き出しはできている */ }
    busy = false;
    toast(`${list.length}枚を書き出しました（${name}）`, 4000);
    refresh();
  }

  function sendButton() {
    const unsent = photos.filter((p) => !p.sentAt && p.blob).length;
    if (progress) return h('p', { class: 'send-progress', role: 'status' }, `送付中… ${progress.done} / ${progress.total}枚`);
    return h('button', { class: 'btn block found-btn', type: 'button', disabled: busy || !unsent, onclick: sendAll },
      ic('save'), unsent ? `送付する（${unsent}枚）` : 'すべて送付しました');
  }

  function draw() {
    body.replaceChildren();
    body.append(notice('', 'info', h('div', { class: 'stack-sm' },
      h('p', null, h('strong', null, '運営スタッフ用'), '：AI の判定を良くするための写真を集めます。'),
      h('p', { class: 'small' }, canSend
        ? '撮った写真は、どの貝かを選んで「送付する」を押すと、運営に届きます。電波がないときは端末に貯めておき、あとで送付できます。'
        : '写真はこの端末の中だけに保存され、「書き出す」まで外部には送りません。'))));

    // 1. どの貝か
    const sel = h('select', { class: 'collect-select', 'aria-label': 'どの貝か', onchange: (e) => { st.label = e.target.value; st.n = 1; saveState(); draw(); } },
      h('option', { value: '' }, '― 貝を選ぶ ―'),
      data.species.map((sp) => h('option', { value: String(sp.no), selected: String(sp.no) === String(st.label) ? true : null }, `${sp.no}番 ${sp.v.name}`)),
      h('option', { value: 'other', selected: st.label === 'other' ? true : null }, '36種類以外の貝・石・ガラスなど'));
    const sp = st.label && st.label !== 'other' ? data.byNo[Number(st.label)] : null;
    body.append(h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '1. どの貝か選ぶ'),
      sel,
      sp ? h('div', { class: 'sel-panel' }, h('div', { class: 'ph' }, shellImg(sp)), h('div', { class: 'grow' }, h('div', { class: 'nm' }, sp.v.name), h('p', { class: 'xsmall muted' }, '図鑑の写真と同じ貝か、よく確かめてから撮ってください'))) : null));

    // 2. 撮る
    if (st.label) {
      const mine = photos.filter((p) => p.group === group()).length;
      body.append(h('section', { class: 'card stack-sm' },
        h('h3', { class: 'section-title' }, `2. ${st.n}個目の貝を撮る`),
        h('p', { class: 'small' }, `この貝で ${mine}枚。`, phrase('1個の貝につき5〜10枚、', '置き方・向き・明るさを変えて撮ってください。')),
        h('ul', { class: 'small plain-list' },
          h('li', null, '手のひら・砂の上・ぬれた砂・収集箱の中など、海岸で撮るのと同じように'),
          h('li', null, '表・裏・斜め。遠め・近め。晴れ・日かげ'),
          h('li', null, '貝が1つだけ写るように')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', disabled: busy, onclick: () => addFrom(true) }, ic('camera'), 'カメラで撮る'),
          h('button', { class: 'btn secondary', type: 'button', disabled: busy, onclick: () => addFrom(false) }, ic('image'), '写真を選ぶ')),
        h('button', { class: 'btn block soft', type: 'button', disabled: busy || !mine, onclick: () => { st.n++; saveState(); draw(); toast(`${st.n}個目の貝にしました`); } },
          '別の貝（次の個体）に切り替える'),
        canSend ? sendButton() : null,
        h('p', { class: 'xsmall muted' }, '同じ種類でも別の貝を撮るときは切り替えてください。AI の成績を「学習に使っていない貝」で正しく測るためです。')));
    }

    // 3. 集まった数
    const by = {};
    for (const p of photos) {
      const b = (by[p.label] ||= { n: 0, groups: new Set() });
      b.n++; b.groups.add(p.group);
    }
    const labels = Object.keys(by).sort((a, b) => (a === 'other') - (b === 'other') || Number(a) - Number(b));
    const fresh = photos.filter((p) => !p.exportedAt && !p.sentAt && p.blob); // まだ送付も書き出しもしていない
    const exported = photos.filter((p) => p.exportedAt && p.blob);
    const sent = photos.filter((p) => p.sentAt).length;
    // 送っていない写真が多い・古いときは、送付（書き出し）を促す（iPhone では、しばらく開かないと保存した写真が消えることがある）
    const oldest = fresh.reduce((m, p) => (!m || p.t < m ? p.t : m), null);
    const days = oldest ? (Date.now() - Date.parse(oldest)) / 86400000 : 0;
    if (fresh.length >= 100 || days >= 1) {
      body.append(notice('warn', 'alert', h('p', { class: 'small' },
        h('strong', null, `まだ送っていない写真が ${fresh.length}枚あります。`),
        canSend ? 'iPhone などでは、しばらくこのサイトを開かないと、保存した写真が消えることがあります。電波のある所で「送付する」を押してください。'
          : 'iPhone などでは、しばらくこのサイトを開かないと、保存した写真が消えることがあります。その日のうちに書き出して、パソコンに送ってください。')));
    }
    const done = labels.filter((l) => l !== 'other' && by[l].n >= GOAL_PHOTOS && by[l].groups.size >= GOAL_GROUPS).length;
    body.append(h('section', { class: 'card stack-sm' },
      h('h3', { class: 'section-title' }, '3. 集まった写真'),
      h('p', { class: 'small' }, `合計 ${photos.length}枚（${canSend ? `送付済み ${sent}枚・まだ送っていない ${fresh.length}枚` : `書き出していない ${fresh.length}枚`}）。目安（1種類 ${GOAL_PHOTOS}枚・別の貝 ${GOAL_GROUPS}個）に届いたのは ${done} / 36種類。`),
      labels.length
        ? h('ul', { class: 'collect-list' }, labels.map((l) => {
          const b = by[l];
          const ok = l === 'other' ? b.n >= 100 : b.n >= GOAL_PHOTOS && b.groups.size >= GOAL_GROUPS;
          return h('li', { class: ok ? 'ok' : '' }, h('span', { class: 'grow' }, labelName(l)), h('span', { class: 'small' }, `${b.n}枚・${b.groups.size}個`), ok ? ic('check') : null);
        }))
        : h('p', { class: 'small muted' }, 'まだありません。'),
      canSend ? sendButton() : null,
      canSend
        ? h('details', { class: 'collect-zip' }, h('summary', { class: 'small' }, '送付できないとき（ZIP で書き出す）'), zipControls(fresh, exported))
        : zipControls(fresh, exported)));
  }

  function zipControls(fresh, exported) {
    return h('div', { class: 'stack-sm' },
      h('button', { class: `btn block${canSend ? ' secondary small' : ''}`, type: 'button', disabled: busy || !fresh.length, onclick: () => exportZip(true) }, ic('save'), fresh.length ? `まだ送っていない ${fresh.length}枚を ZIP で書き出す` : '書き出す写真はありません'),
      exported.length ? h('button', { class: 'btn block secondary small', type: 'button', disabled: busy, onclick: () => exportZip(false) }, 'もう一度すべてを書き出す') : null,
      exported.length ? h('button', { class: 'btn block ghost small', type: 'button', disabled: busy, onclick: async () => {
        if (!(await confirmSheet({ title: `書き出し済みの ${exported.length}枚を消しますか？`, body: '書き出した ZIP をパソコンに送ったことを確かめてから消してください。まだ書き出していない写真は残ります。', ok: '消す', cancel: 'やめる', danger: true }))) return;
        await deleteExported(); toast('書き出し済みの写真を消しました'); refresh();
      } }, `書き出し済みの ${exported.length}枚を消す（端末の空きを増やす）`) : null,
      h('p', { class: 'xsmall muted' }, '書き出した ZIP は、パソコンで python3 tools/import_collected.py <ZIP> を実行して学習に加えます。'));
  }

  await refresh();
  return main;
}
