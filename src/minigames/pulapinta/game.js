import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat } from '../shared/ArenaView.js';
import { toon } from '../../engine/toon.js';
import { PulaPintaSim, PulaPintaBot, P, cellPos } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

const NEUTRAL = new THREE.Color(0xd9d2f2);

class PulaPintaView extends ArenaView {
  static rig = 'pogo';

  build() {
    const half = (P.N * P.cell) / 2;
    this.root.add(tmesh(new THREE.BoxGeometry(half * 2 + 0.7, 0.5, half * 2 + 0.7), 0x3b2a78, { pos: [0, -0.4, 0], outline: 1.02 }));
    this.root.add(tmesh(new THREE.BoxGeometry(half * 2 - 2, 2, half * 2 - 2), 0x2a1c5a, { pos: [0, -1.6, 0], outline: 0 }));
    const geo = new THREE.BoxGeometry(P.cell - 0.14, 0.3, P.cell - 0.14);
    this.tiles = [];
    for (let cy = 0; cy < P.N; cy++) {
      for (let cx = 0; cx < P.N; cx++) {
        const m = new THREE.Mesh(geo, toon(0xd9d2f2));
        m.position.set(cellPos(cx), -0.15, cellPos(cy));
        this.root.add(m);
        this.tiles.push({ m, owner: 0, pop: 0, target: NEUTRAL.clone() });
      }
    }
    this.colors = this.players.map((p) => new THREE.Color(p.def.color));
  }

  makeObj(o) {
    const g = new THREE.Group();
    const bank = o.k === 'bank';
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.82, 32).rotateX(-Math.PI / 2), flat(bank ? 0xffd23f : 0xff4f8b, 0.9));
    mark.position.y = 0.04;
    const body = new THREE.Group();
    if (bank) {
      body.add(tmesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), 0xffd23f, { pos: [0, 0.3, 0] }));
      body.add(tmesh(new THREE.CylinderGeometry(0.35, 0.35, 0.92, 12, 1, false, 0, Math.PI), 0xffb13d, { pos: [0, 0.6, 0], rot: [0, 0, Math.PI / 2], outline: 1.08 }));
      body.add(tmesh(new THREE.BoxGeometry(0.2, 0.26, 0.1), 0xff4f8b, { pos: [0, 0.5, 0.36], outline: 0 }));
    } else {
      body.add(tmesh(new THREE.CylinderGeometry(0.34, 0.28, 0.6, 14), 0xff4f8b, { pos: [0, 0.3, 0] }));
      body.add(tmesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 14), 0xffffff, { pos: [0, 0.62, 0], outline: 0 }));
    }
    g.add(mark, body);
    g.userData = { mark, body };
    return g;
  }
  syncObj(v, o, x, z) {
    const { mark, body } = v.userData;
    v.position.set(x, 0, z);
    const arriving = o.w > 0;
    body.position.y = arriving ? 0.2 + o.w * 7 : 0.1 + Math.sin(this.t * 4) * 0.06;
    body.rotation.y = this.t * 1.6;
    // prestes a sumir: pisca
    body.visible = arriving || o.ttl > 2 || Math.floor(this.t * 8) % 2 === 0;
    mark.scale.setScalar(arriving ? 1.5 - o.w * 0.3 : 1 + Math.sin(this.t * 6) * 0.08);
    mark.material.opacity = arriving ? 0.5 + Math.sin(this.t * 14) * 0.4 : 0.85;
  }

  syncPlayer(av, p, x, z) {
    const k = p.hp > 0 ? Math.min(1, p.hp) : 0;
    av.root.position.y = Math.sin(k * Math.PI) * 1.15;
    av.shadow.scale.setScalar(1.5 - Math.sin(k * Math.PI) * 0.5);
    av.rig.parts.spring.scale.y = p.hp > 0 ? 1.15 : 0.82 + Math.abs(Math.sin(this.t * 7 + p.i)) * 0.18;
    if (av.ring) av.ring.material.color.setHex(p.cd <= 0 ? 0xffffff : 0x6a5a9a);
  }

  frame(dt) {
    const g = this.sim.s.g;
    for (let k = 0; k < this.tiles.length; k++) {
      const t = this.tiles[k];
      if (t.owner !== g[k]) {
        t.owner = g[k];
        t.target = g[k] ? this.colors[g[k] - 1] : NEUTRAL;
        t.pop = 1;
      }
      t.m.material.color.lerp(t.target, Math.min(1, dt * 14 + (dt === 0 ? 1 : 0)));
      t.pop = Math.max(0, t.pop - dt * 5);
      t.m.position.y = -0.15 + Math.sin(t.pop * Math.PI) * 0.16;
    }
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'land':
        this.sfx('boing', { pitch: 0.9 + e.i * 0.12 });
        if (e.fresh) this.ctx.particles.sparks.emit({ x: e.x, y: 0.15, z: e.z, count: 8, speed: 3.5, color: c, size: 0.3, life: 0.35, up: 1 });
        this.av[e.i].anim.trigger('bump');
        break;
      case 'blocked':
        this.sfx('wall');
        break;
      case 'stomp':
        this.sfx('pulse');
        this.av[e.i].anim.trigger('attack');
        this.ctx.fx.ring({ x: e.x, z: e.z, color: c, from: 0.6, to: P.cell * 1.6, duration: 0.3 });
        this.shake(0.2);
        break;
      case 'bankWarn':
        this.sfx('launchWarn');
        break;
      case 'bank':
        this.sfx('coin', { big: true });
        this.av[e.i].anim.trigger('super');
        this.float(e.x, e.z, `+${e.n}`, c, 'xl', 2);
        this.boom(e.x, e.z, 0xffd23f, 0.7);
        if (!this.demo && this.players[e.i].isHuman) this.hud.banner(`Cofre! +${e.n}`, { color: 0xffd23f, duration: 1.2 });
        break;
      case 'spray':
        this.sfx('pop');
        this.ctx.fx.ring({ x: e.x, z: e.z, color: c, from: 0.5, to: P.cell * 2.2, duration: 0.35 });
        break;
      case 'final':
        if (e.n > 0) this.float(e.x, e.z, `+${e.n}`, c, 'md', 2);
        break;
      default:
    }
  }
}

