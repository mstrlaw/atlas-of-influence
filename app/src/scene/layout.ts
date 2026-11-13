// @ts-expect-error – d3-force-3d ships no types
import { forceSimulation, forceLink, forceManyBody } from 'd3-force-3d';
import type { Atlas, Channel, Entity, Link } from '../data/types';

/**
 * Force layout for the network behind a platform.
 *
 * Only the squares (entities) are simulated. Spheres (concepts) are emergent:
 *  - each sphere's centre is the centroid of its members, its radius grows with member count;
 *  - members are pulled toward that centre and kept inside the radius;
 *  - spheres that would overlap push all their members apart.
 * So sphere placement is driven entirely by the links between squares.
 *
 * Coordinates are in the platform's local frame: platform at the origin, its front (+z) faces the
 * phone, so the network is biased toward -z ("behind" the platform).
 */

export interface LayoutNode {
  id: string;
  entity: Entity | null; // null for the anchor (the platform itself)
  concept: string | null;
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  fx?: number; fy?: number; fz?: number;
  hop: number; // graph distance from the platform (for the reveal)
  gateway?: Channel; // set on the two entry gateways behind the platform
}
/** kind: 'entity' (between entities), 'entry' (entity → gateway), 'internal' (gateway → platform). */
export interface LayoutLink { source: LayoutNode; target: LayoutNode; link: Link | null; intra: boolean; kind: 'entity' | 'entry' | 'internal' }
export interface LayoutSphere { id: string; name: string; color: string; x: number; y: number; z: number; r: number; members: LayoutNode[] }
export interface NetworkLayout { nodes: LayoutNode[]; links: LayoutLink[]; spheres: LayoutSphere[]; anchor: LayoutNode; gateways: LayoutNode[]; maxHop: number }

/** Entry gateways, in the platform's frame (world units): two slim slabs just behind the platform cube. */
// Two ways content reaches a platform, both connected to it:
//  - publish: entities post on the platform directly → the "Direct posting" slab right behind it;
//  - scrape: entities publish on their own website, which the platform fetches → the "Website" sphere
//    (inside the "WWW" outline), at the same level, beside the slab.
// Squares link to whichever they use (often both); the platform links to both.
export const GATEWAYS: { channel: Channel; label: string; x: number }[] = [
  { channel: 'publish', label: 'Direct posting', x: 0 },
  { channel: 'scrape', label: 'WWW', x: 1.6 },
];
/** Outer radius of the WWW sphere (world units). */
export const WWW_R = 0.7;
/** Websites inside the WWW sphere: small separate spheres (they never link to each other). */
export const WEBSITE_R = 0.15;
export const WEBSITE_OFFSETS: [number, number, number][] = [0, 1, 2].map((i) => {
  const a = Math.PI / 2 + (i * Math.PI * 2) / 3; // triangle, one on top
  return [Math.cos(a) * 0.34, Math.sin(a) * 0.34, (i - 1) * 0.08];
});
export const GATEWAY_Z = -2.0;

// Simulation runs in "d3 units" (pixel-like) for well-tuned default behaviour; S converts to world units.
const S = 50;
const NODE_GAP = 50;     // ≈ 1 world unit between neighbours in a sphere
const sphereRadius = (n: number) => 30 + 21 * Math.sqrt(n); // grows with members (d3 units)

/** Small seeded PRNG so the same data always gives the same picture. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Where the network should settle, relative to the platform (platform-local frame, d3 units). */
export interface LayoutBias { x: number; y: number; kx?: number; ky?: number }

