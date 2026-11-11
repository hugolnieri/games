import { mulberry32 } from '../../engine/math.js';

export const STEP = 1 / 60;
export const NO_INPUT = { x: 0, z: 0, a: false, b: false };

const r2 = (v) => Math.round(v * 100) / 100;
/** Cópia do estado com números arredondados (é o que trafega na rede). */
export function pack(v) {
  if (typeof v === 'number') return r2(v);
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = pack(v[k]);
    return o;
  }
  return v;
}

/**
 * Base das simulações dos minigames de arena. SEM Three.js: roda em Node (testes) e no host.
 *
 * Todo o estado mutável mora em `this.s` (JSON puro), então o estado de rede é só `pack(this.s)`:
 *   s.t tempo · s.tl tempo restante · s.lim tem limite · s.fin acabou · s.sd morte súbita
 *   s.p[i] jogadores: { x, z, d (direção, rad), on (na disputa), sc (placar), pl (colocação), ... }
 *   s.o objetos dinâmicos: { id, k (tipo), x, z, ... }
 * Entradas por jogador: { x, z (vetor de movimento no mundo, |v| ≤ 1), a, b (toques) }.
 * Regras novas entram aqui e emitem eventos; todo feedback fica na view.
 */
export class SimBase {
  constructor({ n, seed = 1, time = 0 }) {
    this.n = n;
    this.rng = mulberry32(seed);
    this.events = [];
    this.nid = 1;
    this.s = { t: 0, tl: time, lim: time > 0 ? 1 : 0, fin: 0, sd: 0, w: -1, p: [], o: [] };
  }
  get finished() {
    return !!this.s.fin;
  }
  emit(type, d) {
    this.events.push({ type, ...d });
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  /** Jogador padrão; cada sim acrescenta os seus campos. `ab`/`bb` = toque recente (buffer). */
  player(i, extra) {
    return { i, x: 0, z: 0, vx: 0, vz: 0, d: -Math.PI / 2, on: 1, sc: 0, pl: 0, out: -1, ab: 0, bb: 0, inv: 0, stun: 0, ...extra };
  }
  add(o) {
    o.id = this.nid++;
    this.s.o.push(o);
    return o;
  }
  sweep() {
    const o = this.s.o;
    if (o.some((x) => x.dead)) this.s.o = o.filter((x) => !x.dead);
  }
  rand(a, b) {
    return a + this.rng() * (b - a);
  }

  step(h, inputs) {
    const s = this.s;
    if (s.fin) return;
    s.t += h;
    if (s.lim && !s.sd) s.tl = Math.max(0, s.tl - h);
    for (const p of s.p) {
      const inp = inputs[p.i] || NO_INPUT;
      p.ab = inp.a ? 0.14 : Math.max(0, p.ab - h);
      p.bb = inp.b ? 0.14 : Math.max(0, p.bb - h);
      p.inv = Math.max(0, p.inv - h);
      p.stun = Math.max(0, p.stun - h);
    }
    this.tick(h, inputs);
    this.sweep();
  }
  // eslint-disable-next-line no-unused-vars
  tick(h, inputs) {}

  alive() {
    return this.s.p.filter((p) => p.on);
  }
  /** Tira o jogador da disputa; a colocação é a de quem sai agora. Acaba se sobrar um. */
  eliminate(p) {
    if (!p.on) return;
    p.on = 0;
    p.out = this.s.t;
    p.pl = this.alive().length + 1;
    this.emit('out', { i: p.i, pl: p.pl, x: p.x, z: p.z });
    if (this.alive().length <= 1) this.finish();
  }
  /** Critérios de ordenação (maior é melhor), do mais importante para o desempate final. */
  rankKey(p) {
    return [p.sc];
  }
  /** Ordena quem ainda está na disputa por rankKey e encerra. */
  finish() {
    const s = this.s;
    if (s.fin) return;
    const rest = this.alive().sort((a, b) => {
      const ka = this.rankKey(a), kb = this.rankKey(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return a.i - b.i;
    });
    rest.forEach((p, k) => (p.pl = k + 1));
    s.fin = 1;
    s.w = rest.length ? rest[0].i : s.p.slice().sort((a, b) => a.pl - b.pl)[0].i;
    this.emit('end', { w: s.w });
  }

  /** Colunas da tela de resultado e linha de detalhe; cada sim sobrescreve. */
  // eslint-disable-next-line no-unused-vars
  summary(p) {
    return [];
  }
  // eslint-disable-next-line no-unused-vars
  detail(p) {
    return '';
  }
  /** Número grande do painel do HUD (e texto opcional no lugar dele). */
  hudPoints(p) {
    return p.sc;
  }
  // eslint-disable-next-line no-unused-vars
  hudText(p) {
    return null;
  }

  snapshot() {
    return pack(this.s);
  }
  apply(s) {
    this.s = s;
  }
}

/** Empurra dois círculos para fora um do outro; devolve a normal (de a para b) se houve contato. */
export function separate(a, b, ra, rb, wa = 0.5) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), min = ra + rb;
  if (d >= min) return null;
  const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
  const pen = min - d;
  a.x -= nx * pen * wa;
  a.z -= nz * pen * wa;
  b.x += nx * pen * (1 - wa);
  b.z += nz * pen * (1 - wa);
  return { nx, nz };
}

