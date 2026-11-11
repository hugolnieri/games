import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat, canvasTexture, platform } from '../shared/ArenaView.js';
import { PegaFichaSim, PegaFichaBot, F, barAngle } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

class PegaFichaView extends ArenaView {
  static rig = 'board';

  build() {
    const floor = canvasTexture(512, (g, n) => {
      const cols = ['#ff8a6b', '#ffb13d'];
      for (let i = 0; i < 16; i++) {
        g.fillStyle = cols[i % 2];
        g.beginPath();
        g.moveTo(n / 2, n / 2);
        g.arc(n / 2, n / 2, n, (i / 16) * 6.2832, ((i + 1) / 16) * 6.2832);
        g.fill();
      }
      g.fillStyle = '#fff4d6';
      g.beginPath();
      g.arc(n / 2, n / 2, n * 0.09, 0, 6.3);
      g.fill();
    });
    this.root.add(platform({ radius: F.R, map: floor }));
    this.root.add(tmesh(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 20), 0x4b2a9a, { pos: [0, 0.5, 0] }));
    this.root.add(tmesh(new THREE.SphereGeometry(0.5, 14, 10), 0xffd23f, { pos: [0, 1.25, 0] }));
    // barras giratórias: baixas, dá para pular por cima
    const len = F.barOut - F.barIn;
    this.bars = F.bars.map((b, i) => {
      const g = new THREE.Group();
      g.add(tmesh(new THREE.BoxGeometry(len, 0.4, F.barHalf * 2 + 0.1), i ? 0x2fb0ff : 0xff4f8b, { pos: [F.barIn + len / 2, 0.36, 0], outline: 1.04 }));
      for (let k = 0; k < 5; k++) g.add(tmesh(new THREE.BoxGeometry(0.5, 0.42, F.barHalf * 2 + 0.14), 0xfff4d6, { pos: [F.barIn + 0.8 + k * (len / 5), 0.36, 0], outline: 0 }));
      this.root.add(g);
      return g;
    });
  }

  makeObj(o) {
    if (o.k === 'f') {
      const big = o.v > 1;
      const m = tmesh(new THREE.CylinderGeometry(big ? 0.42 : 0.32, big ? 0.42 : 0.32, 0.1, 16), big ? 0xff4f8b : 0xffd23f, { rot: [Math.PI / 2, 0, 0], outline: 1.14 });
      m.position.y = 0.55;
      return m;
    }
    const g = new THREE.Group();
    const zone = new THREE.Mesh(new THREE.RingGeometry(F.slamR - 0.14, F.slamR, 48).rotateX(-Math.PI / 2), flat(0xff4f5e, 0.9));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(F.slamR, 40).rotateX(-Math.PI / 2), flat(0xff4f5e, 0.35));
    zone.position.y = 0.05;
    fill.position.y = 0.04;
    const mallet = new THREE.Group();
    mallet.add(tmesh(new THREE.CylinderGeometry(F.slamR * 0.8, F.slamR * 0.8, 1.2, 20), 0x9aa3c7, { pos: [0, 0.6, 0], outline: 1.04 }));
    mallet.add(tmesh(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), 0xd98f3d, { pos: [0, 3.6, 0], outline: 0 }));
    g.add(zone, fill, mallet);
    g.userData = { fill, mallet };
    return g;
  }
  syncObj(v, o, x, z, dt) {
    v.position.x = x;
    v.position.z = z;
    if (o.k === 'f') {
      v.rotation.y += dt * 4;
      v.position.y = 0.55 + Math.sin(this.t * 4 + o.id) * 0.08;
      return;
    }
    const k = 1 - Math.max(0, o.w) / F.slamWarn;
    v.userData.fill.scale.setScalar(Math.max(0.05, k));
    v.userData.fill.material.opacity = 0.3 + Math.sin(this.t * (10 + k * 30)) * 0.15;
    v.userData.mallet.position.y = 0.1 + (1 - k * k * k) * 14;
  }

  syncPlayer(av, p) {
    const k = p.ju > 0 ? 1 - p.ju / F.jumpT : 0;
    av.root.position.y = Math.sin(k * Math.PI) * 1.5;
    av.rig.parts.jet.material.opacity = p.ju > 0 ? 0.9 : 0.5;
    av.shadow.scale.setScalar(1.7 - Math.sin(k * Math.PI) * 0.6);
    if (av.ring) av.ring.material.color.setHex(p.dc <= 0 ? 0xffffff : 0x6a5a9a);
  }

  frame() {
    this.bars.forEach((g, k) => (g.rotation.y = -barAngle(k, this.sim.s.t)));
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'jump':
        this.sfx('boing', { pitch: 1.2 });
        break;
      case 'dash':
        this.sfx('dash');
        break;
      case 'coin':
        this.sfx('coin', { big: e.v > 1 });
        this.ctx.particles.sparks.emit({ x: e.x, y: 0.6, z: e.z, count: 8, speed: 3, color: e.v > 1 ? 0xff4f8b : 0xffd23f, size: 0.28, life: 0.35, up: 1 });
        if (e.v > 1) this.float(e.x, e.z, `+${e.v}`, c, 'md');
        break;
      case 'slamWarn':
        this.sfx('launchWarn', { bomb: true });
        break;
      case 'slam':
        this.sfx('boom');
        this.ctx.particles.dust.emit({ x: e.x, y: 0.3, z: e.z, count: 22, speed: 5, color: 0xfff4d6, size: 0.7, sizeEnd: 1.6, life: 0.6, drag: 3 });
        this.ctx.fx.ring({ x: e.x, z: e.z, color: 0xffffff, from: 0.5, to: F.slamR + 0.6, duration: 0.3 });
        this.shake(0.45);
        break;
      case 'hurt':
        this.sfx('hit');
        this.sfx('voice', { pitch: this.players[e.i].def.voice });
        this.av[e.i].anim.trigger('hurt');
        if (e.n) this.float(e.x, e.z, `−${e.n}`, c, 'xl', 2);
        this.shake(0.25);
        break;
      default:
    }
  }
}