export function layoutNetwork(atlas: Atlas, anchorId: string, bias: LayoutBias = { x: 0, y: 0 }): NetworkLayout {
  const rand = rng(7);
  // Other apps are platforms in their own right, not part of this platform's network.
  const include = (e: Entity) => e.id === anchorId || e.kind !== 'platform';
  const ents = atlas.entities.filter(include);

  const anchor: LayoutNode = { id: anchorId, entity: null, concept: null, x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, hop: 0 };
  const members = new Map<string, LayoutNode[]>();
  const nodes: LayoutNode[] = [anchor];
  const byId = new Map<string, LayoutNode>([[anchorId, anchor]]);

  // Seed each concept around a ring behind the platform, members jittered around it.
  const conceptIds = [...new Set(ents.filter((e) => e.id !== anchorId).map((e) => e.concepts[0]))];
  conceptIds.forEach((c, i) => members.set(c, []));
  for (const e of ents) {
    if (e.id === anchorId) continue;
    const c = e.concepts[0];
    const ci = conceptIds.indexOf(c);
    const a = (ci / conceptIds.length) * Math.PI * 2;
    const n: LayoutNode = {
      id: e.id, entity: e, concept: c, hop: Infinity,
      x: Math.cos(a) * 220 + (rand() - 0.5) * 40,
      y: Math.sin(a) * 160 + (rand() - 0.5) * 40,
      z: -260 + (rand() - 0.5) * 80,
    };
    nodes.push(n); byId.set(e.id, n); members.get(c)!.push(n);
  }

  // Entry gateways: fixed nodes. Content never links to the platform directly; it enters through one or both.
  // Scraping enters through one of several websites inside the WWW sphere.
  const gateways: LayoutNode[] = [];
  for (const g of GATEWAYS) {
    const spots = g.channel === 'scrape' ? WEBSITE_OFFSETS : [[0, 0, 0] as [number, number, number]];
    spots.forEach(([ox, oy, oz], i) => {
      const x = (g.x + ox) * S, y = oy * S, z = (GATEWAY_Z + oz) * S;
      const n: LayoutNode = { id: `gateway-${g.channel}-${i}`, entity: null, concept: null, gateway: g.channel, hop: Infinity, x, y, z, fx: x, fy: y, fz: z };
      nodes.push(n); byId.set(n.id, n); gateways.push(n);
    });
  }
  // Websites: every entity that publishes on its own site (hasWebsite, or scraped by any platform) links to
  // one, regardless of whether *this* platform scrapes — publishers publish either way. Assigned in turn.
  const websites = gateways.filter((g) => g.gateway === 'scrape');
  const slab = gateways.find((g) => g.gateway === 'publish')!;
  const scrapedSomewhere = new Set(atlas.links.filter((l) => l.channels?.includes('scrape')).flatMap((l) => [l.source, l.target]));
  const withSite = nodes.filter((n) => n.entity && (n.entity.hasWebsite || scrapedSomewhere.has(n.id)));

  // The platform is connected to the gateways it actually ingests through.
  const ingest = atlas.byId.get(anchorId)?.ingest ?? ['publish'];
  const links: LayoutLink[] = [];
  if (ingest.includes('publish')) links.push({ source: slab, target: anchor, link: null, intra: false, kind: 'internal' });
  if (ingest.includes('scrape')) websites.forEach((w) => links.push({ source: w, target: anchor, link: null, intra: false, kind: 'internal' }));

  withSite.forEach((n, i) => links.push({ source: n, target: websites[i % websites.length], link: null, intra: false, kind: 'entry' }));

  for (const l of atlas.links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue;
    const s = byId.get(l.source)!, t = byId.get(l.target)!;
    if (s === anchor || t === anchor) {
      // Posting directly goes through the slab; scraped content already arrives via the entity's website.
      const other = s === anchor ? t : s;
      if ((l.channels ?? ['publish']).includes('publish')) links.push({ source: other, target: slab, link: l, intra: false, kind: 'entry' });
    } else {
      links.push({ source: s, target: t, link: l, intra: !!s.concept && s.concept === t.concept, kind: 'entity' });
    }
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

  // Members drawn toward their sphere's centre.
  function cohesion(alpha: number) {
    for (const ms of members.values()) {
      const c = centroid(ms);
      for (const m of ms) {
        m.vx! += (c.x - m.x) * 0.12 * alpha;
        m.vy! += (c.y - m.y) * 0.12 * alpha;
        m.vz! += (c.z - m.z) * 0.12 * alpha;
      }
    }
  }

  // Spheres never overlap: push whole member groups apart.
  function separation(alpha: number) {
    const groups = [...members.values()].map((ms) => ({ ms, c: centroid(ms), r: sphereRadius(ms.length) }));
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i], b = groups[j];
        let dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, dz = b.c.z - a.c.z;
        let d = Math.hypot(dx, dy, dz) || 1e-3;
        const min = a.r + b.r + 55;
        if (d >= min) continue;
        const push = ((min - d) / d) * 0.5 * Math.min(1, alpha * 4);
        dx *= push; dy *= push; dz *= push;
        a.ms.forEach((m) => { m.vx! -= dx / 2; m.vy! -= dy / 2; m.vz! -= dz / 2; });
        b.ms.forEach((m) => { m.vx! += dx / 2; m.vy! += dy / 2; m.vz! += dz / 2; });
      }
    // Keep spheres clear of the platform, the slab and the WWW sphere.
    const zones = [
      { x: 0, y: 0, z: (GATEWAY_Z * S) / 2, r: 140 },
      ...GATEWAYS.filter((g) => g.channel === 'scrape').map((g) => ({ x: g.x * S, y: 0, z: GATEWAY_Z * S, r: WWW_R * S + 40 })),
    ];
    for (const g of groups) for (const zc of zones) {
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
  // where the explore camera reveals it.
  function depth(alpha: number) {
    for (const n of nodes) {
      if (n === anchor || n.gateway) continue;
      n.vx! += (bias.x - n.x) * (bias.kx ?? 0.02) * alpha;
      n.vy! += (bias.y - n.y) * (bias.ky ?? 0.02) * alpha;
      n.vz! += (-430 - n.z) * 0.02 * alpha;
      if (n.z > -200) n.vz! -= (n.z + 200) * 0.2 * alpha; // stay behind the gateways
    }
  }

  const sim = forceSimulation(nodes, 3)
    .force('link', forceLink(links)
      .distance((l: LayoutLink) => (l.intra ? NODE_GAP * 1.1 : l.kind === 'entry' ? 160 : 170))
      .strength((l: LayoutLink) => (l.kind === 'internal' ? 0 : l.intra ? 0.6 : 0.12)))
    .force('charge', forceManyBody().strength(-90).distanceMax(400))
    .force('cohesion', cohesion)
    .force('separation', separation)
    .force('depth', depth)
    .stop();

  for (let i = 0; i < 420; i++) {
    sim.tick();
    // Containment: members stay inside their sphere (hard constraint after each step).
    for (const ms of members.values()) {
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
  const spheres: LayoutSphere[] = [...members.entries()].map(([id, ms]) => {
    const c = centroid(ms);
    const far = Math.max(0, ...ms.map((m) => Math.hypot(m.x - c.x, m.y - c.y, m.z - c.z)));
    const concept = atlas.concepts.find((k) => k.id === id);
    return {
      id, name: concept?.name ?? id, color: concept?.color ?? '#999',
      ...c, r: Math.max(sphereRadius(ms.length) / S, far + 0.5), members: ms,
    };
  });

  return { nodes, links, spheres, anchor, gateways, maxHop: Math.max(...nodes.map((n) => n.hop)) };
}
