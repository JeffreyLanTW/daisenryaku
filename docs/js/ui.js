'use strict';
// ===== 介面與操作 =====

const $ = s => document.querySelector(s);
const UIS = {
  mode: 'idle',       // idle | selected | menu | target | busy
  sel: null, reach: null, attackSet: null, path: null, hover: null,
  origin: null, targets: null, inspect: null, inspectSet: null, lastReachHover: null,
};
const SETTINGS = { aiStep: 110, labels: true };
try { const l = localStorage.getItem('daisenryaku_labels'); if (l !== null) SETTINGS.labels = l === '1'; } catch (e) { /* 忽略 */ }
let modalDismissable = false, modalOpenedAt = 0;
let lastPointerType = 'mouse';
const isTouch = () => lastPointerType === 'touch' || lastPointerType === 'pen';
const SIZES = { s: [18, 13, '小'], m: [24, 15, '中'], l: [30, 19, '大'], xl: [40, 25, '超大'], xxl: [54, 33, '終極大'] };

const isHumanTurn = () => G && G.winner == null && !G.players[G.cur].ai;

// ----- 選取與移動 -----
function clearSel() {
  UIS.pendingTarget = null;
  UIS.orderPreview = null;
  UIS.mode = 'idle';
  UIS.sel = UIS.reach = UIS.attackSet = UIS.path = UIS.origin = UIS.targets = null;
  hideMenu();
}
function setInspect(u) {
  UIS.inspect = u;
  UIS.inspectSet = null;
  if (!u) return;
  const set = new Set(), d = UNITS[u.type];
  const from = isIndirect(u.type) ? [idxOf(u.x, u.y)] : [...computeReach(u)].filter(([, v]) => v.canStop).map(([i]) => i);
  for (const f of from) {
    const [fx, fy] = ixy(f);
    for (let i = 0; i < G.terrain.length; i++) {
      const [x, y] = ixy(i), dd = hexDist(fx, fy, x, y);
      if (dd >= d.range[0] && dd <= d.range[1]) set.add(i);
    }
  }
  UIS.inspectSet = set;
}
function selectUnit(u) {
  clearSel(); setInspect(null);
  sfx('click');
  UIS.lastUnit = u;
  UIS.sel = u;
  UIS.origin = { x: u.x, y: u.y, fuel: u.fuel };
  if (u.autoMoved) { UIS.mode = 'menu'; showMenu(u); refreshPanel(); return; }
  UIS.mode = 'selected';
  UIS.reach = computeReach(u);
  UIS.attackSet = new Set();
  if (isIndirect(u.type)) for (const t of targetsFrom(u, u.x, u.y)) UIS.attackSet.add(t.id);
  else for (const [i, v] of UIS.reach) {
    if (!v.canStop) continue;
    const [x, y] = ixy(i);
    for (const t of targetsFrom(u, x, y)) UIS.attackSet.add(t.id);
  }
  refreshPanel();
}
// 直接攻擊部隊：決定從哪一格出手
function attackTileFor(target) {
  const u = UIS.sel, d = UNITS[u.type];
  if (isIndirect(u.type)) return targetsFrom(u, u.x, u.y).includes(target) ? idxOf(u.x, u.y) : -1;
  const ok = i => {
    const v = UIS.reach.get(i);
    if (!v || !v.canStop) return false;
    const [x, y] = ixy(i), dd = hexDist(x, y, target.x, target.y);
    return dd >= d.range[0] && dd <= d.range[1];
  };
  if (UIS.lastReachHover != null && ok(UIS.lastReachHover)) return UIS.lastReachHover;
  let best = -1, bs = Infinity;
  for (const [i, v] of UIS.reach) {
    if (!ok(i)) continue;
    const s = v.cost - (d.cat === 'land' ? TERRAIN[G.terrain[i]].def / 10 : 0);
    if (s < bs) { bs = s; best = i; }
  }
  return best;
}
async function doMove(u, path, cost, stepMs) {
  if (path.length < 2) return;
  sfxMove(u);
  await animateMove(u, path, stepMs);
  const [x, y] = ixy(path[path.length - 1]);
  u.x = x; u.y = y;
  if (UNITS[u.type].fuel !== undefined) u.fuel -= cost;
  u.moved = true;
}
// 設定跨回合移動命令，並立即走到本回合能到的最遠處
function setMoveOrder(u, target) {
  UIS.prevOrder = u.order; UIS.newOrder = true;
  u.order = target;
  const step = orderStep(u, UIS.reach);
  if (step === target) u.order = null;
  showToast('🚩 已設定移動命令');
  moveSelectedTo(step, true);
}
// 回合開始時，有移動命令的部隊自動前進
async function runMoveOrders() {
  const token = gameToken;
  for (const u of G.units.filter(e => e.side === G.cur && e.order != null && !e.done)) {
    if (token !== gameToken || G.winner != null) return;
    if (idxOf(u.x, u.y) === u.order) { u.order = null; continue; }
    const reach = computeReach(u), step = orderStep(u, reach);
    if (step === idxOf(u.x, u.y)) continue;
    ensureVisible(u.x, u.y);
    await doMove(u, reachPath(reach, step), reach.get(step).cost, 70);
    u.autoMoved = true;
    if (step === u.order) u.order = null;
  }
}
async function moveSelectedTo(i, keepOrder = false) {
  const lv = UIS.reach && UIS.reach.get(i);
  if (lv && lv.load) {
    const u = UIS.sel, t = unitById(lv.load), reach = UIS.reach;
    UIS.mode = 'busy'; UIS.path = null;
    await doMove(u, reachPath(reach, i), reach.get(i).cost, 85);
    u.order = null;
    loadInto(u, t);
    sfx('build'); showToast(`已搭載至 ${UNITS[t.type].name}`);
    clearSel(); refreshPanel();
    return;
  }
  if (lv && lv.merge) {
    const u = UIS.sel, t = unitById(lv.merge), reach = UIS.reach;
    UIS.mode = 'busy'; UIS.path = null;
    await doMove(u, reachPath(reach, i), reach.get(i).cost, 85);
    mergeInto(u, t);
    sfx('build'); showToast(`合流完成：${UNITS[t.type].name} 兵力 ${t.hp}`);
    clearSel(); refreshPanel();
    return;
  }
  if (!keepOrder) { UIS.newOrder = false; if (UIS.sel.order != null) { UIS.prevOrder = UIS.sel.order; UIS.newOrder = true; UIS.sel.order = null; } }
  const u = UIS.sel, reach = UIS.reach;
  UIS.mode = 'busy'; UIS.path = null;
  await doMove(u, reachPath(reach, i), reach.get(i).cost, 85);
  UIS.reach = UIS.attackSet = null;
  UIS.mode = 'menu';
  showMenu(u);
  refreshPanel();
}
async function attackFromSelected(target) {
  const u = UIS.sel, i = attackTileFor(target);
  if (i < 0) return;
  const reach = UIS.reach;
  UIS.mode = 'busy'; UIS.path = null;
  if (i !== idxOf(u.x, u.y)) await doMove(u, reachPath(reach, i), reach.get(i).cost, 85);
  await executeAttack(u, target);
}
function cancelMove() {
  const u = UIS.sel, o = UIS.origin;
  if (!u || u.autoMoved) { clearSel(); return refreshPanel(); }
  if (UIS.newOrder) { u.order = UIS.prevOrder; UIS.newOrder = false; }
  u.x = o.x; u.y = o.y; u.fuel = o.fuel; u.moved = false;
  selectUnit(u);
}
function cancelAction() {
  if (UIS.mode === 'busy') return;
  if (UIS.mode === 'unload') { const t = UIS.unload.t; UIS.unload = null; UIS.mode = 'menu'; showMenu(t); return refreshPanel(); }
  if (UIS.mode === 'target') { UIS.mode = 'menu'; UIS.targets = null; showMenu(UIS.sel); }
  else if (UIS.mode === 'menu') cancelMove();
  else { clearSel(); setInspect(null); }
  refreshPanel();
}
async function performAttack(att, def, speed = 1) {
  const [ax, ay] = tileCenter(att.x, att.y), [dx, dy] = tileCenter(def.x, def.y);
  sfxFire(UNITS[att.type].base);
  if (isIndirect(att.type)) {
    FX.push({ kind: 'flash', x: ax, y: ay - 6, t0: performance.now(), dur: 300 });
    await sleep(260 * speed);
  } else await animLunge(att, dx, dy, 220 * speed);
  const res = resolveAttack(att, def);
  if (res.dmg > 0 || def.hp <= 0) sfx('explode', { big: def.hp <= 0 });
  fxBoom(dx, dy, def.hp <= 0);
  fxText(dx, dy, res.evaded ? '迴避!' : def.hp <= 0 ? '擊破!' : `-${res.dmg}`, res.evaded ? '#8fe3ff' : '#ffd166');
  await sleep(420 * speed);
  if (res.countered) {
    sfxFire(UNITS[def.type].base);
    if (res.counter > 0) audioTimer(() => sfx('explode', { big: att.hp <= 0 }), 120);
    fxBoom(ax, ay, att.hp <= 0);
    fxText(ax, ay, res.cEvaded ? '迴避!' : att.hp <= 0 ? '擊破!' : `-${res.counter}`, res.cEvaded ? '#8fe3ff' : '#ff9b8a');
    await sleep(420 * speed);
  }
  for (const u of res.promoted || []) {
    const [px, py] = tileCenter(u.x, u.y);
    fxText(px, py - 14, `升級：${RANKS[rankOf(u)].name}`, '#ffd34d');
  }
  removeDead();
  checkVictory();
  refreshPanel();
  return res;
}
async function executeAttack(att, def) {
  UIS.mode = 'busy'; hideMenu(); UIS.targets = null;
  await performAttack(att, def);
  finishUnit(att);
}
function finishUnit(u) {
  if (u.hp > 0) markDone(u);
  checkVictory();
  clearSel();
  refreshPanel();
  if (G.winner != null) showVictory();
}
function doCaptureAction(u) {
  const [cx, cy] = tileCenter(u.x, u.y);
  const took = doCapture(u);
  sfx(took ? 'capture' : 'foot');
  fxText(cx, cy, took ? '佔領！' : `佔領中 ${G.capture[idxOf(u.x, u.y)].pts}`, SIDES[u.side].light);
  finishUnit(u);
}

