'use strict';
// ===== 部隊圖示：卡通 Q 版軍事風格（老花友善、無棋子方框、16 國專屬不撞色單色系、步兵純鋼盔） =====

// 16 國專屬色盤（確保同一戰場上美日台菲中俄韓朝等各國色彩完全區隔；日軍採用純白系）
const NATION_PALETTE = {
  TW: '#2563eb', // 國軍：寶藍
  CN: '#dc2626', // 解放軍：正紅
  US: '#0ea5e9', // 美軍：亮天藍
  JP: '#f8fafc', // 自衛隊：純白系
  KR: '#6366f1', // 韓軍：靛紫藍
  KP: '#991b1b', // 人民軍：深暗紅
  PH: '#10b981', // 菲軍：翡翠綠
  VN: '#d97706', // 越軍：琥珀橘黃
  RU: '#be123c', // 俄軍：緋紅
  IN: '#f97316', // 印軍：亮橘
  PK: '#15803d', // 巴軍：森林綠
  GB: '#1d4ed8', // 英軍：皇家深藍
  FR: '#8b5cf6', // 法軍：紫羅蘭
  DE: '#475569', // 德軍：鋼鐵灰
  AU: '#eab308', // 澳軍：金黃
  IL: '#06b6d4', // 以軍：青色
  TSMC: '#0891b2', // 台積電神山衛隊：極紫外青藍
  USCORP: '#3b82f6', // 美商科技聯軍：演算法亮藍
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
  // 若自由對戰雙方選擇同一國家，紅方自動改用正紅（若原本即紅則改深紫）以確保戰場不同色
  if (typeof G !== 'undefined' && G && G.nations && side === 1 && G.nations[0] === G.nations[1]) {
    c = c === '#dc2626' ? '#9333ea' : '#dc2626';
  }
  return c;
}

