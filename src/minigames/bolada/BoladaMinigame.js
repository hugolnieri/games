import { Minigame } from '../../game/Minigame.js';
import { BoladaSim } from './BoladaSim.js';
import { BoladaBot } from './BoladaBot.js';
import { BoladaView } from './BoladaView.js';
import { FIXED_STEP, SEAT_ANGLES, BOLADA as C } from './config.js';
import { mulberry32, clamp } from '../../engine/math.js';
import { getCharacter } from '../../characters/characters.js';

/** Assentos usados conforme o número de jogadores (humano sempre no 0, perto da câmera). */
export const seatsFor = (n) => (n === 2 ? [0, 2] : n === 3 ? [0, 1, 3] : [0, 1, 2, 3]);

const INPUT_BUFFER = 0.14; // aperto um pouco antes do cooldown acabar ainda conta

/** Diagrama da tela "Como jogar": arena vista de cima (SVG: x = direita, y = +z = perto da câmera). */
function howToDiagram() {
  const arc = (a, color) => {
    const p = (t) => `${(Math.cos(t) * 100).toFixed(1)} ${(Math.sin(t) * 100).toFixed(1)}`;
    return `<path d="M ${p(a - C.goalHalfAngle)} A 100 100 0 0 1 ${p(a + C.goalHalfAngle)}" stroke="${color}" stroke-width="12" fill="none"/>`;
  };
  const colors = ['#ff6b3d', '#49d35e', '#2fb0ff', '#b46bff'];
  return `
    <svg class="diagram" viewBox="-120 -120 240 240" role="img" aria-label="Arena vista de cima: quatro gols, seu pod embaixo e o reator no centro">
      <circle r="100" fill="#4b52c4" stroke="#1a1033" stroke-width="6"/>
      ${SEAT_ANGLES.map((a, s) => arc(a, colors[s])).join('')}
      <circle r="14" fill="#2b2f5e" stroke="#ffd23f" stroke-width="4"/>
      <path d="M 18 -12 L 58 -40" stroke="#ffb347" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 10"/>
      <circle cx="62" cy="-44" r="7" fill="#fff4d6" stroke="#1a1033" stroke-width="3"/>
      <circle cx="0" cy="86" r="24" fill="none" stroke="#ff6b3d" stroke-width="3" stroke-dasharray="4 5"/>
      <circle cx="0" cy="86" r="11" fill="#ff6b3d" stroke="#1a1033" stroke-width="4"/>
      <path d="M -30 80 l -12 6 l 12 6 z M 30 80 l 12 6 l -12 6 z" fill="#fff" stroke="#1a1033" stroke-width="3" stroke-linejoin="round"/>
      <text x="0" y="56" text-anchor="middle" font-size="15" font-weight="800" fill="#fff" stroke="#1a1033" stroke-width="5" paint-order="stroke" stroke-linejoin="round">você</text>
    </svg>`;
}

export class BoladaMinigame extends Minigame {
  static meta = {
    id: 'bolada',
    number: '01',
    name: 'Bolada!',
    tagline: 'Defenda seu gol e mande as bolas para o gol dos outros.',
    minPlayers: 2,
    maxPlayers: 4,
    camera: {
      fitRadius: C.arenaRadius + 1.2, // arena + paredes
      fitRadiusPortrait: C.arenaRadius + 0.5,
      labelRadius: C.railRadius,
      labelHeight: 2.6,
    },
    howTo: {
      objective:
        'Cada jogador protege um gol na borda da arena. O reator do centro dispara bolas que ricocheteiam por tudo. Não deixe entrar no seu gol e rebata para o gol dos adversários.',
      controls: [
        ['A D', 'ou setas: mover no trilho'],
        ['Espaço', 'pulso de rebatida'],
        ['Shift', 'dash lateral'],
        ['Esc', 'pausar'],
      ],
      rules: [
        'Cada bola no seu gol tira 1 ponto. Bolas-bomba, vermelhas, tiram 2.',
        'O pulso arremessa a bola na direção do seu pod até ela. Você mira pelo posicionamento.',
        'Pulso no último instante, com a bola quase encostando, vira super rebatida.',
        'A seta no chão mostra para onde o reator vai disparar.',
        'Zerou os pontos, está eliminado e seu gol vira parede.',
      ],
      victory:
        'Vence quem sobrar com pontos. Se o tempo acabar, quem tiver menos pontos sai; empate no topo vai para morte súbita.',
      gamepad: 'No controle: analógico move, A ou ✕ rebate, B ou ◯ dá dash, Start pausa.',
      diagram: howToDiagram(),
    },
  };

