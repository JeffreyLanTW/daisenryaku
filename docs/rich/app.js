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

// ============================================================ 3D 場景與 56 格台灣棋盤座標
const S = 10, HX = 6, HZ = 8; // 棋盤外圍：X in [-60..+60], Z in [-80..+80]，共 56 格
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#09131d');
scene.fog = new THREE.Fog('#09131d', 300, 640);

const camera = new THREE.PerspectiveCamera(40, 1, 1, 2200);
scene.add(new THREE.HemisphereLight('#f0f6ff', '#3a4a38', 1.15));
const sun = new THREE.DirectionalLight('#fff4df', 2.25);
sun.position.set(-75, 145, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 120, bottom: -120, near: 10, far: 480 });
scene.add(sun);

function sideOf(i) {
  if (i < 12) return 0;      // 南岸（右下起點 → 西）
  if (i < 28) return 1;      // 西岸（左下監獄 → 北）
  if (i < 40) return 2;      // 北岸（左上公園 → 東）
  return 3;                  // 東岸（右上入獄 → 南）
}
function tilePos(i) {
  let gx, gz;
  if (i < 12) { gx = HX - i; gz = HZ; }
  else if (i < 28) { gx = -HX; gz = HZ - (i - 12); }
  else if (i < 40) { gx = -HX + (i - 28); gz = -HZ; }
  else { gx = HX; gz = -HZ + (i - 40); }
  return new THREE.Vector3(gx * S, 0, gz * S);
}
const INWARD_SIDE = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-1, 0, 0),
];
const isCorner = i => i === 0 || i === 12 || i === 28 || i === 40;
function inward(i) {
  if (isCorner(i)) {
    const p = tilePos(i);
    return new THREE.Vector3(-Math.sign(p.x) * 0.7, 0, -Math.sign(p.z) * 0.7);
  }
  return INWARD_SIDE[sideOf(i)].clone();
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

function tree(scale = 1, color = '#2f7d3b') {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.48 * scale, 2.2 * scale, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b' }));
  trunk.position.y = 1.1 * scale;
  const top = new THREE.Mesh(new THREE.ConeGeometry(2.0 * scale, 4.2 * scale, 7), new THREE.MeshStandardMaterial({ color, flatShading: true }));
  top.position.y = 3.9 * scale;
  g.add(trunk, top);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- 3D 台灣本島、離島與地標建築 ----------
const TW_POLY = [
  [121.53, 25.30], [121.75, 25.15], [122.00, 25.01], [121.85, 24.75], [121.87, 24.50], [121.75, 24.30],
  [121.63, 24.00], [121.55, 23.70], [121.45, 23.35], [121.30, 23.05], [121.15, 22.75], [120.95, 22.45],
  [120.88, 22.15], [120.86, 21.90], [120.72, 22.00], [120.68, 22.25], [120.45, 22.45], [120.28, 22.62],
  [120.15, 22.85], [120.10, 23.00], [120.12, 23.40], [120.25, 23.80], [120.45, 24.15], [120.65, 24.45],
  [120.90, 24.75], [121.05, 25.00], [121.30, 25.15],
];
const twXZ = (lon, lat) => [(lon - 121.0) * 34, -(lat - 23.62) * 36];

function buildTaiwanIsland() {
  const tw = new THREE.Group();
  // 海洋底板與淺灘水域
  const sea = new THREE.Mesh(
    new THREE.BoxGeometry(S * 11.2, 0.9, S * 15.2),
    new THREE.MeshStandardMaterial({ color: '#0d3d61', roughness: 0.35, metalness: 0.15 })
  );
  sea.position.y = -0.35; sea.receiveShadow = true;
  tw.add(sea);

  // 台灣形狀（Shape 在 XY 平面，旋轉 -90° 後 +X 為東、+Y 變成 -Z 為北）
  const shape = new THREE.Shape();
  TW_POLY.forEach(([lon, lat], k) => {
    const sx = (lon - 121.0) * 34, sy = (lat - 23.62) * 36;
    if (k === 0) shape.moveTo(sx, sy); else shape.lineTo(sx, sy);
  });
  shape.closePath();

  // 沙灘底座
  const beachGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 1.4, bevelSegments: 2 });
  const beach = new THREE.Mesh(beachGeo, new THREE.MeshStandardMaterial({ color: '#c7b887', roughness: 0.95 }));
  beach.rotation.x = -Math.PI / 2; beach.position.y = 0.02; beach.receiveShadow = true;
  tw.add(beach);

  // 綠意本島平原
  const landGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.25, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 2 });
  const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({ color: '#2f7f45', roughness: 0.85 }));
  land.rotation.x = -Math.PI / 2; land.position.y = 0.32; land.castShadow = true; land.receiveShadow = true;
  tw.add(land);

  // 中央山脈・雪山山脈・玉山主峰
  const peaks = [
    [121.42, 24.45, 5.2, 5.8, '#28643a'],
    [121.25, 24.25, 6.2, 7.2, '#346941'],
    [121.18, 24.00, 6.6, 8.2, '#3e6e46'],
    [120.96, 23.47, 7.4, 10.6, '#48744d', true], // 玉山雪頂
    [120.92, 23.10, 5.8, 7.0, '#366840'],
    [120.82, 22.72, 5.0, 5.8, '#2e633b'],
    [121.48, 23.82, 4.6, 5.6, '#2b6139'], // 海岸山脈
    [121.35, 23.42, 4.4, 5.0, '#2b6139'],
  ];
  for (const [lon, lat, r, h, col, snow] of peaks) {
    const [x, z] = twXZ(lon, lat);
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), new THREE.MeshStandardMaterial({ color: col, flatShading: true, roughness: 0.9 }));
    m.position.set(x, 1.55 + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    tw.add(m);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.36, 6), new THREE.MeshStandardMaterial({ color: '#f3f7fa', flatShading: true }));
      cap.position.set(x, 1.55 + h * 0.84, z);
      tw.add(cap);
    }
  }

  // 日月潭湛藍湖面
  const [smlX, smlZ] = twXZ(120.91, 23.86);
  const lake = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 14), new THREE.MeshStandardMaterial({ color: '#2b9cd8', roughness: 0.25 }));
  lake.scale.set(1.2, 1, 0.85); lake.position.set(smlX, 1.68, smlZ);
  tw.add(lake);

  // 離島群島（安全置於內海區域）
  const islets = [
    [-37, 2, 3.0, 1.3],   // 澎湖
    [-43, -42, 2.4, 1.1], // 金門
    [-35, -58, 1.8, 1.0], // 馬祖
    [34, 34, 1.7, 1.1],   // 綠島
    [36, 50, 2.1, 1.2],   // 蘭嶼
  ];
  for (const [x, z, r, h] of islets) {
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(r + 1.2, r + 1.5, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#19698e', roughness: 0.5 }));
    sh.position.set(x, 0.05, z);
    const il = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, h, 7), new THREE.MeshStandardMaterial({ color: '#39884f', flatShading: true }));
    il.position.set(x, 0.5 + h / 2, z); il.castShadow = true; il.receiveShadow = true;
    tw.add(sh, il);
  }

  // ---- 本島 3D 地標建築 ----
  // 1) 台北 101
  {
    const [x, z] = twXZ(121.56, 25.03);
    const t101 = new THREE.Group();
    const glass = new THREE.MeshStandardMaterial({ color: '#45b8a4', metalness: 0.35, roughness: 0.25 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 3.2), glass);
    base.position.y = 1.1; t101.add(base);
    for (let k = 0; k < 6; k++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.5 - k * 0.06, 1.25 - k * 0.05, 1.45, 4), glass);
      seg.rotation.y = Math.PI / 4; seg.position.y = 2.8 + k * 1.35; t101.add(seg);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.28, 3.4, 6), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#5a4300', metalness: 0.7 }));
    spire.position.y = 11.8; t101.add(spire);
    t101.position.set(x, 1.6, z);
    t101.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    tw.add(t101);
  }

  // 2) 高雄 85 大樓
  {
    const [x, z] = twXZ(120.30, 22.63);
    const k85 = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ color: '#6b9ac4', metalness: 0.4, roughness: 0.3 });
    for (const dx of [-1.0, 1.0]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.8, 1.5), bm);
      leg.position.set(dx, 2.4, 0); k85.add(leg);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.8, 1.5), bm);
    mid.position.y = 6.2; k85.add(mid);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#f39c12' }));
    top.rotation.y = Math.PI / 4; top.position.y = 9.1; k85.add(top);
    k85.position.set(x, 1.6, z);
    k85.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    tw.add(k85);
  }

  // 3) 鵝鑾鼻燈塔
  {
    const [x, z] = twXZ(120.84, 21.94);
    const lh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 4.6, 12), new THREE.MeshStandardMaterial({ color: '#f7f9fb' }));
    body.position.y = 2.3;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 12), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#f1c40f', emissiveIntensity: 0.6 }));
    lamp.position.y = 4.9;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 12), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    roof.position.y = 5.8;
    lh.add(body, lamp, roof); lh.position.set(x, 1.55, z);
    lh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    tw.add(lh);
  }

  // 4) 太魯閣牌樓（花東地標）
  {
    const [x, z] = twXZ(121.60, 24.14);
    const gate = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: '#c0392b' });
    for (const dx of [-1.4, 1.4]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 3.0, 8), red);
      col.position.set(dx, 1.5, 0); gate.add(col);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.65, 1.2), new THREE.MeshStandardMaterial({ color: '#1e8449' }));
    roof.position.y = 3.1; gate.add(roof);
    gate.position.set(x, 1.6, z);
    gate.traverse(o => { if (o.isMesh) o.castShadow = true; });
    tw.add(gate);
  }

  // 5) 台中・西部平原小樹與標題字板
  for (const [lon, lat] of [[120.68, 24.16], [120.38, 23.22], [120.78, 23.52], [121.65, 24.68], [121.15, 22.92]]) {
    const [x, z] = twXZ(lon, lat);
    const tr = tree(0.85); tr.position.set(x, 1.55, z); tw.add(tr);
  }

  // 海面題字
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 13),
    new THREE.MeshBasicMaterial({
      transparent: true,
      map: canvasTex(768, 280, (c, w, h) => {
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 102px "PingFang TC","Noto Sans TC",sans-serif';
        c.fillStyle = 'rgba(255, 218, 110, 0.92)'; c.fillText('環島富豪', w / 2, h * 0.40);
        c.font = '700 42px "PingFang TC","Noto Sans TC",sans-serif';
        c.fillStyle = 'rgba(195, 230, 255, 0.78)'; c.fillText('TAIWAN 3D TYCOON', w / 2, h * 0.78);
      }),
    })
  );
  banner.rotation.x = -Math.PI / 2;
  banner.position.set(27, 0.25, -45);
  tw.add(banner);

  board.add(tw);
}

