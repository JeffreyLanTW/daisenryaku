'use strict';
// ===== 90 年代大戰略戰術配樂與音效引擎（100% 同步零延遲 PCM 合成・杜絕 iOS 串音與卡死） =====

const AUDIO = {
  ctx: null,
  master: null,
  comp: null,
  bgmFilter: null,
  music: null,
  musicConnected: false,
  sfx: null,
  noiseWhite: null,
  noisePink: null,
  on: { music: true, sfx: true, track: 0 },
  activeList: [],
  bgmSource: null,
  bgmBus: null,
  bgmCache: {},
  bgmGen: 0,        // BGM 世代權杖：每次停止／啟動皆遞增，舊世代的任何續行動作一律作廢
  resumeP: null,    // 單一共用 resume 承諾（互斥鎖），多重觸控事件只會觸發一次
  voices: new Set(),  // 所有存活中的音效振盪器／噪音源節點註冊表
  timers: new Set(),  // 所有音訊相關 setTimeout 註冊表
  tense: false,
  manual: false,
  lastAt: {},
  lastActionAt: 0,
};

// 增益常數（iPad Mini 小喇叭調校：保留多聲部疊加餘裕，避免削波失真）
const MASTER_GAIN = 0.80;
const MUSIC_GAIN = 0.36;
const SFX_GAIN = 0.58;
const VOICE_GAIN = 0.72;
const MAX_VOICES = 40;

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

// 預先建立 4096 點正弦波查找表與確定性粉紅噪音表（零誤差極速同步合成）
const SIN_BITS = 12;
const SIN_SIZE = 1 << SIN_BITS;
const SIN_MASK = SIN_SIZE - 1;
const SIN_TABLE = new Float32Array(SIN_SIZE);
for (let i = 0; i < SIN_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SIN_SIZE) * Math.PI * 2);
}
const fastSin = phase => SIN_TABLE[(phase * SIN_SIZE) & SIN_MASK];

const PINK_LEN = 48000;
const PINK_TABLE = new Float32Array(PINK_LEN);
{
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let seed = 0x6d2b79f5;
  for (let i = 0; i < PINK_LEN; i++) {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const white = ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    PINK_TABLE[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.18;
    b6 = white * 0.115926;
  }
}

function createNoiseBuffers(ctx) {
  const sr = ctx.sampleRate || 48000;
  const len = Math.floor(sr * 2.5);
  const wBuf = ctx.createBuffer(1, len, sr);
  const pBuf = ctx.createBuffer(1, len, sr);
  const wData = wBuf.getChannelData(0);
  const pData = pBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    wData[i] = Math.random() * 2 - 1;
    pData[i] = PINK_TABLE[i % PINK_LEN];
  }
  return { white: wBuf, pink: pBuf };
}

const audioAllOff = () => !AUDIO.on.music && !AUDIO.on.sfx;

// 單一共用 resume 互斥鎖：touchend + click 等雙重觸發只會產生一個 resume()
function resumeCtx() {
  const c = AUDIO.ctx;
  if (!c) return Promise.resolve(false);
  if (c.state === 'running') return Promise.resolve(true);
  if (AUDIO.resumeP) return AUDIO.resumeP;
  let p;
  try { p = Promise.resolve(c.resume()); } catch (e) { p = Promise.reject(e); }
  AUDIO.resumeP = p.then(() => {
    AUDIO.resumeP = null;
    return c.state === 'running';
  }, () => {
    AUDIO.resumeP = null;
    return false;
  });
  return AUDIO.resumeP;
}

// 音訊計時器註冊表：靜音時可一次清除所有尚未觸發的延遲音效
function audioTimer(fn, ms) {
  const id = setTimeout(() => {
    AUDIO.timers.delete(id);
    fn();
  }, ms);
  AUDIO.timers.add(id);
  return id;
}

function clearAudioTimers() {
  for (const id of AUDIO.timers) clearTimeout(id);
  AUDIO.timers.clear();
}

function setParam(param, val) {
  try {
    param.cancelScheduledValues(0);
    if (AUDIO.ctx) param.setValueAtTime(val, AUDIO.ctx.currentTime);
    param.value = val;
  } catch (e) { /* 忽略 */ }
}

