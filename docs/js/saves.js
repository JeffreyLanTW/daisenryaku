'use strict';
// ===== 存檔系統：具名存檔欄、自動存檔、匯出匯入 =====

const SAVE_INDEX = 'daisenryaku_saves_v2';
const SAVE_PREFIX = 'daisenryaku_slot_';
const AUTO_ID = 'auto';
const OLD_SAVE_KEY = 'daisenryaku_save_v1';

function readIndex() {
  try { return JSON.parse(localStorage.getItem(SAVE_INDEX)) || []; } catch (e) { return []; }
}
function writeIndex(list) { localStorage.setItem(SAVE_INDEX, JSON.stringify(list)); }
const escHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 遊戲狀態摘要（存檔列表顯示用）
function describeGame(g) {
  if (g.missionId && MISSIONS[g.missionId]) {
    const M = MISSIONS[g.missionId];
    return { mode: '劇情', title: `${M.chapter}・${M.title}` };
  }
  return { mode: '自由對戰', title: `${g.w}×${g.h} 隨機地圖` };
}
function defaultSaveName() {
  const d = describeGame(G);
  return `${d.title} 第${G.turn}回合`;
}
function serializeGame() {
  const camp = G.missionId ? { id: campOf(MISSIONS[G.missionId]), flags: CAMP.flags, current: CAMP.current, roster: CAMP.roster || {}, carryFunds: CAMP.carryFunds || 0 } : null;
  return JSON.stringify({ v: 2, G, camp }, (k, v) => k === '_anim' || k === 'lfAssign' || k === 'lfPower' ? undefined : v);
}

// 存檔縮圖：小地圖
function makeThumb(g) {
  try {
    const [ww, wh] = [2 * HW * g.w + HW, 1.5 * R * (g.h - 1) + 2 * R];
    const c = document.createElement('canvas');
    c.width = 120; c.height = Math.round(120 * wh / ww);
    const x = c.getContext('2d'), s = c.width / ww;
    x.fillStyle = '#2f629a'; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(s, 0, 0, s, 0, 0);
    const center = i => { const tx = i % g.w, ty = (i / g.w) | 0; return [2 * HW * tx + HW * (ty & 1) + HW, 1.5 * R * ty + R]; };
    for (let i = 0; i < g.terrain.length; i++) {
      const [cx, cy] = center(i), t = g.terrain[i];
      hexPath(x, cx, cy, R + 1);
      x.fillStyle = TERRAIN[t].prop ? (g.owner[i] >= 0 ? SIDES[g.owner[i]].light : '#f4f4f4') : t === 'road' ? '#cdbf8f' : TCOLOR[t];
      x.fill();
    }
    for (const u of g.units) {
      const [cx, cy] = center(u.y * g.w + u.x);
      x.fillStyle = SIDES[u.side].color; circle(x, cx, cy, R * 0.7); x.fill();
    }
    return c.toDataURL('image/png');
  } catch (e) { return ''; }
}

