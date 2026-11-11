import { SimBase, BotBase, separate } from '../shared/SimBase.js';

export const M = {
  xmax: 8, z0: 4.4, z1: 7.4, r: 0.6, speed: 6.6, cd: 0.5, dartV: 17, time: 60, dashV: 15, dashT: 0.16, dashCd: 1.5, edge: 10.5,
  lanes: [{ z: -6.2, r: 0.5, v: 3, sp: 4.3, dir: 1 }, { z: -3.5, r: 0.66, v: 2, sp: 3.1, dir: -1 }, { z: -0.8, r: 0.86, v: 1, sp: 2.2, dir: 1 }],
};

/**
 * Mira Certa: alvos desfilam em três esteiras; quanto mais longe e menor, mais vale.
 * Objetos: 'tg' alvo { v valor (−2 = bomba, 5 = dourado), r, vx, ln } · 'd' dardo { own }.
 */
export class MiraCertaSim extends SimBase {
  constructor(o) {
    super({ ...o, time: M.time });
    const s = this.s;
    s.lt = [0.2, 0.8, 0.5];
    for (let i = 0; i < this.n; i++) {
      s.p.push(this.player(i, { x: (i - (this.n - 1) / 2) * 3.4, z: 6, cd: 0.4, sh: 0, ht: 0, dc: 0, ds: 0, dx: 0 }));
    }
    // já começa com alvos em cena
    for (let ln = 0; ln < 3; ln++) for (let k = 0; k < 3; k++) this.target(ln, -6 + k * 5 + ln);
  }
  rankKey(p) {
    return [p.sc, p.ht, -p.sh];
  }
  summary(p) {
    return [{ label: 'acertos', value: p.ht }, { label: 'mira', value: p.sh ? `${Math.round((p.ht / p.sh) * 100)}%` : '0%' }];
  }
  detail(p) {
    return `${p.sc} ${p.sc === 1 ? 'ponto' : 'pontos'}`;
  }
  target(ln, x) {
    const l = M.lanes[ln], q = this.rng();
    const v = q < 0.14 ? -2 : q < 0.2 && ln === 0 ? 5 : l.v;
    return this.add({ k: 'tg', ln, x: x ?? -l.dir * M.edge, z: l.z, vx: l.dir * l.sp * (v === 5 ? 1.35 : 1), v, r: v === 5 ? 0.45 : l.r });
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.tl <= 0) {
      this.emit('timeUp', {});
      return this.finish();
    }
    for (let ln = 0; ln < 3; ln++) {
      if ((s.lt[ln] -= h) <= 0) {
        this.target(ln);
        s.lt[ln] = this.rand(2.6, 4.4) / M.lanes[ln].sp;
      }
    }
    for (const p of s.p) {
      const inp = p.stun > 0 ? { x: 0, z: 0 } : inputs[p.i] || { x: 0, z: 0 };
      p.cd = Math.max(0, p.cd - h);
      p.dc = Math.max(0, p.dc - h);
      p.ds = Math.max(0, p.ds - h);
      if (p.bb > 0 && p.dc <= 0 && p.stun <= 0 && Math.abs(inp.x) > 0.2) {
        p.bb = 0;
        p.dc = M.dashCd;
        p.ds = M.dashT;
        p.dx = Math.sign(inp.x);
        this.emit('dash', { i: p.i, x: p.x, z: p.z });
      }
      const k = 1 - Math.exp(-16 * h);
      p.vx += ((p.ds > 0 ? p.dx * M.dashV : inp.x * M.speed) - p.vx) * k;
      p.vz += (inp.z * M.speed - p.vz) * k;
      p.x = Math.max(-M.xmax, Math.min(M.xmax, p.x + p.vx * h));
      p.z = Math.max(M.z0, Math.min(M.z1, p.z + p.vz * h));
      if (p.ab > 0 && p.cd <= 0 && p.stun <= 0) {
        p.ab = 0;
        p.cd = M.cd;
        p.sh++;
        this.add({ k: 'd', x: p.x, z: p.z - 0.8, own: p.i });
        this.emit('shoot', { i: p.i, x: p.x, z: p.z });
      }
    }
    for (let i = 0; i < s.p.length; i++) {
      for (let j = i + 1; j < s.p.length; j++) {
        const a = s.p[i], b = s.p[j];
        // quem está no dash empurra o outro
        if (separate(a, b, M.r, M.r, a.ds > 0 ? 0.1 : b.ds > 0 ? 0.9 : 0.5)) {
          a.x = Math.max(-M.xmax, Math.min(M.xmax, a.x));
          b.x = Math.max(-M.xmax, Math.min(M.xmax, b.x));
        }
      }
    }
    for (const o of s.o) {
      if (o.dead) continue;
      if (o.k === 'tg') {
        o.x += o.vx * h;
        if (Math.abs(o.x) > M.edge + 0.5) o.dead = 1;
        continue;
      }
      const z0 = o.z;
      o.z -= M.dartV * h;
      const t = s.o.find((g) => g.k === 'tg' && !g.dead && g.z <= z0 + g.r && g.z >= o.z - g.r && Math.abs(g.x - o.x) < g.r + 0.12);
      if (t) {
        const p = s.p[o.own];
        o.dead = t.dead = 1;
        p.sc = Math.max(0, p.sc + t.v);
        if (t.v > 0) p.ht++;
        else p.stun = 0.7;
        this.emit('pop', { i: p.i, x: t.x, z: t.z, v: t.v });
      } else if (o.z < -8.5) o.dead = 1;
    }
  }
}

export class MiraCertaBot extends BotBase {
  think(h, fresh) {
    const me = this.me, s = this.sim.s, o = this.out;
    o.x = o.z = 0;
    if (me.stun > 0) return;
    const fly = (g) => (me.z - 0.8 - g.z) / M.dartV;
    if (fresh || !s.o.some((g) => g.id === this.tid && !g.dead)) {
      let best = null, bs = 0;
      for (const g of s.o) {
        if (g.k !== 'tg') continue;
        if (g.v < 0 && this.rng() > this.lv(0.25, 0.04, 0)) continue;
        let X = g.x, tm = 0;
        for (let k = 0; k < 3; k++) {
          tm = Math.abs(X - me.x) / M.speed;
          X = g.x + g.vx * (fly(g) + tm + 0.05);
        }
        if (Math.abs(X) > M.xmax) continue;
        const sc = Math.abs(g.v) / (tm + 0.45) + this.rng() * this.lv(1.5, 0.4, 0.05);
        if (sc > bs) {
          bs = sc;
          best = g;
        }
      }
      this.tid = best ? best.id : 0;
      this.slack = this.lv(0.8, 0.42, 0.15);
    }
    const g = s.o.find((x) => x.id === this.tid);
    if (!g) return;
    const hitX = g.x + g.vx * fly(g); // onde o alvo estará quando o dardo chegar, se eu atirar agora
    const dx = hitX + g.vx * 0.08 - me.x;
    if (Math.abs(dx) > 0.12) o.x = Math.max(-1, Math.min(1, dx * 2.5));
    if (me.cd <= 0 && Math.abs(hitX - me.x) < this.slack && (this.k > 0 || fresh)) o.a = true;
  }
}
