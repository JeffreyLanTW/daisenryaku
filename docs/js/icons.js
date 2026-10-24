'use strict';
// ===== 部隊圖示：高辨識度戰棋剪影（老花友善、無外框、依國家單色系區分、簡潔幾何兵種圖示） =====

// 16 國專屬高對比單色系（各自具備鮮明色相，方便老花眼玩家一眼辨識國籍與陣營）
const NATION_PALETTE = {
  TW: '#2563eb', // 國軍：寶藍
  CN: '#dc2626', // 解放軍：正紅
  US: '#0284c7', // 美軍：天藍
  JP: '#e11d48', // 自衛隊：緋紅
  KR: '#4f46e5', // 韓軍：靛藍
  KP: '#991b1b', // 人民軍：暗紅
  PH: '#0d9488', // 菲軍：青綠
  VN: '#b45309', // 越軍：琥珀褐
  RU: '#be123c', // 俄軍：深緋紅
  IN: '#ea580c', // 印軍：亮橘
  PK: '#15803d', // 巴軍：翠綠
  GB: '#1d4ed8', // 英軍：皇家藍
  FR: '#7c3aed', // 法軍：紫羅蘭
  DE: '#374151', // 德軍：鐵灰
  AU: '#ca8a04', // 澳軍：金褐
  IL: '#0369a1', // 以軍：海藍
};

function nationColor(nid, side) {
  let c = NATION_PALETTE[nid] || (side === 1 ? '#dc2626' : '#2563eb');
  // 若同場對戰雙方恰巧撞色，自動將紅方轉為高對比緋紅
  if (typeof G !== 'undefined' && G && G.nations && side === 1 && G.nations[0] === G.nations[1]) {
    c = '#dc2626';
  }
  return c;
}

