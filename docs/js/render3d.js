// ===== 3D 戰場（Three.js）=====
// 地形是有高度的六角柱，樹木、山、建築、道路都是實體模型；部隊是站在格子上的立牌。
// 遊戲邏輯與 2D 介面完全不變：這裡只負責畫面，並提供「螢幕座標 ↔ 地圖座標」的換算。
// 本檔是 ES module，會讀取其他 <script> 定義的全域（G、TERRAIN、cam、drawCounter…）。
import * as THREE from '../vendor/three.min.js';

const FOV = 30;                       // 鏡頭視角（度）
const BASE_Y = -16;                   // 六角柱底部
const WATER_Y = -2.4;                 // 海面高度
const TILE_H = { sea: -8, bridge: -8, plain: 0, road: 0, rail: 0, forest: 0, hills: 6, mountain: 12, city: 0.5, capital: 0.5, factory: 0.5, airport: 0.5, port: 0.5 };
const TOP_COLOR = {
  plain: '#8db458', road: '#8db458', rail: '#8db458', forest: '#6c9a49', hills: '#b3a565', mountain: '#8e8574',
  sea: '#123a66', bridge: '#123a66', city: '#b5b2a2', capital: '#c3bda8', factory: '#a9a394', airport: '#98a488', port: '#b3aa90',
};

let renderer = null, scene, camera, glCanvas, failed = false;
let hemi, sun, mapGroup = null, water = null, waterTex = null;
let hgt = null, builtFor = null, nightNow = null;
let props = [], flagMesh = null, ringMesh = null;          // 據點旗幟與底環（顏色隨佔領變化）
let ovFill, ovRing, ovSeg, blob;                            // 每幀重建的覆蓋層
const sprites = [], texCache = new Map();
let unitGroup;
const elev = { v: 55 * Math.PI / 180 };
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), S = new THREE.Vector3(), C = new THREE.Color();
const YAXIS = new THREE.Vector3(0, 1, 0);

// ----- 小工具 -----
const rnd = (i, k) => hash(i * 31 + k * 7 + 3);
function jitter(hex, i, amt = 0.06) {
  C.set(hex);
  const f = 1 + (rnd(i, 91) - 0.5) * 2 * amt;
  C.multiplyScalar(f);
  return C;
}
function canvasTex(w, h, paint, repeat) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// 可增量加入的 InstancedMesh
class Inst {
  constructor(geo, mat, max, { alpha = false, order = 0 } = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.max = Math.max(1, max); this.n = 0;
    this.mesh.setColorAt(0, C.set('#fff'));
    if (alpha) {
      this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
      geo.setAttribute('instAlpha', this.alpha);
    }
    this.mesh.count = 0;
  }
  add(x, y, z, sx, sy, sz, color, rotY = 0, a = 1) {
    if (this.n >= this.max) return;
    Q.setFromAxisAngle(YAXIS, rotY);
    M.compose(V.set(x, y, z), Q, S.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, M);
    this.mesh.setColorAt(this.n, color.isColor ? color : C.set(color));
    if (this.alpha) this.alpha.array[this.n] = a;
    this.n++;
  }
  reset() { this.n = 0; }
  done() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.alpha) this.alpha.needsUpdate = true;
  }
}
// 讓 MeshBasicMaterial 支援每個實例各自的透明度
function alphaMaterial(opts) {
  const m = new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, toneMapped: false }, opts));
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float instAlpha;\nvarying float vInstAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstAlpha = instAlpha;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInstAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstAlpha;');
  };
  return m;
}
function parseColor(str) {
  // 回傳 [THREE.Color 可用的字串, 透明度]
  const m = /^rgba?\(([^)]+)\)/.exec(str);
  if (!m) return [str, 1];
  const p = m[1].split(',').map(s => +s);
  return [`rgb(${p[0] | 0},${p[1] | 0},${p[2] | 0})`, p.length > 3 ? p[3] : 1];
}

