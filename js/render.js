'use strict';
// ===== 繪圖：地形、部隊、特效、小地圖 =====

const R = 32;               // 六角格外接圓半徑
const HW = R * SQ3 / 2;     // 半寬
const TS = 2;               // 地形底圖解析度倍率
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
  plain: '#a7c66c', road: '#a7c66c', forest: '#88b05b', hills: '#c4b674', mountain: '#a8987c',
  sea: '#4683c2', bridge: '#4683c2', city: '#b9c98e', capital: '#bccb92', factory: '#b9c98e',
  airport: '#b9c98e', port: '#b9c98e',
};

function buildTerrain() {
  const [ww, wh] = worldSize();
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

// ----- 部隊圖示（剪影，車頭朝右） -----
function drawIcon(c, type, dk, side = 0) {
  const W = '#fff';
  const rr = (x, y, w, h, r) => { roundRect(c, x, y, w, h, r); c.fill(); };
  const poly = pts => { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
  const dot = (x, y, r) => { circle(c, x, y, r); c.fill(); };
  const bar = (x1, y1, x2, y2, w) => { c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
  c.fillStyle = W; c.strokeStyle = W; c.lineCap = 'round'; c.lineJoin = 'round';
  const tracks = () => {
    c.fillStyle = W; rr(-15, 3, 30, 8, 4);
    c.fillStyle = dk; for (let x = -10; x <= 10; x += 5) dot(x, 7, 1.7);
    c.fillStyle = W;
  };
  const truck = () => {
    c.fillStyle = W; c.fillRect(-15, 1, 30, 4); rr(8, -6, 8, 9, 2);
    c.fillStyle = dk; c.fillRect(11, -4, 4, 3);
    for (const x of [-10, -3.5, 11]) { c.fillStyle = W; dot(x, 7, 3.4); c.fillStyle = dk; dot(x, 7, 1.3); }
    c.fillStyle = W;
  };
  const soldier = (ox, s, launcher) => {
    c.save(); c.translate(ox, 0); c.scale(s, s);
    c.fillStyle = W; c.strokeStyle = W;
    dot(0, -7, 3.2);
    if (side === 1) {
      // 帝國：外擴帽緣鋼盔、長大衣
      poly([[-6, -6], [-4.5, -8], [-3.5, -11], [3.5, -11], [4.5, -8], [6, -6]]);
      poly([[-2.5, -3], [2.5, -3], [5, 7], [-5, 7]]);
      bar(-2, 6, -3.5, 11, 2.6); bar(2, 6, 3.5, 11, 2.6);
    } else {
      // 聯邦：圓形戰術頭盔、戰術背心
      c.beginPath(); c.arc(0, -8, 4.3, Math.PI, 0); c.closePath(); c.fill();
      c.fillRect(-4.6, -8.6, 2, 3.4);
      bar(0, -3, 0, 4, 4.5);
      bar(0, 4, -4, 11, 3); bar(0, 4, 4, 11, 3);
    }
    if (launcher) {
      bar(-11, -2, 11, -7.5, 5);
      poly([[11, -10.5], [17, -8.6], [12.4, -4.6]]);
      c.fillStyle = dk; dot(-11, -2, 1.4);
    } else {
      bar(-5, 1.5, 12, -3, 2.2);
      bar(0, -1, 6, -0.5, 2.6);
    }
    c.restore();
  };
  switch (type) {
    case 'inf':
      c.globalAlpha = 0.6; soldier(-7, 0.85, false); c.globalAlpha = 1; soldier(3, 1, false);
      break;
    case 'atinf':
      soldier(-1, 1, true);
      break;
    case 'recon':
      poly([[-15, 4], [-13, -3], [-5, -4], [-2, -9], [7, -9], [10, -3], [15, -2], [15, 4]]);
      c.fillStyle = dk; c.fillRect(0, -7, 6, 3);
      for (const x of [-9, 9]) { c.fillStyle = W; dot(x, 6, 4.3); c.fillStyle = dk; dot(x, 6, 1.6); }
      c.fillStyle = W; bar(-10, -3, -14, -12, 1.3);
      break;
    case 'tank':
      tracks();
      if (side === 1) {
        // 帝國：圓頂砲塔、短車體
        poly([[-14, 3], [-12, -2], [11, -2], [14, 3]]);
        c.beginPath(); c.ellipse(-1, -2, 8, 6.5, 0, Math.PI, 0); c.closePath(); c.fill();
        c.fillRect(5, -6, 11, 3); c.fillRect(14, -6.8, 3, 4.6);
        c.fillStyle = dk; dot(-2, -5, 1.2);
      } else {
        // 聯邦：楔形平砲塔、長砲管
        poly([[-14, 3], [-11, -2], [12, -2], [15, 3]]);
        poly([[-9, -2], [-8, -7.5], [5, -7.5], [9, -2]]);
        c.fillRect(6, -6.2, 12, 2.4);
        c.fillStyle = dk; c.fillRect(-6, -6, 5, 1.6);
      }
      break;
    case 'heavy':
      // 猛獁：雙砲管巨型戰車
      c.fillStyle = W; rr(-17, 3, 34, 9, 4);
      c.fillStyle = dk; for (let x = -12; x <= 12; x += 4) dot(x, 7.5, 1.6);
      c.fillStyle = W;
      poly([[-16, 3], [-13, -3], [13, -3], [16, 3]]);
      poly([[-10, -3], [-8, -11], [6, -11], [9, -3]]);
      c.fillRect(5, -10, 13, 2.4); c.fillRect(5, -6.5, 13, 2.4);
      c.fillStyle = dk; c.fillRect(-7, -8, 9, 1.6);
      break;
    case 'arty':
      tracks();
      poly([[-14, 3], [-12, -2], [12, -2], [14, 3]]);
      rr(-11, -10, 15, 9, 1.5);
      c.save(); c.translate(2, -7); c.rotate(-0.5); c.fillRect(0, -1.7, 15, 3.4); c.fillRect(13, -2.6, 3.5, 5.2); c.restore();
      break;
    case 'rocket':
      truck();
      c.save(); c.translate(-3, -1.5); c.rotate(-0.36);
      rr(-11, -8, 19, 8, 1.5);
      c.fillStyle = dk; c.fillRect(-10, -5.6, 17, 1); c.fillRect(-10, -3, 17, 1);
      c.restore();
      break;
    case 'aa':
      tracks();
      poly([[-14, 3], [-11, -2], [12, -2], [14, 3]]);
      rr(-6, -8, 11, 6.5, 1.5);
      c.save(); c.translate(3, -6.5); c.rotate(-0.95); c.fillRect(0, -3.2, 15, 1.9); c.fillRect(0, 1.3, 15, 1.9); c.restore();
      c.lineWidth = 1.8; c.beginPath(); c.arc(-9, -9, 4.5, Math.PI * 0.85, Math.PI * 1.95); c.stroke();
      bar(-9, -9, -8, -3, 1.6);
      break;
    case 'sam':
      truck();
      c.save(); c.translate(-6, -1.5); c.rotate(-0.55);
      for (const oy of [-7, -2.5]) {
        c.fillRect(-3, oy, 15, 3);
        poly([[12, oy], [17.5, oy + 1.5], [12, oy + 3]]);
        poly([[-3, oy - 1.5], [0, oy], [0, oy + 3], [-3, oy + 4.5]]);
      }
      c.restore();
      break;
    case 'heli':
      if (side === 1) {
        // 帝國：粗壯機身、短翼掛載火箭莢
        c.beginPath(); c.ellipse(2, 1, 11, 6.5, 0, 0, 7); c.fill();
        poly([[-6, -1.5], [-17, -2], [-17, 1.5], [-6, 3.5]]);
        poly([[-17.5, -2], [-15, -9], [-13, -2]]);
        c.fillStyle = dk; c.beginPath(); c.ellipse(8.5, -1, 3.6, 2.6, 0, 0, 7); c.fill(); dot(4, -1, 1.6);
        c.fillStyle = W; c.fillRect(-4, 4, 12, 2.4); rr(-5, 5.5, 5, 4, 1.5); rr(4, 5.5, 5, 4, 1.5);
        bar(2, -5, 2, -9, 2.4); bar(-15, -9, 18, -9, 2.4);
        break;
      }
      c.beginPath(); c.ellipse(3, 1, 9, 5.5, 0, 0, 7); c.fill();
      poly([[-4, -1.5], [-17, -2.5], [-17, 1], [-4, 3]]);
      poly([[-17.5, -2.5], [-15, -9], [-13, -2.5]]);
      c.fillStyle = dk; c.beginPath(); c.ellipse(7.5, -0.8, 4, 2.6, 0, 0, 7); c.fill(); c.fillStyle = W;
      bar(3, -4, 3, -8.5, 2.2); bar(-14, -9, 18, -9, 2.2);
      bar(-4, 9.5, 11, 9.5, 1.7); bar(-1, 6, -1, 9.5, 1.4); bar(8, 6, 8, 9.5, 1.4);
      c.fillRect(-1, 2, 8, 2); c.fillStyle = dk; dot(7, 3, 1.1);
      break;
    case 'fighter':
      if (side === 1) {
        // 帝國：後掠翼、機鼻進氣口
        poly([[16, 0], [12, -2.4], [2, -2.6], [-6, -12], [-10, -12], [-6, -2.6], [-12, -2.6], [-15, -9], [-17, -9], [-16, 0],
          [-17, 9], [-15, 9], [-12, 2.6], [-6, 2.6], [-10, 12], [-6, 12], [2, 2.6], [12, 2.4]]);
        c.fillStyle = dk; dot(15, 0, 1.3); c.beginPath(); c.ellipse(7, 0, 2.6, 1.2, 0, 0, 7); c.fill();
        break;
      }
      poly([[17, 0], [5, -2.6], [-3, -13], [-8, -13], [-4, -2.6], [-11, -2.6], [-14, -8], [-17, -8], [-15, 0],
        [-17, 8], [-14, 8], [-11, 2.6], [-4, 2.6], [-8, 13], [-3, 13], [5, 2.6]]);
      c.fillStyle = dk; c.beginPath(); c.ellipse(8, 0, 3, 1.3, 0, 0, 7); c.fill();
      break;
    case 'stealth':
      // 幽靈：飛翼
      poly([[13, 0], [-9, -15], [-13, -15], [-9, -8], [-14, -4], [-11, 0], [-14, 4], [-9, 8], [-13, 15], [-9, 15]]);
      c.fillStyle = dk; c.beginPath(); c.ellipse(5, 0, 3, 1.4, 0, 0, 7); c.fill();
      c.fillRect(-7, -6, 6, 1.2); c.fillRect(-7, 4.8, 6, 1.2);
      break;
    case 'attacker':
      poly([[15, 0], [10, -3], [4, -3], [2, -14], [-4, -14], [-4, -3], [-12, -3], [-14, -7], [-17, -7], [-16, 0],
        [-17, 7], [-14, 7], [-12, 3], [-4, 3], [-4, 14], [2, 14], [4, 3], [10, 3]]);
      for (const y of [-10, -6.5, 6.5, 10]) { c.fillStyle = dk; c.beginPath(); c.ellipse(-1, y, 3.4, 1.3, 0, 0, 7); c.fill(); }
      c.fillStyle = dk; c.beginPath(); c.ellipse(9, 0, 2.6, 1.3, 0, 0, 7); c.fill();
      break;
    case 'destroyer':
      poly([[-17, 1], [17, 1], [12, 8], [-14, 8]]);
      poly([[-9, 1], [-9, -4], [-4, -4], [-4, -8], [3, -8], [3, -4], [6, 1]]);
      bar(-0.5, -8, -0.5, -14, 1.7); bar(-4, -11.5, 3, -11.5, 1.5);
      rr(8, -3, 5, 4, 1); c.fillRect(11, -2.2, 6, 1.7);
      rr(-15, -2, 4, 3, 1);
      c.fillStyle = dk; for (const x of [-11, -5, 1, 7]) dot(x, 4.5, 1);
      break;
  }
}

// 繪製一枚部隊棋子
function drawCounter(c, cx, cy, type, side, o = {}) {
  const d = UNITS[type], S = SIDES[side];
  const air = d.cat === 'air';
  const oy = air ? -6 : -2, w = 44, h = 32, rad = air ? 13 : 6;
  if (air) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(cx, cy + 13, 16, 4, 0, 0, 7); c.fill(); }
  const top = cy - h / 2 + oy;
  // 聯邦：圓角；帝國：切角八邊形
  const shape = () => {
    if (side === 1 && !air) {
      const k = 8, x0 = cx - w / 2, x1 = cx + w / 2, y1 = top + h;
      c.beginPath(); c.moveTo(x0 + k, top); c.lineTo(x1 - k, top); c.lineTo(x1, top + k); c.lineTo(x1, y1 - k);
      c.lineTo(x1 - k, y1); c.lineTo(x0 + k, y1); c.lineTo(x0, y1 - k); c.lineTo(x0, top + k); c.closePath();
    } else roundRect(c, cx - w / 2, top, w, h, side === 1 ? 4 : rad);
  };
  const g = c.createLinearGradient(0, top, 0, top + h);
  g.addColorStop(0, S.color); g.addColorStop(1, S.dark);
  shape(); c.fillStyle = g; c.fill();
  c.strokeStyle = o.highlight ? '#ffe27a' : S.trim; c.lineWidth = o.highlight ? 2.6 : 1.6; c.stroke();
  c.save(); c.translate(cx, cy + oy);
  if (side === 1) c.scale(-1, 1);
  drawIcon(c, d.base, S.dark, side);
  c.restore();
  // 陣營徽記（左下）
  c.save(); c.translate(cx - w / 2 + 6, top + h - 6);
  if (side === 0) {
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 1.5 : 3.6; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#fff'; c.fill();
  } else {
    c.beginPath(); c.moveTo(0, -4); c.lineTo(4, 0); c.lineTo(0, 4); c.lineTo(-4, 0); c.closePath();
    c.fillStyle = S.trim; c.fill(); c.fillStyle = S.dark; circle(c, 0, 0, 1.4); c.fill();
  }
  c.restore();
  if (o.done) { shape(); c.fillStyle = 'rgba(10,10,10,0.45)'; c.fill(); }
  if (o.label) {
    c.font = 'bold 10px -apple-system, "PingFang TC", sans-serif';
    const tw = c.measureText(d.name).width + 8;
    roundRect(c, cx - tw / 2, top + h - 1, tw, 12, 3);
    c.fillStyle = 'rgba(8,12,16,0.82)'; c.fill();
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
    c.strokeText('⛽', cx - w / 2 + 1, top + 1); c.fillText('⛽', cx - w / 2 + 1, top + 1);
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