// 寫入存檔欄；id 省略則新增
function writeSlot(name, id = null, auto = false) {
  const data = serializeGame();
  const d = describeGame(G);
  id = id || `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const meta = {
    id, name: name.trim() || defaultSaveName(), time: Date.now(), auto,
    mode: d.mode, title: d.title, turn: G.turn, side: G.cur, thumb: makeThumb(G),
  };
  try {
    localStorage.setItem(SAVE_PREFIX + id, data);
    const list = readIndex().filter(m => m.id !== id);
    list.push(meta);
    writeIndex(list);
    return meta;
  } catch (e) {
    showBanner('儲存空間不足，請刪除舊存檔', '#a33');
    return null;
  }
}
function deleteSlot(id) {
  try { localStorage.removeItem(SAVE_PREFIX + id); writeIndex(readIndex().filter(m => m.id !== id)); } catch (e) { /* 忽略 */ }
}
function renameSlot(id, name) {
  const list = readIndex(), m = list.find(e => e.id === id);
  if (!m || !name.trim()) return;
  m.name = name.trim();
  try { writeIndex(list); } catch (e) { /* 忽略 */ }
}
function readSlot(id) {
  try { return JSON.parse(localStorage.getItem(SAVE_PREFIX + id)); } catch (e) { return null; }
}
function sortedSlots() {
  return readIndex().sort((a, b) => (b.auto - a.auto) || (b.time - a.time));
}

// 舊版單一存檔轉成具名存檔
function migrateOldSave() {
  try {
    const raw = localStorage.getItem(OLD_SAVE_KEY);
    if (!raw) return;
    const g = JSON.parse(raw);
    const d = describeGame(g), id = 'legacy';
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify({ v: 2, G: g, camp: null }));
    const list = readIndex().filter(m => m.id !== id);
    list.push({ id, name: '舊存檔', time: Date.now(), auto: false, mode: d.mode, title: d.title, turn: g.turn, side: g.cur, thumb: makeThumb(g) });
    writeIndex(list);
    localStorage.removeItem(OLD_SAVE_KEY);
  } catch (e) { /* 忽略 */ }
}

function canSaveNow() { return G && UIS.mode !== 'busy' && isHumanTurn(); }

// 每個玩家回合開始時自動存檔
function autoSave() {
  if (!canSaveNow()) return;
  writeSlot('自動存檔', AUTO_ID, true);
}

// 套用讀取的存檔
function applySave(obj) {
  const g = obj && (obj.G || obj);
  if (!g || !Array.isArray(g.terrain) || !Array.isArray(g.units)) { showBanner('存檔格式錯誤', '#a33'); return false; }
  if (g.missionId && !MISSIONS[g.missionId]) { showBanner('此存檔屬於舊版劇情（fictional-v1 分支）', '#a33'); return false; }
  gameToken++;
  clearSel(); setInspect(null); FX.length = 0;
  G = g;
  if (!G.airFuelCrashCount) G.airFuelCrashCount = [0, 0];
  if (!G.nations) G.nations = ['TW', 'CN'];
  applyNations(G.nations, G.allies || []);
  const normUnit = u => {
    if (u.cls === 'heli') u.cls = 'air';
    if (u.mt === 'heli') u.mt = 'air';
    u.type = ftype(u.type, u.side);
    for (const c of u.cargo || []) normUnit(c);
  };
  for (const u of G.units) normUnit(u);
  for (const u of G.reserve || []) normUnit(u);
  if (obj.camp) {
    loadCamp(obj.camp.id && CAMPAIGNS[obj.camp.id] ? obj.camp.id : campOf(MISSIONS[G.missionId]));
    CAMP.flags = obj.camp.flags || {};
    CAMP.current = obj.camp.current || G.missionId;
    CAMP.roster = obj.camp.roster || {};
    for (const list of Object.values(CAMP.roster)) if (Array.isArray(list)) for (const r of list) { if (r.cls === 'heli') r.cls = 'air'; }
    CAMP.carryFunds = obj.camp.carryFunds || 0;
    saveCamp();
  }
  closeModal();
  buildTerrain(); resize(); fitView();
  const [cx, cy] = idxCenter(G.caps[G.cur]); centerOn(cx, cy);
  showBanner('讀取完成', '#3a8a4a');
  UIS.mode = 'idle';
  if (G.winner == null && typeof playContextBGM === 'function') playContextBGM('combat', true);
  if (G.winner != null) showVictory();
  else if (G.players[G.cur].ai) turnIntro();
  else refreshPanel();
  return true;
}

function exportSlot(id) {
  const raw = localStorage.getItem(SAVE_PREFIX + id), m = readIndex().find(e => e.id === id);
  if (!raw || !m) return;
  const blob = new Blob([raw], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `大戰略_${m.name.replace(/[\\/:*?"<>|]/g, '_')}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(raw).then(() => {
      showBanner('已下載檔案並複製存檔代碼至剪貼簿', '#3a8a4a');
    }).catch(() => {
      showBanner('已匯出存檔檔案', '#3a8a4a');
    });
  } else {
    showBanner('已匯出存檔檔案', '#3a8a4a');
  }
}

// 跨平台（含 iOS / iPadOS Safari & iCloud Drive）文字檔案讀取器
function readFileText(f, cb) {
  if (typeof FileReader !== 'undefined') {
    const reader = new FileReader();
    reader.onload = e => cb(e.target.result);
    reader.onerror = () => {
      if (typeof f.text === 'function') f.text().then(cb).catch(() => cb(null));
      else cb(null);
    };
    try {
      reader.readAsText(f);
      return;
    } catch (e) { /* fallback below */ }
  }
  if (typeof f.text === 'function') {
    f.text().then(cb).catch(() => cb(null));
  } else {
    cb(null);
  }
}

