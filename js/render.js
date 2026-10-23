'use strict';
// ===== 繪圖：地形、部隊、特效、小地圖 =====

const R = 32;               // 六角格外接圓半徑
const HW = R * SQ3 / 2;     // 半寬
let TS = 2;                 // 地形底圖解析度倍率（大地圖自動降低）
const cam = { x: 0, y: 0, z: 1 };
const FX = [];
let cvs, ctx, mini, mctx, terrainCvs = null, dpr = 1;

function tileCenter(x, y) { return [2 * HW * x + HW * (y & 1) + HW, 1.5 * R * y + R]; }
function idxCenter(i) { const [x, y] = ixy(i); return tileCenter(x, y); }
function worldSize() { return [2 * HW * G.w + HW, 1.5 * R * (G.h - 1) + 2 * R]; }
function pixelToTile(px, py) {
  px -= HW; py -= R;
  const qf = (SQ3 / 3 * px - py / 3) / R, rf = (2 / 3 * py) / R, sf = -qf - rf;
  let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return [q + (r - (r & 1)) / 2, r];
}
function hexPath(c, cx, cy, r) {
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 180 * (60 * k - 90);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    k ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}
function hash(i) {
  let x = ((i + 1) * 2654435761) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };

// ----- 地形底圖（開局時繪製一次） -----
const TCOLOR = {
  plain: '#a7c66c', road: '#a7c66c', rail: '#a7c66c', forest: '#88b05b', hills: '#c4b674', mountain: '#a8987c',
  sea: '#4683c2', bridge: '#4683c2', city: '#b9c98e', capital: '#bccb92', factory: '#b9c98e',
  airport: '#b9c98e', port: '#b9c98e',
};

function buildTerrain() {
  const [ww, wh] = worldSize();
  TS = Math.max(0.8, Math.min(2, Math.sqrt(14e6 / (ww * wh))));
  terrainCvs = document.createElement('canvas');
  terrainCvs.width = Math.ceil(ww * TS); terrainCvs.height = Math.ceil(wh * TS);
  const c = terrainCvs.getContext('2d');
  c.scale(TS, TS);
  c.fillStyle = '#2f629a'; c.fillRect(0, 0, ww, wh);
  const N = G.w * G.h;
  for (let i = 0; i < N; i++) {
    const [cx, cy] = idxCenter(i), t = G.terrain[i];
    hexPath(c, cx, cy, R + 0.6);
    c.fillStyle = shade(TCOLOR[t], (hash(i) - 0.5) * 0.08);
    c.fill();
  }
  // 道路與橋樑（只畫實際鋪設的路段）
  c.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (const [a, b] of G.roads || []) {
      const [ax, ay] = idxCenter(a), [bx, by] = idxCenter(b), mx = (ax + bx) / 2, my = (ay + by) / 2;
      for (const [i, sx, sy] of [[a, ax, ay], [b, bx, by]]) {
        const bridge = G.terrain[i] === 'bridge';
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(mx, my);
        if (pass === 0) { c.strokeStyle = bridge ? '#4a3523' : '#7b6a4c'; c.lineWidth = bridge ? 11 : 8; }
        else { c.strokeStyle = bridge ? '#a9855a' : '#e4d6a8'; c.lineWidth = bridge ? 8 : 5; }
        c.stroke();
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const [cx, cy] = idxCenter(i);
    drawDeco(c, G.terrain[i], cx, cy, i);
  }
  // 鐵路：枕木＋雙軌
  for (const [a2, b2] of G.rails || []) {
    const [ax, ay] = idxCenter(a2), [bx, by] = idxCenter(b2), len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    c.strokeStyle = '#5a4630'; c.lineWidth = 2;
    for (let t = 3; t < len; t += 5) {
      const px = ax + ux * t, py = ay + uy * t;
      c.beginPath(); c.moveTo(px - uy * 4, py + ux * 4); c.lineTo(px + uy * 4, py - ux * 4); c.stroke();
    }
    c.strokeStyle = '#3b3b3b'; c.lineWidth = 1.3;
    for (const off of [-2.2, 2.2]) { c.beginPath(); c.moveTo(ax - uy * off, ay + ux * off); c.lineTo(bx - uy * off, by + ux * off); c.stroke(); }
  }
  c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 1;
  for (let i = 0; i < N; i++) { const [cx, cy] = idxCenter(i); hexPath(c, cx, cy, R); c.stroke(); }
}

function drawDeco(c, t, cx, cy, i) {
  const rr = k => hash(i * 13 + k);
  c.save();
  switch (t) {
    case 'forest': {
      const spots = [[-11, -6], [7, -10], [-2, 4], [12, 3], [-9, 12], [5, 13]];
      const n = 4 + Math.floor(rr(0) * 3);
      for (let k = 0; k < n; k++) {
        const x = cx + spots[k][0] + (rr(k + 1) - 0.5) * 4, y = cy + spots[k][1] + (rr(k + 9) - 0.5) * 4;
        c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + 2, y + 6, 6, 2.5, 0, 0, 7); c.fill();
        c.fillStyle = '#3b6d30'; circle(c, x, y, 7.5); c.fill();
        c.fillStyle = '#5a9442'; circle(c, x - 2, y - 2, 4); c.fill();
      }
      break;
    }
    case 'hills': {
      for (const [ox, oy, s] of [[-8, 5, 12], [9, -4, 10]]) {
        const x = cx + ox, y = cy + oy;
        c.beginPath(); c.moveTo(x - s, y + 5); c.quadraticCurveTo(x, y - s * 1.2, x + s, y + 5); c.closePath();
        c.fillStyle = '#ab9b5a'; c.fill();
        c.strokeStyle = '#7d713f'; c.lineWidth = 1.5; c.stroke();
      }
      break;
    }
    case 'mountain': {
      const peak = (x, y, s) => {
        c.beginPath(); c.moveTo(x - s, y + s * 0.8); c.lineTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.closePath();
        c.fillStyle = '#867864'; c.fill();
        c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s, y + s * 0.8); c.lineTo(x + s * 0.15, y + s * 0.8); c.closePath();
        c.fillStyle = '#6b604e'; c.fill();
        c.beginPath(); c.moveTo(x - s * 0.36, y - s * 0.28); c.lineTo(x, y - s); c.lineTo(x + s * 0.36, y - s * 0.28);
        c.lineTo(x + s * 0.12, y - s * 0.42); c.lineTo(x - s * 0.08, y - s * 0.22); c.closePath();
        c.fillStyle = '#f4f2ea'; c.fill();
      };
      peak(cx + 9, cy - 1, 11); peak(cx - 6, cy + 3, 14);
      break;
    }
    case 'sea': case 'bridge': {
      c.strokeStyle = 'rgba(255,255,255,0.32)'; c.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const x = cx + (rr(k) - 0.5) * 30, y = cy + (rr(k + 5) - 0.5) * 28;
        c.beginPath(); c.arc(x - 4, y, 4, Math.PI * 1.15, Math.PI * 1.85); c.arc(x + 4, y, 4, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      }
      break;
    }
    case 'city': {
      for (const [ox, oy, w, h] of [[-14, -2, 9, 12], [-4, -10, 9, 20], [6, -3, 9, 13]]) {
        c.fillStyle = '#e8e2d3'; c.fillRect(cx + ox, cy + oy, w, h);
        c.strokeStyle = '#5b5548'; c.lineWidth = 1.2; c.strokeRect(cx + ox, cy + oy, w, h);
        c.fillStyle = '#5d7590';
        for (let wy = oy + 3; wy < oy + h - 2; wy += 4) { c.fillRect(cx + ox + 2, cy + wy, 2, 2); c.fillRect(cx + ox + 5, cy + wy, 2, 2); }
      }
      break;
    }
    case 'capital': {
      c.fillStyle = '#efe6cf'; c.strokeStyle = '#5b5548'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(cx, cy - 4, 9, Math.PI, 0); c.closePath(); c.fillStyle = '#d6bf7c'; c.fill(); c.stroke();
      c.fillStyle = '#efe6cf'; c.fillRect(cx - 16, cy - 4, 32, 15); c.strokeRect(cx - 16, cy - 4, 32, 15);
      c.strokeStyle = '#8a8170';
      for (let k = -12; k <= 12; k += 6) { c.beginPath(); c.moveTo(cx + k, cy - 1); c.lineTo(cx + k, cy + 9); c.stroke(); }
      c.strokeStyle = '#5b5548'; c.beginPath(); c.moveTo(cx, cy - 13); c.lineTo(cx, cy - 19); c.stroke();
      c.fillStyle = '#e0b54a'; circle(c, cx, cy - 20, 2.2); c.fill();
      break;
    }
    case 'factory': {
      c.fillStyle = '#7a6f62'; c.fillRect(cx + 7, cy - 17, 5, 14);
      c.fillStyle = 'rgba(220,220,220,0.7)'; circle(c, cx + 11, cy - 21, 3); c.fill(); circle(c, cx + 15, cy - 25, 2.3); c.fill();
      c.fillStyle = '#cbc3b3'; c.strokeStyle = '#5b5548'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(cx - 15, cy + 9); c.lineTo(cx - 15, cy - 4);
      for (let k = 0; k < 3; k++) { const x0 = cx - 15 + k * 10; c.lineTo(x0, cy - 11); c.lineTo(x0 + 10, cy - 4); }
      c.lineTo(cx + 15, cy + 9); c.closePath(); c.fill(); c.stroke();
      break;
    }
    case 'airport': {
      c.translate(cx, cy); c.rotate(-0.52);
      c.fillStyle = '#6b6b6b'; c.fillRect(-23, -5, 46, 10);
      c.fillStyle = '#fff'; for (let k = -18; k < 18; k += 8) c.fillRect(k, -1, 4, 2);
      c.setTransform(1, 0, 0, 1, 0, 0); c.scale(TS, TS);
      c.fillStyle = '#ddd'; c.strokeStyle = '#555'; c.lineWidth = 1;
      c.fillRect(cx + 8, cy + 4, 6, 9); c.strokeRect(cx + 8, cy + 4, 6, 9);
      c.fillStyle = '#7fb4d8'; c.fillRect(cx + 7, cy + 2, 8, 3);
      break;
    }
    case 'port': {
      c.fillStyle = '#8a6a44'; c.fillRect(cx - 18, cy + 5, 36, 6);
      c.strokeStyle = '#1f3550'; c.lineWidth = 2.2; c.lineCap = 'round';
      circle(c, cx, cy - 12, 3); c.stroke();
      c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx, cy + 2); c.moveTo(cx - 5, cy - 6); c.lineTo(cx + 5, cy - 6); c.stroke();
      c.beginPath(); c.arc(cx, cy - 4, 8, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      break;
    }
  }
  c.restore();
}

