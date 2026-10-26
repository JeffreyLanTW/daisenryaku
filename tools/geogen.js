#!/usr/bin/env node
// 100% 本地東亞地理戰區地圖生成器 (Local East Asia Geo-to-Grid Generator)
// 將真實世界經緯度範圍 (Lat/Lon Bounds) 投影為大戰略六角格戰鬥地圖，
// 自動配置據點（首都、工廠、機場、港口、城市）與雙方兵力，並直通平衡遙測分析器。
// 用法：node tools/geogen.js [--apply] [--analyze]
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ===== 東亞真實地理戰區定義 (Theaters Definition) =====
const THEATERS = {
  tm1: {
    id: 'tm1',
    chapter: '測試・初階',
    title: '海峽鎖鑰',
    tierBadge: '初階 EASY',
    tierColor: '#10b981',
    w: 20,
    h: 20,
    geoRegion: '台灣海峽・澎湖水道',
    geoCoords: '23.0°N–25.5°N, 119.0°E–122.0°E',
    bounds: { lat: [23.0, 25.5], lon: [119.0, 122.0] },
    funds: [2200, 1000],
    briefing: '20×20 初階戰區【台灣海峽・澎湖水道】：我方進駐台南/高雄要塞，敵軍集結於海峽西岸。善用澎湖群島中繼機場與海峽縱深實施機動作戰。',
    hqEnemy: [4, 2],
    hqPlayer: [15, 17],
    // 地理特徵：西側福建海岸、中央台灣海峽+澎湖群島、東側台灣本島（西平原、東山脈）
    geoEval: (lon, lat) => {
      // 判斷是否為福建海岸 (西側，lon < 119.4)
      if (lon <= 119.35 + (lat - 24.0) * 0.08) {
        const d = (119.35 + (lat - 24.0) * 0.08) - lon;
        return { land: true, elev: d > 0.25 ? 1.2 : 0.3, rugged: d * 1.5 };
      }
      // 澎湖群島 (中央海峽，lon 119.55 ~ 119.85, lat 23.4 ~ 23.85)
      const dPenghu = Math.hypot((lon - 119.70) * 1.5, (lat - 23.65));
      if (dPenghu < 0.24) {
        return { land: true, elev: 0.2, rugged: 0.1, isIsland: true };
      }
      // 台灣本島 (東側，lon >= 120.1)
      const twCoast = 120.15 - (lat - 23.0) * 0.12;
      if (lon >= twCoast) {
        const distFromCoast = lon - twCoast;
        const elev = distFromCoast < 0.7 ? 0.3 : (distFromCoast < 1.2 ? 1.1 : 2.2);
        return { land: true, elev, rugged: distFromCoast * 1.2, isTw: true };
      }
      // 海洋
      return { land: false, elev: -1 };
    }
  },

  tm2: {
    id: 'tm2',
    chapter: '測試・中階',
    title: '群島爭鋒',
    tierBadge: '中階 MEDIUM',
    tierColor: '#f59e0b',
    w: 30,
    h: 30,
    geoRegion: '琉球群島・沖繩海槽',
    geoCoords: '24.0°N–28.5°N, 123.0°E–129.5°E',
    bounds: { lat: [24.0, 28.5], lon: [123.0, 129.5] },
    funds: [2800, 2800],
    briefing: '30×30 中階戰區【琉球群島・沖繩海槽】：第一島鏈弧形跳島作戰。掌控那霸與嘉手納前進航空基地，組織海空立體協同推進。',
    hqEnemy: [24, 3],
    hqPlayer: [5, 26],
    // 地理特徵：西南-東北走向的琉球島弧（宮古/八重山、沖繩本島、奄美大島）
    geoEval: (lon, lat) => {
      // 先島諸島 (西南端：石垣、西表、宮古)
      const dSaki = Math.hypot((lon - 124.3) * 0.9, (lat - 24.5));
      const dMiyako = Math.hypot((lon - 125.3) * 1.1, (lat - 24.8));
      if (dSaki < 0.42 || dMiyako < 0.32) {
        return { land: true, elev: 0.5, rugged: 0.6, isIsland: true };
      }
      // 沖繩本島 (中央弧形長條：26.1N, 127.6E 至 26.8N, 128.2E)
      const t = Math.max(0, Math.min(1, ((lat - 26.1) / 0.7)));
      const okiLon = 127.65 + t * 0.60;
      const dOki = Math.hypot((lon - okiLon) * 1.8, (lat - (26.1 + t * 0.7)));
      if (dOki < 0.35) {
        return { land: true, elev: 0.6 + t * 0.3, rugged: 0.7 };
      }
      // 奄美大島與大隅群島前緣 (東北端：28.2N, 129.3E)
      const dAmami = Math.hypot((lon - 129.3) * 1.2, (lat - 28.2));
      const dTokara = Math.hypot((lon - 128.9) * 1.1, (lat - 27.8));
      if (dAmami < 0.45 || dTokara < 0.35) {
        return { land: true, elev: 0.8, rugged: 1.1 };
      }
      // 西南角台灣東北端突堤 (lon < 123.4, lat < 25.2)
      if (lon <= 123.6 - (lat - 24.0) * 0.8) {
        return { land: true, elev: 1.2, rugged: 1.5, isTw: true };
      }
      return { land: false, elev: -1 };
    }
  },

  tm3: {
    id: 'tm3',
    chapter: '測試・高階',
    title: '海峽鐵鎖',
    tierBadge: '高階 HARD',
    tierColor: '#ef4444',
    w: 40,
    h: 40,
    geoRegion: '對馬海峽・朝鮮海峽',
    geoCoords: '33.0°N–37.5°N, 127.0°E–132.5°E',
    bounds: { lat: [33.0, 37.5], lon: [127.0, 132.5] },
    funds: [3200, 4800],
    briefing: '40×40 高階戰區【對馬海峽・朝鮮海峽】：釜山與北九州裝甲走廊隔海對峙。對馬島要塞為咽喉鎖鑰，嚴防敵重裝機動兵團。',
    hqEnemy: [32, 4],
    hqPlayer: [9, 36],
    // 地理特徵：西北側朝鮮半島南端（釜山/慶尚/全羅）、中央對馬島/壹岐島、東南側北九州與本州山口
    geoEval: (lon, lat) => {
      // 朝鮮半島南端 (西北部：lat 34.8以上，lon 129.2以下)
      const korCoastLat = 35.05 + (lon - 128.5) * 0.35;
      if (lat >= korCoastLat && lon <= 129.55) {
        const d = (lat - korCoastLat);
        return { land: true, elev: 0.8 + d * 1.4, rugged: 1.0 + d * 2.0, isKorea: true };
      }
      // 巨濟島、南海島等半島沿岸島嶼
      if (Math.hypot(lon - 128.65, lat - 34.85) < 0.28 || Math.hypot(lon - 128.0, lat - 34.8) < 0.25) {
        return { land: true, elev: 0.5, rugged: 0.6 };
      }
      // 對馬島 (Strait Center: 34.1N ~ 34.7N, 129.2E ~ 129.5E)
      const dTsushima = Math.hypot((lon - 129.33) * 2.2, (lat - 34.42));
      if (dTsushima < 0.36) {
        return { land: true, elev: 0.9, rugged: 1.2, isIsland: true };
      }
      // 壹岐島 (Iki: 33.75N, 129.7E)
      if (Math.hypot((lon - 129.7) * 1.8, (lat - 33.78)) < 0.22) {
        return { land: true, elev: 0.4, rugged: 0.4, isIsland: true };
      }
      // 北九州與西本州山口 (東南側：lat 34.2以下，lon 129.8以上)
      const jpnCoastLat = 33.95 + (lon - 130.5) * 0.45;
      if (lat <= jpnCoastLat && lon >= 129.5) {
        const d = (jpnCoastLat - lat);
        return { land: true, elev: 0.7 + d * 1.2, rugged: 0.9 + d * 1.8, isJpn: true };
      }
      return { land: false, elev: -1 };
    }
  }
};

