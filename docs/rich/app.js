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
    else if (kind === 'dog') { tone(190, 0.09, 0, 'sawtooth', 0.14); tone(145, 0.11, 0.11, 'sawtooth', 0.16); tone(260, 0.08, 0.24, 'square', 0.12); tone(120, 0.2, 0.34, 'sawtooth', 0.14); }
    else if (kind === 'siren') { for (let k = 0; k < 4; k++) { tone(660, 0.14, k * 0.32, 'sine', 0.11); tone(880, 0.14, k * 0.32 + 0.16, 'sine', 0.11); } }
    else if (kind === 'bankrupt') { tone(440, 0.18, 0, 'sawtooth', 0.14); tone(311, 0.2, 0.16, 'sawtooth', 0.14); tone(220, 0.25, 0.34, 'sawtooth', 0.14); tone(110, 0.5, 0.56, 'sawtooth', 0.18); }
    else if (kind === 'bad') tone(220, 0.3, 0, 'sawtooth', 0.08);
  } catch (e) { /* 忽略 */ }
}
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { if (SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume(); }, { passive: true }));

// ============================================================ 3D 場景與 56 格真實台灣地理棋盤
// 移動速度（可在選單調整，記在本機）：棋子每走一格的時間、骰子、NPC 與電腦思考間隔都會依此縮放
const SPEEDS = [[0.5, '慢'], [1, '標準'], [1.6, '快'], [2.5, '極快']];
let SPEED = 0.5; // 預設「慢」
try { const v = parseFloat(localStorage.getItem('rich_speed')); if (SPEEDS.some(([k]) => k === v)) SPEED = v; } catch (e) { /* 忽略 */ }
function setSpeed(v) { SPEED = v; try { localStorage.setItem('rich_speed', String(v)); } catch (e) { /* 忽略 */ } }
const STEP_MS = () => 290 / SPEED;
// WS：世界尺度倍率（地圖放大 1.8 倍，棋格造景與地形更有空間）
const WS = 1.8;
const TILE_SIZE = 5.4;
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b5b94');
scene.fog = new THREE.Fog('#1b5b94', 680 * WS, 1650 * WS);

const camera = new THREE.PerspectiveCamera(42, 1, 1, 3600 * WS);
scene.add(new THREE.HemisphereLight('#f2f8ff', '#294032', 1.25));
const sun = new THREE.DirectionalLight('#fff4df', 2.3);
sun.position.set(-140 * WS, 260 * WS, 160 * WS);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -320 * WS, right: 200 * WS, top: 260 * WS, bottom: -260 * WS, near: 10, far: 820 * WS });
scene.add(sun);

// 依北緯 23.62° 真實經緯度比例投影（LAT_SCALE / LON_SCALE = 1 / cos(23.62°) ≈ 1.093）
const LON0 = 120.95, LAT0 = 23.62, LON_SCALE = 96 * WS, LAT_SCALE = 105 * WS;
const twXZ = (lon, lat) => [(lon - LON0) * LON_SCALE, -(lat - LAT0) * LAT_SCALE];

// 86 點高精度真實台灣本島海岸線 [lon, lat]
const TW_POLY = [
  // 北海岸：富貴角 -> 石門 -> 金山 -> 野柳岬 -> 基隆灣 -> 鼻頭角 -> 三貂角
  [121.535, 25.298], [121.59, 25.285], [121.645, 25.235], [121.692, 25.212], [121.702, 25.185],
  [121.745, 25.158], [121.785, 25.152], [121.855, 25.132], [121.922, 25.128], [121.995, 25.012],
  // 東北／宜蘭灣／蘇花斷崖／花蓮：福隆 -> 頭城 -> 五結 -> 蘇澳 -> 東澳 -> 南澳 -> 和平 -> 清水斷崖 -> 七星潭 -> 花蓮
  [121.935, 24.985], [121.865, 24.912], [121.835, 24.835], [121.825, 24.755], [121.838, 24.675],
  [121.868, 24.592], [121.858, 24.515], [121.825, 24.445], [121.792, 24.362], [121.748, 24.285],
  [121.692, 24.185], [121.638, 24.085], [121.632, 24.015], [121.612, 23.955], [121.585, 23.865],
  // 花東海岸山脈東岸：磯崎 -> 豐濱 -> 長濱 -> 三仙台 -> 成功 -> 都蘭灣 -> 台東 -> 知本 -> 太麻里 -> 大武 -> 旭海 -> 鵝鑾鼻
  [121.555, 23.755], [121.525, 23.625], [121.505, 23.485], [121.465, 23.335], [121.415, 23.165],
  [121.375, 23.095], [121.315, 22.975], [121.225, 22.875], [121.158, 22.755], [121.055, 22.645],
  [121.015, 22.555], [120.955, 22.435], [120.915, 22.335], [120.895, 22.215], [120.892, 22.105],
  [120.865, 21.985], [120.858, 21.898],
  // 南灣／恆春／高屏／嘉南平原西海岸：鵝鑾鼻 -> 南灣 -> 貓鼻頭 -> 車城 -> 枋寮 -> 東港大鵬灣 -> 旗津高雄港 -> 安平 -> 七股極西沙洲
  [120.805, 21.935], [120.762, 21.952], [120.735, 21.922], [120.708, 21.958], [120.695, 22.055],
  [120.682, 22.155], [120.635, 22.275], [120.575, 22.365], [120.475, 22.455], [120.415, 22.495],
  [120.335, 22.535], [120.265, 22.605], [120.245, 22.695], [120.205, 22.795], [120.175, 22.915],
  [120.135, 22.992], [120.092, 23.065], [120.042, 23.135], [120.032, 23.185], [120.068, 23.255],
  // 雲彰中苗竹桃西海岸：布袋 -> 麥寮濁水溪口 -> 鹿港 -> 台中港 -> 通霄 -> 新竹南寮 -> 觀音 -> 淡水河口 -> 富貴角
  [120.105, 23.335], [120.132, 23.435], [120.145, 23.545], [120.175, 23.665], [120.215, 23.785],
  [120.285, 23.885], [120.355, 23.985], [120.412, 24.085], [120.465, 24.195], [120.515, 24.295],
  [120.565, 24.395], [120.635, 24.475], [120.685, 24.555], [120.765, 24.635], [120.865, 24.745],
  [120.925, 24.835], [120.985, 24.925], [121.055, 25.005], [121.145, 25.065], [121.235, 25.115],
  [121.325, 25.155], [121.395, 25.165], [121.435, 25.205], [121.485, 25.265],
];

// 真實離島與海峽對岸多邊形（澎湖、金門、馬祖、小琉球、龜山島、綠島、蘭嶼、與那國、閩東南沿岸）
const OFFSHORE_POLYS = [
  // 澎湖馬公本島、白沙、西嶼、望安、七美
  { poly: [[119.53, 23.52], [119.63, 23.51], [119.67, 23.58], [119.62, 23.62], [119.55, 23.59]], elev: 0.78, col: '#4a9352' },
  { poly: [[119.56, 23.63], [119.62, 23.63], [119.61, 23.69], [119.54, 23.68]], elev: 0.72, col: '#4e9656' },
  { poly: [[119.47, 23.56], [119.52, 23.57], [119.53, 23.66], [119.48, 23.64]], elev: 0.72, col: '#4e9656' },
  { poly: [[119.48, 23.34], [119.53, 23.34], [119.54, 23.40], [119.48, 23.39]], elev: 0.65, col: '#468c4e' },
  { poly: [[119.40, 23.19], [119.45, 23.19], [119.45, 23.23], [119.40, 23.22]], elev: 0.65, col: '#468c4e' },
  // 大金門（經典東西雙瓣輪廓）與小金門（烈嶼）
  { poly: [[118.29, 24.42], [118.36, 24.40], [118.42, 24.41], [118.49, 24.44], [118.49, 24.50], [118.43, 24.51], [118.38, 24.47], [118.31, 24.49], [118.27, 24.46]], elev: 0.85, col: '#4f9152' },
  { poly: [[118.21, 24.40], [118.26, 24.40], [118.27, 24.45], [118.22, 24.45]], elev: 0.72, col: '#4f9152' },
  // 馬祖列島（南竿＋北竿＋東引）
  { poly: [[119.89, 26.13], [119.97, 26.13], [119.97, 26.18], [119.89, 26.17]], elev: 0.75, col: '#418952', lh: true },
  { poly: [[119.96, 26.20], [120.03, 26.21], [120.03, 26.25], [119.96, 26.24]], elev: 0.70, col: '#418952' },
  // 小琉球、龜山島、綠島、蘭嶼、與那國島
  { poly: [[120.35, 22.32], [120.39, 22.32], [120.39, 22.36], [120.35, 22.35]], elev: 0.68, col: '#4b9b59' },
  { poly: [[121.93, 24.83], [121.98, 24.83], [121.97, 24.86], [121.93, 24.85]], elev: 0.95, col: '#3d7d47' },
  { poly: [[121.46, 22.63], [121.52, 22.63], [121.53, 22.69], [121.47, 22.69]], elev: 0.85, col: '#3b9250' },
  { poly: [[121.50, 22.00], [121.58, 22.01], [121.59, 22.09], [121.51, 22.08]], elev: 0.90, col: '#338347' },
  { poly: [[122.93, 24.42], [123.04, 24.43], [123.05, 24.48], [122.94, 24.47]], elev: 0.70, col: '#3b7b52' },
];

// 海峽西側閩東南沿岸真實輪廓（參考大戰略 geo.js / maps.js，呈現台海完整相對地理）
const FUJIAN_POLY = [
  [117.10, 21.80], [117.15, 23.45], [117.45, 23.72], [117.82, 24.04], [118.04, 24.38], [118.12, 24.54],
  [118.35, 24.58], [118.65, 24.65], [118.74, 24.88], [119.02, 25.04], [119.16, 25.25], [119.50, 25.48],
  [119.54, 25.72], [119.65, 26.02], [119.62, 26.28], [119.88, 26.44], [120.12, 26.80], [120.38, 27.10],
  [117.10, 27.10],
];

