// ===== 環島富豪 3D：畫面、Three.js 建模、NPC 與線上連線 =====
// 規則在 logic.js（window.RICH）。線上對戰：房主的瀏覽器執行規則，透過 PeerJS（WebRTC 點對點）把遊戲狀態傳給其他玩家。
import * as THREE from '../vendor/three.min.js';

const R = window.RICH;
const $ = s => document.querySelector(s);
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
    const tone = (f, d, at = 0, type = 'triangle', v = 0.16) => {
      const o = c.createOscillator(), gg = c.createGain();
      o.type = type; o.frequency.value = f;
      gg.gain.setValueAtTime(v, t + at);
      gg.gain.exponentialRampToValueAtTime(0.001, t + at + d);
      o.connect(gg); gg.connect(g); o.start(t + at); o.stop(t + at + d + 0.02);
    };
    if (kind === 'step') tone(660, 0.07, 0, 'sine', 0.07);
    else if (kind === 'dice') for (let k = 0; k < 6; k++) tone(180 + Math.random() * 220, 0.05, k * 0.06, 'square', 0.05);
    else if (kind === 'cash') { tone(988, 0.12); tone(1319, 0.2, 0.09); }
    else if (kind === 'pay') { tone(392, 0.15); tone(262, 0.25, 0.12); }
    else if (kind === 'build') { tone(523, 0.1); tone(659, 0.1, 0.08); tone(784, 0.2, 0.16); }
    else if (kind === 'card') { tone(880, 0.08); tone(1175, 0.15, 0.07); }
    else if (kind === 'god') { tone(659, 0.12); tone(880, 0.12, 0.08); tone(1319, 0.24, 0.16); }
    else if (kind === 'badgod') { tone(330, 0.18, 0, 'sawtooth', 0.08); tone(220, 0.28, 0.14, 'sawtooth', 0.08); }
    else if (kind === 'seize') { tone(440, 0.1); tone(587, 0.12, 0.08); tone(880, 0.22, 0.16); }
    else if (kind === 'news') { tone(784, 0.07, 0, 'sine', 0.09); tone(1046, 0.14, 0.07, 'sine', 0.09); }
    else if (kind === 'turn') tone(587, 0.12, 0, 'sine', 0.09);
    else if (kind === 'bad') tone(220, 0.3, 0, 'sawtooth', 0.08);
  } catch (e) { /* 忽略 */ }
}
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); }, { passive: true }));

// ============================================================ 3D 場景與 56 格台灣島內環島座標
const TILE_SIZE = 6.0;
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#071a2d');
scene.fog = new THREE.Fog('#071a2d', 420, 960);

const camera = new THREE.PerspectiveCamera(42, 1, 1, 2400);
scene.add(new THREE.HemisphereLight('#f2f8ff', '#2c4234', 1.25));
const sun = new THREE.DirectionalLight('#fff4df', 2.35);
sun.position.set(-90, 175, 110);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -130, right: 105, top: 140, bottom: -140, near: 10, far: 540 });
scene.add(sun);

// 40 點台灣本島精細海岸線 [lon, lat]
const TW_POLY = [
  [121.53, 25.32], [121.70, 25.25], [121.88, 25.15], [122.02, 25.00],
  [121.88, 24.84], [121.86, 24.64], [121.88, 24.46], [121.76, 24.26],
  [121.66, 24.06], [121.64, 23.90], [121.58, 23.66], [121.52, 23.42],
  [121.42, 23.10], [121.26, 22.86], [121.16, 22.68], [121.04, 22.46],
  [120.95, 22.24], [120.92, 22.02], [120.88, 21.86], [120.72, 21.90],
  [120.66, 22.08], [120.60, 22.28], [120.50, 22.42], [120.36, 22.52],
  [120.22, 22.64], [120.14, 22.84], [120.06, 23.04], [120.02, 23.24],
  [120.06, 23.44], [120.10, 23.64], [120.12, 23.86], [120.26, 24.06],
  [120.42, 24.26], [120.54, 24.44], [120.66, 24.62], [120.82, 24.82],
  [120.96, 24.98], [121.14, 25.12], [121.34, 25.22], [121.44, 25.28],
];
const twXZ = (lon, lat) => [(lon - 121.0) * 68, -(lat - 23.62) * 62];

// 56 格直接落於台灣本島／離島地理路徑上 [lon, lat, 地形高程]（完全廢除方形外框）
const ROUTE_COORDS = [
  // 0..11：南台灣鵝鑾鼻 → 屏東・高雄・台南・嘉義（順時針北上）
  [120.84, 21.92, 1.5], // 0 起點（鵝鑾鼻）
  [120.73, 22.04, 1.5], // 1 墾丁
  [120.68, 22.19, 1.5], // 2 恆春
  [120.61, 22.34, 1.5], // 3 命運
  [120.49, 22.51, 1.5], // 4 屏東
  [120.34, 22.63, 1.5], // 5 高鐵左營
  [120.20, 22.74, 1.5], // 6 高雄
  [120.24, 22.91, 1.5], // 7 台南
  [120.10, 23.02, 1.5], // 8 機會
  [120.11, 23.18, 1.5], // 9 安平
  [120.26, 23.29, 1.5], // 10 道具屋
  [120.42, 23.41, 1.5], // 11 嘉義
  // 12..27：阿里山・雲嘉・澎湖跨海・彰化鹿港・日月潭・中彰投苗竹
  [120.59, 23.45, 1.8], // 12 監獄
  [120.77, 23.56, 2.4], // 13 阿里山
  [120.45, 23.62, 1.5], // 14 雲林
  [120.18, 23.65, 1.5], // 15 北港廟宇
  [119.74, 23.70, 1.5], // 16 澎湖（外海群島）
  [120.21, 23.91, 1.5], // 17 彰化
  [120.38, 24.06, 1.5], // 18 鹿港
  [120.53, 24.02, 1.5], // 19 台中高鐵
  [120.88, 23.80, 2.1], // 20 日月潭
  [120.99, 23.96, 1.8], // 21 醫院
  [120.76, 24.08, 1.6], // 22 南投
  [120.64, 24.23, 1.5], // 23 台中
  [120.49, 24.32, 1.5], // 24 機會
  [120.78, 24.46, 1.6], // 25 苗栗
  [120.92, 24.64, 1.5], // 26 新竹
  [120.86, 24.80, 1.5], // 27 命運
  // 28..39：雪霸公園・竹科・桃園機場・金門外海・大台北都會區
  [121.08, 24.52, 2.1], // 28 國家公園
  [121.09, 24.75, 1.5], // 29 竹科
  [121.22, 24.90, 1.5], // 30 桃園
  [121.13, 25.06, 1.5], // 31 桃園機場
  [120.62, 25.24, 1.5], // 32 金門（西北外海）
  [121.38, 25.21, 1.5], // 33 淡水
  [121.34, 25.03, 1.5], // 34 道具屋
  [121.48, 24.85, 1.6], // 35 新北
  [121.52, 25.02, 1.5], // 36 行天宮
  [121.55, 25.22, 1.7], // 37 機會
  [121.70, 25.19, 1.5], // 38 台北
  [121.66, 24.99, 1.5], // 39 信義區
  // 40..55：基隆港・九份・宜蘭・太魯閣・花蓮・台東・綠島蘭嶼南迴
  [121.82, 25.14, 1.5], // 40 入獄
  [121.95, 25.01, 1.5], // 41 基隆港
  [121.83, 24.87, 1.7], // 42 九份
  [121.68, 24.81, 1.5], // 43 國稅局
  [121.78, 24.63, 1.5], // 44 宜蘭
  [121.66, 24.47, 1.5], // 45 羅東
  [121.76, 24.30, 1.5], // 46 命運
  [121.42, 24.22, 1.9], // 47 迎神殿
  [121.58, 24.06, 1.7], // 48 太魯閣
  [121.54, 23.86, 1.5], // 49 花蓮
  [121.38, 23.62, 1.6], // 50 道具屋
  [121.26, 23.16, 1.5], // 51 台東
  [121.14, 22.84, 1.5], // 52 機會
  [121.64, 22.80, 1.5], // 53 綠島（東南外海）
  [121.68, 22.14, 1.5], // 54 蘭嶼（東南外海）
  [120.94, 22.28, 1.5], // 55 命運
];
const SEA_SEGMENTS = new Set([15, 16, 31, 32, 52, 53, 54]); // 跨海橋樑／航道區段
const TILE_PTS = ROUTE_COORDS.map(([lon, lat, elev]) => {
  const [x, z] = twXZ(lon, lat);
  return new THREE.Vector3(x, elev, z);
});
function tilePos(i) { return TILE_PTS[i].clone(); }
function tileAngle(i) {
  const a = TILE_PTS[(i + 55) % 56], b = TILE_PTS[(i + 1) % 56];
  return Math.atan2(b.x - a.x, b.z - a.z);
}
function inward(i) {
  const p = TILE_PTS[i];
  const v = new THREE.Vector3(-p.x, 0, 8 - p.z);
  return v.lengthSq() > 0.01 ? v.normalize() : new THREE.Vector3(0, 0, -1);
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

const TYPE_STYLE = {
  start: ['#fff3c4', '#c0392b', '起點', '領 $2000'],
  chance: ['#fff1d6', '#e67e22', '機會', '抽卡試運'],
  fate: ['#e8f0ff', '#2f6fd6', '命運', '突發事件'],
  tax: ['#f1f1f1', '#555e68', '國稅局', '繳 10%'],
  jail: ['#e9e9e9', '#444', '監獄', '探監路過'],
  gojail: ['#ffe2e2', '#b0302a', '入獄', '直接拘留'],
  park: ['#e2f6e0', '#2f8f46', '國家公園', '休養賞景'],
  shop: ['#f4e6ff', '#8a49c8', '道具屋', '免費＋購買'],
  temple: ['#ffe9e3', '#c0392b', '', '求神祈福'],
  hospital: ['#eef8ff', '#e74c3c', '醫院', '就醫休養'],
  station: ['#eef2f6', '#334155', '', '交通轉運'],
};

const board = new THREE.Group();
scene.add(board);
const animProps = []; // 需要持續旋轉或浮動動畫的精緻 3D 元件

function tree(scale = 1, color = '#2f7d3b') {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.42 * scale, 1.8 * scale, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 }));
  trunk.position.y = 0.9 * scale;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7 * scale, 2.5 * scale, 7), new THREE.MeshStandardMaterial({ color, flatShading: true }));
  c1.position.y = 2.6 * scale;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.25 * scale, 2.2 * scale, 7), new THREE.MeshStandardMaterial({ color: '#3b9648', flatShading: true }));
  c2.position.y = 3.8 * scale;
  g.add(trunk, c1, c2);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function palmTree(scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#8a623c', roughness: 0.9 });
  for (let s = 0; s < 4; s++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry((0.28 - s * 0.04) * scale, (0.34 - s * 0.04) * scale, 0.9 * scale, 6), mat);
    seg.position.set(s * 0.14 * scale, (0.45 + s * 0.85) * scale, 0);
    seg.rotation.z = -0.09 * s; g.add(seg);
  }
  const leafM = new THREE.MeshStandardMaterial({ color: '#2ea043', side: THREE.DoubleSide, roughness: 0.7 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.45 * scale, 2.1 * scale, 4), leafM);
    frond.position.set(0.42 * scale + Math.cos(a) * 0.85 * scale, 3.6 * scale, Math.sin(a) * 0.85 * scale);
    frond.rotation.order = 'YXZ';
    frond.rotation.y = -a;
    frond.rotation.z = -Math.PI * 0.62;
    g.add(frond);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 3D 立體台灣本島、山脈、河川、離島與環島公路 ----------
function buildIslandBase(x, z, rx, rz, color = '#388e4b', hasLighthouse = false) {
  const g = new THREE.Group();
  const reef = new THREE.Mesh(new THREE.CylinderGeometry(rx + 3.4, rx + 4.4, 0.35, 18), new THREE.MeshStandardMaterial({ color: '#1b7a9c', roughness: 0.45 }));
  reef.scale.set(1, 1, rz / rx); reef.position.y = -0.05;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(rx + 1.4, rx + 2.1, 0.55, 14), new THREE.MeshStandardMaterial({ color: '#d7c38a', roughness: 0.9 }));
  sand.scale.set(1, 1, rz / rx); sand.position.y = 0.25;
  const turf = new THREE.Mesh(new THREE.CylinderGeometry(rx, rx * 1.06, 0.85, 12), new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
  turf.scale.set(1, 1, rz / rx); turf.position.y = 0.85; turf.castShadow = true; turf.receiveShadow = true;
  g.add(reef, sand, turf);
  if (hasLighthouse) {
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 2.8, 10), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    lh.position.set(rx * 0.45, 2.6, -rz * 0.25); lh.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#f1c40f' }));
    top.position.set(rx * 0.45, 4.1, -rz * 0.25);
    g.add(lh, top);
  }
  g.position.set(x, 0, z);
  return g;
}

