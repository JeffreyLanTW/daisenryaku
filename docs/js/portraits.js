'use strict';
/* portraits.js — 劇情對話用人物半身像（純 inline SVG，無外部資源）。
 *   PORTRAITS            : id → 規格資料（膚色、臉型、髮型、年齡、帽、制服、階級、表情）
 *   portraitSVG(id,size) : 回傳 '<svg ...>' 字串（viewBox 0 0 120 120）；未知 id 回傳 ''
 * 所有角色共用同一個繪製器；每次呼叫使用獨立的 gradient / clip id，可在同頁並存。 */

const PORTRAITS = {
  chou: { name: '周上將', bg: '#3f5046', gender: 'm', skin: '#d6a57a', age: 3, face: { w: 20, j: 15.5, c: 85 },
    hair: { style: 'short', color: '#8e9195' }, brow: { color: '#74777a', th: 2.0, tilt: 1.5 },
    eye: { open: 0.82, iris: '#3a2718', bags: 0.3 }, mouth: 'stern',
    head: { type: 'peaked', crown: '#2e4231', band: '#1d2a20', badge: 'sun', braid: true },
    uniform: { type: 'dress', color: '#2e4231', inner: '#d9d3b4', tie: '#1c241c', stars: 3, ribbons: true } },
  lin: { name: '林上校', bg: '#5c6148', gender: 'f', skin: '#e2b48c', age: 1, face: { w: 18.5, j: 13, c: 84 },
    hair: { style: 'tied', color: '#17130f' }, brow: { color: '#1d1713', th: 1.3, tilt: 0.6 },
    eye: { open: 1, iris: '#33200f', bags: 0 }, mouth: 'calm',
    head: { type: 'field', crown: '#5b6343', rank: 3 },
    uniform: { type: 'field', color: '#5b6343', inner: '#3d4330', rank: 'plum' } },
  chen: { name: '陳士官長', bg: '#4f4a38', gender: 'm', skin: '#b9814f', age: 2, face: { w: 20.5, j: 16.5, c: 85.5 },
    hair: { style: 'short', color: '#15110e' }, brow: { color: '#17120e', th: 2.2, tilt: 0.3 },
    eye: { open: 0.85, iris: '#2b1a0c', bags: 0.2 }, mouth: 'grin', stubble: 0.3,
    head: { type: 'helmet', crown: '#5a5f3e' },
    uniform: { type: 'camo', color: '#5a5f3e', inner: '#3a3d2b', rank: 'chevron' } },
  hsu: { name: '許中尉', bg: '#3f5668', gender: 'f', skin: '#e7bd98', age: 0, face: { w: 18, j: 12.5, c: 83.5 },
    hair: { style: 'bob', color: '#1e1612' }, brow: { color: '#211813', th: 1.2, tilt: 0.2 },
    eye: { open: 1.08, iris: '#3b2412', bags: 0 }, mouth: 'smile',
    head: { type: 'headset' },
    uniform: { type: 'flight', color: '#5f6b50', inner: '#262a27', rank: 'bars' } },
  harris: { name: '哈里斯上將', bg: '#33465e', gender: 'm', skin: '#e2b196', age: 3, face: { w: 20, j: 16.5, c: 86 },
    hair: { style: 'short', color: '#e6e5e0' }, brow: { color: '#cfcdc6', th: 1.8, tilt: 0.5 },
    eye: { open: 0.9, iris: '#5b7f98', bags: 0.3 }, mouth: 'neutral', glasses: true,
    uniform: { type: 'white', color: '#e3e0d4', inner: '#f6f4ee', stars: 4, ribbons: true } },
  sato: { name: '佐藤一佐', bg: '#4b5160', gender: 'm', skin: '#dcae84', age: 2, face: { w: 19.5, j: 14.5, c: 85 },
    hair: { style: 'short', color: '#15120f', temple: '#9a9da1' }, brow: { color: '#1a1512', th: 1.8, tilt: 0.8 },
    eye: { open: 0.88, iris: '#2e1c0e', bags: 0.15 }, mouth: 'neutral',
    head: { type: 'peaked', crown: '#e9e7df', band: '#14161c', badge: 'anchor', braid: true },
    uniform: { type: 'dress', color: '#1b2233', inner: '#eeeeea', tie: '#0d0f14', stars: 0, ribbons: true } },
  wang: { name: '王記者', bg: '#5e5349', gender: 'm', skin: '#d2a172', age: 1, face: { w: 19.5, j: 15, c: 85 },
    hair: { style: 'messy', color: '#1c1714' }, brow: { color: '#1c1613', th: 1.9, tilt: -0.7 },
    eye: { open: 0.7, iris: '#2f1d0f', bags: 0.55 }, mouth: 'tired', stubble: 0.22,
    uniform: { type: 'vest', color: '#5b6772', inner: '#cfcbc0', vest: '#8a7a58' } },
  enemy: { name: '敵軍指揮官', bg: '#472b2a', gender: 'm', skin: '#c79a70', age: 3, face: { w: 20.5, j: 16.5, c: 85.5 },
    hair: { style: 'short', color: '#2a2725' }, brow: { color: '#1b1614', th: 2.2, tilt: 1.8 },
    eye: { open: 0.75, iris: '#22140a', bags: 0.3 }, mouth: 'stern', shadow: true,
    head: { type: 'peaked', crown: '#56633b', band: '#8c1f1f', badge: 'star', braid: false },
    uniform: { type: 'pla', color: '#56633b', inner: '#3d472b', stars: 2 } },
  narrator: { name: '旁白', emblem: true, bg: '#1f3b3f', color: '#74b5ae' }
};

