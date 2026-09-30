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
    this.el.addEventListener('input', (e) => {
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
    this.audio.play(a === 'back' || a === 'menu' ? 'uiBack' : 'ui');
    this.onAction(a, { ...b.dataset });
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

  back() {
    if (['setup', 'howto', 'settings'].includes(this.current)) {
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

  _pause() {
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

  _result({ results }) {
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
          <button class="btn btn--primary" data-action="again" data-autofocus>JOGAR NOVAMENTE</button>
          <button class="btn" data-action="menu">MENU</button>
        </div>
      </div>
    </section>`;
  }
}
