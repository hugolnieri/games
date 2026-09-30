import * as THREE from 'three';

/**
 * Modos:
 *  - 'game': vista fixa elevada que sempre enquadra a arena inteira (ajusta ao aspecto da tela)
 *  - 'orbit': órbita suave ao redor de um ponto (menu e celebração)
 * Tremor por "trauma" (cresce com impactos, decai sozinho) + punch de FOV.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.baseFov = 45;
    this.elev = (56 * Math.PI) / 180;
    this.fitRadius = 11.2;
    this.fitRadiusPortrait = 10.5; // no retrato a largura manda: corta só a espessura da parede externa
    // âncoras dos rótulos acima dos jogadores (raio/altura em unidades de mundo)
    this.labelRadius = 8.85;
    this.labelHeight = 2.6;
    this.pos = new THREE.Vector3(0, 40, 40);
    this.target = new THREE.Vector3();
    this.dPos = new THREE.Vector3();
    this.dTarget = new THREE.Vector3();
    this.mode = 'orbit';
    this.lambda = 2;
    this.orbit = { center: new THREE.Vector3(), radius: 28, height: 17, speed: 0.07, angle: 0.6, lookY: -1 };
    this.game = { pos: new THREE.Vector3(0, 20, 14), target: new THREE.Vector3(0, 0, 0.6), dist: 24 };
    this.trauma = 0;
    this.shakeScale = 1;
    this.punch = 0;
    this.t = 0;
    this.viewShift = 0; // fração da largura: desloca a cena para a direita (menu à esquerda)
    this.viewShiftTarget = 0;
    this.pos.set(0, 30, 34);
  }

  setGame(lambda = 5) {
    this.mode = 'game';
    this.lambda = lambda;
  }

  setOrbit({ center = new THREE.Vector3(), radius = 28, height = 17, speed = 0.07, lookY = -1, lambda = 2, angle } = {}) {
    this.mode = 'orbit';
    Object.assign(this.orbit, { radius, height, speed, lookY });
    this.orbit.center.copy(center);
    if (angle !== undefined) this.orbit.angle = angle;
    else {
      const dx = this.pos.x - center.x, dz = this.pos.z - center.z;
      this.orbit.angle = Math.atan2(dx, dz);
    }
    this.lambda = lambda;
  }

  addTrauma(a) {
    this.trauma = Math.min(1, this.trauma + a * this.shakeScale);
  }
  addPunch(a) {
    this.punch = Math.min(6, this.punch + a * (this.shakeScale > 0 ? 1 : 0.3));
  }

  /**
   * Encontra a menor distância (e o melhor alvo em z) que mostram a arena inteira.
   * `reservePx` é a faixa do topo (em pixels, numa tela de `pxHeight`) que o HUD ocupa
   * (cronômetro + altura dos rótulos acima dos jogadores): os rótulos nunca entram nela.
   */
  fit(aspect, pxHeight = 720, reservePx = 128) {
    const portrait = aspect < 1;
    this.elev = ((portrait ? 64 : 56) * Math.PI) / 180;
    const cam = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 500);
    const dir = new THREE.Vector3(0, Math.sin(this.elev), Math.cos(this.elev));
    const pts = [];
    const R = portrait ? this.fitRadiusPortrait : this.fitRadius;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      pts.push(new THREE.Vector3(Math.cos(a) * R, 2.2, Math.sin(a) * R));
    }
    const labels = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      labels.push(new THREE.Vector3(Math.cos(a) * this.labelRadius, this.labelHeight, Math.sin(a) * this.labelRadius));
    }
    const labelTop = 1 - (2 * reservePx) / Math.max(200, pxHeight);
    const xLim = portrait ? 0.97 : 0.9;
    const v = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    let best = { d: 80, tz: 0.5 };
    for (let tz = -1; tz <= 2.5; tz += 0.25) {
      tgt.set(0, 0, tz);
      for (let d = 12; d < best.d; d += 0.25) {
        cam.position.copy(tgt).addScaledVector(dir, d);
        cam.lookAt(tgt);
        cam.updateMatrixWorld();
        let ok = true;
        for (const p of pts) {
          v.copy(p).project(cam);
          if (Math.abs(v.x) > xLim || v.y > 0.84 || v.y < -0.8) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (const p of labels) {
            v.copy(p).project(cam);
            if (v.y > labelTop) {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          best = { d, tz };
          break;
        }
      }
    }
    this.game.target.set(0, 0, best.tz);
    this.game.pos.copy(this.game.target).addScaledVector(dir, best.d);
    this.game.dist = best.d;
  }

  update(dt, focus) {
    this.t += dt;
    if (this.mode === 'game') {
      this.dPos.copy(this.game.pos);
      this.dTarget.copy(this.game.target);
      if (focus) {
        this.dTarget.x += focus.x;
        this.dTarget.z += focus.z;
        this.dPos.x += focus.x * 0.5;
        this.dPos.z += focus.z * 0.5;
      }
    } else {
      const o = this.orbit;
      o.angle += o.speed * dt;
      this.dPos.set(o.center.x + Math.sin(o.angle) * o.radius, o.center.y + o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.dTarget.set(o.center.x, o.center.y + o.lookY, o.center.z);
    }
    const k = 1 - Math.exp(-this.lambda * dt);
    this.pos.lerp(this.dPos, k);
    this.target.lerp(this.dTarget, k);

    const s = this.trauma * this.trauma;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const t = this.t * 40;
    const ox = (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.2)) * 0.5 * s * 0.6;
    const oy = (Math.sin(t * 1.7 + 2.1) + Math.sin(t * 3.1)) * 0.5 * s * 0.45;
    const oz = Math.sin(t * 1.3 + 0.7) * s * 0.3;
    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z + oz);
    this.camera.lookAt(this.target.x + ox * 0.4, this.target.y + oy * 0.4, this.target.z);
    if (s > 0) this.camera.rotateZ(Math.sin(t * 0.9) * s * 0.03);

    this.punch = Math.max(0, this.punch - dt * 10);
    this.camera.fov = this.baseFov - this.punch;
    this.viewShift += (this.viewShiftTarget - this.viewShift) * (1 - Math.exp(-4 * dt));
    if (Math.abs(this.viewShift) > 0.001) {
      const w = this.camera.aspect * 1000;
      this.camera.setViewOffset(w, 1000, -this.viewShift * w, 0, w, 1000);
    } else if (this.camera.view) {
      this.camera.clearViewOffset();
    }
    this.camera.updateProjectionMatrix();
  }
}