// ----- 初始化 -----
function init() {
  if (renderer || failed) return !!renderer;
  try {
    glCanvas = document.createElement('canvas');
    glCanvas.id = 'gl';
    const map = document.getElementById('map');
    map.parentNode.insertBefore(glCanvas, map);
    glCanvas.style.display = 'block';
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    failed = true; renderer = null;
    if (glCanvas && glCanvas.parentNode) glCanvas.parentNode.removeChild(glCanvas);
    return false;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  scene.fog = new THREE.Fog('#000000', 1000, 6000);
  camera = new THREE.PerspectiveCamera(FOV, 1, 10, 20000);
  hemi = new THREE.HemisphereLight('#e4eeff', '#6b624c', 1.15);
  sun = new THREE.DirectionalLight('#fff1d6', 2.1);
  sun.position.set(-0.55, 1, 0.45);
  scene.add(hemi, sun);

  // 覆蓋層（可移動範圍、攻擊範圍、選取框、路徑）與部隊影子
  const hexFill = new THREE.CircleGeometry(R - 1, 6, Math.PI / 6).rotateX(-Math.PI / 2);
  ovFill = new Inst(hexFill, alphaMaterial({}), 6000, { alpha: true, order: 2 });
  const hexRing = new THREE.RingGeometry(R - 4.6, R - 1.4, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
  ovRing = new Inst(hexRing, alphaMaterial({}), 800, { alpha: true, order: 3 });
  ovSeg = new Inst(new THREE.BoxGeometry(1, 1, 1), alphaMaterial({}), 3000, { alpha: true, order: 4 });
  blob = new Inst(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), alphaMaterial({ color: '#000' }), 1500, { alpha: true, order: 5 });
  unitGroup = new THREE.Group();
  scene.add(ovFill.mesh, ovRing.mesh, ovSeg.mesh, blob.mesh, unitGroup);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => { builtFor = null; texCache.clear(); });
  return true;
}

// ----- 地圖 -----
function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) { if (m.map) m.map.dispose(); m.dispose(); }
  });
  scene.remove(g);
}
function tileHeight(i) {
  const t = G.terrain[i];
  let h = TILE_H[t] ?? 0;
  if (t === 'hills') h += rnd(i, 1) * 3;
  else if (t === 'mountain') h += rnd(i, 1) * 5;
  else if (t === 'sea' || t === 'bridge') {
    // 靠岸的海比較淺
    const [x, y] = ixy(i);
    if (neighbors(x, y).some(([nx, ny]) => { const tt = G.terrain[idxOf(nx, ny)]; return tt !== 'sea' && tt !== 'bridge'; })) h = -4.6;
  }
  return h;
}
// 部隊站立的高度（海面上的船站在水面）
function standY(i) {
  const t = G.terrain[i];
  return t === 'sea' ? WATER_Y : t === 'bridge' ? 1.4 : hgt[i];
}
function heightAt(wx, wy) {
  if (!hgt) return 0;
  const [x, y] = pixelToTile(wx, wy);
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return WATER_Y;
  return standY(idxOf(x, y));
}

