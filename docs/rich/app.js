// ===== 環島富豪 3D：畫面、操作與線上連線 =====
// 規則在 logic.js（window.RICH）。線上對戰：房主的瀏覽器執行規則，透過 PeerJS（WebRTC 點對點）把遊戲狀態傳給其他玩家。
import * as THREE from '../vendor/three.min.js';

const R = window.RICH;
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let G = null;
const NET = { role: 'local', peer: null, conns: [], host: null, myIds: new Set(), seats: null, code: '' };

// ============================================================ 音效
const SND = { on: (() => { try { return localStorage.getItem('rich_sound') !== '0'; } catch (e) { return true; } })(), ctx: null };
function snd(kind) {
  if (!SND.on) return;
  try {
    const c = SND.ctx || (SND.ctx = new (window.AudioContext || window.webkitAudioContext)());
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime, g = c.createGain(); g.connect(c.destination);
    const tone = (f, d, at = 0, type = 'triangle', v = 0.18) => { const o = c.createOscillator(), gg = c.createGain(); o.type = type; o.frequency.value = f; gg.gain.setValueAtTime(v, t + at); gg.gain.exponentialRampToValueAtTime(0.001, t + at + d); o.connect(gg); gg.connect(g); o.start(t + at); o.stop(t + at + d + 0.02); };
    if (kind === 'step') tone(660, 0.07, 0, 'sine', 0.08);
    else if (kind === 'dice') for (let k = 0; k < 6; k++) tone(180 + Math.random() * 220, 0.05, k * 0.06, 'square', 0.05);
    else if (kind === 'cash') { tone(988, 0.12); tone(1319, 0.2, 0.09); }
    else if (kind === 'pay') { tone(392, 0.15); tone(262, 0.25, 0.12); }
    else if (kind === 'build') { tone(523, 0.1); tone(659, 0.1, 0.08); tone(784, 0.2, 0.16); }
    else if (kind === 'card') { tone(880, 0.08); tone(1175, 0.15, 0.07); }
    else if (kind === 'turn') tone(587, 0.12, 0, 'sine', 0.1);
    else if (kind === 'bad') { tone(220, 0.3, 0, 'sawtooth', 0.08); }
  } catch (e) { /* 忽略 */ }
}
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); }, { passive: true }));

// ============================================================ 3D 場景
const S = 10, HALF = 5;   // 每格 10 單位；棋盤 11×11 格的外圈
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0f14');
scene.fog = new THREE.Fog('#0b0f14', 260, 520);
const camera = new THREE.PerspectiveCamera(38, 1, 1, 2000);
scene.add(new THREE.HemisphereLight('#eef4ff', '#4a4232', 1.1));
const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
sun.position.set(-60, 120, 70); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 400 });
scene.add(sun);

