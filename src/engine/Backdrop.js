import * as THREE from 'three';
import { toon, withOutline } from './toon.js';
import { hexToRgb, mulberry32 } from './math.js';

const vec = (hex) => ({ value: new THREE.Vector3(...hexToRgb(hex)) });

/** Fundo global (compartilhado por todos os minigames): céu, nuvens, rochas flutuantes. */
export class Backdrop {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const rng = mulberry32(42);

    // Céu em gradiente (cores sRGB cruas → o shader escreve direto no canvas).
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: vec(0x1b0f4d), horizon: vec(0xff9c6e), mid: vec(0xc0508c), deep: vec(0x2a1266) },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top, horizon, mid, deep;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 c;
            if (h > 0.0) {
              c = mix(horizon, top, smoothstep(0.0, 0.55, h));
            } else {
              c = mix(horizon, mid, 1.0 - smoothstep(-0.3, 0.0, h));
              c = mix(c, deep, 1.0 - smoothstep(-0.95, -0.3, h));
            }
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    // Estrelas cintilando
    const starCount = 700;
    const sp = new Float32Array(starCount * 3);
    const sph = new Float32Array(starCount);
    for (let i = 0; i < starCount; i++) {
      const u = rng() * 2 - 1, th = rng() * Math.PI * 2;
      const y = -0.2 + rng() * 1.2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      sp.set([Math.cos(th) * r * 250, y * 250, Math.sin(th) * r * 250], i * 3);
      sph[i] = rng() * 10 + u;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('phase', new THREE.BufferAttribute(sph, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float phase; uniform float uTime; varying float vA;
        void main() {
          vA = 0.45 + 0.55 * sin(uTime * 2.0 + phase * 6.0);
          gl_PointSize = 2.0 + 1.5 * fract(phase);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 0.95, 0.85, vA * (1.0 - d * 2.0)); }`,
    });
    const stars = new THREE.Points(sg, this.starMat);
    stars.frustumCulled = false;
    this.group.add(stars);

    // Nuvens fofas abaixo da arena
    this.clouds = new THREE.Group();
    const cloudMat = toon(0xffd9e8);
    const cloudMat2 = toon(0xf6b8d6);
    const puff = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const a = (i / 16) * Math.PI * 2 + rng() * 0.3;
      const r = 26 + rng() * 34;
      g.position.set(Math.cos(a) * r, -14 - rng() * 14, Math.sin(a) * r);
      const n = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(puff, rng() < 0.5 ? cloudMat : cloudMat2);
        const s = 2.2 + rng() * 2.8;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((k - n / 2) * 2.4 + rng(), rng() * 1.2, rng() * 2 - 1);
        g.add(m);
      }
      this.clouds.add(g);
    }
    this.group.add(this.clouds);

    // Ilhotas flutuantes com "árvores" de doce
    this.rocks = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b4a8f, flatShading: true });
    const grassMat = toon(0x7be08a);
    const treeMats = [toon(0xff7fb0), toon(0xffd23f), toon(0x7fd8ff)];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const r = 21 + rng() * 9;
      g.position.set(Math.cos(a) * r, -5 + rng() * 5, Math.sin(a) * r);
      const s = 1.2 + rng() * 1.6;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(s * 1.2, s * 2.4, 7), rockMat);
      rock.rotation.x = Math.PI;
      rock.position.y = -s * 1.2;
      g.add(rock);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.22, s * 1.2, 0.35, 7), grassMat);
      g.add(top);
      const tree = new THREE.Mesh(new THREE.SphereGeometry(s * 0.45, 10, 8), treeMats[i % 3]);
      withOutline(tree, 1.08);
      tree.position.set(s * 0.3, s * 0.7, 0);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, s * 0.6, 6), toon(0x7a4a2a));
      trunk.position.set(s * 0.3, s * 0.3, 0);
      g.add(trunk, tree);
      g.userData = { baseY: g.position.y, ph: rng() * 6 };
      this.rocks.push(g);
      this.group.add(g);
    }

    // Planeta com anel
    this.planet = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.SphereGeometry(12, 32, 24), toon(0xffb870));
    withOutline(pl, 1.03);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(16, 22, 64),
      new THREE.MeshBasicMaterial({ color: 0xffe0a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -1.2;
    this.planet.add(pl, ring);
    this.planet.position.set(-58, -72, -96);
    this.group.add(this.planet);
  }

  update(dt, t) {
    this.starMat.uniforms.uTime.value = t;
    this.clouds.rotation.y += dt * 0.012;
    for (const r of this.rocks) {
      r.position.y = r.userData.baseY + Math.sin(t * 0.6 + r.userData.ph) * 0.5;
      r.rotation.y += dt * 0.05;
    }
    this.planet.rotation.y += dt * 0.03;
  }
}
