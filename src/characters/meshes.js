import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_URLS } from '../assets/models.js';
import { INK } from '../engine/toon.js';

/**
 * Malhas esculpidas dos personagens (GLB gerado no Higgsfield, ver tools/models.mjs).
 * Carregam uma vez no início; createCharacterModel usa a malha se ela existir e cai no modelo de
 * primitivas se não (personagem ainda sem malha, ou falha de carregamento).
 *
 * `fit` por personagem (frações da altura da malha): head = centro da cabeça, hat = topo do
 * crânio, face = [altura, frente] dos olhos, w = meia-largura da cabeça. Servem para os acessórios.
 */
export const MESH_FIT = {
  faisca: { head: 0.66, hat: 0.2, face: [0.02, 0.2], w: 0.27 },
  pipoca: { head: 0.62, hat: 0.24, face: [0.04, 0.2], w: 0.25 },
};
const DEFAULT_FIT = { head: 0.64, hat: 0.2, face: [0.02, 0.2], w: 0.26 };
export const MESH_HEIGHT = 1.5;

const loaded = new Map(); // id → { geometry, image }

export function getMesh(id) {
  return loaded.get(id) || null;
}
export const meshFit = (id) => MESH_FIT[id] || DEFAULT_FIT;

/** Carrega todas as malhas (com limite de tempo: o jogo abre mesmo se alguma demorar). */
export function preloadMeshes(timeoutMs = 6000) {
  const loader = new GLTFLoader();
  const jobs = Object.entries(MODEL_URLS).map(
    ([id, url]) =>
      new Promise((done) => {
        loader.load(
          url,
          (gltf) => {
            let mesh = null;
            gltf.scene.traverse((o) => {
              if (o.isMesh && !mesh) mesh = o;
            });
            if (mesh) {
              // normaliza: base no chão (y = 0), altura 1, centrada em x/z
              const g = mesh.geometry.clone();
              g.applyMatrix4(mesh.matrixWorld);
              g.computeBoundingBox();
              const b = g.boundingBox, h = b.max.y - b.min.y || 1;
              g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
              g.scale(1 / h, 1 / h, 1 / h);
              if (!g.attributes.normal) g.computeVertexNormals(); // o SAM 3D exporta sem normais
              g.computeBoundingSphere();
              const map = mesh.material.map || null;
              loaded.set(id, { geometry: g, image: map?.image || null, map });
            }
            done();
          },
          undefined,
          () => done(),
        );
      }),
  );
  return Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
}

// ---------- textura: skins trocam a cor principal do corpo ----------
const texCache = new Map();
function hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const split = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/**
 * Textura da malha para uma aparência. Sem skin devolve a original; com skin, repinta só os
 * pixels do tom principal do personagem (`base`) para o tom da skin (`to`), preservando o
 * sombreado. Olhos, barriga, acessórios e contornos ficam como estão.
 */
export function meshTexture(id, base, to) {
  const m = loaded.get(id);
  if (!m || !m.image) return null;
  const key = `${id}|${to === base ? '' : to}`;
  if (texCache.has(key)) return texCache.get(key);
  let source = m.image;
  if (to !== base) {
    const c = document.createElement('canvas');
    c.width = m.image.width;
    c.height = m.image.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(m.image, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    const [bh, bs, bl] = hsl(...split(base)), [th, ts, tl] = hsl(...split(to));
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = hsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      const dh = Math.abs(((h - bh + 540) % 360) - 180);
      if (dh > 26 || s < 0.3) continue;
      const [r, gg, b] = rgb(th, Math.min(1, (s / bs) * ts), Math.min(0.95, Math.max(0.03, (l / bl) * tl)));
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
    source = c;
  }
  const tex = new THREE.Texture(source);
  tex.flipY = false; // convenção do glTF
  tex.colorSpace = THREE.SRGBColorSpace;
  if (m.map) {
    // preserva qualquer transformação de UV que o arquivo traga
    tex.repeat.copy(m.map.repeat);
    tex.offset.copy(m.map.offset);
    tex.wrapS = m.map.wrapS;
    tex.wrapT = m.map.wrapT;
  }
  tex.needsUpdate = true;
  tex.userData.shared = true; // não descartar junto com um modelo (disposeTree)
  texCache.set(key, tex);
  return tex;
}

// contorno "tinta" para malha orgânica: casco invertido empurrado pela normal
let hull = null;
export function hullMaterial() {
  if (!hull) {
    hull = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0.007 }, uColor: { value: new THREE.Color(INK) } },
      vertexShader: 'uniform float uT; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * uT, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }',
      side: THREE.BackSide,
    });
    hull.userData.shared = true;
  }
  return hull;
}