// 格子在棋盤上的位置（0 在右下角，逆時針）與文字朝向
function tilePos(i) {
  const side = Math.floor(i / 10), k = i % 10;
  let gx, gz;
  if (side === 0) { gx = HALF - k; gz = HALF; } else if (side === 1) { gx = -HALF; gz = HALF - k; }
  else if (side === 2) { gx = -HALF + k; gz = -HALF; } else { gx = HALF; gz = -HALF + k; }
  return new THREE.Vector3(gx * S, 0, gz * S);
}
const sideOf = i => Math.floor(i / 10) % 4;
const inward = i => { const p = tilePos(i), ax = Math.abs(p.x), az = Math.abs(p.z); return ax > az + 0.1 ? new THREE.Vector3(-Math.sign(p.x), 0, 0) : az > ax + 0.1 ? new THREE.Vector3(0, 0, -Math.sign(p.z)) : new THREE.Vector3(-Math.sign(p.x), 0, -Math.sign(p.z)).multiplyScalar(0.7); };

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const TYPE_STYLE = {
  start: ['#fff3c4', '#c0392b', '起點', '經過領 $1200'], chance: ['#fff1d6', '#e67e22', '機會', '？'], fate: ['#e8f0ff', '#2f6fd6', '命運', '！'],
  tax: ['#f1f1f1', '#666', '稅務局', '繳 10%'], jail: ['#e9e9e9', '#444', '監獄', '探監'], gojail: ['#ffe2e2', '#b0302a', '入獄', '直接入獄'],
  park: ['#e2f6e0', '#2f8f46', '公園', '休息'], shop: ['#f4e6ff', '#8a49c8', '道具屋', '得到道具'], station: ['#eef2f6', '#334155', '', '交通'],
};
const board = new THREE.Group(); scene.add(board);
(function buildBoard() {
  // 中央：深綠桌面＋標題
  const center = new THREE.Mesh(new THREE.BoxGeometry(S * 9.2, 1, S * 9.2), new THREE.MeshStandardMaterial({ color: '#173b2c', roughness: 0.9 }));
  center.position.y = -0.4; center.receiveShadow = true; board.add(center);
  const title = new THREE.Mesh(new THREE.PlaneGeometry(S * 7, S * 3.5), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(1024, 512, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 150px "PingFang TC","Noto Sans TC",sans-serif'; c.fillStyle = 'rgba(255,214,102,.92)'; c.fillText('環島富豪', w / 2, h * 0.42);
    c.font = '600 48px "PingFang TC","Noto Sans TC",sans-serif'; c.fillStyle = 'rgba(220,235,225,.6)'; c.fillText('TAIWAN TYCOON 3D', w / 2, h * 0.75);
  }) }));
  title.rotation.x = -Math.PI / 2; title.position.y = 0.15; board.add(title);
  const base = new THREE.Mesh(new THREE.BoxGeometry(S * 11.4, 2, S * 11.4), new THREE.MeshStandardMaterial({ color: '#2a2218', roughness: 1 }));
  base.position.y = -1.6; base.receiveShadow = true; board.add(base);
  R.BOARD.forEach((t, i) => {
    const corner = i % 10 === 0, gc = t.group ? R.GROUPS[t.group].color : null;
    const [bg, accent, label, sub] = TYPE_STYLE[t.type] || ['#fbf6ea', gc, t.name, '$' + t.price];
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      if (t.type === 'land') { c.fillStyle = gc; c.fillRect(0, 0, w, 64); }
      else { c.fillStyle = accent; c.fillRect(0, 0, w, 14); }
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1d2026';
      const name = t.type === 'land' || t.type === 'station' ? t.name : label;
      c.font = `800 ${name.length > 2 ? 58 : 70}px "PingFang TC","Noto Sans TC",sans-serif`; c.fillText(name, w / 2, t.type === 'land' ? 125 : 108);
      c.font = '700 34px "PingFang TC","Noto Sans TC",sans-serif'; c.fillStyle = t.type === 'land' ? '#5b4a2a' : accent;
      c.fillText(t.type === 'land' || t.type === 'station' ? '$' + t.price : sub, w / 2, t.type === 'land' ? 190 : 182);
    });
    const tile = new THREE.Mesh(new THREE.BoxGeometry(S * 0.96, 1.4, S * 0.96), [
      new THREE.MeshStandardMaterial({ color: '#d8ccb0' }), new THREE.MeshStandardMaterial({ color: '#d8ccb0' }),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: '#d8ccb0' }),
      new THREE.MeshStandardMaterial({ color: '#d8ccb0' }), new THREE.MeshStandardMaterial({ color: '#d8ccb0' })]);
    const p = tilePos(i); tile.position.set(p.x, 0, p.z);
    // 文字朝向棋盤外側（從外面看是正的）
    tile.rotation.y = corner ? 0 : [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(i)];
    if (corner) tile.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][i / 10];
    tile.receiveShadow = true; tile.userData.i = i; board.add(tile);
    // 角落與特殊格加一點立體裝飾
    if (t.type === 'jail') addProp(i, () => { const g = new THREE.Group(); for (let k = -2; k <= 2; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 6), new THREE.MeshStandardMaterial({ color: '#555' })); b.position.set(k * 1.2, 3, -2.5); g.add(b); } return g; });
    if (t.type === 'park') addProp(i, () => tree());
    if (t.type === 'start') addProp(i, () => { const f = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.2), new THREE.MeshStandardMaterial({ color: '#c0392b' })); f.position.set(1.5, 7, -3); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#ddd' })); pole.position.set(0, 4, -3); const g = new THREE.Group(); g.add(f, pole); return g; });
  });
  function addProp(i, make) { const m = make(); const p = tilePos(i); m.position.add(new THREE.Vector3(p.x, 0.7, p.z)); m.traverse(o => { o.castShadow = true; }); board.add(m); }
  // 中央的樹與小島裝飾
  for (const [x, z] of [[-30, -28], [32, -30], [-34, 26], [30, 30], [-12, 30], [14, -32]]) { const tr = tree(); tr.position.set(x, 0, z); tr.traverse(o => { o.castShadow = true; }); board.add(tr); }
})();
function tree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b' })); trunk.position.y = 1.2;
  const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.4, 7), new THREE.MeshStandardMaterial({ color: '#2f7d3b', flatShading: true })); top.position.y = 4.2;
  g.add(trunk, top); return g;
}

