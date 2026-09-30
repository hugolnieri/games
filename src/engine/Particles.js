import * as THREE from 'three';
import { hexToRgb } from './math.js';

const VERT = /* glsl */ `
  attribute float psize;
  attribute vec4 pcolor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = pcolor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = psize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = mix(1.0, 1.0 - smoothstep(0.15, 0.5, d), uSoft);
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

/** Pool de partículas em um único draw call. Cores em sRGB cru. */
export class ParticleSystem {
  constructor(scene, { max = 1500, additive = false, soft = 1 } = {}) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.floorY = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('psize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
    this.budget = 1;
  }

  /** Converte tamanho em unidades de mundo para pixels. */
  setViewport(bufferHeight, fovDeg) {
    this.mat.uniforms.uScale.value = bufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit({
    x = 0, y = 0, z = 0, count = 10, speed = 3, spread = 1, dir = null, up = 0, color = 0xffffff, color2 = null,
    size = 0.3, sizeEnd = 0, life = 0.6, lifeVar = 0.4, gravity = 0, drag = 1.5, alpha = 1, jitter = 0, floor = -99,
  }) {
    const n = Math.max(1, Math.round(count * this.budget));
    const c1 = hexToRgb(color), c2 = color2 != null ? hexToRgb(color2) : c1;
    for (let i = 0; i < n; i++) {
      if (this.count >= this.max) return;
      const k = this.count++;
      let dx, dy, dz;
      if (dir) {
        dx = dir[0] + (Math.random() * 2 - 1) * spread;
        dy = dir[1] + (Math.random() * 2 - 1) * spread;
        dz = dir[2] + (Math.random() * 2 - 1) * spread;
      } else {
        const th = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u);
        dx = Math.cos(th) * r; dy = u; dz = Math.sin(th) * r;
      }
      const l = Math.hypot(dx, dy, dz) || 1;
      const sp = speed * (0.35 + Math.random() * 0.85);
      this.vel[k * 3] = (dx / l) * sp;
      this.vel[k * 3 + 1] = (dy / l) * sp + up;
      this.vel[k * 3 + 2] = (dz / l) * sp;
      this.pos[k * 3] = x + (Math.random() * 2 - 1) * jitter;
      this.pos[k * 3 + 1] = y + (Math.random() * 2 - 1) * jitter * 0.5;
      this.pos[k * 3 + 2] = z + (Math.random() * 2 - 1) * jitter;
      const t = Math.random();
      this.col[k * 4] = c1[0] + (c2[0] - c1[0]) * t;
      this.col[k * 4 + 1] = c1[1] + (c2[1] - c1[1]) * t;
      this.col[k * 4 + 2] = c1[2] + (c2[2] - c1[2]) * t;
      this.col[k * 4 + 3] = alpha;
      const lf = life * (1 - lifeVar * 0.5 + Math.random() * lifeVar);
      this.life[k] = lf;
      this.maxLife[k] = lf;
      this.s0[k] = size * (0.7 + Math.random() * 0.6);
      this.s1[k] = sizeEnd;
      this.a0[k] = alpha;
      this.grav[k] = gravity;
      this.drag[k] = drag;
      this.floorY[k] = floor;
      this.size[k] = this.s0[k];
    }
  }

  _copy(to, from) {
    for (let j = 0; j < 3; j++) {
      this.pos[to * 3 + j] = this.pos[from * 3 + j];
      this.vel[to * 3 + j] = this.vel[from * 3 + j];
    }
    for (let j = 0; j < 4; j++) this.col[to * 4 + j] = this.col[from * 4 + j];
    this.size[to] = this.size[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from];
    this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.floorY[to] = this.floorY[from];
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.count--;
        if (i !== this.count) this._copy(i, this.count);
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      const k = i * 3;
      this.vel[k] *= dr;
      this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt;
      this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < this.floorY[i]) {
        this.pos[k + 1] = this.floorY[i];
        this.vel[k + 1] *= -0.4;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t * t);
      i++;
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}
