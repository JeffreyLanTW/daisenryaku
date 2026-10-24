'use strict';
// ===== 音效與背景音樂（Web Audio 即時合成，不需外部檔案） =====

const AUDIO = { ctx: null, master: null, music: null, sfx: null, noise: null, on: { music: true, sfx: true, track: 0 }, bus: null, timer: null, step: 0, next: 0, tense: false };
try {
  const a = JSON.parse(localStorage.getItem('daisenryaku_audio'));
  if (a) AUDIO.on = Object.assign(AUDIO.on, a);
} catch (e) { /* 忽略 */ }

function audioInit() {
  if (AUDIO.ctx) { if (AUDIO.ctx.state === 'suspended') AUDIO.ctx.resume(); return; }
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
  startMusic();
}
function saveAudio() { try { localStorage.setItem('daisenryaku_audio', JSON.stringify(AUDIO.on)); } catch (e) { /* 忽略 */ } }
function setAudio(kind, on) {
  AUDIO.on[kind] = on;
  saveAudio();
  if (!AUDIO.ctx) return;
  const g = kind === 'music' ? AUDIO.music : AUDIO.sfx;
  g.gain.setTargetAtTime(on ? (kind === 'music' ? 0.16 : 0.55) : 0, AUDIO.ctx.currentTime, 0.1);
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
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(dest, t, { freq = 440, dur = 0.2, peak = 0.3, type = 'sine', to = 0, attack = 0.005, vib = 0, cutoff = 0 } = {}) {
  const c = AUDIO.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  if (vib) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = 5.5; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
  }
  let last = o;
  if (cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); last = f; }
  env(g, t, attack, peak, dur);
  last.connect(g); g.connect(dest);
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
// 依兵種選擇開火音效
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