// ---------- 建築（依擁有者與等級）----------
const buildG = new THREE.Group(); scene.add(buildG);
let buildKey = '';
function houseMesh(level, color) {
  const g = new THREE.Group(), wall = new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.8 }), roof = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const win = new THREE.MeshStandardMaterial({ color: '#7fb4d8', emissive: '#1d3550', roughness: 0.3 });
  const house = (x, z, s = 1) => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.4 * s, 2 * s, 2.4 * s), wall); b.position.set(x, s, z); const r = new THREE.Mesh(new THREE.ConeGeometry(2.1 * s, 1.6 * s, 4), roof); r.position.set(x, 2 * s + 0.8 * s, z); r.rotation.y = Math.PI / 4; g.add(b, r); };
  if (level === 1) house(0, 0, 1.1);
  else if (level === 2) { house(-1.5, 0, 1.05); house(1.6, 0.2, 0.9); }
  else if (level === 3) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.6, 6, 3.4), wall); b.position.y = 3; g.add(b);
    for (let y = 1; y < 6; y += 1.6) for (const x of [-1.4, 0, 1.4]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), win); w.position.set(x, y, 1.72); g.add(w); }
    const r = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.5, 3.7), roof); r.position.y = 6.25; g.add(r);
  } else if (level === 4) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 12, 4.2), new THREE.MeshStandardMaterial({ color: '#cfd8e3', metalness: 0.3, roughness: 0.35 })); b.position.y = 6; g.add(b);
    for (let y = 1; y < 12; y += 1.4) { const w = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.55, 4.3), win); w.position.y = y; g.add(w); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), roof); top.position.y = 12.8; g.add(top);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), new THREE.MeshStandardMaterial({ color: '#ddd' })); sp.position.y = 15; g.add(sp);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function syncBuildings() {
  const key = G.tiles.map(t => `${t.owner}:${t.level}`).join(',') + '|' + G.blocks.map(b => b.i).join(',');
  if (key === buildKey) return; buildKey = key;
  buildG.clear();
  G.tiles.forEach((s, i) => {
    const p = tilePos(i), inw = inward(i);
    if (s.owner != null) {
      const col = G.players[s.owner].color;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(S * 0.96, 0.25, S * 0.96), new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.5 }));
      plate.position.set(p.x, 0.8, p.z); buildG.add(plate);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.12), new THREE.MeshStandardMaterial({ color: col }));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4), new THREE.MeshStandardMaterial({ color: '#eee' }));
      const fx = p.x + inw.x * 3.6 + (inw.z ? 3.5 : 0), fz = p.z + inw.z * 3.6 + (inw.x ? 3.5 : 0);
      pole.position.set(fx, 2.4, fz); flag.position.set(fx + 0.8, 3.6, fz); buildG.add(pole, flag);
      if (s.level > 0) { const h = houseMesh(s.level, col); h.position.set(p.x + inw.x * 1.5, 0.7, p.z + inw.z * 1.5); buildG.add(h); }
    }
  });
  for (const b of G.blocks) {
    const p = tilePos(b.i), cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3, 12), new THREE.MeshStandardMaterial({ color: '#e74c3c' }));
    cone.position.set(p.x, 2.2, p.z); cone.castShadow = true; buildG.add(cone);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: '#f5f5f5' })); bar.position.set(p.x, 1.6, p.z); buildG.add(bar);
  }
}

// ---------- 玩家棋子（原創角色：圓滾滾的小人，每人不同帽子）----------
const tokens = [];
function makeToken(pl) {
  const g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.5 }), skin = new THREE.MeshStandardMaterial({ color: '#f2c9a0', roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 1.4, 6, 12), body); b.position.y = 1.9; g.add(b);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 14), skin); head.position.y = 4.4; g.add(head);
  for (const x of [-0.45, 0.45]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: '#1b1b1b' })); e.position.set(x, 4.55, 1.2); g.add(e); }
  const hatM = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.4 });
  const hat = R.CHARS[pl.char].hat;
  if (hat === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM); c.position.y = 4.7; const v = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.2), hatM); v.position.set(0, 4.75, 1.3); g.add(c, v); }
  else if (hat === 'bow') { for (const x of [-0.7, 0.7]) { const k = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), hatM); k.position.set(x, 5.9, 0); k.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(k); } }
  else if (hat === 'hat') { const brim = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.15, 20), hatM); brim.position.y = 5.3; const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.4, 16), hatM); top.position.y = 6; g.add(brim, top); }
  else { const cr = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.9, 5, 1, true), new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })); cr.position.y = 5.9; g.add(cr); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.9);
  scene.add(g);
  return { g, pos: pl.pos, path: [], t: 0, moveN: 0 };
}
const slotOff = k => new THREE.Vector3([-2, 2, -2, 2][k], 0, [-2, -2, 2, 2][k]);
function tokenWorld(i, k) { return tilePos(i).add(slotOff(k)).setY(0.7); }

// ---------- 骰子 ----------
const pipTex = n => canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, w); c.fillStyle = n === 1 ? '#c0392b' : '#1b1b1b';
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  for (const [x, y] of P) { c.beginPath(); c.arc(x * w, y * w, n === 1 ? 16 : 11, 0, 7); c.fill(); }
});
const FACE = [3, 4, 1, 6, 2, 5];   // +x, -x, +y, -y, +z, -z
const diceMats = FACE.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.4 }));
const dice = [0, 1].map(k => { const m = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), diceMats); m.castShadow = true; m.position.set(k ? 4 : -4, 2.2, 8); scene.add(m); return m; });
const UP = { 1: [0, 0], 2: [-Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI / 2, 0], 6: [Math.PI, 0] };
let diceAnim = null, diceN = 0;
function rollDice(a, b) {
  diceAnim = { t0: performance.now(), dur: 900, end: [a, b], spin: [new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6), new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6)] };
  snd('dice');
}
function stepDice(now) {
  if (!diceAnim) return;
  const t = Math.min(1, (now - diceAnim.t0) / diceAnim.dur);
  dice.forEach((d, k) => {
    const [rx, rz] = UP[diceAnim.end[k]];
    if (t < 1) { const s = (1 - t) * 1.2; d.rotation.set(rx + diceAnim.spin[k].x * s, d.rotation.y + 0.02, rz + diceAnim.spin[k].z * s); d.position.y = 2.2 + Math.abs(Math.sin(t * Math.PI * 3)) * 8 * (1 - t); }
    else { d.rotation.set(rx, k * 0.4, rz); d.position.y = 2.2; }
  });
  if (t >= 1) diceAnim = null;
}