function makeTileProp(t) {
  const g = new THREE.Group();
  if (t.type === 'start') {
    const red = new THREE.MeshStandardMaterial({ color: '#c0392b' });
    const gold = new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.5, roughness: 0.35 });
    for (const x of [-2.4, 2.4]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.8, 8), red);
      p.position.set(x, 2.4, -2.8); g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.9, 1.0), gold);
    beam.position.set(0, 4.9, -2.8); g.add(beam);
  } else if (t.type === 'jail') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.4, 0.5), new THREE.MeshStandardMaterial({ color: '#6b7280' }));
    wall.position.set(0, 1.7, -3.0); g.add(wall);
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.6, 6), new THREE.MeshStandardMaterial({ color: '#272e36', metalness: 0.6 }));
      bar.position.set(k * 1.1, 2.3, -1.6); g.add(bar);
    }
  } else if (t.type === 'gojail') {
    const booth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.0, 2.6), new THREE.MeshStandardMaterial({ color: '#2c3e50' }));
    booth.position.set(0, 1.5, -2.2); g.add(booth);
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshStandardMaterial({ color: '#e74c3c', emissive: '#c0392b' }));
    l1.position.set(-0.7, 3.3, -2.2);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshStandardMaterial({ color: '#3498db', emissive: '#2980b9' }));
    l2.position.set(0.7, 3.3, -2.2);
    g.add(l1, l2);
  } else if (t.type === 'park') {
    const tr = tree(0.85); tr.position.set(-2.2, 0, -2.0); g.add(tr);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#27ae60' }));
    roof.position.set(1.6, 3.0, -2.0);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 2.2, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#b77944', side: THREE.DoubleSide }));
    col.position.set(1.6, 1.1, -2.0);
    g.add(roof, col);
  } else if (t.type === 'shop') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 3.0), new THREE.MeshStandardMaterial({ color: '#f3e5ab' }));
    body.position.set(0, 1.4, -2.1);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.5, 1.8), new THREE.MeshStandardMaterial({ color: '#9b59b6' }));
    awning.position.set(0, 2.7, -0.5); awning.rotation.x = 0.28;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.35), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#6e5200' }));
    sign.position.set(0, 3.4, -2.1);
    g.add(body, awning, sign);
  } else if (t.type === 'temple') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.2, 3.2), new THREE.MeshStandardMaterial({ color: '#d35400' }));
    base.position.set(0, 1.1, -2.1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), new THREE.MeshStandardMaterial({ color: '#c0392b' }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 0.85, 0.8); roof.position.set(0, 3.0, -2.1);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: '#f1c40f' }));
    ridge.position.set(0, 3.7, -2.1);
    g.add(base, roof, ridge);
    for (const x of [-1.8, 1.8]) {
      const lt = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#ff4757', emissive: '#b31b24' }));
      lt.position.set(x, 2.2, -0.5); g.add(lt);
    }
  } else if (t.type === 'hospital') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 3.2), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    b.position.set(0, 1.8, -2.0);
    const red = new THREE.MeshStandardMaterial({ color: '#e74c3c', emissive: '#5c140e' });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.25), red); c1.position.set(0, 2.6, -0.35);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.25), red); c2.position.set(0, 2.6, -0.35);
    g.add(b, c1, c2);
  } else if (t.type === 'tax') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.0, 2.8), new THREE.MeshStandardMaterial({ color: '#95a5a6' }));
    b.position.set(0, 1.5, -2.1);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.35, 14), new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6 }));
    coin.rotation.x = Math.PI / 2; coin.position.set(0, 3.7, -2.1);
    g.add(b, coin);
  } else if (t.type === 'station') {
    if (t.name.includes('機場')) {
      const twr = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 4.4, 8), new THREE.MeshStandardMaterial({ color: '#cbd5e1' }));
      twr.position.set(-1.6, 2.2, -2.4);
      const plane = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      plane.rotation.z = -Math.PI / 2; plane.position.set(1.2, 2.4, -1.6);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 3.4), new THREE.MeshStandardMaterial({ color: '#38bdf8' }));
      wing.position.set(1.2, 2.4, -1.6);
      g.add(twr, plane, wing);
    } else if (t.name.includes('港')) {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 2.0), new THREE.MeshStandardMaterial({ color: '#1e3a5f' }));
      hull.position.set(0, 0.6, -2.2);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      cab.position.set(-1.1, 1.8, -2.2);
      const crane = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.8, 0.45), new THREE.MeshStandardMaterial({ color: '#e74c3c' }));
      crane.position.set(1.6, 1.9, -2.5);
      g.add(hull, cab, crane);
    } else {
      // 高鐵 700T 車頭
      const train = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.4, 1.7), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      train.position.set(0, 0.9, -2.2);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.65, 0.35, 1.75), new THREE.MeshStandardMaterial({ color: '#f97316' }));
      stripe.position.set(0, 0.85, -2.2);
      g.add(train, stripe);
    }
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