let _portraitSeq = 0;

function _pMix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = s => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}
const _pDark = (c, t) => _pMix(c, '#000000', t);
const _pLight = (c, t) => _pMix(c, '#ffffff', t);
const _pMir = s => s + `<g transform="matrix(-1 0 0 1 120 0)">${s}</g>`;
const _P_GOLD = '#d2b25a';

function _pStar(x, y, r, fill) {
  let pts = '';
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (i / 5 - 0.5), q = i % 2 ? r * 0.42 : r;
    pts += (x + Math.cos(a) * q).toFixed(2) + ',' + (y + Math.sin(a) * q).toFixed(2) + ' ';
  }
  return `<polygon points="${pts}" fill="${fill}"/>`;
}

// 迷彩色塊（固定亂數種子，確保每次輸出一致）
function _pCamo(clip, cols, x0, y0, w, h, seed) {
  let s = seed, o = `<g clip-path="url(#${clip})">`;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const cx = (x0 + r() * w).toFixed(1), cy = (y0 + r() * h).toFixed(1);
    o += `<ellipse cx="${cx}" cy="${cy}" rx="${(3 + r() * 6).toFixed(1)}" ry="${(1.8 + r() * 3).toFixed(1)}" ` +
      `transform="rotate(${Math.round(r() * 180)} ${cx} ${cy})" fill="${cols[i % cols.length]}" opacity=".8"/>`;
  }
  return o + '</g>';
}

function _pEmblem(p, u) {
  const c = p.color, d = _pDark(c, 0.45);
  let o = `<linearGradient id="pw${u}" x1="60" y1="60" x2="96" y2="36" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${c}" stop-opacity=".05"/><stop offset="1" stop-color="${c}" stop-opacity=".55"/></linearGradient>`;
  o += `<path d="M60,60L60,18A42,42 0 0 1 96.4,39Z" fill="url(#pw${u})"/>`;
  [42, 30, 17].forEach((r, i) => { o += `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${c}" stroke-width="${i ? 0.7 : 1.4}" opacity="${i ? 0.45 : 0.85}"/>`; });
  for (let i = 0; i < 36; i++) {
    const a = i * Math.PI / 18, r1 = i % 9 === 0 ? 36 : (i % 3 === 0 ? 38 : 40);
    o += `<line x1="${(60 + Math.cos(a) * r1).toFixed(1)}" y1="${(60 + Math.sin(a) * r1).toFixed(1)}" x2="${(60 + Math.cos(a) * 42).toFixed(1)}" y2="${(60 + Math.sin(a) * 42).toFixed(1)}" stroke="${c}" stroke-width=".7" opacity=".7"/>`;
  }
  o += `<g transform="rotate(45 60 60)" opacity=".6"><path d="M60,38L63,57L82,60L63,63L60,82L57,63L38,60L57,57Z" fill="${d}" stroke="${c}" stroke-width=".6"/></g>`;
  o += `<path d="M60,24L65,55L96,60L65,65L60,96L55,65L24,60L55,55Z" fill="${d}" stroke="${c}" stroke-width=".9"/>`;
  o += `<path d="M60,24L60,60L55,55ZM96,60L60,60L65,55ZM60,96L60,60L65,65ZM24,60L60,60L55,65Z" fill="${c}" opacity=".85"/>`;
  o += `<line x1="60" y1="60" x2="96.4" y2="39" stroke="${_pLight(c, 0.4)}" stroke-width="1"/>`;
  o += `<circle cx="60" cy="60" r="2.6" fill="${_pLight(c, 0.5)}"/><circle cx="84" cy="50" r="1.6" fill="${_pLight(c, 0.6)}"/>`;
  return o;
}