// 64 格真實世界台灣經緯度座標 [lon, lat, 地形高程]（嚴格對應 logic.js 順時針環島序，含平原／台地／峽谷／高山與離島海峽賭場）
const ROUTE_COORDS = [
  // 0..12 南台灣・高屏小琉球嘉南（鵝鑾鼻起點 → 高雄台南安平嘉義）
  [120.85, 21.92, 1.55], // 0 起點（鵝鑾鼻）
  [120.76, 21.97, 1.50], // 1 墾丁
  [120.71, 22.07, 1.75], // 2 恆春
  [120.67, 22.25, 1.65], // 3 命運（枋山海岸）
  [120.51, 22.58, 1.60], // 4 屏東
  [120.37, 22.34, 1.50], // 5 小琉球（離島珊瑚礁）
  [120.29, 22.61, 1.55], // 6 高雄（高雄港 85 大樓）
  [120.30, 22.72, 1.70], // 7 高鐵左營
  [120.23, 22.94, 1.65], // 8 台南（赤崁樓）
  [120.14, 23.04, 1.50], // 9 安平（安平古堡）
  [120.15, 23.18, 1.55], // 10 機會（七股潟湖）
  [120.30, 23.31, 2.30], // 11 道具屋（關子嶺溫泉台地）
  [120.45, 23.47, 1.85], // 12 嘉義（北回歸線）
  // 13..25 阿里山・雲林北港・澎湖群島・鹿港彰化南投日月潭台中
  [120.59, 23.43, 2.25], // 13 監獄（竹崎山麓）
  [120.81, 23.51, 5.20], // 14 阿里山（高山林鐵雲海）
  [120.49, 23.71, 1.65], // 15 雲林
  [120.30, 23.58, 1.55], // 16 北港廟宇（北港朝天宮）
  [119.58, 23.58, 1.48], // 17 澎湖（馬公真實經緯度）
  [120.42, 24.04, 1.50], // 18 鹿港（彰化海線）
  [120.55, 23.99, 1.80], // 19 彰化（八卦山麓）
  [120.70, 23.87, 2.20], // 20 南投（丘陵盆地）
  [120.92, 23.86, 4.00], // 21 日月潭（高山明潭）
  [120.95, 23.98, 3.20], // 22 醫院（埔里山地醫療站）
  [120.63, 24.10, 1.65], // 23 台中高鐵（烏日）
  [120.70, 24.20, 1.75], // 24 台中
  [120.58, 24.32, 1.55], // 25 機會（大甲／高美）
  // 26..44 桃竹苗・馬祖・海峽賭場・金門・大台北都會區
  [120.77, 24.41, 2.25], // 26 三義（木雕山城）
  [120.81, 24.54, 2.35], // 27 苗栗（勝興山城）
  [121.03, 24.75, 2.05], // 28 竹科（寶山丘陵）
  [120.94, 24.83, 1.60], // 29 新竹
  [121.11, 24.89, 2.20], // 30 命運（湖口台地）
  [121.30, 24.97, 1.85], // 31 桃園（台地）
  [119.93, 26.15, 1.52], // 32 馬祖（南竿北竿真實座標）
  [119.12, 25.15, 1.48], // 33 賭場（前往金門途中的台灣海峽郵輪賭場）
  [118.38, 24.45, 1.52], // 34 金門（真實海峽金門座標）
  [121.22, 25.07, 1.50], // 35 桃園機場
  [121.33, 25.13, 1.85], // 36 道具屋（林口台地／八里）
  [121.44, 25.21, 1.50], // 37 淡水
  [121.56, 25.25, 3.40], // 38 國家公園（陽明山火山區）
  [121.55, 25.15, 1.70], // 39 行天宮
  [121.41, 25.00, 1.60], // 40 新北（板橋）
  [121.50, 25.05, 1.65], // 41 台北（中正紀念堂）
  [121.59, 25.00, 1.70], // 42 信義區（台北 101）
  [121.69, 25.05, 1.85], // 43 機會（汐止山谷）
  [121.77, 25.14, 1.50], // 44 基隆港
  // 45..63 東北角・平溪・龜山島・宜花東・綠島蘭嶼南迴
  [121.90, 25.11, 1.80], // 45 入獄（東北角三貂角岬）
  [121.86, 25.01, 3.60], // 46 九份（基隆山黃金山城）
  [121.74, 24.97, 2.30], // 47 平溪（天燈山谷）
  [121.81, 24.89, 1.60], // 48 國稅局（頭城）
  [121.95, 24.84, 1.65], // 49 龜山島（外海火山島）
  [121.76, 24.75, 1.55], // 50 宜蘭
  [121.78, 24.64, 1.55], // 51 羅東
  [121.82, 24.51, 3.00], // 52 命運（蘇花斷崖山道）
  [121.76, 24.36, 2.70], // 53 迎神殿（南澳山谷）
  [121.60, 24.16, 3.80], // 54 太魯閣（大理石高山峽谷）
  [121.59, 23.98, 1.55], // 55 花蓮
  [121.43, 23.66, 2.40], // 56 道具屋（花東縱谷瑞穗）
  [121.32, 23.34, 2.15], // 57 玉里（客城稻浪小鎮）
  [121.28, 23.14, 2.20], // 58 機會（池上縱谷台地）
  [121.15, 22.77, 1.55], // 59 台東
  [121.02, 22.69, 1.95], // 60 知本（溫泉山谷）
  [121.50, 22.66, 1.55], // 61 綠島（真實座標）
  [121.55, 22.05, 1.65], // 62 蘭嶼（真實座標）
  [120.88, 22.14, 2.40], // 63 命運（旭海南迴山嶺）
];
// 各段真實多模態交通路網（highway=國道/省道, rail=台鐵, hsr=高鐵, mrt=捷運, forest_rail=阿里山林鐵, cliff_road=蘇花/山區隧道, ferry=藍色公路渡輪, air=離島航線）
const SEG_MODE = [
  'highway',     // 0  起點(鵝鑾鼻) -> 墾丁
  'highway',     // 1  墾丁 -> 恆春
  'highway',     // 2  恆春 -> 枋山海岸
  'highway',     // 3  枋山 -> 屏東
  'ferry',       // 4  屏東 -> 小琉球 (東港琉球客輪)
  'ferry',       // 5  小琉球 -> 高雄 (西子灣海上客輪)
  'mrt',         // 6  高雄 -> 高鐵左營 (高雄捷運紅線)
  'hsr',         // 7  高鐵左營 -> 台南 (高鐵南段走廊)
  'highway',     // 8  台南 -> 安平
  'highway',     // 9  安平 -> 七股 (台61西濱)
  'highway',     // 10 七股 -> 關子嶺
  'rail',        // 11 關子嶺 -> 嘉義 (台鐵縱貫南段)
  'forest_rail', // 12 嘉義 -> 竹崎 (阿里山林鐵平地山麓)
  'forest_rail', // 13 竹崎 -> 阿里山 (阿里山森林鐵路木橋)
  'cliff_road',  // 14 阿里山 -> 雲林 (高山蜿蜒山道)
  'highway',     // 15 雲林 -> 北港廟宇
  'ferry',       // 16 北港 -> 澎湖 (台海藍色公路渡輪)
  'ferry',       // 17 澎湖 -> 鹿港 (澎湖跨海客輪)
  'highway',     // 18 鹿港 -> 彰化
  'highway',     // 19 彰化 -> 南投
  'cliff_road',  // 20 南投 -> 日月潭 (中橫/山區公路)
  'cliff_road',  // 21 日月潭 -> 埔里醫院 (山谷公路)
  'highway',     // 22 埔里 -> 台中高鐵 (國6高速直達)
  'mrt',         // 23 台中高鐵 -> 台中 (台中捷運綠線)
  'rail',        // 24 台中 -> 大甲 (台鐵海線大甲溪橋)
  'rail',        // 25 大甲 -> 三義 (台鐵舊山線)
  'rail',        // 26 三義 -> 苗栗勝興 (勝興山線鐵道)
  'highway',     // 27 苗栗 -> 竹科 (國道1/3號)
  'rail',        // 28 竹科 -> 新竹 (台鐵六家支線)
  'hsr',         // 29 新竹 -> 湖口 (台灣高鐵脊線)
  'hsr',         // 30 湖口 -> 桃園 (高鐵青埔走廊)
  'air',         // 31 桃園 -> 馬祖 (台灣海峽北部航線)
  'ferry',       // 32 馬祖 -> 海峽賭場 (去金門途中的豪華郵輪航道)
  'ferry',       // 33 海峽賭場 -> 金門 (海峽郵輪進金門)
  'air',         // 34 金門 -> 桃園機場 (金門返航航線)
  'mrt',         // 35 桃園機場 -> 林口八里 (桃園機場捷運)
  'ferry',       // 36 八里 -> 淡水 (淡水河藍色公路渡輪)
  'cliff_road',  // 37 淡水 -> 陽明山 (巴拉卡高山道)
  'highway',     // 38 陽明山 -> 行天宮 (仰德大道)
  'mrt',         // 39 行天宮 -> 新北板橋 (台北捷運網)
  'mrt',         // 40 板橋 -> 台北 (捷運板南線)
  'mrt',         // 41 台北 -> 信義區 (捷運淡水信義線)
  'rail',        // 42 信義區 -> 汐止 (台鐵縱貫北段)
  'rail',        // 43 汐止 -> 基隆港 (台鐵基隆線)
  'highway',     // 44 基隆港 -> 東北角 (台2濱海公路)
  'cliff_road',  // 45 東北角 -> 九份 (金九山城彎道)
  'rail',        // 46 九份 -> 平溪 (台鐵平溪天燈支線)
  'rail',        // 47 平溪 -> 頭城國稅局 (台鐵宜蘭線)
  'ferry',       // 48 頭城 -> 龜山島 (烏石港賞鯨客輪)
  'ferry',       // 49 龜山島 -> 宜蘭 (蘭陽海岸航線)
  'rail',        // 50 宜蘭 -> 羅東 (台鐵宜蘭線)
  'cliff_road',  // 51 羅東 -> 蘇花斷崖 (蘇花改隧道)
  'cliff_road',  // 52 蘇花 -> 南澳迎神殿 (臨海斷崖隧道)
  'cliff_road',  // 53 南澳 -> 太魯閣 (中橫大理石峽谷隧道)
  'rail',        // 54 太魯閣 -> 花蓮 (台鐵北迴線)
  'rail',        // 55 花蓮 -> 瑞穗 (台鐵花東縱谷線)
  'rail',        // 56 瑞穗 -> 玉里 (花東客城鐵道)
  'rail',        // 57 玉里 -> 池上 (花東稻浪鐵道)
  'rail',        // 58 池上 -> 台東 (花東線南段)
  'highway',     // 59 台東 -> 知本 (台9線溫泉公路)
  'ferry',       // 60 知本 -> 綠島 (太平洋客輪航線)
  'ferry',       // 61 綠島 -> 蘭嶼 (太平洋島嶼客輪)
  'ferry',       // 62 蘭嶼 -> 旭海 (南台灣太平洋航線)
  'cliff_road',  // 63 旭海 -> 鵝鑾鼻起點 (南迴海岸山道)
];
// ---------- 立體地形高度場（v145 重製：以真實海岸線、五大山脈稜線與噪聲生成連續地形，路網與棋格處自動整平）----------
const smooth01 = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function pointInPoly(poly, x, z) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function segDistT(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  return [Math.hypot(px - ax - dx * t, pz - az - dz * t), t];
}
const TW_XZ = TW_POLY.map(([lon, lat]) => twXZ(lon, lat));
function coastDist(x, z) {
  let d = Infinity;
  for (let i = 0, j = TW_XZ.length - 1; i < TW_XZ.length; j = i++) d = Math.min(d, segDistT(x, z, TW_XZ[j][0], TW_XZ[j][1], TW_XZ[i][0], TW_XZ[i][1])[0]);
  return d;
}
const onMainland = (x, z) => pointInPoly(TW_XZ, x, z);
// 平滑值噪聲（固定種子，所有玩家看到同一座島）
function hash2(ix, iz) { let h = (ix * 374761393 + iz * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, oct = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
// 山脈稜線：[經緯度折線, 高度, 寬度（世界單位）]
const RIDGES = [
  [[[121.80, 24.80], [121.45, 24.52], [121.28, 24.18], [121.12, 23.78], [120.99, 23.40], [120.90, 22.95], [120.83, 22.45], [120.84, 22.10]], 17, 30 * WS], // 中央山脈
  [[[121.62, 24.92], [121.40, 24.60], [121.23, 24.38], [121.00, 24.22], [120.88, 24.05]], 14, 20 * WS], // 雪山山脈
  [[[121.00, 23.50], [120.88, 23.45], [120.72, 23.40], [120.58, 23.20]], 11, 15 * WS], // 玉山・阿里山
  [[[121.58, 23.98], [121.45, 23.55], [121.32, 23.15], [121.18, 22.85]], 8.5, 9 * WS], // 海岸山脈
  [[[120.95, 24.70], [120.82, 24.45], [120.72, 24.25]], 5.5, 13 * WS], // 苗栗丘陵
  [[[120.60, 24.08], [120.58, 23.90]], 4, 7 * WS], // 八卦山台地
].map(([pts, h, w]) => ({ pts: pts.map(([lo, la]) => twXZ(lo, la)), h, w }));
const PEAKS = [[120.96, 23.47, 8, 6], [121.23, 24.38, 6, 5.5], [121.55, 25.17, 6, 7], [121.27, 24.14, 4, 5], [120.76, 22.63, 3, 5]]
  .map(([lo, la, h, r]) => { const [x, z] = twXZ(lo, la); return { x, z, h, r: r * WS }; });
function rawHeight(x, z) {
  const dc = coastDist(x, z);
  let h = 0.55 + 1.0 * smooth01(0, 5 * WS, dc) + 1.6 * fbm(x / (18 * WS), z / (18 * WS)) * smooth01(2 * WS, 20 * WS, dc);
  let m = 0;
  for (const r of RIDGES) for (let k = 1; k < r.pts.length; k++) {
    const [d] = segDistT(x, z, r.pts[k - 1][0], r.pts[k - 1][1], r.pts[k][0], r.pts[k][1]);
    m = Math.max(m, r.h * Math.exp(-(d / r.w) * (d / r.w)));
  }
  for (const p of PEAKS) { const d = Math.hypot(x - p.x, z - p.z); m += p.h * Math.exp(-(d / p.r) * (d / p.r)); }
  const rough = 0.7 + 0.55 * fbm(x / (7 * WS) + 31, z / (7 * WS) - 17, 5);
  return h + m * rough * smooth01(0, 9 * WS, dc);
}
// 棋格高程：本島取地形高度（山區略降，像走在山谷公路上）；離島沿用島嶼高度
const TILE_MAIN = ROUTE_COORDS.map(([lon, lat]) => { const [x, z] = twXZ(lon, lat); return onMainland(x, z); });
const TILE_ELEV = ROUTE_COORDS.map(([lon, lat, elev], i) => {
  if (!TILE_MAIN[i]) return elev;
  const [x, z] = twXZ(lon, lat);
  const r = rawHeight(x, z);
  return Math.max(1.6, r > 3 ? 3 + (r - 3) * 0.72 : r) + 0.25;
});
const ROAD_SEGS = SEG_MODE.map((mode, i) => {
  const j = (i + 1) % ROUTE_COORDS.length;
  if (mode === 'ferry' || mode === 'air' || !TILE_MAIN[i] || !TILE_MAIN[j]) return null;
  const [ax, az] = twXZ(ROUTE_COORDS[i][0], ROUTE_COORDS[i][1]), [bx, bz] = twXZ(ROUTE_COORDS[j][0], ROUTE_COORDS[j][1]);
  return { ax, az, bx, bz, ha: TILE_ELEV[i], hb: TILE_ELEV[j] };
}).filter(Boolean);
const PAD_R0 = 6.4, PAD_R1 = 13, ROAD_R0 = 2.4, ROAD_R1 = 8.5;
// 最終地形高度：棋格平台與交通路線兩側整平，避免路面與棋子穿進山體
function terrainHeight(x, z) {
  let h = rawHeight(x, z), w = 0, tgt = h;
  ROUTE_COORDS.forEach(([lon, lat], i) => {
    if (!TILE_MAIN[i]) return;
    const [tx, tz] = twXZ(lon, lat), d = Math.hypot(x - tx, z - tz);
    if (d >= PAD_R1) return;
    const k = 1 - smooth01(PAD_R0, PAD_R1, d);
    if (k > w) { w = k; tgt = TILE_ELEV[i] - 0.45; }
  });
  for (const s of ROAD_SEGS) {
    const [d, t] = segDistT(x, z, s.ax, s.az, s.bx, s.bz);
    if (d >= ROAD_R1) continue;
    const k = 1 - smooth01(ROAD_R0, ROAD_R1, d);
    if (k > w) { w = k; tgt = s.ha + (s.hb - s.ha) * t - 0.35; }
  }
  return h + (tgt - h) * w;
}
const TILE_PTS = ROUTE_COORDS.map(([lon, lat], i) => {
  const [x, z] = twXZ(lon, lat);
  return new THREE.Vector3(x, TILE_ELEV[i], z);
});
function tilePos(i) { return TILE_PTS[i].clone(); }
function tileAngle(i) {
  const n = TILE_PTS.length;
  const a = TILE_PTS[(i + n - 1) % n], b = TILE_PTS[(i + 1) % n];
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
  casino: ['#f3e8ff', '#d97706', '賭場', '海峽博弈'],
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

// ---------- 3D 立體真實台灣地理地形、分層設色地貌、山脈水系、離島群與海峽網格 ----------
function makeShapeXZ(poly) {
  const s = new THREE.Shape();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  poly.forEach(([lon, lat], k) => {
    const [x, z] = twXZ(lon, lat);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    if (k === 0) s.moveTo(x, -z); else s.lineTo(x, -z);
  });
  s.closePath();
  return { shape: s, minX, maxX, minZ, maxZ };
}

function applyPlanarUV(geo, minX, maxX, minZ, maxZ) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const dx = Math.max(1, maxX - minX), dz = Math.max(1, maxZ - minZ);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vy = pos.getY(i);
    uv.setXY(i, (vx - minX) / dx, (vy + maxZ) / dz);
  }
  uv.needsUpdate = true;
}

function makeTaiwanReliefTex(minX, maxX, minZ, maxZ) {
  return canvasTex(1024, 2048, (c, w, h) => {
    const pxOf = (lon, lat) => {
      const [x, z] = twXZ(lon, lat);
      return [((x - minX) / (maxX - minX)) * w, ((z - minZ) / (maxZ - minZ)) * h];
    };
    const drawPolyPath = poly => {
      c.beginPath();
      poly.forEach(([lon, lat], i) => {
        const [px, py] = pxOf(lon, lat);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      });
      c.closePath();
    };
    const strokeChain = (pts, width, color, dash = []) => {
      c.save();
      c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
      c.setLineDash(dash);
      c.beginPath();
      pts.forEach(([lon, lat], i) => {
        const [px, py] = pxOf(lon, lat);
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      });
      c.stroke();
      c.restore();
    };

    // 底層沿海沖積平原漸層
    const bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#549b54');
    bg.addColorStop(0.5, '#68ad5a');
    bg.addColorStop(1, '#589b4f');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);

    c.save();
    drawPolyPath(TW_POLY);
    c.clip();

    // 西部大平原與盆地（台北盆地、嘉南平原、屏東平原）
    c.save();
    c.filter = 'blur(18px)';
    for (const [lon, lat, rx, ry, col] of [
      [121.52, 25.05, 58, 42, '#7bc269'], // 台北盆地
      [121.22, 24.92, 66, 52, '#71b761'], // 桃園台地
      [120.62, 24.10, 74, 88, '#7cc268'], // 台中彰化平原
      [120.30, 23.38, 92, 185, '#82c86b'], // 雲嘉南大平原
      [120.52, 22.62, 68, 98, '#7cc267'], // 高屏溪沖積平原
      [121.74, 24.72, 46, 48, '#7bc46c'], // 蘭陽平原
    ]) {
      const [px, py] = pxOf(lon, lat);
      c.fillStyle = col;
      c.beginPath(); c.ellipse(px, py, rx, ry, 0.12, 0, Math.PI * 2); c.fill();
    }
    c.restore();

    // 分層設色等高線山脈帶（淺山林地 → 亞高山 → 高山裸岩與雪嶺）
    const ranges = [
      [[121.64, 24.92], [121.40, 24.64], [121.26, 24.38], [121.15, 24.04], [121.09, 23.72], [121.05, 23.45], [120.98, 23.12], [120.88, 22.74], [120.80, 22.26]],
      [[121.38, 24.90], [121.22, 24.62], [121.06, 24.36]], // 雪山山脈
      [[120.92, 23.82], [120.82, 23.52], [120.72, 23.22]], // 阿里山脈
      [[121.52, 23.84], [121.42, 23.52], [121.28, 23.08]], // 海岸山脈
    ];
    c.save();
    c.filter = 'blur(20px)';
    for (const r of ranges) strokeChain(r, 170, 'rgba(44, 102, 54, 0.85)');
    c.filter = 'blur(14px)';
    for (const r of ranges.slice(0, 3)) strokeChain(r, 102, 'rgba(116, 124, 68, 0.88)');
    c.filter = 'blur(9px)';
    strokeChain(ranges[0], 56, 'rgba(158, 134, 84, 0.92)');
    strokeChain([[121.26, 24.38], [121.12, 23.86], [121.06, 23.46], [120.98, 23.16]], 24, 'rgba(208, 192, 156, 0.85)');
    c.restore();

    // 花東縱谷青翠狹長谷地
    strokeChain([[121.56, 23.95], [121.42, 23.62], [121.28, 23.24], [121.14, 22.82]], 26, 'rgba(110, 186, 98, 0.9)');

    // 主要真實河川水系（河床邊框＋湛藍河道）
    const rivers = [
      [[121.28, 24.78], [121.44, 24.98], [121.48, 25.06], [121.42, 25.18]], // 淡水河・大漢溪
      [[121.72, 25.08], [121.58, 25.07], [121.48, 25.09]], // 基隆河
      [[121.24, 24.25], [120.82, 24.26], [120.54, 24.30]], // 大甲溪
      [[121.16, 24.10], [120.78, 23.82], [120.44, 23.80], [120.21, 23.84]], // 濁水溪
      [[120.66, 23.34], [120.42, 23.18], [120.08, 23.08]], // 曾文溪
      [[120.88, 23.18], [120.62, 22.88], [120.42, 22.62], [120.38, 22.48]], // 高屏溪
      [[121.45, 24.48], [121.68, 24.68], [121.82, 24.71]], // 蘭陽溪
      [[121.42, 23.70], [121.58, 23.93]], // 花蓮溪
      [[121.28, 23.36], [121.39, 23.48], [121.50, 23.46]], // 秀姑巒溪
      [[121.14, 23.12], [121.16, 22.77]], // 卑南溪
    ];
    for (const rv of rivers) strokeChain(rv, 11, '#266b8e');
    for (const rv of rivers) strokeChain(rv, 6.5, '#38bdf8');

    // 北回歸線 23.5°N 穿越台灣本島金色虛線（嘉義水上 → 玉山 → 瑞穗）
    strokeChain([[119.95, 23.5], [121.65, 23.5]], 3.5, 'rgba(250, 204, 21, 0.72)', [12, 9]);

    // 地圖地理注記（山脈、平原、主要溪流名稱）
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const labels = [
      ['中央山脈', 121.12, 23.68, 'rgba(255,250,224,0.85)', 24, -1.28],
      ['雪山山脈', 121.22, 24.55, 'rgba(255,250,224,0.78)', 20, -1.0],
      ['玉山 3952m', 121.02, 23.46, '#fef08a', 20, 0],
      ['嘉南平原', 120.32, 23.22, 'rgba(255,255,255,0.78)', 24, 0],
      ['花東縱谷', 121.38, 23.56, 'rgba(255,255,255,0.78)', 20, -1.2],
      ['濁水溪', 120.48, 23.85, '#bae6fd', 18, -0.05],
      ['淡水河', 121.41, 25.13, '#bae6fd', 18, -0.6],
    ];
    for (const [txt, lon, lat, col, size, rot] of labels) {
      const [px, py] = pxOf(lon, lat);
      c.save();
      c.translate(px, py); c.rotate(rot);
      c.font = `800 ${size}px "PingFang TC","Noto Sans TC",sans-serif`;
      c.strokeStyle = 'rgba(10, 22, 14, 0.65)'; c.lineWidth = 4; c.strokeText(txt, 0, 0);
      c.fillStyle = col; c.fillText(txt, 0, 0);
      c.restore();
    }
    c.restore();
  });
}

function buildIslandPoly(poly, elev = 0.8, color = '#3c8e4d', withLighthouse = false, opts = {}) {
  const g = new THREE.Group();
  const { shape } = makeShapeXZ(poly);
  const { shelfSize = 3.2, surfSize = 1.5, beachSize = 0.6, skipSurf = false } = opts;

  if (!skipSurf) {
    const shelf = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.14, bevelSize: shelfSize, bevelSegments: 1 }),
      new THREE.MeshStandardMaterial({ color: '#0d4e73', roughness: 0.45 })
    );
    shelf.rotation.x = -Math.PI / 2; shelf.position.y = -0.45; shelf.receiveShadow = true;
    const surf = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.14, bevelSize: surfSize, bevelSegments: 1 }),
      new THREE.MeshStandardMaterial({ color: '#2190ad', roughness: 0.45 })
    );
    surf.rotation.x = -Math.PI / 2; surf.position.y = -0.22; surf.receiveShadow = true;
    g.add(shelf, surf);
  }

  const beach = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.16, bevelSize: beachSize, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: '#d7c38a', roughness: 0.92 })
  );
  beach.rotation.x = -Math.PI / 2; beach.position.y = 0.04; beach.receiveShadow = true;

  const turf = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: elev, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.22, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 })
  );
  turf.rotation.x = -Math.PI / 2; turf.position.y = 0.22; turf.castShadow = true; turf.receiveShadow = true;
  g.add(beach, turf);

  if (withLighthouse) {
    let cx = 0, cz = 0;
    for (const [lon, lat] of poly) { const [x, z] = twXZ(lon, lat); cx += x; cz += z; }
    cx /= poly.length; cz /= poly.length;
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.58, 2.8, 10), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    lh.position.set(cx, elev + 1.6, cz); lh.castShadow = true;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#ffe066', emissive: '#f1c40f' }));
    top.position.set(cx, elev + 3.1, cz);
    g.add(lh, top);
  }
  return g;
}

function buildWorldSeaGrid() {
  // 海面真實地圖經緯度網格、北回歸線、海域名稱與指北羅盤（覆蓋 117°E–123.5°E, 21°N–26.8°N）
  const minX = -380 * WS, maxX = 240 * WS, minZ = -340 * WS, maxZ = 280 * WS;
  const W = maxX - minX, H = maxZ - minZ;
  const tex = canvasTex(2048, 2048, (c, cw, ch) => {
    const cxOf = (lon, lat) => {
      const [x, z] = twXZ(lon, lat);
      return [((x - minX) / W) * cw, ((z - minZ) / H) * ch];
    };
    c.clearRect(0, 0, cw, ch);

    // 1° 經緯度座標網格線
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(186, 230, 253, 0.22)';
    c.font = '700 22px "SF Pro TC","PingFang TC",sans-serif';
    c.fillStyle = 'rgba(224, 242, 254, 0.62)';
    for (let lon = 117; lon <= 123; lon++) {
      const [px] = cxOf(lon, LAT0);
      c.beginPath(); c.moveTo(px, 0); c.lineTo(px, ch); c.stroke();
      c.fillText(`${lon}°E`, px + 8, ch - 36);
      c.fillText(`${lon}°E`, px + 8, 28);
    }
    for (let lat = 21; lat <= 26; lat++) {
      const [, py] = cxOf(LON0, lat);
      c.beginPath(); c.moveTo(0, py); c.lineTo(cw, py); c.stroke();
      c.fillText(`${lat}°N`, 22, py - 8);
      c.fillText(`${lat}°N`, cw - 72, py - 8);
    }

    // 北回歸線 23.5°N（穿越台海與太平洋的金黃虛線）
    const [, tropy] = cxOf(LON0, 23.5);
    c.save();
    c.setLineDash([18, 12]); c.lineWidth = 3.2; c.strokeStyle = 'rgba(250, 204, 21, 0.6)';
    c.beginPath(); c.moveTo(0, tropy); c.lineTo(cw, tropy); c.stroke();
    c.fillStyle = 'rgba(254, 240, 138, 0.85)';
    c.font = '800 24px "PingFang TC","Noto Sans TC",sans-serif';
    c.fillText('☀ 北回歸線 Tropic of Cancer  23.5°N', cw * 0.67, tropy - 12);
    c.restore();

    // 真實海域名稱標註
    const seas = [
      ['台灣海峽', 'TAIWAN STRAIT', 119.35, 24.30, -0.35],
      ['太 平 洋', 'PACIFIC OCEAN', 122.45, 23.25, 0],
      ['巴士海峽', 'BASHI CHANNEL', 120.75, 21.35, 0],
      ['東  海', 'EAST CHINA SEA', 121.30, 25.95, 0],
      ['中國福建沿海', 'FUJIAN COAST', 117.75, 25.55, 0],
    ];
    for (const [zh, en, lon, lat, rot] of seas) {
      const [px, py] = cxOf(lon, lat);
      c.save(); c.translate(px, py); c.rotate(rot);
      c.textAlign = 'center';
      c.font = '900 44px "PingFang TC","Noto Sans TC",sans-serif';
      c.fillStyle = 'rgba(224, 242, 254, 0.56)'; c.fillText(zh, 0, 0);
      c.font = '700 20px "SF Pro TC","Noto Sans TC",sans-serif';
      c.fillStyle = 'rgba(186, 230, 253, 0.44)'; c.fillText(en, 0, 32);
      c.restore();
    }

    // 東南角指北羅盤與地圖徽章
    const [rx, ry] = cxOf(122.55, 21.65);
    c.save(); c.translate(rx, ry);
    c.strokeStyle = 'rgba(250, 204, 21, 0.65)'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 74, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 56, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(250, 204, 21, 0.78)';
    c.beginPath(); c.moveTo(0, -82); c.lineTo(14, -14); c.lineTo(0, -24); c.lineTo(-14, -14); c.closePath(); c.fill();
    c.fillStyle = 'rgba(186, 230, 253, 0.5)';
    for (const ang of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
      c.save(); c.rotate(ang);
      c.beginPath(); c.moveTo(0, -68); c.lineTo(10, -14); c.lineTo(-10, -14); c.closePath(); c.fill();
      c.restore();
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fde047'; c.font = '900 32px "PingFang TC",sans-serif';
    c.fillText('N', 0, -104);
    c.fillStyle = 'rgba(224, 242, 254, 0.7)'; c.font = '700 22px "PingFang TC",sans-serif';
    c.fillText('S', 0, 94); c.fillText('E', 96, 0); c.fillText('W', -96, 0);
    c.fillStyle = 'rgba(255, 218, 110, 0.85)'; c.font = '900 40px "PingFang TC","Noto Sans TC",sans-serif';
    c.fillText('環島富豪 3D', 0, 145);
    c.fillStyle = 'rgba(175, 225, 255, 0.72)'; c.font = '700 18px "PingFang TC",sans-serif';
    c.fillText('REAL WORLD TAIWAN ATLAS', 0, 180);
    c.restore();
  });

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set((minX + maxX) / 2, -0.18, (minZ + maxZ) / 2);
  return plane;
}

let waterTex = null;
function makeWaterNormal() {
  if (waterTex) return waterTex;
  const tex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#ddefff'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 68; i++) {
      const y = (i * 19) % h;
      const x = (i * 53) % w;
      const len = 28 + (i % 5) * 14;
      c.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.42)' : 'rgba(148,203,245,0.34)';
      c.lineWidth = i % 4 === 0 ? 2.4 : 1.5;
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x + len * 0.3, y - 3, x + len * 0.7, y + 3, x + len, y);
      c.stroke();
      if (x + len > w) {
        c.beginPath();
        c.moveTo(x - w, y);
        c.bezierCurveTo(x - w + len * 0.3, y - 3, x - w + len * 0.7, y + 3, x - w + len, y);
        c.stroke();
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  waterTex = tex;
  return tex;
}

const _winMatCache = new Map();
function makeWinMat(baseHex = '#1e293b', glowHex = '#fef08a') {
  const key = `${baseHex}|${glowHex}`;
  if (_winMatCache.has(key)) return _winMatCache.get(key);
  const tex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = baseHex; c.fillRect(0, 0, w, h);
    const cols = 8, rows = 10, padX = 3, padY = 3;
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const seed = ((r * 31 + col * 17) % 11);
        c.fillStyle = seed < 4 ? glowHex : (seed < 7 ? '#bae6fd' : '#334155');
        c.fillRect(col * cw + padX, r * ch + padY, cw - padX * 2, ch - padY * 2);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.25 });
  _winMatCache.set(key, mat);
  return mat;
}

const TR_MAT = {
  asphalt: new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.88 }),
  laneWhite: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.6 }),
  dashYellow: new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#654b00' }),
  gantryGreen: new THREE.MeshStandardMaterial({ color: '#15803d', roughness: 0.45 }),
  ballast: new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.92 }),
  tieWood: new THREE.MeshStandardMaterial({ color: '#5c3a21', roughness: 0.85 }),
  railSteel: new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.72, roughness: 0.25 }),
  catenary: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.5, roughness: 0.4 }),
  hsrViaduct: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.55 }),
  hsrOrange: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.42 }),
  mrtBeam: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 }),
  mrtTrim: new THREE.MeshStandardMaterial({ color: '#0ea5e9', emissive: '#0c4a6e', roughness: 0.35 }),
  timber: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.82 }),
  cliffArch: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 }),
  cliffStone: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.85 }),
  airArc: new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#0284c7', transparent: true, opacity: 0.75 }),
  ferryWake: new THREE.MeshStandardMaterial({ color: '#f0f9ff', emissive: '#0ea5e9', transparent: true, opacity: 0.82 }),
  buoyRed: new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#7f1d1d' }),
};

function orientAlong(mesh, a, b, yOff = 0) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const hLen = Math.max(0.01, Math.hypot(dir.x, dir.z));
  mesh.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5 + yOff, (a.z + b.z) * 0.5);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = Math.atan2(dir.x, dir.z);
  mesh.rotation.x = -Math.atan2(dir.y, hLen);
}

