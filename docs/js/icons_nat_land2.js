'use strict';
// 各國專屬單位造型（land2）：主力戰車、輕戰車、步兵戰鬥車、裝甲運兵車、偵察車、卡車、列車、步兵類
(function () {
  if (typeof NAT_ICONS === 'undefined') return;
  const reg = (base, map) => { NAT_ICONS[base] = Object.assign(NAT_ICONS[base] || {}, map); };
  const PI = Math.PI;

  // ---------- 共用小工具 ----------
  const B = (T, x1, y1, x2, y2, w = 3) => { T.line(x1, y1, x2, y2, w, T.ink); T.line(x1, y1, x2, y2, Math.max(0.8, w - 1.6), T.lo); };   // 砲管
  const trk = (T, x0 = -17, w = 34, n = 3, y0 = 4.5, h = 8.5) => T.toonTracks(x0, y0, w, h, n);
  const dome = (T, x, y, rx, ry) => T.toonEll(x, y, rx, ry, 0, T.col, 2.6, PI, PI * 2);
  const wheels = (T, xs, r = 4.2, y = 8.5) => T.toonWheels(xs, y, r);
  const rail = T => { T.line(-21, 12.5, 21, 12.5, 2.6, T.ink); };
  const rw = (T, xs, y = 9.5, r = 2.8) => { for (const x of xs) T.toonCirc(x, y, r, '#1f2937', 1.6); };
  const DK = '#1f2937', WOOD = '#92400e', OD = '#4d7c0f', KHAKI = '#c8a165', SKIN = '#f2c79b';

  // ---------- 小型步槍（局部座標：槍托在 0，槍口在 +L） ----------
  const RIF = {
    TW: { top: 'handle' },                       // T91 / T65
    CN: { bp: 1, top: 'tall' },                  // QBZ-95 犢牛式
    US: { skel: 1, top: 'scope', L: 21 },        // M4 + 光學瞄具
    JP: { bip: 1 },                              // 89 式
    KR: { skel: 1 },                             // K2 折疊槍托
    KP: { mag: 'curve', wood: 1 },               // 88 式（AK 系）
    PH: { top: 'handle', L: 25 },                // M16A1
    VN: { mag: 'curve', wood: 1, L: 22 },        // AKM
    RU: { mag: 'curve', plum: 1 },               // AK-74M
    IN: { mag: 'curve', wood: 1, top: 'none', L: 24, clear: 1 },  // INSAS 半透明彈匣
    PK: { mag: 'long', L: 27 },                  // G3
    GB: { bp: 1, top: 'scope' },                 // L85 + SUSAT
    FR: { bp: 1, top: 'long' },                  // FAMAS 長提把
    DE: { top: 'g36' },                          // G36
    AU: { bp: 1, top: 'round', green: 1 },       // F88 (AUG)
    IL: { bp: 1, top: 'hump' },                  // Tavor
  };
  const rifle = (T, x, y, a, o = RIF[T.nat] || {}, s = 1) => {
    const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    const L = o.L || 23, body = o.green ? '#3f6212' : DK, bp = !!o.bp, rx = bp ? 1 : 7;
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    if (!bp) {
      if (o.skel) { line(0, -1.5, 7, -1.5, 1.6, ink); line(0, -1.5, 0, 2.6, 1.8, ink); line(0, 2.6, 7, 1, 1.6, ink); }
      else toonPoly([[0, -1.8], [7, -1.6], [7, 1.6], [0, 3.4]], o.wood ? WOOD : (o.plum ? '#7c2d12' : DK), 1.5);
    }
    const rl = bp ? 15 : 9;
    toonRR(rx, -2, rl, 4, 1.3, bp ? body : (o.wood ? DK : body), 1.5);
    line(rx + rl, -0.5, L, -0.5, 1.8, ink);
    if (o.wood) toonRR(rx + rl - 1, -1.8, 5, 3, 1, WOOD, 1.2);
    const mx = bp ? 3.5 : rx + 3.5;
    if (o.mag === 'curve') toonPoly([[mx, 1.8], [mx + 3, 1.8], [mx + 4.6, 6.8], [mx + 2, 7.6]], o.clear ? '#fbbf24' : (o.plum ? '#9a3412' : DK), 1.3);
    else toonRR(mx, 1.8, 2.6, o.mag === 'long' ? 7 : 5, 0.8, DK, 1.3);
    toonPoly([[mx + (bp ? 6 : -3), 2], [mx + (bp ? 8 : -1), 2], [mx + (bp ? 7 : -2), 6], [mx + (bp ? 5 : -4), 6]], DK, 1.2);
    if (o.top === 'handle') { line(rx + 1, -3.6, rx + 8, -3.6, 1.6, ink); line(rx + 1.5, -3.6, rx + 1.5, -2, 1.2, ink); }
    else if (o.top === 'tall') { line(rx + 3, -4.6, rx + 12, -4.6, 1.8, ink); line(rx + 11, -4.6, rx + 11, -2, 1.4, ink); }
    else if (o.top === 'scope') toonRR(rx + 2, -4.8, 7, 2.6, 1.2, '#0f172a', 1.1);
    else if (o.top === 'long') { line(rx + 1, -4.2, rx + 15, -4.2, 1.8, ink); line(rx + 1, -4.2, rx + 1, -2, 1.3, ink); }
    else if (o.top === 'g36') { toonRR(rx + 0.5, -5.2, 9, 3, 1.2, DK, 1.1); }
    else if (o.top === 'round') toonRR(rx + 4, -5.4, 8, 3.2, 1.6, '#3f6212', 1.2);
    else if (o.top === 'hump') toonPoly([[rx + 2, -2], [rx + 5, -4.6], [rx + 13, -4.6], [rx + 15, -2]], body, 1.2);
    if (o.bip) { line(L - 6, 0, L - 8, 5, 1.3, ink); line(L - 6, 0, L - 4, 5, 1.3, ink); }
    c.restore();
  };

  // ---------- 各國頭部（步兵類共用；16 國輪廓各不相同） ----------
  const hg = (T, x, y, s) => {
    const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    if (['TW', 'JP', 'GB', 'FR', 'DE', 'RU'].includes(nat)) return drawNationalHelmet(x, y, s);
    c.save(); c.translate(x, y); c.scale(s, s);
    if (nat === 'US') {          // PASGT＋盔上護目鏡
      drawNationalHelmet(0, 0, 1);
      toonRR(-13, -10, 26, 5, 2.4, DK, 2); toonRR(-10, -9.3, 8, 3.4, 1.6, '#fbbf24', 1.2); toonRR(2, -9.3, 8, 3.4, 1.6, '#fbbf24', 1.2);
    } else if (nat === 'KR') {   // 鋼盔＋偽裝葉盔罩
      drawNationalHelmet(0, 0, 1);
      for (const [px, py] of [[-14, -4], [-10, -11], [-3, -15], [4, -15], [10, -11], [14, -4]]) toonCirc(px, py, 3.4, OD, 1.5);
    } else if (nat === 'PK') {   // 鋼盔＋垂掛偽裝網條
      drawNationalHelmet(0, 0, 1);
      line(-14, -4, 14, -4, 1.6, DK); line(-10, -11, 10, -11, 1.6, DK);
      for (const px of [-17, -12, 12, 17]) toonPoly([[px - 1.5, 6], [px + 1.5, 6], [px + 1, 14], [px - 1, 14]], OD, 1.4);
    } else if (nat === 'CN') {   // QGF-03：兩側耳部切口
      toonPoly([[-17, 9], [-12, 9], [-11, 4], [11, 4], [12, 9], [17, 9], [16, 0], [12, -9], [4, -14], [-4, -14], [-12, -9], [-16, 0]], col, 2.8);
      shine(-5, -7, 5, 2.3, -0.3); toonCirc(0, -3, 3.8, '#b91c1c', 1.6); toonCirc(0, -3, 1.8, '#facc15', 1);
    } else if (nat === 'KP') {   // 高頂大簷帽
      toonPoly([[-17, -13], [17, -13], [11, 1], [-11, 1]], col, 2.8);
      toonRR(-11, 0, 22, 5, 1.5, lo, 2.2); toonEll(5, 6, 13, 3, 0, DK, 2.2);
      toonCirc(0, -6, 3.4, '#dc2626', 1.4);
    } else if (nat === 'VN') {   // 盔帽 mũ cối
      toonEll(0, 6, 19, 4.5, 0, lo, 2.4); toonEll(0, 6, 13, 16, 0, col, 2.8, PI, PI * 2);
      toonCirc(0, -10.5, 1.8, lo, 1.4); toonCirc(0, -1, 3.4, '#dc2626', 1.4); toonCirc(0, -1, 1.4, '#facc15', 0.8);
    } else if (nat === 'PH') {   // 叢林圓邊帽
      toonEll(0, 5, 19, 5, 0, lo, 2.4); toonRR(-11, -11, 22, 16, 6, col, 2.8);
      line(-11, 1, 11, 1, 2.6, DK); shine(-4, -6, 4, 2, -0.2);
    } else if (nat === 'IN') {   // 纏頭巾 patka／turban
      toonEll(0, -1, 15, 13, 0, col, 2.8);
      line(-13, 4, 12, -9, 2, lo); line(-14, -2, 8, -12, 2, lo); line(-11, 8, 14, -4, 2, lo);
      toonPoly([[-3, 0], [0, -9], [3, 0], [0, 3]], '#facc15', 1.4);
    } else if (nat === 'AU') {   // 澳式寬簷帽（左簷翻起）
      toonPoly([[-14, 6], [-18, -12], [-13, -12], [-10, 6]], lo, 2.2);
      toonPoly([[-11, 6], [19, 6], [17, 9], [-11, 9]], lo, 2.4);
      toonPoly([[-10, 6], [10, 6], [8, -10], [0, -13], [-8, -10]], col, 2.8);
      line(-10, 2, 10, 2, 2.4, DK); toonCirc(-15, -4, 2.4, '#facc15', 1.2);
    } else if (nat === 'IL') {   // 蘑菇狀布盔罩 mitznefet
      toonEll(0, 0, 19, 9, 0, col, 2.8);
      for (const [px, py] of [[-13, -4], [-5, -8], [4, -8], [12, -4]]) toonCirc(px, py, 4.6, col, 2);
      toonEll(0, 7, 12, 3, 0, lo, 2); shine(-6, -9, 3, 1.4, 0);
    }
    c.restore();
  };

  // ======================= 主力戰車 =======================
  reg('tank', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M48H：圓鑄造砲塔＋大型車長塔
      toonPoly([[-18, 5], [-18, -1], [13, -1], [19, 3], [17, 5]]);
      dome(T, -3, -1, 11, 7.5); toonRR(-7, -12, 7, 4, 1.6, lo, 2);
      B(T, 7, -4.5, 21, -4.5, 3.2); toonRR(13, -6.2, 3.4, 3.4, 1, lo, 1.6);
      shine(-7, -5, 3.5, 1.5); trk(T, -17, 34, 5); natBadge(-13, 1.5, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 69-II：圓頂＋砲管上雷射測距儀
      toonRR(-18, -1, 35, 6.5, 3); dome(T, -1, -1, 9.5, 8);
      B(T, 7, -4.5, 21, -4.5, 3); toonRR(16, -6, 3, 3, 1, lo, 1.6);
      toonRR(3, -11.5, 8, 3.4, 1, lo, 1.8); toonCirc(-6, -9.5, 1.9, acc, 1.4);
      toonRR(-19, -4.5, 6, 3.5, 1.2, lo, 1.8); trk(T, -17, 34, 5); natBadge(-3, -4, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M1A1：扁平長楔形砲塔＋大尾艙
      toonPoly([[-19, 5], [-19, -1], [13, -1], [19, 2], [18, 5]]);
      toonPoly([[-18, -1], [9, -1], [13, -4], [11, -7], [-16, -7], [-18, -4]]);
      B(T, 12, -4, 22, -4, 3.2); toonRR(1, -10.5, 5, 3.5, 1, lo, 1.8); line(-8, -7, -8, -11, 1.8); line(-8, -11, -2, -11, 1.8);
      shine(-9, -4.5, 4, 1.4); trk(T, -18, 36, 7); natBadge(-14, 1.5, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 90 式：低矮方箱、前緣斜切、側裙板
      toonRR(-18, -1, 36, 6, 2);
      toonPoly([[-14, -1], [8, -1], [12, -4], [9, -8], [-12, -8], [-14, -5]]);
      toonRR(4, -11.5, 5, 3.5, 1, acc, 1.6); B(T, 11, -4.5, 21, -4.5, 3);
      trk(T, -17, 34, 6); toonRR(-18, 3.5, 36, 4.5, 1.5, lo, 2); natBadge(-8, -4.5, 2.2); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K1：尖鼻低楔形砲塔＋側風感測桿
      toonPoly([[-18, 5], [-18, -1], [12, -1], [19, 3], [18, 5]]);
      toonPoly([[-15, -1], [5, -1], [13, -4], [5, -7.5], [-13, -7.5], [-15, -4]]);
      B(T, 11, -4, 21, -4, 2.8); toonRR(14, -5.6, 3, 3.2, 1, lo, 1.5);
      line(-11, -7.5, -11, -13, 1.8); toonCirc(-11, -13.5, 1.3, lo, 1.2);
      trk(T, -17, 34, 6); natBadge(-6, -4, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 天馬虎：高圓頂＋中段抽煙器＋側裙
      toonRR(-18, -1, 35, 6.5, 3); dome(T, -2, -1, 9, 10);
      B(T, 6, -5, 21, -5, 3); toonRR(10, -6.7, 3.4, 3.4, 1.2, lo, 1.6);
      toonRR(3, -12, 4, 4, 1.2, acc, 1.6); toonCirc(-2, -12, 1.6, lo, 1.2);
      trk(T, -17, 34, 5); toonRR(-18, 4, 36, 3.5, 1, lo, 2); natBadge(-12, -4, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 蠍式：小車身、前高後低、短胖 76mm
      toonPoly([[-15, 5], [-15, 0], [2, -1], [15, 1], [16, 5]]);
      toonPoly([[-10, -1], [3, -1], [4, -5], [-1, -8], [-8, -8], [-10, -5]]);
      B(T, 3, -4.5, 13, -4.5, 3.6); toonRR(12, -6.3, 3, 3.6, 1, lo, 1.6);
      shine(-5, -5.5, 2.5, 1.2); trk(T, -14, 28, 5); natBadge(-11, 2, 2.1); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // T-55：前置小圓頂＋DShK 防空機槍＋大間隔負重輪
      toonRR(-18, -1, 35, 6.5, 3); dome(T, 2, -1, 8.5, 7.5);
      B(T, 9, -4, 21, -4, 2.8); toonRR(18, -5.5, 2.6, 3, 1, lo, 1.5);
      line(4, -8, 4, -12, 1.8); line(2, -12, 12, -12, 2.2);
      toonRR(-18, -6, 6, 5, 2.5, acc, 1.8); trk(T, -17, 34, 5, 4, 9.5); natBadge(-6, -4, 2.2); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // T-80B：低扁圓頂、長砲熱護套、後方通氣管、橡膠裙板
      toonPoly([[-19, 5], [-19, -1], [13, -1], [19, 2], [18, 5]]); dome(T, -2, -1, 11, 6);
      B(T, 8, -3.5, 22, -3.5, 3.6); line(8, -3.5, 22, -3.5, 0.8, '#94a3b8');
      toonRR(-16, -12, 3, 9, 1.3, lo, 1.6); trk(T, -17, 34, 6);
      for (const x of [-15, -8, -1, 6, 13]) toonRR(x, 3.5, 6, 4, 1, lo, 1.4); natBadge(-4, -3.5, 2.2); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // T-72M1：寬圓頂、車尾雙油桶、鰓式側板
      toonRR(-16, -1, 33, 6.5, 3); dome(T, 0, -1, 10, 7);
      B(T, 9, -4, 21, -4, 3); toonCirc(10, -8.5, 1.8, acc, 1.3);
      toonCirc(-18, -3.5, 3.2, lo, 1.8); toonCirc(-18, 2.5, 3.2, lo, 1.8);
      trk(T, -15, 32, 6); for (const x of [-12, -4, 4]) toonRR(x, 2.5, 7, 4, 1, acc, 1.4); natBadge(-2, -4, 2.2); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 59 式（Al-Zarrar）：圓頂前緣加掛反應裝甲塊
      toonRR(-18, -1, 35, 6.5, 3); dome(T, -2, -1, 9.5, 8);
      toonPoly([[2, -1], [9, -1], [7, -6], [2, -8]], acc, 1.8); toonPoly([[-7, -6.5], [0, -9], [-2, -12], [-8, -9]], acc, 1.6);
      B(T, 8, -4, 21, -4, 3); toonRR(15, -5.6, 3, 3.2, 1, lo, 1.5);
      trk(T, -17, 34, 5); natBadge(-12, 2, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 挑戰者 1：喬巴姆斜面厚砲塔＋TOGS 熱像箱＋全長裙板
      toonRR(-19, -1, 37, 6, 2);
      toonPoly([[-17, -1], [6, -1], [11, -4], [7, -10], [-15, -10], [-17, -6]]);
      toonRR(5, -13, 7, 4, 1, lo, 1.8); B(T, 10, -4.5, 21, -4.5, 3.4); toonRR(15, -6.2, 3, 3.4, 1, lo, 1.5);
      trk(T, -17, 34, 6); toonRR(-19, 3, 37, 5, 1.2, T.col, 2); natBadge(-11, -5, 2.2); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // AMX-30B2：前尖的淚滴形鑄造砲塔＋20mm 車長塔
      toonRR(-18, -1, 35, 6.5, 3); toonEll(-1, -3.5, 12, 5, 0);
      toonRR(-7, -11.5, 6, 3.5, 1.2, lo, 1.8); line(-1, -10, 7, -10, 1.8);
      B(T, 10, -3.5, 22, -3.5, 3.2); shine(-5, -5, 3, 1.2);
      trk(T, -17, 34, 5); natBadge(-12, 2, 2.2); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 豹 2A4：垂直正面高方塔＋EMES 瞄準箱＋超長砲
      toonRR(-18, -1, 36, 6.5, 2);
      toonPoly([[-17, -1], [6, -1], [6, -10.5], [-14, -10.5], [-17, -7]]);
      toonRR(1, -14, 5, 3.5, 1, acc, 1.6); B(T, 6, -6, 22, -6, 3.2);
      shine(-9, -8, 3.5, 1.3); trk(T, -17, 34, 7); natBadge(-5, -5, 2.2); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 豹 1AS：圓角斜面鑄造塔＋後方大置物籃
      toonPoly([[-18, 5], [-18, -1], [12, -1], [18, 2], [17, 5]]);
      toonPoly([[-12, -1], [7, -1], [9, -4], [4, -9], [-9, -9], [-12, -5]]);
      toonRR(-19, -7, 7, 5, 0.8, null, 1.8); line(-17, -7, -17, -2, 1.2); line(-14, -7, -14, -2, 1.2);
      B(T, 8, -4.5, 21, -4.5, 3.2); toonRR(15, -6, 2.6, 3, 1, lo, 1.4);
      trk(T, -17, 34, 7); natBadge(-3, -4.5, 2.2); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 梅卡瓦：引擎前置斜車首、後置尖鼻砲塔、尾艙垂鍊
      toonPoly([[-19, 5], [-19, -3], [0, -3], [17, 1], [18, 5]]);
      toonPoly([[-18, -3], [-2, -3], [9, -6], [-2, -10], [-15, -10], [-18, -6]]);
      B(T, 6, -6, 21, -6, 3);
      for (const x of [-16, -13, -10]) { line(x, -3, x, 2, 1.2, ink); toonCirc(x, 2.6, 1.2, ink, 0); }
      trk(T, -17, 34, 6); natBadge(-7, -6.5, 2.2); },
  });

  // ======================= 輕戰車 =======================
  reg('lighttank', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M41D：方箱塔＋外伸尾艙＋抽煙器與砲口制退器
      toonRR(-16, -1, 32, 6.5, 2.5);
      toonPoly([[-14, -2], [6, -2], [7, -8], [-12, -8], [-15, -5]]);
      B(T, 7, -5, 20, -5, 2.8); toonRR(12, -6.6, 3, 3.2, 1, lo, 1.4); toonRR(18, -6.6, 2.6, 3.2, 0.8, lo, 1.4);
      trk(T, -15, 30, 5); natBadge(-4, -5, 2.1); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 62 式：縮小版 59 式圓頂
      toonRR(-15, 0, 30, 5.5, 2.5); dome(T, -1, 0, 8, 7);
      B(T, 6, -3.5, 19, -3.5, 2.6); toonRR(14, -5, 2.6, 3, 1, lo, 1.4);
      toonCirc(-5, -7.5, 1.6, acc, 1.2); trk(T, -14, 28, 4, 5, 8); natBadge(-9, 2.5, 2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M551 謝里登：寬塔＋短粗 152mm 砲／飛彈發射管
      toonPoly([[-16, 5], [-16, -1], [10, -1], [17, 2], [16, 5]]);
      toonPoly([[-13, -1], [6, -1], [8, -5], [4, -9], [-10, -9], [-13, -5]]);
      toonRR(6, -7.5, 8, 5, 2, lo, 2.2); toonCirc(14, -5, 1.4, T.ink, 0);
      toonRR(-6, -12, 6, 3, 1, acc, 1.6); trk(T, -15, 30, 5); natBadge(-5, -5, 2.1); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 16 式機動戰鬥車：8 輪＋長 105mm 砲
      toonPoly([[-19, 6], [-19, -1], [13, -1], [19, 3], [18, 6]]);
      toonPoly([[-10, -1], [6, -1], [8, -4], [5, -8], [-8, -8], [-10, -5]]);
      B(T, 8, -4.5, 21, -4.5, 2.8); toonRR(18, -6, 3, 3, 0.8, lo, 1.4);
      wheels(T, [-14, -6, 4, 12], 3.8, 9); natBadge(-14, 2, 2.1); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K21-105：高船形車首＋大型方塔
      toonPoly([[-18, 5], [-18, -2], [8, -2], [19, 1], [17, 5]]);
      toonPoly([[-12, -2], [5, -2], [8, -6], [5, -11], [-10, -11], [-12, -6]]);
      toonRR(-8, -14, 5, 3, 1, acc, 1.5); B(T, 8, -6, 21, -6, 2.8); toonRR(18, -7.5, 2.6, 3, 0.8, lo, 1.4);
      trk(T, -17, 34, 6); natBadge(-12, 1.5, 2.1); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // PT-85：上翹船首＋圓頂塔＋車尾噴水口
      toonPoly([[-18, 5], [-18, -1], [10, -1], [19, -5], [17, 5]]);
      dome(T, -2, -1, 8, 7.5); B(T, 5, -4.5, 20, -6.5, 2.8);
      toonRR(-21, 0, 3, 4, 1, lo, 1.6); trk(T, -16, 32, 6, 5, 8); natBadge(-11, 2, 2.1); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 薩布拉（ASCOD）：高車身＋稜角塔＋遙控槍塔
      toonPoly([[-18, 5], [-18, -3], [9, -3], [18, 1], [17, 5]]);
      toonPoly([[-11, -3], [5, -3], [7, -7], [3, -10], [-9, -10], [-11, -7]]);
      toonRR(-7, -14, 6, 4, 1, acc, 1.6); line(-1, -12, 4, -12, 1.6);
      B(T, 6, -6.5, 20, -6.5, 2.8); trk(T, -17, 34, 7); natBadge(-13, 1, 2.1); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // PT-76：船形車身、截錐平塔、長 76mm 砲、水線
      toonPoly([[-18, 5], [-18, -1], [11, -1], [18, -3], [17, 5]]);
      toonPoly([[-9, -1], [6, -1], [3, -7], [-6, -7]]); B(T, 4, -4, 20, -4, 2.6); toonRR(18, -5.3, 2.6, 2.6, 0.8, lo, 1.4);
      trk(T, -16, 32, 6, 5, 7.5); line(-21, 13.5, 21, 13.5, 2, '#38bdf8'); natBadge(-13, 2, 2.1); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 2S25 章魚：低矮車身、扁寬塔、超長 125mm
      toonPoly([[-19, 5], [-19, 0], [12, 0], [18, 3], [17, 5]]);
      toonPoly([[-12, 0], [3, 0], [5, -3], [2, -7], [-10, -7], [-12, -3]]);
      B(T, 4, -3.5, 22, -3.5, 3); toonRR(-7, -10, 5, 3, 1, acc, 1.5);
      trk(T, -18, 36, 7, 5, 7.5); natBadge(-15, 2.5, 2.1); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // PT-76（印度）：豎起的前防浪板＋車尾油桶
      toonPoly([[-16, 5], [-16, -1], [11, -1], [16, -3], [15, 5]]);
      toonPoly([[-8, -1], [6, -1], [3, -7], [-5, -7]]); B(T, 4, -4, 19, -4, 2.6);
      toonPoly([[15, -3], [19, -11], [21, -10], [17, -2]], lo, 1.8);
      toonCirc(-17, -3, 3, lo, 1.6); toonCirc(-17, 3, 3, lo, 1.6);
      trk(T, -14, 30, 6, 5, 7.5); natBadge(-10, 2, 2.1); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 蠍式 CVR(T)：高斜前裝甲＋後置小圓塔＋短粗 76mm
      toonPoly([[-16, 5], [-16, -3], [-2, -3], [16, 1], [16, 5]]);
      T.toonEll(-8, -3, 7, 6, 0, T.col, 2.5, PI, PI * 2); B(T, -2, -6, 9, -6, 4);
      toonCirc(9.5, -6, 2.2, lo, 1.5); shine(4, -1, 3, 1.2, 0.2);
      trk(T, -15, 30, 5); natBadge(-12, 1.5, 2.1); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // AMX-13：後置高聳擺動式砲塔＋大尾艙、雙孔制退器
      toonPoly([[-17, 5], [-17, -1], [6, -1], [18, 3], [17, 5]]);
      toonPoly([[-19, -6], [-3, -6], [0, -9], [-3, -12], [-15, -12], [-19, -9]]);
      toonRR(-12, -6, 8, 5, 1.2, lo, 1.8); B(T, -1, -9, 19, -9, 2.6); toonRR(17, -10.8, 3.4, 3.6, 0.8, lo, 1.4);
      trk(T, -16, 32, 5); natBadge(10, 1.5, 2.1); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 鼬鼠空降戰車：迷你車身＋後置小砲座 20mm
      toonPoly([[-12, 6], [-12, 0], [3, 0], [12, 3], [11, 6]]);
      toonRR(-9, -6, 8, 6, 1.5); toonRR(-11, -8, 4, 3, 1, acc, 1.4);
      B(T, -1, -3.5, 14, -3.5, 2.2); trk(T, -11, 22, 4, 5.5, 7.5); natBadge(5, 3, 2); },
  });

  // ======================= 步兵戰鬥車 =======================
  reg('ifv', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // CM-21 衍生型：方盒車身＋30mm 小砲塔
      toonPoly([[-18, 5], [-18, -7], [8, -7], [18, 1], [18, 5]]);
      toonRR(-7, -12, 9, 5, 1.5); B(T, 1, -9.5, 18, -9.5, 2.4);
      toonRR(-16, -4, 5, 7, 1.2, lo, 1.8); line(10, -4, 16, 1, 1.6, acc);
      trk(T, -17, 34, 5); natBadge(-4, -2, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 86 式（BMP-1 系）：肋紋尖車首、錐形塔、塔頂紅箭-73
      toonPoly([[-18, 5], [-18, -3], [-4, -4], [16, -1], [19, 3], [17, 5]]);
      T.toonEll(-4, -3, 6, 5, 0, T.col, 2.4, PI, PI * 2); B(T, 1, -5, 13, -5, 2.4);
      toonRR(-6, -12, 10, 3, 1.5, acc, 1.6); toonPoly([[4, -12], [7, -10.5], [4, -9]], '#dc2626', 1.2);
      trk(T, -17, 34, 6, 5, 8); natBadge(8, 0, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M2 布萊德雷：高方車身＋偏置砲塔＋側舉雙聯 TOW 箱
      toonPoly([[-18, 5], [-18, -5], [9, -5], [18, 1], [18, 5]]);
      toonPoly([[-9, -5], [5, -5], [7, -10], [-7, -10]]); B(T, 6, -8, 19, -8, 2.4);
      toonRR(-15, -13, 9, 5, 1.2, acc, 1.8); trk(T, -17, 34, 6);
      toonRR(-18, 2.5, 36, 4, 1, lo, 1.8); natBadge(-11, -1, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 89 式：低楔車身、35mm 砲、塔側飛彈發射器
      toonPoly([[-18, 5], [-18, -2], [6, -3], [18, 1], [18, 5]]);
      toonPoly([[-9, -3], [5, -3], [6, -8], [-7, -8]]); B(T, 5, -6, 19, -6, 2.6);
      toonRR(-16, -10, 7, 3.4, 1.4, acc, 1.6); toonRR(-16, -6.4, 7, 3.4, 1.4, acc, 1.6);
      trk(T, -17, 34, 6); natBadge(-3, 0.5, 2.2); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K21：細長尖船首、低平塔、40mm、七對負重輪
      toonPoly([[-19, 5], [-19, -3], [4, -4], [20, 0], [18, 5]]);
      toonPoly([[-10, -4], [4, -4], [6, -8], [-8, -8]]); B(T, 5, -6.5, 20, -6.5, 2.6);
      toonRR(-6, -11, 5, 3, 1, acc, 1.4); trk(T, -18, 36, 7, 5, 8); natBadge(-14, 0, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // VTT-323：高箱車身＋雙聯 14.5mm 機槍塔＋塔頂飛彈
      toonPoly([[-18, 5], [-18, -6], [6, -6], [17, 0], [17, 5]]);
      T.toonEll(-3, -6, 6, 5, 0, T.col, 2.4, PI, PI * 2);
      line(2, -9, 16, -9, 2, T.ink); line(2, -7, 16, -7, 2, T.ink);
      toonRR(-6, -14, 8, 2.6, 1.2, acc, 1.4); trk(T, -17, 34, 5); natBadge(-12, -1, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113A2 加裝 25mm 遙控塔
      toonPoly([[-17, 5], [-17, -6], [7, -6], [17, 0], [17, 5]]);
      toonRR(-5, -11, 9, 5, 2, lo, 2); B(T, 3, -8.5, 18, -8.5, 2.2); toonRR(-3, -14, 4, 3, 1, acc, 1.4);
      trk(T, -16, 32, 5); natBadge(-11, -1, 2.2); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BMP-1：低車身上坐著搭乘步兵、錐塔
      toonPoly([[-18, 5], [-18, -3], [-4, -4], [16, -1], [19, 3], [17, 5]]);
      T.toonEll(2, -3.5, 6, 5, 0, T.col, 2.4, PI, PI * 2); B(T, 7, -5.5, 18, -5.5, 2.4);
      for (const x of [-15, -9]) { toonCirc(x, -7, 3, OD, 1.6); toonRR(x - 2.5, -4.5, 5, 2, 1, OD, 1.2); }
      trk(T, -17, 34, 6, 5, 8); natBadge(10, 0, 2.2); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BMP-2：較大雙人塔、細長 30mm、塔頂短號飛彈管
      toonPoly([[-18, 5], [-18, -3], [-6, -4], [16, -1], [19, 3], [17, 5]]);
      toonPoly([[-9, -4], [4, -4], [5, -9], [-7, -9]]); B(T, 3, -7, 21, -7, 2);
      toonRR(-10, -13.5, 11, 3, 1.4, acc, 1.6); trk(T, -17, 34, 6, 5, 8); natBadge(9, 0, 2.2); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 薩拉特（印製 BMP-2）：前防浪板豎起＋塔後飛彈管
      toonPoly([[-18, 5], [-18, -3], [-6, -4], [14, -1], [17, 3], [16, 5]]);
      toonPoly([[-9, -4], [3, -4], [4, -9], [-7, -9]]); B(T, 3, -7, 20, -7, 2);
      toonPoly([[14, -1], [17, -9], [19.5, -8], [17, 1]], lo, 1.8);
      toonRR(-16, -10, 8, 3, 1.4, acc, 1.6); trk(T, -17, 33, 6, 5, 8); natBadge(-13, 0, 2.2); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113 ACAV：車頂三挺機槍與防盾
      toonPoly([[-17, 5], [-17, -5], [7, -5], [17, 0], [17, 5]]);
      for (const [x, w] of [[-14, 5], [-3, 6]]) toonRR(x, -10, w, 5, 0.8, acc, 1.6);
      line(-11, -8, -11, -13, 1.6); line(0, -8, 12, -9, 2.2); line(-14, -8, -20, -10, 2);
      trk(T, -16, 32, 5); natBadge(-11, 0, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 戰士：平頂高箱、雙人大方塔、粗短拉登砲、車尾置物
      toonPoly([[-18, 5], [-18, -6], [10, -6], [18, -1], [18, 5]]);
      toonRR(-9, -12, 13, 6, 1.5); B(T, 4, -9, 17, -9, 3); toonRR(-6, -15, 4, 3, 1, acc, 1.4);
      toonRR(-21, -4, 4, 7, 1, lo, 1.6); trk(T, -17, 34, 6); natBadge(-13, -1, 2.2); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // AMX-10P：前低後高車身、中央小塔
      toonPoly([[-18, 5], [-18, -8], [-6, -8], [-2, -4], [12, -4], [18, 1], [18, 5]]);
      toonPoly([[-1, -4], [8, -4], [7, -9], [1, -9]]); B(T, 7, -7, 19, -7, 2.2);
      toonRR(-15, -5, 7, 4, 1, acc, 1.5); trk(T, -17, 34, 5); natBadge(13, 1, 2.2); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 黃鼠狼：長高車身、砲在塔外上方、塔側米蘭
      toonPoly([[-19, 5], [-19, -5], [8, -5], [18, 0], [18, 5]]);
      toonRR(-6, -9, 10, 4, 1.4); B(T, -4, -11.5, 17, -11.5, 2.2); toonRR(-6, -13, 5, 3, 1, lo, 1.4);
      toonRR(4, -14, 9, 2.6, 1, acc, 1.4); trk(T, -18, 36, 6); natBadge(-13, 0, 2.2); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // ASLAV（LAV-25）：8x8 船形車身＋25mm 塔
      toonPoly([[-19, 5], [-19, -4], [7, -4], [19, 1], [16, 5]]);
      toonPoly([[-8, -4], [4, -4], [5, -9], [-6, -9]]); B(T, 4, -7, 19, -7, 2.2);
      toonRR(-6, -12, 4, 3, 1, acc, 1.3); wheels(T, [-14, -7, 3, 10], 3.6, 8.5); natBadge(-15, 0, 2.1); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 阿奇扎里特：T-55 車體去塔、極低重裝甲、遙控機槍
      toonPoly([[-19, 5], [-19, -3], [8, -3], [19, 2], [18, 5]]);
      toonRR(-12, -5, 16, 2.5, 1, acc, 1.6); toonRR(-4, -10, 5, 4, 1, T.lo, 1.8); line(1, -8, 11, -8, 2);
      trk(T, -17, 34, 5, 4.5, 9); natBadge(-15, 0.5, 2.2); },
  });

  // ======================= 裝甲運兵車 =======================
  reg('apc', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // CM-21：斜前裝甲、開放式槍塔與防盾
      toonPoly([[-18, 5], [-18, -7], [6, -7], [17, 0], [17, 5]]);
      toonRR(-3, -12, 7, 5, 1, acc, 1.8); line(2, -10, 14, -11, 2.4);
      toonRR(-16, -4, 5, 7, 1, lo, 1.6); trk(T, -17, 34, 5); natBadge(-8, -2, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 85 式：長斜車首、後段高箱、頂部 12.7mm
      toonPoly([[-18, 5], [-18, -8], [-4, -8], [18, 0], [17, 5]]);
      T.toonCirc(-8, -9, 2.4, T.lo, 1.6); line(-8, -9, 4, -11, 2.2);
      line(-14, -5, -14, 2, 1.6, acc); trk(T, -17, 34, 5); natBadge(-2, -1, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113：經典方盒、前防浪板、.50 機槍環
      toonPoly([[-17, 5], [-17, -7], [8, -7], [16, -1], [17, 5]]);
      toonRR(14, -3, 4, 6, 1, lo, 1.6); toonRR(-6, -10, 6, 3, 1, acc, 1.6); line(-3, -10, 9, -11, 2.4);
      trk(T, -16, 32, 5); natBadge(-11, -1, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 73 式：鈍首、前方球形機槍座、頂部 12.7mm
      toonPoly([[-18, 5], [-18, -7], [11, -7], [17, -3], [17, 5]]);
      toonCirc(15, -1, 2.4, acc, 1.6); line(16, -1, 20, -1, 1.8);
      toonCirc(-2, -9, 2.4, T.lo, 1.6); line(-2, -9, 9, -11, 2.2);
      trk(T, -17, 34, 5); natBadge(-11, -1, 2.2); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K200：圓前緣、後段抬高、雙機槍
      toonPoly([[-18, 5], [-18, -8], [-4, -8], [-2, -6], [9, -6], [18, -1], [17, 5]]);
      toonRR(-14, -11, 5, 3, 1, acc, 1.4); line(-11, -11, -2, -12, 2);
      toonRR(2, -9, 4, 3, 1, acc, 1.4); line(4, -9, 12, -10, 1.8); trk(T, -17, 34, 5); natBadge(-9, -2, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // VTT-323 運兵型：無塔、頂部側艙門＋機槍
      toonPoly([[-18, 5], [-18, -6], [6, -6], [17, 0], [17, 5]]);
      toonRR(-14, -10, 8, 4, 1, lo, 1.8); toonRR(-3, -9, 4, 3, 1, acc, 1.4); line(-1, -9, 9, -10, 2);
      trk(T, -17, 34, 5); natBadge(-8, -1, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113（菲）：車頂帆布篷支架
      toonPoly([[-17, 5], [-17, -6], [8, -6], [16, -1], [17, 5]]);
      T.toonPoly([[-16, -6], [-15, -12], [2, -12], [3, -6]], KHAKI, 2);
      line(-10, -12, -10, -6, 1.4); line(-4, -12, -4, -6, 1.4); line(6, -6, 13, -9, 2);
      trk(T, -16, 32, 5); natBadge(10, -1, 2.2); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BTR-60PB：8 輪、尖船首、斜側面、小錐塔
      toonPoly([[-19, 4], [-19, -3], [-15, -6], [8, -6], [19, -1], [16, 4]]);
      toonPoly([[-5, -6], [3, -6], [1, -10], [-3, -10]]); line(1, -8, 11, -8, 2);
      wheels(T, [-14, -7, 3, 10], 3.6, 8); natBadge(-12, -2, 2.1); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BTR-80：8 輪、側門階梯、較大錐塔＋煙幕筒
      toonPoly([[-19, 4], [-19, -3], [-14, -7], [6, -7], [19, -2], [16, 4]]);
      toonPoly([[-5, -7], [4, -7], [2, -12], [-3, -12]]); line(2, -9.5, 13, -9.5, 2.2);
      for (const y of [-11, -9]) line(-7, y, -9, y - 1, 1.6);
      toonRR(-8, -3, 5, 6, 1, T.lo, 1.4); wheels(T, [-14, -6, 4, 11], 3.8, 8); natBadge(-14, -3, 2.1); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // OT-62 TOPAS：BTR-50 長平車身＋左前小塔、船首
      toonPoly([[-19, 5], [-19, -4], [6, -4], [12, -6], [19, -1], [17, 5]]);
      toonRR(5, -11, 6, 5, 2); line(10, -8.5, 18, -8.5, 1.8);
      toonRR(-16, -7, 14, 3, 1, acc, 1.5); trk(T, -18, 36, 6, 5, 8); natBadge(-6, 0, 2.2); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 塔爾哈：M113 衍生、後段加高艙＋側觀察窗
      toonPoly([[-17, 5], [-17, -10], [-3, -10], [-1, -6], [8, -6], [17, 0], [17, 5]]);
      for (const x of [-14, -9]) toonRR(x, -7, 3, 2.4, 0.6, acc, 1.2);
      line(2, -6, 2, -10, 1.6); line(2, -10, 11, -10, 2); trk(T, -16, 32, 5); natBadge(-11, 0, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // FV432：高垂直方盒、側面長排氣管、圓頂艙蓋
      toonPoly([[-18, 5], [-18, -9], [10, -9], [16, -4], [17, 5]]);
      toonRR(-3, -12, 7, 3, 1.5, acc, 1.6); line(-15, -3, 12, -3, 2.4, DK);
      toonRR(-21, -6, 3, 9, 1, lo, 1.4); trk(T, -17, 34, 5); natBadge(-9, -6, 2.2); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // VAB 4x4：卡車狀高箱、斜擋風玻璃
      toonPoly([[-18, 5], [-18, -9], [8, -9], [16, -2], [18, 5]]);
      toonPoly([[9, -7], [14, -2], [9, -2]], acc, 1.6); toonRR(-6, -12, 6, 3, 1, T.lo, 1.4);
      wheels(T, [-10, 10], 4.6, 8.5); natBadge(-2, -2, 2.2); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 狐式 6x6：楔形船首、高車身
      toonPoly([[-19, 4], [-19, -8], [2, -8], [19, -2], [15, 4]]);
      toonPoly([[3, -7], [10, -4.5], [3, -4.5]], acc, 1.5); toonRR(-12, -11, 6, 3, 1, T.lo, 1.4);
      wheels(T, [-13, -4, 9], 4, 8.5); natBadge(-12, -3, 2.2); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113AS4：延長車身（七輪）＋T-50 槍塔
      toonPoly([[-20, 5], [-20, -6], [9, -6], [18, -1], [18, 5]]);
      T.toonEll(-4, -6, 5, 4.5, 0, T.col, 2.2, PI, PI * 2); line(0, -8, 10, -8, 2);
      toonRR(-18, -4, 5, 7, 1, T.lo, 1.6); trk(T, -19, 38, 7); natBadge(5, -1, 2.2); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113「澤爾達」：外掛附加裝甲板＋鐵絲籃
      toonPoly([[-17, 5], [-17, -6], [8, -6], [16, -1], [17, 5]]);
      for (const x of [-18, -10, -2]) toonRR(x, -4, 7, 7, 1, acc, 1.6);
      toonRR(-15, -11, 12, 5, 0.6, null, 1.4); line(-11, -11, -11, -6, 1); line(-7, -11, -7, -6, 1);
      line(4, -6, 4, -10, 1.6); line(4, -10, 13, -11, 2); trk(T, -16, 32, 5); natBadge(10, -1.5, 2.2); },
  });

  // ======================= 偵察車 =======================
  reg('recon', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // V-150：4x4 船形裝甲車＋90mm 砲塔
      toonPoly([[-18, 4], [-18, -4], [-12, -7], [8, -7], [18, -1], [16, 4]]);
      toonPoly([[-7, -7], [4, -7], [3, -12], [-5, -12]]); B(T, 3, -9.5, 18, -9.5, 2.6);
      toonPoly([[9, -5], [14, -1.5], [9, -1.5]], acc, 1.4); wheels(T, [-10, 9], 5, 8); natBadge(-2, -2, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // V-150（菲）：開頂環形機槍座、無砲塔
      toonPoly([[-18, 4], [-18, -4], [-12, -7], [8, -7], [18, -1], [16, 4]]);
      toonRR(-8, -11, 10, 4, 1, acc, 1.6); line(-3, -11, -3, -14, 1.6); line(-3, -14, 9, -14, 2.2);
      wheels(T, [-10, 9], 5, 8); natBadge(-12, -2, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 63 式：短小履帶、尖斜車首、開頂機槍
      toonPoly([[-15, 5], [-15, -6], [-2, -6], [15, 1], [15, 5]]);
      toonRR(-11, -9, 6, 3, 1, acc, 1.4); line(-8, -9, 2, -11, 2);
      trk(T, -14, 28, 4, 5, 8); natBadge(-5, -1, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M3 CFV：布萊德雷＋LRAS3 偵察瞄具桅
      toonPoly([[-18, 5], [-18, -5], [9, -5], [18, 1], [18, 5]]);
      toonPoly([[-9, -5], [5, -5], [7, -10], [-7, -10]]); B(T, 6, -8, 18, -8, 2.2);
      line(-3, -10, -3, -13, 2); toonRR(-8, -16, 11, 3.6, 1.2, acc, 1.6);
      trk(T, -17, 34, 6); toonRR(-18, 2.5, 36, 4, 1, lo, 1.8); natBadge(-13, -1, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 87 式偵察警戒車：6x6 方車身＋25mm 塔＋後方潛望桅
      toonPoly([[-19, 4], [-19, -6], [8, -6], [18, -1], [17, 4]]);
      toonPoly([[-4, -6], [7, -6], [6, -10], [-3, -10]]); B(T, 6, -8, 19, -8, 2.2);
      line(-14, -6, -14, -13, 1.8); toonRR(-17, -15, 6, 3, 1, acc, 1.4);
      wheels(T, [-13, -4, 10], 3.8, 8); natBadge(-8, -2, 2.1); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K200 偵察型：高架監視雷達桅
      toonPoly([[-18, 5], [-18, -8], [-4, -8], [-2, -6], [9, -6], [18, -1], [17, 5]]);
      line(-11, -8, -11, -13, 2); T.toonEll(-11, -14, 5, 2, 0, acc, 1.6);
      toonRR(2, -9, 4, 3, 1, acc, 1.4); line(4, -9, 12, -10, 1.8); trk(T, -17, 34, 5); natBadge(-4, -2, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BRDM-2：船形車身＋中央錐形機槍塔
      toonPoly([[-18, 4], [-18, -2], [-14, -6], [6, -6], [18, 0], [16, 4]]);
      toonPoly([[-6, -6], [2, -6], [0, -11], [-4, -11]]); T.line(0, -8.5, 11, -8.5, 2);
      toonPoly([[7, -4.5], [12, -1.5], [7, -1.5]], acc, 1.4); wheels(T, [-10, 9], 4.6, 8); natBadge(-13, -1, 2.1); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BRDM-2（越）：開頂車廂、乘員探頭＋機槍
      toonPoly([[-18, 4], [-18, -2], [-14, -6], [6, -6], [18, 0], [16, 4]]);
      toonCirc(-5, -8, 3.2, OD, 1.6); line(0, -8, 12, -9, 2.2); toonRR(-1, -10, 3, 4, 1, acc, 1.2);
      wheels(T, [-10, 9], 4.6, 8); natBadge(-13, -1, 2.1); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BRDM-2 9P148：升起的五聯裝短號／競技飛彈架
      toonPoly([[-18, 4], [-18, -2], [-14, -6], [6, -6], [18, 0], [16, 4]]);
      c.save(); c.translate(-8, -7); c.rotate(-0.2);
      for (const y of [-7, -4.5, -2]) toonRR(-2, y, 15, 2.6, 1.2, acc, 1.2);
      c.restore(); wheels(T, [-10, 9], 4.6, 8); natBadge(-14, -1, 2.1); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // BRDM-2RKh 核生化偵察：車尾標旗投放器
      toonPoly([[-18, 4], [-18, -2], [-14, -6], [6, -6], [18, 0], [16, 4]]);
      toonPoly([[-4, -6], [3, -6], [1, -10], [-2, -10]]);
      for (const x of [-18, -15]) { line(x, -2, x - 2, -13, 1.4); T.toonPoly([[x - 2, -13], [x + 3, -12], [x - 1.6, -10]], '#facc15', 1); }
      wheels(T, [-10, 9], 4.6, 8); natBadge(8, -2, 2.1); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113 偵察：車頂折疊式地面監視雷達
      toonPoly([[-17, 5], [-17, -6], [8, -6], [16, -1], [17, 5]]);
      line(-8, -6, -8, -10, 2); toonRR(-14, -15, 12, 5, 1, acc, 1.8); line(-8, -15, -8, -10, 1.2);
      line(4, -6, 12, -8, 2); trk(T, -16, 32, 5); natBadge(4, -1, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 彎刀 CVR(T)：小車身、後置小塔、細長 30mm 拉登砲
      toonPoly([[-16, 5], [-16, -3], [-2, -3], [16, 1], [16, 5]]);
      T.toonEll(-8, -3, 7, 6, 0, T.col, 2.5, PI, PI * 2); B(T, -2, -6.5, 19, -6.5, 2);
      shine(4, -1, 3, 1.2, 0.2); trk(T, -15, 30, 5); natBadge(-12, 1.5, 2.1); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // AMX-10RC：6x6＋大砲塔長 105mm
      toonPoly([[-19, 4], [-19, -3], [8, -3], [18, 0], [17, 4]]);
      toonPoly([[-11, -3], [5, -3], [7, -7], [3, -11], [-9, -11], [-11, -7]]);
      B(T, 6, -7, 21, -7, 2.8); toonRR(-8, -14, 5, 3, 1, acc, 1.4);
      wheels(T, [-13, -4, 10], 4, 8.5); natBadge(-15, 0, 2.1); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 山貓 8x8：前後對稱船形車身＋中央 20mm 小塔
      toonPoly([[-19, 3], [-19, -1], [-12, -6], [12, -6], [19, -1], [19, 3]]);
      toonRR(-5, -11, 9, 5, 1.5); B(T, 3, -9, 16, -9, 2.2);
      wheels(T, [-14, -6, 6, 14], 3.6, 8); natBadge(-12, -2, 2.1); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113 MRV：薩拉丁圓塔＋短 76mm
      toonPoly([[-17, 5], [-17, -6], [8, -6], [16, -1], [17, 5]]);
      toonEll(-3, -6, 7, 6, 0, T.col, 2.4, PI, PI * 2); B(T, 3, -9, 12, -9, 3.4);
      toonRR(-6, -14, 4, 3, 1, acc, 1.4); trk(T, -16, 32, 5); natBadge(-12, -1, 2.2); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M113 偵察（以）：三挺 MAG 機槍＋車側鐵絲籃
      toonPoly([[-17, 5], [-17, -6], [8, -6], [16, -1], [17, 5]]);
      for (const [x0, x1, y] of [[-14, -20, -11], [-6, 2, -12], [4, 14, -10]]) { line(x0 < 0 && x1 < x0 ? x0 : x0, -6, x0, y + 1, 1.4); line(x0, y, x1, y - 1, 2); }
      toonRR(-12, -4, 14, 6, 0.6, null, 1.4); line(-7, -4, -7, 2, 1); line(-2, -4, -2, 2, 1);
      trk(T, -16, 32, 5); natBadge(10, -1, 2.2); },
  });

  // ======================= 卡車 =======================
  const cab = (T, x, w, top, hood) => {   // 長鼻駕駛室：x 起點、駕駛室寬、車頂高度、引擎蓋長
    const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    toonPoly([[x, 4], [x, top], [x + w - 2, top], [x + w, top + 5], [x + w + hood, top + 6], [x + w + hood, 4]]);
    toonPoly([[x + 2, top + 2], [x + w - 2.5, top + 2], [x + w - 1, top + 5], [x + 2, top + 5]], acc, 1.6);
  };
  reg('truck', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M35A2：長鼻駕駛室＋帆布篷＋三軸
      toonRR(-19, -10, 21, 14, 4, T.col); line(-12, -9, -12, 3, 1.8, acc); line(-5, -9, -5, 3, 1.8, acc);
      cab(T, 3, 8, -6, 7); wheels(T, [-14, -6, 13], 4); natBadge(-8, -4, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M35（菲）：無篷敞開貨台、露出篷架拱
      toonRR(-19, -2, 21, 6, 1.5, T.lo); for (const x of [-16, -9, -2]) { T.c.beginPath(); T.c.arc(x + 1.5, -2, 3.5, PI, 0); T.c.lineWidth = 1.8; T.c.strokeStyle = ink; T.c.stroke(); }
      line(-17, -5.5, 1, -5.5, 1.4);
      cab(T, 3, 8, -6, 7); wheels(T, [-14, -6, 13], 4); natBadge(-12, 1, 2.2); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M49 加油車（M35 衍生）：圓筒油槽
      toonEll(-8, -3, 11, 6.5, 0, T.col); T.shine(-11, -6, 4, 1.4, 0); toonRR(-9, -11, 3, 2.5, 0.8, acc, 1.2);
      cab(T, 3, 8, -6, 7); wheels(T, [-14, -6, 13], 4); natBadge(-2, -3, 2.2); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M35（以）：加裝甲方箱駕駛室＋高護欄貨台
      toonRR(-19, -7, 21, 11, 1, T.lo); for (const x of [-15, -9, -3]) toonRR(x, -6, 3, 2, 0.4, acc, 1);
      toonPoly([[3, 4], [3, -9], [11, -9], [11, -3], [19, -2], [19, 4]]); toonRR(5, -7, 5, 2.5, 0.5, acc, 1.2);
      wheels(T, [-14, -6, 13], 4); natBadge(-8, 0, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 解放 CA-30：圓弧擋泥板長鼻、木條貨台、兩軸
      toonRR(-19, -3, 22, 7, 1); for (const y of [-1, 1.5]) line(-18, y, 2, y, 1.2, T.lo);
      toonPoly([[4, 4], [4, -8], [10, -8], [11, -3], [18, -2], [19, 4]]); toonRR(5.5, -6.5, 4, 3, 0.8, acc, 1.2);
      toonEll(13, 3, 5, 3.5, 0, T.lo, 2, PI, PI * 2); wheels(T, [-11, 13], 4.4); natBadge(-8, 1, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // M939 五噸：長而高的引擎蓋、高帆布篷、三軸
      toonRR(-20, -12, 22, 16, 3.5, T.col); line(-13, -11, -13, 3, 1.8, acc); line(-6, -11, -6, 3, 1.8, acc);
      cab(T, 3, 7, -8, 9); wheels(T, [-15, -6, 13], 4.3); natBadge(-16, -8, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 73 式大型卡車：平頭駕駛室（cab-over）
      toonRR(-20, -9, 25, 13, 3, T.col); line(-12, -8, -12, 3, 1.8, acc); line(-4, -8, -4, 3, 1.8, acc);
      toonPoly([[6, 4], [6, -10], [17, -10], [19, -4], [19, 4]]); toonPoly([[8, -8], [16, -8], [17.5, -4], [8, -4]], acc, 1.6);
      wheels(T, [-14, -6, 13], 4); natBadge(12, 0, 2.2); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // K511：方形引擎蓋＋硬殼方箱貨廂
      toonRR(-20, -11, 23, 15, 1, lo); toonRR(-17, -8, 6, 4, 0.5, acc, 1.2);
      cab(T, 4, 7, -6, 8); wheels(T, [-14, -5, 13], 4); natBadge(-4, -5, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 勝利-58（GAZ-51 系）：小型圓胖駕駛室、短木貨台
      toonRR(-17, -2, 18, 6, 1, KHAKI);
      toonPoly([[2, 4], [2, -6], [6, -9], [10, -9], [11, -3], [17, -2], [18, 4]]); toonRR(4.5, -7, 4.5, 3, 1, acc, 1.2);
      toonEll(13, 3, 5, 3.5, 0, T.lo, 2, PI, PI * 2); wheels(T, [-10, 13], 4.6); natBadge(-8, 1, 2.2); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // ZIL-131：平直長鼻、三軸等距大輪
      toonRR(-20, -9, 20, 13, 3, T.col); line(-13, -8, -13, 3, 1.8, acc);
      toonPoly([[1, 4], [1, -9], [8, -9], [9, -3], [19, -3], [19, 4]]); toonRR(3, -7, 4.5, 3, 0.8, acc, 1.2);
      wheels(T, [-14, -3, 13], 4.6, 8.5); natBadge(-6, -3, 2.2); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // Ural-4320：前傾長引擎蓋、駕駛室後備胎、高篷
      toonRR(-20, -12, 18, 16, 3, T.col); toonCirc(1, -3, 3.4, T.lo, 1.8);
      toonPoly([[4, 4], [4, -9], [10, -9], [11, -3], [19, 0], [19, 4]]); toonRR(5.5, -7, 4, 3, 0.8, acc, 1.2);
      wheels(T, [-15, -6, 13], 4.3); natBadge(-11, -4, 2.2); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 塔塔 LPTA：圓弧平頭駕駛室、兩軸、高篷
      toonRR(-19, -12, 22, 16, 5, T.col);
      toonPoly([[5, 4], [5, -9], [14, -9], [19, -5], [19, 4]]); toonPoly([[7, -7], [14, -7], [17, -4], [7, -4]], acc, 1.6);
      wheels(T, [-10, 12], 4.8); natBadge(-8, -4, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 貝福德 MK：半平頭圓肩駕駛室、短鼻
      toonRR(-19, -9, 21, 13, 3, T.col);
      toonPoly([[3, 4], [3, -9], [11, -9], [14, -4], [19, -3], [19, 4]]); toonEll(9, -6.5, 3, 2.2, 0, acc, 1.4);
      wheels(T, [-10, 12], 4.8); natBadge(-8, -2, 2.2); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // GBC 180：方正半平頭、三軸
      toonRR(-20, -10, 22, 14, 2, T.col);
      toonPoly([[3, 4], [3, -11], [13, -11], [13, -4], [19, -4], [19, 4]]); toonRR(5, -9, 6, 4, 0.8, acc, 1.4);
      wheels(T, [-15, -6, 12], 4); natBadge(-9, -3, 2.2); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // MAN 8x8：高平頭駕駛室、四軸
      toonRR(-20, -9, 24, 12, 2, T.col);
      toonPoly([[5, 3], [5, -12], [17, -12], [19, -6], [19, 3]]); toonPoly([[7, -10], [16, -10], [17.5, -6], [7, -6]], acc, 1.6);
      wheels(T, [-15, -7.5, 4, 12], 3.6, 8.5); natBadge(-8, -3, 2.2); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // Mack：超長鼻大水箱罩＋防撞桿＋貨台吊臂
      toonRR(-20, -3, 19, 7, 1, T.lo); line(-17, -3, -10, -12, 2.2); line(-10, -12, -6, -8, 1.8);
      toonPoly([[-1, 4], [-1, -9], [5, -9], [6, -4], [18, -3], [18, 4]]); toonRR(0.5, -7, 4, 3, 0.8, acc, 1.2);
      toonRR(17, -4, 3, 8, 1, DK, 1.4); wheels(T, [-14, -7, 12], 4); natBadge(-12, 1, 2.2); },
  });

  // ======================= 軍用列車 =======================
  reg('train', {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 台鐵 R 型柴電：長引擎罩＋前端駕駛室
      rail(T); toonRR(-19, -4, 25, 10, 1.5, T.lo);
      toonPoly([[6, 6], [6, -10], [15, -10], [19, -3], [19, 6]]); toonRR(8, -8, 6, 4, 0.8, acc, 1.4);
      rw(T, [-15, -9, 9, 15]); natBadge(-6, 0, 2.2); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 東風 4：雙頭箱形車體、斜前窗
      rail(T); toonPoly([[-20, 6], [-20, -6], [-16, -10], [16, -10], [20, -6], [20, 6]]);
      toonRR(-12, -7, 24, 3, 1, '#facc15', 1.4); toonPoly([[15, -8.5], [18.5, -5.5], [15, -5.5]], acc, 1.3);
      rw(T, [-15, -9, 9, 15]); natBadge(0, 1, 2.2); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // EMD GP 系：短鼻＋高駕駛室＋長引擎罩、後掛平板車載戰車
      rail(T); toonRR(-21, 1, 13, 4, 1, T.lo); toonRR(-19, -5, 9, 6, 2, T.col, 2);
      toonRR(-6, -4, 17, 10, 1); toonPoly([[11, 6], [11, -11], [16, -11], [16, -1], [20, -1], [20, 6]]); toonRR(12, -9, 3, 3, 0.6, acc, 1.2);
      rw(T, [-17, -12, -2, 4, 14]); natBadge(2, 1, 2.2); },
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // DD51：中央駕駛室、兩側低引擎罩
      rail(T); toonRR(-20, -3, 40, 9, 2, T.lo);
      toonRR(-6, -12, 12, 11, 2); toonRR(-4, -10, 8, 4, 0.8, acc, 1.4);
      rw(T, [-15, -9, 9, 15]); natBadge(-13, 1.5, 2.2); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 韓鐵 7600 柴電：前端斜面箱型車頭＋客車
      rail(T); toonRR(-21, -6, 18, 12, 2, T.lo); for (const x of [-18, -12]) toonRR(x, -3, 4, 3, 0.6, acc, 1.1);
      toonPoly([[-2, 6], [-2, -9], [12, -9], [20, -1], [20, 6]]); toonPoly([[13, -7.5], [17.5, -2], [13, -2]], acc, 1.3);
      rw(T, [-17, -8, 3, 14]); natBadge(4, 0, 2.2); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 紅星電力機車：方箱車體＋菱形集電弓
      rail(T); toonRR(-19, -8, 38, 14, 2);
      line(-6, -8, 0, -13, 1.6); line(0, -13, 6, -8, 1.6); line(-5, -14, 5, -14, 2);
      for (const x of [-15, 11]) toonRR(x, -5, 5, 4, 0.8, acc, 1.3);
      rw(T, [-15, -9, 9, 15]); natBadge(0, 0, 2.2); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // PNR 窄軌小型柴油車：矮短圓頭
      rail(T); toonRR(-20, -3, 14, 9, 1.5, T.lo);
      toonPoly([[-4, 6], [-4, -7], [10, -7], [17, -3], [18, 6]]); toonRR(-1, -5, 9, 3.5, 1, acc, 1.3);
      rw(T, [-16, -10, 1, 13], 9.8, 2.4); natBadge(-13, 1, 2.2); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 蒸汽機車：圓筒鍋爐、高煙囪、排障器
      rail(T); toonRR(-20, -11, 9, 16, 1.5); toonRR(-18, -9, 5, 4, 0.6, acc, 1.2);
      toonEll(3, -2, 13, 5, 0); toonRR(10, -12, 4, 6, 1, T.lo, 1.8);
      toonPoly([[16, 3], [21, 9], [15, 9]], acc, 1.6); rw(T, [-15, -5, 3, 11], 8.5, 3.6); natBadge(-2, -2, 2.2); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 裝甲列車 BEPO：斜面裝甲車廂＋戰車砲塔
      rail(T); toonPoly([[-20, 6], [-20, -3], [-15, -7], [15, -7], [20, -3], [20, 6]]);
      toonEll(2, -7, 7, 5.5, 0, T.col, 2.4, PI, PI * 2); B(T, 8, -9.5, 20, -9.5, 2.6);
      toonRR(-14, -4, 8, 2.6, 0.6, acc, 1.2); rw(T, [-15, -9, 9, 15]); natBadge(-4, 1, 2.2); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // WDM 柴電＋車頂擠滿搭乘士兵
      rail(T); toonRR(-20, -4, 40, 10, 2);
      toonRR(10, -10, 9, 6, 1.5); toonRR(12, -8.5, 5, 3, 0.6, acc, 1.2);
      for (const x of [-17, -11, -5, 1]) toonCirc(x, -7, 2.6, OD, 1.4);
      rw(T, [-15, -9, 9, 15]); natBadge(-6, 1, 2.2); },
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 老式蒸汽機車：大圓鍋爐前端＋煙囪＋大動輪
      rail(T); toonRR(-20, -9, 10, 14, 1.5); toonRR(-17, -7, 4, 3.5, 0.6, acc, 1.2);
      toonEll(4, -1, 12, 6, 0); T.toonCirc(16, -1, 4.6, T.lo, 2); toonRR(6, -13, 5, 8, 1.2, DK, 1.8);
      rw(T, [-15, -3, 7], 8.2, 4.2); natBadge(-3, -2, 2.2); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 37 型：兩端突出車鼻
      rail(T); toonPoly([[-21, 6], [-21, -2], [-16, -3], [-15, -9], [13, -9], [14, -3], [20, -2], [20, 6]]);
      toonRR(8, -7, 5, 3, 0.6, acc, 1.2); toonRR(-14, -7, 5, 3, 0.6, acc, 1.2);
      rw(T, [-15, -9, 9, 15]); natBadge(-2, -1, 2.2); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // TGV 動力車：流線圓鼻＋集電弓
      rail(T); toonPoly([[-21, 6], [-21, -8], [2, -8], [14, -6], [20, 1], [20, 6]]);
      toonPoly([[6, -7], [13, -5.5], [15, -2], [6, -2]], acc, 1.4); T.line(-12, -8, -8, -12, 1.6); T.line(-8, -12, -4, -12, 1.8);
      rw(T, [-16, -10, 6, 12]); natBadge(-4, -1, 2.2); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 鐵路平板車載運豹式戰車＋小型調車機
      rail(T); toonRR(-21, 3, 28, 3.5, 1, T.lo);
      toonRR(-19, -2, 22, 5, 2); toonPoly([[-14, -2], [-2, -2], [-2, -7], [-12, -7]]); B(T, -2, -4.5, 7, -4.5, 2.2);
      toonRR(9, -8, 11, 14, 2); toonRR(11, -6, 7, 4, 0.8, acc, 1.3);
      rw(T, [-17, -2, 12, 17]); natBadge(14, 2, 2.1); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // GM 型「鬥牛犬鼻」流線機車
      rail(T); toonPoly([[-20, 6], [-20, -9], [4, -9], [10, -8], [14, -4], [20, 0], [20, 6]]);
      toonPoly([[5, -7.5], [9.5, -6.5], [12, -3.5], [5, -3.5]], acc, 1.4); toonRR(-17, -4, 18, 2.2, 0.6, '#facc15', 1);
      rw(T, [-15, -9, 9, 15]); natBadge(-6, 3, 2.2); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 以色列鐵路雙層客車：高車廂上下兩排窗＋平頭駕駛車
      rail(T); toonRR(-21, -12, 22, 18, 2, T.lo);
      for (const y of [-9, -2]) for (const x of [-18, -12, -6]) toonRR(x, y, 4, 3, 0.5, acc, 1);
      toonPoly([[2, 6], [2, -8], [15, -8], [19, -4], [19, 6]]); toonRR(12, -6.5, 4, 3.5, 0.6, acc, 1.2);
      rw(T, [-17, -4, 6, 15]); natBadge(8, 1, 2.2); },
  });

  // ======================= 步兵類 =======================
  const NATS = ['TW', 'CN', 'US', 'JP', 'KR', 'KP', 'PH', 'VN', 'RU', 'IN', 'PK', 'GB', 'FR', 'DE', 'AU', 'IL'];
  const each = fn => { const m = {}; for (const n of NATS) m[n] = fn; return m; };

  // 步兵：國別頭盔＋該國制式步槍斜持
  reg('inf', each(T => {
    hg(T, -5, 1, 0.82);
    rifle(T, 2, 13, -1.05, RIF[T.nat], 1.05);
    T.natBadge(-15, 11, 2.2);
  }));

  // 工兵：國別頭盔＋各國不同的工兵器材
  const TOOL = { TW: 'det', CN: 'shovel', US: 'bangalore', JP: 'pick', KR: 'det', KP: 'shovel', PH: 'machete', VN: 'shovel',
    RU: 'det', IN: 'pick', PK: 'shovel', GB: 'bangalore', FR: 'pick', DE: 'det', AU: 'machete', IL: 'bangalore' };
  const TOOL2 = { TW: 0, CN: 1, US: 0, JP: 0, KR: 1, KP: 0, PH: 0, VN: 1, RU: 0, IN: 1, PK: 0, GB: 1, FR: 1, DE: 0, AU: 1, IL: 1 };
  reg('engineer', each(T => {
    const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    hg(T, -6, 2, 0.78);
    const t = TOOL[T.nat];
    c.save(); c.translate(10, 0); c.rotate(TOOL2[T.nat] ? 0.35 : -0.35);
    if (t === 'det') { line(0, -12, 0, 10, 2.2, ink); toonEll(0, 11, 7, 2.2, 0, '#facc15', 1.8); toonRR(-2, -6, 4, 5, 1, DK, 1.4); }
    else if (t === 'shovel') { toonRR(-1.2, -13, 2.6, 18, 1, WOOD, 1.6); toonPoly([[-4.5, 5], [4.5, 5], [3.5, 12], [0, 14], [-3.5, 12]], '#9ca3af', 1.8); }
    else if (t === 'pick') { toonRR(-1.2, -10, 2.6, 22, 1, WOOD, 1.6); toonPoly([[-10, -10], [10, -10], [6, -7], [-6, -7]], '#9ca3af', 1.8); }
    else if (t === 'bangalore') { toonRR(-2, -14, 4.4, 26, 2, OD, 1.8); for (const y of [-6, 3]) line(-2, y, 2.4, y, 1.4, ink); toonPoly([[-2, -14], [2.4, -14], [0.2, -17]], '#dc2626', 1.4); }
    else { toonRR(-1.4, -4, 2.8, 16, 1, DK, 1.6); toonPoly([[-1.5, -4], [2, -4], [7, -13], [0, -12]], '#e5e7eb', 1.6); }
    c.restore();
    toonCirc(-15, 10, 3.2, '#facc15', 1.6); T.natBadge(-9, 11.5, 2);
  }));

  // 反裝甲步兵：依實際武器 — 三腳架導控飛彈／肩射火箭筒／無後座力砲
  const tripod = (T, x, y) => { T.line(x, y, x - 5, 12, 1.8); T.line(x, y, x + 5, 12, 1.8); T.line(x, y, x, 12, 1.6); };
  const AT = {
    TOW: (T, v) => { tripod(T, 4, 3); T.c.save(); T.c.translate(4, 1); T.c.rotate(-0.08);
      T.toonRR(-10, -4, 24, 5.5, 2.5, OD, 2); T.toonRR(-4, -10, 7, 6, 1, v === 2 ? T.acc : DK, 1.6);
      if (v === 1) T.line(14, -1.2, 19, -1.2, 1.6); if (v === 2) T.toonRR(-3, 1.5, 6, 3, 0.8, DK, 1.2); T.c.restore(); },
    HJ8: T => { tripod(T, 4, 3); T.toonRR(-7, -4, 25, 6, 2.5, '#e5e7eb', 2); T.toonRR(15, -4, 3, 6, 1, '#f97316', 1.4); T.toonRR(-2, 2, 6, 5, 1, DK, 1.4); },
    MAT: T => { tripod(T, 4, 3); T.toonRR(-8, -6, 23, 8, 1, OD, 2); T.toonRR(-4, -11, 6, 5, 1, DK, 1.4); },
    FAGOT: T => { tripod(T, 4, 4); T.toonRR(-8, -2, 24, 4.4, 2, OD, 2); T.toonRR(1, 2, 6, 5, 1, DK, 1.4); },
    MILAN: (T, v) => { tripod(T, 5, 5); T.toonRR(1, -1, 7, 7, 1.5, DK, 1.6); T.toonRR(-8, -6, 26, 5.5, 2.5, '#e5e7eb', 2);
      if (v === 1) T.toonRR(1, -14, 11, 8, 1.5, OD, 1.8); if (v === 2) T.line(18, -3.2, 21, -3.2, 2); if (v === 3) T.toonRR(-8, -9, 6, 3, 1, OD, 1.4); },
    DRAGON: (T, v) => { T.toonRR(-8, -5, 28, 6, 3, OD, 2); T.toonRR(-1, -12, 8, 7, 1.5, v ? '#334155' : DK, 1.6); if (v) T.toonCirc(7, -9, 2.4, '#22c55e', 1.2);
      T.line(17, 1, 15, 11, 1.6); T.line(17, 1, 20, 11, 1.6); },
    RPG: (T, v) => { T.c.save(); T.c.translate(0, -2); T.c.rotate(-0.15);
      T.toonRR(-10, -2, 22, 4, 2, v ? '#3f6212' : OD, 1.8); T.toonEll(15, 0, 4, 3.6, 0, '#4d7c0f', 1.8); T.toonPoly([[19, -2.5], [24, 0], [19, 2.5]], OD, 1.6);
      T.toonRR(-1, 2, 3, 5, 1, WOOD, 1.2); if (v) T.toonRR(-4, 2, 3, 5, 1, WOOD, 1.2); T.c.restore(); },
    M67: T => { T.toonRR(-14, -5, 34, 5.5, 2.5, OD, 2); T.toonPoly([[-14, -6], [-19, -8], [-19, 2], [-14, 0]], DK, 1.6); T.line(15, 0.5, 13, 11, 1.6); T.line(15, 0.5, 18, 11, 1.6); },
    CG: T => { T.toonRR(-12, -5, 30, 6.5, 3.2, '#3f6212', 2); T.toonPoly([[-12, -6], [-17, -8], [-17, 3], [-12, 1.5]], DK, 1.6); T.toonRR(4, -10, 5, 5, 1, DK, 1.4); T.toonRR(6, 1.5, 3, 5, 1, DK, 1.2); },
  };
  const ATSPEC = { TW: ['TOW', 1], CN: ['HJ8'], US: ['DRAGON', 0], JP: ['MAT'], KR: ['TOW', 2], KP: ['RPG', 1], PH: ['M67'], VN: ['RPG', 0],
    RU: ['FAGOT'], IN: ['MILAN', 0], PK: ['TOW', 0], GB: ['MILAN', 1], FR: ['MILAN', 2], DE: ['MILAN', 3], AU: ['CG'], IL: ['DRAGON', 1] };
  reg('atinf', each(T => {
    const [k, v] = ATSPEC[T.nat];
    const shoulder = k === 'RPG' || k === 'CG' || k === 'M67' || k === 'DRAGON';
    hg(T, shoulder ? -9 : -13, shoulder ? 5 : 5, shoulder ? 0.62 : 0.55);
    T.c.save(); T.c.translate(shoulder ? 2 : 3, shoulder ? -3 : -1); AT[k](T, v); T.c.restore();
    T.natBadge(-17, 12, 2);
  }));

  // 狙擊手：國別頭盔＋吉利偽裝＋實際狙擊槍外形（臥姿）
  const SN = {
    TW: { L: 34, stock: 'solid', bip: 1 },           // T93 栓動
    CN: { L: 32, stock: 'bp' },                      // QBU-88 犢牛式
    US: { L: 34, stock: 'solid' },                   // M24
    JP: { L: 34, stock: 'solid', bip: 1, sup: 1 },   // M24（JGSDF，消焰器）
    KR: { L: 33, stock: 'skel', bip: 1 },            // K14 模組化槍托
    KP: { L: 32, stock: 'skel', wood: 1 },           // SVD 系（骨架托）
    PH: { L: 30, stock: 'solid', wood: 1, mag: 1 },  // M14 DMR
    VN: { L: 33, stock: 'skel', wood: 1, mag: 1 },   // SVD
    RU: { L: 34, stock: 'skel', mag: 1 },            // SVD（黑色合成托）
    IN: { L: 33, stock: 'skel', wood: 1, bip: 1 },   // 德拉古諾夫（加腳架）
    PK: { L: 31, stock: 'solid', mag: 2 },           // G3SG/1
    GB: { L: 33, stock: 'thumb', green: 1, bip: 1 }, // L96 拇指孔綠托
    FR: { L: 33, stock: 'solid', bip: 1, sleeve: 1 },// FR-F2 槍管隔熱套
    DE: { L: 34, stock: 'thumb', bip: 1, sup: 1 },   // G22（AWM）
    AU: { L: 33, stock: 'thumb', green: 1, sup: 1 }, // SR-98
    IL: { L: 34, stock: 'solid', sup: 1 },           // M24（以）
  };
  reg('sniper', each(T => {
    const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    const o = SN[T.nat], x0 = -12, y = 2, L = o.L, sf = o.wood ? WOOD : (o.green ? '#3f6212' : DK);
    for (const [px, py] of [[-17, -6], [-13, -10], [-7, -11], [-2, -8]]) toonCirc(px, py, 2.6, '#4d7c0f', 1.2);
    hg(T, -9, 4, 0.6);
    if (o.stock === 'skel') { line(x0, y, x0 + 9, y, 1.6, ink); line(x0, y, x0, y + 4, 1.8, ink); line(x0, y + 4, x0 + 9, y + 2, 1.6, ink); }
    else if (o.stock === 'thumb') { toonPoly([[x0, y - 1.5], [x0 + 10, y - 1.5], [x0 + 10, y + 2], [x0 + 4, y + 2], [x0 + 3, y + 4.5], [x0, y + 4.5]], sf, 1.5); }
    else if (o.stock === 'solid') toonPoly([[x0, y - 1.5], [x0 + 9, y - 1], [x0 + 9, y + 2], [x0, y + 4]], sf, 1.5);
    toonRR(x0 + (o.stock === 'bp' ? 0 : 9), y - 2, o.stock === 'bp' ? 18 : 11, 4, 1.4, o.stock === 'bp' ? DK : sf, 1.5);
    line(x0 + 18, y - 0.5, x0 + L, y - 0.5, 1.8, ink);
    if (o.sleeve) toonRR(x0 + 18, y - 2, 9, 3, 1, OD, 1.2);
    if (o.sup) toonRR(x0 + L - 4, y - 1.8, 6, 2.8, 1, DK, 1.1);
    toonRR(x0 + 9, y - 6.5, 11, 3.2, 1.5, '#0f172a', 1.2); toonCirc(x0 + 20, y - 5, 1.6, '#38bdf8', 0.8);
    if (o.mag === 1) toonPoly([[x0 + 13, y + 2], [x0 + 16, y + 2], [x0 + 17, y + 6], [x0 + 14, y + 6.5]], DK, 1.2);
    if (o.mag === 2) toonRR(x0 + 13, y + 2, 2.6, 6, 0.6, DK, 1.2);
    if (o.bip) { line(x0 + L - 8, y, x0 + L - 10, y + 7, 1.4, ink); line(x0 + L - 8, y, x0 + L - 6, y + 7, 1.4, ink); }
    T.natBadge(-17, 11, 2.1);
  }));

  // 特種部隊：各國特戰單位的招牌頭飾＋武器
  const beret = (T, fill, badge) => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;
    toonPoly([[-13, 3], [-15, -4], [-8, -11], [6, -12], [16, -7], [14, -2], [8, 3]], fill, 2.6);
    toonEll(-1, 4, 13, 3.4, 0, DK, 2.2); toonCirc(-8, -3, 2.8, badge, 1.4);
    toonEll(0, 12, 9, 6, 0, SKIN, 2.2, PI, PI * 2); };
  const SO = {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 海龍蛙兵：潛水面鏡＋呼吸管
      toonEll(0, 2, 12, 11, 0, DK, 2.6); toonRR(-10, -4, 17, 7, 3, '#38bdf8', 2); line(9, 6, 11, -12, 2.4); line(11, -12, 13, -13, 2.4);
      rifle(T, 4, 14, -0.6, { skel: 1, top: 'scope', L: 19 }, 0.85); },
    CN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 獵鷹：戰術盔＋單筒夜視鏡＋黑面罩
      T.toonEll(0, 1, 12, 11, 0, DK, 2.6); T.toonEll(0, -2, 13, 9, 0, T.col, 2.6, PI, PI * 2);
      toonRR(-6, -2, 12, 4, 1.5, T.acc, 1.6); line(0, -9, 3, -14, 2); toonRR(1, -17, 5, 4, 1, '#22c55e', 1.4);
      rifle(T, 6, 14, -0.7, RIF.CN, 0.8); },
    US: T => { beret(T, '#166534', '#facc15'); rifle(T, 6, 14, -0.7, RIF.US, 0.85); },   // 綠扁帽
    JP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 特戰群：面罩遮臉＋護目鏡＋盔
      toonEll(0, 2, 12, 11, 0, '#4b5563', 2.6); toonEll(0, -2, 13, 9, 0, T.col, 2.6, PI, PI * 2);
      toonRR(-9, -2, 18, 5, 2.4, '#0f172a', 2); toonRR(-7, -1, 6, 3, 1.4, '#94a3b8', 1); toonRR(1, -1, 6, 3, 1.4, '#94a3b8', 1);
      rifle(T, 6, 14, -0.7, { skel: 1, top: 'g36', L: 20 }, 0.85); },
    KR: T => { beret(T, '#111827', '#facc15'); T.line(-14, 7, 14, 9, 2.4, '#dc2626'); rifle(T, 6, 14, -0.7, RIF.KR, 0.85); },   // 黑扁帽＋紅領巾
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 輕步兵：無簷船形軟帽＋鼓形彈匣 AK
      toonEll(0, 6, 9, 7, 0, SKIN, 2.2); toonPoly([[-12, 1], [-10, -8], [10, -8], [12, 1]], OD, 2.6); T.toonCirc(0, -3, 2.2, '#dc2626', 1.2);
      rifle(T, 4, 14, -0.65, { mag: 'curve', wood: 1 }, 0.9); T.toonCirc(13.5, 2, 3.2, DK, 1.4); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 特種作戰團：迷彩頭巾＋油彩臉＋開山刀
      toonEll(0, 4, 10, 9, 0, '#3f6212', 2.4); toonPoly([[-11, 0], [-9, -9], [9, -9], [11, 0]], OD, 2.6);
      line(-11, -2, -17, 4, 2.2, OD); line(-6, 5, 6, 5, 1.6, DK);
      T.c.save(); T.c.translate(14, 2); T.c.rotate(-0.5); T.toonPoly([[-1, 0], [10, -2], [12, 0], [-1, 2]], '#e5e7eb', 1.4); T.toonRR(-6, -1.4, 5, 3, 1, WOOD, 1.2); T.c.restore(); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 特工（工兵突擊）：赤頭綁葉偽裝頭帶＋炸藥包
      toonEll(-2, 2, 10, 10, 0, SKIN, 2.4); toonRR(-12, -4, 20, 3.4, 1.4, OD, 1.8);
      for (const [x, y] of [[-10, -8], [-4, -10], [3, -9]]) toonCirc(x, y, 2.6, '#4d7c0f', 1.2);
      toonRR(8, 2, 10, 8, 1.5, KHAKI, 2); line(8, 6, 18, 6, 1.4); line(13, 2, 15, -6, 1.6); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 信號旗：Altyn 鈦盔＋大面甲
      toonEll(0, -1, 13, 11, 0, OD, 2.6, PI, PI * 2); toonRR(-13, -1, 26, 9, 3, OD, 2.4);
      toonPoly([[-11, -2], [12, -2], [13, 8], [-10, 8]], '#334155', 2.2); toonRR(-7, 1, 15, 3, 1, '#475569', 1.2);
      rifle(T, 8, 15, -0.7, { mag: 'curve', plum: 1, L: 18, top: 'scope' }, 0.8); },
    IN: T => { beret(T, '#7f1d1d', '#facc15'); T.line(-6, 10, 6, 10, 2.2, DK); rifle(T, 6, 14, -0.7, { mag: 'curve', top: 'scope', skel: 1 }, 0.85); },   // 紫紅扁帽＋大鬍子
    PK: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 特勤大隊：沙色頭巾包臉（shemagh）
      toonEll(0, 1, 12, 11, 0, KHAKI, 2.6); toonRR(-9, -3, 17, 4, 2, SKIN, 1.6); T.toonCirc(-4, -1, 1, DK, 0); T.toonCirc(3, -1, 1, DK, 0);
      for (const y of [-8, 5]) T.line(-11, y, 11, y + 2, 1.4, '#a16207'); toonPoly([[-12, 6], [-16, 13], [-8, 10]], KHAKI, 1.8);
      rifle(T, 6, 14, -0.7, { mag: 'long', L: 22 }, 0.85); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // SAS：黑色作戰服＋S6 防毒面具圓眼罩
      toonEll(0, 1, 12, 11, 0, '#111827', 2.6); toonCirc(-5, -1, 3.4, '#cbd5e1', 1.8); toonCirc(4, -1, 3.4, '#cbd5e1', 1.8);
      toonCirc(-1, 7, 3.4, '#475569', 1.8); toonRR(-14, 5, 5, 6, 2, '#475569', 1.6);
      rifle(T, 8, 15, -0.7, { skel: 1, L: 15, top: 'none' }, 0.85); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 外籍兵團：白色平頂軍帽 képi blanc＋綠肩章
      toonEll(0, 10, 9, 6, 0, SKIN, 2.2, PI, PI * 2); toonPoly([[-10, 6], [-11, -12], [11, -12], [10, 6]], '#f8fafc', 2.6);
      toonRR(-10, 1, 20, 5, 1, '#1e3a8a', 2); toonEll(4, 7, 11, 2.6, 0, DK, 2);
      toonRR(-18, 8, 7, 4, 1.5, '#16a34a', 1.4); rifle(T, 8, 14, -0.8, RIF.FR, 0.8); },
    DE: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // KSK：高切盔＋耳罩＋雙眼夜視鏡
      toonEll(0, 2, 11, 10, 0, '#4b5563', 2.6); toonEll(0, -1, 12, 9, 0, T.col, 2.6, PI, PI * 2);
      toonRR(-14, -2, 5, 8, 2, DK, 1.8); toonRR(-4, -11, 10, 5, 1.5, DK, 1.6); line(-2, -6, -2, -3, 1.4); line(4, -6, 4, -3, 1.4);
      rifle(T, 7, 14, -0.7, { skel: 1, top: 'g36', L: 19 }, 0.85); },
    AU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // SASR：沙色扁帽＋大鬍子
      beret(T, '#d6c08a', '#1e3a8a'); toonPoly([[-8, 7], [8, 7], [6, 13], [0, 15], [-6, 13]], '#78350f', 1.8);
      rifle(T, 7, 14, -0.7, { skel: 1, top: 'scope', L: 20 }, 0.85); },
    IL: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 總參偵察營：反戴棒球帽＋耳機＋短 Tavor
      toonEll(0, 3, 10, 10, 0, SKIN, 2.4); toonEll(0, -1, 11, 7, 0, '#57534e', 2.4, PI, PI * 2); toonRR(-17, -3, 8, 3, 1.5, '#57534e', 1.8);
      line(-9, -2, -9, 6, 2, DK); toonRR(-12, 3, 4, 6, 1.5, DK, 1.4); line(-9, 6, -3, 10, 1.4);
      rifle(T, 8, 14, -0.75, { bp: 1, top: 'hump', L: 18 }, 0.85); },
  };
  reg('specops', Object.fromEntries(Object.entries(SO).map(([n, f]) => [n, T => {
    T.c.save(); T.c.translate(-5, 0); f(T); T.c.restore(); T.natBadge(-17, 12, 2);
  }])));

  // 陸戰隊：各國陸戰隊招牌頭飾／載具＋浪花
  const waves = T => T.toonPoly([[-20, 10], [-15, 6], [-10, 10], [-5, 6], [0, 10], [5, 6], [10, 10], [15, 6], [20, 9], [20, 14], [-20, 14]], '#7dd3fc', 2);
  const MAR = {
    TW: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 陸戰隊：搭乘 AAV7 兩棲車露頭
      waves(T); toonPoly([[-18, 9], [-18, 0], [8, 0], [18, 5], [16, 9]], T.lo, 2.4); toonRR(-15, 2, 6, 3, 0.8, T.acc, 1.2);
      hg(T, 0, -6, 0.55); rifle(T, 6, -2, -0.5, RIF.TW, 0.7); },
    CN: T => { waves(T); hg(T, -4, 0, 0.75);   // 海軍陸戰隊：海洋迷彩藍斑盔＋QBZ
      for (const [x, y] of [[-12, -7], [-3, -11], [-8, -2]]) T.toonCirc(x, y, 2, '#1d4ed8', 1); rifle(T, 6, 9, -0.9, RIF.CN, 0.85); },
    US: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // USMC：八角帽＋鷹球錨徽
      waves(T); toonEll2(T); toonPoly([[-13, -12], [-7, -14], [7, -14], [13, -12], [11, 0], [-11, 0]], '#65743a', 2.6);
      toonRR(-11, -1, 22, 4, 1, '#4d5d2b', 2); toonPoly([[-2, 2], [15, 2], [11, 5], [-2, 5]], '#3f4d1f', 2); toonCirc(0, -7, 3, '#111827', 1.4); line(0, -9, 0, -5, 1.2, '#facc15');
      rifle(T, 9, 11, -1.05, RIF.US, 0.8); },
    KR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 海兵隊：紅底黃字名牌＋加網鋼盔
      waves(T); hg(T, -4, 0, 0.75); toonRR(-11, 2, 14, 4, 1, '#dc2626', 1.6); toonRR(-8, 3, 8, 2, 0.5, '#facc15', 0); rifle(T, 6, 9, -0.9, RIF.KR, 0.85); },
    KP: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 氣墊登陸隊：氣墊艇＋大風扇＋士兵
      waves(T); toonRR(-18, 3, 34, 7, 3.5, DK, 2.4); toonPoly([[-16, 3], [-15, -3], [12, -3], [17, 3]], T.col, 2.2);
      toonCirc(-12, -7, 4.6, T.lo, 2); toonCirc(-12, -7, 1.4, T.acc, 1); hg(T, 4, -8, 0.42); },
    PH: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 陸戰隊：橡皮艇＋叢林圓帽
      waves(T); toonEll(0, 6, 18, 4, 0, '#1f2937', 2.4); toonPoly([[16, 3], [21, 1], [19, 7]], '#1f2937', 1.8);
      hg(T, -4, -4, 0.65); T.line(14, 2, 18, -8, 2, WOOD); },
    VN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 海軍步兵：黑扁帽＋水手條紋衫
      waves(T); toonRR(-10, 0, 20, 9, 3, '#f8fafc', 2.2); for (const y of [2.5, 5.5]) line(-9, y, 9, y, 1.6, '#1e3a8a');
      toonEll(0, -3, 8, 6, 0, SKIN, 2.2); T.toonPoly([[-10, -6], [-8, -12], [8, -12], [12, -7]], '#111827', 2.4); toonCirc(-5, -8.5, 1.8, '#facc15', 1);
      line(10, 3, 15, -9, 2.2, DK); },
    RU: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 海軍步兵：黑扁帽＋藍白條紋衫 telnyashka＋AK-74
      waves(T); toonRR(-11, 0, 22, 9, 3, '#f8fafc', 2.2); for (const y of [2, 4.5, 7]) line(-10, y, 10, y, 1.3, '#1d4ed8');
      toonEll(0, -3, 8, 6, 0, SKIN, 2.2); T.toonPoly([[-11, -5], [-9, -12], [7, -13], [13, -8], [8, -5]], '#111827', 2.4); toonCirc(4, -9, 1.8, '#dc2626', 1);
      rifle(T, 8, 10, -1.05, RIF.RU, 0.75); },
    IN: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 兩棲旅：頭巾＋橘色救生衣
      waves(T); hg(T, -4, -4, 0.62); toonRR(-11, 2, 15, 8, 3, '#f97316', 2); T.line(-4, 2, -4, 10, 1.4); rifle(T, 8, 9, -0.95, RIF.IN, 0.8); },
    GB: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 皇家陸戰隊：綠色突擊隊扁帽
      waves(T); toonEll(0, 1, 8, 6, 0, SKIN, 2.2);
      T.toonPoly([[-12, -1], [-13, -7], [-6, -13], [7, -13], [15, -8], [12, -3], [7, -1]], '#166534', 2.6); T.toonEll(-1, -1, 12, 2.6, 0, DK, 2); toonCirc(-7, -6, 2.4, '#facc15', 1.2);
      rifle(T, 8, 10, -1.0, RIF.GB, 0.8); },
    FR: T => { const { c, nat, col, lo, acc, ink, hi, toonPoly, toonRR, toonCirc, toonEll, line, shine, natBadge, drawNationalHelmet } = T;   // 陸戰步兵（Troupes de marine）：藍扁帽＋金錨徽
      waves(T); toonEll(0, 1, 8, 6, 0, SKIN, 2.2);
      T.toonPoly([[-12, -1], [-13, -7], [-6, -13], [7, -13], [15, -8], [12, -3], [7, -1]], '#1e3a8a', 2.6); T.toonEll(-1, -1, 12, 2.6, 0, DK, 2);
      toonCirc(-7, -6, 2.6, '#facc15', 1.2); T.line(-7, -8, -7, -4, 1.2, '#1e3a8a'); rifle(T, 8, 10, -1.0, RIF.FR, 0.8); },
  };
  function toonEll2(T) { T.toonEll(0, 4, 8, 6, 0, SKIN, 2.2); }
  reg('marine', Object.fromEntries(Object.entries(MAR).map(([n, f]) => [n, T => { f(T); T.natBadge(-17, 1, 2.1); }])));
})();