function _pUniform(p, u, nw, sw) {
  const U = p.uniform, c = U.color, dk = _pDark(c, 0.35), lt = _pLight(c, 0.1), L = 60 - nw, R = 60 + nw;
  const nl = { dress: 114, field: 101, camo: 101, flight: 99, white: 104, vest: 104, pla: 98 }[U.type];
  const torso = `M${60 - sw},121C${60 - sw},104 ${60 - sw + 10},99 ${L - 6},93L${L - 1},89L60,${nl}L${R + 1},89L${R + 6},93C${60 + sw - 10},99 ${60 + sw},104 ${60 + sw},121Z`;
  const flap = n => _pMir(`<path d="M${L - 2},87L60,${n}L${60 - 8},${n + 6}L${L - 9},95Z" fill="${lt}" stroke="${dk}" stroke-width=".6" stroke-linejoin="round"/>`);
  const board = (fill, edge, n, starFill, gap) => {
    let s = `<g transform="rotate(-14 ${60 - sw + 20} 100)"><rect x="${60 - sw + 9}" y="96.6" width="22" height="6.6" rx="1" fill="${fill}" stroke="${edge}" stroke-width=".7"/>`;
    for (let i = 0; i < n; i++) s += _pStar(60 - sw + 20 + (i - (n - 1) / 2) * gap, 99.9, 1.9, starFill);
    return _pMir(s + '</g>');
  };
  let o = `<clipPath id="pt${u}"><path d="${torso}"/></clipPath>`;
  o += `<path d="M${L - 3},87Q60,99 ${R + 3},87L${R + 9},121L${L - 9},121Z" fill="${U.inner}"/>`;
  o += `<path d="M${L - 3},87Q60,99 ${R + 3},87" fill="none" stroke="${_pDark(U.inner, 0.3)}" stroke-width="1.2"/>`;
  if (U.type === 'dress') {
    o += _pMir(`<path d="M${L - 2},87.5L60,96.5L54.5,103.5L${L - 4},93Z" fill="${_pLight(U.inner, 0.25)}" stroke="${_pDark(U.inner, 0.3)}" stroke-width=".5"/>`);
    o += `<path d="M57.2,96L62.8,96L61.7,101.2L58.3,101.2Z" fill="${_pLight(U.tie, 0.12)}"/><path d="M58.3,101.2L61.7,101.2L63.8,121L56.2,121Z" fill="${U.tie}"/>`;
  }
  o += `<path d="${torso}" fill="url(#pu${u})"/>`;
  if (U.type === 'camo') o += _pCamo('pt' + u, ['#3b4a2c', '#7a6a45', '#23291c', '#8c8a62'], 6, 88, 108, 34, 7);
  o += _pMir(`<path d="M${60 - sw + 13},121Q${60 - sw + 12},108 ${60 - sw + 17},101" fill="none" stroke="${dk}" stroke-width=".8" opacity=".6"/>`);
  if (U.type === 'dress') {
    o += _pMir(`<path d="M${L - 1},89L${L - 11},98L${L - 6.5},101.5L${L - 10},105L58.5,121L60,${nl}Z" fill="${lt}" stroke="${dk}" stroke-width=".7" stroke-linejoin="round"/>`);
    if (U.stars) o += board(_pLight(c, 0.04), dk, U.stars, _P_GOLD, 5.6);
  } else if (U.type === 'field' || U.type === 'camo') {
    o += flap(nl);
    if (U.type === 'camo') o += `<rect x="54.5" y="108.5" width="11" height="9.5" rx="1" fill="#2a2f20"/>` +
      [0, 2.3, 4.6].map(d => `<path d="M56.5,${112 + d}L60,${110 + d}L63.5,${112 + d}" fill="none" stroke="${_P_GOLD}" stroke-width=".9"/>`).join('');
    else o += _pMir([0, 1, 2].map(i => `<circle cx="${L - 3.4 + i * 2.5}" cy="${93.2 + i * 2.6}" r="1" fill="${_P_GOLD}"/>`).join('')) +
      `<rect x="72" y="109" width="15" height="4.6" rx=".6" fill="${dk}" opacity=".7"/>`;
  } else if (U.type === 'flight') {
    o += `<path d="M${L - 1},89L60,${nl}L${R + 1},89" fill="none" stroke="${dk}" stroke-width="2.6" stroke-linejoin="round"/>`;
    o += `<line x1="60" y1="${nl + 1}" x2="60" y2="121" stroke="#b9b8ad" stroke-width="1.2" stroke-dasharray="1 .7"/><rect x="58.8" y="${nl + 1}" width="2.4" height="4" rx=".6" fill="#8d8c82"/>`;
    o += `<rect x="70" y="108" width="17" height="6.5" rx=".8" fill="#20252b"/><path d="M72,111.2h6m2,0h5" stroke="#c9c7b8" stroke-width=".9"/>`;
    o += `<rect x="33" y="108" width="17" height="6.5" rx=".8" fill="#20252b"/><path d="M35,112.6Q38,109.2 41.5,111.6Q45,109.2 48,112.6Q44.5,111.4 41.5,113.4Q38.5,111.4 35,112.6Z" fill="${_P_GOLD}"/>`;
    o += _pMir(`<g transform="rotate(-16 ${60 - sw + 19} 99)"><rect x="${60 - sw + 15}" y="97" width="2.2" height="5.4" fill="${_P_GOLD}"/><rect x="${60 - sw + 19}" y="97" width="2.2" height="5.4" fill="${_P_GOLD}"/></g>`);
  } else if (U.type === 'white') {
    o += flap(nl) + `<line x1="60" y1="${nl + 1}" x2="60" y2="121" stroke="${dk}" stroke-width=".6"/><circle cx="60" cy="113" r="1.2" fill="${_P_GOLD}"/>`;
    o += board('#141a26', _P_GOLD, U.stars, '#e8e8e8', 4.6);
  } else if (U.type === 'vest') {
    o += flap(nl) + `<line x1="60" y1="${nl + 1}" x2="60" y2="121" stroke="${dk}" stroke-width=".6"/>`;
    o += _pMir(`<path d="M${L - 7},93L${L + 1},121L${60 - sw + 7},121C${60 - sw + 7},108 ${60 - sw + 13},101 ${L - 13},95.5Z" fill="${U.vest}" stroke="${_pDark(U.vest, 0.4)}" stroke-width=".7"/>` +
      `<rect x="${L - 26}" y="112" width="17" height="10" rx="1" fill="${_pLight(U.vest, 0.08)}" stroke="${_pDark(U.vest, 0.4)}" stroke-width=".6"/>`);
    o += `<rect x="${R + 8}" y="102.5" width="19" height="6.6" rx=".8" fill="#1c2b4a"/><text x="${R + 17.5}" y="107.7" font-size="4.6" font-weight="700" font-family="Arial,Helvetica,sans-serif" text-anchor="middle" fill="#f2f2f2">PRESS</text>`;
    o += `<path d="M${L - 4},90Q${L - 12},104 ${L - 8},121" fill="none" stroke="#1a1a1a" stroke-width="2.2" opacity=".85"/>`;
  } else if (U.type === 'pla') {
    o += flap(nl) + _pMir(`<path d="M${L - 1.5},89L58.4,${nl + 0.6}L53.6,${nl + 4.4}L${L - 6.5},94.6Z" fill="#b3221f"/>` + _pStar(L - 0.5, 94.4, 1.9, _P_GOLD));
    o += `<circle cx="60" cy="107" r="1.5" fill="${_P_GOLD}"/><circle cx="60" cy="117" r="1.5" fill="${_P_GOLD}"/>`;
    o += board('#a98a3c', '#6d5722', U.stars, '#f0ead0', 6);
  }
  if (U.ribbons) {
    const rc = ['#a33a32', '#d8c36a', '#3d6a8c', '#e8e4d6', '#4f7a4a', '#b9702e'];
    for (let i = 0; i < 6; i++) o += `<rect x="${79 + (i % 3) * 4.6}" y="${108 + (i > 2 ? 2.7 : 0)}" width="4.3" height="2.4" fill="${rc[i]}"/>`;
  }
  return o;
}

