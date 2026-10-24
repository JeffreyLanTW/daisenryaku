'use strict';
// ===== 90 年代大戰略工業管弦戰術配樂與音效引擎（48kHz / -16 LUFS 無縫迴圈合成） =====

const AUDIO = {
  ctx: null,
  master: null,
  music: null,
  sfx: null,
  noiseWhite: null,
  noisePink: null,
  on: { music: true, sfx: true, track: 0 },
  gen: 0,
  bgmSource: null,
  bgmGain: null,
  bgmCache: {},
  tense: false,
  manual: false,
  lastAt: {},
  lastActionAt: 0,
};

try {
  const saved = JSON.parse(localStorage.getItem('daisenryaku_audio'));
  if (saved && typeof saved === 'object') {
    if (typeof saved.music === 'boolean') AUDIO.on.music = saved.music;
    if (typeof saved.sfx === 'boolean') AUDIO.on.sfx = saved.sfx;
    if (typeof saved.track === 'number') AUDIO.on.track = saved.track;
  }
} catch (e) { /* 忽略 */ }

function saveAudio() {
  try {
    localStorage.setItem('daisenryaku_audio', JSON.stringify({
      music: AUDIO.on.music,
      sfx: AUDIO.on.sfx,
      track: AUDIO.on.track,
    }));
  } catch (e) { /* 忽略 */ }
}

// 建立白噪音與 1/f 粉紅噪音緩衝區（供即時 SFX 與離線 BGM 共用）
function createNoiseBuffers(ctx, durSec = 3.0) {
  const len = Math.floor(ctx.sampleRate * durSec);
  const wBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const pBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const wData = wBuf.getChannelData(0);
  const pData = pBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  // 使用固定確定性種子生成離線可重現的粉紅噪音，消除循環接縫差異
  let seed = 0x6d2b79f5;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
  };
  for (let i = 0; i < len; i++) {
    const white = rand();
    wData[i] = white;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    pData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.18;
    b6 = white * 0.115926;
  }
  return { white: wBuf, pink: pBuf };
}

function audioInit() {
  if (typeof window === 'undefined') return;
  if (AUDIO.ctx) {
    if (AUDIO.ctx.state === 'suspended' || AUDIO.ctx.state === 'interrupted') {
      AUDIO.ctx.resume().then(() => {
        if (AUDIO.on.music && !AUDIO.bgmSource) startMusic();
      }).catch(() => {});
    } else if (AUDIO.on.music && !AUDIO.bgmSource) {
      startMusic();
    }
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let c;
  try {
    c = new AC({ sampleRate: 48000, latencyHint: 'interactive' });
  } catch (e) {
    try { c = new AC(); } catch (err) { return; }
  }
  AUDIO.ctx = c;

  const master = c.createGain();
  master.gain.value = 0.90;
  master.connect(c.destination);
  AUDIO.master = master;

  // 主匯流排動態壓縮器（維持寬廣動態並防止峰值削波）
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  comp.connect(master);

  // BGM 專用母帶濾波鏈：切除極低頻混濁 + 挖空中高頻（2.1kHz -4.5dB）讓戰術 SFX 清晰浮現 + 溫潤高頻滾降
  const bgmHp = c.createBiquadFilter();
  bgmHp.type = 'highpass';
  bgmHp.frequency.value = 36;
  bgmHp.Q.value = 0.7;

  const bgmDip = c.createBiquadFilter();
  bgmDip.type = 'peaking';
  bgmDip.frequency.value = 2150;
  bgmDip.Q.value = 0.95;
  bgmDip.gain.value = -4.5;

  const bgmLp = c.createBiquadFilter();
  bgmLp.type = 'lowpass';
  bgmLp.frequency.value = 5200;
  bgmLp.Q.value = 0.65;

  const musicBus = c.createGain();
  // 配合離線 -16 LUFS 母帶標準化，設定平順舒適的背景音樂工作電平
  musicBus.gain.value = AUDIO.on.music ? 0.42 : 0;
  musicBus.connect(bgmHp);
  bgmHp.connect(bgmDip);
  bgmDip.connect(bgmLp);
  bgmLp.connect(comp);
  AUDIO.music = musicBus;

  // 戰術音效匯流排（直入主壓縮器，保留完整中高頻穿透力）
  const sfxBus = c.createGain();
  sfxBus.gain.value = AUDIO.on.sfx ? 0.68 : 0;
  sfxBus.connect(comp);
  AUDIO.sfx = sfxBus;

  const bufs = createNoiseBuffers(c, 3.0);
  AUDIO.noiseWhite = bufs.white;
  AUDIO.noisePink = bufs.pink;

  if (AUDIO.on.music) startMusic();
}

function setAudio(kind, on) {
  AUDIO.on[kind] = !!on;
  saveAudio();
  if (!AUDIO.ctx) audioInit();
  if (!AUDIO.ctx) return;
  const c = AUDIO.ctx;
  if (kind === 'music') {
    AUDIO.music.gain.cancelScheduledValues(c.currentTime);
    if (AUDIO.on.music) {
      AUDIO.music.gain.setTargetAtTime(0.42, c.currentTime, 0.04);
      startMusic();
    } else {
      AUDIO.music.gain.setTargetAtTime(0, c.currentTime, 0.03);
      stopMusic();
    }
  } else if (kind === 'sfx') {
    AUDIO.sfx.gain.cancelScheduledValues(c.currentTime);
    AUDIO.sfx.gain.setTargetAtTime(AUDIO.on.sfx ? 0.68 : 0, c.currentTime, 0.02);
  }
}

// ----- 合成基礎積木（安全防呆、自動釋放節點） -----
function env(g, t, attack, peak, decay, end = 0.0001) {
  const a = Math.max(0.002, attack);
  const d = Math.max(0.01, decay);
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), t + a + d);
}

