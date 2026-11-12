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
  sfxWet: null,     // 帶殘響的音效輸入（乾聲＋共用短殘響，最終仍經 sfxBus）
  reverb: null,     // 共用 ConvolverNode（只建立一次）
  duck: null,       // BGM 閃避增益（爆炸時短暫壓低音樂）
  out: null,        // 最末級輸出節點（軟削波安全網）
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
const MUSIC_GAIN = 0.27;
const SFX_GAIN = 0.68;
const VOICE_GAIN = 0.72;
const MAX_VOICES = 40;
const REVERB_WET = 0.24;      // 殘響濕聲比例（低量，只為消除合成音的乾澀感）
const DUCK_LEVEL = 0.708;     // 閃避深度 -3dB
const DUCK_RELEASE_TC = 0.1;  // 恢復時間常數（約 300ms 回到 95%）

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

// 軟削波曲線（奇數點數，使輸入 0 精確對應輸出 0）：|x|≤0.8 線性，之上 tanh 平滑逼近 0.98
function makeSoftClipCurve() {
  const n = 4097;
  const curve = new Float32Array(n);
  const knee = 0.8, room = 0.18;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

// 演算法殘響脈衝：8ms 預延遲 + 去相關立體聲噪音，指數衰減（seconds 內衰減 60dB），
// 並以隨時間下降的單極低通讓尾音逐漸變暗（模擬空氣吸收），聽感自然不金屬
function createReverbImpulse(ctx, seconds) {
  const sr = ctx.sampleRate || 48000;
  const len = Math.max(1, Math.floor(sr * seconds));
  const pre = Math.floor(sr * 0.008);
  const buf = ctx.createBuffer(2, len, sr);
  const k60 = 6.9 / seconds;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const tt = (i - pre) / sr;
      const fc = 7000 * Math.exp(-tt * 2.2) + 700;
      const a = 1 - Math.exp(-2 * Math.PI * fc / sr);
      y += a * ((Math.random() * 2 - 1) - y);
      const fadeIn = Math.min(1, tt / 0.004);
      d[i] = y * Math.exp(-tt * k60) * fadeIn;
    }
  }
  return buf;
}

