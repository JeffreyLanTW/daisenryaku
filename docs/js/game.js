'use strict';
// ===== 遊戲狀態與規則 =====

let G = null;          // 目前遊戲狀態（可直接 JSON 存檔）
let gameToken = 0;     // 開新局時遞增，用來中止進行中的電腦回合

// odd-r 六角格座標（奇數列向右偏半格）
const NB_EVEN = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
const NB_ODD = [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];

function neighbors(x, y, w, h) {
  if (w === undefined) { w = G.w; h = G.h; }
  const out = [];
  for (const [dx, dy] of (y & 1) ? NB_ODD : NB_EVEN) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push([nx, ny]);
  }
  return out;
}
function hexDist(ax, ay, bx, by) {
  const aq = ax - (ay - (ay & 1)) / 2, bq = bx - (by - (by & 1)) / 2;
  const dq = aq - bq, dr = ay - by;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}
// 二元堆積（最小值優先），供各種尋路使用
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const inMap = (x, y) => x >= 0 && y >= 0 && x < G.w && y < G.h;
const idxOf = (x, y) => y * G.w + x;
const ixy = i => [i % G.w, (i / G.w) | 0];

function unitAt(x, y) {
  for (const u of G.units) if (u.x === x && u.y === y && u.hp > 0) return u;
  return null;
}
function unitById(id) { return G.units.find(u => u.id === id) || null; }
function occGrid() {
  const g = new Array(G.w * G.h).fill(null);
  for (const u of G.units) if (u.hp > 0) g[u.y * G.w + u.x] = u;
  return g;
}
function moveCost(tkey, mt) {
  const c = TERRAIN[tkey].cost[mt];
  return c === undefined ? Infinity : c;
}
const isIndirect = type => UNITS[type].range[0] > 1;

function addLog(text, side = -1) {
  G.log.push({ text, side, turn: G.turn });
  if (G.log.length > 80) G.log.shift();
}

// ----- 移動 -----
// 回傳 Map(idx -> {cost, prev, canStop})；地面/海上部隊受敵方地面部隊的控制區（ZOC）阻擋
function computeReach(u) {
  const d = UNITS[u.type], W = G.w;
  const occ = occGrid();
  const maxMove = d.fuel !== undefined ? Math.min(d.move, u.fuel) : d.move;
  let zoc = null;
  if (d.cat !== 'air') {
    zoc = new Uint8Array(W * G.h);
    for (const e of G.units) {
      if (e.hp <= 0 || e.side === u.side || UNITS[e.type].cat === 'air') continue;
      for (const [nx, ny] of neighbors(e.x, e.y)) zoc[ny * W + nx] = 1;
    }
  }
  const start = u.y * W + u.x;
  const dist = new Map([[start, { cost: 0, prev: -1 }]]);
  const open = new MinHeap(), done = new Set();
  open.push(0, start);
  while (open.size) {
    const cur = open.pop();
    if (done.has(cur)) continue;
    done.add(cur);
    if (cur !== start && zoc && zoc[cur]) continue;
    const cc = dist.get(cur).cost;
    const [cx, cy] = ixy(cur);
    for (const [nx, ny] of neighbors(cx, cy)) {
      const ni = ny * W + nx;
      if (done.has(ni)) continue;
      const c = moveCost(G.terrain[ni], d.mt);
      if (c === Infinity) continue;
      const o = occ[ni];
      if (o && o.side !== u.side) continue;
      const nc = cc + c;
      if (nc > maxMove) continue;
      const ex = dist.get(ni);
      if (ex && ex.cost <= nc) continue;
      dist.set(ni, { cost: nc, prev: cur });
      open.push(nc, ni);
    }
  }
  for (const [i, v] of dist) {
    const o = occ[i];
    v.canStop = !o || o === u;
    if (o && o !== u && canLoad(o, u)) { v.canStop = true; v.load = o.id; }
  }
  return dist;
}
// 移動命令用：忽略控制區、可穿過友軍，求整張地圖上到目標的最短路徑
function orderPath(u, target) {
  const d = UNITS[u.type], W = G.w, N = W * G.h, occ = occGrid();
  if (moveCost(G.terrain[target], d.mt) === Infinity) return null;
  const to = occ[target];
  if (to && to.side !== u.side) return null;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), start = u.y * W + u.x;
  const open = new MinHeap();
  dist[start] = 0; open.push(0, start);
  while (open.size) {
    const cur = open.pop();
    if (cur === target) break;
    const [cx, cy] = ixy(cur);
    for (const [nx, ny] of neighbors(cx, cy)) {
      const ni = ny * W + nx, c = moveCost(G.terrain[ni], d.mt);
      if (c === Infinity) continue;
      const o = occ[ni];
      if (o && o.side !== u.side) continue;
      const nd = dist[cur] + c;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = cur; open.push(nd, ni); }
    }
  }
  if (dist[target] === Infinity) return null;
  const p = [];
  for (let c = target; c !== -1; c = prev[c]) p.push(c);
  return p.reverse();
}
// 沿命令路徑在本回合可達範圍內能走到的最遠一格
function orderStep(u, reach) {
  const p = orderPath(u, u.order), start = u.y * G.w + u.x;
  if (!p) return start;
  let best = start;
  for (const i of p) { const r = reach.get(i); if (r && r.canStop) best = i; }
  return best;
}