function noiseHit(dest, t, {
  dur = 0.25, peak = 0.5, type = 'lowpass', freq = 1000, q = 0.8,
  toFreq = 0, attack = 0.004, pink = true, ctx = AUDIO.ctx, buf = null, offset = null,
} = {}) {
  const c = ctx;
  const b = buf || (pink ? AUDIO.noisePink : AUDIO.noiseWhite);
  if (!c || !b) return;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = b;
  f.type = type;
  f.frequency.setValueAtTime(Math.max(30, freq), t);
  f.Q.value = q;
  if (toFreq > 0) {
    f.frequency.exponentialRampToValueAtTime(Math.max(30, toFreq), t + attack + dur);
  }
  env(g, t, attack, peak, dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  const totalDur = attack + dur;
  const maxOffset = Math.max(0.01, b.duration - totalDur - 0.08);
  const startOff = offset != null ? (offset % maxOffset) : (Math.random() * maxOffset);
  if (c === AUDIO.ctx) {
    src.onended = () => {
      try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* 忽略 */ }
    };
  }
  src.start(t, startOff);
  src.stop(t + totalDur + 0.03);
}

function tone(dest, t, {
  freq = 440, dur = 0.18, peak = 0.25, type = 'triangle',
  to = 0, attack = 0.004, cutoff = 0, ctx = AUDIO.ctx,
} = {}) {
  const c = ctx;
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (to > 0) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + attack + dur);
  }
  let f = null;
  if (cutoff > 0) {
    f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    o.connect(f);
    f.connect(g);
  } else {
    o.connect(g);
  }
  env(g, t, attack, peak, dur);
  g.connect(dest);
  if (c === AUDIO.ctx) {
    o.onended = () => {
      try { o.disconnect(); if (f) f.disconnect(); g.disconnect(); } catch (e) { /* 忽略 */ }
    };
  }
  o.start(t);
  o.stop(t + attack + dur + 0.03);
}

