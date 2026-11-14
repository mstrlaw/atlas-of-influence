// The model, read from /data at the repo root and bundled at build time (the site stays one static
// file with no requests). This module answers the questions the scene and the panel ask:
// what is behind this app, what does this case light up, who owns what, where does a claim rest.

import frameworkJson from '../../../data/framework.json';
import actorsJson from '../../../data/actors.json';
import relationsJson from '../../../data/relations.json';
import casesJson from '../../../data/cases.json';
import narrativesJson from '../../../data/narratives.json';
import evidenceJson from '../../../data/evidence.json';
import type {
  Actor, ActorGroup, Band, Case, EvidenceRow, Graph, GraphLink, GraphNode, Layer, Mechanism, Narrative,
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

// ---------- The graph behind one app ----------

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

/** Resolve '@app' to the app being viewed; other platforms are not part of this app's network. */
function resolve(id: string | undefined, appId: string): string | null {
  if (!id || id === 'screen') return null;
  if (id === '@app' || id === appId) return appId;
  return appIds.has(id) ? null : id;
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

const graphCache = new Map<string, Graph>();

export function graphFor(appId: string): Graph {
  const hit = graphCache.get(appId);
  if (hit) return hit;

  const ids = new Set<string>();
  const add = (id: string | null) => { if (id && id !== appId) ids.add(id); };
  for (const c of casesFor(appId)) for (const s of c.steps) { add(resolve(s.actor, appId)); add(resolve(s.to, appId)); }
  ownersOf(appId).forEach(add);
  [...ids].forEach((id) => ownersOf(id).forEach(add));
  for (const r of relations) if (r.kind === 'regulates' && r.target === appId) add(r.source);

  const nodes: GraphNode[] = [...ids].map((id) => {
    const a = actorById.get(id)!;
    const g = groupOfKind.get(a.kind);
    return { id, name: a.name, group: g?.id ?? null, band: (g?.layer ?? 'L2') as Band, hollow: a.authentic === false };
  });

  const links = new Map<string, GraphLink>();
  const put = (key: string, source: string, target: string, via: Via | undefined, check: boolean) => {
    const l = links.get(key);
    if (l) { if (!check) l.checkOnly = false; return; }
    links.set(key, { key, source, target, via, checkOnly: check });
  };
  for (const r of relations) {
    if (ids.has(r.source) && ids.has(r.target)) put(pairKey(r.source, r.target), r.source, r.target, undefined, false);
    else if (ids.has(r.source) && r.target === appId) put(appKey(r.source, appId, 'direct'), r.source, appId, 'direct', false);
  }
  for (const c of casesFor(appId)) {
    for (const s of c.steps) {
      const a = resolve(s.actor, appId), b = resolve(s.to, appId);
      if (!a || !b || a === b) continue;
      if (b === appId) { const via = viaFor(s, appId); put(appKey(a, appId, via), a, appId, via, !!s.check); }
      else if (a === appId) put(appKey(b, appId, 'direct'), b, appId, 'direct', !!s.check);
      else put(pairKey(a, b), a, b, undefined, !!s.check);
    }
  }

  const all = [...links.values()];
  const groupIds = [...new Set(nodes.map((n) => n.group).filter((g): g is string => !!g))];
  const ingest = actorById.get(appId)?.app?.ingest ?? [];
  const graph: Graph = {
    appId, nodes, links: all,
    spheres: groupIds.map((id) => { const g = framework.actor_groups.find((x) => x.id === id)!; return { id, name: g.name, color: g.color }; }),
    uses: {
      publish: ingest.includes('publish') || all.some((l) => l.via === 'publish'),
      scrape: ingest.includes('scrape') || all.some((l) => l.via === 'scrape'),
    },
  };
  graphCache.set(appId, graph);
  return graph;
}

// ---------- Trails: what a selection lights up ----------

function stepTrail(s: Step, appId: string, kind: TrailStep['kind']): TrailStep {
  const a = resolve(s.actor, appId), b = resolve(s.to, appId);
  const nodes = [a, b].filter((id): id is string => !!id && id !== appId);
  const links: TrailStep['links'] = [];
  if (a && b && a !== b) {
    if (b === appId) links.push({ key: appKey(a, appId, viaFor(s, appId)), from: a, to: appId });
    else if (a === appId) links.push({ key: appKey(b, appId, 'direct'), from: appId, to: b });
    else links.push({ key: pairKey(a, b), from: a, to: b });
  }
  return { nodes, links, platform: a === appId || b === appId || s.to === 'screen', screen: s.to === 'screen', kind };
}

export function trailForCase(caseId: string, appId: string): TrailStep[] {
  const c = caseById.get(caseId);
  return c ? c.steps.map((s) => stepTrail(s, appId, s.check ? 'check' : 'path')) : [];
}

/** Every step, in any case on this app, that carries the narrative. */
export function narrativeSteps(narrativeId: string, appId?: string): { c: Case; step: Step; index: number }[] {
  const out: { c: Case; step: Step; index: number }[] = [];
  for (const c of appId ? casesFor(appId) : cases)
    c.steps.forEach((step, index) => { if (step.narrative === narrativeId) out.push({ c, step, index }); });
  return out;
}

export function trailForNarrative(narrativeId: string, appId: string): TrailStep[] {
  return narrativeSteps(narrativeId, appId).map(({ step }) => stepTrail(step, appId, 'thread'));
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

export function trailForOwner(ownerId: string, appId: string): TrailStep[] {
  const g = graphFor(appId);
  const present = new Set(g.nodes.map((n) => n.id));
  const steps: TrailStep[] = [];
  if (present.has(ownerId)) steps.push({ nodes: [ownerId], links: [], platform: false, screen: false, kind: 'own' });
  for (const { relation: r } of holdings(ownerId)) {
    if (!present.has(r.source)) continue;
    if (r.target === appId) steps.push({ nodes: [r.source], links: [{ key: appKey(r.source, appId, 'direct'), from: r.source, to: appId }], platform: true, screen: false, kind: 'own' });
    else if (present.has(r.target)) steps.push({ nodes: [r.source, r.target], links: [{ key: pairKey(r.source, r.target), from: r.source, to: r.target }], platform: false, screen: false, kind: 'own' });
  }
  return steps;
}

export function trailForActor(actorId: string, appId: string): TrailStep[] {
  const g = graphFor(appId);
  const steps: TrailStep[] = [{ nodes: [actorId], links: [], platform: false, screen: false, kind: 'path' }];
  for (const l of g.links) {
    if (l.source !== actorId && l.target !== actorId) continue;
    const other = l.source === actorId ? l.target : l.source;
    steps.push({ nodes: other === appId ? [] : [other], links: [{ key: l.key, from: l.source, to: l.target }], platform: other === appId, screen: false, kind: 'path' });
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
