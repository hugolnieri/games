// Peças comuns dos metadados dos minigames de arena.
export const KEYS_MOVE = ['W A S D', 'ou setas: mover'];
export const GAMEPAD = 'No controle: analógico move, A ou ✕ é a ação principal, B ou ◯ a secundária, Start pausa.';

/** Monta `howTo` a partir das regras rápidas (as mesmas que aparecem na contagem regressiva). */
export function howTo({ objective, keys, rules, victory }) {
  return { objective, controls: [...keys, ['Esc', 'pausar']], rules, victory, gamepad: GAMEPAD, diagram: '' };
}
