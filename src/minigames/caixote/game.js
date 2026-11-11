import * as THREE from 'three';
import { ArenaMinigame } from '../shared/ArenaMinigame.js';
import { ArenaView, tmesh, flat, canvasTexture, platform } from '../shared/ArenaView.js';
import { toon, withOutline } from '../../engine/toon.js';
import { CaixoteSim, CaixoteBot, C } from './sim.js';
import { KEYS_MOVE, howTo } from '../meta.js';

class CaixoteView extends ArenaView {
  static rig = 'feet';

  build() {
    const floor = canvasTexture(512, (g, n) => {
      g.fillStyle = '#e9a85c';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#dc9648' : '#f0b56c';
        g.fillRect(0, (i * n) / 8, n, n / 8 - 3);
        g.fillStyle = '#b87534';
        for (let k = 0; k < 3; k++) g.fillRect(((i * 97 + k * 190) % n), (i * n) / 8, 4, n / 8 - 3);
      }
    });
    this.root.add(platform({ half: [C.half, C.half], map: floor }));
    // mureta baixa: os caixotes quebram nela
    for (const [x, z, w, d] of [[0, -C.half, C.half * 2 + 0.6, 0.5], [0, C.half, C.half * 2 + 0.6, 0.5], [-C.half, 0, 0.5, C.half * 2], [C.half, 0, 0.5, C.half * 2]]) {
      this.root.add(tmesh(new THREE.BoxGeometry(w, 0.5, d), 0xfff4d6, { pos: [x, 0.25, z], outline: 1.03 }));
    }
    this.crateTex = canvasTexture(128, (g, n) => {
      g.fillStyle = '#d98f3d';
      g.fillRect(0, 0, n, n);
      g.strokeStyle = '#7a4416';
      g.lineWidth = 12;
      g.strokeRect(6, 6, n - 12, n - 12);
      g.beginPath();
      g.moveTo(10, 10);
      g.lineTo(n - 10, n - 10);
      g.stroke();
    });
    this.tntTex = canvasTexture(128, (g, n) => {
      g.fillStyle = '#ff4f5e';
      g.fillRect(0, 0, n, n);
      g.fillStyle = '#fff4d6';
      g.fillRect(0, 44, n, 40);
      g.fillStyle = '#1a1033';
      g.font = '900 34px sans-serif';
      g.textAlign = 'center';
      g.fillText('BUM', n / 2, 77);
    });
    // linha de mira (aparece durante a preparação do arremesso)
    for (const av of this.av) {
      av.aim = new THREE.Mesh(new THREE.PlaneGeometry(C.range, 0.5).rotateX(-Math.PI / 2).translate(C.range / 2 + 0.6, 0, 0), flat(av.def.team, 0.7));
      av.aim.position.y = 0.06;
      av.aim.visible = false;
      this.root.add(av.aim);
    }
  }

  makeObj(o) {
    const tnt = o.k === 't';
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), toon(0xffffff, { map: tnt ? this.tntTex : this.crateTex }));
    withOutline(box, 1.07);
    const mark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 28).rotateX(-Math.PI / 2), flat(tnt ? 0xff4f5e : 0xffffff, 0.8));
    g.add(box, mark);
    g.userData = { box, mark, mat: box.material };
    return g;
  }
  syncObj(v, o, x, z, dt) {
    const { box, mark, mat } = v.userData;
    let y = 0.45;
    mark.visible = o.st === 0;
    if (o.st === 0) {
      y = 0.45 + o.w * 9;
      mark.position.set(0, 0.05, 0);
      mark.scale.setScalar(1.6 - Math.min(1, o.w) * 0.6);
    } else if (o.st === 2) {
      const av = this.av[o.own];
      x = av.root.position.x;
      z = av.root.position.z;
      y = 2.05;
    } else if (o.st === 3) {
      y = 0.9;
      box.rotation.x += dt * 9;
      box.rotation.z += dt * 6;
    } else box.rotation.set(0, 0, 0);
    v.position.set(x, 0, z);
    box.position.y = y;
    // pavio aceso: pisca cada vez mais rápido
    const lit = o.fu > 0 && Math.sin(this.t * (8 + (C.fuse - o.fu) * 9)) > 0;
    mat.emissive.setHex(lit ? 0xffffff : 0);
    mat.emissiveIntensity = 0.7;
    box.scale.setScalar(o.fu > 0 && o.fu < 1 ? 1.15 : 1);
  }

  syncPlayer(av, p, x, z) {
    av.gone = !p.on;
    const speed = Math.hypot(p.vx, p.vz);
    av.rig.parts.boots.forEach((b, k) => (b.position.z = 0.06 + Math.sin(this.t * 14 + k * Math.PI) * Math.min(0.2, speed * 0.04)));
    if (p.hold || p.wu > 0) for (const arm of av.model.arms) arm.rotation.set(-2.9, 0, arm.userData.side * 0.3);
    av.aim.visible = p.wu > 0 && !!p.on;
    if (av.aim.visible) {
      av.aim.position.set(x, 0.06, z);
      av.aim.rotation.y = -p.d;
      av.aim.material.opacity = 0.35 + Math.sin(this.t * 30) * 0.3;
    }
    if (av.ring) av.ring.material.color.setHex(p.dc <= 0 ? 0xffffff : 0x6a5a9a);
  }

  onEvent(e) {
    const c = e.i >= 0 ? this.color(e.i) : 0xffffff;
    switch (e.type) {
      case 'landed':
        this.sfx('post');
        this.ctx.particles.dust.emit({ x: e.x, y: 0.2, z: e.z, count: 8, speed: 2.5, color: 0xf2d9a8, size: 0.6, sizeEnd: 1.2, life: 0.5, drag: 3 });
        break;
      case 'pick':
        this.sfx(e.tnt ? 'launchWarn' : 'ui', { bomb: true });
        break;
      case 'windup':
        this.sfx('tick');
        break;
      case 'throw':
        this.sfx('dash');
        this.av[e.i].anim.trigger('attack');
        break;
      case 'dash':
        this.sfx('dash');
        this.ctx.particles.dust.emit({ x: e.x, y: 0.2, z: e.z, count: 6, speed: 2, color: 0xffffff, size: 0.5, sizeEnd: 1, life: 0.35, drag: 3 });
        break;
      case 'break':
        this.sfx('wall');
        this.ctx.particles.dust.emit({ x: e.x, y: 0.6, z: e.z, count: 14, speed: 5, color: 0xd98f3d, color2: 0x7a4416, size: 0.4, life: 0.5, gravity: 9, drag: 1 });
        break;
      case 'boom':
        this.sfx('boom');
        this.boom(e.x, e.z, 0xff4f5e, 1.1);
        this.ctx.fx.ring({ x: e.x, z: e.z, color: 0xff4f5e, from: 0.5, to: C.blast, duration: 0.3 });
        this.shake(0.55);
        break;
      case 'hit':
        this.sfx('hit');
        this.sfx('voice', { pitch: this.players[e.i].def.voice });
        this.av[e.i].anim.trigger('hurt');
        this.float(e.x, e.z, '−1', c, 'xl', 2);
        this.puff(e.x, e.z, c, 16, 0.9);
        this.shake(0.3);
        if (!this.demo) this.mg.hitstop(0.05);
        break;
      default:
    }
  }
}

