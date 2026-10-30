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
      if (nd < d[ni] - 1e-6) { d[ni] = nd; open.push(nd, ni); }
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

// AI 戰術風格（A 攻擊型 / B 綜合型 / C 保守型 / L 藍發風格）
const AI_PERSONAS = {
  A: {
    id: 'A', name: '攻擊型', en: 'Aggressive', badge: 'A 攻擊型',
    desc: '極限殲敵・直取斬首：以全殲敵軍部隊為最高目標，低後撤門檻，容許限定深遠突擊，主力裝甲與突擊航空兵力',
    attackWeight: 1.6, threatWeight: 0.55, decapitation: 2.2, captureWeight: 0.75, coverBonus: 0.6,
    retreatHp: 0.15, repairWeight: 0.5, mergeThreshold: 0.25,
    prodWeights: { tank: 1.5, fighter: 1.3, attacker: 1.5, bomber: 1.5, anduril_tank: 1.5, nano_swarm: 1.4, arty: 0.8, aa: 0.7, sam: 0.7, inf: 0.75 }
  },
  B: {
    id: 'B', name: '綜合型', en: 'Balanced', badge: 'B 綜合型',
    desc: '步步為營・首都推進：平衡兼顧佔領中立據點、沿推進廊道穩步擴張、多兵種協同與向敵首都推進',
    attackWeight: 1.0, threatWeight: 1.0, decapitation: 1.2, captureWeight: 1.15, coverBonus: 1.0,
    retreatHp: 0.30, repairWeight: 1.0, mergeThreshold: 0.50,
    prodWeights: {}
  },
  C: {
    id: 'C', name: '保守型', en: 'Conservative', badge: 'C 保守型',
    desc: '固若金湯・要塞防禦：嚴格以首都半徑 15 格內為作戰範圍，陸空比保證 10:1 以上，高門檻殘血主動後撤合流修復',
    attackWeight: 0.75, threatWeight: 1.5, decapitation: 0.6, captureWeight: 1.3, coverBonus: 1.8,
    retreatHp: 0.50, repairWeight: 2.0, mergeThreshold: 0.80,
    prodWeights: { aa: 1.6, sam: 1.6, arty: 1.5, rocket: 1.4, laser_aa: 1.6, euv_fortress: 1.6, inf: 1.3, atinf: 1.3, tank: 0.9, attacker: 0.3, bomber: 0.2, fighter: 0.4 }
  },
  L: {
    id: 'L', name: '藍發', en: 'LanFa', badge: '藍發風格',
    desc: '全能立體・極限產能投放：資金不得大於100全數換為前線部隊、全圖搶城擴張經濟、依戰場地貌自動選擇海陸空適配相剋、致死集火與殘血維修',
    attackWeight: 1.5, threatWeight: 0.75, decapitation: 3.5, captureWeight: 4.5, coverBonus: 1.5,
    retreatHp: 0.28, repairWeight: 1.8, mergeThreshold: 0.40,
    prodWeights: {}
  }
};

function getPersona(side) {
  if (!G || !G.players || !G.players[side]) return AI_PERSONAS.B;
  const p = G.players[side].persona;
  if (p === 'L' || p === 'LANFA' || p === 'lanfa' || p === '藍發') return AI_PERSONAS.L;
  return AI_PERSONAS[p] || AI_PERSONAS.B;
}

