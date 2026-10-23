'use strict';
// ===== 隨機地圖產生（點對稱，雙方公平） =====

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateMap(w, h, seed) {
  const rand = mulberry32(seed);
  const N = w * h;
  const I = (x, y) => y * w + x;
  const XY = i => [i % w, (i / w) | 0];
  const mir = i => { const [x, y] = XY(i); return I(w - 1 - x, h - 1 - y); };
  const dist = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return hexDist(ax, ay, bx, by); };
  const nbs = i => { const [x, y] = XY(i); return neighbors(x, y, w, h).map(([nx, ny]) => I(nx, ny)); };

  // 平滑值雜訊
  function field(cell) {
    const gw = Math.ceil(w / cell) + 3, g = new Float32Array(gw * (Math.ceil(h / cell) + 3));
    for (let k = 0; k < g.length; k++) g[k] = rand();
    const out = new Float32Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = (x + 0.5 * (y & 1)) / cell, fy = (y * 0.866) / cell;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[I(x, y)] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
    return out;
  }
  const e1 = field(7), e2 = field(3.5), e3 = field(1.6), m1 = field(5), m2 = field(2.2);
  const elev = new Float32Array(N), moist = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    elev[i] = e1[i] * 0.55 + e2[i] * 0.3 + e3[i] * 0.15;
    moist[i] = m1[i] * 0.65 + m2[i] * 0.35;
  }
  for (let i = 0; i < N; i++) {
    const j = mir(i);
    if (j > i) {
      elev[i] = elev[j] = (elev[i] + elev[j]) / 2;
      moist[i] = moist[j] = (moist[i] + moist[j]) / 2;
    }
  }
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (N - 1))]; };
  const seaT = q(elev, 0.2), hillT = q(elev, 0.8), mtnT = q(elev, 0.92), forT = q(moist, 0.7);
  const terrain = new Array(N);
  for (let i = 0; i < N; i++) {
    terrain[i] = elev[i] < seaT ? 'sea' : elev[i] > mtnT ? 'mountain' : elev[i] > hillT ? 'hills'
      : moist[i] > forT ? 'forest' : 'plain';
  }
  const setSym = (i, t) => { terrain[i] = t; terrain[mir(i)] = t; };
  const isProp = i => !!TERRAIN[terrain[i]].prop;
  const isLand = i => ['plain', 'forest', 'hills'].includes(terrain[i]);

  // 首都（藍：左下，紅：右上）
  const bc = I(2, h - 3), rc = mir(bc);
  for (let i = 0; i < N; i++) {
    if (dist(i, bc) <= 2 && !isLand(i)) setSym(i, 'plain');
  }
  setSym(bc, 'capital');
  const blueSide = i => dist(i, bc) < dist(i, rc);

  // 在指定距離內挑一格設施
  function placeNear(type, dmin, dmax) {
    const c = [];
    for (let i = 0; i < N; i++) {
      const d = dist(i, bc);
      if (d >= dmin && d <= dmax && isLand(i) && blueSide(i) && mir(i) !== i
        && !nbs(i).some(isProp)) c.push(i);
    }
    if (!c.length) return -1;
    c.sort((a, b) => (terrain[a] === 'plain' ? 0 : 1) - (terrain[b] === 'plain' ? 0 : 1) || rand() - 0.5);
    setSym(c[0], type);
    return c[0];
  }
  placeNear('factory', 2, 3);
  placeNear('airport', 3, 5);

  // 港口：靠近首都、鄰接足夠大海域的海岸
  function seaSize(start) {
    const seen = new Set([start]), st = [start];
    while (st.length && seen.size < 30) {
      for (const n of nbs(st.pop())) if (terrain[n] === 'sea' && !seen.has(n)) { seen.add(n); st.push(n); }
    }
    return seen.size;
  }
  {
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (!isLand(i) || !blueSide(i) || isProp(i) || nbs(i).some(isProp)) continue;
      const sea = nbs(i).find(n => terrain[n] === 'sea');
      if (sea === undefined) continue;
      const d = dist(i, bc);
      if (d <= 10 && d < bd && seaSize(sea) >= 12) { bd = d; best = i; }
    }
    if (best >= 0) setSym(best, 'port');
  }

  // 城市
  const cities = [];
  const nCity = Math.round(N / 45);
  const cand = [];
  for (let i = 0; i < N; i++) if (isLand(i) && blueSide(i)) cand.push(i);
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
  const farFromProps = i => { for (let j = 0; j < N; j++) if (isProp(j) && dist(i, j) < 3) return false; return true; };
  const scale = Math.sqrt(N / 360);
  for (const i of cand) {
    if (cities.length >= nCity) break;
    if (isLand(i) && farFromProps(i)) { setSym(i, 'city'); cities.push(i); }
  }
  // 中線附近的中立城市
  const mids = [];
  for (let i = 0; i < N; i++) {
    if (isLand(i) && mir(i) !== i && Math.abs(dist(i, bc) - dist(i, rc)) <= 1 && dist(i, bc) < dist(i, rc) + 1) mids.push(i);
  }
  for (let k = 0; k < 2 && mids.length; k++) {
    const i = mids.splice(Math.floor(rand() * mids.length), 1)[0];
    if (isLand(i) && farFromProps(i)) setSym(i, 'city');
  }

  // 道路
  const roadCost = { road: 0.4, bridge: 0.4, plain: 1, forest: 2, hills: 3, mountain: 5, sea: 7 };
  function cheapPath(from, to) {
    const d = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    d[from] = 0;
    const open = new MinHeap();
    open.push(0, from);
    while (open.size) {
      const cur = open.pop();
      if (done[cur]) continue;
      done[cur] = 1;
      if (cur === to) break;
      for (const n of nbs(cur)) {
        if (done[n]) continue;
        const nd = d[cur] + (roadCost[terrain[n]] ?? 1);
        if (nd < d[n]) { d[n] = nd; prev[n] = cur; open.push(nd, n); }
      }
    }
    const p = [];
    for (let c = to; c !== -1; c = prev[c]) p.push(c);
    return p;
  }
  const roadEdges = new Set();
  const edgeKey = (a, b) => a < b ? a * N + b : b * N + a;
  function layRoad(path) {
    for (let k = 1; k < path.length; k++) {
      roadEdges.add(edgeKey(path[k - 1], path[k]));
      roadEdges.add(edgeKey(mir(path[k - 1]), mir(path[k])));
    }
    for (const i of path) {
      if (isProp(i)) continue;
      terrain[i] = terrain[i] === 'sea' || terrain[i] === 'bridge' ? 'bridge' : 'road';
    }
  }
  layRoad(cheapPath(bc, rc));
  for (let i = 0; i < N; i++) {
    if (isProp(i) && i !== bc && blueSide(i)) layRoad(cheapPath(bc, i));
  }
  for (let i = 0; i < N; i++) {
    const j = mir(i);
    if ((terrain[i] === 'road' || terrain[i] === 'bridge') && !isProp(j)) {
      terrain[j] = terrain[j] === 'sea' || terrain[j] === 'bridge' ? 'bridge' : 'road';
    }
  }

  // 鐵路：大地圖連接首都、工廠與主要城市
  const railEdges = new Set();
  if (N >= 900) {
    const railCost = { rail: 0.3, road: 1, plain: 1, forest: 2, hills: 3, bridge: 4, mountain: 8, sea: 50 };
    function railPath(from, to) {
      const d = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), open = new MinHeap();
      d[from] = 0; open.push(0, from);
      while (open.size) {
        const cur = open.pop();
        if (done[cur]) continue;
        done[cur] = 1;
        if (cur === to) break;
        for (const n of nbs(cur)) {
          if (done[n]) continue;
          const nd = d[cur] + (isProp(n) ? 1 : railCost[terrain[n]] ?? 1);
          if (nd < d[n]) { d[n] = nd; prev[n] = cur; open.push(nd, n); }
        }
      }
      const p = [];
      for (let c = to; c !== -1; c = prev[c]) p.push(c);
      return p;
    }
    const layRail = path => {
      if (path.some(i => terrain[i] === 'sea')) return;
      for (let k = 1; k < path.length; k++) {
        railEdges.add(edgeKey(path[k - 1], path[k]));
        railEdges.add(edgeKey(mir(path[k - 1]), mir(path[k])));
      }
      for (const i of path) {
        if (isProp(i) || terrain[i] === 'bridge') continue;
        terrain[i] = 'rail'; if (!isProp(mir(i))) terrain[mir(i)] = 'rail';
      }
    };
    layRail(railPath(bc, rc));
    const hubs = [];
    for (let i = 0; i < N; i++) if (blueSide(i) && (terrain[i] === 'factory' || terrain[i] === 'city')) hubs.push(i);
    hubs.sort((a, b) => dist(a, bc) - dist(b, bc));
    for (const hub of hubs.slice(0, 4)) layRail(railPath(bc, hub));
  }

  // 港口必須臨海：任一方的港口不臨海時，雙方都改成城市（維持公平）
  for (let i = 0; i < N; i++) {
    if (terrain[i] !== 'port') continue;
    const j = mir(i), coastal = k => nbs(k).some(n => terrain[n] === 'sea');
    if (!coastal(i) || terrain[j] !== 'port' || !coastal(j)) { terrain[i] = 'city'; if (terrain[j] === 'port') terrain[j] = 'city'; }
  }

  // 初始所有權
  const owner = new Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (isProp(i) && terrain[i] !== 'city' && blueSide(i)) { owner[i] = 0; owner[mir(i)] = 1; }
  }
  cities.sort((a, b) => dist(a, bc) - dist(b, bc));
  for (const c of cities.slice(0, 2)) { owner[c] = 0; owner[mir(c)] = 1; }

  // 初始部隊
  const spots = [];
  for (let i = 0; i < N; i++) {
    if (!isProp(i) && moveCost(terrain[i], 'tread') !== Infinity && blueSide(i)) spots.push(i);
  }
  spots.sort((a, b) => dist(a, bc) - dist(b, bc));
  const roster = ['inf', 'inf', 'inf', 'tank', 'tank', 'arty', 'recon', 'aa'];
  if (scale > 1.3) roster.push('inf', 'tank', 'atinf', 'arty');
  if (scale > 1.8) roster.push('inf', 'inf', 'tank', 'tank', 'aa', 'rocket');
  const start = [];
  roster.forEach((type, k) => {
    if (k >= spots.length) return;
    start.push([type, spots[k], 0], [type, mir(spots[k]), 1]);
  });

  const roads = [...roadEdges].map(k => [Math.floor(k / N), k % N]);
  const rails = [...railEdges].map(k => [Math.floor(k / N), k % N]);
  return { terrain, owner, caps: [bc, rc], start, roads, rails };
}