function makeBridgeSegment(a, b, isSea) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const yaw = Math.atan2(dir.x, dir.z);

  if (isSea) {
    // 跨海大橋（雙橋塔＋紅白斜張鋼纜＋橋面）
    const deckY = 1.15;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, len), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 }));
    deck.position.set(mid.x, deckY, mid.z); deck.rotation.y = yaw; deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.38, len * 0.94), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0c4a6e' }));
    stripe.position.set(mid.x, deckY + 0.02, mid.z); stripe.rotation.y = yaw;
    g.add(stripe);

    const pylonM = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 });
    const archM = new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.45 });
    for (const frac of [0.34, 0.66]) {
      const p = new THREE.Vector3().lerpVectors(a, b, frac);
      const pylon = new THREE.Group();
      for (const s of [-0.95, 0.95]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 5.2, 8), pylonM);
        leg.position.set(s, 2.3, 0); pylon.add(leg);
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 1.4, 8), new THREE.MeshStandardMaterial({ color: '#64748b' }));
        pier.position.set(s, 0.2, 0); pylon.add(pier);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.35, 0.35), archM);
      beam.position.y = 4.4; pylon.add(beam);
      pylon.position.set(p.x, 0, p.z); pylon.rotation.y = yaw;
      pylon.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(pylon);
    }
  } else {
    // 環島雙線柏油公路＋金色中央虛線（貼齊地表與台地不陷入地形）
    const roadY = Math.max(1.44, (a.y + b.y) * 0.5 - 0.02);
    const road = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.22, len), new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.9 }));
    road.position.set(mid.x, roadY, mid.z); road.rotation.y = yaw; road.receiveShadow = true;
    g.add(road);
    const steps = Math.max(2, Math.floor(len / 2.3));
    const dashM = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#594200' });
    for (let s = 1; s < steps; s++) {
      const frac = s / steps;
      const p = new THREE.Vector3().lerpVectors(a, b, frac);
      const dy = Math.max(1.46, p.y);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.9), dashM);
      dash.position.set(p.x, dy, p.z); dash.rotation.y = yaw;
      g.add(dash);
    }
  }
  return g;
}

function buildTaiwanIsland() {
  const tw = new THREE.Group();

  // 無邊際漸層深海（大型圓盤，完全消除方形邊界感）
  const deepSea = new THREE.Mesh(
    new THREE.CylinderGeometry(460, 460, 0.8, 64),
    new THREE.MeshStandardMaterial({ color: '#072238', roughness: 0.55, metalness: 0.15 })
  );
  deepSea.position.y = -0.8; deepSea.receiveShadow = true;
  tw.add(deepSea);

  // 台灣本島外輪廓 Shape（XY 平面，旋轉 -90° 後對應 XZ 世界座標）
  const shape = new THREE.Shape();
  TW_POLY.forEach(([lon, lat], k) => {
    const [x, z] = twXZ(lon, lat);
    const sx = x, sy = -z;
    if (k === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
  });
  shape.closePath();

  // 1) 淺海大陸棚與珊瑚礁浪花環
  const shelfGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 6.2, bevelSegments: 2 });
  const shelf = new THREE.Mesh(shelfGeo, new THREE.MeshStandardMaterial({ color: '#0d4a6e', roughness: 0.4, metalness: 0.1 }));
  shelf.rotation.x = -Math.PI / 2; shelf.position.y = -0.45; shelf.receiveShadow = true;
  tw.add(shelf);

  const surfGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 2.8, bevelSegments: 2 });
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ color: '#218ca8', roughness: 0.45 }));
  surf.rotation.x = -Math.PI / 2; surf.position.y = -0.22; surf.receiveShadow = true;
  tw.add(surf);

  // 2) 金色海岸沙灘層
  const beachGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.72, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 1.4, bevelSegments: 2 });
  const beach = new THREE.Mesh(beachGeo, new THREE.MeshStandardMaterial({ color: '#d8c58d', roughness: 0.92 }));
  beach.rotation.x = -Math.PI / 2; beach.position.y = 0.06; beach.receiveShadow = true;
  tw.add(beach);

  // 3) 翠綠本島平原層（主地表 top y = 1.35）
  const landGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.35, bevelSegments: 2 });
  const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({ color: '#37914c', roughness: 0.85 }));
  land.rotation.x = -Math.PI / 2; land.position.y = 0.25; land.castShadow = true; land.receiveShadow = true;
  tw.add(land);

  // 4) 中央山地丘陵台地（top y = 1.72）
  const plateau = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.19, bevelSize: 0.2, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: '#2b753f', roughness: 0.88 })
  );
  plateau.rotation.x = -Math.PI / 2;
  plateau.scale.set(0.46, 0.56, 1);
  plateau.position.set(1.5, 1.15, 3.0);
  plateau.castShadow = true; plateau.receiveShadow = true;
  tw.add(plateau);

  // 5) 玉山・雪山・中央山脈・大霸尖山・海岸山脈精細峰群
  const peaks = [
    [121.34, 24.48, 4.8, 7.6, '#2b6a3c', false, 'cone'], // 南湖大山
    [121.22, 24.38, 4.4, 8.2, '#5a6b5c', true, 'dabajian'], // 大霸尖山
    [121.18, 24.06, 5.8, 9.8, '#367544', false, 'cone'], // 合歡群峰
    [121.12, 23.82, 5.4, 9.4, '#3d7a4a', false, 'cone'], // 奇萊能高
    [121.10, 23.48, 7.0, 14.5, '#467d50', true, 'yushan'], // 玉山主峰（雪頂）
    [121.02, 23.18, 5.6, 8.8, '#346f42', false, 'cone'], // 關山
    [120.94, 22.82, 4.8, 7.2, '#2d683b', false, 'cone'], // 北大武山
    [121.48, 23.78, 4.2, 6.6, '#2a6339', false, 'cone'], // 海岸山脈北段
    [121.34, 23.42, 4.0, 5.8, '#2a6339', false, 'cone'], // 海岸山脈南段
  ];
  for (const [lon, lat, r, h, col, snow, kind] of peaks) {
    const [x, z] = twXZ(lon, lat);
    const m = new THREE.Mesh(
      kind === 'dabajian' ? new THREE.CylinderGeometry(r * 0.42, r * 0.85, h, 7) : new THREE.ConeGeometry(r, h, 7),
      new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.9 })
    );
    m.position.set(x, 1.65 + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    tw.add(m);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.34, 7), new THREE.MeshStandardMaterial({ color: '#f3f7fa', flatShading: true }));
      cap.position.set(x, 1.65 + h * 0.85, z);
      tw.add(cap);
    }
  }

  // 6) 日月潭湛藍高山湖泊＋拉魯小島
  const [smlX, smlZ] = twXZ(120.91, 23.84);
  const lake = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.24, 18), new THREE.MeshStandardMaterial({ color: '#2ca6e0', roughness: 0.22, metalness: 0.1 }));
  lake.scale.set(1.25, 1, 0.88); lake.position.set(smlX, 1.78, smlZ);
  const lalu = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 6), new THREE.MeshStandardMaterial({ color: '#39884f', flatShading: true }));
  lalu.position.set(smlX - 0.5, 2.08, smlZ);
  tw.add(lake, lalu);

  // 7) 台灣主要水系（淡水河、濁水溪、高屏溪、蘭陽溪、秀姑巒溪）
  const riverM = new THREE.MeshStandardMaterial({ color: '#2ea7de', roughness: 0.25 });
  const rivers = [
    [[121.48, 25.00], [121.38, 25.18]], // 淡水河
    [[120.52, 23.80], [120.14, 23.82]], // 濁水溪下段
    [[120.60, 22.82], [120.38, 22.44]], // 高屏溪
    [[121.56, 24.60], [121.84, 24.72]], // 蘭陽溪
    [[121.38, 23.46], [121.52, 23.48]], // 秀姑巒溪
  ];
  for (const [[lo1, la1], [lo2, la2]] of rivers) {
    const [x1, z1] = twXZ(lo1, la1), [x2, z2] = twXZ(lo2, la2);
    const len = Math.hypot(x2 - x1, z2 - z1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, len), riverM);
    seg.position.set((x1 + x2) / 2, 1.38, (z1 + z2) / 2);
    seg.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    tw.add(seg);
  }

  // 8) 立體離島群島（緊密對應 16澎湖 / 32金門 / 53綠島 / 54蘭嶼 ＋ 馬祖裝飾）
  const [phX, phZ] = twXZ(119.74, 23.70);
  tw.add(buildIslandBase(phX, phZ, 5.8, 7.6, '#398f52'));
  tw.add(buildIslandBase(phX - 5.2, phZ + 5.8, 2.4, 2.2, '#398f52')); // 望安七美小島

  const [kmX, kmZ] = twXZ(120.62, 25.24);
  tw.add(buildIslandBase(kmX, kmZ, 5.6, 4.4, '#3e8c4c'));

  const [mzX, mzZ] = twXZ(121.12, 25.44); // 馬祖裝飾島與燈塔
  tw.add(buildIslandBase(mzX, mzZ, 3.0, 2.4, '#39884f', true));

  const [gdX, gdZ] = twXZ(121.64, 22.80);
  tw.add(buildIslandBase(gdX, gdZ, 4.8, 4.5, '#358e4c'));

  const [lyX, lyZ] = twXZ(121.68, 22.14);
  tw.add(buildIslandBase(lyX, lyZ, 5.1, 4.8, '#2f7f45'));

  // 9) 中央山麓林木點綴
  for (const [lon, lat] of [[121.16, 24.28], [121.02, 23.36], [120.88, 23.02], [121.40, 23.94], [121.24, 23.62], [121.56, 24.42]]) {
    const [x, z] = twXZ(lon, lat);
    const tr = tree(0.85); tr.position.set(x, 1.5, z); tw.add(tr);
  }

  // 10) 海面「環島富豪 3D」燙金羅盤徽章
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 13),
    new THREE.MeshBasicMaterial({
      transparent: true,
      map: canvasTex(768, 280, (c, w, h) => {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 100px "PingFang TC","Noto Sans TC",sans-serif';
        c.fillStyle = 'rgba(255, 218, 110, 0.92)'; c.fillText('環島富豪', w / 2, h * 0.40);
        c.font = '700 40px "PingFang TC","Noto Sans TC",sans-serif';
        c.fillStyle = 'rgba(175, 225, 255, 0.85)'; c.fillText('TAIWAN 3D TYCOON', w / 2, h * 0.78);
      }),
    })
  );
  banner.rotation.x = -Math.PI / 2;
  banner.position.set(-70, 0.1, 76);
  tw.add(banner);

  // 11) 56 格環島公路與跨海大橋路網
  for (let i = 0; i < 56; i++) {
    tw.add(makeBridgeSegment(TILE_PTS[i], TILE_PTS[(i + 1) % 56], SEA_SEGMENTS.has(i)));
  }

  board.add(tw);
}

// ---------- 56 格台灣各地標與精緻微景觀建模 ----------
function makePagodaOrTower(colMain, colRoof, layers = 3) {
  const g = new THREE.Group();
  const baseM = new THREE.MeshStandardMaterial({ color: colMain, roughness: 0.55 });
  const roofM = new THREE.MeshStandardMaterial({ color: colRoof, roughness: 0.45 });
  for (let k = 0; k < layers; k++) {
    const s = 1 - k * 0.18;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.95 * s, 1.05 * s, 0.9, 8), baseM);
    b.position.y = 0.45 + k * 1.15;
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.45 * s, 0.55, 8), roofM);
    r.position.y = 1.05 + k * 1.15;
    g.add(b, r);
  }
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.8, 6), new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6 }));
  sp.position.y = 1.15 * layers + 0.45; g.add(sp);
  return g;
}

function makeWindTurbine() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.22, 4.2, 8), white);
  mast.position.y = 2.1; g.add(mast);
  const hub = new THREE.Group(); hub.position.set(0, 4.15, 0.2);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), white); hub.add(nose);
  for (let k = 0; k < 3; k++) {
    const piv = new THREE.Group(); piv.rotation.z = (k * Math.PI * 2) / 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.06), white);
    b.position.y = 0.88; piv.add(b); hub.add(piv);
  }
  g.add(hub);
  animProps.push(now => { hub.rotation.z = now * 0.0022; });
  return g;
}

