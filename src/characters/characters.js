// Personagens originais. Cores em hex; `voice` é o tom da "voz" sintetizada.
export const CHARACTERS = [
  {
    id: 'faisca',
    name: 'Faísca',
    species: 'Felina elétrica',
    bio: 'Bigode arrepiado, reflexo de raio.',
    color: 0xff6b3d,
    accent: 0xffd0a8,
    dark: 0x8a2b12,
    voice: 1.35,
  },
  {
    id: 'broto',
    name: 'Broto',
    species: 'Réptil do brejo neon',
    bio: 'Olhão de sapo, nunca pisca na hora errada.',
    color: 0x49d35e,
    accent: 0xd8ff8a,
    dark: 0x1c6b2a,
    voice: 0.9,
  },
  {
    id: 'parafuso',
    name: 'Parafuso',
    species: 'Robô de ferro-velho',
    bio: 'Calcula ricochete com um processador de micro-ondas.',
    color: 0x2fb0ff,
    accent: 0xbff1ff,
    dark: 0x0f4f86,
    voice: 0.7,
  },
  {
    id: 'glub',
    name: 'Glub',
    species: 'Alien gelatinoso',
    bio: 'Três olhos, zero paciência.',
    color: 0xb46bff,
    accent: 0xf0d6ff,
    dark: 0x4e1f8a,
    voice: 1.15,
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