function _pHair(p, W) {
  const H = p.hair, c = H.color, hi = _pLight(c, 0.22), l = 60 - W, r = 60 + W;
  let d;
  if (H.style === 'messy') {
    d = `M${l - 1},55C${l - 4.5},40 ${l - 2},28 45,22L47,16.5L51,20L55,14.5L59,19L64,14L67,19L72,16L73,21.5C${r + 2},28 ${r + 4.5},40 ${r + 1},55L${r - 1.5},45` +
      `C${r - 2},40 74,37 71,33L68,38.5L65,32L61,39L57,32.5L53,39.5L50,33.5C45,36 ${l + 2},40 ${l + 1.5},45Z`;
  } else if (H.style === 'bob') {
    d = `M${l - 1.5},60C${l - 5},32 50,18.5 60,18.5C72,18.5 ${r + 5},32 ${r + 1.5},60L${r - 1},46C${r - 3},39 72,36 66.5,30C62,37 50,41.5 ${l + 1.5},45Z`;
  } else if (H.style === 'tied') {
    d = `M${l - 0.5},51C${l - 3},31 48,20 60,20C72,20 ${r + 3},31 ${r + 0.5},51L${r - 1.2},44C${r - 3},37 70,33.5 60,33.5C50,33.5 ${l + 3},37 ${l + 1.2},44Z`;
  } else {
    d = `M${l - 0.8},57C${l - 3.5},36 47,19.5 60,19.5C73,19.5 ${r + 3.5},36 ${r + 0.8},57L${r - 1.5},47C${r - 2},39 71,33.5 62,33.5C52,33.5 ${l + 2},38 ${l + 1.5},47Z`;
  }
  let o = `<path d="${d}" fill="${c}"/>`;
  o += `<path d="M48,26Q55,21.5 63,22M53,29Q60,24.5 70,26.5" fill="none" stroke="${hi}" stroke-width=".9" stroke-linecap="round" opacity=".55"/>`;
  if (H.temple) o += _pMir(`<path d="M${l - 1},56C${l - 2.6},48 ${l - 1.6},41 ${l + 0.6},36.5L${l + 2.6},41L${l + 1.5},47Z" fill="${H.temple}"/>`);
  return o;
}