// ----- 部隊圖示（寫實風，車頭朝右） -----
function lgrad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function drawIcon(c, type, camo, style) {
  const east = style === 'east';
  const poly = (pts, fill, stroke) => {
    c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.8; c.stroke(); }
  };
  const rr = (x, y, w, h, r, fill, stroke) => {
    roundRect(c, x, y, w, h, r); c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.8; c.stroke(); }
  };
  const dot = (x, y, r, fill) => { circle(c, x, y, r); c.fillStyle = fill; c.fill(); };
  const line = (x1, y1, x2, y2, w, col) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke(); };
  const hi = shade(camo, 0.28), lo = shade(camo, -0.38), mid = camo, edge = shade(camo, -0.6);
  const body = (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, hi], [0.45, mid], [1, lo]]);
  const metal = (y0, y1) => lgrad(c, 0, y0, 0, y1, [[0, '#9a9a92'], [0.5, '#5d5d58'], [1, '#2e2e2b']]);
  const shadowE = (w, y) => { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(0, y, w, 2.6, 0, 0, 7); c.fill(); };
  const tracks = (x0 = -17, w = 34, nw = 6) => {
    rr(x0, 2.5, w, 8.5, 4.2, lgrad(c, 0, 2.5, 0, 11, [[0, '#4a4a46'], [1, '#1d1d1b']]));
    const step = (w - 8) / (nw - 1);
    for (let k = 0; k < nw; k++) {
      const x = x0 + 4 + k * step;
      dot(x, 7, 2.6, '#262624'); dot(x, 7, 1.7, '#55554f'); dot(x, 7, 0.6, '#222');
    }
  };
  const wheel = (x, y, r) => { dot(x, y, r, '#1c1c1a'); dot(x, y, r * 0.55, '#6a6a62'); dot(x, y, r * 0.2, '#222'); };
  const soldier = (ox, s, kneel, launcher) => {
    c.save(); c.translate(ox, 0); c.scale(s, s);
    const uni = body(-10, 10);
    // 腿
    if (kneel) { poly([[-3, 3], [3, 3], [6, 10], [3, 10.5], [0, 6], [-2, 10.5], [-5, 10.5]], lo); }
    else { poly([[-3, 2], [0, 2], [-1, 10.5], [-4, 10.5]], lo); poly([[0, 2], [3, 2], [4.5, 10.5], [1.5, 10.5]], lo); }
    // 軀幹與背包
    rr(-4, -4, 7.5, 8, 2, uni, edge);
    rr(-6.5, -3.5, 3, 6, 1.2, shade(camo, -0.2));
    // 頭與鋼盔
    dot(0, -6.6, 2.5, '#d9b48f');
    c.beginPath();
    if (east) { c.moveTo(-4.2, -6.4); c.quadraticCurveTo(0, -12.5, 4.2, -6.4); c.closePath(); }
    else { c.ellipse(0, -7.6, 3.8, 3.1, 0, Math.PI, 0); c.closePath(); }
    c.fillStyle = lgrad(c, 0, -11, 0, -6, [[0, hi], [1, lo]]); c.fill();
    if (launcher) {
      rr(-12, -7.5, 25, 3.6, 1.6, lgrad(c, 0, -7.5, 0, -4, [[0, '#7c8455'], [1, '#3c4128']]), '#1e2114');
      poly([[13, -8.4], [17.5, -5.7], [13, -3]], '#2e3320');
    } else {
      line(-4, 1.5, 12, -2.5, 1.6, '#1b1b18');
      line(9, -1.8, 9.5, 1, 1.4, '#1b1b18');
      line(0, -1, 6, -0.6, 2.4, uni);
    }
    c.restore();
  };
  switch (type) {
    case 'inf':
      c.globalAlpha = 0.85; soldier(-7, 0.85, false, false); c.globalAlpha = 1; soldier(3.5, 1, false, false);
      break;
    case 'atinf':
      soldier(-1, 1.05, true, true);
      break;
    case 'marine': {
      // 兩棲突擊車破浪
      c.fillStyle = 'rgba(80,140,200,0.55)'; c.beginPath(); c.ellipse(0, 8, 18, 3.5, 0, 0, 7); c.fill();
      poly([[-16, 6], [-16, -3], [-12, -6], [11, -6], [17, 0], [15, 6]], body(-6, 6), edge);
      rr(-7, -10, 9, 4.5, 1.2, body(-10, -6), edge);
      line(2, -8, 9, -8.5, 1.6, '#2a2a26');
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (const x of [14, 16.5, 12]) { c.beginPath(); c.arc(x, 6.5, 1.4, 0, 7); c.fill(); }
      line(-16, 8.3, 16, 8.3, 1, 'rgba(255,255,255,0.7)');
      break;
    }
    case 'recon': {
      shadowE(17, 10.5);
      const n = east ? [-11, -3.5, 4, 11.5] : [-10, 0, 10];
      poly([[-16, 4], [-15, -2], [-8, -4.5], [-3, -9], [6, -9], [9, -4], [16, -2.5], [16.5, 4]], body(-9, 4), edge);
      rr(-3, -7.5, 8, 2.6, 1, 'rgba(30,40,50,0.65)');
      if (!east) { rr(-2, -12, 8, 3.6, 1.2, body(-12, -8), edge); line(5, -10.3, 15, -10.8, 1.8, '#2b2b27'); }
      else line(-12, -4, -15, -13, 0.9, '#222');
      for (const x of n) wheel(x, 6, 4);
      break;
    }
    case 'tank': {
      shadowE(18, 10.8);
      tracks();
      if (east) {
        poly([[-17, 3], [-13, -2], [13, -2], [17.5, 3]], body(-2, 3), edge);
        c.beginPath(); c.ellipse(-1.5, -2, 9.5, 7, 0, Math.PI, 0); c.closePath();
        c.fillStyle = lgrad(c, 0, -9, 0, -2, [[0, hi], [1, lo]]); c.fill(); c.strokeStyle = edge; c.lineWidth = 0.8; c.stroke();
        rr(6, -6.6, 13, 2.8, 1, metal(-6.6, -3.8));
        dot(-3, -6.6, 1.4, edge);
      } else {
        poly([[-17, 3], [-14, -2.5], [13, -2.5], [17.5, 3]], body(-2.5, 3), edge);
        poly([[-11, -2.5], [-10, -8.5], [6, -8.5], [10, -2.5]], lgrad(c, 0, -8.5, 0, -2.5, [[0, hi], [1, lo]]), edge);
        rr(8, -7.2, 12, 2.6, 1, metal(-7.2, -4.6));
        rr(18.5, -7.6, 2.2, 3.4, 0.6, '#3a3a36');
        rr(-7, -10.5, 5, 2.2, 1, edge);
      }
      break;
    }
    case 'arty': {
      shadowE(18, 10.8);
      tracks();
      poly([[-17, 3], [-15, -2], [14, -2], [17, 3]], body(-2, 3), edge);
      rr(-13, -11, 16, 9.5, 1.6, lgrad(c, 0, -11, 0, -1.5, [[0, hi], [1, lo]]), edge);
      c.save(); c.translate(2, -8); c.rotate(-0.48);
      rr(0, -1.8, 17, 3.6, 1, metal(-1.8, 1.8)); rr(15, -2.6, 3.6, 5.2, 1, '#2f2f2b');
      c.restore();
      break;
    }
    case 'rocket': {
      shadowE(18, 10.8);
      rr(-16, 0, 32, 4.5, 1, '#2f302a');
      poly([[8, 1], [8, -7], [13, -7], [17, -2], [17, 2]], body(-7, 2), edge);
      rr(12, -5.6, 3.6, 2.6, 0.6, 'rgba(150,190,220,0.85)');
      c.save(); c.translate(-4, -1.5); c.rotate(-0.33);
      rr(-12, -8.5, 20, 8.5, 1.4, body(-8.5, 0), edge);
      c.fillStyle = '#1b1b19';
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(7.2, -6.8 + k * 1.9 + r * 0.01, 0.75, 0, 7); c.fill(); }
      c.restore();
      for (const x of [-11, -4, 12]) wheel(x, 7, 3.6);
      break;
    }
    case 'aa': {
      shadowE(18, 10.8);
      tracks();
      poly([[-17, 3], [-14, -2], [14, -2], [17, 3]], body(-2, 3), edge);
      rr(-7, -9, 13, 7.5, 2, lgrad(c, 0, -9, 0, -1.5, [[0, hi], [1, lo]]), edge);
      c.save(); c.translate(4, -7); c.rotate(-0.95);
      rr(0, -3.2, 15, 1.9, 0.6, metal(-3.2, -1.3)); rr(0, 1.3, 15, 1.9, 0.6, metal(1.3, 3.2));
      c.restore();
      c.beginPath(); c.ellipse(-9, -12, 5, 2.2, -0.3, 0, 7); c.fillStyle = '#c9ccc5'; c.fill(); c.strokeStyle = '#555'; c.lineWidth = 0.7; c.stroke();
      line(-9, -12, -7, -9, 1.2, '#444');
      break;
    }
    case 'sam': {
      shadowE(18, 10.8);
      rr(-16, 0, 32, 4.5, 1, '#2f302a');
      poly([[9, 1], [9, -6], [13, -6], [17, -2], [17, 2]], body(-6, 2), edge);
      rr(12.5, -4.8, 3.4, 2.4, 0.6, 'rgba(150,190,220,0.85)');
      c.save(); c.translate(-6, -2); c.rotate(-0.55);
      for (const oy of [-7.5, -3]) {
        rr(-3, oy, 16, 3.2, 1.5, lgrad(c, 0, oy, 0, oy + 3.2, [[0, '#ffffff'], [1, '#b9bdb8']]), '#777');
        poly([[13, oy], [18, oy + 1.6], [13, oy + 3.2]], '#c43d32');
        poly([[-3, oy - 1.4], [0.5, oy], [0.5, oy + 3.2], [-3, oy + 4.6]], '#888');
      }
      c.restore();
      for (const x of [-11, -4, 12]) wheel(x, 7, 3.6);
      break;
    }
    case 'heli': {
      const g = east ? '#6f7a5a' : camo;
      shadowE(14, 13);
      c.fillStyle = 'rgba(40,40,40,0.25)'; c.beginPath(); c.ellipse(1, -9.5, 19, 2.2, 0, 0, 7); c.fill();
      line(1, -9.5, 1, -5, 2, '#2a2a28');
      poly([[-4, -2], [-18, -3], [-18, 0.5], [-4, 3]], lgrad(c, 0, -3, 0, 3, [[0, shade(g, 0.25)], [1, shade(g, -0.35)]]));
      poly([[-18.5, -3], [-16, -9.5], [-13.5, -3]], shade(g, -0.2));
      c.beginPath(); c.ellipse(east ? 2 : 3, 0.5, east ? 11 : 9.5, east ? 6.6 : 5.6, 0, 0, 7);
      c.fillStyle = lgrad(c, 0, -6, 0, 6, [[0, shade(g, 0.3)], [0.5, g], [1, shade(g, -0.4)]]); c.fill();
      c.strokeStyle = shade(g, -0.6); c.lineWidth = 0.8; c.stroke();
      c.beginPath(); c.ellipse(east ? 8.5 : 8, -1.4, 4.2, 2.8, 0.2, 0, 7);
      c.fillStyle = lgrad(c, 0, -4, 0, 1.5, [[0, '#d9eefc'], [1, '#3d6a8c']]); c.fill();
      rr(-2, 3.5, 10, 2, 0.8, '#2d2d2a');
      rr(east ? -5 : -1, 5, 5, 2.6, 1.2, '#454540');
      line(-4, 9.5, 11, 9.5, 1.3, '#2b2b28'); line(-1, 6, -1, 9.5, 1, '#2b2b28'); line(8, 6, 8, 9.5, 1, '#2b2b28');
      break;
    }
    case 'fighter': case 'attacker': case 'bomber': case 'stealth': {
      const g = type === 'stealth' ? '#2a2c30' : east ? '#9aa6ab' : '#8c949a';
      const gg = lgrad(c, 0, -14, 0, 14, [[0, shade(g, 0.3)], [0.5, g], [1, shade(g, -0.35)]]);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.save(); c.translate(3, 5); c.scale(0.9, 0.5);
      c.beginPath(); c.ellipse(0, 0, 16, 12, 0, 0, 7); c.fill(); c.restore();
      let pts;
      if (type === 'fighter') {
        pts = east
          ? [[17, 0], [12, -2], [3, -2.5], [-5, -13], [-9, -13], [-6, -2.5], [-12, -2.5], [-15, -8], [-17, -8], [-16, 0], [-17, 8], [-15, 8], [-12, 2.5], [-6, 2.5], [-9, 13], [-5, 13], [3, 2.5], [12, 2]]
          : [[17, 0], [8, -2.6], [2, -3], [-4, -13], [-9, -13], [-6, -3], [-12, -3], [-13, -8.5], [-16.5, -8.5], [-15, -1.5], [-15, 1.5], [-16.5, 8.5], [-13, 8.5], [-12, 3], [-6, 3], [-9, 13], [-4, 13], [2, 3], [8, 2.6]];
      } else if (type === 'attacker') {
        pts = [[15, 0], [10, -2.6], [4, -2.6], [2, -15], [-3, -15], [-4, -2.6], [-12, -2.6], [-13, -7], [-16.5, -7], [-15.5, 0], [-16.5, 7], [-13, 7], [-12, 2.6], [-4, 2.6], [-3, 15], [2, 15], [4, 2.6], [10, 2.6]];
      } else if (type === 'bomber') {
        pts = [[18, 0], [12, -2.6], [4, -3], [-8, -16], [-12, -16], [-6, -3.2], [-13, -3], [-16, -8], [-18, -8], [-17, 0], [-18, 8], [-16, 8], [-13, 3], [-6, 3.2], [-12, 16], [-8, 16], [4, 3], [12, 2.6]];
      } else {
        pts = [[14, 0], [-8, -14], [-12, -14], [-9, -6], [-14, -3.5], [-12, 0], [-14, 3.5], [-9, 6], [-12, 14], [-8, 14]];
      }
      poly(pts, gg, shade(g, -0.6));
      if (type === 'attacker') {
        for (const y of [-4.6, 4.6]) rr(-10, y - 1.6, 6, 3.2, 1.5, shade(g, -0.25));
        for (const y of [-11, -7.5, 7.5, 11]) { c.beginPath(); c.ellipse(-0.5, y, 3.2, 1.1, 0, 0, 7); c.fillStyle = '#3c3f33'; c.fill(); }
      }
      if (type === 'bomber') for (const y of [-6.5, 6.5]) rr(-5, y - 1.5, 7, 3, 1.4, shade(g, -0.3));
      if (type !== 'stealth') {
        c.beginPath(); c.ellipse(8, 0, 3.6, 1.4, 0, 0, 7);
        c.fillStyle = lgrad(c, 0, -1.4, 0, 1.4, [[0, '#e6f4ff'], [1, '#3a6585']]); c.fill();
      } else {
        line(-10, 0, 10, 0, 0.6, '#55585e'); line(-5, -6, 5, -1.5, 0.5, '#4a4d52'); line(-5, 6, 5, 1.5, 0.5, '#4a4d52');
      }
      break;
    }
    case 'truck': {
      shadowE(17, 10.5);
      poly([[-16, 3], [-16, -8], [6, -8], [6, 3]], lgrad(c, 0, -8, 0, 3, [[0, shade(camo, 0.15)], [1, shade(camo, -0.3)]]), edge);
      line(-15, -5, 5, -5, 0.6, 'rgba(0,0,0,0.3)'); line(-15, -2, 5, -2, 0.6, 'rgba(0,0,0,0.3)');
      poly([[7, 3], [7, -6], [12, -6], [16, -1], [16, 3]], body(-6, 3), edge);
      rr(11, -4.8, 3.6, 2.8, 0.6, 'rgba(150,190,220,0.85)');
      for (const x of [-11, -4, 11]) wheel(x, 6, 3.6);
      break;
    }
    case 'thelico': {
      const g = camo;
      shadowE(15, 13);
      c.fillStyle = 'rgba(40,40,40,0.25)'; c.beginPath(); c.ellipse(-6, -9.5, 13, 2, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(8, -9.5, 13, 2, 0, 0, 7); c.fill();
      rr(-15, -5, 29, 11, 5, lgrad(c, 0, -5, 0, 6, [[0, shade(g, 0.3)], [0.5, g], [1, shade(g, -0.4)]]), shade(g, -0.6));
      c.beginPath(); c.ellipse(11, -1.5, 4, 3, 0.2, 0, 7); c.fillStyle = lgrad(c, 0, -4, 0, 1.5, [[0, '#d9eefc'], [1, '#3d6a8c']]); c.fill();
      for (const x of [-8, -3, 2]) rr(x, -2.5, 3, 2.5, 0.6, 'rgba(30,40,50,0.7)');
      line(-8, -5, -8, -9, 1.6, '#2a2a28'); line(6, -5, 6, -9, 1.6, '#2a2a28');
      line(-10, 8.5, 10, 8.5, 1.2, '#2b2b28');
      break;
    }
    case 'airlift': {
      const g = '#8e989c';
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.save(); c.translate(3, 5); c.scale(0.9, 0.5); c.beginPath(); c.ellipse(0, 0, 17, 13, 0, 0, 7); c.fill(); c.restore();
      const gg = lgrad(c, 0, -15, 0, 15, [[0, shade(g, 0.3)], [0.5, g], [1, shade(g, -0.35)]]);
      poly([[16, 0], [12, -3.2], [-12, -3.2], [-15, -7], [-17.5, -7], [-16, 0], [-17.5, 7], [-15, 7], [-12, 3.2], [12, 3.2]], gg, shade(g, -0.6));
      poly([[3, -3.2], [1, -16], [-3, -16], [-3, -3.2]], gg, shade(g, -0.6)); poly([[3, 3.2], [1, 16], [-3, 16], [-3, 3.2]], gg, shade(g, -0.6));
      for (const y of [-12, -7, 7, 12]) rr(1, y - 1.2, 4, 2.4, 1, shade(g, -0.35));
      c.beginPath(); c.ellipse(12, 0, 2.6, 1.4, 0, 0, 7); c.fillStyle = '#3a6585'; c.fill();
      break;
    }
    case 'carrier': {
      const g = '#8d979e';
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(-19, 7); c.lineTo(17, 7); c.lineTo(19, 8.6); c.lineTo(-18, 9); c.closePath(); c.fill();
      poly([[-18, 1], [16, 1], [19, -1], [18, 3], [13, 7], [-15, 7]], lgrad(c, 0, -1, 0, 7, [[0, shade(g, 0.15)], [1, shade(g, -0.45)]]), '#3b4045');
      poly([[-19, -1.5], [19, -1.5], [19, 1], [-19, 1]], '#5a5e62', '#33373a');
      line(-17, -0.3, 17, -0.3, 0.5, 'rgba(255,255,255,0.7)');
      rr(4, -8, 5, 6.5, 1, lgrad(c, 0, -8, 0, -1.5, [[0, shade(g, 0.3)], [1, shade(g, -0.2)]]), '#3b4045');
      line(6.5, -8, 6.5, -12, 1, '#3b4045');
      c.fillStyle = '#2f3336';
      for (const x of [-14, -8]) { c.beginPath(); c.moveTo(x, -2.6); c.lineTo(x + 4, -1.6); c.lineTo(x, -0.6); c.closePath(); c.fill(); }
      break;
    }
    case 'train': {
      rr(-17, 5, 34, 2, 0.5, '#3b3b3b');
      rr(-17, -7, 14, 11, 1.5, lgrad(c, 0, -7, 0, 4, [[0, shade(camo, 0.2)], [1, shade(camo, -0.4)]]), edge);
      poly([[-1, 4], [-1, -9], [12, -9], [16, -4], [16, 4]], lgrad(c, 0, -9, 0, 4, [[0, '#c94a3a'], [1, '#6b2018']]), '#3a1410');
      rr(10, -7.5, 4, 3, 0.6, 'rgba(150,190,220,0.85)');
      for (const x of [-14, -7, 2, 8, 13]) wheel(x, 6, 2.4);
      break;
    }
    case 'lst': {
      const g = '#8d979e';
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(-18, 7.5); c.lineTo(16, 7.5); c.lineTo(18, 9); c.lineTo(-17, 9.5); c.closePath(); c.fill();
      poly([[-17, 0], [13, 0], [17, 3], [14, 7.5], [-14, 7.5]], lgrad(c, 0, 0, 0, 7.5, [[0, shade(g, 0.15)], [1, shade(g, -0.45)]]), '#3b4045');
      rr(-16, -7, 8, 7, 1, lgrad(c, 0, -7, 0, 0, [[0, shade(g, 0.3)], [1, shade(g, -0.2)]]), '#3b4045');
      line(-12, -7, -12, -12, 1.2, '#3b4045');
      for (const x of [-5, 0, 5]) rr(x, -3, 4, 3, 0.8, camo, '#2a2a26');
      line(13, 0, 17, -4, 1.4, '#3b4045');
      break;
    }
    case 'destroyer': {
      const g = '#8d979e';
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(-18, 7.5); c.lineTo(17, 7.5); c.lineTo(19, 9); c.lineTo(-17, 9.5); c.closePath(); c.fill();
      poly([[-17, 1], [18, 1], [13, 7.5], [-14, 7.5]], lgrad(c, 0, 1, 0, 7.5, [[0, shade(g, 0.15)], [1, shade(g, -0.45)]]), '#3b4045');
      line(-14, 5, 14, 5, 0.6, 'rgba(0,0,0,0.25)');
      poly([[-9, 1], [-9, -4], [-4, -4], [-4, -8], [3, -8], [3, -4], [7, 1]], lgrad(c, 0, -8, 0, 1, [[0, shade(g, 0.3)], [1, shade(g, -0.2)]]), '#3b4045');
      line(-0.5, -8, -0.5, -15, 1.3, '#3b4045'); line(-4, -12.5, 3, -12.5, 1.1, '#3b4045');
      c.fillStyle = '#c7cdd1'; c.beginPath(); c.arc(-0.5, -15.5, 1.5, 0, 7); c.fill();
      rr(9, -2.4, 5, 3.4, 1.2, shade(g, -0.15), '#3b4045'); line(13, -1, 18, -1.6, 1.4, '#3b4045');
      rr(-15, -2, 4, 3, 1, shade(g, -0.15), '#3b4045');
      c.fillStyle = '#2d3236'; for (const x of [-7, -3, 1]) { c.beginPath(); c.arc(x, -6, 0.6, 0, 7); c.fill(); }
      break;
    }
  }
}

