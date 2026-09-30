import * as THREE from 'three';

export const INK = 0x1a1033;

let gradient = null;
/** Rampa de 4 tons para o sombreamento cartoon. */
export function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 165, 225, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra });
}

const outlineMats = new Map();
export function outlineMaterial(color = INK) {
  if (!outlineMats.has(color)) outlineMats.set(color, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
  return outlineMats.get(color);
}

/** Contorno de "tinta" por casco invertido. Funciona bem em formas convexas centradas na origem. */
export function withOutline(mesh, scale = 1.07, color = INK) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(color));
  o.scale.setScalar(scale);
  o.userData.isOutline = true;
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Sombra "blob" barata e legível — ajuda a ler altura/posição em 3D. */
export function blobShadow(size = 1, opacity = 0.35) {
  const m = new THREE.Mesh(
    blobGeo,
    new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x14082e, transparent: true, opacity, depthWrite: false }),
  );
  m.scale.set(size, 1, size);
  m.renderOrder = 1;
  return m;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.userData.isOutline && o.geometry !== blobGeo) o.geometry.dispose();
    if (o.material && !o.userData.isOutline) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if ([...outlineMats.values()].includes(m)) continue;
        if (m.map && m.map !== blobTex) m.map.dispose();
        m.dispose();
      }
    }
  });
}
