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
  // 若所有機場皆被佔用，退而將所有己方機場列為集結點（偏移 +6）避免無目標迷航
  if (cat === 'air' && !m.size) {
    for (let i = 0; i < G.owner.length; i++) {
      const t = TERRAIN[G.terrain[i]];
      if (G.owner[i] === side && t.heal && t.heal.includes('air')) m.set(i, 6);
    }
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

// 各國專屬 AI 作戰教條（Country-Specific Doctrines）
const AI_DOCTRINES = {
  CN: { // PLA: 登陸矛頭與斬首打擊（優先奪取首都/TSMC晶圓廠、兩棲搶灘護航、海空飽和打擊）
    decapitation: 3.2, amphibious: 2.4, retreatHp: 0.15, coverBonus: 1.0, indirectPref: 1.5,
  },
  KP: { // PRK: 狂熱人海衝鋒與火砲飽和（零後撤門檻、決不後撤、火箭火砲壓制）
    decapitation: 1.2, amphibious: 1.0, retreatHp: 0.0, coverBonus: 0.8, indirectPref: 2.2,
  },
  RU: { // RUS: 重裝堡壘突進與遠程打擊（殘血 <45% 主動後撤後方城市修整、重轟炸機與巡洋艦縱深攻擊）
    decapitation: 1.5, amphibious: 1.2, retreatHp: 0.45, coverBonus: 1.3, indirectPref: 2.0,
  },
  VN: { // VNM: 叢林島礁游擊與伏擊（高度依賴森林/山岳掩護、避開平原正交裝甲、伏擊補給線）
    decapitation: 1.0, amphibious: 1.8, retreatHp: 0.25, coverBonus: 3.5, indirectPref: 1.0,
  },
  JP: { // JPN: 海空防空之盾（優先攔截空襲與反艦、護衛島礁與港口外圍）
    decapitation: 1.0, amphibious: 1.0, retreatHp: 0.3, coverBonus: 1.0, antiAirShip: 2.5,
  },
  KR: { // KOR: 重裝甲砲兵反擊（K2與K9集火反擊敵方人海與砲兵陣地）
    decapitation: 1.3, amphibious: 1.0, retreatHp: 0.25, coverBonus: 1.2, armorCounter: 2.5,
  },
  US: { // USA: 高精確長程打擊與航母空優（長程防區外打擊、嚴格返航油量控管、艦隊護衛）
    decapitation: 2.2, amphibious: 1.8, retreatHp: 0.35, strictRtb: true, carrierStand: 2.5,
  },
  USCORP: { // 美商國防: 演算法主宰與自主狼群（AI自律無人協同、軌道衛星導引精準獵殺）
    decapitation: 2.5, amphibious: 1.8, retreatHp: 0.25, strictRtb: true, carrierStand: 2.5,
  },
  TSMC: { // 台積電: 矽盾神山防禦與雷射防空（守護核心晶圓廠、雷射防空截擊、EUV堡壘定點防禦）
    decapitation: 1.0, amphibious: 1.0, retreatHp: 0.3, coverBonus: 1.5,
  },
  TW: { // 國軍: 固守台澎島嶼防空網（防空飛彈與岸防阻截、灘頭防衛）
    decapitation: 1.0, amphibious: 1.0, retreatHp: 0.3, coverBonus: 1.5,
  },
};
function unitNation(u) {
  if (!u) return 'TW';
  if (u.nation) return normNat(u.nation);
  const d = UNITS[u.type];
  if (d && d.ally) return normNat(d.ally);
  if (d && d.nation) return normNat(d.nation);
  return SIDES[u.side] && SIDES[u.side].nation ? normNat(SIDES[u.side].nation) : 'TW';
}
function getDoctrine(nat) {
  const nid = normNat(nat);
  return AI_DOCTRINES[nid] || AI_DOCTRINES.TW;
}

function aiGoals(u, baseField) {
  const d = UNITS[u.type], s = u.side, goals = new Map();
  const add = (i, off) => { if (!goals.has(i) || goals.get(i) > off) goals.set(i, off); };
  const here = idxOf(u.x, u.y);
  const mg = missionAIGoals(u);
  if (u.vip && mg.length) return { goals: new Map(mg), mode: 'vip' };
  const nat = unitNation(u);
  const doc = getDoctrine(nat);
  const uMax = u.maxHp || d.maxHp || 10;
  const hurt = doc.retreatHp > 0 && u.hp <= uMax * doc.retreatHp;
  const rTurns = baseField ? Math.ceil(Math.max(1, baseField[here]) / d.move) : 1;
  const fuelMargin = doc.strictRtb ? 6 : 4;
  const lowFuel = baseField && u.fuel <= baseField[here] + d.upkeep * (rTurns + 2) + fuelMargin;
  if (hurt || lowFuel) {
    const bases = ownBases(s, d.cat, u);
    if (bases.size && !(d.capture && canCapture(u))) return { goals: bases, mode: 'retreat' };
  }
  // 地面/兩棲運輸工具（非航母）：空載時尋找待接運的己方地面部隊；滿載或已載人時開往目標島嶼/前線海灘
  if (d.carry && !d.carry.deck) {
    const cargo = u.cargo || [];
    if (!cargo.length) {
      const pGoals = new Map();
      for (let i = 0; i < G.owner.length; i++) if (TERRAIN[G.terrain[i]].prop && G.owner[i] !== s) pGoals.set(i, 0);
      for (const e of G.units) if (e.side !== s && UNITS[e.type].cat === 'land') pGoals.set(idxOf(e.x, e.y), 2);
      const pf = pGoals.size ? distField(pGoals, 'foot') : null;
      for (const a of G.units) {
        if (a === u || a.side !== s || !canLoad(u, a)) continue;
        const ad = UNITS[a.type], ai = idxOf(a.x, a.y), fDist = pf ? pf[ai] : Infinity;
        if (fDist <= ad.move * 2) continue;
        // 優先接運隔海（fDist === Infinity）或遠離前線的步兵/佔領部隊與裝甲部隊
        let pri = (ad.capture ? -6 : -2) + (fDist === Infinity ? -4 : 0);
        if (d.cat === 'sea') {
          for (const [nx, ny] of neighbors(a.x, a.y)) if (moveCost(G.terrain[idxOf(nx, ny)], 'sea') !== Infinity) add(idxOf(nx, ny), pri);
          if (moveCost(G.terrain[ai], 'sea') !== Infinity) add(ai, pri - 1);
        } else {
          add(ai, pri);
        }
      }
      if (goals.size) return { goals, mode: 'pickup' };
    } else {
      const hasCap = cargo.some(c => UNITS[c.type].capture);
      const cmt = cargo[0] ? UNITS[cargo[0].type].mt : 'foot';
      const addLanding = (ti, off) => {
        if (d.carry.runway) {
          if (TERRAIN[G.terrain[ti]].prop) add(ti, off);
          return;
        }
        if (d.cat === 'sea') {
          for (const [nx, ny] of neighbors(...ixy(ti))) {
            const ni = idxOf(nx, ny);
            if (moveCost(G.terrain[ni], 'sea') !== Infinity) add(ni, off);
          }
        } else {
          if (moveCost(G.terrain[ti], cmt) !== Infinity) add(ti, off);
          for (const [nx, ny] of neighbors(...ixy(ti))) {
            const ni = idxOf(nx, ny);
            if (moveCost(G.terrain[ni], cmt) !== Infinity) add(ni, off + 1);
          }
        }
      };
      for (let i = 0; i < G.owner.length; i++) {
        if (!TERRAIN[G.terrain[i]].prop || G.owner[i] === s) continue;
        addLanding(i, G.terrain[i] === 'capital' ? -6 : hasCap ? -3 : 1);
      }
      for (const e of G.units) if (e.side !== s && UNITS[e.type].cat === 'land') addLanding(idxOf(e.x, e.y), hasCap ? 2 : -2);
      for (const [i, off] of mg) addLanding(i, off - 3);
      if (goals.size) return { goals, mode: 'deliver' };
    }
  }
  if (d.capture) {
    for (let i = 0; i < G.owner.length; i++) {
      if (!TERRAIN[G.terrain[i]].prop || G.owner[i] === s) continue;
      const isCap = G.terrain[i] === 'capital';
      const isFab = G.bNation && (G.bNation[i] === 'TSMC' || G.bNation[i] === 'USCORP');
      let pri = isCap ? -5 * doc.decapitation : (isFab ? -4 * doc.decapitation : (G.owner[i] >= 0 ? -1 : 0));
      add(i, pri);
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
  let field = distField(goals, d.mt);
  const start = idxOf(u.x, u.y), origDist = field[start];
  // 地面部隊若與目標隔海或距離遙遠（> 6 移動成本），自動向附近的待命運輸工具靠攏
  if (d.cat === 'land' && !d.carry && origDist > 6) {
    const tGoals = new Map();
    for (const tr of G.units) {
      if (tr.side === s && canLoad(tr, u)) {
        const ti = idxOf(tr.x, tr.y);
        if (moveCost(G.terrain[ti], d.mt) !== Infinity) tGoals.set(ti, -2);
        for (const [nx, ny] of neighbors(tr.x, tr.y)) {
          const ni = idxOf(nx, ny);
          if (moveCost(G.terrain[ni], d.mt) !== Infinity && !tGoals.has(ni)) tGoals.set(ni, 0);
        }
      }
    }
    if (tGoals.size && origDist === Infinity) field = distField(tGoals, d.mt);
    else if (tGoals.size) {
      const tf = distField(tGoals, d.mt);
      for (let k = 0; k < field.length; k++) if (tf[k] + 4 < field[k]) field[k] = tf[k] + 4;
    }
  }
  const enemies = G.units.filter(e => e.side !== s);
  const thirstyOthers = d.cat === 'air' && G.units.some(o => o !== u && o.side === s && UNITS[o.type].fuel !== undefined && o.fuel <= UNITS[o.type].fuel * 0.55);
  const ag = aiAggression(s);
  let best = { score: -Infinity, dest: start, act: null };

  for (const [i, v] of reach) {
    if (!v.canStop) continue;
    if (v.load) {
      const tr = unitById(v.load);
      if (!tr) continue;
      const tc = UNITS[tr.type].carry;
      if (d.cat === 'air' && tc.deck && (mode === 'retreat' || (baseField && u.fuel - v.cost < d.upkeep * 3))) {
        if (500 > best.score) best = { score: 500, dest: i, act: { kind: 'land', t: tr } };
      } else if (d.cat === 'land' && !tc.deck) {
        const nearFoe = enemies.some(e => hexDist(e.x, e.y, u.x, u.y) <= 3);
        const nearProp = d.capture && neighbors(u.x, u.y).some(([nx, ny]) => {
          const pi = idxOf(nx, ny);
          return TERRAIN[G.terrain[pi]].prop && G.owner[pi] !== s;
        });
        if (!nearProp && (!nearFoe || origDist === Infinity) && (origDist === Infinity || origDist > d.move * 1.5)) {
          const bScore = (origDist === Infinity ? 450 : 200 + Math.min(200, origDist * 10)) + (d.capture ? 80 : 30);
          if (bScore > best.score) best = { score: bScore, dest: i, act: { kind: 'land', t: tr } };
        }
      }
      continue;
    }
    const [x, y] = ixy(i), t = TERRAIN[G.terrain[i]];
    const consider = (sc, act) => { if (sc > best.score) best = { score: sc, dest: i, act }; };
    const doc = getDoctrine(unitNation(u));
    let base = field[i] === Infinity ? -600 : -field[i] * (mode === 'retreat' ? 25 : mode === 'vip' || mode === 'deliver' || mode === 'pickup' ? 14 : 9 * ag);
    if (d.cat === 'land') base += t.def * 0.4 * (doc.coverBonus || 1.0);
    base += missionHoldBonus(u, i);
    const thrW = mode === 'retreat' || mode === 'vip' || d.carry ? 2.6 : isIndirect(u.type) ? 2.2 : u.hp <= 5 ? 1.2 : 0.5;
    base -= threatAt(u, x, y, enemies) * d.cost / 100 * thrW / (mode === 'attack' || mode === 'deliver' ? ag : 1);
    if (t.build && G.owner[i] === s && d.cat !== 'air') base -= 45;
    if (t.prop && G.owner[i] !== s && !d.capture && !(d.carry && d.carry.runway && (u.cargo || []).length)) base -= 30;
    if (mode === 'deliver' && (u.cargo || []).length) {
      const c0 = u.cargo[0];
      const canDropHere = (!d.carry.runway || t.prop) && (d.cat !== 'air' || moveCost(G.terrain[i], UNITS[c0.type].mt) !== Infinity)
        && neighbors(x, y).some(([nx, ny]) => !unitAt(nx, ny) && moveCost(G.terrain[idxOf(nx, ny)], UNITS[c0.type].mt) !== Infinity);
      if (canDropHere && field[i] <= 2) base += 180;
    }
    if (baseField) {
      const home = baseField[i];
      const need = home + d.upkeep * Math.ceil(Math.max(1, home) / d.move) + d.upkeep * 2 + 2;
      if (u.fuel - v.cost < need) base -= 4000 + Math.min(3000, (need - (u.fuel - v.cost)) * 120);
      if (t.heal && t.heal.includes('air') && G.owner[i] === s) {
        if (mode === 'retreat') base += 1200;
        else if (u.fuel < d.fuel * 0.7 || u.hp < 8) base += 220;
        else base -= 200;
      }
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
  const enemyAir = ecls('air'), enemyHard = ecls('hard'), enemySoft = ecls('soft'), enemyShip = ecls('ship');
  const capturers = mine.filter(u => UNITS[u.type].capture || (u.cargo || []).some(c => UNITS[c.type].capture)).length;
  let openProps = 0;
  const propGoals = new Map();
  for (let i = 0; i < G.owner.length; i++) if (TERRAIN[G.terrain[i]].prop && G.owner[i] !== s) { openProps++; propGoals.set(i, 0); }
  for (const e of foes) if (UNITS[e.type].cat === 'land') propGoals.set(idxOf(e.x, e.y), 2);
  const footField = propGoals.size ? distField(propGoals, 'foot') : null;
  const seaGap = footField ? mine.some(u => UNITS[u.type].cat === 'land' && footField[idxOf(u.x, u.y)] === Infinity) : false;
  const longMarch = footField ? mine.some(u => UNITS[u.type].cat === 'land' && footField[idxOf(u.x, u.y)] > 10 && footField[idxOf(u.x, u.y)] < Infinity) : false;

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
    // 有缺油或受損飛機在附近時，讓出機場或首都供其降落補給
    if (TERRAIN[G.terrain[i]].heal.includes('air') && thirsty.some(u => {
      const dd = hexDist(u.x, u.y, x, y), ud = UNITS[u.type];
      return dd <= ud.move * 2 && (u.fuel <= dd + ud.upkeep * 4 + 4 || u.hp <= 6);
    })) continue;
    const airBases = G.owner.filter((o, idx) => o === s && TERRAIN[G.terrain[idx]].heal && TERRAIN[G.terrain[idx]].heal.includes('air')).length;
    const myAir = G.units.filter(u => u.side === s && UNITS[u.type].cat === 'air').length;
    const airFull = myAir >= Math.max(2, Math.ceil(airBases * 1.4));
    const siteDist = footField ? footField[i] : 6;
    const needSea = seaGap || siteDist === Infinity;
    const needFar = longMarch || (siteDist > 10 && siteDist < Infinity);
    const w = {
      inf: capturers < Math.min(7, 2 + openProps / 2) ? 7 : 1,
      atinf: 1 + enemyHard * 0.3,
      recon: 0.8 + enemySoft * 0.2,
      tank: 3 + enemyHard * 0.3,
      arty: 2,
      rocket: 1.4,
      aa: 0.3 + enemyAir * 1.5,
      sam: enemyAir * 1.0,
      heli: airFull ? 0 : 1.4 + enemyHard * 0.25,
      fighter: airFull ? 0 : 0.2 + enemyAir * 1.6,
      attacker: airFull ? 0 : 1 + enemyShip,
      destroyer: cnt('destroyer') >= Math.min(3, 1 + enemyShip) ? 0 : 0.3 + enemyShip * 0.8,
      stealth: airFull ? 0 : 1.2,
      bomber: airFull ? 0 : (cnt('bomber') >= 3 ? 0.3 : 1.1),
      marine: capturers < Math.min(7, 2 + openProps / 2) ? (needSea ? 4.5 : 3) : 0.8,
      lst: cnt('lst') < 2 && needSea && capturers >= 1 ? 2.2 : 0,
      thelico: !airFull && cnt('thelico') < 2 && (needSea || needFar) && capturers >= 1 ? 1.6 : 0,
      truck: cnt('truck') < 2 && !needSea && needFar && capturers >= 2 ? 1.2 : 0,
      airlift: !airFull && cnt('airlift') < 1 && (needSea || needFar) && openProps >= 3 ? 0.8 : 0,
      // 澤火革 次世代自主裝甲/晶圓防禦兵種權重
      euv_fortress: 2.2,
      wafer_inf: capturers < Math.min(7, 2 + openProps / 2) ? 4.0 : 1.5,
      laser_aa: enemyAir * 1.6 + 0.8,
      nano_swarm: airFull ? 0 : 2.0,
      anduril_tank: 2.2,
      palantir_arty: 2.0,
      wingman_carrier: airFull ? 0 : (cnt('wingman_carrier') >= 2 ? 0.4 : 1.8),
      usv_wolfpack: 1.5 + enemyShip * 0.8,
    };
    const opts = buildOptions(x, y, s).filter(k => UNITS[k].cost <= f && w[UNITS[k].base] > 0);
    if (!opts.length) continue;
    let total = 0;
    const siteNat = G.bNation && G.bNation[i] ? normNat(G.bNation[i]) : G.nations[s];
    const ws = opts.map(k => {
      const natPref = (NATIONS[siteNat] && NATIONS[siteNat].prefer && NATIONS[siteNat].prefer[UNITS[k].base]) || (NATIONS[G.nations[s]] && NATIONS[G.nations[s]].prefer && NATIONS[G.nations[s]].prefer[UNITS[k].base]) || 1;
      let v = w[UNITS[k].base] * natPref * (1 + UNITS[k].cost / 1000 * Math.min(2, f / 2500));
      if (isIndirect(k) && cnt(UNITS[k].base) >= 4) v *= 0.3;
      total += v;
      return v;
    });
    let r = Math.random() * total, pick = opts[0];
    for (let k = 0; k < opts.length; k++) { r -= ws[k]; if (r <= 0) { pick = opts[k]; break; } }
    produce(pick, x, y, s);
  }
}

// 運輸工具：接近敵軍、抵達目標據點附近或無法繼續向目標推進時，將搭載部隊卸載至與目標陸路相連的最佳相鄰格
function aiUnload(t) {
  if (!t.cargo || !t.cargo.length) return;
  const s = t.side, td = UNITS[t.type];
  const nearFoe = G.units.some(e => e.side !== s && UNITS[e.type].cat === 'land' && hexDist(e.x, e.y, t.x, t.y) <= 5);
  const nearProp = G.owner.some((o, i) => TERRAIN[G.terrain[i]].prop && o !== s && hexDist(...ixy(i), t.x, t.y) <= 4);
  if (!nearFoe && !nearProp && td.cat !== 'land') return;
  const pGoals = new Map();
  for (let i = 0; i < G.owner.length; i++) if (TERRAIN[G.terrain[i]].prop && G.owner[i] !== s) pGoals.set(i, 0);
  for (const e of G.units) if (e.side !== s && UNITS[e.type].cat === 'land') pGoals.set(idxOf(e.x, e.y), 2);
  const pf = pGoals.size ? distField(pGoals, 'foot') : null;
  for (const c of [...t.cargo]) {
    // 優先卸載在能透過陸路抵達敵方據點或敵方陸軍的陸地格（pf[i] < Infinity），避免把步兵卸回原本的出發島嶼！
    const tiles = unloadTiles(t, c).filter(i => !pf || pf[i] < Infinity);
    if (!tiles.length) continue;
    if (pf) tiles.sort((a, b) => pf[a] - pf[b]);
    if (pf && pf[tiles[0]] > 8 && !nearFoe) continue;
    if (td.cat === 'land' && !nearFoe && !nearProp && pf && pf[tiles[0]] >= pf[idxOf(t.x, t.y)]) continue;
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
    if (isIndirect(u.type)) return 0;
    if (d.carry && !d.carry.deck) return (u.cargo || []).length ? 1 : 4;
    if (d.cat === 'air') {
      const onAirBase = G.owner[idxOf(u.x, u.y)] === s && TERRAIN[G.terrain[idxOf(u.x, u.y)]].heal && TERRAIN[G.terrain[idxOf(u.x, u.y)]].heal.includes('air');
      if (onAirBase && u.fuel >= d.fuel * 0.75) return 1.2;
      if (d.fuel !== undefined && u.fuel <= d.fuel * 0.45) return 1.5;
      return 2;
    }
    return d.capture ? 3 : 1;
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
