import { SimBase, BotBase, separate } from '../shared/SimBase.js';
import { wrapAngle } from '../../engine/math.js';

export const R = {
  hw: 1.4, r: 0.42, vmax: 8, acc: 8, turn: 3.8, boostV: 12, padT: 0.9, turboT: 1.1, turboFill: 7, laps: 5,
  bw: 0.66, fallT: 1.5, endGrace: 15, cap: 170, penW: 2.3, penAmp: 2.0, penR: 0.55,
};

// ---------- pista: linha central fechada (Catmull-Rom) ----------
const CTRL = [
  [-1, 8.2], [4.5, 7.6], [7.8, 5.2], [8.6, 2.6], [5.5, 2.3], [2.0, 2.4], [0.2, 0.9], [-0.3, -0.6], [0.4, -2.0], [2.2, -3.0], [5.5, -2.9],
  [8.6, -3.2], [7.8, -5.6], [4.6, -7.8], [0, -8.4], [-4.6, -7.8], [-7.8, -5.2], [-8.6, -1.5], [-8.4, 2.5], [-7.0, 5.8], [-4.2, 7.8],
];
const SUB = 10;
function buildTrack() {
  const pts = [], n = CTRL.length;
  for (let i = 0; i < n; i++) {
    const p0 = CTRL[(i + n - 1) % n], p1 = CTRL[i], p2 = CTRL[(i + 1) % n], p3 = CTRL[(i + 2) % n];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]), s: 0 });
    }
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    pts[i].s = s;
    const q = pts[(i + 1) % pts.length];
    s += Math.hypot(q.x - pts[i].x, q.z - pts[i].z);
  }
  return { pts, L: s };
}
export const TRACK = buildTrack();
const { pts: PTS, L } = TRACK;
const M = PTS.length;
/** Ponto e tangente da linha central na distância `s` (com volta). */
export function trackAt(s) {
  s = ((s % L) + L) % L;
  let lo = 0, hi = M - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (PTS[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = PTS[lo], b = PTS[(lo + 1) % M];
  const seg = (lo === M - 1 ? L : b.s) - a.s, t = seg > 0 ? (s - a.s) / seg : 0;
  const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
  return { x: a.x + tx * t, z: a.z + tz * t, tx: tx / tl, tz: tz / tl, i: lo };
}
/** Ponto mais próximo da linha central numa janela à frente de `s0`. */
function nearest(x, z, s0) {
  const i0 = trackAt(s0 - 2.2).i, span = Math.floor(M * 0.42);
  let best = null, bd = Infinity;
  for (let k = 0; k < span; k++) {
    const a = PTS[(i0 + k) % M], b = PTS[(i0 + k + 1) % M];
    const ex = b.x - a.x, ez = b.z - a.z, el = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / el));
    const px = a.x + ex * t, pz = a.z + ez * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) {
      bd = d;
      best = { d, x: px, z: pz, s: a.s + Math.sqrt(el) * t };
    }
  }
  return best;
}
// atalho: ponte estreita e sem grade entre as duas bocas da península, com um martelo-pêndulo no meio
export const BRIDGE = { ax: CTRL[3][0], az: CTRL[3][1], bx: CTRL[11][0], bz: CTRL[11][1], sA: PTS[3 * SUB].s, sB: PTS[11 * SUB].s };
BRIDGE.len = Math.hypot(BRIDGE.bx - BRIDGE.ax, BRIDGE.bz - BRIDGE.az);
BRIDGE.mx = (BRIDGE.ax + BRIDGE.bx) / 2;
BRIDGE.mz = (BRIDGE.az + BRIDGE.bz) / 2;
/** Posição do pêndulo no tempo t (cruza a ponte de lado a lado). */
export const pendulum = (t) => ({ x: BRIDGE.mx + Math.sin(t * R.penW) * R.penAmp, z: BRIDGE.mz });
const at = (f, off = 0) => {
  const q = trackAt(f * L);
  return { x: q.x - q.tz * off, z: q.z + q.tx * off, s: f * L };
};
export const PADS = [at(0.03), at(0.31, 0.3), at(0.62), at(0.84, -0.3)];
export const OILS = [at(0.25, -0.55), at(0.72, 0.6), at(0.93, -0.5)];

