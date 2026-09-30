// Assentos: 0 = sul (perto da câmera, jogador humano), 1 = leste, 2 = norte, 3 = oeste.
// Ângulo medido em (x, z): posição = (cos a, sin a) * raio. +z aponta para a câmera.
export const SEAT_ANGLES = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

export const FIXED_STEP = 1 / 120;
export const SUBSTEPS = 4;

export const BOLADA = {
  arenaRadius: 10,
  goalHalfAngle: 0.56, // ~64° de gol por jogador
  railRadius: 8.85, // trilho onde o pod anda
  railLimit: 0.53, // quanto o pod pode se afastar do centro do gol (rad)
  podRadius: 0.95,
  postRadius: 0.22,
  pillarRadius: 0.95,
  reactorRadius: 1.35,

  pod: { maxSpeed: 9.5, accel: 75, decel: 60, dashSpeed: 19, dashTime: 0.16, dashCooldown: 1.1 },

  pulse: {
    radius: 2.35, // alcance do pulso a partir do centro do pod
    window: 0.12, // tempo em que o pulso fica ativo
    cooldown: 0.55,
    speed: 16,
    superGap: 0.45, // bola quase encostando = super rebatida
    superSpeed: 23,
  },

  ball: {
    radius: 0.42,
    bombRadius: 0.52,
    baseSpeed: 8.5,
    baseSpeedMax: 12,
    rampTime: 150, // segundos até a velocidade base máxima
    minSpeed: 5,
    maxSpeed: 27,
    decay: 0.35, // quão rápido bolas "turbinadas" voltam à velocidade base
  },

  spawn: {
    firstDelay: 0.6,
    telegraph: 0.8, // aviso antes de cada disparo
    minGap: 1.3,
    startBalls: 2,
    maxBalls: 6,
    addEvery: 18, // +1 bola simultânea a cada N segundos
    bombAfter: 35,
    bombChance: 0.22,
  },
};
