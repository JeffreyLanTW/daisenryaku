'use strict';
// ===== 劇情模式：任務資料、勝敗判定、分支 =====

// 地圖字元
const LEGEND = {
  '.': ['plain'], 'f': ['forest'], '^': ['hills'], 'M': ['mountain'], '~': ['sea'], '=': ['road'], '#': ['bridge'],
  'o': ['city', -1], 'b': ['city', 0], 'r': ['city', 1],
  'H': ['capital', 0], 'X': ['capital', 1],
  'F': ['factory', 0], 'G': ['factory', 1], 'g': ['factory', -1],
  'A': ['airport', 0], 'Z': ['airport', 1], 'a': ['airport', -1],
  'P': ['port', 0], 'Q': ['port', 1], 'p': ['port', -1],
};

// 對話角色、任務、結局由各劇情檔案加入
const SPEAKERS = { '旁白': { title: '', color: '#55606c', icon: '◆' } };
const MISSIONS = {};
const ENDINGS = {};

// 劇情登錄表（其他劇情檔案會再加入）
const CAMPAIGNS = {};
const campOf = M => M.camp;
const winOf = (M, flags) => typeof M.win === 'function' ? M.win(flags || {}) : M.win;

// ----- 戰役進度（localStorage，每套劇情分開） -----
let CAMP = null, CAMP_ID = null;
function loadCamp(cid = CAMP_ID) {
  CAMP_ID = cid || Object.keys(CAMPAIGNS)[0];
  cid = CAMP_ID;
  try { CAMP = JSON.parse(localStorage.getItem(CAMPAIGNS[cid].key)); } catch (e) { CAMP = null; }
  if (!CAMP) CAMP = { current: null, flags: {}, visited: [], endings: [] };
  return CAMP;
}
function saveCamp() { try { localStorage.setItem(CAMPAIGNS[CAMP_ID].key, JSON.stringify(CAMP)); } catch (e) { /* 忽略 */ } }

// ----- 地圖解析 -----
const alliesOf = M => (M.allies || []).map(nid => ({ side: CAMPAIGNS[campOf(M)].player, nid }));
function parseMission(M, flags, player = 0) {
  applyNations(M.nations || CAMPAIGNS[campOf(M)].nations, alliesOf(M));
  const rows = M.map, h = rows.length, w = rows[0].length, N = w * h;
  const terrain = new Array(N), owner = new Array(N).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [t, o] = LEGEND[rows[y][x]];
    terrain[y * w + x] = t;
    if (o !== undefined) owner[y * w + x] = o;
  }
  // 道路：相鄰的道路/橋/據點自動相連（據點之間不連）
  const roads = [], isRoad = t => t === 'road' || t === 'bridge';
  for (let i = 0; i < N; i++) {
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of neighbors(x, y, w, h)) {
      const j = ny * w + nx;
      if (j <= i) continue;
      const a = terrain[i], b = terrain[j];
      if ((isRoad(a) && (isRoad(b) || TERRAIN[b].prop)) || (isRoad(b) && TERRAIN[a].prop)) roads.push([i, j]);
    }
  }
  const removed = M.remove ? M.remove(flags) : [];
  const list = [...M.units, ...(M.extra ? M.extra(flags) : [])].filter(u => !(u[4] && removed.includes(u[4].tag)));
  const taken = new Set(), start = [];
  for (const [side, type, x, y, extra] of list) {
    const i = placeFree(terrain, w, h, x, y, UNITS[extra && extra.ally ? atype(type, side, extra.ally) : ftype(type, side)].mt, taken);
    if (i < 0) continue;
    taken.add(i);
    start.push([type, i, side, extra]);
  }
  const caps = [0, 1].map(s => {
    const c = terrain.findIndex((t, i) => t === 'capital' && owner[i] === s);
    if (c >= 0) return c;
    const u = start.find(e => e[2] === s);
    return u ? u[1] : 0;
  });
  const hq = terrain.map((t, i) => t === 'capital' && owner[i] === player ? i : -1).filter(i => i >= 0);
  return { w, h, terrain, owner, roads, start, caps, hq };
}
// 找最近一格可站立的空地
function placeFree(terrain, w, h, x, y, mt, taken) {
  const ok = i => moveCost(terrain[i], mt) !== Infinity && !taken.has(i);
  const s = y * w + x;
  if (ok(s)) return s;
  const seen = new Set([s]), q = [s];
  while (q.length) {
    const c = q.shift();
    for (const [nx, ny] of neighbors(c % w, (c / w) | 0, w, h)) {
      const n = ny * w + nx;
      if (seen.has(n)) continue;
      seen.add(n);
      if (ok(n)) return n;
      q.push(n);
    }
  }
  return -1;
}