// ---------- 鏡頭：可拖曳旋轉、滾輪／雙指縮放，自動看向目前玩家 ----------
const camS = { yaw: 0.6, pitch: 0.95, dist: 175, target: new THREE.Vector3(), goal: new THREE.Vector3() };
function updateCamera() {
  camS.target.lerp(camS.goal, 0.06);
  const d = camS.dist, cp = Math.cos(camS.pitch);
  camera.position.set(camS.target.x + Math.sin(camS.yaw) * cp * d, camS.target.y + Math.sin(camS.pitch) * d, camS.target.z + Math.cos(camS.yaw) * cp * d);
  camera.lookAt(camS.target);
}
(function input() {
  const pts = new Map(); let last = null, pinch = null;
  canvas.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ } last = { x: e.clientX, y: e.clientY }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: camS.dist }; } });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; camS.dist = Math.max(70, Math.min(320, pinch.dist * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); return; }
    if (!last) return;
    camS.yaw -= (e.clientX - last.x) * 0.006; camS.pitch = Math.max(0.35, Math.min(1.45, camS.pitch + (e.clientY - last.y) * 0.004));
    last = { x: e.clientX, y: e.clientY };
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { const [p] = pts.values(); last = { ...p }; } if (!pts.size) last = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) camS.dist *= Math.exp(e.deltaY * 0.01); else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) camS.yaw += e.deltaX * 0.004; else camS.dist *= Math.exp(e.deltaY * 0.0015); camS.dist = Math.max(70, Math.min(320, camS.dist)); }, { passive: false });
})();
function resize() {
  const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 每幀 ----------
let lastFx = '', lastCard = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (G) {
    syncBuildings();
    G.players.forEach((pl, k) => {
      const tk = tokens[k] || (tokens[k] = makeToken(pl));
      tk.g.visible = !pl.bankrupt;
      // 新的移動：沿路徑逐格跳
      if (G.move && G.move.p === k && G.move.n !== tk.moveN) { tk.moveN = G.move.n; tk.path = [...G.move.path]; tk.t = 0; tk.from = tk.pos; }
      if (tk.path.length) {
        tk.t += 0.075;
        const a = tokenWorld(tk.from, k), b = tokenWorld(tk.path[0], k), f = Math.min(1, tk.t);
        tk.g.position.lerpVectors(a, b, f); tk.g.position.y += Math.sin(f * Math.PI) * 3.5;
        tk.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        if (f >= 1) { tk.from = tk.path.shift(); tk.pos = tk.from; tk.t = 0; snd('step'); }
      } else { tk.pos = pl.pos; tk.g.position.copy(tokenWorld(pl.pos, k)); tk.g.position.y += k === G.cur ? Math.abs(Math.sin(now / 300)) * 0.8 : 0; }
    });
    const ct = tokens[G.cur];
    if (ct) camS.goal.copy(ct.g.position).multiplyScalar(0.45).setY(0);
  }
  stepDice(now);
  updateCamera();
  renderer.render(scene, camera);
}

