import { SimBase, BotBase, separate } from '../shared/SimBase.js';

export const F = {
  R: 8, r: 0.5, speed: 6.4, time: 60, jumpT: 0.55, dashV: 13, dashT: 0.18, dashCd: 1.4, maxTok: 9, tokEvery: 0.5,
  bars: [{ w: 1.0, ph: 0.6 }, { w: -0.78, ph: 3.4 }], barIn: 1.3, barOut: 8.2, barHalf: 0.22, slamEvery: 3.4, slamWarn: 1.15, slamR: 1.7,
};
/** Ângulo da barra k no tempo t (acelera aos poucos). */
export const barAngle = (k, t) => F.bars[k].ph + F.bars[k].w * (t + (t * t) / 200);
const barSpeed = (k, t) => F.bars[k].w * (1 + t / 100);

/**
 * Pega-Ficha: colete fichas desviando de duas barras giratórias (pule por cima) e da marreta
 * (saia do círculo de aviso). Levar pancada espalha 3 fichas suas pelo chão.
 * Objetos: 'f' ficha { v } · 'sl' marreta { w }.
 */
export class PegaFichaSim extends SimBase {
  constructor(o) {
    super({ ...o, time: F.time });
    const s = this.s;
    s.tk = 0;
    s.st = 4;
    for (let i = 0; i < this.n; i++) {
      const a = Math.PI / 4 + (i * Math.PI * 2) / this.n;
      s.p.push(this.player(i, { x: Math.cos(a) * 5, z: Math.sin(a) * 5, d: a + Math.PI, ju: 0, dc: 0, ds: 0, dx: 0, dz: 0, kx: 0, kz: 0, hi: 0 }));
    }
    for (let k = 0; k < 6; k++) this.token();
  }
  rankKey(p) {
    return [p.sc, -p.hi];
  }
  summary(p) {
    return [{ label: 'pancadas', value: p.hi }];
  }
  detail(p) {
    return `${p.sc} ${p.sc === 1 ? 'ficha' : 'fichas'}`;
  }
  token(x, z, v) {
    if (x === undefined) {
      const a = this.rand(0, Math.PI * 2), r = Math.sqrt(this.rand(0.05, 1)) * (F.R - 0.9);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    return this.add({ k: 'f', x, z, v: v ?? (this.rng() < 0.12 ? 3 : 1) });
  }
  hurt(p, nx, nz) {
    if (p.inv > 0) return;
    p.stun = 0.8;
    p.inv = 1.5;
    p.hi++;
    p.ju = 0;
    p.kx = nx * 8;
    p.kz = nz * 8;
    const n = Math.min(3, p.sc);
    p.sc -= n;
    for (let k = 0; k < n; k++) {
      const a = this.rand(0, Math.PI * 2), r = this.rand(1.3, 2.3);
      let x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const d = Math.hypot(x, z);
      if (d > F.R - 0.8) {
        x *= (F.R - 0.8) / d;
        z *= (F.R - 0.8) / d;
      }
      this.token(x, z, 1);
    }
    this.emit('hurt', { i: p.i, x: p.x, z: p.z, n });
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.tl <= 0) {
      this.emit('timeUp', {});
      return this.finish();
    }
    if ((s.tk -= h) <= 0) {
      s.tk = F.tokEvery;
      if (s.o.filter((o) => o.k === 'f').length < F.maxTok) this.token();
    }
    if ((s.st -= h) <= 0) {
      s.st = F.slamEvery * this.rand(0.75, 1.15) * Math.max(0.55, 1 - s.t / 150);
      const t = s.p[Math.floor(this.rng() * s.p.length)];
      this.emit('slamWarn', this.add({ k: 'sl', x: t.x + this.rand(-0.8, 0.8), z: t.z + this.rand(-0.8, 0.8), w: F.slamWarn }));
    }
    const lim = F.R - F.r;
    for (const p of s.p) {
      const inp = p.stun > 0 ? { x: 0, z: 0 } : inputs[p.i] || { x: 0, z: 0 };
      p.dc = Math.max(0, p.dc - h);
      p.ds = Math.max(0, p.ds - h);
      p.ju = Math.max(0, p.ju - h);
      if (Math.hypot(inp.x, inp.z) > 0.2) p.d = Math.atan2(inp.z, inp.x);
      if (p.ab > 0 && p.ju <= 0 && p.stun <= 0) {
        p.ab = 0;
        p.ju = F.jumpT;
        this.emit('jump', { i: p.i, x: p.x, z: p.z });
      }
      if (p.bb > 0 && p.dc <= 0 && p.stun <= 0) {
        p.bb = 0;
        p.dc = F.dashCd;
        p.ds = F.dashT;
        p.dx = Math.cos(p.d);
        p.dz = Math.sin(p.d);
        this.emit('dash', { i: p.i, x: p.x, z: p.z });
      }
      const k = 1 - Math.exp(-16 * h);
      p.vx += ((p.ds > 0 ? p.dx * F.dashV : inp.x * F.speed) - p.vx) * k;
      p.vz += ((p.ds > 0 ? p.dz * F.dashV : inp.z * F.speed) - p.vz) * k;
      const kd = Math.exp(-6 * h);
      p.kx *= kd;
      p.kz *= kd;
      p.x += (p.vx + p.kx) * h;
      p.z += (p.vz + p.kz) * h;
      const d = Math.hypot(p.x, p.z);
      if (d > lim) {
        p.x *= lim / d;
        p.z *= lim / d;
      }
    }
    for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) separate(s.p[i], s.p[j], F.r, F.r);
    for (const p of s.p) {
      // barras: só pegam quem está no chão
      if (p.ju < 0.06 && p.inv <= 0) {
        const pr = Math.hypot(p.x, p.z);
        for (let k = 0; k < F.bars.length; k++) {
          const a = barAngle(k, s.t), cx = Math.cos(a), cz = Math.sin(a);
          const along = p.x * cx + p.z * cz, side = p.x * cz - p.z * cx;
          if (along > F.barIn - F.r && along < F.barOut && Math.abs(side) < F.r + F.barHalf && pr > 0.5) {
            const sg = Math.sign(F.bars[k].w);
            this.hurt(p, -cz * sg, cx * sg);
            break;
          }
        }
      }
      if (p.stun > 0) continue;
      for (const o of s.o) {
        if (o.k === 'f' && !o.dead && Math.hypot(o.x - p.x, o.z - p.z) < 0.95) {
          o.dead = 1;
          p.sc += o.v;
          this.emit('coin', { i: p.i, x: o.x, z: o.z, v: o.v });
        }
      }
    }
    for (const o of s.o) {
      if (o.k !== 'sl' || o.dead || (o.w -= h) > 0) continue;
      o.dead = 1;
      this.emit('slam', { x: o.x, z: o.z });
      for (const p of s.p) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
        if (d < F.slamR + F.r * 0.5) this.hurt(p, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0);
      }
    }
  }
}

