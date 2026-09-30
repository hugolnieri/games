import * as THREE from 'three';
import { Minigame } from '../../game/Minigame.js';
import { getCharacter } from '../../characters/characters.js';
import { createCharacterModel, CharacterAnimator } from '../../characters/CharacterModel.js';
import { toon, disposeTree } from '../../engine/toon.js';

/**
 * MOLDE de minigame (não registrado). Para começar o Minigame 02:
 *   1. copie esta pasta para src/minigames/<nome>/ e renomeie a classe e o meta.id
 *   2. registre em src/minigames/index.js: MINIGAMES = [BoladaMinigame, SeuMinigame]
 * Regra de brinquedo: a cada 2s um jogador aleatório perde 1 ponto; quem zera sai; o último vence.
 * Ele existe para mostrar o contrato completo (HUD, rótulos, resultado, câmera) funcionando.
 * Num minigame de verdade, separe a regra numa simulação pura + bot + view, como em ../bolada/.
 */
export class ModeloMinigame extends Minigame {
  static meta = {
    id: 'modelo',
    number: '02',
    name: 'Modelo',
    tagline: 'Esqueleto mínimo de minigame.',
    minPlayers: 2,
    maxPlayers: 4,
    camera: { fitRadius: 8, fitRadiusPortrait: 7.5, labelRadius: 5, labelHeight: 2.6 },
    howTo: {
      objective: 'Sobreviva.',
      controls: [['A D', 'mover']],
      rules: ['Todo mundo perde pontos com o tempo.'],
      victory: 'Quem sobrar vence.',
    },
  };

  setup(config) {
    this.demo = !!config.demo;
    this.root = new THREE.Group();
    this.ctx.scene.add(this.root);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(4, 10, 6);
    this.root.add(new THREE.HemisphereLight(0xe2dcff, 0x5a3b8f, 1.6), sun);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, 48), toon(0x4b52c4));
    floor.position.y = -0.3;
    this.root.add(floor);
    const seats = [0, 1, 2, 3]; // assento = canto do painel no HUD (0 = baixo-esquerda)
    this.players = config.players.map((p, i) => {
      const def = getCharacter(p.characterId);
      const model = createCharacterModel(def);
      const a = Math.PI / 2 - (i * 2 * Math.PI) / config.players.length;
      model.root.position.set(Math.cos(a) * 5, 0, Math.sin(a) * 5);
      model.root.rotation.y = Math.atan2(-model.root.position.x, -model.root.position.z);
      this.root.add(model.root);
      return { ...p, index: i, seat: seats[i], def, model, anim: new CharacterAnimator(model), points: config.points, place: 0, outAt: -1 };
    });
    this.max = config.points;
    this.time = 0;
    this.tick = 0;
    this.running = false;
    this.endT = -1;
  }

  start() {
    this.running = true;
  }

  update(dt) {
    const alive = this.players.filter((p) => p.points > 0);
    if (this.running && this.endT < 0) {
      this.time += dt;
      this.tick += dt;
      if (this.tick >= 2) {
        this.tick = 0;
        const p = alive[Math.floor(Math.random() * alive.length)];
        p.points--;
        p.anim.trigger('hurt');
        if (p.points <= 0) {
          p.place = alive.length;
          p.outAt = this.time;
          p.model.root.visible = false;
        }
        const left = this.players.filter((q) => q.points > 0);
        if (left.length === 1) {
          left[0].place = 1;
          left[0].anim.setMode('victory');
          this.endT = 0;
        }
      }
    }
    if (this.endT >= 0) this.endT += dt;
    for (const p of this.players) p.anim.update(dt, {});
  }

  isFinished() {
    return this.endT > 2;
  }

  _state(p) {
    return {
      index: p.index, seat: p.seat, name: p.def.name, color: p.def.color, characterId: p.def.id,
      points: p.points, max: this.max, active: p.points > 0, place: p.place, isHuman: !!p.isHuman,
    };
  }

  getHud() {
    return { timeLeft: 0, hasLimit: false, suddenDeath: false, finished: this.endT >= 0, players: this.players.map((p) => this._state(p)), humanOut: false, ffwd: false };
  }

  getLabels() {
    return this.players.map((p) => {
      const pos = p.model.root.position;
      return { ...this._state(p), x: pos.x, y: pos.y + 2.35, z: pos.z, visible: p.model.root.visible };
    });
  }

  getResults() {
    return this.players
      .map((p) => ({ ...this._state(p), place: p.place || 1, eliminatedAt: p.outAt, summary: [{ label: 'segundos', value: Math.round(p.outAt < 0 ? this.time : p.outAt) }] }))
      .sort((a, b) => a.place - b.place);
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    disposeTree(this.root);
  }
}
