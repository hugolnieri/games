import { MINIGAMES, getMinigame } from '../minigames/index.js';
import { CHARACTERS } from '../characters/characters.js';
import { shuffle } from '../engine/math.js';

/**
 * Máquina de estados do jogo:
 *   menu (demo ao vivo no fundo) → countdown → playing ⇄ paused → result → countdown | menu
 * Não conhece regras de nenhum minigame: só a interface de game/Minigame.js.
 */
export class GameManager {
  constructor(deps) {
    Object.assign(this, deps); // engine, rig, ui, hud, audio, input, state, particles, fx, backdrop
    this.mode = 'boot';
    this.prevMode = null;
    this.mg = null;
    this.t = 0;
  }

  _ctx() {
    return {
      scene: this.engine.scene, camera: this.engine.camera, rig: this.rig, particles: this.particles, fx: this.fx,
      audio: this.audio, hud: this.hud, input: this.input, settings: this.state.settings,
    };
  }

  boot() {
    this.applyAllSettings();
    this._startDemo();
    this.ui.show('main');
  }

  _clear() {
    if (this.mg) this.mg.dispose();
    this.mg = null;
    this.particles.sparks.clear();
    this.particles.dust.clear();
    this.fx.clear();
  }

  _menuShift() {
    return this.engine.camera.aspect > 1.25 ? 0.17 : 0;
  }

  _startDemo() {
    this._clear();
    const Cls = MINIGAMES[0];
    this.mg = new Cls(this._ctx());
    this.mg.setup({
      demo: true, points: 5, time: 0,
      players: shuffle(CHARACTERS).map((c, i) => ({ characterId: c.id, isHuman: false, difficulty: i % 2 ? 'hard' : 'normal' })),
    });
    this.mg.start();
    this.rig.setOrbit({ radius: Math.max(24, this.rig.game.dist * 0.9), height: 14, speed: 0.05, lookY: -1.2, lambda: 1.2 });
    this.rig.viewShiftTarget = this._menuShift();
    this.mode = 'menu';
    this.hud.hide();
    this.input.captureGame = false;
  }

  startMatch(cfg = this.state.lastConfig) {
    this.state.lastConfig = { ...cfg };
    this.state.save();
    this._clear();
    const Cls = getMinigame(cfg.minigameId);
    const others = shuffle(CHARACTERS.filter((c) => c.id !== cfg.characterId));
    const players = [
      { characterId: cfg.characterId, isHuman: true },
      ...others.slice(0, cfg.bots).map((c) => ({ characterId: c.id, isHuman: false, difficulty: cfg.difficulty })),
    ];
    this.mg = new Cls(this._ctx());
    this.mg.setup({ players, points: cfg.points, time: cfg.time });
    this.ui.show(null);
    this.hud.build(this.mg.getHud());
    this.hud.show();
    this.rig.viewShiftTarget = 0;
    this.rig.setGame(1.6);
    this.mode = 'countdown';
    this.cdT = 0;
    this.cdStep = -1;
    this.input.captureGame = true;
    document.activeElement?.blur?.();
    this.audio.duck(false);
  }

  pause() {
    if (this.mode !== 'playing' && this.mode !== 'countdown') return;
    this.prevMode = this.mode;
    this.mode = 'paused';
    this.ui.show('pause');
    this.audio.duck(true);
    this.input.captureGame = false;
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = this.prevMode || 'playing';
    this.ui.show(null);
    this.audio.duck(false);
    this.input.captureGame = true;
    document.activeElement?.blur?.();
  }

  toMenu() {
    this._startDemo();
    this.ui.show('main');
    this.audio.duck(false);
  }

  _showResult() {
    this.mode = 'result';
    this.hud.hide();
    this.input.captureGame = false;
    this.ui.show('result', { results: this.mg.getResults(), meta: this.mg.constructor.meta });
  }

  onAction(action, data = {}) {
    switch (action) {
      case 'play': this.ui.show('setup'); break;
      case 'howto': this.ui.show('howto'); break;
      case 'settings': this.ui.show('settings'); break;
      case 'back': this.ui.show('main'); break;
      case 'start': this.startMatch(this.state.lastConfig); break;
      case 'resume': this.resume(); break;
      case 'restart':
      case 'again': this.startMatch(); break;
      case 'menu': this.toMenu(); break;
      case 'setting': this.applySetting(data.key, data.value); break;
      default:
    }
  }

  applySetting(key, value) {
    const s = this.state.settings;
    s[key] = value;
    this.state.save();
    this.applyAllSettings();
  }

  applyAllSettings() {
    const s = this.state.settings;
    this.audio.setSfxVolume(s.sfxVolume);
    this.audio.setMusic(s.music);
    this.rig.shakeScale = s.shake ? 1 : 0;
    if (this.engine.quality !== s.quality) this.engine.setQuality(s.quality);
    const budget = s.quality === 'high' ? 1 : 0.5;
    this.particles.sparks.budget = this.particles.dust.budget = budget;
  }

  onResize() {
    if (this.mode === 'menu') this.rig.viewShiftTarget = this._menuShift();
  }

  update(dt) {
    const inp = this.input;
    this.t += dt;
    if ((this.mode === 'playing' || this.mode === 'countdown') && inp.pausePressed()) this.pause();
    else if (this.mode === 'paused' && inp.pausePressed()) this.resume();
    else if (this.mode === 'menu' && inp.pausePressed()) this.ui.back();
    else if (this.mode === 'result' && inp.pausePressed()) this.toMenu();

    if (this.mode === 'countdown') {
      this.cdT += dt;
      const lead = 1.0;
      if (this.cdT >= lead) {
        const step = Math.floor((this.cdT - lead) / 0.75);
        if (step !== this.cdStep) {
          this.cdStep = step;
          if (step < 3) {
            this.hud.countdown(String(3 - step));
            this.audio.play('countdown');
          } else {
            this.hud.countdown('VAI!');
            this.audio.play('go');
            this.mg.start();
            this.mode = 'playing';
            this.rig.setGame(5);
          }
        }
      }
    }

    const paused = this.mode === 'paused';
    if (this.mg && !paused) this.mg.update(dt);
    if (this.mg && (this.mode === 'playing' || this.mode === 'countdown')) {
      this.hud.update(this.mg.getHud(), this.mg.getLabels(), dt);
      if (this.mode === 'playing' && this.mg.isFinished()) this._showResult();
    }
    if (this.mode === 'menu' && this.mg?.isFinished()) this._startDemo();

    this.rig.update(paused ? 0 : dt, this.mode === 'playing' ? this.mg.getCameraFocus() : null);
    const pdt = paused ? 0 : dt;
    this.particles.sparks.update(pdt);
    this.particles.dust.update(pdt);
    this.fx.update(pdt);
    this.backdrop.update(dt, this.t);
  }
}