function makeTransportSegment(idx, a, b, mode) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.01, dir.length());
  const hLen = Math.max(0.01, Math.hypot(dir.x, dir.z));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = Math.atan2(dir.y, hLen);

  if (mode === 'air') {
    // 高空離島航線（拋物線光束航道＋導航信標＋巡航客機）
    const apexY = Math.max(a.y, b.y) + Math.min(28, 9 + hLen * 0.16);
    const ctrl = new THREE.Vector3(mid.x, apexY, mid.z);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(a.x, a.y + 1.2, a.z),
      ctrl,
      new THREE.Vector3(b.x, b.y + 1.2, b.z)
    );
    const dots = Math.max(10, Math.floor(hLen / 5.5));
    for (let k = 1; k < dots; k++) {
      const pt = curve.getPoint(k / dots);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(k % 3 === 0 ? 0.42 : 0.24, 8, 8), TR_MAT.airArc);
      beacon.position.copy(pt);
      g.add(beacon);
    }
    if (R.BOARD[idx] && R.BOARD[idx].name === '桃園') {
      const plane = new THREE.Group();
      const bodyM = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.28, metalness: 0.2 });
      const tailM = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.35 });
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 2.8, 10), bodyM);
      fuse.rotation.x = Math.PI / 2;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 10), bodyM);
      nose.rotation.x = Math.PI / 2; nose.position.z = 1.82;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 0.75), bodyM);
      wing.position.set(0, 0, 0.15);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.7), tailM);
      tail.position.set(0, 0.48, -1.05);
      plane.add(fuse, nose, wing, tail);
      plane.scale.setScalar(0.95);
      plane.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(plane);
      animProps.push(now => {
        const u = (Math.sin(now * 0.00055) * 0.5 + 0.5) * 0.8 + 0.1;
        const pos = curve.getPoint(u);
        const next = curve.getPoint(Math.min(0.99, u + (Math.cos(now * 0.00055) >= 0 ? 0.02 : -0.02)));
        plane.position.copy(pos);
        plane.lookAt(next);
      });
    }
    return g;
  }

  if (mode === 'ferry') {
    // 藍色公路海上客輪航道（航道浮標＋波浪尾跡點＋往返客輪）
    const seaY = 0.24;
    const steps = Math.max(4, Math.floor(hLen / 3.8));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      const wake = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 1.35), TR_MAT.ferryWake);
      wake.position.set(p.x, seaY, p.z);
      wake.rotation.y = yaw;
      g.add(wake);
      if (s % 4 === 2) {
        const perpX = Math.cos(yaw) * 1.15, perpZ = -Math.sin(yaw) * 1.15;
        const buoy = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 6), TR_MAT.buoyRed);
        buoy.position.set(p.x + (s % 8 === 2 ? perpX : -perpX), seaY + 0.3, p.z + (s % 8 === 2 ? perpZ : -perpZ));
        g.add(buoy);
      }
    }
    const segNm = R.BOARD[idx] ? R.BOARD[idx].name : '';
    if (segNm === '北港廟宇' || segNm === '知本' || segNm === '馬祖') {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 2.7), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35 }));
      hull.position.y = 0.35;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 2.55), TR_MAT.mrtTrim);
      stripe.position.y = 0.48;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.5), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
      cabin.position.set(0, 0.85, -0.15);
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 8), TR_MAT.buoyRed);
      funnel.position.set(0, 1.3, -0.45);
      boat.add(hull, stripe, cabin, funnel);
      boat.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(boat);
      const phase = idx * 1.3;
      animProps.push(now => {
        const s = Math.sin(now * 0.00045 + phase);
        const t = 0.16 + 0.68 * (s * 0.5 + 0.5);
        boat.position.lerpVectors(a, b, t);
        boat.position.y = seaY + 0.05 + Math.sin(now * 0.004 + phase) * 0.08;
        boat.rotation.y = yaw + (Math.cos(now * 0.00045 + phase) >= 0 ? 0 : Math.PI);
      });
    }
    return g;
  }

  if (mode === 'hsr') {
    // 台灣高鐵高架軌道（混凝土箱梁＋橘色飾條＋雙股鋼軌＋T字橋墩）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.42, len), TR_MAT.hsrViaduct);
    orientAlong(deck, a, b, 0.08); deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);
    for (const sgn of [-0.96, 0.96]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, len * 0.98), TR_MAT.hsrOrange);
      const off = new THREE.Vector3(Math.cos(yaw) * sgn, 0.08, -Math.sin(yaw) * sgn);
      orientAlong(trim, a.clone().add(off), b.clone().add(off), 0);
      g.add(trim);
    }
    for (const rOff of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, len), TR_MAT.railSteel);
      const off = new THREE.Vector3(Math.cos(yaw) * rOff, 0.34, -Math.sin(yaw) * rOff);
      orientAlong(rail, a.clone().add(off), b.clone().add(off), 0);
      g.add(rail);
    }
    const piers = Math.max(1, Math.floor(hLen / 10));
    for (let k = 1; k <= piers; k++) {
      const p = new THREE.Vector3().lerpVectors(a, b, k / (piers + 1));
      const h = Math.max(0.8, p.y - 0.1);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.48, h, 8), TR_MAT.hsrViaduct);
      pier.position.set(p.x, h * 0.5, p.z); pier.castShadow = true;
      g.add(pier);
    }
    return g;
  }

  if (mode === 'forest_rail') {
    // 阿里山森林鐵路（高聳檜木桁架橋＋狹軌雙鐵軌）
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.24, len), TR_MAT.timber);
    orientAlong(bed, a, b, 0.02); bed.castShadow = true;
    g.add(bed);
    for (const rOff of [-0.32, 0.32]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), TR_MAT.railSteel);
      const off = new THREE.Vector3(Math.cos(yaw) * rOff, 0.18, -Math.sin(yaw) * rOff);
      orientAlong(rail, a.clone().add(off), b.clone().add(off), 0);
      g.add(rail);
    }
    const bents = Math.max(2, Math.floor(len / 3.4));
    for (let k = 1; k < bents; k++) {
      const p = new THREE.Vector3().lerpVectors(a, b, k / bents);
      const h = Math.max(0.8, p.y - 0.2);
      const bent = new THREE.Group();
      for (const s of [-0.46, 0.46]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, h, 6), TR_MAT.timber);
        post.position.set(s, h * 0.5, 0); bent.add(post);
      }
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.26), TR_MAT.tieWood);
      tie.position.y = h + 0.08; bent.add(tie);
      bent.position.set(p.x, 0, p.z); bent.rotation.y = yaw;
      g.add(bent);
    }
    return g;
  }

  if (mode === 'rail') {
    // 台鐵電氣化軌道（碎石路基＋枕木＋雙鋼軌＋架空電車線門架）
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, len), TR_MAT.ballast);
    orientAlong(bed, a, b, -0.04); bed.receiveShadow = true;
    g.add(bed);
    for (const rOff of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, len), TR_MAT.railSteel);
      const off = new THREE.Vector3(Math.cos(yaw) * rOff, 0.1, -Math.sin(yaw) * rOff);
      orientAlong(rail, a.clone().add(off), b.clone().add(off), 0);
      g.add(rail);
    }
    const ties = Math.max(3, Math.floor(len / 1.9));
    for (let k = 1; k < ties; k++) {
      const p = new THREE.Vector3().lerpVectors(a, b, k / ties);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 0.22), TR_MAT.tieWood);
      tie.position.set(p.x, p.y + 0.06, p.z);
      tie.rotation.order = 'YXZ'; tie.rotation.y = yaw; tie.rotation.x = -pitch;
      g.add(tie);
      if (k % 5 === 2) {
        const gantry = new THREE.Group();
        for (const s of [-0.88, 0.88]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.55, 6), TR_MAT.catenary);
          pole.position.set(s, 0.8, 0); gantry.add(pole);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.08), TR_MAT.catenary);
        bar.position.y = 1.55; gantry.add(bar);
        gantry.position.set(p.x, p.y, p.z); gantry.rotation.y = yaw;
        g.add(gantry);
      }
    }
    return g;
  }

  if (mode === 'mrt') {
    // 都會捷運高架軌道（混凝土U型梁＋雙側藍綠色隔音牆＋高架橋墩）
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.36, len), TR_MAT.mrtBeam);
    orientAlong(beam, a, b, 0.14); beam.castShadow = true; beam.receiveShadow = true;
    g.add(beam);
    for (const sgn of [-0.88, 0.88]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, len * 0.98), TR_MAT.mrtTrim);
      const off = new THREE.Vector3(Math.cos(yaw) * sgn, 0.32, -Math.sin(yaw) * sgn);
      orientAlong(wall, a.clone().add(off), b.clone().add(off), 0);
      g.add(wall);
    }
    const piers = Math.max(1, Math.floor(hLen / 8));
    for (let k = 1; k <= piers; k++) {
      const p = new THREE.Vector3().lerpVectors(a, b, k / (piers + 1));
      const h = Math.max(0.8, p.y);
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, h, 8), TR_MAT.mrtBeam);
      pier.position.set(p.x, h * 0.5, p.z);
      g.add(pier);
    }
    return g;
  }

  if (mode === 'cliff_road') {
    // 山岳斷崖景觀公路（瀝青路面＋入口岩石隧道門＋紅色鋼拱景觀橋）
    const road = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.24, len), TR_MAT.asphalt);
    orientAlong(road, a, b, -0.02); road.castShadow = true; road.receiveShadow = true;
    g.add(road);
    const portalP = new THREE.Vector3().lerpVectors(a, b, 0.32);
    const portal = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.35, 1.6), TR_MAT.cliffStone);
    wall.position.y = 0.65;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.11, 8, 14, Math.PI), TR_MAT.cliffArch);
    arch.rotation.y = Math.PI / 2; arch.position.y = 0.15;
    portal.add(wall, arch);
    portal.position.copy(portalP); portal.rotation.y = yaw;
    portal.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(portal);
    return g;
  }

  // highway：國道／省道快速公路（雙線瀝青路面＋金色虛線＋白色路肩＋綠色高架門架牌）
  const road = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, len), TR_MAT.asphalt);
  orientAlong(road, a, b, -0.04); road.receiveShadow = true;
  g.add(road);
  const steps = Math.max(2, Math.floor(len / 2.6));
  for (let s = 1; s < steps; s++) {
    const p = new THREE.Vector3().lerpVectors(a, b, s / steps);
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.88), TR_MAT.dashYellow);
    dash.position.set(p.x, p.y - 0.02, p.z);
    dash.rotation.order = 'YXZ'; dash.rotation.y = yaw; dash.rotation.x = -pitch;
    g.add(dash);
  }
  if (steps >= 4) {
    const gp = mid.clone();
    const signG = new THREE.Group();
    for (const sx of [-1.02, 1.02]) {
      const pL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), TR_MAT.catenary);
      pL.position.set(sx, 0.75, 0); signG.add(pL);
    }
    const boardSign = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.52, 0.12), TR_MAT.gantryGreen);
    boardSign.position.y = 1.45; signG.add(boardSign);
    signG.position.copy(gp); signG.rotation.y = yaw;
    g.add(signG);
  }
  return g;
}

function buildHsrCorridor() {
  // 西部走廊連續高鐵脊線：左營(6) → 嘉義(11) → 台中高鐵(22) → 新竹(27) → 桃園(29) → 板橋(36) → 台北(37)
  const g = new THREE.Group();
  const hsrIndices = [6, 11, 22, 27, 29, 36, 37];
  const pts = hsrIndices.map(i => new THREE.Vector3(TILE_PTS[i].x, Math.max(TILE_PTS[i].y, 1.8) + 0.78, TILE_PTS[i].z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.42);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.34, 8, false), TR_MAT.hsrViaduct);
  tube.scale.y = 0.45;
  tube.castShadow = true; tube.receiveShadow = true;
  g.add(tube);
  const strip = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.12, 6, false), TR_MAT.hsrOrange);
  strip.position.y = 0.16;
  g.add(strip);
  for (let k = 1; k < 22; k++) {
    const pt = curve.getPoint(k / 22);
    const h = Math.max(0.6, pt.y - 0.1);
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, h, 8), TR_MAT.hsrViaduct);
    pier.position.set(pt.x, h * 0.5, pt.z); pier.castShadow = true;
    g.add(pier);
  }
  // 台灣高鐵 700T 流線型動畫列車
  const train = new THREE.Group();
  const whiteM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.56, 3.6), whiteM);
  body.position.y = 0.45;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 8), whiteM);
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.4, 2.3);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 3.7), TR_MAT.hsrOrange);
  band.position.y = 0.42;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 8), whiteM);
  tail.rotation.x = -Math.PI / 2; tail.position.set(0, 0.4, -2.3);
  train.add(body, nose, band, tail);
  train.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(train);
  animProps.push(now => {
    const s = Math.sin(now * 0.00034);
    const u = s * 0.47 + 0.5;
    const pos = curve.getPoint(u);
    const dirSign = Math.cos(now * 0.00034) >= 0 ? 1 : -1;
    const lookU = Math.min(0.999, Math.max(0.001, u + dirSign * 0.015));
    const lookPt = curve.getPoint(lookU);
    train.position.set(pos.x, pos.y + 0.12, pos.z);
    train.lookAt(lookPt.x, lookPt.y + 0.12, lookPt.z);
  });
  return g;
}

// 本島連續地形網格（高度場＋依高度／坡度上色：沙灘、稻田平原、丘陵、森林、岩壁、雪頂）＋森林、村落與湖泊
function buildTerrainMesh() {
  const g = new THREE.Group();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of TW_XZ) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  minX -= 4; maxX += 4; minZ -= 4; maxZ += 4;
  const CELL = 2.0, nx = Math.ceil((maxX - minX) / CELL) + 1, nz = Math.ceil((maxZ - minZ) / CELL) + 1;
  const H = new Float32Array(nx * nz), IN = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minX + i * CELL, z = minZ + j * CELL, k = j * nx + i;
    if (onMainland(x, z)) { IN[k] = 1; H[k] = terrainHeight(x, z); } else H[k] = -0.9;
  }
  // 海岸線外一圈也稍微抬升成淺灘，邊緣較圓滑
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i;
    if (!IN[k] && (IN[k - 1] || IN[k + 1] || IN[k - nx] || IN[k + nx])) H[k] = 0.15;
  }
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const C = {
    sand: new THREE.Color('#dccb94'), paddy: new THREE.Color('#9cc35c'), plain: new THREE.Color('#78ad4f'), plain2: new THREE.Color('#5f9944'),
    hill: new THREE.Color('#4f8a3d'), forest: new THREE.Color('#2c6a35'), forest2: new THREE.Color('#245a2e'), rock: new THREE.Color('#7a7768'),
    rock2: new THREE.Color('#5d5f58'), snow: new THREE.Color('#f1f5f8'), road: new THREE.Color('#c8b98f'),
  };
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = minX + i * CELL, z = minZ + j * CELL, h = H[k];
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    const hx = H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)];
    const hz = H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i];
    const slope = Math.hypot(hx, hz) / (2 * CELL);
    const n = fbm(x / 9, z / 9, 3), n2 = vnoise(x / 2.6, z / 2.6);
    if (h < 0.95) tmp.copy(C.sand);
    else if (h < 2.6) {
      // 平原：稻田方格（深淺交錯）與綠地
      const paddy = (Math.floor(x / 6.5) + Math.floor(z / 6.5)) & 1;
      tmp.copy(n > 0.52 ? C.plain2 : C.plain).lerp(C.paddy, paddy && n < 0.62 ? 0.55 : 0.1);
    } else if (h < 6) tmp.copy(C.plain2).lerp(C.hill, smooth01(2.6, 6, h));
    else if (h < 15) tmp.copy(C.hill).lerp(n2 > 0.5 ? C.forest : C.forest2, smooth01(6, 9, h));
    else if (h < 22) tmp.copy(C.forest2).lerp(n2 > 0.45 ? C.rock : C.rock2, smooth01(15, 19, h));
    else tmp.copy(C.rock).lerp(C.snow, smooth01(22.5, 25, h + n2 * 1.5));
    if (slope > 0.75 && h > 4) tmp.lerp(C.rock2, Math.min(0.75, (slope - 0.75) * 0.9));
    tmp.multiplyScalar(0.9 + n2 * 0.2);
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (!(IN[a] || IN[b] || IN[c] || IN[d])) continue;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  land.receiveShadow = true; land.castShadow = true;
  g.add(land);
  const hAt = (x, z) => {
    const fi = (x - minX) / CELL, fj = (z - minZ) / CELL, i = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(nz - 2, Math.floor(fj)));
    const u = fi - i, v = fj - j, k = j * nx + i;
    return (H[k] * (1 - u) + H[k + 1] * u) * (1 - v) + (H[k + nx] * (1 - u) + H[k + nx + 1] * u) * v;
  };
  const clearOf = (x, z, r) => {
    for (const [lon, lat] of ROUTE_COORDS) { const [tx, tz] = twXZ(lon, lat); if (Math.hypot(x - tx, z - tz) < PAD_R1 + r) return false; }
    for (const s of ROAD_SEGS) if (segDistT(x, z, s.ax, s.az, s.bx, s.bz)[0] < ROAD_R1 + r) return false;
    return true;
  };
  // 森林：山區與丘陵的針葉林、闊葉林（InstancedMesh，數千棵也不卡）
  const rng = (() => { let s = 20260; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 5), pineGeo = new THREE.ConeGeometry(1, 1, 6), leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const trunkM = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 0.9 });
  const pineM = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.85 });
  const MAXT = 2000;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkM, MAXT), crowns = new THREE.InstancedMesh(pineGeo, pineM, MAXT), leafs = new THREE.InstancedMesh(leafGeo, pineM, MAXT);
  let nt = 0, nl = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), cc = new THREE.Color();
  for (let tries = 0; tries < 26000 && (nt < MAXT || nl < MAXT); tries++) {
    const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
    if (!onMainland(x, z)) continue;
    const h = hAt(x, z);
    if (h < 3.2 || h > 19) continue;
    if (fbm(x / 14 + 5, z / 14 + 9, 3) < (h > 7 ? 0.38 : 0.55)) continue;
    if (!clearOf(x, z, 1)) continue;
    const s = 0.9 + rng() * 0.9;
    if (h > 7.5 && nt < MAXT) {
      ps.set(x, h + 0.5 * s, z); sc.set(s, s, s); m4.compose(ps, q, sc); trunks.setMatrixAt(nt, m4);
      ps.set(x, h + 0.9 * s + 1.1 * s, z); sc.set(1.05 * s, 2.6 * s, 1.05 * s); m4.compose(ps, q, sc); crowns.setMatrixAt(nt, m4);
      crowns.setColorAt(nt, cc.set(rng() > 0.5 ? '#1f5c33' : '#2b7040')); nt++;
    } else if (nl < MAXT) {
      ps.set(x, h + 1.2 * s, z); sc.set(1.1 * s, 0.95 * s, 1.1 * s); m4.compose(ps, q, sc); leafs.setMatrixAt(nl, m4);
      leafs.setColorAt(nl, cc.set(rng() > 0.5 ? '#3f8a3a' : '#4f9a40')); nl++;
    }
  }
  trunks.count = nt; crowns.count = nt; leafs.count = nl;
  for (const m of [trunks, crowns, leafs]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // 平原村落：紅瓦、灰瓦小屋群（平原與台地上，避開路網與棋格）
  const MAXH = 700, houseGeo = new THREE.BoxGeometry(1, 1, 1), roofGeo = new THREE.ConeGeometry(0.78, 0.6, 4);
  const houses = new THREE.InstancedMesh(houseGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), MAXH);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, flatShading: true }), MAXH);
  let nh = 0;
  const qr = new THREE.Quaternion();
  for (let tries = 0; tries < 30000 && nh < MAXH; tries++) {
    const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
    if (!onMainland(x, z)) continue;
    const h = hAt(x, z);
    if (h < 1.2 || h > 4.5 || fbm(x / 11 - 3, z / 11 + 7, 3) < 0.6) continue;
    if (!clearOf(x, z, 0.5)) continue;
    const w = 0.9 + rng() * 0.8, hh = 0.7 + rng() * 0.9, ry = rng() * Math.PI;
    qr.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    ps.set(x, h + hh / 2, z); sc.set(w, hh, w * 1.25); m4.compose(ps, qr, sc); houses.setMatrixAt(nh, m4);
    houses.setColorAt(nh, cc.set(rng() > 0.3 ? '#efe6d4' : '#d9d2c4'));
    qr.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry + Math.PI / 4);
    ps.set(x, h + hh + 0.28, z); sc.set(w * 1.05, 1, w * 1.3); m4.compose(ps, qr, sc); roofs.setMatrixAt(nh, m4);
    roofs.setColorAt(nh, cc.set(rng() > 0.45 ? '#b5452f' : '#56606b'));
    nh++;
  }
  houses.count = nh; roofs.count = nh;
  for (const m of [houses, roofs]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // 日月潭：高山湖泊與拉魯島
  const [lx, lz] = twXZ(120.915, 23.855), ly = hAt(lx, lz);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(5.2 * WS * 0.7, 28), new THREE.MeshStandardMaterial({ color: '#2a9fd8', roughness: 0.15, metalness: 0.2 }));
  lake.rotation.x = -Math.PI / 2; lake.scale.set(1.3, 0.85, 1); lake.position.set(lx, ly + 0.25, lz);
  g.add(lake);
  // 河流：濁水溪、高屏溪、淡水河、蘭陽溪、秀姑巒溪（沿地形下降到海）
  const riverM = new THREE.MeshStandardMaterial({ color: '#3aa6d9', roughness: 0.2, metalness: 0.1 });
  const rivers = [
    [[121.02, 23.82], [120.80, 23.82], [120.55, 23.80], [120.25, 23.83]],
    [[120.85, 23.10], [120.70, 22.85], [120.55, 22.65], [120.43, 22.48]],
    [[121.35, 24.85], [121.45, 25.00], [121.42, 25.12]],
    [[121.48, 24.55], [121.65, 24.68], [121.83, 24.72]],
    [[121.30, 23.55], [121.45, 23.48], [121.51, 23.47]],
  ];
  for (const r of rivers) {
    const pts = [];
    for (let k = 1; k < r.length; k++) {
      const [ax, az] = twXZ(r[k - 1][0], r[k - 1][1]), [bx, bz] = twXZ(r[k][0], r[k][1]);
      for (let s = 0; s < 12; s++) {
        const t = s / 12, x = ax + (bx - ax) * t + Math.sin((k * 12 + s) * 0.9) * 1.2, z = az + (bz - az) * t;
        pts.push(new THREE.Vector3(x, Math.max(0.6, hAt(x, z)) + 0.05, z));
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.55, 5), riverM);
    tube.receiveShadow = true;
    g.add(tube);
  }
  return g;
}

