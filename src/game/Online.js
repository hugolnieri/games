import { Net, errorText, normalizeCode } from '../net/Net.js';
import { CHARACTERS, lookOf } from '../characters/characters.js';
import { SKINS, getItem } from '../characters/cosmetics.js';
import { hasMinigame } from '../minigames/index.js';
import { GameManager } from './GameManager.js';
import { shuffle } from '../engine/math.js';

const SNAP_RATE = 1 / 30; // estados por segundo que o host manda
const MAX_PLAYERS = 4;

/**
 * Sala online. Quem cria a sala é o HOST: roda a simulação e manda o estado ~30x por segundo.
 * Quem entra é CLIENTE: manda só os comandos (eixos + toques de pulso/dash) e espelha o estado.
 *
 * Mensagens:
 *   cliente → host: hello{look}, char{look}, in{x,y,p,d}
 *   host → cliente: lobby{members, you, settings, code}, start{plan, you, ids, idx, circuit, totals, ...},
 *                   s{...estado}, full
 * `look` = { characterId, skin, acc, pose }: a aparência escolhida vale para a sala, todas as rodadas
 * e os resultados. A sala continua a mesma entre as rodadas de um Circuito.
 */
/** Aparência recebida pela rede: só aceita ids que existem no catálogo. */
function cleanLook(l) {
  const ch = CHARACTERS.find((c) => c.id === l?.characterId) || CHARACTERS[0];
  const ok = (id, type) => (getItem(id)?.type === type ? id : null);
  return { characterId: ch.id, skin: (SKINS[ch.id] || []).some((s) => s.id === l?.skin) ? l.skin : null, acc: ok(l?.acc, 'acc'), pose: ok(l?.pose, 'pose') };
}
export class OnlineSession {
  constructor(gm) {
    this.gm = gm;
    this.net = new Net();
    this.role = null;
    this.code = '';
    this.members = []; // host: [{ id, conn, look }]; cliente: cópia do lobby
    this.round = null; // host: { plan, ids, idx, circuit, id } da sessão em andamento
    this.you = 0;
    this.inMatch = false;
    this.sendT = 0;
    this.lastIn = '';
    this.inT = 0;
    this.playerIndexById = new Map();
    const lc = gm.state.lastConfig;
    this.settings = { bots: 0, difficulty: lc.difficulty, points: lc.points, time: lc.time, mode: lc.mode, minigameId: lc.minigameId, seq: [...(lc.seq || [])] };
    this.net.onMessage = (conn, msg) => (this.role === 'host' ? this._hostMsg(conn, msg) : this._clientMsg(msg));
    this.net.onConnect = () => {};
    this.net.onClose = (conn) => (this.role === 'host' ? this._hostDrop(conn) : this._lost('O anfitrião saiu da sala.'));
    this.net.onError = (err) => {
      if (this.role === 'client') this._lost(errorText(err));
    };
    this.netStatus = 'online';
    this.net.onStatus = (st) => {
      if (st === this.netStatus) return;
      this.netStatus = st;
      if (!this.inMatch && this.gm.ui.current === 'lobby') this.gm.ui.show('lobby', this.lobbyData());
    };
    this.wakeLock = null;
    this._onVis = () => {
      if (document.visibilityState === 'visible' && this.role) this._keepAwake();
    };
    document.addEventListener('visibilitychange', this._onVis);
  }