// 沿六角格鄰接路徑鋪設橋樑/通道 (連通海峽與跳島)
const NB_EVEN = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
const NB_ODD = [[1, 0], [-1, 0], [1, -1], [0, -1], [1, 1], [0, 1]];
function hexNeighbors(x, y, w, h) {
  return ((y & 1) ? NB_ODD : NB_EVEN)
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h);
}
function connectHex(grid, ax, ay, bx, by, char = '#') {
  const h = grid.length, w = grid[0].length;
  const q = [[ax, ay, [[ax, ay]]]];
  const seen = new Set([`${ax},${ay}`]);
  let path = null;
  while (q.length) {
    const [cx, cy, p] = q.shift();
    if (cx === bx && cy === by) { path = p; break; }
    for (const [nx, ny] of hexNeighbors(cx, cy, w, h)) {
      const k = `${nx},${ny}`;
      if (!seen.has(k)) {
        seen.add(k);
        q.push([nx, ny, [...p, [nx, ny]]]);
      }
    }
  }
  if (!path) return;
  for (const [px, py] of path) {
    if (grid[py][px] === '~') grid[py][px] = char;
  }
}
function gridToGeo(x, y, w, h, bounds) {
  const lon = bounds.lon[0] + (x / (w - 1)) * (bounds.lon[1] - bounds.lon[0]);
  // 地圖 y=0 為北方 (lat[1])，y=h-1 為南方 (lat[0])
  const lat = bounds.lat[1] - (y / (h - 1)) * (bounds.lat[1] - bounds.lat[0]);
  return { lon, lat };
}

