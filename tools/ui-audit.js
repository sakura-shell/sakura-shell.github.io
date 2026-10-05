// 表示崩れの自動チェック（開発用）
// ブラウザのコンソールや自動操作から読み込んで使う:
//   const { audit } = await import('/tools/ui-audit.js'); await audit();
// 調べること:
//   1. 画面の横幅からはみ出している要素（箱・絞り込み・写真の小さな一覧の、意図した横スクロールを除く）
//   2. 親の枠で文字が切れている要素（overflow: hidden などで中身が収まっていない）
//   3. 「…」で省略されている文字
//   4. 画像が枠に合わせて切り取られている（object-fit: cover で縦横比が違う）
//   5. 3行以上に折り返したボタン・短いラベル
// 要素の中の文字が並んでいる行の数（アイコンは数えない）
export function textLines(el) {
  const tops = new Set();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top / 4));
  }
  return tops.size;
}

export function audit(root = document.querySelector('#app')) {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const label = (el) => {
    const t = (el.innerText || el.getAttribute('aria-label') || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : el.tagName;
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}「${t}」`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el)) continue;
    if (el.closest('.box-scroll, .chip-row, .thumbs, svg')) continue; // 意図した横スクロール
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // 1. はみ出し
    if (r.right > vw + 1 || r.left < -1) issues.push(['はみ出し', label(el), `left ${Math.round(r.left)} right ${Math.round(r.right)} / 画面 ${vw}`]);
    // 2. 枠で切れている（文字を含む要素）
    const clips = ['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
    if (clips && el.textContent.trim() && !el.matches('.box, .cell, .hero, .logo-pill, .photo-main, .ph, .user-photo, .shell-card, .no-photo')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
        issues.push(['文字が枠で切れている', label(el), `中身 ${el.scrollWidth}x${el.scrollHeight} / 枠 ${el.clientWidth}x${el.clientHeight}`]);
      }
    }
    // 3. 省略記号
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) issues.push(['「…」で省略', label(el), '']);
    // 4. 切り取られた画像
    if (el.tagName === 'IMG' && cs.objectFit === 'cover' && el.naturalWidth) {
      const a1 = el.naturalWidth / el.naturalHeight, a2 = r.width / r.height;
      const cut = 1 - Math.min(a1, a2) / Math.max(a1, a2);
      if (cut > 0.04 && !el.closest('.user-photo, .cell, .ph.user')) issues.push(['画像が切り取られている', label(el), `${Math.round(cut * 100)}%`]);
    }
    // 5. 折り返しすぎたボタン・ラベル（文字が実際に何行に並んでいるかを数える）
    if (el.matches('button, .btn, .chip, .tag, .state-pill, .no-badge') && !el.matches('.shell-card, .cell, .user-photo, .add-photo, .photo-main, .ph')) {
      const lines = textLines(el);
      // 短い言葉（8文字以下）は1行に収まっていないと、言葉の途中で折り返している
      const short = el.textContent.trim().length <= 8;
      const limit = el.matches('.tag, .state-pill, .no-badge') || short ? 1 : 2;
      if (el.textContent.trim() && lines > limit) issues.push([`${lines}行に折り返し`, label(el), '']);
    }
  }
  return issues;
}

// 主な画面を順に開いて調べる（記録ありの状態を作ってから）
export async function runAll() {
  const key = Object.keys(localStorage).find((k) => k.endsWith(':box')) || `m36shells:${location.pathname}:box`;
  const now = new Date().toISOString();
  const cells = {};
  [1, 2, 5, 9, 13, 14, 21, 33].forEach((n) => { cells[n] = { s: 'filled', t: now }; });
  [3, 6].forEach((n) => { cells[n] = { s: 'empty', t: now }; });
  cells[10] = { s: 'check', t: now };
  localStorage.setItem(key, JSON.stringify({ v: 2, savedAt: now, source: 'manual', cells }));
  const routes = ['#/', '#/list', '#/list?box=empty', '#/shell/1', '#/shell/19', '#/shell/35', '#/compare/12', '#/compare/12/28', '#/identify', '#/box', '#/box?edit=1&sel=10', '#/about', '#/scan', '#/scan?dev=1'];
  const all = {};
  for (const r of routes) {
    location.hash = r;
    await new Promise((x) => setTimeout(x, 700));
    const iss = audit();
    if (iss.length) all[r] = iss.map((i) => i.join(' ')).slice(0, 8);
    const d = document.querySelector('dialog.sheet');
    if (d) [...d.querySelectorAll('button')].find((b) => b.textContent.includes('保存せずに'))?.click();
  }
  sessionStorage.removeItem('m36shells:dev');
  return { width: document.documentElement.clientWidth, issues: all };
}
