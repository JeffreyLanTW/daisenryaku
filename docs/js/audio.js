'use strict';
// ===== 90 年代大戰略工業管弦戰術配樂與音效引擎（48kHz / -16 LUFS 無縫迴圈・iOS 單例鎖定版） =====

const AUDIO = {
  ctx: null,
  master: null,
  music: null,
  sfx: null,
  noiseWhite: null,
  noisePink: null,
  on: { music: true, sfx: true, track: 0 },
  gen: 0,
  starting: false,
  resuming: false,
  bgmSource: null,
  bgmGain: null,
  activeNodes: new Set(),
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

// 建立確定性白噪音與 1/f 粉紅噪音緩衝區
function createNoiseBuffers(ctx, durSec = 3.0) {
  const len = Math.floor(ctx.sampleRate * durSec);
  const wBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const pBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const wData = wBuf.getChannelData(0);
  const pData = pBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
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

// 僅於使用者互動手勢（Touch / Click / Keydown）中初始化或喚醒 AudioContext
function audioInit() {
  if (typeof window === 'undefined') return;
  if (AUDIO.ctx) {
    if ((AUDIO.ctx.state === 'suspended' || AUDIO.ctx.state === 'interrupted') && !AUDIO.resuming) {
      AUDIO.resuming = true;
      AUDIO.ctx.resume().then(() => {
        AUDIO.resuming = false;
        if (AUDIO.on.music && !AUDIO.bgmSource && !AUDIO.starting) startMusic();
      }).catch(() => {
        AUDIO.resuming = false;
      });
    } else if (AUDIO.ctx.state === 'running' && AUDIO.on.music && !AUDIO.bgmSource && !AUDIO.starting) {
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

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  comp.connect(master);

  // BGM 母帶濾波鏈：切除極低頻 + 挖空 2.1kHz (-5dB) 讓戰術 SFX 清晰穿透 + 溫潤高頻滾降
  const bgmHp = c.createBiquadFilter();
  bgmHp.type = 'highpass';
  bgmHp.frequency.value = 40;
  bgmHp.Q.value = 0.7;

  const bgmDip = c.createBiquadFilter();
  bgmDip.type = 'peaking';
  bgmDip.frequency.value = 2100;
  bgmDip.Q.value = 0.95;
  bgmDip.gain.value = -5.0;

  const bgmLp = c.createBiquadFilter();
  bgmLp.type = 'lowpass';
  bgmLp.frequency.value = 4600;
  bgmLp.Q.value = 0.65;

  const musicBus = c.createGain();
  musicBus.gain.value = AUDIO.on.music ? 0.38 : 0;
  musicBus.connect(bgmHp);
  bgmHp.connect(bgmDip);
  bgmDip.connect(bgmLp);
  bgmLp.connect(comp);
  AUDIO.music = musicBus;

  const sfxBus = c.createGain();
  sfxBus.gain.value = AUDIO.on.sfx ? 0.68 : 0;
  sfxBus.connect(comp);
  AUDIO.sfx = sfxBus;

  const bufs = createNoiseBuffers(c, 3.0);
  AUDIO.noiseWhite = bufs.white;
  AUDIO.noisePink = bufs.pink;

  if (c.state === 'suspended' || c.state === 'interrupted') {
    AUDIO.resuming = true;
    c.resume().then(() => {
      AUDIO.resuming = false;
      if (AUDIO.on.music && !AUDIO.bgmSource && !AUDIO.starting) startMusic();
    }).catch(() => {
      AUDIO.resuming = false;
    });
  } else if (AUDIO.on.music && !AUDIO.bgmSource && !AUDIO.starting) {
    startMusic();
  }
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
      AUDIO.music.gain.setTargetAtTime(0.38, c.currentTime, 0.04);
      startMusic();
    } else {
      AUDIO.music.gain.setTargetAtTime(0, c.currentTime, 0.02);
      stopMusic();
    }
  } else if (kind === 'sfx') {
    AUDIO.sfx.gain.cancelScheduledValues(c.currentTime);
    AUDIO.sfx.gain.setTargetAtTime(AUDIO.on.sfx ? 0.68 : 0, c.currentTime, 0.02);
  }
}

// ----- 合成基礎積木 -----
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
    if (!AUDIO.resuming) {
      AUDIO.resuming = true;
      c.resume().then(() => { AUDIO.resuming = false; }).catch(() => { AUDIO.resuming = false; });
    }
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

// ===== 90 年代大戰略工業管弦 BGM 離線合成引擎（純合奏和聲架構，彻底移除舊版單音主旋律重疊） =====
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

// 1. 管弦低音弦樂與溫暖銅管合奏群（Symphonic Strings & French Horn Ensemble）
function synthOrchEnsemble(ctx, dest, t, chord, dur, peak = 0.06) {
  chord.forEach((n, idx) => {
    const freq = midi(n);
    const pan = (idx - (chord.length - 1) / 2) * 0.40;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(980, t);
    f.Q.value = 0.7;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq * (idx % 2 === 0 ? 0.997 : 1.003), t);
    o2.frequency.setValueAtTime(freq * 0.5, t);

    const atk = Math.min(0.28, dur * 0.25);
    env(g, t, atk, peak, dur - atk * 0.4);
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    connectPan(ctx, g, dest, pan);
    o1.start(t); o1.stop(t + atk + dur + 0.05);
    o2.start(t); o2.stop(t + atk + dur + 0.05);
  });
}

// 2. 管弦銅管和聲動機（French Horn / Trombone Dyad Swell，取代舊版單音合成旋律）
function synthBrassSwell(ctx, dest, t, notes, dur, peak = 0.075) {
  notes.forEach((n, idx) => {
    const freq = midi(n);
    const pan = idx === 0 ? -0.18 : 0.18;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(1250, t + Math.min(0.14, dur * 0.35));
    f.frequency.exponentialRampToValueAtTime(680, t + dur);

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'triangle';
    o1.frequency.setValueAtTime(freq * 0.998, t);
    o2.frequency.setValueAtTime(freq * 1.002, t);

    const atk = Math.min(0.08, dur * 0.25);
    env(g, t, atk, peak, dur);
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    connectPan(ctx, g, dest, pan);
    o1.start(t); o1.stop(t + atk + dur + 0.04);
    o2.start(t); o2.stop(t + atk + dur + 0.04);
  });
}

// 3. 90 年代深沉工業合成低音脈衝（Grounded Industrial Sub-Bass Pulse）
function synthIndBass(ctx, dest, t, freq, dur, peak = 0.20, accent = false) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = accent ? 1.8 : 1.1;
  f.frequency.setValueAtTime(accent ? 540 : 360, t);
  f.frequency.exponentialRampToValueAtTime(120, t + dur);

  const o1 = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o2.type = 'sine';
  o1.frequency.setValueAtTime(freq, t);
  o2.frequency.setValueAtTime(freq * 0.5, t);

  env(g, t, 0.008, peak, dur);
  o1.connect(f);
  o2.connect(f);
  f.connect(g);
  g.connect(dest);
  o1.start(t); o1.stop(t + dur + 0.03);
  o2.start(t); o2.stop(t + dur + 0.03);
}

