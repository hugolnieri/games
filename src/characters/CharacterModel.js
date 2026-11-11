import * as THREE from 'three';
import { toon, withOutline, INK } from '../engine/toon.js';
import { clamp, damp, lerp } from '../engine/math.js';

const sphere = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
const basic = (color) => new THREE.MeshBasicMaterial({ color });

/**
 * Cria um personagem dentro do seu pod flutuante, só com primitivas.
 * Convenção: o personagem olha para +z local.
 */
export function createCharacterModel(def, { pod: withPod = true } = {}) {
  const mats = [];
  const team = def.team ?? def.color; // cor do jogador (pod, brilho); a skin só troca o corpo
  const part = (geo, color, { outline = 1.08, pos, scale, rot } = {}) => {
    const mat = toon(color);
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    if (outline) withOutline(mesh, outline);
    if (pos) mesh.position.set(...pos);
    if (scale) mesh.scale.set(...scale);
    if (rot) mesh.rotation.set(...rot);
    return mesh;
  };

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  // brilho de hover no chão
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 28),
    new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.03;
  glow.visible = withPod;
  root.add(glow);

  // ---- pod (disco voador de pára-choque) ----
  const pod = new THREE.Group();
  tilt.add(pod);
  const teamAccent = def.teamAccent ?? def.accent, teamDark = def.teamDark ?? def.dark;
  const lamps = [];
  if (withPod) {
    const hull = part(new THREE.CylinderGeometry(0.95, 0.58, 0.44, 30), team, { pos: [0, 0.26, 0], outline: 1.06 });
    pod.add(hull);
    const bumper = part(new THREE.TorusGeometry(0.9, 0.15, 10, 36), teamAccent, { outline: 0, pos: [0, 0.47, 0], rot: [Math.PI / 2, 0, 0] });
    pod.add(bumper);
    const bumperInk = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.19, 8, 36), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    bumperInk.rotation.x = Math.PI / 2;
    bumperInk.position.y = 0.47;
    pod.add(bumperInk);
    const belly = part(new THREE.CylinderGeometry(0.5, 0.3, 0.16, 20), teamDark, { pos: [0, 0.02, 0], outline: 0 });
    pod.add(belly);
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.55;
      const lamp = new THREE.Mesh(sphere(0.07, 8, 6), basic(0xfff3b0));
      lamp.position.set(Math.sin(a) * 0.86, 0.3, Math.cos(a) * 0.86);
      pod.add(lamp);
      lamps.push(lamp);
    }
  }

  // ---- criatura ----
  const body = new THREE.Group();
  body.position.y = 0.42;
  tilt.add(body);
  const head = new THREE.Group();
  head.position.y = 0.74;
  body.add(head);

  const eyes = [];
  const pupils = [];
  const addEye = (x, y, z, r = 0.13, sy = 1) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const white = new THREE.Mesh(sphere(r, 14, 12), basic(0xffffff));
    withOutline(white, 1.14);
    white.scale.y = sy;
    const pupil = new THREE.Mesh(sphere(r * 0.55, 12, 10), basic(0x14082e));
    pupil.position.z = r * 0.62;
    const shine = new THREE.Mesh(sphere(r * 0.18, 6, 5), basic(0xffffff));
    shine.position.set(r * 0.2, r * 0.25, r * 0.95);
    g.add(white, pupil, shine);
    g.userData.baseY = 1;
    head.add(g);
    eyes.push(g);
    pupils.push(pupil);
    return g;
  };

  // boca: meia-rosca (sorriso por padrão)
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 14, Math.PI), basic(0x2a0f1f));
  mouth.rotation.z = Math.PI;
  head.add(mouth);

  const armPivots = [];
  const makeArms = (color, handColor, y = 0.26, x = 0.38) => {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * x, y, 0.04);
      const upper = part(new THREE.CylinderGeometry(0.075, 0.09, 0.34, 10), color, { pos: [0, -0.17, 0], outline: 1.12 });
      const hand = part(sphere(0.12, 12, 10), handColor, { pos: [0, -0.36, 0], outline: 1.1 });
      pivot.add(upper, hand);
      pivot.userData.side = side;
      body.add(pivot);
      armPivots.push(pivot);
    }
  };

  const extras = { tick: null };

  switch (def.id) {
    case 'faisca': {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.18, 0], scale: [1, 0.95, 0.9] }));
      body.add(part(sphere(0.28), def.accent, { pos: [0, 0.14, 0.2], scale: [1, 1, 0.55], outline: 0 }));
      head.add(part(sphere(0.44, 22, 16), def.color, { scale: [1.06, 0.95, 1] }));
      for (const s of [-1, 1]) {
        head.add(part(new THREE.ConeGeometry(0.16, 0.34, 4), def.color, { pos: [s * 0.25, 0.37, -0.02], rot: [0, Math.PI / 4, s * -0.38] }));
        head.add(part(new THREE.ConeGeometry(0.08, 0.2, 4), 0xff9fbf, { pos: [s * 0.25, 0.35, 0.05], rot: [0, Math.PI / 4, s * -0.38], outline: 0 }));
        for (let i = 0; i < 3; i++) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.016), basic(INK));
          w.position.set(s * 0.33, -0.08 + (i - 1) * 0.045, 0.34);
          w.rotation.z = s * (i - 1) * 0.18;
          head.add(w);
        }
      }
      head.add(part(sphere(0.18), def.accent, { pos: [0, -0.11, 0.33], scale: [1.25, 0.8, 0.8], outline: 0 }));
      head.add(part(sphere(0.055, 8, 6), 0xff4f8b, { pos: [0, -0.03, 0.48], outline: 0 }));
      for (let i = 0; i < 3; i++) {
        head.add(part(new THREE.ConeGeometry(0.07, 0.24, 5), 0xffd23f, { pos: [(i - 1) * 0.1, 0.46, 0.08], rot: [0.3, 0, (i - 1) * -0.5], outline: 1.15 }));
      }
      addEye(-0.16, 0.06, 0.35, 0.13, 1.15);
      addEye(0.16, 0.06, 0.35, 0.13, 1.15);
      for (const p of pupils) p.scale.set(0.6, 1.3, 1);
      mouth.position.set(0, -0.2, 0.42);
      mouth.scale.setScalar(0.8);
      makeArms(def.color, def.accent);
      // rabo em arco
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.05, -0.4), new THREE.Vector3(0.15, 0.35, -0.75), new THREE.Vector3(0.05, 0.85, -0.85), new THREE.Vector3(-0.12, 1.05, -0.7),
      ]);
      const tail = new THREE.Group();
      tail.add(part(new THREE.TubeGeometry(curve, 20, 0.07, 8), def.color, { outline: 0 }));
      tail.add(part(sphere(0.12, 10, 8), 0xffd23f, { pos: [-0.12, 1.05, -0.7] }));
      body.add(tail);
      extras.tick = (t) => {
        tail.rotation.z = Math.sin(t * 4) * 0.25;
      };
      break;
    }
    case 'broto': {
      body.add(part(sphere(0.42), def.color, { pos: [0, 0.17, 0], scale: [1.05, 0.9, 0.95] }));
      body.add(part(sphere(0.3), def.accent, { pos: [0, 0.12, 0.2], scale: [1, 1.05, 0.55], outline: 0 }));
      head.add(part(sphere(0.42, 22, 16), def.color, { pos: [0, 0, 0.06], scale: [1.0, 0.8, 1.25] }));
      for (const s of [-1, 1]) {
        head.add(part(sphere(0.18), def.color, { pos: [s * 0.2, 0.26, 0.1] }));
        head.add(part(sphere(0.045, 8, 6), def.dark, { pos: [s * 0.08, 0.04, 0.57], outline: 0 }));
        head.add(part(sphere(0.07, 8, 6), 0xff9fbf, { pos: [s * 0.3, -0.1, 0.38], scale: [1, 0.6, 0.5], outline: 0 }));
      }
      addEye(-0.2, 0.33, 0.18, 0.14);
      addEye(0.2, 0.33, 0.18, 0.14);
      const crest = [
        [0, 0.36, -0.12, -0.5], [0, 0.26, -0.36, -0.9],
      ];
      for (const [x, y, z, r] of crest) head.add(part(new THREE.ConeGeometry(0.08, 0.24, 6), 0xffb13d, { pos: [x, y, z], rot: [r, 0, 0] }));
      body.add(part(new THREE.ConeGeometry(0.09, 0.26, 6), 0xffb13d, { pos: [0, 0.48, -0.26], rot: [-1.1, 0, 0] }));
      body.add(part(new THREE.ConeGeometry(0.08, 0.22, 6), 0xffb13d, { pos: [0, 0.24, -0.42], rot: [-1.4, 0, 0] }));
      mouth.position.set(0, -0.1, 0.5);
      mouth.scale.set(1.9, 1, 1);
      makeArms(def.color, def.accent);
      const tail = part(new THREE.ConeGeometry(0.16, 0.8, 10), def.color, { pos: [0, 0.02, -0.62], rot: [-1.2, 0, 0] });
      body.add(tail);
      extras.tick = (t) => {
        tail.rotation.y = Math.sin(t * 3) * 0.3;
      };
      break;
    }
    case 'parafuso': {
      body.add(part(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 16), def.color, { pos: [0, 0.2, 0] }));
      body.add(part(new THREE.BoxGeometry(0.3, 0.2, 0.06), def.dark, { pos: [0, 0.22, 0.36], outline: 0 }));
      const heart = new THREE.Mesh(sphere(0.05, 8, 6), basic(0xff4f8b));
      heart.position.set(0, 0.22, 0.4);
      body.add(heart);
      head.add(part(new THREE.BoxGeometry(0.72, 0.56, 0.62), def.color, { outline: 1.07 }));
      head.add(part(new THREE.BoxGeometry(0.6, 0.24, 0.05), 0x0b1633, { pos: [0, 0.04, 0.31], outline: 0 }));
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(s * 0.14, 0.05, 0.34);
        const led = new THREE.Mesh(sphere(0.07, 10, 8), basic(0x7ff6ff));
        led.scale.set(1.3, 1, 0.4);
        g.add(led);
        g.userData.baseY = 1;
        head.add(g);
        eyes.push(g);
        head.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10), def.accent, { pos: [s * 0.4, 0, 0], rot: [0, 0, Math.PI / 2], outline: 1.1 }));
      }
      for (let i = 0; i < 3; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.02), basic(0x0b1633));
        bar.position.set((i - 1) * 0.1, -0.17, 0.315);
        head.add(bar);
      }
      head.add(part(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), 0x9aa3c7, { pos: [0.1, 0.44, 0], outline: 0 }));
      const bulb = new THREE.Mesh(sphere(0.075, 10, 8), basic(0xff4f5e));
      bulb.position.set(0.1, 0.64, 0);
      withOutline(bulb, 1.15);
      head.add(bulb);
      mouth.visible = false;
      makeArms(def.accent, def.color, 0.3, 0.42);
      extras.tick = (t) => {
        bulb.material.color.setHex(Math.sin(t * 5) > 0 ? 0xff4f5e : 0x7a1c2a);
      };
      break;
    }
    case 'jujuba': {
      body.add(part(sphere(0.42), def.color, { pos: [0, 0.17, 0], scale: [1.05, 1, 0.95] }));
      body.add(part(sphere(0.27), def.accent, { pos: [0, 0.12, 0.22], scale: [1, 1.05, 0.5], outline: 0 }));
      head.add(part(sphere(0.45, 22, 16), def.color, { scale: [1.08, 0.98, 1] }));
      for (const s of [-1, 1]) {
        head.add(part(sphere(0.17), def.color, { pos: [s * 0.34, 0.34, -0.02], scale: [1, 1, 0.6] }));
        head.add(part(sphere(0.09, 10, 8), def.accent, { pos: [s * 0.34, 0.34, 0.07], scale: [1, 1, 0.5], outline: 0 }));
        head.add(part(sphere(0.07, 8, 6), 0xff2f7a, { pos: [s * 0.3, -0.1, 0.36], scale: [1, 0.6, 0.5], outline: 0 }));
      }
      head.add(part(sphere(0.17), def.accent, { pos: [0, -0.1, 0.36], scale: [1.2, 0.85, 0.8], outline: 0 }));
      head.add(part(sphere(0.06, 8, 6), def.dark, { pos: [0, -0.04, 0.5], scale: [1.3, 0.9, 0.8], outline: 0 }));
      addEye(-0.17, 0.08, 0.37, 0.11);
      addEye(0.17, 0.08, 0.37, 0.11);
      mouth.position.set(0, -0.17, 0.47);
      mouth.scale.setScalar(0.7);
      makeArms(def.color, def.accent);
      const drop = part(sphere(0.09, 10, 8), def.accent, { pos: [0.02, 0.5, 0.05], scale: [1, 1.3, 1] });
      head.add(drop);
      extras.tick = (t) => {
        body.scale.x = body.scale.z = 1 + Math.sin(t * 5) * 0.025; // balanço de gelatina
        drop.position.y = 0.5 + Math.sin(t * 4) * 0.02;
      };
      break;
    }
    case 'pipoca': {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.18, 0], scale: [1, 1.08, 0.95] }));
      body.add(part(sphere(0.27), def.accent, { pos: [0, 0.14, 0.2], scale: [1, 1.1, 0.5], outline: 0 }));
      head.add(part(sphere(0.4, 22, 16), def.color, { scale: [1, 1.02, 1] }));
      head.add(part(new THREE.ConeGeometry(0.17, 0.42, 10), 0xff7a2a, { pos: [0, -0.06, 0.52], rot: [Math.PI / 2, 0, 0], scale: [1.1, 1, 0.75] }));
      const tuft = [];
      for (let i = 0; i < 3; i++) {
        const f = part(sphere(0.1, 10, 8), 0xff4f5e, { pos: [(i - 1) * 0.11, 0.44, -0.04], scale: [0.7, 1.7, 0.7], rot: [0, 0, (i - 1) * -0.45] });
        head.add(f);
        tuft.push(f);
      }
      addEye(-0.2, 0.1, 0.31, 0.14);
      addEye(0.2, 0.1, 0.31, 0.14);
      mouth.visible = false;
      makeArms(def.color, def.dark, 0.3, 0.4);
      for (const a of armPivots) a.scale.set(1.5, 1, 0.6); // asas
      body.add(part(new THREE.ConeGeometry(0.16, 0.4, 6), def.dark, { pos: [0, 0.2, -0.42], rot: [-1.9, 0, 0], scale: [1.4, 1, 0.5] }));
      extras.tick = (t) => {
        tuft.forEach((f, i) => (f.rotation.x = Math.sin(t * 6 + i) * 0.18));
      };
      break;
    }
    case 'glub':
    default: {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.18, 0], scale: [1, 1.05, 1] }));
      head.add(part(sphere(0.47, 22, 16), def.color, { scale: [1.12, 0.92, 1] }));
      addEye(0, 0.16, 0.4, 0.15);
      addEye(-0.24, 0.02, 0.35, 0.11);
      addEye(0.24, 0.02, 0.35, 0.11);
      const tips = [];
      for (const s of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.14, 0.36, 0), new THREE.Vector3(s * 0.22, 0.58, 0.02), new THREE.Vector3(s * 0.34, 0.74, 0.06)]);
        head.add(part(new THREE.TubeGeometry(curve, 10, 0.03, 6), def.dark, { outline: 0 }));
        const tip = new THREE.Mesh(sphere(0.08, 10, 8), basic(0xd8ff8a));
        tip.position.set(s * 0.34, 0.76, 0.06);
        withOutline(tip, 1.15);
        head.add(tip);
        tips.push(tip);
      }
      for (const [x, y, z] of [[0.33, 0.2, -0.2], [-0.28, 0.28, -0.22], [0.1, 0.35, -0.3]]) {
        head.add(part(sphere(0.06, 8, 6), def.accent, { pos: [x, y, z], outline: 0 }));
      }
      head.add(part(sphere(0.07, 8, 6), def.color, { pos: [0.18, -0.4, 0.22] }));
      mouth.geometry.dispose();
      mouth.geometry = new THREE.TorusGeometry(0.05, 0.02, 6, 14);
      mouth.rotation.z = 0;
      mouth.position.set(0, -0.2, 0.43);
      makeArms(def.color, def.accent);
      extras.tick = (t) => {
        tips[0].position.y = 0.76 + Math.sin(t * 5) * 0.03;
        tips[1].position.y = 0.76 + Math.sin(t * 5 + 1.5) * 0.03;
      };
      break;
    }
  }

  // estrelinhas de tontura
  const stars = new THREE.Group();
  stars.position.y = 1.35;
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), basic(0xffe14d));
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    stars.add(s);
  }
  stars.visible = false;
  body.add(stars);

  // acessório equipado (cosmético): preso à cabeça
  const accTick = addAccessory(head, def.acc, def.anch || {}, part);
  if (accTick) {
    const base = extras.tick;
    extras.tick = (t) => {
      base?.(t);
      accTick(t);
    };
  }

  return { def, hasPod: withPod, root, tilt, pod, body, head, eyes, pupils, mouth, arms: armPivots, mats, glow, stars, lamps, extras };
}