// ----- 點擊處理 -----
function handleClick(x, y) {
  if (!G || !inMap(x, y) || UIS.mode === 'busy') return;
  { const cu = unitAt(x, y); if (cu) UIS.lastUnit = cu; }
  if (UIS.mode === 'deploy') return deployClick(x, y);
  const u = unitAt(x, y);
  if (!isHumanTurn()) { setInspect(u && UIS.inspect !== u ? u : null); refreshPanel(); return; }
  switch (UIS.mode) {
    case 'idle':
      if (u && u.side === G.cur && UNITS[u.type].ally && G.allyAI) { setInspect(u); showToast('援軍由電腦指揮，結束回合時行動'); return refreshPanel(); }
      if (u && u.side === G.cur && !u.done) return selectUnit(u);
      if (u) { setInspect(UIS.inspect === u ? null : u); return refreshPanel(); }
      setInspect(null);
      if (buildOptions(x, y, G.cur).length) return openProduction(x, y);
      if (canLayRail(idxOf(x, y), G.cur)) return openRailConfirm(x, y);
      return refreshPanel();
    case 'selected': {
      const s = UIS.sel, i = idxOf(x, y);
      if (u && u.side !== s.side && UIS.attackSet.has(u.id)) {
        if (isTouch() && UIS.pendingTarget !== u) { UIS.pendingTarget = u; showToast('再點一次確認攻擊'); return refreshPanel(); }
        return attackFromSelected(u);
      }
      if (u === s) return moveSelectedTo(i);
      const r = UIS.reach.get(i);
      if (r && (r.canStop || r.merge)) return moveSelectedTo(i);
      if (!u && orderPath(s, i)) return setMoveOrder(s, i);
      clearSel();
      if (u && u.side === G.cur && !u.done) return selectUnit(u);
      if (u) setInspect(u);
      return refreshPanel();
    }
    case 'menu': return cancelMove();
    case 'unload': {
      const ul = UIS.unload, i = idxOf(x, y);
      if (ul.tiles.has(i)) {
        unloadAt(ul.t, ul.c, i); sfx('foot');
        ul.t.moved = true; UIS.origin = { x: ul.t.x, y: ul.t.y, fuel: ul.t.fuel }; ul.t.autoMoved = true;
      }
      UIS.unload = null; UIS.mode = 'menu'; showMenu(ul.t); refreshPanel();
      return;
    }
    case 'target':
      if (u && UIS.targets.includes(u)) {
        if (isTouch() && UIS.pendingTarget !== u) { UIS.pendingTarget = u; showToast('再點一次確認攻擊'); return refreshPanel(); }
        return executeAttack(UIS.sel, u);
      }
      return cancelAction();
  }
}
function handleHover(x, y) {
  if (!G) return;
  const prev = UIS.hover;
  if (prev && prev[0] === x && prev[1] === y) return;
  UIS.hover = [x, y];
  if (UIS.mode === 'selected' && inMap(x, y)) {
    const i = idxOf(x, y), u = unitAt(x, y), r = UIS.reach.get(i);
    if (r && (r.canStop || r.merge)) { UIS.lastReachHover = i; UIS.path = reachPath(UIS.reach, i); }
    else if (u && UIS.attackSet.has(u.id)) {
      const ai = attackTileFor(u);
      UIS.path = ai >= 0 ? reachPath(UIS.reach, ai) : null;
    } else if (!u) {
      const op = orderPath(UIS.sel, i);
      UIS.path = null;
      UIS.orderPreview = op;
      return refreshPanel();
    } else UIS.path = null;
    UIS.orderPreview = null;
  }
  refreshPanel();
}

// ----- 行動選單 -----
function showMenu(u) {
  const m = $('#actionMenu');
  m.innerHTML = '';
  const movedAway = u.autoMoved || u.x !== UIS.origin.x || u.y !== UIS.origin.y;
  const tg = !isIndirect(u.type) || !movedAway ? targetsFrom(u, u.x, u.y) : [];
  const add = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.innerHTML = label; b.className = cls;
    b.onclick = e => { e.stopPropagation(); fn(); };
    m.appendChild(b);
  };
  if (tg.length) add('⚔️ 攻擊', () => { UIS.mode = 'target'; UIS.targets = tg; hideMenu(); refreshPanel(); }, 'atk');
  for (const c of u.cargo || []) {
    if (c.done) continue;
    const tiles = unloadTiles(u, c);
    if (!tiles.length) continue;
    add(`${UNITS[c.type].cat === 'air' ? '🛫 起飛' : '⬇ 卸載'}：${UNITS[c.type].name}`, () => {
      UIS.mode = 'unload'; UIS.unload = { t: u, c, tiles: new Set(tiles) }; hideMenu(); refreshPanel();
    }, 'cap');
  }
  if ((u.cargo || []).length && UNITS[u.type].carry.runway && !TERRAIN[G.terrain[idxOf(u.x, u.y)]].prop) {
    add('<small>運輸機須停在據點上才能卸載</small>', () => {}, 'muted');
  }
  for (const k of evoOptions(u)) {
    add(`⬆ 進化：${UNITS[k].name} <small>💰${evoCost(u, k)}・${UNITS[k].model}</small>`, () => {
      evolve(u, k); sfx('capture');
      const [cx, cy] = tileCenter(u.x, u.y); fxText(cx, cy, '進化！', '#ffd34d');
      finishUnit(u);
    }, 'cap');
  }
  if (canCapture(u)) {
    const p = capturePointsLeft(u);
    add(`🚩 佔領 <small>${p}→${Math.max(0, p - u.hp)}</small>`, () => doCaptureAction(u), 'cap');
  }
  if (u.order != null) add('🚩 取消移動命令', () => { u.order = null; UIS.newOrder = false; showToast('已取消移動命令'); showMenu(u); refreshPanel(); }, 'muted');
  add('⏸ 待機', () => finishUnit(u));
  add(u.autoMoved ? '↩ 關閉' : '↩ 取消', () => cancelMove(), 'muted');
  m.classList.remove('hidden');
  positionMenu();
}
function hideMenu() { $('#actionMenu').classList.add('hidden'); }
function positionMenu() {
  const m = $('#actionMenu');
  if (m.classList.contains('hidden') || !UIS.sel) return;
  const [cx, cy] = tileCenter(UIS.sel.x, UIS.sel.y);
  let sx = (cx - cam.x) * cam.z + 34 * cam.z, sy = (cy - cam.y) * cam.z - 30;
  const [vw, vh] = viewSize();
  if (sx + m.offsetWidth > vw - 6) sx = (cx - cam.x) * cam.z - 34 * cam.z - m.offsetWidth;
  sy = Math.max(6, Math.min(vh - m.offsetHeight - 6, sy));
  m.style.left = sx + 'px'; m.style.top = sy + 'px';
}

// ----- 面板 -----
function atkTable(type) {
  const a = UNITS[type].atk;
  return `<div class="atk">${a.map((v, k) => `<span class="${v ? '' : 'zero'}"><b>${CLASS_SHORT[k]}</b>${v}</span>`).join('')}</div>`;
}
window.triggerEvo = function (uid, key) {
  const u = unitById(uid);
  if (!u || !UNITS[key]) return;
  evolve(u, key);
  if (typeof sfx === 'function') sfx('build');
  const [cx, cy] = tileCenter(u.x, u.y);
  if (typeof fxText === 'function') fxText(cx, cy, '革變進化！', '#38bdf8');
  refreshPanel();
  drawUnits();
};

function renderEvolutionTree(u) {
  if (noRank(u)) return '';
  const d = UNITS[u.type];
  const nat = u.nation || d.nation;
  const isApex = ['TSMC', 'USCORP'].includes(nat) || (d.maxHp && d.maxHp > 10 && (u.type.includes('TSMC') || u.type.includes('USCORP')));
  if (isApex) {
    return `<div class="evo-tree-card apex">
      <div class="evo-tree-title">👑 頂尖科技旗艦已革變</div>
      <div class="desc">${nat === 'TSMC' ? '🔬 搭載台積電極紫外光與矽光子尖端防護體系' : '🦅 搭載美商演算法自律協同與軌道火控戰術系統'}</div>
    </div>`;
  }
  const targets = typeof getGeEvoTargets === 'function' ? getGeEvoTargets(u) : [];
  if (!targets.length && (!d.next || !d.next.length)) return '';
  const r = rankOf(u);
  const i = idxOf(u.x, u.y), t = TERRAIN[G.terrain[i]];
  const onBase = G.owner[i] === u.side && t.heal && t.heal.includes(d.cat);
  const funds = G.funds[u.side] || 0;

  let html = `<div class="evo-tree-card">
    <div class="evo-tree-title">🧬 科技樹與革變方向</div>
    <div class="evo-branch-grid">`;

  // 制式國軍/各國後續型號
  if (d.next && d.next.length) {
    for (const k of d.next) {
      const ed = UNITS[k];
      const cost = evoCost(u, k);
      const unlocked = r >= ed.tier && onBase && funds >= cost && !u.done;
      let lockReason = '';
      if (r < ed.tier) lockReason = `需達 ${'★'.repeat(ed.tier)} ${RANKS[ed.tier].name}`;
      else if (!onBase) lockReason = '需在己方補給據點';
      else if (funds < cost) lockReason = `資金不足 ($${cost})`;
      else if (u.done) lockReason = '本回合已行動';
      html += `<div class="evo-node standard ${unlocked ? 'unlocked' : ''}">
        <div class="evo-node-header"><span class="evo-badge standard">制式晉級</span><b>${ed.name}</b></div>
        <div class="evo-specs">HP ${ed.maxHp || 10} · 💰${cost}</div>
        <div class="evo-desc">${ed.model}</div>
        ${unlocked ? `<button class="btn-evo-tree" onclick="triggerEvo(${u.id},'${k}')">⚡ 晉級升級</button>` : `<span class="evo-lock">🔒 ${lockReason}</span>`}
      </div>`;
    }
  }

  // 雙向革變分支（台積電神山 / 美商尖端）
  for (const k of targets) {
    const ed = UNITS[k];
    const isTsmc = k.includes('TSMC') || ed.nation === 'TSMC';
    const cost = evoCost(u, k);
    const unlocked = r >= 3 && onBase && funds >= cost && !u.done;
    let lockReason = '';
    if (r < 3) lockReason = `需達 ★★★ 王牌 (${u.xp || 0}/500 XP)`;
    else if (!onBase) lockReason = '需停駐己方可補給據點';
    else if (funds < cost) lockReason = `資金不足 ($${cost})`;
    else if (u.done) lockReason = '本回合已行動';

    html += `<div class="evo-node ${isTsmc ? 'tsmc' : 'uscorp'} ${unlocked ? 'unlocked' : ''}">
      <div class="evo-node-header"><span class="evo-badge ${isTsmc ? 'tsmc' : 'uscorp'}">${isTsmc ? '🔬 台積電神山' : '🦅 美商尖端'}</span><b>${ed.name}</b></div>
      <div class="evo-specs">HP ${ed.maxHp || 10} · 💰${cost} · ${CLASS_NAME[ed.cls]}</div>
      <div class="evo-desc">${ed.desc || ed.model}</div>
      ${unlocked ? `<button class="btn-evo-tree" onclick="triggerEvo(${u.id},'${k}')">⚡ 立即革變 (💰${cost})</button>` : `<span class="evo-lock">🔒 ${lockReason}</span>`}
    </div>`;
  }

  html += `</div></div>`;
  return html;
}

function xpHTML(u) {
  if (noRank(u)) return `<div class="desc">${NATIONS[UNITS[u.type].nation].army}無升級與進化（以量取勝）</div>`;
  const r = rankOf(u), R = RANKS[r], nx = RANKS[r + 1], xp = u.xp || 0;
  const pct = nx ? Math.round((xp - R.xp) / (nx.xp - R.xp) * 100) : 100;
  return `<div class="xprow"><span class="rankbadge r${r}">${r ? '★'.repeat(r) + ' ' : ''}${R.name}</span>
      <div class="xpbar r${r}"><i style="width:${pct}%"></i></div>
      <span class="xpnum">${nx ? `${xp}/${nx.xp}` : `${xp}・滿階`}</span></div>
    <div class="stats"><span>攻擊 +${Math.round((R.atk - 1) * 100)}%</span><span>迴避 ${Math.round(R.evade * 100)}%</span></div>`;
}

