import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat, canvasTexture } from '../shared/ArenaView.js';
import { toon } from '../../engine/toon.js';
import { TrombadaSim, TrombadaBot, T } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

class TrombadaView extends ArenaView {
  static rig = 'bumper';

  build() {
    const tex = canvasTexture(512, (g, n) => {
      g.fillStyle = '#8fe3ff';
      g.fillRect(0, 0, n, n);
      g.strokeStyle = '#c9f4ff';
      g.lineWidth = 10;
      for (let r = 40; r < n / 2; r += 52) {
        g.beginPath();
        g.arc(n / 2, n / 2, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = '#5bbfe8';
      g.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 6.28, r = Math.random() * n * 0.45, l = 10 + Math.random() * 40;
        g.beginPath();
        g.moveTo(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r);
        g.lineTo(n / 2 + Math.cos(a) * r + l, n / 2 + Math.sin(a) * r + l * 0.3);
        g.stroke();
      }
    });
    // disco de raio 1, escalado pelo raio atual da plataforma
    this.plat = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 64), [toon(0xeafaff), toon(0xffffff, { map: tex }), toon(0x3b2a78)]);
    top.position.y = -0.25;
    this.plat.add(top);
    this.edge = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2), flat(0xff4f8b, 0.8));
    this.edge.position.y = 0.02;
    this.plat.add(this.edge);
    this.root.add(this.plat);
    this.root.add(tmesh(new THREE.CylinderGeometry(T.Rmin - 0.4, 1.4, 3.2, 32), 0x3b2a78, { pos: [0, -2.1, 0], outline: 0 }));
    // marca até onde a plataforma ainda vai encolher
    const mark = new THREE.Mesh(new THREE.RingGeometry(T.Rmin - 0.06, T.Rmin + 0.06, 64).rotateX(-Math.PI / 2), flat(0xffffff, 0.35));
    mark.position.y = 0.03;
    this.root.add(mark);
  }

  syncPlayer(av, p, x, z, dt) {
    av.gone = !p.on;
    this.fallAnim(av, p, T.fallT, dt);
    av.rig.group.scale.y = p.an > 0 ? 0.7 : 1;
    if (av.ring) av.ring.material.color.setHex(p.dc <= 0 ? 0xffffff : 0x6a5a9a);
    if (p.ds > 0 && p.fall <= 0) this.ctx.particles.sparks.emit({ x, y: 0.3, z, count: 2, speed: 1, color: this.color(p.i), size: 0.5, sizeEnd: 0, life: 0.25, jitter: 0.3 });
  }

  frame() {
    const s = this.sim.s;
    this.plat.scale.set(s.R, 1, s.R);
    this.edge.material.opacity = s.t > T.shrinkAt ? 0.55 + Math.sin(this.t * 8) * 0.35 : 0.5;
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'dash':
        this.sfx('dash');
        this.av[e.i].anim.trigger('attack');
        break;
      case 'anchor':
        this.sfx('post');
        this.ctx.fx.ring({ x: e.x, z: e.z, color: c, from: 1.6, to: 0.8, duration: 0.25 });
        break;
      case 'bump':
        this.sfx('pod', { speed: e.f * 2 });
        this.puff((e.x), e.z, 0xffffff, Math.min(24, 6 + e.f * 2));
        this.av[e.a].anim.trigger('bump');
        this.av[e.b].anim.trigger('bump');
        if (e.f > 6) this.shake(0.25);
        break;
      case 'fall':
        this.sfx('goal');
        this.sfx('voice', { pitch: this.players[e.i].def.voice });
        this.av[e.i].anim.trigger('hurt');
        this.float(e.x * 0.85, e.z * 0.85, '−1', c, 'xl');
        if (e.by >= 0) {
          const q = this.av[e.by].root.position;
          this.float(q.x, q.z, 'NOCAUTE!', this.color(e.by));
        }
        this.shake(0.4);
        break;
      case 'respawn':
        this.ctx.fx.ring({ x: e.x, z: e.z, color: c, from: 0.3, to: 2.2, duration: 0.4 });
        break;
      default:
    }
  }
}

export class TrombadaMinigame extends ArenaMinigame {
  static Sim = TrombadaSim;
  static Bot = TrombadaBot;
  static View = TrombadaView;
  static meta = {
    id: 'trombada', number: '02', name: 'Trombada', tagline: 'Bate-bate no gelo: empurre todo mundo para fora.',
    minPlayers: 2, maxPlayers: 4, hud: { pips: T.lives },
    camera: { fitRadius: 9.4, fitRadiusPortrait: 8.6, labelRadius: 8, labelHeight: 2.4 },
    keys: [KEYS_MOVE, ['Espaço', 'arrancada'], ['Shift', 'firmar o pé']],
    touch: { a: 'Arrancar', b: 'Firmar' },
    quick: ['Arrancada (Espaço) empurra quem estiver na frente.', 'Firmar (Shift) segura a pancada por um instante.', 'Caiu, perde 1 vida. A plataforma encolhe!'],
    howTo: howTo({
      objective: 'Uma plataforma lisa suspensa no céu, quatro carrinhos bate-bate. Empurre os outros para fora antes que empurrem você.',
      keys: [KEYS_MOVE, ['Espaço', 'arrancada na direção em que você aponta'], ['Shift', 'firmar o pé e aguentar a pancada']],
      rules: [
        'Cada um começa com 3 vidas. Cair no abismo custa 1 vida.',
        'A arrancada dá um tranco forte em quem estiver na frente, mas te deixa sem freio perto da borda.',
        'Firmar o pé quase anula um empurrão, só que você fica parado por um instante.',
        'Depois de alguns segundos a plataforma começa a encolher.',
      ],
      victory: 'Vence o último que sobrar na plataforma. Se o tempo acabar, a plataforma encolhe de vez (morte súbita). Desempate: mais vidas, depois mais nocautes.',
    }),
  };
}
