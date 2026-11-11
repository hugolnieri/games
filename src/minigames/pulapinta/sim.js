import { SimBase, BotBase } from '../shared/SimBase.js';

export const P = { N: 7, cell: 1.9, hop: 0.24, time: 75, stompCd: 5, bankFirst: 5, bankEvery: 7.5, bankWarn: 1.4, bankTtl: 9, sprayEvery: 10, sprayTtl: 8 };
export const cellPos = (c) => (c - (P.N - 1) / 2) * P.cell;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const START = [[1, P.N - 2], [P.N - 2, 1], [P.N - 2, P.N - 2], [1, 1]];

/** Pula-Pinta: pule de casa em casa pintando o piso; o cofre converte as suas casas em pontos. */
export class PulaPintaSim extends SimBase {
  constructor(o) {
    super({ ...o, time: P.time });
    const s = this.s;
    s.g = new Array(P.N * P.N).fill(0);
    s.bt = P.bankFirst;
    s.spt = P.sprayEvery * 0.6;
    for (let i = 0; i < this.n; i++) {
      const [cx, cy] = START[i];
      s.p.push(this.player(i, { cx, cy, tx: cx, ty: cy, x: cellPos(cx), z: cellPos(cy), fx: 0, fz: 0, hp: 0, cd: 1.5, bl: 0, pt: 0, bk: 0, d: Math.atan2(-cellPos(cy), -cellPos(cx)) }));
      this.paint(cx, cy, s.p[i]);
    }
  }
  own(p) {
    let n = 0;
    for (const c of this.s.g) if (c === p.i + 1) n++;
    return n;
  }
  rankKey(p) {
    return [p.sc, this.own(p), p.pt];
  }
  summary(p) {
    return [{ label: 'casas pintadas', value: p.pt }, { label: 'cofres', value: p.bk }];
  }
  detail(p) {
    return `${p.sc} ${p.sc === 1 ? 'ponto' : 'pontos'}`;
  }
  paint(cx, cy, p) {
    if (cx < 0 || cy < 0 || cx >= P.N || cy >= P.N) return false;
    const k = cy * P.N + cx;
    if (this.s.g[k] === p.i + 1) return false;
    this.s.g[k] = p.i + 1;
    p.pt++;
    return true;
  }
  occupied(cx, cy, except) {
    return this.s.p.some((q) => q !== except && ((q.cx === cx && q.cy === cy) || (q.hp > 0 && q.tx === cx && q.ty === cy)));
  }
  freeCell() {
    for (let k = 0; k < 30; k++) {
      const cx = Math.floor(this.rng() * P.N), cy = Math.floor(this.rng() * P.N);
      if (!this.occupied(cx, cy) && !this.s.o.some((o) => o.cx === cx && o.cy === cy)) return [cx, cy];
    }
    return null;
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.tl <= 0) {
      // apuração final: o que sobrou pintado vale metade
      for (const p of s.p) {
        const n = Math.floor(this.own(p) / 2);
        p.sc += n;
        this.emit('final', { i: p.i, n, x: p.x, z: p.z });
      }
      this.emit('timeUp', {});
      return this.finish();
    }
    s.bt -= h;
    if (s.bt <= 0 && s.o.filter((o) => o.k === 'bank').length < 2) {
      const c = this.freeCell();
      if (c) this.emit('bankWarn', this.add({ k: 'bank', cx: c[0], cy: c[1], x: cellPos(c[0]), z: cellPos(c[1]), w: P.bankWarn, ttl: P.bankTtl }));
      s.bt = P.bankEvery * this.rand(0.8, 1.2);
    }
    s.spt -= h;
    if (s.spt <= 0) {
      const c = this.freeCell();
      if (c && !s.o.some((o) => o.k === 'spray')) this.add({ k: 'spray', cx: c[0], cy: c[1], x: cellPos(c[0]), z: cellPos(c[1]), w: 0.8, ttl: P.sprayTtl });
      s.spt = P.sprayEvery * this.rand(0.8, 1.2);
    }
    for (const o of s.o) {
      if (o.w > 0) o.w -= h;
      else if ((o.ttl -= h) <= 0) o.dead = 1;
    }
    for (const p of s.p) {
      p.cd = Math.max(0, p.cd - h);
      p.bl = Math.max(0, p.bl - h);
      if (p.hp > 0) {
        p.hp += h / P.hop;
        const k = Math.min(1, p.hp);
        p.x = p.fx + (cellPos(p.tx) - p.fx) * k;
        p.z = p.fz + (cellPos(p.ty) - p.fz) * k;
        if (p.hp >= 1) this.land(p);
        continue;
      }
      if (p.ab > 0 && p.cd <= 0) {
        p.ab = 0;
        p.cd = P.stompCd;
        p.bl = 0.25;
        let n = 0;
        for (const [dx, dy] of DIRS) if (this.paint(p.cx + dx, p.cy + dy, p)) n++;
        this.emit('stomp', { i: p.i, x: p.x, z: p.z, n });
        continue;
      }
      const inp = inputs[p.i] || { x: 0, z: 0 };
      if (p.bl > 0 || Math.max(Math.abs(inp.x), Math.abs(inp.z)) < 0.35) continue;
      const dx = Math.abs(inp.x) > Math.abs(inp.z) ? Math.sign(inp.x) : 0, dy = dx ? 0 : Math.sign(inp.z);
      const tx = p.cx + dx, ty = p.cy + dy;
      p.d = Math.atan2(dy, dx);
      if (tx < 0 || ty < 0 || tx >= P.N || ty >= P.N || this.occupied(tx, ty, p)) {
        p.bl = 0.22;
        this.emit('blocked', { i: p.i, x: p.x, z: p.z });
        continue;
      }
      Object.assign(p, { tx, ty, fx: p.x, fz: p.z, hp: 0.001 });
      this.emit('hop', { i: p.i });
    }
  }

  land(p) {
    const s = this.s;
    Object.assign(p, { cx: p.tx, cy: p.ty, hp: 0, x: cellPos(p.tx), z: cellPos(p.ty), bl: 0.04 });
    const fresh = this.paint(p.cx, p.cy, p);
    this.emit('land', { i: p.i, x: p.x, z: p.z, fresh });
    for (const o of s.o) {
      if (o.dead || o.w > 0 || o.cx !== p.cx || o.cy !== p.cy) continue;
      o.dead = 1;
      if (o.k === 'bank') {
        const n = this.own(p);
        p.sc += n;
        p.bk++;
        for (let k = 0; k < s.g.length; k++) if (s.g[k] === p.i + 1) s.g[k] = 0;
        this.paint(p.cx, p.cy, p);
        this.emit('bank', { i: p.i, x: p.x, z: p.z, n });
      } else {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.paint(p.cx + dx, p.cy + dy, p);
        this.emit('spray', { i: p.i, x: p.x, z: p.z });
      }
    }
  }
}

