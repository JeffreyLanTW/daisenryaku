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

// ----- 部隊圖示（造型見 icons.js） -----
function lgrad(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// 繪製一枚部隊圖示（無外框、高對比國家單色卡通造型、大字體老花友善標示）
function drawCounter(c, cx, cy, type, side, o = {}) {
  const d = UNITS[type], ncol = typeof nationColor === 'function' ? nationColor(d.nation, side) : SIDES[side].color;
  const light = typeof isLightNation === 'function' && isLightNation(d.nation);
  const air = d.cat === 'air';
  const oy = air ? -5 : -2, w = 50, h = 38;
  const top = cy - h / 2 + oy;
  if (air) {
    c.fillStyle = 'rgba(0,0,0,0.32)'; c.beginPath(); c.ellipse(cx, cy + 15, 16, 4.5, 0, 0, 7); c.fill();
  } else {
    c.fillStyle = 'rgba(0,0,0,0.24)'; c.beginPath(); c.ellipse(cx, cy + 12, 18, 5, 0, 0, 7); c.fill();
  }
  // 選取或檢視高亮光暈（不使用方框外框）
  if (o.highlight) {
    c.fillStyle = 'rgba(255,226,122,0.42)';
    circle(c, cx, cy + oy, 24);
    c.fill();
  }

  c.save();
  if (o.done) c.globalAlpha = 0.48;
  c.drawImage(iconImage(d, side === 1), cx - ICON_W / 2 * 1.14, cy + oy + 1 - ICON_H / 2 * 1.14, ICON_W * 1.14, ICON_H * 1.14);
  c.restore();

  if (o.label) {
    c.font = 'bold 12px -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif';
    const tw = c.measureText(d.name).width + 10;
    roundRect(c, cx - tw / 2, top + h - 2, tw, 15, 4);
    c.fillStyle = o.done ? 'rgba(20,25,32,0.75)' : ncol; c.fill();
    if (!o.done && light) { c.strokeStyle = '#1e293b'; c.lineWidth = 1.4; c.stroke(); }
    c.fillStyle = o.done ? '#cbd5e1' : (light ? '#0f172a' : '#fff'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(d.name, cx, top + h + 5.5);
  }
  // 生命值圓標：一般部隊 <10 時顯示；次世代旗艦 (maxHp > 10) 或蜂群 (maxHp < 10) 隨時顯示
  const isSpecialHp = o.maxHp && o.maxHp !== 10;
  if (o.hp !== undefined && (o.hp < 10 || isSpecialHp)) {
    const isHeavy = o.maxHp && o.maxHp > 10;
    const isSwarm = o.maxHp && o.maxHp < 10;
    const hx = cx + w / 2 - 3, hy = top + 3;
    const rad = isHeavy ? 11 : 9.5;
    circle(c, hx, hy, rad);
    c.fillStyle = isHeavy ? '#0f766e' : (isSwarm ? '#854d0e' : (o.hp <= 3 ? '#b91c1c' : '#111827'));
    c.fill();
    c.strokeStyle = isHeavy ? '#2dd4bf' : (isSwarm ? '#f59e0b' : '#000');
    c.lineWidth = isHeavy || isSwarm ? 1.6 : 1.2;
    c.stroke();
    c.fillStyle = isHeavy ? '#ccfbf1' : (o.hp <= 3 ? '#fef08a' : '#fff');
    c.font = `bold ${isHeavy && o.hp >= 10 ? 10 : 13}px sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(o.hp, hx, hy + 0.5);
  }
  if (o.hasEscort) {
    // 航母 CAP 戰機護衛中狀態
    c.font = 'bold 8px sans-serif';
    roundRect(c, cx - w / 2 + 1, top + 2, 18, 10, 3); c.fillStyle = '#2563eb'; c.fill();
    c.strokeStyle = '#93c5fd'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('護衛', cx - w / 2 + 10, top + 7.2);
  } else if (o.hasAura) {
    // 矽盾/演算法光環加成狀態
    c.font = 'bold 8px sans-serif';
    roundRect(c, cx - w / 2 + 1, top + 2, 18, 10, 3); c.fillStyle = '#0891b2'; c.fill();
    c.strokeStyle = '#67e8f9'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('光環', cx - w / 2 + 10, top + 7.2);
  }
  if (o.vip) {
    c.save(); c.translate(cx, top - 2);
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 3.8 : 9; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffd34d'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.4; c.stroke();
    c.restore();
  }
  if (o.fuelLow) {
    c.font = 'bold 12px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.strokeStyle = '#000'; c.lineWidth = 3; c.fillStyle = '#fde047';
    c.strokeText('⛽', cx - w / 2 + 1, top + h - 14); c.fillText('⛽', cx - w / 2 + 1, top + h - 14);
  }
  if (o.allyAI) {
    c.font = 'bold 8px sans-serif';
    roundRect(c, cx - w / 2 + 1, top + 2, 15, 10, 3); c.fillStyle = ncol; c.fill();
    if (light) { c.strokeStyle = '#1e293b'; c.lineWidth = 1.2; c.stroke(); }
    c.fillStyle = light ? '#0f172a' : '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('友', cx - w / 2 + 8.5, top + 7.2);
  }
  if (o.cargo) {
    c.font = 'bold 10px sans-serif';
    roundRect(c, cx - 13, top + h - 13, 26, 12, 3); c.fillStyle = '#15803d'; c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('載' + o.cargo, cx, top + h - 6.5);
  }
  if (o.rank) {
    // 階級：金色 V 形臂章；王牌另加星
    const bx = cx + w / 2 - 7, by = top + h - 5;
    c.strokeStyle = '#000'; c.lineWidth = 3.8; c.lineJoin = 'miter';
    for (let k = 0; k < Math.min(o.rank, 2); k++) {
      c.beginPath(); c.moveTo(bx - 4.5, by - 4 - k * 4.5); c.lineTo(bx, by - 0.5 - k * 4.5); c.lineTo(bx + 4.5, by - 4 - k * 4.5); c.stroke();
    }
    c.strokeStyle = '#ffd34d'; c.lineWidth = 2.2;
    for (let k = 0; k < Math.min(o.rank, 2); k++) {
      c.beginPath(); c.moveTo(bx - 4.5, by - 4 - k * 4.5); c.lineTo(bx, by - 0.5 - k * 4.5); c.lineTo(bx + 4.5, by - 4 - k * 4.5); c.stroke();
    }
    if (o.rank >= 3) {
      c.save(); c.translate(bx, by - 14);
      c.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.2 : 5.2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#ffd34d'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.2; c.stroke();
      c.restore();
    }
  }
  if (o.tier) {
    c.font = 'bold 10px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.strokeStyle = '#000'; c.lineWidth = 3; c.fillStyle = '#7dd3fc';
    c.strokeText('改' + (o.tier > 1 ? o.tier : ''), cx - w / 2 + 2, top + 1); c.fillText('改' + (o.tier > 1 ? o.tier : ''), cx - w / 2 + 2, top + 1);
  }
  if (o.order) {
    c.fillStyle = '#ffd34d'; c.strokeStyle = '#000'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(cx + w / 2 - 9, top + h - 2); c.lineTo(cx + w / 2 - 9, top + h - 13); c.lineTo(cx + w / 2 - 1, top + h - 10); c.lineTo(cx + w / 2 - 9, top + h - 7); c.stroke(); c.fill();
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
  // 夜間：地形與據點蒙上一層夜色，部隊仍清楚可見
  if (isNight()) { ctx.fillStyle = 'rgba(8,16,48,0.38)'; ctx.fillRect(0, 0, terrainCvs.width / TS, terrainCvs.height / TS); }
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
    for (const [i, v] of UIS.reach) fillHex(i, v.merge ? 'rgba(90,220,120,0.55)' : v.canStop ? 'rgba(70,160,255,0.5)' : 'rgba(70,160,255,0.2)');
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
      maxHp: u.maxHp || d.maxHp || 10,
      hasAura: typeof unitAura === 'function' ? unitAura(u).hasAura : false,
      hasEscort: (d.base === 'carrier' || d.base === 'wingman_carrier') && typeof carrierEscort === 'function' ? !!carrierEscort(u) : false,
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
  cam.z = Math.max(0.25, Math.min(2.5, cam.z * factor));
  cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z;
  clampCam();
}
function fitView() {
  const [ww, wh] = worldSize(), [vw, vh] = viewSize();
  cam.z = Math.max(0.25, Math.min(1.2, Math.min(vw / ww, vh / wh) * 1.05));
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
    const [cx, cy] = tileCenter(u.x, u.y), ud = UNITS[u.type];
    mctx.fillStyle = typeof nationColor === 'function' ? nationColor(ud.nation, u.side) : SIDES[u.side].color;
    circle(mctx, cx, cy, R * 0.65); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 3.5; mctx.stroke();
  }
  const [vw, vh] = viewSize();
  mctx.strokeStyle = '#ffe27a'; mctx.lineWidth = 2 / s;
  mctx.strokeRect(cam.x, cam.y, vw / cam.z, vh / cam.z);
}
