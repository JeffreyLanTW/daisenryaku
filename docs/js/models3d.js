// ===== 3D 部隊模型（程式產生的低多邊形模型）=====
// 每個「兵種 × 國家 × 顏色」產生一次，合併成單一幾何（頂點色），之後所有同款部隊共用。
// 座標：+x 為車頭／機首／艦艏，y 向上，地面 y = 0；一格六角約 55 寬，模型長度約 26–50。
import * as THREE from '../vendor/three.min.js';

// ----- 組裝工具 -----
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 10, 7);
const HEMI = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);

function col(c) { return c instanceof THREE.Color ? c.clone() : new THREE.Color(c); }
function shade(c, f) { const k = col(c); return f < 0 ? k.multiplyScalar(1 + f) : k.lerp(new THREE.Color('#ffffff'), f); }

class Kit {
  constructor() { this.parts = []; }
  add(geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    g.applyMatrix4(_m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)));
    this.parts.push([g, col(c)]);
    return this;
  }
  // 方塊：中心 (x,y,z)
  box(w, h, d, x, y, z, c, ry = 0, rz = 0, rx = 0) { return this.add(BOX, c, x, y, z, rx, ry, rz, w, h, d); }
  ball(x, y, z, rx, ry, rz, c) { return this.add(SPH, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  dome(x, y, z, rx, ry, rz, c) { return this.add(HEMI, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  // 圓柱／圓錐：兩點之間（砲管、飛彈、桅杆、機身）
  tube(a, b, r, c, seg = 8, r2 = r) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), len = dir.length();
    let g = new THREE.CylinderGeometry(r2, r, len, seg, 1, false); g = g.index ? g.toNonIndexed() : g;
    _q.setFromUnitVectors(UP, dir.normalize());
    g.applyMatrix4(_m.compose(A.add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1)));
    this.parts.push([g, col(c)]);
    return this;
  }
  // 平面外形擠出：pts 為 [x, z] 的多邊形，從 y0 向上 h
  slab(pts, y0, h, c) {
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
    this.parts.push([g, col(c)]);
    return this;
  }
  // 左右對稱的平面（機翼、尾翼）：pts 只給右半邊 [x, z>=0]
  wing(pts, y, th, c) { this.slab(pts, y, th, c); return this.slab(pts.map(([x, z]) => [x, -z]).reverse(), y, th, c); }
  // 直立的平面（垂直尾翼）：pts 為 [x, y] 側視外形，z 為位置
  fin(pts, z, th, c, tilt = 0) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
    g.translate(0, 0, -th / 2);
    if (tilt) g.rotateX(tilt);
    g.translate(0, 0, z);
    this.parts.push([g, col(c)]);
    return this;
  }
  build() {
    let n = 0;
    for (const [g] of this.parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = new Float32Array(n * 3);
    let o = 0;
    for (const [g, c] of this.parts) {
      const p = g.attributes.position, q = g.attributes.normal;
      pos.set(p.array, o * 3);
      if (q) nor.set(q.array, o * 3);
      for (let i = 0; i < p.count; i++) { cl[(o + i) * 3] = c.r; cl[(o + i) * 3 + 1] = c.g; cl[(o + i) * 3 + 2] = c.b; }
      o += p.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    geo.computeBoundingBox(); geo.computeBoundingSphere();
    return geo;
  }
}

// ----- 國家資料 -----
const EAST = ['CN', 'RU', 'KP', 'VN', 'IN', 'PK'];
const BADGE = { TW: ['#1e3a8a', '#ffffff'], US: ['#1e3a8a', '#ffffff'], CN: ['#dc2626', '#facc15'], RU: ['#dc2626', '#ffffff'], KP: ['#dc2626', '#ffffff'],
  VN: ['#dc2626', '#facc15'], JP: ['#ffffff', '#dc2626'], KR: ['#ffffff', '#1e40af'], PH: ['#1e40af', '#facc15'], IN: ['#f97316', '#16a34a'],
  PK: ['#15803d', '#ffffff'], GB: ['#1e3a8a', '#dc2626'], FR: ['#1e3a8a', '#dc2626'], AU: ['#1e3a8a', '#dc2626'], DE: ['#111827', '#ffffff'],
  IL: ['#ffffff', '#1d4ed8'], TSMC: ['#0e7490', '#ffffff'], USCORP: ['#111827', '#ffffff'] };
// 主力戰車砲塔：楔形（西方長砲塔）／圓頂（蘇式）／方箱（歐日韓）／後置（梅卡瓦）
const TURRET = { US: 'wedge', TW: 'cast', AU: 'wedge', PH: 'small', IL: 'merkava', DE: 'box', JP: 'box', KR: 'wedge', GB: 'slab', FR: 'cast',
  CN: 'dome', RU: 'dome', KP: 'dome', VN: 'dome', IN: 'dome', PK: 'dome' };
const TWIN_TAIL = { fighter: ['US', 'JP', 'IL', 'RU', 'KP', 'AU'], multirole: ['US', 'RU', 'IN', 'DE'], attacker: ['US', 'PH', 'KR', 'AU'] };
const DELTA = { fighter: ['IN', 'FR', 'CN', 'VN'], multirole: ['TW', 'PK', 'CN'], attacker: ['IL', 'PK'] };
const CANARD = { multirole: ['CN'], attacker: ['IL'], fighter: [] };
const WHEELED_APC = ['RU', 'KP', 'IN', 'FR', 'DE', 'AU'];
const TANDEM = ['JP', 'GB'];          // 運輸直升機用雙旋翼（CH-47）
const h32 = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ----- 共用零件 -----
function roundel(k, nat, x, y, z, r, axis = 'y') {
  const [o, i] = BADGE[nat] || ['#ffffff', '#111111'];
  const rx = axis === 'z' ? Math.PI / 2 : 0, rz = axis === 'x' ? Math.PI / 2 : 0;
  const disc = (rr, c, d) => k.add(new THREE.CylinderGeometry(rr, rr, 0.3, 14), c, x + (axis === 'x' ? d : 0), y + (axis === 'y' ? d : 0), z + (axis === 'z' ? d : 0), rx, 0, rz);
  disc(r, o, 0); disc(r * 0.5, i, 0.12);
}
function tracks(k, L, W, h = 5, c = '#2b2d30') {
  for (const s of [-1, 1]) {
    k.box(L, h, 4.2, 0, h / 2, s * (W / 2 - 2.1), c);
    for (let i = 0; i < 5; i++) k.tube([-L / 2 + 3 + i * (L - 6) / 4, 2.4, s * (W / 2 + 0.05)], [-L / 2 + 3 + i * (L - 6) / 4, 2.4, s * (W / 2 - 4.25)], 2.1, '#5b5f66', 8);
  }
}
function wheels(k, xs, W, r = 2.6, c = '#25272a') {
  for (const x of xs) for (const s of [-1, 1]) k.tube([x, r, s * (W / 2 + 0.6)], [x, r, s * (W / 2 - 1.8)], r, c, 10);
}
function barrel(k, x, y, z, len, r, c, elev = 0, yaw = 0) {
  const ex = x + Math.cos(elev) * Math.cos(yaw) * len, ey = y + Math.sin(elev) * len, ez = z - Math.cos(elev) * Math.sin(yaw) * len;
  k.tube([x, y, z], [ex, ey, ez], r, c, 8);
  return [ex, ey, ez];
}
function missile(k, a, b, r, body = '#e5e7eb', tip = '#dc2626') {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(), u = d.clone().normalize();
  const T = A.clone().addScaledVector(u, L * 0.82);
  k.tube(a, T.toArray(), r, body, 8);
  k.tube(T.toArray(), b, r, tip, 8, 0.01);
}

// ----- 步兵 -----
function soldier(k, x, z, P, opt = {}) {
  const { body, dark, nat } = P;
  const s = opt.s || 1, y0 = opt.prone ? 0 : 0;
  if (opt.prone) {
    k.box(9 * s, 2.4 * s, 3.4 * s, x, 1.4 * s, z, body);
    k.ball(x + 5.2 * s, 2.4 * s, z, 1.7 * s, 1.7 * s, 1.7 * s, '#e6c49f');
    k.dome(x + 5.2 * s, 3.0 * s, z, 2.0 * s, 1.5 * s, 2.0 * s, dark);
    return;
  }
  k.box(2.2 * s, 4.2 * s, 1.4 * s, x, y0 + 2.1 * s, z - 0.9 * s, dark);    // 腿
  k.box(2.2 * s, 4.2 * s, 1.4 * s, x, y0 + 2.1 * s, z + 0.9 * s, dark);
  k.box(3.0 * s, 4.6 * s, 3.8 * s, x, y0 + 6.5 * s, z, body);               // 身體
  k.box(2.0 * s, 3.4 * s, 3.0 * s, x - 2.2 * s, y0 + 6.8 * s, z, dark);     // 背包
  k.ball(x + 0.2 * s, y0 + 10.0 * s, z, 1.7 * s, 1.8 * s, 1.7 * s, '#e6c49f');
  // 各國頭盔：蘇式寬圓、德式外翻、英式淺盤、軍帽、毛帽…
  const hy = y0 + 10.6 * s;
  if (['RU', 'KP', 'VN'].includes(nat)) k.dome(x, hy, z, 2.4 * s, 2.1 * s, 2.4 * s, body);
  else if (nat === 'DE') { k.dome(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body); k.box(5.2 * s, 0.4 * s, 5.2 * s, x - 0.3 * s, hy - 0.2 * s, z, dark); }
  else if (nat === 'GB') { k.dome(x, hy, z, 2.0 * s, 1.4 * s, 2.0 * s, body); k.tube([x, hy, z], [x, hy + 0.3 * s, z], 3.3 * s, dark, 12); }
  else if (nat === 'AU' || nat === 'PH') { k.tube([x, hy, z], [x, hy + 0.3 * s, z], 3.4 * s, dark, 12); k.tube([x, hy, z], [x, hy + 1.8 * s, z], 1.9 * s, body, 10, 1.5 * s); }
  else if (nat === 'FR') { k.tube([x, hy - 0.4 * s, z], [x, hy + 2.6 * s, z], 1.9 * s, body, 10, 1.7 * s); k.box(1.4 * s, 0.4 * s, 2.6 * s, x + 2 * s, hy - 0.2 * s, z, dark); }
  else if (nat === 'IN') { k.ball(x, hy + 0.6 * s, z, 2.3 * s, 1.7 * s, 2.3 * s, '#c2410c'); }
  else if (nat === 'JP') { k.dome(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body); k.tube([x + 1.6 * s, hy + 0.2 * s, z], [x + 2.6 * s, hy, z], 1.5 * s, dark, 8); }
  else k.dome(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body);
  const w = opt.weapon || 'rifle';
  if (w === 'rifle') k.box(6 * s, 0.8 * s, 0.8 * s, x + 2.2 * s, y0 + 6.8 * s, z + 1.9 * s, '#26282b', 0, -0.35);
  else if (w === 'tube') k.tube([x - 3 * s, y0 + 8.6 * s, z + 2.2 * s], [x + 5 * s, y0 + 9.4 * s, z + 2.2 * s], 0.9 * s, opt.tubeCol || '#4d5a2b', 8);
  else if (w === 'manpads') k.tube([x - 2.6 * s, y0 + 7.2 * s, z + 2.2 * s], [x + 4 * s, y0 + 12.5 * s, z + 2.2 * s], 0.9 * s, '#4d5a2b', 8);
  else if (w === 'long') k.box(9 * s, 0.7 * s, 0.7 * s, x + 3 * s, y0 + 6.8 * s, z + 1.9 * s, '#26282b');
  else if (w === 'shovel') { k.tube([x + 0.5 * s, y0 + 1 * s, z + 2.2 * s], [x + 2.5 * s, y0 + 9 * s, z + 2.2 * s], 0.35 * s, '#7c5a36', 6); k.box(1.6 * s, 2.2 * s, 0.3 * s, x + 0.4 * s, y0 + 0.9 * s, z + 2.2 * s, '#6b7280'); }
}
function infantry(base) {
  return (k, P) => {
    const spots = [[3, -5], [-4, 4], [6, 6]];
    if (base === 'sniper') { soldier(k, 0, -3, P, { prone: true }); k.box(10, 0.7, 0.7, 5, 2.6, -1.4, '#26282b'); soldier(k, -2, 6, P, { prone: true, s: 0.9 }); return; }
    if (base === 'mortar') {
      soldier(k, -5, -4, P); soldier(k, -6, 6, P, { weapon: 'none' });
      k.tube([3, 0.4, 1], [3, 0.8, 1], 3.2, '#3f4247', 10);
      k.tube([3, 1, 1], [8, 11, 1], 1.2, '#3f4247', 8);
      k.tube([5.5, 6, 1], [3.5, 0.5, 4], 0.35, '#3f4247', 5); k.tube([5.5, 6, 1], [3.5, 0.5, -2], 0.35, '#3f4247', 5);
      return;
    }
    if (base === 'manpads') { soldier(k, 0, -3, P, { weapon: 'manpads' }); soldier(k, -5, 6, P, { s: 0.92 }); return; }
    if (base === 'atinf') { soldier(k, 2, -4, P, { weapon: 'tube' }); soldier(k, -5, 5, P, { weapon: 'tube', tubeCol: '#556b2f' }); return; }
    if (base === 'engineer') { soldier(k, 2, -4, P, { weapon: 'shovel' }); soldier(k, -5, 5, P, { weapon: 'shovel' }); k.box(4, 3, 4, 7, 1.5, 6, '#a16207'); return; }
    if (base === 'specops') { const Q = { ...P, body: shade(P.body, -0.45), dark: '#1f2125' }; soldier(k, 3, -4, Q); soldier(k, -4, 5, Q); return; }
    if (base === 'wafer_inf') {
      const Q = { ...P, body: '#cbd5e1', dark: '#475569' };
      soldier(k, 3, -4, Q); soldier(k, -4, 5, Q); k.ball(9, 7, 0, 1.6, 1.6, 1.6, '#22d3ee'); return;
    }
    if (base === 'marine') {
      // 陸戰隊：橡皮艇加兩名隊員
      k.slab([[-13, -5], [10, -5], [14, 0], [10, 5], [-13, 5]], 0, 2.6, '#2b2f36');
      soldier(k, 2, -2, P, { s: 0.85 }); soldier(k, -6, 2, P, { s: 0.85 });
      return;
    }
    for (const [x, z] of spots) soldier(k, x, z, P);
  };
}

// ----- 地面車輛 -----
function hullTracked(k, P, L = 30, W = 17, H = 5.2, y = 4.4) {
  tracks(k, L, W);
  k.slab([[-L / 2, -W / 2 + 0.5], [L / 2 - 4, -W / 2 + 0.5], [L / 2, -W / 2 + 3], [L / 2, W / 2 - 3], [L / 2 - 4, W / 2 - 0.5], [-L / 2, W / 2 - 0.5]], y, H, P.body);
  k.box(3, 2.2, W - 2, L / 2 - 2.5, y + H - 0.3, 0, P.dark);       // 前上斜板
  return y + H;
}
function hullWheeled(k, P, L = 28, W = 15, H = 6, n = 4, y = 3.6) {
  const xs = []; for (let i = 0; i < n; i++) xs.push(-L / 2 + 4.5 + i * (L - 9) / Math.max(1, n - 1));
  wheels(k, xs, W);
  k.slab([[-L / 2, -W / 2], [L / 2 - 5, -W / 2], [L / 2, -W / 2 + 3], [L / 2, W / 2 - 3], [L / 2 - 5, W / 2], [-L / 2, W / 2]], y, H, P.body);
  return y + H;
}
function truckBody(k, P, L = 30, W = 13, n = 3, cabCol) {
  const xs = []; for (let i = 0; i < n; i++) xs.push(L / 2 - 5 - i * (L - 9) / Math.max(1, n - 1));
  wheels(k, xs, W, 2.8);
  k.box(L, 1.6, W - 1, 0, 4.4, 0, '#2f3134');                         // 底盤
  k.box(7, 7, W - 1, L / 2 - 4, 8.6, 0, cabCol || P.body);             // 駕駛室
  k.box(1, 3, W - 3, L / 2 - 0.4, 9.5, 0, '#7fb4d8');                  // 擋風玻璃
  return { bedX: -2.5, bedL: L - 9, top: 5.2 };
}
function tank(k, P, light = false) {
  const s = light ? 0.82 : 1, L = 32 * s, W = 17 * s;
  const top = hullTracked(k, P, L, W, 5 * s, 4.2 * s);
  const t = light ? (P.nat === 'JP' ? 'wheel' : 'small') : (TURRET[P.nat] || 'wedge');
  let tx = -1, ty = top, gl = 19 * s, gr = 0.9 * s;
  if (t === 'dome') { k.dome(tx, ty, 0, 8 * s, 4.6 * s, 7.4 * s, P.body); if (P.nat === 'RU' || P.nat === 'IN') for (const z of [-4, 0, 4]) k.box(2.4, 1.3, 2.6, 4.5 * s, ty + 2.3 * s, z * s, P.dark); gl = 21 * s; }
  else if (t === 'cast') { k.ball(tx, ty + 1.2 * s, 0, 8 * s, 4 * s, 6.8 * s, P.body); k.tube([tx - 1, ty + 4, 2 * s], [tx - 1, ty + 6.3 * s, 2 * s], 1.6 * s, P.dark, 8); }
  else if (t === 'box') { k.box(14 * s, 5 * s, 11 * s, tx - 1, ty + 2.5 * s, 0, P.body); if (P.nat === 'DE') k.slab([[tx + 6 * s, -5.5 * s], [tx + 10 * s, 0], [tx + 6 * s, 5.5 * s]], ty, 5 * s, P.body); }
  else if (t === 'slab') { k.box(15 * s, 4.6 * s, 11.6 * s, tx - 1, ty + 2.3 * s, 0, P.body); k.box(3, 3, 3, tx + 1, ty + 6 * s, -3.5 * s, P.dark); k.box(L * 0.8, 3.2, 0.6, 0, 5.4 * s, W / 2 + 0.3, P.dark); k.box(L * 0.8, 3.2, 0.6, 0, 5.4 * s, -W / 2 - 0.3, P.dark); }
  else if (t === 'merkava') { tx = -5; k.slab([[tx - 7, -5.8], [tx + 4, -5.8], [tx + 10, -2], [tx + 10, 2], [tx + 4, 5.8], [tx - 7, 5.8]], ty, 4.2, P.body); for (let i = 0; i < 6; i++) k.ball(tx - 7.5, ty + 0.6, -5 + i * 2, 0.6, 0.6, 0.6, '#3f4247'); gl = 22; }
  else if (t === 'small' || t === 'wheel') { k.box(10 * s, 4 * s, 9 * s, tx, ty + 2 * s, 0, P.body); }
  else { // wedge：M1／K1 類扁長楔形
    k.slab([[tx - 9 * s, -6 * s], [tx + 3 * s, -6 * s], [tx + 8 * s, -3 * s], [tx + 8 * s, 3 * s], [tx + 3 * s, 6 * s], [tx - 9 * s, 6 * s]], ty, 4.2 * s, P.body);
    k.box(4 * s, 3 * s, 10 * s, tx - 10 * s, ty + 1.5 * s, 0, P.dark);
  }
  barrel(k, tx + 5 * s, ty + 2.4 * s, 0, gl, gr, P.dark);
  k.tube([tx - 3 * s, ty + 4.2 * s, -3 * s], [tx - 3 * s, ty + 6.2 * s, -3 * s], 1.2 * s, P.dark, 8);  // 車長塔
  roundel(k, P.nat, -4 * s, 7 * s, W / 2 + 0.25, 1.6, 'z');
}
function aaGun(k, P) {
  const wheeled = ['KR', 'PH'].includes(P.nat), top = wheeled ? hullWheeled(k, P, 22, 13, 3, 2, 2.6) : hullTracked(k, P, 30, 16, 5);
  const tower = P.east ? 'open' : 'box';
  k.box(12, 6, 11, -1, top + 3, 0, P.body);
  if (tower === 'box' || P.nat === 'DE' || P.nat === 'JP') { k.tube([-7, top + 6, 0], [-7, top + 9, 0], 0.5, '#3f4247'); k.box(1, 5, 7, -7.5, top + 10, 0, P.dark); k.ball(4, top + 7, 0, 2.4, 2.4, 2.4, P.dark); }
  else k.tube([-4, top + 6, 0], [-4, top + 10, 0], 3.2, P.dark, 10, 2.5);
  const n = P.nat === 'VN' || P.nat === 'RU' || P.nat === 'IN' ? 4 : 2;
  for (let i = 0; i < n; i++) barrel(k, 2, top + 4.5, (i - (n - 1) / 2) * 2.4, 16, 0.55, '#2b2d30', 0.75);
  roundel(k, P.nat, -2, top + 3, 5.6, 1.4, 'z');
}
function spsam(k, P) {
  const wheeled = ['US', 'TW', 'PK', 'CN', 'PH'].includes(P.nat);
  const top = wheeled ? hullWheeled(k, P, 26, 14, 4, 3) : hullTracked(k, P, 28, 16, 5);
  k.box(9, 3, 10, -2, top + 1.5, 0, P.dark);
  const steep = P.nat === 'IL' || P.nat === 'TW' ? 1.3 : 0.6, n = P.nat === 'FR' ? 4 : 2;
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) missile(k, [-6, top + 4 + i * 2.2, s * (3.8 + (i % 2))], [-6 + Math.cos(steep) * 14, top + 4 + i * 2.2 + Math.sin(steep) * 14, s * (3.8 + (i % 2))], 0.9);
  k.box(1, 6, 7, 3, top + 7, 0, P.dark);           // 搜索雷達
  roundel(k, P.nat, -9, top - 2.5, 7.6, 1.4, 'z');
}
function samTrailer(k, P) {
  wheels(k, [-6, 6], 14, 2.4);
  k.box(24, 2, 13, 0, 4.4, 0, P.dark);
  k.box(8, 3, 8, -2, 7, 0, P.body);
  const n = P.nat === 'US' || P.nat === 'TW' ? 0 : P.east ? 1 : 3;
  if (n === 0) { k.box(16, 8, 11, 2, 12.5, 0, P.body, 0, 0.55); for (const z of [-2.6, 2.6]) for (const y of [-2, 2]) k.tube([9.5, 17 + y, z], [9.8, 17.2 + y, z], 1.8, '#1f2125', 8); }
  else for (let i = 0; i < n; i++) missile(k, [-6, 8.5, (i - (n - 1) / 2) * 4], [14, 22, (i - (n - 1) / 2) * 4], P.east ? 1.6 : 1.1, '#e5e7eb', P.east ? '#e5e7eb' : '#dc2626');
  if (P.east) for (const s of [-1, 1]) k.fin([[0, 0], [5, 0], [0, 5]], s * 1.7, 0.4, '#e5e7eb');
  roundel(k, P.nat, -9, 7, 4.2, 1.3, 'z');
}
function rocketLauncher(k, P) {
  const tracked = ['JP', 'US', 'GB', 'FR', 'DE'].includes(P.nat);
  let top;
  if (tracked) top = hullTracked(k, P, 32, 17, 4.5);
  else { truckBody(k, P, 32, 14, 3); top = 5.2; }
  const ang = P.nat === 'US' ? 0.12 : 0.45, cx = tracked ? -4 : -4;
  k.box(18, 7, 12, cx, top + 6, 0, P.dark, 0, ang);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = cx + Math.cos(ang) * 9, y = top + 6 + Math.sin(ang) * 9;
    k.tube([x - 0.2, y - 2.4 + r * 2.4, -4.2 + c * 2.8], [x + 0.3, y - 2.4 + r * 2.4, -4.2 + c * 2.8], 0.9, '#1f2125', 6);
  }
  roundel(k, P.nat, 10, 9, 6.6, 1.3, 'z');
}
function artillery(k, P, future = false) {
  const top = hullTracked(k, P, 34, 17, 5);
  const big = P.nat === 'FR' || P.nat === 'JP' ? 7 : 6;
  k.box(15, big, 13, -5, top + big / 2, 0, future ? '#1f2937' : P.body);
  k.box(4, 2, 12, -13, top + 1.5, 0, P.dark);
  barrel(k, 2, top + big - 1.5, 0, P.nat === 'KP' ? 26 : 21, 1.0, P.dark, 0.32);
  if (future) k.box(6, 0.6, 6, -5, top + big + 0.4, 0, '#22d3ee');
  roundel(k, P.nat, -5, top + 3, 6.6, 1.5, 'z');
}
function tbm(k, P) {
  truckBody(k, P, 40, 14, 4);
  const big = P.nat === 'KP' || P.nat === 'VN' || P.nat === 'PK' || P.nat === 'IN';
  if (P.nat === 'US' || P.nat === 'GB') { k.box(14, 5, 10, -5, 9, 0, P.dark, 0, 0.7); return roundel(k, P.nat, 12, 9, 6.6, 1.3, 'z'); }
  missile(k, [-17, 7, 0], [big ? 10 : 6, big ? 26 : 20, 0], big ? 2.2 : 1.8, P.nat === 'CN' ? '#f1f5f9' : '#d6d3d1', '#94a3b8');
  k.box(6, 3, 6, -14, 8, 0, P.dark);
  roundel(k, P.nat, 14, 9, 6.6, 1.3, 'z');
}
function coastal(k, P) {
  truckBody(k, P, 34, 14, 3);
  const n = P.nat === 'JP' || P.nat === 'DE' ? 1 : P.nat === 'RU' || P.nat === 'VN' ? 2 : 3;
  const ang = P.nat === 'RU' || P.nat === 'IN' ? 1.3 : P.nat === 'PK' ? 0.15 : 0.45;
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (n === 1 ? 0 : 4);
    if (n === 1) k.box(18, 6, 11, -4, 10, 0, P.dark, 0, ang);
    else k.tube([-14, 7.5, z], [-14 + Math.cos(ang) * 22, 7.5 + Math.sin(ang) * 22, z], 1.7, P.dark, 10);
  }
  roundel(k, P.nat, 12, 9, 6.6, 1.3, 'z');
}
function tankDestroyer(k, P) {
  if (['JP', 'US', 'PH', 'FR', 'KP'].includes(P.nat)) {
    const top = hullWheeled(k, P, 26, 14, 5, P.nat === 'FR' ? 2 : 2);
    k.box(6, 4, 7, -3, top + 2, 0, P.dark);
    for (const s of [-1, 1]) missile(k, [-5, top + 4, s * 2.4], [8, top + 6, s * 2.4], 0.8, '#4d5a2b', '#4d5a2b');
  } else if (P.nat === 'CN' || P.nat === 'DE') {
    const top = hullTracked(k, P, 30, 16, 5);
    k.slab([[-10, -6], [4, -6], [9, -2], [9, 2], [4, 6], [-10, 6]], top, 3.4, P.body);
    barrel(k, 6, top + 2, 0, P.nat === 'CN' ? 22 : 12, 0.8, P.dark);
  } else {
    const top = hullTracked(k, P, 30, 16, 5);
    k.box(5, 3, 5, -2, top + 1.5, 0, P.dark);
    k.box(10, 4, 8, -2, top + 5.5, 0, P.body, 0, 0.12);
  }
  roundel(k, P.nat, -6, 7, 8.3, 1.4, 'z');
}
function ifv(k, P, apc = false) {
  const wheeled = (apc ? WHEELED_APC : ['AU', 'FR']).includes(P.nat);
  const top = wheeled ? hullWheeled(k, P, 30, 15, 7, P.nat === 'FR' ? 2 : P.nat === 'DE' ? 3 : 4) : hullTracked(k, P, 30, 16, 7, 4);
  if (apc) { k.tube([-2, top, -2], [-2, top + 2, -2], 1.4, P.dark, 8); barrel(k, -2, top + 1.6, -2, 7, 0.4, '#26282b'); }
  else {
    k.box(9, 4, 8, 0, top + 2, 0, P.body);
    barrel(k, 4, top + 2.4, 0, 12, 0.5, '#26282b');
    if (P.nat === 'US' || P.nat === 'CN') k.box(5, 3, 2.6, -1, top + 3.4, 5, P.dark);
  }
  k.box(1, 5, 9, -15.2, 7, 0, P.dark);                  // 後門
  roundel(k, P.nat, -3, top - 3, 8.2, 1.5, 'z');
}
function recon(k, P) {
  const tracked = ['GB', 'DE'].includes(P.nat) ? false : ['US', 'KR', 'PK', 'AU', 'IL'].includes(P.nat);
  const top = tracked ? hullTracked(k, P, 26, 14, 5) : hullWheeled(k, P, 24, 13, 5, P.nat === 'DE' || P.nat === 'FR' ? 4 : 2);
  k.box(7, 3, 7, -1, top + 1.5, 0, P.body);
  barrel(k, 2, top + 1.8, 0, P.nat === 'FR' || P.nat === 'TW' ? 12 : 7, 0.45, '#26282b');
  if (P.nat === 'US' || P.nat === 'KR') { k.tube([-4, top + 3, 0], [-4, top + 7, 0], 0.4, '#3f4247'); k.box(2, 2, 3, -4, top + 7.5, 0, P.dark); }
  roundel(k, P.nat, -4, top - 2.6, 6.8, 1.3, 'z');
}
function truck(k, P) {
  const b = truckBody(k, P, 32, 14, 3);
  k.box(b.bedL, 2.4, 13, b.bedX, b.top + 1.2, 0, P.dark);
  k.dome(b.bedX, b.top + 2.4, 0, b.bedL / 2, 5.2, 6.5, P.body);       // 帆布篷
  roundel(k, P.nat, 12, 9, 6.6, 1.3, 'z');
}
function train(k, P) {
  for (const s of [-1, 1]) k.box(54, 0.6, 0.8, 0, 0.3, s * 4, '#6b7280');
  wheels(k, [-22, -16, 2, 8, 15, 21], 10, 2.4, '#1f2125');
  k.box(26, 8, 11, 12, 8.4, 0, P.body);                                // 機車頭
  k.box(8, 4, 11.4, 21, 14, 0, P.dark);
  k.box(18, 3, 11, -16, 6, 0, '#4b5563');                               // 平車
  k.box(10, 5, 9, -16, 10, 0, P.dark);
  barrel(k, -14, 11, 0, 9, 0.6, '#26282b');
  roundel(k, P.nat, 10, 9, 5.7, 1.5, 'z');
}
function laserAA(k, P) {
  const b = truckBody(k, P, 30, 14, 3);
  k.box(10, 4, 10, -3, b.top + 2, 0, P.dark);
  k.tube([-3, b.top + 4, 0], [-3, b.top + 9, 0], 1.6, '#3f4247', 8);
  k.tube([-6, b.top + 11, 0], [2, b.top + 13, 0], 2.6, '#cbd5e1', 12);
  k.tube([2, b.top + 13, 0], [2.4, b.top + 13.1, 0], 2.2, '#22d3ee', 12);
}
function anduril(k, P) {
  tracks(k, 26, 15, 4);
  k.slab([[-13, -7], [6, -7], [13, 0], [6, 7], [-13, 7]], 4, 4, '#1f2937');
  k.box(4, 2, 4, -2, 9, 0, '#0f172a'); k.ball(-2, 10.5, 0, 1.4, 1.4, 1.4, '#38bdf8');
  barrel(k, 0, 9, 0, 10, 0.5, '#111827');
}
function fortress(k, P) {
  k.slab([...Array(6)].map((_, i) => [Math.cos(i * Math.PI / 3) * 20, Math.sin(i * Math.PI / 3) * 20]), 0, 9, '#475569');
  k.slab([...Array(6)].map((_, i) => [Math.cos(i * Math.PI / 3) * 12, Math.sin(i * Math.PI / 3) * 12]), 9, 8, '#cbd5e1');
  k.tube([0, 17, 0], [0, 21, 0], 5, '#0e7490', 12, 3); k.ball(0, 22, 0, 3, 3, 3, '#22d3ee');
  for (let i = 0; i < 3; i++) { const a = i * 2.1; barrel(k, Math.cos(a) * 8, 13, -Math.sin(a) * 8, 12, 0.8, '#334155', 0.2, a); }
}

