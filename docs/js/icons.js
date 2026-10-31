'use strict';
// ===== 部隊圖示：可愛 Q 版軍事風格（Chibi/SD，老花/iPad友善高辨識度、國別標誌性外觀） =====

// 16 國專屬色盤（飽和度明暗兼顧，同戰場不撞色；自衛隊採用亮白霜色）
const NATION_PALETTE = {
  TW: '#2563eb', // 國軍：寶藍
  CN: '#dc2626', // 解放軍：正紅
  US: '#0284c7', // 美軍：蔚藍
  JP: '#f8fafc', // 自衛隊：純白霜雪
  KR: '#6366f1', // 韓軍：靛紫藍
  KP: '#991b1b', // 人民軍：深暗紅
  PH: '#059669', // 菲軍：翡翠綠
  VN: '#d97706', // 越軍：琥珀金黃
  RU: '#be123c', // 俄軍：緋紅
  IN: '#ea580c', // 印軍：日出橙
  PK: '#15803d', // 巴軍：森林綠
  GB: '#1e40af', // 英軍：皇家深藍
  FR: '#7c3aed', // 法軍：法蘭西紫
  DE: '#475569', // 德軍：鋼鐵灰
  AU: '#ca8a04', // 澳軍：袋鼠金
  IL: '#0891b2', // 以軍：死海青
  TSMC: '#06b6d4', // 台積電神山衛隊：極紫外晶圓青
  USCORP: '#3b82f6', // 美商科技聯軍：演算法電光藍
};

// 16 國國旗 Emoji（含台積電與美商國防）
const NATION_FLAGS = {
  TW: '🇹🇼', CN: '🇨🇳', US: '🇺🇸', JP: '🇯🇵',
  KR: '🇰🇷', KP: '🇰🇵', PH: '🇵🇭', VN: '🇻🇳',
  RU: '🇷🇺', IN: '🇮🇳', PK: '🇵🇰', GB: '🇬🇧',
  FR: '🇫🇷', DE: '🇩🇪', AU: '🇦🇺', IL: '🇮🇱',
  TSMC: '🔬', USCORP: '🦅',
};

const isLightNation = nid => nid === 'JP' || nid === 'AU';

// 產生兵種圖示 Data URL 快取（用於 HTML 介面與國家圖鑑）
function unitIconDataURL(d) {
  if (!d || typeof iconImage !== 'function') return '';
  const col = typeof nationColor === 'function' ? nationColor(d.nation, d.side || 0) : '';
  const k = `_durl_${d.nation}_${d.base}_${col}`;
  if (d[k]) return d[k];
  try {
    const cv = iconImage(d, false);
    return (d[k] = cv && typeof cv.toDataURL === 'function' ? cv.toDataURL() : '');
  } catch (e) {
    return '';
  }
}

// 取得國家代表性主力兵種（戰車、戰鬥機、特殊武器/直升機、步兵/陸戰隊）
function getRepresentativeUnits(nid, side = 0) {
  if (typeof NATIONS === 'undefined' || !NATIONS[nid] || !NATIONS[nid].units) return [];
  const N = NATIONS[nid];
  const candidates = ['tank', 'fighter', 'stealth', 'bomber', 'heli', 'marine', 'rocket', 'inf', 'destroyer', 'arty'];
  const res = [];
  for (const b of candidates) {
    if (N.units[b] && !res.some(u => u.base === b)) {
      const u = typeof nationUnit === 'function' ? nationUnit(nid, b, side) : null;
      if (u) res.push(u);
      if (res.length >= 4) break;
    }
  }
  return res;
}

function nationColor(nid, side) {
  let c = NATION_PALETTE[nid] || (side === 1 ? '#dc2626' : '#2563eb');
  if (typeof G !== 'undefined' && G && G.nations && side === 1 && G.nations[0] === G.nations[1]) {
    c = c === '#dc2626' ? '#9333ea' : '#dc2626';
  }
  return c;
}

