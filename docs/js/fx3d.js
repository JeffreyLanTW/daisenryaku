// ===== 3D 戰鬥特效：射擊、彈道、命中、擊毀 =====
// 武器依「攻擊方兵種＋國家」與「目標類型」選擇（例：驅逐艦對空打垂直發射防空飛彈、對艦打掠海反艦飛彈、對岸打艦砲）。
// 火光與煙用一個點粒子系統（一次繪製），碎片用一個實例化網格，彈體用少量網格。
import * as THREE from '../vendor/three.min.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const XAXIS = V3(1, 0, 0);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const C = new THREE.Color();

// ----- 點粒子 -----
const VS = `attribute float psize; attribute vec4 pcol; varying vec4 vC; uniform float uScale;
void main() { vC = pcol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = psize * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `varying vec4 vC; void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard; float a = 1.0 - r; gl_FragColor = vec4(vC.rgb, vC.a * a * a); }`;
class Particles {
  constructor(max, additive) {
    this.max = max; this.next = 0;
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.col = new Float32Array(max * 4);
    this.vel = new Float32Array(max * 3); this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.fade = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = additive ? 31 : 30;
    this.geo = g; this.alive = 0;
  }
  // o: p（位置）、v（速度）、life（秒）、s0/s1（直徑）、c0/c1（顏色）、a（不透明度）、g（重力）、drag、fadeIn（煙：先淡入）
  emit(o) {
    const i = this.next; this.next = (i + 1) % this.max;
    this.pos.set([o.p.x, o.p.y, o.p.z], i * 3);
    this.vel.set(o.v ? [o.v.x, o.v.y, o.v.z] : [0, 0, 0], i * 3);
    this.age[i] = 0; this.life[i] = o.life; this.s0[i] = o.s0; this.s1[i] = o.s1 ?? o.s0;
    C.set(o.c0); this.c0.set([C.r, C.g, C.b], i * 3); C.set(o.c1 || o.c0); this.c1.set([C.r, C.g, C.b], i * 3);
    this.a0[i] = o.a ?? 1; this.grav[i] = o.g || 0; this.drag[i] = o.drag || 0; this.fade[i] = o.fadeIn ? 1 : 0;
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      const t = (this.age[i] += dt) / this.life[i];
      if (t >= 1) { this.life[i] = 0; this.size[i] = 0; continue; }
      alive++;
      const k = Math.max(0, 1 - this.drag[i] * dt), j = i * 3;
      this.vel[j] *= k; this.vel[j + 1] = this.vel[j + 1] * k - this.grav[i] * dt; this.vel[j + 2] *= k;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      const e = 1 - (1 - t) * (1 - t);
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      for (let c = 0; c < 3; c++) this.col[i * 4 + c] = this.c0[j + c] + (this.c1[j + c] - this.c0[j + c]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (this.fade[i] ? Math.min(1, t * 5) : 1) * Math.pow(1 - t, 1.4);
    }
    this.alive = alive;
    for (const n of ['position', 'psize', 'pcol']) this.geo.attributes[n].needsUpdate = true;
  }
}

// ----- 碎片（實例化小方塊，受重力、落地彈跳）-----
class Debris {
  constructor(max) {
    this.max = max; this.next = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), max);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.d = Array.from({ length: max }, () => ({ life: 0 }));
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, z); this.mesh.setColorAt(i, C.set('#333')); }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = V3();
  }
  emit(p, v, size, color, floor) {
    const i = this.next; this.next = (i + 1) % this.max;
    Object.assign(this.d[i], { p: p.clone(), v: v.clone(), r: V3(rnd(0, 6), rnd(0, 6), rnd(0, 6)), w: V3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), s: size, life: rnd(1.4, 2.4), age: 0, floor });
    this.mesh.setColorAt(i, C.set(color)); this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const o = this.d[i];
      if (o.life <= 0) continue;
      o.age += dt;
      if (o.age >= o.life) { o.life = 0; this.mesh.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; }
      o.v.y -= 140 * dt; o.p.addScaledVector(o.v, dt);
      if (o.p.y < o.floor) { o.p.y = o.floor; o.v.multiplyScalar(0.35); o.v.y = Math.abs(o.v.y) * 0.4; o.w.multiplyScalar(0.5); }
      o.r.addScaledVector(o.w, dt);
      const sc = o.s * Math.min(1, (o.life - o.age) / 0.4);
      this._q.setFromEuler(this._e.set(o.r.x, o.r.y, o.r.z));
      this.mesh.setMatrixAt(i, this._m.compose(o.p, this._q, this._s.set(sc, sc * 0.6, sc * 0.8)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ----- 武器選擇（依兵種、國家與目標）-----
const INF = ['inf', 'marine', 'engineer', 'specops', 'wafer_inf'];
const SHIP = ['destroyer', 'cruiser', 'frigate', 'corvette'];
export function weaponFor(a, d) {
  const b = a.base, nat = a.nation, t = d.base === 'submarine' ? 'sub' : d.cat === 'air' ? 'air' : d.cat === 'sea' ? 'sea' : 'land';
  const W = (k, o = {}) => Object.assign({ k, t }, o);
  if (INF.includes(b)) return W('tracer', { n: t === 'air' ? 6 : 5, w: 0.35, col: '#ffd27a', gap: 70, small: true });
  switch (b) {
    case 'sniper': return W('tracer', { n: 1, w: 0.5, col: '#fff3c4', gap: 0, small: true });
    case 'atinf': return t === 'air' ? W('tracer', { n: 5, w: 0.35, col: '#ffd27a', gap: 70, small: true }) : W('missile', { path: 'direct', size: 0.6, backblast: true, speed: 0.55 });
    case 'manpads': return W('missile', { path: t === 'air' ? 'direct' : 'arc', size: 0.5, speed: 0.6 });
    case 'mortar': return W('shell', { path: 'steep', size: 0.9, blast: 0.6, dur: 900 });
    case 'recon': case 'apc': case 'truck': case 'hovercraft': case 'lst': return W('tracer', { n: 6, w: 0.45, col: '#ffcf70', gap: 55 });
    case 'ifv': case 'lighttank': if (b === 'ifv' || t === 'air') return W('tracer', { n: 4, w: 0.9, col: '#ffb347', gap: 90, cannon: true });
      return W('cannon', { size: 0.8 });
    case 'tank': case 'anduril_tank': case 'train': return W('cannon', { size: 1 });
    case 'tankdest': return ['CN', 'DE'].includes(nat) ? W('cannon', { size: 1 }) : W('missile', { path: 'direct', size: 0.7, speed: 0.55 });
    case 'arty': case 'palantir_arty': return W('shell', { path: 'arc', size: 1.2, blast: 1.1, dur: 850, guided: b === 'palantir_arty' });
    case 'rocket': return W('salvo', { n: 6, gap: 80, size: 0.6, path: 'arc', dur: 800 });
    case 'tbm': return W('missile', { path: 'ballistic', size: 1.8, speed: 1.3, big: true });
    case 'coastal': return W('missile', { path: t === 'sea' ? 'skim' : 'arc', size: 1, speed: 0.9 });
    case 'aa': return t === 'air' ? W('flak', { n: 8, gap: 45 }) : W('tracer', { n: 8, w: 0.8, col: '#ffb347', gap: 45, cannon: true });
    case 'sam': case 'spsam': return W('missile', { path: t === 'air' ? 'vertical' : 'arc', size: b === 'sam' ? 1.2 : 0.8, speed: 0.8, proximity: t === 'air' });
    case 'laser_aa': case 'euv_fortress': return W('beam', { col: b === 'laser_aa' ? '#67e8f9' : '#a5f3fc' });
    case 'fighter': case 'stealth': case 'multirole':
      if (t === 'air') return W('missile', { path: 'direct', size: 0.55, speed: 0.5, proximity: true, fast: true });
      if (t === 'sea' || t === 'sub') return W('missile', { path: 'glide', size: 0.8, speed: 0.75 });
      return b === 'multirole' ? W('bombs', { n: 2, guided: true }) : W('missile', { path: 'glide', size: 0.6, speed: 0.6 });
    case 'attacker':
      if (t === 'sea' || t === 'sub') return W('missile', { path: 'glide', size: 0.8, speed: 0.75 });
      if (t === 'air') return W('missile', { path: 'direct', size: 0.5, speed: 0.5, proximity: true, fast: true });
      return nat === 'US' ? W('strafe', { n: 12, gap: 28 }) : W('salvo', { n: 4, gap: 60, size: 0.45, path: 'glide', dur: 450 });
    case 'bomber':
      if (nat === 'US' && t === 'land') return W('bombs', { n: 6 });
      return W('missile', { path: 'glide', size: 1.3, speed: 1, big: true });
    case 'heli': return t === 'air' ? W('missile', { path: 'direct', size: 0.45, speed: 0.5, proximity: true }) : W('salvo', { n: 2, gap: 160, size: 0.55, path: 'glide', dur: 600 });
    case 'scoutheli': return t === 'air' ? W('missile', { path: 'direct', size: 0.45, speed: 0.5, proximity: true }) : W('salvo', { n: 4, gap: 70, size: 0.35, path: 'glide', dur: 400 });
    case 'thelico': return W('tracer', { n: 7, w: 0.45, col: '#ffcf70', gap: 50 });
    case 'uav': return W('missile', { path: 'glide', size: 0.45, speed: 0.6 });
    case 'mpa': return t === 'sub' ? W('torpedo', { drop: true }) : W('missile', { path: 'glide', size: 0.9, speed: 0.8 });
    case 'nano_swarm': return W('swarm', { n: 10 });
    case 'wingman_carrier': case 'carrier': return W('airstrike', { n: 3 });
    case 'usv_wolfpack': return t === 'sea' ? W('missile', { path: 'skim', size: 0.6, speed: 0.7 }) : W('tracer', { n: 6, w: 0.6, col: '#ffb347', gap: 55 });
    case 'submarine': return t === 'land' ? W('missile', { path: 'subsurface', size: 1, speed: 1.1 }) : W('torpedo', {});
    case 'patrol': return t === 'sea' ? W('missile', { path: 'skim', size: 0.7, speed: 0.75 }) : W('tracer', { n: 7, w: 0.8, col: '#ffb347', gap: 50, cannon: true });
    case 'lhd': return W('tracer', { n: 8, w: 0.6, col: '#ffb347', gap: 40, cannon: true });
  }
  if (SHIP.includes(b)) {
    if (t === 'air') return W('missile', { path: 'vertical', size: 1, speed: 0.8, proximity: true });
    if (t === 'sea') return W('missile', { path: 'skim', size: 1, speed: 0.9 });
    if (t === 'sub') return W('torpedo', { asroc: true });
    return W('shell', { path: 'naval', size: 0.9, blast: 0.9, dur: 650, rounds: 3 });
  }
  return W('tracer', { n: 5, w: 0.5, col: '#ffd27a', gap: 60 });
}

// ----- 特效系統 -----
export function createFX(ctx) {
  // ctx: { scene（地面層）, fxScene（部隊層）, heightAt(x,z), waterY, isWater(x,z) }
  const fire = new Particles(1400, true), smoke = new Particles(1400, false), debris = new Debris(260);
  ctx.fxScene.add(fire.points, smoke.points, debris.mesh);
  const shots = [], wrecks = [], timers = [], decals = [];
  // 彈體網格
  const glow = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const G_TRACER = new THREE.BoxGeometry(1, 1, 1), G_ROUND = new THREE.SphereGeometry(1, 8, 6);
  const G_MSL = new THREE.CylinderGeometry(0.5, 0.5, 1, 7).rotateZ(-Math.PI / 2), G_NOSE = new THREE.ConeGeometry(0.5, 1, 7).rotateZ(-Math.PI / 2);
  const M_MSL = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 }), M_DARK = new THREE.MeshStandardMaterial({ color: '#3f4247', roughness: 0.7 });
  const M_SHELL = glow('#ffcf70');
  const wreckMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, color: '#2b2622', roughness: 1 });
  const decalGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const later = (ms, fn) => timers.push({ t: performance.now() + ms, fn });

  // ---- 粒子配方 ----
  function flash(p, s) { fire.emit({ p, life: 0.12, s0: 18 * s, s1: 26 * s, c0: '#fffbe6', a: 1 }); }
  function muzzle(p, dir, s, dust) {
    flash(p, s * 0.6);
    for (let i = 0; i < 5; i++) fire.emit({ p, v: dir.clone().multiplyScalar(rnd(40, 90) * s).add(V3(rnd(-8, 8), rnd(-4, 8), rnd(-8, 8))), life: rnd(0.1, 0.22), s0: 6 * s, s1: 2 * s, c0: '#fff1b0', c1: '#ff7a1a' });
    for (let i = 0; i < 3; i++) smoke.emit({ p, v: dir.clone().multiplyScalar(rnd(10, 25)).add(V3(0, rnd(4, 10), 0)), life: rnd(0.8, 1.4), s0: 5 * s, s1: 16 * s, c0: '#d8d4cc', c1: '#a8a39a', a: 0.45, fadeIn: true, drag: 1.5 });
    if (dust) for (let i = 0; i < 10; i++) { const a = rnd(0, Math.PI * 2); smoke.emit({ p: V3(p.x, dust, p.z), v: V3(Math.cos(a) * rnd(25, 45), rnd(2, 6), Math.sin(a) * rnd(25, 45)), life: rnd(0.8, 1.3), s0: 6, s1: 18, c0: '#b39b72', c1: '#8a7a60', a: 0.5, drag: 2.5, fadeIn: true }); }
  }
  // 爆炸：kind = land（泥土）/ air（空爆）/ water（水柱）/ ship（火加水花）；s 為規模
  function explode(p, kind, s = 1) {
    const gy = ctx.heightAt(p.x, p.z), floor = kind === 'water' || kind === 'ship' ? ctx.waterY : gy;
    flash(p, s);
    if (kind === 'water') {
      for (let i = 0; i < 22 * s; i++) smoke.emit({ p: V3(p.x + rnd(-3, 3) * s, floor, p.z + rnd(-3, 3) * s), v: V3(rnd(-12, 12) * s, rnd(60, 130) * s, rnd(-12, 12) * s), g: 160, life: rnd(0.8, 1.3), s0: 6 * s, s1: 12 * s, c0: '#f8fafc', c1: '#cbd5e1', a: 0.85 });
      for (let i = 0; i < 8; i++) { const a = rnd(0, Math.PI * 2); smoke.emit({ p: V3(p.x, floor + 1, p.z), v: V3(Math.cos(a) * 30 * s, 2, Math.sin(a) * 30 * s), life: 1.2, s0: 6 * s, s1: 16 * s, c0: '#e2e8f0', a: 0.6, drag: 2 }); }
      return;
    }
    const n = Math.round(18 * s);
    // 火球：核心白熱、外圈橘紅，向外翻滾後轉暗
    for (let i = 0; i < n; i++) {
      const v = V3(rnd(-1, 1), rnd(-0.1, 1.1), rnd(-1, 1)).normalize().multiplyScalar(rnd(14, 40) * s);
      fire.emit({ p: p.clone().add(V3(rnd(-2, 2), rnd(0, 3), rnd(-2, 2)).multiplyScalar(s)), v, life: rnd(0.5, 1.0), s0: rnd(10, 16) * s, s1: rnd(22, 34) * s, c0: i % 3 ? '#ffe7a0' : '#fffdf2', c1: '#a3170f', drag: 2.6 });
    }
    for (let i = 0; i < 4; i++) fire.emit({ p: p.clone(), life: 0.3, s0: 26 * s, s1: 40 * s, c0: '#fff4c8', c1: '#ff7a1a', a: 0.8 });
    for (let i = 0; i < n * 0.8; i++) fire.emit({ p: p.clone(), v: V3(rnd(-1, 1), rnd(0, 1.4), rnd(-1, 1)).multiplyScalar(rnd(60, 130) * s), g: 140, life: rnd(0.4, 0.8), s0: 2.2, s1: 1, c0: '#ffe9a8', c1: '#ff6a00' });
    const sc = kind === 'air' ? '#3b3b3b' : '#4a4540';
    for (let i = 0; i < n; i++) smoke.emit({ p: p.clone().add(V3(rnd(-5, 5), rnd(0, 6), rnd(-5, 5)).multiplyScalar(s)), v: V3(rnd(-9, 9), rnd(10, 26), rnd(-9, 9)).multiplyScalar(s), life: rnd(2.2, 3.6), s0: 14 * s, s1: 40 * s, c0: sc, c1: '#8b8680', a: 0.78, drag: 1.1, fadeIn: true });
    if (kind === 'land') {
      for (let i = 0; i < 12 * s; i++) debris.emit(p.clone(), V3(rnd(-40, 40), rnd(40, 95), rnd(-40, 40)).multiplyScalar(s), rnd(1.2, 2.8), i % 2 ? '#6b5a42' : '#3f3a33', gy);
      // 泥土噴泉
      for (let i = 0; i < 14 * s; i++) smoke.emit({ p: V3(p.x + rnd(-3, 3) * s, gy + 1, p.z + rnd(-3, 3) * s), v: V3(rnd(-14, 14) * s, rnd(50, 95) * s, rnd(-14, 14) * s), g: 120, life: rnd(1, 1.6), s0: 6 * s, s1: 14 * s, c0: '#7a6548', c1: '#9c8a6a', a: 0.85 });
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; smoke.emit({ p: V3(p.x, gy + 1, p.z), v: V3(Math.cos(a) * 45 * s, 3, Math.sin(a) * 45 * s), life: rnd(1, 1.6), s0: 8 * s, s1: 20 * s, c0: '#a08c6a', c1: '#857560', a: 0.45, drag: 2.2, fadeIn: true }); }
      scorch(p.x, p.z, 9 * s, gy);
    }
    if (kind === 'ship') { explode(V3(p.x, ctx.waterY, p.z), 'water', s * 0.6); for (let i = 0; i < 6 * s; i++) debris.emit(p.clone(), V3(rnd(-40, 40), rnd(30, 70), rnd(-40, 40)), rnd(1, 2), '#2f3439', ctx.waterY - 3); }
    if (kind === 'air') for (let i = 0; i < 5 * s; i++) debris.emit(p.clone(), V3(rnd(-30, 30), rnd(-10, 30), rnd(-30, 30)), rnd(0.8, 1.6), '#2f3439', gy);
  }
  function scorch(x, z, r, gy) {
    const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, gy + 0.35, z); m.scale.setScalar(r); m.renderOrder = 1;
    ctx.scene.add(m); decals.push({ m, t0: performance.now() });
    if (decals.length > 40) { const d = decals.shift(); ctx.scene.remove(d.m); d.m.material.dispose(); }
  }
  function shockwave(p, s) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), glow('#ffd8a0'));
    m.position.copy(p); ctx.fxScene.add(m);
    shots.push({ mesh: m, t0: performance.now(), dur: 600, upd(t) { m.scale.setScalar(8 + 70 * s * t); m.material.opacity = 0.7 * (1 - t); }, done() { ctx.fxScene.remove(m); m.material.dispose(); m.geometry.dispose(); } });
  }
  function airburst(p) {   // 高射砲彈的黑色空爆煙團
    fire.emit({ p, life: 0.16, s0: 12, s1: 18, c0: '#fff1c0', c1: '#ff8a1a' });
    for (let i = 0; i < 3; i++) smoke.emit({ p: p.clone().add(V3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))), v: V3(rnd(-4, 4), rnd(0, 4), rnd(-4, 4)), life: rnd(2, 3), s0: 10, s1: 24, c0: '#151515', c1: '#3f3f3f', a: 0.9, drag: 1 });
  }

  // ---- 彈道 ----
  function path(kind, a, b) {
    const d = a.distanceTo(b), mid = a.clone().lerp(b, 0.5);
    switch (kind) {
      case 'arc': return t => a.clone().lerp(b, t).add(V3(0, 4 * (d * 0.35 + 25) * t * (1 - t), 0));
      case 'steep': return t => a.clone().lerp(b, t).add(V3(0, 4 * (d * 0.9 + 60) * t * (1 - t), 0));
      case 'naval': return t => a.clone().lerp(b, t).add(V3(0, 4 * (d * 0.2 + 12) * t * (1 - t), 0));
      case 'ballistic': return t => a.clone().lerp(b, t).add(V3(0, 4 * (d * 0.8 + 120) * t * (1 - t), 0));
      case 'vertical': { const c1 = a.clone().add(V3(0, 70 + d * 0.3, 0)), c2 = b.clone().add(V3(0, 40, 0)); return t => cubic(a, c1, c2, b, t); }
      case 'subsurface': { const c1 = a.clone().add(V3(0, 90, 0)), c2 = b.clone().add(V3(0, 60, 0)); return t => cubic(a, c1, c2, b, t); }
      case 'skim': { const y = ctx.waterY + 3, c1 = V3(a.x + (b.x - a.x) * 0.25, y, a.z + (b.z - a.z) * 0.25), c2 = V3(b.x - (b.x - a.x) * 0.12, y + 12, b.z - (b.z - a.z) * 0.12); return t => cubic(a, c1, c2, b, t); }
      case 'glide': { const c1 = a.clone().lerp(b, 0.3).add(V3(0, 6, 0)); return t => quad(a, c1, b, t); }
      default: return t => a.clone().lerp(b, t);
    }
    function cubic(p0, p1, p2, p3, t) { const u = 1 - t; return p0.clone().multiplyScalar(u * u * u).addScaledVector(p1, 3 * u * u * t).addScaledVector(p2, 3 * u * t * t).addScaledVector(p3, t * t * t); }
    function quad(p0, p1, p2, t) { const u = 1 - t; return p0.clone().multiplyScalar(u * u).addScaledVector(p1, 2 * u * t).addScaledVector(p2, t * t); }
    void mid;
  }
  // 一顆彈體：mesh 沿 fn(t) 飛行，trail(pos, dir) 每幀噴尾跡，arrive() 抵達
  function projectile({ fn, dur, mesh, trail, arrive, delay = 0 }) {
    const s = { t0: performance.now() + delay, dur, mesh, prev: fn(0), started: false,
      upd(t) {
        if (!this.started) { this.started = true; if (mesh) ctx.fxScene.add(mesh); }
        const p = fn(t), dir = p.clone().sub(this.prev);
        if (mesh) { mesh.position.copy(p); if (dir.lengthSq() > 1e-6) mesh.quaternion.setFromUnitVectors(XAXIS, dir.clone().normalize()); }
        if (trail && dir.lengthSq() > 1e-6) trail(p, dir.normalize());
        this.prev = p;
      },
      done() { if (mesh) ctx.fxScene.remove(mesh); arrive && arrive(); } };
    shots.push(s);
  }
  const missileMesh = sz => { const g = new THREE.Group(); const b = new THREE.Mesh(G_MSL, M_MSL); b.scale.set(7 * sz, 1.1 * sz, 1.1 * sz); const n = new THREE.Mesh(G_NOSE, M_MSL); n.scale.set(1.8 * sz, 1.1 * sz, 1.1 * sz); n.position.x = 4.4 * sz; g.add(b, n); return g; };
  const missileTrail = (sz, heavy) => (p, dir) => {
    const tail = p.clone().addScaledVector(dir, -4 * sz);
    fire.emit({ p: tail, v: dir.clone().multiplyScalar(-30), life: 0.12, s0: 5 * sz, s1: 2 * sz, c0: '#fff7c2', c1: '#ff8a1a' });
    smoke.emit({ p: tail, v: V3(rnd(-2, 2), rnd(0, 3), rnd(-2, 2)), life: heavy ? 2.6 : 1.6, s0: 3 * sz, s1: (heavy ? 16 : 10) * sz, c0: '#f1f5f9', c1: '#cbd5e1', a: 0.55, drag: 0.8 });
  };
  const impactKind = (w, b) => w.t === 'air' ? 'air' : w.t === 'sea' || w.t === 'sub' ? 'ship' : ctx.isWater(b.x, b.z) ? 'water' : 'land';

  // ---- 開火：回傳到第一次命中的毫秒數 ----
  function fire3D(w, A, B, opt) {
    const { k: speedK, onHit, attackerAir } = opt, a = A.clone(), b = B.clone();
    const dir = b.clone().sub(a).setY(0).normalize(), kind = impactKind(w, b);
    const d = a.distanceTo(b);
    const hit = (p, s) => { explode(p, kind, s); onHit && onHit(); };
    switch (w.k) {
      case 'tracer': {
        const dur = Math.max(90, d * 1.3) * speedK, n = w.n;
        muzzle(a, dir, w.cannon ? 0.6 : 0.3);
        for (let i = 0; i < n; i++) {
          const jitter = V3(rnd(-3, 3), rnd(-1, 3), rnd(-3, 3)), m = new THREE.Mesh(G_TRACER, glow(w.col));
          m.scale.set(w.cannon ? 9 : 6, w.w, w.w);
          projectile({ fn: t => a.clone().lerp(b.clone().add(jitter), t), dur, mesh: m, delay: i * w.gap * speedK,
            arrive: () => { m.material.dispose(); i === 0 && onHit && onHit();
              const p = b.clone().add(jitter);
              if (kind === 'water') smoke.emit({ p: V3(p.x, ctx.waterY, p.z), v: V3(0, 40, 0), g: 120, life: 0.6, s0: 3, s1: 5, c0: '#e2e8f0', a: 0.8 });
              else { fire.emit({ p, life: 0.1, s0: w.cannon ? 7 : 4, c0: '#ffe9a8' }); if (kind === 'land') smoke.emit({ p, v: V3(0, 14, 0), life: 0.8, s0: 3, s1: 8, c0: '#9c8a6a', a: 0.5 }); if (w.cannon && i === n - 1) explode(p, kind, 0.35); } } });
          if (i > 0) later(i * w.gap * speedK, () => muzzle(a, dir, w.cannon ? 0.5 : 0.25));
        }
        return dur;
      }
      case 'cannon': {
        const dur = Math.max(110, d * 0.9) * speedK;
        muzzle(a, dir, 1.2 * w.size, ctx.heightAt(a.x, a.z) + 1);
        const m = new THREE.Mesh(G_ROUND, M_SHELL); m.scale.setScalar(1.3);
        projectile({ fn: t => a.clone().lerp(b, t), dur, mesh: m, trail: p => fire.emit({ p, life: 0.08, s0: 3, c0: '#ffe0a0' }), arrive: () => hit(b, 0.7 * w.size) });
        return dur;
      }
      case 'shell': {
        const dur = (w.dur + d * 0.6) * speedK, rounds = w.rounds || 1;
        for (let r = 0; r < rounds; r++) {
          const off = V3(rnd(-6, 6), 0, rnd(-6, 6)).multiplyScalar(r ? 1 : 0), end = b.clone().add(off), fn = path(w.path, a, end);
          later(r * 220 * speedK, () => muzzle(a, dir, w.blast * 1.4, w.path === 'naval' ? null : ctx.heightAt(a.x, a.z) + 1));
          const m = new THREE.Mesh(G_ROUND, M_SHELL); m.scale.setScalar(w.size);
          projectile({ fn, dur, mesh: m, delay: r * 220 * speedK, trail: w.guided ? missileTrail(0.4) : p => smoke.emit({ p, life: 0.5, s0: 1.5, s1: 4, c0: '#e5e7eb', a: 0.25 }), arrive: () => { r === 0 ? hit(end, w.blast) : explode(end, kind, w.blast * 0.8); } });
        }
        return dur;
      }
      case 'salvo': {
        const dur = (w.dur + d * 0.5) * speedK;
        for (let i = 0; i < w.n; i++) {
          const end = b.clone().add(V3(rnd(-9, 9), 0, rnd(-9, 9))), fn = path(w.path, a.clone().add(V3(0, 0, (i % 3 - 1) * 2)), end);
          later(i * w.gap * speedK, () => muzzle(a, dir, 0.4));
          projectile({ fn, dur, mesh: missileMesh(w.size), delay: i * w.gap * speedK, trail: missileTrail(w.size), arrive: () => { i === 0 ? hit(end, 0.6) : explode(end, kind, 0.45); } });
        }
        return dur;
      }
      case 'missile': {
        const dur = (w.speed * 900 + d * (w.fast ? 0.35 : 0.6)) * speedK;
        if (w.backblast) for (let i = 0; i < 6; i++) smoke.emit({ p: a, v: dir.clone().multiplyScalar(-rnd(40, 70)).add(V3(0, rnd(2, 8), 0)), life: 1, s0: 4, s1: 14, c0: '#d6d3d1', a: 0.5, drag: 2 });
        if (w.path === 'subsurface') explode(V3(a.x, ctx.waterY, a.z), 'water', 0.5);
        else muzzle(a, w.path === 'vertical' ? V3(0, 1, 0) : dir, 0.5);
        const end = w.proximity ? b.clone().add(V3(rnd(-4, 4), rnd(2, 5), rnd(-4, 4))) : b;
        projectile({ fn: path(w.path, a, end), dur, mesh: missileMesh(w.size), trail: missileTrail(w.size, w.big), arrive: () => { hit(end, w.big ? 2 : w.proximity ? 0.8 : 1); if (w.big) { shockwave(V3(end.x, ctx.heightAt(end.x, end.z) + 1, end.z), 1.4); } } });
        return dur;
      }
      case 'bombs': {
        const dur = 700 * speedK;
        for (let i = 0; i < w.n; i++) {
          const along = (i - (w.n - 1) / 2) * 7, end = b.clone().addScaledVector(dir, along).add(V3(rnd(-2, 2), 0, rnd(-2, 2)));
          const st = a.clone().addScaledVector(dir, along * 0.4 - 6);
          const m = new THREE.Mesh(G_MSL, M_DARK); m.scale.set(4, 1.2, 1.2);
          projectile({ fn: t => V3(st.x + (end.x - st.x) * t, st.y + (end.y - st.y) * t * t, st.z + (end.z - st.z) * t), dur, mesh: m, delay: i * 90 * speedK,
            trail: w.guided ? p => smoke.emit({ p, life: 0.4, s0: 1, s1: 3, c0: '#e5e7eb', a: 0.3 }) : null, arrive: () => { i === 0 ? hit(end, 1) : explode(end, kind, 0.9); } });
        }
        return dur;
      }
      case 'strafe': {   // 機砲掃射：一長串曳光彈，地面一路被打起塵土
        const dur = 200 * speedK;
        for (let i = 0; i < w.n; i++) {
          const along = (i / (w.n - 1) - 0.6) * 30, end = b.clone().addScaledVector(dir, along).add(V3(rnd(-2, 2), 0, rnd(-2, 2)));
          const m = new THREE.Mesh(G_TRACER, glow('#ffcf70')); m.scale.set(8, 0.7, 0.7);
          const st = a.clone().addScaledVector(dir, along * 0.3);
          projectile({ fn: t => st.clone().lerp(end, t), dur, mesh: m, delay: i * w.gap * speedK, arrive: () => { m.material.dispose(); i === Math.round(w.n * 0.6) ? hit(end, 0.6) : (fire.emit({ p: end, life: 0.1, s0: 5, c0: '#ffe9a8' }), smoke.emit({ p: end, v: V3(0, 20, 0), life: 0.9, s0: 4, s1: 10, c0: '#a08c6a', a: 0.55 })); } });
        }
        return dur + w.n * w.gap * 0.6 * speedK;
      }
      case 'flak': {    // 高射砲：成串曳光彈打上空，目標周圍出現黑色空爆
        const dur = Math.max(150, d * 1.1) * speedK;
        for (let i = 0; i < w.n; i++) {
          const end = b.clone().add(V3(rnd(-10, 10), rnd(-4, 10), rnd(-10, 10))), m = new THREE.Mesh(G_TRACER, glow('#ffb347'));
          m.scale.set(8, 0.8, 0.8);
          later(i * w.gap * speedK, () => muzzle(a, end.clone().sub(a).normalize(), 0.4));
          projectile({ fn: t => a.clone().lerp(end, t), dur, mesh: m, delay: i * w.gap * speedK, arrive: () => { m.material.dispose(); airburst(end); if (i === w.n - 1) hit(b, 0.5); } });
        }
        return dur + w.n * w.gap * speedK;
      }
      case 'beam': {
        const len = d, m = new THREE.Mesh(G_MSL, glow(w.col)); m.scale.set(len, 1.6, 1.6);
        m.position.copy(a.clone().lerp(b, 0.5)); m.quaternion.setFromUnitVectors(XAXIS, b.clone().sub(a).normalize());
        const core = new THREE.Mesh(G_MSL, glow('#ffffff')); core.scale.set(1, 0.4, 0.4); m.add(core);
        const dur = 450 * speedK;
        shots.push({ t0: performance.now(), dur, mesh: m, upd(t) { if (!this.on) { this.on = 1; ctx.fxScene.add(m); } m.material.opacity = 0.9 * (1 - t * t); if (Math.random() < 0.6) fire.emit({ p: b.clone().add(V3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))), v: V3(rnd(-30, 30), rnd(10, 40), rnd(-30, 30)), life: 0.25, s0: 3, s1: 1, c0: '#e0faff', c1: '#22d3ee' }); },
          done() { ctx.fxScene.remove(m); m.material.dispose(); core.material.dispose(); } });
        later(dur * 0.5, () => hit(b, 0.6));
        return dur * 0.5;
      }
      case 'torpedo': {   // 魚雷：水面下航行留下白色航跡，命中時炸起高水柱
        const sY = ctx.waterY - 1, st = w.drop || w.asroc ? V3(b.x - dir.x * 30, sY, b.z - dir.z * 30) : V3(a.x, sY, a.z);
        let lead = 0;
        if (w.drop || w.asroc) { lead = 450 * speedK; projectile({ fn: path(w.asroc ? 'arc' : 'default', a, V3(st.x, ctx.waterY, st.z)), dur: lead, mesh: missileMesh(0.6), trail: w.asroc ? missileTrail(0.6) : null, arrive: () => explode(V3(st.x, ctx.waterY, st.z), 'water', 0.3) }); }
        const end = V3(b.x, sY, b.z), dur = (500 + st.distanceTo(end) * 1.2) * speedK;
        projectile({ fn: t => st.clone().lerp(end, t), dur, delay: lead, trail: p => smoke.emit({ p: V3(p.x, ctx.waterY + 0.3, p.z), life: 1.6, s0: 3, s1: 9, c0: '#f8fafc', a: 0.5, drag: 2 }),
          arrive: () => { explode(V3(b.x, ctx.waterY, b.z), 'water', 1.6); hit(V3(b.x, ctx.waterY + 4, b.z), 1); } });
        return lead + dur;
      }
      case 'swarm': {
        const dur = (350 + d * 0.5) * speedK;
        for (let i = 0; i < w.n; i++) {
          const off = V3(rnd(-8, 8), rnd(-2, 8), rnd(-8, 8)), m = new THREE.Mesh(G_ROUND, glow('#67e8f9')); m.scale.setScalar(0.9);
          const c = a.clone().lerp(b, 0.5).add(V3(rnd(-20, 20), rnd(10, 30), rnd(-20, 20)));
          projectile({ fn: t => { const u = 1 - t; return a.clone().multiplyScalar(u * u).addScaledVector(c, 2 * u * t).addScaledVector(b.clone().add(off), t * t); }, dur, mesh: m, delay: i * 40 * speedK,
            trail: p => fire.emit({ p, life: 0.15, s0: 2, c0: '#a5f3fc' }), arrive: () => { m.material.dispose(); i === 0 ? hit(b, 0.5) : fire.emit({ p: b.clone().add(off), life: 0.15, s0: 6, c0: '#e0faff' }); } });
        }
        return dur;
      }
      case 'airstrike': {   // 航艦：艦載機從空中發射飛彈俯衝打擊
        const dur = 900 * speedK;
        for (let i = 0; i < w.n; i++) {
          const st = b.clone().add(V3(-dir.x * 120 + rnd(-30, 30), 110 + rnd(0, 30), -dir.z * 120 + rnd(-30, 30))), end = b.clone().add(V3(rnd(-6, 6), 0, rnd(-6, 6)));
          projectile({ fn: path('default', st, end), dur, mesh: missileMesh(0.7), delay: i * 120 * speedK, trail: missileTrail(0.7), arrive: () => { i === 0 ? hit(end, 0.9) : explode(end, kind, 0.7); } });
        }
        return dur;
      }
    }
    return 0;
    void attackerAir;
  }

  // ---- 擊毀：模型變成殘骸（地面燃燒下沉、飛機冒煙墜落、艦艇傾斜沉沒、步兵倒下淡出）----
  function wreck(mesh, info) {
    mesh.material = wreckMat;
    mesh.traverse(o => { if (o !== mesh && o.isMesh) o.material = wreckMat; });
    const p = mesh.position.clone(), s = info.big ? 1.8 : info.inf ? 0.5 : 1.2;
    explode(p.clone().add(V3(0, info.h * 0.5, 0)), info.air ? 'air' : info.sea ? 'ship' : 'land', s);
    if (!info.inf) { shockwave(V3(p.x, (info.sea ? ctx.waterY : ctx.heightAt(p.x, p.z)) + 0.8, p.z), s); }
    const roll = rnd(-0.35, 0.35), pitch = rnd(-0.12, 0.12), yaw0 = mesh.rotation.y;
    const fwd = V3(Math.cos(yaw0), 0, -Math.sin(yaw0));
    wrecks.push({ mesh, info, p, t0: performance.now(), last: performance.now(), roll, pitch, fwd, vy: 0, crashed: false });
  }
  function updWreck(w, now, dt) {
    const age = (now - w.t0) / 1000, m = w.mesh, info = w.info;
    if (info.air) {
      if (!w.crashed) {
        // 失控墜落：向前滑行、加速下墜、機身翻滾，拖著黑煙與火
        w.vy += 70 * dt;
        m.position.addScaledVector(w.fwd, 40 * dt); m.position.y -= w.vy * dt;
        m.rotation.x += 3.2 * dt; m.rotation.z = Math.min(0.9, m.rotation.z + 0.8 * dt);
        fire.emit({ p: m.position.clone(), life: 0.25, s0: 8, s1: 4, c0: '#ffd27a', c1: '#ff4d00' });
        smoke.emit({ p: m.position.clone(), v: V3(rnd(-3, 3), rnd(2, 6), rnd(-3, 3)), life: 2.6, s0: 6, s1: 20, c0: '#1f1f1f', c1: '#555', a: 0.7, drag: 0.8 });
        const gy = ctx.isWater(m.position.x, m.position.z) ? ctx.waterY : ctx.heightAt(m.position.x, m.position.z);
        if (m.position.y <= gy + 1 || age > 3) { w.crashed = true; w.tc = now; explode(m.position.clone(), ctx.isWater(m.position.x, m.position.z) ? 'water' : 'land', 1.2); m.visible = false; }
      }
      return w.crashed && now - w.tc > 200;
    }
    if (info.sea) {
      // 傾斜沉沒：先側傾、再船艏下沉，水面冒泡
      const k = Math.min(1, age / 3.5);
      m.rotation.z = w.roll * 2 * k; m.rotation.x = 0.25 * k * Math.sign(w.roll || 1);
      m.position.y = w.p.y - k * k * (info.h + 14);
      if (age < 3.5) { if (Math.random() < 0.5) smoke.emit({ p: w.p.clone().add(V3(rnd(-12, 12), info.h * (1 - k), rnd(-4, 4))), v: V3(0, rnd(10, 18), 0), life: 2.4, s0: 8, s1: 26, c0: '#262626', c1: '#6b6b6b', a: 0.6, fadeIn: true });
        if (Math.random() < 0.35) fire.emit({ p: w.p.clone().add(V3(rnd(-10, 10), Math.max(1, info.h * (1 - k) * 0.6), rnd(-3, 3))), v: V3(0, 12, 0), life: 0.5, s0: 8, s1: 3, c0: '#ffd27a', c1: '#ff4d00' });
        if (Math.random() < 0.4) smoke.emit({ p: V3(w.p.x + rnd(-14, 14), ctx.waterY + 0.3, w.p.z + rnd(-5, 5)), v: V3(0, 6, 0), life: 0.8, s0: 2, s1: 5, c0: '#f1f5f9', a: 0.7 }); }
      return age > 4;
    }
    if (info.inf) {
      const k = Math.min(1, age / 0.8);
      m.rotation.z = w.roll + 1.3 * k * Math.sign(w.roll || 1); m.position.y = w.p.y - k * 6;
      return age > 1;
    }
    // 地面車輛：焦黑歪斜、持續燃燒冒黑煙，最後沉入地面
    m.rotation.z = w.roll * Math.min(1, age * 4); m.rotation.x = w.pitch * Math.min(1, age * 4);
    if (age < 3.2) {
      if (Math.random() < 0.55) smoke.emit({ p: w.p.clone().add(V3(rnd(-4, 4), info.h * 0.8, rnd(-4, 4))), v: V3(rnd(-2, 2), rnd(14, 22), rnd(-2, 2)), life: 2.8, s0: 7, s1: 28, c0: '#1c1c1c', c1: '#5a5a5a', a: 0.65, fadeIn: true });
      if (Math.random() < 0.5) fire.emit({ p: w.p.clone().add(V3(rnd(-6, 6), info.h * 0.6, rnd(-5, 5))), v: V3(0, rnd(10, 20), 0), life: 0.45, s0: 9, s1: 3, c0: '#ffd27a', c1: '#ff4d00' });
    }
    if (age > 3.2) m.position.y = w.p.y - (age - 3.2) / 0.8 * (info.h + 4);
    return age > 4;
  }

  let lastT = performance.now();
  return {
    weaponFor, fire: fire3D, wreck, explode,
    get busy() { return shots.length + wrecks.length + fire.alive + smoke.alive > 0; },
    // 每幀更新
    update(now, uScale) {
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      fire.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = uScale;
      for (let i = timers.length - 1; i >= 0; i--) if (now >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        if (now < s.t0) continue;
        const t = Math.min(1, (now - s.t0) / Math.max(1, s.dur));
        s.upd(t);
        if (t >= 1) { shots.splice(i, 1); s.done(); }
      }
      for (let i = wrecks.length - 1; i >= 0; i--) if (updWreck(wrecks[i], now, dt)) { const w = wrecks[i]; wrecks.splice(i, 1); w.mesh.parent && w.mesh.parent.remove(w.mesh); }
      for (let i = decals.length - 1; i >= 0; i--) { const d = decals[i], age = (now - d.t0) / 1000; if (age > 8) { ctx.scene.remove(d.m); d.m.material.dispose(); decals.splice(i, 1); } else if (age > 5) d.m.material.opacity = 0.55 * (8 - age) / 3; }
      fire.update(dt); smoke.update(dt); debris.update(dt);
    },
    clear() {
      for (const s of shots) s.done && s.mesh && ctx.fxScene.remove(s.mesh);
      shots.length = 0; timers.length = 0;
      for (const w of wrecks) w.mesh.parent && w.mesh.parent.remove(w.mesh);
      wrecks.length = 0;
      for (const d of decals) { ctx.scene.remove(d.m); d.m.material.dispose(); }
      decals.length = 0;
    },
  };
}