/** Pé na Tábua: corrida de 3 voltas. Fora da ponte a pista tem grade; na ponte, cair custa caro. */
export class PeNaTabuaSim extends SimBase {
  constructor(o) {
    super(o);
    const s = this.s;
    s.first = -1;
    for (let i = 0; i < this.n; i++) {
      const q = trackAt(L - 1.4 - Math.floor(i / 2) * 1.5), side = (i % 2 ? 1 : -1) * 0.65;
      s.p.push(this.player(i, {
        x: q.x - q.tz * side, z: q.z + q.tx * side, d: Math.atan2(q.tz, q.tx), sp: 0, lap: -1, pr: L - 1.4 - Math.floor(i / 2) * 1.5,
        tb: 1, bt: 0, sk: 0, fall: 0, br: 0, done: 0, ft: 0, pos: i + 1, fl: 0,
      }));
    }
  }
  total(p) {
    return p.lap * L + p.pr;
  }
  hudPoints(p) {
    return Math.max(0, Math.min(R.laps, p.lap + (p.done ? 0 : 1)));
  }
  hudText(p) {
    return `${p.done ? p.pl : p.pos}º`;
  }
  summary(p) {
    return [{ label: 'voltas', value: Math.max(0, Math.min(R.laps, p.lap)) }, { label: 'quedas', value: p.fl }];
  }
  detail(p) {
    return p.done ? `Chegou em ${p.ft.toFixed(1).replace('.', ',')}s` : 'Não completou';
  }
  finish() {
    const s = this.s;
    if (s.fin) return;
    const order = s.p.slice().sort((a, b) => (a.done && b.done ? a.ft - b.ft : a.done ? -1 : b.done ? 1 : this.total(b) - this.total(a)));
    order.forEach((p, k) => (p.pl = k + 1));
    s.fin = 1;
    s.w = order[0].i;
    this.emit('end', { w: s.w });
  }

  tick(h, inputs) {
    const s = this.s;
    const pen = pendulum(s.t);
    for (const p of s.p) {
      if (p.fall > 0) {
        if ((p.fall -= h) <= 0) {
          const q = trackAt(p.pr);
          Object.assign(p, { x: q.x, z: q.z, d: Math.atan2(q.tz, q.tx), sp: 0, inv: 1, fall: 0, br: 0 });
          this.emit('respawn', { i: p.i, x: p.x, z: p.z });
        }
        continue;
      }
      const inp = p.done ? { x: 0, z: 0 } : inputs[p.i] || { x: 0, z: 0 };
      const mag = Math.min(1, Math.hypot(inp.x, inp.z));
      p.bt = Math.max(0, p.bt - h);
      p.sk = Math.max(0, p.sk - h);
      p.tb = Math.min(1, p.tb + h / R.turboFill);
      let thr = 0;
      if (mag > 0.25 && p.sk <= 0) {
        const diff = wrapAngle(Math.atan2(inp.z, inp.x) - p.d);
        p.d += Math.max(-R.turn * h, Math.min(R.turn * h, diff));
        thr = mag * (Math.abs(diff) > 2 ? 0.45 : 1);
      } else if (p.sk > 0) thr = 0.6;
      if (p.ab > 0 && p.tb >= 1 && !p.done) {
        p.ab = 0;
        p.tb = 0;
        p.bt = Math.max(p.bt, R.turboT);
        this.emit('turbo', { i: p.i, x: p.x, z: p.z });
      }
      const target = (p.bt > 0 ? R.boostV : R.vmax * thr) * (p.sk > 0 ? 0.75 : 1);
      p.sp = p.sp < target ? Math.min(target, p.sp + (p.bt > 0 ? 30 : R.acc) * h) : Math.max(target, p.sp - 7 * h);
      p.vx = Math.cos(p.d) * p.sp;
      p.vz = Math.sin(p.d) * p.sp;
      p.x += p.vx * h;
      p.z += p.vz * h;
    }
    for (let i = 0; i < s.p.length; i++) {
      for (let j = i + 1; j < s.p.length; j++) {
        const a = s.p[i], b = s.p[j];
        if (a.fall > 0 || b.fall > 0 || a.inv > 0 || b.inv > 0) continue;
        if (separate(a, b, R.r, R.r)) {
          a.sp *= 0.985;
          b.sp *= 0.985;
        }
      }
    }
    for (const p of s.p) {
      if (p.fall > 0) continue;
      const n = nearest(p.x, p.z, p.pr);
      const bu = ((p.x - BRIDGE.ax) * (BRIDGE.bx - BRIDGE.ax) + (p.z - BRIDGE.az) * (BRIDGE.bz - BRIDGE.az)) / (BRIDGE.len * BRIDGE.len);
      const bwd = Math.abs((p.x - BRIDGE.ax) * (BRIDGE.bz - BRIDGE.az) - (p.z - BRIDGE.az) * (BRIDGE.bx - BRIDGE.ax)) / BRIDGE.len;
      const onBridge = bu > 0 && bu < 1 && bwd <= R.bw;
      if (n.d > R.hw - R.r && !onBridge) {
        if (p.br) {
          this.drop(p);
          continue;
        }
        // grade: desliza pela borda e perde velocidade
        const k = (R.hw - R.r) / n.d;
        p.x = n.x + (p.x - n.x) * k;
        p.z = n.z + (p.z - n.z) * k;
        p.sp = Math.max(0, p.sp - 9 * h);
      }
      p.br = onBridge && n.d > R.hw ? 1 : 0;
      if (p.br && Math.hypot(p.x - pen.x, p.z - pen.z) < R.penR + R.r) {
        this.emit('whack', { i: p.i, x: p.x, z: p.z });
        this.drop(p);
        continue;
      }
      if (n.d <= R.hw + 0.3 && !p.done) {
        if (n.s < p.pr - L / 2) {
          p.lap++;
          if (p.lap >= R.laps) {
            p.done = 1;
            p.ft = s.t;
            p.pl = s.p.filter((q) => q.done).length;
            this.emit('finish', { i: p.i, pl: p.pl, x: p.x, z: p.z });
            if (s.first < 0) {
              s.first = p.i;
              s.lim = 1;
              s.tl = R.endGrace;
            }
          } else if (p.lap > 0) this.emit('lap', { i: p.i, lap: p.lap + 1, x: p.x, z: p.z });
        } else if (n.s > p.pr + L / 2) p.lap--;
        p.pr = n.s;
      }
      for (const pad of PADS) {
        if (p.bt < R.padT * 0.5 && Math.hypot(p.x - pad.x, p.z - pad.z) < 0.95) {
          p.bt = R.padT;
          this.emit('pad', { i: p.i, x: p.x, z: p.z });
        }
      }
      for (const oil of OILS) {
        if (p.sk <= 0 && p.inv <= 0 && Math.hypot(p.x - oil.x, p.z - oil.z) < 0.75) {
          p.sk = 0.7;
          p.inv = 1.2;
          this.emit('oil', { i: p.i, x: p.x, z: p.z });
        }
      }
    }
    const order = s.p.slice().sort((a, b) => (a.done && b.done ? a.ft - b.ft : a.done ? -1 : b.done ? 1 : this.total(b) - this.total(a)));
    order.forEach((p, k) => (p.pos = k + 1));
    if (s.p.every((p) => p.done) || (s.first >= 0 && s.tl <= 0) || s.t > R.cap) this.finish();
  }
  drop(p) {
    p.fall = R.fallT;
    p.sp = 0;
    p.br = 0;
    p.fl++;
    this.emit('fall', { i: p.i, x: p.x, z: p.z });
  }
}

