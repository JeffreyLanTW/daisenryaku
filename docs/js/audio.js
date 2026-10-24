'use strict';
// ===== 音效與背景音樂（Web Audio 即時合成，不需外部檔案） =====

const AUDIO = {
  ctx: null, master: null, music: null, sfx: null, noise: null,
  on: { music: true, sfx: true, track: 0 },
  bus: null, timer: null, gen: 0, nodes: [], step: 0, next: 0, tense: false, manual: false,
};
try {
  const a = JSON.parse(localStorage.getItem('daisenryaku_audio'));
  if (a) AUDIO.on = Object.assign(AUDIO.on, a);
} catch (e) { /* 忽略 */ }

function audioInit() {
  if (AUDIO.ctx) {
    if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume();
    if (AUDIO.on.music && !AUDIO.timer) startMusic();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = AUDIO.ctx = new AC();
  AUDIO.master = c.createGain(); AUDIO.master.gain.value = 0.9; AUDIO.master.connect(c.destination);
  const comp = c.createDynamicsCompressor(); comp.connect(AUDIO.master);
  AUDIO.music = c.createGain(); AUDIO.music.gain.value = AUDIO.on.music ? 0.16 : 0; AUDIO.music.connect(comp);
  AUDIO.sfx = c.createGain(); AUDIO.sfx.gain.value = AUDIO.on.sfx ? 0.55 : 0; AUDIO.sfx.connect(comp);
  const len = c.sampleRate * 1.5, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  AUDIO.noise = buf;
  if (AUDIO.on.music) startMusic();
}
function saveAudio() { try { localStorage.setItem('daisenryaku_audio', JSON.stringify(AUDIO.on)); } catch (e) { /* 忽略 */ } }
function setAudio(kind, on) {
  AUDIO.on[kind] = on;
  saveAudio();
  if (!AUDIO.ctx) return;
  const c = AUDIO.ctx;
  if (kind === 'music') {
    AUDIO.music.gain.cancelScheduledValues(c.currentTime);
    if (on) {
      AUDIO.music.gain.setValueAtTime(0.16, c.currentTime);
      startMusic();
    } else {
      AUDIO.music.gain.setValueAtTime(0, c.currentTime);
      stopMusic();
    }
  } else {
    AUDIO.sfx.gain.cancelScheduledValues(c.currentTime);
    AUDIO.sfx.gain.setTargetAtTime(on ? 0.55 : 0, c.currentTime, 0.05);
  }
}

// 追蹤背景音樂振盪器，確保切換曲目或停止時立即中斷不重疊
function trackNode(dest, node) {
  if (dest !== AUDIO.bus) return;
  AUDIO.nodes.push(node);
  node.onended = () => {
    const i = AUDIO.nodes.indexOf(node);
    if (i >= 0) AUDIO.nodes.splice(i, 1);
  };
}

// ----- 合成積木 -----
function env(g, t, a, peak, dcy, end = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(end, t + a + dcy);
}
function noiseHit(dest, t, { dur = 0.3, peak = 0.8, type = 'lowpass', freq = 1200, q = 0.7, sweep = 0, attack = 0.004 } = {}) {
  const c = AUDIO.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = AUDIO.noise;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  env(g, t, attack, peak, dur);
  src.connect(f); f.connect(g); g.connect(dest);
  trackNode(dest, src);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(dest, t, { freq = 440, dur = 0.2, peak = 0.3, type = 'sine', to = 0, attack = 0.005, vib = 0, cutoff = 0 } = {}) {
  const c = AUDIO.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = 5.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency);
    trackNode(dest, l);
    l.start(t); l.stop(t + dur + 0.05);
  }
  let last = o;
  if (cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); last = f; }
  env(g, t, attack, peak, dur);
  last.connect(g); g.connect(dest);
  trackNode(dest, o);
  o.start(t); o.stop(t + attack + dur + 0.05);
}

