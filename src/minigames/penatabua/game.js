import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat } from '../shared/ArenaView.js';
import { toon } from '../../engine/toon.js';
import { wrapAngle } from '../../engine/math.js';
import { PeNaTabuaSim, PeNaTabuaBot, R, TRACK, BRIDGE, PADS, OILS, pendulum, trackAt } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

/** Faixa (fita) ao longo da linha central, de meia-largura `hw`, na altura `y`. */
function ribbon(hw, y) {
  const { pts } = TRACK, n = pts.length, pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = pts[i % n], b = pts[(i + 1) % n], c = pts[(i + n - 1) % n];
    let tx = b.x - c.x, tz = b.z - c.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    pos.push(a.x + tz * hw, y, a.z - tx * hw, a.x - tz * hw, y, a.z + tx * hw);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

class PeNaTabuaView extends ArenaView {
  static rig = 'kart';

  build() {
    for (const av of this.av) av.root.scale.setScalar(1.25); // karts um pouco maiores que a colisão: leitura
    const road = new THREE.Mesh(ribbon(R.hw, 0), toon(0x5a4f9a, { side: THREE.DoubleSide }));
    const under = new THREE.Mesh(ribbon(R.hw + 0.3, -0.12), toon(0x2a1c5a, { side: THREE.DoubleSide }));
    this.root.add(road, under);
    // zebras nas bordas (grade) e faixa tracejada no meio, tudo instanciado
    const { L } = TRACK;
    const curbGeo = new THREE.BoxGeometry(0.62, 0.34, 0.3), dashGeo = new THREE.BoxGeometry(0.7, 0.02, 0.12);
    const curbs = [[], []], dashes = [];
    const onBridgeMouth = (x, z) => {
      const u = ((x - BRIDGE.ax) * (BRIDGE.bx - BRIDGE.ax) + (z - BRIDGE.az) * (BRIDGE.bz - BRIDGE.az)) / (BRIDGE.len * BRIDGE.len);
      const w = Math.abs((x - BRIDGE.ax) * (BRIDGE.bz - BRIDGE.az) - (z - BRIDGE.az) * (BRIDGE.bx - BRIDGE.ax)) / BRIDGE.len;
      return u > -0.05 && u < 1.05 && w < R.bw + 0.45;
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (let s = 0; s < L; s += 0.66, k++) {
      const p = trackAt(s);
      q.setFromAxisAngle(up, -Math.atan2(p.tz, p.tx));
      for (const side of [-1, 1]) {
        const x = p.x - p.tz * side * (R.hw + 0.12), z = p.z + p.tx * side * (R.hw + 0.12);
        if (onBridgeMouth(x, z)) continue;
        curbs[k % 2].push(m4.compose(new THREE.Vector3(x, 0.14, z), q, one).clone());
      }
      if (k % 3 === 0) dashes.push(m4.compose(new THREE.Vector3(p.x, 0.02, p.z), q, one).clone());
    }
    const inst = (geo, mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      this.root.add(im);
    };
    inst(curbGeo, toon(0xff4f8b), curbs[0]);
    inst(curbGeo, toon(0xfff4d6), curbs[1]);
    inst(dashGeo, flat(0xffffff, 0.5), dashes);
    // linha de chegada
    const st = trackAt(0);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.7, R.hw * 2).rotateX(-Math.PI / 2), flat(0xffffff, 0.95));
    line.position.set(st.x, 0.03, st.z);
    line.rotation.y = -Math.atan2(st.tz, st.tx);
    this.root.add(line);
    const arch = tmesh(new THREE.TorusGeometry(R.hw + 0.3, 0.14, 8, 20, Math.PI), 0xffd23f, { pos: [st.x, 0, st.z], outline: 0 });
    arch.rotation.y = -Math.atan2(st.tz, st.tx) + Math.PI / 2;
    this.root.add(arch);
    // ponte do atalho + pêndulo
    const bridge = tmesh(new THREE.BoxGeometry(R.bw * 2, 0.16, BRIDGE.len), 0xd98f3d, { pos: [BRIDGE.mx, -0.07, BRIDGE.mz], outline: 1.03 });
    bridge.rotation.y = Math.atan2(BRIDGE.bx - BRIDGE.ax, BRIDGE.bz - BRIDGE.az);
    this.root.add(bridge);
    this.pen = new THREE.Group();
    this.pen.add(tmesh(new THREE.SphereGeometry(R.penR, 16, 12), 0xff4f5e, { pos: [0, 0.6, 0], outline: 1.1 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.pen.add(tmesh(new THREE.ConeGeometry(0.14, 0.34, 6), 0xfff4d6, { pos: [Math.cos(a) * 0.62, 0.6, Math.sin(a) * 0.62], rot: [0, 0, 0], outline: 0 }));
    }
    this.pen.add(tmesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), 0x9aa3c7, { pos: [0, 2.3, 0], outline: 0 }));
    this.penRail = new THREE.Mesh(new THREE.PlaneGeometry(R.penAmp * 2 + 1, 0.16).rotateX(-Math.PI / 2), flat(0xff4f5e, 0.5));
    this.penRail.position.set(BRIDGE.mx, 0.03, BRIDGE.mz);
    this.root.add(this.pen, this.penRail);
    // turbos e manchas de óleo
    this.pads = PADS.map((p) => {
      const q2 = trackAt(p.s);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.95, 3).rotateX(-Math.PI / 2), flat(0xffd23f, 0.9));
      m.position.set(p.x, 0.035, p.z);
      m.rotation.y = -Math.atan2(q2.tz, q2.tx);
      this.root.add(m);
      return m;
    });
    for (const o of OILS) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20).rotateX(-Math.PI / 2), flat(0x1a1033, 0.85));
      m.position.set(o.x, 0.03, o.z);
      m.scale.set(1, 1, 0.75);
      this.root.add(m);
    }
  }

  syncPlayer(av, p, x, z, dt) {
    this.fallAnim(av, p, R.fallT, dt);
    const { wheels, flame } = av.rig.parts;
    for (const w of wheels) w.rotation.x += p.sp * dt * 4;
    flame.visible = p.bt > 0;
    flame.scale.setScalar(0.8 + Math.random() * 0.5);
    av.root.rotation.z = p.sk > 0 ? Math.sin(this.t * 30) * 0.2 : 0;
    av.lean = (av.lean || 0) * 0.85 + wrapAngle(Math.PI / 2 - p.d - av.yaw) * 0.6;
    av.model.tilt.rotation.z = av.lean;
    if (p.sk > 0) av.yaw += dt * 14;
    if (av.ring) av.ring.material.color.setHex(p.tb >= 1 ? 0xffd23f : 0x6a5a9a);
    if (p.bt > 0 && p.fall <= 0) this.ctx.particles.sparks.emit({ x, y: 0.3, z, count: 2, speed: 1, color: 0xffd23f, color2: 0xff6b3d, size: 0.5, sizeEnd: 0, life: 0.25, jitter: 0.2 });
  }

  frame() {
    const p = pendulum(this.sim.s.t);
    this.pen.position.set(p.x, 0, p.z);
    this.pads.forEach((m, i) => (m.material.opacity = 0.6 + Math.sin(this.t * 8 + i) * 0.3));
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    const mine = e.i >= 0 && this.players[e.i].isHuman;
    switch (e.type) {
      case 'pad':
      case 'turbo':
        this.sfx('dash');
        if (mine) this.sfx('super');
        break;
      case 'oil':
        this.sfx('wall');
        this.float(e.x, e.z, 'Óleo!', 0xffffff, 'md');
        break;
      case 'whack':
        this.sfx('hit');
        this.boom(e.x, e.z, 0xff4f5e, 0.6);
        this.shake(0.3);
        break;
      case 'fall':
        this.sfx('goal');
        this.av[e.i].anim.trigger('hurt');
        break;
      case 'lap':
        this.sfx('post');
        this.float(e.x, e.z, e.lap === R.laps ? 'Última volta!' : `Volta ${e.lap}`, c, 'md', 2);
        break;
      case 'finish':
        this.sfx('coin', { big: true });
        this.float(e.x, e.z, `${e.pl}º!`, c, 'xl', 2);
        if (e.pl === 1 && !this.demo) this.hud.banner(`${this.who(e.i)} cruzou a linha!`, { color: c, sub: 'Os outros têm 15 segundos' });
        break;
      default:
    }
  }
}