// 驗證並儲存存檔 JSON
function processSaveJSON(txt, fileName = '匯入存檔') {
  if (!txt) { showBanner('檔案內容為空', '#a33'); return false; }
  txt = txt.trim().replace(/^\uFEFF/, '');
  let obj = null;
  try { obj = JSON.parse(txt); } catch (e) { /* 忽略 */ }
  const g = obj && (obj.G || obj);
  if (!g || !Array.isArray(g.terrain) || !Array.isArray(g.units)) {
    showBanner('不是有效的大戰略存檔檔案', '#a33');
    return false;
  }
  const d = describeGame(g), id = `i${Date.now().toString(36)}`;
  try {
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(obj.G ? obj : { v: 2, G: g, camp: null }));
    const list = readIndex();
    const saveName = (fileName || '匯入存檔').replace(/\.json$/i, '').replace(/\.txt$/i, '').replace(/^大戰略_/, '').trim() || '匯入存檔';
    list.push({
      id, name: saveName, time: Date.now(), auto: false,
      mode: d.mode, title: d.title, turn: g.turn, side: g.cur, thumb: makeThumb(g)
    });
    writeIndex(list);
    showBanner('已成功匯入存檔！', '#3a8a4a');
    return true;
  } catch (e) {
    showBanner('儲存空間不足', '#a33');
    return false;
  }
}

function openPasteImportDialog(onDone) {
  openModal(`<h2>📋 貼上代碼匯入存檔</h2>
    <div class="sub">若從 iCloud 或其他裝置複製了存檔 JSON，可在此直接貼上匯入：</div>
    <textarea id="pasteArea" placeholder="在此貼上大戰略存檔 JSON 代碼..." style="width:100%;height:160px;font-family:monospace;font-size:12px;background:#0d1217;color:#c8d2dc;border:1px solid var(--line);border-radius:6px;padding:8px;box-sizing:border-box;resize:vertical"></textarea>
    <div class="row" style="flex-wrap:wrap;gap:6px">
      <button id="btnReadClip">📋 從剪貼簿貼上</button>
      <span class="spacer"></span>
      <button class="close">取消</button>
      <button class="primary" id="btnConfirmPaste">確定匯入</button>
    </div>`, box => {
    const ta = box.querySelector('#pasteArea');
    box.querySelector('#btnReadClip').onclick = async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const clipText = await navigator.clipboard.readText();
          if (clipText) ta.value = clipText;
        } else {
          showBanner('請於文字框長按貼上', '#666');
        }
      } catch (err) {
        showBanner('請於文字框長按貼上', '#666');
      }
    };
    box.querySelector('#btnConfirmPaste').onclick = () => {
      if (processSaveJSON(ta.value, '貼上存檔')) {
        closeModal();
        onDone && onDone();
      }
    };
    box.querySelector('.close').onclick = onDone || closeModal;
  }, true);
}

