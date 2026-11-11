// Catálogo da loja. Tudo aqui é puramente visual: nenhum item muda velocidade, alcance ou física.
// Skins trocam a paleta do corpo de UM personagem; acessórios e poses servem para qualquer um.
const skin = (char, key, name, price, color, accent, dark) => ({ id: `${char}-${key}`, type: 'skin', char, name, price, color, accent, dark });

export const SKINS = {
  faisca: [
    skin('faisca', 'meia-noite', 'Meia-noite', 90, 0x3a3f6e, 0xbfc6ff, 0x161a3a),
    skin('faisca', 'tigresa', 'Tigresa', 120, 0xffa51f, 0xfff0c2, 0x7a3a00),
    skin('faisca', 'neon', 'Curto-circuito', 180, 0x19e3c2, 0xe6fff9, 0x0a6b5c),
  ],
  broto: [
    skin('broto', 'lama', 'Banho de lama', 90, 0xa5733f, 0xf2d9a8, 0x4f3215),
    skin('broto', 'coral', 'Coral', 120, 0xff7d6b, 0xffe0c9, 0x8f2a2a),
    skin('broto', 'gelo', 'Brejo gelado', 180, 0x7fd6ff, 0xf0fbff, 0x1f5f8f),
  ],
  parafuso: [
    skin('parafuso', 'ferrugem', 'Ferrugem', 90, 0xc9703a, 0xffd9b0, 0x6b2f10),
    skin('parafuso', 'limao', 'Lata de limão', 120, 0xb8e02a, 0xf6ffc2, 0x4f6b00),
    skin('parafuso', 'cromado', 'Cromado', 180, 0xc9d1e8, 0xffffff, 0x4f587a),
  ],
  glub: [
    skin('glub', 'limo', 'Limo radioativo', 90, 0x9be02a, 0xf1ffc2, 0x3f6b00),
    skin('glub', 'chiclete', 'Chiclete', 120, 0xff8ac4, 0xffe3f2, 0x9c2f6b),
    skin('glub', 'abismo', 'Abissal', 180, 0x2a3a9c, 0x9fb4ff, 0x10184f),
  ],
  jujuba: [
    skin('jujuba', 'menta', 'Menta', 90, 0x4fe0b0, 0xe0fff4, 0x14705a),
    skin('jujuba', 'uva', 'Uva', 120, 0x8a4fe0, 0xe6d6ff, 0x3a1a7a),
    skin('jujuba', 'cola', 'Cola', 180, 0x8f4a2a, 0xf2c9a0, 0x3f1a0a),
  ],
  pipoca: [
    skin('pipoca', 'caramelo', 'Caramelo', 90, 0xe08a2a, 0xffe0b0, 0x7a3f00),
    skin('pipoca', 'algodao', 'Algodão-doce', 120, 0xff9fd0, 0xfff0f8, 0xa03a7a),
    skin('pipoca', 'noturna', 'Coruja', 180, 0x5a4f8f, 0xd9d0ff, 0x231a4f),
  ],
};

export const ACCESSORIES = [
  { id: 'acc-bone', type: 'acc', name: 'Boné da torcida', price: 60 },
  { id: 'acc-oculos', type: 'acc', name: 'Óculos escuros', price: 80 },
  { id: 'acc-helice', type: 'acc', name: 'Gorro de hélice', price: 110 },
  { id: 'acc-fones', type: 'acc', name: 'Fones de DJ', price: 130 },
  { id: 'acc-chifres', type: 'acc', name: 'Elmo de chifres', price: 150 },
  { id: 'acc-cartola', type: 'acc', name: 'Cartola', price: 170 },
  { id: 'acc-coroa', type: 'acc', name: 'Coroa de campeão', price: 260 },
];

export const POSES = [
  { id: 'pose-pulo', type: 'pose', name: 'Pulinho', price: 0, desc: 'Pula de braços para cima.' },
  { id: 'pose-onda', type: 'pose', name: 'Ola', price: 70, desc: 'Ginga com os braços alternados.' },
  { id: 'pose-giro', type: 'pose', name: 'Pirueta', price: 100, desc: 'Roda de braços abertos.' },
  { id: 'pose-robo', type: 'pose', name: 'Robozinho', price: 130, desc: 'Dança em passos secos.' },
  { id: 'pose-flex', type: 'pose', name: 'Exibido', price: 160, desc: 'Mostra o muque para a torcida.' },
];

export const CATALOG = [...Object.values(SKINS).flat(), ...ACCESSORIES, ...POSES];
export const getItem = (id) => CATALOG.find((i) => i.id === id) || null;

/** Recompensa por partida concluída (moedas). `place` começa em 1. */
export const matchReward = (place) => 10 + ([30, 18, 10, 5][place - 1] ?? 5);
export const CHAMPION_BONUS = 60;
export const STARTING_COINS = 60;