// ----- 音效 -----
function sfx(name, opt = {}) {
  if (!AUDIO.ctx || !AUDIO.on.sfx) return;
  const c = AUDIO.ctx, t = c.currentTime + 0.01, D = AUDIO.sfx;
  switch (name) {
    case 'click': tone(D, t, { freq: 900, dur: 0.05, peak: 0.12, type: 'square', cutoff: 2500 }); break;
    case 'gun':
      for (let k = 0; k < 4; k++) noiseHit(D, t + k * 0.07, { dur: 0.06, peak: 0.5, type: 'bandpass', freq: 2200, q: 1.2 });
      break;
    case 'mg':
      for (let k = 0; k < 8; k++) noiseHit(D, t + k * 0.045, { dur: 0.04, peak: 0.4, type: 'bandpass', freq: 1700, q: 1.5 });
      break;
    case 'cannon':
      noiseHit(D, t, { dur: 0.5, peak: 1, freq: 900, sweep: 0.15 });
      tone(D, t, { freq: 110, to: 40, dur: 0.35, peak: 0.6, type: 'sine' });
      break;
    case 'missile':
      noiseHit(D, t, { dur: 0.7, peak: 0.5, type: 'bandpass', freq: 600, q: 0.8, sweep: 4, attack: 0.05 });
      break;
    case 'jet':
      noiseHit(D, t, { dur: 1.1, peak: 0.35, type: 'bandpass', freq: 3000, q: 0.6, sweep: 0.25, attack: 0.25 });
      break;
    case 'explode':
      noiseHit(D, t, { dur: opt.big ? 1.3 : 0.8, peak: 1, freq: opt.big ? 700 : 1100, sweep: 0.08 });
      tone(D, t, { freq: opt.big ? 70 : 90, to: 30, dur: opt.big ? 0.9 : 0.5, peak: 0.8 });
      break;
    case 'engine':
      tone(D, t, { freq: 48, dur: 0.7, peak: 0.25, type: 'sawtooth', to: 62, attack: 0.08, cutoff: 260 });
      noiseHit(D, t, { dur: 0.6, peak: 0.12, freq: 300, attack: 0.08 });
      break;
    case 'foot':
      for (let k = 0; k < 4; k++) noiseHit(D, t + k * 0.13, { dur: 0.05, peak: 0.18, freq: 500 });
      break;
    case 'wave':
      noiseHit(D, t, { dur: 0.9, peak: 0.25, freq: 700, attack: 0.25, sweep: 0.5 });
      break;
    case 'capture':
      [523, 659, 784, 1047].forEach((f, k) => tone(D, t + k * 0.11, { freq: f, dur: 0.22, peak: 0.22, type: 'triangle' }));
      break;
    case 'build':
      tone(D, t, { freq: 330, dur: 0.12, peak: 0.2, type: 'square', cutoff: 1800 });
      tone(D, t + 0.1, { freq: 495, dur: 0.18, peak: 0.2, type: 'square', cutoff: 1800 });
      break;
    case 'turn':
      tone(D, t, { freq: 392, dur: 0.25, peak: 0.25, type: 'sawtooth', cutoff: 1400, vib: 3 });
      tone(D, t + 0.22, { freq: 523, dur: 0.45, peak: 0.25, type: 'sawtooth', cutoff: 1400, vib: 3 });
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, k) => tone(D, t + k * 0.16, { freq: f, dur: 0.3, peak: 0.25, type: 'sawtooth', cutoff: 1600, vib: 4 }));
      break;
    case 'lose':
      [392, 370, 349, 262].forEach((f, k) => tone(D, t + k * 0.3, { freq: f, dur: 0.5, peak: 0.22, type: 'triangle', vib: 3 }));
      break;
  }
}
function sfxFire(base) {
  if (['inf', 'atinf', 'marine'].includes(base)) sfx(base === 'atinf' ? 'missile' : 'gun');
  else if (['rocket', 'sam'].includes(base)) sfx('missile');
  else if (['aa', 'recon', 'heli'].includes(base)) sfx('mg');
  else if (['fighter', 'attacker', 'bomber', 'stealth'].includes(base)) { sfx('jet'); sfx('mg'); }
  else sfx('cannon');
}
function sfxMove(u) {
  const d = UNITS[u.type];
  if (d.cat === 'air') sfx('jet');
  else if (d.cat === 'sea' || d.mt === 'amph') sfx('wave');
  else if (d.mt === 'foot') sfx('foot');
  else sfx('engine');
}