function importSaveFile(onDone) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json,text/plain,text/json,application/octet-stream,*/*';
  inp.style.position = 'fixed';
  inp.style.left = '-9999px';
  inp.style.opacity = '0';
  document.body.appendChild(inp);
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) { inp.remove(); return; }
    readFileText(f, txt => {
      inp.remove();
      if (processSaveJSON(txt, f.name)) {
        onDone && onDone();
      }
    });
  };
  inp.click();
}

// ----- 介面 -----
function slotRow(m, forSave) {
  const t = new Date(m.time).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const btns = forSave
    ? (m.auto ? '' : `<button data-act="overwrite" data-id="${m.id}">覆蓋</button>`)
    : `<button class="primary" data-act="load" data-id="${m.id}">讀取</button>
       ${m.auto ? '' : `<button data-act="rename" data-id="${m.id}" title="重新命名">✎</button>`}
       <button data-act="export" data-id="${m.id}" title="匯出檔案">⇩</button>
       <button data-act="delete" data-id="${m.id}" title="刪除">🗑</button>`;
  return `<div class="slot ${m.auto ? 'auto' : ''}" data-id="${m.id}">
    ${m.thumb ? `<img src="${m.thumb}" alt="">` : '<div class="nothumb"></div>'}
    <div class="sinfo"><div class="sname">${m.auto ? '🔄 ' : ''}${escHTML(m.name)}</div>
      <div class="smeta"><span class="tag">${m.mode}</span>${escHTML(m.title)} · 第 ${m.turn} 回合 · <span style="color:${SIDES[m.side] ? SIDES[m.side].light : '#ccc'}">${SIDES[m.side] ? SIDES[m.side].name : ''}</span></div>
      <div class="stime">${t}</div></div>
    <div class="sbtns">${btns}</div></div>`;
}

function openSaveDialog() {
  if (!canSaveNow()) return showBanner('只能在自己的回合存檔', '#666');
  const slots = sortedSlots().filter(m => !m.auto);
  openModal(`<h2>存檔</h2>
    <div class="savenew"><input id="saveName" maxlength="40" value="${escHTML(defaultSaveName())}" placeholder="存檔名稱">
      <button class="primary" id="saveNewBtn">💾 新增存檔</button></div>
    ${slots.length ? `<div class="sub">或覆蓋既有存檔：</div><div class="slots">${slots.map(m => slotRow(m, true)).join('')}</div>` : '<div class="sub">尚無存檔。</div>'}
    <div class="row"><button class="close">關閉</button></div>`, box => {
    const inp = box.querySelector('#saveName');
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
    const doSave = () => { if (writeSlot(inp.value)) { closeModal(); showBanner(`已存檔：${inp.value.trim() || defaultSaveName()}`, '#3a8a4a'); } };
    box.querySelector('#saveNewBtn').onclick = doSave;
    inp.onkeydown = e => { if (e.key === 'Enter') doSave(); };
    box.querySelectorAll('[data-act="overwrite"]').forEach(b => {
      b.onclick = () => {
        if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '確定覆蓋？'; b.classList.add('danger'); return; }
        const m = readIndex().find(e => e.id === b.dataset.id);
        const name = inp.value.trim() && inp.value !== defaultSaveName() ? inp.value : m.name;
        if (writeSlot(name, m.id)) { closeModal(); showBanner(`已覆蓋：${name}`, '#3a8a4a'); }
      };
    });
    box.querySelector('.close').onclick = closeModal;
  }, true);
}

function openLoadDialog() {
  migrateOldSave();
  const slots = sortedSlots();
  openModal(`<h2>讀取存檔</h2>
    ${slots.length ? `<div class="slots">${slots.map(m => slotRow(m, false)).join('')}</div>` : '<div class="sub">還沒有任何存檔。遊戲中按「存檔」即可建立，每回合開始時也會自動存檔。</div>'}
    <div class="row" style="flex-wrap:wrap;gap:6px">
      <label class="btn-import-file" id="importFileLabel" title="從本機或 iCloud 選擇存檔檔案 (.json)">
        ⇧ 選擇檔案匯入
        <input type="file" id="importInp" accept=".json,application/json,text/plain,text/json,application/octet-stream,*/*">
      </label>
      <button id="importPasteBtn" title="貼上 JSON 存檔內容或從剪貼簿讀取">📋 貼上代碼</button>
      <span class="spacer"></span>
      <button class="close">關閉</button>
    </div>`, box => {
    box.querySelector('.close').onclick = closeModal;
    const fileInp = box.querySelector('#importInp');
    if (fileInp) {
      fileInp.onchange = e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        readFileText(f, txt => {
          if (processSaveJSON(txt, f.name)) {
            openLoadDialog();
          }
        });
        e.target.value = '';
      };
    }
    const pasteBtn = box.querySelector('#importPasteBtn');
    if (pasteBtn) pasteBtn.onclick = () => openPasteImportDialog(openLoadDialog);
    box.querySelectorAll('[data-act]').forEach(b => {
      const id = b.dataset.id;
      b.onclick = () => {
        switch (b.dataset.act) {
          case 'load': {
            const obj = readSlot(id);
            if (!obj) return showBanner('存檔已損毀', '#a33');
            applySave(obj);
            break;
          }
          case 'export': exportSlot(id); break;
          case 'delete':
            if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = '確定刪除？'; b.classList.add('danger'); return; }
            deleteSlot(id); openLoadDialog();
            break;
          case 'rename': {
            const nameEl = box.querySelector(`.slot[data-id="${id}"] .sname`);
            const m = readIndex().find(e => e.id === id);
            nameEl.innerHTML = `<input class="renameInp" maxlength="40" value="${escHTML(m.name)}">`;
            const ri = nameEl.querySelector('input');
            ri.focus(); ri.select();
            const commit = () => { renameSlot(id, ri.value); openLoadDialog(); };
            ri.onkeydown = e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') openLoadDialog(); };
            ri.onblur = commit;
            break;
          }
        }
      };
    });
  }, true);
}
