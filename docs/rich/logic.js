// ===== 環島富豪 3D：遊戲規則（純邏輯，不含畫面；瀏覽器與 node 都可執行）=====
// 狀態 G 只含可序列化的資料：連線對戰時由房主執行規則，把 G 傳給其他玩家。
(function (root) {
  'use strict';

  // ----- 棋盤：125 格全台灣多路線路網（城鎮雙停駐點、鄉鎮景點美食連鎖飯店遊樂場百貨、澎湖12格與金門14格離島小地圖、北中南橫跨山支線）-----
  // type: start / land / chance / fate / tax / jail / gojail / park / shop / cardshop / autoshow / stock / minigame / temple / hospital / station / casino
  const GROUPS = {
    south: { name: '高屏南', color: '#3fb6c8' },
    yunjia: { name: '雲嘉南', color: '#6cc070' },
    central: { name: '中彰投', color: '#e8c547' },
    taoyuan: { name: '桃竹苗', color: '#f29b38' },
    north: { name: '北北基', color: '#e0565b' },
    scenic: { name: '台灣名勝', color: '#d36aa8' },
    east: { name: '宜花東', color: '#4f7fe0' },
    island: { name: '離島群島', color: '#9b6cd6' },
  };
  const L = (name, group, price, opt = {}) => ({ type: 'land', name, group, price, ...opt });
  const MAIN_COUNT = 88;
  const BOARD = [
    // 0..17 南台灣・高屏小琉球台南嘉義
    { type: 'start', name: '起點' },
    L('墾丁', 'south', 1300, { subkind: 'scenic' }),
    L('恆春', 'south', 1200, { subkind: 'town' }),
    L('墾丁大街美食', 'south', 1400, { subkind: 'food' }),
    { type: 'fate', name: '命運' },
    L('東港海鮮市集', 'south', 1500, { subkind: 'food' }),
    L('屏東', 'south', 1600, { subkind: 'city', branch: '南橫公路' }),
    L('小琉球', 'island', 1700, { subkind: 'scenic', branch: '高屏海路' }),
    L('高雄港灣', 'south', 2200, { subkind: 'city' }),
    L('高雄巨蛋百貨', 'south', 2500, { subkind: 'mall' }),
    { type: 'station', name: '高鐵左營', price: 2200 },
    L('橋頭糖廠遊樂場', 'south', 1800, { subkind: 'arcade' }),
    L('台南府城', 'yunjia', 2100, { subkind: 'city' }),
    L('台南夜市美食', 'yunjia', 1900, { subkind: 'food' }),
    L('安平古堡', 'yunjia', 2000, { subkind: 'scenic' }),
    { type: 'chance', name: '機會' },
    { type: 'shop', name: '造型服飾店' },
    L('嘉義', 'yunjia', 2100, { subkind: 'city' }),
    // 18..34 阿里山・雲嘉・日月潭・台中
    { type: 'jail', name: '監獄' },
    L('阿里山', 'scenic', 2600, { subkind: 'scenic' }),
    L('雲林斗六', 'yunjia', 1800, { subkind: 'town' }),
    L('劍湖山遊樂場', 'yunjia', 2300, { subkind: 'arcade' }),
    { type: 'temple', name: '北港廟宇', branch: '澎湖海路' },
    L('鹿港老街', 'central', 2200, { subkind: 'scenic' }),
    L('彰化', 'central', 2300, { subkind: 'city' }),
    L('日月潭連鎖飯店', 'central', 2700, { subkind: 'hotel' }),
    L('南投', 'central', 2000, { subkind: 'town' }),
    L('日月潭', 'scenic', 2800, { subkind: 'scenic' }),
    { type: 'hospital', name: '醫院' },
    { type: 'station', name: '台中高鐵', price: 2400 },
    L('台中七期百貨', 'central', 3200, { subkind: 'mall' }),
    L('台中', 'central', 3000, { subkind: 'city', branch: '中橫公路' }),
    L('麗寶遊樂場', 'central', 2700, { subkind: 'arcade' }),
    { type: 'stock', name: '台灣股市' },
    { type: 'chance', name: '機會', branch: '西部縱貫線' },
    // 35..57 桃竹苗・馬祖東引・海峽賭場・大台北基隆
    L('三義木雕村', 'taoyuan', 2100, { subkind: 'town' }),
    L('苗栗大湖', 'taoyuan', 2200, { subkind: 'food' }),
    L('竹科園區', 'taoyuan', 3400, { subkind: 'city' }),
    L('新竹城隍美食', 'taoyuan', 2500, { subkind: 'food' }),
    { type: 'cardshop', name: '卡片商店' },
    { type: 'fate', name: '命運' },
    L('桃園', 'taoyuan', 3100, { subkind: 'city' }),
    L('馬祖', 'island', 2700, { subkind: 'scenic', branch: '海空離島線' }),
    L('東引', 'island', 2500, { subkind: 'scenic' }),
    { type: 'casino', name: '海峽賭場', branch: '金門航線' },
    { type: 'station', name: '桃園機場', price: 2600 },
    { type: 'autoshow', name: '汽車展示中心' },
    L('淡水老街', 'north', 3300, { subkind: 'scenic' }),
    { type: 'park', name: '陽明山公園' },
    { type: 'temple', name: '行天宮' },
    { type: 'shop', name: '西門服飾店' },
    L('新北板橋', 'north', 4000, { subkind: 'city' }),
    L('台北西門町', 'north', 4800, { subkind: 'city' }),
    L('台北', 'north', 5400, { subkind: 'city' }),
    L('信義101百貨', 'north', 6200, { subkind: 'mall' }),
    { type: 'minigame', name: '夜市小遊戲' },
    { type: 'chance', name: '機會' },
    { type: 'station', name: '基隆港', price: 2500 },
    // 58..87 東北角・平溪・龜山島・宜花東・南迴
    { type: 'gojail', name: '入獄' },
    L('九份山城', 'scenic', 3500, { subkind: 'scenic' }),
    L('平溪天燈', 'scenic', 3200, { subkind: 'scenic' }),
    { type: 'tax', name: '國稅局' },
    L('龜山島', 'island', 2800, { subkind: 'scenic' }),
    L('頭城烏石港', 'east', 2600, { subkind: 'port' }),
    L('宜蘭', 'east', 3000, { subkind: 'city' }),
    L('羅東夜市', 'east', 2800, { subkind: 'food' }),
    L('礁溪連鎖飯店', 'east', 3200, { subkind: 'hotel' }),
    { type: 'fate', name: '命運' },
    { type: 'temple', name: '迎神殿' },
    L('太魯閣', 'scenic', 3800, { subkind: 'scenic' }),
    L('花蓮', 'east', 3300, { subkind: 'city' }),
    L('花蓮東大門美食', 'east', 3000, { subkind: 'food' }),
    { type: 'cardshop', name: '卡片商店' },
    L('海洋遊樂場', 'east', 3200, { subkind: 'arcade' }),
    L('玉里', 'east', 2500, { subkind: 'town' }),
    L('池上米鄉', 'east', 2600, { subkind: 'food' }),
    { type: 'chance', name: '機會' },
    { type: 'stock', name: '台灣股市' },
    L('台東', 'east', 3100, { subkind: 'city' }),
    L('知本溫泉飯店', 'scenic', 3000, { subkind: 'hotel' }),
    L('綠島', 'island', 3300, { subkind: 'scenic' }),
    L('蘭嶼', 'island', 3400, { subkind: 'scenic' }),
    L('太麻里', 'east', 2600, { subkind: 'scenic' }),
    { type: 'autoshow', name: '汽車展示中心' },
    { type: 'minigame', name: '夜市小遊戲' },
    { type: 'fate', name: '命運' },
    L('佳樂水', 'south', 2200, { subkind: 'scenic' }),
    L('鵝鑾鼻燈塔', 'south', 2400, { subkind: 'scenic' }),
    // 88..99 澎湖群島不規則小地圖（12 格：北港 22 -> 88..99 -> 鹿港 23）
    { type: 'station', name: '馬公港', price: 2400, branch: '澎湖群島', next: [89] },
    { type: 'temple', name: '澎湖天后宮', branch: '澎湖群島', next: [90] },
    L('中央老街美食', 'island', 2200, { subkind: 'food', branch: '澎湖群島', next: [91] }),
    { type: 'shop', name: '澎湖服飾店', branch: '澎湖群島', next: [92] },
    L('跨海大橋', 'island', 2500, { subkind: 'scenic', branch: '澎湖群島', next: [93] }),
    L('西嶼燈塔', 'island', 2300, { subkind: 'scenic', branch: '澎湖群島', next: [94] }),
    L('吉貝沙尾', 'island', 2400, { subkind: 'scenic', branch: '澎湖群島', next: [95] }),
    { type: 'cardshop', name: '澎湖卡片屋', branch: '澎湖群島', next: [96] },
    L('山水遊樂場', 'island', 2600, { subkind: 'arcade', branch: '澎湖群島', next: [97] }),
    L('望安綠蠵龜', 'island', 2300, { subkind: 'scenic', branch: '澎湖群島', next: [98] }),
    L('七美雙心', 'island', 2500, { subkind: 'scenic', branch: '澎湖群島', next: [99] }),
    L('澎湖免稅百貨', 'island', 2900, { subkind: 'mall', branch: '澎湖群島', next: [23] }),
    // 100..113 金門群島不規則小地圖（14 格：海峽賭場 44 -> 100..113 -> 桃園機場 45）
    { type: 'station', name: '水頭碼頭', price: 2500, branch: '金門群島', next: [101] },
    L('莒光樓', 'island', 2600, { subkind: 'scenic', branch: '金門群島', next: [102] }),
    L('金城模範美食', 'island', 2400, { subkind: 'food', branch: '金門群島', next: [103] }),
    { type: 'cardshop', name: '金門卡片屋', branch: '金門群島', next: [104] },
    L('烈嶼小金門', 'island', 2500, { subkind: 'town', branch: '金門群島', next: [105] }),
    L('大膽島前線', 'island', 2600, { subkind: 'scenic', branch: '金門群島', next: [106] }),
    L('古寧頭戰史館', 'island', 2500, { subkind: 'scenic', branch: '金門群島', next: [107] }),
    { type: 'minigame', name: '慈湖小遊戲', branch: '金門群島', next: [108] },
    L('山后民俗村', 'island', 2400, { subkind: 'town', branch: '金門群島', next: [109] }),
    L('太武山', 'island', 2700, { subkind: 'scenic', branch: '金門群島', next: [110] }),
    { type: 'stock', name: '金沙股市廣場', branch: '金門群島', next: [111] },
    L('金門遊樂場', 'island', 2700, { subkind: 'arcade', branch: '金門群島', next: [112] }),
    L('昇恆昌百貨', 'island', 3100, { subkind: 'mall', branch: '金門群島', next: [113] }),
    { type: 'station', name: '料羅灣碼頭', price: 2600, branch: '金門群島', next: [45] },
    // 114..116 北橫公路支線（桃園 41 -> 114..116 -> 宜蘭 64）
    L('大溪老街', 'taoyuan', 2700, { subkind: 'town', branch: '北橫公路', next: [115] }),
    L('拉拉山', 'scenic', 2900, { subkind: 'scenic', branch: '北橫公路', next: [116] }),
    L('明池', 'scenic', 2800, { subkind: 'scenic', branch: '北橫公路', next: [64] }),
    // 117..120 中橫公路支線（台中 31 -> 117..120 -> 太魯閣 69）
    L('谷關溫泉', 'central', 2600, { subkind: 'hotel', branch: '中橫公路', next: [118] }),
    L('梨山', 'scenic', 2900, { subkind: 'scenic', branch: '中橫公路', next: [119] }),
    L('合歡山', 'scenic', 3400, { subkind: 'scenic', branch: '中橫公路', next: [120] }),
    L('天祥', 'scenic', 2800, { subkind: 'scenic', branch: '中橫公路', next: [69] }),
    // 121..124 南橫公路支線（屏東 6 -> 121..124 -> 池上機會 76）
    L('甲仙芋頭街', 'south', 2100, { subkind: 'food', branch: '南橫公路', next: [122] }),
    L('梅山', 'scenic', 2400, { subkind: 'scenic', branch: '南橫公路', next: [123] }),
    L('埡口', 'scenic', 2900, { subkind: 'scenic', branch: '南橫公路', next: [124] }),
    L('向陽', 'scenic', 2700, { subkind: 'scenic', branch: '南橫公路', next: [76] }),
  ];
  // 建立路網有向圖與反向邊（交接處可選擇主線、外島小地圖或橫貫公路）
  for (let i = 0; i < BOARD.length; i++) {
    if (!BOARD[i].next) BOARD[i].next = [(i + 1) % MAIN_COUNT];
    BOARD[i].prev = [];
  }
  BOARD[6].next = [7, 121];   // 屏東：高屏海路(小琉球) / 南橫公路(甲仙)
  BOARD[22].next = [23, 88];  // 北港廟宇：彰化主線(鹿港) / 澎湖群島小地圖(馬公港)
  BOARD[31].next = [32, 117]; // 台中：西部縱貫線(麗寶) / 中橫公路(谷關)
  BOARD[41].next = [42, 114]; // 桃園：海空離島線(馬祖) / 北橫公路(大溪)
  BOARD[44].next = [45, 100]; // 海峽賭場：桃園機場 / 金門群島小地圖(水頭碼頭)
  for (let i = 0; i < BOARD.length; i++) {
    for (const j of BOARD[i].next) BOARD[j].prev.push(i);
  }
  const N = BOARD.length;
  const START_BONUS = 2000, START_CASH = 18000, MAX_LEVEL = 5, JAIL_TURNS = 2, MAX_ITEMS = 8;
  const LEVEL_NAME = ['空地', '溫馨洋房', '高級住宅', '摩天大樓', '五星飯店', '連鎖旗艦店'];
  const RENT_MUL = [1.5, 5, 11, 20, 32, 48];

  // ----- 神明與地圖移動 NPC -----
  const GODS = {
    tudigong: { name: '土地公', good: true, turns: 5, icon: '👴', color: '#f1c40f', desc: '踩到別人的地可免費強佔為己有！買空地享半價優惠！' },
    caishen: { name: '財神爺', good: true, turns: 5, icon: '💰', color: '#e74c3c', desc: '每回合領 $1500 紅包；踩別人地免過路費；收租 +50%！' },
    fushen: { name: '福神', good: true, turns: 5, icon: '🍀', color: '#2ecc71', desc: '踩到自己的地免費自動加蓋一層；買空地享 8 折！' },
    qiongshen: { name: '窮神', good: false, turns: 4, icon: '💸', color: '#7f8c8d', desc: '每回合開始損失 $1000；支付過路費變為 2 倍！' },
    shuaishen: { name: '衰神', good: false, turns: 4, icon: '⚡', color: '#8e44ad', desc: '買地與蓋房費用 1.5 倍；每回合可能遺失道具或建築降級！' },
    dog: { name: '野狗', good: false, turns: 0, icon: '🐕', color: '#c07a3e', desc: '在路上遊蕩的兇猛野狗，碰到會被咬傷送醫住院 1 回合並付 $800！' },
  };
  const GOOD_GOD_KEYS = ['tudigong', 'caishen', 'fushen'];
  const GOD_NPC_INIT = [
    { kind: 'tudigong', pos: 4 },
    { kind: 'caishen', pos: 14 },
    { kind: 'fushen', pos: 23 },
    { kind: 'qiongshen', pos: 33 },
    { kind: 'shuaishen', pos: 44 },
    { kind: 'dog', pos: 51 },
  ];

  // ----- 道具（含請神卡、送神卡、道具屋加購第 2 顆骰子）-----
  const ITEMS = {
    add_die: { name: '加購骰子', price: 2500, icon: '🎲', desc: '永久升級為雙骰子（2 顆骰子），每回合移動點數變 2–12 點！', shopOnly: true },
    summon_god: { name: '請神卡', price: 2000, icon: '🙏', desc: '請來指定好神明（土地公／財神爺／福神）附身 5 回合' },
    dismiss_god: { name: '送神卡', price: 1500, icon: '💨', desc: '送走自己身上的壞神明轉嫁給對手，或驅散對手的好神明' },
    remote: { name: '遙控骰子', price: 1200, icon: '🎯', desc: '下次擲骰時自選點數（1 顆 1–6，2 顆 2–12）' },
    block: { name: '路障卡', price: 1000, icon: '🚧', desc: '放在前方 1–8 格內，經過的玩家會在此強制停下' },
    free: { name: '免租卡', price: 1500, icon: '🛡️', desc: '下次要付過路費時自動抵銷一次（無法擋土地公強佔）' },
    reverse: { name: '迴轉卡', price: 800, icon: '🔄', desc: '改為反方向前進（直到再次使用）' },
    demolish: { name: '拆除卡', price: 1600, icon: '💣', desc: '把對手一塊地的建築降一級' },
    seize: { name: '徵收卡', price: 2800, icon: '📜', desc: '以 1.2 倍地價與建築現值強行收購對手一塊土地' },
  };
  const ITEM_KEYS = Object.keys(ITEMS).filter(k => !ITEMS[k].shopOnly);

  // ----- 商店服飾造型 & 汽車展示中心座駕 -----
  const OUTFITS = {
    space_suit: { name: '星際太空裝', price: 1800, icon: '🧑‍🚀', color: '#e2e8f0', accent: '#38bdf8', desc: '全罩透明太空頭盔＋白銀太空服與噴射背包！' },
    cowboy: { name: '西部牛仔裝', price: 1400, icon: '🤠', color: '#92400e', accent: '#f59e0b', desc: '帥氣寬邊牛仔帽＋棕革背心與紅領巾！' },
    luxury: { name: '名牌精品裝', price: 2400, icon: '🤵', color: '#111827', accent: '#facc15', desc: '高級訂製黑金西裝禮服＋閃耀鑽石領結！' },
    ninja: { name: '潮流忍者裝', price: 1600, icon: '🥷', color: '#1e1b4b', accent: '#ef4444', desc: '暗夜忍裝＋紅巾護額與背後雙太刀！' },
    race_suit: { name: '極速賽車服', price: 2000, icon: '🏎️', color: '#dc2626', accent: '#fef08a', desc: '流線賽車安全帽＋紅白競速連身服！' },
  };
  const CARS = {
    scooter: { name: '復古偉士牌機車', price: 1800, icon: '🛵', color: '#38bdf8', desc: '靈巧可愛的台灣街頭經典復古速克達！' },
    sedan: { name: '都會豪華房車', price: 3500, icon: '🚗', color: '#e2e8f0', desc: '寬敞舒適的銀白雙門敞篷豪華房車！' },
    sports: { name: '烈焰超跑', price: 6000, icon: '🏎️', color: '#ef4444', desc: '低趴流線、尾翼霸氣的鮮紅旗艦超跑！' },
    cyber_suv: { name: '未來越野休旅', price: 8500, icon: '🚙', color: '#facc15', desc: '配備霓虹燈條與全景車頂的霸氣未來休旅！' },
  };
  const OUTFIT_KEYS = Object.keys(OUTFITS);
  const CAR_KEYS = Object.keys(CARS);

  // ----- 各地特色特產（24 種台灣各地名產，可收集並修飾 3D 棋子外觀）-----
  const SLOT_NAMES = { hand: '手持', head: '頭飾', back: '背飾', halo: '伴隨' };
  const SPECIALTIES = {
    bubble_tea: { name: '珍珠奶茶', icon: '🧋', slot: 'hand', origin: '台中', color: '#c08457', desc: '手捧濃醇黑糖珍珠奶茶，環島必備手搖飲！' },
    xiaolongbao: { name: '台北小籠包', icon: '🥟', slot: 'hand', origin: '台北 / 新北', color: '#e5e7eb', desc: '熱騰騰的竹籠小籠包，皮薄湯汁鮮美！' },
    keelung_tempura: { name: '廟口天婦羅', icon: '🍢', slot: 'hand', origin: '基隆港 / 淡水', color: '#f97316', desc: '基隆廟口炭烤金黃甜不辣串，香氣撲鼻！' },
    daxi_tofu: { name: '大溪黑豆干', icon: '🟫', slot: 'hand', origin: '桃園 / 大溪', color: '#78350f', desc: '滷得入味彈牙的大溪傳統黑豆干禮串！' },
    miaoli_strawberry: { name: '大湖草莓籃', icon: '🍓', slot: 'hand', origin: '苗栗', color: '#e11d48', desc: '裝滿鮮紅香甜大湖草莓的手提竹籃！' },
    pineapple_cake: { name: '鳳梨酥禮盒', icon: '🍍', slot: 'hand', origin: '南投 / 嘉義', color: '#f59e0b', desc: '金黃酥香的台灣名產鳳梨酥伴手禮！' },
    mango_ice: { name: '愛文芒果冰', icon: '🥭', slot: 'hand', origin: '台南 / 安平', color: '#fbbf24', desc: '堆滿鮮甜芒果塊與煉乳的消暑剉冰！' },
    kinmen_kaoliang: { name: '金門高粱酒', icon: '🏺', slot: 'hand', origin: '金門 / 烈嶼', color: '#38bdf8', desc: '經典青花瓷瓶裝陳年高粱，豪氣干雲！' },
    yilan_scallion: { name: '宜蘭三星蔥', icon: '🧅', slot: 'hand', origin: '宜蘭 / 羅東', color: '#22c55e', desc: '翠綠飽滿的三星蔥束，最接地氣的台灣味！' },
    taitung_sugar_apple: { name: '台東大目釋迦', icon: '🍈', slot: 'hand', origin: '台東 / 知本', color: '#4ade80', desc: '飽滿香甜的台東特產大目釋迦果實！' },
    sun_moon_jade: { name: '原民彩羽冠', icon: '🪶', slot: 'head', origin: '日月潭 / 山地', color: '#ef4444', desc: '融合山海色彩的部落精緻羽飾頭冠！' },
    penghu_cactus: { name: '澎湖仙人掌', icon: '🌵', slot: 'head', origin: '澎湖 / 離島', color: '#10b981', desc: '開著紅果實的迷你仙人掌盆栽頭飾！' },
    kaohsiung_anchor: { name: '海港船長帽', icon: '⚓', slot: 'head', origin: '高雄 / 左營', color: '#1d4ed8', desc: '象徵高雄大港精神的金色錨徽船長帽！' },
    pingtung_tuna: { name: '東港黑鮪魚帽', icon: '🐟', slot: 'head', origin: '屏東 / 墾丁', color: '#0284c7', desc: '超逗趣的東港黑鮪魚造型紀念頭套！' },
    changhua_meatball: { name: '彰化古早斗笠', icon: '👒', slot: 'head', origin: '彰化 / 鹿港', color: '#d97706', desc: '充滿鹿港老街懷舊風情的竹編斗笠！' },
    lanyu_flying_fish: { name: '蘭嶼飛魚冠', icon: '🐠', slot: 'head', origin: '蘭嶼 / 綠島', color: '#06b6d4', desc: '達悟族拼板舟白紅黑三色飛魚圖騰頭飾！' },
    alishan_tea: { name: '阿里山茶簍', icon: '🍵', slot: 'back', origin: '阿里山 / 高山', color: '#16a34a', desc: '背上竹編採茶簍與高山烏龍茶葉清香！' },
    hsinchu_wind: { name: '竹科光翼', icon: '💠', slot: 'back', origin: '竹科 / 新竹', color: '#0ea5e9', desc: '閃耀護國神山電藍電路紋的科技光翼！' },
    yunlin_talisman: { name: '北港平安令旗', icon: '🚩', slot: 'back', origin: '北港 / 廟宇', color: '#eab308', desc: '媽祖廟求得的金龍護身平安令旗背飾！' },
    jiufen_gold: { name: '九份淘金背簍', icon: '⛏️', slot: 'back', origin: '九份 / 金瓜石', color: '#facc15', desc: '裝滿閃亮金礦石的山城礦工背簍！' },
    hualien_marble: { name: '花蓮大理石盾', icon: '🪨', slot: 'back', origin: '花蓮 / 太魯閣', color: '#94a3b8', desc: '太魯閣紋理天然大理石精雕的背盾！' },
    sky_lantern: { name: '平溪祈福天燈', icon: '🏮', slot: 'halo', origin: '平溪', color: '#fb923c', desc: '暖光微閃、隨身伴飛的平溪祈福天燈！' },
    wood_carving: { name: '三義木雕貓頭鷹', icon: '🦉', slot: 'halo', origin: '三義', color: '#a16207', desc: '手工原木雕刻的幸運守護貓頭鷹伴飛！' },
    matsu_tears: { name: '馬祖藍眼淚燈', icon: '🔮', slot: 'halo', origin: '馬祖 / 東引', color: '#38bdf8', desc: '散發夢幻幽藍螢光的馬祖藍眼淚星燈！' },
  };
  const SPECIALTY_KEYS = Object.keys(SPECIALTIES);
  const TILE_SPECIALTY = {
    '起點': 'bubble_tea',
    '台中': 'bubble_tea', '台中高鐵': 'bubble_tea', '台中七期百貨': 'bubble_tea', '麗寶遊樂場': 'bubble_tea',
    '台北': 'xiaolongbao', '台北西門町': 'xiaolongbao', '信義101百貨': 'xiaolongbao', '新北板橋': 'xiaolongbao', '西門服飾店': 'xiaolongbao', '造型服飾店': 'xiaolongbao',
    '基隆港': 'keelung_tempura', '淡水老街': 'keelung_tempura',
    '桃園': 'daxi_tofu', '大溪老街': 'daxi_tofu',
    '苗栗大湖': 'miaoli_strawberry',
    '南投': 'pineapple_cake', '嘉義': 'pineapple_cake', '機會': 'pineapple_cake',
    '台南府城': 'mango_ice', '台南夜市美食': 'mango_ice', '安平古堡': 'mango_ice', '夜市小遊戲': 'mango_ice',
    '水頭碼頭': 'kinmen_kaoliang', '莒光樓': 'kinmen_kaoliang', '金城模範美食': 'kinmen_kaoliang', '金門卡片屋': 'kinmen_kaoliang',
    '烈嶼小金門': 'kinmen_kaoliang', '大膽島前線': 'kinmen_kaoliang', '古寧頭戰史館': 'kinmen_kaoliang', '慈湖小遊戲': 'kinmen_kaoliang',
    '山后民俗村': 'kinmen_kaoliang', '太武山': 'kinmen_kaoliang', '金沙股市廣場': 'kinmen_kaoliang', '金門遊樂場': 'kinmen_kaoliang',
    '昇恆昌百貨': 'kinmen_kaoliang', '料羅灣碼頭': 'kinmen_kaoliang',
    '頭城烏石港': 'yilan_scallion', '宜蘭': 'yilan_scallion', '羅東夜市': 'yilan_scallion', '礁溪連鎖飯店': 'yilan_scallion',
    '台東': 'taitung_sugar_apple', '知本溫泉飯店': 'taitung_sugar_apple', '玉里': 'taitung_sugar_apple', '池上米鄉': 'taitung_sugar_apple', '太麻里': 'taitung_sugar_apple',
    '日月潭': 'sun_moon_jade', '日月潭連鎖飯店': 'sun_moon_jade', '拉拉山': 'sun_moon_jade', '明池': 'sun_moon_jade',
    '谷關溫泉': 'sun_moon_jade', '梨山': 'sun_moon_jade', '合歡山': 'sun_moon_jade', '埡口': 'sun_moon_jade', '向陽': 'sun_moon_jade',
    '馬公港': 'penghu_cactus', '中央老街美食': 'penghu_cactus', '澎湖服飾店': 'penghu_cactus', '跨海大橋': 'penghu_cactus',
    '西嶼燈塔': 'penghu_cactus', '吉貝沙尾': 'penghu_cactus', '澎湖卡片屋': 'penghu_cactus', '山水遊樂場': 'penghu_cactus',
    '望安綠蠵龜': 'penghu_cactus', '七美雙心': 'penghu_cactus', '澎湖免稅百貨': 'penghu_cactus',
    '小琉球': 'penghu_cactus', '龜山島': 'penghu_cactus',
    '高雄港灣': 'kaohsiung_anchor', '高雄巨蛋百貨': 'kaohsiung_anchor', '高鐵左營': 'kaohsiung_anchor', '橋頭糖廠遊樂場': 'kaohsiung_anchor', '汽車展示中心': 'kaohsiung_anchor',
    '屏東': 'pingtung_tuna', '墾丁': 'pingtung_tuna', '恆春': 'pingtung_tuna', '墾丁大街美食': 'pingtung_tuna',
    '東港海鮮市集': 'pingtung_tuna', '佳樂水': 'pingtung_tuna', '鵝鑾鼻燈塔': 'pingtung_tuna', '甲仙芋頭街': 'pingtung_tuna', '梅山': 'pingtung_tuna',
    '彰化': 'changhua_meatball', '鹿港老街': 'changhua_meatball',
    '蘭嶼': 'lanyu_flying_fish', '綠島': 'lanyu_flying_fish',
    '阿里山': 'alishan_tea', '天祥': 'alishan_tea', '陽明山公園': 'alishan_tea', '醫院': 'alishan_tea',
    '竹科園區': 'hsinchu_wind', '新竹城隍美食': 'hsinchu_wind', '桃園機場': 'hsinchu_wind', '台灣股市': 'hsinchu_wind',
    '北港廟宇': 'yunlin_talisman', '行天宮': 'yunlin_talisman', '迎神殿': 'yunlin_talisman', '澎湖天后宮': 'yunlin_talisman',
    '雲林斗六': 'yunlin_talisman', '劍湖山遊樂場': 'yunlin_talisman', '監獄': 'yunlin_talisman', '入獄': 'yunlin_talisman',
    '九份山城': 'jiufen_gold', '國稅局': 'jiufen_gold',
    '花蓮': 'hualien_marble', '花蓮東大門美食': 'hualien_marble', '太魯閣': 'hualien_marble', '海洋遊樂場': 'hualien_marble',
    '平溪天燈': 'sky_lantern', '命運': 'sky_lantern',
    '三義木雕村': 'wood_carving', '卡片商店': 'wood_carving',
    '馬祖': 'matsu_tears', '東引': 'matsu_tears', '海峽賭場': 'matsu_tears',
  };
  function specialtyOfTile(i) {
    const t = BOARD[i];
    if (!t) return null;
    if (TILE_SPECIALTY[t.name]) return TILE_SPECIALTY[t.name];
    if (t.group === 'island') return 'penghu_cactus';
    if (t.group === 'east') return 'sun_moon_jade';
    if (t.group === 'north') return 'xiaolongbao';
    if (t.group === 'south') return 'pingtung_tuna';
    if (t.group === 'central') return 'bubble_tea';
    if (t.group === 'taoyuan') return 'hsinchu_wind';
    if (t.group === 'yunjia') return 'mango_ice';
    return 'bubble_tea';
  }

  // ----- 機會與命運卡 -----
  const CHANCE = [
    { t: '投資台灣半導體大賺，獲得 $3500', f: (G, p) => { gain(G, p, 3500); pushNews(G, '機會快報', `${p.name} 投資台灣科技股大賺 $3500！`, '財經喜訊', '#2ecc71'); } },
    { t: '中了統一發票特別獎，獲得 $2500', f: (G, p) => { gain(G, p, 2500); pushNews(G, '機會快報', `${p.name} 中了統一發票獲得獎金 $2500！`, '好運連連', '#2ecc71'); } },
    { t: '搭高鐵快速北上，前進到台北', f: (G, p) => { pushNews(G, '交通快訊', `${p.name} 搭乘高鐵 700T 直奔「台北」！`, '機會移動', '#3498db'); moveTo(G, p, idx('台北'), 'hsr'); } },
    { t: '搭直升機回到起點領取環島補助 $2000', f: (G, p) => { pushNews(G, '環島補助', `${p.name} 搭乘環島直升機飛回起點領取補助！`, '機會移動', '#3498db'); moveTo(G, p, 0, 'heli'); } },
    { t: '獲得一張「請神卡」', f: (G, p) => giveItem(G, p, 'summon_god', '機會贈卡') },
    { t: '獲得一張「送神卡」', f: (G, p) => giveItem(G, p, 'dismiss_god', '機會贈卡') },
    { t: '獲得地方都更補助，免費升級一塊自己的地', f: (G, p) => freeUpgrade(G, p) },
    { t: '喜氣洋洋！每位對手包給你紅包 $600', f: (G, p) => { eachOther(G, p, q => transfer(G, q, p, 600)); pushNews(G, '紅包行情', `${p.name} 向全場玩家收取紅包各 $600！`, '機會發財', '#f1c40f'); } },
    { t: '土地公托夢指點明牌，獲得 $1500', f: (G, p) => { gain(G, p, 1500); pushNews(G, '機會快報', `${p.name} 夢見土地公指點明牌，進帳 $1500！`, '好運連連', '#2ecc71'); } },
  ];
  const FATE = [
    { t: '國道超速被開罰單，付出 $1200', f: (G, p) => { pay(G, p, 1200, null, '超速罰單'); pushNews(G, '交通違規', `${p.name} 超速被開罰單 $1200！`, '命運罰款', '#e67e22'); } },
    { t: '逛夜市吃壞肚子送醫院，住院休息一回合', f: (G, p) => goHospital(G, p, '食物中毒送醫住院 1 回合') },
    { t: '逃漏稅被國稅局查獲，直接入獄', f: (G, p) => goJail(G, p, '逃漏稅遭移送法辦') },
    { t: '颱風登陸台灣！所有玩家每塊地付 $250 防災修繕', f: (G, p) => { G.players.forEach(q => !q.bankrupt && pay(G, q, 250 * lands(G, q).length, null, '颱風防災')); pushNews(G, '颱風警報', `${p.name} 引發颱風警報，全體地主依土地數量繳納防災費！`, '天災快訊', '#e74c3c'); } },
    { t: '請大家吃台灣夜市美食，向每位對手支付 $500', f: (G, p) => { eachOther(G, p, q => transfer(G, p, q, 500)); pushNews(G, '夜市請客', `${p.name} 豪氣請每位玩家吃夜市美食各 $500！`, '命運破財', '#e67e22'); } },
    { t: '熱心拾金不昧獲表揚，獲得獎金 $1000', f: (G, p) => { gain(G, p, 1000); pushNews(G, '好人好事', `${p.name} 拾金不昧獲得表揚獎金 $1000！`, '表揚新聞', '#2ecc71'); } },
    { t: '施工改道，後退 3 格', f: (G, p) => { pushNews(G, '道路改道', `${p.name} 遇上道路施工，後退 3 格！`, '命運移動', '#9b59b6'); moveBy(G, p, -3); } },
    { t: '遭遇股市回檔，損失現金的 15%', f: (G, p) => { const amt = Math.round(p.cash * 0.15); pay(G, p, amt, null, '股市回檔'); pushNews(G, '股災快訊', `${p.name} 遇上股市劇烈回檔，蒸發現金 $${amt}！`, '金融警報', '#e74c3c'); } },
    { t: '接到詐騙電話被騙，損失 $800', f: (G, p) => { pay(G, p, 800, null, '詐騙電話'); pushNews(G, '詐騙警訊', `${p.name} 誤信詐騙電話被騙走 $800！`, '命運破財', '#e67e22'); } },
  ];

  const idx = name => BOARD.findIndex(t => t.name === name);
  const rnd = G => { G.seed = (G.seed * 1103515245 + 12345) >>> 0; return (G.seed >>> 8) / 16777216; };
  const roll = G => 1 + Math.floor(rnd(G) * 6);
  const log = (G, s) => { G.log.push(s); if (G.log.length > 80) G.log.shift(); };
  const cur = G => G.players[G.cur];
  const lands = (G, p) => G.tiles.map((t, i) => i).filter(i => G.tiles[i].owner === p.id);
  const levels = (G, p) => lands(G, p).reduce((s, i) => s + (G.tiles[i].level || 0), 0);
  const groupOwned = (G, i) => { const t = BOARD[i]; if (t.type !== 'land') return false; const o = G.tiles[i].owner; return o != null && BOARD.every((b, j) => b.group !== t.group || G.tiles[j].owner === o); };

  function pushNews(G, cat, title, body = '', color = '#e74c3c') {
    G.newsSeq = (G.newsSeq || 0) + 1;
    if (!G.news) G.news = [];
    G.news.push({ id: G.newsSeq, cat, title, body: body || title, color, round: G.round || 1 });
    if (G.news.length > 25) G.news.shift();
  }

  function rentAt(G, i, lv) {
    const t = BOARD[i], s = G.tiles[i];
    if (s.owner == null) return 0;
    const owner = G.players.find(q => q.id === s.owner);
    const effLv = Math.max(0, Math.min(MAX_LEVEL, lv | 0));
    let r = 0;
    if (t.type === 'station') {
      const n = G.tiles.filter((x, j) => BOARD[j].type === 'station' && x.owner === s.owner).length;
      r = Math.round(350 * Math.pow(2, n - 1) * (1 + effLv * 0.85));
    } else {
      r = Math.round(t.price * 0.2 * RENT_MUL[effLv]);
      if (groupOwned(G, i)) r *= 2;
    }
    if (owner && owner.god && owner.god.kind === 'caishen') r = Math.round(r * 1.5);
    return r;
  }
  function rentOf(G, i) { return rentAt(G, i, G.tiles[i].level || 0); }
  const buildCost = i => Math.round(BOARD[i].price * 0.5);
  function buyPriceOf(G, p, i) {
    const base = BOARD[i].price;
    if (p && p.god) {
      if (p.god.kind === 'tudigong') return Math.round(base * 0.5);
      if (p.god.kind === 'fushen') return Math.round(base * 0.8);
      if (p.god.kind === 'shuaishen') return Math.round(base * 1.5);
    }
    return base;
  }
  function buildCostOf(G, p, i) {
    const base = buildCost(i);
    if (p && p.god && p.god.kind === 'shuaishen') return Math.round(base * 1.5);
    return base;
  }
  const valueOf = (G, i) => (BOARD[i].price || 0) + (G.tiles[i].level || 0) * buildCost(i);
  const netWorth = (G, p) => p.cash + lands(G, p).reduce((s, i) => s + valueOf(G, i), 0);

  function gain(G, p, n) { p.cash += n; log(G, `${p.name} 獲得 $${n}`); }
  function pay(G, p, n, to, why) {
    if (n <= 0) return;
    p.cash -= n; if (to) to.cash += n;
    log(G, `${p.name} ${why ? why + '，' : ''}付出 $${n}${to ? ' 給 ' + to.name : ''}`);
    settle(G, p, to);
  }
  function transfer(G, from, to, n) { pay(G, from, n, to); }
  function eachOther(G, p, f) { G.players.forEach(q => { if (q !== p && !q.bankrupt) f(q); }); }
  function giveItem(G, p, fixedKey = null, source = '') {
    const k = fixedKey || ITEM_KEYS[Math.floor(rnd(G) * ITEM_KEYS.length)];
    if (p.items.length >= MAX_ITEMS) { log(G, `${p.name} 的道具欄已滿（最多 ${MAX_ITEMS} 張）`); return null; }
    p.items.push(k);
    log(G, `${p.name} ${source ? source + '，' : ''}獲得道具「${ITEMS[k].name}」`);
    if (k === 'summon_god' || k === 'dismiss_god' || k === 'seize') {
      pushNews(G, '稀有道具', `${p.name} 獲得強力道具「${ITEMS[k].icon} ${ITEMS[k].name}」！`, source || '道具補給', '#9b59b6');
    }
    return k;
  }
  function giveSpecialty(G, p, key, source = '') {
    if (!key || !SPECIALTIES[key]) return null;
    if (!p.specialties) p.specialties = [];
    if (!p.equipped) p.equipped = {};
    if (p.specialties.includes(key)) return null;
    p.specialties.push(key);
    const sp = SPECIALTIES[key];
    const autoEq = !p.equipped[sp.slot];
    if (autoEq) p.equipped[sp.slot] = key;
    log(G, `🎁 ${p.name} ${source ? source + '，' : ''}獲得地方特產「${sp.icon} ${sp.name}」${autoEq ? '（已自動裝飾棋子）' : '（可於玩家資訊／道具欄修飾棋子）'}`);
    return key;
  }
  function triggerTileItemEvent(G, p, i, triggerLabel) {
    const spKey = specialtyOfTile(i);
    if (spKey && !(p.specialties || []).includes(spKey)) {
      giveSpecialty(G, p, spKey, triggerLabel);
      G.itemEvent = { n: (G.fxSeq = (G.fxSeq || 0) + 1), p: p.id, tile: i, kind: 'specialty', key: spKey, trigger: triggerLabel };
      return;
    }
    const t = BOARD[i];
    if (t && (['park', 'temple', 'shop', 'cardshop', 'autoshow'].includes(t.type) || ['food', 'scenic', 'arcade', 'mall', 'hotel', 'port'].includes(t.subkind))) {
      const unowned = SPECIALTY_KEYS.filter(k => !(p.specialties || []).includes(k));
      if (unowned.length && rnd(G) < 0.45) {
        const k = unowned[Math.floor(rnd(G) * unowned.length)];
        giveSpecialty(G, p, k, `${t.name}特產巡禮`);
        G.itemEvent = { n: (G.fxSeq = (G.fxSeq || 0) + 1), p: p.id, tile: i, kind: 'specialty', key: k, trigger: `${t.name}特產巡禮` };
      } else if ((p.items || []).length < MAX_ITEMS && rnd(G) < 0.35) {
        const itKey = giveItem(G, p, null, `${t.name}奇遇`);
        if (itKey) {
          G.itemEvent = { n: (G.fxSeq = (G.fxSeq || 0) + 1), p: p.id, tile: i, kind: 'item', key: itKey, trigger: `${t.name}奇遇` };
        }
      }
    }
  }
  function freeUpgrade(G, p) {
    const own = lands(G, p).filter(i => (BOARD[i].type === 'land' || BOARD[i].type === 'station') && G.tiles[i].level < MAX_LEVEL);
    if (!own.length) { log(G, `${p.name} 沒有可升級的地`); return; }
    own.sort((a, b) => BOARD[b].price - BOARD[a].price);
    const ti = own[0];
    G.tiles[ti].level++;
    log(G, `${BOARD[ti].name} 免費升級為${LEVEL_NAME[G.tiles[ti].level]}`);
    G.fx = { k: 'build', i: ti, lv: G.tiles[ti].level };
    pushNews(G, G.tiles[ti].level === MAX_LEVEL ? '摩天大樓落成' : '都更喜訊', `${p.name} 獲得地方補助，「${BOARD[ti].name}」免費升為【${LEVEL_NAME[G.tiles[ti].level]}】！`, '都市更新', '#2ecc71');
  }

  // 隨機挑一格給神明棋子停留：排除起點、監獄、醫院、其他未附身棋子與玩家所在格
  function randomBoardTile(G, self = null) {
    const taken = new Set();
    for (const n of G.npcs || []) if (n !== self && n.attachedTo == null) taken.add(n.pos);
    for (const q of G.players || []) if (!q.bankrupt) taken.add(q.pos);
    const candidates = [], fallback = [];
    for (let i = 1; i < N; i++) {
      const t = BOARD[i].type;
      if (t === 'jail' || t === 'gojail' || t === 'hospital') continue;
      fallback.push(i);
      if (!taken.has(i)) candidates.push(i);
    }
    const list = candidates.length ? candidates : fallback;
    return list[Math.floor(rnd(G) * list.length)] || 1;
  }
  function releaseGod(G, p, silent = false) {
    if (!p || !p.god) return;
    const oldKind = p.god.kind;
    p.god = null;
    const npc = (G.npcs || []).find(n => n.kind === oldKind && n.attachedTo === p.id);
    if (npc) {
      // 神明附身 5 回合結束後，消失 10 回合才會再出現在棋盤裡
      npc.attachedTo = null;
      npc.respawnIn = 10;
      npc.from = p.pos;
      npc.moveN = (npc.moveN || 0) + 1;
    }
    if (!silent) {
      log(G, `${GODS[oldKind].icon} ${GODS[oldKind].name} 離開了 ${p.name}（暫離棋盤 10 回合）`);
      pushNews(G, '神明離去', `${GODS[oldKind].icon} ${GODS[oldKind].name} 結束附身，暫時隱遁 10 回合後再重返棋盤！`, '神明動向', '#95a5a6');
    }
  }
  function attachGod(G, p, kind, reason = '神明附身') {
    const gInfo = GODS[kind];
    if (!gInfo || !gInfo.turns) return;
    // 若其他玩家身上正附著同一位神明，先解除該玩家的附身
    G.players.forEach(q => {
      if (q !== p && q.god && q.god.kind === kind) releaseGod(G, q, true);
    });
    if (p.god) releaseGod(G, p, true);
    const npc = (G.npcs || []).find(n => n.kind === kind);
    if (npc) { npc.attachedTo = p.id; npc.respawnIn = 0; npc.pos = p.pos; }
    p.god = { kind, turns: gInfo.turns, fresh: G.cur === p.id && G.phase !== 'roll' };
    G.fxSeq = (G.fxSeq || 0) + 1;
    G.godFx = { p: p.id, at: p.pos, kind, n: G.fxSeq };
    G.fx = { k: gInfo.good ? 'god_good' : 'god_bad', p: p.id, god: kind };
    log(G, `${gInfo.icon} ${reason}！${gInfo.name} 附身在 ${p.name} 身上（${gInfo.turns} 回合）`);
    pushNews(G, gInfo.good ? '神明附身' : '噩耗警報', `${gInfo.icon} ${p.name} 被「${gInfo.name}」附身（${gInfo.turns} 回合）！`, gInfo.desc, gInfo.color);
  }

  function goJail(G, p, why = '違規入獄') {
    const from = p.pos, ji = idx('監獄');
    if (ji >= 0) p.pos = ji;
    p.jail = JAIL_TURNS;
    if (ji >= 0 && ji !== from) {
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.transportFx = { n: G.moveSeq, p: p.id, from, to: ji, kind: 'jail' };
    }
    log(G, `🚨 ${p.name} ${why}，進監獄（${JAIL_TURNS} 回合）`);
    G.fx = { k: 'jail', p: p.id };
    pushNews(G, '社會新聞', `🚨 ${p.name} ${why}，已移送監獄拘留 ${JAIL_TURNS} 回合！`, '突發治安', '#e74c3c');
  }
  function goHospital(G, p, why = '送醫治療') {
    const from = p.pos, hi = idx('醫院');
    if (hi >= 0) p.pos = hi;
    p.skip = 1;
    if (hi >= 0 && hi !== from) {
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.hospital = { p: p.id, from, to: hi, n: G.moveSeq };
    }
    log(G, `🏥 ${p.name} ${why}`);
    G.fx = { k: 'jail', p: p.id };
    pushNews(G, '醫療快訊', `🏥 ${p.name} ${why}！`, '突發意外', '#e67e22');
  }

  function encounterNpc(G, p, npc, approachFrom = null) {
    if (!npc || npc.attachedTo != null || p.bankrupt) return false;
    // 第 1 輪不會被神明附身（野狗照常咬人）
    if (npc.kind !== 'dog' && (G.round || 1) <= 1) return false;
    if (npc.kind === 'dog') {
      const biteAt = p.pos;
      pay(G, p, 800, null, '被野狗咬傷付醫藥費');
      npc.from = npc.pos;
      npc.pos = (npc.pos + 3) % N;
      npc.moveN = (npc.moveN || 0) + 1;
      if (!p.bankrupt) goHospital(G, p, '遭路邊野狗咬傷，送醫住院 1 回合');
      G.fxSeq = (G.fxSeq || 0) + 1;
      G.biteFx = { p: p.id, at: biteAt, npcId: npc.id, approachFrom, n: G.fxSeq };
      G.fx = { k: 'dog_bite', p: p.id, at: biteAt };
      return true;
    }
    // 身上已有神明附身時，不會被路過的其他神明覆蓋
    if (p.god) return false;
    attachGod(G, p, npc.kind, '路遇神明');
    return false;
  }

  // 現金不足：先賣最便宜的地（回收地價與建築一半），仍不足則破產
  function settle(G, p, creditor) {
    while (p.cash < 0) {
      const own = lands(G, p).sort((a, b) => valueOf(G, a) - valueOf(G, b));
      if (!own.length) break;
      const i = own[0], v = Math.round(valueOf(G, i) / 2);
      G.tiles[i].owner = null; G.tiles[i].level = 0; p.cash += v;
      log(G, `${p.name} 變賣 ${BOARD[i].name}，得 $${v}`);
      pushNews(G, '房產拋售', `⚠️ ${p.name} 資金周轉不靈，緊急變賣「${BOARD[i].name}」套現 $${v}！`, '財務危機', '#e67e22');
    }
    if (p.cash < 0) {
      p.bankrupt = true;
      G.fxSeq = (G.fxSeq || 0) + 1;
      G.bankruptFx = { p: p.id, at: p.pos, n: G.fxSeq };
      if (creditor) creditor.cash += Math.max(0, p.cash);
      if (p.god) releaseGod(G, p, true);
      log(G, `💥 ${p.name} 破產出局`);
      pushNews(G, '破產重磅', `💥 震撼消息！${p.name} 資金耗盡正式宣告破產出局！`, '淘汰快報', '#c0392b');
      G.blocks = G.blocks.filter(b => b.by !== p.id);
      p.cash = 0;
      checkEnd(G);
    }
  }
  function checkEnd(G) {
    const alive = G.players.filter(q => !q.bankrupt);
    if (alive.length <= 1) {
      G.winner = alive[0] ? alive[0].id : null;
      G.phase = 'over';
      const wName = alive[0] ? alive[0].name : '無人';
      log(G, `🏆 ${wName} 獲勝`);
      pushNews(G, '總冠軍誕生', `🏆 ${wName} 稱霸台灣，成為最後的大富豪贏家！`, '終局快訊', '#f1c40f');
      return true;
    }
    return false;
  }

  // ----- 移動（支援交接處分岔選路）-----
  function stepToNode(G, p, nextIdx, dirSign, path, isLastStep) {
    p.pos = nextIdx; path.push(p.pos);
    if (p.pos === 0 && dirSign > 0) {
      p.cash += START_BONUS;
      log(G, `${p.name} 經過起點，領 $${START_BONUS}`);
    }
    const b = G.blocks.findIndex(x => x.i === p.pos);
    if (b >= 0 && !isLastStep) {
      G.blocks.splice(b, 1);
      log(G, `🚧 ${p.name} 在 ${BOARD[p.pos].name} 被路障擋住`);
      pushNews(G, '路況突發', `🚧 ${p.name} 在「${BOARD[p.pos].name}」撞上路障被迫停下！`, '路障攔截', '#e67e22');
      return 'blocked';
    }
    if (b >= 0) G.blocks.splice(b, 1);
    return null;
  }

  function walkContinue(G, p, rem, dir, abs, path, fromPos, forceNext = null) {
    let interrupted = false, pausedBranch = false, bite = null;
    let remaining = rem;
    const dirSign = dir >= 0 ? 1 : -1;
    while (remaining > 0) {
      let nextIdx = forceNext;
      forceNext = null;
      if (nextIdx == null) {
        const choices = dirSign > 0 ? BOARD[p.pos].next : BOARD[p.pos].prev;
        if (choices.length > 1) {
          G.pendingWalk = { p: p.id, rem: remaining, dir, abs };
          G.ask = {
            k: 'branch', i: p.pos, dir: dirSign, rem: remaining,
            options: choices.map(to => ({
              to, name: BOARD[to].name,
              tag: BOARD[to].branch || (BOARD[to].group ? GROUPS[BOARD[to].group].name : '環島主線'),
            })),
          };
          pausedBranch = true;
          break;
        }
        nextIdx = choices[0];
      }
      remaining--;
      const res = stepToNode(G, p, nextIdx, dirSign, path, remaining === 0);
      if (res === 'blocked') break;
      if (res && res.bite) { bite = res.bite; interrupted = true; break; }
    }
    if (path.length > 0 || bite) {
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.move = { p: p.id, path, n: G.moveSeq, from: fromPos, bite };
    }
    return pausedBranch ? 'branch' : interrupted;
  }

  function walk(G, p, steps, abs = false) {
    const dir = (abs ? 1 : (p.reverse ? -1 : 1)) * (steps < 0 ? -1 : 1);
    return walkContinue(G, p, Math.abs(steps), dir, abs, [], p.pos, null);
  }
  function shortestPath(from, to) {
    if (from === to) return [];
    const q = [[from]], vis = new Set([from]);
    while (q.length) {
      const curPath = q.shift(), u = curPath[curPath.length - 1];
      for (const v of BOARD[u].next) {
        if (vis.has(v)) continue;
        const np = [...curPath, v];
        if (v === to) return np.slice(1);
        vis.add(v); q.push(np);
      }
    }
    return [];
  }
  function moveTo(G, p, targetIdx, vehicle = null) {
    const from = p.pos;
    if (vehicle) {
      if (targetIdx === 0 && from !== 0) {
        gain(G, p, START_BONUS);
        log(G, `${p.name} 抵達起點領取環島補助 $${START_BONUS}`);
      }
      p.pos = targetIdx;
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.transportFx = { n: G.moveSeq, p: p.id, from, to: targetIdx, kind: vehicle };
      if (!p.bankrupt) arrive(G, p);
      return;
    }
    const sp = shortestPath(from, targetIdx), path = [];
    let interrupted = false, bite = null;
    for (let k = 0; k < sp.length; k++) {
      const res = stepToNode(G, p, sp[k], 1, path, k === sp.length - 1);
      if (res === 'blocked') break;
      if (res && res.bite) { bite = res.bite; interrupted = true; break; }
    }
    if (path.length > 0 || bite) {
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.move = { p: p.id, path, n: G.moveSeq, from, bite };
    }
    if (!interrupted && !p.bankrupt) arrive(G, p);
  }
  function moveBy(G, p, n) {
    const from = p.pos, path = [], dirSign = n >= 0 ? 1 : -1;
    let interrupted = false, bite = null;
    for (let k = 0; k < Math.abs(n); k++) {
      const choices = dirSign > 0 ? BOARD[p.pos].next : BOARD[p.pos].prev;
      const res = stepToNode(G, p, choices[0], dirSign, path, k === Math.abs(n) - 1);
      if (res === 'blocked') break;
      if (res && res.bite) { bite = res.bite; interrupted = true; break; }
    }
    if (path.length > 0 || bite) {
      G.moveSeq = (G.moveSeq || 0) + 1;
      G.move = { p: p.id, path, n: G.moveSeq, from, bite };
    }
    if (!interrupted && !p.bankrupt) arrive(G, p);
  }

  // ----- 抵達格子 -----
  function arrive(G, p) {
    // 正正走到同一格才會觸發神明附身或野狗攻擊（未消失冷卻中的 NPC）
    const hitNpc = (G.npcs || []).find(n => n.attachedTo == null && !(n.respawnIn > 0) && n.pos === p.pos);
    if (hitNpc) {
      const bit = encounterNpc(G, p, hitNpc);
      if (bit) {
        G.biteFx = { p: p.id, at: p.pos, npcId: hitNpc.id, approachFrom: null, n: (G.fxSeq || 0) + 1 };
        return;
      }
    }
    const i = p.pos, t = BOARD[i], s = G.tiles[i];
    if (t.type === 'land' || t.type === 'station') {
      if (s.owner == null) {
        const cost = buyPriceOf(G, p, i);
        if (p.cash >= cost) G.ask = { k: 'buy', i, cost, buildCost: buildCostOf(G, p, i) };
        return;
      }
      if (s.owner === p.id) {
        if (s.level < MAX_LEVEL) {
          const cost = buildCostOf(G, p, i);
          if (p.god && p.god.kind === 'fushen') {
            s.level++;
            log(G, `🍀 福神顯靈！${p.name} 的 ${t.name} 免費升級為${LEVEL_NAME[s.level]}`);
            G.fx = { k: 'build', i, lv: s.level };
            pushNews(G, s.level === MAX_LEVEL ? '摩天大樓落成' : '福神庇佑', `🍀 福神顯靈！${p.name} 的「${t.name}」免費加蓋成【${LEVEL_NAME[s.level]}】！`, s.level === MAX_LEVEL ? '地產巔峰' : '免費建設', '#2ecc71');
            triggerTileItemEvent(G, p, i, `福神加蓋「${t.name}」`);
            if (s.level < MAX_LEVEL && p.cash >= cost) G.ask = { k: 'build', i, cost };
            return;
          }
          if (p.cash >= cost) {
            G.ask = { k: 'build', i, cost };
          } else {
            log(G, `${p.name} 回到自家「${t.name}」，目前資金不足蓋樓（需 $${cost}）`);
            triggerTileItemEvent(G, p, i, `巡視自家「${t.name}」`);
          }
        } else {
          log(G, `🏙️ ${p.name} 巡視自家的「${t.name}」摩天大樓！`);
          triggerTileItemEvent(G, p, i, `巡視自家「${t.name}」`);
        }
        return;
      }
      const owner = G.players.find(q => q.id === s.owner);
      // 土地公附身：直接免費強佔他人土地！
      if (p.god && p.god.kind === 'tudigong') {
        const prevName = owner ? owner.name : '原主';
        s.owner = p.id;
        G.fx = { k: 'seize', i, p: p.id, from: owner ? owner.id : null };
        const lvTxt = s.level ? `（含${LEVEL_NAME[s.level]}）` : '';
        log(G, `👴 土地公強佔！${p.name} 免費奪取了 ${prevName} 的 ${t.name}${lvTxt}`);
        pushNews(G, '土地公強佔', `👴 驚天大事件！${p.name} 憑藉土地公神力，直接強佔 ${prevName} 的「${t.name}」${lvTxt}！`, '神明霸佔', '#f1c40f');
        return;
      }
      if (owner && owner.jail > 0) { log(G, `${owner.name} 在監獄中，免收過路費`); return; }
      if (p.god && p.god.kind === 'caishen') {
        log(G, `💰 財神爺保佑，${p.name} 在 ${t.name} 免付過路費`);
        pushNews(G, '財神護體', `💰 財神爺發威！${p.name} 路過 ${owner.name} 的「${t.name}」免付過路費！`, '免租神蹟', '#e74c3c');
        return;
      }
      const fi = p.items.indexOf('free');
      if (fi >= 0) {
        p.items.splice(fi, 1);
        log(G, `🛡️ ${p.name} 使用免租卡，免付 ${t.name} 過路費`);
        pushNews(G, '免租護身', `🛡️ ${p.name} 出示免租卡，閃過 ${owner.name} 的「${t.name}」過路費！`, '道具發動', '#3498db');
        return;
      }
      let rent = rentOf(G, i);
      if (p.god && p.god.kind === 'qiongshen') rent *= 2;
      pay(G, p, rent, owner, `在 ${t.name} 的過路費`);
      G.fx = { k: 'rent', p: p.id, to: owner.id };
      if (rent >= 1000) {
        pushNews(G, '天價過路費', `💸 ${p.name} 踩到 ${owner.name} 的「${t.name}」，慘付過路費 $${rent}！`, '地產風雲', '#e67e22');
      }
      return;
    }
    if (t.type === 'chance' || t.type === 'fate') {
      const deck = t.type === 'chance' ? CHANCE : FATE, c = Math.floor(rnd(G) * deck.length);
      G.cardSeq = (G.cardSeq || 0) + 1;
      G.card = { kind: t.type, i: c, text: deck[c].t, n: G.cardSeq };
      G.ask = { k: 'card', i, kind: t.type, c, text: deck[c].t };
      log(G, `${p.name} 抽到${t.name}：${deck[c].t}`);
      return;
    }
    if (t.type === 'shop') {
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      G.ask = { k: 'shop', i, bought: [] };
      return;
    }
    if (t.type === 'cardshop') {
      const freeItem = giveItem(G, p, null, '逛卡片商店獲贈卡片');
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      G.ask = { k: 'cardshop', i, freeItem, bought: [] };
      return;
    }
    if (t.type === 'autoshow') {
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      G.ask = { k: 'autoshow', i, bought: [] };
      return;
    }
    if (t.type === 'stock') {
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      G.ask = { k: 'stock', i };
      return;
    }
    if (t.type === 'minigame') {
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      G.ask = { k: 'minigame', i };
      return;
    }
    if (t.type === 'casino') {
      if (p.cash < 500) {
        log(G, `🎰 ${p.name} 抵達海峽賭場，可惜現金不足 $500 只好在甲板觀望`);
        return;
      }
      G.ask = { k: 'casino', i, bets: [500, 1500, 3000] };
      return;
    }
    if (t.type === 'temple') {
      if (p.god && !p.god.good) {
        const badName = GODS[p.god.kind].name;
        releaseGod(G, p, true);
        log(G, `⛩️ ${p.name} 在 ${t.name} 參拜，驅散了「${badName}」`);
        pushNews(G, '宮廟淨化', `⛩️ ${p.name} 前往「${t.name}」虔誠參拜，成功送走厄運「${badName}」！`, '台灣廟宇', '#f1c40f');
      } else if (!p.god) {
        // 不再於廟宇隨機降臨神明，改為求得平安紅包
        gain(G, p, 800);
        log(G, `⛩️ ${p.name} 在 ${t.name} 參拜，求得平安紅包 $800`);
      } else {
        const card = rnd(G) < 0.5 ? 'summon_god' : 'dismiss_god';
        giveItem(G, p, card, `${t.name} 祈福獲贈`);
      }
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      return;
    }
    if (t.type === 'tax') {
      const amt = Math.max(600, Math.round(p.cash * 0.1));
      pay(G, p, amt, null, '繳納所得稅');
      pushNews(G, '國稅申報', `🏛️ ${p.name} 在「${t.name}」繳納稅金 $${amt}。`, '稅務消息', '#95a5a6');
      return;
    }
    if (t.type === 'gojail') { goJail(G, p, '踩到入獄格'); return; }
    if (t.type === 'hospital') { log(G, `🏥 ${p.name} 經過醫院探病`); return; }
    if (t.type === 'park') {
      log(G, `🌲 ${p.name} 在國家公園休息賞景`);
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
      return;
    }
    if (t.type === 'start') {
      triggerTileItemEvent(G, p, i, `巡訪「${t.name}」`);
    }
  }

  // ----- 新遊戲 -----
  const CHARS = [
    { name: '阿凱', color: '#e05252', hat: 'cap', desc: '台灣黑熊帽・活力冒險家' },
    { name: '小晴', color: '#3f8ee8', hat: 'bow', desc: '蝴蝶結貝雷帽・珍奶愛好者' },
    { name: '老陳', color: '#4fb35d', hat: 'hat', desc: '紳士高禮帽・地產大老闆' },
    { name: '安娜', color: '#e3a13a', hat: 'crown', desc: '金色鳳冠・環島女皇' },
  ];
  function newGame(seats, opt = {}) {
    // seats: [{ name, kind: 'local'|'ai'|'remote', owner, char }]
    const maxRounds = opt.maxRounds === 0 ? 0 : Math.max(1, opt.maxRounds || 30);
    const G = {
      v: 2,
      seed: (opt.seed || Date.now()) >>> 0,
      turn: 1,
      round: 1,
      maxRounds,
      cur: 0,
      phase: 'roll',
      winner: null,
      ask: null,
      card: null,
      cardSeq: 0,
      move: null,
      moveSeq: 0,
      fx: null,
      fxSeq: 0,
      itemEvent: null,
      dice: null,
      newsSeq: 1,
      news: [{ id: 1, cat: '開局快訊', title: `🎲 環島富豪 3D 正式開賽！共 ${seats.length} 位玩家角逐台灣地產王！`, body: '78 格全台灣多路線地圖（含北橫／中橫／南橫與海峽賭場）全面啟動！', color: '#f1c40f', round: 1 }],
      tiles: BOARD.map(() => ({ owner: null, level: 0 })),
      blocks: [],
      npcs: GOD_NPC_INIT.map((n, id) => ({ id, kind: n.kind, pos: n.pos, from: n.pos, attachedTo: null, respawnIn: 0, moveN: 0 })),
      log: [`遊戲開始！每人起始資金 $${START_CASH}（${maxRounds ? `上限 ${maxRounds} 輪` : '無限回合'}）`],
      players: seats.map((s, k) => {
        const ch = s.char != null ? ((s.char | 0) % CHARS.length + CHARS.length) % CHARS.length : k % CHARS.length;
        const customName = String(s.name || '').trim().slice(0, 10);
        return {
          id: k,
          name: customName || CHARS[ch].name,
          char: ch,
          color: CHARS[k % CHARS.length].color,
          kind: s.kind,
          owner: s.owner || null,
          cash: START_CASH,
          pos: 0,
          dice: 1,
          jail: 0,
          skip: 0,
          items: ['remote'],
          specialties: [],
          equipped: {},
          outfits: [],
          equippedOutfit: null,
          cars: [],
          equippedCar: null,
          god: null,
          reverse: false,
          remote: 0,
          bankrupt: false,
        };
      }),
    };
    // 神明棋子開局各自停在隨機位置（不與其他棋子重疊、不在起點）
    for (const npc of G.npcs) { npc.pos = npc.from = randomBoardTile(G, npc); }
    return G;
  }

  // ----- 動作（由房主或本機套用）。回傳錯誤字串或 null -----
  function act(G, pid, a) {
    if (G.phase === 'over') return '遊戲已結束';
    // 允許隨時調整回合數與更改名稱
    if (a.type === 'setRounds') {
      const raw = Number(a.maxRounds);
      if (isNaN(raw)) return '回合數無效';
      const val = raw <= 0 ? 0 : Math.max(G.round, Math.min(999, Math.round(raw)));
      G.maxRounds = val;
      const txt = val === 0 ? '無限回合（直到只剩一人）' : `${val} 輪`;
      log(G, `⚙️ 賽制調整：遊戲回合上限改為 ${txt}`);
      pushNews(G, '賽制變更', `⚙️ 回合上限已調整為「${txt}」！`, '比賽規則更新', '#3498db');
      return null;
    }
    if (a.type === 'setKind') {
      const targetId = a.pid != null ? (a.pid | 0) : pid;
      const tp = G.players[targetId];
      if (!tp || tp.bankrupt) return '找不到玩家';
      if (tp.kind === 'remote') return '遠端玩家無法切換控制模式';
      const nk = a.kind === 'ai' ? 'ai' : 'local';
      if (tp.kind !== nk) {
        tp.kind = nk;
        log(G, `🎛️ ${tp.name} 已切換為「${nk === 'ai' ? '電腦 AI' : '手動操作'}」`);
        return null;
      }
      return null;
    }
    if (a.type === 'equipSpecialty') {
      const targetId = a.pid != null ? (a.pid | 0) : pid;
      const tp = G.players[targetId];
      if (!tp || tp.bankrupt) return '找不到玩家';
      const k = a.specialty;
      const sp = SPECIALTIES[k];
      if (!sp) return '沒有這個特產道具';
      if (!tp.specialties) tp.specialties = [];
      if (!tp.equipped) tp.equipped = {};
      if (!tp.specialties.includes(k)) return '尚未獲得此特產道具';
      if (a.unequip || tp.equipped[sp.slot] === k) {
        delete tp.equipped[sp.slot];
        log(G, `🎀 ${tp.name} 卸下了棋子裝飾「${sp.name}」`);
      } else {
        tp.equipped[sp.slot] = k;
        log(G, `✨ ${tp.name} 為棋子裝備了地方特產「${sp.icon} ${sp.name}」`);
      }
      return null;
    }
    if (a.type === 'equipOutfit') {
      const targetId = a.pid != null ? (a.pid | 0) : pid;
      const tp = G.players[targetId];
      if (!tp || tp.bankrupt) return '找不到玩家';
      const k = a.outfit;
      const of = OUTFITS[k];
      if (!of) return '沒有這個造型服飾';
      if (!tp.outfits || !tp.outfits.includes(k)) return '尚未購買此造型';
      if (a.unequip || tp.equippedOutfit === k) {
        tp.equippedOutfit = null;
        log(G, `👕 ${tp.name} 換回原本服裝`);
      } else {
        tp.equippedOutfit = k;
        log(G, `✨ ${tp.name} 換上了造型「${of.icon} ${of.name}」`);
      }
      return null;
    }
    if (a.type === 'equipCar') {
      const targetId = a.pid != null ? (a.pid | 0) : pid;
      const tp = G.players[targetId];
      if (!tp || tp.bankrupt) return '找不到玩家';
      const k = a.car;
      const car = CARS[k];
      if (!car) return '沒有這款座駕';
      if (!tp.cars || !tp.cars.includes(k)) return '尚未購買此座駕';
      if (a.unequip || tp.equippedCar === k) {
        tp.equippedCar = null;
        log(G, `🚶 ${tp.name} 收起座駕改為步行`);
      } else {
        tp.equippedCar = k;
        log(G, `🚗 ${tp.name} 駕駛座駕「${car.icon} ${car.name}」上路！`);
      }
      return null;
    }
    if (a.type === 'rename') {
      const targetId = a.pid != null ? (a.pid | 0) : pid;
      const tp = G.players[targetId];
      if (!tp) return '找不到玩家';
      const newName = String(a.name || '').trim().slice(0, 10);
      if (!newName) return '名字不能空白';
      const oldName = tp.name;
      tp.name = newName;
      log(G, `✏️ ${oldName} 更名為「${newName}」`);
      pushNews(G, '玩家動態', `✏️ ${oldName} 正式更名為「${newName}」！`, '更名公告', tp.color);
      return null;
    }

    const p = cur(G);
    if (p.id !== pid) return '還沒輪到你';
    switch (a.type) {
      case 'roll': {
        if (G.phase !== 'roll' || G.ask) return '現在不能擲骰';
        G.card = null; G.fx = null; G.move = null;
        const twoDice = (p.dice || 1) >= 2;
        const d1 = p.remote
          ? (twoDice ? Math.max(1, Math.min(6, Math.floor(p.remote / 2))) : Math.max(1, Math.min(6, p.remote)))
          : roll(G);
        const d2 = twoDice ? (p.remote ? Math.max(1, Math.min(6, p.remote - d1)) : roll(G)) : 0;
        p.remote = 0;
        const sum = d1 + d2;
        G.dice = { a: d1, b: d2, count: twoDice ? 2 : 1, n: (G.dice ? G.dice.n : 0) + 1 };
        log(G, twoDice ? `${p.name} 擲出 ${d1} + ${d2} = ${sum}` : `${p.name} 擲出 ${d1} 點`);
        const walkRes = walk(G, p, sum);
        if (!walkRes && !p.bankrupt) arrive(G, p);
        G.phase = G.ask ? 'ask' : 'done';
        if (G.winner != null) G.phase = 'over';
        return null;
      }
      case 'buyOutfit': {
        if (!G.ask || G.ask.k !== 'shop') return '目前不在造型服飾店';
        const of = OUTFITS[a.outfit];
        if (!of) return '沒有這個造型服飾';
        if (!p.outfits) p.outfits = [];
        if (p.outfits.includes(a.outfit)) return '你已經擁有這套造型了';
        if (p.cash < of.price) return '現金不足';
        p.cash -= of.price;
        p.outfits.push(a.outfit);
        p.equippedOutfit = a.outfit;
        G.ask.bought = G.ask.bought || [];
        G.ask.bought.push(a.outfit);
        log(G, `👗 ${p.name} 在服飾店花了 $${of.price} 購入並換上「${of.icon} ${of.name}」！`);
        pushNews(G, '時尚快訊', `👗 ${p.name} 購入超炫造型「${of.icon} ${of.name}」，閃亮登場！`, '服飾造型', '#ec4899');
        return null;
      }
      case 'buyCar': {
        if (!G.ask || G.ask.k !== 'autoshow') return '目前不在汽車展示中心';
        const car = CARS[a.car];
        if (!car) return '沒有這款車輛';
        if (!p.cars) p.cars = [];
        if (p.cars.includes(a.car)) return '你已經擁有這台車了';
        if (p.cash < car.price) return '現金不足';
        p.cash -= car.price;
        p.cars.push(a.car);
        p.equippedCar = a.car;
        G.ask.bought = G.ask.bought || [];
        G.ask.bought.push(a.car);
        log(G, `🚗 ${p.name} 在汽車展示中心花了 $${car.price} 購入「${car.icon} ${car.name}」並立即上車！`);
        pushNews(G, '名車入手', `🚗 ${p.name} 豪氣購入「${car.icon} ${car.name}」，正式成為有車一族！`, '汽車展中心', '#38bdf8');
        return null;
      }
      case 'buyItem': {
        if (!G.ask || (G.ask.k !== 'shop' && G.ask.k !== 'cardshop')) return '目前不在商店';
        if (a.item === 'specialty_box') {
          const boxPrice = 500;
          if (p.cash < boxPrice) return '現金不足';
          const unowned = SPECIALTY_KEYS.filter(k => !(p.specialties || []).includes(k));
          if (!unowned.length) return `已集滿全部 ${SPECIALTY_KEYS.length} 種台灣地方特產！`;
          p.cash -= boxPrice;
          const picked = unowned[Math.floor(rnd(G) * unowned.length)];
          giveSpecialty(G, p, picked, '在商店開啟台灣特產盲盒');
          G.ask.bought = G.ask.bought || [];
          G.ask.bought.push('specialty_box');
          return null;
        }
        const item = ITEMS[a.item];
        if (!item) return '沒有這個道具';
        if (a.item === 'add_die') {
          if ((p.dice || 1) >= 2) return '你已經擁有 2 顆骰子了';
          if (p.cash < item.price) return '現金不足';
          p.cash -= item.price;
          p.dice = 2;
          G.ask.bought = G.ask.bought || [];
          G.ask.bought.push('add_die');
          log(G, `🎲 ${p.name} 在道具屋花了 $${item.price} 加購第 2 顆骰子，升級為雙骰子！`);
          pushNews(G, '雙骰升級', `🎲 ${p.name} 在道具屋購入第 2 顆骰子，正式升級雙骰高速衝刺！`, '裝備升級', '#f1c40f');
          return null;
        }
        if (p.items.length >= MAX_ITEMS) return `道具欄已滿（最多 ${MAX_ITEMS} 張）`;
        if (p.cash < item.price) return '現金不足';
        p.cash -= item.price;
        p.items.push(a.item);
        G.ask.bought = G.ask.bought || [];
        G.ask.bought.push(a.item);
        log(G, `🏪 ${p.name} 在道具屋花了 $${item.price} 購買「${item.name}」`);
        pushNews(G, '道具採購', `🏪 ${p.name} 在道具屋購入「${item.icon} ${item.name}」！`, '商店快訊', '#9b59b6');
        return null;
      }
      case 'answer': {
        if (!G.ask) return '沒有待回答的問題';
        const q = G.ask; G.ask = null;
        if (q.k === 'branch') {
          const pw = G.pendingWalk;
          G.pendingWalk = null;
          const valid = q.options.some(o => o.to === Number(a.to)) ? Number(a.to) : q.options[0].to;
          log(G, `🧭 ${p.name} 在「${BOARD[q.i].name}」選擇前往【${BOARD[valid].name}】`);
          if (pw && pw.p === p.id) {
            const walkRes = walkContinue(G, p, pw.rem, pw.dir, pw.abs, [], p.pos, valid);
            if (!walkRes && !p.bankrupt) arrive(G, p);
          }
          G.phase = G.ask ? 'ask' : 'done';
          if (G.winner != null) G.phase = 'over';
          return null;
        }
        if (q.k === 'card') {
          G.move = null;
          const deck = q.kind === 'chance' ? CHANCE : FATE;
          deck[q.c].f(G, p);
          G.phase = G.ask ? 'ask' : 'done';
          if (G.winner != null) G.phase = 'over';
          return null;
        }
        if (q.k === 'shop' || q.k === 'cardshop' || q.k === 'autoshow') {
          G.phase = 'done';
          return null;
        }
        if (q.k === 'stock') {
          if (!a.yes) {
            log(G, `📈 ${p.name} 在台灣股市觀望後收手離場`);
            G.phase = 'done';
            return null;
          }
          const invest = [800, 1500, 2500].includes(Number(a.bet)) ? Number(a.bet) : 800;
          if (p.cash < invest) { G.phase = 'done'; return null; }
          const r = rnd(G);
          if (r < 0.48) {
            const profit = Math.round(invest * (0.6 + rnd(G) * 0.9));
            gain(G, p, profit);
            log(G, `📈 ${p.name} 投資台股大漲！投入 $${invest} 淨賺 $${profit}！`);
            pushNews(G, '台股紅盤', `📈 ${p.name} 精準進場台灣股市，單日獲利 $${profit}！`, '財經快訊', '#ef4444');
            G.fx = { k: 'casino_win', i: q.i, amt: profit };
          } else if (r < 0.85) {
            const loss = Math.round(invest * 0.5);
            pay(G, p, loss, null, '股市震盪停損');
            log(G, `📉 ${p.name} 遭遇台股震盪，小賠 $${loss}`);
            G.fx = { k: 'casino_lose', i: q.i, amt: loss };
          } else {
            const bonus = invest * 2;
            gain(G, p, bonus);
            log(G, `🚀 ${p.name} 押中漲停飆股！暴賺 $${bonus}！`);
            pushNews(G, '飆股漲停', `🚀 狂賀！${p.name} 押中護國神山漲停板，一口氣狂賺 $${bonus}！`, '股市奇蹟', '#f59e0b');
            G.fx = { k: 'casino_win', i: q.i, amt: bonus };
          }
          G.phase = G.winner != null ? 'over' : 'done';
          return null;
        }
        if (q.k === 'minigame') {
          if (!a.yes) {
            log(G, `🎮 ${p.name} 逛過夜市攤位沒有參加小遊戲`);
            G.phase = 'done';
            return null;
          }
          const rollVal = roll(G);
          if (rollVal >= 4) {
            const prize = rollVal * 350;
            gain(G, p, prize);
            log(G, `🎯 ${p.name} 在夜市小遊戲大顯身手（${rollVal} 點），贏得獎金 $${prize}！`);
            pushNews(G, '夜市神射手', `🎯 ${p.name} 在夜市小遊戲連中紅心，抱回獎金 $${prize}！`, '娛樂快報', '#22c55e');
            G.fx = { k: 'casino_win', i: q.i, amt: prize };
          } else {
            const fee = 300;
            pay(G, p, Math.min(p.cash, fee), null, '參加夜市小遊戲');
            giveItem(G, p, null, '夜市小遊戲安慰獎');
            G.fx = { k: 'turn', i: q.i };
          }
          G.phase = G.winner != null ? 'over' : 'done';
          return null;
        }
        if (q.k === 'casino') {
          if (!a.yes) {
            log(G, `🎰 ${p.name} 在海峽賭場冷靜收手離開`);
            G.phase = 'done';
            return null;
          }
          const validBets = [500, 1500, 3000];
          const rawBet = validBets.includes(Number(a.bet)) ? Number(a.bet) : 500;
          const bet = Math.min(rawBet, p.cash >= 500 ? (p.cash >= rawBet ? rawBet : 500) : 0);
          if (bet < 500) { G.phase = 'done'; return null; }
          const d1 = roll(G), d2 = roll(G), sum = d1 + d2;
          if (d1 === d2) {
            const winAmt = bet * 2;
            gain(G, p, winAmt);
            log(G, `🎰 ${p.name} 在海峽賭場下注 $${bet} 擲出雙骰豹子【${d1}・${d2}】，暴賺 $${winAmt}！`);
            pushNews(G, '賭場豹子大獎', `🎰 狂喜！${p.name} 在前往金門的海峽賭場擲出豹子【${d1}・${d2}】，抱走 $${winAmt} 獎金！`, '海峽賭場', '#f59e0b');
            G.fx = { k: 'casino_win', i: q.i, d1, d2, amt: winAmt };
          } else if (sum >= 8) {
            gain(G, p, bet);
            log(G, `🎰 ${p.name} 在海峽賭場下注 $${bet} 擲出 ${d1}+${d2}=${sum}（大），贏得 $${bet}！`);
            pushNews(G, '賭場開大', `🎰 ${p.name} 在海峽賭場手氣正旺，擲出 ${sum} 點贏得 $${bet}！`, '海峽賭場', '#2ecc71');
            G.fx = { k: 'casino_win', i: q.i, d1, d2, amt: bet };
          } else {
            pay(G, p, bet, null, '海峽賭場輸掉籌碼');
            log(G, `🎰 ${p.name} 在海峽賭場下注 $${bet} 擲出 ${d1}+${d2}=${sum}（小），輸掉 $${bet}`);
            pushNews(G, '賭場失利', `🎰 ${p.name} 在海峽賭場押注 $${bet} 卻擲出 ${sum} 點（小），黯然離場！`, '海峽賭場', '#e74c3c');
            G.fx = { k: 'casino_lose', i: q.i, d1, d2, amt: bet };
          }
          G.phase = G.winner != null ? 'over' : 'done';
          return null;
        }
        if (a.yes) {
          if (q.k === 'buy') {
            // 第一次走到地點只能購買空地（level = 0），後續再依序蓋房升級
            if (p.cash >= q.cost) {
              p.cash -= q.cost;
              G.tiles[q.i].owner = p.id;
              G.tiles[q.i].level = 0;
              log(G, `🚩 ${p.name} 以 $${q.cost} 買下 ${BOARD[q.i].name} 空地`);
              G.fx = { k: 'buy', i: q.i };
              if (groupOwned(G, q.i)) {
                const gName = GROUPS[BOARD[q.i].group].name;
                pushNews(G, '地產壟斷', `👑 ${p.name} 買下「${BOARD[q.i].name}」，成功獨佔整個【${gName}】過路費全面翻倍！`, '重大購地', p.color);
              } else if (BOARD[q.i].price >= 3500) {
                pushNews(G, '豪宅置產', `🏠 ${p.name} 斥資 $${q.cost} 買下「${BOARD[q.i].name}」！`, '地產成交', p.color);
              }
              triggerTileItemEvent(G, p, q.i, `購買「${BOARD[q.i].name}」`);
            }
          } else {
            const curLv = G.tiles[q.i].level || 0;
            if (curLv < MAX_LEVEL && p.cash >= q.cost) {
              p.cash -= q.cost;
              G.tiles[q.i].level = curLv + 1;
              const lv = G.tiles[q.i].level;
              log(G, `🏗️ ${p.name} 把 ${BOARD[q.i].name} 蓋成【${LEVEL_NAME[lv]}】（$${q.cost}）`);
              G.fx = { k: 'build', i: q.i, lv };
              if (lv === 3) {
                pushNews(G, '摩天大樓落成', `🏙️ 震撼地標！${p.name} 將「${BOARD[q.i].name}」蓋成【摩天大樓】！過路費暴漲至 $${rentOf(G, q.i)}！`, '地產里程碑', p.color);
              } else if (lv === 4) {
                pushNews(G, '五星飯店開幕', `🏨 奢華新地標！${p.name} 將「${BOARD[q.i].name}」升級為【五星飯店】！`, '飯店開幕', p.color);
              } else if (lv === MAX_LEVEL) {
                pushNews(G, '連鎖旗艦總部', `🏢 王者誕生！${p.name} 將「${BOARD[q.i].name}」擴建為最高級【連鎖旗艦店】！過路費高達 $${rentOf(G, q.i)}！`, '地產巔峰', p.color);
              }
              triggerTileItemEvent(G, p, q.i, `建設「${BOARD[q.i].name}」`);
            }
          }
        }
        G.phase = 'done';
        return null;
      }
      case 'item': {
        if (G.phase !== 'roll' && G.phase !== 'done') return '現在不能使用道具';
        const k = p.items.indexOf(a.item);
        if (k < 0) return '沒有這個道具';
        if (a.item === 'remote') {
          if (G.phase !== 'roll') return '遙控骰子請在擲骰前使用';
          const two = (p.dice || 1) >= 2;
          const n = Math.max(two ? 2 : 1, Math.min(two ? 12 : 6, a.n | 0));
          p.remote = n;
          log(G, `🎯 ${p.name} 使用遙控骰子，點數設為 ${n}`);
        } else if (a.item === 'block') {
          const off = Math.max(1, Math.min(8, a.n | 0)), i = (p.pos + (p.reverse ? -off : off) + N) % N;
          G.blocks.push({ i, by: p.id });
          log(G, `🚧 ${p.name} 在 ${BOARD[i].name} 放了路障`);
          pushNews(G, '路況快報', `🚧 ${p.name} 在「${BOARD[i].name}」設置了路障，路過請小心！`, '路障警報', '#e67e22');
        } else if (a.item === 'reverse') {
          p.reverse = !p.reverse;
          log(G, `🔄 ${p.name} 改為${p.reverse ? '反方向' : '正方向'}前進`);
        } else if (a.item === 'demolish') {
          const i = a.i | 0, s = G.tiles[i];
          if (!s || s.owner == null || s.owner === p.id || !s.level) return '請選擇對手有建築的地';
          const victim = G.players[s.owner];
          s.level--;
          log(G, `💣 ${p.name} 拆除了 ${BOARD[i].name} 的一層建築`);
          G.fx = { k: 'demolish', i };
          pushNews(G, '爆破拆屋', `💣 ${p.name} 使用拆除卡，將 ${victim.name} 的「${BOARD[i].name}」降為${LEVEL_NAME[s.level]}！`, '道具攻擊', '#e74c3c');
        } else if (a.item === 'summon_god') {
          if ((G.round || 1) <= 1) return '第 1 輪不能請神，第 2 輪起才能使用請神卡';
          const godKey = GOOD_GOD_KEYS.includes(a.god) ? a.god : 'tudigong';
          attachGod(G, p, godKey, '使用請神卡');
        } else if (a.item === 'dismiss_god') {
          const target = a.target != null ? G.players[a.target | 0] : null;
          if (p.god && !p.god.good) {
            const badKind = p.god.kind;
            const badName = GODS[badKind].name;
            releaseGod(G, p, true);
            if (target && target !== p && !target.bankrupt) {
              attachGod(G, target, badKind, `${p.name} 使用送神卡轉嫁`);
            } else {
              log(G, `💨 ${p.name} 使用送神卡送走了「${badName}」`);
              pushNews(G, '送神除厄', `💨 ${p.name} 使用送神卡成功送走「${badName}」！`, '道具發動', '#2ecc71');
            }
          } else if (target && target !== p && !target.bankrupt && target.god) {
            const tGodName = GODS[target.god.kind].name;
            releaseGod(G, target, true);
            log(G, `💨 ${p.name} 使用送神卡驅散了 ${target.name} 身上的「${tGodName}」`);
            pushNews(G, '驅神大戰', `💨 ${p.name} 發動送神卡，將 ${target.name} 身上的「${tGodName}」強行送走！`, '道具交鋒', '#e67e22');
          } else {
            return '目前沒有可送走的神明（自己無壞神明且未指定有神明的對手）';
          }
        } else if (a.item === 'seize') {
          const i = a.i | 0, s = G.tiles[i];
          if (!s || s.owner == null || s.owner === p.id) return '請選擇對手擁有的土地';
          const cost = Math.round(valueOf(G, i) * 1.2);
          if (p.cash < cost) return `徵收此地需要 $${cost}，現金不足`;
          const victim = G.players[s.owner];
          p.cash -= cost;
          victim.cash += cost;
          s.owner = p.id;
          G.fx = { k: 'seize', i, p: p.id, from: victim.id };
          log(G, `📜 ${p.name} 以 $${cost} 強制徵收了 ${victim.name} 的 ${BOARD[i].name}`);
          pushNews(G, '強制徵收', `📜 ${p.name} 動用徵收卡，花費 $${cost} 強行收購 ${victim.name} 的「${BOARD[i].name}」！`, '土地併購', p.color);
        } else if (a.item === 'free') {
          return '免租卡會在付過路費時自動使用';
        }
        p.items.splice(k, 1);
        return null;
      }
      case 'end': {
        if (G.phase === 'ask') return '請先完成對話框選擇';
        if (G.phase === 'roll') return '請先擲骰';
        // 回合結束時遞減目前玩家的神明剩餘回合數
        if (p.god) {
          if (p.god.fresh) p.god.fresh = false;
          else {
            p.god.turns--;
            if (p.god.turns <= 0) releaseGod(G, p);
          }
        }
        nextTurn(G);
        return null;
      }
    }
    return '未知動作';
  }

  function stepNpcs(G) {
    if (!G.npcs) return;
    // 神明與野狗皆固定駐點不遊蕩；神明附身結束消失 10 回合後才重現棋盤
    for (const npc of G.npcs) {
      if (npc.attachedTo != null) continue;
      if (npc.respawnIn > 0) {
        npc.respawnIn--;
        if (npc.respawnIn === 0) {
          npc.pos = randomBoardTile(G, npc);
          npc.from = npc.pos;
          npc.moveN = (npc.moveN || 0) + 1;
          const gInfo = GODS[npc.kind];
          if (gInfo) log(G, `✨ ${gInfo.icon} ${gInfo.name} 重新降臨在「${BOARD[npc.pos].name}」！`);
        }
      }
    }
  }

  function applyStartOfTurnGod(G, p) {
    if (!p.god || p.bankrupt) return;
    const k = p.god.kind;
    if (k === 'caishen') {
      p.cash += 1500;
      log(G, `💰 財神爺送紅包！${p.name} 獲得 $1500`);
      pushNews(G, '財神發紅包', `💰 財神爺顯靈賜財，${p.name} 本回合額外獲得 $1500！`, '神明賜福', '#e74c3c');
    } else if (k === 'qiongshen') {
      pay(G, p, 1000, null, '窮神附身破財');
      pushNews(G, '窮神作祟', `💸 窮神纏身！${p.name} 回合開始就損失 $1000！`, '神明負面', '#7f8c8d');
    } else if (k === 'shuaishen') {
      if (p.items.length > 0 && rnd(G) < 0.6) {
        const dropIdx = Math.floor(rnd(G) * p.items.length);
        const lost = p.items.splice(dropIdx, 1)[0];
        log(G, `⚡ 衰神作祟！${p.name} 不慎遺失了道具「${ITEMS[lost].name}」`);
        pushNews(G, '衰神發威', `⚡ 衰神纏身！${p.name} 遺失了一張「${ITEMS[lost].name}」！`, '神明負面', '#8e44ad');
      } else {
        const built = lands(G, p).filter(i => G.tiles[i].level > 0);
        if (built.length) {
          const ti = built[Math.floor(rnd(G) * built.length)];
          G.tiles[ti].level--;
          G.fx = { k: 'demolish', i: ti };
          log(G, `⚡ 衰神作祟！${p.name} 的 ${BOARD[ti].name} 建築老舊倒塌一級`);
          pushNews(G, '衰神破壞', `⚡ 衰神發威！${p.name} 的「${BOARD[ti].name}」建築意外降級！`, '神明負面', '#8e44ad');
        }
      }
    }
  }

  function nextTurn(G) {
    G.card = null; G.ask = null;
    stepNpcs(G);
    if (G.winner != null) return;
    for (let guard = 0; guard < 32; guard++) {
      G.cur = (G.cur + 1) % G.players.length;
      if (G.cur === 0) {
        G.round++;
        if (G.maxRounds > 0 && G.round > G.maxRounds) return finishByWorth(G);
        if (G.round >= 20 && G.round % 20 === 0) {
          const top = G.players.filter(q => !q.bankrupt).sort((a, b) => netWorth(G, b) - netWorth(G, a))[0];
          if (top) log(G, `📊 第 ${G.round} 回合財富排行榜出爐！暫居首富：${top.name}（總資產 $${netWorth(G, top)}）`);
        }
      }
      const p = cur(G);
      if (p.bankrupt) continue;
      if (p.jail > 0) { p.jail--; log(G, `🔒 ${p.name} 在監獄中（剩 ${p.jail} 回合）`); continue; }
      if (p.skip > 0) { p.skip--; log(G, `🏥 ${p.name} 在醫院休養一回合`); continue; }
      applyStartOfTurnGod(G, p);
      if (G.winner != null) return;
      if (p.bankrupt) continue;
      break;
    }
    G.turn++; G.phase = 'roll';
  }
  function finishByWorth(G) {
    const alive = G.players.filter(q => !q.bankrupt).sort((a, b) => netWorth(G, b) - netWorth(G, a));
    G.winner = alive[0] ? alive[0].id : null; G.phase = 'over'; G.round = G.maxRounds;
    const wName = alive[0] ? alive[0].name : '無人';
    const wWorth = alive[0] ? netWorth(G, alive[0]) : 0;
    log(G, `🏆 回合結束，總資產最多的 ${wName} 獲勝（$${wWorth}）`);
    pushNews(G, '大局底定', `🏆 ${G.maxRounds} 輪結束！${wName} 以總資產 $${wWorth} 奪得台灣大富豪冠軍！`, '終局排行', '#f1c40f');
  }

  // ----- 電腦玩家：回傳下一個動作 -----
  function aiAction(G) {
    const p = cur(G);
    if (G.phase === 'ask') {
      const q = G.ask;
      if (q.k === 'branch') {
        let bestTo = q.options[0].to, bestScore = -1e9;
        for (const opt of q.options) {
          let sc = BOARD[opt.to].branch ? 140 : 100;
          let probe = opt.to;
          for (let d = 0; d < 3; d++) {
            const st = G.tiles[probe], bt = BOARD[probe];
            if (bt.type === 'land' || bt.type === 'station') {
              if (st.owner == null) sc += 250;
              else if (st.owner === p.id) sc += 120;
              else sc -= rentOf(G, probe) * 0.4;
            } else if (bt.type === 'casino') sc += 80;
            const dog = (G.npcs || []).find(x => x.kind === 'dog' && x.pos === probe);
            if (dog) sc -= 600;
            probe = bt.next[0];
          }
          if (sc > bestScore) { bestScore = sc; bestTo = opt.to; }
        }
        return { type: 'answer', to: bestTo };
      }
      if (q.k === 'card') return { type: 'answer', yes: true };
      if (q.k === 'shop') {
        const bought = (q.bought && q.bought.length) || 0;
        const unownedOf = OUTFIT_KEYS.filter(k => !(p.outfits || []).includes(k));
        if (bought === 0 && unownedOf.length && p.cash >= 3600) {
          const pick = unownedOf[Math.floor(rnd(G) * unownedOf.length)];
          if (p.cash >= OUTFITS[pick].price + 1600) return { type: 'buyOutfit', outfit: pick };
        }
        return { type: 'answer', yes: false };
      }
      if (q.k === 'cardshop') {
        const bought = (q.bought && q.bought.length) || 0;
        if (bought === 0 && (p.dice || 1) < 2 && p.cash >= 3800) return { type: 'buyItem', item: 'add_die' };
        if (bought === 0 && p.cash >= 2200 && (p.specialties || []).length < SPECIALTY_KEYS.length && !q.bought.includes('specialty_box')) {
          return { type: 'buyItem', item: 'specialty_box' };
        }
        if (bought <= 1 && p.cash >= 4000 && p.items.length < MAX_ITEMS) {
          if (!p.god && !p.items.includes('summon_god')) return { type: 'buyItem', item: 'summon_god' };
          if (p.god && !p.god.good && !p.items.includes('dismiss_god')) return { type: 'buyItem', item: 'dismiss_god' };
          if (!p.items.includes('remote')) return { type: 'buyItem', item: 'remote' };
        }
        return { type: 'answer', yes: false };
      }
      if (q.k === 'autoshow') {
        const bought = (q.bought && q.bought.length) || 0;
        if (bought === 0 && !p.equippedCar) {
          const affordable = CAR_KEYS.filter(k => !(p.cars || []).includes(k) && p.cash >= CARS[k].price + 2400);
          if (affordable.length) return { type: 'buyCar', car: affordable[affordable.length - 1] };
        }
        return { type: 'answer', yes: false };
      }
      if (q.k === 'stock') {
        if (p.cash >= 4500) return { type: 'answer', yes: true, bet: 1500 };
        if (p.cash >= 2200) return { type: 'answer', yes: true, bet: 800 };
        return { type: 'answer', yes: false };
      }
      if (q.k === 'minigame') {
        return { type: 'answer', yes: p.cash >= 600 };
      }
      if (q.k === 'casino') {
        if (p.cash >= 5000) return { type: 'answer', yes: true, bet: 1500 };
        if (p.cash >= 2500) return { type: 'answer', yes: true, bet: 500 };
        return { type: 'answer', yes: false };
      }
      const reserve = q.k === 'buy' ? (p.god && p.god.kind === 'tudigong' ? 600 : 1200) : 1800;
      return { type: 'answer', yes: p.cash - q.cost >= reserve };
    }
    if (G.phase === 'roll') {
      // 身上有壞神明且有送神卡 → 轉嫁給最有錢的對手
      if (p.god && !p.god.good && p.items.includes('dismiss_god')) {
        const opp = G.players.filter(q => q !== p && !q.bankrupt).sort((a, b) => netWorth(G, b) - netWorth(G, a))[0];
        if (opp) return { type: 'item', item: 'dismiss_god', target: opp.id };
      }
      // 沒有神明且有請神卡 → 請土地公或財神爺
      if (!p.god && p.items.includes('summon_god') && (G.round || 1) > 1 && rnd(G) < 0.75) {
        const oppLands = G.tiles.filter(s => s.owner != null && s.owner !== p.id).length;
        return { type: 'item', item: 'summon_god', god: oppLands >= 4 ? 'tudigong' : 'caishen' };
      }
      // 有送神卡且對手有好神明 → 驅散他
      if (p.items.includes('dismiss_god') && (!p.god || p.god.good)) {
        const blessedOpp = G.players.find(q => q !== p && !q.bankrupt && q.god && q.god.good);
        if (blessedOpp && rnd(G) < 0.6) return { type: 'item', item: 'dismiss_god', target: blessedOpp.id };
      }
      // 有拆除卡時拆最貴的對手建築
      if (p.items.includes('demolish')) {
        const t = G.tiles.map((s, i) => i).filter(i => G.tiles[i].owner != null && G.tiles[i].owner !== p.id && G.tiles[i].level > 0).sort((a, b) => rentOf(G, b) - rentOf(G, a))[0];
        if (t != null) return { type: 'item', item: 'demolish', i: t };
      }
      if (p.items.includes('block') && rnd(G) < 0.4) return { type: 'item', item: 'block', n: 1 + Math.floor(rnd(G) * 6) };
      if (p.items.includes('remote')) {
        let best = 0, bs = -1e9;
        const rMin = (p.dice || 1) >= 2 ? 2 : 1, rMax = (p.dice || 1) >= 2 ? 12 : 6;
        let probe = p.pos;
        for (let n = 1; n <= rMax; n++) {
          probe = p.reverse ? BOARD[probe].prev[0] : BOARD[probe].next[0];
          if (n < rMin) continue;
          const i = probe, t = BOARD[i], s = G.tiles[i];
          let sc = 0;
          if (t.type === 'land' || t.type === 'station') {
            if (s.owner == null) sc = t.price / 8;
            else if (s.owner === p.id) sc = 350;
            else sc = p.god && p.god.kind === 'tudigong' ? 800 + valueOf(G, i) / 5 : -rentOf(G, i);
          } else if (t.type === 'gojail' || t.type === 'tax') sc = -800;
          else if (t.type === 'chance' || t.type === 'shop' || t.type === 'temple' || t.type === 'casino') sc = 220;
          const npc = (G.npcs || []).find(x => x.attachedTo == null && x.pos === i);
          if (npc) sc += npc.kind === 'dog' || !GODS[npc.kind].good ? -900 : 500;
          if (sc > bs) { bs = sc; best = n; }
        }
        if (bs > 250) return { type: 'item', item: 'remote', n: best };
      }
      return { type: 'roll' };
    }
    return { type: 'end' };
  }

  const API = {
    BOARD, GROUPS, ITEMS, SPECIALTIES, SLOT_NAMES, OUTFITS, CARS, GODS, CHARS, LEVEL_NAME, MAX_LEVEL, MAX_ITEMS, N,
    START_CASH, START_BONUS,
    newGame, act, aiAction, rentOf, rentAt, buildCost, buyPriceOf, buildCostOf, netWorth, lands, cur, specialtyOfTile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RICH = API;
})(typeof window !== 'undefined' ? window : globalThis);
