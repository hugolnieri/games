const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Todos os sons são sintetizados em tempo real: nenhum arquivo de áudio externo. */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.8;
    this.musicOn = true;
    this.last = {};
    this.bpm = 124;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = this.sfxVolume;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = this.musicOn ? 0.26 : 0;
      this.musicFilter = c.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.music.connect(this.musicFilter);
      this.musicFilter.connect(this.master);
      const len = c.sampleRate;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.musicOn) this.startMusic();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfx) this.sfx.gain.value = v;
  }
  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(on ? 0.26 : 0, this.ctx.currentTime, 0.1);
    if (on) this.startMusic();
  }
  /** Abafa a música (pausa/menus). */
  duck(on) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, this.ctx.currentTime, 0.08);
  }

  // ---------- primitivas ----------
  _tone({ f = 440, f2 = null, dur = 0.1, type = 'square', vol = 0.1, delay = 0, attack = 0.004, at = null, dest = null }) {
    const c = this.ctx;
    const t0 = at ?? c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  _noise({ dur = 0.2, vol = 0.1, type = 'bandpass', f = 1000, f2 = null, q = 1, delay = 0, at = null, dest = null }) {
    const c = this.ctx;
    const t0 = at ?? c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest || this.sfx);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.03);
  }

  // ---------- efeitos ----------
  play(name, o = {}) {
    if (!this.ready) return;
    const now = performance.now();
    const gap = { bounce: 45, wall: 55, bumper: 70, pod: 50, post: 60 }[name];
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const sp = Math.min(1, (o.speed || 10) / 22);
    switch (name) {
      case 'bounce':
        this._tone({ f: 380 + sp * 420, dur: 0.05, type: 'square', vol: 0.035 });
        break;
      case 'wall':
        this._tone({ f: 160 + sp * 120, f2: 110, dur: 0.07, type: 'triangle', vol: 0.12 });
        this._noise({ dur: 0.04, vol: 0.03, f: 1800, q: 2 });
        break;
      case 'post':
        this._tone({ f: 1250, dur: 0.12, type: 'triangle', vol: 0.06 });
        break;
      case 'bumper':
        this._tone({ f: 420 * (o.pitch || 1), f2: 900 * (o.pitch || 1), dur: 0.12, type: 'square', vol: 0.06 });
        this._tone({ f: 1100 * (o.pitch || 1), dur: 0.08, type: 'sine', vol: 0.06, delay: 0.02 });
        break;
      case 'pod':
        this._tone({ f: 260, f2: 150, dur: 0.08, type: 'sine', vol: 0.18 });
        this._noise({ dur: 0.05, vol: 0.04, f: 900, q: 1 });
        break;
      case 'pulse':
        this._noise({ dur: 0.16, vol: 0.12, f: 700, f2: 3200, q: 1.4 });
        this._tone({ f: 180, f2: 520, dur: 0.12, type: 'triangle', vol: 0.1 });
        break;
      case 'hit':
        this._tone({ f: 520, f2: 260, dur: 0.09, type: 'square', vol: 0.07 });
        this._noise({ dur: 0.06, vol: 0.08, type: 'highpass', f: 2500 });
        break;
      case 'super':
        this._tone({ f: 300, f2: 1600, dur: 0.18, type: 'square', vol: 0.09 });
        this._tone({ f: 1760, dur: 0.22, type: 'sine', vol: 0.08, delay: 0.05 });
        this._noise({ dur: 0.25, vol: 0.18, type: 'highpass', f: 1500, f2: 6000 });
        this._tone({ f: 90, f2: 40, dur: 0.25, type: 'sine', vol: 0.35 });
        break;
      case 'dash':
        this._noise({ dur: 0.18, vol: 0.13, type: 'bandpass', f: 500, f2: 2600, q: 0.8 });
        break;
      case 'launchWarn':
        this._tone({ f: 740, dur: 0.07, type: 'square', vol: 0.04 });
        this._tone({ f: o.bomb ? 520 : 880, dur: 0.07, type: 'square', vol: 0.04, delay: 0.11 });
        break;
      case 'launch':
        this._tone({ f: 150, f2: 55, dur: 0.2, type: 'sine', vol: 0.32 });
        this._noise({ dur: 0.12, vol: 0.07, type: 'lowpass', f: 1200, f2: 300 });
        break;
      case 'goal':
        this._tone({ f: 460, f2: 120, dur: 0.45, type: 'sawtooth', vol: 0.08 });
        this._tone({ f: 230, f2: 60, dur: 0.5, type: 'square', vol: 0.05 });
        this._noise({ dur: 0.3, vol: 0.12, f: 2000, f2: 300, q: 0.7 });
        break;
      case 'goalMine':
        this._tone({ f: 330, dur: 0.18, type: 'square', vol: 0.07 });
        this._tone({ f: 220, dur: 0.35, type: 'square', vol: 0.07, delay: 0.18 });
        break;
      case 'voice': {
        const p = o.pitch || 1;
        this._tone({ f: 520 * p, f2: 780 * p, dur: 0.08, type: 'triangle', vol: 0.08 });
        this._tone({ f: 700 * p, f2: 380 * p, dur: 0.16, type: 'triangle', vol: 0.08, delay: 0.08 });
        break;
      }
      case 'eliminate':
        this._noise({ dur: 1.0, vol: 0.45, type: 'lowpass', f: 2400, f2: 90, q: 0.8 });
        this._tone({ f: 95, f2: 28, dur: 0.9, type: 'sine', vol: 0.55 });
        this._tone({ f: 600, f2: 90, dur: 0.6, type: 'sawtooth', vol: 0.05, delay: 0.05 });
        break;
      case 'countdown':
        this._tone({ f: 523, dur: 0.16, type: 'square', vol: 0.1 });
        break;
      case 'go':
        for (const f of [784, 988, 1175]) this._tone({ f, dur: 0.4, type: 'square', vol: 0.06 });
        this._noise({ dur: 0.3, vol: 0.08, type: 'highpass', f: 3000 });
        break;
      case 'suddenDeath':
        this._tone({ f: 110, dur: 0.7, type: 'sawtooth', vol: 0.12 });
        for (let i = 0; i < 4; i++) this._tone({ f: i % 2 ? 660 : 880, dur: 0.14, type: 'square', vol: 0.06, delay: i * 0.16 });
        break;
      case 'timeUp':
        this._tone({ f: 880, dur: 0.12, type: 'square', vol: 0.07 });
        this._tone({ f: 660, dur: 0.3, type: 'square', vol: 0.07, delay: 0.14 });
        break;
      case 'victory': {
        const notes = [523, 659, 784, 1047];
        notes.forEach((f, i) => this._tone({ f, dur: 0.16, type: 'square', vol: 0.07, delay: i * 0.11 }));
        for (const f of [523, 659, 784, 1047]) this._tone({ f, dur: 0.9, type: 'triangle', vol: 0.06, delay: 0.46 });
        this._noise({ dur: 0.6, vol: 0.06, type: 'highpass', f: 4000, delay: 0.46 });
        break;
      }
      case 'ui':
        this._tone({ f: 660, f2: 880, dur: 0.06, type: 'square', vol: 0.045 });
        break;
      case 'uiBack':
        this._tone({ f: 520, f2: 360, dur: 0.07, type: 'square', vol: 0.045 });
        break;
      case 'tick':
        this._tone({ f: 1320, dur: 0.04, type: 'square', vol: 0.03 });
        break;
      default:
    }
  }

  // ---------- trilha ----------
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this._schedule(), 25);
  }

  _schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const spb = 60 / this.bpm / 4;
    while (this.nextT < c.currentTime + 0.12) {
      this._musicStep(this.step, this.nextT);
      this.nextT += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  _musicStep(i, t) {
    if (!this.musicOn) return;
    const bar = Math.floor(i / 16), s = i % 16;
    const prog = [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
    ];
    const ch = prog[bar];
    const d = this.music;
    if (s % 4 === 0) this._tone({ f: 150, f2: 45, dur: 0.16, type: 'sine', vol: 0.5, at: t, dest: d });
    if (s % 4 === 2) this._noise({ dur: 0.04, vol: 0.06, type: 'highpass', f: 7000, at: t, dest: d });
    if (s === 4 || s === 12) this._noise({ dur: 0.12, vol: 0.14, type: 'bandpass', f: 1800, q: 0.9, at: t, dest: d });
    if ([0, 3, 6, 8, 10, 11, 14].includes(s)) {
      const n = s === 11 || s === 14 ? ch[1] - 12 : ch[0] - 12;
      this._tone({ f: midi(n), dur: 0.14, type: 'triangle', vol: 0.22, at: t, dest: d });
    }
    if (s === 2 || s === 6 || s === 10 || s === 14) {
      for (const n of ch.slice(1)) this._tone({ f: midi(n + 12), dur: 0.09, type: 'square', vol: 0.018, at: t, dest: d });
    }
    // pequena melodia a cada dois compassos
    const mel = [0, null, 2, null, 3, null, 2, 1, 0, null, null, 3, 2, null, 1, null];
    if (bar % 2 === 1 && mel[s] !== null) {
      this._tone({ f: midi(ch[mel[s]] + 24), dur: 0.12, type: 'triangle', vol: 0.05, at: t, dest: d });
    }
  }
}
