// The model, read from /data at the repo root and bundled at build time (the site stays one static
// file with no requests). This module answers the questions the scene and the panel ask:
// what is in the atlas, what does this case light up, who owns what, where does a claim rest.

import frameworkJson from '../../../data/framework.json';
import actorsJson from '../../../data/actors.json';
import relationsJson from '../../../data/relations.json';
import casesJson from '../../../data/cases.json';
import narrativesJson from '../../../data/narratives.json';
import evidenceJson from '../../../data/evidence.json';
import type {
  Actor, ActorGroup, AppContext, Band, Case, EvidenceRow, Graph, GraphLink, GraphNode, Layer, Mechanism, Narrative,
  Relation, SheetPart, Step, TrailStep, Via,
} from './types';

const framework = frameworkJson as unknown as {
  layers: Layer[];
  mechanisms: Mechanism[];
  extended: { id: string; name: string }[];
  actor_groups: ActorGroup[];
  facts_sheet: SheetPart[];
  grade_meanings: Record<string, string>;
  read_meanings: Record<string, string>;
};

export const actors = (actorsJson as { actors: Actor[] }).actors;
export const relations = (relationsJson as { relations: Relation[] }).relations;
export const cases = (casesJson as unknown as { cases: Case[] }).cases;
export const narratives = (narrativesJson as { narratives: Narrative[] }).narratives;
export const evidence = evidenceJson as EvidenceRow[];
export const layers = framework.layers;
export const sheetParts = framework.facts_sheet;
export const gradeMeanings = framework.grade_meanings;
export const readMeanings = framework.read_meanings;

const actorById = new Map(actors.map((a) => [a.id, a]));
const caseById = new Map(cases.map((c) => [c.id, c]));
const narrativeById = new Map(narratives.map((n) => [n.id, n]));
const rowById = new Map(evidence.map((e) => [e.id, e]));
const mechanismById = new Map<string, Mechanism>([
  ...framework.mechanisms.map((m) => [m.id, m] as [string, Mechanism]),
  ...framework.extended.map((m) => [m.id, { id: m.id, name: m.name, from: 'extended', ref: null }] as [string, Mechanism]),
]);
const groupOfKind = new Map<string, ActorGroup>();
for (const g of framework.actor_groups) for (const k of g.kinds) groupOfKind.set(k, g);

/** Platforms that appear as apps on the phone, in the order they are listed. */
export const apps = actors.filter((a) => a.app);
const appIds = new Set(apps.map((a) => a.id));
export const isApp = (id: string) => appIds.has(id);

export const actor = (id: string) => actorById.get(id);
export const caseOf = (id: string) => caseById.get(id);
export const narrative = (id: string) => narrativeById.get(id);
export const mechanism = (id: string) => mechanismById.get(id);
export const row = (id: string) => rowById.get(id);

export const casesFor = (appId: string) => cases.filter((c) => c.venues.includes(appId));

const KIND_LABELS: Record<string, string> = {
  state: 'State', regulator: 'Regulator or court', platform: 'Platform', publisher: 'Publisher', outlet: 'News outlet',
  think_tank: 'Think tank', pr_firm: 'PR or media agency', influence_vendor: 'Influence vendor', content_farm: 'Content network',
  influencer: 'Influencer', crowd: 'Accounts', company: 'Company', individual: 'Individual', fact_checker: 'Fact-checker',
  researcher: 'Researcher', monitor: 'Monitor', political: 'Political actor',
};
export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

const COUNTRIES: Record<string, string> = {
  US: 'United States', IL: 'Israel', DE: 'Germany', RU: 'Russia', GB: 'United Kingdom', CA: 'Canada', BR: 'Brazil', MM: 'Myanmar',
  IR: 'Iran', CN: 'China', FR: 'France', ZA: 'South Africa', SN: 'Senegal', ML: 'Mali', CM: 'Cameroon', TD: 'Chad', TG: 'Togo',
  CI: 'Ivory Coast', KE: 'Kenya', PH: 'Philippines', AU: 'Australia', EU: 'European Union',
};
export const countryName = (code: string) => COUNTRIES[code] ?? code;

/** Display name for a step's actor or target, as seen from one app. */
export function nameOf(id: string | undefined, appId: string): string {
  if (!id) return '';
  if (id === '@app') return actorById.get(appId)?.name ?? appId;
  if (id === 'screen') return 'your screen';
  return actorById.get(id)?.name ?? id;
}

/** "L1 → L4" style tag for a mechanism. */
export function mechanismLayers(id: string): string {
  const m = mechanismById.get(id);
  if (!m) return '';
  if (m.from === 'extended') return 'not drawn';
  return m.to ? `${m.from} → ${m.to}` : m.from;
}