/** Empurra um círculo para fora de uma caixa alinhada aos eixos [x0, z0, x1, z1]. true se tocou. */
export function pushOutBox(o, r, [x0, z0, x1, z1]) {
  const cx = Math.max(x0, Math.min(o.x, x1)), cz = Math.max(z0, Math.min(o.z, z1));
  let dx = o.x - cx, dz = o.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    o.x = cx + (dx / d) * r;
    o.z = cz + (dz / d) * r;
  } else {
    // centro dentro da caixa: sai pela face mais próxima
    const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) o.x = x0 - r;
    else if (m === rr) o.x = x1 + r;
    else if (m === t) o.z = z0 - r;
    else o.z = z1 + r;
  }
  return true;
}

/**
 * Base dos bots. A dificuldade muda só o comportamento (reação, erro, leitura do jogo);
 * a física é a mesma do humano. `think(h, fresh)` preenche `this.out`.
 */
export class BotBase {
  constructor(sim, i, difficulty = 'normal', rng = Math.random) {
    this.sim = sim;
    this.i = i;
    this.seat = i;
    this.rng = rng;
    this.k = { easy: 0, normal: 1, hard: 2 }[difficulty] ?? 1;
    this.thinkT = rng() * 0.3;
    this.out = { x: 0, z: 0, a: false, b: false };
  }
  /** Escolhe um valor por dificuldade. */
  lv(easy, normal, hard) {
    return [easy, normal, hard][this.k];
  }
  get me() {
    return this.sim.s.p[this.i];
  }
  others() {
    return this.sim.s.p.filter((p) => p.i !== this.i && p.on);
  }
  nearest(list, from = this.me) {
    let best = null, bd = Infinity;
    for (const o of list) {
      const d = Math.hypot(o.x - from.x, o.z - from.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }
  /** Anda na direção do ponto (para a `stop` de distância). */
  go(tx, tz, stop = 0.2) {
    const me = this.me;
    const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
    if (d < stop) {
      this.out.x = this.out.z = 0;
      return d;
    }
    this.out.x = dx / d;
    this.out.z = dz / d;
    return d;
  }
  update(h) {
    this.out.a = this.out.b = false;
    this.thinkT -= h;
    const fresh = this.thinkT <= 0;
    if (fresh) this.thinkT = this.lv(0.42, 0.22, 0.09) * (0.7 + this.rng() * 0.6);
    if (this.me.on) this.think(h, fresh);
    else this.out.x = this.out.z = 0;
    return this.out;
  }
  // eslint-disable-next-line no-unused-vars
  think(h, fresh) {}
}
