'use strict';
// ===== 靜態資料：地形、兵種、陣營 =====

const SQ3 = Math.sqrt(3);

// 攻擊力陣列的對象順序（直升機與固定翼機統一併入「空」）
const CLASSES = ['soft', 'hard', 'air', 'ship'];
const CLASS_NAME = { soft: '步兵', hard: '裝甲', air: '空軍', ship: '艦艇', heli: '空軍' };
const CLASS_SHORT = ['步', '甲', '空', '艦'];

// 兩方的顯示色（名稱於開局時依國家設定）
const SIDES = [
  { name: '藍軍', color: '#2f6fd0', dark: '#163a78', light: '#9cc0f5', trim: '#d8e4f2' },
  { name: '紅軍', color: '#b8322c', dark: '#3d0f0f', light: '#f3a5a5', trim: '#d4a94a' },
];

// cost: 各移動類型進入此地形的消耗（未列出 = 不可進入）
// def: 地面部隊防禦加成 %
// heal: 可在此補給/修復的部隊類別；build: 可生產的部隊類別
const TERRAIN = {
  plain:    { name: '平原', def: 0,  cost: { foot: 1.1, tread: 1.1, amph: 1.1, air: 1 } },
  road:     { name: '道路', def: 0,  cost: { foot: 1, tread: 1, amph: 1, air: 1 } },
  rail:     { name: '鐵路', def: 0,  cost: { foot: 1, tread: 1, amph: 1, air: 1, rail: 1 } },
  bridge:   { name: '橋樑', def: 0,  cost: { foot: 1, tread: 1, amph: 1, air: 1, sea: 1 } },
  forest:   { name: '森林', def: 20, cost: { foot: 1, tread: 2, amph: 2, air: 1 } },
  hills:    { name: '丘陵', def: 30, cost: { foot: 2, tread: 2, amph: 2, air: 1 } },
  mountain: { name: '山岳', def: 40, cost: { foot: 3, air: 1 } },
  sea:      { name: '海洋', def: 0,  cost: { amph: 2, air: 1, sea: 1 } },
  city:     { name: '城市', def: 30, cost: { foot: 1, tread: 1, amph: 1, air: 1, rail: 1 }, income: 100, prop: true, heal: ['land'] },
  capital:  { name: '首都', def: 40, cost: { foot: 1, tread: 1, amph: 1, air: 1, rail: 1 }, income: 300, prop: true, heal: ['land', 'air'], build: ['land', 'air'] },
  factory:  { name: '工廠', def: 20, cost: { foot: 1, tread: 1, amph: 1, air: 1, rail: 1 }, income: 150, prop: true, heal: ['land'], build: ['land'] },
  airport:  { name: '機場', def: 10, cost: { foot: 1, tread: 1, amph: 1, air: 1 }, income: 100, prop: true, heal: ['air'], build: ['air'] },
  port:     { name: '港口', def: 20, cost: { foot: 1, tread: 1, amph: 1, air: 1, sea: 1 }, income: 100, prop: true, heal: ['sea', 'land'], build: ['sea'] },
};

// 共通兵種基礎數值。atk: 對 [步兵, 裝甲, 空軍, 艦艇] 的攻擊力（滿血時約造成的 HP 傷害）
const BASE_UNITS = {
  inf:       { cls: 'soft', cat: 'land', mt: 'foot',  cost: 100,  move: 3, range: [1, 1], atk: [5, 1, 0, 0], capture: true },
  atinf:     { cls: 'soft', cat: 'land', mt: 'foot',  cost: 250,  move: 2, range: [1, 1], atk: [3, 6, 0, 0], capture: true },
  recon:     { cls: 'hard', cat: 'land', mt: 'tread', cost: 300,  move: 7, range: [1, 1], atk: [5, 2, 0, 0] },
  tank:      { cls: 'hard', cat: 'land', mt: 'tread', cost: 600,  move: 5, range: [1, 1], atk: [6, 6, 0, 2] },
  arty:      { cls: 'hard', cat: 'land', mt: 'tread', cost: 500,  move: 4, range: [2, 3], atk: [8, 6, 0, 5] },
  rocket:    { cls: 'hard', cat: 'land', mt: 'tread', cost: 800,  move: 4, range: [3, 5], atk: [9, 7, 0, 6] },
  aa:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 450,  move: 5, range: [1, 1], atk: [5, 2, 7, 0] },
  sam:       { cls: 'hard', cat: 'land', mt: 'tread', cost: 700,  move: 4, range: [2, 5], atk: [0, 0, 9, 0] },
  heli:      { cls: 'air',  cat: 'air',  mt: 'air',   cost: 700,  move: 6, range: [1, 1], atk: [6, 9, 3, 4], fuel: 48, upkeep: 2 },
  fighter:   { cls: 'air',  cat: 'air',  mt: 'air',   cost: 900,  move: 9, range: [1, 1], atk: [0, 0, 8, 0], fuel: 65, upkeep: 4 },
  attacker:  { cls: 'air',  cat: 'air',  mt: 'air',   cost: 1000, move: 8, range: [1, 1], atk: [7, 8, 0, 8], fuel: 60, upkeep: 4 },
  destroyer: { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 900,  move: 3, range: [1, 1], atk: [4, 4, 5, 7] },
};

