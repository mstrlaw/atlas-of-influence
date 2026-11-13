import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Logical CSS size of the screen UI. The DOM overlay is laid out at this size and scaled. */
export const SCREEN_PX = { w: 390, h: 845 };

const SCREEN_W = 0.92;
const SCREEN_H = SCREEN_W * (SCREEN_PX.h / SCREEN_PX.w);
const SCREEN_R = 0.11;
export const PHONE = { w: SCREEN_W + 0.08, h: SCREEN_H + 0.08, d: 0.085 };

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export class Phone {
  readonly group = new THREE.Group();
  readonly screen: THREE.Mesh;
  readonly screenCanvas = document.createElement('canvas');
  readonly screenTexture: THREE.CanvasTexture;   // smooth (mipmapped), used while moving
  readonly screenTextureCrisp: THREE.CanvasTexture; // pixel-exact, used at the 1:1 HTML handover
  private corners = [
    new THREE.Vector3(-SCREEN_W / 2, SCREEN_H / 2, 0),
    new THREE.Vector3(SCREEN_W / 2, SCREEN_H / 2, 0),
    new THREE.Vector3(-SCREEN_W / 2, -SCREEN_H / 2, 0),
    new THREE.Vector3(SCREEN_W / 2, -SCREEN_H / 2, 0),
  ];

  constructor() {
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(PHONE.w, PHONE.h, PHONE.d, 6, 0.14),
      new THREE.MeshStandardMaterial({ color: '#16171c', metalness: 0.6, roughness: 0.35 }),
    );
    this.group.add(body);

    // Screen: rounded rect with UVs normalised to 0..1 so a canvas maps onto it.
    const geo = new THREE.ShapeGeometry(roundedRect(SCREEN_W, SCREEN_H, SCREEN_R), 8);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++)
      uv.setXY(i, pos.getX(i) / SCREEN_W + 0.5, pos.getY(i) / SCREEN_H + 0.5);

    // Texture resolution follows the display so the tilted screen stays sharp on high-DPI phones.
    const res = Math.min(3, Math.max(2, Math.ceil(devicePixelRatio)));
    this.screenCanvas.width = SCREEN_PX.w * res;
    this.screenCanvas.height = SCREEN_PX.h * res;
    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.colorSpace = THREE.SRGBColorSpace;
    this.screenTexture.anisotropy = 8;
    this.screenTextureCrisp = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTextureCrisp.colorSpace = THREE.SRGBColorSpace;
    this.screenTextureCrisp.magFilter = this.screenTextureCrisp.minFilter = THREE.NearestFilter;
    this.screenTextureCrisp.generateMipmaps = false;

    this.screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.screenTexture, toneMapped: false }));
    this.screen.position.z = PHONE.d / 2 + 0.001;
    this.group.add(this.screen);
  }

  /**
   * Match the texture to the screen's current on-screen size in device pixels, so at the moment
   * the HTML hands over to the texture it's drawn 1 texel : 1 pixel (no mipmap softening).
   */
  setScreenResolution(cssWidth: number) {
    const w = Math.round(Math.min(SCREEN_PX.w * 3, Math.max(128, cssWidth * devicePixelRatio)));
    const h = Math.round(w * (SCREEN_PX.h / SCREEN_PX.w));
    if (this.screenCanvas.width === w && this.screenCanvas.height === h) return;
    this.screenCanvas.width = w;
    this.screenCanvas.height = h;
    this.screenTexture.dispose(); // GPU storage is sized once; reallocate at the new size
    this.screenTextureCrisp.dispose();
  }

  /**
   * Pixel-exact sampling while the screen is shown 1:1 (at the HTML handover), smooth filtering once it moves.
   * Bilinear filtering at a sub-pixel offset softens text by a pixel, which reads as a "pop" at the swap.
   * Both textures are uploaded up front, so switching is just a pointer swap.
   */
  setCrisp(crisp: boolean) {
    const mat = this.screen.material as THREE.MeshBasicMaterial;
    const want = crisp ? this.screenTextureCrisp : this.screenTexture;
    if (mat.map !== want) mat.map = want;
  }

  /** Mark both textures dirty and upload them now (not lazily at first draw). */
  uploadScreen(renderer: THREE.WebGLRenderer) {
    this.screenTexture.needsUpdate = true;
    this.screenTextureCrisp.needsUpdate = true;
    renderer.initTexture(this.screenTexture);
    renderer.initTexture(this.screenTextureCrisp);
  }

  /** Corners of the phone's back face in world space (TL, TR, BL, BR in the phone's own frame), inset off the rounded edge. */
  backCorners(): THREE.Vector3[] {
    this.group.updateWorldMatrix(true, false);
    const x = PHONE.w / 2 - 0.07, y = PHONE.h / 2 - 0.07, z = -PHONE.d / 2;
    return [[-x, y], [x, y], [-x, -y], [x, -y]].map(([a, b]) => new THREE.Vector3(a, b, z).applyMatrix4(this.group.matrixWorld));
  }

  /** Outward normal of the phone's back in world space. */
  backNormal(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).transformDirection(this.group.matrixWorld);
  }

  /** World → phone-local (for pairing beam ends without crossings). */
  toLocal(v: THREE.Vector3) {
    return this.group.worldToLocal(v.clone());
  }

  /** Screen corners in world space (TL, TR, BL, BR). */
  worldCorners(): THREE.Vector3[] {
    this.screen.updateWorldMatrix(true, false);
    return this.corners.map((c) => c.clone().applyMatrix4(this.screen.matrixWorld));
  }

  /** Axis-aligned rect of the screen in CSS pixels, for placing the flat HTML screen over it. */
  screenRect(camera: THREE.Camera, vw: number, vh: number) {
    const ps = this.worldCorners().map((c) => c.project(camera));
    const xs = ps.map((p) => (p.x * 0.5 + 0.5) * vw);
    const ys = ps.map((p) => (-p.y * 0.5 + 0.5) * vh);
    const left = Math.min(...xs), top = Math.min(...ys);
    return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
  }
}
