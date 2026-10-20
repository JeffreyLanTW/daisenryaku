'use strict';
// ===== 靜態資料：地形、兵種、陣營 =====

const SQ3 = Math.sqrt(3);

// 攻擊力陣列的對象順序
const CLASSES = ['soft', 'hard', 'heli', 'air', 'ship'];
const CLASS_NAME = { soft: '步兵', hard: '裝甲', heli: '直升機', air: '飛機', ship: '艦艇' };
const CLASS_SHORT = ['步', '甲', '直', '空', '艦'];

const SIDES = [
  { name: '聯邦軍', color: '#2f6fd0', dark: '#163a78', light: '#9cc0f5', trim: '#d8e4f2' },
  { name: '帝國軍', color: '#b8322c', dark: '#3d0f0f', light: '#f3a5a5', trim: '#d4a94a' },
];

// cost: 各移動類型進入此地形的消耗（未列出 = 不可進入）
// def: 地面部隊防禦加成 %
// heal: 可在此補給/修復的部隊類別；build: 可生產的部隊類別
const TERRAIN = {
  plain:    { name: '平原', def: 0,  cost: { foot: 1, tread: 1, air: 1 } },
  road:     { name: '道路', def: 0,  cost: { foot: 1, tread: 1, air: 1 } },
  bridge:   { name: '橋樑', def: 0,  cost: { foot: 1, tread: 1, air: 1, sea: 1 } },
  forest:   { name: '森林', def: 20, cost: { foot: 1, tread: 2, air: 1 } },
  hills:    { name: '丘陵', def: 30, cost: { foot: 2, tread: 2, air: 1 } },
  mountain: { name: '山岳', def: 40, cost: { foot: 3, air: 1 } },
  sea:      { name: '海洋', def: 0,  cost: { air: 1, sea: 1 } },
  city:     { name: '城市', def: 30, cost: { foot: 1, tread: 1, air: 1 }, income: 100, prop: true, heal: ['land'] },
  capital:  { name: '首都', def: 40, cost: { foot: 1, tread: 1, air: 1 }, income: 300, prop: true, heal: ['land', 'air'], build: ['land', 'air'] },
  factory:  { name: '工廠', def: 20, cost: { foot: 1, tread: 1, air: 1 }, income: 150, prop: true, heal: ['land'], build: ['land'] },
  airport:  { name: '機場', def: 10, cost: { foot: 1, tread: 1, air: 1 }, income: 100, prop: true, heal: ['air'], build: ['air'] },
  port:     { name: '港口', def: 20, cost: { foot: 1, tread: 1, air: 1, sea: 1 }, income: 100, prop: true, heal: ['sea', 'land'], build: ['sea'] },
};

// 共通兵種基礎數值。atk: 對 [步兵, 裝甲, 直升機, 飛機, 艦艇] 的攻擊力（滿血時約造成的 HP 傷害）
const BASE_UNITS = {
  inf:       { cls: 'soft', cat: 'land', mt: 'foot',  cost: 100,  move: 3, range: [1, 1], atk: [5, 1, 1, 0, 0], capture: true },
  atinf:     { cls: 'soft', cat: 'land', mt: 'foot',  cost: 250,  move: 2, range: [1, 1], atk: [3, 6, 3, 0, 0], capture: true },
  recon:     { cls: 'hard', cat: 'land', mt: 'tread', cost: 300,  move: 7, range: [1, 1], atk: [5, 2, 1, 0, 0] },
  tank:      { cls: 'hard', cat: 'land', mt: 'tread', cost: 600,  move: 5, range: [1, 1], atk: [6, 6, 1, 0, 2] },
  arty:      { cls: 'hard', cat: 'land', mt: 'tread', cost: 500,  move: 4, range: [2, 3], atk: [8, 6, 0, 0, 5] },
  rocket:    { cls: 'hard', cat: 'land', mt: 'tread', cost: 800,  move: 4, range: [3, 5], atk: [9, 7, 0, 0, 6] },
  aa:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 450,  move: 5, range: [1, 1], atk: [5, 2, 8, 6, 0] },
  sam:       { cls: 'hard', cat: 'land', mt: 'tread', cost: 700,  move: 4, range: [2, 5], atk: [0, 0, 9, 9, 0] },
  heli:      { cls: 'heli', cat: 'air',  mt: 'air',   cost: 700,  move: 6, range: [1, 1], atk: [6, 7, 4, 0, 4], fuel: 40, upkeep: 2 },
  fighter:   { cls: 'air',  cat: 'air',  mt: 'air',   cost: 900,  move: 9, range: [1, 1], atk: [0, 0, 7, 8, 0], fuel: 50, upkeep: 5 },
  attacker:  { cls: 'air',  cat: 'air',  mt: 'air',   cost: 1000, move: 8, range: [1, 1], atk: [7, 8, 0, 0, 8], fuel: 45, upkeep: 5 },
  destroyer: { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 900,  move: 6, range: [1, 2], atk: [5, 5, 5, 6, 7] },
};

