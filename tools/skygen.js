#!/usr/bin/env node
// 劇情「昇龍 2031」產生器：以真實經緯度畫出六張逐章變大的地圖，
// 部隊、目標與事件都用經緯度或地名指定，輸出 docs/js/campaign_sky.js。
// 用法：node tools/skygen.js          產生劇情檔
//       node tools/skygen.js --view s3 預覽某章地圖與地名座標
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { draw } = require('./mapgen.js');
const G0 = require('./maps.js');

// ----- 共用地理資料（取自 tools/maps.js 的海岸線，另補細部地名） -----
const geoSrc = fs.readFileSync(path.join(__dirname, 'maps.js'), 'utf8');
const geo = {};
vm.runInNewContext(geoSrc.replace(/module\.exports[\s\S]*$/, '') + '\nglobalThis.OUT = { TAIWAN, MAINLAND, KINMEN, MATSU, PENGHU, PINGTAN, GREEN, ORCHID, YONAGUNI, ISHIGAKI, IRIOMOTE, MIYAKO, CENTRAL, SHUESHAN, COASTAL, WUYI };', geo);
const { TAIWAN, MAINLAND, KINMEN, PENGHU, PINGTAN, YONAGUNI, ISHIGAKI, IRIOMOTE, MIYAKO, CENTRAL, SHUESHAN, COASTAL, WUYI } = geo.OUT;

// 依欄列數與經度範圍算出緯度範圍（六角格不變形；cos 緯度修正）
const RY = Math.sqrt(3) / 2;
function bounds(w, h, lon, latMid) {
  const span = (lon[1] - lon[0]) * Math.cos(latMid * Math.PI / 180) * ((h - 1) * RY + 1) / (w + 0.5);
  return { w, h, lon, lat: [+(latMid - span / 2).toFixed(3), +(latMid + span / 2).toFixed(3)] };
}

const MAPS = {
  // 一：花蓮（22×14）
  s1: {
    ...bounds(22, 14, [121.12, 122.02], 23.97), scatter: 0.07,
    land: [TAIWAN],
    ridges: [{ ...CENTRAL, m: 3.2, hill: 5.6 }, { ...COASTAL, hill: 1.2, forest: 0.5 }],
    places: {
      花蓮: [121.60, 23.98, 'H'], 花蓮港: [121.63, 24.00, 'P'], 佳山基地: [121.61, 24.04, 'A'], 新城: [121.64, 24.12, 'b'],
      吉安: [121.57, 23.95, 'b'], 壽豐: [121.51, 23.87, 'b'], 鳳林: [121.45, 23.75, 'F'], 鹽寮: [121.60, 23.90, 'b'],
    },
    roads: [['新城', '佳山基地', '花蓮', '吉安', '壽豐', '鳳林'], ['花蓮', '花蓮港'], ['吉安', '鹽寮']],
  },
  // 二：嘉南平原（26×16）
  s2: {
    ...bounds(26, 16, [119.92, 121.02], 23.12), scatter: 0.06,
    land: [TAIWAN],
    ridges: [{ ...CENTRAL, m: 2.2, hill: 5.0 }],
    places: {
      玉井: [120.46, 23.12, 'H'], 新化: [120.31, 23.04, 'b'], 善化: [120.30, 23.13, 'F'], 白河: [120.42, 23.35, 'b'], 歸仁基地: [120.29, 22.97, 'A'],
      台南: [120.20, 23.00, 'r'], 佳里: [120.18, 23.17, 'r'], 麻豆: [120.25, 23.18, 'r'], 新營: [120.31, 23.31, 'o'],
      安平港: [120.16, 22.99, 'Q'], 台南機場: [120.21, 22.95, 'Z'], 七股: [120.10, 23.12, 'G'],
    },
    roads: [['白河', '新營', '麻豆', '善化', '新化', '歸仁基地'], ['玉井', '善化'], ['玉井', '新化', '台南', '安平港'], ['麻豆', '佳里', '七股'], ['台南', '台南機場'], ['佳里', '台南']],
  },
  // 三：台中（30×19）
  s3: {
    ...bounds(30, 19, [119.95, 121.20], 24.17), scatter: 0.06,
    land: [TAIWAN],
    ridges: [{ ...CENTRAL, m: 2.4, hill: 4.6 }, { ...SHUESHAN, m: 1.6, hill: 3.4 }],
    places: {
      台中: [120.68, 24.15, 'H'], 豐原: [120.72, 24.25, 'F'], 清泉崗: [120.62, 24.27, 'A'], 台中港: [120.52, 24.28, 'P'],
      大甲: [120.62, 24.35, 'b'], 彰化: [120.55, 24.07, 'b'], 鹿港: [120.43, 24.06, 'b'], 南投: [120.68, 23.91, 'b'], 員林: [120.57, 23.96, 'b'],
      苗栗: [120.82, 24.56, 'b'], 通霄: [120.68, 24.49, 'o'],
    },
    roads: [['苗栗', '通霄', '大甲', '清泉崗', '台中', '彰化', '員林'], ['台中', '豐原', '大甲'], ['台中港', '清泉崗'], ['彰化', '鹿港'], ['台中', '南投', '員林']],
  },
  // 四：台灣海峽中段（46×30）
  s4: {
    ...bounds(46, 30, [117.75, 121.05], 24.05), scatter: 0.06,
    land: [TAIWAN, MAINLAND, KINMEN, PENGHU],
    ridges: [{ ...CENTRAL, m: 1.5, hill: 3.1 }, { ...SHUESHAN, m: 1.0, hill: 2.3 }, { ...WUYI, m: 1.3, hill: 3.1 }],
    places: {
      台中: [120.68, 24.15, 'H'], 清泉崗: [120.62, 24.30, 'A'], 台中港: [120.50, 24.27, 'P'], 彰化: [120.54, 24.05, 'b'], 嘉義: [120.45, 23.48, 'b'],
      雲林: [120.40, 23.70, 'F'], 新竹: [120.97, 24.80, 'b'], 布袋: [120.16, 23.38, 'b'],
      馬公: [119.57, 23.57, 'Q'], 澎湖機場: [119.63, 23.60, 'Z'], 金門: [118.38, 24.45, 'r'],
      廈門: [118.10, 24.50, 'X'], 廈門港: [118.06, 24.44, 'Q'], 漳州: [117.82, 24.42, 'G'], 晉江: [118.55, 24.72, 'Z'], 泉州: [118.62, 24.88, 'r'], 漳浦: [117.85, 24.12, 'r'],
    },
    roads: [['新竹', '清泉崗', '台中', '彰化', '雲林', '嘉義', '布袋'], ['台中', '台中港'], ['漳浦', '漳州', '廈門', '晉江', '泉州'], ['廈門', '廈門港']],
  },
  // 五：台灣與先島群島（56×42）
  s5: {
    ...bounds(56, 42, [118.35, 125.55], 23.75), scatter: 0.05,
    land: [TAIWAN, MAINLAND, KINMEN, PENGHU, PINGTAN, YONAGUNI, ISHIGAKI, IRIOMOTE, MIYAKO],
    ridges: [{ ...CENTRAL, m: 1.1, hill: 2.3 }, { ...WUYI, m: 1.1, hill: 2.5 }],
    places: {
      台北: [121.52, 25.04, 'H'], 基隆: [121.74, 25.13, 'P'], 新竹: [120.97, 24.80, 'A'], 台中: [120.68, 24.15, 'F'], 嘉義: [120.42, 23.45, 'A'],
      高雄: [120.28, 22.60, 'P'], 屏東: [120.60, 22.45, 'b'], 台東: [121.14, 22.76, 'A'], 花蓮: [121.60, 23.98, 'A'], 宜蘭: [121.75, 24.72, 'b'], 馬公: [119.57, 23.57, 'P'],
      與那國: [123.00, 24.46, 'a'], 石垣: [124.18, 24.42, 'a'], 宮古: [125.30, 24.80, 'a'],
      泉州: [118.62, 24.90, 'X'], 晉江: [118.56, 24.76, 'Z'], 湄洲: [118.98, 25.06, 'Q'], 莆田: [119.02, 25.36, 'Z'], 金門: [118.40, 24.45, 'r'],
    },
    roads: [['基隆', '台北', '新竹', '台中', '嘉義', '高雄', '屏東'], ['屏東', '台東', '花蓮', '宜蘭', '台北'], ['泉州', '晉江'], ['泉州', '湄洲', '莆田']],
  },
  // 六：台灣海峽全域（64×64：在「台海制海」的地理上向南、向東延伸到高屏與花東）
  s6: {
    ...G0.strait, ...bounds(64, 64, [117.2, 122.4], 24.3),
    ridges: [{ ...CENTRAL, m: 1.4, hill: 3.0 }, { ...SHUESHAN, m: 0.9, hill: 2.1 }, { ...WUYI, m: 1.3, hill: 3.0 }, { ...COASTAL, hill: 0.9, forest: 0.5 }],
    places: { ...G0.strait.places,
      台南: [120.20, 23.00, 'b'], 高雄: [120.28, 22.62, 'P'], 岡山: [120.30, 22.78, 'A'], 屏東: [120.50, 22.67, 'b'],
      宜蘭: [121.75, 24.72, 'b'], 花蓮: [121.60, 23.98, 'A'], 花蓮港: [121.63, 24.02, 'P'], 台東: [121.14, 22.76, 'b'], 汕頭: [117.30, 23.40, 'r'], 東山: [117.45, 23.72, 'Q'] },
    roads: [...G0.strait.roads, ['嘉義', '台南', '岡山', '高雄', '屏東'], ['台北', '宜蘭', '花蓮', '台東'], ['花蓮', '花蓮港'], ['漳浦', '東山', '汕頭']],
  },
};

