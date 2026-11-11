import * as THREE from 'three';
import { toon, withOutline, blobShadow, INK } from '../engine/toon.js';
import { lookDef } from './characters.js';
import { createCharacterModel, CharacterAnimator } from './CharacterModel.js';

/**
 * Veículos/equipamentos por minigame. O mesmo personagem (com skin, acessório e pose) senta em
 * qualquer um deles: o veículo vem sempre na cor do jogador (`def.team`), o corpo na cor da skin.
 * Todos olham para +z local, como os personagens.
 */
const mesh = (geo, color, { pos, rot, scale, outline = 1.07 } = {}) => {
  const m = new THREE.Mesh(geo, toon(color));
  if (outline) withOutline(m, outline);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  return m;
};
const cyl = (rt, rb, h, seg = 18) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const TIRE = 0x2a2140;

const BUILDERS = {
  /** Trombada: carrinho bate-bate com pneuzão de borracha. */
  bumper(g, c) {
    g.add(mesh(cyl(0.78, 0.62, 0.42, 26), c.team, { pos: [0, 0.3, 0] }));
    const tire = mesh(new THREE.TorusGeometry(0.82, 0.2, 10, 30), TIRE, { pos: [0, 0.26, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    const ink = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.25, 8, 30), new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    ink.rotation.x = Math.PI / 2;
    ink.position.y = 0.26;
    g.add(tire, ink);
    g.add(mesh(box(0.5, 0.12, 0.2), c.teamAccent, { pos: [0, 0.4, 0.74], outline: 1.1 }));
    const pole = mesh(cyl(0.025, 0.025, 0.9, 6), 0x9aa3c7, { pos: [0, 0.9, -0.62], outline: 0 });
    const flag = mesh(new THREE.SphereGeometry(0.1, 10, 8), c.teamAccent, { pos: [0, 1.38, -0.62] });
    g.add(pole, flag);
    return { seatY: 0.16, scale: 0.92, shadow: 2.3, parts: { flag } };
  },
  /** Pula-Pinta: mola de pogo com rolo de tinta na base. */
  pogo(g, c) {
    const spring = new THREE.Group();
    for (let i = 0; i < 4; i++) spring.add(mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), 0xc9d1e8, { pos: [0, 0.12 + i * 0.13, 0], rot: [Math.PI / 2, 0, 0], outline: 0 }));
    g.add(spring);
    g.add(mesh(cyl(0.34, 0.4, 0.12, 16), c.team, { pos: [0, 0.06, 0] }));
    g.add(mesh(cyl(0.5, 0.42, 0.16, 18), c.team, { pos: [0, 0.66, 0] }));
    g.add(mesh(box(1.1, 0.07, 0.1), c.teamDark, { pos: [0, 0.78, 0.3], outline: 1.1 }));
    return { seatY: 0.42, scale: 0.9, shadow: 1.5, parts: { spring } };
  },
  /** Caixote!: botinas de carregador. */
  feet(g, c) {
    const boots = [];
    for (const s of [-1, 1]) {
      const b = mesh(new THREE.SphereGeometry(0.2, 12, 10), c.teamDark, { pos: [s * 0.22, 0.15, 0.06], scale: [1, 0.75, 1.5] });
      g.add(b);
      boots.push(b);
    }
    g.add(mesh(cyl(0.4, 0.34, 0.14, 16), c.team, { pos: [0, 0.36, 0] }));
    return { seatY: 0.0, scale: 0.95, shadow: 1.5, parts: { boots } };
  },
  /** Lata-Velha: tanque de sucata com canhão de rolha. */
  tank(g, c) {
    g.add(mesh(box(1.1, 0.4, 1.36), c.team, { pos: [0, 0.38, 0], outline: 1.06 }));
    for (const s of [-1, 1]) {
      g.add(mesh(box(0.3, 0.42, 1.5), TIRE, { pos: [s * 0.66, 0.22, 0], outline: 1.06 }));
      for (let i = 0; i < 3; i++) g.add(mesh(cyl(0.13, 0.13, 0.06, 10), 0x9aa3c7, { pos: [s * 0.83, 0.2, (i - 1) * 0.48], rot: [0, 0, Math.PI / 2], outline: 0 }));
    }
    const turret = new THREE.Group();
    turret.position.y = 0.58;
    turret.add(mesh(cyl(0.5, 0.56, 0.2, 16), c.teamAccent, { pos: [0, 0.06, 0], outline: 1.08 }));
    const barrel = mesh(cyl(0.13, 0.13, 0.9, 12), c.teamDark, { pos: [0, 0.14, 0.82], rot: [Math.PI / 2, 0, 0], outline: 1.12 });
    const muzzle = mesh(cyl(0.19, 0.19, 0.16, 12), c.teamAccent, { pos: [0, 0.14, 1.28], rot: [Math.PI / 2, 0, 0], outline: 1.1 });
    turret.add(barrel, muzzle);
    g.add(turret);
    return { seatY: 0.4, scale: 0.72, shadow: 2.5, parts: { turret, barrel } };
  },
  /** Pé na Tábua: kart de rolimã. */
  kart(g, c) {
    g.add(mesh(box(0.74, 0.24, 1.24), c.team, { pos: [0, 0.26, 0], outline: 1.07 }));
    g.add(mesh(new THREE.ConeGeometry(0.34, 0.5, 4), c.team, { pos: [0, 0.26, 0.82], rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1.3, 1, 0.5], outline: 1.08 }));
    g.add(mesh(box(0.9, 0.06, 0.22), c.teamAccent, { pos: [0, 0.64, -0.62], outline: 1.1 }));
    for (const s of [-1, 1]) g.add(mesh(box(0.06, 0.3, 0.1), c.teamDark, { pos: [s * 0.3, 0.48, -0.62], outline: 0 }));
    const wheels = [];
    for (const [x, z] of [[-0.48, 0.46], [0.48, 0.46], [-0.5, -0.44], [0.5, -0.44]]) {
      const w = mesh(cyl(0.2, 0.2, 0.18, 12), TIRE, { pos: [x, 0.2, z], rot: [0, 0, Math.PI / 2], outline: 1.1 });
      g.add(w);
      wheels.push(w);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }));
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(0, 0.3, -1.0);
    flame.visible = false;
    g.add(flame);
    return { seatY: 0.1, scale: 0.7, shadow: 1.9, parts: { wheels, flame } };
  },
  /** Mira Certa e Pega-Ficha: prancha flutuante. */
  board(g, c) {
    g.add(mesh(new THREE.SphereGeometry(0.62, 18, 10), c.team, { pos: [0, 0.2, 0], scale: [1, 0.22, 1.25] }));
    g.add(mesh(new THREE.SphereGeometry(0.4, 14, 8), c.teamAccent, { pos: [0, 0.27, 0.1], scale: [1, 0.12, 1.2], outline: 0 }));
    const jet = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: c.team, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    jet.rotation.x = -Math.PI / 2;
    jet.position.y = 0.03;
    g.add(jet);
    return { seatY: 0.05, scale: 0.88, shadow: 1.7, parts: { jet } };
  },
  /** Mira Certa: prancha + lançador de desentupidor. */
  blaster(g, c) {
    const r = BUILDERS.board(g, c);
    const gun = new THREE.Group();
    gun.position.set(0.5, 0.62, 0.2);
    gun.add(mesh(cyl(0.11, 0.13, 0.6, 10), c.teamDark, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.2], outline: 1.12 }));
    gun.add(mesh(cyl(0.17, 0.17, 0.1, 10), c.teamAccent, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.52], outline: 1.1 }));
    g.add(gun);
    r.parts.gun = gun;
    return r;
  },
};

/**
 * Personagem + veículo prontos para a cena.
 * `kind`: 'pod' (o disco do Bolada, parte do próprio modelo) ou uma chave de BUILDERS.
 * Devolve { root, model, anim, rig, shadow, def }. `root` é o que a view posiciona/gira.
 */
export function createAvatar(player, kind = 'pod') {
  const def = lookDef(player);
  const model = createCharacterModel(def, { pod: kind === 'pod' });
  const anim = new CharacterAnimator(model);
  const root = new THREE.Group();
  let rig = null;
  if (kind !== 'pod') {
    const g = new THREE.Group();
    rig = { group: g, ...BUILDERS[kind](g, def) };
    root.add(g);
    model.root.position.y = rig.seatY;
    model.root.scale.setScalar(rig.scale);
  }
  root.add(model.root);
  const shadow = blobShadow(rig ? rig.shadow : 2.1, 0.4);
  shadow.position.y = 0.015;
  return { root, model, anim, rig, shadow, def, player };
}