(function buildBoard() {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(S * 13.4, 2.2, S * 17.4),
    new THREE.MeshStandardMaterial({ color: '#241d15', roughness: 1 })
  );
  base.position.y = -1.7; base.receiveShadow = true;
  board.add(base);

  buildTaiwanIsland();

  R.BOARD.forEach((t, i) => {
    const gc = t.group ? R.GROUPS[t.group].color : null;
    const [bg, accent, label, sub] = TYPE_STYLE[t.type] || ['#fbf6ea', gc, t.name, '$' + t.price];
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      if (t.type === 'land') { c.fillStyle = gc; c.fillRect(0, 0, w, 62); }
      else { c.fillStyle = accent; c.fillRect(0, 0, w, 16); }
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1d2026';
      const name = (t.type === 'land' || t.type === 'station' || t.type === 'temple') ? t.name : label;
      const fs = name.length >= 4 ? 46 : name.length === 3 ? 56 : 68;
      c.font = `800 ${fs}px "PingFang TC","Noto Sans TC",sans-serif`;
      c.fillText(name, w / 2, t.type === 'land' ? 128 : 114);
      c.font = '700 32px "PingFang TC","Noto Sans TC",sans-serif';
      c.fillStyle = t.type === 'land' ? '#5b4a2a' : accent;
      c.fillText(t.type === 'land' || t.type === 'station' ? '$' + t.price : sub, w / 2, t.type === 'land' ? 194 : 186);
    });
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#d8ccb0' });
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(S * 0.96, 1.4, S * 0.96),
      [edgeMat, edgeMat, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), edgeMat, edgeMat, edgeMat]
    );
    const p = tilePos(i);
    tile.position.set(p.x, 0, p.z);
    tile.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(i)];
    tile.receiveShadow = true; tile.userData.i = i;
    board.add(tile);

    const prop = makeTileProp(t);
    if (prop.children.length) {
      prop.position.set(p.x, 0.7, p.z);
      prop.rotation.y = tile.rotation.y;
      board.add(prop);
    }
  });
})();