// ---------- The atlas graph ----------
// One graph for the whole atlas: every actor, every relation and every step of every case. It is the
// same whichever app, case, narrative or owner is being explored; a selection only decides what is lit.
//
// Checks are not drawn (decided 14 Nov 2026). A check is a countervailing step: reporting, research,
// a regulator, a court. Those steps, and the actors who appear only as the ones doing the checking,
// are listed in the panel for context and left out of the scene.

const SCRAPE = new Set(['entry.web', 'entry.seo_geo', 'llm.corpus', 'llm.retrieval', 'prod.query_mirroring', 'prod.laundering']);
const PUBLISH = new Set(['entry.direct', 'crowd.inauthentic', 'crowd.participatory', 'prod.influencer', 'plat.ads', 'prod.impersonation', 'prod.paid_placement']);

function viaFor(step: Step, appId: string): Via {
  if (step.check || !step.mechanism) return 'direct';
  const ingest = actorById.get(appId)?.app?.ingest ?? ['publish'];
  if (SCRAPE.has(step.mechanism)) return ingest.includes('scrape') ? 'scrape' : ingest[0];
  if (PUBLISH.has(step.mechanism)) return ingest.includes('publish') ? 'publish' : ingest[0];
  return 'direct';
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const appKey = (actorId: string, appId: string, via: Via) => `${actorId}|${appId}:${via}`;

/** '@app' is the platform a case is viewed on; 'screen' is the phone, which is not a node. */
function resolve(id: string | undefined, appId: string): string | null {
  if (!id || id === 'screen') return null;
  return id === '@app' ? appId : id;
}

interface Hop { key: string; source: string; target: string; via?: Via; from: string; to: string }

/** The link between two nodes. A link into a platform is stored actor → platform, whichever way it is travelled. */
function hop(from: string, to: string, via: Via = 'direct'): Hop {
  if (appIds.has(to)) return { key: appKey(from, to, via), source: from, target: to, via, from, to };
  if (appIds.has(from)) return { key: appKey(to, from, 'direct'), source: to, target: from, via: 'direct', from, to };
  return { key: pairKey(from, to), source: from, target: to, from, to };
}

/** The link a step travels along when the case is viewed on `appId`, if it joins two different nodes. */
function stepHop(s: Step, appId: string): Hop | null {
  const a = resolve(s.actor, appId), b = resolve(s.to, appId);
  if (!a || !b || a === b) return null;
  return hop(a, b, appIds.has(b) ? viaFor(s, b) : 'direct');
}

/** Everyone an actor is owned by, nearest first. */
function ownersOf(id: string, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const r of relations) {
    if (r.kind !== 'owns' || r.target !== id || seen.has(r.source)) continue;
    seen.add(r.source);
    out.push(r.source, ...ownersOf(r.source, seen));
  }
  return out;
}

/** Actors whose only part in the atlas is to check others: the actor of a check step, or a regulator in a 'regulates' relation. */
const checkOnly = (() => {
  const checks = new Set<string>(), other = new Set<string>();
  for (const c of cases) for (const s of c.steps) {
    if (s.check) checks.add(s.actor);
    else { other.add(s.actor); if (s.to) other.add(s.to); }
  }
  for (const r of relations) {
    if (r.kind === 'regulates') checks.add(r.source);
    else { other.add(r.source); other.add(r.target); }
  }
  return new Set([...checks].filter((id) => !other.has(id)));
})();
/** Is this actor drawn in the scene? */
export const isDrawn = (id: string) => actorById.has(id) && !checkOnly.has(id);

let graph: Graph | null = null;

export function atlasGraph(): Graph {
  if (graph) return graph;

  const nodes: GraphNode[] = actors.filter((a) => isDrawn(a.id)).map((a) => {
    const g = a.app ? undefined : groupOfKind.get(a.kind);
    return {
      id: a.id, name: a.name, group: g?.id ?? null, band: (a.app ? 'L4' : g?.layer ?? 'L2') as Band,
      hollow: a.authentic === false, ingest: a.app?.ingest,
    };
  });

  const links = new Map<string, GraphLink>();
  const put = (h: Hop) => {
    if (!isDrawn(h.source) || !isDrawn(h.target) || links.has(h.key)) return;
    links.set(h.key, { key: h.key, source: h.source, target: h.target, via: h.via });
  };
  for (const r of relations) if (r.kind !== 'regulates') put(hop(r.source, r.target));
  // A case has a link into each platform it ran on; the one drawn is the platform being viewed.
  for (const c of cases) for (const v of c.venues) for (const s of c.steps) { const h = s.check ? null : stepHop(s, v); if (h) put(h); }

  const used = new Set(nodes.map((n) => n.group));
  graph = {
    nodes, links: [...links.values()],
    spheres: framework.actor_groups.filter((g) => g.id && used.has(g.id)).map((g) => ({ id: g.id!, name: g.name, color: g.color })),
  };
  return graph;
}

