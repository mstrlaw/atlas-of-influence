#!/usr/bin/env node
// Checks that the model's data files agree with each other: every actor, mechanism, evidence row,
// narrative, platform and Influence Facts line a case refers to must exist. Exits non-zero on an
// error, so a broken reference fails the build instead of reaching the atlas.
//
// Usage: node scripts/validate-model.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

const framework = load('framework.json');
const evidence = load('evidence.json');
const { actors } = load('actors.json');
const { relations } = load('relations.json');
const { cases } = load('cases.json');
const { narratives } = load('narratives.json');

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);

const actorIds = new Set(actors.map((a) => a.id));
const appIds = new Set(actors.filter((a) => a.app).map((a) => a.id));
const mechanismIds = new Set([...framework.mechanisms, ...framework.extended].map((m) => m.id));
const rows = new Map(evidence.map((e) => [e.id, e]));
const narrativeIds = new Set(narratives.map((n) => n.id));
const kinds = new Set(framework.actor_kinds);
const relationKinds = new Set(framework.relation_kinds);
const sheetLines = framework.facts_sheet.flatMap((p) => p.lines.map((l) => l.id));
const effectLines = new Set(framework.facts_sheet[0].lines.map((l) => l.id));
const driverLines = new Set(framework.facts_sheet[1].lines.map((l) => l.id));
const attributeValues = Object.fromEntries(framework.attributes.map((a) => [a.name.toLowerCase(), new Set([...a.values, 'not established'])]));
const targets = new Set(['public', 'community', 'decision_maker', 'ai_model']);
const knowing = new Set(['yes', 'no', 'disputed', 'unknown']);

const dupes = (ids, what) => ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => err(`duplicate ${what} id "${id}"`));
dupes(actors.map((a) => a.id), 'actor');
dupes(cases.map((c) => c.id), 'case');

const cited = new Set();
function checkEvidence(ids, where) {
  if (!ids?.length) return err(`${where}: no evidence cited`);
  for (const id of ids) {
    const row = rows.get(id);
    if (!row) { err(`${where}: unknown evidence row ${id}`); continue; }
    cited.add(id);
    if (row.read_status === 'unread') warnings.push(`${where}: cites ${id}, which has not been read`);
  }
}

for (const a of actors) {
  if (!kinds.has(a.kind)) err(`actor ${a.id}: unknown kind "${a.kind}"`);
  if (a.front_for && !actorIds.has(a.front_for)) err(`actor ${a.id}: front_for unknown actor "${a.front_for}"`);
  if (a.reach && !rows.has(a.reach.source)) err(`actor ${a.id}: reach cites unknown row ${a.reach.source}`);
}

for (const r of relations) {
  const where = `relation ${r.source} → ${r.target}`;
  if (!actorIds.has(r.source) || !actorIds.has(r.target)) err(`${where}: unknown actor`);
  if (!relationKinds.has(r.kind)) err(`${where}: unknown kind "${r.kind}"`);
  checkEvidence(r.evidence, where);
}

const node = (id) => id === '@app' || id === 'screen' || actorIds.has(id);
for (const c of cases) {
  const where = `case ${c.id}`;
  if (!c.venues?.length) err(`${where}: no venue`);
  for (const v of c.venues ?? []) if (!appIds.has(v)) err(`${where}: venue "${v}" is not an app on the phone`);
  for (const [name, value] of Object.entries(c.attributes ?? {}))
    if (!attributeValues[name]?.has(value)) err(`${where}: attribute ${name} has unknown value "${value}"`);
  if (c.target && !targets.has(c.target)) err(`${where}: unknown target "${c.target}"`);
  c.steps.forEach((s, i) => {
    const at = `${where} step ${i + 1}`;
    if (!node(s.actor)) err(`${at}: unknown actor "${s.actor}"`);
    if (s.to && !node(s.to)) err(`${at}: unknown target "${s.to}"`);
    if (s.actor === 'screen') err(`${at}: the screen cannot act`);
    if (!s.check && !s.mechanism) err(`${at}: needs a mechanism (or check: true)`);
    if (s.mechanism && !mechanismIds.has(s.mechanism)) err(`${at}: unknown mechanism "${s.mechanism}"`);
    if (s.narrative && !narrativeIds.has(s.narrative)) err(`${at}: unknown narrative "${s.narrative}"`);
    if (s.knowing && !knowing.has(s.knowing)) err(`${at}: unknown knowing value "${s.knowing}"`);
    if (!s.text) err(`${at}: no text`);
    checkEvidence(s.evidence, at);
  });
  (c.effects ?? []).forEach((e, i) => {
    const at = `${where} effect ${i + 1}`;
    if (!effectLines.has(e.line)) err(`${at}: "${e.line}" is not a line in the first part of the Influence Facts sheet`);
    if (!['proximate', 'ultimate'].includes(e.level)) err(`${at}: level must be proximate or ultimate`);
    checkEvidence(e.evidence, at);
  });
  for (const d of c.drivers ?? []) if (!driverLines.has(d)) err(`${where}: unknown driver "${d}"`);
}

for (const n of narratives) for (const id of n.evidence) if (!rows.has(id)) err(`narrative ${n.id}: unknown evidence row ${id}`);

const usedMechanisms = new Set(cases.flatMap((c) => c.steps.map((s) => s.mechanism).filter(Boolean)));
const unusedApps = [...appIds].filter((id) => !cases.some((c) => c.venues.includes(id)));

[...new Set(warnings)].forEach((w) => console.warn(`warning: ${w}`));
errors.forEach((e) => console.error(`error: ${e}`));
console.log(
  `${actors.length} actors, ${relations.length} relations, ${cases.length} cases, ${cited.size} of ${evidence.length} evidence rows cited, ` +
  `${usedMechanisms.size} of ${framework.mechanisms.length} mechanisms used. Apps with no case: ${unusedApps.join(', ') || 'none'}. Sheet lines: ${sheetLines.length}.`,
);
if (errors.length) { console.error(`${errors.length} error(s).`); process.exit(1); }