// ----- 戰術音效庫（15 種清脆高辨識度戰場音效） -----
function sfx(name, opt = {}) {
  if (!AUDIO.on.sfx || typeof window === 'undefined') return;
  if (!AUDIO.ctx) audioInit();
  const c = AUDIO.ctx;
  if (!c) return;
  if (c.state !== 'running') {
    c.resume().catch(() => {});
    return;
  }

  const now = performance.now();
  if (name === 'click' && now - AUDIO.lastActionAt < 65) return;
  const minGap = name === 'click' ? 35 : 45;
  if (now - (AUDIO.lastAt[name] || 0) < minGap) return;
  AUDIO.lastAt[name] = now;
  if (name !== 'click') AUDIO.lastActionAt = now;

  const t = c.currentTime + 0.008;
  const D = AUDIO.sfx;

  switch (name) {
    case 'click':
      tone(D, t, { freq: 620, to: 260, dur: 0.022, peak: 0.09, type: 'triangle', attack: 0.002 });
      noiseHit(D, t, { dur: 0.012, peak: 0.05, type: 'bandpass', freq: 1800, q: 1.5, pink: false });
      break;
    case 'gun':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.072;
        tone(D, tk, { freq: 195, to: 58, dur: 0.045, peak: 0.30, type: 'triangle', attack: 0.002 });
        noiseHit(D, tk, { dur: 0.052, peak: 0.34, type: 'bandpass', freq: 1450, toFreq: 520, q: 1.1 });
      }
      break;
    case 'mg':
      for (let k = 0; k < 5; k++) {
        const tk = t + k * 0.048;
        tone(D, tk, { freq: 230, to: 65, dur: 0.035, peak: 0.26, type: 'triangle', attack: 0.002 });
        noiseHit(D, tk, { dur: 0.038, peak: 0.28, type: 'bandpass', freq: 1200, toFreq: 450, q: 1.2 });
      }
      break;
    case 'cannon':
      tone(D, t, { freq: 135, to: 28, dur: 0.32, peak: 0.58, type: 'sine', attack: 0.003 });
      noiseHit(D, t, { dur: 0.26, peak: 0.60, type: 'lowpass', freq: 1500, toFreq: 160, q: 0.9, attack: 0.003 });
      noiseHit(D, t + 0.03, { dur: 0.38, peak: 0.36, type: 'lowpass', freq: 340, toFreq: 75, q: 0.7, attack: 0.015 });
      break;
    case 'missile':
      tone(D, t, { freq: 210, to: 72, dur: 0.06, peak: 0.26, type: 'sine', attack: 0.003 });
      noiseHit(D, t + 0.015, { dur: 0.44, peak: 0.36, type: 'bandpass', freq: 440, toFreq: 1300, q: 1.3, attack: 0.045 });
      tone(D, t + 0.03, { freq: 520, to: 880, dur: 0.28, peak: 0.05, type: 'sine', attack: 0.04 });
      break;
    case 'jet':
      noiseHit(D, t, { dur: 0.42, peak: 0.22, type: 'bandpass', freq: 320, toFreq: 660, q: 1.4, attack: 0.10 });
      tone(D, t, { freq: 115, to: 155, dur: 0.38, peak: 0.09, type: 'triangle', attack: 0.09, cutoff: 380 });
      break;
    case 'explode':
      if (opt.big) {
        tone(D, t, { freq: 96, to: 22, dur: 0.52, peak: 0.68, type: 'sine', attack: 0.003 });
        noiseHit(D, t, { dur: 0.58, peak: 0.65, type: 'lowpass', freq: 1150, toFreq: 85, q: 0.85, attack: 0.004 });
        tone(D, t + 0.13, { freq: 74, to: 20, dur: 0.46, peak: 0.45, type: 'triangle', attack: 0.005, cutoff: 220 });
        noiseHit(D, t + 0.13, { dur: 0.60, peak: 0.48, type: 'lowpass', freq: 580, toFreq: 60, q: 0.75, attack: 0.01 });
      } else {
        tone(D, t, { freq: 112, to: 30, dur: 0.28, peak: 0.50, type: 'sine', attack: 0.003 });
        noiseHit(D, t, { dur: 0.34, peak: 0.50, type: 'lowpass', freq: 920, toFreq: 115, q: 0.8, attack: 0.004 });
      }
      break;
    case 'engine':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.085;
        tone(D, tk, { freq: 56 + k * 5, to: 48 + k * 4, dur: 0.09, peak: 0.18, type: 'triangle', attack: 0.008, cutoff: 240 });
        noiseHit(D, tk, { dur: 0.08, peak: 0.14, type: 'lowpass', freq: 260, q: 0.8, attack: 0.008 });
      }
      break;
    case 'foot':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.105;
        tone(D, tk, { freq: 95, to: 44, dur: 0.04, peak: 0.16, type: 'sine', attack: 0.003 });
        noiseHit(D, tk, { dur: 0.045, peak: 0.20, type: 'lowpass', freq: 340, toFreq: 140, q: 0.7, attack: 0.003 });
      }
      break;
    case 'wave':
      noiseHit(D, t, { dur: 0.42, peak: 0.22, type: 'lowpass', freq: 440, toFreq: 170, q: 0.9, attack: 0.07 });
      noiseHit(D, t + 0.08, { dur: 0.28, peak: 0.12, type: 'bandpass', freq: 620, toFreq: 240, q: 1.1, attack: 0.05 });
      break;
    case 'capture':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
        const tk = t + k * 0.085;
        const d = k === 3 ? 0.26 : 0.15;
        tone(D, tk, { freq: f, dur: d, peak: 0.18, type: 'triangle', attack: 0.005, cutoff: 2400 });
        tone(D, tk, { freq: f * 0.5, dur: d, peak: 0.08, type: 'sine', attack: 0.005 });
      });
      break;
    case 'build':
      noiseHit(D, t, { dur: 0.025, peak: 0.14, type: 'bandpass', freq: 1100, toFreq: 380, q: 1.2 });
      tone(D, t, { freq: 392.0, dur: 0.10, peak: 0.18, type: 'triangle', attack: 0.004, cutoff: 1800 });
      tone(D, t + 0.085, { freq: 587.33, dur: 0.15, peak: 0.20, type: 'triangle', attack: 0.004, cutoff: 2000 });
      break;
    case 'turn':
      tone(D, t, { freq: 440.0, dur: 0.14, peak: 0.15, type: 'triangle', attack: 0.006, cutoff: 1800 });
      tone(D, t + 0.10, { freq: 659.25, dur: 0.22, peak: 0.17, type: 'triangle', attack: 0.006, cutoff: 2000 });
      tone(D, t + 0.10, { freq: 329.63, dur: 0.22, peak: 0.08, type: 'sine', attack: 0.006 });
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
        const tk = t + k * 0.11;
        const d = k === 4 ? 0.45 : 0.18;
        tone(D, tk, { freq: f, dur: d, peak: 0.18, type: 'triangle', attack: 0.006, cutoff: 2400 });
        tone(D, tk, { freq: f * 0.5, dur: d, peak: 0.10, type: 'sine', attack: 0.006 });
      });
      break;
    case 'lose':
      [440.0, 392.0, 349.23, 293.66].forEach((f, k) => {
        const tk = t + k * 0.20;
        const d = k === 3 ? 0.48 : 0.22;
        tone(D, tk, { freq: f, dur: d, peak: 0.16, type: 'triangle', attack: 0.01, cutoff: 1400 });
        tone(D, tk, { freq: f * 0.5, dur: d, peak: 0.10, type: 'sine', attack: 0.01 });
      });
      break;
  }
}

