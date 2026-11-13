import type { Atlas, Concept, Criteria, Entity, Link } from './types';

// Content lives in /data/*.json and is bundled at build time, so the site is
// one static file with no requests. Edit the JSON and rebuild to change content.
import criteria from '../../data/criteria.json';
import concepts from '../../data/concepts.json';
import entities from '../../data/entities.json';
import links from '../../data/links.json';

export async function loadAtlas(): Promise<Atlas> {
  const atlas = {
    criteria: criteria as Criteria,
    concepts: concepts as Concept[],
    entities: entities as Entity[],
    links: links as Link[],
  };

  const byId = new Map(atlas.entities.map((e) => [e.id, e]));
  const conceptIds = new Set(atlas.concepts.map((c) => c.id));

  // Validate references early so content mistakes are loud, not silent.
  for (const e of atlas.entities)
    for (const c of e.concepts)
      if (!conceptIds.has(c)) console.warn(`[atlas] ${e.id} references unknown concept "${c}"`);
  for (const l of atlas.links)
    if (!byId.has(l.source) || !byId.has(l.target))
      console.warn(`[atlas] link ${l.source} → ${l.target} references an unknown entity`);

  return { ...atlas, byId, phoneApps: atlas.entities.filter((e) => e.onPhone) };
}
