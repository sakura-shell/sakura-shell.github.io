// チラシの線画に合わせた、濃紺の線＋淡い色のアイコン
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

// チラシの貝の描き方に合わせた絵（48x48）：濃紺の線を使わず、淡いピンク・水色・黄色の塗りに白い筋
const M = {
  fan: `<path d="M24 45L5 20C8 9 15.5 3.5 24 3.5S40 9 43 20z" fill="#F4B3C8"/><path d="M24 43V6M24 43L16.5 6.8M24 43l7.5-36.2M24 43L10.5 11.5M24 43l13.5-31.5M24 43L6.5 18M24 43l17.5-25" stroke="#FDE6EE" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M18 41h12l-2 5h-8z" fill="#EE9DB7"/>`,
  cone: `<path d="M24 3L17.5 14.5 19 15.5 15 25 16.6 26 12.5 35.5C11 42 16 46.5 23 45.5 30.5 44.5 36.5 40.5 35.5 34L31.5 26 33 25 29 15.5 30.5 14.5z" fill="#A3D8EB"/><path d="M18.6 15.2Q24.5 18.5 29.8 15.2M16 25.6Q24.5 29.5 32.4 25.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M24.5 35.5C28.5 34 33 35.5 33.5 38.5 32 41.5 27.5 43 24 42z" fill="#E3F4FA"/><g fill="#2E3A6E" opacity=".5"><circle cx="22.5" cy="10.5" r=".9"/><circle cx="25.5" cy="20.5" r=".9"/><circle cx="20.5" cy="21.5" r=".9"/><circle cx="18" cy="32" r="1"/><circle cx="22" cy="38" r="1"/></g>`,
  pair: `<path d="M24 25C22 14 15 9.5 9 11 3.5 12.5 2 20 4.5 26 7.5 33 17 35 24 25z" fill="#F7C3D4"/><path d="M24 25C26 14 33 9.5 39 11 44.5 12.5 46 20 43.5 26 40.5 33 31 35 24 25z" fill="#F7C3D4"/><path d="M23 24L5 19M23 24.5L7.5 29.5M23 23.5L11 11.5M25 24l18-5M25 24.5l15.5 5M25 23.5l12-12" stroke="#FDE6EE" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  cap: `<path d="M24 5.5C27 4 30 6.5 32.5 6.5S38 7.5 39.5 10.5 43 15 43 18.5 44.5 25 43 28 42.5 34 40 36.5 35 41 32 41.5 27 44 24 43.5 18 43.5 15 41.5 9.5 39 7.5 36 4.5 31 4.5 27.5 3.5 21 5 18 6.5 12.5 9 10 13 7 16 6.5 21 6.5 24 5.5z" fill="#F8D985"/><path d="M22 21L23.5 6M22 21L35 8.5M22 21L42.5 18.5M22 21L41.5 32M22 21L31 41.5M22 21L19 43M22 21L9 38M22 21L5 27M22 21L7 12" stroke="#EEC456" stroke-width="1.6" stroke-linecap="round" fill="none"/><circle cx="22" cy="21" r="3" fill="#FCEBB8"/>`,
  dollar: `<g fill="none" stroke="#9FD6EA" stroke-width="1.8"><circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="15" rx="2.6" ry="6"/><ellipse cx="24" cy="15" rx="2.6" ry="6" transform="rotate(72 24 24)"/><ellipse cx="24" cy="15" rx="2.6" ry="6" transform="rotate(144 24 24)"/><ellipse cx="24" cy="15" rx="2.6" ry="6" transform="rotate(216 24 24)"/><ellipse cx="24" cy="15" rx="2.6" ry="6" transform="rotate(288 24 24)"/></g>`,
  dot: `<ellipse cx="24" cy="24" rx="12.5" ry="18.5" fill="#F9D7C2"/><path d="M24 9.5C22.5 18 22.5 30 24 38.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/><g fill="#2E3A6E" opacity=".5"><circle cx="17" cy="16" r="1.1"/><circle cx="29.5" cy="14" r="1"/><circle cx="16" cy="27" r="1"/><circle cx="31" cy="25" r="1.1"/><circle cx="19.5" cy="35" r=".9"/><circle cx="28.5" cy="34" r="1"/></g>`,
};
const motif = (name, x = 0, y = 0, scale = 1, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot} ${24 * scale} ${24 * scale}) scale(${scale})">${M[name]}</g>`;

