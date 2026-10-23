'use strict';
// ===== 部隊圖示：依真實型號的造型、各國迷彩與國籍標誌繪製（車頭／機首朝右） =====

// ----- 各國外觀：地面迷彩、海軍艦色、空軍機色、軍服 -----
// camo：[底色, 斑點色...]；shape：blob 斑塊、stripe 條紋、none 單色
const LOOKS = {
  TW: { camo: ['#5d6b45', '#38432b', '#6e5a3e', '#23251e'], shape: 'blob', navy: '#8b969d', air: '#9aa3aa', uni: ['#5f6a45', '#3b4a2c', '#6e5a3e', '#23251e'], helmet: 'm1', rifle: 'm16' },
  CN: { camo: ['#5a6c3c'], shape: 'none', navy: '#7f8d97', air: '#a4adb2', uni: ['#6b7247'], helmet: 'gk80', rifle: 'ak' },
  US: { camo: ['#4f5b39', '#5e4b31', '#1f211b', '#6b7a4c'], shape: 'blob', navy: '#8d979e', air: '#9ba5ae', uni: ['#5a6340', '#6b5536', '#23241f', '#3f4a2e'], helmet: 'pasgt', rifle: 'm16' },
  JP: { camo: ['#5b6340', '#3e3527'], shape: 'stripe', navy: '#8a9196', air: '#9ea6ad', uni: ['#6a6f47', '#4b5132', '#76623f'], helmet: 'pasgt', rifle: 'm16' },
  KR: { camo: ['#5b6a40', '#3c2f22', '#25281f', '#7a7650'], shape: 'blob', navy: '#8b959b', air: '#9ba4ab', uni: ['#5d6640', '#45382a', '#25281f', '#7a7650'], helmet: 'm1', rifle: 'm16' },
  KP: { camo: ['#4c5a35'], shape: 'none', navy: '#6f7d84', air: '#a0a8ac', uni: ['#6b6845'], helmet: 'ssh', rifle: 'ak' },
  PH: { camo: ['#4f6a3a', '#2e3f24', '#5d4a31'], shape: 'blob', navy: '#8f989e', air: '#b4bbbf', uni: ['#506a3d', '#2e3f24', '#5d4a31'], helmet: 'm1', rifle: 'm16' },
  VN: { camo: ['#4b6137'], shape: 'none', navy: '#7c8a92', air: '#b6bec2', uni: ['#5f6d40'], helmet: 'pith', rifle: 'ak' },
  RU: { camo: ['#52633a'], shape: 'none', navy: '#7b8994', air: '#9fb3c4', uni: ['#6b6a45', '#4f5134'], helmet: 'ssh', rifle: 'ak' },
  IN: { camo: ['#6b6a45', '#8b7a52', '#3f3b28'], shape: 'blob', navy: '#8e989d', air: '#a1abb3', uni: ['#6a6b4a', '#4b4a32', '#857552'], helmet: 'ssh', rifle: 'm16' },
  PK: { camo: ['#857a52', '#55603c', '#4a3e2a'], shape: 'blob', navy: '#8f999e', air: '#9fa8af', uni: ['#7b7550', '#55603c', '#4a3e2a'], helmet: 'pasgt', rifle: 'g3' },
  GB: { camo: ['#4b5838', '#1d1f1a'], shape: 'blob', navy: '#878f95', air: '#7e878b', uni: ['#6b6545', '#3b4a2c', '#5a3f2a', '#1f1f1b'], helmet: 'pasgt', rifle: 'sa80' },
  FR: { camo: ['#59653f', '#5a4630', '#22241d'], shape: 'blob', navy: '#8c959b', air: '#909ba6', uni: ['#5b6541', '#59452f', '#23241e'], helmet: 'm1', rifle: 'famas' },
  DE: { camo: ['#4c5838', '#5c4630', '#1c1d19'], shape: 'blob', navy: '#8c9499', air: '#7c8790', uni: ['#69704a', '#3f4a2c', '#5e4a33', '#262720'], helmet: 'pasgt', rifle: 'g3', fleck: true },
  AU: { camo: ['#6a6343', '#4a5233', '#3a2f22'], shape: 'blob', navy: '#8b949a', air: '#929ba2', uni: ['#6d6a48', '#4a5233', '#7c6a45', '#2e2a20'], helmet: 'm1', rifle: 'aug' },
  IL: { camo: ['#8a8466'], shape: 'none', navy: '#7e888d', air: '#a7aaa0', uni: ['#6e6a48'], helmet: 'pasgt', rifle: 'galil' },
};
const look = nid => LOOKS[nid] || LOOKS.TW;

// 以種子產生固定的迷彩花紋（4 倍解析度，再縮小貼上）
function seeded(s) { return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
const CAMO_PAT = {};
function camoPattern(c, cols, shape, key, size = 26) {
  const k = key + '|' + size;
  if (!CAMO_PAT[k]) {
    const S = 4, cv = document.createElement('canvas');
    cv.width = cv.height = size * S;
    const g = cv.getContext('2d'), rnd = seeded(k.length * 7919 + k.charCodeAt(0) * 31 + (k.charCodeAt(1) || 0));
    g.scale(S, S);
    g.fillStyle = cols[0]; g.fillRect(0, 0, size, size);
    for (let n = 1; n < cols.length && shape !== 'none'; n++) {
      g.fillStyle = cols[n];
      const cnt = shape === 'stripe' ? 3 : size > 14 ? 5 : 4;
      for (let q = 0; q < cnt; q++) {
        const x = rnd() * size, y = rnd() * size, r = (shape === 'stripe' ? 2 : 2.4) + rnd() * 2.6;
        // 平鋪：在四周重複繪製，避免接縫
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          g.beginPath();
          if (shape === 'stripe') g.ellipse(x + ox, y + oy, r * 2.6, r * 0.7, -0.5, 0, 7);
          else for (let a = 0; a < 7; a++) {
            const ang = a / 7 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6);
            g.lineTo(x + ox + Math.cos(ang) * rr * 1.4, y + oy + Math.sin(ang) * rr);
          }
          g.fill();
        }
      }
    }
    const p = c.createPattern(cv, 'repeat');
    if (p.setTransform) p.setTransform(new DOMMatrix().scale(1 / S));
    CAMO_PAT[k] = p;
  }
  return CAMO_PAT[k];
}

// ----- 國籍標誌 -----
function starPath(c, x, y, r, r2, n = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, q = k % 2 ? r2 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath();
}
function insignia(c, nid, x, y, s, flip) {
  const disc = (r, col) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = col; c.fill(); };
  c.save();
  // 圖示整體被水平翻轉時，把標誌翻回來（文字方向一致）
  if (flip) { c.translate(x, y); c.scale(-1, 1); c.translate(-x, -y); }
  switch (nid) {
    case 'US':
      c.fillStyle = '#1f3a7a'; c.fillRect(x - s * 1.9, y - s * 0.38, s * 3.8, s * 0.76);
      disc(s, '#1f3a7a'); starPath(c, x, y, s * 0.92, s * 0.37); c.fillStyle = '#fff'; c.fill(); break;
    case 'TW':
      disc(s, '#1d3f8f'); starPath(c, x, y, s * 0.78, s * 0.5, 12); c.fillStyle = '#fff'; c.fill(); disc(s * 0.4, '#1d3f8f'); disc(s * 0.32, '#fff'); break;
    case 'CN':
      starPath(c, x, y, s * 1.1, s * 0.45); c.fillStyle = '#d0231f'; c.fill(); c.strokeStyle = '#f6d23c'; c.lineWidth = s * 0.16; c.stroke();
      c.fillStyle = '#f6d23c'; c.fillRect(x - s * 0.22, y - s * 0.2, s * 0.44, s * 0.32); break;
    case 'RU':
      starPath(c, x, y, s * 1.1, s * 0.45); c.fillStyle = '#c8211c'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = s * 0.18; c.stroke(); break;
    case 'KP':
      disc(s, '#c8211c'); disc(s * 0.82, '#fff'); starPath(c, x, y, s * 0.78, s * 0.32); c.fillStyle = '#c8211c'; c.fill(); break;
    case 'VN':
      disc(s, '#d8261f'); starPath(c, x, y, s * 0.75, s * 0.3); c.fillStyle = '#f6d23c'; c.fill(); break;
    case 'JP':
      disc(s, '#fff'); disc(s * 0.72, '#c8211c'); break;
    case 'KR':
      disc(s, '#fff');
      c.beginPath(); c.arc(x, y, s * 0.72, Math.PI, 0); c.fillStyle = '#c8211c'; c.fill();
      c.beginPath(); c.arc(x, y, s * 0.72, 0, Math.PI); c.fillStyle = '#1f3a8f'; c.fill(); break;
    case 'PH':
      disc(s, '#1f3a8f'); c.beginPath(); c.arc(x, y, s, 0, Math.PI); c.fillStyle = '#c8211c'; c.fill();
      disc(s * 0.5, '#fff'); disc(s * 0.32, '#f6c23c'); break;
    case 'IN':
      disc(s, '#ef8a1e'); disc(s * 0.66, '#fff'); disc(s * 0.34, '#178a3c'); break;
    case 'PK':
      disc(s, '#16683a'); c.beginPath(); c.arc(x, y, s * 0.6, 0.6, 5.6); c.arc(x + s * 0.2, y, s * 0.46, 5.4, 0.85, true); c.closePath(); c.fillStyle = '#fff'; c.fill(); break;
    case 'GB':
      disc(s, '#203a7a'); disc(s * 0.66, '#fff'); disc(s * 0.36, '#c8211c'); break;
    case 'FR':
      disc(s, '#203a8a'); disc(s * 0.66, '#fff'); disc(s * 0.36, '#c8211c'); break;
    case 'DE': {
      const a = s * 1.05, b = s * 0.36;
      c.beginPath();
      c.moveTo(x - b, y - a); c.lineTo(x + b, y - a); c.lineTo(x + b, y - b); c.lineTo(x + a, y - b); c.lineTo(x + a, y + b);
      c.lineTo(x + b, y + b); c.lineTo(x + b, y + a); c.lineTo(x - b, y + a); c.lineTo(x - b, y + b); c.lineTo(x - a, y + b);
      c.lineTo(x - a, y - b); c.lineTo(x - b, y - b); c.closePath();
      c.fillStyle = '#111'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = s * 0.2; c.stroke(); break;
    }
    case 'AU':
      disc(s, '#203a7a'); disc(s * 0.66, '#fff'); c.fillStyle = '#c8211c';
      c.beginPath(); c.ellipse(x, y, s * 0.42, s * 0.24, -0.5, 0, 7); c.fill(); break;
    case 'IL':
      disc(s, '#fff');
      c.strokeStyle = '#1f4fa8'; c.lineWidth = s * 0.17;
      for (const r of [0, Math.PI]) { c.beginPath(); for (let k = 0; k < 3; k++) { const a = r - Math.PI / 2 + k * 2 * Math.PI / 3; c.lineTo(x + Math.cos(a) * s * 0.72, y + Math.sin(a) * s * 0.72); } c.closePath(); c.stroke(); }
      break;
  }
  c.restore();
}

