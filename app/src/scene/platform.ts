import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

const BEAM_SEGMENTS = 48;
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Actor, TrailStep } from '../data/types';
import type { Phone } from './phone';
import { fadeLabel, makeLabel, setLabel, TRAIL_STYLE } from './network';

// Slots around the platform cube where algorithm cubes dock (sketch: front, top, right, bottom, left).
const SLOTS: { p: THREE.Vector3Tuple; s: THREE.Vector3Tuple }[] = [
  { p: [0, 0, 0.84], s: [0.66, 0.66, 0.5] },       // centre of the front face (+z, faces the phone): feeds it
  { p: [0.15, 0.78, 0.1], s: [0.6, 0.3, 0.4] },
  { p: [0.8, -0.05, 0.05], s: [0.5, 0.7, 0.6] },
  { p: [0.05, -0.75, 0.55], s: [0.8, 0.5, 0.45] },
  { p: [-0.78, 0.25, -0.2], s: [0.4, 0.5, 0.5] },
];

function sketchCube(size: THREE.Vector3Tuple, color: string) {
  const g = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.75, transparent: true }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color: '#1a1b20', transparent: true }),
  );
  mesh.add(edges);
  return mesh;
}

function setOpacity(o: THREE.Object3D, v: number) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.Material | undefined;
    if (m) { m.opacity = v; m.depthWrite = v > 0.95; }
  });
}

/**
 * The platform behind the phone: big cube, docked algorithm cubes and projection beams to the screen.
 * There is one at a time: it is the app being viewed, and it closes and reopens when that changes.
 * Everything is driven by the plain `anim` object so GSAP can tween each part of the reveal separately.
 */
export class PlatformView {
  readonly group = new THREE.Group();   // placed by the layout
  private body = new THREE.Group();     // animated inside the group (rise from depth)
  private core: THREE.Mesh;
  private algos: { mesh: THREE.Mesh; home: THREE.Vector3 }[] = [];
  private beams: LineSegments2[] = [];
  private beamMat: LineMaterial;

  readonly anim = {
    /** 0 → closed (not shown), 1 → open */
    rise: 0,
    /** per algorithm cube, 0 → flung outward and invisible, 1 → docked */
    dock: [] as { t: number }[],
    /** per phone corner (TL, TR, BL, BR), 0 → beam not drawn, 1 → reaches the phone's back */
    beams: [0, 1, 2, 3].map(() => ({ t: 0 })),
  };

  constructor(private phone: Phone) {
    this.core = sketchCube([1.3, 1.3, 1.3], '#ececef');
    this.body.add(this.core);
    this.group.add(this.body);
    this.label.position.set(0, 1.05, 0); // above the top algorithm cube
    (this.label.material as THREE.SpriteMaterial).depthTest = false; // the platform's name is never hidden
    this.label.renderOrder = 5;
    this.body.add(this.label);
    // One mesh per slot, built once and reused for every platform: no GPU uploads mid-transition.
    this.slots = SLOTS.map((slot, i) => {
      const mesh = sketchCube(slot.s, i === 0 ? '#cfd0d6' : '#bfc0c7');
      mesh.visible = false;
      this.core.add(mesh);
      return { mesh, home: new THREE.Vector3(...slot.p) };
    });
    this.beamMat = new LineMaterial({ color: 0xe8a400, linewidth: 2, transparent: true, opacity: 0.95 });
    // Four curved beams, each a fixed buffer of segments rewritten in place every frame.
    for (let i = 0; i < 4; i++) {
      const g = new LineSegmentsGeometry();
      g.setPositions(new Float32Array(BEAM_SEGMENTS * 6));
      const line = new LineSegments2(g, this.beamMat);
      line.frustumCulled = false;
      this.beams.push(line);
    }
  }
  private slots: { mesh: THREE.Mesh; home: THREE.Vector3 }[];
  /** Platform name, floating above the cube (inside `body`, so it rises and scales with it). */
  private label = makeLabel();

  /** Beams live in world space, so they go on the scene, not the group. */
  addTo(scene: THREE.Scene) {
    scene.add(this.group, ...this.beams);
  }

  /**
   * How the current trail touches the platform: `active` while any trail is shown, `platform` when a step
   * involves the platform itself, `screen` when a step reaches the phone (the beams light up).
   */
  private glow: { active: boolean; platform: TrailStep['kind'] | null; screen: TrailStep['kind'] | null } = { active: false, platform: null, screen: null };

  setGlow(active: boolean, platform: TrailStep['kind'] | null = null, screen: TrailStep['kind'] | null = null) {
    this.glow = { active, platform, screen };
  }

  setEntity(e: Actor) {
    setLabel(this.label, e.name, 'platform');
    const prev = this.anim.dock;
    const algs = (e.app?.algorithms ?? []).slice(0, SLOTS.length);
    this.slots.forEach((s, i) => { s.mesh.visible = i < algs.length; s.mesh.name = algs[i] ?? ''; });
    this.algos = this.slots.slice(0, algs.length);
    // Keep docking progress for slots that still exist so switching apps mid-explore doesn't pop.
    this.anim.dock = this.algos.map((_, i) => prev[i] ?? { t: 0 });
  }

