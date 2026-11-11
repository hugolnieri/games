import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat, canvasTexture, platform } from '../shared/ArenaView.js';
import { toon, withOutline } from '../../engine/toon.js';
import { LataVelhaSim, LataVelhaBot, K, BLOCKS } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

class LataVelhaView extends ArenaView {
  static rig = 'tank';

  build() {
    const floor = canvasTexture(512, (g, n) => {
      g.fillStyle = '#6c8f4a';
      g.fillRect(0, 0, n, n);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) {
        g.fillStyle = '#78a052';
        g.fillRect((x * n) / 8, (y * n) / 8, n / 8, n / 8);
      }
      g.strokeStyle = '#4f6e34';
      g.lineWidth = 6;
      g.strokeRect(20, 20, n - 40, n - 40);
    });
    this.root.add(platform({ half: [K.half, K.half], map: floor }));
    for (const [x, z, w, d] of [[0, -K.half, K.half * 2 + 0.6, 0.5], [0, K.half, K.half * 2 + 0.6, 0.5], [-K.half, 0, 0.5, K.half * 2], [K.half, 0, 0.5, K.half * 2]]) {
      this.root.add(tmesh(new THREE.BoxGeometry(w, 0.6, d), 0xfff4d6, { pos: [x, 0.3, z], outline: 1.03 }));
    }
    for (const [x0, z0, x1, z1] of BLOCKS) {
      const w = x1 - x0, d = z1 - z0;
      this.root.add(tmesh(new THREE.BoxGeometry(w, 1.25, d), 0xfff4d6, { pos: [(x0 + x1) / 2, 0.62, (z0 + z1) / 2], outline: 1.04 }));
      this.root.add(tmesh(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), 0xff4f8b, { pos: [(x0 + x1) / 2, 1.3, (z0 + z1) / 2], outline: 0 }));
    }
    // medidor de recarga no chão: disco que enche; aceso = pode atirar
    for (const av of this.av) {
      av.gauge = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32).rotateX(-Math.PI / 2), flat(av.def.team, 0.5));
      av.gaugeRim = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.36, 40).rotateX(-Math.PI / 2), flat(0xffffff, 0.8));
      this.root.add(av.gauge, av.gaugeRim);
    }
  }

  makeObj(o) {
    if (o.k === 'b') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(K.bulletR + 0.06, 12, 10), toon(this.color(o.own)));
      withOutline(m, 1.2);
      m.position.y = 0.75;
      return m;
    }
    const g = new THREE.Group();
    const body = tmesh(new THREE.CylinderGeometry(0.5, 0.58, 0.24, 14), 0x4a4470, { pos: [0, 0.12, 0], outline: 1.08 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4f5e }));
    lamp.position.y = 0.3;
    const zone = new THREE.Mesh(new THREE.RingGeometry(K.blast - 0.1, K.blast, 48).rotateX(-Math.PI / 2), flat(0xff4f5e, 0.5));
    zone.position.y = 0.05;
    g.add(body, lamp, zone);
    g.userData = { body, lamp, zone };
    return g;
  }
  syncObj(v, o, x, z) {
    v.position.x = x;
    v.position.z = z;
    if (o.k === 'b') {
      this.ctx.particles.sparks.emit({ x, y: 0.75, z, count: 1, speed: 0.3, color: this.color(o.own), size: 0.35, sizeEnd: 0, life: 0.2 });
      return;
    }
    const { body, lamp, zone } = v.userData;
    const arming = o.w > 0, fuse = o.fz > 0;
    body.material.opacity = arming ? 0.55 : 1;
    body.material.transparent = arming;
    // armando: pisca devagar; armada: luz fixa; disparada: pisca rápido e mostra o alcance
    lamp.material.color.setHex(fuse || (arming && Math.sin(this.t * 10) > 0) ? 0xffffff : arming ? 0x7a1c2a : 0xff4f5e);
    lamp.scale.setScalar(fuse ? 1.5 + Math.sin(this.t * 40) * 0.4 : 1);
    zone.visible = fuse;
    body.scale.setScalar(fuse ? 1.2 : 1);
  }

  syncPlayer(av, p, x, z) {
    av.gone = !p.on;
    av.rig.parts.turret.rotation.y = -(p.ta - p.d);
    const k = 1 - p.rl / K.reload;
    av.rig.parts.barrel.position.z = 0.82 - Math.max(0, p.rl - K.reload + 0.15) * 2.4;
    av.gauge.visible = av.gaugeRim.visible = !!p.on && !this.sim.s.fin;
    av.gauge.position.set(x, 0.04, z);
    av.gaugeRim.position.set(x, 0.045, z);
    av.gauge.scale.setScalar(Math.max(0.05, k));
    av.gauge.material.opacity = k >= 1 ? 0.55 + Math.sin(this.t * 6) * 0.15 : 0.3;
    av.gaugeRim.material.opacity = k >= 1 ? 0.9 : 0.35;
    if (av.ring) av.ring.visible = false;
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'shot':
        this.sfx('shot');
        this.puff(e.x, e.z, c, 8, 0.75);
        break;
      case 'pop':
        this.puff(e.x, e.z, 0xffffff, 6, 0.75);
        this.sfx('bounce');
        break;
      case 'mineWarn':
      case 'mineDrop':
        this.sfx('launchWarn', { bomb: true });
        break;
      case 'mineTrig':
        this.sfx('tick');
        this.sfx('launchWarn');
        break;
      case 'boom':
        this.sfx('boom');
        this.boom(e.x, e.z, 0xff4f5e, 1);
        this.shake(0.5);
        break;
      case 'hit':
        this.sfx('hit');
        this.sfx('voice', { pitch: this.players[e.i].def.voice });
        this.av[e.i].anim.trigger('hurt');
        this.float(e.x, e.z, '−1', c, 'xl', 2);
        this.shake(0.3);
        if (!this.demo) this.mg.hitstop(0.05);
        break;
      default:
    }
  }
}