function buildTaiwanIsland() {
  const tw = new THREE.Group();

  // 無邊際蔚藍海面波紋圓盤（與背景及霧色融合）
  const wTex = makeWaterNormal();
  const deepSea = new THREE.Mesh(
    new THREE.CylinderGeometry(820 * WS, 820 * WS, 0.8, 72),
    new THREE.MeshStandardMaterial({ color: '#1f66a4', map: wTex, bumpMap: wTex, bumpScale: 0.2, roughness: 0.36, metalness: 0.14 })
  );
  deepSea.position.y = -0.8; deepSea.receiveShadow = true;
  tw.add(deepSea);

  // 高精度 86 點台灣本島 Shape 與真實分層設色地貌貼圖
  const { shape, minX, maxX, minZ, maxZ } = makeShapeXZ(TW_POLY);

  const shelfGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 6.8 * WS, bevelSegments: 2 });
  const shelf = new THREE.Mesh(shelfGeo, new THREE.MeshStandardMaterial({ color: '#115c87', roughness: 0.38, metalness: 0.08 }));
  shelf.rotation.x = -Math.PI / 2; shelf.position.y = -0.45; shelf.receiveShadow = true;
  tw.add(shelf);

  const surfGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 3.1 * WS, bevelSegments: 2 });
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ color: '#269ab8', roughness: 0.38 }));
  surf.rotation.x = -Math.PI / 2; surf.position.y = -0.22; surf.receiveShadow = true;
  tw.add(surf);

  // 本島連續立體地形（高度場）
  tw.add(buildTerrainMesh());

  // 真實離島群（澎湖本島/白沙/西嶼/望安/七美、大金門/烈嶼、馬祖、小琉球、龜山島、綠島、蘭嶼、與那國）
  for (const isl of OFFSHORE_POLYS) {
    tw.add(buildIslandPoly(isl.poly, isl.elev, isl.col, !!isl.lh));
  }

  // 海峽西側閩東南大陸海岸
  tw.add(buildIslandPoly(FUJIAN_POLY, 1.15, '#4c754d', false, { shelfSize: 2.8, surfSize: 1.4, beachSize: 0.6 }));

  // 海面真實地理經緯度網格、北回歸線、海域標註與指北羅盤
  tw.add(buildWorldSeaGrid());

  // 64 格真實多模態海陸空交通路網＋西部高鐵脊線動畫列車
  for (let i = 0; i < TILE_PTS.length; i++) {
    tw.add(makeTransportSegment(i, TILE_PTS[i], TILE_PTS[(i + 1) % TILE_PTS.length], SEG_MODE[i]));
  }
  tw.add(buildHsrCorridor());

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

function makeTileProp(t, idx) {
  const g = new THREE.Group();
  const nm = t.name;

  if (nm === '信義區') {
    // 台北 101 精細建模（裙樓＋7節竹節塔身玻璃帷幕＋金飾＋尖塔＋閃燈）
    const glass = makeWinMat('#247b6c', '#fef08a');
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
    g.userData.baseScale = 0.62;
  } else if (nm === '台北') {
    // 中正紀念堂（白玉階梯基座＋八角藍瓦重簷寶頂）
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
    // 高雄 85 大樓（雙塔撐起高空帷幕主樓＋金頂尖塔）
    const bm = makeWinMat('#335c81', '#bae6fd');
    for (const dx of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.0, 1.2), bm);
      leg.position.set(dx, 2.0, 0); g.add(leg);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 1.2), bm); mid.position.y = 5.4;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 4), new THREE.MeshStandardMaterial({ color: '#f39c12', metalness: 0.5 }));
    top.rotation.y = Math.PI / 4; top.position.y = 7.9;
    g.add(mid, top);
    g.userData.baseScale = 0.65;
  } else if (t.type === 'start') {
    // 鵝鑾鼻燈塔＋紅色迎賓拱柱＋南國椰子樹
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
    // 阿里山森林紅色蒸汽小火車＋千年檜木神木
    const tr = tree(1.1, '#1e5e32'); tr.position.set(-1.1, 0, -0.4);
    const loco = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    loco.position.set(0.8, 0.65, 0.6);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.35, 1.0), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
    cab.position.set(0.25, 0.9, 0.6);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 8), new THREE.MeshStandardMaterial({ color: '#1e293b' }));
    chimney.position.set(1.35, 1.4, 0.6);
    g.add(tr, loco, cab, chimney);
  } else if (nm === '日月潭') {
    // 日月潭慈恩八角寶塔
    g.add(makePagodaOrTower('#fde68a', '#b91c1c', 4));
  } else if (nm === '竹科') {
    // 竹科半導體晶圓廠（玻璃帷幕廠辦＋旋轉發光矽晶圓）
    const fab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.7, 2.0), makeWinMat('#334155', '#38bdf8'));
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
    // 阿妹茶樓山城階梯木屋＋紅燈籠陣列
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
  } else if (nm === '台南') {
    // 台南赤崁樓（海神廟朱紅重簷雙樓閣＋石龜御碑基座）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.65, 2.2), new THREE.MeshStandardMaterial({ color: '#b45309' })); base.position.y = 0.32;
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); f1.position.y = 1.2;
    const e1 = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.65, 4), new THREE.MeshStandardMaterial({ color: '#d97706' })); e1.rotation.y = Math.PI / 4; e1.position.y = 1.95;
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.1), new THREE.MeshStandardMaterial({ color: '#dc2626' })); f2.position.y = 2.45;
    const e2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.65, 4), new THREE.MeshStandardMaterial({ color: '#b45309' })); e2.rotation.y = Math.PI / 4; e2.position.y = 3.15;
    g.add(base, f1, e1, f2, e2);
  } else if (nm === '安平') {
    // 安平古堡熱蘭遮城（紅磚稜堡＋純白八角瞭望燈樓＋砲管）
    const fort = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 2.2), new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.85 })); fort.position.y = 0.58;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(0.35, 2.1, -0.2);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); cap.position.set(0.35, 3.45, -0.2);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6 }));
    cannon.rotation.z = Math.PI / 2; cannon.position.set(-1.3, 1.25, 0.5);
    g.add(fort, tower, cap, cannon);
  } else if (nm === '台東') {
    // 台東鹿野高台彩色熱氣球（上下飄浮動畫）
    const bal = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshStandardMaterial({ color: '#fb7185' }));
    env.scale.set(0.95, 1.25, 0.95); env.position.y = 2.6;
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.14, 6, 16), new THREE.MeshStandardMaterial({ color: '#facc15' }));
    stripe.rotation.x = Math.PI / 2; stripe.position.y = 2.65;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: '#92400e' }));
    basket.position.y = 0.9;
    bal.add(env, stripe, basket); g.add(bal);
    animProps.push(now => { bal.position.y = 0.35 + Math.sin(now * 0.0028) * 0.45; });
  } else if (nm === '澎湖') {
    // 澎湖雙心石滬（潮間帶玄武岩雙心環）＋漁翁島白塔
    const seaPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.25 })); seaPlate.position.y = 0.08;
    const stoneM = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.95 });
    for (const [hx, hz, hr] of [[-0.45, 0.2, 0.62], [0.42, -0.25, 0.45]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(hr, 0.12, 5, 12), stoneM);
      ring.rotation.x = Math.PI / 2; ring.position.set(hx, 0.24, hz); g.add(ring);
    }
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.9, 10), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    lh.position.set(1.0, 1.0, -0.8);
    g.add(seaPlate, lh);
  } else if (nm === '綠島') {
    // 綠島朝日海岸礁石＋哈巴狗風蝕岩＋白色風力發電機
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), new THREE.MeshStandardMaterial({ color: '#4b5563', flatShading: true }));
    rock.scale.set(1.2, 0.8, 0.9); rock.position.set(-0.95, 0.45, 0.5);
    const turb = makeWindTurbine(); turb.position.set(0.65, 0, -0.35); turb.scale.setScalar(0.85);
    g.add(rock, turb);
  } else if (nm === '蘭嶼') {
    // 達悟族拼板舟（弧形船身＋紅白黑船眼圖騰雙尖首）
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.48, 0.82), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    hull.position.y = 0.38;
    const keel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.24, 0.86), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
    keel.position.y = 0.24;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.88), new THREE.MeshStandardMaterial({ color: '#0f172a' }));
    stripe.position.y = 0.52;
    for (const sx of [-1.25, 1.25]) {
      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.25, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
      stem.position.set(sx, 0.9, 0); stem.rotation.z = sx < 0 ? 0.35 : -0.35;
      g.add(stem);
    }
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.9), new THREE.MeshStandardMaterial({ color: '#92400e' }));
    paddle.position.set(0, 0.68, 0); paddle.rotation.y = 0.6;
    g.add(hull, keel, stripe, paddle);
  } else if (nm === '彰化') {
    // 彰化八卦山大佛（八角蓮花座＋莊嚴金銅盤坐大佛）
    const lotus = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); lotus.position.y = 0.28;
    const bronzeM = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.45, roughness: 0.5 });
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.05, 1.45, 10), bronzeM); robe.position.y = 1.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 10), bronzeM); head.position.y = 2.35;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 6, 16), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#654b00' })); halo.position.set(0, 2.3, -0.32);
    g.add(lotus, robe, head, halo);
  } else if (nm === '墾丁') {
    // 墾丁大尖石山帆船石＋雙熱帶椰樹＋彩色海灘遮陽傘
    const sailRock = new THREE.Mesh(new THREE.ConeGeometry(0.82, 2.2, 5), new THREE.MeshStandardMaterial({ color: '#64748b', flatShading: true }));
    sailRock.position.set(-0.9, 1.05, -0.3);
    const p1 = palmTree(0.8); p1.position.set(0.85, 0, -0.4);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 6), new THREE.MeshStandardMaterial({ color: '#ef4444' })); umb.position.set(0.2, 1.0, 0.75);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); pole.position.set(0.2, 0.5, 0.75);
    g.add(sailRock, p1, umb, pole);
  } else if (nm === '恆春') {
    // 恆春古城紅磚城門（拱形通道＋閩南馬背門樓）
    const brick = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.85 });
    for (const dx of [-0.95, 0.95]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.45, 1.4), brick); pier.position.set(dx, 0.72, 0); g.add(pier);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 1.4), brick); lintel.position.y = 1.68;
    const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.85, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    gateRoof.rotation.y = Math.PI / 4; gateRoof.scale.set(1.3, 1, 0.8); gateRoof.position.y = 2.38;
    g.add(lintel, gateRoof);
  } else if (nm === '屏東') {
    // 屏東大鵬灣跨海開合白塔＋躍水黑鮪魚銅雕
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.9, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    mast.position.set(-0.8, 1.45, 0); mast.rotation.z = -0.25;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); deck.position.y = 0.45;
    const tuna = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.6, roughness: 0.25 }));
    tuna.rotation.z = -0.95; tuna.position.set(0.65, 1.45, 0.35);
    g.add(mast, deck, tuna);
  } else if (nm === '淡水') {
    // 淡水漁人碼頭情人橋白色斜張塔
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3.8, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    mast.position.set(0, 1.8, 0); mast.rotation.z = -0.35;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.8), new THREE.MeshStandardMaterial({ color: '#94a3b8' }));
    deck.position.y = 0.45;
    g.add(mast, deck);
  } else if (nm === '嘉義') {
    // 北回歸線太陽館（銀白雙柱＋金色日晷圓環）
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 8), new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 }));
    base.position.y = 0.18;
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 2.7, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 }));
    pylon.position.y = 1.65;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 16), new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.55, roughness: 0.3 }));
    ring.position.y = 2.65; ring.rotation.x = Math.PI / 6;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.35 }));
    orb.position.y = 2.65;
    g.add(base, pylon, ring, orb);
  } else if (nm === '金門') {
    // 莒光樓（白石台基＋朱紅宮殿重簷閣樓）
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 2.1), new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.8 }));
    base.position.y = 0.25;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.35, 1.35), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.6 }));
    wall.position.y = 1.15;
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.55, 4), new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.5 }));
    roof1.position.y = 1.95; roof1.rotation.y = Math.PI / 4;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.55, 4), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.5 }));
    roof2.position.y = 2.45; roof2.rotation.y = Math.PI / 4;
    g.add(base, wall, roof1, roof2);
  } else if (nm === '北港廟宇') {
    // 北港朝天宮（三川重簷黃金琉璃頂＋雙龍柱＋天公爐）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.55, 2.1), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); base.position.y = 0.78;
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 0.85, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    r1.rotation.y = Math.PI / 4; r1.scale.set(1.25, 1, 0.85); r1.position.y = 1.95;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.75, 4), new THREE.MeshStandardMaterial({ color: '#f59e0b' }));
    r2.rotation.y = Math.PI / 4; r2.scale.set(1.2, 1, 0.8); r2.position.y = 2.55;
    const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.45, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 }));
    censer.position.set(0, 0.4, 1.2);
    g.add(base, r1, r2, censer);
  } else if (nm === '行天宮') {
    // 台北行天宮（沉穩青瓦屋頂＋朱紅三開間殿堂）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.4, 1.9), new THREE.MeshStandardMaterial({ color: '#991b1b' })); base.position.y = 0.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.1, 4), new THREE.MeshStandardMaterial({ color: '#334155' }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 0.85, 0.85); roof.position.y = 1.95;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: '#fbbf24' })); ridge.position.y = 2.5;
    g.add(base, roof, ridge);
  } else if (nm === '迎神殿') {
    // 花東迎神殿（朱紅八卦神龕＋旋轉金神明光輪）
    const shrine = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 1.4, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); shrine.position.y = 0.7;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.15, 8), new THREE.MeshStandardMaterial({ color: '#f59e0b' })); roof.position.y = 1.95;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.1, 6, 16), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#ca8a04' }));
    halo.position.set(0, 2.8, 0);
    animProps.push(now => { halo.rotation.y = now * 0.0028; });
    g.add(shrine, roof, halo);
  } else if (t.type === 'hospital') {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 2.0), makeWinMat('#f1f5f9', '#38bdf8'));
    b.position.y = 1.25;
    const red = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#7f1d1d' });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 0.16), red); c1.position.set(0, 1.75, 1.05);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.16), red); c2.position.set(0, 1.75, 1.05);
    g.add(b, c1, c2);
  } else if (t.type === 'casino') {
    // 去金門途中的海峽豪華郵輪賭場（雙層霓虹甲板＋金幣輪盤塔＋旋轉幸運骰）
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 1.7), new THREE.MeshStandardMaterial({ color: '#1e1b4b', metalness: 0.35, roughness: 0.35 }));
    hull.position.y = 0.45;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.3), makeWinMat('#312e81', '#fde047'));
    deck.position.y = 1.3;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.28, 12), new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#92400e', metalness: 0.65, roughness: 0.25 }));
    crown.position.y = 2.05;
    const neonRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 16), new THREE.MeshStandardMaterial({ color: '#ec4899', emissive: '#be185d' }));
    neonRing.rotation.x = Math.PI / 2; neonRing.position.y = 2.35;
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#ca8a04', roughness: 0.25 }));
    die.position.y = 2.85;
    animProps.push(now => { crown.rotation.y = now * 0.002; die.rotation.y = -now * 0.003; die.rotation.x = now * 0.002; });
    g.add(hull, deck, crown, neonRing, die);
  } else if (nm === '小琉球') {
    // 小琉球花瓶岩（珊瑚礁海蝕柱＋綠意頂冠）
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.65, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#a8a29e', flatShading: true })); stem.position.y = 0.55;
    const top = new THREE.Mesh(new THREE.DodecahedronGeometry(0.92, 0), new THREE.MeshStandardMaterial({ color: '#78716c', flatShading: true })); top.position.y = 1.45;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.65, 7, 6), new THREE.MeshStandardMaterial({ color: '#16a34a', flatShading: true })); bush.position.y = 2.1;
    g.add(stem, top, bush);
  } else if (nm === '馬祖') {
    // 馬祖東湧白色燈塔＋八八坑道酒甕
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.54, 2.3, 10), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(-0.45, 1.15, 0);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b' })); lantern.position.set(-0.45, 2.45, 0);
    const jar = new THREE.Mesh(new THREE.SphereGeometry(0.58, 8, 8), new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.5 })); jar.scale.set(1, 1.25, 1); jar.position.set(0.8, 0.68, 0.2);
    g.add(tower, lantern, jar);
  } else if (nm === '龜山島') {
    // 龜山島雙峰火山頭＋牛奶海環圈
    const shell = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.85, 7), new THREE.MeshStandardMaterial({ color: '#15803d', flatShading: true })); shell.position.set(-0.2, 0.92, 0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.15, 6), new THREE.MeshStandardMaterial({ color: '#166534', flatShading: true })); head.position.set(1.05, 0.58, 0.15);
    g.add(shell, head);
  } else if (nm === '平溪') {
    // 平溪祈福天燈（發光金橘大天燈上下漂浮）
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.45, 1.35, 4), new THREE.MeshStandardMaterial({ color: '#fb923c', emissive: '#ea580c', roughness: 0.4 }));
    lan.rotation.y = Math.PI / 4; lan.position.y = 1.65;
    animProps.push(now => { lan.position.y = 1.65 + Math.sin(now * 0.003) * 0.32; lan.rotation.y = Math.PI / 4 + Math.sin(now * 0.0015) * 0.25; });
    g.add(lan);
  } else if (nm === '三義' || nm === '玉里' || nm === '知本') {
    // 龍騰斷橋／客城紅橋／知本溫泉湯屋
    const col = nm === '玉里' ? '#dc2626' : nm === '知本' ? '#0ea5e9' : '#9a3412';
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 1.0), new THREE.MeshStandardMaterial({ color: col })); deck.position.y = 1.05;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.8), new THREE.MeshStandardMaterial({ color: '#78350f' })); p1.position.set(-0.9, 0.52, 0);
    const p2 = p1.clone(); p2.position.x = 0.9;
    g.add(deck, p1, p2);
  } else if (t.type === 'shop') {
    const shopOrder = R.BOARD.slice(0, idx).filter(x => x.type === 'shop').length;
    if (shopOrder === 0) {
      // 關子嶺道具屋：紫頂道具屋＋冒蒸氣泥漿溫泉湯池
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: '#fde68a' })); body.position.set(-0.4, 0.8, -0.2);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.9), new THREE.MeshStandardMaterial({ color: '#9333ea' })); awn.position.set(-0.4, 1.6, 0.55); awn.rotation.x = 0.25;
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.45, 10), new THREE.MeshStandardMaterial({ color: '#78716c' })); pool.position.set(0.95, 0.24, 0.4);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.48, 10), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7' })); water.position.set(0.95, 0.25, 0.4);
      g.add(body, awn, pool, water);
    } else if (shopOrder === 1) {
      // 八里左岸道具屋：水岸斜頂文創屋＋藍白條紋遮陽棚
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.75, 1.7), makeWinMat('#f8fafc', '#fde047')); body.position.y = 0.88;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#7c3aed' })); roof.rotation.y = Math.PI / 4; roof.position.y = 2.2;
      const gift = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#713f12' })); gift.position.set(0.9, 0.38, 1.0);
      g.add(body, roof, gift);
    } else {
      // 瑞穗牧場道具屋：紅白農舍穀倉＋黑白乳牛斑紋鮮奶筒倉
      const barn = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: '#dc2626' })); barn.position.set(-0.45, 0.8, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#78350f' })); roof.rotation.y = Math.PI / 4; roof.position.set(-0.45, 2.05, 0);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.1, 10), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); silo.position.set(1.0, 1.05, -0.2);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.45, 10), new THREE.MeshStandardMaterial({ color: '#1e293b' })); band.position.set(1.0, 1.25, -0.2);
      g.add(barn, roof, silo, band);
    }
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
    // 陽明山國家公園：小油坑火山口硫磺丘＋八角觀景涼亭
    const volcano = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.45, 1.55, 8), new THREE.MeshStandardMaterial({ color: '#6b7280', flatShading: true })); volcano.position.set(-0.85, 0.78, -0.2);
    const sulfur = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 6), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#713f12' })); sulfur.position.set(-0.85, 1.55, -0.2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.85, 6), new THREE.MeshStandardMaterial({ color: '#16a34a' })); roof.position.set(0.9, 1.85, 0.25);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.25, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#b77944', side: THREE.DoubleSide })); col.position.set(0.9, 0.65, 0.25);
    g.add(volcano, sulfur, roof, col);
  } else if (t.type === 'tax') {
    // 國稅局金幣銀庫大樓
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 1.8), makeWinMat('#64748b', '#fde047'));
    b.position.y = 0.95;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.25, 14), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 }));
    coin.rotation.x = Math.PI / 2; coin.position.y = 2.45;
    g.add(b, coin);
  } else if (nm === '桃園機場') {
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
  } else if (nm === '基隆港') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.85, 1.3), new THREE.MeshStandardMaterial({ color: '#1e3a5f' }));
    hull.position.set(-0.2, 0.45, 0.2);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: '#f97316' }));
    cargo.position.set(0.2, 1.15, 0.2);
    const crane = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.7, 0.35), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
    crane.position.set(1.2, 1.35, -0.2);
    g.add(hull, cargo, crane);
  } else if (nm === '高鐵左營') {
    // 高鐵左營站：半屏山波浪雙飛翼頂棚＋700T列車
    const hall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.8), makeWinMat('#475569', '#bae6fd')); hall.position.y = 0.65;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.6, 8, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    canopy.rotation.z = Math.PI / 2; canopy.scale.set(0.55, 1, 0.75); canopy.position.y = 1.45;
    const train = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.55, 0.8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); train.position.set(0, 0.5, 1.0);
    const org = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.16, 0.84), new THREE.MeshStandardMaterial({ color: '#f97316' })); org.position.set(0, 0.48, 1.0);
    g.add(hall, canopy, train, org);
  } else if (nm === '台中高鐵') {
    // 台中烏日高鐵站：雙跨距流線鋼拱帷幕＋橘帶高鐵列車
    const st = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.4, 1.9), makeWinMat('#334155', '#fde68a')); st.position.y = 0.7;
    for (const ax of [-0.9, 0.9]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#f97316' }));
      arch.rotation.y = Math.PI / 2; arch.position.set(ax, 1.0, 0); g.add(arch);
    }
    g.add(st);
  } else if (t.type === 'chance' || t.type === 'fate') {
    // 8 處機會／命運結合在地真實風景微縮造型＋頂部旋轉機率結晶
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.54, 0),
      new THREE.MeshStandardMaterial({ color: t.type === 'chance' ? '#f59e0b' : '#3b82f6', emissive: t.type === 'chance' ? '#92400e' : '#1e3a8a', roughness: 0.25 })
    );
    gem.position.y = 2.45; g.add(gem);
    animProps.push(now => { gem.rotation.y = now * 0.0025; gem.position.y = 2.35 + Math.sin(now * 0.004) * 0.22; });
    const cfOrder = R.BOARD.slice(0, idx).filter(x => x.type === 'chance' || x.type === 'fate').length;
    if (cfOrder === 0) {
      // 枋山海景夕陽愛情拱框
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 6, 16), new THREE.MeshStandardMaterial({ color: '#fb7185' }));
      arch.position.y = 0.88; g.add(arch);
    } else if (cfOrder === 1) {
      // 七股白色鹽山雙金字塔
      const salt = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.45, 4), new THREE.MeshStandardMaterial({ color: '#f8fafc', flatShading: true }));
      salt.rotation.y = Math.PI / 4; salt.position.set(0, 0.72, 0); g.add(salt);
    } else if (cfOrder === 2) {
      // 大甲高美濕地紅白條紋燈塔＋木棧道
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 1.75, 8), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
      tower.position.set(-0.5, 0.88, 0);
      const boardWalk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.65), new THREE.MeshStandardMaterial({ color: '#92400e' }));
      boardWalk.position.set(0.4, 0.2, 0.2);
      g.add(tower, boardWalk);
    } else if (cfOrder === 3) {
      // 湖口老街紅磚巴洛克牌樓
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.35, 0.7), new THREE.MeshStandardMaterial({ color: '#b45309' }));
      wall.position.y = 0.68;
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.65, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
      crest.rotation.y = Math.PI / 4; crest.position.y = 1.6;
      g.add(wall, crest);
    } else if (cfOrder === 4) {
      // 汐止山谷雲海六角涼亭
      const pav = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.75, 6), new THREE.MeshStandardMaterial({ color: '#059669' })); pav.position.y = 1.35;
      const baseP = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 0.9, 6), new THREE.MeshStandardMaterial({ color: '#78350f' })); baseP.position.y = 0.45;
      g.add(pav, baseP);
    } else if (cfOrder === 5) {
      // 蘇花清水斷崖青灰山海石壁
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.0, 5), new THREE.MeshStandardMaterial({ color: '#64748b', flatShading: true }));
      c1.position.set(-0.3, 1.0, -0.2); g.add(c1);
    } else if (cfOrder === 6) {
      // 池上伯朗大道金城武樹＋金色稻田
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 1.8), new THREE.MeshStandardMaterial({ color: '#eab308' })); pad.position.y = 0.1;
      const tr = tree(0.85, '#16a34a'); tr.position.set(0, 0.15, 0);
      g.add(pad, tr);
    } else {
      // 旭海太平洋海岸碑
      const stele = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.65, 6), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
      stele.position.y = 0.82; g.add(stele);
    }
  } else if (nm === '雲林') {
    // 西螺大橋（鮮紅三連鋼拱桁架橋）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.95), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); deck.position.y = 0.5; g.add(deck);
    for (const ax of [-0.95, 0, 0.95]) {
      const span = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
      span.position.set(ax, 0.62, 0); g.add(span);
    }
  } else if (nm === '鹿港') {
    // 鹿港傳統馬背古厝紅磚巷弄＋大紅燈籠
    const house = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.25, 1.5), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); house.position.y = 0.62;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.75, 4), new THREE.MeshStandardMaterial({ color: '#334155' })); roof.rotation.y = Math.PI / 4; roof.scale.set(1.2, 1, 0.9); roof.position.y = 1.6;
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#991b1b' })); lantern.position.set(0, 1.0, 0.95);
    g.add(house, roof, lantern);
  } else if (nm === '南投') {
    // 南投清境合歡歐式木屋塔＋綠丘綿羊
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.25, 1.4), new THREE.MeshStandardMaterial({ color: '#fef3c7' })); cabin.position.set(-0.35, 0.62, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.1, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' })); roof.rotation.y = Math.PI / 4; roof.position.set(-0.35, 1.75, 0);
    const sheep = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); sheep.scale.set(1.3, 0.9, 0.9); sheep.position.set(0.95, 0.32, 0.4);
    g.add(cabin, roof, sheep);
  } else if (nm === '台中') {
    // 台中公園湖心亭雙連尖塔涼亭＋碧湖基座
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#38bdf8' })); water.position.y = 0.1;
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 1.15), new THREE.MeshStandardMaterial({ color: '#ffffff' })); base.position.y = 0.52;
    for (const dx of [-0.52, 0.52]) {
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); top.position.set(dx, 1.28, 0); g.add(top);
    }
    g.add(water, base);
  } else if (nm === '苗栗') {
    // 苗栗龍騰斷橋紅磚拱遺跡＋山樹
    const brickM = new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.9 });
    for (const dx of [-1.05, 0, 1.05]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.75 - Math.abs(dx) * 0.25, 0.8), brickM);
      pier.position.set(dx, 0.85, 0); g.add(pier);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 6, 12, Math.PI), brickM); arch.position.set(-0.52, 1.25, 0);
    const tr = tree(0.65, '#2e7d32'); tr.position.set(1.2, 0, -0.5);
    g.add(arch, tr);
  } else if (nm === '新竹') {
    // 新竹東門城迎曦門（石砌拱座＋重簷紅門樓）
    const stone = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.5), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); stone.position.y = 0.5;
    const pav = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 1.1), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); pav.position.y = 1.42;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#b45309' })); roof.rotation.y = Math.PI / 4; roof.position.y = 2.25;
    g.add(stone, pav, roof);
  } else if (nm === '桃園') {
    // 桃園大溪巴洛克紅磚三拱牌樓＋高塔
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.2), new THREE.MeshStandardMaterial({ color: '#b45309' })); body.position.y = 0.75;
    const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 0.75, 6), new THREE.MeshStandardMaterial({ color: '#fef3c7' })); gable.position.y = 1.85;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' })); spire.rotation.y = Math.PI / 4; spire.position.y = 2.6;
    g.add(body, gable, spire);
  } else if (nm === '新北') {
    // 新北板橋都會雙塔商辦＋發光竹筍錐塔
    const tw1 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.7, 1.0), makeWinMat('#1e3a5f', '#fef08a')); tw1.position.set(-0.8, 1.35, -0.2);
    const tw2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.9), makeWinMat('#334155', '#38bdf8')); tw2.position.set(0.8, 1.05, -0.2);
    const shoot = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.1, 8), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7' })); shoot.position.set(0, 1.05, 0.65);
    g.add(tw1, tw2, shoot);
  } else if (nm === '宜蘭') {
    // 宜蘭蘭陽博物館（斜角單面山幾何岩石館體）
    const museum = new THREE.Mesh(new THREE.ConeGeometry(1.75, 2.35, 4), makeWinMat('#475569', '#bae6fd'));
    museum.rotation.y = Math.PI / 4; museum.rotation.z = -0.32; museum.position.set(0.15, 0.95, 0);
    g.add(museum);
  } else if (nm === '羅東') {
    // 羅東林業園區蓄木池＋檜木原木堆＋木構站房
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.4), new THREE.MeshStandardMaterial({ color: '#92400e' })); cabin.position.set(-0.5, 0.55, -0.2);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.7, 4), new THREE.MeshStandardMaterial({ color: '#475569' })); roof.rotation.y = Math.PI / 4; roof.position.set(-0.5, 1.45, -0.2);
    const logM = new THREE.MeshStandardMaterial({ color: '#78350f' });
    for (let k = 0; k < 3; k++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 6), logM);
      log.rotation.x = Math.PI / 2; log.position.set(0.9 + (k % 2) * 0.25, 0.2 + Math.floor(k / 2) * 0.3, 0.25);
      g.add(log);
    }
    g.add(cabin, roof);
  } else {
    // 花蓮七星潭太平洋海浪＋躍起藍鯨尾鰭地標
    const wave = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#0284c7' })); wave.position.y = 0.11;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#1e3a8a' })); stem.position.set(0, 0.85, 0); stem.rotation.x = -0.2;
    const fluke = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.25, 0.58), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.35 })); fluke.position.set(0, 1.55, -0.15);
    g.add(wave, stem, fluke);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// 地名浮動標籤預設關閉（棋格改以立體造景辨識，點棋格可看名稱與價格）