// ----- 搭載 -----
// 部隊所屬軍隊名稱（友軍顯示自己的國家）
const armyName = u => UNITS[u.type].ally ? NATIONS[UNITS[u.type].ally].army : SIDES[u.side].name;
function canLoad(t, u) {
  const c = UNITS[t.type].carry, d = UNITS[u.type];
  if (!c || t.side !== u.side || d.carry || d.cat === 'sea') return false;
  if ((t.cargo || []).length >= c.cap || !c.allow.includes(d.mt)) return false;
  if (c.light && (BASE_UNITS[d.base] || d).cost > 500) return false;
  return true;
}
function loadInto(u, t) {
  G.units = G.units.filter(e => e !== u);
  u.done = u.moved = true;
  if (UNITS[u.type].cat === 'land') u.shipped = true;
  if (G.stats) G.stats.loads = (G.stats.loads || 0) + 1;
  t.cargo = t.cargo || [];
  t.cargo.push(u);
  addLog(`${armyName(u)}${UNITS[u.type].name} 搭上 ${UNITS[t.type].name}`, u.side);
}
// 可卸載的相鄰格
function unloadTiles(t, c) {
  const tc = UNITS[t.type].carry;
  if (!tc) return [];
  const ti = idxOf(t.x, t.y);
  if (tc.runway && !TERRAIN[G.terrain[ti]].prop) return [];
  if (UNITS[t.type].cat === 'air' && moveCost(G.terrain[ti], UNITS[c.type].mt) === Infinity && UNITS[c.type].cat !== 'air') return [];
  const out = [];
  for (const [nx, ny] of neighbors(t.x, t.y)) {
    const i = idxOf(nx, ny);
    if (!unitAt(nx, ny) && moveCost(G.terrain[i], UNITS[c.type].mt) !== Infinity) out.push(i);
  }
  return out;
}
function unloadAt(t, c, i) {
  t.cargo = t.cargo.filter(e => e !== c);
  const [x, y] = ixy(i);
  c.x = x; c.y = y; c.done = c.moved = true;
  if (UNITS[c.type].cat === 'land') {
    c.shipped = true;
    if (G.stats) G.stats.unloads = (G.stats.unloads || 0) + 1;
  }
  G.units.push(c);
  addLog(`${armyName(c)}${UNITS[c.type].name} 自 ${UNITS[t.type].name} ${UNITS[c.type].cat === 'air' ? '起飛' : '卸載'}`, c.side);
}

// ----- 鐵路鋪設 -----
const isRailNode = i => G.terrain[i] === 'rail' || ['city', 'capital', 'factory'].includes(G.terrain[i]);
// 可鋪設：平原/道路/森林、相鄰既有鐵路網，且在己方部隊 2 格內
function canLayRail(i, side) {
  if (!['plain', 'road', 'forest'].includes(G.terrain[i]) || G.funds[side] < RAIL_COST) return false;
  const [x, y] = ixy(i);
  if (!neighbors(x, y).some(([nx, ny]) => { const j = idxOf(nx, ny); return G.terrain[j] === 'rail' || (isRailNode(j) && G.owner[j] === side); })) return false;
  return G.units.some(u => u.side === side && hexDist(u.x, u.y, x, y) <= 2);
}
function layRail(i, side) {
  G.funds[side] -= RAIL_COST;
  G.terrain[i] = 'rail';
  const [x, y] = ixy(i);
  for (const [nx, ny] of neighbors(x, y)) { const j = idxOf(nx, ny); if (isRailNode(j)) G.rails.push([i, j]); }
  addLog(`${SIDES[side].name}鋪設了一段鐵路`, side);
}