// ---------- 地產建築（台灣街屋 → 騎樓透天 → 現代公寓 → 摩天大樓）----------
const buildG = new THREE.Group();
scene.add(buildG);
let buildKey = '';

function houseMesh(level, color) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#f5ecd9', roughness: 0.8 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const win = new THREE.MeshStandardMaterial({ color: '#87ceeb', emissive: '#1e3f5a', roughness: 0.25 });
  if (level === 1) {
    // 平房：紅磚瓦房＋庭院
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 2.8), wall); b.position.y = 1.1;
    const r = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.7, 4), roof); r.position.y = 3.0; r.rotation.y = Math.PI / 4;
    g.add(b, r);
  } else if (level === 2) {
    // 透天：台灣雙棟騎樓透天＋招牌
    for (const [x, h] of [[-1.5, 4.0], [1.6, 3.4]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.5, h, 2.8), wall); b.position.set(x, h / 2, 0);
      const r = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.4, 4), roof); r.position.set(x, h + 0.7, 0); r.rotation.y = Math.PI / 4;
      g.add(b, r);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#6a5200' }));
    sign.position.set(-2.9, 2.6, 1.0); g.add(sign);
  } else if (level === 3) {
    // 公寓：多層立體窗格＋頂樓水塔
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.8, 6.8, 3.5), wall); b.position.y = 3.4; g.add(b);
    for (let y = 1.2; y < 6.5; y += 1.6) {
      for (const x of [-1.4, 0, 1.4]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.14), win);
        w.position.set(x, y, 1.76); g.add(w);
      }
    }
    const rf = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.5, 3.8), roof); rf.position.y = 7.05; g.add(rf);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10), new THREE.MeshStandardMaterial({ color: '#d4dce3', metalness: 0.6 }));
    tank.position.set(1.4, 7.9, -0.6); g.add(tank);
  } else if (level === 4) {
    // 摩天大樓：帷幕玻璃＋金冠天線
    const glass = new THREE.MeshStandardMaterial({ color: '#cad8e6', metalness: 0.4, roughness: 0.28 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 12.6, 4.4), glass); b.position.y = 6.3; g.add(b);
    for (let y = 1.2; y < 12.2; y += 1.4) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.55, 4.5), win);
      w.position.y = y; g.add(w);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.8, 2.8), roof); crown.position.y = 13.5; g.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#695100' }));
    spire.position.y = 16.0; g.add(spire);
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
    const p = tilePos(i), inw = inward(i), rotY = [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(i)];
    if (s.owner != null) {
      const col = G.players[s.owner].color;
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(S * 0.96, 0.24, S * 0.96),
        new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.45 })
      );
      plate.position.set(p.x, 0.78, p.z); buildG.add(plate);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4), new THREE.MeshStandardMaterial({ color: '#eee' }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 0.12), new THREE.MeshStandardMaterial({ color: col }));
      const fx = p.x + inw.x * 3.5 + (inw.z ? 3.5 : 0), fz = p.z + inw.z * 3.5 + (inw.x ? 3.5 : 0);
      pole.position.set(fx, 2.4, fz); flag.position.set(fx + 0.8, 3.6, fz);
      buildG.add(pole, flag);
      if (s.level > 0) {
        const h = houseMesh(s.level, col);
        h.position.set(p.x + inw.x * 1.6, 0.7, p.z + inw.z * 1.6);
        h.rotation.y = rotY;
        buildG.add(h);
      }
    }
  });
  for (const b of G.blocks) {
    const p = tilePos(b.i);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.0, 12), new THREE.MeshStandardMaterial({ color: '#e74c3c' }));
    cone.position.set(p.x, 2.2, p.z); cone.castShadow = true;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.65, 0.65), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    bar.position.set(p.x, 1.5, p.z); bar.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(b.i)];
    buildG.add(cone, bar);
  }
}