// ----- 勝敗判定 -----
function setResult(win, obj, reason) {
  if (G.winner != null) return;
  const P = G.pside || 0;
  G.winner = win ? P : 1 - P;
  G.result = { win, obj, reason, turn: G.turn };
  G.winReason = reason;
  addLog(win ? `作戰成功：${reason}` : `作戰失敗：${reason}`, G.winner);
}
function evalMission() {
  const M = MISSIONS[G.missionId], P = G.pside || 0;
  if (!G.units.some(u => u.side === P)) return setResult(false, 'annihilated', '我軍全軍覆沒');
  for (const c of M.lose || []) {
    if (c.type === 'hq' && G.hq.some(i => G.owner[i] !== P)) return setResult(false, 'hq', c.text);
    if (c.type === 'vip' && !G.units.some(u => u.vip && u.side === P)) return setResult(false, 'vip', c.text);
    if (c.type === 'loseCount' && c.tiles.filter(([x, y]) => G.owner[idxOf(x, y)] !== P).length >= c.max) return setResult(false, 'line', c.text);
  }
  for (const o of winOf(M, G.campFlags)) {
    if (o.type === 'destroyAll' && !G.units.some(u => u.side !== P)) return setResult(true, o.id, o.text);
    if (o.type === 'capture' && G.owner[idxOf(o.at[0], o.at[1])] === P) return setResult(true, o.id, o.text);
    if (o.type === 'captureAll' && o.tiles.every(([x, y]) => G.owner[idxOf(x, y)] === P)) return setResult(true, o.id, o.text);
    if (o.type === 'reach' && G.units.some(u => u.vip && u.side === P && u.x === o.at[0] && u.y === o.at[1])) return setResult(true, o.id, o.text);
    if (o.type === 'destroyTag' && !G.units.some(u => u.tag === o.tag)) return setResult(true, o.id, o.text);
  }
}
// AI 用：任務目標轉成移動目標 [idx, 偏移]（越小越優先）
function missionAIGoals(u) {
  if (!G || !G.missionId) return [];
  const M = MISSIONS[G.missionId], P = G.pside || 0, d = UNITS[u.type], out = [];
  for (const o of winOf(M, G.campFlags)) {
    const tiles = o.type === 'capture' ? [o.at] : o.type === 'captureAll' ? o.tiles : [];
    for (const [x, y] of tiles) {
      const i = idxOf(x, y);
      if (u.side === P && G.owner[i] !== P) out.push([i, d.capture ? -8 : -1 - 4 * (aiAggression(P) - 1)]);
      if (u.side !== P && G.owner[i] !== P && !d.capture) out.push([i, 2]);
    }
    if (o.type === 'destroyTag' && u.side === P) {
      for (const e of G.units) if (e.tag === o.tag && canHit(u.type, e)) out.push([idxOf(e.x, e.y), -4]);
    }
    if (o.type === 'reach' && u.side === P && u.vip) out.push([idxOf(o.at[0], o.at[1]), -12]);
  }
  for (const c of M.lose || []) {
    if (c.type !== 'loseCount') continue;
    for (const [x, y] of c.tiles) {
      const i = idxOf(x, y);
      if (u.side !== P && G.owner[i] === P) out.push([i, d.capture ? -8 : -1]);
      if (u.side === P && !d.capture) out.push([i, G.owner[i] === P ? 1 : -3]);
    }
  }
  return out;
}
// 守方站在護送目標格上的加分（擋住特使）
function missionHoldBonus(u, i) {
  if (!G || !G.missionId || u.side === (G.pside || 0)) return 0;
  const [x, y] = ixy(i);
  let b = 0;
  for (const o of winOf(MISSIONS[G.missionId], G.campFlags)) {
    if (o.type === 'reach' && o.at[0] === x && o.at[1] === y) b += 600;
  }
  return b;
}
// 作戰急迫度：任務中負責進攻的一方隨時限逼近而更積極（1 = 一般）
function aiAggression(side) {
  if (!G || !G.missionId) return 1;
  const M = MISSIONS[G.missionId], P = G.pside || 0, wins = winOf(M, G.campFlags);
  const surv = wins.find(o => o.type === 'survive');
  if (side === P && !surv && M.turnLimit) return 1.2 + 1.3 * Math.min(1, G.turn / M.turnLimit);
  if (side !== P && surv) return 1.2 + 1.3 * Math.min(1, G.turn / surv.turn);
  return 1;
}
function missionCaptureBonus(u, i) {
  if (!G || !G.missionId) return 0;
  const [x, y] = ixy(i), M = MISSIONS[G.missionId];
  if (u.side !== (G.pside || 0)) {
    return (M.lose || []).some(c => c.type === 'loseCount' && c.tiles.some(t => t[0] === x && t[1] === y)) ? 2500 : 0;
  }
  return winOf(MISSIONS[G.missionId], G.campFlags).some(o =>
    (o.type === 'capture' && o.at[0] === x && o.at[1] === y) ||
    (o.type === 'captureAll' && o.tiles.some(t => t[0] === x && t[1] === y))) ? 2500 : 0;
}
// 每回合開始時：存活目標、時間限制、劇情事件
function missionTurnStart() {
  const M = MISSIONS[G.missionId];
  if (G.cur !== (G.pside || 0)) return;
  for (const o of winOf(M, G.campFlags)) {
    if (o.type === 'survive' && G.turn > o.turn) return setResult(true, o.id, o.text);
  }
  if (M.turnLimit && G.turn > M.turnLimit) return setResult(false, 'time', `超過 ${M.turnLimit} 回合時限`);
  for (const [k, ev] of (M.events || []).entries()) {
    if (ev.turn !== G.turn || G.firedEvents.includes(k)) continue;
    if (ev.when && !ev.when(G.campFlags || {})) continue;
    G.firedEvents.push(k);
    const taken = new Set(G.units.map(u => idxOf(u.x, u.y)));
    for (const [side, type, x, y, extra] of ev.spawn || []) {
      const ut = extra && extra.ally ? atype(type, side, extra.ally) : ftype(type, side);
      const i = placeFree(G.terrain, G.w, G.h, x, y, UNITS[ut].mt, taken);
      if (i < 0) continue;
      taken.add(i);
      const [px, py] = ixy(i);
      const nu = spawnUnit(type, side, px, py, extra);
      if (M.enemyXp && side !== (G.pside || 0)) nu.xp = M.enemyXp;
      G.units.push(nu);
      addLog(`${extra && extra.ally ? NATIONS[extra.ally].army : SIDES[side].name}${UNITS[ut].name}抵達戰場`, side);
    }
    if (ev.lines) G.pendingDialogs.push(ev.lines);
  }
}
function bonusMet(b) {
  if (b.type === 'hold') return G.owner[idxOf(b.at[0], b.at[1])] === (G.pside || 0);
  return false;
}
function missionTargets() {
  if (!G || !G.missionId) return null;
  const M = MISSIONS[G.missionId], tiles = [], tags = [];
  for (const o of [...winOf(M, G.campFlags), ...(M.bonus || [])]) {
    if (o.at) tiles.push({ i: idxOf(o.at[0], o.at[1]), bonus: !!o.flag });
    if (o.tiles) for (const [x, y] of o.tiles) tiles.push({ i: idxOf(x, y), bonus: false });
    if (o.tag) tags.push(o.tag);
  }
  for (const c of M.lose || []) if (c.tiles) for (const [x, y] of c.tiles) tiles.push({ i: idxOf(x, y), bonus: false });
  return { tiles, tags };
}
function objectivesHTML() {
  const M = MISSIONS[G.missionId];
  const left = M.turnLimit ? `<span class="${M.turnLimit - G.turn <= 2 ? 'warn' : ''}">第 ${G.turn} / ${M.turnLimit} 回合</span>` : `<span>第 ${G.turn} 回合</span>`;
  const tagLeft = t => G.units.filter(u => u.tag === t).length;
  const win = winOf(M, G.campFlags).map(o => `<li>🎯 ${o.text}${o.type === 'destroyTag' ? `（剩 ${tagLeft(o.tag)}）` : ''}${o.type === 'survive' ? `（剩 ${Math.max(0, o.turn - G.turn + 1)} 回合）` : ''}</li>`).join('');
  const bonus = (M.bonus || []).map(b => `<li class="bonus">${bonusMet(b) ? '✅' : '⭐'} ${b.text}</li>`).join('');
  const lose = (M.lose || []).map(c => `<li class="lose">✖ ${c.text}</li>`).join('');
  return `<h3>${M.chapter}・${M.title}</h3><div class="stats small">${left}<span>${M.place}</span></div>
    <ul class="obj">${win}${bonus}${lose}<li class="lose">✖ 我軍全軍覆沒</li></ul>${M.hint ? `<div class="desc">💡 ${M.hint}</div>` : ''}`;
}