// 陣營差異：名稱、數值調整與專屬兵種
const FACTIONS = [
  {
    name: '亞斯特聯邦', short: '聯邦', motto: '科技 · 機動 · 制空',
    desc: '空軍與精密武器領先，單位素質高但造價昂貴。專屬兵種「幽靈隱形機」攻擊時不會遭到反擊。',
    units: {
      inf:       { name: '游騎兵',     cost: 120, atk: [6, 1, 1, 0, 0], desc: '訓練精良的步兵，可佔領據點' },
      atinf:     { name: '標槍兵',     cost: 300, atk: [3, 7, 4, 0, 0], desc: '射後不理的反戰車飛彈，可佔領' },
      recon:     { name: '獵犬偵察車', move: 8, desc: '最快的地面單位，克制步兵' },
      tank:      { name: '雷霆戰車',   cost: 650, move: 6, desc: '高機動主力戰車，射控精準' },
      arty:      { name: '長弓自走砲', desc: '間接攻擊，移動後不可射擊' },
      rocket:    { name: '風暴火箭',   cost: 850, atk: [9, 8, 0, 0, 7], desc: '精確導引火箭，移動後不可射擊' },
      aa:        { name: '哨兵防空車', desc: '近距離防空，對步兵也有效' },
      sam:       { name: '神盾飛彈',   atk: [0, 0, 10, 10, 0], desc: '頂尖的遠程防空系統' },
      heli:      { name: '鷹眼直升機', cost: 750, atk: [6, 8, 4, 0, 5], desc: '長弓雷達導引的反裝甲直升機' },
      fighter:   { name: '隼式戰鬥機', cost: 950, move: 10, atk: [0, 0, 8, 9, 0], desc: '世界最強的制空戰機' },
      attacker:  { name: '雷鳴攻擊機', desc: '強力對地對艦打擊' },
      destroyer: { name: '守護者艦',   desc: '神盾防空驅逐艦，海上多用途' },
      stealth:   { name: '幽靈隱形機', cls: 'air', cat: 'air', mt: 'air', cost: 1400, move: 8, range: [1, 1],
                   atk: [7, 8, 6, 7, 7], fuel: 40, upkeep: 5, stealth: true, desc: '專屬：隱形多用途機，攻擊時不會遭到反擊' },
    },
  },
  {
    name: '瓦爾德帝國', short: '帝國', motto: '鋼鐵 · 火力 · 人海',
    desc: '裝甲厚重、砲兵強大，步兵便宜量多，但空軍較弱。專屬兵種「猛獁超重戰車」受到的傷害大幅減少。',
    units: {
      inf:       { name: '擲彈兵',     cost: 80, desc: '廉價而數量龐大的步兵，可佔領據點' },
      atinf:     { name: '鐵拳兵',     cost: 200, desc: '攜帶火箭筒的步兵，可佔領' },
      recon:     { name: '狼式裝甲車', cost: 280, move: 6, atk: [5, 3, 1, 0, 0], desc: '重裝甲偵察車' },
      tank:      { name: '巨熊戰車',   move: 4, atk: [7, 7, 1, 0, 2], armor: 0.85, desc: '厚重裝甲，承受傷害 -15%' },
      arty:      { name: '雷神重砲',   cost: 550, range: [2, 4], atk: [9, 7, 0, 0, 5], desc: '射程更遠的重型火砲，移動後不可射擊' },
      rocket:    { name: '烈焰火箭',   cost: 700, desc: '大範圍火力覆蓋，移動後不可射擊' },
      aa:        { name: '鋸齒防空車', atk: [6, 2, 8, 6, 0], desc: '四聯裝機砲，對步兵也很致命' },
      sam:       { name: '長矛飛彈',   cost: 650, desc: '遠程防空，移動後不可射擊' },
      heli:      { name: '鐵翼直升機', cost: 650, atk: [7, 6, 3, 0, 4], desc: '重武裝的突擊直升機' },
      fighter:   { name: '玄鷲戰鬥機', cost: 800, atk: [0, 0, 7, 7, 0], desc: '廉價的截擊機' },
      attacker:  { name: '鐵錘攻擊機', cost: 950, desc: '強力對地對艦打擊' },
      destroyer: { name: '怒濤艦',     atk: [5, 5, 4, 5, 8], desc: '重武裝的反艦驅逐艦' },
      heavy:     { name: '猛獁重戰車', cls: 'hard', cat: 'land', mt: 'tread', cost: 1300, move: 3, range: [1, 1],
                   atk: [8, 10, 2, 0, 4], armor: 0.5, desc: '專屬：超重戰車，承受傷害減半' },
    },
  },
];

// 實際使用的兵種表，鍵為「基礎_陣營」，例如 tank_0 = 聯邦戰車
const UNITS = {};
FACTIONS.forEach((f, side) => {
  for (const [base, over] of Object.entries(f.units)) {
    UNITS[`${base}_${side}`] = Object.assign({}, BASE_UNITS[base] || {}, over, { base, side });
  }
});
// 基礎名稱 + 陣營 → 實際兵種鍵
const ftype = (type, side) => UNITS[type] ? type : `${type}_${side}`;

const CAPTURE_POINTS = 20;
const START_FUNDS = 1500;