// 4. 工業管弦打擊樂組（定音鼓、低頻大鼓、軍鼓、細緻金屬節拍）
function synthIndPerc(ctx, dest, pNoise, t, kind, stepIdx = 0) {
  const off = (stepIdx * 0.137) % 1.8;
  if (kind === 'kick') {
    tone(dest, t, { ctx, freq: 92, to: 32, dur: 0.20, peak: 0.42, type: 'sine', attack: 0.004 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.06, peak: 0.14, type: 'lowpass', freq: 220, toFreq: 65 });
  } else if (kind === 'snare') {
    tone(dest, t, { ctx, freq: 165, to: 78, dur: 0.09, peak: 0.18, type: 'triangle', attack: 0.003 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.12, peak: 0.19, type: 'bandpass', freq: 1050, toFreq: 480, q: 1.0 });
  } else if (kind === 'hat') {
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.038, peak: 0.055, type: 'bandpass', freq: 2600, q: 1.6 });
  } else if (kind === 'timp') {
    tone(dest, t, { ctx, freq: 106, to: 50, dur: 0.40, peak: 0.34, type: 'sine', attack: 0.006 });
    noiseHit(dest, t, { ctx, buf: pNoise, offset: off, dur: 0.15, peak: 0.12, type: 'lowpass', freq: 280, toFreq: 95 });
  }
}