function unitHTML(u) {
  const d = UNITS[u.type], S = SIDES[u.side];
  const nat = u.nation || d.nation || S.nation;
  const ncol = typeof nationColor === 'function' ? nationColor(nat, u.side) : S.color;
  const flag = (typeof NATION_FLAGS !== 'undefined' && NATION_FLAGS[nat]) || '🌐';
  const natName = (NATIONS[nat] && NATIONS[nat].name) || nat;
  const maxHp = u.maxHp || d.maxHp || 10;
  const hpPct = Math.max(0, Math.min(100, Math.round((u.hp / maxHp) * 100)));
  const fuelPct = d.fuel ? Math.max(0, Math.min(100, Math.round(u.fuel / d.fuel * 100))) : 0;
  const fuelLow = d.fuel !== undefined && u.fuel <= d.upkeep * 3;
  const aura = typeof unitAura === 'function' ? unitAura(u) : { hasAura: false };
  const hasEscort = (d.base === 'carrier' || d.base === 'wingman_carrier') && typeof carrierEscort === 'function' && !!carrierEscort(u);
  const rng = d.range[0] === d.range[1] ? d.range[0] : `${d.range[0]}-${d.range[1]}`;

  return `<div class="uhead">
      <span class="dot" style="background:${ncol}"></span>
      <b class="uname">${d.name}</b>
      <span class="fac-pill" style="border-color:${ncol};color:${ncol}">${flag} ${natName}</span>
      <span class="tag">${CLASS_NAME[d.cls]}</span>
    </div>
    <div class="u-badges">
      ${hasEscort ? '<span class="badge-status escort">🛡️ CAP空優護衛中</span>' : ''}
      ${aura.hasAura ? '<span class="badge-status aura">✨ 戰術光環加成</span>' : ''}
      ${u.shipped ? '<span class="badge-status shipped">⚓ 兩棲載運搶灘</span>' : ''}
    </div>
    <div class="hpbar-wrap">
      <div class="hpbar"><i style="width:${hpPct}%;background:${u.hp <= maxHp * 0.3 ? '#e2574c' : u.hp <= maxHp * 0.6 ? '#e0b54a' : '#5cc26b'}"></i>
        <span>HP <b>${u.hp}</b> / ${maxHp}</span>
      </div>
    </div>
    <div class="unit-telemetry-grid">
      <div class="tele-item"><small>移動</small><b>${d.move}</b></div>
      <div class="tele-item"><small>射程</small><b>${rng}</b></div>
      <div class="tele-item"><small>兵種</small><b>${{ land: '陸軍', air: '空軍', sea: '海軍' }[d.cat] || d.cat}</b></div>
      <div class="tele-item"><small>承傷</small><b>${d.armor ? `×${d.armor.toFixed(2)}` : '1.00'}</b></div>
    </div>
    ${d.fuel !== undefined ? `<div class="fuel-row ${fuelLow ? 'low' : ''}"><span class="fuel-lbl">⛽ 燃料</span><div class="fuel-bar"><i style="width:${fuelPct}%"></i></div><span class="fuel-num">${u.fuel}/${d.fuel}</span></div>` : ''}
    ${xpHTML(u)}
    ${d.carry ? `<div class="desc cargo-desc">🚚 搭載 ${(u.cargo || []).length}/${d.carry.cap}：${(u.cargo || []).map(c => UNITS[c.type].name).join('、') || '空'}</div>` : ''}
    ${atkTable(u.type)}
    <div class="desc model-desc">${d.model}${d.jungle ? `・叢林 +${d.jungle}%` : ''}${d.stealth ? '・攻擊不受反擊' : ''}${u.order != null ? '<br>🚩 已設定移動命令' : ''}</div>
    ${renderEvolutionTree(u)}`;
}
function updateNextUnitButton() {
  const btn = $('#btnNext');
  if (!btn || !G) return;
  const human = isHumanTurn() && UIS.mode !== 'busy' && UIS.mode !== 'deploy';
  btn.disabled = !human;
  if (!human) {
    btn.className = '';
    btn.textContent = '下一部隊';
    btn.title = '下一個未行動部隊 (Tab)';
    return;
  }
  const unmoved = G.units.filter(u => u.side === G.cur && !u.done && !(UNITS[u.type].ally && G.allyAI));
  if (unmoved.length > 0) {
    btn.className = '';
    btn.textContent = `下一部隊 (${unmoved.length})`;
    btn.title = `下一個未行動部隊 (Tab) · 剩餘 ${unmoved.length} 隊未行動`;
  } else {
    const bases = typeof pendingProductionBases === 'function' ? pendingProductionBases(G.cur) : [];
    if (bases.length > 0 && !UIS.skippedBases) {
      btn.className = 'btn-prod';
      btn.textContent = `生產據點 (${bases.length})`;
      btn.title = `前往可生產據點 (Tab) · 剩餘 ${bases.length} 處可生產`;
    } else {
      btn.className = 'btn-ready-end primary';
      btn.textContent = '結束回合 ✓';
      btn.title = '所有行動與生產已就緒 · 點擊結束回合 (Tab)';
    }
  }
}
function refreshPanel() {
  if (!G) return;
  const S = SIDES[G.cur];
  $('#turnInfo').innerHTML = `第 <b>${G.turn}</b> 回合${isNight() ? ' · 🌙 夜間' : ''} · <span style="color:${S.light}">${S.name}${G.players[G.cur].ai ? '（電腦）' : ''}</span>`;
  $('#funds').innerHTML = SIDES.map((s, k) =>
    `<span class="pill ${k === G.cur ? 'active' : ''}" style="--c:${s.color}">${s.name} 💰${G.funds[k]} <small>+${incomeOf(k)}</small> · ${G.units.filter(u => u.side === k).length}隊</span>`).join('');
  $('#btnEnd').disabled = !isHumanTurn() || UIS.mode === 'busy' || UIS.mode === 'deploy';
  const btnAlly = $('#btnAllyCtrl');
  if (btnAlly) {
    const hasAllies = G.allies && G.allies.length > 0;
    btnAlly.classList.toggle('hidden', !hasAllies);
    btnAlly.textContent = G.allyAI ? '友軍: AI協同' : '友軍: 手動';
    btnAlly.classList.toggle('active', !!G.allyAI);
  }
  // 作戰結束後關閉結算畫面時，保留回到結算的入口
  const over = G.winner != null && $('#modal').classList.contains('hidden');
  $('#resultBar').classList.toggle('hidden', !over);
  if (over) $('#resultText').textContent = G.missionId ? (G.result && G.result.win ? '作戰成功' : '作戰失敗') : `${SIDES[G.winner].name} 勝利`;
  updateNextUnitButton();

  // 任務目標
  const oc = $('#objCard');
  oc.classList.toggle('hidden', !G.missionId);
  if (G.missionId) { const html = objectivesHTML(); if (oc._last !== html) { oc.innerHTML = html; oc._last = html; } }

  // 地形：游標（或觸控點選）所在格；沒有時顯示選取中／最後點選部隊的所在地
  const h = UIS.hover;
  const last = UIS.lastUnit && UIS.lastUnit.hp > 0 && G.units.includes(UIS.lastUnit) ? UIS.lastUnit : null;
  const focusU = UIS.sel || UIS.inspect || last;
  const hasH = h && inMap(h[0], h[1]);
  const th = hasH ? h : focusU ? [focusU.x, focusU.y] : null;
  if (th) {
    const i = idxOf(th[0], th[1]), t = TERRAIN[G.terrain[i]];
    let html = `<h3>${t.name}${hasH ? '' : '<small class="tilesrc">部隊所在地</small>'}</h3><div class="stats"><span>防禦 +${t.def}%</span>`;
    if (t.prop) {
      const o = G.owner[i];
      html += `<span>收入 ${t.income}</span><span style="color:${o >= 0 ? SIDES[o].light : '#ccc'}">${o >= 0 ? SIDES[o].name : '中立'}</span>`;
      if (G.capture[i]) html += `<span class="warn">佔領中 剩 ${G.capture[i].pts}</span>`;
    }
    html += '</div>';
    const mv = ['foot', 'tread', 'amph', 'air', 'sea'].map(m => {
      const c = t.cost[m];
      return `<span>${{ foot: '步行', tread: '履帶', amph: '兩棲', air: '飛行', sea: '海上' }[m]} ${c === undefined ? '✕' : c}</span>`;
    }).join('');
    html += `<div class="stats small">${mv}</div>`;
    if (t.build) html += `<div class="desc">可生產：${t.build.map(b => ({ land: '地面', air: '航空', sea: '海軍' }[b])).join('、')}部隊</div>`;
    $('#tileInfo').innerHTML = html;
  } else $('#tileInfo').innerHTML = `<h3>地形</h3><div class="desc">${isTouch() ? '點選地圖上的格子查看資訊' : '將游標移到地圖上查看資訊'}</div>`;

  // 部隊
  const hu = hasH ? unitAt(h[0], h[1]) : null;
  // 滑鼠指著的部隊 > 選取中 > 查看中 > 最後點選的部隊（仍存活時）
  const show = hu || focusU;
  $('#unitInfo').innerHTML = show ? unitHTML(show) : '<h3>部隊</h3><div class="desc">點擊己方部隊以選取；點擊空的首都/工廠/機場/港口可生產部隊。</div>';

  // 戰鬥預測
  const fc = $('#forecast');
  let fhtml = '';
  UIS.fc = null;
  if (hu && UIS.sel && hu.side !== UIS.sel.side) {
    let from = -1;
    if (UIS.mode === 'selected' && UIS.attackSet.has(hu.id)) from = attackTileFor(hu);
    if (UIS.mode === 'target' && UIS.targets.includes(hu)) from = idxOf(UIS.sel.x, UIS.sel.y);
    if (from >= 0) {
      const [fx, fy] = ixy(from), f = forecast(UIS.sel, hu, fx, fy);
      UIS.fc = { x: hu.x, y: hu.y, dmg: f.dmg, counter: f.counter, kill: f.dmg >= hu.hp };
      fhtml = `<h3>戰鬥預測</h3><div class="fc"><div><small>造成傷害</small><b class="good">${f.dmg}</b><small>${hu.hp}→${hu.hp - f.dmg}</small></div>
        <div><small>受到反擊</small><b class="bad">${f.counter}</b><small>${UIS.sel.hp}→${UIS.sel.hp - f.counter}</small></div></div>
        <div class="desc">實際傷害有 ±10% 浮動</div>`;
    }
  }
  fc.innerHTML = fhtml;
  fc.classList.toggle('hidden', !fhtml);

  // 戰報
  const log = $('#log');
  const html = G.log.slice(-40).reverse().map(l =>
    `<div style="border-color:${l.side >= 0 ? SIDES[l.side].color : '#666'}"><small>T${l.turn}</small> ${l.text}</div>`).join('');
  if (log._last !== html) { log.innerHTML = html; log._last = html; }
}

// ----- 對話框 -----
function openModal(html, onReady, dismissable = false) {
  modalDismissable = dismissable;
  if ($('#modal').classList.contains('hidden')) modalOpenedAt = performance.now();
  $('#resultBar').classList.add('hidden');
  $('#modalBox').innerHTML = html;
  $('#modal').classList.remove('hidden');
  onReady && onReady($('#modalBox'));
}
function closeModal() { $('#modal').classList.add('hidden'); if (G) refreshPanel(); }