let showLabels = localStorage.getItem('rich_labels2') === '1';
const labelGroup = new THREE.Group();
labelGroup.visible = showLabels;
board.add(labelGroup);

const tileProps = new Array(R.BOARD.length).fill(null);
const tileLabels = new Array(R.BOARD.length).fill(null);

// 棋格立體造景：八角石台＋組別色環＋主題地面（都會廣場／海岸沙灘／山林／田園／廟埕）＋放大的地標建模；格子上不再印平面文字
const TILE_R = 5.6;
const LM_OFF = new THREE.Vector3(-1.9, 0, -2.5);   // 地標位置（棋格後方偏左）
const HOUSE_OFF = new THREE.Vector3(2.6, 0, -2.4); // 地產建築（後方偏右）
const COAST_TILES = new Set(['墾丁', '安平', '澎湖', '淡水', '基隆港', '綠島', '蘭嶼', '金門', '鹿港', '小琉球', '馬祖', '賭場', '龜山島']);
const URBAN_TILES = new Set(['台北', '信義區', '高雄', '台中', '新北', '台南', '竹科', '桃園', '新竹', '桃園機場', '屏東', '彰化', '嘉義', '宜蘭', '花蓮', '台東']);
function tileTheme(t, i) {
  if (t.type === 'temple') return 'temple';
  if (t.type === 'station' || URBAN_TILES.has(t.name)) return 'urban';
  if (COAST_TILES.has(t.name) || !TILE_MAIN[i]) return 'coast';
  if (TILE_ELEV[i] > 6 || t.type === 'park') return 'mountain';
  return 'rural';
}
const THEME_TOP = { urban: '#a7adb5', coast: '#e3d29a', mountain: '#5f8a4a', rural: '#86b95a', temple: '#d9c7a4' };
const tileBases = [];
function decorateTile(g, theme, i) {
  const rnd = (() => { let s = 977 * (i + 3); return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const at = (x, z) => new THREE.Vector3(x, 0.32, z);
  if (theme === 'urban') {
    // 斑馬線＋路燈＋背景小樓群
    const zebra = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6 });
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 1.6), zebra); s.position.set(-1.6 + k * 0.8, 0.33, 0.1); g.add(s); }
    const glass = makeWinMat(rnd() > 0.5 ? '#334155' : '#1e3a5f', '#fde68a');
    for (let k = 0; k < 3; k++) {
      const hh = 1.6 + rnd() * 2.8, b = new THREE.Mesh(new THREE.BoxGeometry(1.1, hh, 1.1), glass);
      b.position.set(-4.3 + k * 0.4, 0.3 + hh / 2, -0.9 - k * 1.25); b.castShadow = true; g.add(b);
    }
    for (const [x, z] of [[4.3, 1.4], [-4.3, 2.6]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#475569' }));
      pole.position.copy(at(x, z)).setY(1.4); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff7c2', emissive: '#facc15', emissiveIntensity: 0.8 }));
      lamp.position.copy(pole.position).setY(2.55); g.add(pole, lamp);
    }
  } else if (theme === 'coast') {
    // 半月形海水＋浪花＋椰子樹＋礁石
    const sea = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R - 0.45, TILE_R - 0.45, 0.06, 24, 1, false, Math.PI * 0.55, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: '#29a3d6', roughness: 0.12, metalness: 0.2 }));
    sea.position.y = 0.35; g.add(sea);
    const foam = new THREE.Mesh(new THREE.TorusGeometry(TILE_R - 1.4, 0.08, 4, 24, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: '#f0f9ff' }));
    foam.rotation.x = Math.PI / 2; foam.rotation.z = -Math.PI * 0.55 - Math.PI * 0.9 + Math.PI / 2; foam.position.y = 0.4; g.add(foam);
    const p1 = palmTree(0.9); p1.position.set(4.0, 0.3, -1.2); g.add(p1);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: '#6b7280', flatShading: true }));
    rock.position.set(-4.1, 0.55, 1.6); rock.scale.set(1.2, 0.8, 1); g.add(rock);
  } else if (theme === 'mountain') {
    // 岩塊＋針葉樹＋小山脊
    for (let k = 0; k < 3; k++) { const tr = tree(0.48 + rnd() * 0.2, k % 2 ? '#1f5c33' : '#2b7040'); tr.position.set(3.9 - k * 0.6, 0.3, -1.6 + k * 1.5); g.add(tr); }
    const crag = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 5), new THREE.MeshStandardMaterial({ color: '#6b6f66', flatShading: true }));
    crag.position.set(-4.2, 1.4, 1.2); crag.castShadow = true; g.add(crag);
  } else if (theme === 'rural') {
    // 稻田畦＋竹籬＋大樹
    const rice = new THREE.MeshStandardMaterial({ color: '#a7cf61', roughness: 0.9 });
    for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.42), rice); r.position.set(-3.2, 0.38, 0.6 + k * 0.7); g.add(r); }
    const tr = tree(0.68, '#3f8a3a'); tr.position.set(4.0, 0.3, -1.0); g.add(tr);
  } else if (theme === 'temple') {
    // 廟埕：紅燈籠柱＋石獅座
    for (const x of [-3.8, 3.8]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
      col.position.set(x, 1.4, 1.9); const lan = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#7f1d1d' }));
      lan.position.set(x, 2.7, 1.9); lan.scale.y = 1.25; g.add(col, lan);
    }
  }
}
function makeTileBase(t, i) {
  const g = new THREE.Group();
  const gc = t.group ? R.GROUPS[t.group].color : (TYPE_STYLE[t.type]?.[1] || '#94a3b8');
  const theme = tileTheme(t, i);
  // 石台：往下延伸埋進地形
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R, TILE_R + 0.55, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#d8cfbb', roughness: 0.82 }));
  stone.rotation.y = Math.PI / 8; stone.position.y = -1.42; stone.castShadow = true; stone.receiveShadow = true;
  // 組別色環（以顏色辨識地段組別）
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R + 0.06, TILE_R + 0.06, 0.34, 8, 1, true), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.18, roughness: 0.5, side: THREE.DoubleSide }));
  rim.rotation.y = Math.PI / 8; rim.position.y = 0.06;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R - 0.18, TILE_R - 0.18, 0.12, 8), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.9 }));
  top.rotation.y = Math.PI / 8; top.position.y = 0.26; top.receiveShadow = true;
  // 四角組別色小方塔（從遠處也能一眼看出地段顏色）
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: gc, roughness: 0.55 }));
    post.position.set(Math.cos(a) * (TILE_R - 0.35), 0.62, Math.sin(a) * (TILE_R - 0.35)); post.rotation.y = -a; post.castShadow = true; g.add(post);
  }
  g.add(stone, rim, top);
  decorateTile(g, theme, i);
  stone.userData.i = i; top.userData.i = i;
  tileBases.push(stone, top);
  return g;
}

function makeLabelSprite(t, idx) {
  const gc = t.group ? R.GROUPS[t.group].color : (TYPE_STYLE[t.type]?.[1] || '#38bdf8');
  const name = t.name;
  const cw = name.length >= 4 ? 236 : name.length === 3 ? 204 : 176;
  const ch = 76;
  const tex = canvasTex(cw, ch, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const r = 20;
    c.beginPath();
    c.roundRect(4, 4, w - 8, h - 8, r);
    c.fillStyle = 'rgba(15, 23, 42, 0.88)';
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = gc;
    c.stroke();
    c.fillStyle = gc;
    c.fillRect(14, 18, 10, h - 36);
    c.fillStyle = '#f8fafc';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const fs = name.length >= 4 ? 32 : name.length === 3 ? 35 : 38;
    c.font = `900 ${fs}px "PingFang TC","Noto Sans TC",sans-serif`;
    c.fillText(name, (w + 14) * 0.5, h * 0.52);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 10;
  sp.scale.set(cw * 0.025, ch * 0.025, 1);
  sp.userData.tileIdx = idx;
  return sp;
}

(function buildBoard() {
  buildTaiwanIsland();

  R.BOARD.forEach((t, i) => {
    const p = tilePos(i);
    const base = makeTileBase(t, i);
    base.position.copy(p);
    board.add(base);

    const prop = makeTileProp(t, i);
    if (prop.children.length) {
      prop.position.set(p.x + LM_OFF.x, p.y + 0.32, p.z + LM_OFF.z);
      const bs = (prop.userData.baseScale || 0.78) * 1.75;
      prop.userData.baseScale = bs;
      prop.scale.setScalar(bs);
      board.add(prop);
      tileProps[i] = prop;
    }

    const sp = makeLabelSprite(t, i);
    sp.position.set(p.x, p.y + 11, p.z);
    labelGroup.add(sp);
    tileLabels[i] = sp;
  });
})();

// ---------- 精細 5 階地產建築（已購空地 → 一樓平房 → 二樓透天 → 高層大樓 → 超級摩天大樓）----------
const buildG = new THREE.Group();
scene.add(buildG);
let buildKey = '', prevTileLevels = [], activeHouses = [], buildingRise = new Map();

function houseMesh(level, color) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#f5ecd9', roughness: 0.78 });
  const brick = new THREE.MeshStandardMaterial({ color: '#b84a39', roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const win = new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#0c4a6e', roughness: 0.22 });
  if (level === 0) {
    // 0級已購空地：整地石基＋建地木牌
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 3.2), new THREE.MeshStandardMaterial({ color: '#d6ccb5', roughness: 0.9 }));
    pad.position.y = 0.12;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.35, 6), new THREE.MeshStandardMaterial({ color: '#78350f' }));
    post.position.set(0, 0.7, 0);
    const boardSign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.82, 0.14), roof);
    boardSign.position.set(0, 1.35, 0);
    g.add(pad, post, boardSign);
  } else if (level === 1) {
    // 1級一樓平房：台灣紅磚三合院（正身＋左右護龍）
    const main = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.4), brick); main.position.set(0, 0.75, -0.35);
    const rMain = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.1, 4), roof); rMain.position.set(0, 2.0, -0.35); rMain.rotation.y = Math.PI / 4;
    for (const dx of [-1.05, 1.05]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 1.3), brick); wing.position.set(dx, 0.55, 0.65);
      const rW = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 4), roof); rW.position.set(dx, 1.4, 0.65); rW.rotation.y = Math.PI / 4;
      g.add(wing, rW);
    }
    g.add(main, rMain);
  } else if (level === 2) {
    // 2級二樓透天：台灣騎樓雙併透天＋垂直招牌
    for (const [x, h] of [[-1.0, 3.2], [1.05, 2.7]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 2.0), wall); b.position.set(x, h / 2, 0);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.0, 4), roof); r.position.set(x, h + 0.5, 0); r.rotation.y = Math.PI / 4;
      const bal = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.25, 0.4), roof); bal.position.set(x, h * 0.55, 1.05);
      g.add(b, r, bal);
    }
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.4, 0.45), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#785000' }));
    sign.position.set(-2.05, 2.0, 0.85); g.add(sign);
  } else if (level === 3) {
    // 3級高層大樓：六層現代住宅大樓＋陽台＋水塔
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.2, 2.6), wall); b.position.y = 3.1; g.add(b);
    for (let y = 0.9; y < 5.9; y += 1.0) {
      for (const x of [-0.95, 0, 0.95]) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.14), win);
        w.position.set(x, y, 1.32); g.add(w);
      }
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.35), roof);
      slab.position.set(0, y - 0.26, 1.36); g.add(slab);
    }
    const rf = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.45, 2.9), roof); rf.position.y = 6.42; g.add(rf);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 10), new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.7 }));
    tank.position.set(0.95, 7.1, -0.45); g.add(tank);
  } else if (level === 4) {
    // 4級摩天大樓：三段退縮式玻璃帷幕地標摩天大樓＋發光霓虹條＋停機坪＋黃金尖塔
    const glass = new THREE.MeshStandardMaterial({ color: '#dbeafe', metalness: 0.55, roughness: 0.2 });
    const neon = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', metalness: 0.7, roughness: 0.2 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 3.8), glass); podium.position.y = 1.1;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.0), goldMat); canopy.position.set(0, 1.15, 2.1);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(3.0, 6.2, 3.0), glass); mid.position.y = 5.3;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.2, 2.2), glass); upper.position.y = 10.5;
    g.add(podium, canopy, mid, upper);
    for (let y = 2.6; y < 8.1; y += 0.95) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.42, 3.1), win); w.position.y = y; g.add(w);
    }
    for (let y = 8.9; y < 12.4; y += 0.9) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.38, 2.3), win); w.position.y = y; g.add(w);
    }
    for (const [cx, cz] of [[-1.52, -1.52], [1.52, -1.52], [-1.52, 1.52], [1.52, 1.52]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 6.3, 0.18), neon);
      strip.position.set(cx, 5.35, cz); g.add(strip);
    }
    const helipad = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.78, 16), goldMat);
    helipad.rotation.x = -Math.PI / 2; helipad.position.y = 12.64; g.add(helipad);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.7), roof); crown.position.y = 13.15; g.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 2.6, 8), goldMat); spire.position.y = 14.9; g.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b', emissiveIntensity: 0.9 }));
    beacon.position.y = 16.25; g.add(beacon);
    g.userData.beacon = beacon;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function syncBuildings() {
  const key = G.tiles.map(t => `${t.owner}:${t.level}`).join(',') + '|' + G.blocks.map(b => b.i).join(',');
  if (key === buildKey) return;
  buildKey = key;
  buildG.clear();
  activeHouses = [];
  const now = performance.now();
  G.tiles.forEach((s, i) => {
    const prevLv = prevTileLevels[i] || 0;
    if (s.owner != null && s.level > prevLv) {
      buildingRise.set(i, { t0: now, fromScale: Math.max(0.16, prevLv / Math.max(1, s.level)) });
    }
    prevTileLevels[i] = s.level || 0;
    if (tileProps[i]) {
      const bs = tileProps[i].userData.baseScale || 0.78;
      tileProps[i].scale.setScalar(s.owner != null && s.level > 0 ? bs * 0.8 : bs);
    }
    const p = tilePos(i);
    if (tileLabels[i]) {
      const hOff = s.owner != null && s.level > 0 ? [11, 11, 12, 14, 19][s.level] : 11;
      tileLabels[i].position.y = p.y + hOff;
    }
    if (s.owner != null) {
      const col = G.players[s.owner].color;
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(TILE_R - 0.15, TILE_R + 0.6, 8),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })
      );
      halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI / 8;
      halo.position.set(p.x, p.y + 0.36, p.z); buildG.add(halo);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8), new THREE.MeshStandardMaterial({ color: '#eee' }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.1), new THREE.MeshStandardMaterial({ color: col }));
      const fx = p.x + 4.3, fz = p.z - 3.2;
      pole.position.set(fx, p.y + 1.7, fz); flag.position.set(fx + 0.65, p.y + 2.65, fz);
      buildG.add(pole, flag);
      const h = houseMesh(s.level || 0, col);
      h.position.set(p.x + HOUSE_OFF.x, p.y + 0.32, p.z + HOUSE_OFF.z);
      const baseScale = s.level === 4 ? 0.95 : 0.92;
      h.scale.setScalar(baseScale);
      buildG.add(h);
      activeHouses.push({ group: h, baseScale, tileIdx: i });
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
  g.scale.setScalar(1.38);
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
  g.scale.setScalar(1.25);
  scene.add(g);
  return { g, pos: npc.pos, from: npc.pos, t: 1, moveN: npc.moveN || 0, attachedTo: npc.attachedTo != null ? npc.attachedTo : null };
}