// ---------- 玩家 3D 造型棋子（含肢體、專屬帽飾、配件與神明光環）----------
const tokens = [];
function makeToken(pl) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.45 });
  const skinM = new THREE.MeshStandardMaterial({ color: '#f4cba3', roughness: 0.6 });
  const darkM = new THREE.MeshStandardMaterial({ color: '#1f242b', roughness: 0.7 });

  // 底座圓盤
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.35, 18), bodyM);
  base.position.y = 0.18; g.add(base);

  // 雙腳
  for (const x of [-0.52, 0.52]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 1.05), darkM);
    foot.position.set(x, 0.6, 0.1); g.add(foot);
  }

  // 身體
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.25, 2.1, 14), bodyM);
  torso.position.y = 1.9; g.add(torso);

  // 手臂（可擺動）
  const leftArm = new THREE.Group(), rightArm = new THREE.Group();
  const armGeo = new THREE.CapsuleGeometry(0.28, 0.9, 4, 8);
  const la = new THREE.Mesh(armGeo, bodyM); la.position.y = -0.45; leftArm.add(la);
  leftArm.position.set(-1.3, 2.65, 0);
  const ra = new THREE.Mesh(armGeo, bodyM); ra.position.y = -0.45; rightArm.add(ra);
  rightArm.position.set(1.3, 2.65, 0);
  g.add(leftArm, rightArm);

  // 頭與表情
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 14), skinM);
  head.position.y = 4.05; g.add(head);
  for (const x of [-0.42, 0.42]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), darkM);
    eye.position.set(x, 4.18, 1.12); g.add(eye);
  }

  // 角色專屬帽飾與手持配件
  const hatM = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.38 });
  const hat = R.CHARS[pl.char].hat;
  if (hat === 'cap') {
    // 阿凱：台灣黑熊胸前白 V＋棒球帽＋背包
    const vmark = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.2), new THREE.MeshStandardMaterial({ color: '#fff' }));
    vmark.position.set(0, 2.35, 1.08); g.add(vmark);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatM);
    cap.position.y = 4.35;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 1.15), hatM);
    visor.position.set(0, 4.4, 1.25);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 0.8), darkM);
    pack.position.set(0, 2.0, -1.1);
    g.add(cap, visor, pack);
  } else if (hat === 'bow') {
    // 小晴：蝴蝶結頭飾＋手拿珍珠奶茶
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.4, 16), hatM);
    beret.position.set(0, 5.1, -0.1); g.add(beret);
    for (const x of [-0.65, 0.65]) {
      const k = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), new THREE.MeshStandardMaterial({ color: '#ff6b9d' }));
      k.position.set(x, 5.45, 0.1); k.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(k);
    }
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.85, 10), new THREE.MeshStandardMaterial({ color: '#e6b88a' }));
    cup.position.set(0, -1.0, 0.45);
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), darkM);
    straw.position.set(0, -0.45, 0.45);
    rightArm.add(cup, straw);
  } else if (hat === 'hat') {
    // 老陳：紳士高禮帽＋黃金公事包
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.16, 20), darkM);
    brim.position.y = 4.95;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1.35, 16), darkM);
    top.position.y = 5.65;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17, 1.17, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#f1c40f' }));
    band.position.y = 5.1;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.9, 1.15), new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.4 }));
    bag.position.set(0, -1.15, 0.2);
    rightArm.add(bag);
    g.add(brim, top, band);
  } else {
    // 安娜：皇冠＋披風＋金色權杖
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.85, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.7, roughness: 0.25, side: THREE.DoubleSide }));
    cr.position.y = 5.4;
    const cape = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.2, 0.18), new THREE.MeshStandardMaterial({ color: '#a93226' }));
    cape.position.set(0, 1.9, -1.1); cape.rotation.x = 0.14;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 8), new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6 }));
    staff.position.set(0, -0.3, 0.35);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshStandardMaterial({ color: '#fff08a', emissive: '#f1c40f' }));
    orb.position.set(0, 1.55, 0.35);
    rightArm.add(staff, orb);
    g.add(cr, cape);
  }

  // 神明附身視覺（光環＋頭頂神明標識）
  const godVis = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.16, 8, 28), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#a67c00' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.35;
  const spirit = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#997000' }));
  spirit.position.y = 6.9;
  godVis.add(ring, spirit);
  godVis.visible = false;
  g.add(godVis);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.88);
  scene.add(g);
  return { g, leftArm, rightArm, godVis, ring, spirit, pos: pl.pos, path: [], t: 0, moveN: 0 };
}

