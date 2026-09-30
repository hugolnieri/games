import { clamp } from './math.js';

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Cada "slot" de jogador recebe { x, y, action, dash } no mesmo formato, seja do teclado,
 * de um gamepad ou do toque. Hoje o slot 0 combina tudo; para multiplayer local basta
 * mapear um dispositivo por slot em getPlayer().
 *
 * Gamepad (layout padrão W3C, igual para Xbox e PlayStation):
 *   analógico/D-pad mover · A/✕ ou X/□ = pulso · B/◯ ou LB/RB = dash · Start = pausa
 */
export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.captureGame = false;
    this.touch = { x: 0, actionPressed: false, dashPressed: false };
    this.gp = null;
    this.gpPrev = [];
    this.gpPressed = new Set();
    this.stickDir = null; // direção atual do analógico (para navegar em menus por "bordas")
    this.stickEdge = null;

    window.addEventListener('keydown', (e) => {
      if (SCROLL_KEYS.has(e.code) || (this.captureGame && e.code === 'Space')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.gp = null;
    for (const p of pads) {
      if (p && p.connected) {
        this.gp = p;
        break;
      }
    }
    this.gpPressed.clear();
    this.stickEdge = null;
    if (this.gp) {
      this.gp.buttons.forEach((b, i) => {
        if (b.pressed && !this.gpPrev[i]) this.gpPressed.add(i);
        this.gpPrev[i] = b.pressed;
      });
      const ax = this.gp.axes[0] || 0, ay = this.gp.axes[1] || 0;
      let dir = null;
      if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.6) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
      else if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.35) dir = this.stickDir; // histerese
      if (dir && dir !== this.stickDir) this.stickEdge = dir;
      this.stickDir = dir;
    }
  }

  /** Navegação em menus: setas do teclado, D-pad ou analógico (uma vez por toque). */
  navPressed() {
    if (this.wasPressed('ArrowUp') || this.gpPressed.has(12)) return 'up';
    if (this.wasPressed('ArrowDown') || this.gpPressed.has(13)) return 'down';
    if (this.wasPressed('ArrowLeft') || this.gpPressed.has(14)) return 'left';
    if (this.wasPressed('ArrowRight') || this.gpPressed.has(15)) return 'right';
    return this.stickEdge;
  }
  /** A / ✕ no controle (nos menus o teclado usa Enter/Espaço nativos do botão focado). */
  gpAcceptPressed() {
    return this.gpPressed.has(0);
  }
  /** B / ◯ no controle. */
  gpBackPressed() {
    return this.gpPressed.has(1);
  }
  /** Descarta os toques do controle neste quadro (ex.: o A que fechou um menu não vira pulso). */
  consumeGamepad() {
    this.gpPressed.clear();
    this.stickEdge = null;
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }
  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  // eslint-disable-next-line no-unused-vars
  getPlayer(slot = 0) {
    let x = 0, y = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) x -= 1;
    if (this.isDown('KeyD', 'ArrowRight')) x += 1;
    if (this.isDown('KeyW', 'ArrowUp')) y += 1;
    if (this.isDown('KeyS', 'ArrowDown')) y -= 1;
    x += this.touch.x;
    let action = this.wasPressed('Space', 'KeyJ') || this.touch.actionPressed;
    let dash = this.wasPressed('ShiftLeft', 'ShiftRight', 'KeyK') || this.touch.dashPressed;
    const gp = this.gp;
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.abs(ax) > 0.25) x += ax;
      if (Math.abs(ay) > 0.25) y -= ay;
      const b = gp.buttons;
      if (b[14]?.pressed) x -= 1;
      if (b[15]?.pressed) x += 1;
      if (b[12]?.pressed) y += 1;
      if (b[13]?.pressed) y -= 1;
      if (this.gpPressed.has(0) || this.gpPressed.has(2)) action = true;
      if (this.gpPressed.has(1) || this.gpPressed.has(4) || this.gpPressed.has(5)) dash = true;
    }
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), action, dash };
  }

  pausePressed() {
    return this.wasPressed('Escape', 'KeyP') || this.gpPressed.has(9);
  }
  confirmPressed() {
    return this.wasPressed('Enter', 'NumpadEnter') || this.gpPressed.has(3);
  }

  endFrame() {
    this.pressed.clear();
    this.touch.actionPressed = false;
    this.touch.dashPressed = false;
  }
}