// 繪製高對比簡潔幾何剪影（座標中心 0,0，範圍約 -21..21 x -15..15，車頭/機首朝右）
function drawIcon(c, d) {
  const base = d.base;
  const col = nationColor(d.nation, d.side);
  const dark = shade(col, -0.45);
  const light = shade(col, 0.88);
  const white = '#ffffff';

  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // 底部高對比柔和投影（取代外框，讓單色剪影在任何地形上都立體鮮明）
  c.shadowColor = 'rgba(0,0,0,0.55)';
  c.shadowBlur = 3.5;
  c.shadowOffsetY = 1.8;

  const fillPoly = (pts, fill = col) => {
    c.beginPath();
    pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
  };
  const fillRR = (x, y, w, h, r, fill = col) => {
    roundRect(c, x, y, w, h, Math.min(r, w / 2, h / 2));
    c.fillStyle = fill;
    c.fill();
  };
  const fillCirc = (x, y, r, fill = col) => {
    circle(c, x, y, r);
    c.fillStyle = fill;
    c.fill();
  };
  const drawBar = (x1, y1, x2, y2, w, stroke = col) => {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineWidth = w;
    c.strokeStyle = stroke;
    c.stroke();
  };
  const noShadow = () => {
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
  };

  // 共用底盤：履帶或輪式（單色剪影＋白色負空間孔洞）
  const drawTracks = (x0, y0, w, h, holes = 4) => {
    fillRR(x0, y0, w, h, h / 2, col);
    noShadow();
    const step = (w - h) / Math.max(1, holes - 1);
    for (let k = 0; k < holes; k++) {
      fillCirc(x0 + h / 2 + k * step, y0 + h / 2, h * 0.28, white);
    }
  };
  const drawWheels = (xs, y, r = 4.2) => {
    for (const x of xs) {
      c.shadowColor = 'rgba(0,0,0,0.55)';
      c.shadowBlur = 3;
      fillCirc(x, y, r, col);
      noShadow();
      fillCirc(x, y, r * 0.42, white);
    }
  };

  switch (base) {
    // ===================== 步兵：大鋼盔＋步槍剪影 =====================
    case 'inf': {
      // 大鋼盔半圓頂
      c.beginPath();
      c.arc(-1, -3, 11.5, Math.PI * 1.05, Math.PI * -0.05);
      c.lineTo(13, -1);
      c.lineTo(-14, -1);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      // 士兵胸肩剪影
      fillRR(-10, 1, 18, 11, 4, col);
      // 醒目步槍（斜向右上）
      drawBar(-14, 9, 17, -6, 4.2, col);
      drawBar(12, -4, 19, -7, 2.6, col);
      noShadow();
      // 白色負空間分割線（讓槍身與鋼盔邊界一目了然）
      drawBar(-11, -1, 11, -1, 1.8, white);
      drawBar(-12, 8, 13, -4, 1.6, white);
      break;
    }

    // ===================== 反戰車步兵：鋼盔＋巨型火箭筒＋彈頭 =====================
    case 'atinf': {
      // 鋼盔與士兵半身
      c.beginPath();
      c.arc(-5, -2, 8.5, Math.PI, 0);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      fillRR(-12, 0, 14, 12, 3.5, col);
      // 巨型肩射飛彈筒與錐形大彈頭
      fillRR(-18, -8, 30, 6.5, 2.5, col);
      fillPoly([[11, -10.5], [21, -4.75], [11, 1]], col);
      // 尾焰噴口
      fillPoly([[-18, -8], [-22, -10.5], [-22, 1], [-18, -1.5]], col);
      noShadow();
      drawBar(-15, -4.75, 9, -4.75, 2, white);
      break;
    }

    // ===================== 兩棲陸戰隊：登陸突擊艇＋大船錨＋海浪 =====================
    case 'marine': {
      // 突擊艇船身
      fillPoly([[-19, -2], [14, -2], [20, -6], [16, 7], [-16, 7]], col);
      // 上方戰鬥室與槍管
      fillRR(-11, -9, 14, 7, 2, col);
      drawBar(3, -6, 15, -6, 3.2, col);
      noShadow();
      // 白色海浪線與白色十字標記
      drawBar(-18, 10.5, 18, 10.5, 2.6, light);
      fillCirc(-4, 2.5, 2.6, white);
      fillCirc(5, 2.5, 2.6, white);
      break;
    }

    // ===================== 主力戰車：厚重履帶＋斜甲車體＋大砲塔＋長主砲 =====================
    case 'tank': {
      // 車體與砲塔
      fillPoly([[-19, 4], [-16, -2], [14, -2], [19, 4]], col);
      fillPoly([[-12, -2], [-9, -11], [5, -11], [9, -2]], col);
      // 粗長水平主砲與砲口制退器
      drawBar(6, -7, 21, -7, 4.2, col);
      fillRR(18, -9.5, 4, 5, 1, col);
      drawTracks(-18, 3, 36, 9, 5);
      // 白色裝甲分界線
      drawBar(-15, 3, 15, 3, 1.6, white);
      fillCirc(-2, -6.5, 2.2, white);
      break;
    }

    // ===================== 偵察車：高機動大輪裝甲車＋天線 =====================
    case 'recon': {
      fillPoly([[-18, 4], [-17, -4], [-8, -6], [10, -6], [19, 0], [18, 4]], col);
      fillPoly([[-6, -6], [-4, -11], [4, -11], [6, -6]], col);
      drawBar(5, -9, 16, -9, 2.8, col);
      drawBar(-12, -6, -15, -14, 2, col);
      noShadow();
      // 醒目觀測窗
      fillPoly([[3, -4.5], [9, -4.5], [13, -1], [3, -1]], white);
      drawWheels([-11, 0, 11], 7, 4.6);
      break;
    }

    // ===================== 自走砲：45度仰角巨型重砲 =====================
    case 'arty': {
      // 45 度仰角巨砲（極粗砲管＋砲口制退器，與戰車水平砲完全區隔）
      drawBar(-2, -3, 18, -15, 5.2, col);
      fillCirc(18, -15, 3.2, col);
      fillPoly([[-18, 4], [-16, -2], [12, -2], [16, 4]], col);
      fillRR(-16, -9, 17, 8, 2.5, col);
      drawTracks(-18, 3, 35, 9, 4);
      drawBar(-14, 3, 13, 3, 1.6, white);
      break;
    }

    // ===================== 多管火箭：傾斜大型蜂巢發射箱＋三枚齊射火箭 =====================
    case 'rocket': {
      // 卡車底盤與車頭
      fillRR(-18, 2, 35, 4.5, 1.5, col);
      fillPoly([[8, 2], [8, -7], [15, -7], [19, -2], [19, 2]], col);
      // 傾斜大型多管火箭箱
      c.save();
      c.translate(-5, -2);
      c.rotate(-0.38);
      fillRR(-12, -9, 22, 9, 2, col);
      noShadow();
      // 三條白色火箭彈道條紋
      drawBar(-9, -6.5, 7, -6.5, 1.8, white);
      drawBar(-9, -4.5, 7, -4.5, 1.8, white);
      drawBar(-9, -2.5, 7, -2.5, 1.8, white);
      c.restore();
      drawWheels([-12, -3, 13], 7.5, 4.2);
      break;
    }

    // ===================== 防空砲：高仰角雙聯裝機砲＋圓弧雷達天線 =====================
    case 'aa': {
      // 高仰角雙聯裝對空機砲（兩根平行斜向右上砲管）
      drawBar(0, -6, 17, -15, 3, col);
      drawBar(3, -3, 20, -12, 3, col);
      // 後方大雷達碟盤
      c.beginPath();
      c.arc(-10, -11, 5, Math.PI * 0.6, Math.PI * 1.6);
      c.lineWidth = 3.2;
      c.strokeStyle = col;
      c.stroke();
      fillRR(-9, -9, 14, 8, 2.5, col);
      fillPoly([[-17, 4], [-15, -2], [14, -2], [17, 4]], col);
      drawTracks(-17, 3, 34, 9, 4);
      fillCirc(-2, -5, 2.2, white);
      break;
    }

    // ===================== 防空飛彈：雙枚斜射大型尖頭飛彈 =====================
    case 'sam': {
      // 發射底座
      fillRR(-17, 4, 34, 6, 2.5, col);
      fillRR(-10, -1, 14, 5, 1.5, col);
      // 兩枚極醒目的斜射大飛彈（帶尖錐與尾翼）
      for (const [ox, oy] of [[-7, -2], [4, 0]]) {
        c.save();
        c.translate(ox, oy);
        c.rotate(-0.62);
        fillRR(-8, -3, 22, 6, 1.5, col);
        fillPoly([[14, -4.2], [21, 0], [14, 4.2]], col);
        noShadow();
        drawBar(-6, 0, 12, 0, 1.8, white);
        c.restore();
      }
      noShadow();
      for (const x of [-11, 0, 11]) fillCirc(x, 7, 2, white);
      break;
    }

    // ===================== 攻擊直升機：大旋翼＋流線武裝機身＋短翼飛彈 =====================
    case 'heli': {
      // 頂部超寬主旋翼與轉軸
      drawBar(-19, -12, 19, -12, 3.2, col);
      drawBar(1, -12, 1, -6, 3.2, col);
      // 尾桁與十字尾槳
      fillPoly([[-19, -2], [-4, -3], [-4, 2], [-18, 1]], col);
      fillPoly([[-19, -2], [-16, -9], [-13, -2]], col);
      // 武裝機身與滑橇
      fillPoly([[-7, -6], [9, -6], [19, 0], [17, 4], [-7, 4]], col);
      drawBar(-8, 9.5, 12, 9.5, 2.8, col);
      drawBar(-4, 4, -4, 9.5, 2.4, col);
      drawBar(7, 4, 7, 9.5, 2.4, col);
      // 機鼻機砲
      drawBar(15, 3, 21, 4, 2.6, col);
      noShadow();
      // 白色座艙窗與旋翼高光
      fillPoly([[6, -4], [15, 0], [6, 0]], white);
      fillCirc(-16, -4, 2.2, white);
      break;
    }

    // ===================== 運輸直升機：雙旋翼胖機身（契努克造型） =====================
    case 'thelico': {
      // 前後雙旋翼
      drawBar(-20, -11, -2, -11, 3, col);
      drawBar(2, -12, 20, -12, 3, col);
      drawBar(-11, -11, -11, -5, 3, col);
      drawBar(11, -12, 11, -5, 3, col);
      // 寬大圓潤貨艙機身
      fillPoly([[-16, -6], [-9, -10], [-6, -5], [8, -5], [12, -10], [16, -4], [18, 3], [15, 6], [-16, 6]], col);
      fillCirc(-10, 8, 2.8, col);
      fillCirc(10, 8, 2.8, col);
      noShadow();
      // 白色貨艙舷窗與駕駛窗
      fillPoly([[11, -3], [16, 1], [11, 1]], white);
      for (const x of [-9, -2, 5]) fillCirc(x, 1, 2.2, white);
      break;
    }

    // ===================== 制空戰鬥機：後掠三角翼尖鼻戰機（俯視） =====================
    case 'fighter': {
      fillPoly([
        [21, 0], [8, -2.8], [2, -3.5], [-4, -14.5], [-9, -14.5], [-8, -3.8],
        [-14, -9.5], [-18, -9.5], [-16, -2], [-20, 0],
        [-16, 2], [-18, 9.5], [-14, 9.5], [-8, 3.8], [-9, 14.5], [-4, 14.5],
        [2, 3.5], [8, 2.8]
      ], col);
      noShadow();
      // 醒目白色水滴座艙罩
      c.beginPath();
      c.ellipse(7, 0, 4.8, 2, 0, 0, Math.PI * 2);
      c.fillStyle = white;
      c.fill();
      break;
    }

    // ===================== 攻擊機：平直寬主翼＋翼下四枚巨型火箭彈掛架（A-10 造型） =====================
    case 'attacker': {
      // 平直寬翼與雙尾椼
      fillPoly([
        [19, 0], [9, -3], [4, -3], [3, -15], [-3, -15], [-3, -3],
        [-13, -2.5], [-14, -8.5], [-18, -8.5], [-18, 8.5], [-14, 8.5], [-13, 2.5],
        [-3, 3], [-3, 15], [3, 15], [4, 3], [9, 3]
      ], col);
      // 翼下突出彈頭
      for (const y of [-11, -7, 7, 11]) {
        drawBar(-4, y, 7, y, 3, col);
      }
      noShadow();
      fillCirc(8, 0, 2.4, white);
      drawBar(0, -12, 0, -5, 2, white);
      drawBar(0, 5, 0, 12, 2, white);
      break;
    }

    // ===================== 重型轟炸機：四發動機超大展弦比後掠翼巨無霸 =====================
    case 'bomber': {
      fillPoly([
        [21, 0], [12, -3.5], [5, -4], [-5, -16], [-10, -16], [-5, -3.5],
        [-14, -3], [-18, -9], [-21, -9], [-19, 0],
        [-21, 9], [-18, 9], [-14, 3], [-5, 3.5], [-10, 16], [-5, 16],
        [5, 4], [12, 3.5]
      ], col);
      // 四具前伸渦扇發動機莢艙
      for (const y of [-11.5, -7, 7, 11.5]) {
        fillRR(-4, y - 1.8, 9, 3.6, 1.5, col);
      }
      noShadow();
      // 白色轟炸機多窗座艙與機腹炸彈標誌
      fillRR(10, -2.2, 5, 4.4, 1.5, white);
      fillCirc(-1, 0, 2.8, white);
      break;
    }

    // ===================== 匿蹤戰機：鋸齒飛翼迴力鏢（B-2 / F-117 幾何切面） =====================
    case 'stealth': {
      fillPoly([
        [18, 0], [-4, -15.5], [-10, -15.5], [-6, -8], [-13, -4], [-9, 0],
        [-13, 4], [-6, 8], [-10, 15.5], [-4, 15.5]
      ], col);
      noShadow();
      // 白色稜線切面條紋
      c.beginPath();
      c.moveTo(11, 0);
      c.lineTo(-4, -9);
      c.moveTo(11, 0);
      c.lineTo(-4, 9);
      c.lineWidth = 2.2;
      c.strokeStyle = white;
      c.stroke();
      break;
    }

    // ===================== 運輸機：寬體圓頭＋T型尾翼＋白色降落傘/貨箱標誌 =====================
    case 'airlift': {
      fillPoly([
        [19, 0], [14, -4.5], [4, -4.5], [3, -16], [-3, -16], [-4, -4.5],
        [-14, -4], [-17, -8.5], [-20, -8.5], [-19, 0],
        [-20, 8.5], [-17, 8.5], [-14, 4], [-4, 4.5], [-3, 16], [3, 16],
        [4, 4.5], [14, 4.5]
      ], col);
      noShadow();
      // 機背醒目白色貨箱／十字空投標誌
      fillRR(-5, -2.8, 8, 5.6, 1, white);
      fillCirc(12, 0, 2.2, white);
      break;
    }

    // ===================== 驅逐艦：高昂艦艏＋主砲＋雷達桅杆 =====================
    case 'destroyer': {
      // 船體（艦艏高昂朝右）
      fillPoly([[-19, 1], [15, 1], [21, -2], [16, 9], [-16, 9]], col);
      // 艦橋與主桅杆
      fillPoly([[-11, 1], [-9, -6], [4, -6], [6, 1]], col);
      fillPoly([[-3, -6], [-1, -13], [2, -13], [3, -6]], col);
      drawBar(-4, -10, 5, -10, 2.4, col);
      // 艦艏主砲
      fillRR(8, -3, 6, 4, 1.5, col);
      drawBar(13, -2, 20, -4, 2.4, col);
      noShadow();
      // 白色吃水線與舷窗
      drawBar(-15, 5.5, 14, 5.5, 2, white);
      fillCirc(-4, -2.5, 1.8, white);
      fillCirc(1, -2.5, 1.8, white);
      break;
    }

    // ===================== 航空母艦：全通平甲板＋滑躍艦艏＋白色跑道虛線＋艦島 =====================
    case 'carrier': {
      // 寬大船體與滑躍飛行甲板
      fillPoly([[-20, 0], [16, 0], [21, -4], [17, 9], [-17, 9]], col);
      fillRR(-21, -3, 40, 4, 1, col);
      // 後方高聳艦島
      fillRR(-13, -12, 9, 9, 1.5, col);
      drawBar(-8.5, -12, -8.5, -15, 2.4, col);
      noShadow();
      // 醒目白色飛行甲板跑道虛線
      for (const x of [-16, -8, 0, 8, 15]) {
        drawBar(x, -1, x + 4, -1, 2.2, white);
      }
      break;
    }

    // ===================== 登陸艦：方頭開口跳板＋白色裝載貨艙 =====================
    case 'lst': {
      // 平底船身与艦尾艦橋
      fillPoly([[-19, 0], [16, 0], [18, 9], [-16, 9]], col);
      fillRR(-18, -9, 9, 9, 1.5, col);
      // 艦艏張開的搶灘登陸跳板門
      drawBar(15, 1, 21, -7, 3.2, col);
      drawBar(16, 7, 21, 3, 2.8, col);
      noShadow();
      // 船艙內兩輛白色裝甲塊（一眼看出是運兵登陸艦）
      fillRR(-6, -4, 7, 4, 1, white);
      fillRR(3, -4, 7, 4, 1, white);
      drawBar(-14, 5, 14, 5, 2, white);
      break;
    }

    // ===================== 運輸卡車：高頂帆布貨斗＋車頭 =====================
    case 'truck': {
      // 拱頂大貨斗與車頭
      fillRR(-18, -9, 22, 13, 3, col);
      fillPoly([[6, 4], [6, -6], [14, -6], [18, -1], [18, 4]], col);
      noShadow();
      // 車窗與貨斗白色條紋
      fillPoly([[9, -4], [13.5, -4], [16, -1], [9, -1]], white);
      drawBar(-14, -5, 0, -5, 2, white);
      drawBar(-14, -1, 0, -1, 2, white);
      drawWheels([-11, -2, 12], 6.5, 4.4);
      break;
    }

    // ===================== 軍用列車：柴電機關車頭＋鐵軌 =====================
    case 'train': {
      // 底部鐵軌
      drawBar(-20, 9.5, 20, 9.5, 2.6, dark);
      // 後節車廂與前節機關車頭
      fillRR(-19, -7, 15, 12, 2, col);
      fillPoly([[-2, 5], [-2, -10], [13, -10], [18, -3], [18, 5]], col);
      // 排障器
      fillPoly([[16, 5], [21, 9], [16, 9]], col);
      noShadow();
      fillPoly([[10, -7.5], [14, -7.5], [16, -3.5], [10, -3.5]], white);
      drawBar(-17, -1, 15, -1, 2.2, white);
      for (const x of [-14, -8, 2, 9, 14]) fillCirc(x, 7, 2.6, col);
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
