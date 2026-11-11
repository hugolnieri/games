import * as THREE from 'three';
import { createCharacterModel, CharacterAnimator } from './CharacterModel.js';
import { getCharacter, lookDef } from './characters.js';
import { disposeTree } from '../engine/toon.js';
import { hexToCss } from '../engine/math.js';

/** Retrato de reserva (SVG) quando o WebGL offscreen falha: círculo na cor do personagem. */
export function fallbackPortrait(def) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
    <circle cx="64" cy="68" r="50" fill="${hexToCss(def.color)}" stroke="#1a1033" stroke-width="8"/>
    <circle cx="48" cy="60" r="11" fill="#fff" stroke="#1a1033" stroke-width="4"/>
    <circle cx="80" cy="60" r="11" fill="#fff" stroke="#1a1033" stroke-width="4"/>
    <circle cx="50" cy="62" r="5" fill="#1a1033"/><circle cx="82" cy="62" r="5" fill="#1a1033"/>
    <path d="M50 88 Q64 98 78 88" fill="none" stroke="#1a1033" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * Estúdio de retratos: renderiza o MESMO modelo em tempo real das partidas (com skin e acessório)
 * num canvas offscreen e guarda o dataURL. Usado no HUD, na sala, na loja e nos resultados.
 */
export class Portraits {
  constructor(size = 192) {
    this.size = size;
    this.cache = new Map();
    this.gl = undefined; // undefined = ainda não tentou; null = WebGL indisponível
  }

  _studio() {
    if (this.gl !== undefined) return this.gl;
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(this.size, this.size, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xe9e2ff, 0x6a4a9a, 1.6));
      const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
      sun.position.set(2, 4, 5);
      scene.add(sun);
      this.gl = { renderer, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.1, 50) };
    } catch {
      this.gl = null;
    }
    return this.gl;
  }

  _shot(look, { pose = false, t = 0 } = {}) {
    const def = lookDef(look);
    const st = this._studio();
    if (!st) return fallbackPortrait(getCharacter(look.characterId));
    try {
      const m = createCharacterModel(def);
      m.glow.visible = false;
      if (pose) {
        const anim = new CharacterAnimator(m);
        anim.setMode('victory');
        anim.t = t;
        anim.blink = 9;
        anim.update(0.0001, {});
        m.root.rotation.y = 0.2;
        st.cam.position.set(0.5, 2.0, 5.4);
        st.cam.lookAt(0, 1.15, 0);
      } else {
        m.tilt.position.y = 0.16;
        m.root.rotation.y = 0.28;
        for (const arm of m.arms) {
          arm.rotation.x = -0.35;
          arm.rotation.z = arm.userData.side * 0.55;
        }
        st.cam.position.set(0.55, 1.6, 3.35);
        st.cam.lookAt(0, 1.14, 0);
      }
      st.scene.add(m.root);
      st.renderer.render(st.scene, st.cam);
      const url = st.renderer.domElement.toDataURL('image/png');
      st.scene.remove(m.root);
      disposeTree(m.root);
      return url;
    } catch {
      return fallbackPortrait(getCharacter(look.characterId));
    }
  }

  /** Retrato de { characterId, skin, acc }. Aceita só o id do personagem. */
  of(look) {
    if (typeof look === 'string') look = { characterId: look };
    const key = `${look.characterId}|${look.skin || ''}|${look.acc || ''}`;
    if (!this.cache.has(key)) this.cache.set(key, this._shot(look));
    return this.cache.get(key);
  }

  /** Quadros da pose de vitória (a loja alterna entre eles para dar a prévia animada). */
  poseFrames(look, n = 6) {
    const key = `pose|${look.characterId}|${look.skin || ''}|${look.acc || ''}|${look.pose}|${n}`;
    if (!this.cache.has(key)) {
      const period = look.pose === 'pose-robo' ? 1 : look.pose === 'pose-onda' ? 1.26 : 0.97;
      this.cache.set(key, Array.from({ length: n }, (_, i) => this._shot(look, { pose: true, t: 0.12 + (i / n) * period })));
    }
    return this.cache.get(key);
  }
}
