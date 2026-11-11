import { SimBase, BotBase, separate } from '../shared/SimBase.js';

export const C = {
  half: 7.2, r: 0.55, speed: 6.2, lives: 3, time: 90, windup: 0.5, throwV: 13.5, range: 11, crateR: 0.55, maxCr: 5, spawnEvery: 2.6, dropT: 1.0,
  dashV: 14, dashT: 0.18, dashCd: 1.6, fuse: 3.6, blast: 2.2, pick: 1.5,
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Caixote!: pegue caixotes e arremesse nos outros. Antes de soltar há uma preparação visível
 * (dá tempo de ler a mira e desviar). Dinamite acende o pavio ao ser pega.
 * Objetos: k 'c' caixote | 't' dinamite; st 0 caindo do céu, 1 no chão, 2 na mão, 3 voando.
 */
export class CaixoteSim extends SimBase {
  constructor(o) {
    super({ ...o, time: C.time });
    const s = this.s;
    s.sp = 0.3;
    for (let i = 0; i < this.n; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / this.n;
      s.p.push(this.player(i, { x: Math.cos(a) * 5.2, z: Math.sin(a) * 5.2, d: a + Math.PI, lv: C.lives, hold: 0, wu: 0, dc: 0, ds: 0, dx: 0, dz: 0, kx: 0, kz: 0, ht: 0 }));
    }
    for (let k = 0; k < 3; k++) this.spawn(0.6 + k * 0.3);
  }
  rankKey(p) {
    return [p.lv, p.ht];
  }
  hudPoints(p) {
    return p.lv;
  }
  summary(p) {
    return [{ label: 'acertos', value: p.ht }];
  }
  detail(p) {
    return p.pl === 1 ? `Venceu com ${p.lv} ${p.lv === 1 ? 'vida' : 'vidas'}` : p.out >= 0 ? `Fora aos ${fmt(p.out)}` : `${p.lv} vidas`;
  }
  spawn(w = C.dropT) {
    for (let k = 0; k < 12; k++) {
      const x = this.rand(-C.half + 1.2, C.half - 1.2), z = this.rand(-C.half + 1.2, C.half - 1.2);
      if (this.s.p.some((p) => p.on && Math.hypot(p.x - x, p.z - z) < 1.6) || this.s.o.some((o) => Math.hypot(o.x - x, o.z - z) < 1.4)) continue;
      return this.add({ k: this.rng() < 0.16 ? 't' : 'c', st: 0, x, z, vx: 0, vz: 0, w, own: -1, fu: 0, ds: 0 });
    }
    return null;
  }
  byId(id) {
    return this.s.o.find((o) => o.id === id && !o.dead);
  }
  drop(p) {
    const o = p.hold && this.byId(p.hold);
    if (o) o.st = 1;
    p.hold = 0;
    p.wu = 0;
  }
  hit(p, by, nx, nz) {
    if (!p.on || p.inv > 0) return;
    p.lv--;
    p.inv = 2.0;
    p.stun = 0.45;
    p.kx = nx * 9;
    p.kz = nz * 9;
    this.drop(p);
    if (by >= 0 && by !== p.i) this.s.p[by].ht++;
    this.emit('hit', { i: p.i, by, x: p.x, z: p.z, lv: p.lv });
    if (p.lv <= 0) this.eliminate(p);
  }
  explode(o) {
    if (o.dead) return;
    o.dead = 1;
    for (const p of this.s.p) {
      if (p.hold === o.id) p.hold = 0, (p.wu = 0);
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (p.on && d < C.blast) this.hit(p, o.own, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0);
    }
    this.emit('boom', { x: o.x, z: o.z });
  }
  smash(o) {
    if (o.k === 't') return this.explode(o);
    o.dead = 1;
    this.emit('break', { x: o.x, z: o.z });
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.tl <= 0) {
      this.emit('timeUp', {});
      return this.finish();
    }
    s.sp -= h;
    if (s.sp <= 0) {
      if (s.o.filter((o) => o.st < 2).length < C.maxCr) this.spawn();
      s.sp = C.spawnEvery;
    }
    const lim = C.half - C.r;
    for (const p of s.p) {
      if (!p.on) continue;
      const inp = p.stun > 0 ? { x: 0, z: 0 } : inputs[p.i] || { x: 0, z: 0 };
      p.dc = Math.max(0, p.dc - h);
      p.ds = Math.max(0, p.ds - h);
      if (Math.hypot(inp.x, inp.z) > 0.2) p.d = Math.atan2(inp.z, inp.x);
      if (p.bb > 0 && p.dc <= 0 && p.wu <= 0 && p.stun <= 0) {
        p.bb = 0;
        p.ds = C.dashT;
        p.dc = C.dashCd;
        p.dx = Math.cos(p.d);
        p.dz = Math.sin(p.d);
        this.emit('dash', { i: p.i, x: p.x, z: p.z });
      }
      const sp = C.speed * (p.hold ? 0.85 : 1) * (p.wu > 0 ? 0.45 : 1);
      const k = 1 - Math.exp(-18 * h);
      p.vx += ((p.ds > 0 ? p.dx * C.dashV : inp.x * sp) - p.vx) * k;
      p.vz += ((p.ds > 0 ? p.dz * C.dashV : inp.z * sp) - p.vz) * k;
      const kd = Math.exp(-6 * h);
      p.kx *= kd;
      p.kz *= kd;
      p.x = Math.max(-lim, Math.min(lim, p.x + (p.vx + p.kx) * h));
      p.z = Math.max(-lim, Math.min(lim, p.z + (p.vz + p.kz) * h));
      if (p.ab > 0 && p.stun <= 0) {
        if (p.hold && p.wu <= 0) {
          p.wu = C.windup;
          p.ab = 0;
          this.emit('windup', { i: p.i });
        } else if (!p.hold) {
          let best = null, bd = C.pick;
          for (const o of s.o) {
            const d = Math.hypot(o.x - p.x, o.z - p.z);
            if (o.st === 1 && d < bd) {
              bd = d;
              best = o;
            }
          }
          if (best) {
            best.st = 2;
            best.own = p.i;
            if (best.k === 't' && best.fu <= 0) best.fu = C.fuse;
            p.hold = best.id;
            p.ab = 0;
            this.emit('pick', { i: p.i, x: p.x, z: p.z, tnt: best.k === 't' });
          }
        }
      }
      if (p.wu > 0 && (p.wu -= h) <= 0) {
        const o = this.byId(p.hold);
        p.hold = 0;
        if (o) {
          const cx = Math.cos(p.d), cz = Math.sin(p.d);
          Object.assign(o, { st: 3, vx: cx * C.throwV, vz: cz * C.throwV, x: p.x + cx * 0.9, z: p.z + cz * 0.9, ds: 0, own: p.i });
          this.emit('throw', { i: p.i, x: p.x, z: p.z });
        }
      }
      const held = p.hold && this.byId(p.hold);
      if (held) {
        held.x = p.x;
        held.z = p.z;
      }
    }
    for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) if (s.p[i].on && s.p[j].on) separate(s.p[i], s.p[j], C.r, C.r);
    for (const o of s.o) {
      if (o.dead) continue;
      if (o.st === 0 && (o.w -= h) <= 0) {
        o.st = 1;
        this.emit('landed', { x: o.x, z: o.z });
      }
      if (o.fu > 0 && (o.fu -= h) <= 0) {
        this.explode(o);
        continue;
      }
      if (o.st !== 3) continue;
      o.x += o.vx * h;
      o.z += o.vz * h;
      o.ds += C.throwV * h;
      const victim = s.p.find((p) => p.on && p.i !== o.own && p.inv <= 0 && Math.hypot(p.x - o.x, p.z - o.z) < C.r + C.crateR);
      if (victim) {
        if (o.k === 't') this.explode(o);
        else {
          this.hit(victim, o.own, o.vx / C.throwV, o.vz / C.throwV);
          this.smash(o);
        }
      } else if (Math.abs(o.x) > C.half - 0.4 || Math.abs(o.z) > C.half - 0.4 || o.ds > C.range) this.smash(o);
    }
  }
}