function sfxFire(base) {
  if (['inf', 'marine'].includes(base)) sfx('gun');
  else if (['atinf', 'rocket', 'sam', 'fighter', 'stealth'].includes(base)) sfx('missile');
  else if (['aa', 'recon', 'heli', 'attacker'].includes(base)) sfx('mg');
  else sfx('cannon');
}

function sfxMove(u) {
  const d = UNITS[u.type];
  if (!d) return;
  if (d.cat === 'air') sfx('jet');
  else if (d.cat === 'sea' || d.mt === 'amph') sfx('wave');
  else if (d.mt === 'foot') sfx('foot');
  else sfx('engine');
}

// ===== 90 年代大戰略工業管弦 BGM 離線合成與無縫迴圈引擎 =====
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

function connectPan(ctx, node, dest, pan = 0) {
  if (ctx.createStereoPanner && pan !== 0) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), 0);
    node.connect(p);
    p.connect(dest);
  } else {
    node.connect(dest);
  }
}

// 1. 管弦銅管群（French Horn / Trombone Section：雙振盪微調諧 + 包絡低通共鳴濾波）
function synthOrchBrass(ctx, dest, t, freq, dur, peak = 0.12, pan = -0.15) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 1.3;
  f.frequency.setValueAtTime(340, t);
  f.frequency.exponentialRampToValueAtTime(1680, t + Math.min(0.09, dur * 0.35));
  f.frequency.exponentialRampToValueAtTime(920, t + dur);

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'triangle';
  o1.frequency.setValueAtTime(freq * 0.997, t);
  o2.frequency.setValueAtTime(freq * 1.003, t);

  const atk = Math.min(0.045, dur * 0.25);
  env(g, t, atk, peak, dur);
  o1.connect(f);
  o2.connect(f);
  f.connect(g);
  connectPan(ctx, g, dest, pan);
  o1.start(t); o1.stop(t + atk + dur + 0.03);
  o2.start(t); o2.stop(t + atk + dur + 0.03);
}

// 2. 低音弦樂群與管弦襯底（Low Strings & Warm Pad：立體聲雙聲部展開）
function synthOrchStrings(ctx, dest, t, chord, dur, peak = 0.055) {
  chord.forEach((n, idx) => {
    const freq = midi(n);
    const pan = (idx - (chord.length - 1) / 2) * 0.35;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1150, t);
    f.Q.value = 0.7;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sine';
    o1.frequency.setValueAtTime(freq * (idx % 2 === 0 ? 0.996 : 1.004), t);
    o2.frequency.setValueAtTime(freq * 0.5, t);

    const atk = Math.min(0.24, dur * 0.22);
    env(g, t, atk, peak, dur - atk * 0.5);
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    connectPan(ctx, g, dest, pan);
    o1.start(t); o1.stop(t + atk + dur + 0.05);
    o2.start(t); o2.stop(t + atk + dur + 0.05);
  });
}