// ----- 型號 → 造型 -----
// 依型號字串比對（先符合者優先）；未列出者用東西方預設
const ICON_RULES = {
  tank: [
    [/梅卡瓦/, { t: 'merkava' }],
    [/M1A1|M1A2|艾布蘭/, { t: 'm1' }],
    [/挑戰者/, { t: 'chal' }],
    [/豹 2A[56]|勒克萊爾|10式|K2/, { t: 'leo2', wedge: true }],
    [/豹 2|90式|K1/, { t: 'leo2' }],
    [/T-90|96式|暴風虎|哈立德|T-72|阿杰亞/, { t: 'dome', era: true }],
    [/T-80U/, { t: 'dome', era: true }],
    [/T-80/, { t: 'dome' }],
    [/88B|85-IIAP|先軍/, { t: 'dome', era: false, square: true }],
    [/T-55|59式|69|天馬虎/, { t: 'dome', old: true }],
    [/蠍式/, { t: 'light' }],
    [/AMX-30|豹 1/, { t: 'cast', small: true }],
    [/M48|M60|勇虎/, { t: 'cast', light: true }],
  ],
  recon: [
    [/布萊德雷|K200/, { d: 'trk', top: 'tow' }],
    [/M113|63式/, { d: 'trk', top: 'mg' }],
    [/彎刀/, { d: 'trk', top: 'cannon', small: true }],
    [/AMX-10RC/, { d: 'w6', top: 'gun' }],
    [/87式/, { d: 'w6', top: 'cannon' }],
    [/山貓|雲豹/, { d: 'w8', top: 'cannon' }],
    [/BRDM/, { d: 'w4', top: 'mg', boat: true }],
    [/V-150/, { d: 'w4', top: 'cannon' }],
  ],
  arty: [
    [/M101|M198/, { a: 'towed' }],
    [/谷山/, { a: 'open' }],
    [/PzH|K9/, { a: 'sp', modern: true }],
    [/2S1|2S3|83式/, { a: 'sp', east: true }],
  ],
  rocket: [
    [/M270/, { r: 'mlrs' }],
    [/BM-27|03式|KN-09|雷霆|M1985|M1991/, { r: 'heavy' }],
  ],
  aa: [
    [/ZSU-23-4|石勒喀/, { g: 'shilka' }],
    [/獵豹|87式|AMX-30SA/, { g: 'gepard' }],
    [/M42|ZSU-57|80式/, { g: 'open' }],
    [/M163/, { g: 'm163' }],
    [/M167/, { g: 'towed' }],
    [/RBS-70/, { g: 'manpad' }],
    [/復仇者/, { g: 'avenger' }],
    [/長劍/, { g: 'rapier' }],
  ],
  sam: [
    [/愛國者|天弓|03式|PAC/, { s: 'box' }],
    [/S-300|S-400|紅旗-9/, { s: 'vert' }],
    [/霍克|立方|阿卡什/, { s: 'hawk' }],
    [/S-75|紅旗-2|S-125|警犬/, { s: 'rail' }],
    [/響尾蛇|羅蘭|長劍/, { s: 'turret' }],
  ],
  heli: [
    [/Ka-52/, { h: 'hind', coax: true }],
    [/阿帕契|AH-64/, { h: 'apache' }],
    [/AH-1|眼鏡蛇/, { h: 'cobra' }],
    [/Mi-24|Mi-25|Mi-28/, { h: 'hind' }],
    [/虎式|直-10/, { h: 'tiger' }],
    [/小羚羊|直-9/, { h: 'light', fen: true }],
    [/500MD|MD 520/, { h: 'light', egg: true }],
    [/UH-1H/, { h: 'huey' }],
  ],
  fighter: [
    [/F-22|F-35/, { p: 'stealth' }],
    [/F-15|鷹/, { p: 'f15' }],
    [/Su-|殲-11|側衛/, { p: 'flanker' }],
    [/MiG-29/, { p: 'flanker', short: true }],
    [/F-16|FA-50|JF-17|戰隼/, { p: 'f16' }],
    [/經國號|IDF/, { p: 'f16', twin: true }],
    [/F-5/, { p: 'f5' }],
    [/MiG-21/, { p: 'mig21' }],
    [/殲-8/, { p: 'mig21', big: true }],
    [/幻象/, { p: 'delta' }],
    [/飆風|颱風|殲-10/, { p: 'canard' }],
    [/F-4/, { p: 'f4' }],
    [/龍捲風/, { p: 'swing' }],
    [/大黃蜂/, { p: 'hornet' }],
  ],
  attacker: [
    [/A-10/, { p: 'a10' }],
    [/Su-25/, { p: 'su25' }],
    [/OV-10/, { p: 'ov10' }],
    [/A-29/, { p: 'prop' }],
    [/AT-3|自強/, { p: 'at3' }],
    [/龍捲風|F-111|Su-22/, { p: 'swing' }],
    [/Su-34|飛豹/, { p: 'flanker' }],
    [/F-15/, { p: 'f15' }],
    [/F-16|F-2|經國號|雷霆/, { p: 'f16' }],
    [/幼獅|幻象/, { p: 'delta', canard: true }],
    [/美洲虎|F-1|強-5/, { p: 'jaguar' }],
    [/F-4/, { p: 'f4' }],
  ],
  bomber: [[/Tu-22|Tu-160/, { p: 'swing', big: true }], [/轟-6/, { p: 'tu16' }]],
  stealth: [[/B-2/, { p: 'b2' }], [/.*/, { p: 'f117' }]],
  destroyer: [
    [/柏克|金剛|愛宕|世宗|旅洋|荷巴特|45型|地平線/, { s: 'aegis' }],
    [/史普魯恩斯|紀德/, { s: 'spru' }],
    [/現代級/, { s: 'sovr' }],
    [/陽字號|基林|旅大/, { s: 'ww2' }],
    [/那南|佩佳|黎剎級巡邏|薩爾/, { s: 'patrol' }],
  ],
  carrier: [
    [/庫茲涅佐夫|超日王/, { cv: 'ski', big: true }],
    [/伊莉莎白/, { cv: 'ski', big: true, twin: true }],
    [/無敵|維拉特/, { cv: 'ski' }],
    [/克里蒙梭|戴高樂/, { cv: 'flat' }],
  ],
  lst: [[/新港/, { newport: true }], [/暴風級|托布魯克|騎士級/, { lsd: true }]],
  truck: [[/MAN|73式|GBC|貝福德/, { cab: 'over' }]],
  thelico: [[/CH-47|契努克/, { h: 'chinook' }], [/Mi-8|直-8|CH-53|美洲獅/, { h: 'big' }], [/UH-1/, { h: 'huey' }]],
  airlift: [[/Il-76|C-1 運/, { p: 'jet' }], [/An-26|An-32|C-160/, { p: 'twin' }]],
  atinf: [[/拖式|米蘭|MILAN|紅箭|巴松管|中MAT|龍式/, { w: 'tripod' }], [/RPG|B41/, { w: 'rpg' }]],
  marine: [
    [/氣墊/, { m: 'hover' }], [/63式水陸|05式/, { m: 'amtank' }], [/BTR/, { m: 'btr' }],
    [/AAV7|LVTP|LVTP-7/, { m: 'aav' }], [/.*/, { m: 'troops' }],
  ],
};
// 機身顏色：特殊塗裝的型號
const AIR_PAINT = [
  [/F-117|B-2/, '#2b2d31'], [/F-22|F-35/, '#7f878d'], [/F-2 /, '#56779c'], [/A-10/, '#5f6863'], [/Su-25|蛙足/, { camo: ['#7b7a58', '#5a4b33', '#4b5a3a'] }],
  [/幼獅|F-16I|F-15I/, { camo: ['#b29d73', '#7a6a48', '#5f6b47'] }], [/美洲虎/, { camo: ['#6d7357', '#3f4733'] }], [/強-5|Su-22/, { camo: ['#8a8f7a', '#5b6347'] }],
  [/OV-10|A-29/, { camo: ['#5d6650', '#3f4636'] }], [/AT-3/, '#8e9aa1'], [/Su-27|Su-30|Su-35|殲-11|側衛/, { camo: ['#a9bccb', '#7f9ab0'] }],
  [/F-4F|龍捲風 IDS|龍捲風 GR1/, { camo: ['#5c6650', '#7f878a'] }],
];
const VARIANT_CACHE = {};
function iconVariant(d) {
  const k = d.nation + '|' + d.base + '|' + d.model;
  if (VARIANT_CACHE[k]) return VARIANT_CACHE[k];
  let v = {};
  for (const [re, o] of ICON_RULES[d.base] || []) if (re.test(d.model)) { v = Object.assign({}, o); break; }
  v.east = NATIONS[d.nation] && NATIONS[d.nation].style === 'east';
  for (const [re, col] of AIR_PAINT) if (re.test(d.model)) { v.paint = col; break; }
  return (VARIANT_CACHE[k] = v);
}