// ----- 背景音樂：軍鼓進行曲 -----
// 16 分音符步進；和弦進行 Am–F–C–G，敵方回合加入緊張鼓點
const MUSIC = {
  bpm: 96,
  chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [52, 56, 59], [52, 56, 59]],
  melody: [69, -1, 72, 71, 69, -1, 64, -1, 65, -1, 69, -1, 67, -1, 64, -1, 64, -1, 67, 69, 72, -1, 71, 69, 67, -1, 71, -1, 74, -1, -1, -1,
    69, -1, 72, 71, 69, -1, 76, -1, 77, -1, 76, 74, 72, -1, 69, -1, 71, -1, 72, 71, 69, -1, 68, -1, 69, -1, -1, -1, -1, -1, -1, -1],
};
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
// ----- 曲目：2 號「深海潛航・紅色十月」（D 小調，莊嚴合唱銅管＋定音鼓＋聲納） -----
// 8 小節：Dm–Bb–Gm–A–Dm–Bb–Cm–A，每小節 16 步（慢速 60 BPM）
const RED = {
  bpm: 60,
  chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52], [50, 53, 57], [46, 50, 53], [48, 51, 55], [45, 49, 52]],
  // 旋律：[小節內起始步, MIDI, 長度步數]
  melody: [[[0, 69, 8], [8, 74, 8]], [[0, 72, 6], [8, 70, 4], [12, 69, 4]], [[0, 70, 8], [8, 74, 8]], [[0, 73, 6], [8, 74, 4], [12, 76, 4]],
    [[0, 77, 8], [8, 76, 4], [12, 74, 4]], [[0, 74, 8], [8, 72, 8]], [[0, 75, 8], [8, 74, 8]], [[0, 73, 8], [8, 69, 8]]],
};
const TRACKS = [
  { name: '軍鼓進行曲', bpm: 96, step: marchStep },
  { name: '深海潛航・紅色十月', bpm: RED.bpm, step: redStep },
];
function marchStep(s, t, sp, M) {
  const bar = Math.floor(s / 16) % MUSIC.chords.length, pos = s % 16;
  // 小鼓：進行曲節奏
  const snare = [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1];
  if (snare[pos]) noiseHit(M, t, { dur: 0.12, peak: 0.35, type: 'highpass', freq: 1800 });
  if (AUDIO.tense && pos % 2 === 1) noiseHit(M, t, { dur: 0.05, peak: 0.15, type: 'highpass', freq: 2500 });
  // 大鼓
  if (pos === 0 || pos === 8 || (AUDIO.tense && (pos === 6 || pos === 14))) tone(M, t, { freq: 90, to: 40, dur: 0.25, peak: 0.6 });
  // 低音
  if (pos % 4 === 0) tone(M, t, { freq: midi(MUSIC.chords[bar][0] - 12), dur: sp * 3, peak: 0.28, type: 'triangle' });
  // 銅管和弦
  if (pos === 0) for (const n of MUSIC.chords[bar]) tone(M, t, { freq: midi(n), dur: sp * 15, peak: 0.07, type: 'sawtooth', attack: 0.15, cutoff: 1100 });
  // 旋律（敵方回合休息）
  const mel = MUSIC.melody[s % MUSIC.melody.length];
  if (!AUDIO.tense && mel > 0) tone(M, t, { freq: midi(mel), dur: sp * 1.8, peak: 0.12, type: 'square', vib: 4, cutoff: 2200 });
}
function redStep(s, t, sp, M) {
  const bar = Math.floor(s / 16) % RED.chords.length, pos = s % 16, ch = RED.chords[bar], barDur = sp * 16;
  if (pos === 0) {
    // 次低頻持續音（D1 / D2）：深海潛艇的低鳴
    tone(M, t, { freq: midi(26), dur: barDur * 1.1, peak: 0.34, attack: 0.6 });
    tone(M, t, { freq: midi(38), dur: barDur * 1.1, peak: 0.12, type: 'triangle', attack: 0.6, cutoff: 300 });
    // 合唱／銅管式墊音：低通濾波鋸齒波，每音兩個微失諧聲部
    for (const n of ch) for (const dt of [-0.004, 0.004]) {
      tone(M, t, { freq: midi(n + 12) * (1 + dt), dur: barDur * 1.05, peak: 0.045, type: 'sawtooth', attack: 1.0, cutoff: 650, vib: 1.5 });
    }
    tone(M, t, { freq: midi(ch[0] + 24), dur: barDur, peak: 0.025, type: 'sine', attack: 1.4, vib: 2 });
  }
  // 莊嚴的定音鼓：第 1、3 拍，敵方回合加入第 4 拍前的追趕
  const timp = (v) => {
    tone(M, t, { freq: 118, to: 62, dur: 0.7, peak: 0.55 * v });
    noiseHit(M, t, { dur: 0.25, peak: 0.18 * v, freq: 320, attack: 0.002 });
  };
  if (pos === 0) timp(1); else if (pos === 8) timp(0.6);
  else if (AUDIO.tense && (pos === 12 || pos === 14)) timp(0.35);
  // 旋律：銅管式（敵方回合休息）
  if (!AUDIO.tense) for (const [p, n, l] of RED.melody[bar]) {
    if (p === pos) tone(M, t, { freq: midi(n), dur: sp * l, peak: 0.075, type: 'sawtooth', attack: 0.3, cutoff: 900, vib: 3 });
  }
  // 聲納：每兩小節一次，緊張時每小節；附兩次漸弱回音
  if (pos === 6 && (bar % 2 === 1 || AUDIO.tense)) {
    const f = bar % 4 === 1 ? 1760 : 1568;
    tone(M, t, { freq: f, dur: 1.4, peak: 0.1, attack: 0.004 });
    tone(M, t + 0.55, { freq: f, dur: 1.2, peak: 0.04, attack: 0.004 });
    tone(M, t + 1.1, { freq: f, dur: 1, peak: 0.018, attack: 0.004 });
  }
}
function newBus() {
  const b = AUDIO.ctx.createGain();
  b.connect(AUDIO.music);
  return b;
}
function startMusic() {
  if (AUDIO.timer) return;
  AUDIO.bus = newBus();
  AUDIO.next = AUDIO.ctx.currentTime + 0.1;
  AUDIO.timer = setInterval(scheduleMusic, 60);
}
// 切換曲目：舊曲的獨立匯流排快速淡出並斷開，確保已排程的振盪器不再發聲
function setTrack(i) {
  AUDIO.on.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
  saveAudio();
  if (!AUDIO.ctx) return;
  const c = AUDIO.ctx, old = AUDIO.bus;
  if (old) {
    old.gain.cancelScheduledValues(c.currentTime);
    old.gain.setTargetAtTime(0, c.currentTime, 0.08);
    setTimeout(() => { try { old.disconnect(); } catch (e) { /* 忽略 */ } }, 800);
  }
  AUDIO.bus = newBus();
  AUDIO.step = 0;
  AUDIO.next = c.currentTime + 0.15;
}
function cycleTrack() { setTrack(AUDIO.on.track + 1); return TRACKS[AUDIO.on.track].name; }
function scheduleMusic() {
  const c = AUDIO.ctx;
  if (!c || !AUDIO.on.music) { if (c) AUDIO.next = c.currentTime + 0.1; return; }
  const tr = TRACKS[AUDIO.on.track] || TRACKS[0], sp = 60 / tr.bpm / 4;
  while (AUDIO.next < c.currentTime + 0.25) {
    tr.step(AUDIO.step, AUDIO.next, sp, AUDIO.bus);
    AUDIO.step++;
    AUDIO.next += sp;
  }
}
function setMusicTense(on) { AUDIO.tense = on; }

// 第一次互動時啟動音訊（瀏覽器自動播放限制）
['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, audioInit, { once: false, passive: true }));