// 產生單一戰區地圖資料
function generateTheaterMap(cfg) {
  const { w, h, bounds, geoEval, hqPlayer, hqEnemy } = cfg;
  const grid = Array.from({ length: h }, () => Array(w).fill('~'));

  // 1. 地形高程與地貌生成
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const { lon, lat } = gridToGeo(x, y, w, h, bounds);
      const geo = geoEval(lon, lat);
      if (!geo.land) {
        grid[y][x] = '~';
      } else {
        if (geo.elev > 1.8) grid[y][x] = 'M'; // 山岳
        else if (geo.elev > 1.0) grid[y][x] = '^'; // 丘陵
        else if (geo.rugged > 0.8) grid[y][x] = 'f'; // 森林
        else grid[y][x] = '.'; // 平原
      }
    }
  }

  // 2. 確保雙方首都與港口所在地為陸地
  const ensureLand = (x, y) => {
    if (x >= 0 && x < w && y >= 0 && y < h) {
      if (grid[y][x] === '~') grid[y][x] = '.';
    }
  };
  ensureLand(hqPlayer[0], hqPlayer[1]);
  ensureLand(hqEnemy[0], hqEnemy[1]);

  grid[hqPlayer[1]][hqPlayer[0]] = 'H'; // 玩家首都
  grid[hqEnemy[1]][hqEnemy[0]] = 'X';   // 敵方首都

  // 3. 戰略設施配置 (城市、工廠、機場、港口)
  // 依據不同規模 (20x20, 30x30, 40x40) 精心佈設戰術重心
  if (cfg.id === 'tm1') {
    // 20x20: 台灣海峽・澎湖水道
    // 我方設施 (台灣本島中南部)
    grid[16][17] = 'F'; // 我方工廠
    grid[18][15] = 'A'; // 我方機場
    grid[15][14] = 'P'; // 我方港口
    grid[15][13] = '~'; // 確保臨海
    grid[18][17] = 'b'; grid[16][15] = 'b'; grid[15][16] = 'b'; grid[15][17] = 'b'; grid[16][18] = 'b'; grid[17][18] = 'b';
    grid[17][16] = '='; grid[16][16] = '=';

    // 澎湖群島 (中央中立島嶼與要塞)
    grid[10][9] = 'o'; // 馬公市
    grid[10][10] = 'a'; // 澎湖中繼機場
    grid[9][10] = 'g'; // 澎湖工廠
    grid[11][10] = 'p'; // 澎湖港
    grid[12][10] = '~'; grid[10][8] = '~';

    // 敵方設施 (福建沿海，平潭/廈門/泉州)
    grid[3][2] = 'G';  // 敵工廠
    grid[1][4] = 'Z';  // 敵機場
    grid[4][3] = 'Q';  // 敵港口
    grid[4][4] = '~'; grid[5][4] = '~';
    grid[2][2] = 'r'; grid[3][3] = 'r'; grid[3][1] = 'r';
    grid[2][3] = '='; grid[3][3] = '=';

    // 跨海六角格連通海峽通道 (便於裝甲車隊與步兵推進)
    connectHex(grid, 3, 3, 9, 10, '#');
    connectHex(grid, 11, 10, 15, 14, '#');

    // 中立城市
    grid[6][2] = 'o'; grid[7][3] = 'o';
  } else if (cfg.id === 'tm2') {
    // 30x30: 琉球群島・沖繩海槽
    // 我方西南島鏈前沿 (石垣/宮古/台東)
    grid[27][6] = 'F'; // 工廠
    grid[25][4] = 'A'; // 機場
    grid[25][7] = 'P'; // 港口
    grid[25][8] = '~'; grid[24][7] = '~';
    grid[26][4] = 'b'; grid[26][6] = 'b'; grid[27][5] = 'b'; grid[26][7] = 'b';
    grid[26][5] = '=';

    // 中央沖繩本島 (那霸/嘉手納中立據點，海空激戰區)
    grid[16][14] = 'o'; // 那霸市
    grid[16][15] = 'a'; // 嘉手納機場
    grid[15][14] = 'p'; // 白灘港
    grid[15][13] = '~'; grid[14][14] = '~';
    grid[15][15] = 'g'; // 沖繩工廠
    grid[13][17] = 'o'; // 名護市
    grid[14][16] = '='; grid[15][16] = '=';

    // 東北奄美大島 (敵軍前進基地)
    grid[4][23] = 'G'; // 敵工廠
    grid[2][25] = 'Z'; // 敵機場
    grid[2][23] = 'Q'; // 敵港口
    grid[2][22] = '~'; grid[1][23] = '~';
    grid[4][24] = 'r'; grid[3][25] = 'r'; grid[3][23] = 'r'; grid[4][25] = 'r';
    grid[3][24] = '=';

    // 跳島海橋通道
    connectHex(grid, 7, 25, 15, 14, '#');
    connectHex(grid, 15, 14, 23, 3, '#');

    // 外圍中立島嶼
    grid[20][11] = 'o'; grid[20][10] = 'p'; grid[20][9] = '~';
    grid[10][21] = 'o'; grid[10][20] = 'a';
  } else if (cfg.id === 'tm3') {
    // 40x40: 對馬海峽・朝鮮海峽
    // 我方東南基地 (北九州/博多/佐世保)
    grid[36][9] = 'F';  // 第一工廠
    grid[37][11] = 'F'; // 第二工廠
    grid[35][8] = 'A';  // 機場
    grid[35][12] = 'P'; // 港口
    grid[35][13] = '~'; grid[34][12] = '~';
    grid[37][7] = 'P';  // 佐世保軍港
    grid[37][6] = '~';
    grid[37][10] = 'b'; grid[36][10] = 'b'; grid[36][11] = 'b'; grid[36][8] = 'b'; grid[35][10] = 'b'; grid[36][12] = 'b';
    grid[36][9] = '='; grid[35][9] = '=';

    // 中央對馬島 (海峽鐵鎖要塞)
    grid[20][20] = 'o'; // 嚴原港城
    grid[20][21] = 'a'; // 對馬前進機場
    grid[21][19] = 'p'; // 對馬軍港
    grid[21][18] = '~'; grid[22][19] = '~';
    grid[19][20] = 'g'; // 對馬要塞工廠
    grid[20][19] = '=';

    // 壹岐島
    grid[27][17] = 'o'; grid[27][16] = 'p'; grid[27][15] = '~';

    // 敵方西北基地 (釜山/昌原/蔚山重工業走廊)
    grid[3][31] = 'G';  // 敵重裝工廠
    grid[5][33] = 'G';  // 敵第二工廠
    grid[4][30] = 'Z';  // 敵戰術機場
    grid[3][34] = 'Z';  // 敵遠程機場
    grid[6][29] = 'Q';  // 釜山軍港
    grid[6][28] = '~'; grid[7][29] = '~';
    grid[5][35] = 'Q';  // 鎮海港
    grid[5][36] = '~';
    grid[3][32] = 'r'; grid[5][31] = 'r'; grid[4][33] = 'r'; grid[5][30] = 'r'; grid[5][32] = 'r'; grid[4][34] = 'r';
    grid[4][31] = '='; grid[4][32] = '=';

    // 六角格海峽大橋通道 (九州-壹岐-對馬-釜山)
    connectHex(grid, 35, 12, 27, 16, '#');
    connectHex(grid, 27, 16, 21, 19, '#');
    connectHex(grid, 21, 19, 29, 6, '#');

    // 中立走廊城市
    grid[12][25] = 'o'; grid[13][26] = 'a';
    grid[30][15] = 'o'; grid[31][14] = 'g'; grid[32][14] = 'a';
  }

  // 確保所有部隊出生格地面/水面型別正確
  const fixTileForUnit = (type, x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    if (type === 'destroyer') {
      if (grid[y][x] !== '~') grid[y][x] = '~';
    } else {
      // 陸上/航空部隊必須在可通行地面或據點
      if (grid[y][x] === '~' || grid[y][x] === 'M') grid[y][x] = '.';
    }
  };

  // 4. 配置雙方兵力 (Units)
  let units = [];
  if (cfg.id === 'tm1') {
    units = [
      // 我方部隊 (台灣本島西南，確保全在平原/據點)
      [0, 'inf', 16, 16], [0, 'inf', 17, 17], [0, 'inf', 15, 18], [0, 'marine', 14, 16],
      [0, 'tank', 17, 16], [0, 'tank', 16, 15], [0, 'tank', 15, 17],
      [0, 'arty', 18, 17], [0, 'aa', 16, 18], [0, 'fighter', 15, 15],
      // 敵方部隊 (海峽西岸)
      [1, 'inf', 3, 3], [1, 'inf', 2, 2], [1, 'marine', 4, 3],
      [1, 'tank', 3, 1], [1, 'tank', 2, 3], [1, 'recon', 2, 1]
    ];
  } else if (cfg.id === 'tm2') {
    units = [
      // 我方部隊 (西南島弧)
      [0, 'inf', 5, 27], [0, 'inf', 6, 26], [0, 'marine', 7, 26], [0, 'marine', 6, 25], [0, 'atinf', 4, 26],
      [0, 'tank', 6, 28], [0, 'tank', 5, 28], [0, 'tank', 7, 27],
      [0, 'arty', 4, 27], [0, 'aa', 5, 25], [0, 'sam', 6, 27],
      [0, 'fighter', 4, 25], [0, 'attacker', 5, 24], [0, 'destroyer', 9, 25],
      // 敵方部隊 (東北奄美群島)
      [1, 'inf', 24, 4], [1, 'inf', 23, 3], [1, 'marine', 23, 4], [1, 'marine', 24, 2], [1, 'atinf', 25, 4],
      [1, 'tank', 25, 3], [1, 'tank', 26, 4], [1, 'tank', 24, 5],
      [1, 'arty', 25, 5], [1, 'aa', 23, 2], [1, 'sam', 22, 3],
      [1, 'fighter', 25, 2], [1, 'attacker', 26, 3], [1, 'destroyer', 21, 2]
    ];
  } else if (cfg.id === 'tm3') {
    units = [
      // 我方部隊 (東南九州基地)
      [0, 'inf', 10, 37], [0, 'inf', 9, 37], [0, 'inf', 11, 36], [0, 'marine', 12, 36], [0, 'marine', 8, 36], [0, 'atinf', 9, 35],
      [0, 'tank', 10, 38], [0, 'tank', 11, 38], [0, 'tank', 9, 38], [0, 'tank', 10, 35], [0, 'recon', 8, 37],
      [0, 'arty', 12, 37], [0, 'arty', 10, 39], [0, 'rocket', 11, 39],
      [0, 'aa', 9, 36], [0, 'sam', 8, 35], [0, 'fighter', 7, 35], [0, 'destroyer', 14, 35],
      // 敵方部隊 (西北釜山/昌原縱深)
      [1, 'inf', 32, 3], [1, 'inf', 31, 5], [1, 'inf', 33, 4], [1, 'marine', 30, 5], [1, 'marine', 34, 4], [1, 'atinf', 32, 5],
      [1, 'tank', 33, 3], [1, 'tank', 31, 4], [1, 'tank', 32, 2], [1, 'tank', 35, 2], [1, 'tank', 29, 4], [1, 'tank', 32, 1],
      [1, 'tank', 31, 6], [1, 'recon', 32, 6],
      [1, 'arty', 34, 2], [1, 'arty', 30, 3], [1, 'rocket', 33, 1],
      [1, 'aa', 31, 3], [1, 'sam', 35, 4], [1, 'fighter', 30, 4], [1, 'fighter', 34, 3], [1, 'bomber', 29, 5],
      [1, 'destroyer', 27, 6], [1, 'destroyer', 37, 5]
    ];
  }

  // 確保部隊位置地塊絕對有效且不重疊
  for (const u of units) {
    fixTileForUnit(u[1], u[2], u[3]);
  }

  // 重新確保關鍵設施字元不被覆蓋
  grid[hqPlayer[1]][hqPlayer[0]] = 'H';
  grid[hqEnemy[1]][hqEnemy[0]] = 'X';

  // 轉為每列字串陣列
  const mapRows = grid.map(row => row.join(''));

  return {
    camp: 'tm',
    chapter: cfg.chapter,
    title: cfg.title,
    place: `${cfg.geoRegion} (${w}×${h})`,
    geoRegion: cfg.geoRegion,
    geoCoords: cfg.geoCoords,
    geoBounds: cfg.bounds,
    tierBadge: cfg.tierBadge,
    tierColor: cfg.tierColor,
    map: mapRows,
    funds: cfg.funds,
    units,
    win: [
      { id: 'hq', type: 'capture', at: hqEnemy, text: '佔領敵方首都' },
      { id: 'all', type: 'destroyAll', text: '或殲滅全數敵軍' }
    ],
    lose: [{ type: 'hq', text: '我方首都失守' }],
    next: cfg.id === 'tm1' ? "r => ({ to: 'tm2', flags: {}, note: '初階海峽告捷，進軍群島中階戰區！' })"
        : cfg.id === 'tm2' ? "r => ({ to: 'tm3', flags: {}, note: '群島戰役大勝，直指高階海峽鐵鎖！' })"
        : "r => ({ to: 'tm_end', flags: {}, note: '海峽鐵鎖全線突破，完成東亞全梯次演練！' })",
    briefing: cfg.briefing
  };
}