// 繪製一枚部隊棋子
function drawCounter(c, cx, cy, type, side, o = {}) {
  const d = UNITS[type], S = SIDES[side];
  const N = NATIONS[d.nation] || NATIONS.TW;
  const air = d.cat === 'air';
  const oy = air ? -6 : -2, w = 46, h = 34, rad = air ? 12 : 6;
  if (air) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(cx, cy + 14, 16, 4, 0, 0, 7); c.fill(); }
  const top = cy - h / 2 + oy;
  const shape = () => {
    if (side === 1 && !air) {
      const k = 8, x0 = cx - w / 2, x1 = cx + w / 2, y1 = top + h;
      c.beginPath(); c.moveTo(x0 + k, top); c.lineTo(x1 - k, top); c.lineTo(x1, top + k); c.lineTo(x1, y1 - k);
      c.lineTo(x1 - k, y1); c.lineTo(x0 + k, y1); c.lineTo(x0, y1 - k); c.lineTo(x0, top + k); c.closePath();
    } else roundRect(c, cx - w / 2, top, w, h, side === 1 ? 4 : rad);
  };
  // 淺色底（依兵種環境：天空、海面、地面）
  const bg = air ? ['#dbe9f7', '#9fbfdc'] : d.cat === 'sea' || d.base === 'marine' ? ['#cfe2ef', '#7fa3bf'] : ['#e8e6d6', '#b9b59a'];
  shape();
  c.fillStyle = lgrad(c, 0, top, 0, top + h, [[0, bg[0]], [1, bg[1]]]); c.fill();
  c.save(); shape(); c.clip();
  c.translate(cx, cy + oy + 1);
  if (side === 1) c.scale(-1, 1);
  drawIcon(c, d.base, N.camo, N.style);
  c.restore();
  shape();
  c.strokeStyle = o.highlight ? '#ffe27a' : S.color; c.lineWidth = o.highlight ? 3.2 : 2.6; c.stroke();
  // 國碼標籤
  c.font = 'bold 8px sans-serif';
  const cw = c.measureText(N.code).width + 5;
  roundRect(c, cx - w / 2 + 1.5, top + 1.5, cw, 9, 2); c.fillStyle = S.color; c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(N.code, cx - w / 2 + 4, top + 6.3);
  if (o.done) { shape(); c.fillStyle = 'rgba(20,20,20,0.5)'; c.fill(); }
  if (o.label) {
    c.font = 'bold 10px -apple-system, "PingFang TC", sans-serif';
    const tw = c.measureText(d.name).width + 8;
    roundRect(c, cx - tw / 2, top + h - 1, tw, 12, 3);
    c.fillStyle = 'rgba(8,12,16,0.85)'; c.fill();
    c.fillStyle = o.done ? '#9aa6b2' : '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(d.name, cx, top + h + 5);
  }
  if (o.hp !== undefined && o.hp < 10) {
    const hx = cx + w / 2 - 2, hy = top + 2;
    circle(c, hx, hy, 8); c.fillStyle = '#111'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = o.hp <= 3 ? '#ff8a7a' : '#fff'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(o.hp, hx, hy + 0.5);
  }
  if (o.vip) {
    c.save(); c.translate(cx, top - 1);
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 3.4 : 8; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffd34d'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.2; c.stroke();
    c.restore();
  }
  if (o.fuelLow) {
    c.font = 'bold 10px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.strokeStyle = '#000'; c.lineWidth = 2.5; c.fillStyle = '#ffcc33';
    c.strokeText('⛽', cx - w / 2 + 2, top + h - 12); c.fillText('⛽', cx - w / 2 + 2, top + h - 12);
  }
  if (o.allyAI) {
    c.font = 'bold 7px sans-serif';
    roundRect(c, cx - w / 2 + 1.5, top + 11.5, 13, 8, 2); c.fillStyle = '#4a4f57'; c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('AI', cx - w / 2 + 3, top + 15.8);
  }
  if (o.cargo) {
    c.font = 'bold 9px sans-serif';
    roundRect(c, cx - 11, top + h - 11, 22, 10, 3); c.fillStyle = 'rgba(20,90,40,0.92)'; c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('載' + o.cargo, cx, top + h - 5.5);
  }
  if (o.rank) {
    // 階級：金色 V 形臂章；王牌另加星
    const bx = cx + w / 2 - 7, by = top + h - 5;
    c.strokeStyle = '#000'; c.lineWidth = 3.4; c.lineJoin = 'miter';
    for (let k = 0; k < Math.min(o.rank, 2); k++) {
      c.beginPath(); c.moveTo(bx - 4, by - 4 - k * 4); c.lineTo(bx, by - 1 - k * 4); c.lineTo(bx + 4, by - 4 - k * 4); c.stroke();
    }
    c.strokeStyle = '#ffd34d'; c.lineWidth = 1.8;
    for (let k = 0; k < Math.min(o.rank, 2); k++) {
      c.beginPath(); c.moveTo(bx - 4, by - 4 - k * 4); c.lineTo(bx, by - 1 - k * 4); c.lineTo(bx + 4, by - 4 - k * 4); c.stroke();
    }
    if (o.rank >= 3) {
      c.save(); c.translate(bx, by - 13);
      c.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2 : 4.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#ffd34d'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
      c.restore();
    }
  }
  if (o.tier) {
    c.font = 'bold 8px sans-serif'; c.textAlign = 'right'; c.textBaseline = 'top';
    c.strokeStyle = '#000'; c.lineWidth = 2.5; c.fillStyle = '#8fe3ff';
    c.strokeText('改' + (o.tier > 1 ? o.tier : ''), cx + w / 2 - 12, top + 1.5); c.fillText('改' + (o.tier > 1 ? o.tier : ''), cx + w / 2 - 12, top + 1.5);
  }
  if (o.order) {
    c.fillStyle = '#ffd34d'; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx + w / 2 - 9, top + h - 2); c.lineTo(cx + w / 2 - 9, top + h - 12); c.lineTo(cx + w / 2 - 2, top + h - 9.5); c.lineTo(cx + w / 2 - 9, top + h - 7); c.stroke(); c.fill();
  }
}