// 是否以「加入主畫面」網頁 App（standalone）模式執行
const IS_STANDALONE = typeof window !== 'undefined' && (
  window.navigator.standalone === true ||
  (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
);

// 音訊模式（供 iPad 主畫面 App 實機測試不同引擎組合；切換後重新載入頁面生效）
const AUDIO_MODES = {
  auto: '自動（取樣率修正）',
  plain: '原始（無修正）',
  '48k': '固定 48kHz',
  '44k': '固定 44.1kHz',
  html: '相容模式（HTML 音樂）',
};
AUDIO.mode = 'auto';
try {
  const m = localStorage.getItem('daisenryaku_audio_mode');
  if (m && AUDIO_MODES[m]) AUDIO.mode = m;
} catch (e) { /* 忽略 */ }

function setAudioMode(m) {
  if (!AUDIO_MODES[m]) return;
  try { localStorage.setItem('daisenryaku_audio_mode', m); } catch (e) { /* 忽略 */ }
  location.reload();
}

// 建立 AudioContext。主畫面網頁 App 專用修正（Safari 分頁不受影響）：
// 1. 將 iOS 音訊工作階段固定為 ambient（所有模式）：鎖定螢幕／休眠時由系統靜音，且不搶占其他 App 音訊。
//    切勿使用 playback：該類別允許背景與鎖定畫面持續播放，主畫面 App 卡住時聲音在休眠後仍不停止；
// 2. iOS 取樣率錯配 bug（WebKit 154538）：context 回報的取樣率與硬體實際渲染速率不同，
//    造成失真、重複怪音與音高／速度錯誤。已知解法：建立後播放一個空白樣本、立即關閉，再建立新的 context。
function createAudioContext(AC) {
  if (IS_STANDALONE && window.navigator.audioSession) {
    try { window.navigator.audioSession.type = 'ambient'; } catch (e) { /* 忽略 */ }
  }
  if (AUDIO.mode === '48k' || AUDIO.mode === '44k') {
    try { return new AC({ sampleRate: AUDIO.mode === '48k' ? 48000 : 44100 }); } catch (e) { return new AC(); }
  }
  if (AUDIO.mode !== 'auto') return new AC();
  let c = new AC();
  if (IS_STANDALONE && typeof c.close === 'function') {
    try {
      const dummy = c.createBufferSource();
      dummy.buffer = c.createBuffer(1, 1, c.sampleRate);
      dummy.connect(c.destination);
      dummy.start(0);
      dummy.disconnect();
      c.close().catch(() => {});
      c = new AC();
      AUDIO.recreated = true;
    } catch (e) { /* 忽略 */ }
  }
  return c;
}

// 僅於使用者真實互動手勢中建立與解鎖 AudioContext（可重複呼叫，完全冪等）
function audioInit() {
  if (typeof window === 'undefined') return;
  if (AUDIO.ctx) {
    if (audioAllOff()) return;
    resumeCtx();
    if (AUDIO.on.music && !AUDIO.bgmSource) startMusic();
    return;
  }
  if (audioAllOff()) return;

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let c;
  try { c = createAudioContext(AC); } catch (e) { return; }
  AUDIO.ctx = c;

  const master = c.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(c.destination);
  AUDIO.master = master;

  // 最終磚牆限幅器：多聲部同時爆發時鎖住峰值，杜絕 iPad 喇叭削波破音
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(master);

  // 柔化濾波：7kHz 低通去除刺耳高頻、75Hz 高通移除小喇叭無法重現的次低頻（避免振膜失真）
  const soften = c.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 7000;
  soften.Q.value = 0.5;
  soften.connect(limiter);
  const rumble = c.createBiquadFilter();
  rumble.type = 'highpass';
  rumble.frequency.value = 75;
  rumble.Q.value = 0.6;
  rumble.connect(soften);

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.18;
  comp.connect(rumble);
  AUDIO.comp = comp;

  // BGM 中高頻挖空濾波器（2.1kHz -4.5dB），讓戰術音效清晰浮現
  const bgmDip = c.createBiquadFilter();
  bgmDip.type = 'peaking';
  bgmDip.frequency.value = 2100;
  bgmDip.Q.value = 0.9;
  bgmDip.gain.value = -4.5;
  bgmDip.connect(comp);
  AUDIO.bgmFilter = bgmDip;

  const musicBus = c.createGain();
  musicBus.gain.value = AUDIO.on.music ? MUSIC_GAIN : 0;
  if (AUDIO.on.music) {
    musicBus.connect(bgmDip);
    AUDIO.musicConnected = true;
  }
  AUDIO.music = musicBus;

  const sfxBus = c.createGain();
  sfxBus.gain.value = AUDIO.on.sfx ? SFX_GAIN : 0;
  sfxBus.connect(comp);
  AUDIO.sfx = sfxBus;

  const bufs = createNoiseBuffers(c);
  AUDIO.noiseWhite = bufs.white;
  AUDIO.noisePink = bufs.pink;

  resumeCtx();
  if (AUDIO.on.music) startMusic();
}

// 強制同步關閉並斷開所有 BGM 節點（實體斷線保證 iPad Safari 100% 立即靜音）
function stopMusic() {
  AUDIO.bgmGen++;
  if (AUDIO.htmlEl) {
    try { AUDIO.htmlEl.pause(); } catch (e) { /* 忽略 */ }
  }
  const list = AUDIO.activeList.splice(0, AUDIO.activeList.length);
  if (AUDIO.bgmSource || AUDIO.bgmBus) {
    list.push({ src: AUDIO.bgmSource, bus: AUDIO.bgmBus });
  }
  AUDIO.bgmSource = null;
  AUDIO.bgmBus = null;

  for (const item of list) {
    if (item.bus) {
      setParam(item.bus.gain, 0);
      try { item.bus.disconnect(); } catch (e) { /* 忽略 */ }
    }
    if (item.src && !item.src.html) {
      try { item.src.onended = null; item.src.loop = false; } catch (e) { /* 忽略 */ }
      try { item.src.stop(0); } catch (e) {
        try { item.src.stop(); } catch (err) { /* 忽略 */ }
      }
      try { item.src.disconnect(); } catch (e) { /* 忽略 */ }
    }
  }
}

// 立即停止並斷開所有存活中的音效聲部（振盪器、噪音源、濾波器、增益節點）
function stopAllSfx() {
  clearAudioTimers();
  const list = Array.from(AUDIO.voices);
  AUDIO.voices.clear();
  for (const v of list) {
    try { v.src.onended = null; } catch (e) { /* 忽略 */ }
    try { v.src.stop(0); } catch (e) { /* 忽略 */ }
    for (const n of v.nodes) {
      try { n.disconnect(); } catch (e) { /* 忽略 */ }
    }
  }
}

// 全面硬靜音：清除排程、停止並斷開所有節點、主增益歸零。
// 刻意不 suspend()／close()：整個工作階段只使用單一 AudioContext（建立時的取樣率修正除外），
// 靜音時讓它持續輸出純靜音，避免 iPad 主畫面 App 輸出卡住重複播放。
function stopAllAudio() {
  stopMusic();
  stopAllSfx();
  if (AUDIO.master) setParam(AUDIO.master.gain, 0);
  if (AUDIO.music) {
    setParam(AUDIO.music.gain, 0);
    if (AUDIO.musicConnected) {
      try { AUDIO.music.disconnect(); } catch (e) { /* 忽略 */ }
      AUDIO.musicConnected = false;
    }
  }
  if (AUDIO.sfx) setParam(AUDIO.sfx.gain, 0);
}

function setAudio(kind, on) {
  AUDIO.on[kind] = !!on;
  saveAudio();

  if (audioAllOff()) {
    stopAllAudio();
    return;
  }
  if (!AUDIO.ctx) {
    audioInit();
    if (!AUDIO.ctx) return;
  }

  if (kind === 'music' && !AUDIO.on.music) {
    // 立即同步停止所有音源並將 BGM 匯流排從主輸出實體斷開
    stopMusic();
    setParam(AUDIO.music.gain, 0);
    if (AUDIO.musicConnected) {
      try { AUDIO.music.disconnect(); } catch (e) { /* 忽略 */ }
      AUDIO.musicConnected = false;
    }
  }
  if (!AUDIO.on.sfx) stopAllSfx();
  setParam(AUDIO.sfx.gain, AUDIO.on.sfx ? SFX_GAIN : 0);
  // 至少一項開啟：恢復主增益並（經互斥鎖）解除 iOS 的中斷狀態
  setParam(AUDIO.master.gain, MASTER_GAIN);
  resumeCtx();
  if (AUDIO.on.music && !AUDIO.bgmSource) startMusic();
}

// ----- 戰術音效合成基礎積木 -----
// 註冊存活聲部；結束時自動註銷並斷線（超過上限則拒絕新聲部以免疊加削波）
function trackVoice(src, nodes) {
  const v = { src, nodes };
  AUDIO.voices.add(v);
  src.onended = () => {
    AUDIO.voices.delete(v);
    for (const n of nodes) {
      try { n.disconnect(); } catch (e) { /* 忽略 */ }
    }
  };
}

function env(g, t, attack, peak, decay, end = 0.0001) {
  // 柔化起音（最短 4ms）並統一降低單聲部增益，避免多聲部疊加削波
  const a = Math.max(0.004, attack);
  const d = Math.max(0.01, decay);
  const p = Math.max(0.0002, peak * VOICE_GAIN);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), t + a + d);
}

