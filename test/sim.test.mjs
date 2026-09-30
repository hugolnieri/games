// Roda partidas completas só com bots (sem renderização) e confere invariantes + balanceamento.
// Uso: npm run test:sim
import { BoladaSim } from '../src/minigames/bolada/BoladaSim.js';
import { BoladaBot } from '../src/minigames/bolada/BoladaBot.js';
import { mulberry32 } from '../src/engine/math.js';

const SEATS = { 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };
const DT = 1 / 120;

function runMatch(diffs, seed, { points = 10, time = 180, idleSeat0 = false } = {}) {
  const seats = SEATS[diffs.length];
  const players = seats.map((seat, i) => ({ seat, id: i }));
  const sim = new BoladaSim({ players, startPoints: points, timeLimit: time, seed });
  const rng = mulberry32(seed ^ 0x51f15e);
  const bots = seats.map((seat, i) => (idleSeat0 && i === 0 ? null : new BoladaBot(sim, seat, diffs[i], rng)));
  const counts = {};
  let steps = 0;
  const inputs = [];
  while (!sim.finished && steps < 120 * 600) {
    bots.forEach((b, i) => { inputs[seats[i]] = b ? b.update(DT) : { move: 0 }; });
    sim.step(DT, inputs);
    steps++;
    for (const e of sim.drainEvents()) counts[e.type] = (counts[e.type] || 0) + 1;
    for (const b of sim.balls) {
      if (!Number.isFinite(b.x + b.z + b.vx + b.vz)) throw new Error(`NaN na bola ${b.id} (seed ${seed})`);
      if (b.x * b.x + b.z * b.z > 12 * 12) throw new Error(`Bola escapou (seed ${seed})`);
    }
  }
  if (!sim.finished) throw new Error(`Partida não terminou (seed ${seed})`);
  const winnerIdx = seats.indexOf(sim.winnerSeat);
  return { winnerIdx, time: sim.time, counts, sudden: sim.suddenDeath, pods: sim.pods };
}

function suite(name, diffs, n, opts) {
  const wins = new Array(diffs.length).fill(0);
  let t = 0, sudden = 0, goals = 0, supers = 0, pulses = 0;
  for (let i = 0; i < n; i++) {
    const r = runMatch(diffs, 1000 + i * 7919, opts);
    wins[r.winnerIdx]++;
    t += r.time;
    sudden += r.sudden ? 1 : 0;
    goals += r.counts.goal || 0;
    supers += r.pods.filter(Boolean).reduce((s, p) => s + p.stats.supers, 0);
    pulses += r.counts.pulse || 0;
  }
  const label = diffs.map((d, i) => `${d}:${wins[i]}`).join('  ');
  console.log(
    `${name.padEnd(28)} ${label.padEnd(44)} dur média ${(t / n).toFixed(1)}s  gols/partida ${(goals / n).toFixed(1)}  ` +
      `pulsos ${(pulses / n).toFixed(0)}  supers ${(supers / n).toFixed(1)}  morte súbita ${sudden}/${n}`,
  );
  return { wins, avg: t / n };
}

const N = Number(process.env.N || 40);
console.log(`Rodando ${N} partidas por cenário...\n`);
const a = suite('4 normais', ['normal', 'normal', 'normal', 'normal'], N);
const b = suite('difícil vs 3 fáceis', ['hard', 'easy', 'easy', 'easy'], N);
const c = suite('difícil/normal/fácil/fácil', ['hard', 'normal', 'easy', 'easy'], N);
const d = suite('1v1 difícil vs normal', ['hard', 'normal'], N);
const e = suite('1v1 normal vs fácil', ['normal', 'easy'], N);
const f = suite('jogador parado vs 3 normais', ['easy', 'normal', 'normal', 'normal'], 20, { idleSeat0: true });

const checks = [
  ['difícil vence a maioria contra fáceis', b.wins[0] / N > 0.6],
  ['difícil é o mais forte no misto', c.wins[0] === Math.max(...c.wins)],
  ['difícil vence normal no 1v1', d.wins[0] > d.wins[1]],
  ['normal vence fácil no 1v1', e.wins[0] > e.wins[1]],
  ['jogador parado nunca vence', f.wins[0] === 0],
  ['partidas de 4 duram entre 40s e 180s', a.avg > 40 && a.avg < 180],
];
console.log('');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✔' : '✘'} ${label}`);
  ok &&= pass;
}
process.exit(ok ? 0 : 1);