// 繪製可愛 Q 版 (SD Chibi) 軍事部隊圖示
// 中心 0,0，範圍約 -21..21 x -15..15，朝右，邊框無棋子包邊
function drawIcon(c, d) {
  const base = d.base;
  const nat = d.nation || 'US';
  const col = nationColor(d.nation, d.side);
  const lightNat = isLightNation(d.nation) && col === NATION_PALETTE[d.nation];
  const hi = lightNat ? '#ffffff' : (typeof shade === 'function' ? shade(col, 0.4) : '#ffffff');
  const lo = lightNat ? '#cbd5e1' : (typeof shade === 'function' ? shade(col, -0.25) : '#1e293b');
  const acc = lightNat ? '#1e293b' : '#ffffff'; // 高對比白色負空間點綴
  const ink = '#0f172a'; // 卡通深色描邊線

  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // 底部柔和可愛圓形光影（完全無方格棋子框）
  c.shadowColor = 'rgba(0,0,0,0.4)';
  c.shadowBlur = 3;
  c.shadowOffsetY = 1.8;

  const clearShadow = () => {
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  };

  // 卡通多邊形填色＋深色粗輪廓
  const toonPoly = (pts, fill = col, lw = 2.6) => {
    c.beginPath();
    pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const toonRR = (x, y, w, h, r, fill = col, lw = 2.6) => {
    if (typeof roundRect === 'function') {
      roundRect(c, x, y, w, h, Math.min(r, w / 2, h / 2));
    } else {
      c.beginPath(); c.rect(x, y, w, h);
    }
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const toonCirc = (x, y, r, fill = col, lw = 2.5) => {
    if (typeof circle === 'function') circle(c, x, y, r);
    else { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const toonEll = (x, y, rx, ry, rot = 0, fill = col, lw = 2.6, a0 = 0, a1 = Math.PI * 2) => {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, a0, a1);
    if (a1 - a0 < Math.PI * 1.99) c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const line = (x1, y1, x2, y2, w = 2.6, stroke = ink) => {
    clearShadow();
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineWidth = w;
    c.strokeStyle = stroke;
    c.stroke();
  };

  // 卡通履帶底盤（圓胖可愛膠囊＋多組圓滾滾負重輪）
  const toonTracks = (x0, y0, w, h, n = 3) => {
    toonRR(x0, y0, w, h, h / 2, lo, 2.6);
    const step = (w - h) / Math.max(1, n - 1);
    for (let k = 0; k < n; k++) {
      toonCirc(x0 + h / 2 + k * step, y0 + h / 2, h * 0.35, acc, 1.8);
    }
  };

  // 卡通大圓輪胎
  const toonWheels = (xs, y, r = 4.6) => {
    for (const x of xs) {
      toonCirc(x, y, r, lo, 2.5);
      toonCirc(x, y, r * 0.42, acc, 1.5);
    }
  };

  // 卡通高光弧
  const shine = (x, y, rx, ry, rot = -0.3) => {
    clearShadow();
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    c.fillStyle = hi;
    c.fill();
  };

  // ===== 1. 各國專屬大頭 Q 版鋼盔/帽飾 (Infantry by National Helmet) =====
  const drawNationalHelmet = (cx, cy, sc = 1) => {
    c.save();
    c.translate(cx, cy);
    c.scale(sc, sc);

    // (A) 德系 (DE) Stahlhelm M35 經典大喇叭外翻邊緣鋼盔
    if (nat === 'DE') {
      toonPoly([
        [-17, 7], [-19, 9], [-11, 8], [-3, 9], [6, 8], [15, 8], [18, 9], [17, 7],
        [15, 3], [12, -4], [4, -13], [-5, -13], [-14, -5], [-16, 3]
      ], col, 2.8);
      shine(-5, -6, 5, 2.5, -0.3);
      // 德式邊緣特徵線與通風孔
      line(-17, 7, 17, 7, 2.2, ink);
      toonCirc(-5, -1, 1.6, acc, 1.2);
    }
    // (B) 蘇聯/俄系/朝鮮/越 (RU, KP, VN) SSh-40 鐘形大圓頂鋼盔＋紅色五角星
    else if (nat === 'RU' || nat === 'KP' || nat === 'VN') {
      toonPoly([
        [-17, 8], [0, 9.5], [17, 8], [16, 3], [13, -7], [3, -14],
        [-3, -14], [-13, -7], [-16, 3]
      ], col, 2.8);
      shine(-4, -6, 5, 2.5, -0.3);
      line(-16, 6, 16, 6, 2.2, ink);
      // 蘇聯經典正面大紅星 (在負空間白圓底上)
      toonCirc(0, -1, 3.8, acc, 1.6);
      toonCirc(0, -1, 2.2, '#ef4444', 1);
    }
    // (C) 日本自衛隊 (JP) 88式鋼盔 / 經典戰術布盔＋遮陽前簷
    else if (nat === 'JP') {
      toonPoly([
        [-17, 7], [-9, 8], [9, 8], [17, 6], [18, 8], [14, 9.5],
        [0, 10], [-14, 9.5], [-18, 8]
      ], lo, 2.6);
      toonPoly([
        [-16, 6], [16, 6], [14, -3], [5, -13], [-5, -13], [-14, -3]
      ], col, 2.8);
      shine(-4, -6, 4.5, 2.2, -0.3);
      // 日系櫻花/朝陽徽記
      toonCirc(0, -1, 3.5, '#dc2626', 1.8);
      toonCirc(0, -1, 1.8, '#ffffff', 1);
    }
    // (D) 英國 (GB) Mk6 / 傳統平沿布迪鋼盔 (Brodie flared silhouette)
    else if (nat === 'GB') {
      toonPoly([
        [-19, 8], [19, 8], [17, 5], [12, -4], [4, -12], [-4, -12], [-12, -4], [-17, 5]
      ], col, 2.8);
      line(-18, 6.5, 18, 6.5, 2.4, ink);
      shine(-4, -5.5, 5, 2.2, -0.3);
      // 英國皇家陸軍十字圓徽
      toonCirc(0, -1, 3.8, acc, 1.8);
      line(-2.5, -1, 2.5, -1, 2, '#dc2626');
      line(0, -3.5, 0, 1.5, 2, '#dc2626');
    }
    // (E) 法國 (FR) 外籍兵團平頂軍帽 (Képi Blanc) 或 SPECTRA 現代防彈盔
    else if (nat === 'FR') {
      toonPoly([
        [-15, 6], [15, 6], [16, 9], [0, 9.5], [-16, 9]
      ], lo, 2.6); // 圓弧帽簷
      toonPoly([
        [-14, 6], [14, 6], [13, -11], [-13, -11]
      ], col, 2.8); // 平頂高筒帽體
      shine(-4, -5, 4, 3, -0.1);
      toonCirc(0, -2, 3.6, acc, 1.8);
      toonCirc(0, -2, 1.8, '#2563eb', 1.2);
    }
    // (F) 台積電 (TSMC) EUV 科技未來外骨骼頭盔（晶圓透鏡）
    else if (nat === 'TSMC') {
      toonPoly([
        [-16, 7], [16, 7], [14, -3], [0, -14], [-14, -3]
      ], col, 2.8);
      toonPoly([[-9, 0], [9, 0], [6, -7], [-6, -7]], '#22d3ee', 2);
      toonCirc(0, -3.5, 3.2, '#ffffff', 1.5);
    }
    // (G) 美國/國軍/韓/其他西式 (US, TW, KR, IL, PH, etc.) PASGT/M1 圓潤圓頂鋼盔
    else {
      c.beginPath();
      c.arc(0, 3, 15.5, Math.PI * 1.04, Math.PI * -0.04);
      c.quadraticCurveTo(18, 6.5, 17, 9);
      c.quadraticCurveTo(0, 11.5, -17, 9);
      c.quadraticCurveTo(-18, 6.5, -15.4, 1.2);
      c.closePath();
      c.fillStyle = col; c.fill();
      clearShadow();
      shine(-5, -5, 5.5, 2.8, -0.4);
      c.beginPath();
      c.arc(0, 3, 15.5, Math.PI * 1.04, Math.PI * -0.04);
      c.quadraticCurveTo(18, 6.5, 17, 9);
      c.quadraticCurveTo(0, 11.5, -17, 9);
      c.quadraticCurveTo(-18, 6.5, -15.4, 1.2);
      c.closePath();
      c.strokeStyle = ink; c.lineWidth = 2.8; c.stroke();
      line(-15, 5.5, 15, 5.5, 2.2, ink);
      // 正面國別徽章
      if (nat === 'TW') {
        toonCirc(0, -1, 4.2, '#1e3a8a', 1.8);
        toonCirc(0, -1, 2.2, '#ffffff', 1.2); // 青天白日小圓星
      } else if (nat === 'CN') {
        toonCirc(0, -1, 4, '#b91c1c', 1.8);
        toonCirc(0, -1, 2, '#facc15', 1); // 金黃星
      } else {
        toonCirc(0, -1, 4, acc, 2);
      }
    }

    c.restore();
  };

  // ===== 依真實型號的造型差異（Q 版風格）；回傳 true 表示已畫好，不走一般兵種圖示 =====
  const M = d.model || d.name || '';
  const has = re => re.test(M);
  const drawModelVariant = () => {
    if (base === 'tank') {
      toonRR(-18, -1, 35, 7.5, 3.5, col, 2.6);
      let gunY = -5.5, gunX = 7, gunL = 15;
      if (has(/梅卡瓦/)) {                                   // 梅卡瓦：引擎前置、楔形砲塔後置
        toonPoly([[-18, -1], [-17, -4], [4, -5], [18, -1]], col, 2.5);
        toonPoly([[-16, -4], [-14, -11], [-2, -12], [8, -5]], col, 2.6);
        gunX = 4; gunY = -8; gunL = 17;
        for (let k = 0; k < 5; k++) toonCirc(-14 + k * 3, -3.5, 1, acc, 0.8);   // 砲塔下緣鐵鍊
      } else if (has(/M1A|艾布蘭/)) {                       // M1：扁長稜角砲塔＋後懸
        toonPoly([[-16, -2], [-16, -8], [-11, -10.5], [6, -10.5], [11, -6], [11, -2]], col, 2.6);
        gunX = 10; gunY = -6.5; gunL = 13;
      } else if (has(/挑戰者/)) {                           // 挑戰者：喬巴姆斜面砲塔
        toonPoly([[-13, -2], [-12, -10], [3, -10.5], [11, -5], [11, -2]], col, 2.6);
        gunX = 9; gunY = -6.5;
      } else if (has(/豹 ?2|90式|10式|K1|K2|勒克萊爾/)) {     // 豹2／90式／K1：直立方箱砲塔，新型加楔形
        toonRR(-12, -10.5, 18, 9.5, 2, col, 2.6);
        if (has(/2A5|2A6|10式|K2|勒克萊爾/)) toonPoly([[6, -10.5], [13, -8], [6, -3.5]], col, 2.4);
        gunX = 9; gunY = -6.5; gunL = 14;
      } else if (has(/T-72|T-80|T-90|96式|99式|阿杰亞|暴風虎|哈立德|先軍|怖懼/)) {   // 新型 T 系：低矮半球＋爆炸反應裝甲
        toonEll(-1, -1.5, 10, 7.5, 0, col, 2.6, Math.PI, Math.PI * 2);
        for (const [x, y] of [[3, -7], [-1, -8.6], [-5, -8.4]]) toonRR(x, y, 3.4, 2.4, 0.6, lo, 1.4);
        gunX = 7; gunY = -5; gunL = 17;
      } else if (has(/T-55|59式|69|天馬虎|88B|85-II|62式|PT-/)) {   // 老 T 系：半球＋探照燈＋排煙器
        toonEll(-1, -1.5, 9.5, 7.5, 0, col, 2.6, Math.PI, Math.PI * 2);
        toonCirc(4, -9, 2.4, acc, 1.6);
        gunX = 7; gunY = -5; gunL = 15;
        toonEll(16, -5, 2.2, 1.8, 0, lo, 1.4);
      } else if (has(/M48|M60|勇虎|AMX-30|豹 ?1/)) {         // 鑄造圓頂砲塔＋車長塔＋探照燈箱
        toonEll(-2, -1.5, 11, 8, 0, col, 2.6, Math.PI, Math.PI * 2);
        toonRR(-6, -12.5, 6, 3.2, 1.2, lo, 1.8);
        toonRR(7, -11, 5, 3.4, 1, acc, 1.6);
        gunX = 8; gunY = -5.5; gunL = 13;
      } else return false;
      line(gunX, gunY, gunX + gunL, gunY, 4.2, ink); line(gunX, gunY, gunX + gunL - 1, gunY, 2.2, lo);
      shine(-6, -6.5, 4, 1.8, -0.2);
      toonTracks(-17, 4.5, 34, 8.5, has(/T-|59式|69|天馬虎|96式|99式|88B|85-II/) ? 5 : 4);
      natBadge(-12, 1.5, 2.4);
      return true;
    }
    if (base === 'fighter' || base === 'multirole' || (base === 'attacker' && has(/F-15|F-16|F-2 |Su-3|飛豹|幻象|幼獅|龍捲風|F-111/))) {
      let pts = null, tails = null, canard = false;
      if (has(/F-22|F-35|殲-20|Su-57/)) { pts = [[20, 0], [10, -3], [0, -6], [-6, -15], [-11, -15], [-11, -6], [-17, -10], [-19, -6], [-17, 0]]; tails = 4.5; }
      else if (has(/F-15|鷹/)) { pts = [[20, 0], [10, -2], [4, -4.5], [-3, -15], [-8, -15], [-9, -4.5], [-13, -4.5], [-15, -11], [-19, -11], [-18, 0]]; tails = 4; }
      else if (has(/Su-|殲-11|MiG-29|側衛|飛豹/)) { pts = [[21, 0], [12, -1.6], [4, -3], [-1, -15.5], [-6, -15.5], [-6, -5], [-13, -5], [-15, -11], [-19, -11], [-17, 0]]; tails = 5.5; }
      else if (has(/F-16|FA-50|JF-17|經國|IDF|F-2 |戰隼|霹靂|風暴/)) { pts = [[20, 0], [9, -2.4], [3, -3.4], [-4, -14], [-8, -14], [-8, -3.4], [-12, -3.4], [-15, -9.5], [-18, -9.5], [-17, 0]]; }
      else if (has(/幻象|殲-10|飆風|颱風|幼獅/)) { pts = [[20, 0], [10, -2.6], [3, -3.5], [-10, -15], [-14, -15], [-14, -3], [-18, 0]]; canard = has(/殲-10|飆風|颱風|幼獅/); }
      else if (has(/MiG-21|殲-8|F-5|MiG-23/)) { pts = [[21, 0], [12, -2], [3, -2.6], [-6, -12], [-9, -12], [-8, -2.6], [-11, -2.6], [-14, -7.5], [-17, -7.5], [-16, 0]]; }
      else if (has(/F-4/)) { pts = [[20, 0], [10, -3], [4, -4.5], [-2, -12], [-4, -12], [-6, -15], [-9, -15], [-8, -4.5], [-12, -4], [-15, -11], [-18, -11], [-17, 0]]; }
      else if (has(/龍捲風|F-111|Tu-22|Tu-160|MiG-23/)) { pts = [[20, 0], [11, -2.5], [3, -4], [-1, -6], [-9, -15], [-12, -15], [-6, -4], [-12, -4], [-15, -10], [-18, -10], [-17, 0]]; }
      else return false;
      const full = [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [x, -y])];
      toonPoly(full, col, 2.6);
      if (canard) { toonPoly([[9, -2.4], [5, -7], [3, -7], [4, -2.4]], col, 2); toonPoly([[9, 2.4], [5, 7], [3, 7], [4, 2.4]], col, 2); }
      if (tails) { for (const sgn of [-1, 1]) { line(-13, sgn * tails, -18, sgn * (tails + 4), 3.2, ink); line(-13, sgn * tails, -18, sgn * (tails + 4), 1.8, acc); } }
      else { line(-9, 0, -18, 0, 3.2, ink); line(-9, 0, -17, 0, 1.6, acc); }
      if (base === 'multirole' || base === 'attacker') for (const y of [-8, 8]) toonRR(-5, y - 1.3, 7, 2.6, 1.3, acc, 1.4);
      toonEll(8, 0, 5.5, 2.4, 0, acc, 2.1);
      natBadge(-3, 9.5, 2.3);
      return true;
    }
    if (base === 'heli') {
      const coax = has(/Ka-5/);
      line(-19, -12, 19, -12, 4, ink); line(-17, -12, 17, -12, 1.8, acc);
      if (coax) { line(-17, -15, 17, -15, 4, ink); line(-15, -15, 15, -15, 1.8, acc); }
      line(2, coax ? -15 : -12, 2, -6, 3.5, ink);
      toonPoly([[-19, -2], [-4, -4], [-4, 2], [-18, 1]], col, 2.5);
      if (!coax) toonCirc(-18, -2, 4.2, acc, 2.2);
      if (has(/AH-64|阿帕契/)) {                 // 阿帕契：粗壯機身、短翼、機鼻感測器球
        toonEll(3, -0.5, 13, 7.5, 0, col, 2.6);
        toonPoly([[5, -6.5], [14, -3], [13, 1.5], [5, 0]], acc, 2.2);
        toonRR(-6, 1, 14, 3, 1.4, lo, 2); toonCirc(16, 2, 2.6, lo, 1.6);
      } else if (has(/AH-1|眼鏡蛇/)) {           // 眼鏡蛇：極窄機身、縱列座艙、滑橇
        toonPoly([[-6, -3.5], [-6, 3.5], [14, 3], [19, 1], [12, -3], [3, -5]], col, 2.6);
        toonPoly([[3, -5], [9, -7], [15, -2], [11, -2.5]], acc, 2.1);
        line(-7, 9.5, 12, 9.5, 2.8, ink); line(-3, 4, -3, 9.5, 2, ink); line(8, 4, 8, 9.5, 2, ink);
        natBadge(-11, -0.5, 2.1); return true;
      } else if (has(/Mi-2[48]|Mi-25|Ka-5/)) {   // 雌鹿／浩劫／短吻鱷：大機身、雙泡座艙、短翼
        toonEll(4, -1, 14, 8, 0, col, 2.6);
        toonCirc(10, -2, 2.8, acc, 2); toonCirc(3, -4, 2.5, acc, 2);
        toonRR(-8, 1, 16, 3, 1.4, lo, 2);
      } else if (has(/虎式|直-10|PAH|Tiger|山貓|小羚羊|500MD|MD 5|Bo 105|直-9|UH-1H/)) {   // 輕型／虎式
        toonEll(4, 0, 10, 6.5, 0, col, 2.5);
        toonEll(8, -1, 4.6, 3.8, 0.2, acc, 2);
        if (has(/小羚羊|直-9/)) { toonCirc(-18, -2, 4.2, col, 2); toonCirc(-18, -2, 1.8, ink, 0); }
      } else return false;
      line(-7, 9.5, 12, 9.5, 3, ink);
      natBadge(-11, -0.5, 2.1);
      return true;
    }
    if (base === 'destroyer') {
      toonPoly([[-19, 0], [15, 0], [21, -3], [16, 9], [-16, 9]], col, 2.6);
      if (has(/柏克|金剛|愛宕|世宗|旅洋|052C|荷巴特|45型|地平線|神盾|德里/)) {   // 神盾艦：塔型艦橋＋八角相位陣列
        toonPoly([[-10, 0], [-8, -11], [4, -11], [7, 0]], col, 2.5);
        toonPoly([[-5, -10], [0, -10], [1.5, -6], [-3.5, -6]], acc, 1.8);
        line(-1, -11, -1, -16, 2.6, ink);
        line(11, -2, 19, -4.5, 3.6, ink);
      } else if (has(/現代級|旅大|旅滬|拉吉普特/)) {   // 蘇式：雙聯砲塔、格子桅、大煙囪
        toonPoly([[-11, 0], [-9, -7], [5, -7], [7, 0]], col, 2.5);
        line(-2, -7, -4, -16, 3, ink); line(-7, -12, 0, -12, 2.4, ink);
        toonRR(-8, -11, 5, 4.5, 1.5, lo, 2);
        line(10, -2, 19, -4, 3, ink); line(10, 0, 19, -2, 3, ink);   // 雙聯砲
        line(-14, -2, -21, -4, 3, ink);
      } else if (has(/陽字號|基林|那南|佩佳|黎剎|薩爾/)) {   // 二戰式：雙煙囪、低矮艦橋、前後砲塔
        toonPoly([[-9, 0], [-9, -4], [6, -4], [8, 0]], col, 2.4);
        toonRR(-6, -9, 3, 5, 1, lo, 1.8); toonRR(-1, -9, 3, 5, 1, lo, 1.8);
        line(4, -4, 4, -13, 2.6, ink);
        toonRR(11, -3.5, 5, 3.5, 1.2, col, 2); line(14, -2, 20, -3.5, 2.6, ink);
        toonRR(-16, -3.5, 5, 3.5, 1.2, col, 2);
      } else if (has(/史普魯恩斯|紀德/)) {   // 史普魯恩斯：高大方盒上層結構
        toonRR(-11, -10, 18, 10, 1.5, col, 2.5);
        toonRR(-7, -14, 4, 4, 1, lo, 1.8); toonRR(1, -13, 4, 3, 1, lo, 1.8);
        line(12, -2, 20, -4, 3, ink);
      } else return false;
      for (const x of [-6, 2, 10]) toonCirc(x, 4.5, 2, acc, 1.6);
      natBadge(-13, 4.5, 2.2);
      return true;
    }
    if (base === 'recon') {
      const trk = has(/布萊德雷|M113|63式|K200|彎刀|M3/), w8 = has(/山貓|雲豹|CM-32|BTR/), w6 = has(/AMX-10RC|87式/);
      if (!trk && !w8 && !w6 && !has(/BRDM|V-150/)) return false;
      if (trk) {
        toonRR(-18, -8, 34, 12, 3, col, 2.6);
        toonRR(-6, -13, 12, 5, 2, col, 2.4); line(5, -10.5, 17, -11, 2.6, ink);
        if (has(/布萊德雷|M3|K200/)) toonRR(-9, -16, 8, 3.4, 1.4, acc, 1.8);   // 拖式飛彈箱
        toonTracks(-17, 3.5, 34, 8, 4);
      } else {
        toonPoly([[-18, 5], [-17, -4], [-10, -8], [10, -8], [18, -2], [18, 5]], col, 2.6);
        toonRR(-5, -13, 11, 5.5, 2, col, 2.4);
        line(5, -10.5, w6 && has(/AMX-10RC/) ? 20 : 15, -10.5, w6 && has(/AMX-10RC/) ? 3.4 : 2.4, ink);
        toonWheels(w8 ? [-13, -5, 4, 12] : w6 ? [-11, 0, 11] : [-10, 10], 7.5, w8 ? 3.6 : 4.4);
      }
      shine(-8, -4, 4, 1.6, 0);
      natBadge(-12, -1, 2.2);
      return true;
    }
    if (base === 'sam') {
      const vert = has(/S-300|S-400|紅旗-9|PAC/), rail = has(/S-75|紅旗-2|S-125|德維納|涅瓦/), hawk = has(/霍克|立方|阿卡什/), box = has(/愛國者|天弓|03式/);
      if (!vert && !rail && !hawk && !box) return false;
      const msl = (x, y, len, ang) => { c.save(); c.translate(x, y); c.rotate(ang); toonRR(0, -2.4, len, 4.8, 2.4, '#e5e7eb', 1.8); toonPoly([[len, -2.4], [len + 4, 0], [len, 2.4]], '#dc2626', 1.6); c.restore(); };
      if (vert) {
        toonRR(-19, 1, 38, 5.5, 2.5, lo, 2.4);
        toonPoly([[11, 2], [11, -6], [17, -6], [20, -1], [20, 2]], col, 2.5);
        c.save(); c.translate(-13, 1); c.rotate(-1.2);
        toonRR(0, -6, 18, 5, 2, col, 2.2); toonRR(0, -1, 18, 5, 2, col, 2.2);
        c.restore();
        toonWheels([-14, -7, 4, 13], 7.5, 3.5);
      } else if (rail) {
        toonRR(-13, 3, 26, 4, 1.5, lo, 2);
        line(-13, 7, -18, 11, 2.6, ink); line(13, 7, 18, 11, 2.6, ink);
        msl(-14, 2, 26, -0.6);
        toonRR(-5, -1, 10, 5, 1.5, col, 2.2);
      } else if (hawk) {
        toonRR(-12, 2, 24, 4, 1.5, col, 2.2);
        for (const [dx, dy] of [[-2, -6], [0, -2], [2, 2]]) msl(-11 + dx, dy - 1, 18, -0.45);
        toonWheels([-3, 6], 9, 3.4);
      } else {
        toonRR(-19, 1, 38, 5.5, 2.5, lo, 2.4);
        toonPoly([[11, 2], [11, -6], [17, -6], [20, -1], [20, 2]], col, 2.5);
        c.save(); c.translate(-13, -1); c.rotate(-0.7);
        toonRR(0, -9, 20, 9, 2, col, 2.4); line(0, -4.5, 20, -4.5, 1.8, ink);
        c.restore();
        toonWheels([-13, -6, 13], 7.5, 3.8);
      }
      natBadge(-14, 0, 2.2);
      return true;
    }
    if (base === 'rocket' && has(/M270|LRM|MLRS/)) {   // M270：履帶車＋大方形發射箱
      toonRR(-18, -2, 35, 7, 3, col, 2.6);
      toonPoly([[8, -2], [8, -10], [14, -10], [18, -4], [18, -2]], col, 2.5);
      c.save(); c.translate(-6, -3); c.rotate(-0.3);
      toonRR(-11, -10, 20, 10, 2, col, 2.5);
      for (const y of [-7.5, -3]) for (const x of [4, 7]) toonCirc(x, y, 1.2, ink, 0);
      c.restore();
      toonTracks(-17, 4, 34, 8.5, 4);
      natBadge(-13, 0.5, 2.2);
      return true;
    }
    return false;
  };
  // 國籍標誌：每種部隊都標上小型國徽，一眼辨識國別
  function natBadge(x, y, r) {
    const N = { TW: ['#1e3a8a', '#fff'], US: ['#1e3a8a', '#fff'], CN: ['#dc2626', '#facc15'], RU: ['#dc2626', '#fff'], KP: ['#dc2626', '#fff'],
      VN: ['#dc2626', '#facc15'], JP: ['#fff', '#dc2626'], KR: ['#fff', '#1e40af'], PH: ['#1e40af', '#facc15'], IN: ['#f97316', '#16a34a'],
      PK: ['#15803d', '#fff'], GB: ['#1e3a8a', '#dc2626'], FR: ['#1e3a8a', '#dc2626'], AU: ['#1e3a8a', '#dc2626'], DE: ['#111827', '#fff'],
      IL: ['#fff', '#1d4ed8'], TSMC: ['#0e7490', '#fff'], USCORP: ['#111827', '#fff'] }[nat] || [acc, col];
    clearShadow();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = N[0]; c.fill();
    c.lineWidth = 0.9; c.strokeStyle = ink; c.stroke();
    if (nat === 'DE') { line(x - r * 0.6, y, x + r * 0.6, y, r * 0.5, N[1]); line(x, y - r * 0.6, x, y + r * 0.6, r * 0.5, N[1]); return; }
    if (nat === 'KR') { c.beginPath(); c.arc(x, y, r * 0.62, Math.PI, 0); c.fillStyle = '#dc2626'; c.fill(); c.beginPath(); c.arc(x, y, r * 0.62, 0, Math.PI); c.fillStyle = N[1]; c.fill(); return; }
    if (['GB', 'FR', 'AU', 'IN'].includes(nat)) { c.beginPath(); c.arc(x, y, r * 0.62, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
    c.beginPath(); c.arc(x, y, r * (['GB', 'FR', 'AU', 'IN'].includes(nat) ? 0.34 : 0.48), 0, Math.PI * 2); c.fillStyle = N[1]; c.fill();
  }
  const variantDrawn = drawModelVariant();
  if (!variantDrawn) switch (base) {
    // ===================== 擴充兵種（v83） =====================
    case 'ifv': {   // 步兵戰車：高車身＋小砲塔＋側掛飛彈筒
      toonPoly([[-18, 5], [-17, -3], [-10, -6], [12, -6], [18, 0], [18, 5]], col, 2.6);
      toonRR(-6, -11, 12, 6, 2.5, col, 2.5);
      line(5, -8.5, 18, -9, 2.6, ink);
      toonRR(-9, -14, 8, 3.5, 1.5, acc, 2);           // 飛彈發射筒
      shine(-8, -3, 4, 1.6, 0);
      toonTracks(-17, 4, 34, 8, 4);
      break;
    }
    case 'tankdest': {   // 反戰車車：輪型車＋高舉的大飛彈箱
      toonPoly([[-18, 5], [-17, -3], [-6, -4], [8, -4], [16, -1], [17, 5]], col, 2.6);
      toonRR(8, -7.5, 7, 4, 1.5, acc, 2);
      c.save(); c.translate(-4, -6); c.rotate(-0.35);
      toonRR(-6, -6, 16, 6, 2, lo, 2.4);
      toonPoly([[10, -6], [15, -3], [10, 0]], acc, 2);
      c.restore();
      toonWheels([-11, 0, 11], 7.5, 4.2);
      break;
    }
    case 'lighttank': {   // 輕戰車：小車身＋圓砲塔＋細長砲管
      toonRR(-15, -1, 29, 6.5, 3, col, 2.5);
      toonEll(-2, -1.5, 8, 6.5, 0, col, 2.5, Math.PI, Math.PI * 2);
      line(5, -4.5, 20, -4.5, 3, ink); line(5, -4.5, 19, -4.5, 1.4, lo);
      shine(-5, -4.5, 3.5, 1.6, -0.2);
      toonTracks(-14, 4, 28, 8, 3);
      break;
    }
    case 'mortar': {   // 迫擊砲班：鋼盔小兵＋立起的迫砲管
      line(4, 8, 13, -12, 4.5, ink); line(4, 8, 13, -12, 2.4, lo);
      line(9, -2, 15, 8, 2.4, ink); line(3, 8, 17, 8, 2.6, ink);
      drawNationalHelmet(-7, 2, 0.8);
      break;
    }
    case 'sniper': {   // 狙擊組：吉利服鋼盔＋長槍管瞄準鏡
      drawNationalHelmet(-6, 2, 0.82);
      line(-2, 1, 20, -3, 2.6, ink);
      toonRR(4, -4.5, 8, 3, 1.5, lo, 1.8);            // 瞄準鏡
      for (const [x, y] of [[-15, -8], [-11, -11], [-4, -12], [2, -9]]) toonCirc(x, y, 2.2, '#4d7c0f', 1.2); // 偽裝草葉
      break;
    }
    case 'specops': {   // 特種部隊：黑色頭套＋夜視鏡
      toonEll(-3, 0, 12, 11, 0, '#1f2937', 2.6);
      toonRR(-11, -3, 16, 5, 2.4, acc, 2);             // 眼部開口
      toonCirc(-7, -5, 2.6, '#22c55e', 1.6); toonCirc(1, -5, 2.6, '#22c55e', 1.6); // 夜視鏡
      line(6, 6, 20, 2, 3, ink);
      toonCirc(11, 10, 3.2, col, 1.8);                 // 臂章
      break;
    }
    case 'tbm': {   // 戰術彈道飛彈：八輪重卡＋豎起的大飛彈
      toonRR(-19, 1, 38, 5.5, 2.5, lo, 2.4);
      toonPoly([[11, 2], [11, -6], [17, -6], [20, -1], [20, 2]], col, 2.5);
      c.save(); c.translate(-12, 0); c.rotate(-0.95);
      toonRR(0, -3.5, 22, 7, 3.5, '#e5e7eb', 2.4);
      toonPoly([[22, -3.5], [28, 0], [22, 3.5]], '#dc2626', 2);
      c.restore();
      toonWheels([-14, -7, 4, 13], 7.5, 3.6);
      break;
    }
    case 'manpads': {   // 單兵防空：肩扛細長飛彈筒朝天
      drawNationalHelmet(-5, 3, 0.85);
      c.save(); c.translate(-2, -3); c.rotate(-0.75);
      toonRR(-6, -2.5, 22, 5, 2.5, lo, 2.2);
      toonPoly([[16, -2.5], [21, 0], [16, 2.5]], '#dc2626', 1.8);
      c.restore();
      break;
    }
    case 'coastal': {   // 岸置反艦飛彈：卡車＋雙聯大發射箱＋浪花
      toonRR(-19, 1, 38, 5.5, 2.5, lo, 2.4);
      toonPoly([[11, 2], [11, -6], [17, -6], [20, -1], [20, 2]], col, 2.5);
      c.save(); c.translate(-14, -1); c.rotate(-0.4);
      toonRR(0, -9, 22, 5, 2, col, 2.2); toonRR(0, -4, 22, 5, 2, col, 2.2);
      c.restore();
      toonWheels([-13, -4, 13], 7.5, 3.8);
      line(-20, 13, 20, 13, 2, '#38bdf8');
      break;
    }
    case 'spsam': {   // 短程防空飛彈車：履帶＋旋轉雷達＋四聯裝飛彈
      toonRR(-17, -2, 34, 7, 3, col, 2.6);
      toonRR(-8, -9, 14, 7.5, 3, col, 2.5);
      for (const y of [-14, -11]) toonRR(-6, y, 14, 3, 1.5, '#e5e7eb', 1.6);
      toonEll(-12, -12, 4, 2, -0.3, acc, 2);           // 雷達
      toonTracks(-17, 4, 34, 8.5, 3);
      break;
    }
    case 'apc': {   // 裝甲運兵車：方盒子車身＋後艙門
      toonRR(-18, -8, 34, 13, 3, col, 2.6);
      toonRR(-16, -5, 6, 8, 1.5, lo, 2);               // 後艙門
      toonCirc(8, -11, 2.4, ink, 0);                    // 機槍座
      line(8, -11, 17, -12, 2.4, ink);
      shine(2, -4, 6, 2, 0);
      toonTracks(-17, 4, 34, 8, 4);
      break;
    }
    case 'hovercraft': {   // 氣墊登陸艇：黑色氣墊裙＋雙大風扇
      toonRR(-19, 2, 38, 8, 4, '#1f2937', 2.6);
      toonPoly([[-17, 3], [-16, -4], [14, -4], [19, 3]], col, 2.5);
      for (const x of [-14, -6]) { toonCirc(x, -9, 5, lo, 2.4); toonCirc(x, -9, 1.6, acc, 1.2); }
      toonRR(6, -9, 8, 5, 2, acc, 2);
      line(-20, 13, 20, 13, 2, '#38bdf8');
      break;
    }
    case 'multirole': {   // 多用途戰機：中型三角翼＋翼下掛彈
      toonPoly([[20, 0], [8, -3.5], [-4, -14], [-9, -14], [-8, -3.5], [-15, -8], [-18, -8], [-17, 0],
        [-18, 8], [-15, 8], [-8, 3.5], [-9, 14], [-4, 14], [8, 3.5]], col, 2.6);
      for (const y of [-9, 9]) toonRR(-6, y - 1.5, 8, 3, 1.5, acc, 1.6);
      toonEll(7, 0, 5.5, 2.6, 0, acc, 2.2);
      break;
    }
    case 'uav': {   // 無人機：細長機身＋長直翼＋倒V尾＋圓鼻罩
      toonRR(-16, -2.5, 32, 5, 2.5, col, 2.4);
      toonPoly([[2, -2], [-1, -17], [-4, -17], [-3, -2]], col, 2.2);
      toonPoly([[2, 2], [-1, 17], [-4, 17], [-3, 2]], col, 2.2);
      line(-15, 0, -20, -6, 2.4, ink); line(-15, 0, -20, 6, 2.4, ink);
      toonCirc(14, 0, 3.4, acc, 2);                     // 光電球
      break;
    }
    case 'mpa': {   // 反潛巡邏機：四螺旋槳直翼＋尾部磁異探測桿
      toonRR(-17, -3, 34, 6, 3, col, 2.5);
      toonPoly([[4, -3], [1, -17], [-4, -17], [-4, -3]], col, 2.3);
      toonPoly([[4, 3], [1, 17], [-4, 17], [-4, 3]], col, 2.3);
      for (const y of [-12, -7, 7, 12]) toonEll(4, y, 1.4, 3.2, 0, '#64748b', 1.2);
      line(-17, 0, -22, 0, 2.6, ink);                    // MAD 探測桿
      toonPoly([[-14, -3], [-17, -8], [-19, -8], [-17, -3]], col, 2);
      toonEll(13, 0, 3, 2, 0, acc, 1.8);
      break;
    }
    case 'scoutheli': {   // 偵察直升機：小蛋形機身＋桅頂瞄準球
      line(-17, -12, 17, -12, 3.6, ink); line(-15, -12, 15, -12, 1.6, acc);
      toonCirc(2, -15, 2.6, acc, 1.8);                  // 桅頂瞄準具
      line(2, -12, 2, -6, 3, ink);
      toonPoly([[-17, -1], [-3, -3], [-3, 2], [-16, 1]], col, 2.3);
      toonPoly([[-18, -6], [-15, -6], [-15, 1], [-18, 1]], col, 2);
      toonEll(4, 0, 9, 6.5, 0, col, 2.5);
      toonEll(8, -1, 4.5, 3.6, 0.2, acc, 2);
      line(-5, 9, 11, 9, 2.6, ink);
      break;
    }
    case 'submarine': {   // 潛艦：水面上露出指揮塔與潛望鏡
      toonEll(0, 4, 20, 5.5, 0, '#334155', 2.6);
      toonRR(-6, -6, 10, 9, 3, col, 2.5);
      line(1, -6, 1, -13, 2.4, ink); line(1, -13, 5, -13, 2.4, ink);
      toonPoly([[-19, 2], [-23, -2], [-23, 6]], '#334155', 2);
      line(-21, 9, 21, 9, 2.2, '#38bdf8');
      shine(-2, -3, 2.5, 1.4, 0);
      break;
    }
    case 'frigate': case 'corvette': case 'patrol': case 'cruiser': {   // 水面作戰艦：依大小與上層結構區分
      const big = base === 'cruiser', small = base === 'patrol' || base === 'corvette';
      const L = big ? 21 : small ? 15 : 18;
      toonPoly([[-L, 0], [L - 4, 0], [L + 2, -3], [L - 3, 9], [-L + 3, 9]], col, 2.6);
      if (big) {   // 巡洋艦：前後兩座大上層結構＋八角雷達＋雙砲
        toonPoly([[-14, 0], [-12, -9], [-3, -9], [-1, 0]], col, 2.4);
        toonPoly([[3, 0], [5, -8], [11, -8], [12, 0]], col, 2.4);
        toonPoly([[-10, -8], [-6, -8], [-5, -5], [-9, -5]], acc, 1.8);
        line(-8, -9, -8, -15, 2.6, ink);
        line(14, -2, 21, -4, 3.4, ink); line(-16, -2, -21, -4, 3.4, ink);
      } else if (base === 'frigate') {   // 巡防艦：單一上層結構＋後段直升機庫
        toonPoly([[-6, 0], [-4, -9], [5, -9], [7, 0]], col, 2.4);
        toonRR(-15, -5, 8, 5, 1.5, lo, 2);
        line(0, -9, 0, -15, 2.6, ink);
        line(10, -2, 17, -4, 3, ink);
      } else if (base === 'corvette') {   // 飛彈快艇：低矮艦身＋斜置飛彈筒
        toonPoly([[-4, 0], [-2, -6], [5, -6], [7, 0]], col, 2.2);
        for (const y of [-4, -1]) toonRR(-13, y - 1.5, 8, 2.6, 1.2, acc, 1.4);
        line(1, -6, 1, -11, 2.4, ink);
      } else {   // 巡邏艇：小艇＋前甲板機砲
        toonPoly([[-6, 0], [-4, -6], [3, -6], [4, 0]], col, 2.2);
        line(7, -2, 13, -4, 2.4, ink);
        line(-1, -6, -1, -10, 2.2, ink);
      }
      line(-L - 1, 12, L + 1, 12, 2, '#38bdf8');
      break;
    }
    case 'lhd': {   // 兩棲突擊艦：長平甲板＋右舷艦島＋船塢艉門
      toonPoly([[-21, -1], [21, -1], [19, 9], [-19, 9]], col, 2.6);
      toonRR(-21, -4, 42, 3.5, 1.5, lo, 2);
      toonRR(2, -12, 9, 8, 2, col, 2.4);
      line(6, -12, 6, -16, 2.4, ink);
      toonRR(-19, 2, 7, 5, 1, '#1f2937', 1.8);           // 艉門
      for (const x of [-14, -6]) toonCirc(x, -6, 2, acc, 1.2);  // 甲板上的直升機
      line(-22, 12, 22, 12, 2, '#38bdf8');
      break;
    }
    // ===================== 步兵：純粹大頭 Q 版國家專屬鋼盔 =====================
    case 'inf': {
      drawNationalHelmet(0, 0, 1.05);
      break;
    }

    // ===================== 工兵：國家鋼盔＋十字鎬與扳手 =====================
    case 'engineer': {
      drawNationalHelmet(-3, 2, 0.88);
      c.save();
      c.translate(7, -1);
      c.rotate(0.5);
      toonRR(-1.5, -12, 3.5, 22, 1.5, '#8b5a2b', 2);           // 鎬柄
      toonPoly([[-9, -12], [9, -12], [6, -8.5], [-6, -8.5]], '#9ca3af', 2);  // 鎬頭
      c.restore();
      toonCirc(-12, 9, 3.4, '#facc15', 1.6);                    // 工兵黃色標誌
      break;
    }

    // ===================== 反戰車步兵：國家鋼盔＋肩扛大火箭筒 =====================
    case 'atinf': {
      drawNationalHelmet(-3, 2, 0.88);
      c.save();
      c.translate(2, -4);
      c.rotate(-0.28);
      toonRR(-17, -4, 24, 7.5, 3, lo, 2.5);
      toonPoly([[7, -7], [19, -0.25], [7, 6.5]], col, 2.5);
      toonCirc(10, -0.25, 2.2, acc, 1.5);
      c.restore();
      break;
    }

    // ===================== 兩棲陸戰隊：國家鋼盔＋下方波浪與船錨 =====================
    case 'marine': {
      drawNationalHelmet(0, -2, 0.94);
      toonCirc(0, -4, 3.6, acc, 2);
      toonPoly([
        [-19, 10], [-14, 5], [-9, 9], [-3, 4.5], [3, 9], [9, 4.5], [15, 9], [19, 6],
        [18, 13], [-18, 13]
      ], acc, 2.4);
      break;
    }

    // ===================== 主力戰車：依國別呈現砲塔特徵 (Wedge / Round / Boxy) =====================
    case 'tank': {
      toonRR(-18, -1, 35, 7.5, 3.5, col, 2.6);
      // (A) 德系 (豹2A4) & 日本 (90式)：垂直方正裝甲箱型砲塔 (Boxy Turret)
      if (nat === 'DE' || nat === 'JP') {
        toonRR(-10, -9, 17, 8.5, 2.5, col, 2.6);
        shine(-6, -6, 4, 1.8, 0);
        toonRR(7, -6.5, 15, 4.5, 2, col, 2.5);
        toonRR(18, -8, 4.5, 7.5, 2, lo, 2.5);
      }
      // (B) 俄系 (T-80/T-72/T-55) & 中國 (69式)：圓形半球鑄造砲塔 (Rounded Dome Turret)
      else if (nat === 'RU' || nat === 'CN' || nat === 'VN' || nat === 'KP' || nat === 'IN' || nat === 'PK') {
        toonEll(-2, -2, 10.5, 8.5, 0, col, 2.6, Math.PI, Math.PI * 2);
        shine(-5, -6.5, 4.5, 2, -0.2);
        toonRR(6, -6.5, 16, 4, 2, col, 2.5);
        toonRR(18, -8, 4.5, 7, 2, lo, 2.5);
        toonCirc(5, -4.5, 2.2, acc, 1.5); // 紅外探照燈
      }
      // (C) 美系 (M1A1) & 台灣 (M48H) & 韓 (K1) & 以 (梅卡瓦)：幾何楔形複合裝甲斜角 (Wedge Turret)
      else {
        toonPoly([[-12, -2], [8, -2], [5, -9], [-9, -9]], col, 2.6);
        shine(-5, -6.5, 4.5, 2, -0.2);
        toonRR(5, -7.5, 16, 5, 2, col, 2.5);
        toonRR(17, -9, 4.5, 8, 2, lo, 2.5);
      }
      toonTracks(-17, 4.5, 34, 8.5, 3);
      break;
    }

    // ===================== 偵察車：Q版裝甲吉普車/輪型突擊車 =====================
    case 'recon': {
      line(-11, -5, -14, -13, 2.4, ink);
      toonCirc(-14, -13, 2.2, col, 2);
      toonPoly([[-17, 5], [-16, -5], [-6, -10], [8, -10], [18, -2], [18, 5]], col, 2.6);
      toonPoly([[-2, -7.5], [6, -7.5], [11, -2.5], [-2, -2.5]], acc, 2.2);
      line(2, -10, 12, -12, 3, ink);
      toonWheels([-10, 10], 6.5, 5.2);
      break;
    }

    // ===================== 自走砲：45度仰角超粗大口徑重砲 =====================
    case 'arty': {
      c.save();
      c.translate(-1, -4);
      c.rotate(-0.55);
      toonRR(0, -4, 22, 8, 3, col, 2.6);
      toonRR(18, -5.5, 5, 11, 2, lo, 2.5);
      c.restore();
      toonRR(-18, -10, 18, 14, 4, col, 2.6);
      toonRR(-18, -2, 33, 7, 3.5, col, 2.6);
      shine(-11, -6, 3.5, 2, 0);
      toonTracks(-17, 4, 34, 9, 3);
      break;
    }

    // ===================== 多管火箭：發射箱＋三根大圓錐火箭頭 =====================
    case 'rocket': {
      c.save();
      c.translate(-4, -3);
      c.rotate(-0.35);
      toonRR(-12, -8, 22, 10, 3, col, 2.6);
      toonPoly([[10, -8], [17, -4.5], [10, -1]], acc, 2.2);
      toonPoly([[10, -5], [17, -1.5], [10, 2]], acc, 2.2);
      line(-9, -4.5, 7, -4.5, 2.2, acc);
      line(-9, -1.5, 7, -1.5, 2.2, acc);
      c.restore();
      toonRR(-18, 2, 35, 5.5, 2.5, lo, 2.5);
      toonPoly([[7, 3], [7, -7], [15, -7], [19, -1], [19, 3]], col, 2.6);
      toonRR(10, -5, 5.5, 4.5, 1.5, acc, 2);
      toonWheels([-11, -1, 12], 7.5, 4.4);
      break;
    }

    // ===================== 防空砲：雙管高射砲＋雷達耳朵 =====================
    case 'aa': {
      line(0, -6, 17, -14, 4.5, ink);
      line(0, -6, 17, -14, 2, col);
      line(3, -2, 20, -10, 4.5, ink);
      line(3, -2, 20, -10, 2, col);
      toonEll(-10, -10, 3.5, 6, -0.3, acc, 2.4);
      toonRR(-10, -9, 16, 9, 4, col, 2.6);
      toonRR(-17, -2, 34, 7, 3.5, col, 2.6);
      toonCirc(-2, -4.5, 2.8, acc, 2);
      toonTracks(-17, 4, 34, 9, 3);
      break;
    }

    // ===================== 防空飛彈：大彈頭飛彈斜指天空 =====================
    case 'sam': {
      c.save();
      c.translate(-1, -3);
      c.rotate(-0.55);
      toonPoly([[-13, -7], [-7, -4], [-7, 4], [-13, 7]], lo, 2.4);
      toonRR(-11, -4.8, 24, 9.6, 4, col, 2.6);
      toonPoly([[11, -4.8], [21, 0], [11, 4.8]], acc, 2.5);
      shine(-2, -2, 5, 1.5, 0);
      c.restore();
      toonRR(-17, 4, 34, 7, 3.5, lo, 2.6);
      toonWheels([-11, 0, 11], 8.5, 4);
      break;
    }

    // ===================== 攻擊直升機：泡泡座艙＋大螺旋槳 (AH-64 / Mi-24 等) =====================
    case 'heli': {
      line(-19, -12, 19, -12, 4, ink);
      line(-17, -12, 17, -12, 1.8, acc);
      line(2, -12, 2, -6, 3.5, ink);
      // (A) 俄/越/朝 (RU, VN, KP) Mi-24 雌鹿大傾角座艙與雙泡座艙
      if (nat === 'RU' || nat === 'VN' || nat === 'KP') {
        toonPoly([[-19, -2], [-4, -4], [-4, 2], [-18, 1]], col, 2.5);
        toonCirc(-18, -2, 4.2, acc, 2.2);
        toonEll(4, -1, 14, 8, 0, col, 2.6);
        toonCirc(9, -2, 2.8, acc, 2);
        toonCirc(2, -3.5, 2.5, acc, 2);
      }
      // (B) 美/台/日 (AH-64 / AH-1W) 縱列窄座艙
      else {
        toonPoly([[-19, -2], [-4, -4], [-4, 2], [-18, 1]], col, 2.5);
        toonCirc(-18, -2, 4.2, acc, 2.2);
        toonEll(4, -1, 13, 7.5, 0, col, 2.6);
        toonPoly([[5, -6.5], [16, -2], [15, 2.5], [5, 1]], acc, 2.3);
      }
      toonRR(-2, 1.5, 9, 4.5, 2, lo, 2.3);
      line(-7, 9.5, 12, 9.5, 3, ink);
      line(-3, 5.5, -3, 9.5, 2.6, ink);
      line(7, 5.5, 7, 9.5, 2.6, ink);
      break;
    }

    // ===================== 運輸直升機：雙槳契努克或大機身 =====================
    case 'thelico': {
      line(-20, -11, -2, -11, 3.8, ink);
      line(2, -12, 20, -12, 3.8, ink);
      line(-11, -11, -11, -5, 3.2, ink);
      line(11, -12, 11, -5, 3.2, ink);
      toonPoly([[-17, -5], [-13, -9], [-7, -9], [-6, -5], [6, -5], [8, -9], [14, -9], [18, -2], [18, 5], [-17, 5]], col, 2.6);
      toonPoly([[11, -4], [16.5, -1], [16.5, 2], [11, 2]], acc, 2);
      toonCirc(-9, 0, 2.6, acc, 2);
      toonCirc(-1, 0, 2.6, acc, 2);
      toonCirc(6, 0, 2.6, acc, 2);
      toonCirc(-10, 7.5, 3.2, lo, 2.2);
      toonCirc(10, 7.5, 3.2, lo, 2.2);
      break;
    }

    // ===================== 戰鬥機：依國別標誌性機體 (Twin-tail / Delta / Canard) =====================
    case 'fighter': {
      // (A) 美系 (F-15C/F-14/F-22) & 日系 (F-15J) & 澳系 (F/A-18)：大雙垂尾＋雙發平尾 (Twin-Tail Twin-Engine)
      if (nat === 'US' || nat === 'JP' || nat === 'AU' || nat === 'IL') {
        toonPoly([
          [20, 0], [9, -4.5], [-2, -15], [-8, -15], [-6, -4.5],
          [-15, -10], [-19, -10], [-17, -2], [-20, 0],
          [-17, 2], [-19, 10], [-15, 10], [-6, 4.5], [-8, 15], [-2, 15], [9, 4.5]
        ], col, 2.6);
        // 經典外八雙垂直尾翼標誌
        line(-14, -7, -18, -12, 3.2, ink); line(-14, -7, -18, -12, 1.8, acc);
        line(-14, 7, -18, 12, 3.2, ink); line(-14, 7, -18, 12, 1.8, acc);
        toonEll(6, 0, 6.5, 3.2, 0, acc, 2.3);
      }
      // (B) 俄系 (Su-27/MiG-29) & 朝鮮 & 印度：掠翼翼身融合 (Flanker/Fulcrum Swept Delta-Fin)
      else if (nat === 'RU' || nat === 'KP' || nat === 'IN') {
        toonPoly([
          [21, 0], [10, -3.5], [2, -15.5], [-5, -15.5], [-4, -4.5],
          [-13, -11], [-19, -11], [-17, -2], [-20, 0],
          [-17, 2], [-19, 11], [-13, 11], [-4, 4.5], [-5, 15.5], [2, 15.5], [10, 3.5]
        ], col, 2.6);
        // 延長大邊條翼 (LERX) 曲線
        toonPoly([[12, 0], [5, -3], [-3, -4], [-3, 4], [5, 3]], lo, 2);
        toonEll(5, 0, 7, 2.8, 0, acc, 2.2);
      }
      // (C) 法國 (幻象2000) & 英國 (龍捲風/颱風) & 德國：純無尾三角翼/前置鴨翼 (Delta-Canard)
      else if (nat === 'FR' || nat === 'GB' || nat === 'DE') {
        toonPoly([
          [20, 0], [8, -3], [-11, -16], [-16, -16], [-14, -3],
          [-19, 0],
          [-14, 3], [-16, 16], [-11, 16], [8, 3]
        ], col, 2.6);
        // 前置小鴨翼 (Canards)
        toonPoly([[9, -2], [14, -7], [10, -7], [6, -2]], acc, 2);
        toonPoly([[9, 2], [14, 7], [10, 7], [6, 2]], acc, 2);
        toonEll(4, 0, 6, 2.8, 0, acc, 2.2);
      }
      // (D) 台灣 (F-5E / IDF) & 中國 (殲-8II) & 韓國 (F-16)：修長尖銳機鼻＋後掠切梢翼
      else {
        toonPoly([
          [21, 0], [8, -3.8], [-2, -14], [-8, -14], [-6, -4],
          [-14, -9], [-18, -9], [-16, -2], [-19, 0],
          [-16, 2], [-18, 9], [-14, 9], [-6, 4], [-8, 14], [-2, 14], [8, 3.8]
        ], col, 2.6);
        toonEll(5, 0, 6.5, 3, 0, acc, 2.3);
      }
      break;
    }

    // ===================== 攻擊機：平直翼＋翼下四枚大炸彈 (A-10 / Su-25 等) =====================
    case 'attacker': {
      // 翼下四顆圓頭大飛彈/炸彈
      for (const y of [-11, -6.5, 6.5, 11]) {
        toonRR(-3, y - 1.8, 12, 3.6, 1.8, acc, 2);
      }
      // 美系 A-10 經典後置雙發渦扇引擎
      if (nat === 'US') {
        toonCirc(-9, -7, 3.8, lo, 2.2);
        toonCirc(-9, 7, 3.8, lo, 2.2);
      }
      toonPoly([
        [19, 0], [9, -3.5], [4, -3.5], [3, -15], [-4, -15], [-4, -3.5],
        [-12, -3], [-14, -8.5], [-19, -8.5], [-19, 8.5], [-14, 8.5], [-12, 3],
        [-4, 3.5], [-4, 15], [3, 15], [4, 3.5], [9, 3.5]
      ], col, 2.6);
      toonEll(7, 0, 5, 2.8, 0, acc, 2.2);
      break;
    }

    // ===================== 重型轟炸機：超大後掠翼＋機腹炸彈 (轟-6 / Tu-22M 等) =====================
    case 'bomber': {
      for (const y of [-11.5, -7, 7, 11.5]) {
        toonRR(-4, y - 2.2, 11, 4.4, 2, lo, 2.2);
      }
      toonPoly([
        [21, 0], [11, -4.2], [4, -4.5], [-5, -16], [-11, -16], [-5, -4.2],
        [-13, -3.5], [-17, -9], [-21, -9], [-19, 0],
        [-21, 9], [-17, 9], [-13, 3.5], [-5, 4.2], [-11, 16], [-5, 16],
        [4, 4.5], [11, 4.2]
      ], col, 2.6);
      toonRR(9, -3, 5.5, 6, 2, acc, 2.2);
      toonCirc(-1, 0, 3.5, acc, 2.2);
      break;
    }

    // ===================== 匿蹤戰機：飛翼迴力鏢造型 (F-117A / B-2) =====================
    case 'stealth': {
      toonPoly([
        [18, 0], [-4, -15.5], [-11, -15.5], [-6, -8], [-14, -4], [-9, 0],
        [-14, 4], [-6, 8], [-11, 15.5], [-4, 15.5]
      ], col, 2.6);
      toonPoly([[9, 0], [3, -4.5], [1, -2], [4, 0], [1, 2], [3, 4.5]], acc, 2);
      break;
    }

    // ===================== 運輸機：大肚胖機身＋背上貨箱 =====================
    case 'airlift': {
      toonPoly([
        [19, 0], [13, -5.2], [4, -5.2], [3, -16], [-4, -16], [-5, -5.2],
        [-13, -4.5], [-17, -9], [-21, -9], [-19, 0],
        [-21, 9], [-17, 9], [-13, 4.5], [-5, 5.2], [-4, 16], [3, 16],
        [4, 5.2], [13, 5.2]
      ], col, 2.6);
      toonRR(-6, -3.6, 9, 7.2, 1.8, acc, 2.2);
      toonEll(12, 0, 3, 3.5, 0, acc, 2);
      break;
    }

    // ===================== 驅逐艦：依國別呈現艦艏與神盾雷達板 =====================
    case 'destroyer': {
      // (A) 美日 (神盾艦/伯克級/旗風) 特徵八角雷達艦橋
      if (nat === 'US' || nat === 'JP' || nat === 'KR') {
        toonPoly([[-11, 1], [-9, -9], [3, -9], [6, 1]], col, 2.5);
        toonPoly([[-4, -8], [0, -8], [2, -5], [-2, -5]], acc, 2); // 經典八角平板雷達
        line(1, -9, 1, -15, 3, ink);
      }
      // (B) 俄/中 (現代級/051旅大) 經典高聳格子主桅桿與巨大後傾煙囪
      else if (nat === 'RU' || nat === 'CN') {
        toonPoly([[-12, 1], [-10, -7], [4, -7], [6, 1]], col, 2.5);
        line(-2, -7, -4, -15, 3.2, ink);
        line(-6, -11, 0, -11, 2.5, ink);
        toonRR(-8, -12, 5, 5, 1.5, lo, 2); // 巨大後傾煙囪
      }
      // (C) 共通與其他驅逐艦
      else {
        toonPoly([[-11, 1], [-9, -8], [3, -8], [5, 1]], col, 2.5);
        line(-3, -8, -3, -14, 3, ink);
        line(-6.5, -11, 0.5, -11, 2.5, ink);
      }
      line(11, -2, 19, -5, 4, ink);
      toonRR(6, -4.5, 7, 5.5, 2, lo, 2.4);
      toonPoly([[-19, 0], [15, 0], [21, -3], [16, 9], [-16, 9]], col, 2.6);
      toonCirc(-6, 4.5, 2.2, acc, 1.8);
      toonCirc(2, 4.5, 2.2, acc, 1.8);
      toonCirc(10, 4.5, 2.2, acc, 1.8);
      break;
    }

    // ===================== 航空母艦：大甲板＋艦島＋滑躍/彈射跑道 =====================
    case 'carrier': {
      toonRR(-14, -13, 10, 10, 2.5, lo, 2.5);
      line(-9, -13, -9, -16, 2.8, ink);
      // (A) 俄/中 (庫茲涅佐夫/山東艦) 滑躍上翹大甲板 (Ski-jump ramp)
      if (nat === 'RU' || nat === 'CN') {
        toonPoly([[-19, 1], [16, 1], [22, -6], [16, 9.5], [-16, 9.5]], col, 2.6);
      } else {
        toonPoly([[-19, 1], [16, 1], [21, -3], [16, 9.5], [-16, 9.5]], col, 2.6);
      }
      toonRR(-21, -3.5, 41, 5.5, 2, col, 2.6);
      for (const x of [-16, -7, 2, 11]) {
        line(x, -0.8, x + 5, -0.8, 2.6, acc);
      }
      break;
    }

    // ===================== 登陸艦：開口跳板與甲板貨箱 =====================
    case 'lst': {
      toonRR(-18, -10, 9, 10, 2, lo, 2.5);
      toonRR(-7, -5.5, 8, 6, 2, acc, 2.2);
      toonRR(3, -5.5, 8, 6, 2, acc, 2.2);
      toonPoly([[-19, 0], [15, 0], [18, 9.5], [-16, 9.5]], col, 2.6);
      line(15, 1, 21, -7, 4, ink);
      line(15, 1, 21, -7, 2, acc);
      break;
    }

    // ===================== 運輸卡車：Q版帆布蓬車 =====================
    case 'truck': {
      toonRR(-18, -10, 22, 14, 4.5, col, 2.6);
      toonPoly([[4, 4], [4, -6], [14, -6], [19, -0.5], [19, 4]], col, 2.6);
      toonPoly([[7.5, -4], [13, -4], [16, -0.5], [7.5, -0.5]], acc, 2);
      line(-12, -7, -12, 1, 2.2, acc);
      line(-4, -7, -4, 1, 2.2, acc);
      toonWheels([-11, -1, 12], 6.5, 4.8);
      break;
    }

    // ===================== 軍用列車：煙囪＋排障器 =====================
    case 'train': {
      line(-20, 10, 20, 10, 3, ink);
      toonRR(-18, -10, 14, 15, 3, col, 2.6);
      toonRR(-5, -6, 21, 11, 3.5, col, 2.6);
      toonRR(8, -12, 5, 7, 2, lo, 2.4);
      toonRR(-14, -7, 6, 5, 1.5, acc, 2);
      toonPoly([[15, 2], [21, 8], [15, 8]], acc, 2.2);
      toonWheels([-12, -2, 6, 13], 7, 3.8);
      break;
    }

    // ===================== 澤火革 次世代次微米/演算法尖端兵種 =====================
    case 'euv_fortress': {
      toonRR(-19, 0, 38, 9, 4, lo, 2.8);
      toonRR(-14, -10, 28, 12, 3.5, col, 2.6);
      toonCirc(0, -4, 5, '#22d3ee', 2.2);
      line(14, -6, 22, -6, 4.5, ink); line(14, -6, 22, -6, 2.8, acc);
      line(-14, -6, -20, -6, 4, ink); line(-14, -6, -20, -6, 2.2, acc);
      toonWheels([-12, -4, 4, 12], 6.5, 3.5);
      break;
    }
    case 'wafer_inf': {
      toonPoly([[-15, 2], [-5, 7], [-1, -4], [-10, -7]], lo, 2.4);
      toonRR(-10, -13, 19, 13, 6, col, 2.6);
      toonCirc(4, -6, 3, '#22d3ee', 1.8);
      line(5, 3, 21, -1, 4.2, ink); line(5, 3, 21, -1, 2.5, acc);
      break;
    }
    case 'laser_aa': {
      toonRR(-17, 2, 34, 7, 3, lo, 2.6);
      toonRR(-10, -8, 20, 11, 3, col, 2.6);
      toonPoly([[6, -6], [18, -12], [20, -9], [8, -3]], '#22d3ee', 2.4);
      line(18, -12, 23, -14, 3.5, acc);
      toonWheels([-10, -3, 4, 11], 5.5, 3.2);
      break;
    }
    case 'nano_swarm': {
      for (const [ox, oy, sz] of [[-6, -5, 7], [8, -1, 6], [-4, 6, 6]]) {
        toonPoly([[ox - sz, oy + sz * 0.7], [ox + sz, oy], [ox - sz, oy - sz * 0.7]], col, 2.2);
        toonCirc(ox, oy, 1.8, '#22d3ee', 1.2);
      }
      break;
    }
    case 'anduril_tank': {
      toonRR(-18, 1, 36, 8, 3.5, lo, 2.6);
      toonPoly([[-12, 1], [14, 1], [10, -6], [-8, -6]], col, 2.6);
      line(10, -3, 22, -3, 3.8, ink); line(10, -3, 22, -3, 2.2, acc);
      line(10, -5, 20, -5, 3.8, ink); line(10, -5, 20, -5, 2.2, acc);
      toonWheels([-11, -4, 3, 10], 6, 3.2);
      break;
    }
    case 'palantir_arty': {
      toonRR(-18, 1, 36, 8, 3.5, lo, 2.6);
      toonRR(-12, -7, 18, 9, 3, col, 2.6);
      toonCirc(-6, -11, 4.5, '#60a5fa', 1.8);
      line(6, -4, 23, -13, 4.5, ink); line(6, -4, 23, -13, 2.8, acc);
      toonWheels([-11, -3, 4, 11], 6, 3.2);
      break;
    }
    case 'wingman_carrier': {
      toonPoly([[-20, 7], [18, 0], [-20, -7], [-12, 0]], col, 2.8);
      toonPoly([[-6, 1.5], [6, 0], [-6, -1.5]], '#60a5fa', 2);
      line(-10, -11, 4, 0, 3, lo); line(-10, 11, 4, 0, 3, lo);
      break;
    }
    case 'usv_wolfpack': {
      toonPoly([[-18, 4], [18, 4], [21, -1], [14, 8], [-15, 8]], col, 2.6);
      toonPoly([[-8, 0], [10, 0], [6, -5], [-6, -5]], lo, 2.4);
      line(0, -5, 0, -8, 2.5, acc);
      break;
    }
  }

  // 其餘車輛、飛機、艦艇也加上國籍標誌（步兵類已有國別鋼盔）
  if (!variantDrawn && !['inf', 'atinf', 'mortar', 'sniper', 'specops', 'manpads', 'engineer', 'wafer_inf', 'marine'].includes(base)) {
    const cat = d.cat;
    if (cat === 'air') natBadge(-4, 9, 2.2);
    else if (cat === 'sea') natBadge(-12, 4.5, 2.2);
    else natBadge(-12, 0, 2.3);
  }
  c.restore();
}

// ----- 快取：每種型號畫一次（4 倍解析度），之後直接貼圖 -----
const ICON_CACHE = {};
const ICON_W = 48, ICON_H = 36, ICON_S = 4;
function iconImage(d, flip) {
  const col = nationColor(d.nation, d.side);
  const k = `${d.nation}|${d.base}|${d.model || ''}|${col}|${flip ? 1 : 0}`;
  let cv = ICON_CACHE[k];
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = ICON_W * ICON_S; cv.height = ICON_H * ICON_S;
    const g = cv.getContext('2d');
    g.scale(ICON_S, ICON_S); g.translate(ICON_W / 2, ICON_H / 2);
    if (flip) g.scale(-1, 1);
    drawIcon(g, d, flip);
    ICON_CACHE[k] = cv;
  }
  return cv;
}