// ----- 流程 -----
function startMission(id) {
  const M = MISSIONS[id];
  if (CAMP_ID !== campOf(M) || !CAMP) loadCamp(campOf(M));
  CAMP.current = id;
  if (!CAMP.visited.includes(id)) CAMP.visited.push(id);
  saveCamp();
  playDialog(M.briefing(CAMP.flags), `${M.chapter}・${M.title}`).then(() => {
    openModal(`<div class="mtitle"><div class="chap">${M.chapter}</div><h2>${M.title}</h2><div class="sub">📍 ${M.place}</div></div>
      <ul class="obj big">${winOf(M, CAMP.flags).map(o => `<li>🎯 ${o.text}</li>`).join('')}
      ${(M.bonus || []).map(b => `<li class="bonus">⭐ ${b.text}</li>`).join('')}
      ${(M.lose || []).map(c => `<li class="lose">✖ ${c.text}</li>`).join('')}
      ${M.turnLimit ? `<li class="lose">⏱ 時限 ${M.turnLimit} 回合</li>` : ''}</ul>
      ${M.hint ? `<div class="desc">💡 ${M.hint}</div>` : ''}
      ${M.allies && M.allies.length ? `<div class="allychoice"><b>🤝 援軍：${M.allies.map(n => NATIONS[n].army).join('、')}</b>
        <label><input type="radio" name="allyc" value="ai" ${allyPref() ? 'checked' : ''}> 交給電腦指揮</label>
        <label><input type="radio" name="allyc" value="me" ${allyPref() ? '' : 'checked'}> 由我指揮</label></div>` : ''}
      <div class="row"><button class="close">返回</button><button class="primary" id="goMission">開始作戰</button></div>`, box => {
      box.querySelector('.close').onclick = () => openCampaignMenu(CAMP_ID);
      box.querySelector('#goMission').onclick = () => {
        const r = box.querySelector('input[name=allyc]:checked'), ai = r ? r.value === 'ai' : true;
        try { localStorage.setItem('daisenryaku_allyai', ai ? '1' : '0'); } catch (e) { /* 忽略 */ }
        closeModal(); launchMission(id, ai);
      };
    });
  });
}
// 建立任務遊戲狀態（不含畫面）；aiBoth 用於自動平衡測試
// inherit：{ units: [{base, node, xp}], funds } 由上一場繼承（只在同國家時部署）
function setupMission(id, flags, aiBoth = false, inherit = null, allyAI = true) {
  const M = MISSIONS[id], P = CAMPAIGNS[campOf(M)].player;
  const m = parseMission(M, flags, P);
  const funds = typeof M.funds === 'function' ? M.funds(flags) : [...M.funds];
  initState(m, { players: [0, 1].map(s => ({ ai: aiBoth || s !== P })), funds, missionId: id, seed: 0,
    nations: M.nations || CAMPAIGNS[campOf(M)].nations, allies: alliesOf(M), allyAI });
  G.hq = m.hq;
  G.pside = P;
  G.campFlags = Object.assign({}, flags);
  if (M.enemyXp) for (const u of G.units) if (u.side !== P) u.xp = M.enemyXp;
  addLog(`${M.chapter}「${M.title}」作戰開始`);
  if (inherit) {
    G.funds[P] += inherit.funds || 0;
    const taken = new Set(G.units.map(u => idxOf(u.x, u.y)));
    // 部署錨點：任務指定，否則為我方初始部隊中最靠近重心的地面部隊（前線集結區）
    let hx, hy;
    if (M.deployAt) [hx, hy] = M.deployAt;
    else {
      const own = G.units.filter(u => u.side === P && UNITS[u.type].cat === 'land');
      if (own.length) {
        const mx = own.reduce((t, u) => t + u.x, 0) / own.length, my = own.reduce((t, u) => t + u.y, 0) / own.length;
        const a = own.reduce((b, u) => Math.hypot(u.x - mx, u.y - my) < Math.hypot(b.x - mx, b.y - my) ? u : b);
        [hx, hy] = [a.x, a.y];
      } else [hx, hy] = ixy(G.caps[P]);
    }
    let placed = 0, refund = 0;
    for (const e of inherit.units || []) {
      const key = e.node ? `${e.base}_${P}_${e.node}` : `${e.base}_${P}`;
      if (!UNITS[key]) continue;
      const i = placeNearHQ(hx, hy, UNITS[key].mt, taken);
      if (i < 0) { refund += UNITS[key].cost; continue; }
      taken.add(i);
      const [x, y] = ixy(i);
      G.units.push(makeUnit(key, P, x, y, { xp: e.xp, vet: true }));
      placed++;
    }
    if (placed) addLog(`繼承部隊 ${placed} 支抵達戰場`, P);
    if (refund) { G.funds[P] += refund; addLog(`部分繼承部隊因部署空間不足，轉為經費 💰${refund}`, P); }
    // 敵軍依繼承兵力增援：七成直接派兵（取自本關敵軍兵種組成）、三成為預算
    const sc = M.scale != null ? M.scale : CAMPAIGNS[campOf(M)].scale || 0;
    if (sc) {
      const E = 1 - P;
      const val = G.units.filter(u => u.vet).reduce((t, u) => t + UNITS[u.type].cost, 0);
      let budget = val * sc * 0.7;
      // 兵種池：本關敵軍的所有兵種；複製自任務目標部隊者一併加入目標（殲滅目標隨兵力增加）
      const pool = G.units.filter(u => u.side === E && !UNITS[u.type].carry).map(u => ({ type: u.type, tag: u.tag }));
      const taken = new Set(G.units.map(u => idxOf(u.x, u.y)));
      const [ex, ey] = ixy(G.caps[E]);
      let n = 0;
      for (let k = 0; pool.length && k < 40 && budget >= 200; k++) {
        const { type, tag } = pool[k % pool.length], cost = UNITS[type].cost;
        if (cost > budget) continue;
        const i = placeFree(G.terrain, G.w, G.h, ex, ey, UNITS[type].mt, taken);
        if (i < 0) break;
        taken.add(i);
        const [x, y] = ixy(i);
        const nu = makeUnit(type, E, x, y, Object.assign(M.enemyXp ? { xp: M.enemyXp } : {}, tag ? { tag } : {}));
        G.units.push(nu);
        budget -= cost; n++;
      }
      const funds = Math.round((val * sc * 0.3 + budget) / 100) * 100;
      G.funds[E] += funds;
      if (n || funds) addLog(`敵軍得知我軍兵力，增派 ${n} 支部隊、預算 💰${funds}`, E);
    }
  }
  startTurn();
}
// 繼承部隊部署：地面部隊只放在與指揮部陸路相連的格子；飛機、艦艇限 6 格內
function placeNearHQ(hx, hy, mt, taken) {
  const W = G.w, start = hy * W + hx, land = ['foot', 'tread', 'amph', 'rail'].includes(mt);
  const ok = i => moveCost(G.terrain[i], mt) !== Infinity && !taken.has(i);
  const seen = new Set([start]), q = [start];
  while (q.length) {
    const c = q.shift();
    if (c !== start && ok(c)) return c;
    const [cx, cy] = ixy(c);
    for (const [nx, ny] of neighbors(cx, cy)) {
      const n = ny * W + nx;
      if (seen.has(n)) continue;
      if (land ? moveCost(G.terrain[n], mt) === Infinity : hexDist(nx, ny, hx, hy) > 6) continue;
      seen.add(n); q.push(n);
    }
  }
  return ok(start) ? start : -1;
}
// 可帶入下一場的部隊上限
const CARRY_MAX = 6;
// 配置區：我方據點周圍 2 格與初始部隊周圍 1 格
function deployZone() {
  const P = G.pside, zone = new Set();
  const addAround = (cx, cy, r) => {
    for (let i = 0; i < G.terrain.length; i++) {
      const [x, y] = ixy(i);
      if (hexDist(x, y, cx, cy) <= r) zone.add(i);
    }
  };
  for (let i = 0; i < G.owner.length; i++) {
    if (G.owner[i] === P && TERRAIN[G.terrain[i]].build) { const [x, y] = ixy(i); addAround(x, y, 2); }
  }
  for (const u of G.units) if (u.side === P) addAround(u.x, u.y, 1);
  return zone;
}
function startDeploy() {
  UIS.mode = 'deploy';
  UIS.deployZone = deployZone();
  UIS.deploySel = null;
  const bar = $('#deployBar');
  bar.classList.remove('hidden');
  refreshPanel();
}
function endDeploy() {
  $('#deployBar').classList.add('hidden');
  UIS.deployZone = null; UIS.deploySel = null;
  UIS.mode = 'idle';
  turnIntro();
}
function deployClick(x, y) {
  const i = idxOf(x, y), u = unitAt(x, y), sel = UIS.deploySel, P = G.pside;
  const okFor = (unit, idx) => UIS.deployZone.has(idx) && moveCost(G.terrain[idx], UNITS[unit.type].mt) !== Infinity;
  if (u && u.side === P) {
    if (sel && sel !== u && okFor(sel, i) && okFor(u, idxOf(sel.x, sel.y))) {
      const [sx, sy] = [sel.x, sel.y];
      sel.x = u.x; sel.y = u.y; u.x = sx; u.y = sy;
      UIS.deploySel = null;
      sfx('click');
    } else UIS.deploySel = sel === u ? null : u;
  } else if (sel && !u && okFor(sel, i)) {
    sel.x = x; sel.y = y;
    UIS.deploySel = null;
    sfx('foot');
  } else UIS.deploySel = null;
  refreshPanel();
}
function launchMission(id, allyAI = true) {
  clearSel(); setInspect(null); FX.length = 0;
  const nid = (MISSIONS[id].nations || CAMPAIGNS[campOf(MISSIONS[id])].nations)[CAMPAIGNS[campOf(MISSIONS[id])].player];
  const roster = (CAMP.roster || {})[nid];
  setupMission(id, CAMP.flags, false, roster ? { units: roster, funds: CAMP.carryFunds || 0 } : null, allyAI);
  CAMP.carryFunds = 0;
  saveCamp();
  buildTerrain(); resize(); fitView();
  const [cx, cy] = idxCenter(G.caps[G.pside]); centerOn(cx, cy);
  startDeploy();
}

