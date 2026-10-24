'use strict';
// ===== 戰術音效引擎（Web Audio 即時合成，無背景音樂、不需外部檔案） =====

const AUDIO = {
  ctx: null,
  master: null,
  sfx: null,
  noiseWhite: null,
  noisePink: null,
  on: { sfx: true },
  lastAt: {},
  lastActionAt: 0,
};

try {
  const saved = JSON.parse(localStorage.getItem('daisenryaku_audio'));
  if (saved && typeof saved.sfx === 'boolean') AUDIO.on.sfx = saved.sfx;
} catch (e) { /* 忽略 */ }

function saveAudio() {
  try { localStorage.setItem('daisenryaku_audio', JSON.stringify({ sfx: AUDIO.on.sfx })); } catch (e) { /* 忽略 */ }
}

function audioInit() {
  if (typeof window === 'undefined') return;
  if (AUDIO.ctx) {
    if (AUDIO.ctx.state === 'suspended' || AUDIO.ctx.state === 'interrupted') {
      AUDIO.ctx.resume().catch(() => {});
    }
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let c;
  try { c = new AC(); } catch (e) { return; }
  AUDIO.ctx = c;

  const master = c.createGain();
  master.gain.value = 0.85;
  master.connect(c.destination);
  AUDIO.master = master;

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  comp.connect(master);

  const sfxBus = c.createGain();
  sfxBus.gain.value = AUDIO.on.sfx ? 0.65 : 0;
  sfxBus.connect(comp);
  AUDIO.sfx = sfxBus;

  // 預先合成 3 秒白噪音與粉紅噪音（1/f 濾波，消除刺耳高頻嘶聲）
  const durSec = 3.0;
  const len = Math.floor(c.sampleRate * durSec);
  const wBuf = c.createBuffer(1, len, c.sampleRate);
  const pBuf = c.createBuffer(1, len, c.sampleRate);
  const wData = wBuf.getChannelData(0);
  const pData = pBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
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
  AUDIO.noiseWhite = wBuf;
  AUDIO.noisePink = pBuf;
}

function setAudio(kind, on) {
  if (kind !== 'sfx') return;
  AUDIO.on.sfx = !!on;
  saveAudio();
  if (!AUDIO.ctx) audioInit();
  if (!AUDIO.ctx || !AUDIO.sfx) return;
  const c = AUDIO.ctx;
  AUDIO.sfx.gain.cancelScheduledValues(c.currentTime);
  AUDIO.sfx.gain.setTargetAtTime(AUDIO.on.sfx ? 0.65 : 0, c.currentTime, 0.02);
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
  toFreq = 0, attack = 0.004, pink = true,
} = {}) {
  const c = AUDIO.ctx;
  const buf = pink ? AUDIO.noisePink : AUDIO.noiseWhite;
  if (!c || !buf) return;
  const src = c.createBufferSource();
  const f = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
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
  const maxOffset = Math.max(0.01, buf.duration - totalDur - 0.08);
  const offset = Math.random() * maxOffset;
  src.onended = () => {
    try { src.disconnect(); f.disconnect(); g.disconnect(); } catch (e) { /* 忽略 */ }
  };
  src.start(t, offset);
  src.stop(t + totalDur + 0.03);
}

function tone(dest, t, {
  freq = 440, dur = 0.18, peak = 0.25, type = 'triangle',
  to = 0, attack = 0.004, cutoff = 0,
} = {}) {
  const c = AUDIO.ctx;
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
  o.onended = () => {
    try { o.disconnect(); if (f) f.disconnect(); g.disconnect(); } catch (e) { /* 忽略 */ }
  };
  o.start(t);
  o.stop(t + attack + dur + 0.03);
}