// ===== 背景音樂：9 首 90 年代大戰略風格與經典軍武曲目 =====
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// 通用 90 年代 FM 戰略合成器編曲引擎
function synthStep(cfg, s, t, sp, M) {
  const bar = Math.floor(s / 16) % cfg.chords.length, pos = s % 16, ch = cfg.chords[bar];
  // 小鼓與 Hi-Hat
  if (cfg.snare && cfg.snare[pos]) noiseHit(M, t, { dur: 0.1, peak: cfg.snarePeak || 0.32, type: 'highpass', freq: cfg.snareFreq || 1800 });
  if (cfg.hat && (cfg.hat[pos] || (AUDIO.tense && pos % 2 === 1))) noiseHit(M, t, { dur: 0.04, peak: 0.14, type: 'highpass', freq: 3200 });
  else if (!cfg.hat && AUDIO.tense && pos % 2 === 1) noiseHit(M, t, { dur: 0.045, peak: 0.14, type: 'highpass', freq: 2600 });
  // 大鼓
  if (cfg.kick && (cfg.kick[pos] || (AUDIO.tense && (pos === 6 || pos === 14)))) {
    tone(M, t, { freq: cfg.kickFreq || 95, to: 38, dur: 0.2, peak: 0.58 });
  }
  // 貝斯線
  const bMode = cfg.bass || 'march';
  if (bMode === 'drive') {
    if (pos % 2 === 0) {
      const oct = (pos % 4 === 2) ? 0 : -12;
      tone(M, t, { freq: midi(ch[0] + oct), dur: sp * 1.7, peak: 0.26, type: 'sawtooth', cutoff: 520 });
    }
  } else if (bMode === 'hq') {
    if ([0, 3, 6, 8, 11, 14].includes(pos)) {
      const n = ch[pos % ch.length] - 12;
      tone(M, t, { freq: midi(n), dur: sp * 2.1, peak: 0.28, type: 'triangle' });
    }
  } else if (bMode === 'sync') {
    if ([0, 2, 6, 8, 10, 12, 14].includes(pos)) {
      tone(M, t, { freq: midi(ch[0] - 12), dur: sp * 1.6, peak: 0.28, type: 'square', cutoff: 480 });
    }
  } else if (bMode === 'fleet') {
    if (pos === 0 || pos === 8 || pos === 12) {
      tone(M, t, { freq: midi(ch[0] - 12), dur: sp * (pos === 0 ? 7 : 3.5), peak: 0.32, type: 'triangle', attack: 0.04 });
    }
  } else {
    if (pos % 4 === 0) tone(M, t, { freq: midi(ch[0] - 12), dur: sp * 3, peak: 0.28, type: 'triangle' });
  }
  // 銅管和弦墊音 / 斷奏
  if (cfg.stab) {
    if (cfg.stab[pos]) for (const n of ch) tone(M, t, { freq: midi(n), dur: sp * 2.5, peak: 0.075, type: 'sawtooth', attack: 0.015, cutoff: 1400 });
  } else if (pos === 0) {
    for (const n of ch) tone(M, t, { freq: midi(n), dur: sp * 15, peak: cfg.padPeak || 0.068, type: 'sawtooth', attack: cfg.padAtk || 0.12, cutoff: cfg.padCut || 1150 });
  }
  // 戰術琶音（Arpeggio）
  if (cfg.arp && (pos % cfg.arp === 0)) {
    const an = ch[(pos / cfg.arp) % ch.length] + 12;
    tone(M, t, { freq: midi(an), dur: sp * 1.4, peak: 0.07, type: 'triangle', cutoff: 2000 });
  }
  // 主旋律（敵方回合降八度或交棒給緊張節奏）
  const mel = cfg.melody[s % cfg.melody.length];
  if (mel > 0) {
    const mn = AUDIO.tense ? mel - 12 : mel;
    const pk = AUDIO.tense ? 0.07 : (cfg.leadPeak || 0.12);
    tone(M, t, { freq: midi(mn), dur: sp * (cfg.leadDur || 1.8), peak: pk, type: cfg.leadType || 'square', vib: cfg.leadVib || 4, cutoff: cfg.leadCut || 2200 });
  }
}

