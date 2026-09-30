import { BOLADA as C, SEAT_ANGLES } from './config.js';
import { clamp, wrapAngle, gauss, rayCircleExit } from '../../engine/math.js';

/**
 * Todos os bots usam exatamente a mesma física e velocidade do jogador.
 * A diferença está em COMO pensam:
 *  - reaction: intervalo entre decisões (tempo de reação)
 *  - noise: erro de posicionamento (unidades de mundo)
 *  - mode: 'follow' persegue a posição atual da bola; 'intercept' prevê onde ela cruza o trilho
 *  - bounces: quantos ricochetes na parede ele consegue prever
 *  - pulseChance / earlyPulse / perfect: disciplina e timing do pulso
 *  - aim: posiciona-se para mandar a bola ao gol do adversário mais fraco
 *  - idle 'smart': lê a seta do lançador e se antecipa
 */
export const BOT_PROFILES = {
  easy: {
    label: 'Fácil', reaction: 0.36, noise: 0.9, mode: 'follow', bounces: 0, horizon: 9,
    pulseChance: 0.5, earlyPulse: 0.35, perfect: false, aim: false, dash: false, idle: 'wander', distraction: 0.15,
  },
  normal: {
    label: 'Normal', reaction: 0.22, noise: 0.45, mode: 'intercept', bounces: 0, horizon: 2.2,
    pulseChance: 0.7, earlyPulse: 0.08, perfect: false, aim: false, dash: false, idle: 'center', distraction: 0.05,
  },
  hard: {
    label: 'Difícil', reaction: 0.09, noise: 0.14, mode: 'intercept', bounces: 1, horizon: 3.5,
    pulseChance: 0.95, earlyPulse: 0, perfect: true, aim: true, dash: true, idle: 'smart', distraction: 0,
  },
};

const IDLE = { move: 0, pulse: false, dash: false };

export class BoladaBot {
  constructor(sim, seat, difficulty = 'normal', rng = Math.random) {
    this.sim = sim;
    this.seat = seat;
    this.difficulty = difficulty;
    this.p = BOT_PROFILES[difficulty] || BOT_PROFILES.normal;
    this.rng = rng;
    this.theta = SEAT_ANGLES[seat];
    this.targetOff = 0;
    this.thinkT = rng() * this.p.reaction;
    this.decisions = new Map();
    this.phase = rng() * 10;
    this.wantDash = false;
    this.victimSeat = -1;
  }