const slotOff = k => new THREE.Vector3([-2.3, 2.3, -2.3, 2.3][k % 4], 0, [1.0, 1.0, 3.5, 3.5][k % 4]);
const tokenWorld = (i, k) => { const p = tilePos(i); return new THREE.Vector3(p.x, p.y + 0.34, p.z).add(slotOff(k)); };
const npcWorld = i => { const p = tilePos(i); return new THREE.Vector3(p.x + 4.4, p.y + 0.34, p.z + 0.6); };
const isIslandLeg = (a, b) => !TILE_MAIN[a] || !TILE_MAIN[b];
const stepDurMs = (a, b) => {
  const base = STEP_MS();
  if (!isIslandLeg(a, b)) return base;
  const dist = tilePos(a).distanceTo(tilePos(b));
  return base * Math.max(2.8, Math.min(4.8, dist / 28));
};

// ---------- 雙顆 3D 骰子（隨當前玩家定位滾動，永不淹沒於地形）----------
const pipTex = n => canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, w); c.fillStyle = n === 1 ? '#c0392b' : '#1b1b1b';
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  for (const [x, y] of P) { c.beginPath(); c.arc(x * w, y * w, n === 1 ? 16 : 11, 0, 7); c.fill(); }
});
const FACE = [3, 4, 1, 6, 2, 5];
const diceMats = FACE.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.35 }));
const dice = [0, 1].map(k => { const m = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 3.4), diceMats); m.castShadow = true; m.position.set(-105 + k * 5.2, 2.2, 120); scene.add(m); return m; });
dice[1].visible = false;
function syncDiceVisible(count = (G ? (R.cur(G).dice || 1) : 1)) {
  dice[0].visible = true;
  dice[1].visible = count > 1;
}
const UP = { 1: [0, 0], 2: [-Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI / 2, 0], 6: [Math.PI, 0] };
let diceAnim = null;
function rollDice(a, b, count = (b > 0 ? 2 : 1)) {
  // 骰子出現在出發點：擲骰時規則已把玩家移到終點，所以用棋子畫面上的位置（尚未開始走）
  let from = G ? R.cur(G).pos : 0;
  if (G && G.move && G.move.path && G.move.path.length) {
    const tk = tokens[G.move.p];
    from = G.move.from != null ? G.move.from : tk && tk.moveN !== G.move.n ? tk.pos : from;
  }
  const anchor = G ? tilePos(from) : new THREE.Vector3(-105, 1.5, 120);
  syncDiceVisible(count);
  diceAnim = {
    t0: performance.now(), dur: 850 / Math.sqrt(SPEED), hold: 680 / SPEED, end: [a, b], count, anchor,
    spin: [new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6), new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6)]
  };
  snd('dice');
}
function stepDice(now) {
  if (!diceAnim) return;
  const t = Math.min(1, (now - diceAnim.t0) / diceAnim.dur);
  const a = diceAnim.anchor;
  dice.forEach((d, k) => {
    if (k >= diceAnim.count) { d.visible = false; return; }
    d.visible = true;
    const [rx, rz] = UP[diceAnim.end[k] || 1];
    const ox = diceAnim.count === 1 ? a.x : a.x + (k ? 2.6 : -2.6), oz = a.z + 5.8;
    if (t < 1) {
      const s = (1 - t) * 1.2;
      d.rotation.set(rx + diceAnim.spin[k].x * s, d.rotation.y + 0.02, rz + diceAnim.spin[k].z * s);
      d.position.set(ox, a.y + 4.2 + Math.abs(Math.sin(t * Math.PI * 3)) * 8.5 * (1 - t), oz);
    } else {
      d.rotation.set(rx, k * 0.35, rz);
      d.position.set(ox, a.y + 3.4, oz);
    }
  });
  // 骰子落定後停留一下讓玩家看清點數，棋子才開始走
  if (now - diceAnim.t0 >= diceAnim.dur + diceAnim.hold) diceAnim = null;
}

// ---------- 鏡頭：操作模式與大戰略 3D 一致（單指/左鍵平移、雙指鎖定縮放或旋轉傾斜、右鍵或 Shift+左鍵旋轉傾斜、Q/E/R/F 與右下角控制列） ----------
const ROT_STEP = Math.PI / 12, TILT_STEP = 10;
const DIST_MIN = 45, DIST_MAX = 680 * WS, TILT_MIN = 18, TILT_MAX = 85;
const camS = {
  yaw: 0.25, yawGoal: 0.25, tilt: 0, tiltGoal: 0, pitch: 0.92, dist: 320 * WS,
  target: new THREE.Vector3(-4, 0, 4), goal: new THREE.Vector3(-4, 0, 4),
  hasGoal: true, follow: true,
};
let lastFocusTurn = -1, wasFollowingFx = false;
const camCtl = {
  rotate(d) { camS.yawGoal += d; },
  rotateBy(d) { camS.yaw += d; camS.yawGoal = camS.yaw; },
  resetYaw() { const full = Math.PI * 2; camS.yawGoal = Math.round(camS.yaw / full) * full; },
  tilt(d) { camS.tiltGoal += d; },
  tiltBy(d) { camS.tilt += d; camS.tiltGoal = camS.tilt; },
  resetTilt() { camS.tiltGoal = 0; },
  setDist(d) { camS.dist = Math.max(DIST_MIN, Math.min(DIST_MAX, d)); },
  zoom(factor) { camCtl.setDist(camS.dist * factor); },
};
function focusCurPlayer() {
  camS.hasGoal = true;
  const ct = G && tokens[G.cur];
  if (ct) camS.goal.copy(ct.g.position).setY(0);
  else camS.goal.set(-4, 0, 4);
}
function resetCamGoal() {
  lastFocusTurn = -1;
  camS.target.set(-4, 0, 4);
  camS.goal.set(-4, 0, 4);
  camS.hasGoal = camS.follow;
}
function panBoard(dx, dy) {
  camS.hasGoal = false;
  const c = Math.cos(camS.yaw), sn = Math.sin(camS.yaw), k = 1 / Math.max(0.25, Math.sin(camS.pitch));
  const vh = Math.max(200, canvas.clientHeight || innerHeight || 720);
  const scale = (2 * camS.dist * Math.tan(camera.fov * Math.PI / 360)) / vh;
  const mx = (c * dx + sn * dy * k) * scale;
  const mz = (-sn * dx + c * dy * k) * scale;
  camS.target.x = Math.max(-290 * WS, Math.min(175 * WS, camS.target.x - mx));
  camS.target.z = Math.max(-230 * WS, Math.min(230 * WS, camS.target.z - mz));
  camS.goal.copy(camS.target);
}
function updateCamera() {
  const t = Math.max(0, Math.min(1, (Math.log(DIST_MAX) - Math.log(camS.dist)) / (Math.log(DIST_MAX) - Math.log(DIST_MIN))));
  const baseDeg = 60 - 18 * t;
  if (camS.tilt !== camS.tiltGoal) {
    camS.tilt += (camS.tiltGoal - camS.tilt) * 0.2;
    if (Math.abs(camS.tiltGoal - camS.tilt) < 0.05) camS.tilt = camS.tiltGoal;
  }
  camS.tiltGoal = Math.max(TILT_MIN - baseDeg, Math.min(TILT_MAX - baseDeg, camS.tiltGoal));
  camS.tilt = Math.max(TILT_MIN - baseDeg, Math.min(TILT_MAX - baseDeg, camS.tilt));
  const elevDeg = Math.max(TILT_MIN, Math.min(TILT_MAX, baseDeg + camS.tilt));
  camS.pitch = elevDeg * Math.PI / 180;
  if (camS.yaw !== camS.yawGoal) {
    camS.yaw += (camS.yawGoal - camS.yaw) * 0.2;
    if (Math.abs(camS.yawGoal - camS.yaw) < 1e-3) camS.yaw = camS.yawGoal;
  }
  if (camS.hasGoal) camS.target.lerp(camS.goal, 0.08);
  const d = camS.dist, cp = Math.cos(camS.pitch);
  camera.position.set(
    camS.target.x + Math.sin(camS.yaw) * cp * d,
    camS.target.y + Math.sin(camS.pitch) * d,
    camS.target.z + Math.cos(camS.yaw) * cp * d
  );
  camera.lookAt(camS.target);
}
(function input() {
  const pts = new Map();
  let down = null, dragging = false, pinch = null, triCenter = null, touchTri = null;
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
      pinch = null; down = null;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), dist: camS.dist, mx, my, mx0: mx, my0: my, mode: null };
      triCenter = null; down = null; dragging = true;
    } else {
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, btn: e.button, shift: e.shiftKey };
      dragging = false; triCenter = null; pinch = null;
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
      const nd = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // 雙指手勢開始時鎖定一次：距離變化較大＝縮放；兩指同向移動較大＝旋轉／傾斜
      if (!pinch.mode) {
        const spread = Math.abs(nd - pinch.d), slide = Math.hypot(mx - pinch.mx0, my - pinch.my0);
        if (Math.max(spread, slide) > 12) pinch.mode = spread > slide ? 'zoom' : 'turn';
        else return;
      }
      if (pinch.mode === 'zoom') camCtl.setDist(pinch.dist * pinch.d / Math.max(1, nd));
      else {
        camCtl.rotateBy(-(mx - pinch.mx) * 0.006);
        camCtl.tiltBy((my - pinch.my) * 0.25);
      }
      pinch.mx = mx; pinch.my = my;
      return;
    }
    if (!down || pts.size !== 1) return;
    const tdx = e.clientX - down.x, tdy = e.clientY - down.y;
    if (!dragging && Math.hypot(tdx, tdy) > 6) { dragging = true; down.lx = down.x; down.ly = down.y; }
    if (!dragging) return;
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
    down.lx = e.clientX; down.ly = e.clientY;
    // 右鍵或 Shift＋左鍵：旋轉與傾斜鏡頭；一般左鍵或單指拖曳：平移棋盤
    if (down.btn === 2 || down.shift) {
      camCtl.rotateBy(-dx * 0.005);
      camCtl.tiltBy(dy * 0.25);
      canvas.style.cursor = 'move';
    } else {
      panBoard(dx, dy);
      canvas.style.cursor = 'grabbing';
    }
  });
  const up = e => {
    const hadPinch = !!pinch;
    pts.delete(e.pointerId);
    if (pts.size >= 3) { triCenter = centroid([...pts.values()]); pinch = null; down = null; }
    else { triCenter = null; }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), dist: camS.dist, mx, my, mx0: mx, my0: my, mode: null };
      down = null;
    } else if (pts.size < 2) {
      pinch = null;
    }
    if (pts.size === 1) {
      const [rest] = pts.values();
      down = { x: rest.x, y: rest.y, lx: rest.x, ly: rest.y, btn: 0, shift: false };
      dragging = hadPinch || dragging;
    }
    if (!pts.size) { down = null; dragging = false; canvas.style.cursor = ''; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  // TouchEvent 三指觸控相容平移備援
  const touchCenter = ts => {
    let sx = 0, sy = 0;
    for (let k = 0; k < ts.length; k++) { sx += ts[k].clientX; sy += ts[k].clientY; }
    return { x: sx / ts.length, y: sy / ts.length };
  };
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length >= 3) { e.preventDefault(); touchTri = touchCenter(e.touches); pinch = null; down = null; }
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
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * px, dy = e.deltaY * px;
    if (e.ctrlKey) { camCtl.setDist(camS.dist * Math.exp(dy * 0.01)); return; }
    const wheelMouse = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (wheelMouse) { camCtl.setDist(camS.dist * Math.exp(dy * 0.0015)); return; }
    // 觸控板雙指滑動：以主要方向決定旋轉或傾斜
    if (Math.abs(dx) > Math.abs(dy)) camCtl.rotateBy(dx * 0.005);
    else camCtl.tiltBy(-dy * 0.12);
  }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());

  function toggleLabels() {
    showLabels = !showLabels;
    labelGroup.visible = showLabels;
    try { localStorage.setItem('rich_labels2', showLabels ? '1' : '0'); } catch (e) { /* 忽略 */ }
    const b = $('#zLabel'); if (b) b.classList.toggle('on', showLabels);
    toast(showLabels ? '🏷️ 地名標籤：顯示' : '🏷️ 地名標籤：隱藏');
  }

  // 鍵盤快捷鍵：Q / E 左右旋轉，R / F 上下俯仰，N 切換地名標籤（與大戰略一致）
  addEventListener('keydown', e => {
    if (!$('#modal').classList.contains('hidden')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'q' || e.key === 'Q') camCtl.rotate(-ROT_STEP);
    else if (e.key === 'e' || e.key === 'E') camCtl.rotate(ROT_STEP);
    else if (e.key === 'r' || e.key === 'R') camCtl.tilt(TILT_STEP);
    else if (e.key === 'f' || e.key === 'F') camCtl.tilt(-TILT_STEP);
    else if (e.key === 'n' || e.key === 'N') toggleLabels();
  });

  // 右下角浮動 3D 鏡頭控制列
  const syncCamBtn = () => { const b = $('#zCam'); if (b) b.classList.toggle('on', camS.follow); };
  syncCamBtn();
  if ($('#zCam')) $('#zCam').onclick = () => {
    camS.follow = !camS.follow;
    syncCamBtn();
    if (camS.follow) focusCurPlayer();
    else camS.hasGoal = false;
    toast(camS.follow ? '🎯 鏡頭：跟隨行動玩家' : '📌 鏡頭：固定視角');
  };
  if ($('#zLabel')) {
    $('#zLabel').classList.toggle('on', showLabels);
    $('#zLabel').onclick = toggleLabels;
  }
  if ($('#zRotL')) $('#zRotL').onclick = () => camCtl.rotate(-ROT_STEP);
  if ($('#zRotR')) $('#zRotR').onclick = () => camCtl.rotate(ROT_STEP);
  if ($('#zRotL') && $('#zRotR')) $('#zRotL').ondblclick = $('#zRotR').ondblclick = () => camCtl.resetYaw();
  if ($('#zTiltU')) $('#zTiltU').onclick = () => camCtl.tilt(TILT_STEP);
  if ($('#zTiltD')) $('#zTiltD').onclick = () => camCtl.tilt(-TILT_STEP);
  if ($('#zTiltU') && $('#zTiltD')) $('#zTiltU').ondblclick = $('#zTiltD').ondblclick = () => camCtl.resetTilt();
  if ($('#zIn')) $('#zIn').onclick = () => camCtl.zoom(1 / 1.2);
  if ($('#zOut')) $('#zOut').onclick = () => camCtl.zoom(1.2);
})();
function resize() {
  const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
// 點一下棋格：顯示地名、類型、價格與地主（棋格上不印平面文字，改用這個資訊卡）
(function tileTap() {
  const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
  let downAt = null;
  const tip = document.createElement('div');
  tip.id = 'tileTip'; tip.className = 'hidden'; document.querySelector('main').appendChild(tip);
  canvas.addEventListener('pointerdown', e => { downAt = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 450) { downAt = null; return; }
    downAt = null;
    const r = canvas.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = ray.intersectObjects(tileBases, false)[0];
    if (!hit) { tip.classList.add('hidden'); return; }
    const i = hit.object.userData.i, t = R.BOARD[i], st = G && G.tiles[i];
    const gc = t.group ? R.GROUPS[t.group].color : (TYPE_STYLE[t.type]?.[1] || '#94a3b8');
    const kind = t.group ? R.GROUPS[t.group].name : (TYPE_STYLE[t.type]?.[2] || '');
    let info = TYPE_STYLE[t.type]?.[3] || '';
    if (t.type === 'land' || t.type === 'station') {
      info = `地價 $${t.price}`;
      if (st && st.owner != null) info += `・地主 <b class="own" style="color:${G.players[st.owner].color}">${G.players[st.owner].name}</b>・${R.LEVEL_NAME[st.level || 0] || ''}・過路費 $${R.rentOf(G, i)}`;
      else info += '・無人擁有';
    }
    tip.innerHTML = `<b class="nm" style="border-color:${gc}">${t.name}</b><small>${kind}</small><div>${info}</div>`;
    tip.style.left = Math.min(r.width - 230, Math.max(8, e.clientX - r.left + 12)) + 'px';
    tip.style.top = Math.max(8, e.clientY - r.top - 70) + 'px';
    tip.classList.remove('hidden');
    clearTimeout(tip._t); tip._t = setTimeout(() => tip.classList.add('hidden'), 4200);
  });
})();
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

// ---------- 每幀動畫 ----------
let lastFx = '', lastCard = 0, lastMoveN = 0, lastNewsId = 0, lastBiteN = 0, lastHospitalN = 0, lastBankruptN = 0;
function syncMoveStart() {
  if (!G || !G.move || !G.move.path || !G.move.path.length) return;
  if (G.move.n !== lastMoveN) {
    lastMoveN = G.move.n;
    moveAt = performance.now();
  }
  const k = G.move.p;
  const pl = G.players[k];
  if (!pl) return;
  const tk = tokens[k] || (tokens[k] = makeToken(pl));
  if (tk.moveN !== G.move.n) {
    tk.moveN = G.move.n;
    tk.path = [...G.move.path];
    tk.t = 0;
    tk.from = tk.pos;
    tk.biteDoneN = 0;
  }
}

let biteAnim = null, biteBurst = null, biteBanner = null;
function ensureBiteFx() {
  if (!biteBurst) {
    biteBurst = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 3.3, 24), new THREE.MeshBasicMaterial({ color: '#ef4444', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    biteBurst.add(ring);
    const spikeMat = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.92 });
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 4), spikeMat);
      sp.position.set(Math.cos(a) * 3.1, 1.8, Math.sin(a) * 3.1);
      sp.rotation.z = Math.PI / 2;
      sp.rotation.y = -a;
      biteBurst.add(sp);
    }
    biteBurst.visible = false;
    scene.add(biteBurst);
  }
  if (!biteBanner) {
    biteBanner = document.createElement('div');
    biteBanner.className = 'bite-fx hidden';
    document.querySelector('main').appendChild(biteBanner);
  }
}
function clearBiteFx() {
  biteAnim = null;
  if (biteBurst) biteBurst.visible = false;
  if (biteBanner) biteBanner.classList.add('hidden');
}
function startDogBite(pId, atPos, npcId, now) {
  ensureBiteFx();
  const dur = 1150 / Math.sqrt(SPEED);
  biteAnim = { t0: now, dur, p: pId, at: atPos, npcId };
  const wp = tilePos(atPos);
  biteBurst.position.set(wp.x + 1.2, wp.y + 1.4, wp.z + 1.2);
  biteBurst.visible = true;
  const pl = G && G.players[pId];
  biteBanner.textContent = `🐕 汪！${pl ? pl.name : '玩家'} 被野狗咬傷 -$800 → 🏥 送醫！`;
  biteBanner.classList.remove('hidden');
  snd('dog');
}
function stepDogBite(now) {
  if (!biteAnim) return;
  const bp = (now - biteAnim.t0) / biteAnim.dur;
  if (bp >= 1) {
    const pId = biteAnim.p, at = biteAnim.at;
    const tk = tokens[pId];
    if (tk) tk.g.rotation.z = 0;
    clearBiteFx();
    // 咬傷特效結束後，若有醫院行程則派出救護車緊急送醫（涵蓋踩中與野狗巡邏撞上兩種情境）
    if (G && G.hospital && G.hospital.n !== lastHospitalN && G.hospital.p === pId) {
      const to = (tk && tk.path && tk.path.length > 0) ? tk.path[tk.path.length - 1] : G.hospital.to;
      if (tk && tk.path) tk.path.length = 0;
      lastHospitalN = G.hospital.n;
      startAmbulance(pId, at, to, now);
    }
    return;
  }
  if (biteBurst) {
    const s = 1.65 + Math.sin(bp * Math.PI * 3) * 0.55 + bp * 0.55;
    biteBurst.scale.setScalar(s);
    biteBurst.rotation.y = bp * Math.PI * 4;
  }
}

