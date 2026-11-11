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

  // ---- personalidade: sobrancelhas, pálpebras e trejeitos por personagem ----
  const brows = [];
  /** Sobrancelha. `tilt` > 0 no lado direito (x > 0) = brava; o animador muda conforme o humor. */
  const addBrow = (x, y, z, tilt, len = 0.2, color = INK) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.04), basic(color));
    b.position.set(x, y, z);
    b.rotation.z = tilt;
    head.add(b);
    brows.push({ mesh: b, base: tilt, y, side: Math.sign(x) || 1 });
    return b;
  };
  /** Pálpebra pesada (calota na cor do corpo) sobre um olho criado por addEye. */
  const addLid = (eye, r, amount = 0.45, color = def.color) => {
    const lid = part(new THREE.SphereGeometry(r * 1.12, 14, 8, 0, Math.PI * 2, 0, Math.PI * amount), color, { outline: 0, rot: [-0.25, 0, 0] });
    eye.add(lid);
    return lid;
  };
  // com chapéu equipado, o enfeite do topo da cabeça dá lugar ao acessório
  const hat = ['acc-coroa', 'acc-cartola', 'acc-bone', 'acc-helice', 'acc-chifres'].includes(def.acc);
  const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

  switch (def.id) {
    // Faísca: esquentada e exibida. Sobrancelha brava, presinha, óculos de corrida, rabo de raio.
    case 'faisca': {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.18, 0], scale: [1, 0.95, 0.9] }));
      body.add(part(sphere(0.28), def.accent, { pos: [0, 0.14, 0.2], scale: [1, 1, 0.55], outline: 0 }));
      head.add(part(sphere(0.44, 22, 16), def.color, { scale: [1.06, 0.95, 1] }));
      const ears = [];
      for (const s of [-1, 1]) {
        const ear = part(new THREE.ConeGeometry(0.16, 0.36, 4), def.color, { pos: [s * 0.27, 0.37, -0.04], rot: [0, Math.PI / 4, s * -0.38] });
        head.add(ear);
        ears.push(ear);
        head.add(part(new THREE.ConeGeometry(0.08, 0.2, 4), 0xff9fbf, { pos: [s * 0.27, 0.35, 0.03], rot: [0, Math.PI / 4, s * -0.38], outline: 0 }));
        for (let i = 0; i < 3; i++) {
          const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.016, 0.016), basic(INK));
          w.position.set(s * 0.33, -0.08 + (i - 1) * 0.045, 0.34);
          w.rotation.z = s * (i - 1) * 0.18;
          head.add(w);
        }
      }
      head.add(part(sphere(0.18), def.accent, { pos: [0, -0.11, 0.33], scale: [1.25, 0.8, 0.8], outline: 0 }));
      head.add(part(sphere(0.055, 8, 6), 0xff4f8b, { pos: [0, -0.03, 0.48], outline: 0 }));
      const tuft = [];
      if (!hat) {
        for (let i = 0; i < 4; i++) {
          const sp = part(new THREE.ConeGeometry(0.075, 0.3 + (i % 2) * 0.1, 4), 0xffd23f, { pos: [(i - 1.5) * 0.09, 0.5, -0.02], rot: [-0.25, 0, (i - 1.5) * -0.42], outline: 1.15 });
          head.add(sp);
          tuft.push(sp);
        }
        // óculos de corrida empurrados para a testa
        const gog = new THREE.Group();
        gog.position.set(0, 0.29, 0.31);
        gog.rotation.x = -0.55;
        for (const s of [-1, 1]) {
          gog.add(part(new THREE.TorusGeometry(0.1, 0.032, 8, 16), 0xffd23f, { pos: [s * 0.125, 0, 0], outline: 0 }));
          const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), basic(0x7ff6ff));
          lens.position.set(s * 0.125, 0, 0.005);
          gog.add(lens);
        }
        head.add(gog);
        head.add(part(new THREE.TorusGeometry(0.385, 0.028, 6, 24), 0x2a2140, { pos: [0, 0.25, -0.02], rot: [Math.PI / 2 - 0.12, 0, 0], outline: 0 }));
      }
      addEye(-0.16, 0.05, 0.35, 0.13, 1.1);
      addEye(0.16, 0.05, 0.35, 0.13, 1.1);
      for (const p of pupils) p.scale.set(0.6, 1.3, 1);
      addBrow(-0.17, 0.2, 0.43, -0.5, 0.22);
      addBrow(0.17, 0.2, 0.43, 0.5, 0.22);
      head.add(part(new THREE.ConeGeometry(0.035, 0.1, 6), 0xffffff, { pos: [0.1, -0.2, 0.45], rot: [Math.PI, 0, 0], scale: [0.8, 0.75, 0.8], outline: 0 })); // presinha
      mouth.position.set(0.04, -0.19, 0.43);
      mouth.scale.set(1.1, 0.8, 0.8);
      makeArms(def.color, def.accent);
      // rabo em forma de raio
      const bolt = new THREE.Shape();
      [[0, 0], [0.2, 0.28], [0.07, 0.3], [0.27, 0.6], [0.12, 0.62], [0.36, 1.02], [-0.02, 0.5], [0.12, 0.48], [-0.1, 0.2], [0.04, 0.18]].forEach(([x, y], i) => (i ? bolt.lineTo(x, y) : bolt.moveTo(x, y)));
      const boltGeo = new THREE.ExtrudeGeometry(bolt, { depth: 0.1, bevelEnabled: false });
      boltGeo.translate(0, 0, -0.05);
      boltGeo.rotateY(Math.PI / 2);
      const tail = new THREE.Group();
      tail.position.set(0, 0.02, -0.3);
      tail.add(part(boltGeo, 0xffd23f, { outline: 0 }));
      const boltInk = new THREE.Mesh(boltGeo, basic(INK));
      boltInk.scale.set(1.9, 1.06, 1.08);
      boltInk.position.set(0, -0.03, 0.03);
      boltInk.material.side = THREE.BackSide;
      tail.add(boltInk);
      body.add(tail);
      extras.tick = (t) => {
        tail.rotation.y = Math.sin(t * 6) * 0.35; // rabo inquieto
        head.position.y = 0.74 + Math.abs(Math.sin(t * 6.5)) * 0.018; // não para quieta
        ears[0].rotation.x = Math.sin(t * 9) > 0.93 ? 0.35 : 0;
        tuft.forEach((sp, i) => (sp.scale.y = 1 + Math.sin(t * 17 + i * 2) * 0.12)); // faísca no topete
      };
      break;
    }
    // Broto: o preguiçoso do brejo. Olho meio fechado, junco na boca, brotinho na cabeça.
    case 'broto': {
      body.add(part(sphere(0.42), def.color, { pos: [0, 0.17, 0], scale: [1.08, 0.86, 0.98] }));
      body.add(part(sphere(0.3), def.accent, { pos: [0, 0.12, 0.2], scale: [1, 1.05, 0.55], outline: 0 }));
      head.add(part(sphere(0.42, 22, 16), def.color, { pos: [0, 0, 0.06], scale: [1.0, 0.8, 1.25] }));
      for (const s of [-1, 1]) {
        head.add(part(sphere(0.18), def.color, { pos: [s * 0.2, 0.26, 0.1] }));
        head.add(part(sphere(0.045, 8, 6), def.dark, { pos: [s * 0.08, 0.04, 0.57], outline: 0 }));
        head.add(part(sphere(0.07, 8, 6), 0xff9fbf, { pos: [s * 0.3, -0.1, 0.38], scale: [1, 0.6, 0.5], outline: 0 }));
        addLid(addEye(s * 0.2, 0.33, 0.18, 0.14), 0.14, 0.4);
      }
      for (const p of pupils) p.position.y = -0.035;
      for (const [x, y, z, r] of [[0, 0.3, -0.2, -0.7], [0, 0.2, -0.4, -1.0]]) head.add(part(new THREE.ConeGeometry(0.09, 0.26, 6), 0xffb13d, { pos: [x, y, z], rot: [r, 0, 0] }));
      body.add(part(new THREE.ConeGeometry(0.1, 0.28, 6), 0xffb13d, { pos: [0, 0.48, -0.26], rot: [-1.1, 0, 0] }));
      body.add(part(new THREE.ConeGeometry(0.09, 0.24, 6), 0xffb13d, { pos: [0, 0.24, -0.42], rot: [-1.4, 0, 0] }));
      mouth.position.set(0, -0.1, 0.5);
      mouth.scale.set(2.0, 0.75, 1);
      // junco pendurado no canto da boca
      const reed = new THREE.Group();
      reed.position.set(0.17, -0.12, 0.52);
      reed.rotation.set(0.9, 0, -0.9);
      reed.add(part(cyl(0.013, 0.013, 0.42, 5), 0xd9b36a, { pos: [0, 0.21, 0], outline: 0 }));
      reed.add(part(sphere(0.05, 8, 6), 0x8a5a2a, { pos: [0, 0.44, 0], scale: [1, 2, 1], outline: 1.15 }));
      head.add(reed);
      // brotinho de duas folhas
      const sprout = new THREE.Group();
      sprout.position.set(0, 0.3, 0.04);
      if (!hat) {
        sprout.add(part(cyl(0.02, 0.028, 0.24, 6), def.dark, { pos: [0, 0.12, 0], outline: 0 }));
        for (const s of [-1, 1]) sprout.add(part(sphere(0.1, 10, 8), 0x8ff06a, { pos: [s * 0.1, 0.27, 0], scale: [1.35, 0.3, 0.75], rot: [0, 0, s * 0.55], outline: 1.12 }));
        head.add(sprout);
      }
      makeArms(def.color, def.accent);
      const tail = part(new THREE.ConeGeometry(0.16, 0.8, 10), def.color, { pos: [0, 0.02, -0.62], rot: [-1.2, 0, 0] });
      body.add(tail);
      extras.armRest = (s, t) => [0.05 + Math.sin(t * 1.2 + s) * 0.05, s * 0.75]; // braços largados
      extras.tick = (t) => {
        tail.rotation.y = Math.sin(t * 1.6) * 0.3;
        head.rotation.z = Math.sin(t * 0.9) * 0.08; // balança devagar, quase dormindo
        sprout.rotation.z = Math.sin(t * 1.8) * 0.22;
        reed.rotation.x = 0.9 + Math.sin(t * 2.2) * 0.1; // mastigando o junco
      };
      break;
    }
    // Parafuso: robô ansioso. Olhos desparelhados, boca em zigue-zague, parafusão solto, remendo.
    case 'parafuso': {
      body.add(part(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 16), def.color, { pos: [0, 0.2, 0] }));
      body.add(part(new THREE.BoxGeometry(0.3, 0.2, 0.06), def.dark, { pos: [0, 0.22, 0.36], outline: 0 }));
      const heart = new THREE.Mesh(sphere(0.05, 8, 6), basic(0xff4f8b));
      heart.position.set(0, 0.22, 0.4);
      body.add(heart);
      head.add(part(new THREE.BoxGeometry(0.72, 0.58, 0.62), def.color, { outline: 1.07 }));
      head.add(part(new THREE.BoxGeometry(0.6, 0.4, 0.05), 0x0b1633, { pos: [0, -0.01, 0.31], outline: 0 }));
      [1.75, 0.95].forEach((k, i) => {
        const s = i ? 1 : -1;
        const g = new THREE.Group();
        g.position.set(s * 0.15, 0.05 + (i ? -0.01 : 0.01), 0.34);
        const led = new THREE.Mesh(sphere(0.07, 12, 10), basic(0x7ff6ff));
        led.scale.set(k, k, 0.4);
        g.add(led);
        g.userData.baseY = 1;
        head.add(g);
        eyes.push(g);
        head.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 10), def.accent, { pos: [s * 0.4, 0, 0], rot: [0, 0, Math.PI / 2], outline: 1.1 }));
      });
      addBrow(-0.16, 0.22, 0.345, 0.35, 0.2, 0x7ff6ff);
      addBrow(0.15, 0.17, 0.345, -0.35, 0.16, 0x7ff6ff);
      for (let i = 0; i < 6; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.02), basic(0x7ff6ff));
        seg.position.set((i - 2.5) * 0.052, -0.15, 0.34);
        seg.rotation.z = i % 2 ? 0.75 : -0.75;
        head.add(seg);
      }
      // remendo de ferrugem rebitado
      head.add(part(new THREE.BoxGeometry(0.2, 0.17, 0.03), 0xc9703a, { pos: [0.27, -0.17, 0.32], rot: [0, 0, 0.18], outline: 1.1 }));
      for (const [x, y] of [[0.2, -0.11], [0.34, -0.22]]) head.add(part(sphere(0.022, 6, 5), 0xfff4d6, { pos: [x, y, 0.34], outline: 0 }));
      // antena torta
      const ant = new THREE.Group();
      ant.position.set(0.2, 0.28, 0);
      ant.rotation.z = -0.45;
      ant.add(part(cyl(0.02, 0.02, 0.34, 6), 0x9aa3c7, { pos: [0, 0.17, 0], outline: 0 }));
      const bulb = new THREE.Mesh(sphere(0.075, 10, 8), basic(0xff4f5e));
      bulb.position.set(0, 0.38, 0);
      withOutline(bulb, 1.15);
      ant.add(bulb);
      head.add(ant);
      // parafusão solto no cocuruto
      const screw = new THREE.Group();
      screw.position.set(-0.16, 0.27, 0);
      screw.rotation.z = 0.3;
      if (!hat) {
        screw.add(part(cyl(0.05, 0.05, 0.24, 8), 0x9aa3c7, { pos: [0, 0.12, 0], outline: 1.15 }));
        for (let i = 0; i < 3; i++) screw.add(part(new THREE.TorusGeometry(0.058, 0.014, 5, 10), 0xc9d1e8, { pos: [0, 0.05 + i * 0.065, 0], rot: [Math.PI / 2 + 0.2, 0, 0], outline: 0 }));
        screw.add(part(cyl(0.15, 0.13, 0.08, 12), 0xc9d1e8, { pos: [0, 0.28, 0], outline: 1.1 }));
        screw.add(part(new THREE.BoxGeometry(0.24, 0.03, 0.045), 0x4f587a, { pos: [0, 0.325, 0], outline: 0 }));
        head.add(screw);
      }
      mouth.visible = false;
      makeArms(def.accent, def.color, 0.3, 0.42);
      extras.armRest = (s, t) => [-1.75 + Math.sin(t * 11 + s) * 0.07, s * 0.2]; // mãos na frente, tremendo
      extras.tick = (t) => {
        bulb.material.color.setHex(Math.sin(t * 7) > 0 ? 0xff4f5e : 0x7a1c2a);
        head.position.x = Math.sin(t * 31) > 0.9 ? 0.02 : 0; // tique nervoso
        head.rotation.z = Math.sin(t * 2.3) * 0.04;
        screw.rotation.y = t * 1.4; // o parafuso vai desrosqueando
        screw.position.y = 0.27 + Math.abs(Math.sin(t * 2.3)) * 0.03;
        ant.rotation.z = -0.45 + Math.sin(t * 5) * 0.08;
      };
      break;
    }
    // Jujuba: parece um docinho, bate como um caminhão. Orelha mordida, laço, curativo, guarda de boxe.
    case 'jujuba': {
      body.add(part(sphere(0.42), def.color, { pos: [0, 0.17, 0], scale: [1.05, 1, 0.95] }));
      body.add(part(sphere(0.27), def.accent, { pos: [0, 0.12, 0.22], scale: [1, 1.05, 0.5], outline: 0 }));
      head.add(part(sphere(0.45, 22, 16), def.color, { scale: [1.08, 0.98, 1] }));
      // orelha direita inteira (com laço) e a esquerda com uma mordida
      head.add(part(sphere(0.17), def.color, { pos: [0.34, 0.34, -0.02], scale: [1, 1, 0.6] }));
      head.add(part(sphere(0.09, 10, 8), def.accent, { pos: [0.34, 0.34, 0.07], scale: [1, 1, 0.5], outline: 0 }));
      const bitten = new THREE.Group();
      bitten.position.set(-0.34, 0.34, -0.02);
      bitten.rotation.z = 0.75;
      bitten.scale.z = 0.6;
      bitten.add(part(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0.85, Math.PI - 0.85), def.color, {}));
      const cut = new THREE.Mesh(new THREE.CircleGeometry(0.128, 14), basic(def.dark));
      cut.rotation.x = -Math.PI / 2;
      cut.position.y = 0.112;
      bitten.add(cut);
      head.add(bitten);
      if (!hat) {
        const bow = new THREE.Group();
        bow.position.set(0.36, 0.5, 0.08);
        bow.rotation.z = -0.3;
        for (const s of [-1, 1]) bow.add(part(new THREE.ConeGeometry(0.11, 0.2, 8), 0xffd23f, { pos: [s * 0.11, 0, 0], rot: [0, 0, s * Math.PI / 2], outline: 1.12 }));
        bow.add(part(sphere(0.06, 8, 6), 0xffb13d, { outline: 1.15 }));
        head.add(bow);
      }
      head.add(part(sphere(0.07, 8, 6), 0xff2f7a, { pos: [0.3, -0.1, 0.36], scale: [1, 0.6, 0.5], outline: 0 }));
      for (const r of [0.78, -0.78]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.02), basic(0xffffff));
        strip.position.set(-0.3, -0.08, 0.375);
        strip.rotation.set(0, -0.55, r);
        head.add(strip);
      }
      head.add(part(sphere(0.17), def.accent, { pos: [0, -0.1, 0.36], scale: [1.2, 0.85, 0.8], outline: 0 }));
      head.add(part(sphere(0.06, 8, 6), def.dark, { pos: [0, -0.04, 0.5], scale: [1.3, 0.9, 0.8], outline: 0 }));
      addEye(-0.17, 0.08, 0.37, 0.115);
      addEye(0.17, 0.08, 0.37, 0.115);
      addBrow(-0.17, 0.24, 0.43, -0.28, 0.18);
      addBrow(0.17, 0.24, 0.43, 0.28, 0.18);
      mouth.position.set(0, -0.17, 0.47);
      mouth.scale.setScalar(0.7);
      makeArms(def.color, 0xffffff); // patas enfaixadas
      const drop = part(sphere(0.09, 10, 8), def.accent, { pos: [0.02, 0.5, 0.05], scale: [1, 1.3, 1] });
      if (!hat) head.add(drop);
      // guarda alta e um jab de vez em quando, alternando o braço
      extras.armRest = (s, t) => {
        const turn = Math.floor(t / 1.9) % 2 ? 1 : -1, ph = t % 1.9;
        return s === turn && ph < 0.22 ? [-1.5, s * 0.05] : [-1.95, s * -0.3];
      };
      extras.tick = (t) => {
        head.scale.x = head.scale.z = 1 + Math.sin(t * 5) * 0.02; // balanço de gelatina
        drop.position.y = 0.5 + Math.sin(t * 4) * 0.02;
        eyes[1].userData.baseY = t % 4.2 > 3.85 ? 0.1 : 1; // piscadela
      };
      break;
    }
    // Pipoca: energia pura. Olhos esbugalhados, bico aberto, topete de pipoca, casca de ovo listrada.
    case 'pipoca': {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.26, 0], scale: [1, 1.0, 0.95] }));
      body.add(part(sphere(0.25), def.accent, { pos: [0, 0.34, 0.22], scale: [1, 0.9, 0.5], outline: 0 }));
      // casca de ovo listrada como caixa de pipoca
      body.add(part(cyl(0.46, 0.4, 0.36, 16), 0xfff4d6, { pos: [0, 0.12, 0], outline: 1.06 }));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        if (i % 2 === 0) body.add(part(new THREE.BoxGeometry(0.09, 0.36, 0.02), 0xff4f5e, { pos: [Math.sin(a) * 0.44, 0.12, Math.cos(a) * 0.44], rot: [0, a, 0], outline: 0 }));
        if (i % 2) body.add(part(new THREE.ConeGeometry(0.075, 0.13, 4), 0xfff4d6, { pos: [Math.sin(a) * 0.44, 0.34, Math.cos(a) * 0.44], outline: 0 }));
      }
      head.add(part(sphere(0.4, 22, 16), def.color, { scale: [1, 1.02, 1] }));
      head.add(part(new THREE.ConeGeometry(0.17, 0.42, 10), 0xff7a2a, { pos: [0, -0.02, 0.52], rot: [Math.PI / 2 - 0.25, 0, 0], scale: [1.1, 1, 0.7] }));
      const jaw = part(new THREE.ConeGeometry(0.14, 0.32, 10), 0xe85f1a, { pos: [0, -0.2, 0.44], rot: [Math.PI / 2 + 0.55, 0, 0], scale: [1.05, 1, 0.6] });
      head.add(jaw);
      head.add(part(sphere(0.1, 8, 6), 0x8a1f3a, { pos: [0, -0.12, 0.36], scale: [1.2, 0.9, 0.8], outline: 0 }));
      const tuft = [];
      if (!hat) {
        for (const [x, y, z, r] of [[0, 0.44, 0.02, 0.13], [-0.14, 0.4, 0.04, 0.1], [0.14, 0.41, 0, 0.11], [0.05, 0.52, -0.06, 0.1], [-0.07, 0.5, -0.04, 0.09]]) {
          const k = part(sphere(r, 10, 8), 0xfff4d6, { pos: [x, y, z] });
          head.add(k);
          tuft.push(k);
        }
        head.add(part(sphere(0.07, 8, 6), 0xff4f5e, { pos: [0.02, 0.66, -0.08], scale: [0.7, 2, 0.7], rot: [-0.3, 0, -0.2], outline: 1.15 }));
      }
      addEye(-0.2, 0.13, 0.3, 0.175);
      addEye(0.2, 0.1, 0.31, 0.14);
      pupils[0].scale.setScalar(1.15);
      pupils[1].scale.setScalar(0.5);
      pupils[1].position.z = 0.14 * 0.86; // pupila miúda precisa ficar na superfície do olho
      addBrow(-0.21, 0.37, 0.36, 0.2, 0.17);
      addBrow(0.21, 0.3, 0.38, -0.2, 0.15);
      mouth.visible = false;
      makeArms(def.color, def.dark, 0.32, 0.4);
      for (const a of armPivots) a.scale.set(1.5, 1, 0.6); // asas
      body.add(part(new THREE.ConeGeometry(0.16, 0.4, 6), def.dark, { pos: [0, 0.3, -0.42], rot: [-1.9, 0, 0], scale: [1.4, 1, 0.5] }));
      extras.armRest = (s, t) => [-0.5, s * (1.05 + Math.sin(t * 24 + s) * 0.45)]; // bate as asas sem parar
      extras.tick = (t) => {
        head.rotation.z = (Math.floor(t * 2.6) % 2 ? 1 : -1) * 0.1; // cabeça aos trancos
        head.position.y = 0.74 + Math.abs(Math.sin(t * 9)) * 0.035;
        jaw.rotation.x = Math.PI / 2 + 0.45 + Math.abs(Math.sin(t * 8)) * 0.3; // piando
        tuft.forEach((k, i) => (k.position.y += Math.sin(t * 12 + i) * 0.0015));
        pupils[1].position.x = Math.sin(t * 13) * 0.03;
      };
      break;
    }
    // Glub: alien rabugento. Cada olho para um lado, pálpebra pesada, bico, braços cruzados, escorrendo.
    case 'glub':
    default: {
      body.add(part(sphere(0.4), def.color, { pos: [0, 0.18, 0], scale: [1, 1.05, 1] }));
      head.add(part(sphere(0.47, 22, 16), def.color, { scale: [1.12, 0.92, 1] }));
      addLid(addEye(0, 0.16, 0.4, 0.15), 0.15, 0.33);
      addLid(addEye(-0.24, 0.0, 0.36, 0.115), 0.115, 0.38);
      addLid(addEye(0.24, 0.0, 0.36, 0.115), 0.115, 0.38);
      addBrow(0.02, 0.36, 0.47, 0.22, 0.26);
      addBrow(-0.27, 0.15, 0.42, -0.45, 0.17);
      addBrow(0.27, 0.15, 0.42, 0.45, 0.17);
      const tips = [];
      for (const s of [-1, 1]) {
        // antenas caídas
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.14, 0.36, 0), new THREE.Vector3(s * 0.32, 0.62, 0), new THREE.Vector3(s * 0.52, 0.56, 0.03), new THREE.Vector3(s * 0.58, 0.34, 0.05)]);
        head.add(part(new THREE.TubeGeometry(curve, 12, 0.032, 6), def.dark, { outline: 0 }));
        const tip = new THREE.Mesh(sphere(0.085, 10, 8), basic(0xd8ff8a));
        tip.position.set(s * 0.58, 0.3, 0.05);
        withOutline(tip, 1.15);
        head.add(tip);
        tips.push(tip);
      }
      for (const [x, y, z] of [[0.33, 0.2, -0.2], [-0.28, 0.28, -0.22], [0.1, 0.35, -0.3]]) head.add(part(sphere(0.06, 8, 6), def.accent, { pos: [x, y, z], outline: 0 }));
      const drips = [[0.38, -0.3, 0.12], [-0.34, -0.33, 0.14], [0.12, -0.42, 0.24], [-0.5, -0.05, 0]].map(([x, y, z]) => {
        const d = part(sphere(0.06, 8, 6), def.color, { pos: [x, y, z], outline: 1.14 });
        head.add(d);
        return d;
      });
      const bubbles = [[-0.62, 0.2], [0.66, -0.1], [0.5, 0.55]].map(([x, z]) => {
        const b = new THREE.Mesh(sphere(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: def.accent, transparent: true, opacity: 0.75 }));
        b.position.set(x, 0, z * 0.3);
        head.add(b);
        return b;
      });
      mouth.geometry.dispose();
      mouth.geometry = new THREE.TorusGeometry(0.075, 0.024, 6, 14, Math.PI);
      mouth.position.set(0, -0.27, 0.42);
      mouth.rotation.z = 0;
      extras.mouthRest = 0; // bico (arco para baixo); só sorri quando ganha
      makeArms(def.color, def.accent);
      extras.armRest = (s) => [-1.15, s * -0.95]; // braços cruzados
      extras.tick = (t) => {
        tips[0].position.y = 0.3 + Math.sin(t * 2.2) * 0.03;
        tips[1].position.y = 0.3 + Math.sin(t * 2.2 + 1.5) * 0.03;
        // cada olho olha para um lado
        pupils.forEach((p, i) => p.position.set(Math.sin(t * 0.8 + i * 2.1) * 0.035, Math.cos(t * 0.6 + i * 1.3) * 0.02 - 0.02, p.position.z));
        drips.forEach((d, i) => {
          const k = (t * 0.45 + i * 0.27) % 1;
          d.scale.set(1 - k * 0.3, 1 + k * 1.8, 1 - k * 0.3);
        });
        bubbles.forEach((b, i) => {
          const k = (t * 0.22 + i / 3) % 1;
          b.position.y = -0.2 + k * 0.95;
          b.scale.setScalar(0.6 + k * 0.8);
          b.material.opacity = 0.8 * (1 - k);
        });
        head.rotation.z = Math.sin(t * 0.7) * 0.03;
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

  return { def, hasPod: withPod, root, tilt, pod, body, head, eyes, pupils, brows, mouth, arms: armPivots, mats, glow, stars, lamps, extras };
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
    for (const e of m.eyes) e.scale.y = damp(e.scale.y, eyeY * (e.userData.baseY ?? 1), 30, dt);
    // sobrancelhas acompanham o humor: brava no ataque, caída no dano, erguida na vitória
    const mood = this.hurt > 0.05 || this.mode === 'out' ? -0.55 : this.attack > 0 ? 0.4 : 0;
    for (const b of m.brows) {
      const target = this.mode === 'victory' ? b.base * 0.3 : b.base + mood * b.side;
      b.mesh.rotation.z = damp(b.mesh.rotation.z, target, 18, dt);
      b.mesh.position.y = damp(b.mesh.position.y, b.y + (this.mode === 'victory' ? 0.05 : 0), 14, dt);
    }

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
        // cada personagem tem a sua postura de braços em repouso
        const rest = m.extras.armRest ? m.extras.armRest(s, t) : [-0.35 + idle, s * 0.55];
        arm.rotation.x = lerp(rest[0], -1.55, a);
        arm.rotation.z = lerp(rest[1], s * 0.12, a);
      }
      m.mouth.rotation.z = this.hurt > 0.05 || this.mode === 'out' ? 0 : m.extras.mouthRest ?? Math.PI;
    }

    // flash de cor (dano, super)
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const f = this.flash;
    for (const mat of m.mats) mat.emissive.copy(this.flashColor).multiplyScalar(f * 0.85);
  }
}