function openProduction(x, y) {
  const opts = buildOptions(x, y, G.cur), f = G.funds[G.cur], t = TERRAIN[G.terrain[idxOf(x, y)]];
  openModal(`<h2>生產部隊 · ${t.name}</h2><div class="sub">可用資金 <b>💰${f}</b>　生產的部隊下回合才能行動</div>
    <div class="prod-list">${opts.map(k => {
      const d = UNITS[k], rng = d.range[0] === d.range[1] ? d.range[0] : `${d.range[0]}-${d.range[1]}`;
      return `<button class="prod" data-k="${k}" ${d.cost > f ? 'disabled' : ''}>
        <canvas width="96" height="72" data-k="${k}"></canvas>
        <div class="pinfo"><div class="pname">${d.name}<span class="pcost">💰${d.cost}</span></div>
        <div class="stats small"><span>移動 ${d.move}</span><span>射程 ${rng}</span><span>${CLASS_NAME[d.cls]}</span>${d.fuel ? `<span>燃料 ${d.fuel}</span>` : ''}</div>
        ${atkTable(k)}<div class="desc">${d.model}</div></div></button>`;
    }).join('')}</div>
    <div class="row"><button class="close">取消</button></div>`, box => {
    box.querySelectorAll('canvas[data-k]').forEach(c => {
      const g = c.getContext('2d');
      g.scale(2, 2);
      drawCounter(g, 24, 19, c.dataset.k, G.cur);
    });
    box.querySelectorAll('.prod').forEach(b => b.onclick = () => {
      produce(b.dataset.k, x, y, G.cur);
      sfx('build');
      UIS.lastBaseIdx = -1;
      closeModal(); refreshPanel();
    });
    box.querySelector('.close').onclick = closeModal;
  }, true);
}

const nationOptions = sel => NATION_IDS.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${NATIONS[id].name}・${NATIONS[id].doctrine}</option>`).join('');
const UNIQUE_BASES = ['marine', 'bomber', 'stealth'];
function nationCard(id, side) {
  const N = NATIONS[id], ncol = typeof nationColor === 'function' ? nationColor(id, side) : SIDES[side].color;
  const light = typeof isLightNation === 'function' && isLightNation(id);
  const miss = Object.keys(BASE_UNITS).filter(b => !N.units[b] && !UNIQUE_BASES.includes(b)).map(b => BASE_DESC[b] ? ({ rocket: '火箭', sam: '長程防空', marine: '陸戰隊' }[b] || b) : b);
  const uniq = UNIQUE_BASES.filter(b => N.units[b]).map(b => N.units[b][0]);
  const flag = (typeof NATION_FLAGS !== 'undefined' && NATION_FLAGS[id]) || '🌐';
  const reps = typeof getRepresentativeUnits === 'function' ? getRepresentativeUnits(id, side) : [];
  return `<div class="fac-card" style="--c:${ncol}">
    <div class="fac-header">
      <span class="fac-flag">${flag}</span>
      <div class="fac-title-block">
        <b><span class="nat-badge" style="background:${ncol};color:${light ? '#0f172a' : '#fff'};border:1px solid ${light ? '#64748b' : 'rgba(255,255,255,0.2)'}">${id}</span> ${N.full}</b>
        <small>作戰偏好：${N.doctrine}</small>
      </div>
    </div>
    <p>${N.desc}</p>
    <div class="desc">${uniq.length ? `特殊兵種：<b>${uniq.join('、')}</b>　` : ''}${miss.length ? `缺少：<span style="color:#ef4444">${miss.join('、')}</span>` : ''}</div>
    ${reps.length ? `<div class="fac-showcase">
      <div class="showcase-label">主力裝備剪影：</div>
      <div class="showcase-icons">
        ${reps.map(u => `
          <span class="showcase-unit" title="${u.name} (${u.model})">
            <img src="${unitIconDataURL(u)}" class="showcase-img" alt="${u.name}">
            <span>${u.name}</span>
          </span>
        `).join('')}
      </div>
    </div>` : ''}
  </div>`;
}
function openRailConfirm(x, y) {
  openModal(`<h2>🛤 鋪設鐵路</h2><div class="sub">在此格延伸鐵路網，花費 💰${RAIL_COST}（目前資金 💰${G.funds[G.cur]}）。列車可沿鐵路快速運兵。</div>
    <div class="row"><button class="close">取消</button><button class="primary" id="railGo">鋪設</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#railGo').onclick = () => { layRail(idxOf(x, y), G.cur); sfx('build'); closeModal(); buildTerrain(); refreshPanel(); };
  }, true);
}
function openNewGame() {
  const p = G ? G.players : [{ ai: false }, { ai: true }];
  const nat = G && G.nations && !G.missionId ? G.nations : ['TW', 'CN'];
  openModal(`<h2>新遊戲</h2>
    <div class="form">
      <label>地圖大小<select id="ngSize">${Object.entries(SIZES).map(([k, [w, h, n]]) => `<option value="${k}" ${k === 'm' ? 'selected' : ''}>${n}（${w}×${h}）</option>`).join('')}</select></label>
      <label>地圖種子<span class="inline"><input id="ngSeed" type="number" value="${Math.floor(Math.random() * 99999)}"><button id="ngRand" type="button">🎲</button></span></label>
      <label><span><span class="dot" style="background:${SIDES[0].color}"></span>藍方（先攻）</span><select id="ngN0">${nationOptions(nat[0])}</select></label>
      <label>操作<select id="ngP0"><option value="h">玩家</option><option value="ai" ${p[0].ai ? 'selected' : ''}>電腦</option></select></label>
      <label><span><span class="dot" style="background:${SIDES[1].color}"></span>紅方</span><select id="ngN1">${nationOptions(nat[1])}</select></label>
      <label>操作<select id="ngP1"><option value="h">玩家</option><option value="ai" ${p[1].ai ? 'selected' : ''}>電腦</option></select></label>
      <label>電腦速度<select id="ngSpeed"><option value="200">慢</option><option value="110" selected>普通</option><option value="45">快</option></select></label>
    </div>
    <div class="facs" id="ngCards"></div>
    <div class="row"><button class="close">取消</button><button id="ngStart" class="primary">開始作戰</button></div>`, box => {
    const cards = () => { box.querySelector('#ngCards').innerHTML = nationCard(box.querySelector('#ngN0').value, 0) + nationCard(box.querySelector('#ngN1').value, 1); };
    cards();
    box.querySelector('#ngN0').onchange = cards; box.querySelector('#ngN1').onchange = cards;
    box.querySelector('#ngSpeed').value = String(SETTINGS.aiStep);
    box.querySelector('#ngRand').onclick = () => box.querySelector('#ngSeed').value = Math.floor(Math.random() * 99999);
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#ngStart').onclick = () => {
      const [w, h] = SIZES[box.querySelector('#ngSize').value];
      SETTINGS.aiStep = +box.querySelector('#ngSpeed').value;
      closeModal();
      startGame({
        w, h, seed: +box.querySelector('#ngSeed').value || 1,
        nations: [box.querySelector('#ngN0').value, box.querySelector('#ngN1').value],
        players: [{ ai: box.querySelector('#ngP0').value === 'ai' }, { ai: box.querySelector('#ngP1').value === 'ai' }],
      });
    };
  });
}

// 國家圖鑑：支援 16 國陣營總覽與特定國家兵種規格詳情（含 Q 版剪影與層級返回導覽）
function openNations(sel, backFn, fromTitle) {
  if (!sel || sel === 'all' || sel === 'list') {
    return openNationsOverview(backFn, fromTitle);
  }
  return openNationDetail(sel, () => openNationsOverview(backFn, fromTitle), backFn, fromTitle);
}