  update(dt) {
    const pod = this.sim.pods[this.seat];
    if (!pod || !pod.active || this.sim.finished) return IDLE;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = this.p.reaction * (0.75 + this.rng() * 0.5);
      this._think(pod);
    }
    const diff = (this.targetOff - pod.off) * this.sim.railR;
    const move = Math.abs(diff) < 0.12 ? 0 : clamp(diff / 0.9, -1, 1);
    let dash = false;
    if (this.wantDash && pod.dashCd <= 0 && Math.abs(diff) > 2.4) {
      dash = true;
      this.wantDash = false;
    }
    return { move, pulse: this._pulse(pod), dash };
  }

  _think() {
    const p = this.p;
    const threats = p.mode === 'follow' ? this._followThreats() : this._interceptThreats();
    let tgt = null;
    if (threats.length) {
      tgt = p.distraction && this.rng() < p.distraction ? threats[Math.floor(this.rng() * threats.length)] : threats[0];
    }
    let off;
    if (tgt) {
      off = tgt.railOff;
      if (p.aim && tgt.t < 1.3) off += this._aimOffset(off);
      this.wantDash = p.dash && tgt.t < 0.7;
    } else {
      off = this._idleOff();
      this.wantDash = false;
    }
    off += (gauss(this.rng) * p.noise) / this.sim.railR;
    this.targetOff = clamp(off, -C.railLimit, C.railLimit);
  }

  /** Fácil: olha a bola mais próxima vindo na sua direção e persegue a posição ATUAL dela. */
  _followThreats() {
    const sx = Math.cos(this.theta), sz = Math.sin(this.theta);
    const out = [];
    for (const b of this.sim.balls) {
      if (!b.alive) continue;
      const toward = b.vx * sx + b.vz * sz;
      if (toward <= 0.5) continue;
      const along = b.x * sx + b.z * sz;
      if (along < -3) continue;
      const railOff = clamp(wrapAngle(Math.atan2(b.z, b.x) - this.theta), -1, 1);
      out.push({ ball: b, t: (this.sim.R - along) / toward, railOff });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  /** Normal/Difícil: projeta a trajetória e descobre onde ela cruza o trilho do próprio gol. */
  _interceptThreats() {
    const out = [];
    for (const b of this.sim.balls) {
      if (!b.alive) continue;
      const hit = this._predict(b.x, b.z, b.vx, b.vz, b.r, this.p.bounces, 0);
      if (hit && hit.t <= this.p.horizon) out.push({ ball: b, ...hit });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  _predict(px, pz, vx, vz, r, bounces, tAcc) {
    const t = rayCircleExit(px, pz, vx, vz, this.sim.R - r);
    if (t < 0) return null;
    const hx = px + vx * t, hz = pz + vz * t;
    const ha = Math.atan2(hz, hx);
    const offMine = wrapAngle(ha - this.theta);
    if (Math.abs(offMine) < C.goalHalfAngle + 0.1) {
      const railR = this.sim.railR;
      let railOff = offMine;
      if (px * px + pz * pz < railR * railR) {
        const tr = rayCircleExit(px, pz, vx, vz, railR);
        if (tr > 0) railOff = wrapAngle(Math.atan2(pz + vz * tr, px + vx * tr) - this.theta);
      }
      return { t: tAcc + t, railOff, x: hx, z: hz };
    }
    const s = this.sim.seatAt(ha);
    if (s >= 0 && this.sim.goalOpen(s)) return null; // vai para o gol de outro
    if (bounces <= 0) return null;
    const d = Math.hypot(hx, hz);
    const nx = hx / d, nz = hz / d;
    const vn = vx * nx + vz * nz;
    return this._predict(hx - nx * 0.01, hz - nz * 0.01, vx - 2 * vn * nx, vz - 2 * vn * nz, r, bounces - 1, tAcc + t);
  }

  /** Difícil: desloca o pod para que o vetor pod→bola aponte para o gol do adversário mais fraco. */
  _aimOffset(ballOff) {
    const victims = this.sim.activePods().filter((p) => p.seat !== this.seat);
    if (!victims.length) return 0;
    const min = Math.min(...victims.map((p) => p.points));
    const weakest = victims.filter((p) => p.points === min);
    // Empate: sorteia um alvo e mantém enquanto continuar entre os mais fracos.
    // (Pegar sempre o primeiro da lista fazia todos os bots mirarem no assento 0, o do humano.)
    let v = weakest.find((p) => p.seat === this.victimSeat);
    if (!v) {
      v = weakest[Math.floor(this.rng() * weakest.length)];
      this.victimSeat = v.seat;
    }
    const va = SEAT_ANGLES[v.seat] - Math.sign(v.off || 1) * 0.3; // canto oposto ao pod da vítima
    const gx = Math.cos(va) * this.sim.R, gz = Math.sin(va) * this.sim.R;
    const a = this.theta + ballOff;
    const bx = Math.cos(a) * this.sim.railR, bz = Math.sin(a) * this.sim.railR;
    let dx = gx - bx, dz = gz - bz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const s = dx * -Math.sin(a) + dz * Math.cos(a);
    return (-s * 1.15) / this.sim.railR;
  }

  _idleOff() {
    const p = this.p;
    if (p.idle === 'wander') return Math.sin(this.sim.time * 0.8 + this.phase) * 0.28;
    if (p.idle === 'smart') {
      const L = this.sim.launcher;
      if (L.state === 'aiming') {
        const c = Math.cos(L.aim), s = Math.sin(L.aim);
        const hit = this._predict(c * 1.9, s * 1.9, c * 10, s * 10, C.ball.radius, 1, 0);
        if (hit) return hit.railOff;
      }
      let sum = 0, n = 0;
      for (const b of this.sim.balls) {
        const o = wrapAngle(Math.atan2(b.z, b.x) - this.theta);
        if (Math.abs(o) < 1.2) {
          sum += clamp(o, -0.4, 0.4);
          n++;
        }
      }
      return n ? (sum / n) * 0.6 : 0;
    }
    return 0;
  }

  _pulse(pod) {
    if (pod.pulseCd > 0) return false;
    const p = this.p;
    if (this.decisions.size > 64) this.decisions.clear();
    for (const b of this.sim.balls) {
      if (!b.alive) continue;
      const dx = b.x - pod.x, dz = b.z - pod.z;
      const d = Math.hypot(dx, dz);
      if (d > 5) continue;
      if (b.vx * dx + b.vz * dz >= 0) continue; // não está vindo
      const key = b.id * 1000 + b.hitCount;
      let dec = this.decisions.get(key);
      if (!dec) {
        dec = { go: this.rng() < p.pulseChance, early: this.rng() < p.earlyPulse, jitter: this.rng() };
        this.decisions.set(key, dec);
      }
      if (!dec.go) continue;
      let trigger;
      if (dec.early) trigger = 4.0 + dec.jitter * 0.6; // afobado: dispara longe demais
      else if (p.perfect) trigger = C.podRadius + b.r + 0.28; // espera encostar → super
      else trigger = C.pulse.radius * (0.55 + dec.jitter * 0.4) + b.r;
      if (d <= trigger) {
        dec.go = false;
        return true;
      }
    }
    return false;
  }
}
