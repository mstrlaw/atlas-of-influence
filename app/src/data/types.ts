// Types for the model in /data (the repo root). Nothing in the renderer knows about specific
// companies: everything it draws comes from these records.

export type Channel = 'publish' | 'scrape';
export type LayerId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7';
/** Depth band an actor sits in. 'oversight' is beside the pipeline, not a step in it. */
export type Band = 'L1' | 'L2' | 'L5' | 'oversight';

export interface EvidenceRow {
  id: string;
  case: string;
  fact: string;
  source: string;
  url: string;
  source_type: string;
  confidence: string;
  read_status: string;
  note?: string;
  responses?: { by: string; type: string; summary: string }[];
}

export interface AppInfo { glyph: string; tint: string; algorithms: string[]; ingest: Channel[]; summary: string }

export interface Actor {
  id: string;
  name: string;
  kind: string;
  country?: string;
  /** false for fronts and fake accounts. */
  authentic?: boolean;
  front_for?: string;
  mainstream?: boolean;
  reach?: { figure: string; source: string };
  note?: string;
  /** Present on platforms that appear as an app on the phone. */
  app?: AppInfo;
}

export interface Relation { source: string; target: string; kind: string; evidence: string[]; note?: string; until?: string; from?: string }

export interface Step {
  /** Actor id, or '@app' for the platform the case is viewed on. */
  actor: string;
  /** Actor id, '@app', or 'screen' (what the person holding the phone sees). */
  to?: string;
  mechanism?: string;
  /** A countervailing step: reporting, research, a regulator. */
  check?: boolean;
  text: string;
  evidence: string[];
  cost?: string;
  knowing?: string;
  narrative?: string;
}

export interface Effect { line: string; level: 'proximate' | 'ultimate'; text: string; evidence: string[]; metric?: string }

export interface Case {
  id: string;
  title: string;
  period: string;
  venues: string[];
  countries: string[];
  languages: string[];
  summary: string;
  attributes: { intent: string; transparency: string; coordination: string; origin: string };
  target?: string;
  attribution?: { by: string; method: string };
  steps: Step[];
  effects: Effect[];
  drivers: string[];
  not_established: string[];
}

export interface Narrative { id: string; title: string; carriers: string[]; evidence: string[] }
export interface Mechanism { id: string; name: string; from: string; to?: string; ref: string | null }
export interface Layer { id: LayerId; name: string; covers: string }
export interface ActorGroup { id: string | null; name: string; kinds: string[]; layer: Band; color: string }
export interface SheetLine { id: string; name: string; term: string; definition: string }
export interface SheetPart { part: string; lines: SheetLine[] }

/** What the visitor has chosen to explore. */
export type Selection =
  | { type: 'case'; id: string }
  | { type: 'narrative'; id: string }
  | { type: 'owner'; id: string }
  | { type: 'actor'; id: string };

// ---------- The graph drawn behind one platform ----------

export interface GraphNode {
  id: string;
  name: string;
  /** Sphere the node belongs to, or null for actors placed beside what they own or fund. */
  group: string | null;
  band: Band;
  /** Fronts and fake accounts are drawn hollow. */
  hollow: boolean;
}

/** How a link reaches the platform: through direct posting, through the web, or straight to it (ownership, orders, oversight). */
export type Via = Channel | 'direct';

export interface GraphLink {
  /** Stable key: the two node ids in order (the platform is its app id). */
  key: string;
  source: string;
  target: string;
  /** Set when the target is the platform itself. */
  via?: Via;
  /** True when the link only exists because of countervailing steps. */
  checkOnly: boolean;
}

export interface GraphSphere { id: string; name: string; color: string }

export interface Graph {
  appId: string;
  nodes: GraphNode[];
  links: GraphLink[];
  spheres: GraphSphere[];
  uses: { publish: boolean; scrape: boolean };
}

/** One step of a highlight, resolved to things the scene can light up. */
export interface TrailStep {
  nodes: string[];
  /** Link keys, each with the direction of travel. */
  links: { key: string; from: string; to: string }[];
  /** The step involves the platform itself. */
  platform: boolean;
  /** The step reaches the phone's screen. */
  screen: boolean;
  kind: 'path' | 'check' | 'own' | 'thread';
}
