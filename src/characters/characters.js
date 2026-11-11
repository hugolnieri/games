import { SKINS } from './cosmetics.js';

// Elenco fixo do Treta Party: o mesmo catálogo vale para todos os minigames, a sala e a loja.
// Cada um tem um temperamento que aparece no modelo (expressão, postura, trejeitos em
// CharacterModel.js) e nas falas: `quote` (bordão), `win` e `lose` (resultado).
// Cores em hex; `voice` é o tom da "voz" sintetizada; `anch` = âncoras de acessórios na cabeça
// (hat: [y, z], face: [y, z], w: meia-largura).
export const CHARACTERS = [
  {
    id: 'faisca', name: 'Faísca', species: 'Felina elétrica',
    bio: 'Esquentada e exibida. Trata toda partida como corrida e comemora antes de ganhar.',
    quote: 'Piscou, perdeu!', win: 'Rápido demais pra vocês!', lose: 'Foi o lag. Com certeza foi o lag.',
    color: 0xff6b3d, accent: 0xffd0a8, dark: 0x8a2b12, voice: 1.35,
    anch: { hat: [0.38, 0], face: [0.07, 0.47], w: 0.47 },
  },
  {
    id: 'broto', name: 'Broto', species: 'Réptil do brejo neon',
    bio: 'O mais preguiçoso do brejo. Joga de olho meio fechado e, de algum jeito, está sempre no lugar certo.',
    quote: 'Calma… a bola vem até mim.', win: 'Nem suei.', lose: 'Tudo bem, eu tava com sono mesmo.',
    color: 0x49d35e, accent: 0xd8ff8a, dark: 0x1c6b2a, voice: 0.9,
    anch: { hat: [0.44, 0.02], face: [0.33, 0.33], w: 0.43 },
  },
  {
    id: 'parafuso', name: 'Parafuso', species: 'Robô de ferro-velho',
    bio: 'Montado com um micro-ondas e muita ansiedade. Calcula tudo três vezes e entra em pânico mesmo assim.',
    quote: 'Chance de dar certo: 12%. Vamos!', win: 'ERRO: felicidade acima do limite!', lose: 'Eu avisei que ia dar errado. Eu sempre aviso.',
    color: 0x2fb0ff, accent: 0xbff1ff, dark: 0x0f4f86, voice: 0.7,
    anch: { hat: [0.28, -0.05], face: [0.05, 0.36], w: 0.44 },
  },
  {
    id: 'glub', name: 'Glub', species: 'Alien gelatinoso',
    bio: 'Caiu neste planeta por engano e só quer ir embora. Tem três olhos e nenhum deles está impressionado.',
    quote: 'Anda logo com isso.', win: 'Óbvio. Posso ir pra casa agora?', lose: 'Este planeta é ridículo.',
    color: 0xb46bff, accent: 0xf0d6ff, dark: 0x4e1f8a, voice: 1.15,
    anch: { hat: [0.4, -0.04], face: [0.03, 0.49], w: 0.53 },
  },
  {
    id: 'jujuba', name: 'Jujuba', species: 'Ursa de goma',
    bio: 'Parece um docinho, bate como um caminhão. A mordida na orelha? Você devia ver como ficou o outro.',
    quote: 'Vem cá, fofinho.', win: 'Docinho é a sua avó!', lose: 'Revanche. Agora.',
    color: 0xff5fa2, accent: 0xffd3e6, dark: 0x9c1f5a, voice: 1.5,
    anch: { hat: [0.41, 0], face: [0.09, 0.49], w: 0.49 },
  },
  {
    id: 'pipoca', name: 'Pipoca', species: 'Pintinho turbinado',
    bio: 'Energia pura, direção nenhuma. Saiu do ovo estourando e ainda não parou de gritar.',
    quote: 'ESTOUREI!!!', win: 'PIPOCA! PIPOCA! PIPOCA!', lose: 'DE NOVO! DE NOVO! DE NOVO!',
    color: 0xffc21a, accent: 0xfff3b0, dark: 0x9a6a00, voice: 1.7,
    anch: { hat: [0.37, -0.02], face: [0.11, 0.43], w: 0.42 },
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];

/**
 * Aparência final de um jogador: personagem + skin + acessório + pose de vitória.
 * `team` (cor do jogador no HUD, no veículo e no território) é sempre a cor base do personagem;
 * a skin troca só as cores do corpo.
 */
export function lookDef(p) {
  const ch = getCharacter(p.characterId);
  const skin = (SKINS[ch.id] || []).find((s) => s.id === p.skin);
  return {
    ...ch, ...(skin ? { color: skin.color, accent: skin.accent, dark: skin.dark } : {}),
    team: ch.color, teamAccent: ch.accent, teamDark: ch.dark, acc: p.acc || null, pose: p.pose || 'pose-pulo',
  };
}

/** Só os campos de aparência (o que trafega na rede e fica no config da partida). */
export const lookOf = (p) => ({ characterId: p.characterId, skin: p.skin || null, acc: p.acc || null, pose: p.pose || null });
