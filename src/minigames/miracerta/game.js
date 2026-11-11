import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, canvasTexture, platform } from '../shared/ArenaView.js';
import { toon, withOutline } from '../../engine/toon.js';
import { MiraCertaSim, MiraCertaBot, M } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

const TG = { 1: ['#2fb0ff', '1'], 2: ['#49d35e', '2'], 3: ['#ff8a3d', '3'], 5: ['#ffd23f', '5'], [-2]: ['#2a2140', '✖'] };

class MiraCertaView extends ArenaView {
  static rig = 'blaster';
  static labelY = 2.4;

  build() {
    const floor = canvasTexture(512, (g, n) => {
      g.fillStyle = '#7a4fd0';
      g.fillRect(0, 0, n, n);
      g.fillStyle = '#8a5fe0';
      for (let i = 0; i < 16; i += 2) g.fillRect((i * n) / 16, 0, n / 16, n);
    });
    const p = platform({ half: [10.6, 8.6], map: floor });
    p.position.z = -0.4;
    this.root.add(p);
    // esteiras
    M.lanes.forEach((l, i) => {
      this.root.add(tmesh(new THREE.BoxGeometry(21.2, 0.24, l.r * 2 + 0.7), [0xff4f8b, 0xff8a6b, 0xffd23f][i], { pos: [0, 0.12, l.z], outline: 1.02 }));
    });
    // balcão dos jogadores
    this.root.add(tmesh(new THREE.BoxGeometry(21.2, 0.5, 0.5), 0xfff4d6, { pos: [0, 0.25, M.z0 - 1.1], outline: 1.03 }));
    this.root.add(tmesh(new THREE.BoxGeometry(21.6, 3.2, 0.5), 0x4b2a9a, { pos: [0, 1.4, -8.6], outline: 1.02 }));
    for (const s of [-1, 1]) this.root.add(tmesh(new THREE.BoxGeometry(1, 2.6, 8.4), 0xff4f8b, { pos: [s * 10.3, 1.3, -3.6], outline: 1.03 }));
    this.tex = {};
    for (const v of [1, 2, 3, 5, -2]) {
      const [col, txt] = TG[v];
      this.tex[v] = canvasTexture(128, (g, n) => {
        g.fillStyle = col;
        g.fillRect(0, 0, n, n);
        g.strokeStyle = '#fff';
        g.lineWidth = 9;
        g.beginPath();
        g.arc(n / 2, n / 2, n * 0.34, 0, 6.3);
        g.stroke();
        g.fillStyle = v === -2 ? '#ff4f5e' : '#1a1033';
        g.font = '900 60px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(txt, n / 2, n / 2 + 4);
      });
    }
  }

  makeObj(o) {
    if (o.k === 'd') {
      const g = new THREE.Group();
      g.add(tmesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), 0xfff4d6, { rot: [Math.PI / 2, 0, 0], outline: 0 }));
      g.add(tmesh(new THREE.ConeGeometry(0.2, 0.26, 10), this.color(o.own), { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -0.42], outline: 1.2 }));
      g.position.y = 1.0;
      return g;
    }
    const g = new THREE.Group();
    const side = toon(o.v === -2 ? 0x2a2140 : 0xfff4d6);
    const face = toon(0xffffff, { map: this.tex[o.v] });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.16, 24), [side, face, face]);
    disc.rotation.x = Math.PI / 2;
    withOutline(disc, 1.08);
    disc.position.y = 0.6 + o.r;
    g.add(disc, tmesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), 0x9aa3c7, { pos: [0, 0.4, 0], outline: 0 }));
    g.userData = { disc, base: 0.6 + o.r };
    return g;
  }
  syncObj(v, o, x, z) {
    v.position.x = x;
    v.position.z = z;
    if (o.k === 'tg') {
      v.userData.disc.position.y = v.userData.base + Math.sin(this.t * 5 + o.id) * 0.07;
      if (o.v === 5) v.userData.disc.rotation.z = Math.sin(this.t * 6) * 0.3;
    }
  }

  syncPlayer(av, p) {
    av.model.tilt.rotation.z = -p.vx * 0.035;
    av.rig.parts.gun.position.z = 0.2 - Math.max(0, p.cd - M.cd + 0.12) * 2;
    if (av.ring) av.ring.material.color.setHex(p.cd <= 0 ? 0xffffff : 0x6a5a9a);
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'shoot':
        this.sfx('shot', { pitch: 1.5 });
        this.av[e.i].anim.trigger('attack');
        break;
      case 'dash':
        this.sfx('dash');
        break;
      case 'pop':
        if (e.v < 0) {
          this.sfx('boom');
          this.boom(e.x, e.z, 0xff4f5e, 0.7);
          this.av[e.i].anim.trigger('hurt');
          this.shake(0.3);
        } else {
          this.sfx('pop', { pitch: 0.8 + e.v * 0.15 });
          this.ctx.particles.sparks.emit({ x: e.x, y: 1.3, z: e.z, count: 14 + e.v * 4, speed: 6, color: c, color2: 0xffffff, size: 0.35, life: 0.45 });
          if (e.v >= 5) this.sfx('coin', { big: true });
        }
        this.float(e.x, e.z, e.v > 0 ? `+${e.v}` : `${e.v}`.replace('-', '−'), c, e.v >= 3 || e.v < 0 ? 'xl' : 'md', 2);
        break;
      default:
    }
  }
}

export class MiraCertaMinigame extends ArenaMinigame {
  static Sim = MiraCertaSim;
  static Bot = MiraCertaBot;
  static View = MiraCertaView;
  static meta = {
    id: 'miracerta', number: '07', name: 'Mira Certa', tagline: 'Tiro ao alvo na esteira: longe e pequeno vale mais.',
    minPlayers: 2, maxPlayers: 4, hud: {},
    camera: { fitRadius: 10.8, fitRadiusPortrait: 8.6, labelRadius: 8.5, labelHeight: 2.4 },
    keys: [KEYS_MOVE, ['Espaço', 'atirar'], ['Shift', 'tranco lateral']],
    touch: { a: 'Atirar', b: 'Tranco' },
    quick: ['O dardo sai reto para a frente: fique na linha do alvo.', 'Esteira do fundo vale 3, a do meio 2, a da frente 1. Dourado vale 5.', 'Alvo preto com ✖ é bomba: −2 e você fica tonto.'],
    howTo: howTo({
      objective: 'Barraca de tiro ao alvo. Os alvos desfilam em três esteiras; acerte o máximo que puder em 60 segundos.',
      keys: [KEYS_MOVE, ['Espaço', 'atirar um dardo para a frente'], ['Shift', 'tranco lateral (empurra quem estiver do lado)']],
      rules: [
        'O dardo voa reto. Como o alvo anda, atire um pouco antes de ele passar na sua frente.',
        'Alvos do fundo são pequenos e rápidos e valem 3; os do meio valem 2; os da frente valem 1.',
        'Alvo dourado: 5 pontos. Alvo preto: bomba, −2 pontos e um susto.',
        'O dardo para no primeiro alvo que encontrar: um alvo da frente pode proteger o de trás.',
      ],
      victory: 'Vence quem tiver mais pontos. Desempate: mais acertos, depois quem gastou menos dardos.',
    }),
  };
}