export class PegaFichaBot extends BotBase {
  think(h, fresh) {
    const me = this.me, s = this.sim.s, o = this.out;
    if (me.stun > 0) return;
    // barras: pula quando uma está chegando
    const pr = Math.hypot(me.x, me.z), th = Math.atan2(me.z, me.x);
    this.armed ||= [true, true];
    for (let k = 0; k < F.bars.length; k++) {
      if (pr < F.barIn - 0.4) continue;
      const w = barSpeed(k, s.t), sg = Math.sign(w);
      let gap = ((th - barAngle(k, s.t)) * sg) % (Math.PI * 2);
      if (gap < 0) gap += Math.PI * 2;
      const eta = Math.max(0, gap - (F.r + F.barHalf) / pr) / Math.abs(w);
      if (eta < this.lv(0.2, 0.24, 0.27)) {
        if (this.armed[k]) {
          this.armed[k] = false;
          if (me.ju <= 0 && this.rng() < this.lv(0.5, 0.86, 0.985)) o.a = true;
        }
      } else if (eta > 0.6) this.armed[k] = true;
    }
    // marreta: sai do círculo
    const sl = s.o.find((q) => q.k === 'sl' && Math.hypot(q.x - me.x, q.z - me.z) < F.slamR + this.lv(0, 0.5, 0.7));
    if (sl && (this.k > 0 || sl.w < 0.75)) {
      const dx = me.x - sl.x, dz = me.z - sl.z, d = Math.hypot(dx, dz) || 1;
      // foge para fora do círculo, mas sem ir contra a borda
      const out = pr > F.R - 2 ? -1 : 1;
      o.x = (dx / d) * (d < 0.3 ? 1 : 1) + (out < 0 ? -me.x / pr : 0);
      o.z = dz / d + (out < 0 ? -me.z / pr : 0);
      const l = Math.hypot(o.x, o.z) || 1;
      o.x /= l;
      o.z /= l;
      if (this.k === 2 && me.dc <= 0 && sl.w < 0.5) o.b = true;
      return;
    }
    if (fresh || !s.o.some((q) => q.id === this.tid && !q.dead)) {
      let best = null, bs = 0;
      const foes = this.others();
      for (const f of s.o) {
        if (f.k !== 'f') continue;
        const d = Math.hypot(f.x - me.x, f.z - me.z);
        let sc = f.v / (d + 0.6) + this.rng() * this.lv(0.5, 0.12, 0.02);
        if (this.k === 2 && foes.some((p) => Math.hypot(f.x - p.x, f.z - p.z) < d - 0.5)) sc *= 0.45;
        if (sc > bs) {
          bs = sc;
          best = f;
        }
      }
      this.tid = best ? best.id : 0;
    }
    const f = s.o.find((q) => q.id === this.tid);
    if (!f) return void this.go(0, 0, 3);
    const d = this.go(f.x, f.z, 0);
    if (this.k === 2 && d > 3.2 && me.dc <= 0 && fresh) o.b = true;
  }
}