function noiseHit(dest, t, {
  dur = 0.25, peak = 0.5, type = 'lowpass', freq = 1000, q = 0.8,
  toFreq = 0, attack = 0.004, pink = true,
} = {}) {
  const c = AUDIO.ctx;
  const b = pink ? AUDIO.noisePink : AUDIO.noiseWhite;
  if (!c || !b || AUDIO.voices.size >= MAX_VOICES) return;
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
  trackVoice(src, [src, f, g]);
  src.start(t, Math.random() * maxOffset);
  src.stop(t + totalDur + 0.03);
}

function tone(dest, t, {
  freq = 440, dur = 0.18, peak = 0.25, type = 'triangle',
  to = 0, attack = 0.004, cutoff = 0,
} = {}) {
  const c = AUDIO.ctx;
  if (!c || AUDIO.voices.size >= MAX_VOICES) return;
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
  trackVoice(o, f ? [o, f, g] : [o, g]);
  o.start(t);
  o.stop(t + attack + dur + 0.03);
}

// ----- 戰術音效庫（15 種清脆高辨識度戰場音效） -----
function sfx(name, opt = {}) {
  if (!AUDIO.on.sfx || typeof window === 'undefined' || !AUDIO.ctx) return;
  const c = AUDIO.ctx;
  if (c.state !== 'running') {
    resumeCtx();
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

// ===== 100% 同步 PCM 合成引擎（嚴格單音閘門控制，前後音符絕不重疊串音） =====
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// 5 首鮮明辨識度的 90 年代《大戰略》工業管弦軍武曲目
const TRACKS = [
  {
    name: '鋼鐵進行曲・前線簡報',
    desc: 'A 小調經典大戰略軍武銅管進行曲',
    bpm: 106,
    bass: 'march',
    chords: [
      [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62],
      [57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64],
    ],
    kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    melody: [
      69, -1, 72, 71, 69, -1, 64, -1, 65, -1, 69, -1, 67, -1, 64, -1,
      64, -1, 67, 69, 72, -1, 71, 69, 67, -1, 71, -1, 74, -1, -1, -1,
      69, -1, 72, 71, 69, -1, 76, -1, 74, -1, 72, 71, 69, -1, 65, -1,
      68, -1, 71, 69, 68, -1, 64, -1, 69, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '裝甲戰線・閃電推進',
    desc: 'E 小調高速工業合成貝斯與裝甲突擊主旋律',
    bpm: 128,
    bass: 'drive',
    chords: [
      [52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59],
      [52, 55, 59], [57, 60, 64], [54, 59, 63], [52, 55, 59],
    ],
    kick:  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    melody: [
      64, -1, 67, -1, 71, -1, 69, 67, 64, -1, 67, 71, 72, -1, 71, 67,
      66, -1, 69, -1, 74, -1, 72, 69, 71, -1, -1, -1, 67, -1, 66, -1,
      64, 67, 71, -1, 76, -1, 74, 71, 72, -1, 76, 74, 72, -1, 69, -1,
      71, -1, 69, 67, 66, -1, 69, -1, 64, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '蒼穹防線・制空攔截',
    desc: 'D 小調高昂空戰號角與緊湊戰術節奏',
    bpm: 134,
    bass: 'drive',
    chords: [
      [50, 53, 57], [46, 50, 53], [48, 52, 55], [53, 57, 60],
      [55, 58, 62], [50, 53, 57], [45, 49, 52], [50, 53, 57],
    ],
    kick:  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    hat:   [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
    melody: [
      74, -1, -1, 69, 74, -1, 76, 77, 74, -1, 72, -1, 70, -1, 74, -1,
      72, -1, -1, 67, 72, -1, 74, 76, 77, -1, 76, -1, 72, -1, -1, -1,
      70, -1, 74, -1, 77, -1, 79, 77, 74, -1, 76, 74, 72, -1, 69, -1,
      69, -1, 73, -1, 76, -1, 73, 69, 74, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '聯合艦隊・大洋巡航',
    desc: 'C 小調壯闊海戰管弦與定音鼓波濤',
    bpm: 90,
    bass: 'fleet',
    chords: [
      [48, 51, 55], [44, 48, 51], [46, 50, 53], [51, 55, 58],
      [53, 56, 60], [48, 51, 55], [43, 47, 50], [48, 51, 55],
    ],
    kick:  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat:   [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    melody: [
      67, -1, -1, 67, 72, -1, 70, 68, 67, -1, 63, -1, 68, -1, 67, -1,
      65, -1, -1, 65, 70, -1, 68, 65, 67, -1, -1, -1, 70, -1, -1, -1,
      68, -1, 72, -1, 75, -1, 74, 72, 70, -1, 67, -1, 72, -1, 68, -1,
      67, -1, 65, -1, 62, -1, 67, -1, 60, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
  {
    name: '決戰黎明・總攻號角',
    desc: 'F 小調全編制工業管弦總攻進行曲',
    bpm: 122,
    bass: 'drive',
    chords: [
      [53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 51, 55],
      [49, 53, 56], [46, 49, 53], [48, 52, 55], [53, 56, 60],
    ],
    kick:  [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
    hat:   [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
    melody: [
      65, -1, 68, 70, 72, -1, 75, -1, 73, -1, 72, 70, 68, -1, 65, -1,
      67, -1, 70, 72, 75, -1, 73, 72, 70, -1, 67, -1, 72, -1, -1, -1,
      73, -1, 77, -1, 75, 73, 72, -1, 70, -1, 73, -1, 72, 70, 68, -1,
      67, -1, 72, -1, 76, -1, 79, -1, 77, -1, -1, -1, -1, -1, -1, -1,
    ],
  },
];

if (!(AUDIO.on.track >= 0 && AUDIO.on.track < TRACKS.length)) AUDIO.on.track = 0;

// 寫入單一管弦銅管主旋律音符（嚴格閘門在 [i0, i1) 內，首尾完美歸零，絕不與下一個音重疊）
function writeBrassNote(L, R, sr, i0, i1, freq, peak, pan = -0.1) {
  const len = i1 - i0;
  if (len <= 64) return;
  const atk = Math.min(Math.floor(sr * 0.018), Math.floor(len * 0.25));
  const rel = Math.min(Math.floor(sr * 0.028), Math.floor(len * 0.30));
  const susEnd = len - rel;
  const invAtk = 1 / Math.max(1, atk);
  const invRel = 1 / Math.max(1, rel);
  const decayStep = Math.exp(-1.2 / sr);
  let decay = 1.0;
  const gainL = peak * Math.min(1, 1 - pan);
  const gainR = peak * Math.min(1, 1 + pan);
  const dt = freq / sr;
  let phase = 0;

  for (let k = 0; k < len; k++) {
    let envVal;
    if (k < atk) {
      const u = k * invAtk;
      envVal = u * u * (3 - 2 * u);
    } else if (k >= susEnd) {
      const u = 1 - (k - susEnd) * invRel;
      envVal = u * u * (3 - 2 * u) * decay;
    } else {
      decay *= decayStep;
      envVal = decay;
    }
    // 柔和銅管泛音（降低 3、4 次泛音，消除小喇叭上的刺耳鼻音）
    const sig = (
      0.66 * fastSin(phase) +
      0.24 * fastSin(phase * 2) +
      0.08 * fastSin(phase * 3) +
      0.02 * fastSin(phase * 4)
    ) * envVal;
    const idx = i0 + k;
    L[idx] += sig * gainL;
    R[idx] += sig * gainR;
    phase += dt;
  }
}

// 寫入中音域管弦弦樂／法國號伴奏和弦（單迴圈三音同步合成，換和弦前歸零，零跨小節串音）
function writeChordPad(L, R, sr, i0, i1, chordMidi, peak) {
  const len = i1 - i0;
  if (len <= 128) return;
  const atk = Math.min(Math.floor(sr * 0.045), Math.floor(len * 0.25));
  const rel = Math.min(Math.floor(sr * 0.055), Math.floor(len * 0.30));
  const susEnd = len - rel;
  const invAtk = 1 / Math.max(1, atk);
  const invRel = 1 / Math.max(1, rel);

  const n0 = chordMidi[0] < 55 ? chordMidi[0] + 12 : chordMidi[0];
  const n1 = chordMidi[1] < 55 ? chordMidi[1] + 12 : chordMidi[1];
  const n2 = chordMidi[2] < 55 ? chordMidi[2] + 12 : chordMidi[2];
  const dt0 = midi(n0) / sr, dt1 = midi(n1) / sr, dt2 = midi(n2) / sr;
  let p0 = 0, p1 = 0, p2 = 0;

  for (let k = 0; k < len; k++) {
    let envVal;
    if (k < atk) {
      const u = k * invAtk;
      envVal = u * u * (3 - 2 * u);
    } else if (k >= susEnd) {
      const u = 1 - (k - susEnd) * invRel;
      envVal = u * u * (3 - 2 * u);
    } else {
      envVal = 1.0;
    }
    const a = envVal * peak;
    const s0 = (0.74 * fastSin(p0) + 0.16 * fastSin(p0 * 2)) * a;
    const s1 = (0.74 * fastSin(p1) + 0.16 * fastSin(p1 * 2)) * a;
    const s2 = (0.74 * fastSin(p2) + 0.16 * fastSin(p2 * 2)) * a;
    const idx = i0 + k;
    L[idx] += s0 * 1.15 + s1 + s2 * 0.85;
    R[idx] += s0 * 0.85 + s1 + s2 * 1.15;
    p0 += dt0; p1 += dt1; p2 += dt2;
  }
}

// 寫入 90 年代工業合成貝斯音符（單音閘門，下一個貝斯音開始前必定歸零）
function writeBassNote(L, R, sr, i0, i1, freq, peak) {
  const len = i1 - i0;
  if (len <= 64) return;
  const atk = Math.min(Math.floor(sr * 0.010), Math.floor(len * 0.15));
  const rel = Math.min(Math.floor(sr * 0.024), Math.floor(len * 0.25));
  const susEnd = len - rel;
  const invAtk = 1 / Math.max(1, atk);
  const invRel = 1 / Math.max(1, rel);
  const decayStep = Math.exp(-3.5 / sr);
  let decay = 1.0;
  const dt = freq / sr;
  let phase = 0;

  for (let k = 0; k < len; k++) {
    let envVal;
    if (k < atk) {
      const u = k * invAtk;
      envVal = u * u * (3 - 2 * u);
    } else if (k >= susEnd) {
      const u = 1 - (k - susEnd) * invRel;
      envVal = u * u * (3 - 2 * u) * decay;
    } else {
      decay *= decayStep;
      envVal = decay;
    }
    const sig = (0.66 * fastSin(phase) + 0.26 * fastSin(phase * 2) + 0.08 * fastSin(phase * 3)) * envVal * peak;
    const idx = i0 + k;
    L[idx] += sig;
    R[idx] += sig;
    phase += dt;
  }
}

// 寫入工業軍武打擊樂（大鼓、軍鼓、細緻銅鈸）
function writeDrumHit(L, R, sr, i0, maxIdx, kind, stepSeed) {
  if (kind === 'kick') {
    const dur = Math.min(Math.floor(sr * 0.15), maxIdx - i0);
    const invDur = 1 / Math.max(1, dur);
    const atk = Math.max(1, Math.floor(sr * 0.002));
    const fDecay = Math.exp(-28 / sr);
    const eDecay = Math.exp(-18 / sr);
    // 基頻由 36Hz 提高至 48Hz：iPad Mini 喇叭無法重現極低頻，硬推只會失真
    let fSweep = 62, envExp = 1.0, phase = 0;
    for (let k = 0; k < dur; k++) {
      phase += (48 + fSweep) / sr;
      fSweep *= fDecay;
      envExp *= eDecay;
      const a = k < atk ? k / atk : 1;
      const v = fastSin(phase) * envExp * a * (1 - k * invDur) * 0.30;
      L[i0 + k] += v;
      R[i0 + k] += v;
    }
  } else if (kind === 'snare') {
    const dur = Math.min(Math.floor(sr * 0.10), maxIdx - i0);
    const invDur = 1 / Math.max(1, dur);
    const pOff = (stepSeed * 997) % (PINK_LEN - dur - 2);
    const fDecay = Math.exp(-35 / sr);
    const eDecay = Math.exp(-24 / sr);
    let fSweep = 80, envExp = 1.0, phase = 0;
    for (let k = 0; k < dur; k++) {
      phase += (85 + fSweep) / sr;
      fSweep *= fDecay;
      envExp *= eDecay;
      const a = k < 48 ? k / 48 : 1;
      const envVal = envExp * a * (1 - k * invDur);
      const v = (fastSin(phase) * 0.14 + PINK_TABLE[pOff + k] * 0.20) * envVal;
      L[i0 + k] += v * 0.95;
      R[i0 + k] += v * 1.05;
    }
  } else if (kind === 'hat') {
    const dur = Math.min(Math.floor(sr * 0.030), maxIdx - i0);
    const invDur = 1 / Math.max(1, dur);
    const pOff = (stepSeed * 1597) % (PINK_LEN - dur - 2);
    for (let k = 0; k < dur; k++) {
      const u = 1 - k * invDur;
      const hp = PINK_TABLE[pOff + k + 1] - PINK_TABLE[pOff + k];
      const v = hp * u * u * 0.040;
      L[i0 + k] += v * 1.05;
      R[i0 + k] += v * 0.95;
    }
  }
}

// 100% 同步渲染單一曲目為無縫迴圈立體聲 AudioBuffer（原生取樣率，極速 ~15ms 零非同步競態）
function getTrackBufferSync(trackIdx) {
  if (AUDIO.bgmCache[trackIdx]) return AUDIO.bgmCache[trackIdx];
  const c = AUDIO.ctx;
  if (!c) return null;

  const cfg = TRACKS[trackIdx] || TRACKS[0];
  // 採用 AudioContext 原生硬體取樣率（iPad Mini 6 為 48000Hz / 44100Hz），確保 Safari 100% 零重取樣失真
  const sr = c.sampleRate || 48000;
  const sp = 60 / cfg.bpm / 4;
  const totalSteps = 128; // 8 小節完整兩段式循環
  const loopSamples = Math.floor(totalSteps * sp * sr);

  const buf = c.createBuffer(2, loopSamples, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const stepSamples = sp * sr;

  // 1. 預先計算所有貝斯觸發步點，確保每個貝斯音在下一個貝斯音前完全結束（零串音）
  const bassSteps = [];
  for (let s = 0; s < totalSteps; s++) {
    const pos = s % 16;
    if (cfg.bass === 'drive') {
      if (pos % 2 === 0) bassSteps.push(s);
    } else if (cfg.bass === 'fleet') {
      if (pos === 0 || pos === 8 || pos === 12) bassSteps.push(s);
    } else {
      if (pos % 4 === 0 || pos === 14) bassSteps.push(s);
    }
  }
  for (let idx = 0; idx < bassSteps.length; idx++) {
    const s0 = bassSteps[idx];
    const s1 = idx + 1 < bassSteps.length ? bassSteps[idx + 1] : totalSteps;
    const bar = Math.floor(s0 / 16) % cfg.chords.length;
    const pos = s0 % 16;
    const ch = cfg.chords[bar];
    const note = (cfg.bass === 'drive' && pos % 4 === 2) ? ch[2] - 12 : ch[0] - 12;
    const i0 = Math.floor(s0 * stepSamples);
    const maxDurSteps = Math.min(s1 - s0 - 0.12, cfg.bass === 'fleet' ? 5.5 : 2.6);
    const i1 = Math.min(loopSamples, Math.floor((s0 + Math.max(0.5, maxDurSteps)) * stepSamples));
    writeBassNote(L, R, sr, i0, i1, midi(note), 0.22);
  }

  // 2. 寫入每小節分拍和弦伴奏（每 8 步一拍獨立呼吸，換小節前強制歸零，絕不跨小節殘留）
  for (let barIdx = 0; barIdx < 8; barIdx++) {
    const ch = cfg.chords[barIdx % cfg.chords.length];
    const secondHalf = barIdx >= 4;
    for (const beatOffset of [0, 8]) {
      const s0 = barIdx * 16 + beatOffset;
      const i0 = Math.floor(s0 * stepSamples);
      const i1 = Math.min(loopSamples, Math.floor((s0 + 7.6) * stepSamples));
      writeChordPad(L, R, sr, i0, i1, ch, secondHalf ? 0.062 : 0.050);
    }
  }

  // 3. 預先計算所有主旋律音符邊界：每個音符嚴格在下一個音符開始前 0.15 步歸零結束！
  const mel = cfg.melody;
  const melEvents = [];
  for (let s = 0; s < totalSteps; s++) {
    const n = mel[s % mel.length];
    if (n > 0) melEvents.push({ step: s, note: n });
  }
  for (let idx = 0; idx < melEvents.length; idx++) {
    const ev = melEvents[idx];
    const nextStep = idx + 1 < melEvents.length ? melEvents[idx + 1].step : totalSteps;
    const availSteps = Math.min(nextStep - ev.step - 0.15, 3.6);
    const durSteps = Math.max(0.65, availSteps);
    const i0 = Math.floor(ev.step * stepSamples);
    const i1 = Math.min(loopSamples, Math.floor((ev.step + durSteps) * stepSamples));
    const isClimax = ev.step >= 64;
    writeBrassNote(L, R, sr, i0, i1, midi(ev.note), isClimax ? 0.18 : 0.16, -0.08);
    if (isClimax) {
      writeBrassNote(L, R, sr, i0, i1, midi(ev.note - 12), 0.075, 0.12);
    }
  }

  // 4. 寫入打擊樂節奏
  for (let s = 0; s < totalSteps; s++) {
    const pos = s % 16;
    const i0 = Math.floor(s * stepSamples);
    if (cfg.kick && cfg.kick[pos]) writeDrumHit(L, R, sr, i0, loopSamples, 'kick', s);
    if (cfg.snare && cfg.snare[pos]) writeDrumHit(L, R, sr, i0, loopSamples, 'snare', s);
    if (cfg.hat && cfg.hat[pos]) writeDrumHit(L, R, sr, i0, loopSamples, 'hat', s);
  }

  // 5. 單極低通（約 5.5kHz）柔化整體高頻，兩次掃描使濾波狀態於迴圈首尾一致（無縫接合）
  const lpA = 1 - Math.exp(-2 * Math.PI * 5500 / sr);
  for (const ch of [L, R]) {
    let y = 0;
    for (let i = loopSamples - 2048; i < loopSamples; i++) y += lpA * (ch[i] - y);
    for (let i = 0; i < loopSamples; i++) {
      y += lpA * (ch[i] - y);
      ch[i] = y;
    }
  }

  // 6. 響度校準（預留多聲部餘裕）與首尾零交越平滑
  let sumSq = 0;
  for (let i = 0; i < loopSamples; i += 4) {
    sumSq += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sumSq / ((loopSamples / 4) * 2)) || 0.001;
  const gain = Math.min(2.0, 0.12 / rms);
  const fadeSamples = Math.min(96, Math.floor(sr * 0.002));

  for (let i = 0; i < loopSamples; i++) {
    let g = gain;
    if (i < fadeSamples) g *= i / fadeSamples;
    else if (i >= loopSamples - fadeSamples) g *= (loopSamples - 1 - i) / fadeSamples;
    const uL = L[i] * g;
    const uR = R[i] * g;
    L[i] = uL / (1 + Math.abs(uL) * 0.35);
    R[i] = uR / (1 + Math.abs(uR) * 0.35);
  }

  AUDIO.bgmCache[trackIdx] = buf;
  return buf;
}

// 100% 同步啟動單例 BGM（無 async/await 空窗期，絕不產生多重實例）
function startMusic() {
  stopMusic();
  if (!AUDIO.ctx || !AUDIO.on.music || typeof window === 'undefined') return;
  const c = AUDIO.ctx;

  const gen = AUDIO.bgmGen;
  if (!AUDIO.musicConnected && AUDIO.bgmFilter) {
    try { AUDIO.music.connect(AUDIO.bgmFilter); AUDIO.musicConnected = true; } catch (e) { /* 忽略 */ }
  }
  setParam(AUDIO.music.gain, MUSIC_GAIN);
  // 由全靜音狀態直接切換曲目時，恢復主增益
  if (AUDIO.master) setParam(AUDIO.master.gain, MASTER_GAIN);
  resumeCtx();

  const trackIdx = ((AUDIO.on.track % TRACKS.length) + TRACKS.length) % TRACKS.length;
  if (AUDIO.mode === 'html') {
    startHtmlMusic(trackIdx);
    return;
  }
  const buf = getTrackBufferSync(trackIdx);
  if (!buf) return;

  const src = c.createBufferSource();
  const bus = c.createGain();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = buf.duration;

  const targetGain = AUDIO.tense ? 0.85 : 1.0;
  bus.gain.setValueAtTime(targetGain, c.currentTime);
  bus.gain.value = targetGain;

  src.connect(bus);
  bus.connect(AUDIO.music);

  // 單例保證：渲染期間若世代已變更（理論上同步不會發生），放棄本次啟動
  if (gen !== AUDIO.bgmGen || AUDIO.bgmSource) {
    try { bus.disconnect(); src.disconnect(); } catch (e) { /* 忽略 */ }
    return;
  }
  AUDIO.bgmSource = src;
  AUDIO.bgmBus = bus;
  AUDIO.activeList.push({ src, bus });
  src.start(0);
}

// 相容模式：將同一份 PCM 迴圈轉成 16-bit WAV，交由 HTML <audio> 媒體管線播放（完全繞過 Web Audio 輸出）。
// iOS 的 audio.volume 為唯讀，因此音量直接烘焙進波形。
const HTML_MUSIC_GAIN = 0.32;

function getTrackWavUrl(trackIdx) {
  AUDIO.wavCache = AUDIO.wavCache || {};
  if (AUDIO.wavCache[trackIdx]) return AUDIO.wavCache[trackIdx];
  const buf = getTrackBufferSync(trackIdx);
  if (!buf) return null;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const n = L.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * 4);
  const v = new DataView(ab);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, L[i] * HTML_MUSIC_GAIN)) * 32767, true);
    v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i] * HTML_MUSIC_GAIN)) * 32767, true);
    o += 4;
  }
  const url = URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
  AUDIO.wavCache[trackIdx] = url;
  return url;
}

function startHtmlMusic(trackIdx) {
  let el = AUDIO.htmlEl;
  if (!el) {
    el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    AUDIO.htmlEl = el;
  }
  const url = getTrackWavUrl(trackIdx);
  if (!url) return;
  if (el.src !== url) el.src = url;
  try { el.currentTime = 0; } catch (e) { /* 忽略 */ }
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
  AUDIO.bgmSource = { html: true };
}

function setTrack(i, manual = true) {
  if (manual) {
    AUDIO.manual = true;
    AUDIO.on.music = true;
  }
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
  t1: 0, t2: 2, t3: 4, c2: 3, c3: 1, c4: 2, c5: 4,
  f1: 0, f2: 3, f3: 2, f4: 1, f5: 2, f6: 1, f7: 3, f8: 4,
};

function scenarioTrack(g) {
  if (!g) return 0;
  if (g.missionId && MISSION_TRACK[g.missionId] !== undefined) return MISSION_TRACK[g.missionId];
  const seaCnt = Array.isArray(g.terrain) ? g.terrain.filter(t => t === 'sea').length : 0;
  const seaRatio = g.terrain && g.terrain.length ? seaCnt / g.terrain.length : 0;
  const seed = Math.abs(g.seed || 0);
  if (seaRatio >= 0.35) return 3;
  const landTracks = [0, 1, 2, 4];
  return landTracks[seed % landTracks.length];
}

function playContextBGM(phase, force = false) {
  if (typeof window === 'undefined') return;
  if (force) AUDIO.manual = false;
  if (AUDIO.manual && phase !== 'victory') return;
  const g = typeof G !== 'undefined' ? G : null;
  let idx = 0;
  if (phase === 'deploy') idx = 0;
  else if (phase === 'victory') idx = 4;
  else idx = scenarioTrack(g);
  if (AUDIO.on.track !== idx || !AUDIO.bgmSource) {
    setTrack(idx, false);
  }
}

function setMusicTense(on) {
  AUDIO.tense = !!on;
  if (AUDIO.bgmBus && AUDIO.ctx) {
    try {
      const val = AUDIO.tense ? 0.85 : 1.0;
      AUDIO.bgmBus.gain.setValueAtTime(val, AUDIO.ctx.currentTime);
      AUDIO.bgmBus.gain.value = val;
    } catch (e) { /* 忽略 */ }
  }
}

// 首次使用者互動時解鎖並初始化 Web Audio（相容 iPad Mini 6 / iOS Safari 與桌面瀏覽器）
// audioInit 完全冪等：resume 經互斥鎖合併、BGM 同步單例啟動，雙重觸發不會產生第二個實例
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    window.addEventListener(ev, audioInit, { once: false, passive: true })
  );
  // 轉入背景／離開頁面：只停止音效並將主增益歸零，不自行 suspend（避免主畫面 App 輸出卡住重複播放），
  // 由 iOS 自行中斷背景音訊；回到前景時恢復增益並經互斥鎖 resume
  const quiet = () => {
    stopAllSfx();
    if (AUDIO.master) setParam(AUDIO.master.gain, 0);
    if (AUDIO.htmlEl) {
      try { AUDIO.htmlEl.pause(); } catch (e) { /* 忽略 */ }
    }
  };
  window.addEventListener('pagehide', quiet);
  // 主畫面 App 被系統凍結（切到背景、鎖定）前同樣靜音
  if (typeof document !== 'undefined') document.addEventListener('freeze', quiet);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!AUDIO.ctx) return;
      if (document.hidden) {
        quiet();
      } else if (!audioAllOff()) {
        setParam(AUDIO.master.gain, MASTER_GAIN);
        audioInit();
        if (AUDIO.htmlEl && AUDIO.on.music && AUDIO.bgmSource && AUDIO.bgmSource.html) {
          const p = AUDIO.htmlEl.play();
          if (p && p.catch) p.catch(() => {});
        }
      }
    });
  }
}
