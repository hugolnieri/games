import * as THREE from 'three';
import { createAvatar } from '../../characters/rigs.js';
import { toon, withOutline, disposeTree } from '../../engine/toon.js';
import { damp, wrapAngle } from '../../engine/math.js';

const NO_SFX = () => {};
const CONFETTI = [0xff6b3d, 0x49d35e, 0x2fb0ff, 0xb46bff, 0xffd23f, 0xff4f8b];

/** Malha toon com contorno, em uma linha. */
export function tmesh(geo, color, { pos, rot, scale, outline = 1.05, map } = {}) {
  const m = new THREE.Mesh(geo, toon(color, map ? { map } : {}));
  if (outline) withOutline(m, outline);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  return m;
}

/** Material chapado e transparente para marcações de chão (avisos, zonas, miras). */
export const flat = (color, opacity = 0.6, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, ...extra });

/** Textura de chão em canvas: `draw(g, size)` pinta por cima de uma base. */
export function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Base das views dos minigames de arena: avatares (personagem + veículo), objetos dinâmicos
 * por id, interpolação entre passos/estados de rede, fim de partida e rótulos do HUD.
 * Subclasses: static rig; build(); makeObj(o); syncObj(v, o, x, z, dt); syncPlayer(av, p, x, z, dt);
 * onEvent(e, mg); frame(dt).
 */
export class ArenaView {
  static rig = 'board';

