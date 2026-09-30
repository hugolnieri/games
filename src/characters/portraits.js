import * as THREE from 'three';
import { createCharacterModel } from './CharacterModel.js';
import { disposeTree } from '../engine/toon.js';
import { hexToCss } from '../engine/math.js';

/** Retrato de reserva (SVG) quando o WebGL offscreen falha: círculo na cor do personagem + inicial. */
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

/** Renderiza cada personagem uma vez em um canvas offscreen e devolve dataURLs (usados na UI). */
export function renderPortraits(characters, size = 256) {
  const out = {};
  for (const def of characters) out[def.id] = fallbackPortrait(def);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe9e2ff, 0x6a4a9a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0.55, 1.55, 3.1);
  cam.lookAt(0, 1.08, 0);

  for (const def of characters) {
    try {
      const m = createCharacterModel(def);
      m.tilt.position.y = 0.16;
      m.root.rotation.y = 0.28;
      for (const arm of m.arms) {
        arm.rotation.x = -0.35;
        arm.rotation.z = arm.userData.side * 0.55;
      }
      m.glow.visible = false;
      scene.add(m.root);
      renderer.render(scene, cam);
      out[def.id] = renderer.domElement.toDataURL('image/png');
      scene.remove(m.root);
      disposeTree(m.root);
    } catch {
      /* mantém o retrato de reserva */
    }
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
