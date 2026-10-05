// 36種類のマスターデータ（site/data/shells.json）と設定（site/data/config.json）の読み込み
//
// 表示してよい情報は、ここでまとめて決める（画面側で個別に判断しない）。
//   confirmed   … 原本・実物で確認済み。どのモードでも表示
//   transcribed … 資料から転記しただけ。確認用プレビュー（mode: "preview"）でだけ「照合待ち」付きで表示
//   unclear / unconfirmed … どこにも表示しない（検索・絞り込みにも使わない）
// 番号・名前・箱の位置は、アプリの動作に欠かせないため常に表示する。
// 一般公開の前に tools/check_release.py で照合状況を確認すること。

import { normalize } from './ui.js';

let cache = null;

export async function loadData() {
  if (cache) return cache;
  const [res, cres] = await Promise.all([
    fetch('data/shells.json', { cache: 'no-cache' }),
    fetch('data/config.json', { cache: 'no-cache' }),
  ]);
  if (!res.ok || !cres.ok) throw new Error(`data ${res.status}/${cres.status}`);
  const data = await res.json();
  data.config = await cres.json();
  data.preview = data.config.mode !== 'public';
  data.byNo = {};
  data.byPos = {};
  for (const sp of data.species) {
    sp.v = viewOf(data, sp);
    data.byNo[sp.no] = sp;
    data.byPos[`${sp.box.row}-${sp.box.col}`] = sp;
    sp._search = normalize([sp.no, sp.v.name, sp.v.ruby?.text, sp.v.sheetName].filter(Boolean).join(' '));
  }
  cache = data;
  return data;
}

export function shown(data, item) {
  if (!item) return false;
  return item.status === 'confirmed' || (data.preview && item.status === 'transcribed');
}

function pending(item) {
  return item?.status !== 'confirmed';
}

// 画面で使う値（表示してよいものだけ）
function viewOf(data, sp) {
  const v = { name: sp.name.text, pending: new Set() };
  if (pending(sp.name)) v.pending.add('name');
  if (pending(sp.box)) v.pending.add('box');
  if (shown(data, sp.ruby)) {
    v.ruby = { base: sp.ruby.base, text: sp.ruby.text };
    if (pending(sp.ruby)) v.pending.add('ruby');
  }
  if (shown(data, sp.sheetName)) {
    v.sheetName = sp.sheetName.text;
    if (pending(sp.sheetName)) v.pending.add('sheetName');
  }
  if (shown(data, sp.shape) && sp.shape.value) {
    v.shape = sp.shape.value;
    if (pending(sp.shape)) v.pending.add('shape');
  }
  if (shown(data, sp.rarity)) {
    v.rarity = sp.rarity.value;
    if (pending(sp.rarity)) v.pending.add('rarity');
  }
  v.features = (sp.features || []).filter((f) => shown(data, f));
  if (v.features.some(pending)) v.pending.add('features');
  v.similar = (sp.similar || []).filter((s) => shown(data, s));
  v.colors = sp.colors && shown(data, sp.colors) ? sp.colors.values : [];
  // 写真：番号との対応が表示可、かつ利用許諾が確認済み（プレビューでは許諾確認中も表示）
  v.photos = (sp.photos || []).filter((p) => shown(data, p.mapping) && (p.rights?.status === 'confirmed' || data.preview));
  v.photoPending = v.photos.some((p) => pending(p.mapping) || p.rights?.status !== 'confirmed');
  return v;
}

export function brandShown(data) {
  return data.config.brandAssets?.status === 'confirmed' || data.preview;
}

// 開発用モード：URL に ?dev=1 を付けると、このタブの間だけ有効（?dev=0 で解除）
export function isDev() {
  try { return sessionStorage.getItem('m36shells:dev') === '1'; } catch { return false; }
}

// スタッフ用モード：URL に ?staff=1 を付けて一度開くと、その端末ではずっと有効（?staff=0 で解除）。
// 学習用の写真集めの画面と「学習用に保存」ボタンだけが使えるようになる（開発用の表示は出ない）
const STAFF_KEY = 'm36shells:staff';
export function isStaff() {
  if (isDev()) return true;
  try { return localStorage.getItem(STAFF_KEY) === '1'; } catch { return false; }
}

// 写真を送付するための合鍵（スタッフ用QRコードの URL の key=…）。サイトのファイルには書かない
const STAFF_KEY_KEY = 'm36shells:staff-key';
export function staffKey() {
  try { return localStorage.getItem(STAFF_KEY_KEY) || ''; } catch { return ''; }
}

export function setStaffFromQuery(query) {
  const k = query.get('key');
  if (k) { try { localStorage.setItem(STAFF_KEY_KEY, k); localStorage.setItem(STAFF_KEY, '1'); } catch { /* 覚えられない */ } }
  const s = query.get('staff');
  if (s === null) return;
  if (s === '0') { try { localStorage.removeItem(STAFF_KEY_KEY); } catch { /* 何もしない */ } }
  try {
    if (s === '1') localStorage.setItem(STAFF_KEY, '1');
    else localStorage.removeItem(STAFF_KEY);
  } catch { /* 覚えられないときは、この画面の間だけ */ }
}

export function setDevFromQuery(query) {
  const d = query.get('dev');
  if (d === null) return;
  try {
    if (d === '1') sessionStorage.setItem('m36shells:dev', '1');
    else sessionStorage.removeItem('m36shells:dev');
  } catch { /* 何もしない */ }
}

// 箱の自動読み取りを使えるか。"preview"＝確認用プレビューで試験版として使う（実物試験に合格したら "public"）
export function scanAvailable(data) {
  const f = data.config.features?.boxScan;
  return f === 'public' || (f === 'preview' && (data.preview || isDev())) || (f === 'dev' && isDev());
}

export function scanIsPublic(data) {
  return data.config.features?.boxScan === 'public';
}

// 番号・名前で探す。数字だけなら番号の完全一致を優先
export function searchSpecies(data, query) {
  const q = normalize(query).replace(/番$/, '');
  if (!q) return data.species;
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    return data.species.filter((s) => s.no === n);
  }
  const q2 = q.replace(/(貝|がい|かい)$/, '');
  return data.species.filter((s) => s._search.includes(q) || (q2 && s._search.includes(q2)));
}

// 絞り込みに使える形・色（表示してよい値を持つ種類があるものだけ）
export function availableShapes(data) {
  const used = new Set(data.species.map((s) => s.v.shape).filter(Boolean));
  return Object.keys(data.shapes).filter((k) => used.has(k));
}

export function availableColors(data) {
  const used = new Set(data.species.flatMap((s) => s.v.colors));
  return Object.keys(data.colorPalette).filter((k) => used.has(k));
}

export function positionLabel(sp) {
  return `上から${sp.box.row}段目・右から${10 - sp.box.col}列目`;
}
