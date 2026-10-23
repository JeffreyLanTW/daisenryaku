#!/usr/bin/env node
// 大地圖產生工具：用經緯度的海岸線多邊形、山脈線、道路與據點畫出任務地圖字串。
// 用法：node tools/mapgen.js <地圖名稱>         印出可貼進任務資料的 map 陣列
//       node tools/mapgen.js <地圖名稱> --view  印出附座標的預覽與據點座標表
'use strict';

// 六角格（尖頂、奇數列右移）中心的平面座標：欄寬 1、列距 √3/2
const RY = Math.sqrt(3) / 2;
const center = (x, y) => [x + 0.5 * (y & 1) + 0.5, y * RY + 0.5];
const NB_EVEN = [[1, 0], [-1, 0], [0, -1], [-1, -1], [0, 1], [-1, 1]];
const NB_ODD = [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]];
const neighbors = (x, y, w, h) => ((y & 1) ? NB_ODD : NB_EVEN).map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < w && b < h);

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 點到折線的距離
function distLine(px, py, line) {
  let best = Infinity;
  for (let k = 0; k + 1 < line.length; k++) {
    const [ax, ay] = line[k], [bx, by] = line[k + 1], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
}
// 固定雜訊（同一張地圖每次產生結果相同）
const noise = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

function draw(S) {
  const { w, h } = S, [lon0, lon1] = S.lon, [lat0, lat1] = S.lat;
  const uw = w + 0.5, uh = (h - 1) * RY + 1;
  // 經緯度 → 平面座標
  const P = ([lon, lat]) => [(lon - lon0) / (lon1 - lon0) * uw, (lat1 - lat) / (lat1 - lat0) * uh];
  const tiles = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push([x, y, ...center(x, y)]);
  const g = Array.from({ length: h }, () => new Array(w).fill('~'));
  const nearestTile = (px, py, ok = () => true) => {
    let best = null, bd = Infinity;
    for (const [x, y, cx, cy] of tiles) { const d = Math.hypot(cx - px, cy - py); if (d < bd && ok(x, y)) { bd = d; best = [x, y]; } }
    return best;
  };
  // 陸地
  for (const poly of S.land) {
    const pp = poly.map(P);
    let any = false;
    for (const [x, y, cx, cy] of tiles) if (inPoly(cx, cy, pp)) { g[y][x] = '.'; any = true; }
    // 小島至少保留一格
    if (!any) {
      const c = pp.reduce((a, p) => [a[0] + p[0] / pp.length, a[1] + p[1] / pp.length], [0, 0]);
      const t = nearestTile(c[0], c[1]);
      g[t[1]][t[0]] = '.';
    }
  }
  const isLand = (x, y) => g[y][x] !== '~';
  // 山脈：中心 M、外圍丘陵，丘陵帶夾雜森林
  for (const r of S.ridges || []) {
    const line = r.line.map(P);
    for (const [x, y, cx, cy] of tiles) {
      if (!isLand(x, y)) continue;
      const d = distLine(cx, cy, line), n = noise(x, y, 1);
      if (r.m && d <= r.m + (n - 0.5) * 0.6) g[y][x] = 'M';
      else if (d <= r.hill + (n - 0.5) * 0.8 && g[y][x] !== 'M') g[y][x] = n < (r.forest || 0.3) ? 'f' : '^';
    }
  }
  // 森林區
  for (const [pt, rad] of S.forests || []) {
    const [px, py] = P(pt);
    for (const [x, y, cx, cy] of tiles) if (g[y][x] === '.' && Math.hypot(cx - px, cy - py) <= rad && noise(x, y, 2) < 0.6) g[y][x] = 'f';
  }
  // 平原上零星的森林
  for (const [x, y] of tiles) if (g[y][x] === '.' && noise(x, y, 3) < (S.scatter ?? 0.08)) g[y][x] = 'f';
  // 據點：海港會移到最近的臨海陸地格
  const places = {};
  const coastal = (x, y) => isLand(x, y) && neighbors(x, y, w, h).some(([a, b]) => g[b][a] === '~');
  for (const [name, [lon, lat, ch]] of Object.entries(S.places)) {
    const [px, py] = P([lon, lat]);
    const port = 'PQp'.includes(ch);
    const t = nearestTile(px, py, (x, y) => (port ? coastal(x, y) : isLand(x, y)) && !Object.values(places).some(p => p[0] === x && p[1] === y));
    places[name] = [t[0], t[1], ch];
  }
  // 道路：沿折線取樣，經過的陸地格畫成道路（據點保留）
  const propAt = (x, y) => Object.values(places).some(p => p[0] === x && p[1] === y);
  for (const road of S.roads || []) {
    const pts = road.map(p => typeof p === 'string' ? (() => { const [x, y] = places[p]; return center(x, y); })() : P(p));
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.15);
      for (let s = 0; s <= n; s++) {
        const px = ax + (bx - ax) * s / n, py = ay + (by - ay) * s / n;
        const [x, y] = nearestTile(px, py);
        if (isLand(x, y) && !propAt(x, y)) g[y][x] = '=';
      }
    }
  }
  for (const [x, y, ch] of Object.values(places)) g[y][x] = ch;
  return { rows: g.map(r => r.join('')), places };
}

module.exports = { draw };

if (require.main === module) {
  const name = process.argv[2], S = require('./maps.js')[name];
  if (!S) { console.error('可用地圖：' + Object.keys(require('./maps.js')).join(', ')); process.exit(1); }
  const { rows, places } = draw(S);
  if (process.argv.includes('--view')) {
    const tens = rows[0].split('').map((_, x) => x % 10 === 0 ? String(x / 10) : ' ').join('');
    const ones = rows[0].split('').map((_, x) => x % 10).join('');
    console.log('    ' + tens + '\n    ' + ones);
    rows.forEach((r, y) => console.log(String(y).padStart(2) + (y & 1 ? '  ' : ' ') + r.split('').join('')));
    console.log('\n' + Object.entries(places).map(([k, [x, y, c]]) => `${k} ${c} [${x}, ${y}]`).join('\n'));
  } else {
    console.log('    map: [\n' + rows.map(r => `      '${r}',`).join('\n') + '\n    ],');
  }
}
