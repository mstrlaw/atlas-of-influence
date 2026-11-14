// @ts-expect-error – d3-force-3d ships no types
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d';
import type { Band, Channel, Graph, GraphNode } from '../data/types';

/**
 * Layout of the whole atlas. It is computed once, from all the data, and never changes with what is
 * being explored: every platform, sphere and actor keeps its place, and a selection only lights things up.
 *
 * Depth carries meaning. Reading from the phone backwards:
 *  - the wall of platforms (one cube per app, in the same grid as the phone's home screen);
 *  - the two ways content enters a platform: direct posting, and the web;
 *  - the crowd, then production (media, think tanks, the influence industry), then structure (states, owners).
 * Checks and oversight sit above the pipeline, not in it.
 *
 * Each sphere (actor group) has a fixed centre, worked out from the bands alone: all centres lie in one
 * upright plane along the pipeline, a band is a column of spheres in it, and each band starts where the one
 * before it ends. Only the cubes are simulated: members settle inside their sphere, and actors with no
 * sphere (companies, individuals) settle at the back, drawn toward what they own or fund.
 *
 * Coordinates are in the atlas frame: the platform wall is the plane z = 0, facing the phone (+z),
 * and everything upstream extends toward -z.
 */

export interface LayoutNode {
  id: string;
  node: GraphNode | null; // null for the entry gateways
  group: string | null;
  platform: boolean;
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
  hop: number; // graph distance from the platform wall (for the reveal)
  gateway?: Channel; // set on the entry gateways behind the wall
}
/** kind: 'entity' (between actors, or straight to a platform), 'entry' (actor → gateway), 'internal' (gateway → platform). */
export interface LayoutLink { source: LayoutNode; target: LayoutNode; intra: boolean; kind: 'entity' | 'entry' | 'internal'; check: boolean }
export interface LayoutSphere { id: string; name: string; color: string; x: number; y: number; z: number; r: number; members: LayoutNode[] }
export interface NetworkLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  spheres: LayoutSphere[];
  platforms: LayoutNode[];
  gateways: LayoutNode[];
  /** Half the width and height of the platform wall (world units). */
  wall: { halfW: number; halfH: number };
  /** Depth of each band behind the wall, and the lowest point of the atlas (world units): for the depth ruler. */
  depth: { L5: number; L2: number; L1: number };
  floor: number;
  maxHop: number;
  /** Graph link key → indices into `links`, ordered from the actor toward the platform. */
  segments: Map<string, number[]>;
  byId: Map<string, LayoutNode>;
}

/** The platform wall: one slot per app, row by row, like the phone's home screen. */
export const WALL = { cols: 4, gap: 1.9 };

// Two ways content reaches a platform:
//  - publish: actors post on the platform directly → the "Direct posting" slab behind the wall;
//  - scrape: actors publish on the web, which the platform fetches → "Website" spheres inside "The web".
export const GATEWAYS: { channel: Channel; label: string; x: number }[] = [
  { channel: 'publish', label: 'Direct posting', x: -1.0 },
  { channel: 'scrape', label: 'The web', x: 1.0 },
];
/** Outer radius of the web sphere (world units). */
export const WWW_R = 0.7;
/** Websites inside the web sphere: small separate spheres (they never link to each other). */
export const WEBSITE_R = 0.15;
export const WEBSITE_OFFSETS: [number, number, number][] = [0, 1, 2].map((i) => {
  const a = Math.PI / 2 + (i * Math.PI * 2) / 3; // triangle, one on top
  return [Math.cos(a) * 0.34, Math.sin(a) * 0.34, (i - 1) * 0.08];
});
export const GATEWAY_Z = -2.3;

// The simulation runs in "d3 units" (pixel-like) for well-tuned default behaviour; S converts to world units.
const S = 50;
const NODE_GAP = 50;     // ≈ 1 world unit between neighbours in a sphere
const SPHERE_GAP = 58;   // clear space between neighbouring spheres (room for the name of the lower one)
const BAND_GAP = 44;     // clear space between one band and the next
const sphereRadius = (n: number) => 27 + 21 * Math.sqrt(n); // grows with members (d3 units)
/** The pipeline's bands, from the wall backwards. Oversight is placed afterwards, above them. */
const PIPELINE: Band[] = ['L5', 'L2', 'L1'];