function showDebrief() {
  if (G.debriefShown) return;
  G.debriefShown = true;
  const M = MISSIONS[G.missionId], r = G.result, f = CAMP.flags;
  const gained = {};
  const bonusLines = [];
  if (r.win) for (const b of M.bonus || []) {
    const ok = bonusMet(b);
    if (ok) gained[b.flag] = true;
    bonusLines.push(`${ok ? '✅' : '❌'} ${b.text}`);
  }
  const br = r.win ? M.next(r, f) : M.onLose ? M.onLose(r, f) : null;
  if (br) br.flags = Object.assign({}, br.flags, gained);
  const dest = br ? (ENDINGS[br.to] ? `結局「${ENDINGS[br.to].title}」` : `${MISSIONS[br.to].chapter}「${MISSIONS[br.to].title}」`) : '';
  openModal(`<div class="debrief ${r.win ? 'win' : 'lose'}">
      <div class="big">${r.win ? '作戰成功' : '作戰失敗'}</div>
      <p>${r.reason}　·　第 ${r.turn} 回合</p>
      ${bonusLines.length ? `<div class="bonuslist">${bonusLines.join('<br>')}</div>` : ''}
      ${br ? `<div class="branch">${br.note}<br><b>→ ${dest}</b></div>` : '<div class="branch">這場戰役不能輸。重整部隊，再試一次吧。</div>'}
    </div>
    <div class="row">${!r.win ? '<button id="dRetry">重新挑戰</button>' : ''}
      <button id="dView">檢視戰場</button>
      ${br ? `<button class="primary" id="dNext">${r.win ? '繼續' : '接受結果'}</button>` : ''}</div>`, box => {
    box.querySelector('#dView').onclick = () => { closeModal(); G.debriefShown = false; };
    const retry = box.querySelector('#dRetry');
    if (retry) retry.onclick = () => { closeModal(); startMission(G.missionId); };
    const nx = box.querySelector('#dNext');
    if (nx) nx.onclick = () => (r.win && !ENDINGS[br.to]) ? chooseCarry(br) : applyBranch(br);
  });
}
// 勝利後選擇帶入下一場的部隊
function chooseCarry(br) {
  const P = G.pside, nid = G.nations[P];
  const cap = CAMPAIGNS[CAMP_ID].carryMax || CARRY_MAX;
  const list = G.units.filter(u => u.side === P && !UNITS[u.type].ally).sort((a, b) => (b.xp || 0) - (a.xp || 0) || UNITS[b.type].cost - UNITS[a.type].cost);
  const carryFunds = Math.min(1500, Math.round(G.funds[P] * 0.3 / 10) * 10);
  const pre = new Set(list.slice(0, cap).map(u => u.id));
  openModal(`<h2>部隊繼承</h2>
    <div class="sub">選擇最多 ${cap} 支部隊帶入下一場（修復至滿編，保留經驗與進化）。另繼承資金 💰${carryFunds}。</div>
    <div class="carry">${list.map(u => {
      const d = UNITS[u.type], r = rankOf(u);
      return `<label class="citem"><input type="checkbox" value="${u.id}" ${pre.has(u.id) ? 'checked' : ''}>
        <canvas width="96" height="72" data-k="${u.type}"></canvas>
        <span><b>${d.name}</b><small>${'★'.repeat(r)}${RANKS[r].name}・經驗 ${u.xp || 0}・HP ${u.hp}${d.tier ? `・改${d.tier}` : ''}</small></span></label>`;
    }).join('') || '<div class="desc">沒有存活的部隊。</div>'}</div>
    <div class="row"><span class="desc" id="carryCount"></span><span class="spacer"></span><button class="primary" id="carryGo">出發</button></div>`, box => {
    box.querySelectorAll('canvas[data-k]').forEach(c => { const g = c.getContext('2d'); g.scale(2, 2); drawCounter(g, 24, 19, c.dataset.k, P); });
    const boxes = [...box.querySelectorAll('input[type=checkbox]')];
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      box.querySelector('#carryCount').textContent = `已選 ${n} / ${cap}`;
      boxes.forEach(b => { b.disabled = !b.checked && n >= cap; });
    };
    boxes.forEach(b => b.onchange = sync); sync();
    box.querySelector('#carryGo').onclick = () => {
      const ids = new Set(boxes.filter(b => b.checked).map(b => +b.value));
      CAMP.roster = CAMP.roster || {};
      CAMP.roster[nid] = list.filter(u => ids.has(u.id)).map(u => ({ base: UNITS[u.type].base, node: UNITS[u.type].node || null, xp: u.xp || 0 }));
      CAMP.carryFunds = carryFunds;
      applyBranch(br);
    };
  });
}
function applyBranch(br) {
  Object.assign(CAMP.flags, br.flags || {});
  if (ENDINGS[br.to]) {
    if (!CAMP.endings.includes(br.to)) CAMP.endings.push(br.to);
    if (!CAMP.visited.includes(br.to)) CAMP.visited.push(br.to);
    CAMP.current = null;
    saveCamp();
    return showEnding(br.to);
  }
  CAMP.current = br.to;
  saveCamp();
  startMission(br.to);
}
function showEnding(id) {
  const E = ENDINGS[id];
  openModal(`<div class="ending" style="--c:${E.color}"><div class="rank">${E.rank}</div><div class="big">${E.title}</div>
    <p>${E.text}</p><div class="desc">已收集結局 ${CAMP.endings.length} / ${CAMPAIGNS[CAMP_ID].tree.at(-1)[1].length}</div></div>
    <div class="row"><button class="primary" id="eMenu">回到戰役選單</button></div>`, box => {
    box.querySelector('#eMenu').onclick = () => openCampaignMenu(CAMP_ID);
  });
}