// ----- 每幀繪製 -----
function draw(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0c1117'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  if (!G || !terrainCvs) return;
  const z = cam.z * dpr;
  ctx.setTransform(z, 0, 0, z, -cam.x * z, -cam.y * z);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(terrainCvs, 0, 0, terrainCvs.width / TS, terrainCvs.height / TS);
  drawProps();
  drawMissionMarks(now, false);
  drawOverlays(now);
  drawUnits();
  drawMissionMarks(now, true);
  drawForecastBubble();
  drawFX(now);
}

function drawProps() {
  for (let i = 0; i < G.terrain.length; i++) {
    if (!TERRAIN[G.terrain[i]].prop) continue;
    const o = G.owner[i], [cx, cy] = idxCenter(i);
    const col = o >= 0 ? SIDES[o].color : '#eeeeee';
    hexPath(ctx, cx, cy, R - 3);
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.9; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + 14, cy - 23); ctx.lineTo(cx + 14, cy - 8); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(cx + 14, cy - 23, 10, 6); ctx.lineWidth = 1; ctx.strokeRect(cx + 14, cy - 23, 10, 6);
    const c = G.capture[i];
    if (c) {
      ctx.fillStyle = '#111'; ctx.fillRect(cx - 15, cy + 19, 30, 5);
      ctx.fillStyle = SIDES[c.side].light; ctx.fillRect(cx - 14, cy + 20, 28 * (1 - c.pts / CAPTURE_POINTS), 3);
    }
  }
}