function makeWaterNormal() {
  // 以數個方向的正弦波疊出可無縫拼接的法線圖
  const n = 128, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), img = g.createImageData(n, n);
  const waves = [[1, 2, 0.0, 1], [3, -1, 1.3, 0.6], [-2, 3, 2.1, 0.5], [5, 2, 0.7, 0.3], [-4, -5, 4.0, 0.25], [7, -3, 5.2, 0.18]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let dx = 0, dy = 0;
    for (const [kx, ky, ph, a] of waves) {
      const c = Math.cos(2 * Math.PI * (kx * x + ky * y) / n + ph) * a;
      dx += c * kx; dy += c * ky;
    }
    const k = 0.11, nx = -dx * k, ny = -dy * k, l = Math.hypot(nx, ny, 1), o = (y * n + x) * 4;
    img.data[o] = (nx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildMap() {
  if (mapGroup) disposeGroup(mapGroup);
  mapGroup = new THREE.Group();
  scene.add(mapGroup);
  const N = G.w * G.h, [ww, wh] = worldSize();
  hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) hgt[i] = tileHeight(i);

  // 六角柱：頂面帶細緻紋理與格線，側面較暗
  const topTex = canvasTex(256, 256, (c, w) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, w);
    const img = c.getImageData(0, 0, w, w);
    for (let p = 0; p < w * w; p++) {
      const v = 232 + Math.floor(hash(p) * 23);
      img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v;
    }
    c.putImageData(img, 0, 0);
    c.strokeStyle = 'rgba(20,30,20,0.34)'; c.lineWidth = 5; c.beginPath();
    for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; c.lineTo(w / 2 + Math.cos(a) * (w / 2 - 1), w / 2 + Math.sin(a) * (w / 2 - 1)); }
    c.stroke();
  });
  const prism = new THREE.CylinderGeometry(R, R, 1, 6, 1, false);
  const tiles = new Inst(prism, [
    new THREE.MeshStandardMaterial({ color: '#8a7f70', roughness: 1 }),
    new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: '#333' }),
  ], N);

  const cone6 = new THREE.ConeGeometry(1, 1, 6), cone5 = new THREE.ConeGeometry(1, 1, 5);
  const flat = { flatShading: true, roughness: 1 };
  const trees = new Inst(cone6, new THREE.MeshStandardMaterial(flat), N * 14);
  const rocks = new Inst(cone5, new THREE.MeshStandardMaterial(flat), N * 3);
  const snow = new Inst(cone5, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.7 }), N * 3);
  const domes = new Inst(new THREE.SphereGeometry(1, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial(flat), N * 3);
  // 建築：牆面有窗格，夜間窗戶會亮
  const winPaint = lit => (c, w, h) => {
    c.fillStyle = lit ? '#000' : '#fff'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const on = hash(y * 4 + x + 5) > 0.35;
      c.fillStyle = lit ? (on ? '#ffd27a' : '#1a1408') : '#5b7088';
      c.fillRect(3 + x * 8, 3 + y * 8, 4, 4.5);
    }
  };
  const bMat = new THREE.MeshStandardMaterial({ map: canvasTex(32, 64, winPaint(false)), emissiveMap: canvasTex(32, 64, winPaint(true)), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.85 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bldg = new Inst(boxGeo, bMat, N * 8);
  const solid = new Inst(boxGeo.clone(), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N * 10);
  const cyl = new Inst(new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N * 3);
  const dome = new Inst(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), 64);
  mapGroup.userData.bMat = bMat;

  props = [];
  const BCOL = ['#e9e3d4', '#d3d8de', '#cbc3b2', '#b9c5d0', '#ded2bd'];
  for (let i = 0; i < N; i++) {
    const [cx, cz] = idxCenter(i), t = G.terrain[i], h = hgt[i];
    const sea = t === 'sea' || t === 'bridge';
    C.set(TOP_COLOR[t] || '#8db458');
    if (sea && h > -6) C.set('#2f7f8f');
    C.multiplyScalar(1 + (rnd(i, 91) - 0.5) * 0.1);
    if (!(sea && h <= -6)) tiles.add(cx, (h + BASE_Y) / 2, cz, 1, h - BASE_Y, 1, C);   // 深海不放六角柱，直接露出海床
    if (TERRAIN[t].prop) props.push(i);
    switch (t) {
      case 'forest': {
        const n = 5 + Math.floor(rnd(i, 0) * 3);
        for (let k = 0; k < n; k++) {
          const a = rnd(i, k + 1) * Math.PI * 2, r = 6 + rnd(i, k + 11) * 17, s = 0.8 + rnd(i, k + 21) * 0.5;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          jitter(k % 3 ? '#356f38' : '#2c5f33', i * 9 + k, 0.12);
          trees.add(x, h + 6 * s, z, 5.6 * s, 12 * s, 5.6 * s, C, a);
          jitter('#4a8a41', i * 9 + k, 0.1);
          trees.add(x, h + 12.5 * s, z, 3.9 * s, 9 * s, 3.9 * s, C, a);
        }
        break;
      }
      case 'hills': {
        for (const [ox, oz, s] of [[-8, 4, 15], [10, -5, 12], [1, 12, 9]]) {
          jitter('#a3955a', i + ox, 0.08);
          domes.add(cx + ox, h - 0.5, cz + oz, s, s * 0.5, s, C, rnd(i, ox));
        }
        if (rnd(i, 5) > 0.5) { jitter('#3f7a3c', i, 0.1); trees.add(cx - 12, h + 5, cz - 12, 4.5, 10, 4.5, C); }
        break;
      }
      case 'mountain': {
        for (const [ox, oz, r, ph] of [[-5, 3, 20, 34], [11, -6, 13, 23], [-13, -11, 10, 17]]) {
          const hh = ph * (0.85 + rnd(i, ox + 40) * 0.35), rot = rnd(i, ox) * 6;
          jitter('#7c7365', i + ox, 0.1);
          rocks.add(cx + ox, h + hh / 2 - 1, cz + oz, r, hh, r, C, rot);
          if (hh > 20) snow.add(cx + ox, h + hh - 1 - hh * 0.17, cz + oz, r * 0.36, hh * 0.36, r * 0.36, C.set('#f3f2ec'), rot);
        }
        break;
      }
      case 'city': {
        for (const [k, [ox, oz]] of [[-13, -6], [-2, -12], [10, -8], [-10, 8], [2, 4], [13, 6]].entries()) {
          const w = 7 + rnd(i, k) * 3, d = 7 + rnd(i, k + 6) * 3, hh = 8 + rnd(i, k + 12) * 15;
          bldg.add(cx + ox, h, cz + oz, w, hh, d, jitter(BCOL[(i + k) % BCOL.length], i * 7 + k, 0.05), (rnd(i, k + 3) - 0.5) * 0.3);
        }
        break;
      }
      case 'capital': {
        bldg.add(cx, h, cz - 2, 13, 30, 13, C.set('#efe7d2'));
        cyl.add(cx, h + 30, cz - 2, 4.5, 5, 4.5, C.set('#e6dcc2'));
        dome.add(cx, h + 35, cz - 2, 5.2, 5.2, 5.2, C.set('#d9b24c'));
        for (const [k, [ox, oz]] of [[-15, -8], [15, -8], [-14, 10], [14, 10], [0, 15]].entries()) bldg.add(cx + ox, h, cz + oz, 8, 10 + rnd(i, k) * 9, 8, C.set(BCOL[k % BCOL.length]));
        break;
      }
      case 'factory': {
        solid.add(cx - 4, h, cz + 4, 26, 9, 16, C.set('#b9b0a0'));
        for (let k = 0; k < 3; k++) solid.add(cx - 12 + k * 8, h + 9, cz + 4, 8, 3, 16, C.set('#8f8778'), 0);
        for (const [ox, oz, hh] of [[13, -10, 26], [6, -13, 20]]) { cyl.add(cx + ox, h, cz + oz, 2.4, hh, 2.4, C.set('#8a4f43')); cyl.add(cx + ox, h + hh, cz + oz, 2.7, 1.6, 2.7, C.set('#e9e4dc')); }
        break;
      }
      case 'airport': {
        solid.add(cx, h, cz, 52, 0.7, 12, C.set('#55585c'), 0.52);
        for (let k = -2; k <= 2; k++) solid.add(cx + Math.cos(0.52) * k * 10, h + 0.75, cz - Math.sin(0.52) * k * 10, 5, 0.1, 1.2, C.set('#f2f2ee'), 0.52);
        solid.add(cx + 13, h, cz + 13, 4, 15, 4, C.set('#dcdcd6'));
        solid.add(cx + 13, h + 15, cz + 13, 7, 3.5, 7, C.set('#6fa8cf'));
        solid.add(cx - 12, h, cz + 15, 14, 7, 9, C.set('#b6bcc2'));
        break;
      }
      case 'port': {
        const [x, y] = ixy(i);
        const seaN = neighbors(x, y).map(([nx, ny]) => idxOf(nx, ny)).find(j => G.terrain[j] === 'sea');
        let a = 0;
        if (seaN !== undefined) { const [sx, sz] = idxCenter(seaN); a = Math.atan2(-(sz - cz), sx - cx); }
        const dx = Math.cos(a), dz = -Math.sin(a);
        solid.add(cx + dx * 26, WATER_Y - 3, cz + dz * 26, 34, 4.6, 8, C.set('#8a6a44'), a);
        solid.add(cx - dx * 4, h, cz - dz * 4, 2.2, 19, 2.2, C.set('#e2b23a'), a);
        solid.add(cx + dx * 5, h + 17, cz + dz * 5, 22, 2, 2.2, C.set('#e2b23a'), a);
        for (const [k, col] of ['#c0483c', '#3d6fb0', '#3f8f5a', '#d39a2c'].entries())
          solid.add(cx - dz * (k * 7 - 11) - dx * 14, h, cz + dx * (k * 7 - 11) - dz * 14, 9, 4 + (k % 2) * 4, 5, C.set(col), a);
        solid.add(cx - dx * 12, h, cz - dz * 12 + 12, 12, 7, 9, C.set('#c9c2b2'), a);
        break;
      }
    }
  }
  // 道路與橋：每段路從格心畫到與鄰格的交界
  const seg = (a, b, w, th, col, lift) => {
    const [ax, az] = idxCenter(a), [bx, bz] = idxCenter(b), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    for (const [i, sx, sz] of [[a, ax, az], [b, bx, bz]]) {
      const bridge = G.terrain[i] === 'bridge', len = Math.hypot(mx - sx, mz - sz) + 1.5;
      const y = bridge ? 0.2 : Math.max(hgt[i], 0) + lift;
      solid.add((sx + mx) / 2, y, (sz + mz) / 2, len, bridge ? 1.4 : th, bridge ? w + 4 : w, C.set(bridge ? '#a08766' : col), Math.atan2(-(mz - sz), mx - sx));
      if (bridge) { cyl.add(sx, BASE_Y, sz, 2.6, 0.2 - BASE_Y, 2.6, C.set('#8b8478')); cyl.add(sx, 0.2, sz, (w + 4) / 2, 1.4, (w + 4) / 2, C.set('#a08766')); }
      else cyl.add(sx, y, sz, w / 2, th, w / 2, C.set(col));
    }
  };
  for (const [a, b] of G.roads || []) seg(a, b, 7, 0.55, '#d8caa0', 0.05);
  for (const [a, b] of G.rails || []) { seg(a, b, 5.5, 0.5, '#6a5a44', 0.62); seg(a, b, 2.4, 0.4, '#3a3a3a', 1.14); }

  for (const m of [tiles, trees, rocks, snow, domes, bldg, solid, cyl, dome]) { m.done(); mapGroup.add(m.mesh); }

  // 據點旗幟與底環
  const pole = new Inst(new THREE.CylinderGeometry(0.6, 0.6, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#2b2b2b' }), props.length);
  flagMesh = new Inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.12 }), props.length);
  ringMesh = new Inst(new THREE.RingGeometry(R - 5.5, R - 2.2, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, toneMapped: false }), props.length);
  ringMesh.mesh.renderOrder = 1;
  for (const i of props) { const [cx, cz] = idxCenter(i); pole.add(cx + 17, hgt[i], cz - 14, 1, 30, 1, '#2b2b2b'); }
  pole.done();
  mapGroup.add(pole.mesh, flagMesh.mesh, ringMesh.mesh);

  // 海：地圖外再延伸一大圈，遠處融入霧色
  if (!waterTex) waterTex = makeWaterNormal();
  const pad = 3000;
  waterTex.repeat.set((ww + pad * 2) / 260, (wh + pad * 2) / 260);
  water = new THREE.Mesh(new THREE.PlaneGeometry(ww + pad * 2, wh + pad * 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#2d78bd', transparent: true, opacity: 0.8, roughness: 0.28, metalness: 0.05, normalMap: waterTex, normalScale: new THREE.Vector2(0.55, 0.55) }));
  water.position.set(ww / 2, WATER_Y, wh / 2);
  water.renderOrder = 0;
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(ww + pad * 2, wh + pad * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0f3157', roughness: 1 }));
  bed.position.set(ww / 2, -8.2, wh / 2);
  mapGroup.add(bed, water);
  builtFor = G.terrain;
  nightNow = null;
}

function syncProps() {
  flagMesh.reset(); ringMesh.reset();
  for (const i of props) {
    const o = G.owner[i], [cx, cz] = idxCenter(i), col = o >= 0 ? SIDES[o].color : '#e8e8e8';
    flagMesh.add(cx + 23, hgt[i] + 26, cz - 14, 12, 7.5, 0.8, col);
    ringMesh.add(cx, hgt[i] + 0.25, cz, 1, 1, 1, col);
  }
  flagMesh.done(); ringMesh.done();
}

// ----- 鏡頭：沿用 2D 的 cam（左上角座標＋縮放），換算成傾斜的透視鏡頭 -----
function updateCamera() {
  const [vw, vh] = viewSize();
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
  const sz = renderer.getSize(new THREE.Vector2());
  if (sz.x !== vw || sz.y !== vh) renderer.setSize(vw, vh, false);
  camera.aspect = vw / Math.max(1, vh);
  const cx = cam.x + vw / cam.z / 2, cz = cam.y + vh / cam.z / 2;
  const dist = (vh / 2) / Math.tan(FOV * Math.PI / 360) / cam.z;
  // 拉遠時較俯視（看全局），拉近時較平視（看立體感）
  const t = Math.max(0, Math.min(1, (Math.log(cam.z) - Math.log(0.3)) / (Math.log(1.8) - Math.log(0.3))));
  elev.v = (64 - 20 * t) * Math.PI / 180;
  camera.position.set(cx, dist * Math.sin(elev.v), cz + dist * Math.cos(elev.v));
  camera.near = Math.max(4, dist * 0.04); camera.far = dist * 5 + 4000;
  camera.lookAt(cx, 0, cz);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  scene.fog.near = dist * 1.5; scene.fog.far = dist * 4.5 + 2500;
}
// 地圖座標（含高度）→ 螢幕座標與該處的縮放比例
function project(wx, wy, h) {
  const [vw, vh] = viewSize();
  V.set(wx, h === undefined ? heightAt(wx, wy) : h, wy);
  V2.copy(V).applyMatrix4(camera.matrixWorldInverse);
  const depth = -V2.z;
  V.project(camera);
  return [(V.x * 0.5 + 0.5) * vw, (-V.y * 0.5 + 0.5) * vh, (vh / 2) / Math.tan(FOV * Math.PI / 360) / Math.max(1, depth)];
}
// 螢幕座標 → 地圖座標（先打到地面，再依該格高度修正一次）
function pick(sx, sy) {
  const [vw, vh] = viewSize();
  const o = camera.position;
  V.set(sx / vw * 2 - 1, -(sy / vh) * 2 + 1, 0.5).unproject(camera).sub(o).normalize();
  let y = 0, x = 0, z = 0;
  for (let k = 0; k < 3; k++) {
    const t = V.y < -1e-6 ? (y - o.y) / V.y : 1e6;
    x = o.x + V.x * t; z = o.z + V.z * t;
    const ny = heightAt(x, z);
    if (Math.abs(ny - y) < 0.01) break;
    y = ny;
  }
  return [x, z];
}

// ----- 部隊立牌 -----
const SPR_W = 76, SPR_H = 78, SPR_CX = 38, SPR_CY = 40, SPR_RES = 3;
function unitMaterial(key, type, side, o) {
  let m = texCache.get(key);
  if (m) return m;
  if (texCache.size > 700) { for (const v of texCache.values()) { v.map.dispose(); v.dispose(); } texCache.clear(); }
  const cv = document.createElement('canvas'); cv.width = SPR_W * SPR_RES; cv.height = SPR_H * SPR_RES;
  const c = cv.getContext('2d'); c.scale(SPR_RES, SPR_RES);
  drawCounter(c, SPR_CX, SPR_CY, type, side, o);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  m = new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.02, depthWrite: false, fog: false, toneMapped: false });
  texCache.set(key, m);
  return m;
}
function syncUnits(list) {
  blob.reset();
  let n = 0;
  for (const it of list) {
    const { u, o, key } = it, d = UNITS[u.type], air = d.cat === 'air';
    const [ax, ay] = u._anim || tileCenter(u.x, u.y);
    const gy = heightAt(ax, ay), y = gy + (air ? 20 : 0);
    let sp = sprites[n];
    if (!sp) { sp = sprites[n] = new THREE.Sprite(); sp.center.set(SPR_CX / SPR_W, 1 - (SPR_CY + 12) / SPR_H); sp.scale.set(SPR_W * 0.94, SPR_H * 0.94, 1); sp.renderOrder = 10; unitGroup.add(sp); }
    sp.material = unitMaterial(key, u.type, u.side, o);
    sp.position.set(ax, y + 0.8, ay);
    sp.visible = true;
    blob.add(ax, gy + 0.7, ay, air ? 13 : 17, 1, air ? 6 : 8.5, '#000', 0, air ? 0.22 : 0.3);
    n++;
  }
  for (let k = n; k < sprites.length; k++) sprites[k].visible = false;
  blob.done();
}