// 格式化為 JavaScript 原始碼
function formatMissionJS(m) {
  const mapStr = '[\n' + m.map.map(r => `    ${JSON.stringify(r)}`).join(',\n') + '\n  ]';
  const unitsStr = '[\n' + m.units.map(u => `    [${u[0]}, ${JSON.stringify(u[1])}, ${u[2]}, ${u[3]}]`).join(',\n') + '\n  ]';
  return `MISSIONS.${m.camp}${m.chapter.includes('初階') ? '1' : m.chapter.includes('中階') ? '2' : '3'} = {
  camp: '${m.camp}', chapter: '${m.chapter}', title: '${m.title}', place: '${m.place}',
  geoRegion: '${m.geoRegion}', geoCoords: '${m.geoCoords}',
  tierBadge: '${m.tierBadge}', tierColor: '${m.tierColor}',
  map: ${mapStr},
  funds: [${m.funds.join(', ')}],
  units: ${unitsStr},
  win: [{ id: 'hq', type: 'capture', at: [${m.win[0].at.join(', ')}], text: '佔領敵方首都' }, { id: 'all', type: 'destroyAll', text: '或殲滅全數敵軍' }],
  lose: [{ type: 'hq', text: '我方首都失守' }],
  next: ${m.next},
  briefing: () => [['旁白', '${m.briefing}']],
};`;
}