// ---------- 救護車送醫特效（3D 救護車＋紅藍閃燈＋雙音警笛）----------
let ambAnim = null, ambGroup = null, ambRed = null, ambBlue = null, ambBanner = null;
function ensureAmbFx() {
  if (!ambGroup) {
    ambGroup = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.15, metalness: 0.4 });
    const tire = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 4.2), white); box.position.set(0, 1.35, -0.35);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.45, 1.5), white); cab.position.set(0, 1.12, 2.2);
    const wind = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.75, 0.14), glass); wind.position.set(0, 1.4, 2.94);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.66, 0.35, 4.25), red); stripe.position.set(0, 0.95, -0.35);
    for (const sx of [-1.32, 1.32]) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.9), red); ch.position.set(sx, 1.65, -0.35);
      const cv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.25), red); cv.position.set(sx, 1.65, -0.35);
      ambGroup.add(ch, cv);
    }
    const rCh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.25), red); rCh.position.set(0, 2.33, -0.6);
    const rCv = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.9), red); rCv.position.set(0, 2.33, -0.6);
    ambRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.45), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1.5 }));
    ambRed.position.set(-0.48, 2.48, 1.75);
    ambBlue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.45), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1.5 }));
    ambBlue.position.set(0.48, 2.48, 1.75);
    ambGroup.add(box, cab, wind, stripe, rCh, rCv, ambRed, ambBlue);
    for (const [wx, wz] of [[-1.25, -1.5], [1.25, -1.5], [-1.2, 2.1], [1.2, 2.1]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.38, 10), tire);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.45, wz);
      ambGroup.add(w);
    }
    ambGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
    ambGroup.scale.setScalar(2.85);
    ambGroup.visible = false;
    scene.add(ambGroup);
  }
  if (!ambBanner) {
    ambBanner = document.createElement('div');
    ambBanner.className = 'amb-fx hidden';
    document.querySelector('main').appendChild(ambBanner);
  }
}
function clearAmbFx() {
  ambAnim = null;
  if (ambGroup) ambGroup.visible = false;
  if (ambBanner) ambBanner.classList.add('hidden');
}
function startAmbulance(pId, fromPos, toPos, now) {
  ensureAmbFx();
  const a = tilePos(fromPos), b = tilePos(toPos);
  const dist = a.distanceTo(b);
  const dur = Math.max(1500, Math.min(3400, dist * 13)) / Math.sqrt(SPEED);
  ambAnim = { t0: now, dur, p: pId, from: fromPos, to: toPos, a, b };
  ambGroup.position.copy(a);
  ambGroup.visible = true;
  const pl = G && G.players[pId];
  ambBanner.textContent = `🚑 救護車緊急出動！${pl ? pl.name : '玩家'} 送往醫院急救中…`;
  ambBanner.classList.remove('hidden');
  snd('siren');
}
function stepAmbulance(now) {
  if (!ambAnim) return;
  const f = (now - ambAnim.t0) / ambAnim.dur;
  if (f >= 1) {
    const tk = tokens[ambAnim.p];
    if (tk) { tk.pos = ambAnim.to; tk.from = ambAnim.to; tk.g.position.copy(tokenWorld(ambAnim.to, ambAnim.p)); }
    clearAmbFx();
    return;
  }
  const ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  ambGroup.position.lerpVectors(ambAnim.a, ambAnim.b, ease);
  ambGroup.position.y += 0.35 + Math.sin(f * Math.PI) * 5.2 + Math.abs(Math.sin(f * Math.PI * 10)) * 0.25;
  ambGroup.rotation.y = Math.atan2(ambAnim.b.x - ambAnim.a.x, ambAnim.b.z - ambAnim.a.z);
  const blink = Math.floor(now / 130) % 2 === 0;
  if (ambRed) ambRed.material.emissiveIntensity = blink ? 2.4 : 0.2;
  if (ambBlue) ambBlue.material.emissiveIntensity = blink ? 0.2 : 2.4;
}

// ---------- 破產特效（3D 棋子倒塌爆裂＋散落金幣碎片＋震撼橫幅）----------
let bankruptAnim = null, bankruptGroup = null, bankruptShards = [], bankruptRing = null, bankruptBanner = null;
function ensureBankruptFx() {
  if (!bankruptGroup) {
    bankruptGroup = new THREE.Group();
    bankruptRing = new THREE.Mesh(new THREE.RingGeometry(1.8, 3.6, 24), new THREE.MeshBasicMaterial({ color: '#dc2626', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    bankruptRing.rotation.x = -Math.PI / 2;
    bankruptGroup.add(bankruptRing);
    bankruptShards = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({ color: i % 2 ? '#facc15' : '#ef4444', emissive: i % 2 ? '#a16207' : '#991b1b' })
      );
      const ang = (i / 12) * Math.PI * 2;
      m.userData = { vx: Math.cos(ang) * (7 + (i % 3) * 2.5), vz: Math.sin(ang) * (7 + (i % 3) * 2.5), vy: 9 + (i % 4) * 2 };
      bankruptShards.push(m);
      bankruptGroup.add(m);
    }
    bankruptGroup.visible = false;
    scene.add(bankruptGroup);
  }
  if (!bankruptBanner) {
    bankruptBanner = document.createElement('div');
    bankruptBanner.className = 'bankrupt-fx hidden';
    document.querySelector('main').appendChild(bankruptBanner);
  }
}
function clearBankruptFx() {
  if (bankruptAnim) {
    const tk = tokens[bankruptAnim.p];
    if (tk) tk.g.rotation.set(0, 0, 0);
  }
  bankruptAnim = null;
  if (bankruptGroup) bankruptGroup.visible = false;
  if (bankruptBanner) bankruptBanner.classList.add('hidden');
}
function startBankruptFx(pId, atPos, now) {
  ensureBankruptFx();
  const dur = 1750 / Math.sqrt(SPEED);
  bankruptAnim = { t0: now, dur, p: pId, at: atPos };
  const wp = tilePos(atPos);
  bankruptGroup.position.set(wp.x, wp.y + 0.5, wp.z);
  bankruptGroup.visible = true;
  const pl = G && G.players[pId];
  bankruptBanner.textContent = `💥 破產出局！${pl ? pl.name : '玩家'} 資金耗盡宣告破產！`;
  bankruptBanner.classList.remove('hidden');
  snd('bankrupt');
}
function stepBankruptFx(now) {
  if (!bankruptAnim) return;
  const bp = (now - bankruptAnim.t0) / bankruptAnim.dur;
  if (bp >= 1) {
    clearBankruptFx();
    return;
  }
  if (bankruptRing) {
    bankruptRing.scale.setScalar(0.8 + bp * 3.2);
    bankruptRing.material.opacity = Math.max(0, 0.95 * (1 - bp));
  }
  for (const m of bankruptShards) {
    const u = m.userData;
    m.position.set(u.vx * bp, Math.max(0, u.vy * bp - 12 * bp * bp), u.vz * bp);
    m.rotation.set(bp * 8, bp * 10, 0);
    m.scale.setScalar(Math.max(0.01, 1 - bp * 0.7));
  }
}

let lastFrameAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(60, Math.max(0, now - (lastFrameAt || now))); lastFrameAt = now;
  if (waterTex) { waterTex.offset.x = (now * 0.000018) % 1; waterTex.offset.y = (now * 0.000012) % 1; }
  for (let k = 0; k < animProps.length; k++) animProps[k](now);
  if (G) {
    syncMoveStart();
    if (G.biteFx && G.biteFx.n !== lastBiteN) {
      const bf = G.biteFx;
      const btk = tokens[bf.p];
      const walkApproach = !!(G.move && G.move.bite && G.move.p === bf.p && btk && btk.moveN === G.move.n && btk.path.includes(bf.at));
      if (!walkApproach && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !tokens.some(t => t && t.path && t.path.length)) {
        lastBiteN = bf.n;
        startDogBite(bf.p, bf.at, bf.npcId, now);
      }
    }
    if (G.hospital && G.hospital.n !== lastHospitalN && !(G.biteFx && G.biteFx.n !== lastBiteN) && !diceAnim && !biteAnim && !ambAnim && !tokens.some(t => t && t.path && t.path.length)) {
      lastHospitalN = G.hospital.n;
      startAmbulance(G.hospital.p, G.hospital.from, G.hospital.to, now);
    }
    if (G.bankruptFx && G.bankruptFx.n !== lastBankruptN && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !tokens.some(t => t && t.path && t.path.length)) {
      lastBankruptN = G.bankruptFx.n;
      startBankruptFx(G.bankruptFx.p, G.bankruptFx.at, now);
    }
    if (!isMoving() || !buildKey) syncBuildings();
    for (const ah of activeHouses) {
      const anim = buildingRise.get(ah.tileIdx);
      if (anim) {
        const f = Math.min(1, (now - anim.t0) / 760);
        const ease = 1 - Math.pow(1 - f, 3) + Math.sin(f * Math.PI) * 0.14;
        const sy = ah.baseScale * (anim.fromScale + (1 - anim.fromScale) * Math.min(1.12, ease));
        ah.group.scale.y = sy;
        if (f >= 1) { ah.group.scale.y = ah.baseScale; buildingRise.delete(ah.tileIdx); }
      }
      if (ah.group.userData.beacon) {
        ah.group.userData.beacon.scale.setScalar(0.9 + Math.sin(now * 0.008) * 0.25);
      }
    }
    G.players.forEach((pl, k) => {
      const tk = tokens[k] || (tokens[k] = makeToken(pl));
      const inAmb = !!(ambAnim && ambAnim.p === k);
      const inBankrupt = !!(bankruptAnim && bankruptAnim.p === k);
      tk.g.visible = inBankrupt || (!pl.bankrupt && !inAmb);
      const activeScale = k === G.cur ? 2.75 : 1.36;
      if (inBankrupt) {
        const bp = Math.min(1, (now - bankruptAnim.t0) / bankruptAnim.dur);
        tk.g.position.copy(tokenWorld(bankruptAnim.at, k));
        tk.g.rotation.x = Math.min(Math.PI / 2, bp * Math.PI * 0.9);
        tk.g.rotation.y += 0.26;
        tk.g.scale.setScalar(Math.max(0.2, activeScale * (1 - bp * 0.8)));
      } else {
        tk.g.scale.setScalar(activeScale);
      }
      // 玩家附身神明光環特效（等待玩家棋子實際經過神明所在格後才點亮並跟隨）
      if (pl.god) {
        const gNpc = (G.npcs || []).find(n => n.attachedTo === k);
        const gNt = gNpc ? npcTokens.get(gNpc.id) : null;
        if (!gNt || gNt.attachedTo === k) {
          const gCol = R.GODS[pl.god.kind].color;
          tk.godVis.visible = true;
          tk.spirit.visible = false;
          tk.ring.material.color.set(gCol);
          tk.ring.material.emissive.set(gCol);
        } else {
          tk.godVis.visible = false;
        }
      } else {
        tk.godVis.visible = false;
      }

      const inBite = !!(biteAnim && biteAnim.p === k);
      const waitingBiteHold = !!(G.biteFx && G.biteFx.n !== lastBiteN && G.biteFx.p === k && !tk.path.length);
      const waitingAmbHold = !!(G.hospital && G.hospital.n !== lastHospitalN && G.hospital.p === k && !tk.path.length);
      if (inBankrupt) {
        // 破產倒塌動畫由上方控制
      } else if (inAmb) {
        tk.pos = ambAnim.from;
        tk.g.position.copy(ambGroup.position);
      } else if (inBite) {
        const bp = Math.min(1, (now - biteAnim.t0) / biteAnim.dur);
        tk.g.position.copy(tokenWorld(biteAnim.at, k));
        tk.g.position.y += Math.abs(Math.sin(bp * Math.PI * 4)) * 2.8;
        tk.g.rotation.z = Math.sin(bp * 36) * 0.28;
        tk.leftArm.rotation.x = -1.2; tk.rightArm.rotation.x = -1.2;
        tk.leftLeg.rotation.x = 0.25; tk.rightLeg.rotation.x = -0.25;
      } else if (waitingBiteHold || waitingAmbHold) {
        const holdAt = waitingBiteHold ? G.biteFx.at : G.hospital.from;
        tk.pos = holdAt;
        tk.g.position.copy(tokenWorld(holdAt, k));
        tk.leftArm.rotation.x = 0; tk.rightArm.rotation.x = 0;
        tk.leftLeg.rotation.x = 0; tk.rightLeg.rotation.x = 0;
      } else if (tk.path.length) {
        if (!diceAnim && !biteAnim) {
          const legDur = stepDurMs(tk.from, tk.path[0]);
          const hopH = isIslandLeg(tk.from, tk.path[0]) ? 8.5 : 4.6;
          tk.t += dt / legDur;
          const a = tokenWorld(tk.from, k), b = tokenWorld(tk.path[0], k), f = Math.min(1, tk.t);
          tk.g.position.lerpVectors(a, b, f);
          tk.g.position.y += Math.sin(f * Math.PI) * hopH;
          tk.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          const swing = Math.sin(f * Math.PI * 2) * 0.65;
          tk.leftArm.rotation.x = swing; tk.rightArm.rotation.x = -swing;
          tk.leftLeg.rotation.x = -swing * 0.8; tk.rightLeg.rotation.x = swing * 0.8;
          if (f >= 1) {
            tk.from = tk.path.shift(); tk.pos = tk.from; tk.t = 0; snd('step');
            if (G.move && G.move.bite && G.move.p === k && G.move.n === tk.moveN && tk.from === G.move.bite.at && tk.biteDoneN !== G.move.n) {
              tk.biteDoneN = G.move.n;
              if (G.biteFx && G.biteFx.p === k) lastBiteN = G.biteFx.n;
              startDogBite(k, G.move.bite.at, G.move.bite.npcId, now);
            }
          }
        } else {
          tk.g.position.copy(tokenWorld(tk.from, k));
          tk.leftArm.rotation.x = 0; tk.rightArm.rotation.x = 0;
          tk.leftLeg.rotation.x = 0; tk.rightLeg.rotation.x = 0;
        }
      } else {
        tk.pos = pl.pos;
        tk.g.position.copy(tokenWorld(pl.pos, k));
        tk.g.position.y += k === G.cur ? Math.abs(Math.sin(now / 280)) * 0.95 : 0;
        tk.leftArm.rotation.x = 0; tk.rightArm.rotation.x = 0;
        tk.leftLeg.rotation.x = 0; tk.rightLeg.rotation.x = 0;
      }
    });

    // 地圖神明與野狗棋子（各只有一隻：玩家棋子經過神明格後才觸發附身跟隨，離開後飛往地圖隨機位置停留）
    let movingDogPos = null;
    if (G.npcs) {
      for (const npc of G.npcs) {
        let nt = npcTokens.get(npc.id);
        if (!nt) { nt = makeNpcToken(npc); npcTokens.set(npc.id, nt); }
        const host = npc.attachedTo != null ? tokens[npc.attachedTo] : null;
        const waitingPass = npc.attachedTo != null && nt.attachedTo !== npc.attachedTo && host && host.path && host.path.includes(nt.pos);
        if (npc.attachedTo != null && !waitingPass) {
          const justAttached = nt.attachedTo !== npc.attachedTo;
          nt.attachedTo = npc.attachedTo;
          if (justAttached) renderPlayersAndTurn();
          const hostPl = G.players[npc.attachedTo];
          nt.g.visible = !!(host && hostPl && !hostPl.bankrupt);
          nt.moveN = npc.moveN || 0;
          nt.pos = npc.pos;
          nt.t = 1;
          if (nt.g.visible) {
            const hs = (host.g.scale.x || 1.36) / 1.46;
            nt.g.scale.setScalar(host.g.scale.x > 2 ? 1.18 : 0.95);
            const yaw = host.g.rotation.y;
            const target = new THREE.Vector3(
              host.g.position.x - Math.sin(yaw) * 2.4 * hs + Math.cos(yaw) * 2.3 * hs,
              host.g.position.y + 1.45 * hs + Math.sin(now * 0.005 + npc.id) * 0.42,
              host.g.position.z - Math.cos(yaw) * 2.4 * hs - Math.sin(yaw) * 2.3 * hs
            );
            if (nt.g.position.distanceToSquared(target) > 2500) nt.g.position.copy(target);
            else nt.g.position.lerp(target, 0.25);
            nt.g.rotation.y = yaw;
          }
          continue;
        }
        if (npc.attachedTo == null) nt.attachedTo = null;
        nt.g.visible = true;
        nt.g.scale.setScalar(1.25);
        const biteMoveTk = npc.kind === 'dog' && G.move && G.move.bite && G.move.bite.npcId === npc.id ? tokens[G.move.p] : null;
        const waitingBite = !!((biteMoveTk && biteMoveTk.moveN === G.move.n && (biteMoveTk.path.includes(G.move.bite.at) || (biteAnim && biteAnim.npcId === npc.id))) || (G.biteFx && G.biteFx.n !== lastBiteN && G.biteFx.npcId === npc.id));
        if (biteAnim && biteAnim.npcId === npc.id) {
          const bp = Math.min(1, (now - biteAnim.t0) / biteAnim.dur);
          const dPos = npcWorld(biteAnim.at), pPos = tokenWorld(biteAnim.at, biteAnim.p);
          const lunge = Math.sin(bp * Math.PI * 6) * 0.5 + 0.5;
          nt.g.position.lerpVectors(dPos, pPos, 0.45 + lunge * 0.45);
          nt.g.position.y += Math.abs(Math.sin(bp * Math.PI * 5)) * 1.9;
          nt.g.rotation.y = Math.atan2(pPos.x - dPos.x, pPos.z - dPos.z);
          nt.g.scale.setScalar(1.38 + lunge * 0.16);
          if (nt.g.userData.tail) nt.g.userData.tail.rotation.z = Math.sin(now * 0.04) * 0.7;
          continue;
        }
        if (!waitingPass && !waitingBite && npc.moveN !== nt.moveN) { nt.moveN = npc.moveN; nt.from = npc.from != null ? npc.from : nt.pos; nt.pos = npc.pos; nt.t = 0; }
        if (nt.t < 1) {
          if (!diceAnim && !biteAnim) {
            nt.t = Math.min(1, nt.t + dt / (stepDurMs(nt.from, nt.pos) * 1.6));
            const a = npcWorld(nt.from), b = npcWorld(nt.pos);
            nt.g.position.lerpVectors(a, b, nt.t);
            nt.g.position.y += Math.sin(nt.t * Math.PI) * (npc.kind === 'dog' ? 2.2 : 4.5);
            nt.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
            if (npc.kind === 'dog' && nt.t < 1 && !tokens.some(t => t && t.path && t.path.length)) movingDogPos = nt.g.position;
          } else {
            nt.g.position.copy(npcWorld(nt.from));
          }
        } else {
          nt.g.position.copy(npcWorld((waitingPass || waitingBite) ? nt.pos : npc.pos));
          nt.g.position.y += Math.sin(now * 0.004 + npc.id) * 0.35;
        }
        if (nt.g.userData.tail) nt.g.userData.tail.rotation.z = Math.sin(now * 0.015) * 0.45;
      }
    }

    const activeFxPos = (biteAnim && biteBurst && biteBurst.visible) ? biteBurst.position
      : (ambAnim && ambGroup && ambGroup.visible) ? ambGroup.position
      : (bankruptAnim && bankruptGroup && bankruptGroup.visible) ? bankruptGroup.position
      : movingDogPos;
    if (activeFxPos) {
      wasFollowingFx = true;
      if (camS.follow) camS.hasGoal = true;
      if (camS.hasGoal) camS.goal.copy(activeFxPos).setY(0);
    } else {
      if (wasFollowingFx) {
        wasFollowingFx = false;
        if (camS.follow) camS.hasGoal = true;
      }
      const ct = tokens[G.cur];
      if (ct) {
        if (G.turn !== lastFocusTurn) {
          lastFocusTurn = G.turn;
          if (camS.follow) camS.hasGoal = true;
        }
        if (ct.path.length && camS.follow) camS.hasGoal = true;
        if (camS.hasGoal) camS.goal.copy(ct.g.position).setY(0);
      }
    }
  } else if (camS.hasGoal) {
    camS.goal.set(-4, 0, 4);
  }
  stepDice(now);
  stepDogBite(now);
  stepAmbulance(now);
  stepBankruptFx(now);
  updateCamera();
  renderer.render(scene, camera);
}

// ============================================================ 介面與 Breaking News（移動後依序不重疊觸發）
const mine = pid => NET.role === 'local' ? G.players[pid].kind !== 'ai' : NET.myIds.has(pid);
const isMoving = () => {
  if (diceAnim || biteAnim || ambAnim || bankruptAnim) return true;
  if (tokens.some(t => t && t.path && t.path.length)) return true;
  if (G && G.move && G.move.path && G.move.path.length && (!tokens[G.move.p] || tokens[G.move.p].moveN !== G.move.n)) return true;
  if (G && G.biteFx && G.biteFx.n !== lastBiteN) return true;
  if (G && G.hospital && G.hospital.n !== lastHospitalN) return true;
  if (G && G.bankruptFx && G.bankruptFx.n !== lastBankruptN) return true;
  if (G && G.npcs && G.npcs.some(n => n.attachedTo == null && npcTokens.get(n.id) && npcTokens.get(n.id).moveN !== n.moveN)) return true;
  for (const nt of npcTokens.values()) if (nt && nt.g.visible && nt.t < 1) return true;
  return false;
};
const animBusy = () => isMoving();
function toast(s, ms = 1900) { const t = $('#toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }

let modalDoneCb = null, newsToastCb = null, cardPopCb = null;
const uiQueue = [];
let uiRunning = false, shownAsk = null, lastRankRound = 0, pendingRankModal = false, shownOver = false;

function openModal(html, ready) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); ready && ready($('#modalBox')); }
function closeModal() {
  $('#modal').classList.add('hidden');
  if (modalDoneCb) {
    const cb = modalDoneCb;
    modalDoneCb = null;
    cb();
  }
}
function dismissNewsToast() {
  const nt = $('#newsToast');
  clearTimeout(nt._t);
  nt.classList.add('hidden');
  if (newsToastCb) {
    const cb = newsToastCb;
    newsToastCb = null;
    cb();
  }
}
function dismissCardPop() {
  const el = $('#cardPop');
  clearTimeout(el._t);
  el.classList.add('hidden');
  if (cardPopCb) {
    const cb = cardPopCb;
    cardPopCb = null;
    cb();
  }
}
$('#newsToast').onclick = () => dismissNewsToast();
$('#cardPop').onclick = () => dismissCardPop();