// ============================================================ 畫面上的介面
const mine = pid => NET.role === 'local' ? G.players[pid].kind !== 'ai' : NET.myIds.has(pid);
const animBusy = () => tokens.some(t => t && t.path && t.path.length) || !!diceAnim;
function toast(s, ms = 1800) { const t = $('#toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }
function openModal(html, ready) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); ready && ready($('#modalBox')); }
function closeModal() { $('#modal').classList.add('hidden'); }
let shownAsk = null;
function renderUI() {
  if (!G) return;
  $('#roundInfo').textContent = G.phase === 'over' ? '遊戲結束' : `第 ${G.round} / ${G.maxRounds} 輪`;
  $('#players').innerHTML = G.players.map((p, k) => `<div class="pcard ${k === G.cur && G.phase !== 'over' ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" style="--c:${p.color}">
    <div class="av">${p.name[0]}</div><b>${p.name}${p.kind === 'ai' ? ' <small>電腦</small>' : mine(k) && NET.role !== 'local' ? ' <small>你</small>' : ''}${p.jail ? ' <small>🔒監獄</small>' : ''}</b>
    <div><span class="cash">$${p.cash.toLocaleString()}</span> <small>地 ${R.lands(G, p).length}・道具 ${p.items.length}</small></div></div>`).join('');
  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  $('#turnName').innerHTML = G.phase === 'over' ? `🏆 <b>${G.players[G.winner].name}</b> 獲勝` : `輪到 <b style="color:${p.color}">${p.name}</b>${my ? '（你）' : p.kind === 'ai' ? '（電腦思考中…）' : '（等待對方）'}`;
  $('#btnRoll').disabled = !(my && G.phase === 'roll' && !animBusy());
  $('#btnItem').disabled = !(my && G.phase === 'roll' && p.items.length);
  $('#btnEnd').disabled = !(my && G.phase === 'done' && !animBusy());
  $('#logBox').innerHTML = G.log.slice().reverse().map(s => `<div>${s}</div>`).join('');
  // 機會／命運卡片
  if (G.card && G.card.n !== lastCard) { lastCard = G.card.n; const c = G.card; setTimeout(() => showCard(c), animDelay()); }
  // 購買／蓋房詢問（只問擁有該玩家的裝置）
  if (G.ask && my && shownAsk !== G.turn + ':' + G.ask.i + G.ask.k) { shownAsk = G.turn + ':' + G.ask.i + G.ask.k; const q = G.ask; setTimeout(() => askPrompt(q), animDelay()); }
  if (G.fx && JSON.stringify(G.fx) + G.turn !== lastFx) { lastFx = JSON.stringify(G.fx) + G.turn; const fk = G.fx.k; setTimeout(() => snd({ rent: 'pay', buy: 'cash', build: 'build', jail: 'bad', demolish: 'bad' }[fk] || 'turn'), animDelay()); }
  if (G.phase === 'over') setTimeout(showResult, 800);
}
// 移動動畫還要多久播完（擲骰後才計算；之後的詢問、結束不再重複等待）
let moveAt = 0;
const animDelay = () => Math.max(350, moveAt + (G.move ? G.move.path.length : 0) * 230 + 950 - performance.now());
function showCard(c) {
  const el = $('#cardPop'); el.style.setProperty('--c', c.kind === 'chance' ? '#e67e22' : '#4f7fe0');
  el.innerHTML = `<h3>${c.kind === 'chance' ? '機 會' : '命 運'}</h3><p>${c.text}</p>`; el.classList.remove('hidden'); snd('card');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2600);
}
function askPrompt(q) {
  if (!q || !G.ask || G.ask.i !== q.i) return;
  const t = R.BOARD[q.i], s = G.tiles[q.i], p = R.cur(G);
  const buy = q.k === 'buy';
  const nextLv = buy ? 0 : s.level + 1;
  openModal(`<h2>${buy ? '要買下這塊地嗎？' : '要加蓋嗎？'}</h2>
    <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
      <span>${buy ? '價格' : '費用'}</span><b>$${q.cost.toLocaleString()}</b>
      ${buy ? '' : `<span>升級</span><b>${R.LEVEL_NAME[s.level]} → ${R.LEVEL_NAME[nextLv]}</b>`}
      <span>現金</span><b>$${p.cash.toLocaleString()} → $${(p.cash - q.cost).toLocaleString()}</b></div>
    <div class="row"><button id="aNo">不要</button><button class="primary" id="aYes">${buy ? '買下' : '加蓋'}</button></div>`, box => {
    box.querySelector('#aYes').onclick = () => { closeModal(); send({ type: 'answer', yes: true }); };
    box.querySelector('#aNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
  });
}
function showResult() {
  if (!$('#modal').classList.contains('hidden')) return;
  const rank = G.players.map(p => ({ p, w: p.bankrupt ? -1 : R.netWorth(G, p) })).sort((a, b) => b.w - a.w);
  openModal(`<h2>🏆 ${G.players[G.winner].name} 獲勝</h2><div class="sub">依總資產（現金＋地價＋建築）排名</div>
    ${rank.map((r, k) => `<div class="seat"><span class="dot" style="background:${r.p.color}"></span><b>${k + 1}. ${r.p.name}</b><span>${r.w < 0 ? '破產' : '$' + r.w.toLocaleString()}</span></div>`).join('')}
    <div class="row"><button id="rBack">回到大戰略</button><button class="primary" id="rAgain">再玩一局</button></div>`, box => {
    box.querySelector('#rBack').onclick = () => { location.href = '../'; };
    box.querySelector('#rAgain').onclick = () => { closeModal(); leaveNet(); openLobby(); };
  });
}
function openItems() {
  const p = R.cur(G);
  openModal(`<h2>使用道具</h2><div class="sub">擲骰前可以使用。免租卡會在付過路費時自動使用。</div>
    <div class="items">${p.items.map((k, n) => `<button data-k="${k}" ${k === 'free' ? 'disabled' : ''}><b>${R.ITEMS[k].name}</b><small>${R.ITEMS[k].desc}</small></button>`).join('')}</div>
    <div class="row"><button class="close">關閉</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'reverse') { closeModal(); send({ type: 'item', item: k }); }
      else if (k === 'remote') pickNumber('遙控骰子：選擇點數', 2, 12, n => send({ type: 'item', item: k, n }));
      else if (k === 'block') pickNumber('路障：放在前方第幾格', 1, 6, n => send({ type: 'item', item: k, n }));
      else if (k === 'demolish') {
        const opts = G.tiles.map((s, i) => i).filter(i => G.tiles[i].owner != null && G.tiles[i].owner !== p.id && G.tiles[i].level > 0);
        if (!opts.length) return toast('對手還沒有任何建築');
        openModal(`<h2>拆除卡：選擇對手的建築</h2><div class="items">${opts.map(i => `<button data-i="${i}"><b>${R.BOARD[i].name}</b><small>${G.players[G.tiles[i].owner].name}・${R.LEVEL_NAME[G.tiles[i].level]}</small></button>`).join('')}</div><div class="row"><button class="close">取消</button></div>`, bx => {
          bx.querySelector('.close').onclick = closeModal;
          bx.querySelectorAll('[data-i]').forEach(x => x.onclick = () => { closeModal(); send({ type: 'item', item: k, i: +x.dataset.i }); });
        });
      }
    });
  });
}
function pickNumber(title, lo, hi, cb) {
  let h = ''; for (let n = lo; n <= hi; n++) h += `<button data-n="${n}">${n}</button>`;
  openModal(`<h2>${title}</h2><div class="items" style="grid-template-columns:repeat(6,1fr)">${h}</div><div class="row"><button class="close">取消</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { closeModal(); cb(+b.dataset.n); });
  });
}
$('#btnRoll').onclick = () => send({ type: 'roll' });
$('#btnEnd').onclick = () => send({ type: 'end' });
$('#btnItem').onclick = openItems;
$('#btnLog').onclick = () => $('#logBox').classList.toggle('hidden');
$('#btnSound').onclick = () => { SND.on = !SND.on; $('#btnSound').textContent = SND.on ? '🔊' : '🔇'; try { localStorage.setItem('rich_sound', SND.on ? '1' : '0'); } catch (e) { /* 忽略 */ } };
$('#btnSound').textContent = SND.on ? '🔊' : '🔇';
$('#btnMenu').onclick = () => openModal(`<h2>選單</h2><div class="row" style="justify-content:flex-start">
  <button id="mHelp">玩法說明</button><button id="mNew">重新開局</button><button id="mBack">回到大戰略</button></div><div class="row"><button class="close">關閉</button></div>`, box => {
  box.querySelector('.close').onclick = closeModal;
  box.querySelector('#mHelp').onclick = openHelp;
  box.querySelector('#mNew').onclick = () => { if (confirm('確定放棄目前的遊戲？')) { closeModal(); leaveNet(); openLobby(); } };
  box.querySelector('#mBack').onclick = () => { location.href = '../'; };
});
function openHelp() {
  openModal(`<h2>玩法說明</h2><div class="sub" style="font-size:14px;color:var(--text)">
  ・輪到你時擲兩顆骰子前進，經過起點領 $1200。<br>・停在空地可以買下；停在自己的地可以加蓋（平房 → 透天 → 公寓 → 大樓），過路費越來越高；同一區全部買下時過路費加倍。<br>
  ・停在別人的地要付過路費，現金不夠會自動變賣土地，還是不夠就破產。<br>・機會、命運卡有好有壞；道具屋可以拿到道具（路障、遙控骰子、免租卡、迴轉卡、拆除卡）。<br>
  ・踩到「入獄」要在監獄待兩回合。<br>・只剩一人沒破產，或到達設定輪數時總資產最多的人獲勝。<br>・拖曳畫面旋轉視角，滾輪或雙指縮放。</div>
  <div class="row"><button class="close">知道了</button></div>`, box => { box.querySelector('.close').onclick = closeModal; });
}

