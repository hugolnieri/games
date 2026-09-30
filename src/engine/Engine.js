import * as THREE from 'three';

export class Engine {
  constructor(container, { quality = 'high' } = {}) {
    this.container = container;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // cores cartoon puras
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    this.clock = new THREE.Clock();
    this.onResize = [];
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this.setQuality(quality);
  }

  setQuality(q) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'high' ? 2 : 1));
    this._resize();
  }

  get width() {
    return this.container.clientWidth || window.innerWidth;
  }
  get height() {
    return this.container.clientHeight || window.innerHeight;
  }

  _resize() {
    const w = this.width, h = this.height;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    for (const f of this.onResize) f(w, h, buf.y);
  }

  start(update) {
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 1 / 20);
      update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.clock.start();
    loop();
  }
}