export class PulaPintaBot extends BotBase {
  think(h) {
    const me = this.me, sim = this.sim, s = sim.s, o = this.out;
    o.x = o.z = 0;
    if (me.hp > 0 || me.bl > 0) return void (this.wait = this.lv(0.2, 0.07, 0));
    if ((this.wait -= h) > 0) return;
    const val = (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= P.N || cy >= P.N) return -1;
      const c = s.g[cy * P.N + cx];
      return c === 0 ? 1 : c === me.i + 1 ? 0.05 : 1.6;
    };
    let near = 0;
    for (const [dx, dy] of DIRS) if (val(me.cx + dx, me.cy + dy) > 0.5) near++;
    if (me.cd <= 0 && near >= this.lv(4, 3, 3) && this.rng() < this.lv(0.1, 0.5, 1)) return void (o.a = true);
    // objetivo: cofre (se tem casas para converter) ou spray
    const own = sim.own(me);
    let goal = null, gd = Infinity;
    for (const ob of s.o) {
      if (ob.k === 'bank' && own < this.lv(7, 4, 4)) continue;
      const d = Math.abs(ob.cx - me.cx) + Math.abs(ob.cy - me.cy);
      if (ob.w > 0 && d < 2) continue; // ainda chegando: não fica parado em cima
      if (d < gd && d * P.hop < ob.ttl + ob.w) {
        gd = d;
        goal = ob;
      }
    }
    let best = null, bs = -Infinity;
    for (const [dx, dy] of DIRS) {
      const tx = me.cx + dx, ty = me.cy + dy;
      if (val(tx, ty) < 0 || sim.occupied(tx, ty, me)) continue;
      let sc = val(tx, ty) + 0.5 * Math.max(0, val(tx + dx, ty + dy)) + 0.25 * Math.max(0, val(tx + dx * 2, ty + dy * 2)) + this.rng() * this.lv(1.6, 0.6, 0.15);
      if (goal) sc += (Math.abs(goal.cx - me.cx) + Math.abs(goal.cy - me.cy) - Math.abs(goal.cx - tx) - Math.abs(goal.cy - ty)) * this.lv(1.2, 3, 4);
      if (sc > bs) {
        bs = sc;
        best = [dx, dy];
      }
    }
    if (best) [o.x, o.z] = best;
  }
}