/** The part of the atlas one app's cases and owners touch. Drawn at full strength while that app is open. */
export function contextFor(appId: string): AppContext {
  const nodes = new Set<string>([appId]);
  const links = new Set<string>();
  for (const c of casesFor(appId)) for (const s of c.steps) {
    if (s.check) continue;
    for (const id of [resolve(s.actor, appId), resolve(s.to, appId)]) if (id) nodes.add(id);
    const h = stepHop(s, appId);
    if (h) links.add(h.key);
  }
  [...nodes].forEach((id) => ownersOf(id).forEach((o) => nodes.add(o)));
  for (const r of relations) if (r.kind !== 'regulates' && nodes.has(r.source) && nodes.has(r.target)) links.add(hop(r.source, r.target).key);
  return { nodes, links };
}

// ---------- Trails: what a selection lights up ----------

/** One step, as seen when its case runs on `appId` while the phone shows `viewed`. */
function stepTrail(s: Step, appId: string, kind: TrailStep['kind'], viewed = appId): TrailStep {
  const h = stepHop(s, appId);
  const nodes = [...new Set([resolve(s.actor, appId), resolve(s.to, appId)].filter((id): id is string => !!id))];
  const screen = s.to === 'screen' && appId === viewed;
  return { nodes, links: h ? [{ key: h.key, from: h.from, to: h.to }] : [], platform: screen || nodes.includes(viewed), screen, kind };
}

/** The steps of a case that form its path, in order. Checks are not part of the path. */
export const pathSteps = (c: Case) => c.steps.filter((s) => !s.check);
export const checkSteps = (c: Case) => c.steps.filter((s) => s.check);

export function trailForCase(caseId: string, appId: string): TrailStep[] {
  const c = caseById.get(caseId);
  return c ? pathSteps(c).map((s) => stepTrail(s, appId, 'path')) : [];
}

/** Every step, in any case (or only the cases on one app), that carries the narrative. */
export function narrativeSteps(narrativeId: string, appId?: string): { c: Case; step: Step; index: number }[] {
  const out: { c: Case; step: Step; index: number }[] = [];
  for (const c of appId ? casesFor(appId) : cases)
    c.steps.forEach((step, index) => { if (step.narrative === narrativeId && !step.check) out.push({ c, step, index }); });
  return out;
}

/** A narrative lights every step that carries it, on every platform those cases ran on. */
export function trailForNarrative(narrativeId: string, viewed: string): TrailStep[] {
  const out: TrailStep[] = [];
  for (const { c, step } of narrativeSteps(narrativeId)) {
    const perVenue = step.actor === '@app' || step.to === '@app' || step.to === 'screen';
    for (const v of perVenue ? c.venues : c.venues.slice(0, 1)) out.push(stepTrail(step, v, 'thread', viewed));
  }
  return out;
}

/** Everything an owner owns or controls, directly or through what it owns. */
export function holdings(ownerId: string): { relation: Relation; depth: number }[] {
  const out: { relation: Relation; depth: number }[] = [];
  const seen = new Set<string>([ownerId]);
  const walk = (id: string, depth: number) => {
    for (const r of relations) {
      if (r.kind !== 'owns' || r.source !== id || seen.has(r.target)) continue;
      seen.add(r.target);
      out.push({ relation: r, depth });
      walk(r.target, depth + 1);
    }
  };
  walk(ownerId, 0);
  return out;
}

export function trailForOwner(ownerId: string, viewed: string): TrailStep[] {
  const steps: TrailStep[] = [{ nodes: [ownerId], links: [], platform: false, screen: false, kind: 'own' }];
  for (const { relation: r } of holdings(ownerId)) {
    const h = hop(r.source, r.target);
    steps.push({ nodes: [r.source, r.target], links: [{ key: h.key, from: h.from, to: h.to }], platform: r.target === viewed, screen: false, kind: 'own' });
  }
  return steps;
}

/**
 * The whole network an actor belongs to: every link reachable from it through a chain of other actors,
 * walked outward from the actor (nearest first). A platform ends a chain rather than continuing it, since
 * almost everything reaches a platform and the network would otherwise be the whole atlas.
 */
