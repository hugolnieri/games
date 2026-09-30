import * as THREE from 'three';
import { BOLADA as C, SEAT_ANGLES } from './config.js';
import { toon, withOutline, INK, disposeTree } from '../../engine/toon.js';
import { hexToRgb, damp, easeOutBack, mulberry32, wrapAngle, TAU } from '../../engine/math.js';

const R = C.arenaRadius;
const G = C.goalHalfAngle;
const PILLAR_ANGLES = [0, 1, 2, 3].map((k) => Math.PI / 4 + (k * Math.PI) / 2);
const EMPTY_COLOR = 0x6d6a94;
const PALETTE = [0xff6b3d, 0x49d35e, 0x2fb0ff, 0xb46bff, 0xffd23f, 0xff4f8b, 0xffffff, 0x7fe0d0];

// ---------- geometrias auxiliares (construídas direto no plano XZ, sem rotações ambíguas) ----------
function sectorGeometry(r0, r1, a0, a1, segs = 32) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r0, 0, s * r0, c * r1, 0, s * r1);
    uv.push(i / segs, 0, i / segs, 1);
  }
  for (let i = 0; i < segs; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function curtainGeometry(r, a0, a1, h, segs = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r, 0, s * r, c * r, h, s * r);
    uv.push(i / segs, 0, i / segs, 1);
  }
  for (let i = 0; i < segs; i++) {
    const k = i * 2;
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Setor anelar extrudado para cima (paredes, arquibancadas, selos de gol). */
function extrudedSector(r0, r1, a0, a1, height, mats, bevel = 0.07) {
  const shape = new THREE.Shape();
  const segs = 24;
  for (let i = 0; i <= segs; i++) {
    const a = a0 + ((a1 - a0) * i) / segs;
    if (i === 0) shape.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    else shape.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  for (let i = segs; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / segs;
    shape.lineTo(Math.cos(a) * r0, Math.sin(a) * r0);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  geo.rotateX(Math.PI / 2); // forma (x,y) → mundo (x,z); extrusão desce em y
  geo.translate(0, height, 0);
  return new THREE.Mesh(geo, mats);
}

class ArcCurve extends THREE.Curve {
  constructor(r, a0, a1, y) {
    super();
    Object.assign(this, { r, a0, a1, y });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    return target.set(Math.cos(a) * this.r, this.y, Math.sin(a) * this.r);
  }
}

const CURTAIN_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CURTAIN_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uFlash; uniform float uOn;
  varying vec2 vUv;
  void main() {
    float band = step(0.5, fract(vUv.y * 5.0 - uTime * 1.3));
    float edge = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
    float fade = 1.0 - vUv.y;
    float a = ((0.14 + 0.2 * band) * edge + uFlash * 0.8) * fade;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), uFlash * 0.6), a * uOn);
  }`;

export class BoladaArena {
  constructor(parent, players) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.t = 0;
    this.rng = mulberry32(7);
    this.seats = [0, 1, 2, 3].map((s) => {
      const p = players.find((q) => q.seat === s);
      return { occupied: !!p, color: p ? p.def.color : EMPTY_COLOR };
    });
    this.excite = 0;
    this.sudden = false;
    this._lights();
    this._platform();
    this._walls();
    this._goals();
    this._pillars();
    this._reactor();
    this._stands();
    this._towers();
    for (let s = 0; s < 4; s++) if (!this.seats[s].occupied) this.sealGoal(s, true);
  }

  // ---------- construção ----------
  _lights() {
    this.hemi = new THREE.HemisphereLight(0xe2dcff, 0x5a3b8f, 1.55);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
    this.sun.position.set(6, 14, 9);
    this.group.add(this.hemi, this.sun);
  }

  _floorTexture() {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const cx = S / 2, k = S / 2 / R;
    const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
    grd.addColorStop(0, '#6a70e6');
    grd.addColorStop(0.6, '#4b52c4');
    grd.addColorStop(1, '#353ca0');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 16; i++) {
      g.beginPath();
      g.moveTo(cx, cx);
      g.arc(cx, cx, 7.25 * k, (i / 16) * TAU, ((i + 1) / 16) * TAU);
      g.closePath();
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(20,10,60,0.06)';
      g.fill();
    }
    const ring = (r0, r1, style) => {
      g.beginPath();
      g.arc(cx, cx, r1 * k, 0, TAU);
      g.arc(cx, cx, r0 * k, 0, TAU, true);
      g.fillStyle = style;
      g.fill();
    };
    ring(2.25, 2.4, 'rgba(255,255,255,0.22)');
    ring(4.6, 4.7, 'rgba(255,255,255,0.14)');
    ring(7.2, 7.32, 'rgba(255,255,255,0.2)');
    ring(9.55, 10, 'rgba(26,16,51,0.35)');
    // pontinhos
    g.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      g.beginPath();
      g.arc(cx + Math.cos(a) * 5.95 * k, cx + Math.sin(a) * 5.95 * k, 5, 0, TAU);
      g.fill();
    }
    // faixa de perigo ao redor do reator
    for (let i = 0; i < 28; i++) {
      g.beginPath();
      g.arc(cx, cx, 2.05 * k, (i / 28) * TAU, ((i + 1) / 28) * TAU);
      g.arc(cx, cx, 1.6 * k, ((i + 1) / 28) * TAU, (i / 28) * TAU, true);
      g.closePath();
      g.fillStyle = i % 2 ? '#ffd23f' : '#1a1033';
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  _platform() {
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.6, 96), [
      toon(0x3b2a78), toon(0xffffff, { map: this._floorTexture() }), toon(0x2a1c5a),
    ]);
    floor.position.y = -0.3;
    this.group.add(floor);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 128), new THREE.MeshBasicMaterial({ color: INK }));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.0;
    this.group.add(lip);

    const rockGeo = new THREE.ConeGeometry(R * 0.99, 9, 20, 4);
    const p = rockGeo.attributes.position;
    const hash = (x, y, z) => {
      const s = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(y * 10) * 78.233 + Math.round(z * 10) * 37.719) * 43758.5453;
      return s - Math.floor(s);
    };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < -4.4) continue; // mantém a borda que encosta na plataforma
      const k = 1 + (hash(x, y, z) - 0.5) * 0.4;
      p.setXYZ(i, x * k, y, z * k);
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x5b3d8a, flatShading: true }));
    rock.rotation.x = Math.PI;
    rock.position.y = -0.6 - 4.5;
    this.group.add(rock);
    // cristais pendurados
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      const cr = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 5), crystalMat);
      cr.rotation.x = Math.PI;
      cr.position.set(Math.cos(a) * 6.5, -2.2 - this.rng() * 1.5, Math.sin(a) * 6.5);
      withOutline(cr, 1.1);
      this.group.add(cr);
    }
  }

  _walls() {
    const cap = toon(0xff5d8f), side = toon(0xfff0d6), base = toon(0x3b2a78);
    const edgeMat = new THREE.LineBasicMaterial({ color: INK });
    for (const c of PILLAR_ANGLES) {
      const half = Math.PI / 4 - G;
      const w = extrudedSector(R, R + 0.75, c - half, c + half, 0.85, [cap, side]);
      w.add(new THREE.LineSegments(new THREE.EdgesGeometry(w.geometry, 35), edgeMat));
      this.group.add(w);
      const b = extrudedSector(R - 0.05, R + 0.85, c - half - 0.02, c + half + 0.02, 0.6, [base, base], 0);
      b.position.y = -0.6;
      this.group.add(b);
      // bandeirinha
      const flagA = c + (this.rng() - 0.5) * 0.2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), toon(0xeeeeff));
      const fx = Math.cos(flagA) * (R + 0.45), fz = Math.sin(flagA) * (R + 0.45);
      pole.position.set(fx, 1.6, fz);
      this.group.add(pole);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0.9, -0.25);
      shape.lineTo(0, -0.5);
      shape.closePath();
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), toon(PALETTE[Math.floor(this.rng() * 6)], { side: THREE.DoubleSide }));
      const pivot = new THREE.Group();
      pivot.position.set(fx, 2.35, fz);
      pivot.add(flag);
      pivot.userData.ph = this.rng() * 6;
      (this.flags ||= []).push(pivot);
      this.group.add(pivot);
    }
  }

  _goals() {
    this.goals = [];
    for (let s = 0; s < 4; s++) {
      const a = SEAT_ANGLES[s];
      const col = this.seats[s].color;
      const g = { group: new THREE.Group(), flash: 0, danger: 0, sealed: false, sealT: 1, caps: [] };
      this.group.add(g.group);
      const flat = (opacity) =>
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
      g.zoneMat = flat(0.22);
      const zone = new THREE.Mesh(sectorGeometry(7.3, R, a - G, a + G, 32), g.zoneMat);
      zone.position.y = 0.012;
      g.railMat = flat(0.8);
      g.rail = new THREE.Mesh(sectorGeometry(C.railRadius - 0.06, C.railRadius + 0.06, a - C.railLimit - 0.11, a + C.railLimit + 0.11, 32), g.railMat);
      g.rail.position.y = 0.02;
      g.lineMat = flat(0.95);
      const line = new THREE.Mesh(sectorGeometry(R - 0.18, R, a - G, a + G, 32), g.lineMat);
      line.position.y = 0.025;
      g.group.add(zone, g.rail, line);

      for (const sg of [-1, 1]) {
        const pa = a + sg * G;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 14), toon(col));
        withOutline(post, 1.12);
        post.position.set(Math.cos(pa) * R, 0.75, Math.sin(pa) * R);
        const capMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), capMat);
        withOutline(cap, 1.12);
        cap.position.set(0, 0.85, 0);
        post.add(cap);
        g.caps.push(capMat);
        g.group.add(post);
      }
      const bar = new THREE.Mesh(new THREE.TubeGeometry(new ArcCurve(R, a - G, a + G, 1.55), 32, 0.1, 8), toon(col));
      g.group.add(bar);
      g.bar = bar;

      g.curtainMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Vector3(...hexToRgb(col)) }, uTime: { value: 0 }, uFlash: { value: 0 }, uOn: { value: 1 } },
        vertexShader: CURTAIN_VERT, fragmentShader: CURTAIN_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      g.curtain = new THREE.Mesh(curtainGeometry(R + 0.03, a - G, a + G, 1.5, 28), g.curtainMat);
      g.curtain.renderOrder = 3;
      g.group.add(g.curtain);

      const sealCap = toon(col), sealSide = toon(0x4a4670);
      g.seal = extrudedSector(R, R + 0.75, a - G - 0.03, a + G + 0.03, 1.0, [sealCap, sealSide]);
      g.seal.add(new THREE.LineSegments(new THREE.EdgesGeometry(g.seal.geometry, 35), new THREE.LineBasicMaterial({ color: INK })));
      // listras de "interditado"
      for (let i = 0; i < 5; i++) {
        const sa = a - G + ((i + 0.5) / 5) * 2 * G;
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
        stripe.position.set(Math.cos(sa) * (R - 0.02), 0.55, Math.sin(sa) * (R - 0.02));
        stripe.rotation.y = -sa;
        stripe.rotation.x = 0.5;
        g.seal.add(stripe);
      }
      g.seal.visible = false;
      g.group.add(g.seal);

      g.light = new THREE.PointLight(col, 0, 10, 1.4);
      g.light.position.set(Math.cos(a) * (R - 1.6), 2.4, Math.sin(a) * (R - 1.6));
      g.group.add(g.light);
      this.goals.push(g);
    }
  }

  _pillars() {
    this.pillars = PILLAR_ANGLES.map((a) => {
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 1.0, 28), toon(0xffd23f));
      withOutline(base, 1.06);
      base.position.y = 0.5;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 0.32, 28), toon(0xff4f8b));
      withOutline(top, 1.08);
      top.position.y = 1.16;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff6a0 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 8, 36), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.55;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      withOutline(gem, 1.15);
      gem.position.y = 1.62;
      g.add(base, top, ring, gem);
      this.group.add(g);
      return { g, ringMat, gem, hit: 0 };
    });
  }

  _reactor() {
    const r = (this.reactor = { group: new THREE.Group(), aim: -Math.PI / 2, targetAim: -Math.PI / 2, warn: 0, fire: 0, hit: 0, bomb: false });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.6, 0.55, 32), toon(0x2b2f5e));
    withOutline(base, 1.05);
    base.position.y = 0.27;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.37, 0.08, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.52;
    r.coreMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), r.coreMat);
    core.position.y = 0.95;
    r.core = core;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 28, 14, 0, TAU, 0, Math.PI / 2),
      toon(0x9feeff, { transparent: true, opacity: 0.45, depthWrite: false }),
    );
    dome.position.y = 0.55;
    r.dome = dome;
    r.rings = [0, 1].map((i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3 + i * 0.12, 0.045, 6, 48), new THREE.MeshBasicMaterial({ color: i ? 0xff8fc0 : 0x8ff0ff }));
      ring.position.y = 1.15;
      ring.rotation.x = Math.PI / 2 + (i ? 0.35 : -0.35);
      return ring;
    });
    r.nozzle = new THREE.Group();
    r.nozzle.position.y = 0.62;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.34, 1.25, 16), toon(0xff4f8b));
    withOutline(barrel, 1.1);
    barrel.rotation.z = -Math.PI / 2;
    barrel.position.x = 1.15;
    r.barrel = barrel;
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    muzzle.rotation.y = Math.PI / 2;
    muzzle.position.x = 1.78;
    r.nozzle.add(barrel, muzzle);

    const s = new THREE.Shape();
    s.moveTo(1.95, -0.3);
    s.lineTo(4.3, -0.3);
    s.lineTo(4.3, -0.65);
    s.lineTo(5.5, 0);
    s.lineTo(4.3, 0.65);
    s.lineTo(4.3, 0.3);
    s.lineTo(1.95, 0.3);
    s.closePath();
    const arrowGeo = new THREE.ShapeGeometry(s);
    arrowGeo.rotateX(-Math.PI / 2);
    r.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    r.arrow = new THREE.Mesh(arrowGeo, r.arrowMat);
    r.arrow.position.y = 0.05;
    r.arrow.renderOrder = 2;

    r.light = new THREE.PointLight(0xffa860, 6, 14, 1.4);
    r.light.position.y = 2.4;
    r.group.add(base, band, core, dome, ...r.rings, r.nozzle, r.light);
    this.group.add(r.group, r.arrow);
  }

  _stands() {
    const tierMats = [toon(0x5b3fa0), toon(0x6a4cb4), toon(0x7a5cc8)];
    const capMat = toon(0x9b82e6);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x5b3d8a, flatShading: true });
    const members = [];
    const span = 0.4;
    const tiers = [[R + 1.7, R + 2.9, 0.35], [R + 2.9, R + 4.1, 0.9], [R + 4.1, R + 5.3, 1.45]];
    for (const c of PILLAR_ANGLES) {
      tiers.forEach(([r0, r1, h], i) => {
        const m = extrudedSector(r0, r1, c - span, c + span, h + 0.9, [capMat, tierMats[i]], 0.05);
        m.position.y = -0.9;
        this.group.add(m);
        const rm = (r0 + r1) / 2;
        const n = Math.floor((rm * span * 2) / 0.66);
        for (let k = 0; k < n; k++) {
          const a = c - span + ((k + 0.5) / n) * span * 2;
          members.push({ a, x: Math.cos(a) * rm, z: Math.sin(a) * rm, y: h + 0.34, color: PALETTE[Math.floor(this.rng() * PALETTE.length)], ph: this.rng() * 6, jump: 0.5 + this.rng() });
        }
      });
      const rock = new THREE.Mesh(new THREE.ConeGeometry(3.6, 5, 8), rockMat);
      rock.rotation.x = Math.PI;
      rock.position.set(Math.cos(c) * (R + 3.5), -0.9 - 2.5, Math.sin(c) * (R + 3.5));
      this.group.add(rock);
    }
    const bodyGeo = new THREE.SphereGeometry(0.3, 12, 10);
    bodyGeo.scale(1, 1.15, 1);
    this.crowd = new THREE.InstancedMesh(bodyGeo, toon(0xffffff), members.length);
    this.crowdEyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), members.length * 2);
    this.crowdPupils = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: INK }), members.length * 2);
    const col = new THREE.Color();
    members.forEach((m, i) => this.crowd.setColorAt(i, col.setHex(m.color)));
    this.crowd.instanceColor.needsUpdate = true;
    for (const im of [this.crowd, this.crowdEyes, this.crowdPupils]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.members = members;
    this._dummy = new THREE.Object3D();
    this._updateCrowd(0);
  }

  _towers() {
    this.cones = [];
    const metal = toon(0x3a3470);
    for (const c of [-Math.PI / 4 - 0.25, -3 * Math.PI / 4 + 0.25]) {
      const x = Math.cos(c) * (R + 8.5), z = Math.sin(c) * (R + 8.5);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 14, 8), metal);
      withOutline(pole, 1.12);
      pole.position.set(x, 2.5, z);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.6), metal);
      withOutline(head, 1.06);
      head.position.set(x, 9.6, z);
      head.lookAt(0, 9.6, 0);
      for (let i = 0; i < 3; i++) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
        lamp.position.set((i - 1) * 0.72, 0, 0.31);
        head.add(lamp);
      }
      const coneGeo = new THREE.ConeGeometry(4.2, 14, 28, 1, true);
      coneGeo.translate(0, -7, 0);
      const cone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.rotation.x = -Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.position.set(x, 9.6, z);
      pivot.add(cone);
      this.group.add(pole, head, pivot);
      this.cones.push({ pivot, ph: this.rng() * 6, target: new THREE.Vector3() });
    }
  }

  // ---------- reações a eventos ----------
  hitPillar(id) {
    const p = this.pillars[id];
    if (p) p.hit = 1;
  }
  hitReactor() {
    this.reactor.hit = 1;
  }
  telegraph(angle, type) {
    const r = this.reactor;
    r.targetAim = angle;
    r.warn = C.spawn.telegraph;
    r.bomb = type === 'bomb';
    r.arrowMat.color.setHex(r.bomb ? 0xff3b3b : 0xffb347);
  }
  fire() {
    this.reactor.fire = 1;
    this.reactor.warn = 0;
  }
  goalFlash(s) {
    this.goals[s].flash = 1;
  }
  crowdCheer(a = 0.6) {
    this.excite = Math.min(1, this.excite + a);
  }
  setSuddenDeath() {
    this.sudden = true;
    this.reactor.coreMat.color.setHex(0xff3b3b);
    this.reactor.light.color.setHex(0xff3b3b);
  }
  sealGoal(s, instant = false) {
    const g = this.goals[s];
    if (g.sealed) return;
    g.sealed = true;
    g.seal.visible = true;
    g.sealT = instant ? 1 : 0;
    g.seal.position.y = instant ? 0 : -1.2;
    g.curtainMat.uniforms.uOn.value = 0;
    g.rail.visible = false;
    g.zoneMat.color.setHex(EMPTY_COLOR);
    g.lineMat.color.setHex(0x4a4670);
    g.bar.visible = false;
  }

  // ---------- animação ----------
  _updateCrowd(t) {
    const d = this._dummy;
    const ex = this.excite;
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const hop = Math.abs(Math.sin(t * (3 + m.jump * 2) + m.ph)) * (0.04 + ex * 0.55 * m.jump);
      const y = m.y + hop;
      d.position.set(m.x, y, m.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, 1 + hop * 0.3, 1);
      d.updateMatrix();
      this.crowd.setMatrixAt(i, d.matrix);
      const fx = -Math.cos(m.a), fz = -Math.sin(m.a);
      const px = -fz, pz = fx;
      d.scale.set(1, 1, 1);
      for (const sd of [-1, 1]) {
        const k = i * 2 + (sd > 0 ? 1 : 0);
        d.position.set(m.x + fx * 0.24 + px * sd * 0.11, y + 0.1, m.z + fz * 0.24 + pz * sd * 0.11);
        d.updateMatrix();
        this.crowdEyes.setMatrixAt(k, d.matrix);
        d.position.set(m.x + fx * 0.31 + px * sd * 0.11, y + 0.1, m.z + fz * 0.31 + pz * sd * 0.11);
        d.updateMatrix();
        this.crowdPupils.setMatrixAt(k, d.matrix);
      }
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.crowdEyes.instanceMatrix.needsUpdate = true;
    this.crowdPupils.instanceMatrix.needsUpdate = true;
  }

  update(dt, sim) {
    this.t += dt;
    const t = this.t;
    const r = this.reactor;
    r.aim += wrapAngle(r.targetAim - r.aim) * (1 - Math.exp(-12 * dt));
    r.nozzle.rotation.y = -r.aim;
    r.arrow.rotation.y = -r.aim;
    r.rings[0].rotation.z += dt * 1.3;
    r.rings[1].rotation.z -= dt * 0.9;
    r.warn = Math.max(0, r.warn - dt);
    r.arrowMat.opacity = r.warn > 0 ? (Math.sin(t * 28) > 0 ? 0.95 : 0.4) : Math.max(0, r.arrowMat.opacity - dt * 6);
    r.arrow.scale.setScalar(r.warn > 0 ? 1 + (1 - r.warn / C.spawn.telegraph) * 0.15 : 1);
    r.fire = Math.max(0, r.fire - dt * 4);
    r.barrel.position.x = 1.15 - r.fire * 0.35;
    r.hit = Math.max(0, r.hit - dt * 5);
    r.dome.scale.setScalar(1 + r.hit * 0.1);
    const coreP = 1 + Math.sin(t * (this.sudden ? 12 : 4)) * 0.08 + r.warn * 0.4 + r.fire * 0.3;
    r.core.scale.setScalar(coreP);
    r.light.intensity = 5 + Math.sin(t * 4) * 1.5 + r.warn * 12 + r.fire * 25;

    for (const p of this.pillars) {
      p.hit = Math.max(0, p.hit - dt * 5);
      const k = p.hit;
      p.g.scale.set(1 + k * 0.18, 1 - k * 0.1, 1 + k * 0.18);
      p.ringMat.color.setRGB(1, 0.96, 0.63 + k * 0.37);
      p.gem.rotation.y += dt * 1.5;
      p.gem.position.y = 1.62 + Math.sin(t * 2 + p.g.position.x) * 0.08;
    }

    for (let s = 0; s < 4; s++) {
      const g = this.goals[s];
      const pod = sim?.pods[s];
      g.flash = Math.max(0, g.flash - dt * 2.2);
      const danger = pod && pod.active && pod.points <= 3 ? 1 : 0;
      g.danger = damp(g.danger, danger, 4, dt);
      const pulse = g.danger * (0.5 + 0.5 * Math.sin(t * 8));
      if (!g.sealed) {
        g.zoneMat.opacity = 0.2 + pulse * 0.28 + g.flash * 0.45;
        g.curtainMat.uniforms.uFlash.value = g.flash;
        for (const cm of g.caps) cm.color.setRGB(1, 1 - pulse * 0.6, 1 - pulse * 0.6);
      }
      g.curtainMat.uniforms.uTime.value = t;
      g.light.intensity = g.flash * 40 + pulse * 5;
      if (g.sealed && g.sealT < 1) {
        g.sealT = Math.min(1, g.sealT + dt * 1.8);
        g.seal.position.y = -1.2 + 1.2 * easeOutBack(g.sealT);
      }
    }

    this.excite = Math.max(0, this.excite - dt * 0.5);
    this._updateCrowd(t);
    for (const c of this.cones) {
      c.target.set(Math.sin(t * 0.35 + c.ph) * 6, 0, Math.cos(t * 0.27 + c.ph) * 5);
      c.pivot.lookAt(c.target);
    }
    for (const f of this.flags) f.rotation.y = Math.sin(t * 3 + f.userData.ph) * 0.6;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    disposeTree(this.group);
  }
}

