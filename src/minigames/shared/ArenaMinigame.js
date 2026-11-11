import { Minigame } from '../../game/Minigame.js';
import { getCharacter } from '../../characters/characters.js';
import { mulberry32, clamp } from '../../engine/math.js';
import { STEP } from './SimBase.js';

/**
 * Cola genérica dos minigames de arena: passo fixo, input humano (local e remoto), bots,
 * hitstop/câmera lenta e o protocolo online (host manda `sim.snapshot()` + eventos; o cliente só
 * espelha). Cada minigame declara: static Sim, static Bot, static View e static meta.
 *
 * Controles iguais em todos: direcional (mundo: direita = +x, cima = −z), A (Espaço) e B (Shift).
 */
export class ArenaMinigame extends Minigame {
  static Sim = null;
  static Bot = null;
  static View = null;

  setup(config) {
    const K = this.constructor;
    this.config = config;
    this.demo = !!config.demo;
    this.role = config.net?.role || 'local';
    this.players = config.players.map((p, i) => ({ ...p, index: i, seat: i, def: getCharacter(p.characterId) }));
    this.seed = config.seed ?? Math.floor(Math.random() * 1e9);
    this.sim = new K.Sim({ n: this.players.length, seed: this.seed, ...(config.opts || {}) });
    this.botRng = mulberry32(this.seed ^ 0x9e3779b9);
    const isBot = (p) => !p.isHuman && !p.isRemote;
    this.bots = this.role === 'client' ? [] : this.players.filter(isBot).map((p) => new K.Bot(this.sim, p.index, p.difficulty || 'normal', this.botRng));
    this.human = this.players.find((p) => p.isHuman) || null;
    this.controllers = new Map();
    if (this.role !== 'client') {
      for (const p of this.players) if (p.isHuman || p.isRemote) this.controllers.set(p.index, { player: p, x: 0, y: 0, seqA: 0, seqB: 0, a: false, b: false });
    }
    this.view = new K.View(this.ctx, this.sim, this.players, { demo: this.demo, mg: this });
    this.acc = 0;
    this.running = false;
    this.freeze = 0;
    this.slow = 0;
    this.slowScale = 1;
    this.endTimer = -1;
    this.done = false;
    this.inputs = [];
    this.netEvents = [];
    this.snapAge = 0;
    this.snapGap = 1 / 30;
    this.localSeq = { p: 0, d: 0 };
    this.localAxis = { x: 0, y: 0 };
  }

  start() {
    this.running = true;
  }
  hitstop(t) {
    this.freeze = Math.max(this.freeze, t);
  }
  slowmo(scale, t) {
    this.slowScale = scale;
    this.slow = Math.max(this.slow, t);
  }

  update(dt) {
    let scale = 1;
    if (this.freeze > 0) {
      this.freeze -= dt;
      scale = 0;
    } else if (this.slow > 0) {
      this.slow -= dt;
      scale = this.slowScale;
    }
    if (this.human && !this.demo && this.running) {
      const input = this.ctx.input;
      const inp = input.captureGame ? input.getPlayer(0) : { x: 0, y: 0, action: false, dash: false };
      if (inp.action) this.localSeq.p++;
      if (inp.dash) this.localSeq.d++;
      this.localAxis = { x: inp.x, y: inp.y };
      const ctrl = this.controllers.get(this.human.index);
      if (ctrl) this._feed(ctrl, inp.x, inp.y, this.localSeq.p, this.localSeq.d);
    }
    if (this.role === 'client') {
      this.snapAge += dt;
      this.view.update(dt, scale, Math.min(1, this.snapAge / this.snapGap));
    } else {
      if (this.running && !this.sim.finished) {
        this.acc += dt * scale;
        let steps = 0;
        while (this.acc >= STEP && steps < 12) {
          this._fixed(STEP);
          this.acc -= STEP;
          steps++;
        }
        if (steps >= 12) this.acc = 0;
      }
      this.view.update(dt, scale, this.sim.finished ? 1 : this.acc / STEP);
    }
    if (this.sim.finished) {
      if (this.endTimer < 0) this.endTimer = 0;
      this.endTimer += dt;
      if (this.endTimer > 3.4) this.done = true;
    }
  }