  /**
   * Compile every shader the platform uses before it's ever shown. Otherwise the first frame it
   * appears in stalls (100ms+ on phones) right in the middle of the explore transition.
   */
  prewarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    // Draw one frame with everything visible (slots included) to compile shaders *and* upload buffers.
    this.group.visible = true;
    this.beams.forEach((b) => (b.visible = true));
    const vis = this.slots.map((s) => s.mesh.visible);
    this.slots.forEach((s) => (s.mesh.visible = true));
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    this.slots.forEach((s, i) => (s.mesh.visible = vis[i]));
    this.group.visible = false;
    this.beams.forEach((b) => (b.visible = false));
  }

  setResolution(w: number, h: number) {
    this.beamMat.resolution.set(w, h);
  }

  get algoCount() { return this.algos.length; }

  update(t: number) {
    const { rise, dock, beams } = this.anim;
    this.group.visible = rise > 0.001;
    const beamsOn = this.group.visible && !!this.algos[0] && beams.some((b) => b.t > 0.001);
    this.beams.forEach((b) => (b.visible = beamsOn));
    if (!this.group.visible) return;

    // Open: grow in place, coming a little forward.
    this.body.position.set(0, 0, -0.35 * (1 - rise));
    this.body.scale.setScalar(0.6 + 0.4 * rise);
    this.body.rotation.y = -0.35 * (1 - rise) + Math.sin(t * 0.3) * 0.05;
    // The core turns fully opaque early, so algorithm cubes hidden inside it stay hidden until they emerge.
    const solid = Math.min(1, rise * 2.2);
    setOpacity(this.core, solid); // algos are overridden just below
    this.label.visible = true;
    fadeLabel(this.label, solid);

    // Dock: each algorithm cube starts at the centre of the platform cube (fully enclosed) and slides
    // straight out through its face into its slot. No spin, so no corner pokes through early.
    this.algos.forEach((a, i) => {
      const k = dock[i]?.t ?? 0;
      a.mesh.visible = k > 0.001;
      a.mesh.position.copy(a.home).multiplyScalar(k);
      a.mesh.rotation.set(0, 0, 0);
      setOpacity(a.mesh, solid);
    });

    // Trail: the cube takes the trail's colour when a step involves the platform; the beams light up only
    // when a step reaches the screen, and fade when a trail is shown that does not.
    const g = this.glow;
    const coreMat = this.core.material as THREE.MeshStandardMaterial;
    coreMat.color.set(g.platform ? TRAIL_STYLE[g.platform].fill : '#ececef');
    this.beamMat.color.set(g.screen ? TRAIL_STYLE[g.screen].line : g.active ? 0x9a9da8 : 0xe8a400);
    this.beamMat.opacity = g.active && !g.screen ? 0.35 : 0.95;
    this.beamMat.linewidth = g.screen ? 3.2 : 2;

    if (beamsOn) this.updateBeams();
  }

  /**
   * Beams run from the four vertices of the feeding algorithm cube's face nearest the phone to the four
   * corners of the phone's back. Each is a cubic Bézier: it leaves the cube straight out of that face and
   * arrives straight into the phone's back, giving a soft S-curve. Drawn progressively from the cube.
   */
  private updateBeams() {
    const algo = this.algos[0].mesh;
    algo.updateWorldMatrix(true, false);
    const size = SLOTS[0].s;
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const centre = new THREE.Vector3().setFromMatrixPosition(algo.matrixWorld);

    // The 4 vertices of the cube's front face (+z): the face pointing out of the platform, at the phone.
    const face: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1])
      face.push(new THREE.Vector3(sx * hx, sy * hy, hz).applyMatrix4(algo.matrixWorld));
    const faceCentre = face.reduce((acc, v) => acc.add(v), new THREE.Vector3()).multiplyScalar(0.25);
    const outN = faceCentre.clone().sub(centre).normalize();

    // Pair cube vertices with phone corners by their position in the phone's own frame → no crossings.
    const sortTLBR = (vs: THREE.Vector3[]) => {
      const loc = vs.map((v) => ({ v, l: this.phone.toLocal(v) }));
      loc.sort((a, b) => b.l.y - a.l.y);
      const top = loc.slice(0, 2).sort((a, b) => a.l.x - b.l.x);
      const bot = loc.slice(2).sort((a, b) => a.l.x - b.l.x);
      return [...top, ...bot].map((o) => o.v); // TL, TR, BL, BR
    };
    const starts = sortTLBR(face);
    const ends = this.phone.backCorners(); // already TL, TR, BL, BR
    const inN = this.phone.backNormal();     // beams arrive along -inN, i.e. into the back

    const curve = new THREE.CubicBezierCurve3();
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    this.beams.forEach((line, i) => {
      const t = this.anim.beams[i].t;
      const a = starts[i], b = ends[i];
      const len = a.distanceTo(b);
      curve.v0.copy(a);
      curve.v1.copy(a).addScaledVector(outN, len * 0.42);
      curve.v2.copy(b).addScaledVector(inN, len * 0.42);
      curve.v3.copy(b);

      const buf = (line.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
      const arr = buf.array as Float32Array;
      const drawn = t * BEAM_SEGMENTS;
      for (let s = 0; s < BEAM_SEGMENTS; s++) {
        // Segments past the tip collapse onto it; the last drawn one is partial, so growth is continuous.
        const u0 = Math.min(s, drawn) / BEAM_SEGMENTS;
        const u1 = Math.min(s + 1, drawn) / BEAM_SEGMENTS;
        curve.getPoint(u0, p);
        curve.getPoint(u1, q);
        arr.set([p.x, p.y, p.z, q.x, q.y, q.z], s * 6);
      }
      buf.needsUpdate = true;
      (line.geometry as LineSegmentsGeometry).instanceCount = Math.max(1, Math.ceil(drawn));
    });
  }
}