// ----- 飛機 -----
function jet(k, P, o) {
  const L = o.L || 32, r = o.r || 2.2, b = P.body, d = P.dark;
  k.tube([-L / 2, 0, 0], [L / 2 - 7, 0, 0], r, b, 10, r * 0.9);
  k.tube([L / 2 - 7, 0, 0], [L / 2, 0, 0], r * 0.9, b, 10, 0.2);                 // 機鼻
  k.ball(L / 2 - 9, r * 0.8, 0, 3.6, 1.5, 1.3, '#7fb4d8');                       // 座艙
  if (o.stealth) {
    k.wing([[L / 2 - 4, 0], [-L / 2 + 4, 13], [-L / 2, 7], [-L / 2, 0]], -0.8, 1.6, b);
  } else if (o.delta) {
    k.wing([[6, 1.5], [-L / 2 + 3, o.span || 13], [-L / 2 + 1, 1.5]], -0.5, 0.7, b);
  } else {
    const sp = o.span || 12, sw = o.sweep ?? 7;
    k.wing([[4, 1.5], [4 - sw - 5, sp], [-1 - sw - 6, sp], [-7, 1.5]], -0.5, 0.7, b);
    k.wing([[-L / 2 + 6, 1], [-L / 2 + 2, 6], [-L / 2 - 1, 6], [-L / 2, 1]], -0.2, 0.5, b);   // 水平尾翼
  }
  if (o.canard) k.wing([[L / 2 - 10, 1.4], [L / 2 - 13, 5], [L / 2 - 15, 5], [L / 2 - 14, 1.4]], 0.8, 0.4, b);
  const tail = [[-L / 2, 0], [-L / 2 + 7, 0], [-L / 2 + 2, 7.5], [-L / 2 - 1.5, 7.5]];
  if (o.twin) for (const s of [-1, 1]) k.fin(tail, s * 2.6, 0.5, d, s * (o.stealth ? 0.4 : 0.15));
  else k.fin(tail, 0, 0.6, d);
  if (o.engines) for (const z of o.engines) k.tube([-3, -2, z], [5, -2, z], 1.3, d, 8);
  if (o.bombs) for (const z of [-5, 5]) k.tube([-3, -1.8, z], [3, -1.8, z], 0.9, '#4b5563', 6, 0.4);
  roundel(k, P.nat, -4, 0.4, o.stealth ? 8 : 8.5, 1.4);
  roundel(k, P.nat, -4, 0.4, o.stealth ? -8 : -8.5, 1.4);
}
const has = (tbl, base, nat) => (tbl[base] || []).includes(nat);
function fighter(base) {
  return (k, P) => {
    const nat = P.nat;
    if (base === 'stealth') return jet(k, P, { L: 34, stealth: true, twin: true, canard: nat === 'CN' });
    if (base === 'attacker' && nat === 'US') {   // A-10：直翼、機身後上方兩具發動機
      jet(k, P, { L: 30, span: 15, sweep: 0, twin: true, bombs: true });
      for (const s of [-1, 1]) k.tube([-10, 3.2, s * 3.4], [-3, 3.2, s * 3.4], 1.9, P.dark);
      return;
    }
    jet(k, P, {
      L: base === 'attacker' ? 30 : 32, twin: has(TWIN_TAIL, base, nat), delta: has(DELTA, base, nat), canard: has(CANARD, base, nat),
      sweep: base === 'attacker' ? 4 : 7 + h32(nat + base) * 4, span: base === 'attacker' ? 13 : 12, bombs: base !== 'fighter',
    });
  };
}
function bomber(k, P) {
  const nat = P.nat;
  k.tube([-22, 0, 0], [16, 0, 0], 3, P.body, 10, 2.8); k.tube([16, 0, 0], [24, 0, 0], 2.8, P.body, 10, 0.4);
  k.ball(17, 2.2, 0, 3.2, 1.4, 2, '#7fb4d8');
  const sw = nat === 'RU' ? 14 : 9, sp = nat === 'RU' ? 16 : 24;
  k.wing([[6, 2.4], [6 - sw - 4, sp], [-sw - 8, sp], [-6, 2.4]], 0, 0.9, P.body);
  k.wing([[-17, 1.5], [-21, 8], [-24, 8], [-22, 1.5]], 0.4, 0.6, P.body);
  k.fin([[-22, 0], [-14, 0], [-18, 10], [-22, 10]], 0, 0.7, P.dark);
  const pods = nat === 'US' ? [8, 15] : nat === 'CN' ? [5] : [];
  for (const z of pods) for (const s of [-1, 1]) k.tube([-6 - z * 0.3, -1.8, s * z], [2 - z * 0.3, -1.8, s * z], 1.4, P.dark, 8);
  if (nat === 'RU') for (const s of [-1, 1]) k.box(10, 3.6, 2.4, -2, 0.4, s * 3.6, P.dark);
  roundel(k, nat, -6, 1, 14, 2); roundel(k, nat, -6, 1, -14, 2);
}
function transport(k, P, mpa = false) {
  const L = mpa ? 40 : 42, r = mpa ? 2.7 : 3.6;
  k.tube([-L / 2, 0.6, 0], [L / 2 - 5, 0, 0], r, P.body, 10, r);
  k.tube([L / 2 - 5, 0, 0], [L / 2, -0.6, 0], r, P.body, 10, 1);
  const high = !mpa && !['VN'].includes(P.nat), wy = high ? r - 0.2 : -r + 1;
  k.wing([[4, 2], [0, 23], [-4, 23], [-4, 2]], wy, 0.8, P.body);
  const jets = P.nat === 'RU' || P.nat === 'KP' || P.nat === 'JP';
  const engs = (P.nat === 'VN' || P.nat === 'IN' || P.nat === 'FR' || P.nat === 'DE' || P.nat === 'JP' || P.nat === 'PH') ? [7] : [7, 14];
  for (const z of engs) for (const s of [-1, 1]) {
    k.tube([-2, wy - 1, s * z], [jets ? 4 : 3, wy - 1, s * z], 1.4, P.dark, 8);
    if (!jets) k.box(0.4, 7, 0.8, 3.2, wy - 1, s * z, '#26282b');
  }
  const tail = mpa ? [[-L / 2, 0], [-L / 2 + 8, 0], [-L / 2 + 3, 9], [-L / 2 - 1, 9]] : [[-L / 2, 0], [-L / 2 + 9, 0], [-L / 2 + 3, 11], [-L / 2 - 1, 11]];
  k.fin(tail, 0, 0.7, P.dark);
  const ty = (P.nat === 'JP' || P.nat === 'RU' || P.nat === 'KP') && !mpa ? 10.5 : 1;
  k.wing([[-L / 2 + 6, 1], [-L / 2 + 2, 9], [-L / 2 - 1, 9], [-L / 2, 1]], ty, 0.6, P.body);
  if (mpa) k.tube([-L / 2 - 6, 0.6, 0], [-L / 2, 0.6, 0], 0.6, P.dark, 6);   // 磁異探測尾桿
  for (const s of [-1, 1]) roundel(k, P.nat, -1, wy + 0.85, s * 17, 1.8);
  roundel(k, P.nat, -L / 2 + 8, 1.4, r + 0.1, 1.6, 'z');
}
function uav(k, P) {
  k.tube([-12, 0, 0], [10, 0, 0], 1.6, P.body, 8, 1.4); k.ball(9, 0.6, 0, 3, 2, 2, P.body);
  k.wing([[2, 1], [0, 18], [-2, 18], [-2, 1]], 0.4, 0.5, P.body);
  if (['TW', 'KR', 'IN', 'AU', 'IL'].includes(P.nat)) { for (const s of [-1, 1]) k.tube([-14, 0.4, s * 5], [0, 0.4, s * 5], 0.5, P.dark, 6); k.wing([[-13, 0], [-13, 5.5], [-15, 5.5], [-15, 0]], 0.4, 0.4, P.dark); for (const s of [-1, 1]) k.fin([[-15, 0], [-12, 0], [-14, 4], [-15, 4]], s * 5, 0.4, P.dark); }
  else { for (const s of [-1, 1]) k.fin([[-12, 0], [-8, 0], [-11, 5], [-12.5, 5]], s * 1.2, 0.4, P.dark, s * (P.nat === 'US' ? -0.8 : 0.6)); }
  k.ball(4, -1.6, 0, 1.2, 1.2, 1.2, '#1f2937');
  k.box(0.4, 5, 0.8, -12.6, 0, 0, '#26282b');
}
function heliBody(k, P, kind) {
  const b = P.body, d = P.dark;
  if (kind === 'attack') {
    k.tube([-6, 0, 0], [8, 0, 0], 2.8, b, 10, 2);
    k.tube([8, 0, 0], [12, -0.6, 0], 2, b, 10, 0.6);
    k.ball(6, 2, 0, 3.4, 1.8, 1.8, '#7fb4d8'); k.ball(1, 2.6, 0, 3, 1.8, 1.8, '#7fb4d8');
    k.wing([[2, 2.4], [1, 7], [-2, 7], [-2, 2.4]], -0.6, 0.6, d);
    for (const s of [-1, 1]) k.tube([-2, -1.4, s * 6], [3, -1.4, s * 6], 1, '#3f4247', 6);
    if (['KP', 'VN', 'RU', 'IN'].includes(P.nat)) k.box(6, 3, 6, 0, -2, 0, b);    // Mi-24 運兵艙
  } else if (kind === 'scout') {
    k.ball(2, 0, 0, 5.5, 4, 3.6, b); k.ball(4.5, 0.8, 0, 3.4, 2.6, 2.6, '#7fb4d8');
  } else {
    k.box(18, 7, 7, 0, 0, 0, b); k.ball(9, 0.4, 0, 3, 3.2, 3.4, b); k.ball(10.4, 1.4, 0, 1.8, 2, 3, '#7fb4d8');
    k.box(4, 3, 5, -2, 4.6, 0, d);
  }
  const tailX = kind === 'transport' ? -9 : kind === 'scout' ? -3 : -6;
  k.tube([tailX, 0.6, 0], [tailX - 13, 1.6, 0], kind === 'transport' ? 1.4 : 0.9, b, 8, 0.6);
  k.fin([[tailX - 15, 0], [tailX - 11, 0], [tailX - 13, 5], [tailX - 15, 5]], 0, 0.5, d);
  k.tube([tailX - 13, 3, 0.6], [tailX - 13, 3, 1.4], 2.6, '#26282b', 10);       // 尾旋翼
  k.tube([0, kind === 'transport' ? 3.5 : 2, 0], [0, kind === 'transport' ? 6.4 : 4.6, 0], 0.7, '#26282b', 6);
  roundel(k, P.nat, -2, 0, kind === 'transport' ? 3.6 : kind === 'scout' ? 3.7 : 2.9, 1.3, 'z');
  return kind === 'transport' ? 6.4 : 4.6;
}
function chinook(k, P) {
  k.box(28, 7, 7, 0, 0, 0, P.body); k.ball(14, 0.4, 0, 2.6, 3.2, 3.4, P.body); k.ball(15, 1.4, 0, 1.6, 2, 3, '#7fb4d8');
  k.box(6, 8, 4, -13, 5, 0, P.dark);
  for (const s of [-1, 1]) k.box(10, 3, 1.4, 0, -2, s * 4.2, P.dark);
  k.tube([12, 3.5, 0], [12, 6, 0], 0.7, '#26282b', 6); k.tube([-13, 9, 0], [-13, 10.4, 0], 0.7, '#26282b', 6);
  roundel(k, P.nat, 0, 0, 3.6, 1.4, 'z');
}