// 任務目標格（金色）與目標部隊準星
function drawMissionMarks(now, top) {
  const mt = missionTargets();
  if (!mt) return;
  const p = 0.5 + 0.5 * Math.sin(now / 260);
  if (!top) {
    for (const t of mt.tiles) {
      const [cx, cy] = idxCenter(t.i);
      hexPath(ctx, cx, cy, R - 2);
      ctx.fillStyle = t.bonus ? `rgba(160,220,255,${0.12 + 0.1 * p})` : `rgba(255,200,60,${0.15 + 0.15 * p})`;
      ctx.fill();
      ctx.setLineDash([6, 4]); ctx.lineDashOffset = -now / 40;
      ctx.strokeStyle = t.bonus ? '#a8dcff' : '#ffd34d'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.setLineDash([]);
    }
    return;
  }
  for (const t of mt.tiles) {
    const [cx, cy] = idxCenter(t.i);
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(t.bonus ? '⭐' : '🎯', cx - 18, cy - 20); ctx.fillText(t.bonus ? '⭐' : '🎯', cx - 18, cy - 20);
  }
  for (const u of G.units) {
    if (!u.tag || !mt.tags.includes(u.tag)) continue;
    const [cx, cy] = u._anim || tileCenter(u.x, u.y), r = 24 + 2 * p;
    ctx.strokeStyle = '#ff4b4b'; ctx.lineWidth = 2;
    circle(ctx, cx, cy - 3, r); ctx.stroke();
    for (const a of [0, 1, 2, 3]) {
      const ang = a * Math.PI / 2, ix = Math.cos(ang), iy = Math.sin(ang);
      ctx.beginPath(); ctx.moveTo(cx + ix * (r - 5), cy - 3 + iy * (r - 5)); ctx.lineTo(cx + ix * (r + 5), cy - 3 + iy * (r + 5)); ctx.stroke();
    }
  }
}