export class PeNaTabuaMinigame extends ArenaMinigame {
  static Sim = PeNaTabuaSim;
  static Bot = PeNaTabuaBot;
  static View = PeNaTabuaView;
  static meta = {
    id: 'penatabua', number: '06', name: 'Pé na Tábua', tagline: 'Corrida de rolimã: 5 voltas, turbo e um atalho traiçoeiro.',
    minPlayers: 2, maxPlayers: 4, hud: {},
    camera: { fitRadius: 10.6, fitRadiusPortrait: 10, labelRadius: 9, labelHeight: 2.2 },
    keys: [KEYS_MOVE, ['Espaço', 'turbo']],
    touch: { a: 'Turbo', b: null },
    quick: ['Aponte para onde quer ir: o kart acelera sozinho.', 'Setas amarelas no chão dão impulso. Espaço solta o turbo quando o anel fica amarelo.', 'A ponte de madeira corta caminho, mas não tem grade e tem um pêndulo.'],
    howTo: howTo({
      objective: 'Corrida de carrinhos de rolimã num circuito compacto suspenso. São 5 voltas.',
      keys: [KEYS_MOVE.slice(0, 1).concat('ou setas: apontar a direção (o kart acelera sozinho)'), ['Espaço', 'turbo (recarrega em 7 segundos)']],
      rules: [
        'Encostar na zebra da pista freia o kart.',
        'Triângulos amarelos no chão são zonas de impulso. Manchas escuras são óleo: você roda e perde o controle por um instante.',
        'Atalho arriscado: a ponte de madeira pula a curva em U. Ela é estreita, não tem grade e um pêndulo passa por ela. Caiu ou levou a pancada, perde um tempão.',
        'Quando o primeiro cruza a linha, os outros têm 15 segundos para terminar.',
      ],
      victory: 'Vence quem completar as 5 voltas primeiro. Quem não terminar é ordenado pela distância percorrida.',
    }),
  };
}