export class PegaFichaMinigame extends ArenaMinigame {
  static Sim = PegaFichaSim;
  static Bot = PegaFichaBot;
  static View = PegaFichaView;
  static meta = {
    id: 'pegaficha', number: '08', name: 'Pega-Ficha', tagline: 'Junte fichas pulando as barras e fugindo da marreta.',
    minPlayers: 2, maxPlayers: 4, hud: {},
    camera: { fitRadius: 9.4, fitRadiusPortrait: 8.6, labelRadius: 8, labelHeight: 3 },
    keys: [KEYS_MOVE, ['Espaço', 'pular'], ['Shift', 'arrancada']],
    touch: { a: 'Pular', b: 'Arrancar' },
    quick: ['Encoste nas fichas para pegar. Rosa vale 3.', 'Pule (Espaço) por cima das barras que giram.', 'Círculo vermelho no chão = marreta caindo. Saia de dentro!'],
    howTo: howTo({
      objective: 'Um carrossel de fliperama cheio de fichas. Pegue o máximo que der em 60 segundos sem levar pancada.',
      keys: [KEYS_MOVE, ['Espaço', 'pular (passa por cima das barras)'], ['Shift', 'arrancada curta']],
      rules: [
        'Ficha dourada vale 1, ficha rosa vale 3.',
        'Duas barras giram em sentidos opostos e aceleram com o tempo. Pule por cima.',
        'A marreta avisa com um círculo vermelho que vai enchendo. Quando encher, ela desce: pular não salva.',
        'Levou pancada: fica tonto e derruba até 3 fichas no chão, que qualquer um pode pegar.',
      ],
      victory: 'Vence quem tiver mais fichas no fim. Desempate: quem levou menos pancadas.',
    }),
  };
}
