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
let modalDismissable = false;
let lastPointerType = 'mouse';
const isTouch = () => lastPointerType === 'touch' || lastPointerType === 'pen';
const SIZES = { s: [18, 13], m: [24, 15], l: [30, 19] };

const isHumanTurn = () => G && G.winner == null && !G.players[G.cur].ai;

// ----- 選取與移動 -----
function clearSel() {
  UIS.pendingTarget = null;
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
  UIS.sel = u; UIS.mode = 'selected';
  UIS.origin = { x: u.x, y: u.y, fuel: u.fuel };
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
  await animateMove(u, path, stepMs);
  const [x, y] = ixy(path[path.length - 1]);
  u.x = x; u.y = y;
  if (UNITS[u.type].fuel !== undefined) u.fuel -= cost;
  u.moved = true;
}
async function moveSelectedTo(i) {
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
  if (!u) return clearSel();
  u.x = o.x; u.y = o.y; u.fuel = o.fuel; u.moved = false;
  selectUnit(u);
}
function cancelAction() {
  if (UIS.mode === 'busy') return;
  if (UIS.mode === 'target') { UIS.mode = 'menu'; UIS.targets = null; showMenu(UIS.sel); }
  else if (UIS.mode === 'menu') cancelMove();
  else { clearSel(); setInspect(null); }
  refreshPanel();
}
async function performAttack(att, def, speed = 1) {
  const [ax, ay] = tileCenter(att.x, att.y), [dx, dy] = tileCenter(def.x, def.y);
  if (isIndirect(att.type)) {
    FX.push({ kind: 'flash', x: ax, y: ay - 6, t0: performance.now(), dur: 300 });
    await sleep(260 * speed);
  } else await animLunge(att, dx, dy, 220 * speed);
  const res = resolveAttack(att, def);
  fxBoom(dx, dy, def.hp <= 0);
  fxText(dx, dy, def.hp <= 0 ? '擊破!' : `-${res.dmg}`, '#ffd166');
  await sleep(420 * speed);
  if (res.countered) {
    fxBoom(ax, ay, att.hp <= 0);
    fxText(ax, ay, att.hp <= 0 ? '擊破!' : `-${res.counter}`, '#ff9b8a');
    await sleep(420 * speed);
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
  fxText(cx, cy, took ? '佔領！' : `佔領中 ${G.capture[idxOf(u.x, u.y)].pts}`, SIDES[u.side].light);
  finishUnit(u);
}

// ----- 點擊處理 -----
function handleClick(x, y) {
  if (!G || !inMap(x, y) || UIS.mode === 'busy') return;
  const u = unitAt(x, y);
  if (!isHumanTurn()) { setInspect(u && UIS.inspect !== u ? u : null); refreshPanel(); return; }
  switch (UIS.mode) {
    case 'idle':
      if (u && u.side === G.cur && !u.done) return selectUnit(u);
      if (u) { setInspect(UIS.inspect === u ? null : u); return refreshPanel(); }
      setInspect(null);
      if (buildOptions(x, y, G.cur).length) return openProduction(x, y);
      return refreshPanel();
    case 'selected': {
      const s = UIS.sel, i = idxOf(x, y);
      if (u && u.side !== s.side && UIS.attackSet.has(u.id)) {
        if (isTouch() && UIS.pendingTarget !== u) { UIS.pendingTarget = u; showToast('再點一次確認攻擊'); return refreshPanel(); }
        return attackFromSelected(u);
      }
      if (u === s) return moveSelectedTo(i);
      const r = UIS.reach.get(i);
      if (r && r.canStop) return moveSelectedTo(i);
      clearSel();
      if (u && u.side === G.cur && !u.done) return selectUnit(u);
      if (u) setInspect(u);
      return refreshPanel();
    }
    case 'menu': return cancelMove();
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
    if (r && r.canStop) { UIS.lastReachHover = i; UIS.path = reachPath(UIS.reach, i); }
    else if (u && UIS.attackSet.has(u.id)) {
      const ai = attackTileFor(u);
      UIS.path = ai >= 0 ? reachPath(UIS.reach, ai) : null;
    } else UIS.path = null;
  }
  refreshPanel();
}

// ----- 行動選單 -----
function showMenu(u) {
  const m = $('#actionMenu');
  m.innerHTML = '';
  const movedAway = u.x !== UIS.origin.x || u.y !== UIS.origin.y;
  const tg = !isIndirect(u.type) || !movedAway ? targetsFrom(u, u.x, u.y) : [];
  const add = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.innerHTML = label; b.className = cls;
    b.onclick = e => { e.stopPropagation(); fn(); };
    m.appendChild(b);
  };
  if (tg.length) add('⚔️ 攻擊', () => { UIS.mode = 'target'; UIS.targets = tg; hideMenu(); refreshPanel(); }, 'atk');
  if (canCapture(u)) {
    const p = capturePointsLeft(u);
    add(`🚩 佔領 <small>${p}→${Math.max(0, p - u.hp)}</small>`, () => doCaptureAction(u), 'cap');
  }
  add('⏸ 待機', () => finishUnit(u));
  add('↩ 取消', () => cancelMove(), 'muted');
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
function unitHTML(u) {
  const d = UNITS[u.type], S = SIDES[u.side];
  const rng = d.range[0] === d.range[1] ? d.range[0] : `${d.range[0]}-${d.range[1]}`;
  return `<div class="uhead"><span class="dot" style="background:${S.color}"></span><b>${d.name}</b><span class="fac">${FACTIONS[u.side].short}</span>
    <span class="tag">${CLASS_NAME[d.cls]}</span></div>
    <div class="hpbar"><i style="width:${u.hp * 10}%;background:${u.hp <= 3 ? '#e2574c' : u.hp <= 6 ? '#e0b54a' : '#5cc26b'}"></i><span>HP ${u.hp}/10</span></div>
    <div class="stats"><span>移動 ${d.move}</span><span>射程 ${rng}</span>
    ${d.fuel !== undefined ? `<span class="${u.fuel <= d.upkeep * 3 ? 'warn' : ''}">燃料 ${u.fuel}/${d.fuel}</span>` : ''}
    <span>價值 ${d.cost}</span></div>
    ${atkTable(u.type)}<div class="desc">${d.desc}${isIndirect(u.type) ? '' : ''}</div>`;
}
function refreshPanel() {
  if (!G) return;
  const S = SIDES[G.cur];
  $('#turnInfo').innerHTML = `第 <b>${G.turn}</b> 回合 · <span style="color:${S.light}">${S.name}${G.players[G.cur].ai ? '（電腦）' : ''}</span>`;
  $('#funds').innerHTML = SIDES.map((s, k) =>
    `<span class="pill ${k === G.cur ? 'active' : ''}" style="--c:${s.color}">${s.name} 💰${G.funds[k]} <small>+${incomeOf(k)}</small> · ${G.units.filter(u => u.side === k).length}隊</span>`).join('');
  $('#btnEnd').disabled = !isHumanTurn() || UIS.mode === 'busy';
  $('#btnNext').disabled = !isHumanTurn();

  // 任務目標
  const oc = $('#objCard');
  oc.classList.toggle('hidden', !G.missionId);
  if (G.missionId) { const html = objectivesHTML(); if (oc._last !== html) { oc.innerHTML = html; oc._last = html; } }

  // 地形
  const h = UIS.hover;
  if (h && inMap(h[0], h[1])) {
    const i = idxOf(h[0], h[1]), t = TERRAIN[G.terrain[i]];
    let html = `<h3>${t.name}</h3><div class="stats"><span>防禦 +${t.def}%</span>`;
    if (t.prop) {
      const o = G.owner[i];
      html += `<span>收入 ${t.income}</span><span style="color:${o >= 0 ? SIDES[o].light : '#ccc'}">${o >= 0 ? SIDES[o].name : '中立'}</span>`;
      if (G.capture[i]) html += `<span class="warn">佔領中 剩 ${G.capture[i].pts}</span>`;
    }
    html += '</div>';
    const mv = ['foot', 'tread', 'air', 'sea'].map(m => {
      const c = t.cost[m];
      return `<span>${{ foot: '步行', tread: '履帶', air: '飛行', sea: '海上' }[m]} ${c === undefined ? '✕' : c}</span>`;
    }).join('');
    html += `<div class="stats small">${mv}</div>`;
    if (t.build) html += `<div class="desc">可生產：${t.build.map(b => ({ land: '地面', air: '航空', sea: '海軍' }[b])).join('、')}部隊</div>`;
    $('#tileInfo').innerHTML = html;
  } else $('#tileInfo').innerHTML = '<h3>地形</h3><div class="desc">將游標移到地圖上查看資訊</div>';

  // 部隊
  const hu = h && inMap(h[0], h[1]) ? unitAt(h[0], h[1]) : null;
  const show = hu || UIS.sel || UIS.inspect;
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
  $('#modalBox').innerHTML = html;
  $('#modal').classList.remove('hidden');
  onReady && onReady($('#modalBox'));
}
function closeModal() { $('#modal').classList.add('hidden'); }

function openProduction(x, y) {
  const opts = buildOptions(x, y, G.cur), f = G.funds[G.cur], t = TERRAIN[G.terrain[idxOf(x, y)]];
  openModal(`<h2>生產部隊 · ${t.name}</h2><div class="sub">可用資金 <b>💰${f}</b>　生產的部隊下回合才能行動</div>
    <div class="prod-list">${opts.map(k => {
      const d = UNITS[k], rng = d.range[0] === d.range[1] ? d.range[0] : `${d.range[0]}-${d.range[1]}`;
      return `<button class="prod" data-k="${k}" ${d.cost > f ? 'disabled' : ''}>
        <canvas width="96" height="72" data-k="${k}"></canvas>
        <div class="pinfo"><div class="pname">${d.name}<span class="pcost">💰${d.cost}</span></div>
        <div class="stats small"><span>移動 ${d.move}</span><span>射程 ${rng}</span><span>${CLASS_NAME[d.cls]}</span>${d.fuel ? `<span>燃料 ${d.fuel}</span>` : ''}</div>
        ${atkTable(k)}<div class="desc">${d.desc}</div></div></button>`;
    }).join('')}</div>
    <div class="row"><button class="close">取消</button></div>`, box => {
    box.querySelectorAll('canvas[data-k]').forEach(c => {
      const g = c.getContext('2d');
      g.scale(2, 2);
      drawCounter(g, 24, 19, c.dataset.k, G.cur);
    });
    box.querySelectorAll('.prod').forEach(b => b.onclick = () => {
      produce(b.dataset.k, x, y, G.cur);
      closeModal(); refreshPanel();
    });
    box.querySelector('.close').onclick = closeModal;
  }, true);
}

function openNewGame() {
  const p = G ? G.players : [{ ai: false }, { ai: true }];
  openModal(`<h2>新遊戲</h2>
    <div class="form">
      <label>地圖大小<select id="ngSize"><option value="s">小（18×13）</option><option value="m" selected>中（24×15）</option><option value="l">大（30×19）</option></select></label>
      <label>地圖種子<span class="inline"><input id="ngSeed" type="number" value="${Math.floor(Math.random() * 99999)}"><button id="ngRand" type="button">🎲</button></span></label>
      <label><span><span class="dot" style="background:${SIDES[0].color}"></span>${FACTIONS[0].name}（先攻）</span><select id="ngP0"><option value="h">玩家</option><option value="ai" ${p[0].ai ? 'selected' : ''}>電腦</option></select></label>
      <label><span><span class="dot" style="background:${SIDES[1].color}"></span>${FACTIONS[1].name}</span><select id="ngP1"><option value="h">玩家</option><option value="ai" ${p[1].ai ? 'selected' : ''}>電腦</option></select></label>
      <label>電腦速度<select id="ngSpeed"><option value="200">慢</option><option value="110" selected>普通</option><option value="45">快</option></select></label>
    </div>
    <div class="facs">${FACTIONS.map((f, k) => `<div class="fac-card" style="--c:${SIDES[k].color}"><b>${f.name}</b><small>${f.motto}</small><p>${f.desc}</p></div>`).join('')}</div>
    <div class="row"><button class="close">取消</button><button id="ngStart" class="primary">開始作戰</button></div>`, box => {
    box.querySelector('#ngSpeed').value = String(SETTINGS.aiStep);
    box.querySelector('#ngRand').onclick = () => box.querySelector('#ngSeed').value = Math.floor(Math.random() * 99999);
    box.querySelector('.close').onclick = closeModal;
    box.querySelector('#ngStart').onclick = () => {
      const [w, h] = SIZES[box.querySelector('#ngSize').value];
      SETTINGS.aiStep = +box.querySelector('#ngSpeed').value;
      closeModal();
      startGame({
        w, h, seed: +box.querySelector('#ngSeed').value || 1,
        players: [{ ai: box.querySelector('#ngP0').value === 'ai' }, { ai: box.querySelector('#ngP1').value === 'ai' }],
      });
    };
  });
}

function openHelp() {
  openModal(`<h2>作戰說明</h2><div class="help">
    <h4>勝利條件</h4><p>以步兵類部隊<b>佔領敵方首都</b>，或<b>殲滅全部敵軍</b>。</p>
    <h4>基本操作</h4><ul>
      <li>點擊己方部隊 → 藍色格為可移動範圍，紅色為可攻擊目標。</li>
      <li>點擊目的地後選擇行動：攻擊、佔領、待機或取消。直接點擊紅色敵軍可自動移動並攻擊。</li>
      <li>拖曳平移地圖、滾輪/雙指縮放；右鍵或 Esc 取消；Tab 切換下一個未行動部隊。</li>
      <li>點擊敵軍可查看其威脅範圍（橘色）。</li></ul>
    <h4>經濟與生產</h4><ul>
      <li>每回合依據點獲得收入：首都 300、工廠 150、其他 100。</li>
      <li>點擊己方空的<b>首都/工廠</b>生產地面部隊、<b>首都/機場</b>生產航空部隊、<b>港口</b>生產艦艇。</li>
      <li>部隊停在己方據點上，回合開始時恢復 2 HP（花費部隊價格的 10%/HP），飛機需回首都或機場補充燃料，燃料耗盡會墜毀。</li></ul>
    <h4>戰鬥</h4><ul>
      <li>傷害 = 攻擊力 × (HP/10) × (1 − 地形防禦)，±10% 浮動。受損部隊攻擊力下降。</li>
      <li>相鄰的直接攻擊會遭到反擊；<b>自走砲、火箭、防空飛彈</b>為間接攻擊，不會被反擊，但移動後不能射擊。</li>
      <li>地面部隊進入敵方地面部隊相鄰格會被<b>控制區</b>攔下，飛機不受影響。</li>
      <li>佔領：步兵/反戰車兵每回合扣除等同 HP 的佔領點（總共 20），離開或陣亡則重置。</li></ul>
    ${FACTIONS.map((f, side) => `<h4 style="color:${SIDES[side].light}">${f.name}・${f.motto}</h4><p>${f.desc}</p>
    <div class="tablewrap"><table class="ut"><tr><th>兵種</th><th>價格</th><th>移動</th><th>射程</th><th>步</th><th>甲</th><th>直</th><th>空</th><th>艦</th></tr>
    ${Object.values(UNITS).filter(d => d.side === side).map(d => `<tr class="${BASE_UNITS[d.base] ? '' : 'uniq'}"><td>${d.name}</td><td>${d.cost}</td><td>${d.move}</td><td>${d.range.join('-')}</td>${d.atk.map(v => `<td class="${v ? '' : 'zero'}">${v}</td>`).join('')}</tr>`).join('')}</table></div>`).join('')}
    </div><div class="row"><button class="close primary">了解</button></div>`, box => box.querySelector('.close').onclick = closeModal, true);
}

function showVictory() {
  if (G.winner == null) return;
  if (G.missionId) { refreshPanel(); return showDebrief(); }
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
function openMoreMenu() {
  openModal(`<h2>選單</h2><div class="moregrid">
    <button id="moCamp">📖 劇情</button><button id="moNew">⚔️ 新遊戲</button>
    <button id="moSave">💾 存檔</button><button id="moLoad">📂 讀檔</button>
    <button id="moFull">⛶ 全螢幕</button><button id="moHelp">❓ 說明</button>
    <button id="moMain">🏠 主選單</button><button class="close">✕ 關閉</button></div>`, box => {
    box.querySelector('#moCamp').onclick = openCampaignMenu;
    box.querySelector('#moNew').onclick = openNewGame;
    box.querySelector('#moSave').onclick = openSaveDialog;
    box.querySelector('#moLoad').onclick = openLoadDialog;
    box.querySelector('#moFull').onclick = () => { closeModal(); toggleFullscreen(); };
    box.querySelector('#moHelp').onclick = openHelp;
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
  openModal(`<div class="mainmenu"><div class="logo">大戰略</div><div class="tagline">聯邦戰記 · 六角格現代戰爭</div>
    <button class="primary big" id="mmCamp">📖 劇情模式${CAMP.current ? `<small>繼續：${MISSIONS[CAMP.current].title}</small>` : ''}</button>
    <button class="big" id="mmFree">⚔️ 自由對戰<small>隨機地圖 · 對電腦或雙人</small></button>
    <button class="big" id="mmLoad">💾 讀取存檔</button>
    <button class="big" id="mmHelp">❓ 作戰說明</button></div>`, box => {
    box.querySelector('#mmCamp').onclick = openCampaignMenu;
    box.querySelector('#mmFree').onclick = openNewGame;
    box.querySelector('#mmLoad').onclick = openLoadDialog;
    box.querySelector('#mmHelp').onclick = openHelp;
  });
}

function showBanner(text, color) {
  const b = $('#banner');
  b.textContent = text; b.style.setProperty('--c', color);
  b.classList.remove('hidden'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(b._t); b._t = setTimeout(() => b.classList.add('hidden'), 1400);
}

// ----- 回合流程 -----
async function turnIntro() {
  const token = gameToken;
  refreshPanel();
  showBanner(`第 ${G.turn} 回合　${SIDES[G.cur].name}`, SIDES[G.cur].color);
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
  UIS.mode = 'idle';
  if (G.players.every(p => !p.ai)) { const [cx, cy] = idxCenter(G.caps[G.cur]); centerOn(cx, cy); }
  autoSave();
  refreshPanel();
}
function endTurnClicked() {
  if (!isHumanTurn() || UIS.mode === 'busy') return;
  clearSel(); setInspect(null);
  endTurn();
  turnIntro();
}
function nextUnit() {
  if (!isHumanTurn() || UIS.mode === 'busy') return;
  const list = G.units.filter(u => u.side === G.cur && !u.done);
  if (!list.length) return;
  const k = UIS.sel ? (list.indexOf(UIS.sel) + 1) % list.length : 0;
  if (UIS.mode === 'menu') cancelMove();
  selectUnit(list[k]);
  const [cx, cy] = tileCenter(list[k].x, list[k].y);
  centerOn(cx, cy);
}

function startGame(opts) {
  clearSel(); setInspect(null); FX.length = 0;
  newGame(opts);
  buildTerrain();
  resize();
  fitView();
  const [cx, cy] = idxCenter(G.caps[G.players[0].ai && !G.players[1].ai ? 1 : 0]);
  centerOn(cx, cy);
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
    cvs.setPointerCapture(e.pointerId);
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
  cvs.addEventListener('pointerleave', () => { if (!down) { UIS.hover = null; refreshPanel(); } });
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
    mini.setPointerCapture(e.pointerId);
    mini.onpointermove = ev => { if (ev.buttons) move(ev); };
  });

  window.addEventListener('keydown', e => {
    if (!$('#modal').classList.contains('hidden')) { if (e.key === 'Escape' && modalDismissable) closeModal(); return; }
    if (e.key === 'Escape') cancelAction();
    else if (e.key === 'Tab') { e.preventDefault(); nextUnit(); }
  });
  $('#btnEnd').onclick = endTurnClicked;
  $('#btnNext').onclick = nextUnit;
  $('#btnNew').onclick = openNewGame;
  $('#btnSave').onclick = saveGame;
  $('#btnLoad').onclick = loadGame;
  $('#btnHelp').onclick = openHelp;
  $('#btnCampaign').onclick = openCampaignMenu;
  $('#btnMore').onclick = openMoreMenu;
  $('#btnPanel').onclick = () => {
    $('#app').classList.toggle('panel-off');
    try { localStorage.setItem('daisenryaku_panel', $('#app').classList.contains('panel-off') ? '0' : '1'); } catch (e) { /* 忽略 */ }
  };
  try { if (localStorage.getItem('daisenryaku_panel') === '0') $('#app').classList.add('panel-off'); } catch (e) { /* 忽略 */ }
  $('#rotateOk').onclick = () => document.body.classList.add('rotate-ok');
  document.addEventListener('gesturestart', e => e.preventDefault());
  $('#btnMenu').onclick = openMainMenu;
  const lb = $('#zLabel');
  lb.classList.toggle('on', SETTINGS.labels);
  lb.onclick = () => {
    SETTINGS.labels = !SETTINGS.labels; lb.classList.toggle('on', SETTINGS.labels);
    try { localStorage.setItem('daisenryaku_labels', SETTINGS.labels ? '1' : '0'); } catch (e) { /* 忽略 */ }
  };
  $('#zIn').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1.2); };
  $('#zOut').onclick = () => { const [vw, vh] = viewSize(); zoomAt(vw / 2, vh / 2, 1 / 1.2); };
  $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && modalDismissable) closeModal(); });
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

window.addEventListener('DOMContentLoaded', () => {
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
    requestAnimationFrame(frame);
  })(performance.now());
});