// ----- 繪製 -----
function drawIcon(c, d, flip = false) {
  const L = look(d.nation), v = iconVariant(d), east = v.east, base = d.base, nid = d.nation;
  const camo = L.camo[0];
  const hi = shade(camo, 0.28), lo = shade(camo, -0.38), edge = shade(camo, -0.6);
  // 填色：字串／漸層直接使用；{camo} 先鋪迷彩再疊上光影
  const CAMO = (y0, y1, cols = L.camo, shape = L.shape, key = nid) => ({ camo: cols, shape, key, y0, y1 });
  const paint = fill => {
    if (fill && fill.camo) {
      c.fillStyle = camoPattern(c, fill.camo, fill.shape, fill.key); c.fill();
      c.fillStyle = lgrad(c, 0, fill.y0, 0, fill.y1, [[0, 'rgba(255,255,255,0.28)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.42)']]); c.fill();
    } else { c.fillStyle = fill; c.fill(); }
  };
  const stroke = (s, w = 0.8) => { if (s) { c.strokeStyle = s; c.lineWidth = w; c.lineJoin = 'round'; c.stroke(); } };
  const poly = (pts, fill, s) => { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); paint(fill); stroke(s); };
  const rr = (x, y, w, h, r, fill, s) => { roundRect(c, x, y, w, h, Math.min(r, w / 2, h / 2)); paint(fill); stroke(s); };
  const ell = (x, y, rx, ry, rot, fill, s, a0 = 0, a1 = 7) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, a0, a1); if (a1 - a0 < 7) c.closePath(); paint(fill); stroke(s); };
  const dot = (x, y, r, fill) => { circle(c, x, y, r); c.fillStyle = fill; c.fill(); };
  const line = (x1, y1, x2, y2, w, col) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); };
  const metal = (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, '#9a9a92'], [0.5, '#5d5d58'], [1, '#2e2e2b']]);
  const glass = (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, '#e3f2fc'], [1, '#3d6a8c']]);
  const shadowE = (w, y) => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(0, y, w, 2.6, 0, 0, 7); c.fill(); };
  const mark = (x, y, s) => insignia(c, nid, x, y, s, flip);
  const wheel = (x, y, r) => { dot(x, y, r, '#1c1c1a'); dot(x, y, r * 0.58, '#6a6a62'); dot(x, y, r * 0.2, '#222'); };
  const gun = (x, y, len, w, ang = 0, brake = true) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    rr(0, -w / 2, len, w, w / 2.5, metal(-w / 2, w / 2));
    if (brake) rr(len - 2.4, -w / 2 - 0.5, 2.6, w + 1, 0.6, '#33332f');
    c.restore();
  };
  // 履帶：west 小負重輪＋側裙；east 大負重輪、無托帶輪
  const tracks = (x0 = -17, w = 34, sov = false, n) => {
    rr(x0, 2.5, w, 8.5, 4.2, lgrad(c, 0, 2.5, 0, 11, [[0, '#4a4a46'], [1, '#1d1d1b']]));
    const nw = n || (sov ? 6 : 7), r = sov ? 3.1 : 2.4, step = (w - 8) / (nw - 1);
    for (let k = 0; k < nw; k++) {
      const x = x0 + 4 + k * step;
      dot(x, 7.2, r, '#262624'); dot(x, 7.2, r * 0.66, '#5a5a53'); dot(x, 7.2, r * 0.22, '#222');
    }
    dot(x0 + w - 2.6, 4.6, 1.6, '#3a3a36');
  };
  const air = d.cat === 'air';
  const paintAir = () => {
    const p = v.paint || L.air;
    return p.camo ? (y0, y1) => CAMO(y0, y1, p.camo, 'blob', d.model) : (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, shade(p, 0.3)], [0.5, p], [1, shade(p, -0.35)]]);
  };
  const airEdge = () => shade(typeof (v.paint || L.air) === 'string' ? (v.paint || L.air) : v.paint.camo[0], -0.6);

  switch (base) {
    // ===================== 步兵 =====================
    case 'inf': case 'atinf': {
      const soldier = (ox, s, pose) => {
        c.save(); c.translate(ox, 0); c.scale(s, s);
        const uni = CAMO(-10, 10, L.uni, L.uni.length > 1 ? 'blob' : 'none', nid + 'u');
        const dark = shade(L.uni[0], -0.35);
        if (pose === 'kneel') poly([[-3, 3], [3, 3], [6, 10], [3, 10.5], [0, 6], [-2, 10.5], [-5, 10.5]], uni, dark);
        else { poly([[-3, 2], [0, 2], [-1, 10.5], [-4, 10.5]], uni, dark); poly([[0, 2], [3, 2], [4.5, 10.5], [1.5, 10.5]], uni, dark); }
        rr(-1, 9.5, 3.5, 1.4, 0.5, '#1d1b17'); rr(-4.5, 9.5, 3.5, 1.4, 0.5, '#1d1b17');
        rr(-4, -4, 7.5, 8, 2, uni, dark);
        rr(-6.8, -3.6, 3.2, 6.4, 1.2, shade(L.uni[0], -0.25));
        line(-2, -3.8, 2.6, 2.6, 0.7, 'rgba(0,0,0,0.35)');
        dot(0.4, -6.6, 2.4, '#d6b08a');
        // 鋼盔
        c.beginPath();
        if (L.helmet === 'ssh') { c.moveTo(-4.1, -6); c.quadraticCurveTo(-3.8, -11.6, 0.4, -11.4); c.quadraticCurveTo(4.4, -11.4, 4.3, -6.4); c.lineTo(4.8, -5.8); c.lineTo(-4.6, -5.6); }
        else if (L.helmet === 'gk80') { c.moveTo(-4, -6.2); c.quadraticCurveTo(0.2, -12.6, 4.2, -6.4); }
        else if (L.helmet === 'pith') { c.ellipse(0.2, -7.6, 4.8, 3.6, 0, Math.PI, 0); c.lineTo(5.8, -7); c.lineTo(-5.4, -7); }
        else if (L.helmet === 'pasgt') { c.moveTo(-4.2, -5.6); c.lineTo(-4.4, -8); c.quadraticCurveTo(-1, -12.2, 3.6, -9.6); c.lineTo(4.4, -7.2); c.lineTo(3.4, -7.2); c.lineTo(3.4, -6.4); }
        else { c.ellipse(0.2, -7.4, 4.1, 3.4, 0, Math.PI, 0); c.lineTo(4.6, -7.2); c.lineTo(-4.4, -7.2); }
        c.closePath();
        c.fillStyle = L.helmet === 'pasgt' && L.uni.length > 1 ? camoPattern(c, L.uni, 'blob', nid + 'u') : lgrad(c, 0, -12, 0, -6, [[0, shade(L.uni[0], 0.2)], [1, shade(L.uni[0], -0.3)]]);
        c.fill(); c.strokeStyle = dark; c.lineWidth = 0.6; c.stroke();
        if (pose === 'rpg') {
          rr(-11, -6.8, 22, 2.4, 1, '#5a5446', '#1e1c16');
          poly([[11, -5.6], [14, -8.2], [19, -5.6], [14, -3]], '#59603e', '#1e2114');
        } else if (pose === 'tube') {
          rr(-11, -7.5, 25, 3.6, 1.6, lgrad(c, 0, -7.5, 0, -4, [[0, '#7c8455'], [1, '#3c4128']]), '#1e2114');
          rr(1, -4.3, 2.4, 3, 0.6, '#262620');
        } else {
          // 步槍：AK 彎彈匣、M16 提把、其他直彈匣
          line(-4, 1.5, 12, -2.5, 1.6, '#1b1b18');
          if (L.rifle === 'ak') { c.beginPath(); c.moveTo(6.4, -1.2); c.quadraticCurveTo(7.8, 1.6, 6.6, 3.6); c.lineWidth = 1.6; c.strokeStyle = '#3b2a1c'; c.stroke(); line(-4, 1.5, -1, 0.7, 2.2, '#5b3a22'); }
          else { line(6.6, -1.2, 6.9, 2.2, 1.3, '#1b1b18'); if (L.rifle === 'm16') line(3, -2.6, 6.5, -3.4, 0.9, '#1b1b18'); }
          line(0, -1, 6, -0.6, 2.4, shade(L.uni[0], -0.1));
        }
        c.restore();
      };
      if (base === 'inf') {
        c.globalAlpha = 0.85; soldier(-7, 0.85); c.globalAlpha = 1; soldier(3.5, 1);
      } else if (v.w === 'tripod') {
        // 反戰車飛彈：三腳架上的發射筒與瞄準具，射手跪姿
        line(4, 3, 0, 10.5, 1, '#2a2a24'); line(4, 3, 9, 10.5, 1, '#2a2a24'); line(4, 3, 4, 10.5, 1, '#2a2a24');
        rr(-4, -2.6, 22, 3.8, 1.5, lgrad(c, 0, -2.6, 0, 1.2, [[0, '#8b9064'], [1, '#474b30']]), '#1e2114');
        rr(1, 1, 6, 3.4, 0.8, '#3a3d2c', '#1e2114');
        soldier(-8, 0.95, 'kneel');
      } else soldier(-1, 1.05, v.w === 'rpg' ? 'rpg' : 'tube');
      break;
    }
    // ===================== 陸戰隊 =====================
    case 'marine': {
      c.fillStyle = 'rgba(80,140,200,0.55)'; c.beginPath(); c.ellipse(0, 8, 19, 3.5, 0, 0, 7); c.fill();
      const B = CAMO(-6, 6);
      if (v.m === 'hover') {
        rr(-17, 2, 34, 7, 3.5, '#2b2b28');
        poly([[-16, 3], [-15, -4], [10, -4], [16, 1], [15, 3]], CAMO(-4, 3), edge);
        rr(-14, -10, 5, 6, 1, '#555', '#222'); dot(-11.5, -11, 3.6, 'rgba(60,60,60,0.5)');
        rr(-2, -7.5, 9, 3.6, 1, CAMO(-7.5, -4), edge); rr(1, -6.6, 4, 1.6, 0.5, glass(-6.6, -5));
      } else if (v.m === 'btr') {
        poly([[-17, 4], [-16, -3], [-10, -5.5], [10, -5.5], [15, -2], [17.5, 2], [16, 4]], B, edge);
        rr(-2, -9, 7, 4, 1.6, CAMO(-9, -5), edge); gun(4, -7.4, 10, 1.1, 0, false);
        for (const x of [-12, -5, 3, 10]) wheel(x, 5.8, 3.3);
      } else if (v.m === 'amtank') {
        poly([[-17, 4], [-17, -2], [11, -2], [18, 2], [16, 4]], B, edge);
        ell(-2, -2, 8, 5.2, 0, CAMO(-7, -2), edge, Math.PI, 2 * Math.PI);
        gun(5, -4, 13, 1.6);
        for (const x of [-13, -7, -1, 5, 11]) dot(x, 5.4, 2, '#2a2a26');
      } else if (v.m === 'troops') {
        // 涉水登陸的步兵
        for (const [ox, s] of [[-8, 0.8], [3, 0.95]]) {
          c.save(); c.translate(ox, -2); c.scale(s, s);
          rr(-4, -4, 7.5, 8, 2, CAMO(-4, 4, L.uni, L.uni.length > 1 ? 'blob' : 'none', nid + 'u'), edge);
          dot(0.4, -6.6, 2.4, '#d6b08a'); ell(0.2, -7.4, 4.1, 3.4, 0, shade(L.uni[0], -0.15), null, Math.PI, 2 * Math.PI);
          line(-4, 1.5, 12, -2.5, 1.6, '#1b1b18');
          c.restore();
        }
      } else {
        // AAV7／LVTP 兩棲突擊車：高車身、前端斜面
        poly([[-16, 6], [-16, -5], [-12, -7], [8, -7], [17, 0], [15, 6]], B, edge);
        rr(-9, -10.5, 7, 3.6, 1.2, CAMO(-10.5, -7), edge); line(-3, -9, 4, -9.4, 1.4, '#2a2a26');
        line(-14, 2, 13, 2, 0.6, 'rgba(0,0,0,0.3)');
        if (v.m === 'aav') mark(-7, -2, 2.2);
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const x of [14, 16.5, 12]) { c.beginPath(); c.arc(x, 6.5, 1.4, 0, 7); c.fill(); }
      line(-17, 8.3, 17, 8.3, 1, 'rgba(255,255,255,0.7)');
      break;
    }
    // ===================== 戰車 =====================
    case 'tank': {
      shadowE(18, 10.8);
      const t = v.t || (east ? 'dome' : 'cast'), sov = t === 'dome', sc = t === 'light' ? 0.86 : 1;
      c.save(); c.scale(sc, sc);
      tracks(-17, 34, sov);
      const H = CAMO(-3, 3), T = CAMO(-10, -2);
      if (t === 'merkava') {
        // 引擎前置：長斜前車體，砲塔後置呈楔形
        poly([[-17, 3], [-16, -2.5], [2, -3.2], [18, 1], [18, 3]], H, edge);
        rr(-17, 2, 33, 3.6, 1, H, edge);
        poly([[-15, -2.5], [-14, -7.5], [-2, -8.6], [8, -4], [8, -2.5]], T, edge);
        gun(5, -5.4, 15, 2.4, -0.02);
        for (let k = 0; k < 6; k++) dot(-13 + k * 2.6, -1.6, 0.8, '#2a2a26');
        mark(-8, -5, 1.8);
      } else {
        // 車體
        poly([[-17, 3], [-14.5, -2.5], [12.5, -2.5], [17.5, 2.5], [17.5, 3]], H, edge);
        if (!sov) rr(-16, 1.6, 31, 3.6, 1, H, edge);
        if (t === 'm1') {
          poly([[-14, -2.5], [-14, -7.6], [-9, -9.2], [7, -9.2], [12, -5.5], [12, -2.5]], T, edge);
          gun(11, -5.8, 12, 2.4, 0, false);
          rr(-6, -11, 5, 2, 0.8, '#2f2f2b'); rr(2, -10.8, 3, 1.8, 0.6, '#2f2f2b');
          mark(-5, -5.6, 1.8);
        } else if (t === 'leo2' || t === 'chal') {
          if (t === 'chal') poly([[-13, -2.5], [-12, -8.6], [4, -8.8], [11, -4.2], [11, -2.5]], T, edge);
          else {
            poly([[-12.5, -2.5], [-12.5, -9], [7, -9], [9.5, -7.5], [9.5, -2.5]], T, edge);
            if (v.wedge) poly([[7, -9], [14, -7.6], [9.5, -3.2]], T, edge);
          }
          gun(10, -6.2, 14, 2.4, 0, false);
          rr(-5, -11, 5, 2, 0.8, '#2f2f2b');
          mark(-5, -5.6, 1.8);
        } else if (t === 'dome') {
          // 蘇式低矮半球砲塔，位置偏前
          ell(-0.5, -2.3, 9, v.square ? 6 : 6.6, 0, T, edge, Math.PI, 2 * Math.PI);
          gun(6.5, -5.2, v.old ? 14 : 16, 2, 0, false);
          if (v.old) { rr(13, -6.2, 2.6, 2.2, 0.8, '#2e2e2a'); rr(5, -9.6, 3, 2, 0.6, '#d8d8c8'); }
          // 爆炸反應裝甲：砲塔前緣一排磚塊
          if (v.era) for (const [x, y] of [[4.2, -5.8], [2.4, -7.6], [0, -8.7]]) rr(x, y, 2.6, 1.7, 0.3, shade(camo, -0.12), edge);
          dot(-3, -8.4, 1.4, edge);
          rr(-17, -1.8, 3.6, 3, 1, '#3c3a32');
          mark(-9.5, -0.2, 1.6);
        } else if (t === 'light') {
          poly([[-9, -2.5], [-8, -7.5], [4, -7.5], [7, -2.5]], T, edge);
          gun(6, -5.4, 9, 2, 0, false);
          mark(-2, -5, 1.7);
        } else {
          // 鑄造圓砲塔（M48/M60/AMX-30/豹1）
          ell(-1.5, -2.5, v.small ? 9 : 10.5, 6.6, 0, T, edge, Math.PI, 2 * Math.PI);
          rr(-6, -11.4, 6, 2.6, 1, CAMO(-11.4, -8.8), edge);
          gun(7.5, -5.4, v.small ? 12 : 13, 2.3, 0, true);
          if (v.light) rr(6, -10.6, 4.6, 3.4, 0.8, '#d6d8cd', '#33332f');
          mark(-5, -4.6, 1.8);
        }
      }
      c.restore();
      break;
    }
    // ===================== 偵察車 =====================
    case 'recon': {
      shadowE(17, 10.5);
      const dv = v.d || (east ? 'w4' : 'trk'), B = CAMO(-10, 4), sc = v.small ? 0.85 : 1;
      c.save(); c.scale(sc, sc);
      let roof = -7;
      if (dv === 'trk') {
        tracks(-16, 32, false, 5);
        poly([[-16, 3], [-16, -6.5], [7, -6.5], [16.5, 0], [16.5, 3]], B, edge);
        roof = -6.5;
      } else {
        const n = dv === 'w8' ? [-12, -5.5, 3.5, 10] : dv === 'w6' ? [-11, -2, 10] : [-10, 9.5];
        if (v.boat) poly([[-16, 4], [-16, -3], [-8, -6.5], [6, -6.5], [12, -3], [17, 1], [16, 4]], B, edge);
        else poly([[-16.5, 4], [-16, -4], [-12, dv === 'w8' ? -8 : -6.5], [8, dv === 'w8' ? -8 : -6.5], [16.5, -1], [16.5, 4]], B, edge);
        roof = dv === 'w8' ? -8 : -6.5;
        for (const x of n) wheel(x, 6, dv === 'w4' ? 4 : 3.4);
        rr(9, roof + 1.4, 3, 2, 0.5, 'rgba(30,40,50,0.7)');
      }
      if (v.top === 'tow') {
        rr(-6, roof - 4.5, 11, 4.5, 1.2, CAMO(roof - 4.5, roof), edge);
        rr(-9, roof - 7, 6, 3, 0.8, CAMO(roof - 7, roof - 4), edge);
        gun(5, roof - 2.5, 9, 1.2, 0, false);
      } else if (v.top === 'gun') {
        rr(-6, roof - 5, 12, 5, 2, CAMO(roof - 5, roof), edge);
        gun(5, roof - 2.6, 15, 2, 0, true);
      } else if (v.top === 'cannon') {
        rr(-4, roof - 4, 9, 4, 1.5, CAMO(roof - 4, roof), edge);
        gun(5, roof - 2.2, 9, 1.2, 0, false);
      } else {
        rr(-3, roof - 2.6, 5, 2.6, 1, '#3a3a34'); line(0, roof - 2.6, 9, roof - 3.2, 1.1, '#2a2a26');
      }
      mark(-10, roof + 4, 1.8);
      c.restore();
      break;
    }
    // ===================== 火砲 =====================
    case 'arty': {
      shadowE(18, 10.8);
      const a = v.a || 'sp';
      if (a === 'towed') {
        // 牽引式榴彈砲：開架砲尾、護盾、雙輪
        line(-2, 5, -17, 9.5, 2, '#2f3324'); line(-2, 5, -15, 7.4, 2, '#3f4430');
        c.save(); c.translate(0, -1); c.rotate(-0.42);
        rr(-6, -1.8, 24, 3.4, 1, metal(-1.8, 1.6)); rr(-6, -2.8, 10, 5.4, 1.2, CAMO(-3, 3), edge);
        c.restore();
        poly([[2, -7], [6, -7], [6, 4], [2, 4]], CAMO(-7, 4), edge);
        wheel(3, 6.5, 4.2);
      } else if (a === 'open') {
        tracks(-17, 34, true);
        poly([[-17, 3], [-15, -2.5], [14, -2.5], [17, 3]], CAMO(-3, 3), edge);
        rr(-14, -6, 10, 3.6, 1, CAMO(-6, -2.5), edge);
        c.save(); c.translate(-6, -5); c.rotate(-0.26); rr(0, -1.4, 28, 2.6, 1, metal(-1.4, 1.2)); c.restore();
        mark(6, 0, 1.6);
      } else {
        tracks(-17, 34, a === 'sp' && (v.east || east));
        poly([[-17, 3], [-15, -2], [14, -2], [17, 3]], CAMO(-2, 3), edge);
        if (v.modern) poly([[-14, -2], [-14, -10], [-2, -11], [5, -8.5], [5, -2]], CAMO(-11, -2), edge);
        else if (v.east || east) ell(-5, -2, 10, 8, 0, CAMO(-10, -2), edge, Math.PI, 2 * Math.PI);
        else rr(-14, -11, 17, 9.5, 1.6, CAMO(-11, -1.5), edge);
        c.save(); c.translate(1, -7.5); c.rotate(-0.42);
        rr(0, -1.6, 18, 3.2, 1, metal(-1.6, 1.6)); rr(16, -2.4, 3.6, 4.8, 1, '#2f2f2b');
        c.restore();
        mark(-7, -5.6, 1.8);
      }
      break;
    }
    // ===================== 多管火箭 =====================
    case 'rocket': {
      shadowE(18, 10.8);
      const r = v.r || 'truck';
      if (r === 'mlrs') {
        tracks(-17, 34, false, 6);
        poly([[-17, 3], [-17, -2], [16, -2], [17.5, 3]], CAMO(-2, 3), edge);
        poly([[8, -2], [8, -9], [13, -9], [17, -4], [17, -2]], CAMO(-9, -2), edge);
        rr(12, -7.8, 3.2, 2.4, 0.5, glass(-7.8, -5.4));
        c.save(); c.translate(-6, -3); c.rotate(-0.3);
        rr(-10, -9, 20, 9, 1, CAMO(-9, 0), edge);
        c.fillStyle = '#1b1b19'; for (let k = 0; k < 3; k++) for (let q = 0; q < 2; q++) { c.beginPath(); c.arc(8.4 - q * 0.01, -7.2 + k * 2.6 + q * 0.01, 0.9, 0, 7); c.fill(); }
        c.restore();
        mark(-1, -0.2, 1.7);
      } else {
        const heavy = r === 'heavy';
        rr(-17, 0, 34, 4.6, 1, '#2f302a');
        poly([[8, 1], [8, -7.4], [13, -7.4], [17, -2.5], [17, 2]], CAMO(-7.4, 2), edge);
        rr(12.3, -6, 3.4, 2.6, 0.6, glass(-6, -3.4));
        c.save(); c.translate(-4, -1.5); c.rotate(heavy ? -0.42 : -0.3);
        if (heavy) {
          rr(-13, -8, 22, 8, 1.4, CAMO(-8, 0), edge);
          c.fillStyle = '#1b1b19'; for (let k = 0; k < 2; k++) for (let q = 0; q < 2; q++) { c.beginPath(); c.arc(8.4 + q * 0.01, -6 + k * 3.6, 1.4, 0, 7); c.fill(); }
        } else {
          for (let k = 0; k < 4; k++) rr(-12, -8.6 + k * 2.1, 20, 1.8, 0.8, metal(-8.6 + k * 2.1, -6.8 + k * 2.1));
          rr(-12, -8.8, 2, 8.8, 0.4, '#3a3a34'); rr(4, -8.8, 1.5, 8.8, 0.4, '#3a3a34');
        }
        c.restore();
        for (const x of heavy ? [-13, -7, 2, 12] : [-11, -4, 12]) wheel(x, 7, 3.6);
        mark(10.5, -1, 1.5);
      }
      break;
    }
    // ===================== 防空砲 =====================
    case 'aa': {
      shadowE(18, 10.8);
      const g = v.g || (east ? 'shilka' : 'gepard');
      const radarDish = (x, y, s = 1) => { ell(x, y, 4.6 * s, 2 * s, -0.3, '#c9ccc5', '#555'); line(x, y, x + 1.6, y + 3, 1.1, '#444'); };
      if (g === 'manpad') {
        // 攜帶式防空飛彈班：三腳架發射器
        line(2, 2, -2, 10.5, 1, '#2a2a24'); line(2, 2, 7, 10.5, 1, '#2a2a24');
        c.save(); c.translate(2, -1); c.rotate(-0.5); rr(-6, -2, 20, 4, 1.8, '#5f6745', '#1e2114'); c.restore();
        rr(-10, -4, 6, 8, 2, CAMO(-4, 4, L.uni, 'blob', nid + 'u'), edge); dot(-7, -6.4, 2.3, '#d6b08a');
        ell(-7, -7.2, 3.8, 3, 0, shade(L.uni[0], -0.15), null, Math.PI, 2 * Math.PI);
        poly([[-10, 4], [-7, 4], [-8, 10.5], [-11, 10.5]], shade(L.uni[0], -0.3));
        break;
      }
      if (g === 'avenger') {
        poly([[-16, 4], [-16, -2], [-4, -2], [-1, -6], [9, -6], [16, -1], [16, 4]], CAMO(-6, 4), edge);
        rr(-12, -9, 4, 7, 1, '#3a3a34');
        for (const y of [-12, -9]) rr(-15, y, 10, 2.6, 1, '#d8dad4', '#555');
        for (const x of [-10, 10]) wheel(x, 6, 4.2);
        break;
      }
      if (g === 'towed') {
        line(-16, 8, 4, 4, 1.6, '#2f3324');
        rr(-6, -2, 12, 6, 1, CAMO(-2, 4), edge);
        c.save(); c.translate(2, -2); c.rotate(-0.6); for (const oy of [-1.2, 0, 1.2]) rr(0, oy - 0.4, 15, 0.8, 0.3, '#333'); c.restore();
        radarDish(-4, -5, 0.8);
        wheel(0, 6.5, 3.6);
        break;
      }
      tracks(-17, 34, g === 'shilka' || g === 'open' && east, g === 'm163' ? 5 : undefined);
      if (g === 'm163' || g === 'rapier') {
        poly([[-16, 3], [-16, -6], [6, -6], [15, 0], [15, 3]], CAMO(-6, 3), edge);
        if (g === 'rapier') {
          rr(-8, -10, 9, 4, 1.2, CAMO(-10, -6), edge);
          for (const oy of [-12.5, -9.5]) { rr(-12, oy, 15, 1.8, 0.8, '#d8dad4', '#666'); poly([[3, oy], [6, oy + 0.9], [3, oy + 1.8]], '#c43d32'); }
        } else {
          rr(-8, -10, 9, 4, 1.4, CAMO(-10, -6), edge);
          c.save(); c.translate(0, -8.5); c.rotate(-0.5); for (const oy of [-1, 0, 1]) rr(0, oy - 0.4, 13, 0.8, 0.3, '#2c2c2a'); c.restore();
          radarDish(-11, -11, 0.7);
        }
        mark(-9, -2, 1.7);
        break;
      }
      poly([[-17, 3], [-14, -2], [14, -2], [17, 3]], CAMO(-2, 3), edge);
      if (g === 'shilka') {
        rr(-10, -8, 19, 6, 1.4, CAMO(-8, -2), edge);
        c.save(); c.translate(7, -5.4); c.rotate(-0.42); for (const oy of [-1.6, -0.5, 0.6, 1.7]) rr(0, oy - 0.4, 10, 0.8, 0.3, '#2c2c2a'); c.restore();
        rr(-9, -12.6, 8, 4.6, 0.8, '#55594a', '#2a2a26');
        mark(-12, 0, 1.6);
      } else if (g === 'open') {
        rr(-10, -8, 15, 6, 1, CAMO(-8, -2), edge);
        c.save(); c.translate(2, -6); c.rotate(-0.55); rr(0, -2.4, 17, 1.6, 0.6, metal(-2.4, -0.8)); rr(0, 0.8, 17, 1.6, 0.6, metal(0.8, 2.4)); c.restore();
        mark(-12, 0, 1.6);
      } else {
        // 獵豹型：砲塔兩側各一門機砲，頂部搜索雷達、前方追蹤雷達
        rr(-8, -9.5, 13, 7.5, 1.6, CAMO(-9.5, -2), edge);
        c.save(); c.translate(3, -7); c.rotate(-0.65); rr(0, -3.6, 15, 1.7, 0.6, metal(-3.6, -1.9)); rr(0, 2, 15, 1.7, 0.6, metal(2, 3.7)); c.restore();
        rr(-7, -13.4, 9, 1.8, 0.8, '#c9ccc5', '#555'); line(-2.5, -11.6, -2.5, -9.5, 1, '#444');
        dot(5.6, -6.2, 2, '#55594a');
        mark(-11, 0, 1.6);
      }
      break;
    }
    // ===================== 防空飛彈 =====================
    case 'sam': {
      shadowE(18, 10.8);
      const s = v.s || (east ? 'rail' : 'hawk');
      const missile = (x, y, len, w, ang, red = true) => {
        c.save(); c.translate(x, y); c.rotate(ang);
        rr(0, -w / 2, len, w, w / 2, lgrad(c, 0, -w / 2, 0, w / 2, [[0, '#ffffff'], [1, '#b6bab4']]), '#777');
        poly([[len - 0.2, -w / 2], [len + w * 1.4, 0], [len - 0.2, w / 2]], red ? '#c43d32' : '#dfe2dc');
        poly([[0, -w / 2], [2.6, -w / 2], [0.5, -w / 2 - 2], [-1, -w / 2 - 2]], '#8a8d88'); poly([[0, w / 2], [2.6, w / 2], [0.5, w / 2 + 2], [-1, w / 2 + 2]], '#8a8d88');
        c.restore();
      };
      if (s === 'turret') {
        tracks(-16, 32, false, 5);
        poly([[-16, 3], [-16, -4], [10, -4], [16, 1], [16, 3]], CAMO(-4, 3), edge);
        rr(-6, -9, 9, 5, 1.4, CAMO(-9, -4), edge);
        for (const oy of [-12, -7]) rr(-9, oy, 16, 2.6, 1.2, '#cfd2cc', '#666');
        ell(-1.5, -12, 4, 1.6, 0, '#c9ccc5', '#555');
        mark(-11, -0.5, 1.6);
        break;
      }
      if (s === 'vert') {
        // 大型八輪車，發射筒接近垂直
        rr(-17, 0, 34, 4.4, 1, '#2f302a');
        poly([[9, 1], [9, -7.4], [13.5, -7.4], [17.5, -2.5], [17.5, 2]], CAMO(-7.4, 2), edge);
        rr(13, -6, 3.2, 2.4, 0.5, glass(-6, -3.6));
        c.save(); c.translate(-12, 0); c.rotate(-1.15);
        for (let k = 0; k < 2; k++) rr(0, -3 + k * 3.2, 15, 3, 1.4, CAMO(-3, 3), edge);
        c.restore();
        for (const x of [-14, -8, 3, 12]) wheel(x, 6.6, 3.3);
        mark(4, -3.4, 1.6);
        break;
      }
      if (s === 'box') {
        rr(-17, 0, 34, 4.4, 1, '#2f302a');
        poly([[9, 1], [9, -6.5], [13, -6.5], [17, -2], [17, 2]], CAMO(-6.5, 2), edge);
        c.save(); c.translate(-12, -0.5); c.rotate(-0.68);
        rr(0, -7, 19, 7, 1, CAMO(-7, 0), edge);
        line(0, -3.5, 19, -3.5, 0.6, edge); line(9.5, -7, 9.5, 0, 0.5, 'rgba(0,0,0,0.35)');
        c.restore();
        for (const x of [-12, -6, 12]) wheel(x, 6.8, 3.5);
        mark(4, 2, 1.5);
        break;
      }
      if (s === 'rail') {
        // 單枚大型飛彈置於旋轉發射架（S-75／紅旗-2）
        rr(-12, 3, 24, 3.4, 1, '#3a3d32');
        line(-12, 6.4, -16, 10, 1.4, '#2f3324'); line(12, 6.4, 16, 10, 1.4, '#2f3324');
        rr(-6, -1, 12, 4, 1, CAMO(-1, 3), edge);
        missile(-14, 2, 26, 3, -0.55);
        c.save(); c.translate(-14, 2); c.rotate(-0.55); rr(-1.5, -2.6, 6, 5.2, 0.6, '#9a9c96', '#555'); c.restore();
        mark(0, 1, 1.5);
        break;
      }
      // hawk：拖車上三枚外露飛彈
      if (east) { tracks(-16, 32, true, 5); poly([[-16, 3], [-15, -3], [12, -3], [16, 3]], CAMO(-3, 3), edge); }
      else { rr(-12, 1, 24, 3.4, 1, '#3a3d32'); line(-12, 2.6, -17, 9.5, 1.6, '#2f3324'); wheel(-2, 7, 3.4); wheel(6, 7, 3.4); }
      for (const [dx, dy] of [[-2, -6], [0, -2.6], [2, 0.8]]) missile(-10 + dx, dy - 1, 18, 2.6, -0.42);
      mark(-12, -1, 1.5);
      break;
    }
    // ===================== 直升機 =====================
    case 'heli': case 'thelico': {
      const hc = base === 'thelico' ? (v.h || 'huey') : (v.h || (east ? 'hind' : 'cobra'));
      const g = camo, F = CAMO(-7, 7);
      const rotor = (x, y, w) => { c.fillStyle = 'rgba(40,40,40,0.25)'; c.beginPath(); c.ellipse(x, y, w, 2, 0, 0, 7); c.fill(); line(x - w, y, x + w, y, 0.8, 'rgba(30,30,30,0.6)'); };
      shadowE(14, 13);
      if (hc === 'chinook') {
        rotor(-9, -10, 11); rotor(10, -11, 11);
        rr(-16, -5, 31, 11, 4, F, edge);
        poly([[-16, -5], [-13, -10], [-6, -10], [-6, -5]], F, edge);
        line(-9, -10, -9, -5, 1.4, '#2a2a28'); line(10, -11, 10, -5, 1.4, '#2a2a28');
        ell(12.5, -1.6, 3, 2.6, 0.2, glass(-4, 1));
        for (const x of [-11, -7, -3, 1, 5]) dot(x, -1.6, 1, 'rgba(30,40,50,0.6)');
        wheel(-10, 8.4, 1.9); wheel(9, 8.4, 1.9);
        mark(-2, 2.6, 1.8);
        break;
      }
      if (hc === 'big' || hc === 'huey' && base === 'thelico') {
        const big = hc === 'big';
        rotor(1, -10, 18);
        line(1, -10, 1, -5, 1.8, '#2a2a28');
        poly([[-4, -2], [-18, -2.5], [-18, 0.8], [-4, 3]], F, edge);
        poly([[-18.5, -2.5], [-16, -9], [-13.5, -2.5]], F, edge);
        dot(-17.5, -4, 2.4, 'rgba(40,40,40,0.25)');
        rr(-9, -5, big ? 23 : 18, big ? 11 : 10, 4.5, F, edge);
        if (big) rr(-5, -8, 10, 3.4, 1.4, F, edge);
        ell(big ? 11 : 6.5, -1.6, 3.6, 3, 0.2, glass(-4, 1.5));
        for (const x of big ? [-5, -1, 3] : [-4, 0]) rr(x, -3, 2.6, 2.4, 0.6, 'rgba(30,40,50,0.7)');
        if (big || hc !== 'huey') { wheel(-4, 8, 2); wheel(8, 8, 2); }
        else { line(-8, 8.6, 9, 8.6, 1.2, '#2b2b28'); line(-5, 5, -5, 8.6, 1, '#2b2b28'); line(5, 5, 5, 8.6, 1, '#2b2b28'); }
        mark(-1, 2.4, 1.8);
        break;
      }
      rotor(1, -9.5, hc === 'light' ? 14 : 19);
      if (v.coax) { rotor(1, -12.5, 18); line(1, -12.5, 1, -5, 1.6, '#2a2a28'); }
      else line(1, -9.5, 1, -5, 2, '#2a2a28');
      // 尾桁與尾翼
      if (hc === 'light') {
        poly([[-3, -2], [-17, -1.4], [-17, 1], [-3, 2.4]], F, edge);
        if (v.fen) { ell(-17, -2, 2.8, 3.4, 0, F, edge); dot(-17, -2, 1.5, '#333'); }
        else if (v.egg) { poly([[-18, -6], [-15, -6], [-14, 1], [-17, 1]], F, edge); }
        else poly([[-18.5, -1.4], [-16, -8], [-13.5, -1.4]], F, edge);
        ell(2.5, 0.5, 8, 5.6, 0, F, edge);
        ell(6.4, -1.2, 4.4, 3.6, 0.2, glass(-4, 2));
        if (v.egg || !v.fen) { line(-5, 8.6, 9, 8.6, 1.2, '#2b2b28'); line(-2, 5, -2, 8.6, 1, '#2b2b28'); line(6, 5, 6, 8.6, 1, '#2b2b28'); }
        else { wheel(-2, 8, 1.8); wheel(7, 8, 1.8); }
        rr(-4, 4, 12, 2, 0.8, '#d8dad4', '#666');
        mark(-8, 0, 1.5);
        break;
      }
      poly([[-4, -2.4], [-18, -3], [-18, 0.5], [-4, 3]], F, edge);
      poly([[-18.5, -3], [-16, -10], [-13.5, -3]], F, edge);
      dot(-17.4, -4.6, 2.4, 'rgba(40,40,40,0.25)');
      if (hc === 'cobra') {
        // 窄機身、縱列座艙、滑橇
        poly([[-6, -3.4], [-6, 3.6], [12, 3], [17, 1.4], [16, -0.8], [11, -2.4], [3, -4.6]], F, edge);
        poly([[3, -4.4], [8, -6.6], [14, -1.6], [11, -2.4]], glass(-6.6, -1.6), '#2a3a48');
        line(5, -5.6, 7.6, -2.8, 0.6, '#2a3a48');
        rr(-3, 3.2, 10, 1.6, 0.6, '#3a3a34'); rr(-1, 4.6, 6, 2.2, 1, '#d8dad4', '#666');
        line(-6, 9.4, 11, 9.4, 1.3, '#2b2b28'); line(-3, 4, -3, 9.4, 1, '#2b2b28'); line(7, 4, 7, 9.4, 1, '#2b2b28');
        dot(14.6, 3.6, 1.3, '#2a2a26');
      } else if (hc === 'apache' || hc === 'tiger') {
        poly([[-6, -4.6], [-6, 4.4], [10, 4.4], [16, 2], [16, -0.6], [11, -3], [4, -6.4], [-2, -6.4]], F, edge);
        poly([[3, -6.2], [8, -6.6], [14, -1.8], [10, -2.6]], glass(-6.6, -1.8), '#2a3a48');
        line(7.4, -6.4, 9.6, -2.6, 0.7, '#2a3a48');
        rr(-5, -7.6, 8, 3, 1.4, F, edge);
        rr(-6, 1.4, 12, 2, 0.6, shade(g, -0.3)); rr(-4, 3.6, 8, 2.6, 1, '#3a3a34');
        dot(16.2, 1, 2, '#2a2a26');
        if (hc === 'apache') { wheel(-2, 8.4, 2); wheel(9, 8.4, 2); line(-18, 0.5, -16, 4.6, 0.8, '#2b2b28'); }
        else { wheel(0, 8.4, 1.9); wheel(10, 8.4, 1.9); }
      } else {
        // 雌鹿：大機身、雙氣泡座艙、短翼掛架
        ell(2, 0.6, 12, 6.6, 0, F, edge);
        ell(11, -0.6, 3.4, 2.6, 0.2, glass(-3, 2));
        ell(7.4, -3.6, 3.2, 2.4, 0.2, glass(-6, -1));
        rr(-6, 1.6, 13, 2.2, 0.6, shade(g, -0.35));
        rr(-6, 3.6, 4, 2.4, 1, '#3a3a34'); rr(2, 3.6, 4, 2.4, 1, '#3a3a34');
        wheel(-2, 8.6, 1.9); wheel(9, 8.6, 1.9);
        dot(13.5, 3.6, 1.5, '#2a2a26');
      }
      mark(-11, -0.6, 1.6);
      break;
    }
    // ===================== 固定翼（俯視） =====================
    case 'fighter': case 'attacker': case 'bomber': case 'stealth': case 'airlift': {
      const fillA = paintAir(), ed = airEdge(), gg = fillA(-15, 15);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.save(); c.translate(3, 5); c.scale(0.9, 0.5); c.beginPath(); c.ellipse(0, 0, 16, 12, 0, 0, 7); c.fill(); c.restore();
      const p = v.p || (base === 'fighter' ? (east ? 'mig21' : 'f15') : base === 'attacker' ? (east ? 'su25' : 'jaguar') : base === 'bomber' ? 'tu16' : base === 'stealth' ? 'f117' : 'c130');
      // 上下對稱的外形：只給上半，自動鏡像
      const sym = half => [...half, ...half.slice().reverse().map(([x, y]) => [x, -y])];
      const canopy = (x, w = 3.6) => ell(x, 0, w, 1.4, 0, glass(-1.4, 1.4));
      const intakes = (x0, x1, y, h = 1.6) => { for (const s of [-1, 1]) rr(x0, s > 0 ? y : -y - h, x1 - x0, h, 0.6, 'rgba(25,25,25,0.6)'); };
      const tails = (x0, x1, y) => { for (const s of [-1, 1]) line(x0, s * y, x1, s * (y + 0.6), 1.4, shade(ed, 0.15)); };
      const prop = (x, y, r) => { c.fillStyle = 'rgba(40,40,40,0.25)'; c.beginPath(); c.ellipse(x, y, 1, r, 0, 0, 7); c.fill(); };
      let roundel = [-2, 9, 1.8];
      switch (p) {
        case 'f15':
          poly(sym([[17, 0], [10, -1.6], [5, -3.4], [1, -4], [-3, -13], [-7.5, -13], [-8, -4], [-11, -4], [-12.5, -10], [-16, -10], [-15.5, -2], [-17, -1.2]]), gg, ed);
          intakes(-2, 5, 2.6); tails(-14, -9, 3.2); canopy(9);
          roundel = [-4.5, 8.4, 1.8];
          break;
        case 'flanker':
          poly(sym([[17.5, 0], [12, -1.3], [6, -2], [1, -4.6], [-4, -13], [-7.5, -13], [-8, -4.6], [-11, -4.2], [-13, -10.5], [-16, -10.5], [-14.5, -2], [-18.5, -0.9]]), gg, ed);
          tails(-14, -8, 4.6); canopy(10.5); line(5, 0, -12, 0, 0.6, 'rgba(0,0,0,0.3)');
          roundel = [-5, 8.6, 1.8];
          break;
        case 'f16': case 'f5': case 'at3': {
          const small = p !== 'f16';
          if (p === 'at3') poly(sym([[15, 0], [10, -1.6], [2, -2.2], [1, -13], [-3, -13], [-4, -2.2], [-11, -2], [-12, -7.6], [-15, -7.6], [-15, 0]]), gg, ed);
          else if (small) poly(sym([[17.5, 0], [8, -1.6], [2, -2.4], [-2, -11.5], [-5, -11.5], [-5, -2.4], [-10, -2.4], [-12.5, -7.6], [-15, -7.6], [-15, -1.2], [-16, -0.8]]), gg, ed);
          else poly(sym([[17, 0], [9, -1.8], [4, -2.6], [-3, -12.5], [-6.5, -12.5], [-6.5, -2.8], [-10, -2.8], [-13.5, -8.4], [-16, -8.4], [-15, -1.6], [-16.5, -0.6]]), gg, ed);
          if (v.twin) intakes(-2, 4, 2.2, 1.2);
          canopy(p === 'at3' ? 7 : 9, p === 'at3' ? 4.4 : 3.6);
          line(-8, 0, -16, 0, 1.4, shade(ed, 0.15));
          roundel = [-3, 7.6, 1.6];
          break;
        }
        case 'mig21':
          poly(sym([[18, 0], [11, -1.6], [2, -2.2], [-6, -11], [-9, -11], [-8, -2.2], [-10, -2.2], [-13, -6.4], [-15.5, -6.4], [-15, -1.4], [-16, -1.4]]), gg, ed);
          if (v.big) intakes(1, 6, 2, 1.2);
          canopy(9, 3); line(-10, 0, -16, 0, 1.4, shade(ed, 0.15)); dot(18, 0, 0.8, '#333');
          roundel = [-5, 6.4, 1.6];
          break;
        case 'delta':
          poly(sym([[17.5, 0], [10, -1.8], [4, -2.6], [-9, -13], [-12.5, -13], [-12, -2.4], [-15.5, -1.4]]), gg, ed);
          if (v.canard) poly(sym([[6, -2.4], [3, -6], [1.6, -6], [2.6, -2.4]]), gg, ed);
          canopy(10, 3.4); line(-8, 0, -15, 0, 1.4, shade(ed, 0.15));
          roundel = [-7, 8, 1.8];
          break;
        case 'canard':
          poly(sym([[17.5, 0], [10, -1.8], [3, -2.6], [-8, -12.5], [-12, -12.5], [-12, -2.4], [-15.5, -1.4]]), gg, ed);
          poly(sym([[9, -1.6], [5.6, -6.4], [4, -6.4], [4.6, -1.6]]), gg, ed);
          canopy(11, 3.2); line(-7, 0, -15, 0, 1.4, shade(ed, 0.15));
          roundel = [-6.5, 8, 1.8];
          break;
        case 'f4':
          poly(sym([[17, 0], [10, -2], [4, -3.4], [-2, -11], [-4, -11], [-6, -13.5], [-8.5, -13.5], [-7.5, -3.4], [-11, -3], [-14, -9.5], [-16, -9.5], [-15, -1.6], [-16.5, -1]]), gg, ed);
          intakes(1, 7, 2.6, 1.4); canopy(8.6, 4.4); line(-8, 0, -16, 0, 1.4, shade(ed, 0.15));
          roundel = [-3, 8, 1.8];
          break;
        case 'swing':
          // 可變後掠翼：主翼後掠
          if (v.big) poly(sym([[18.5, 0], [12, -2], [3, -3], [-1, -6], [-10, -16], [-13, -16], [-7, -3], [-13, -3], [-15.5, -9], [-18, -9], [-17, -1]]), gg, ed);
          else poly(sym([[17.5, 0], [10, -2], [4, -3.4], [0, -5.6], [-8, -13.5], [-11, -13.5], [-6, -3.4], [-11, -3.2], [-14, -9.4], [-16.5, -9.4], [-15.5, -1.4]]), gg, ed);
          canopy(v.big ? 13 : 9.6, 3.6); line(-8, 0, -17, 0, 1.4, shade(ed, 0.15));
          roundel = v.big ? [-7, 10, 1.9] : [-5, 8.4, 1.7];
          break;
        case 'hornet':
          poly(sym([[17, 0], [10, -1.8], [4, -2.6], [-1, -12.5], [-5, -12.5], [-6, -3.2], [-10, -3.2], [-12.5, -8.6], [-15.5, -8.6], [-15, -1.4], [-16, -1]]), gg, ed);
          tails(-9, -5, 3.6); canopy(9.4); intakes(-2, 3, 2.6, 1.3);
          roundel = [-3, 8, 1.8];
          break;
        case 'stealth':
          poly(sym([[17, 0], [10, -2.4], [3, -4], [-5, -13], [-9, -13], [-9, -4.6], [-10, -4.6], [-14.5, -9], [-17, -9], [-15, -2.2], [-16, -1]]), gg, ed);
          tails(-12, -7, 3.6); canopy(10, 3.4);
          roundel = [-6, 8, 1.6];
          break;
        case 'a10':
          poly(sym([[16, 0], [10, -1.8], [3, -2], [3, -15], [-2, -15], [-2, -2], [-12, -1.4], [-12, -7], [-15.5, -7], [-15.5, -1]]), gg, ed);
          for (const s of [-1, 1]) { rr(-10, s > 0 ? 1.6 : -4.8, 7, 3.2, 1.5, shade(ed, 0.35), ed); }
          for (const s of [-1, 1]) rr(-15.8, s > 0 ? 5.6 : -7.6, 2.6, 2, 0.6, shade(ed, 0.2));
          for (const y of [-11, -7.5, 7.5, 11]) ell(0, y, 3, 1, 0, '#3c3f33');
          canopy(11, 2.6);
          roundel = [0.5, 12.5, 1.6];
          break;
        case 'su25':
          poly(sym([[17, 0], [11, -1.6], [3, -2.2], [1, -14.5], [-3, -14.5], [-5, -2.4], [-12, -1.6], [-13, -7.2], [-16, -7.2], [-15.5, -0.8]]), gg, ed);
          for (const s of [-1, 1]) rr(-6, s > 0 ? 1.2 : -3.6, 9, 2.4, 1, shade(ed, 0.3), ed);
          for (const y of [-11.5, -8, 8, 11.5]) ell(-1, y, 3, 1, 0, '#3c3f33');
          canopy(11, 2.8);
          roundel = [-1, 11, 1.6];
          break;
        case 'jaguar':
          poly(sym([[17, 0], [10, -1.8], [3, -2.4], [-4, -12], [-7, -12], [-7, -2.4], [-10, -2.4], [-13, -8], [-15.5, -8], [-15, -1.2], [-16, -0.8]]), gg, ed);
          intakes(0, 5, 2.4, 1.2); canopy(9, 3);
          for (const y of [-7.5, 7.5]) ell(-4.5, y, 2.6, 0.9, 0, '#3c3f33');
          roundel = [-5, 9, 1.6];
          break;
        case 'ov10': case 'prop':
          if (p === 'ov10') {
            poly(sym([[14, 0], [9, -1.8], [4, -2], [4, -15], [0.5, -15], [0.5, -2], [-4, -1.4], [-4, 0]]), gg, ed);
            for (const s of [-1, 1]) { rr(-14, s * 5 - 0.9, 20, 1.8, 0.8, gg, ed); prop(7, s * 5, 4); }
            rr(-15, -6.6, 2.4, 13.2, 0.6, gg, ed);
          } else {
            poly(sym([[15, 0], [10, -1.8], [3, -2], [2, -14.5], [-1.5, -14.5], [-3, -2], [-12, -1.4], [-12.5, -6.4], [-15, -6.4], [-15, 0]]), gg, ed);
            prop(16, 0, 5);
          }
          canopy(8, 3.6);
          roundel = [1.6, 11, 1.5];
          break;
        case 'tu16':
          poly(sym([[18.5, 0], [12, -1.8], [4, -2.2], [-4, -16], [-8, -16], [-6, -2.4], [-13, -2], [-15.5, -8.4], [-18, -8.4], [-17, -1]]), gg, ed);
          for (const s of [-1, 1]) rr(-6, s > 0 ? 1.8 : -5.2, 10, 3.4, 1.6, shade(ed, 0.35), ed);
          canopy(13, 2.4); dot(17, 0, 1, glass(-1, 1));
          roundel = [-6, 11, 1.8];
          break;
        case 'b2':
          poly([[12, 0], [-2, -16], [-6, -14], [-4, -10], [-8, -7], [-6, -3.5], [-9, 0], [-6, 3.5], [-8, 7], [-4, 10], [-6, 14], [-2, 16]], gg, ed);
          line(-4, -4, 6, -1.4, 0.6, 'rgba(255,255,255,0.15)'); line(-4, 4, 6, 1.4, 0.6, 'rgba(255,255,255,0.15)');
          roundel = null;
          break;
        case 'f117':
          poly([[14, 0], [-8, -14], [-12, -14], [-9, -6], [-14, -3.5], [-12, 0], [-14, 3.5], [-9, 6], [-12, 14], [-8, 14]], gg, ed);
          line(-10, 0, 10, 0, 0.6, '#55585e'); line(-5, -6, 5, -1.5, 0.5, '#4a4d52'); line(-5, 6, 5, 1.5, 0.5, '#4a4d52');
          roundel = null;
          break;
        case 'jet':
          poly(sym([[17, 0], [13, -2.6], [2, -3], [-3, -16], [-6, -16], [-6, -3], [-12, -2.6], [-14, -2], [-14.5, -8], [-17, -8], [-17, 0]]), gg, ed);
          for (const y of [-11, -6.5, 6.5, 11]) rr(-3.6, y - 1, 5, 2, 0.8, shade(ed, 0.3));
          ell(14, 0, 2.4, 1.4, 0, '#3a6585');
          roundel = [-5, 9, 1.7];
          break;
        default: {
          // 螺旋槳運輸機（C-130／運-8；twin＝雙發）
          poly(sym([[16, 0], [12, -3.2], [-12, -3.2], [-15, -7], [-17.5, -7], [-16.5, 0]]), gg, ed);
          poly(sym([[3, -3.2], [2, -16], [-2.5, -16], [-3, -3.2]]), gg, ed);
          const eng = v.p === 'twin' ? [-7.5] : [-12, -7];
          for (const y of [...eng, ...eng.map(e => -e)]) { rr(1, y - 1.2, 5, 2.4, 1, shade(ed, 0.3)); prop(6.4, y, 2.8); }
          ell(12, 0, 2.6, 1.4, 0, '#3a6585');
          roundel = [-1, 12.5, 1.7];
        }
      }
      if (roundel) { mark(roundel[0], -roundel[1], roundel[2]); mark(roundel[0], roundel[1], roundel[2]); }
      break;
    }
    // ===================== 艦艇（側視） =====================
    case 'destroyer': case 'carrier': case 'lst': {
      const g = L.navy, hullF = lgrad(c, 0, 0, 0, 7.5, [[0, shade(g, 0.15)], [1, shade(g, -0.45)]]), ed = '#3b4045';
      const sup = (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, shade(g, 0.3)], [1, shade(g, -0.2)]]);
      const wake = () => { c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(-19, 7.5); c.lineTo(17, 7.5); c.lineTo(19, 9); c.lineTo(-18, 9.5); c.closePath(); c.fill(); };
      const turret = (x, y, facing = 1, twin = false) => {
        rr(x - 2.4, y - 2.4, 4.8, 2.6, 1.2, sup(y - 2.4, y), ed);
        line(x + facing * 2, y - 1.4, x + facing * 6.5, y - 2, twin ? 1.4 : 1, ed);
      };
      const mast = (x, y, h, yard = 3) => { line(x, y, x, y - h, 1.1, ed); line(x - yard, y - h + 2.6, x + yard, y - h + 2.6, 0.9, ed); };
      const flag = (x, y) => { line(x, y, x, y - 4, 0.6, '#333'); mark(x - 2, y - 3.2, 1.3); };
      wake();
      if (base === 'carrier') {
        const big = v.big;
        poly([[-18, 1], [16, 1], [19, -1], [18, 3], [13, 7], [-15, 7]], hullF, ed);
        if (v.cv === 'ski') poly([[-19, -1.5], [12, -1.5], [19, -4.6], [19, 1], [-19, 1]], '#5a5e62', '#33373a');
        else poly([[-19, -1.5], [19, -1.5], [19, 1], [-19, 1]], '#5a5e62', '#33373a');
        line(-17, -0.3, 15, -0.3, 0.5, 'rgba(255,255,255,0.7)');
        const islands = v.twin ? [[-4, 4], [5, 4]] : [[big ? 3 : 4, 5]];
        for (const [x, w] of islands) { rr(x, -8.5, w, 7, 1, sup(-8.5, -1.5), ed); line(x + w / 2, -8.5, x + w / 2, -12.5, 1, ed); }
        c.fillStyle = '#2f3336';
        for (const x of [-14, -8]) { c.beginPath(); c.moveTo(x, -2.6); c.lineTo(x + 4, -1.6); c.lineTo(x, -0.6); c.closePath(); c.fill(); }
        mark(-11, 4, 1.6);
        break;
      }
      if (base === 'lst') {
        poly([[-17, 0], [13, 0], [17, 3], [14, 7.5], [-14, 7.5]], hullF, ed);
        if (v.newport) { line(10, 0, 18, -7, 1.2, ed); line(14, 0, 18, -7, 1.2, ed); }
        if (v.lsd) { rr(-17, -6, 22, 6, 1, sup(-6, 0), ed); rr(-2, -11, 7, 5, 1, sup(-11, -6), ed); mast(1.5, -11, 4); }
        else {
          rr(-16, -7, 8, 7, 1, sup(-7, 0), ed); mast(-12, -7, 5);
          for (const x of [-5, 0, 5]) rr(x, -3, 4, 3, 0.8, CAMO(-3, 0), '#2a2a26');
          line(13, 0, 17, -4, 1.4, ed);
        }
        mark(-4, 4, 1.5);
        break;
      }
      const s = v.s || 'frigate';
      if (s === 'patrol') {
        c.save(); c.scale(0.8, 0.8); c.translate(0, 2);
        poly([[-17, 2], [18, 1], [13, 7.5], [-15, 7.5]], hullF, ed);
        poly([[-6, 2], [-6, -3], [6, -3], [9, 2]], sup(-3, 2), ed);
        mast(1, -3, 7); turret(12, 1.6);
        rr(-14, -1, 6, 2.6, 1, '#cfd2cc', '#555');
        c.restore();
        flag(-16, 1);
        break;
      }
      poly([[-17, 1], [18, s === 'sovr' ? -0.6 : 1], [13, 7.5], [-14, 7.5]], hullF, ed);
      line(-14, 5, 14, 5, 0.6, 'rgba(0,0,0,0.25)');
      if (s === 'aegis') {
        // 神盾艦：前方塔型上層結構與相位陣列雷達
        poly([[-12, 1], [-12, -3], [-2, -3], [-1, -9], [6, -9], [8, -3], [9, 1]], sup(-9, 1), ed);
        poly([[0.6, -8], [4.2, -8], [4.6, -4.6], [0.2, -4.6]], '#6c757c', ed);
        line(3, -9, 3, -15, 1.2, ed); line(0, -13, 6, -13, 0.9, ed);
        rr(-9, -5.6, 3.6, 2.6, 0.8, sup(-5.6, -3), ed);
        turret(13, 1, 1);
        rr(-14, -1.6, 3, 2.6, 0.8, sup(-1.6, 1), ed);
      } else if (s === 'spru') {
        poly([[-12, 1], [-12, -4.5], [8, -4.5], [9, 1]], sup(-4.5, 1), ed);
        rr(-4, -9, 9, 4.5, 0.8, sup(-9, -4.5), ed);
        rr(-9, -8.5, 3, 4, 0.6, '#5f666c', ed); rr(1, -11, 3, 2, 0.6, '#5f666c', ed);
        mast(6, -9, 6); turret(13, 1); turret(-14, 1, -1);
      } else if (s === 'sovr') {
        poly([[-11, 1], [-11, -4], [-6, -4], [-5, -8], [3, -8], [5, -4], [10, -3], [10, 1]], sup(-8, 1), ed);
        rr(-3, -11, 3, 3, 0.8, '#5f666c', ed);
        mast(3, -8, 8, 3.4); ell(3, -14.5, 2.4, 1, 0, '#c7cdd1', ed);
        mast(-8, -4, 5);
        turret(14, 0, 1, true); turret(-13.5, 1, -1, true);
      } else if (s === 'ww2') {
        poly([[-10, 1], [-10, -2.6], [5, -2.6], [7, 1]], sup(-2.6, 1), ed);
        rr(3, -6.6, 4.6, 4, 0.8, sup(-6.6, -2.6), ed);
        for (const x of [-6, -1]) rr(x, -7, 2.6, 4.6, 0.6, '#5f666c', ed);
        mast(6, -6.6, 7); turret(11.6, 1, 1, true); turret(-13, 1, -1, true);
      } else {
        // 一般巡防艦：艦砲在前、上層結構居中、直升機庫在後
        poly([[-12, 1], [-12, -4], [-1, -4], [-1, -7.5], [5, -7.5], [7, 1]], sup(-7.5, 1), ed);
        rr(-3, -6, 2.6, 3, 0.6, '#5f666c', ed);
        mast(2.5, -7.5, 7); dot(2.5, -15, 1.5, '#c7cdd1');
        turret(12, 1);
        rr(-15, -1.6, 3.6, 2.6, 0.8, sup(-1.6, 1), ed);
      }
      flag(-16, 1);
      break;
    }
    // ===================== 卡車與列車 =====================
    case 'truck': {
      shadowE(17, 10.5);
      const over = v.cab === 'over';
      poly([[-16, 3], [-16, -8], [over ? 4 : 2, -8], [over ? 4 : 2, 3]], CAMO(-8, 3), edge);
      line(-15, -5, 1, -5, 0.6, 'rgba(0,0,0,0.3)'); line(-15, -2, 1, -2, 0.6, 'rgba(0,0,0,0.3)');
      if (over) {
        poly([[5, 3], [5, -8], [14, -8], [16, -5], [16, 3]], CAMO(-8, 3), edge);
        rr(12, -7, 3.4, 3, 0.6, glass(-7, -4));
      } else {
        poly([[3, 3], [3, -7], [8.5, -7], [9.5, -2.5], [16.5, -2], [16.5, 3]], CAMO(-7, 3), edge);
        rr(5, -6, 3.4, 2.8, 0.6, glass(-6, -3.2));
      }
      for (const x of [-12, -6, 12]) wheel(x, 6, 3.6);
      mark(-7, -2.6, 1.7);
      break;
    }
    case 'train': {
      const LOCO = { TW: ['#e08a2a', '#7a4010'], CN: ['#2f6a3f', '#163a22'], US: ['#2f4a7a', '#141f38'], JP: ['#c43d32', '#5a1510'], KR: ['#2f6fb0', '#103058'],
        KP: ['#3a6a4a', '#1a3022'], PH: ['#d8a43a', '#6a4810'], VN: ['#2f6a8a', '#14303e'], RU: ['#3f7a4f', '#1a3a22'], IN: ['#2f5aa0', '#123060'],
        PK: ['#2f7a4a', '#123a22'], GB: ['#2f5a8a', '#13284a'], FR: ['#2f5aa0', '#132a50'], DE: ['#b8322c', '#4a1310'], AU: ['#d8a43a', '#6a4810'], IL: ['#3f5f8a', '#18283e'] };
      const [lc, ld] = LOCO[nid] || LOCO.TW;
      rr(-17, 5, 34, 2, 0.5, '#3b3b3b');
      rr(-17, -7, 14, 11, 1.5, CAMO(-7, 4), edge);
      poly([[-1, 4], [-1, -9], [12, -9], [16, -4], [16, 4]], lgrad(c, 0, -9, 0, 4, [[0, lc], [1, ld]]), shade(ld, -0.4));
      rr(10, -7.5, 4, 3, 0.6, glass(-7.5, -4.5));
      line(-1, -1, 16, -1, 1, '#f2e8c8');
      for (const x of [-14, -7, 2, 8, 13]) wheel(x, 6, 2.4);
      break;
    }
  }
}

// ----- 快取：每種型號畫一次（4 倍解析度），之後直接貼圖 -----
const ICON_CACHE = {};
const ICON_W = 48, ICON_H = 36, ICON_S = 4;
function iconImage(d, flip) {
  const k = `${d.nation}|${d.base}|${d.model}|${flip ? 1 : 0}`;
  let cv = ICON_CACHE[k];
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = ICON_W * ICON_S; cv.height = ICON_H * ICON_S;
    const g = cv.getContext('2d');
    g.scale(ICON_S, ICON_S); g.translate(ICON_W / 2, ICON_H / 2);
    if (flip) g.scale(-1, 1);
    drawIcon(g, d, flip);
    ICON_CACHE[k] = cv;
  }
  return cv;
}
