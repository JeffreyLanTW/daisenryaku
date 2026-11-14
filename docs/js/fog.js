'use strict';
// ===== 戰爭迷霧（可在設定開關）=====
// 只影響「人類玩家看到的畫面」：看不見的格子變暗、敵軍隱藏、不能點選或瞄準看不見的敵軍。
// 電腦 AI 不受迷霧限制（照常掌握全場資訊）。
// 視野：部隊 3 格；飛機、艦艇 4 格；偵察類 +2；站在山上 +1；己方據點 2 格（首都 3 格）。
const FOG_SCOUT = new Set(['recon', 'scoutheli', 'uav', 'mpa', 'specops', 'sniper']);
const FOG = { key: '', vis: null, side: -1, lastHuman: -1, t: 0 };
function setFog(on) {
  SETTINGS.fog = !!on;
  try { localStorage.setItem('daisenryaku_fog', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
  FOG.key = '';
  if (typeof G !== 'undefined' && G && typeof buildTerrain === 'function') { G.terrainDirty = true; }
}
// 要從哪一方的視角顯示迷霧：輪到人類玩家時就是他；電腦回合時沿用最後一位人類玩家；全部是電腦（觀戰）時不顯示迷霧
function fogViewer() {
  if (!SETTINGS.fog || typeof G === 'undefined' || !G || !G.players || G.winner != null) return -1;
  if (G.players.every(p => p.ai)) return -1;
  if (!G.players[G.cur].ai && !G.autoPilot) FOG.lastHuman = G.cur;
  if (FOG.lastHuman < 0 || FOG.lastHuman >= G.players.length || G.players[FOG.lastHuman].ai) FOG.lastHuman = G.players.findIndex(p => !p.ai);
  return FOG.lastHuman;
}
function visionOf(u) {
  const d = UNITS[u.type];
  if (!d) return 0;
  let r = d.cat === 'air' ? 4 : d.cat === 'sea' ? (d.base === 'submarine' ? 3 : 4) : 3;
  if (FOG_SCOUT.has(d.base)) r += 2;
  if (G.terrain[idxOf(u.x, u.y)] === 'mountain') r += 1;
  return r;
}
// 目前觀看方的可見格（Uint8Array，1＝看得見）；沒有迷霧時回傳 null
function fogVis() {
  const s = fogViewer();
  if (s < 0) { FOG.vis = null; FOG.side = -1; return null; }
  // 部隊位置或據點歸屬改變時才重算
  let h = s * 7919 + G.units.length;
  for (const u of G.units) if (u.side === s) h = (h * 31 + u.x * 131 + u.y * 7 + u.id) | 0;
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === s) h = (h * 17 + i) | 0;
  const key = h + '|' + G.w + 'x' + G.h;
  if (key === FOG.key && FOG.vis) return FOG.vis;
  FOG.key = key; FOG.side = s;
  const vis = new Uint8Array(G.w * G.h);
  const reveal = (x, y, r) => {
    for (let yy = Math.max(0, y - r); yy <= Math.min(G.h - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r - 1); xx <= Math.min(G.w - 1, x + r + 1); xx++)
        if (hexDist(x, y, xx, yy) <= r) vis[yy * G.w + xx] = 1;
  };
  for (const u of G.units) if (u.side === s) reveal(u.x, u.y, visionOf(u));
  for (let i = 0; i < G.owner.length; i++) if (G.owner[i] === s) { const [x, y] = ixy(i); reveal(x, y, G.terrain[i] === 'capital' ? 3 : 2); }
  FOG.vis = vis;
  return vis;
}
// 這個部隊在畫面上看得見嗎（自己人永遠看得見）
function unitSeen(u) {
  const vis = fogVis();
  if (!vis || u.side === FOG.side) return true;
  return !!vis[idxOf(u.x, u.y)];
}
const tileSeen = i => { const vis = fogVis(); return !vis || !!vis[i]; };
// 畫面用的 unitAt：看不見的敵軍當作沒有
function seenUnitAt(x, y) { const u = unitAt(x, y); return u && unitSeen(u) ? u : null; }
