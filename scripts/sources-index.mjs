#!/usr/bin/env node
// Rebuilds data/sources/index.json from data/evidence.json.
//
// One entry per unique source URL. IDs (S001, S002, …) are assigned once and
// never reused: existing entries keep their ID and their hand-written fields
// (captured, archive_url, notes). The script refreshes only the derived
// fields: which evidence rows cite the source and which snapshot files exist.
//
// Usage: node scripts/sources-index.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcesDir = join(root, 'data', 'sources');
const indexPath = join(sourcesDir, 'index.json');
const IMAGE = /\.(png|jpe?g|webp|avif|pdf)$/i;

const evidence = JSON.parse(readFileSync(join(root, 'data', 'evidence.json'), 'utf8'));
const previous = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];

const byUrl = new Map(previous.map((s) => [s.url, s]));
let nextNumber = previous.reduce((max, s) => Math.max(max, Number(s.id.slice(1))), 0) + 1;

for (const source of byUrl.values()) source.evidence = [];

for (const row of evidence) {
  if (!row.url) continue;
  let source = byUrl.get(row.url);
  if (!source) {
    source = {
      id: `S${String(nextNumber++).padStart(3, '0')}`,
      url: row.url,
      publisher: new URL(row.url).hostname.replace(/^www\./, ''),
      evidence: [],
      files: [],
      captured: null,
      archive_url: null,
      notes: '',
    };
    byUrl.set(row.url, source);
  }
  source.evidence.push(row.id);
}

// Files git ignores (local copies not republished) are not listed as snapshots.
function ignored(paths) {
  if (!paths.length) return new Set();
  try {
    const out = execFileSync('git', ['check-ignore', '--', ...paths], { cwd: root, encoding: 'utf8' });
    return new Set(out.split('\n').filter(Boolean));
  } catch (e) {
    return new Set(String(e.stdout ?? '').split('\n').filter(Boolean)); // exit 1 = none ignored
  }
}

const sources = [...byUrl.values()].sort((a, b) => a.id.localeCompare(b.id));
for (const source of sources) {
  const dir = join(sourcesDir, source.id);
  const found = existsSync(dir) ? readdirSync(dir).filter((f) => IMAGE.test(f)).sort() : [];
  const skip = ignored(found.map((f) => join('data', 'sources', source.id, f)));
  source.files = found.filter((f) => !skip.has(join('data', 'sources', source.id, f)));
}

writeFileSync(indexPath, JSON.stringify(sources, null, 2) + '\n');

const withSnapshot = sources.filter((s) => s.files.length).length;
const orphaned = sources.filter((s) => s.evidence.length === 0);
console.log(`${sources.length} sources, ${withSnapshot} with a snapshot, ${sources.length - withSnapshot} without.`);
if (orphaned.length) console.log(`No longer cited by any evidence row: ${orphaned.map((s) => s.id).join(', ')}`);
