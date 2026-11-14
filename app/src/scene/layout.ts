// @ts-expect-error – d3-force-3d ships no types
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d';
import type { Band, Channel, Graph, GraphNode } from '../data/types';

/**
 * Force layout for the network behind a platform.
 *
 * Only the squares (actors) are simulated. Spheres (actor groups) are emergent:
 *  - each sphere's centre is the centroid of its members, its radius grows with member count;
 *  - members are pulled toward that centre and kept inside the radius;
 *  - spheres that would overlap push all their members apart.
 * Depth carries meaning: each actor is drawn toward the band of its layer, so structure (owners, states)
 * sits furthest from the phone, production in the middle and the crowd nearest the platform.
 * Checks and oversight sit above the pipeline, not in it.
 *
 * Coordinates are in the platform's local frame: platform at the origin, its front (+z) faces the
 * phone, so the network extends toward -z ("behind" the platform).
 */

export interface LayoutNode {
  id: string;
  node: GraphNode | null; // null for the anchor (the platform itself) and the gateways
  group: string | null;
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
  hop: number; // graph distance from the platform (for the reveal)
  gateway?: Channel; // set on the entry gateways behind the platform
}
/** kind: 'entity' (between actors, or straight to the platform), 'entry' (actor → gateway), 'internal' (gateway → platform). */
export interface LayoutLink { source: LayoutNode; target: LayoutNode; intra: boolean; kind: 'entity' | 'entry' | 'internal'; check: boolean }
export interface LayoutSphere { id: string; name: string; color: string; x: number; y: number; z: number; r: number; members: LayoutNode[] }
export interface NetworkLayout {
  nodes: LayoutNode[];
  links: LayoutLink[];
  spheres: LayoutSphere[];
  anchor: LayoutNode;
  gateways: LayoutNode[];
  uses: { publish: boolean; scrape: boolean };
  maxHop: number;
  /** Graph link key → indices into `links`, ordered from the actor toward the platform. */
  segments: Map<string, number[]>;
  byId: Map<string, LayoutNode>;
}

// Two ways content reaches a platform, both connected to it:
//  - publish: actors post on the platform directly → the "Direct posting" slab right behind it;
//  - scrape: actors publish on the web, which the platform fetches → a "Website" sphere
//    (inside the "The web" outline), at the same level, beside the slab.
export const GATEWAYS: { channel: Channel; label: string; x: number }[] = [
  { channel: 'publish', label: 'Direct posting', x: 0 },
  { channel: 'scrape', label: 'The web', x: 1.6 },
];
/** Outer radius of the web sphere (world units). */
export const WWW_R = 0.7;
/** Websites inside the web sphere: small separate spheres (they never link to each other). */
export const WEBSITE_R = 0.15;
export const WEBSITE_OFFSETS: [number, number, number][] = [0, 1, 2].map((i) => {
  const a = Math.PI / 2 + (i * Math.PI * 2) / 3; // triangle, one on top
  return [Math.cos(a) * 0.34, Math.sin(a) * 0.34, (i - 1) * 0.08];
});
export const GATEWAY_Z = -2.0;

// Simulation runs in "d3 units" (pixel-like) for well-tuned default behaviour; S converts to world units.
const S = 50;
const NODE_GAP = 50;     // ≈ 1 world unit between neighbours in a sphere
const sphereRadius = (n: number) => 34 + 27 * Math.sqrt(n); // grows with members (d3 units)

/** Depth of each band behind the platform (d3 units), and how far oversight is lifted above the pipeline. */
const BAND_Z: Record<Band, number> = { L5: -290, L2: -470, L1: -660, oversight: -360 };
const OVERSIGHT_LIFT = 230;
/** The same depths in world units, for the depth ruler. */
export const BAND_DEPTH = { L5: BAND_Z.L5 / S, L2: BAND_Z.L2 / S, L1: BAND_Z.L1 / S, oversight: BAND_Z.oversight / S };

/** Small seeded PRNG so the same data always gives the same picture. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Where the network should settle, relative to the platform (platform-local frame, d3 units). */
export interface LayoutBias { x: number; y: number; kx?: number; ky?: number }

