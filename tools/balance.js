#!/usr/bin/env node
// 劇情平衡測試：驗證任務地圖，並讓 AI 同時扮演雙方反覆對戰，統計勝率與回合數。
// 用法：node tools/balance.js [任務id,...] [--runs N] [--flags '{"truth":true}'] [--check]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const RUNS = +(opt('--runs') || 8);
const FLAGS = opt('--flags') ? JSON.parse(opt('--flags')) : null;
const CHECK_ONLY = args.includes('--check');
const ids = args.filter((a, k) => !a.startsWith('--') && !['--runs', '--flags'].includes(args[k - 1]));

// 載入遊戲程式（不含畫面），並以空函式代替畫面相關呼叫
const ctx = {
  console, Math, JSON, Set, Map, Array, Object, Promise, Infinity, Number, String, Date,
  setTimeout: f => setImmediate(f),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
vm.createContext(ctx);
for (const f of ['data', 'game', 'map', 'ai', 'campaign', 'campaign_emp']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
vm.runInContext(`
  var SETTINGS = { aiStep: 0 };
  var refreshPanel = () => {}, ensureVisible = () => {}, fxText = () => {}, tileCenter = () => [0, 0];
  async function doMove(u, path, cost) {
    if (path.length < 2) return;
    const [x, y] = ixy(path[path.length - 1]);
    u.x = x; u.y = y;
    if (UNITS[u.type].fuel !== undefined) u.fuel -= cost;
    u.moved = true;
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
      if (r.length !== w) out.push(id + ' 第' + y + '列長度 ' + r.length + ' ≠ ' + w);
      for (const ch of r) if (!LEGEND[ch]) out.push(id + ' 未知字元 ' + ch);
    });
    const flagSets = [{}, { truth: true }, { truth: false }, { line: true }, { blitz: true, fleet: true }, { navy: true }, { air: true }, { intel: true }, { intel: false }, { bridge: true }];
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
          const foot = m.start.filter(e => e[2] === P && UNITS[ftype(e[0], P)].mt === 'foot');
          if (!foot.length) continue;
          const seen = new Set([foot[0][1]]), q = [foot[0][1]];
          while (q.length) { const c = q.shift(); for (const [nx, ny] of neighbors(c % m.w, (c / m.w) | 0, m.w, m.h)) { const n = ny * m.w + nx; if (!seen.has(n) && moveCost(m.terrain[n], 'foot') !== Infinity) { seen.add(n); q.push(n); } } }
          if (!seen.has(y * m.w + x)) out.push(id + ' 目標 ' + x + ',' + y + ' 步兵無法抵達');
        }
      }
      for (const ev of M.events || []) for (const [s, type, x, y] of ev.spawn || []) {
        if (moveCost(m.terrain[y * m.w + x], UNITS[ftype(type, s)].mt) === Infinity) out.push(id + ' 事件增援 ' + type + ' 在 ' + m.terrain[y * m.w + x]);
      }
    }
  }
  return [...new Set(out)];
})()`, ctx);
console.log(problems.length ? '地圖問題：\n  ' + problems.join('\n  ') : '地圖檢查：全部通過');
if (CHECK_ONLY) process.exit(problems.length ? 1 : 0);

// ----- 自動對戰 -----
// 各任務預設測試的旗標組合（代表不同路線）
const DEFAULT_FLAGS = {
  m3c: [{}, { bridge: true }], m4: [{}, { navy: true }, { air: true }, { intel: true }, { intel: false }],
  e3b: [{}, { line: true }], e4: [{}, { blitz: true }, { fleet: true }, { line: true }, { truth: true }, { blitz: true, truth: true }],
};
vm.runInContext(`
  async function simulate(id, flags) {
    setupMission(id, flags, true);
    let guard = 0;
    while (G.winner == null && guard++ < 140) {
      await aiTurn();
      if (G.winner != null) break;
      endTurn();
    }
    const P = G.pside;
    return {
      win: G.result ? G.result.win : false, obj: G.result ? G.result.obj : 'stuck', turn: G.turn,
      left: [G.units.filter(u => u.side === P).length, G.units.filter(u => u.side !== P).length],
    };
  }
`, ctx);

(async () => {
  const list = ids.length ? ids : vm.runInContext('Object.keys(MISSIONS)', ctx).filter(id => id.startsWith('e'));
  console.log(`\n每種組合模擬 ${RUNS} 場（AI 扮演玩家方；真人通常比 AI 強）\n`);
  console.log('任務   旗標                     勝率    平均回合  結果分布');
  for (const id of list) {
    for (const f of FLAGS ? [FLAGS] : (DEFAULT_FLAGS[id] || [{}])) {
      const res = [];
      for (let k = 0; k < RUNS; k++) res.push(await ctx.simulate(id, f));
      const wins = res.filter(r => r.win), dist = {};
      for (const r of res) { const key = (r.win ? '勝:' : '敗:') + r.obj; dist[key] = (dist[key] || 0) + 1; }
      const avg = a => a.length ? (a.reduce((s, r) => s + r.turn, 0) / a.length).toFixed(1) : '-';
      console.log(`${id.padEnd(6)} ${JSON.stringify(f).padEnd(24)} ${String(Math.round(wins.length / RUNS * 100)).padStart(3)}%   ${avg(wins).padStart(5)}    ${Object.entries(dist).map(([k, v]) => k + '×' + v).join(' ')}`);
    }
  }
})();
}
