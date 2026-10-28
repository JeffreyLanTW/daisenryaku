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

  switch (base) {
    // ===================== 步兵：純粹大頭 Q 版國家專屬鋼盔 =====================
    case 'inf': {
      drawNationalHelmet(0, 0, 1.05);
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

  c.restore();
}

// ----- 快取：每種型號畫一次（4 倍解析度），之後直接貼圖 -----
const ICON_CACHE = {};
const ICON_W = 48, ICON_H = 36, ICON_S = 4;
function iconImage(d, flip) {
  const col = nationColor(d.nation, d.side);
  const k = `${d.nation}|${d.base}|${col}|${flip ? 1 : 0}`;
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
