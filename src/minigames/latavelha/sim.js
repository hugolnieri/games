import { SimBase, BotBase, separate, pushOutBox } from '../shared/SimBase.js';
import { wrapAngle } from '../../engine/math.js';

export const K = {
  half: 8, r: 0.72, speed: 4.7, turn: 8, lives: 4, time: 100, reload: 1.7, bulletV: 9, bulletR: 0.26, bulletLife: 1.45,
  mineR: 1.05, mineFuse: 0.5, blast: 1.9, mineCd: 7, fieldEvery: 6, fieldArm: 1.5, ownArm: 1.0, maxField: 4, turret: 3.4,
};
/** Coberturas: caixas [x0, z0, x1, z1]. */
export const BLOCKS = [
  [-1.1, -1.1, 1.1, 1.1], [-5.2, -4.4, -2.8, -3.2], [2.8, -4.4, 5.2, -3.2], [-5.2, 3.2, -2.8, 4.4], [2.8, 3.2, 5.2, 4.4], [-7.3, -1, -5.5, 1], [5.5, -1, 7.3, 1], [-1, 5.5, 1, 7.3], [-1, -7.3, 1, -5.5],
];
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const inBlock = (x, z, pad = 0) => BLOCKS.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
/** Linha de visão livre entre dois pontos (amostrada). */
export function los(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
  for (let i = 1; i < n; i++) if (inBlock(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, 0.2)) return false;
  return true;
}

/**
 * Lata-Velha: tanques de sucata, coberturas, tiros e minas. A torre mira sozinha no inimigo
 * visível mais próximo (p.ta); o jogador cuida de posição, hora do tiro e de desviar.
 * Objetos: 'b' tiro { vx, vz, own, life } · 'm' mina { w armando, fz pavio, own (-1 = da arena), age }.
 */
