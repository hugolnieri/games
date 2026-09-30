import { Net, errorText, normalizeCode } from '../net/Net.js';
import { CHARACTERS } from '../characters/characters.js';
import { shuffle } from '../engine/math.js';

const SNAP_RATE = 1 / 30; // estados por segundo que o host manda
const MAX_PLAYERS = 4;

/**
 * Sala online. Quem cria a sala é o HOST: roda a simulação e manda o estado ~30x por segundo.
 * Quem entra é CLIENTE: manda só os comandos (eixos + toques de pulso/dash) e espelha o estado.
 *
 * Mensagens:
 *   cliente → host: hello{characterId}, char{characterId}, in{x,y,p,d}
 *   host → cliente: lobby{members, you, settings, code}, start{players, points, time, you}, s{...estado}, full
 */
export class OnlineSession {
  constructor(gm) {
    this.gm = gm;
    this.net = new Net();
    this.role = null;
    this.code = '';
    this.members = []; // host: [{ id, conn, characterId }]; cliente: cópia do lobby
    this.you = 0;
    this.inMatch = false;
    this.sendT = 0;
    this.lastIn = '';
    this.inT = 0;
    this.playerIndexById = new Map();
    const lc = gm.state.lastConfig;
    this.settings = { bots: 0, difficulty: lc.difficulty, points: lc.points, time: lc.time };
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
    this.members = [{ id: 'host', conn: null, characterId: this.gm.state.lastConfig.characterId }];
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
    this.net.send(this.conn, { t: 'hello', characterId: this.gm.state.lastConfig.characterId });
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
      members: this.members.map((m) => ({ characterId: m.characterId })),
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
      if (m.conn) this.net.send(m.conn, { t: 'lobby', code: this.code, you: i, members: this.members.map((x) => ({ characterId: x.characterId })), settings: this.settings });
    });
    if (!this.inMatch && this.gm.ui.current === 'lobby') this.gm.ui.show('lobby', this.lobbyData());
  }

  _freeCharacter(prefer, exceptIndex = -1) {
    const taken = new Set(this.members.filter((_, i) => i !== exceptIndex).map((m) => m.characterId));
    if (!taken.has(prefer)) return prefer;
    return CHARACTERS.find((c) => !taken.has(c.id))?.id || prefer;
  }

  /** Escolha de personagem feita na tela da sala. */
  setCharacter(id) {
    this.gm.state.lastConfig.characterId = id;
    this.gm.state.save();
    if (this.isHost) {
      this.members[0].characterId = this._freeCharacter(id, 0);
      this._broadcastLobby();
    } else {
      this.net.send(this.conn, { t: 'char', characterId: id });
    }
  }

  /** Opções da partida (só o host). */
  setOption(key, value) {
    if (!this.isHost) return;
    this.settings[key] = value;
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
      this.members.push({ id: conn.peer, conn, characterId: this._freeCharacter(String(msg.characterId)) });
      this.settings.bots = Math.min(this.settings.bots, MAX_PLAYERS - this.members.length);
      this.gm.audio.play('ui');
      this._broadcastLobby();
    } else if (msg.t === 'char' && idx > 0 && !this.inMatch) {
      if (CHARACTERS.some((c) => c.id === msg.characterId)) this.members[idx].characterId = this._freeCharacter(msg.characterId, idx);
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

  /** Host: começa (ou recomeça) a partida para todos. */
  startGame() {
    if (!this.isHost) return;
    const s = this.settings;
    const taken = new Set(this.members.map((m) => m.characterId));
    const botChars = shuffle(CHARACTERS.filter((c) => !taken.has(c.id)));
    const bots = Math.max(0, Math.min(s.bots, MAX_PLAYERS - this.members.length, botChars.length));
    // no mínimo 2 jogadores na arena
    const nBots = this.members.length + bots < 2 ? 1 : bots;
    const plan = [
      ...this.members.map((m) => ({ kind: 'human', characterId: m.characterId, id: m.id })),
      ...botChars.slice(0, nBots).map((c) => ({ kind: 'bot', characterId: c.id, difficulty: s.difficulty })),
    ];
    this.playerIndexById = new Map(plan.map((p, i) => [p.id, i]).filter(([id]) => id));
    this.members.forEach((m, i) => {
      if (m.conn) this.net.send(m.conn, { t: 'start', plan: plan.map(({ kind, characterId, difficulty }) => ({ kind, characterId, difficulty })), you: i, points: s.points, time: s.time });
    });
    this.inMatch = true;
    this.sendT = 0;
    this.gm.startOnline(this._players(plan, 0), s, 'host');
  }

  /** Converte o plano de jogadores para a visão de quem está nesta máquina (`you`). */
  _players(plan, you) {
    return plan.map((p, i) => ({
      characterId: p.characterId,
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
      this.you = msg.you;
      this.gm.startOnline(this._players(msg.plan, msg.you), { points: msg.points, time: msg.time }, 'client');
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