// ----- 把經緯度／地名轉成格子 -----
const dataSrc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'js', 'data.js'), 'utf8');
const D = { console, Math, JSON, Object, Array, Set, Map, localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(D);
vm.runInContext(dataSrc + '\nglobalThis.OUT = { BASE_UNITS, TERRAIN };', D);
const { BASE_UNITS, TERRAIN } = D.OUT;
const LEG = { '.': 'plain', f: 'forest', '^': 'hills', M: 'mountain', '~': 'sea', '=': 'road', '#': 'bridge', o: 'city', b: 'city', r: 'city', H: 'capital', X: 'capital',
  F: 'factory', G: 'factory', g: 'factory', A: 'airport', Z: 'airport', a: 'airport', P: 'port', Q: 'port', p: 'port' };

function build(id) {
  const S = MAPS[id], { rows, places } = draw(S), w = S.w, h = S.h;
  const uw = w + 0.5, uh = (h - 1) * RY + 1;
  const P = ([lon, lat]) => [(lon - S.lon[0]) / (S.lon[1] - S.lon[0]) * uw, (S.lat[1] - lat) / (S.lat[1] - S.lat[0]) * uh];
  const center = (x, y) => [x + 0.5 * (y & 1) + 0.5, y * RY + 0.5];
  const taken = new Set();
  // 最近的可站立空格（依兵種移動方式）
  const tile = (pos, base, reserve = true) => {
    const [px, py] = typeof pos === 'string' ? center(places[pos][0], places[pos][1]) : P(pos);
    const mt = base ? BASE_UNITS[base].mt : null;
    let best = null, bd = Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mt && (TERRAIN[LEG[rows[y][x]]].cost[mt] === undefined || taken.has(y * w + x))) continue;
      const [cx, cy] = center(x, y), d = Math.hypot(cx - px, cy - py);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) throw new Error(`${id}: 找不到 ${base} 的位置 ${JSON.stringify(pos)}`);
    if (mt && reserve) taken.add(best[1] * w + best[0]);
    return best;
  };
  const at = name => { if (!places[name]) throw new Error(`${id}: 沒有地名 ${name}`); return [places[name][0], places[name][1]]; };
  const unit = ([side, type, pos, extra]) => { const [x, y] = tile(pos, type); return extra ? [side, type, x, y, extra] : [side, type, x, y]; };
  const spawn = ([side, type, pos, extra]) => { const [x, y] = tile(pos, type, false); return extra ? [side, type, x, y, extra] : [side, type, x, y]; };
  return { S, rows, places, at, unit, spawn, tile };
}