// 繪製卡通風格部隊圖示（粗黑輪廓線＋圓潤可愛比例＋高亮度反光，中心 0,0，範圍約 -21..21 x -15..15，朝右）
function drawIcon(c, d) {
  const base = d.base;
  const col = nationColor(d.nation, d.side);
  const lightNat = isLightNation(d.nation) && col === NATION_PALETTE[d.nation];
  const hi = lightNat ? '#ffffff' : shade(col, 0.35);
  const lo = lightNat ? '#cbd5e1' : shade(col, -0.25);
  const acc = lightNat ? '#334155' : '#ffffff'; // 內部點綴色（白色系國家用深灰，其他國家用純白）
  const ink = '#111827'; // 卡通粗黑邊線

  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // 底部柔和立體陰影（不畫任何棋子外框）
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 3;
  c.shadowOffsetY = 1.8;

  const clearShadow = () => {
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  };

  // 卡通填色＋粗黑描邊工具
  const toonPoly = (pts, fill = col, lw = 2.6) => {
    c.beginPath();
    pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const toonRR = (x, y, w, h, r, fill = col, lw = 2.6) => {
    roundRect(c, x, y, w, h, Math.min(r, w / 2, h / 2));
    if (fill) { c.fillStyle = fill; c.fill(); }
    clearShadow();
    if (lw > 0) { c.strokeStyle = ink; c.lineWidth = lw; c.stroke(); }
  };

  const toonCirc = (x, y, r, fill = col, lw = 2.5) => {
    circle(c, x, y, r);
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

  // 卡通 Q 版履帶底座（圓胖膠囊＋大滾輪）
  const toonTracks = (x0, y0, w, h, n = 3) => {
    toonRR(x0, y0, w, h, h / 2, lo, 2.6);
    const step = (w - h) / Math.max(1, n - 1);
    for (let k = 0; k < n; k++) {
      toonCirc(x0 + h / 2 + k * step, y0 + h / 2, h * 0.34, acc, 2);
    }
  };

  // 卡通大輪胎
  const toonWheels = (xs, y, r = 4.6) => {
    for (const x of xs) {
      toonCirc(x, y, r, lo, 2.5);
      toonCirc(x, y, r * 0.42, acc, 1.5);
    }
  };

  // 卡通高光弧線
  const shine = (x, y, rx, ry, rot = -0.3) => {
    clearShadow();
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    c.fillStyle = hi;
    c.fill();
  };

  // 卡通大鋼盔共用繪製（圓滾滾的可愛鋼盔，不畫人體）
  const drawHelmet = (cx, cy, sc = 1) => {
    c.save();
    c.translate(cx, cy);
    c.scale(sc, sc);
    // 鋼盔圓頂主體
    c.beginPath();
    c.arc(0, 3, 15.5, Math.PI * 1.04, Math.PI * -0.04);
    c.quadraticCurveTo(18, 6.5, 17, 9);
    c.quadraticCurveTo(0, 11.5, -17, 9);
    c.quadraticCurveTo(-18, 6.5, -15.4, 1.2);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    clearShadow();
    // 盔頂可愛高光斑
    shine(-5, -5, 5.5, 2.8, -0.4);
    // 盔沿折線與粗黑外輪廓
    c.beginPath();
    c.arc(0, 3, 15.5, Math.PI * 1.04, Math.PI * -0.04);
    c.quadraticCurveTo(18, 6.5, 17, 9);
    c.quadraticCurveTo(0, 11.5, -17, 9);
    c.quadraticCurveTo(-18, 6.5, -15.4, 1.2);
    c.closePath();
    c.strokeStyle = ink;
    c.lineWidth = 2.8;
    c.stroke();
    // 鋼盔束帶細節
    c.beginPath();
    c.quadraticCurveTo(0, 6.5, 15, 4.5);
    c.moveTo(-15, 4.5);
    c.quadraticCurveTo(0, 6.5, 15, 4.5);
    c.strokeStyle = ink;
    c.lineWidth = 2.2;
    c.stroke();
    c.restore();
  };

  switch (base) {
    // ===================== 步兵：純粹大顆卡通鋼盔＋正面星章 =====================
    case 'inf': {
      drawHelmet(0, 0, 1.05);
      // 鋼盔正中央醒目徽章（一眼識別步兵）
      toonCirc(2, -1, 4.2, acc, 2.2);
      break;
    }

    // ===================== 反戰車步兵：卡通鋼盔＋頭頂巨型大彈頭火箭筒 =====================
    case 'atinf': {
      drawHelmet(-3, 2, 0.88);
      // 斜背巨型卡通火箭筒＋超誇張圓錐大彈頭
      c.save();
      c.translate(2, -4);
      c.rotate(-0.28);
      toonRR(-17, -4, 24, 7.5, 3, lo, 2.5);
      toonPoly([[7, -7], [19, -0.25], [7, 6.5]], col, 2.5);
      toonCirc(10, -0.25, 2, acc, 1.5);
      c.restore();
      break;
    }

    // ===================== 兩棲陸戰隊：卡通鋼盔＋下方可愛海浪與船錨徽章 =====================
    case 'marine': {
      drawHelmet(0, -2, 0.94);
      // 鋼盔上的海錨標誌
      toonCirc(2, -3, 3.6, acc, 2);
      // 下方兩朵圓滾滾卡通白浪花
      toonPoly([
        [-19, 10], [-14, 5], [-9, 9], [-3, 4.5], [3, 9], [9, 4.5], [15, 9], [19, 6],
        [18, 13], [-18, 13]
      ], acc, 2.4);
      break;
    }

    // ===================== 主力戰車：Q版圓潤重戰車（大砲塔＋粗短大主砲＋三輪胖履帶） =====================
    case 'tank': {
      // 胖車身與圓頂大砲塔
      toonRR(-18, -2, 34, 8, 4, col, 2.6);
      toonEll(-3, -2, 11.5, 8.5, 0, col, 2.6, Math.PI, Math.PI * 2);
      shine(-6, -6.5, 4.5, 2, -0.2);
      // 粗大卡通主砲＋大砲口箍
      toonRR(6, -8.5, 14, 5, 2, col, 2.5);
      toonRR(17, -10, 4.5, 8, 2, lo, 2.5);
      toonTracks(-17, 4, 34, 9, 3);
      break;
    }

    // ===================== 偵察車：Q版大輪吉普裝甲車＋大車窗＋高天線 =====================
    case 'recon': {
      // 小天線與圓球頂
      line(-11, -5, -14, -13, 2.4, ink);
      toonCirc(-14, -13, 2.2, col, 2);
      // 圓潤車身與觀測大窗
      toonPoly([[-17, 5], [-16, -5], [-6, -10], [8, -10], [18, -2], [18, 5]], col, 2.6);
      toonPoly([[-2, -7.5], [6, -7.5], [11, -2.5], [-2, -2.5]], acc, 2.2);
      // 車頂小機槍
      line(2, -10, 12, -12, 3, ink);
      toonWheels([-10, 10], 6.5, 5.2);
      break;
    }

    // ===================== 自走砲：45度仰角超粗大口徑重砲（卡通大砲管） =====================
    case 'arty': {
      // 45 度仰角超粗卡通巨砲
      c.save();
      c.translate(-1, -4);
      c.rotate(-0.55);
      toonRR(0, -4, 22, 8, 3, col, 2.6);
      toonRR(18, -5.5, 5, 11, 2, lo, 2.5);
      c.restore();
      // 後置大砲塔與車身
      toonRR(-18, -10, 18, 14, 4, col, 2.6);
      toonRR(-18, -2, 33, 7, 3.5, col, 2.6);
      shine(-11, -6, 3.5, 2, 0);
      toonTracks(-17, 4, 34, 9, 3);
      break;
    }

    // ===================== 多管火箭：Q版發射車＋背上三根圓頭大火箭 =====================
    case 'rocket': {
      // 倾斜的卡通火箭箱（直接露出三顆大圓錐火箭頭）
      c.save();
      c.translate(-4, -3);
      c.rotate(-0.35);
      toonRR(-12, -8, 22, 10, 3, col, 2.6);
      toonPoly([[10, -8], [17, -4.5], [10, -1]], acc, 2.2);
      toonPoly([[10, -5], [17, -1.5], [10, 2]], acc, 2.2);
      line(-9, -4.5, 7, -4.5, 2.2, acc);
      line(-9, -1.5, 7, -1.5, 2.2, acc);
      c.restore();
      // 卡車底盤與圓頭駕駛室
      toonRR(-18, 2, 35, 5.5, 2.5, lo, 2.5);
      toonPoly([[7, 3], [7, -7], [15, -7], [19, -1], [19, 3]], col, 2.6);
      toonRR(10, -5, 5.5, 4.5, 1.5, acc, 2);
      toonWheels([-11, -1, 12], 7.5, 4.4);
      break;
    }

    // ===================== 防空砲：卡通雙管高射砲＋頭頂旋轉大雷達耳朵 =====================
    case 'aa': {
      // 兩根粗壯斜向右上高射砲管
      line(0, -6, 17, -14, 4.5, ink);
      line(0, -6, 17, -14, 2, col);
      line(3, -2, 20, -10, 4.5, ink);
      line(3, -2, 20, -10, 2, col);
      // 圓滾滾砲塔＋後方大雷達碟盤
      toonEll(-10, -10, 3.5, 6, -0.3, acc, 2.4);
      toonRR(-10, -9, 16, 9, 4, col, 2.6);
      toonRR(-17, -2, 34, 7, 3.5, col, 2.6);
      toonCirc(-2, -4.5, 2.8, acc, 2);
      toonTracks(-17, 4, 34, 9, 3);
      break;
    }

    // ===================== 防空飛彈：發射台＋一顆超大卡通圓胖飛彈斜指天空 =====================
    case 'sam': {
      // 超大卡通飛彈（斜向右上，帶可愛尾翼與尖鼻錐）
      c.save();
      c.translate(-1, -3);
      c.rotate(-0.55);
      // 尾翼
      toonPoly([[-13, -7], [-7, -4], [-7, 4], [-13, 7]], lo, 2.4);
      // 飛彈圓胖彈體
      toonRR(-11, -4.8, 24, 9.6, 4, col, 2.6);
      // 醒目彈頭
      toonPoly([[11, -4.8], [21, 0], [11, 4.8]], acc, 2.5);
      shine(-2, -2, 5, 1.5, 0);
      c.restore();
      // 底部發射車底座
      toonRR(-17, 4, 34, 7, 3.5, lo, 2.6);
      toonWheels([-11, 0, 11], 8.5, 4);
      break;
    }

    // ===================== 攻擊直升機：圓滾滾泡泡座艙＋大螺旋槳＋短翼飛彈 =====================
    case 'heli': {
      // 頂部大螺旋槳
      line(-19, -12, 19, -12, 4, ink);
      line(-17, -12, 17, -12, 1.8, acc);
      line(2, -12, 2, -6, 3.5, ink);
      // 尾桁與圓形小尾槳
      toonPoly([[-19, -2], [-4, -4], [-4, 2], [-18, 1]], col, 2.5);
      toonCirc(-18, -2, 4.2, acc, 2.2);
      // 圓胖機身與大大泡泡玻璃窗
      toonEll(4, -1, 13, 7.5, 0, col, 2.6);
      toonPoly([[5, -6.5], [16, -2], [15, 2.5], [5, 1]], acc, 2.3);
      // 短翼掛載火箭筒與底部滑橇
      toonRR(-2, 1.5, 9, 4.5, 2, lo, 2.3);
      line(-7, 9.5, 12, 9.5, 3, ink);
      line(-3, 5.5, -3, 9.5, 2.6, ink);
      line(7, 5.5, 7, 9.5, 2.6, ink);
      break;
    }

    // ===================== 運輸直升機：雙螺旋槳胖嘟嘟巴士機身（契努克） =====================
    case 'thelico': {
      // 前後雙螺旋槳
      line(-20, -11, -2, -11, 3.8, ink);
      line(2, -12, 20, -12, 3.8, ink);
      line(-11, -11, -11, -5, 3.2, ink);
      line(11, -12, 11, -5, 3.2, ink);
      // 雙塔胖嘟嘟機身
      toonPoly([[-17, -5], [-13, -9], [-7, -9], [-6, -5], [6, -5], [8, -9], [14, -9], [18, -2], [18, 5], [-17, 5]], col, 2.6);
      // 圓形舷窗與前窗
      toonPoly([[11, -4], [16.5, -1], [16.5, 2], [11, 2]], acc, 2);
      toonCirc(-9, 0, 2.6, acc, 2);
      toonCirc(-1, 0, 2.6, acc, 2);
      toonCirc(6, 0, 2.6, acc, 2);
      toonCirc(-10, 7.5, 3.2, lo, 2.2);
      toonCirc(10, 7.5, 3.2, lo, 2.2);
      break;
    }

    // ===================== 戰鬥機：Q版流線三角翼噴射機＋大水滴座艙 =====================
    case 'fighter': {
      toonPoly([
        [20, 0], [8, -4], [-3, -14.5], [-9, -14.5], [-7, -4.5],
        [-14, -9.5], [-19, -9.5], [-16, -2], [-20, 0],
        [-16, 2], [-19, 9.5], [-14, 9.5], [-7, 4.5], [-9, 14.5], [-3, 14.5], [8, 4]
      ], col, 2.6);
      // 超大卡通水滴座艙罩
      toonEll(5, 0, 6.5, 3.2, 0, acc, 2.3);
      break;
    }

    // ===================== 攻擊機：平直寬翼＋雙尾椼＋翼下四顆大炸彈 =====================
    case 'attacker': {
      // 翼下四顆圓頭突出大飛彈
      for (const y of [-11, -6.5, 6.5, 11]) {
        toonRR(-3, y - 1.8, 12, 3.6, 1.8, acc, 2);
      }
      toonPoly([
        [19, 0], [9, -3.5], [4, -3.5], [3, -15], [-4, -15], [-4, -3.5],
        [-12, -3], [-14, -8.5], [-19, -8.5], [-19, 8.5], [-14, 8.5], [-12, 3],
        [-4, 3.5], [-4, 15], [3, 15], [4, 3.5], [9, 3.5]
      ], col, 2.6);
      toonEll(7, 0, 5, 2.8, 0, acc, 2.2);
      break;
    }

    // ===================== 重型轟炸機：超大後掠翼＋四具引擎＋機腹炸彈圖示 =====================
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

    // ===================== 匿蹤戰機：飛翼迴力鏢（B-2 造型） =====================
    case 'stealth': {
      toonPoly([
        [18, 0], [-4, -15.5], [-11, -15.5], [-6, -8], [-14, -4], [-9, 0],
        [-14, 4], [-6, 8], [-11, 15.5], [-4, 15.5]
      ], col, 2.6);
      // 雙座艙高光窗
      toonPoly([[9, 0], [3, -4.5], [1, -2], [4, 0], [1, 2], [3, 4.5]], acc, 2);
      break;
    }

    // ===================== 運輸機：圓頭胖胖大肚機＋機背白色大貨箱 =====================
    case 'airlift': {
      toonPoly([
        [19, 0], [13, -5.2], [4, -5.2], [3, -16], [-4, -16], [-5, -5.2],
        [-13, -4.5], [-17, -9], [-21, -9], [-19, 0],
        [-21, 9], [-17, 9], [-13, 4.5], [-5, 5.2], [-4, 16], [3, 16],
        [4, 5.2], [13, 5.2]
      ], col, 2.6);
      // 機背大貨箱與機首窗
      toonRR(-6, -3.6, 9, 7.2, 1.8, acc, 2.2);
      toonEll(12, 0, 3, 3.5, 0, acc, 2);
      break;
    }

    // ===================== 驅逐艦：Q版戰艦（高昂船頭＋大艦橋＋前主砲＋海浪） =====================
    case 'destroyer': {
      // 艦橋與雷達塔
      toonPoly([[-11, 1], [-9, -8], [3, -8], [5, 1]], col, 2.5);
      line(-3, -8, -3, -14, 3, ink);
      line(-6.5, -11, 0.5, -11, 2.5, ink);
      // 艦艏大主砲
      line(11, -2, 19, -5, 4, ink);
      toonRR(6, -4.5, 7, 5.5, 2, lo, 2.4);
      // 船身
      toonPoly([[-19, 0], [15, 0], [21, -3], [16, 9], [-16, 9]], col, 2.6);
      // 兩個圓形舷窗
      toonCirc(-6, 4.5, 2.2, acc, 1.8);
      toonCirc(2, 4.5, 2.2, acc, 1.8);
      toonCirc(10, 4.5, 2.2, acc, 1.8);
      break;
    }

    // ===================== 航空母艦：Q版寬甲板航母＋高艦島＋甲板跑道線 =====================
    case 'carrier': {
      // 後方高聳艦島
      toonRR(-14, -13, 10, 10, 2.5, lo, 2.5);
      line(-9, -13, -9, -16, 2.8, ink);
      // 船身與滑躍大甲板
      toonPoly([[-19, 1], [16, 1], [21, -3], [16, 9.5], [-16, 9.5]], col, 2.6);
      toonRR(-21, -3.5, 41, 5.5, 2, col, 2.6);
      // 跑道虛線
      for (const x of [-16, -7, 2, 11]) {
        line(x, -0.8, x + 5, -0.8, 2.6, acc);
      }
      break;
    }

    // ===================== 登陸艦：開口大跳板＋船艙載著小戰車色塊 =====================
    case 'lst': {
      // 船艙內載運的兩個圓角貨櫃塊與艦尾樓
      toonRR(-18, -10, 9, 10, 2, lo, 2.5);
      toonRR(-7, -5.5, 8, 6, 2, acc, 2.2);
      toonRR(3, -5.5, 8, 6, 2, acc, 2.2);
      // 平底船身与前方張開的登陸大跳板
      toonPoly([[-19, 0], [15, 0], [18, 9.5], [-16, 9.5]], col, 2.6);
      line(15, 1, 21, -7, 4, ink);
      line(15, 1, 21, -7, 2, acc);
      break;
    }

    // ===================== 運輸卡車：Q版大蓬車＋圓滾滾大車輪 =====================
    case 'truck': {
      // 圓頂大貨蓬與駕駛車頭
      toonRR(-18, -10, 22, 14, 4.5, col, 2.6);
      toonPoly([[4, 4], [4, -6], [14, -6], [19, -0.5], [19, 4]], col, 2.6);
      toonPoly([[7.5, -4], [13, -4], [16, -0.5], [7.5, -0.5]], acc, 2);
      line(-12, -7, -12, 1, 2.2, acc);
      line(-4, -7, -4, 1, 2.2, acc);
      toonWheels([-11, -1, 12], 6.5, 4.8);
      break;
    }

    // ===================== 軍用列車：Q版火車頭＋大煙囪與排障器 =====================
    case 'train': {
      // 鐵軌
      line(-20, 10, 20, 10, 3, ink);
      // 火車頭車身、駕駛室與前方大煙囪
      toonRR(-18, -10, 14, 15, 3, col, 2.6);
      toonRR(-5, -6, 21, 11, 3.5, col, 2.6);
      toonRR(8, -12, 5, 7, 2, lo, 2.4);
      toonRR(-14, -7, 6, 5, 1.5, acc, 2);
      // 車頭排障器
      toonPoly([[15, 2], [21, 8], [15, 8]], acc, 2.2);
      toonWheels([-12, -2, 6, 13], 7, 3.8);
      break;
    }

    // ===================== 澤火革 次世代次微米/演算法尖端兵種 =====================
    case 'euv_fortress': {
      // 台積電 EUV 防護堡壘：厚重能量八角裝甲、核心發光晶圓透鏡與雙重重砲
      toonRR(-19, 0, 38, 9, 4, lo, 2.8);
      toonRR(-14, -10, 28, 12, 3.5, col, 2.6);
      toonCirc(0, -4, 5, '#22d3ee', 2.2);
      line(14, -6, 22, -6, 4.5, ink); line(14, -6, 22, -6, 2.8, acc);
      line(-14, -6, -20, -6, 4, ink); line(-14, -6, -20, -6, 2.2, acc);
      toonWheels([-12, -4, 4, 12], 6.5, 3.5);
      break;
    }
    case 'wafer_inf': {
      // 晶圓外骨骼衛隊：鋼盔＋外骨骼肩甲與能量光束步槍
      toonPoly([[-15, 2], [-5, 7], [-1, -4], [-10, -7]], lo, 2.4);
      toonRR(-10, -13, 19, 13, 6, col, 2.6);
      toonCirc(4, -6, 3, '#22d3ee', 1.8);
      line(5, 3, 21, -1, 4.2, ink); line(5, 3, 21, -1, 2.5, acc);
      break;
    }
    case 'laser_aa': {
      // 矽光子雷射防空：履帶底盤＋高能雷射發射砲塔＋聚焦鏡組
      toonRR(-17, 2, 34, 7, 3, lo, 2.6);
      toonRR(-10, -8, 20, 11, 3, col, 2.6);
      toonPoly([[6, -6], [18, -12], [20, -9], [8, -3]], '#22d3ee', 2.4);
      line(18, -12, 23, -14, 3.5, acc);
      toonWheels([-10, -3, 4, 11], 5.5, 3.2);
      break;
    }
    case 'nano_swarm': {
      // 奈米遊蕩蜂群：三架三角形微型無人機編隊
      for (const [ox, oy, sz] of [[-6, -5, 7], [8, -1, 6], [-4, 6, 6]]) {
        toonPoly([[ox - sz, oy + sz * 0.7], [ox + sz, oy], [ox - sz, oy - sz * 0.7]], col, 2.2);
        toonCirc(ox, oy, 1.8, '#22d3ee', 1.2);
      }
      break;
    }
    case 'anduril_tank': {
      // 安杜里爾狼群戰車：楔形自主無人砲塔＋雙聯裝電磁砲
      toonRR(-18, 1, 36, 8, 3.5, lo, 2.6);
      toonPoly([[-12, 1], [14, 1], [10, -6], [-8, -6]], col, 2.6);
      line(10, -3, 22, -3, 3.8, ink); line(10, -3, 22, -3, 2.2, acc);
      line(10, -5, 20, -5, 3.8, ink); line(10, -5, 20, -5, 2.2, acc);
      toonWheels([-11, -4, 3, 10], 6, 3.2);
      break;
    }
    case 'palantir_arty': {
      // 帕蘭提爾軌道火控砲：重裝底盤＋長身管加農砲＋衛星通訊天線
      toonRR(-18, 1, 36, 8, 3.5, lo, 2.6);
      toonRR(-12, -7, 18, 9, 3, col, 2.6);
      toonCirc(-6, -11, 4.5, '#60a5fa', 1.8);
      line(6, -4, 23, -13, 4.5, ink); line(6, -4, 23, -13, 2.8, acc);
      toonWheels([-11, -3, 4, 11], 6, 3.2);
      break;
    }
    case 'wingman_carrier': {
      // 忠誠僚機母艦：重型飛翼巡航機身＋發光指揮機庫
      toonPoly([[-20, 7], [18, 0], [-20, -7], [-12, 0]], col, 2.8);
      toonPoly([[-6, 1.5], [6, 0], [-6, -1.5]], '#60a5fa', 2);
      line(-10, -11, 4, 0, 3, lo); line(-10, 11, 4, 0, 3, lo);
      break;
    }
    case 'usv_wolfpack': {
      // 自主無人作戰艦：雙體穿浪匿蹤水面艇＋垂直反艦飛彈箱
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
