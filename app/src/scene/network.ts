import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { TrailStep } from '../data/types';
import { GATEWAYS, GATEWAY_Z, WWW_R, WEBSITE_R, type NetworkLayout, type LayoutNode } from './layout';

const CUBE = 0.42;
const BG = new THREE.Color('#d3d5da');
const INTRA = new THREE.Color('#ff8a3d'); // link within a group (orange, as in the sketch)
const CROSS = new THREE.Color('#ff3d6e'); // link across groups / to the platform (pink)
const RING = '#6b707c';
const PALE_FILL = new THREE.Color('#dfe0e5'); // a cube that is present but not part of what is being explored
const PALE_EDGE = new THREE.Color('#a9acb6');
const INTERNAL = new THREE.Color('#4a4e58'); // gateway → platform: inside the platform's own machinery

/** How each kind of highlight is drawn. Ownership and narrative must not look alike (framework spec). */
export const TRAIL_STYLE: Record<TrailStep['kind'], { line: THREE.Color; fill: string; edge: string }> = {
  path: { line: new THREE.Color('#f0134d'), fill: '#ffd3dd', edge: '#f0134d' },
  own: { line: new THREE.Color('#15161c'), fill: '#ffffff', edge: '#15161c' },
  thread: { line: new THREE.Color('#6a3df0'), fill: '#e5dcff', edge: '#6a3df0' },
};

// Entry gateways: slim vertical slabs, broad faces toward the platform and the network.
const SLAB = { w: 0.6, h: 1.3, d: 0.12 };
const slabGeo = new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d);
const slabEdgeGeo = new THREE.EdgesGeometry(slabGeo);
// The web: solid "Website" spheres inside an outline-only sphere.
const WWW_CENTRE = new THREE.Vector3(GATEWAYS.find((g) => g.channel === 'scrape')!.x, 0, GATEWAY_Z);
const websiteGeo = new THREE.SphereGeometry(WEBSITE_R, 32, 20);

// Shared geometry: uploaded to the GPU once, reused for every cube and ring of every network.
const boxGeo = new THREE.BoxGeometry(CUBE, CUBE, CUBE);
const edgeGeo = new THREE.EdgesGeometry(boxGeo);
const ringGeo = (() => {
  const pts: number[] = [];
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(Math.cos(a), Math.sin(a), 0); }
  const g = new LineGeometry();
  g.setPositions(pts);
  return g;
})();

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const backOut = (t: number) => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

type Cube = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edgeMat: THREE.LineBasicMaterial; label: THREE.Sprite };
type Ring = { line: Line2; mat: LineMaterial; label: THREE.Sprite };
type Slab = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; edgeMat: THREE.LineBasicMaterial; label: THREE.Sprite };

// ---------- Billboard labels ----------
// Text is drawn once per unique string into a canvas texture and shown on a Sprite, which always faces
// the camera. Sized in world units, so labels behave like the objects they name (depth-tested, perspective).
export type LabelStyle = 'entity' | 'concept' | 'platform' | 'site' | 'band';
const LABEL_FONT = "'Inter Tight', system-ui, -apple-system, sans-serif";
const LABEL_H: Record<LabelStyle, number> = { entity: 0.17, concept: 0.24, platform: 0.3, site: 0.095, band: 0.15 }; // world-unit height of the text line
const HALO = 'rgba(211,213,218,0.92)'; // scene background, so labels stay legible over lines
const labelCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