  _feed(ctrl, x, y, seqA, seqB) {
    ctrl.x = x;
    ctrl.y = y;
    if (seqA > ctrl.seqA) ctrl.a = true;
    if (seqB > ctrl.seqB) ctrl.b = true;
    ctrl.seqA = seqA;
    ctrl.seqB = seqB;
  }

  _fixed(h) {
    const sim = this.sim;
    for (const bot of this.bots) {
      const o = bot.update(h);
      this.inputs[bot.i] = o;
    }
    for (const c of this.controllers.values()) {
      let x = c.x, z = -c.y;
      const l = Math.hypot(x, z);
      if (l > 1) {
        x /= l;
        z /= l;
      }
      this.inputs[c.player.index] = { x, z, a: c.a, b: c.b };
      c.a = c.b = false;
    }
    this.view.capturePrev();
    sim.step(h, this.inputs);
    const events = sim.drainEvents();
    if (events.length) {
      this.view.handleEvents(events, this);
      if (this.role === 'host') this.netEvents.push(...events);
    }
  }

  // ---------- online ----------
  netInput() {
    return { x: +this.localAxis.x.toFixed(2), y: +this.localAxis.y.toFixed(2), p: this.localSeq.p, d: this.localSeq.d };
  }
  setRemoteInput(index, m) {
    const c = this.controllers.get(index);
    if (c && c.player.isRemote) this._feed(c, clamp(+m.x || 0, -1, 1), clamp(+m.y || 0, -1, 1), m.p | 0, m.d | 0);
  }
  dropRemote(index) {
    const c = this.controllers.get(index);
    if (!c || !c.player.isRemote) return;
    this.controllers.delete(index);
    this.bots.push(new this.constructor.Bot(this.sim, index, 'normal', this.botRng));
  }
  netSnapshot() {
    const snap = { st: this.sim.snapshot(), e: this.netEvents };
    this.netEvents = [];
    return snap;
  }
  applySnapshot(m) {
    if (!m || !m.st) return;
    this.view.capturePrev();
    this.snapGap = Math.min(0.12, Math.max(1 / 60, this.snapAge || 1 / 30));
    this.snapAge = 0;
    this.sim.apply(m.st);
    if (m.e && m.e.length) this.view.handleEvents(m.e, this);
  }

  // ---------- contrato ----------
  isFinished() {
    return this.done;
  }
  _playerState(p) {
    const q = this.sim.s.p[p.index];
    const hud = this.constructor.meta.hud || {};
    return {
      index: p.index, seat: p.seat, name: p.def.name, color: p.def.color, characterId: p.def.id, look: p,
      points: this.sim.hudPoints(q), text: this.sim.hudText(q), max: hud.pips || 0, danger: hud.pips ? q.on && this.sim.hudPoints(q) <= 1 : false,
      active: !!q.on, place: q.pl, isHuman: !!p.isHuman, difficulty: p.difficulty,
    };
  }
  getHud() {
    const s = this.sim.s;
    return {
      timeLeft: s.tl, hasLimit: !!s.lim, suddenDeath: !!s.sd, finished: !!s.fin,
      players: this.players.map((p) => this._playerState(p)),
      humanOut: this.human ? !s.p[this.human.index].on && !s.fin : false, ffwd: false, online: this.role !== 'local', viewSeat: 0, noFfwd: true,
    };
  }
  getLabels() {
    return this.view.getLabels().map((l) => ({ ...l, ...this._playerState(this.players[l.seat]) }));
  }
  getCameraFocus() {
    return this.view.focus || null;
  }
  getResults() {
    const sim = this.sim;
    return this.players
      .map((p) => {
        const q = sim.s.p[p.index];
        return { ...this._playerState(p), place: q.pl || 1, eliminatedAt: q.out, detail: sim.detail(q), summary: sim.summary(q) };
      })
      .sort((a, b) => a.place - b.place);
  }
  dispose() {
    this.view.dispose();
  }
}
