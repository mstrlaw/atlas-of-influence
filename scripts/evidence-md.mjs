#!/usr/bin/env node
// Regenerates data/evidence.md from data/evidence.json.
// The JSON is the source; never edit the markdown table by hand.
//
// Usage: node scripts/evidence-md.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const rows = JSON.parse(readFileSync(join(dataDir, 'evidence.json'), 'utf8'));

const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

const notes = (r) =>
  [r.note, ...(r.responses ?? []).map((x) => `${x.by} (${x.type.replace('_', ' ')}): ${x.summary}.`)].filter(Boolean).join(' ');

const lines = [
  '| ID | Case | Fact | Source | Source type | Grade | Read | Notes and responses | Visual use |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) =>
    `| ${[
      r.id,
      cell(r.case),
      cell(r.fact),
      r.url ? `[${cell(r.source)}](${r.url})` : cell(r.source),
      cell(r.source_type),
      cell(r.confidence),
      cell(r.read_status),
      cell(notes(r)),
      cell(r.visual_use),
    ].join(' | ')} |`,
  ),
];

writeFileSync(join(dataDir, 'evidence.md'), lines.join('\n') + '\n');
console.log(`Wrote ${rows.length} rows to data/evidence.md`);