if (process.argv.includes('--view')) {
  const id = process.argv[process.argv.indexOf('--view') + 1] || 's1';
  const { rows, places, S } = build(id);
  console.log(`${id} ${S.w}×${S.h} lon ${S.lon} lat ${S.lat}`);
  rows.forEach((r, y) => console.log(String(y).padStart(2) + (y & 1 ? '  ' : ' ') + r.split('').join(' ')));
  console.log(Object.entries(places).map(([k, [x, y, c]]) => `${k}${c}[${x},${y}]`).join(' '));
  process.exit(0);
}

// ----- 任務內容（位置以 [經度, 緯度] 或地名指定） -----
const js = v => JSON.stringify(v);
const U = (b, list) => list.map(b.unit).map(js).join(', ');
const EV = (b, evs) => evs.map(e => `      { turn: ${e.turn}, ${e.when ? `when: ${e.when}, ` : ''}lines: ${js(e.lines)}${e.spawn ? `, spawn: [${e.spawn.map(b.spawn).map(js).join(', ')}]` : ''} },`).join('\n');
const MAPJS = b => `    map: [\n${b.rows.map(r => `      '${r}',`).join('\n')}\n    ],`;
const GEO = (b, region) => `    geo: { lon: ${js(b.S.lon)}, lat: ${js(b.S.lat)} }, geoRegion: '${region}', geoCoords: '${b.S.lat[0].toFixed(1)}°N–${b.S.lat[1].toFixed(1)}°N, ${b.S.lon[0].toFixed(1)}°E–${b.S.lon[1].toFixed(1)}°E',\n    placeNames: ${js(Object.entries(b.places).map(([n, [x, y]]) => [x, y, n]))},`;

const b1 = build('s1'), b2 = build('s2'), b3 = build('s3'), b4 = build('s4'), b5 = build('s5'), b6 = build('s6');

