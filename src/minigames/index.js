import { BoladaMinigame } from './bolada/BoladaMinigame.js';
import { TrombadaMinigame } from './trombada/game.js';
import { PulaPintaMinigame } from './pulapinta/game.js';
import { CaixoteMinigame } from './caixote/game.js';
import { LataVelhaMinigame } from './latavelha/game.js';
import { PeNaTabuaMinigame } from './penatabua/game.js';
import { MiraCertaMinigame } from './miracerta/game.js';
import { PegaFichaMinigame } from './pegaficha/game.js';

/**
 * Registro de minigames. Para adicionar um novo:
 *  1. crie src/minigames/<nome>/ (sim.js + game.js, como em trombada/) estendendo ArenaMinigame,
 *     ou o contrato cru de game/Minigame.js (ver _modelo/)
 *  2. importe e adicione aqui
 * Menu, seleção, "Como jogar", HUD, sala online, Circuito e resultados se adaptam sozinhos.
 */
export const MINIGAMES = [
  BoladaMinigame, TrombadaMinigame, PulaPintaMinigame, CaixoteMinigame, LataVelhaMinigame, PeNaTabuaMinigame, MiraCertaMinigame, PegaFichaMinigame,
];

export const getMinigame = (id) => MINIGAMES.find((m) => m.meta.id === id) || MINIGAMES[0];
export const hasMinigame = (id) => MINIGAMES.some((m) => m.meta.id === id);

/** Pontos de Circuito por colocação numa rodada. */
export const CIRCUIT_POINTS = [5, 3, 2, 1];
export const CIRCUIT_DEFAULT = ['trombada', 'pulapinta', 'penatabua', 'pegaficha'];