function makeTileProp(t) {
  const g = new THREE.Group();
  const nm = t.name;

  if (nm === '信義區') {
    // 台北 101 精細建模（裙樓＋8節竹節塔身＋金飾＋尖塔＋閃燈）
    const glass = new THREE.MeshStandardMaterial({ color: '#3db8a4', metalness: 0.35, roughness: 0.22 });
    const gold = new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#6e5200', metalness: 0.65 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.8), glass);
    base.position.y = 0.8; g.add(base);
    for (let k = 0; k < 7; k++) {
      const s = 1 - k * 0.055;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.18 * s, 0.94 * s, 1.15, 4), glass);
      seg.rotation.y = Math.PI / 4; seg.position.y = 2.15 + k * 1.12; g.add(seg);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 0.14, 1.7 * s), gold);
      ring.position.y = 2.68 + k * 1.12; g.add(ring);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 2.8, 6), gold);
    spire.position.y = 11.2; g.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#ff5252', emissive: '#ff1744' }));
    beacon.position.y = 12.6; g.add(beacon);
    animProps.push(now => { beacon.scale.setScalar(0.85 + Math.sin(now * 0.006) * 0.3); });
  } else if (nm === '台北') {
    // 中正紀念堂（白玉基座＋八角藍瓦寶頂）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.65, 3.0), new THREE.MeshStandardMaterial({ color: '#f1f5f9' }));
    base.position.y = 0.32;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.5, 2.1), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    hall.position.y = 1.4;
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 }));
    r1.position.y = 2.65;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.4 }));
    r2.position.y = 3.45;
    g.add(base, hall, r1, r2);
  } else if (nm === '高雄') {
    // 高雄 85 大樓（雙塔撐起高空主樓＋金頂尖塔）
    const bm = new THREE.MeshStandardMaterial({ color: '#5d8eb8', metalness: 0.4, roughness: 0.28 });
    for (const dx of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.0, 1.2), bm);
      leg.position.set(dx, 2.0, 0); g.add(leg);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 1.2), bm); mid.position.y = 5.4;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 4), new THREE.MeshStandardMaterial({ color: '#f39c12', metalness: 0.5 }));
    top.rotation.y = Math.PI / 4; top.position.y = 7.9;
    g.add(mid, top);
  } else if (t.type === 'start') {
    // 鵝鑾鼻燈塔＋紅色環島拱門＋南國椰子樹
    const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
    lhBase.position.y = 0.3;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 3.8, 12), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    body.position.y = 2.4;
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 12), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    balcony.position.y = 4.25;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.75, 12), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15', emissiveIntensity: 0.8 }));
    lamp.position.y = 4.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.85, 12), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    roof.position.y = 5.45;
    const palm = palmTree(0.65); palm.position.set(1.6, 0, 0.6);
    g.add(lhBase, body, balcony, lamp, roof, palm);
  } else if (nm === '阿里山') {
    // 阿里山森林小火車＋千年神木
    const tr = tree(1.1, '#1e5e32'); tr.position.set(-1.1, 0, -0.4);
    const loco = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    loco.position.set(0.8, 0.65, 0.6);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.35, 1.0), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
    cab.position.set(0.25, 0.9, 0.6);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#1e293b' }));
    chimney.position.set(1.35, 1.4, 0.6);
    g.add(tr, loco, cab, chimney);
  } else if (nm === '日月潭') {
    // 慈恩寶塔＋湛藍湖艇
    g.add(makePagodaOrTower('#fde68a', '#b91c1c', 4));
  } else if (nm === '竹科') {
    // 半導體晶圓廠＋發光青色晶圓圓盤
    const fab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.7, 2.0), new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.3 }));
    fab.position.y = 0.85;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.22, 2.1), new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#0891b2' }));
    glow.position.y = 1.45;
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.12, 18), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', metalness: 0.8 }));
    wafer.rotation.x = Math.PI / 2; wafer.position.y = 2.65;
    animProps.push(now => { wafer.rotation.z = now * 0.002; });
    g.add(fab, glow, wafer);
  } else if (nm === '太魯閣') {
    // 東西橫貫公路牌樓＋雙側大理石峽谷岩壁
    const cliffM = new THREE.MeshStandardMaterial({ color: '#cbd5e1', flatShading: true });
    for (const sx of [-1.45, 1.45]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.8, 5), cliffM); c.position.set(sx, 1.9, -0.3); g.add(c);
    }
    const redM = new THREE.MeshStandardMaterial({ color: '#c0392b' });
    for (const dx of [-0.7, 0.7]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.4, 8), redM);
      col.position.set(dx, 1.2, 0.4); g.add(col);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 0.85), new THREE.MeshStandardMaterial({ color: '#15803d' }));
    roof.position.set(0, 2.45, 0.4); g.add(roof);
  } else if (nm === '九份') {
    // 山城階梯茶樓＋成排紅燈籠
    const wood = new THREE.MeshStandardMaterial({ color: '#78350f' });
    const tile = new THREE.MeshStandardMaterial({ color: '#334155' });
    for (let k = 0; k < 3; k++) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(2.6 - k * 0.5, 0.85, 1.8 - k * 0.35), wood);
      tier.position.set(0, 0.45 + k * 0.9, -0.2);
      const r = new THREE.Mesh(new THREE.ConeGeometry(2.0 - k * 0.35, 0.55, 4), tile);
      r.rotation.y = Math.PI / 4; r.position.set(0, 1.1 + k * 0.9, -0.2);
      g.add(tier, r);
    }
    for (const lx of [-0.8, 0, 0.8]) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c' }));
      lan.position.set(lx, 1.35, 0.85); g.add(lan);
    }
  } else if (nm === '台南' || nm === '安平') {
    // 赤崁樓／安平古堡紅樓雙簷＋瞭望台
    const brick = new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: '#fef3c7' });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.0), brick); b1.position.y = 0.6;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.5), nm === '安平' ? white : brick); b2.position.y = 1.75;
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.0, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    r.rotation.y = Math.PI / 4; r.position.y = 2.75;
    g.add(b1, b2, r);
  } else if (nm === '台東') {
    // 台東鹿野熱氣球（緩緩上下浮動）
    const bal = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshStandardMaterial({ color: '#fb7185' }));
    env.scale.set(0.95, 1.25, 0.95); env.position.y = 2.6;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.14, 6, 16), new THREE.MeshStandardMaterial({ color: '#facc15' }));
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 2.65;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: '#92400e' }));
    basket.position.y = 0.9;
    bal.add(env, stripe, basket); g.add(bal);
    animProps.push(now => { bal.position.y = 0.35 + Math.sin(now * 0.0028) * 0.45; });
  } else if (nm === '澎湖' || nm === '綠島' || nm === '蘭嶼' || nm === '彰化') {
    // 澎湖／綠島／彰化濱海白色風力發電機
    g.add(makeWindTurbine());
  } else if (nm === '淡水') {
    // 淡水情人橋白色斜張塔
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3.8, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    mast.position.set(0, 1.8, 0); mast.rotation.z = -0.35;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.8), new THREE.MeshStandardMaterial({ color: '#94a3b8' }));
    deck.position.y = 0.45;
    g.add(mast, deck);
  } else if (nm === '墾丁' || nm === '恆春' || nm === '屏東') {
    // 熱帶椰子樹＋古城磚門
    const p1 = palmTree(0.85); p1.position.set(-0.5, 0, 0);
    const p2 = palmTree(0.65); p2.position.set(0.8, 0, 0.3);
    g.add(p1, p2);
  } else if (t.type === 'temple') {
    // 台灣傳統燕尾飛簷宮廟＋雙紅燈籠＋天公爐
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.5, 2.0), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    base.position.y = 0.75;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.2, 4), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 0.85, 0.85); roof.position.y = 2.0;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: '#f1c40f' }));
    ridge.position.y = 2.55;
    g.add(base, roof, ridge);
    for (const x of [-1.05, 1.05]) {
      const lt = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshStandardMaterial({ color: '#ff4757', emissive: '#b31b24' }));
      lt.position.set(x, 1.5, 1.05); g.add(lt);
    }
  } else if (t.type === 'hospital') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 2.0), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    b.position.y = 1.25;
    const red = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#7f1d1d' });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.16), red); c1.position.set(0, 1.75, 1.05);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.16), red); c2.position.set(0, 1.75, 1.05);
    g.add(b, c1, c2);
  } else if (t.type === 'shop') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 1.9), new THREE.MeshStandardMaterial({ color: '#fde68a' }));
    body.position.y = 0.9;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.32, 1.1), new THREE.MeshStandardMaterial({ color: '#9333ea' }));
    awning.position.set(0, 1.75, 0.9); awning.rotation.x = 0.28;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 0.25), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#6e5200' }));
    sign.position.set(0, 2.25, 0);
    g.add(body, awning, sign);
  } else if (t.type === 'jail') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.4), new THREE.MeshStandardMaterial({ color: '#64748b' }));
    wall.position.set(0, 1.0, -0.5); g.add(wall);
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.7 }));
      bar.position.set(k * 0.62, 1.3, 0.35); g.add(bar);
    }
  } else if (t.type === 'gojail') {
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 1.8), new THREE.MeshStandardMaterial({ color: '#1e293b' }));
    booth.position.y = 1.0;
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c' }));
    l1.position.set(-0.48, 2.2, 0);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#1d4ed8' }));
    l2.position.set(0.48, 2.2, 0);
    g.add(booth, l1, l2);
  } else if (t.type === 'park') {
    const tr = tree(0.85); tr.position.set(-1.1, 0, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.95, 6), new THREE.MeshStandardMaterial({ color: '#16a34a' }));
    roof.position.set(0.85, 2.0, 0);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.4, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#b77944', side: THREE.DoubleSide }));
    col.position.set(0.85, 0.7, 0);
    g.add(tr, roof, col);
  } else if (t.type === 'tax') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 1.8), new THREE.MeshStandardMaterial({ color: '#94a3b8' }));
    b.position.y = 0.95;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.25, 14), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 }));
    coin.rotation.x = Math.PI / 2; coin.position.y = 2.45;
    g.add(b, coin);
  } else if (t.type === 'station') {
    if (nm.includes('機場')) {
      const twr = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.0, 8), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
      twr.position.set(-1.0, 1.5, -0.3);
      const radar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7' }));
      radar.position.set(-1.0, 3.2, -0.3);
      animProps.push(now => { radar.rotation.y = now * 0.004; });
      const plane = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      plane.rotation.z = -Math.PI / 2; plane.position.set(0.7, 1.8, 0.4);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 2.4), new THREE.MeshStandardMaterial({ color: '#0ea5e9' }));
      wing.position.set(0.7, 1.8, 0.4);
      g.add(twr, radar, plane, wing);
    } else if (nm.includes('港')) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 1.3), new THREE.MeshStandardMaterial({ color: '#1e3a5f' }));
      hull.position.set(-0.2, 0.45, 0.2);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: '#f97316' }));
      cargo.position.set(0.2, 1.15, 0.2);
      const crane = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.7, 0.35), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
      crane.position.set(1.2, 1.35, -0.2);
      g.add(hull, cargo, crane);
    } else {
      // 高鐵 700T 流線型車頭
      const train = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.1), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      train.position.y = 0.55;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.24, 1.14), new THREE.MeshStandardMaterial({ color: '#f97316' }));
      stripe.position.y = 0.52;
      g.add(train, stripe);
    }
  } else if (t.type === 'chance' || t.type === 'fate') {
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.72, 0),
      new THREE.MeshStandardMaterial({ color: t.type === 'chance' ? '#f59e0b' : '#3b82f6', emissive: t.type === 'chance' ? '#92400e' : '#1e3a8a', roughness: 0.25 })
    );
    gem.position.y = 1.5; g.add(gem);
    animProps.push(now => { gem.rotation.y = now * 0.0025; gem.position.y = 1.45 + Math.sin(now * 0.004) * 0.22; });
  } else if (t.type === 'land') {
    // 其餘縣市特色街景樹／拱門微景觀
    const tr = tree(0.65, t.group ? R.GROUPS[t.group].color : '#3b944f');
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.4, 8), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    pillar.position.set(-0.9, 0.7, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), new THREE.MeshStandardMaterial({ color: R.GROUPS[t.group].color }));
    orb.position.set(-0.9, 1.55, 0);
    tr.position.set(0.6, 0, 0);
    g.add(pillar, orb, tr);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

(function buildBoard() {
  buildTaiwanIsland();

  R.BOARD.forEach((t, i) => {
    const gc = t.group ? R.GROUPS[t.group].color : null;
    const [bg, accent, label, sub] = TYPE_STYLE[t.type] || ['#fbf6ea', gc, t.name, '$' + t.price];
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      if (t.type === 'land') { c.fillStyle = gc; c.fillRect(0, 0, w, 66); }
      else { c.fillStyle = accent; c.fillRect(0, 0, w, 24); }
      c.strokeStyle = 'rgba(0,0,0,.32)'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#151922';
      const name = (t.type === 'land' || t.type === 'station' || t.type === 'temple') ? t.name : label;
      const fs = name.length >= 4 ? 50 : name.length === 3 ? 62 : 76;
      c.font = `900 ${fs}px "PingFang TC","Noto Sans TC",sans-serif`;
      c.fillText(name, w / 2, t.type === 'land' ? 132 : 118);
      c.font = '800 36px "PingFang TC","Noto Sans TC",sans-serif';
      c.fillStyle = t.type === 'land' ? '#5b4a2a' : accent;
      c.fillText(t.type === 'land' || t.type === 'station' ? '$' + t.price : sub, w / 2, t.type === 'land' ? 200 : 190);
    });

    const p = tilePos(i);
    // 精緻八角形石磚底座＋清晰正面字牌（文字統一朝向玩家視角，永不顛倒）
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(4.05, 4.45, 0.72, 8),
      new THREE.MeshStandardMaterial({ color: gc || accent || '#c4b596', roughness: 0.75 })
    );
    plinth.position.set(p.x, p.y - 0.36, p.z);
    plinth.rotation.y = Math.PI / 8;
    plinth.castShadow = true; plinth.receiveShadow = true;
    board.add(plinth);

    const edgeMat = new THREE.MeshStandardMaterial({ color: '#e6dcc5', roughness: 0.8 });
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE, 0.22, TILE_SIZE),
      [edgeMat, edgeMat, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), edgeMat, edgeMat, edgeMat]
    );
    tile.position.set(p.x, p.y + 0.08, p.z);
    tile.receiveShadow = true; tile.userData.i = i;
    board.add(tile);

    const prop = makeTileProp(t);
    if (prop.children.length) {
      prop.position.set(p.x - 1.5, p.y + 0.16, p.z - 2.35);
      prop.scale.setScalar(0.68);
      board.add(prop);
    }
  });
})();

// ---------- 精細 4 階地產建築（三合院平房 → 騎樓透天 → 現代公寓 → 摩天大樓）----------
const buildG = new THREE.Group();
scene.add(buildG);
let buildKey = '';

