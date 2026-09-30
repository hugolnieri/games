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
  'peer-unavailable': 'Sala não encontrada. Confira o código.',
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
  }

  /** Cria a sala. Resolve com o código. */
  host(tries = 4) {
    return new Promise((resolve, reject) => {
      const code = randomCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      let opened = false;
      peer.on('open', () => {
        opened = true;
        this.peer = peer;
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

  /** Entra na sala de outro jogador. */
  join(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined, peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (err) => {
        if (done) return this.onError(err);
        done = true;
        clearTimeout(timer);
        peer.destroy();
        reject(err);
      };
      const timer = setTimeout(() => fail({ type: 'timeout', message: 'Tempo esgotado ao conectar. Confira o código e a internet.' }), 15000);
      peer.on('error', fail);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + normalizeCode(code), { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this._wire(conn, false);
          resolve(conn);
        });
        conn.on('error', fail);
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
    for (const c of this.conns) c.close();
    this.conns.clear();
    this.peer?.destroy();
    this.peer = null;
  }
}