// ---------- 地圖移動 NPC 3D 模型（土地公、財神、福神、窮神、衰神、野狗）----------
const npcTokens = new Map();
function makeNpcToken(npc) {
  const g = new THREE.Group();
  const info = R.GODS[npc.kind];
  if (npc.kind === 'dog') {
    const fur = new THREE.MeshStandardMaterial({ color: '#c07a3e', roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: '#222' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 2.3), fur); body.position.y = 1.25; g.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 1.15), fur); head.position.set(0, 2.05, 1.15); g.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: '#e6b891' })); snout.position.set(0, 1.85, 1.85); g.add(snout);
    for (const x of [-0.48, 0.48]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 4), fur); ear.position.set(x, 2.75, 1.05); g.add(ear);
      for (const z of [-0.75, 0.75]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.9, 6), fur); leg.position.set(x, 0.45, z); g.add(leg);
      }
    }
    const collar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 1.2), new THREE.MeshStandardMaterial({ color: '#e74c3c' })); collar.position.set(0, 1.55, 0.95); g.add(collar);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6), fur); tail.position.set(0, 1.8, -1.35); tail.rotation.x = -0.6; g.add(tail);
    g.userData.tail = tail;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), dark); nose.position.set(0, 2.0, 2.18); g.add(nose);
  } else {
    const robeCol = npc.kind === 'tudigong' ? '#d48806' : npc.kind === 'caishen' ? '#c0392b' : npc.kind === 'fushen' ? '#1e8449' : npc.kind === 'qiongshen' ? '#5d6d7e' : '#6c3483';
    const robe = new THREE.MeshStandardMaterial({ color: robeCol, roughness: 0.55 });
    const skin = new THREE.MeshStandardMaterial({ color: '#f3caa2', roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6, roughness: 0.28 });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 8, 24), new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.35 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.45, 2.4, 12), robe); body.position.y = 1.3; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), skin); head.position.y = 3.25; g.add(head);

    if (npc.kind === 'tudigong') {
      // 土地公：白長鬚、員外帽、金元寶、拐杖
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      beard.rotation.x = Math.PI; beard.position.set(0, 2.15, 0.95); g.add(beard);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.9, 12), gold); hat.position.y = 4.25; g.add(hat);
      const ingot = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.65), gold); ingot.position.set(0, 1.9, 1.25); g.add(ingot);
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#6b4a2b' })); cane.position.set(1.35, 1.6, 0.4); g.add(cane);
    } else if (npc.kind === 'caishen') {
      // 財神爺：展翅官帽＋大金元寶
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1.0, 10), gold); cap.position.y = 4.3; g.add(cap);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 0.5), gold); wings.position.y = 4.1; g.add(wings);
      const bigIngot = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.65, 0.8), gold); bigIngot.position.set(0, 2.0, 1.35); g.add(bigIngot);
    } else if (npc.kind === 'fushen') {
      // 福神：玉冠＋如意
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.85, 8), new THREE.MeshStandardMaterial({ color: '#2ecc71' })); cap.position.y = 4.25; g.add(cap);
      const ruyi = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 6, 12), gold); ruyi.position.set(1.1, 2.2, 0.6); g.add(ruyi);
    } else if (npc.kind === 'qiongshen') {
      // 窮神：破草帽＋暗灰光環
      const hat = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#8c7a5b', flatShading: true })); hat.position.y = 4.35; g.add(hat);
    } else {
      // 衰神：烏雲＋閃電
      const cloud = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({ color: '#2c2f3a', flatShading: true })); cloud.scale.set(1.5, 0.65, 1.1); cloud.position.y = 5.4; g.add(cloud);
      const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.3, 4), new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#d4ac0d' })); bolt.rotation.x = Math.PI; bolt.position.y = 4.5; g.add(bolt);
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(0.85);
  scene.add(g);
  return { g, pos: npc.pos, from: npc.pos, t: 1, moveN: npc.moveN || 0 };
}

