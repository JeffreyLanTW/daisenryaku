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
const SPH_LO = new THREE.SphereGeometry(1, 7, 5);                                    // 小零件（頭、圓頂）用的低面數球
const HEMI_LO = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
const RING = new THREE.RingGeometry(0.84, 1, 18, 1).rotateX(-Math.PI / 2);         // 甲板標線圓環（朝上）

// 常用顏色：金屬灰、砲管、黑色開口、履帶、車燈、玻璃
const MET = '#6b7078', GUN = '#2a2c30', BLK = '#121315', TRK = '#2b2d30', PAD = '#1a1b1d', RUB = '#232427', HUB = '#80858c';
const LAMP = '#fde68a', GLASS = '#6f9fc4', TAIL = '#b91c1c', WHITE = '#e5e7eb', DECK = '#8a8f96';

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
  // 方塊：中心 (x,y,z)；旋轉順序：先繞 z（仰角）再繞 y（方位）
  box(w, h, d, x, y, z, c, ry = 0, rz = 0, rx = 0) { return this.add(BOX, c, x, y, z, rx, ry, rz, w, h, d); }
  ball(x, y, z, rx, ry, rz, c) { return this.add(SPH, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  dome(x, y, z, rx, ry, rz, c) { return this.add(HEMI, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  ballLo(x, y, z, rx, ry, rz, c) { return this.add(SPH_LO, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  domeLo(x, y, z, rx, ry, rz, c) { return this.add(HEMI_LO, c, x, y, z, 0, 0, 0, rx, ry ?? rx, rz ?? rx); }
  ring(x, y, z, r, c) { return this.add(RING, c, x, y, z, 0, 0, 0, r, 1, r); }
  // 圓柱／圓錐：兩點之間（砲管、飛彈、桅杆、機身）；r 在 a 端、r2 在 b 端
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
  // 直立的平面（垂直尾翼、履帶側視）：pts 為 [x, y] 側視外形，z 為位置；holes 為挖空的內圈
  fin(pts, z, th, c, tilt = 0, holes) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
    g.translate(0, 0, -th / 2);
    if (tilt) g.rotateX(tilt);
    g.translate(0, 0, z);
    this.parts.push([g, col(c)]);
    return this;
  }
  // 放樣：沿 x 軸排列的截面（[x, [[z, y], …]]，每個截面點數相同、凸多邊形），連成一個封閉實體。
  // 用於斜面車體、機身、船殼等：截面逐段變化即可做出斜板、收尖與外飄。
  loft(secs, c) {
    const out = [];
    const cen = secs.map(([x, p]) => { let z = 0, y = 0; for (const q of p) { z += q[0]; y += q[1]; } return [x, y / p.length, z / p.length]; });
    const tri = (a, b, d, r) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz < 1e-9) return;
      const mx = (a[0] + b[0] + d[0]) / 3 - r[0], my = (a[1] + b[1] + d[1]) / 3 - r[1], mz = (a[2] + b[2] + d[2]) / 3 - r[2];
      if (nx * mx + ny * my + nz * mz < 0) out.push(...a, ...d, ...b); else out.push(...a, ...b, ...d);   // 一律朝外（逆時針）
    };
    const V = (x, q) => [x, q[1], q[0]];
    for (let i = 0; i < secs.length - 1; i++) {
      const [xa, A] = secs[i], [xb, B] = secs[i + 1], n = A.length;
      const r = [(cen[i][0] + cen[i + 1][0]) / 2, (cen[i][1] + cen[i + 1][1]) / 2, (cen[i][2] + cen[i + 1][2]) / 2];
      for (let j = 0; j < n; j++) {
        const j2 = (j + 1) % n, a0 = V(xa, A[j]), a1 = V(xa, A[j2]), b0 = V(xb, B[j]), b1 = V(xb, B[j2]);
        tri(a0, a1, b1, r); tri(a0, b1, b0, r);
      }
    }
    const cap = (i, ref) => { const [x, p] = secs[i]; for (let j = 1; j < p.length - 1; j++) tri(V(x, p[0]), V(x, p[j]), V(x, p[j + 1]), ref); };
    cap(0, cen[1]); cap(secs.length - 1, cen[secs.length - 2]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
    g.computeVertexNormals();
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

// 截面產生器（[z, y] 點列）
// 方形截面：寬 w、底 y0、高 h、上緣倒角 ch（做出斜側面）
function sec(w, y0, h, ch = 0) {
  const a = w / 2; ch = Math.min(ch, h, a);
  return [[-a, y0], [a, y0], [a, y0 + h - ch], [a - ch, y0 + h], [-a + ch, y0 + h], [-a, y0 + h - ch]];
}
// 橢圓截面：半寬 rz、半高 ry、中心 (cz, cy)
function ell(rz, ry, cy = 0, n = 8, cz = 0) {
  const p = [];
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; p.push([cz + Math.cos(a) * Math.max(rz, 0.03), cy + Math.sin(a) * Math.max(ry, 0.03)]); }
  return p;
}
// 紡錘體（機身、吊艙、副油箱、魚雷…）：st 為 [x, 半寬, 半高, 中心y]
function body(k, st, c, n = 8, cz = 0) { k.loft(st.map(([x, rz, ry, cy = 0]) => [x, ell(rz, ry, cy, n, cz)]), c); }
function pod(k, x0, x1, y, z, r, c, n = 6, nose = 0.3) {
  const L = x1 - x0;
  body(k, [[x0, r * 0.35, r * 0.35, y], [x0 + L * 0.18, r, r, y], [x1 - L * nose, r, r, y], [x1, r * 0.12, r * 0.12, y]], c, n, z);
}
// 沿仰角／方位角前進 t 的位置
function dirPt(x, y, z, t, e = 0, yw = 0) { return [x + Math.cos(e) * Math.cos(yw) * t, y + Math.sin(e) * t, z - Math.cos(e) * Math.sin(yw) * t]; }

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
const SOVIET = ['RU', 'KP', 'VN', 'IN'];   // 蘇式車輛：油桶、橡膠側裙、大負重輪
const HOOD = ['US', 'RU', 'KP', 'VN', 'IN', 'PK', 'AU', 'PH', 'TW'];   // 長鼻卡車（其餘為平頭）
const h32 = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ----- 共用零件 -----
function roundel(k, nat, x, y, z, r, axis = 'y') {
  const [o, i] = BADGE[nat] || ['#ffffff', '#111111'];
  const rx = axis === 'z' ? Math.PI / 2 : 0, rz = axis === 'x' ? Math.PI / 2 : 0;
  const disc = (rr, c, d) => k.add(new THREE.CylinderGeometry(rr, rr, 0.3, 14), c, x + (axis === 'x' ? d : 0), y + (axis === 'y' ? d : 0), z + (axis === 'z' ? d : 0), rx, 0, rz);
  disc(r, o, 0); disc(r * 0.5, i, 0.12 * (z < 0 && axis === 'z' ? -1 : 1));
}
// 履帶：側視為一圈履帶（中間挖空），內有負重輪＋輪轂、前主動輪、後誘導輪、上方托輪，上緣有履帶板段落
function tracks(k, L, W, h = 5, o = {}) {
  const tw = o.tw || 4.2, t = Math.min(0.75, h * 0.16), c = o.c || TRK, wc = o.wc || '#3a3d42';
  const wr = (h - 2 * t) * (o.big ? 0.5 : 0.42);
  const xs = L / 2 - 1.9, xi = -L / 2 + 1.9, sr = h * 0.3;
  const n = o.n || Math.max(3, Math.floor((L - 9.2) / (2 * wr + 0.35)) + 1);
  const outer = [[-L / 2 + 3, 0], [L / 2 - 3, 0], [L / 2, h * 0.6], [L / 2 - 1.2, h], [-L / 2 + 1.2, h], [-L / 2, h * 0.6]];
  const inner = [[-L / 2 + 3.3, t], [L / 2 - 3.3, t], [L / 2 - t * 1.2, h * 0.6], [L / 2 - 1.5, h - t], [-L / 2 + 1.5, h - t], [-L / 2 + t * 1.2, h * 0.6]];
  for (const s of [-1, 1]) {
    const zo = s * (W / 2 - tw / 2), zf = s * (W / 2 - 0.12), zb = s * (W / 2 - tw + 1.2);
    k.fin(outer, zo, tw, c, 0, [inner]);
    k.fin(inner, s * (W / 2 - tw + 0.7), 1.4, '#1c1d1f');                              // 輪子後方的暗面
    for (let x = -L / 2 + 1.7; x <= L / 2 - 1.6; x += 2.1) k.box(0.55, 0.16, tw + 0.06, x, h + 0.04, zo, PAD);   // 履帶板
    for (let i = 0; i < n; i++) {
      const x = xi + 2.6 + i * (xs - xi - 5.3) / Math.max(1, n - 1);
      k.tube([x, t + wr, zf], [x, t + wr, zb], wr, wc, 8);
      k.tube([x, t + wr, zf + s * 0.22], [x, t + wr, zf - s * 0.1], wr * 0.4, HUB, 5);
    }
    for (const [x, r] of [[xs, sr], [xi, sr * 0.9]]) {                                  // 主動輪／誘導輪
      k.tube([x, h * 0.6, zf], [x, h * 0.6, zb], r, wc, 8);
      k.tube([x, h * 0.6, zf + s * 0.25], [x, h * 0.6, zf - s * 0.1], r * 0.5, HUB, 5);
    }
    if (!o.skirt) {                                                                     // 托輪（有側裙時看不到就省略）
      const nr = n > 5 ? 3 : 2;
      for (let i = 0; i < nr; i++) { const x = -L / 2 + 5 + (i + 0.5) * (L - 10) / nr; k.tube([x, h - t - 0.45, zf - s * 0.1], [x, h - t - 0.45, zb], 0.45, wc, 5); }
    }
  }
}
// 輪胎＋輪轂
function wheels(k, xs, W, r = 2.6, c = RUB) {
  for (const x of xs) for (const s of [-1, 1]) {
    k.tube([x, r, s * (W / 2 + 0.6)], [x, r, s * (W / 2 - 1.8)], r, c, 10);
    k.tube([x, r, s * (W / 2 + 0.78)], [x, r, s * (W / 2 + 0.4)], r * 0.48, HUB, 6);
  }
}
function barrel(k, x, y, z, len, r, c, elev = 0, yaw = 0, seg = 8) {
  const e = dirPt(x, y, z, len, elev, yaw);
  k.tube([x, y, z], e, r, c, seg);
  return e;
}
// 砲管：砲根套筒、排煙器（fume：位置比例）、砲口制退器（brake）或消焰器（flash）
function gun(k, x, y, z, len, r, c, elev = 0, yaw = 0, o = {}) {
  const p = t => dirPt(x, y, z, t, elev, yaw);
  k.tube(p(0), p(len), r, c, 8, r * 0.85);
  if (o.sleeve !== false) k.tube(p(-0.2), p(len * 0.14), r * 1.6, c, 8, r * 1.35);
  if (o.fume) k.tube(p(len * o.fume), p(len * o.fume + Math.max(1.2, len * 0.11)), r * 1.4, c, 8);
  if (o.brake) { const b = p(len - r * 1.4); k.box(r * 3, r * 2.1, r * 3.2, b[0], b[1], b[2], c, yaw, elev); k.box(r * 0.9, r * 2.3, r * 3.5, b[0], b[1], b[2], BLK, yaw, elev); }
  if (o.flash) k.tube(p(len - r * 2.2), p(len + r * 0.8), r * 1.5, GUN, 6);
  return p(len);
}
function missile(k, a, b, r, body = '#e5e7eb', tip = '#dc2626', fins = false) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(), u = d.clone().normalize();
  const T = A.clone().addScaledVector(u, L * 0.82);
  k.tube(a, T.toArray(), r, body, 8);
  k.tube(T.toArray(), b, r, tip, 8, 0.01);
  if (fins) { const F = A.clone().addScaledVector(u, r * 1.6), yaw = Math.atan2(-u.z, u.x), el = Math.asin(u.y); k.box(r * 3, r * 4.4, 0.18, F.x, F.y, F.z, '#9ca3af', yaw, el); k.box(r * 3, 0.18, r * 4.4, F.x, F.y, F.z, '#9ca3af', yaw, el); }
}
// 空對空／空對地飛彈（水平、朝 +x）
function aam(k, x, y, z, len = 5, r = 0.3, c = WHITE, tip = '#9ca3af') {
  k.tube([x - len / 2, y, z], [x + len / 2 - 1, y, z], r, c, 6);
  k.tube([x + len / 2 - 1, y, z], [x + len / 2, y, z], r, tip, 6, 0.03);
  k.box(1, r * 4.4, 0.12, x - len / 2 + 0.6, y, z, '#9ca3af'); k.box(1, 0.12, r * 4.4, x - len / 2 + 0.6, y, z, '#9ca3af');
}
function bomb(k, x, y, z, len = 4, r = 0.55) {
  pod(k, x - len / 2, x + len / 2, y, z, r, '#4b5320', 6, 0.35);
  k.box(0.8, r * 2.6, 0.12, x - len / 2 + 0.3, y, z, '#3f4420'); k.box(0.8, 0.12, r * 2.6, x - len / 2 + 0.3, y, z, '#3f4420');
}
function smokeGL(k, x, y, hw, n = 3, c = GUN) {          // 煙幕彈發射器（砲塔兩側，朝前上外）
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) k.box(1.1, 0.5, 0.5, x - i * 0.62, y + (i % 2) * 0.32, s * (hw + 0.2), c, -s * 0.45, 0.55);
}
function mg(k, x, y, z, len = 3.6, yaw = 0) {             // 車長機槍：機匣＋槍管＋彈藥箱
  k.box(1.5, 0.6, 0.55, x, y, z, GUN, yaw);
  barrel(k, x + Math.cos(yaw) * 0.7, y + 0.08, z - Math.sin(yaw) * 0.7, len, 0.13, GUN, 0.03, yaw, 5);
  k.box(0.6, 0.6, 0.5, x - 0.1, y - 0.05, z + 0.5, '#4b5320', yaw);
}
function cupola(k, P, x, y, z, r = 1.5, gunYaw = 0, big = false) {
  k.tube([x, y - 0.2, z], [x, y + 1.0, z], r, P.dark, 8, r * 0.92);
  k.tube([x - r * 0.2, y + 1.0, z], [x - r * 0.2, y + 1.25, z], r * 0.72, shade(P.body, -0.25), 7);   // 艙蓋
  mg(k, x + 0.3, y + 1.6, z, big ? 4.2 : 3.4, gunYaw);
}
function hatch(k, P, x, y, z, r = 1.1) { k.tube([x, y - 0.05, z], [x, y + 0.28, z], r, shade(P.body, -0.25), 7); }
function antenna(k, x, y, z, h = 7) { k.box(0.6, 0.5, 0.6, x, y + 0.2, z, GUN); k.tube([x, y + 0.4, z], [x - h * 0.12, y + h, z], 0.09, '#1f2125', 4); }
function lamps(k, x, y, z) { for (const s of [-1, 1]) k.box(0.5, 0.75, 1.0, x, y, s * z, LAMP); }

// ----- 步兵 -----
// 姿勢：stand（持槍警戒）、aim（舉槍瞄準）、kneel（跪姿）、walk（行進）、prone（臥姿）
function limb(k, a, b, r, c) { k.tube(a, b, r, c, 5); }
function rifle(k, a, b, c = '#26282b', mag = true) {
  k.tube(a, b, 0.22, c, 4);
  const m = [(a[0] * 0.6 + b[0] * 0.4), (a[1] * 0.6 + b[1] * 0.4), (a[2] * 0.6 + b[2] * 0.4)];
  if (mag) k.box(0.45, 1.0, 0.3, m[0], m[1] - 0.5, m[2], c);
  k.box(1.2, 0.55, 0.4, a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12 - 0.1, a[2] + (b[2] - a[2]) * 0.12, c);
}
function helmet(k, P, x, hy, z, s) {
  const { body, dark, nat } = P;
  if (['RU', 'KP', 'VN'].includes(nat)) k.domeLo(x, hy, z, 2.4 * s, 2.1 * s, 2.4 * s, body);
  else if (nat === 'DE') { k.domeLo(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body); k.box(5.0 * s, 0.4 * s, 5.0 * s, x - 0.3 * s, hy - 0.2 * s, z, dark); }
  else if (nat === 'GB') { k.domeLo(x, hy, z, 2.0 * s, 1.4 * s, 2.0 * s, body); k.tube([x, hy, z], [x, hy + 0.3 * s, z], 3.2 * s, dark, 10); }
  else if (nat === 'AU' || nat === 'PH') { k.tube([x, hy, z], [x, hy + 0.3 * s, z], 3.3 * s, dark, 10); k.tube([x, hy, z], [x, hy + 1.8 * s, z], 1.9 * s, body, 8, 1.5 * s); }
  else if (nat === 'FR') { k.tube([x, hy - 0.4 * s, z], [x, hy + 2.4 * s, z], 1.9 * s, body, 8, 1.7 * s); k.box(1.4 * s, 0.4 * s, 2.6 * s, x + 2 * s, hy - 0.2 * s, z, dark); }
  else if (nat === 'IN') k.ballLo(x, hy + 0.6 * s, z, 2.3 * s, 1.7 * s, 2.3 * s, '#c2410c');
  else if (nat === 'JP') { k.domeLo(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body); k.tube([x + 1.6 * s, hy + 0.2 * s, z], [x + 2.6 * s, hy, z], 1.4 * s, dark, 6); }
  else { k.domeLo(x, hy, z, 2.2 * s, 2.0 * s, 2.2 * s, body); k.box(0.6 * s, 0.6 * s, 1.2 * s, x + 1.9 * s, hy + 0.6 * s, z, '#1f2125'); }   // 夜視鏡座
}
function soldier(k, x, z, P, opt = {}) {
  const { body, dark } = P;
  const s = opt.s || 1, pose = opt.pose || 'stand', w = opt.weapon || 'rifle', skin = '#e6c49f', boot = '#2a2420';
  const S = (dx, dy, dz) => [x + dx * s, dy * s, z + dz * s];
  if (pose === 'prone') {
    k.box(6.2 * s, 2.2 * s, 3.4 * s, x + 0.8 * s, 1.2 * s, z, body);                               // 身體
    k.box(2.0 * s, 2.4 * s, 2.8 * s, x - 0.6 * s, 2.6 * s, z, dark);                               // 背包
    for (const d of [-0.9, 0.9]) { limb(k, S(-2.2, 0.9, d), S(-6.4, 0.6, d * 1.6), 0.75 * s, dark); k.box(1.2 * s, 0.9 * s, 0.9 * s, x - 6.8 * s, 0.6 * s, z + d * 1.6 * s, boot); }
    k.ballLo(x + 5.0 * s, 2.4 * s, z, 1.6 * s, 1.6 * s, 1.6 * s, skin);
    helmet(k, P, x + 5.0 * s, 2.9 * s, z, 0.92 * s);
    limb(k, S(3.6, 1.6, -1.6), S(6.4, 1.2, -0.6), 0.55 * s, body); limb(k, S(3.6, 1.6, 1.6), S(5.2, 1.2, 0.8), 0.55 * s, body);
    if (w !== 'none') rifle(k, S(4.4, 1.9, 0.4), S(w === 'long' ? 13 : 10, 1.6, 0.2));
    if (w === 'long') { k.tube(S(6.4, 2.55, 0.25), S(8.8, 2.55, 0.25), 0.28 * s, '#1f2125', 6); limb(k, S(11, 1.4, -0.6), S(11.6, 0, -1.2), 0.12 * s, GUN); limb(k, S(11, 1.4, 0.8), S(11.6, 0, 1.4), 0.12 * s, GUN); }
    return;
  }
  const kneel = pose === 'kneel', hip = kneel ? 3.2 : 4.4;
  // 腿
  if (kneel) {
    limb(k, S(0, 3.2, -0.9), S(2.6, 2.4, -0.9), 0.8 * s, dark); limb(k, S(2.6, 2.4, -0.9), S(2.6, 0.2, -0.9), 0.75 * s, dark);  // 前腿
    limb(k, S(0, 3.2, 0.9), S(-0.4, 0.6, 0.9), 0.8 * s, dark); limb(k, S(-0.4, 0.6, 0.9), S(-3.4, 0.5, 0.9), 0.75 * s, dark);  // 跪地的腿
    k.box(1.6 * s, 0.9 * s, 1.0 * s, x + 3.0 * s, 0.45 * s, z - 0.9 * s, boot);
  } else {
    const st = pose === 'walk' ? 1.4 : 0.5;
    for (const [d, f] of [[-0.95, st], [0.95, -st * (pose === 'walk' ? 1 : 0.4)]]) {
      limb(k, S(0, hip, d), S(f, 0.6, d * 1.05), 0.82 * s, dark);
      k.box(1.7 * s, 0.9 * s, 1.0 * s, x + (f + 0.3) * s, 0.45 * s, z + d * 1.05 * s, boot);
    }
  }
  const ty = hip + 2.3;                                                                            // 身體中心
  const lean = pose === 'aim' ? 0.15 : 0.05;
  k.box(2.8 * s, 4.6 * s, 3.6 * s, x, ty * s, z, body, 0, -lean);                                // 軀幹
  k.box(3.0 * s, 2.4 * s, 3.8 * s, x + 0.1 * s, (ty + 0.5) * s, z, shade(body, -0.18), 0, -lean); // 防彈背心
  k.box(2.9 * s, 0.6 * s, 3.7 * s, x, (ty - 2.0) * s, z, '#3a3428');                             // 腰帶
  k.box(2.0 * s, 3.6 * s, 3.0 * s, x - 2.3 * s, (ty + 0.2) * s, z, dark);                        // 背包
  k.tube(S(-2.4, ty + 2.2, -1.6), S(-2.4, ty + 2.2, 1.6), 0.6 * s, shade(dark, -0.2), 5);        // 睡袋
  const hy = ty + 3.4;
  k.ballLo(x + (0.25 + lean * 3) * s, hy * s, z, 1.6 * s, 1.75 * s, 1.6 * s, skin);
  helmet(k, P, x + lean * 3 * s, (hy + 0.5) * s, z, s);
  // 手臂與武器
  const sh = ty + 1.6, R = 1.95;
  if (w === 'tube' || w === 'manpads') {
    const up = w === 'manpads' ? 0.6 : 0.06, a = S(-4, sh + 1.0 - up * 4, 2.1), b = S(5, sh + 1.0 + up * 5, 2.1);
    k.tube(a, b, 0.85 * s, opt.tubeCol || '#4d5a2b', 6);
    k.box(1.6 * s, 1.1 * s, 0.6 * s, x + 1.2 * s, (sh + 0.4 + up) * s, z + 1.2 * s, '#26282b');   // 瞄準具
    limb(k, S(0, sh, R), S(1.2, sh - 0.4, 1.9), 0.6 * s, body); limb(k, S(0, sh, -R), S(2.4, sh - 0.2, 1.4), 0.6 * s, body);
  } else if (w === 'shovel') {
    k.tube(S(1.6, 0.6, 1.8), S(2.4, sh + 0.4, 1.8), 0.3 * s, '#7c5a36', 5); k.box(1.6 * s, 2.0 * s, 0.3 * s, x + 1.5 * s, 1.0 * s, z + 1.8 * s, '#6b7280');
    limb(k, S(0, sh, R), S(2.2, sh - 0.6, 1.9), 0.6 * s, body); limb(k, S(0, sh, -R), S(1.8, sh - 2.2, 0.8), 0.6 * s, body);
    rifle(k, S(-1.6, ty - 1.4, -2.2), S(-0.4, ty + 3.2, -2.2));                                     // 背上的步槍
  } else if (w === 'none') {
    limb(k, S(0, sh, R), S(0.6, sh - 3.6, 2.2), 0.6 * s, body); limb(k, S(0, sh, -R), S(1.6, sh - 1.8, -1.4), 0.6 * s, body);
    k.box(1.2 * s, 1.6 * s, 0.4 * s, x + 2.0 * s, (sh - 1.4) * s, z - 1.2 * s, '#3f4a2f');           // 手上的砲彈
  } else if (pose === 'aim' || kneel) {
    const gy = sh + 0.4;
    limb(k, S(0, sh, R), S(1.0, gy - 0.6, 1.4), 0.6 * s, body); limb(k, S(0, sh, -R), S(3.6, gy - 0.4, 0.4), 0.6 * s, body);
    rifle(k, S(0.3, gy, 0.9), S(w === 'long' ? 9 : 7, gy + 0.2, 0.6));
  } else {
    limb(k, S(0, sh, R), S(1.4, sh - 2.2, 1.6), 0.6 * s, body); limb(k, S(0, sh, -R), S(2.6, sh - 1.4, 0.2), 0.6 * s, body);
    rifle(k, S(0.4, sh - 2.8, 1.5), S(5.4, sh + 0.2, -0.6));                                       // 持槍斜舉
  }
}
function infantry(base) {
  return (k, P) => {
    if (base === 'sniper') {
      soldier(k, 0, -3, P, { pose: 'prone', weapon: 'long' });
      soldier(k, -3, 6, P, { pose: 'prone', s: 0.9 });
      k.box(2.2, 1.0, 1.2, 4.4, 2.3, 6.6, '#1f2125');                       // 觀測鏡
      return;
    }
    if (base === 'mortar') {
      soldier(k, -5, -4, P, { pose: 'kneel' }); soldier(k, -6, 6, P, { weapon: 'none' });
      k.tube([3, 0.2, 1], [3, 0.6, 1], 2.6, '#3f4247', 8);
      k.tube([3, 0.6, 1], [8, 11, 1], 1.1, '#3f4247', 8); k.tube([7.6, 10.2, 1], [8.1, 11.2, 1], 1.35, '#2a2c30', 6);
      k.tube([5.5, 6, 1], [3.5, 0.3, 4], 0.3, '#3f4247', 5); k.tube([5.5, 6, 1], [3.5, 0.3, -2], 0.3, '#3f4247', 5);
      k.box(1.2, 1.2, 1.6, 5.4, 6, 1, '#2a2c30');
      for (const z of [5.5, 7]) k.box(2.6, 1.4, 1.2, 3, 0.7, z, '#4b5320');  // 彈藥箱
      return;
    }
    if (base === 'manpads') { soldier(k, 1, -3, P, { weapon: 'manpads' }); soldier(k, -5, 6, P, { s: 0.92, pose: 'kneel' }); k.box(5, 1.4, 1.6, -6, 0.7, -5, '#4d5a2b'); return; }
    if (base === 'atinf') { soldier(k, 2, -4, P, { weapon: 'tube', pose: 'kneel' }); soldier(k, -5, 5, P, { weapon: 'tube', tubeCol: '#556b2f' }); return; }
    if (base === 'engineer') { soldier(k, 2, -4, P, { weapon: 'shovel' }); soldier(k, -5, 5, P, { weapon: 'shovel', pose: 'walk' }); k.box(4, 3, 4, 7, 1.5, 6, '#a16207'); k.box(4.2, 0.4, 4.2, 7, 3.1, 6, '#78350f'); return; }
    if (base === 'specops') { const Q = { ...P, body: shade(P.body, -0.45), dark: '#1f2125' }; soldier(k, 3, -4, Q, { pose: 'aim' }); soldier(k, -4, 5, Q, { pose: 'kneel' }); return; }
    if (base === 'wafer_inf') {
      const Q = { ...P, body: '#cbd5e1', dark: '#475569' };
      soldier(k, 3, -4, Q); soldier(k, -4, 5, Q, { pose: 'walk' }); k.ballLo(9, 7, 0, 1.6, 1.6, 1.6, '#22d3ee'); return;
    }
    if (base === 'marine') {
      // 陸戰隊：橡皮艇（浮筒＋艇底＋舷外機）加兩名隊員
      k.slab([[-12, -3.6], [9, -3.6], [12, 0], [9, 3.6], [-12, 3.6]], 0, 0.8, '#3a3f47');
      for (const s of [-1, 1]) k.tube([-12.5, 1.5, s * 4], [9, 1.5, s * 4], 1.5, '#2b2f36', 7);
      k.tube([9, 1.5, 4], [13, 1.5, 0], 1.5, '#2b2f36', 7); k.tube([9, 1.5, -4], [13, 1.5, 0], 1.5, '#2b2f36', 7);
      k.box(2, 3, 2, -13, 2.6, 0, '#1f2125'); k.box(0.8, 3, 0.8, -13.6, 0.6, 0, '#1f2125');
      soldier(k, 3, -1.6, P, { s: 0.82, pose: 'kneel' }); soldier(k, -5, 1.6, P, { s: 0.82, pose: 'kneel' });
      return;
    }
    soldier(k, 3, -5, P, { pose: 'aim' }); soldier(k, -4, 4, P); soldier(k, 6, 6, P, { pose: 'kneel' });
  };
}

// ----- 地面車輛 -----
// 履帶車體：下車體＋前下斜板、上車體（前上斜板、後斜板、上緣倒角）、頭燈、拖鉤、尾燈、工具箱、引擎散熱格柵
function hullTracked(k, P, L = 30, W = 17, H = 5.2, y = 4.4, o = {}) {
  const th = Math.min(5, y + 0.8);
  tracks(k, L, W, th, { skirt: o.skirt, big: o.big, wc: o.wc || shade(P.body, -0.55) });
  const Wl = W - 8, Wu = W - 0.2, g = o.glacis ?? Math.min(H * 1.5, L * 0.24), ch = Math.min(1.1, H * 0.22);
  k.loft([[-L / 2 + 1, sec(Wl, 1.3, y - 1.1)], [L / 2 - 3.2, sec(Wl, 1.3, y - 1.1)], [L / 2 - 0.4, sec(Wl, y - 0.9, 1.0)]], shade(P.body, -0.22));
  k.loft([[-L / 2, sec(Wu, y, H * 0.72, ch * 0.6)], [-L / 2 + 1.1, sec(Wu, y, H, ch)], [L / 2 - g, sec(Wu, y, H, ch)], [L / 2, sec(Wu, y, H * 0.3, ch * 0.3)]], P.body);
  const ft = y + H, fy = y + H * 0.3;
  if (o.skirt) for (const s of [-1, 1]) {
    k.box(L - 3.4, th * 0.5, 0.35, 0.2, th * 0.73, s * (W / 2 + 0.17), o.skirt);
    for (let i = 1; i < 5; i++) k.box(0.22, th * 0.5, 0.42, -L / 2 + 1.9 + i * (L - 3.4) / 5, th * 0.73, s * (W / 2 + 0.2), shade(o.skirt, -0.35));
  }
  lamps(k, L / 2 - 0.55, fy + 0.45, Wu / 2 - 1.3);
  for (const s of [-1, 1]) {
    k.box(0.9, 0.9, 0.8, L / 2 - 0.1, y - 0.5, s * (Wl / 2 - 0.9), GUN);                          // 拖鉤
    k.box(0.4, 0.7, 0.9, -L / 2 - 0.05, y + H * 0.42, s * (Wu / 2 - 1.2), TAIL);                    // 尾燈
    if (!o.noBox) k.box(4.2, 1.2, 1.5, -L / 2 + 4.2, ft + 0.55, s * (Wu / 2 - 1.9), P.dark);         // 工具箱
  }
  if (o.drums) for (const s of [-1, 1]) k.tube([-L / 2 + 1.7, ft + 1.0, s * 1.3], [-L / 2 + 1.7, ft + 1.0, s * (Wu / 2 - 1.3)], 1.0, P.dark, 8);   // 蘇式外掛油桶
  else for (let i = 0; i < 3; i++) k.box(0.45, 0.12, Wu * 0.36, -L / 2 + 2.0 + i * 1.1, ft + 0.04, 0, BLK);                                // 散熱格柵
  if (!o.noHatch) hatch(k, P, L / 2 - g - 1.4, ft, Wu / 2 - 3.6, 1.0);                                // 駕駛艙蓋
  k.H = { L, W, H, y, g, Wu, ft, fy };
  return ft;
}
// 輪型車體：V 形車底、斜側面、前斜板，輪拱外露
function hullWheeled(k, P, L = 28, W = 15, H = 6, n = 4, y = 3.6, o = {}) {
  const xs = []; for (let i = 0; i < n; i++) xs.push(-L / 2 + 4.5 + i * (L - 9) / Math.max(1, n - 1));
  wheels(k, xs, W, o.r || 2.6);
  const a = W - 0.6, g = o.nose ?? Math.min(H * 1.1, 6);
  const S = (h, ins = 0) => [[-a / 2 + 2.2 + ins, y - 1.2 + ins * 0.6], [a / 2 - 2.2 - ins, y - 1.2 + ins * 0.6], [a / 2 - ins, y + 0.5], [a / 2 - ins, y + h * 0.62],
    [a / 2 - 1.4 - ins, y + h], [-a / 2 + 1.4 + ins, y + h], [-a / 2 + ins, y + h * 0.62], [-a / 2 + ins, y + 0.5]];
  k.loft([[-L / 2, S(H * 0.9, 0.2)], [-L / 2 + 0.8, S(H)], [L / 2 - g, S(H)], [L / 2, S(H * 0.4, 1.0)]], P.body);
  const ft = y + H, fy = y + H * 0.4;
  lamps(k, L / 2 - 0.45, fy + 0.4, a / 2 - 2.0);
  k.box(0.3, 0.7, a * 0.4, L / 2 - g * 0.55, y + H * 0.72, 0, '#1f2937', 0, 0.75);                    // 駕駛觀測窗
  for (const s of [-1, 1]) {
    k.box(0.9, 0.8, 0.8, L / 2 + 0.1, y - 0.1, s * (a / 2 - 3.2), GUN);                              // 拖鉤
    k.box(0.4, 0.7, 0.9, -L / 2 - 0.05, y + H * 0.45, s * (a / 2 - 1.2), TAIL);
    k.box(L * 0.3, 1.0, 0.5, -L * 0.12, y + H * 0.45, s * (a / 2 + 0.15), P.dark);                     // 側邊收納箱
  }
  k.box(0.3, H * 0.6, a * 0.42, -L / 2 - 0.1, y + H * 0.42, 0, P.dark);                                // 後門
  if (o.vane) k.box(0.4, H * 0.42, a * 0.86, L / 2 + 0.25, y + H * 0.2, 0, P.dark, 0, -0.45);        // 涉水防浪板
  k.H = { L, W, H, y, g, Wu: a, ft, fy };
  return ft;
}
// 卡車底盤：長鼻（引擎蓋在前）或平頭駕駛室、擋風玻璃、側窗、水箱護罩、頭燈、保險桿、後照鏡、擋泥板、油箱
function truckBody(k, P, L = 30, W = 13, n = 3, cabCol) {
  const xs = []; for (let i = 0; i < n; i++) xs.push(L / 2 - 5 - i * (L - 9) / Math.max(1, n - 1));
  wheels(k, xs, W, 2.8);
  const cc = cabCol || P.body, hood = HOOD.includes(P.nat), F = L / 2, cw = W - 1;
  k.box(L - 1, 1.4, W - 5, -0.5, 4.3, 0, '#2f3134');                                                   // 大樑
  let back;
  if (hood) {
    back = F - 9.4;
    k.loft([[back, sec(cw, 5, 7.2, 0.9)], [F - 5.2, sec(cw, 5, 7.2, 0.9)], [F - 3.8, sec(cw, 5, 4.6, 0.7)]], cc);
    k.loft([[F - 3.9, sec(cw - 3, 5, 4.4, 0.8)], [F - 0.4, sec(cw - 3.4, 5, 3.9, 0.8)]], cc);        // 引擎蓋
    k.box(0.2, 2.6, cw - 2.2, F - 4.5, 10.8, 0, GLASS, 0, 0.49);
    k.box(0.2, 2.6, cw - 4.6, F - 0.3, 7.2, 0, '#1f2125');                                           // 水箱護罩
    for (const s of [-1, 1]) k.box(4.6, 2.6, 1.6, F - 2.4, 5.6, s * (cw / 2 - 0.5), shade(cc, -0.3)); // 前擋泥板
    lamps(k, F - 0.25, 7.6, cw / 2 - 2.4);
  } else {
    back = F - 7.6;
    k.loft([[back, sec(cw, 5, 7.4, 0.9)], [F - 1.7, sec(cw, 5, 7.4, 0.9)], [F - 0.3, sec(cw, 5, 5.2, 0.7)]], cc);
    k.box(0.2, 2.6, cw - 1.8, F - 1.0, 11.3, 0, GLASS, 0, 0.49);
    k.box(0.2, 2.0, cw - 4, F - 0.2, 7.3, 0, '#1f2125');
    lamps(k, F - 0.15, 6.0, cw / 2 - 1.2);
  }
  for (const s of [-1, 1]) {
    k.box(2.6, 2.2, 0.2, back + 2.2, 10.6, s * (cw / 2 + 0.02), GLASS);                               // 側窗
    k.box(0.4, 1.6, 0.6, back + 4.4, 10.6, s * (cw / 2 + 0.6), '#1f2125');                            // 後照鏡
    k.tube([back - 0.2, 4.6, s * (W / 2 - 3.4)], [back - 3.6, 4.6, s * (W / 2 - 3.4)], 1.0, '#4b5058', 7);  // 油箱
    for (const x of xs.slice(1)) k.box(6.2, 0.4, 2.6, x, 5.85, s * (W / 2 - 0.5), '#26282b');        // 後擋泥板
  }
  k.box(0.8, 1.0, W - 1.2, F + 0.1, 4.4, 0, GUN);                                                      // 保險桿
  roundel(k, P.nat, back + 3.5, 9, (cw / 2) + 0.12, 1.3, 'z');
  const bx0 = -L / 2 + 0.5, bx1 = back - 0.4;
  return { bedX: (bx0 + bx1) / 2, bedL: bx1 - bx0, top: 5.2, back };
}
// 帆布篷（拱形截面）
function canopy(k, x0, x1, y0, hw, hh, c, ribs) {
  const S = [[-hw, y0], [hw, y0]]; for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI; S.push([Math.cos(a) * hw, y0 + hh * 0.55 + Math.sin(a) * hh * 0.45]); }
  k.loft([[x0, S], [x1, S]], c);
  if (ribs) for (let i = 1; i < 4; i++) k.box(0.3, 0.25, hw * 1.2, x0 + i * (x1 - x0) / 4, y0 + hh + 0.06, 0, ribs);
}
// 炮塔：斜側面的放樣砲塔（rear → front 漸窄）
function turretLoft(k, c, xr, xf, y, w, h, ch, nose = 0, nw = w * 0.6) {
  const S = [[xr, sec(w, y, h, ch)], [xf - nose, sec(w, y, h, ch)]];
  if (nose) S.push([xf, sec(nw, y + h * 0.1, h * 0.8, ch * 0.7)]);
  k.loft(S, c);
}
function tank(k, P, light = false) {
  const nat = P.nat, t = light ? (nat === 'JP' ? 'wheel' : 'small') : (TURRET[nat] || 'wedge');
  const s = light ? 0.82 : 1, L = 32 * s, W = 17 * s, sov = SOVIET.includes(nat);
  let top;
  if (t === 'wheel') top = hullWheeled(k, P, 27, 14.4, 5, 4, 3.4);
  else top = hullTracked(k, P, L, W, 5 * s, 4.2 * s, { skirt: light ? null : sov || nat === 'PK' ? RUB : P.body, big: P.east && !light, drums: !light && sov });
  let tx = -1, ty = top, fx, gy, th, hw, rx;
  if (t === 'dome') {
    k.dome(tx, ty, 0, 8, 4.6, 7.4, P.body);
    fx = tx + 6.4; gy = ty + 2.3; th = ty + 4.6; hw = 6.6; rx = tx - 7;
    if (nat === 'RU' || nat === 'IN') {                                                      // 反應裝甲：砲塔前緣＋車首斜板
      for (const z of [-5.2, -3, 3, 5.2]) k.box(2.4, 1.4, 2.3, tx + 5.6 - Math.abs(z) * 0.35, ty + 2.9, z, P.dark, Math.sign(z) * 0.5, -0.35);
      const H = k.H; for (let i = -2; i <= 2; i++) k.box(2.4, 0.5, 2.4, L / 2 - H.g * 0.45, H.fy + H.H * 0.38, i * 2.7, P.dark, 0, 0.42);
    }
    if (nat === 'CN') k.loft([[tx + 3, sec(9, ty + 0.3, 3.4, 0.5)], [tx + 7.6, sec(3.4, ty + 0.6, 2.6, 0.4)]], P.body);   // 99 式楔形附加裝甲
    if (nat === 'KP' || nat === 'VN') { k.box(2, 1.8, 2, tx + 2, th - 0.4, 3.6, P.dark); k.box(0.2, 1.4, 1.6, tx + 3.05, th - 0.4, 3.6, LAMP); }   // 紅外線探照燈
    if (sov) k.tube([rx + 0.3, ty + 2.4, -4], [rx + 0.3, ty + 2.4, 2], 0.5, P.dark, 6);   // 潛渡呼吸管
  } else if (t === 'cast') {
    k.ball(tx, ty + 1.2, 0, 8, 4, 6.8, P.body);
    fx = tx + 6.6; gy = ty + 2.4; th = ty + 5.2; hw = 6.4; rx = tx - 7.5;
    k.box(3, 2.2, 9, tx - 8.2, ty + 2.2, 0, P.dark);                                         // 砲塔尾艙
  } else if (t === 'box') {
    const jp = nat === 'JP';
    turretLoft(k, P.body, tx - 8, tx + (jp ? 7 : 6), ty, 11.4, 5, 0.6, jp ? 2.6 : 0, 8.4);
    if (!jp) k.loft([[tx + 5.8, sec(11, ty + 0.4, 4.4, 0.4)], [tx + 10, sec(0.6, ty + 0.4, 4.4, 0.2)]], P.body);   // 豹 2A6 箭形附加裝甲
    fx = tx + (jp ? 6.6 : 5.9); gy = ty + 2.6; th = ty + 5; hw = 5.7; rx = tx - 8;
    k.box(2.6, 2.4, 10, tx - 9.2, ty + 2, 0, P.dark); k.box(2.8, 0.25, 10.4, tx - 9.2, ty + 3.3, 0, GUN);   // 尾部置物籃
    k.tube([tx + 1.5, th, -3.4], [tx + 1.5, th + 1.3, -3.4], 0.75, P.dark, 6); k.box(1.8, 1.2, 1.8, tx + 1.5, th + 1.8, -3.4, P.dark); k.box(0.2, 0.7, 1.2, tx + 2.45, th + 1.8, -3.4, GLASS);   // 車長周視鏡
  } else if (t === 'slab') {
    turretLoft(k, P.body, tx - 8.5, tx + 6.5, ty, 11.6, 4.6, 0.9, 1.6, 9);
    fx = tx + 6.2; gy = ty + 2.3; th = ty + 4.6; hw = 5.8; rx = tx - 8.5;
    k.box(3, 3, 3, tx + 1, th + 1.4, -3.5, P.dark); k.box(0.2, 1.2, 2.2, tx + 2.55, th + 1.6, -3.5, GLASS);   // 熱像儀
    k.box(3, 2.4, 10.6, tx - 9.6, ty + 2, 0, P.dark);
  } else if (t === 'merkava') {
    tx = -5;
    turretLoft(k, P.body, tx - 7, tx + 10, ty, 11.6, 4.2, 1.2, 6, 4);
    fx = tx + 9.4; gy = ty + 2.2; th = ty + 4.2; hw = 5.8; rx = tx - 7;
    for (let i = 0; i < 7; i++) k.ballLo(tx - 7.5, ty + 0.5, -4.8 + i * 1.6, 0.6, 0.6, 0.6, '#3f4247');   // 尾部鏈條
    k.box(2.6, 2.2, 1.8, tx + 2, th + 1, 3.6, P.dark); k.box(0.2, 1.2, 1.4, tx + 3.35, th + 1, 3.6, GLASS);
  } else if (t === 'small' || t === 'wheel') {
    if (t === 'wheel') tx = -2;
    turretLoft(k, P.body, tx - 5 * s, tx + 5 * s, ty, 9.6 * s, 4 * s, 1, 2 * s, 6.4 * s);
    fx = tx + 4.6 * s; gy = ty + 2.1 * s; th = ty + 4 * s; hw = 4.8 * s; rx = tx - 5 * s;
    k.box(2.6 * s, 2.4 * s, 8 * s, tx - 6 * s, ty + 1.9 * s, 0, P.dark);
  } else { // wedge：M1／K1 類扁長楔形
    turretLoft(k, P.body, tx - 9, tx + 8, ty, 12, 4.2, 1.3, 5, 6.4);
    fx = tx + 7.6; gy = ty + 2.2; th = ty + 4.2; hw = 6; rx = tx - 9;
    k.box(3.4, 2.4, 11, tx - 10.6, ty + 1.7, 0, P.dark); k.box(3.6, 0.25, 11.4, tx - 10.6, ty + 3.0, 0, GUN);   // 尾部置物架
    k.box(2.4, 1.3, 1.8, tx + 3, th + 0.5, 3, P.body); k.box(0.2, 0.8, 1.3, tx + 4.25, th + 0.6, 3, GLASS);   // 砲手瞄準鏡
    if (nat === 'US') { k.tube([tx - 1.5, th, -3.6], [tx - 1.5, th + 1.1, -3.6], 0.35, GUN, 5); k.box(1.5, 1.4, 1.5, tx - 1.5, th + 1.7, -3.6, P.dark); k.box(0.2, 0.8, 1.0, tx - 0.7, th + 1.7, -3.6, GLASS); }
  }
  // 防盾、主砲（排煙器；輕戰車加砲口制退器）
  if (t !== 'dome') k.box(1.6 * s, 2.6 * s, 3.4 * s, fx, gy, 0, P.dark);
  else k.box(2.2, 2.4, 4.2, fx - 0.4, gy, 0, P.dark);
  const E = t === 'merkava' ? 22 : t === 'dome' ? tx + 26 : tx + 24 * s;
  gun(k, fx + 0.5, gy, 0, E - fx - 0.5, 0.82 * s, P.dark, 0, 0, { fume: P.east ? 0.36 : 0.46, brake: light });
  barrel(k, fx + 0.4, gy - 0.6 * s, 1.6 * s, 2.2, 0.15, GUN, 0, 0, 5);                        // 同軸機槍
  // 車長塔＋機槍、裝填手艙蓋、煙幕彈、天線
  const cx = t === 'merkava' ? tx - 1 : tx - 3 * s;
  cupola(k, P, cx, th, -3 * s, 1.4 * s, 0, P.east);
  hatch(k, P, cx + 0.6, th, 3 * s, 1.0 * s);
  if (P.east && !light) mg(k, cx + 0.8, th + 0.9, 3 * s, 4.4, 0.2);
  smokeGL(k, fx - 2.4 * s, gy + 0.6 * s, hw - 0.1, P.east ? 4 : 3);
  for (const z of [-1, 1]) antenna(k, rx + 1.2, th - 0.2, z * (hw - 1.4), light ? 6 : 8);
  const H = k.H;
  roundel(k, P.nat, -4 * s, H.y + H.H * 0.5, H.Wu / 2 + 0.05, 1.5 * s, 'z');
}
function aaGun(k, P) {
  const wheeled = ['KR', 'PH'].includes(P.nat), top = wheeled ? hullWheeled(k, P, 24, 13.4, 3.6, 3, 2.8) : hullTracked(k, P, 30, 16, 5, 4.4, { noBox: true });
  const west = !P.east, tz = 0;
  turretLoft(k, P.body, -7, 5, top, 11, 5.6, 1, 1.5, 8.6);
  hatch(k, P, -3, top + 5.6, 2.6, 1.0);
  if (west) {
    // 蓋帕德式：後方旋轉搜索雷達、前方追蹤雷達圓盤、砲塔兩側外掛機砲
    k.tube([-5.5, top + 5.6, 0], [-5.5, top + 7.6, 0], 0.4, '#3f4247', 6);
    k.box(1.2, 4.4, 7.4, -5.5, top + 9.2, 0, P.dark, 0, 0.12); k.box(0.3, 4.0, 7.0, -4.9, top + 9.2, 0, '#1f2937', 0, 0.12);
    k.tube([4.2, top + 3.8, 0], [5.8, top + 3.8, 0], 2.2, P.dark, 10); k.tube([5.8, top + 3.8, 0], [6.2, top + 3.8, 0], 1.7, '#1f2937', 10);
    for (const z of [-1, 1]) {
      k.box(5, 3, 1.8, 0, top + 3.2, z * 6.4, P.dark);
      gun(k, 2, top + 3.6, z * 6.4, 13, 0.45, '#2b2d30', 0.75, 0, { sleeve: false, flash: true });
    }
  } else {
    // 石勒喀式：碟形雷達、四管機砲並列於砲塔前方
    k.tube([-4, top + 5.6, 0], [-4, top + 7, 0], 0.6, '#3f4247', 6);
    k.tube([-4.6, top + 9.8, 0], [-3.2, top + 9.8, 0], 3.0, P.dark, 10, 2.4); k.tube([-3.25, top + 9.8, 0], [-3.1, top + 9.8, 0], 2.3, '#1f2937', 10);
    const n = P.nat === 'VN' || P.nat === 'RU' || P.nat === 'IN' ? 4 : 2;
    for (let i = 0; i < n; i++) gun(k, 3.4, top + 3.6, (i - (n - 1) / 2) * 1.6, 13, 0.4, '#2b2d30', 0.75, 0, { sleeve: false, flash: true });
    k.box(3, 3, 6.6, 4.4, top + 3.4, 0, P.dark);
  }
  for (const z of [-1, 1]) antenna(k, -6.4, top + 5.4, z * 4.4, 6);
  smokeGL(k, 3, top + 4, 5.4, 2);
  roundel(k, P.nat, -1, top + 2.4, 5.6, 1.4, 'z');
}
function spsam(k, P) {
  const wheeled = ['US', 'TW', 'PK', 'CN', 'PH'].includes(P.nat);
  const top = wheeled ? hullWheeled(k, P, 26, 14, 4, 3) : hullTracked(k, P, 28, 16, 5, 4.4, { noBox: true });
  k.tube([-2, top, 0], [-2, top + 1.2, 0], 3.6, P.dark, 10);                    // 旋轉座
  k.box(8, 3, 6, -2, top + 2.6, 0, P.body);
  const steep = P.nat === 'IL' || P.nat === 'TW' ? 1.3 : 0.6, n = P.nat === 'FR' ? 4 : 2;
  for (const s of [-1, 1]) {
    // 發射箱＋飛彈
    const cz = s * 4.6, A = [-6, top + 4 + n * 1.1 - 1.1, cz];
    k.box(10, n * 2.4, 3.2, -6 + Math.cos(steep) * 5, top + 4 + n * 1.1 - 1.1 + Math.sin(steep) * 5, cz, P.dark, 0, steep);
    for (let i = 0; i < n; i++) {
      const y = top + 4 + i * 2.4, a = [-6 + Math.cos(steep) * 9, y + Math.sin(steep) * 9, cz];
      missile(k, a, [a[0] + Math.cos(steep) * 3, a[1] + Math.sin(steep) * 3, cz], 0.85);
    }
    void A;
  }
  // 搜索雷達（旋轉平面陣列）＋光電球
  k.tube([1.5, top + 4, 0], [1.5, top + 6.5, 0], 0.4, '#3f4247', 6);
  k.box(1, 4.6, 6.4, 1.5, top + 8.6, 0, P.dark); k.box(0.2, 4.0, 5.8, 2.05, top + 8.6, 0, '#1f2937');
  k.ballLo(1.5, top + 3.4, 0, 1.0, 1.0, 1.0, '#1f2937');
  roundel(k, P.nat, -9, top - 2.5, 7.6, 1.4, 'z');
}
function samTrailer(k, P) {
  wheels(k, [-6, -1], 14, 2.4);
  k.box(26, 2, 12.4, 0, 4.4, 0, P.dark);                                         // 拖車平台
  k.tube([13, 4.2, 0], [17, 3.0, 0], 0.4, GUN, 5); k.tube([16.6, 3.1, 0], [17.4, 3.0, 0], 0.7, GUN, 6);   // 拖桿
  for (const x of [-12, 11]) for (const s of [-1, 1]) { k.box(1, 0.6, 2.6, x, 4.2, s * 7, GUN); k.tube([x, 4, s * 7.9], [x, 0.4, s * 7.9], 0.35, GUN, 5); k.box(1.4, 0.4, 1.4, x, 0.2, s * 7.9, GUN); }   // 千斤頂支架
  k.box(5, 4, 9, 9, 7.2, 0, P.body); k.box(0.2, 2.8, 7, 11.55, 7.2, 0, BLK);      // 發電機／控制箱
  k.box(8, 3, 8, -2, 7, 0, P.body);
  const n = P.nat === 'US' || P.nat === 'TW' ? 0 : P.east ? 1 : 3;
  if (n === 0) {
    // 愛國者：四聯裝發射箱，仰角 32°，前端封蓋
    const a = 0.55, c = [2, 12.5, 0];
    k.box(16, 8, 11, ...c, P.body, 0, a);
    for (const z of [-2.75, 2.75]) k.box(16.2, 0.3, 0.3, c[0], c[1] + 0.2, z, P.dark, 0, a);
    k.box(16.2, 0.3, 11.2, c[0], c[1], 0, P.dark, 0, a);
    const ex = c[0] + Math.cos(a) * 8, ey = c[1] + Math.sin(a) * 8;
    for (const z of [-2.6, 2.6]) for (const y of [-2, 2]) k.box(0.5, 3.2, 4.6, ex + 0.1 - Math.sin(a) * y * 0, ey + y * Math.cos(a) - 0.2, z, '#d6d3d1', 0, a);
    k.tube([-6, 7.4, 0], [-1, 10, 0], 0.6, '#4b5058', 6);                          // 起豎油壓桿
  } else for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * 4;
    if (P.east) {                                                                  // S-300 類：大型圓筒
      k.tube([-8, 8.2, z], [14, 23, z], 2.0, P.body, 10); k.tube([13.6, 22.7, z], [14.3, 23.2, z], 2.2, P.dark, 10);
    } else missile(k, [-6, 8.5, z], [14, 22, z], 1.1, '#e5e7eb', '#dc2626', true);
  }
  if (P.east) for (const s of [-1, 1]) k.fin([[0, 0], [5, 0], [0, 5]], s * 2.4, 0.4, P.dark);
  roundel(k, P.nat, -9, 7, 4.15, 1.3, 'z');
}
function rocketLauncher(k, P) {
  const tracked = ['JP', 'US', 'GB', 'FR', 'DE'].includes(P.nat);
  let top;
  if (tracked) {
    top = hullTracked(k, P, 32, 17, 4.5, 4.4, { noBox: true, noHatch: true });
    k.loft([[7, sec(15.6, top, 5, 1)], [12.5, sec(15.6, top, 5, 1)], [15.5, sec(15.6, top, 2.4, 0.6)]], P.body);   // 裝甲駕駛艙
    k.box(0.2, 1.6, 12, 13.95, top + 3.2, 0, GLASS, 0, 0.7);
  } else { truckBody(k, P, 32, 14, 3); top = 5.2; }
  const ang = P.nat === 'US' ? 0.12 : 0.45, cx = -4;
  k.tube([cx, top, 0], [cx, top + 1.6, 0], 4, P.dark, 10);                        // 旋轉座
  k.box(18, 7, 12, cx, top + 6, 0, P.dark, 0, ang);
  k.box(18.2, 0.4, 12.2, cx, top + 6, 0, P.body, 0, ang);                         // 雙發射箱分隔
  const ex = cx + Math.cos(ang) * 9.05, ey = top + 6 + Math.sin(ang) * 9.05;
  k.box(0.3, 7.2, 12.2, ex, ey, 0, P.body, 0, ang);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const yy = (r - 1) * 2.2, zz = -4.2 + c * 2.8;
    k.tube([ex - Math.sin(ang) * yy, ey + Math.cos(ang) * yy, zz], [ex - Math.sin(ang) * yy + Math.cos(ang) * 0.25, ey + Math.cos(ang) * yy + Math.sin(ang) * 0.25, zz], 0.9, BLK, 6);
  }
  if (tracked) roundel(k, P.nat, 10, top + 2, 7.95, 1.3, 'z');
}
function artillery(k, P, future = false) {
  const top = hullTracked(k, P, 34, 17, 5, 4.4, { noBox: true });
  const big = P.nat === 'FR' || P.nat === 'JP' ? 7 : 6, tc = future ? '#1f2937' : P.body;
  turretLoft(k, tc, -13, 3, top, 13.4, big, 1.1, 1.6, 10);
  k.box(2, big * 0.7, 2.6, 3, top + big - 2, 0, P.dark);                          // 砲耳防盾
  gun(k, 3.4, top + big - 1.6, 0, P.nat === 'KP' ? 22 : 18, 0.95, P.dark, 0.32, 0, { fume: 0.5, brake: true });
  k.box(4, 2, 12, -13.6, top + 1.5, 0, P.dark);
  for (const s of [-1, 1]) {
    k.box(4.6, big * 0.55, 0.25, -6, top + big * 0.5, s * 6.75, shade(tc, -0.3));    // 側邊彈藥門
    k.box(1.0, 3.6, 3.2, -16.6, 2.6, s * 4.4, GUN, 0, -0.5);                          // 後方駐鋤
  }
  cupola(k, P, -7, top + big, -3.6, 1.3);
  hatch(k, P, -7, top + big, 3.4, 1.0);
  for (const z of [-1, 1]) antenna(k, -11.6, top + big - 0.2, z * 5.2, 7);
  smokeGL(k, 1.4, top + big - 2.4, 6.6, 3);
  if (future) k.box(6, 0.6, 6, -5, top + big + 0.4, 0, '#22d3ee');
  roundel(k, P.nat, -5, top + 3, 6.8, 1.5, 'z');
}
function tbm(k, P) {
  const b = truckBody(k, P, 40, 14, 4);
  const big = P.nat === 'KP' || P.nat === 'VN' || P.nat === 'PK' || P.nat === 'IN';
  for (const x of [-18, b.back - 1]) for (const s of [-1, 1]) { k.tube([x, 5, s * 6.6], [x, 0.4, s * 6.6], 0.4, GUN, 5); k.box(1.4, 0.4, 1.4, x, 0.2, s * 6.6, GUN); }   // 千斤頂
  if (P.nat === 'US' || P.nat === 'GB') {
    k.box(14, 5, 10, -5, 9, 0, P.dark, 0, 0.7); k.box(14.2, 0.3, 10.2, -5, 9, 0, P.body, 0, 0.7);
    k.box(0.3, 4.6, 9.4, -5 + Math.cos(0.7) * 7.05, 9 + Math.sin(0.7) * 7.05, 0, BLK, 0, 0.7);
    return;
  }
  // 起豎架＋飛彈（彈體、彈頭、尾翼）
  const a = [-17, 7.6, 0], e = [big ? 10 : 6, big ? 26 : 20, 0], ang = Math.atan2(e[1] - a[1], e[0] - a[0]);
  k.box(22, 0.8, 4.6, (a[0] + e[0]) / 2 - 1.4, (a[1] + e[1]) / 2 - 2.4, 0, P.dark, 0, ang);
  for (const t of [0.25, 0.55]) k.box(0.8, 1.6, 5.2, a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t - 1.4, 0, P.dark, 0, ang);
  missile(k, a, e, big ? 2.2 : 1.8, P.nat === 'CN' ? '#f1f5f9' : '#d6d3d1', '#94a3b8', true);
  k.tube([b.back - 2, 6, 0], [-6, 13, 0], 0.7, '#4b5058', 6);                       // 起豎油壓桿
  k.box(6, 3, 6, -14, 8, 0, P.dark);
}
function coastal(k, P) {
  const b = truckBody(k, P, 34, 14, 3);
  const n = P.nat === 'JP' || P.nat === 'DE' ? 1 : P.nat === 'RU' || P.nat === 'VN' ? 2 : 3;
  const ang = P.nat === 'RU' || P.nat === 'IN' ? 1.3 : P.nat === 'PK' ? 0.15 : 0.45;
  k.box(b.bedL, 1.2, 12, b.bedX, 5.8, 0, P.dark);
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (n === 1 ? 0 : 4);
    if (n === 1) {
      k.box(18, 6, 11, -4, 10, 0, P.dark, 0, ang); k.box(18.2, 0.3, 11.2, -4, 10, 0, P.body, 0, ang);
      k.box(0.3, 5, 10, -4 + Math.cos(ang) * 9.05, 10 + Math.sin(ang) * 9.05, 0, '#d6d3d1', 0, ang);
    } else {
      const e = [-14 + Math.cos(ang) * 22, 7.5 + Math.sin(ang) * 22, z];
      k.tube([-14, 7.5, z], e, 1.7, P.dark, 10); k.tube(e, [e[0] + Math.cos(ang) * 0.3, e[1] + Math.sin(ang) * 0.3, z], 1.9, '#d6d3d1', 10);
      k.tube([-14 + Math.cos(ang) * 8, 7.5 + Math.sin(ang) * 8, z], [-14 + Math.cos(ang) * 9, 7.5 + Math.sin(ang) * 9, z], 1.95, P.body, 10);   // 束環
    }
  }
  k.tube([-12, 6.2, 0], [-12, 9, 0], 0.6, '#4b5058', 6);
}
function tankDestroyer(k, P) {
  if (['JP', 'US', 'PH', 'FR', 'KP'].includes(P.nat)) {
    const top = hullWheeled(k, P, 26, 14, 5, 2);
    k.tube([-3, top, 0], [-3, top + 1, 0], 2.6, P.dark, 8);
    k.box(6, 3.2, 6, -3, top + 2.6, 0, P.dark);
    k.box(1.6, 1.6, 1.6, -0.6, top + 4.8, -2, P.dark); k.box(0.2, 1, 1.2, 0.25, top + 4.8, -2, GLASS);   // 瞄準具
    for (const s of [-1, 1]) { k.box(12, 1.6, 1.6, 1.2, top + 4.6, s * 2.6, '#4d5a2b', 0, 0.12); k.box(0.2, 1.3, 1.3, 7.2, top + 5.3, s * 2.6, BLK, 0, 0.12); }   // 飛彈發射筒
  } else if (P.nat === 'CN' || P.nat === 'DE') {
    const top = hullTracked(k, P, 30, 16, 5, 4.4, { noBox: true });
    turretLoft(k, P.body, -10, 9, top, 12, 3.4, 0.9, 5, 4);
    if (P.nat === 'CN') gun(k, 6, top + 2, 0, 18, 0.8, P.dark, 0, 0, { fume: 0.45, brake: true });
    else gun(k, 6, top + 2, 0, 10, 0.55, P.dark, 0, 0, { flash: true });
    cupola(k, P, -4, top + 3.4, -3, 1.2);
    smokeGL(k, 2, top + 2.2, 5.5, 3);
    antenna(k, -8.6, top + 3.2, 4, 7);
  } else {
    const top = hullTracked(k, P, 30, 16, 5, 4.4, { noBox: true });
    k.tube([-2, top, 0], [-2, top + 1.2, 0], 2.8, P.dark, 8);
    k.box(4, 2.4, 3.2, -2, top + 2.2, 0, P.dark);
    k.box(10, 3.4, 7, -2, top + 4.6, 0, P.body, 0, 0.12);                                              // 飛彈發射箱
    for (const s of [-1, 1]) for (const dy of [-0.8, 0.8]) { const y = top + 4.6 + dy + 5 * Math.sin(0.12); k.tube([2.9, y, s * 1.7], [3.1, y + 0.03, s * 1.7], 0.6, BLK, 6); }   // 發射管口
    k.box(1.8, 1.6, 1.8, -4, top + 7.1, 2.2, P.dark); k.box(0.2, 1, 1.2, -3.05, top + 7.1, 2.2, GLASS);
    hatch(k, P, -9, top, 3, 1.1);
  }
  roundel(k, P.nat, -6, 7, 6.95, 1.4, 'z');
}
function ifv(k, P, apc = false) {
  const nat = P.nat, wheeled = (apc ? WHEELED_APC : ['AU', 'FR']).includes(nat);
  const top = wheeled ? hullWheeled(k, P, 30, 15, 7, nat === 'FR' ? 2 : nat === 'DE' ? 3 : 4, 3.6, { vane: SOVIET.includes(nat) })
    : hullTracked(k, P, 30, 16, 7, 4, { skirt: !apc && (nat === 'US' || nat === 'DE' || nat === 'KR') ? P.body : null, noBox: true, glacis: 7 });
  if (apc) {
    // 遙控武器站＋艙蓋＋射擊孔
    k.box(3.2, 1.6, 3, -1, top + 0.8, -2, P.dark);
    mg(k, -0.2, top + 2.0, -2, 5);
    k.box(1.2, 1.2, 1.2, -1.8, top + 2.2, -3.4, '#1f2937'); k.box(0.2, 0.6, 0.6, -1.15, top + 2.2, -3.4, GLASS);
    for (const x of [-6, -10]) hatch(k, P, x, top, 2.6, 1.1);
    for (const s of [-1, 1]) for (const x of [-8, -3, 2]) k.box(0.8, 0.8, 0.2, x, top - 2.2, s * (k.H.Wu / 2 + 0.02), BLK);
  } else {
    turretLoft(k, P.body, -5, 4, top, 8.6, 3.8, 1.1, 1.6, 6);
    k.box(1.4, 2.0, 2.6, 4, top + 1.9, 0, P.dark);
    gun(k, 4.4, top + 2, 0, 10, 0.42, '#26282b', 0, 0, { sleeve: false, flash: true });
    barrel(k, 4.4, top + 1.3, 1.4, 2, 0.14, GUN, 0, 0, 5);
    if (nat === 'US' || nat === 'CN') { k.box(5, 3, 2.6, -1, top + 3.4, 5, P.dark); k.box(0.2, 2.2, 2, 1.55, top + 3.4, 5, BLK); }   // 反戰車飛彈箱
    k.box(1.8, 1.6, 1.8, -1.5, top + 4.5, -2.6, P.dark); k.box(0.2, 1, 1.3, -0.55, top + 4.5, -2.6, GLASS);                       // 車長瞄準具
    hatch(k, P, -2.6, top + 3.8, 2.2, 0.9);
    smokeGL(k, 2.4, top + 2.4, 4.2, 3);
    antenna(k, -4, top + 3.6, -3.4, 7);
    hatch(k, P, -9, top, -3, 1.0); hatch(k, P, -9, top, 3, 1.0);
  }
  k.box(1, 5, 9, -15.2, 7, 0, P.dark);                  // 後門
  k.box(0.2, 0.5, 9.2, -15.75, 9.4, 0, GUN);
  roundel(k, P.nat, -3, top - 3, k.H.Wu / 2 + 0.05, 1.5, 'z');
}
function recon(k, P) {
  const tracked = ['GB', 'DE'].includes(P.nat) ? false : ['US', 'KR', 'PK', 'AU', 'IL'].includes(P.nat);
  const top = tracked ? hullTracked(k, P, 26, 14, 5, 4.4, { noBox: true }) : hullWheeled(k, P, 24, 13, 5, P.nat === 'DE' || P.nat === 'FR' ? 4 : 2);
  turretLoft(k, P.body, -4.5, 2.5, top, 7, 3, 0.9, 1.2, 5);
  const long = P.nat === 'FR' || P.nat === 'TW';
  k.box(1.2, 1.6, 2, 2.4, top + 1.6, 0, P.dark);
  gun(k, 2.8, top + 1.6, 0, long ? 11 : 7, 0.42, '#26282b', 0, 0, long ? { brake: true } : { sleeve: false, flash: true });
  if (P.nat === 'US' || P.nat === 'KR') { k.tube([-4, top + 3, 0], [-4, top + 7, 0], 0.4, '#3f4247'); k.box(2, 2, 3, -4, top + 7.5, 0, P.dark); k.box(0.2, 1.2, 2.2, -2.95, top + 7.5, 0, GLASS); }
  hatch(k, P, -2, top + 3, -1.8, 0.9);
  smokeGL(k, 1, top + 1.8, 3.5, 2);
  antenna(k, -3.8, top + 2.8, 2.6, 7);
  roundel(k, P.nat, -4, top - 2.6, k.H.Wu / 2 + 0.05, 1.3, 'z');
}
function truck(k, P) {
  const b = truckBody(k, P, 32, 14, 3);
  const x0 = b.bedX - b.bedL / 2, x1 = b.bedX + b.bedL / 2;
  k.box(b.bedL, 0.6, 13, b.bedX, b.top + 0.3, 0, '#3a3c40');                    // 貨台
  for (const s of [-1, 1]) k.box(b.bedL, 2.0, 0.4, b.bedX, b.top + 1.4, s * 6.3, P.dark);
  k.box(0.4, 2.0, 13, x0, b.top + 1.4, 0, P.dark);
  canopy(k, x0 + 0.2, x1 - 0.2, b.top + 2.2, 6.4, 5.4, P.body, shade(P.body, -0.3));
  k.box(0.2, 3.4, 9, x0 + 0.05, b.top + 4.6, 0, shade(P.body, -0.5));             // 篷尾開口
}
function train(k, P) {
  for (const s of [-1, 1]) k.box(54, 0.6, 0.8, 0, 0.3, s * 4, '#6b7280');
  wheels(k, [-22, -16, 2, 8, 15, 21], 10, 2.4, '#1f2125');
  k.box(26, 8, 11, 12, 8.4, 0, P.body);                                // 機車頭
  k.box(8, 4, 11.4, 21, 14, 0, P.dark);
  for (const s of [-1, 1]) k.box(3, 2, 0.2, 21, 14.5, s * 5.75, GLASS);
  k.box(0.2, 2, 8, 25.05, 14.5, 0, GLASS);
  lamps(k, 25.05, 9, 3.6);
  for (let i = 0; i < 4; i++) k.box(2, 0.3, 8, 4 + i * 3, 12.55, 0, BLK);
  k.box(18, 3, 11, -16, 6, 0, '#4b5563');                               // 平車
  k.box(10, 5, 9, -16, 10, 0, P.dark);
  gun(k, -14, 11, 0, 9, 0.6, '#26282b', 0, 0, { brake: true });
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
  tracks(k, 26, 15, 4, { wc: '#111827' });
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
function canopyGlass(k, x, y, len, w, h) {
  k.ball(x, y, 0, len / 2, h, w, GLASS);
  k.box(0.3, h * 0.5, w * 1.9, x - len * 0.1, y + h * 0.55, 0, '#1f2937');      // 座艙罩框
}
function jet(k, P, o) {
  const L = o.L || 32, r = o.r || 2.2, b = P.body, d = P.dark, N = L / 2, T = -L / 2;
  const rw = o.twin && !o.stealth ? 1.45 : 1.1, n = o.stealth ? 6 : 8;
  // 機身：雷達罩（暗色）→ 座艙段 → 中段 → 尾段收窄
  body(k, [[N, 0.05, 0.05, -0.1], [N - 3, r * 0.48, r * 0.44, 0], [N - 4.5, r * 0.62, r * 0.56, 0.05]], shade(b, -0.3), n);
  body(k, [[N - 4.5, r * 0.62, r * 0.56, 0.05], [N - 8, r * 0.84, r * 0.8, 0.15], [N - 13, r * (o.stealth ? 1.3 : 1.0), r * 0.88, 0.1],
    [T + 8, r * rw * (o.stealth ? 1.2 : 1), r * 0.78, 0], [T + 1.5, r * rw * 0.88, r * 0.62, 0], [T, r * rw * 0.8, r * 0.55, 0]], b, n);
  canopyGlass(k, N - 8.5, r * 0.66, 6.6, 1.2, 1.35);
  // 進氣道
  const intake = o.intake || 'side';
  if (intake === 'chin') { k.box(7, 1.4, 2.6, N - 15, -r * 0.92, 0, b); k.box(0.3, 1.1, 2.2, N - 11.4, -r * 0.92, 0, BLK); }
  else if (intake === 'under') for (const s of [-1, 1]) { k.box(9, 1.8, 2.0, N - 17, -r * 0.8, s * 1.5, b); k.box(0.3, 1.5, 1.7, N - 12.4, -r * 0.8, s * 1.5, BLK); }
  else for (const s of [-1, 1]) {
    const z = s * (r * 0.95 + 0.4);
    k.box(10, r * 1.05, 1.5, N - 16.5, -0.15, z, b, o.stealth ? s * 0.06 : 0); k.box(0.3, r * 0.85, 1.2, N - 11.4, -0.15, z, BLK);
  }
  // 噴嘴
  const nz = o.twin && !o.stealth ? [-r * 0.6, r * 0.6] : o.stealth ? [-r * 0.55, r * 0.55] : [0];
  for (const z of nz) { k.tube([T + 0.6, 0, z], [T - 1.4, 0, z], r * (nz.length > 1 ? 0.48 : 0.62), '#4b5058', 8, r * (nz.length > 1 ? 0.42 : 0.55)); k.tube([T - 1.3, 0, z], [T - 1.45, 0, z], r * (nz.length > 1 ? 0.34 : 0.44), BLK, 6); }
  // 主翼與尾翼
  let mid;
  if (o.stealth) {
    k.wing([[N - 4, 0], [-L / 2 + 4, 13], [-L / 2, 7], [-L / 2, 0]], -0.8, 1.6, b);
    mid = () => 0;
  } else if (o.delta) {
    const sp = o.span || 13;
    k.wing([[6, 1.5], [-L / 2 + 3, sp], [-L / 2 + 1, 1.5]], -0.5, 0.7, b);
    mid = z => { const f = (z - 1.5) / (sp - 1.5); return (6 + (T + 3 - 6) * f + T + 1 + 2 * f) / 2; };
  } else {
    const sp = o.span || 12, sw = o.sweep ?? 7;
    k.wing([[4, 1.5], [4 - sw - 5, sp], [-1 - sw - 6, sp], [-7, 1.5]], -0.5, 0.7, b);
    k.wing([[-L / 2 + 6, 1], [-L / 2 + 2, 6], [-L / 2 - 1, 6], [-L / 2, 1]], -0.2, 0.5, b);   // 水平尾翼
    if (o.twin) k.wing([[N - 8, 0.8], [2, r + 1.6], [0, r + 0.6]], -0.3, 0.5, b);          // 前緣延伸面
    mid = z => { const f = (z - 1.5) / (sp - 1.5); return (4 + (-sw - 5) * f - 7 - sw * f) / 2; };
  }
  if (o.canard) k.wing([[L / 2 - 10, 1.4], [L / 2 - 13, 5], [L / 2 - 15, 5], [L / 2 - 14, 1.4]], 0.8, 0.4, b);
  const tail = [[-L / 2, 0], [-L / 2 + 7, 0], [-L / 2 + 2, 7.5], [-L / 2 - 1.5, 7.5]];
  if (o.twin) for (const s of [-1, 1]) k.fin(tail, s * (o.finZ || 2.6), 0.5, d, s * (o.stealth ? 0.4 : 0.15));
  else k.fin(tail, 0, 0.6, d);
  if (o.engines) for (const z of o.engines) k.tube([-3, -2, z], [5, -2, z], 1.3, d, 8);
  // 外掛：翼下掛架＋空對空飛彈／炸彈、機腹副油箱
  const sp = o.span || (o.delta ? 13 : 12);
  for (const st of o.stores || []) {
    const [f, kind] = st, z = 1.5 + (sp - 1.5) * f, x = mid(z);
    if (kind === 'tip') { for (const s of [-1, 1]) { k.box(3.2, 0.3, 0.3, x, -0.15, s * (sp + 0.1), d); aam(k, x + 0.6, -0.15, s * (sp + 0.35), 4.6, 0.3); } continue; }
    for (const s of [-1, 1]) {
      k.box(2.4, 0.7, 0.25, x, -0.85, s * z, d);
      if (kind === 'aam') aam(k, x + 0.4, -1.55, s * z, 5, 0.3);
      else if (kind === 'agm') aam(k, x + 0.4, -1.65, s * z, 4.4, 0.42, '#d6d3d1', '#1f2937');
      else if (kind === 'tank') pod(k, x - 3, x + 3.4, -1.9, s * z, 0.85, shade(b, -0.1), 6);
      else bomb(k, x + 0.3, -1.7, s * z, 4, 0.6);
    }
  }
  if (o.belly) pod(k, -4, 3.5, -r - 1.0, 0, 0.95, shade(b, -0.1), 6);
  const rz = o.stealth ? 8 : Math.min(8.5, sp * 0.62), rx = o.stealth ? -9 : mid(rz) - 0.5;
  for (const s of [-1, 1]) roundel(k, P.nat, rx, o.stealth ? 0.75 : 0.18, s * rz, 1.4);
}
const has = (tbl, base, nat) => (tbl[base] || []).includes(nat);
function fighter(base) {
  return (k, P) => {
    const nat = P.nat;
    if (base === 'stealth') return jet(k, P, { L: 34, stealth: true, twin: true, canard: nat === 'CN' });
    if (base === 'attacker' && nat === 'US') {   // A-10：直翼、機身後上方兩具發動機、雙垂直尾翼在水平尾翼兩端、機鼻機砲
      jet(k, P, { L: 30, span: 15, sweep: 0, twin: true, finZ: 5.2, stores: [[0.3, 'bomb'], [0.55, 'agm'], [0.85, 'aam']] });
      for (const s of [-1, 1]) { pod(k, -10, -2.5, 3.4, s * 3.4, 1.8, P.dark, 8, 0.1); k.tube([-2.6, 3.4, s * 3.4], [-2.4, 3.4, s * 3.4], 1.4, BLK, 8); k.box(3, 1.2, 0.5, -6, 2.4, s * 2.6, P.dark); }
      barrel(k, 15, -0.6, 0, 2.2, 0.3, GUN, 0, 0, 6);
      return;
    }
    const twin = has(TWIN_TAIL, base, nat), delta = has(DELTA, base, nat);
    const intake = P.east && base === 'fighter' && twin ? 'under' : !twin && (base === 'multirole' || base === 'attacker') && !delta ? 'chin' : 'side';
    const stores = base === 'fighter' ? [[0.42, 'aam'], [0.75, 'aam'], [1, 'tip']] : base === 'multirole' ? [[0.35, 'tank'], [0.66, 'agm'], [1, 'tip']] : [[0.3, 'bomb'], [0.58, 'bomb'], [0.86, 'aam']];
    jet(k, P, {
      L: base === 'attacker' ? 30 : 32, twin, delta, canard: has(CANARD, base, nat), intake,
      sweep: base === 'attacker' ? 4 : 7 + h32(nat + base) * 4, span: base === 'attacker' ? 13 : 12, stores, belly: base === 'fighter' && !twin,
    });
  };
}
function bomber(k, P) {
  const nat = P.nat;
  body(k, [[24, 0.4, 0.4, -0.4], [20, 2.2, 2.0, 0], [14, 3, 2.8, 0], [-14, 3, 2.8, 0.2], [-22, 1.0, 1.2, 1.2]], P.body, 8);
  k.box(1.6, 0.8, 3.4, 17, 2.2, 0, '#1f2937', 0, -0.3);                         // 駕駛艙窗
  const sw = nat === 'RU' ? 14 : 9, sp = nat === 'RU' ? 16 : 24;
  k.wing([[6, 2.4], [6 - sw - 4, sp], [-sw - 8, sp], [-6, 2.4]], 0, 0.9, P.body);
  k.wing([[-17, 1.5], [-21, 8], [-24, 8], [-22, 1.5]], 0.4, 0.6, P.body);
  k.fin([[-22, 0], [-14, 0], [-18, 10], [-22, 10]], 0, 0.7, P.dark);
  const pods = nat === 'US' ? [8, 15] : nat === 'CN' ? [5] : [];
  for (const z of pods) for (const s of [-1, 1]) {
    const x0 = -6 - z * 0.3, zz = s * z;
    k.box(3, 1.4, 0.4, x0 + 4, -0.6, zz, P.dark);
    pod(k, x0, x0 + 8, -2, zz, 1.4, P.dark, 8, 0.05);
    k.tube([x0 + 8, -2, zz], [x0 + 8.15, -2, zz], 1.05, BLK, 8);
    k.tube([x0 + 0.15, -2, zz], [x0 - 0.6, -2, zz], 0.6, '#4b5058', 6);
  }
  if (nat === 'RU') for (const s of [-1, 1]) { k.box(10, 3.6, 2.4, -2, 0.4, s * 3.6, P.dark); k.box(0.3, 3, 2, 3.1, 0.4, s * 3.6, BLK); k.tube([-7, 0.4, s * 3.6], [-8, 0.4, s * 3.6], 1.0, '#4b5058', 8); }
  roundel(k, nat, -6, 1, 14, 2); roundel(k, nat, -6, 1, -14, 2);
}
function transport(k, P, mpa = false) {
  const L = mpa ? 40 : 42, r = mpa ? 2.7 : 3.6, N = L / 2, T = -L / 2;
  // 機身：圓鈍機鼻、圓筒、上翹的尾段（後艙門）
  body(k, [[N, 0.5, 0.5, -0.8], [N - 2, r * 0.75, r * 0.72, -0.4], [N - 5, r, r, 0], [-6, r, r, 0.3],
    [T + 7, r * 0.82, r * 0.7, mpa ? 0.6 : 1.4], [T, r * 0.3, r * 0.4, mpa ? 1.0 : 2.8]], P.body, 8);
  k.box(1.6, 1.0, r * 1.4, N - 2.6, r * 0.55, 0, '#1f2937', 0, -0.5);         // 駕駛艙窗
  const high = !mpa && !['VN'].includes(P.nat), wy = high ? r - 0.2 : -r + 1;
  k.wing([[4, 2], [0, 23], [-4, 23], [-4, 2]], wy, 0.8, P.body);
  if (!mpa) for (const s of [-1, 1]) k.box(12, 2.2, 1.6, 0, -r + 1, s * (r - 0.4), shade(P.body, -0.12));   // 起落架整流罩
  const jets = P.nat === 'RU' || P.nat === 'KP' || P.nat === 'JP' || (mpa && P.nat === 'US');
  const engs = (P.nat === 'VN' || P.nat === 'IN' || P.nat === 'FR' || P.nat === 'DE' || P.nat === 'JP' || P.nat === 'PH' || (mpa && P.nat === 'US')) ? [7] : [7, 14];
  for (const z of engs) for (const s of [-1, 1]) {
    const zz = s * z;
    if (jets) { k.box(3, 1.2, 0.4, 1.5, wy - 0.6, zz, P.dark); pod(k, -1.5, 5, wy - 1.8, zz, 1.4, P.dark, 8, 0.05); k.tube([5, wy - 1.8, zz], [5.1, wy - 1.8, zz], 1.05, BLK, 8); }
    else {
      pod(k, -3, 3.4, wy - 0.9, zz, 1.2, P.dark, 6, 0.2);
      k.tube([3.4, wy - 0.9, zz], [4.6, wy - 0.9, zz], 0.6, '#9ca3af', 6, 0.1);                         // 螺旋槳整流錐
      k.box(0.25, 7, 0.7, 3.6, wy - 0.9, zz, '#26282b', 0, 0, 0.5); k.box(0.25, 7, 0.7, 3.6, wy - 0.9, zz, '#26282b', 0, 0, -1.07);
    }
  }
  const tail = mpa ? [[-L / 2, 0], [-L / 2 + 8, 0], [-L / 2 + 3, 9], [-L / 2 - 1, 9]] : [[-L / 2, 1.5], [-L / 2 + 9, 1.5], [-L / 2 + 3, 11], [-L / 2 - 1, 11]];
  k.fin(tail, 0, 0.7, P.dark);
  const ty = (P.nat === 'JP' || P.nat === 'RU' || P.nat === 'KP') && !mpa ? 10.5 : mpa ? 1 : 2.4;
  k.wing([[-L / 2 + 6, 1], [-L / 2 + 2, 9], [-L / 2 - 1, 9], [-L / 2, 1]], ty, 0.6, P.body);
  if (mpa) {
    k.tube([-L / 2 - 6, 1.0, 0], [-L / 2, 1.0, 0], 0.6, P.dark, 6);              // 磁異探測尾桿
    k.ballLo(N - 7, -r + 0.2, 0, 3, 1.2, 1.6, '#4b5563');                         // 機腹雷達罩
    for (const s of [-1, 1]) aam(k, 0, wy - 1.5, s * 10.5, 5, 0.42, '#d6d3d1', '#1f2937');
  }
  for (const s of [-1, 1]) roundel(k, P.nat, -1, wy + 0.85, s * 17, 1.8);
  roundel(k, P.nat, -L / 2 + 8, 1.4, r * 0.85 + 0.1, 1.6, 'z');
}
function uav(k, P) {
  body(k, [[12, 0.3, 0.3, 0.4], [10, 1.6, 1.8, 0.6], [6, 1.7, 1.7, 0.2], [-10, 1.1, 1.1, 0.2], [-12, 0.5, 0.5, 0.2]], P.body, 8);
  k.wing([[2, 1], [0, 18], [-2, 18], [-2, 1]], 0.4, 0.5, P.body);
  const twinBoom = ['TW', 'KR', 'IN', 'AU', 'IL'].includes(P.nat);
  if (twinBoom) { for (const s of [-1, 1]) k.tube([-14, 0.4, s * 5], [0, 0.4, s * 5], 0.5, P.dark, 6); k.wing([[-13, 0], [-13, 5.5], [-15, 5.5], [-15, 0]], 0.4, 0.4, P.dark); for (const s of [-1, 1]) k.fin([[-15, 0], [-12, 0], [-14, 4], [-15, 4]], s * 5, 0.4, P.dark); }
  else { for (const s of [-1, 1]) k.fin([[-12, 0], [-8, 0], [-11, 5], [-12.5, 5]], s * 1.2, 0.4, P.dark, s * (P.nat === 'US' ? -0.8 : 0.6)); }
  k.ballLo(5, -1.4, 0, 1.2, 1.2, 1.2, '#1f2937'); k.ballLo(5.6, -1.6, 0, 0.6, 0.6, 0.6, '#38bdf8');   // 光電球
  k.tube([-12.2, 0.2, 0], [-13, 0.2, 0], 0.4, '#4b5058', 6);
  k.box(0.3, 5.4, 0.7, -13, 0.2, 0, '#26282b'); k.box(0.3, 0.7, 5.4, -13, 0.2, 0, '#26282b');             // 推進式螺旋槳
  k.tube([3, 1.6, 0], [2.4, 3.2, 0], 0.15, '#1f2125', 4);                                                   // 衛星天線
  for (const s of [-1, 1]) { k.box(1.6, 0.6, 0.2, -0.6, -0.3, s * 8, P.dark); aam(k, -0.4, -0.9, s * 8, 3.6, 0.3, '#d6d3d1', '#1f2937'); }
}
function heliBody(k, P, kind) {
  const b = P.body, d = P.dark;
  let mastY, roundelZ;
  if (kind === 'attack') {
    const mi = ['KP', 'VN', 'RU', 'IN'].includes(P.nat);
    body(k, [[12, 0.3, 0.3, -0.4], [10, 1.4, 1.6, -0.2], [7, 1.9, 2.4, 0.2], [0, 2.5, 2.6, 0.4], [-5, 2.0, 2.0, 0.6], [-7, 0.9, 0.9, 0.7]], b, 8);
    k.ball(7, 2.0, 0, 2.6, 1.6, 1.6, GLASS); k.ball(2.4, 2.8, 0, 2.6, 1.6, 1.7, GLASS);                  // 前後座艙（階梯式）
    k.box(0.3, 1.4, 3.3, 4.6, 2.9, 0, '#1f2937');
    for (const s of [-1, 1]) { pod(k, -4, 2.4, 2.6, s * 2.6, 1.2, d, 6, 0.1); k.tube([-4.1, 2.6, s * 2.6], [-5.2, 2.8, s * 3.4], 0.6, BLK, 5); }   // 發動機艙＋排氣口
    k.ballLo(9.4, -1.8, 0, 0.8, 0.8, 0.8, GUN); barrel(k, 9.4, -2, 0, 3.4, 0.18, GUN, -0.1, 0, 5);          // 機鼻機砲
    const span = mi ? 8 : 7;
    k.wing([[2, 2.4], [1, span], [-2, span], [-2, 2.4]], -0.4, 0.6, d);                                     // 短翼
    for (const s of [-1, 1]) {
      pod(k, -2, 3, -1.6, s * (span - 2.6), 1.0, '#3f4247', 6, 0.1); k.tube([3, -1.6, s * (span - 2.6)], [3.1, -1.6, s * (span - 2.6)], 0.8, BLK, 6);   // 火箭莢
      for (const dz of [-0.45, 0.45]) aam(k, 0.6, -1.0, s * (span - 0.6) + dz, 3.6, 0.28, '#4d5a2b', '#1f2937');   // 反戰車飛彈
      k.box(0.6, 1.2, 0.3, 0.3, -0.2, s * (span - 2.6), d); k.box(0.6, 0.8, 0.3, 0.3, -0.4, s * (span - 0.6), d);
    }
    if (mi) k.box(6, 3, 6, 0, -2, 0, b);    // Mi-24 運兵艙
    for (const s of [-1, 1]) { k.tube([5, -2, s * 1.6], [5, -3.6, s * 2.4], 0.2, GUN, 4); k.tube([5, -3.6, s * 2.4], [5, -3.7, s * 2.4], 0.5, RUB, 6); }   // 起落輪
    mastY = 4.6; roundelZ = 2.5;
  } else if (kind === 'scout') {
    body(k, [[6.6, 0.4, 0.5, 0.4], [5.6, 2.5, 3.0, 0.2], [2.5, 3.4, 4.0, 0], [-1.5, 2.8, 3.4, 0.3], [-3.4, 1.0, 1.4, 0.8]], b, 8);
    k.ball(4.2, 0.8, 0, 2.7, 2.6, 2.7, GLASS);
    k.box(2.6, 1.2, 2.4, -1, 3.4, 0, d); k.tube([-2.3, 3.4, 0], [-3.2, 3.4, 0], 0.5, BLK, 5);              // 發動機＋排氣
    k.ballLo(0.2, 5.0, 0, 0.9, 0.9, 0.9, '#1f2937');                                                         // 桅頂瞄準具
    for (const s of [-1, 1]) {
      k.tube([-4, -4.4, s * 3.2], [6, -4.4, s * 3.2], 0.28, GUN, 5); k.tube([6, -4.4, s * 3.2], [7, -3.6, s * 3.2], 0.28, GUN, 5);   // 起落橇
      for (const x of [-1.5, 3]) k.tube([x, -2.4, s * 1.6], [x, -4.4, s * 3.2], 0.2, GUN, 4);
      k.box(1.4, 0.8, 0.3, 1, -1.4, s * 3.4, d); aam(k, 1.2, -2.2, s * 3.8, 3.4, 0.28, '#4d5a2b', '#1f2937');
    }
    mastY = 4.6; roundelZ = 3.3;
  } else {
    body(k, [[11.5, 0.6, 0.8, -0.6], [10, 2.6, 2.8, 0], [7, 3.4, 3.5, 0], [-6, 3.4, 3.5, 0], [-9, 2.0, 2.0, 0.6]], b, 8);
    k.box(1.8, 1.4, 4.6, 9.4, 1.6, 0, '#1f2937', 0, -0.6);                                                  // 擋風玻璃
    for (const s of [-1, 1]) {
      for (const x of [5.6, 1.6]) k.box(2.2, 1.6, 0.2, x, 0.8, s * 3.4, GLASS);                            // 艙窗
      k.box(5, 3, 0.2, -2.2, -0.6, s * 3.42, shade(b, -0.2));                                              // 滑門
      k.tube([3.6, 4.0, s * 1.4], [-2.4, 4.0, s * 1.4], 1.1, d, 6); k.tube([-2.4, 4.0, s * 1.4], [-3.2, 4.2, s * 1.9], 0.6, BLK, 5);   // 發動機＋排氣
      k.tube([6.6, -2.4, s * 1.8], [6.6, -4.6, s * 2.4], 0.22, GUN, 4); k.tube([6.6, -4.6, s * 2.6], [6.6, -4.6, s * 1.9], 0.7, RUB, 6);
      k.tube([-3.4, -2.4, s * 3.0], [-3.4, -4.6, s * 3.6], 0.22, GUN, 4); k.tube([-3.4, -4.6, s * 3.9], [-3.4, -4.6, s * 3.2], 0.8, RUB, 6);   // 起落輪
    }
    k.box(4, 2.2, 3.6, 0, 4.4, 0, d);
    mastY = 6.4; roundelZ = 3.45;
  }
  const tailX = kind === 'transport' ? -8.6 : kind === 'scout' ? -3 : -6.5;
  k.tube([tailX, 0.6, 0], [tailX - 13, 1.6, 0], kind === 'transport' ? 1.4 : 0.9, b, 8, 0.6);
  k.fin([[tailX - 15, 0], [tailX - 11, 0], [tailX - 13, 5], [tailX - 15, 5]], 0, 0.5, d);
  k.wing([[tailX - 9, 0.4], [tailX - 10, 3.2], [tailX - 11.6, 3.2], [tailX - 11.4, 0.4]], 1.2, 0.3, d);   // 水平安定面
  k.tube([tailX - 13, 3, 0.6], [tailX - 13, 3, 1.4], 2.6, '#26282b', 10);       // 尾旋翼
  k.tube([tailX - 13, 3, 1.3], [tailX - 13, 3, 1.6], 0.4, HUB, 6);
  k.tube([0, mastY - 2.4, 0], [0, mastY, 0], 0.7, '#26282b', 6);
  roundel(k, P.nat, -2, 0, roundelZ, 1.3, 'z');
  return mastY;
}
function chinook(k, P) {
  body(k, [[16, 0.8, 1, -0.4], [14.6, 2.8, 3.0, 0], [12, 3.5, 3.5, 0], [-13, 3.5, 3.5, 0], [-15, 2.2, 3.0, 0.4]], P.body, 8);
  k.box(1.6, 1.4, 4.6, 14.6, 1.6, 0, '#1f2937', 0, -0.6);
  k.box(6, 8, 4, -13, 5, 0, P.dark);                                              // 後旋翼塔
  k.box(5, 2.4, 3, 12, 4, 0, P.dark);                                             // 前旋翼塔
  for (const s of [-1, 1]) {
    k.box(18, 3, 1.4, -1, -2, s * 4.2, P.dark);                                    // 側邊油箱整流罩
    for (let i = 0; i < 5; i++) k.box(1.4, 1.4, 0.2, 9 - i * 4.4, 1.0, s * 3.45, GLASS);
    k.tube([-12, 5.6, s * 2], [-6, 5.6, s * 2], 1.1, P.dark, 6); k.tube([-12.1, 5.6, s * 2], [-12.8, 5.6, s * 2], 0.7, BLK, 5);
    for (const x of [10, -8]) { k.tube([x, -3.5, s * 3.6], [x, -4.6, s * 3.6], 0.2, GUN, 4); k.tube([x, -4.6, s * 3.9], [x, -4.6, s * 3.2], 0.8, RUB, 6); }
  }
  k.tube([12, 5.2, 0], [12, 6, 0], 0.7, '#26282b', 6); k.tube([-13, 9, 0], [-13, 10.4, 0], 0.7, '#26282b', 6);
  roundel(k, P.nat, 0, 0, 3.55, 1.4, 'z');
}

// ----- 艦艇（水線在 y = 0，船底略沒入水中）-----
// 船殼：放樣出外飄的舷側與收尖的艦艏，加上甲板、錨與水線
function hull(k, P, L, B, H, opt = {}) {
  const hc = opt.hullCol || shade(P.body, -0.15), bow = opt.blunt ? B * 0.3 : B * 1.5, hb = B / 2;
  const S = (hd, top, keel) => [[-hd, top], [hd, top], [hd * 0.9, 0], [hd * 0.5, keel], [-hd * 0.5, keel], [-hd * 0.9, 0]];
  const st = [[-L / 2, S(hb * 0.92, H, -1.4)], [-L / 2 + L * 0.25, S(hb, H, -2)], [L / 2 - bow, S(hb * 0.97, H, -2)]];
  if (opt.blunt) st.push([L / 2, S(hb * 0.72, H, -1)]);
  else st.push([L / 2 - bow * 0.45, S(hb * 0.6, H + 0.2, -1.6)], [L / 2, S(0.06, H + 0.5, -0.3)]);
  k.loft(st, hc);
  // 甲板（沿船殼平面外形，略縮）
  const half = st.map(([x, s]) => [x, s[1][0] * 0.96]);
  const pts = [...half.map(([x, z]) => [x * 0.995, -Math.max(z, 0.05)]), ...half.slice().reverse().map(([x, z]) => [x * 0.995, Math.max(z, 0.05)])];
  k.slab(pts, H - 0.1, 0.5, opt.deck || DECK);
  if (!opt.blunt) for (const s of [-1, 1]) k.box(1.0, 0.9, 0.25, L / 2 - bow * 0.62, H - 0.7, s * (hb * 0.82 + 0.05), BLK, s * 0.25);   // 錨
  return H + 0.4;
}
function ciws(k, x, y, z, east) {           // 近迫武器系統：西方白色圓頂（方陣）、東方炮塔（AK-630）
  if (east) { k.tube([x, y, z], [x, y + 0.6, z], 0.9, '#9ca3af', 7); k.domeLo(x, y + 0.6, z, 1.0, 0.9, 1.0, '#9ca3af'); barrel(k, x + 0.5, y + 1, z, 2.4, 0.25, GUN, 0.1, 0, 5); return; }
  k.tube([x, y, z], [x, y + 0.9, z], 0.85, '#d1d5db', 7); k.domeLo(x, y + 0.9, z, 0.8, 1.4, 0.8, '#f1f5f9');
  barrel(k, x + 0.5, y + 1.1, z, 2.4, 0.22, GUN, 0.08, 0, 5);
}
function vls(k, x, y, w, d, rows = 2, cols = 4) {   // 垂直發射格
  k.box(w, 0.25, d, x, y + 0.1, 0, '#334155');
  const cw = w / cols, cd = d / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) k.box(cw * 0.78, 0.12, cd * 0.78, x - w / 2 + cw * (i + 0.5), y + 0.28, -d / 2 + cd * (j + 0.5), '#4b5563');
}
function secZ(w, y0, h, ch, z) { return sec(w, y0, h, ch).map(([a, b]) => [a + z, b]); }
function boat(k, x, y, z, len = 4, c = '#f97316') {   // 救難小艇（艇身＋白色篷蓋＋吊架）
  k.loft([[x - len / 2, secZ(1.3, y, 0.8, 0.3, z)], [x + len * 0.25, secZ(1.4, y, 0.85, 0.3, z)], [x + len / 2, secZ(0.3, y + 0.3, 0.6, 0.1, z)]], c);
  k.box(len * 0.45, 0.35, 1.0, x - len * 0.1, y + 0.95, z, '#e5e7eb');
  for (const dx of [-len * 0.35, len * 0.3]) k.tube([x + dx, y - 0.9, z - Math.sign(z || 1) * 0.6], [x + dx, y + 1.6, z], 0.12, GUN, 4);
}
function rafts(k, x, y, z, n = 3) { for (let i = 0; i < n; i++) k.tube([x + i * 1.0, y, z - 0.3], [x + i * 1.0, y, z + 0.3], 0.38, '#f1f5f9', 6); }
function helideck(k, x0, x1, y, B) {        // 直升機甲板：深色甲板＋白色圓圈＋中線＋邊線
  const cx = (x0 + x1) / 2, w = x1 - x0;
  k.box(w, 0.1, B * 0.8, cx, y + 0.06, 0, '#6b7079');
  k.ring(cx, y + 0.13, 0, Math.min(w, B * 0.8) * 0.36, '#f1f5f9');
  k.box(w * 0.92, 0.04, 0.16, cx, y + 0.13, 0, '#f1f5f9');
  for (const s of [-1, 1]) k.box(w, 0.04, 0.12, cx, y + 0.13, s * B * 0.38, '#facc15');
}
const OCT = new THREE.CylinderGeometry(1, 1, 0.3, 8);
function warship(base) {
  return (k, P) => {
    const nat = P.nat, rnd = h32(nat + base), east = P.east;
    const S = { destroyer: [46, 7.5, 3], frigate: [40, 7, 2.8], corvette: [30, 6, 2.6], cruiser: [52, 8.5, 3.4], patrol: [24, 5, 2.2] }[base];
    const [L, B] = S, top = hull(k, P, L, B, S[2]);
    const small = base === 'patrol' || base === 'corvette';
    const stealth = !east || nat === 'CN' || rnd > 0.6, ch = stealth ? 0.9 : 0.15;
    const aftGun = east && nat !== 'CN' && (base === 'destroyer' || base === 'cruiser');
    const heli = (['destroyer', 'frigate', 'cruiser'].includes(base) || nat === 'CN') && !aftGun;
    const sh = (east ? 4.2 : 3.6) * (small ? 0.85 : 1), sw = B * 0.72, by = top + sh;
    const xf = L * 0.14 - rnd * L * 0.03, xa = small ? -L * 0.22 : -L * 0.08;
    const blk = (x0, x1, y, w, h, c, chf = ch) => k.loft([[x0, sec(w, y, h, chf)], [x1, sec(w, y, h, chf)]], c);
    // 前部上層結構＋艦橋層（前窗、側窗）
    blk(xa, xf, top, sw, sh, P.body);
    const bx0 = xf - L * 0.12, bh = east ? 3 : 2.6, bw = B * 0.6;
    k.loft([[bx0, sec(bw, by, bh, ch * 0.8)], [xf - 1.2, sec(bw, by, bh, ch * 0.8)], [xf, sec(bw * 0.78, by, bh * 0.7, 0.3)]], P.body);
    k.box(0.3, 0.55, bw * 0.62, xf - 0.62, by + bh * 0.84, 0, '#1f2937', 0, -0.25);
    for (const s of [-1, 1]) k.box(L * 0.06, 0.45, 0.12, xf - 2.6, by + bh * 0.5, s * (bw / 2 + 0.02), '#1f2937');
    // 桅杆：整合式錐桅（新式）或格子桅（舊式）＋旋轉雷達＋頂部圓罩
    const mx = bx0 + 0.8, mt = by + bh;
    if (rnd > 0.5 || ['FR', 'GB', 'DE', 'KR', 'IL', 'CN'].includes(nat)) {
      k.tube([mx, mt - 0.5, 0], [mx, top + 15, 0], B * 0.18, P.body, 6, 0.4);
      k.box(0.6, 1.4, B * 0.5, mx, top + 12.6, 0, '#1f2937');
      k.box(1.6, 0.3, B * 0.36, mx, top + 11.2, 0, P.body);
    } else {
      k.tube([mx, mt - 0.5, 0], [mx, top + 15, 0], 0.4, '#3f4247', 6); k.box(0.4, 0.4, B * 0.6, mx, top + 12.5, 0, '#3f4247'); k.box(0.4, 0.4, B * 0.4, mx, top + 10.6, 0, '#3f4247');
      k.box(0.6, 1.2, B * 0.42, mx + 0.6, top + 13.6, 0, '#1f2937');
    }
    k.ballLo(mx, top + 15.5, 0, 1.0, 1.0, 1.0, '#e5e7eb');
    if (base === 'cruiser' || (base === 'destroyer' && ['US', 'JP', 'KR', 'CN'].includes(nat)))
      for (const s of [-1, 1]) for (const [x, yw] of [[xf - 1.7, -s * Math.PI / 4], [bx0 + 0.3, -s * 3 * Math.PI / 4]])   // 相位陣列雷達（四面八角形面板）
        k.add(OCT, '#475569', x, by + bh * 0.45, s * (bw / 2 - 0.15), 0, yw, Math.PI / 2, bh * 0.42, 1, bh * 0.42);
    // 煙囪（黑色頂蓋）
    const nf = nat === 'IN' || nat === 'DE' || (rnd > 0.7 && !small) ? 2 : 1, fh = 3.2;
    for (let i = 0; i < nf; i++) {
      const fx = xa + L * 0.05 + 1.3 - i * (small ? 2.8 : L * 0.08 + 0.6), fy = i && !small ? top : by;
      k.loft([[fx - 1.2, sec(B * 0.3, fy, by + fh - fy, stealth ? 0.4 : 0)], [fx + 1.2, sec(B * 0.3, fy, by + fh - fy, stealth ? 0.4 : 0)]], P.dark);
      k.box(1.8, 0.3, B * 0.24, fx, by + fh + 0.1, 0, BLK);
    }
    // 主砲：隱形砲塔（斜面）或圓弧砲塔
    const gx = L * 0.33;
    if (stealth) k.loft([[gx - 1.8, sec(3.2, top, 1.8, 0.7)], [gx + 0.6, sec(3.2, top, 1.8, 0.7)], [gx + 1.8, sec(1.8, top, 1.2, 0.3)]], P.body);
    else k.tube([gx, top, 0], [gx, top + 1.6, 0], 1.6, P.body, 8, 1.3);
    gun(k, gx + 1.4, top + 1.1, 0, base === 'patrol' ? 4 : 6, 0.3, '#26282b', 0.05, 0, { sleeve: false });
    // 前部近迫武器（台座上）＋垂直發射格
    k.box(1.6, 1.4, 1.8, xf + 0.9, top + 0.7, 0, P.body); ciws(k, xf + 0.9, top + 1.4, 0, east);
    if (['cruiser', 'destroyer', 'frigate'].includes(base)) vls(k, L * 0.225, top, L * 0.09, B * 0.5, 2, base === 'frigate' ? 3 : 4);
    // 反艦飛彈發射筒
    const ax = small ? xa + L * 0.06 + 2.8 : xa - L * 0.04, ay = small ? by : top;
    if (base !== 'cruiser') for (const s of [-1, 1]) for (const dz of [0, 0.9]) {
      const z = s * (0.5 + dz);
      k.tube([ax - 1.8, ay + 0.9 + dz * 0.4, z], [ax + 1.8, ay + 1.9 + dz * 0.4, z], 0.4, '#4b5563', 6);
      k.box(0.3, 1.2 + dz * 0.4, 0.3, ax - 1.2, ay + 0.6 + dz * 0.2, z, GUN);
    }
    if (nat === 'RU' && base === 'cruiser') for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.tube([L * 0.03 + i * 2.6, top + 1, s * B * 0.42], [L * 0.03 + i * 2.6 + 7, top + 2.4, s * B * 0.42], 1, '#64748b', 6);
    // 機庫（大艦）＋後部近迫武器、小艇、救生筏
    let deckEnd = small ? xa : -L * 0.3;
    if (!small) {
      const h0 = -L * 0.3, h1 = xa - L * 0.08;
      blk(h0, h1, top, sw, sh * 0.9, P.body);
      k.box(0.2, sh * 0.62, B * 0.42, h0 - 0.06, top + sh * 0.32, 0, shade(P.body, -0.35));   // 機庫門
      ciws(k, h0 + 1.4, top + sh * 0.9, 0, east);
      for (const s of [-1, 1]) boat(k, xa - L * 0.04, top + 1.0, s * (B / 2 - 1.05), 3.2, east ? '#e5e7eb' : '#f97316');
      deckEnd = h0;
    }
    for (const s of [-1, 1]) rafts(k, xa + 0.6, top + 0.5, s * (B / 2 - 0.6), small ? 2 : 3);
    // 後甲板：直升機甲板或後主砲（東方大艦），否則深水炸彈架
    if (heli) helideck(k, -L / 2 + 0.6, deckEnd - 0.2, top, B);
    else if (aftGun) {
      const x = -L * 0.38;
      if (stealth) k.loft([[x + 1.8, sec(3.2, top, 1.8, 0.7)], [x - 0.6, sec(3.2, top, 1.8, 0.7)], [x - 1.8, sec(1.8, top, 1.2, 0.3)]].reverse(), P.body);
      else k.tube([x, top, 0], [x, top + 1.6, 0], 1.6, P.body, 8, 1.3);
      for (const z of [-0.4, 0.4]) barrel(k, x - 1.2, top + 1.1, z, 5, 0.25, '#26282b', 0.05, Math.PI, 5);
    } else for (const s of [-1, 1]) k.box(L * 0.12, 1.0, 0.4, -L * 0.38, top + 0.5, s * 0.8, '#4b5563');
    roundel(k, nat, L * 0.36, top - 1.2, B / 2 * 0.96 + 0.08, 1.1, 'z');
  };
}
function submarine(k, P) {
  const nat = P.nat, c = shade(P.body, -0.55);
  body(k, [[22, 0.3, 0.3, 0.4], [20, 2.0, 2.0, 0.4], [16, 3.0, 3.0, 0.4], [10, 3.2, 3.2, 0.4], [-14, 3.2, 3.2, 0.4], [-20, 2.0, 2.0, 0.4], [-25, 0.7, 0.7, 0.4]], c, 10);
  const sx = nat === 'US' ? 7 : nat === 'RU' ? -2 : 3, sh = nat === 'PK' ? 8 : nat === 'JP' ? 4.5 : 6;
  // 帆罩：前緣圓鈍、後緣收窄
  k.loft([[sx - 4, sec(1.0, 2.4, sh + 0.6, 0.2)], [sx + 1.5, sec(2.0, 2.4, sh + 0.6, 0.4)], [sx + 3, sec(1.6, 2.4, sh + 0.4, 0.4)], [sx + 4, sec(0.6, 2.4, sh - 0.4, 0.2)]], c);
  if (nat !== 'RU') for (const s of [-1, 1]) k.box(2.6, 0.3, 3, sx + 1, 3 + sh * 0.6, s * 2.4, c);       // 帆罩水平舵
  else for (const s of [-1, 1]) k.box(2.6, 0.3, 3, 15, 1.2, s * 4.2, c);                                     // 艏水平舵
  for (const [dx, h] of [[0, 2.2], [1, 1.6], [-1.2, 1.2]]) k.tube([sx + dx, 3 + sh, 0], [sx + dx, 3 + sh + h, 0], 0.18, '#3f4247', 4);   // 潛望鏡、天線
  if (nat === 'US' || nat === 'RU' || nat === 'CN' || nat === 'IN') k.box(10, 0.8, 3.2, sx - 9, 3.4, 0, c);  // 飛彈艙背脊
  const x = nat === 'AU' ? 0.7 : 0;
  k.fin([[-26, -4], [-22, -2], [-22, 2], [-26, 4]], 0, 0.5, c, x);
  k.wing([[-22, 0], [-23, 4], [-26, 4], [-26, 0]], 0.2, 0.4, c);
  k.tube([-25.4, 0.4, 0], [-26.4, 0.4, 0], 1.1, '#3f4247', 8, 0.9);                                       // 泵噴推進器罩
  k.box(30, 0.08, 1.2, -2, 3.62, 0, shade(c, 0.15));                                                       // 甲板走道線
  roundel(k, nat, sx, 3 + sh * 0.5, 1.0, 0.9, 'z');
}
function miniJet(k, x, y, z, c, a = 0) {    // 艦載機：機身＋座艙＋後掠翼＋垂直尾翼
  const ca = Math.cos(a), sa = Math.sin(a), R = (u, v) => [x + u * ca - v * sa, z + u * sa + v * ca];
  const [nx, nz] = R(3.4, 0), [tx, tz] = R(-3.2, 0);
  k.tube([tx, y + 0.5, tz], [nx, y + 0.5, nz], 0.55, c, 6, 0.15);
  k.slab([R(1, 0), R(-1.6, 2.8), R(-2.6, 2.8), R(-1.8, 0), R(-2.6, -2.8), R(-1.6, -2.8)], y + 0.3, 0.25, c);
  const [cx, cz] = R(1.4, 0); k.ballLo(cx, y + 0.95, cz, 0.6, 0.35, 0.6, GLASS);
  for (const s of [-1, 1]) { const [fx, fz] = R(-2.6, s * 0.5); k.box(1.2, 1.4, 0.15, fx, y + 1.2, fz, shade(c, -0.3), -a); }
}
function flattop(k, P, base) {
  const nat = P.nat, L = base === 'carrier' ? 56 : base === 'wingman_carrier' ? 50 : 50, B = base === 'lhd' ? 9 : 11;
  hull(k, P, L, B * 0.8, 4);
  const ramp = base === 'carrier' && ['CN', 'RU', 'IN', 'GB'].includes(nat) || (base === 'lhd' && nat === 'AU');
  const angled = base === 'carrier' && !ramp;
  // 飛行甲板（航艦：左舷斜角甲板外伸）
  const fd = [[-L / 2, -B / 2 - 1], [L / 2 - 3, -B / 2 - 1], [L / 2, -B / 3], [L / 2, B / 3], [L / 2 - 3, B / 2], [-L / 2, B / 2]];
  if (angled) fd.splice(5, 0, [-4, B / 2 + 1.4], [-L / 2 + 6, B / 2 + 1.4]);
  k.slab(fd, 4.4, 1, '#5d636c');
  if (ramp) k.slab([[L / 2 - 10, -B / 3], [L / 2, -B / 3], [L / 2, B / 3], [L / 2 - 10, B / 3]], 5.4, 1.4, '#5d636c');
  // 甲板標線：中線虛線、邊線、斜角降落區、彈射器
  const dy = 5.45, M = '#f1f5f9';
  for (let i = -3; i <= 3; i++) k.box(2.4, 0.1, 0.4, i * 6, dy, angled ? -1.6 : 0, M);
  for (const s of [-1, 1]) k.box(L - 6, 0.08, 0.2, -2, dy, s * (B / 2 - 0.4) + (s < 0 ? -0.6 : 0), M);
  if (angled) {
    const a = -0.16, cx = -8, cz = 2.2;
    for (const d of [-1.6, 1.6]) k.box(30, 0.1, 0.22, cx, dy + 0.01, cz + d, '#facc15', a);
    for (let i = -2; i <= 2; i++) k.box(2, 0.12, 0.3, cx + i * 5.6, dy + 0.02, cz - i * 5.6 * Math.sin(a), M, a);
    for (const z of [-2.2, 0.6]) k.box(14, 0.1, 0.18, L / 2 - 9, dy + 0.01, z, '#1f2937');            // 彈射器
  }
  if (base === 'lhd') for (let i = 0; i < 5; i++) k.ring(-18 + i * 8.5, dy, 1.4, 2.2, M);              // 直升機起降點
  if (base !== 'lhd') for (const s of [-1, 1]) k.box(6, 0.08, 0.15, -L / 2 + 8, dy + 0.01, s * 1.4 + (angled ? 1.2 : 0), '#facc15');
  // 艦島：分層、艦橋窗、桅杆、雷達；英國伊莉莎白級有前後兩座艦島
  const islands = nat === 'GB' && base === 'carrier' ? [4, -10] : [base === 'lhd' && nat === 'JP' ? 2 : -4];
  const iw = nat === 'JP' ? 14 : 9, iz = -B / 2 + 1.6;
  for (const ix of islands) {
    const w = islands.length > 1 ? 6 : iw;
    k.loft([[ix - w / 2, sec(3, 5.4, 6, 0.3)], [ix + w / 2, sec(3, 5.4, 6, 0.3)]].map(([x, s]) => [x, s.map(([z, y]) => [z + iz, y])]), P.body);
    k.box(w * 0.5, 3, 2.6, ix + 1, 13, iz, P.body);
    k.box(0.2, 0.8, 2.4, ix + 1 + w * 0.25 + 0.05, 13.8, iz, '#1f2937');
    k.box(w * 0.5, 0.6, 0.2, ix + 1, 13.8, iz + 1.35, '#1f2937');
    k.tube([ix, 14.5, iz], [ix, 19, iz], 0.4, '#3f4247', 6);
    k.box(0.5, 1.0, 3.4, ix, 17.5, iz, '#1f2937');
    k.add(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 8), '#475569', ix + w / 2 + 0.05, 10, iz, 0, 0, Math.PI / 2);
  }
  ciws(k, L / 2 - 8, 4.6, -B / 2 - 0.4, P.east); ciws(k, -L / 2 + 2, 4.6, B / 2 - 1, P.east);
  if (base !== 'lhd' && nat !== 'TW' && base !== 'wingman_carrier') for (const [x, z, a] of [[14, 2.4, 0], [6, 3, 0.3], [-14, 1.5, -0.2], [-20, -2.4, 0.5]]) miniJet(k, x, 5.4, z, P.dark, a);   // 艦載機
  if (base === 'lhd') {
    for (const [x, z] of [[12, 1.4], [-5, 1.4]]) {                              // 艦載直升機
      k.box(5, 1.6, 2, x, 6.4, z, P.dark); k.tube([x - 2.5, 6.6, z], [x - 6.5, 7.2, z], 0.4, P.dark, 5);
      k.box(9, 0.2, 0.6, x, 7.6, z, '#26282b', 0.6); k.box(9, 0.2, 0.6, x, 7.6, z, '#26282b', -0.6);
    }
    k.box(0.3, 2.6, B * 0.5, -L / 2 - 0.05, 1.6, 0, BLK);                       // 艉部塢艙門
  }
  if (base === 'wingman_carrier') for (let i = 0; i < 5; i++) { const x = -16 + i * 7; k.slab([[x + 1.8, 2], [x - 1.4, 0.2], [x - 1.4, 3.8]], 5.5, 0.5, '#0f172a'); }
  for (const s of [-1, 1]) rafts(k, -L * 0.2, 3.2, s * (B * 0.4), 4);
  roundel(k, nat, L * 0.3, 1.2, B * 0.4 * 0.96 + 0.08, 1.4, 'z');
}
function lst(k, P) {
  const top = hull(k, P, 38, 8, 4, { blunt: true });
  k.loft([[-18, sec(7.2, top, 6, 0.4)], [-8, sec(7.2, top, 6, 0.4)]], P.body);
  k.loft([[-15, sec(6, top + 6, 2.6, 0.3)], [-8.6, sec(6, top + 6, 2.6, 0.3)], [-7.8, sec(5, top + 6, 2, 0.3)]], P.body);
  k.box(0.3, 0.7, 4.4, -8.1, top + 7.6, 0, '#1f2937', 0, -0.4);
  k.tube([-11, top + 8.4, 0], [-11, top + 13, 0], 0.4, '#3f4247', 6); k.box(0.5, 0.9, 3, -11, top + 11.6, 0, '#1f2937');
  k.loft([[-16, sec(2.2, top + 6, 3, 0.2)], [-13.6, sec(2.2, top + 6, 3, 0.2)]], P.dark); k.box(2.2, 0.3, 2, -14.8, top + 9.1, 0, BLK);
  k.box(1.2, 4, 6, 18.6, top - 0.6, 0, P.dark);                        // 艏門
  k.box(0.3, 3.6, 5, 19.25, top - 0.6, 0, shade(P.dark, -0.3));
  for (const x of [-2, 6]) { k.box(6, 2.6, 4.4, x, top + 1.3, 0, '#4b5563'); k.box(2, 1.2, 4, x + 2.6, top + 3.2, 0, '#4b5563'); }   // 甲板上的車輛
  k.tube([12, top, 2.4], [12, top + 7, 2.4], 0.35, '#3f4247', 5); k.tube([12, top + 7, 2.4], [6, top + 5, 2.4], 0.25, '#3f4247', 5);   // 吊桿
  for (const s of [-1, 1]) { boat(k, -12, top + 3.4, s * 4.4, 3.2, '#e5e7eb'); rafts(k, 0, top + 0.5, s * 3.4, 3); }
  roundel(k, P.nat, -13, top + 2, 3.7, 1.2, 'z');
}
function hovercraft(k, P) {
  k.slab([[-14, -8], [10, -8], [15, -4], [15, 4], [10, 8], [-14, 8]], 0, 3, '#1f2125');
  k.slab([[-13, -7], [9, -7], [13, -3.5], [13, 3.5], [9, 7], [-13, 7]], 3, 1.6, P.body);
  k.box(6, 4, 3, 3, 6.6, -5, P.dark); k.box(0.2, 1, 2.4, 6.05, 7.6, -5, GLASS);
  const n = P.nat === 'CN' || P.nat === 'RU' ? 3 : 2;
  for (let i = 0; i < n; i++) { const z = (i - (n - 1) / 2) * 6; k.tube([-12, 9, z], [-11, 9, z], 3, '#4b5563', 12); k.tube([-11.6, 9, z], [-11.4, 9, z], 0.5, BLK, 6); k.box(0.2, 5.6, 0.6, -11.5, 9, z, '#26282b', 0, 0, 0.7); k.tube([-12, 5.8, z], [-12, 6.4, z], 1.2, '#4b5563', 6); }
  roundel(k, P.nat, 0, 4.5, 7.05, 1.3, 'z');
}
function usvPack(k, P) {
  for (const [x, z] of [[6, -6], [-6, 0], [6, 6]]) {
    k.slab([[x - 6, z - 1.8], [x + 3, z - 1.8], [x + 6, z], [x + 3, z + 1.8], [x - 6, z + 1.8]], -0.6, 2.4, '#1f2937');
    k.box(2.4, 1.4, 2, x - 1, 2.4, z, '#334155'); k.ball(x - 1, 3.6, z, 0.6, 0.6, 0.6, '#38bdf8');
    k.tube([x - 1.6, 3.1, z], [x - 1.6, 5, z], 0.12, '#1f2125', 4); k.box(0.2, 0.6, 1.6, x + 0.25, 2.6, z, '#0f172a');
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

// 旋翼：一片四葉槳（槳尖略寬）＋槳轂，另外成一個網格以便轉動
const rotorGeo = {};
function rotor(len) {
  if (rotorGeo[len]) return rotorGeo[len];
  const k = new Kit();
  k.box(len * 2, 0.25, 1.3, 0, 0, 0, '#1f2125'); k.box(1.3, 0.25, len * 2, 0, 0, 0, '#1f2125');
  for (const [x, z] of [[len - 0.5, 0], [-len + 0.5, 0], [0, len - 0.5], [0, -len + 0.5]]) k.box(x ? 1 : 1.32, 0.27, z ? 1 : 1.32, x, 0, z, '#9ca3af');
  k.tube([0, -0.3, 0], [0, 0.6, 0], 1.0, '#3f4247', 6);
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