export class CaixoteMinigame extends ArenaMinigame {
  static Sim = CaixoteSim;
  static Bot = CaixoteBot;
  static View = CaixoteView;
  static meta = {
    id: 'caixote', number: '04', name: 'Caixote!', tagline: 'Pegue, mire e arremesse caixotes nos outros.',
    minPlayers: 2, maxPlayers: 4, hud: { pips: C.lives },
    camera: { fitRadius: 9.4, fitRadiusPortrait: 7.6, labelRadius: 7, labelHeight: 2.6 },
    keys: [KEYS_MOVE, ['Espaço', 'pegar / arremessar'], ['Shift', 'esquiva']],
    touch: { a: 'Pegar / Jogar', b: 'Esquiva' },
    quick: ['Espaço pega o caixote; Espaço de novo arremessa.', 'A faixa piscando no chão mostra onde o caixote vai passar: saia dela!', 'Dinamite acende ao ser pega. Jogue logo.'],
    howTo: howTo({
      objective: 'Caixotes caem do céu no galpão flutuante. Pegue um, mire com o corpo e arremesse em quem estiver na frente.',
      keys: [KEYS_MOVE, ['Espaço', 'pegar o caixote mais próximo; de novo, arremessar para onde você olha'], ['Shift', 'esquiva rápida']],
      rules: [
        'Cada um tem 3 vidas. Levar caixotada custa 1 vida e te deixa piscando (intocável) por um instante.',
        'Antes do arremesso há uma preparação: aparece uma faixa piscando no chão na cor de quem vai jogar. Dá tempo de sair da frente.',
        'A dinamite acende o pavio quando alguém pega e explode em área, inclusive em quem estiver segurando.',
        'O anel no chão marca onde o próximo caixote vai cair.',
      ],
      victory: 'Vence o último de pé. Se o tempo acabar, vence quem tiver mais vidas; desempate por acertos.',
    }),
  };
}