/** Constrói o acessório `id` na cabeça. Devolve um tick opcional de animação. */
function addAccessory(head, id, anch, part) {
  if (!id) return null;
  const [hy = 0.4, hz = 0] = anch.hat || [];
  const [fy = 0.06, fz = 0.47] = anch.face || [];
  const w = anch.w || 0.46;
  const g = new THREE.Group();
  head.add(g);
  const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
  switch (id) {
    case 'acc-coroa': {
      g.position.set(0, hy, hz);
      g.add(part(cyl(0.21, 0.19, 0.13, 14), 0xffd23f, { pos: [0, 0.06, 0] }));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(part(new THREE.ConeGeometry(0.06, 0.15, 4), 0xffd23f, { pos: [Math.cos(a) * 0.17, 0.19, Math.sin(a) * 0.17], outline: 1.15 }));
      }
      g.add(part(sphere(0.045, 8, 6), 0xff4f8b, { pos: [0, 0.07, 0.2], outline: 0 }));
      return null;
    }
    case 'acc-cartola': {
      g.position.set(0, hy, hz);
      g.rotation.z = -0.12;
      g.add(part(cyl(0.3, 0.3, 0.04, 18), 0x2a2140, { pos: [0, 0.03, 0] }));
      g.add(part(cyl(0.18, 0.2, 0.3, 16), 0x2a2140, { pos: [0, 0.2, 0] }));
      g.add(part(cyl(0.205, 0.205, 0.07, 16), 0xff4f8b, { pos: [0, 0.1, 0], outline: 0 }));
      return null;
    }
    case 'acc-bone': {
      g.position.set(0, hy - 0.06, hz);
      g.add(part(new THREE.SphereGeometry(0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xff4f8b, { pos: [0, 0.02, 0] }));
      g.add(part(cyl(0.2, 0.2, 0.03, 14), 0xffd23f, { pos: [0, 0.04, 0.26], scale: [1, 1, 0.8] }));
      g.add(part(sphere(0.04, 8, 6), 0xffd23f, { pos: [0, 0.29, 0], outline: 0 }));
      return null;
    }
    case 'acc-helice': {
      g.position.set(0, hy - 0.05, hz);
      g.add(part(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x2fb0ff, { pos: [0, 0.02, 0] }));
      g.add(part(cyl(0.02, 0.02, 0.14, 6), 0x1a1033, { pos: [0, 0.29, 0], outline: 0 }));
      const prop = new THREE.Group();
      prop.position.y = 0.37;
      prop.add(part(new THREE.BoxGeometry(0.5, 0.025, 0.09), 0xffd23f, { outline: 1.12 }), part(new THREE.BoxGeometry(0.09, 0.025, 0.5), 0xff4f8b, { outline: 1.12 }));
      g.add(prop);
      return (t) => {
        prop.rotation.y = t * 14;
      };
    }
    case 'acc-fones': {
      g.position.set(0, 0.02, 0);
      g.add(part(new THREE.TorusGeometry(w, 0.035, 6, 20, Math.PI), 0x2a2140, { outline: 0 }));
      for (const s of [-1, 1]) g.add(part(cyl(0.13, 0.13, 0.1, 14), 0x7fe0d0, { pos: [s * w, 0, 0], rot: [0, 0, Math.PI / 2], outline: 1.12 }));
      return null;
    }
    case 'acc-oculos': {
      g.position.set(0, fy, fz);
      for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.24, 0.15, 0.04), 0x14082e, { pos: [s * 0.15, 0, 0], outline: 1.12 }));
      g.add(part(new THREE.BoxGeometry(0.1, 0.03, 0.03), 0x14082e, { outline: 0 }));
      const shine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.01), basic(0xffffff));
      shine.position.set(-0.19, 0.03, 0.025);
      shine.rotation.z = 0.5;
      g.add(shine);
      return null;
    }
    case 'acc-chifres': {
      g.position.set(0, hy - 0.08, hz);
      g.add(part(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x9aa3c7, { pos: [0, 0.02, 0] }));
      for (const s of [-1, 1]) g.add(part(new THREE.ConeGeometry(0.07, 0.3, 8), 0xfff4d6, { pos: [s * 0.27, 0.16, 0], rot: [0, 0, s * -0.7] }));
      return null;
    }
    default:
      head.remove(g);
      return null;
  }
}

