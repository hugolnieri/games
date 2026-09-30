import { BoladaMinigame } from './bolada/BoladaMinigame.js';

/**
 * Registro de minigames. Para adicionar um novo:
 *  1. crie src/minigames/<nome>/ com uma classe que estende Minigame (game/Minigame.js);
 *     o ponto de partida mais rápido é copiar src/minigames/_modelo/
 *  2. importe e adicione aqui
 * Menu, seleção, "Como jogar", HUD e resultados se adaptam sozinhos.
 */
export const MINIGAMES = [BoladaMinigame];

export const getMinigame = (id) => MINIGAMES.find((m) => m.meta.id === id) || MINIGAMES[0];

/** Vagas "em breve" exibidas na seleção (completa a fileira de 4). */
export const COMING_SOON = Math.max(0, 4 - MINIGAMES.length);