// 專屬兵種（只有部分國家擁有）
Object.assign(BASE_UNITS, {
  marine:  { cls: 'soft', cat: 'land', mt: 'amph', cost: 300, move: 4, range: [1, 1], atk: [5, 3, 0, 1], capture: true },
  bomber:  { cls: 'air', cat: 'air', mt: 'air', cost: 1500, move: 7, range: [1, 1], atk: [9, 9, 0, 9], fuel: 75, upkeep: 4 },
  stealth: { cls: 'air', cat: 'air', mt: 'air', cost: 1500, move: 8, range: [1, 1], atk: [8, 9, 0, 8], fuel: 60, upkeep: 4, stealth: true },
  // 搭載兵種：carry.cap 容量、allow 可搭載的移動類型、light 只能載輕型（價格 ≤ 500）、runway 須停在據點上才能卸載
  truck:   { cls: 'hard', cat: 'land', mt: 'tread', cost: 200, move: 7, range: [1, 1], atk: [0, 0, 0, 0], carry: { cap: 2, allow: ['foot'] } },
  thelico: { cls: 'air', cat: 'air', mt: 'air', cost: 500, move: 6, range: [1, 1], atk: [0, 0, 0, 0], fuel: 48, upkeep: 2, carry: { cap: 2, allow: ['foot'] } },
  airlift: { cls: 'air', cat: 'air', mt: 'air', cost: 800, move: 9, range: [1, 1], atk: [0, 0, 0, 0], fuel: 75, upkeep: 3, carry: { cap: 2, allow: ['foot', 'tread', 'amph'], light: true, runway: true } },
  lst:     { cls: 'ship', cat: 'sea', mt: 'sea', cost: 600, move: 3, range: [1, 1], atk: [0, 0, 0, 0], carry: { cap: 3, allow: ['foot', 'tread', 'amph'] } },
  carrier: { cls: 'ship', cat: 'sea', mt: 'sea', cost: 2400, move: 3, range: [1, 2], atk: [1, 1, 6, 2], maxHp: 20, armor: 0.8, carry: { cap: 4, allow: ['air'], deck: true } },
  train:   { cls: 'hard', cat: 'land', mt: 'rail', cost: 400, move: 12, range: [1, 1], atk: [0, 0, 0, 0], carry: { cap: 4, allow: ['foot', 'tread', 'amph'] } },
  // 澤火革 次世代自主科技/晶圓防禦兵種（動態 maxHp 與自主作戰）
  euv_fortress:    { cls: 'hard', cat: 'land', mt: 'tread', cost: 1600, move: 4, range: [1, 2], atk: [8, 10, 6, 7], maxHp: 20, armor: 0.75 },
  wafer_inf:       { cls: 'soft', cat: 'land', mt: 'foot',  cost: 400,  move: 4, range: [1, 1], atk: [7, 7, 3, 2], maxHp: 14, capture: true },
  laser_aa:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 1000, move: 5, range: [1, 4], atk: [6, 4, 12, 2], maxHp: 15 },
  nano_swarm:      { cls: 'air',  cat: 'air',  mt: 'air',   cost: 550,  move: 7, range: [1, 1], atk: [8, 9, 5, 6], maxHp: 6, fuel: 50, upkeep: 2, stealth: true },
  anduril_tank:    { cls: 'hard', cat: 'land', mt: 'tread', cost: 650,  move: 6, range: [1, 1], atk: [7, 8, 0, 3], maxHp: 8 },
  palantir_arty:   { cls: 'hard', cat: 'land', mt: 'tread', cost: 1200, move: 4, range: [3, 7], atk: [10, 9, 0, 8], maxHp: 14 },
  wingman_carrier: { cls: 'air',  cat: 'air',  mt: 'air',   cost: 2000, move: 8, range: [1, 2], atk: [7, 8, 9, 7], maxHp: 16, fuel: 75, upkeep: 3, carry: { cap: 3, allow: ['air'], deck: true } },
  // 工兵：可在己方城市建設工廠、機場或港口（見 BASE_TYPES）
  engineer:        { cls: 'soft', cat: 'land', mt: 'foot',  cost: 300,  move: 3, range: [1, 1], atk: [3, 1, 0, 0], engineer: true },
  usv_wolfpack:    { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 700,  move: 5, range: [1, 1], atk: [5, 5, 3, 9], maxHp: 8, stealth: true },
});
// ===== 擴充兵種（v83）：陸 9、空 4、海 7 種；sub 潛艦只能被具反潛能力（asw）的部隊攻擊 =====
Object.assign(BASE_UNITS, {
  ifv:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 450,  move: 6, range: [1, 1], atk: [6, 4, 1, 1] },
  sniper:     { cls: 'soft', cat: 'land', mt: 'foot',  cost: 200,  move: 3, range: [1, 2], atk: [7, 1, 0, 0], jungle: 10 },
  tankdest:   { cls: 'hard', cat: 'land', mt: 'tread', cost: 550,  move: 5, range: [1, 2], atk: [2, 8, 1, 2] },
  lighttank:  { cls: 'hard', cat: 'land', mt: 'tread', cost: 400,  move: 6, range: [1, 1], atk: [5, 4, 0, 1] },
  mortar:     { cls: 'soft', cat: 'land', mt: 'foot',  cost: 250,  move: 2, range: [2, 2], atk: [6, 3, 0, 1] },
  specops:    { cls: 'soft', cat: 'land', mt: 'foot',  cost: 350,  move: 4, range: [1, 1], atk: [6, 3, 0, 0], capture: true, jungle: 15 },
  tbm:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 1300, move: 3, range: [4, 8], atk: [10, 8, 0, 8] },
  manpads:    { cls: 'soft', cat: 'land', mt: 'foot',  cost: 200,  move: 3, range: [1, 1], atk: [1, 0, 7, 0] },
  coastal:    { cls: 'hard', cat: 'land', mt: 'tread', cost: 700,  move: 4, range: [2, 6], atk: [0, 0, 0, 10] },
  spsam:      { cls: 'hard', cat: 'land', mt: 'tread', cost: 600,  move: 5, range: [1, 3], atk: [1, 0, 8, 0] },
  apc:        { cls: 'hard', cat: 'land', mt: 'tread', cost: 250,  move: 6, range: [1, 1], atk: [3, 1, 0, 0], carry: { cap: 2, allow: ['foot'] } },
  hovercraft: { cls: 'hard', cat: 'land', mt: 'amph',  cost: 500,  move: 6, range: [1, 1], atk: [1, 0, 0, 0], carry: { cap: 2, allow: ['foot', 'tread', 'amph'] } },
  multirole:  { cls: 'air',  cat: 'air',  mt: 'air',   cost: 1100, move: 9, range: [1, 1], atk: [5, 6, 7, 6], fuel: 60, upkeep: 4 },
  uav:        { cls: 'air',  cat: 'air',  mt: 'air',   cost: 400,  move: 7, range: [1, 1], atk: [4, 5, 0, 3], fuel: 40, upkeep: 2, maxHp: 6 },
  mpa:        { cls: 'air',  cat: 'air',  mt: 'air',   cost: 900,  move: 9, range: [1, 1], atk: [0, 0, 0, 8], fuel: 80, upkeep: 3, asw: true },
  scoutheli:  { cls: 'air',  cat: 'air',  mt: 'air',   cost: 450,  move: 7, range: [1, 1], atk: [4, 3, 1, 1], fuel: 40, upkeep: 2, maxHp: 8 },
  submarine:  { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 900,  move: 3, range: [1, 1], atk: [0, 0, 0, 9], sub: true, stealth: true },
  frigate:    { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 650,  move: 4, range: [1, 1], atk: [3, 3, 5, 6], asw: true },
  corvette:   { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 450,  move: 5, range: [1, 1], atk: [2, 2, 3, 7], maxHp: 8 },
  cruiser:    { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 1400, move: 3, range: [1, 2], atk: [5, 5, 9, 8], maxHp: 14, asw: true },
  patrol:     { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 300,  move: 5, range: [1, 1], atk: [3, 2, 2, 4], maxHp: 7 },
  lhd:        { cls: 'ship', cat: 'sea',  mt: 'sea',   cost: 1500, move: 3, range: [1, 1], atk: [1, 1, 3, 1], maxHp: 16, carry: { cap: 4, allow: ['foot', 'tread', 'amph'] } },
});
BASE_UNITS.destroyer.asw = true;
BASE_UNITS.heli.asw = true;
// 各國擴充兵種名稱 [顯示名稱, 型號]；null＝該國沒有
const _ = null;
const MORE_ARMS = {
  TW: { ifv: ['CM-21', 'CM-21 裝甲步兵戰鬥車'], tankdest: ['拖式飛彈車', 'M1045 悍馬拖式飛彈車'], lighttank: ['M41D', 'M41D 輕戰車'], mortar: ['120迫砲', 'T-75 120mm 迫擊砲'], specops: ['海龍蛙兵', '海軍陸戰隊特勤隊'], tbm: ['雄昇', '雄昇巡弋飛彈車'], manpads: ['刺針', 'FIM-92 刺針飛彈班'], coastal: ['雄風岸置', '雄風二型岸置反艦飛彈'], spsam: ['陸射劍二', '陸射劍二防空系統'], apc: ['CM-21甲車', 'CM-21 裝甲運兵車'], hovercraft: ['LCAC', 'LCAC 氣墊登陸艇'],
    multirole: ['幻象2000-5', '幻象 2000-5 戰鬥機'], uav: ['中光', '中光無人機'], mpa: ['S-2T', 'S-2T 反潛機'], scoutheli: ['OH-58D', 'OH-58D 戰搜直升機'],
    submarine: ['海龍級', '海龍級潛艦'], frigate: ['康定級', '康定級巡防艦'], corvette: ['沱江級', '沱江級巡邏艦'], cruiser: _, patrol: ['光華六號', '光華六號飛彈快艇'], lhd: ['旭海艦', '旭海號船塢登陸艦'] },
  CN: { ifv: ['86式', '86式步兵戰車（BMP-1）'], tankdest: ['89式反坦克', '89式 120mm 自走反坦克炮'], lighttank: ['62式輕戰車', '62式輕型坦克'], mortar: ['82迫砲', '87式 82mm 迫擊砲'], specops: ['獵鷹特戰', '獵鷹突擊隊'], tbm: ['東風-11', '東風-11 戰術彈道飛彈'], manpads: ['前衛-1', '前衛-1 便攜防空飛彈'], coastal: ['鷹擊-62岸置', '鷹擊-62 岸艦飛彈'], spsam: ['紅旗-7', '紅旗-7 防空飛彈'], apc: ['85式運兵車', '85式裝甲輸送車'], hovercraft: ['野牛', '野牛級氣墊登陸艦'],
    multirole: ['殲-10', '殲-10 多用途戰鬥機'], uav: ['翼龍', '翼龍無人機'], mpa: ['運-8Q', '運-8Q 反潛巡邏機'], scoutheli: ['直-11', '直-11 輕型直升機'],
    submarine: ['宋級', '039型宋級潛艇'], frigate: ['江衛級', '053H3型江衛級護衛艦'], corvette: ['江島級', '056型江島級護衛艦'], cruiser: ['南昌級', '055型南昌級驅逐艦'], patrol: ['022型', '022型飛彈快艇'], lhd: ['海南級', '075型海南級兩棲攻擊艦'] },
  US: { ifv: ['M2布萊德雷', 'M2 布萊德雷步兵戰車'], tankdest: ['M901', 'M901 拖式飛彈車'], lighttank: ['M551', 'M551 謝里丹空降戰車'], mortar: ['M252迫砲', 'M252 81mm 迫擊砲'], specops: ['綠扁帽', '陸軍特種部隊（綠扁帽）'], tbm: ['ATACMS', 'MGM-140 ATACMS'], manpads: ['刺針', 'FIM-92 刺針飛彈班'], coastal: ['魚叉岸置', '魚叉岸置反艦飛彈'], spsam: ['復仇者', 'AN/TWQ-1 復仇者'], apc: ['M113', 'M113 裝甲運兵車'], hovercraft: ['LCAC', 'LCAC 氣墊登陸艇'],
    multirole: ['F/A-18C', 'F/A-18C 大黃蜂'], uav: ['MQ-1', 'MQ-1 掠奪者'], mpa: ['P-3C', 'P-3C 獵戶座'], scoutheli: ['OH-58D', 'OH-58D 奇歐瓦戰士'],
    submarine: ['洛杉磯級', '洛杉磯級核動力攻擊潛艦'], frigate: ['派里級', '派里級巡防艦'], corvette: ['颶風級', '颶風級巡邏艦'], cruiser: ['提康德羅加', '提康德羅加級巡洋艦'], patrol: ['Mk V', 'Mk V 特種作戰艇'], lhd: ['黃蜂級', '黃蜂級兩棲攻擊艦'] },
  JP: { ifv: ['89式FV', '89式裝甲戰鬥車'], tankdest: ['96式多目的', '96式多目的誘導彈系統'], lighttank: ['16式機動', '16式機動戰鬥車'], mortar: ['120RT', '120mm 迫擊砲 RT'], specops: ['特戰群', '特殊作戰群'], tbm: _, manpads: ['91式SAM', '91式攜帶地對空誘導彈'], coastal: ['88式SSM', '88式地對艦誘導彈'], spsam: ['81式短SAM', '81式短距離地對空誘導彈'], apc: ['73式APC', '73式裝甲車'], hovercraft: ['LCAC', 'LCAC 氣墊登陸艇'],
    multirole: ['F-4EJ改', 'F-4EJ改 幽靈'], uav: ['FFOS', 'FFOS 遙控觀測系統'], mpa: ['P-3C', 'P-3C 反潛機'], scoutheli: ['OH-1', 'OH-1 忍者偵察直升機'],
    submarine: ['春潮級', '春潮級潛水艦'], frigate: ['阿武隈級', '阿武隈級護衛艦'], corvette: ['隼級', '隼級飛彈艇'], cruiser: ['摩耶級', '摩耶級神盾護衛艦'], patrol: ['1號型', '1號型飛彈艇'], lhd: ['大隅級', '大隅級輸送艦'] },
  KR: { ifv: ['K21', 'K21 步兵戰鬥車'], tankdest: ['金屬風暴車', 'K242 拖式飛彈車'], lighttank: ['K21-105', 'K21-105 輕戰車'], mortar: ['K281迫砲', 'K281 81mm 自走迫擊砲'], specops: ['特戰司令部', '陸軍特殊戰司令部'], tbm: ['玄武-1', '玄武-1 彈道飛彈'], manpads: ['神弓', '神弓便攜防空飛彈'], coastal: ['海星岸置', '海星岸艦飛彈'], spsam: ['天馬', 'K-SAM 天馬防空系統'], apc: ['K200', 'K200 裝甲運兵車'], hovercraft: ['松鶴級', '松鶴級氣墊登陸艇'],
    multirole: ['KF-16', 'KF-16 戰隼'], uav: ['夜鷹', 'RQ-101 夜鷹無人機'], mpa: ['P-3C', 'P-3C 反潛機'], scoutheli: ['500MD', '500MD 偵察直升機'],
    submarine: ['張保皐級', '張保皐級潛艦'], frigate: ['蔚山級', '蔚山級巡防艦'], corvette: ['浦項級', '浦項級護衛艦'], cruiser: _, patrol: ['尹永夏級', '尹永夏級飛彈艇'], lhd: ['獨島級', '獨島級兩棲攻擊艦'] },
  KP: { ifv: ['VTT-323', 'VTT-323 裝甲車'], tankdest: ['9P133', '9P133 反坦克飛彈車'], lighttank: ['PT-85', 'PT-85 輕戰車'], mortar: ['120迫砲', 'M1943 120mm 迫擊砲'], specops: ['輕步兵旅', '特種作戰輕步兵旅'], tbm: ['飛毛腿-C', '火星-6（飛毛腿-C）'], manpads: ['箭-2', '9K32 箭-2'], coastal: ['蠶式岸置', 'HY-2 蠶式岸艦飛彈'], spsam: ['箭-10', '9K35 箭-10'], apc: ['VTT-323運兵', 'VTT-323 裝甲輸送車'], hovercraft: ['孔雀級', '孔雀級氣墊船'],
    multirole: ['MiG-23', 'MiG-23 鞭撻者'], uav: _, mpa: _, scoutheli: ['Mi-2', 'Mi-2 輕型直升機'],
    submarine: ['羅密歐級', '羅密歐級潛艇'], frigate: ['索霍級', '索霍級護衛艦'], corvette: ['昆蟲級', '昆蟲級飛彈艇'], cruiser: _, patrol: ['黃蜂級', '黃蜂級飛彈艇'], lhd: _ },
  PH: { ifv: ['M113A2', 'M113A2 裝甲車'], tankdest: _, lighttank: _, mortar: ['81迫砲', 'M29 81mm 迫擊砲'], specops: ['特種作戰團', '陸軍特種作戰團'], tbm: _, manpads: ['刺針', 'FIM-92 刺針'], coastal: ['布拉莫斯岸置', '布拉莫斯岸艦飛彈'], spsam: _, apc: ['M113運兵車', 'M113 裝甲運兵車'], hovercraft: _,
    multirole: _, uav: _, mpa: _, scoutheli: ['MD-520', 'MD 520 偵察直升機'],
    submarine: _, frigate: ['拉胡級', '德爾畢拉級巡防艦'], corvette: ['邁克級', '馬卡布洛斯級巡邏艦'], cruiser: _, patrol: ['達納加級', '達納加級巡邏艇'], lhd: ['塔拉克號', '塔拉克號船塢登陸艦'] },
  VN: { ifv: ['BMP-1', 'BMP-1 步兵戰車'], tankdest: ['9P148', '9P148 反坦克飛彈車'], lighttank: ['PT-76', 'PT-76 兩棲輕戰車'], mortar: ['120迫砲', 'M1938 120mm 迫擊砲'], specops: ['特工', '越南人民軍特工部隊'], tbm: ['飛毛腿-B', 'R-17 飛毛腿-B'], manpads: ['箭-2', '9K32 箭-2'], coastal: ['堡壘岸置', 'K-300P 堡壘岸艦飛彈'], spsam: ['箭-10', '9K35 箭-10'], apc: ['BTR-60', 'BTR-60 裝甲運兵車'], hovercraft: _,
    multirole: ['MiG-23', 'MiG-23 鞭撻者'], uav: _, mpa: _, scoutheli: ['Mi-2', 'Mi-2 輕型直升機'],
    submarine: ['基洛級', '基洛級潛艇'], frigate: ['BPS-500', 'BPS-500 輕護衛艦'], corvette: ['毒蜘蛛級', '毒蜘蛛級飛彈艇'], cruiser: _, patrol: ['黃蜂級', '黃蜂級飛彈艇'], lhd: _ },
  RU: { ifv: ['BMP-2', 'BMP-2 步兵戰車'], tankdest: ['9P149', '9P149 突擊反坦克車'], lighttank: ['2S25', '2S25 章魚自走反坦克炮'], mortar: ['2S12', '2S12 雪橇 120mm 迫擊砲'], specops: ['信號旗', '信號旗特種部隊'], tbm: ['圓點-U', '9K79 圓點-U'], manpads: ['針式', '9K38 針式'], coastal: ['堡壘岸置', 'K-300P 堡壘岸艦飛彈'], spsam: ['道爾-M1', '9K331 道爾-M1'], apc: ['BTR-80', 'BTR-80 裝甲運兵車'], hovercraft: ['野牛級', '野牛級氣墊登陸艦'],
    multirole: ['MiG-29SMT', 'MiG-29SMT 支點'], uav: ['蜜蜂-1', '蜜蜂-1T 無人機'], mpa: ['Il-38', 'Il-38 五月反潛機'], scoutheli: ['Ka-50', 'Ka-50 黑鯊'],
    submarine: ['阿庫拉級', '阿庫拉級核動力攻擊潛艇'], frigate: ['克里瓦克級', '克里瓦克級護衛艦'], corvette: ['毒蜘蛛級', '毒蜘蛛級飛彈艇'], cruiser: ['光榮級', '光榮級飛彈巡洋艦'], patrol: ['草蜢級', '草蜢級巡邏艇'], lhd: ['羅戈夫級', '伊萬·羅戈夫級大型登陸艦'] },
  IN: { ifv: ['薩拉特', 'BMP-2 薩拉特'], tankdest: ['NAMICA', 'NAMICA 反坦克飛彈車'], lighttank: ['PT-76', 'PT-76 輕戰車'], mortar: ['120迫砲', 'E1 120mm 迫擊砲'], specops: ['傘兵特種', '傘兵團特種部隊'], tbm: ['普里特維', '普里特維彈道飛彈'], manpads: ['針式', '9K38 針式'], coastal: ['布拉莫斯岸置', '布拉莫斯岸艦飛彈'], spsam: ['奧薩-AK', '9K33 奧薩-AK'], apc: ['OT-62', 'OT-62 裝甲運兵車'], hovercraft: _,
    multirole: ['MiG-29', 'MiG-29 支點'], uav: ['探索者', '探索者無人機'], mpa: ['Tu-142', 'Tu-142 熊式反潛機'], scoutheli: ['獵豹', 'SA 315 獵豹直升機'],
    submarine: ['辛杜戈什級', '辛杜戈什級潛艇'], frigate: ['戈達瓦里級', '戈達瓦里級巡防艦'], corvette: ['科拉級', '科拉級護衛艦'], cruiser: _, patrol: ['毒蜘蛛級', '毒蜘蛛級飛彈艇'], lhd: ['賈拉什瓦號', '賈拉什瓦號船塢登陸艦'] },
  PK: { ifv: ['M113', 'M113 裝甲車'], tankdest: ['馬茲', 'Maaz 反坦克飛彈車'], lighttank: _, mortar: ['120迫砲', '120mm 迫擊砲'], specops: ['特勤大隊', '特勤大隊（SSG）'], tbm: ['沙欣', '沙欣彈道飛彈'], manpads: ['安扎', '安扎便攜防空飛彈'], coastal: ['C-802岸置', 'C-802 岸艦飛彈'], spsam: ['響尾蛇', '響尾蛇防空飛彈'], apc: ['塔爾哈', '塔爾哈裝甲運兵車'], hovercraft: _,
    multirole: ['幻象III', '幻象 III 戰鬥機'], uav: ['沙赫帕', '沙赫帕無人機'], mpa: ['大西洋', '大西洋巡邏機'], scoutheli: ['雲雀III', '雲雀 III 直升機'],
    submarine: ['阿戈斯塔級', '阿戈斯塔級潛艦'], frigate: ['塔里克級', '塔里克級巡防艦（21型）'], corvette: ['賈拉特級', '賈拉特級飛彈艇'], cruiser: _, patrol: ['阿茲馬特級', '阿茲馬特級飛彈艇'], lhd: _ },
  GB: { ifv: ['戰士', 'FV510 戰士步兵戰車'], tankdest: ['打擊者', 'FV102 打擊者飛彈車'], lighttank: ['蠍式', 'FV101 蠍式輕戰車'], mortar: ['L16迫砲', 'L16 81mm 迫擊砲'], specops: ['SAS', '空降特勤隊（SAS）'], tbm: ['ATACMS', 'M270 ATACMS'], manpads: ['星光', '星光便攜防空飛彈'], coastal: ['飛魚岸置', 'MM38 飛魚岸置'], spsam: ['長劍', '追蹤式長劍'], apc: ['FV432', 'FV432 裝甲運兵車'], hovercraft: ['LCAC(L)', 'LCAC(L) 氣墊艇'],
    multirole: ['獵鷹GR7', '海獵鷹 GR7'], uav: ['不死鳥', '不死鳥無人機'], mpa: ['獵迷', '獵迷 MR2 巡邏機'], scoutheli: ['小羚羊', '小羚羊 AH1'],
    submarine: ['特拉法加級', '特拉法加級核動力潛艦'], frigate: ['23型', '23型公爵級巡防艦'], corvette: ['河級', '河級巡邏艦'], cruiser: _, patrol: ['射手級', '射手級巡邏艇'], lhd: ['海洋號', '海洋號直升機登陸艦'] },
  FR: { ifv: ['AMX-10P', 'AMX-10P 步兵戰車'], tankdest: ['VAB HOT', 'VAB 蒙特 HOT 飛彈車'], lighttank: ['AMX-13', 'AMX-13 輕戰車'], mortar: ['MO-120', 'MO-120 迫擊砲'], specops: ['外籍兵團', '外籍兵團第2傘兵團'], tbm: ['冥王星', '冥王星戰術飛彈'], manpads: ['西北風', '西北風便攜防空飛彈'], coastal: ['飛魚岸置', 'MM40 飛魚岸置'], spsam: ['響尾蛇', '響尾蛇防空系統'], apc: ['VAB', 'VAB 裝甲運兵車'], hovercraft: _,
    multirole: ['幻象F1', '幻象 F1 戰鬥機'], uav: ['紅隼', '紅隼無人機'], mpa: ['大西洋2', '大西洋 2 巡邏機'], scoutheli: ['小羚羊', 'SA 342 小羚羊'],
    submarine: ['紅寶石級', '紅寶石級核動力潛艦'], frigate: ['拉法葉級', '拉法葉級巡防艦'], corvette: ['花月級', '花月級巡防艦'], cruiser: _, patrol: ['P400級', 'P400 級巡邏艇'], lhd: ['西北風級', '西北風級兩棲攻擊艦'] },
  DE: { ifv: ['黃鼠狼', '黃鼠狼1步兵戰車'], tankdest: ['美洲豹1', '美洲豹1 反坦克車'], lighttank: ['鼬鼠', '鼬鼠空降戰鬥車'], mortar: ['120迫砲', 'Tampella 120mm 迫擊砲'], specops: ['KSK', '特種部隊司令部（KSK）'], tbm: _, manpads: ['刺針', 'FIM-92 刺針'], coastal: ['RBS-15岸置', 'RBS-15 岸艦飛彈'], spsam: ['羅蘭', '羅蘭2 防空系統'], apc: ['狐式', 'TPz 狐式裝甲車'], hovercraft: _,
    multirole: ['MiG-29G', 'MiG-29G 支點'], uav: ['CL-289', 'CL-289 偵察無人機'], mpa: ['大西洋', '大西洋巡邏機'], scoutheli: ['Bo105', 'Bo 105 偵察直升機'],
    submarine: ['206型', '206A型潛艦'], frigate: ['不來梅級', '不來梅級巡防艦'], corvette: ['布倫瑞克級', '布倫瑞克級護衛艦'], cruiser: _, patrol: ['143型', '143型信天翁級快艇'], lhd: _ },
  AU: { ifv: ['ASLAV', 'ASLAV 輪型裝甲車'], tankdest: _, lighttank: _, mortar: ['F2迫砲', 'F2 81mm 迫擊砲'], specops: ['SASR', '特種空勤團（SASR）'], tbm: _, manpads: ['刺針', 'FIM-92 刺針'], coastal: _, spsam: ['NASAMS', 'NASAMS 防空系統'], apc: ['M113AS4', 'M113AS4 裝甲車'], hovercraft: _,
    multirole: ['鷹式127', '鷹式 127 戰鬥教練機'], uav: ['蒼鷺', '蒼鷺無人機'], mpa: ['P-3C', 'AP-3C 獵戶座'], scoutheli: ['基奧瓦', 'OH-58 基奧瓦'],
    submarine: ['柯林斯級', '柯林斯級潛艦'], frigate: ['阿德萊德級', '阿德萊德級巡防艦'], corvette: ['阿米代爾級', '阿米代爾級巡邏艦'], cruiser: _, patrol: ['弗里曼特爾級', '弗里曼特爾級巡邏艇'], lhd: ['坎培拉級', '坎培拉級兩棲攻擊艦'] },
  IL: { ifv: ['阿奇扎里特', '阿奇扎里特重型步兵戰車'], tankdest: ['M113拖式', 'M113 拖式飛彈車'], lighttank: _, mortar: ['卡多姆', '卡多姆 120mm 迫擊砲'], specops: ['總參偵察營', '總參謀部偵察營'], tbm: ['傑里科', '傑里科彈道飛彈'], manpads: ['刺針', 'FIM-92 刺針'], coastal: ['加百列岸置', '加百列岸艦飛彈'], spsam: ['鐵穹', '鐵穹防空系統'], apc: ['M113', 'M113 裝甲運兵車'], hovercraft: _,
    multirole: ['F-16C', 'F-16C 霹靂'], uav: ['蒼鷺', '蒼鷺無人機'], mpa: _, scoutheli: ['500MD', '500MD 防禦者'],
    submarine: ['海豚級', '海豚級潛艦'], frigate: ['薩爾5', '薩爾5 型護衛艦'], corvette: ['薩爾6', '薩爾6 型護衛艦'], cruiser: _, patrol: ['德沃拉級', '德沃拉級巡邏艇'], lhd: _ },
};
// 補齊：讓各國兵種數至少為原本兩倍
Object.assign(MORE_ARMS.PH, { tankdest: ['悍馬拖式', '悍馬拖式飛彈車'], lighttank: ['薩布拉', '薩布拉輕戰車'], spsam: ['SPYDER', 'SPYDER 防空系統'], multirole: ['FA-50PH', 'FA-50PH 戰鬥攻擊機'], uav: ['赫爾墨斯', '赫爾墨斯 900 無人機'], mpa: ['C-208B', 'C-208B 海上巡邏機'], submarine: ['鮋魚級', '鮋魚級潛艦'] });
Object.assign(MORE_ARMS.IL, { mpa: ['西風', 'IAI 西風海上巡邏機'] });
Object.assign(MORE_ARMS.AU, { tankdest: ['ASLAV-AT', 'ASLAV 反裝甲型'], coastal: ['NSM岸置', 'NSM 岸艦飛彈'] });
Object.assign(MORE_ARMS.VN, { uav: ['VT-Patrol', 'VT-Patrol 無人機'], mpa: ['DHC-6', 'DHC-6 海上巡邏機'], lhd: ['HQ-571', 'HQ-571 運輸登陸艦'] });
Object.assign(MORE_ARMS.KP, { uav: ['白頭山', '白頭山無人機'], lhd: ['南浦級', '南浦級登陸艦'] });
Object.assign(MORE_ARMS.IN, { hovercraft: ['H-187', 'H-187 氣墊艇'] });
Object.assign(MORE_ARMS.FR, { hovercraft: ['L-CAT', 'L-CAT 雙體登陸艇'] });
Object.assign(MORE_ARMS.US, { bomber: ['B-52H', 'B-52H 同溫層堡壘'] });
Object.assign(MORE_ARMS.RU, { stealth: ['Su-57', 'Su-57 重罪犯'] });
Object.assign(MORE_ARMS.CN, { stealth: ['殲-20', '殲-20 威龍'] });
const SNIPERS = { TW: '國軍狙擊組', CN: '解放軍狙擊組', US: 'M24 狙擊組', JP: '狙擊班', KR: 'K14 狙擊組', KP: '狙擊兵', PH: '偵察狙擊組', VN: 'SVD 狙擊組', RU: 'SVD 狙擊組', IN: '德拉古諾夫狙擊組', PK: '狙擊組', GB: 'L96 狙擊組', FR: 'FR-F2 狙擊組', DE: 'G22 狙擊組', AU: 'SR-98 狙擊組', IL: 'M24 狙擊組' };
for (const [nid, n] of Object.entries(SNIPERS)) MORE_ARMS[nid].sniper = [n.replace(/ ?狙擊組$/, '') + '狙擊', n];
MORE_ARMS.TSMC = MORE_ARMS.TW;
MORE_ARMS.USCORP = MORE_ARMS.US;
const RAIL_COST = 200;
// 各國搭載兵種（1990 年代初期）
const TRANSPORTS = {
  TW: { truck: ['M35卡車', 'M35 2.5 噸卡車'], thelico: ['UH-1H', 'UH-1H 通用直升機'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['中字號', '中字號戰車登陸艦'] },
  TSMC: { truck: ['晶圓運輸車', '重裝甲半導體運輸車'], thelico: ['奈米運載機', '智慧自律運輸直升機'], airlift: ['矽盾運輸機', '高速次世代戰術運輸機'], lst: ['神山登陸艦', '重型兩棲運載巡防艦'] },
  USCORP: { truck: ['自主運輸車', 'Anduril 自律無人運輸車'], thelico: ['V-280勇氣', 'V-280 傾斜旋翼機'], airlift: ['C-17', 'C-17 環球霸王III'], lst: ['遠征支援艦', '自律遠征支援艦'] },
  CN: { truck: ['解放卡車', '解放牌軍用卡車'], thelico: ['直-8', '直-8 運輸直升機'], airlift: ['運-8', '運-8 運輸機'], lst: ['玉康級', '072型玉康級登陸艦'] },
  US: { truck: ['M939卡車', 'M939 5 噸卡車'], thelico: ['UH-60A', 'UH-60A 黑鷹'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['新港級', '新港級戰車登陸艦'] },
  JP: { truck: ['73式卡車', '73式大型卡車'], thelico: ['CH-47J', 'CH-47J 契努克'], airlift: ['C-1', 'C-1 運輸機'], lst: ['三浦級', '三浦級運輸艦'] },
  KR: { truck: ['K511卡車', 'K511 2.5 噸卡車'], thelico: ['UH-60P', 'UH-60P 黑鷹'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['雲峰級', '雲峰級戰車登陸艦'] },
  KP: { truck: ['勝利卡車', '勝利-58 卡車'], thelico: ['Mi-8', 'Mi-8 河馬'], airlift: ['Il-76', 'Il-76 運輸機'], lst: ['韓泰級', '韓泰級登陸艦'] },
  PH: { truck: ['M35卡車', 'M35 2.5 噸卡車'], thelico: ['UH-1H', 'UH-1H 通用直升機'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['LST-542級', 'LST-542 級戰車登陸艦'] },
  VN: { truck: ['ZIL-131', 'ZIL-131 卡車'], thelico: ['Mi-8', 'Mi-8 河馬'], airlift: ['An-26', 'An-26 運輸機'], lst: ['波爾諾尼級', '波爾諾尼級登陸艦'] },
  RU: { truck: ['Ural卡車', 'Ural-4320 卡車'], thelico: ['Mi-8', 'Mi-8 河馬'], airlift: ['Il-76', 'Il-76 運輸機'], lst: ['蟾蜍級', '蟾蜍級登陸艦'] },
  IN: { truck: ['塔塔卡車', '塔塔軍用卡車'], thelico: ['Mi-8', 'Mi-8 河馬'], airlift: ['An-32', 'An-32 運輸機'], lst: ['馬加爾級', '馬加爾級登陸艦'] },
  PK: { truck: ['M35卡車', 'M35 2.5 噸卡車'], thelico: ['美洲獅', 'SA 330 美洲獅'], airlift: ['C-130B', 'C-130B 力士型運輸機'], lst: null },
  GB: { truck: ['貝福德卡車', '貝福德 MK 卡車'], thelico: ['CH-47', 'CH-47 契努克 HC1'], airlift: ['C-130K', 'C-130K 力士型運輸機'], lst: ['騎士級', '騎士級後勤登陸艦'] },
  FR: { truck: ['GBC180', 'GBC 180 卡車'], thelico: ['美洲獅', 'SA 330 美洲獅'], airlift: ['C-160', 'C-160 協同運輸機'], lst: ['暴風級', '暴風級船塢登陸艦'] },
  DE: { truck: ['MAN卡車', 'MAN 7 噸卡車'], thelico: ['CH-53G', 'CH-53G 運輸直升機'], airlift: ['C-160', 'C-160 協同運輸機'], lst: null },
  AU: { truck: ['Mack卡車', 'Mack 軍用卡車'], thelico: ['S-70A', 'S-70A 黑鷹'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['托布魯克號', '托布魯克號重型登陸艦'] },
  IL: { truck: ['M35卡車', 'M35 2.5 噸卡車'], thelico: ['CH-53', 'CH-53 海上種馬'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: null },
};
// 工兵可建設的基地種類：城市 → 基地。pts 建設點數（每回合扣除工兵 HP），sea 須臨海
const BASE_TYPES = {
  factory: { name: '工廠', icon: '🏭', cost: 1000, pts: 20, desc: '生產與補給地面部隊' },
  airport: { name: '機場', icon: '✈️', cost: 1200, pts: 20, desc: '生產與補給飛機' },
  port:    { name: '港口', icon: '⚓', cost: 1000, pts: 20, sea: true, desc: '生產艦艇，補給艦艇與地面部隊' },
};
const BASE_DESC = {
  ifv: '步兵戰鬥車：快速、對步兵強，具備反裝甲飛彈', sniper: '狙擊組：便宜的反步兵部隊，射程 1–2', tankdest: '反戰車車：射程 2 的反裝甲飛彈，對戰車極強', lighttank: '輕戰車：便宜、機動高的輕型裝甲',
  mortar: '迫擊砲班：便宜的步兵間接火力（射程 2），移動後不可射擊', specops: '特種部隊：高機動、可佔領，叢林山地額外防禦', tbm: '戰術彈道飛彈：射程 4–8 的超遠程打擊，移動後不可射擊',
  manpads: '單兵防空：便宜的步兵防空飛彈班', coastal: '岸置反艦飛彈：射程 2–6，專打艦艇', spsam: '短程防空飛彈車：射程 1–3 的機動防空',
  apc: '裝甲運兵車：可搭載 2 隊步兵，具輕武裝', hovercraft: '氣墊登陸艇：可在海陸行駛，搭載 2 隊地面部隊',
  multirole: '多用途戰機：對空對地對艦均衡', uav: '無人機：便宜的對地攻擊機，血量低', mpa: '反潛巡邏機：遠航程，專門獵殺艦艇與潛艦', scoutheli: '偵察直升機：便宜、快速的輕武裝直升機',
  submarine: '潛艦：只能被反潛部隊（驅逐艦、巡防艦、巡洋艦、直升機、反潛機）攻擊，攻擊時不受反擊', frigate: '巡防艦：便宜的反潛護衛艦', corvette: '飛彈快艇／護衛艦：高速、反艦火力強',
  cruiser: '巡洋艦：強大的艦隊防空與反艦火力，射程 2', patrol: '巡邏艇：便宜的沿岸艦艇', lhd: '兩棲突擊艦：可搭載 4 隊地面部隊，高耐久',
  engineer: '戰鬥工兵：在己方城市建設工廠、機場或港口（臨海），約 2 回合完成，增加生產與補給據點',
  inf: '基本步兵，可佔領據點', atinf: '攜帶反戰車武器的步兵，可佔領據點', recon: '高機動偵察車，克制步兵',
  tank: '主力戰車，攻守兼備', arty: '間接攻擊，移動後不可射擊', rocket: '遠程火箭，移動後不可射擊',
  aa: '近距離防空，對步兵也有效', sam: '遠程防空飛彈，移動後不可射擊', heli: '反裝甲攻擊直升機，克制戰車但懼怕防空',
  fighter: '制空戰鬥機，每回合消耗燃料', attacker: '對地對艦攻擊機', destroyer: '水面作戰艦艇',
  marine: '兩棲陸戰隊，可渡海登陸並佔領據點', bomber: '重型轟炸機，對地對艦火力強大', stealth: '匿蹤攻擊機，攻擊時不會遭到反擊',
  truck: '運輸卡車，可搭載 2 隊步兵', thelico: '運輸直升機，可搭載 2 隊步兵，任何地點卸載',
  airlift: '運輸機，可搭載 2 隊步兵或輕型車輛，須停在據點上卸載', lst: '登陸艦，可搭載 3 隊地面部隊並搶灘卸載',
  train: '軍用列車，只能在鐵路上行駛，可搭載 4 隊地面部隊',
  carrier: '航空母艦：HP 18 超重裝甲防護，可搭載 4 架艦載機，自帶密集陣近防與防空飛彈；艦載戰機提供空中巡邏防空攔截（CAP），艦上飛機每回合補給燃料並修復',
  euv_fortress: '台積電極紫外光防護堡壘：HP 20 超重型護盾，承受傷害降為 75%，配備近遠程雙重攻擊',
  wafer_inf: '晶圓外骨骼衛隊：HP 14 先進奈米動力外骨骼裝甲，具備快速攻佔據點能力',
  laser_aa: '矽光子雷射防空：HP 15 長程固態高能雷射防禦，極大克制空軍與蜂群',
  nano_swarm: '奈米遊蕩蜂群：HP 6 匿蹤微型自殺蜂群，穿透力強大，對各類目標致命突擊',
  anduril_tank: '安杜里爾狼群戰車：HP 8 高機動分散式自主裝甲，演算法協同獵殺',
  palantir_arty: '帕蘭提爾軌道火控砲：HP 14 射程 3~7 超遠程 AI 精準衛星連線導引打擊',
  wingman_carrier: '忠誠僚機母艦：HP 16 次世代空中旗艦母機，可搭載補給 3 架戰機/蜂群並具備防空反擊',
  usv_wolfpack: '自主無人作戰艦：HP 8 匿蹤水面無人攔截艇，長程反艦與突防',
};

// 16 國（1990 年代初期裝備）。units: [顯示名稱, 型號說明]；null 表示該國沒有此兵種
// mods: [對象, 調整]，對象可為兵種、'all'、'land'/'air'/'sea'、'soft'/'hard'
//   cost 價格倍率、atk 攻擊力增減、move 移動增減、armor 承受傷害倍率、range 射程、jungle 森林/丘陵/山岳額外防禦%
// prefer：電腦生產偏好倍率；adj：平衡用整體價格倍率
const NATIONS = {
  TW: {
    name: '台灣', full: '中華民國國軍', army: '國軍', code: 'TW', style: 'west', camo: '#5d6b45',
    doctrine: '固守台澎', desc: '依托島嶼地形與綿密防空網固守，地面部隊受到的傷害較低，防空武器精良；攻擊力量有限。',
    units: {
      inf: ['國軍步兵', '65式步槍步兵'], atinf: ['拖式飛彈組', 'BGM-71 拖式反戰車飛彈'], recon: ['V-150突擊車', 'V-150 輪型突擊車'],
      tank: ['M48H勇虎', 'M48H 勇虎戰車（CM-11）'], arty: ['M109A2', 'M109A2 155mm 自走砲'], rocket: ['工蜂六型', '工蜂六型 117mm 多管火箭'],
      aa: ['M42防空砲', 'M42 雙40mm 自走防空砲'], sam: ['天弓一型', '天弓一型防空飛彈'], heli: ['AH-1W', 'AH-1W 超級眼鏡蛇'],
      fighter: ['F-5E虎二', 'F-5E 虎二式戰鬥機'], attacker: ['AT-3自強', 'AT-3 自強號攻擊機'], destroyer: ['陽字號', '陽字號驅逐艦（基林級）'],
      marine: ['陸戰隊', '海軍陸戰隊（LVTP-5 兩棲車）'],
    },
    mods: [['land', { armor: 0.9 }], ['sam', { atk: 1, cost: 0.9 }], ['aa', { atk: 1, cost: 0.9 }], ['arty', { atk: -1 }]],
    prefer: { sam: 1.6, aa: 1.4, inf: 1.2, atinf: 1.3 }, adj: 1.11,
  },
  CN: {
    name: '中共', full: '中國人民解放軍', army: '解放軍', code: 'CN', style: 'east', camo: '#556b3b',
    doctrine: '人民戰爭', noRank: true, desc: '以龐大數量取勝：部隊極為廉價，步兵、陸戰隊與火砲數量多；單一武器性能較落後，且沒有經驗升級、王牌與科技進化。專屬：轟-6 轟炸機。',
    units: {
      inf: ['解放軍步兵', '81式步槍步兵'], atinf: ['紅箭-8', '紅箭-8 反戰車飛彈'], recon: ['63式裝甲車', '63式裝甲車（YW531）'],
      tank: ['69-II式', '69-II式主力戰車'], arty: ['83式自走砲', '83式 152mm 自走榴彈砲'], rocket: ['81式火箭', '81式 122mm 多管火箭'],
      aa: ['80式高砲', '80式 57mm 自走高砲'], sam: ['紅旗-2', '紅旗-2 防空飛彈'], heli: ['直-9W', '直-9W 武裝直升機'],
      fighter: ['殲-8II', '殲-8II 戰鬥機'], attacker: ['強-5', '強-5 強擊機'], destroyer: ['旅大級', '051型旅大級驅逐艦'],
      marine: ['陸戰隊', '海軍陸戰隊（63式水陸坦克）'], bomber: ['轟-6', '轟-6 轟炸機'],
    },
    mods: [['inf', { cost: 0.7 }], ['marine', { cost: 0.75 }], ['arty', { cost: 0.85 }], ['rocket', { cost: 0.85 }],
      ['tank', { atk: -1, cost: 0.85 }], ['fighter', { atk: -1, cost: 0.85 }], ['heli', { atk: -1 }]],
    prefer: { inf: 1.6, marine: 1.5, arty: 1.3, rocket: 1.3 }, adj: 0.88,
  },
  US: {
    name: '美國', full: '美國陸海空軍', army: '美軍', code: 'US', style: 'west', camo: '#5a6440',
    doctrine: '空地一體戰', desc: '世界最強的空軍與精密武器，戰車與飛機性能頂尖，但所有裝備都很昂貴。專屬：F-117A 匿蹤攻擊機。',
    units: {
      inf: ['美軍步兵', 'M16A2 步槍步兵'], atinf: ['龍式飛彈組', 'M47 龍式反戰車飛彈'], recon: ['M3布萊德雷', 'M3 布萊德雷騎兵戰車'],
      tank: ['M1A1', 'M1A1 艾布蘭主力戰車'], arty: ['M109A2', 'M109A2 155mm 自走砲'], rocket: ['M270', 'M270 多管火箭系統'],
      aa: ['M163火神', 'M163 火神防空砲車'], sam: ['愛國者', 'MIM-104 愛國者飛彈'], heli: ['AH-64A', 'AH-64A 阿帕契'],
      fighter: ['F-15C', 'F-15C 鷹式戰鬥機'], attacker: ['A-10A', 'A-10A 雷霆二式攻擊機'], destroyer: ['史普魯恩斯', '史普魯恩斯級驅逐艦'],
      marine: ['陸戰隊', '海軍陸戰隊（AAV7 兩棲突擊車）'], stealth: ['F-117A', 'F-117A 夜鷹匿蹤攻擊機'],
    },
    mods: [['all', { cost: 1.15 }], ['tank', { atk: 1 }], ['fighter', { atk: 1 }], ['attacker', { atk: 1 }], ['heli', { atk: 1 }]],
    prefer: { fighter: 1.5, attacker: 1.5, heli: 1.3, stealth: 1.3 }, adj: 0.87,
  },
  JP: {
    name: '日本', full: '日本自衛隊', army: '自衛隊', code: 'JP', style: 'west', camo: '#58613f',
    doctrine: '專守防衛', desc: '裝備精良、訓練嚴格，戰車、防空與艦艇品質一流；價格昂貴且沒有兩棲部隊。',
    units: {
      inf: ['普通科', '64式步槍普通科隊員'], atinf: ['中MAT', '87式中距離多目的誘導彈'], recon: ['87式偵察', '87式偵察警戒車'],
      tank: ['90式戰車', '90式戰車'], arty: ['75式自走砲', '75式 155mm 自走榴彈砲'], rocket: ['75式火箭', '75式 130mm 自走多管火箭'],
      aa: ['87式高射', '87式自走高射機關砲'], sam: ['改良霍克', 'MIM-23 改良霍克飛彈'], heli: ['AH-1S', 'AH-1S 眼鏡蛇'],
      fighter: ['F-15J', 'F-15J 戰鬥機'], attacker: ['F-1', 'F-1 支援戰鬥機'], destroyer: ['旗風型', '旗風型護衛艦'],
      marine: null,
    },
    mods: [['all', { cost: 1.12 }], ['tank', { atk: 1, armor: 0.9 }], ['sam', { atk: 1 }], ['destroyer', { atk: 1 }], ['fighter', { atk: 1 }]],
    prefer: { sam: 1.3, destroyer: 1.3, tank: 1.2 }, adj: 0.942,
  },
  KR: {
    name: '韓國', full: '大韓民國國軍', army: '韓軍', code: 'KR', style: 'west', camo: '#5b6a40',
    doctrine: '前沿防禦', desc: '面對北方威脅而建立的密集砲兵與堅固陣地，火砲與步兵便宜，K1 戰車可靠。',
    units: {
      inf: ['韓軍步兵', 'K2 步槍步兵'], atinf: ['拖式飛彈組', 'BGM-71 拖式反戰車飛彈'], recon: ['K200', 'K200 步兵戰鬥車'],
      tank: ['K1戰車', 'K1（88式）主力戰車'], arty: ['K55自走砲', 'K55 155mm 自走砲'], rocket: ['K136九龍', 'K136 九龍 130mm 多管火箭'],
      aa: ['M167火神', 'M167 火神防空砲'], sam: ['改良霍克', 'MIM-23 改良霍克飛彈'], heli: ['500MD', '500MD 防禦者攻擊直升機'],
      fighter: ['F-16C', 'F-16C 戰隼戰鬥機'], attacker: ['F-4E', 'F-4E 幽靈二式'], destroyer: ['基林級', '基林級驅逐艦'],
      marine: ['陸戰隊', '海兵隊（LVTP-7 兩棲車）'],
    },
    mods: [['arty', { cost: 0.85 }], ['rocket', { cost: 0.85 }], ['inf', { cost: 0.9 }], ['heli', { atk: -1, cost: 0.85 }]],
    prefer: { arty: 1.4, rocket: 1.3, tank: 1.2 }, adj: 0.964,
  },
  KP: {
    name: '北韓', full: '朝鮮人民軍', army: '人民軍', code: 'KP', style: 'east', camo: '#4f5e37',
    doctrine: '火海人海', desc: '世界最密集的長程火砲與龐大步兵；谷山砲射程更遠。裝甲與空軍老舊，海軍只有小型艦艇。',
    units: {
      inf: ['人民軍步兵', '58式步槍步兵'], atinf: ['RPG-7組', 'RPG-7 火箭筒組'], recon: ['BRDM-2', 'BRDM-2 偵察車'],
      tank: ['天馬虎', '天馬虎主力戰車'], arty: ['谷山170mm', 'M1978 谷山 170mm 自走加農砲'], rocket: ['M1985', 'M1985 240mm 多管火箭'],
      aa: ['ZSU-57-2', 'ZSU-57-2 自走高砲'], sam: ['S-75', 'S-75 德維納防空飛彈'], heli: ['Mi-24', 'Mi-24 雌鹿'],
      fighter: ['MiG-29', 'MiG-29 支點戰鬥機'], attacker: ['Su-25', 'Su-25 蛙足攻擊機'], destroyer: ['那南級', '那南級護衛艦'],
      marine: ['氣墊登陸隊', '特戰旅（孔雀級氣墊船）'],
    },
    mods: [['inf', { cost: 0.65 }], ['atinf', { cost: 0.75 }], ['arty', { range: [2, 4] }], ['rocket', { cost: 0.8 }],
      ['tank', { atk: -1, cost: 0.85 }], ['air', { atk: -1 }], ['destroyer', { atk: -1, cost: 0.8 }]],
    prefer: { inf: 1.7, arty: 1.6, rocket: 1.4 }, adj: 0.955,
  },
  PH: {
    name: '菲律賓', full: '菲律賓武裝部隊', army: '菲軍', code: 'PH', style: 'west', camo: '#4f6a3a',
    doctrine: '群島游擊', desc: '步兵在叢林與山地中極難纏，價格低廉；重裝備稀少，沒有火箭與長程防空，戰車只有輕型。',
    units: {
      inf: ['菲軍步兵', 'M16 步槍步兵'], atinf: ['M67無座力砲', 'M67 90mm 無後座力砲'], recon: ['V-150', 'V-150 輪型裝甲車'],
      tank: ['蠍式輕戰車', 'FV101 蠍式輕戰車'], arty: ['M101榴彈砲', 'M101 105mm 榴彈砲'], rocket: null,
      aa: ['M167火神', 'M167 火神防空砲'], sam: null, heli: ['MD-520MG', 'MD 520MG 防衛者'],
      fighter: ['F-5A', 'F-5A 自由鬥士'], attacker: ['OV-10', 'OV-10 野馬攻擊機'], destroyer: ['黎剎級', '黎剎級巡邏艦'],
      marine: ['陸戰隊', '菲律賓海軍陸戰隊'],
    },
    mods: [['soft', { jungle: 20 }], ['inf', { cost: 0.75 }], ['atinf', { cost: 0.8 }], ['marine', { cost: 0.8 }],
      ['tank', { atk: -2, cost: 0.65, move: 1 }], ['air', { atk: -1, cost: 0.8 }], ['destroyer', { atk: -2, cost: 0.6 }]],
    prefer: { inf: 1.6, atinf: 1.4, marine: 1.3, recon: 1.3 }, adj: 1.0,
  },
  VN: {
    name: '越南', full: '越南人民軍', army: '越軍', code: 'VN', style: 'east', camo: '#4d6338',
    doctrine: '叢林持久戰', desc: '久經戰陣的步兵擅長叢林作戰，防空火網綿密；蘇式裝備老舊但數量充足。',
    units: {
      inf: ['越軍步兵', 'AK-47 步兵'], atinf: ['B41組', 'B41（RPG-7）火箭筒組'], recon: ['BRDM-2', 'BRDM-2 偵察車'],
      tank: ['T-55', 'T-55 主力戰車'], arty: ['2S1康乃馨', '2S1 康乃馨 122mm 自走砲'], rocket: ['BM-21', 'BM-21 冰雹多管火箭'],
      aa: ['ZSU-23-4', 'ZSU-23-4 石勒喀'], sam: ['S-125', 'S-125 涅瓦防空飛彈'], heli: ['Mi-24', 'Mi-24 雌鹿'],
      fighter: ['MiG-21bis', 'MiG-21bis 戰鬥機'], attacker: ['Su-22M', 'Su-22M 裝配匠攻擊機'], destroyer: ['佩佳級', '佩佳級護衛艦'],
      marine: ['海軍步兵', '越南海軍步兵'],
    },
    mods: [['soft', { jungle: 15 }], ['inf', { cost: 0.8 }], ['aa', { atk: 1 }], ['sam', { atk: 1 }],
      ['tank', { atk: -1, cost: 0.8 }], ['fighter', { atk: -1, cost: 0.8 }], ['destroyer', { atk: -1, cost: 0.85 }]],
    prefer: { inf: 1.5, aa: 1.4, sam: 1.3 }, adj: 0.99,
  },
  RU: {
    name: '俄羅斯', full: '俄羅斯（蘇聯）軍', army: '俄軍', code: 'RU', style: 'east', camo: '#53643b',
    doctrine: '縱深作戰', desc: '強大的火砲與火箭搭配大量裝甲縱深突破，防空飛彈射程遠。專屬：Tu-22M3 逆火轟炸機。',
    units: {
      inf: ['摩步兵', 'AK-74 摩托化步兵'], atinf: ['AT-4組', '9K111 巴松管反戰車飛彈'], recon: ['BRDM-2', 'BRDM-2 偵察車'],
      tank: ['T-80B', 'T-80B 主力戰車'], arty: ['2S3金合歡', '2S3 金合歡 152mm 自走砲'], rocket: ['BM-27', 'BM-27 颶風多管火箭'],
      aa: ['ZSU-23-4', 'ZSU-23-4 石勒喀'], sam: ['S-300', 'S-300PS 防空飛彈'], heli: ['Mi-24', 'Mi-24 雌鹿'],
      fighter: ['Su-27', 'Su-27 側衛戰鬥機'], attacker: ['Su-25', 'Su-25 蛙足攻擊機'], destroyer: ['現代級', '現代級驅逐艦'],
      marine: ['海軍步兵', '海軍步兵（BTR-80）'], bomber: ['Tu-22M3', 'Tu-22M3 逆火轟炸機'],
    },
    mods: [['arty', { atk: 1 }], ['rocket', { atk: 1 }], ['sam', { range: [2, 6] }], ['tank', { cost: 0.9 }]],
    prefer: { arty: 1.4, rocket: 1.4, tank: 1.3 }, adj: 0.976,
  },
  IN: {
    name: '印度', full: '印度武裝部隊', army: '印軍', code: 'IN', style: 'east', camo: '#6b6a45',
    doctrine: '多源均衡', desc: '東西方裝備兼容並蓄，沒有明顯弱點，整體價格便宜；也沒有特別突出的強項。',
    units: {
      inf: ['印軍步兵', '1A 步槍步兵'], atinf: ['米蘭飛彈組', 'MILAN 反戰車飛彈'], recon: ['BRDM-2', 'BRDM-2 偵察車'],
      tank: ['T-72M1', 'T-72M1 阿杰亞主力戰車'], arty: ['阿博特', '阿博特 105mm 自走砲'], rocket: ['BM-21', 'BM-21 冰雹多管火箭'],
      aa: ['ZSU-23-4', 'ZSU-23-4 石勒喀'], sam: ['2K12立方', '2K12 立方防空飛彈'], heli: ['Mi-25', 'Mi-25 雌鹿'],
      fighter: ['幻象2000H', '幻象 2000H 戰鬥機'], attacker: ['美洲虎', '美洲虎 IS 攻擊機'], destroyer: ['拉吉普特級', '拉吉普特級驅逐艦'],
      marine: ['兩棲旅', '兩棲作戰旅'],
    },
    mods: [['all', { cost: 0.92 }]],
    prefer: {}, adj: 1.07,
  },
  PK: {
    name: '巴基斯坦', full: '巴基斯坦武裝部隊', army: '巴軍', code: 'PK', style: 'west', camo: '#6d6847',
    doctrine: '機動反擊', desc: '以機動裝甲與優秀的 F-16 飛行員實施反擊，戰車與偵察車更快；火箭與海軍較弱。',
    units: {
      inf: ['巴軍步兵', 'G3 步槍步兵'], atinf: ['拖式飛彈組', 'BGM-71 拖式反戰車飛彈'], recon: ['M113', 'M113 裝甲車'],
      tank: ['59式戰車', '59式主力戰車'], arty: ['M109A2', 'M109A2 155mm 自走砲'], rocket: ['KRL-122', 'KRL-122 多管火箭'],
      aa: ['M163火神', 'M163 火神防空砲車'], sam: ['響尾蛇', '響尾蛇防空飛彈'], heli: ['AH-1F', 'AH-1F 眼鏡蛇'],
      fighter: ['F-16A', 'F-16A 戰隼戰鬥機'], attacker: ['幻象5', '幻象 5PA 攻擊機'], destroyer: ['基林級', '基林級驅逐艦'],
      marine: null,
    },
    mods: [['tank', { move: 1, atk: -1, cost: 0.85 }], ['recon', { move: 1 }], ['fighter', { atk: 1 }], ['rocket', { atk: -1 }], ['destroyer', { atk: -1, cost: 0.85 }]],
    prefer: { tank: 1.4, recon: 1.3, fighter: 1.3 }, adj: 0.955,
  },
  GB: {
    name: '英國', full: '英國陸海空軍', army: '英軍', code: 'GB', style: 'west', camo: '#545e3c',
    doctrine: '職業精兵', desc: '全志願役職業軍隊，步兵與偵察部隊素質高，皇家海軍傳統強大；兵力少而昂貴。',
    units: {
      inf: ['英軍步兵', 'SA80 步槍步兵'], atinf: ['米蘭飛彈組', 'MILAN 反戰車飛彈'], recon: ['彎刀偵察車', 'FV107 彎刀偵察車'],
      tank: ['挑戰者1', '挑戰者 1 主力戰車'], arty: ['M109', 'M109 155mm 自走砲'], rocket: ['M270', 'M270 多管火箭系統'],
      aa: ['追蹤式長劍', '追蹤式長劍防空系統'], sam: ['警犬飛彈', '警犬 Mk2 防空飛彈'], heli: ['山貓TOW', '山貓 AH.1 反戰車直升機'],
      fighter: ['龍捲風F3', '龍捲風 F3 防空型'], attacker: ['龍捲風GR1', '龍捲風 GR1 攻擊型'], destroyer: ['42型', '42型驅逐艦'],
      marine: ['皇家陸戰隊', '皇家海軍陸戰隊'],
    },
    mods: [['all', { cost: 1.08 }], ['inf', { atk: 1 }], ['atinf', { atk: 1 }], ['recon', { atk: 1 }], ['destroyer', { atk: 1 }], ['marine', { atk: 1 }]],
    prefer: { destroyer: 1.3, recon: 1.3, marine: 1.2 }, adj: 0.95,
  },
  FR: {
    name: '法國', full: '法國陸海空軍', army: '法軍', code: 'FR', style: 'west', camo: '#5a6542',
    doctrine: '快速反應', desc: '輪型裝甲車火力強、速度快，適合快速反應作戰；戰車較舊，航空工業自給。',
    units: {
      inf: ['法軍步兵', 'FAMAS 步槍步兵'], atinf: ['米蘭飛彈組', 'MILAN 反戰車飛彈'], recon: ['AMX-10RC', 'AMX-10RC 輪型裝甲車'],
      tank: ['AMX-30B2', 'AMX-30B2 主力戰車'], arty: ['AuF1', 'AuF1 155mm 自走砲'], rocket: ['LRM', 'LRM 多管火箭'],
      aa: ['AMX-30SA', 'AMX-30SA 自走防空砲'], sam: ['響尾蛇', '響尾蛇防空飛彈'], heli: ['小羚羊HOT', '小羚羊 HOT 反戰車直升機'],
      fighter: ['幻象2000C', '幻象 2000C 戰鬥機'], attacker: ['美洲虎A', '美洲虎 A 攻擊機'], destroyer: ['喬治萊格', '喬治萊格級驅逐艦'],
      marine: ['陸戰步兵', '海軍陸戰步兵'],
    },
    mods: [['recon', { atk: 1, move: 1 }], ['tank', { atk: -1, cost: 0.9 }], ['air', { cost: 0.92 }]],
    prefer: { recon: 1.6, fighter: 1.2 }, adj: 1.0,
  },
  DE: {
    name: '德國', full: '德國聯邦國防軍', army: '德軍', code: 'DE', style: 'west', camo: '#4f5a3a',
    doctrine: '裝甲突擊', desc: '豹 2 戰車與獵豹防空車舉世聞名，裝甲部隊攻守俱佳；海軍規模小，沒有兩棲部隊。',
    units: {
      inf: ['德軍步兵', 'G3 步槍步兵'], atinf: ['米蘭飛彈組', 'MILAN 反戰車飛彈'], recon: ['山貓偵察車', '山貓 8x8 偵察車'],
      tank: ['豹2A4', '豹 2A4 主力戰車'], arty: ['M109A3G', 'M109A3G 155mm 自走砲'], rocket: ['LARS', 'LARS 110mm 多管火箭'],
      aa: ['獵豹', '獵豹自走防空砲'], sam: ['羅蘭飛彈', '羅蘭防空飛彈'], heli: ['PAH-1', 'PAH-1 反戰車直升機'],
      fighter: ['F-4F', 'F-4F 幽靈二式'], attacker: ['龍捲風IDS', '龍捲風 IDS 攻擊機'], destroyer: ['呂特晏斯', '呂特晏斯級驅逐艦'],
      marine: null,
    },
    mods: [['tank', { atk: 1, armor: 0.9 }], ['aa', { atk: 1 }], ['destroyer', { atk: -1, cost: 0.9 }], ['fighter', { atk: -1 }]],
    prefer: { tank: 1.6, aa: 1.3 }, adj: 1.055,
  },
  AU: {
    name: '澳洲', full: '澳洲國防軍', army: '澳軍', code: 'AU', style: 'west', camo: '#6a6343',
    doctrine: '遠程打擊', desc: 'F-111C 擁有出色的遠程打擊能力，空海軍是主力；陸軍規模小，沒有火箭與兩棲部隊。',
    units: {
      inf: ['澳軍步兵', 'F88 步槍步兵'], atinf: ['卡爾古斯塔夫', '卡爾古斯塔夫 84mm 無後座力砲'], recon: ['M113A1', 'M113A1 偵察車'],
      tank: ['豹1AS', '豹 1AS 主力戰車'], arty: ['M198榴彈砲', 'M198 155mm 榴彈砲'], rocket: null,
      aa: ['RBS-70', 'RBS-70 防空飛彈班'], sam: ['長劍飛彈', '長劍防空飛彈'], heli: ['UH-1H砲艇', 'UH-1H 叢林遊騎兵砲艇機'],
      fighter: ['F/A-18A', 'F/A-18A 大黃蜂'], attacker: ['F-111C', 'F-111C 土豚攻擊機'], destroyer: ['伯斯級', '伯斯級驅逐艦'],
      marine: null,
    },
    mods: [['attacker', { atk: 1, move: 1 }], ['fighter', { atk: 1 }], ['heli', { atk: -2, cost: 0.7 }], ['tank', { atk: -1, cost: 0.9 }]],
    prefer: { attacker: 1.6, fighter: 1.3, destroyer: 1.2 }, adj: 0.97,
  },
  IL: {
    name: '以色列', full: '以色列國防軍', army: '以軍', code: 'IL', style: 'west', camo: '#8a7c55',
    doctrine: '先制打擊', desc: '梅卡瓦戰車防護出色，空軍主動出擊奪取制空；兵力有限、價格偏高，海軍只有飛彈艇。',
    units: {
      inf: ['以軍步兵', '加利爾步槍步兵'], atinf: ['龍式飛彈組', 'M47 龍式反戰車飛彈'], recon: ['M113偵察', 'M113 偵察車'],
      tank: ['梅卡瓦', '梅卡瓦 Mk3 主力戰車'], arty: ['M109杜赫', 'M109 杜赫 155mm 自走砲'], rocket: ['LAR-160', 'LAR-160 多管火箭'],
      aa: ['M163火神', 'M163 火神防空砲車'], sam: ['霍克飛彈', 'MIM-23 霍克飛彈'], heli: ['AH-64A', 'AH-64A 阿帕契'],
      fighter: ['F-15A', 'F-15A 鷹式（巴茲）'], attacker: ['幼獅C7', '幼獅 C7 戰鬥攻擊機'], destroyer: ["薩爾4.5", "薩爾 4.5 型飛彈艇"],
      marine: null,
    },
    mods: [['all', { cost: 1.05 }], ['tank', { armor: 0.85 }], ['fighter', { atk: 1 }], ['attacker', { atk: 1 }], ['destroyer', { atk: -2, cost: 0.6 }]],
    prefer: { tank: 1.4, fighter: 1.4, attacker: 1.3 }, adj: 1.003,
  },
  TSMC: {
    name: '台積電', full: '晶圓防衛科技部隊', army: '神山衛隊', code: 'TSMC', style: 'west', camo: '#008b8b',
    doctrine: '矽盾防衛', desc: '半導體尖端奈米防禦科技與高精確度雷射，具備極高血量護盾與先進無人蜂群。專屬：EUV防護堡壘、晶圓外骨骼衛隊、矽光子雷射防空、奈米遊蕩蜂群。',
    units: {
      inf: ['晶圓衛隊', '奈米外骨骼動能步兵'], atinf: ['晶圓獵殺組', '先進奈米導引反裝甲組'], recon: ['次微米偵察', '次微米自主偵察車'],
      tank: ['EUV堡壘', 'EUV 極紫外光防護堡壘'], arty: ['光子重砲', '精確奈米導引重砲'], rocket: ['奈米火箭', '多聯裝智慧奈米火箭'],
      aa: ['雷射防空', '矽光子高能雷射防空車'], sam: ['矽盾天網', '矽光子相位陣列飛彈'], heli: ['遊蕩蜂群', '奈米滯空遊蕩無人蜂群'],
      fighter: ['次世代戰機', '先進無人空優攔截機'], attacker: ['極紫外攻擊', '精準奈米對地打擊機'], destroyer: ['神盾驅逐艦', '智慧矽盾驅逐艦'],
      marine: ['晶圓陸戰隊', '兩棲外骨骼突擊隊'],
      euv_fortress: ['EUV防護堡壘', 'EUV 極紫外光防護堡壘'], wafer_inf: ['晶圓外骨骼', '奈米外骨骼動能步兵'],
      laser_aa: ['矽光子防空', '矽光子高能雷射防空車'], nano_swarm: ['遊蕩蜂群', '奈米滯空遊蕩無人蜂群'],
    },
    mods: [['land', { armor: 0.85 }], ['sam', { atk: 2 }], ['all', { cost: 1.15 }]],
    prefer: { euv_fortress: 1.8, laser_aa: 1.6, wafer_inf: 1.4, nano_swarm: 1.5 }, adj: 1.12,
  },
  USCORP: {
    name: '美商國防', full: '美商尖端科技集團', army: '矽谷聯軍', code: 'USCORP', style: 'west', camo: '#1e3d59',
    doctrine: '演算法主宰', desc: '整合 Anduril、Palantir、無人機母艦與自主狼群系統之次世代無人自動化作戰科技。專屬：安杜里爾狼群戰車、帕蘭提爾軌道火控砲、忠誠僚機母艦、USV無人作戰艦。',
    units: {
      inf: ['機器人步兵', '自主外骨骼機器人步兵'], atinf: ['標槍自主組', '自主AI標槍巡弋飛彈組'], recon: ['幽靈偵察車', 'Anduril 幽靈自律偵察車'],
      tank: ['狼群戰車', 'Anduril 自主裝甲狼群'], arty: ['軌道火控砲', 'Palantir 軌道戰術打擊系統'], rocket: ['HIMARS-AI', '自律海馬斯遠程火箭'],
      aa: ['復仇者-X', 'AI無人防空攔截載具'], sam: ['天穹防禦系統', '全域分散式防空網路'], heli: ['阿帕契守護者', 'AH-64E 無人協同型'],
      fighter: ['F-35A閃電', 'F-35A 聯合打擊戰機'], attacker: ['僚機母艦', '次世代無人空戰母艦機'], destroyer: ['無人作戰艦', 'USV 無人水面攔截狼群'],
      marine: ['自主陸戰隊', '自律無人兩棲突擊隊'],
      anduril_tank: ['狼群戰車', 'Anduril 自主裝甲狼群'], palantir_arty: ['軌道火控砲', 'Palantir 軌道戰術打擊系統'],
      wingman_carrier: ['僚機母艦', '次世代無人空戰母艦機'], usv_wolfpack: ['無人作戰艦', 'USV 無人水面攔截狼群'],
    },
    mods: [['air', { move: 1 }], ['rocket', { range: [3, 6] }], ['all', { cost: 1.2 }]],
    prefer: { anduril_tank: 1.8, palantir_arty: 1.7, wingman_carrier: 1.6, usv_wolfpack: 1.5 }, adj: 0.92,
  },
};
const CARRIERS = {
  TW: ['玉山空母', '自衛防空輕航空母艦'], CN: ['山東艦', '002型山東艦航空母艦'],
  JP: ['出雲級', '出雲級多功能護衛艦（輕空母）'], KR: ['獨島級', '獨島級兩棲攻擊艦'],
  US: ['小鷹級', '小鷹級航空母艦'], RU: ['庫茲涅佐夫', '庫茲涅佐夫海軍上將號航空母艦'], GB: ['無敵級', '無敵級航空母艦'],
  FR: ['克里蒙梭級', '克里蒙梭級航空母艦'], IN: ['維拉特號', '維拉特號航空母艦'],
  TSMC: ['矽盾母艦', '神山自律防衛母艦'], USCORP: ['無人機母艦', '次世代自律空中/海上無人母艦'],
};
const LOCOMOTIVES = { TW: 'R100型機車', CN: '東風4型機車', US: 'GP40 機車', JP: 'DD51型機車', KR: '7000型機車', KP: '紅旗型機車', PH: '菲國鐵機車',
  VN: 'D12E型機車', RU: '2TE116 機車', IN: 'WDM-2 機車', PK: 'GE U20C 機車', GB: '37型機車', FR: 'BB 67000 機車', DE: 'V160 機車', AU: 'GM 機車', IL: 'G12 機車',
  TSMC: '磁浮超導列車', USCORP: 'Hyperloop 自律列車' };
for (const [nid, tr] of Object.entries(TRANSPORTS)) {
  if (!tr) continue;
  for (const [b, v] of Object.entries(tr)) if (v) NATIONS[nid].units[b] = v;
  NATIONS[nid].units.train = ['軍用列車', `軍用列車（${LOCOMOTIVES[nid]}）`];
  if (CARRIERS[nid]) NATIONS[nid].units.carrier = CARRIERS[nid];
}
for (const [nid, more] of Object.entries(MORE_ARMS)) for (const [b, v] of Object.entries(more)) if (v && NATIONS[nid]) NATIONS[nid].units[b] = v;
for (const N of Object.values(NATIONS)) N.units.engineer = [`${N.army || ''}工兵`, '戰鬥工兵（基地建設）'];
const NATION_IDS = Object.keys(NATIONS);

// 進化科技樹：每國每兵種的後繼型號。[節點id, 前一節點(null=基本型), 名稱, 型號, 調整]
// 沒有列出的兵種不能進化。調整以前一階為基準；省略時為 攻+1（二階以上另加 承傷×0.95）
const EVOLUTION = {
  TW: {
    fighter: [['idf', null, 'IDF經國號', 'F-CK-1 經國號戰機', { atk: 1, move: 1 }], ['f16a', null, 'F-16A', 'F-16A Block 20', { atk: 2 }], ['idfc', 'idf', '經國號C', 'F-CK-1C 雄鷹', {}], ['f16v', 'f16a', 'F-16V', 'F-16V 毒蛇', { atk: 1, armor: 0.95 }]],
    tank: [['m60', null, 'M60A3', 'M60A3 TTS 戰車', {}], ['m1a2t', 'm60', 'M1A2T', 'M1A2T 艾布蘭', { atk: 1, armor: 0.88 }]],
    attacker: [['fck', null, '經國號攻擊', 'F-CK-1 對地攻擊型', { atk: 1, move: 1 }]],
    sam: [['tk2', null, '天弓二型', '天弓二型防空飛彈', { atk: 1, range: [2, 6] }], ['tk3', 'tk2', '天弓三型', '天弓三型防空飛彈', { atk: 1 }]],
    destroyer: [['perry', null, '成功級', '成功級巡防艦', {}], ['kidd', 'perry', '基隆級', '基隆級驅逐艦（紀德級）', {}]],
    rocket: [['rt2000', null, '雷霆2000', '雷霆 2000 多管火箭', { atk: 1, range: [3, 6] }]],
    atinf: [['jav', null, '標槍飛彈組', 'FGM-148 標槍反戰車飛彈', { atk: 1 }]],
    heli: [['ah64e', null, 'AH-64E', 'AH-64E 阿帕契守護者', { atk: 2 }]],
    recon: [['cm32', null, '雲豹甲車', 'CM-32 雲豹八輪甲車', { atk: 1, armor: 0.9 }]],
  },
  US: {
    tank: [['m1a2', null, 'M1A2', 'M1A2 艾布蘭', {}], ['sep', 'm1a2', 'M1A2 SEP', 'M1A2 SEP v2', {}]],
    fighter: [['f15e', null, 'F-15E', 'F-15E 打擊鷹', { atk: 1 }], ['f22', null, 'F-22A', 'F-22A 猛禽', { atk: 3, stealth: true }]],
    attacker: [['a10c', null, 'A-10C', 'A-10C 雷霆二式', {}]],
    heli: [['ah64d', null, 'AH-64D', 'AH-64D 長弓阿帕契', { atk: 2 }]],
    destroyer: [['ddg51', null, '柏克級', '柏克級驅逐艦', { atk: 2, armor: 0.9 }]],
    sam: [['pac3', null, 'PAC-3', '愛國者 PAC-3', {}]],
    aa: [['avenger', null, '復仇者', 'M1097 復仇者防空系統', {}]],
    rocket: [['m270a1', null, 'M270A1', 'M270A1 多管火箭', {}]],
    stealth: [['b2', null, 'B-2', 'B-2 幽靈轟炸機', { atk: 2, move: 1 }]],
    carrier: [['nimitz', null, '尼米茲級', '尼米茲級核動力航空母艦', { armor: 0.8, maxHp: 22 }], ['ford', 'nimitz', '福特級', '福特級核動力航空母艦', { atk: 1, armor: 0.75, maxHp: 24 }]],
  },
  JP: {
    tank: [['type10', null, '10式戰車', '10式戰車', { atk: 1, move: 1 }]],
    fighter: [['f15jm', null, 'F-15J改', 'F-15J 近代化改修型', {}]],
    attacker: [['f2', null, 'F-2', 'F-2 支援戰鬥機', { atk: 2, move: 1 }]],
    destroyer: [['kongo', null, '金剛級', '金剛級護衛艦（神盾）', { atk: 2 }], ['atago', 'kongo', '愛宕級', '愛宕級護衛艦', {}]],
    sam: [['type03', null, '03式中SAM', '03式中距離地對空誘導彈', {}]],
    heli: [['ah64dj', null, 'AH-64DJ', 'AH-64DJ 長弓阿帕契', { atk: 2 }]],
  },
  KR: {
    tank: [['k1a1', null, 'K1A1', 'K1A1 主力戰車', {}], ['k2', 'k1a1', 'K2黑豹', 'K2 黑豹主力戰車', {}]],
    fighter: [['kf16', null, 'KF-16', 'KF-16 戰隼', {}], ['f15k', 'kf16', 'F-15K', 'F-15K 打擊鷹', {}]],
    destroyer: [['kdx1', null, '廣開土大王', '廣開土大王級驅逐艦', {}], ['kdx3', 'kdx1', '世宗大王', '世宗大王級驅逐艦', {}]],
    arty: [['k9', null, 'K9雷霆', 'K9 雷霆 155mm 自走砲', { atk: 1, range: [2, 4] }]],
    heli: [['ah64e', null, 'AH-64E', 'AH-64E 阿帕契守護者', { atk: 3 }]],
  },
  KP: {
    tank: [['songun', null, '先軍號', '先軍號主力戰車', {}], ['pokpung', 'songun', '暴風虎', '暴風虎主力戰車', {}]],
    rocket: [['m1991', null, 'M1991', 'M1991 240mm 多管火箭', {}], ['kn09', 'm1991', 'KN-09', 'KN-09 300mm 多管火箭', { atk: 1, range: [3, 6] }]],
  },
  PH: {
    fighter: [['fa50', null, 'FA-50', 'FA-50 鬥士', { atk: 2 }]],
    attacker: [['a29', null, 'A-29', 'A-29 超級巨嘴鳥', { atk: 1 }]],
    destroyer: [['jrizal', null, '荷西黎剎級', '荷西黎剎級巡防艦', { atk: 2 }]],
  },
  VN: {
    fighter: [['su27', null, 'Su-27SK', 'Su-27SK 側衛', { atk: 2, move: 1 }], ['su30', 'su27', 'Su-30MK2', 'Su-30MK2 側衛', {}]],
    destroyer: [['gepard', null, '獵豹級', '獵豹 3.9 級護衛艦', { atk: 1 }]],
    sam: [['s300', null, 'S-300PMU1', 'S-300PMU1 防空飛彈', { atk: 1, range: [2, 6] }]],
  },
  RU: {
    tank: [['t80u', null, 'T-80U', 'T-80U 主力戰車', {}], ['t90a', 't80u', 'T-90A', 'T-90A 主力戰車', {}]],
    fighter: [['su35', null, 'Su-35S', 'Su-35S 側衛', { atk: 2 }]],
    attacker: [['su25sm', null, 'Su-25SM', 'Su-25SM 蛙足', {}], ['su34', null, 'Su-34', 'Su-34 後衛', { atk: 2, move: 1 }]],
    heli: [['mi28', null, 'Mi-28N', 'Mi-28N 浩劫', { atk: 2 }], ['ka52', null, 'Ka-52', 'Ka-52 短吻鱷', { atk: 2, move: 1 }]],
    sam: [['s400', null, 'S-400', 'S-400 凱旋', { atk: 2 }]],
    bomber: [['tu160', null, 'Tu-160', 'Tu-160 海盜旗', { atk: 1, move: 2 }]],
  },
  IN: {
    tank: [['t90s', null, 'T-90S', 'T-90S 怖懼主力戰車', {}]],
    fighter: [['su30mki', null, 'Su-30MKI', 'Su-30MKI 側衛', { atk: 2, move: 1 }]],
    destroyer: [['delhi', null, '德里級', '德里級驅逐艦', {}]],
    sam: [['akash', null, '阿卡什', '阿卡什防空飛彈', {}]],
    carrier: [['vikramaditya', null, '超日王號', '超日王號航空母艦', { armor: 0.88 }]],
  },
  PK: {
    fighter: [['f16b', null, 'F-16B', 'F-16B 戰隼（雙座）', {}], ['f16c', 'f16b', 'F-16C', 'F-16C Block 52', {}], ['jf17', null, 'JF-17', 'JF-17 雷電', { atk: 1, move: 1 }]],
    tank: [['85iiap', null, '85-IIAP', '85-IIAP 主力戰車', {}], ['khalid', '85iiap', '哈立德', '哈立德主力戰車', {}]],
  },
  GB: {
    tank: [['chal2', null, '挑戰者2', '挑戰者 2 主力戰車', { atk: 1, armor: 0.88 }]],
    fighter: [['typhoon', null, '颱風', '颱風 FGR4 戰鬥機', { atk: 2 }]],
    destroyer: [['type45', null, '45型', '45型勇敢級驅逐艦', { atk: 2 }]],
    heli: [['wah64', null, '阿帕契AH1', '阿帕契 AH1（長弓）', { atk: 2 }]],
    carrier: [['qe', null, '伊莉莎白女王級', '伊莉莎白女王級航空母艦', { armor: 0.8, maxHp: 20 }]],
  },
  FR: {
    tank: [['leclerc', null, '勒克萊爾', '勒克萊爾主力戰車', { atk: 2, move: 1 }]],
    fighter: [['rafale', null, '飆風', '飆風戰鬥機', { atk: 2 }]],
    destroyer: [['horizon', null, '地平線級', '地平線級驅逐艦', { atk: 2 }]],
    heli: [['tigre', null, '虎式', '虎式攻擊直升機', { atk: 2 }]],
    carrier: [['cdg', null, '戴高樂號', '戴高樂號核動力航空母艦', { armor: 0.8, maxHp: 20 }]],
  },
  DE: {
    tank: [['leo2a5', null, '豹2A5', '豹 2A5 主力戰車', {}], ['leo2a6', 'leo2a5', '豹2A6', '豹 2A6 主力戰車', {}]],
    fighter: [['typhoon', null, '颱風', '颱風戰鬥機', { atk: 2 }]],
    heli: [['tiger', null, '虎式', '虎式 UHT 攻擊直升機', { atk: 2 }]],
    arty: [['pzh2000', null, 'PzH2000', 'PzH 2000 自走砲', { atk: 1, range: [2, 4] }]],
  },
  AU: {
    fighter: [['fa18f', null, 'F/A-18F', 'F/A-18F 超級大黃蜂', {}], ['f35a', 'fa18f', 'F-35A', 'F-35A 閃電二式', { atk: 2, stealth: true }]],
    destroyer: [['anzac', null, '安扎克級', '安扎克級巡防艦', {}], ['hobart', 'anzac', '荷巴特級', '荷巴特級驅逐艦（神盾）', {}]],
    tank: [['m1aim', null, 'M1A1 AIM', 'M1A1 AIM 艾布蘭', { atk: 2, armor: 0.88 }]],
  },
  IL: {
    tank: [['mk4', null, '梅卡瓦Mk4', '梅卡瓦 Mk4 主力戰車', { atk: 1, armor: 0.88 }]],
    fighter: [['f15i', null, 'F-15I', 'F-15I 雷霆', { atk: 2 }]],
    attacker: [['f16i', null, 'F-16I', 'F-16I 風暴', { atk: 2, move: 1 }]],
    heli: [['ah64d', null, 'AH-64D', 'AH-64D 長弓阿帕契', { atk: 2 }]],
  },
};
// 經驗階級：新兵、老兵、精銳、王牌。門檻調升，攻擊力 +6%/階、迴避率 4%/8%/12%
// 進化到第 n 階需要第 n 階級（一階＝老兵、二階＝精銳、三階＝王牌）
// 達到王牌（3星）時可解鎖澤火革雙向「革變」進化科技分支（台積電晶圓防衛 / 美商尖端科技集團）
// 國家設定 noRank（解放軍）：沒有經驗、王牌與進化，改以數量與價格平衡
const RANKS = [
  { name: '新兵', xp: 0,   atk: 1.0,  evade: 0 },
  { name: '老兵', xp: 120, atk: 1.06, evade: 0.04 },
  { name: '精銳', xp: 280, atk: 1.12, evade: 0.08 },
  { name: '王牌', xp: 500, atk: 1.18, evade: 0.12 },
];
// 此部隊所屬國家沒有經驗系統
const noRank = u => { const d = UNITS[u.type]; return !!(d && NATIONS[d.nation] && NATIONS[d.nation].noRank); };
const rankOf = u => { if (noRank(u)) return 0; let r = 0; for (let k = 1; k < RANKS.length; k++) if ((u.xp || 0) >= RANKS[k].xp) r = k; return r; };

// 國家簡碼標準化對照表（支援 ROC, PLA, USA, JPN, KOR, PRK, PHL, VNM, RUS, TSMC, USCORP）
const NATION_MAP = {
  ROC: 'TW', TW: 'TW',
  PLA: 'CN', CN: 'CN',
  USA: 'US', US: 'US',
  JPN: 'JP', JP: 'JP',
  KOR: 'KR', KR: 'KR',
  PRK: 'KP', KP: 'KP',
  PHL: 'PH', PH: 'PH',
  VNM: 'VN', VN: 'VN',
  RUS: 'RU', RU: 'RU',
  TSMC: 'TSMC',
  USCORP: 'USCORP',
};
function normNat(nid) {
  if (!nid) return 'TW';
  return NATION_MAP[nid] || (NATIONS[nid] ? nid : 'TW');
}

// 澤火革：三星王牌部隊在友軍基地可革變之科技分支
function getGeEvoTargets(u) {
  const d = UNITS[u.type];
  if (!d) return [];
  const b = d.base || u.type.split('_')[0];
  const s = u.side;
  const list = [];
  // 台積電神山晶圓防禦科技分支
  if (['tank', 'recon'].includes(b)) list.push(`euv_fortress_${s}@TSMC`);
  if (['inf', 'atinf', 'marine'].includes(b)) list.push(`wafer_inf_${s}@TSMC`);
  if (['aa', 'sam'].includes(b)) list.push(`laser_aa_${s}@TSMC`);
  if (['heli', 'fighter'].includes(b)) list.push(`nano_swarm_${s}@TSMC`);

  // 美商尖端科技集團革變分支
  if (['tank', 'recon'].includes(b)) list.push(`anduril_tank_${s}@USCORP`);
  if (['arty', 'rocket'].includes(b)) list.push(`palantir_arty_${s}@USCORP`);
  if (['fighter', 'attacker', 'bomber', 'carrier'].includes(b)) list.push(`wingman_carrier_${s}@USCORP`);
  if (['destroyer', 'lst'].includes(b)) list.push(`usv_wolfpack_${s}@USCORP`);

  return list.filter(k => !!UNITS[k]);
}

function modMatches(sel, base, def) {
  return sel === 'all' || sel === base || sel === def.cat || sel === def.cls;
}
// 依國家產生某兵種的完整數值
function nationUnit(nid, base, side) {
  const N = NATIONS[nid], info = N.units[base];
  if (!info) return null;
  const d = JSON.parse(JSON.stringify(BASE_UNITS[base]));
  d.cost *= N.adj || 1;
  for (const [sel, m] of N.mods) {
    if (!modMatches(sel, base, d)) continue;
    if (m.cost) d.cost *= m.cost;
    if (m.atk) d.atk = d.atk.map(v => v > 0 ? Math.max(1, v + m.atk) : 0);
    if (m.move) d.move += m.move;
    if (m.armor) d.armor = (d.armor || 1) * m.armor;
    if (m.range) d.range = [...m.range];
    if (m.jungle) d.jungle = (d.jungle || 0) + m.jungle;
  }
  d.cost = Math.round(d.cost / 10) * 10;
  return Object.assign(d, { base, side, nation: nid, name: info[0], model: info[1], desc: BASE_DESC[base] });
}

// 實際使用的兵種表，鍵為「基礎_陣營」，例如 tank_0。開局時依雙方國家重建
const UNITS = {};
// 建立一國在某一方的兵種；suffix 用於友軍（例如 '@US'）
function buildNationUnits(nid, side, suffix = '') {
  const K = (base, node) => `${base}_${side}${node ? '_' + node : ''}${suffix}`;
  for (const base of Object.keys(NATIONS[nid].units)) {
    const d = nationUnit(nid, base, side);
    if (!d) continue;
    d.next = [];
    if (suffix) d.ally = nid;
    UNITS[K(base)] = d;
  }
  // 進化型號：在前一階之上套用調整（noRank 國家沒有進化）
  for (const [base, nodes] of Object.entries(NATIONS[nid].noRank ? {} : EVOLUTION[nid] || {})) {
    const root = UNITS[K(base)];
    if (!root) continue;
    for (const [id, from, name, model, m] of nodes) {
      const parentKey = K(base, from), parent = UNITS[parentKey];
      if (!parent) continue;
      const tier = (parent.tier || 0) + 1;
      const mm = Object.keys(m).length ? m : tier >= 2 ? { atk: 1, armor: 0.95 } : { atk: 1 };
      const d = JSON.parse(JSON.stringify(parent));
      if (mm.atk) d.atk = parent.atk.map(v => v > 0 ? Math.max(1, v + mm.atk) : 0);
      if (mm.move) d.move = parent.move + mm.move;
      if (mm.armor) d.armor = (parent.armor || 1) * mm.armor;
      if (mm.range) d.range = [...mm.range];
      if (mm.stealth) d.stealth = true;
      if (mm.maxHp) d.maxHp = mm.maxHp;
      Object.assign(d, { name, model, tier, from: parentKey, node: id, next: [], cost: Math.round(root.cost * (1 + 0.15 * tier) / 10) * 10 });
      const key = K(base, id);
      UNITS[key] = d;
      parent.next.push(key);
    }
  }
}
// allies：[{ side, nid }] 同陣營的其他國家（援軍）
function applyNations(ids, allies = []) {
  for (const k of Object.keys(UNITS)) delete UNITS[k];
  ids.forEach((rawNid, side) => {
    const nid = normNat(rawNid);
    buildNationUnits(nid, side);
    SIDES[side].name = NATIONS[nid].army;
    SIDES[side].nation = nid;
  });
  for (const a of allies) {
    const nid = normNat(a.nid);
    buildNationUnits(nid, a.side, '@' + nid);
  }
  // 澤火革：為藍軍（盟軍側）構建台積電與美商國防科技單元，供革變及特種生產使用
  buildNationUnits('TSMC', 0, '@TSMC');
  buildNationUnits('USCORP', 0, '@USCORP');
}
// 基礎名稱 + 陣營 → 實際兵種鍵（若該國沒有此兵種，退回步兵）
const ftype = (type, side) => UNITS[type] ? type : UNITS[`${type}_${side}`] ? `${type}_${side}` : `inf_${side}`;
// 友軍兵種鍵
const atype = (type, side, nid) => UNITS[`${type}_${side}@${nid}`] ? `${type}_${side}@${nid}` : ftype(type, side);
applyNations(['TW', 'CN']);

const CAPTURE_POINTS = 20;
const START_FUNDS = 1500;