// ============================================================ 動作送出與套用
function send(a) {
  const pid = G.cur;
  if (NET.role === 'client') { NET.host && NET.host.send({ t: 'act', pid, a }); return; }
  const err = R.act(G, pid, a);
  if (err) { toast(err); return; }
  afterChange(a);
}
function afterChange(a) {
  if (a && a.type === 'roll' && G.dice) { rollDice(G.dice.a, G.dice.b); moveAt = performance.now(); }
  broadcast(); renderUI(); scheduleAuto();
}
let autoTimer = null;
// 房主／單機：電腦玩家自動行動；擲完骰沒事可做時自動結束回合
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!G || G.phase === 'over' || NET.role === 'client') return;
  const p = R.cur(G);
  const wait = (G.phase === 'roll' ? 700 : animDelay()) + (G.card && G.phase === 'done' ? 1600 : 0);
  if (p.kind === 'ai') { autoTimer = setTimeout(() => { const a = R.aiAction(G); const e = R.act(G, p.id, a); if (e && a.type === 'item') R.act(G, p.id, { type: 'roll' }); afterChange(e && a.type === 'item' ? { type: 'roll' } : a); }, wait); return; }
  if (G.phase === 'done') autoTimer = setTimeout(() => { if (G.phase === 'done' && R.cur(G) === p) { R.act(G, p.id, { type: 'end' }); afterChange({ type: 'end' }); } }, wait + 700);
  if (p.kind === 'gone') autoTimer = setTimeout(() => { p.kind = 'ai'; scheduleAuto(); }, 300);
}
setInterval(() => { if (G) { const b1 = $('#btnRoll').disabled; renderUIButtons(); if (b1 !== $('#btnRoll').disabled) { /* 動畫結束後按鈕可按 */ } } }, 250);
function renderUIButtons() {
  if (!G) return; const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  $('#btnRoll').disabled = !(my && G.phase === 'roll' && !animBusy());
  $('#btnEnd').disabled = !(my && G.phase === 'done' && !animBusy());
}

// ============================================================ 線上連線（PeerJS）
const PEER_PREFIX = 'twtycoon3d-';
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function broadcast() { if (NET.role === 'host') for (const c of NET.conns) if (c.open) c.send({ t: 'state', G }); }
function leaveNet() { try { NET.peer && NET.peer.destroy(); } catch (e) { /* 忽略 */ } Object.assign(NET, { role: 'local', peer: null, conns: [], host: null, myIds: new Set(), seats: null, code: '' }); $('#netInfo').classList.add('hidden'); }
function netInfo(s) { const n = $('#netInfo'); n.textContent = s; n.classList.remove('hidden'); }

function startGame(seats, rounds) {
  G = R.newGame(seats, { maxRounds: rounds });
  tokens.forEach(t => t && scene.remove(t.g)); tokens.length = 0; buildKey = ''; lastCard = 0; shownAsk = null;
  closeModal(); broadcast(); renderUI(); scheduleAuto(); snd('turn');
}