/** Small seeded PRNG so the same data always gives the same picture. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function layoutNetwork(graph: Graph): NetworkLayout {
  const rand = rng(7);
  const nodes: LayoutNode[] = [];
  const byId = new Map<string, LayoutNode>();
  const add = (n: LayoutNode) => { nodes.push(n); byId.set(n.id, n); return n; };

  // ---- The platform wall: fixed slots ----
  const apps = graph.nodes.filter((n) => n.band === 'L4');
  const rows = Math.ceil(apps.length / WALL.cols);
  const gap = WALL.gap * S;
  const platforms = apps.map((gn, i) => {
    const x = ((i % WALL.cols) - (WALL.cols - 1) / 2) * gap, y = ((rows - 1) / 2 - Math.floor(i / WALL.cols)) * gap;
    return add({ id: gn.id, node: gn, group: null, platform: true, hop: 0, x, y, z: 0, fx: x, fy: y, fz: 0 });
  });
  const wall = { halfW: ((WALL.cols - 1) / 2) * WALL.gap, halfH: ((rows - 1) / 2) * WALL.gap };

  // ---- Spheres: fixed centres ----
  const count = new Map<string, number>();
  const bandOf = new Map<string, Band>();
  for (const gn of graph.nodes) if (gn.group) { count.set(gn.group, (count.get(gn.group) ?? 0) + 1); bandOf.set(gn.group, gn.band); }
  const centre = new Map<string, { x: number; y: number; z: number; r: number }>();
  const inBand = (band: Band) => graph.spheres
    .filter((s) => bandOf.get(s.id) === band)
    .map((s) => ({ id: s.id, r: sphereRadius(count.get(s.id)!) }));

  // All sphere centres lie in one upright plane through the pipeline's axis (x = 0), like a cross-section:
  // a band is a column in it, its spheres stacked one above the other in the order the framework lists them.
  // Seen from the side, every sphere has its own place in the picture; depth still reads as "how far upstream".
  const bandZ: Record<Band, number> = { L4: 0, L5: 0, L2: 0, L1: 0, oversight: 0 };
  let back = (GATEWAY_Z - WWW_R) * S; // where the entry gateways end
  for (const band of PIPELINE) {
    const gs = inBand(band);
    const rMax = Math.max(sphereRadius(1), ...gs.map((g) => g.r));
    const z = back - BAND_GAP - rMax;
    bandZ[band] = z;
    back = z - rMax;
    let y = (gs.reduce((h, g) => h + 2 * g.r, 0) + SPHERE_GAP * Math.max(0, gs.length - 1)) / 2;
    for (const g of gs) { centre.set(g.id, { x: 0, y: y - g.r, z, r: g.r }); y -= 2 * g.r + SPHERE_GAP; }
  }
  // Checks and oversight: over the near end of the pipeline, lifted until clear of everything below.
  bandZ.oversight = bandZ.L5;
  for (const g of inBand('oversight')) {
    let y = 0;
    const clear = () => [...centre.values()].every((c) => Math.hypot(c.y - y, c.z - bandZ.oversight) >= c.r + g.r + SPHERE_GAP);
    while (!clear()) y += 6;
    centre.set(g.id, { x: 0, y, z: bandZ.oversight, r: g.r });
  }

  // ---- Actors: seeded inside their sphere, or at the back for those with none ----
  const members = new Map<string, LayoutNode[]>(graph.spheres.map((s) => [s.id, []]));
  for (const gn of graph.nodes) {
    if (gn.band === 'L4') continue;
    const c = gn.group ? centre.get(gn.group)! : null;
    const n = add({
      id: gn.id, node: gn, group: gn.group, platform: false, hop: Infinity,
      x: c ? c.x + (rand() - 0.5) * c.r : (rand() - 0.5) * 520,
      y: c ? c.y + (rand() - 0.5) * c.r : (rand() - 0.5) * 200,
      z: c ? c.z + (rand() - 0.5) * c.r : bandZ[gn.band] + (rand() - 0.5) * 80,
    });
    if (gn.group) members.get(gn.group)!.push(n);
  }

  // ---- Entry gateways: fixed, between the wall and the network ----
  const gateways: LayoutNode[] = [];
  for (const g of GATEWAYS) {
    const spots = g.channel === 'scrape' ? WEBSITE_OFFSETS : [[0, 0, 0] as [number, number, number]];
    spots.forEach(([ox, oy, oz], i) => {
      const x = (g.x + ox) * S, y = oy * S, z = (GATEWAY_Z + oz) * S;
      gateways.push(add({ id: `gateway-${g.channel}-${i}`, node: null, group: null, platform: false, gateway: g.channel, hop: Infinity, x, y, z, fx: x, fy: y, fz: z }));
    });
  }
  const websites = gateways.filter((g) => g.gateway === 'scrape');
  const slab = gateways.find((g) => g.gateway === 'publish')!;

  // ---- Links ----
  // Posted and scraped content never links to a platform directly: it enters through the slab or through
  // a website. An actor's line to a gateway is drawn once, however many platforms it reaches that way.
  const links: LayoutLink[] = [];
  const segments = new Map<string, number[]>();
  const push = (l: LayoutLink) => links.push(l) - 1;
  const once = new Map<string, number>();
  const internal = (g: LayoutNode, p: LayoutNode) => {
    const k = `${g.id}>${p.id}`;
    if (!once.has(k)) once.set(k, push({ source: g, target: p, intra: false, kind: 'internal', check: false }));
    return once.get(k)!;
  };
  const entry = (s: LayoutNode, g: LayoutNode, check: boolean) => {
    const k = `${s.id}>${g.id}`;
    const i = once.get(k);
    if (i === undefined) { once.set(k, push({ source: s, target: g, intra: false, kind: 'entry', check })); return once.get(k)!; }
    if (!check) links[i].check = false;
    return i;
  };
  for (const p of platforms) {
    if (p.node!.ingest?.includes('publish')) internal(slab, p);
    if (p.node!.ingest?.includes('scrape')) websites.forEach((w) => internal(w, p));
  }
  const siteOf = new Map<LayoutNode, LayoutNode>();
  for (const l of graph.links) {
    const s = byId.get(l.source), t = byId.get(l.target);
    if (!s || !t) continue;
    if (t.platform && (l.via === 'publish' || l.via === 'scrape')) {
      if (l.via === 'scrape' && !siteOf.has(s)) siteOf.set(s, websites[siteOf.size % websites.length]);
      const gate = l.via === 'publish' ? slab : siteOf.get(s)!;
      segments.set(l.key, [entry(s, gate, l.checkOnly), internal(gate, t)]);
    } else {
      segments.set(l.key, [push({ source: s, target: t, intra: !!s.group && s.group === t.group, kind: 'entity', check: l.checkOnly })]);
    }
  }

  // Hops from the wall (BFS, undirected) for the staged reveal.
  const adj = new Map<LayoutNode, LayoutNode[]>();
  for (const l of links) {
    adj.set(l.source, [...(adj.get(l.source) ?? []), l.target]);
    adj.set(l.target, [...(adj.get(l.target) ?? []), l.source]);
  }
  const queue = [...platforms];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj.get(n) ?? []) if (m.hop === Infinity) { m.hop = n.hop + 1; queue.push(m); }
  }
  const maxReached = Math.max(1, ...nodes.filter((n) => n.hop !== Infinity).map((n) => n.hop));
  nodes.forEach((n) => { if (n.hop === Infinity) n.hop = maxReached; });

  // ---- Forces ----
  const free = nodes.filter((n) => n.node && !n.platform && !n.group);
  const zones = [...centre.values()];

  // Members drawn toward their sphere's centre.
  function cohesion(alpha: number) {
    for (const [id, ms] of members) {
      const c = centre.get(id)!;
      for (const m of ms) {
        m.vx! += (c.x - m.x) * 0.1 * alpha;
        m.vy! += (c.y - m.y) * 0.1 * alpha;
        m.vz! += (c.z - m.z) * 0.1 * alpha;
      }
    }
  }

  // Actors with no sphere: held at the depth of their band, loosely centred, and kept out of every sphere.
  function loose(alpha: number) {
    for (const n of free) {
      n.vx! += -n.x * 0.03 * alpha;
      n.vy! += -n.y * 0.02 * alpha;
      n.vz! += (bandZ[n.node!.band] - n.z) * 0.16 * alpha;
      for (const c of zones) {
        const dx = n.x - c.x, dy = n.y - c.y, dz = n.z - c.z;
        const d = Math.hypot(dx, dy, dz) || 1e-3;
        const min = c.r + 30;
        if (d < min) { const k = ((min - d) / d) * 0.6; n.vx! += dx * k; n.vy! += dy * k; n.vz! += dz * k; }
      }
    }
  }

  const isFree = (n: LayoutNode) => !!n.node && !n.platform && !n.group;
  const sim = forceSimulation(nodes, 3)
    .force('link', forceLink(links)
      .distance((l: LayoutLink) => (l.intra ? NODE_GAP * 1.3 : 190))
      // Links across spheres only lean a cube toward its partners; they never pull a sphere out of place.
      .strength((l: LayoutLink) => (l.kind === 'internal' ? 0 : l.intra ? 0.5 : isFree(l.source) || isFree(l.target) ? 0.035 : 0.012)))
    .force('charge', forceManyBody().strength(-85).distanceMax(240))
    .force('cohesion', cohesion)
    .force('loose', loose)
    .stop();

  for (let i = 0; i < 420; i++) {
    sim.tick();
    // Containment: members stay inside their sphere (hard constraint after each step).
    for (const [id, ms] of members) {
      const c = centre.get(id)!, r = c.r - 22;
      for (const m of ms) {
        const dx = m.x - c.x, dy = m.y - c.y, dz = m.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > r) { const k = r / d; m.x = c.x + dx * k; m.y = c.y + dy * k; m.z = c.z + dz * k; }
      }
    }
  }

  // Convert to world units.
  nodes.forEach((n) => { n.x /= S; n.y /= S; n.z /= S; });
  const spheres: LayoutSphere[] = graph.spheres.map((s) => {
    const c = centre.get(s.id)!;
    return { id: s.id, name: s.name, color: s.color, x: c.x / S, y: c.y / S, z: c.z / S, r: c.r / S, members: members.get(s.id)! };
  });

  const depth = { L5: bandZ.L5 / S, L2: bandZ.L2 / S, L1: bandZ.L1 / S };
  const floor = Math.min(-wall.halfH - 0.4, ...spheres.map((sp) => sp.y - sp.r), ...nodes.map((n) => n.y));
  return { nodes, links, spheres, platforms, gateways, wall, depth, floor, maxHop: Math.max(...nodes.map((n) => n.hop)), segments, byId };
}