// BGM 閃避：快速（約 10ms）壓低至 -3dB，維持 hold 秒後以約 300ms 恢復
function duckMusic(t, hold = 0.06) {
  const d = AUDIO.duck;
  if (!d) return;
  try {
    const g = d.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(DUCK_LEVEL, t, 0.004);
    g.setTargetAtTime(1, t + 0.02 + hold, DUCK_RELEASE_TC);
  } catch (e) { /* 忽略 */ }
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

// 清除已移除的測試用「音訊模式」設定
try { localStorage.removeItem('daisenryaku_audio_mode'); } catch (e) { /* 忽略 */ }

// 建立 AudioContext。主畫面網頁 App 專用修正（Safari 分頁不受影響）：
// 1. 將 iOS 音訊工作階段固定為 ambient：鎖定螢幕／休眠時由系統靜音，且不搶占其他 App 音訊。
//    切勿使用 playback：該類別允許背景與鎖定畫面持續播放，主畫面 App 卡住時聲音在休眠後仍不停止；
// 2. iOS 取樣率錯配 bug（WebKit 154538）：context 回報的取樣率與硬體實際渲染速率不同，
//    造成失真、重複怪音與音高／速度錯誤。已知解法：建立後播放一個空白樣本、立即關閉，再建立新的 context。
function createAudioContext(AC) {
  if (IS_STANDALONE && window.navigator.audioSession) {
    try { window.navigator.audioSession.type = 'ambient'; } catch (e) { /* 忽略 */ }
  }
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
  AUDIO.master = master;

  // 最末級軟削波安全網（無狀態 WaveShaper）：±0.8 內完全線性透明，之上以 tanh 曲線
  // 平滑逼近 0.98，保證輸出絕不超過 ±1.0。master 增益歸零時輸出仍為純 0（靜音邏輯不變）。
  let out = master;
  try {
    const clip = c.createWaveShaper();
    clip.curve = makeSoftClipCurve();
    clip.oversample = 'none';
    master.connect(clip);
    clip.connect(c.destination);
    out = clip;
  } catch (e) {
    master.connect(c.destination);
  }
  AUDIO.out = out;

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

  // 匯流排黏合壓縮：慢起音（保留音效瞬態）、溫和比例，將音樂與音效黏合成同一空間
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.012;
  comp.release.value = 0.22;
  comp.connect(rumble);
  AUDIO.comp = comp;

  // BGM 閃避增益：爆炸／砲擊時快速壓低約 3dB、約 300ms 恢復（不影響 musicBus 的連線／靜音邏輯）
  const duck = c.createGain();
  duck.gain.value = 1;
  duck.connect(comp);
  AUDIO.duck = duck;

  // BGM 中高頻挖空濾波器（2.1kHz -4.5dB），讓戰術音效清晰浮現
  const bgmDip = c.createBiquadFilter();
  bgmDip.type = 'peaking';
  bgmDip.frequency.value = 2100;
  bgmDip.Q.value = 0.9;
  bgmDip.gain.value = -4.5;
  bgmDip.connect(duck);
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

  // 共用短殘響（只建立一次）：sfxWet → sfxBus（乾聲）＋ sfxWet → 高通 → Convolver → 濕聲增益 → sfxBus。
  // 濕聲同樣經過 sfxBus，音效關閉（增益 0）時殘響輸入與輸出一併靜音。
  const sfxWet = c.createGain();
  sfxWet.gain.value = 1;
  sfxWet.connect(sfxBus);
  AUDIO.sfxWet = sfxWet;
  try {
    const verbHp = c.createBiquadFilter();
    verbHp.type = 'highpass';
    verbHp.frequency.value = 220;
    verbHp.Q.value = 0.6;
    const verb = c.createConvolver();
    verb.buffer = createReverbImpulse(c, 1.15);
    const verbRet = c.createGain();
    verbRet.gain.value = REVERB_WET;
    sfxWet.connect(verbHp);
    verbHp.connect(verb);
    verb.connect(verbRet);
    verbRet.connect(sfxBus);
    AUDIO.reverb = verb;
  } catch (e) { /* 不支援時僅保留乾聲 */ }

  const bufs = createNoiseBuffers(c);
  AUDIO.noiseWhite = bufs.white;
  AUDIO.noisePink = bufs.pink;

  resumeCtx();
  if (AUDIO.on.music) startMusic();
}

// 強制同步關閉並斷開所有 BGM 節點（實體斷線保證 iPad Safari 100% 立即靜音）
function stopMusic() {
  AUDIO.bgmGen++;
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
    if (item.src) {
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

function env(g, t, attack, peak, decay, end = 0.0001, minAttack = 0.004) {
  // 柔化起音（預設最短 4ms；瞬態層可明確要求 1.5ms）並統一降低單聲部增益，避免多聲部疊加削波
  const a = Math.max(Math.max(0.0015, minAttack), attack);
  const d = Math.max(0.01, decay);
  const p = Math.max(0.0002, peak * VOICE_GAIN);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end), t + a + d);
}

function noiseHit(dest, t, {
  dur = 0.25, peak = 0.5, type = 'lowpass', freq = 1000, q = 0.8,
  toFreq = 0, attack = 0.004, pink = true, minAttack = 0.004,
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
  env(g, t, attack, peak, dur, 0.0001, minAttack);
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
  const D = AUDIO.sfx;            // 乾聲（UI 介面音）
  const W = AUDIO.sfxWet || D;    // 乾聲＋共用短殘響（戰場音效）

  // 分層積木：瞬態「喀」（高通白噪音極短脈衝）
  const crack = (tk, peak, freq = 2600, dur = 0.008) =>
    noiseHit(W, tk, { dur, peak, type: 'highpass', freq, q: 0.7, attack: 0.0015, minAttack: 0.0015, pink: false });
  // 爆炸後的碎裂噼啪尾音（少量隨機極短高頻顆粒）
  const crackle = (t0, span, count, peak) => {
    for (let k = 0; k < count; k++) {
      const tk = t0 + Math.random() * span;
      noiseHit(W, tk, {
        dur: 0.012 + Math.random() * 0.02, peak: peak * (0.6 + Math.random() * 0.4),
        type: 'bandpass', freq: 2200 + Math.random() * 2600, q: 1.1, attack: 0.001, pink: false,
      });
    }
  };

  switch (name) {
    case 'click':
      // 極短、極輕、限頻的「嗒」聲（帶通噪音，無音高，不是嗶聲）
      noiseHit(D, t, { dur: 0.010, peak: 0.16, type: 'bandpass', freq: 3200, q: 2.4, attack: 0.001, pink: false });
      break;
    case 'gun':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.072 + (Math.random() - 0.5) * 0.006;
        crack(tk, 0.40, 2800);
        noiseHit(W, tk, { dur: 0.065, peak: 0.62, type: 'bandpass', freq: 1250, toFreq: 450, q: 0.9, attack: 0.002, pink: false });
        tone(W, tk, { freq: 170, to: 62, dur: 0.045, peak: 0.36, type: 'sine', attack: 0.002 });
      }
      break;
    case 'mg':
      for (let k = 0; k < 5; k++) {
        const tk = t + k * 0.05 + (Math.random() - 0.5) * 0.005;
        crack(tk, 0.32, 3000, 0.006);
        noiseHit(W, tk, { dur: 0.045, peak: 0.58, type: 'bandpass', freq: 1000, toFreq: 380, q: 0.9, attack: 0.002, pink: false });
      }
      break;
    case 'cannon':
      duckMusic(t, 0.05);
      crack(t, 0.55, 2000, 0.012);
      tone(W, t, { freq: 110, to: 38, dur: 0.36, peak: 0.80, type: 'sine', attack: 0.003 });
      tone(W, t, { freq: 190, to: 70, dur: 0.16, peak: 0.32, type: 'triangle', attack: 0.003, cutoff: 420 });
      noiseHit(W, t, { dur: 0.30, peak: 0.78, type: 'lowpass', freq: 2400, toFreq: 160, q: 0.8, attack: 0.003 });
      noiseHit(W, t + 0.04, { dur: 0.50, peak: 0.34, type: 'lowpass', freq: 420, toFreq: 80, q: 0.7, attack: 0.02 });
      break;
    case 'missile':
      // 點火瞬態 + 低頻推力 + 上升濾波噪音呼嘯
      crack(t, 0.30, 1800, 0.014);
      tone(W, t, { freq: 150, to: 60, dur: 0.09, peak: 0.34, type: 'sine', attack: 0.003 });
      noiseHit(W, t + 0.01, { dur: 0.42, peak: 0.62, type: 'bandpass', freq: 320, toFreq: 2400, q: 1.4, attack: 0.10 });
      noiseHit(W, t + 0.03, { dur: 0.34, peak: 0.22, type: 'highpass', freq: 1800, toFreq: 4200, q: 0.7, attack: 0.12, pink: false });
      break;
    case 'jet':
      noiseHit(W, t, { dur: 0.42, peak: 0.34, type: 'bandpass', freq: 320, toFreq: 900, q: 1.2, attack: 0.12 });
      noiseHit(W, t + 0.05, { dur: 0.32, peak: 0.12, type: 'highpass', freq: 2500, toFreq: 4500, q: 0.7, attack: 0.12, pink: false });
      tone(W, t, { freq: 115, to: 155, dur: 0.38, peak: 0.12, type: 'triangle', attack: 0.10, cutoff: 380 });
      break;
    case 'explode':
      duckMusic(t, opt.big ? 0.22 : 0.08);
      if (opt.big) {
        tone(W, t, { freq: 90, to: 32, dur: 0.62, peak: 0.90, type: 'sine', attack: 0.003 });
        tone(W, t, { freq: 160, to: 50, dur: 0.30, peak: 0.34, type: 'triangle', attack: 0.003, cutoff: 360 });
        noiseHit(W, t, { dur: 0.62, peak: 0.90, type: 'lowpass', freq: 3200, toFreq: 90, q: 0.8, attack: 0.003 });
        noiseHit(W, t + 0.12, { dur: 0.70, peak: 0.42, type: 'lowpass', freq: 650, toFreq: 60, q: 0.7, attack: 0.02 });
        crackle(t + 0.08, 0.55, 5, 0.26);
      } else {
        tone(W, t, { freq: 90, to: 35, dur: 0.38, peak: 0.80, type: 'sine', attack: 0.003 });
        tone(W, t, { freq: 150, to: 55, dur: 0.18, peak: 0.28, type: 'triangle', attack: 0.003, cutoff: 360 });
        noiseHit(W, t, { dur: 0.40, peak: 0.80, type: 'lowpass', freq: 2600, toFreq: 110, q: 0.8, attack: 0.003 });
        crackle(t + 0.06, 0.35, 3, 0.22);
      }
      break;
    case 'engine':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.085;
        tone(W, tk, { freq: 56 + k * 5, to: 48 + k * 4, dur: 0.09, peak: 0.26, type: 'triangle', attack: 0.008, cutoff: 260 });
        noiseHit(W, tk, { dur: 0.08, peak: 0.24, type: 'lowpass', freq: 300, q: 0.8, attack: 0.008 });
      }
      break;
    case 'foot':
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.105 + (Math.random() - 0.5) * 0.01;
        tone(W, tk, { freq: 95, to: 44, dur: 0.04, peak: 0.20, type: 'sine', attack: 0.003 });
        noiseHit(W, tk, { dur: 0.05, peak: 0.30, type: 'lowpass', freq: 520, toFreq: 160, q: 0.7, attack: 0.003 });
      }
      break;
    case 'wave':
      noiseHit(W, t, { dur: 0.46, peak: 0.34, type: 'lowpass', freq: 520, toFreq: 170, q: 0.8, attack: 0.09 });
      noiseHit(W, t + 0.08, { dur: 0.30, peak: 0.16, type: 'bandpass', freq: 1400, toFreq: 500, q: 0.9, attack: 0.06, pink: false });
      break;
    case 'capture':
      // 柔和起音的三音上行動機（E5–G5–C6），三角波經低通＋低八度正弦墊底
      [659.25, 783.99, 1046.5].forEach((f, k) => {
        const tk = t + k * 0.09;
        const d = k === 2 ? 0.36 : 0.15;
        tone(W, tk, { freq: f, dur: d, peak: 0.26, type: 'triangle', attack: 0.012, cutoff: 2200 });
        tone(W, tk, { freq: f * 0.5, dur: d, peak: 0.12, type: 'sine', attack: 0.012 });
      });
      break;
    case 'build':
      noiseHit(W, t, { dur: 0.03, peak: 0.20, type: 'bandpass', freq: 1300, toFreq: 420, q: 1.4, attack: 0.002 });
      tone(W, t, { freq: 392.0, dur: 0.11, peak: 0.24, type: 'triangle', attack: 0.010, cutoff: 1800 });
      tone(W, t + 0.085, { freq: 587.33, dur: 0.22, peak: 0.26, type: 'triangle', attack: 0.010, cutoff: 2000 });
      tone(W, t + 0.085, { freq: 293.66, dur: 0.22, peak: 0.10, type: 'sine', attack: 0.010 });
      break;
    case 'turn':
      // 柔和低音漸強（G3＋D4 五度，慢起音）＋粉紅噪音氣息
      tone(W, t, { freq: 196.0, dur: 0.34, peak: 0.26, type: 'triangle', attack: 0.16, cutoff: 900 });
      tone(W, t + 0.04, { freq: 293.66, dur: 0.30, peak: 0.16, type: 'triangle', attack: 0.14, cutoff: 1100 });
      tone(W, t, { freq: 98.0, dur: 0.32, peak: 0.16, type: 'sine', attack: 0.16 });
      noiseHit(W, t, { dur: 0.22, peak: 0.08, type: 'lowpass', freq: 300, toFreq: 1000, q: 0.7, attack: 0.18 });
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
        const tk = t + k * 0.11;
        const d = k === 4 ? 0.50 : 0.18;
        tone(W, tk, { freq: f, dur: d, peak: 0.22, type: 'triangle', attack: 0.012, cutoff: 2400 });
        tone(W, tk, { freq: f * 0.5, dur: d, peak: 0.12, type: 'sine', attack: 0.012 });
      });
      break;
    case 'lose':
      [440.0, 392.0, 349.23, 293.66].forEach((f, k) => {
        const tk = t + k * 0.20;
        const d = k === 3 ? 0.52 : 0.22;
        tone(W, tk, { freq: f, dur: d, peak: 0.20, type: 'triangle', attack: 0.02, cutoff: 1400 });
        tone(W, tk, { freq: f * 0.5, dur: d, peak: 0.12, type: 'sine', attack: 0.02 });
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
  // 合奏加倍聲部：微失諧（+5 cents）並反向聲像，產生自然立體寬度與合奏感
  const dt2 = dt * 1.0029;
  const gain2L = peak * 0.22 * Math.min(1, 1 + pan * 4);
  const gain2R = peak * 0.22 * Math.min(1, 1 - pan * 4);
  // 動態亮度：起音時泛音最亮，約 120ms 內收斂至較暗的持續音色（真實銅管特性，持續段不刺耳）
  const brightStep = Math.exp(-1 / (sr * 0.12));
  let bright = 1.0;
  let phase = 0, phase2 = 0.25;

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
    bright *= brightStep;
    const b = 0.45 + 0.55 * bright;
    // 柔和銅管泛音（3、4 次泛音隨亮度包絡收斂，消除小喇叭上的刺耳鼻音）
    const sig = (
      0.68 * fastSin(phase) +
      0.24 * b * fastSin(phase * 2) +
      0.07 * b * b * fastSin(phase * 3) +
      0.015 * b * b * fastSin(phase * 4)
    ) * envVal;
    const sig2 = (0.80 * fastSin(phase2) + 0.15 * b * fastSin(phase2 * 2)) * envVal;
    const idx = i0 + k;
    L[idx] += sig * gainL + sig2 * gain2L;
    R[idx] += sig * gainR + sig2 * gain2R;
    phase += dt;
    phase2 += dt2;
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
  // 左右聲道各自微失諧（±0.5 cent）的弦樂合奏：去相關產生立體寬度，單聲道相加時僅輕微慢速拍頻
  const dL = 0.9997, dR = 1.0003;
  const dt0 = midi(n0) / sr, dt1 = midi(n1) / sr, dt2 = midi(n2) / sr;
  const l0 = dt0 * dL, l1 = dt1 * dL, l2 = dt2 * dL;
  const r0 = dt0 * dR, r1 = dt1 * dR, r2 = dt2 * dR;
  let p0 = 0, p1 = 0, p2 = 0;
  let q0 = 0, q1 = 0, q2 = 0;

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
    // 二次泛音左右共用（省運算），僅基音各自微失諧
    const h0 = 0.13 * fastSin(p0 * 2), h1 = 0.13 * fastSin(p1 * 2), h2 = 0.13 * fastSin(p2 * 2);
    const sL0 = (0.76 * fastSin(p0) + h0) * a;
    const sL1 = (0.76 * fastSin(p1) + h1) * a;
    const sL2 = (0.76 * fastSin(p2) + h2) * a;
    const sR0 = (0.76 * fastSin(q0) + h0) * a;
    const sR1 = (0.76 * fastSin(q1) + h1) * a;
    const sR2 = (0.76 * fastSin(q2) + h2) * a;
    const idx = i0 + k;
    L[idx] += sL0 * 1.15 + sL1 + sL2 * 0.85;
    R[idx] += sR0 * 0.85 + sR1 + sR2 * 1.15;
    p0 += l0; p1 += l1; p2 += l2;
    q0 += r0; q1 += r1; q2 += r2;
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
    // 起音 3.5ms smoothstep（原 2ms 線性）＋較慢的音高掃頻：減少「喀」聲，保留低頻衝擊
    const atk = Math.max(1, Math.floor(sr * 0.0035));
    const fDecay = Math.exp(-24 / sr);
    const eDecay = Math.exp(-18 / sr);
    // 基頻由 36Hz 提高至 48Hz：iPad Mini 喇叭無法重現極低頻，硬推只會失真
    let fSweep = 56, envExp = 1.0, phase = 0;
    for (let k = 0; k < dur; k++) {
      phase += (48 + fSweep) / sr;
      fSweep *= fDecay;
      envExp *= eDecay;
      let a = 1;
      if (k < atk) { const u = k / atk; a = u * u * (3 - 2 * u); }
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
    // 軍鼓響弦噪音先經單極低通（約 4.5kHz），起音 2.5ms，去除刺耳的數位「喀」聲
    const nA = 1 - Math.exp(-2 * Math.PI * 4500 / sr);
    const sAtk = Math.max(1, Math.floor(sr * 0.0025));
    let nY = 0;
    for (let k = 0; k < dur; k++) {
      phase += (85 + fSweep) / sr;
      fSweep *= fDecay;
      envExp *= eDecay;
      const a = k < sAtk ? k / sAtk : 1;
      const envVal = envExp * a * (1 - k * invDur);
      nY += nA * (PINK_TABLE[pOff + k] - nY);
      const v = (fastSin(phase) * 0.14 + nY * 0.22) * envVal;
      L[i0 + k] += v * 0.95;
      R[i0 + k] += v * 1.05;
    }
  } else if (kind === 'hat') {
    const dur = Math.min(Math.floor(sr * 0.030), maxIdx - i0);
    const invDur = 1 / Math.max(1, dur);
    const pOff = (stepSeed * 1597) % (PINK_LEN - dur - 2);
    // 銅鈸起音 1.5ms 淡入並略降音量，避免每拍一個尖銳脈衝
    const hAtk = Math.max(1, Math.floor(sr * 0.0015));
    for (let k = 0; k < dur; k++) {
      const u = 1 - k * invDur;
      const fi = k < hAtk ? k / hAtk : 1;
      const hp = PINK_TABLE[pOff + k + 1] - PINK_TABLE[pOff + k];
      const v = hp * u * u * fi * 0.034;
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

  // 5. 雙極（兩級單極串接，約 6.2kHz）柔和低通去除整體刺耳高頻，預先掃描迴圈尾端使濾波狀態於首尾一致（無縫接合）
  const lpA = 1 - Math.exp(-2 * Math.PI * 6200 / sr);
  for (const ch of [L, R]) {
    let y1 = 0, y2 = 0;
    for (let i = loopSamples - 2048; i < loopSamples; i++) { y1 += lpA * (ch[i] - y1); y2 += lpA * (y1 - y2); }
    for (let i = 0; i < loopSamples; i++) {
      y1 += lpA * (ch[i] - y1);
      y2 += lpA * (y1 - y2);
      ch[i] = y2;
    }
  }

  // 5b. 交叉早期反射（13ms／17ms 互饋對側聲道，環狀索引保持迴圈無縫）：增加空間感與立體寬度
  {
    const cL = Float32Array.from(L);
    const cR = Float32Array.from(R);
    const d1 = Math.floor(sr * 0.013), d2 = Math.floor(sr * 0.017);
    const x = 0.10;
    for (let i = 0; i < loopSamples; i++) {
      let jR = i - d1; if (jR < 0) jR += loopSamples;
      let jL = i - d2; if (jL < 0) jL += loopSamples;
      L[i] = cL[i] + cR[jR] * x;
      R[i] = cR[i] + cL[jL] * x;
    }
  }

  // 6. 響度校準（全曲目統一 RMS 目標，預留多聲部餘裕）與首尾零交越平滑
  let sumSq = 0;
  for (let i = 0; i < loopSamples; i += 4) {
    sumSq += L[i] * L[i] + R[i] * R[i];
  }
  const rms = Math.sqrt(sumSq / ((loopSamples / 4) * 2)) || 0.001;
  const gain = Math.min(2.0, 0.12 / rms);
  const fadeSamples = Math.min(96, Math.floor(sr * 0.002));
  // 有界軟削波：|u|≤0.7 完全線性，之上 tanh 平滑逼近 0.98，保證任何樣本絕不超過 ±1.0
  const KNEE = 0.7, ROOM = 0.28;
  const shape = u => {
    const a = u < 0 ? -u : u;
    if (a <= KNEE) return u;
    const y = KNEE + ROOM * Math.tanh((a - KNEE) / ROOM);
    return u < 0 ? -y : y;
  };

  for (let i = 0; i < loopSamples; i++) {
    let g = gain;
    if (i < fadeSamples) g *= i / fadeSamples;
    else if (i >= loopSamples - fadeSamples) g *= (loopSamples - 1 - i) / fadeSamples;
    L[i] = shape(L[i] * g);
    R[i] = shape(R[i] * g);
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
  q1: 0, q2: 1, q3: 2, q4: 3, q5: 2, q6: 4,
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
      }
    });
  }
}
