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
    // online: 'host' roda a simulação e recebe comandos; 'client' só espelha o estado do host
    this.role = config.net?.role || 'local';
    const seats = seatsFor(config.players.length);
    this.players = config.players.map((p, i) => ({ ...p, index: i, seat: seats[i], def: getCharacter(p.characterId) }));
    this.seed = Math.floor(Math.random() * 1e9);
    this.sim = new BoladaSim({
      players: this.players.map((p) => ({ seat: p.seat, id: p.index })),
      startPoints: config.points,
      timeLimit: config.time,
      seed: this.seed,
    });
    const rng = (this.botRng = mulberry32(this.seed ^ 0x9e3779b9));
    const isBot = (p) => !p.isHuman && !p.isRemote;
    this.bots = this.role === 'client' ? [] : this.players.filter(isBot).map((p) => new BoladaBot(this.sim, p.seat, p.difficulty || 'normal', rng));
    this.human = this.players.find((p) => p.isHuman) || null;
    // um controlador por humano que esta máquina simula (o local e, no host, os remotos)
    this.controllers = new Map();
    if (this.role !== 'client') {
      for (const p of this.players) {
        if (p.isHuman || p.isRemote) this.controllers.set(p.index, { player: p, axis: { x: 0, y: 0 }, pulseBuf: 0, dashBuf: 0, seqP: 0, seqD: 0 });
      }
    }
    this.view = new BoladaView(this.ctx, this.sim, this.players, { demo: this.demo });
    this.acc = 0;
    this.running = false;
    this.freeze = 0;
    this.slow = 0;
    this.slowScale = 1;
    this.ffwd = false;
    this.endTimer = -1;
    this.done = false;
    this.inputs = [null, null, null, null];
    this.netEvents = [];
    this.snapAge = 0;
    this.snapGap = 1 / 30;
    this.localSeq = { p: 0, d: 0 };
    this.localAxis = { x: 0, y: 0 };
  }

  start() {
    this.running = true;
  }

  /** Giro da câmera para o humano local ver o próprio gol embaixo (assento 0 = sem giro). */
  getViewYaw() {
    return this.human ? Math.PI / 2 - SEAT_ANGLES[this.human.seat] : 0;
  }
  getViewSeat() {
    return this.human ? this.human.seat : 0;
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

    if (this.human && !this.demo && this.running) {
      const input = this.ctx.input;
      // com o menu aberto (pausa online) o jogo segue, mas seu pod fica parado
      const inp = input.captureGame ? input.getPlayer(0) : { x: 0, y: 0, action: false, dash: false };
      if (inp.action) this.localSeq.p++;
      if (inp.dash) this.localSeq.d++;
      this.localAxis = { x: inp.x, y: inp.y };
      const ctrl = this.controllers.get(this.human.index);
      if (ctrl) this._feed(ctrl, inp.x, inp.y, this.localSeq.p, this.localSeq.d);
      const alive = this.sim.pods[this.human.seat].active;
      if (this.role === 'local' && !alive && !this.sim.finished && input.confirmPressed()) this.ffwd = !this.ffwd;
    }
    if (this.ffwd && !this.sim.finished) scale *= 3;

    if (this.role === 'client') {
      // espelho: só interpola entre os dois últimos estados recebidos do host
      this.snapAge += dt;
      this.view.update(dt, scale, Math.min(1, this.snapAge / this.snapGap));
    } else {
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
    }

    if (this.sim.finished) {
      if (this.endTimer < 0) this.endTimer = 0;
      this.endTimer += dt;
      if (this.endTimer > 3.4) this.done = true;
    }
  }

  /** Recebe um estado de controle (eixos + contadores de toques de pulso/dash). */
  _feed(ctrl, x, y, seqP, seqD) {
    ctrl.axis.x = x;
    ctrl.axis.y = y;
    if (seqP > ctrl.seqP) ctrl.pulseBuf = INPUT_BUFFER;
    if (seqD > ctrl.seqD) ctrl.dashBuf = INPUT_BUFFER;
    ctrl.seqP = seqP;
    ctrl.seqD = seqD;
  }

  _controllerInput(ctrl, h) {
    const pod = this.sim.pods[ctrl.player.seat];
    // Direção de tela → movimento no trilho. A tela de cada humano é girada para o gol dele
    // ficar embaixo; projeta "direita" e "cima" da tela (no mundo) na tangente do trilho.
    const yaw = Math.PI / 2 - SEAT_ANGLES[ctrl.player.seat];
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const a = ctrl.axis;
    let move = a.x * (c * pod.tx - sn * pod.tz) + a.y * (-sn * pod.tx - c * pod.tz);
    if (Math.hypot(a.x, a.y) > 0.1 && Math.abs(move) < 0.25) move = 0;
    move = clamp(move * 1.25, -1, 1);
    const pulse = ctrl.pulseBuf > 0 && pod.pulseCd <= 0;
    const dash = ctrl.dashBuf > 0 && pod.dashCd <= 0;
    if (pulse) ctrl.pulseBuf = 0;
    if (dash) ctrl.dashBuf = 0;
    ctrl.pulseBuf = Math.max(0, ctrl.pulseBuf - h);
    ctrl.dashBuf = Math.max(0, ctrl.dashBuf - h);
    return { move, pulse, dash };
  }

  _fixed(h) {
    const sim = this.sim;
    for (const bot of this.bots) this.inputs[bot.seat] = bot.update(h);
    for (const ctrl of this.controllers.values()) this.inputs[ctrl.player.seat] = this._controllerInput(ctrl, h);
    this.view.capturePrev();
    sim.step(h, this.inputs);
    const events = sim.drainEvents();
    if (events.length) {
      this.view.handleEvents(events, this);
      if (this.role === 'host') this.netEvents.push(...events);
    }
  }

  // ---------- online ----------
  /** Cliente: comando local para mandar ao host. */
  netInput() {
    return { x: +this.localAxis.x.toFixed(2), y: +this.localAxis.y.toFixed(2), p: this.localSeq.p, d: this.localSeq.d };
  }

  /** Host: comando de um jogador remoto (índice na lista de jogadores). */
  setRemoteInput(index, m) {
    const ctrl = this.controllers.get(index);
    if (ctrl && ctrl.player.isRemote) this._feed(ctrl, +m.x || 0, +m.y || 0, m.p | 0, m.d | 0);
  }

  /** Host: jogador remoto saiu no meio da partida → vira bot. */
  dropRemote(index) {
    const ctrl = this.controllers.get(index);
    if (!ctrl || !ctrl.player.isRemote) return;
    this.controllers.delete(index);
    this.bots.push(new BoladaBot(this.sim, ctrl.player.seat, 'normal', this.botRng));
  }

  /** Host: estado compacto + eventos desde o último envio. */
  netSnapshot() {
    const sim = this.sim;
    const r = (v) => Math.round(v * 1000) / 1000;
    const pods = [];
    for (const p of sim.pods) {
      if (!p) continue;
      const st = p.stats;
      pods.push([p.seat, r(p.off), r(p.v), p.active ? 1 : 0, p.points, p.place, r(p.eliminatedAt), r(p.pulseCd), r(p.pulseT), r(p.dashT), r(p.dashCd),
        st.pulses, st.hits, st.supers, st.saves, st.conceded, st.scored]);
    }
    const balls = sim.balls.map((b) => [b.id, r(b.x), r(b.z), r(b.vx), r(b.vz), b.type === 'bomb' ? 1 : 0, b.lastHitBy, r(b.super), b.hitCount]);
    const L = sim.launcher;
    const snap = {
      t: r(sim.time), tl: r(sim.timeLeft), sd: sim.suddenDeath ? 1 : 0, f: sim.finished ? 1 : 0, w: sim.winnerSeat,
      l: [L.state === 'aiming' ? 1 : 0, r(L.t), r(L.aim), L.type === 'bomb' ? 1 : 0], p: pods, b: balls, e: this.netEvents,
    };
    this.netEvents = [];
    return snap;
  }

  /** Cliente: aplica o estado recebido do host e toca os eventos na view. */
  applySnapshot(s) {
    const sim = this.sim;
    this.view.capturePrev();
    this.snapGap = Math.min(0.12, Math.max(1 / 60, this.snapAge || 1 / 30));
    this.snapAge = 0;
    sim.time = s.t;
    sim.timeLeft = s.tl;
    sim.suddenDeath = !!s.sd;
    sim.finished = !!s.f;
    sim.winnerSeat = s.w;
    Object.assign(sim.launcher, { state: s.l[0] ? 'aiming' : 'cooldown', t: s.l[1], aim: s.l[2], type: s.l[3] ? 'bomb' : 'normal' });
    for (const a of s.p) {
      const pod = sim.pods[a[0]];
      if (!pod) continue;
      [, pod.off, pod.v] = a;
      pod.active = !!a[3];
      [pod.points, pod.place, pod.eliminatedAt, pod.pulseCd, pod.pulseT, pod.dashT, pod.dashCd] = a.slice(4, 11);
      const st = pod.stats;
      [st.pulses, st.hits, st.supers, st.saves, st.conceded, st.scored] = a.slice(11);
      sim._podPos(pod);
    }
    sim.balls = s.b.map((a) => {
      const bomb = a[5] === 1;
      return {
        id: a[0], x: a[1], z: a[2], vx: a[3], vz: a[4], type: bomb ? 'bomb' : 'normal', r: bomb ? C.ball.bombRadius : C.ball.radius,
        value: bomb ? 2 : 1, lastHitBy: a[6], super: a[7], hitCount: a[8], alive: true, pulsedBy: {}, age: 0,
      };
    });
    if (s.e && s.e.length) this.view.handleEvents(s.e, this);
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
      online: this.role !== 'local',
      viewSeat: this.getViewSeat(),
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
