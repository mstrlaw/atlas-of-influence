import * as THREE from 'three';
import gsap from 'gsap';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** Renderer, camera, resize handling and the render loop. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private tickers = new Set<(dt: number, t: number) => void>();
  private resizers = new Set<() => void>();
  private afterRender: (() => void)[] = [];
  private clock = new THREE.Timer();

  constructor(container: HTMLElement) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#d3d5da');
    this.scene.fog = new THREE.Fog("#d3d5da", 40, 110);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 80;
    this.controls.enabled = false;

    this.addLights();

    // One clock for everything: GSAP is stepped from this render loop, right before the frame is drawn,
    // so tweened values, the HTML overlay position and the WebGL frame always belong to the same frame.
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get aspect() { return this.camera.aspect; }

  onTick(fn: (dt: number, t: number) => void) { this.tickers.add(fn); }
  onResize(fn: () => void) { this.resizers.add(fn); }

  /** Distance at which a w×h rectangle fits the viewport with the given margin. */
  fitDistance(w: number, h: number, margin = 1.12) {
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max((h * margin) / 2 / t, (w * margin) / 2 / (t * this.camera.aspect));
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    const { x, y } = this.shift;
    if (x || y) this.camera.setViewOffset(w, h, -x, y, w, h);
    this.camera.updateProjectionMatrix();
    this.resizers.forEach((fn) => fn());
  }

  private shift = { x: 0, y: 0 };
  /**
   * Slide the whole picture right by x and up by y CSS pixels without moving the camera, so the scene
   * can sit in the part of the window a panel leaves free. Projection (and picking) follow along.
   */
  setShift(x: number, y: number) {
    x = Math.round(x); y = Math.round(y);
    if (x === this.shift.x && y === this.shift.y) return;
    this.shift = { x, y };
    if (x === 0 && y === 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(window.innerWidth, window.innerHeight, -x, y, window.innerWidth, window.innerHeight);
  }

  /** Run once, after the next frame has actually been drawn (e.g. once a new texture is on screen). */
  afterNextRender(fn: () => void) { this.afterRender.push(fn); }

  private frame() {
    gsap.updateRoot(performance.now() / 1000);
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.getElapsed();
    if (this.controls.enabled) this.controls.update();
    this.tickers.forEach((fn) => fn(dt, t));
    this.renderer.render(this.scene, this.camera);
    const done = this.afterRender.splice(0);
    done.forEach((fn) => fn());
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8d9098', 1.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 5, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#ffffff', 0.9); // neutral fill from behind: grey from every angle
    rim.position.set(-6, 2, -4);
    this.scene.add(rim);
  }

}