function allyPref() { try { return localStorage.getItem('daisenryaku_allyai') !== '0'; } catch (e) { return true; } }

// 劇情選擇
function openCampaignMenu(cid) {
  if (!cid) {
    const ids = Object.keys(CAMPAIGNS);
    openModal(`<h2>劇情・對戰</h2><div class="sub">選擇劇情戰役，或開一局自由對戰。劇情的戰果會影響後續章節與結局，部隊可以繼承到下一場。</div>
      <div class="campcards">${ids.map(id => {
        const C = CAMPAIGNS[id], st = (loadCamp(id), CAMP), total = C.tree.at(-1)[1].length;
        return `<button class="campcard" data-id="${id}" style="--c:${SIDES[C.player].color}">
          <div class="ctitle">${C.title}<small>${C.sub}</small></div><p>${C.desc}</p>
          <div class="cprog">結局 ${st.endings.length} / ${total}${st.current ? `　·　進行中：${MISSIONS[st.current].title}` : ''}</div></button>`;
      }).join('')}
      <button class="campcard free" id="freeCard" style="--c:#8a9aab">
        <div class="ctitle">自由對戰<small>16 國・隨機地圖</small></div><p>選擇雙方國家、地圖大小（小到終極大），對電腦或雙人輪流對戰。</p>
        <div class="cprog">⚔️ 開新局</div></button></div>
      <div class="row"><button class="close">關閉</button></div>`, box => {
      box.querySelector('.close').onclick = closeModal;
      box.querySelector('#freeCard').onclick = openNewGame;
      box.querySelectorAll('.campcard[data-id]').forEach(b => b.onclick = () => openCampaignMenu(b.dataset.id));
    }, true);
    return;
  }
  const C = CAMPAIGNS[cid];
  loadCamp(cid);
  const node = id => {
    const isEnd = !!ENDINGS[id];
    const name = isEnd ? ENDINGS[id].title : MISSIONS[id].title;
    const seen = isEnd ? CAMP.endings.includes(id) : CAMP.visited.includes(id);
    const cur = CAMP.current === id;
    return `<div class="node ${seen ? 'seen' : ''} ${cur ? 'cur' : ''} ${isEnd ? 'end' : ''}">${seen ? name : '？？？'}${cur ? ' ▶' : ''}</div>`;
  };
  openModal(`<h2>${C.title}・${C.sub}</h2>
    <div class="sub">你的選擇與戰果將改變戰爭的走向。共 ${C.tree.at(-1)[1].length} 種結局。</div>
    <div class="tree">${C.tree.map(([ch, ids]) => `<div class="tier"><span class="tlabel">${ch}</span><div class="tnodes">${ids.map(node).join('')}</div></div>`).join('')}</div>
    <div class="row"><button class="close">返回</button>
      ${CAMP.visited.length ? '<button id="cReset">從頭開始</button>' : ''}
      <button class="primary" id="cGo">${CAMP.current ? `繼續：${MISSIONS[CAMP.current].title}` : '開始戰役'}</button></div>`, box => {
    box.querySelector('.close').onclick = () => openCampaignMenu();
    const reset = box.querySelector('#cReset');
    if (reset) reset.onclick = () => {
      CAMP.current = C.start; CAMP.flags = {}; CAMP.roster = {}; CAMP.carryFunds = 0; saveCamp();
      startMission(C.start);
    };
    box.querySelector('#cGo').onclick = () => {
      if (!CAMP.current) { CAMP.current = C.start; CAMP.flags = {}; }
      startMission(CAMP.current);
    };
  });
}

// 對話播放：逐句點擊
function playDialog(lines, heading) {
  return new Promise(resolve => {
    if (!lines || !lines.length) return resolve();
    let k = 0;
    const render = () => {
      const [who, text] = lines[k], S = SPEAKERS[who] || SPEAKERS['旁白'];
      openModal(`${heading ? `<div class="dhead">${heading}</div>` : ''}
        <div class="dialog"><div class="portrait" style="--c:${S.color}">${S.icon}</div>
        <div class="dbody"><div class="dname">${who}${S.title ? `<small>${S.title}</small>` : ''}</div><div class="dtext">${text}</div></div></div>
        <div class="row"><button id="dlSkip" class="muted">略過</button><button class="primary" id="dlNext">${k < lines.length - 1 ? '下一句 ▸' : '確定'}</button></div>`, box => {
        box.querySelector('#dlNext').onclick = () => { k++; if (k >= lines.length) { closeModal(); resolve(); } else render(); };
        box.querySelector('#dlSkip').onclick = () => { closeModal(); resolve(); };
      });
    };
    render();
  });
}