  constructor(ctx, sim, players, { demo = false, mg = null } = {}) {
    this.ctx = ctx;
    this.sim = sim;
    this.players = players;
    this.demo = demo;
    this.mg = mg;
    this.t = 0;
    this.root = new THREE.Group();
    ctx.scene.add(this.root);
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    sun.position.set(-6, 14, 8);
    this.root.add(new THREE.HemisphereLight(0xe2dcff, 0x5a3b8f, 1.55), sun);
    this.sfx = demo ? NO_SFX : (name, o) => ctx.audio.play(name, o);
    this.av = players.map((p) => {
      const a = createAvatar(p, this.constructor.rig);
      a.yaw = 0;
      a.ring = null;
      if (p.isHuman && !demo) {
        // anel "é você" no chão
        a.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 40).rotateX(-Math.PI / 2), flat(0xffffff, 0.85));
        a.ring.renderOrder = 2;
        this.root.add(a.ring);
      }
      this.root.add(a.root, a.shadow);
      return a;
    });
    this.objs = new Map();
    this.prev = new Map();
    this.winner = null;
    this.confettiT = 0;
    this.stamp = 0;
    this.build();
    this.sync(1, 0);
  }

  // ---------- ganchos ----------
  build() {}
  // eslint-disable-next-line no-unused-vars
  makeObj(o) {
    return null;
  }
  syncObj(v, o, x, z) {
    v.position.set(x, v.position.y, z);
  }
  // eslint-disable-next-line no-unused-vars
  syncPlayer(av, p, x, z, dt) {}
  // eslint-disable-next-line no-unused-vars
  onEvent(e, mg) {}
  // eslint-disable-next-line no-unused-vars
  frame(dt) {}

  /** Animação de queda no abismo enquanto `p.fall` conta de `total` até 0. */
  fallAnim(av, p, total, dt) {
    if (p.fall > 0) {
      const k = 1 - p.fall / total;
      av.root.position.y = -k * k * 16;
      av.root.rotation.x += dt * 5;
    } else {
      av.root.position.y = 0;
      av.root.rotation.x = 0;
    }
  }

  // ---------- utilidades de feedback ----------
  get hud() {
    return this.ctx.hud;
  }
  color(i) {
    return this.players[i]?.def.color ?? 0xffffff;
  }
  /** "Você" ou o nome do personagem. */
  who(i) {
    const p = this.players[i];
    return p.isHuman ? 'Você' : p.def.name;
  }
  boom(x, z, color = 0xffb347, size = 1) {
    const { sparks, dust } = this.ctx.particles;
    sparks.emit({ x, y: 0.5, z, count: 36 * size, speed: 9 * size, color: 0xffd23f, color2: color, size: 0.45, life: 0.5, drag: 2.5 });
    dust.emit({ x, y: 0.4, z, count: 14 * size, speed: 3, color: 0x4a3a6a, color2: 0x8a7aa8, size: 0.8, sizeEnd: 1.8, life: 0.9, drag: 2, up: 1 });
    this.ctx.fx.ring({ x, z, y: 0.15, color, from: 0.4, to: 3.2 * size, duration: 0.4 });
  }
  puff(x, z, color = 0xffffff, count = 10, y = 0.4) {
    this.ctx.particles.sparks.emit({ x, y, z, count, speed: 4, color, color2: 0xffffff, size: 0.3, life: 0.35 });
  }
  float(x, z, text, color = 0xffffff, size = 'md', y = 1.4) {
    if (!this.demo) this.hud.floatText([x, y, z], text, { color, size });
  }
  shake(a) {
    if (!this.demo) this.ctx.rig.addTrauma(a);
  }

  // ---------- interpolação ----------
  capturePrev() {
    const s = this.sim.s;
    this.prev.clear();
    for (const p of s.p) this.prev.set('p' + p.i, [p.x, p.z]);
    for (const o of s.o) this.prev.set(o.id, [o.x, o.z]);
  }
  _ip(key, o, a) {
    const q = this.prev.get(key);
    if (!q || a >= 1) return [o.x, o.z];
    // teleporte (respawn): não interpola
    if (Math.abs(o.x - q[0]) + Math.abs(o.z - q[1]) > 4) return [o.x, o.z];
    return [q[0] + (o.x - q[0]) * a, q[1] + (o.z - q[1]) * a];
  }

  handleEvents(events, mg) {
    for (const e of events) {
      if (e.type === 'end') this._onEnd(e, mg);
      else if (e.type === 'out') this._onOut(e, mg);
      else if (e.type === 'sudden') {
        this.sfx('suddenDeath');
        if (!this.demo) this.hud.banner('Morte súbita!', { color: 0xff4f8b, sub: e.sub || '' });
      } else if (e.type === 'timeUp') this.sfx('timeUp');
      this.onEvent(e, mg);
    }
  }

  _onOut(e, mg) {
    const av = this.av[e.i];
    av.anim.setMode('out');
    av.anim.trigger('hurt');
    this.sfx('eliminate');
    if (this.demo) return;
    mg.slowmo(0.4, 0.5);
    this.ctx.rig.addTrauma(0.6);
    this.hud.banner(this.players[e.i].isHuman ? 'Você foi eliminado!' : `${this.players[e.i].def.name} eliminado!`, { color: this.color(e.i), sub: `${e.pl}º lugar` });
  }

  _onEnd(e, mg) {
    const av = this.av[e.w];
    this.winner = av;
    av.anim.setMode('victory');
    this.confettiT = 3.5;
    if (this.demo) return;
    mg.slowmo(0.35, 0.6);
    const pos = av.root.position;
    this.ctx.rig.setOrbit({ center: new THREE.Vector3(pos.x, 0, pos.z), radius: 6.5, height: 3.4, speed: 0.45, lookY: 0.9, lambda: 2.2 });
    this.sfx('victory');
    this.hud.banner(this.players[e.w].isHuman ? 'Você venceu!' : `${this.players[e.w].def.name} venceu!`, { color: this.color(e.w), duration: 2.8 });
  }

  update(dt, scale, alpha) {
    this.t += dt;
    this.sync(alpha, dt * scale);
    if (this.confettiT > 0 && this.winner) {
      this.confettiT -= dt;
      const p = this.winner.root.position;
      if (Math.random() < 0.7) {
        this.ctx.particles.dust.emit({
          x: p.x + (Math.random() - 0.5) * 5, y: 5 + Math.random() * 2, z: p.z + (Math.random() - 0.5) * 5, count: 4, speed: 1.5, gravity: 3, drag: 1.2,
          color: CONFETTI[Math.floor(Math.random() * 6)], color2: 0xffffff, size: 0.22, sizeEnd: 0.18, life: 2.2,
        });
      }
    }
  }

  sync(alpha, dt) {
    const s = this.sim.s;
    for (const p of s.p) {
      const av = this.av[p.i];
      if (!av) continue;
      const [x, z] = this._ip('p' + p.i, p, alpha);
      av.root.position.x = x;
      av.root.position.z = z;
      av.shadow.position.x = x;
      av.shadow.position.z = z;
      if (av.anim.mode === 'victory') av.root.rotation.y += dt * 2.2;
      else {
        av.yaw += wrapAngle(Math.PI / 2 - p.d - av.yaw) * Math.min(1, dt * 16 + (dt === 0 ? 1 : 0));
        av.root.rotation.y = av.yaw;
      }
      // invulnerável = pisca
      av.root.visible = av.gone ? false : !(p.inv > 0 && p.on && Math.floor(this.t * 14) % 2 === 0);
      av.shadow.visible = av.root.visible && !av.gone && av.root.position.y > -0.5;
      if (av.ring) {
        av.ring.position.set(x, 0.05, z);
        av.ring.visible = !!p.on && !s.fin && av.root.position.y > -0.5;
        av.ring.material.opacity = 0.55 + Math.sin(this.t * 5) * 0.25;
      }
      if (p.stun > 0 && av.anim.hurt < 0.2) av.anim.hurt = 0.4;
      av.anim.update(dt, {});
      this.syncPlayer(av, p, x, z, dt);
    }
    this.stamp++;
    for (const o of s.o) {
      let v = this.objs.get(o.id);
      if (v === undefined) {
        v = this.makeObj(o);
        this.objs.set(o.id, v);
        if (v) this.root.add(v);
      }
      if (!v) continue;
      v.userData.stamp = this.stamp;
      const [x, z] = this._ip(o.id, o, alpha);
      this.syncObj(v, o, x, z, dt);
    }
    for (const [id, v] of this.objs) {
      if (v && v.userData.stamp === this.stamp) continue;
      if (v) {
        this.root.remove(v);
        disposeTree(v);
      }
      if (!s.o.some((o) => o.id === id)) this.objs.delete(id);
    }
    this.frame(dt);
  }

  getLabels() {
    return this.av.map((av, i) => {
      const p = av.root.position;
      return { seat: i, x: p.x, y: p.y + (this.constructor.labelY || 2.2), z: p.z, visible: av.root.position.y > -1 && !av.gone };
    });
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    disposeTree(this.root);
  }
}