function houseMesh(level, color) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#f5ecd9', roughness: 0.78 });
  const brick = new THREE.MeshStandardMaterial({ color: '#b84a39', roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const win = new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#0c4a6e', roughness: 0.22 });
  if (level === 1) {
    // 1級平房：台灣紅磚三合院（正身＋左右護龍）
    const main = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.4), brick); main.position.set(0, 0.75, -0.35);
    const rMain = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), roof); rMain.position.set(0, 2.0, -0.35); rMain.rotation.y = Math.PI / 4;
    for (const dx of [-1.05, 1.05]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 1.3), brick); wing.position.set(dx, 0.55, 0.65);
      const rW = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 4), roof); rW.position.set(dx, 1.4, 0.65); rW.rotation.y = Math.PI / 4;
      g.add(wing, rW);
    }
    g.add(main, rMain);
  } else if (level === 2) {
    // 2級透天：台灣騎樓雙併透天＋垂直招牌
    for (const [x, h] of [[-1.0, 3.2], [1.05, 2.7]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 2.0), wall); b.position.set(x, h / 2, 0);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.0, 4), roof); r.position.set(x, h + 0.5, 0); r.rotation.y = Math.PI / 4;
      const bal = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.25, 0.4), roof); bal.position.set(x, h * 0.55, 1.05);
      g.add(b, r, bal);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.4, 0.45), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#785000' }));
    sign.position.set(-2.05, 2.0, 0.85); g.add(sign);
  } else if (level === 3) {
    // 3級公寓：五層現代住宅大樓＋陽台＋水塔
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 5.2, 2.5), wall); b.position.y = 2.6; g.add(b);
    for (let y = 0.9; y < 4.9; y += 1.2) {
      for (const x of [-0.95, 0, 0.95]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.14), win);
        w.position.set(x, y, 1.26); g.add(w);
      }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.35), roof);
      slab.position.set(0, y - 0.3, 1.32); g.add(slab);
    }
    const rf = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.4, 2.8), roof); rf.position.y = 5.4; g.add(rf);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10), new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.7 }));
    tank.position.set(0.95, 6.05, -0.45); g.add(tank);
  } else if (level === 4) {
    // 4級大樓：退縮式玻璃帷幕摩天大樓＋停機坪＋金頂天線
    const glass = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.45, roughness: 0.25 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.2, 3.5), glass); podium.position.y = 1.1; g.add(podium);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.8, 7.6, 2.8), glass); tower.position.y = 5.8; g.add(tower);
    for (let y = 2.6; y < 9.4; y += 1.05) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.42, 2.9), win);
      w.position.y = y; g.add(w);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 2.0), roof); crown.position.y = 10.2; g.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 2.5, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#695100' }));
    spire.position.y = 12.1; g.add(spire);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function syncBuildings() {
  const key = G.tiles.map(t => `${t.owner}:${t.level}`).join(',') + '|' + G.blocks.map(b => b.i).join(',');
  if (key === buildKey) return;
  buildKey = key;
  buildG.clear();
  G.tiles.forEach((s, i) => {
    const p = tilePos(i);
    if (s.owner != null) {
      const col = G.players[s.owner].color;
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(3.8, 4.45, 8),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })
      );
      halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI / 8;
      halo.position.set(p.x, p.y + 0.14, p.z); buildG.add(halo);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8), new THREE.MeshStandardMaterial({ color: '#eee' }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.1), new THREE.MeshStandardMaterial({ color: col }));
      const fx = p.x + 2.55, fz = p.z - 2.55;
      pole.position.set(fx, p.y + 1.55, fz); flag.position.set(fx + 0.65, p.y + 2.5, fz);
      buildG.add(pole, flag);
      if (s.level > 0) {
        const h = houseMesh(s.level, col);
        h.position.set(p.x + 1.45, p.y + 0.18, p.z - 1.95);
        h.scale.setScalar(0.76);
        buildG.add(h);
      }
    }
  });
  for (const b of G.blocks) {
    const p = tilePos(b.i);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
    cone.position.set(p.x, p.y + 1.4, p.z); cone.castShadow = true;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    bar.position.set(p.x, p.y + 0.9, p.z); bar.rotation.y = tileAngle(b.i) + Math.PI / 2;
    buildG.add(cone, bar);
  }
}

// ---------- 玩家 3D 造型棋子（精細五官、可動四肢、專屬帽飾配件與神明光環）----------
const tokens = [];
function makeToken(pl) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.42 });
  const skinM = new THREE.MeshStandardMaterial({ color: '#f5cfa8', roughness: 0.58 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#1f242b', roughness: 0.65 });
  const whiteM = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5 });

  // 專屬角色底座圓盤＋金色飾環
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.55, 0.28, 20), bodyM);
  base.position.y = 0.14; g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.08, 6, 24), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.5 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.26; g.add(rim);

  // 可動雙腳與鞋子
  const makeLeg = (x) => {
    const legG = new THREE.Group(); legG.position.set(x, 1.15, 0);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.65, 8), darkM);
    leg.position.y = -0.35;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.8), darkM);
    shoe.position.set(0, -0.78, 0.14);
    legG.add(leg, shoe); g.add(legG);
    return legG;
  };
  const leftLeg = makeLeg(-0.42), rightLeg = makeLeg(0.42);

  // 身體與領飾
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.08, 1.65, 16), bodyM);
  torso.position.y = 1.95; g.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.12, 6, 16), whiteM);
  collar.rotation.x = Math.PI / 2; collar.position.y = 2.75; g.add(collar);

  // 可動雙手與手套
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const armGeo = new THREE.CapsuleGeometry(0.24, 0.72, 4, 8);
  const la = new THREE.Mesh(armGeo, bodyM); la.position.y = -0.38;
  const lh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinM); lh.position.y = -0.85;
  leftArm.add(la, lh); leftArm.position.set(-1.1, 2.55, 0);
  const ra = new THREE.Mesh(armGeo, bodyM); ra.position.y = -0.38;
  const rh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinM); rh.position.y = -0.85;
  rightArm.add(ra, rh); rightArm.position.set(1.1, 2.55, 0);
  g.add(leftArm, rightArm);

  // 頭部、耳朵與表情（雙眼、腮紅、眉毛）
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 14), skinM);
  head.position.y = 3.72; g.add(head);
  for (const x of [-0.36, 0.36]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), darkM);
    eye.position.set(x, 3.84, 0.98); g.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.08), darkM);
    brow.position.set(x, 4.06, 0.96); g.add(brow);
    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshStandardMaterial({ color: '#fb7185' }));
    blush.scale.set(1.1, 0.65, 0.4); blush.position.set(x * 1.5, 3.58, 0.92); g.add(blush);
  }
  for (const sx of [-1.05, 1.05]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), skinM);
    ear.position.set(sx, 3.72, 0); g.add(ear);
  }

  // 角色專屬精細帽飾與手持配件
  const hatM = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.35 });
  const hat = R.CHARS[pl.char].hat;
  if (hat === 'cap') {
    // 阿凱：台灣黑熊胸前白 V＋黑熊耳棒球帽＋登山背包＋相機
    const vmark = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.18), whiteM);
    vmark.position.set(0, 2.25, 0.95); g.add(vmark);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM);
    cap.position.y = 4.02;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 1.0), hatM);
    visor.position.set(0, 4.05, 1.08);
    for (const ex of [-0.65, 0.65]) {
      const bEar = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), darkM);
      bEar.position.set(ex, 4.95, 0.1); g.add(bEar);
    }
    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 0.72), new THREE.MeshStandardMaterial({ color: '#334155' }));
    pack.position.set(0, 1.95, -0.95);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.28), darkM);
    cam.position.set(0, -0.9, 0.35); rightArm.add(cam);
    g.add(cap, visor, pack);
  } else if (hat === 'bow') {
    // 小晴：精細蝴蝶結貝雷帽＋有珍珠顆粒的珍珠奶茶
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.36, 16), hatM);
    beret.position.set(0, 4.65, -0.05); g.add(beret);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: '#f43f5e' }));
    knot.position.set(0, 4.95, 0.15); g.add(knot);
    for (const x of [-0.55, 0.55]) {
      const k = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#fb7185' }));
      k.position.set(x, 4.95, 0.15); k.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(k);
    }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.75, 10), new THREE.MeshStandardMaterial({ color: '#e6b88a' }));
    cup.position.set(0, -0.88, 0.42);
    const bobaBand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.21, 0.22, 10), darkM);
    bobaBand.position.set(0, -1.12, 0.42);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 6), darkM);
    straw.position.set(0, -0.35, 0.42);
    rightArm.add(cup, bobaBand, straw);
  } else if (hat === 'hat') {
    // 老陳：紳士高禮帽＋八字鬍＋領帶＋金扣公事包
    const tie = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    tie.rotation.x = Math.PI; tie.position.set(0, 2.25, 0.96); g.add(tie);
    const stache = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.15), darkM);
    stache.position.set(0, 3.48, 1.05); g.add(stache);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.65, 0.14, 20), darkM);
    brim.position.y = 4.55;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.2, 16), darkM);
    top.position.y = 5.18;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.5 }));
    band.position.y = 4.72;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.82, 1.05), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.45 }));
    bag.position.set(0, -1.0, 0.18);
    rightArm.add(bag);
    g.add(brim, top, band);
  } else {
    // 安娜：多尖寶石皇冠＋披風＋星芒權杖
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.72, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }));
    cr.position.y = 4.92;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#9f1239' }));
    gem.position.set(0, 5.25, 0.8); g.add(gem);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.95, 0.16), new THREE.MeshStandardMaterial({ color: '#991b1b' }));
    cape.position.set(0, 1.85, -0.95); cape.rotation.x = 0.16;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.6 }));
    staff.position.set(0, -0.25, 0.35);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15' }));
    orb.position.set(0, 1.4, 0.35);
    rightArm.add(staff, orb);
    g.add(cr, cape);
  }

  // 神明附身視覺（光環＋頭頂漂浮神格晶體）
  const godVis = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.14, 8, 28), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#a67c00' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.32;
  const spirit = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#997000' }));
  spirit.position.y = 6.2;
  godVis.add(ring, spirit);
  godVis.visible = false;
  g.add(godVis);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.76);
  scene.add(g);
  return { g, leftArm, rightArm, leftLeg, rightLeg, godVis, ring, spirit, pos: pl.pos, path: [], t: 0, moveN: 0 };
}

// ---------- 地圖移動 NPC 3D 精細模型（土地公、財神、福神、窮神、衰神、台灣土狗）----------
const npcTokens = new Map();
function makeNpcToken(npc) {
  const g = new THREE.Group();
  const info = R.GODS[npc.kind];
  if (npc.kind === 'dog') {
    const fur = new THREE.MeshStandardMaterial({ color: '#c07a3e', roughness: 0.72 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1f242b' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.92, 2.1), fur); body.position.y = 1.15; g.add(body);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.65, 0.3), new THREE.MeshStandardMaterial({ color: '#fef3c7' })); chest.position.set(0, 1.05, 1.02); g.add(chest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.95, 1.05), fur); head.position.set(0, 1.9, 1.05); g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.55), new THREE.MeshStandardMaterial({ color: '#e6b891' })); snout.position.set(0, 1.72, 1.68); g.add(snout);
    for (const x of [-0.42, 0.42]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 4), fur); ear.position.set(x, 2.55, 0.95); g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), dark); eye.position.set(x * 0.6, 2.02, 1.56); g.add(eye);
      for (const z of [-0.68, 0.68]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.85, 6), fur); leg.position.set(x, 0.42, z); g.add(leg);
      }
    }
    const collar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.2, 1.12), new THREE.MeshStandardMaterial({ color: '#ef4444' })); collar.position.set(0, 1.45, 0.88); g.add(collar);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 })); bell.position.set(0, 1.25, 1.46); g.add(bell);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.95, 6), fur); tail.position.set(0, 1.68, -1.25); tail.rotation.x = -0.65; g.add(tail);
    g.userData.tail = tail;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), dark); nose.position.set(0, 1.88, 1.98); g.add(nose);
  } else {
    const robeCol = npc.kind === 'tudigong' ? '#d48806' : npc.kind === 'caishen' ? '#c0392b' : npc.kind === 'fushen' ? '#1e8449' : npc.kind === 'qiongshen' ? '#5d6d7e' : '#6c3483';
    const robe = new THREE.MeshStandardMaterial({ color: robeCol, roughness: 0.5 });
    const skin = new THREE.MeshStandardMaterial({ color: '#f3caa2', roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.65, roughness: 0.25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1e293b' });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.13, 8, 24), new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.38, 2.25, 14), robe); body.position.y = 1.25; g.add(body);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.1, 6, 16), gold); belt.rotation.x = Math.PI / 2; belt.position.y = 1.4; g.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.02, 16, 12), skin); head.position.y = 3.05; g.add(head);
    for (const ex of [-0.32, 0.32]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), dark); eye.position.set(ex, 3.16, 0.92); g.add(eye);
    }

    if (npc.kind === 'tudigong') {
      // 土地公：白壽眉、長白鬚、員外雙翅帽、大元寶、葫蘆龍頭拐杖
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 6), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      beard.rotation.x = Math.PI; beard.position.set(0, 2.02, 0.9); g.add(beard);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.82, 12), gold); hat.position.y = 3.98; g.add(hat);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 0.35), gold); wings.position.y = 3.85; g.add(wings);
      const ingot = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.62), gold); ingot.position.set(0, 1.8, 1.2); g.add(ingot);
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b' })); cane.position.set(1.25, 1.55, 0.4); g.add(cane);
      const gourd = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), gold); gourd.position.set(1.25, 2.75, 0.4); g.add(gourd);
    } else if (npc.kind === 'caishen') {
      // 財神爺：展翅烏紗金冠＋八字鬍＋聚寶大元寶＋金光輪
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 0.95, 10), gold); cap.position.y = 4.0; g.add(cap);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.24, 0.48), gold); wings.position.y = 3.82; g.add(wings);
      const bigIngot = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.6, 0.78), gold); bigIngot.position.set(0, 1.85, 1.28); g.add(bigIngot);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 6, 20), gold); aura.position.set(0, 2.8, -0.65); g.add(aura);
    } else if (npc.kind === 'fushen') {
      // 福神：翠玉冠＋雙環玉如意＋壽桃
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.08, 0.8, 8), new THREE.MeshStandardMaterial({ color: '#2ecc71' })); cap.position.y = 3.95; g.add(cap);
      const ruyi = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.13, 6, 12), gold); ruyi.position.set(1.05, 2.05, 0.55); g.add(ruyi);
      const peach = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), new THREE.MeshStandardMaterial({ color: '#fda4af' })); peach.position.set(-0.95, 2.0, 0.7); g.add(peach);
    } else if (npc.kind === 'qiongshen') {
      // 窮神：斜戴破草笠＋麻布破包袱
      const hat = new THREE.Mesh(new THREE.ConeGeometry(1.65, 0.85, 8), new THREE.MeshStandardMaterial({ color: '#8c7a5b', flatShading: true }));
      hat.position.y = 4.05; hat.rotation.z = 0.22; g.add(hat);
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshStandardMaterial({ color: '#78716c', flatShading: true }));
      sack.position.set(0, 2.0, -1.05); g.add(sack);
    } else {
      // 衰神：頭頂滾滾烏雲與雙道金黃閃電
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), new THREE.MeshStandardMaterial({ color: '#272936', flatShading: true }));
      cloud.scale.set(1.55, 0.65, 1.15); cloud.position.y = 5.05; g.add(cloud);
      for (const bx of [-0.38, 0.38]) {
        const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.15, 4), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04' }));
        bolt.rotation.x = Math.PI; bolt.position.set(bx, 4.25, 0.25); g.add(bolt);
      }
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.75);
  scene.add(g);
  return { g, pos: npc.pos, from: npc.pos, t: 1, moveN: npc.moveN || 0 };
}

