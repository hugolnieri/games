/**
 * Contrato de todo minigame. O GameManager só conversa com esta interface,
 * então adicionar o Minigame 02 não exige mexer na engine nem no fluxo de telas.
 *
 * ctx = { scene, camera, rig, particles: { sparks, dust }, fx, audio, hud, input, settings }
 */
export class Minigame {
  /** Metadados exibidos no menu e na tela "Como jogar". */
  static meta = {
    id: 'base',
    number: '00',
    name: 'Minigame',
    tagline: '',
    // controls: [['teclas separadas por espaço', 'descrição']]; gamepad e diagram (SVG) são opcionais
    howTo: { objective: '', controls: [], rules: [], victory: '', gamepad: '', diagram: '' },
    minPlayers: 2,
    maxPlayers: 4,
    // Enquadramento da câmera de jogo (unidades de mundo): raio que precisa caber na tela
    // (arena + paredes), raio usado em retrato e posição dos rótulos acima dos jogadores.
    camera: { fitRadius: 11.2, fitRadiusPortrait: 10.5, labelRadius: 8.85, labelHeight: 2.6 },
  };

  constructor(ctx) {
    this.ctx = ctx;
  }

  /** config = { players: [{ characterId, isHuman, difficulty }], points, time, demo } */
  setup(config) {}
  /** Chamado quando a contagem regressiva termina. */
  start() {}
  /** dt real em segundos (o minigame aplica hitstop/câmera lenta internamente). */
  update(dt) {}
  /** true quando a partida acabou e a celebração terminou → tela de resultado. */
  isFinished() {
    return false;
  }
  /** Estado para o HUD: tempo, jogadores, pontos. */
  getHud() {
    return null;
  }
  /** Âncoras 3D para rótulos flutuantes sobre os jogadores. */
  getLabels() {
    return [];
  }
  /** Deslocamento sutil do alvo da câmera (ex.: centro de massa da ação). */
  getCameraFocus() {
    return null;
  }
  /**
   * Lista ordenada por colocação:
   * [{ place, name, color, characterId, isHuman, points, eliminatedAt, summary: [{ label, value }] }]
   * `summary` vira as colunas de números da tela de resultado.
   */
  getResults() {
    return [];
  }
  dispose() {}
}