const out = `'use strict';
// ===== 劇情：昇龍 2031（六個時刻）=====
// 本檔由 tools/skygen.js 產生：地圖取自真實經緯度，逐章變大（22×14 → 64×64）。請修改產生器後重新產生，不要手改。

Object.assign(SPEAKERS, {
  '旁白':       { title: '', color: '#55606c', icon: '◆', portrait: 'narrator' },
  '周上將':     { title: '參謀總長', color: '#b45309', icon: '周', portrait: 'chou' },
  '林上校':     { title: '前線指揮官', color: '#15803d', icon: '林', portrait: 'lin' },
  '陳士官長':   { title: '機步營・老兵', color: '#a16207', icon: '陳', portrait: 'chen' },
  '許中尉':     { title: '空軍飛行員', color: '#0e7490', icon: '許', portrait: 'hsu' },
  '哈里斯上將': { title: '美軍印太司令', color: '#2563eb', icon: '美', portrait: 'harris' },
  '佐藤一佐':   { title: '海上自衛隊', color: '#e2e8f0', icon: '日', portrait: 'sato' },
  '王記者':     { title: '戰地記者', color: '#7c3aed', icon: '王', portrait: 'wang' },
  '敵軍指揮官': { title: '東部戰區', color: '#b91c1c', icon: '敵', portrait: 'enemy' },
});

Object.assign(MISSIONS, {
  // ---------------- 第一章：按兵不動（花蓮，22×14） ----------------
  s1: {
    camp: 'sky', chapter: '第一章・2031 春', title: '按兵不動', place: '花蓮',
${GEO(b1, '台灣東岸・花蓮')}
${MAPJS(b1)}
    funds: [1500, 0],
    horde: 0.6,
    units: [
      ${U(b1, [
        [0, 'aa', '花蓮', { vip: true, maxHp: 12, hp: 12 }], [0, 'inf', '花蓮港'], [0, 'inf', '新城'], [0, 'inf', '吉安'], [0, 'atinf', '鹽寮'], [0, 'inf', '壽豐'],
        [0, 'sam', [121.56, 23.99]], [0, 'aa', '佳山基地'], [0, 'arty', [121.55, 23.93]], [0, 'tank', [121.58, 24.02]], [0, 'fighter', [121.60, 24.06]],
        [1, 'lst', [121.74, 24.02], { load: ['marine', 'tank'] }], [1, 'destroyer', [121.80, 23.95]], [1, 'destroyer', [121.80, 24.10]],
        [1, 'marine', [121.68, 24.12]], [1, 'marine', [121.66, 23.90]], [1, 'fighter', [121.95, 24.05]], [1, 'attacker', [121.92, 23.95]],
        [1, 'heli', [121.85, 24.15]], [1, 'lst', [121.78, 23.86], { load: ['inf', 'inf'] }], [1, 'frigate', [121.90, 23.85]],
      ])},
    ],
    briefing: () => [
      ['旁白', '2031 年春天，對岸宣布在台灣東部外海舉行「聯合演訓」。三天後，演訓變成了封鎖。'],
      ['周上將', '指揮官，我先把話說清楚：現在的我們打不贏一場正面決戰。能做的只有一件事——活下來。'],
      ['林上校', '我的部隊都藏在山腳和市區裡。敵人的船和飛機比我們多，離開掩護就是送死。'],
      ['陳士官長', '報告，弟兄們手很癢，但我會盯著他們。該躲的時候躲，這不丟臉。'],
      ['周上將', '標著星號的那輛是機動指揮車，整個東部的通訊都靠它。它沒了，我們就瞎了。守到第 8 回合，封鎖線自己會鬆。'],
    ],
    win: [
      { id: 'hold', type: 'survive', turn: 8, text: '守住花蓮到第 8 回合結束' },
      { id: 'hold', type: 'destroyAll', text: '或擊退所有登陸的敵軍' },
    ],
    lose: [
      { type: 'hq', text: '花蓮指揮所失守' },
      { type: 'vip', text: '機動指揮車被摧毀' },
      { type: 'loseCount', tiles: ${js([b1.at('花蓮港'), b1.at('新城'), b1.at('吉安'), b1.at('鹽寮')])}, max: 3, text: '沿海據點失守三處' },
    ],
    bonus: [{ type: 'hold', at: ${js(b1.at('花蓮港'))}, flag: 'hualien', text: '結束時仍守住花蓮港（下一章多一筆經費）' }],
    events: [
${EV(b1, [
      { turn: 3, lines: [['林上校', '第二批登陸艇靠岸了！別追出去，守住路口就好。']], spawn: [[1, 'marine', [121.70, 23.97]], [1, 'lst', [121.76, 24.08], { load: ['inf', 'atinf'] }]] },
      { turn: 5, lines: [['許中尉', '志航基地起飛，兩分鐘後到。地面的各位，頭低一點。'], ['周上將', '蘇澳的艦艇也到了。']], spawn: [[0, 'destroyer', [121.75, 24.18]], [0, 'attacker', [121.50, 23.80]]] },
      { turn: 7, lines: [['陳士官長', '他們的補給船三天沒來了。再撐一下，換他們難受。']] },
    ])}
    ],
    next: () => ({ to: 's2', note: '花蓮守住了，封鎖線開始鬆動。但敵軍的空降部隊已經落在嘉南平原，佔了三座城鎮。' }),
  },

  // ---------------- 第二章：走出山區（嘉南平原，26×16） ----------------
  s2: {
    camp: 'sky', chapter: '第二章・2031 夏', title: '走出山區', place: '嘉南平原',
    allies: ['US'],
${GEO(b2, '台灣西南・嘉南平原')}
${MAPJS(b2)}
    funds: f => [f.hualien ? 2600 : 2000, 2400],
    horde: 0.5,
    units: [
      ${U(b2, [
        [0, 'inf', '玉井'], [0, 'inf', '新化'], [0, 'inf', '善化'], [0, 'recon', [120.38, 23.10]], [0, 'tank', [120.36, 23.06]], [0, 'arty', [120.42, 23.08]],
        [0, 'heli', '歸仁基地'], [0, 'atinf', [120.34, 23.16]], [0, 'ifv', [120.38, 23.14]], [0, 'spsam', [120.44, 23.14]],
        [1, 'marine', '台南'], [1, 'inf', '佳里'], [1, 'inf', '麻豆'], [1, 'tank', [120.24, 23.08]], [1, 'atinf', [120.22, 23.20]], [1, 'aa', [120.21, 23.03]],
        [1, 'lst', [120.06, 23.02], { load: ['tank', 'inf'] }], [1, 'destroyer', [120.02, 23.10]], [1, 'fighter', '台南機場'], [1, 'arty', [120.16, 23.10]], [1, 'specops', [120.28, 23.24]],
      ])},
    ],
    briefing: () => [
      ['周上將', '躲夠久了。敵人的空降部隊拿下了台南、佳里、麻豆，正在等海上的主力上岸。我們要趕在那之前把城鎮搶回來。'],
      ['林上校', '這是我們第一次主動進攻。平原上沒有山可以躲，戰車和砲兵要一起走，別讓步兵落單。'],
      ['哈里斯上將', '我是哈里斯。第 1 騎兵師的先遣隊已經在路上，兩個回合後到。你們不是一個人在打。'],
      ['陳士官長', '提醒一下：兩支打殘的同型部隊可以併成一支。別硬撐，併起來比較實在。'],
      ['林上校', '行有餘力的話，把安平港也拿下來。少了那個港，他們下一波登陸就沒地方卸貨。'],
    ],
    win: [{ id: 'field', type: 'captureAll', tiles: ${js([b2.at('台南'), b2.at('佳里'), b2.at('麻豆')])}, text: '奪回台南、佳里、麻豆' }],
    bonus: [{ type: 'hold', at: ${js(b2.at('安平港'))}, flag: 'offshore', text: '結束時佔領安平港（下一章少一波登陸）' }],
    lose: [{ type: 'hq', text: '玉井指揮所失守' }],
    events: [
${EV(b2, [
      { turn: 2, lines: [['哈里斯上將', '先遣隊到了。戰車、步兵，還有一架 A-10。指揮權交給你。']], spawn: [[0, 'tank', [120.55, 23.12], { ally: 'US' }], [0, 'inf', [120.55, 23.16], { ally: 'US' }], [0, 'attacker', [120.60, 23.10], { ally: 'US' }]] },
      { turn: 5, when: 'f => f.hualien', lines: [['林上校', '花蓮港的補給船隊到了，油彈都補滿。']] },
      { turn: 6, lines: [['王記者', '我是隨軍記者王志遠。佳里的居民在路邊遞水給士兵——這畫面我會讓全世界看到。']] },
    ])}
    ],
    next: () => ({ to: 's3', note: '平原收復了，盟軍也到了。敵人改變打法：不分晝夜，一波接一波衝向中部海岸。' }),
  },

  // ---------------- 第三章：日夜不休（台中，30×19） ----------------
  s3: {
    camp: 'sky', chapter: '第三章・2032 冬', title: '日夜不休', place: '台中海岸',
    night: t => t >= 3 && t % 2 === 1,
${GEO(b3, '台灣中部・台中海岸')}
${MAPJS(b3)}
    funds: [2600, 0],
    horde: 2.2,
    units: [
      ${U(b3, [
        [0, 'inf', '台中港'], [0, 'inf', '大甲'], [0, 'inf', '鹿港'], [0, 'inf', '彰化'], [0, 'atinf', [120.56, 24.20]], [0, 'tank', [120.60, 24.22]], [0, 'tank', [120.50, 24.10]],
        [0, 'arty', [120.64, 24.20]], [0, 'rocket', [120.66, 24.12]], [0, 'sam', '清泉崗'], [0, 'aa', [120.58, 24.14]], [0, 'coastal', [120.58, 24.30]], [0, 'fighter', [120.70, 24.20]], [0, 'mortar', [120.47, 24.08]],
        [1, 'lst', [120.36, 24.30], { load: ['tank', 'marine'] }], [1, 'lst', [120.30, 24.10], { load: ['inf', 'inf'] }], [1, 'destroyer', [120.25, 24.20]], [1, 'frigate', [120.22, 24.36]],
        [1, 'marine', [120.44, 24.33]], [1, 'marine', [120.36, 24.02]], [1, 'fighter', [120.05, 24.20]], [1, 'attacker', [120.05, 24.10]], [1, 'submarine', [120.15, 24.28]],
      ])},
    ],
    extra: f => f.offshore ? [] : ${js([b3.unit([1, 'lst', [120.28, 23.95], { load: ['tank', 'inf'] }])])},
    briefing: () => [
      ['周上將', '他們換了打法：白天打、晚上也打，不讓我們睡。目的很簡單——把我們耗到出錯。'],
      ['林上校', '入夜後大家都看不清楚，火力會打折，砲兵尤其吃虧。白天把該打的打掉，晚上守好就行。'],
      ['陳士官長', '我排了三班輪值。長官，你也該睡一下，這仗不是一個晚上打得完的。'],
      ['周上將', '守住沿海三個點——大甲、台中港、鹿港——撐過 12 個回合。不求漂亮，求不出錯。'],
    ],
    win: [
      { id: 'vigil', type: 'survive', turn: 12, text: '日夜固守到第 12 回合結束' },
      { id: 'vigil', type: 'destroyAll', text: '或擊退所有登陸的敵軍' },
    ],
    lose: [
      { type: 'hq', text: '台中指揮所失守' },
      { type: 'loseCount', tiles: ${js([b3.at('大甲'), b3.at('台中港'), b3.at('鹿港')])}, max: 2, text: '沿海三處失守兩處' },
    ],
    bonus: [{ type: 'hold', at: ${js(b3.at('台中港'))}, flag: 'port', text: '結束時仍守住台中港（下一章多一艘驅逐艦）' }],
    events: [
${EV(b3, [
      { turn: 3, lines: [['林上校', '天黑了，第二波上來了。照計畫，守點、不追。']], spawn: [[1, 'marine', [120.40, 24.06]], [1, 'lst', [120.34, 24.24], { load: ['inf', 'atinf'] }]] },
      { turn: 5, lines: [['許中尉', '雷達上有大型機群，是轟炸機。我們攔不了全部，港區請注意。']], spawn: [[1, 'bomber', [120.02, 24.30]], [1, 'marine', [120.46, 24.36]], [1, 'lst', [120.32, 24.00], { load: ['tank', 'marine'] }]] },
      { turn: 6, lines: [['周上將', '左營的軍艦和清泉崗的攻擊機出發了。']], spawn: [[0, 'destroyer', [120.30, 23.90]], [0, 'attacker', [120.75, 24.15]]] },
      { turn: 7, lines: [['林上校', '第三波，這次是戰車登陸艦。反裝甲組上前。']], spawn: [[1, 'lst', [120.38, 24.28], { load: ['tank', 'tank'] }], [1, 'destroyer', [120.20, 24.05]]] },
      { turn: 9, lines: [['陳士官長', '最後一波了。弟兄們，打完這場我請客。']], spawn: [[1, 'marine', [120.42, 24.18]], [1, 'marine', [120.38, 24.10]]] },
      { turn: 12, lines: [['王記者', '天快亮了。我數過，這十二個回合裡沒有一個人擅離崗位。']] },
    ])}
    ],
    next: () => ({ to: 's4', note: '敵軍的攻勢耗盡了。海峽中間出現一個空檔：可以趁機打過去，也可以穩穩守著。' }),
  },

  // ---------------- 第四章：跳，還是不跳（台灣海峽，46×30） ----------------
  s4: {
    camp: 'sky', chapter: '第四章・2032 夏', title: '跳，還是不跳', place: '台灣海峽・澎湖',
${GEO(b4, '台灣海峽中段・澎湖・廈門')}
${MAPJS(b4)}
    funds: [3000, 7000],
    horde: 3.2,
    units: [
      ${U(b4, [
        [0, 'marine', '台中港'], [0, 'marine', [120.48, 24.20]], [0, 'lst', [120.40, 24.28], { load: ['tank', 'inf'] }], [0, 'destroyer', [120.30, 24.35]], [0, 'destroyer', [120.25, 24.05]],
        [0, 'fighter', '清泉崗'], [0, 'attacker', [120.66, 24.24]], [0, 'inf', '彰化'], [0, 'inf', '嘉義'], [0, 'coastal', [120.42, 23.90]], [0, 'sam', [120.62, 24.10]], [0, 'submarine', [120.05, 24.20]],
        [1, 'destroyer', [119.35, 23.70]], [1, 'destroyer', [119.30, 24.30]], [1, 'fighter', '澎湖機場'], [1, 'tank', [118.14, 24.56]], [1, 'inf', '廈門港'], [1, 'aa', [118.16, 24.48]],
        [1, 'marine', '馬公'], [1, 'lst', [119.48, 23.62], { load: ['inf', 'tank'] }], [1, 'arty', [118.20, 24.58]], [1, 'atinf', [118.02, 24.50]], [1, 'coastal', [118.30, 24.62]], [1, 'sam', [118.24, 24.66]],
        [1, 'lst', [120.20, 24.55], { load: ['tank', 'marine'] }], [1, 'lst', [119.98, 23.55], { load: ['tank', 'marine'] }], [1, 'marine', [120.30, 23.72]], [1, 'frigate', [119.90, 24.10]],
      ])},
    ],
    extra: f => f.port ? ${js([b4.unit([0, 'destroyer', [120.32, 24.20]])])} : [],
    briefing: () => [
      ['周上將', '現在有兩條路。第一條：趁他們還沒重整，渡海打下廈門港，打亂對岸的集結。第二條：哪裡都不去，把本島守好，保存實力。'],
      ['周上將', '兩條路都說得通。我不替你選。'],
      ['林上校', '敵人在澎湖蓋了前進基地，飛機和船都從那裡出來。南北兩邊也各有一批正在靠岸。'],
      ['許中尉', '如果能拿下澎湖機場，下一場空戰我們就多一條跑道。這對飛行員來說差很多。'],
      ['陳士官長', '長官，要跳就跳到底，要守就守到底。最怕的是跳一半。'],
    ],
    bonus: [{ type: 'hold', at: ${js(b4.at('澎湖機場'))}, flag: 'penghu', text: '結束時佔領澎湖機場（下一章多一架戰機）' }],
    win: [
      { id: 'leap', type: 'capture', at: ${js(b4.at('廈門港'))}, text: '跳：渡海奪下廈門港' },
      { id: 'abide', type: 'survive', turn: 22, text: '不跳：固守到第 22 回合結束' },
    ],
    lose: [
      { type: 'hq', text: '台中指揮所失守' },
      { type: 'loseCount', tiles: ${js([b4.at('台中港'), b4.at('彰化'), b4.at('嘉義')])}, max: 2, text: '西岸三處失守兩處' },
    ],
    events: [
${EV(b4, [
      { turn: 4, lines: [['林上校', '澎湖又上來一批增援。']], spawn: [[1, 'marine', [119.60, 23.52]], [1, 'attacker', [119.66, 23.64]]] },
      { turn: 6, lines: [['周上將', '陸戰 66 旅的預備隊到位了，交給你調度。']], spawn: [[0, 'marine', [120.45, 24.00]]] },
      { turn: 7, lines: [['林上校', '第二梯隊直衝西岸！']], spawn: [[1, 'lst', [120.22, 24.40], { load: ['tank', 'inf'] }], [1, 'lst', [120.10, 23.60], { load: ['tank', 'inf'] }]] },
      { turn: 12, lines: [['許中尉', '廈門那邊的跑道又亮起來了，對岸在補充戰機。要跳的話，最好趁現在。']], spawn: [[1, 'fighter', [118.50, 24.60]], [1, 'tank', [118.12, 24.52]]] },
      { turn: 16, lines: [['林上校', '第三梯隊出港，目標還是西岸。']], spawn: [[1, 'lst', [120.15, 24.10], { load: ['tank', 'marine'] }], [1, 'destroyer', [119.60, 24.20]]] },
    ])}
    ],
    next: r => r.obj === 'leap'
      ? { to: 's5', flags: { leap: true }, note: '你選擇了跳。廈門港一度易手，對岸的集結被打亂。陸戰隊會跟著艦隊參加下一場決戰。' }
      : { to: 's5', flags: { leap: false }, note: '你選擇了守。部隊完整保存下來，本島的防空網在下一場會更密。' },
  },

  // ---------------- 第五章：制空（台灣與先島群島，56×42） ----------------
  s5: {
    camp: 'sky', chapter: '第五章・2033', title: '制空', place: '台灣・先島群島',
    allies: ['US', 'JP'],
    bNation: ${js(Object.fromEntries(['與那國', '石垣', '宮古'].map(n => [b5.at(n).join(','), 'JP'])))},
${GEO(b5, '台灣・先島群島・福建沿海')}
${MAPJS(b5)}
    funds: [5000, 14000],
    horde: 5.5,
    units: [
      ${U(b5, [
        [0, 'fighter', '新竹'], [0, 'attacker', '嘉義'], [0, 'multirole', '花蓮'], [0, 'destroyer', [120.10, 24.30]], [0, 'destroyer', [120.00, 23.20]], [0, 'frigate', [120.30, 24.80]],
        [0, 'sam', [121.45, 25.00]], [0, 'aa', [120.70, 24.20]], [0, 'tank', [120.72, 24.10]], [0, 'rocket', [120.60, 23.80]], [0, 'inf', '台北'], [0, 'inf', '高雄'], [0, 'inf', '台中'], [0, 'coastal', [120.45, 23.60]], [0, 'submarine', [119.90, 24.00]],
        [0, 'carrier', [123.20, 23.30], { ally: 'US', load: ['fighter', 'attacker'] }], [0, 'destroyer', [123.00, 23.50], { ally: 'US' }], [0, 'cruiser', [123.40, 23.10], { ally: 'US' }],
        [0, 'fighter', '石垣', { ally: 'JP' }], [0, 'destroyer', [123.60, 24.70], { ally: 'JP' }],
        [1, 'carrier', [119.30, 24.40], { tag: 'flagship', load: ['fighter', 'attacker'] }], [1, 'destroyer', [119.15, 24.55], { tag: 'flagship' }], [1, 'cruiser', [119.45, 24.25], { tag: 'flagship' }],
        [1, 'fighter', '晉江'], [1, 'fighter', '莆田'], [1, 'bomber', [118.70, 25.10]], [1, 'destroyer', [119.40, 25.00]], [1, 'frigate', [119.20, 23.90]], [1, 'sam', [118.70, 24.95]], [1, 'tank', [118.66, 24.84]],
        [1, 'lst', [119.90, 24.90], { load: ['tank', 'marine'] }], [1, 'lst', [119.70, 23.50], { load: ['tank', 'marine'] }], [1, 'marine', '金門'], [1, 'submarine', [120.00, 25.30]], [1, 'coastal', [118.90, 25.00]],
      ])},
    ],
    extra: f => [
      ...(f.leap ? ${js([b5.unit([0, 'marine', [120.40, 24.10]]), b5.unit([0, 'lst', [120.20, 24.20], { load: ['tank', 'inf'] }])])} : ${js([b5.unit([0, 'sam', [120.50, 24.00]]), b5.unit([0, 'spsam', [120.36, 22.70]])])}),
      ...(f.penghu ? ${js([b5.unit([0, 'fighter', '馬公'])])} : []),
    ],
    bonus: [{ type: 'hold', at: ${js(b5.at('湄洲'))}, flag: 'raid', text: '結束時佔領湄洲港（終章日本增派艦隊）' }],
    briefing: () => [
      ['周上將', '這是我們最強的時候，也是盟友最多的時候。趁現在，把制空權和制海權一次拿下來。'],
      ['哈里斯上將', '雷根號航艦戰鬥群已在花蓮外海就位。'],
      ['佐藤一佐', '石垣的戰機與護衛艦隨時可以配合。請下令。'],
      ['許中尉', '目標是敵人的航艦戰鬥群「天樞」：一艘航艦、兩艘護衛艦。打沉它，海峽上空就是我們的。'],
      ['周上將', '記住，盟友是來幫忙的，不是來替你打的。把最硬的那一塊留給自己。'],
    ],
    win: [
      { id: 'sky', type: 'destroyTag', tag: 'flagship', text: '擊沉敵航艦戰鬥群「天樞」' },
      { id: 'sky', type: 'survive', turn: 22, text: '或確保制空權到第 22 回合結束' },
    ],
    lose: [
      { type: 'hq', text: '台北失守' },
      { type: 'loseCount', tiles: ${js([b5.at('新竹'), b5.at('台中'), b5.at('嘉義'), b5.at('高雄')])}, max: 2, text: '西岸四處失守兩處' },
    ],
    events: [
${EV(b5, [
      { turn: 2, when: 'f => f.leap', lines: [['林上校', '上次渡海的陸戰隊已經上船，隨時能再登陸一次。']] },
      { turn: 2, when: 'f => !f.leap', lines: [['林上校', '上次保存下來的防空部隊全部就位，本島上空很安全。']] },
      { turn: 4, lines: [['許中尉', '對岸第二批戰機起飛了。']], spawn: [[1, 'fighter', [118.60, 24.70]], [1, 'attacker', [119.00, 25.30]]] },
      { turn: 6, lines: [['佐藤一佐', '增派一艘護衛艦南下。']], spawn: [[0, 'destroyer', [124.00, 24.80], { ally: 'JP' }]] },
      { turn: 8, lines: [['周上將', '他們把轟炸機全放出來了。']], spawn: [[1, 'bomber', [118.60, 25.00]], [1, 'bomber', [118.80, 24.60]], [1, 'lst', [119.80, 24.40], { load: ['tank', 'tank'] }]] },
      { turn: 13, lines: [['許中尉', '「天樞」的護航艦隊補上來了，對岸還有第二批戰機。']], spawn: [[1, 'destroyer', [119.30, 24.70], { tag: 'flagship' }], [1, 'fighter', [118.62, 24.80]], [1, 'fighter', [119.02, 25.30]]] },
      { turn: 18, lines: [['周上將', '這是他們最後一搏，撐住。']], spawn: [[1, 'bomber', [118.70, 25.10]], [1, 'lst', [119.90, 24.00], { load: ['tank', 'marine'] }], [1, 'lst', [120.00, 23.40], { load: ['tank', 'marine'] }]] },
    ])}
    ],
    next: () => ({ to: 's6', note: '「天樞」沉了，敵人失去制海權。前線的將領都在問同一句話：要不要一口氣打到對岸去？' }),
  },

  // ---------------- 終章：見好就收（台灣海峽全域，64×64） ----------------
  s6: {
    camp: 'sky', chapter: '終章・2034', title: '見好就收', place: '台灣海峽全域',
    allies: ['US', 'JP'],
${GEO(b6, '台灣海峽・福建沿海・台灣西部')}
${MAPJS(b6)}
    funds: [8000, 26000],
    horde: 3.6,
    extra: f => f.raid ? ${js([b6.unit([0, 'destroyer', [121.30, 25.60], { ally: 'JP' }]), b6.unit([0, 'cruiser', [121.50, 25.70], { ally: 'JP' }]), b6.unit([0, 'multirole', [121.60, 25.20], { ally: 'JP' }])])} : [],
    units: [
      ${U(b6, [
        [0, 'inf', '新竹'], [0, 'inf', '台中港'], [0, 'inf', '雲林'], [0, 'inf', '布袋'], [0, 'tank', [120.75, 24.30]], [0, 'tank', [120.60, 23.95]], [0, 'arty', [120.80, 24.20]], [0, 'rocket', [120.70, 24.00]],
        [0, 'sam', '台中'], [0, 'aa', [120.62, 24.20]], [0, 'fighter', '清泉崗'], [0, 'attacker', '嘉義'], [0, 'multirole', '桃園機場'], [0, 'destroyer', [120.30, 24.50]], [0, 'destroyer', [120.10, 23.80]],
        [0, 'marine', [120.52, 24.20]], [0, 'lst', [120.40, 24.35], { load: ['tank', 'inf'] }], [0, 'coastal', [120.90, 24.70]], [0, 'coastal', [120.30, 23.60]], [0, 'submarine', [120.00, 24.60]], [0, 'tbm', [120.85, 24.10]],
        [0, 'carrier', [121.60, 25.50], { ally: 'US', load: ['fighter', 'attacker'] }], [0, 'destroyer', [121.40, 25.45], { ally: 'US' }], [0, 'fighter', '基隆', { ally: 'US' }],
        [0, 'inf', '高雄'], [0, 'inf', '台南'], [0, 'multirole', '花蓮'], [0, 'coastal', [120.22, 22.80]], [0, 'frigate', [120.10, 22.60]],
        [1, 'lst', [119.80, 22.80], { load: ['tank', 'marine'] }], [1, 'destroyer', [119.60, 22.90]], [1, 'submarine', [119.90, 22.50]], [1, 'inf', '汕頭'], [1, 'frigate', [117.60, 23.50]],
        [1, 'carrier', [119.20, 24.60], { load: ['fighter', 'attacker'] }], [1, 'destroyer', [119.05, 24.70]], [1, 'cruiser', [119.35, 24.50]], [1, 'destroyer', [119.60, 25.60]],
        [1, 'lst', [119.90, 25.20], { load: ['tank', 'inf'] }], [1, 'marine', '平潭'], [1, 'fighter', '福清'], [1, 'fighter', '晉江'], [1, 'bomber', '長樂'], [1, 'tank', [119.25, 26.00]], [1, 'tank', [119.35, 26.10]],
        [1, 'rocket', [119.20, 25.95]], [1, 'sam', [119.32, 26.02]], [1, 'aa', [119.28, 26.12]], [1, 'inf', '福州'], [1, 'arty', [119.40, 25.98]], [1, 'tbm', [119.00, 26.00]],
        [1, 'lst', [120.60, 24.95], { load: ['tank', 'marine'] }], [1, 'lst', [120.00, 23.50], { load: ['tank', 'marine'] }], [1, 'lst', [120.25, 24.25], { load: ['tank', 'inf'] }],
        [1, 'marine', [120.75, 24.85]], [1, 'marine', [120.10, 23.40]], [1, 'destroyer', [120.10, 24.60]], [1, 'frigate', [119.95, 23.95]], [1, 'submarine', [120.20, 25.10]], [1, 'marine', '馬公'], [1, 'marine', '金門'],
      ])},
    ],
    briefing: () => [
      ['周上將', '我們贏面很大。所以我要先講最難聽的話：人在最順的時候，最容易做出後悔一輩子的決定。'],
      ['林上校', '前線很多人想一路打到福州。老實說，我也想過。'],
      ['陳士官長', '長官，我當兵二十五年，只學會一件事：贏了就回家。'],
      ['周上將', '守住台灣 24 個回合，對岸就會回到談判桌。你也可以選擇渡海攻下福州——那樣也算贏，只是代價你要自己想清楚。'],
    ],
    win: [
      { id: 'restraint', type: 'survive', turn: 24, text: '見好就收：守住台灣到第 24 回合結束' },
      { id: 'conquer', type: 'capture', at: ${js(b6.at('福州'))}, text: '或：渡海攻下福州' },
    ],
    lose: [
      { type: 'hq', text: '台北失守' },
      { type: 'loseCount', tiles: ${js([b6.at('新竹'), b6.at('台中港'), b6.at('雲林'), b6.at('布袋')])}, max: 2, text: '西岸四處失守兩處' },
    ],
    events: [
${EV(b6, [
      { turn: 3, lines: [['林上校', '登陸艦隊分南北兩路過來了！']], spawn: [[1, 'marine', [120.70, 24.75]], [1, 'lst', [120.05, 23.70], { load: ['tank', 'inf'] }]] },
      { turn: 5, lines: [['佐藤一佐', '護衛艦與戰機已抵達台灣東北海域。']], spawn: [[0, 'destroyer', [121.70, 25.40], { ally: 'JP' }], [0, 'fighter', [121.65, 25.25], { ally: 'JP' }]] },
      { turn: 6, lines: [['林上校', '第二波兩棲突擊！']], spawn: [[1, 'lst', [120.55, 24.90], { load: ['tank', 'tank'] }], [1, 'lst', [120.00, 23.60], { load: ['tank', 'tank'] }], [1, 'lst', [120.05, 22.70], { load: ['tank', 'marine'] }], [1, 'marine', [120.12, 22.95]]] },
      { turn: 8, lines: [['許中尉', '對岸的轟炸機又升空了。這次我們有準備。']], spawn: [[1, 'bomber', [119.40, 25.90]], [1, 'fighter', [119.00, 25.40]]] },
      { turn: 10, lines: [['林上校', '這應該是他們最後的登陸部隊。']], spawn: [[1, 'marine', [120.35, 24.30]], [1, 'marine', [120.30, 24.10]], [1, 'lst', [120.45, 24.45], { load: ['tank', 'inf'] }]] },
      { turn: 14, lines: [['林上校', '對岸又集結了一批登陸艦，南北兩路。']], spawn: [[1, 'lst', [120.40, 25.00], { load: ['tank', 'marine'] }], [1, 'lst', [119.95, 23.30], { load: ['tank', 'marine'] }], [1, 'destroyer', [119.70, 24.30]]] },
      { turn: 18, lines: [['許中尉', '轟炸機和戰機一起過來了。']], spawn: [[1, 'bomber', [119.30, 25.80]], [1, 'fighter', [119.05, 25.45]], [1, 'fighter', [118.70, 24.90]]] },
      { turn: 21, lines: [['敵軍指揮官', '（截收的通訊）……各部隊停止前進，原地固守。重複，停止前進。'], ['周上將', '他們打不動了。福州就在對面——追，還是收？你決定。']] },
      { turn: 24, lines: [['哈里斯上將', '華府剛來電：對岸透過第三國表示願意停火。'], ['王記者', '最後一個回合了。不管結果如何，我會照實寫下來。']] },
    ])}
    ],
    next: (r, f) => {
      if (r.obj === 'conquer') return { to: 'S2', note: '福州陷落，全世界都在看。你贏了——然後呢？' };
      const merits = ['hualien', 'offshore', 'port', 'penghu', 'raid'].filter(k => f[k]).length;
      return merits >= 4
        ? { to: 'S0', note: \`每一步都走得剛剛好（額外目標 \${merits}/5）。\` }
        : { to: 'S1', note: \`二十四個回合過去，對岸回到了談判桌。（額外目標 \${merits}/5，達成 4 項可解鎖真結局）\` };
    },
    onLose: () => ({ to: 'S3', note: '台北失守了，但抵抗沒有結束。' }),
  },
});

Object.assign(ENDINGS, {
  S0: { title: '恰到好處', rank: '真結局', color: '#fde047',
    text: '該躲的時候你躲了，該出來的時候你出來了；該守的夜你守住了，該選的路你選了；最強的時候你找了朋友，最順的時候你停了手。停火協議在三個月後簽署，第一島鏈各國成立了常設協商機制。多年後王記者在書裡寫道：「那場戰爭最難的不是打贏，是每一次都知道現在該做什麼。」' },
  S1: { title: '點到為止', rank: '完全大捷', color: '#f59e0b',
    text: '你在最有條件繼續打的時候停了下來。台灣、美國、日本和周邊各國誰也沒有壓過誰，對岸回到談判桌。沒有人稱霸，所以和平撐得比任何人預期的都久。' },
  S2: { title: '贏過頭', rank: '慘勝', color: '#dc2626',
    text: '福州陷落了，但戰爭沒有結束，反而擴大到整個東亞。佔領帶來的是沒完沒了的游擊與報復，盟友也一個一個疏遠。陳士官長退伍那天只說了一句：「我們本來可以早點回家的。」' },
  S3: { title: '從頭再來', rank: '敗北', color: '#64748b',
    text: '台北失守了。剩下的部隊退回中央山脈，就像這場戰爭剛開始時那樣，躲起來、活下去、等下一次機會。林上校在山洞裡攤開地圖：「我們以前做過一次，可以再做一次。」' },
});

CAMPAIGNS.sky = {
  title: '昇龍 2031', sub: '六個時刻', player: 0, nations: ['TW', 'CN'], start: 's1', key: 'daisenryaku_campaign_sky', carryMax: 10,
  desc: '一支弱小的守軍，如何一步步走到能決定戰爭怎麼結束的位置。六章六個時刻：按兵不動、走出山區、日夜不休、跳或不跳、制空、見好就收。地圖取自真實地理，從花蓮的 22×14 逐章擴大到整個台灣海峽的 64×64；第四章的選擇會影響之後的兵力，終章考驗的不是能不能贏，而是贏到哪裡停。',
  tree: [['第一章', ['s1']], ['第二章', ['s2']], ['第三章', ['s3']], ['第四章', ['s4']], ['第五章', ['s5']], ['終章', ['s6']], ['結局', ['S0', 'S1', 'S2', 'S3']]],
};
`;
const fixed = out.replace(/when: "(f => [^"]+)"/g, 'when: $1').replace(/when: (f => [!\w.]+), lines/g, 'when: $1, lines');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'js', 'campaign_sky.js'), fixed);
console.log('已產生 docs/js/campaign_sky.js：' + [b1, b2, b3, b4, b5, b6].map(b => `${b.S.w}×${b.S.h}`).join(' → '));
