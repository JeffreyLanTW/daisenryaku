'use strict';
// ===== 電腦 AI =====

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 多源反向 Dijkstra：每格到最近目標的移動成本。goals: Map(idx -> 起始偏移，越小越優先)
function distField(goals, mt) {
  const N = G.w * G.h, d = new Float64Array(N).fill(Infinity), done = new Uint8Array(N), open = new MinHeap();
  for (const [g, off] of goals) if (off < d[g]) d[g] = off;
  for (const [g] of goals) open.push(d[g], g);
  while (open.size) {
    const cur = open.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    const c = goals.has(cur) ? 1 : moveCost(G.terrain[cur], mt);
    if (c === Infinity) continue;
    const [cx, cy] = ixy(cur);
    for (const [nx, ny] of neighbors(cx, cy)) {
      const ni = ny * G.w + nx;
      if (done[ni] || moveCost(G.terrain[ni], mt) === Infinity) continue;
      const nd = d[cur] + c;
      if (nd < d[ni]) { d[ni] = nd; open.push(nd, ni); }
    }
  }
  return d;
}

function ownBases(side, cat, self = null) {
  const m = new Map();
  // 航母也是飛機的降落點（有空位時）
  if (cat === 'air') for (const t of G.units) {
    const c = UNITS[t.type].carry;
    if (t.side === side && c && c.deck && (t.cargo || []).length < c.cap) m.set(idxOf(t.x, t.y), 0);
  }
  for (let i = 0; i < G.owner.length; i++) {
    const t = TERRAIN[G.terrain[i]];
    if (G.owner[i] !== side || !t.heal || !t.heal.includes(cat)) continue;
    const [x, y] = ixy(i), o = unitAt(x, y);
    if (self && o && o !== self) continue;
    m.set(i, 0);
  }
  return m;
}

function threatAt(u, x, y, enemies) {
  let t = 0;
  for (const e of enemies) {
    if (!canHit(e.type, u)) continue;
    const ed = UNITS[e.type];
    const r = isIndirect(e.type) ? ed.range[1] : ed.move + ed.range[1];
    if (hexDist(e.x, e.y, x, y) <= r) t += baseDamage(e.type, e.hp, u, x, y);
  }
  return Math.min(t, 10);
}

function aiGoals(u, baseField) {
  const d = UNITS[u.type], s = u.side, goals = new Map();
  const add = (i, off) => { if (!goals.has(i) || goals.get(i) > off) goals.set(i, off); };
  const here = idxOf(u.x, u.y);
  const mg = missionAIGoals(u);
  if (u.vip && mg.length) return { goals: new Map(mg), mode: 'vip' };
  const lowFuel = baseField && u.fuel <= baseField[here] + d.upkeep * 2 + 3;
  const hurt = u.hp <= (d.capture && aiAggression(s) > 1.3 ? 1 : 3);
  if (hurt || lowFuel) {
    const bases = ownBases(s, d.cat, u);
    if (bases.size && !(d.capture && canCapture(u))) return { goals: bases, mode: 'retreat' };
  }
  if (d.capture) {
    for (let i = 0; i < G.owner.length; i++) {
      if (!TERRAIN[G.terrain[i]].prop || G.owner[i] === s) continue;
      add(i, G.terrain[i] === 'capital' ? -5 : G.owner[i] >= 0 ? -1 : 0);
    }
  }
  for (const e of G.units) if (e.side !== s && canHit(u.type, e)) add(idxOf(e.x, e.y), e.vip ? -4 : d.capture ? 4 : 0);
  if (!d.capture && d.cat !== 'air') {
    for (let i = 0; i < G.owner.length; i++) {
      if (G.owner[i] === 1 - s) add(i, G.terrain[i] === 'capital' ? 2 : 5);
    }
  }
  for (const [i, off] of mg) add(i, off);
  if (!goals.size) for (const [i] of ownBases(s, d.cat)) add(i, 0);
  return { goals, mode: 'attack' };
}

