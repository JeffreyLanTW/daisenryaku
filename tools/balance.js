#!/usr/bin/env node
// 劇情平衡測試：驗證任務地圖，並讓 AI 同時扮演雙方反覆對戰，統計勝率與回合數。
// 用法：node tools/balance.js [任務id,...] [--runs N] [--flags '{"truth":true}'] [--check]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..', 'docs');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = +(opt('--runs') || 16);
const FLAGS = opt('--flags') ? JSON.parse(opt('--flags')) : null;
const CHECK_ONLY = args.includes('--check');
const ids = args.filter((a, k) => !a.startsWith('--') && !['--runs', '--flags', '--carry', '--chain', '--games', '--turns', '--sweep', '--sizes', '--only'].includes(args[k - 1]));

// 載入遊戲程式（不含畫面），並以空函式代替畫面相關呼叫（靜默 console 以節省輸出 token）
const noop = () => {};
const silentConsole = { log: noop, warn: noop, error: noop, info: noop };
const ctx = {
  console: silentConsole, Math, JSON, Set, Map, Array, Object, Promise, Infinity, Number, String, Date,
  setTimeout: f => setImmediate(f),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
vm.createContext(ctx);
for (const f of ['data', 'game', 'map', 'ai', 'campaign', 'campaign_tw', 'campaign_fs']) {
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

module.exports = { ctx };
if (require.main === module) main();

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
  async function simulate(id, flags) {
    setupMission(id, flags, true, synthCarry(CARRY_N, CARRY_XP), true);
    let guard = 0;
    while (G.winner == null && guard++ < 160) {
      await aiTurn();
      if (G.winner != null) break;
      endTurn();
    }
    const P = G.pside, st = G.stats || { loads: 0, unloads: 0, amphibious_captures: 0, crashes: 0 };
    return {
      win: G.result ? G.result.win : false, obj: G.result ? G.result.obj : 'stuck', turn: G.turn,
      loads: st.loads || 0, unloads: st.unloads || 0, amph: st.amphibious_captures || 0, crashes: st.crashes || 0,
      left: [G.units.filter(u => u.side === P).length, G.units.filter(u => u.side !== P).length],
    };
  }
`, ctx);

(async () => {
  const list = ids.length ? ids : vm.runInContext('Object.keys(MISSIONS)', ctx);
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