// ----- 艦艇（水線在 y = 0，船底略沒入水中）-----
function hull(k, P, L, B, H, opt = {}) {
  const bow = opt.blunt ? B * 0.25 : B * 1.3;
  const pts = [[-L / 2, -B / 2], [L / 2 - bow, -B / 2], [L / 2, 0], [L / 2 - bow, B / 2], [-L / 2, B / 2]];
  if (opt.blunt) pts.splice(2, 1, [L / 2, -B / 3], [L / 2, B / 3]);
  k.slab(pts, -2, H + 2, opt.hullCol || shade(P.body, -0.15));
  k.slab(pts.map(([x, z]) => [x * 0.995, z * 0.96]), H, 0.4, opt.deck || '#8a8f96');
  return H + 0.4;
}
function warship(base) {
  return (k, P) => {
    const nat = P.nat, rnd = h32(nat + base);
    const S = { destroyer: [46, 7.5, 3], frigate: [40, 7, 2.8], corvette: [30, 6, 2.6], cruiser: [52, 8.5, 3.4], patrol: [24, 5, 2.2] }[base];
    const [L, B] = S, top = hull(k, P, L, B, S[2]);
    const sup = base === 'patrol' ? 0.36 : 0.42, sx = L * (0.06 - rnd * 0.08);
    // 上層結構：西方較方正、東方較高聳階梯
    k.box(L * sup, P.east ? 5 : 4.4, B * 0.72, sx, top + (P.east ? 2.5 : 2.2), 0, P.body);
    k.box(L * 0.14, 3, B * 0.6, sx + L * sup * 0.3, top + (P.east ? 6.5 : 5.9), 0, P.body);
    k.box(L * 0.03, 1.4, B * 0.62, sx + L * sup * 0.3 + L * 0.07, top + (P.east ? 7 : 6.4), 0, '#1f2937');
    // 桅杆：整合式錐桅（新式）或格子桅（舊式）
    const mx = sx + L * sup * 0.1;
    if (rnd > 0.5 || ['FR', 'GB', 'DE', 'KR', 'IL', 'CN'].includes(nat)) k.tube([mx, top + 5, 0], [mx, top + 15, 0], B * 0.24, P.body, 6, 0.4);
    else { k.tube([mx, top + 5, 0], [mx, top + 15, 0], 0.4, '#3f4247', 6); k.box(0.4, 0.4, B * 0.6, mx, top + 12.5, 0, '#3f4247'); k.ball(mx, top + 15.5, 0, 1.2, 1.2, 1.2, '#e5e7eb'); }
    if (base === 'cruiser' || (base === 'destroyer' && ['US', 'JP', 'KR'].includes(nat)))
      for (const s of [-1, 1]) k.box(3, 3.6, 0.3, sx + L * sup * 0.38, top + 5.6, s * B * 0.37, '#475569');   // 相位陣列板
    // 煙囪
    const nf = nat === 'IN' || nat === 'DE' || (rnd > 0.7 && base !== 'patrol') ? 2 : 1;
    for (let i = 0; i < nf; i++) k.box(2.4, 4, B * 0.34, sx - L * sup * 0.25 - i * 3.6, top + 6.2, 0, P.dark);
    // 主砲
    k.box(3.4, 1.8, 3, L * 0.33, top + 0.9, 0, P.body);
    barrel(k, L * 0.33 + 1.4, top + 1.2, 0, base === 'patrol' ? 4 : 6, 0.35, '#26282b');
    if (P.east && base !== 'patrol') { k.box(3.4, 1.8, 3, -L * 0.36, top + 0.9, 0, P.body); barrel(k, -L * 0.36 - 1.4, top + 1.2, 0, 6, 0.35, '#26282b', 0, Math.PI); }
    // 飛彈：垂直發射區或斜置發射筒
    if (['cruiser', 'destroyer', 'frigate'].includes(base)) k.box(L * 0.1, 0.4, B * 0.5, L * 0.22, top + 0.2, 0, '#334155');
    if (base !== 'cruiser') for (const s of [-1, 1]) k.tube([-L * 0.12, top + 1.2, s * B * 0.22], [-L * 0.02, top + 2.4, s * B * 0.22], 0.7, '#4b5563', 6);
    if (nat === 'RU' && base === 'cruiser') for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.tube([L * 0.05 + i * 2.6, top + 1, s * B * 0.42], [L * 0.05 + i * 2.6 + 7, top + 2.4, s * B * 0.42], 1, '#64748b', 6);
    // 直升機甲板與機庫
    if (['destroyer', 'frigate', 'cruiser'].includes(base) || nat === 'CN') { k.box(L * 0.18, 0.1, B * 0.8, -L * 0.4, top + 0.06, 0, '#a3a8ae'); }
    roundel(k, nat, L * 0.36, top - 1.2, B / 2 + 0.05, 1.2, 'z');
  };
}
function submarine(k, P) {
  const nat = P.nat, c = shade(P.body, -0.55);
  k.tube([-22, 0.4, 0], [16, 0.4, 0], 3.2, c, 12, 3.2);
  k.ball(16, 0.4, 0, 6, 3.2, 3.2, c); k.ball(-22, 0.4, 0, 4, 3.2, 3.2, c);
  const sx = nat === 'US' ? 7 : nat === 'RU' ? -2 : 3, sh = nat === 'PK' ? 8 : nat === 'JP' ? 4.5 : 6;
  k.slab([[sx - 4, -1], [sx + 3, -1], [sx + 4, 0], [sx + 3, 1], [sx - 4, 1]], 3, sh, c);
  if (nat !== 'RU') for (const s of [-1, 1]) k.box(3, 0.3, 3, sx, 3 + sh * 0.6, s * 2.2, c);
  const x = nat === 'AU' ? 0.7 : 0;
  k.fin([[-26, -4], [-22, -2], [-22, 2], [-26, 4]], 0, 0.5, c, x);
  k.wing([[-22, 0], [-23, 4], [-26, 4], [-26, 0]], 0.2, 0.4, c);
  roundel(k, nat, sx, 3 + sh * 0.5, 1.05, 0.9, 'z');
}
function flattop(k, P, base) {
  const nat = P.nat, L = base === 'carrier' ? 56 : base === 'wingman_carrier' ? 50 : 50, B = base === 'lhd' ? 9 : 11;
  hull(k, P, L, B * 0.8, 4);
  const ramp = base === 'carrier' && ['CN', 'RU', 'IN', 'GB'].includes(nat) || (base === 'lhd' && nat === 'AU');
  k.slab([[-L / 2, -B / 2 - 1], [L / 2 - 3, -B / 2 - 1], [L / 2, -B / 3], [L / 2, B / 3], [L / 2 - 3, B / 2], [-L / 2, B / 2]], 4.4, 1, '#6b7280');
  if (ramp) k.slab([[L / 2 - 10, -B / 3], [L / 2, -B / 3], [L / 2, B / 3], [L / 2 - 10, B / 3]], 5.4, 1.4, '#6b7280');
  for (let i = -3; i <= 3; i++) k.box(2.4, 0.1, 0.4, i * 6, 5.45, 0, '#f1f5f9');
  const ix = base === 'lhd' && nat === 'JP' ? 2 : -4, iw = nat === 'JP' ? 14 : 9;
  k.box(iw, 7, 3, ix, 9, -B / 2 + 1.6, P.body); k.box(iw * 0.5, 3, 2.6, ix + 1, 14, -B / 2 + 1.6, P.body);
  k.tube([ix, 15, -B / 2 + 1.6], [ix, 19, -B / 2 + 1.6], 0.4, '#3f4247', 6);
  if (base !== 'lhd' && nat !== 'TW') for (const [x, z] of [[14, 2], [6, 3], [-14, 1.5]]) {          // 艦載機
    k.tube([x - 3, 6.4, z], [x + 3, 6.4, z], 0.8, P.dark, 6); k.wing([[x, 0.4], [x - 2, 3], [x - 3, 3], [x - 2, 0.4]].map(([a, b]) => [a, b + z]), 6.2, 0.3, P.dark);
  }
  if (base === 'lhd') for (const [x, z] of [[12, 1], [0, 2]]) { k.box(5, 1.6, 2, x, 6.4, z, P.dark); k.box(9, 0.2, 0.6, x, 7.6, z, '#26282b'); }
  if (base === 'wingman_carrier') for (let i = 0; i < 5; i++) k.box(3, 0.6, 3, -16 + i * 7, 6.2, 2, '#0f172a');
  roundel(k, nat, L * 0.3, 1.2, B * 0.4 + 0.05, 1.4, 'z');
}
function lst(k, P) {
  const top = hull(k, P, 38, 8, 4, { blunt: true });
  k.box(10, 6, 7, -13, top + 3, 0, P.body); k.box(4, 2.4, 6, -11, top + 7, 0, P.body);
  k.tube([-10, top + 7, 0], [-10, top + 13, 0], 0.4, '#3f4247', 6);
  k.box(1.2, 4, 6, 18.6, top - 0.6, 0, P.dark);                        // 艏門
  for (const x of [-2, 6]) { k.box(6, 3, 5, x, top + 1.5, 0, '#4b5563'); }
  roundel(k, P.nat, -13, top + 2, 3.55, 1.2, 'z');
}
function hovercraft(k, P) {
  k.slab([[-14, -8], [10, -8], [15, -4], [15, 4], [10, 8], [-14, 8]], 0, 3, '#1f2125');
  k.slab([[-13, -7], [9, -7], [13, -3.5], [13, 3.5], [9, 7], [-13, 7]], 3, 1.6, P.body);
  k.box(6, 4, 3, 3, 6.6, -5, P.dark);
  const n = P.nat === 'CN' || P.nat === 'RU' ? 3 : 2;
  for (let i = 0; i < n; i++) { const z = (i - (n - 1) / 2) * 6; k.tube([-12, 9, z], [-11, 9, z], 3, '#4b5563', 12); }
  roundel(k, P.nat, 0, 4.5, 7.05, 1.3, 'z');
}
function usvPack(k, P) {
  for (const [x, z] of [[6, -6], [-6, 0], [6, 6]]) {
    k.slab([[x - 6, z - 1.8], [x + 3, z - 1.8], [x + 6, z], [x + 3, z + 1.8], [x - 6, z + 1.8]], -0.6, 2.4, '#1f2937');
    k.box(2.4, 1.4, 2, x - 1, 2.4, z, '#334155'); k.ball(x - 1, 3.6, z, 0.6, 0.6, 0.6, '#38bdf8');
  }
}
function swarm(k, P) {
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 3 + (i % 3) * 4, x = Math.cos(a) * r, z = Math.sin(a) * r, y = (i % 4) * 2;
    k.box(2.4, 0.5, 2.4, x, y, z, '#1f2937'); k.ball(x, y + 0.5, z, 0.6, 0.6, 0.6, '#22d3ee');
  }
}