function labelTexture(text: string, style: LabelStyle) {
  const key = style + '|' + text;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const px = 64, pad = 14;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const caps = style === 'concept' || style === 'band';
  const t = caps ? text.toUpperCase() : text;
  const font = style === 'concept' || style === 'platform' ? `800 ${px}px ${LABEL_FONT}` : `600 ${px}px ${LABEL_FONT}`;
  const spacing = caps ? 6 : 0;
  ctx.font = font;
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${spacing}px`;
  const w = Math.ceil(ctx.measureText(t).width) + pad * 2;
  const h = Math.ceil(px * 1.3) + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx.font = font; // resizing resets context state
  if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${spacing}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = HALO;
  ctx.strokeText(t, w / 2, h / 2);
  ctx.fillStyle = style === 'concept' ? '#565b67' : style === 'band' ? '#7b808c' : '#1a1b20';
  ctx.fillText(t, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.premultiplyAlpha = true; // no dark fringes where the transparent canvas edge gets filtered
  const out = { tex, aspect: w / h };
  labelCache.set(key, out);
  return out;
}

/**
 * Fade a label. Label textures are premultiplied, so the colour has to fade with the opacity
 * (otherwise a nearly transparent label still adds its light halo to the picture).
 */
export function fadeLabel(sprite: THREE.Sprite, opacity: number) {
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.opacity = opacity;
  mat.color.setScalar(opacity);
  if (opacity < 0.02) sprite.visible = false;
}

/** Every label sprite, so all of them can be redrawn once the web font loads. */
const allLabels = new Set<THREE.Sprite>();

export function makeLabel() {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true, toneMapped: false, premultipliedAlpha: true }));
  sprite.center.set(0.5, 0); // anchored at bottom-centre: sits on top of what it names
  sprite.renderOrder = 2; // depth-tested: hidden by anything closer, like every other shape
  allLabels.add(sprite);
  return sprite;
}

export function setLabel(sprite: THREE.Sprite, text: string, style: LabelStyle) {
  const { tex, aspect } = labelTexture(text, style);
  const mat = sprite.material as THREE.SpriteMaterial;
  if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
  // Canvas includes padding; scale so the text line itself is LABEL_H tall.
  const h = LABEL_H[style] * 1.45;
  sprite.scale.set(h * aspect, h, 1);
  sprite.userData.w = h * aspect;
  sprite.userData.h = h;
  sprite.userData.text = text;
  sprite.userData.style = style;
}

/** A node's place in the current highlight. */
type Lit = { kind: TrailStep['kind']; k: number; current: boolean };
/** A lit link segment, drawn from `a` toward `b` up to `t`. */
type HotSeg = { a: LayoutNode; b: LayoutNode; t: number; kind: TrailStep['kind']; app?: string };

/**
 * Renders the atlas behind the platform: the entry gateways, actor cubes, group spheres drawn as their
 * exact silhouette ring (outline only), and links. It is built once and no sphere or actor is ever added,
 * removed or moved. One platform stands in front of it at a time (drawn by PlatformView); the links that
 * run into the platform are those of the app being viewed. What is being explored only changes how things are lit:
 *  - a context (the app that is open) keeps its own part of the atlas at full strength and lets the rest recede;
 *  - a trail (a case, a narrative, an owner's holdings) is drawn in its own colour on top.
 * The first reveal runs hop by hop from the platform, driven by the explore progress p.
 */
export class NetworkView {
  readonly root = new THREE.Group();
  /** Extra size for names on the trail, for small screens where the whole picture is drawn smaller. */
  labelBoost = 1;
  private cubes: Cube[] = [];
  private rings: Ring[] = [];
  private slab: Slab;
  private www!: { sites: { node: LayoutNode | null; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: THREE.Sprite }[]; ring: Ring };
  private linkLine: LineSegments2;
  private linkGeo = new LineSegmentsGeometry();
  private linkMat: LineMaterial;
  private hotLine: LineSegments2;
  private hotGeo = new LineSegmentsGeometry();
  private hotMat: LineMaterial;
  private pulse: THREE.Mesh;
  private ruler = new THREE.Group();
  private layout: NetworkLayout | null = null;
  /** What the link buffer draws, ordered so `a` is the end nearer the platform (lines grow from it). `app` marks a link into the platform. */
  private segs: { a: LayoutNode; b: LayoutNode; app?: string }[] = [];
  private baseColours: THREE.Color[] = [];
  private lineMats: LineMaterial[] = [];

  // Highlight state.
  private trail: TrailStep[] | null = null;
  private upto = 0;
  private lit = new Map<LayoutNode, Lit>();
  private hot: HotSeg[] = [];
  private hotLinks = new Set<number>();
  private dim = 0; // eased 0 → 1 while a trail is shown
  private pulseAt: { a: THREE.Vector3; b: THREE.Vector3; t: number; kind: TrailStep['kind'] } | null = null;
  // Context: what belongs to the open app. Everything else recedes; each node and link eases on its own.
  private ctxNodes: Set<LayoutNode> | null = null;
  private ctxLinks = new Set<number>();
  private away = new Map<LayoutNode, number>(); // 0 = in context, 1 = receded
  private linkAway = new Float32Array(0);
  // The platform being viewed, and how far it has opened. Links into the platform follow it.
  private open: { id: string | null; k: number } = { id: null, k: 0 };
  private painted = { id: null as string | null, k: -1 };

  constructor() {
    this.linkMat = new LineMaterial({ vertexColors: true, linewidth: 1.4, transparent: true, opacity: 0.6 });
    this.lineMats.push(this.linkMat);
    this.linkLine = new LineSegments2(this.linkGeo, this.linkMat);
    this.linkLine.frustumCulled = false;
    this.root.add(this.linkLine);

    // Highlighted links are redrawn on top, thicker, in the trail's colour.
    this.hotMat = new LineMaterial({ vertexColors: true, linewidth: 4.2, transparent: true, opacity: 1 });
    this.lineMats.push(this.hotMat);
    this.hotLine = new LineSegments2(this.hotGeo, this.hotMat);
    this.hotLine.frustumCulled = false;
    this.hotLine.renderOrder = 1;
    this.hotLine.visible = false;
    this.root.add(this.hotLine);

    this.pulse = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: '#f0134d', toneMapped: false }));
    this.pulse.visible = false;
    this.root.add(this.pulse);

    {
      const sites = [0, 1, 2].map(() => {
        const mat = new THREE.MeshStandardMaterial({ color: '#6c707a', roughness: 0.55, transparent: true });
        const mesh = new THREE.Mesh(websiteGeo, mat);
        const label = makeLabel();
        setLabel(label, 'Website', 'site');
        this.root.add(mesh, label);
        return { node: null as LayoutNode | null, mesh, mat, label };
      });
      const mat = new LineMaterial({ color: RING, linewidth: 1.4, transparent: true });
      this.lineMats.push(mat);
      const line = new Line2(ringGeo, mat);
      line.frustumCulled = false;
      const label = makeLabel();
      setLabel(label, GATEWAYS.find((g) => g.channel === 'scrape')!.label, 'concept');
      this.root.add(line, label);
      this.www = { sites, ring: { line, mat, label } };
    }

    {
      const mat = new THREE.MeshStandardMaterial({ color: '#e4e4e8', roughness: 0.7, transparent: true });
      const edgeMat = new THREE.LineBasicMaterial({ color: '#1a1b20', transparent: true });
      const mesh = new THREE.Mesh(slabGeo, mat);
      mesh.add(new THREE.LineSegments(slabEdgeGeo, edgeMat));
      const label = makeLabel();
      setLabel(label, GATEWAYS.find((g) => g.channel === 'publish')!.label, 'entity');
      this.root.add(mesh, label);
      this.slab = { mesh, mat, edgeMat, label };
    }
  }

  /**
   * A depth ruler along the floor: the pipeline's layers from the phone back to structure,
   * so depth reads as "how far upstream". Labels only; the actors themselves are placed by the layout.
   */
  private buildRuler(L: NetworkLayout, phoneZ: number) {
    // Under the pipeline's axis and below everything, so each mark sits under its band.
    const x = 0, y = L.floor - 0.45;
    this.ruler.userData.ends = [new THREE.Vector3(x, y, phoneZ), new THREE.Vector3(x, y, L.depth.L1)];
    const marks: [number, string][] = [
      [phoneZ, 'L6 · Your screen'],
      [0, 'L4 · Platform'],
      [GATEWAY_Z, 'L3 · Entry'],
      [L.depth.L5, 'L5 · Crowd'],
      [L.depth.L2, 'L2 · Production'],
      [L.depth.L1, 'L1 · Structure'],
    ];
    const pts: number[] = [x, y, phoneZ, x, y, L.depth.L1];
    for (const [z] of marks) pts.push(x - 0.12, y, z, x + 0.12, y, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#8d919c', transparent: true, opacity: 0.8 });
    this.ruler.add(new THREE.LineSegments(geo, mat));
    for (const [z, text] of marks) {
      const label = makeLabel();
      setLabel(label, text, 'band');
      label.position.set(x, y + 0.06, z);
      this.ruler.add(label);
    }
    this.ruler.userData.mat = mat;
    this.root.add(this.ruler);
  }

  private makeCube(geo: THREE.BufferGeometry, edges: THREE.BufferGeometry): Cube {
    const mat = new THREE.MeshStandardMaterial({ color: '#f4f4f6', roughness: 0.75, transparent: true });
    const edgeMat = new THREE.LineBasicMaterial({ color: '#1a1b20', transparent: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.add(new THREE.LineSegments(edges, edgeMat));
    const label = makeLabel();
    this.root.add(mesh, label);
    return { mesh, mat, edgeMat, label };
  }

  private makeRing(): Ring {
    const mat = new LineMaterial({ color: RING, linewidth: 1.4, transparent: true });
    mat.resolution.copy(this.linkMat.resolution);
    this.lineMats.push(mat);
    const line = new Line2(ringGeo, mat);
    line.frustumCulled = false;
    const label = makeLabel();
    this.root.add(line, label);
    return { line, mat, label };
  }

  /** Redraw label textures (e.g. once the web font has loaded, so labels use it). */
  refreshLabels() {
    labelCache.forEach((v) => v.tex.dispose());
    labelCache.clear();
    for (const s of allLabels) if (s.userData.text) setLabel(s, s.userData.text, s.userData.style);
  }

  setResolution(w: number, h: number) {
    this.lineMats.forEach((m) => m.resolution.set(w, h));
  }

  /** Build the atlas. Called once: every object made here stays for good. `phoneZ` is where the phone stands, for the ruler. */
  build(layout: NetworkLayout, phoneZ: number) {
    this.layout = layout;
    let site = 0;
    for (const g of layout.gateways) {
      if (g.gateway === 'scrape') { const w = this.www.sites[site++]; w.node = g; w.mesh.position.set(g.x, g.y, g.z); continue; }
      this.slab.mesh.position.set(g.x, g.y, g.z);
      this.slab.mesh.userData.node = g;
    }
    const place = (c: Cube, n: LayoutNode, style: LabelStyle) => {
      c.mesh.position.set(n.x, n.y, n.z);
      c.mesh.name = n.id;
      c.mesh.userData.node = n;
      setLabel(c.label, n.node!.name, style);
      return c;
    };
    this.cubes = layout.nodes.filter((n) => n.node).map((n) => place(this.makeCube(boxGeo, edgeGeo), n, 'entity'));
    this.rings = layout.spheres.map((sp) => {
      const r = this.makeRing();
      setLabel(r.label, sp.name, 'concept');
      // A sphere's name is never hidden behind what stands in front of it.
      (r.label.material as THREE.SpriteMaterial).depthTest = false;
      r.label.renderOrder = 3;
      return r;
    });
    this.buildRuler(layout, phoneZ);

    // Every link is drawn square-to-square (or square-to-gateway, gateway-to-platform).
    const n = layout.links.length;
    for (const geo of [this.linkGeo, this.hotGeo]) {
      geo.setPositions(new Float32Array(n * 6));
      geo.setColors(new Float32Array(n * 6));
    }
    this.segs = [];
    this.baseColours = [];
    for (const l of layout.links) {
      const [a, b] = l.source.hop <= l.target.hop ? [l.source, l.target] : [l.target, l.source];
      this.segs.push({ a, b, app: l.app });
      this.baseColours.push(l.kind === 'internal' ? INTERNAL : l.intra ? INTRA : CROSS);
    }
    this.linkGeo.instanceCount = n;
    this.linkAway = new Float32Array(n);
    this.paintLinks();
  }

  /** How strongly a link into the platform is drawn: fully for the app being viewed, not at all for any other. */
  private linkOn(app?: string) {
    return !app ? 1 : app === this.open.id ? smooth(clamp01(this.open.k)) : 0;
  }

  /** Link colours: their own colour normally; faded toward the background when outside the context or the trail. */
  private paintLinks() {
    if (!this.layout) return;
    const col = (this.linkGeo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
    const carr = col.array as Float32Array;
    const c = new THREE.Color();
    this.baseColours.forEach((base, i) => {
      const ctx = 0.72 * this.linkAway[i];
      const trail = this.hotLinks.has(i) ? 0.2 : 0.86;
      c.copy(base).lerp(BG, ctx + (trail - ctx) * this.dim).lerp(BG, 1 - this.linkOn(this.segs[i].app));
      carr.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    });
    col.needsUpdate = true;
  }

  // ---------- Context ----------

  /**
   * Say which part of the atlas belongs to what is open (node ids and graph link keys), or null for none.
   * Nothing is hidden: what is outside the context only recedes.
   */
  setContext(ctx: { nodes: Set<string>; links: Set<string> } | null) {
    const L = this.layout;
    if (!L) return;
    this.ctxLinks.clear();
    if (!ctx) { this.ctxNodes = null; return; }
    this.ctxNodes = new Set([...ctx.nodes].map((id) => L.byId.get(id)).filter((n): n is LayoutNode => !!n));
    for (const key of ctx.links) for (const i of L.segments.get(key) ?? []) {
      this.ctxLinks.add(i);
      // The gateway a context link passes through belongs to the context too.
      for (const n of [L.links[i].source, L.links[i].target]) if (n.gateway) this.ctxNodes.add(n);
    }
  }

  /** The platform being viewed, and how far it has opened (0 → closed, 1 → open). */
  setOpen(id: string | null, k: number) {
    this.open = { id, k };
  }

  // ---------- Highlights ----------

  /**
   * Lay a trail over the network, or clear it with null. `upto` is how far along it is shown:
   * whole steps before it are fully lit, the step it falls in is drawn part-way (for playback).
   */
  setTrail(trail: TrailStep[] | null, upto?: number) {
    this.trail = trail && trail.length ? trail : null;
    this.upto = this.trail ? upto ?? this.trail.length : 0;
    this.resolveTrail();
  }

  setProgress(upto: number) {
    if (!this.trail) return;
    this.upto = Math.max(0, Math.min(this.trail.length, upto));
    this.resolveTrail();
  }

  get trailShown() { return !!this.trail; }

  private resolveTrail() {
    this.lit.clear();
    this.hot = [];
    this.hotLinks.clear();
    this.pulseAt = null;
    const L = this.layout;
    if (!L || !this.trail) { this.paintLinks(); return; }

    const whole = Math.floor(this.upto);
    const frac = this.upto - whole;
    this.trail.forEach((step, i) => {
      const k = i < whole ? 1 : i === whole ? frac : 0;
      if (k <= 0) return;
      const current = i === Math.min(whole, this.trail!.length - 1) && this.upto < this.trail!.length;
      // The acting node lights up as the step starts, the receiving one as the line arrives.
      step.nodes.forEach((id, ni) => {
        const n = L.byId.get(id);
        if (!n) return;
        const nk = ni === 0 ? Math.min(1, k * 4) : seg(k, 0.7, 1);
        const prev = this.lit.get(n);
        if (!prev || nk >= prev.k) this.lit.set(n, { kind: step.kind, k: Math.max(nk, prev?.k ?? 0), current: current || !!prev?.current });
      });
      for (const link of step.links) {
        const idx = L.segments.get(link.key);
        if (!idx) continue;
        // Segments are stored from one end to the other (actor → platform); walk them the other way
        // when the step starts at the far end.
        const outward = L.links[idx[idx.length - 1]].target.id === link.from;
        const order = outward ? [...idx].reverse() : idx;
        order.forEach((li, si) => {
          const l = L.links[li];
          if (!l) return;
          const [a, b] = outward ? [l.target, l.source] : [l.source, l.target];
          const t = clamp01(k * order.length - si);
          this.hotLinks.add(li);
          if (t <= 0) return;
          this.hot.push({ a, b, t, kind: step.kind, app: l.app });
          if (current && t < 1 && this.linkOn(l.app) > 0) {
            this.pulseAt = { a: new THREE.Vector3(a.x, a.y, a.z), b: new THREE.Vector3(b.x, b.y, b.z), t, kind: step.kind };
          }
        });
      }
    });
    this.paintLinks();
  }

  /** Cube meshes that can be clicked, each carrying its node in userData. */
  pickables(): THREE.Object3D[] {
    return this.cubes.filter((c) => c.mesh.visible).map((c) => c.mesh);
  }

  /** Everything the atlas occupies, as world points: for framing the whole of it. */
  extent(): THREE.Vector3[] {
    const L = this.layout;
    if (!L) return [];
    const pts = L.nodes.map((n) => new THREE.Vector3(n.x, n.y, n.z));
    // Each sphere's bounds, with headroom for the name that sits on top of it.
    for (const s of L.spheres) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1.45, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
      pts.push(new THREE.Vector3(s.x + dx * s.r, s.y + dy * s.r, s.z + dz * s.r));
    pts.push(...(this.ruler.userData.ends as THREE.Vector3[]).map((p) => p.clone()));
    return pts.map((p) => this.root.localToWorld(p));
  }

  /** World position of a node (or the platform), for framing the camera. */
  worldPositionOf(id: string): THREE.Vector3 | null {
    const n = this.layout?.byId.get(id);
    return n ? this.root.localToWorld(new THREE.Vector3(n.x, n.y, n.z)) : null;
  }

  /** Make everything visible for one warm-up render (shader compile + buffer upload). */
  showAllForWarmup() {
    this.cubes.forEach((c) => { c.mesh.visible = c.label.visible = true; c.mat.opacity = c.edgeMat.opacity = 1; });
    this.rings.forEach((r) => (r.line.visible = r.label.visible = true));
    this.slab.mesh.visible = this.slab.label.visible = true;
    this.www.sites.forEach((w) => (w.mesh.visible = w.label.visible = true));
    this.www.ring.line.visible = this.www.ring.label.visible = true;
    this.linkLine.visible = this.hotLine.visible = this.pulse.visible = true;
  }

  // Reveal window for a node: hop 1 starts right after the beams reach the phone; outer hops follow.
  private window(hop: number) {
    const max = Math.max(1, (this.layout?.maxHop ?? 1) - 1);
    const start = hop === 0 ? 0.8 : 0.84 + 0.1 * ((hop - 1) / max);
    return { start, end: Math.min(1, start + 0.08) };
  }
  private nodeK(n: LayoutNode, p: number) {
    const w = this.window(n.hop);
    return smooth(seg(p, w.start, w.end));
  }

  /**
   * Outline a sphere: its exact silhouette from the camera is a circle on the tangency plane, offset
   * toward the camera by r²/d, with radius r·√(d²−r²)/d. Drawn as a constant-width ring, label on top.
   */
  private placeRing(ring: Ring, centreLocal: THREE.Vector3, radius: number, k: number, camPos: THREE.Vector3, camUp: THREE.Vector3, fade = 1) {
    const centre = this.root.localToWorld(centreLocal.clone());
    const toCam = camPos.clone().sub(centre);
    const d = toCam.length();
    ring.line.visible = ring.label.visible = k > 0.001 && d > radius * 1.02;
    if (!ring.line.visible) return;
    toCam.divideScalar(d);
    const r = radius * (0.85 + 0.15 * smooth(k));
    const ringR = (r * Math.sqrt(d * d - r * r)) / d;
    const tangent = centre.clone().addScaledVector(toCam, (r * r) / d);
    ring.line.position.copy(this.root.worldToLocal(tangent.clone()));
    ring.line.scale.setScalar(ringR);
    ring.line.lookAt(camPos);
    ring.mat.opacity = 0.85 * k * fade;
    ring.label.position.copy(this.root.worldToLocal(tangent.clone().addScaledVector(camUp, ringR + 0.05)));
    fadeLabel(ring.label, k * fade);
  }

  update(p: number, camera: THREE.Camera, dt = 0.016, time = 0) {
    const L = this.layout;
    if (!L) return;

    // Ease the "everything else recedes" amounts, and repaint link colours while they move.
    let repaint = false;
    const ease = (from: number, to: number, rate: number) => (to > from ? Math.min(to, from + dt * rate) : Math.max(to, from - dt * rate));
    const want = this.trail ? 1 : 0;
    if (this.dim !== want) { this.dim = ease(this.dim, want, 3.5); repaint = true; }
    for (const n of L.nodes) {
      const to = this.ctxNodes && !this.ctxNodes.has(n) ? 1 : 0;
      const at = this.away.get(n) ?? 0;
      if (at !== to) this.away.set(n, ease(at, to, 3));
    }
    for (let i = 0; i < this.linkAway.length; i++) {
      const to = this.ctxNodes && !this.ctxLinks.has(i) ? 1 : 0;
      if (this.linkAway[i] !== to) { this.linkAway[i] = ease(this.linkAway[i], to, 3); repaint = true; }
    }
    if (this.painted.id !== this.open.id || this.painted.k !== this.open.k) { this.painted = { ...this.open }; repaint = true; }
    if (repaint) this.paintLinks();
    const dim = this.dim;
    /** Strength of something the trail does not touch: its context strength, falling to a ghost under a trail. */
    const rest = (n: LayoutNode | null | undefined, floor = 0.2) => {
      const ctx = 1 - 0.6 * (n ? this.away.get(n) ?? 0 : 0);
      return ctx + (Math.min(ctx, floor) - ctx) * dim;
    };

    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const tmp = new THREE.Vector3();
    const worldUp = this.root.worldToLocal(this.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1, 0)));
    const upright = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();

    // Cubes pop in (scale with a slight overshoot) as their hop is reached. After that they are always there:
    // lit in the trail's colour, at full strength in the open app's context, or receded.
    for (const c of this.cubes) {
      const n = c.mesh.userData.node as LayoutNode;
      const k = this.nodeK(n, p);
      c.mesh.visible = c.label.visible = k > 0.001;
      if (!c.mesh.visible) continue;
      const lit = this.lit.get(n);
      const on = lit ? lit.k : 0;
      const hollow = !!n.node?.hollow;
      const away = this.away.get(n) ?? 0;
      const beat = lit?.current ? 1 + 0.07 * Math.sin(time * 5) : 1;
      const grow = (0.35 + 0.65 * backOut(k)) * (1 + 0.16 * on) * beat;
      // Label sits just above the cube (world up, also when the atlas is tilted).
      c.label.position.copy(c.mesh.position).addScaledVector(worldUp, (CUBE / 2) * grow * 1.25 + 0.06);
      const shown = on > 0 ? 1 : rest(n);
      const dist = camPos.distanceTo(c.mesh.getWorldPosition(tmp));
      // Names: always readable on the trail; kept legible from afar inside the context; outside it they are
      // shown only from close by, so the whole atlas does not turn into a wall of text.
      const near = 1 - smooth(seg(dist, 13, 21)) * away;
      fadeLabel(c.label, k * (on > 0 ? 1 : (1 - dim) * near * (1 - 0.55 * away)));
      const far = on > 0 ? THREE.MathUtils.clamp((dist / 13) * this.labelBoost, 1, (lit?.current ? 2.6 : 2) * this.labelBoost)
        : THREE.MathUtils.clamp(dist / 17, 1, 1 + 0.9 * (1 - away));
      c.label.scale.set(c.label.userData.w * far, c.label.userData.h * far, 1);
      c.label.renderOrder = on > 0 ? 4 : 2;
      (c.label.material as THREE.SpriteMaterial).depthTest = !(on > 0);
      c.mesh.scale.setScalar(grow);
      c.mesh.quaternion.copy(upright); // stay upright if the atlas is turned
      // What is not lit stays solid and turns pale, so it is plainly still there and never reads as hollow.
      const style = lit ? TRAIL_STYLE[lit.kind] : null;
      const pale = on > 0 ? 0 : 1 - clamp01((shown - 0.2) / 0.8);
      c.mat.color.set(style && on > 0 ? style.fill : '#f4f4f6').lerp(PALE_FILL, pale);
      c.edgeMat.color.set(style && on > 0 ? style.edge : '#1a1b20').lerp(PALE_EDGE, pale);
      // Fronts and fake accounts are hollow: an outline with almost nothing inside.
      const body = hollow ? 0.14 + 0.2 * on : 1;
      c.mat.opacity = k * body;
      c.edgeMat.opacity = k;
      c.mat.depthWrite = !hollow && k > 0.95;
    }

    // Gateways rise into place behind the platform, just before the actors that feed them.
    {
      const sl = this.slab;
      const n = sl.mesh.userData.node as LayoutNode | undefined;
      const k = n ? this.nodeK(n, p) : 0;
      sl.mesh.visible = sl.label.visible = k > 0.001;
      if (sl.mesh.visible) {
        const r = rest(n, 0.45);
        sl.mesh.scale.set(1, 0.2 + 0.8 * backOut(k), 1);
        sl.mesh.quaternion.copy(upright);
        sl.mat.opacity = sl.edgeMat.opacity = k * r;
        sl.mat.depthWrite = sl.mat.opacity > 0.95;
        sl.label.position.copy(sl.mesh.position).addScaledVector(worldUp, (SLAB.h / 2) * (0.2 + 0.8 * backOut(k)) + 0.06);
        fadeLabel(sl.label, k * r);
      }
    }

    // The web: three small solid Website spheres inside an outline sphere (same silhouette ring as groups).
    {
      let kAll = 0, rAll = 0;
      for (const w of this.www.sites) {
        const k = w.node ? this.nodeK(w.node, p) : 0;
        const r = rest(w.node, 0.45);
        kAll = Math.max(kAll, k);
        rAll = Math.max(rAll, r);
        w.mesh.visible = w.label.visible = k > 0.001;
        if (!w.mesh.visible) continue;
        const sc = 0.3 + 0.7 * backOut(k);
        w.mesh.scale.setScalar(sc);
        w.mat.opacity = k * r;
        w.mat.depthWrite = w.mat.opacity > 0.95;
        w.label.position.copy(w.mesh.position).addScaledVector(worldUp, WEBSITE_R * sc + 0.02);
        fadeLabel(w.label, k * r * (1 - smooth(seg(camPos.distanceTo(w.mesh.getWorldPosition(tmp)), 12, 20))));
      }
      this.placeRing(this.www.ring, WWW_CENTRE, WWW_R, kAll, camPos, camUp, rAll);
    }

    // Group spheres. A sphere keeps its strength while any of its members is lit or in the context.
    this.rings.forEach((r, i) => {
      const s = L.spheres[i];
      const k = Math.max(0, ...s.members.map((m) => this.nodeK(m, p)));
      const touched = s.members.some((m) => this.lit.has(m));
      const strength = touched ? 1 : Math.max(0.3, ...s.members.map((m) => rest(m, 0.3)));
      this.placeRing(r, new THREE.Vector3(s.x, s.y, s.z), s.r, k, camPos, camUp, strength);
      if (!r.label.visible) return;
      // Sphere names stay legible from across the atlas.
      const far = THREE.MathUtils.clamp(camPos.distanceTo(r.label.getWorldPosition(tmp)) / 17, 1, 2.3);
      r.label.scale.set(r.label.userData.w * far, r.label.userData.h * far, 1);
    });

    // Depth ruler.
    {
      const k = smooth(seg(p, 0.86, 1));
      this.ruler.visible = k > 0.001;
      (this.ruler.userData.mat as THREE.LineBasicMaterial).opacity = 0.8 * k;
      this.ruler.children.forEach((c) => {
        const sp = c as THREE.Sprite;
        if (!sp.isSprite) return;
        sp.visible = true;
        fadeLabel(sp, k);
        const far = THREE.MathUtils.clamp(camPos.distanceTo(sp.getWorldPosition(tmp)) / 16, 1, 2.6);
        sp.scale.set(sp.userData.w * far, sp.userData.h * far, 1);
      });
    }

    // Links draw from the node nearer the platform toward the other one. A link into the platform is drawn
    // only while its app is the one being viewed.
    const buf = (this.linkGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    const arr = buf.array as Float32Array;
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    // Lines touching a Website sphere stop at its surface (the slab hides its own line ends).
    const toSurface = (p0: THREE.Vector3, toward: THREE.Vector3) => p0.addScaledVector(toward.clone().sub(p0).normalize(), WEBSITE_R);
    const ends = (a: LayoutNode, b: LayoutNode) => {
      A.set(a.x, a.y, a.z); B.set(b.x, b.y, b.z);
      if (a.gateway === 'scrape') toSurface(A, B);
      if (b.gateway === 'scrape') toSurface(B, A);
    };
    this.segs.forEach(({ a, b, app }, i) => {
      ends(a, b);
      const t = this.linkOn(app) < 0.02 ? 0 : smooth(seg(p, this.window(a.hop).start, this.window(b.hop).end));
      arr.set([A.x, A.y, A.z, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t], i * 6);
    });
    buf.needsUpdate = true;
    this.linkLine.visible = p > 0.8;

    // The trail's own links, on top.
    const revealed = p > 0.985;
    this.hotLine.visible = revealed && this.hot.length > 0;
    if (this.hotLine.visible) {
      const hb = (this.hotGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
      const ha = hb.array as Float32Array;
      const hc = (this.hotGeo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
      const hca = hc.array as Float32Array;
      const n = Math.min(this.hot.length, this.segs.length);
      for (let i = 0; i < n; i++) {
        const { a, b, kind, app } = this.hot[i];
        const t = this.hot[i].t * this.linkOn(app); // a trail's line into another platform is not drawn here
        ends(a, b);
        ha.set([A.x, A.y, A.z, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t], i * 6);
        const c = TRAIL_STYLE[kind].line;
        hca.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      }
      hb.needsUpdate = true;
      hc.needsUpdate = true;
      this.hotGeo.instanceCount = n;
    }

    // A dot rides the line being drawn.
    this.pulse.visible = revealed && !!this.pulseAt;
    if (this.pulse.visible && this.pulseAt) {
      this.pulse.position.lerpVectors(this.pulseAt.a, this.pulseAt.b, this.pulseAt.t);
      (this.pulse.material as THREE.MeshBasicMaterial).color.copy(TRAIL_STYLE[this.pulseAt.kind].line);
    }
  }
}
