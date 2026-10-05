// チラシの線画に合わせた、濃紺の線＋淡い色のアイコン
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ui = {
  back: `<svg viewBox="0 0 24 24" ${S}><path d="M15 5l-7 7 7 7"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${S}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${S}><path d="M9 5l7 7-7 7"/></svg>`,
  search: `<svg viewBox="0 0 24 24" ${S}><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>`,
  home: `<svg viewBox="0 0 24 24" ${S}><path d="M4 11l8-6.5 8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-4.5h4V19"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" ${S}><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z"/><circle cx="12" cy="13.2" r="3.4"/></svg>`,
  image: `<svg viewBox="0 0 24 24" ${S}><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 2.5-2 4.5 3.5"/></svg>`,
  shell: `<svg viewBox="0 0 24 24" ${S}><path d="M12 4.5c-4.6 0-8 3.6-8 8 0 1.6.6 2.9 1.6 3.8h12.8c1-.9 1.6-2.2 1.6-3.8 0-4.4-3.4-8-8-8z"/><path d="M12 4.5v11.8M8.3 5.6L10 16.3M15.7 5.6L14 16.3M5.4 8.6l2.6 7.7M18.6 8.6L16 16.3"/><path d="M9.5 16.3l-.6 2.7h6.2l-.6-2.7"/></svg>`,
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
  bivalve: `<svg viewBox="0 0 24 24" fill="#F6C3D5" stroke="#262C74" stroke-width="1.2" stroke-linejoin="round"><path d="M12 12C9 5 3.5 5 3.5 9.5c0 3.8 4.3 5.3 8.5 2.5z"/><path d="M12 12c3-7 8.5-7 8.5-2.5 0 3.8-4.3 5.3-8.5 2.5z"/></svg>`,
  gastropod: `<svg viewBox="0 0 24 24" fill="#A9DDF0" stroke="#262C74" stroke-width="1.2" stroke-linejoin="round"><path d="M4 16.5c2.5-6 8-10 16-12-1 5-4 12-10 13.5-3 .7-5.2-.2-6-1.5z"/><path d="M8 16.8c1.6-1.2 2.4-3 2.2-4.8M12 15.5c1.4-1.6 2-3.6 1.8-5.6M15.5 12.5c1-1.6 1.4-3.4 1.3-5" fill="none"/></svg>`,
  limpet: `<svg viewBox="0 0 24 24" fill="#FBE39A" stroke="#262C74" stroke-width="1.2" stroke-linejoin="round"><path d="M3.5 16.5C5 10 8.2 6.5 12 6.5s7 3.5 8.5 10z"/><path d="M12 6.5v10M8.5 8.8L7 16.5M15.5 8.8l1.5 7.7" fill="none"/></svg>`,
  none: `<svg viewBox="0 0 24 24" fill="#E4E7F2" stroke="#262C74" stroke-width="1.2"><circle cx="12" cy="12" r="6.5"/></svg>`,
};

// ホームの3つの操作の絵（64x64）
const art = {
  identify: `<svg viewBox="0 0 64 64" fill="none" stroke="#262C74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="none"/>
    <path d="M32 15c-9.5 0-16 7.3-16 16 0 3.2 1.1 5.8 3.2 7.6h25.6c2.1-1.8 3.2-4.4 3.2-7.6 0-8.7-6.5-16-16-16z" fill="#F6C3D5"/>
    <path d="M32 15v23.6M24.6 17.2L28 38.6M39.4 17.2L36 38.6M18.8 23.2l5.2 15.4M45.2 23.2L40 38.6"/>
    <path d="M27 38.6l-1.2 5.4h12.4L37 38.6" fill="#F6C3D5"/>
    <circle cx="46" cy="44" r="8.5" fill="#FFF7DA"/>
    <path d="M43.2 41.4a3.6 3.6 0 1 1 3.9 5.6c-.7.3-1.1.9-1.1 1.6v.4" stroke-width="2.2"/>
    <circle cx="46" cy="51.6" r=".9" fill="#262C74" stroke="none"/>
  </svg>`,
  search: `<svg viewBox="0 0 64 64" fill="none" stroke="#262C74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="29" fill="#fff" stroke="none"/>
    <path d="M9 30c0-6.5 4.8-11 10.5-11S30 23.5 30 30c0 1.8-.7 3.2-1.9 4.1H10.9C9.7 33.2 9 31.8 9 30z" fill="#F6C3D5"/>
    <path d="M19.5 19v15M14.5 20.5l2 13.5M24.5 20.5l-2 13.5"/>
    <path d="M33 30c1.6-7.5 6.5-12 13.5-13.5-.8 6.5-4.5 13-11 14.2-1.2.2-2.2 0-2.5-.7z" fill="#A9DDF0"/>
    <path d="M37.5 29.5c1.5-1.8 2.3-4 2.2-6.2M41.5 27c1.2-2 1.7-4.2 1.4-6.4"/>
    <path d="M14 47.5C15.5 41.5 18.5 38 22 38s6.5 3.5 8 9.5z" fill="#FBE39A"/>
    <path d="M22 38v9.5M18.5 40l-1.3 7.5M25.5 40l1.3 7.5"/>
    <circle cx="42" cy="43" r="8.5" fill="#fff" stroke-width="2.6"/>
    <path d="M48.3 49.3L55 56" stroke-width="3.2"/>
    <path d="M38.5 41.5a4 4 0 0 1 3.5-3" stroke-width="1.6"/>
  </svg>`,
  box: `<svg viewBox="0 0 64 64" fill="none" stroke="#262C74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