export class PulaPintaMinigame extends ArenaMinigame {
  static Sim = PulaPintaSim;
  static Bot = PulaPintaBot;
  static View = PulaPintaView;
  static meta = {
    id: 'pulapinta', number: '03', name: 'Pula-Pinta', tagline: 'Pinte o piso pulando e corra para o cofre.',
    minPlayers: 2, maxPlayers: 4, hud: {},
    camera: { fitRadius: 9.8, fitRadiusPortrait: 7.4, labelRadius: 7, labelHeight: 3 },
    keys: [KEYS_MOVE, ['Espaço', 'pisão']],
    touch: { a: 'Pisão', b: null },
    quick: ['Cada casa em que você cai fica da sua cor.', 'Caia no COFRE para trocar suas casas por pontos.', 'Pisão (Espaço) pinta as 4 casas vizinhas.'],
    howTo: howTo({
      objective: 'Pule de casa em casa numa mola de pogo. Onde você cai, o piso fica da sua cor. De tempos em tempos aparece um cofre: quem cair nele troca todas as suas casas por pontos.',
      keys: [KEYS_MOVE.slice(0, 1).concat('ou setas: pular para a casa ao lado'), ['Espaço', 'pisão: pinta as 4 casas vizinhas']],
      rules: [
        'Cair numa casa de outro jogador rouba a casa.',
        'O cofre dourado avisa onde vai cair. Chegou nele, suas casas viram pontos e voltam a ficar neutras.',
        'O balde de tinta pinta um quadrado 3×3 de uma vez.',
        'Não dá para pular numa casa ocupada.',
        'No fim do tempo, as casas que sobrarem pintadas valem metade.',
      ],
      victory: 'Vence quem tiver mais pontos quando o tempo acabar. Desempate: mais casas pintadas no fim, depois mais casas pintadas na partida.',
    }),
  };
}