const slotOff = k => new THREE.Vector3([-2.1, 2.1, -2.1, 2.1][k % 4], 0, [-2.1, -2.1, 2.1, 2.1][k % 4]);
const tokenWorld = (i, k) => tilePos(i).add(slotOff(k)).setY(0.7);
const npcWorld = i => tilePos(i).add(new THREE.Vector3(0, 0.72, 0)).add(inward(i).multiplyScalar(-2.4));

// ---------- 骰子 ----------
const pipTex = n => canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, w); c.fillStyle = n === 1 ? '#c0392b' : '#1b1b1b';
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  for (const [x, y] of P) { c.beginPath(); c.arc(x * w, y * w, n === 1 ? 16 : 11, 0, 7); c.fill(); }
});
const FACE = [3, 4, 1, 6, 2, 5];
const diceMats = FACE.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.4 }));
const dice = [0, 1].map(k => { const m = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.4, 4.4), diceMats); m.castShadow = true; m.position.set(k ? 6 : -6, 3.6, 12); scene.add(m); return m; });
const UP = { 1: [0, 0], 2: [-Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI / 2, 0], 6: [Math.PI, 0] };
let diceAnim = null;
function rollDice(a, b) {
  diceAnim = { t0: performance.now(), dur: 900, end: [a, b], spin: [new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6), new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6)] };
  snd('dice');
}
function stepDice(now) {
  if (!diceAnim) return;
  const t = Math.min(1, (now - diceAnim.t0) / diceAnim.dur);
  dice.forEach((d, k) => {
    const [rx, rz] = UP[diceAnim.end[k]];
    if (t < 1) { const s = (1 - t) * 1.2; d.rotation.set(rx + diceAnim.spin[k].x * s, d.rotation.y + 0.02, rz + diceAnim.spin[k].z * s); d.position.y = 3.6 + Math.abs(Math.sin(t * Math.PI * 3)) * 9 * (1 - t); }
    else { d.rotation.set(rx, k * 0.4, rz); d.position.y = 3.6; }
  });
  if (t >= 1) diceAnim = null;
}

