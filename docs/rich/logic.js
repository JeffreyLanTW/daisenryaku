// ===== 環島富豪 3D：遊戲規則（純邏輯，不含畫面；瀏覽器與 node 都可執行）=====
// 狀態 G 只含可序列化的資料：連線對戰時由房主執行規則，把 G 傳給其他玩家。
(function (root) {
  'use strict';

  // ----- 棋盤：40 格，0 為起點（右下角），逆時針前進 -----
  // type: start / land / chance / fate / tax / jail / gojail / park / shop / station
  const GROUPS = {
    north: { name: '北台灣', color: '#e0565b' }, taoyuan: { name: '桃竹苗', color: '#f29b38' },
    central: { name: '中台灣', color: '#e8c547' }, yunjia: { name: '雲嘉南', color: '#6cc070' },
    south: { name: '南台灣', color: '#3fb6c8' }, east: { name: '東台灣', color: '#4f7fe0' },
    island: { name: '離島', color: '#9b6cd6' }, scenic: { name: '名勝', color: '#d36aa8' },
  };
  const L = (name, group, price) => ({ type: 'land', name, group, price });
  const BOARD = [
    { type: 'start', name: '起點' },
    L('屏東', 'south', 1200), { type: 'fate', name: '命運' }, L('恆春', 'south', 1300), L('高雄', 'south', 1600),
    { type: 'station', name: '高鐵站', price: 2000 },
    L('台南', 'yunjia', 1700), { type: 'chance', name: '機會' }, L('嘉義', 'yunjia', 1800), L('雲林', 'yunjia', 1800),
    { type: 'jail', name: '監獄' },
    L('南投', 'central', 2100), { type: 'shop', name: '道具屋' }, L('彰化', 'central', 2200), L('台中', 'central', 2600),
    { type: 'station', name: '捷運站', price: 2000 },
    L('苗栗', 'taoyuan', 2700), { type: 'fate', name: '命運' }, L('新竹', 'taoyuan', 2900), L('桃園', 'taoyuan', 3000),
    { type: 'park', name: '公園' },
    L('日月潭', 'scenic', 3200), { type: 'chance', name: '機會' }, L('阿里山', 'scenic', 3300), L('九份', 'scenic', 3500),
    { type: 'station', name: '機場', price: 2000 },
    L('澎湖', 'island', 3600), L('金門', 'island', 3700), { type: 'tax', name: '稅務局' }, L('馬祖', 'island', 3900),
    { type: 'gojail', name: '入獄' },
    L('台東', 'east', 4100), L('花蓮', 'east', 4200), { type: 'shop', name: '道具屋' }, L('宜蘭', 'east', 4400),
    { type: 'station', name: '港口', price: 2000 },
    { type: 'chance', name: '機會' }, L('新北', 'north', 5000), { type: 'fate', name: '命運' }, L('台北', 'north', 6000),
  ];
  const N = BOARD.length;
  const START_BONUS = 1200, START_CASH = 12000, MAX_LEVEL = 4, JAIL_TURNS = 2;
  const LEVEL_NAME = ['空地', '平房', '透天', '公寓', '大樓'];
  const RENT_MUL = [1.5, 6, 14, 24, 36];

  // ----- 道具（通用桌遊道具，非任何既有遊戲的專有名稱）-----
  const ITEMS = {
    block: { name: '路障', desc: '放在前方 1–6 格內，經過的玩家會在此停下' },
    remote: { name: '遙控骰子', desc: '下次擲骰時自選點數（2–12）' },
    free: { name: '免租卡', desc: '下次要付過路費時自動使用，免付一次' },
    reverse: { name: '迴轉卡', desc: '改為反方向前進（直到再次使用）' },
    demolish: { name: '拆除卡', desc: '把對手一塊地的建築降一級' },
  };
  const ITEM_KEYS = Object.keys(ITEMS);

  // ----- 機會與命運卡 -----
  const CHANCE = [
    { t: '投資科技股大賺一筆，獲得 $3000', f: (G, p) => gain(G, p, 3000) },
    { t: '中了統一發票二獎，獲得 $2000', f: (G, p) => gain(G, p, 2000) },
    { t: '搭高鐵快速北上，前進到台北', f: (G, p) => moveTo(G, p, idx('台北')) },
    { t: '回到起點並領取 $2000', f: (G, p) => moveTo(G, p, 0) },
    { t: '獲得一張道具卡', f: (G, p) => giveItem(G, p) },
    { t: '房屋修繕：每棟建築付 $300', f: (G, p) => pay(G, p, 300 * levels(G, p), null, '房屋修繕') },
    { t: '得到地方補助，免費升級一塊自己的地', f: (G, p) => freeUpgrade(G, p) },
    { t: '向每位玩家收取紅包 $500', f: (G, p) => eachOther(G, p, q => transfer(G, q, p, 500)) },
  ];
  const FATE = [
    { t: '超速被開罰單，付 $1000', f: (G, p) => pay(G, p, 1000, null, '罰單') },
    { t: '食物中毒住院，休息一回合', f: (G, p) => { p.skip = 1; } },
    { t: '逃漏稅被查，進監獄', f: (G, p) => goJail(G, p) },
    { t: '颱風來襲，所有玩家每塊地付 $200 救災', f: (G, p) => G.players.forEach(q => !q.bankrupt && pay(G, q, 200 * lands(G, q).length, null, '颱風救災')) },
    { t: '請每位玩家吃飯，各付 $400', f: (G, p) => eachOther(G, p, q => transfer(G, p, q, 400)) },
    { t: '撿到錢包送警局，獲得獎金 $800', f: (G, p) => gain(G, p, 800) },
    { t: '後退 3 格', f: (G, p) => moveBy(G, p, -3) },
    { t: '股市崩盤，損失現金的 20%', f: (G, p) => pay(G, p, Math.round(p.cash * 0.2), null, '股市崩盤') },
  ];

  const idx = name => BOARD.findIndex(t => t.name === name);
  const rnd = G => { G.seed = (G.seed * 1103515245 + 12345) >>> 0; return (G.seed >>> 8) / 16777216; };
  const roll = G => 1 + Math.floor(rnd(G) * 6);
  const log = (G, s) => { G.log.push(s); if (G.log.length > 60) G.log.shift(); };
  const cur = G => G.players[G.cur];
  const lands = (G, p) => G.tiles.map((t, i) => i).filter(i => G.tiles[i].owner === p.id);
  const levels = (G, p) => lands(G, p).reduce((s, i) => s + (G.tiles[i].level || 0), 0);
  const groupOwned = (G, i) => { const t = BOARD[i]; if (t.type !== 'land') return false; const o = G.tiles[i].owner; return BOARD.every((b, j) => b.group !== t.group || G.tiles[j].owner === o); };

  function rentOf(G, i) {
    const t = BOARD[i], s = G.tiles[i];
    if (s.owner == null) return 0;
    if (t.type === 'station') { const n = G.tiles.filter((x, j) => BOARD[j].type === 'station' && x.owner === s.owner).length; return 250 * Math.pow(2, n - 1); }
    let r = Math.round(t.price * 0.2 * RENT_MUL[s.level || 0]);
    if (groupOwned(G, i)) r *= 2;
    return r;
  }
  const buildCost = i => Math.round(BOARD[i].price * 0.5);
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
  function giveItem(G, p) {
    const k = ITEM_KEYS[Math.floor(rnd(G) * ITEM_KEYS.length)];
    if (p.items.length >= 6) { log(G, `${p.name} 的道具已滿`); return; }
    p.items.push(k); log(G, `${p.name} 獲得道具「${ITEMS[k].name}」`);
  }
  function freeUpgrade(G, p) {
    const own = lands(G, p).filter(i => BOARD[i].type === 'land' && G.tiles[i].level < MAX_LEVEL);
    if (!own.length) { log(G, `${p.name} 沒有可升級的地`); return; }
    own.sort((a, b) => BOARD[b].price - BOARD[a].price);
    G.tiles[own[0]].level++; log(G, `${BOARD[own[0]].name} 升級為${LEVEL_NAME[G.tiles[own[0]].level]}`);
  }
  function goJail(G, p) { p.pos = idx('監獄'); p.jail = JAIL_TURNS; log(G, `${p.name} 進了監獄（${JAIL_TURNS} 回合）`); G.fx = { k: 'jail', p: p.id }; }
  // 現金不足：先賣最便宜的地（回收地價與建築一半），仍不足則破產
  function settle(G, p, creditor) {
    while (p.cash < 0) {
      const own = lands(G, p).sort((a, b) => valueOf(G, a) - valueOf(G, b));
      if (!own.length) break;
      const i = own[0], v = Math.round(valueOf(G, i) / 2);
      G.tiles[i].owner = null; G.tiles[i].level = 0; p.cash += v;
      log(G, `${p.name} 變賣 ${BOARD[i].name}，得 $${v}`);
    }
    if (p.cash < 0) {
      p.bankrupt = true; if (creditor) creditor.cash += Math.max(0, p.cash + 0);
      log(G, `💥 ${p.name} 破產出局`);
      G.blocks = G.blocks.filter(b => b.by !== p.id);
      p.cash = 0;
      checkEnd(G);
    }
  }
  function checkEnd(G) {
    const alive = G.players.filter(q => !q.bankrupt);
    if (alive.length <= 1) { G.winner = alive[0] ? alive[0].id : null; G.phase = 'over'; log(G, `🏆 ${alive[0] ? alive[0].name : '無人'} 獲勝`); return true; }
    return false;
  }

  // ----- 移動 -----
  // 逐格前進：經過起點領錢、遇到路障停下；回傳經過的格子（畫面據此播放移動動畫）
  // steps > 0 依玩家目前方向前進；abs = true 時 steps 的正負就是絕對方向（卡片指定的移動）
  function walk(G, p, steps, abs = false) {
    const dir = abs ? 1 : (p.reverse ? -1 : 1), path = [];
    for (let k = 0; k < Math.abs(steps); k++) {
      const d = steps < 0 ? -dir : dir;
      p.pos = (p.pos + d + N) % N; path.push(p.pos);
      if (p.pos === 0 && d > 0) { p.cash += START_BONUS; log(G, `${p.name} 經過起點，領 $${START_BONUS}`); }
      const b = G.blocks.findIndex(x => x.i === p.pos);
      if (b >= 0 && k < Math.abs(steps) - 1) { G.blocks.splice(b, 1); log(G, `${p.name} 被路障擋住`); break; }
      if (b >= 0) G.blocks.splice(b, 1);
    }
    G.move = { p: p.id, path, n: (G.move ? G.move.n : 0) + 1 };
    return path;
  }
  function moveTo(G, p, i) {
    walk(G, p, (i - p.pos + N) % N || N, true);
    arrive(G, p);
  }
  function moveBy(G, p, n) { walk(G, p, n, true); arrive(G, p); }

  // ----- 抵達格子 -----
  function arrive(G, p) {
    const i = p.pos, t = BOARD[i], s = G.tiles[i];
    if (t.type === 'land' || t.type === 'station') {
      if (s.owner == null) { if (p.cash >= t.price) G.ask = { k: 'buy', i, cost: t.price }; return; }
      if (s.owner === p.id) {
        if (t.type === 'land' && s.level < MAX_LEVEL && p.cash >= buildCost(i)) G.ask = { k: 'build', i, cost: buildCost(i) };
        return;
      }
      const owner = G.players.find(q => q.id === s.owner);
      if (owner.jail > 0) { log(G, `${owner.name} 在監獄中，免收過路費`); return; }
      const fi = p.items.indexOf('free');
      if (fi >= 0) { p.items.splice(fi, 1); log(G, `${p.name} 使用免租卡`); return; }
      pay(G, p, rentOf(G, i), owner, `在 ${t.name} 的過路費`);
      G.fx = { k: 'rent', p: p.id, to: owner.id };
      return;
    }
    if (t.type === 'chance' || t.type === 'fate') {
      const deck = t.type === 'chance' ? CHANCE : FATE, c = Math.floor(rnd(G) * deck.length);
      G.card = { kind: t.type, i: c, text: deck[c].t, n: (G.card ? G.card.n : 0) + 1 };
      log(G, `${p.name} 抽到${t.name}：${deck[c].t}`);
      deck[c].f(G, p);
      return;
    }
    if (t.type === 'tax') { pay(G, p, Math.max(500, Math.round(p.cash * 0.1)), null, '繳稅'); return; }
    if (t.type === 'gojail') { goJail(G, p); return; }
    if (t.type === 'shop') { giveItem(G, p); return; }
    if (t.type === 'park') { log(G, `${p.name} 在公園休息`); }
  }

  // ----- 新遊戲 -----
  const CHARS = [
    { name: '阿凱', color: '#e05252', hat: 'cap' }, { name: '小晴', color: '#3f8ee8', hat: 'bow' },
    { name: '老陳', color: '#4fb35d', hat: 'hat' }, { name: '安娜', color: '#e3a13a', hat: 'crown' },
  ];
  function newGame(seats, opt = {}) {
    // seats: [{ name, kind: 'local'|'ai'|'remote', owner }]
    return {
      v: 1, seed: (opt.seed || Date.now()) >>> 0, turn: 1, round: 1, maxRounds: opt.maxRounds || 30,
      cur: 0, phase: 'roll', winner: null, ask: null, card: null, move: null, fx: null, dice: null,
      tiles: BOARD.map(() => ({ owner: null, level: 0 })), blocks: [], log: ['遊戲開始！每人起始資金 $' + START_CASH],
      players: seats.map((s, k) => ({ id: k, name: s.name || CHARS[k].name, char: k, color: CHARS[k].color, kind: s.kind, owner: s.owner || null,
        cash: START_CASH, pos: 0, jail: 0, skip: 0, items: ['remote'], reverse: false, remote: 0, bankrupt: false })),
    };
  }

  // ----- 動作（由房主或本機套用）。回傳錯誤字串或 null -----
  function act(G, pid, a) {
    if (G.phase === 'over') return '遊戲已結束';
    const p = cur(G);
    if (p.id !== pid) return '還沒輪到你';
    switch (a.type) {
      case 'roll': {
        if (G.phase !== 'roll' || G.ask) return '現在不能擲骰';
        G.card = null; G.fx = null;
        const d1 = p.remote ? Math.min(6, p.remote - 1) : roll(G);
        const d2 = p.remote ? p.remote - d1 : roll(G);
        p.remote = 0;
        G.dice = { a: d1, b: d2, n: (G.dice ? G.dice.n : 0) + 1 };
        log(G, `${p.name} 擲出 ${d1} + ${d2} = ${d1 + d2}`);
        walk(G, p, d1 + d2); arrive(G, p);
        G.phase = G.ask ? 'ask' : 'done';
        if (G.winner != null) G.phase = 'over';
        return null;
      }
      case 'answer': {
        if (!G.ask) return '沒有待回答的問題';
        const q = G.ask; G.ask = null;
        if (a.yes && p.cash >= q.cost) {
          p.cash -= q.cost;
          if (q.k === 'buy') { G.tiles[q.i].owner = p.id; log(G, `${p.name} 以 $${q.cost} 買下 ${BOARD[q.i].name}`); G.fx = { k: 'buy', i: q.i }; }
          else { G.tiles[q.i].level++; log(G, `${p.name} 把 ${BOARD[q.i].name} 蓋成${LEVEL_NAME[G.tiles[q.i].level]}（$${q.cost}）`); G.fx = { k: 'build', i: q.i }; }
        }
        G.phase = 'done';
        return null;
      }
      case 'item': {
        if (G.phase !== 'roll') return '擲骰前才能使用道具';
        const k = p.items.indexOf(a.item);
        if (k < 0) return '沒有這個道具';
        if (a.item === 'remote') { const n = Math.max(2, Math.min(12, a.n | 0)); p.remote = n; log(G, `${p.name} 使用遙控骰子，點數設為 ${n}`); }
        else if (a.item === 'block') {
          const off = Math.max(1, Math.min(6, a.n | 0)), i = (p.pos + (p.reverse ? -off : off) + N) % N;
          G.blocks.push({ i, by: p.id }); log(G, `${p.name} 在 ${BOARD[i].name} 放了路障`);
        } else if (a.item === 'reverse') { p.reverse = !p.reverse; log(G, `${p.name} 改為${p.reverse ? '反方向' : '正方向'}前進`); }
        else if (a.item === 'demolish') {
          const i = a.i | 0, s = G.tiles[i];
          if (!s || s.owner == null || s.owner === p.id || !s.level) return '請選擇對手有建築的地';
          s.level--; log(G, `${p.name} 拆除了 ${BOARD[i].name} 的一層建築`); G.fx = { k: 'demolish', i };
        } else if (a.item === 'free') return '免租卡會在付過路費時自動使用';
        p.items.splice(k, 1);
        return null;
      }
      case 'end': {
        if (G.phase === 'ask') return '請先回答';
        if (G.phase === 'roll') return '請先擲骰';
        nextTurn(G);
        return null;
      }
    }
    return '未知動作';
  }
  function nextTurn(G) {
    G.card = null; G.ask = null;
    for (let guard = 0; guard < 20; guard++) {
      G.cur = (G.cur + 1) % G.players.length;
      if (G.cur === 0) { G.round++; if (G.round > G.maxRounds) return finishByWorth(G); }
      const p = cur(G);
      if (p.bankrupt) continue;
      if (p.jail > 0) { p.jail--; log(G, `${p.name} 在監獄中（剩 ${p.jail} 回合）`); continue; }
      if (p.skip > 0) { p.skip--; log(G, `${p.name} 休息一回合`); continue; }
      break;
    }
    G.turn++; G.phase = 'roll';
  }
  function finishByWorth(G) {
    const alive = G.players.filter(q => !q.bankrupt).sort((a, b) => netWorth(G, b) - netWorth(G, a));
    G.winner = alive[0].id; G.phase = 'over'; G.round = G.maxRounds;
    log(G, `回合結束，總資產最多的 ${alive[0].name} 獲勝（$${netWorth(G, alive[0])}）`);
  }

  // ----- 電腦玩家：回傳下一個動作 -----
  function aiAction(G) {
    const p = cur(G);
    if (G.phase === 'ask') {
      const q = G.ask, reserve = q.k === 'buy' ? 1000 : 1500;
      return { type: 'answer', yes: p.cash - q.cost >= reserve };
    }
    if (G.phase === 'roll') {
      // 有拆除卡時拆最貴的對手建築；有路障時偶爾放在前方
      if (p.items.includes('demolish')) {
        const t = G.tiles.map((s, i) => i).filter(i => G.tiles[i].owner != null && G.tiles[i].owner !== p.id && G.tiles[i].level > 0).sort((a, b) => rentOf(G, b) - rentOf(G, a))[0];
        if (t != null) return { type: 'item', item: 'demolish', i: t };
      }
      if (p.items.includes('block') && rnd(G) < 0.5) return { type: 'item', item: 'block', n: 1 + Math.floor(rnd(G) * 6) };
      if (p.items.includes('remote')) {
        // 找 2–12 步內最想停的格子：自己的地（可升級）> 空地 > 機會；避開高過路費
        let best = 0, bs = -1e9;
        for (let n = 2; n <= 12; n++) {
          const i = (p.pos + (p.reverse ? -n : n) + N) % N, t = BOARD[i], s = G.tiles[i];
          let sc = 0;
          if (t.type === 'land' || t.type === 'station') sc = s.owner == null ? t.price / 10 : s.owner === p.id ? 300 : -rentOf(G, i);
          else if (t.type === 'gojail' || t.type === 'tax') sc = -800; else if (t.type === 'chance' || t.type === 'shop') sc = 150;
          if (sc > bs) { bs = sc; best = n; }
        }
        if (bs > 200) return { type: 'item', item: 'remote', n: best };
      }
      return { type: 'roll' };
    }
    return { type: 'end' };
  }

  const API = { BOARD, GROUPS, ITEMS, CHARS, LEVEL_NAME, MAX_LEVEL, N, newGame, act, aiAction, rentOf, buildCost, netWorth, lands, cur, START_CASH };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RICH = API;
})(typeof window !== 'undefined' ? window : globalThis);
