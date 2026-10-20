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
  const open = [start], done = new Set();
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (dist.get(open[k]).cost < dist.get(open[bi]).cost) bi = k;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
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
      open.push(ni);
    }
  }
  for (const [i, v] of dist) v.canStop = !occ[i] || occ[i] === u;
  return dist;
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
function baseDamage(attType, attHp, def, dx, dy) {
  const a = UNITS[attType].atk[CLASSES.indexOf(UNITS[def.type].cls)];
  if (!a) return 0;
  const td = UNITS[def.type].cat === 'land' ? TERRAIN[G.terrain[dy * G.w + dx]].def : 0;
  return a * (attHp / 10) * (100 - td) / 100 * (UNITS[def.type].armor || 1);
}
function canCounter(def, att, ax, ay) {
  if (UNITS[att.type].stealth) return false;
  return hexDist(ax, ay, def.x, def.y) === 1 && UNITS[def.type].range[0] === 1 && canHit(def.type, att);
}
// 攻擊方從 (ax,ay) 出手時的預估結果
function forecast(att, def, ax, ay) {
  const dmg = Math.min(def.hp, Math.round(baseDamage(att.type, att.hp, def, def.x, def.y)));
  let counter = 0;
  const left = def.hp - dmg;
  if (left > 0 && canCounter(def, att, ax, ay)) {
    counter = Math.min(att.hp, Math.round(baseDamage(def.type, left, att, ax, ay)));
  }
  return { dmg, counter };
}
function rollDamage(base, maxHp) {
  if (base <= 0) return 0;
  return Math.max(0, Math.min(maxHp, Math.round(base * (0.9 + Math.random() * 0.2))));
}
function resolveAttack(att, def) {
  const dmg = rollDamage(baseDamage(att.type, att.hp, def, def.x, def.y), def.hp);
  def.hp -= dmg;
  let counter = 0, countered = false;
  if (def.hp > 0 && canCounter(def, att, att.x, att.y)) {
    countered = true;
    counter = rollDamage(baseDamage(def.type, def.hp, att, att.x, att.y), att.hp);
    att.hp -= counter;
  }
  const an = `${SIDES[att.side].name}${UNITS[att.type].name}`, dn = `${SIDES[def.side].name}${UNITS[def.type].name}`;
  let msg = `${an} 攻擊 ${dn}，造成 ${dmg} 傷害`;
  if (def.hp <= 0) msg += '，擊破！';
  else if (countered) msg += `；反擊 ${counter}` + (att.hp <= 0 ? '，攻擊方被擊破！' : '');
  addLog(msg, att.side);
  return { dmg, counter, countered };
}
function removeDead() {
  for (const u of G.units) if (u.hp <= 0) clearCapture(u);
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
function markDone(u) {
  u.done = true;
  u.moved = true;
  clearCapture(u);
}

// ----- 生產 -----
function makeUnit(type, side, x, y, extra) {
  type = ftype(type, side);
  return Object.assign({ id: G.nextId++, type, side, x, y, hp: 10, fuel: UNITS[type].fuel, moved: false, done: false }, extra || {});
}
function buildOptions(x, y, side) {
  const i = idxOf(x, y), t = TERRAIN[G.terrain[i]];
  if (!t.build || G.owner[i] !== side || unitAt(x, y)) return [];
  return Object.keys(UNITS).filter(k => UNITS[k].side === side && t.build.includes(UNITS[k].cat));
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
    u.moved = u.done = false;
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
    terrain: m.terrain, owner: m.owner, caps: m.caps, roads: m.roads,
    units: [], turn: 1, cur: 0, funds: opts.funds || [START_FUNDS, START_FUNDS],
    players: opts.players, capture: {}, winner: null, winReason: '',
    nextId: 1, log: [], missionId: opts.missionId || null, result: null,
    firedEvents: [], pendingDialogs: [],
  };
  for (const [type, i, side, extra] of m.start) {
    const [x, y] = ixy(i);
    G.units.push(makeUnit(type, side, x, y, extra));
  }
}
function newGame(opts) {
  const m = generateMap(opts.w, opts.h, opts.seed);
  m.w = opts.w; m.h = opts.h;
  initState(m, opts);
  addLog('作戰開始！攻陷敵方首都或殲滅全部敵軍即可獲勝。');
  startTurn();
}
