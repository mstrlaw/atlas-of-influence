// Generic graph model. Nothing in the renderer knows about specific companies.

export type Vec3 = [number, number, number];

export interface ScaleStep { value: number; label: string }
export interface Criterion { id: string; name: string; definition: string }
export interface Category { id: string; name: string; criteria: Criterion[] }
export interface Criteria { scale: ScaleStep[]; categories: Category[] }

/** A "blob": a grouping that entities belong to (think tanks, media…). */
export interface Concept { id: string; name: string; color: string; position: Vec3 }

export interface Algorithm { id: string; name: string }
export interface Source { label: string; url: string }

/** Every cube in the scene, platforms included. */
export interface Entity {
  id: string;
  name: string;
  kind: string;
  concepts: string[];
  summary?: string;
  onPhone?: boolean;
  glyph?: string;
  tint?: string;
  algorithms?: Algorithm[];
  /** criterion id → scale value */
  sheet?: Record<string, number>;
  sources?: Source[];
  draft?: boolean;
  /** Platforms: how they take in content — direct posting and/or scraping the web. Default ['publish']. */
  ingest?: Channel[];
  /** Publishes on its own website (publishers, think tanks…): always linked to a website in the WWW. */
  hasWebsite?: boolean;
  /** Fictional stand-in used while real content is researched. */
  placeholder?: boolean;
}

/** How content gets into a platform: posted on it directly ('publish'), or published on the entity's own website and scraped by the platform ('scrape'). */
export type Channel = 'publish' | 'scrape';

export interface Link {
  source: string;
  target: string;
  kind: string;
  /** For links into a platform: which entry channel(s) the content uses. Defaults to ['publish']. */
  channels?: Channel[];
  weight?: number;
  note?: string;
  sources?: Source[];
  placeholder?: boolean;
}

export interface Atlas {
  criteria: Criteria;
  concepts: Concept[];
  entities: Entity[];
  links: Link[];
  byId: Map<string, Entity>;
  phoneApps: Entity[];
}