export function layoutNetwork(graph: Graph, bias: LayoutBias = { x: 0, y: 0 }): NetworkLayout {
  const rand = rng(7);
  const anchorId = graph.appId;

  const anchor: LayoutNode = { id: anchorId, node: null, group: null, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, hop: 0 };
  const members = new Map<string, LayoutNode[]>();
  const nodes: LayoutNode[] = [anchor];
  const byId = new Map<string, LayoutNode>([[anchorId, anchor]]);

  // Seed each group around a ring behind the platform, at its band's depth, members jittered around it.
  const groupIds = graph.spheres.map((s) => s.id);
  groupIds.forEach((g) => members.set(g, []));
  for (const gn of graph.nodes) {
    const gi = gn.group ? groupIds.indexOf(gn.group) : -1;
    const a = gi < 0 ? rand() * Math.PI * 2 : (gi / Math.max(1, groupIds.length)) * Math.PI * 2;
    const n: LayoutNode = {
      id: gn.id, node: gn, group: gn.group, hop: Infinity,
      x: bias.x + Math.cos(a) * 200 + (rand() - 0.5) * 60,
      y: bias.y + Math.sin(a) * 150 + (rand() - 0.5) * 60 + (gn.band === 'oversight' ? OVERSIGHT_LIFT : 0),
      z: BAND_Z[gn.band] + (rand() - 0.5) * 60,
    };
    nodes.push(n); byId.set(gn.id, n);
    if (gn.group) members.get(gn.group)!.push(n);
  }

  // Entry gateways: fixed nodes. Posted and scraped content never links to the platform directly; it enters
  // through the slab or through one of several websites inside the web sphere.
  const gateways: LayoutNode[] = [];
  for (const g of GATEWAYS) {
    if (!graph.uses[g.channel]) continue;
    const spots = g.channel === 'scrape' ? WEBSITE_OFFSETS : [[0, 0, 0] as [number, number, number]];
    spots.forEach(([ox, oy, oz], i) => {
      const x = (g.x + ox) * S, y = oy * S, z = (GATEWAY_Z + oz) * S;
      const n: LayoutNode = { id: `gateway-${g.channel}-${i}`, node: null, group: null, gateway: g.channel, hop: Infinity, x, y, z, fx: x, fy: y, fz: z };
      nodes.push(n); byId.set(n.id, n); gateways.push(n);
    });
  }
  const websites = gateways.filter((g) => g.gateway === 'scrape');
  const slab = gateways.find((g) => g.gateway === 'publish');

  const links: LayoutLink[] = [];
  const segments = new Map<string, number[]>();
  const push = (l: LayoutLink) => links.push(l) - 1;
  const internalIdx = new Map<LayoutNode, number>();
  const internal = (g: LayoutNode) => {
    if (!internalIdx.has(g)) internalIdx.set(g, push({ source: g, target: anchor, intra: false, kind: 'internal', check: false }));
    return internalIdx.get(g)!;
  };
  if (slab) internal(slab);
  websites.forEach(internal);

  let site = 0;
  for (const l of graph.links) {
    const s = byId.get(l.source);
    if (!s) continue;
    if (l.target === anchorId) {
      const gate = l.via === 'publish' ? slab : l.via === 'scrape' ? websites[site++ % Math.max(1, websites.length)] : undefined;
      if (gate) segments.set(l.key, [push({ source: s, target: gate, intra: false, kind: 'entry', check: l.checkOnly }), internal(gate)]);
      else segments.set(l.key, [push({ source: s, target: anchor, intra: false, kind: 'entity', check: l.checkOnly })]);
      continue;
    }
    const t = byId.get(l.target);
    if (!t) continue;
    segments.set(l.key, [push({ source: s, target: t, intra: !!s.group && s.group === t.group, kind: 'entity', check: l.checkOnly })]);
  }

  // Hops from the platform (BFS, undirected) for the staged reveal.
  const adj = new Map<LayoutNode, LayoutNode[]>();
  for (const l of links) {
    adj.set(l.source, [...(adj.get(l.source) ?? []), l.target]);
    adj.set(l.target, [...(adj.get(l.target) ?? []), l.source]);
  }
  const queue = [anchor];
  while (queue.length) {
    const n = queue.shift()!;
    for (const m of adj.get(n) ?? []) if (m.hop === Infinity) { m.hop = n.hop + 1; queue.push(m); }
  }
  const reached = nodes.filter((n) => n.hop !== Infinity).map((n) => n.hop);
  const maxReached = Math.max(1, ...reached);
  nodes.forEach((n) => { if (n.hop === Infinity) n.hop = maxReached + 1; });

  // ---- Custom forces ----
  const centroid = (ms: LayoutNode[]) => {
    const c = { x: 0, y: 0, z: 0 };
    ms.forEach((m) => { c.x += m.x; c.y += m.y; c.z += m.z; });
    return { x: c.x / ms.length, y: c.y / ms.length, z: c.z / ms.length };
  };
  const groups = () => [...members.values()].filter((ms) => ms.length).map((ms) => ({ ms, c: centroid(ms), r: sphereRadius(ms.length) }));

  // Members drawn toward their sphere's centre.
  function cohesion(alpha: number) {
    for (const g of groups()) for (const m of g.ms) {
      m.vx! += (g.c.x - m.x) * 0.12 * alpha;
      m.vy! += (g.c.y - m.y) * 0.12 * alpha;
      m.vz! += (g.c.z - m.z) * 0.12 * alpha;
    }
  }

  // Spheres never overlap: push whole member groups apart. Ungrouped actors are kept out of spheres too.
  function separation(alpha: number) {
    const gs = groups();
    for (let i = 0; i < gs.length; i++)
      for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j];
        let dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, dz = b.c.z - a.c.z;
        const d = Math.hypot(dx, dy, dz) || 1e-3;
        const min = a.r + b.r + 55;
        if (d >= min) continue;
        const push = ((min - d) / d) * 0.5 * Math.min(1, alpha * 4);
        dx *= push; dy *= push; dz *= push;
        a.ms.forEach((m) => { m.vx! -= dx / 2; m.vy! -= dy / 2; m.vz! -= dz / 2; });
        b.ms.forEach((m) => { m.vx! += dx / 2; m.vy! += dy / 2; m.vz! += dz / 2; });
      }
    for (const n of nodes) {
      if (n.group || !n.node) continue;
      for (const g of gs) {
        const dx = n.x - g.c.x, dy = n.y - g.c.y, dz = n.z - g.c.z;
        const d = Math.hypot(dx, dy, dz) || 1e-3;
        const min = g.r + 34;
        if (d < min) { const k = ((min - d) / d) * 0.6; n.vx! += dx * k; n.vy! += dy * k; n.vz! += dz * k; }
      }
    }
    // Keep spheres clear of the platform, the slab and the web sphere.
    const zones = [
      { x: 0, y: 0, z: (GATEWAY_Z * S) / 2, r: 140 },
      ...GATEWAYS.filter((g) => g.channel === 'scrape' && graph.uses.scrape).map((g) => ({ x: g.x * S, y: 0, z: GATEWAY_Z * S, r: WWW_R * S + 40 })),
    ];
    for (const g of gs) for (const zc of zones) {
      const dx = g.c.x - zc.x, dy = g.c.y - zc.y, dz = g.c.z - zc.z;
      const d = Math.hypot(dx, dy, dz) || 1e-3;
      const min = g.r + zc.r;
      if (d < min) {
        const k = ((min - d) / d) * 0.5;
        g.ms.forEach((m) => { m.vx! += dx * k; m.vy! += dy * k; m.vz! += dz * k; });
      }
    }
  }

  // Bias the network behind the platform (away from the phone), offset toward `bias`, so it fans out
  // where the explore camera reveals it, and pull each actor to the depth of its band.
  function depth(alpha: number) {
    for (const n of nodes) {
      if (!n.node) continue;
      const band = n.node.band;
      const ty = bias.y + (band === 'oversight' ? OVERSIGHT_LIFT : 0);
      n.vx! += (bias.x - n.x) * (bias.kx ?? 0.02) * alpha;
      n.vy! += (ty - n.y) * (band === 'oversight' ? 0.06 : bias.ky ?? 0.02) * alpha;
      n.vz! += (BAND_Z[band] - n.z) * 0.07 * alpha;
      if (n.z > -200) n.vz! -= (n.z + 200) * 0.2 * alpha; // stay behind the gateways
    }
  }

  const sim = forceSimulation(nodes, 3)
    .force('link', forceLink(links)
      .distance((l: LayoutLink) => (l.intra ? NODE_GAP * 1.5 : l.kind === 'entry' ? 160 : 170))
      .strength((l: LayoutLink) => (l.kind === 'internal' ? 0 : l.intra ? 0.6 : l.check ? 0.03 : 0.1)))
    .force('charge', forceManyBody().strength(-130).distanceMax(400))
    .force('cohesion', cohesion)
    .force('separation', separation)
    .force('depth', depth)
    .stop();

  for (let i = 0; i < 420; i++) {
    sim.tick();
    // Containment: members stay inside their sphere (hard constraint after each step).
    for (const ms of members.values()) {
      if (!ms.length) continue;
      const c = centroid(ms), r = sphereRadius(ms.length) - 24;
      for (const m of ms) {
        const dx = m.x - c.x, dy = m.y - c.y, dz = m.z - c.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > r) { const k = r / d; m.x = c.x + dx * k; m.y = c.y + dy * k; m.z = c.z + dz * k; }
      }
    }
  }

  // Convert to world units and derive final spheres (radius guaranteed to enclose its cubes).
  nodes.forEach((n) => { n.x /= S; n.y /= S; n.z /= S; });
  const spheres: LayoutSphere[] = graph.spheres.filter((s) => members.get(s.id)?.length).map((s) => {
    const ms = members.get(s.id)!;
    const c = centroid(ms);
    const far = Math.max(0, ...ms.map((m) => Math.hypot(m.x - c.x, m.y - c.y, m.z - c.z)));
    return { id: s.id, name: s.name, color: s.color, ...c, r: Math.max(sphereRadius(ms.length) / S, far + 0.5), members: ms };
  });

  return { nodes, links, spheres, anchor, gateways, uses: graph.uses, maxHop: Math.max(...nodes.map((n) => n.hop)), segments, byId };
}