async function aiAct(u, token) {
  // 能進化就先進化（選第一個分支）
  const evo = evoOptions(u);
  if (evo.length) {
    evolve(u, evo[0]);
    if (typeof sfx === 'function') sfx('build');
    const [cx, cy] = tileCenter(u.x, u.y);
    fxText(cx, cy, '進化！', '#ffd34d');
    markDone(u);
    return;
  }
  const d = UNITS[u.type], s = u.side, W = G.w;
  if (d.carry && !d.carry.deck) aiUnload(u);
  const reach = computeReach(u);
  const baseField = d.fuel !== undefined ? distField(ownBases(s, 'air', u), 'air') : null;
  const { goals, mode } = aiGoals(u, baseField);
  const field = distField(goals, d.mt);
  const enemies = G.units.filter(e => e.side !== s);
  const start = idxOf(u.x, u.y);
  const ag = aiAggression(s);
  let best = { score: -Infinity, dest: start, act: null };

  for (const [i, v] of reach) {
    if (!v.canStop) continue;
    if (v.load) {
      const tr = unitById(v.load);
      if (d.cat === 'air' && tr && UNITS[tr.type].carry.deck && (mode === 'retreat' || (baseField && u.fuel - v.cost < d.upkeep * 3)))
        { if (500 > best.score) best = { score: 500, dest: i, act: { kind: 'land', t: tr } }; }
      continue;
    }
    const [x, y] = ixy(i), t = TERRAIN[G.terrain[i]];
    const consider = (sc, act) => { if (sc > best.score) best = { score: sc, dest: i, act }; };
    let base = field[i] === Infinity ? -600 : -field[i] * (mode === 'retreat' ? 25 : mode === 'vip' ? 14 : 9 * ag);
    if (d.cat === 'land') base += t.def * 0.4;
    base += missionHoldBonus(u, i);
    const thrW = mode === 'retreat' || mode === 'vip' || (d.carry && d.carry.deck) ? 3 : isIndirect(u.type) ? 2.2 : u.hp <= 5 ? 1.2 : 0.5;
    base -= threatAt(u, x, y, enemies) * d.cost / 100 * thrW / (mode === 'attack' ? ag : 1);
    if (t.build && G.owner[i] === s && d.cat !== 'air') base -= 45;
    if (t.prop && G.owner[i] !== s && !d.capture) base -= 30;
    if (baseField) {
      const home = baseField[i];
      if (u.fuel - v.cost < home + d.upkeep * Math.ceil(Math.max(1, home) / d.move) + 1) base -= 3000;
      if (home === 0 && mode === 'retreat') base += 500;
    }
    base += Math.random() * 2;

    consider(base, null);
    if (d.capture && t.prop && G.owner[i] !== s) {
      let cs = 350 + (G.owner[i] >= 0 ? 120 : 0) + (G.terrain[i] === 'capital' ? 3000 : 0);
      const c = G.capture[i];
      if (c && c.uid === u.id) cs += 400;
      cs += missionCaptureBonus(u, i);
      consider(base + cs, { kind: 'capture' });
    }
    if (mode !== 'vip' && (!isIndirect(u.type) || i === start)) {
      for (const e of targetsFrom(u, x, y)) {
        const f = forecast(u, e, x, y);
        if (f.dmg === 0) continue;
        const ec = UNITS[e.type].cost;
        let val = f.dmg * ec / 10 * ag + (f.dmg >= e.hp ? ec * 0.4 : 0) - f.counter * d.cost / 10 * 0.9 / ag;
        if (G.capture[idxOf(e.x, e.y)]) val += 250;
        if (e.vip) val += 500;
        consider(base + val + 30 * ag, { kind: 'attack', target: e });
      }
    }
  }

  if (token !== gameToken) return;
  if (best.dest !== start) {
    ensureVisible(u.x, u.y);
    await doMove(u, reachPath(reach, best.dest), reach.get(best.dest).cost, SETTINGS.aiStep);
  }
  if (token !== gameToken) return;
  const act = best.act;
  if (act && act.kind === 'land') { loadInto(u, act.t); refreshPanel(); return; }
  if (d.carry && !d.carry.deck) aiUnload(u);
  if (act && act.kind === 'attack' && act.target.hp > 0) {
    ensureVisible(u.x, u.y);
    await performAttack(u, act.target, SETTINGS.aiStep / 110);
  } else if (act && act.kind === 'capture') {
    const [cx, cy] = tileCenter(u.x, u.y);
    const took = doCapture(u);
    if (took && typeof sfx === 'function') sfx('capture');
    fxText(cx, cy, took ? '佔領！' : `佔領中 ${G.capture[idxOf(u.x, u.y)].pts}`, SIDES[s].light);
    await sleep(SETTINGS.aiStep * 2);
  }
  if (u.hp > 0) markDone(u);
  refreshPanel();
}