function _pHeadgear(p, u, W, J) {
  const G = p.head, l = 60 - W, r = 60 + W;
  if (!G) return '';
  let o = '';
  if (G.type === 'peaked') {
    const c = G.crown, visor = '#0e0f11';
    o += `<path d="M${l - 9.5},23C${l - 11},9 46,3 60,3C74,3 ${r + 11},9 ${r + 9.5},23L${r + 2},29L${l - 2},29Z" fill="${c}"/>`;
    o += `<path d="M${l - 7},14C${l - 2},7 50,5 60,5C70,5 ${r + 2},7 ${r + 7},14" fill="none" stroke="${_pLight(c, 0.25)}" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>`;
    o += `<path d="M${l - 9.5},23L${l - 2},29L${r + 2},29L${r + 9.5},23Q60,29.5 ${l - 9.5},23Z" fill="${_pDark(c, 0.22)}" opacity=".7"/>`;
    o += `<path d="M${l - 2},27Q60,30.5 ${r + 2},27L${r + 1.5},34.5Q60,38.5 ${l - 1.5},34.5Z" fill="${G.band}"/>`;
    o += `<path d="M${l - 1.5},34Q60,38 ${r + 1.5},34Q${r + 4},39 ${r - 3},41Q60,45.5 ${l + 3},41Q${l - 4},39 ${l - 1.5},34Z" fill="${visor}"/>`;
    o += `<path d="M${l + 4},37.6Q60,40.6 ${r - 4},37.6" fill="none" stroke="#fff" stroke-width=".8" opacity=".22"/>`;
    o += `<path d="M${l - 1},33.6Q60,37.6 ${r + 1},33.6" fill="none" stroke="${_P_GOLD}" stroke-width="1.3"/>`;
    if (G.braid) o += `<path d="M${l + 3},39.6Q60,43.6 ${r - 3},39.6" fill="none" stroke="${_P_GOLD}" stroke-width="2" stroke-dasharray="2.4 1.2" stroke-linecap="round"/>`;
    o += `<ellipse cx="60" cy="19.5" rx="5.6" ry="6.2" fill="none" stroke="${_P_GOLD}" stroke-width="1.5"/>`;
    if (G.badge === 'sun') o += `<circle cx="60" cy="19.5" r="3.6" fill="#1f3f8a"/><circle cx="60" cy="19.5" r="1.7" fill="#f4f4f0"/>`;
    else if (G.badge === 'star') o += `<circle cx="60" cy="19.5" r="4.2" fill="#7c1a18"/>` + _pStar(60, 19.7, 3.6, '#d8262a') + _pStar(60, 19.7, 1.5, _P_GOLD);
    else o += `<ellipse cx="60" cy="19.5" rx="3.8" ry="4.4" fill="#14161c"/><path d="M60,16.2V23M57.6,18H62.4M57,21.2Q60,24.4 63,21.2" fill="none" stroke="${_P_GOLD}" stroke-width=".9"/>`;
  } else if (G.type === 'field') {
    const c = G.crown, d = _pDark(c, 0.3);
    o += `<path d="M${l - 2},35L${l - 1.2},19Q${l - 0.5},13.5 ${l + 6},13.5L${r - 6},13.5Q${r + 0.5},13.5 ${r + 1.2},19L${r + 2},35Z" fill="${c}"/>`;
    o += `<path d="M${l - 1.4},22Q60,18 ${r + 1.4},22" fill="none" stroke="${d}" stroke-width=".6" opacity=".7"/>`;
    o += `<path d="M${l - 2},33.5Q60,37 ${r + 2},33.5Q${r + 3},39 ${r - 4},40.5Q60,44.5 ${l + 4},40.5Q${l - 3},39 ${l - 2},33.5Z" fill="${_pDark(c, 0.18)}"/>`;
    o += `<path d="M${l - 2},33.5Q60,37 ${r + 2},33.5" fill="none" stroke="${d}" stroke-width=".8"/>`;
    for (let i = 0; i < (G.rank || 0); i++) o += `<circle cx="${60 + (i - 1) * 3.4}" cy="27.5" r="1.25" fill="${_P_GOLD}"/>`;
  } else if (G.type === 'helmet') {
    const c = G.crown, d = _pDark(c, 0.4);
    const dome = `M${l - 4.5},51C${l - 8},22 45,8.5 60,8.5C75,8.5 ${r + 8},22 ${r + 4.5},51L${r + 0.5},51Q${r + 1},41 ${r - 2},38.5Q60,34 ${l + 2},38.5Q${l - 1},41 ${l - 0.5},51Z`;
    o += `<path d="M${l - 0.5},50L${60 - J + 2},77Q60,89.5 ${60 + J - 2},77L${r + 0.5},50" fill="none" stroke="#2b2f22" stroke-width="1.7"/>`;
    o += `<clipPath id="ph${u}"><path d="${dome}"/></clipPath><path d="${dome}" fill="${c}"/>`;
    o += _pCamo('ph' + u, ['#3b4a2c', '#7a6a45', '#23291c', '#8c8a62'], 30, 8, 60, 44, 11);
    o += `<path d="${dome}" fill="none" stroke="${d}" stroke-width=".9"/>`;
    o += `<path d="M44,17Q52,11.5 62,11.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".16" stroke-linecap="round"/>`;
    o += `<rect x="56" y="24.5" width="8" height="6.5" rx="1" fill="#1c1f18"/><rect x="57.6" y="26" width="4.8" height="2" fill="#3a3f33"/>`;
  } else if (G.type === 'headset') {
    o += `<path d="M${l - 4},50C${l - 7},20 49,11.5 60,11.5C71,11.5 ${r + 7},20 ${r + 4},50" fill="none" stroke="#2a2d31" stroke-width="3.4"/>`;
    o += `<path d="M${l - 3},30C${l},18 51,13 60,13" fill="none" stroke="#6b7078" stroke-width=".8" opacity=".8"/>`;
    o += _pMir(`<rect x="${l - 7.5}" y="46.5" width="8.5" height="15.5" rx="3.6" fill="#24272b"/><rect x="${l - 6.3}" y="49" width="2.4" height="10.5" rx="1.2" fill="#5a5f66"/>`);
    o += `<path d="M${l - 4},61Q${l - 3},75 52,77.5" fill="none" stroke="#24272b" stroke-width="1.1"/><ellipse cx="53" cy="77.6" rx="2.6" ry="1.6" fill="#1b1d20"/>`;
  }
  return o;
}