// 目標上方的戰鬥預測氣泡
function drawForecastBubble() {
  const f = UIS.fc;
  if (!f || (UIS.mode !== 'selected' && UIS.mode !== 'target')) return;
  const [cx, cy] = tileCenter(f.x, f.y);
  const t1 = f.kill ? '擊破!' : `-${f.dmg}`, t2 = `↩ -${f.counter}`;
  ctx.font = 'bold 13px sans-serif';
  const w = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 34, h = 38, x = cx - w / 2, y = cy - 30 - h;
  roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = 'rgba(10,14,20,0.92)'; ctx.fill();
  ctx.strokeStyle = UIS.pendingTarget ? '#ffd34d' : '#556'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6, y + h); ctx.lineTo(cx + 6, y + h); ctx.lineTo(cx, y + h + 6); ctx.closePath();
  ctx.fillStyle = 'rgba(10,14,20,0.92)'; ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aab'; ctx.fillText('⚔', x + 7, y + 11); ctx.fillText('🛡', x + 7, y + 28);
  ctx.fillStyle = '#ffd166'; ctx.fillText(t1, x + 24, y + 11);
  ctx.fillStyle = f.counter ? '#ff8a7a' : '#8fd18f'; ctx.fillText(t2, x + 24, y + 28);
}