// 3. 90 年代工業合成貝斯（Grounded Industrial Bass：方波＋鋸齒低八度＋共鳴濾波包絡）
function synthIndBass(ctx, dest, t, freq, dur, peak = 0.22, accent = false) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = accent ? 2.4 : 1.4;
  f.frequency.setValueAtTime(accent ? 980 : 620, t);
  f.frequency.exponentialRampToValueAtTime(150, t + dur);

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'square';
  o1.frequency.setValueAtTime(freq, t);
  o2.frequency.setValueAtTime(freq * 0.5, t);

  env(g, t, 0.006, peak, dur);
  o1.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(dest);
  o1.start(t); o1.stop(t + dur + 0.03);
  o2.start(t); o2.stop(t + dur + 0.03);
}

// 4. 戰情室戰術合成琶音（Tactical Pluck / FM Chime）
function synthTacticalArp(ctx, dest, t, freq, dur, peak = 0.055, pan = 0.25) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1650, t);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, t);
  env(g, t, 0.005, peak, dur);
  o.connect(f);
  f.connect(g);
  connectPan(ctx, g, dest, pan);
  o.start(t); o.stop(t + dur + 0.03);
}

// 5. 工業管弦打擊樂組（定音鼓大鼓、軍鼓、工業機械脈衝）
function synthIndPerc(ctx, dest, pNoise, t, kind, stepIdx = 0) {
  const off = (stepIdx * 0.137) % 1.8;
  if (kind === 'kick') {
    tone(dest, t, { ctx, freq: 98, to: 34, dur: 0.19, peak: 0.44, type: 'sine', attack: 0.003 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.06, peak: 0.16, type: 'lowpass', freq: 240, toFreq: 70 });
  } else if (kind === 'snare') {
    tone(dest, t, { ctx, freq: 175, to: 82, dur: 0.09, peak: 0.20, type: 'triangle', attack: 0.002 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.13, peak: 0.22, type: 'bandpass', freq: 1150, toFreq: 520, q: 1.0 });
  } else if (kind === 'hat') {
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.042, peak: 0.075, type: 'bandpass', freq: 2800, q: 1.6 });
  } else if (kind === 'timp') {
    tone(dest, t, { ctx, freq: 110, to: 52, dur: 0.38, peak: 0.36, type: 'sine', attack: 0.005 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.16, peak: 0.14, type: 'lowpass', freq: 320, toFreq: 110 });
  }
}

// 通用 4 樂句（64 步 = 16 小節完整起承轉合）工業管弦編曲渲染器
function scheduleArrangement(ctx, dest, pNoise, cfg) {
  const sp = 60 / cfg.bpm / 4;
  const totalSteps = 128; // 8 個小節 × 16 步（涵蓋 A/B/C/D 四大樂句段落）
  for (let s = 0; s < totalSteps; s++) {
    const t = s * sp;
    const bar = Math.floor(s / 16) % cfg.chords.length;
    const pos = s % 16;
    const phrase = Math.floor(bar / 2); // 0:Intro/Ostinato, 1:Brass Theme, 2:Counter/Tension, 3:Climax/Turnaround
    const ch = cfg.chords[bar];

    // 管弦長音弦樂墊底（每小節第 0 拍與第 8 拍交替呼吸）
    if (pos === 0) {
      const padMult = phrase === 0 ? 0.8 : (phrase === 3 ? 1.15 : 1.0);
      synthOrchStrings(ctx, dest, t, ch, sp * 15.8, (cfg.padPeak || 0.052) * padMult);
    }
    if (cfg.stab && cfg.stab[pos] && phrase >= 1) {
      for (const n of ch) {
        synthOrchBrass(ctx, dest, t, midi(n), sp * 2.2, 0.048, 0.18);
      }
    }

    // 工業合成貝斯線
    const bMode = cfg.bass || 'march';
    if (bMode === 'drive') {
      if (pos % 2 === 0) {
        const oct = (pos % 4 === 2) ? 0 : -12;
        const acc = (pos === 0 || pos === 6 || pos === 12);
        synthIndBass(ctx, dest, t, midi(ch[0] + oct), sp * 1.75, acc ? 0.23 : 0.18, acc);
      }
    } else if (bMode === 'hq') {
      if ([0, 3, 6, 8, 10, 12, 14].includes(pos)) {
        const n = ch[pos % ch.length] - 12;
        synthIndBass(ctx, dest, t, midi(n), sp * 1.9, pos === 0 ? 0.22 : 0.17, pos === 0 || pos === 8);
      }
    } else if (bMode === 'fleet') {
      if (pos === 0 || pos === 6 || pos === 8 || pos === 12) {
        const dur = (pos === 0 || pos === 8) ? sp * 5.2 : sp * 3.2;
        synthIndBass(ctx, dest, t, midi(ch[0] - 12), dur, 0.22, pos === 0);
      }
    } else {
      if ([0, 4, 8, 12, 14].includes(pos)) {
        const note = pos === 14 ? ch[1] - 12 : ch[0] - 12;
        synthIndBass(ctx, dest, t, midi(note), sp * 3.1, pos === 0 ? 0.22 : 0.18, pos % 8 === 0);
      }
    }

    // 工業與軍武打擊樂（依樂句動態推進）
    if (cfg.kick && cfg.kick[pos]) synthIndPerc(ctx, dest, pNoise, t, 'kick', s);
    if (cfg.snare && cfg.snare[pos] && (phrase > 0 || pos === 4 || pos === 12)) {
      synthIndPerc(ctx, dest, pNoise, t, 'snare', s);
    }
    if (cfg.hat && cfg.hat[pos] && phrase >= 1) {
      synthIndPerc(ctx, dest, pNoise, t, 'hat', s);
    }
    if (pos === 0 && (bar % 2 === 0)) {
      synthIndPerc(ctx, dest, pNoise, t, 'timp', s);
    }

    // 戰術雷達琶音（中低音量點綴立體空間）
    if (cfg.arp && (pos % cfg.arp === 0) && (phrase !== 1 || pos % 4 === 0)) {
      const an = ch[(pos / cfg.arp) % ch.length] + 12;
      const pan = ((s % 4) - 1.5) * 0.25;
      synthTacticalArp(ctx, dest, t, midi(an), sp * 1.5, 0.048, pan);
    }

    // 管弦銅管主旋律與對位聲部
    const mel = cfg.melody[s % cfg.melody.length];
    if (mel > 0) {
      // 第一樂句（Intro）以低八度法國號溫和鋪陳，後續樂句展現完整銅管主題
      const note = phrase === 0 ? mel - 12 : mel;
      const pk = phrase === 0 ? 0.085 : (phrase === 3 ? 0.13 : 0.115);
      synthOrchBrass(ctx, dest, t, midi(note), sp * (cfg.leadDur || 2.2), pk, -0.12);
      if (phrase === 3 && mel >= 67) {
        // 第四樂句高潮疊加五度／八度低音銅管厚實合奏
        synthOrchBrass(ctx, dest, t, midi(note - 12), sp * (cfg.leadDur || 2.2), pk * 0.65, 0.18);
      }
    }
  }
  return totalSteps * sp;
}