// ----- 每幀 -----
const API = {
  ready: false,
  get failed() { return failed; },
  init,
  // 開始一幀：必要時重建地圖、更新鏡頭、清空覆蓋層
  begin() {
    if (!init()) return false;
    if (builtFor !== G.terrain || API.dirty) { API.dirty = false; buildMap(); }
    updateCamera();
    ovFill.reset(); ovRing.reset(); ovSeg.reset();
    return true;
  },
  fillHex(i, color) {
    const [cx, cz] = idxCenter(i), [col, a] = parseColor(color);
    ovFill.add(cx, standY(i) + 1.0, cz, 1, 1, 1, col, 0, a);
  },
  strokeHex(i, color, alpha = 1) {
    const [cx, cz] = idxCenter(i), [col, a] = parseColor(color);
    ovRing.add(cx, standY(i) + 1.3, cz, 1, 1, 1, col, 0, a * alpha);
  },
  // 沿格子畫路徑；dash 為 [實線長, 空白長, 位移]
  path(idxList, color, width, dash) {
    const [col, a] = parseColor(color);
    for (let k = 0; k + 1 < idxList.length; k++) {
      const [ax, az] = idxCenter(idxList[k]), [bx, bz] = idxCenter(idxList[k + 1]);
      const y = Math.max(standY(idxList[k]), standY(idxList[k + 1])) + 2.2, len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(-(bz - az), bx - ax);
      if (!dash) { ovSeg.add((ax + bx) / 2, y, (az + bz) / 2, len + width * 0.5, 0.8, width, col, rot, a); continue; }
      const [on, off, shift] = dash, per = on + off;
      for (let s = ((shift % per) + per) % per - per; s < len; s += per) {
        const s0 = Math.max(0, s), s1 = Math.min(len, s + on);
        if (s1 <= s0) continue;
        const m = (s0 + s1) / 2 / len;
        ovSeg.add(ax + (bx - ax) * m, y, az + (bz - az) * m, s1 - s0, 0.8, width, col, rot, a);
      }
    }
  },
  setUnits: syncUnits,
  render(now) {
    const night = typeof isNight === 'function' && isNight();
    if (night !== nightNow) {
      nightNow = night;
      hemi.intensity = night ? 0.85 : 1.15; hemi.color.set(night ? '#8fa6e8' : '#e4eeff');
      sun.intensity = night ? 0.9 : 2.1; sun.color.set(night ? '#a9bcff' : '#fff1d6');
      mapGroup.userData.bMat.emissiveIntensity = night ? 1.6 : 0;
      scene.background.set('#000000'); scene.fog.color.copy(scene.background);
    }
    syncProps();
    ovFill.done(); ovRing.done(); ovSeg.done();
    if (waterTex) waterTex.offset.set(now * 0.000012, now * 0.000021);
    renderer.render(scene, camera);
  },
  project, pick, heightAt,
  // 拖曳地圖時，垂直方向每個像素對應的地圖距離比水平大（因為鏡頭是斜的）
  panKY() { return 1 / Math.sin(elev.v); },
  // 目前畫面四個角落對應的地圖座標（小地圖的視野框）
  corners() { const [vw, vh] = viewSize(); return [pick(0, 0), pick(vw, 0), pick(vw, vh), pick(0, vh)]; },
  get scene() { return scene; },
  show(on) { if (glCanvas) glCanvas.style.display = on ? 'block' : 'none'; },
};
window.R3D = API;
API.ready = true;
