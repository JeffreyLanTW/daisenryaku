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
    else if (kind === 'hsr') { tone(587, 0.12, 0, 'sine', 0.12); tone(880, 0.14, 0.11, 'sine', 0.12); tone(1175, 0.25, 0.22, 'triangle', 0.14); }
    else if (kind === 'car') { tone(125, 0.1, 0, 'sawtooth', 0.08); tone(165, 0.14, 0.06, 'triangle', 0.09); tone(520, 0.08, 0.02, 'sine', 0.06); }
    else if (kind === 'heli') { for (let k = 0; k < 8; k++) tone(110 + (k % 2) * 18, 0.08, k * 0.14, 'sawtooth', 0.07); }
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
const STEP_MS = () => Math.round(430 / Math.pow(SPEED, 0.7));
const isAllAi = () => Boolean(G && G.players.every(p => p.bankrupt || p.kind === 'ai'));
// WS：世界尺度倍率（地圖放大 2.7 倍，容納 125 格與 4 倍佔地造景）
const WS = 2.7;
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

const camera = new THREE.PerspectiveCamera(42, 1, 8, 2800 * WS);
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

// 真實離島與海峽對岸多邊形（放大澎湖、金門不規則小地圖區域，容納 12-14 格島內路線）
const OFFSHORE_POLYS = [
  // 澎湖群島主島（放大不規則輪廓：馬公、白沙、西嶼、吉貝）
  { poly: [[119.40, 23.48], [119.56, 23.45], [119.68, 23.51], [119.70, 23.66], [119.61, 23.78], [119.50, 23.74], [119.40, 23.64]], elev: 0.85, col: '#4a9352' },
  // 澎湖望安與七美放大島嶼
  { poly: [[119.44, 23.31], [119.55, 23.31], [119.57, 23.41], [119.45, 23.40]], elev: 0.72, col: '#468c4e' },
  { poly: [[119.38, 23.15], [119.48, 23.15], [119.49, 23.24], [119.38, 23.23]], elev: 0.70, col: '#468c4e' },
  // 大金門（放大雙瓣輪廓）與小金門（烈嶼＋大膽）
  { poly: [[118.26, 24.38], [118.37, 24.37], [118.45, 24.38], [118.54, 24.42], [118.54, 24.54], [118.44, 24.57], [118.35, 24.56], [118.27, 24.52], [118.25, 24.44]], elev: 0.92, col: '#4f9152' },
  { poly: [[118.14, 24.35], [118.25, 24.36], [118.26, 24.47], [118.15, 24.45]], elev: 0.76, col: '#4f9152' },
  // 馬祖列島（南竿＋北竿＋東引）
  { poly: [[119.89, 26.13], [119.97, 26.13], [119.97, 26.18], [119.89, 26.17]], elev: 0.75, col: '#418952', lh: true },
  { poly: [[119.96, 26.20], [120.03, 26.21], [120.03, 26.25], [119.96, 26.24]], elev: 0.70, col: '#418952' },
  // 小琉球、龜山島、綠島、蘭嶼、與那國島
  { poly: [[120.34, 22.31], [120.40, 22.31], [120.40, 22.37], [120.34, 22.36]], elev: 0.68, col: '#4b9b59' },
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

// 125 格真實世界台灣經緯度座標 [lon, lat, 地形高程]（嚴格對應 logic.js：0..87 環島主線、88..99 澎湖不規則小地圖、100..113 金門不規則小地圖、114..124 北中南橫）
const ROUTE_COORDS = [
  // 0..17 南台灣・墾丁恆春高屏小琉球嘉南
  [120.82, 21.91, 1.55], // 0 起點
  [120.76, 21.96, 1.50], // 1 墾丁
  [120.74, 22.01, 1.68], // 2 恆春
  [120.71, 22.07, 1.62], // 3 墾丁大街美食
  [120.67, 22.22, 1.60], // 4 命運
  [120.47, 22.47, 1.52], // 5 東港海鮮市集
  [120.49, 22.64, 1.62], // 6 屏東（南橫起點）
  [120.37, 22.34, 1.50], // 7 小琉球
  [120.25, 22.55, 1.55], // 8 高雄港灣
  [120.31, 22.66, 1.64], // 9 高雄巨蛋百貨
  [120.33, 22.75, 1.72], // 10 高鐵左營
  [120.29, 22.84, 1.65], // 11 橋頭糖廠遊樂場
  [120.22, 22.96, 1.65], // 12 台南府城
  [120.19, 23.02, 1.58], // 13 台南夜市美食
  [120.14, 23.00, 1.50], // 14 安平古堡
  [120.12, 23.13, 1.55], // 15 機會
  [120.28, 23.31, 2.20], // 16 造型服飾店
  [120.45, 23.48, 1.85], // 17 嘉義
  // 18..34 阿里山・雲林北港・鹿港彰化南投日月潭・大台中
  [120.58, 23.43, 2.25], // 18 監獄
  [120.81, 23.51, 5.20], // 19 阿里山
  [120.53, 23.70, 1.70], // 20 雲林斗六
  [120.58, 23.62, 1.95], // 21 劍湖山遊樂場
  [120.30, 23.57, 1.55], // 22 北港廟宇（澎湖小地圖入口）
  [120.43, 24.05, 1.50], // 23 鹿港老街
  [120.55, 23.99, 1.80], // 24 彰化
  [120.85, 23.84, 3.60], // 25 日月潭連鎖飯店
  [120.69, 23.90, 2.20], // 26 南投
  [120.92, 23.86, 4.00], // 27 日月潭
  [120.96, 23.97, 3.20], // 28 醫院
  [120.59, 24.09, 1.65], // 29 台中高鐵
  [120.65, 24.16, 1.72], // 30 台中七期百貨
  [120.71, 24.23, 1.78], // 31 台中（中橫起點）
  [120.69, 24.32, 1.65], // 32 麗寶遊樂場
  [120.59, 24.34, 1.55], // 33 台灣股市
  [120.64, 24.40, 1.60], // 34 機會
  // 35..57 苗竹桃・馬祖東引海峽賭場・大台北基隆港
  [120.77, 24.41, 2.25], // 35 三義木雕村
  [120.86, 24.43, 2.35], // 36 苗栗大湖
  [121.02, 24.76, 2.05], // 37 竹科園區
  [120.96, 24.81, 1.65], // 38 新竹城隍美食
  [121.05, 24.85, 1.95], // 39 卡片商店
  [121.13, 24.90, 2.20], // 40 命運
  [121.30, 24.98, 1.85], // 41 桃園（北橫起點）
  [119.93, 26.15, 1.52], // 42 馬祖
  [120.49, 26.37, 1.50], // 43 東引（金門小地圖入口）
  [119.12, 25.15, 1.48], // 44 海峽賭場
  [121.22, 25.07, 1.50], // 45 桃園機場
  [121.32, 25.13, 1.85], // 46 汽車展示中心
  [121.44, 25.19, 1.50], // 47 淡水老街
  [121.55, 25.25, 3.40], // 48 陽明山公園
  [121.51, 25.15, 1.70], // 49 行天宮
  [121.41, 25.09, 1.60], // 50 西門服飾店
  [121.39, 24.98, 1.60], // 51 新北板橋
  [121.48, 25.03, 1.65], // 52 台北西門町
  [121.55, 25.07, 1.68], // 53 台北
  [121.61, 25.00, 1.72], // 54 信義101百貨
  [121.67, 25.06, 1.78], // 55 夜市小遊戲
  [121.73, 25.09, 1.85], // 56 機會
  [121.76, 25.14, 1.50], // 57 基隆港
  // 58..87 東北角・宜花東・綠島蘭嶼南迴
  [121.91, 25.11, 1.80], // 58 入獄
  [121.85, 25.02, 3.60], // 59 九份山城
  [121.74, 24.97, 2.30], // 60 平溪天燈
  [121.80, 24.91, 1.65], // 61 國稅局
  [121.95, 24.84, 1.65], // 62 龜山島
  [121.83, 24.86, 1.55], // 63 頭城烏石港
  [121.76, 24.75, 1.55], // 64 宜蘭
  [121.77, 24.67, 1.55], // 65 羅東夜市
  [121.77, 24.81, 1.65], // 66 礁溪連鎖飯店
  [121.82, 24.52, 3.00], // 67 命運
  [121.76, 24.36, 2.70], // 68 迎神殿
  [121.61, 24.16, 3.80], // 69 太魯閣
  [121.60, 24.02, 1.55], // 70 花蓮
  [121.59, 23.95, 1.55], // 71 花蓮東大門美食
  [121.48, 23.77, 2.20], // 72 卡片商店
  [121.57, 23.89, 1.60], // 73 海洋遊樂場
  [121.32, 23.34, 2.15], // 74 玉里
  [121.24, 23.14, 2.20], // 75 池上米鄉
  [121.19, 22.97, 1.85], // 76 機會
  [121.17, 22.86, 1.65], // 77 台灣股市
  [121.14, 22.76, 1.55], // 78 台東
  [121.02, 22.69, 1.95], // 79 知本溫泉飯店
  [121.50, 22.66, 1.55], // 80 綠島
  [121.55, 22.05, 1.65], // 81 蘭嶼
  [120.99, 22.60, 1.85], // 82 太麻里
  [120.93, 22.42, 2.10], // 83 汽車展示中心
  [120.90, 22.26, 2.25], // 84 夜市小遊戲
  [120.88, 22.14, 2.40], // 85 命運
  [120.87, 22.00, 1.75], // 86 佳樂水
  [120.89, 21.88, 1.55], // 87 鵝鑾鼻燈塔
  // 88..99 澎湖群島不規則小地圖（12 格）
  [119.57, 23.56, 1.50], // 88 馬公港
  [119.52, 23.59, 1.52], // 89 澎湖天后宮
  [119.62, 23.57, 1.52], // 90 中央老街美食
  [119.65, 23.63, 1.52], // 91 澎湖服飾店
  [119.56, 23.67, 1.50], // 92 跨海大橋
  [119.44, 23.61, 1.52], // 93 西嶼燈塔
  [119.59, 23.75, 1.48], // 94 吉貝沙尾
  [119.47, 23.50, 1.50], // 95 澎湖卡片屋
  [119.61, 23.50, 1.50], // 96 山水遊樂場
  [119.49, 23.35, 1.48], // 97 望安綠蠵龜
  [119.42, 23.19, 1.48], // 98 七美雙心
  [119.57, 23.43, 1.48], // 99 澎湖免稅百貨
  // 100..113 金門群島不規則小地圖（14 格）
  [118.29, 24.41, 1.52], // 100 水頭碼頭
  [118.32, 24.44, 1.55], // 101 莒光樓
  [118.31, 24.47, 1.55], // 102 金城模範美食
  [118.36, 24.49, 1.55], // 103 金門卡片屋
  [118.23, 24.43, 1.50], // 104 烈嶼小金門
  [118.16, 24.38, 1.48], // 105 大膽島前線
  [118.31, 24.53, 1.55], // 106 古寧頭戰史館
  [118.36, 24.54, 1.54], // 107 慈湖小遊戲
  [118.49, 24.51, 1.56], // 108 山后民俗村
  [118.42, 24.46, 1.65], // 109 太武山
  [118.45, 24.51, 1.56], // 110 金沙股市廣場
  [118.49, 24.44, 1.55], // 111 金門遊樂場
  [118.41, 24.42, 1.55], // 112 昇恆昌百貨
  [118.46, 24.40, 1.52], // 113 料羅灣碼頭
  // 114..116 北橫公路支線
  [121.29, 24.86, 2.10], // 114 大溪老街
  [121.43, 24.71, 4.10], // 115 拉拉山
  [121.53, 24.65, 3.80], // 116 明池
  // 117..120 中橫公路支線
  [121.01, 24.20, 3.30], // 117 谷關溫泉
  [121.24, 24.25, 4.60], // 118 梨山
  [121.28, 24.14, 5.60], // 119 合歡山
  [121.48, 24.18, 3.90], // 120 天祥
  // 121..124 南橫公路支線
  [120.59, 23.08, 2.30], // 121 甲仙芋頭街
  [120.77, 23.22, 3.60], // 122 梅山
  [120.96, 23.26, 5.10], // 123 埡口
  [121.05, 23.20, 4.20], // 124 向陽
];
// 主線各段交通路網（0..87）
const SEG_MODE = [
  'highway', 'highway', 'highway', 'highway', 'highway', 'highway', 'ferry', 'ferry',
  'mrt', 'hsr', 'rail', 'highway', 'highway', 'highway', 'highway', 'highway', 'rail', 'forest_rail',
  'forest_rail', 'cliff_road', 'highway', 'highway', 'highway', 'highway', 'cliff_road', 'cliff_road', 'cliff_road', 'highway',
  'hsr', 'mrt', 'mrt', 'highway', 'highway', 'highway', 'rail', 'rail', 'highway', 'rail',
  'rail', 'hsr', 'hsr', 'air', 'ferry', 'ferry', 'air', 'highway', 'mrt', 'cliff_road',
  'highway', 'mrt', 'mrt', 'mrt', 'mrt', 'mrt', 'rail', 'rail', 'rail', 'highway',
  'cliff_road', 'rail', 'rail', 'ferry', 'ferry', 'rail', 'rail', 'rail', 'cliff_road', 'cliff_road',
  'cliff_road', 'rail', 'rail', 'rail', 'rail', 'rail', 'rail', 'rail', 'highway', 'highway',
  'ferry', 'ferry', 'ferry', 'cliff_road', 'highway', 'highway', 'cliff_road', 'highway', 'highway', 'highway',
];
function edgeMode(i, j) {
  if (j === (i + 1) % 88 && i < 88) return SEG_MODE[i];
  if ((i === 22 && j === 88) || (i === 99 && j === 23) || (i === 43 && j === 100) || (i === 113 && j === 44)) return 'ferry';
  if (i >= 88 && i <= 113) return (i === 91 || i === 93 || i === 96 || i === 97 || i === 98 || i === 103 || i === 104 || i === 105) ? 'ferry' : 'highway';
  return 'cliff_road';
}
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
const TILE_R = 11.2;
const TILE_XZ = ROUTE_COORDS.map(([lon, lat]) => twXZ(lon, lat));
const COAST_TILES = new Set(['墾丁', '安平古堡', '馬公港', '淡水老街', '基隆港', '綠島', '蘭嶼', '水頭碼頭', '料羅灣碼頭', '鹿港老街', '小琉球', '七美雙心', '望安綠蠵龜', '吉貝沙尾', '西嶼燈塔', '馬祖', '東引', '烈嶼小金門', '大膽島前線', '海峽賭場', '龜山島', '頭城烏石港', '佳樂水', '鵝鑾鼻燈塔']);
const URBAN_TILES = new Set(['台北', '台北西門町', '信義101百貨', '高雄港灣', '高雄巨蛋百貨', '台中', '台中七期百貨', '新北板橋', '台南府城', '竹科園區', '桃園', '新竹城隍美食', '桃園機場', '屏東', '彰化', '嘉義', '宜蘭', '花蓮', '台東']);
function tileScale(t, i) {
  if (!t) return 1;
  const nm = t.name;
  if (['信義101百貨', '台北', '台北西門町', '高雄港灣', '台中', '新北板橋'].includes(nm)) return 1.65;
  if (['桃園機場', '高鐵左營', '台中高鐵', '基隆港', '海峽賭場', '起點', '醫院', '監獄'].includes(nm) || t.type === 'autoshow' || t.type === 'stock') return 1.32;
  if (['阿里山', '太魯閣', '合歡山', '日月潭', '台南府城', '竹科園區', '桃園', '花蓮', '台東', '宜蘭'].includes(nm) || t.subkind === 'mall' || t.subkind === 'hotel' || t.subkind === 'arcade') return 1.18;
  if (['小琉球', '七美雙心', '望安綠蠵龜', '吉貝沙尾', '東引', '烈嶼小金門', '大膽島前線', '龜山島', '拉拉山', '明池', '谷關溫泉', '梨山', '天祥', '甲仙芋頭街', '梅山', '埡口', '向陽'].includes(nm)) return 0.72;
  if (t.type === 'chance' || t.type === 'fate' || t.type === 'tax') return 0.85;
  return 1.0;
}
function tileBaseScale(t, i) {
  const raw = tileScale(t, i);
  const p = TILE_XZ[i];
  if (!p) return raw;
  let minD = Infinity;
  for (let j = 0; j < TILE_XZ.length; j++) {
    if (j === i) continue;
    const d = Math.hypot(p[0] - TILE_XZ[j][0], p[1] - TILE_XZ[j][1]);
    if (d < minD) minD = d;
  }
  const cap = (minD * 0.54) / (TILE_R * 1.02);
  return Math.max(0.74, Math.min(raw, cap));
}
const TILE_MAIN = TILE_XZ.map(([x, z]) => onMainland(x, z));
const TILE_ELEV = ROUTE_COORDS.map(([lon, lat, elev], i) => {
  const jitter = (i % 7) * 0.05;
  if (!TILE_MAIN[i] || (R.BOARD[i] && URBAN_TILES.has(R.BOARD[i].name)) || elev <= 2.2) return elev + jitter;
  const [x, z] = TILE_XZ[i];
  const r = rawHeight(x, z);
  return Math.max(1.6, r > 3 ? 3 + (r - 3) * 0.72 : r) + 0.25 + jitter;
});
for (let i = 0; i < R.BOARD.length; i++) {
  const baseElev = TILE_ELEV[i];
  const [ax, az] = TILE_XZ[i];
  const bi = tileBaseScale(R.BOARD[i], i);
  for (let k = 0; k < 16; k++) {
    const cand = baseElev + k * 0.60;
    let ok = true;
    for (let j = 0; j < i; j++) {
      if (Math.hypot(ax - TILE_XZ[j][0], az - TILE_XZ[j][1]) < TILE_R * 1.12 * (bi + tileBaseScale(R.BOARD[j], j)) && Math.abs(cand - TILE_ELEV[j]) < 0.58) {
        ok = false;
        break;
      }
    }
    if (ok) { TILE_ELEV[i] = cand; break; }
  }
}
const ROAD_SEGS = [];
for (let i = 0; i < R.BOARD.length; i++) {
  for (const j of (R.BOARD[i].next || [])) {
    const mode = edgeMode(i, j);
    if (mode === 'ferry' || mode === 'air' || !TILE_MAIN[i] || !TILE_MAIN[j]) continue;
    const [ax, az] = twXZ(ROUTE_COORDS[i][0], ROUTE_COORDS[i][1]), [bx, bz] = twXZ(ROUTE_COORDS[j][0], ROUTE_COORDS[j][1]);
    ROAD_SEGS.push({ ax, az, bx, bz, ha: TILE_ELEV[i], hb: TILE_ELEV[j] });
  }
}
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
  const b = R.BOARD[i];
  const pi = (b && b.prev && b.prev.length) ? b.prev[0] : (i + TILE_PTS.length - 1) % TILE_PTS.length;
  const ni = (b && b.next && b.next.length) ? b.next[0] : (i + 1) % TILE_PTS.length;
  const a = TILE_PTS[pi], c = TILE_PTS[ni];
  return Math.atan2(c.x - a.x, c.z - a.z);
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
    if (segNm === '北港廟宇' || segNm === '知本' || segNm === '馬祖' || segNm === '七美' || segNm === '東引') {
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
  // 西部走廊連續高鐵脊線：高鐵左營(10) → 嘉義(17) → 台中高鐵(29) → 竹科園區(37) → 桃園(41) → 板橋(51) → 台北(53)
  const g = new THREE.Group();
  const hsrIndices = [10, 17, 29, 37, 41, 51, 53];
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

  // 78 格多路線海陸空交通路網（含北橫／中橫／南橫與海路支線）＋西部高鐵脊線動畫列車
  for (let i = 0; i < R.BOARD.length; i++) {
    for (const j of R.BOARD[i].next) {
      tw.add(makeTransportSegment(i, TILE_PTS[i], TILE_PTS[j], edgeMode(i, j)));
    }
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

function makeNeonSign(text, bgCol = '#0f172a', neonCol = '#f43f5e') {
  const g = new THREE.Group();
  const tex = canvasTex(256, 96, (c, w, h) => {
    c.fillStyle = bgCol;
    c.fillRect(0, 0, w, h);
    c.lineWidth = 8;
    c.strokeStyle = neonCol;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#ffffff';
    c.shadowColor = neonCol;
    c.shadowBlur = 16;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${text.length > 4 ? 36 : 44}px "PingFang TC","Noto Sans TC",sans-serif`;
    c.fillText(text, w / 2, h / 2 + 2);
  });
  const poleM = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7 });
  for (const px of [-1.25, 1.25]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8), poleM);
    pole.position.set(px, 1.8, 0);
    g.add(pole);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.25, 0.22),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.95, roughness: 0.25 })
  );
  board.position.y = 3.2;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.38, 1.4, 0.14), new THREE.MeshStandardMaterial({ color: neonCol, emissive: neonCol, emissiveIntensity: 0.85 }));
  trim.position.set(0, 3.2, -0.05);
  g.add(trim, board);
  return g;
}

function makeTileProp(t, idx) {
  const g = new THREE.Group();
  const nm = t.name;

  if (nm === '信義101百貨' || nm === '信義區') {
    // 台北 101 精細建模（如意裙樓＋8節竹節塔身＋金融副樓＋尖塔＋閃燈，最高 y ~ 15.8）
    const glass = makeWinMat('#247b6c', '#fef08a');
    const gold = new THREE.MeshStandardMaterial({ color: '#f1c40f', emissive: '#6e5200', metalness: 0.65 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.1, 3.2), glass);
    base.position.y = 1.05; g.add(base);
    const skylight = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 4), new THREE.MeshStandardMaterial({ color: '#bae6fd', emissive: '#0284c7', emissiveIntensity: 0.35 }));
    skylight.rotation.y = Math.PI / 4; skylight.position.set(0, 2.35, 1.0); g.add(skylight);
    for (const [rx, rz, ry] of [[0, 1.65, 0], [0, -1.65, 0], [1.65, 0, Math.PI / 2], [-1.65, 0, Math.PI / 2]]) {
      const ruyi = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 6, 12), gold);
      ruyi.position.set(rx, 1.45, rz); ruyi.rotation.y = ry; g.add(ruyi);
    }
    const annex = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.8, 1.3), makeWinMat('#1e293b', '#bae6fd'));
    annex.position.set(-1.55, 2.4, -1.05); g.add(annex);
    for (let k = 0; k < 8; k++) {
      const s = 1 - k * 0.048;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.22 * s, 0.96 * s, 1.2, 4), glass);
      seg.rotation.y = Math.PI / 4; seg.position.y = 2.65 + k * 1.18; g.add(seg);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.78 * s, 0.16, 1.78 * s), gold);
      ring.position.y = 3.22 + k * 1.18; g.add(ring);
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.24, 3.2, 6), gold);
    spire.position.y = 13.8; g.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: '#ff5252', emissive: '#ff1744', emissiveIntensity: 0.95 }));
    beacon.position.y = 15.55; g.add(beacon);
    animProps.push(now => { beacon.scale.setScalar(0.85 + Math.sin(now * 0.006) * 0.3); });
    g.userData.baseScale = 1.05;
  } else if (nm === '高雄' || nm === '高雄港灣') {
    // 高雄 85 大樓（最高 y = 11.2）＋流行音樂中心珊瑚六角塔＋港灣天車
    const bm = makeWinMat('#335c81', '#bae6fd');
    for (const dx of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 5.2, 1.35), bm);
      leg.position.set(dx, 2.6, -0.3); g.add(leg);
    }
    const mid = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.8, 1.35), bm); mid.position.set(0, 7.0, -0.3);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.3, 4), new THREE.MeshStandardMaterial({ color: '#f39c12', emissive: '#92400e', metalness: 0.55 }));
    top.rotation.y = Math.PI / 4; top.position.set(0, 10.05, -0.3);
    const coralM = new THREE.MeshStandardMaterial({ color: '#fb7185', emissive: '#881337', emissiveIntensity: 0.25 });
    for (const [cx, ch] of [[-1.35, 1.9], [-0.45, 2.4]]) {
      const waveT = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, ch, 6), coralM);
      waveT.position.set(cx, ch / 2, 1.2); g.add(waveT);
    }
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.8, 0.28), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
    gantry.position.set(1.5, 1.4, 1.1);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: '#f97316' }));
    boom.position.set(1.15, 2.65, 1.1);
    g.add(mid, top, gantry, boom);
    g.userData.baseScale = 1.02;
  } else if (nm === '台北') {
    // 3層中正紀念堂（y ~ 5.8）＋前方自由廣場五門牌樓＋後方新光摩天大樓（h = 7.2）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 2.8), new THREE.MeshStandardMaterial({ color: '#f1f5f9' }));
    base.position.set(-0.2, 0.45, 0);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.0, 2.0), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    hall.position.set(-0.2, 1.9, 0);
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(2.15, 1.25, 8), new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4 }));
    r1.position.set(-0.2, 3.52, 0);
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.38, 1.15, 8), new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.4 }));
    r2.position.set(-0.2, 4.65, 0);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 }));
    finial.position.set(-0.2, 5.52, 0);
    const skTower = new THREE.Mesh(new THREE.BoxGeometry(1.25, 7.2, 1.25), makeWinMat('#b91c1c', '#fef08a'));
    skTower.position.set(1.45, 3.6, -1.15);
    const archTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.36, 0.42), new THREE.MeshStandardMaterial({ color: '#1d4ed8' }));
    archTop.position.set(-0.2, 1.45, 1.65);
    for (const ax of [-1.2, -0.4, 0.4, 1.2]) {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      pil.position.set(ax - 0.2, 0.7, 1.65); g.add(pil);
    }
    g.add(base, hall, r1, r2, finial, skTower, archTop);
    g.userData.baseScale = 0.98;
  } else if (nm === '台北西門町') {
    // 西門紅樓雙層八角廳＋萬年商業霓虹廣告塔（h = 7.0）＋彩虹斑馬線
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.38, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.75 }));
    hall.position.set(-0.65, 1.1, -0.15);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.52, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#334155' }));
    roof.position.set(-0.65, 2.75, -0.15);
    const wannian = new THREE.Mesh(new THREE.BoxGeometry(1.35, 7.0, 1.25), makeWinMat('#1e1b4b', '#f472b6'));
    wannian.position.set(1.15, 3.5, -0.55);
    const neonCols = ['#ef4444', '#facc15', '#38bdf8', '#a855f7'];
    neonCols.forEach((c, k) => {
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.18), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7 }));
      board.position.set(1.15, 2.0 + k * 1.35, 0.12); g.add(board);
    });
    const cols = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
    cols.forEach((c, k) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 }));
      strip.position.set(0, 0.05, 0.72 + k * 0.19); g.add(strip);
    });
    g.add(hall, roof, wannian);
    g.userData.baseScale = 0.96;
  } else if (nm === '新北' || nm === '新北板橋') {
    // 新板特區雙子星摩天商辦（h=6.2 & 5.0＋天橋）＋耶誕城發光竹筍巨塔（h=4.5）
    const tw1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 6.2, 1.15), makeWinMat('#1e3a5f', '#fef08a')); tw1.position.set(-0.95, 3.1, -0.35);
    const tw2 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 5.0, 1.05), makeWinMat('#334155', '#38bdf8')); tw2.position.set(0.95, 2.5, -0.35);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.55), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04' }));
    bridge.position.set(0, 3.6, -0.35);
    const shoot = new THREE.Mesh(new THREE.ConeGeometry(0.65, 4.5, 8), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.55 }));
    shoot.position.set(0, 2.25, 0.95);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 - k * 0.14, 0.07, 6, 14), new THREE.MeshStandardMaterial({ color: '#f472b6', emissive: '#db2777' }));
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.1 + k * 1.1, 0.95); g.add(ring);
    }
    g.add(tw1, tw2, bridge, shoot);
    g.userData.baseScale = 0.96;
  } else if (nm === '台中') {
    // 台中公園湖心亭雙尖頂＋白拱橋（前景）＋七期高聳玻璃摩天大樓（h=6.2 背景）
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.22, 16), new THREE.MeshStandardMaterial({ color: '#38bdf8' })); water.position.set(-0.2, 0.11, 0.5);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 1.15), new THREE.MeshStandardMaterial({ color: '#ffffff' })); base.position.set(-0.2, 0.62, 0.5);
    for (const dx of [-0.52, 0.52]) {
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); top.position.set(dx - 0.2, 1.6, 0.5); g.add(top);
    }
    const archBridge = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.11, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    archBridge.position.set(-1.1, 0.25, 1.25);
    const sevenTower = new THREE.Mesh(new THREE.BoxGeometry(1.45, 6.2, 1.35), makeWinMat('#0f172a', '#fde68a'));
    sevenTower.position.set(0.95, 3.1, -0.95);
    g.add(water, base, archBridge, sevenTower);
    g.userData.baseScale = 0.96;
  } else if (nm === '台南' || nm === '台南府城') {
    // 台南府城三層赤崁樓／大南門（y ~ 5.4）＋贔屭御碑＋紅燈籠
    const stone = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.3, 1.8), new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.85 })); stone.position.y = 0.65;
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 1.4), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); h1.position.y = 1.9;
    const e1 = new THREE.Mesh(new THREE.ConeGeometry(2.05, 0.8, 4), new THREE.MeshStandardMaterial({ color: '#b45309' }));
    e1.rotation.y = Math.PI / 4; e1.scale.set(1.35, 1, 0.85); e1.position.y = 2.85;
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.0, 1.1), new THREE.MeshStandardMaterial({ color: '#dc2626' })); h2.position.y = 3.55;
    const e2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.85, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    e2.rotation.y = Math.PI / 4; e2.scale.set(1.3, 1, 0.85); e2.position.y = 4.45;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: '#facc15' })); ridge.position.y = 5.25;
    for (const sx of [-1.05, 1.05]) {
      const stele = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.95, 0.18), new THREE.MeshStandardMaterial({ color: '#64748b' }));
      stele.position.set(sx, 0.48, 1.25); g.add(stele);
    }
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c' }));
    lan.position.set(0, 1.45, 1.05);
    g.add(stone, h1, e1, h2, e2, ridge, lan);
    g.userData.baseScale = 0.96;
  } else if (nm === '竹科' || nm === '竹科園區') {
    // 竹科半導體晶圓巨廈＋雙科技高塔（h=4.6）＋巨型發光旋轉矽晶圓（r=1.35 at y=5.5）
    const fab = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.2, 2.2), makeWinMat('#334155', '#38bdf8')); fab.position.y = 1.1;
    const tL = new THREE.Mesh(new THREE.BoxGeometry(0.85, 4.6, 0.95), makeWinMat('#1e293b', '#22d3ee')); tL.position.set(-1.35, 2.3, -0.5);
    const tR = new THREE.Mesh(new THREE.BoxGeometry(0.85, 4.6, 0.95), makeWinMat('#1e293b', '#22d3ee')); tR.position.set(1.35, 2.3, -0.5);
    const wafer = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.16, 20), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.5, metalness: 0.85 }));
    wafer.rotation.x = Math.PI / 2; wafer.position.y = 5.5;
    animProps.push(now => { wafer.rotation.z = now * 0.0022; });
    g.add(fab, tL, tR, wafer);
    g.userData.baseScale = 0.96;
  } else if (nm === '桃園') {
    // 桃園國際都會雙塔（h = 5.2）＋傳統彩繪牌樓＋金頂尖塔
    const tw1 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 5.2, 1.05), makeWinMat('#1e3a8a', '#fde68a')); tw1.position.set(-1.05, 2.6, -0.45);
    const tw2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 4.4, 0.95), makeWinMat('#334155', '#38bdf8')); tw2.position.set(1.05, 2.2, -0.45);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.48, 0.6), new THREE.MeshStandardMaterial({ color: '#dc2626' })); arch.position.set(0, 1.85, 0.85);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.3, 4), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.55 }));
    spire.rotation.y = Math.PI / 4; spire.position.set(-1.05, 5.85, -0.45);
    g.add(tw1, tw2, arch, spire);
    g.userData.baseScale = 0.95;
  } else if (nm === '花蓮') {
    // 花蓮文創高聳鐘塔大樓（h=4.8）＋七星潭月牙海灣＋原住民豐年祭圖騰巨柱與大理石拱門
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.35, 4.8, 1.25), makeWinMat('#78350f', '#fde68a')); tower.position.set(-0.95, 2.4, -0.35);
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#ca8a04' }));
    clock.rotation.x = Math.PI / 2; clock.position.set(-0.95, 4.0, 0.32);
    const bay = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.25, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#0ea5e9' }));
    bay.rotation.x = -Math.PI / 2; bay.position.set(0.7, 0.2, 0.7);
    const totem = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 3.8, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); totem.position.set(1.15, 1.9, -0.4);
    const marbleArch = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#f1f5f9' }));
    marbleArch.position.set(0.25, 1.25, 0.6);
    g.add(tower, clock, bay, totem, marbleArch);
    g.userData.baseScale = 0.95;
  } else if (nm === '宜蘭') {
    // 蘭陽博物館單面山幾何建築（h=4.2＋鏡面水池）＋幾米廣場飛天火車與長頸鹿高塔
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.18, 16), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.2 })); pond.position.y = 0.09;
    const museum = new THREE.Mesh(new THREE.ConeGeometry(1.85, 4.2, 4), makeWinMat('#475569', '#bae6fd'));
    museum.rotation.y = Math.PI / 4; museum.rotation.z = -0.3; museum.position.set(-0.35, 1.85, -0.2);
    const giraffe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.6, 8), new THREE.MeshStandardMaterial({ color: '#facc15' }));
    giraffe.position.set(1.25, 1.8, 0.65);
    const train = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
    train.position.set(0.45, 3.3, 0.85); train.rotation.z = 0.18;
    g.add(pond, museum, giraffe, train);
    g.userData.baseScale = 0.95;
  } else if (nm === '屏東') {
    // 大鵬灣斜張A字高塔（h=5.4＋鋼纜）＋東隆宮黃金牌樓＋躍水黑鮪魚
    const towerL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 5.4, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    towerL.position.set(-0.55, 2.7, -0.2); towerL.rotation.z = -0.14;
    const towerR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, 5.4, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    towerR.position.set(-1.15, 2.7, -0.2); towerR.rotation.z = 0.14;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.24, 0.85), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); deck.position.set(0, 0.65, 0.2);
    const goldArch = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.2, 0.35), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', metalness: 0.65 }));
    goldArch.position.set(1.1, 1.1, -0.65);
    const tuna = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.8, 8), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.65 }));
    tuna.rotation.z = -0.95; tuna.position.set(0.75, 2.0, 0.75);
    g.add(towerL, towerR, deck, goldArch, tuna);
    g.userData.baseScale = 0.95;
  } else if (nm === '彰化') {
    // 八卦山金色大佛（y ~ 5.2 雙層蓮座＋背光）＋扇形車庫弧形磚牆與蒸汽火車
    const lotus1 = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.65, 0.65, 12), new THREE.MeshStandardMaterial({ color: '#f1f5f9' })); lotus1.position.set(-0.25, 0.32, -0.25);
    const lotus2 = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.55, 12), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); lotus2.position.set(-0.25, 0.9, -0.25);
    const goldM = new THREE.MeshStandardMaterial({ color: '#eab308', emissive: '#854d0e', emissiveIntensity: 0.25, metalness: 0.6 });
    const knee = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.75, 12), goldM); knee.position.set(-0.25, 1.55, -0.25);
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 1.1, 1.85, 12), goldM); robe.position.set(-0.25, 2.75, -0.25);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), goldM); head.position.set(-0.25, 4.18, -0.25);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), goldM); crown.position.set(-0.25, 4.92, -0.25);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.11, 6, 18), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#ca8a04', emissiveIntensity: 0.55 }));
    halo.position.set(-0.25, 4.05, -0.7);
    const roundhouse = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.75, 8, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
    roundhouse.position.set(1.05, 0.38, 0.85);
    const loco = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: '#1e293b' }));
    loco.position.set(1.05, 0.35, 1.25);
    g.add(lotus1, lotus2, knee, robe, head, crown, halo, roundhouse, loco);
    g.userData.baseScale = 0.95;
  } else if (nm === '嘉義') {
    // 北回歸線太陽館太空梭巨塔（h=5.2＋多環渾天儀）＋檜意森活村木屋
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); base.position.set(-0.3, 0.28, -0.2);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.48, 4.7, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); pylon.position.set(-0.3, 2.75, -0.2);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 8, 18), new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.6 }));
    ring1.position.set(-0.3, 4.15, -0.2); ring1.rotation.x = Math.PI / 6;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.1, 8, 16), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.6 }));
    ring2.position.set(-0.3, 4.15, -0.2); ring2.rotation.y = Math.PI / 3;
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.45 }));
    orb.position.set(-0.3, 4.15, -0.2);
    const hinoki = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.0), new THREE.MeshStandardMaterial({ color: '#92400e' })); hinoki.position.set(1.1, 0.42, 0.85);
    const hRoof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.55, 4), new THREE.MeshStandardMaterial({ color: '#334155' })); hRoof.rotation.y = Math.PI / 4; hRoof.position.set(1.1, 1.12, 0.85);
    g.add(base, pylon, ring1, ring2, orb, hinoki, hRoof);
    g.userData.baseScale = 0.95;
  } else if (t.type === 'start') {
    // 鵝鑾鼻燈塔起點＋紅色迎賓拱柱＋南國椰子樹（y ~ 6.2）
    const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.75, 12), new THREE.MeshStandardMaterial({ color: '#cbd5e1' })); lhBase.position.y = 0.38;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.92, 4.1, 12), new THREE.MeshStandardMaterial({ color: '#ffffff' })); body.position.y = 2.75;
    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.25, 12), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); balcony.position.y = 4.78;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.8, 12), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15', emissiveIntensity: 0.85 })); lamp.position.y = 5.25;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.95, 12), new THREE.MeshStandardMaterial({ color: '#dc2626' })); roof.position.y = 6.05;
    const palm = palmTree(0.8); palm.position.set(1.65, 0, 0.65);
    g.add(lhBase, body, balcony, lamp, roof, palm);
    g.userData.baseScale = 0.96;
  } else if (nm === '阿里山') {
    // 阿里山多節紅色蒸汽小火車＋木造車站＋千年檜木神木（y ~ 4.8）
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.58, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#7c2d12' })); trunk.position.set(-1.15, 1.1, -0.45);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.9, 8), new THREE.MeshStandardMaterial({ color: '#15803d', flatShading: true })); crown.position.set(-1.15, 3.35, -0.45);
    const station = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.1), new THREE.MeshStandardMaterial({ color: '#92400e' })); station.position.set(0.6, 0.55, -0.75);
    const loco = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.0, 0.95), new THREE.MeshStandardMaterial({ color: '#dc2626' })); loco.position.set(0.8, 0.58, 0.7);
    const car = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: '#ef4444' })); car.position.set(-0.9, 0.52, 0.7);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.75, 8), new THREE.MeshStandardMaterial({ color: '#1e293b' })); chimney.position.set(1.35, 1.45, 0.7);
    g.add(trunk, crown, station, loco, car, chimney);
    g.userData.baseScale = 0.94;
  } else if (nm === '日月潭') {
    // 日月潭 5層慈恩八角寶塔＋碧湖碼頭＋紅燈柱（y ~ 6.4）
    const lake = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.75, 0.18, 16), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.2 })); lake.position.y = 0.09;
    const pag = makePagodaOrTower('#fde68a', '#b91c1c', 5); pag.position.y = 0.18;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.6), new THREE.MeshStandardMaterial({ color: '#92400e' })); pier.position.set(1.1, 0.22, 1.05);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c' })); lantern.position.set(1.6, 0.85, 1.05);
    g.add(lake, pag, pier, lantern);
    g.userData.baseScale = 0.95;
  } else if (nm === '太魯閣' || nm === '天祥') {
    // 太魯閣／天祥：陡峭大理石峽谷雙壁（y ~ 5.4）＋紅色吊橋＋牌樓/寶塔
    const cliffM = new THREE.MeshStandardMaterial({ color: '#cbd5e1', flatShading: true, roughness: 0.85 });
    for (const sx of [-1.55, 1.55]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.05, 5.4, 5), cliffM); c.position.set(sx, 2.7, -0.25); g.add(c);
      const sub = new THREE.Mesh(new THREE.ConeGeometry(0.72, 3.6, 5), new THREE.MeshStandardMaterial({ color: '#94a3b8', flatShading: true }));
      sub.position.set(sx * 0.8, 1.8, 0.55); g.add(sub);
    }
    const bridgeRed = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 0.7), bridgeRed); deck.position.set(0, 1.85, 0.2);
    for (const bx of [-1.05, 1.05]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.8, 0.7), bridgeRed); pylon.position.set(bx, 2.6, 0.2); g.add(pylon);
    }
    const cable = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.05, 6, 14, Math.PI), bridgeRed);
    cable.rotation.z = Math.PI; cable.position.set(0, 3.4, 0.2);
    g.add(deck, cable);
    if (nm === '太魯閣') {
      const archRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 0.78), new THREE.MeshStandardMaterial({ color: '#15803d' })); archRoof.position.set(0, 1.25, 1.05); g.add(archRoof);
      for (const dx of [-0.7, 0.7]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 8), bridgeRed); col.position.set(dx, 0.6, 1.05); g.add(col);
      }
    } else {
      const pag = makePagodaOrTower('#fef3c7', '#dc2626', 3);
      pag.scale.setScalar(0.75); pag.position.set(0, 0, -0.8); g.add(pag);
    }
    g.userData.baseScale = 0.94;
  } else if (nm === '九份' || nm === '九份山城' || nm === '鹿港老街' || nm === '鹿港' || nm === '大溪老街' || nm === '大溪') {
    // 老街／山城階梯紅磚街屋（4層阿妹茶樓 / 3層巴洛克牌樓）＋成串紅燈籠（y ~ 4.6..5.2）
    const brick = new THREE.MeshStandardMaterial({ color: nm.includes('九份') ? '#78350f' : '#b91c1c', roughness: 0.8 });
    const roofM = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6 });
    const tiers = nm.includes('九份') ? 4 : 3;
    for (let k = 0; k < tiers; k++) {
      const w = 2.8 - k * 0.42, d = 1.85 - k * 0.26;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, d), brick);
      tier.position.set(k * 0.1 - 0.1, 0.52 + k * 1.08, -0.15);
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, 0.65, 4), roofM);
      r.rotation.y = Math.PI / 4; r.position.set(k * 0.1 - 0.1, 1.35 + k * 1.08, -0.15);
      g.add(tier, r);
    }
    if (!nm.includes('九份')) {
      const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.05, 0.75, 6), new THREE.MeshStandardMaterial({ color: '#fef3c7' }));
      gable.position.set(0, 3.85, 0.35); g.add(gable);
    }
    const lanM = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c', emissiveIntensity: 0.7 });
    for (const lx of [-1.0, -0.35, 0.35, 1.0]) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), lanM);
      lan.scale.y = 1.25; lan.position.set(lx, 1.65 + Math.abs(lx) * 0.12, 0.98); g.add(lan);
    }
    g.userData.baseScale = 0.94;
  } else if (nm === '恆春') {
    // 恆春古城紅磚城門（拱形通道＋雙層馬背門樓＋紅燈籠，y ~ 4.2）
    const brick = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.85 });
    for (const dx of [-1.05, 1.05]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.85, 1.5), brick); pier.position.set(dx, 0.92, 0); g.add(pier);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.75, 1.5), brick); lintel.position.y = 2.2;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.85, 1.1), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); hall.position.y = 2.95;
    const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
    gateRoof.rotation.y = Math.PI / 4; gateRoof.scale.set(1.3, 1, 0.85); gateRoof.position.y = 3.8;
    g.add(lintel, hall, gateRoof);
    g.userData.baseScale = 0.92;
  } else if (nm === '安平' || nm === '安平古堡') {
    // 安平古堡熱蘭遮城（階梯紅磚稜堡＋純白高聳瞭望燈樓＋砲管，y ~ 5.4）
    const brickM = new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.85 });
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 2.5), brickM); f1.position.y = 0.45;
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 2.0), brickM); f2.position.y = 1.35;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.78, 2.95, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(0.25, 3.0, -0.1);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.48, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b', emissiveIntensity: 0.8 })); lantern.position.set(0.25, 4.6, -0.1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.72, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); cap.position.set(0.25, 5.1, -0.1);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.05, 6), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6 }));
    cannon.rotation.z = Math.PI / 2; cannon.position.set(-1.35, 1.9, 0.45);
    g.add(f1, f2, tower, lantern, cap, cannon);
    g.userData.baseScale = 0.94;
  } else if (nm === '台東') {
    // 台東鹿野高台雙熱氣球（上下飄浮動畫，y ~ 4.8）
    const hill = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.45, 12), new THREE.MeshStandardMaterial({ color: '#16a34a' })); hill.position.y = 0.22;
    g.add(hill);
    const defs = [[0, 3.2, 0, 1.15, '#fb7185', '#facc15'], [1.1, 2.4, 0.55, 0.78, '#38bdf8', '#f97316']];
    defs.forEach(([bx, by, bz, sc, col, band], k) => {
      const bal = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(1.05 * sc, 12, 10), new THREE.MeshStandardMaterial({ color: col }));
      env.scale.set(0.95, 1.25, 0.95); env.position.set(bx, by, bz);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.88 * sc, 0.13 * sc, 6, 16), new THREE.MeshStandardMaterial({ color: band }));
      stripe.rotation.x = Math.PI / 2; stripe.position.set(bx, by, bz);
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.5 * sc, 0.42 * sc, 0.5 * sc), new THREE.MeshStandardMaterial({ color: '#92400e' }));
      basket.position.set(bx, by - 1.65 * sc, bz);
      bal.add(env, stripe, basket); g.add(bal);
      animProps.push(now => { bal.position.y = 0.35 + Math.sin(now * 0.0028 + k * 1.6) * 0.42; });
    });
    g.userData.baseScale = 0.94;
  } else if (nm === '綠島' || nm === '西嶼燈塔' || nm === '鵝鑾鼻燈塔' || nm === '東引') {
    // 海濱礁岩高聳白色／條紋燈塔（y ~ 5.2）
    const cliff = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.15, 7), new THREE.MeshStandardMaterial({ color: '#475569', flatShading: true })); cliff.position.set(-0.2, 0.58, 0);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.62, 3.3, 12), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(-0.2, 2.65, 0);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.54, 0.68, 12), new THREE.MeshStandardMaterial({ color: nm === '綠島' ? '#0f172a' : '#dc2626' })); stripe.position.set(-0.2, 2.65, 0);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 10), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b', emissiveIntensity: 0.9 })); lantern.position.set(-0.2, 4.5, 0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.55, 10), new THREE.MeshStandardMaterial({ color: '#dc2626' })); cap.position.set(-0.2, 5.0, 0);
    g.add(cliff, tower, stripe, lantern, cap);
    if (nm === '東引') {
      const stele = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.65, 0.32), new THREE.MeshStandardMaterial({ color: '#64748b' })); stele.position.set(1.0, 0.82, 0.25); g.add(stele);
    } else if (nm === '綠島') {
      const turb = makeWindTurbine(); turb.position.set(1.1, 0, -0.35); turb.scale.setScalar(0.85); g.add(turb);
    }
    g.userData.baseScale = 0.94;
  } else if (nm === '蘭嶼') {
    // 達悟族拼板舟＋高翹雙船首（y ~ 3.8）＋發呆亭
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.9), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); hull.position.set(0, 0.42, 0.4);
    const keel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 0.94), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); keel.position.set(0, 0.26, 0.4);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 0.96), new THREE.MeshStandardMaterial({ color: '#0f172a' })); stripe.position.set(0, 0.58, 0.4);
    for (const sx of [-1.35, 1.35]) {
      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.85, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
      stem.position.set(sx, 1.3, 0.4); stem.rotation.z = sx < 0 ? 0.32 : -0.32; g.add(stem);
    }
    const pavilion = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 4), new THREE.MeshStandardMaterial({ color: '#a16207' }));
    pavilion.rotation.y = Math.PI / 4; pavilion.position.set(0, 3.25, -0.65);
    const stilt = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.7, 1.0), new THREE.MeshStandardMaterial({ color: '#78350f' }));
    stilt.position.set(0, 1.35, -0.65);
    g.add(hull, keel, stripe, pavilion, stilt);
    g.userData.baseScale = 0.94;
  } else if (nm === '墾丁') {
    // 墾丁大尖石山（y ~ 4.2）＋雙熱帶椰樹＋沙灘遮陽傘
    const sailRock = new THREE.Mesh(new THREE.ConeGeometry(0.95, 4.2, 5), new THREE.MeshStandardMaterial({ color: '#64748b', flatShading: true })); sailRock.position.set(-0.95, 2.1, -0.35);
    const p1 = palmTree(0.95); p1.position.set(0.95, 0, -0.4);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 6), new THREE.MeshStandardMaterial({ color: '#ef4444' })); umb.position.set(0.25, 1.2, 0.8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); pole.position.set(0.25, 0.6, 0.8);
    g.add(sailRock, p1, umb, pole);
    g.userData.baseScale = 0.94;
  } else if (nm === '淡水' || nm === '淡水老街') {
    // 淡水紅毛城紅磚堡壘＋情人橋白色斜張巨塔（y ~ 5.0）
    const fort = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.55, 1.45), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.8 })); fort.position.set(-0.9, 0.78, -0.2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, 1.6), new THREE.MeshStandardMaterial({ color: '#475569' })); roof.position.set(-0.9, 1.62, -0.2);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 4.9, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
    mast.position.set(0.7, 2.4, 0.25); mast.rotation.z = -0.32;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, 0.75), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); deck.position.set(0.45, 0.45, 0.65);
    g.add(fort, roof, mast, deck);
    g.userData.baseScale = 0.94;
  } else if (nm === '莒光樓') {
    // 莒光樓（白石台基＋三層朱紅宮殿重簷閣樓，y ~ 4.6）
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.75, 2.2), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); base.position.y = 0.38;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.1, 1.5), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); wall.position.y = 1.8;
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.75, 4), new THREE.MeshStandardMaterial({ color: '#ca8a04' })); roof1.position.y = 3.1; roof1.rotation.y = Math.PI / 4;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.78, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' })); roof2.position.y = 3.95; roof2.rotation.y = Math.PI / 4;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15' })); finial.position.y = 4.48;
    g.add(base, wall, roof1, roof2, finial);
    g.userData.baseScale = 0.92;
  } else if (nm === '古寧頭戰史館') {
    // 古寧頭戰史館（花崗岩城垛門樓＋戰車紀念碑＋旗桿，y ~ 3.9）
    const fort = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.85, 1.45), new THREE.MeshStandardMaterial({ color: '#64748b' })); fort.position.set(0, 0.92, -0.35);
    for (let bx = -1.0; bx <= 1.0; bx += 0.5) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.35), new THREE.MeshStandardMaterial({ color: '#475569' })); merlon.position.set(bx, 2.05, -0.85); g.add(merlon);
    }
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.55, 0.95), new THREE.MeshStandardMaterial({ color: '#3f6212' })); hull.position.set(0, 0.38, 0.75);
    const turret = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 0.65), new THREE.MeshStandardMaterial({ color: '#365314' })); turret.position.set(0, 0.82, 0.75);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.1, 6), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); pole.position.set(0.9, 2.85, -0.35);
    g.add(fort, hull, turret, pole);
    g.userData.baseScale = 0.92;
  } else if (nm === '山后民俗村') {
    // 金門山后民俗村（閩南燕尾古厝群＋風獅爺石座，y ~ 3.8）
    const wallM = new THREE.MeshStandardMaterial({ color: '#b91c1c' });
    const roofM = new THREE.MeshStandardMaterial({ color: '#dc2626' });
    for (const bz of [-0.55, 0.55]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.1, 0.9), wallM); body.position.set(0, 0.55, bz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.65, 4), roofM);
      roof.rotation.y = Math.PI / 4; roof.scale.set(1.3, 1, 0.65); roof.position.set(0, 1.38, bz);
      g.add(body, roof);
    }
    const lionPed = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#d6d3d1' })); lionPed.position.set(1.25, 1.2, 0);
    const lion = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshStandardMaterial({ color: '#f59e0b' })); lion.position.set(1.25, 2.75, 0);
    const arch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.35), roofM); arch.position.set(-0.2, 3.4, -0.55);
    g.add(lionPed, lion, arch);
    g.userData.baseScale = 0.92;
  } else if (nm === '太武山') {
    // 太武山花崗岩巨峰（y ~ 4.4）＋朱紅「毋忘在莒」勒石巨碑（y ~ 3.6）
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.65, 4.4, 6), new THREE.MeshStandardMaterial({ color: '#78716c', flatShading: true })); peak.position.set(-0.35, 2.2, -0.2);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.15, 3.2, 0.52), new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#7f1d1d', emissiveIntensity: 0.3 })); slab.position.set(0.85, 1.6, 0.45);
    const tr = tree(1.15, '#15803d'); tr.position.set(-1.1, 0, 0.85);
    g.add(peak, slab, tr);
    g.userData.baseScale = 0.92;
  } else if (nm === '大膽島前線') {
    // 大膽島前線（花崗岩堡壘＋標語牆 y ~ 3.8＋旗桿 y ~ 4.8）
    const bunker = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.4, 1.5, 8), new THREE.MeshStandardMaterial({ color: '#57534e' })); bunker.position.y = 0.75;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 0.28), new THREE.MeshStandardMaterial({ color: '#dc2626' })); wall.position.set(0, 1.1, 1.18);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); pole.position.set(0, 3.1, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.06), new THREE.MeshStandardMaterial({ color: '#ef4444' })); flag.position.set(0.48, 4.4, 0);
    g.add(bunker, wall, pole, flag);
    g.userData.baseScale = 0.92;
  } else if (nm === '澎湖天后宮') {
    // 澎湖天后宮（四百年古廟黃金琉璃重簷 y ~ 4.4＋雙龍柱＋香爐）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.85, 2.1), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); base.position.y = 0.92;
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.05, 4), new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.35 }));
    r1.rotation.y = Math.PI / 4; r1.scale.set(1.25, 1, 0.85); r1.position.y = 2.35;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.45 }));
    r2.rotation.y = Math.PI / 4; r2.scale.set(1.2, 1, 0.8); r2.position.y = 3.25;
    const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 })); censer.position.set(0, 0.4, 1.3);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#fde047' })); finial.position.y = 4.25;
    g.add(base, r1, r2, censer, finial);
    g.userData.baseScale = 0.92;
  } else if (nm === '跨海大橋') {
    // 澎湖跨海大橋（雙拱橋＋高拱橋頭門樓＋燈塔信標，y ~ 3.9）
    const sea = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 1.6), new THREE.MeshStandardMaterial({ color: '#0284c7' })); sea.position.y = 0.09;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.26, 0.8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); deck.position.y = 0.95;
    for (const ax of [-0.75, 0.75]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.11, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#38bdf8' }));
      arch.position.set(ax, 1.05, 0); g.add(arch);
    }
    const gatePillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.6, 0.85), new THREE.MeshStandardMaterial({ color: '#ffffff' })); gatePillar.position.set(-1.45, 1.8, 0);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04' })); beacon.position.set(-1.45, 3.72, 0);
    g.add(sea, deck, gatePillar, beacon);
    g.userData.baseScale = 0.92;
  } else if (nm === '望安綠蠵龜') {
    // 望安綠蠵龜沙灘＋巨大綠蠵龜＋保育觀景燈塔（y ~ 4.0）
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.22, 14), new THREE.MeshStandardMaterial({ color: '#fde68a' })); sand.position.y = 0.11;
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#15803d' }));
    shell.scale.set(1.0, 0.85, 1.3); shell.position.set(-0.25, 0.26, 0.2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), new THREE.MeshStandardMaterial({ color: '#22c55e' })); head.position.set(-0.25, 0.48, 1.35);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(1.05, 1.7, -0.65);
    const topL = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b' })); topL.position.set(1.05, 3.65, -0.65);
    g.add(sand, shell, head, tower, topL);
    g.userData.baseScale = 0.92;
  } else if (nm === '北港廟宇') {
    // 北港朝天宮（三川重簷＋鐘鼓雙樓 y ~ 4.8＋香爐）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 2.1), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); base.position.y = 1.0;
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.05, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    r1.rotation.y = Math.PI / 4; r1.scale.set(1.25, 1, 0.85); r1.position.y = 2.52;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(1.65, 1.0, 4), new THREE.MeshStandardMaterial({ color: '#f59e0b' }));
    r2.rotation.y = Math.PI / 4; r2.scale.set(1.2, 1, 0.8); r2.position.y = 3.45;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#ca8a04' })); finial.position.y = 4.55;
    const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.55, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 })); censer.position.set(0, 0.45, 1.35);
    g.add(base, r1, r2, finial, censer);
    g.userData.baseScale = 0.94;
  } else if (nm === '行天宮') {
    // 台北行天宮（沉穩青瓦重簷 y ~ 4.4＋雙香亭＋山門）
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.0, 2.0), new THREE.MeshStandardMaterial({ color: '#991b1b' })); base.position.y = 1.0;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.5, 4), new THREE.MeshStandardMaterial({ color: '#334155' }));
    roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 0.9, 0.85); roof.position.y = 2.75;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.35), new THREE.MeshStandardMaterial({ color: '#fbbf24' })); ridge.position.y = 3.85;
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15' })); finial.position.y = 4.25;
    g.add(base, roof, ridge, finial);
    g.userData.baseScale = 0.94;
  } else if (nm === '迎神殿') {
    // 花東迎神殿（朱紅八卦神龕＋高聳重頂＋旋轉金神明光輪，y ~ 4.8）
    const shrine = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 2.0, 8), new THREE.MeshStandardMaterial({ color: '#dc2626' })); shrine.position.y = 1.0;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.45, 8), new THREE.MeshStandardMaterial({ color: '#f59e0b' })); roof.position.y = 2.72;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#fde047' })); spire.position.y = 3.8;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.11, 6, 16), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#ca8a04' }));
    halo.position.set(0, 4.05, 0);
    animProps.push(now => { halo.rotation.y = now * 0.0028; });
    g.add(shrine, roof, spire, halo);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'hospital') {
    g.userData.baseScale = 1.45;
    const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.8, 2.3), makeWinMat('#f1f5f9', '#38bdf8')); b.position.y = 1.9;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 2.0), makeWinMat('#e2e8f0', '#7dd3fc')); wing.position.set(1.85, 1.3, 0);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, 16), new THREE.MeshStandardMaterial({ color: '#334155' })); pad.position.set(0, 3.86, 0);
    const red = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#991b1b' });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.38, 0.18), red); c1.position.set(0, 2.6, 1.18);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.25, 0.18), red); c2.position.set(0, 2.6, 1.18);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), red); beacon.position.set(0, 4.5, 0);
    g.add(b, wing, pad, c1, c2, beacon);
  } else if (t.type === 'casino') {
    // 海峽豪華郵輪賭場（雙層霓虹甲板＋金幣輪盤塔＋旋轉幸運骰＋霓虹招牌，y ~ 5.0）
    const sign = makeNeonSign('豪華賭場', '#1e1b4b', '#ec4899'); sign.position.set(0, 1.0, -0.95);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.95, 1.7), new THREE.MeshStandardMaterial({ color: '#1e1b4b', metalness: 0.35 })); hull.position.y = 0.48;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.15, 1.3), makeWinMat('#312e81', '#fde047')); deck.position.y = 1.5;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.32, 12), new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#92400e', metalness: 0.65 })); crown.position.y = 2.4;
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#ca8a04' })); die.position.y = 3.55;
    animProps.push(now => { crown.rotation.y = now * 0.002; die.rotation.y = -now * 0.003; die.rotation.x = now * 0.002; });
    g.add(sign, hull, deck, crown, die);
    g.userData.baseScale = 0.94;
  } else if (nm === '七美' || nm === '七美雙心') {
    // 七美雙心石滬＋懸崖海景燈塔（y ~ 3.9）
    const seaPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#06b6d4' })); seaPlate.position.y = 0.1;
    const stoneM = new THREE.MeshStandardMaterial({ color: '#44403c', roughness: 0.92 });
    const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.15, 6, 14), stoneM); h1.rotation.x = Math.PI / 2; h1.position.set(-0.32, 0.3, 0.15);
    const h2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 6, 12), stoneM); h2.rotation.x = Math.PI / 2; h2.position.set(0.45, 0.3, 0.4);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); beacon.position.set(0.95, 1.6, -0.75);
    const topL = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04' })); topL.position.set(0.95, 3.48, -0.75);
    g.add(seaPlate, h1, h2, beacon, topL);
    g.userData.baseScale = 0.92;
  } else if (nm === '烈嶼' || nm === '烈嶼小金門') {
    // 烈嶼風雞守護神像＋八達樓子瞭望樓（y ~ 3.8）
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.92, 0.85, 8), new THREE.MeshStandardMaterial({ color: '#78716c' })); ped.position.set(-0.45, 0.42, 0.25);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); body.scale.set(0.95, 1.15, 1.25); body.position.set(-0.45, 1.55, 0.25);
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: '#dc2626' })); comb.position.set(-0.45, 2.45, 0.45);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.6, 0.95), new THREE.MeshStandardMaterial({ color: '#64748b' })); tower.position.set(0.95, 1.8, -0.45);
    g.add(ped, body, comb, tower);
    g.userData.baseScale = 0.92;
  } else if (nm === '苗栗' || nm === '苗栗大湖') {
    // 苗栗大湖：巨型亮面紅草莓雕像＋果園招牌拱門（y ~ 4.6，置於 food 之前）
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.5, 12), new THREE.MeshStandardMaterial({ color: '#f1f5f9' })); ped.position.y = 0.25;
    const berry = new THREE.Mesh(new THREE.ConeGeometry(1.22, 2.4, 14), new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.18, metalness: 0.15 }));
    berry.rotation.x = Math.PI; berry.position.y = 1.95;
    const topCap = new THREE.Mesh(new THREE.SphereGeometry(1.18, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.18 }));
    topCap.position.y = 3.05;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.36), new THREE.MeshStandardMaterial({ color: '#16a34a' }));
      leaf.position.set(Math.cos(a) * 0.52, 4.1, Math.sin(a) * 0.52); leaf.rotation.y = -a; leaf.rotation.z = -0.25; g.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.65, 6), new THREE.MeshStandardMaterial({ color: '#15803d' })); stem.position.y = 4.35;
    g.add(ped, berry, topCap, stem);
    g.userData.baseScale = 0.94;
  } else if (nm === '池上米鄉') {
    // 池上米鄉：金黃稻田＋伯朗大道巨型黃相框＋奉茶樹（y ~ 4.2，置於 food 之前）
    const rice = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 2.1), new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.85 })); rice.position.y = 0.12;
    const frameM = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.3 });
    const fL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.6, 0.28), frameM); fL.position.set(-0.9, 1.95, 0.45);
    const fR = fL.clone(); fR.position.x = 0.9;
    const fT = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.28, 0.28), frameM); fT.position.set(0, 3.65, 0.45);
    const fB = fT.clone(); fB.position.y = 0.35;
    const tr = tree(1.3, '#16a34a'); tr.position.set(1.0, 0.2, -0.55);
    g.add(rice, fL, fR, fT, fB, tr);
    g.userData.baseScale = 0.94;
  } else if (nm === '甲仙芋頭街') {
    // 甲仙芋頭街：巨大紫色芋頭地標＋芋冰高牌樓（y ~ 4.5，置於 food 之前）
    const sign = makeNeonSign('甲仙芋頭', '#3b0764', '#c084fc'); sign.position.set(0, 0.7, -0.8);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.48, 12), new THREE.MeshStandardMaterial({ color: '#581c87' })); base.position.y = 0.24;
    const taro = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), new THREE.MeshStandardMaterial({ color: '#a855f7', roughness: 0.5 }));
    taro.scale.set(0.92, 1.45, 0.92); taro.position.set(0.25, 1.85, 0.35);
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.85, 6), new THREE.MeshStandardMaterial({ color: '#22c55e' })); leaf.position.set(0.25, 3.55, 0.35);
    g.add(sign, base, taro, leaf);
    g.userData.baseScale = 0.94;
  } else if (nm === '拉拉山' || nm === '向陽') {
    // 千年紅檜巨木林群＋木造高架觀景台（y ~ 4.8）
    for (const [tx, tz, h] of [[-0.65, 0.1, 4.8], [0.65, -0.25, 3.6], [0.1, 0.6, 2.8]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, h * 0.48, 7), new THREE.MeshStandardMaterial({ color: '#7c2d12' })); trunk.position.set(tx, h * 0.24, tz);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.98, h * 0.65, 7), new THREE.MeshStandardMaterial({ color: '#15803d', flatShading: true })); crown.position.set(tx, h * 0.72, tz);
      g.add(trunk, crown);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 1.1), new THREE.MeshStandardMaterial({ color: '#92400e' })); deck.position.set(0.55, 1.25, 0.55);
    g.add(deck);
    g.userData.baseScale = 0.92;
  } else if (nm === '明池' || nm === '梅山') {
    // 高山迷霧池畔＋二層六角景觀涼亭（y ~ 4.2）
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.24, 14), new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.2 })); pond.position.y = 0.12;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.75, 1.85, 6), new THREE.MeshStandardMaterial({ color: '#fef3c7' })); col.position.y = 1.1;
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.85, 6), new THREE.MeshStandardMaterial({ color: nm === '梅山' ? '#f43f5e' : '#d97706' })); r1.position.y = 2.4;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(0.88, 0.95, 6), new THREE.MeshStandardMaterial({ color: nm === '梅山' ? '#e11d48' : '#b45309' })); r2.position.y = 3.45;
    const tr = tree(1.0, nm === '梅山' ? '#f472b6' : '#15803d'); tr.position.set(1.05, 0, -0.5);
    g.add(pond, col, r1, r2, tr);
    g.userData.baseScale = 0.92;
  } else if (nm === '梨山') {
    // 梨山賓館朱紅雙層宮殿閣樓＋高山松樹（y ~ 4.4）
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.65, 1.5), new THREE.MeshStandardMaterial({ color: '#dc2626' })); base.position.y = 0.82;
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(2.05, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#eab308' }));
    roof1.rotation.y = Math.PI / 4; roof1.scale.set(1.25, 1, 0.85); roof1.position.y = 2.1;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.0), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); upper.position.y = 2.85;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#facc15' }));
    roof2.rotation.y = Math.PI / 4; roof2.scale.set(1.2, 1, 0.8); roof2.position.y = 3.75;
    g.add(base, roof1, upper, roof2);
    g.userData.baseScale = 0.92;
  } else if (nm === '合歡山' || nm === '埡口') {
    // 武嶺／南橫埡口高山雪峰亭（y ~ 4.6）
    const peak = new THREE.Mesh(new THREE.ConeGeometry(1.7, 4.4, 6), new THREE.MeshStandardMaterial({ color: '#475569', flatShading: true })); peak.position.y = 2.2;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.65, 6), new THREE.MeshStandardMaterial({ color: '#f8fafc', flatShading: true })); snow.position.y = 3.65;
    const pav = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.65, 6), new THREE.MeshStandardMaterial({ color: '#dc2626' })); pav.position.set(1.0, 1.35, 0.72);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.3, 0.38), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); pillar.position.set(-1.05, 0.65, 0.75);
    g.add(peak, snow, pav, pillar);
    g.userData.baseScale = 0.92;
  } else if (nm === '小琉球') {
    // 小琉球花瓶岩高聳海蝕柱（y ~ 4.0）
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 1.9, 8), new THREE.MeshStandardMaterial({ color: '#a8a29e', flatShading: true })); stem.position.y = 0.95;
    const top = new THREE.Mesh(new THREE.DodecahedronGeometry(1.15, 0), new THREE.MeshStandardMaterial({ color: '#78716c', flatShading: true })); top.position.y = 2.45;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 7, 6), new THREE.MeshStandardMaterial({ color: '#16a34a', flatShading: true })); bush.position.y = 3.35;
    g.add(stem, top, bush);
    g.userData.baseScale = 0.92;
  } else if (nm === '馬祖') {
    // 馬祖東湧白色燈塔（y ~ 4.6）＋八八坑道酒甕＋石頭屋
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 3.8, 10), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); tower.position.set(-0.55, 1.9, 0);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b' })); lantern.position.set(-0.55, 4.15, 0);
    const jar = new THREE.Mesh(new THREE.SphereGeometry(0.68, 8, 8), new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.5 })); jar.scale.set(1, 1.3, 1); jar.position.set(0.85, 0.85, 0.25);
    g.add(tower, lantern, jar);
    g.userData.baseScale = 0.92;
  } else if (nm === '龜山島') {
    // 龜山島雙峰火山頭（y ~ 4.2）＋賞鯨船
    const shell = new THREE.Mesh(new THREE.ConeGeometry(1.75, 4.2, 7), new THREE.MeshStandardMaterial({ color: '#15803d', flatShading: true })); shell.position.set(-0.2, 2.1, 0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.85, 6), new THREE.MeshStandardMaterial({ color: '#166534', flatShading: true })); head.position.set(1.15, 0.92, 0.15);
    const boat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 0.52), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); boat.position.set(-1.1, 0.2, 1.0);
    g.add(shell, head, boat);
    g.userData.baseScale = 0.92;
  } else if (nm === '平溪' || nm === '平溪天燈') {
    // 平溪祈福天燈（4 盞暖光天燈懸浮在鐵軌上方，y ~ 4.5）
    const track = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 0.85), new THREE.MeshStandardMaterial({ color: '#57534e' })); track.position.y = 0.11;
    const stall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.95), new THREE.MeshStandardMaterial({ color: '#92400e' })); stall.position.set(-0.8, 0.6, -0.75);
    g.add(track, stall);
    const defs = [[0.2, 3.6, 0, 1.15], [-0.9, 2.65, 0.4, 0.82], [0.95, 2.95, -0.25, 0.9], [0, 2.0, 0.55, 0.72]];
    defs.forEach(([lx, ly, lz, sc], k) => {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * sc, 0.36 * sc, 1.15 * sc, 4), new THREE.MeshStandardMaterial({ color: k % 2 ? '#facc15' : '#fb923c', emissive: '#ea580c', emissiveIntensity: 0.78, roughness: 0.35 }));
      lan.rotation.y = Math.PI / 4; lan.position.set(lx, ly, lz);
      animProps.push(now => { lan.position.y = ly + Math.sin(now * 0.003 + k * 1.4) * 0.3; lan.rotation.y = Math.PI / 4 + Math.sin(now * 0.0015 + k) * 0.25; });
      g.add(lan);
    });
    g.userData.baseScale = 0.94;
  } else if (nm === '三義' || nm === '三義木雕村') {
    // 三義木雕村：高聳原木鳥居式牌坊（y ~ 4.0）＋木雕貓頭鷹像
    const woodM = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.75 });
    for (const px of [-1.05, 1.05]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.6, 8), woodM); post.position.set(px, 1.8, -0.25); g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.38, 0.42), new THREE.MeshStandardMaterial({ color: '#92400e' })); lintel.position.set(0, 3.65, -0.25);
    const owl = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 10), new THREE.MeshStandardMaterial({ color: '#a16207' })); owl.scale.set(0.95, 1.35, 0.85); owl.position.set(0, 1.05, 0.6);
    for (const ex of [-0.26, 0.26]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshStandardMaterial({ color: '#facc15' })); eye.position.set(ex, 1.38, 1.15); g.add(eye);
    }
    g.add(lintel, owl);
    g.userData.baseScale = 0.92;
  } else if (nm === '玉里') {
    // 玉里客城紅拱橋（雙連大紅拱橋＋稻田＋火車，y ~ 3.9）
    const rice = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 1.8), new THREE.MeshStandardMaterial({ color: '#eab308' })); rice.position.y = 0.11;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.32, 0.95), new THREE.MeshStandardMaterial({ color: '#dc2626' })); deck.position.y = 1.35;
    for (const ax of [-0.75, 0.75]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.14, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#ef4444' }));
      arch.position.set(ax, 1.45, 0); g.add(arch);
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.6, 0.55), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); tower.position.set(-1.25, 1.8, -0.45);
    g.add(rice, deck, tower);
    g.userData.baseScale = 0.92;
  } else if (t.type === 'shop') {
    // 3 層旗艦級造型服飾精品百貨（h = 4.8，霓虹招牌 y = 4.6＋粉金雨遮＋旋轉金皇冠 y ~ 5.6）
    const sign = makeNeonSign('造型服飾', '#1e1b4b', '#f472b6');
    sign.position.set(0, 1.4, -0.8);
    const shop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.8, 1.9), makeWinMat('#312e81', '#fbcfe8'));
    shop.position.y = 2.4;
    const awning = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.28, 0.9), new THREE.MeshStandardMaterial({ color: '#ec4899', emissive: '#9d174d', emissiveIntensity: 0.45 }));
    awning.position.set(0, 1.65, 1.25); awning.rotation.x = 0.3;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.85, 8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.4, metalness: 0.65 }));
    crown.position.set(0, 5.25, 0);
    animProps.push(now => { crown.rotation.y = now * 0.0022; });
    g.add(sign, shop, awning, crown);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'cardshop') {
    // 卡片商店：高聳霓虹招牌＋玻璃卡店＋旋轉巨型黃金道具卡（y ~ 4.8）
    const sign = makeNeonSign('卡片商店', '#0f172a', '#38bdf8');
    sign.position.set(0, 1.0, -0.8);
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 1.7), makeWinMat('#0369a1', '#bae6fd'));
    kiosk.position.y = 1.15;
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.75, 0.16), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.6, metalness: 0.65 }));
    card.position.set(0, 3.8, 0.45);
    animProps.push(now => { card.rotation.y = now * 0.0024; });
    g.add(sign, kiosk, card);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'autoshow') {
    // 汽車展示中心：高架霓虹招牌＋玻璃展廳拱門＋旋轉雙層展車轉盤（y ~ 4.8）
    const sign = makeNeonSign('汽車中心', '#18181b', '#ef4444');
    sign.position.set(0, 1.15, -0.95);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.18, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.6 }));
    arch.position.set(0, 1.8, 0.25);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.0, 0.42, 20), new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.5, roughness: 0.25 }));
    pad.position.y = 0.21;
    const carG = new THREE.Group();
    const cBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.54, 2.45), new THREE.MeshStandardMaterial({ color: '#ef4444', metalness: 0.65, roughness: 0.2 }));
    cBody.position.y = 0.46;
    const cCabin = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.48, 1.2), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.5 }));
    cCabin.position.set(0, 0.92, -0.1);
    carG.add(cBody, cCabin); carG.position.y = 0.35;
    animProps.push(now => { carG.rotation.y = now * 0.0018; });
    g.add(sign, arch, pad, carG);
    g.userData.baseScale = 0.95;
  } else if (t.type === 'stock') {
    // 台灣股市：高聳行情看板＋交易大樓＋紅漲K線柱群（y ~ 4.8）
    const sign = makeNeonSign('台灣股市', '#052e16', '#22c55e');
    sign.position.set(0, 1.2, -0.8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 1.9), new THREE.MeshStandardMaterial({ color: '#1e293b' }));
    base.position.y = 0.28;
    g.add(sign, base);
    for (let k = 0; k < 4; k++) {
      const h = 1.2 + k * 0.82;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.46, h, 0.46), new THREE.MeshStandardMaterial({ color: k % 2 ? '#ef4444' : '#22c55e', emissive: k % 2 ? '#991b1b' : '#166534', emissiveIntensity: 0.45 }));
      bar.position.set(-0.82 + k * 0.55, 0.55 + h / 2, 0.35);
      g.add(bar);
    }
    g.userData.baseScale = 0.94;
  } else if (t.type === 'minigame') {
    // 夜市小遊戲：雙層嘉年華遊戲帳篷＋高聳幸運轉盤柱＋霓虹招牌（y ~ 4.6）
    const sign = makeNeonSign('夜市遊戲', '#2e1065', '#a855f7');
    sign.position.set(0, 1.0, -0.8);
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 1.6), new THREE.MeshStandardMaterial({ color: '#7c3aed' })); booth.position.y = 1.0;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.25, 4), new THREE.MeshStandardMaterial({ color: '#facc15' }));
    roof.rotation.y = Math.PI / 4; roof.position.y = 2.62;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#be123c' }));
    star.position.y = 3.7;
    animProps.push(now => { star.rotation.y = now * 0.003; });
    g.add(sign, booth, roof, star);
    g.userData.baseScale = 0.92;
  } else if (t.subkind === 'mall') {
    // 百貨公司（6層奢華旗艦百貨 h = 5.8..6.4＋屋頂霓虹招牌 y = 6.8＋在地地標造型）
    const sign = makeNeonSign(nm.slice(0, 4), '#1e293b', '#f59e0b');
    sign.position.set(0, 3.6, -0.8);
    if (nm.includes('高雄巨蛋')) {
      const podium = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 2.4), makeWinMat('#334155', '#fde68a')); podium.position.y = 1.4;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.75, roughness: 0.22, flatShading: true }));
      dome.position.set(0, 2.8, 0.15);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.12, 6, 20), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7' }));
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 2.85, 0.15);
      g.add(sign, podium, dome, ring);
    } else if (nm.includes('台中七期')) {
      const podium = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.8, 2.4), makeWinMat('#1e293b', '#fde047')); podium.position.y = 0.9;
      const tL = new THREE.Mesh(new THREE.BoxGeometry(1.25, 6.4, 1.5), makeWinMat('#334155', '#facc15')); tL.position.set(-0.9, 3.2, 0);
      const tR = new THREE.Mesh(new THREE.BoxGeometry(1.25, 5.6, 1.5), makeWinMat('#475569', '#fde68a')); tR.position.set(0.9, 2.8, 0);
      const sky = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.8), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04' })); sky.position.set(0, 4.4, 0);
      g.add(sign, podium, tL, tR, sky);
    } else {
      const mall = new THREE.Mesh(new THREE.BoxGeometry(3.1, 5.8, 2.2), makeWinMat('#0f172a', '#fde68a')); mall.position.y = 2.9;
      const prow = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.4, 4), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0369a1', metalness: 0.5 }));
      prow.rotation.y = Math.PI / 4; prow.position.set(0, 3.2, 0.85);
      const anchor = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 6, 14), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.7 }));
      anchor.position.set(0, 4.6, 1.25);
      g.add(sign, mall, prow, anchor);
    }
    g.userData.baseScale = 0.96;
  } else if (t.subkind === 'arcade') {
    // 遊樂場：巨型動畫摩天輪（r=2.1 at y=3.5＋8節彩色車廂）＋G5自由落體高塔（h=5.6）＋過山車環＋霓虹招牌
    const sign = makeNeonSign('歡樂遊樂', '#172554', '#06b6d4');
    sign.position.set(0, 1.2, -1.0);
    const wheelG = new THREE.Group();
    wheelG.position.set(-0.4, 3.5, 0.35);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.14, 8, 20), new THREE.MeshStandardMaterial({ color: '#f43f5e', emissive: '#be123c', emissiveIntensity: 0.45 }));
    wheelG.add(rim);
    const carCols = ['#facc15', '#38bdf8', '#22c55e', '#f472b6', '#fb923c', '#a855f7', '#ef4444', '#2dd4bf'];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), new THREE.MeshStandardMaterial({ color: carCols[k], emissive: carCols[k], emissiveIntensity: 0.25 }));
      pod.position.set(Math.cos(a) * 2.1, Math.sin(a) * 2.1, 0);
      wheelG.add(pod);
    }
    animProps.push(now => { wheelG.rotation.z = now * 0.0012; });
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.05, 3.5, 4), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    stand.position.set(-0.4, 1.75, 0.35);
    const dropTower = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.6, 0.55), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207' }));
    dropTower.position.set(1.35, 2.8, -0.2);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 6, 14), new THREE.MeshStandardMaterial({ color: '#38bdf8' }));
    loop.position.set(0.95, 1.15, 0.85);
    g.add(sign, wheelG, stand, dropTower, loop);
    g.userData.baseScale = 0.95;
  } else if (t.subkind === 'hotel') {
    // 連鎖度假／溫泉飯店（h = 5.4..5.8＋發光窗帶＋冠頂＋藍寶石泳池或冒煙石湯池＋拱橋）
    const sign = makeNeonSign(nm.includes('溫泉') ? '溫泉飯店' : '連鎖飯店', '#0c4a6e', '#38bdf8');
    sign.position.set(0, 2.8, -0.85);
    const isOnsen = nm.includes('溫泉');
    const hotel = new THREE.Mesh(new THREE.BoxGeometry(2.8, isOnsen ? 5.4 : 5.8, 1.85), makeWinMat(isOnsen ? '#78350f' : '#0284c7', '#fef08a'));
    hotel.position.set(0, isOnsen ? 2.7 : 2.9, -0.2);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.45 }));
    crown.rotation.y = Math.PI / 4; crown.position.set(0, isOnsen ? 5.85 : 6.25, -0.2);
    if (isOnsen || nm.includes('礁溪')) {
      const poolRim = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.45, 12), new THREE.MeshStandardMaterial({ color: '#57534e' })); poolRim.position.set(0, 0.22, 1.15);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.48, 12), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.4 })); water.position.set(0, 0.24, 1.15);
      const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.11, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#b45309' })); bridge.position.set(0, 0.45, 1.15);
      const steam = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: true, opacity: 0.65 })); steam.position.set(-0.35, 1.05, 1.15);
      animProps.push(now => { steam.position.y = 1.05 + Math.sin(now * 0.003) * 0.25; });
      g.add(poolRim, water, bridge, steam);
    } else {
      const pool = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.95), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.35 }));
      pool.position.set(0, 0.11, 1.18); g.add(pool);
    }
    g.add(sign, hotel, crown);
    g.userData.baseScale = 0.95;
  } else if (t.subkind === 'food') {
    // 美食夜市：高聳夜市大牌樓（h=4.2）＋雙層美食館（h=3.2）＋紅燈籠＋在地特色美食巨雕
    const sign = makeNeonSign(nm.slice(0, 4), '#450a0a', '#fb923c');
    sign.position.set(0, 0.7, -0.85);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 1.45), makeWinMat('#991b1b', '#fde047')); hall.position.set(-0.2, 1.6, -0.2);
    const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.95, 4), new THREE.MeshStandardMaterial({ color: '#d97706' }));
    gateRoof.rotation.y = Math.PI / 4; gateRoof.scale.set(1.3, 1, 0.8); gateRoof.position.set(-0.2, 3.68, -0.2);
    for (const lx of [-0.9, 0, 0.9]) {
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ea580c', emissiveIntensity: 0.75 }));
      lan.position.set(lx, 2.25, 0.65); g.add(lan);
    }
    if (nm.includes('東港')) {
      const tuna = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.75, 8), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.65 }));
      tuna.rotation.z = -0.95; tuna.position.set(1.15, 1.45, 0.85); g.add(tuna);
    } else if (nm.includes('台南')) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.45, 0.75, 10), new THREE.MeshStandardMaterial({ color: '#ca8a04', metalness: 0.6 }));
      pot.position.set(1.05, 0.4, 0.9); g.add(pot);
    } else if (nm.includes('新竹')) {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f8fafc' }));
      bowl.position.set(1.05, 0.72, 0.85); g.add(bowl);
    } else if (nm.includes('羅東')) {
      const steamer = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 1.35, 10), new THREE.MeshStandardMaterial({ color: '#d97706' }));
      steamer.position.set(1.05, 0.68, 0.85); g.add(steamer);
    } else if (nm.includes('花蓮')) {
      const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 2.1, 8), new THREE.MeshStandardMaterial({ color: '#16a34a' }));
      bamboo.position.set(1.05, 1.05, 0.85); g.add(bamboo);
    } else if (nm.includes('墾丁')) {
      const cup = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.25, 8), new THREE.MeshStandardMaterial({ color: '#ec4899' }));
      cup.rotation.x = Math.PI; cup.position.set(1.05, 1.0, 0.85); g.add(cup);
    } else if (nm.includes('中央')) {
      const ice = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 8), new THREE.MeshStandardMaterial({ color: '#f43f5e' }));
      ice.position.set(1.05, 0.85, 0.85); g.add(ice);
    } else {
      const jar = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.5 }));
      jar.scale.set(1, 1.25, 1); jar.position.set(1.05, 0.68, 0.85); g.add(jar);
    }
    g.add(sign, hall, gateRoof);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'jail') {
    g.userData.baseScale = 1.45;
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.4), new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.75 })); body.position.set(0, 1.4, -0.2);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 2.6), new THREE.MeshStandardMaterial({ color: '#334155' })); roof.position.set(0, 2.95, -0.2);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 4.6, 8), new THREE.MeshStandardMaterial({ color: '#475569' })); tower.position.set(1.55, 2.3, 0.85);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), new THREE.MeshStandardMaterial({ color: '#f97316', emissive: '#ea580c' })); beacon.position.set(1.55, 4.85, 0.85);
    g.add(body, roof, tower, beacon);
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.0, 6), new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.8 }));
      bar.position.set(k * 0.58, 1.5, 1.05); g.add(bar);
    }
  } else if (t.type === 'gojail') {
    const sign = makeNeonSign('警察局', '#0f172a', '#3b82f6'); sign.position.set(0, 1.1, -0.75);
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 1.9), makeWinMat('#1e293b', '#93c5fd')); booth.position.y = 1.4;
    const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#b91c1c' })); l1.position.set(-0.55, 3.1, 0);
    const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#1d4ed8' })); l2.position.set(0.55, 3.1, 0);
    g.add(sign, booth, l1, l2);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'park' || nm === '陽明山公園') {
    // 陽明山公園：繽紛花鐘圓丘＋小油坑冒煙火山硫磺岩＋木造涼亭（y ~ 4.2）
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.65, 16), new THREE.MeshStandardMaterial({ color: '#16a34a' })); mound.position.set(0.75, 0.32, 0.35);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.16, 16), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); dial.position.set(0.75, 0.68, 0.35); dial.rotation.x = 0.2;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.65), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); hand.position.set(0.75, 0.78, 0.35);
    animProps.push(now => { hand.rotation.y = now * 0.0012; });
    const volcano = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.5, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#6b7280', flatShading: true })); volcano.position.set(-0.95, 1.3, -0.35);
    const sulfur = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.55, 6), new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#713f12' })); sulfur.position.set(-0.95, 2.75, -0.35);
    const steam = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: true, opacity: 0.65 })); steam.position.set(-0.95, 3.55, -0.35);
    animProps.push(now => { steam.position.y = 3.55 + Math.sin(now * 0.003) * 0.32; });
    g.add(mound, dial, hand, volcano, sulfur, steam);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'tax') {
    // 國稅局金幣銀庫大樓（y ~ 4.6）
    const sign = makeNeonSign('國稅局', '#1e293b', '#facc15'); sign.position.set(0, 1.0, -0.8);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.9, 1.9), makeWinMat('#475569', '#fde047')); b.position.y = 1.45;
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.3, 14), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', metalness: 0.75 }));
    coin.rotation.x = Math.PI / 2; coin.position.y = 3.75;
    animProps.push(now => { coin.rotation.z = now * 0.002; });
    g.add(sign, b, coin);
    g.userData.baseScale = 0.94;
  } else if (nm === '桃園機場') {
    const twr = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.65, 4.6, 8), new THREE.MeshStandardMaterial({ color: '#cbd5e1' })); twr.position.set(-1.0, 2.3, -0.35);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.28, 0.16), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7' })); radar.position.set(-1.0, 4.85, -0.35);
    animProps.push(now => { radar.rotation.y = now * 0.004; });
    const plane = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); plane.rotation.z = -Math.PI / 2; plane.position.set(0.7, 2.2, 0.45);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 2.6), new THREE.MeshStandardMaterial({ color: '#0ea5e9' })); wing.position.set(0.7, 2.2, 0.45);
    g.add(twr, radar, plane, wing);
    g.userData.baseScale = 0.95;
  } else if (nm === '基隆港') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 1.4), new THREE.MeshStandardMaterial({ color: '#1e3a5f' })); hull.position.set(-0.2, 0.5, 0.2);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.9), new THREE.MeshStandardMaterial({ color: '#f97316' })); cargo.position.set(0.2, 1.38, 0.2);
    const crane = new THREE.Mesh(new THREE.BoxGeometry(0.42, 4.8, 0.42), new THREE.MeshStandardMaterial({ color: '#ef4444' })); crane.position.set(1.25, 2.4, -0.25);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 0.28), new THREE.MeshStandardMaterial({ color: '#f97316' })); boom.position.set(0.4, 4.65, -0.25);
    g.add(hull, cargo, crane, boom);
    g.userData.baseScale = 0.95;
  } else if (nm === '高鐵左營') {
    const sign = makeNeonSign('高鐵左營', '#1e293b', '#f97316'); sign.position.set(0, 1.1, -0.85);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.0, 1.85), makeWinMat('#475569', '#bae6fd')); hall.position.y = 1.0;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.7, 8, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#e2e8f0' }));
    canopy.rotation.z = Math.PI / 2; canopy.scale.set(0.55, 1, 0.75); canopy.position.y = 2.15;
    const train = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.6, 0.82), new THREE.MeshStandardMaterial({ color: '#ffffff' })); train.position.set(0, 0.55, 1.05);
    g.add(sign, hall, canopy, train);
    g.userData.baseScale = 0.95;
  } else if (nm === '台中高鐵') {
    const sign = makeNeonSign('台中高鐵', '#1e293b', '#f97316'); sign.position.set(0, 1.1, -0.85);
    const st = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 1.95), makeWinMat('#334155', '#fde68a')); st.position.y = 1.05;
    for (const ax of [-0.9, 0.9]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: '#f97316' }));
      arch.rotation.y = Math.PI / 2; arch.position.set(ax, 1.45, 0); g.add(arch);
    }
    g.add(sign, st);
    g.userData.baseScale = 0.95;
  } else if (nm === '頭城烏石港' || nm === '馬公港' || nm === '水頭碼頭' || nm === '料羅灣碼頭') {
    // 漁港／離島碼頭：純白雙層渡輪＋高聳海港燈塔（y ~ 4.5）
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.78, 1.15), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); hull.position.set(-0.25, 0.4, 0.35);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.85, 0.9), makeWinMat('#0284c7', '#fef08a')); cabin.position.set(-0.25, 1.15, 0.35);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.8, 8), new THREE.MeshStandardMaterial({ color: nm === '馬公港' ? '#dc2626' : '#0ea5e9' }));
    beacon.position.set(1.25, 1.9, -0.5);
    const topL = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b' }));
    topL.position.set(1.25, 4.1, -0.5);
    g.add(hull, cabin, beacon, topL);
    g.userData.baseScale = 0.94;
  } else if (t.type === 'chance' || t.type === 'fate') {
    // 8 處機會／命運結合在地風景微縮＋頂部高懸旋轉機率結晶（y ~ 4.3）
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.68, 0),
      new THREE.MeshStandardMaterial({ color: t.type === 'chance' ? '#f59e0b' : '#3b82f6', emissive: t.type === 'chance' ? '#92400e' : '#1e3a8a', roughness: 0.25 })
    );
    gem.position.y = 3.65; g.add(gem);
    animProps.push(now => { gem.rotation.y = now * 0.0025; gem.position.y = 3.55 + Math.sin(now * 0.004) * 0.25; });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#334155' }));
    ped.position.set(0, 1.1, -0.75); g.add(ped);
    const cfOrder = R.BOARD.slice(0, idx).filter(x => x.type === 'chance' || x.type === 'fate').length;
    if (cfOrder === 0) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 6, 16), new THREE.MeshStandardMaterial({ color: '#fb7185' })); arch.position.y = 1.1; g.add(arch);
    } else if (cfOrder === 1) {
      const salt = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.2, 4), new THREE.MeshStandardMaterial({ color: '#f8fafc', flatShading: true })); salt.rotation.y = Math.PI / 4; salt.position.y = 1.1; g.add(salt);
    } else if (cfOrder === 2) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.52, 2.5, 8), new THREE.MeshStandardMaterial({ color: '#ef4444' })); tower.position.set(-0.55, 1.25, 0.35); g.add(tower);
    } else if (cfOrder === 3) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 0.75), new THREE.MeshStandardMaterial({ color: '#b45309' })); wall.position.y = 0.9; g.add(wall);
    } else if (cfOrder === 4) {
      const pav = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.0, 6), new THREE.MeshStandardMaterial({ color: '#059669' })); pav.position.y = 1.9; g.add(pav);
    } else if (cfOrder === 5) {
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.8, 5), new THREE.MeshStandardMaterial({ color: '#64748b', flatShading: true })); c1.position.set(-0.3, 1.4, -0.1); g.add(c1);
    } else if (cfOrder === 6) {
      const tr = tree(1.15, '#16a34a'); tr.position.set(0.35, 0.1, 0.35); g.add(tr);
    } else {
      const stele = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 2.6, 6), new THREE.MeshStandardMaterial({ color: '#e2e8f0' })); stele.position.y = 1.3; g.add(stele);
    }
    g.userData.baseScale = 0.92;
  } else if (nm === '雲林' || nm === '雲林斗六') {
    // 西螺紅橋＋斗六水果鐘塔（y ~ 4.2）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 0.95), new THREE.MeshStandardMaterial({ color: '#94a3b8' })); deck.position.set(0, 0.65, 0.45); g.add(deck);
    for (const ax of [-0.95, 0, 0.95]) {
      const span = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.1, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#dc2626' }));
      span.position.set(ax, 0.8, 0.45); g.add(span);
    }
    const clockT = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 3.6, 8), new THREE.MeshStandardMaterial({ color: '#facc15' })); clockT.position.set(0, 1.8, -0.65);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), new THREE.MeshStandardMaterial({ color: '#fb923c' })); orb.position.set(0, 3.85, -0.65);
    g.add(clockT, orb);
    g.userData.baseScale = 0.92;
  } else if (nm === '南投') {
    // 南投清境歐式鐘樓城堡（y ~ 4.6）＋綠丘綿羊
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 1.5), new THREE.MeshStandardMaterial({ color: '#fef3c7' })); cabin.position.set(-0.35, 1.1, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 1.6, 4), new THREE.MeshStandardMaterial({ color: '#dc2626' })); roof.rotation.y = Math.PI / 4; roof.position.set(-0.35, 3.0, 0);
    const steeple = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.0, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc' })); steeple.position.set(0.95, 2.5, -0.35);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.05, 8), new THREE.MeshStandardMaterial({ color: '#b91c1c' })); cap.position.set(0.95, 4.0, -0.35);
    const sheep = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), new THREE.MeshStandardMaterial({ color: '#ffffff' })); sheep.scale.set(1.3, 0.9, 0.9); sheep.position.set(1.0, 0.36, 0.6);
    g.add(cabin, roof, steeple, cap, sheep);
    g.userData.baseScale = 0.92;
  } else if (nm === '吉貝沙尾') {
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.65, 0.22, 14), new THREE.MeshStandardMaterial({ color: '#fde68a' })); sand.scale.set(1.3, 1, 0.75); sand.position.y = 0.11;
    const sail1 = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.9, 4), new THREE.MeshStandardMaterial({ color: '#ec4899' })); sail1.scale.set(0.25, 1, 0.85); sail1.position.set(-0.35, 2.1, 0);
    const sail2 = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.8, 4), new THREE.MeshStandardMaterial({ color: '#38bdf8' })); sail2.scale.set(0.25, 1, 0.85); sail2.position.set(0.65, 1.5, 0.35);
    const palm = palmTree(0.75); palm.position.set(-1.1, 0, -0.3);
    g.add(sand, sail1, sail2, palm);
    g.userData.baseScale = 0.92;
  } else if (nm === '太麻里') {
    const redM = new THREE.MeshStandardMaterial({ color: '#dc2626' });
    for (const px of [-0.95, 0.95]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8), redM); p.position.set(px, 1.8, 0); g.add(p); }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.38, 0.34), redM); beam.position.y = 3.75;
    const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ea580c', emissiveIntensity: 0.75 })); sunOrb.position.set(0, 2.2, -0.55);
    g.add(beam, sunOrb);
    g.userData.baseScale = 0.92;
  } else if (nm === '佳樂水') {
    const rockM = new THREE.MeshStandardMaterial({ color: '#a8a29e', flatShading: true });
    for (const [rx, h, rz, s] of [[-0.85, 2.6, 0, 1], [0.25, 4.1, -0.3, 1.25], [1.05, 2.1, 0.3, 0.85]]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.36 * s, 0.62 * s, h, 6), rockM);
      r.position.set(rx, h / 2, rz); g.add(r);
    }
    g.userData.baseScale = 0.92;
  } else {
    // 其他特色景點／城鎮（高聳海景觀測燈塔＋波浪基座）
    const wave = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, 0.24, 16), new THREE.MeshStandardMaterial({ color: '#0284c7' })); wave.position.y = 0.12;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.55, 3.5, 8), new THREE.MeshStandardMaterial({ color: '#1e3a8a' })); stem.position.set(0, 1.85, 0);
    const fluke = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.34, 0.68), new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.35 })); fluke.position.set(0, 3.25, 0);
    const topL = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b' })); topL.position.set(0, 3.9, 0);
    g.add(wave, stem, fluke, topL);
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

// 棋格立體造景：4 倍佔地（半徑 11.2）＋組別色環＋主題地面＋誇張 3D 特色建物與霓虹看板
const LM_OFF = new THREE.Vector3(-3.6, 0, -4.6);   // 地標位置（棋格後方偏左）
const HOUSE_OFF = new THREE.Vector3(4.8, 0, -4.4); // 地產建築（後方偏右）
function tileTheme(t, i) {
  if (t.type === 'temple') return 'temple';
  if (t.type === 'shop' || t.type === 'cardshop' || t.type === 'minigame' || t.subkind === 'food' || t.subkind === 'arcade') return 'market';
  if (t.type === 'station' || t.type === 'stock' || t.type === 'autoshow' || t.subkind === 'mall' || URBAN_TILES.has(t.name)) return 'urban';
  if (COAST_TILES.has(t.name) || t.subkind === 'port' || t.type === 'casino' || !TILE_MAIN[i]) return 'coast';
  if (TILE_ELEV[i] > 6 || t.type === 'park' || ['拉拉山', '明池', '谷關溫泉', '梨山', '合歡山', '天祥', '梅山', '埡口', '向陽', '阿里山', '太魯閣', '九份山城', '平溪天燈', '三義木雕村', '日月潭', '南投'].includes(t.name)) return 'mountain';
  return 'rural';
}
const THEME_TOP = { urban: '#768393', market: '#7c3f2c', coast: '#e5d49c', mountain: '#567d46', rural: '#7eb352', temple: '#d8c5a0' };
const tileBases = [];
function decorateTile(g, theme, i) {
  const rnd = (() => { let s = 977 * (i + 3); return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const at = (x, z) => new THREE.Vector3(x, 0.32, z);
  if (theme === 'urban') {
    // 都會人行道花台樹＋斑馬線＋路燈＋外圍小樓群
    const zebra = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 1.6), zebra); s.position.set(-1.6 + k * 0.8, 0.46, 0.1); g.add(s); }
    const glass = makeWinMat(rnd() > 0.5 ? '#334155' : '#1e3a5f', '#fde68a');
    for (let k = 0; k < 3; k++) {
      const hh = 1.6 + rnd() * 2.8, b = new THREE.Mesh(new THREE.BoxGeometry(1.1, hh, 1.1), glass);
      b.position.set(-4.3 + k * 0.4, 0.39 + hh / 2, -0.9 - k * 1.25); b.castShadow = true; g.add(b);
    }
    const planterM = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.8 });
    for (const [px, pz] of [[7.6, -6.2], [-7.6, 6.2]]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 1.3), planterM); box.position.set(px, 0.58, pz);
      const tr = tree(0.42, '#2f855a'); tr.position.set(px, 0.78, pz); g.add(box, tr);
    }
    for (const [x, z] of [[4.3, 1.4], [-4.3, 2.6]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 6), new THREE.MeshStandardMaterial({ color: '#475569' }));
      pole.position.copy(at(x, z)).setY(1.48); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff7c2', emissive: '#facc15', emissiveIntensity: 0.8 }));
      lamp.position.copy(pole.position).setY(2.62); g.add(pole, lamp);
    }
  } else if (theme === 'market') {
    // 夜市節慶廣場：發光霓虹鑲邊條＋紅燈籠柱
    const neonCol = i % 2 ? '#fb7185' : '#f59e0b';
    const stripM = new THREE.MeshStandardMaterial({ color: neonCol, emissive: neonCol, emissiveIntensity: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const sz of [-TILE_R * 0.68, TILE_R * 0.68]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(TILE_R * 1.15, 0.14, 0.2), stripM); strip.position.set(0, 0.44, sz); g.add(strip);
    }
    for (const [lx, lz] of [[-5.6, 4.2], [5.6, 4.2], [-5.6, -4.2], [5.6, -4.2]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.1, 6), new THREE.MeshStandardMaterial({ color: '#78350f' }));
      post.position.set(lx, 1.32, lz);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 0.8 }));
      lan.scale.y = 1.25; lan.position.set(lx, 2.45, lz); g.add(post, lan);
    }
  } else if (theme === 'coast') {
    // 珊瑚礁淺海灣＋木棧碼頭＋纜樁＋椰樹＋礁岩
    const bay = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.72, TILE_R * 0.75, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#14b8a6', roughness: 0.18, metalness: 0.18, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    bay.scale.set(1.05, 1, 0.65); bay.position.set(-2.4, 0.42, 3.1); g.add(bay);
    const woodM = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.85 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 6.4), woodM);
    pier.position.set(-2.6, 0.54, 5.2); pier.castShadow = true; g.add(pier);
    for (const pz of [3.2, 5.4, 7.6]) {
      for (const px of [-3.45, -1.75]) {
        const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.95, 6), woodM);
        pile.position.set(px, 0.68, pz); g.add(pile);
      }
    }
    const p1 = palmTree(0.95); p1.position.set(5.2, 0.36, -1.8); g.add(p1);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: '#6b7280', flatShading: true }));
    rock.position.set(-5.6, 0.62, -1.4); rock.scale.set(1.25, 0.8, 1); g.add(rock);
  } else if (theme === 'mountain') {
    // 山岳岩棚＋木欄杆＋針葉松林
    for (let k = 0; k < 4; k++) { const tr = tree(0.5 + rnd() * 0.22, k % 2 ? '#1f5c33' : '#2b7040'); tr.position.set(4.8 - k * 0.7, 0.38, -2.5 + k * 1.45); g.add(tr); }
    const crag = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.7, 5), new THREE.MeshStandardMaterial({ color: '#6b6f66', flatShading: true }));
    crag.position.set(-5.2, 1.52, 1.5); crag.castShadow = true; g.add(crag);
    const railM = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.9 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 0.14), railM); rail.position.set(0, 0.78, 6.8); g.add(rail);
    for (const rx of [-3.0, 0, 3.0]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), railM); p.position.set(rx, 0.54, 6.8); g.add(p); }
  } else if (theme === 'rural') {
    // 藍色彎曲水圳＋小木拱橋＋層層稻田＋遮蔭大樹
    const canalM = new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.2, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 1.35), canalM); c1.position.set(-1.5, 0.42, 4.2); c1.rotation.y = 0.18;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.06, 1.25), canalM); c2.position.set(4.8, 0.435, 2.4); c2.rotation.y = -0.28;
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: '#92400e' }));
    bridge.rotation.y = Math.PI / 2; bridge.position.set(0.2, 0.44, 4.0);
    g.add(c1, c2, bridge);
    const rice = new THREE.MeshStandardMaterial({ color: '#a7cf61', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.52), rice); r.position.set(-4.2, 0.43, -0.4 + k * 0.78); g.add(r); }
    const tr = tree(0.75, '#3f8a3a'); tr.position.set(5.2, 0.38, -1.6); g.add(tr);
  } else if (theme === 'temple') {
    // 廟埕階梯＋雙龍燈柱＋中央青銅天公香爐
    const stepM = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.85 });
    for (let s = 0; s < 3; s++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(5.2 - s * 0.5, 0.22, 1.1), stepM);
      st.position.set(0, -0.05 + s * 0.22, 8.1 - s * 0.75); g.add(st);
    }
    for (const x of [-4.6, 4.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#b91c1c' }));
      col.position.set(x, 1.56, 3.6);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#991b1b', emissiveIntensity: 0.7 }));
      lan.position.set(x, 2.91, 3.6); lan.scale.y = 1.25; g.add(col, lan);
    }
    const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.82, 10), new THREE.MeshStandardMaterial({ color: '#b45309', metalness: 0.65, roughness: 0.35 }));
    censer.position.set(0, 0.88, 4.6); g.add(censer);
  }
}
function makeTileBase(t, i) {
  const g = new THREE.Group();
  const gc = t.group ? R.GROUPS[t.group].color : (TYPE_STYLE[t.type]?.[1] || '#94a3b8');
  const theme = tileTheme(t, i);
  const ts = tileScale(t, i);
  const rimPo = { polygonOffset: true, polygonOffsetFactor: -1 - (i % 5), polygonOffsetUnits: -2 - (i % 5) * 2 };
  const topPo = { polygonOffset: true, polygonOffsetFactor: -(i % 4), polygonOffsetUnits: -(i % 4) * 2 };
  const roadPo = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
  let stone, top;
  if (theme === 'urban') {
    // 都會／交通樞紐：多層階梯矩形街區＋人行道鑲邊＋十字馬路＋外圍街廓
    const w = TILE_R * 2.08, d = TILE_R * 1.84;
    stone = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 3.0, d + 0.8), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.85 }));
    stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.24, d + 0.35), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.22, roughness: 0.45, ...rimPo }));
    curb.position.y = 0.09;
    top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.16, d - 0.3), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.88, ...topPo }));
    top.position.y = 0.31; top.receiveShadow = true;
    const roadM = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.9, ...roadPo });
    const rx = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.05, 1.35), roadM); rx.position.y = 0.42;
    const rz = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, d - 0.4), roadM); rz.position.y = 0.435;
    g.add(rx, rz);
    if (ts >= 1.15) {
      const bMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.65 });
      const winMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', emissive: '#fde047', emissiveIntensity: 0.18 });
      for (const [bx, bz, bw, bh, bd] of [[-w * 0.41, d * 0.35, 1.3, 1.9, 1.1], [w * 0.41, d * 0.35, 1.4, 2.3, 1.2], [-w * 0.41, -d * 0.35, 1.2, 1.6, 1.1]]) {
        const blk = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bMat); blk.position.set(bx, 0.4 + bh * 0.5, bz); blk.castShadow = true;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.82, 0.22, bd * 0.82), winMat); cap.position.set(bx, 0.42 + bh, bz);
        g.add(blk, cap);
      }
    }
    for (const [cx, cz] of [[-w * 0.47, -d * 0.47], [w * 0.47, -d * 0.47], [-w * 0.47, d * 0.47], [w * 0.47, d * 0.47]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.72, 0.45), new THREE.MeshStandardMaterial({ color: gc, roughness: 0.5 }));
      post.position.set(cx, 0.56, cz); post.castShadow = true; g.add(post);
    }
    g.add(stone, curb, top);
  } else if (theme === 'market') {
    // 夜市／節慶商街：十字交錯階梯紅磚廣場＋中央圓形舞台鑲嵌
    const w = TILE_R * 1.95, d = TILE_R * 1.42;
    stone = new THREE.Mesh(new THREE.BoxGeometry(w, 3.0, d), new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.85 }));
    stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const crossStone = new THREE.Mesh(new THREE.BoxGeometry(d, 3.0, w), new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.85 }));
    crossStone.position.y = -1.58; crossStone.castShadow = true; crossStone.receiveShadow = true;
    const rim1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.24, d + 0.2), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.25, ...rimPo })); rim1.position.y = 0.09;
    const rim2 = new THREE.Mesh(new THREE.BoxGeometry(d + 0.2, 0.24, w + 0.2), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.25, ...rimPo })); rim2.position.y = 0.11;
    top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.35, 0.16, d - 0.35), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.88, ...topPo }));
    top.position.y = 0.31; top.receiveShadow = true;
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(d - 0.35, 0.16, w - 0.35), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.88, ...topPo }));
    top2.position.y = 0.33; top2.receiveShadow = true;
    const inset = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.56, TILE_R * 0.6, 0.10, 20), new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.78 }));
    inset.position.y = 0.42;
    g.add(stone, crossStone, rim1, rim2, top, top2, inset);
  } else if (theme === 'coast') {
    // 海濱沙洲／離島環礁：雙重錯位有機橢圓沙洲平台
    stone = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.92, TILE_R * 1.05, 3.0, 18), new THREE.MeshStandardMaterial({ color: '#c2a773', roughness: 0.88 }));
    stone.scale.set(1.25, 1, 0.88); stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const shoal2 = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.85, TILE_R * 0.95, 3.0, 16), new THREE.MeshStandardMaterial({ color: '#b59760', roughness: 0.9 }));
    shoal2.scale.set(0.85, 1, 0.75); shoal2.position.set(2.4, -1.62, -1.8); shoal2.castShadow = true; shoal2.receiveShadow = true;
    top = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.88, TILE_R * 0.9, 0.16, 18), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.92, ...topPo }));
    top.scale.set(1.25, 1, 0.88); top.position.y = 0.31; top.receiveShadow = true;
    const top2 = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.82, TILE_R * 0.84, 0.16, 16), new THREE.MeshStandardMaterial({ color: '#ebd9a2', roughness: 0.92, ...topPo }));
    top2.scale.set(0.85, 1, 0.75); top2.position.set(2.4, 0.25, -1.8); top2.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TILE_R * 0.9, 0.14, 6, 24), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.22, ...rimPo }));
    ring.rotation.x = Math.PI / 2; ring.scale.set(1.25, 0.88, 1); ring.position.y = 0.16;
    g.add(stone, shoal2, top, top2, ring);
  } else if (theme === 'mountain') {
    // 高山岩盤：非對稱岩塊底座＋錯位山岩階台
    stone = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.96, TILE_R * 1.15, 3.0, 7), new THREE.MeshStandardMaterial({ color: '#6b7280', flatShading: true, roughness: 0.92 }));
    stone.scale.set(1.12, 1, 0.94); stone.rotation.y = 0.3; stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const shelf = new THREE.Mesh(new THREE.DodecahedronGeometry(TILE_R * 0.65, 0), new THREE.MeshStandardMaterial({ color: '#57534e', flatShading: true, roughness: 0.95 }));
    shelf.scale.set(1.25, 0.45, 0.95); shelf.position.set(-2.8, -0.55, -2.0); shelf.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.98, TILE_R * 0.98, 0.24, 7, 1, true), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.2, ...rimPo }));
    rim.scale.set(1.12, 1, 0.94); rim.rotation.y = 0.3; rim.position.y = 0.09;
    top = new THREE.Mesh(new THREE.CylinderGeometry(TILE_R * 0.92, TILE_R * 0.94, 0.16, 7), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.92, ...topPo }));
    top.scale.set(1.12, 1, 0.94); top.rotation.y = 0.3; top.position.y = 0.31; top.receiveShadow = true;
    g.add(stone, shelf, rim, top);
  } else if (theme === 'temple') {
    // 傳統廟宇雙層石台基座
    const w = TILE_R * 1.98, d = TILE_R * 1.72;
    stone = new THREE.Mesh(new THREE.BoxGeometry(w, 3.0, d), new THREE.MeshStandardMaterial({ color: '#d6d3d1', roughness: 0.85 }));
    stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.22, d * 0.84), new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: 0.65 }));
    tier2.position.y = 0.30; tier2.castShadow = true;
    top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.12, d * 0.8), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.88, ...topPo }));
    top.position.y = 0.46; top.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, 0.24, d + 0.15), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.22, ...rimPo }));
    rim.position.y = 0.09;
    g.add(stone, rim, tier2, top);
  } else {
    // 鄉鎮農田階梯綠地台座
    const w = TILE_R * 1.88, d = TILE_R * 1.68;
    stone = new THREE.Mesh(new THREE.BoxGeometry(w, 3.0, d), new THREE.MeshStandardMaterial({ color: '#a89f81', roughness: 0.88 }));
    stone.position.y = -1.55; stone.castShadow = true; stone.receiveShadow = true;
    const subTerrace = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 2.8, d * 0.55), new THREE.MeshStandardMaterial({ color: '#8f9e66', roughness: 0.9 }));
    subTerrace.position.set(2.8, -1.60, 2.6);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.24, d + 0.16), new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.18, ...rimPo }));
    rim.position.y = 0.09;
    top = new THREE.Mesh(new THREE.BoxGeometry(w - 0.25, 0.16, d - 0.25), new THREE.MeshStandardMaterial({ color: THEME_TOP[theme], roughness: 0.92, ...topPo }));
    top.position.y = 0.31; top.receiveShadow = true;
    g.add(stone, subTerrace, rim, top);
  }
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
  sp.scale.set(cw * 0.0325, ch * 0.0325, 1); // 地點字型放大成 1.3 倍
  sp.userData.tileIdx = idx;
  return sp;
}

(function buildBoard() {
  buildTaiwanIsland();

  R.BOARD.forEach((t, i) => {
    const p = tilePos(i);
    const ts = tileScale(t, i);
    const bts = tileBaseScale(t, i);
    const base = makeTileBase(t, i);
    base.position.copy(p);
    base.scale.set(bts, 1, bts);
    board.add(base);

    const prop = makeTileProp(t, i);
    if (prop.children.length) {
      prop.position.set(p.x + LM_OFF.x * bts, p.y + 0.32, p.z + LM_OFF.z * bts);
      const bs = (prop.userData.baseScale || 0.92) * 2.25 * (0.55 + bts * 0.45);
      prop.userData.baseScale = bs;
      prop.scale.setScalar(bs);
      board.add(prop);
      tileProps[i] = prop;
    }

    const sp = makeLabelSprite(t, i);
    sp.position.set(p.x, p.y + 16, p.z);
    labelGroup.add(sp);
    tileLabels[i] = sp;
  });
})();

// ---------- 精細 5 階地產建築（已購空地 → 一樓平房 → 二樓透天 → 高層大樓 → 超級摩天大樓）----------
const buildG = new THREE.Group();
scene.add(buildG);
const branchGroup = new THREE.Group();
scene.add(branchGroup);
const branchHits = [], branchAnimNodes = [];
let branchKey = '';
function syncBranchMarkers() {
  const show = Boolean(G && G.ask && G.ask.k === 'branch' && mine(G.cur) && !isMoving());
  const key = show ? `${G.turn}:${G.ask.i}:${G.ask.options.map(o => o.to).join(',')}` : '';
  const banner = $('#branchBanner');
  if (banner) {
    if (show) {
      const jt = R.BOARD[G.ask.i];
      const rem = G.ask.rem != null ? `（還剩 <b>${G.ask.rem}</b> 步）` : '';
      banner.innerHTML = `<div class="bb-t">🔀 來到「${jt.name}」交會口${rem}</div>
        <div class="bb-s">請直接點擊地圖上發光的方向箭頭或目標格點選擇路線：${G.ask.options.map(o => `<b>${o.route ? `${o.route}→` : ''}${o.name}</b>`).join(' ／ ')}</div>`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }
  if (key === branchKey) return;
  branchKey = key;
  branchGroup.clear();
  branchHits.length = 0;
  branchAnimNodes.length = 0;
  if (!show) return;
  const fromPos = tilePos(G.ask.i);
  const cols = ['#38bdf8', '#facc15', '#34d399'];
  G.ask.options.forEach((opt, idx) => {
    const col = cols[idx % cols.length];
    const p = tilePos(opt.to);
    const ts = tileBaseScale(R.BOARD[opt.to], opt.to);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TILE_R * ts + 0.55, TILE_R * ts + 1.65, 24),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, p.y + 0.52, p.z);
    branchGroup.add(ring);

    const arrowGrp = new THREE.Group();
    arrowGrp.position.set(p.x, p.y + 7.2, p.z);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.75, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.75, roughness: 0.25 })
    );
    cone.rotation.x = Math.PI;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: col, emissiveIntensity: 0.45 })
    );
    shaft.position.y = 2.1;
    arrowGrp.add(cone, shaft);
    branchGroup.add(arrowGrp);

    const dir = new THREE.Vector3(p.x - fromPos.x, 0, p.z - fromPos.z);
    const len = dir.length();
    if (len > 1) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.25, Math.max(2, len - TILE_R * 1.4)),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 })
      );
      beam.position.set((fromPos.x + p.x) * 0.5, Math.max(fromPos.y, p.y) + 0.55, (fromPos.z + p.z) * 0.5);
      beam.rotation.y = Math.atan2(dir.x, dir.z);
      branchGroup.add(beam);
    }

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(TILE_R * ts + 1.8, TILE_R * ts + 1.8, 13, 12),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(p.x, p.y + 5.5, p.z);
    hit.userData.branchTo = opt.to;
    branchGroup.add(hit);
    branchHits.push(hit);
    branchAnimNodes.push({ ring, arrowGrp, baseY: p.y + 7.2, idx });
  });
}
function stepBranchMarkers(now) {
  if (!branchAnimNodes.length) return;
  for (const n of branchAnimNodes) {
    const s = 1 + Math.sin(now * 0.006 + n.idx) * 0.14;
    n.ring.scale.setScalar(s);
    n.arrowGrp.position.y = n.baseY + Math.sin(now * 0.0055 + n.idx) * 1.25;
    n.arrowGrp.rotation.y = now * 0.0022;
  }
}
let buildKey = '', prevTileLevels = [], activeHouses = [], buildingRise = new Map();

function houseMesh(level, color) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: '#f5ecd9', roughness: 0.78 });
  const brick = new THREE.MeshStandardMaterial({ color: '#b84a39', roughness: 0.85 });
  const roof = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const win = new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#0c4a6e', roughness: 0.22 });
  if (level === 0) {
    // 0級已購空地：整地石基＋四角護柱＋高立建地告示牌
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.3, 3.8), new THREE.MeshStandardMaterial({ color: '#d6ccb5', roughness: 0.9 }));
    pad.position.y = 0.15;
    g.add(pad);
    const bollardMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6 });
    for (const [bx, bz] of [[-1.65, -1.65], [1.65, -1.65], [-1.65, 1.65], [1.65, 1.65]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 8), bollardMat);
      b.position.set(bx, 0.42, bz); g.add(b);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#78350f' }));
    post.position.set(0, 1.1, 0);
    const boardSign = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.98, 0.18), roof);
    boardSign.position.set(0, 1.9, 0);
    g.add(post, boardSign);
  } else if (level === 1) {
    // 1級一樓平房：台灣紅磚三合院（正身＋左右護龍＋前庭矮牆與紅磚院門）
    const main = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.1, 1.65), brick); main.position.set(0, 1.05, -0.45);
    const rMain = new THREE.Mesh(new THREE.ConeGeometry(2.45, 1.2, 4), roof); rMain.position.set(0, 2.5, -0.45); rMain.rotation.y = Math.PI / 4;
    for (const dx of [-1.25, 1.25]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.6, 1.65), brick); wing.position.set(dx, 0.8, 0.65);
      const rW = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.85, 4), roof); rW.position.set(dx, 2.0, 0.65); rW.rotation.y = Math.PI / 4;
      g.add(wing, rW);
    }
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.2), brick); wallL.position.set(-1.1, 0.31, 1.65);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.2), brick); wallR.position.set(1.1, 0.31, 1.65);
    const gateL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.45, 0.26), brick); gateL.position.set(-0.55, 0.725, 1.65);
    const gateR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.45, 0.26), brick); gateR.position.set(0.55, 0.725, 1.65);
    const gateArch = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.32, 0.36), roof); gateArch.position.set(0, 1.55, 1.65);
    g.add(main, rMain, wallL, wallR, gateL, gateR, gateArch);
  } else if (level === 2) {
    // 2級透天別墅：3-4樓雙併騎樓透天＋露台花架＋垂直霓虹招牌
    const woodMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.75 });
    for (const [x, h] of [[-1.08, 4.4], [1.08, 3.8]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.85, h, 2.2), wall); b.position.set(x, h / 2, -0.1);
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.58, 0.8, 4), roof); r.position.set(x, h + 0.4, -0.1); r.rotation.y = Math.PI / 4;
      const bal1 = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.26, 0.46), roof); bal1.position.set(x, h * 0.42, 1.12);
      const bal2 = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.26, 0.46), roof); bal2.position.set(x, h * 0.72, 1.12);
      const pilL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.3, 8), wall); pilL.position.set(x - 0.72, 0.65, 1.25);
      const pilR = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.3, 8), wall); pilR.position.set(x + 0.72, 0.65, 1.25);
      g.add(b, r, bal1, bal2, pilL, pilR);
    }
    const perg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.3), woodMat); perg.position.set(1.08, 4.45, -0.1);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', emissiveIntensity: 0.65 }));
    sign.position.set(-2.22, 2.6, 0.95);
    g.add(perg, sign);
  } else if (level === 3) {
    // 3級摩天大樓：三段退縮式玻璃帷幕地標摩天大樓＋發光霓虹條＋停機坪＋黃金尖塔（最高 y = 20.2）
    const glass = new THREE.MeshStandardMaterial({ color: '#dbeafe', metalness: 0.55, roughness: 0.2 });
    const neon = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', metalness: 0.7, roughness: 0.2 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 4.2), glass); podium.position.y = 1.3;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 1.1), goldMat); canopy.position.set(0, 1.4, 2.3);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(3.3, 7.6, 3.3), glass); mid.position.y = 6.4;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5.2, 2.4), glass); upper.position.y = 12.8;
    g.add(podium, canopy, mid, upper);
    for (let y = 3.1; y < 9.9; y += 1.05) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(3.42, 0.44, 3.42), win); w.position.y = y; g.add(w);
    }
    for (let y = 10.8; y < 15.1; y += 0.98) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.4, 2.52), win); w.position.y = y; g.add(w);
    }
    for (const [cx, cz] of [[-1.68, -1.68], [1.68, -1.68], [-1.68, 1.68], [1.68, 1.68]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.7, 0.2), neon);
      strip.position.set(cx, 6.4, cz); g.add(strip);
    }
    const helipad = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.88, 16), goldMat);
    helipad.rotation.x = -Math.PI / 2; helipad.position.y = 15.44; g.add(helipad);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.3, 1.9), roof); crown.position.y = 16.05; g.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, 2.9, 8), goldMat); spire.position.y = 18.15; g.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 10), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#f59e0b', emissiveIntensity: 0.95 }));
    beacon.position.y = 19.84; g.add(beacon);
    g.userData.beacon = beacon;
  } else if (level === 4) {
    // 4級五星飯店：奢華雙翼度假飯店＋藍寶石泳池＋金冠屋頂＋旋轉金星（最高 y = 17.2）
    const marble = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#b45309', metalness: 0.7, roughness: 0.2 });
    const pool = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.26, 1.75), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0284c7', emissiveIntensity: 0.4 }));
    pool.position.set(0, 0.15, 2.1);
    const main = new THREE.Mesh(new THREE.BoxGeometry(4.8, 13.0, 2.9), marble); main.position.y = 6.5;
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9.2, 2.5), marble); wingL.position.set(-2.95, 4.6, 0.15);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9.2, 2.5), marble); wingR.position.set(2.95, 4.6, 0.15);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 2.45, 1.8, 8), roof); crown.position.y = 13.9;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), goldMat); star.position.y = 16.45;
    g.add(pool, main, wingL, wingR, crown, star);
    for (let y = 1.6; y < 12.2; y += 1.3) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(4.95, 0.48, 3.05), win); band.position.y = y; g.add(band);
    }
    for (let y = 1.6; y < 8.6; y += 1.4) {
      const wL = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 2.62), win); wL.position.set(-2.95, y, 0.15);
      const wR = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.42, 2.62), win); wR.position.set(2.95, y, 0.15);
      g.add(wL, wR);
    }
    g.userData.beacon = star;
  } else if (level >= 5) {
    // 5級連鎖旗艦店：雙子星玻璃巨塔＋雙層高空連通天橋＋頂端皇冠霓虹塔（最高 y = 23.2）
    const glass = new THREE.MeshStandardMaterial({ color: '#e0f2fe', metalness: 0.65, roughness: 0.18 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#ca8a04', metalness: 0.75, roughness: 0.2 });
    const neon = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.78 });
    const podium = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.6, 4.4), neon); podium.position.y = 1.3;
    const tL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 16.5, 2.8), glass); tL.position.set(-1.55, 10.85, 0);
    const tR = new THREE.Mesh(new THREE.BoxGeometry(2.1, 16.5, 2.8), glass); tR.position.set(1.55, 10.85, 0);
    const bridge1 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.7), goldMat); bridge1.position.set(0, 8.8, 0);
    const bridge2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.25, 1.7), goldMat); bridge2.position.set(0, 13.6, 0);
    const topArch = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.2, 2.2), roof); topArch.position.y = 19.7;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.36, 2.2, 8), goldMat); spire.position.y = 21.4;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#f43f5e', emissiveIntensity: 1.0 }));
    beacon.position.y = 22.75;
    g.add(podium, tL, tR, bridge1, bridge2, topArch, spire, beacon);
    for (let y = 3.8; y < 18.6; y += 1.45) {
      const bL = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.44, 2.92), win); bL.position.set(-1.55, y, 0);
      const bR = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.44, 2.92), win); bR.position.set(1.55, y, 0);
      g.add(bL, bR);
    }
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
      const bs = tileProps[i].userData.baseScale || 0.92;
      tileProps[i].scale.setScalar(s.owner != null && s.level > 0 ? bs * 0.9 : bs);
    }
    const p = tilePos(i);
    if (tileLabels[i]) {
      const hOff = s.owner != null && s.level > 0 ? ([17, 17, 19, 27, 30, 35][s.level] || 35) : 17;
      tileLabels[i].position.y = p.y + hOff;
    }
    if (s.owner != null) {
      const col = G.players[s.owner].color;
      const ts = tileBaseScale(R.BOARD[i], i);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(TILE_R * ts - 0.15, TILE_R * ts + 0.6, 8),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
      );
      halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI / 8;
      halo.position.set(p.x, p.y + 0.48, p.z); buildG.add(halo);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8), new THREE.MeshStandardMaterial({ color: '#eee' }));
      const flag = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.85, 0.1), new THREE.MeshStandardMaterial({ color: col }));
      const fx = p.x + 4.3 * ts, fz = p.z - 3.2 * ts;
      pole.position.set(fx, p.y + 1.7, fz); flag.position.set(fx + 0.65, p.y + 2.65, fz);
      buildG.add(pole, flag);
      const h = houseMesh(s.level || 0, col);
      h.position.set(p.x + HOUSE_OFF.x * ts, p.y + 0.32, p.z + HOUSE_OFF.z * ts);
      const baseScale = (s.level >= 3 ? 1.12 : 1.08) * (0.62 + ts * 0.42);
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

// ---------- 各地特產 3D 棋子修飾配件（手持／頭飾／背飾／伴隨）----------
function makeSpecialtyMesh(key) {
  const grp = new THREE.Group();
  const std = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, ...opt });
  if (key === 'bubble_tea') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.21, 0.72, 12), std('#f5deb3', { transparent: true, opacity: 0.9 }));
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.19, 0.56, 12), std('#b47b48'));
    tea.position.y = -0.04;
    const boba = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.18, 10), std('#1c1917'));
    boba.position.y = -0.24;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), std('#ffffff'));
    lid.position.y = 0.37;
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 8), std('#ef4444'));
    straw.position.set(0.06, 0.56, 0); straw.rotation.z = -0.18;
    grp.add(cup, tea, boba, lid, straw);
    grp.position.set(0.05, -0.82, 0.44);
  } else if (key === 'pineapple_cake') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.44), std('#f59e0b'));
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.12), std('#dc2626'));
    ribbon.position.y = 0.13;
    const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6), std('#fde047'));
    tag.position.set(0, 0.18, 0);
    grp.add(box, ribbon, tag);
    grp.position.set(0.06, -0.86, 0.46);
  } else if (key === 'mango_ice') {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.2, 0.24, 12), std('#f8fafc'));
    const ice = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.44, 10), std('#fffbeb'));
    ice.position.y = 0.26;
    for (const [mx, my, mz] of [[-0.14, 0.22, 0.12], [0.14, 0.22, 0.1], [0, 0.3, -0.12], [0.02, 0.46, 0.02]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), std('#facc15', { emissive: '#a16207', emissiveIntensity: 0.2 }));
      m.position.set(mx, my, mz);
      grp.add(m);
    }
    grp.add(bowl, ice);
    grp.position.set(0.06, -0.84, 0.46);
  } else if (key === 'kinmen_kaoliang') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.62, 12), std('#f8fafc'));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.24, 12), std('#2563eb'));
    band.position.y = -0.05;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.22, 10), std('#f8fafc'));
    neck.position.y = 0.4;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10), std('#dc2626'));
    cap.position.y = 0.54;
    grp.add(body, band, neck, cap);
    grp.position.set(0.04, -0.8, 0.42);
  } else if (key === 'yilan_scallion') {
    for (let s = -1; s <= 1; s++) {
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 8), std('#f8fafc'));
      root.position.set(s * 0.1, -0.15, 0);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.65, 8), std('#16a34a'));
      leaf.position.set(s * 0.11, 0.35, 0); leaf.rotation.z = s * -0.12;
      grp.add(root, leaf);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12), std('#ef4444'));
    tie.rotation.x = Math.PI / 2;
    grp.add(tie);
    grp.position.set(0.05, -0.78, 0.42); grp.rotation.x = 0.35;
  } else if (key === 'sun_moon_jade') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 6, 20), std('#b91c1c'));
    band.rotation.x = Math.PI / 2;
    grp.add(band);
    const cols = ['#ef4444', '#facc15', '#38bdf8', '#22c55e', '#facc15', '#ef4444'];
    for (let f = 0; f < cols.length; f++) {
      const ang = (f - (cols.length - 1) / 2) * 0.28;
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.05), std(cols[f]));
      feather.position.set(Math.sin(ang) * 0.85, 0.42, -Math.cos(ang) * 0.4 - 0.1);
      feather.rotation.z = -ang * 0.65;
      grp.add(feather);
    }
    grp.position.set(0, 5.15, 0);
  } else if (key === 'penghu_cactus') {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.3, 10), std('#c2410c'));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.62, 10), std('#15803d'));
    stem.position.y = 0.42;
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 8), std('#16a34a'));
    armL.position.set(-0.22, 0.44, 0); armL.rotation.z = 0.55;
    const armR = armL.clone(); armR.position.x = 0.22; armR.rotation.z = -0.55;
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), std('#e11d48', { emissive: '#9f1239', emissiveIntensity: 0.3 }));
    fruit.position.set(0, 0.78, 0);
    grp.add(pot, stem, armL, armR, fruit);
    grp.position.set(0, 5.38, 0);
  } else if (key === 'alishan_tea') {
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.38, 1.05, 10), std('#b45309'));
    const teaTop = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), std('#15803d'));
    teaTop.scale.set(1, 0.45, 1); teaTop.position.y = 0.5;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.06, 6, 14), std('#78350f'));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.52;
    grp.add(basket, teaTop, rim);
    grp.position.set(0, 2.15, -1.15); grp.rotation.x = 0.14;
  } else if (key === 'hsinchu_wind') {
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.8 }));
    grp.add(core);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.08), std('#0ea5e9', { emissive: '#0369a1', emissiveIntensity: 0.55, transparent: true, opacity: 0.88 }));
      wing.position.set(s * 0.75, 0.18, -0.15);
      wing.rotation.y = s * -0.42; wing.rotation.z = s * 0.25;
      grp.add(wing);
    }
    grp.position.set(0, 2.35, -1.08);
  } else if (key === 'yunlin_talisman') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.35, 8), std('#b45309'));
    pole.position.y = 0.65;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.15, 0.06), std('#facc15', { emissive: '#ca8a04', emissiveIntensity: 0.25 }));
    flag.position.set(0.48, 1.1, 0);
    const seal = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.08), std('#dc2626'));
    seal.position.set(0.48, 1.1, 0);
    grp.add(pole, flag, seal);
    grp.position.set(-0.35, 2.1, -1.05); grp.rotation.z = 0.12;
  } else if (key === 'sky_lantern') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.3, 0.78, 8), std('#fb923c', { emissive: '#ea580c', emissiveIntensity: 0.9 }));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), std('#fef08a', { emissive: '#facc15', emissiveIntensity: 1.4 }));
    flame.position.y = -0.34;
    grp.add(body, flame);
  } else if (key === 'wood_carving') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 10), std('#92400e'));
    body.scale.set(0.95, 1.25, 0.9);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), std('#fde68a'));
    belly.position.set(0, -0.06, 0.16);
    for (const ex of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), std('#facc15'));
      eye.position.set(ex, 0.22, 0.28);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), std('#78350f'));
      ear.position.set(ex * 1.4, 0.44, 0.05);
      grp.add(eye, ear);
    }
    grp.add(body, belly);
  } else if (key === 'xiaolongbao') {
    const steamer = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), std('#d97706'));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 12), std('#92400e'));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.14;
    grp.add(steamer, rim);
    for (const [bx, bz] of [[-0.12, 0.08], [0.12, 0.08], [0, -0.14]]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), std('#f8fafc'));
      bun.position.set(bx, 0.17, bz); grp.add(bun);
    }
    grp.position.set(0.05, -0.84, 0.45);
  } else if (key === 'keelung_tempura') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), std('#fde68a'));
    grp.add(stick);
    for (let k = 0; k < 3; k++) {
      const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), std(k === 1 ? '#ea580c' : '#f59e0b'));
      patty.rotation.x = Math.PI / 2; patty.position.y = -0.05 + k * 0.22; grp.add(patty);
    }
    grp.position.set(0.05, -0.78, 0.42); grp.rotation.x = 0.35;
  } else if (key === 'daxi_tofu') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), std('#fde68a'));
    grp.add(stick);
    for (let k = 0; k < 3; k++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.14), std('#451a03'));
      block.position.y = -0.05 + k * 0.22; grp.add(block);
    }
    grp.position.set(0.05, -0.78, 0.42); grp.rotation.x = 0.35;
  } else if (key === 'miaoli_strawberry') {
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.24, 0.32, 10), std('#b45309'));
    grp.add(basket);
    for (const [sx, sy, sz] of [[-0.12, 0.16, 0.1], [0.12, 0.16, 0.08], [0, 0.2, -0.1], [0, 0.28, 0.02]]) {
      const berry = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 8), std('#e11d48'));
      berry.rotation.x = Math.PI; berry.position.set(sx, sy, sz); grp.add(berry);
    }
    grp.position.set(0.05, -0.84, 0.45);
  } else if (key === 'taitung_sugar_apple') {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), std('#4ade80'));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 6), std('#78350f'));
    stem.position.y = 0.3;
    grp.add(fruit, stem);
    grp.position.set(0.05, -0.82, 0.44);
  } else if (key === 'kaohsiung_anchor') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.36, 16), std('#f8fafc'));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 16, 1, false, -0.8, 1.6), std('#1e3a8a'));
    brim.position.set(0, -0.15, 0.22);
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), std('#facc15'));
    badge.position.set(0, 0.02, 0.96);
    grp.add(cap, brim, badge);
    grp.position.set(0, 5.05, 0);
  } else if (key === 'pingtung_tuna') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), std('#0284c7'));
    body.scale.set(0.85, 0.72, 1.55);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 4), std('#0369a1'));
    fin.position.set(0, 0.52, -0.1); fin.rotation.x = -0.3;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 4), std('#0369a1'));
    tail.position.set(0, 0.05, -1.02); tail.rotation.x = Math.PI / 2;
    grp.add(body, fin, tail);
    grp.position.set(0, 5.25, 0);
  } else if (key === 'changhua_meatball') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(1.38, 0.65, 16), std('#d97706'));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.06, 6, 18), std('#92400e'));
    rim.rotation.x = Math.PI / 2; rim.position.y = -0.3;
    grp.add(hat, rim);
    grp.position.set(0, 5.25, 0);
  } else if (key === 'lanyu_flying_fish') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 6, 18), std('#f8fafc'));
    band.rotation.x = Math.PI / 2;
    const fish = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.95), std('#06b6d4'));
    fish.position.set(0, 0.3, 0.4);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), std('#e0f2fe'));
    wingL.position.set(-0.55, 0.32, 0.35); wingL.rotation.z = 0.2;
    const wingR = wingL.clone(); wingR.position.x = 0.55; wingR.rotation.z = -0.2;
    grp.add(band, fish, wingL, wingR);
    grp.position.set(0, 5.2, 0);
  } else if (key === 'jiufen_gold') {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.62), std('#78350f'));
    grp.add(pack);
    for (const [gx, gy] of [[-0.2, 0.55], [0.18, 0.58], [0, 0.62]]) {
      const nugget = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), std('#facc15', { emissive: '#ca8a04', emissiveIntensity: 0.45 }));
      nugget.position.set(gx, gy, 0); grp.add(nugget);
    }
    grp.position.set(0, 2.2, -1.12);
  } else if (key === 'hualien_marble') {
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.16, 6), std('#cbd5e1'));
    shield.rotation.x = Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.18, 6), std('#0f766e'));
    inner.rotation.x = Math.PI / 2;
    grp.add(shield, inner);
    grp.position.set(0, 2.2, -1.06);
  } else if (key === 'matsu_tears') {
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), std('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 1.2, transparent: true, opacity: 0.9 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 6, 16), std('#7dd3fc', { emissive: '#38bdf8', emissiveIntensity: 0.8 }));
    ring.rotation.x = 0.7;
    grp.add(orb, ring);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}
function makeOutfitMesh(key) {
  const grp = new THREE.Group();
  const std = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, ...opt });
  if (key === 'space_suit') {
    const visor = new THREE.Mesh(new THREE.SphereGeometry(1.26, 16, 12), std('#bae6fd', { transparent: true, opacity: 0.55, metalness: 0.4 }));
    visor.position.y = 3.75;
    const jet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.7), std('#e2e8f0'));
    jet.position.set(0, 2.1, -1.05);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.14, 6, 16), std('#f97316'));
    ring.rotation.x = Math.PI / 2; ring.position.y = 2.75;
    grp.add(visor, jet, ring);
  } else if (key === 'cowboy') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.12, 16), std('#78350f'));
    brim.position.y = 4.68;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.02, 0.75, 12), std('#92400e'));
    crown.position.y = 5.05;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.18, 6, 12), std('#dc2626'));
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 2.72;
    grp.add(brim, crown, scarf);
  } else if (key === 'luxury') {
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.25, 1.5, 14), std('#7e22ce', { roughness: 0.35 }));
    coat.position.y = 1.9;
    const shades = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.35), std('#0f172a', { metalness: 0.8 }));
    shades.position.set(0, 3.85, 0.98);
    const goldChain = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.1, 6, 16), std('#facc15', { metalness: 0.8 }));
    goldChain.rotation.x = Math.PI / 2; goldChain.position.y = 2.65;
    grp.add(coat, shades, goldChain);
  } else if (key === 'ninja') {
    const mask = new THREE.Mesh(new THREE.CylinderGeometry(1.14, 1.14, 0.95, 14), std('#1e293b'));
    mask.position.y = 3.55;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.1, 6, 16), std('#ef4444'));
    band.rotation.x = Math.PI / 2; band.position.y = 4.05;
    const katana = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 0.14), std('#cbd5e1', { metalness: 0.8 }));
    katana.position.set(0.35, 2.5, -1.0); katana.rotation.z = -0.45;
    grp.add(mask, band, katana);
  } else if (key === 'race_suit') {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(1.24, 16, 12), std('#ef4444'));
    helm.position.y = 3.75;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.45, 0.45), std('#0f172a'));
    visor.position.set(0, 3.82, 0.96);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.65, 1.75), std('#facc15'));
    stripe.position.y = 1.98;
    grp.add(helm, visor, stripe);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

function makeCarMesh(key) {
  const grp = new THREE.Group();
  const std = (color, opt = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, ...opt });
  const tireM = std('#111827', { roughness: 0.85 });
  const rimM = std('#e2e8f0', { metalness: 0.7 });
  const addWheels = (xs, zs, r = 0.45) => {
    for (const x of xs) for (const z of zs) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.32, 12), tireM);
      w.rotation.z = Math.PI / 2; w.position.set(x, r, z);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.35, 8), rimM);
      hub.rotation.z = Math.PI / 2; hub.position.set(x, r, z);
      grp.add(w, hub);
    }
  };
  if (key === 'scooter') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 2.3), std('#38bdf8'));
    body.position.y = 0.65;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), rimM);
    bar.position.set(0, 1.35, 0.95); bar.rotation.x = -0.25;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.14), tireM);
    handle.position.set(0, 1.98, 0.8);
    grp.add(body, bar, handle);
    addWheels([0], [-0.85, 0.9], 0.38);
  } else if (key === 'sedan') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.78, 3.6), std('#22c55e', { metalness: 0.35 }));
    chassis.position.y = 0.75;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.45, 1.0), std('#38bdf8', { transparent: true, opacity: 0.55 }));
    hood.position.set(0, 1.25, 0.85);
    grp.add(chassis, hood);
    addWheels([-1.2, 1.2], [-1.1, 1.1], 0.46);
  } else if (key === 'sports') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.68, 4.0), std('#ef4444', { metalness: 0.65, roughness: 0.2 }));
    chassis.position.y = 0.68;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.45), std('#0f172a'));
    wing.position.set(0, 1.32, -1.75);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.42, 1.1), std('#7dd3fc', { transparent: true, opacity: 0.65 }));
    glass.position.set(0, 1.15, 0.9);
    grp.add(chassis, wing, glass);
    addWheels([-1.32, 1.32], [-1.25, 1.25], 0.48);
  } else if (key === 'cyber_suv') {
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.05, 4.2), std('#cbd5e1', { metalness: 0.82, roughness: 0.22 }));
    chassis.position.y = 0.92;
    const light = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.16), std('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 0.9 }));
    light.position.set(0, 1.15, 2.08);
    grp.add(chassis, light);
    addWheels([-1.4, 1.4], [-1.35, 1.35], 0.58);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

function syncTokenDecor(tk, pl) {
  if (!tk || !tk.decoSlots) return;
  const eq = (pl && pl.equipped) || {};
  const key = `${eq.hand || ''}|${eq.head || ''}|${eq.back || ''}|${eq.halo || ''}|${pl && pl.equippedOutfit || ''}|${pl && pl.equippedCar || ''}`;
  if (tk.decoKey === key) return;
  tk.decoKey = key;
  for (const slot of ['hand', 'head', 'back', 'halo']) {
    const holder = tk.decoSlots[slot];
    if (!holder) continue;
    while (holder.children.length) holder.remove(holder.children[0]);
    const spKey = eq[slot];
    if (spKey) holder.add(makeSpecialtyMesh(spKey));
  }
  if (tk.outfitSlot) {
    while (tk.outfitSlot.children.length) tk.outfitSlot.remove(tk.outfitSlot.children[0]);
    if (pl && pl.equippedOutfit) tk.outfitSlot.add(makeOutfitMesh(pl.equippedOutfit));
  }
  if (tk.carSlot) {
    while (tk.carSlot.children.length) tk.carSlot.remove(tk.carSlot.children[0]);
    const hasCar = !!(pl && pl.equippedCar);
    if (hasCar) tk.carSlot.add(makeCarMesh(pl.equippedCar));
    if (tk.charBody) tk.charBody.position.y = hasCar ? 0.72 : 0;
  }
}

// ---------- 玩家 3D 造型棋子（精細五官、可動四肢、專屬帽飾配件與神明光環）----------
const tokens = [];
function makeToken(pl, { addToScene = true } = {}) {
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

  const decoHand = new THREE.Group();
  rightArm.add(decoHand);
  const decoHead = new THREE.Group();
  const decoBack = new THREE.Group();
  const decoHalo = new THREE.Group();
  decoHalo.position.set(-1.65, 4.95, 0.25);
  g.add(decoHead, decoBack, decoHalo);
  const decoSlots = { hand: decoHand, head: decoHead, back: decoBack, halo: decoHalo };
  const outfitSlot = new THREE.Group();
  g.add(outfitSlot);

  const charBody = new THREE.Group();
  while (g.children.length) charBody.add(g.children[0]);
  g.add(charBody);
  const carSlot = new THREE.Group();
  g.add(carSlot);
  g.add(godVis);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.38);
  if (addToScene) scene.add(g);
  const tkObj = { g, charBody, leftArm, rightArm, leftLeg, rightLeg, godVis, ring, spirit, decoSlots, outfitSlot, carSlot, decoKey: '', pos: pl.pos, path: [], t: 0, moveN: 0 };
  syncTokenDecor(tkObj, pl);
  return tkObj;
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
const isIslandLeg = (a, b) => !TILE_MAIN[a] || !TILE_MAIN[b] || edgeMode(a, b) === 'ferry' || edgeMode(a, b) === 'air';
const stepDurMs = (a, b) => {
  const base = STEP_MS();
  if (!isIslandLeg(a, b)) return base;
  const dist = tilePos(a).distanceTo(tilePos(b));
  return base * Math.max(3.8, Math.min(6.4, dist / 18));
};

// ---------- 雙顆 3D 骰子（隨當前玩家定位滾動，永不淹沒於地形）----------
const pipTex = n => canvasTex(128, 128, (c, w) => {
  c.fillStyle = '#fafafa'; c.fillRect(0, 0, w, w); c.fillStyle = n === 1 ? '#c0392b' : '#1b1b1b';
  const P = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[n];
  for (const [x, y] of P) { c.beginPath(); c.arc(x * w, y * w, n === 1 ? 16 : 11, 0, 7); c.fill(); }
});
const FACE = [3, 4, 1, 6, 2, 5];
const diceMats = FACE.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.35 }));
const dice = [0, 1].map(k => { const m = new THREE.Mesh(new THREE.BoxGeometry(2.75, 2.75, 2.75), diceMats); m.castShadow = true; m.visible = false; m.position.set(-105 + k * 4.1, 2.2, 120); scene.add(m); return m; });
const dicePad = new THREE.Group();
const dicePadDisc = new THREE.Mesh(
  new THREE.CylinderGeometry(4.4, 4.8, 0.28, 24),
  new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45, metalness: 0.35, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
);
dicePadDisc.receiveShadow = true;
const dicePadRing = new THREE.Mesh(
  new THREE.TorusGeometry(4.55, 0.22, 8, 28),
  new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#ca8a04', emissiveIntensity: 0.55, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
);
dicePadRing.rotation.x = Math.PI / 2;
dicePadRing.position.y = 0.14;
dicePad.add(dicePadDisc, dicePadRing);
dicePad.visible = false;
scene.add(dicePad);
function syncDiceVisible(count = (G ? (R.cur(G).dice || 1) : 1)) {
  const active = Boolean(diceAnim);
  dice[0].visible = active;
  dice[1].visible = active && count > 1;
  dicePad.visible = active;
}
const UP = { 1: [0, 0], 2: [-Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2], 5: [Math.PI / 2, 0], 6: [Math.PI, 0] };
let diceAnim = null;
function computeDiceAnchor(tileIdx, pIdx) {
  const a = tilePos(tileIdx);
  const ts = tileBaseScale(R.BOARD[tileIdx], tileIdx);
  const tk = tokens[pIdx];
  const tkPos = tk ? tk.g.position : tokenWorld(tileIdx, pIdx);
  const obs = [{ x: tkPos.x, z: tkPos.z, r: 6.4 }];
  if (G) {
    G.players.forEach((pl, j) => {
      if (j === pIdx || pl.bankrupt) return;
      const op = tokens[j] ? tokens[j].g.position : tokenWorld(pl.pos, j);
      obs.push({ x: op.x, z: op.z, r: 3.8 });
    });
    for (const npc of (G.npcs || [])) {
      if (npc.attachedTo != null || npc.respawnIn > 0 || npc.pos !== tileIdx) continue;
      const nt = npcTokens.get(npc.id);
      const np = nt ? nt.g.position : npcWorld(npc.pos);
      obs.push({ x: np.x, z: np.z, r: 3.8 });
    }
    if (G.tiles[tileIdx] && G.tiles[tileIdx].owner != null) {
      obs.push({ x: a.x + HOUSE_OFF.x * ts, z: a.z + HOUSE_OFF.z * ts, r: 4.2 * ts });
    }
  }
  if (tileProps[tileIdx]) {
    obs.push({ x: a.x + LM_OFF.x * ts, z: a.z + LM_OFF.z * ts, r: 4.6 * ts });
  }
  const Rx = Math.cos(camS.yaw), Rz = -Math.sin(camS.yaw);
  const Fx = Math.sin(camS.yaw), Fz = Math.cos(camS.yaw);
  const cands = [
    [tkPos.x + Rx * 8.6 + Fx * 2.8, tkPos.z + Rz * 8.6 + Fz * 2.8],
    [tkPos.x - Rx * 8.6 + Fx * 2.8, tkPos.z - Rz * 8.6 + Fz * 2.8],
    [tkPos.x + Rx * 9.8 - Fx * 1.6, tkPos.z + Rz * 9.8 - Fz * 1.6],
    [tkPos.x - Rx * 9.8 - Fx * 1.6, tkPos.z - Rz * 9.8 - Fz * 1.6],
    [a.x + Rx * 9.5 + Fx * 5.2, a.z + Rz * 9.5 + Fz * 5.2],
    [a.x - Rx * 9.5 + Fx * 5.2, a.z - Rz * 9.5 + Fz * 5.2],
    [a.x + Rx * 8.2 + Fx * 8.0, a.z + Rz * 8.2 + Fz * 8.0],
    [a.x - Rx * 8.2 + Fx * 8.0, a.z - Rz * 8.2 + Fz * 8.0],
    [a.x + Fx * 10.2, a.z + Fz * 10.2],
    [a.x - Fx * 10.0, a.z - Fz * 10.0],
  ];
  let best = cands[0], bestTier = -1, bestScore = -Infinity;
  for (const [cx, cz] of cands) {
    const dSelf = Math.hypot(cx - tkPos.x, cz - tkPos.z);
    const latSelf = Math.abs((cx - tkPos.x) * Rx + (cz - tkPos.z) * Rz);
    const tier = (dSelf >= 7.6 && latSelf >= 5.2) ? 1 : 0;
    let minClear = Infinity;
    for (const o of obs) {
      const c = Math.hypot(cx - o.x, cz - o.z) - o.r;
      if (c < minClear) minClear = c;
    }
    const dTile = Math.hypot(cx - a.x, cz - a.z);
    const score = minClear - dTile * 0.08 + (tier === 0 ? dSelf * 0.15 : 0);
    if (tier > bestTier || (tier === bestTier && score > bestScore)) {
      bestTier = tier; bestScore = score; best = [cx, cz];
    }
  }
  const [bx, bz] = best;
  const cy = Math.max(a.y, onMainland(bx, bz) ? terrainHeight(bx, bz) : a.y);
  return new THREE.Vector3(bx, cy, bz);
}
function rollDice(a, b, count = (b > 0 ? 2 : 1)) {
  // 骰子出現在出發點：擲骰時規則已把玩家移到終點，所以用棋子畫面上的位置（尚未開始走）
  let from = G ? R.cur(G).pos : 0;
  if (G && G.move && G.move.path && G.move.path.length) {
    const tk = tokens[G.move.p];
    from = G.move.from != null ? G.move.from : tk && tk.moveN !== G.move.n ? tk.pos : from;
  }
  const pIdx = (G && G.move) ? G.move.p : (G ? G.cur : 0);
  const anchor = G ? computeDiceAnchor(from, pIdx) : new THREE.Vector3(-105, 1.5, 120);
  dicePad.position.set(anchor.x, anchor.y + 0.52, anchor.z);
  diceAnim = {
    t0: performance.now(), dur: 850 / Math.sqrt(SPEED), hold: 680 / SPEED, end: [a, b], count, anchor,
    spin: [new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6), new THREE.Vector3(Math.random() * 9 + 6, Math.random() * 9 + 6, Math.random() * 9 + 6)]
  };
  syncDiceVisible(count);
  snd('dice');
}
function stepDice(now) {
  if (!diceAnim) return;
  const t = Math.min(1, (now - diceAnim.t0) / diceAnim.dur);
  const a = diceAnim.anchor;
  const Rx = Math.cos(camS.yaw), Rz = -Math.sin(camS.yaw);
  dicePad.position.set(a.x, a.y + 0.52, a.z);
  dicePad.visible = true;
  dice.forEach((d, k) => {
    if (k >= diceAnim.count) { d.visible = false; return; }
    d.visible = true;
    const [rx, rz] = UP[diceAnim.end[k] || 1];
    const sep = diceAnim.count === 1 ? 0 : (k ? 2.05 : -2.05);
    const ox = a.x + Rx * sep, oz = a.z + Rz * sep;
    if (t < 1) {
      const s = (1 - t) * 1.2;
      d.rotation.set(rx + diceAnim.spin[k].x * s, d.rotation.y + 0.02, rz + diceAnim.spin[k].z * s);
      d.position.set(ox, a.y + 3.2 + Math.abs(Math.sin(t * Math.PI * 3)) * 7.8 * (1 - t), oz);
    } else {
      d.rotation.set(rx, camS.yaw + k * 0.25, rz);
      d.position.set(ox, a.y + 2.05, oz);
    }
  });
  // 骰子落定後停留一下讓玩家看清點數，棋子才開始走，結束後自動收起骰子與骰盤
  if (now - diceAnim.t0 >= diceAnim.dur + diceAnim.hold) {
    dice[0].visible = false;
    dice[1].visible = false;
    dicePad.visible = false;
    diceAnim = null;
  }
}

// ---------- 鏡頭：操作模式與大戰略 3D 一致（單指/左鍵平移、雙指鎖定縮放或旋轉傾斜、右鍵或 Shift+左鍵旋轉傾斜、Q/E/R/F 與右下角控制列） ----------
const ROT_STEP = Math.PI / 12, TILT_STEP = 10;
const DIST_MIN = 45, DIST_MAX = 680 * WS, TILT_MIN = 18, TILT_MAX = 85;
const camS = {
  yaw: 0.25, yawGoal: 0.25, tilt: 0, tiltGoal: 0, pitch: 0.92, dist: 320 * WS,
  target: new THREE.Vector3(-4, 0, 4), goal: new THREE.Vector3(-4, 0, 4),
  hasGoal: true, follow: true, focusMode: 'auto',
};
const FOCUS_MODES = [
  { id: 'auto', label: '🎯原', toast: '🎯 鏡頭焦點：原本（自動跟隨玩家與特效）', title: '鏡頭焦點：原本（點擊切換為跟隨玩家）' },
  { id: 'player', label: '👤玩', toast: '👤 鏡頭焦點：鎖定玩家', title: '鏡頭焦點：玩家（點擊切換為跟隨野狗）' },
  { id: 'dog', label: '🐕狗', toast: '🐕 鏡頭焦點：鎖定野狗', title: '鏡頭焦點：野狗（點擊切換為固定視角）' },
  { id: 'free', label: '📌定', toast: '📌 鏡頭焦點：固定視角（可自由拖曳瀏覽）', title: '鏡頭焦點：固定（點擊切回原本自動）' },
];
let lastFocusTurn = -1, wasFollowingFx = false, manualFocusPos = null;
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
  manualFocusPos = null;
  camS.hasGoal = true;
  const ct = G && tokens[G.cur];
  if (ct) camS.goal.copy(ct.g.position).setY(0);
  else camS.goal.set(-4, 0, 4);
}
function focusTileOnMap(i) {
  const p = tilePos(i);
  manualFocusPos = new THREE.Vector3(p.x, 0, p.z);
  camS.hasGoal = true;
  camS.goal.copy(manualFocusPos);
}
function resetCamGoal() {
  lastFocusTurn = -1;
  manualFocusPos = null;
  camS.target.set(-4, 0, 4);
  camS.goal.set(-4, 0, 4);
  camS.hasGoal = camS.follow;
}
function panBoard(dx, dy) {
  manualFocusPos = null;
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
  if (camS.hasGoal) {
    const distG = camS.target.distanceTo(camS.goal);
    const baseLerp = isMoving() ? 0.16 : 0.12;
    const boost = distG > 80 ? 0.08 : 0;
    const alpha = Math.min(0.45, (baseLerp + boost) * Math.max(1, Math.pow(SPEED, 0.65)));
    camS.target.lerp(camS.goal, alpha);
  }
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
  const syncCamBtn = () => {
    const b = $('#zCam');
    if (!b) return;
    const fm = FOCUS_MODES.find(m => m.id === camS.focusMode) || FOCUS_MODES[0];
    b.classList.toggle('on', camS.focusMode !== 'free');
    b.textContent = fm.label;
    b.title = fm.title;
  };
  syncCamBtn();
  if ($('#zCam')) $('#zCam').onclick = () => {
    const curIdx = FOCUS_MODES.findIndex(m => m.id === camS.focusMode);
    const next = FOCUS_MODES[(curIdx + 1) % FOCUS_MODES.length];
    camS.focusMode = next.id;
    camS.follow = next.id !== 'free';
    syncCamBtn();
    manualFocusPos = null;
    if (camS.focusMode === 'free') camS.hasGoal = false;
    else if (camS.focusMode === 'dog') {
      const dog = G && (G.npcs || []).find(n => n.kind === 'dog');
      const dnt = dog ? npcTokens.get(dog.id) : null;
      camS.hasGoal = true;
      if (dnt) camS.goal.copy(dnt.g.position).setY(0);
    } else focusCurPlayer();
    toast(next.toast);
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
  const branchBanner = document.createElement('div');
  branchBanner.id = 'branchBanner'; branchBanner.className = 'hidden'; document.querySelector('main').appendChild(branchBanner);
  const showTileTip = (i, px, py, rWidth) => {
    const t = R.BOARD[i], st = G && G.tiles[i];
    const gc = t.group ? R.GROUPS[t.group].color : (TYPE_STYLE[t.type]?.[1] || '#94a3b8');
    const kind = t.group ? R.GROUPS[t.group].name : (TYPE_STYLE[t.type]?.[2] || '');
    let info = TYPE_STYLE[t.type]?.[3] || '';
    if (t.type === 'land' || t.type === 'station') {
      info = `地價 $${t.price}`;
      if (st && st.owner != null) info += `・地主 <b class="own" style="color:${G.players[st.owner].color}">${G.players[st.owner].name}</b>・${R.LEVEL_NAME[st.level || 0] || ''}・過路費 $${R.rentOf(G, i)}`;
      else info += '・無人擁有';
    }
    tip.innerHTML = `<b class="nm" style="border-color:${gc}">${t.name}</b><small>${kind}</small><div>${info}</div>`;
    tip.style.left = Math.min((rWidth || canvas.clientWidth) - 230, Math.max(8, px)) + 'px';
    tip.style.top = Math.max(8, py) + 'px';
    tip.classList.remove('hidden');
    clearTimeout(tip._t); tip._t = setTimeout(() => tip.classList.add('hidden'), 4200);
  };
  window.__showTileTipCenter = i => {
    const r = canvas.getBoundingClientRect();
    showTileTip(i, r.width * 0.5 - 95, r.height * 0.5 - 95, r.width);
  };
  canvas.addEventListener('pointerdown', e => { downAt = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 450) { downAt = null; return; }
    downAt = null;
    const r = canvas.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    if (G && G.ask && G.ask.k === 'branch' && mine(G.cur)) {
      const bHit = ray.intersectObjects(branchHits, false)[0];
      if (bHit && bHit.object.userData.branchTo != null) {
        tip.classList.add('hidden');
        send({ type: 'answer', to: bHit.object.userData.branchTo });
        return;
      }
    }
    const hit = ray.intersectObjects(tileBases, false)[0];
    if (!hit) { tip.classList.add('hidden'); return; }
    const i = hit.object.userData.i;
    if (G && G.ask && G.ask.k === 'branch' && mine(G.cur) && G.ask.options.some(o => o.to === i)) {
      tip.classList.add('hidden');
      send({ type: 'answer', to: i });
      return;
    }
    showTileTip(i, e.clientX - r.left + 12, e.clientY - r.top - 70, r.width);
  });
})();
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

// ---------- 每幀動畫 ----------
let lastFx = '', lastCard = 0, lastMoveN = 0, lastNewsId = 0, lastBiteN = 0, lastHospitalN = 0, lastBankruptN = 0, lastGodFxN = 0, lastTransportN = 0, lastItemEventN = 0;
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
  const dur = 2150 / Math.sqrt(SPEED);
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
  const ambTh = onMainland(ambGroup.position.x, ambGroup.position.z) ? terrainHeight(ambGroup.position.x, ambGroup.position.z) : 0.4;
  const ambArcY = ambGroup.position.y + 0.35 + Math.sin(f * Math.PI) * 5.2 + Math.abs(Math.sin(f * Math.PI * 10)) * 0.25;
  ambGroup.position.y = Math.max(ambArcY, ambTh + 1.5 + Math.sin(f * Math.PI) * 2.2);
  ambGroup.rotation.y = Math.atan2(ambAnim.b.x - ambAnim.a.x, ambAnim.b.z - ambAnim.a.z);
  const blink = Math.floor(now / 130) % 2 === 0;
  if (ambRed) ambRed.material.emissiveIntensity = blink ? 2.4 : 0.2;
  if (ambBlue) ambBlue.material.emissiveIntensity = blink ? 0.2 : 2.4;
}

// ---------- 機會移動與入監專屬載具動畫（高鐵 700T 列車／環島直升機／警備囚車，不直接走棋子）----------
let transportAnim = null, hsrGroup = null, heliGroup = null, heliMainRotor = null, heliTailRotor = null, jailGroup = null, jailRed = null, jailBlue = null, transportBanner = null;
function ensureTransportFx() {
  if (!hsrGroup) {
    hsrGroup = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.25, metalness: 0.1 });
    const orange = new THREE.MeshStandardMaterial({ color: '#ea580c', emissive: '#9a3412', emissiveIntensity: 0.25, roughness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.15, metalness: 0.4 });
    const railM = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.7 });
    // 流線車頭＋兩節高鐵車廂
    const lead = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 3.6), white); lead.position.set(0, 0.9, 1.5);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 8), white); nose.rotation.x = Math.PI / 2; nose.scale.set(0.95, 1, 0.72); nose.position.set(0, 0.75, 4.2);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 1.2), glass); cab.position.set(0, 1.28, 3.1); cab.rotation.x = -0.35;
    const car2 = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.35, 3.8), white); car2.position.set(0, 0.9, -2.5);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.26, 7.6), orange); stripe.position.set(0, 0.78, -0.5);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.36, 6.2), glass); win.position.set(0, 1.18, -0.8);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 8.6), railM); beam.position.set(0, 0.14, -0.4);
    const headLight = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15', emissiveIntensity: 1.4 }));
    headLight.position.set(0, 0.65, 5.15);
    hsrGroup.add(lead, nose, cab, car2, stripe, win, beam, headLight);
    hsrGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
    hsrGroup.scale.setScalar(2.35);
    hsrGroup.visible = false;
    scene.add(hsrGroup);
  }
  if (!heliGroup) {
    heliGroup = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.3, metalness: 0.2 });
    const whiteM = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 });
    const glassM = new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 });
    const darkM = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6 });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 10), bodyM); hull.scale.set(0.95, 0.9, 1.55); hull.position.set(0, 1.35, 0.2);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.02, 10, 8), glassM); cabin.scale.set(0.9, 0.8, 1.15); cabin.position.set(0, 1.42, 0.85);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.32, 2.2), whiteM); stripe.position.set(0, 1.25, 0.1);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 3.2, 8), bodyM); tail.rotation.x = Math.PI / 2; tail.position.set(0, 1.55, -2.4);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.65), whiteM); fin.position.set(0, 1.95, -3.85);
    for (const sx of [-0.9, 0.9]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), darkM); skid.rotation.x = Math.PI / 2; skid.position.set(sx, 0.2, 0.25);
      const st1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), darkM); st1.position.set(sx * 0.85, 0.55, 0.9);
      const st2 = st1.clone(); st2.position.z = -0.4;
      heliGroup.add(skid, st1, st2);
    }
    heliMainRotor = new THREE.Group();
    heliMainRotor.position.set(0, 2.65, 0.15);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.45, 8), darkM);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 0.28), darkM); b1.position.y = 0.22;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 5.6), darkM); b2.position.y = 0.22;
    heliMainRotor.add(mast, b1, b2);
    heliTailRotor = new THREE.Group();
    heliTailRotor.position.set(0.22, 2.1, -3.85);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.16), whiteM);
    heliTailRotor.add(tb);
    heliGroup.add(hull, cabin, stripe, tail, fin, heliMainRotor, heliTailRotor);
    heliGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
    heliGroup.scale.setScalar(2.4);
    heliGroup.visible = false;
    scene.add(heliGroup);
  }
  if (!jailGroup) {
    jailGroup = new THREE.Group();
    const darkM = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.45 });
    const whiteM = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 });
    const barM = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.7 });
    const tireM = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.85, 4.1), darkM); body.position.set(0, 1.32, -0.3);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.95, 1.55), whiteM); door.position.set(0, 1.15, 0.8);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.4, 1.5), darkM); cab.position.set(0, 1.1, 2.2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 0.14), new THREE.MeshStandardMaterial({ color: '#93c5fd', roughness: 0.2 })); win.position.set(0, 1.38, 2.95);
    for (let k = -1; k <= 1; k++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 6), barM);
      bar.position.set(1.28, 1.65, -0.9 + k * 0.42);
      const bar2 = bar.clone(); bar2.position.x = -1.28;
      jailGroup.add(bar, bar2);
    }
    jailRed = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.45), new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 1.5 }));
    jailRed.position.set(-0.48, 2.42, 1.85);
    jailBlue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.45), new THREE.MeshStandardMaterial({ color: '#3b82f6', emissive: '#3b82f6', emissiveIntensity: 1.5 }));
    jailBlue.position.set(0.48, 2.42, 1.85);
    jailGroup.add(body, door, cab, win, jailRed, jailBlue);
    for (const [wx, wz] of [[-1.2, -1.45], [1.2, -1.45], [-1.15, 2.1], [1.15, 2.1]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.38, 10), tireM);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.45, wz);
      jailGroup.add(w);
    }
    jailGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
    jailGroup.scale.setScalar(2.85);
    jailGroup.visible = false;
    scene.add(jailGroup);
  }
  if (!transportBanner) {
    transportBanner = document.createElement('div');
    transportBanner.className = 'amb-fx hidden';
    document.querySelector('main').appendChild(transportBanner);
  }
}
function clearTransportFx() {
  if (transportAnim) {
    const tk = tokens[transportAnim.p];
    if (tk) {
      tk.pos = transportAnim.to;
      tk.from = transportAnim.to;
      tk.path = [];
      tk.g.position.copy(tokenWorld(transportAnim.to, transportAnim.p));
      tk.g.visible = true;
    }
  }
  transportAnim = null;
  if (hsrGroup) hsrGroup.visible = false;
  if (heliGroup) heliGroup.visible = false;
  if (jailGroup) jailGroup.visible = false;
  if (transportBanner) transportBanner.classList.add('hidden');
}
function startTransportFx(pId, fromPos, toPos, kind, now) {
  ensureTransportFx();
  const a = tilePos(fromPos), b = tilePos(toPos);
  const dist = a.distanceTo(b);
  const dur = Math.max(2000, Math.min(3600, dist * 16)) / Math.sqrt(SPEED);
  transportAnim = { t0: now, dur, p: pId, from: fromPos, to: toPos, kind, a, b };
  const tk = tokens[pId];
  if (tk) tk.g.visible = false;
  const grp = kind === 'hsr' ? hsrGroup : kind === 'jail' ? jailGroup : heliGroup;
  grp.position.copy(a);
  grp.visible = true;
  if (kind !== 'hsr' && hsrGroup) hsrGroup.visible = false;
  if (kind !== 'heli' && heliGroup) heliGroup.visible = false;
  if (kind !== 'jail' && jailGroup) jailGroup.visible = false;
  const pl = G && G.players[pId], toName = R.BOARD[toPos]?.name || '目的地';
  transportBanner.textContent = kind === 'hsr'
    ? `🚄 台灣高鐵 700T 全速出發！${pl ? pl.name : '玩家'} 直奔「${toName}」…`
    : kind === 'jail'
      ? `🚔 警車鳴笛押送！${pl ? pl.name : '玩家'} 移送「${toName}」拘留…`
      : `🚁 環島直升機起飛！${pl ? pl.name : '玩家'} 飛往「${toName}」…`;
  transportBanner.classList.remove('hidden');
  snd(kind === 'jail' ? 'siren' : kind);
}
function stepTransportFx(now) {
  if (!transportAnim) return;
  const f = (now - transportAnim.t0) / transportAnim.dur;
  if (f >= 1) {
    clearTransportFx();
    return;
  }
  const ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  if (transportAnim.kind === 'hsr') {
    hsrGroup.position.lerpVectors(transportAnim.a, transportAnim.b, ease);
    const th = onMainland(hsrGroup.position.x, hsrGroup.position.z) ? terrainHeight(hsrGroup.position.x, hsrGroup.position.z) : 0.4;
    hsrGroup.position.y = Math.max(hsrGroup.position.y + 0.65 + Math.sin(f * Math.PI) * 3.8, th + 1.5);
    hsrGroup.rotation.y = Math.atan2(transportAnim.b.x - transportAnim.a.x, transportAnim.b.z - transportAnim.a.z);
  } else if (transportAnim.kind === 'jail') {
    jailGroup.position.lerpVectors(transportAnim.a, transportAnim.b, ease);
    const th = onMainland(jailGroup.position.x, jailGroup.position.z) ? terrainHeight(jailGroup.position.x, jailGroup.position.z) : 0.4;
    const arcY = jailGroup.position.y + 0.35 + Math.sin(f * Math.PI) * 4.5 + Math.abs(Math.sin(f * Math.PI * 10)) * 0.25;
    jailGroup.position.y = Math.max(arcY, th + 1.5 + Math.sin(f * Math.PI) * 2.0);
    jailGroup.rotation.y = Math.atan2(transportAnim.b.x - transportAnim.a.x, transportAnim.b.z - transportAnim.a.z);
    const blink = Math.floor(now / 130) % 2 === 0;
    if (jailRed) jailRed.material.emissiveIntensity = blink ? 2.4 : 0.2;
    if (jailBlue) jailBlue.material.emissiveIntensity = blink ? 0.2 : 2.4;
  } else {
    heliGroup.position.lerpVectors(transportAnim.a, transportAnim.b, ease);
    heliGroup.position.y += 1.6 + Math.sin(f * Math.PI) * 18.5;
    heliGroup.rotation.y = Math.atan2(transportAnim.b.x - transportAnim.a.x, transportAnim.b.z - transportAnim.a.z);
    heliGroup.rotation.x = Math.sin(f * Math.PI) * 0.2;
    if (heliMainRotor) heliMainRotor.rotation.y += 0.48;
    if (heliTailRotor) heliTailRotor.rotation.x += 0.55;
  }
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

// ---------- 神明附身特效（聖光柱＋旋轉法陣＋環繞靈珠＋神明降臨橫幅）----------
let godAnim = null, godFxGroup = null, godFxPillar = null, godFxRing = null, godFxOrbs = [], godBanner = null;
function ensureGodFx() {
  if (!godFxGroup) {
    godFxGroup = new THREE.Group();
    godFxPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 2.5, 11, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    godFxPillar.position.y = 5.5;
    godFxRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.0, 0.24, 8, 24),
      new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#ca8a04', transparent: true, opacity: 0.92 })
    );
    godFxRing.rotation.x = Math.PI / 2;
    godFxGroup.add(godFxPillar, godFxRing);
    godFxOrbs = [];
    for (let i = 0; i < 6; i++) {
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 8),
        new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#eab308' })
      );
      godFxOrbs.push(orb);
      godFxGroup.add(orb);
    }
    godFxGroup.visible = false;
    scene.add(godFxGroup);
  }
  if (!godBanner) {
    godBanner = document.createElement('div');
    godBanner.className = 'god-fx hidden';
    document.querySelector('main').appendChild(godBanner);
  }
}
function clearGodFx() {
  if (godAnim) {
    const tk = tokens[godAnim.p];
    if (tk) tk.g.rotation.z = 0;
  }
  godAnim = null;
  if (godFxGroup) godFxGroup.visible = false;
  if (godBanner) godBanner.classList.add('hidden');
}
function startGodAttachFx(pId, atPos, kind, now) {
  ensureGodFx();
  const gInfo = R.GODS[kind] || { name: '神明', icon: '✨', color: '#fde047', good: true, turns: 5 };
  const dur = 2300 / Math.sqrt(SPEED);
  godAnim = { t0: now, dur, p: pId, at: atPos, kind };
  const wp = tilePos(atPos);
  godFxGroup.position.set(wp.x, wp.y + 0.35, wp.z);
  godFxGroup.visible = true;
  godFxPillar.material.color.set(gInfo.color);
  godFxRing.material.color.set(gInfo.color);
  godFxRing.material.emissive.set(gInfo.color);
  for (const orb of godFxOrbs) {
    orb.material.color.set(gInfo.color);
    orb.material.emissive.set(gInfo.color);
  }
  const pl = G && G.players[pId];
  godBanner.className = `god-fx${gInfo.good ? '' : ' bad'}`;
  godBanner.textContent = `${gInfo.icon} ${gInfo.name} 附身 ${pl ? pl.name : '玩家'}！（${gInfo.turns} 回合）`;
  godBanner.classList.remove('hidden');
  snd(gInfo.good ? 'god' : 'badgod');
}
function stepGodAttachFx(now) {
  if (!godAnim) return;
  const gp = (now - godAnim.t0) / godAnim.dur;
  if (gp >= 1) {
    clearGodFx();
    return;
  }
  const fade = gp < 0.8 ? 1 : Math.max(0, (1 - gp) * 5);
  if (godFxPillar) {
    godFxPillar.scale.set(1 + Math.sin(gp * Math.PI) * 0.45, 1, 1 + Math.sin(gp * Math.PI) * 0.45);
    godFxPillar.material.opacity = 0.45 * fade;
  }
  if (godFxRing) {
    godFxRing.scale.setScalar(0.6 + Math.sin(gp * Math.PI) * 0.9);
    godFxRing.rotation.z = gp * Math.PI * 4;
    godFxRing.material.opacity = 0.92 * fade;
  }
  godFxOrbs.forEach((orb, idx) => {
    const a = gp * Math.PI * 5 + (idx / godFxOrbs.length) * Math.PI * 2;
    const r = 2.6 + Math.sin(gp * Math.PI) * 1.1;
    orb.position.set(Math.cos(a) * r, 0.8 + gp * 7.2, Math.sin(a) * r);
    orb.scale.setScalar(Math.max(0.05, fade * (0.8 + Math.sin(gp * Math.PI * 3 + idx) * 0.35)));
  });
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
      const dogNt = bf.approachFrom != null ? npcTokens.get(bf.npcId) : null;
      if (dogNt && dogNt.approachBiteN !== bf.n && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !tokens.some(t => t && t.path && t.path.length)) {
        dogNt.approachBiteN = bf.n;
        dogNt.from = bf.approachFrom;
        dogNt.pos = bf.at;
        dogNt.t = 0;
      }
      const dogReady = bf.approachFrom == null || (dogNt && dogNt.approachBiteN === bf.n && dogNt.t >= 1);
      if (!walkApproach && dogReady && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !tokens.some(t => t && t.path && t.path.length)) {
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
    if (G.godFx && G.godFx.n !== lastGodFxN && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !godAnim && !transportAnim && !tokens.some(t => t && t.path && t.path.length)) {
      lastGodFxN = G.godFx.n;
      startGodAttachFx(G.godFx.p, G.godFx.at, G.godFx.kind, now);
    }
    if (G.transportFx && G.transportFx.n !== lastTransportN && !diceAnim && !biteAnim && !ambAnim && !bankruptAnim && !godAnim && !transportAnim && !tokens.some(t => t && t.path && t.path.length)) {
      lastTransportN = G.transportFx.n;
      startTransportFx(G.transportFx.p, G.transportFx.from, G.transportFx.to, G.transportFx.kind, now);
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
      syncTokenDecor(tk, pl);
      if (tk.decoSlots && tk.decoSlots.halo.children.length) {
        tk.decoSlots.halo.position.y = 4.95 + Math.sin(now * 0.004 + k) * 0.32;
        tk.decoSlots.halo.rotation.y = now * 0.0014 + k;
      }
      const inAmb = !!(ambAnim && ambAnim.p === k);
      const inTransport = !!(transportAnim && transportAnim.p === k);
      const inBankrupt = !!(bankruptAnim && bankruptAnim.p === k);
      tk.g.visible = inBankrupt || (!pl.bankrupt && !inAmb && !inTransport);
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
      const waitingTransportHold = !!(G.transportFx && G.transportFx.n !== lastTransportN && G.transportFx.p === k && !tk.path.length);
      if (inBankrupt) {
        // 破產倒塌動畫由上方控制
      } else if (inAmb) {
        tk.pos = ambAnim.from;
        tk.g.position.copy(ambGroup.position);
      } else if (inTransport || waitingTransportHold) {
        const holdPos = inTransport ? transportAnim.from : G.transportFx.from;
        tk.pos = holdPos;
        tk.g.position.copy(tokenWorld(holdPos, k));
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
          const driving = !!(pl.equippedCar && !isIslandLeg(tk.from, tk.path[0]));
          const hopH = isIslandLeg(tk.from, tk.path[0]) ? 8.5 : (driving ? 0.55 : 3.2);
          tk.t += dt / legDur;
          const a = tokenWorld(tk.from, k), b = tokenWorld(tk.path[0], k), f = Math.min(1, tk.t);
          const sf = f * f * (3 - 2 * f);
          tk.g.position.lerpVectors(a, b, sf);
          tk.g.position.y += Math.sin(sf * Math.PI) * hopH;
          tk.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          if (driving) {
            tk.leftArm.rotation.x = -0.7; tk.rightArm.rotation.x = -0.7;
            tk.leftLeg.rotation.x = 0; tk.rightLeg.rotation.x = 0;
          } else {
            const swing = Math.sin(sf * Math.PI * 2) * 0.65;
            tk.leftArm.rotation.x = swing; tk.rightArm.rotation.x = -swing;
            tk.leftLeg.rotation.x = -swing * 0.8; tk.rightLeg.rotation.x = swing * 0.8;
          }
          if (f >= 1) {
            tk.from = tk.path.shift(); tk.pos = tk.from; tk.t = 0; snd(driving ? 'car' : 'step');
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
        if (npc.respawnIn > 0) {
          nt.g.visible = false;
          nt.moveN = npc.moveN || 0;
          nt.pos = npc.pos;
          nt.from = npc.pos;
          nt.t = 1;
          continue;
        }
        nt.g.visible = true;
        nt.g.scale.setScalar(1.25);
        const biteMoveTk = npc.kind === 'dog' && G.move && G.move.bite && G.move.bite.npcId === npc.id ? tokens[G.move.p] : null;
        const waitingBite = !!((biteMoveTk && biteMoveTk.moveN === G.move.n && (biteMoveTk.path.includes(G.move.bite.at) || (biteAnim && biteAnim.npcId === npc.id))) || (G.biteFx && G.biteFx.n !== lastBiteN && G.biteFx.npcId === npc.id));
        if (biteAnim && biteAnim.npcId === npc.id) {
          const bp = Math.min(1, (now - biteAnim.t0) / biteAnim.dur);
          const dPos = npcWorld(biteAnim.at), pPos = tokenWorld(biteAnim.at, biteAnim.p);
          const lunge = Math.sin(bp * Math.PI * 4) * 0.5 + 0.5;
          nt.g.position.lerpVectors(dPos, pPos, 0.45 + lunge * 0.45);
          nt.g.position.y += Math.abs(Math.sin(bp * Math.PI * 3.5)) * 1.9;
          nt.g.rotation.y = Math.atan2(pPos.x - dPos.x, pPos.z - dPos.z);
          nt.g.scale.setScalar(2.4 + lunge * 0.22);
          if (nt.g.userData.tail) nt.g.userData.tail.rotation.z = Math.sin(now * 0.03) * 0.7;
          continue;
        }
        if (!waitingPass && !waitingBite && npc.moveN !== nt.moveN) { nt.moveN = npc.moveN; nt.from = npc.from != null ? npc.from : nt.pos; nt.pos = npc.pos; nt.t = 0; }
        if (nt.t < 1) {
          if (!diceAnim && !biteAnim) {
            const dogDur = isIslandLeg(nt.from, nt.pos) ? stepDurMs(nt.from, nt.pos) * 0.55 : stepDurMs(nt.from, nt.pos) * 3.8;
            nt.t = Math.min(1, nt.t + dt / (npc.kind === 'dog' ? dogDur : stepDurMs(nt.from, nt.pos) * 1.6));
            if (npc.kind === 'dog') nt.g.scale.setScalar(2.5);
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

    const dogNpc = (G.npcs || []).find(n => n.kind === 'dog');
    const dogNt = dogNpc ? npcTokens.get(dogNpc.id) : null;
    if (camS.focusMode === 'dog' && dogNt) {
      manualFocusPos = null;
      camS.hasGoal = true;
      camS.goal.copy(dogNt.g.position).setY(0);
    } else {
      const activeFxPos = camS.focusMode === 'player' ? null
        : (biteAnim && biteBurst && biteBurst.visible) ? biteBurst.position
        : (ambAnim && ambGroup && ambGroup.visible) ? ambGroup.position
        : (transportAnim && hsrGroup && hsrGroup.visible) ? hsrGroup.position
        : (transportAnim && heliGroup && heliGroup.visible) ? heliGroup.position
        : (transportAnim && jailGroup && jailGroup.visible) ? jailGroup.position
        : (bankruptAnim && bankruptGroup && bankruptGroup.visible) ? bankruptGroup.position
        : (godAnim && godFxGroup && godFxGroup.visible) ? godFxGroup.position
        : movingDogPos;
      if (activeFxPos) {
        manualFocusPos = null;
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
            manualFocusPos = null;
            if (camS.follow) camS.hasGoal = true;
          }
          if (ct.path.length) {
            manualFocusPos = null;
            if (camS.follow) camS.hasGoal = true;
          }
          if (manualFocusPos) {
            if (camS.hasGoal) camS.goal.copy(manualFocusPos);
          } else if (camS.hasGoal) {
            camS.goal.copy(ct.g.position).setY(0);
          }
        }
      }
    }
  } else if (camS.hasGoal) {
    camS.goal.set(-4, 0, 4);
  }
  stepBranchMarkers(now);
  stepDice(now);
  stepDogBite(now);
  stepAmbulance(now);
  stepTransportFx(now);
  stepBankruptFx(now);
  stepGodAttachFx(now);
  updateCamera();
  renderer.render(scene, camera);
  if (pdPreview && pdPreview.tok && $('#pdCanvas') && !$('#modal').classList.contains('hidden')) {
    if (!pdPreview.dragging && !pdPreview.paused) pdPreview.rotY += dt * 0.0009;
    pdPreview.tok.g.rotation.y = pdPreview.rotY;
    pdPreview.root.rotation.x = pdPreview.rotX;
    if (pdPreview.tok.decoSlots && pdPreview.tok.decoSlots.halo) {
      pdPreview.tok.decoSlots.halo.position.y = 4.35 + Math.sin(now * 0.005) * 0.14;
    }
    pdPreview.renderer.render(pdPreview.scene, pdPreview.camera);
  }
}

// ============================================================ 介面與 Breaking News（移動後依序不重疊觸發）
const mine = pid => NET.role === 'local' ? G.players[pid].kind !== 'ai' : NET.myIds.has(pid);
const isMoving = () => {
  if (diceAnim || biteAnim || ambAnim || transportAnim || bankruptAnim || godAnim) return true;
  if (tokens.some(t => t && t.path && t.path.length)) return true;
  if (G && G.move && G.move.path && G.move.path.length && (!tokens[G.move.p] || tokens[G.move.p].moveN !== G.move.n)) return true;
  if (G && G.biteFx && G.biteFx.n !== lastBiteN) return true;
  if (G && G.hospital && G.hospital.n !== lastHospitalN) return true;
  if (G && G.transportFx && G.transportFx.n !== lastTransportN) return true;
  if (G && G.bankruptFx && G.bankruptFx.n !== lastBankruptN) return true;
  if (G && G.godFx && G.godFx.n !== lastGodFxN) return true;
  if (G && G.npcs && G.npcs.some(n => n.attachedTo == null && !(n.respawnIn > 0) && npcTokens.get(n.id) && npcTokens.get(n.id).moveN !== n.moveN)) return true;
  for (const nt of npcTokens.values()) if (nt && nt.g.visible && nt.t < 1) return true;
  return false;
};
const animBusy = () => isMoving();
function toast(s, ms = 1900) { const t = $('#toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), Math.round(ms / Math.pow(SPEED, 0.7))); }

let modalDoneCb = null, newsToastCb = null, cardPopCb = null;
const uiQueue = [];
let uiRunning = false, shownAsk = null, lastRankRound = 0, pendingRankModal = false, shownOver = false;

function openModal(html, ready) {
  if (pdPreview && pdPreview.renderer.domElement.parentNode) pdPreview.renderer.domElement.remove();
  $('#modalBox').innerHTML = html;
  $('#modal').classList.remove('hidden');
  ready && ready($('#modalBox'));
}
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
  const it = $('.item-toast');
  if (it) { clearTimeout(it._t); it.classList.add('hidden'); }
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
  nt._t = setTimeout(() => dismissNewsToast(), Math.round((isAllAi() ? 2000 : 3200) / Math.pow(SPEED, 0.85)));
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
    const artEl = $('#newsArt');
    if (artEl) artEl.innerHTML = newsArtSVG(latest);
    $('#newsTitle').textContent = `[${latest.cat}] ${latest.title}`;
    const tickEl = $('#newsTicker');
    if (tickEl) tickEl.textContent = latest.body && latest.body !== latest.title ? latest.body : (G.news.slice(-3, -1).reverse().map(n => `• ${n.title}`).join('  '));
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
function itemSvg(k) {
  const icons = {
    add_die: `<svg viewBox="0 0 36 36"><rect x="3" y="8" width="14" height="14" rx="3" fill="#fde047" stroke="#b45309" stroke-width="1.6"/><circle cx="7.5" cy="12.5" r="1.5" fill="#7c2d12"/><circle cx="12.5" cy="17.5" r="1.5" fill="#7c2d12"/><rect x="19" y="14" width="14" height="14" rx="3" fill="#fef08a" stroke="#d97706" stroke-width="1.6"/><circle cx="23" cy="18" r="1.4" fill="#7c2d12"/><circle cx="26" cy="21" r="1.4" fill="#7c2d12"/><circle cx="29" cy="24" r="1.4" fill="#7c2d12"/></svg>`,
    summon_god: `<svg viewBox="0 0 36 36"><circle cx="18" cy="11" r="7" fill="none" stroke="#fde047" stroke-width="2.2"/><path d="M10 29 C10 21 26 21 26 29 Z" fill="#f59e0b" stroke="#fef3c7" stroke-width="1.4"/><circle cx="18" cy="16" r="4.2" fill="#fed7aa"/><path d="M18 3 L19.5 7 L16.5 7 Z" fill="#fef08a"/></svg>`,
    dismiss_god: `<svg viewBox="0 0 36 36"><path d="M6 15 Q16 9 25 14 T31 12" fill="none" stroke="#38bdf8" stroke-width="2.6" stroke-linecap="round"/><path d="M4 22 Q15 17 24 22 T32 20" fill="none" stroke="#bae6fd" stroke-width="2.4" stroke-linecap="round"/><path d="M10 28 Q18 24 26 28" fill="none" stroke="#7dd3fc" stroke-width="2.2" stroke-linecap="round"/><polygon points="27,9 33,12 28,16" fill="#38bdf8"/></svg>`,
    remote: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="13" fill="#ef4444" stroke="#fee2e2" stroke-width="1.6"/><circle cx="18" cy="18" r="8.5" fill="#f8fafc"/><circle cx="18" cy="18" r="4.5" fill="#dc2626"/><circle cx="18" cy="18" r="1.8" fill="#fef08a"/></svg>`,
    block: `<svg viewBox="0 0 36 36"><polygon points="18,4 28,28 8,28" fill="#f97316" stroke="#ffedd5" stroke-width="1.5"/><rect x="11" y="15" width="14" height="4" fill="#ffffff"/><rect x="5" y="28" width="26" height="4" rx="1.5" fill="#9a3412"/></svg>`,
    free: `<svg viewBox="0 0 36 36"><path d="M18 4 L30 9 V18 C30 25.5 24 30.5 18 33 C12 30.5 6 25.5 6 18 V9 Z" fill="#2563eb" stroke="#93c5fd" stroke-width="2"/><path d="M13 18 L16.5 22 L24 13.5" fill="none" stroke="#fef08a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    reverse: `<svg viewBox="0 0 36 36"><path d="M27 14 A10 10 0 1 0 26 24" fill="none" stroke="#34d399" stroke-width="3.2" stroke-linecap="round"/><polygon points="22,16 30,17 28,9" fill="#6ee7b7"/></svg>`,
    demolish: `<svg viewBox="0 0 36 36"><circle cx="16" cy="21" r="10" fill="#334155" stroke="#94a3b8" stroke-width="1.6"/><path d="M22 13 L26 8" stroke="#d97706" stroke-width="2.4" stroke-linecap="round"/><polygon points="27,4 29,8 33,7 30,10 32,14 28,11 24,13 26,9" fill="#fde047" stroke="#ef4444" stroke-width="1"/></svg>`,
    seize: `<svg viewBox="0 0 36 36"><rect x="7" y="5" width="20" height="26" rx="2.5" fill="#fef3c7" stroke="#b45309" stroke-width="1.8"/><line x1="11" y1="12" x2="23" y2="12" stroke="#92400e" stroke-width="2"/><line x1="11" y1="17" x2="23" y2="17" stroke="#92400e" stroke-width="2"/><circle cx="24" cy="25" r="5" fill="#dc2626" stroke="#fca5a5" stroke-width="1.2"/></svg>`,
  };
  return icons[k] || `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="12" fill="#64748b"/></svg>`;
}
function specialtySvg(k) {
  const icons = {
    bubble_tea: `<svg viewBox="0 0 36 36"><path d="M11 12 H25 L23 31 H13 Z" fill="#d9a066" stroke="#fef3c7" stroke-width="1.6"/><rect x="9" y="10" width="18" height="3" rx="1.5" fill="#fff"/><line x1="20" y1="4" x2="18" y2="12" stroke="#ef4444" stroke-width="2.6" stroke-linecap="round"/><circle cx="15" cy="27" r="1.8" fill="#1c1917"/><circle cx="19" cy="28" r="1.8" fill="#1c1917"/><circle cx="21" cy="25" r="1.8" fill="#1c1917"/></svg>`,
    pineapple_cake: `<svg viewBox="0 0 36 36"><rect x="6" y="10" width="24" height="18" rx="4" fill="#f59e0b" stroke="#fef08a" stroke-width="1.6"/><line x1="6" y1="19" x2="30" y2="19" stroke="#dc2626" stroke-width="3"/><circle cx="18" cy="19" r="3.5" fill="#fde047"/></svg>`,
    mango_ice: `<svg viewBox="0 0 36 36"><path d="M7 22 H29 L25 31 H11 Z" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.4"/><polygon points="18,7 28,22 8,22" fill="#fffbeb"/><rect x="13" y="14" width="5" height="5" rx="1" fill="#facc15"/><rect x="19" y="15" width="5" height="5" rx="1" fill="#f59e0b"/><circle cx="18" cy="11" r="2.6" fill="#fde047"/></svg>`,
    kinmen_kaoliang: `<svg viewBox="0 0 36 36"><rect x="15" y="5" width="6" height="4" rx="1" fill="#dc2626"/><path d="M15 9 H21 L24 15 V30 H12 V15 Z" fill="#f8fafc" stroke="#2563eb" stroke-width="1.8"/><rect x="13" y="17" width="10" height="7" fill="#3b82f6" opacity=".8"/></svg>`,
    yilan_scallion: `<svg viewBox="0 0 36 36"><line x1="14" y1="30" x2="14" y2="19" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/><line x1="18" y1="30" x2="18" y2="18" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/><line x1="22" y1="30" x2="22" y2="19" stroke="#f8fafc" stroke-width="3.5" stroke-linecap="round"/><line x1="14" y1="19" x2="11" y2="6" stroke="#22c55e" stroke-width="3.4" stroke-linecap="round"/><line x1="18" y1="18" x2="18" y2="5" stroke="#16a34a" stroke-width="3.4" stroke-linecap="round"/><line x1="22" y1="19" x2="25" y2="6" stroke="#22c55e" stroke-width="3.4" stroke-linecap="round"/><rect x="11" y="18" width="14" height="3" rx="1" fill="#ef4444"/></svg>`,
    sun_moon_jade: `<svg viewBox="0 0 36 36"><path d="M9 24 Q18 19 27 24" fill="none" stroke="#dc2626" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="12" cy="14" rx="2.4" ry="7" transform="rotate(-18 12 14)" fill="#ef4444"/><ellipse cx="18" cy="11" rx="2.5" ry="8" fill="#facc15"/><ellipse cx="24" cy="14" rx="2.4" ry="7" transform="rotate(18 24 14)" fill="#38bdf8"/></svg>`,
    penghu_cactus: `<svg viewBox="0 0 36 36"><path d="M12 24 H24 L22 32 H14 Z" fill="#c2410c"/><rect x="15" y="10" width="6" height="14" rx="3" fill="#16a34a"/><path d="M15 17 H11 V13" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/><path d="M21 16 H25 V12" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/><circle cx="18" cy="9" r="2.6" fill="#f43f5e"/></svg>`,
    alishan_tea: `<svg viewBox="0 0 36 36"><path d="M10 15 H26 L23 30 H13 Z" fill="#b45309" stroke="#fde68a" stroke-width="1.4"/><ellipse cx="18" cy="14" rx="8" ry="4" fill="#16a34a"/><circle cx="15" cy="13" r="2.2" fill="#4ade80"/><circle cx="21" cy="13" r="2.2" fill="#22c55e"/></svg>`,
    hsinchu_wind: `<svg viewBox="0 0 36 36"><polygon points="18,6 24,18 18,30 12,18" fill="#38bdf8" stroke="#bae6fd" stroke-width="1.6"/><polygon points="12,14 4,10 8,24" fill="#0ea5e9" opacity=".85"/><polygon points="24,14 32,10 28,24" fill="#0ea5e9" opacity=".85"/></svg>`,
    yunlin_talisman: `<svg viewBox="0 0 36 36"><line x1="10" y1="5" x2="10" y2="32" stroke="#d97706" stroke-width="2.6" stroke-linecap="round"/><rect x="11" y="7" width="16" height="19" rx="2" fill="#facc15" stroke="#fef08a" stroke-width="1.4"/><rect x="15" y="11" width="8" height="10" fill="#dc2626"/></svg>`,
    sky_lantern: `<svg viewBox="0 0 36 36"><polygon points="11,8 25,8 27,22 18,28 9,22" fill="#fb923c" stroke="#fed7aa" stroke-width="1.6"/><circle cx="18" cy="24" r="2.5" fill="#fef08a"/></svg>`,
    wood_carving: `<svg viewBox="0 0 36 36"><ellipse cx="18" cy="19" rx="9" ry="11" fill="#92400e" stroke="#fde68a" stroke-width="1.2"/><circle cx="14" cy="15" r="3" fill="#facc15"/><circle cx="22" cy="15" r="3" fill="#facc15"/><circle cx="14" cy="15" r="1.2" fill="#111"/><circle cx="22" cy="15" r="1.2" fill="#111"/><polygon points="16,18 20,18 18,21" fill="#f59e0b"/></svg>`,
    xiaolongbao: `<svg viewBox="0 0 36 36"><ellipse cx="18" cy="24" rx="12" ry="6" fill="#d97706" stroke="#fde68a" stroke-width="1.4"/><circle cx="13" cy="18" r="4.5" fill="#f8fafc"/><circle cx="23" cy="18" r="4.5" fill="#f8fafc"/><circle cx="18" cy="14" r="4.5" fill="#fff"/></svg>`,
    keelung_tempura: `<svg viewBox="0 0 36 36"><line x1="18" y1="5" x2="18" y2="33" stroke="#fde68a" stroke-width="2.2"/><ellipse cx="18" cy="11" rx="7" ry="3.5" fill="#f59e0b"/><ellipse cx="18" cy="18" rx="7.5" ry="3.5" fill="#ea580c"/><ellipse cx="18" cy="25" rx="7" ry="3.5" fill="#f59e0b"/></svg>`,
    daxi_tofu: `<svg viewBox="0 0 36 36"><line x1="18" y1="5" x2="18" y2="33" stroke="#fde68a" stroke-width="2"/><rect x="11" y="8" width="14" height="6" rx="1.5" fill="#451a03" stroke="#92400e"/><rect x="11" y="16" width="14" height="6" rx="1.5" fill="#451a03" stroke="#92400e"/><rect x="11" y="24" width="14" height="6" rx="1.5" fill="#451a03" stroke="#92400e"/></svg>`,
    miaoli_strawberry: `<svg viewBox="0 0 36 36"><path d="M9 21 H27 L24 31 H12 Z" fill="#b45309"/><path d="M18 10 C13 10 11 16 18 23 C25 16 23 10 18 10 Z" fill="#e11d48"/><path d="M14 10 L18 7 L22 10" fill="#22c55e"/></svg>`,
    taitung_sugar_apple: `<svg viewBox="0 0 36 36"><circle cx="18" cy="20" r="10" fill="#4ade80" stroke="#15803d" stroke-width="1.6"/><circle cx="14" cy="17" r="2.5" fill="#86efac"/><circle cx="21" cy="18" r="2.5" fill="#86efac"/><circle cx="17" cy="24" r="2.5" fill="#86efac"/></svg>`,
    kaohsiung_anchor: `<svg viewBox="0 0 36 36"><path d="M7 20 Q18 10 29 20 L27 26 H9 Z" fill="#f8fafc" stroke="#1e3a8a" stroke-width="1.8"/><rect x="8" y="24" width="20" height="4" rx="1.5" fill="#1e3a8a"/><circle cx="18" cy="18" r="3" fill="#facc15"/></svg>`,
    pingtung_tuna: `<svg viewBox="0 0 36 36"><ellipse cx="17" cy="18" rx="11" ry="6" fill="#0284c7"/><polygon points="27,18 33,12 33,24" fill="#0369a1"/><polygon points="15,12 19,6 21,12" fill="#0369a1"/><circle cx="11" cy="17" r="1.6" fill="#fff"/></svg>`,
    changhua_meatball: `<svg viewBox="0 0 36 36"><polygon points="18,7 32,26 4,26" fill="#d97706" stroke="#92400e" stroke-width="1.8"/></svg>`,
    lanyu_flying_fish: `<svg viewBox="0 0 36 36"><ellipse cx="18" cy="19" rx="10" ry="4.5" fill="#06b6d4"/><polygon points="12,17 5,8 19,15" fill="#e0f2fe"/><polygon points="24,17 31,8 19,15" fill="#e0f2fe"/></svg>`,
    jiufen_gold: `<svg viewBox="0 0 36 36"><rect x="9" y="15" width="18" height="15" rx="3" fill="#78350f"/><polygon points="13,15 17,9 21,15" fill="#facc15"/><polygon points="19,15 23,10 26,15" fill="#fde047"/></svg>`,
    hualien_marble: `<svg viewBox="0 0 36 36"><polygon points="18,5 29,12 29,24 18,31 7,24 7,12" fill="#cbd5e1" stroke="#475569" stroke-width="1.8"/><polygon points="18,10 24,15 24,22 18,26 12,22 12,15" fill="#0f766e"/></svg>`,
    matsu_tears: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="9" fill="#38bdf8" stroke="#bae6fd" stroke-width="1.8"/><ellipse cx="18" cy="18" rx="14" ry="5" transform="rotate(-22 18 18)" fill="none" stroke="#7dd3fc" stroke-width="1.6"/></svg>`,
  };
  return icons[k] || `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="12" fill="#eab308"/></svg>`;
}

function togglePlayerKind(pid) {
  const tp = G && G.players[pid];
  if (!tp || tp.bankrupt || tp.kind === 'remote') return;
  if (NET.role === 'client') return toast('線上房間由房主管理 AI 切換');
  const nextKind = tp.kind === 'ai' ? 'local' : 'ai';
  send({ type: 'setKind', pid, kind: nextKind });
  if (nextKind === 'ai' && G.cur === pid && G.ask && !$('#modal').classList.contains('hidden')) {
    modalDoneCb = null;
    $('#modal').classList.add('hidden');
  }
  scheduleAuto();
}

let pdPreview = null;
function ensurePdPreview() {
  if (pdPreview) return pdPreview;
  const pvRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  pvRenderer.setSize(240, 260);
  pvRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  pvRenderer.outputColorSpace = THREE.SRGBColorSpace;
  pvRenderer.domElement.id = 'pdCanvas';
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#f8fafc', '#334155', 1.35));
  const key = new THREE.DirectionalLight('#fff6e5', 1.9);
  key.position.set(5, 8, 7);
  sc.add(key);
  const rim = new THREE.DirectionalLight('#7dd3fc', 0.9);
  rim.position.set(-6, 5, -6);
  sc.add(rim);
  const cam = new THREE.PerspectiveCamera(36, 240 / 260, 0.5, 100);
  cam.position.set(0, 1.4, 12.5);
  cam.lookAt(0, 0.2, 0);
  const root = new THREE.Group();
  const ped = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.5, 0.22, 28),
    new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.45, metalness: 0.55, emissive: '#0ea5e9', emissiveIntensity: 0.16 })
  );
  ped.position.y = -3.15;
  root.add(ped);
  sc.add(root);
  pdPreview = { renderer: pvRenderer, scene: sc, camera: cam, root, tok: null, rotY: 0.35, rotX: 0.08, dragging: false, paused: false };
  return pdPreview;
}
function updatePdPreviewModel(p) {
  const pv = ensurePdPreview();
  if (pv.tok) {
    pv.root.remove(pv.tok.g);
    pv.tok = null;
  }
  const tok = makeToken(p, { addToScene: false });
  tok.g.scale.setScalar(1.0);
  tok.g.position.set(0, -3.05, 0);
  pv.root.add(tok.g);
  pv.tok = tok;
  pv.renderer.render(pv.scene, pv.camera);
}
function bindPdStageEvents(stageEl) {
  if (!stageEl || stageEl._pdBound) return;
  stageEl._pdBound = true;
  let lastX = 0, lastY = 0;
  stageEl.addEventListener('pointerdown', e => {
    if (e.target && e.target.closest && e.target.closest('#pdSpinBtn')) return;
    const pv = ensurePdPreview();
    pv.dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stageEl.setPointerCapture?.(e.pointerId);
  });
  stageEl.addEventListener('pointermove', e => {
    if (!pdPreview || !pdPreview.dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    pdPreview.rotY += dx * 0.015;
    pdPreview.rotX = Math.max(-0.35, Math.min(0.45, pdPreview.rotX + dy * 0.01));
  });
  const endDrag = () => { if (pdPreview) pdPreview.dragging = false; };
  stageEl.addEventListener('pointerup', endDrag);
  stageEl.addEventListener('pointercancel', endDrag);
  stageEl.addEventListener('pointerleave', endDrag);
}

function openPlayerDetail(pid) {
  const p = G && G.players[pid];
  if (!p) return;
  const lands = R.lands(G, p);
  const worth = p.bankrupt ? 0 : R.netWorth(G, p);
  const vg = visibleGod(p);
  const god = vg ? R.GODS[vg.kind] : null;
  const canToggle = !p.bankrupt && p.kind !== 'remote' && NET.role !== 'client';
  openModal(`<div class="pd-showcase">
      <div class="pd-stage">
        <div id="pdStageMount"></div>
        <button type="button" id="pdSpinBtn" class="pd-spin-btn${pdPreview && pdPreview.paused ? ' paused' : ''}" title="切換自動旋轉 / 暫停">${pdPreview && pdPreview.paused ? '▶️ 旋轉' : '⏸️ 暫停'}</button>
        <div class="pd-stage-hint">👆 拖曳旋轉預覽 3D 棋子</div>
      </div>
      <div class="pd-head-info">
        <h2 style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${p.color}"></span>
          ${p.name}
          <small style="font-size:12px;color:var(--muted)">${p.bankrupt ? '💀 已破產' : p.kind === 'ai' ? '🤖 電腦 AI' : '👤 手動操作'}</small>
          ${canToggle ? `<button id="pdToggleKind" style="margin-left:auto;font-size:12px;padding:4px 10px">${p.kind === 'ai' ? '切換為手動' : '切換為 AI'}</button>` : ''}
        </h2>
        <div class="sub">
          ${god ? `<span class="god-badge ${god.good ? 'good' : 'bad'}">${god.icon} ${god.name}（剩 ${vg.turns} 回合）</span> ` : '目前無神明附身・'}
          ${p.jail ? '🔒 監獄中・' : ''}${p.skip ? '🏥 住院中・' : ''}${p.reverse ? '🔄 反向前進中・' : ''}${p.remote ? `🎯 遙控骰子 ${p.remote} 點・` : ''}
          所在位置：<b>${R.BOARD[p.pos]?.name || ''}</b>
        </div>
        <div class="pd-summary">
          <div class="pd-stat"><small>現金</small><b>$${p.cash.toLocaleString()}</b></div>
          <div class="pd-stat"><small>總資產</small><b>$${worth.toLocaleString()}</b></div>
          <div class="pd-stat"><small>地產數</small><b>${lands.length} 處</b></div>
          <div class="pd-stat"><small>骰子 / 道具</small><b>🎲${p.dice || 1}・🎒${p.items.length}/${R.MAX_ITEMS}</b></div>
        </div>
      </div>
    </div>
    <div class="pd-section">
      <h4>🎒 持有道具（${p.items.length}）</h4>
      ${p.items.length ? `<div class="pd-items">${p.items.map(k => {
        const it = R.ITEMS[k];
        return `<div class="pd-item"><span class="item-ico">${itemSvg(k)}</span><div class="item-meta"><b>${it.name}</b><small>${it.desc}</small></div></div>`;
      }).join('')}</div>` : '<div class="sub" style="margin:4px 0">目前沒有持有任何道具</div>'}
    </div>
    <div class="pd-section">
      <h4>🎁 各地特產收藏（${(p.specialties || []).length}/${Object.keys(R.SPECIALTIES).length}${(NET.role === 'local' ? !p.bankrupt : (mine(pid) && !p.bankrupt)) ? '・點擊即可穿戴／卸下修飾棋子' : ''}）</h4>
      ${(p.specialties && p.specialties.length) ? `<div class="pd-items">${p.specialties.map(k => {
        const sp = R.SPECIALTIES[k];
        if (!sp) return '';
        const eq = p.equipped && p.equipped[sp.slot] === k;
        const canEquip = NET.role === 'local' ? !p.bankrupt : (mine(pid) && !p.bankrupt);
        return `<button class="sp-card ${eq ? 'equipped' : ''}" data-sp="${k}" ${canEquip ? '' : 'disabled'}>
          <span class="item-ico">${specialtySvg(k)}</span>
          <div class="item-meta">
            <b>${sp.name}<span class="sp-slot">${R.SLOT_NAMES[sp.slot]}</span>${eq ? '<span class="sp-eq-tag">已裝備</span>' : ''}</b>
            <small>${sp.origin}・${sp.desc}</small>
          </div>
        </button>`;
      }).join('')}</div>` : '<div class="sub" style="margin:4px 0">購地、建設或造訪公園／廟宇／道具屋可獲得各地特產修飾棋子</div>'}
    </div>
    <div class="pd-section">
      <h4>👕 造型服飾與 🚗 專屬座駕（點擊穿戴／卸下）</h4>
      ${((p.outfits && p.outfits.length) || (p.cars && p.cars.length)) ? `<div class="pd-items">
        ${(p.outfits || []).map(k => {
          const of = R.OUTFITS[k]; if (!of) return '';
          const eq = p.equippedOutfit === k;
          const canEquip = NET.role === 'local' ? !p.bankrupt : (mine(pid) && !p.bankrupt);
          return `<button class="sp-card ${eq ? 'equipped' : ''}" data-outfit="${k}" ${canEquip ? '' : 'disabled'}>
            <span class="item-ico" style="font-size:22px;display:grid;place-items:center">${of.icon}</span>
            <div class="item-meta"><b>${of.name}<span class="sp-slot">造型</span>${eq ? '<span class="sp-eq-tag">穿戴中</span>' : ''}</b><small>${of.desc}</small></div>
          </button>`;
        }).join('')}
        ${(p.cars || []).map(k => {
          const car = R.CARS[k]; if (!car) return '';
          const eq = p.equippedCar === k;
          const canEquip = NET.role === 'local' ? !p.bankrupt : (mine(pid) && !p.bankrupt);
          return `<button class="sp-card ${eq ? 'equipped' : ''}" data-car="${k}" ${canEquip ? '' : 'disabled'}>
            <span class="item-ico" style="font-size:22px;display:grid;place-items:center">${car.icon}</span>
            <div class="item-meta"><b>${car.name}<span class="sp-slot">座駕</span>${eq ? '<span class="sp-eq-tag">駕駛中</span>' : ''}</b><small>${car.desc}</small></div>
          </button>`;
        }).join('')}
      </div>` : '<div class="sub" style="margin:4px 0">造訪「造型服飾店」與「汽車展示中心」即可購買並裝備造型與座駕！</div>'}
    </div>
    <div class="pd-section">
      <h4>🏙️ 名下地產（點擊地名跳轉地圖焦點）</h4>
      ${lands.length ? `<div class="pd-lands">${lands.map(i => {
        const t = R.BOARD[i], st = G.tiles[i];
        const gc = t.group ? R.GROUPS[t.group].color : '#38bdf8';
        const lvName = R.LEVEL_NAME[st.level || 0] || '空地';
        return `<button class="pd-land-row" data-jump="${i}">
          <span class="pd-dot" style="background:${gc}"></span>
          <span class="pd-land-name">${t.name}</span>
          <span class="pd-land-meta">${lvName}・過路費 $${R.rentOf(G, i).toLocaleString()}</span>
        </button>`;
      }).join('')}</div>` : '<div class="sub" style="margin:4px 0">目前名下沒有任何地產</div>'}
    </div>
    <div class="row">
      ${!p.bankrupt && p.id === G.cur && mine(p.id) && (G.phase === 'roll' || G.phase === 'done') && p.items.length ? '<button class="primary left" id="pdUseItems">🎒 使用道具</button>' : ''}
      <button class="close">關閉</button>
    </div>`, box => {
    const pv = ensurePdPreview();
    const mount = box.querySelector('#pdStageMount');
    if (mount) mount.appendChild(pv.renderer.domElement);
    updatePdPreviewModel(p);
    bindPdStageEvents(box.querySelector('.pd-stage'));
    const spinBtn = box.querySelector('#pdSpinBtn');
    if (spinBtn) {
      const syncSpinBtn = () => {
        spinBtn.classList.toggle('paused', !!pv.paused);
        spinBtn.innerHTML = pv.paused ? '▶️ 旋轉' : '⏸️ 暫停';
      };
      syncSpinBtn();
      spinBtn.onclick = e => {
        e.stopPropagation();
        pv.paused = !pv.paused;
        syncSpinBtn();
      };
    }
    box.querySelector('.close').onclick = closeModal;
    const tk = box.querySelector('#pdToggleKind');
    if (tk) tk.onclick = () => { closeModal(); togglePlayerKind(pid); openPlayerDetail(pid); };
    const uiBtn = box.querySelector('#pdUseItems');
    if (uiBtn) uiBtn.onclick = () => { closeModal(); openItems(); };
    box.querySelectorAll('[data-sp]').forEach(btn => {
      btn.onclick = () => {
        send({ type: 'equipSpecialty', pid, specialty: btn.dataset.sp });
        openPlayerDetail(pid);
      };
    });
    box.querySelectorAll('[data-outfit]').forEach(btn => {
      btn.onclick = () => {
        send({ type: 'equipOutfit', pid, outfit: btn.dataset.outfit });
        openPlayerDetail(pid);
      };
    });
    box.querySelectorAll('[data-car]').forEach(btn => {
      btn.onclick = () => {
        send({ type: 'equipCar', pid, car: btn.dataset.car });
        openPlayerDetail(pid);
      };
    });
    box.querySelectorAll('[data-jump]').forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.jump;
        closeModal();
        focusTileOnMap(idx);
        if (window.__showTileTipCenter) setTimeout(() => window.__showTileTipCenter(idx), 240);
      };
    });
  });
}

function renderPlayersAndTurn() {
  if (!G) return;
  $('#players').innerHTML = G.players.map((p, k) => {
    const vg = visibleGod(p);
    const god = vg ? R.GODS[vg.kind] : null;
    const godBadge = god ? `<span class="god-badge ${god.good ? 'good' : 'bad'}" title="${god.desc}">${god.icon}${god.name}(${vg.turns})</span>` : '';
    const canToggle = !p.bankrupt && p.kind !== 'remote' && NET.role !== 'client';
    const kindPill = canToggle
      ? `<button class="kind-btn ${p.kind === 'ai' ? 'ai' : 'manual'}" data-kind-pid="${k}" title="點擊切換 手動 / AI">${p.kind === 'ai' ? '🤖 AI' : '👤 手動'}</button>`
      : (p.kind === 'ai' ? ' <small>電腦</small>' : mine(k) && NET.role !== 'local' ? ' <small>你</small>' : '');
    const eqList = Object.values(p.equipped || {}).filter(Boolean);
    const itemsStrip = (p.items.length || eqList.length)
      ? `<div class="p-items">${p.items.map(it => `<span class="p-item-chip" title="${R.ITEMS[it]?.name || it}">${itemSvg(it)}</span>`).join('')}${eqList.map(sp => `<span class="p-item-chip sp" title="已裝備特產：${R.SPECIALTIES[sp]?.name || sp}">${specialtySvg(sp)}</span>`).join('')}</div>`
      : '';
    return `<div class="pcard clickable ${k === G.cur && G.phase !== 'over' ? 'cur' : ''} ${p.bankrupt ? 'out' : ''}" data-pid="${k}" style="--c:${p.color}" title="點擊查看詳細資料、道具與名下地產">
      <div class="av">${p.name[0]}</div>
      <b>${p.name}${kindPill}${p.jail ? ' <small>🔒監獄</small>' : ''}${p.skip ? ' <small>🏥住院</small>' : ''}${godBadge}</b>
      <div><span class="cash">$${p.cash.toLocaleString()}</span> <small>🎲${p.dice || 1}・地 ${R.lands(G, p).length}・道具 ${p.items.length}</small></div>
      ${itemsStrip}
    </div>`;
  }).join('');
  $('#players').querySelectorAll('.pcard[data-pid]').forEach(card => {
    card.onclick = () => openPlayerDetail(+card.dataset.pid);
  });
  $('#players').querySelectorAll('[data-kind-pid]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); togglePlayerKind(+btn.dataset.kindPid); };
  });
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
  if (isMoving()) whenWalkDone(() => { syncLog(); syncBranchMarkers(); });
  else { syncLog(); syncBranchMarkers(); }
  renderNews();

  // 機會／命運卡片快閃（僅在非自己抽卡確認時排隊提示，避免與抽卡視窗重疊）
  if (G.card && G.card.n !== lastCard) {
    lastCard = G.card.n;
    if (!my || !G.ask) {
      const c = G.card;
      enqueueUi(done => showCard(c, done));
    }
  }
  if (G.itemEvent && G.itemEvent.n !== lastItemEventN) {
    lastItemEventN = G.itemEvent.n;
    const ev = G.itemEvent;
    whenWalkDone(() => showItemToast(ev));
  }
  // 購買／同位置蓋樓升級／抽卡／道具屋詢問（一律等移動與前序彈窗結束後再依序開啟；路口選向改由地圖直接點擊）
  const askKey = G.ask ? `${G.turn}:${G.ask.k}:${G.ask.i}:${G.ask.bought ? G.ask.bought.length : 0}` : '';
  if (G.ask && G.ask.k !== 'branch' && my && shownAsk !== askKey) {
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

function eventHeroSvg(kind, t) {
  const grpColor = t && t.group && R.GROUPS[t.group] ? R.GROUPS[t.group].color : '#38bdf8';
  const svgs = {
    buy: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#0f2922"/><circle cx="34" cy="34" r="24" fill="#10b981" opacity=".2"/><polygon points="34,12 56,29 12,29" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/><rect x="17" y="29" width="34" height="24" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="1.8"/><rect x="29" y="38" width="10" height="15" rx="1.5" fill="#92400e"/><circle cx="51" cy="50" r="10" fill="#22c55e" stroke="#dcfce7" stroke-width="1.8"/><text x="51" y="54" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">$</text></svg>`,
    build: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#0d233a"/><circle cx="34" cy="34" r="24" fill="${grpColor}" opacity=".22"/><rect x="15" y="34" width="13" height="23" rx="2" fill="#38bdf8"/><rect x="27" y="18" width="17" height="39" rx="2.5" fill="#0ea5e9" stroke="#bae6fd" stroke-width="1.8"/><polygon points="35.5,9 39,18 32,18" fill="#fde047"/><rect x="44" y="27" width="10" height="30" rx="2" fill="#22d3ee"/><rect x="31" y="23" width="4" height="5" fill="#fef08a"/><rect x="37" y="23" width="4" height="5" fill="#fef08a"/><rect x="31" y="32" width="4" height="5" fill="#fef08a"/><rect x="37" y="32" width="4" height="5" fill="#fef08a"/><rect x="11" y="56" width="46" height="4" rx="2" fill="#facc15"/></svg>`,
    chance: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#2d1706"/><circle cx="34" cy="34" r="24" fill="#f97316" opacity=".25"/><rect x="16" y="11" width="36" height="46" rx="7" fill="#ea580c" stroke="#fed7aa" stroke-width="2.2"/><polygon points="36,19 25,36 33,36 30,50 43,32 35,32" fill="#fde047" stroke="#fffbeb" stroke-width="1.4"/></svg>`,
    fate: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#17163b"/><circle cx="34" cy="34" r="24" fill="#6366f1" opacity=".28"/><rect x="16" y="11" width="36" height="46" rx="7" fill="#3b82f6" stroke="#bfdbfe" stroke-width="2.2"/><circle cx="34" cy="33" r="11" fill="#1e1b4b" stroke="#93c5fd" stroke-width="1.8"/><polygon points="34,23 36.5,30 44,30 38,34.5 40,42 34,37.5 28,42 30,34.5 24,30 31.5,30" fill="#fde047"/></svg>`,
    shop: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#2b122c"/><circle cx="34" cy="34" r="24" fill="#ec4899" opacity=".24"/><path d="M34 12 C37 12 38 15 35 17 L52 26 L46 34 L42 31 V54 H26 V31 L22 34 L16 26 L33 17" fill="#f472b6" stroke="#fbcfe8" stroke-width="2" stroke-linejoin="round"/><circle cx="34" cy="28" r="4" fill="#fef08a"/></svg>`,
    cardshop: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#1b1433"/><circle cx="34" cy="34" r="24" fill="#a855f7" opacity=".25"/><rect x="13" y="16" width="24" height="33" rx="4" transform="rotate(-10 25 32)" fill="#7c3aed" stroke="#ddd6fe" stroke-width="1.8"/><rect x="29" y="18" width="24" height="33" rx="4" transform="rotate(8 41 34)" fill="#f59e0b" stroke="#fef08a" stroke-width="1.8"/><polygon points="41,25 43.5,31 50,31 45,35 47,41 41,37 35,41 37,35 32,31 38.5,31" fill="#fff"/></svg>`,
    autoshow: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#0f2036"/><circle cx="34" cy="34" r="24" fill="#38bdf8" opacity=".22"/><path d="M12 40 L17 28 Q21 22 31 22 H42 L51 30 L56 34 V44 H12 Z" fill="#ef4444" stroke="#fecaca" stroke-width="1.8"/><polygon points="22,29 26,24 39,24 44,29" fill="#bae6fd"/><circle cx="22" cy="45" r="6" fill="#1e293b" stroke="#cbd5e1" stroke-width="2"/><circle cx="46" cy="45" r="6" fill="#1e293b" stroke="#cbd5e1" stroke-width="2"/><circle cx="22" cy="45" r="2" fill="#facc15"/><circle cx="46" cy="45" r="2" fill="#facc15"/></svg>`,
    stock: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#0a241c"/><circle cx="34" cy="34" r="24" fill="#22c55e" opacity=".22"/><rect x="14" y="37" width="7" height="16" rx="1.5" fill="#ef4444"/><rect x="26" y="29" width="7" height="24" rx="1.5" fill="#22c55e"/><rect x="38" y="33" width="7" height="20" rx="1.5" fill="#22c55e"/><rect x="50" y="19" width="7" height="34" rx="1.5" fill="#4ade80"/><polyline points="12,35 28,24 41,28 56,14" fill="none" stroke="#fde047" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polygon points="56,14 48,14 55,21" fill="#fde047"/></svg>`,
    minigame: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#2d1313"/><circle cx="34" cy="34" r="24" fill="#fb7185" opacity=".22"/><circle cx="34" cy="34" r="20" fill="#ef4444" stroke="#fee2e2" stroke-width="2"/><circle cx="34" cy="34" r="13" fill="#fffbeb"/><circle cx="34" cy="34" r="7" fill="#dc2626"/><circle cx="34" cy="34" r="2.8" fill="#fde047"/></svg>`,
    casino: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#26132f"/><circle cx="34" cy="34" r="24" fill="#facc15" opacity=".2"/><rect x="12" y="21" width="23" height="23" rx="5" transform="rotate(-12 23 32)" fill="#fef9c3" stroke="#d97706" stroke-width="2"/><circle cx="20" cy="28" r="2.3" fill="#dc2626"/><circle cx="26" cy="36" r="2.3" fill="#dc2626"/><rect x="33" y="25" width="23" height="23" rx="5" transform="rotate(10 44 36)" fill="#fff" stroke="#64748b" stroke-width="2"/><circle cx="40" cy="32" r="2.1" fill="#0f172a"/><circle cx="44" cy="36" r="2.1" fill="#0f172a"/><circle cx="48" cy="40" r="2.1" fill="#0f172a"/></svg>`,
    specialty: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#2b1e06"/><circle cx="34" cy="34" r="24" fill="#eab308" opacity=".25"/><rect x="14" y="26" width="40" height="28" rx="5" fill="#f59e0b" stroke="#fef08a" stroke-width="2"/><rect x="12" y="21" width="44" height="9" rx="3" fill="#dc2626" stroke="#fecaca" stroke-width="1.6"/><rect x="31" y="21" width="6" height="33" fill="#fef08a"/><circle cx="28" cy="17" r="5" fill="#ef4444" stroke="#fef08a" stroke-width="1.5"/><circle cx="40" cy="17" r="5" fill="#ef4444" stroke="#fef08a" stroke-width="1.5"/></svg>`,
    item: `<svg viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg"><rect width="68" height="68" rx="14" fill="#0f2338"/><circle cx="34" cy="34" r="24" fill="#38bdf8" opacity=".24"/><rect x="18" y="19" width="32" height="36" rx="8" fill="#0284c7" stroke="#bae6fd" stroke-width="2"/><path d="M26 19 V14 Q34 10 42 14 V19" fill="none" stroke="#fde047" stroke-width="3"/><rect x="23" y="33" width="22" height="14" rx="4" fill="#0369a1" stroke="#7dd3fc" stroke-width="1.6"/><circle cx="34" cy="39" r="3" fill="#fde047"/></svg>`,
  };
  return svgs[kind] || svgs.buy;
}
function dlgHeroHtml(kind, title, t, subHtml, extraHtml = '') {
  const grp = t && t.group && R.GROUPS[t.group];
  const pill = grp ? `<span class="dlg-group-pill" style="--gc:${grp.color}">${grp.name}</span>` : (t ? `<span class="dlg-group-pill" style="--gc:#38bdf8">${t.name}</span>` : '');
  return `<div class="dlg-hero">
    <div class="dlg-hero-art">${eventHeroSvg(kind, t)}</div>
    <div class="dlg-hero-meta">
      <h2>${title}${pill}</h2>
      ${subHtml ? `<div class="dlg-hero-sub">${subHtml}</div>` : ''}
      ${extraHtml}
    </div>
  </div>`;
}
function showItemToast(ev) {
  if (!ev) return;
  const host = document.querySelector('main') || document.body;
  let el = $('.item-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'item-toast hidden';
    host.appendChild(el);
    el.onclick = () => { clearTimeout(el._t); el.classList.add('hidden'); };
  }
  const isSp = ev.kind === 'specialty';
  const sp = isSp ? R.SPECIALTIES[ev.key] : null;
  const it = !isSp ? R.ITEMS[ev.key] : null;
  const pl = G && G.players[ev.p];
  const tile = ev.tile != null ? R.BOARD[ev.tile] : null;
  const art = isSp ? specialtySvg(ev.key) : itemSvg(ev.key);
  const tag = isSp ? '🎁 獲得地方特產' : '🎒 獲得功能道具';
  const nameText = isSp ? (sp ? `${sp.icon} ${sp.name}` : ev.key) : (it ? `${it.icon} ${it.name}` : ev.key);
  const title = `${pl ? pl.name + ' 獲得 ' : ''}${nameText}`;
  const desc = isSp
    ? `${tile ? `來自「${tile.name}」・` : ''}${sp ? `${R.SLOT_NAMES[sp.slot] || '飾品'}・${sp.desc}` : ''}`
    : `${tile ? `來自「${tile.name}」・` : ''}${it ? it.desc : ''}`;
  el.innerHTML = `<div class="it-art">${art}</div><div class="it-meta"><div class="it-tag">${tag}</div><div class="it-title">${title}</div><div class="it-desc">${desc}</div></div>`;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), Math.round((isAllAi() ? 2200 : 3200) / Math.pow(SPEED, 0.85)));
}

function showCard(c, done) {
  const el = $('#cardPop');
  const isChance = c.kind === 'chance';
  el.style.setProperty('--c', isChance ? '#e67e22' : '#4f7fe0');
  el.innerHTML = `<div class="card-art">${eventHeroSvg(isChance ? 'chance' : 'fate')}</div><h3>${isChance ? '機 會' : '命 運'}</h3><p>${c.text}</p>`;
  el.classList.remove('hidden'); snd('card');
  clearTimeout(el._t);
  cardPopCb = done || null;
  el._t = setTimeout(() => dismissCardPop(), Math.round((isAllAi() ? 1500 : 2400) / Math.pow(SPEED, 0.85)));
}

function askPrompt(q) {
  if (!q || !G.ask || G.ask.k !== q.k || G.ask.i !== q.i) return;
  const t = R.BOARD[q.i], s = G.tiles[q.i], p = R.cur(G);
  if (q.k === 'branch') return;
  if (q.k === 'card') {
    const isChance = q.kind === 'chance';
    openModal(`${dlgHeroHtml(isChance ? 'chance' : 'fate', isChance ? '🎴 機會卡' : '🔮 命運卡', t, `${p.name} 停在「${t.name}」抽出一張卡片：`)}
      <div class="card-box" style="--c:${isChance ? '#e67e22' : '#4f7fe0'}">${q.text}</div>
      <div class="row"><button class="primary" id="aOk">確定執行</button></div>`, box => {
      box.querySelector('#aOk').onclick = () => { closeModal(); send({ type: 'answer', yes: true }); };
    });
    return;
  }
  if (q.k === 'casino') {
    const bets = q.bets || [500, 1500, 3000];
    openModal(`${dlgHeroHtml('casino', '🎰 海峽郵輪賭場', t, `前往金門途中的海上博弈殿堂！目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>`)}
      <div class="sub">規則：擲 2 顆骰子，總和 <b>≥ 8 點</b> 贏 <b>1 倍</b>；擲出<b>雙骰豹子</b>贏 <b>2 倍</b>；≤ 7 點輸掉籌碼。</div>
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
    const owned = p.outfits || [];
    openModal(`${dlgHeroHtml('shop', `👕 ${t.name}（造型服飾店）`, t, `購買造型立即穿戴在 3D 棋子上！目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>・已收藏 <b>${owned.length}/${Object.keys(R.OUTFITS).length}</b> 套`)}
      <div class="shop-grid">${Object.entries(R.OUTFITS).map(([k, of]) => {
        const has = owned.includes(k), eq = p.equippedOutfit === k;
        return `<button class="item-btn ${eq ? 'equipped' : ''}" data-outfit-buy="${k}" ${(!has && p.cash < of.price) ? 'disabled' : ''}>
          <span class="item-ico" style="font-size:24px;display:grid;place-items:center">${of.icon}</span>
          <div class="item-meta">
            <b>${of.name} ${has ? `<span class="sp-eq-tag">${eq ? '穿戴中' : '已擁有'}</span>` : `<span class="price">$${of.price.toLocaleString()}</span>`}</b>
            <small>${has ? (eq ? '點擊卸下造型' : '點擊立即換上此造型') : of.desc}</small>
          </div>
        </button>`;
      }).join('')}</div>
      <div class="row"><button class="primary" id="sDone">離開服飾店</button></div>`, box => {
      box.querySelector('#sDone').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-outfit-buy]').forEach(b => b.onclick = () => {
        const k = b.dataset.outfitBuy;
        if (owned.includes(k)) send({ type: 'equipOutfit', pid: p.id, outfit: k });
        else send({ type: 'buyOutfit', outfit: k });
        if (G.ask && G.ask.k === 'shop') askPrompt(G.ask);
      });
    });
    return;
  }
  if (q.k === 'cardshop') {
    const giftName = q.freeItem ? `${R.ITEMS[q.freeItem].icon} ${R.ITEMS[q.freeItem].name}` : '（背包已滿）';
    const bagFull = p.items.length >= R.MAX_ITEMS;
    openModal(`${dlgHeroHtml('cardshop', `🃏 ${t.name}（卡片道具屋）`, t, `免費贈禮：<b>${giftName}</b>・現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>・背包：<b>${p.items.length}/${R.MAX_ITEMS}</b>・骰子：<b>${p.dice || 1} 顆</b>`)}
      <div class="shop-grid">${Object.entries(R.ITEMS).map(([k, it]) => {
        const isDie = k === 'add_die';
        const hasTwo = isDie && (p.dice || 1) >= 2;
        const disabled = isDie ? (hasTwo || p.cash < it.price) : (bagFull || p.cash < it.price);
        return `<button class="item-btn" data-buy="${k}" ${disabled ? 'disabled' : ''}>
          <span class="item-ico">${itemSvg(k)}</span>
          <div class="item-meta">
            <b>${it.name} <span class="price">$${it.price}</span></b>
            <small>${hasTwo ? '已擁有 2 顆骰子（上限）' : it.desc}</small>
          </div>
        </button>`;
      }).join('')}${(() => {
        const ownedSp = (p.specialties || []).length, totalSp = Object.keys(R.SPECIALTIES).length;
        const spFull = ownedSp >= totalSp;
        return `<button class="item-btn" data-buy="specialty_box" ${(spFull || p.cash < 500) ? 'disabled' : ''}>
          <span class="item-ico">${specialtySvg('sky_lantern')}</span>
          <div class="item-meta">
            <b>🎁 台灣特產盲盒 <span class="price">$500</span></b>
            <small>${spFull ? `已集滿全部 ${totalSp} 種地方特產！` : `隨機獲得未擁有的各地特產飾品（已收集 ${ownedSp}/${totalSp}）`}</small>
          </div>
        </button>`;
      })()}</div>
      <div class="row"><button class="primary" id="sDone">離開卡片商店</button></div>`, box => {
      box.querySelector('#sDone').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
        send({ type: 'buyItem', item: b.dataset.buy });
        if (G.ask && G.ask.k === 'cardshop') askPrompt(G.ask);
      });
    });
    return;
  }
  if (q.k === 'autoshow') {
    const owned = p.cars || [];
    openModal(`${dlgHeroHtml('autoshow', `🚘 ${t.name}（汽車展示中心）`, t, `買車後角色會坐在車內駕駛移動，並播放引擎喇叭聲！目前現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>`)}
      <div class="shop-grid">${Object.entries(R.CARS).map(([k, car]) => {
        const has = owned.includes(k), eq = p.equippedCar === k;
        return `<button class="item-btn ${eq ? 'equipped' : ''}" data-car-buy="${k}" ${(!has && p.cash < car.price) ? 'disabled' : ''}>
          <span class="item-ico" style="font-size:24px;display:grid;place-items:center">${car.icon}</span>
          <div class="item-meta">
            <b>${car.name} ${has ? `<span class="sp-eq-tag">${eq ? '駕駛中' : '已擁有'}</span>` : `<span class="price">$${car.price.toLocaleString()}</span>`}</b>
            <small>${has ? (eq ? '點擊下車步行' : '點擊立即駕駛此座駕') : car.desc}</small>
          </div>
        </button>`;
      }).join('')}</div>
      <div class="row"><button class="primary" id="sDone">離開汽車展示中心</button></div>`, box => {
      box.querySelector('#sDone').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-car-buy]').forEach(b => b.onclick = () => {
        const k = b.dataset.carBuy;
        if (owned.includes(k)) send({ type: 'equipCar', pid: p.id, car: k });
        else send({ type: 'buyCar', car: k });
        if (G.ask && G.ask.k === 'autoshow') askPrompt(G.ask);
      });
    });
    return;
  }
  if (q.k === 'stock') {
    const bets = q.bets || [800, 2000, 4000];
    openModal(`${dlgHeroHtml('stock', `📈 ${t.name}`, t, `台股大盤即時開盤！選擇投入資金・現金：<b style="color:var(--gold)">$${p.cash.toLocaleString()}</b>`)}
      <div class="sub">行情波動：漲停 +100% / 小漲 +40% / 平盤 / 回檔 -40%</div>
      <div class="row" style="flex-wrap:wrap;gap:8px;justify-content:center">
        ${bets.map(b => `<button class="${b >= 4000 ? 'sky' : 'primary'}" data-invest="${b}" ${p.cash < b ? 'disabled' : ''}>📊 買進 $${b.toLocaleString()}</button>`).join('')}
        <button id="sNo">觀望不買</button>
      </div>`, box => {
      box.querySelector('#sNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-invest]').forEach(btn => btn.onclick = () => {
        closeModal();
        send({ type: 'answer', yes: true, invest: Number(btn.dataset.invest) });
      });
    });
    return;
  }
  if (q.k === 'minigame') {
    openModal(`${dlgHeroHtml('minigame', `🎯 ${t.name}`, t, `夜市九宮格／彈珠台開玩！有機會贏得最高 <b>$1,800</b> 大獎！`)}
      <div class="row" style="flex-wrap:wrap;gap:10px;justify-content:center">
        <button class="primary" data-pick="0">🏮 紅燈籠格</button>
        <button class="sky" data-pick="1">🎯 金彈珠格</button>
        <button class="primary" data-pick="2">🧧 財神福袋</button>
        <button id="mNo">不玩離開</button>
      </div>`, box => {
      box.querySelector('#mNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
      box.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
        closeModal();
        send({ type: 'answer', yes: true, pick: Number(btn.dataset.pick) });
      });
    });
    return;
  }

  const buy = q.k === 'buy', curLv = s.level || 0, nextLv = buy ? 0 : curLv + 1;
  const godHint = p.god ? (p.god.kind === 'tudigong' && buy ? '（土地公半價優惠）' : p.god.kind === 'fushen' && buy ? '（福神 8 折優惠）' : p.god.kind === 'shuaishen' ? '（衰神 1.5 倍漲價）' : '') : '';
  const spKey = R.specialtyOfTile ? R.specialtyOfTile(q.i) : null;
  const spObj = spKey ? R.SPECIALTIES[spKey] : null;
  const spChip = spObj ? `<div class="dlg-sp-chip">${specialtySvg(spKey)}<span>本區特產：<b>${spObj.icon} ${spObj.name}</b>（${R.SLOT_NAMES[spObj.slot] || '飾品'}）</span></div>` : '';
  if (buy) {
    openModal(`${dlgHeroHtml('buy', `🏡 要買下「${t.name}」的土地嗎？`, t, `首次抵達可置產，之後回到自家即可逐階擴建！`, spChip)}
      <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
        <span>購地價格</span><b>$${q.cost.toLocaleString()} ${godHint}</b>
        <span>目前現金</span><b>$${p.cash.toLocaleString()}</b></div>
      <div class="sub">首次抵達只能購買土地！之後每次再回到此地，即可依序蓋成：溫馨洋房 → 高級住宅 → 摩天大樓 → 五星飯店 → 連鎖旗艦店！</div>
      <div class="row">
        <button id="aNo">不要</button>
        <button class="primary" id="aYes">買下土地 ($${q.cost.toLocaleString()})</button>
      </div>`, box => {
      box.querySelector('#aYes').onclick = () => { closeModal(); send({ type: 'answer', yes: true }); };
      box.querySelector('#aNo').onclick = () => { closeModal(); send({ type: 'answer', yes: false }); };
    });
    return;
  }

  const remain = R.MAX_LEVEL - curLv;
  const curRent = R.rentAt(G, q.i, curLv), nextRent = R.rentAt(G, q.i, nextLv);
  const track = R.LEVEL_NAME.map((nm, idx) => {
    const cls = idx < curLv ? 'done' : idx === curLv ? 'cur' : idx === nextLv ? 'next' : '';
    return `<div class="lv-step ${cls}${idx >= 3 ? ' sky' : ''}">${idx === 3 ? '🏙️ ' : idx === 4 ? '🏨 ' : idx === 5 ? '👑 ' : ''}Lv.${idx}<br>${nm}</div>`;
  }).join('<span class="lv-arrow">→</span>');
  openModal(`${dlgHeroHtml('build', `🏗️ 回到自家「${t.name}」：逐階擴建`, t, `建築升級：<b>${R.LEVEL_NAME[curLv]}</b> → <b style="color:#4ade80">${R.LEVEL_NAME[nextLv]}</b>`, spChip)}
    <div class="lv-track">${track}</div>
    <div class="deal"><span>地點</span><b>${t.name}${t.group ? `（${R.GROUPS[t.group].name}）` : ''}</b>
      <span>擴建費用</span><b>$${q.cost.toLocaleString()} ${godHint}</b>
      <span>建築升級</span><b>${R.LEVEL_NAME[curLv]} → ${R.LEVEL_NAME[nextLv]}</b>
      <span>過路費躍升</span><b>$${curRent.toLocaleString()} → <span style="color:#4ade80">$${nextRent.toLocaleString()}</span></b>
      <span>現金</span><b>$${p.cash.toLocaleString()} → $${(p.cash - q.cost).toLocaleString()}</b></div>
    <div class="row">
      <button id="aNo">暫不擴建</button>
      <button class="${nextLv >= 3 ? 'sky' : 'primary'}" id="aYes">🏗️ 蓋成【${R.LEVEL_NAME[nextLv]}】($${q.cost.toLocaleString()})</button>
    </div>`, box => {
    box.querySelector('#aYes').onclick = () => { closeModal(); send({ type: 'answer', yes: true, levels: 1 }); };
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
  const mySpecialties = p.specialties || [];
  if (!mine(p.id) || (G.phase !== 'roll' && G.phase !== 'done')) return toast('現在無法使用道具');
  openModal(`<h2>🎒 道具與特產裝飾（功能 ${p.items.length}/${R.MAX_ITEMS}・特產 ${mySpecialties.length}/${Object.keys(R.SPECIALTIES).length}）</h2>
    <div class="sub">功能道具可在自己回合使用；各地獲得的特產不佔背包空間，可隨時穿戴修飾 3D 棋子！</div>
    ${p.items.length ? `<div class="items">${p.items.map(k => {
      const it = R.ITEMS[k];
      const dis = k === 'free' || (k === 'remote' && G.phase !== 'roll');
      return `<button class="item-btn" data-k="${k}" ${dis ? 'disabled' : ''}>
        <span class="item-ico">${itemSvg(k)}</span>
        <div class="item-meta"><b>${it.name}</b><small>${it.desc}</small></div>
      </button>`;
    }).join('')}</div>` : '<div class="sub" style="margin:6px 0">目前無功能道具</div>'}
    <div class="pd-section">
      <h4>🎁 各地特產飾品（點擊穿戴／卸下修飾棋子）</h4>
      ${mySpecialties.length ? `<div class="pd-items">${mySpecialties.map(k => {
        const sp = R.SPECIALTIES[k];
        if (!sp) return '';
        const eq = p.equipped && p.equipped[sp.slot] === k;
        return `<button class="sp-card ${eq ? 'equipped' : ''}" data-sp="${k}">
          <span class="item-ico">${specialtySvg(k)}</span>
          <div class="item-meta">
            <b>${sp.name}<span class="sp-slot">${R.SLOT_NAMES[sp.slot]}</span>${eq ? '<span class="sp-eq-tag">已裝備</span>' : ''}</b>
            <small>${sp.origin}・${sp.desc}</small>
          </div>
        </button>`;
      }).join('')}</div>` : '<div class="sub" style="margin:4px 0">買地、建設、參拜或逛道具屋即可獲得台灣各地特產！</div>'}
    </div>
    <div class="row"><button class="close">關閉</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelectorAll('[data-sp]').forEach(btn => btn.onclick = () => {
      send({ type: 'equipSpecialty', pid: p.id, specialty: btn.dataset.sp });
      openItems();
    });
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
  ・<b>78 格全台灣與三橫貫線立體地圖</b>：包含高鐵、台鐵、捷運、阿里山森林鐵路、蘇花山岳隧道、<b>北橫／中橫／南橫</b>三條跨島山地支線（經過交會處可自由選擇前進方向！），以及更悠閒的跨海渡輪／離島點位（小琉球／澎湖・七美／馬祖・東引／海峽賭場／金門・烈嶼／龜山島／綠島蘭嶼），各點位依地區特色呈現不同佔地規模！<br>
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
  const pid = (a.type === 'setRounds' || a.type === 'rename' || a.type === 'setKind' || a.type === 'equipSpecialty' || a.type === 'equipOutfit' || a.type === 'equipCar') ? (a.pid != null ? a.pid : [...NET.myIds][0] || 0) : G.cur;
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

let autoTimer = null, camWaitN = 0;
function scheduleAuto() {
  clearTimeout(autoTimer);
  if (!G || G.phase === 'over' || NET.role === 'client') { camWaitN = 0; return; }
  if (isMoving() || uiRunning || uiQueue.length > 0 || pendingRankModal || !$('#modal').classList.contains('hidden') || !$('#newsToast').classList.contains('hidden') || !$('#cardPop').classList.contains('hidden')) {
    autoTimer = setTimeout(scheduleAuto, Math.round(220 / Math.pow(SPEED, 0.6)));
    return;
  }
  const p = R.cur(G);
  if (p.kind === 'ai' && G.phase === 'roll' && camS.follow && camS.hasGoal && camS.focusMode !== 'dog' && !manualFocusPos && !document.hidden && tokens[G.cur] && camS.target.distanceTo(tokens[G.cur].g.position) > 95 && camWaitN < 6) {
    camWaitN++;
    autoTimer = setTimeout(scheduleAuto, Math.round(260 / Math.sqrt(SPEED)));
    return;
  }
  camWaitN = 0;
  const wait = Math.round((G.phase === 'roll' ? 560 : 380) / Math.pow(SPEED, 0.85));
  if (p.kind === 'ai') {
    autoTimer = setTimeout(() => {
      const a = R.aiAction(G);
      const e = R.act(G, p.id, a);
      if (e && a.type === 'item') R.act(G, p.id, { type: 'roll' });
      else if (e && G.phase === 'done') R.act(G, p.id, { type: 'end' });
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
    }, wait + Math.round(900 / Math.pow(SPEED, 0.85)));
  }
  if (p.kind === 'gone') autoTimer = setTimeout(() => { p.kind = 'ai'; scheduleAuto(); }, 300);
}

setInterval(() => { if (G) renderUIButtons(); }, 250);
function renderUIButtons() {
  if (!G) return;
  const p = R.cur(G), my = mine(p.id) && G.phase !== 'over';
  $('#btnRoll').textContent = (p.dice || 1) >= 2 ? '🎲🎲 擲雙骰' : '🎲 擲骰子';
  $('#btnRoll').disabled = !(my && G.phase === 'roll' && !animBusy());
  $('#btnItem').disabled = !(my && (G.phase === 'roll' || G.phase === 'done') && (p.items.length > 0 || (p.specialties && p.specialties.length > 0)) && !animBusy());
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
  lastCard = 0; lastMoveN = 0; lastNewsId = 0; lastBiteN = 0; lastHospitalN = 0; lastBankruptN = 0; lastGodFxN = 0; lastTransportN = 0; lastItemEventN = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
  diceAnim = null;
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
  openModal(`<h2>環島富豪 3D <span style="font-size:.65em;opacity:.75">v174</span></h2><div class="sub">原創 3D 台灣地產桌遊：125 格全台灣（含鄉鎮、美食、百貨、遊樂場、造型商店、汽車中心、股市與澎湖/金門離島不規則小地圖）、4 倍佔地 3D 霓虹造景、漸進 6 階地標建設、定點神明野狗與右上角 Breaking News！</div>
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
              lastCard = 0; lastMoveN = 0; lastNewsId = 0; lastBiteN = 0; lastHospitalN = 0; lastBankruptN = 0; lastGodFxN = 0; lastTransportN = 0; lastItemEventN = 0; shownAsk = null; lastRankRound = 0; pendingRankModal = false;
              diceAnim = null;
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
window.__rich = { get G() { return G; }, send, NET, camS, camCtl, renderUI, openLeaderboardModal, labelGroup, SEG_MODE, tileProps, dice, tokens, npcTokens, isMoving, isBiting: () => !!biteAnim, isAmbulance: () => !!ambAnim, isBankruptFx: () => !!bankruptAnim, isGodFx: () => !!godAnim, uiQueue, showNewsToast, dismissNewsToast };