function reachPath(reach, i) {
  const p = [];
  while (i !== -1) { p.push(i); i = reach.get(i).prev; }
  return p.reverse();
}

// ----- 戰鬥 -----
function canHit(attType, def) {
  return UNITS[attType].atk[CLASSES.indexOf(UNITS[def.type].cls)] > 0;
}
function targetsFrom(u, x, y) {
  const d = UNITS[u.type], out = [];
  for (const e of G.units) {
    if (e.hp <= 0 || e.side === u.side) continue;
    const dd = hexDist(x, y, e.x, e.y);
    if (dd >= d.range[0] && dd <= d.range[1] && canHit(u.type, e)) out.push(e);
  }
  return out;
}
// 未取整的期望傷害；防守方站在 (dx,dy)
function baseDamage(attType, attHp, def, dx, dy, attRank = 0) {
  const a = UNITS[attType].atk[CLASSES.indexOf(UNITS[def.type].cls)];
  if (!a) return 0;
  const dd = UNITS[def.type], tk = G.terrain[dy * G.w + dx];
  let td = dd.cat === 'land' ? TERRAIN[tk].def : 0;
  if (dd.jungle && (tk === 'forest' || tk === 'hills' || tk === 'mountain')) td += dd.jungle;
  return a * (attHp / 10) * (100 - td) / 100 * (UNITS[def.type].armor || 1) * RANKS[attRank].atk;
}
function canCounter(def, att, ax, ay) {
  if (UNITS[att.type].stealth) return false;
  return hexDist(ax, ay, def.x, def.y) === 1 && UNITS[def.type].range[0] === 1 && canHit(def.type, att);
}
// 攻擊方從 (ax,ay) 出手時的預估結果
function forecast(att, def, ax, ay) {
  const dmg = Math.min(def.hp, Math.round(baseDamage(att.type, att.hp, def, def.x, def.y, rankOf(att))));
  let counter = 0;
  const left = def.hp - dmg;
  if (left > 0 && canCounter(def, att, ax, ay)) {
    counter = Math.min(att.hp, Math.round(baseDamage(def.type, left, att, ax, ay, rankOf(def))));
  }
  return { dmg, counter };
}
function rollDamage(base, maxHp) {
  if (base <= 0) return 0;
  return Math.max(0, Math.min(maxHp, Math.round(base * (0.9 + Math.random() * 0.2))));
}
function resolveAttack(att, def) {
  const evaded = Math.random() < RANKS[rankOf(def)].evade;
  const dmg = evaded ? 0 : rollDamage(baseDamage(att.type, att.hp, def, def.x, def.y, rankOf(att)), def.hp);
  def.hp -= dmg;
  let counter = 0, countered = false, cEvaded = false;
  if (def.hp > 0 && canCounter(def, att, att.x, att.y)) {
    countered = true;
    cEvaded = Math.random() < RANKS[rankOf(att)].evade;
    counter = cEvaded ? 0 : rollDamage(baseDamage(def.type, def.hp, att, att.x, att.y, rankOf(def)), att.hp);
    att.hp -= counter;
  }
  // 經驗值：造成傷害、擊破、反擊與承受攻擊都會累積
  const r0 = [rankOf(att), rankOf(def)];
  if (!noRank(att)) att.xp = (att.xp || 0) + dmg * 5 + (def.hp <= 0 ? 15 : 0) + counter;
  if (!noRank(def)) def.xp = (def.xp || 0) + counter * 5 + (att.hp <= 0 ? 15 : 0) + dmg;
  const promoted = [att, def].filter((u, k) => u.hp > 0 && rankOf(u) > r0[k]);
  for (const u of promoted) addLog(`${SIDES[u.side].name}${UNITS[u.type].name} 升級為${RANKS[rankOf(u)].name}！`, u.side);
  const an = `${SIDES[att.side].name}${UNITS[att.type].name}`, dn = `${SIDES[def.side].name}${UNITS[def.type].name}`;
  let msg = `${an} 攻擊 ${dn}，造成 ${dmg} 傷害`;
  if (def.hp <= 0) msg += '，擊破！';
  else if (countered) msg += `；反擊 ${counter}` + (att.hp <= 0 ? '，攻擊方被擊破！' : '');
  if (evaded) msg += '（迴避！）';
  addLog(msg, att.side);
  return { dmg, counter, countered, evaded, cEvaded, promoted };
}
function removeDead() {
  for (const u of G.units) if (u.hp <= 0) {
    clearCapture(u);
    if (u.cargo && u.cargo.length) addLog(`搭載的 ${u.cargo.length} 支部隊隨 ${UNITS[u.type].name} 一同損失`, u.side);
  }
  G.units = G.units.filter(u => u.hp > 0);
}