/** Animação procedural por estados, sem clipes. */
export class CharacterAnimator {
  constructor(model) {
    this.m = model;
    this.t = Math.random() * 10;
    this.blink = 1 + Math.random() * 3;
    this.attack = 0;
    this.hurt = 0;
    this.flash = 0;
    this.flashColor = new THREE.Color();
    this.mode = 'play'; // play | victory | out
    this.lean = 0;
    this.look = 0;
    this.spin = 0;
    this.squash = 0;
    this.dangerFlash = 0;
    this.baseY = model.hasPod ? 0.16 : 0; // sem pod (veículo próprio) o corpo não flutua
    this.bob = model.hasPod ? 0.035 : 0.012;
    this.pose = model.def.pose || 'pose-pulo';
  }

  trigger(name) {
    if (name === 'attack') this.attack = 1;
    else if (name === 'hurt') {
      this.hurt = 1;
      this.flash = 1;
      this.flashColor.setHex(0xff2050);
      this.spin = Math.PI * 2;
    } else if (name === 'super') {
      this.flash = 0.8;
      this.flashColor.setHex(0xffffff);
    } else if (name === 'bump') this.squash = 1;
  }

  setMode(mode) {
    this.mode = mode;
  }

  update(dt, { vLocal = 0, look = null } = {}) {
    const m = this.m;
    this.t += dt;
    const t = this.t;
    m.extras.tick?.(t);

    // piscar
    this.blink -= dt;
    let eyeY = 1;
    if (this.blink < 0) {
      eyeY = 0.12;
      if (this.blink < -0.11) this.blink = 1.6 + Math.random() * 3;
    }
    if (this.hurt > 0.3 || this.mode === 'out') eyeY = Math.min(eyeY, 0.3);
    for (const e of m.eyes) e.scale.y = damp(e.scale.y, eyeY, 30, dt);

    // flutuação + inclinação na direção do movimento
    const bob = Math.sin(t * 3.1) * this.bob;
    m.tilt.position.y = this.baseY + bob;
    this.lean = damp(this.lean, clamp(-vLocal * 0.035, -0.32, 0.32), 12, dt);
    m.tilt.rotation.z = this.lean;
    if (m.glow.visible) m.glow.material.opacity = 0.4 + Math.sin(t * 6) * 0.1;

    // olhar para a bola mais próxima
    if (look !== null) this.look = damp(this.look, clamp(look, -0.8, 0.8), 8, dt);
    else this.look = damp(this.look, 0, 4, dt);
    this.spin = damp(this.spin, 0, 5, dt);
    m.head.rotation.y = this.look + this.spin;

    // ataque (pulso): braços para frente + achata
    this.attack = Math.max(0, this.attack - dt / 0.26);
    const a = this.attack > 0 ? Math.sin(this.attack * Math.PI) : 0;
    this.squash = Math.max(0, this.squash - dt / 0.2);
    const sq = Math.max(a * 0.14, Math.sin(this.squash * Math.PI) * 0.12);

    // dano
    this.hurt = Math.max(0, this.hurt - dt / 1.1);
    m.stars.visible = this.hurt > 0.05;
    if (m.stars.visible) m.stars.rotation.y += dt * 7;

    if (this.mode === 'victory') {
      const j = Math.abs(Math.sin(t * 6.5));
      let by = 0.42 + j * 0.5, ry = 0, rz = 0;
      m.body.scale.set(1 + (1 - j) * 0.1, 1 - (1 - j) * 0.12 + j * 0.05, 1 + (1 - j) * 0.1);
      const arm = (fx, fz) => {
        for (const a of m.arms) {
          a.rotation.x = fx(a.userData.side);
          a.rotation.z = fz(a.userData.side);
        }
      };
      switch (this.pose) {
        case 'pose-giro': // pirueta de braços abertos
          by = 0.42 + j * 0.22;
          ry = t * 9;
          arm(() => -0.2, (s) => s * 1.45);
          break;
        case 'pose-onda': // ola: braços alternados, corpo gingando
          by = 0.46;
          rz = Math.sin(t * 5) * 0.28;
          m.body.scale.set(1, 1, 1);
          arm((s) => -2.4 + Math.sin(t * 5 + s * 1.6) * 0.9, (s) => s * 0.5);
          break;
        case 'pose-flex': // exibido: braços dobrados para cima, pulsando
          by = 0.42 + Math.abs(Math.sin(t * 3.2)) * 0.08;
          m.body.scale.set(1 + Math.sin(t * 6.4) * 0.06, 1, 1 + Math.sin(t * 6.4) * 0.06);
          arm(() => -2.9, (s) => s * (1.25 + Math.sin(t * 6.4) * 0.12));
          break;
        case 'pose-robo': { // dança robótica em passos secos
          const k = Math.floor(t * 4) % 4;
          by = 0.42 + (k % 2) * 0.1;
          ry = [0.5, 0, -0.5, 0][k];
          m.body.scale.set(1, 1, 1);
          arm((s) => (((k + (s > 0 ? 1 : 0)) % 2) ? -1.57 : -3.0), (s) => s * 0.9);
          break;
        }
        default:
          arm((s) => -2.7 + Math.sin(t * 13 + s) * 0.35, (s) => s * 0.35);
      }
      m.body.position.y = by;
      m.body.rotation.set(0, ry, rz);
      m.mouth.rotation.z = Math.PI;
    } else {
      m.body.position.y = 0.42;
      m.body.rotation.set(0, 0, 0);
      m.body.scale.set(1 + sq, 1 - sq, 1 + sq);
      for (const arm of m.arms) {
        const s = arm.userData.side;
        const idle = Math.sin(t * 3.1 + s) * 0.08;
        arm.rotation.x = lerp(-0.35 + idle, -1.55, a);
        arm.rotation.z = lerp(s * 0.55, s * 0.12, a);
      }
      m.mouth.rotation.z = this.hurt > 0.05 || this.mode === 'out' ? 0 : Math.PI;
    }

    // flash de cor (dano, super)
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const f = this.flash;
    for (const mat of m.mats) mat.emissive.copy(this.flashColor).multiplyScalar(f * 0.85);
  }
}
