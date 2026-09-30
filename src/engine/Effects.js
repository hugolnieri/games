import * as THREE from 'three';
import { easeOutCubic } from './math.js';

/** Anéis de onda de choque (pulso, gol, explosão) com pool. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.RingGeometry(0.78, 1, 56).rotateX(-Math.PI / 2);
    this.rings = [];
  }

  ring({ x = 0, y = 0.08, z = 0, color = 0xffffff, from = 0.5, to = 2.5, duration = 0.3, opacity = 0.9 }) {
    let r = this.rings.find((q) => !q.active);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      r = { mesh: new THREE.Mesh(this.geo, mat), active: false };
      r.mesh.renderOrder = 6;
      this.scene.add(r.mesh);
      this.rings.push(r);
    }
    Object.assign(r, { active: true, t: 0, from, to, duration, opacity });
    r.mesh.visible = true;
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.setHex(color);
    r.mesh.scale.setScalar(from);
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.duration);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * easeOutCubic(k));
      r.mesh.material.opacity = r.opacity * (1 - k);
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }

  clear() {
    for (const r of this.rings) {
      r.active = false;
      r.mesh.visible = false;
    }
  }
}