// 一體化工業管弦編曲渲染器（無單音旋律或高頻琶音干擾，全聲部和聲同步呼吸）
function scheduleArrangement(ctx, dest, pNoise, cfg) {
  const sp = 60 / cfg.bpm / 4;
  const totalSteps = 128; // 8 小節完整四樂句循環
  for (let s = 0; s < totalSteps; s++) {
    const t = s * sp;
    const bar = Math.floor(s / 16) % cfg.chords.length;
    const pos = s % 16;
    const phrase = Math.floor(bar / 2); // 0:低音鋪陳, 1:銅管和聲展開, 2:張力推進, 3:全編制合奏與收束
    const ch = cfg.chords[bar];

    // 管弦長音弦樂合奏墊底
    if (pos === 0) {
      const padMult = phrase === 0 ? 0.82 : (phrase === 3 ? 1.15 : 1.0);
      synthOrchEnsemble(ctx, dest, t, ch, sp * 15.8, (cfg.padPeak || 0.058) * padMult);
    }

    // 管弦銅管和聲動機（僅以雙音四度／五度和聲齊奏，與弦樂完全融為一體）
    if (phrase === 1 || phrase === 3) {
      if (pos === 0 || pos === 6 || pos === 10) {
        const dur = pos === 0 ? sp * 5.5 : sp * 3.6;
        const dyad = pos === 6 ? [ch[1], ch[2]] : [ch[0], ch[2]];
        const pk = phrase === 3 ? 0.072 : 0.058;
        synthBrassSwell(ctx, dest, t, dyad, dur, pk);
      }
    } else if (phrase === 2 && (pos === 0 || pos === 8)) {
      synthBrassSwell(ctx, dest, t, [ch[0] - 12, ch[2] - 12], sp * 7.2, 0.062);
    }

    // 90 年代工業合成貝斯脈衝（鎖定和弦根音與五度音）
    const bMode = cfg.bass || 'march';
    if (bMode === 'drive') {
      if (pos % 2 === 0) {
        const note = (pos === 6 || pos === 14) ? ch[2] - 12 : ch[0] - 12;
        const acc = (pos === 0 || pos === 6 || pos === 12);
        synthIndBass(ctx, dest, t, midi(note), sp * 1.75, acc ? 0.21 : 0.16, acc);
      }
    } else if (bMode === 'hq') {
      if ([0, 3, 6, 8, 12, 14].includes(pos)) {
        const note = (pos === 6 || pos === 14) ? ch[1] - 12 : ch[0] - 12;
        synthIndBass(ctx, dest, t, midi(note), sp * 2.1, pos === 0 ? 0.21 : 0.16, pos === 0 || pos === 8);
      }
    } else if (bMode === 'fleet') {
      if (pos === 0 || pos === 6 || pos === 8 || pos === 12) {
        const dur = (pos === 0 || pos === 8) ? sp * 5.4 : sp * 3.4;
        synthIndBass(ctx, dest, t, midi(ch[0] - 12), dur, 0.21, pos === 0);
      }
    } else {
      if ([0, 4, 8, 12, 14].includes(pos)) {
        const note = pos === 14 ? ch[1] - 12 : ch[0] - 12;
        synthIndBass(ctx, dest, t, midi(note), sp * 3.1, pos === 0 ? 0.21 : 0.17, pos % 8 === 0);
      }
    }

    // 工業與軍武打擊樂
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
  }
  return totalSteps * sp;
}