function fillHex(i, color) { const [cx, cy] = idxCenter(i); hexPath(ctx, cx, cy, R - 1); ctx.fillStyle = color; ctx.fill(); }

function drawOverlays(now) {
  const sel = UIS.sel;
  if (UIS.inspectSet) for (const i of UIS.inspectSet) fillHex(i, 'rgba(255,150,30,0.28)');
  if (UIS.mode === 'deploy' && UIS.deployZone) {
    for (const i of UIS.deployZone) fillHex(i, 'rgba(90,220,120,0.22)');
    if (UIS.deploySel) {
      const ds = UIS.deploySel, mt = UNITS[ds.type].mt;
      for (const i of UIS.deployZone) if (!unitAt(...ixy(i)) && moveCost(G.terrain[i], mt) !== Infinity) fillHex(i, 'rgba(90,220,120,0.35)');
      if (ds.x >= 0) { const [cx, cy] = tileCenter(ds.x, ds.y); hexPath(ctx, cx, cy, R - 1.5); ctx.strokeStyle = '#7dff9a'; ctx.lineWidth = 3; ctx.stroke(); }
    }
  }
  if (UIS.mode === 'selected' && UIS.reach) {
    for (const [i, v] of UIS.reach) fillHex(i, v.canStop ? 'rgba(70,160,255,0.5)' : 'rgba(70,160,255,0.2)');
    if (isIndirect(sel.type)) {
      const [a, b] = UNITS[sel.type].range;
      for (let i = 0; i < G.terrain.length; i++) {
        const [x, y] = ixy(i), dd = hexDist(x, y, sel.x, sel.y);
        if (dd >= a && dd <= b) fillHex(i, 'rgba(255,90,60,0.2)');
      }
    }
    for (const u of G.units) if (UIS.attackSet && UIS.attackSet.has(u.id)) fillHex(idxOf(u.x, u.y), 'rgba(255,40,40,0.45)');
  }
  if (UIS.mode === 'unload' && UIS.unload) for (const i of UIS.unload.tiles) fillHex(i, `rgba(90,220,120,${0.35 + 0.15 * Math.sin(now / 150)})`);
  if (UIS.mode === 'target' && UIS.targets) {
    const p = 0.35 + 0.25 * Math.sin(now / 150);
    for (const u of UIS.targets) fillHex(idxOf(u.x, u.y), `rgba(255,40,40,${p})`);
  }
  if (UIS.path && UIS.path.length > 1) {
    const pts = UIS.path.map(idxCenter);
    for (const [col, lw] of [['rgba(0,0,0,0.5)', 9], ['#fff5c2', 5]]) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    }
    const e = pts[pts.length - 1];
    circle(ctx, e[0], e[1], 6); ctx.fillStyle = '#fff5c2'; ctx.fill();
  }
  // 移動命令：預覽與已設定的目的地（虛線＋旗）
  const dashPath = (path, col) => {
    if (!path || path.length < 2) return;
    const pts = path.map(idxCenter);
    ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now / 60;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]);
    const [ex, ey] = pts[pts.length - 1];
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ex - 4, ey + 10); ctx.lineTo(ex - 4, ey - 12); ctx.stroke();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(ex - 4, ey - 12); ctx.lineTo(ex + 9, ey - 8); ctx.lineTo(ex - 4, ey - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  if (UIS.mode === 'selected' && UIS.orderPreview) dashPath(UIS.orderPreview, '#ffd34d');
  const showOrder = sel || (UIS.hover && unitAt(UIS.hover[0], UIS.hover[1]));
  if (showOrder && showOrder.side === G.cur && showOrder.order != null && !UIS.orderPreview) dashPath(orderPath(showOrder, showOrder.order), 'rgba(255,211,77,0.75)');
  if (sel) {
    const [cx, cy] = tileCenter(sel.x, sel.y);
    hexPath(ctx, cx, cy, R - 1.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  }
  if (UIS.hover && inMap(UIS.hover[0], UIS.hover[1])) {
    const [cx, cy] = tileCenter(UIS.hover[0], UIS.hover[1]);
    hexPath(ctx, cx, cy, R - 1.5); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2.5; ctx.stroke();
  }
}

function drawUnits() {
  const list = [...G.units].sort((a, b) => (UNITS[a.type].cat === 'air') - (UNITS[b.type].cat === 'air') || a.y - b.y);
  for (const u of list) {
    const [cx, cy] = u._anim || tileCenter(u.x, u.y);
    const d = UNITS[u.type];
    drawCounter(ctx, cx, cy, u.type, u.side, {
      hp: u.hp,
      done: u.done && u.side === G.cur && !u._anim,
      fuelLow: d.fuel !== undefined && u.fuel <= d.upkeep * 3,
      highlight: UIS.inspect === u,
      label: SETTINGS.labels,
      vip: u.vip,
      order: u.side === G.cur && u.order != null,
      cargo: u.cargo && u.cargo.length,
      allyAI: UNITS[u.type].ally && G.allyAI,
      rank: rankOf(u),
      tier: UNITS[u.type].tier || 0,
    });
  }
}

function drawFX(now) {
  for (let k = FX.length - 1; k >= 0; k--) {
    const f = FX[k], t = (now - f.t0) / f.dur;
    if (t >= 1) { FX.splice(k, 1); continue; }
    if (t < 0) continue;
    if (f.kind === 'boom') {
      const r = (8 + t * 22) * (f.big ? 1.5 : 1);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255,250,200,${1 - t})`); g.addColorStop(0.4, `rgba(255,150,40,${0.9 * (1 - t)})`);
      g.addColorStop(1, 'rgba(120,30,0,0)');
      ctx.fillStyle = g; circle(ctx, f.x, f.y, r); ctx.fill();
    } else if (f.kind === 'flash') {
      ctx.fillStyle = `rgba(255,240,180,${1 - t})`; circle(ctx, f.x, f.y, 6 + t * 8); ctx.fill();
    } else if (f.kind === 'text') {
      ctx.globalAlpha = 1 - t * t;
      ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(f.text, f.x, f.y - t * 26);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - t * 26);
      ctx.globalAlpha = 1;
    }
  }
}
function fxBoom(x, y, big) { FX.push({ kind: 'boom', x, y, big, t0: performance.now(), dur: 550 }); }
function fxText(x, y, text, color = '#fff') { FX.push({ kind: 'text', x, y: y - 10, text, color, t0: performance.now(), dur: 1100 }); }

// ----- 動畫 -----
function animateMove(u, path, stepMs) {
  return new Promise(res => {
    const pts = path.map(idxCenter);
    if (pts.length < 2) return res();
    const t0 = performance.now();
    (function step(now) {
      const t = Math.max(0, now - t0) / stepMs, seg = Math.floor(t);
      if (seg >= pts.length - 1) { u._anim = null; return res(); }
      const f = t - seg, a = pts[seg], b = pts[seg + 1];
      u._anim = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      requestAnimationFrame(step);
    })(t0);
  });
}
function animLunge(u, tx, ty, ms) {
  return new Promise(res => {
    const [sx, sy] = tileCenter(u.x, u.y), t0 = performance.now();
    (function step(now) {
      const t = Math.min(1, Math.max(0, now - t0) / ms), k = Math.sin(t * Math.PI) * 0.35;
      u._anim = [sx + (tx - sx) * k, sy + (ty - sy) * k];
      if (t >= 1) { u._anim = null; return res(); }
      requestAnimationFrame(step);
    })(t0);
  });
}

// ----- 相機 -----
function viewSize() { return [cvs.clientWidth, cvs.clientHeight]; }
function clampCam() {
  const [ww, wh] = worldSize(), [vw, vh] = viewSize();
  const m = 40 / cam.z, w = vw / cam.z, h = vh / cam.z;
  cam.x = ww + 2 * m <= w ? (ww - w) / 2 : Math.max(-m, Math.min(ww - w + m, cam.x));
  cam.y = wh + 2 * m <= h ? (wh - h) / 2 : Math.max(-m, Math.min(wh - h + m, cam.y));
}
function centerOn(wx, wy) {
  const [vw, vh] = viewSize();
  cam.x = wx - vw / cam.z / 2; cam.y = wy - vh / cam.z / 2;
  clampCam();
}
function ensureVisible(x, y) {
  const [cx, cy] = tileCenter(x, y), [vw, vh] = viewSize();
  const sx = (cx - cam.x) * cam.z, sy = (cy - cam.y) * cam.z;
  if (sx < 60 || sy < 60 || sx > vw - 60 || sy > vh - 60) centerOn(cx, cy);
}
function zoomAt(sx, sy, factor) {
  const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
  cam.z = Math.max(0.45, Math.min(2.2, cam.z * factor));
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z;
  clampCam();
}
function fitView() {
  const [ww, wh] = worldSize(), [vw, vh] = viewSize();
  cam.z = Math.max(0.55, Math.min(1.15, Math.min(vw / ww, vh / wh) * 1.05));
}

// ----- 小地圖 -----
function drawMini() {
  if (!G) return;
  const [ww, wh] = worldSize();
  const s = mini.width / ww;
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.fillStyle = '#2f629a'; mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.setTransform(s, 0, 0, s, 0, 0);
  for (let i = 0; i < G.terrain.length; i++) {
    const [cx, cy] = idxCenter(i), t = G.terrain[i];
    hexPath(mctx, cx, cy, R + 1);
    mctx.fillStyle = TERRAIN[t].prop ? (G.owner[i] >= 0 ? SIDES[G.owner[i]].light : '#f4f4f4')
      : t === 'road' ? '#cdbf8f' : TCOLOR[t];
    mctx.fill();
  }
  for (const u of G.units) {
    const [cx, cy] = tileCenter(u.x, u.y);
    mctx.fillStyle = SIDES[u.side].color; circle(mctx, cx, cy, R * 0.62); mctx.fill();
    mctx.strokeStyle = '#000'; mctx.lineWidth = 4; mctx.stroke();
  }
  const [vw, vh] = viewSize();
  mctx.strokeStyle = '#ffe27a'; mctx.lineWidth = 2 / s;
  mctx.strokeRect(cam.x, cam.y, vw / cam.z, vh / cam.z);
}