const slotOff = k => new THREE.Vector3([-1.75, 1.75, -1.75, 1.75][k % 4], 0, [1.55, 1.55, 2.55, 2.55][k % 4]);
const tokenWorld = (i, k) => { const p = tilePos(i); return new THREE.Vector3(p.x, p.y + 0.19, p.z).add(slotOff(k)); };
const npcWorld = i => { const p = tilePos(i); return new THREE.Vector3(p.x + 2.55, p.y + 0.19, p.z + 0.25); };

// ---------- 雙顆 3D 骰子（隨當前玩家定位滾動，永不淹沒於地形）----------
const pipTex = n => canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, w); c.fillStyle = n === 1 ? '#c0392b' : '#1b1b1b';
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  for (const [x, y] of P) { c.beginPath(); c.arc(x * w, y * w, n === 1 ? 16 : 11, 0, 7); c.fill(); }
});
const FACE = [3, 4, 1, 6, 2, 5];
const diceMats = FACE.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.35 }));
const dice = [0, 1].map(k => { const m = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), diceMats); m.castShadow = true; m.position.set(-76 + k * 5.2, 2.2, 44); scene.add(m); return m; });
const UP = { 1: [0, 0], 2: [-Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI / 2, 0], 6: [Math.PI, 0] };
let diceAnim = null;
function rollDice(a, b) {
  const anchor = G ? tilePos(R.cur(G).pos) : new THREE.Vector3(-76, 1.5, 44);
  diceAnim = {
    t0: performance.now(), dur: 900, end: [a, b], anchor,
    spin: [new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6), new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6)]
  };
  snd('dice');
}
function stepDice(now) {
  if (!diceAnim) return;
  const t = Math.min(1, (now - diceAnim.t0) / diceAnim.dur);
  const a = diceAnim.anchor;
  dice.forEach((d, k) => {
    const [rx, rz] = UP[diceAnim.end[k]];
    const ox = a.x + (k ? 2.6 : -2.6), oz = a.z + 5.8;
    if (t < 1) {
      const s = (1 - t) * 1.2;
      d.rotation.set(rx + diceAnim.spin[k].x * s, d.rotation.y + 0.02, rz + diceAnim.spin[k].z * s);
      d.position.set(ox, a.y + 4.2 + Math.abs(Math.sin(t * Math.PI * 3)) * 8.5 * (1 - t), oz);
    } else {
      d.rotation.set(rx, k * 0.35, rz);
      d.position.set(ox, a.y + 3.4, oz);
    }
  });
  if (t >= 1) diceAnim = null;
}