export class CaixoteBot extends BotBase {
  think(h, fresh) {
    const me = this.me, s = this.sim.s, o = this.out;
    if (me.stun > 0) return;
    // desvia de caixote voando na minha direção
    for (const c of s.o) {
      if (c.st !== 3 || c.own === me.i) continue;
      const rx = me.x - c.x, rz = me.z - c.z;
      const t = (rx * c.vx + rz * c.vz) / (C.throwV * C.throwV);
      if (t < 0 || t > 0.9) continue;
      const px = c.x + c.vx * t, pz = c.z + c.vz * t;
      if (Math.hypot(me.x - px, me.z - pz) > 1.3) continue;
      if (this.seen !== c.id) {
        this.seen = c.id;
        this.dodge = this.rng() < this.lv(0.25, 0.7, 0.97);
        this.side = (rx * c.vz - rz * c.vx > 0 ? 1 : -1) || 1;
      }
      if (!this.dodge) break;
      o.x = (c.vz / C.throwV) * this.side;
      o.z = (-c.vx / C.throwV) * this.side;
      if (this.k === 2 && me.dc <= 0 && !me.hold) o.b = true;
      return;
    }
    const foes = this.others();
    if (me.hold) {
      const held = this.sim.byId(me.hold);
      const fair = foes.filter((f) => f.inv <= 0.4);
      if (fair.length) foes.splice(0, foes.length, ...fair);
      const t = this.k === 2 ? foes.slice().sort((a, b) => a.lv - b.lv || Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0] : this.nearest(foes);
      if (!t) return;
      const d0 = Math.hypot(t.x - me.x, t.z - me.z);
      const lead = (d0 / C.throwV + C.windup) * this.lv(0, 0.6, 1);
      const ax = t.x + t.vx * lead, az = t.z + t.vz * lead;
      const d = this.go(ax, az, 0);
      if (d < 1.6) o.x *= 0.3, (o.z *= 0.3);
      const err = Math.abs(Math.atan2(Math.sin(Math.atan2(az - me.z, ax - me.x) - me.d), Math.cos(Math.atan2(az - me.z, ax - me.x) - me.d)));
      const urgent = held && held.k === 't' && held.fu < 1.3;
      if (fresh && me.wu <= 0 && (urgent || (d < this.lv(4.5, 6, 7.5) && err < this.lv(0.5, 0.22, 0.1) && this.rng() < this.lv(0.2, 0.3, 0.7)))) o.a = true;
      return;
    }
    // sem caixote: vai buscar o mais próximo (evita dinamite já acesa)
    const crates = s.o.filter((c) => c.st === 1 && !(c.fu > 0 && c.fu < 2));
    const c = this.nearest(crates);
    if (c) {
      if (this.go(c.x, c.z, 0.3) < C.pick - 0.3 && fresh) o.a = true;
    } else {
      const holder = this.nearest(foes.filter((p) => p.hold));
      if (holder && this.k > 0) this.go(me.x * 2 - holder.x, me.z * 2 - holder.z, 0);
      else this.go(0, 0, 2);
    }
  }
}