function portraitSVG(id, size = 96) {
  const p = PORTRAITS[id];
  if (!p) return '';
  const u = ++_portraitSeq, bg = p.bg;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${p.name}">`;
  o += `<defs><clipPath id="pc${u}"><rect width="120" height="120" rx="10"/></clipPath>` +
    `<radialGradient id="pb${u}" cx=".5" cy=".36" r=".8"><stop offset="0" stop-color="${_pLight(bg, 0.3)}"/><stop offset=".55" stop-color="${bg}"/><stop offset="1" stop-color="${_pDark(bg, 0.55)}"/></radialGradient></defs>`;
  o += `<g clip-path="url(#pc${u})"><rect width="120" height="120" fill="url(#pb${u})"/>`;
  if (p.emblem) return o + _pEmblem(p, u) + `</g><rect x=".5" y=".5" width="119" height="119" rx="9.5" fill="none" stroke="#fff" stroke-opacity=".14"/></svg>`;

  const m = p.gender === 'm', F = p.face, W = F.w, J = F.j, C = F.c, ch = m ? 8.5 : 6.2;
  const sk = p.skin, sd = _pDark(_pMix(sk, '#7a3324', 0.25), 0.4), E = p.eye, B = p.brow, age = p.age;
  const nw = m ? 11 : 8.6, sw = m ? 52 : 45, l = 60 - W, r = 60 + W;
  const face = `M60,24C${60 + W * 0.78},24 ${r},36 ${r},50C${r},60 ${60 + J + 1.5},67 ${60 + J},73C${60 + J - 2.5},80 ${60 + ch},${C} 60,${C}` +
    `C${60 - ch},${C} ${60 - J + 2.5},80 ${60 - J},73C${60 - J - 1.5},67 ${l},60 ${l},50C${l},36 ${60 - W * 0.78},24 60,24Z`;
  o += `<defs><radialGradient id="ps${u}" cx=".42" cy=".42" r=".68"><stop offset="0" stop-color="${_pLight(sk, 0.16)}"/><stop offset=".6" stop-color="${sk}"/><stop offset="1" stop-color="${_pMix(sk, sd, 0.4)}"/></radialGradient>` +
    `<linearGradient id="pu${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${_pLight(p.uniform.color, 0.1)}"/><stop offset="1" stop-color="${_pDark(p.uniform.color, 0.3)}"/></linearGradient>` +
    `<linearGradient id="pv${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="${p.shadow ? 0.86 : 0.42}"/><stop offset="${p.shadow ? 0.6 : 0.5}" stop-color="#000" stop-opacity="${p.shadow ? 0.6 : 0.12}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="pf${u}"><path d="${face}"/></clipPath></defs>`;

  // 後方頭髮
  if (p.hair.style === 'tied') o += `<ellipse cx="${r - 4}" cy="80" rx="6.5" ry="11" fill="${p.hair.color}" transform="rotate(-12 ${r - 4} 80)"/>`;
  if (p.hair.style === 'bob') o += `<path d="M${l - 2.5},66C${l - 7},32 48,17 60,17C72,17 ${r + 7},32 ${r + 2.5},66Q${r},72 ${r - 4},70L${l + 4},70Q${l},72 ${l - 2.5},66Z" fill="${_pDark(p.hair.color, 0.25)}"/>`;
  // 頸部、制服
  o += `<path d="M${60 - nw},68L${60 - nw - 0.6},95Q60,105 ${60 + nw + 0.6},95L${60 + nw},68Z" fill="${_pMix(sk, sd, 0.22)}"/>`;
  o += `<path d="M${60 - nw},68L${60 + nw},68L${60 + nw},83Q60,93.5 ${60 - nw},83Z" fill="${sd}" opacity=".42"/>`;
  o += _pUniform(p, u, nw, sw);
  // 耳朵、臉
  o += _pMir(`<ellipse cx="${l - 0.4}" cy="57" rx="3.5" ry="6.3" fill="${_pMix(sk, sd, 0.2)}"/><path d="M${l - 1.6},53.5Q${l - 3},57 ${l - 0.8},60.5" fill="none" stroke="${sd}" stroke-width=".7" opacity=".5"/>`);
  o += `<path d="${face}" fill="url(#ps${u})"/><g clip-path="url(#pf${u})">`;
  o += `<path d="M${r + 2},28L${r + 2},90L62,90C${60 + J - 1},82 ${r - 5},62 ${r - 4.5},28Z" fill="${sd}" opacity=".24"/>`;
  o += _pMir(`<ellipse cx="${60 - W * 0.58}" cy="63.5" rx="5" ry="3.4" fill="#c2503f" opacity="${m ? 0.09 : 0.15}"/>`);
  if (age >= 2) o += _pMir(`<path d="M${l + 2},62Q${l + 5},70 ${60 - J + 4},75" fill="none" stroke="${sd}" stroke-width="2.4" opacity="${0.06 * age}" stroke-linecap="round"/>`);
  if (p.stubble) o += `<path d="M${l},61C${l + 3},68 51,65.5 53.5,69.5Q60,66.8 66.5,69.5C69,65.5 ${r - 3},68 ${r},61L${r},92L${l},92Z" fill="#221d19" opacity="${p.stubble}"/>`;
  if (p.head) o += `<rect x="30" y="34" width="60" height="${p.shadow ? 36 : 17}" fill="url(#pv${u})"/>`;
  if (p.shadow) o += `<rect x="60" y="20" width="40" height="70" fill="#000" opacity=".3"/>`;
  o += '</g>';
  // 皺紋
  if (age >= 2) o += `<path d="M50,40.5Q60,39 70,40.5M52,43.6Q60,42.4 68,43.6" fill="none" stroke="${sd}" stroke-width=".55" opacity="${0.13 * age}"/>`;
  if (B.tilt > 1) o += `<path d="M58.6,46.2L58.9,49.4M61.4,46.2L61.1,49.4" fill="none" stroke="${sd}" stroke-width=".6" opacity=".5"/>`;
  // 眼睛、眉毛
  const eye = s => {
    const x = 60 + s * 8.6, y = 54, h = 2.75 * E.open, xi = x - s * 4.1, xo = x + s * 4.3;
    const top = `M${xi},${y + 0.5}Q${x - s * 0.5},${y - h * 1.35} ${xo},${y - 0.4}`, shape = `${top}Q${x},${y + h * 0.95} ${xi},${y + 0.5}Z`, cid = `pe${u}${s > 0 ? 'r' : 'l'}`;
    let e = `<ellipse cx="${x}" cy="${y - 1.6}" rx="6.2" ry="4.2" fill="${sd}" opacity=".13"/>`;
    e += `<clipPath id="${cid}"><path d="${shape}"/></clipPath><path d="${shape}" fill="#ece5da"/>`;
    e += `<g clip-path="url(#${cid})"><circle cx="${x}" cy="${y - 0.25}" r="2.4" fill="${E.iris}"/><circle cx="${x}" cy="${y - 0.25}" r="1.05" fill="#0b0705"/><rect x="${x - 5}" y="${y - 4.2}" width="10" height="2.9" fill="#000" opacity=".25"/></g>`;
    e += `<circle cx="${x - 0.9}" cy="${y - 0.8}" r=".6" fill="#fff" opacity=".92"/>`;
    e += `<path d="${top}${m ? '' : `l${s * 1.3},-.9`}" fill="none" stroke="#1d130f" stroke-width="${m ? 0.95 : 1.25}" stroke-linecap="round"/>`;
    e += `<path d="M${xi + s * 0.6},${y - 1.3}Q${x},${y - h * 1.35 - 1.4} ${xo + s * 0.3},${y - 1.8}" fill="none" stroke="${sd}" stroke-width=".5" opacity=".5"/>`;
    e += `<path d="M${xi + s},${y + 1.1}Q${x},${y + h * 0.95 + 0.5} ${xo - s * 0.4},${y + 0.5}" fill="none" stroke="${sd}" stroke-width=".45" opacity=".45"/>`;
    if (E.bags) e += `<path d="M${x - 3.8},${y + 3.3}Q${x},${y + 5.1} ${x + 3.8},${y + 3.1}" fill="none" stroke="${sd}" stroke-width=".9" opacity="${E.bags}" stroke-linecap="round"/>`;
    if (age >= 2) e += `<path d="M${xo + s * 1.2},${y - 0.6}l${s * 2},-1M${xo + s * 1.3},${y + 0.6}l${s * 2},.6" fill="none" stroke="${sd}" stroke-width=".45" opacity="${0.14 * age}"/>`;
    const by = m ? 47.6 : 47.2, bi = 60 + s * 3.6, bo = 60 + s * 14.6, bm = 60 + s * 9.6, th = B.th;
    e += `<path d="M${bi},${by + B.tilt - th * 0.5}Q${bm},${by - 2.6 - th * 0.15} ${bo},${by + 0.7}Q${bm},${by - 2.4 + th * 0.85} ${bi},${by + B.tilt + th * 0.5}Z" fill="${B.color}"/>`;
    return e;
  };
  o += eye(-1) + eye(1);
  // 鼻
  const n = m ? 4.5 : 3.7;
  o += `<path d="M62,51.5C62.6,58 64.2,62 ${60 + n * 0.95},65" fill="none" stroke="${sd}" stroke-width="1.3" opacity=".3" stroke-linecap="round"/>`;
  o += `<path d="M59.5,51.5L59.3,63" stroke="${_pLight(sk, 0.4)}" stroke-width="1.3" opacity=".3" stroke-linecap="round"/>`;
  o += `<ellipse cx="59.6" cy="64.6" rx="${n * 0.62}" ry="2.1" fill="${_pLight(sk, 0.3)}" opacity=".3"/>`;
  o += _pMir(`<path d="M${60 - n + 0.4},64.4Q${60 - n - 0.7},67.5 ${60 - n + 1.9},67.7" fill="none" stroke="${sd}" stroke-width=".7" opacity=".6" stroke-linecap="round"/><ellipse cx="${60 - n * 0.48}" cy="67.3" rx="1.15" ry=".6" fill="${_pDark(sd, 0.3)}" opacity=".75"/>`);
  o += `<path d="M${60 - n * 0.5},68.6Q60,70 ${60 + n * 0.5},68.6" fill="none" stroke="${sd}" stroke-width=".7" opacity=".35"/>`;
  if (age) o += _pMir(`<path d="M${60 - n - 1},66.5Q${60 - n - 4.2},70.5 ${60 - n - 3.4},75.5" fill="none" stroke="${sd}" stroke-width=".65" opacity="${0.16 * age}" stroke-linecap="round"/>`);
  // 嘴
  const M = { stern: [0.9, 0.9, 0.65], neutral: [0.2, 0.2, 0.85], calm: [-0.5, -0.5, 1], smile: [-1, -1, 1.05], grin: [-0.3, -1.9, 0.85], tired: [0.5, 0.3, 0.85] }[p.mouth];
  const my = 73.6, mw = (m ? 6.6 : 5.5) + (p.mouth === 'grin' ? 0.8 : 0), lip = M[2], lc = _pMix(sk, '#8a3836', m ? 0.36 : 0.56);
  o += `<path d="M${60 - mw},${my + M[0]}Q57.4,${my - 2.3 * lip} 60,${my - 1.3 * lip}Q62.6,${my - 2.3 * lip} ${60 + mw},${my + M[1]}Q60,${my + 1} ${60 - mw},${my + M[0]}Z" fill="${_pDark(lc, 0.12)}"/>`;
  o += `<path d="M${60 - mw + 1},${my + 0.5 + M[0] * 0.6}Q60,${my + 4.2 * lip} ${60 + mw - 1},${my + 0.5 + M[1] * 0.6}Q60,${my + 0.9} ${60 - mw + 1},${my + 0.5 + M[0] * 0.6}Z" fill="${_pLight(lc, 0.08)}"/>`;
  o += `<path d="M${60 - mw},${my + M[0]}Q${60 - mw / 2},${my + 0.75} 60,${my + 0.35}Q${60 + mw / 2},${my + 0.75} ${60 + mw},${my + M[1]}" fill="none" stroke="${_pDark(lc, 0.55)}" stroke-width=".8" stroke-linecap="round"/>`;
  o += `<path d="M56,${my + 5}Q60,${my + 6.3} 64,${my + 5}" fill="none" stroke="${sd}" stroke-width=".9" opacity=".28" stroke-linecap="round"/>`;
  if (p.mouth === 'grin') o += `<path d="M${60 + mw + 0.6},${my - 2.8}q1.6,1.4 .4,3.4" fill="none" stroke="${sd}" stroke-width=".6" opacity=".5"/>`;
  // 頭髮、眼鏡、帽
  o += _pHair(p, W);
  if (p.glasses) {
    o += _pMir(`<rect x="45.4" y="49.6" width="12" height="8.6" rx="2.8" fill="#dfeaf2" fill-opacity=".12" stroke="#2d3036" stroke-width=".95"/><path d="M45.4,52.6L${l - 1},53.4" stroke="#2d3036" stroke-width=".9"/><path d="M47.6,56L51.4,51" stroke="#fff" stroke-width=".8" opacity=".3"/>`);
    o += `<path d="M57.4,53Q60,51.4 62.6,53" fill="none" stroke="#2d3036" stroke-width=".95"/>`;
  }
  o += _pHeadgear(p, u, W, J);
  if (p.shadow) o += _pMir(`<circle cx="${60 - 9.5}" cy="53.2" r=".55" fill="#fff" opacity=".8"/>`);
  o += `</g><rect x=".5" y=".5" width="119" height="119" rx="9.5" fill="none" stroke="#fff" stroke-opacity=".14"/></svg>`;
  return o;
}