// 5 首 90 年代《大戰略》工業管弦曲目
const TRACKS = [
  {
    name: '鋼鐵序曲・前線簡報',
    desc: '沉穩工業合成脈衝與法國號低音弦樂進行曲',
    bpm: 96,
    bass: 'hq',
    chords: [
      [50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52],
      [50, 53, 57], [43, 46, 50], [45, 48, 52], [45, 49, 52],
    ],
    kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  {
    name: '裝甲戰線・閃電推進',
    desc: '90 年代大戰略重裝工業貝斯與管弦銅管合奏',
    bpm: 110,
    bass: 'drive',
    chords: [
      [52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59],
      [52, 55, 59], [57, 60, 64], [54, 59, 63], [52, 55, 59],
    ],
    kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat:   [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
  },
  {
    name: '蒼穹防線・制空攔截',
    desc: '緊湊工業節奏與高張力管弦交響推進',
    bpm: 118,
    bass: 'drive',
    chords: [
      [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59],
      [57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64],
    ],
    kick:  [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  },
  {
    name: '聯合艦隊・大洋巡航',
    desc: '深海工業低頻共鳴、定音鼓與壯闊海戰管弦',
    bpm: 88,
    bass: 'fleet',
    padPeak: 0.068,
    chords: [
      [48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50],
      [48, 51, 55], [41, 44, 48], [43, 47, 50], [48, 51, 55],
    ],
    kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
  },
  {
    name: '決戰黎明・總攻號角',
    desc: '全編制工業管弦合奏與終局決戰進行曲',
    bpm: 114,
    bass: 'drive',
    chords: [
      [53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 51, 55],
      [49, 53, 56], [46, 49, 53], [48, 52, 55], [53, 56, 60],
    ],
    kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat:   [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  },
];

if (!(AUDIO.on.track >= 0 && AUDIO.on.track < TRACKS.length)) AUDIO.on.track = 0;

// 離線渲染單一曲目為無縫迴圈立體聲 AudioBuffer
async function getRenderedTrackBuffer(trackIdx) {
  if (AUDIO.bgmCache[trackIdx]) return AUDIO.bgmCache[trackIdx];
  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineAC || !AUDIO.ctx) return null;

  const cfg = TRACKS[trackIdx] || TRACKS[0];
  const sr = AUDIO.ctx.sampleRate || 48000;
  const sp = 60 / cfg.bpm / 4;
  const loopDur = 128 * sp;
  const tailDur = 8 * sp;
  const totalSamples = Math.ceil((loopDur + tailDur) * sr);
  const loopSamples = Math.floor(loopDur * sr);
  const tailSamples = totalSamples - loopSamples;

  const octx = new OfflineAC(2, totalSamples, sr);
  const { pink } = createNoiseBuffers(octx, 2.5);
  scheduleArrangement(octx, octx.destination, pink, cfg);

  const rendered = await octx.startRendering();
  const out = AUDIO.ctx.createBuffer(2, loopSamples, sr);

  let sumSq = 0;
  const xfadeLen = Math.min(tailSamples, Math.floor(sr * 1.2));
  const zeroRamp = Math.min(96, Math.floor(sr * 0.002));

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
    const edgeAvg = (dst[0] + dst[loopSamples - 1]) * 0.5;
    for (let k = 0; k < zeroRamp; k++) {
      const a = k / zeroRamp;
      dst[k] = edgeAvg * (1 - a) + dst[k] * a;
      dst[loopSamples - 1 - k] = edgeAvg * (1 - a) + dst[loopSamples - 1 - k] * a;
    }
  }

  const rms = Math.sqrt(sumSq / (loopSamples * 2)) || 0.001;
  const targetRms = 0.158; // -16 LUFS 等效母帶響度
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

// 強制同步單例清除鎖：立即停止並斷開所有活躍 BGM 音源節點，杜絕 iOS Safari 雙重播放
function stopMusic() {
  AUDIO.gen++;
  AUDIO.starting = false;
  if (AUDIO.timer) {
    try { clearInterval(AUDIO.timer); clearTimeout(AUDIO.timer); } catch (e) { /* 忽略 */ }
    AUDIO.timer = null;
  }
  const nodes = Array.from(AUDIO.activeNodes);
  AUDIO.activeNodes.clear();
  if (AUDIO.bgmSource && !nodes.includes(AUDIO.bgmSource)) nodes.push(AUDIO.bgmSource);
  if (AUDIO.bgmGain && !nodes.includes(AUDIO.bgmGain)) nodes.push(AUDIO.bgmGain);
  AUDIO.bgmSource = null;
  AUDIO.bgmGain = null;

  for (const n of nodes) {
    try { n.onended = null; } catch (e) { /* 忽略 */ }
    try { if (typeof n.stop === 'function') n.stop(0); } catch (e) { /* 忽略 */ }
    try { n.disconnect(); } catch (e) { /* 忽略 */ }
  }
}

async function startMusic() {
  stopMusic();
  if (!AUDIO.ctx || !AUDIO.on.music || typeof window === 'undefined') return;
  const gen = AUDIO.gen;
  AUDIO.starting = true;
  const trackIdx = ((AUDIO.on.track % TRACKS.length) + TRACKS.length) % TRACKS.length;

  let buf = null;
  try {
    buf = await getRenderedTrackBuffer(trackIdx);
  } catch (e) {
    if (gen === AUDIO.gen) AUDIO.starting = false;
    return;
  }
  if (gen !== AUDIO.gen || !AUDIO.on.music || !buf || !AUDIO.ctx) {
    if (gen === AUDIO.gen) AUDIO.starting = false;
    return;
  }

  // 掛載前再次確保無任何殘留節點
  for (const n of Array.from(AUDIO.activeNodes)) {
    try { if (typeof n.stop === 'function') n.stop(0); } catch (e) { /* 忽略 */ }
    try { n.disconnect(); } catch (e) { /* 忽略 */ }
  }
  AUDIO.activeNodes.clear();

  const c = AUDIO.ctx;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;

  const now = c.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(AUDIO.tense ? 0.85 : 1.0, now + 0.16);

  src.connect(g);
  g.connect(AUDIO.music);
  AUDIO.activeNodes.add(src);
  AUDIO.activeNodes.add(g);
  AUDIO.bgmSource = src;
  AUDIO.bgmGain = g;
  AUDIO.starting = false;
  src.start(now + 0.01);
}

function setTrack(i, manual = true) {
  if (manual) AUDIO.manual = true;
  AUDIO.on.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  saveAudio();
  if (manual && !AUDIO.ctx) audioInit();
  if (AUDIO.ctx && AUDIO.on.music) startMusic();
}

function cycleTrack() {
  setTrack(AUDIO.on.track + 1, true);
  return TRACKS[AUDIO.on.track].name;
}

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
  if (AUDIO.on.track !== idx || (!AUDIO.bgmSource && !AUDIO.starting)) {
    setTrack(idx, false);
  }
}

function setMusicTense(on) {
  AUDIO.tense = !!on;
  if (AUDIO.bgmGain && AUDIO.ctx) {
    try {
      AUDIO.bgmGain.gain.setTargetAtTime(AUDIO.tense ? 0.85 : 1.0, AUDIO.ctx.currentTime, 0.15);
    } catch (e) { /* 忽略 */ }
  }
}

// 首次使用者互動時解鎖並初始化 Web Audio（相容 iPadOS / iOS Safari 與桌面瀏覽器）
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    window.addEventListener(ev, audioInit, { once: false, passive: true })
  );
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!AUDIO.ctx) return;
      if (document.hidden) {
        if (AUDIO.ctx.state === 'running') AUDIO.ctx.suspend().catch(() => {});
      } else if (AUDIO.on.music || AUDIO.on.sfx) {
        audioInit();
      }
    });
  }
}