// ----- 佔領 -----
function canCapture(u) {
  if (!UNITS[u.type].capture) return false;
  const i = idxOf(u.x, u.y);
  return !!TERRAIN[G.terrain[i]].prop && G.owner[i] !== u.side;
}
function capturePointsLeft(u) {
  const c = G.capture[idxOf(u.x, u.y)];
  return c && c.uid === u.id ? c.pts : CAPTURE_POINTS;
}
// 回傳 true = 佔領完成
function doCapture(u) {
  const i = idxOf(u.x, u.y);
  let c = G.capture[i];
  if (!c || c.uid !== u.id) c = G.capture[i] = { uid: u.id, side: u.side, pts: CAPTURE_POINTS };
  c.pts -= u.hp;
  const tname = TERRAIN[G.terrain[i]].name;
  if (c.pts > 0) {
    addLog(`${SIDES[u.side].name}正在佔領${tname}（剩餘 ${c.pts}）`, u.side);
    return false;
  }
  const prev = G.owner[i];
  G.owner[i] = u.side;
  delete G.capture[i];
  if (G.stats && (u.shipped || UNITS[u.type].mt === 'amph')) G.stats.amphibious_captures = (G.stats.amphibious_captures || 0) + 1;
  addLog(`${SIDES[u.side].name}佔領了${tname}！`, u.side);
  if (!G.missionId && G.terrain[i] === 'capital' && prev >= 0) {
    G.winner = u.side;
    G.winReason = `攻陷${SIDES[prev].name}首都`;
  }
  checkVictory();
  return true;
}
// 移除不再有效的佔領進度（部隊已離開或陣亡）
function clearCapture(u) {
  for (const k in G.capture) {
    const c = G.capture[k];
    if (c.uid === u.id && (u.hp <= 0 || +k !== idxOf(u.x, u.y))) delete G.capture[k];
  }
}
// 可進化的型號：需達到階級，且停在己方可補給的據點上
function evoOptions(u) {
  const d = UNITS[u.type];
  if (!d.next || !d.next.length || u.done) return [];
  const i = idxOf(u.x, u.y), t = TERRAIN[G.terrain[i]];
  if (G.owner[i] !== u.side || !t.heal || !t.heal.includes(d.cat)) return [];
  return d.next.filter(k => rankOf(u) >= UNITS[k].tier && G.funds[u.side] >= evoCost(u, k));
}
// 進化費用：新舊型號價差（至少 100）
function evoCost(u, key) { return Math.max(100, UNITS[key].cost - UNITS[u.type].cost); }
function evolve(u, key) {
  const from = UNITS[u.type].name;
  G.funds[u.side] -= evoCost(u, key);
  u.type = key;
  if (UNITS[key].fuel !== undefined) u.fuel = UNITS[key].fuel;
  addLog(`${SIDES[u.side].name}${from} 進化為 ${UNITS[key].name}！`, u.side);
}
function markDone(u) {
  u.done = true;
  u.moved = true;
  clearCapture(u);
}

// ----- 生產 -----
function makeUnit(type, side, x, y, extra) {
  type = extra && extra.ally ? atype(type, side, extra.ally) : ftype(type, side);
  return Object.assign({ id: G.nextId++, type, side, x, y, hp: 10, fuel: UNITS[type].fuel, moved: false, done: false, xp: 0 }, extra || {});
}
// 建立部隊：支援友軍（extra.ally）與預先搭載（extra.load）
function spawnUnit(type, side, x, y, extra) {
  const { load, ...rest } = extra || {};
  const u = makeUnit(type, side, x, y, rest);
  if (load) u.cargo = load.map(t => {
    const cu = makeUnit(t, side, x, y, rest.ally ? { ally: rest.ally } : null);
    if (UNITS[cu.type].cat === 'land') cu.shipped = true;
    return cu;
  });
  return u;
}
function buildOptions(x, y, side) {
  const i = idxOf(x, y), t = TERRAIN[G.terrain[i]];
  if (!t.build || G.owner[i] !== side || unitAt(x, y)) return [];
  return Object.keys(UNITS).filter(k => UNITS[k].side === side && !UNITS[k].tier && !UNITS[k].ally && t.build.includes(UNITS[k].cat)
    && (UNITS[k].base !== 'train' || (G.rails && G.rails.length)));
}
function produce(type, x, y, side) {
  const d = UNITS[type];
  if (G.funds[side] < d.cost) return null;
  G.funds[side] -= d.cost;
  const u = makeUnit(type, side, x, y);
  u.done = u.moved = true;
  G.units.push(u);
  addLog(`${SIDES[side].name}生產了${d.name}`, side);
  return u;
}

