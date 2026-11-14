// ===== 環島富豪 3D：遊戲規則（純邏輯，不含畫面；瀏覽器與 node 都可執行）=====
// 狀態 G 只含可序列化的資料：連線對戰時由房主執行規則，把 G 傳給其他玩家。
(function (root) {
  'use strict';

  // ----- 棋盤：56 格真實台灣順時針環島路線（0 為南端鵝鑾鼻起點，順時針：高屏 → 嘉南 → 澎湖 → 中彰投 → 桃竹苗 → 金門 → 北北基 → 宜花東 → 綠島蘭嶼）-----
  // type: start / land / chance / fate / tax / jail / gojail / park / shop / temple / hospital / station
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
  const L = (name, group, price) => ({ type: 'land', name, group, price });
  const BOARD = [
    // 南台灣・高屏嘉南（鵝鑾鼻起點 → 順時針北上，0..11）
    { type: 'start', name: '起點' },
    L('墾丁', 'south', 1200), L('恆春', 'south', 1300), { type: 'fate', name: '命運' },
    L('屏東', 'south', 1500), L('高雄', 'south', 1800), { type: 'station', name: '高鐵左營', price: 2200 },
    L('台南', 'yunjia', 1900), L('安平', 'yunjia', 2000), { type: 'chance', name: '機會' },
    { type: 'shop', name: '道具屋' }, L('嘉義', 'yunjia', 2100),
    // 阿里山・雲林北港・跨海澎湖・鹿港彰化南投日月潭・台中（12..24）
    { type: 'jail', name: '監獄' },
    L('阿里山', 'scenic', 2600), L('雲林', 'yunjia', 2000), { type: 'temple', name: '北港廟宇' },
    L('澎湖', 'island', 2500), L('鹿港', 'central', 2400), L('彰化', 'central', 2300),
    L('南投', 'central', 2200), L('日月潭', 'scenic', 2800), { type: 'hospital', name: '醫院' },
    { type: 'station', name: '台中高鐵', price: 2400 }, L('台中', 'central', 3000), { type: 'chance', name: '機會' },
    // 桃竹苗・跨海金門・大台北都會區（25..39）
    L('苗栗', 'taoyuan', 2400), L('竹科', 'taoyuan', 3200), L('新竹', 'taoyuan', 2800),
    { type: 'fate', name: '命運' }, L('桃園', 'taoyuan', 3100), L('金門', 'island', 2900),
    { type: 'station', name: '桃園機場', price: 2600 }, { type: 'shop', name: '道具屋' },
    L('淡水', 'north', 3500), { type: 'park', name: '國家公園' }, { type: 'temple', name: '行天宮' },
    L('新北', 'north', 4200), L('台北', 'north', 5400), L('信義區', 'north', 6200),
    { type: 'chance', name: '機會' },
    // 基隆港・東北角・宜花東・綠島蘭嶼南迴（40..55）
    { type: 'station', name: '基隆港', price: 2500 }, { type: 'gojail', name: '入獄' },
    L('九份', 'scenic', 3500), { type: 'tax', name: '國稅局' },
    L('宜蘭', 'east', 3000), L('羅東', 'east', 2900), { type: 'fate', name: '命運' },
    { type: 'temple', name: '迎神殿' }, L('太魯閣', 'scenic', 3800), L('花蓮', 'east', 3300),
    { type: 'shop', name: '道具屋' }, { type: 'chance', name: '機會' }, L('台東', 'east', 3100),
    L('綠島', 'island', 3300), L('蘭嶼', 'island', 3400), { type: 'fate', name: '命運' },
  ];
  const N = BOARD.length;
  const START_BONUS = 2000, START_CASH = 18000, MAX_LEVEL = 4, JAIL_TURNS = 2, MAX_ITEMS = 8;
  const LEVEL_NAME = ['空地', '一樓平房', '二樓透天', '高層大樓', '摩天大樓'];
  const RENT_MUL = [1.5, 6, 14, 24, 36];

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

  // ----- 機會與命運卡 -----
  const CHANCE = [
    { t: '投資台灣半導體大賺，獲得 $3500', f: (G, p) => { gain(G, p, 3500); pushNews(G, '機會快報', `${p.name} 投資台灣科技股大賺 $3500！`, '財經喜訊', '#2ecc71'); } },
    { t: '中了統一發票特別獎，獲得 $2500', f: (G, p) => { gain(G, p, 2500); pushNews(G, '機會快報', `${p.name} 中了統一發票獲得獎金 $2500！`, '好運連連', '#2ecc71'); } },
    { t: '搭高鐵快速北上，前進到台北', f: (G, p) => { pushNews(G, '交通快訊', `${p.name} 搭乘高鐵直奔「台北」！`, '機會移動', '#3498db'); moveTo(G, p, idx('台北')); } },
    { t: '回到起點領取環島補助 $2000', f: (G, p) => { pushNews(G, '環島補助', `${p.name} 受邀回到起點領取環島獎勵！`, '機會移動', '#3498db'); moveTo(G, p, 0); } },
    { t: '獲得一張「請神卡」', f: (G, p) => giveItem(G, p, 'summon_god', '機會贈卡') },
    { t: '獲得一張「送神卡」', f: (G, p) => giveItem(G, p, 'dismiss_god', '機會贈卡') },
    { t: '獲得地方都更補助，免費升級一塊自己的地', f: (G, p) => freeUpgrade(G, p) },
    { t: '喜氣洋洋！每位對手包給你紅包 $600', f: (G, p) => { eachOther(G, p, q => transfer(G, q, p, 600)); pushNews(G, '紅包行情', `${p.name} 向全場玩家收取紅包各 $600！`, '機會發財', '#f1c40f'); } },
    { t: '土地公保佑！直接請來土地公附身', f: (G, p) => attachGod(G, p, 'tudigong', '機會顯靈') },
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
    { t: '衰運纏身！招來「窮神」附身', f: (G, p) => attachGod(G, p, 'qiongshen', '命運附身') },
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

  function randomBoardTile(G) {
    const candidates = [];
    for (let i = 1; i < N; i++) {
      const t = BOARD[i].type;
      if (t !== 'jail' && t !== 'gojail' && t !== 'hospital') candidates.push(i);
    }
    return candidates[Math.floor(rnd(G) * candidates.length)] || 1;
  }
  function releaseGod(G, p, silent = false) {
    if (!p || !p.god) return;
    const oldKind = p.god.kind;
    p.god = null;
    const npc = (G.npcs || []).find(n => n.kind === oldKind && n.attachedTo === p.id);
    if (npc) {
      npc.attachedTo = null;
      npc.from = npc.pos;
      npc.pos = randomBoardTile(G);
      npc.moveN = (npc.moveN || 0) + 1;
    }
    if (!silent) {
      log(G, `${GODS[oldKind].icon} ${GODS[oldKind].name} 離開了 ${p.name}`);
      pushNews(G, '神明離去', `${GODS[oldKind].icon} ${GODS[oldKind].name} 結束附身，離開 ${p.name} 回到台灣地圖！`, '神明動向', '#95a5a6');
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
    if (npc) { npc.attachedTo = p.id; npc.pos = p.pos; }
    p.god = { kind, turns: gInfo.turns, fresh: G.cur === p.id && G.phase !== 'roll' };
    G.fx = { k: gInfo.good ? 'god_good' : 'god_bad', p: p.id, god: kind };
    log(G, `${gInfo.icon} ${reason}！${gInfo.name} 附身在 ${p.name} 身上（${gInfo.turns} 回合）`);
    pushNews(G, gInfo.good ? '神明降臨' : '噩耗警報', `${gInfo.icon} ${p.name} 被「${gInfo.name}」附身（${gInfo.turns} 回合）！`, gInfo.desc, gInfo.color);
  }

  function goJail(G, p, why = '違規入獄') {
    p.pos = idx('監獄'); p.jail = JAIL_TURNS;
    log(G, `🚨 ${p.name} ${why}，進監獄（${JAIL_TURNS} 回合）`);
    G.fx = { k: 'jail', p: p.id };
    pushNews(G, '社會新聞', `🚨 ${p.name} ${why}，已移送監獄拘留 ${JAIL_TURNS} 回合！`, '突發治安', '#e74c3c');
  }
  function goHospital(G, p, why = '送醫治療') {
    const hi = idx('醫院');
    if (hi >= 0) p.pos = hi;
    p.skip = 1;
    log(G, `🏥 ${p.name} ${why}`);
    G.fx = { k: 'jail', p: p.id };
    pushNews(G, '醫療快訊', `🏥 ${p.name} ${why}！`, '突發意外', '#e67e22');
  }

  function encounterNpc(G, p, npc) {
    if (!npc || npc.attachedTo != null || p.bankrupt) return false;
    if (npc.kind === 'dog') {
      pay(G, p, 800, null, '被野狗咬傷付醫藥費');
      npc.from = npc.pos;
      npc.pos = (npc.pos + 3) % N;
      npc.moveN = (npc.moveN || 0) + 1;
      if (!p.bankrupt) goHospital(G, p, '遭路邊野狗咬傷，送醫住院 1 回合');
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

  // ----- 移動 -----
  // 逐格前進：經過起點領錢、遇到路障或 NPC 互動；回傳是否中斷
  function walk(G, p, steps, abs = false) {
    const dir = abs ? 1 : (p.reverse ? -1 : 1), path = [];
    const from = p.pos;
    let interrupted = false;
    for (let k = 0; k < Math.abs(steps); k++) {
      const d = steps < 0 ? -dir : dir;
      p.pos = (p.pos + d + N) % N; path.push(p.pos);
      if (p.pos === 0 && d > 0) {
        p.cash += START_BONUS;
        log(G, `${p.name} 經過起點，領 $${START_BONUS}`);
      }
      // 路障檢查
      const b = G.blocks.findIndex(x => x.i === p.pos);
      if (b >= 0 && k < Math.abs(steps) - 1) {
        G.blocks.splice(b, 1);
        log(G, `🚧 ${p.name} 在 ${BOARD[p.pos].name} 被路障擋住`);
        pushNews(G, '路況突發', `🚧 ${p.name} 在「${BOARD[p.pos].name}」撞上路障被迫停下！`, '路障攔截', '#e67e22');
        break;
      }
      if (b >= 0) G.blocks.splice(b, 1);
      // 路遇地圖 NPC（神明或野狗）
      const hitNpc = (G.npcs || []).find(n => n.attachedTo == null && n.pos === p.pos);
      if (hitNpc) {
        const stopWalk = encounterNpc(G, p, hitNpc);
        if (stopWalk) {
          if (p.pos !== path[path.length - 1]) path.push(p.pos);
          interrupted = true;
          break;
        }
      }
    }
    G.moveSeq = (G.moveSeq || 0) + 1;
    G.move = { p: p.id, path, n: G.moveSeq, from };
    return interrupted;
  }
  function moveTo(G, p, i) {
    const interrupted = walk(G, p, (i - p.pos + N) % N || N, true);
    if (!interrupted && !p.bankrupt) arrive(G, p);
  }
  function moveBy(G, p, n) {
    const interrupted = walk(G, p, n, true);
    if (!interrupted && !p.bankrupt) arrive(G, p);
  }

  // ----- 抵達格子 -----
  function arrive(G, p) {
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
            if (s.level < MAX_LEVEL && p.cash >= cost) G.ask = { k: 'build', i, cost };
            return;
          }
          if (p.cash >= cost) G.ask = { k: 'build', i, cost };
          else log(G, `${p.name} 回到自家「${t.name}」，目前資金不足蓋樓（需 $${cost}）`);
        } else {
          log(G, `🏙️ ${p.name} 巡視自家的「${t.name}」摩天大樓！`);
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
      const freeItem = giveItem(G, p, null, '逛道具屋獲得贈禮');
      G.ask = { k: 'shop', i, freeItem, bought: [] };
      return;
    }
    if (t.type === 'temple') {
      if (p.god && !p.god.good) {
        const badName = GODS[p.god.kind].name;
        releaseGod(G, p, true);
        log(G, `⛩️ ${p.name} 在 ${t.name} 參拜，驅散了「${badName}」`);
        pushNews(G, '宮廟淨化', `⛩️ ${p.name} 前往「${t.name}」虔誠參拜，成功送走厄運「${badName}」！`, '台灣廟宇', '#f1c40f');
      } else if (!p.god) {
        const gk = GOOD_GOD_KEYS[Math.floor(rnd(G) * GOOD_GOD_KEYS.length)];
        attachGod(G, p, gk, `${t.name} 求神顯靈`);
      } else {
        const card = rnd(G) < 0.5 ? 'summon_god' : 'dismiss_god';
        giveItem(G, p, card, `${t.name} 祈福獲贈`);
      }
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
    if (t.type === 'park') { log(G, `🌲 ${p.name} 在國家公園休息賞景`); }
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
    return {
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
      dice: null,
      newsSeq: 1,
      news: [{ id: 1, cat: '開局快訊', title: `🎲 環島富豪 3D 正式開賽！共 ${seats.length} 位玩家角逐台灣地產王！`, body: '56 格全台灣地圖＋神明附身＋道具屋全面啟動！', color: '#f1c40f', round: 1 }],
      tiles: BOARD.map(() => ({ owner: null, level: 0 })),
      blocks: [],
      npcs: GOD_NPC_INIT.map((n, id) => ({ id, kind: n.kind, pos: n.pos, from: n.pos, attachedTo: null, moveN: 0 })),
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
          items: ['remote', 'summon_god', 'dismiss_god'],
          god: null,
          reverse: false,
          remote: 0,
          bankrupt: false,
        };
      }),
    };
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
        const interrupted = walk(G, p, sum);
        if (!interrupted && !p.bankrupt) arrive(G, p);
        G.phase = G.ask ? 'ask' : 'done';
        if (G.winner != null) G.phase = 'over';
        return null;
      }
      case 'buyItem': {
        if (!G.ask || G.ask.k !== 'shop') return '目前不在道具屋';
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
        if (q.k === 'card') {
          G.move = null;
          const deck = q.kind === 'chance' ? CHANCE : FATE;
          deck[q.c].f(G, p);
          G.phase = G.ask ? 'ask' : 'done';
          if (G.winner != null) G.phase = 'over';
          return null;
        }
        if (q.k === 'shop') {
          G.phase = 'done';
          return null;
        }
        if (a.yes) {
          if (q.k === 'buy') {
            const unitBuild = buildCostOf(G, p, q.i);
            const wantBuild = !!a.buildFirst && p.cash >= q.cost + unitBuild;
            const totalCost = q.cost + (wantBuild ? unitBuild : 0);
            if (p.cash >= totalCost) {
              p.cash -= totalCost;
              G.tiles[q.i].owner = p.id;
              if (wantBuild) {
                G.tiles[q.i].level = 1;
                log(G, `🏠 ${p.name} 以 $${q.cost} 買下 ${BOARD[q.i].name}，並立即花了 $${unitBuild} 蓋成【${LEVEL_NAME[1]}】`);
                G.fx = { k: 'build', i: q.i, lv: 1 };
              } else {
                log(G, `${p.name} 以 $${q.cost} 買下 ${BOARD[q.i].name}`);
                G.fx = { k: 'buy', i: q.i };
              }
              if (groupOwned(G, q.i)) {
                const gName = GROUPS[BOARD[q.i].group].name;
                pushNews(G, '地產壟斷', `👑 ${p.name} 買下「${BOARD[q.i].name}」，成功獨佔整個【${gName}】過路費全面翻倍！`, '重大購地', p.color);
              } else if (BOARD[q.i].price >= 3500 || wantBuild) {
                pushNews(G, wantBuild ? '買地興建' : '豪宅置產', `🏠 ${p.name} 斥資 $${totalCost} 買下「${BOARD[q.i].name}」${wantBuild ? `並蓋起【${LEVEL_NAME[1]}】` : ''}！`, '地產成交', p.color);
              }
            }
          } else {
            const curLv = G.tiles[q.i].level || 0;
            const maxAdd = Math.max(1, MAX_LEVEL - curLv);
            const addLv = Math.max(1, Math.min(maxAdd, a.levels ? (a.levels | 0) : 1));
            const totalCost = q.cost * addLv;
            if (p.cash >= totalCost) {
              p.cash -= totalCost;
              G.tiles[q.i].level = curLv + addLv;
              const lv = G.tiles[q.i].level;
              log(G, `🏗️ ${p.name} 把 ${BOARD[q.i].name} 蓋成【${LEVEL_NAME[lv]}】（$${totalCost}）`);
              G.fx = { k: 'build', i: q.i, lv };
              if (lv === MAX_LEVEL) {
                pushNews(G, '摩天大樓落成', `🏙️ 震撼地標！${p.name} 將「${BOARD[q.i].name}」正式蓋成最高級【摩天大樓】！過路費暴漲至 $${rentOf(G, q.i)}！`, '地產巔峰', p.color);
              } else if (addLv >= 2 || lv === 3) {
                pushNews(G, '加蓋擴建', `🏢 ${p.name} 豪砸 $${totalCost}，將「${BOARD[q.i].name}」擴建為【${LEVEL_NAME[lv]}】！`, '建築升級', p.color);
              }
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
    for (const npc of G.npcs) {
      if (npc.attachedTo != null) continue;
      npc.from = npc.pos;
      const step = npc.kind === 'dog' ? (rnd(G) < 0.35 ? -1 : 2) : (1 + Math.floor(rnd(G) * 2));
      npc.pos = (npc.pos + step + N) % N;
      npc.moveN = (npc.moveN || 0) + 1;
      // 若剛好停在站立玩家的格子上，觸發遭遇
      const hit = G.players.find(q => !q.bankrupt && q.jail === 0 && q.skip === 0 && q.pos === npc.pos);
      if (hit) encounterNpc(G, hit, npc);
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
      if (q.k === 'card') return { type: 'answer', yes: true };
      if (q.k === 'shop') {
        const bought = (q.bought && q.bought.length) || 0;
        if (bought === 0 && (p.dice || 1) < 2 && p.cash >= 3800) return { type: 'buyItem', item: 'add_die' };
        if (bought === 0 && p.cash >= 4000 && p.items.length < MAX_ITEMS) {
          if (!p.god && !p.items.includes('summon_god')) return { type: 'buyItem', item: 'summon_god' };
          if (p.god && !p.god.good && !p.items.includes('dismiss_god')) return { type: 'buyItem', item: 'dismiss_god' };
          if (!p.items.includes('remote')) return { type: 'buyItem', item: 'remote' };
        }
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
      if (!p.god && p.items.includes('summon_god') && rnd(G) < 0.75) {
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
        for (let n = rMin; n <= rMax; n++) {
          const i = (p.pos + (p.reverse ? -n : n) + N) % N, t = BOARD[i], s = G.tiles[i];
          let sc = 0;
          if (t.type === 'land' || t.type === 'station') {
            if (s.owner == null) sc = t.price / 8;
            else if (s.owner === p.id) sc = 350;
            else sc = p.god && p.god.kind === 'tudigong' ? 800 + valueOf(G, i) / 5 : -rentOf(G, i);
          } else if (t.type === 'gojail' || t.type === 'tax') sc = -800;
          else if (t.type === 'chance' || t.type === 'shop' || t.type === 'temple') sc = 220;
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
    BOARD, GROUPS, ITEMS, GODS, CHARS, LEVEL_NAME, MAX_LEVEL, MAX_ITEMS, N,
    START_CASH, START_BONUS,
    newGame, act, aiAction, rentOf, rentAt, buildCost, buyPriceOf, buildCostOf, netWorth, lands, cur,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RICH = API;
})(typeof window !== 'undefined' ? window : globalThis);
