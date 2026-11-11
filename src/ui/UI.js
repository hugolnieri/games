import { hexToCss, shuffle } from '../engine/math.js';
import { CHARACTERS, getCharacter } from '../characters/characters.js';
import { SKINS, ACCESSORIES, POSES, getItem } from '../characters/cosmetics.js';
import { MINIGAMES, getMinigame, hasMinigame } from '../minigames/index.js';
import { ART } from '../assets/art.js';

const DIFFICULTY = [
  ['easy', 'Fácil', 'Reage devagar, erra a mira e esquece dos perigos.'],
  ['normal', 'Normal', 'Entende o objetivo de cada modo e joga com calma.'],
  ['hard', 'Difícil', 'Antecipa as jogadas, desvia de quase tudo e vai atrás do líder.'],
];
const MAX_SEQ = 8;
const coin = (n) => `<span class="coin" aria-hidden="true"></span>${n}`;

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
    this.shopTab = 'skin';
    this.frameSets = new Map();
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
      if (key === 'characterId' && this.current === 'setup') {
        // o retrato do escolhido mostra a skin equipada: redesenha mantendo o foco
        this.audio.play('ui');
        this._rerender(`[data-key="characterId"][data-value="${value}"]`);
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
    if (a === 'pick-mode' || a === 'pick-mg' || a === 'seq-random' || a === 'seq-clear') return this._pick(a, b);
    if (a.startsWith('shop-')) return this._shopAct(a, b.dataset);
    if (a === 'howto-mg') {
      this.howtoId = b.dataset.value;
      this.audio.play('ui');
      return this.show('howto');
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
    if (['setup', 'howto', 'settings', 'online', 'shop'].includes(this.current)) {
      this.audio.play('uiBack');
      this.show('main');
    }
  }

  /** Redesenha a tela atual preservando rolagem e foco (por seletor). */
  _rerender(focusSel, data = this.lastData) {
    const sc = this.el.querySelector('.screen')?.scrollTop || 0;
    this.show(this.current, data);
    const scr = this.el.querySelector('.screen');
    if (scr) scr.scrollTop = sc;
    if (focusSel) this.el.querySelector(focusSel)?.focus({ preventScroll: true });
  }

  /** Escolha de modo/minigames, igual no setup solo e na sala (onde só o anfitrião mexe). */
  _pick(a, b) {
    const net = this.current === 'lobby';
    const src = net ? this.lastData.settings : this.state.lastConfig;
    const patch = {};
    const v = b.dataset.value;
    if (a === 'pick-mode') patch.mode = v;
    else if (a === 'seq-clear') patch.seq = [];
    else if (a === 'seq-random') patch.seq = shuffle(MINIGAMES.map((m) => m.meta.id)).slice(0, 4);
    else if ((src.mode || 'single') === 'circuit') {
      const seq = (src.seq || []).filter(hasMinigame);
      patch.seq = seq.includes(v) ? seq.filter((x) => x !== v) : seq.length < MAX_SEQ ? [...seq, v] : seq;
    } else patch.minigameId = v;
    this.audio.play('ui');
    const sel = a === 'pick-mg' ? `[data-action="pick-mg"][data-value="${v}"]` : `[data-action="${a}"]${v ? `[data-value="${v}"]` : ''}`;
    if (net) {
      this.pendingFocus = sel;
      this.onAction('net-patch', patch);
    } else {
      Object.assign(this.state.lastConfig, patch);
      this.state.save();
      this._rerender(sel);
    }
  }

  /** Loja: compra e equipa direto no perfil salvo (GameState). */
  _shopAct(a, d) {
    const st = this.state;
    let sel = `[data-id="${d.id}"]`;
    if (a === 'shop-char') {
      st.lastConfig.characterId = d.value;
      st.save();
      sel = `[data-action="shop-char"][data-value="${d.value}"]`;
      this.audio.play('ui');
    } else if (a === 'shop-tab') {
      this.shopTab = d.value;
      sel = `[data-action="shop-tab"][data-value="${d.value}"]`;
      this.audio.play('ui');
    } else if (a === 'shop-buy') {
      const r = st.buy(d.id);
      if (r === 'ok') {
        st.equip(d.id);
        if (!st.isEquipped(d.id)) st.equip(d.id);
        this.audio.play('buy');
        this.toast(`${getItem(d.id).name} comprado e equipado!`);
      } else {
        this.audio.play('deny');
        this.toast(r === 'poor' ? 'Moedas insuficientes. Termine partidas para ganhar mais.' : 'Você já tem este item.');
      }
    } else if (a === 'shop-equip') {
      st.equip(d.id);
      this.audio.play('ui');
    } else if (a === 'shop-default') {
      st.profile.skins[st.lastConfig.characterId] = null;
      st.save();
      sel = '[data-action="shop-default"]';
      this.audio.play('ui');
    }
    this.onAction('look-changed');
    this._rerender(sel);
  }

  show(name, data) {
    const keep = name && name === this.current ? this.el.querySelector('.screen')?.scrollTop || 0 : 0;
    this.current = name;
    this.lastData = data;
    clearInterval(this._frameT);
    if (!name) {
      this.el.innerHTML = '';
      this.el.classList.remove('on');
      delete this.el.dataset.screen;
      return;
    }
    this.el.innerHTML = this[`_${name}`](data);
    this.el.classList.add('on');
    this.el.dataset.screen = name;
    if (keep) this.el.querySelector('.screen').scrollTop = keep;
    const f = (this.pendingFocus && this.el.querySelector(this.pendingFocus)) || this.el.querySelector('[data-autofocus]');
    this.pendingFocus = null;
    if (f) f.focus({ preventScroll: true });
    // prévias animadas (poses da loja): alterna os quadros
    const anim = [...this.el.querySelectorAll('img[data-frames]')];
    if (anim.length) {
      let k = 0;
      this._frameT = setInterval(() => {
        k++;
        for (const img of anim) {
          const fr = this.frameSets.get(img.dataset.frames);
          if (fr) img.src = fr[k % fr.length];
        }
      }, 150);
    }
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
  _face(look, size = 48) {
    return `<img src="${this.portraits.of(look)}" alt="" width="${size}" height="${size}">`;
  }

  /** Modo (partida única / circuito) + grade de minigames. `on` = pode mexer. */
  _modePicker(cfg, on = true) {
    const mode = cfg.mode === 'circuit' ? 'circuit' : 'single';
    const seq = (cfg.seq || []).filter(hasMinigame);
    const dis = on ? '' : 'disabled';
    const cards = MINIGAMES.map(({ meta }) => {
      const k = seq.indexOf(meta.id);
      const pressed = mode === 'circuit' ? k >= 0 : meta.id === cfg.minigameId;
      const art = ART.minigames[meta.id];
      return `<button class="mg-card${art ? ' has-art' : ''}" data-action="pick-mg" data-value="${meta.id}" aria-pressed="${pressed}" ${dis} ${art ? `style="--art:url('${art}')"` : ''}>
        <span class="mg-num">${mode === 'circuit' && k >= 0 ? `${k + 1}ª rodada` : meta.number}</span><b>${esc(meta.name)}</b><span class="mg-tag">${esc(meta.tagline)}</span></button>`;
    }).join('');
    const circuit =
      mode === 'circuit'
        ? `<div class="seq-bar">
            <p class="hint">${seq.length ? `Sequência: ${seq.map((id) => esc(getMinigame(id).meta.name)).join(' → ')}` : 'Toque nos minigames na ordem das rodadas (de 2 a 8), ou sorteie.'}</p>
            ${on ? '<button class="btn btn--sm" data-action="seq-random">SORTEAR</button><button class="btn btn--sm btn--ghost" data-action="seq-clear">Limpar</button>' : ''}
          </div>`
        : '';
    return `
      <div class="field">
        <h3>Modo</h3>
        <div class="seg" data-group>
          <button class="opt" data-action="pick-mode" data-value="single" aria-pressed="${mode === 'single'}" ${dis}>Partida única</button>
          <button class="opt" data-action="pick-mode" data-value="circuit" aria-pressed="${mode === 'circuit'}" ${dis}>Circuito</button>
        </div>
        ${mode === 'circuit' ? '<p class="hint">Várias rodadas valendo pontos (5, 3, 2 e 1). Quem somar mais é o campeão.</p>' : ''}
      </div>
      <div class="field">
        <h3>${mode === 'circuit' ? 'Rodadas do circuito' : 'Minigame'}</h3>
        <div class="mg-row">${cards}</div>
        ${circuit}
      </div>`;
  }
  /** Dá para começar com esta configuração? */
  static canStart(cfg) {
    return cfg.mode !== 'circuit' || (cfg.seq || []).filter(hasMinigame).length >= 2;
  }

  // ---------- telas ----------
  _main() {
    return `
    <section class="screen screen--main">
      <div class="menu-col">
        <h1 class="logo" aria-label="Treta Party"><span class="logo-1">TRETA</span><span class="logo-2">PARTY</span></h1>
        <p class="badge">${MINIGAMES.length} minigames · Circuito · Online</p>
        <nav class="menu-buttons" aria-label="Menu principal">
          <button class="btn btn--primary btn--xl" data-action="play" data-autofocus>JOGAR</button>
          <button class="btn btn--online" data-action="online">JOGAR ONLINE</button>
          <button class="btn btn--shop" data-action="shop">LOJA <span class="pill">${coin(this.state.profile.coins)}</span></button>
          <div class="menu-row">
            <button class="btn" data-action="howto">COMO JOGAR</button>
            <button class="btn" data-action="settings" aria-label="Configurações">⚙</button>
          </div>
        </nav>
        <p class="menu-foot">Funciona com teclado, controle ou toque.</p>
      </div>
    </section>`;
  }

  _charGrid(action, current, { taken = () => false, small = false } = {}) {
    return CHARACTERS.map((ch) => {
      const look = this.state.look(ch.id);
      const attrs = action === 'set' ? `data-action="set" data-key="characterId" data-value="${ch.id}"` : `data-action="${action}" data-value="${ch.id}"`;
      return `
      <button class="char${small ? ' char--sm' : ''}" ${attrs} aria-pressed="${current === ch.id}" ${taken(ch.id) ? 'disabled' : ''} style="--c:${hexToCss(ch.color)}">
        ${this._face(look, small ? 72 : 128)}
        <span class="char-name">${esc(ch.name)}</span>
        ${small ? '' : `<span class="char-sp">${esc(ch.species)}</span>`}
      </button>`;
    }).join('');
  }

  _setup() {
    const c = this.state.lastConfig;
    const diff = DIFFICULTY.find((d) => d[0] === c.difficulty) || DIFFICULTY[1];
    const sel = this._selected().meta;
    const single = c.mode !== 'circuit';
    const opts = single ? sel.options || [] : [];
    const ok = UI.canStart(c);
    return `
    <section class="screen screen--panel">
      <div class="panel panel--setup" role="dialog" aria-labelledby="setup-title">
        <header class="panel-head">
          <h2 id="setup-title">Nova partida</h2>
          <button class="btn btn--ghost" data-action="back">Voltar</button>
        </header>
        ${this._modePicker(c)}
        <div class="field">
          <h3>Seu personagem <button class="link" data-action="shop">trocar visual na loja</button></h3>
          <div class="char-grid" data-group>${this._charGrid('set', c.characterId)}</div>
        </div>
        <div class="field-grid">
          <div class="field">
            <h3>Oponentes</h3>
            <div class="seg" data-group>${[1, 2, 3].map((n) => this._opt('bots', n, n, Math.min(3, Math.max(1, c.bots)), 'num')).join('')}</div>
          </div>
          ${
            opts.includes('points')
              ? `<div class="field"><h3>Pontos para começar</h3><div class="seg" data-group>${[5, 10, 15].map((n) => this._opt('points', n, n, c.points, 'num')).join('')}</div></div>`
              : ''
          }
          ${
            opts.includes('time')
              ? `<div class="field"><h3>Tempo</h3><div class="seg" data-group>${[[120, '2:00'], [180, '3:00'], [0, 'Sem limite']].map(([v, l]) => this._opt('time', v, l, c.time, 'num')).join('')}</div></div>`
              : ''
          }
        </div>
        <div class="setup-bottom">
          <div class="field">
            <h3>Dificuldade dos bots</h3>
            <div class="seg" data-group>${DIFFICULTY.map(([v, l]) => this._opt('difficulty', v, l, c.difficulty)).join('')}</div>
            <p class="hint" id="diff-hint">${diff[2]}</p>
          </div>
          <footer class="panel-foot">
            <button class="btn btn--primary btn--xl" data-action="start" ${ok ? 'data-autofocus' : 'disabled'}>${single ? 'COMEÇAR' : 'COMEÇAR CIRCUITO'}</button>
          </footer>
        </div>
        ${ok ? '' : '<p class="hint">Escolha pelo menos 2 minigames para o circuito.</p>'}
      </div>
    </section>`;
  }

  _howto() {
    const meta = getMinigame(this.howtoId || this.state.lastConfig.minigameId).meta;
    const h = meta.howTo;
    const keys = h.controls.map(([k, d]) => `<li>${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join(' ')} <span>${esc(d)}</span></li>`).join('');
    const tabs = MINIGAMES.map((M) => `<button class="opt" data-action="howto-mg" data-value="${M.meta.id}" aria-pressed="${M.meta.id === meta.id}">${esc(M.meta.name)}</button>`).join('');
    const art = ART.minigames[meta.id];
    const pic = h.diagram || (art ? `<img class="howto-art" src="${art}" alt="">` : '');
    return `
    <section class="screen screen--panel">
      <div class="panel panel--howto" role="dialog" aria-labelledby="howto-title">
        <header class="panel-head">
          <h2 id="howto-title">Como jogar: ${esc(meta.name)}</h2>
          <button class="btn btn--ghost" data-action="back" data-autofocus>Voltar</button>
        </header>
        <div class="seg seg--wrap" data-group>${tabs}</div>
        <div class="howto${pic ? '' : ' howto--text'}">
          ${pic}
          <div class="howto-text">
            <p class="lead">${esc(h.objective)}</p>
            <h3>Controles</h3>
            <ul class="keys">${keys}</ul>
            ${h.gamepad ? `<p class="small">${esc(h.gamepad)}</p>` : ''}
            <p class="small">No toque: ${meta.touch?.mode === 'lr' ? 'botões ◀ ▶' : 'direcional na esquerda'}${meta.touch?.a ? `, botão “${esc(meta.touch.a)}”` : ''}${meta.touch?.b ? ` e “${esc(meta.touch.b)}”` : ''} na direita.</p>
            <h3>Regras</h3>
            <ul class="rules">${h.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
            <h3>Vitória e desempate</h3>
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
          <button class="btn" data-action="restart">REINICIAR RODADA</button>
          <button class="btn" data-action="menu">MENU PRINCIPAL</button>
        </div>
      </div>
    </section>`;
  }

  // ---------- loja ----------
  _shop() {
    const st = this.state, pr = st.profile;
    const ch = getCharacter(st.lastConfig.characterId);
    const look = st.look(ch.id);
    const tab = this.shopTab;
    const card = (it, img, extra = '') => {
      const owned = st.owns(it.id), eq = st.isEquipped(it.id);
      const btn = eq
        ? it.type === 'pose'
          ? '<span class="shop-state">Equipado</span>'
          : `<button class="btn btn--sm" data-action="shop-equip" data-id="${it.id}">TIRAR</button>`
        : owned
          ? `<button class="btn btn--sm btn--primary" data-action="shop-equip" data-id="${it.id}">EQUIPAR</button>`
          : `<button class="btn btn--sm ${pr.coins >= it.price ? 'btn--primary' : ''}" data-action="shop-buy" data-id="${it.id}" aria-label="Comprar ${esc(it.name)} por ${it.price} moedas">${coin(it.price)}</button>`;
      return `<li class="item${eq ? ' is-on' : ''}${owned ? ' is-owned' : ''}">${img}<b>${esc(it.name)}</b>${extra}${eq && it.type !== 'pose' ? '<span class="shop-state">Equipado</span>' : ''}${btn}</li>`;
    };
    let items = '';
    if (tab === 'skin') {
      const noSkin = !look.skin;
      items =
        `<li class="item${noSkin ? ' is-on' : ''} is-owned">${this._face({ ...look, skin: null }, 112)}<b>Original</b>${noSkin ? '<span class="shop-state">Equipado</span>' : '<button class="btn btn--sm btn--primary" data-action="shop-default">EQUIPAR</button>'}</li>` +
        (SKINS[ch.id] || []).map((it) => card(it, this._face({ ...look, skin: it.id }, 112))).join('');
    } else if (tab === 'acc') {
      items = ACCESSORIES.map((it) => card(it, this._face({ ...look, acc: it.id }, 112))).join('');
    } else {
      items = POSES.map((it) => {
        const key = `${ch.id}|${look.skin}|${look.acc}|${it.id}`;
        const frames = this.portraits.poseFrames({ ...look, pose: it.id });
        this.frameSets.set(key, frames);
        return card(it, `<img src="${frames[0]}" data-frames="${key}" alt="" width="112" height="112">`, `<span class="item-desc">${esc(it.desc)}</span>`);
      }).join('');
    }
    const tabs = [['skin', `Skins de ${ch.name}`], ['acc', 'Acessórios'], ['pose', 'Poses de vitória']]
      .map(([v, l]) => `<button class="opt" data-action="shop-tab" data-value="${v}" aria-pressed="${tab === v}">${esc(l)}</button>`)
      .join('');
    return `
    <section class="screen screen--panel">
      <div class="panel panel--shop" role="dialog" aria-labelledby="shop-title">
        <header class="panel-head">
          <h2 id="shop-title">Loja</h2>
          <span class="wallet" aria-label="Saldo: ${pr.coins} moedas">${coin(pr.coins)}</span>
          <button class="btn btn--ghost" data-action="back" data-autofocus>Voltar</button>
        </header>
        ${ART.key ? `<img class="panel-banner" src="${ART.key}" alt="">` : ''}
        <p class="lead-sm">Tudo aqui é só visual. Você ganha moedas terminando partidas (mais para quem chega na frente) e o que equipar aparece em todos os minigames, na sala e nos resultados.</p>
        <div class="shop-top">
          <div class="shop-me" style="--c:${hexToCss(ch.color)}">${this._face(look, 160)}<b>${esc(ch.name)}</b></div>
          <div class="field">
            <h3>Seu personagem</h3>
            <div class="char-grid char-grid--sm" data-group>${this._charGrid('shop-char', ch.id, { small: true })}</div>
          </div>
        </div>
        <div class="seg seg--wrap" data-group>${tabs}</div>
        <ul class="items">${items}</ul>
      </div>
    </section>`;
  }

  // ---------- online ----------
  _online({ error = '', busy = '', code = '' } = {}) {
    return `
    <section class="screen screen--panel">
      <div class="panel panel--online" role="dialog" aria-labelledby="online-title">
        <header class="panel-head">
          <h2 id="online-title">Jogar online</h2>
          <button class="btn btn--ghost" data-action="back">Voltar</button>
        </header>
        ${ART.key ? `<img class="panel-banner" src="${ART.key}" alt="">` : ''}
        <p class="lead-sm">Um cria a sala e passa o código de 4 letras; o outro digita o código. Até 4 pessoas, e dá para completar com bots.</p>
        ${error ? `<p class="net-msg net-msg--error" role="alert">${esc(error)}</p>` : ''}
        ${busy ? `<p class="net-msg" role="status">${esc(busy)}</p>` : ''}
        <div class="field">
          <h3>Seu personagem</h3>
          <div class="char-grid char-grid--sm" data-group>${this._charGrid('set', this.state.lastConfig.characterId, { small: true })}</div>
        </div>
        <div class="net-cols">
          <div class="net-box">
            <h3>Criar sala</h3>
            <p class="hint">Você é o anfitrião: escolhe os minigames e começa a partida.</p>
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
        const ch = getCharacter(m.look.characterId);
        const tags = [i === 0 ? 'anfitrião' : '', i === d.you ? 'você' : ''].filter(Boolean).map((t) => `<em>${t}</em>`).join('');
        return `<li class="member" style="--c:${hexToCss(ch.color)}">${this._face(m.look, 48)}<b>${esc(ch.name)}</b>${tags}</li>`;
      })
      .join('');
    const empty = Math.max(0, d.maxPlayers - d.members.length);
    const slots = Array.from({ length: empty }, (_, i) => `<li class="member member--empty">${i < d.settings.bots ? 'Bot' : 'Vaga livre'}</li>`).join('');
    const mine = d.members[d.you]?.look.characterId;
    const taken = (id) => d.members.some((m, i) => i !== d.you && m.look.characterId === id);
    const s = d.settings;
    const opt = (key, value, label) =>
      `<button class="opt" data-action="net-set" data-key="${key}" data-value="${value}" data-type="${typeof value === 'number' ? 'num' : 'str'}" aria-pressed="${String(s[key]) === String(value)}" ${d.isHost ? '' : 'disabled'}>${label}</button>`;
    const maxBots = Math.max(0, d.maxPlayers - d.members.length);
    const botOpts = Array.from({ length: maxBots + 1 }, (_, n) => opt('bots', n, n)).join('');
    const enough = d.members.length + s.bots >= 2 && UI.canStart(s);
    const single = s.mode !== 'circuit';
    const opts = single ? getMinigame(s.minigameId).meta.options || [] : [];
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
            : '<p class="lead-sm">Você está na sala! O anfitrião escolhe os minigames e começa a partida.</p>'
        }
        <div class="field">
          <h3>Jogadores</h3>
          <ul class="members">${members}${slots}</ul>
        </div>
        <div class="field">
          <h3>Seu personagem</h3>
          <div class="char-grid char-grid--sm">${this._charGrid('net-char', mine, { taken, small: true })}</div>
        </div>
        ${this._modePicker(s, d.isHost)}
        <div class="field-grid">
          <div class="field"><h3>Bots</h3><div class="seg">${botOpts}</div></div>
          ${opts.includes('points') ? `<div class="field"><h3>Pontos</h3><div class="seg">${[5, 10, 15].map((n) => opt('points', n, n)).join('')}</div></div>` : ''}
          ${opts.includes('time') ? `<div class="field"><h3>Tempo</h3><div class="seg">${[[120, '2:00'], [180, '3:00'], [0, 'Sem limite']].map(([v, l]) => opt('time', v, l)).join('')}</div></div>` : ''}
        </div>
        <div class="setup-bottom">
          <div class="field">
            <h3>Dificuldade dos bots</h3>
            <div class="seg">${DIFFICULTY.map(([v, l]) => opt('difficulty', v, l)).join('')}</div>
          </div>
          <footer class="panel-foot">
            ${d.isHost ? `<button class="btn btn--primary btn--xl" data-action="net-start" ${enough ? 'data-autofocus' : 'disabled'}>${single ? 'COMEÇAR' : 'COMEÇAR CIRCUITO'}</button>` : '<p class="net-wait">Aguardando o anfitrião…</p>'}
          </footer>
        </div>
        ${d.isHost && !enough ? `<p class="hint">${UI.canStart(s) ? 'Esperando alguém entrar na sala (ou adicione um bot)…' : 'Escolha pelo menos 2 minigames para o circuito.'}</p>` : ''}
      </div>
    </section>`;
  }

  /**
   * Resultado da rodada. `circuit` = { idx, n, final, next, standings: [{ index, name, color, look, isHuman, total, wins }] }.
   * No fim do circuito o destaque é o campeão (primeiro de `standings`).
   */
  _result({ results, meta, online = false, isHost = false, coins = 0, circuit = null }) {
    const final = circuit?.final;
    const w = final ? circuit.standings[0] : results[0];
    const wdef = getCharacter((w.look || w).characterId);
    const humanWon = w.isHuman;
    const rows = results
      .map((r) => {
        const detail = r.detail || (r.place === 1 ? `Venceu com ${r.points} ${r.points === 1 ? 'ponto' : 'pontos'}` : r.eliminatedAt >= 0 ? `Fora aos ${fmtTime(r.eliminatedAt)}` : `${r.points} pontos`);
        return `
        <li class="rank" style="--c:${hexToCss(r.color)}">
          <span class="rank-place">${r.place}º</span>
          ${this._face(r.look || r.characterId, 48)}
          <div class="rank-who"><b>${esc(r.name)}${r.isHuman ? ' <em>você</em>' : ''}</b><span>${esc(detail)}</span></div>
          <div class="rank-stats">${(r.summary || []).map((x) => `<span><b>${esc(x.value)}</b> ${esc(x.label)}</span>`).join('')}</div>
        </li>`;
      })
      .join('');
    const table = circuit
      ? `<div class="standings"><h3>${final ? 'Classificação final' : `Circuito: rodada ${circuit.idx + 1} de ${circuit.n}`}</h3><ol>${circuit.standings
          .map((p, k) => `<li style="--c:${hexToCss(p.color)}"><span>${k + 1}º</span>${this._face(p.look, 36)}<b>${esc(p.name)}${p.isHuman ? ' <em>você</em>' : ''}</b><strong>${p.total} pts</strong></li>`)
          .join('')}</ol></div>`
      : '';
    const nextBtn = circuit && !final ? `<button class="btn btn--primary" data-action="next" data-autofocus>PRÓXIMA: ${esc(circuit.next.toUpperCase())}</button>` : '';
    const againLabel = circuit ? 'NOVO CIRCUITO' : online ? 'REVANCHE' : 'JOGAR NOVAMENTE';
    const again = `<button class="btn ${nextBtn ? '' : 'btn--primary'}" data-action="again" ${nextBtn ? '' : 'data-autofocus'}>${againLabel}</button>`;
    let buttons;
    if (online) {
      buttons = isHost
        ? `${nextBtn}${again}<button class="btn" data-action="net-lobby">SALA</button><button class="btn" data-action="net-leave">SAIR</button>`
        : `<p class="net-wait">${circuit && !final ? 'O anfitrião começa a próxima rodada…' : 'O anfitrião decide a revanche…'}</p><button class="btn" data-action="net-leave" data-autofocus>SAIR DA SALA</button>`;
    } else buttons = `${nextBtn}${again}<button class="btn" data-action="menu">MENU</button>`;
    const kicker = final ? '🏆 CAMPEÃO DO CIRCUITO' : `🏆 VENCEDOR · ${esc(meta.name)}`;
    const sub = final
      ? humanWon ? 'Você é o campeão do circuito!' : `${esc(w.name)} levou o circuito com ${w.total} pontos.`
      : humanWon ? 'Você levou essa!' : circuit ? 'Ainda dá para virar no circuito.' : 'Não foi dessa vez. Revanche?';
    return `
    <section class="screen screen--result">
      <div class="panel panel--result" role="dialog" aria-labelledby="result-title">
        <p class="result-kicker">${kicker}</p>
        <div class="winner" style="--c:${hexToCss(wdef.color)}">
          ${this._face(w.look || w.characterId, 112)}
          <div>
            <h2 id="result-title">${esc(w.name)}</h2>
            <p>${sub}</p>
          </div>
        </div>
        ${final ? table : ''}
        ${final ? `<h3 class="round-title">Última rodada: ${esc(meta.name)}</h3>` : ''}
        <ol class="ranking">${rows}</ol>
        ${final ? '' : table}
        ${coins > 0 ? `<p class="earned">Você ganhou ${coin('+' + coins)} <span>· saldo ${coin(this.state.profile.coins)}</span></p>` : ''}
        <div class="result-buttons">${buttons}</div>
      </div>
    </section>`;
  }
}