// ----- 兵種對照 -----
const BUILD = {
  inf: infantry('inf'), atinf: infantry('atinf'), sniper: infantry('sniper'), specops: infantry('specops'), mortar: infantry('mortar'),
  manpads: infantry('manpads'), engineer: infantry('engineer'), marine: infantry('marine'), wafer_inf: infantry('wafer_inf'),
  tank: (k, P) => tank(k, P), lighttank: (k, P) => tank(k, P, true), anduril_tank: anduril,
  ifv: (k, P) => ifv(k, P), apc: (k, P) => ifv(k, P, true), recon, tankdest: tankDestroyer,
  arty: (k, P) => artillery(k, P), palantir_arty: (k, P) => artillery(k, P, true), rocket: rocketLauncher, tbm, coastal,
  aa: aaGun, spsam, sam: samTrailer, laser_aa: laserAA, truck, train, euv_fortress: fortress,
  fighter: fighter('fighter'), multirole: fighter('multirole'), attacker: fighter('attacker'), stealth: fighter('stealth'),
  bomber, airlift: (k, P) => transport(k, P), mpa: (k, P) => transport(k, P, true), uav, nano_swarm: swarm,
  destroyer: warship('destroyer'), frigate: warship('frigate'), corvette: warship('corvette'), cruiser: warship('cruiser'), patrol: warship('patrol'),
  submarine, carrier: (k, P) => flattop(k, P, 'carrier'), lhd: (k, P) => flattop(k, P, 'lhd'), wingman_carrier: (k, P) => flattop(k, P, 'wingman_carrier'),
  lst, hovercraft, usv_wolfpack: usvPack,
};
const ROTOR = { heli: 'attack', scoutheli: 'scout', thelico: 'transport' };

