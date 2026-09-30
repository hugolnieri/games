const KEY = 'treta-party:v1';

/** Configurações e última partida, persistidas no navegador (localStorage). */
export class GameState {
  constructor() {
    this.settings = { sfxVolume: 0.8, music: true, shake: true, quality: 'high' };
    this.lastConfig = { minigameId: 'bolada', characterId: 'faisca', bots: 3, difficulty: 'normal', points: 10, time: 180 };
    this.hadSave = false;
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.hadSave = true;
      Object.assign(this.settings, d.settings || {});
      Object.assign(this.lastConfig, d.lastConfig || {});
    } catch {
      /* armazenamento indisponível: segue com padrões */
    }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings: this.settings, lastConfig: this.lastConfig }));
    } catch {
      /* ignora */
    }
  }
}