// 5 首 90 年代《大戰略》風格工業管弦曲目定義
const TRACKS = [
  {
    name: '鋼鐵序曲・前線簡報',
    desc: '工業合成脈衝與法國號低音弦樂進行曲',
    bpm: 98,
    bass: 'hq',
    arp: 2,
    leadDur: 2.3,
    chords: [
      [50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52],
      [50, 53, 57], [43, 46, 50], [45, 48, 52], [45, 49, 52],
    ],
    kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    melody: [
      62, -1, 65, -1, 69, -1, 67, 65, 64, -1, 67, -1, 65, -1, 62, -1,
      64, -1, 67, -1, 72, -1, 70, 67, 69, -1, -1, -1, 64, -1, -1, -1,
      65, -1, 69, 70, 74, -1, 72, 69, 67, -1, 70, -1, 69, -1, 65, -1,
      64, -1, 69, -1, 67, 65, 64, -1, 62, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '裝甲戰線・閃電推進',
    desc: '90 年代大戰略經典重裝合成貝斯與銅管主旋律',
    bpm: 112,
    bass: 'drive',
    arp: 2,
    leadDur: 2.1,
    stab: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
    chords: [
      [52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59],
      [52, 55, 59], [57, 60, 64], [54, 59, 63], [52, 55, 59],
    ],
    kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat:   [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
    melody: [
      64, -1, 67, 69, 71, -1, 69, 67, 64, -1, 67, 71, 72, -1, 71, 67,
      66, -1, 69, -1, 74, -1, 72, 69, 71, -1, -1, -1, 67, -1, 66, -1,
      64, -1, 71, -1, 76, -1, 74, 71, 72, -1, 76, 74, 72, -1, 69, -1,
      71, -1, 69, 67, 66, -1, 69, -1, 64, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '蒼穹防線・制空攔截',
    desc: '高速戰術序列脈衝與高昂管弦交響',
    bpm: 120,
    bass: 'drive',
    arp: 1,
    leadDur: 2.2,
    chords: [
      [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59],
      [57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64],
    ],
    kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    melody: [
      69, -1, 72, 71, 69, -1, 64, -1, 65, -1, 69, -1, 67, -1, 64, -1,
      67, -1, 71, 72, 74, -1, 72, 71, 68, -1, 71, -1, 76, -1, -1, -1,
      69, -1, 72, 74, 76, -1, 79, -1, 77, -1, 76, 74, 72, -1, 69, -1,
      68, -1, 71, 69, 68, -1, 64, -1, 69, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '聯合艦隊・大洋巡航',
    desc: '深海工業低頻共鳴、定音鼓與壯闊海戰銅管',
    bpm: 88,
    bass: 'fleet',
    arp: 4,
    padPeak: 0.064,
    leadDur: 2.8,
    chords: [
      [48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50],
      [48, 51, 55], [41, 44, 48], [43, 47, 50], [48, 51, 55],
    ],
    kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    melody: [
      67, -1, -1, 67, 72, -1, 70, 68, 67, -1, 63, -1, 68, -1, 67, -1,
      65, -1, -1, 65, 70, -1, 68, 65, 67, -1, -1, -1, 62, -1, -1, -1,
      63, -1, 67, -1, 72, -1, 75, 74, 72, -1, 68, -1, 67, -1, 65, -1,
      67, -1, 65, 63, 62, -1, 67, -1, 60, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '決戰黎明・總攻號角',
    desc: '全編制工業管弦合奏與終局決戰進行曲',
    bpm: 116,
    bass: 'drive',
    arp: 2,
    leadDur: 2.2,
    stab: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    chords: [
      [53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 51, 55],
      [49, 53, 56], [46, 49, 53], [48, 52, 55], [53, 56, 60],
    ],
    kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat:   [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
    melody: [
      65, -1, 68, 70, 72, -1, 75, -1, 73, -1, 72, 70, 68, -1, 65, -1,
      67, -1, 70, 72, 75, -1, 73, 72, 70, -1, 67, -1, 72, -1, -1, -1,
      73, -1, 77, -1, 75, 73, 72, -1, 70, -1, 73, -1, 72, 70, 68, -1,
      67, -1, 72, -1, 76, -1, 79, -1, 77, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
];

if (!(AUDIO.on.track >= 0 && AUDIO.on.track < TRACKS.length)) AUDIO.on.track = 0;

// 離線渲染單一曲目為無縫迴圈立體聲 AudioBuffer（含尾韻交叉淡化與 -16 LUFS 響度校準）
async function getRenderedTrackBuffer(trackIdx) {
  if (AUDIO.bgmCache[trackIdx]) return AUDIO.bgmCache[trackIdx];
  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAC || !AUDIO.ctx) return null;

  const cfg = TRACKS[trackIdx] || TRACKS[0];
  const sr = AUDIO.ctx.sampleRate || 48000;
  const sp = 60 / cfg.bpm / 4;
  const loopDur = 128 * sp;
  const tailDur = 8 * sp; // 預留 8 步自然殘響尾韻，將其摺疊混入迴圈開頭達成零接縫循環
  const totalSamples = Math.ceil((loopDur + tailDur) * sr);
  const loopSamples = Math.floor(loopDur * sr);
  const tailSamples = totalSamples - loopSamples;

  const octx = new OfflineAC(2, totalSamples, sr);
  const { pink } = createNoiseBuffers(octx, 2.5);
  scheduleArrangement(octx, octx.destination, pink, cfg);

  const rendered = await octx.startRendering();
  const out = AUDIO.ctx.createBuffer(2, loopSamples, sr);

  // 1. 尾韻交叉淡化（Tail-to-Head Fold）與微米級零交越（Zero-Crossing）平滑處理
  let sumSq = 0;
  const xfadeLen = Math.min(tailSamples, Math.floor(sr * 1.2));
  const zeroRamp = Math.min(96, Math.floor(sr * 0.002)); // 2ms 邊界相位對齊防止任何跳變

  for (let ch = 0; ch < 2; ch++) {
    const src = rendered.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < loopSamples; i++) {
      let v = src[i];
      if (i < xfadeLen) {
        const tailVal = src[loopSamples + i] || 0;
        const w = 0.5 * (1 + Math.cos(Math.PI * (i / xfadeLen)));
        v += tailVal * w;
      }
      dst[i] = v;
      sumSq += v * v;
    }
    // 首尾零交越微包絡對齊，確保 loopEnd -> loopStart 100% 連續無爆音
    const edgeAvg = (dst[0] + dst[loopSamples - 1]) * 0.5;
    for (let k = 0; k < zeroRamp; k++) {
      const a = k / zeroRamp;
      dst[k] = edgeAvg * (1 - a) + dst[k] * a;
      dst[loopSamples - 1 - k] = edgeAvg * (1 - a) + dst[loopSamples - 1 - k] * a;
    }
  }

  // 2. -16 LUFS 等效響度標準化與 True-Peak 軟限幅（-1.5 dBFS 上限）
  const rms = Math.sqrt(sumSq / (loopSamples * 2)) || 0.001;
  const targetRms = 0.158; // 約 -16 LUFS 整合感知響度基準
  const gain = Math.min(2.8, targetRms / rms);
  const ceiling = 0.84;

  for (let ch = 0; ch < 2; ch++) {
    const dst = out.getChannelData(ch);
    for (let i = 0; i < loopSamples; i++) {
      const x = dst[i] * gain;
      dst[i] = ceiling * Math.tanh(x / ceiling);
    }
  }

  AUDIO.bgmCache[trackIdx] = out;
  return out;
}

// 單例播放鎖定：遞增世代編號、立即切斷並釋放舊音源節點，保證絕不重疊播放
function stopMusic() {
  AUDIO.gen++;
  const src = AUDIO.bgmSource;
  const g = AUDIO.bgmGain;
  AUDIO.bgmSource = null;
  AUDIO.bgmGain = null;
  if (g && AUDIO.ctx) {
    try {
      const now = AUDIO.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.03);
    } catch (e) { /* 忽略 */ }
  }
  if (src) {
    setTimeout(() => {
      try { src.onended = null; src.stop(0); } catch (e) { /* 忽略 */ }
      try { src.disconnect(); } catch (e) { /* 忽略 */ }
      if (g) { try { g.disconnect(); } catch (e) { /* 忽略 */ } }
    }, 35);
  }
}

async function startMusic() {
  stopMusic();
  if (!AUDIO.ctx || !AUDIO.on.music || typeof window === 'undefined') return;
  const gen = AUDIO.gen;
  const trackIdx = ((AUDIO.on.track % TRACKS.length) + TRACKS.length) % TRACKS.length;

  let buf = null;
  try {
    buf = await getRenderedTrackBuffer(trackIdx);
  } catch (e) {
    return;
  }
  // 若等待離線合成期間世代編號已變更或音樂已關閉，立即放棄掛載
  if (gen !== AUDIO.gen || !AUDIO.on.music || !buf || !AUDIO.ctx) return;

  const c = AUDIO.ctx;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;

  const now = c.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(AUDIO.tense ? 0.85 : 1.0, now + 0.18);

  src.connect(g);
  g.connect(AUDIO.music);
  AUDIO.bgmSource = src;
  AUDIO.bgmGain = g;
  src.start(now + 0.01);
}

function setTrack(i, manual = true) {
  if (manual) AUDIO.manual = true;
  AUDIO.on.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  saveAudio();
  if (!AUDIO.ctx) audioInit();
  if (AUDIO.ctx && AUDIO.on.music) startMusic();
}

function cycleTrack() {
  setTrack(AUDIO.on.track + 1, true);
  return TRACKS[AUDIO.on.track].name;
}

// 戰役關卡與情境自動配樂對應表（0:簡報序曲 1:裝甲戰線 2:蒼穹防線 3:聯合艦隊 4:決戰黎明）
const MISSION_TRACK = {
  t1: 1, t2: 2, t3: 4, c2: 3, c3: 1, c4: 2, c5: 4,
  f1: 1, f2: 3, f3: 2, f4: 1, f5: 2, f6: 1, f7: 3, f8: 4,
};

function scenarioTrack(g) {
  if (!g) return 1;
  if (g.missionId && MISSION_TRACK[g.missionId] !== undefined) return MISSION_TRACK[g.missionId];
  const seaCnt = Array.isArray(g.terrain) ? g.terrain.filter(t => t === 'sea').length : 0;
  const seaRatio = g.terrain && g.terrain.length ? seaCnt / g.terrain.length : 0;
  const seed = Math.abs(g.seed || 0);
  if (seaRatio >= 0.35) return 3;
  const landTracks = [1, 2, 4];
  return landTracks[seed % landTracks.length];
}

function playContextBGM(phase, force = false) {
  if (typeof window === 'undefined') return;
  if (force) AUDIO.manual = false;
  if (AUDIO.manual && phase !== 'victory') return;
  const g = typeof G !== 'undefined' ? G : null;
  let idx = 1;
  if (phase === 'deploy') idx = 0;
  else if (phase === 'victory') idx = 4;
  else idx = scenarioTrack(g);
  if (AUDIO.on.track !== idx || !AUDIO.bgmSource) setTrack(idx, false);
}

function setMusicTense(on) {
  AUDIO.tense = !!on;
  if (AUDIO.bgmGain && AUDIO.ctx) {
    try {
      AUDIO.bgmGain.gain.setTargetAtTime(AUDIO.tense ? 0.85 : 1.0, AUDIO.ctx.currentTime, 0.15);
    } catch (e) { /* 忽略 */ }
  }
}

// 首次使用者互動時解鎖並初始化 Web Audio（相容 iOS Safari 與桌面瀏覽器）
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    window.addEventListener(ev, audioInit, { once: false, passive: true })
  );
}
