import './styles/main.css';
import { Engine } from './engine/Engine.js';
import { AudioManager } from './engine/Audio.js';
import { Input } from './engine/Input.js';
import { Backdrop } from './engine/Backdrop.js';
import { ParticleSystem } from './engine/Particles.js';
import { Effects } from './engine/Effects.js';
import { CameraRig } from './engine/CameraRig.js';
import { GameState } from './game/GameState.js';
import { GameManager } from './game/GameManager.js';
import { CHARACTERS } from './characters/characters.js';
import { renderPortraits } from './characters/portraits.js';
import { UI } from './ui/UI.js';
import { HUD } from './ui/HUD.js';

// ---------- estado persistido ----------
const state = new GameState();
if (!state.hadSave && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) state.settings.shake = false;

// ---------- módulos da engine ----------
const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
const engine = new Engine(appEl, { quality: state.settings.quality });
const { scene } = engine;
const audio = new AudioManager();
const input = new Input();
const backdrop = new Backdrop(scene);
const particles = {
  sparks: new ParticleSystem(scene, { max: 1600, additive: true }),
  dust: new ParticleSystem(scene, { max: 1200 }),
};
const fx = new Effects(scene);
const rig = new CameraRig(engine.camera);

// ---------- interface ----------
const portraits = renderPortraits(CHARACTERS);
const ui = new UI(uiEl, { state, portraits, audio });
const hud = new HUD(uiEl, { camera: engine.camera, portraits, audio, input });

// eslint-disable-next-line prefer-const
let gm;
engine.onResize.push((w, h, bufH) => {
  rig.fit(w / h, h, hud.topReserve(w, h));
  particles.sparks.setViewport(bufH, rig.baseFov);
  particles.dust.setViewport(bufH, rig.baseFov);
  gm?.onResize();
});

gm = new GameManager({ engine, rig, ui, hud, audio, input, state, particles, fx, backdrop });
ui.onAction = gm.onAction.bind(gm);
hud.onPause = () => gm.pause();

engine._resize();
gm.boot();

// ---------- áudio: navegadores só liberam após um gesto do usuário ----------
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// aba oculta no meio da partida → pausa
document.addEventListener('visibilitychange', () => {
  if (document.hidden) gm.pause();
});

// ---------- loop ----------
engine.start((dt) => {
  input.poll();
  gm.update(dt);
  input.endFrame();
});

// ganchos para testes automatizados
window.__treta = { gm, engine };
