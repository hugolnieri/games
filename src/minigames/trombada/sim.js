import { SimBase, BotBase, separate } from '../shared/SimBase.js';

export const T = {
  R0: 8.2, Rmin: 3.6, Rsudden: 2.3, shrinkAt: 16, shrink: 0.075, r: 0.8, acc: 24, max: 7.2, fr: 1.5,
  dash: 11.5, dashCd: 1.3, dashT: 0.28, anchT: 0.6, anchCd: 2.4, lives: 3, time: 90, fallT: 1.0, cap: 150,
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Trombada: bate-bate numa plataforma lisa que encolhe. Quem cai perde uma vida. */
export class TrombadaSim extends SimBase {
  constructor(o) {
    super({ ...o, time: T.time });
    const s = this.s;
    s.R = T.R0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / this.n;
      s.p.push(this.player(i, { x: Math.cos(a) * 5, z: Math.sin(a) * 5, d: a + Math.PI, lv: T.lives, dc: 0, ds: 0, ac: 0, an: 0, fall: 0, lh: -1, lt: -9, ko: 0, fl: 0 }));
    }
  }
  rankKey(p) {
    return [p.lv, p.ko, -p.fl];
  }
  hudPoints(p) {
    return p.lv;
  }
  summary(p) {
    return [{ label: 'nocautes', value: p.ko }, { label: 'quedas', value: p.fl }];
  }
  detail(p) {
    return p.pl === 1 ? `Venceu com ${p.lv} ${p.lv === 1 ? 'vida' : 'vidas'}` : p.out >= 0 ? `Fora aos ${fmt(p.out)}` : `${p.lv} vidas`;
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.lim && s.tl <= 0 && !s.sd) {
      s.sd = 1;
      this.emit('sudden', { sub: 'A plataforma encolhe de vez' });
    }
    if (s.t > T.shrinkAt) s.R = Math.max(s.sd ? T.Rsudden : T.Rmin, s.R - T.shrink * (s.sd ? 4 : 1) * h);
    for (const p of s.p) {
      if (!p.on) continue;
      if (p.fall > 0) {
        p.fall -= h;
        if (p.fall <= 0) {
          if (p.lv <= 0) this.eliminate(p);
          else {
            const a = this.rand(0, Math.PI * 2), r = Math.min(2, s.R - 1.6);
            Object.assign(p, { x: Math.cos(a) * r, z: Math.sin(a) * r, vx: 0, vz: 0, inv: 1.5, fall: 0 });
            this.emit('respawn', { i: p.i, x: p.x, z: p.z });
          }
        }
        continue;
      }
      const inp = inputs[p.i] || { x: 0, z: 0 };
      const mag = Math.hypot(inp.x, inp.z);
      p.dc = Math.max(0, p.dc - h);
      p.ds = Math.max(0, p.ds - h);
      p.ac = Math.max(0, p.ac - h);
      p.an = Math.max(0, p.an - h);
      if (mag > 0.2) p.d = Math.atan2(inp.z, inp.x);
      if (p.bb > 0 && p.ac <= 0) {
        p.an = T.anchT;
        p.ac = T.anchCd;
        p.bb = 0;
        this.emit('anchor', { i: p.i, x: p.x, z: p.z });
      }
      if (p.an > 0) {
        const k = Math.exp(-9 * h);
        p.vx *= k;
        p.vz *= k;
      } else {
        if (p.ab > 0 && p.dc <= 0) {
          const dx = Math.cos(p.d), dz = Math.sin(p.d);
          p.vx = p.vx * 0.3 + dx * T.dash;
          p.vz = p.vz * 0.3 + dz * T.dash;
          p.ds = T.dashT;
          p.dc = T.dashCd;
          p.ab = 0;
          this.emit('dash', { i: p.i, x: p.x, z: p.z });
        }
        p.vx += inp.x * T.acc * h;
        p.vz += inp.z * T.acc * h;
        const k = Math.exp(-T.fr * h);
        p.vx *= k;
        p.vz *= k;
        const sp = Math.hypot(p.vx, p.vz), max = p.ds > 0 ? 13 : T.max;
        if (sp > max) {
          const f = Math.max(max, sp - 30 * h) / sp;
          p.vx *= f;
          p.vz *= f;
        }
      }
      p.x += p.vx * h;
      p.z += p.vz * h;
    }
    const mass = (p) => (p.an > 0 ? 4 : p.inv > 0 ? 3 : p.ds > 0 ? 2.4 : 1);
    for (let i = 0; i < s.p.length; i++) {
      for (let j = i + 1; j < s.p.length; j++) {
        const a = s.p[i], b = s.p[j];
        if (!a.on || !b.on || a.fall > 0 || b.fall > 0) continue;
        const n = separate(a, b, T.r, T.r);
        if (!n) continue;
        const vn = (a.vx - b.vx) * n.nx + (a.vz - b.vz) * n.nz;
        if (vn <= 0) continue;
        const ma = mass(a), mb = mass(b);
        const jimp = (1.9 * vn) / (1 / ma + 1 / mb);
        a.vx -= (jimp / ma) * n.nx;
        a.vz -= (jimp / ma) * n.nz;
        b.vx += (jimp / mb) * n.nx;
        b.vz += (jimp / mb) * n.nz;
        if (a.ds > 0 && b.an <= 0) {
          b.vx += n.nx * 3;
          b.vz += n.nz * 3;
        }
        if (b.ds > 0 && a.an <= 0) {
          a.vx -= n.nx * 3;
          a.vz -= n.nz * 3;
        }
        a.lh = b.i;
        b.lh = a.i;
        a.lt = b.lt = s.t;
        if (vn > 1.5) this.emit('bump', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, f: vn, a: a.i, b: b.i });
      }
    }
    for (const p of s.p) {
      if (!p.on || p.fall > 0 || Math.hypot(p.x, p.z) <= s.R + 0.15) continue;
      p.fall = T.fallT;
      p.lv--;
      p.fl++;
      const by = p.lh >= 0 && s.t - p.lt < 3 ? p.lh : -1;
      if (by >= 0) s.p[by].ko++;
      this.emit('fall', { i: p.i, by, x: p.x, z: p.z, lv: p.lv });
    }
    if (s.t > T.cap) this.finish();
  }
}