function openNationsOverview(backFn, fromTitle) {
  openModal(`<h2>📚 國家圖鑑 <span class="ver-badge">16 國</span></h2>
    <div class="desc" style="margin-bottom:10px">點擊任一國家卡片，查看詳細作戰特性、兵種數據與全武器裝備剪影：</div>
    <div class="nations-grid">
      ${NATION_IDS.map(id => {
        const N = NATIONS[id];
        const ncol = typeof nationColor === 'function' ? nationColor(id, 0) : '#2563eb';
        const light = typeof isLightNation === 'function' && isLightNation(id);
        const flag = (typeof NATION_FLAGS !== 'undefined' && NATION_FLAGS[id]) || '🌐';
        const reps = typeof getRepresentativeUnits === 'function' ? getRepresentativeUnits(id, 0) : [];
        return `<div class="fac-card nat-grid-item" data-id="${id}" style="--c:${ncol}">
          <div class="fac-header">
            <span class="fac-flag">${flag}</span>
            <div class="fac-title-block">
              <b><span class="nat-badge" style="background:${ncol};color:${light ? '#0f172a' : '#fff'};border:1px solid ${light ? '#64748b' : 'rgba(255,255,255,0.2)'}">${id}</span> ${N.name}・${N.army}</b>
              <small>作戰偏好：${N.doctrine}</small>
            </div>
          </div>
          <p style="font-size:11.5px;margin:5px 0 6px">${N.desc.slice(0, 52)}…</p>
          <div class="fac-showcase" style="margin-top:4px;padding-top:4px">
            <div class="showcase-icons">
              ${reps.map(u => `
                <span class="showcase-unit" title="${u.name} (${u.model})">
                  <img src="${unitIconDataURL(u)}" class="showcase-img" alt="${u.name}">
                  <span>${u.name}</span>
                </span>
              `).join('')}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="row">
      ${backFn ? `<button id="ovBack" class="primary">← 返回${fromTitle || '上一頁'}</button>` : ''}
      <span class="spacer"></span>
      <button class="close ${backFn ? '' : 'primary'}">關閉</button>
    </div>`, box => {
    box.querySelectorAll('.nat-grid-item').forEach(el => {
      el.onclick = () => {
        openNationDetail(el.dataset.id, () => openNationsOverview(backFn, fromTitle), backFn, fromTitle);
      };
    });
    if (box.querySelector('#ovBack')) {
      box.querySelector('#ovBack').onclick = () => { if (backFn) backFn(); else closeModal(); };
    }
    box.querySelector('.close').onclick = closeModal;
  }, true);
}

function openNationDetail(sel, prevFn, rootBackFn, fromTitle) {
  sel = sel || (G && G.nations ? G.nations[0] : 'TW');
  const N = NATIONS[sel];
  const rows = Object.keys(N.units).map(b => nationUnit(sel, b, 0)).filter(Boolean);
  const flag = (typeof NATION_FLAGS !== 'undefined' && NATION_FLAGS[sel]) || '🌐';
  openModal(`<h2>📚 國家圖鑑 <small>・ ${flag} ${N.name}</small></h2>
    <div class="comp-nav">
      <button id="ndBackNav" class="primary">← 返回國家總覽</button>
      <label class="comp-select-wrap">
        <span>快速切換：</span>
        <select id="nsSel">${nationOptions(sel)}</select>
      </label>
    </div>
    <div class="facs one">${nationCard(sel, 0)}</div>
    <div class="tablewrap"><table class="ut"><tr><th>兵種</th><th>型號</th><th>價格</th><th>移動</th><th>射程</th><th>步</th><th>甲</th><th>空</th><th>艦</th></tr>
    ${rows.map(d => `<tr class="${UNIQUE_BASES.includes(d.base) ? 'uniq' : ''}">
      <td><span class="unit-icon-cell"><img src="${unitIconDataURL(d)}" class="ut-icon" alt="${d.name}">${d.name}</span></td>
      <td class="model">${d.model}${d.armor ? `<small>（承傷×${d.armor.toFixed(2)}）</small>` : ''}${d.jungle ? `<small>（叢林+${d.jungle}%）</small>` : ''}</td>
      <td>${d.cost}</td><td>${d.move}</td><td>${d.range.join('-')}</td>
      ${d.atk.map(v => `<td class="${v ? '' : 'zero'}">${v}</td>`).join('')}
    </tr>`).join('')}</table></div>
    <div class="desc">裝備以 1990 年代初期為準，數值為遊戲平衡後的抽象化表現。</div>
    <div class="row">
      <button id="ndBackBottom">← 返回國家總覽</button>
      ${rootBackFn ? `<button id="ndRootBack">← 返回${fromTitle || '上一頁'}</button>` : ''}
      <span class="spacer"></span>
      <button class="close">關閉</button>
    </div>`, box => {
    box.querySelector('#nsSel').onchange = e => openNationDetail(e.target.value, prevFn, rootBackFn, fromTitle);
    const goPrev = () => { if (prevFn) prevFn(); else openNationsOverview(rootBackFn, fromTitle); };
    box.querySelector('#ndBackNav').onclick = goPrev;
    box.querySelector('#ndBackBottom').onclick = goPrev;
    if (box.querySelector('#ndRootBack')) {
      box.querySelector('#ndRootBack').onclick = () => { if (rootBackFn) rootBackFn(); else closeModal(); };
    }
    box.querySelector('.close').onclick = closeModal;
  }, true);
}

function openHelp() {
  openModal(`<h2>作戰說明 <span class="ver-badge">v66</span></h2><div class="help">
    <h4>勝利條件</h4><p>以步兵類部隊<b>佔領敵方首都</b>，或<b>殲滅全部敵軍</b>。劇情任務另有各自的目標。</p>
    <h4>基本操作</h4><ul>
      <li>點擊己方部隊 → 藍色格為可移動範圍，紅色為可攻擊目標。</li>
      <li>點擊目的地後選擇行動：攻擊、佔領、待機或取消。直接點擊紅色敵軍可自動移動並攻擊。</li>
      <li><b>移動命令</b>：點擊範圍外的地點，部隊會設定該處為最終目的地，之後每回合開始自動前進（右下角黃旗）。選取部隊後可取消命令。</li>
      <li>拖曳平移地圖、滾輪/雙指縮放；取消選取可按地圖下方的「✕ 取消」、右鍵或 Esc；Tab 切換下一個未行動部隊。</li>
      <li>點擊敵軍可查看其威脅範圍（橘色）。</li>
      <li><b>合流</b>：同型、同陣營且至少一方受損的部隊，移動到另一支身上（<span style="color:#5ad87a">綠色格</span>）即可合併兵力；經驗值依兵力加權平均，合流後本回合不能再行動。</li>
      <li><b>夜間</b>：部分劇情任務有夜間回合（畫面變暗、上方顯示 🌙）；夜間直接攻擊 −20%、間接火力缺乏觀測 −40%。</li>
      <li><b>要員（★）</b>：劇情中標示 ★ 的指揮組等要員陣亡即作戰失敗，要讓它遠離敵軍火力。</li></ul>
    <h4>經濟與生產</h4><ul>
      <li>每回合依據點獲得收入：首都 300、工廠 150、其他 100。</li>
      <li>點擊己方空的<b>首都/工廠</b>生產地面部隊、<b>首都/機場</b>生產航空部隊、<b>港口</b>生產艦艇。</li>
      <li>部隊停在己方據點上，回合開始時恢復 2 HP（花費部隊價格的 10%/HP），飛機需回首都或機場補充燃料，燃料耗盡會墜毀。</li></ul>
    <h4>戰鬥與航母護衛</h4><ul>
      <li>傷害 = 攻擊力 × (HP/10) × (1 − 地形防禦)，±10% 浮動。受損部隊攻擊力下降。</li>
      <li><b>航母打擊群與 CAP 護衛攔截</b>：航母具備 20~24 點超高耐久與防空近防；若航母搭載空優戰機或 2 格內有友軍戰機，遭受敵方空襲時會觸發 CAP 防空攔截，大幅減免空襲傷害並實施反擊！位於航母上或相鄰 1 格內的友軍飛機每回合自動補給燃料與維修 +2 HP。</li>
      <li><b>戰術光環與澤火革雙向革變</b>：TSMC EUV要塞（2格內友軍承傷×0.9）與美商火控艦機（2格內友軍攻擊×1.1）；三星王牌部隊在友軍基地可直接於部隊卡片觸發台積電與美商科技雙向「革變」！</li>
      <li>相鄰的直接攻擊會遭到反擊；<b>自走砲、火箭、防空飛彈</b>為間接攻擊，不會被反擊，但移動後不能射擊。</li>
      <li><b>陸戰隊</b>可以渡海（海上移動消耗 2）並登陸佔領，但在海上沒有地形掩護。</li>
      <li>地面部隊進入敵方地面部隊相鄰格會被<b>控制區</b>攔下，飛機不受影響。</li>
      <li>佔領：步兵類部隊每回合扣除等同 HP 的佔領點（總共 20），離開或陣亡則重置。</li></ul>
    <h4>國家與 AI 教條</h4><p>11 個陣營各有專屬 AI 作戰教條、專屬色系與作戰偏好（詳見國家圖鑑）。頂部列可隨時切換「友軍手動指揮」與「友軍 AI 協同」。</p>
    <details class="changelog-box">
      <summary>📜 開發歷史與版本紀錄 (Changelog)</summary>
      <div class="changelog-list">
        <div class="cl-item"><span class="cl-ver">v66</span><span class="cl-date">2026.10.26</span><p>首頁新增「測試地圖」試驗場入口，推出 20×20 初階（輕裝演習）、30×30 中階（中原爭鋒）與 40×40 高階（鐵血縱深）三梯次戰區；預覽卡片即時依拓撲遙測公式呈現難度標籤（EASY/MEDIUM/HARD）、據點歸屬比（城市/工廠/機場 [我:中:敵]）與兵力/資產不對稱比；支援視角自動縮放至 40×40 大圖。</p></div>
        <div class="cl-item"><span class="cl-ver">v65</span><span class="cl-date">2026.10.26</span><p>擴充無頭模擬器 CLI 地圖拓撲與平衡基準分析工具（--analyze）：量化據點陣營比例、指揮部奪點步數、初始兵力與資產/首回收入不對稱度，並確立四階地圖生成與難度分級規範（Tier S–C）。</p></div>
        <div class="cl-item"><span class="cl-ver">v64</span><span class="cl-date">2026.10.25</span><p>參考世嘉／FC 大戰略資料強化遊戲：新增「合流」（MD スーパー大戰略式，同型受損部隊合併兵力）、劇情「夜間」回合（ADVANCED WORLD WAR 晝夜制，夜間攻擊力下降、畫面變暗）、要員（★）護衛（鋼鉄の戦風司令部式）。乾卦篇強化：初九加入潛龍指揮組、九三夜戰、九四作戰代號「島嶼戰役」、各章額外目標影響後續戰局（少一波登陸、增派艦艇與戰機、菲律賓援軍）、新增真結局「乾元：元亨利貞」，並重新平衡。</p></div>
        <div class="cl-item"><span class="cl-ver">v63</span><span class="cl-date">2026.10.25</span><p>新劇情「2031 乾為天・六龍御天」：依《易經》乾卦六爻，初九潛龍勿用（花東縱谷）、九二見龍在田（嘉南平原，美軍會師）、九三終日乾乾（中部海岸晝夜波狀登陸）、九四或躍在淵（可選渡海奪港或固守，影響下一章兵力）、九五飛龍在天（美日聯合擊沉敵航艦戰鬥群）、上九亢龍有悔（攻陷敵都得「亢龍有悔」，持盈守成得「用九・群龍无首，吉」）；共 6 章 3 結局，經 AI 對戰平衡。</p></div>
        <div class="cl-item"><span class="cl-ver">v62</span><span class="cl-date">2026.10.25</span><p>【熱修復】主選單版號標章同步校準；嚴格鎖定右側欄層級順序（部隊資訊卡置頂於小地圖正下方，優先於章節任務、地形與戰報），全裝置與不同解析度下無需滾動即可即時掌握部隊狀態。</p></div>
        <div class="cl-item"><span class="cl-ver">v61</span><span class="cl-date">2026.10.25</span><p>【澤火革・第一島鏈變易大改版】重磅推出 64x64 易經 49 卦戰役全 6 章；開放動態 maxHp（旗艦 14~24、蜂群 6~8）；新增 11 國戰略教條 AI；航母打擊群防空護航（CAP 空中巡邏攔截減免空襲傷害並反擊）、航母相鄰戰機自動補給油修；新增台積電矽盾光環與美商演算法火控；右側欄全面優化部隊資訊卡、嵌入雙向革變科技樹；支援頂部「友軍操控模式」即時切換。</p></div>
        <div class="cl-item"><span class="cl-ver">v60</span><span class="cl-date">2026.10.25</span><p>iPad 主畫面網頁 App 異音已確認排除（成因為 iOS 系統音訊程序卡住循環播放）；移除測試用「音訊模式」選單與 HTML 相容音樂引擎，保留主畫面 App 的 ambient 音訊工作階段與取樣率修正。</p></div>
        <div class="cl-item"><span class="cl-ver">v59</span><span class="cl-date">2026.10.25</span><p>iPad 主畫面網頁 App 音訊工作階段改為 ambient（原為 playback）：鎖定螢幕與休眠時由系統自動靜音、不再於背景持續播放；系統凍結頁面前亦先行靜音。</p></div>
        <div class="cl-item"><span class="cl-ver">v58</span><span class="cl-date">2026.10.25</span><p>新增「音訊模式」選單（自動／原始／固定 48kHz／固定 44.1kHz／相容模式），供 iPad 主畫面網頁 App 實機逐一測試；相容模式將背景音樂轉為 WAV 交由 HTML 媒體播放器播放，完全繞過 Web Audio 輸出。</p></div>
        <div class="cl-item"><span class="cl-ver">v57</span><span class="cl-date">2026.10.25</span><p>針對 iPad「加入主畫面」網頁 App 的重複怪音與音高／速度錯誤：修正 iOS AudioContext 取樣率錯配 bug（建立後播放空白樣本、關閉並重建 context），並將 iOS 音訊工作階段固定為 playback；僅於主畫面 App 模式套用，Safari／Chrome 分頁不受影響；選單診斷資訊加入延遲與音訊工作階段類型。</p></div>
        <div class="cl-item"><span class="cl-ver">v56</span><span class="cl-date">2026.10.25</span><p>修正 iPad「加入主畫面」網頁 App 重複怪音、音樂與怪音並放及音高／速度錯誤：整個工作階段只使用單一 AudioContext，靜音與轉入背景時不再 suspend／close（避免硬體輸出卡住重複播放與重建 context 取樣率錯誤），改為停止所有節點並將增益歸零；主畫面 App 回到前景時自動檢查新版本並顯示更新按鈕；選單顯示音訊診斷資訊。</p></div>
        <div class="cl-item"><span class="cl-ver">v55</span><span class="cl-date">2026.10.25</span><p>修正 iPad Mini 關閉音樂／音效後仍持續播放背景音樂：關閉音樂時直接關閉整個 AudioContext 並於同一觸控內重建音效專用 context，釋放硬體輸出，WebKit 未生效的 stop()／disconnect()／suspend() 不再殘留聲音；音樂與音效全關時不保留任何音訊引擎；頁面離開或進入 bfcache 時亦自動關閉，避免背景舊頁面持續播放。</p></div>
        <div class="cl-item"><span class="cl-ver">v54</span><span class="cl-date">2026.10.25</span><p>iPad Mini 音訊全面修正：AudioContext 解鎖改用單一 resume 互斥鎖與 BGM 世代權杖，杜絕觸控雙重觸發造成的雙重背景音樂；建立音效聲部與延遲計時器註冊表，音樂／音效全關時硬性清除所有排程、主增益歸零並暫停音訊引擎；柔化銅管與貝斯泛音、加入 7kHz 柔化低通、75Hz 次低頻高通與峰值限幅器，降低單聲部增益與平滑起音，消除小喇叭刺耳與破音。</p></div>
        <div class="cl-item"><span class="cl-ver">v53</span><span class="cl-date">2026.10.25</span><p>徹底修復 iPad Mini 6 音樂無法關閉、無法切換曲目與串音問題：廢除 WebKit 非同步 OfflineAudioContext，改用 100% 同步零延遲 PCM 波形合成與單音閘門控制（前後音符絕不重疊）；關閉音樂時實體斷開音訊匯流排；修正選單視窗連續點擊 0.4 秒防誤觸攔截問題。</p></div>
        <div class="cl-item"><span class="cl-ver">v52</span><span class="cl-date">2026.10.25</span><p>修正 iPad Mini 6 / iOS Safari 雙重背景音樂重疊問題：徹底移除殘留的舊版單音主旋律與高頻琶音軌、改為純粹一體化的工業管弦合奏，並建立 iOS WebKit 多重觸控與非同步渲染互斥鎖（同步強制斷開舊音源節點）。</p></div>
        <div class="cl-item"><span class="cl-ver">v51</span><span class="cl-date">2026.10.25</span><p>導入 90 年代《大戰略》工業管弦無縫迴圈 BGM 引擎（48kHz 離線立體聲渲染、尾韻交叉淡化零交越接縫、-16 LUFS 母帶響度校準與中高頻挖空濾波，確保戰術音效清晰穿透）。</p></div>
        <div class="cl-item"><span class="cl-ver">v50</span><span class="cl-date">2026.10.25</span><p>全面重製 Web Audio 戰術音效引擎：導入 1/f 粉紅噪音濾波消除刺耳白噪音、修正 iOS/Safari 暫停佇列爆音與按鈕音效重疊問題，重新調校 15 種武器射擊、爆炸、載具移動與戰術號角音效。</p></div>
        <div class="cl-item"><span class="cl-ver">v49</span><span class="cl-date">2026.10.24</span><p>修復 iPad / iOS Safari 從 iCloud Drive 匯入存檔問題：採用原生 DOM 觸發結構解決 WebKit 手勢限制、放寬 MIME 格式防止檔案反灰不可選取、改以 FileReader 串流讀取，並新增「貼上代碼匯入」與「匯出複製至剪貼簿」雙重備援。</p></div>
        <div class="cl-item"><span class="cl-ver">v48</span><span class="cl-date">2026.10.24</span><p>「下一部隊」按鈕動態狀態切換：顯示未行動部隊剩餘數量，當全軍行動完畢且無可生產據點時，按鈕動態轉化為「結束回合 ✓」高亮就緒狀態；支援 Tab 鍵全回合無縫串接操作。</p></div>
        <div class="cl-item"><span class="cl-ver">v47</span><span class="cl-date">2026.10.24</span><p>側欄佈局優化：調整右側欄元件顯示順序，將「章節任務卡」緊接置於「小地圖」正下方，其下依序排列「地形資訊」與「部隊資訊」，作戰目標與地形地貌一目了然。</p></div>
        <div class="cl-item"><span class="cl-ver">v46</span><span class="cl-date">2026.10.24</span><p>升級「國家圖鑑」：整合 16 國國旗、專屬色徽章與主力兵種剪影展示；兵種規格表完整整合 Q 版圖示；新增層級式導覽與「返回上一頁 / 返回國家總覽」按鈕，查閱體驗更流暢直覺。</p></div>
        <div class="cl-item"><span class="cl-ver">v45</span><span class="cl-date">2026.10.24</span><p>部隊圖示改為 Q 版卡通軍武風格，步兵系改以大尺寸卡通鋼盔呈現（步兵星章鋼盔、反甲火箭筒鋼盔、陸戰隊船錨海浪鋼盔）；日本自衛隊改為純白色系，戰場各國顏色鮮明區隔。</p></div>
        <div class="cl-item"><span class="cl-ver">v44</span><span class="cl-date">2026.10.24</span><p>部隊圖示全面改版為「老花友善高對比單色系剪影」：移除方框外框、依 16 國專屬色系單色繪製、放大簡化兵種幾何特徵與血量/名稱標籤，一眼輕鬆辨識。</p></div>
        <div class="cl-item"><span class="cl-ver">v43</span><span class="cl-date">2026.10.24</span><p>全面盤點並增設戰役與自由對戰地圖前進機場；提升各型航空機油箱容量與降低巡航油耗；強化 AI 戰機返航避讓與機場容量控管，大幅降低墜機耗損。</p></div>
        <div class="cl-item"><span class="cl-ver">v42</span><span class="cl-date">2026.10.24</span><p>全面強化電腦 AI 陸海空運輸與兩棲登陸邏輯（動態建造運輸載具、自動集結登船/登機、跨海搶灘卸載與奪島）；升級無頭模擬器零干擾極簡遙測統計。</p></div>
        <div class="cl-item"><span class="cl-ver">v41</span><span class="cl-date">2026.10.24</span><p>新增專屬大戰略風格 SVG 瀏覽器圖示（六角格與主力戰車徽章）及 iOS/iPadOS 主畫面圖示支援。</p></div>
        <div class="cl-item"><span class="cl-ver">v40</span><span class="cl-date">2026.10.24</span><p>合併「直」與「空」兵種分類為統一的「空」（步/甲/空/艦），強化攻擊直升機反裝甲獵殺定位；9 首背景音樂依配置、關卡戰場與勝利情境自動切換。</p></div>
        <div class="cl-item"><span class="cl-ver">v39</span><span class="cl-date">2026.10.24</span><p>修復背景音樂重疊播放問題（單例播放鎖定與振盪器即時清除）；新增 8 首 90 年代大戰略風格合成軍武曲目與曲目選單。</p></div>
        <div class="cl-item"><span class="cl-ver">v38</span><span class="cl-date">2026.10.24</span><p>新增背景音樂「深海潛航・紅色十月」（D 小調合唱銅管、定音鼓、聲納），可由地圖右下角 🎼 或選單切換曲目。</p></div>
        <div class="cl-item"><span class="cl-ver">v37</span><span class="cl-date">2026.10.24</span><p>版本紀錄日期精確到「日」。</p></div>
        <div class="cl-item"><span class="cl-ver">v36</span><span class="cl-date">2026.10.24</span><p>部隊卡片精簡：移除價格、射程、移動；字體放大；進化路線與剩餘燃料改為醒目標示（燃料不足時紅色閃爍警示）。</p></div>
        <div class="cl-item"><span class="cl-ver">v35</span><span class="cl-date">2026.10.24</span><p>主選單標題旁新增版本號標籤。</p></div>
        <div class="cl-item"><span class="cl-ver">v34</span><span class="cl-date">2026.10.24</span><p>修正小螢幕（iPad Mini）配置畫面遮擋地圖上方格子無法點擊的問題：配置列改為停靠於地圖下方。</p></div>
        <div class="cl-item"><span class="cl-ver">v33</span><span class="cl-date">2026.10.24</span><p>修復說明視窗模板字串語法錯誤；優化 iPad Mini 與觸控螢幕首回配置介面佈局（支援名單收合折疊）；補齊 v1–v25 歷史重大里程碑紀錄。</p></div>
        <div class="cl-item"><span class="cl-ver">v31</span><span class="cl-date">2026.10.24</span><p>專案發布目錄架構重組（隔離 tools 與 docs 生產資產），新增說明視窗版本號與開發歷史展示。</p></div>
        <div class="cl-item"><span class="cl-ver">v30</span><span class="cl-date">2026.10.23</span><p>戰役同陣營援軍預設改為玩家手動指揮；船艦移動力降為 3；部隊圖示全面依各國真實型號與迷彩重繪；解放軍改以人海數量平衡機制。</p></div>
        <div class="cl-item"><span class="cl-ver">v29</span><span class="cl-date">2026.10.23</span><p>新增「福爾摩沙之盾」後三章 54×33 超大地圖（全島防衛、台海制海、第一島鏈）；各章 AI 勝率與繼承部隊難度平衡。</p></div>
        <div class="cl-item"><span class="cl-ver">v28</span><span class="cl-date">2026.10.22</span><p>新增劇情戰役「福爾摩沙之盾」：台灣主角部隊跨章節延續養成，支援美軍/日本自衛隊/菲律賓援軍；敵軍老兵化與配置回合機制。</p></div>
        <div class="cl-item"><span class="cl-ver">v27</span><span class="cl-date">2026.10.21</span><p>導入 16 個真實國家裝備與陣營平衡科技樹；新增「第三次世界大戰」分支劇情戰役。</p></div>
        <div class="cl-item"><span class="cl-ver">v26</span><span class="cl-date">2026.10.21</span><p>完善存檔系統（具名存檔欄、自動存檔、匯出匯入）；手機橫向 UI 優化；支援跨回合移動命令與 Web Audio 合成音樂音效。</p></div>
        <div class="cl-item"><span class="cl-ver">v21–v25</span><span class="cl-date">2026.10.22</span><p>操作體驗與介面全面革新：新增觸控與滑鼠通用取消按鈕、側邊欄部隊與地形卡片排版重整、大地圖點擊保護機制，並擴充多段兵力平衡模擬工具。</p></div>
        <div class="cl-item"><span class="cl-ver">v11–v20</span><span class="cl-date">2026.10.21</span><p>史實現代戰爭體系奠定：二元堆積（Binary Heap）A* 大地圖尋路、陸海空六大載具運輸、兵種經驗進化樹、鐵路網建設與合成音效。</p></div>
        <div class="cl-item"><span class="cl-ver">v6–v10</span><span class="cl-date">2026.10.21</span><p>存檔機制升級為具名多存檔欄位、自動存檔與 JSON 匯出匯入；新增帝國篇「鐵血征途」劇情；建立無頭模擬平衡檢驗工具。</p></div>
        <div class="cl-item"><span class="cl-ver">v1–v5</span><span class="cl-date">2026.10.20</span><p>大戰略 Web 原生六角格戰略遊戲核心建置：地形防禦、ZOC 控制區、間接射擊、佔領與生產體系、隨機地圖生成與啟發式 AI。</p></div>
      </div>
    </details>
    </div><div class="row"><button id="hNations">📚 國家圖鑑</button><span class="spacer"></span><button class="close primary">了解</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#hNations').onclick = () => openNations(null, openHelp, '作戰說明');
  }, true);
}

