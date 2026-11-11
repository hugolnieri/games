// Partidas headless só de bots para os minigames de arena: valida que toda partida termina,
// que as colocações são coerentes e que a dificuldade dos bots faz diferença.
import { STEP } from '../src/minigames/shared/SimBase.js';
import { TrombadaSim, TrombadaBot } from '../src/minigames/trombada/sim.js';
import { PulaPintaSim, PulaPintaBot } from '../src/minigames/pulapinta/sim.js';
import { CaixoteSim, CaixoteBot } from '../src/minigames/caixote/sim.js';
import { LataVelhaSim, LataVelhaBot } from '../src/minigames/latavelha/sim.js';
import { PeNaTabuaSim, PeNaTabuaBot } from '../src/minigames/penatabua/sim.js';
import { MiraCertaSim, MiraCertaBot } from '../src/minigames/miracerta/sim.js';
import { PegaFichaSim, PegaFichaBot } from '../src/minigames/pegaficha/sim.js';
import { mulberry32 } from '../src/engine/math.js';

const GAMES = {
  trombada: [TrombadaSim, TrombadaBot], pulapinta: [PulaPintaSim, PulaPintaBot], caixote: [CaixoteSim, CaixoteBot], latavelha: [LataVelhaSim, LataVelhaBot],
  penatabua: [PeNaTabuaSim, PeNaTabuaBot], miracerta: [MiraCertaSim, MiraCertaBot], pegaficha: [PegaFichaSim, PegaFichaBot],
};
const N = Number(process.env.N || 40);
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✔' : '✘'} ${msg}`);
  if (!ok) failed++;
};

/** Roda uma partida; `idle` = índice de um jogador que não faz nada. */
export function play([Sim, Bot], diffs, seed, idle = -1) {
  const sim = new Sim({ n: diffs.length, seed });
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const bots = diffs.map((d, i) => (i === idle ? null : new Bot(sim, i, d, rng)));
  const inputs = [];
  let steps = 0;
  while (!sim.finished && steps < 60 * 400) {
    bots.forEach((b, i) => (inputs[i] = b ? { ...b.update(STEP) } : null));
    sim.step(STEP, inputs);
    sim.drainEvents();
    // o estado tem de sobreviver à rede (JSON) sem mudar o resultado
    if (steps % 600 === 0) JSON.parse(JSON.stringify(sim.snapshot()));
    steps++;
  }
  return sim;
}

const ONLY = process.env.ONLY;
for (const [name, G] of Object.entries(GAMES)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue;
  const run = (diffs, idle) => {
    const wins = diffs.map(() => 0);
    let dur = 0, unfinished = 0, badPlaces = 0;
    const rot = diffs.length;
    for (let k = 0; k < N; k++) {
      // gira as posições de largada para não medir vantagem de assento
      const order = diffs.map((_, i) => (i + k) % rot);
      const sim = play(G, order.map((i) => diffs[i]), 1000 + k * 7919, idle >= 0 ? order.indexOf(idle) : -1);
      if (!sim.finished) unfinished++;
      const places = sim.s.p.map((p) => p.pl).sort().join('');
      if (places !== diffs.map((_, i) => i + 1).join('')) badPlaces++;
      wins[order[sim.s.w]]++;
      dur += sim.s.t;
    }
    return { wins, dur: dur / N, unfinished, badPlaces };
  };
  const mixed = run(['hard', 'easy', 'easy', 'easy']);
  const duel = run(['normal', 'easy']);
  const even = run(['normal', 'normal', 'normal', 'normal']);
  const idle = run(['normal', 'normal', 'normal', 'normal'], 0);
  console.log(`\n${name}: difícil vs 3 fáceis ${mixed.wins.join('/')} · normal vs fácil ${duel.wins.join('/')} · 4 normais ${even.wins.join('/')} (${even.dur.toFixed(0)}s) · parado ${idle.wins[0]}/${N}`);
  check(mixed.unfinished + duel.unfinished + even.unfinished + idle.unfinished === 0, `${name}: toda partida termina`);
  check(mixed.badPlaces + duel.badPlaces + even.badPlaces === 0, `${name}: colocações 1..n sem repetição`);
  check(mixed.wins[0] > N * 0.5, `${name}: difícil vence a maioria contra três fáceis`);
  check(duel.wins[0] > N * 0.6, `${name}: normal vence fácil no 1v1`);
  check(idle.wins[0] <= N * 0.2, `${name}: jogador parado (quase) nunca vence`);
  check(even.dur > 20 && even.dur < 150, `${name}: partida de 4 dura entre 20s e 150s`);
}
if (failed) {
  console.error(`\n${failed} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nTudo certo.');