export class TrombadaBot extends BotBase {
  think(h, fresh) {
    const me = this.me, s = this.sim.s, o = this.out;
    if (me.fall > 0) return;
    const md = Math.hypot(me.x, me.z);
    const foes = this.others().filter((p) => p.fall <= 0);
    // perigo: perto da borda → volta para o centro (os fáceis percebem tarde)
    if (md > s.R - this.lv(0.7, 1.5, 2.0)) {
      this.go(0, 0, 0);
      if (md > s.R - 0.9 && me.dc <= 0 && this.k > 0 && Math.hypot(me.vx, me.vz) > 2 && me.vx * me.x + me.vz * me.z > 0) o.a = true;
      return;
    }
    if (!foes.length) return void this.go(0, 0, 1);
    if (fresh) {
      // alvo: o mais perto; o difícil prefere quem está mais na beira
      let best = null, bs = Infinity;
      for (const f of foes) {
        const sc = Math.hypot(f.x - me.x, f.z - me.z) - (this.k === 2 ? Math.hypot(f.x, f.z) * 0.8 : 0);
        if (sc < bs) {
          bs = sc;
          best = f;
        }
      }
      this.tid = best.i;
      this.err = (this.rng() - 0.5) * this.lv(1.1, 0.4, 0.1);
      const inc = foes.find((f) => f.ds > 0 && Math.hypot(f.x - me.x, f.z - me.z) < 2.6 && (me.x - f.x) * f.vx + (me.z - f.z) * f.vz > 0);
      if (inc && me.ac <= 0 && this.rng() < this.lv(0.03, 0.3, 0.75)) o.b = true;
    }
    const t = s.p[this.tid];
    if (!t || !t.on || t.fall > 0) return void (this.thinkT = 0);
    const td = Math.hypot(t.x, t.z) || 1;
    const ox = t.x / td, oz = t.z / td; // para fora, visto do alvo
    const dx = t.x - me.x, dz = t.z - me.z, d = Math.hypot(dx, dz) || 1;
    const align = (dx / d) * ox + (dz / d) * oz;
    if (this.k > 0 && align < 0.3 && d > 1.8) this.go(t.x - ox * 1.9, t.z - oz * 1.9, 0.2); // dá a volta para empurrar para fora
    else this.go(t.x, t.z, 0);
    const c = Math.cos(this.err), sn = Math.sin(this.err);
    [o.x, o.z] = [o.x * c - o.z * sn, o.x * sn + o.z * c];
    if (me.dc <= 0 && d < this.lv(3.4, 3.1, 2.9) && align > this.lv(-1, 0.1, 0.4)) {
      const safe = md + 2.4 < s.R || o.x * me.x + o.z * me.z < 0.3 * md;
      if (safe || this.k === 0) o.a = true;
    }
  }
}
