import { getItem, STARTING_COINS } from '../characters/cosmetics.js';

const KEY = 'treta-party:v1';

/**
 * Configurações, última partida e PERFIL (moedas, inventário, itens equipados), persistidos no
 * navegador (localStorage). Não há contas: o perfil vale para este navegador.
 */
export class GameState {
  constructor() {
    this.settings = { sfxVolume: 0.8, music: true, shake: true, quality: 'high' };
    this.lastConfig = {
      mode: 'single', minigameId: 'bolada', seq: [], characterId: 'faisca', bots: 3, difficulty: 'normal', points: 10, time: 180,
    };
    // skins: { personagem: idDaSkin }; acc/pose valem para qualquer personagem
    this.profile = { coins: STARTING_COINS, owned: [], skins: {}, acc: null, pose: 'pose-pulo', rewarded: [] };
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
      Object.assign(this.profile, d.profile || {});
      const p = this.profile;
      p.coins = Math.max(0, Math.floor(Number(p.coins) || 0));
      p.owned = [...new Set((Array.isArray(p.owned) ? p.owned : []).filter((id) => getItem(id)))];
      if (!Array.isArray(p.rewarded)) p.rewarded = [];
      if (!Array.isArray(this.lastConfig.seq)) this.lastConfig.seq = [];
    } catch {
      /* armazenamento indisponível: segue com padrões */
    }
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings: this.settings, lastConfig: this.lastConfig, profile: this.profile }));
    } catch {
      /* ignora */
    }
  }

  // ---------- loja ----------
  owns(id) {
    const it = getItem(id);
    return !!it && (it.price === 0 || this.profile.owned.includes(id));
  }
  isEquipped(id) {
    const it = getItem(id), p = this.profile;
    if (!it) return false;
    return it.type === 'skin' ? p.skins[it.char] === id : it.type === 'acc' ? p.acc === id : p.pose === id;
  }
  /** Compra idempotente: quem já tem o item nunca paga de novo. */
  buy(id) {
    const it = getItem(id), p = this.profile;
    if (!it) return 'missing';
    if (this.owns(id)) return 'owned';
    if (p.coins < it.price) return 'poor';
    p.coins -= it.price;
    p.owned.push(id);
    this.save();
    return 'ok';
  }
  /** Equipa (ou tira, se já estiver equipado; a pose sempre tem uma ativa). */
  equip(id) {
    const it = getItem(id), p = this.profile;
    if (!it || !this.owns(id)) return false;
    if (it.type === 'skin') p.skins[it.char] = p.skins[it.char] === id ? null : id;
    else if (it.type === 'acc') p.acc = p.acc === id ? null : id;
    else p.pose = id;
    this.save();
    return true;
  }
  /** Aparência do jogador desta máquina para o personagem escolhido (só itens que ele possui). */
  look(characterId = this.lastConfig.characterId) {
    const p = this.profile;
    const own = (id) => (id && this.owns(id) ? id : null);
    return { characterId, skin: own(p.skins[characterId]), acc: own(p.acc), pose: own(p.pose) || 'pose-pulo' };
  }
  /** Paga a recompensa de uma partida uma única vez (a chave identifica a partida). */
  reward(key, coins) {
    const p = this.profile;
    if (!key || p.rewarded.includes(key)) return 0;
    p.rewarded.push(key);
    if (p.rewarded.length > 40) p.rewarded.splice(0, p.rewarded.length - 40);
    p.coins += coins;
    this.save();
    return coins;
  }
}
