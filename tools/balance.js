#!/usr/bin/env node
// 劇情平衡測試：驗證任務地圖，並讓 AI 同時扮演雙方反覆對戰，統計勝率與回合數。
// 用法：node tools/balance.js [任務id,...] [--runs N] [--flags '{"truth":true}'] [--check] [--analyze]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..', 'docs');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = +(opt('--runs') || 16);
const FLAGS = opt('--flags') ? JSON.parse(opt('--flags')) : null;
const CHECK_ONLY = args.includes('--check');
const ANALYZE = args.includes('--analyze');
const ids = args.filter((a, k) => !a.startsWith('--') && !['--runs', '--flags', '--carry', '--chain', '--games', '--turns', '--sweep', '--sizes', '--only', '--persona', '--personas', '--duel', '--nat', '--vs', '--jobs', '--tune'].includes(args[k - 1])).flatMap(a => a.split(',')).filter(Boolean);
const PERSONAS_ARG = opt('--personas') || opt('--persona') || null;

// 載入遊戲程式（不含畫面），並以空函式代替畫面相關呼叫（靜默 console 以節省輸出 token）
const noop = () => {};
const silentConsole = { log: noop, warn: noop, error: noop, info: noop };
// 可重設種子的亂數：對決模式每場重設，讓兩個版本在完全相同的骰子下比較（降低雜訊）
const SimMath = Object.create(Math);
let rngState = (Date.now() ^ (process.pid << 8)) >>> 0;
SimMath.random = () => {
  rngState = (rngState + 0x6D2B79F5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seedRandom = n => { rngState = n >>> 0; };
const ctx = {
  console: silentConsole, Math: SimMath, JSON, Set, Map, Array, Object, Promise, Infinity, Number, String, Date,
  setTimeout: f => setImmediate(f),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
vm.createContext(ctx);
for (const f of ['data', 'game', 'map', 'ai', 'campaign', 'campaign_tw', 'campaign_fs', 'campaign_ge', 'campaign_qian']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
vm.runInContext(`
  var SETTINGS = { aiStep: 0 };
  var refreshPanel = () => {}, ensureVisible = () => {}, fxText = () => {}, tileCenter = () => [0, 0], sfx = () => {};
  async function doMove(u, path, cost) {
    if (path.length < 2) return;
    const [x, y] = ixy(path[path.length - 1]);
    u.x = x; u.y = y;
    if (UNITS[u.type].fuel !== undefined) u.fuel -= cost;
    u.moved = true;
  }
  // 模擬繼承部隊：n 支、經驗 xp 的典型編組
  function synthCarry(n, xp) {
    if (!n) return null;
    // 每場隨機抽取組成，比重接近一般部隊（避免固定順序造成特定兵種剋制的偏差）
    const W = { inf: 3, tank: 2, arty: 1, aa: 1, marine: 1, atinf: 1, fighter: 1, sam: 0.5, destroyer: 0.5, heli: 0.5, rocket: 0.5, attacker: 0.5 };
    const keys = Object.keys(W), tot = keys.reduce((t, k) => t + W[k], 0);
    const units = [];
    for (let i = 0; i < n; i++) {
      let r = Math.random() * tot, pick = keys[0];
      for (const k of keys) { r -= W[k]; if (r <= 0) { pick = k; break; } }
      units.push({ base: pick, node: null, xp });
    }
    return { units, funds: 300 };
  }
  async function performAttack(att, def) {
    const r = resolveAttack(att, def);
    removeDead(); checkVictory();
    return r;
  }
`, ctx);

// --tune '{"pressRatio":1.2}'：覆寫藍發風格參數（調參用，子行程透過環境變數繼承）
if (opt('--tune')) process.env.LF_TUNE = opt('--tune');
// --no-engineer：關閉工兵規則（與遊戲預設相同）
if (args.includes('--no-engineer')) process.env.NO_ENGINEER = '1';
if (process.env.NO_ENGINEER) vm.runInContext('SETTINGS.engineer = false;', ctx);
if (process.env.LF_TUNE) vm.runInContext(`Object.assign(AI_PERSONAS.L, ${process.env.LF_TUNE});`, ctx);
vm.runInContext(`
  async function simDuel(w, h, seed, nations, personas, maxTurn) {
    newGame({ w, h, seed, players: personas.map(p => ({ ai: true, persona: p })), nations });
    while (G.winner == null && G.turn <= maxTurn) { await aiTurn(); if (G.winner != null) break; endTurn(); }
    const val = s => Math.round(G.units.filter(u => u.side === s).reduce((t, u) => t + UNITS[u.type].cost * u.hp / (u.maxHp || UNITS[u.type].maxHp || 10), 0));
    const props = s => G.owner.filter((o, i) => o === s && TERRAIN[G.terrain[i]].prop).length;
    const score = s => props(s) * 300 + val(s) + G.funds[s] * 0.5;
    return { winner: G.winner != null ? G.winner : (score(0) >= score(1) ? 0 : 1), decisive: G.winner != null, reason: G.winReason, turn: G.turn,
      props: [props(0), props(1)], val: [val(0), val(1)], funds: G.funds.slice(), units: [0, 1].map(k => G.units.filter(u => u.side === k).length) };
  }
`, ctx);
// 單場對決：以地圖種子與換邊重設亂數，同一場次在不同版本間可重現
async function runDuel(j, turns) {
  seedRandom(j.seed * 2 + j.aSide);
  return ctx.simDuel(j.w, j.h, j.seed, j.nations, j.personas, turns);
}

module.exports = { ctx, runDuel, seedRandom };
if (process.argv.includes('--duel-worker')) {
  process.on('message', async m => {
    if (m.quit) return process.exit(0);
    process.send({ k: m.k, r: await runDuel(m.job, m.turns) });
  });
} else if (require.main === module) main();

function main() {
// ----- 地圖驗證 -----
const problems = vm.runInContext(`(() => {
  const out = [];
  for (const [id, M] of Object.entries(MISSIONS)) {
    const P = CAMPAIGNS[campOf(M)].player, w = M.map[0].length;
    M.map.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if ('PQp'.includes(r[x]) && !neighbors(x, y, w, M.map.length).some(([nx, ny]) => M.map[ny][nx] === '~')) out.push(id + ' 港口 ' + x + ',' + y + ' 不臨海');
      }
      if (r.length !== w) out.push(id + ' 第' + y + '列長度 ' + r.length + ' ≠ ' + w);
      for (const ch of r) if (!LEGEND[ch]) out.push(id + ' 未知字元 ' + ch);
    });
    const flagSets = [{}, { beigan: true, yilanFast: true }, { kinmen: true, lieyu: true }, { kinmen: false }, { fleet: true }, { fleet: false, penghu: false }, { taichung: 'lost' }, { us: true, kr: true }, { de: false, us: false }];
    for (const f of flagSets) {
      const m = parseMission(M, f, P);
      G = { w: m.w, h: m.h, terrain: m.terrain };
      const removed = M.remove ? M.remove(f) : [];
      const list = [...M.units, ...(M.extra ? M.extra(f) : [])].filter(u => !(u[4] && removed.includes(u[4].tag)));
      for (const [s, type, x, y] of list) {
        if (!m.start.some(e => e[1] === y * m.w + x && e[0] === type)) out.push(id + ' ' + JSON.stringify(f) + ' ' + type + ' 被移出 ' + x + ',' + y + '（' + m.terrain[y * m.w + x] + '）');
      }
      for (const o of [...winOf(M, f), ...(M.bonus || [])]) {
        for (const [x, y] of o.at ? [o.at] : o.tiles || []) {
          const t = m.terrain[y * m.w + x];
          if ((o.type === 'capture' || o.type === 'captureAll') && !TERRAIN[t].prop) out.push(id + ' 佔領目標不是據點：' + t);
          // 任一能佔領的部隊（步兵或陸戰隊）抵達即可
          const caps = m.start.filter(e => e[2] === P && UNITS[ftype(e[0], P)].capture);
          if (!caps.length || o.type === 'hold') continue;
          const ok = caps.some(e => {
            const mt = UNITS[ftype(e[0], P)].mt, seen = new Set([e[1]]), q = [e[1]];
            while (q.length) { const c = q.shift(); for (const [nx, ny] of neighbors(c % m.w, (c / m.w) | 0, m.w, m.h)) { const n = ny * m.w + nx; if (!seen.has(n) && moveCost(m.terrain[n], mt) !== Infinity) { seen.add(n); q.push(n); } } }
            return seen.has(y * m.w + x);
          });
          if (!ok) out.push(id + ' 目標 ' + x + ',' + y + ' 佔領部隊無法抵達');
        }
      }
      for (const ev of M.events || []) for (const [s, type, x, y, ex] of ev.spawn || []) {
        const ut = ex && ex.ally ? atype(type, s, ex.ally) : ftype(type, s);
        if (moveCost(m.terrain[y * m.w + x], UNITS[ut].mt) === Infinity) out.push(id + ' 事件增援 ' + type + ' 在 ' + m.terrain[y * m.w + x]);
      }
    }
  }
  return [...new Set(out)];
})()`, ctx);
console.log(problems.length ? '地圖問題：\n  ' + problems.join('\n  ') : '地圖檢查：全部通過');
if (CHECK_ONLY) process.exit(problems.length ? 1 : 0);

// ----- 地圖拓撲遙測與平衡基準分析 (--analyze) -----
if (ANALYZE) {
  vm.runInContext(`
    function initMapForAnalyze(spec, flags, carryN, carryXp, runIdx = 0) {
      if (spec.startsWith('free')) {
        const [, dim = '24x15', sd = '42'] = spec.split(':');
        const [w, h] = dim.split('x').map(Number);
        const baseSeed = +sd || 42;
        const nats = (runIdx & 1) ? ['CN', 'TW'] : ['TW', 'CN'];
        newGame({ w: w || 24, h: h || 15, seed: baseSeed + (runIdx >> 1), players: [{ ai: true }, { ai: true }], nations: nats });
        G.pside = (runIdx & 1) ? 1 : 0;
        return { id: spec, title: '自由對戰點對稱基準', place: G.w + '×' + G.h + ' 隨機圖', type: 'free', slots: 0, xp: 0 };
      }
      const M = MISSIONS[spec];
      const cid = campOf(M), C = CAMPAIGNS[cid];
      const allIds = C.tree.flatMap(t => t[1]).filter(x => !!MISSIONS[x]);
      const k = Math.max(0, allIds.indexOf(spec));
      const defaultXp = [0, 40, 90, 140, 190, 240][Math.min(k, 5)];
      setupMission(spec, flags || {}, true, carryN > 0 ? synthCarry(carryN, carryXp || defaultXp) : null, true);
      return { id: spec, title: M.title, place: M.place, type: 'mission', slots: M.slots || 0, xp: defaultXp, horde: M.horde || 0 };
    }
    function bfsSteps(startIdx, targetSet, mt) {
      if (startIdx < 0 || !targetSet.size) return { hex: null, step: null };
      let bestHex = Infinity;
      const [sx, sy] = ixy(startIdx);
      for (const ti of targetSet) {
        const [tx, ty] = ixy(ti);
        bestHex = Math.min(bestHex, hexDist(sx, sy, tx, ty));
      }
      const N = G.w * G.h, dist = new Float64Array(N).fill(Infinity);
      const open = new MinHeap();
      dist[startIdx] = 0; open.push(0, startIdx);
      let bestStep = Infinity;
      while (open.size) {
        const cur = open.pop();
        if (targetSet.has(cur)) { bestStep = dist[cur]; break; }
        const [cx, cy] = ixy(cur);
        for (const [nx, ny] of neighbors(cx, cy)) {
          const ni = ny * G.w + nx, c = moveCost(G.terrain[ni], mt);
          if (c === Infinity) continue;
          const nd = dist[cur] + c;
          if (nd < dist[ni]) { dist[ni] = nd; open.push(nd, ni); }
        }
      }
      return { hex: bestHex === Infinity ? null : bestHex, step: bestStep === Infinity ? null : bestStep };
    }
    function analyzeStatic(spec, flags) {
      const meta = initMapForAnalyze(spec, flags, 0, 0, 0);
      const P = G.pside || 0, E = 1 - P, N = G.w * G.h;
      let land = 0;
      const fac = {
        city: [0, 0, 0],     // [P, Neutral, E]
        factory: [0, 0, 0],
        airport: [0, 0, 0],
        hqPort: [0, 0, 0],
        capital: [0, 0, 0],
        port: [0, 0, 0],
      };
      const neuAll = new Set(), contestProdAir = [new Set(), new Set()], ownProdAir = [new Set(), new Set()];
      const hqP = G.caps[P], hqE = G.caps[E];
      for (let i = 0; i < N; i++) {
        const t = G.terrain[i], o = G.owner[i];
        if (t !== 'sea') land++;
        const bucket = o === P ? 0 : o === -1 ? 1 : 2;
        if (t === 'city') fac.city[bucket]++;
        else if (t === 'factory') fac.factory[bucket]++;
        else if (t === 'airport') fac.airport[bucket]++;
        else if (t === 'capital') { fac.capital[bucket]++; fac.hqPort[bucket]++; }
        else if (t === 'port') { fac.port[bucket]++; fac.hqPort[bucket]++; }
        if (TERRAIN[t].prop) {
          if (o === -1) neuAll.add(i);
          if (t === 'factory' || t === 'airport' || t === 'port') {
            if (o !== P) contestProdAir[0].add(i);
            else if (i !== hqP) ownProdAir[0].add(i);
            if (o !== E) contestProdAir[1].add(i);
            else if (i !== hqE) ownProdAir[1].add(i);
          }
        }
      }
      const sum = a => a[0] + a[1] + a[2];
      const totalProps = sum(fac.city) + sum(fac.factory) + sum(fac.airport) + sum(fac.hqPort);
      const totalAir = sum(fac.airport);
      const totalFac = sum(fac.factory);
      const [px, py] = ixy(hqP), [ex, ey] = ixy(hqE);
      const hqDist = hexDist(px, py, ex, ey);
      const reachNeuP = bfsSteps(hqP, neuAll, 'amph'), reachNeuE = bfsSteps(hqE, neuAll, 'amph');
      const reachProdP = bfsSteps(hqP, contestProdAir[0], 'amph'), reachProdE = bfsSteps(hqE, contestProdAir[1], 'amph');
      const reachOwnP = bfsSteps(hqP, ownProdAir[0], 'foot'), reachOwnE = bfsSteps(hqE, ownProdAir[1], 'foot');

      // 兵力與資產（支援標準基準造價與國家實際造價）
      const allUnits = [];
      for (const u of G.units) {
        allUnits.push(u);
        for (const c of u.cargo || []) allUnits.push(c);
      }
      const uCount = [0, 0], uVal = [0, 0], baseVal = [0, 0];
      const clsCount = [{ soft: 0, hard: 0, air: 0, ship: 0 }, { soft: 0, hard: 0, air: 0, ship: 0 }];
      for (const u of allUnits) {
        const s = u.side === P ? 0 : 1, d = UNITS[u.type];
        uCount[s]++;
        uVal[s] += d.cost;
        baseVal[s] += (BASE_UNITS[d.base] || d).cost;
        clsCount[s][d.cls] = (clsCount[s][d.cls] || 0) + 1;
      }
      const inc = [incomeOf(P), incomeOf(E)];
      const initFunds = [G.funds[P] - (G.cur === P ? inc[0] : 0), G.funds[E] - (G.cur === E ? inc[1] : 0)];
      const assets = [uVal[0] + initFunds[0], uVal[1] + initFunds[1]];
      const unitValRatio = uVal[0] / Math.max(1, uVal[1]);
      const assetRatio = assets[0] / Math.max(1, assets[1]);
      const unitRatio = uCount[0] / Math.max(1, uCount[1]);
      const incRatio = inc[0] / Math.max(1, inc[1]);

      // 難度與生成規範分級 (Deterministic Difficulty Heuristic)
      let tier = 'Tier A (海島要衝/標準戰術)';
      if (meta.type === 'free') {
        tier = 'Tier S (點對稱競技基準)';
      } else if (N >= 1000 || meta.slots >= 5) {
        tier = 'Tier C (極限非對稱戰區)';
      } else if (land === N || incRatio >= 0.95) {
        tier = 'Tier B (陸空高壓走廊)';
      }

      return {
        meta, w: G.w, h: G.h, N, land, landPct: Math.round(land / N * 100),
        fac, totalProps, propDensity: +(totalProps / N * 100).toFixed(1), propLandDensity: +(totalProps / Math.max(1, land) * 100).toFixed(1),
        airFacRatio: +(totalAir / Math.max(1, totalFac)).toFixed(2),
        hqDist, reachNeuP, reachNeuE, reachProdP, reachProdE, reachOwnP, reachOwnE,
        uCount, clsCount, uVal, baseVal, initFunds, assets, inc,
        unitRatio: +unitRatio.toFixed(2), unitValRatio: +unitValRatio.toFixed(2), assetRatio: +assetRatio.toFixed(2), incRatio: +incRatio.toFixed(2),
        tier,
      };
    }
    async function simAnalyzeOne(spec, flags, carryN, carryXp, runIdx) {
      const meta = initMapForAnalyze(spec, flags, carryN, carryXp, runIdx);
      const maxT = meta.type === 'free' ? 60 : 160;
      let guard = 0;
      while (G.winner == null && guard++ < maxT) {
        await aiTurn();
        if (G.winner != null) break;
        endTurn();
      }
      const P = G.pside || 0, st = G.stats || {};
      let win = false;
      if (meta.type === 'free') {
        if (G.winner != null) win = G.winner === P;
        else {
          const score = s => G.owner.filter(o => o === s).length * 300 + G.units.filter(u => u.side === s).reduce((t, u) => t + UNITS[u.type].cost * u.hp / 10, 0) + G.funds[s] * 0.5;
          win = score(P) >= score(1 - P);
        }
      } else {
        win = !!(G.result && G.result.win);
      }
      return { win, turn: G.turn, loads: st.loads || 0, unloads: st.unloads || 0, amph: st.amphibious_captures || 0, crashes: st.crashes || 0 };
    }
  `, ctx);

  (async () => {
    const targets = ids.length ? ids : ['t1', 'c4', 'f6', 'free:24x15:42'];
    const fmtPNE = a => `${a[0]}:${a[1]}:${a[2]}(${a[0] + a[1] + a[2]})`;
    const fmtReach = r => r.hex == null ? '—' : `${r.hex}格/${r.step ?? '∞'}步`;
    console.log(`\n=== 地圖拓撲遙測與動態平衡基準分析 (每張地圖模擬 ${RUNS} 場) ===`);
    console.log('| 地圖 (尺寸/陸地%) | 城市 [P:N:E] | 工廠 [P:N:E] | 機場 [P:N:E] | 首都+港 [P:N:E] | 據點密度(空/廠比) | HQ奪點距離 P｜E (中立點 / 敵方廠場) | 初始兵力 P:E [步/甲/空/艦] | 兵力價值比 / 總資產比 | 首回收入比 P:E | AI勝率 (均回合/墜機) | 難度分級 |');
    console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const spec of targets) {
      const st = vm.runInContext(`analyzeStatic(${JSON.stringify(spec)}, ${JSON.stringify(FLAGS || {})})`, ctx);
      const runBatch = async (cN, cXp) => {
        const res = [];
        for (let k = 0; k < RUNS; k++) res.push(await ctx.simAnalyzeOne(spec, FLAGS || {}, cN, cXp, k));
        const w = res.filter(r => r.win).length;
        const avgT = (res.reduce((s, r) => s + r.turn, 0) / RUNS).toFixed(1);
        const avgC = (res.reduce((s, r) => s + r.crashes, 0) / RUNS).toFixed(1);
        return { pct: Math.round(w / RUNS * 100), avgT, avgC };
      };
      const baseSim = await runBatch(0, 0);
      let winStr = `${baseSim.pct}% (${baseSim.avgT}T / 墜${baseSim.avgC})`;
      if (st.meta.slots > 0) {
        const carrySim = await runBatch(8, st.meta.xp);
        winStr = `裸${baseSim.pct}% / 帶兵${carrySim.pct}% (${carrySim.avgT}T/墜${carrySim.avgC})`;
      }
      const clsP = `${st.clsCount[0].soft}/${st.clsCount[0].hard}/${st.clsCount[0].air}/${st.clsCount[0].ship}`;
      const clsE = `${st.clsCount[1].soft}/${st.clsCount[1].hard}/${st.clsCount[1].air}/${st.clsCount[1].ship}`;
      const reachStr = `中:${fmtReach(st.reachNeuP)}｜${fmtReach(st.reachNeuE)} / 廠:${fmtReach(st.reachProdP)}｜${fmtReach(st.reachProdE)}`;
      console.log(`| **${st.meta.id} ${st.meta.title}** (${st.w}×${st.h}, 陸${st.landPct}%) | ${fmtPNE(st.fac.city)} | ${fmtPNE(st.fac.factory)} | ${fmtPNE(st.fac.airport)} | ${fmtPNE(st.fac.hqPort)} | 全圖${st.propDensity}%/陸${st.propLandDensity}% (${st.airFacRatio}) | ${reachStr} | ${st.uCount[0]}:${st.uCount[1]} (${st.unitRatio}x) [${clsP} vs ${clsE}] | 兵${st.uVal[0]}:${st.uVal[1]}(${st.unitValRatio}x) / 資${st.assets[0]}:${st.assets[1]}(${st.assetRatio}x) | ${st.inc[0]}:${st.inc[1]} (${st.incRatio}x) | ${winStr} | ${st.tier} |`);
    }
    console.log('\n[地圖生成與難度分級規範 (Deterministic Map Generation & Difficulty Standard)]');
    console.log('  - Tier S (點對稱競技基準 / Skirmish): 陸地據點密度 8–14% | 空/廠比 1.0–2.0 | 據點比 [P:N:E] 完全點對稱 (1:K:1) | 兵力與收入比 1.00x | 目標AI勝率 45–55%');
    console.log('  - Tier A (海島要衝守備 / Island Choke): 陸地據點密度 8–15% | 空/廠比 1.5–2.5 | 海峽天險遲滯敵軍兩棲渡海 | 兵力價值比 0.45–0.65x / 總資產比 0.35–0.60x | 目標AI勝率 55–75%');
    console.log('  - Tier B (陸空高壓走廊 / Land Corridor): 陸地據點密度 4–8%  | 空/廠比 2.0–3.0 | 中央中立機場爭奪+敵裝甲海 | 兵力價值比 0.50–0.70x / 首回收入比 0.85–1.05x | 目標AI勝率 50–75%');
    console.log('  - Tier C (極限非對稱戰區 / Theater):    陸地據點密度 6–12% | 空/廠比 3.5–4.5 | 多點搶灘+人海倍率+老兵繼承 | 裸裝資產比 0.35–0.45x (需繼承6–8支老兵抗衡) | 目標AI勝率(帶兵) 45–75%');
  })();
  return;
}

// ----- 帶入兵力掃描：每關用不同繼承兵力測試，確認難度不會因帶入多寡而失衡 -----
if (args.includes('--sweep')) {
  const cid = opt('--sweep'), sizes = (opt('--sizes') || '0,4,8,12').split(',').map(Number);
  const LO = 45, HI = 75;
  vm.runInContext(`
    async function simOnce(id, n, xp) {
      setupMission(id, {}, true, synthCarry(n, xp), true);
      let guard = 0;
      while (G.winner == null && guard++ < 160) { await aiTurn(); if (G.winner != null) break; endTurn(); }
      return !!(G.result && G.result.win);
    }
  `, ctx);
  (async () => {
    const C = vm.runInContext(`CAMPAIGNS['${cid}']`, ctx);
    const only = opt('--only') ? opt('--only').split(',') : null;
    const allIds = C.tree.flatMap(t => t[1]).filter(id => vm.runInContext(`!!MISSIONS['${id}']`, ctx));
    console.log(`\n帶入兵力掃描：${C.title}（每格 ${RUNS} 場；目標 ${LO}–${HI}%，範圍外標 ✗）\n`);
    console.log('任務   經驗  ' + sizes.map(n => `帶入${String(n).padStart(2)}`).join('  '));
    let bad = 0;
    for (const [k, id] of allIds.entries()) {
      if (only && !only.includes(id)) continue;
      const xp = [0, 40, 90, 140, 190, 240][Math.min(k, 5)];
      const cells = [];
      for (const n of sizes) {
        if (k === 0 && n > 0) { cells.push('   —  '); continue; }
        let w = 0;
        for (let r = 0; r < RUNS; r++) if (await ctx.simOnce(id, n, xp)) w++;
        const pct = Math.round(w / RUNS * 100), ok = pct >= LO && pct <= HI;
        if (!ok) bad++;
        cells.push(`${String(pct).padStart(3)}%${ok ? ' ' : '✗'} `);
      }
      console.log(`${id.padEnd(6)} ${String(xp).padStart(4)}  ${cells.join('  ')}`);
    }
    console.log(bad ? `\n${bad} 格超出目標範圍` : '\n全部落在目標範圍內');
  })();
  return;
}

// ----- 整部戰役連續模擬：部隊與旗標延續、失敗最多重試 3 次 -----
if (args.includes('--chain')) {
  const cid = opt('--chain');
  vm.runInContext(`
    async function simMission(id, flags, inherit) {
      setupMission(id, flags, true, inherit, true);
      let guard = 0;
      while (G.winner == null && guard++ < 160) { await aiTurn(); if (G.winner != null) break; endTurn(); }
      return G.result || { win: false, obj: 'stuck', turn: G.turn };
    }
    async function simChain(cid) {
      const C = CAMPAIGNS[cid]; let id = C.start, flags = {}, inherit = null;
      const log = [];
      for (let step = 0; step < 20; step++) {
        const M = MISSIONS[id];
        let r, tries = 0, army = inherit ? inherit.units.length : 0;
        do { r = await simMission(id, flags, inherit); tries++; } while (!r.win && !M.onLose && tries < 3);
        const gained = {};
        if (r.win) for (const b of M.bonus || []) if (bonusMet(b)) gained[b.flag] = true;
        log.push({ id, win: r.win, tries, turn: r.turn, army });
        const br = r.win ? M.next(r, flags) : M.onLose ? M.onLose(r, flags) : null;
        if (!br) { log.push({ end: '失敗（重試 3 次）' }); break; }
        Object.assign(flags, br.flags || {}, gained);
        if (r.win) {
          const P = G.pside, cap = C.carryMax || CARRY_MAX;
          const list = carryCandidates(P).sort((a, b) => (b.xp || 0) - (a.xp || 0) || UNITS[b.type].cost - UNITS[a.type].cost).slice(0, cap);
          inherit = { units: list.map(u => ({ base: UNITS[u.type].base, node: UNITS[u.type].node || null, xp: u.xp || 0 })), funds: Math.min(1500, Math.round(G.funds[P] * 0.3 / 10) * 10) };
        }
        if (ENDINGS[br.to]) { log.push({ end: br.to }); break; }
        id = br.to;
      }
      return log;
    }
  `, ctx);
  (async () => {
    const stats = {}, ends = {};
    for (let k = 0; k < RUNS; k++) {
      const log = await ctx.simChain(cid);
      for (const e of log) {
        if (e.end) { ends[e.end] = (ends[e.end] || 0) + 1; continue; }
        const st = stats[e.id] = stats[e.id] || { n: 0, first: 0, win: 0, tries: 0, army: 0, turn: 0 };
        st.n++; st.tries += e.tries; st.army += e.army; st.turn += e.turn;
        if (e.win) st.win++;
        if (e.win && e.tries === 1) st.first++;
      }
    }
    console.log(`\n整部戰役模擬 ${RUNS} 次（部隊延續；失敗重試最多 3 次）\n`);
    console.log('任務   抵達  首次勝率  最終勝率  平均重試  帶入兵力  平均回合');
    for (const [id, st] of Object.entries(stats)) {
      console.log(`${id.padEnd(6)} ${String(st.n).padStart(4)}  ${String(Math.round(st.first / st.n * 100)).padStart(6)}%  ${String(Math.round(st.win / st.n * 100)).padStart(6)}%  ${(st.tries / st.n).toFixed(1).padStart(7)}  ${(st.army / st.n).toFixed(1).padStart(7)}  ${(st.turn / st.n).toFixed(1).padStart(7)}`);
    }
    console.log('\n結局分布：' + Object.entries(ends).map(([k, v]) => `${k}×${v}`).join('  '));
  })();
  return;
}

// ----- 國家平衡：自由對戰循環賽 -----
if (args.includes('--nations')) {
  const games = +(opt('--games') || 2), turns = +(opt('--turns') || 30);
  vm.runInContext(`
    async function simFree(a, b, seed, maxTurn) {
      newGame({ w: 18, h: 13, seed, players: [{ ai: true }, { ai: true }], nations: [a, b] });
      while (G.winner == null && G.turn <= maxTurn) { await aiTurn(); if (G.winner != null) break; endTurn(); }
      if (G.winner != null) return G.winner;
      const score = s => G.owner.filter(o => o === s).length * 300 + G.units.filter(u => u.side === s).reduce((t, u) => t + UNITS[u.type].cost * u.hp / 10, 0) + G.funds[s] * 0.5;
      return score(0) >= score(1) ? 0 : 1;
    }
  `, ctx);
  (async () => {
    const ids = vm.runInContext('NATION_IDS', ctx), win = {}, n = {};
    ids.forEach(i => { win[i] = 0; n[i] = 0; });
    let seed = 1000;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      for (let g = 0; g < games; g++) {
        const [a, b] = g % 2 ? [ids[j], ids[i]] : [ids[i], ids[j]];
        const w = await ctx.simFree(a, b, seed++, turns);
        win[w === 0 ? a : b]++; n[a]++; n[b]++;
      }
    }
    console.log('\n國家     勝率   場數');
    ids.map(i => [i, win[i] / n[i]]).sort((x, y) => y[1] - x[1]).forEach(([i, r]) =>
      console.log(`${i} ${vm.runInContext('NATIONS', ctx)[i].name.padEnd(5, '　')} ${String(Math.round(r * 100)).padStart(3)}%   ${n[i]}`));
  })();
  return;
}

// ----- AI 風格對決：自由對戰隨機地圖，同一張地圖雙方換邊各打一場 -----
// 用法：node tools/balance.js --duel L --vs A,B,C [--games 40] [--sizes s,m,l] [--turns 30] [--jobs 4] [--losses] [--nat TW,CN]
//   勝負：消滅對方或攻陷首都為「決定性勝利」；時限內未分勝負以 據點×300 ＋ 兵力價值 ＋ 資金×0.5 評分
if (args.includes('--duel')) {
  const DUEL_SZ = { s: [18, 13], m: [24, 15], l: [30, 19], xl: [40, 25], xxl: [54, 33] };
  const pa = opt('--duel').split(',')[0].trim().toUpperCase();
  const vs = (opt('--vs') || opt('--duel').split(',')[1] || 'B').split(',').map(x => x.trim().toUpperCase());
  const games = +(opt('--games') || 20), turns = +(opt('--turns') || 30), jobs = Math.max(1, +(opt('--jobs') || 1));
  const sizes = (opt('--sizes') || 's,m').split(',');
  const nats = opt('--nat') ? opt('--nat').split(',') : null;
  const ids = vm.runInContext('NATION_IDS', ctx).filter(n => !['TSMC', 'USCORP'].includes(n));
  // 對局清單：每張地圖兩場（換邊）
  const list = [];
  for (const pb of vs) for (const sz of sizes) for (let g = 0; g < games; g++) {
    const m = g >> 1, aSide = g % 2;
    const nations = [nats ? nats[m % nats.length] : ids[m % ids.length], nats ? nats[(m + 1) % nats.length] : ids[(m * 7 + 3) % ids.length]];
    list.push({ pb, sz, w: DUEL_SZ[sz][0], h: DUEL_SZ[sz][1], seed: 5000 + m, aSide, nations, personas: aSide === 0 ? [pa, pb] : [pb, pa] });
  }
  const done = new Array(list.length);
  (async () => {
    if (jobs === 1) {
      for (let k = 0; k < list.length; k++) done[k] = await runDuel(list[k], turns);
    } else {
      const { fork } = require('child_process');
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, () => new Promise(res => {
        const w = fork(__filename, ['--duel-worker'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
        const feed = () => { if (next >= list.length) { w.send({ quit: true }); return; } const k = next++; w.send({ k, job: list[k], turns }); };
        w.on('message', m => { done[m.k] = m.r; feed(); });
        w.on('exit', res);
        feed();
      })));
    }
    report();
  })();
  function report() {
    console.log(`\nAI 風格對決 ${pa} vs ${vs.join('/')}（每種尺寸 ${games} 場，每張地圖換邊各一場；${turns} 回合未分勝負以評分判定）`);
    console.log('對手 尺寸         勝率   決定性勝/敗   平均決勝回合   終局據點   終局兵力價值   終局資金   終局部隊數');
    let tw = 0, tn = 0, tdec = 0;
    for (const pb of vs) for (const sz of sizes) {
      const rs = list.map((j, k) => [j, done[k]]).filter(([j]) => j.pb === pb && j.sz === sz);
      let w = 0, dw = 0, dl = 0, tsum = 0, pA = 0, pB = 0, vA = 0, vB = 0, fA = 0, fB = 0, uA = 0, uB = 0;
      for (const [j, r] of rs) {
        const me = j.aSide, win = r.winner === me;
        if (win) w++;
        if (r.decisive) { if (win) { dw++; tsum += r.turn; } else dl++; }
        pA += r.props[me]; pB += r.props[1 - me]; vA += r.val[me]; vB += r.val[1 - me]; fA += r.funds[me]; fB += r.funds[1 - me]; uA += r.units[me]; uB += r.units[1 - me];
      }
      const n = rs.length; tw += w; tn += n; tdec += dw;
      console.log(`${pb.padEnd(4)} ${sz.padEnd(3)} ${DUEL_SZ[sz].join('×').padEnd(6)}  ${String(Math.round(w / n * 100)).padStart(4)}%   ${String(dw).padStart(4)} / ${String(dl).padEnd(4)}   ${(dw ? (tsum / dw).toFixed(1) : '-').padStart(8)}       ${(pA / n).toFixed(1).padStart(4)}:${(pB / n).toFixed(1).padEnd(4)}  ${String(Math.round(vA / n)).padStart(6)}:${String(Math.round(vB / n)).padEnd(6)}  ${String(Math.round(fA / n)).padStart(6)}:${String(Math.round(fB / n)).padEnd(6)}  ${String(Math.round(uA / n)).padStart(4)}:${Math.round(uB / n)}`);
    }
    console.log(`總計 ${pa} 勝率 ${(tw / tn * 100).toFixed(1)}%（${tw}/${tn}），決定性勝利 ${tdec}`);
    if (args.includes('--losses')) {
      console.log('\n落敗場次（對手 尺寸 地圖種子 我方邊 國家 結果 據點 兵力 資金）：');
      list.forEach((j, k) => {
        const r = done[k], me = j.aSide;
        if (r.winner === me) return;
        console.log(`  ${j.pb} ${j.sz} seed${j.seed} side${me} ${j.nations.join('v')} T${r.turn} ${r.decisive ? r.reason : '評分'}  據點 ${r.props[me]}:${r.props[1 - me]}  兵力 ${r.val[me]}:${r.val[1 - me]}  資金 ${r.funds[me]}:${r.funds[1 - me]}`);
      });
    }
  }
  return;
}

const carryArg = (opt('--carry') || '0,0').split(',').map(Number);

vm.runInContext(`var CARRY_N = ${carryArg[0] || 0}, CARRY_XP = ${carryArg[1] || 0};`, ctx);

// ----- 自動對戰 -----
// 各任務預設測試的旗標組合（代表不同路線）
const DEFAULT_FLAGS = {
  t2: [{ kinmen: true }, { kinmen: true, lieyu: true }, { kinmen: false }],
  t3: [{ kinmen: true, fleet: true }, { kinmen: true, fleet: false }, { kinmen: false, fleet: false, penghu: false }],
  c2: [{ taichung: 'held' }, { taichung: 'lost' }],
  c3: [{ us: true }, { us: false }],
  c4: [{ kr: true }, { kr: false }],
  c5: [{ us: true, kr: true, de: true, taichung: 'held' }, { us: false, kr: false, de: false, taichung: 'held' }, { us: true, kr: true, de: false, taichung: 'lost' }],
};
vm.runInContext(`
  async function simulate(id, flags, ep = 'B', pp = 'B') {
    setupMission(id, flags, true, synthCarry(CARRY_N, CARRY_XP), true, ep, pp);
    let guard = 0;
    let maxDistFromHQ = 0;
    let maxAirToLand = 0;
    const pside = G.pside;
    const pHq = G.caps ? G.caps[pside] : -1;
    const [hqX, hqY] = pHq >= 0 ? ixy(pHq) : [-1, -1];

    while (G.winner == null && guard++ < 160) {
      await aiTurn();
      if (pHq >= 0) {
        for (const u of G.units.filter(e => e.side === pside)) {
          const d = hexDist(u.x, u.y, hqX, hqY);
          if (d > maxDistFromHQ) maxDistFromHQ = d;
        }
      }
      const myAir = G.units.filter(e => e.side === pside && UNITS[e.type].cat === 'air').length;
      const myLand = G.units.filter(e => e.side === pside && UNITS[e.type].cat === 'land').length;
      const ratio = myAir > 0 ? (myAir / Math.max(1, myLand)) : 0;
      if (ratio > maxAirToLand) maxAirToLand = ratio;
      if (G.winner != null) break;
      endTurn();
    }
    const P = G.pside, st = G.stats || { loads: 0, unloads: 0, amphibious_captures: 0, crashes: 0 };
    const pCrashes = (G.airFuelCrashCount && G.airFuelCrashCount[P]) || 0;
    return {
      win: G.result ? G.result.win : false, obj: G.result ? G.result.obj : 'stuck', turn: G.turn,
      loads: st.loads || 0, unloads: st.unloads || 0, amph: st.amphibious_captures || 0, crashes: st.crashes || 0,
      pCrashes, maxDistFromHQ, maxAirToLand,
      left: [G.units.filter(u => u.side === P).length, G.units.filter(u => u.side !== P).length],
    };
  }
`, ctx);

(async () => {
  const list = ids.length ? ids : vm.runInContext('Object.keys(MISSIONS)', ctx);
  if (PERSONAS_ARG) {
    const pList = PERSONAS_ARG.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    console.log(`\nAI 戰術風格對戰模擬（每種風格組合 ${RUNS} 場；極簡遙測）：`);
    console.log('任務   P0風格 vs P1風格   勝率   平均回合   搭/卸/渡海/墜機   約束檢驗(墜機<=3/半徑<=15/陸空比)   結果分布');
    const pDesc = { A: '攻擊型(極限殲敵)', B: '綜合型(協同平衡)', C: '保守型(要塞防禦)' };
    for (const id of list) {
      for (const p of pList) {
        const res = [];
        for (let k = 0; k < RUNS; k++) res.push(await ctx.simulate(id, {}, 'B', p));
        const wins = res.filter(r => r.win), dist = {};
        for (const r of res) { const key = (r.win ? '勝:' : '敗:') + r.obj; dist[key] = (dist[key] || 0) + 1; }
        const avg = a => a.length ? (a.reduce((s, r) => s + r.turn, 0) / a.length).toFixed(1) : '-';
        const avgS = k => (res.reduce((s, r) => s + r[k], 0) / RUNS).toFixed(1);
        const maxCrashes = Math.max(...res.map(r => r.pCrashes));
        const maxRadius = Math.max(...res.map(r => r.maxDistFromHQ));
        const maxAirRatio = Math.max(...res.map(r => r.maxAirToLand));
        const trStr = `${avgS('loads').padStart(4)}/${avgS('unloads').padStart(4)}/${avgS('amph').padStart(4)}/${avgS('crashes').padStart(4)}`;
        const chkStr = `墜機Max:${maxCrashes} 半徑Max:${maxRadius} 空陸比Max:${maxAirRatio.toFixed(2)}`;
        const vsLabel = `${p}(${pDesc[p] || p}) vs B(綜合型)`.padEnd(20);
        console.log(`${id.padEnd(6)} ${vsLabel} ${String(Math.round(wins.length / RUNS * 100)).padStart(3)}%    ${avg(wins).padStart(5)}      ${trStr.padEnd(18)} ${chkStr.padEnd(34)} ${Object.entries(dist).map(([k, v]) => k + '×' + v).join(' ')}`);
      }
    }
    return;
  }
  console.log(`\n每種組合模擬 ${RUNS} 場（AI 扮演雙方 + 友軍；零干擾極簡遙測）`);
  console.log('任務   旗標                     勝率   平均回合   搭/卸/渡海/墜機   結果分布');
  for (const id of list) {
    for (const f of FLAGS ? [FLAGS] : (DEFAULT_FLAGS[id] || [{}])) {
      const res = [];
      for (let k = 0; k < RUNS; k++) res.push(await ctx.simulate(id, f));
      const wins = res.filter(r => r.win), dist = {};
      for (const r of res) { const key = (r.win ? '勝:' : '敗:') + r.obj; dist[key] = (dist[key] || 0) + 1; }
      const avg = a => a.length ? (a.reduce((s, r) => s + r.turn, 0) / a.length).toFixed(1) : '-';
      const avgS = k => (res.reduce((s, r) => s + r[k], 0) / RUNS).toFixed(1);
      const trStr = `${avgS('loads').padStart(4)}/${avgS('unloads').padStart(4)}/${avgS('amph').padStart(4)}/${avgS('crashes').padStart(4)}`;
      console.log(`${id.padEnd(6)} ${JSON.stringify(f).padEnd(24)} ${String(Math.round(wins.length / RUNS * 100)).padStart(3)}%    ${avg(wins).padStart(5)}      ${trStr.padEnd(18)} ${Object.entries(dist).map(([k, v]) => k + '×' + v).join(' ')}`);
    }
  }
})();
}