export class LataVelhaSim extends SimBase {
  constructor(o) {
    super({ ...o, time: K.time });
    const s = this.s;
    s.mt = 4;
    const C = [[-6.3, 6.3], [6.3, -6.3], [6.3, 6.3], [-6.3, -6.3]];
    for (let i = 0; i < this.n; i++) {
      const [x, z] = C[i];
      s.p.push(this.player(i, { x, z, d: Math.atan2(-z, -x), ta: Math.atan2(-z, -x), lv: K.lives, rl: 0.6, mc: 2, kx: 0, kz: 0, ht: 0 }));
    }
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
  damage(p, by, nx, nz) {
    if (!p.on || p.inv > 0) return;
    p.lv--;
    p.inv = 1.8;
    p.kx = nx * 7;
    p.kz = nz * 7;
    if (by >= 0 && by !== p.i) this.s.p[by].ht++;
    this.emit('hit', { i: p.i, by, x: p.x, z: p.z, lv: p.lv });
    if (p.lv <= 0) this.eliminate(p);
  }
  explode(m) {
    if (m.dead) return;
    m.dead = 1;
    this.emit('boom', { x: m.x, z: m.z });
    for (const p of this.s.p) {
      const dx = p.x - m.x, dz = p.z - m.z, d = Math.hypot(dx, dz);
      if (p.on && d < K.blast) this.damage(p, m.own, d > 0.01 ? dx / d : 1, d > 0.01 ? dz / d : 0);
    }
    for (const o of this.s.o) if (o.k === 'm' && !o.dead && o.fz <= 0 && Math.hypot(o.x - m.x, o.z - m.z) < K.blast) o.fz = 0.18;
  }

  tick(h, inputs) {
    const s = this.s;
    if (s.tl <= 0) {
      this.emit('timeUp', {});
      return this.finish();
    }
    s.mt -= h;
    if (s.mt <= 0) {
      s.mt = K.fieldEvery;
      if (s.o.filter((o) => o.k === 'm' && o.own < 0).length < K.maxField) {
        for (let k = 0; k < 14; k++) {
          const x = this.rand(-K.half + 1.5, K.half - 1.5), z = this.rand(-K.half + 1.5, K.half - 1.5);
          if (inBlock(x, z, 0.7) || s.p.some((p) => p.on && Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
          this.emit('mineWarn', this.add({ k: 'm', x, z, w: K.fieldArm, fz: 0, own: -1, age: 0 }));
          break;
        }
      }
    }
    const lim = K.half - K.r;
    for (const p of s.p) {
      if (!p.on) continue;
      const inp = inputs[p.i] || { x: 0, z: 0 };
      p.rl = Math.max(0, p.rl - h);
      p.mc = Math.max(0, p.mc - h);
      const mag = Math.hypot(inp.x, inp.z);
      if (mag > 0.2) {
        const diff = wrapAngle(Math.atan2(inp.z, inp.x) - p.d);
        p.d += Math.max(-K.turn * h, Math.min(K.turn * h, diff));
      }
      const k = 1 - Math.exp(-14 * h);
      p.vx += (inp.x * K.speed - p.vx) * k;
      p.vz += (inp.z * K.speed - p.vz) * k;
      const kd = Math.exp(-6 * h);
      p.kx *= kd;
      p.kz *= kd;
      p.x = Math.max(-lim, Math.min(lim, p.x + (p.vx + p.kx) * h));
      p.z = Math.max(-lim, Math.min(lim, p.z + (p.vz + p.kz) * h));
      for (const b of BLOCKS) pushOutBox(p, K.r, b);
      // torre: gira sozinha para o inimigo visível mais próximo (ou para a frente)
      let want = p.d, bd = Infinity;
      for (const q of s.p) {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (q !== p && q.on && d < bd && los(p.x, p.z, q.x, q.z)) {
          bd = d;
          want = Math.atan2(q.z - p.z, q.x - p.x);
        }
      }
      p.ta += Math.max(-K.turret * h, Math.min(K.turret * h, wrapAngle(want - p.ta)));
      if (p.ab > 0 && p.rl <= 0) {
        p.ab = 0;
        p.rl = K.reload;
        const cx = Math.cos(p.ta), cz = Math.sin(p.ta);
        this.add({ k: 'b', x: p.x + cx * 1.05, z: p.z + cz * 1.05, vx: cx * K.bulletV, vz: cz * K.bulletV, own: p.i, life: K.bulletLife });
        this.emit('shot', { i: p.i, x: p.x + cx, z: p.z + cz });
      }
      if (p.bb > 0 && p.mc <= 0) {
        p.bb = 0;
        p.mc = K.mineCd;
        this.emit('mineDrop', this.add({ k: 'm', x: p.x - Math.cos(p.d) * 1.2, z: p.z - Math.sin(p.d) * 1.2, w: K.ownArm, fz: 0, own: p.i, age: 0 }));
      }
    }
    for (let i = 0; i < s.p.length; i++) for (let j = i + 1; j < s.p.length; j++) if (s.p[i].on && s.p[j].on) separate(s.p[i], s.p[j], K.r, K.r);
    for (const o of s.o) {
      if (o.dead) continue;
      if (o.k === 'b') {
        o.x += o.vx * h;
        o.z += o.vz * h;
        o.life -= h;
        const mine = s.o.find((m) => m.k === 'm' && !m.dead && Math.hypot(m.x - o.x, m.z - o.z) < 0.62);
        const victim = s.p.find((p) => p.on && p.i !== o.own && Math.hypot(p.x - o.x, p.z - o.z) < K.r + K.bulletR);
        if (mine) {
          o.dead = 1;
          this.explode(mine);
        } else if (victim) {
          o.dead = 1;
          if (victim.inv <= 0) this.damage(victim, o.own, o.vx / K.bulletV, o.vz / K.bulletV);
        } else if (o.life <= 0 || Math.abs(o.x) > K.half || Math.abs(o.z) > K.half || inBlock(o.x, o.z, 0.1)) {
          o.dead = 1;
          this.emit('pop', { x: o.x, z: o.z });
        }
      } else {
        o.age += h;
        if (o.w > 0) o.w -= h;
        else if (o.fz > 0) {
          if ((o.fz -= h) <= 0) this.explode(o);
        } else if (s.p.some((p) => p.on && !(p.i === o.own && o.age < 2.6) && Math.hypot(p.x - o.x, p.z - o.z) < K.mineR)) {
          o.fz = K.mineFuse;
          this.emit('mineTrig', { x: o.x, z: o.z });
        }
      }
    }
  }
}

export class LataVelhaBot extends BotBase {
  think(h, fresh) {
    const me = this.me, s = this.sim.s, o = this.out;
    const foes = this.others();
    if (!foes.length) return;
    if (fresh || !s.p[this.tid]?.on) {
      const vis = foes.filter((f) => los(me.x, me.z, f.x, f.z));
      const pool = (this.k > 0 && vis.length ? vis : foes).filter((f) => f.inv <= 0.3);
      this.tid = this.nearest(pool.length ? pool : foes).i;
      this.wantMine = this.rng() < this.lv(0, 0.25, 0.6);
    }
    const t = s.p[this.tid];
    const dist = Math.hypot(t.x - me.x, t.z - me.z);
    const see = los(me.x, me.z, t.x, t.z);
    // desvia de tiro vindo
    {
      for (const b of s.o) {
        if (b.k !== 'b' || b.own === me.i) continue;
        const rx = me.x - b.x, rz = me.z - b.z;
        const tt = (rx * b.vx + rz * b.vz) / (K.bulletV * K.bulletV);
        if (tt < 0 || tt > 0.8 || Math.hypot(me.x - b.x - b.vx * tt, me.z - b.z - b.vz * tt) > 1.2) continue;
        if (b.id % 10 < this.lv(6, 3, 0)) break; // os mais fracos nem percebem alguns tiros
        const side = rx * b.vz - rz * b.vx > 0 ? 1 : -1;
        o.x = (b.vz / K.bulletV) * side;
        o.z = (-b.vx / K.bulletV) * side;
        return;
      }
    }
    let ang = Math.atan2(t.z - me.z, t.x - me.x);
    if (see) {
      // com o alvo à vista: mantém distância e anda de lado (quem para, apanha)
      if ((this.strafeT = (this.strafeT || 0) - h) <= 0) {
        this.strafe = this.rng() < 0.5 ? 1 : -1;
        this.strafeT = 0.8 + this.rng() * 1.4;
      }
      const near = this.lv(2.5, 4.2, 5), far = this.lv(6, 7.5, 8.5);
      ang += dist < near ? Math.PI * 0.8 * this.strafe : dist > far ? 0.35 * this.strafe : (Math.PI / 2) * this.strafe;
    }
    // contorna coberturas e minas: testa desvios crescentes
    const free = (a) => {
      const px = me.x + Math.cos(a) * 1.7, pz = me.z + Math.sin(a) * 1.7;
      if (Math.abs(px) > K.half - K.r || Math.abs(pz) > K.half - K.r || inBlock(px, pz, K.r)) return false;
      return !s.o.some((m) => m.k === 'm' && Math.hypot(m.x - px, m.z - pz) < this.lv(0.9, 1.7, 2.0) && Math.hypot(m.x - me.x, m.z - me.z) > Math.hypot(m.x - px, m.z - pz));
    };
    if (!free(ang)) {
      this.sideT = (this.sideT || 0) - h;
      if (this.sideT <= 0) {
        this.side = this.rng() < 0.5 ? 1 : -1;
        this.sideT = 0.9;
      }
      for (const off of [0.7, 1.3, 1.9, -0.7, -1.3, 2.6]) {
        if (free(ang + off * this.side)) {
          ang += off * this.side;
          break;
        }
      }
    }
    o.x = Math.cos(ang);
    o.z = Math.sin(ang);
    const aimErr = Math.abs(wrapAngle(Math.atan2(t.z - me.z, t.x - me.x) - me.ta));
    this.fireT = (this.fireT || 0) - h;
    // o difícil espera o alvo estar perto ou andando na linha do tiro
    const cross = Math.abs(t.vx * Math.sin(me.ta) - t.vz * Math.cos(me.ta));
    const good = this.k < 2 || dist < 5.5 || cross < 1.6;
    if (see && me.rl <= 0 && this.fireT <= 0 && dist < this.lv(7, 9, 11) && aimErr < this.lv(0.4, 0.2, 0.1) && good) {
      o.a = true;
      this.fireT = this.lv(1.6, 0.8, 0.1) * (0.6 + this.rng() * 0.8);
    }
    if (this.wantMine && me.mc <= 0 && dist < 4.5 && fresh) o.b = true;
  }
}
