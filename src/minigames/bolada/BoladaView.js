import * as THREE from 'three';
import { BOLADA as C, SEAT_ANGLES } from './config.js';
import { BoladaArena } from './BoladaArena.js';
import { createCharacterModel, CharacterAnimator } from '../../characters/CharacterModel.js';
import { toon, withOutline, blobShadow, disposeTree } from '../../engine/toon.js';
import { lerp, wrapAngle, clamp } from '../../engine/math.js';

const R = C.arenaRadius;
const NO_SFX = () => {};
const BALL_VIS = 1.12; // bolas um pouco maiores que o raio de colisão: leitura melhor, sem mexer na física
const TRAIL_NEUTRAL = 0xe8e0ff;

function ballTexture(bomb) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (bomb) {
    g.fillStyle = '#e8263a';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#1a1033';
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(i * 32, 52);
      g.lineTo(i * 32 + 16, 52);
      g.lineTo(i * 32 + 32, 76);
      g.lineTo(i * 32 + 16, 76);
      g.fill();
    }
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 48, 256, 4);
    g.fillRect(0, 76, 256, 4);
  } else {
    g.fillStyle = '#fff4d6';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ff7a3d';
    g.fillRect(0, 50, 256, 28);
    g.fillStyle = '#ff4f8b';
    g.fillRect(0, 30, 256, 7);
    g.fillRect(0, 91, 256, 7);
    g.fillStyle = '#1a1033';
    g.beginPath();
    g.arc(64, 64, 9, 0, Math.PI * 2);
    g.arc(192, 64, 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BoladaView {
  constructor(ctx, sim, players, { demo = false } = {}) {
    this.ctx = ctx;
    this.sim = sim;
    this.players = players;
    this.demo = demo;
    this.root = new THREE.Group();
    ctx.scene.add(this.root);
    this.arena = new BoladaArena(this.root, players);
    this.sfx = demo ? NO_SFX : (name, o) => ctx.audio.play(name, o);
    this.t = 0;
    this.focus = new THREE.Vector3();
    this.winner = null;

    this.pods = [null, null, null, null];
    for (const p of players) {
      const model = createCharacterModel(p.def);
      const anim = new CharacterAnimator(model);
      const shadow = blobShadow(2.1, 0.4);
      shadow.position.y = 0.015;
      this.root.add(model.root, shadow);
      const pod = sim.pods[p.seat];
      let range = null;
      if (p.isHuman && !demo) {
        // anel de alcance do pulso: forte quando o pulso está pronto, apagado no cooldown
        range = new THREE.Mesh(
          new THREE.RingGeometry(C.pulse.radius - 0.07, C.pulse.radius, 72).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: p.def.color, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        range.renderOrder = 2;
        this.root.add(range);
      }
      this.pods[p.seat] = { player: p, model, anim, shadow, range, prevX: pod.x, prevZ: pod.z, out: null };
    }

    this.textures = { normal: ballTexture(false), bomb: ballTexture(true) };
    this.ballGeo = { normal: new THREE.SphereGeometry(C.ball.radius, 24, 16), bomb: new THREE.SphereGeometry(C.ball.bombRadius, 24, 16) };
    this.balls = new Map(); // id → view
    this.pool = { normal: [], bomb: [] };
    this.prev = new Map();
    this._tmp = new THREE.Vector3();
    this.sync(1);
  }

  // ---------- bolas ----------
  _makeBall(type) {
    const group = new THREE.Group();
    const mat = toon(0xffffff, { map: this.textures[type] });
    const body = new THREE.Mesh(this.ballGeo[type], mat);
    withOutline(body, 1.1);
    group.add(body);
    let fuse = null;
    if (type === 'bomb') {
      fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), toon(0x3a2a1a));
      fuse.position.y = C.ball.bombRadius + 0.12;
      group.add(fuse);
    }
    const shadow = blobShadow(C.ball.radius * 2.6, 0.45);
    this.root.add(group, shadow);
    return { group, body, mat, shadow, fuse, type, flying: null };
  }

  _attach(b) {
    const bv = this.pool[b.type].pop() || this._makeBall(b.type);
    bv.group.visible = bv.shadow.visible = true;
    bv.group.scale.setScalar(0.2 * BALL_VIS);
    bv.flying = null;
    bv.spawnT = 0;
    bv.lastX = b.x;
    bv.lastZ = b.z;
    bv.body.quaternion.identity();
    this.balls.set(b.id, bv);
    return bv;
  }

  _release(id) {
    const bv = this.balls.get(id);
    if (!bv) return;
    this.balls.delete(id);
    this.prev.delete(id);
    bv.group.visible = bv.shadow.visible = false;
    bv.flying = null;
    this.pool[bv.type].push(bv);
  }

  /** Guarda posições antes de cada passo fixo, para interpolar na renderização. */
  capturePrev() {
    for (const pv of this.pods) {
      if (!pv) continue;
      const pod = this.sim.pods[pv.player.seat];
      pv.prevX = pod.x;
      pv.prevZ = pod.z;
    }
    for (const b of this.sim.balls) {
      const p = this.prev.get(b.id);
      if (p) {
        p[0] = b.x;
        p[1] = b.z;
      } else this.prev.set(b.id, [b.x, b.z]);
    }
  }

  sync(alpha) {
    for (const pv of this.pods) if (pv && !pv.out) this._placePod(pv, alpha);
  }

  _placePod(pv, alpha) {
    const pod = this.sim.pods[pv.player.seat];
    const x = lerp(pv.prevX, pod.x, alpha), z = lerp(pv.prevZ, pod.z, alpha);
    const m = pv.model.root;
    m.position.set(x, 0, z);
    if (pv.anim.mode !== 'victory') m.rotation.y = Math.atan2(-x, -z);
    pv.shadow.position.set(x, 0.015, z);
    if (pv.range) {
      pv.range.position.set(x, 0.035, z);
      const ready = pod.pulseCd <= 0;
      const target = !pod.active || this.sim.finished ? 0 : ready ? 0.32 : 0.07;
      pv.range.material.opacity += (target - pv.range.material.opacity) * 0.35;
    }
    return { x, z };
  }

  // ---------- eventos da simulação → feedback ----------
  handleEvents(events, mg) {
    const { ctx } = this;
    const sparks = ctx.particles.sparks, dust = ctx.particles.dust;
    const hud = this.demo ? null : ctx.hud;
    for (const e of events) {
      switch (e.type) {
        case 'bounce': {
          if (e.kind === 'pillar') {
            this.arena.hitPillar(e.id);
            sparks.emit({ x: e.x, y: 0.6, z: e.z, count: 12, speed: 6, color: 0xffe066, color2: 0xff8fc0, size: 0.28, life: 0.35 });
            this.sfx('bumper');
            if (!this.demo) ctx.rig.addTrauma(0.05);
          } else if (e.kind === 'reactor') {
            this.arena.hitReactor();
            sparks.emit({ x: e.x, y: 0.7, z: e.z, count: 6, speed: 4, color: 0x8ff0ff, size: 0.22, life: 0.3 });
            this.sfx('bumper', { pitch: 0.7 });
          } else if (e.kind === 'pod') {
            const pv = this.pods[e.seat];
            pv?.anim.trigger('bump');
            sparks.emit({ x: e.x, y: 0.55, z: e.z, count: 8, speed: 4, color: pv ? pv.player.def.color : 0xffffff, color2: 0xffffff, size: 0.22, life: 0.3 });
            this.sfx('pod');
          } else if (e.kind === 'wall') {
            dust.emit({ x: e.x, y: 0.4, z: e.z, count: 4, speed: 1.5, color: 0xfff0d6, size: 0.35, sizeEnd: 0.6, life: 0.4, drag: 3 });
            this.sfx('wall', { speed: e.speed });
          } else if (e.kind === 'post') {
            sparks.emit({ x: e.x, y: 0.6, z: e.z, count: 6, speed: 4, color: 0xffffff, size: 0.2, life: 0.25 });
            this.sfx('post');
          } else {
            this.sfx('bounce', { speed: e.speed });
          }
          break;
        }
        case 'pulse': {
          const pv = this.pods[e.seat];
          pv.anim.trigger('attack');
          ctx.fx.ring({ x: e.x, z: e.z, color: pv.player.def.color, from: 0.9, to: C.pulse.radius + 0.35, duration: 0.2, opacity: 1 });
          ctx.fx.ring({ x: e.x, z: e.z, y: 0.6, color: 0xffffff, from: 0.6, to: C.pulse.radius * 0.8, duration: 0.14, opacity: 0.6 });
          this.sfx('pulse');
          break;
        }
        case 'pulseHit': {
          const pv = this.pods[e.seat];
          const col = pv.player.def.color;
          if (e.super) {
            sparks.emit({ x: e.x, y: 0.5, z: e.z, count: 36, speed: 11, color: 0xffffff, color2: col, size: 0.4, life: 0.5, drag: 3 });
            ctx.fx.ring({ x: e.x, z: e.z, y: 0.5, color: 0xffffff, from: 0.4, to: 3.2, duration: 0.28 });
            pv.anim.trigger('super');
            this.sfx('super');
            if (!this.demo) {
              mg.hitstop(0.07);
              ctx.rig.addTrauma(0.28);
              ctx.rig.addPunch(1.6);
              hud.floatText([e.x, 1.6, e.z], 'SUPER!', { color: col, size: 'lg' });
            }
          } else {
            sparks.emit({ x: e.x, y: 0.5, z: e.z, count: 14, speed: 6, color: col, color2: 0xffffff, size: 0.28, life: 0.35 });
            this.sfx('hit');
          }
          break;
        }
        case 'dash': {
          const pod = this.sim.pods[e.seat];
          dust.emit({ x: pod.x, y: 0.3, z: pod.z, count: 14, speed: 3, color: 0xfff0d6, size: 0.4, sizeEnd: 0.9, life: 0.45, drag: 4, jitter: 0.4 });
          this.sfx('dash');
          break;
        }
        case 'launchWarn':
          this.arena.telegraph(e.angle, e.ballType);
          this.sfx('launchWarn', { bomb: e.ballType === 'bomb' });
          break;
        case 'launch': {
          this.arena.fire();
          const c = Math.cos(e.angle), s = Math.sin(e.angle);
          sparks.emit({ x: c * 1.9, y: 0.7, z: s * 1.9, count: 16, speed: 7, dir: [c, 0.3, s], spread: 0.5, color: 0xffd23f, color2: 0xff8a3d, size: 0.3, life: 0.35 });
          dust.emit({ x: c * 1.8, y: 0.6, z: s * 1.8, count: 6, speed: 2, color: 0xe0d8ff, size: 0.5, sizeEnd: 1.1, life: 0.6, drag: 3 });
          this.sfx('launch');
          if (!this.demo) ctx.rig.addTrauma(0.06);
          break;
        }
        case 'goal':
          this._onGoal(e, mg, hud);
          break;
        case 'eliminate':
          this._onEliminate(e, mg, hud);
          break;
        case 'timeUp':
          this.sfx('timeUp');
          hud?.banner('Tempo esgotado!', { color: 0xffd23f });
          break;
        case 'suddenDeath':
          this.arena.setSuddenDeath();
          this.sfx('suddenDeath');
          if (!this.demo) {
            hud.banner('MORTE SÚBITA!', { color: 0xff3b3b, sub: 'O próximo gol elimina', duration: 2.4 });
            ctx.rig.addTrauma(0.4);
          }
          break;
        case 'ballPop': {
          const bv = this.balls.get(e.id);
          if (bv && !bv.flying) {
            const p = bv.group.position;
            sparks.emit({ x: p.x, y: p.y, z: p.z, count: 14, speed: 5, color: 0xffffff, color2: 0xffd23f, size: 0.3, life: 0.4 });
            this._release(e.id);
          }
          break;
        }
        case 'end':
          this._onEnd(e, mg, hud);
          break;
        default:
      }
    }
  }

  _onGoal(e, mg, hud) {
    const { ctx } = this;
    const pv = this.pods[e.seat];
    const col = pv.player.def.color;
    const bv = this.balls.get(e.id);
    if (bv) bv.flying = { vx: e.vx * 0.6, vy: 5, vz: e.vz * 0.6, t: 0 };
    this.arena.goalFlash(e.seat);
    this.arena.crowdCheer(0.8);
    ctx.particles.sparks.emit({ x: e.x, y: 0.7, z: e.z, count: 34, speed: 8, color: col, color2: 0xffffff, size: 0.36, life: 0.6, gravity: 8, drag: 2 });
    ctx.fx.ring({ x: e.x, z: e.z, y: 0.3, color: col, from: 0.4, to: 3.2, duration: 0.4 });
    pv.anim.trigger('hurt');
    this.sfx('goal');
    this.sfx('voice', { pitch: pv.player.def.voice });
    if (this.demo) return;
    if (pv.player.isHuman) this.sfx('goalMine');
    ctx.rig.addTrauma(e.value > 1 ? 0.5 : 0.32);
    const a = SEAT_ANGLES[e.seat];
    hud.floatText([Math.cos(a) * (R - 3.4), 0.8, Math.sin(a) * (R - 3.4)], `−${e.value}`, { color: col, size: 'xl' });
    if (e.scorer >= 0 && e.scorer !== e.seat) {
      const sv = this.pods[e.scorer];
      const pos = sv.model.root.position;
      hud.floatText([pos.x * 0.8, 1.2, pos.z * 0.8], 'BOLADA!', { color: sv.player.def.color, size: 'md' });
    }
  }

  _onEliminate(e, mg, hud) {
    const { ctx } = this;
    const pv = this.pods[e.seat];
    const pod = this.sim.pods[e.seat];
    const pos = pv.model.root.position;
    pv.out = { vx: pod.nx * 3.5, vy: 12, vz: pod.nz * 3.5, rx: 6 + Math.random() * 4, rz: (Math.random() - 0.5) * 8, t: 0 };
    pv.anim.setMode('out');
    pv.anim.trigger('hurt');
    pv.shadow.visible = false;
    pv.model.glow.visible = false;
    this.arena.sealGoal(e.seat);
    ctx.particles.sparks.emit({ x: pos.x, y: 0.6, z: pos.z, count: 60, speed: 12, color: 0xffd23f, color2: 0xff5a2a, size: 0.5, life: 0.7, drag: 2.5 });
    ctx.particles.dust.emit({ x: pos.x, y: 0.6, z: pos.z, count: 22, speed: 4, color: 0x4a3a6a, color2: 0x8a7aa8, size: 0.9, sizeEnd: 2, life: 1.2, drag: 2, up: 1 });
    ctx.fx.ring({ x: pos.x, z: pos.z, y: 0.2, color: 0xffb347, from: 0.5, to: 5, duration: 0.5 });
    const a = SEAT_ANGLES[e.seat];
    ctx.particles.dust.emit({ x: Math.cos(a) * (R + 0.4), y: 0.3, z: Math.sin(a) * (R + 0.4), count: 24, speed: 3, color: 0xd8cfff, size: 0.6, sizeEnd: 1.4, life: 0.8, jitter: 2.5, drag: 3 });
    this.sfx('eliminate');
    this.arena.crowdCheer(1);
    if (this.demo) return;
    mg.slowmo(0.3, 0.75);
    ctx.rig.addTrauma(0.8);
    ctx.rig.addPunch(3);
    const who = pv.player.isHuman ? 'Você foi eliminado!' : `${pv.player.def.name} eliminado!`;
    hud.banner(who, { color: pv.player.def.color, sub: `${e.place}º lugar` });
  }

  _onEnd(e, mg, hud) {
    const { ctx } = this;
    const pv = this.pods[e.winner];
    this.winner = pv;
    pv.anim.setMode('victory');
    this.confettiT = 3.5;
    this.arena.crowdCheer(1);
    if (this.demo) return;
    mg.slowmo(0.35, 0.6);
    const pos = pv.model.root.position;
    ctx.rig.setOrbit({ center: new THREE.Vector3(pos.x * 0.85, 0, pos.z * 0.85), radius: 6.5, height: 3.4, speed: 0.45, lookY: 0.9, lambda: 2.2 });
    this.sfx('victory');
    hud.banner(pv.player.isHuman ? 'Você venceu!' : `${pv.player.def.name} venceu!`, { color: pv.player.def.color, duration: 2.8 });
  }

  // ---------- quadro a quadro ----------
  update(dt, scale, alpha) {
    this.t += dt;
    const gdt = dt * scale;
    const sim = this.sim;
    const { sparks, dust } = this.ctx.particles;

    // pods
    let nearest = null;
    for (const pv of this.pods) {
      if (!pv) continue;
      if (pv.out) {
        this._updateOut(pv, gdt);
        continue;
      }
      const pod = sim.pods[pv.player.seat];
      const { x, z } = this._placePod(pv, alpha);
      const yaw = pv.model.root.rotation.y;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const vLocal = pod.vx * rx + pod.vz * rz;
      nearest = null;
      let best = 49;
      for (const b of sim.balls) {
        const d = (b.x - x) ** 2 + (b.z - z) ** 2;
        if (d < best) {
          best = d;
          nearest = b;
        }
      }
      const look = nearest ? wrapAngle(Math.atan2(nearest.x - x, nearest.z - z) - yaw) : null;
      if (pv.anim.mode === 'victory') pv.model.root.rotation.y += dt * 2.2;
      pv.anim.update(gdt, { vLocal, look });
      if (Math.abs(pod.v) > 6 && Math.random() < 0.35 * scale) {
        dust.emit({ x: x - pod.tx * Math.sign(pod.v) * 0.8, y: 0.15, z: z - pod.tz * Math.sign(pod.v) * 0.8, count: 1, speed: 0.6, color: 0xe8e0ff, size: 0.3, sizeEnd: 0.7, life: 0.4, drag: 3 });
      }
      if (pod.dashT > 0) {
        sparks.emit({ x, y: 0.4, z, count: 2, speed: 1, color: pv.player.def.color, size: 0.5, sizeEnd: 0, life: 0.25, jitter: 0.3 });
      }
    }

    // bolas
    const seen = new Set();
    for (const b of sim.balls) {
      if (!b.alive) continue;
      let bv = this.balls.get(b.id);
      if (!bv) bv = this._attach(b);
      if (bv.flying) continue;
      seen.add(b.id);
      const pr = this.prev.get(b.id);
      const x = pr ? lerp(pr[0], b.x, alpha) : b.x;
      const z = pr ? lerp(pr[1], b.z, alpha) : b.z;
      bv.spawnT = Math.min(1, bv.spawnT + dt * 6);
      bv.group.scale.setScalar((0.2 + 0.8 * bv.spawnT) * BALL_VIS);
      bv.group.position.set(x, b.r * BALL_VIS, z);
      bv.shadow.position.set(x, 0.016, z);
      // rolagem
      const mx = x - bv.lastX, mz = z - bv.lastZ;
      const dist = Math.hypot(mx, mz);
      if (dist > 1e-5) {
        this._tmp.set(mz / dist, 0, -mx / dist);
        bv.body.rotateOnWorldAxis(this._tmp, dist / b.r);
      }
      bv.lastX = x;
      bv.lastZ = z;
      const speed = Math.hypot(b.vx, b.vz);
      const hitCol = b.lastHitBy >= 0 && this.pods[b.lastHitBy] ? this.pods[b.lastHitBy].player.def.color : 0xfff4d6;
      // rastro: mostra a direção da bola e (pela cor) quem rebateu por último
      if (gdt > 0 && dist > 1e-3) {
        dust.emit({
          x, y: b.r * 0.9, z, count: 1, speed: 0, color: b.lastHitBy >= 0 ? hitCol : TRAIL_NEUTRAL,
          size: b.r * 1.7, sizeEnd: 0.05, life: 0.2, lifeVar: 0, alpha: 0.45, drag: 0,
        });
      }
      if (b.super > 0 || speed > 15) {
        const s = b.super > 0 ? 1 : 0.6;
        sparks.emit({ x, y: b.r, z, count: 1, speed: 0.3, color: b.super > 0 ? 0xffffff : hitCol, color2: hitCol, size: b.r * 2.1 * s, sizeEnd: 0, life: 0.22, lifeVar: 0.1 });
      }
      if (bv.fuse) {
        const blink = Math.sin(this.t * 14) > 0;
        bv.mat.emissive.setHex(blink ? 0x551111 : 0x000000);
        if (Math.random() < 0.5) sparks.emit({ x, y: b.r * 2 + 0.3, z, count: 1, speed: 2, up: 1.5, color: 0xffd23f, color2: 0xff5a2a, size: 0.18, life: 0.3 });
      }
    }
    // bolas que viraram gol: voam para fora e caem no abismo
    for (const [id, bv] of this.balls) {
      if (bv.flying) {
        const f = bv.flying;
        f.t += gdt;
        f.vy -= 22 * gdt;
        const p = bv.group.position;
        p.x += f.vx * gdt;
        p.y += f.vy * gdt;
        p.z += f.vz * gdt;
        bv.shadow.visible = false;
        bv.group.scale.setScalar(Math.max(0.1, 1 - f.t * 0.6) * BALL_VIS);
        if (f.t > 1.4) this._release(id);
      } else if (!seen.has(id)) {
        this._release(id);
      }
    }

    // confete da vitória
    if (this.confettiT > 0 && this.winner) {
      this.confettiT -= dt;
      const p = this.winner.model.root.position;
      if (Math.random() < 0.7) {
        dust.emit({
          x: p.x + (Math.random() - 0.5) * 5, y: 5 + Math.random() * 2, z: p.z + (Math.random() - 0.5) * 5, count: 4, speed: 1.5, gravity: 3, drag: 1.2,
          color: [0xff6b3d, 0x49d35e, 0x2fb0ff, 0xb46bff, 0xffd23f, 0xff4f8b][Math.floor(Math.random() * 6)], color2: 0xffffff, size: 0.22, sizeEnd: 0.18, life: 2.2, alpha: 1,
        });
      }
    }

    // foco da câmera: leve deslocamento para o centro de massa das bolas
    let fx = 0, fz = 0, n = 0;
    for (const b of sim.balls) {
      fx += b.x;
      fz += b.z;
      n++;
    }
    const k = n ? 0.06 / 1 : 0;
    this.focus.set(clamp((fx / (n || 1)) * k, -0.7, 0.7), 0, clamp((fz / (n || 1)) * k, -0.5, 0.5));

    this.arena.update(dt, sim);
  }

  _updateOut(pv, dt) {
    const o = pv.out;
    o.t += dt;
    o.vy -= 20 * dt;
    const r = pv.model.root;
    r.position.x += o.vx * dt;
    r.position.y += o.vy * dt;
    r.position.z += o.vz * dt;
    r.rotation.x += o.rx * dt;
    r.rotation.z += o.rz * dt;
    pv.anim.update(dt, {});
    if (r.position.y > -12 && Math.random() < 0.6) {
      this.ctx.particles.dust.emit({ x: r.position.x, y: r.position.y + 0.5, z: r.position.z, count: 1, speed: 0.5, color: 0x3a2a55, color2: 0x7a6a98, size: 0.6, sizeEnd: 1.4, life: 0.9, drag: 2 });
    }
    if (r.position.y < -30) r.visible = false;
  }

  /** Âncoras para os rótulos 3D do HUD (acima de cada pod). */
  getLabels() {
    const out = [];
    for (const pv of this.pods) {
      if (!pv) continue;
      const p = pv.model.root.position;
      out.push({ seat: pv.player.seat, x: p.x, y: p.y + 2.35, z: p.z, visible: !pv.out });
    }
    return out;
  }

  dispose() {
    this.arena.dispose();
    this.ctx.scene.remove(this.root);
    disposeTree(this.root);
    this.textures.normal.dispose();
    this.textures.bomb.dispose();
  }
}