// 旋翼：一片兩葉槳，另外成一個網格以便轉動
const rotorGeo = {};
function rotor(len) {
  if (rotorGeo[len]) return rotorGeo[len];
  const k = new Kit();
  k.box(len * 2, 0.25, 1.3, 0, 0, 0, '#1f2125'); k.box(1.3, 0.25, len * 2, 0, 0, 0, '#1f2125');
  return (rotorGeo[len] = k.build());
}

const CACHE = new Map();
// 取得模型：{ geo, rotors: [{ geo, x, y, z }], h（模型高度）, air, sea }
export function unitModel(d, color) {
  const key = `${d.nation}|${d.base}|${color}`;
  let m = CACHE.get(key);
  if (m) return m;
  const P = { nat: d.nation, body: col(color), dark: shade(color, -0.42), light: shade(color, 0.35), east: EAST.includes(d.nation) };
  const k = new Kit(), rotors = [];
  try {
    if (ROTOR[d.base]) {
      if (d.base === 'thelico' && TANDEM.includes(d.nation)) { chinook(k, P); rotors.push({ geo: rotor(13), x: 12, y: 6.2, z: 0 }, { geo: rotor(13), x: -13, y: 10.6, z: 0 }); }
      else { const ry = heliBody(k, P, ROTOR[d.base]); rotors.push({ geo: rotor(d.base === 'scoutheli' ? 9 : 13), x: 0, y: ry + 0.2, z: 0 }); }
    } else (BUILD[d.base] || ((kk) => kk.box(20, 8, 14, 0, 4, 0, P.body)))(k, P);
  } catch (e) {
    console.warn('model', key, e);
    k.parts.length = 0; k.box(20, 8, 14, 0, 4, 0, P.body);
  }
  const geo = k.build();
  m = { geo, rotors, h: geo.boundingBox.max.y, air: d.cat === 'air', sea: d.cat === 'sea' };
  CACHE.set(key, m);
  return m;
}
export function clearModels() { for (const m of CACHE.values()) m.geo.dispose(); CACHE.clear(); }
