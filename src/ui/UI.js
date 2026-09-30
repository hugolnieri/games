import { hexToCss } from '../engine/math.js';
import { CHARACTERS, getCharacter } from '../characters/characters.js';
import { MINIGAMES, COMING_SOON, getMinigame } from '../minigames/index.js';

const DIFFICULTY = [
  ['easy', 'Fácil', 'Persegue a bola sem prever o ricochete e se afoba no pulso.'],
  ['normal', 'Normal', 'Prevê onde a bola vai cruzar o trilho e defende com calma.'],
  ['hard', 'Difícil', 'Prevê ricochetes, lê o reator, usa dash e mira no mais fraco.'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Camada de telas em DOM por cima do canvas. Cada tela é um template;
 * cliques em [data-action] viram chamadas para onAction(action, dataset).
 */
export class UI {
  constructor(root, { state, portraits, audio }) {
    this.state = state;
    this.portraits = portraits;
    this.audio = audio;
    this.el = document.createElement('div');
    this.el.className = 'screens';
    root.appendChild(this.el);
    this.current = null;
    this.onAction = () => {};
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (b && this.el.contains(b)) this._action(b);
    });
    // Enter no campo do código da sala = ENTRAR
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'net-code') {
        e.preventDefault();
        this.el.querySelector('[data-action="net-join"]')?.click();
      }
    });
    this.el.addEventListener('input', (e) => {
      if (e.target.id === 'net-code') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      const t = e.target;
      if (t.dataset.setting) this.onAction('setting', { key: t.dataset.setting, value: parseFloat(t.value) });
    });
  }

  _action(b) {
    const a = b.dataset.action;
    if (a === 'set') {
      const { key, value, type } = b.dataset;
      this.state.lastConfig[key] = type === 'num' ? Number(value) : value;
      this.state.save();
      this._press(b);
      if (key === 'minigameId') {
        // opções (ex.: número de oponentes) dependem do minigame: redesenha mantendo o foco
        this.audio.play('ui');
        this.show('setup');
        this.el.querySelector(`[data-key="minigameId"][data-value="${value}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (key === 'difficulty') {
        const d = DIFFICULTY.find((x) => x[0] === value);
        const hint = this.el.querySelector('#diff-hint');
        if (hint && d) hint.textContent = d[2];
      }
      this.audio.play('ui');
      return;
    }
    if (a === 'setting') {
      const raw = b.dataset.value;
      const value = raw === 'true' ? true : raw === 'false' ? false : raw;
      this._press(b);
      this.audio.play('ui');
      this.onAction('setting', { key: b.dataset.key, value });
      return;
    }
    this.audio.play(a === 'back' || a === 'menu' || a === 'net-leave' ? 'uiBack' : 'ui');
    const data = { ...b.dataset };
    if (a === 'net-join') data.code = this.el.querySelector('#net-code')?.value || '';
    this.onAction(a, data);
  }

  _press(b) {
    const group = b.closest('[data-group]');
    if (!group) return;
    group.querySelectorAll('[aria-pressed]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
  }

  // ---------- navegação por setas / controle ----------
  _focusables() {
    return [...this.el.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((e) => e.offsetParent !== null);
  }

  /** Move o foco para o elemento mais próximo na direção pedida (navegação espacial simples). */
  moveFocus(dir) {
    const items = this._focusables();
    if (!items.length) return;
    const cur = document.activeElement;
    if (!cur || !this.el.contains(cur)) {
      (this.el.querySelector('[data-autofocus]') || items[0]).focus();
      return;
    }
    if (cur.type === 'text' && (dir === 'left' || dir === 'right')) return; // setas movem o cursor no campo
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (dir === 'left') cur.stepDown();
      else cur.stepUp();
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const vertical = dir === 'up' || dir === 'down';
    let aligned = null, alignedMain = Infinity, near = null, nearScore = Infinity, nearMain = Infinity, nearSide = 0;
    for (const el of items) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const main = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const side = vertical ? Math.abs(dx) : Math.abs(dy);
      if (main <= 4) continue;
      // alinhado = mesma linha (esq./dir.) ou mesma coluna (cima/baixo)
      const overlap = vertical ? r.right > r0.left && r.left < r0.right : r.bottom > r0.top && r.top < r0.bottom;
      if (overlap && main < alignedMain) {
        alignedMain = main;
        aligned = el;
      }
      if (main < side * 0.15) continue; // quase perpendicular: não conta como "nessa direção"
      const score = main + side * 1.2;
      if (score < nearScore) {
        nearScore = score;
        near = el;
        nearMain = main;
        nearSide = side;
      }
    }
    // prefere o alinhado; só troca por outro se ele estiver bem "reto" na direção e muito mais perto
    const nearIsStraight = near && nearMain >= nearSide * 1.5;
    const best = aligned && !(nearIsStraight && nearMain * 2.5 < alignedMain) ? aligned : near;
    if (best) {
      best.focus();
      best.scrollIntoView?.({ block: 'nearest' });
      this.audio.play('tick');
    }
  }

  /** "Aperta" o elemento focado (botão A do controle). */
  activate() {
    const cur = document.activeElement;
    if (cur && this.el.contains(cur) && cur.tagName === 'BUTTON') cur.click();
    else this.moveFocus('down');
  }

  /** Aviso rápido no rodapé da tela. */
  toast(text) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.getElementById('ui').appendChild(t);
    }
    t.textContent = text;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), 3500);
  }

  back() {
    if (['setup', 'howto', 'settings', 'online'].includes(this.current)) {
      this.audio.play('uiBack');
      this.show('main');
    }
  }

  show(name, data) {
    this.current = name;
    if (!name) {
      this.el.innerHTML = '';
      this.el.classList.remove('on');
      delete this.el.dataset.screen;
      return;
    }
    this.el.innerHTML = this[`_${name}`](data);
    this.el.classList.add('on');
    this.el.dataset.screen = name;
    const f = this.el.querySelector('[data-autofocus]');
    if (f) f.focus({ preventScroll: true });
  }

  // ---------- helpers ----------
  _opt(key, value, label, current, type = 'str') {
    const on = String(current) === String(value);
    return `<button class="opt" data-action="set" data-key="${key}" data-value="${value}" data-type="${type}" aria-pressed="${on}">${label}</button>`;
  }
  _setOpt(key, value, label, current) {
    return `<button class="opt" data-action="setting" data-key="${key}" data-value="${value}" aria-pressed="${String(current) === String(value)}">${label}</button>`;
  }

  /** Minigame escolhido na última configuração (menu, "Como jogar" e setup seguem ele). */
  _selected() {
    return getMinigame(this.state.lastConfig.minigameId);
  }

  // ---------- telas ----------
  _main() {
    const mg = this._selected().meta;
    return `
    <section class="screen screen--main">
      <div class="menu-col">
        <h1 class="logo" aria-label="Treta Party"><span class="logo-1">TRETA</span><span class="logo-2">PARTY</span></h1>
        <p class="badge">Minigame ${mg.number}: ${esc(mg.name)}</p>
        <nav class="menu-buttons" aria-label="Menu principal">
          <button class="btn btn--primary btn--xl" data-action="play" data-autofocus>JOGAR</button>
          <button class="btn btn--online" data-action="online">JOGAR ONLINE</button>
          <button class="btn" data-action="howto">COMO JOGAR</button>
          <button class="btn" data-action="settings">CONFIGURAÇÕES</button>
        </nav>
        <p class="menu-foot">Funciona com teclado, controle ou toque.</p>
      </div>
    </section>`;
  }

  _setup() {
    const c = this.state.lastConfig;
    const diff = DIFFICULTY.find((d) => d[0] === c.difficulty) || DIFFICULTY[1];
    const sel = this._selected().meta;
    const selectedId = sel.id;
    const botOpts = [];
    for (let n = Math.max(1, sel.minPlayers - 1); n <= Math.min(CHARACTERS.length, sel.maxPlayers) - 1; n++) botOpts.push(n);
    const bots = Math.min(Math.max(c.bots, botOpts[0]), botOpts[botOpts.length - 1]);
    const mgCards = MINIGAMES.map(
      (M) => `<button class="mg-card" data-action="set" data-key="minigameId" data-value="${M.meta.id}" aria-pressed="${M.meta.id === selectedId}"><span class="mg-num">${M.meta.number}</span><b>${esc(M.meta.name)}</b><span>${esc(M.meta.tagline)}</span></button>`,
    ).join('');
    const soon = Array.from({ length: COMING_SOON }, (_, i) => `<div class="mg-card is-soon" aria-hidden="true"><span class="mg-num">0${MINIGAMES.length + i + 1}</span><b>Em breve</b></div>`).join('');
    const chars = CHARACTERS.map(
      (ch) => `
      <button class="char" data-action="set" data-key="characterId" data-value="${ch.id}" aria-pressed="${c.characterId === ch.id}" style="--c:${hexToCss(ch.color)}">
        <img src="${this.portraits[ch.id] || ''}" alt="" width="128" height="128">
        <span class="char-name">${esc(ch.name)}</span>
        <span class="char-sp">${esc(ch.species)}</span>
      </button>`,
    ).join('');
    return `
    <section class="screen screen--panel">
      <div class="panel panel--setup" role="dialog" aria-labelledby="setup-title">
        <header class="panel-head">
          <h2 id="setup-title">Nova partida</h2>
          <button class="btn btn--ghost" data-action="back">Voltar</button>
        </header>
        <div class="field">
          <h3>Minigame</h3>
          <div class="mg-row" data-group>${mgCards}${soon}</div>
        </div>
        <div class="field">
          <h3>Seu personagem</h3>
          <div class="char-grid" data-group>${chars}</div>
        </div>
        <div class="field-grid">
          <div class="field">
            <h3>Oponentes</h3>
            <div class="seg" data-group>${botOpts.map((n) => this._opt('bots', n, n, bots, 'num')).join('')}</div>
          </div>
          <div class="field">
            <h3>Pontos para começar</h3>
            <div class="seg" data-group>${[5, 10, 15].map((n) => this._opt('points', n, n, c.points, 'num')).join('')}</div>
          </div>
          <div class="field">
            <h3>Tempo</h3>
            <div class="seg" data-group>${[[120, '2:00'], [180, '3:00'], [0, 'Sem limite']].map(([v, l]) => this._opt('time', v, l, c.time, 'num')).join('')}</div>
          </div>
        </div>
        <div class="setup-bottom">
          <div class="field">
            <h3>Dificuldade dos bots</h3>
            <div class="seg" data-group>${DIFFICULTY.map(([v, l]) => this._opt('difficulty', v, l, c.difficulty)).join('')}</div>
            <p class="hint" id="diff-hint">${diff[2]}</p>
          </div>
          <footer class="panel-foot">
            <button class="btn btn--primary btn--xl" data-action="start" data-autofocus>COMEÇAR</button>
          </footer>
        </div>
      </div>
    </section>`;
  }

  _howto() {
    const meta = this._selected().meta;
    const h = meta.howTo;
    const keys = h.controls.map(([k, d]) => `<li>${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join(' ')} <span>${esc(d)}</span></li>`).join('');
    return `
    <section class="screen screen--panel">
      <div class="panel panel--howto" role="dialog" aria-labelledby="howto-title">
        <header class="panel-head">
          <h2 id="howto-title">Como jogar: ${esc(meta.name)}</h2>
          <button class="btn btn--ghost" data-action="back" data-autofocus>Voltar</button>
        </header>
        <div class="howto${h.diagram ? '' : ' howto--text'}">
          ${h.diagram || ''}
          <div class="howto-text">
            <p class="lead">${esc(h.objective)}</p>
            <h3>Controles</h3>
            <ul class="keys">${keys}</ul>
            ${h.gamepad ? `<p class="small">${esc(h.gamepad)}</p>` : ''}
            <h3>Regras</h3>
            <ul class="rules">${h.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            <h3>Vitória</h3>
            <p>${esc(h.victory)}</p>
          </div>
        </div>
      </div>
    </section>`;
  }

  _settings() {
    const s = this.state.settings;
    return `
    <section class="screen screen--panel">
      <div class="panel panel--settings" role="dialog" aria-labelledby="settings-title">
        <header class="panel-head">
          <h2 id="settings-title">Configurações</h2>
          <button class="btn btn--ghost" data-action="back" data-autofocus>Voltar</button>
        </header>
        <div class="set-row">
          <label for="vol">Volume dos efeitos</label>
          <input id="vol" type="range" min="0" max="1" step="0.05" value="${s.sfxVolume}" data-setting="sfxVolume">
        </div>
        <div class="set-row"><span>Música</span><div class="seg" data-group>${this._setOpt('music', true, 'Ligada', s.music)}${this._setOpt('music', false, 'Desligada', s.music)}</div></div>
        <div class="set-row"><span>Tremor de câmera</span><div class="seg" data-group>${this._setOpt('shake', true, 'Ligado', s.shake)}${this._setOpt('shake', false, 'Desligado', s.shake)}</div></div>
        <div class="set-row"><span>Qualidade gráfica</span><div class="seg" data-group>${this._setOpt('quality', 'high', 'Alta', s.quality)}${this._setOpt('quality', 'low', 'Leve', s.quality)}</div></div>
        <p class="hint">Use "Leve" se o jogo engasgar em notebook ou celular.</p>
      </div>
    </section>`;
  }

  _pause({ online = false, isHost = false } = {}) {
    if (online) {
      return `
    <section class="screen screen--center screen--overlay">
      <div class="panel panel--pause" role="dialog" aria-labelledby="pause-title">
        <h2 id="pause-title">Menu</h2>
        <p class="hint">A partida online continua rolando enquanto este menu está aberto.</p>
        <div class="stack">
          <button class="btn btn--primary" data-action="resume" data-autofocus>VOLTAR AO JOGO</button>
          ${isHost ? '<button class="btn" data-action="restart">REINICIAR PARA TODOS</button>' : ''}
          <button class="btn" data-action="net-leave">SAIR DA SALA</button>
        </div>
      </div>
    </section>`;
    }
    return `
    <section class="screen screen--center">
      <div class="panel panel--pause" role="dialog" aria-labelledby="pause-title">
        <h2 id="pause-title">Pausado</h2>
        <div class="stack">
          <button class="btn btn--primary" data-action="resume" data-autofocus>CONTINUAR</button>
          <button class="btn" data-action="restart">REINICIAR</button>
          <button class="btn" data-action="menu">MENU PRINCIPAL</button>
        </div>
      </div>
    </section>`;
  }

  // ---------- online ----------
  _online({ error = '', busy = '', code = '' } = {}) {
    const chars = CHARACTERS.map(
      (ch) => `
      <button class="char char--sm" data-action="set" data-key="characterId" data-value="${ch.id}" aria-pressed="${this.state.lastConfig.characterId === ch.id}" style="--c:${hexToCss(ch.color)}">
        <img src="${this.portraits[ch.id] || ''}" alt="" width="72" height="72">
        <span class="char-name">${esc(ch.name)}</span>
      </button>`,
    ).join('');
    return `
    <section class="screen screen--panel">
      <div class="panel panel--online" role="dialog" aria-labelledby="online-title">
        <header class="panel-head">
          <h2 id="online-title">Jogar online</h2>
          <button class="btn btn--ghost" data-action="back">Voltar</button>
        </header>
        <p class="lead-sm">Um cria a sala e passa o código de 4 letras; o outro digita o código. Até 4 pessoas, e dá para completar com bots.</p>
        ${error ? `<p class="net-msg net-msg--error" role="alert">${esc(error)}</p>` : ''}
        ${busy ? `<p class="net-msg" role="status">${esc(busy)}</p>` : ''}
        <div class="field">
          <h3>Seu personagem</h3>
          <div class="char-grid" data-group>${chars}</div>
        </div>
        <div class="net-cols">
          <div class="net-box">
            <h3>Criar sala</h3>
            <p class="hint">Você é o anfitrião: escolhe as regras e começa a partida.</p>
            <button class="btn btn--primary" data-action="net-host" ${busy ? 'disabled' : ''} data-autofocus>CRIAR SALA</button>
          </div>
          <div class="net-box">
            <h3>Entrar numa sala</h3>
            <label class="hint" for="net-code">Código que seu amigo passou</label>
            <div class="net-join">
              <input id="net-code" class="net-code" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="4" placeholder="ABCD" value="${esc(code)}">
              <button class="btn" data-action="net-join" ${busy ? 'disabled' : ''}>ENTRAR</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  _lobby(d) {
    const members = d.members
      .map((m, i) => {
        const ch = getCharacter(m.characterId);
        const tags = [i === 0 ? 'anfitrião' : '', i === d.you ? 'você' : ''].filter(Boolean).map((t) => `<em>${t}</em>`).join('');
        return `<li class="member" style="--c:${hexToCss(ch.color)}"><img src="${this.portraits[ch.id] || ''}" alt="" width="48" height="48"><b>${esc(ch.name)}</b>${tags}</li>`;
      })
      .join('');
    const empty = Math.max(0, d.maxPlayers - d.members.length);
    const slots = Array.from({ length: empty }, (_, i) => `<li class="member member--empty">${i < d.settings.bots ? 'Bot' : 'Vaga livre'}</li>`).join('');
    const mine = d.members[d.you]?.characterId;
    const chars = CHARACTERS.map((ch) => {
      const takenBy = d.members.findIndex((m) => m.characterId === ch.id);
      const taken = takenBy >= 0 && takenBy !== d.you;
      return `
      <button class="char char--sm" data-action="net-char" data-value="${ch.id}" aria-pressed="${mine === ch.id}" ${taken ? 'disabled' : ''} style="--c:${hexToCss(ch.color)}">
        <img src="${this.portraits[ch.id] || ''}" alt="" width="72" height="72">
        <span class="char-name">${esc(ch.name)}</span>
      </button>`;
    }).join('');
    const s = d.settings;
    const opt = (key, value, label) =>
      `<button class="opt" data-action="net-set" data-key="${key}" data-value="${value}" data-type="${typeof value === 'number' ? 'num' : 'str'}" aria-pressed="${String(s[key]) === String(value)}" ${d.isHost ? '' : 'disabled'}>${label}</button>`;
    const maxBots = Math.max(0, d.maxPlayers - d.members.length);
    const botOpts = Array.from({ length: maxBots + 1 }, (_, n) => opt('bots', n, n)).join('');
    const canStart = d.members.length >= 2;
    return `
    <section class="screen screen--panel">
      <div class="panel panel--lobby" role="dialog" aria-labelledby="lobby-title">
        <header class="panel-head">
          <h2 id="lobby-title">Sala <span class="room-code">${esc(d.code)}</span></h2>
          <button class="btn btn--ghost" data-action="net-leave">Sair</button>
        </header>
        ${
          d.isHost
            ? `<div class="invite">
                <p class="lead-sm">Mande o convite para seu amigo: o link já entra direto na sala. Ou passe o código <b>${esc(d.code)}</b> (ele digita em <b>JOGAR ONLINE → Entrar numa sala</b>).</p>
                <button class="btn btn--online" data-action="net-share">ENVIAR CONVITE</button>
              </div>
              <p class="hint">No celular, deixe esta tela aberta até seu amigo entrar. Se sair do jogo, a sala tenta se reconectar sozinha quando você voltar.</p>
              ${d.status !== 'online' ? '<p class="net-msg" role="status">Reconectando a sala ao servidor…</p>' : ''}`
            : '<p class="lead-sm">Você está na sala! Esperando o anfitrião começar a partida.</p>'
        }
        <div class="field">
          <h3>Jogadores</h3>
          <ul class="members">${members}${slots}</ul>
        </div>
        <div class="field">
          <h3>Seu personagem</h3>
          <div class="char-grid">${chars}</div>
        </div>
        <div class="field-grid">
          <div class="field"><h3>Bots</h3><div class="seg">${botOpts}</div></div>
          <div class="field"><h3>Pontos</h3><div class="seg">${[5, 10, 15].map((n) => opt('points', n, n)).join('')}</div></div>
          <div class="field"><h3>Tempo</h3><div class="seg">${[[120, '2:00'], [180, '3:00'], [0, 'Sem limite']].map(([v, l]) => opt('time', v, l)).join('')}</div></div>
        </div>
        <div class="setup-bottom">
          <div class="field">
            <h3>Dificuldade dos bots</h3>
            <div class="seg">${DIFFICULTY.map(([v, l]) => opt('difficulty', v, l)).join('')}</div>
          </div>
          <footer class="panel-foot">
            ${d.isHost ? `<button class="btn btn--primary btn--xl" data-action="net-start" ${canStart ? 'data-autofocus' : 'disabled'}>COMEÇAR</button>` : '<p class="net-wait">Aguardando o anfitrião…</p>'}
          </footer>
        </div>
        ${d.isHost && !canStart ? '<p class="hint">Esperando alguém entrar na sala…</p>' : ''}
      </div>
    </section>`;
  }

  _result({ results, online = false, isHost = false }) {
    const w = results[0];
    const wdef = getCharacter(w.characterId);
    const rows = results
      .map((r) => {
        const detail = r.place === 1 ? `Venceu com ${r.points} ${r.points === 1 ? 'ponto' : 'pontos'}` : r.eliminatedAt >= 0 ? `Fora aos ${fmtTime(r.eliminatedAt)}` : `${r.points} pontos`;
        return `
        <li class="rank" style="--c:${hexToCss(r.color)}">
          <span class="rank-place">${r.place}º</span>
          <img src="${this.portraits[r.characterId] || ''}" alt="" width="48" height="48">
          <div class="rank-who"><b>${esc(r.name)}${r.isHuman ? ' <em>você</em>' : ''}</b><span>${detail}</span></div>
          <div class="rank-stats">${(r.summary || []).map((x) => `<span><b>${esc(x.value)}</b> ${esc(x.label)}</span>`).join('')}</div>
        </li>`;
      })
      .join('');
    const humanWon = w.isHuman;
    return `
    <section class="screen screen--result">
      <div class="panel panel--result" role="dialog" aria-labelledby="result-title">
        <p class="result-kicker">🏆 VENCEDOR</p>
        <div class="winner" style="--c:${hexToCss(wdef.color)}">
          <img src="${this.portraits[w.characterId] || ''}" alt="" width="112" height="112">
          <div>
            <h2 id="result-title">${esc(w.name)}</h2>
            <p>${humanWon ? 'Você levou essa!' : 'Não foi dessa vez. Revanche?'}</p>
          </div>
        </div>
        <ol class="ranking">${rows}</ol>
        <div class="result-buttons">
          ${
            online
              ? isHost
                ? '<button class="btn btn--primary" data-action="again" data-autofocus>REVANCHE</button><button class="btn" data-action="net-lobby">SALA</button><button class="btn" data-action="net-leave">SAIR</button>'
                : '<p class="net-wait">O anfitrião decide a revanche…</p><button class="btn" data-action="net-leave" data-autofocus>SAIR DA SALA</button>'
              : '<button class="btn btn--primary" data-action="again" data-autofocus>JOGAR NOVAMENTE</button><button class="btn" data-action="menu">MENU</button>'
          }
        </div>
      </div>
    </section>`;
  }
}