// ----- 回合 -----
function incomeOf(side) {
  let inc = 0;
  for (let i = 0; i < G.owner.length; i++) {
    if (G.owner[i] === side) inc += TERRAIN[G.terrain[i]].income || 0;
  }
  return inc;
}
function startTurn() {
  const s = G.cur;
  G.funds[s] += incomeOf(s);
  for (const u of G.units) {
    if (u.side !== s) continue;
    u.moved = u.done = u.autoMoved = false;
    for (const c of u.cargo || []) {
      c.moved = c.done = false;
      if (UNITS[u.type].carry && UNITS[u.type].carry.deck) {
        if (UNITS[c.type].fuel !== undefined) c.fuel = UNITS[c.type].fuel;
        c.hp = Math.min(10, c.hp + 2);
      }
    }
    const d = UNITS[u.type], i = idxOf(u.x, u.y), t = TERRAIN[G.terrain[i]];
    const onBase = G.owner[i] === s && t.heal && t.heal.includes(d.cat);
    if (d.fuel !== undefined) {
      if (onBase) u.fuel = d.fuel;
      else {
        u.fuel -= d.upkeep;
        if (u.fuel <= 0) { u.hp = 0; addLog(`${SIDES[s].name}${d.name} 燃料耗盡墜毀`, s); continue; }
      }
    }
    if (onBase && u.hp < 10) {
      const per = Math.ceil(d.cost / 10);
      let h = Math.min(2, 10 - u.hp);
      while (h > 0 && G.funds[s] < per * h) h--;
      if (h > 0) { u.hp += h; G.funds[s] -= per * h; }
    }
  }
  removeDead();
  if (G.missionId) missionTurnStart();
  checkVictory();
}
function endTurn() {
  G.cur = 1 - G.cur;
  if (G.cur === 0) G.turn++;
  startTurn();
}
function checkVictory() {
  if (G.winner != null) return;
  if (G.missionId) return evalMission();
  for (let s = 0; s < 2; s++) {
    if (!G.units.some(u => u.side === s)) {
      G.winner = 1 - s;
      G.winReason = `${SIDES[s].name}全軍覆沒`;
      return;
    }
  }
}

// ----- 開局 -----
// m: {w, h, terrain, owner, caps, roads, start: [[type, idx, side, extra]]}
function initState(m, opts) {
  gameToken++;
  G = {
    w: m.w, h: m.h, seed: opts.seed,
    terrain: m.terrain, owner: m.owner, caps: m.caps, roads: m.roads, rails: m.rails || [],
    units: [], turn: 1, cur: 0, funds: opts.funds || [START_FUNDS, START_FUNDS],
    players: opts.players, capture: {}, winner: null, winReason: '',
    nextId: 1, log: [], missionId: opts.missionId || null, result: null, nations: opts.nations || ['TW', 'CN'],
    allies: opts.allies || [], allyAI: !!opts.allyAI,
    firedEvents: [], pendingDialogs: [],
    stats: { loads: 0, unloads: 0, amphibious_captures: 0 },
  };
  applyNations(G.nations, G.allies);
  for (const [type, i, side, extra] of m.start) {
    const [x, y] = ixy(i);
    G.units.push(spawnUnit(type, side, x, y, extra));
  }
}
function newGame(opts) {
  const m = generateMap(opts.w, opts.h, opts.seed);
  m.w = opts.w; m.h = opts.h;
  const f = Math.round(START_FUNDS * Math.sqrt(opts.w * opts.h / 360) / 100) * 100;
  initState(m, Object.assign({ funds: [f, f] }, opts));
  addLog('作戰開始！攻陷敵方首都或殲滅全部敵軍即可獲勝。');
  startTurn();
}
