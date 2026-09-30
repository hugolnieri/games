import * as THREE from 'three';
import { hexToCss } from '../engine/math.js';

// Cada assento ganha o canto de tela mais próximo do seu gol.
const CORNER_BY_SEAT = ['bl', 'br', 'tr', 'tl'];
const fmt = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export class HUD {
  constructor(root, { camera, portraits, audio, input }) {
    this.camera = camera;
    this.portraits = portraits;
    this.audio = audio;
    this.input = input;
    this.onPause = () => {};
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="hud-timer"><span></span></div>
      <button class="hud-pause" aria-label="Pausar">II</button>
      <div class="hud-corner hud-corner--tl"></div>
      <div class="hud-corner hud-corner--tr"></div>
      <div class="hud-corner hud-corner--bl"></div>
      <div class="hud-corner hud-corner--br"></div>
      <div class="hud-tags"></div>
      <div class="hud-floats"></div>
      <div class="hud-banner" role="status"><b></b><span></span></div>
      <div class="hud-count" aria-live="assertive"></div>
      <div class="hud-keys"><span><kbd>A</kbd><kbd>D</kbd> mover</span><span><kbd>Espaço</kbd> rebater</span><span><kbd>Shift</kbd> dash</span></div>
      <div class="hud-hint"></div>
      <div class="touch" aria-hidden="true">
        <div class="touch-move"><button class="tbtn" data-t="left">◀</button><button class="tbtn" data-t="right">▶</button></div>
        <div class="touch-act"><button class="tbtn tbtn--dash" data-t="dash">Dash</button><button class="tbtn tbtn--hit" data-t="hit">Rebater</button></div>
      </div>`;
    root.appendChild(this.el);
    const q = (s) => this.el.querySelector(s);
    this.timerEl = q('.hud-timer');
    this.timerTxt = q('.hud-timer span');
    this.corners = { tl: q('.hud-corner--tl'), tr: q('.hud-corner--tr'), bl: q('.hud-corner--bl'), br: q('.hud-corner--br') };
    this.tags = q('.hud-tags');
    this.floatsEl = q('.hud-floats');
    this.bannerEl = q('.hud-banner');
    this.countEl = q('.hud-count');
    this.keysEl = q('.hud-keys');
    this.hintEl = q('.hud-hint');
    q('.hud-pause').addEventListener('click', () => this.onPause());
    this.v = new THREE.Vector3();
    this.floats = [];
    this.bannerT = 0;
    this.keysT = 0;
    this.touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (this.touch) {
      this.el.classList.add('hud--touch');
      this._setupTouch();
    }
  }

  _setupTouch() {
    const held = { left: false, right: false };
    const sync = () => {
      this.input.touch.x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    };
    for (const b of this.el.querySelectorAll('.tbtn')) {
      const t = b.dataset.t;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('on');
        if (t in held) {
          held[t] = true;
          sync();
        } else if (t === 'hit') this.input.touch.actionPressed = true;
        else this.input.touch.dashPressed = true;
      });
      const up = () => {
        b.classList.remove('on');
        if (t in held) {
          held[t] = false;
          sync();
        }
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }
  }

  /**
   * Pixels no topo da tela ocupados pelo HUD + altura de um rótulo de jogador.
   * Espelha os breakpoints do CSS; a câmera usa isso para os rótulos nunca ficarem sob o cronômetro.
   */
  topReserve(w, h) {
    const narrow = w <= 760, short = h <= 500;
    const timer = short ? 50 : narrow ? 56 : 76;
    const tag = narrow || short ? 40 : 47;
    const pauseRow = this.touch && narrow ? 106 : 0; // no toque estreito, a pausa fica sob o cronômetro
    return Math.max(timer, pauseRow) + tag + 6;
  }

  show() {
    this.el.hidden = false;
  }
  hide() {
    this.el.hidden = true;
    this.input.touch.x = 0;
  }

  build(h) {
    for (const c of Object.values(this.corners)) c.innerHTML = '';
    this.tags.innerHTML = '';
    this.floatsEl.innerHTML = '';
    this.floats = [];
    this.panels = new Map();
    this.tagEls = new Map();
    for (const p of h.players) {
      const el = document.createElement('div');
      el.className = 'pl';
      el.style.setProperty('--c', hexToCss(p.color));
      el.innerHTML = `
        <img class="pl-face" src="${this.portraits[p.characterId] || ''}" alt="">
        <div class="pl-info">
          <div class="pl-name">${p.name}${p.isHuman ? ' <em>você</em>' : ''}</div>
          <div class="pl-pips">${'<i></i>'.repeat(p.max)}</div>
        </div>
        <div class="pl-pts" aria-label="pontos">${p.points}</div>
        <div class="pl-out"></div>`;
      this.corners[CORNER_BY_SEAT[p.seat]].appendChild(el);
      this.panels.set(p.seat, {
        el, pts: el.querySelector('.pl-pts'), pips: [...el.querySelectorAll('.pl-pips i')], out: el.querySelector('.pl-out'), last: p.points, active: true,
      });
      const tag = document.createElement('div');
      tag.className = 'tag' + (p.isHuman ? ' tag--you' : '');
      tag.style.setProperty('--c', hexToCss(p.color));
      tag.innerHTML = `<b>${p.points}</b>${p.isHuman ? '<span>você</span>' : ''}`;
      this.tags.appendChild(tag);
      this.tagEls.set(p.seat, { el: tag, b: tag.querySelector('b'), last: p.points });
    }
    this.timerEl.hidden = !h.hasLimit;
    this.timerEl.className = 'hud-timer';
    this.timerTxt.textContent = fmt(h.timeLeft);
    this.bannerEl.classList.remove('on');
    this.countEl.textContent = '';
    this.hintEl.textContent = '';
    this.hintEl.hidden = true;
    this.lastHint = '';
    this.lastSec = -1;
    this.keysT = 6;
    this.keysEl.hidden = this.touch;
    const pad = !!this.input.gp;
    this.keysEl.innerHTML = pad
      ? '<span><kbd>Analógico</kbd> mover</span><span><kbd>A</kbd><kbd>✕</kbd> rebater</span><span><kbd>B</kbd><kbd>◯</kbd> dash</span>'
      : '<span><kbd>A</kbd><kbd>D</kbd> mover</span><span><kbd>Espaço</kbd> rebater</span><span><kbd>Shift</kbd> dash</span>';
  }

  update(h, labels, dt) {
    // cronômetro
    if (h.suddenDeath) {
      this.timerEl.hidden = false;
      this.timerEl.className = 'hud-timer sudden';
      this.timerTxt.textContent = 'Morte súbita';
    } else if (h.hasLimit) {
      const s = Math.ceil(h.timeLeft);
      if (s !== this.lastSec) {
        this.timerTxt.textContent = fmt(h.timeLeft);
        this.timerEl.classList.toggle('danger', s <= 10);
        if (s <= 10 && s > 0 && this.lastSec !== -1 && !h.finished) this.audio.play('tick');
        this.lastSec = s;
      }
    }

    // painéis
    for (const p of h.players) {
      const P = this.panels.get(p.seat);
      if (!P) continue;
      if (p.points !== P.last) {
        P.pts.textContent = p.points;
        P.pips.forEach((pip, i) => pip.classList.toggle('lost', i >= p.points));
        if (p.points < P.last) {
          P.el.classList.remove('hit');
          void P.el.offsetWidth;
          P.el.classList.add('hit');
        }
        P.last = p.points;
      }
      P.el.classList.toggle('danger', p.active && p.points <= 3);
      if (!p.active && P.active) {
        P.active = false;
        P.el.classList.add('is-out');
        P.out.textContent = `Fora ${p.place}º`;
      }
      if (h.finished && p.place === 1) P.el.classList.add('is-winner');
    }

    // rótulos 3D sobre os pods
    const w = this.el.clientWidth, hh = this.el.clientHeight;
    for (const l of labels) {
      const T = this.tagEls.get(l.seat);
      if (!T) continue;
      this.v.set(l.x, l.y, l.z).project(this.camera);
      const visible = l.visible && l.active && this.v.z < 1 && !h.finished;
      T.el.style.opacity = visible ? '1' : '0';
      if (!visible) continue;
      T.el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * hh).toFixed(1)}px) translate(-50%, -100%)`;
      if (l.points !== T.last) {
        T.b.textContent = l.points;
        T.last = l.points;
      }
      T.el.classList.toggle('danger', l.points <= 3);
    }

    // textos flutuantes presos ao mundo
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t > f.dur) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      this.v.copy(f.pos).project(this.camera);
      f.el.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * hh).toFixed(1)}px) translate(-50%, -50%)`;
    }

    // dica quando o humano já caiu
    const pad = !!this.input.gp;
    const fast = pad ? 'Y ou △' : 'Enter';
    const hint = h.humanOut
      ? this.touch && !pad
        ? 'Você está fora. Assista ao final ou pause.'
        : h.ffwd
          ? `Acelerando ×3. ${fast} volta ao normal.`
          : `Você está fora. ${fast} acelera ×3, ${pad ? 'Start' : 'Esc'} pausa.`
      : '';
    if (hint !== this.lastHint) {
      this.hintEl.textContent = hint;
      this.hintEl.hidden = !hint;
      this.lastHint = hint;
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('on');
    }
    if (this.keysT > 0) {
      this.keysT -= dt;
      if (this.keysT <= 0) this.keysEl.hidden = true;
    }
  }

  floatText(pos, text, { color = 0xffffff, size = 'md', dur = 1.1 } = {}) {
    if (this.el.hidden) return;
    const el = document.createElement('div');
    el.className = `float float--${size}`;
    el.innerHTML = `<span style="color:${hexToCss(color)}">${text}</span>`;
    this.floatsEl.appendChild(el);
    this.floats.push({ el, pos: new THREE.Vector3(...pos), t: 0, dur });
    if (this.floats.length > 14) this.floats.shift().el.remove();
  }

  banner(text, { color = 0xffd23f, sub = '', duration = 1.9 } = {}) {
    if (this.el.hidden) return;
    const b = this.bannerEl;
    b.querySelector('b').textContent = text;
    const s = b.querySelector('span');
    s.textContent = sub;
    s.hidden = !sub;
    b.style.setProperty('--bc', hexToCss(color));
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    this.bannerT = duration;
  }

  countdown(text) {
    const c = this.countEl;
    c.textContent = text;
    c.className = 'hud-count' + (text === 'VAI!' ? ' go' : '');
    void c.offsetWidth;
    c.classList.add('pop');
  }
}