const ui = {
  back: `<svg viewBox="0 0 24 24" ${S}><path d="M15 5l-7 7 7 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${S}><path d="M9 5l7 7-7 7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${S}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>`,
  home: `<svg viewBox="0 0 24 24" ${S}><path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-4.5h4V19"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" ${S}><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.4"/></svg>`,
  image: `<svg viewBox="0 0 24 24" ${S}><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 2.5-2 4.5 3.5"/></svg>`,
  shell: `<svg viewBox="0 0 48 48">${M.fan}</svg>`,
  box: `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="5.5" width="18" height="13" rx="1.8"/><path d="M3 9.8h18M3 14.2h18M7.5 5.5v13M12 5.5v13M16.5 5.5v13"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" ${S}><path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19l1-4.2L15.8 5l3.2 3.2L9.2 18z"/><path d="M13.5 7.3l3.2 3.2"/></svg>`,
  zoomIn: `<svg viewBox="0 0 24 24" ${S}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 7.8v5.4M7.8 10.5h5.4"/></svg>`,
  zoomOut: `<svg viewBox="0 0 24 24" ${S}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M7.8 10.5h5.4"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" ${S}><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V9h-4.5"/></svg>`,
  magic: `<svg viewBox="0 0 24 24" ${S}><path d="M5 19L15.5 8.5M14 5l.8 1.7L16.5 7.5l-1.7.8L14 10l-.8-1.7-1.7-.8 1.7-.8zM19 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5zM7 4.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z"/></svg>`,
  compare: `<svg viewBox="0 0 24 24" ${S}><rect x="3.5" y="5" width="7" height="14" rx="2"/><rect x="13.5" y="5" width="7" height="14" rx="2"/></svg>`,
  cube: `<svg viewBox="0 0 24 24" ${S}><path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/></svg>`,
  ar: `<svg viewBox="0 0 24 24" ${S}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M12 7.5l4 2.2v4.6l-4 2.2-4-2.2V9.7z"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" ${S}><path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6-6 6-2.4 0-3.8-1-5-3l-2-3.5a1.4 1.4 0 0 1 2.3-1.6L8 13.5"/></svg>`,
  flip: `<svg viewBox="0 0 24 24" ${S}><path d="M12 3v18M8 7L3.5 17H8zM16 7l4.5 10H16z"/></svg>`,
  map: `<svg viewBox="0 0 24 24" ${S}><path d="M12 20.5s-6-5.6-6-10.2a6 6 0 0 1 12 0c0 4.6-6 10.2-6 10.2z"/><circle cx="12" cy="10.3" r="2.2"/></svg>`,
  guide: `<svg viewBox="0 0 24 24" ${S}><path d="M5 4.5h10.5L19 8v11.5H5z"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" ${S}><path d="M12 5v14M5 12h14"/></svg>`,
  save: `<svg viewBox="0 0 24 24" ${S}><path d="M5 4.5h11l3 3V19.5H5z"/><path d="M8 4.5v5h7v-5M8 19.5v-5.5h8v5.5"/></svg>`,
  retake: `<svg viewBox="0 0 24 24" ${S}><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><path d="M14.8 12.2a3 3 0 1 1-1-1.9M14.8 9.6v2.6h-2.6"/></svg>`,
  hand2: `<svg viewBox="0 0 24 24" ${S}><path d="M4 19l4-1 10-10-3-3L5 15z"/><path d="M13 7l3 3"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8L8 13.5l-4.3-4 5.8-.7z"/></svg>`,
  question: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9.2a3 3 0 1 1 4.3 2.7c-.8.4-1.3 1.1-1.3 2v.6"/><circle cx="12" cy="18" r=".7" fill="currentColor"/></svg>`,
};

// 形の分類（一覧表の凡例に合わせた色：二枚貝=ピンク、巻貝=水色、笠貝=黄色）
const shapes = {
  bivalve: `<svg viewBox="0 0 48 48">${M.pair}</svg>`,
  gastropod: `<svg viewBox="0 0 48 48">${motif('cone', 0, 0, 1, 35)}</svg>`,
  limpet: `<svg viewBox="0 0 48 48">${M.cap}</svg>`,
  none: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="#E4E7F2"/></svg>`,
};

// ホームの3つの操作の絵（64x64）
const art = {
  identify: `<svg viewBox="0 0 64 64" fill="none" stroke="#2E3A6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="none"/>
    <g stroke="none">${motif('fan', 9, 10, 0.82)}</g>
    <circle cx="46" cy="44" r="8.5" fill="#FFF7DA"/>
    <path d="M43.2 41.4a3.6 3.6 0 1 1 3.9 5.6c-.7.3-1.1.9-1.1 1.6v.4" stroke-width="2.2"/>
    <circle cx="46" cy="51.6" r=".9" fill="#2E3A6E" stroke="none"/>
  </svg>`,
  search: `<svg viewBox="0 0 64 64" fill="none" stroke="#2E3A6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="none"/>
    <g stroke="none">${motif('fan', 5, 9, 0.62, -14)}${motif('cone', 31, 6, 0.46, 32)}</g>
    <circle cx="42" cy="43" r="8.5" fill="#fff" stroke-width="2.6"/>
    <path d="M48.3 49.3L55 56" stroke-width="3.2"/>
    <path d="M38.5 41.5a4 4 0 0 1 3.5-3" stroke-width="1.6"/>
  </svg>`,
  box: `<svg viewBox="0 0 64 64" fill="none" stroke="#2E3A6E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="none"/>
    <rect x="11" y="18" width="42" height="29" rx="3" fill="#7FD2EC"/>
    <path d="M11 27.7h42M11 37.3h42M19.4 18v29M27.8 18v29M36.2 18v29M44.6 18v29"/>
    <circle cx="49" cy="22.8" r="2.2" fill="#F6C3D5" stroke-width="1.4"/>
    <circle cx="40.4" cy="32.5" r="2.2" fill="#FBE39A" stroke-width="1.4"/>
    <circle cx="15.2" cy="42" r="2.2" fill="#fff" stroke-width="1.4"/>
    <path d="M44 10.5h6.5v6.5" stroke-width="2.4"/>
    <path d="M20 53.5h-6.5V47" stroke-width="2.4"/>
  </svg>`,
};

export function icon(name) {
  return ui[name] || '';
}

export function shapeIcon(shape) {
  return shapes[shape || 'none'] || shapes.none;
}

export function artIcon(name) {
  return art[name] || '';
}