function pumpUiQueue() {
  if (uiRunning || !uiQueue.length) return;
  if (isMoving()) {
    whenWalkDone(pumpUiQueue, Math.round(420 / Math.sqrt(SPEED)));
    return;
  }
  if (!$('#modal').classList.contains('hidden') || !$('#newsToast').classList.contains('hidden') || !$('#cardPop').classList.contains('hidden')) {
    const tid = setTimeout(pumpUiQueue, 120);
    walkTimers.push(tid);
    return;
  }
  uiRunning = true;
  const step = uiQueue.shift();
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    uiRunning = false;
    setTimeout(() => {
      pumpUiQueue();
      if (!uiRunning && !uiQueue.length) scheduleAuto();
    }, 40);
  };
  try {
    step(done);
  } catch (e) {
    console.error(e);
    done();
  }
}
function enqueueUi(stepFn) {
  uiQueue.push(stepFn);
  pumpUiQueue();
}
function resetUiQueue() {
  uiQueue.length = 0;
  uiRunning = false;
  modalDoneCb = null;
  newsToastCb = null;
  cardPopCb = null;
  shownOver = false;
  const nt = $('#newsToast');
  clearTimeout(nt._t); nt.classList.add('hidden');
  const el = $('#cardPop');
  clearTimeout(el._t); el.classList.add('hidden');
  clearBiteFx();
  clearAmbFx();
  clearBankruptFx();
  clearWalkTimers();
}

// 依據新聞類型繪製鮮明 SVG 主題插畫（不含重覆 ID）
function newsArtSVG(n) {
  const txt = `${n.cat || ''} ${n.title || ''} ${n.body || ''}`;
  if (/土地公|強佔|廟|福神|財神|神明降臨|神明附身|送神除厄|宮廟/.test(txt)) {
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

function showNewsToast(latest, done) {
  const nt = $('#newsToast');
  nt.style.setProperty('--nc', latest.color || '#d93829');
  nt.innerHTML = `<div class="nt-head"><span>🔴 BREAKING NEWS</span><span>第 ${latest.round} 輪・${latest.cat}</span><span class="nt-close">✕ 點擊關閉</span></div>
    <div class="nt-main">
      <div class="nt-art">${newsArtSVG(latest)}</div>
      <div class="nt-content">
        <div class="nt-title">${latest.title}</div>
        ${latest.body && latest.body !== latest.title ? `<div class="nt-body">${latest.body}</div>` : ''}
      </div>
    </div>`;
  nt.classList.remove('hidden');
  clearTimeout(nt._t);
  newsToastCb = done || null;
  nt._t = setTimeout(() => dismissNewsToast(), 3400);
  snd('news');
}

function renderNews() {
  const bar = $('#newsBar');
  const wasHidden = bar.classList.contains('hidden');
  if (!G || !G.news || !G.news.length) {
    bar.classList.add('hidden');
    if (!wasHidden) resize();
    return;
  }
  const latest = G.news[G.news.length - 1];
  const syncBar = () => {
    bar.classList.remove('hidden');
    if (wasHidden) resize();
    $('#newsTitle').textContent = `[${latest.cat}] ${latest.title}`;
    $('#newsTicker').textContent = G.news.slice(-5, -1).reverse().map(n => `• ${n.title}`).join('   ');
  };
  if (latest.id > lastNewsId) {
    const isInitial = lastNewsId === 0;
    lastNewsId = latest.id;
    whenWalkDone(() => {
      syncBar();
      bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash');
    });
    if (!isInitial) enqueueUi(done => showNewsToast(latest, done));
  } else if (!isMoving()) {
    syncBar();
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

function visibleGod(p) {
  if (!p || !p.god) return null;
  const gNpc = (G.npcs || []).find(n => n.attachedTo === p.id);
  const gNt = gNpc ? npcTokens.get(gNpc.id) : null;
  if (gNt && gNt.attachedTo !== p.id) return null;
  return p.god;
}
function renderPlayersAndTurn() {
  if (!G) return;
  $('#players').innerHTML = G.players.map((p, k) => {
    const vg = visibleGod(p);
    const god = vg ? R.GODS[vg.kind] : null;
    const godBadge = god ? `<span class="god-badge ${god.good ? 'good' : 'bad'}" title="${god.desc}">${god.icon}${god.name}(${vg.turns})</span>` : '';
    return `<div class="pcard ${k === G.cur && G.phase !== 'over' ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" style="--c:${p.color}">
      <div class="av">${p.name[0]}</div>
      <b>${p.name}${p.kind === 'ai' ? ' <small>電腦</small>' : mine(k) && NET.role !== 'local' ? ' <small>你</small>' : ''}${p.jail ? ' <small>🔒監獄</small>' : ''}${p.skip ? ' <small>🏥住院</small>' : ''}${godBadge}</b>
      <div><span class="cash">$${p.cash.toLocaleString()}</span> <small>🎲${p.dice || 1}・地 ${R.lands(G, p).length}・道具 ${p.items.length}</small></div>
    </div>`;
  }).join('');
  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over', pGod = visibleGod(p);
  $('#turnName').innerHTML = G.phase === 'over'
    ? `🏆 <b>${G.players[G.winner].name}</b> 獲勝`
    : `輪到 <b style="color:${p.color}">${p.name}</b>${pGod ? ` [${R.GODS[pGod.kind].icon}${R.GODS[pGod.kind].name}]` : ''}${my ? '（你）' : p.kind === 'ai' ? '（電腦思考中…）' : '（等待對方）'}`;
}

function renderUI() {
  if (!G) return;
  const rText = G.phase === 'over' ? '遊戲結束' : (G.maxRounds > 0 ? `第 ${G.round} / ${G.maxRounds} 輪 ✎` : `第 ${G.round} 輪（無限）✎`);
  $('#roundInfo').textContent = rText;

  renderPlayersAndTurn();

  syncDiceVisible();
  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  renderUIButtons();
  const syncLog = () => { if (G) $('#logBox').innerHTML = G.log.slice().reverse().map(s => `<div>${s}</div>`).join(''); };
  if (isMoving()) whenWalkDone(syncLog); else syncLog();
  renderNews();

  // 機會／命運卡片快閃（僅在非自己抽卡確認時排隊提示，避免與抽卡視窗重疊）
  if (G.card && G.card.n !== lastCard) {
    lastCard = G.card.n;
    if (!my || !G.ask) {
      const c = G.card;
      enqueueUi(done => showCard(c, done));
    }
  }
  // 購買／同位置蓋樓升級／抽卡／道具屋詢問（一律等移動與前序彈窗結束後再依序開啟）
  const askKey = G.ask ? `${G.turn}:${G.ask.k}:${G.ask.i}:${G.ask.bought ? G.ask.bought.length : 0}` : '';
  if (G.ask && my && shownAsk !== askKey) {
    shownAsk = askKey;
    const q = G.ask;
    if (q.k === 'shop' && q.bought && q.bought.length > 0) setTimeout(() => askPrompt(q), 0);
    else {
      enqueueUi(done => {
        if (!G || !G.ask || G.ask.k !== q.k || G.ask.i !== q.i) {
          done();
          return;
        }
        modalDoneCb = done;
        askPrompt(q);
      });
    }
  }
  if (G.fx && JSON.stringify(G.fx) + G.turn !== lastFx) {
    lastFx = JSON.stringify(G.fx) + G.turn;
    const fk = G.fx.k;
    whenWalkDone(() => snd({ rent: 'pay', buy: 'cash', build: 'build', jail: 'bad', demolish: 'bad', god_good: 'god', god_bad: 'badgod', seize: 'seize', casino_win: 'cash', casino_lose: 'bad' }[fk] || 'turn'));
  }
  if (G.phase !== 'over' && G.round >= 20 && G.round % 20 === 0 && G.round !== lastRankRound && !G.ask) {
    lastRankRound = G.round;
    const rankRound = G.round;
    enqueueUi(done => {
      if (!G || G.phase === 'over' || G.round !== rankRound || G.ask) {
        done();
        return;
      }
      modalDoneCb = done;
      openLeaderboardModal(rankRound, true);
    });
  }
  if (G.phase === 'over' && !shownOver) {
    shownOver = true;
    enqueueUi(done => {
      if (!G || G.phase !== 'over') { done(); return; }
      modalDoneCb = done;
      showResult();
    });
  }
}

let moveAt = 0, walkTimers = [];
const animDelay = () => Math.max(300, moveAt + (G.move ? G.move.path.length : 0) * (STEP_MS() + 10) + (750 + 1300) / SPEED - performance.now());
function clearWalkTimers() { for (const id of walkTimers) clearTimeout(id); walkTimers.length = 0; }
function whenWalkDone(cb, settleMs = 0) {
  const t0 = performance.now();
  if (!isMoving()) {
    if (settleMs > 0) { const tid = setTimeout(cb, settleMs); walkTimers.push(tid); }
    else cb();
    return;
  }
  const id = setTimeout(function check() {
    if (isMoving() && performance.now() - t0 < 28000) {
      const id2 = setTimeout(check, 80); walkTimers.push(id2); return;
    }
    if (settleMs > 0) { const tid = setTimeout(cb, settleMs); walkTimers.push(tid); }
    else cb();
  }, 80);
  walkTimers.push(id);
}

function showCard(c, done) {
  const el = $('#cardPop');
  el.style.setProperty('--c', c.kind === 'chance' ? '#e67e22' : '#4f7fe0');
  el.innerHTML = `<h3>${c.kind === 'chance' ? '機 會' : '命 運'}</h3><p>${c.text}</p>`;
  el.classList.remove('hidden'); snd('card');
  clearTimeout(el._t);
  cardPopCb = done || null;
  el._t = setTimeout(() => dismissCardPop(), 2400);
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
  if (q.k === 'casino') {
    const bets = q.bets || [500, 1500, 3000];
    openModal(`<h2>🎰 海峽郵輪賭場</h2>
      <div class="sub">前往金門途中的海上博弈殿堂！目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b><br>規則：擲 2 顆骰子，總和 <b>≥ 8 點</b> 贏 <b>1 倍</b>；擲出<b>雙骰豹子</b>贏 <b>2 倍</b>；≤ 7 點輸掉籌碼。</div>
      <div class="row" style="flex-wrap:wrap;gap:8px;justify-content:center">
        ${bets.map(b => `<button class="${b === 3000 ? 'sky' : 'primary'}" data-bet="${b}" ${p.cash < b ? 'disabled' : ''}>🎲 下注 $${b.toLocaleString()}</button>`).join('')}
        <button id="cNo">冷靜離開</button>
      </div>`, box => {
      box.querySelector('#cNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-bet]').forEach(btn => btn.onclick = () => {
        closeModal();
        send({ type: 'answer', yes: true, bet: Number(btn.dataset.bet) });
      });
    });
    return;
  }
  if (q.k === 'shop') {
    const giftName = q.freeItem ? `${R.ITEMS[q.freeItem].icon} ${R.ITEMS[q.freeItem].name}` : '（背包已滿）';
    const bagFull = p.items.length >= R.MAX_ITEMS;
    openModal(`<h2>🏪 台灣道具屋</h2>
      <div class="sub">免費贈禮：<b>${giftName}</b><br>目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>・背包：<b>${p.items.length}/${R.MAX_ITEMS}</b>・骰子：<b>${p.dice || 1} 顆</b></div>
      <div class="shop-grid">${Object.entries(R.ITEMS).map(([k, it]) => {
        const isDie = k === 'add_die';
        const hasTwo = isDie && (p.dice || 1) >= 2;
        const disabled = isDie ? (hasTwo || p.cash < it.price) : (bagFull || p.cash < it.price);
        return `<button data-buy="${k}" ${disabled ? 'disabled' : ''}>
          <b>${it.icon} ${it.name} <span class="price">$${it.price}</span></b>
          <small>${hasTwo ? '已擁有 2 顆骰子（上限）' : it.desc}</small>
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

  const buy = q.k === 'buy', curLv = s.level || 0, nextLv = buy ? 0 : curLv + 1;
  const godHint = p.god ? (p.god.kind === 'tudigong' && buy ? '（土地公半價優惠）' : p.god.kind === 'fushen' && buy ? '（福神 8 折優惠）' : p.god.kind === 'shuaishen' ? '（衰神 1.5 倍漲價）' : '') : '';
  if (buy) {
    const unitBuild = q.buildCost != null ? q.buildCost : R.buildCostOf(G, p, q.i);
    const withBuildCost = q.cost + unitBuild;
    const canBuildNow = p.cash >= withBuildCost;
    openModal(`<h2>🏡 要買下「${t.name}」嗎？</h2>
      <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
        <span>購地價格</span><b>$${q.cost.toLocaleString()} ${godHint}</b>
        <span>加蓋一樓</span><b>$${unitBuild.toLocaleString()}（合計 $${withBuildCost.toLocaleString()}）</b>
        <span>目前現金</span><b>$${p.cash.toLocaleString()}</b></div>
      <div class="sub">買下後，下次再回到同一位置即可一路蓋樓至【🏙️ 摩天大樓】！</div>
      <div class="row">
        <button id="aNo">不要</button>
        <button class="primary" id="aYes">買下空地 ($${q.cost.toLocaleString()})</button>
        ${canBuildNow ? `<button class="sky" id="aYesBuild">🏠 買地＋蓋一樓 ($${withBuildCost.toLocaleString()})</button>` : ''}
      </div>`, box => {
      box.querySelector('#aYes').onclick = () => { closeModal(); send({ type: 'answer', yes: true }); };
      if (box.querySelector('#aYesBuild')) {
        box.querySelector('#aYesBuild').onclick = () => { closeModal(); send({ type: 'answer', yes: true, buildFirst: true }); };
      }
      box.querySelector('#aNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
    });
    return;
  }

  const remain = R.MAX_LEVEL - curLv, skyCost = q.cost * remain, canSky = remain > 1 && p.cash >= skyCost;
  const curRent = R.rentAt(G, q.i, curLv), nextRent = R.rentAt(G, q.i, nextLv), skyRent = R.rentAt(G, q.i, R.MAX_LEVEL);
  const track = R.LEVEL_NAME.map((nm, idx) => {
    const cls = idx < curLv ? 'done' : idx === curLv ? 'cur' : idx === nextLv ? 'next' : '';
    return `<div class="lv-step ${cls}${idx === R.MAX_LEVEL ? ' sky' : ''}">${idx === R.MAX_LEVEL ? '🏙️ ' : ''}Lv.${idx}<br>${nm}</div>`;
  }).join('<span class="lv-arrow">→</span>');
  openModal(`<h2>🏗️ 回到自家「${t.name}」：蓋樓升級</h2>
    <div class="lv-track">${track}</div>
    <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
      <span>蓋樓費用</span><b>$${q.cost.toLocaleString()} / 階 ${godHint}</b>
      <span>建築升級</span><b>${R.LEVEL_NAME[curLv]} → ${R.LEVEL_NAME[nextLv]}</b>
      <span>過路費躍升</span><b>$${curRent.toLocaleString()} → <span style="color:#4ade80">$${nextRent.toLocaleString()}</span>${remain > 1 ? `（摩天大樓 $${skyRent.toLocaleString()}）` : ''}</b>
      <span>現金</span><b>$${p.cash.toLocaleString()} → $${(p.cash - q.cost).toLocaleString()}</b></div>
    <div class="row">
      <button id="aNo">暫不蓋樓</button>
      <button class="primary" id="aYes">🏗️ 蓋成【${R.LEVEL_NAME[nextLv]}】($${q.cost.toLocaleString()})</button>
      ${canSky ? `<button class="sky" id="aSky">🏙️ 直衝摩天大樓 ($${skyCost.toLocaleString()})</button>` : ''}
    </div>`, box => {
    box.querySelector('#aYes').onclick = () => { closeModal(); send({ type: 'answer', yes: true, levels: 1 }); };
    if (box.querySelector('#aSky')) {
      box.querySelector('#aSky').onclick = () => { closeModal(); send({ type: 'answer', yes: true, levels: remain }); };
    }
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
      else if (k === 'remote') {
        const minD = p.dice || 1, maxD = minD * 6;
        pickNumber(`🎯 遙控骰子：選擇點數（${minD}～${maxD}）`, minD, maxD, n => send({ type: 'item', item: k, n }));
      }
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
  <label class="field" style="margin:0 8px 0 0">🏃 移動速度 <select id="mSpeed">${SPEEDS.map(([k, n]) => `<option value="${k}" ${k === SPEED ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <button id="mRounds">⚙️ 調整回合</button><button id="mRename">✏️ 修改名字</button><button id="mHelp">玩法說明</button>
  <button id="mNew">重新開局</button><button id="mBack">回到大戰略</button></div><div class="row"><button class="close">關閉</button></div>`, box => {
  box.querySelector('.close').onclick = closeModal;
  box.querySelector('#mSpeed').onchange = e => { setSpeed(+e.target.value); toast('移動速度：' + SPEEDS.find(([k]) => k === SPEED)[1]); };
  box.querySelector('#mRounds').onclick = openRoundsModal;
  box.querySelector('#mRename').onclick = openRenameModal;
  box.querySelector('#mHelp').onclick = openHelp;
  box.querySelector('#mNew').onclick = () => { if (confirm('確定放棄目前的遊戲？')) { closeModal(); leaveNet(); openLobby(); } };
  box.querySelector('#mBack').onclick = () => { location.href = '../'; };
});

function openHelp() {
  openModal(`<h2>玩法說明</h2><div class="sub" style="font-size:14px;color:var(--text)">
  ・<b>64 格全台灣多模態環島地圖</b>：包含高鐵、台鐵、捷運、阿里山森林鐵路、蘇花山岳隧道、跨海渡輪（小琉球／澎湖／馬祖・海峽賭場／龜山島／綠島蘭嶼）與金門國內航線！<br>
  ・<b>1 顆骰子開局・道具屋升級雙骰</b>：開局使用 1 顆骰子（1～6 點），前往道具屋可購買「<b>🎲 加購骰子</b>」永久升級為雙骰（2～12 點）！<br>
  ・<b>買地蓋樓變摩天大樓</b>：買下土地或車站後，每次再走到同位置即可一階階蓋樓（<b>空地 → 一樓平房 → 二樓透天 → 高層大樓 → 摩天大樓</b>），也可以直接蓋成最高級摩天大樓收高額過路費！<br>
  ・<b>機會、命運與道具屋</b>：踩到機會／命運會跳出卡片視窗確認執行；踩到道具屋會送一張隨機卡片，並開啟商店讓你購買「加購骰子、請神卡、送神卡、遙控骰子、路障、免租卡、迴轉卡、拆除卡、徵收卡」。<br>
  ・<b>神明與地圖 NPC</b>：5 位神明（土地公、財神爺、福神、窮神、衰神）以棋子形式停留在地圖隨機位置，走到或路過神明棋子就會被附身，附身回合結束後神明會離開並飛往另一個隨機位置停留；野狗則會在路上遊蕩。也可使用請神卡獲得附身：<b>土地公附身時踩到別人的地可免費強佔</b>！送神卡則可把壞神明轉送給對手。<br>
  ・<b>Breaking News 快訊</b>：任何玩家的重大購地、強佔、使用道具與破產都會即時廣播給全場玩家。<br>
  ・<b>可調整回合</b>：開局與遊戲中點擊上方輪數皆可隨時修改回合上限（0 為無限）；每 20 回合會自動公布一次財富排行榜，亦可隨時點擊上方「🏆 排行」查看。<br>
  ・<b>3D 鏡頭與地名標籤（與大戰略完全一致）</b>：單指／滑鼠左鍵拖曳平移棋盤；滑鼠右鍵或 <b>Shift＋左鍵</b>拖曳可旋轉與上下傾斜視角；雙指手勢自動鎖定縮放或雙指同向滑動旋轉／傾斜；右下角控制列「<b>名</b>」與快捷鍵 <b>N</b> 可開關地名標籤，<b>Q / E / R / F</b> 控制旋轉與俯仰，<b>🎯</b> 切換鏡頭跟隨。</div>
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
  if (a && a.type === 'roll' && G.dice) rollDice(G.dice.a, G.dice.b, G.dice.count);
  syncMoveStart();
  broadcast(); renderUI(); scheduleAuto();
}

let autoTimer = null;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!G || G.phase === 'over' || NET.role === 'client') return;
  if (isMoving() || uiRunning || uiQueue.length > 0 || pendingRankModal || !$('#modal').classList.contains('hidden') || !$('#newsToast').classList.contains('hidden') || !$('#cardPop').classList.contains('hidden')) {
    autoTimer = setTimeout(scheduleAuto, 220);
    return;
  }
  const p = R.cur(G);
  const wait = (G.phase === 'roll' ? 560 : 380) / SPEED;
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
  $('#btnRoll').textContent = (p.dice || 1) >= 2 ? '🎲🎲 擲雙骰' : '🎲 擲骰子';
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
  buildKey = ''; prevTileLevels = []; activeHouses = []; buildingRise.clear(); resetUiQueue();
  lastCard = 0; lastMoveN = 0; lastNewsId = 0; lastBiteN = 0; lastHospitalN = 0; lastBankruptN = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
  resetCamGoal(); syncDiceVisible(1);
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
  openModal(`<h2>環島富豪 3D <span style="font-size:.65em;opacity:.75">v154</span></h2><div class="sub">原創 3D 台灣地產桌遊：64 格全台灣與離島地圖（去金門途中有海峽賭場）、神明附身、請神送神卡、道具屋與 Breaking News 實況廣播！</div>
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
              buildKey = ''; prevTileLevels = []; activeHouses = []; buildingRise.clear(); resetUiQueue();
              lastCard = 0; lastMoveN = 0; lastNewsId = 0; lastBiteN = 0; lastHospitalN = 0; lastBankruptN = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
              resetCamGoal(); syncDiceVisible();
            }
            if (G.dice && G.dice.n !== prevDice) rollDice(G.dice.a, G.dice.b, G.dice.count);
            syncMoveStart();
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
window.__rich = { get G() { return G; }, send, NET, camS, camCtl, renderUI, openLeaderboardModal, labelGroup, SEG_MODE, tileProps, dice, tokens, npcTokens, isMoving, isBiting: () => !!biteAnim, isAmbulance: () => !!ambAnim, isBankruptFx: () => !!bankruptAnim, uiQueue, showNewsToast, dismissNewsToast };