// 藍發規則 3：自動分析戰場環境與敵情相剋，動態評估海陸空適配度
function evaluateBattlefieldSuitability(s) {
  const foes = G.units.filter(u => u.side !== s);
  const mine = G.units.filter(u => u.side === s);
  const totalTiles = G.w * G.h;
  let seaTiles = 0, roughTiles = 0, openTiles = 0;
  for (let i = 0; i < totalTiles; i++) {
    const t = G.terrain[i];
    if (['sea', 'deep', 'reef', 'coast'].includes(t)) seaTiles++;
    else if (['mountain', 'forest'].includes(t)) roughTiles++;
    else if (['plain', 'road'].includes(t)) openTiles++;
  }
  const seaRatio = seaTiles / totalTiles;
  const roughRatio = roughTiles / totalTiles;
  const openRatio = openTiles / totalTiles;

  // 檢查己方與目標據點是否隔海
  let seaGap = false;
  const propGoals = new Map();
  for (let i = 0; i < G.owner.length; i++) if (TERRAIN[G.terrain[i]].prop && G.owner[i] !== s) propGoals.set(i, 0);
  const footField = propGoals.size ? distField(propGoals, 'foot') : null;
  if (footField && mine.some(u => UNITS[u.type].cat === 'land' && footField[idxOf(u.x, u.y)] === Infinity)) {
    seaGap = true;
  }

  // 敵軍分類計數
  const ecls = c => foes.filter(u => UNITS[u.type].cls === c).length;
  const enemyAir = ecls('air');
  const enemyHard = ecls('hard');
  const enemySoft = ecls('soft');
  const enemyShip = ecls('ship');
  const enemyAA = foes.filter(u => ['aa', 'sam', 'laser_aa'].includes(UNITS[u.type].base)).length;

  // 己方生產據點種類檢查
  const ownB = cat => G.owner.filter((o, idx) => o === s && TERRAIN[G.terrain[idx]].build && TERRAIN[G.terrain[idx]].build.includes(cat)).length;
  const hasPorts = ownB('sea') > 0;
  const hasAirports = ownB('air') > 0;
  const hasFactories = ownB('land') > 0;

  // 1. 海軍適配度 (Navy Suitability)
  let navyScore = 1.0;
  if (!hasPorts || seaRatio < 0.10) {
    navyScore = 0.05;
  } else if (seaGap || seaRatio >= 0.25) {
    navyScore = 2.4 + enemyShip * 0.7;
  } else {
    navyScore = 0.6 + enemyShip * 0.5;
  }

  // 2. 空軍適配度 (Air Suitability)
  let airScore = 1.0;
  if (!hasAirports) {
    airScore = 0.1;
  } else {
    if (enemyAA >= 3) {
      airScore = 0.65;
    } else if (enemyAA <= 1) {
      airScore = 1.85 + (enemyHard >= 2 ? 0.4 : 0);
    } else {
      airScore = 1.1;
    }
    if (roughRatio > 0.25) airScore += 0.5;
    if (enemyAir >= 2) airScore += 0.4;
  }

  // 3. 甲軍/重裝甲適配度 (Armor Suitability)
  let armorScore = 1.0;
  if (!hasFactories) {
    armorScore = 0.1;
  } else if (seaGap && seaRatio > 0.38) {
    armorScore = 0.4;
  } else {
    if (openRatio > 0.32) armorScore += 0.8;
    if (enemyHard >= 2) armorScore += 0.5;
    if (roughRatio > 0.35) armorScore -= 0.3;
  }

  return { navyScore, airScore, armorScore, enemyAir, enemyHard, enemySoft, enemyShip, enemyAA, seaGap };
}