// ---------- 鏡頭：完整俯瞰立體台灣本島、支援單指旋轉、雙指縮放、三指平移棋盤 ----------
const camS = { yaw: 0.36, pitch: 0.88, dist: 245, target: new THREE.Vector3(-4, 0, 4), goal: new THREE.Vector3(-4, 0, 4), pan: new THREE.Vector3(0, 0, 0) };
function panBoard(dx, dy) {
  const scale = camS.dist * 0.0017;
  const rx = Math.cos(camS.yaw), rz = -Math.sin(camS.yaw);
  const fx = -Math.sin(camS.yaw), fz = -Math.cos(camS.yaw);
  const mx = (-rx * dx + fx * dy) * scale;
  const mz = (-rz * dx + fz * dy) * scale;
  const nx = Math.max(-110, Math.min(110, camS.pan.x + mx));
  const nz = Math.max(-130, Math.min(130, camS.pan.z + mz));
  const ddx = nx - camS.pan.x, ddz = nz - camS.pan.z;
  camS.pan.x = nx; camS.pan.z = nz;
  camS.goal.x += ddx; camS.goal.z += ddz;
  camS.target.x += ddx; camS.target.z += ddz;
}
function updateCamera() {
  camS.target.lerp(camS.goal, 0.06);
  const d = camS.dist, cp = Math.cos(camS.pitch);
  camera.position.set(camS.target.x + Math.sin(camS.yaw) * cp * d, camS.target.y + Math.sin(camS.pitch) * d, camS.target.z + Math.cos(camS.yaw) * cp * d);
  camera.lookAt(camS.target);
}
(function input() {
  const pts = new Map(); let last = null, pinch = null, triCenter = null, touchTri = null;
  const centroid = list => {
    let sx = 0, sy = 0;
    for (const p of list) { sx += p.x; sy += p.y; }
    return { x: sx / list.length, y: sy / list.length };
  };
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    if (pts.size >= 3) {
      triCenter = centroid([...pts.values()]);
      pinch = null; last = null;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: camS.dist };
      triCenter = null; last = null;
    } else {
      last = { x: e.clientX, y: e.clientY };
      triCenter = null; pinch = null;
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 3) {
      const c = centroid([...pts.values()]);
      if (triCenter) panBoard(c.x - triCenter.x, c.y - triCenter.y);
      triCenter = c;
      return;
    }
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      camS.dist = Math.max(70, Math.min(440, pinch.dist * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))));
      return;
    }
    if (!last || pts.size !== 1) return;
    camS.yaw -= (e.clientX - last.x) * 0.006; camS.pitch = Math.max(0.32, Math.min(1.45, camS.pitch + (e.clientY - last.y) * 0.004));
    last = { x: e.clientX, y: e.clientY };
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size >= 3) { triCenter = centroid([...pts.values()]); pinch = null; last = null; }
    else { triCenter = null; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: camS.dist }; last = null; }
    else if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const [p] = pts.values(); last = { ...p }; }
    if (!pts.size) last = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  // TouchEvent 三指觸控備援：若平台未派出 3 個 pointerId，直接用 touches 計算三指中心平移棋盤
  const touchCenter = ts => {
    let sx = 0, sy = 0;
    for (let k = 0; k < ts.length; k++) { sx += ts[k].clientX; sy += ts[k].clientY; }
    return { x: sx / ts.length, y: sy / ts.length };
  };
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length >= 3) { e.preventDefault(); touchTri = touchCenter(e.touches); pinch = null; last = null; }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length >= 3) {
      e.preventDefault();
      const c = touchCenter(e.touches);
      if (pts.size < 3 && touchTri) panBoard(c.x - touchTri.x, c.y - touchTri.y);
      touchTri = c;
    }
  }, { passive: false });
  const touchEnd = e => { touchTri = e.touches.length >= 3 ? touchCenter(e.touches) : null; };
  canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) camS.dist *= Math.exp(e.deltaY * 0.01); else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) camS.yaw += e.deltaX * 0.004; else camS.dist *= Math.exp(e.deltaY * 0.0015); camS.dist = Math.max(70, Math.min(440, camS.dist)); }, { passive: false });
})();
function resize() {
  const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

// ---------- 每幀動畫 ----------
let lastFx = '', lastCard = 0, lastMoveN = 0, lastNewsId = 0;
function frame(now) {
  requestAnimationFrame(frame);
  for (let k = 0; k < animProps.length; k++) animProps[k](now);
  if (G) {
    syncBuildings();
    G.players.forEach((pl, k) => {
      const tk = tokens[k] || (tokens[k] = makeToken(pl));
      tk.g.visible = !pl.bankrupt;
      // 玩家附身神明特效
      if (pl.god) {
        const gCol = R.GODS[pl.god.kind].color;
        tk.godVis.visible = true;
        tk.ring.material.color.set(gCol);
        tk.ring.material.emissive.set(gCol);
        tk.spirit.material.color.set(gCol);
        tk.spirit.material.emissive.set(gCol);
        tk.spirit.rotation.y = now * 0.003;
        tk.spirit.position.y = 6.2 + Math.sin(now * 0.005) * 0.35;
      } else {
        tk.godVis.visible = false;
      }

      if (G.move && G.move.p === k && G.move.n !== tk.moveN) {
        tk.moveN = G.move.n; tk.path = [...G.move.path]; tk.t = 0; tk.from = tk.pos;
      }
      if (tk.path.length) {
        tk.t += 0.085;
        const a = tokenWorld(tk.from, k), b = tokenWorld(tk.path[0], k), f = Math.min(1, tk.t);
        tk.g.position.lerpVectors(a, b, f);
        tk.g.position.y += Math.sin(f * Math.PI) * 3.8;
        tk.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        const swing = Math.sin(f * Math.PI * 2) * 0.65;
        tk.leftArm.rotation.x = swing; tk.rightArm.rotation.x = -swing;
        tk.leftLeg.rotation.x = -swing * 0.8; tk.rightLeg.rotation.x = swing * 0.8;
        if (f >= 1) { tk.from = tk.path.shift(); tk.pos = tk.from; tk.t = 0; snd('step'); }
      } else {
        tk.pos = pl.pos;
        tk.g.position.copy(tokenWorld(pl.pos, k));
        tk.g.position.y += k === G.cur ? Math.abs(Math.sin(now / 300)) * 0.72 : 0;
        tk.leftArm.rotation.x = 0; tk.rightArm.rotation.x = 0;
        tk.leftLeg.rotation.x = 0; tk.rightLeg.rotation.x = 0;
      }
    });

    // 地圖移動 NPC 動畫
    if (G.npcs) {
      for (const npc of G.npcs) {
        let nt = npcTokens.get(npc.id);
        if (!nt) { nt = makeNpcToken(npc); npcTokens.set(npc.id, nt); }
        nt.g.visible = npc.attachedTo == null;
        if (!nt.g.visible) continue;
        if (npc.moveN !== nt.moveN) { nt.moveN = npc.moveN; nt.from = npc.from != null ? npc.from : nt.pos; nt.pos = npc.pos; nt.t = 0; }
        if (nt.t < 1) {
          nt.t = Math.min(1, nt.t + 0.045);
          const a = npcWorld(nt.from), b = npcWorld(nt.pos);
          nt.g.position.lerpVectors(a, b, nt.t);
          nt.g.position.y += Math.sin(nt.t * Math.PI) * 2.2;
          nt.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        } else {
          nt.g.position.copy(npcWorld(npc.pos));
          nt.g.position.y += Math.sin(now * 0.004 + npc.id) * 0.35;
        }
        if (nt.g.userData.tail) nt.g.userData.tail.rotation.z = Math.sin(now * 0.015) * 0.45;
      }
    }

    const ct = tokens[G.cur];
    if (ct) camS.goal.copy(ct.g.position).multiplyScalar(0.55).setY(0).add(camS.pan);
  } else {
    camS.goal.set(-4 + camS.pan.x, 0, 4 + camS.pan.z);
  }
  stepDice(now);
  updateCamera();
  renderer.render(scene, camera);
}

// ============================================================ 介面與 Breaking News
const mine = pid => NET.role === 'local' ? G.players[pid].kind !== 'ai' : NET.myIds.has(pid);
const animBusy = () => tokens.some(t => t && t.path && t.path.length) || !!diceAnim;
function toast(s, ms = 1900) { const t = $('#toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }
function openModal(html, ready) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); ready && ready($('#modalBox')); }
function closeModal() { $('#modal').classList.add('hidden'); }
let shownAsk = null, lastRankRound = 0, pendingRankModal = false;

// 依據新聞類型繪製鮮明 SVG 主題插畫（不含重覆 ID）
function newsArtSVG(n) {
  const txt = `${n.cat || ''} ${n.title || ''} ${n.body || ''}`;
  if (/土地公|強佔|廟|福神|財神|神明降臨|送神除厄|宮廟/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#2b1808"/>
      <circle cx="48" cy="48" r="36" fill="#f59e0b" opacity=".25"/>
      <circle cx="48" cy="48" r="27" fill="#fbbf24" opacity=".28"/>
      <path d="M16 44 Q48 20 80 44 L74 49 Q48 30 22 49 Z" fill="#ef4444" stroke="#fde047" stroke-width="2.5"/>
      <rect x="27" y="47" width="42" height="6" rx="2" fill="#facc15"/>
      <rect x="31" y="53" width="34" height="24" rx="4" fill="#b91c1c"/>
      <circle cx="48" cy="60" r="10" fill="#fde68a"/>
      <path d="M35 67 Q48 80 61 67 L58 79 L38 79 Z" fill="#fef3c7"/>
      <circle cx="44" cy="59" r="1.8" fill="#1f2937"/><circle cx="52" cy="59" r="1.8" fill="#1f2937"/>
      <polygon points="78,14 81,22 89,22 83,27 85,35 78,30 71,35 73,27 67,22 75,22" fill="#fde047"/>
    </svg>`;
  }
  if (/窮神|衰神|噩耗|驅神|神明離去/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#1e1035"/>
      <circle cx="48" cy="48" r="38" fill="#7c3aed" opacity=".25"/>
      <path d="M22 46 Q18 32 32 29 Q39 17 55 21 Q69 19 74 33 Q82 40 73 50 L26 50 Z" fill="#4c1d95" stroke="#c4b5fd" stroke-width="2.5"/>
      <polygon points="48,48 36,68 47,68 41,85 63,61 50,61 58,48" fill="#facc15" stroke="#fff" stroke-width="1.5"/>
      <circle cx="38" cy="37" r="3" fill="#f43f5e"/><circle cx="58" cy="37" r="3" fill="#f43f5e"/>
    </svg>`;
  }
  if (/破產|拆屋|路障|野狗|監獄|住院|颱風|股災|超速|懲罰|拋售/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#2d0a0f"/>
      <polygon points="48,8 57,26 76,18 68,36 88,45 69,55 78,74 58,68 48,88 38,68 18,74 27,55 8,45 28,36 20,18 39,26" fill="#dc2626"/>
      <polygon points="48,18 55,32 70,26 63,40 78,47 64,55 70,69 55,64 48,79 41,64 26,69 32,55 18,47 33,40 26,26 41,32" fill="#f97316"/>
      <rect x="44" y="30" width="8" height="24" rx="4" fill="#fff"/>
      <circle cx="48" cy="63" r="4.8" fill="#fff"/>
    </svg>`;
  }
  if (/地產|置產|壟斷|地標|摩天|徵收|都更/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#0d233a"/>
      <circle cx="48" cy="48" r="36" fill="#0284c7" opacity=".28"/>
      <rect x="20" y="38" width="20" height="42" rx="3" fill="#38bdf8"/>
      <rect x="38" y="20" width="24" height="60" rx="3" fill="#0ea5e9" stroke="#bae6fd" stroke-width="2"/>
      <polygon points="48,9 53,20 43,20" fill="#fde047"/>
      <rect x="60" y="44" width="17" height="36" rx="3" fill="#22d3ee"/>
      <rect x="43" y="27" width="6" height="7" fill="#fef08a"/><rect x="52" y="27" width="6" height="7" fill="#fef08a"/>
      <rect x="43" y="39" width="6" height="7" fill="#fef08a"/><rect x="52" y="39" width="6" height="7" fill="#fef08a"/>
      <rect x="24" y="45" width="5" height="6" fill="#e0f2fe"/><rect x="31" y="45" width="5" height="6" fill="#e0f2fe"/>
      <rect x="14" y="78" width="68" height="5" rx="2.5" fill="#facc15"/>
    </svg>`;
  }
  if (/過路費|紅包|賺|發票|獎金|國稅|請客|財經/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#0a291a"/>
      <circle cx="48" cy="48" r="36" fill="#10b981" opacity=".25"/>
      <rect x="14" y="34" width="58" height="34" rx="6" transform="rotate(-8 43 51)" fill="#22c55e" stroke="#bbf7d0" stroke-width="2"/>
      <rect x="20" y="38" width="58" height="34" rx="6" fill="#16a34a" stroke="#dcfce7" stroke-width="2"/>
      <circle cx="49" cy="55" r="10" fill="#fde047"/>
      <text x="49" y="60" text-anchor="middle" font-size="14" font-weight="900" fill="#14532d">$</text>
      <circle cx="72" cy="28" r="12" fill="#facc15" stroke="#fef08a" stroke-width="2"/>
      <circle cx="25" cy="70" r="10" fill="#fbbf24" stroke="#fef08a" stroke-width="2"/>
    </svg>`;
  }
  if (/冠軍|底定|開賽|排行/.test(txt)) {
    return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <rect width="96" height="96" rx="16" fill="#2b1e06"/>
      <circle cx="48" cy="46" r="36" fill="#eab308" opacity=".25"/>
      <path d="M26 24 H70 V42 Q70 60 48 63 Q26 60 26 42 Z" fill="#facc15" stroke="#fef9c3" stroke-width="2.5"/>
      <path d="M26 28 H15 Q13 44 26 46" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
      <path d="M70 28 H81 Q83 44 70 46" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
      <rect x="43" y="62" width="10" height="12" fill="#f59e0b"/>
      <rect x="30" y="73" width="36" height="9" rx="3" fill="#eab308" stroke="#fef08a" stroke-width="1.5"/>
      <polygon points="48,31 51,39 59,39 53,44 55,52 48,47 41,52 43,44 37,39 45,39" fill="#fffbeb"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
    <rect width="96" height="96" rx="16" fill="#131f3b"/>
    <circle cx="48" cy="48" r="36" fill="#3b82f6" opacity=".28"/>
    <rect x="20" y="24" width="56" height="48" rx="10" fill="#2563eb" stroke="#93c5fd" stroke-width="2.5"/>
    <polygon points="48,30 53,42 66,42 56,50 60,62 48,55 36,62 40,50 30,42 43,42" fill="#fde047"/>
  </svg>`;
}

function renderNews() {
  const bar = $('#newsBar');
  const wasHidden = bar.classList.contains('hidden');
  if (!G || !G.news || !G.news.length) {
    bar.classList.add('hidden');
    if (!wasHidden) resize();
    return;
  }
  bar.classList.remove('hidden');
  if (wasHidden) resize();
  const latest = G.news[G.news.length - 1];
  $('#newsTitle').textContent = `[${latest.cat}] ${latest.title}`;
  $('#newsTicker').textContent = G.news.slice(-5, -1).reverse().map(n => `• ${n.title}`).join('   ');

  if (latest.id > lastNewsId) {
    const isInitial = lastNewsId === 0;
    lastNewsId = latest.id;
    bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash');
    if (!isInitial) {
      const nt = $('#newsToast');
      nt.style.setProperty('--nc', latest.color || '#d93829');
      nt.innerHTML = `<div class="nt-head"><span>🔴 BREAKING NEWS</span><span>第 ${latest.round} 輪・${latest.cat}</span></div>
        <div class="nt-main">
          <div class="nt-art">${newsArtSVG(latest)}</div>
          <div class="nt-content">
            <div class="nt-title">${latest.title}</div>
            ${latest.body && latest.body !== latest.title ? `<div class="nt-body">${latest.body}</div>` : ''}
          </div>
        </div>`;
      nt.classList.remove('hidden');
      clearTimeout(nt._t);
      nt._t = setTimeout(() => nt.classList.add('hidden'), 3800);
      snd('news');
    }
  }
}

function openNewsLog() {
  if (!G || !G.news) return;
  openModal(`<h2>📰 Breaking News 突發新聞台</h2><div class="sub">全場玩家的重大地產交易、神明附身與突發事件紀錄。</div>
    <div class="news-list">${G.news.slice().reverse().map(n => `<div class="news-item" style="--nc:${n.color || 'var(--gold)'}">
      <div class="ni-art">${newsArtSVG(n)}</div>
      <div class="ni-text">
        <div class="ni-meta">第 ${n.round} 輪・${n.cat}</div>
        <div class="ni-t">${n.title}</div>
        ${n.body && n.body !== n.title ? `<div class="ni-b">${n.body}</div>` : ''}
      </div>
    </div>`).join('')}</div>
    <div class="row"><button class="close">關閉</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
  });
}

function openLeaderboardModal(round, isMilestone) {
  if (!G) return;
  const rows = G.players.map(p => {
    const landIdx = R.lands(G, p);
    const bld = landIdx.reduce((sum, i) => sum + (G.tiles[i].level || 0), 0);
    const worth = p.bankrupt ? -1 : R.netWorth(G, p);
    return { p, worth, lands: landIdx.length, bld };
  }).sort((a, b) => b.worth - a.worth);
  const topWorth = Math.max(1, rows[0] ? rows[0].worth : 1);
  const medals = ['🥇', '🥈', '🥉', '4'];
  openModal(`<h2>📊 ${isMilestone ? `第 ${round} 回合財富排行榜` : `目前財富排行榜（第 ${round} 輪）`}</h2>
    <div class="sub">${isMilestone ? '每 20 回合定期結算一次！' : ''}依「現金＋地產價值＋建築」計算目前總資產排名。</div>
    <div class="rank-list">${rows.map((r, k) => {
      const pct = r.worth < 0 ? 0 : Math.max(4, Math.round((r.worth / topWorth) * 100));
      const god = r.p.god ? R.GODS[r.p.god.kind] : null;
      return `<div class="rank-card ${k === 0 && r.worth >= 0 ? 'top1' : ''}" style="--rc:${r.p.color}">
        <div class="rank-medal">${medals[k] || (k + 1)}</div>
        <div class="rank-av">${r.p.name[0]}</div>
        <div class="rank-main">
          <div class="rank-name">${r.p.name}${r.p.bankrupt ? ' <small>(已破產)</small>' : ''}${god ? `<span class="god-badge ${god.good ? 'good' : 'bad'}">${god.icon}${god.name}</span>` : ''}</div>
          <div class="rank-stats">現金 $${r.p.cash.toLocaleString()}・土地 ${r.lands} 塊・建築 ${r.bld} 棟</div>
        </div>
        <div class="rank-worth">${r.worth < 0 ? '破產' : '$' + r.worth.toLocaleString()}</div>
        <div class="rank-bar-wrap"><div class="rank-bar" style="width:${pct}%"></div></div>
      </div>`;
    }).join('')}</div>
    <div class="row"><button class="primary close">${isMilestone ? '繼續環島！' : '關閉'}</button></div>`, box => {
    box.querySelector('.close').onclick = () => {
      closeModal();
      renderUI();
      scheduleAuto();
    };
  });
}

function renderUI() {
  if (!G) return;
  const rText = G.phase === 'over' ? '遊戲結束' : (G.maxRounds > 0 ? `第 ${G.round} / ${G.maxRounds} 輪 ✎` : `第 ${G.round} 輪（無限）✎`);
  $('#roundInfo').textContent = rText;

  $('#players').innerHTML = G.players.map((p, k) => {
    const god = p.god ? R.GODS[p.god.kind] : null;
    const godBadge = god ? `<span class="god-badge ${god.good ? 'good' : 'bad'}" title="${god.desc}">${god.icon}${god.name}(${p.god.turns})</span>` : '';
    return `<div class="pcard ${k === G.cur && G.phase !== 'over' ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" style="--c:${p.color}">
      <div class="av">${p.name[0]}</div>
      <b>${p.name}${p.kind === 'ai' ? ' <small>電腦</small>' : mine(k) && NET.role !== 'local' ? ' <small>你</small>' : ''}${p.jail ? ' <small>🔒監獄</small>' : ''}${p.skip ? ' <small>🏥住院</small>' : ''}${godBadge}</b>
      <div><span class="cash">$${p.cash.toLocaleString()}</span> <small>地 ${R.lands(G, p).length}・道具 ${p.items.length}</small></div>
    </div>`;
  }).join('');

  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  $('#turnName').innerHTML = G.phase === 'over'
    ? `🏆 <b>${G.players[G.winner].name}</b> 獲勝`
    : `輪到 <b style="color:${p.color}">${p.name}</b>${p.god ? ` [${R.GODS[p.god.kind].icon}${R.GODS[p.god.kind].name}]` : ''}${my ? '（你）' : p.kind === 'ai' ? '（電腦思考中…）' : '（等待對方）'}`;
  renderUIButtons();
  $('#logBox').innerHTML = G.log.slice().reverse().map(s => `<div>${s}</div>`).join('');
  renderNews();

  // 機會／命運卡片快閃
  if (G.card && G.card.n !== lastCard) {
    lastCard = G.card.n;
    const c = G.card;
    setTimeout(() => showCard(c), animDelay());
  }
  // 購買／蓋房／抽卡／道具屋詢問
  const askKey = G.ask ? `${G.turn}:${G.ask.k}:${G.ask.i}:${G.ask.bought ? G.ask.bought.length : 0}` : '';
  if (G.ask && my && shownAsk !== askKey) {
    shownAsk = askKey;
    const q = G.ask;
    const delay = (q.k === 'shop' && q.bought && q.bought.length > 0) ? 0 : animDelay();
    setTimeout(() => askPrompt(q), delay);
  }
  if (G.fx && JSON.stringify(G.fx) + G.turn !== lastFx) {
    lastFx = JSON.stringify(G.fx) + G.turn;
    const fk = G.fx.k;
    setTimeout(() => snd({ rent: 'pay', buy: 'cash', build: 'build', jail: 'bad', demolish: 'bad', god_good: 'god', god_bad: 'badgod', seize: 'seize' }[fk] || 'turn'), animDelay());
  }
  if (G.phase !== 'over' && G.round >= 20 && G.round % 20 === 0 && G.round !== lastRankRound && !G.ask && $('#modal').classList.contains('hidden')) {
    lastRankRound = G.round;
    pendingRankModal = true;
    const rankRound = G.round;
    setTimeout(() => {
      pendingRankModal = false;
      if (G && G.phase !== 'over' && G.round === rankRound && !G.ask && $('#modal').classList.contains('hidden')) {
        openLeaderboardModal(rankRound, true);
      } else {
        scheduleAuto();
      }
    }, Math.min(700, Math.max(250, animDelay())));
  }
  if (G.phase === 'over') setTimeout(showResult, 900);
}

let moveAt = 0;
const animDelay = () => Math.max(300, moveAt + (G.move ? G.move.path.length : 0) * 210 + 750 - performance.now());

function showCard(c) {
  const el = $('#cardPop');
  el.style.setProperty('--c', c.kind === 'chance' ? '#e67e22' : '#4f7fe0');
  el.innerHTML = `<h3>${c.kind === 'chance' ? '機 會' : '命 運'}</h3><p>${c.text}</p>`;
  el.classList.remove('hidden'); snd('card');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.add('hidden'), 2400);
}

function askPrompt(q) {
  if (!q || !G.ask || G.ask.k !== q.k || G.ask.i !== q.i) return;
  const t = R.BOARD[q.i], s = G.tiles[q.i], p = R.cur(G);
  if (q.k === 'card') {
    const isChance = q.kind === 'chance';
    openModal(`<h2>${isChance ? '🎴 機會卡' : '🔮 命運卡'}</h2>
      <div class="sub">${p.name} 停在「${t.name}」抽出一張卡片：</div>
      <div class="card-box" style="--c:${isChance ? '#e67e22' : '#4f7fe0'}">${q.text}</div>
      <div class="row"><button class="primary" id="aOk">確定執行</button></div>`, box => {
      box.querySelector('#aOk').onclick = () => { closeModal(); send({ type: 'answer', yes: true }); };
    });
    return;
  }
  if (q.k === 'shop') {
    const giftName = q.freeItem ? `${R.ITEMS[q.freeItem].icon} ${R.ITEMS[q.freeItem].name}` : '（背包已滿）';
    const bagFull = p.items.length >= R.MAX_ITEMS;
    openModal(`<h2>🏪 台灣道具屋</h2>
      <div class="sub">免費贈禮：<b>${giftName}</b><br>目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>・背包：<b>${p.items.length}/${R.MAX_ITEMS}</b></div>
      <div class="shop-grid">${Object.entries(R.ITEMS).map(([k, it]) => {
        const disabled = bagFull || p.cash < it.price;
        return `<button data-buy="${k}" ${disabled ? 'disabled' : ''}>
          <b>${it.icon} ${it.name} <span class="price">$${it.price}</span></b>
          <small>${it.desc}</small>
        </button>`;
      }).join('')}</div>
      <div class="row"><button class="primary" id="sDone">離開道具屋</button></div>`, box => {
      box.querySelector('#sDone').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        send({ type: 'buyItem', item: b.dataset.buy });
      });
    });
    return;
  }

  const buy = q.k === 'buy', nextLv = buy ? 0 : s.level + 1;
  const godHint = p.god ? (p.god.kind === 'tudigong' && buy ? '（土地公半價優惠）' : p.god.kind === 'fushen' && buy ? '（福神 8 折優惠）' : p.god.kind === 'shuaishen' ? '（衰神 1.5 倍漲價）' : '') : '';
  openModal(`<h2>${buy ? '要買下這塊地嗎？' : '要加蓋嗎？'}</h2>
    <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
      <span>${buy ? '價格' : '費用'}</span><b>$${q.cost.toLocaleString()} ${godHint}</b>
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
    ${rank.map((r, k) => `<div class="seat" style="grid-template-columns:24px 1fr auto"><span class="dot" style="background:${r.p.color}"></span><b>${k + 1}. ${r.p.name}</b><span>${r.w < 0 ? '破產' : '$' + r.w.toLocaleString()}</span></div>`).join('')}
    <div class="row"><button id="rBack">回到大戰略</button><button class="primary" id="rAgain">再玩一局</button></div>`, box => {
    box.querySelector('#rBack').onclick = () => { location.href = '../'; };
    box.querySelector('#rAgain').onclick = () => { closeModal(); leaveNet(); openLobby(); };
  });
}

function openItems() {
  const p = R.cur(G);
  if (!mine(p.id) || (G.phase !== 'roll' && G.phase !== 'done')) return toast('現在無法使用道具');
  openModal(`<h2>🎒 使用道具（${p.items.length}/${R.MAX_ITEMS}）</h2><div class="sub">請神卡／送神卡／拆除／徵收等道具可在自己回合使用；遙控骰子需在擲骰前使用；免租卡會自動生效。</div>
    <div class="items">${p.items.map(k => {
      const it = R.ITEMS[k];
      const dis = k === 'free' || (k === 'remote' && G.phase !== 'roll');
      return `<button data-k="${k}" ${dis ? 'disabled' : ''}><b>${it.icon} ${it.name}</b><small>${it.desc}</small></button>`;
    }).join('')}</div>
    <div class="row"><button class="close">關閉</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'reverse') { closeModal(); send({ type: 'item', item: k }); }
      else if (k === 'remote') pickNumber('🎯 遙控骰子：選擇點數', 2, 12, n => send({ type: 'item', item: k, n }));
      else if (k === 'block') pickNumber('🚧 路障卡：放在前方第幾格', 1, 8, n => send({ type: 'item', item: k, n }));
      else if (k === 'summon_god') {
        openModal(`<h2>🙏 請神卡：選擇要召喚的神明</h2><div class="sub">召喚後立即附身 5 回合！土地公可直接免費強佔對手土地！</div>
          <div class="items">${['tudigong', 'caishen', 'fushen'].map(gk => {
            const gd = R.GODS[gk];
            return `<button data-g="${gk}"><b>${gd.icon} ${gd.name}</b><small>${gd.desc}</small></button>`;
          }).join('')}</div><div class="row"><button class="close">取消</button></div>`, bx => {
          bx.querySelector('.close').onclick = closeModal;
          bx.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { closeModal(); send({ type: 'item', item: k, god: x.dataset.g }); });
        });
      } else if (k === 'dismiss_god') {
        const hasBad = p.god && !p.god.good;
        const opps = G.players.filter(q => q !== p && !q.bankrupt);
        if (hasBad) {
          openModal(`<h2>💨 送神卡：轉嫁「${R.GODS[p.god.kind].name}」</h2><div class="sub">選擇一位對手，把身上的壞神明轉送給他！</div>
            <div class="items">${opps.map(o => `<button data-t="${o.id}"><b>${o.name}</b><small>現金 $${o.cash.toLocaleString()}</small></button>`).join('')}
            <button data-t="-1"><b>直接送走</b><small>讓神明回到地圖上</small></button></div>
            <div class="row"><button class="close">取消</button></div>`, bx => {
            bx.querySelector('.close').onclick = closeModal;
            bx.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { closeModal(); const t = +x.dataset.t; send({ type: 'item', item: k, target: t >= 0 ? t : null }); });
          });
        } else {
          const blessed = opps.filter(o => o.god);
          if (!blessed.length) return toast('自己沒有壞神明，對手身上也沒有神明');
          openModal(`<h2>💨 送神卡：驅散對手神明</h2><div class="sub">選擇一位有神明附身的對手，送走他的神明！</div>
            <div class="items">${blessed.map(o => `<button data-t="${o.id}"><b>${o.name}</b><small>目前附身：${R.GODS[o.god.kind].icon} ${R.GODS[o.god.kind].name}</small></button>`).join('')}</div>
            <div class="row"><button class="close">取消</button></div>`, bx => {
            bx.querySelector('.close').onclick = closeModal;
            bx.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { closeModal(); send({ type: 'item', item: k, target: +x.dataset.t }); });
          });
        }
      } else if (k === 'demolish') {
        const opts = G.tiles.map((s, i) => i).filter(i => G.tiles[i].owner != null && G.tiles[i].owner !== p.id && G.tiles[i].level > 0);
        if (!opts.length) return toast('對手還沒有任何建築');
        openModal(`<h2>💣 拆除卡：選擇對手的建築</h2><div class="items">${opts.map(i => `<button data-i="${i}"><b>${R.BOARD[i].name}</b><small>${G.players[G.tiles[i].owner].name}・${R.LEVEL_NAME[G.tiles[i].level]}</small></button>`).join('')}</div><div class="row"><button class="close">取消</button></div>`, bx => {
          bx.querySelector('.close').onclick = closeModal;
          bx.querySelectorAll('[data-i]').forEach(x => x.onclick = () => { closeModal(); send({ type: 'item', item: k, i: +x.dataset.i }); });
        });
      } else if (k === 'seize') {
        const opts = G.tiles.map((s, i) => i).filter(i => G.tiles[i].owner != null && G.tiles[i].owner !== p.id);
        if (!opts.length) return toast('對手還沒有任何土地');
        openModal(`<h2>📜 徵收卡：強制收購對手土地</h2><div class="sub">以 1.2 倍現值強制徵收對手土地！</div>
          <div class="items">${opts.map(i => {
            const cost = Math.round(((R.BOARD[i].price || 0) + (G.tiles[i].level || 0) * R.buildCost(i)) * 1.2);
            return `<button data-i="${i}" ${p.cash < cost ? 'disabled' : ''}><b>${R.BOARD[i].name}</b><small>${G.players[G.tiles[i].owner].name}・費用 $${cost.toLocaleString()}</small></button>`;
          }).join('')}</div><div class="row"><button class="close">取消</button></div>`, bx => {
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

function openRoundsModal() {
  if (!G) return;
  if (NET.role === 'client') return toast('線上對戰請由房主調整回合上限');
  openModal(`<h2>⚙️ 調整遊戲回合</h2><div class="sub">隨時修改總輪數上限；輸入 <b>0</b> 代表無限回合（直到只剩一人未破產）。</div>
    <label class="field">回合上限 <input id="rInput" type="number" min="0" max="999" value="${G.maxRounds}"> <small>目前第 ${G.round} 輪</small></label>
    <div class="row" style="justify-content:flex-start">${[15, 20, 30, 50, 0].map(n => `<button data-preset="${n}">${n === 0 ? '無限' : n + ' 輪'}</button>`).join('')}</div>
    <div class="row"><button class="close">取消</button><button class="primary" id="rSave">套用</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { box.querySelector('#rInput').value = b.dataset.preset; });
    box.querySelector('#rSave').onclick = () => {
      const val = Number(box.querySelector('#rInput').value);
      closeModal();
      send({ type: 'setRounds', maxRounds: isNaN(val) ? 30 : val });
    };
  });
}

function openRenameModal() {
  if (!G) return;
  const editable = G.players.filter((p, k) => !p.bankrupt && (NET.role === 'local' || mine(k)));
  if (!editable.length) return toast('沒有可改名的玩家');
  openModal(`<h2>✏️ 修改玩家名稱</h2>
    ${editable.map(p => `<div class="seat" style="grid-template-columns:24px 1fr"><span class="dot" style="background:${p.color}"></span><input data-pid="${p.id}" maxlength="10" value="${p.name}"></div>`).join('')}
    <div class="row"><button class="close">取消</button><button class="primary" id="rnSave">確定更名</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#rnSave').onclick = () => {
      box.querySelectorAll('input[data-pid]').forEach(inp => {
        const pid = +inp.dataset.pid, nm = inp.value.trim();
        if (nm && nm !== G.players[pid].name) send({ type: 'rename', pid, name: nm });
      });
      closeModal();
    };
  });
}

$('#roundInfo').onclick = openRoundsModal;
$('#newsBar').onclick = openNewsLog;
$('#btnRank').onclick = () => { if (!G) return toast('遊戲開始後可查看排行榜'); openLeaderboardModal(G.round, false); };
$('#btnNews').onclick = openNewsLog;
$('#btnRoll').onclick = () => send({ type: 'roll' });
$('#btnEnd').onclick = () => send({ type: 'end' });
$('#btnItem').onclick = openItems;
$('#btnLog').onclick = () => $('#logBox').classList.toggle('hidden');
$('#btnSound').onclick = () => { SND.on = !SND.on; $('#btnSound').textContent = SND.on ? '🔊' : '🔇'; try { localStorage.setItem('rich_sound', SND.on ? '1' : '0'); } catch (e) { /* 忽略 */ } };
$('#btnSound').textContent = SND.on ? '🔊' : '🔇';
$('#btnMenu').onclick = () => openModal(`<h2>選單</h2><div class="row" style="justify-content:flex-start">
  <button id="mRounds">⚙️ 調整回合</button><button id="mRename">✏️ 修改名字</button><button id="mHelp">玩法說明</button>
  <button id="mNew">重新開局</button><button id="mBack">回到大戰略</button></div><div class="row"><button class="close">關閉</button></div>`, box => {
  box.querySelector('.close').onclick = closeModal;
  box.querySelector('#mRounds').onclick = openRoundsModal;
  box.querySelector('#mRename').onclick = openRenameModal;
  box.querySelector('#mHelp').onclick = openHelp;
  box.querySelector('#mNew').onclick = () => { if (confirm('確定放棄目前的遊戲？')) { closeModal(); leaveNet(); openLobby(); } };
  box.querySelector('#mBack').onclick = () => { location.href = '../'; };
});

function openHelp() {
  openModal(`<h2>玩法說明</h2><div class="sub" style="font-size:14px;color:var(--text)">
  ・<b>56 格全台灣環島地圖</b>：從南部墾丁一路順時針經過西部、北台灣、東部與離島！<br>
  ・<b>機會、命運與道具屋</b>：踩到機會／命運會跳出卡片視窗確認執行；踩到道具屋會送一張隨機卡片，並開啟商店讓你購買「請神卡、送神卡、遙控骰子、路障、免租卡、迴轉卡、拆除卡、徵收卡」。<br>
  ・<b>神明與地圖 NPC</b>：地圖上會巡邏「土地公、財神爺、福神、窮神、衰神、野狗」6 位 NPC！路過或使用請神卡可獲得附身：<b>土地公附身時踩到別人的地可免費強佔</b>！送神卡則可把壞神明轉送給對手。<br>
  ・<b>Breaking News 快訊</b>：任何玩家的重大購地、強佔、使用道具與破產都會即時廣播給全場玩家。<br>
  ・<b>可調整回合</b>：開局與遊戲中點擊上方輪數皆可隨時修改回合上限（0 為無限）；每 20 回合會自動公布一次財富排行榜，亦可隨時點擊上方「🏆 排行」查看。<br>
  ・<b>觸控與視角操作</b>：單指拖曳旋轉 3D 視角、滾輪或雙指縮放、<b>三指觸控拖曳可自由移動棋盤</b>。</div>
  <div class="row"><button class="close">知道了</button></div>`, box => { box.querySelector('.close').onclick = closeModal; });
}

// ============================================================ 動作送出與套用
function send(a) {
  const pid = (a.type === 'setRounds' || a.type === 'rename') ? (a.pid != null ? a.pid : [...NET.myIds][0] || 0) : G.cur;
  if (NET.role === 'client') { NET.host && NET.host.send({ t: 'act', pid, a }); return; }
  const err = R.act(G, pid, a);
  if (err) { toast(err); return; }
  afterChange(a);
}
function afterChange(a) {
  if (a && a.type === 'roll' && G.dice) rollDice(G.dice.a, G.dice.b);
  if (G.move && G.move.n !== lastMoveN) { lastMoveN = G.move.n; moveAt = performance.now(); }
  broadcast(); renderUI(); scheduleAuto();
}

let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!G || G.phase === 'over' || NET.role === 'client') return;
  if (pendingRankModal || !$('#modal').classList.contains('hidden')) {
    autoTimer = setTimeout(scheduleAuto, 350);
    return;
  }
  const p = R.cur(G);
  const wait = (G.phase === 'roll' ? 680 : animDelay()) + (G.card && G.phase === 'done' ? 1200 : 0);
  if (p.kind === 'ai') {
    autoTimer = setTimeout(() => {
      const a = R.aiAction(G);
      const e = R.act(G, p.id, a);
      if (e && a.type === 'item') R.act(G, p.id, { type: 'roll' });
      afterChange(e && a.type === 'item' ? { type: 'roll' } : a);
    }, wait);
    return;
  }
  if (G.phase === 'done') {
    autoTimer = setTimeout(() => {
      if (G.phase === 'done' && R.cur(G) === p) {
        if (!$('#modal').classList.contains('hidden')) { scheduleAuto(); return; }
        R.act(G, p.id, { type: 'end' });
        afterChange({ type: 'end' });
      }
    }, wait + 900);
  }
  if (p.kind === 'gone') autoTimer = setTimeout(() => { p.kind = 'ai'; scheduleAuto(); }, 300);
}