export class PeNaTabuaBot extends BotBase {
  constructor(...a) {
    super(...a);
    this.lane = (this.rng() - 0.5) * 1.0;
    this.lapSeen = -9;
    this.turboT = 2 + this.rng() * 4;
  }
  think(h) {
    const me = this.me, s = this.sim.s, o = this.out;
    if (me.fall > 0 || me.done) return void (o.x = o.z = 0);
    // atalho: decide uma vez por volta, olhando onde o pêndulo estará
    if (this.lapSeen !== me.lap) {
      this.lapSeen = me.lap;
      this.tryBridge = this.rng() < this.lv(0, 0.3, 0.85);
      this.bridge = false;
    }
    const toA = BRIDGE.sA - me.pr;
    if (this.tryBridge && !this.bridge && toA > 0 && toA < 2.5) {
      const eta = (toA + BRIDGE.len / 2) / Math.max(5, me.sp);
      this.tryBridge = false;
      this.bridge = Math.abs(Math.sin((s.t + eta) * R.penW)) * R.penAmp > 1.25 + this.lv(0, 0.1, 0.25);
    }
    if (this.bridge && me.pr > BRIDGE.sB - 1 && me.pr < BRIDGE.sB + 6 && !me.br) this.bridge = false;
    let tx, tz;
    if (this.bridge && (me.br || toA < 2.6)) {
      tx = BRIDGE.bx;
      tz = BRIDGE.bz - 1.2;
    } else {
      const wob = this.k === 0 ? Math.sin(s.t * 1.3 + this.i) * 0.55 : 0;
      const q = trackAt(me.pr + this.lv(2.2, 2.7, 3.1) + me.sp * 0.12);
      tx = q.x - q.tz * (this.lane + wob);
      tz = q.z + q.tx * (this.lane + wob);
    }
    const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz) || 1, thr = this.lv(0.84, 0.94, 1);
    o.x = (dx / d) * thr;
    o.z = (dz / d) * thr;
    // turbo: nas retas (o fácil quase esquece que tem)
    this.turboT -= h;
    if (me.tb >= 1 && this.turboT <= 0) {
      const a = trackAt(me.pr), b = trackAt(me.pr + 6);
      if (a.tx * b.tx + a.tz * b.tz > 0.8 && !this.bridge) {
        o.a = true;
        this.turboT = this.lv(9, 3, 0.3);
      }
    }
  }
}