function actorNetwork(actorId: string): { from: string; to: string; link: GraphLink }[] {
  const adj = new Map<string, GraphLink[]>();
  for (const l of atlasGraph().links) for (const id of [l.source, l.target]) (adj.get(id) ?? adj.set(id, []).get(id)!).push(l);
  const out: { from: string; to: string; link: GraphLink }[] = [];
  const seen = new Set([actorId]), used = new Set<string>();
  const queue = [actorId];
  while (queue.length) {
    const id = queue.shift()!;
    if (id !== actorId && appIds.has(id)) continue;
    for (const l of adj.get(id) ?? []) {
      if (used.has(l.key)) continue;
      used.add(l.key);
      const other = l.source === id ? l.target : l.source;
      out.push({ from: id, to: other, link: l });
      if (!seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return out;
}

/**
 * The app to view an actor's network on: the current one if the network reaches it, otherwise the app
 * the network reaches most. A platform's own network is viewed on that platform.
 */
export function appForActor(actorId: string, current: string): string {
  if (appIds.has(actorId)) return actorId;
  const count = new Map<string, number>();
  for (const { link } of actorNetwork(actorId)) for (const id of [link.source, link.target]) if (appIds.has(id)) count.set(id, (count.get(id) ?? 0) + 1);
  if (!count.size || count.has(current)) return current;
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}

export function trailForActor(actorId: string, viewed: string): TrailStep[] {
  const kind: TrailStep['kind'] = 'path';
  const steps: TrailStep[] = [{ nodes: [actorId], links: [], platform: actorId === viewed, screen: false, kind }];
  for (const { from, to, link: l } of actorNetwork(actorId)) {
    // Links into a platform are drawn only for the app being viewed.
    const app = [l.source, l.target].find((id) => appIds.has(id));
    if (app && app !== viewed) continue;
    steps.push({ nodes: [from, to], links: [{ key: l.key, from, to }], platform: from === viewed || to === viewed, screen: false, kind });
  }
  return steps;
}

/** Actors that own something, most holdings first. */
export const owners = actors
  .filter((a) => relations.some((r) => r.kind === 'owns' && r.source === a.id))
  .map((a) => ({ actor: a, holdings: holdings(a.id) }))
  .sort((x, y) => y.holdings.length - x.holdings.length);

/** Does this owner's chain reach the app? */
export const ownerReaches = (ownerId: string, appId: string) => holdings(ownerId).some((h) => h.relation.target === appId);

export const casesWithActor = (actorId: string) =>
  cases.filter((c) => c.steps.some((s) => s.actor === actorId || s.to === actorId));

/** Narratives that at least one encoded case carries, then the rest. */
export const narrativeList = narratives
  .map((n) => ({ narrative: n, steps: narrativeSteps(n.id) }))
  .sort((a, b) => b.steps.length - a.steps.length);

// ---------- Sources ----------

export interface SourceGroup { url: string; source: string; rows: EvidenceRow[] }

/** Evidence rows grouped by the page they cite, in first-cited order. */
export function sourcesOf(ids: string[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const id of [...new Set(ids)]) {
    const r = rowById.get(id);
    if (!r) continue;
    const g = groups.get(r.url) ?? { url: r.url, source: r.source, rows: [] };
    g.rows.push(r);
    groups.set(r.url, g);
  }
  return [...groups.values()];
}

export function responsesOf(ids: string[]) {
  const seen = new Set<string>();
  const out: { by: string; type: string; summary: string; row: string }[] = [];
  for (const id of [...new Set(ids)]) for (const r of rowById.get(id)?.responses ?? []) {
    const k = r.by + '|' + r.summary;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...r, row: id });
  }
  return out;
}

export const caseEvidence = (c: Case) => [...new Set([...c.steps.flatMap((s) => s.evidence), ...c.effects.flatMap((e) => e.evidence)])];

// ---------- Influence Facts ----------

export interface SheetEntry { cases: Case[]; sources: number; owners: string[] }

/** Per line of the sheet: the cases on this app that bear on it, and how many sources stand behind them. */
export function sheetFor(appId: string): Map<string, SheetEntry> {
  const out = new Map<string, SheetEntry>();
  const mine = casesFor(appId);
  const count = (ids: string[]) => new Set(ids.map((id) => rowById.get(id)?.url).filter(Boolean)).size;
  for (const part of sheetParts) for (const line of part.lines) {
    const effectCases = mine.filter((c) => c.effects.some((e) => e.line === line.id));
    const driverCases = mine.filter((c) => c.drivers.includes(line.id));
    const hit = effectCases.length ? effectCases : driverCases;
    const ids = effectCases.length
      ? effectCases.flatMap((c) => c.effects.filter((e) => e.line === line.id).flatMap((e) => e.evidence))
      : driverCases.flatMap(caseEvidence);
    out.set(line.id, {
      cases: hit, sources: count(ids),
      owners: line.id === 'owner' ? ownersOf(appId).map((id) => actorById.get(id)?.name ?? id) : [],
    });
  }
  return out;
}
