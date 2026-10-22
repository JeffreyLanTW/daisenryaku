'use strict';
// ===== 靜態資料：地形、兵種、陣營 =====

const SQ3 = Math.sqrt(3);

// 攻擊力陣列的對象順序
const CLASSES = ['soft', 'hard', 'heli', 'air', 'ship'];
const CLASS_NAME = { soft: '步兵', hard: '裝甲', heli: '直升機', air: '飛機', ship: '艦艇' };
const CLASS_SHORT = ['步', '甲', '直', '空', '艦'];

// 兩方的顯示色（名稱於開局時依國家設定）
const SIDES = [
  { name: '藍軍', color: '#2f6fd0', dark: '#163a78', light: '#9cc0f5', trim: '#d8e4f2' },
  { name: '紅軍', color: '#b8322c', dark: '#3d0f0f', light: '#f3a5a5', trim: '#d4a94a' },
];

// cost: 各移動類型進入此地形的消耗（未列出 = 不可進入）
// def: 地面部隊防禦加成 %
// heal: 可在此補給/修復的部隊類別；build: 可生產的部隊類別
const TERRAIN = {
  plain:    { name: '平原', def: 0,  cost: { foot: 1, tread: 1, amph: 1, air: 1 } },
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

// 專屬兵種（只有部分國家擁有）
Object.assign(BASE_UNITS, {
  marine:  { cls: 'soft', cat: 'land', mt: 'amph', cost: 300, move: 4, range: [1, 1], atk: [5, 3, 1, 0, 1], capture: true },
  bomber:  { cls: 'air', cat: 'air', mt: 'air', cost: 1500, move: 7, range: [1, 1], atk: [9, 9, 0, 0, 9], fuel: 60, upkeep: 5 },
  stealth: { cls: 'air', cat: 'air', mt: 'air', cost: 1500, move: 8, range: [1, 1], atk: [8, 9, 0, 0, 8], fuel: 45, upkeep: 5, stealth: true },
  // 搭載兵種：carry.cap 容量、allow 可搭載的移動類型、light 只能載輕型（價格 ≤ 500）、runway 須停在據點上才能卸載
  truck:   { cls: 'hard', cat: 'land', mt: 'tread', cost: 200, move: 6, range: [1, 1], atk: [0, 0, 0, 0, 0], carry: { cap: 2, allow: ['foot'] } },
  thelico: { cls: 'heli', cat: 'air', mt: 'air', cost: 500, move: 6, range: [1, 1], atk: [0, 0, 0, 0, 0], fuel: 40, upkeep: 2, carry: { cap: 2, allow: ['foot'] } },
  airlift: { cls: 'air', cat: 'air', mt: 'air', cost: 800, move: 9, range: [1, 1], atk: [0, 0, 0, 0, 0], fuel: 60, upkeep: 4, carry: { cap: 2, allow: ['foot', 'tread', 'amph'], light: true, runway: true } },
  lst:     { cls: 'ship', cat: 'sea', mt: 'sea', cost: 600, move: 5, range: [1, 1], atk: [0, 0, 0, 0, 0], carry: { cap: 3, allow: ['foot', 'tread', 'amph'] } },
  carrier: { cls: 'ship', cat: 'sea', mt: 'sea', cost: 2400, move: 5, range: [1, 1], atk: [1, 1, 4, 3, 1], carry: { cap: 4, allow: ['air'], deck: true } },
  train:   { cls: 'hard', cat: 'land', mt: 'rail', cost: 400, move: 12, range: [1, 1], atk: [0, 0, 0, 0, 0], carry: { cap: 4, allow: ['foot', 'tread', 'amph'] } },
});
const RAIL_COST = 200;
// 各國搭載兵種（1990 年代初期）
const TRANSPORTS = {
  TW: { truck: ['M35卡車', 'M35 2.5 噸卡車'], thelico: ['UH-1H', 'UH-1H 通用直升機'], airlift: ['C-130H', 'C-130H 力士型運輸機'], lst: ['中字號', '中字號戰車登陸艦'] },
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
const BASE_DESC = {
  inf: '基本步兵，可佔領據點', atinf: '攜帶反戰車武器的步兵，可佔領據點', recon: '高機動偵察車，克制步兵',
  tank: '主力戰車，攻守兼備', arty: '間接攻擊，移動後不可射擊', rocket: '遠程火箭，移動後不可射擊',
  aa: '近距離防空，對步兵也有效', sam: '遠程防空飛彈，移動後不可射擊', heli: '攻擊直升機，懼怕防空',
  fighter: '制空戰鬥機，每回合消耗燃料', attacker: '對地對艦攻擊機', destroyer: '水面作戰艦艇',
  marine: '兩棲陸戰隊，可渡海登陸並佔領據點', bomber: '重型轟炸機，對地對艦火力強大', stealth: '匿蹤攻擊機，攻擊時不會遭到反擊',
  truck: '運輸卡車，可搭載 2 隊步兵', thelico: '運輸直升機，可搭載 2 隊步兵，任何地點卸載',
  airlift: '運輸機，可搭載 2 隊步兵或輕型車輛，須停在據點上卸載', lst: '登陸艦，可搭載 3 隊地面部隊並搶灘卸載',
  train: '軍用列車，只能在鐵路上行駛，可搭載 4 隊地面部隊',
  carrier: '航空母艦：可搭載 4 架飛機，艦上飛機每回合補給燃料並修復',
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
    prefer: { sam: 1.6, aa: 1.4, inf: 1.2, atinf: 1.3 }, adj: 1.08,
  },
  CN: {
    name: '中共', full: '中國人民解放軍', army: '解放軍', code: 'CN', style: 'east', camo: '#556b3b',
    doctrine: '人民戰爭', desc: '以龐大數量取勝：步兵與陸戰隊極為廉價，火砲數量多；單一武器性能較落後。專屬：轟-6 轟炸機。',
    units: {
      inf: ['解放軍步兵', '81式步槍步兵'], atinf: ['紅箭-8', '紅箭-8 反戰車飛彈'], recon: ['63式裝甲車', '63式裝甲車（YW531）'],
      tank: ['69-II式', '69-II式主力戰車'], arty: ['83式自走砲', '83式 152mm 自走榴彈砲'], rocket: ['81式火箭', '81式 122mm 多管火箭'],
      aa: ['80式高砲', '80式 57mm 自走高砲'], sam: ['紅旗-2', '紅旗-2 防空飛彈'], heli: ['直-9W', '直-9W 武裝直升機'],
      fighter: ['殲-8II', '殲-8II 戰鬥機'], attacker: ['強-5', '強-5 強擊機'], destroyer: ['旅大級', '051型旅大級驅逐艦'],
      marine: ['陸戰隊', '海軍陸戰隊（63式水陸坦克）'], bomber: ['轟-6', '轟-6 轟炸機'],
    },
    mods: [['inf', { cost: 0.7 }], ['marine', { cost: 0.75 }], ['arty', { cost: 0.85 }], ['rocket', { cost: 0.85 }],
      ['tank', { atk: -1, cost: 0.85 }], ['fighter', { atk: -1, cost: 0.85 }], ['heli', { atk: -1 }]],
    prefer: { inf: 1.6, marine: 1.5, arty: 1.3, rocket: 1.3 }, adj: 0.965,
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
    prefer: { fighter: 1.5, attacker: 1.5, heli: 1.3, stealth: 1.3 }, adj: 0.911,
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
    prefer: { inf: 1.6, atinf: 1.4, marine: 1.3, recon: 1.3 }, adj: 0.941,
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
    prefer: { inf: 1.5, aa: 1.4, sam: 1.3 }, adj: 1.049,
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
    prefer: {}, adj: 1.03,
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
    prefer: { destroyer: 1.3, recon: 1.3, marine: 1.2 }, adj: 0.985,
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
};
const CARRIERS = {
  US: ['小鷹級', '小鷹級航空母艦'], RU: ['庫茲涅佐夫', '庫茲涅佐夫海軍上將號航空母艦'], GB: ['無敵級', '無敵級航空母艦'],
  FR: ['克里蒙梭級', '克里蒙梭級航空母艦'], IN: ['維拉特號', '維拉特號航空母艦'],
};
const LOCOMOTIVES = { TW: 'R100型機車', CN: '東風4型機車', US: 'GP40 機車', JP: 'DD51型機車', KR: '7000型機車', KP: '紅旗型機車', PH: '菲國鐵機車',
  VN: 'D12E型機車', RU: '2TE116 機車', IN: 'WDM-2 機車', PK: 'GE U20C 機車', GB: '37型機車', FR: 'BB 67000 機車', DE: 'V160 機車', AU: 'GM 機車', IL: 'G12 機車' };
for (const [nid, tr] of Object.entries(TRANSPORTS)) {
  if (!tr) continue;
  for (const [b, v] of Object.entries(tr)) if (v) NATIONS[nid].units[b] = v;
  NATIONS[nid].units.train = ['軍用列車', `軍用列車（${LOCOMOTIVES[nid]}）`];
  if (CARRIERS[nid]) NATIONS[nid].units.carrier = CARRIERS[nid];
}
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
  CN: {
    tank: [['88b', null, '88B式', '88B式主力戰車', {}], ['96', '88b', '96式', '96式主力戰車', {}], ['99', '96', '99式', '99式主力戰車', {}]],
    fighter: [['j11', null, '殲-11', '殲-11（Su-27SK）', { atk: 2, move: 1 }], ['j10', null, '殲-10', '殲-10 戰鬥機', { atk: 2 }], ['j11b', 'j11', '殲-11B', '殲-11B 戰鬥機', {}]],
    attacker: [['jh7', null, '殲轟-7', '殲轟-7 飛豹', { atk: 1, move: 1 }], ['jh7a', 'jh7', '殲轟-7A', '殲轟-7A 飛豹', {}]],
    destroyer: [['052', null, '旅滬級', '052型旅滬級驅逐艦', {}], ['052c', '052', '旅洋II級', '052C型旅洋II級驅逐艦', {}]],
    sam: [['s300', null, 'S-300PMU', 'S-300PMU 防空飛彈', { atk: 1, range: [2, 6] }], ['hq9', 's300', '紅旗-9', '紅旗-9 防空飛彈', { atk: 1 }]],
    heli: [['z10', null, '直-10', '直-10 攻擊直升機', { atk: 2 }]],
    bomber: [['h6k', null, '轟-6K', '轟-6K 轟炸機', { atk: 1, move: 1 }]],
    rocket: [['phl03', null, '03式火箭', '03式 300mm 遠程火箭', { atk: 1, range: [3, 6] }]],
    marine: [['ztd05', null, '05式兩棲', '05式兩棲突擊車', { atk: 1, move: 1 }]],
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
    carrier: [['nimitz', null, '尼米茲級', '尼米茲級核動力航空母艦', { move: 1, armor: 0.85 }], ['ford', 'nimitz', '福特級', '福特級核動力航空母艦', { atk: 1, armor: 0.9 }]],
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
    carrier: [['vikramaditya', null, '超日王號', '超日王號航空母艦', { move: 1, armor: 0.88 }]],
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
    carrier: [['qe', null, '伊莉莎白女王級', '伊莉莎白女王級航空母艦', { move: 1, armor: 0.85 }]],
  },
  FR: {
    tank: [['leclerc', null, '勒克萊爾', '勒克萊爾主力戰車', { atk: 2, move: 1 }]],
    fighter: [['rafale', null, '飆風', '飆風戰鬥機', { atk: 2 }]],
    destroyer: [['horizon', null, '地平線級', '地平線級驅逐艦', { atk: 2 }]],
    heli: [['tigre', null, '虎式', '虎式攻擊直升機', { atk: 2 }]],
    carrier: [['cdg', null, '戴高樂號', '戴高樂號核動力航空母艦', { move: 1, armor: 0.85 }]],
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
// 經驗階級：新兵、老兵、精銳、王牌。攻擊力 +10%/階、迴避率 6%/12%/20%
// 進化到第 n 階需要第 n 階級（一階＝老兵、二階＝精銳、三階＝王牌）
const RANKS = [
  { name: '新兵', xp: 0, atk: 1, evade: 0 },
  { name: '老兵', xp: 70, atk: 1.1, evade: 0.06 },
  { name: '精銳', xp: 180, atk: 1.2, evade: 0.12 },
  { name: '王牌', xp: 340, atk: 1.3, evade: 0.2 },
];
const rankOf = u => { let r = 0; for (let k = 1; k < RANKS.length; k++) if ((u.xp || 0) >= RANKS[k].xp) r = k; return r; };

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
  // 進化型號：在前一階之上套用調整
  for (const [base, nodes] of Object.entries(EVOLUTION[nid] || {})) {
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
  ids.forEach((nid, side) => {
    buildNationUnits(nid, side);
    SIDES[side].name = NATIONS[nid].army;
    SIDES[side].nation = nid;
  });
  for (const a of allies) buildNationUnits(a.nid, a.side, '@' + a.nid);
}
// 基礎名稱 + 陣營 → 實際兵種鍵（若該國沒有此兵種，退回步兵）
const ftype = (type, side) => UNITS[type] ? type : UNITS[`${type}_${side}`] ? `${type}_${side}` : `inf_${side}`;
// 友軍兵種鍵
const atype = (type, side, nid) => UNITS[`${type}_${side}@${nid}`] ? `${type}_${side}@${nid}` : ftype(type, side);
applyNations(['TW', 'CN']);

const CAPTURE_POINTS = 20;
const START_FUNDS = 1500;