function aiGoals(u, baseField) {
  const d = UNITS[u.type], s = u.side, goals = new Map();
  const add = (i, off) => { if (!goals.has(i) || goals.get(i) > off) goals.set(i, off); };
  const here = idxOf(u.x, u.y);
  const mg = missionAIGoals(u);
  if (u.vip && mg.length) return { goals: new Map(mg), mode: 'vip' };
  // 沒有護送目標的要員（如指揮組）：退守己方首都隱蔽，不主動出擊
  if (u.vip) {
    const home = new Map();
    G.terrain.forEach((t, i) => { if (t === 'capital' && G.owner[i] === s) home.set(i, 0); });
    if (home.size) return { goals: home, mode: 'vip' };
  }
  const nat = unitNation(u);
  const doc = getDoctrine(nat);
  const persona = getPersona(s);
  const uMax = u.maxHp || d.maxHp || 10;
  // 藍發策略：廉價奪城步兵決死不退 (0%後撤門檻)；高代價主力裝甲/戰機/艦艇受損 (<28% HP) 則後撤修復
  const effRetreatHp = persona.id === 'L' ? ((d.cost <= 160 || d.capture) ? 0 : 0.28) : (persona.id === 'C' ? Math.max(doc.retreatHp !== undefined ? doc.retreatHp : 0.3, persona.retreatHp) : Math.min(doc.retreatHp !== undefined ? doc.retreatHp : 0.3, persona.retreatHp));
  const hurt = effRetreatHp > 0 && u.hp <= uMax * effRetreatHp;
  const rTurns = baseField ? Math.ceil(Math.max(1, baseField[here]) / d.move) : 1;
  const fuelMargin = doc.strictRtb ? 6 : 4;
  // A 攻擊型：容許在當前戰役累計燃料耗盡墜機 < 3 次前放寬返航撤退檢查；達 3 次後嚴格執行燃料安全
  const curCrashes = (G.airFuelCrashCount && G.airFuelCrashCount[s]) || 0;
  const allowAirStrike = persona.id === 'A' && d.cat === 'air' && curCrashes < 3;
  const lowFuel = baseField && !allowAirStrike && u.fuel <= baseField[here] + d.upkeep * (rTurns + 2) + fuelMargin;
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
      let pri = isCap ? -5 * doc.decapitation * persona.decapitation : (isFab ? -4 * doc.decapitation : (G.owner[i] >= 0 ? -1 : Math.round(0 - (persona.captureWeight - 1) * 3)));
      // B 綜合型：加重步步為營推進廊道據點（沿線城市、工廠、機場）佔領權重
      if (persona.id === 'B') pri -= 3;
      // 藍發規則 2：多佔領城市增加生產力。大幅提高全圖據點搶奪優先度
      if (persona.id === 'L') {
        const isNeutral = G.owner[i] < 0;
        pri = isCap ? -28 : (isFab ? -24 : (isNeutral ? -16 : -20));
      }
      add(i, pri);
    }
  }
  for (const e of G.units) if (e.side !== s && canHit(u.type, e)) {
    // A 攻擊型：以全殲敵軍部隊為最高目標 (殲滅優先)；藍發：集火殘血致死與奪城敵軍
    let foePri = e.vip ? -6 : d.capture ? 4 : (persona.id === 'A' ? -6 : persona.id === 'B' ? -2 : 0);
    if (persona.id === 'L' && !d.capture) {
      foePri = (e.hp <= 4) ? -8 : (G.capture[idxOf(e.x, e.y)] ? -9 : -5);
    }
    add(idxOf(e.x, e.y), foePri);
  }
  if (!d.capture && d.cat !== 'air') {
    for (let i = 0; i < G.owner.length; i++) {
      if (G.owner[i] === 1 - s) {
        // B 綜合型 / 藍發：持續向敵方首都與前線據點推進掩護
        const bOff = (persona.id === 'B' || persona.id === 'L') ? (G.terrain[i] === 'capital' ? -2 : 1) : (G.terrain[i] === 'capital' ? 2 : 5);
        add(i, bOff);
      } else if (persona.id === 'L' && G.owner[i] < 0 && TERRAIN[G.terrain[i]].prop) {
        add(i, 2); // 藍發策略：非步兵主力向中立城市周圍前進清除威脅
      }
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
  const persona = getPersona(s);
  const myHqIdx = G.caps ? G.caps[s] : -1;
  const myHqXy = myHqIdx >= 0 ? ixy(myHqIdx) : null;
  const curAirCrashes = (G.airFuelCrashCount && G.airFuelCrashCount[s]) || 0;
  const allowAirStrike = persona.id === 'A' && d.cat === 'air' && curAirCrashes < 3;

  for (const [i, v] of reach) {
    if (!v.canStop) continue;
    const [x, y] = ixy(i);
    // C 保守型：硬性限制 15 格首都防禦半徑（Hard 15-Tile HQ Tether）
    if (persona.id === 'C' && myHqXy && hexDist(x, y, myHqXy[0], myHqXy[1]) > 15) continue;
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
    const t = TERRAIN[G.terrain[i]];
    const consider = (sc, act) => { if (sc > best.score) best = { score: sc, dest: i, act }; };
    const doc = getDoctrine(unitNation(u));
    let base = field[i] === Infinity ? -600 : -field[i] * (mode === 'retreat' ? 25 : mode === 'vip' || mode === 'deliver' || mode === 'pickup' ? 14 : 9 * ag);
    if (d.cat === 'land') base += t.def * 0.4 * (doc.coverBonus || 1.0) * persona.coverBonus;
    base += missionHoldBonus(u, i);
    const thrW = mode === 'retreat' || mode === 'vip' || d.carry ? 2.6 : isIndirect(u.type) ? 2.2 : u.hp <= 5 ? 1.2 : 0.5;
    base -= threatAt(u, x, y, enemies) * d.cost / 100 * thrW * persona.threatWeight / (mode === 'attack' || mode === 'deliver' ? ag : 1);
    if (t.build && G.owner[i] === s && d.cat !== 'air') base -= persona.id === 'L' ? 95 : 45;
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
      // A 攻擊型：在當前戰役累計墜機 < 3 時，放寬返航油量扣分（allowAirStrike），可發動單向深遠突擊
      if (u.fuel - v.cost < need) {
        if (!allowAirStrike) {
          base -= 4000 + Math.min(3000, (need - (u.fuel - v.cost)) * 120);
        } else {
          base -= 300 + (need - (u.fuel - v.cost)) * 15;
        }
      }
      if (t.heal && t.heal.includes('air') && G.owner[i] === s) {
        if (mode === 'retreat') base += 1200;
        else if (u.fuel < d.fuel * 0.7 || u.hp < 8) base += 220;
        else base -= 200;
      }
    }
    base += Math.random() * 2;

    consider(base, null);
    if (d.capture && t.prop && G.owner[i] !== s) {
      let cs = (persona.id === 'L' ? 1400 : 350) + (G.owner[i] >= 0 ? (persona.id === 'L' ? 350 : 120) : (persona.id === 'L' ? 250 : 0)) + (G.terrain[i] === 'capital' ? (3000 * persona.decapitation) : 0);
      const c = G.capture[i];
      if (c && c.pts < CAPTURE_POINTS) cs += (persona.id === 'L' ? 1500 : 400) + (CAPTURE_POINTS - c.pts) * 20;
      cs += missionCaptureBonus(u, i);
      consider(base + cs * persona.captureWeight, { kind: 'capture' });
    } else if (d.capture && t.prop && G.owner[i] === s && G.capture[i]) {
      let rs = 300 + (G.terrain[i] === 'capital' ? 2000 : 0) + (CAPTURE_POINTS - G.capture[i].pts) * 25;
      consider(base + rs * persona.repairWeight, { kind: 'repair' });
    }
    if (mode !== 'vip' && (!isIndirect(u.type) || i === start)) {
      for (const e of targetsFrom(u, x, y)) {
        const f = forecast(u, e, x, y);
        if (f.dmg === 0) continue;
        const ec = UNITS[e.type].cost;
        let val = (f.dmg * ec / 10 * ag + (f.dmg >= e.hp ? ec * (persona.id === 'L' ? 1.6 : 0.4) : 0) - f.counter * d.cost / 10 * 0.9 / ag) * persona.attackWeight;
        if (persona.id === 'L') {
          if (f.dmg >= e.hp) val += 400; // 藍發策略 4：集火滅頂
          else if (e.hp <= 5) val += (6 - e.hp) * 45; // 殘血優先補刀
          if (G.capture[idxOf(e.x, e.y)]) val += 500; // 保城殲滅奪城敵軍
        } else {
          if (G.capture[idxOf(e.x, e.y)]) val += 250;
        }
        if (e.vip) val += 500;
        consider(base + val + 30 * ag, { kind: 'attack', target: e });
      }
    }
  }

  if (token !== gameToken || (G && G.autoPilotCancel)) return;
  if (best.dest !== start) {
    ensureVisible(u.x, u.y);
    await doMove(u, reachPath(reach, best.dest), reach.get(best.dest).cost, SETTINGS.aiStep);
  }
  if (token !== gameToken || (G && G.autoPilotCancel)) return;
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
  } else if (act && act.kind === 'repair') {
    const [cx, cy] = tileCenter(u.x, u.y);
    const full = doRepair(u);
    if (full && typeof sfx === 'function') sfx('capture');
    const pts = G.capture[idxOf(u.x, u.y)] ? G.capture[idxOf(u.x, u.y)].pts : CAPTURE_POINTS;
    fxText(cx, cy, full ? '修復完畢！' : `修復中 ${pts}/${CAPTURE_POINTS}`, SIDES[s].light);
    await sleep(SETTINGS.aiStep * 2);
  }
  // 殘血非破壞性合流（Non-destructive Merge）：若部隊受損且相鄰有同型受損友軍，主動觸發合流以最大化生存率
  const uMax = u.maxHp || d.maxHp || 10;
  const shouldTryMerge = (persona.id === 'C' && u.hp < uMax) || (u.hp <= uMax * (persona.mergeThreshold || 0.5));
  if (shouldTryMerge && !d.vip && !u.vip) {
    for (const [nx, ny] of neighbors(u.x, u.y)) {
      const o = unitAt(nx, ny);
      if (o && o !== u && canMerge(o, u)) {
        mergeInto(u, o);
        if (typeof sfx === 'function') sfx('build');
        const [mx, my] = tileCenter(o.x, o.y);
        fxText(mx, my, `合流！${o.hp}`, SIDES[s].light);
        break;
      }
    }
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
    const myLand = G.units.filter(u => u.side === s && UNITS[u.type].cat === 'land').length;
    const persona = getPersona(s);
    // C 保守型：陸空比保證 10:1 (Land : Air >= 10 : 1)，當前空軍數量若超過或等於 Math.floor(myLand / 10)，禁止生產飛機
    const conservativeAirBlocked = persona.id === 'C' && (myLand < 10 || myAir >= Math.floor(myLand / 10));
    const airFull = conservativeAirBlocked || myAir >= Math.max(2, Math.ceil(airBases * 1.4));
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
    if (persona.id === 'L') {
      const suit = evaluateBattlefieldSuitability(s);
      // 藍發規則 2：多佔領城市增加生產力。若地圖上有未佔領城市/工廠，強烈提高奪城部隊比重
      if (openProps > 0) {
        const neededCapturers = Math.max(3, Math.min(10, Math.ceil(openProps * 0.8)));
        if (capturers < neededCapturers) {
          w.inf = 10;
          w.wafer_inf = 8;
          w.marine = (suit.seaGap || suit.navyScore > 1.2) ? 9 : 5;
          w.truck = (!suit.seaGap && longMarch && capturers >= 1) ? 3.0 : 1.2;
          w.lst = (suit.seaGap && capturers >= 1) ? 3.5 : 1.0;
        }
      }
      // 藍發規則 3：自動選擇戰場適合用空軍、甲軍還是海軍，並動態實施兵種相剋
      // 甲軍（重裝甲/主力戰車/突擊車）
      w.tank *= suit.armorScore * (1 + suit.enemyHard * 0.25);
      w.anduril_tank *= suit.armorScore * 1.3;
      w.euv_fortress *= suit.armorScore * 1.2;
      w.recon *= suit.armorScore * 0.9;

      // 空軍（空優戰機/強擊機/直升機/轟炸機/奈米蜂群/忠誠僚機母艦）
      w.fighter *= suit.airScore * (1 + suit.enemyAir * 0.5);
      w.attacker *= suit.airScore * (1 + (suit.enemyHard + suit.enemyShip) * 0.35);
      w.heli *= suit.airScore * (suit.enemyAA >= 2 ? 0.4 : 1.3);
      w.bomber *= suit.airScore * (suit.enemyAA >= 2 ? 0.3 : 1.4);
      w.nano_swarm *= suit.airScore * 1.2;
      w.wingman_carrier *= suit.airScore * 1.3;

      // 海軍（驅逐艦/無人狼群/航母/登陸艦）
      w.destroyer *= suit.navyScore * (1 + suit.enemyShip * 0.6);
      w.usv_wolfpack *= suit.navyScore * 1.4;
      w.lst *= suit.navyScore * (suit.seaGap ? 2.5 : 0.8);
      if (suit.seaGap || suit.navyScore > 1.2) w.marine *= 2.0;

      // 敵情相剋火網配置
      if (suit.enemyAir >= 2) {
        w.aa *= 2.2;
        w.sam *= 2.5;
        w.laser_aa *= 2.8;
      }
      if (suit.enemyHard >= 3) {
        w.atinf *= 2.2;
        w.attacker *= 1.6;
      }
      // 間接砲兵掩護
      w.arty *= 1.4;
      w.rocket *= 1.3;
      w.palantir_arty *= 1.8;
    }
    let opts = buildOptions(x, y, s).filter(k => UNITS[k].cost <= f && w[UNITS[k].base] > 0);
    // C 保守型：硬性保障陸空比 >= 10:1，若產出該空軍會導致 Land : Air < 10:1，嚴格剔除
    if (persona.id === 'C') {
      opts = opts.filter(k => {
        if (UNITS[k].cat === 'air') {
          return myLand >= (myAir + 1) * 10;
        }
        return true;
      });
    }
    if (!opts.length) continue;
    let total = 0;
    const siteNat = G.bNation && G.bNation[i] ? normNat(G.bNation[i]) : G.nations[s];
    const ws = opts.map(k => {
      const natPref = (NATIONS[siteNat] && NATIONS[siteNat].prefer && NATIONS[siteNat].prefer[UNITS[k].base]) || (NATIONS[G.nations[s]] && NATIONS[G.nations[s]].prefer && NATIONS[G.nations[s]].prefer[UNITS[k].base]) || 1;
      const personaPref = (persona.prodWeights && persona.prodWeights[UNITS[k].base]) || 1.0;
      let v = w[UNITS[k].base] * natPref * personaPref * (1 + UNITS[k].cost / 1000 * Math.min(2, f / 2500));
      if (isIndirect(k) && cnt(UNITS[k].base) >= 4) v *= 0.3;
      total += v;
      return v;
    });
    let r = Math.random() * total, pick = opts[0];
    for (let k = 0; k < opts.length; k++) { r -= ws[k]; if (r <= 0) { pick = opts[k]; break; } }
    produce(pick, x, y, s);
  }

  // 藍發規則 1：不得讓錢大於 100。只要有可用生產點且資金 > 100，全力爆兵直到資金 <= 100 或無可用據點
  const persona = getPersona(s);
  if (persona.id === 'L' && G.funds[s] > 100) {
    const remainingSites = [];
    for (let i = 0; i < G.owner.length; i++) {
      const [x, y] = ixy(i);
      if (buildOptions(x, y, s).length) remainingSites.push(i);
    }
    remainingSites.sort((a, b) => (footField ? footField[a] - footField[b] : 0));
    for (const i of remainingSites) {
      if (G.funds[s] <= 100) break;
      const [x, y] = ixy(i);
      const f = G.funds[s];
      const opts = buildOptions(x, y, s).filter(k => UNITS[k].cost <= f);
      if (!opts.length) continue;
      opts.sort((a, b) => {
        const da = UNITS[a], db = UNITS[b];
        const canDrainA = (f - da.cost <= 100) ? 2.5 : 1.0;
        const canDrainB = (f - db.cost <= 100) ? 2.5 : 1.0;
        return (db.cost * canDrainB) - (da.cost * canDrainA);
      });
      produce(opts[0], x, y, s);
    }
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
    if (token !== gameToken || G.winner != null || (G && G.autoPilotCancel)) return;
    if (u.hp <= 0) continue;
    await aiAct(u, token);
    checkVictory();
    if (G && G.autoPilotCancel) return;
  }
  if (token !== gameToken || G.winner != null || (G && G.autoPilotCancel)) return;
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
