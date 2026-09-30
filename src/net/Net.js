import Peer from 'peerjs';

/**
 * Conexão ponto a ponto (WebRTC via PeerJS). O servidor público do PeerJS só apresenta os dois
 * navegadores; depois os dados vão direto de um para o outro.
 *
 * Para testar sem internet, rode um PeerServer local (`npx peerjs --port 9000`) e abra o jogo com
 * `?peer=127.0.0.1:9000`.
 */
const PREFIX = 'treta-party-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I para não confundir
const ERRORS = {
  'peer-unavailable':
    'Sala não encontrada. Confira o código e peça para quem criou a sala deixar o jogo aberto na tela (no celular, trocar de app pode derrubar a sala).',
  'unavailable-id': 'Código em uso, tentando outro…',
  network: 'Sem conexão com o servidor de salas. Verifique a internet.',
  'server-error': 'O servidor de salas não respondeu. Tente de novo.',
  'socket-error': 'Sem conexão com o servidor de salas. Verifique a internet.',
  'browser-incompatible': 'Este navegador não suporta jogo online (WebRTC).',
  webrtc: 'A conexão direta falhou (rede bloqueando WebRTC).',
};

export const errorText = (err) => ERRORS[err?.type] || err?.message || 'Erro de conexão.';

function peerOptions() {
  const opts = {
    debug: 1,
    config: {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }],
    },
  };
  try {
    const custom = new URLSearchParams(location.search).get('peer');
    if (custom) {
      const [host, port] = custom.split(':');
      Object.assign(opts, { host, port: Number(port) || 9000, path: '/', secure: false });
    }
  } catch {
    /* location indisponível: usa o servidor público */
  }
  return opts;
}

const randomCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

export class Net {
  constructor() {
    this.peer = null;
    this.conns = new Set();
    this.onConnect = () => {};
    this.onMessage = () => {};
    this.onClose = () => {};
    this.onError = () => {};
    this.onStatus = () => {}; // 'online' | 'reconnecting' (host: registro da sala no servidor)
    this._reconnT = null;
    this._onVisible = () => {
      if (document.visibilityState === 'visible') this._reconnect(0);
    };
  }

  /**
   * Host: se a conexão com o servidor de salas cair (ex.: iPhone congela a aba ao trocar de app),
   * registra o mesmo código de novo. As conexões já abertas com amigos seguem funcionando.
   */
  _keepAlive(peer) {
    peer.on('disconnected', () => {
      this.onStatus('reconnecting');
      this._reconnect(800);
    });
    document.addEventListener('visibilitychange', this._onVisible);
  }

  _reconnect(delay) {
    const peer = this.peer;
    if (!peer || peer.destroyed || !peer.disconnected) return;
    clearTimeout(this._reconnT);
    this._reconnT = setTimeout(() => {
      if (!peer.destroyed && peer.disconnected) {
        try {
          peer.reconnect();
        } catch {
          /* tenta de novo abaixo */
        }
        this._reconnT = setTimeout(() => this._reconnect(0), 3000);
      }
    }, delay);
  }

  /** Cria a sala. Resolve com o código. */
  host(tries = 4) {
    return new Promise((resolve, reject) => {
      const code = randomCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => {
        this.onStatus('online');
        if (opened) return; // reabriu depois de uma reconexão
        opened = true;
        this.peer = peer;
        this._keepAlive(peer);
        resolve(code);
      });
      peer.on('connection', (conn) => this._wire(conn, true));
      peer.on('error', (err) => {
        if (!opened) {
          peer.destroy();
          if (err.type === 'unavailable-id' && tries > 0) this.host(tries - 1).then(resolve, reject);
          else reject(err);
        } else if (err.type !== 'peer-unavailable') this.onError(err);
      });
    });
  }

  /**
   * Entra na sala de outro jogador. Se a sala ainda não aparecer no servidor (o host pode estar
   * reconectando), tenta de novo por alguns segundos antes de desistir.
   */
  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, peerOptions());
      this.peer = peer;
      let done = false, tries = 0, attemptT = null;
      const finish = (err, conn) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(attemptT);
        if (err) {
          peer.destroy();
          reject(err);
        } else resolve(conn);
      };
      const timer = setTimeout(
        () => finish(tries > 0 ? { type: 'peer-unavailable' } : { type: 'timeout', message: 'Tempo esgotado ao conectar. Confira a internet.' }),
        25000,
      );
      const attempt = () => {
        if (done) return;
        tries++;
        const conn = peer.connect(PREFIX + normalizeCode(code), { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (done) return conn.close();
          this._wire(conn, false);
          finish(null, conn);
        });
      };
      peer.on('error', (err) => {
        if (done) return this.onError(err);
        if (err.type === 'peer-unavailable' && tries < 6) {
          attemptT = setTimeout(attempt, 2500); // host pode estar voltando para o jogo
          return;
        }
        finish(err);
      });
      peer.on('disconnected', () => {
        if (!done && !peer.destroyed) peer.reconnect();
      });
      peer.on('open', () => {
        if (tries === 0) attempt();
      });
    });
  }

  _wire(conn, incoming) {
    const ready = () => {
      this.conns.add(conn);
      if (incoming) this.onConnect(conn);
    };
    conn.on('data', (msg) => this.onMessage(conn, msg));
    conn.on('close', () => {
      if (this.conns.delete(conn)) this.onClose(conn);
    });
    conn.on('error', () => {
      if (this.conns.delete(conn)) this.onClose(conn);
    });
    if (conn.open) ready();
    else conn.on('open', ready);
  }

  send(conn, msg) {
    if (conn?.open) conn.send(msg);
  }

  broadcast(msg) {
    for (const c of this.conns) if (c.open) c.send(msg);
  }

  close() {
    clearTimeout(this._reconnT);
    document.removeEventListener('visibilitychange', this._onVisible);
    for (const c of this.conns) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