// ---------- 開局畫面 ----------
function openLobby() {
  openModal(`<h2>環島富豪 3D</h2><div class="sub">原創 3D 地產大亨桌遊：擲骰繞行台灣、買地蓋樓、收過路費，讓對手破產！支援電腦對手與線上多人對戰。</div>
    <div class="row" style="justify-content:stretch;flex-direction:column">
      <button class="primary" id="lLocal">單機遊戲（對電腦或同一台輪流）</button>
      <button id="lHost">建立線上房間</button>
      <button id="lJoin">加入線上房間</button>
      <button id="lHelp">玩法說明</button>
      <button id="lBack">回到大戰略</button></div>`, box => {
    box.querySelector('#lLocal').onclick = openLocalSetup;
    box.querySelector('#lHost').onclick = openHost;
    box.querySelector('#lJoin').onclick = openJoin;
    box.querySelector('#lHelp').onclick = () => { openHelp(); $('#modalBox .close').onclick = openLobby; };
    box.querySelector('#lBack').onclick = () => { location.href = '../'; };
  });
}
const roundsSel = (v = 20) => `<label class="field">輪數上限 <select id="rounds">${[10, 15, 20, 30].map(n => `<option ${n === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
function openLocalSetup() {
  const kinds = ['local', 'ai', 'ai', 'ai'];
  openModal(`<h2>單機遊戲</h2><div class="sub">設定四個座位：玩家（同一台裝置輪流操作）、電腦或空位。</div>
    ${R.CHARS.map((c, k) => `<div class="seat"><span class="dot" style="background:${c.color}"></span><b>${c.name}</b>
      <select data-k="${k}"><option value="local" ${kinds[k] === 'local' ? 'selected' : ''}>玩家</option><option value="ai" ${kinds[k] === 'ai' ? 'selected' : ''}>電腦</option>${k > 1 ? '<option value="none">空位</option>' : ''}</select></div>`).join('')}
    ${roundsSel()}
    <div class="row"><button class="left" id="sBack">返回</button><button class="primary" id="sGo">開始</button></div>`, box => {
    box.querySelector('#sBack').onclick = openLobby;
    box.querySelector('#sGo').onclick = () => {
      const seats = [...box.querySelectorAll('select[data-k]')].map(s => s.value).filter(v => v !== 'none').map(kind => ({ kind }));
      if (!seats.some(s => s.kind === 'local')) seats[0].kind = 'local';
      NET.role = 'local'; startGame(seats, +box.querySelector('#rounds').value);
    };
  });
}
function openHost() {
  if (!window.Peer) return toast('連線元件載入失敗');
  leaveNet();
  NET.role = 'host'; NET.code = Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  NET.seats = R.CHARS.map((c, k) => ({ kind: k === 0 ? 'local' : 'open', owner: k === 0 ? 'host' : null, name: c.name }));
  NET.myIds = new Set([0]);
  const peer = NET.peer = new window.Peer(PEER_PREFIX + NET.code);
  const draw = () => {
    if (NET.role !== 'host' || G) return;
    openModal(`<h2>線上房間</h2><div class="sub">把房間代碼告訴朋友，對方在「加入線上房間」輸入即可。尚未有人加入的座位可以改成電腦。</div>
      <div class="code">${NET.code}</div><div class="sub" id="hStatus" style="text-align:center">${peer.open ? '房間已開啟，等待玩家加入…' : '正在連線伺服器…'}</div>
      ${NET.seats.map((s, k) => `<div class="seat"><span class="dot" style="background:${R.CHARS[k].color}"></span><b>${s.name}${k === 0 ? '（你）' : ''}</b>
        <span>${k === 0 ? '房主' : s.kind === 'remote' ? '✅ 已加入' : `<select data-k="${k}"><option value="open" ${s.kind === 'open' ? 'selected' : ''}>等待玩家</option><option value="ai" ${s.kind === 'ai' ? 'selected' : ''}>電腦</option><option value="none" ${s.kind === 'none' ? 'selected' : ''}>空位</option></select>`}</span></div>`).join('')}
      ${roundsSel()}
      <div class="row"><button class="left" id="hBack">取消</button><button class="primary" id="hGo">開始遊戲</button></div>`, box => {
      box.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { NET.seats[+s.dataset.k].kind = s.value; pushLobby(); });
      box.querySelector('#hBack').onclick = () => { leaveNet(); openLobby(); };
      box.querySelector('#hGo').onclick = () => {
        const used = NET.seats.map((s, k) => ({ ...s, k })).filter(s => s.kind === 'local' || s.kind === 'remote' || s.kind === 'ai');
        if (used.length < 2) return toast('至少需要兩位玩家（可以把座位設成電腦）');
        // 重新編號：座位順序即玩家 id
        const seats = used.map(s => ({ kind: s.kind === 'remote' ? 'remote' : s.kind, owner: s.owner, name: s.name }));
        NET.myIds = new Set(seats.map((s, k) => s.owner === 'host' ? k : -1).filter(k => k >= 0));
        for (const c of NET.conns) c.open && c.send({ t: 'start', ids: seats.map((s, k) => s.owner === c.peer ? k : -1).filter(k => k >= 0) });
        startGame(seats, +box.querySelector('#rounds').value);
        netInfo(`🌐 房主・${NET.code}`);
      };
    });
  };
  const pushLobby = () => { for (const c of NET.conns) c.open && c.send({ t: 'lobby', seats: NET.seats, code: NET.code }); draw(); };
  peer.on('open', draw);
  peer.on('error', e => { toast('連線錯誤：' + (e.type || e.message), 4000); if (e.type === 'unavailable-id') { leaveNet(); openHost(); } });
  peer.on('connection', conn => {
    conn.on('open', () => { NET.conns.push(conn); });
    conn.on('data', m => {
      if (m.t === 'hello') {
        if (G) { conn.send({ t: 'full', why: '遊戲已經開始' }); return; }
        const k = NET.seats.findIndex(s => s.kind === 'open');
        if (k < 0) { conn.send({ t: 'full', why: '房間已滿' }); return; }
        NET.seats[k] = { kind: 'remote', owner: conn.peer, name: String(m.name || R.CHARS[k].name).slice(0, 8) };
        pushLobby(); toast(`${NET.seats[k].name} 加入了房間`);
      } else if (m.t === 'act' && G) {
        // 只接受該玩家擁有的座位
        if (!G.players[m.pid] || G.players[m.pid].owner !== conn.peer) return;
        const err = R.act(G, m.pid, m.a);
        if (err) conn.send({ t: 'err', err }); else afterChange(m.a);
      }
    });
    conn.on('close', () => {
      NET.conns = NET.conns.filter(c => c !== conn);
      if (!G) { const k = NET.seats.findIndex(s => s.owner === conn.peer); if (k >= 0) { NET.seats[k] = { kind: 'open', owner: null, name: R.CHARS[k].name }; pushLobby(); } return; }
      G.players.forEach(p => { if (p.owner === conn.peer && !p.bankrupt) { p.kind = 'ai'; G.log.push(`${p.name} 離線，改由電腦接手`); } });
      afterChange(null); toast('有玩家離線，改由電腦接手');
    });
  });
  draw();
}
function openJoin() {
  if (!window.Peer) return toast('連線元件載入失敗');
  let saved = ''; try { saved = localStorage.getItem('rich_name') || ''; } catch (e) { /* 忽略 */ }
  openModal(`<h2>加入線上房間</h2><div class="sub">輸入朋友給你的房間代碼。</div>
    <label class="field">房間代碼 <input id="jCode" maxlength="5" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;width:140px"></label>
    <label class="field">你的名字 <input id="jName" maxlength="8" value="${saved}" placeholder="例如：小明"></label>
    <div class="sub" id="jStatus"></div>
    <div class="row"><button class="left" id="jBack">返回</button><button class="primary" id="jGo">加入</button></div>`, box => {
    box.querySelector('#jBack').onclick = openLobby;
    box.querySelector('#jGo').onclick = () => {
      const code = box.querySelector('#jCode').value.trim().toUpperCase(), name = box.querySelector('#jName').value.trim();
      if (code.length !== 5) return toast('房間代碼是 5 個字');
      try { localStorage.setItem('rich_name', name); } catch (e) { /* 忽略 */ }
      leaveNet(); NET.role = 'client'; NET.code = code;
      const st = box.querySelector('#jStatus'); st.textContent = '連線中…';
      const peer = NET.peer = new window.Peer();
      peer.on('error', e => { st.textContent = e.type === 'peer-unavailable' ? '找不到這個房間，請確認代碼' : '連線錯誤：' + (e.type || e.message); });
      peer.on('open', () => {
        const conn = NET.host = peer.connect(PEER_PREFIX + code, { reliable: true });
        conn.on('open', () => { conn.send({ t: 'hello', name }); st.textContent = '已連上，等待房主開始…'; });
        conn.on('data', m => {
          if (m.t === 'lobby') {
            if (G) return;
            openModal(`<h2>房間 ${m.code}</h2><div class="sub">等待房主開始遊戲…</div>${m.seats.map((s, k) => `<div class="seat"><span class="dot" style="background:${R.CHARS[k].color}"></span><b>${s.name}${s.owner === peer.id ? '（你）' : ''}</b><span>${s.kind === 'local' ? '房主' : s.kind === 'remote' ? '已加入' : s.kind === 'ai' ? '電腦' : s.kind === 'open' ? '等待中' : '空位'}</span></div>`).join('')}
              <div class="row"><button id="wLeave">離開</button></div>`, bx => { bx.querySelector('#wLeave').onclick = () => { leaveNet(); openLobby(); }; });
          } else if (m.t === 'start') { NET.myIds = new Set(m.ids); netInfo(`🌐 已連線・${code}`); }
          else if (m.t === 'state') {
            const first = !G, prevDice = G && G.dice ? G.dice.n : 0;
            G = m.G; if (first) { closeModal(); tokens.forEach(t => t && scene.remove(t.g)); tokens.length = 0; buildKey = ''; }
            if (G.dice && G.dice.n !== prevDice) { rollDice(G.dice.a, G.dice.b); moveAt = performance.now(); }
            renderUI();
          } else if (m.t === 'err') toast(m.err);
          else if (m.t === 'full') { st.textContent = m.why; toast(m.why); }
        });
        conn.on('close', () => { toast('與房主的連線中斷', 4000); netInfo('⚠ 連線中斷'); });
      });
    };
  });
}

// ============================================================ 啟動
resize();
requestAnimationFrame(frame);
openLobby();
window.__rich = { get G() { return G; }, send, NET };