setInterval(() => { if (G) renderUIButtons(); }, 250);
function renderUIButtons() {
  if (!G) return;
  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  $('#btnRoll').disabled = !(my && G.phase === 'roll' && !animBusy());
  $('#btnItem').disabled = !(my && (G.phase === 'roll' || G.phase === 'done') && p.items.length > 0 && !animBusy());
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
  tokens.forEach(t => t && scene.remove(t.g)); tokens.length = 0;
  npcTokens.forEach(nt => scene.remove(nt.g)); npcTokens.clear();
  buildKey = ''; lastCard = 0; lastMoveN = 0; lastNewsId = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
  camS.pan.set(0, 0, 0);
  closeModal(); broadcast(); renderUI(); scheduleAuto(); snd('turn');
}

// ---------- 開局與玩家名字／回合數設定 ----------
function loadSavedNames() {
  try { return JSON.parse(localStorage.getItem('rich_seat_names') || '[]'); } catch (e) { return []; }
}
function saveSeatNames(names) {
  try { localStorage.setItem('rich_seat_names', JSON.stringify(names)); } catch (e) { /* 忽略 */ }
}
const roundsField = (v = 30) => `<div class="field">
  <span>回合上限</span>
  <select id="roundPreset">${[10, 20, 30, 50, 0].map(n => `<option value="${n}" ${n === v ? 'selected' : ''}>${n === 0 ? '無限回合' : n + ' 輪'}</option>`).join('')}<option value="-1">自訂</option></select>
  <input id="rounds" type="number" min="0" max="999" value="${v}" title="0 代表無限回合">
  <small style="color:var(--muted)">（0 = 無限回合）</small>
</div>`;
function wireRoundsField(box) {
  const sel = box.querySelector('#roundPreset'), inp = box.querySelector('#rounds');
  sel.onchange = () => { if (+sel.value >= 0) inp.value = sel.value; };
  inp.oninput = () => {
    const n = +inp.value;
    sel.value = [10, 20, 30, 50, 0].includes(n) ? String(n) : '-1';
  };
}