// ----- 戰術音效庫 -----
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
  // 若剛觸發動作音效，抑制同一瞬間的按鈕 click 音效避免重疊破音
  if (name === 'click' && now - AUDIO.lastActionAt < 65) return;
  const minGap = name === 'click' ? 35 : 45;
  if (now - (AUDIO.lastAt[name] || 0) < minGap) return;
  AUDIO.lastAt[name] = now;
  if (name !== 'click') AUDIO.lastActionAt = now;

  const t = c.currentTime + 0.008;
  const D = AUDIO.sfx;

  switch (name) {
    case 'click':
      // 清脆短促的機械按鍵微響
      tone(D, t, { freq: 620, to: 260, dur: 0.022, peak: 0.09, type: 'triangle', attack: 0.002 });
      noiseHit(D, t, { dur: 0.012, peak: 0.05, type: 'bandpass', freq: 1800, q: 1.5, pink: false });
      break;

    case 'gun':
      // 步槍三連發點射：緊湊槍機撞擊 + 清脆槍口爆音
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.072;
        tone(D, tk, { freq: 195, to: 58, dur: 0.045, peak: 0.30, type: 'triangle', attack: 0.002 });
        noiseHit(D, tk, { dur: 0.052, peak: 0.34, type: 'bandpass', freq: 1450, toFreq: 520, q: 1.1 });
      }
      break;

    case 'mg':
      // 重機槍／機砲五連發速射：厚實連發節奏
      for (let k = 0; k < 5; k++) {
        const tk = t + k * 0.048;
        tone(D, tk, { freq: 230, to: 65, dur: 0.035, peak: 0.26, type: 'triangle', attack: 0.002 });
        noiseHit(D, tk, { dur: 0.038, peak: 0.28, type: 'bandpass', freq: 1200, toFreq: 450, q: 1.2 });
      }
      break;

    case 'cannon':
      // 戰車砲／火砲／艦砲轟擊：深沉膛壓低頻 + 砲口衝擊波 + 尾韻
      tone(D, t, { freq: 135, to: 28, dur: 0.32, peak: 0.58, type: 'sine', attack: 0.003 });
      noiseHit(D, t, { dur: 0.26, peak: 0.60, type: 'lowpass', freq: 1500, toFreq: 160, q: 0.9, attack: 0.003 });
      noiseHit(D, t + 0.03, { dur: 0.38, peak: 0.36, type: 'lowpass', freq: 340, toFreq: 75, q: 0.7, attack: 0.015 });
      break;

    case 'missile':
      // 飛彈／多管火箭發射：點火瞬響 + 推進尾焰呼嘯
      tone(D, t, { freq: 210, to: 72, dur: 0.06, peak: 0.26, type: 'sine', attack: 0.003 });
      noiseHit(D, t + 0.015, { dur: 0.44, peak: 0.36, type: 'bandpass', freq: 440, toFreq: 1300, q: 1.3, attack: 0.045 });
      tone(D, t + 0.03, { freq: 520, to: 880, dur: 0.28, peak: 0.05, type: 'sine', attack: 0.04 });
      break;

    case 'jet':
      // 戰機／直升機掠過：溫潤空氣動力呼嘯與渦輪共鳴（無刺耳白噪音）
      noiseHit(D, t, { dur: 0.42, peak: 0.22, type: 'bandpass', freq: 320, toFreq: 660, q: 1.4, attack: 0.10 });
      tone(D, t, { freq: 115, to: 155, dur: 0.38, peak: 0.09, type: 'triangle', attack: 0.09, cutoff: 380 });
      break;

    case 'explode':
      if (opt.big) {
        // 部隊擊破大爆炸：雙段式深沉爆破與殘骸震波
        tone(D, t, { freq: 96, to: 22, dur: 0.52, peak: 0.68, type: 'sine', attack: 0.003 });
        noiseHit(D, t, { dur: 0.58, peak: 0.65, type: 'lowpass', freq: 1150, toFreq: 85, q: 0.85, attack: 0.004 });
        tone(D, t + 0.13, { freq: 74, to: 20, dur: 0.46, peak: 0.45, type: 'triangle', attack: 0.005, cutoff: 220 });
        noiseHit(D, t + 0.13, { dur: 0.60, peak: 0.48, type: 'lowpass', freq: 580, toFreq: 60, q: 0.75, attack: 0.01 });
      } else {
        // 一般命中爆炸：紮實彈著爆音
        tone(D, t, { freq: 112, to: 30, dur: 0.28, peak: 0.50, type: 'sine', attack: 0.003 });
        noiseHit(D, t, { dur: 0.34, peak: 0.50, type: 'lowpass', freq: 920, toFreq: 115, q: 0.8, attack: 0.004 });
      }
      break;

    case 'engine':
      // 裝甲車輛／履帶推進：三段低沉柴油引擎與履帶節奏
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.085;
        tone(D, tk, { freq: 56 + k * 5, to: 48 + k * 4, dur: 0.09, peak: 0.18, type: 'triangle', attack: 0.008, cutoff: 240 });
        noiseHit(D, tk, { dur: 0.08, peak: 0.14, type: 'lowpass', freq: 260, q: 0.8, attack: 0.008 });
      }
      break;

    case 'foot':
      // 步兵行軍：三聲沉穩行軍靴踏步聲
      for (let k = 0; k < 3; k++) {
        const tk = t + k * 0.105;
        tone(D, tk, { freq: 95, to: 44, dur: 0.04, peak: 0.16, type: 'sine', attack: 0.003 });
        noiseHit(D, tk, { dur: 0.045, peak: 0.20, type: 'lowpass', freq: 340, toFreq: 140, q: 0.7, attack: 0.003 });
      }
      break;

    case 'wave':
      // 艦艇破浪／兩棲推進：溫和艦首破水聲
      noiseHit(D, t, { dur: 0.42, peak: 0.22, type: 'lowpass', freq: 440, toFreq: 170, q: 0.9, attack: 0.07 });
      noiseHit(D, t + 0.08, { dur: 0.28, peak: 0.12, type: 'bandpass', freq: 620, toFreq: 240, q: 1.1, attack: 0.05 });
      break;

    case 'capture':
      // 佔領據點／部隊晉升：清脆溫暖的四音戰術號角
      [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
        const tk = t + k * 0.085;
        const d = k === 3 ? 0.26 : 0.15;
        tone(D, tk, { freq: f, dur: d, peak: 0.18, type: 'triangle', attack: 0.005, cutoff: 2400 });
        tone(D, tk, { freq: f * 0.5, dur: d, peak: 0.08, type: 'sine', attack: 0.005 });
      });
      break;

    case 'build':
      // 生產部隊／裝載／鋪設鐵路：雙音機械定位確認音
      noiseHit(D, t, { dur: 0.025, peak: 0.14, type: 'bandpass', freq: 1100, toFreq: 380, q: 1.2 });
      tone(D, t, { freq: 392.0, dur: 0.10, peak: 0.18, type: 'triangle', attack: 0.004, cutoff: 1800 });
      tone(D, t + 0.085, { freq: 587.33, dur: 0.15, peak: 0.20, type: 'triangle', attack: 0.004, cutoff: 2000 });
      break;

    case 'turn':
      // 回合開始：簡潔沉穩的戰情提示雙音（取代舊版刺耳鋸齒波喇叭）
      tone(D, t, { freq: 440.0, dur: 0.14, peak: 0.15, type: 'triangle', attack: 0.006, cutoff: 1800 });
      tone(D, t + 0.10, { freq: 659.25, dur: 0.22, peak: 0.17, type: 'triangle', attack: 0.006, cutoff: 2000 });
      tone(D, t + 0.10, { freq: 329.63, dur: 0.22, peak: 0.08, type: 'sine', attack: 0.006 });
      break;

    case 'win':
      // 作戰勝利：輝煌五音和弦號角
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
        const tk = t + k * 0.11;
        const d = k === 4 ? 0.45 : 0.18;
        tone(D, tk, { freq: f, dur: d, peak: 0.18, type: 'triangle', attack: 0.006, cutoff: 2400 });
        tone(D, tk, { freq: f * 0.5, dur: d, peak: 0.10, type: 'sine', attack: 0.006 });
      });
      break;

    case 'lose':
      // 作戰失敗：低沉莊重的小調終止式
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

// 向下相容空函式（已移除背景音樂，確保任何呼叫端或無頭測試不報錯）
function playContextBGM() {}
function setMusicTense() {}
function startMusic() {}
function stopMusic() {}

// 首次使用者互動時解鎖並初始化 Web Audio（相容 iOS Safari 與桌面瀏覽器）
if (typeof window !== 'undefined') {
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    window.addEventListener(ev, audioInit, { once: false, passive: true })
  );
}