function aiProduce(s) {
  const mine = G.units.filter(u => u.side === s), foes = G.units.filter(u => u.side !== s);
  const cnt = k => G.units.filter(u => u.side === s && UNITS[u.type].base === k).length;
  const ecls = c => foes.filter(u => UNITS[u.type].cls === c).length;
  const enemyAir = ecls('air') + ecls('heli'), enemyHard = ecls('hard'), enemySoft = ecls('soft'), enemyShip = ecls('ship');
  const capturers = mine.filter(u => UNITS[u.type].capture).length;
  let openProps = 0;
  for (let i = 0; i < G.owner.length; i++) if (TERRAIN[G.terrain[i]].prop && G.owner[i] !== s) openProps++;

  const sites = [];
  for (let i = 0; i < G.owner.length; i++) {
    const [x, y] = ixy(i);
    if (buildOptions(x, y, s).length) sites.push(i);
  }
  sites.sort((a, b) => (G.terrain[a] === 'capital') - (G.terrain[b] === 'capital'));
  const thirsty = mine.filter(u => UNITS[u.type].fuel !== undefined);
  for (const i of sites) {
    const [x, y] = ixy(i);
    const f = G.funds[s];
    // 只有快沒油、而且飛得到的飛機才需要讓出降落的基地
    if (TERRAIN[G.terrain[i]].heal.includes('air') && thirsty.some(u => {
      const dd = hexDist(u.x, u.y, x, y), ud = UNITS[u.type];
      return dd <= ud.move && u.fuel <= dd + ud.upkeep * 3 + 2;
    })) continue;
    const w = {
      inf: capturers < Math.min(7, 2 + openProps / 2) ? 7 : 1,
      atinf: 1 + enemyHard * 0.3,
      recon: 0.8 + enemySoft * 0.2,
      tank: 3 + enemyHard * 0.3,
      arty: 2,
      rocket: 1.4,
      aa: 0.3 + enemyAir * 1.5,
      sam: enemyAir * 1.0,
      heli: 1.6,
      fighter: 0.2 + enemyAir * 1.6,
      attacker: 1 + enemyShip,
      destroyer: cnt('destroyer') >= Math.min(3, 1 + enemyShip) ? 0 : 0.3 + enemyShip * 0.8,
      stealth: 1.2,
      bomber: cnt('bomber') >= 3 ? 0.3 : 1.1,
      marine: capturers < Math.min(7, 2 + openProps / 2) ? 3 : 0.8,
    };
    const opts = buildOptions(x, y, s).filter(k => UNITS[k].cost <= f && w[UNITS[k].base] > 0);
    if (!opts.length) continue;
    let total = 0;
    const ws = opts.map(k => {
      const pref = NATIONS[G.nations[s]].prefer[UNITS[k].base] || 1;
      let v = w[UNITS[k].base] * pref * (1 + UNITS[k].cost / 1000 * Math.min(2, f / 2500));
      if (isIndirect(k) && cnt(UNITS[k].base) >= 4) v *= 0.3;
      total += v;
      return v;
    });
    let r = Math.random() * total, pick = opts[0];
    for (let k = 0; k < opts.length; k++) { r -= ws[k]; if (r <= 0) { pick = opts[k]; break; } }
    produce(pick, x, y, s);
  }
}

// 運輸工具：接近敵軍（6 格內）或已在陸上時卸下所有搭載部隊
function aiUnload(t) {
  if (!t.cargo || !t.cargo.length) return;
  const near = G.units.some(e => e.side !== t.side && hexDist(e.x, e.y, t.x, t.y) <= 6);
  if (!near && UNITS[t.type].cat !== 'land') return;
  for (const c of [...t.cargo]) {
    const tiles = unloadTiles(t, c);
    if (!tiles.length) break;
    unloadAt(t, c, tiles[0]);
  }
}
// 航母：讓艦載機起飛（起飛後當回合可行動）；燃料不足或受損的留在艦上補給
function aiLaunch(side, filter = () => true) {
  for (const t of G.units.filter(u => u.side === side && (u.cargo || []).length && UNITS[u.type].carry.deck && filter(u))) {
    for (const c of [...t.cargo]) {
      const cd = UNITS[c.type];
      if (c.hp < 6 || (cd.fuel !== undefined && c.fuel < cd.fuel * 0.6)) continue;
      const tiles = unloadTiles(t, c);
      if (!tiles.length) break;
      unloadAt(t, c, tiles[0]);
      c.done = c.moved = false;
    }
  }
}

async function aiTurn() {
  const token = gameToken, s = G.cur;
  await sleep(SETTINGS.aiStep * 3);
  aiLaunch(s);
  const prio = u => {
    const d = UNITS[u.type];
    return isIndirect(u.type) ? 0 : d.capture ? 3 : d.cat === 'air' ? 2 : 1;
  };
  const units = G.units.filter(u => u.side === s && !u.done).sort((a, b) => prio(a) - prio(b));
  for (const u of units) {
    if (token !== gameToken || G.winner != null) return;
    if (u.hp <= 0) continue;
    await aiAct(u, token);
    checkVictory();
  }
  if (token !== gameToken || G.winner != null) return;
  aiProduce(s);
  refreshPanel();
  await sleep(SETTINGS.aiStep * 3);
}

// 友軍（電腦指揮）：玩家結束回合前，替同陣營的援軍行動
async function aiAllyTurn() {
  const token = gameToken;
  aiLaunch(G.cur, u => UNITS[u.type].ally);
  for (const u of G.units.filter(e => e.side === G.cur && UNITS[e.type].ally && !e.done)) {
    if (token !== gameToken || G.winner != null) return;
    if (u.hp <= 0) continue;
    await aiAct(u, token);
    checkVictory();
  }
}