  setup(config) {
    this.config = config;
    this.demo = !!config.demo;
    const seats = seatsFor(config.players.length);
    this.players = config.players.map((p, i) => ({ ...p, index: i, seat: seats[i], def: getCharacter(p.characterId) }));
    this.seed = Math.floor(Math.random() * 1e9);
    this.sim = new BoladaSim({
      players: this.players.map((p) => ({ seat: p.seat, id: p.index })),
      startPoints: config.points,
      timeLimit: config.time,
      seed: this.seed,
    });
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    this.bots = this.players.filter((p) => !p.isHuman).map((p) => new BoladaBot(this.sim, p.seat, p.difficulty || 'normal', rng));
    this.human = this.players.find((p) => p.isHuman) || null;
    this.view = new BoladaView(this.ctx, this.sim, this.players, { demo: this.demo });
    this.acc = 0;
    this.running = false;
    this.freeze = 0;
    this.slow = 0;
    this.slowScale = 1;
    this.ffwd = false;
    this.endTimer = -1;
    this.done = false;
    this.pulseBuf = 0;
    this.dashBuf = 0;
    this.axis = { x: 0, y: 0 };
    this.inputs = [null, null, null, null];
  }

  start() {
    this.running = true;
  }

  hitstop(t) {
    this.freeze = Math.max(this.freeze, t);
  }
  slowmo(scale, t) {
    this.slowScale = scale;
    this.slow = Math.max(this.slow, t);
  }

  update(dt) {
    let scale = 1;
    if (this.freeze > 0) {
      this.freeze -= dt;
      scale = 0;
    } else if (this.slow > 0) {
      this.slow -= dt;
      scale = this.slowScale;
    }

    if (this.human && this.running && !this.demo) {
      const input = this.ctx.input;
      const inp = input.getPlayer(0);
      if (inp.action) this.pulseBuf = INPUT_BUFFER;
      if (inp.dash) this.dashBuf = INPUT_BUFFER;
      this.axis = inp;
      const alive = this.sim.pods[this.human.seat].active;
      if (!alive && !this.sim.finished && input.confirmPressed()) this.ffwd = !this.ffwd;
    }
    if (this.ffwd && !this.sim.finished) scale *= 3;

    if (this.running && !this.sim.finished) {
      this.acc += dt * scale;
      let steps = 0;
      while (this.acc >= FIXED_STEP && steps < 30) {
        this._fixed(FIXED_STEP);
        this.acc -= FIXED_STEP;
        steps++;
      }
      if (steps >= 30) this.acc = 0;
    }

    this.view.update(dt, scale, this.sim.finished ? 1 : this.acc / FIXED_STEP);

    if (this.sim.finished) {
      if (this.endTimer < 0) this.endTimer = 0;
      this.endTimer += dt;
      if (this.endTimer > 3.4) this.done = true;
    }
  }

  _fixed(h) {
    const sim = this.sim;
    for (const bot of this.bots) this.inputs[bot.seat] = bot.update(h);
    if (this.human) {
      const pod = sim.pods[this.human.seat];
      // Direção de tela → movimento no trilho: projeta o input na tangente do trilho.
      // Tela para cima = -z no mundo. Serve para qualquer assento (multiplayer local).
      const a = this.axis;
      let move = a.x * pod.tx + -a.y * pod.tz;
      if (Math.hypot(a.x, a.y) > 0.1 && Math.abs(move) < 0.25) move = 0;
      move = clamp(move * 1.25, -1, 1);
      const pulse = this.pulseBuf > 0 && pod.pulseCd <= 0;
      const dash = this.dashBuf > 0 && pod.dashCd <= 0;
      if (pulse) this.pulseBuf = 0;
      if (dash) this.dashBuf = 0;
      this.pulseBuf = Math.max(0, this.pulseBuf - h);
      this.dashBuf = Math.max(0, this.dashBuf - h);
      this.inputs[this.human.seat] = { move, pulse, dash };
    }
    this.view.capturePrev();
    sim.step(h, this.inputs);
    const events = sim.drainEvents();
    if (events.length) this.view.handleEvents(events, this);
  }

  isFinished() {
    return this.done;
  }

  _playerState(p) {
    const pod = this.sim.pods[p.seat];
    return {
      index: p.index, seat: p.seat, name: p.def.name, color: p.def.color, characterId: p.def.id,
      points: pod.points, max: this.sim.startPoints, active: pod.active, place: pod.place,
      isHuman: !!p.isHuman, difficulty: p.difficulty,
    };
  }

  getHud() {
    const sim = this.sim;
    return {
      timeLeft: sim.timeLeft,
      hasLimit: sim.hasLimit,
      suddenDeath: sim.suddenDeath,
      finished: sim.finished,
      players: this.players.map((p) => this._playerState(p)),
      humanOut: this.human ? !sim.pods[this.human.seat].active && !sim.finished : false,
      ffwd: this.ffwd,
    };
  }

  getLabels() {
    const bySeat = new Map(this.players.map((p) => [p.seat, p]));
    return this.view.getLabels().map((l) => ({ ...l, ...this._playerState(bySeat.get(l.seat)) }));
  }

  getCameraFocus() {
    return this.view.focus;
  }

  getResults() {
    return this.players
      .map((p) => {
        const pod = this.sim.pods[p.seat];
        const st = pod.stats;
        return {
          ...this._playerState(p), place: pod.place || 1, stats: { ...st }, eliminatedAt: pod.eliminatedAt, duration: this.sim.time,
          summary: [
            { label: 'rebatidas', value: st.hits + st.saves },
            { label: 'supers', value: st.supers },
            { label: 'boladas', value: st.scored },
          ],
        };
      })
      .sort((a, b) => a.place - b.place);
  }

  dispose() {
    this.view.dispose();
  }
}