// ---------- 鏡頭：可拖曳旋轉、滾輪／雙指縮放 ----------
const camS = { yaw: 0.48, pitch: 0.96, dist: 235, target: new THREE.Vector3(), goal: new THREE.Vector3() };
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
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; camS.dist = Math.max(65, Math.min(420, pinch.dist * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)))); return; }
    if (!last) return;
    camS.yaw -= (e.clientX - last.x) * 0.006; camS.pitch = Math.max(0.35, Math.min(1.45, camS.pitch + (e.clientY - last.y) * 0.004));
    last = { x: e.clientX, y: e.clientY };
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size === 1) { const [p] = pts.values(); last = { ...p }; } if (!pts.size) last = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey) camS.dist *= Math.exp(e.deltaY * 0.01); else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) camS.yaw += e.deltaX * 0.004; else camS.dist *= Math.exp(e.deltaY * 0.0015); camS.dist = Math.max(65, Math.min(420, camS.dist)); }, { passive: false });
})();
function resize() {
  const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 每幀動畫 ----------
let lastFx = '', lastCard = 0, lastMoveN = 0, lastNewsId = 0;
function frame(now) {
  requestAnimationFrame(frame);
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
        tk.spirit.position.y = 6.8 + Math.sin(now * 0.005) * 0.35;
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
        tk.g.position.y += Math.sin(f * Math.PI) * 3.6;
        tk.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        const swing = Math.sin(f * Math.PI * 2) * 0.6;
        tk.leftArm.rotation.x = swing; tk.rightArm.rotation.x = -swing;
        if (f >= 1) { tk.from = tk.path.shift(); tk.pos = tk.from; tk.t = 0; snd('step'); }
      } else {
        tk.pos = pl.pos;
        tk.g.position.copy(tokenWorld(pl.pos, k));
        tk.g.position.y += k === G.cur ? Math.abs(Math.sin(now / 300)) * 0.75 : 0;
        tk.leftArm.rotation.x = 0; tk.rightArm.rotation.x = 0;
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
    if (ct) camS.goal.copy(ct.g.position).multiplyScalar(0.38).setY(0);
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
let shownAsk = null;

function renderNews() {
  const bar = $('#newsBar');
  if (!G || !G.news || !G.news.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
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
        <div class="nt-title">${latest.title}</div>
        ${latest.body && latest.body !== latest.title ? `<div class="nt-body">${latest.body}</div>` : ''}`;
      nt.classList.remove('hidden');
      clearTimeout(nt._t);
      nt._t = setTimeout(() => nt.classList.add('hidden'), 3600);
      snd('news');
    }
  }
}

function openNewsLog() {
  if (!G || !G.news) return;
  openModal(`<h2>📰 Breaking News 突發新聞台</h2><div class="sub">全場玩家的重大地產交易、神明附身與突發事件紀錄。</div>
    <div class="news-list">${G.news.slice().reverse().map(n => `<div class="news-item" style="--nc:${n.color || 'var(--gold)'}">
      <div class="ni-meta">第 ${n.round} 輪・${n.cat}</div>
      <div class="ni-t">${n.title}</div>
      ${n.body && n.body !== n.title ? `<div class="ni-b">${n.body}</div>` : ''}
    </div>`).join('')}</div>
    <div class="row"><button class="close">關閉</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
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
  ・<b>可調整回合</b>：開局與遊戲中點擊上方輪數皆可隨時修改回合上限（0 為無限）。<br>
  ・拖曳畫面旋轉 3D 視角，滾輪或雙指縮放。</div>
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
  buildKey = ''; lastCard = 0; lastMoveN = 0; lastNewsId = 0; shownAsk = null;
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
              buildKey = ''; lastCard = 0; lastMoveN = 0; lastNewsId = 0; shownAsk = null;
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
window.__rich = { get G() { return G; }, send, NET };