  /** Tela sempre acesa enquanto a sala está aberta (no celular, bloquear a tela derruba a sala). */
  async _keepAwake() {
    try {
      if (!this.wakeLock && navigator.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => (this.wakeLock = null));
      }
    } catch {
      /* sem suporte ou sem permissão: segue sem */
    }
  }

  /** Link que já entra direto na sala. */
  inviteUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('sala', this.code);
    const peer = new URLSearchParams(location.search).get('peer');
    if (peer) u.searchParams.set('peer', peer);
    return u.toString();
  }

  /** Compartilha o convite (menu nativo do celular) ou copia o link. */
  async share() {
    const url = this.inviteUrl();
    const text = `Bora jogar Treta Party! Sala ${this.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Treta Party', text, url });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.gm.ui.toast('Link copiado! Cole na conversa com seu amigo.');
    } catch {
      this.gm.ui.toast(url);
    }
  }

  get isHost() {
    return this.role === 'host';
  }

  // ---------- criar / entrar ----------
  async host() {
    this.role = 'host';
    this.gm.ui.show('online', { busy: 'Criando sala…' });
    try {
      this.code = await this.net.host();
    } catch (err) {
      this.gm.ui.show('online', { error: errorText(err) });
      this.role = null;
      return;
    }
    this.members = [{ id: 'host', conn: null, look: this.gm.state.look() }];
    this._keepAwake();
    this.showLobby();
  }

  async join(code) {
    code = normalizeCode(code);
    if (code.length !== 4) {
      this.gm.ui.show('online', { error: 'O código tem 4 letras/números.', code });
      return;
    }
    this.role = 'client';
    this.code = code;
    this.gm.ui.show('online', { busy: 'Entrando na sala ' + code + '…', code });
    try {
      this.conn = await this.net.join(code);
    } catch (err) {
      this.role = null;
      this.gm.ui.show('online', { error: errorText(err), code });
      return;
    }
    this._keepAwake();
    this.net.send(this.conn, { t: 'hello', look: this.gm.state.look() });
  }

  leave() {
    document.removeEventListener('visibilitychange', this._onVis);
    this.wakeLock?.release?.().catch?.(() => {});
    this.wakeLock = null;
    this.net.close();
    this.role = null;
    this.inMatch = false;
  }

  _lost(message) {
    if (!this.role) return;
    this.leave();
    this.gm.onlineLost(message);
  }

  // ---------- lobby ----------
  lobbyData() {
    return {
      code: this.code,
      isHost: this.isHost,
      you: this.you,
      members: this.members.map((m) => ({ look: m.look })),
      settings: this.settings,
      maxPlayers: MAX_PLAYERS,
      status: this.isHost ? this.netStatus : 'online',
      canShare: true,
    };
  }

  showLobby() {
    this.inMatch = false;
    if (this.gm.mode !== 'menu') this.gm.toMenu(false);
    this.gm.ui.show('lobby', this.lobbyData());
  }

  _broadcastLobby() {
    this.members.forEach((m, i) => {
      if (m.conn) this.net.send(m.conn, { t: 'lobby', code: this.code, you: i, members: this.members.map((x) => ({ look: x.look })), settings: this.settings });
    });
    if (!this.inMatch && this.gm.ui.current === 'lobby') this.gm.ui.show('lobby', this.lobbyData());
  }

  /** Personagens não se repetem na sala: se o pedido já tem dono, cai no primeiro livre (sem a skin). */
  _freeLook(look, exceptIndex = -1) {
    look = cleanLook(look);
    const taken = new Set(this.members.filter((_, i) => i !== exceptIndex).map((m) => m.look.characterId));
    if (!taken.has(look.characterId)) return look;
    const free = CHARACTERS.find((c) => !taken.has(c.id));
    return free ? { ...look, characterId: free.id, skin: null } : look;
  }

  /** Escolha de personagem feita na tela da sala (a skin equipada daquele personagem vai junto). */
  setCharacter(id) {
    this.gm.state.lastConfig.characterId = id;
    this.gm.state.save();
    const look = this.gm.state.look(id);
    if (this.isHost) {
      this.members[0].look = this._freeLook(look, 0);
      this._broadcastLobby();
    } else {
      this.net.send(this.conn, { t: 'char', look });
    }
  }

  /** Opções da sala (só o host): modo, minigame, sequência do circuito, bots, dificuldade... */
  setOptions(patch) {
    if (!this.isHost) return;
    Object.assign(this.settings, patch);
    const lc = this.gm.state.lastConfig;
    for (const k of ['mode', 'minigameId', 'seq', 'difficulty', 'points', 'time']) if (k in patch) lc[k] = patch[k];
    this.gm.state.save();
    this._broadcastLobby();
  }

  // ---------- host ----------
  _hostMsg(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const idx = this.members.findIndex((m) => m.conn === conn);
    if (msg.t === 'hello') {
      if (idx >= 0) return;
      if (this.members.length >= MAX_PLAYERS || this.inMatch) {
        this.net.send(conn, { t: 'full', reason: this.inMatch ? 'A partida já começou. Espere acabar e tente de novo.' : 'A sala está cheia.' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.members.push({ id: conn.peer, conn, look: this._freeLook(msg.look) });
      this.settings.bots = Math.min(this.settings.bots, MAX_PLAYERS - this.members.length);
      this.gm.audio.play('ui');
      this._broadcastLobby();
    } else if (msg.t === 'char' && idx > 0 && !this.inMatch) {
      this.members[idx].look = this._freeLook(msg.look, idx);
      this._broadcastLobby();
    } else if (msg.t === 'in' && this.inMatch) {
      const pi = this.playerIndexById.get(conn.peer);
      if (pi !== undefined) this.gm.mg?.setRemoteInput?.(pi, msg);
    }
  }

  _hostDrop(conn) {
    const idx = this.members.findIndex((m) => m.conn === conn);
    if (idx < 0) return;
    this.members.splice(idx, 1);
    if (this.inMatch) {
      const pi = this.playerIndexById.get(conn.peer);
      if (pi !== undefined) this.gm.mg?.dropRemote?.(pi);
      this.gm.hud.banner('Um jogador saiu', { sub: 'Um bot assumiu o lugar dele', color: 0xff8a6b });
    }
    this._broadcastLobby();
  }

  /** Host: começa (ou recomeça do zero) a partida ou o circuito para todos. */
  startGame() {
    if (!this.isHost) return;
    const s = this.settings;
    const taken = new Set(this.members.map((m) => m.look.characterId));
    const botChars = shuffle(CHARACTERS.filter((c) => !taken.has(c.id)));
    const bots = Math.max(0, Math.min(s.bots, MAX_PLAYERS - this.members.length, botChars.length));
    // no mínimo 2 jogadores na arena
    const nBots = this.members.length + bots < 2 ? 1 : bots;
    const plan = [
      ...this.members.map((m) => ({ kind: 'human', id: m.id, ...m.look })),
      ...botChars.slice(0, nBots).map((c) => ({ kind: 'bot', characterId: c.id, difficulty: s.difficulty })),
    ];
    this.round = { plan, ids: GameManager.sequence(s), circuit: s.mode === 'circuit', id: GameManager.matchId(), idx: 0, totals: null, wins: null, last: null };
    this._launch();
  }

  /** Host: próxima rodada do circuito, levando a pontuação acumulada. Todos seguem na mesma sala. */
  nextRound() {
    const S = this.gm.session, R = this.round;
    if (!this.isHost || !R || !S || !R.circuit || R.idx >= R.ids.length - 1) return;
    Object.assign(R, { idx: R.idx + 1, totals: [...S.totals], wins: [...S.wins], last: [...S.last] });
    this._launch();
  }

  /** Host: recomeça a rodada atual (menu de pausa). */
  restartRound() {
    if (this.isHost && this.round) this._launch();
  }

  _launch() {
    const R = this.round, s = this.settings;
    // quem saiu da sala no meio do circuito vira bot nas rodadas seguintes
    const here = new Set(this.members.map((m) => m.id));
    for (const p of R.plan) {
      if (p.kind === 'human' && !here.has(p.id)) {
        p.kind = 'bot';
        p.difficulty = 'normal';
      }
    }
    this.playerIndexById = new Map(R.plan.map((p, i) => [p.kind === 'human' ? p.id : null, i]).filter(([id]) => id));
    const base = { t: 'start', plan: R.plan.map(({ id, ...p }) => p), points: s.points, time: s.time, ids: R.ids, idx: R.idx, circuit: R.circuit, id: R.id, totals: R.totals, wins: R.wins, last: R.last };
    for (const m of this.members) if (m.conn) this.net.send(m.conn, { ...base, you: this.playerIndexById.get(m.id) });
    this.inMatch = true;
    this.sendT = 0;
    this._begin(base, this.playerIndexById.get('host'), 'host');
  }

  /** Abre a rodada nesta máquina a partir da mensagem de início (igual para host e cliente). */
  _begin(msg, you, role) {
    const ids = (msg.ids || []).filter(hasMinigame);
    if (!ids.length) return;
    this.gm.startSession({
      ids, circuit: !!msg.circuit, players: this._players(msg.plan, you), points: msg.points, time: msg.time, matchId: `${msg.id}:${this.code}`,
      net: { role }, idx: Math.min(msg.idx | 0, ids.length - 1), totals: msg.totals ? [...msg.totals] : null, wins: msg.wins ? [...msg.wins] : null, last: msg.last ? [...msg.last] : null,
    });
  }

  /** Converte o plano de jogadores para a visão de quem está nesta máquina (`you`). */
  _players(plan, you) {
    return plan.map((p, i) => ({
      ...lookOf(p.kind === 'human' ? cleanLook(p) : p),
      difficulty: p.difficulty || 'normal',
      isHuman: p.kind === 'human' && i === you,
      isRemote: p.kind === 'human' && i !== you,
    }));
  }

  // ---------- cliente ----------
  _clientMsg(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'lobby') {
      this.code = msg.code;
      this.you = msg.you;
      this.members = msg.members;
      this.settings = msg.settings;
      if (!this.inMatch || this.gm.mode === 'result') this.showLobby();
    } else if (msg.t === 'start') {
      this.inMatch = true;
      this._begin(msg, msg.you, 'client');
    } else if (msg.t === 's' && this.inMatch) {
      this.gm.mg?.applySnapshot?.(msg.s);
    } else if (msg.t === 'full') {
      this._lost(msg.reason);
    }
  }

  // ---------- quadro a quadro ----------
  update(dt) {
    if (!this.inMatch || !this.gm.mg) return;
    const mg = this.gm.mg;
    if (this.isHost) {
      this.sendT += dt;
      if (this.sendT >= SNAP_RATE) {
        this.sendT = 0;
        const snap = mg.netSnapshot(); // sempre drena os eventos, mesmo sem ninguém conectado
        if (this.net.conns.size) this.net.broadcast({ t: 's', s: snap });
      }
    } else if (mg.netInput) {
      const m = mg.netInput();
      const key = `${m.x},${m.y},${m.p},${m.d}`;
      this.inT += dt;
      if (key !== this.lastIn || this.inT > 0.25) {
        this.lastIn = key;
        this.inT = 0;
        this.net.send(this.conn, { t: 'in', ...m });
      }
    }
  }
}
