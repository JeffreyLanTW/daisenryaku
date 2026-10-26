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
      const nc = Math.round((cc + c) * 100) / 100;
      if (nc > maxMove + 1e-6) continue;
      const ex = dist.get(ni);
      if (ex && ex.cost <= nc + 1e-6) continue;
      dist.set(ni, { cost: nc, prev: cur });
      open.push(nc, ni);
    }
  }
  for (const [i, v] of dist) {
    const o = occ[i];
    v.canStop = !o || o === u;
    if (o && o !== u && canLoad(o, u)) { v.canStop = true; v.load = o.id; }
    // 合流目標不設 canStop：只有玩家點擊會觸發，AI、攻擊位置與移動命令都不會停在友軍格上
    else if (o && o !== u && canMerge(o, u)) v.merge = o.id;
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
      const nd = Math.round((dist[cur] + c) * 100) / 100;
      if (nd < dist[ni] - 1e-6) { dist[ni] = nd; prev[ni] = cur; open.push(nd, ni); }
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
// 合流（非破壞性溢出補滿）：同型、同陣營且目標受損時可合流；溢出時目標補滿至 10，主動部隊保留溢出兵力存活
function canMerge(t, u) {
  if (!t || !u || t === u || t.side !== u.side || t.type !== u.type || t.vip || u.vip) return false;
  if ((t.cargo && t.cargo.length) || (u.cargo && u.cargo.length)) return false;
  const tm = t.maxHp || UNITS[t.type].maxHp || 10;
  return t.hp < Math.min(10, tm);
}
function mergeInto(u, t) {
  const max = 10, total = t.hp + u.hp;
  if (total <= max) {
    t.xp = Math.round(((t.xp || 0) * t.hp + (u.xp || 0) * u.hp) / total);
    t.hp = total;
    if (UNITS[t.type].fuel !== undefined) t.fuel = Math.max(t.fuel, u.fuel);
    t.done = t.moved = true;
    G.units = G.units.filter(e => e !== u);
    if (G.stats) G.stats.merges = (G.stats.merges || 0) + 1;
    addLog(`${armyName(t)}${UNITS[t.type].name} 完成合流，兵力回復至 ${t.hp}`, t.side);
  } else {
    const needed = max - t.hp;
    t.xp = Math.round(((t.xp || 0) * t.hp + (u.xp || 0) * needed) / max);
    t.hp = max;
    u.hp = total - max;
    if (UNITS[t.type].fuel !== undefined) t.fuel = Math.max(t.fuel, u.fuel);
    t.done = t.moved = true;
    u.done = u.moved = true;
    if (G.stats) G.stats.merges = (G.stats.merges || 0) + 1;
    addLog(`${armyName(t)}${UNITS[t.type].name} 合流補滿至 10，剩餘部隊保留兵力 ${u.hp}`, t.side);
  }
}
// 夜間（夕惕若厲）：任務以 night(turn) 指定夜間回合；夜間直接攻擊 ×0.8、間接火力缺乏觀測 ×0.6
function isNight() {
  if (!G || !G.missionId || typeof MISSIONS === 'undefined') return false;
  const M = MISSIONS[G.missionId];
  return !!(M && M.night && M.night(G.turn));
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
// 計算戰術光環：TSMC 矽盾堡壘（2格內友軍承受傷害×0.9）與 US-Corp 演算法火控母艦（2格內友軍攻擊×1.1）
function unitAura(u) {
  if (!u || !G || !G.units) return { atkMod: 1.0, defMod: 1.0, hasAura: false };
  let atkMod = 1.0, defMod = 1.0;
  if (G.moraleDebuff && G.moraleDebuff[u.side]) atkMod *= (1 - G.moraleDebuff[u.side]);
  for (const a of G.units) {
    if (a.hp <= 0) continue;
    const d = hexDist(u.x, u.y, a.x, a.y);
    if (d > 2) continue;
    const ab = UNITS[a.type].base;
    if (a.side === u.side) {
      if (ab === 'euv_fortress') defMod *= 0.90; // TSMC EUV 矽盾電磁防護
      if (ab === 'palantir_arty' || ab === 'wingman_carrier') atkMod *= 1.10; // US-Corp 演算法火控光環
    } else {
      if (ab === 'euv_fortress' || ab === 'palantir_arty') atkMod *= 0.95; // 敵方電磁干擾
    }
  }
  return { atkMod, defMod, hasAura: atkMod !== 1.0 || defMod !== 1.0 };
}
// 未取整的期望傷害；防守方站在 (dx,dy)
function baseDamage(attType, attHp, def, dx, dy, attRank = 0) {
  const a = UNITS[attType].atk[CLASSES.indexOf(UNITS[def.type].cls)];
  if (!a) return 0;
  const dd = UNITS[def.type], tk = G.terrain[dy * G.w + dx];
  let td = dd.cat === 'land' ? TERRAIN[tk].def : 0;
  if (td > 0 && G.capture && G.capture[dy * G.w + dx]) {
    td = Math.round(td * (G.capture[dy * G.w + dx].pts / CAPTURE_POINTS));
  }
  if (dd.jungle && (tk === 'forest' || tk === 'hills' || tk === 'mountain')) td += dd.jungle;
  const defAura = unitAura(def);
  const night = isNight() ? (isIndirect(attType) ? 0.6 : 0.8) : 1;
  return a * (attHp / 10) * (100 - td) / 100 * (UNITS[def.type].armor || 1) * RANKS[attRank].atk * defAura.defMod * night;
}
// 取得航母/空母上待命或周遭 2 格內的最佳空優護衛機（CAP 空中戰鬥巡邏）
function carrierEscort(def) {
  if (!def || !G || !G.units) return null;
  const defBase = UNITS[def.type].base;
  if (defBase !== 'carrier' && defBase !== 'wingman_carrier') return null;
  // 1. 優先由艦載戰機升空護航
  if (def.cargo && def.cargo.length) {
    const onDeck = def.cargo.find(c => c.hp > 0 && UNITS[c.type].cls === 'air' && UNITS[c.type].atk && UNITS[c.type].atk[2] > 0);
    if (onDeck) return { unit: onDeck, dist: 0 };
  }
  // 2. 周遭 2 格內巡邏的友軍戰機/僚機母機
  for (const f of G.units) {
    if (f.hp <= 0 || f.side !== def.side || f === def) continue;
    const fd = UNITS[f.type];
    if (fd.cls === 'air' && fd.atk && fd.atk[2] > 0) {
      const d = hexDist(f.x, f.y, def.x, def.y);
      if (d <= 2) return { unit: f, dist: d };
    }
  }
  return null;
}
function canCounter(def, att, ax, ay) {
  if (UNITS[att.type].stealth) return false;
  // 航母若搭載護衛戰機或2格內有友軍空優戰機，遭受敵方空軍突擊時可立即實施 CAP 防空攔截
  if (UNITS[att.type].cls === 'air' && carrierEscort(def)) return true;
  return hexDist(ax, ay, def.x, def.y) === 1 && UNITS[def.type].range[0] === 1 && canHit(def.type, att);
}
// 攻擊方從 (ax,ay) 出手時的預估結果
function forecast(att, def, ax, ay) {
  const esc = UNITS[att.type].cls === 'air' ? carrierEscort(def) : null;
  const escU = esc ? esc.unit : null;
  const attAura = unitAura(att);
  let rawDmg = baseDamage(att.type, att.hp, def, def.x, def.y, rankOf(att)) * attAura.atkMod;
  if (escU) rawDmg *= (esc.dist === 0 ? 0.65 : 0.80); // 護衛機巡邏攔截削弱空襲傷害
  const dmg = Math.min(def.hp, Math.round(rawDmg));
  let counter = 0;
  const left = def.hp - dmg;
  if (left > 0 && canCounter(def, att, ax, ay)) {
    if (escU) {
      counter = Math.min(att.hp, Math.round(baseDamage(escU.type, escU.hp, att, ax, ay, rankOf(escU))));
    } else {
      counter = Math.min(att.hp, Math.round(baseDamage(def.type, left, att, ax, ay, rankOf(def))));
    }
  }
  return { dmg, counter };
}
function rollDamage(base, maxHp) {
  if (base <= 0) return 0;
  return Math.max(0, Math.min(maxHp, Math.round(base * (0.9 + Math.random() * 0.2))));
}
function resolveAttack(att, def) {
  const esc = UNITS[att.type].cls === 'air' ? carrierEscort(def) : null;
  const escU = esc ? esc.unit : null;
  const attAura = unitAura(att);
  const evaded = Math.random() < RANKS[rankOf(def)].evade;
  let rawDmg = baseDamage(att.type, att.hp, def, def.x, def.y, rankOf(att)) * attAura.atkMod;
  if (escU) rawDmg *= (esc.dist === 0 ? 0.65 : 0.80); // 護衛戰機巡邏防空攔截
  const dmg = evaded ? 0 : rollDamage(rawDmg, def.hp);
  def.hp -= dmg;
  let counter = 0, countered = false, cEvaded = false;
  if (def.hp > 0 && canCounter(def, att, att.x, att.y)) {
    countered = true;
    cEvaded = Math.random() < RANKS[rankOf(att)].evade;
    if (escU) {
      counter = cEvaded ? 0 : rollDamage(baseDamage(escU.type, escU.hp, att, att.x, att.y, rankOf(escU)), att.hp);
      att.hp -= counter;
      if (!noRank(escU)) escU.xp = (escU.xp || 0) + counter * 5 + (att.hp <= 0 ? 15 : 0);
    } else {
      counter = cEvaded ? 0 : rollDamage(baseDamage(def.type, def.hp, att, att.x, att.y, rankOf(def)), att.hp);
      att.hp -= counter;
    }
  }
  // 經驗值：造成傷害、擊破、反擊與承受攻擊都會累積
  const r0 = [rankOf(att), rankOf(def)];
  if (!noRank(att)) att.xp = (att.xp || 0) + dmg * 5 + (def.hp <= 0 ? 15 : 0) + counter;
  if (!noRank(def)) def.xp = (def.xp || 0) + counter * 5 + (att.hp <= 0 ? 15 : 0) + dmg;
  const promoted = [att, def].filter((u, k) => u.hp > 0 && rankOf(u) > r0[k]);
  for (const u of promoted) addLog(`${SIDES[u.side].name}${UNITS[u.type].name} 升級為${RANKS[rankOf(u)].name}！`, u.side);
  const an = `${SIDES[att.side].name}${UNITS[att.type].name}`, dn = `${SIDES[def.side].name}${UNITS[def.type].name}`;
  let msg = `${an} 攻擊 ${dn}，造成 ${dmg} 傷害`;
  if (escU) {
    msg += `（CAP 護衛機 ${UNITS[escU.type].name} 實施防空攔截，減免傷害並反擊 ${counter}！）`;
    if (typeof fxText === 'function') {
      const [ex, ey] = tileCenter(def.x, def.y);
      fxText(ex, ey, '護衛攔截！', '#38bdf8');
    }
  }
  if (def.hp <= 0) msg += '，擊破！';
  else if (countered && !escU) msg += `；反擊 ${counter}` + (att.hp <= 0 ? '，攻擊方被擊破！' : '');
  if (evaded) msg += '（迴避！）';
  addLog(msg, att.side);
  return { dmg, counter, countered, evaded, cEvaded, promoted };
}
function removeDead() {
  for (const u of G.units) if (u.hp <= 0) {
    clearCapture(u);
    if (u.cargo && u.cargo.length) addLog(`搭載的 ${u.cargo.length} 支部隊隨 ${UNITS[u.type].name} 一同損失`, u.side);
    // 澤火革「小人革面」：若敵方旗艦（航母/EUV要塞）被擊沉，敵方軍心瓦解，攻擊力下降 15%
    const ub = UNITS[u.type].base;
    if ((ub === 'carrier' || ub === 'wingman_carrier' || ub === 'euv_fortress') && G.moraleDebuff && !G.moraleDebuff[u.side]) {
      G.moraleDebuff[u.side] = 0.15;
      addLog(`【澤火革・小人革面】${SIDES[u.side].name}旗艦${UNITS[u.type].name}殞落！全軍軍心瓦解，攻擊力下降 15%！`, 1 - u.side);
      if (typeof fxText === 'function') {
        const [cx, cy] = tileCenter(u.x, u.y);
        fxText(cx, cy, '小人革面！軍心瓦解', '#ef4444');
      }
    }
  }
  G.units = G.units.filter(u => u.hp > 0);
}

// ----- 佔領與維修 -----
function canCapture(u) {
  if (!UNITS[u.type].capture) return false;
  const i = idxOf(u.x, u.y);
  return !!TERRAIN[G.terrain[i]].prop && G.owner[i] !== u.side;
}
function capturePointsLeft(u) {
  const c = G.capture[idxOf(u.x, u.y)];
  return c ? c.pts : CAPTURE_POINTS;
}
// 回傳 true = 佔領完成
function doCapture(u) {
  const i = idxOf(u.x, u.y);
  let c = G.capture[i];
  if (!c) c = G.capture[i] = { uid: u.id, side: u.side, pts: CAPTURE_POINTS };
  else { c.uid = u.id; c.side = u.side; }
  c.pts -= u.hp;
  const tname = TERRAIN[G.terrain[i]].name;
  if (c.pts > 0) {
    addLog(`${SIDES[u.side].name}正在佔領${tname}（剩餘 ${c.pts}）`, u.side);
    return false;
  }
  const prev = G.owner[i];
  G.owner[i] = u.side;
  if (G.bNation) G.bNation[i] = u.nation || normNat(SIDES[u.side].nation);
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
// 佔領耐久持久化：部隊離開或陣亡不重置據點已損耐久/防禦度，僅解除綁定單位
function clearCapture(u) {
  for (const k in G.capture) {
    const c = G.capture[k];
    if (c && c.uid === u.id) c.uid = null;
  }
}
// 修復據點（Explicit Repair）：已損耐久之己方據點可由步兵/具佔領能力部隊修復
function canRepair(u) {
  if (!UNITS[u.type].capture) return false;
  const i = idxOf(u.x, u.y);
  return !!TERRAIN[G.terrain[i]].prop && G.owner[i] === u.side && !!G.capture[i];
}
function doRepair(u) {
  const i = idxOf(u.x, u.y);
  const c = G.capture[i];
  if (!c) return false;
  c.pts = Math.min(CAPTURE_POINTS, c.pts + u.hp);
  const tname = TERRAIN[G.terrain[i]].name;
  if (c.pts >= CAPTURE_POINTS) {
    delete G.capture[i];
    addLog(`${SIDES[u.side].name}完全修復了${tname}！`, u.side);
    return true;
  }
  addLog(`${SIDES[u.side].name}修復${tname}（耐久回升至 ${c.pts}/${CAPTURE_POINTS}）`, u.side);
  return false;
}
// 可進化的型號：需達到階級，且停在己方可補給的據點上
function evoOptions(u) {
  const d = UNITS[u.type];
  if (u.done) return [];
  const i = idxOf(u.x, u.y), t = TERRAIN[G.terrain[i]];
  if (G.owner[i] !== u.side || !t.heal || !t.heal.includes(d.cat)) return [];
  const r = rankOf(u);
  const opts = [];
  if (d.next && d.next.length) {
    for (const k of d.next) {
      if (r >= UNITS[k].tier && G.funds[u.side] >= evoCost(u, k)) opts.push(k);
    }
  }
  // 澤火革：三星王牌部隊解鎖台積電/美商科技革變
  if (r >= 3 && typeof getGeEvoTargets === 'function') {
    const geList = getGeEvoTargets(u);
    for (const gk of geList) {
      if (UNITS[gk] && G.funds[u.side] >= evoCost(u, gk) && !opts.includes(gk)) {
        opts.push(gk);
      }
    }
  }
  return opts;
}
// 進化費用：新舊型號價差（至少 100）
function evoCost(u, key) { return Math.max(100, UNITS[key].cost - UNITS[u.type].cost); }
function evolve(u, key) {
  const from = UNITS[u.type].name;
  G.funds[u.side] -= evoCost(u, key);
  u.type = key;
  const nd = UNITS[key];
  if (nd.maxHp) {
    u.maxHp = nd.maxHp;
    u.hp = nd.maxHp;
  }
  if (nd.nation) u.nation = normNat(nd.nation);
  if (nd.fuel !== undefined) u.fuel = nd.fuel;
  addLog(`${SIDES[u.side].name}${from} 革變為 ${nd.name}！`, u.side);
}
function markDone(u) {
  u.done = true;
  u.moved = true;
  clearCapture(u);
}

// ----- 生產 -----
function makeUnit(type, side, x, y, extra) {
  type = extra && extra.ally ? atype(type, side, extra.ally) : ftype(type, side);
  const def = UNITS[type] || {};
  const maxHp = (extra && extra.maxHp) || def.maxHp || 10;
  const hp = (extra && extra.hp !== undefined) ? extra.hp : maxHp;
  const nation = normNat((extra && extra.nation) || (extra && extra.ally) || def.nation || (SIDES[side] ? SIDES[side].nation : 'TW'));
  return Object.assign({ id: G.nextId++, type, side, x, y, hp, maxHp, nation, fuel: def.fuel, moved: false, done: false, xp: 0 }, extra || {});
}
// 建立部隊：支援友軍（extra.ally）與情境預載（extra.load；航母等新產/非劇本部隊預設全空甲板）
function spawnUnit(type, side, x, y, extra) {
  let { load, ...rest } = extra || {};
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
  const bn = G.bNation && G.bNation[i] ? normNat(G.bNation[i]) : (SIDES[side] ? SIDES[side].nation : 'TW');
  return Object.keys(UNITS).filter(k => {
    const uDef = UNITS[k];
    if (uDef.side !== side || uDef.tier || !t.build.includes(uDef.cat)) return false;
    if (uDef.base === 'train' && (!G.rails || !G.rails.length)) return false;
    if (uDef.nation === bn || (uDef.ally && normNat(uDef.ally) === bn)) return true;
    if ((bn === 'TSMC' || bn === 'USCORP') && uDef.nation === bn) return true;
    return !uDef.ally && (!bn || bn === SIDES[side].nation);
  });
}
// 取得某方目前無部隊駐守且資金足夠生產至少一種兵種的己方據點
function pendingProductionBases(side) {
  if (!G || !G.owner || G.funds[side] === undefined) return [];
  const funds = G.funds[side];
  const list = [];
  for (let i = 0; i < G.owner.length; i++) {
    if (G.owner[i] !== side) continue;
    const t = TERRAIN[G.terrain[i]];
    if (!t || !t.build) continue;
    const [x, y] = ixy(i);
    if (unitAt(x, y)) continue;
    const opts = buildOptions(x, y, side);
    if (opts.some(k => funds >= UNITS[k].cost)) {
      list.push({ x, y, i, t });
    }
  }
  return list;
}
function produce(type, x, y, side) {
  const d = UNITS[type];
  if (G.funds[side] < d.cost) return null;
  G.funds[side] -= d.cost;
  const bn = G.bNation ? G.bNation[idxOf(x, y)] : null;
  const u = spawnUnit(type, side, x, y, bn ? { nation: bn } : null);
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
        const cMax = c.maxHp || UNITS[c.type].maxHp || 10;
        c.hp = Math.min(cMax, c.hp + 2);
      }
    }
    const d = UNITS[u.type], i = idxOf(u.x, u.y), t = TERRAIN[G.terrain[i]];
    const onBase = G.owner[i] === s && t.heal && t.heal.includes(d.cat);
    if (d.fuel !== undefined) {
      if (onBase) u.fuel = d.fuel;
      else {
        u.fuel -= d.upkeep;
        if (u.fuel <= 0) {
          u.hp = 0;
          if (G.stats) G.stats.crashes = (G.stats.crashes || 0) + 1;
          addLog(`${SIDES[s].name}${d.name} 燃料耗盡墜毀`, s);
          continue;
        }
      }
    }
    // 航母補給與維修光環：位於己方航母上或相鄰 1 格內的友軍飛機，自動補給燃料與修復 +2 HP
    if (d.cat === 'air') {
      const nearCarrier = G.units.some(cv => cv.hp > 0 && cv.side === s && (UNITS[cv.type].base === 'carrier' || UNITS[cv.type].base === 'wingman_carrier') && hexDist(u.x, u.y, cv.x, cv.y) <= 1);
      if (nearCarrier) {
        if (d.fuel !== undefined) u.fuel = Math.min(d.fuel, u.fuel + Math.ceil(d.fuel * 0.5));
        const uMax = u.maxHp || d.maxHp || 10;
        u.hp = Math.min(uMax, u.hp + 2);
      }
    }
    const uMax = u.maxHp || d.maxHp || 10;
    if (onBase && u.hp < uMax) {
      const per = Math.ceil(d.cost / uMax);
      let h = Math.min(2, uMax - u.hp);
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
  const rawPlayers = opts.players || [{ ai: false }, { ai: true }];
  const players = rawPlayers.map(p => ({
    ai: !!p.ai,
    persona: p.persona || 'B'
  }));
  G = {
    w: m.w, h: m.h, seed: opts.seed,
    terrain: m.terrain, owner: m.owner, caps: m.caps, roads: m.roads, rails: m.rails || [],
    units: [], turn: 1, cur: 0, funds: opts.funds || [START_FUNDS, START_FUNDS],
    players, autoPilot: false, autoPilotCancel: false,
    capture: {}, winner: null, winReason: '',
    nextId: 1, log: [], missionId: opts.missionId || null, result: null, nations: opts.nations || ['TW', 'CN'],
    allies: opts.allies || [], allyAI: !!opts.allyAI,
    bNation: m.bNation ? [...m.bNation] : new Array(m.w * m.h).fill(null),
    firedEvents: [], pendingDialogs: [],
    stats: { loads: 0, unloads: 0, amphibious_captures: 0, crashes: 0 },
  };
  applyNations(G.nations, G.allies);
  for (let i = 0; i < G.owner.length; i++) {
    if (G.owner[i] >= 0 && !G.bNation[i]) {
      const nid = SIDES[G.owner[i]] ? SIDES[G.owner[i]].nation : (G.owner[i] === 0 ? 'TW' : 'CN');
      G.bNation[i] = normNat(nid);
    }
  }
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