function showVictory() {
  if (G.winner == null) return;
  const humanWin = G.players[G.winner] && !G.players[G.winner].ai;
  if (!G.victorySfx) { G.victorySfx = true; sfx(humanWin ? 'win' : 'lose'); }
  if (G.missionId) { refreshPanel(); return showDebrief(); }
  if (humanWin && typeof playContextBGM === 'function') playContextBGM('victory');
  const S = SIDES[G.winner];
  openModal(`<div class="victory" style="--c:${S.color}"><div class="big">${S.name} 勝利！</div>
    <p>${G.winReason}　·　共 ${G.turn} 回合</p></div>
    <div class="row"><button class="close">檢視戰場</button><button class="primary" id="vNew">再來一局</button></div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#vNew').onclick = openNewGame;
  });
  refreshPanel();
}

function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch?.(() => {});
}
function openTrackMenu() {
  openModal(`<h2>🎼 選擇背景音樂曲目</h2><div class="sub">點擊曲目立即切換（共 ${TRACKS.length} 首 90 年代工業管弦無縫迴圈曲目）</div>
    <div class="moregrid">${TRACKS.map((tr, i) => `<button class="trbtn ${i === AUDIO.on.track ? 'primary' : ''}" data-i="${i}">
      <b>${i + 1}. ${tr.name}${i === AUDIO.on.track ? ' ✓' : ''}</b><br><small style="color:var(--muted);font-weight:400">${tr.desc || ''} · ${tr.bpm} BPM</small></button>`).join('')}</div>
    <div class="row"><button id="trBack">← 返回選單</button><span class="spacer"></span><button class="close primary">完成</button></div>`, box => {
    box.querySelectorAll('.trbtn').forEach(b => b.onclick = () => {
      const idx = +b.dataset.i;
      setTrack(idx, true);
      $('#zMusic').classList.add('on');
      showToast('🎼 ' + TRACKS[idx].name);
      openTrackMenu();
    });
    box.querySelector('#trBack').onclick = openMoreMenu;
    box.querySelector('.close').onclick = closeModal;
  }, true);
}
function openMoreMenu() {
  openModal(`<h2>選單</h2><div class="moregrid">
    <button id="moCamp">📖 劇情・對戰</button><button id="moTest">🧪 測試地圖</button>
    <button id="moNations">📚 國家圖鑑</button>
    <button id="moSave">💾 存檔</button><button id="moLoad">📂 讀檔</button>
    <button id="moFull">⛶ 全螢幕</button><button id="moHelp">❓ 說明</button>
    <button id="moMusic">🎵 音樂：${AUDIO.on.music ? '開' : '關'}</button><button id="moSfx">🔊 音效：${AUDIO.on.sfx ? '開' : '關'}</button>
    <button id="moTrack">🎼 曲目：${TRACKS[AUDIO.on.track] ? TRACKS[AUDIO.on.track].name : TRACKS[0].name}</button><button id="moMain">🏠 主選單</button>
    <button class="close" style="grid-column:1/-1">✕ 關閉</button></div>
    <div class="sub" style="text-align:center;margin-top:6px">${audioDiag()}</div>`, box => {
    box.querySelector('#moCamp').onclick = () => openCampaignMenu();
    box.querySelector('#moTest').onclick = openTestMapsMenu;
    box.querySelector('#moSave').onclick = openSaveDialog;
    box.querySelector('#moLoad').onclick = openLoadDialog;
    box.querySelector('#moFull').onclick = () => { closeModal(); toggleFullscreen(); };
    box.querySelector('#moHelp').onclick = openHelp;
    box.querySelector('#moNations').onclick = () => openNations(null, openMoreMenu, '選單');
    box.querySelector('#moMusic').onclick = () => { $('#zMusic').click(); openMoreMenu(); };
    box.querySelector('#moTrack').onclick = openTrackMenu;
    box.querySelector('#moSfx').onclick = () => { $('#zSfx').click(); openMoreMenu(); };
    box.querySelector('#moMain').onclick = openMainMenu;
    box.querySelector('.close').onclick = closeModal;
  }, true);
}
function showToast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.remove('hidden');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 1600);
}

function openMainMenu() {
  loadCamp();
  openModal(`<div class="mainmenu"><div class="logo">大戰略<span class="logo-ver">v66</span></div><div class="tagline">第三次世界大戰 · 1990 年代現代戰爭</div>
    <button class="primary big" id="mmCamp">📖 劇情模式<small>台海風雲 → 第三次世界大戰</small></button>
    <button class="big" id="mmFree">⚔️ 自由對戰<small>16 國 · 隨機地圖 · 對電腦或雙人</small></button>
    <button class="big" id="mmTest" style="border-color:#38bdf8;background:linear-gradient(#1e3a5f,#152538)">🧪 測試地圖<small>20×20 / 30×30 / 40×40 梯次平衡演練</small></button>
    <button class="big" id="mmLoad">💾 讀取存檔</button>
    <button class="big" id="mmHelp">❓ 作戰說明</button></div>`, box => {
    box.querySelector('#mmCamp').onclick = () => openCampaignMenu();
    box.querySelector('#mmFree').onclick = openNewGame;
    box.querySelector('#mmTest').onclick = openTestMapsMenu;
    box.querySelector('#mmLoad').onclick = openLoadDialog;
    box.querySelector('#mmHelp').onclick = openHelp;
  });
}

function openTestMapsMenu() {
  const ids = ['tm1', 'tm2', 'tm3'];
  const cardsHtml = ids.map(id => {
    const t = typeof evalMapTelemetry === 'function' ? evalMapTelemetry(id) : null;
    if (!t) return '';
    const M = MISSIONS[id];
    return `<div class="testmap-card" style="--tier-c:${t.badgeColor}">
      <div class="tm-head">
        <div class="tm-title">${M.chapter}・${t.title}<small>${t.place}</small></div>
        <span class="tm-badge">${t.badge}</span>
      </div>
      <div class="tm-body">
        <div class="tm-col">
          <h4>據點歸屬 [我方 : 中立 : 敵軍]</h4>
          <div class="tm-row"><span>🏢 城市</span><span>${t.fac.city.join(' : ')}</span></div>
          <div class="tm-row"><span>🏭 工廠</span><span>${t.fac.factory.join(' : ')}</span></div>
          <div class="tm-row"><span>✈️ 機場</span><span>${t.fac.airport.join(' : ')}</span></div>
          <div class="tm-row"><span>⚓ 首都+港</span><span>${t.fac.hqPort.join(' : ')}</span></div>
        </div>
        <div class="tm-col">
          <h4>初始戰力與經濟遙測</h4>
          <div class="tm-row"><span>⚔️ 兵力數</span><span>${t.uCount[0]} : ${t.uCount[1]} (${t.unitRatio}x)</span></div>
          <div class="tm-row"><span>🛡️ 總資產</span><span>${t.assets[0]} : ${t.assets[1]} (${t.assetRatio}x)</span></div>
          <div class="tm-row"><span>💰 首回收入</span><span>+${t.inc[0]} : +${t.inc[1]} (${t.incRatio}x)</span></div>
          <div class="tm-row"><span>🗺️ 據點密度</span><span>陸地 ${t.propLandDensity || t.propDensity}%</span></div>
        </div>
      </div>
      <button class="primary tm-launch" data-id="${id}">⚔️ 發動演練</button>
    </div>`;
  }).join('');

  openModal(`<h2>🧪 測試地圖・戰術平衡試驗場</h2>
    <div class="sub">依據統一地圖拓撲遙測公式即時計算據點比例、初始戰力與資產比，驗證 20×20 / 30×30 / 40×40 梯次平衡。</div>
    <div class="testmap-grid">${cardsHtml}</div>
    <div class="row"><button class="close">返回</button></div>`, box => {
    box.querySelector('.close').onclick = openMainMenu;
    box.querySelectorAll('.tm-launch').forEach(btn => {
      btn.onclick = () => {
        const mid = btn.dataset.id;
        closeModal();
        if (typeof loadCamp === 'function' && (CAMP_ID !== 'tm' || !CAMP)) loadCamp('tm');
        if (typeof launchMission === 'function') launchMission(mid);
      };
    });
  }, true);
}

function showBanner(text, color) {
  const b = $('#banner');
  b.textContent = text; b.style.setProperty('--c', color);
  b.classList.remove('hidden'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.add('hidden'), 1400);
}

// ----- 回合流程 -----
async function turnIntro() {
  UIS.skippedBases = false;
  UIS.lastBaseIdx = -1;
  const token = gameToken;
  refreshPanel();
  showBanner(`第 ${G.turn} 回合　${SIDES[G.cur].name}`, SIDES[G.cur].color);
  sfx('turn');
  setMusicTense(!!G.players[G.cur].ai);
  if (G.winner != null) return showVictory();
  if (G.pendingDialogs && G.pendingDialogs.length) {
    UIS.mode = 'busy';
    await sleep(900);
    while (G.pendingDialogs.length) await playDialog(G.pendingDialogs.shift());
    if (token !== gameToken) return;
  }
  if (G.players[G.cur].ai) {
    UIS.mode = 'busy'; refreshPanel();
    await sleep(500);
    await aiTurn();
    if (token !== gameToken) return;
    if (G.winner != null) { UIS.mode = 'idle'; return showVictory(); }
    endTurn();
    return turnIntro();
  }
  if (G.players.every(p => !p.ai)) { const [cx, cy] = idxCenter(G.caps[G.cur]); centerOn(cx, cy); }
  if (G.units.some(u => u.side === G.cur && u.order != null)) {
    UIS.mode = 'busy';
    await sleep(500);
    await runMoveOrders();
    if (token !== gameToken) return;
  }
  UIS.mode = 'idle';
  autoSave();
  refreshPanel();
}
async function endTurnClicked() {
  if (!isHumanTurn() || UIS.mode === 'busy' || UIS.mode === 'deploy') return;
  clearSel(); setInspect(null);
  if (G.allyAI && G.units.some(u => u.side === G.cur && UNITS[u.type].ally && !u.done)) {
    const token = gameToken;
    UIS.mode = 'busy'; refreshPanel();
    showToast('援軍行動中…');
    await aiAllyTurn();
    if (token !== gameToken) return;
    UIS.mode = 'idle';
    if (G.winner != null) { refreshPanel(); return showVictory(); }
  }
  endTurn();
  turnIntro();
}
function nextUnit() {
  if (!isHumanTurn() || UIS.mode === 'busy' || UIS.mode === 'deploy') return;
  const list = G.units.filter(u => u.side === G.cur && !u.done && !(UNITS[u.type].ally && G.allyAI));
  if (list.length) {
    const k = UIS.sel ? (list.indexOf(UIS.sel) + 1) % list.length : 0;
    if (UIS.mode === 'menu') cancelMove();
    selectUnit(list[k]);
    const [cx, cy] = tileCenter(list[k].x, list[k].y);
    centerOn(cx, cy);
    return;
  }
  // 若已無未行動部隊，檢查是否有可生產據點引導生產
  const bases = typeof pendingProductionBases === 'function' ? pendingProductionBases(G.cur) : [];
  if (bases.length && !UIS.skippedBases) {
    const lastIdx = UIS.lastBaseIdx !== undefined ? UIS.lastBaseIdx : -1;
    const nextIdx = lastIdx + 1;
    if (nextIdx < bases.length) {
      UIS.lastBaseIdx = nextIdx;
      const b = bases[nextIdx];
      clearSel();
      const [cx, cy] = tileCenter(b.x, b.y);
      centerOn(cx, cy);
      openProduction(b.x, b.y);
      return;
    }
    // 已瀏覽完畢所有生產據點，標記跳過並就緒結束回合
    UIS.skippedBases = true;
    refreshPanel();
    return;
  }
  // 已無未行動部隊且無待生產據點（或已瀏覽完畢）：執行結束回合
  endTurnClicked();
}

function startGame(opts) {
  UIS.skippedBases = false;
  UIS.lastBaseIdx = -1;
  clearSel(); setInspect(null); FX.length = 0;
  newGame(opts);
  buildTerrain();
  resize();
  fitView();
  const [cx, cy] = idxCenter(G.caps[G.players[0].ai && !G.players[1].ai ? 1 : 0]);
  centerOn(cx, cy);
  if (typeof playContextBGM === 'function') playContextBGM('combat', true);
  turnIntro();
}
function saveGame() { openSaveDialog(); }
function loadGame() { openLoadDialog(); }

// ----- 輸入 -----
function setupInput() {
  const pts = new Map();
  let down = null, dragging = false, camStart = null, pinch = null;
  const tileOf = e => {
    const r = cvs.getBoundingClientRect();
    return pixelToTile(cam.x + (e.clientX - r.left) / cam.z, cam.y + (e.clientY - r.top) / cam.z);
  };
  cvs.addEventListener('pointerdown', e => {
    lastPointerType = e.pointerType;
    try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* 部分裝置不支援，忽略 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, btn: e.button }; dragging = false; camStart = { ...cam }; }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z };
      dragging = true;
    }
  });
  cvs.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], r = cvs.getBoundingClientRect();
      const nd = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, (pinch.z * nd / pinch.d) / cam.z);
      return;
    }
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!dragging && Math.hypot(dx, dy) > 6) dragging = true;
      if (dragging) {
        cam.x = camStart.x - dx / cam.z; cam.y = camStart.y - dy / cam.z; clampCam();
        cvs.style.cursor = 'grabbing';
        return;
      }
    }
    const [x, y] = tileOf(e);
    handleHover(x, y);
  });
  const up = e => {
    if (pts.size === 1 && down && !dragging && e.type === 'pointerup') {
      const [x, y] = tileOf(e);
      if (down.btn === 2) cancelAction();
      else { handleHover(x, y); handleClick(x, y); }
    }
    pts.delete(e.pointerId);
    if (pts.size === 0) { down = null; pinch = null; cvs.style.cursor = ''; }
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
  cvs.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse' || down) return;   // 觸控抬起手指也會觸發，不清除點選的格子
    UIS.hover = null; UIS.orderPreview = null; refreshPanel();
  });
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cvs.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  cvs.addEventListener('contextmenu', e => e.preventDefault());

  mini.addEventListener('pointerdown', e => {
    const move = ev => {
      const r = mini.getBoundingClientRect(), [ww] = worldSize(), s = r.width / ww;
      centerOn((ev.clientX - r.left) / s, (ev.clientY - r.top) / s);
    };
    move(e);
    try { mini.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    mini.onpointermove = ev => { if (ev.buttons) move(ev); };
  });

  window.addEventListener('keydown', e => {
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape' && modalDismissable) closeModal(); return; }
    if (e.key === 'Escape') cancelAction();
    else if (e.key === 'Tab') { e.preventDefault(); nextUnit(); }
  });
  $('#btnEnd').onclick = endTurnClicked;
  $('#btnNext').onclick = nextUnit;
  const btnAlly = $('#btnAllyCtrl');
  if (btnAlly) {
    btnAlly.onclick = () => {
      if (!G) return;
      G.allyAI = !G.allyAI;
      btnAlly.textContent = G.allyAI ? '友軍: AI協同' : '友軍: 手動';
      btnAlly.classList.toggle('active', !!G.allyAI);
      showToast(G.allyAI ? '友軍操控已切換為：友軍AI協同' : '友軍操控已切換為：手動指揮友軍');
      refreshPanel();
      drawUnits();
    };
  }
  $('#btnSave').onclick = saveGame;
  $('#btnLoad').onclick = loadGame;
  $('#btnHelp').onclick = openHelp;
  $('#btnCampaign').onclick = () => openCampaignMenu();
  $('#deployGo').onclick = endDeploy;
  const dt = $('#deployToggle');
  if (dt) dt.onclick = () => {
    const bar = $('#deployBar');
    const isMin = bar.classList.toggle('minimized');
    dt.textContent = isMin ? '名單 ▾' : '收合 ▴';
  };
  $('#cancelBtn').onclick = e => { e.stopPropagation(); cancelAction(); };
  $('#resultGo').onclick = () => { if (G) { G.debriefShown = false; showVictory(); } };
  $('#btnMore').onclick = openMoreMenu;
  $('#btnPanel').onclick = () => {
    $('#app').classList.toggle('panel-off');
    try { localStorage.setItem('daisenryaku_panel', $('#app').classList.contains('panel-off') ? '0' : '1'); } catch (e) { /* 忽略 */ }
  };
  try { if (localStorage.getItem('daisenryaku_panel') === '0') $('#app').classList.add('panel-off'); } catch (e) { /* 忽略 */ }
  $('#rotateOk').onclick = () => document.body.classList.add('rotate-ok');
  document.addEventListener('gesturestart', e => e.preventDefault());
  $('#btnMenu').onclick = openMainMenu;
  const mb = $('#zMusic'), sb = $('#zSfx');
  const syncAudioBtns = () => { mb.classList.toggle('on', AUDIO.on.music); sb.classList.toggle('on', AUDIO.on.sfx); sb.textContent = AUDIO.on.sfx ? '🔊' : '🔇'; };
  syncAudioBtns();
  // iPad 觸控 + 合成 click 雙重觸發防護：同一按鈕 300ms 內只接受一次切換
  const tapGuard = fn => { let last = -1e9; return e => { const now = performance.now(); if (now - last < 300) return; last = now; fn(e); }; };
  mb.onclick = tapGuard(() => { setAudio('music', !AUDIO.on.music); syncAudioBtns(); showToast(AUDIO.on.music ? '背景音樂：開' : '背景音樂：關'); });
  sb.onclick = tapGuard(() => { setAudio('sfx', !AUDIO.on.sfx); syncAudioBtns(); if (AUDIO.on.sfx) sfx('click'); showToast(AUDIO.on.sfx ? '音效：開' : '音效：關'); });
  $('#zTrack').onclick = tapGuard(() => {
    const n = cycleTrack();
    syncAudioBtns();
    showToast(`🎼 ${AUDIO.on.track + 1}/${TRACKS.length} ${n}`);
  });
  document.addEventListener('click', e => { if (e.target.closest('button')) sfx('click'); });
  const lb = $('#zLabel');
  lb.classList.toggle('on', SETTINGS.labels);
  lb.onclick = () => {
    SETTINGS.labels = !SETTINGS.labels; lb.classList.toggle('on', SETTINGS.labels);
    try { localStorage.setItem('daisenryaku_labels', SETTINGS.labels ? '1' : '0'); } catch (e) { /* 忽略 */ }
  };
  $('#zIn').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1.2); };
  $('#zOut').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1 / 1.2); };
  // 觸控開啟對話框的同一次點擊，可能落在剛出現的按鈕上（Android）：開啟後 0.4 秒內忽略點擊
  $('#modal').addEventListener('click', e => { if (performance.now() - modalOpenedAt < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('#modal').addEventListener('pointerdown', e => { if (performance.now() - modalOpenedAt < 400) return; if (e.target.id === 'modal' && modalDismissable) closeModal(); });
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = cvs.getBoundingClientRect();
  cvs.width = Math.max(1, Math.round(r.width * dpr));
  cvs.height = Math.max(1, Math.round(r.height * dpr));
  if (G) {
    const [ww, wh] = worldSize();
    const maxH = matchMedia('(max-height: 520px) and (orientation: landscape)').matches ? 96 : Infinity;
    mini.style.width = ''; 
    let mw = mini.clientWidth, mh = mw * wh / ww;
    if (mh > maxH) { mh = maxH; mw = mh * ww / wh; }
    mini.style.width = mw + 'px'; mini.style.height = mh + 'px';
    mini.width = Math.round(mw * dpr); mini.height = Math.round(mh * dpr);
    clampCam();
  }
}

function initAppIcon() {
  try {
    const link = $('#appleIcon');
    if (!link) return;
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = '#0f141a';
    g.fillRect(0, 0, 180, 180);
    g.save();
    g.translate(90, 96);
    g.scale(2.8, 2.8);
    drawCounter(g, 0, 0, 'tank_0', 0);
    g.restore();
    link.href = c.toDataURL('image/png');
  } catch (e) { /* 忽略 */ }
}

// 側欄元件順序（小圖 mini → 部隊卡 unitInfo → 戰鬥預測 forecast → 章節卡 objCard → 地形卡 tileInfo → 戰報 logcard）
function initPanelOrder() {
  const panel = $('#panel');
  if (!panel) return;
  const ids = ['mini', 'unitInfo', 'forecast', 'objCard', 'tileInfo'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) panel.appendChild(el);
  }
  const log = panel.querySelector('.logcard');
  if (log) panel.appendChild(log);
}

// 「加入主畫面」網頁 App 不會像 Safari 分頁一樣重新載入：啟動與回到前景時檢查伺服器版本，
// 有新版本時顯示更新按鈕（不自動重新載入，避免中斷進行中的戰局）
function checkForUpdate() {
  const el = document.querySelector('script[src*="ui.js?v="]');
  const m = el && el.getAttribute('src').match(/v=(\d+)/);
  if (!m || typeof fetch !== 'function' || location.protocol === 'file:') return;
  fetch('./?_=' + Date.now(), { cache: 'no-store' })
    .then(r => (r.ok ? r.text() : ''))
    .then(html => {
      const n = html.match(/ui\.js\?v=(\d+)/);
      if (!n || +n[1] <= +m[1] || $('#updateBtn')) return;
      const b = document.createElement('button');
      b.id = 'updateBtn';
      b.className = 'primary';
      b.textContent = `🔄 有新版本 v${n[1]}，點此更新`;
      b.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);transform:translateX(-50%);z-index:9999';
      b.onclick = () => location.reload();
      document.body.appendChild(b);
    })
    .catch(() => {});
}

// 音訊診斷資訊（選單顯示，方便於 iPad 主畫面 App 回報問題）
function audioDiag() {
  const c = AUDIO.ctx;
  const sess = navigator.audioSession ? navigator.audioSession.type : '—';
  const lat = c && c.baseLatency ? ` · ${Math.round(c.baseLatency * 1000)}ms` : '';
  return `音訊：${c ? `${c.sampleRate}Hz · ${c.state}${lat}` : '未啟動'} · ${IS_STANDALONE ? '主畫面 App' : '瀏覽器'} · session ${sess}${AUDIO.recreated ? ' · 重建' : ''}`;
}

window.addEventListener('DOMContentLoaded', () => {
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  initAppIcon();
  initPanelOrder();
  cvs = $('#map'); ctx = cvs.getContext('2d');
  mini = $('#mini'); mctx = mini.getContext('2d');
  setupInput();
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('#mapWrap'));
  resize();
  loadCamp();
  migrateOldSave();
  startGame({ w: 24, h: 15, seed: Math.floor(Math.random() * 99999), players: [{ ai: false }, { ai: true }] });
  resize();
  openMainMenu();
  let fc = 0;
  (function frame(now) {
    draw(now);
    if (fc++ % 5 === 0) drawMini();
    positionMenu();
    // 選取／選目標／選卸載位置時顯示取消按鈕（觸控沒有右鍵）
    const cb = $('#cancelBtn'), showCancel = ['selected', 'target', 'unload'].includes(UIS.mode);
    if (cb.classList.contains('hidden') === showCancel) cb.classList.toggle('hidden', !showCancel);
    requestAnimationFrame(frame);
  })(performance.now());
});
