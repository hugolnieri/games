import { BOLADA as C, SEAT_ANGLES, SUBSTEPS } from './config.js';
import { clamp, approach, wrapAngle, mulberry32 } from '../../engine/math.js';

const NO_INPUT = { move: 0, pulse: false, dash: false };

/**
 * Simulação 2D (plano XZ) do minigame BOLADA.
 * Não conhece Three.js: recebe inputs por assento e emite eventos que a view consome.
 * Isso permite rodar partidas inteiras em Node (test/sim.test.mjs).
 */
export class BoladaSim {
  constructor({ players, startPoints = 10, timeLimit = 0, seed } = {}) {
    this.rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
    this.R = C.arenaRadius;
    this.railR = C.railRadius;
    this.startPoints = startPoints;
    this.time = 0;
    this.hasLimit = timeLimit > 0;
    this.timeLimit = timeLimit;
    this.timeLeft = timeLimit;
    this.pods = [null, null, null, null];
    for (const p of players) this.pods[p.seat] = this._makePod(p.seat, p.id ?? p.seat);
    this.balls = [];
    this.nextBallId = 1;
    this.launcher = { state: 'cooldown', t: C.spawn.firstDelay, aim: 0, type: 'normal' };
    this.events = [];
    this.finished = false;
    this.winnerSeat = -1;
    this.suddenDeath = false;

    this.pillars = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      this.pillars.push({ id: k, a, x: Math.cos(a) * this.R, z: Math.sin(a) * this.R, r: C.pillarRadius });
    }
    this.posts = [];
    for (let s = 0; s < 4; s++) {
      for (const sg of [-1, 1]) {
        const a = SEAT_ANGLES[s] + sg * C.goalHalfAngle;
        this.posts.push({ x: Math.cos(a) * this.R, z: Math.sin(a) * this.R, r: C.postRadius });
      }
    }
  }

  // ---------- consultas ----------
  seatAt(angle) {
    for (let s = 0; s < 4; s++) if (Math.abs(wrapAngle(angle - SEAT_ANGLES[s])) < C.goalHalfAngle) return s;
    return -1;
  }
  goalOpen(s) {
    const p = this.pods[s];
    return !!(p && p.active);
  }
  activePods() {
    return this.pods.filter((p) => p && p.active);
  }
  baseSpeed() {
    const b = C.ball;
    return b.baseSpeed + (b.baseSpeedMax - b.baseSpeed) * Math.min(1, this.time / b.rampTime) + (this.suddenDeath ? 1.5 : 0);
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- passo ----------
  step(dt, inputs) {
    if (this.finished) return;
    this.time += dt;
    if (this.hasLimit && !this.suddenDeath) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._timeUp();
        if (this.finished) return;
      }
    }
    for (const pod of this.pods) if (pod) this._updatePod(pod, (inputs && inputs[pod.seat]) || NO_INPUT, dt);
    this._updateLauncher(dt);
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS && !this.finished; i++) this._stepBalls(h);
    for (const pod of this.pods) if (pod && pod.pulseT > 0) pod.pulseT = Math.max(0, pod.pulseT - dt);
    if (this.balls.some((b) => !b.alive)) this.balls = this.balls.filter((b) => b.alive);
  }

  // ---------- pods ----------
  _makePod(seat, id) {
    const pod = {
      seat, id, off: 0, v: 0, a: 0, x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0, vx: 0, vz: 0,
      active: true, points: this.startPoints, place: 0, eliminatedAt: -1,
      pulseT: 0, pulseCd: 0, pulseId: 0, dashT: 0, dashCd: 0,
      stats: { pulses: 0, hits: 0, supers: 0, saves: 0, conceded: 0, scored: 0 },
    };
    this._podPos(pod);
    return pod;
  }

  _podPos(pod) {
    const a = SEAT_ANGLES[pod.seat] + pod.off;
    const c = Math.cos(a), s = Math.sin(a);
    pod.a = a;
    pod.nx = c; pod.nz = s; // normal para fora
    pod.tx = -s; pod.tz = c; // tangente (off crescente)
    pod.x = c * this.railR;
    pod.z = s * this.railR;
    pod.vx = pod.tx * pod.v;
    pod.vz = pod.tz * pod.v;
  }

  _updatePod(pod, input, dt) {
    if (!pod.active) return;
    const P = C.pod;
    pod.pulseCd = Math.max(0, pod.pulseCd - dt);
    pod.dashCd = Math.max(0, pod.dashCd - dt);
    const move = clamp(input.move || 0, -1, 1);

    if (pod.dashT > 0) {
      pod.dashT -= dt;
    } else {
      const target = move * P.maxSpeed;
      let rate = P.accel;
      if (Math.abs(move) < 0.05) rate = P.decel;
      else if (pod.v !== 0 && Math.sign(target) !== Math.sign(pod.v)) rate = P.accel + P.decel; // virada seca
      pod.v = approach(pod.v, target, rate * dt);
    }

    if (input.dash && pod.dashCd <= 0) {
      const dir = Math.abs(move) > 0.2 ? Math.sign(move) : Math.sign(pod.v);
      if (dir !== 0) {
        pod.v = dir * P.dashSpeed;
        pod.dashT = P.dashTime;
        pod.dashCd = P.dashCooldown;
        this._emit({ type: 'dash', seat: pod.seat, dir });
      }
    }

    pod.off += (pod.v / this.railR) * dt;
    const lim = C.railLimit;
    if (pod.off > lim) {
      pod.off = lim;
      if (pod.v > 0) pod.v = 0;
    } else if (pod.off < -lim) {
      pod.off = -lim;
      if (pod.v < 0) pod.v = 0;
    }
    this._podPos(pod);

    if (input.pulse && pod.pulseCd <= 0) {
      pod.pulseT = C.pulse.window;
      pod.pulseCd = C.pulse.cooldown;
      pod.pulseId++;
      pod.stats.pulses++;
      this._emit({ type: 'pulse', seat: pod.seat, x: pod.x, z: pod.z });
    }
  }

  // ---------- lançador central ----------
  _targetBalls() {
    const S = C.spawn;
    return Math.min(
      S.maxBalls,
      S.startBalls + Math.floor(this.time / S.addEvery) + (this.suddenDeath ? 1 : 0),
      this.activePods().length + 2,
    );
  }

  _chooseAim() {
    // Quem tem mais pontos recebe mais bolas: mantém a partida disputada.
    const act = this.activePods();
    let total = 0;
    const w = act.map((p) => {
      const v = Math.pow(p.points + 1, 1.15);
      total += v;
      return v;
    });
    let r = this.rng() * total;
    let pick = act[0];
    for (let i = 0; i < act.length; i++) {
      r -= w[i];
      if (r <= 0) {
        pick = act[i];
        break;
      }
    }
    return SEAT_ANGLES[pick.seat] + (this.rng() * 2 - 1) * 0.5;
  }

  _updateLauncher(dt) {
    const L = this.launcher, S = C.spawn;
    L.t -= dt;
    if (L.state === 'cooldown') {
      if (L.t <= 0 && this.balls.length < this._targetBalls()) {
        L.state = 'aiming';
        L.t = S.telegraph;
        L.aim = this._chooseAim();
        L.type = this.time > S.bombAfter && this.rng() < S.bombChance ? 'bomb' : 'normal';
        this._emit({ type: 'launchWarn', angle: L.aim, ballType: L.type });
      }
    } else if (L.state === 'aiming' && L.t <= 0) {
      this._spawnBall(L.aim, L.type);
      L.state = 'cooldown';
      L.t = S.minGap;
    }
  }

  _spawnBall(angle, type) {
    const bomb = type === 'bomb';
    const r = bomb ? C.ball.bombRadius : C.ball.radius;
    const dist = C.reactorRadius + r + 0.05;
    const c = Math.cos(angle), s = Math.sin(angle);
    const speed = this.baseSpeed() * (bomb ? 1.12 : 1.02);
    const b = {
      id: this.nextBallId++, x: c * dist, z: s * dist, vx: c * speed, vz: s * speed, r, type,
      value: bomb ? 2 : 1, lastHitBy: -1, pulsedBy: {}, super: 0, hitCount: 0, alive: true, age: 0,
    };
    this.balls.push(b);
    this._emit({ type: 'launch', id: b.id, angle, ballType: type, x: b.x, z: b.z });
  }

  // ---------- bolas ----------
  _stepBalls(h) {
    const base = this.baseSpeed();
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.x += b.vx * h;
      b.z += b.vz * h;
      b.age += h;
      if (b.super > 0) b.super -= h;

      this._collideCircle(b, 0, 0, C.reactorRadius, 1.04, 'reactor', -1);
      for (const p of this.pillars) this._collideCircle(b, p.x, p.z, p.r, 1.12, 'pillar', p.id);
      for (const p of this.posts) this._collideCircle(b, p.x, p.z, p.r, 1, 'post', -1);
      for (const pod of this.pods) if (pod && pod.active && b.alive) this._collidePod(b, pod);
      if (!b.alive) continue;
      this._collideWall(b);
      if (!b.alive) continue;
      this._regulate(b, b.type === 'bomb' ? base * 1.1 : base, h);

      if (!Number.isFinite(b.x) || !Number.isFinite(b.z) || b.x * b.x + b.z * b.z > (this.R + 4) ** 2) {
        b.alive = false;
        this._emit({ type: 'ballPop', id: b.id, x: 0, z: 0 });
      }
    }
    this._collideBalls();
  }

  _collideCircle(b, cx, cz, cr, boost, kind, id) {
    const dx = b.x - cx, dz = b.z - cz;
    const min = cr + b.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, nz = dz / d;
    b.x = cx + nx * min;
    b.z = cz + nz * min;
    const vn = b.vx * nx + b.vz * nz;
    if (vn >= 0) return;
    b.vx -= 2 * vn * nx;
    b.vz -= 2 * vn * nz;
    let speed = Math.hypot(b.vx, b.vz);
    if (boost !== 1 && speed > 1e-4) {
      // pequeno desvio aleatório evita loops infinitos reator ↔ pilar
      const j = (this.rng() - 0.5) * 0.24;
      const cs = Math.cos(j), sn = Math.sin(j);
      const vx = b.vx * cs - b.vz * sn, vz = b.vx * sn + b.vz * cs;
      const ns = Math.max(speed * boost, kind === 'pillar' ? 11 : speed);
      b.vx = (vx / speed) * ns;
      b.vz = (vz / speed) * ns;
      speed = ns;
    }
    this._emit({ type: 'bounce', kind, id, ballId: b.id, x: cx + nx * cr, z: cz + nz * cr, speed });
  }

  _collidePod(b, pod) {
    const s = pod.seat;
    let dx = b.x - pod.x, dz = b.z - pod.z;
    let d2 = dx * dx + dz * dz;

    // Pulso: arremessa a bola na direção pod → bola (sempre para dentro da arena).
    if (pod.pulseT > 0 && b.pulsedBy[s] !== pod.pulseId) {
      const d = Math.sqrt(d2) || 1e-6;
      if (d - b.r < C.pulse.radius) {
        let nx = dx / d, nz = dz / d;
        const rad = nx * pod.nx + nz * pod.nz;
        if (rad > -0.3) {
          nx -= pod.nx * (rad + 0.3);
          nz -= pod.nz * (rad + 0.3);
          const l = Math.hypot(nx, nz) || 1;
          nx /= l;
          nz /= l;
        }
        const gap = d - C.podRadius - b.r;
        const isSuper = gap < C.pulse.superGap;
        const cur = Math.hypot(b.vx, b.vz);
        const spd = isSuper ? C.pulse.superSpeed : Math.max(C.pulse.speed, cur * 0.9);
        b.vx = nx * spd;
        b.vz = nz * spd;
        b.lastHitBy = s;
        b.pulsedBy[s] = pod.pulseId;
        b.super = isSuper ? 1.2 : 0.35;
        b.hitCount++;
        pod.stats.hits++;
        if (isSuper) pod.stats.supers++;
        this._emit({ type: 'pulseHit', seat: s, super: isSuper, x: b.x, z: b.z, id: b.id });
      }
    }

    // Corpo do pod: rebatida passiva (com "efeito" da velocidade do pod).
    const min = C.podRadius + b.r;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, nz = dz / d;
      b.x = pod.x + nx * min;
      b.z = pod.z + nz * min;
      const rvx = b.vx - pod.vx, rvz = b.vz - pod.vz;
      const vn = rvx * nx + rvz * nz;
      if (vn < 0) {
        b.vx -= 2 * vn * nx;
        b.vz -= 2 * vn * nz;
        b.vx += pod.vx * 0.35;
        b.vz += pod.vz * 0.35;
        const out = b.vx * pod.nx + b.vz * pod.nz;
        if (out > -2) {
          b.vx -= pod.nx * (out + 2);
          b.vz -= pod.nz * (out + 2);
        }
        b.lastHitBy = s;
        b.hitCount++;
        pod.stats.saves++;
        this._emit({ type: 'bounce', kind: 'pod', seat: s, ballId: b.id, x: pod.x + nx * C.podRadius, z: pod.z + nz * C.podRadius, speed: Math.hypot(b.vx, b.vz) });
      }
    }
  }

  _collideWall(b) {
    const d = Math.hypot(b.x, b.z);
    if (d + b.r <= this.R) return;
    const a = Math.atan2(b.z, b.x);
    const s = this.seatAt(a);
    if (s >= 0 && this.goalOpen(s)) {
      if (d - b.r * 0.2 > this.R) this._goal(b, s);
      return;
    }
    const nx = b.x / d, nz = b.z / d;
    b.x = nx * (this.R - b.r);
    b.z = nz * (this.R - b.r);
    const vn = b.vx * nx + b.vz * nz;
    if (vn > 0) {
      b.vx -= 2 * vn * nx;
      b.vz -= 2 * vn * nz;
      this._emit({ type: 'bounce', kind: 'wall', ballId: b.id, x: nx * this.R, z: nz * this.R, speed: Math.hypot(b.vx, b.vz) });
    }
  }

  _collideBalls() {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const min = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const nx = dx / d, nz = dz / d;
        const push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
        const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vn > 0) {
          a.vx -= vn * nx; a.vz -= vn * nz;
          b.vx += vn * nx; b.vz += vn * nz;
          this._emit({ type: 'bounce', kind: 'ball', x: a.x + nx * a.r, z: a.z + nz * a.r, speed: vn });
        }
      }
    }
  }

  _regulate(b, base, h) {
    const s = Math.hypot(b.vx, b.vz);
    if (s < 1e-4) {
      const a = this.rng() * Math.PI * 2;
      b.vx = Math.cos(a) * base;
      b.vz = Math.sin(a) * base;
      return;
    }
    let ns = s > base ? s + (base - s) * C.ball.decay * h : s + (base - s) * 0.6 * h;
    ns = clamp(ns, C.ball.minSpeed, C.ball.maxSpeed);
    const k = ns / s;
    b.vx *= k;
    b.vz *= k;
  }

  // ---------- regras ----------
  _goal(b, s) {
    b.alive = false;
    const pod = this.pods[s];
    pod.points = Math.max(0, pod.points - b.value);
    pod.stats.conceded += b.value;
    const scorer = b.lastHitBy;
    if (scorer >= 0 && scorer !== s && this.pods[scorer]) this.pods[scorer].stats.scored += b.value;
    this._emit({ type: 'goal', seat: s, id: b.id, x: b.x, z: b.z, vx: b.vx, vz: b.vz, value: b.value, scorer, points: pod.points, ballType: b.type });
    if (pod.points <= 0) this._eliminate(s, 'goal');
  }

  _eliminate(s, reason) {
    const pod = this.pods[s];
    if (!pod.active) return;
    const active = this.activePods();
    if (active.length <= 1) {
      pod.points = 1; // salvaguarda: nunca zera o último vivo
      return;
    }
    pod.active = false;
    pod.place = active.length;
    pod.eliminatedAt = this.time;
    pod.v = 0;
    this._emit({ type: 'eliminate', seat: s, place: pod.place, reason });
    if (active.length - 1 === 1) {
      const w = active.find((p) => p !== pod);
      this._finish(w.seat);
    }
  }

  _timeUp() {
    const act = this.activePods();
    const max = Math.max(...act.map((p) => p.points));
    const top = act.filter((p) => p.points === max);
    const rest = act.filter((p) => p.points < max).sort((a, b) => a.points - b.points);
    this._emit({ type: 'timeUp' });
    for (const p of rest) this._eliminate(p.seat, 'time');
    if (!this.finished && top.length > 1) {
      this.suddenDeath = true;
      for (const p of top) p.points = 1;
      this._emit({ type: 'suddenDeath', seats: top.map((p) => p.seat) });
    }
  }

  _finish(seat) {
    this.finished = true;
    this.winnerSeat = seat;
    this.pods[seat].place = 1;
    for (const b of this.balls) {
      if (b.alive) {
        b.alive = false;
        this._emit({ type: 'ballPop', id: b.id, x: b.x, z: b.z });
      }
    }
    this.balls = [];
    this._emit({ type: 'end', winner: seat });
  }

  _emit(e) {
    this.events.push(e);
  }
}