// 1. 鋼鐵進行曲 (Armored March)
const TR_ARMOR = {
  bpm: 104,
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]],
  snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
  kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  melody: [
    69, -1, 72, 71, 69, -1, 64, -1, 65, -1, 69, -1, 67, -1, 64, -1,
    64, -1, 67, 69, 72, -1, 71, 69, 67, -1, 71, -1, 74, -1, -1, -1,
    69, -1, 72, 71, 69, -1, 76, -1, 74, -1, 72, 71, 69, -1, 65, -1,
    68, -1, 71, 69, 68, -1, 64, -1, 69, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 2. 裝甲突擊 (Blitzkrieg)
const TR_BLITZ = {
  bpm: 134,
  bass: 'drive',
  arp: 2,
  leadType: 'sawtooth', leadCut: 2500, leadPeak: 0.13,
  chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [52, 55, 59], [52, 55, 59], [57, 60, 64], [54, 59, 63], [52, 55, 59]],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  melody: [
    64, 64, 67, -1, 71, -1, 69, 67, 64, -1, 67, 71, 72, -1, 71, 67,
    66, 66, 69, -1, 74, -1, 72, 69, 71, -1, -1, -1, 67, -1, 66, -1,
    64, 67, 71, -1, 76, -1, 74, 71, 72, -1, 76, 74, 72, -1, 69, -1,
    71, -1, 69, 67, 66, -1, 69, -1, 64, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 3. 蒼穹制空權 (Air Superiority)
const TR_AIR = {
  bpm: 140,
  bass: 'drive',
  arp: 1,
  leadType: 'square', leadCut: 2600, leadDur: 2.2,
  chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [53, 57, 60], [55, 58, 62], [50, 53, 57], [45, 49, 52], [50, 53, 57]],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0],
  kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  melody: [
    74, -1, -1, 69, 74, -1, 76, 77, 74, -1, 72, -1, 70, -1, 74, -1,
    72, -1, -1, 67, 72, -1, 74, 76, 77, -1, 76, -1, 72, -1, -1, -1,
    70, -1, 74, -1, 77, -1, 79, 77, 74, -1, 76, 74, 72, -1, 69, -1,
    69, -1, 73, -1, 76, -1, 73, 69, 74, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 4. 大洋艦隊 (Grand Fleet)
const TR_FLEET = {
  bpm: 88,
  bass: 'fleet',
  padPeak: 0.08, padAtk: 0.25, padCut: 1000,
  leadType: 'sawtooth', leadCut: 1500, leadDur: 2.6,
  chords: [[48, 51, 55], [44, 48, 51], [46, 50, 53], [51, 55, 58], [53, 56, 60], [48, 51, 55], [43, 47, 50], [48, 51, 55]],
  snare: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 1],
  kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  melody: [
    67, -1, -1, 67, 72, -1, 70, 68, 67, -1, 63, -1, 68, -1, 67, -1,
    65, -1, -1, 65, 70, -1, 68, 65, 67, -1, -1, -1, 70, -1, -1, -1,
    68, -1, 72, -1, 75, -1, 74, 72, 70, -1, 67, -1, 72, -1, 68, -1,
    67, -1, 65, -1, 62, -1, 67, -1, 60, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 5. 前線司令部 (Command HQ)
const TR_HQ = {
  bpm: 100,
  bass: 'hq',
  arp: 2,
  stab: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
  leadType: 'triangle', leadCut: 1800, leadPeak: 0.14,
  chords: [[55, 58, 62], [51, 55, 58], [53, 57, 60], [55, 58, 62], [48, 51, 55], [55, 58, 62], [50, 54, 57], [55, 58, 62]],
  snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  kick: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  hat: [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0],
  melody: [
    67, -1, 70, -1, -1, 69, 67, -1, 63, -1, 67, -1, 65, -1, -1, -1,
    65, -1, 69, -1, -1, 70, 72, -1, 67, -1, 70, -1, -1, -1, -1, -1,
    63, -1, 67, -1, 72, -1, 70, -1, 67, -1, 62, -1, 67, -1, -1, -1,
    66, -1, 69, 72, 70, -1, 66, -1, 67, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 6. 焦土防線 (Desperate Defense)
const TR_DEFENSE = {
  bpm: 124,
  bass: 'sync',
  stab: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0],
  leadType: 'sawtooth', leadCut: 2100,
  chords: [[50, 53, 57], [55, 58, 62], [46, 50, 53], [45, 49, 52], [50, 53, 57], [52, 55, 58], [45, 49, 52], [50, 53, 57]],
  snare: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1],
  kick: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0],
  melody: [
    69, 70, 69, -1, 65, -1, 62, -1, 67, 69, 70, -1, 67, -1, 64, -1,
    65, 67, 70, -1, 74, -1, 70, -1, 69, -1, 67, 65, 64, -1, -1, -1,
    74, 76, 77, -1, 74, -1, 69, -1, 70, 72, 74, -1, 67, -1, -1, -1,
    69, -1, 67, 65, 64, -1, 69, -1, 62, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 7. 決戰黎明 (Final Offensive)
const TR_FINAL = {
  bpm: 132,
  bass: 'drive',
  arp: 1,
  leadType: 'sawtooth', leadCut: 2700, leadPeak: 0.135, leadDur: 2.0,
  chords: [[53, 56, 60], [49, 53, 56], [51, 55, 58], [48, 51, 55], [49, 53, 56], [46, 49, 53], [48, 52, 55], [53, 56, 60]],
  snare: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1],
  kick: [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
  hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  melody: [
    65, -1, 68, 70, 72, -1, 75, -1, 73, -1, 72, 70, 68, -1, 65, -1,
    67, -1, 70, 72, 75, -1, 73, 72, 70, -1, 67, -1, 72, -1, -1, -1,
    73, -1, 77, -1, 75, 73, 72, -1, 70, -1, 73, -1, 72, 70, 68, -1,
    67, -1, 72, -1, 76, -1, 79, -1, 77, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 8. 凱旋榮光 (Victory Fanfare)
const TR_VICTORY = {
  bpm: 116,
  arp: 2,
  leadType: 'square', leadCut: 2400, leadDur: 2.2,
  chords: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [50, 53, 57], [55, 59, 62], [48, 52, 55]],
  snare: [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1],
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  melody: [
    67, -1, 72, -1, 76, -1, 79, 76, 74, -1, 71, -1, 74, -1, 67, -1,
    69, -1, 72, -1, 76, -1, 72, -1, 69, -1, 72, 74, 76, -1, -1, -1,
    76, -1, 79, -1, 84, -1, 79, 76, 74, -1, 77, -1, 76, 74, 72, -1,
    71, -1, 74, -1, 79, -1, 74, 71, 72, -1, -1, -1, -1, -1, -1, -1,
  ],
};

// 9. 深海潛航・紅色十月 (Red October)
const RED = {
  bpm: 60,
  chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52], [50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 49, 52]],
  melody: [[[0, 69, 8], [8, 74, 8]], [[0, 72, 6], [8, 70, 4], [12, 69, 4]], [[0, 70, 8], [8, 74, 8]], [[0, 73, 6], [8, 74, 4], [12, 76, 4]],
    [[0, 77, 8], [8, 76, 4], [12, 74, 4]], [[0, 74, 8], [8, 72, 8]], [[0, 75, 8], [8, 74, 8]], [[0, 73, 8], [8, 69, 8]]],
};
function redStep(s, t, sp, M) {
  const bar = Math.floor(s / 16) % RED.chords.length, pos = s % 16, ch = RED.chords[bar], barDur = sp * 16;
  if (pos === 0) {
    tone(M, t, { freq: midi(26), dur: barDur * 1.05, peak: 0.34, attack: 0.5 });
    tone(M, t, { freq: midi(38), dur: barDur * 1.05, peak: 0.12, type: 'triangle', attack: 0.5, cutoff: 300 });
    for (const n of ch) for (const dt of [-0.004, 0.004]) {
      tone(M, t, { freq: midi(n + 12) * (1 + dt), dur: barDur, peak: 0.045, type: 'sawtooth', attack: 0.8, cutoff: 650, vib: 1.5 });
    }
    tone(M, t, { freq: midi(ch[0] + 24), dur: barDur, peak: 0.025, type: 'sine', attack: 1.1, vib: 2 });
  }
  const timp = v => {
    tone(M, t, { freq: 118, to: 62, dur: 0.7, peak: 0.55 * v });
    noiseHit(M, t, { dur: 0.25, peak: 0.18 * v, freq: 320, attack: 0.002 });
  };
  if (pos === 0) timp(1); else if (pos === 8) timp(0.6);
  else if (AUDIO.tense && (pos === 12 || pos === 14)) timp(0.35);
  if (!AUDIO.tense) for (const [p, n, l] of RED.melody[bar]) {
    if (p === pos) tone(M, t, { freq: midi(n), dur: sp * l, peak: 0.075, type: 'sawtooth', attack: 0.25, cutoff: 900, vib: 3 });
  }
  if (pos === 6 && (bar % 2 === 1 || AUDIO.tense)) {
    const f = bar % 4 === 1 ? 1760 : 1568;
    tone(M, t, { freq: f, dur: 1.2, peak: 0.1, attack: 0.004 });
    tone(M, t + 0.5, { freq: f, dur: 1.0, peak: 0.04, attack: 0.004 });
    tone(M, t + 1.0, { freq: f, dur: 0.8, peak: 0.018, attack: 0.004 });
  }
}

const TRACKS = [
  { name: '鋼鐵進行曲', desc: '經典軍武銅管進行曲', bpm: TR_ARMOR.bpm, step: (s, t, sp, M) => synthStep(TR_ARMOR, s, t, sp, M) },
  { name: '裝甲突擊', desc: '高速合成貝斯與閃電推進', bpm: TR_BLITZ.bpm, step: (s, t, sp, M) => synthStep(TR_BLITZ, s, t, sp, M) },
  { name: '蒼穹制空權', desc: '高昂主旋律與高速戰術琶音', bpm: TR_AIR.bpm, step: (s, t, sp, M) => synthStep(TR_AIR, s, t, sp, M) },
  { name: '大洋艦隊', desc: '壯闊海戰銅管與波濤鼓點', bpm: TR_FLEET.bpm, step: (s, t, sp, M) => synthStep(TR_FLEET, s, t, sp, M) },
  { name: '前線司令部', desc: '冷靜沉著的戰情簡報節奏', bpm: TR_HQ.bpm, step: (s, t, sp, M) => synthStep(TR_HQ, s, t, sp, M) },
  { name: '焦土防線', desc: '緊湊小調切分音與防禦戰', bpm: TR_DEFENSE.bpm, step: (s, t, sp, M) => synthStep(TR_DEFENSE, s, t, sp, M) },
  { name: '決戰黎明', desc: '密集打擊樂與總攻高潮', bpm: TR_FINAL.bpm, step: (s, t, sp, M) => synthStep(TR_FINAL, s, t, sp, M) },
  { name: '凱旋榮光', desc: '輝煌大調勝利軍樂號角', bpm: TR_VICTORY.bpm, step: (s, t, sp, M) => synthStep(TR_VICTORY, s, t, sp, M) },
  { name: '深海潛航・紅色十月', desc: '冷戰潛艦低鳴、合唱與聲納', bpm: RED.bpm, step: redStep },
];
if (!(AUDIO.on.track >= 0 && AUDIO.on.track < TRACKS.length)) AUDIO.on.track = 0;

// 單例播放鎖定：遞增世代編號、清除排程器、立即中斷並斷開所有舊音訊節點
function stopMusic() {
  AUDIO.gen++;
  if (AUDIO.timer) { clearInterval(AUDIO.timer); AUDIO.timer = null; }
  const nodes = AUDIO.nodes.splice(0, AUDIO.nodes.length);
  for (const n of nodes) {
    try { n.onended = null; n.stop(0); } catch (e) { /* 忽略 */ }
    try { n.disconnect(); } catch (e) { /* 忽略 */ }
  }
  if (AUDIO.bus) {
    try {
      AUDIO.bus.gain.cancelScheduledValues(0);
      AUDIO.bus.gain.value = 0;
      AUDIO.bus.disconnect();
    } catch (e) { /* 忽略 */ }
    AUDIO.bus = null;
  }
}
function startMusic() {
  stopMusic();
  if (!AUDIO.ctx || !AUDIO.on.music) return;
  const gen = AUDIO.gen;
  const b = AUDIO.ctx.createGain();
  b.gain.value = 1;
  b.connect(AUDIO.music);
  AUDIO.bus = b;
  AUDIO.step = 0;
  AUDIO.next = AUDIO.ctx.currentTime + 0.06;
  scheduleMusic(gen);
  AUDIO.timer = setInterval(() => scheduleMusic(gen), 60);
}
function setTrack(i, manual = true) {
  if (manual) AUDIO.manual = true;
  AUDIO.on.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  saveAudio();
  if (!AUDIO.ctx) audioInit();
  if (AUDIO.ctx && AUDIO.on.music) startMusic();
}
function cycleTrack() { setTrack(AUDIO.on.track + 1, true); return TRACKS[AUDIO.on.track].name; }

// 戰役關卡與情境自動配樂對應表（涵蓋全部 9 首曲目）
// 0:鋼鐵進行曲 1:裝甲突擊 2:蒼穹制空權 3:大洋艦隊 4:前線司令部 5:焦土防線 6:決戰黎明 7:凱旋榮光 8:深海潛航・紅色十月
const MISSION_TRACK = {
  t1: 0, t2: 2, t3: 5, c2: 3, c3: 5, c4: 1, c5: 6,
  f1: 0, f2: 8, f3: 2, f4: 5, f5: 1, f6: 5, f7: 3, f8: 6,
};
function scenarioTrack(g) {
  if (!g) return 0;
  if (g.missionId && MISSION_TRACK[g.missionId] !== undefined) return MISSION_TRACK[g.missionId];
  const seaCnt = Array.isArray(g.terrain) ? g.terrain.filter(t => t === 'sea').length : 0;
  const seaRatio = g.terrain && g.terrain.length ? seaCnt / g.terrain.length : 0;
  const seed = Math.abs(g.seed || 0);
  if (seaRatio >= 0.35) return seed % 2 === 0 ? 3 : 8;
  const landTracks = [0, 1, 2, 5, 6];
  return landTracks[seed % landTracks.length];
}
function playContextBGM(phase, force = false) {
  if (force) AUDIO.manual = false;
  if (AUDIO.manual && phase !== 'victory') return;
  const g = typeof G !== 'undefined' ? G : null;
  let idx = 0;
  if (phase === 'deploy') idx = 4;
  else if (phase === 'victory') idx = 7;
  else idx = scenarioTrack(g);
  if (AUDIO.on.track !== idx || !AUDIO.timer) setTrack(idx, false);
}
function scheduleMusic(gen = AUDIO.gen) {
  if (gen !== AUDIO.gen) return;
  const c = AUDIO.ctx;
  if (!c || !AUDIO.on.music || !AUDIO.bus) return;
  const tr = TRACKS[AUDIO.on.track] || TRACKS[0], sp = 60 / tr.bpm / 4;
  while (AUDIO.next < c.currentTime + 0.25) {
    if (gen !== AUDIO.gen || !AUDIO.bus) return;
    tr.step(AUDIO.step, AUDIO.next, sp, AUDIO.bus);
    AUDIO.step++;
    AUDIO.next += sp;
  }
}
function setMusicTense(on) { AUDIO.tense = on; }

// 第一次互動時啟動音訊（瀏覽器自動播放限制）
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, audioInit, { once: false, passive: true }));
