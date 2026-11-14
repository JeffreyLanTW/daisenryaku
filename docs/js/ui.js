'use strict';
// ===== 介面與操作 =====

const $ = s => document.querySelector(s);
const UIS = {
  mode: 'idle',       // idle | selected | menu | target | busy
  sel: null, reach: null, attackSet: null, path: null, hover: null,
  origin: null, targets: null, inspect: null, inspectSet: null, lastReachHover: null,
};
const ROT_STEP = Math.PI / 12, TILT_STEP = 10;   // 3D 鏡頭：旋轉每次 15°、傾斜每次 10°
const SETTINGS = { aiStep: 10, labels: true, view3d: true };   // 電腦速度預設極快；畫面預設 3D
try { SETTINGS.view3d = localStorage.getItem('daisenryaku_3d') !== '0'; } catch (e) { /* 忽略 */ }
try { const l = localStorage.getItem('daisenryaku_labels'); if (l !== null) SETTINGS.labels = l === '1'; } catch (e) { /* 忽略 */ }
// 戰場資訊面板：stats 平常是否開啟、statsPos 位置（bl 左下 / tl 左上）、statsMin 收合
SETTINGS.stats = true; SETTINGS.statsPos = 'bl'; SETTINGS.statsMin = false; SETTINGS.engineer = false; SETTINGS.apMin = false;
try { SETTINGS.engineer = localStorage.getItem('daisenryaku_engineer2') === '1'; } catch (e) { /* 忽略 */ }   // 預設關閉
// 鏡頭是否自動移動：電腦行動、代理指揮、回合切換時移到行動中的部隊（預設開啟）；關閉＝固定鏡頭
SETTINGS.followCam = true;
// 戰爭迷霧（預設關閉）
SETTINGS.fog = false;
try { SETTINGS.fog = localStorage.getItem('daisenryaku_fog') === '1'; } catch (e) { /* 忽略 */ }
// 3D 戰鬥特效（射擊彈道、命中爆炸、擊毀殘骸），預設開啟
SETTINGS.fx3d = true;
try { SETTINGS.fx3d = localStorage.getItem('daisenryaku_fx3d') !== '0'; } catch (e) { /* 忽略 */ }
try { SETTINGS.followCam = localStorage.getItem('daisenryaku_follow') !== '0'; } catch (e) { /* 忽略 */ }
function setFollowCam(on) {
  SETTINGS.followCam = !!on;
  if (!on) camGoal = null;
  try { localStorage.setItem('daisenryaku_follow', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
}
try {
  SETTINGS.stats = localStorage.getItem('daisenryaku_stats') !== '0';   // 預設開啟
  SETTINGS.statsPos = localStorage.getItem('daisenryaku_stats_pos') || 'bl';
  SETTINGS.statsMin = localStorage.getItem('daisenryaku_stats_min') === '1';
  SETTINGS.apMin = localStorage.getItem('daisenryaku_ap_min') === '1';
} catch (e) { /* 忽略 */ }
const saveStatsPref = () => { try {
  localStorage.setItem('daisenryaku_stats', SETTINGS.stats ? '1' : '0');
  localStorage.setItem('daisenryaku_stats_pos', SETTINGS.statsPos);
  localStorage.setItem('daisenryaku_stats_min', SETTINGS.statsMin ? '1' : '0');
  localStorage.setItem('daisenryaku_ap_min', SETTINGS.apMin ? '1' : '0');
} catch (e) { /* 忽略 */ } };
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
  if (isIndirect(u.type)) for (const t of targetsFrom(u, u.x, u.y)) { if (unitSeen(t)) UIS.attackSet.add(t.id); }
  else for (const [i, v] of UIS.reach) {
    if (!v.canStop) continue;
    const [x, y] = ixy(i);
    for (const t of targetsFrom(u, x, y)) if (unitSeen(t)) UIS.attackSet.add(t.id);
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
  // 全程在迷霧中的敵軍移動：不播音效、不播動畫（也不讓觀看者白等）
  if (typeof pathSeen !== 'function' || pathSeen(u, path)) {
    sfxMove(u);
    await animateMove(u, path, stepMs);
  }
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
    const path = reachPath(reach, i);
    const total = u.hp + t.hp;
    UIS.mode = 'busy'; UIS.path = null;
    if (total <= 10) {
      await doMove(u, path, reach.get(i).cost, 85);
      mergeInto(u, t);
      sfx('build'); showToast(`合流完成：${UNITS[t.type].name} 兵力 ${t.hp}`);
    } else {
      const stopIdx = path.length >= 2 ? path[path.length - 2] : idxOf(u.x, u.y);
      const stopPath = path.length >= 2 ? path.slice(0, -1) : [stopIdx];
      const stopCost = reach.get(stopIdx) ? reach.get(stopIdx).cost : Math.max(0, reach.get(i).cost - 1);
      if (stopPath.length >= 2) await doMove(u, stopPath, stopCost, 85);
      mergeInto(u, t);
      sfx('build'); showToast(`合流溢出補滿：${UNITS[t.type].name} 兵力 10，剩餘兵力 ${u.hp}`);
    }
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
  if (G && G.autoPilot) { stopAutoPilot(true); return; }
  if (UIS.mode === 'busy') return;
  if (UIS.mode === 'unload') { const t = UIS.unload.t; UIS.unload = null; UIS.mode = 'menu'; showMenu(t); return refreshPanel(); }
  if (UIS.mode === 'target') { UIS.mode = 'menu'; UIS.targets = null; showMenu(UIS.sel); }
  else if (UIS.mode === 'menu') cancelMove();
  else { clearSel(); setInspect(null); }
  refreshPanel();
}
async function performAttack(att, def, speed = 1) {
  const [ax, ay] = tileCenter(att.x, att.y), [dx, dy] = tileCenter(def.x, def.y);
  // 戰爭迷霧：雙方都看不見就不播任何動畫與音效，直接結算；只看得見一方時只演那一方
  const seeA = typeof unitSeen !== 'function' || unitSeen(att), seeD = typeof unitSeen !== 'function' || unitSeen(def);
  if (!seeA && !seeD) {
    const res = resolveAttack(att, def);
    removeDead(); checkVictory(); refreshPanel();
    return res;
  }
  if (seeA) sfxFire(UNITS[att.type].base);
  // 3D 戰鬥特效：發射彈體，等彈體飛到才結算（電腦極快時不等，特效照常播放）
  const fx3 = in3D && SETTINGS.fx3d && seeA && seeD;
  if (!seeA) await sleep(200 * speed);
  else if (fx3) {
    const t = R3D.fire(att, def, speed);
    await sleep(speed >= 0.3 ? Math.max(t, 220 * speed) : 220 * speed);
  } else if (isIndirect(att.type)) {
    FX.push({ kind: 'flash', x: ax, y: ay - 6, t0: performance.now(), dur: 300 });
    await sleep(260 * speed);
  } else await animLunge(att, dx, dy, 220 * speed);
  const res = resolveAttack(att, def);
  if (seeD && (res.dmg > 0 || def.hp <= 0)) sfx('explode', { big: def.hp <= 0 });
  if (!fx3) fxBoom(dx, dy, def.hp <= 0);
  fxText(dx, dy, res.evaded ? '迴避!' : def.hp <= 0 ? '擊破!' : `-${res.dmg}`, res.evaded ? '#8fe3ff' : '#ffd166');
  await sleep(420 * speed);
  if (res.countered) {
    if (seeD) sfxFire(UNITS[def.type].base);
    let tc = 120;
    if (fx3) { const t = R3D.fire(def, att, speed); if (speed >= 0.3) { tc = t; await sleep(t); } }
    if (res.counter > 0 && seeA) audioTimer(() => sfx('explode', { big: att.hp <= 0 }), fx3 ? 0 : tc);
    if (!fx3) fxBoom(ax, ay, att.hp <= 0);
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
function doBuildAction(u, type) {
  const [cx, cy] = tileCenter(u.x, u.y);
  const done = doBuildBase(u, type);
  sfx(done ? 'capture' : 'build');
  const c = G.construct && G.construct[idxOf(u.x, u.y)];
  fxText(cx, cy, done ? `${BASE_TYPES[type].name}完工！` : `建設中 ${c ? c.pts : 0}`, SIDES[u.side].light);
  finishUnit(u);
}
function doRepairAction(u) {
  const [cx, cy] = tileCenter(u.x, u.y);
  const full = doRepair(u);
  sfx('capture');
  const pts = G.capture[idxOf(u.x, u.y)] ? G.capture[idxOf(u.x, u.y)].pts : CAPTURE_POINTS;
  fxText(cx, cy, full ? '修復完畢！' : `修復中 ${pts}/${CAPTURE_POINTS}`, SIDES[u.side].light);
  finishUnit(u);
}

// ----- 點擊處理 -----
function handleClick(x, y) {
  if (!G || !inMap(x, y) || UIS.mode === 'busy') return;
  { const cu = seenUnitAt(x, y); if (cu) UIS.lastUnit = cu; }
  if (UIS.mode === 'deploy') return deployClick(x, y);
  const u = seenUnitAt(x, y);
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
  const tg = (!isIndirect(u.type) || !movedAway ? targetsFrom(u, u.x, u.y) : []).filter(unitSeen);
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
  // 專長：有未分配點數時可選（不消耗行動）
  if (perkPts(u) > 0) for (const k of Object.keys(PERKS)) {
    if (!canPerk(u, k)) continue;
    add(`🎖 專長：${PERKS[k].icon} ${PERKS[k].name}${perkLv(u, k) ? ' Ⅱ' : ''} <small>${PERKS[k].desc}</small>`, () => {
      takePerk(u, k); sfx('capture');
      const [cx, cy] = tileCenter(u.x, u.y); fxText(cx, cy, `習得 ${PERKS[k].name}`, '#ffd34d');
      refreshPanel(); showMenu(u);
    }, 'cap');
  }
  if (canCapture(u)) {
    const p = capturePointsLeft(u);
    add(`🚩 佔領 <small>${p}→${Math.max(0, p - u.hp)}</small>`, () => doCaptureAction(u), 'cap');
  }
  for (const k of buildBaseOptions(u)) {
    const B = BASE_TYPES[k], i = idxOf(u.x, u.y), c = G.construct && G.construct[i];
    const going = c && c.side === u.side && c.type === k;
    const pts = going ? c.pts : B.pts;
    if (!going && G.funds[u.side] < B.cost) { add(`<small>${B.icon} 建設${B.name}需要 💰${B.cost}</small>`, () => {}, 'muted'); continue; }
    add(`🏗️ ${going ? '繼續建設' : '建設'}${B.icon}${B.name} <small>${going ? '' : '💰' + B.cost + '・'}${pts}→${Math.max(0, pts - u.hp)}</small>`, () => doBuildAction(u, k), 'cap');
  }
  if (typeof canRepair === 'function' && canRepair(u)) {
    const p = G.capture[idxOf(u.x, u.y)].pts;
    add(`🛠️ 修復據點 <small>${p}→${Math.min(CAPTURE_POINTS, p + u.hp)}</small>`, () => doRepairAction(u), 'cap');
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
  const [px, py] = worldToScreen(cx, cy);
  let sx = px + 34 * cam.z, sy = py - 30;
  const [vw, vh] = viewSize();
  if (sx + m.offsetWidth > vw - 6) sx = px - 34 * cam.z - m.offsetWidth;
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
  const pts = perkPts(u);
  const chips = Object.keys(PERKS).filter(k => perkLv(u, k)).map(k =>
    `<span class="perk-chip" title="${PERKS[k].desc}">${PERKS[k].icon} ${PERKS[k].name}${perkLv(u, k) > 1 ? ' Ⅱ' : ''}</span>`).join('');
  return `<div class="rank-card r${r}">
      <div class="rank-top"><span class="rank-pips">${[1, 2, 3].map(k => `<i class="${k <= r ? 'on' : ''}"></i>`).join('')}</span>
        <b class="rank-name">${R.name}</b><span class="rank-bonus">攻擊 +${Math.round((R.atk - 1) * 100)}%・迴避 ${Math.round(R.evade * 100)}%</span></div>
      <div class="xpbar r${r}"><i style="width:${pct}%"></i></div>
      <div class="rank-foot"><span>${nx ? `經驗 ${xp} / ${nx.xp}　下一階：${nx.name}` : `經驗 ${xp}・最高階`}</span></div>
      ${chips ? `<div class="perk-row">${chips}</div>` : ''}
      ${pts ? `<div class="perk-hint">🎖 有 ${pts} 點專長可選（選取部隊後在行動選單選擇）</div>` : ''}
    </div>`;
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

  const iconUrl = typeof unitIconDataURL === 'function' ? unitIconDataURL(d) : '';
  return `<div class="uhead">
      ${iconUrl ? `<span class="uicon" style="--c:${ncol}"><img src="${iconUrl}" alt=""></span>` : `<span class="dot" style="background:${ncol}"></span>`}
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
      <div class="tele-item"><small>移動</small><b>${d.move + perkLv(u, 'mobile')}${perkLv(u, 'mobile') ? '<em>↑</em>' : ''}</b></div>
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

// ----- 電腦代理指揮 (Auto-Pilot) 狀態管理與執行佇列 -----
function updateAutoPilotUI() {
  renderBattleStats();
  const btn = $('#btnAutoPilot');
  const bar = $('#autoPilotBar');
  if (!G) {
    if (btn) btn.classList.add('hidden');
    if (bar) bar.classList.add('hidden');
    return;
  }
  const isHuman = G.players[G.cur] && !G.players[G.cur].ai;
  const isDeploy = UIS.mode === 'deploy';
  const over = G.winner != null;
  if (btn) {
    // 電腦回合只隱藏外觀、保留位置：頂部列不換行、地圖尺寸不跳動
    btn.classList.toggle('hidden', !!over);
    btn.style.visibility = (!isHuman || isDeploy) && !G.autoPilot ? 'hidden' : '';
    if (G.autoPilot) {
      btn.classList.add('active');
      btn.innerHTML = '⏹️ 中斷代理';
      btn.title = '立即中止電腦代理，取回手動指揮權 (Esc)';
    } else {
      btn.classList.remove('active');
      btn.innerHTML = '🤖 電腦代理';
      btn.title = '由電腦 AI 代理指揮本回合（可隨時中斷）';
    }
  }
  if (bar) {
    const spectating = G.players.every(p => p.ai);
    const show = (G.autoPilot || spectating) && !over && !isDeploy;
    bar.classList.toggle('hidden', !show);
    if (!show) { bar.dataset.built = ''; return; }
    bar.classList.toggle('min', !!SETTINGS.apMin);
    $('#apMin').textContent = SETTINGS.apMin ? '▸' : '▾';
    $('#apTitle').innerHTML = spectating ? '👀 <b>觀戰中</b>（雙方電腦）' : '🤖 <b>電腦代理指揮中</b>';
    $('#btnStopAutoPilot').innerHTML = spectating ? '⏹️ 停止觀戰' : '⏹️ 中斷代理';
    // 雙方操作、AI 風格與電腦速度：分段按鈕，點選即時切換（選項全部可見，不是循環切換）
    if (!bar.dataset.built) {
      bar.dataset.built = '1';
      const seg = (attrs, opts) => `<span class="ap-seg">${opts.map(([v, n, t]) => `<button type="button" ${attrs} data-v="${v}" title="${t || n}">${n}</button>`).join('')}</span>`;
      const per = [['A', 'A', 'A 攻擊型：極限殲敵'], ['B', 'B', 'B 綜合型：平衡協同'], ['C', 'C', 'C 保守型：要塞扼守'], ['L', '藍發', '藍發：高勝率適配']];
      $('#apSides').innerHTML = [...G.players.keys()].map(k => `<div class="ap-side" style="--c:${SIDES[k].color}">
          <span class="ap-side-name" style="color:${SIDES[k].light}">${SIDES[k].name}<i class="ap-turn"></i></span>
          ${seg(`data-ap="ctl" data-k="${k}"`, [['h', '玩家'], ['ai', '電腦']])}
          ${seg(`data-ap="per" data-k="${k}"`, per)}
        </div>`).join('') + `<div class="ap-speed"><span>速度</span>${seg('data-ap="spd"', [['380', '極慢', '極慢：觀戰用，移動、攻擊與彈道都放慢'], ['200', '慢'], ['110', '普通'], ['45', '快'], ['10', '極快']])}</div>`
        + `<div class="ap-speed ap-cam"><span>鏡頭</span>${seg('data-ap="cam"', [['1', '跟隨單位', '電腦行動與回合切換時，鏡頭自動移到行動中的部隊'], ['0', '固定', '鏡頭完全不自動移動（含回合切換），可自行拖曳、縮放、旋轉']])}</div>`
        + `<div class="ap-speed ap-eng"><span>工兵</span>${seg('data-ap="eng"', [['1', '開啟（可建基地）', '工兵可把己方城市建設為工廠、機場或港口'], ['0', '關閉', '不能生產工兵']])}</div>`;
      $('#apSides').onclick = e => { const b = e.target.closest('button[data-ap]'); if (b) apSegClick(b); };
    }
    // 依目前狀態標示選取
    $('#apSides').querySelectorAll('button[data-ap]').forEach(b => {
      const k = +b.dataset.k, v = b.dataset.v;
      const on = b.dataset.ap === 'ctl' ? (G.players[k].ai ? 'ai' : 'h') === v
        : b.dataset.ap === 'per' ? (G.players[k].persona || 'B') === v
        : b.dataset.ap === 'eng' ? (G.rules && G.rules.engineer === false ? '0' : '1') === v
        : b.dataset.ap === 'cam' ? (SETTINGS.followCam ? '1' : '0') === v : String(SETTINGS.aiStep) === v;
      b.classList.toggle('on', on);
    });
    $('#apSides').querySelectorAll('.ap-side').forEach((el, k) => { el.querySelector('.ap-turn').textContent = k === G.cur ? ' ▶' : ''; });
    renderApTune();
    // 戰場資訊固定在左下獨立面板（由 📊 開關），代理視窗只放操作選項
    $('#apStats').classList.add('hidden');
  }
}
// 策略參數滑桿：雙方各六項，拖曳即時生效；切換風格時恢復該風格預設
function renderApTune() {
  const box = $('#apTune');
  if (!box) return;
  box.classList.toggle('hidden', !SETTINGS.apTune);
  $('#apTuneBtn').classList.toggle('on', !!SETTINGS.apTune);
  if (!SETTINGS.apTune) return;
  const key = G.players.map(p => p.persona + JSON.stringify(p.tune || {})).join('|');
  if (box.dataset.key === key) return;   // 拖曳中不重建，避免打斷操作
  box.dataset.key = key;
  box.innerHTML = [...G.players.keys()].map(k => {
    const per = getPersona(k);
    return `<div class="ap-tune-side" style="--c:${SIDES[k].color}"><div class="ap-tune-h" style="color:${SIDES[k].light}">${SIDES[k].name}・${per.badge || per.id}
        <button type="button" class="btn-ap-sub" data-reset="${k}" title="恢復此風格預設">重設</button></div>
      ${PERSONA_TUNABLE.map(([f, name, lo, hi, step, tip]) => `<label class="ap-tune-row" title="${tip}"><span>${name}</span>
        <input type="range" min="${lo}" max="${hi}" step="${step}" value="${per[f]}" data-k="${k}" data-f="${f}"><b>${(+per[f]).toFixed(f === 'retreatHp' ? 2 : 1)}</b></label>`).join('')}</div>`;
  }).join('');
  box.oninput = e => {
    const r = e.target.closest('input[type=range]');
    if (!r) return;
    const k = +r.dataset.k, f = r.dataset.f;
    G.players[k].tune = Object.assign({}, G.players[k].tune, { [f]: +r.value });
    r.nextElementSibling.textContent = (+r.value).toFixed(f === 'retreatHp' ? 2 : 1);
    box.dataset.key = G.players.map(p => p.persona + JSON.stringify(p.tune || {})).join('|');
  };
  box.onclick = e => {
    const b = e.target.closest('[data-reset]');
    if (!b) return;
    G.players[+b.dataset.reset].tune = null;
    box.dataset.key = ''; renderApTune();
    showToast(`${SIDES[+b.dataset.reset].name}：策略參數已恢復預設`);
  };
}
// 代理視窗分段按鈕：點選即生效
function apSegClick(b) {
  if (!G) return;
  const k = +b.dataset.k, v = b.dataset.v;
  if (b.dataset.ap === 'spd') { SETTINGS.aiStep = +v; showToast('電腦速度：' + b.textContent); }
  else if (b.dataset.ap === 'cam') { setFollowCam(v === '1'); showToast(SETTINGS.followCam ? '鏡頭：跟隨行動中的部隊' : '鏡頭：固定（回合切換也不移動）'); }
  else if (b.dataset.ap === 'eng') {
    G.rules = Object.assign({}, G.rules, { engineer: v === '1' });
    SETTINGS.engineer = G.rules.engineer;
    try { localStorage.setItem('daisenryaku_engineer2', v); } catch (e) { /* 忽略 */ }
    showToast(G.rules.engineer ? '工兵：開啟（可建設工廠、機場、港口）' : '工兵：關閉');
  }
  else if (b.dataset.ap === 'per') {
    G.players[k].persona = v;
    G.players[k].tune = null;   // 切換風格：參數恢復該風格預設
    showToast(`${SIDES[k].name} AI 風格：${(AI_PERSONAS[v] || {}).badge || v}`);
  } else {
    const wasHuman = !G.players[G.cur].ai;
    G.players[k].ai = v === 'ai';
    // 目前回合改由電腦指揮：交給 turnIntro 的電腦回合流程
    if (k === G.cur && G.players[k].ai && G.autoPilot && UIS.mode !== 'busy') G.autoPilot = false;
    showToast(`${SIDES[k].name}：${G.players[k].ai ? '電腦指揮' : '玩家指揮'}${G.players.every(p => p.ai) ? '（觀戰模式）' : ''}`);
    if (k === G.cur && wasHuman && G.players[k].ai && G.winner == null && UIS.mode !== 'busy') { clearSel(); setInspect(null); turnIntro(); }
  }
  updateAutoPilotUI(); refreshPanel();
}

async function toggleAutoPilot() {
  if (!G || G.winner != null || UIS.mode === 'deploy') return;
  if (G.autoPilot) {
    stopAutoPilot(true);
  } else {
    await startAutoPilot();
  }
}

async function startAutoPilot() {
  if (!G || G.winner != null || UIS.mode === 'deploy') return;
  if (G.players[G.cur] && G.players[G.cur].ai) return;
  G.autoPilot = true;
  G.autoPilotCancel = false;
  clearSel();
  setInspect(null);
  updateAutoPilotUI();
  showToast('🤖 已啟動電腦代理指揮（可隨時按中斷或 Esc 取回指揮權）');
  if (UIS.mode === 'busy') return;
  await runAutoPilotTurn(G.cur);
}

function stopAutoPilot(manual = false) {
  if (!G) return;
  G.autoPilotCancel = true;
  G.autoPilot = false;
  updateAutoPilotUI();
  if (manual) showToast('⏹️ 正在中斷電腦代理，完成當前動作後取回控制…');
}

async function runAutoPilotTurn(side) {
  const token = gameToken;
  UIS.mode = 'busy';
  refreshPanel();
  try {
    await aiTurn();
  } catch (err) {
    console.error('Auto-pilot execution error:', err);
  }
  if (token !== gameToken) return;
  if (G && G.autoPilotCancel) {
    G.autoPilot = false;
    G.autoPilotCancel = false;
    UIS.mode = 'idle';
    updateAutoPilotUI();
    refreshPanel();
    showToast('已安全取回手動指揮權');
    return;
  }
  if (G && G.winner != null) {
    UIS.mode = 'idle';
    updateAutoPilotUI();
    return showVictory();
  }
  if (G && G.autoPilot) {
    endTurn();
    return turnIntro();
  } else {
    UIS.mode = 'idle';
    updateAutoPilotUI();
    refreshPanel();
  }
}
// ----- 戰場資訊面板：雙方部隊、兵力、據點、收入對比與估計勝率 -----
function battleStatsData() {
  const side = k => {
    const units = G.units.filter(u => u.side === k);
    const val = units.reduce((t, u) => t + UNITS[u.type].cost * u.hp / (u.maxHp || UNITS[u.type].maxHp || 10), 0);
    let props = 0, sites = 0, idle = 0;
    for (let i = 0; i < G.owner.length; i++) {
      if (G.owner[i] !== k) continue;
      const t = TERRAIN[G.terrain[i]];
      if (t.prop) props++;
      if (t.build) {
        sites++;
        const [x, y] = ixy(i);
        if (!unitAt(x, y) && buildOptions(x, y, k).some(b => UNITS[b].cost <= G.funds[k])) idle++;
      }
    }
    return { units: units.length, val: Math.round(val), props, income: incomeOf(k), funds: G.funds[k], sites, idle };
  };
  if (G.players.length > 2) {
    // 三方以上：各方勝率＝實力平方占比
    const d = G.players.map((p, k) => Object.assign(side(k), { k, out: !!(G.out && G.out[k]) }));
    const str = x => x.out ? 0 : (x.val + x.income * 6 + x.props * 100 + x.funds * 0.25) ** 2;
    const tot = d.reduce((t, x) => t + str(x), 0) || 1;
    d.forEach(x => { x.p = G.winner != null ? (G.winner === x.k ? 1 : 0) : str(x) / tot; });
    return { d, multi: true };
  }
  const d = [side(0), side(1)];
  // 估計勝率：兵力價值為主，加上收入（未來兵力）、據點與資金；平方後比較（集中兵力的優勢不是線性的）
  const str = x => x.val + x.income * 6 + x.props * 100 + x.funds * 0.25;
  let p0 = G.winner != null ? (G.winner === 0 ? 1 : 0) : str(d[0]) ** 2 / Math.max(1, str(d[0]) ** 2 + str(d[1]) ** 2);
  if (G.winner == null) p0 = Math.min(0.98, Math.max(0.02, p0));
  return { d, p0 };
}
function renderBattleStats() {
  const box = $('#battleStats');
  if (!box) return;
  const show = G && SETTINGS.stats && UIS.mode !== 'deploy';
  box.classList.toggle('hidden', !show);
  const zb = $('#zStats');
  if (zb) zb.classList.toggle('on', !!SETTINGS.stats);
  if (!show) return;
  box.classList.toggle('pos-tl', SETTINGS.statsPos === 'tl');
  box.classList.toggle('min', !!SETTINGS.statsMin);
  box.innerHTML = battleStatsInner(true);
  box.querySelectorAll('[data-bs]').forEach(b => {
    b.onclick = e => {
      e.stopPropagation();
      if (b.dataset.bs === 'pos') SETTINGS.statsPos = SETTINGS.statsPos === 'tl' ? 'bl' : 'tl';
      else SETTINGS.statsMin = !SETTINGS.statsMin;
      saveStatsPref(); renderBattleStats();
    };
  });
}
// 面板內容；withBtns＝獨立面板（含位置與收合按鈕），false＝嵌入代理視窗
function battleStatsMulti(d, withBtns) {
  const k = v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v);
  // 環圖：各方估計勝率
  const R = 14, C = 2 * Math.PI * R;
  let acc = 0;
  const segs = d.filter(x => x.p > 0).map(x => { const s = `<circle cx="18" cy="18" r="${R}" fill="none" stroke="${SIDES[x.k].color}" stroke-width="6" stroke-dasharray="${(C * x.p).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-C * acc).toFixed(2)}" transform="rotate(-90 18 18)"/>`; acc += x.p; return s; }).join('');
  const lead = [...d].sort((a, b) => b.p - a.p)[0];
  return `<div class="bs-head"><svg class="bs-donut" viewBox="0 0 36 36" aria-hidden="true">${segs}</svg>
      <span class="bs-win" title="估計勝率（依兵力價值、收入、據點與資金估算）"><small>領先</small> <b style="color:${SIDES[lead.k].light}">${SIDES[lead.k].name} ${Math.round(lead.p * 100)}%</b></span>
      ${withBtns ? `<button class="bs-btn" data-bs="pos" title="移到${SETTINGS.statsPos === 'tl' ? '左下' : '左上'}">⇅</button>
      <button class="bs-btn" data-bs="min" title="${SETTINGS.statsMin ? '展開' : '收合'}">${SETTINGS.statsMin ? '▸' : '▾'}</button>` : ''}</div>
    <div class="bs-body"><table class="bs-multi"><tr><th></th><th>勝率</th><th>部隊</th><th>兵力</th><th>據點</th><th>收入</th><th>資金</th></tr>
      ${d.map(x => `<tr class="${x.out ? 'out' : ''} ${x.k === G.cur ? 'cur' : ''}"><td><span class="dot" style="background:${SIDES[x.k].color}"></span>${G.teams && /^[A-D]$/.test(G.teams[x.k]) ? `<span class="tm">${G.teams[x.k]}</span>` : ''}${SIDES[x.k].name}</td>
        ${x.out ? '<td colspan="6">已淘汰</td>' : `<td>${Math.round(x.p * 100)}%</td><td>${x.units}</td><td>${k(x.val)}</td><td>${x.props}</td><td>+${k(x.income)}</td><td>${k(x.funds)}</td>`}</tr>`).join('')}
    </table></div>`;
}
function battleStatsInner(withBtns) {
  const data = battleStatsData();
  if (data.multi) return battleStatsMulti(data.d, withBtns);
  const { d, p0 } = data, c = [SIDES[0].color, SIDES[1].color];
  const pct0 = Math.round(p0 * 100);
  // 環圖：藍方估計勝率
  const R = 14, C = 2 * Math.PI * R;
  const donut = `<svg class="bs-donut" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${R}" fill="none" stroke="${c[1]}" stroke-width="6"/>
    <circle cx="18" cy="18" r="${R}" fill="none" stroke="${c[0]}" stroke-width="6" stroke-dasharray="${(C * p0).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 18 18)"/></svg>`;
  const bar = (label, a, b, fmt = v => v) => {
    const t = a + b, pa = t > 0 ? a / t * 100 : 50;
    return `<div class="bs-row"><span class="bs-l">${label}</span><span class="bs-n" style="color:${SIDES[0].light}">${fmt(a)}</span>
      <span class="bs-bar"><i style="width:${pa.toFixed(1)}%;background:${c[0]}"></i><i style="width:${(100 - pa).toFixed(1)}%;background:${c[1]}"></i></span>
      <span class="bs-n r" style="color:${SIDES[1].light}">${fmt(b)}</span></div>`;
  };
  const k = v => v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v);
  return `<div class="bs-head">${donut}
      <span class="bs-win" title="估計勝率：${SIDES[0].name} ${pct0}% / ${SIDES[1].name} ${100 - pct0}%（依兵力價值、收入、據點與資金估算）"><small>勝率</small> <b style="color:${SIDES[0].light}">${pct0}%</b> : <b style="color:${SIDES[1].light}">${100 - pct0}%</b></span>
      ${withBtns ? `<button class="bs-btn" data-bs="pos" title="移到${SETTINGS.statsPos === 'tl' ? '左下' : '左上'}">⇅</button>
      <button class="bs-btn" data-bs="min" title="${SETTINGS.statsMin ? '展開' : '收合'}">${SETTINGS.statsMin ? '▸' : '▾'}</button>` : ''}</div>
    <div class="bs-body">
      ${bar('部隊', d[0].units, d[1].units)}
      ${bar('兵力', d[0].val, d[1].val, k)}
      ${bar('據點', d[0].props, d[1].props)}
      ${bar('收入', d[0].income, d[1].income, v => '+' + k(v))}
      ${bar('資金', d[0].funds, d[1].funds, k)}
      ${bar('生產', d[0].sites, d[1].sites).replace('<div class="bs-row">', `<div class="bs-row" title="生產據點（首都、工廠、機場、港口）：${SIDES[0].name} ${d[0].sites}（閒置 ${d[0].idle}）／${SIDES[1].name} ${d[1].sites}（閒置 ${d[1].idle}）">`)}
    </div>`;
}
function refreshPanel() {
  if (!G) return;
  renderBattleStats();
  const S = SIDES[G.cur];
  $('#turnInfo').innerHTML = `第 <b>${G.turn}</b> 回合${isNight() ? ' · 🌙 夜間' : ''} · <span style="color:${S.light}">${S.name}${G.players[G.cur].ai ? '（電腦）' : ''}</span>`;
  // 三方以上時只顯示簡短資訊（名稱、資金、部隊數），已淘汰的一方劃掉
  const many = G.players.length > 2;
  $('#funds').innerHTML = G.players.map((p, k) => { const s = SIDES[k];
    if (G.out && G.out[k]) return many ? `<span class="pill out" style="--c:${s.color}"><s>${s.name}</s></span>` : '';
    const tm = G.teams && /^[A-D]$/.test(G.teams[k]) ? `<span class="tm">${G.teams[k]}</span>` : '';
    return `<span class="pill ${k === G.cur ? 'active' : ''}" style="--c:${s.color}">${tm}${s.name} 💰${G.funds[k]}${many ? '' : ` <small>+${incomeOf(k)}</small>`} · ${G.units.filter(u => u.side === k).length}隊</span>`; }).join('');
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
  updateAutoPilotUI();

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
const PERSONA_OPTS = [['B', 'B 綜合型 (平衡協同)'], ['A', 'A 攻擊型 (極限殲敵)'], ['C', 'C 保守型 (要塞扼守)'], ['L', '藍發 (高勝率適配)']];
const personaOptions = cur => PERSONA_OPTS.map(([v, n]) => `<option value="${v}" ${(cur || 'B') === v ? 'selected' : ''}>${n}</option>`).join('');
// ⚙️ 戰場設定：雙方操作（玩家／電腦）與 AI 風格、工兵規則、電腦速度；兩方都設為電腦即可觀戰
function openBattleSettings() {
  if (!G) return;
  const side = k => `<label><span><span class="dot" style="background:${SIDES[k].color}"></span>${SIDES[k].name}</span>
      <select id="bsP${k}"><option value="h">玩家</option><option value="ai" ${G.players[k].ai ? 'selected' : ''}>電腦</option></select></label>
    <label>AI 風格<select id="bsPersona${k}">${personaOptions(G.players[k].persona)}</select></label>`;
  openModal(`<h2>⚙️ 戰場設定</h2>
    <div class="sub">雙方都設為「電腦」即可觀戰；隨時可改回玩家接手。</div>
    <div class="form">${G.players.map((p, k) => side(k)).join('')}
      <label>戰爭迷霧<select id="bsFog"><option value="1">開啟</option><option value="0" ${SETTINGS.fog ? '' : 'selected'}>關閉</option></select></label>
      <label>工兵（基地建設）<select id="bsEng"><option value="1">開啟</option><option value="0" ${G.rules && G.rules.engineer === false ? 'selected' : ''}>關閉</option></select></label>
      <label>電腦速度<select id="bsSpeed"><option value="380">極慢</option><option value="200">慢</option><option value="110">普通</option><option value="45">快</option><option value="10">極快</option></select></label>
      <label>3D 戰鬥特效<select id="bsFx"><option value="1">開啟</option><option value="0" ${SETTINGS.fx3d ? '' : 'selected'}>關閉</option></select></label>
      <label>鏡頭<select id="bsCam"><option value="1">跟隨單位</option><option value="0" ${SETTINGS.followCam ? '' : 'selected'}>固定（含回合切換）</option></select></label>
    </div>
    <div class="desc">工兵可在己方城市建設 🏭工廠、✈️機場或 ⚓港口（臨海）。關閉後本局不能再生產工兵，已在場上的工兵仍可行動。</div>
    <div class="row"><button class="close">取消</button><button id="bsOk" class="primary">套用</button></div>`, box => {
    box.querySelector('#bsSpeed').value = String(SETTINGS.aiStep);
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#bsOk').onclick = () => {
      const wasAI = !!G.players[G.cur].ai;
      setFog(box.querySelector('#bsFog').value === '1');
      for (const k of G.players.keys()) {
        G.players[k].ai = box.querySelector('#bsP' + k).value === 'ai';
        G.players[k].persona = box.querySelector('#bsPersona' + k).value;
      }
      G.rules = Object.assign({}, G.rules, { engineer: box.querySelector('#bsEng').value === '1' });
      SETTINGS.engineer = G.rules.engineer;
      SETTINGS.aiStep = +box.querySelector('#bsSpeed').value;
      setFollowCam(box.querySelector('#bsCam').value === '1');
      SETTINGS.fx3d = box.querySelector('#bsFx').value === '1';
      try { localStorage.setItem('daisenryaku_fx3d', SETTINGS.fx3d ? '1' : '0'); } catch (e) { /* 忽略 */ }
      try { localStorage.setItem('daisenryaku_engineer2', SETTINGS.engineer ? '1' : '0'); } catch (e) { /* 忽略 */ }
      closeModal();
      showToast(G.players.every(p => p.ai) ? '觀戰模式：雙方由電腦指揮' : '設定已套用');
      // 目前回合由玩家改為電腦：立即交給電腦接手
      if (!wasAI && G.players[G.cur].ai && G.winner == null && UIS.mode !== 'busy') { clearSel(); setInspect(null); turnIntro(); }
      refreshPanel(); updateAutoPilotUI();
    };
  }, true);
}
// 各方數量對應的最小地圖（避免八國擠在小地圖上）
const MIN_SIZE_FOR = n => n <= 2 ? 's' : n <= 4 ? 'l' : n <= 6 ? 'xl' : 'xxl';
const DEFAULT_NATS = ['TW', 'CN', 'US', 'JP', 'KR', 'RU', 'GB', 'FR'];
const TEAM_IDS = ['A', 'B', 'C', 'D'];
function openNewGame() {
  const prevP = G && !G.missionId ? G.players : null;
  const prevN = G && G.nations && !G.missionId ? G.nations : null;
  // 參戰國數：預設 4 國，之後記住上次的選擇
  let count = 4;
  try { count = Math.max(2, Math.min(8, +(localStorage.getItem('daisenryaku_ncount') || 4))); } catch (e) { /* 忽略 */ }
  const sideRow = k => {
    const pp = prevP && prevP.length === count && prevP[k] ? prevP[k] : { ai: k > 0 };
    const nat = prevN && prevN[k] ? prevN[k] : DEFAULT_NATS[k];
    return `<div class="ng-side" style="--c:${SIDES[k].color}"><span class="dot" style="background:${SIDES[k].color}"></span>
      <select id="ngN${k}" class="ng-nat">${nationOptions(nat)}</select>
      <select id="ngP${k}"><option value="h">玩家</option><option value="ai" ${pp.ai ? 'selected' : ''}>電腦</option></select>
      <select id="ngPersona${k}">${personaOptions(pp.persona || (pp.ai ? 'B' : 'L'))}</select>
      <select id="ngTeam${k}" class="ng-team" title="同盟：選同一個同盟的國家互不攻擊、共享視野，一起獲勝"><option value="">各自為戰</option>${TEAM_IDS.map(t => `<option value="${t}">同盟 ${t}</option>`).join('')}</select></div>`;
  };
  openModal(`<h2>新遊戲</h2>
    <div class="form">
      <label>參戰國數<select id="ngCount">${[2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === count ? 'selected' : ''}>${n} 國${n === 4 ? '（預設）' : ''}</option>`).join('')}</select></label>
      <label>地圖大小<select id="ngSize">${Object.entries(SIZES).map(([k, [w, h, n]]) => `<option value="${k}">${n}（${w}×${h}）</option>`).join('')}</select></label>
      <label>地圖種子<span class="inline"><input id="ngSeed" type="number" value="${Math.floor(Math.random() * 99999)}"><button id="ngRand" type="button">🎲</button></span></label>
    </div>
    <div class="ng-preset" id="ngPreset"><span>同盟快速設定</span><button type="button" data-tp="ffa">各自為戰</button><button type="button" data-tp="2">分兩隊</button><button type="button" data-tp="3">分三隊</button><button type="button" data-tp="1v">一國對其他所有</button></div>
    <div class="ng-sides" id="ngSides"></div>
    <div class="form">
      <label>電腦速度<select id="ngSpeed"><option value="380">極慢</option><option value="200">慢</option><option value="110" selected>普通</option><option value="45">快</option><option value="10">極快</option></select></label>
      <label>工兵（基地建設）<select id="ngEng"><option value="1">開啟</option><option value="0" ${SETTINGS.engineer === false ? 'selected' : ''}>關閉</option></select></label>
      <label>戰爭迷霧<select id="ngFog"><option value="1">開啟</option><option value="0" ${SETTINGS.fog ? '' : 'selected'}>關閉</option></select></label>
    </div>
    <div class="desc" id="ngDesc"></div>
    <div class="facs" id="ngCards"></div>
    <div class="row"><button class="close">取消</button><button id="ngStart" class="primary">開始作戰</button></div>`, box => {
    const $b = s => box.querySelector(s);
    const sizeOrder = Object.keys(SIZES);
    const draw = () => {
      count = +$b('#ngCount').value;
      const keep = [...box.querySelectorAll('.ng-side')].map((el, k) => ({ n: $b('#ngN' + k).value, p: $b('#ngP' + k).value, s: $b('#ngPersona' + k).value, t: $b('#ngTeam' + k).value }));
      $b('#ngSides').innerHTML = Array.from({ length: count }, (_, k) => sideRow(k)).join('');
      keep.forEach((v, k) => { if (k < count) { $b('#ngN' + k).value = v.n; $b('#ngP' + k).value = v.p; $b('#ngPersona' + k).value = v.s; $b('#ngTeam' + k).value = v.t; } });
      $b('#ngSides').classList.toggle('no-team', count <= 2);
      const presets = $b('#ngPreset'); if (presets) presets.classList.toggle('hidden', count <= 2);
      // 地圖太小時自動放大到建議尺寸
      const min = MIN_SIZE_FOR(count);
      if (sizeOrder.indexOf($b('#ngSize').value) < sizeOrder.indexOf(min)) $b('#ngSize').value = min;
      $b('#ngDesc').textContent = count > 2
        ? `${count} 國混戰：首都被攻陷或全軍覆沒的一方退出，最後只剩一個同盟（或一國）時獲勝。同盟的國家互不攻擊、共享視野。${count} 國建議地圖至少「${SIZES[min][2]}」。全部設為電腦即可觀戰。`
        : '兩方都選「電腦」即可觀戰；遊戲中可由右下 ⚙️ 隨時切換操作與 AI 風格。';
      cards();
      box.querySelectorAll('.ng-nat').forEach(el => { el.onchange = cards; });
    };
    const cards = () => { $b('#ngCards').innerHTML = count === 2 ? nationCard($b('#ngN0').value, 0) + nationCard($b('#ngN1').value, 1) : ''; };
    $b('#ngSize').value = count === 2 ? 'm' : MIN_SIZE_FOR(count);
    draw();
    $b('#ngCount').onchange = draw;
    // 同盟快速設定：依序分隊
    box.querySelectorAll('[data-tp]').forEach(btn => btn.onclick = () => {
      const tp = btn.dataset.tp;
      for (let k = 0; k < count; k++) $b('#ngTeam' + k).value = tp === 'ffa' ? '' : tp === '1v' ? (k === 0 ? 'A' : 'B') : TEAM_IDS[k % +tp];
      checkTeams();
    });
    const checkTeams = () => {
      const t = Array.from({ length: count }, (_, k) => $b('#ngTeam' + k).value || 's' + k);
      const one = new Set(t).size === 1;
      $b('#ngStart').disabled = count > 2 && one;
      $b('#ngStart').title = one ? '所有國家都在同一個同盟，沒有敵人' : '';
    };
    $b('#ngSides').addEventListener('change', e => { if (e.target.classList.contains('ng-team')) checkTeams(); });
    $b('#ngSpeed').value = String(SETTINGS.aiStep);
    $b('#ngRand').onclick = () => $b('#ngSeed').value = Math.floor(Math.random() * 99999);
    $b('.close').onclick = closeModal;
    $b('#ngStart').onclick = () => {
      const [w, h] = SIZES[$b('#ngSize').value];
      SETTINGS.aiStep = +$b('#ngSpeed').value;
      SETTINGS.engineer = $b('#ngEng').value === '1';
      setFog($b('#ngFog').value === '1');
      try { localStorage.setItem('daisenryaku_ncount', String(count)); } catch (e) { /* 忽略 */ }
      try { localStorage.setItem('daisenryaku_engineer2', SETTINGS.engineer ? '1' : '0'); } catch (e) { /* 忽略 */ }
      closeModal();
      const ks = Array.from({ length: count }, (_, k) => k);
      startGame({
        w, h, seed: +$b('#ngSeed').value || 1,
        nations: ks.map(k => $b('#ngN' + k).value),
        players: ks.map(k => ({ ai: $b('#ngP' + k).value === 'ai', persona: $b('#ngPersona' + k).value })),
        // 同盟：未選的國家各自為戰
        teams: count > 2 ? ks.map(k => $b('#ngTeam' + k).value || 's' + k) : null,
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
  openModal(`<h2>作戰說明 <span class="ver-badge">v144</span></h2><div class="help">
    <h4>勝利條件</h4><p>以步兵類部隊<b>佔領敵方首都</b>，或<b>殲滅全部敵軍</b>。劇情任務另有各自的目標。</p>
    <h4>基本操作</h4><ul>
      <li>右下 <b>⚙️</b> 戰場設定：隨時切換雙方「玩家／電腦」與 AI 風格（兩方都設電腦即可觀戰）、工兵規則與電腦速度。</li>
      <li>右下 <b>📊</b> 開關<b>戰場資訊</b>：雙方部隊、兵力、據點、收入、資金對比與估計勝率；電腦代理時自動顯示，可收合（▾）或移到左上／左下（⇅）。</li>
      <li>點擊己方部隊 → 藍色格為可移動範圍，紅色為可攻擊目標。</li>
      <li>點擊目的地後選擇行動：攻擊、佔領、修復、待機或取消。直接點擊紅色敵軍可自動移動並攻擊。</li>
      <li><b>移動命令</b>：點擊範圍外的地點，部隊會設定該處為最終目的地，之後每回合開始自動前進（右下角黃旗）。選取部隊後可取消命令。</li>
      <li>拖曳平移地圖、滾輪/雙指縮放；取消選取可按地圖下方的「✕ 取消」、右鍵或 Esc；Tab 切換下一個未行動部隊。</li>
      <li><b>🤖 電腦代理與即時中斷</b>：點擊頂部列「🤖 電腦代理」或浮動指揮條，電腦 AI 將即刻代為執行本回合全部行動與生產；執行過程中可隨時點擊高對比「⏹️ 中斷代理 (STOP)」或按 Esc，於當前原子動作完成後乾淨釋放指揮權。</li>
      <li>點擊敵軍可查看其威脅範圍（橘色）。</li>
      <li><b>非破壞性合流</b>：同型、同陣營且目標受損的部隊可執行合流；兵力總和 $\le 10$ 時主動部隊併入，超過 10 時目標補滿至 10 HP，主動部隊<b>保留溢出兵力存活</b>。</li>
      <li><b>夜間</b>：部分劇情任務有夜間回合（畫面變暗、上方顯示 🌙）；夜間直接攻擊 −20%、間接火力缺乏觀測 −40%。</li>
      <li><b>要員（★）</b>：劇情中標示 ★ 的指揮組等要員陣亡即作戰失敗，要讓它遠離敵軍火力。</li></ul>
    <h4>經濟與生產</h4><ul>
      <li>每回合依據點獲得收入：首都 300、工廠 150、其他 100。平原地形移動消耗為 1.1，沿鋪設公路前進機動性更高。</li>
      <li>點擊己方空的<b>首都/工廠</b>生產地面部隊、<b>首都/機場</b>生產航空部隊、<b>港口</b>生產艦艇（地面運輸卡車機動力提升至 7 格）。新造航母預設為空甲板機庫。</li>
      <li>部隊停在己方據點上，回合開始時恢復 2 HP（花費部隊價格的 10%/HP），飛機需回首都或機場補充燃料，燃料耗盡會墜毀。</li></ul>
    <h4>戰鬥與航母護衛</h4><ul>
      <li>傷害 = 攻擊力 × (HP/10) × (1 − 地形防禦)，±10% 浮動。受損部隊攻擊力下降。</li>
      <li><b>航母打擊群與 CAP 護衛攔截</b>：航母具備 20~24 點超高耐久與防空近防；若航母搭載空優戰機或 2 格內有友軍戰機，遭受敵方空襲時會觸發 CAP 防空攔截，大幅減免空襲傷害並實施反擊！位於航母上或相鄰 1 格內的友軍飛機每回合自動補給燃料與維修 +2 HP。</li>
      <li><b>戰術光狂與澤火革雙向革變</b>：TSMC EUV要塞（2格內友軍承傷×0.9）與美商火控艦機（2格內友軍攻擊×1.1）；三星王牌部隊在友軍基地可直接於部隊卡片觸發台積電與美商科技雙向「革變」！</li>
      <li>相鄰的直接攻擊會遭到反擊；<b>自走砲、火箭、防空飛彈</b>為間接攻擊，不會被反擊，但移動後不能射擊。</li>
      <li><b>陸戰隊</b>可以渡海（海上移動消耗 2）並登陸佔領，但在海上沒有地形掩護。</li>
      <li>地面部隊進入敵方地面部隊相鄰格會被<b>控制區</b>攔下，飛機不受影響。</li>
      <li><b>升級與專長</b>：部隊作戰累積經驗，升為老兵、精銳、王牌（攻擊與迴避提升）。每升一階得 1 點專長，在行動選單自選：🎯 火力專精（主動攻擊 +10%）、🛡️ 裝甲強化（承傷 −12%）、⚡ 機動強化（移動 +1）、🔧 野戰維修（每回合自動修復 1 HP）；同一專長最多 2 級，劇情中隨部隊帶到下一章。電腦會自動分配。</li>
      <li><b>工兵建設基地</b>：工兵停在己方城市（非首都）可花費資金建設 🏭工廠（💰1000，生產與補給地面部隊）、✈️機場（💰1200，生產與補給飛機）或 ⚓港口（💰1000，須臨海，生產艦艇）；建設點數 20，每回合扣除工兵 HP，約 2 回合完工。城市被敵軍佔領時建設中斷。</li>
      <li><b>佔領與持久防禦</b>：步兵類部隊每回合扣除等同 HP 的佔領耐久（總計 20），受損時防禦減免亦隨之降低；部隊離開或陣亡後耐久<b>持續保留</b>，原陣營可派步兵執行「🛠️ 修復據點」恢復。</li></ul>
    <h4>國家與四大 AI 戰術風格</h4><p>16 個陣營各有專屬 AI 作戰教條、專屬色系與偏好。新遊戲與戰役可自選四大 AI 戰術風格：<b>A 攻擊型</b>（極限殲敵直取斬首）、<b>B 綜合型</b>（步步為營首都推進）、<b>C 保守型</b>（要塞扼守殘血後撤合流）與 <b>L 藍發風格</b>（依敵軍編成與可接戰範圍計算相剋價值生產、資金每回合分配用完、奪城一城一隊、兵力佔優集結圍攻敵方首都、本土防衛與致死集火）。頂部列可隨時切換「友軍手動指揮」與「友軍 AI 協同」。</p>
    <details class="changelog-box">
      <summary>📜 開發歷史與版本紀錄 (Changelog)</summary>
      <div class="changelog-list">
        <div class="cl-item"><span class="cl-ver">v144</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 事件排隊不重疊・Breaking News 點擊即關】擲骰與棋子移動完畢後才依序啟動購買／蓋樓／抽卡／道具屋／突發新聞與排行榜等事件，不再於移動中提前跳出或彼此重疊遮擋；畫面中央的 Breaking News 彈窗新增點擊立即關閉並銜接下一事件功能。</p></div>
        <div class="cl-item"><span class="cl-ver">v143</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 棋子放大更醒目】全面放大玩家 3D 角色棋子（常態約 1.36 倍、行動回合 1.46 倍）與 6 位神明／土狗 NPC 模型，同步加大棋格站位間距、移動跳躍高度並調高地名浮動標籤基礎高度，在環島地圖與地標建築間更加醒目不遮擋。</p></div>
        <div class="cl-item"><span class="cl-ver">v142</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 地貌模型・多模態路網・單骰開局與地名開關】56 格全台灣與離島全數製作專屬精細 3D 地標與玻璃帷幕材質、丘陵／高山階梯地形變化與大戰略級山脈針葉林造型；新增比照大戰略的 3D 地名標籤與「名」/ N 開關；海面波紋背景全面蔚藍化；開局改為 1 顆骰子並可於道具屋購買「🎲 加購骰子」永久升級雙骰；各點之間改依真實地理建構高鐵脊線（含動畫 700T 列車）、台鐵電氣化、都會捷運、阿里山森林鐵路、蘇花／太魯閣隧道、藍色公路渡輪（含客輪動畫）與金門國內航線（含客機動畫）。</p></div>
        <div class="cl-item"><span class="cl-ver">v141</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D】依真實世界地圖重繪棋盤：修正台灣緯度餘弦地理比例、中央山脈等高線與十大河川紋理、北回歸線標線，新增澎湖群島／金門烈嶼／馬祖／福建沿岸／龜山島／綠島蘭嶼地形與 3D 地標（北回歸線太陽館、金門莒光樓），並依真實順時針環島重排 56 格座標與全海域鏡頭檢視範圍。</p></div>
          <div class="cl-item"><span class="cl-ver">v140</span><span class="cl-date">2026.11.14</span><p>【迷霧中看不到動畫】戰爭迷霧開啟時，敵軍在迷霧中的移動、攻擊、爆炸、傷害飄字、佔領與建設音效都不再顯示或播放；走出迷霧才現身、走進迷霧即消失；雙方都在迷霧中的交戰直接結算，電腦回合也因此更快。</p></div>
        <div class="cl-item"><span class="cl-ver">v139</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 鏡頭操作與大戰略完全一致】單指觸控或滑鼠左鍵拖曳改為平移棋盤；滑鼠右鍵或 Shift＋左鍵拖曳可旋轉與上下俯仰視角；雙指觸控自動鎖定縮放或同向滑動旋轉／傾斜（相容觸控板與三指平移）；新增右下角浮動 3D 鏡頭控制列（⟲ ⟳ 旋轉、▲ ▼ 俯仰與雙擊回正、＋ － 縮放、🎯 切換鏡頭跟隨）及 Q／E／R／F 快捷鍵。</p></div>
        <div class="cl-item"><span class="cl-ver">v138</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 同地蓋樓變摩天大樓】所有地段與車站再度走回同位置即可一階階蓋樓升級（空地 → 一樓平房 → 二樓透天 → 高層大樓 → 摩天大樓），支援買地時加蓋一樓與同地加蓋直衝最高級摩天大樓；全面強化五階段進度條彈窗、3D 拔地而起建造動畫與三段退縮式發光玻璃帷幕摩天大樓模型。</p></div>
        <div class="cl-item"><span class="cl-ver">v137</span><span class="cl-date">2026.11.14</span><p>【迷霧也限制電腦】開啟戰爭迷霧時，電腦 AI 只會瞄準、追擊、搶灘與計算威脅自己（含盟友共享）看得見的敵軍，不再掌握全場；據點位置與歸屬仍是公開情報。</p></div>
        <div class="cl-item"><span class="cl-ver">v136</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 操作與實況體驗升級】新增三指觸控拖曳自由平移台灣棋盤視角；Breaking News 突發新聞快訊改為畫面正中央彈出，並依事件類型顯示鮮明彩色插畫與醒目大字標題；新增每 20 回合自動結算並彈出財富排行榜（含頂部「🏆 排行」按鈕可隨時檢視）。</p></div>
        <div class="cl-item"><span class="cl-ver">v135</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 全台地形與建模大翻新】廢除舊版方形外圍棋盤與木框，將 56 個環島格位直接配置於放大立體的台灣本島與澎湖／金門／綠島／蘭嶼離島地形上，並鋪設雙線環島公路與跨海斜張大橋；全面精細化台北 101、中正紀念堂、85 大樓、鵝鑾鼻燈塔、阿里山森林小火車、日月潭寶塔、竹科晶圓廠、九份茶樓、太魯閣牌樓、4 階建築（三合院到摩天大樓）與可動四肢玩家及 6 位 NPC 3D 造型。</p></div>
        <div class="cl-item"><span class="cl-ver">v134</span><span class="cl-date">2026.11.14</span><p>【劇情部署修正】繼承的航空母艦等艦艇在內陸關卡（如第二章嘉南平原）沒地方放：配置區沒有海面時，會自動在最靠近我方據點、遠離敵軍的外海開放配置區。</p></div>
        <div class="cl-item"><span class="cl-ver">v133</span><span class="cl-date">2026.11.14</span><p>合併版本：同時包含環島富豪最新修正、自由對戰同盟／第五章與終章延長，以及環島富豪 3D 升級。</p></div>
        <div class="cl-item"><span class="cl-ver">v132</span><span class="cl-date">2026.11.14</span><p>【修正環島富豪 3D 無畫面問題】修正 #newsBar 隱藏時導致 CSS Grid 的 &lt;main&gt; 高度塌縮為 0 像素、WebGL 畫布未自動撐滿螢幕的問題，改用 Flex 佈局並加入 ResizeObserver 即時更新畫布尺寸。</p></div>
        <div class="cl-item"><span class="cl-ver">v131</span><span class="cl-date">2026.11.14</span><p>【自由對戰同盟】三國以上可設定同盟（A–D，或各自為戰），並有「分兩隊／分三隊／一國對其他所有」快速設定：盟友互不攻擊、不搶對方據點、可以穿過彼此部隊、共享戰爭迷霧視野，最後只剩一個同盟時一起獲勝。【第五章、終章延長】第五章固守目標延長到第 22 回合、終章延長到第 24 回合，並加入後續的敵軍增援波次。</p></div>
        <div class="cl-item"><span class="cl-ver">v131</span><span class="cl-date">2026.11.14</span><p>【環島富豪 3D 大升級】棋盤擴增為 56 格全台灣環島地圖並以 Three.js 立體建模台灣本島、中央山脈、離島與 101／85 大樓／鵝鑾鼻燈塔／宮廟等特色地標；開放自由調整遊戲回合（含無限回合）、自訂玩家名稱與角色造型；修復機會、命運與道具屋互動商店，新增「請神卡」與「送神卡」；地圖新增土地公（可免費強佔他人土地）、財神爺、福神、窮神、衰神、野狗等 6 位 3D 巡邏 NPC；新增頂部 Breaking News 突發新聞台與即時廣播。</p></div>
        <div class="cl-item"><span class="cl-ver">v130</span><span class="cl-date">2026.11.14</span><p>【第四章回合延長】「跳，還是不跳」的固守目標由第 12 回合延長到第 22 回合，有足夠時間渡海反攻廈門港；第 12、16 回合各加一波敵軍增援，維持壓力。</p></div>
        <div class="cl-item"><span class="cl-ver">v129</span><span class="cl-date">2026.11.14</span><p>【八國混戰】自由對戰可選 2–8 國參戰（預設 4 國），各自為戰：首都被攻陷或全軍覆沒的一方退出，最後留下的一方獲勝；國數多時自動選用較大地圖，各方以不同陣營顏色區分，戰場資訊改為各國一覽。【戰爭迷霧】新增戰爭迷霧（新遊戲與 ⚙️ 戰場設定可開關，預設關閉）：只看得到己方部隊與據點周圍，敵軍在視野外會隱藏；偵察類單位視野較遠。電腦 AI 不受迷霧影響。</p></div>
        <div class="cl-item"><span class="cl-ver">v128</span><span class="cl-date">2026.11.14</span><p>【新遊戲：環島富豪 3D】首頁新增原創 3D 地產桌遊：擲骰繞行台灣 40 格、買地蓋樓（平房到大樓）、收過路費、機會命運卡與道具（路障、遙控骰子、免租卡、迴轉卡、拆除卡）；可對電腦、同一台輪流，或用房間代碼線上多人對戰（最多 4 人）。</p></div>
        <div class="cl-item"><span class="cl-ver">v127</span><span class="cl-date">2026.11.14</span><p>取消全螢幕主畫面 App 的命令列下移。</p></div>
        <div class="cl-item"><span class="cl-ver">v126</span><span class="cl-date">2026.11.14</span><p>最上列的選單按鈕 ☰ 在橫向 iPad 與桌機也會顯示（原本只有直向才看得到）。</p></div>
        <div class="cl-item"><span class="cl-ver">v125</span><span class="cl-date">2026.11.14</span><p>標題列「大戰略」旁顯示版本號。主畫面全螢幕 App 的命令列往下讓開螢幕最上緣（iPadOS 會攔截最上緣的觸控），按鈕較容易按到。</p></div>
        <div class="cl-item"><span class="cl-ver">v124</span><span class="cl-date">2026.11.14</span><p>【主畫面 App 全螢幕】新增網頁 App 設定檔，顯示模式設為全螢幕（隱藏時間與電池；系統不支援時自動改為一般主畫面 App）。需刪除主畫面圖示後重新「加入主畫面」。</p></div>
        <div class="cl-item"><span class="cl-ver">v123</span><span class="cl-date">2026.11.14</span><p>移除命令列上方為舊版透明狀態列預留的空白。</p></div>
        <div class="cl-item"><span class="cl-ver">v122</span><span class="cl-date">2026.11.14</span><p>【iPad 主畫面 App 狀態列改為不透明】狀態列改為黑底，畫面從狀態列下方開始，不再透明疊在命令列上（需刪除主畫面圖示後重新「加入主畫面」才會生效）；舊圖示仍是透明狀態列時，命令列上方自動留空避開模糊。</p></div>
        <div class="cl-item"><span class="cl-ver">v121</span><span class="cl-date">2026.11.14</span><p>【iPad 任務簡報加寬】寬螢幕時任務簡報改為左右兩欄（左邊地理位置、右邊目標與選項），不用捲動。【iPad 主畫面 App 命令列】命令列上方多留一段實色空白，讓按鈕與文字避開系統在畫面頂端加的模糊。</p></div>
        <div class="cl-item"><span class="cl-ver">v120</span><span class="cl-date">2026.11.14</span><p>【對話框不再被切掉】任務簡報等內容較多的對話框，地圖示意縮小，底部按鈕固定顯示在對話框底部，內容可捲動。</p></div>
        <div class="cl-item"><span class="cl-ver">v119</span><span class="cl-date">2026.11.14</span><p>【iPad 命令列不再變透明】iOS／iPadOS 26 主畫面 App 會在畫面頂端疊一層系統模糊；命令列改為固定在最上方的不透明列，系統改以命令列顏色填滿狀態列。【iPad 自動全螢幕】從主畫面開啟時，第一次點擊會自動進入全螢幕，隱藏時間與電池（也可從 ☰ →「⛶ 全螢幕」切換）。修正音樂曲目選單顯示「undefined BPM」。</p></div>
        <div class="cl-item"><span class="cl-ver">v118</span><span class="cl-date">2026.11.14</span><p>【iPad 全螢幕命令列】主畫面全螢幕模式的狀態列改為不透明，畫面從狀態列下方開始，命令列不再被系統的淡化效果蓋住而看起來透明；畫面邊緣的淺色底改為深色。</p></div>
        <div class="cl-item"><span class="cl-ver">v117</span><span class="cl-date">2026.11.14</span><p>【修正雙指縮放後畫面跳動】雙指放開時兩指不會同時離開，剩下那一指原本會被當成從手勢開始前的位置拖曳，畫面跳回去；現在改從放開當下的位置接續，不再跳動。</p></div>
        <div class="cl-item"><span class="cl-ver">v116</span><span class="cl-date">2026.11.14</span><p>【最上列不再變透明】電腦代理或電腦回合時，「下一部隊」「結束回合」等暫停使用的按鈕與非行動方的資訊改為實色灰階，不再半透明。</p></div>
        <div class="cl-item"><span class="cl-ver">v115</span><span class="cl-date">2026.11.14</span><p>【取消鏡頭震動】擊破與大型爆炸時不再震動畫面；爆炸、衝擊波與殘骸演出不變。</p></div>
        <div class="cl-item"><span class="cl-ver">v114</span><span class="cl-date">2026.11.14</span><p>【電腦代理時對話自動播放】玩家切換為電腦代理指揮後，劇情對話也會自動繼續（原本只有雙方都是電腦時才會）。</p></div>
        <div class="cl-item"><span class="cl-ver">v113</span><span class="cl-date">2026.11.14</span><p>【劇情人物照】劇情對話的八位人物改為精細的寫實肖像（虛構人物，以 AI 生成）；照片無法載入時仍顯示原本的插畫。【觀戰自動播放對話】觀戰模式（雙方都是電腦）時，劇情對話每句停留約 2–7 秒（依字數）後自動繼續，下方有進度條；仍可點擊提前或略過。</p></div>
        <div class="cl-item"><span class="cl-ver">v112</span><span class="cl-date">2026.11.14</span><p>【修正 3D 畫面整片變紅／變黑】任務目標的紅色準星與地名底框在鏡頭後方或貼近鏡頭時會被放大上千倍、蓋滿整個畫面；現在這類標示不在畫面上時就不畫。另外鏡頭低空移動時會自動抬高到山峰與建築上方，不再鑽進模型裡。</p></div>
        <div class="cl-item"><span class="cl-ver">v111</span><span class="cl-date">2026.11.14</span><p>【已行動部隊改用透明度】已行動的部隊保持原本顏色、改為半透明顯示（3D 模型、2D 圖示與兵種名牌都一樣），不再變灰。</p></div>
        <div class="cl-item"><span class="cl-ver">v110</span><span class="cl-date">2026.11.14</span><p>【已行動部隊】已行動的部隊只稍微變暗（3D 與 2D 都是），不再整片深灰。【劇情精簡】劇情模式只保留最新的「昇龍 2031」，移除「第三次世界大戰」「福爾摩沙之盾」「乾為天」三部劇情與測試地圖；自由對戰保留。舊劇情的存檔無法再讀取。</p></div>
        <div class="cl-item"><span class="cl-ver">v109</span><span class="cl-date">2026.11.14</span><p>【雙指上下＝翻轉】3D 模式觸控板雙指上下滑改為翻轉鏡頭（往上較平視、往下較俯視），縮放改用雙指開合或 ＋／－；滑鼠滾輪仍是縮放。觸控螢幕的雙指手勢在開始時判斷是「開合縮放」還是「滑動旋轉／翻轉」，上下滑時不再同時縮放。</p></div>
        <div class="cl-item"><span class="cl-ver">v108</span><span class="cl-date">2026.11.14</span><p>【極慢速度】電腦速度新增「極慢」（觀戰用）：部隊移動、攻擊等待與 3D 彈道都放慢，鏡頭跟隨時會先移到部隊再行動。【手機工具列】右側工具按鈕在 iPhone 等矮畫面時自動往左排成多欄，不再被上方遮住。</p></div>
        <div class="cl-item"><span class="cl-ver">v107</span><span class="cl-date">2026.11.13</span><p>【3D 戰鬥特效】攻擊依兵種與目標使用符合現實的武器：步兵步槍曳光彈、戰車主砲（砲口焰與揚塵）、步戰車機砲、自走砲與迫砲拋物線彈、多管火箭齊射、彈道飛彈、防空砲曳光彈加黑色空爆、防空飛彈垂直發射近炸、反艦飛彈掠海、艦砲對岸射擊、潛艦魚雷水柱、戰機空對空飛彈、A-10 機砲掃射、轟炸機炸彈串、直升機反戰車飛彈與火箭、雷射光束等。命中有火球、煙、碎片、地面焦痕或水花，被擊中的部隊會晃動。【擊毀演出】車輛焦黑歪斜燃燒冒黑煙後沉入地面、飛機拖黑煙墜落爆炸、艦艇起火傾斜沉沒、步兵倒下；大爆炸有衝擊波與鏡頭震動。可在 ⚙️ 戰場設定「3D 戰鬥特效」開關。</p></div>
        <div class="cl-item"><span class="cl-ver">v106</span><span class="cl-date">2026.11.13</span><p>【觸控板旋轉】Mac 觸控板雙指左右滑改為旋轉 3D 鏡頭（上下滑仍是縮放，雙指開合縮放更靈敏）；不再因左右滑而觸發瀏覽器的上一頁／下一頁。</p></div>
        <div class="cl-item"><span class="cl-ver">v105</span><span class="cl-date">2026.11.13</span><p>【3D 記憶體】部隊資訊牌改用較省記憶體的方式產生（上傳後釋放畫布、每幀限量產生、最久未用的先淘汰），降低 iPad／iOS Safari 畫布記憶體超過上限而破圖的機會。</p></div>
        <div class="cl-item"><span class="cl-ver">v104</span><span class="cl-date">2026.11.13</span><p>【3D 模型更精緻】戰車有傾斜車體、托輪與主動輪、砲盾、抽煙器、車長機槍、天線、煙幕彈與置物籃，各國特徵加強（豹 2 箭形附加裝甲、俄印反應裝甲、梅卡瓦鐵鍊簾、16 式輪型等）；飛機有收尖機身、進氣道、座艙罩、噴嘴、翼下掛載與翼尖飛彈；艦艇有外傾船身、分層上層結構、旋轉雷達、相位陣列、近迫武器、垂直發射格、救生艇與甲板標線；步兵有手臂、步槍、背心與不同姿勢。【鏡頭可放更大】3D 最大 6 倍、2D 最大 4 倍；放大時兵種名稱不再跟著變大遮住模型。【觸控旋轉】兩指一起左右滑改為旋轉鏡頭（取代兩指轉動）；兩指上下滑仍是傾斜。</p></div>
        <div class="cl-item"><span class="cl-ver">v103</span><span class="cl-date">2026.11.13</span><p>【固定鏡頭】鏡頭設為「固定」時，回合切換、代理指揮與回合開始的移動命令也不再移動鏡頭。</p></div>
        <div class="cl-item"><span class="cl-ver">v102</span><span class="cl-date">2026.11.13</span><p>【觀戰鏡頭選項】電腦行動時鏡頭可選「跟隨單位」（自動移到行動中的部隊）或「固定」（不自動移動，可自行拖曳、縮放、旋轉觀看）；在觀戰視窗的「鏡頭」列或 ⚙️ 戰場設定切換，會記住選擇。</p></div>
        <div class="cl-item"><span class="cl-ver">v101</span><span class="cl-date">2026.11.13</span><p>【3D 鏡頭傾斜範圍】傾斜範圍改為 0°（水平看地平線）到 90°（正上方往下看）。【點選更準】3D 模式點在部隊模型上就選到該部隊；鏡頭接近水平時改用最近的格子判斷點選位置。</p></div>
        <div class="cl-item"><span class="cl-ver">v100</span><span class="cl-date">2026.11.13</span><p>【3D 鏡頭】旋轉每次改為 15°（原 45°），滑鼠拖曳旋轉也較細。新增鏡頭傾斜：▲ 更俯視、▼ 更平視（每次 10°，範圍 22°–88°，雙擊回預設）；也可用 R／F 鍵、滑鼠右鍵或 Shift＋左鍵上下拖曳、雙指一起上下滑。</p></div>
        <div class="cl-item"><span class="cl-ver">v99</span><span class="cl-date">2026.11.13</span><p>【3D 部隊模型】3D 模式的部隊改為立體模型（52 種兵種，依國家著色並有各國造型差異：例如蘇式圓頂砲塔、梅卡瓦後置砲塔、F-15／蘇愷雙垂尾、幻象三角翼、CH-47 雙旋翼、各國步兵頭盔）。部隊會轉向移動的方向，飛機在空中浮動，直升機旋翼會轉；已行動的部隊變暗。兵種名、生命值與階級顯示在模型下方。</p></div>
        <div class="cl-item"><span class="cl-ver">v98</span><span class="cl-date">2026.11.13</span><p>【3D 鏡頭旋轉】3D 模式右下新增 ⟲ ⟳ 按鈕（每次 45°，雙擊回正北）；也可用 Q／E 鍵、滑鼠右鍵或 Shift＋左鍵左右拖曳、雙指轉動來旋轉。拖曳與縮放會跟著旋轉方向，縮放以游標位置為中心。【部隊在建築前】3D 模式的部隊一律畫在建築、山與樹木前面，不再被遮住。</p></div>
        <div class="cl-item"><span class="cl-ver">v97</span><span class="cl-date">2026.11.13</span><p>【3D 地圖外改黑】3D 戰場的海面只鋪在地圖範圍內，邊緣跟著六角格；地圖外是黑色。</p></div>
        <div class="cl-item"><span class="cl-ver">v96</span><span class="cl-date">2026.11.13</span><p>【3D 底色調整】3D 戰場的背景與霧氣維持黑色，海面恢復原本的藍色。</p></div>
        <div class="cl-item"><span class="cl-ver">v95</span><span class="cl-date">2026.11.13</span><p>【3D 底色改黑】3D 戰場的海面與底色改為黑色。</p></div>
        <div class="cl-item"><span class="cl-ver">v94</span><span class="cl-date">2026.11.13</span><p>【音樂檔改副檔名】部分公司網路會擋 .mp3 下載導致沒有音樂，音樂檔改用 .dat 副檔名（內容不變）。</p></div>
        <div class="cl-item"><span class="cl-ver">v93</span><span class="cl-date">2026.11.13</span><p>【音樂載入修正】曲目下載期間不再因每次點擊而重複下載或取消播放；載入失敗時會顯示原因，30 秒後才重試。</p></div>
        <div class="cl-item"><span class="cl-ver">v92</span><span class="cl-date">2026.11.13</span><p>【3D 戰場】戰場改以 Three.js 立體呈現：有高度的六角地形、山脈與雪線、森林、城市建築（夜戰時窗戶會亮）、機場跑道、港口吊車、道路橋樑、動態海面，部隊以立牌站在格子上；拉遠較俯視、拉近較平視。右側「3D」按鈕可隨時切回 2D，不支援 WebGL 的裝置自動使用 2D。【各國專屬圖示】約 50 種兵種在 16 國各自依真實裝備重畫輪廓（例如防空砲：獵豹、石勒喀、M163、87 式、M42…），不再只是換色或加小配件。【全新配樂】原本五首合成曲目全數移除，改為五首由 Google Lyria 3.5 產生的管弦配樂。【劇情地圖加大】「昇龍 2031」第四至六章放大為 46×30、56×42、64×64，終章延伸到高屏與花東，並加重終章敵軍。</p></div>
        <div class="cl-item"><span class="cl-ver">v91</span><span class="cl-date">2026.11.12</span><p>【音樂音效重製】音效改為多層合成（爆炸、火砲、機槍、飛彈、佔領、回合提示）並加入空間殘響；爆炸與砲擊時背景音樂自動壓低讓出空間；音樂的銅管與鋪底音色加厚、鼓組放軟、高頻修圓；總輸出加上軟性限幅避免破音，音樂與音效的音量比例重新平衡。</p></div>
        <div class="cl-item"><span class="cl-ver">v90</span><span class="cl-date">2026.11.11</span><p>【介面視覺整理】介面上的表情符號全部改為單色線條圖示（跟隨文字顏色、高解析度下清晰）；統一配色為深灰加單一金色強調、統一按鈕圓角與字級、數字等寬對齊；主選單改為圖示加說明的列表；高解析度螢幕（Retina／iPad）的地形底圖提高到 3 倍。</p></div>
        <div class="cl-item"><span class="cl-ver">v89</span><span class="cl-date">2026.11.11</span><p>【升級系統重製與部隊卡片】每升一階（老兵、精銳、王牌）獲得 1 點專長，可在行動選單自選：火力專精、裝甲強化、機動強化、野戰維修，同一專長最多 2 級，劇情中隨部隊帶到下一章；電腦依兵種自動分配。部隊卡片加上兵種圖示、階級菱形與經驗條、專長標籤，有未分配專長時提示。</p></div>
        <div class="cl-item"><span class="cl-ver">v88</span><span class="cl-date">2026.11.11</span><p>【新劇情「昇龍 2031・六個時刻」】故事走向沿用乾卦六個階段，改用現代口吻：按兵不動（花蓮）、走出山區（嘉南平原）、日夜不休（台中海岸）、跳或不跳（台灣海峽）、制空（台灣與先島群島）、見好就收（海峽全域），四種結局。地圖依真實經緯度繪製並逐章變大（22×14 → 26×16 → 30×19 → 36×22 → 44×27 → 54×33），地圖上標示真實地名；任務簡報附世界地圖定位圖。對話改用人物頭像（九位角色）。</p></div>
        <div class="cl-item"><span class="cl-ver">v87</span><span class="cl-date">2026.11.05</span><p>【各國專屬造型、預設值與代理視窗】同一兵種在不同國家一定有不同外形：除了依型號的造型，再加上各國專屬配件組合（地面車輛：台灣鞭狀天線、中共雙天線、美國後置籃架、日本煙幕彈發射器、韓國推土鏟、北韓旗桿、俄國潛渡呼吸管、越南自救圓木、菲律賓備胎、印度帆布捲、巴基斯坦沙包、英國柵欄裝甲、法國三角旗、德國行李箱、澳洲防撞桿、以色列鐵鍊；飛機、直升機、艦艇、步兵也各有專屬配件），逐一比對外形確認各國皆不相同。藍發：一般評分都不合適的工廠與機場也會生產（港口不強制造艦，實測強制造艦會讓勝率由 98% 掉到 87%）。玩家方 AI 風格預設藍發、電腦速度預設極快、開局地圖縮小一號。電腦代理視窗每列不同底色（雙方、速度、工兵），各方選取中的按鈕使用該方顏色，並新增工兵開關。</p></div>
        <div class="cl-item"><span class="cl-ver">v86</span><span class="cl-date">2026.11.02</span><p>【藍發生產不設上限】取消藍發大幅領先時的後方生產限制與空軍數量上限：每個空閒生產據點每回合都生產；資金越多越偏好高價高戰力單位（每個據點每回合只能出一隊，買貴的才能把錢轉成戰力）；有機場時首都不生產飛機、飛機只在燃料告急時降落首都，讓首都保持可生產地面部隊。中大地圖（關閉工兵）決定性勝利 107→113、大地圖決勝提早約 2–6 回合、終局資金減少約三成。</p></div>
        <div class="cl-item"><span class="cl-ver">v85</span><span class="cl-date">2026.11.02</span><p>【新兵種國別造型與終局掃蕩】新兵種圖示依真實型號區分：步兵戰車（BMP 低矮楔形、布萊德雷側掛拖式、黃鼠狼頂掛米蘭、ASLAV 八輪、阿奇扎里特無砲塔）、潛艦（核動力長艇身、阿庫拉尾艙、基洛水滴形）、巡防艦（匿蹤斜面、派里級高桅、蘇式發射箱）、巡洋艦（提康德羅加、光榮級飛彈筒、055）、兩棲艦（平甲板、滑躍、船塢登陸艦）、多用途戰機（大黃蜂、獵鷹、幻象 F1）、無人機、反潛機、偵察直升機（Ka-50 共軸、小羚羊涵道、500MD 蛋形）、反戰車車、輕戰車、彈道飛彈、岸置飛彈、短程防空、運兵車、氣墊艇（野牛三風扇）；特種部隊改用國別鋼盔。AI 終局掃蕩：敵軍只剩少數時所有打得到的部隊全力追殲、步兵直取敵方首都，並優先生產打得到剩餘敵軍（潛艦、飛機、艦艇）的兵種；藍發評分時潛艦只算給反潛兵種；A／B／C 造艦上限改為固定（避免雙方造艦競賽）。藍發 80 回合勝率 99.2%、決定性勝利 118／120。</p></div>
        <div class="cl-item"><span class="cl-ver">v84</span><span class="cl-date">2026.10.31</span><p>【兵種擴充後的國家平衡】依 18 國循環賽調整價格倍率：印度、台積電、菲律賓上調；越南、美國、澳洲、美商國防下調。勝率分布由 13–74% 收斂至約 34–63%（每國 68 場，誤差約 ±6%）。</p></div>
        <div class="cl-item"><span class="cl-ver">v83</span><span class="cl-date">2026.10.31</span><p>【兵種擴充一倍、海軍大幅增加】新增 22 種兵種，各國兵種數至少為原本兩倍（例：台灣 19→41、美國 22→44、菲律賓 17→36），海軍由 2–3 種增為 5–10 種。陸軍：步兵戰車、反戰車車（射程 2）、輕戰車、迫擊砲班、狙擊組、特種部隊、戰術彈道飛彈（射程 4–8）、單兵防空、岸置反艦飛彈、短程防空飛彈車、裝甲運兵車、氣墊登陸艇（可上岸）。空軍：多用途戰機、無人機、反潛巡邏機、偵察直升機。海軍：潛艦（只能被驅逐艦、巡防艦、巡洋艦、直升機、反潛機攻擊，攻擊時不受反擊）、巡防艦、飛彈快艇／護衛艦、巡洋艦、巡邏艇、兩棲突擊艦。各國依真實裝備命名（如台灣海龍級潛艦、康定級、美國洛杉磯級、提康德羅加級、俄羅斯阿庫拉級、光榮級），A／B／C／藍發四種 AI 都會依戰況生產。圖示依真實型號區分造型：戰車 8 種砲塔（M1 扁長、豹2／90式方箱、挑戰者斜面、梅卡瓦後置、新舊 T 系半球、M48／M60 鑄造圓頂、輕戰車）、戰機 8 種平面形（F-15、側衛、F-16、幻象／鴨翼三角翼、MiG-21／F-5、F-4、可變翼、匿蹤）、直升機 5 種（阿帕契、眼鏡蛇、雌鹿、Ka-52 共軸、輕型）、驅逐艦 4 種（神盾、蘇式、二戰式、史普魯恩斯）、偵察車履帶／四輪／六輪／八輪、防空飛彈垂直／單軌／霍克三聯／箱型、M270 履帶火箭；所有車輛、飛機、艦艇加上國籍標誌。</p></div>
        <div class="cl-item"><span class="cl-ver">v82</span><span class="cl-date">2026.10.31</span><p>【策略參數與介面精簡】電腦代理／觀戰視窗新增「🎛 參數」：雙方各六項策略參數滑桿（攻擊性、閃避火力、佔領重視、斬首、撤退門檻、地形掩蔽），拖曳即時生效、可重設為風格預設，切換風格時自動恢復預設。取消右側戰況卡片。</p></div>
        <div class="cl-item"><span class="cl-ver">v81</span><span class="cl-date">2026.10.31</span><p>【換回合閃爍修正】換回合時頂部按鈕顯示/隱藏讓地圖區域尺寸改變，觸發重設 canvas 尺寸而清空大地圖與小地圖、留下一格空白畫面。改為只在尺寸真的改變時才重設並立即重繪；頂部列固定單列高度（不換行，放不下的按鈕可左右滑動；iPad 以下把存檔、讀檔、說明收進 ☰），電腦回合時「電腦代理」按鈕只隱藏外觀、保留位置，換回合時地圖與小地圖不再閃爍或白一下。</p></div>
        <div class="cl-item"><span class="cl-ver">v80</span><span class="cl-date">2026.10.31</span><p>【觀戰舒適度】電腦回合的鏡頭改為平滑移動到行動部隊，不再瞬間跳轉（拖曳或縮放地圖時立即取消）；觀戰模式的回合標題改為小型淡入淡出標籤，不再閃過整條彩帶。戰場資訊固定在左下獨立面板（📊 開關），不再嵌入電腦代理視窗。</p></div>
        <div class="cl-item"><span class="cl-ver">v79</span><span class="cl-date">2026.10.31</span><p>【戰場資訊開關修正】📊 按鈕在電腦代理／觀戰時也有效：開啟時戰場資訊嵌入代理視窗、關閉時隱藏；未開代理時顯示獨立面板。戰場資訊預設開啟。</p></div>
        <div class="cl-item"><span class="cl-ver">v78</span><span class="cl-date">2026.10.31</span><p>【藍發屯兵修正】找出大量屯兵的主因：舊規則讓戰車、砲兵等主力停在後方未佔領的中立城市旁「清除威脅」，近處的中立城比遠方的敵方首都更有吸引力，導致數十支部隊停在後方；改為只有中立城附近確實有敵軍才派主力。大幅領先（兵力 2 倍、40 支以上）時停止後方據點的地面生產，只由最靠前線的據點生產，壓倒性領先（4 倍、80 支以上）時前線只補步兵；工兵優先在靠近前線的安全城市建基地。終極大地圖（54×33）對 B：決定性勝利平均回合 75→46、終局殘留部隊 532→147；中大地圖勝率 97.5% 不變、殘留部隊再減少約一成五。</p></div>
        <div class="cl-item"><span class="cl-ver">v77</span><span class="cl-date">2026.10.31</span><p>【戰場資訊：生產據點對比】戰場資訊最下面一列改為雙方生產據點（首都、工廠、機場、港口）數量的對比長條，閒置數量移到提示文字。</p></div>
        <div class="cl-item"><span class="cl-ver">v76</span><span class="cl-date">2026.10.31</span><p>【代理視窗點選即時切換】電腦代理／觀戰視窗取消「套用」按鈕，改為分段按鈕點選即生效：雙方「玩家／電腦」、AI 風格（A／B／C／藍發）與電腦速度（慢／普通／快／極快），目前選項以亮色標示。</p></div>
        <div class="cl-item"><span class="cl-ver">v75</span><span class="cl-date">2026.10.31</span><p>【藍發積極進攻與代理視窗改版】藍發不再屯兵：周圍 5 格內兵力達敵軍 1.1 倍即主動交戰（不必等總攻）；兵力領先 1.15 倍、第 4 回合起即轉入首都圍攻，外圍局部兵力 1.1 倍總攻，集結超過 3 回合以 0.9 倍強攻；路徑計入己方擁擠成本，主要入口塞住時後方部隊改走其他路線；兵力 2 倍時偏好飛機與高機動部隊、圍攻時以運輸直升機空運步兵到敵方首都。自由對戰 80 回合（中、大地圖 120 場）勝率 97.5%→98.3%、決定性勝利回合中型 36–43→30–39、大型 46–50→40–45，終局殘留部隊減少約兩成。電腦代理視窗改版：雙方操作（玩家／電腦）與 AI 風格改為下拉選單，按「套用」才生效；視窗內同時顯示雙方即時戰場資訊；雙方都設電腦時顯示「觀戰中」，可一鍵停止觀戰；可收合。新遊戲的工兵選項預設關閉（關閉時大地圖後期資金仍會累積）。</p></div>
        <div class="cl-item"><span class="cl-ver">v74</span><span class="cl-date">2026.10.31</span><p>【工兵基地建設與觀戰設定】新增兵種「工兵」（💰300）：停在己方城市（非首都）可建設 🏭工廠（💰1000，生產與補給地面部隊）、✈️機場（💰1200，生產與補給飛機）或 ⚓港口（💰1000，須臨海）；建設點數 20、每回合扣除工兵 HP，約 2 回合完工，城市被佔領時建設中斷，地圖顯示建設進度。藍發 AI 在資金閒置或生產據點不足時派工兵到安全城市建基地（沒有機場先建機場、需要海軍時建港口、其餘建工廠）：大地圖終局閒置資金由 1–1.7 萬降至約 1,600–1,900，兵力價值提升約 4 成，自由對戰勝率 83.9%（360 場）。新增右下 ⚙️ 戰場設定：遊戲中隨時切換雙方「玩家／電腦」與 AI 風格（兩方都設電腦即可觀戰）、工兵規則開關與電腦速度（新增「極快」）；新遊戲也可選擇是否開放工兵。</p></div>
        <div class="cl-item"><span class="cl-ver">v73</span><span class="cl-date">2026.10.31</span><p>【戰場資訊面板與藍發資金運用】新增 📊 戰場資訊面板（右下工具列開關，電腦代理時自動顯示）：雙方部隊數、兵力價值、據點、每回合收入、資金對比長條與估計勝率環圖（依兵力、收入、據點與資金估算），並顯示閒置生產據點；可收合、可移到左上或左下，手機橫向自動縮小。藍發資金運用：空閒生產據點全部用掉，只有局勢穩定時（第 8 回合後、兵力不落後、本土無敵軍）才為下 1–2 回合買得起的高價單位預留資金；資金越多越偏好高價高戰力單位；搶城時工廠與機場優先；油滿血滿的飛機不佔用機場與首都、受損飛機有其他機場時不停首都；沒有理想目標的部隊改為支援前線而非回基地停放；出擊距離太遠時減少空軍、資金閒置時港口可造艦威脅敵方沿海據點；平衡工具對決報告新增終局資金。註：大地圖後期收入常超過生產據點的產能上限，資金仍會累積，面板的「閒置生產」可用來判斷是否還有據點沒用到。</p></div>
        <div class="cl-item"><span class="cl-ver">v72</span><span class="cl-date">2026.10.31</span><p>【藍發風格強化】生產改為「相剋價值」模型：依敵軍實際編成（價值加權）計算每種兵種的期望傷害、承受火力與有效血量，只計算從該生產據點以其移動方式能接戰的敵軍（不在內海量產驅逐艦），不買無攻擊力的運輸與航艦；資金依空閒生產據點平均分配、前線優先，每回合用完，資金閒置時放寬空軍與艦艇上限；奪城部隊依實際移動回合數一城一隊分派且沿用到手為止（高收入、首都優先）；兵力價值領先 1.4 倍且第 6 回合後轉入首都圍攻：主力集結於敵方首都外圍，局部兵力達守軍 1.4 倍時一齊總攻，優先清除首都上的守軍讓步兵進佔；移動目標依兵種相剋加權、掩蔽加成設上限避免停在山林；逼近我方首都的敵方奪城部隊最優先攔截。平衡工具新增 --duel 對決模式（每張地圖換邊、固定亂數可重現、--jobs 平行、--losses 列出敗局）。自由對戰對 A/B/C 三種風格（360 場）：30 回合判定勝率由原版藍發的約 47% 提升至 84%；延長至 80 回合時勝率 90%，其中 233 場以攻陷首都或全殲敵軍決勝。</p></div>
        <div class="cl-item"><span class="cl-ver">v71</span><span class="cl-date">2026.10.30</span><p>【高勝率藍發 AI 作戰風格】實裝全新「藍發 (LanFa)」作戰風格與四大核心規則：1. 資金不過百（只要有可用據點且資金大於 100，不留餘錢極限投放產能）、2. 全圖搶城擴產（大幅提升中立與敵方城鎮奪取權重，滾雪球拉開經濟差距）、3. 海陸空戰場自動適配（依據海域面積、島嶼隔海、崎嶇地形與敵方防空密度自主調配驅逐艦/無人狼群、主力戰車或空優戰機，動態兵種相剋）、4. 滅頂集火一擊必殺、受創高價值主力殘血維修與砲兵協同掩護；支援新遊戲選單、電腦代理切換與戰役對決。</p></div>
        <div class="cl-item"><span class="cl-ver">v70</span><span class="cl-date">2026.10.29</span><p>【Q版國別軍武剪影與專屬色盤】全面重繪 16 國可愛 Q 版 (SD/Chibi) 部隊剪影圖示：圓潤飽滿大頭比例、粗黑輪廓與高對比負空間，老花與 iPad 實機一目了然；步兵依國別配備標誌性大鋼盔（德軍 M35 喇叭裙邊、蘇俄/朝/越 SSh-40 圓頂紅星、日軍 88 式前簷太陽徽、英軍平沿十字徽、法軍平頂軍帽、美台韓 PASGT 圓頂徽）；戰機依標誌性氣動外形區隔（美日雙垂尾雙發、俄系後掠大邊條、法英德前翼三角翼）；戰車（方正/鑄造圓頂/楔形砲塔）、艦艇（神盾八角板/俄式高桅）及專屬 16 國色盤全面煥新。</p></div>
        <div class="cl-item"><span class="cl-ver">v69</span><span class="cl-date">2026.10.28</span><p>【三大 AI 風格硬約束重構】全面升級三大 AI 與電腦代理戰術風格硬性行為約束：<b>A 攻擊型</b>（更名高對比標籤，將全殲敵軍部隊置於最高效用優先級，實裝每場戰役戰機燃料墜毀上限額度 counter $\le 3$，額度內放寬返航檢查允許單向深遠突擊，達 3 次後嚴格執行燃料返航安全約束）；<b>B 綜合型</b>（聚焦步步為營穩步擴張領土，沿推進廊道持續向敵方首都推進，系統性佔領沿線城市、工廠與機場）；<b>C 保守型</b>（實裝首都 15 格硬約束半徑 Hard 15-Tile HQ Tether，生產強制陸空比 $\ge 10:1$，受損高門檻主動後撤據點或相鄰同型部隊非破壞性合流）。無頭模擬器 balance.js 同步支援風格硬約束自動遙測。</p></div>
        <div class="cl-item"><span class="cl-ver">v68</span><span class="cl-date">2026.10.26</span><p>【電腦代理與三大 AI 戰術風格】新增高對比 iPad/老花友善「🤖 電腦代理」模式，支援全自動指揮玩家回合（移動、接戰、佔領與生產）；配備浮動指揮橫條與即時「⏹️ 中斷代理（STOP / Take Control）」機制，原子部隊動作結束後立即安全釋放控制權；實裝三大可選 AI 戰術風格（A 冒險型：極限進攻與斬首直取、B 綜合型：步步為營與多兵種協同、C 保守型：要塞扼守與殘血後撤合流），於新遊戲與戰役簡報中均可自選，無頭模擬器支援風格勝率對抗掃描。</p></div>
        <div class="cl-item"><span class="cl-ver">v67</span><span class="cl-date">2026.10.26</span><p>【東亞地理戰區與核心規則修正】導入 100% 本地東亞地理投影生成管線（tools/geogen.js），全面重製 20×20 初階（台灣海峽・澎湖水道）、30×30 中階（琉球群島・沖繩海槽）與 40×40 高階（對馬海峽・朝鮮海峽）三戰區；測試卡片升級高對比 iPad/老花友善排版，標註真實經緯度與據點歸屬比 [我:中:敵]；實裝 5 大核心規則：據點佔領耐久與防禦持久化（支援步兵修復）、部隊合流溢出保留存活（非破壞性合流）、新造航母預設全空甲板、平原移動力消耗調為 1.1（浮點安全尋路）及地面運輸卡車機動力 +1（移動力 7）。</p></div>
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

// iPad 主畫面 App：第一次點擊時自動進入全螢幕（隱藏時間與電池；iPhone 不支援此功能，不會有動作）
function autoFullscreenOnce() {
  const el = document.documentElement;
  const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!standalone || !(el.requestFullscreen || el.webkitRequestFullscreen)) return;
  const go = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) toggleFullscreen(); };
  window.addEventListener('click', go, { once: true, capture: true });
}
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
  else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch?.(() => {});
}
function openTrackMenu() {
  openModal(`<h2>🎼 選擇背景音樂曲目</h2><div class="sub">點擊曲目立即切換（共 ${TRACKS.length} 首管弦配樂，由 Google Lyria 3.5 產生）</div>
    <div class="moregrid">${TRACKS.map((tr, i) => `<button class="trbtn ${i === AUDIO.on.track ? 'primary' : ''}" data-i="${i}">
      <b>${i + 1}. ${tr.name}${i === AUDIO.on.track ? ' ✓' : ''}</b></button>`).join('')}</div>
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
    <button id="moCamp">📖 劇情・對戰</button>
    <button id="moNations">📚 國家圖鑑</button>
    <button id="moSave">💾 存檔</button><button id="moLoad">📂 讀檔</button>
    <button id="moFull">⛶ 全螢幕</button><button id="moHelp">❓ 說明</button>
    <button id="moMusic">🎵 音樂：${AUDIO.on.music ? '開' : '關'}</button><button id="moSfx">🔊 音效：${AUDIO.on.sfx ? '開' : '關'}</button>
    <button id="moTrack">🎼 曲目：${TRACKS[AUDIO.on.track] ? TRACKS[AUDIO.on.track].name : TRACKS[0].name}</button><button id="moMain">🏠 主選單</button>
    <button class="close" style="grid-column:1/-1">✕ 關閉</button></div>
    <div class="sub" style="text-align:center;margin-top:6px">${audioDiag()}</div>`, box => {
    box.querySelector('#moCamp').onclick = () => openCampaignMenu();
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
  openModal(`<div class="mainmenu"><div class="logo">大戰略<span class="logo-ver">v144</span></div><div class="tagline">現代戰爭 · 台灣海峽</div>
    <button class="primary big" id="mmCamp">📖 劇情模式<small>昇龍 2031・六個時刻</small></button>
    <button class="big" id="mmFree">⚔️ 自由對戰<small>16 國 · 隨機地圖 · 對電腦或雙人</small></button>
    <button class="big" id="mmRich">🎲 環島富豪 3D<small>新遊戲 · 擲骰買地 · 線上多人對戰</small></button>
    <button class="big" id="mmLoad">💾 讀取存檔</button>
    <button class="big" id="mmHelp">❓ 作戰說明</button></div>`, box => {
    box.querySelector('#mmCamp').onclick = () => openCampaignMenu();
    box.querySelector('#mmFree').onclick = openNewGame;
    box.querySelector('#mmLoad').onclick = openLoadDialog;
    box.querySelector('#mmRich').onclick = () => { location.href = 'rich/'; };
    box.querySelector('#mmHelp').onclick = openHelp;
  });
}

function showBanner(text, color) {
  const b = $('#banner');
  b.textContent = text; b.style.setProperty('--c', color);
  // 觀戰模式：改用小型淡入淡出標籤，不閃過整條彩帶
  b.classList.toggle('soft', !!(G && G.players && G.players.every(p => p.ai)));
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
  if (G.players.every(p => !p.ai) && SETTINGS.followCam) { const [cx, cy] = idxCenter(G.caps[G.cur]); centerOn(cx, cy); }
  if (G.units.some(u => u.side === G.cur && u.order != null)) {
    UIS.mode = 'busy';
    await sleep(500);
    await runMoveOrders();
    if (token !== gameToken) return;
  }
  if (G.autoPilot && !G.players[G.cur].ai) {
    UIS.mode = 'busy';
    refreshPanel();
    await sleep(400);
    await runAutoPilotTurn(G.cur);
    return;
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
  { const bar = $('#autoPilotBar'); if (bar) bar.dataset.built = ''; }
  buildTerrain();
  resize();
  fitView();
  const firstHuman = G.players.findIndex(p => !p.ai);
  const [cx, cy] = idxCenter(G.caps[firstHuman >= 0 ? firstHuman : 0]);
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
    return screenToTile(e.clientX - r.left, e.clientY - r.top);
  };
  cvs.addEventListener('pointerdown', e => {
    camGoal = null;
    lastPointerType = e.pointerType;
    try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* 部分裝置不支援，忽略 */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey }; dragging = false; camStart = { ...cam }; }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2, mode: null };
      dragging = true;
    }
  });
  cvs.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], r = cvs.getBoundingClientRect();
      const nd = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // 3D：每次雙指手勢開始時判斷一次——兩指距離變化較大＝縮放；兩指一起移動較大＝旋轉／傾斜（不會同時縮放）
      if (in3D && !pinch.mode) {
        const spread = Math.abs(nd - pinch.d), slide = Math.hypot(mx - pinch.mx0, my - pinch.my0);
        if (Math.max(spread, slide) > 12) pinch.mode = spread > slide ? 'zoom' : 'turn';
        else return;
      }
      if (!in3D || pinch.mode === 'zoom') zoomAt(mx - r.left, my - r.top, (pinch.z * nd / pinch.d) / cam.z);
      else {
        // 一起左右滑＝旋轉鏡頭；一起上下滑＝翻轉（往上較平視、往下較俯視）
        R3D.rotateBy(-(mx - pinch.mx) * 0.006);
        R3D.tiltBy((my - pinch.my) * 0.25);
      }
      pinch.mx = mx; pinch.my = my;
      return;
    }
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!dragging && Math.hypot(dx, dy) > 6) dragging = true;
      if (dragging) {
        // 3D：右鍵或 Shift＋左鍵拖曳旋轉鏡頭
        if (in3D && (down.btn === 2 || down.shift)) {
          // 左右：旋轉；上下：傾斜
          R3D.rotateBy(-(e.clientX - (down.lx ?? down.x)) * 0.005);
          R3D.tiltBy((e.clientY - (down.ly ?? down.y)) * 0.25);
          down.lx = e.clientX; down.ly = e.clientY;
          cvs.style.cursor = 'move';
          return;
        }
        if (in3D) { const [mx, my] = R3D.panVec(dx, dy); cam.x = camStart.x - mx / cam.z; cam.y = camStart.y - my / cam.z; }
        else { cam.x = camStart.x - dx / cam.z; cam.y = camStart.y - dy / cam.z; }
        clampCam();
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
    // 雙指手勢結束、只剩一指還在螢幕上：以目前的手指位置與鏡頭作為新的拖曳起點，
    // 否則會沿用雙指開始前的起點，剩下那一指稍微一動畫面就跳回去
    if (pts.size === 1 && pinch) {
      const [rest] = pts.values();
      down = { x: rest.x, y: rest.y, btn: 0, shift: false }; camStart = { ...cam }; dragging = true; pinch = null;
    }
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
    const r = cvs.getBoundingClientRect(), px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * px, dy = e.deltaY * px;
    // 觸控板雙指開合（瀏覽器以 ctrlKey＋滾輪事件送出）：縮放，靈敏度較高
    if (e.ctrlKey) return zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.01));
    // 滑鼠滾輪（一格一大步的整數位移、沒有左右分量）：縮放
    const wheelMouse = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (!in3D || wheelMouse) return zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * 0.0015));
    // 3D 觸控板：雙指左右滑＝旋轉、上下滑＝翻轉（往上較平視、往下較俯視）；以主要方向決定，斜滑不會兩者同時發生
    camGoal = null;
    if (Math.abs(dx) > Math.abs(dy)) R3D.rotateBy(dx * 0.005);
    else R3D.tiltBy(-dy * 0.12);
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
    else if (in3D && (e.key === 'q' || e.key === 'Q')) R3D.rotate(-ROT_STEP);
    else if (in3D && (e.key === 'e' || e.key === 'E')) R3D.rotate(ROT_STEP);
    else if (in3D && (e.key === 'r' || e.key === 'R')) R3D.tilt(TILT_STEP);
    else if (in3D && (e.key === 'f' || e.key === 'F')) R3D.tilt(-TILT_STEP);
  });
  $('#btnEnd').onclick = endTurnClicked;
  $('#btnNext').onclick = nextUnit;
  const btnAP = $('#btnAutoPilot');
  if (btnAP) btnAP.onclick = toggleAutoPilot;
  const btnStopAP = $('#btnStopAutoPilot');
  if (btnStopAP) btnStopAP.onclick = () => {
    if (!G) return;
    // 觀戰中：藍方改回玩家，下一個藍方回合由玩家指揮
    if (G.players.every(p => p.ai)) {
      G.players[0].ai = false; G.autoPilot = false;
      $('#autoPilotBar').dataset.built = ''; updateAutoPilotUI();
      return showToast('已停止觀戰：下一個藍方回合由玩家指揮');
    }
    if (G.autoPilot) stopAutoPilot(true);
  };
  $('#apTuneBtn').onclick = () => { SETTINGS.apTune = !SETTINGS.apTune; updateAutoPilotUI(); };
  $('#apMin').onclick = () => { SETTINGS.apMin = !SETTINGS.apMin; saveStatsPref(); updateAutoPilotUI(); };
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
  $('#zSettings').onclick = tapGuard(() => openBattleSettings());
  $('#zStats').onclick = tapGuard(() => {
    SETTINGS.stats = !SETTINGS.stats; saveStatsPref(); renderBattleStats(); updateAutoPilotUI();
    showToast(SETTINGS.stats ? '戰場資訊：開' : '戰場資訊：關');
  });
  const lb = $('#zLabel');
  lb.classList.toggle('on', SETTINGS.labels);
  lb.onclick = () => {
    SETTINGS.labels = !SETTINGS.labels; lb.classList.toggle('on', SETTINGS.labels);
    try { localStorage.setItem('daisenryaku_labels', SETTINGS.labels ? '1' : '0'); } catch (e) { /* 忽略 */ }
  };
  const b3 = $('#z3d');
  b3.classList.toggle('on', SETTINGS.view3d);
  b3.onclick = () => {
    SETTINGS.view3d = !SETTINGS.view3d;
    if (SETTINGS.view3d && window.R3D && R3D.failed) { SETTINGS.view3d = false; showToast('這台裝置不支援 3D 畫面'); }
    b3.classList.toggle('on', SETTINGS.view3d);
    try { localStorage.setItem('daisenryaku_3d', SETTINGS.view3d ? '1' : '0'); } catch (e) { /* 忽略 */ }
    showToast(SETTINGS.view3d ? '3D 戰場' : '2D 戰場');
  };
  $('#zRotL').onclick = () => { if (in3D) R3D.rotate(-ROT_STEP); };
  $('#zRotR').onclick = () => { if (in3D) R3D.rotate(ROT_STEP); };
  $('#zRotL').ondblclick = $('#zRotR').ondblclick = () => { if (in3D) R3D.resetYaw(); };
  $('#zTiltU').onclick = () => { if (in3D) R3D.tilt(TILT_STEP); };
  $('#zTiltD').onclick = () => { if (in3D) R3D.tilt(-TILT_STEP); };
  $('#zTiltU').ondblclick = $('#zTiltD').ondblclick = () => { if (in3D) R3D.resetTilt(); };
  $('#zIn').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1.2); };
  $('#zOut').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1 / 1.2); };
  // 觸控開啟對話框的同一次點擊，可能落在剛出現的按鈕上（Android）：開啟後 0.4 秒內忽略點擊
  $('#modal').addEventListener('click', e => { if (performance.now() - modalOpenedAt < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  $('#modal').addEventListener('pointerdown', e => { if (performance.now() - modalOpenedAt < 400) return; if (e.target.id === 'modal' && modalDismissable) closeModal(); });
}

// 設定 canvas 寬高會清空畫面：只在尺寸真的改變時才設定，並立即重繪（避免換回合時大地圖與小地圖閃一下）
function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = cvs.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  let changed = false;
  if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; changed = true; }
  if (G) {
    const [ww, wh] = worldSize();
    const maxH = matchMedia('(max-height: 520px) and (orientation: landscape)').matches ? 96 : Infinity;
    // 暫時清掉寬度量出自然寬度（同一個工作內不會繪出），只有尺寸改變才重設 canvas
    const prevW = mini.style.width;
    mini.style.width = '';
    let mw = mini.clientWidth, mh = mw * wh / ww;
    mini.style.width = prevW;
    if (mh > maxH) { mh = maxH; mw = mh * ww / wh; }
    const sw = mw + 'px', sh = mh + 'px';
    if (mini.style.width !== sw) mini.style.width = sw;
    if (mini.style.height !== sh) mini.style.height = sh;
    const iw = Math.round(mw * dpr), ih = Math.round(mh * dpr);
    if (mini.width !== iw || mini.height !== ih) { mini.width = iw; mini.height = ih; changed = true; }
    clampCam();
  }
  if (changed && G) { draw(performance.now()); drawMini(); }
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
  autoFullscreenOnce();
  // 標題列顯示版本號（取自載入 ui.js 時的 ?v=）
  { const m = /[?&]v=(\d+)/.exec((document.querySelector('script[src*="js/ui.js"]') || {}).src || ''); if (m) $('#brandVer').textContent = 'v' + m[1]; }
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