function openLobby() {
  openModal(`<h2>環島富豪 3D</h2><div class="sub">原創 3D 台灣地產桌遊：56 格全台灣地圖、神明附身（土地公強佔土地）、請神送神卡、道具屋與 Breaking News 實況廣播！</div>
    <div class="row" style="justify-content:stretch;flex-direction:column">
      <button class="primary" id="lLocal">單機遊戲（自訂名稱・對電腦或同機輪流）</button>
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

function openLocalSetup() {
  const kinds = ['local', 'ai', 'ai', 'ai'];
  const saved = loadSavedNames();
  openModal(`<h2>單機遊戲設定</h2><div class="sub">可自由修改每位玩家名字、選擇 3D 角色造型與調整回合數（開賽後也能隨時調整）。</div>
    ${R.CHARS.map((c, k) => `<div class="seat">
      <span class="dot" style="background:${c.color}"></span>
      <input data-name="${k}" maxlength="10" value="${saved[k] || c.name}" placeholder="${c.name}">
      <select data-char="${k}">${R.CHARS.map((ch, idx) => `<option value="${idx}" ${idx === k ? 'selected' : ''}>${ch.name}</option>`).join('')}</select>
      <select data-k="${k}"><option value="local" ${kinds[k] === 'local' ? 'selected' : ''}>玩家</option><option value="ai" ${kinds[k] === 'ai' ? 'selected' : ''}>電腦</option>${k > 1 ? '<option value="none">空位</option>' : ''}</select>
    </div>`).join('')}
    ${roundsField(30)}
    <div class="row"><button class="left" id="sBack">返回</button><button class="primary" id="sGo">開始環島！</button></div>`, box => {
    wireRoundsField(box);
    box.querySelector('#sBack').onclick = openLobby;
    box.querySelector('#sGo').onclick = () => {
      const names = [...box.querySelectorAll('input[data-name]')].map(i => i.value.trim());
      saveSeatNames(names);
      const chars = [...box.querySelectorAll('select[data-char]')].map(s => +s.value);
      const seats = [...box.querySelectorAll('select[data-k]')]
        .map((s, k) => ({ kind: s.value, name: names[k] || R.CHARS[chars[k]].name, char: chars[k] }))
        .filter(s => s.kind !== 'none');
      if (!seats.some(s => s.kind === 'local')) seats[0].kind = 'local';
      NET.role = 'local';
      const rounds = Math.max(0, Math.min(999, Number(box.querySelector('#rounds').value) || 0));
      startGame(seats, rounds);
    };
  });
}

function openHost() {
  if (!window.Peer) return toast('連線元件載入失敗');
  leaveNet();
  const saved = loadSavedNames();
  NET.role = 'host'; NET.code = Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  NET.seats = R.CHARS.map((c, k) => ({ kind: k === 0 ? 'local' : 'open', owner: k === 0 ? 'host' : null, name: saved[k] || c.name, char: k }));
  NET.myIds = new Set([0]);
  const peer = NET.peer = new window.Peer(PEER_PREFIX + NET.code);
  const draw = () => {
    if (NET.role !== 'host' || G) return;
    openModal(`<h2>線上房間</h2><div class="sub">把代碼告訴朋友即可加入。房主與各座位皆可自訂名稱，未加入的位置可設為電腦。</div>
      <div class="code">${NET.code}</div><div class="sub" id="hStatus" style="text-align:center">${peer.open ? '房間已開啟，等待玩家加入…' : '正在連線伺服器…'}</div>
      ${NET.seats.map((s, k) => `<div class="seat">
        <span class="dot" style="background:${R.CHARS[k].color}"></span>
        ${k === 0 || s.kind === 'ai' ? `<input data-hn="${k}" maxlength="10" value="${s.name}">` : `<b>${s.name}</b>`}
        <select data-hc="${k}" ${s.kind === 'remote' ? 'disabled' : ''}>${R.CHARS.map((ch, idx) => `<option value="${idx}" ${idx === s.char ? 'selected' : ''}>${ch.name}</option>`).join('')}</select>
        <span>${k === 0 ? '房主' : s.kind === 'remote' ? '✅ 已加入' : `<select data-k="${k}"><option value="open" ${s.kind === 'open' ? 'selected' : ''}>等待玩家</option><option value="ai" ${s.kind === 'ai' ? 'selected' : ''}>電腦</option><option value="none" ${s.kind === 'none' ? 'selected' : ''}>空位</option></select>`}</span>
      </div>`).join('')}
      ${roundsField(30)}
      <div class="row"><button class="left" id="hBack">取消</button><button class="primary" id="hGo">開始遊戲</button></div>`, box => {
      wireRoundsField(box);
      box.querySelectorAll('input[data-hn]').forEach(inp => inp.onchange = () => {
        const idx = +inp.dataset.hn;
        NET.seats[idx].name = inp.value.trim() || R.CHARS[idx].name;
        pushLobby();
      });
      box.querySelectorAll('select[data-hc]').forEach(s => s.onchange = () => {
        NET.seats[+s.dataset.hc].char = +s.value;
        pushLobby();
      });
      box.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => {
        NET.seats[+s.dataset.k].kind = s.value;
        pushLobby();
      });
      box.querySelector('#hBack').onclick = () => { leaveNet(); openLobby(); };
      box.querySelector('#hGo').onclick = () => {
        const used = NET.seats.filter(s => s.kind === 'local' || s.kind === 'remote' || s.kind === 'ai');
        if (used.length < 2) return toast('至少需要兩位玩家（可以把座位設成電腦）');
        const seats = used.map(s => ({ kind: s.kind === 'remote' ? 'remote' : s.kind, owner: s.owner, name: s.name, char: s.char }));
        NET.myIds = new Set(seats.map((s, k) => s.owner === 'host' ? k : -1).filter(k => k >= 0));
        for (const c of NET.conns) c.open && c.send({ t: 'start', ids: seats.map((s, k) => s.owner === c.peer ? k : -1).filter(k => k >= 0) });
        const rounds = Math.max(0, Math.min(999, Number(box.querySelector('#rounds').value) || 0));
        startGame(seats, rounds);
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
        const ch = m.char != null ? ((m.char | 0) % R.CHARS.length) : k;
        NET.seats[k] = { kind: 'remote', owner: conn.peer, name: String(m.name || R.CHARS[ch].name).trim().slice(0, 10) || R.CHARS[ch].name, char: ch };
        pushLobby(); toast(`${NET.seats[k].name} 加入了房間`);
      } else if (m.t === 'act' && G) {
        if (m.a.type === 'setRounds') return;
        const targetPid = m.a.type === 'rename' ? (m.a.pid != null ? m.a.pid : m.pid) : m.pid;
        if (!G.players[targetPid] || G.players[targetPid].owner !== conn.peer) return;
        const err = R.act(G, m.pid, m.a);
        if (err) conn.send({ t: 'err', err }); else afterChange(m.a);
      }
    });
    conn.on('close', () => {
      NET.conns = NET.conns.filter(c => c !== conn);
      if (!G) { const k = NET.seats.findIndex(s => s.owner === conn.peer); if (k >= 0) { NET.seats[k] = { kind: 'open', owner: null, name: R.CHARS[k].name, char: k }; pushLobby(); } return; }
      G.players.forEach(p => { if (p.owner === conn.peer && !p.bankrupt) { p.kind = 'ai'; G.log.push(`${p.name} 離線，改由電腦接手`); } });
      afterChange(null); toast('有玩家離線，改由電腦接手');
    });
  });
  draw();
}

function openJoin() {
  if (!window.Peer) return toast('連線元件載入失敗');
  let saved = ''; try { saved = localStorage.getItem('rich_name') || ''; } catch (e) { /* 忽略 */ }
  openModal(`<h2>加入線上房間</h2><div class="sub">輸入朋友給你的 5 碼房間代碼與你的名字。</div>
    <label class="field">房間代碼 <input id="jCode" maxlength="5" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.2em;width:140px"></label>
    <label class="field">你的名字 <input id="jName" maxlength="10" value="${saved}" placeholder="輸入自訂名字"></label>
    <label class="field">角色造型 <select id="jChar">${R.CHARS.map((c, idx) => `<option value="${idx}">${c.name}（${c.desc}）</option>`).join('')}</select></label>
    <div class="sub" id="jStatus"></div>
    <div class="row"><button class="left" id="jBack">返回</button><button class="primary" id="jGo">加入</button></div>`, box => {
    box.querySelector('#jBack').onclick = openLobby;
    box.querySelector('#jGo').onclick = () => {
      const code = box.querySelector('#jCode').value.trim().toUpperCase();
      const name = box.querySelector('#jName').value.trim();
      const char = +box.querySelector('#jChar').value;
      if (code.length !== 5) return toast('房間代碼是 5 個字');
      try { localStorage.setItem('rich_name', name); } catch (e) { /* 忽略 */ }
      leaveNet(); NET.role = 'client'; NET.code = code;
      const st = box.querySelector('#jStatus'); st.textContent = '連線中…';
      const peer = NET.peer = new window.Peer();
      peer.on('error', e => { st.textContent = e.type === 'peer-unavailable' ? '找不到這個房間，請確認代碼' : '連線錯誤：' + (e.type || e.message); });
      peer.on('open', () => {
        const conn = NET.host = peer.connect(PEER_PREFIX + code, { reliable: true });
        conn.on('open', () => { conn.send({ t: 'hello', name, char }); st.textContent = '已連上，等待房主開始…'; });
        conn.on('data', m => {
          if (m.t === 'lobby') {
            if (G) return;
            openModal(`<h2>房間 ${m.code}</h2><div class="sub">等待房主開始遊戲…</div>${m.seats.map((s, k) => `<div class="seat" style="grid-template-columns:24px 1fr auto"><span class="dot" style="background:${R.CHARS[k].color}"></span><b>${s.name}${s.owner === peer.id ? '（你）' : ''}</b><span>${s.kind === 'local' ? '房主' : s.kind === 'remote' ? '已加入' : s.kind === 'ai' ? '電腦' : s.kind === 'open' ? '等待中' : '空位'}</span></div>`).join('')}
              <div class="row"><button id="wLeave">離開</button></div>`, bx => { bx.querySelector('#wLeave').onclick = () => { leaveNet(); openLobby(); }; });
          } else if (m.t === 'start') { NET.myIds = new Set(m.ids); netInfo(`🌐 已連線・${code}`); }
          else if (m.t === 'state') {
            const first = !G, prevDice = G && G.dice ? G.dice.n : 0;
            G = m.G;
            if (first) {
              closeModal();
              tokens.forEach(t => t && scene.remove(t.g)); tokens.length = 0;
              npcTokens.forEach(nt => scene.remove(nt.g)); npcTokens.clear();
              buildKey = ''; lastCard = 0; lastMoveN = 0; lastNewsId = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
              camS.pan.set(0, 0, 0);
            }
            if (G.dice && G.dice.n !== prevDice) rollDice(G.dice.a, G.dice.b);
            if (G.move && G.move.n !== lastMoveN) { lastMoveN = G.move.n; moveAt = performance.now(); }
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
window.__rich = { get G() { return G; }, send, NET, camS, renderUI, openLeaderboardModal };