// 主程式
function main() {
  const args = process.argv.slice(2);
  const doApply = args.includes('--apply');
  const doAnalyze = args.includes('--analyze');

  console.log('=== 東亞地理戰區地圖生成管線 (East Asia Geo Pipeline) ===');
  const generated = {};
  for (const [id, cfg] of Object.entries(THEATERS)) {
    const m = generateTheaterMap(cfg);
    generated[id] = m;
    console.log(`[生成完畢] ${m.chapter}・${m.title} -> ${m.geoRegion} [${m.geoCoords}] (${cfg.w}×${cfg.h})`);
  }

  if (doApply) {
    const campPath = path.join(__dirname, '..', 'docs', 'js', 'campaign.js');
    let campContent = fs.readFileSync(campPath, 'utf8');

    // 替換 MISSIONS.tm1, MISSIONS.tm2, MISSIONS.tm3
    const tm1Code = formatMissionJS(generated.tm1);
    const tm2Code = formatMissionJS(generated.tm2);
    const tm3Code = formatMissionJS(generated.tm3);

    // 用正規表達式替換舊的 tm1~tm3
    const tmBlockRegex = /MISSIONS\.tm1\s*=\s*\{[\s\S]*?\n\};\s*\n\s*MISSIONS\.tm2\s*=\s*\{[\s\S]*?\n\};\s*\n\s*MISSIONS\.tm3\s*=\s*\{[\s\S]*?\n\};/;
    if (!tmBlockRegex.test(campContent)) {
      console.error('錯誤：在 campaign.js 中找不到 tm1~tm3 的定義區塊');
      process.exit(1);
    }
    const newBlock = `${tm1Code}\n\n${tm2Code}\n\n${tm3Code}`;
    campContent = campContent.replace(tmBlockRegex, newBlock);
    fs.writeFileSync(campPath, campContent, 'utf8');
    console.log('[成功套用] 已將東亞地理戰區地圖更新至 docs/js/campaign.js');
  }

  if (doAnalyze) {
    console.log('\n直通地圖分析器 (tools/balance.js --analyze --runs 1 tm1 tm2 tm3)...');
    const balRes = spawnSync(process.execPath, [
      path.join(__dirname, 'balance.js'),
      'tm1', 'tm2', 'tm3',
      '--analyze',
      '--runs', '1'
    ], { stdio: 'inherit' });
    if (balRes.status !== 0) {
      console.error('地圖分析失敗，回傳碼：', balRes.status);
      process.exit(balRes.status || 1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { THEATERS, generateTheaterMap, formatMissionJS };