export class LataVelhaMinigame extends ArenaMinigame {
  static Sim = LataVelhaSim;
  static Bot = LataVelhaBot;
  static View = LataVelhaView;
  static meta = {
    id: 'latavelha', number: '05', name: 'Lata-Velha', tagline: 'Tanques de sucata, coberturas, rolhas e minas.',
    minPlayers: 2, maxPlayers: 4, hud: { pips: K.lives },
    camera: { fitRadius: 10.2, fitRadiusPortrait: 8.4, labelRadius: 8, labelHeight: 2.6 },
    keys: [KEYS_MOVE, ['Espaço', 'atirar'], ['Shift', 'soltar mina']],
    touch: { a: 'Atirar', b: 'Mina' },
    quick: ['A torre mira sozinha em quem estiver à vista. Você escolhe a hora do tiro.', 'Disco cheio e aceso sob o tanque = canhão recarregado.', 'Mina piscando rápido vai explodir: saia do círculo.'],
    howTo: howTo({
      objective: 'Batalha de tanques de ferro-velho. Use as coberturas, acerte os outros e não pise em mina.',
      keys: [KEYS_MOVE, ['Espaço', 'atirar (a torre mira no inimigo visível mais próximo)'], ['Shift', 'soltar uma mina atrás do tanque']],
      rules: [
        'Cada tanque aguenta 4 pancadas.',
        'O tiro é lento: dá para desviar andando de lado. Paredes e coberturas param o tiro.',
        'O disco no chão mostra a recarga. Cheio e brilhando = pronto para atirar.',
        'Minas da arena surgem piscando devagar (armando). Armada, dispara quando alguém chega perto: pisca rápido, mostra o círculo de alcance e explode.',
        'Atirar numa mina faz ela explodir na hora.',
      ],
      victory: 'Vence o último tanque inteiro. Se o tempo acabar, vence quem tiver mais vida; desempate por acertos.',
    }),
  };
}