/** Ilha flutuante padrão: disco (ou caixa) com borda creme e base escura. Devolve o grupo. */
export function platform({ radius = 9, half = null, color = 0x4b52c4, map = null, y = 0, rim = 0xfff4d6 }) {
  const g = new THREE.Group();
  if (half) {
    const [hx, hz] = half;
    const top = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.5, hz * 2), toon(map ? 0xffffff : color, map ? { map } : {}));
    top.position.y = y - 0.25;
    g.add(top);
    g.add(tmesh(new THREE.BoxGeometry(hx * 2 + 0.5, 0.42, hz * 2 + 0.5), rim, { pos: [0, y - 0.3, 0], outline: 1.02 }));
    g.add(tmesh(new THREE.BoxGeometry(hx * 2 - 1, 1.6, hz * 2 - 1), 0x3b2a78, { pos: [0, y - 1.2, 0], outline: 0 }));
  } else {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.5, 64), toon(map ? 0xffffff : color, map ? { map } : {}));
    top.position.y = y - 0.25;
    g.add(top);
    g.add(tmesh(new THREE.CylinderGeometry(radius + 0.28, radius + 0.28, 0.42, 64), rim, { pos: [0, y - 0.3, 0], outline: 1.02 }));
    g.add(tmesh(new THREE.CylinderGeometry(radius - 0.6, radius * 0.45, 2.2, 40), 0x3b2a78, { pos: [0, y - 1.55, 0], outline: 0 }));
  }
  return g;
}
