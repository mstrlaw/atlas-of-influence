#!/usr/bin/env node
// Builds app/public/framework.html: a single self-contained page that shows what
// the framework covers (layers, mechanisms, cases, evidence) and what it does
// not cover yet (proposed changes, gaps, open questions).
//
// Inputs:  data/framework.json, data/evidence.json, data/sources/index.json,
//          docs/proposed-changes.md
// Vite copies app/public/ into the site, so the page is served at /framework
// next to the 3D app. `npm run dev` and `npm run build` in app/ run this first.
// Usage:   node scripts/framework-map.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(root, ...p), 'utf8');

const framework = JSON.parse(read('data', 'framework.json'));
const evidence = JSON.parse(read('data', 'evidence.json'));
const narratives = JSON.parse(read('data', 'narratives.json')).narratives;
const sourcesPath = join(root, 'data', 'sources', 'index.json');
const sources = existsSync(sourcesPath) ? JSON.parse(readFileSync(sourcesPath, 'utf8')) : [];

// --- Evidence: base grade and group for every row -------------------------
const grades = [...framework.confidence].sort((a, b) => b.length - a.length);
const baseGrade = (text) => grades.find((g) => text.toLowerCase().startsWith(g)) ?? 'other';
const groupOf = (label) =>
  framework.evidence_groups.find((g) => g.labels.some((prefix) => label.startsWith(prefix)));

const gradeCounts = Object.fromEntries(framework.confidence.map((g) => [g, 0]));
const readCounts = Object.fromEntries(framework.read_status.map((g) => [g, 0]));
for (const row of evidence) readCounts[row.read_status] = (readCounts[row.read_status] ?? 0) + 1;
const groups = framework.evidence_groups.map((g) => ({ name: g.name, case: g.case ?? null, rows: [] }));
const ungrouped = [];
for (const row of evidence) {
  const grade = baseGrade(row.confidence);
  gradeCounts[grade] = (gradeCounts[grade] ?? 0) + 1;
  const group = groupOf(row.case);
  if (group) groups.find((g) => g.name === group.name).rows.push(row.id);
  else ungrouped.push(row.case);
}
if (ungrouped.length) {
  groups.push({ name: 'Ungrouped', case: null, rows: ungrouped });
  console.warn(`No evidence group matches: ${[...new Set(ungrouped)].join('; ')}`);
}

// --- Cases: the shape the page draws, derived from data/cases.json -----------
const { cases: caseRecords } = JSON.parse(read('data', 'cases.json'));
const mechById = new Map(framework.mechanisms.map((m) => [m.id, m]));
const citedRows = new Set();
framework.cases = caseRecords.map((c) => {
  const ids = new Set([...c.steps.flatMap((s) => s.evidence), ...c.effects.flatMap((e) => e.evidence)]);
  ids.forEach((id) => citedRows.add(id));
  const mechs = [...new Set(c.steps.map((s) => s.mechanism).filter((m) => mechById.has(m)))];
  const layerSet = new Set(mechs.flatMap((m) => [mechById.get(m).from, mechById.get(m).to]).filter(Boolean));
  if (c.steps.some((s) => s.to === 'screen')) layerSet.add('L6');
  if (c.effects.some((e) => e.level === 'ultimate')) layerSet.add('L7');
  return {
    id: c.id, title: c.title, period: c.period, origin: c.countries.join(', '), transparency: c.attributes.transparency,
    layers: [...layerSet], key_mechanisms: mechs, path_mechanisms: [], rows: ids.size, sourcing: 'evidenced',
  };
});
for (const g of groups) g.case = g.rows.some((id) => citedRows.has(id)) ? 'cited' : null;

// --- Proposed changes: "N. **Title.** rest" under "## X. Section" ----------
const proposals = [];
const decided = new Map(); // number -> 'accepted' | 'rejected' | 'deferred' | 'decided'
let section = '';
for (const line of read('docs', 'proposed-changes.md').split('\n')) {
  const ruling = line.match(/^\| (\d+) \| ([a-z]+) \|/);
  if (ruling) decided.set(Number(ruling[1]), ruling[2]);
  const heading = line.match(/^## (?:[A-G]\. )?(.+)$/);
  if (heading) section = heading[1];
  const item = line.match(/^(\d+)\. \*\*(?:\(new\) )?(.+?)\*\*/);
  if (item) proposals.push({ n: Number(item[1]), title: item[2].replace(/[.:]$/, ''), section });
}
for (const p of proposals) p.status = decided.get(p.n) ?? 'proposed';

const data = {
  framework,
  gradeCounts,
  readCounts,
  responses: evidence.reduce((n, r) => n + (r.responses?.length ?? 0), 0),
  groups: groups.map((g) => ({ name: g.name, case: g.case, count: g.rows.length })),
  cited: citedRows.size,
  proposals,
  narratives,
  totals: {
    evidence: evidence.length,
    sources: sources.length,
    snapshots: sources.filter((s) => s.files.length).length,
  },
  built: new Date().toISOString().slice(0, 10),
};

const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas of Influence framework map</title>
<style>
/* Layout idea: the seven layers run left to right as columns, coloured from deep
   blue (structure) to amber (the screen and the mind); everything else hangs off them. */
:root {
  --bg: #f3f4f7; --surface: #ffffff; --ink: #161a24; --muted: #5b6373; --line: #d8dce5; --accent: #2b47d6;
  --l1: #3d3fa3; --l2: #2c63bd; --l3: #1a84a6; --l4: #178f7a; --l5: #5f9130; --l6: #b07d12; --l7: #c8551f;
  --gap-ink: #a23a1a; --gap-bg: #fbeee8;
  --display: "Avenir Next", "Segoe UI", system-ui, sans-serif;
  --body: system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #10131a; --surface: #181c26; --ink: #e8ebf2; --muted: #98a1b3; --line: #2c3342; --accent: #8ea2ff;
    --l1: #8f91f2; --l2: #6c9df0; --l3: #4fbfe0; --l4: #45cdb3; --l5: #9ccf66; --l6: #e6b54a; --l7: #f08a55;
    --gap-ink: #f3a487; --gap-bg: #33201a;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #10131a; --surface: #181c26; --ink: #e8ebf2; --muted: #98a1b3; --line: #2c3342; --accent: #8ea2ff;
  --l1: #8f91f2; --l2: #6c9df0; --l3: #4fbfe0; --l4: #45cdb3; --l5: #9ccf66; --l6: #e6b54a; --l7: #f08a55;
  --gap-ink: #f3a487; --gap-bg: #33201a;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 15px/1.5 var(--body); }
main { max-width: 1320px; margin: 0 auto; padding: 32px 24px 80px; display: flex; flex-direction: column; gap: 48px; }
h1, h2, h3 { font-family: var(--display); text-wrap: balance; margin: 0; }
h1 { font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
h2 { font-size: 20px; font-weight: 600; }
h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
p { margin: 0; max-width: 70ch; }
.lede { color: var(--muted); margin-top: 6px; }
.back { display: inline-block; margin-bottom: 14px; color: var(--accent); text-decoration: none; font-size: 14px; }
.back:hover { text-decoration: underline; }
section { display: flex; flex-direction: column; gap: 16px; }
.mono { font-family: var(--mono); font-size: 12px; }
.num { font-variant-numeric: tabular-nums; }

.stats { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 18px; }
.stat b { font: 600 22px var(--display); font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); margin-left: 6px; }

.picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.picker button { font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line);
  border-radius: 999px; padding: 5px 14px; cursor: pointer; }
.picker button:hover { border-color: var(--accent); }
.picker button:focus-visible, .caserow:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.picker button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }

.scroll { overflow-x: auto; }
.pipeline { display: grid; grid-template-columns: repeat(7, minmax(170px, 1fr)); gap: 10px; min-width: 1240px; }
.layer { background: var(--surface); border: 1px solid var(--line); border-top: 4px solid var(--c); border-radius: 6px;
  padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: opacity .15s; }
.layer header b { color: var(--c); font: 600 13px var(--mono); }
.layer header div { font: 600 17px var(--display); }
.layer header p { color: var(--muted); font-size: 12.5px; line-height: 1.4; margin-top: 4px; }
.mechs { display: flex; flex-direction: column; gap: 6px; }
.mech { border: 1px solid var(--line); border-left: 3px solid var(--c); border-radius: 4px; padding: 6px 8px; transition: opacity .15s; }
.mech .mono { color: var(--muted); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0 6px; }
.mech .mono span:first-child { overflow-wrap: anywhere; min-width: 0; }
.mech .to { color: var(--c); white-space: nowrap; }
.mech .name { font-size: 13px; line-height: 1.35; }
.mech .used { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.mech.unused { border-style: dashed; border-left-style: solid; }
.mech.unused .used, .empty { color: var(--gap-ink); }
.empty { font-size: 12.5px; background: var(--gap-bg); border-radius: 4px; padding: 6px 8px; }
.pipeline.picked .layer:not(.on) { opacity: .35; }
.pipeline.picked .mech:not(.key):not(.path) { opacity: .3; }
.pipeline.picked .mech.key { border-color: var(--c); box-shadow: inset 0 0 0 1px var(--c); }
.pipeline.picked .mech.path { border-color: var(--c); }
.loops { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: 13px; }
.loops b { color: var(--ink); font-weight: 600; }
.dashed { border-bottom: 1px dashed var(--gap-ink); }

table { border-collapse: collapse; width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font: 600 12px var(--body); color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
tr:last-child td { border-bottom: 0; }
.caserow { cursor: pointer; }
.caserow:hover td, .caserow.sel td { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.strip { display: grid; grid-template-columns: repeat(7, 22px); gap: 3px; }
.strip i { height: 14px; border-radius: 2px; border: 1px solid var(--line); }
.strip i.on { background: var(--c); border-color: var(--c); }
.dots { display: grid; grid-template-columns: repeat(7, 22px); gap: 3px; justify-items: center; }
.dots i { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--line); }
.dots i.on { background: var(--c); border-color: var(--c); }
.pill { display: inline-block; font-size: 12px; padding: 1px 9px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
.pill.gap { color: var(--gap-ink); background: var(--gap-bg); border-color: transparent; }

.two { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(320px, 2fr); gap: 32px; align-items: start; }
.bars { display: flex; flex-direction: column; gap: 6px; }
.bar { display: grid; grid-template-columns: minmax(120px, 44%) 1fr 32px; gap: 10px; align-items: center; font-size: 13px; }
.bar .track { height: 12px; background: color-mix(in srgb, var(--line) 55%, transparent); border-radius: 2px; }
.bar .fill { height: 100%; border-radius: 2px; background: var(--accent); min-width: 2px; }
.bar.gap .fill { background: var(--gap-ink); }
.bar.zero .fill { display: none; }
.bar .num { text-align: right; }
.legend { display: flex; gap: 18px; font-size: 12.5px; color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips span { font-size: 12.5px; border: 1px solid var(--line); border-radius: 4px; padding: 1px 7px; }
.card dl { margin: 0; display: grid; grid-template-columns: minmax(0, auto) 1fr; gap: 3px 12px; font-size: 13px; }
.card dt { font-weight: 600; } .card dd { margin: 0; color: var(--muted); }
.plist { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.plist .done { color: var(--muted); }
.plist .num { color: var(--muted); display: inline-block; width: 26px; }
ul.plain { margin: 0; padding-left: 18px; font-size: 13.5px; display: flex; flex-direction: column; gap: 4px; }
footer { color: var(--muted); font-size: 12.5px; }
@media (max-width: 760px) { .two { grid-template-columns: 1fr; } main { padding: 24px 16px 60px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<main id="app"></main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const F = D.framework;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lc = (id) => 'var(--l' + id.slice(1) + ')';
const caseById = Object.fromEntries(F.cases.map((c) => [c.id, c]));
const usedBy = (mechId) => F.cases.filter((c) => c.key_mechanisms.includes(mechId) || c.path_mechanisms.includes(mechId));
const rowsOfCase = (id) => caseById[id].rows;
const modelled = D.cited;
const unusedMechs = F.mechanisms.filter((m) => usedBy(m.id).length === 0).length;

const stat = (n, label) => '<div class="stat"><b>' + n + '</b><span>' + label + '</span></div>';

const pipeline = F.layers.map((L) => {
  const mechs = F.mechanisms.filter((m) => m.from === L.id);
  const items = mechs.map((m) => {
    const cases = usedBy(m.id);
    return '<div class="mech' + (cases.length ? '' : ' unused') + '" data-mech="' + m.id + '">' +
      '<div class="mono"><span>' + m.id + '</span>' + (m.to ? '<span class="to" style="--c:' + lc(m.to) + '">→ ' + m.to + '</span>' : '') + '</div>' +
      '<div class="name">' + esc(m.name) + '</div>' +
      '<div class="used">' + (cases.length ? cases.map((c) => esc(c.title)).join(', ') : 'No case uses it') + '</div></div>';
  }).join('');
  return '<div class="layer" data-layer="' + L.id + '" style="--c:' + lc(L.id) + '"><header><b>' + L.id + '</b><div>' + esc(L.name) +
    '</div><p>' + esc(L.covers) + '</p></header><div class="mechs">' +
    (items || '<div class="empty">No mechanisms defined at this layer</div>') + '</div></div>';
}).join('');

const caseRows = F.cases.map((c) => {
  const n = rowsOfCase(c.id);
  return '<tr class="caserow" tabindex="0" data-case="' + c.id + '"><td><b>' + esc(c.title) + '</b>' + (c.period ? ' <span class="mono">' + esc(c.period) + '</span>' : '') +
    '</td><td>' + esc(c.origin) + '</td><td>' + esc(c.transparency) + '</td><td><div class="strip">' +
    F.layers.map((L) => '<i title="' + L.id + ' ' + L.name + '" style="--c:' + lc(L.id) + '"' + (c.layers.includes(L.id) ? ' class="on"' : '') + '></i>').join('') +
    '</div></td><td class="num">' + n + '</td><td><span class="pill' + (c.sourcing === 'evidenced' && n ? '' : ' gap') + '">' + esc(n ? c.sourcing : 'no evidence rows') + '</span></td></tr>';
}).join('');

const maxGrade = Math.max(...Object.values(D.gradeCounts));
const gradeBars = Object.entries(D.gradeCounts).map(([g, n]) =>
  '<div class="bar' + (n ? '' : ' zero') + '"><span>' + esc(g) + '</span><div class="track"><div class="fill" style="width:' + (100 * n / maxGrade) + '%"></div></div><span class="num">' + n + '</span></div>').join('');
const maxRead = Math.max(...Object.values(D.readCounts));
const readBars = Object.entries(D.readCounts).map(([g, n]) =>
  '<div class="bar' + (n ? '' : ' zero') + '"><span>' + esc(g) + '</span><div class="track"><div class="fill" style="width:' + (100 * n / maxRead) + '%"></div></div><span class="num">' + n + '</span></div>').join('');
const maxGroup = Math.max(...D.groups.map((g) => g.count));
const groupBars = D.groups.map((g) =>
  '<div class="bar' + (g.case ? '' : ' gap') + (g.count ? '' : ' zero') + '"><span>' + esc(g.name) + '</span><div class="track"><div class="fill" style="width:' + (100 * g.count / maxGroup) + '%"></div></div><span class="num">' + g.count + '</span></div>').join('');

const chips = (list) => '<div class="chips">' + list.map((v) => '<span>' + esc(v) + '</span>').join('') + '</div>';
const frameworkRows = F.frameworks.map((f) =>
  '<tr><td><b>' + esc(f.name) + '</b><br><span style="color:var(--muted);font-size:13px">' + esc(f.contributes) + '</span></td><td><div class="dots">' +
  F.layers.map((L) => '<i title="' + L.id + '" style="--c:' + lc(L.id) + '"' + (f.layers.includes(L.id) ? ' class="on"' : '') + '></i>').join('') + '</div></td></tr>').join('');

const isOpen = (p) => ['proposed', 'parked', 'open', 'task', 'pending'].includes(p.status);
const sections = [...new Set(D.proposals.map((p) => p.section))];
const proposalCards = sections.map((s) =>
  '<div class="card"><h3>' + esc(s) + '</h3><ul class="plist">' +
  D.proposals.filter((p) => p.section === s).map((p) => '<li' + (isOpen(p) ? '' : ' class="done"') + '><span class="num">' + p.n + '</span>' + esc(p.title) + ' <span class="pill' + (isOpen(p) ? ' gap' : '') + '">' + p.status + '</span></li>').join('') + '</ul></div>').join('');

document.getElementById('app').innerHTML =
'<header><a class="back" href="./">← The 3D atlas</a><h1>Atlas of Influence: framework map</h1>' +
'<p class="lede">What the model covers today, what evidence stands behind it, and what it does not cover yet. Built ' + D.built + ' from the files in data/ and docs/.</p>' +
'<div class="stats">' + stat(F.layers.length, 'layers') + stat(F.mechanisms.length, 'mechanisms') + stat(F.cases.length, 'cases') +
  stat(D.narratives.length, 'narratives') + stat(D.totals.evidence, 'evidence rows') + stat(D.totals.sources, 'sources') + stat(D.totals.snapshots, 'with a snapshot') + stat(D.proposals.filter((p) => ['proposed', 'parked', 'open', 'task', 'pending'].includes(p.status)).length, 'proposals still open') + '</div></header>' +

'<section><h2>The pipeline, from the world to the screen</h2>' +
'<p class="lede">Each column is a layer; each box is a mechanism, placed where it starts. An arrow marks a mechanism that acts on another layer. Pick a case to see its path. ' + unusedMechs + ' of ' + F.mechanisms.length + ' mechanisms are not used by any case.</p>' +
'<div class="picker" id="picker"><button data-case="" aria-pressed="true">All</button>' + F.cases.map((c) => '<button data-case="' + c.id + '" aria-pressed="false">' + esc(c.title) + '</button>').join('') + '</div>' +
'<div class="scroll"><div class="pipeline" id="pipeline">' + pipeline + '</div></div>' +
'<div class="loops"><b>Feedback loops</b>' + F.loops.map((l) => '<span' + (l.status === 'proposed' ? ' class="dashed"' : '') + '>' + l.from + ' → ' + l.to + ' ' + esc(l.name) + (l.status === 'proposed' ? ' (proposed)' : '') + '</span>').join('') + '</div></section>' +

'<section><h2>Extended forms of influence</h2><p class="lede">Influence that works beneath or around the pipeline. Recorded with its evidence, not drawn in the 3D model for now.</p>' +
'<div class="scroll"><table><thead><tr><th>Form</th><th>Evidence</th></tr></thead><tbody>' +
F.extended.map((x) => '<tr><td><b>' + esc(x.name) + '</b><br><span class="mono" style="color:var(--muted)">' + x.id + '</span></td><td class="mono">' + x.evidence.join(' ') + '</td></tr>').join('') + '</tbody></table></div></section>' +

'<section><h2>Cases</h2><p class="lede">A case is an ordered path through the layers. Click a row to light its path above.</p>' +
'<div class="scroll"><table><thead><tr><th>Case</th><th>Countries</th><th>Transparency</th><th>Layers L1 to L7</th><th>Evidence rows</th><th>Status</th></tr></thead><tbody>' + caseRows + '</tbody></table></div></section>' +

'<section><h2>Evidence behind the model</h2>' +
'<p class="lede"><b style="color:var(--ink)">' + modelled + ' of ' + D.totals.evidence + ' evidence rows are cited by a case.</b> The other ' + (D.totals.evidence - modelled) + ' are logged but not yet used in a case; some are unread, some await a case of their own.</p>' +
'<div class="two"><div class="bars"><h3>By confidence grade</h3>' + gradeBars + '<h3 style="margin-top:14px">By how the source was read</h3>' + readBars + '<p class="lede" style="font-size:13px">' + D.responses + ' responses from the people and organisations named are recorded alongside.</p></div>' +
'<div class="bars"><h3>By topic</h3><div class="legend"><span><i style="background:var(--accent)"></i>topic has a case</span><span><i style="background:var(--gap-ink)"></i>no case yet</span></div>' + groupBars + '</div></div></section>' +

'<section><h2>What a case records</h2><div class="cards">' +
'<div class="card"><h3>Five dimensions</h3><dl>' + F.dimensions.map((d) => '<dt>' + esc(d.name) + '</dt><dd>' + esc(d.question) + '</dd>').join('') + '</dl></div>' +
'<div class="card"><h3>Attributes of each use</h3><dl>' + F.attributes.map((a) => '<dt>' + esc(a.name) + '</dt><dd>' + esc(a.values.join(' · ')) + '</dd>').join('') + '</dl></div>' +
'<div class="card"><h3>Actor kinds, by sphere</h3><dl>' + F.actor_groups.map((g) => '<dt>' + esc(g.name) + '</dt><dd>' + esc(g.kinds.join(' · ')) + '</dd>').join('') + '</dl></div>' +
'<div class="card"><h3>Relation kinds</h3>' + chips(F.relation_kinds) + '<h3>Highlights over the network</h3><dl>' + F.overlays.map((o) => '<dt>' + esc(o.name) + '</dt><dd>' + esc(o.shows) + '</dd>').join('') + '</dl></div>' +
'<div class="card"><h3>Effect targets</h3>' + chips(F.effect_targets) + '<h3>Kept in the source details, not drawn</h3><ul class="plain">' + F.source_details.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' +
'</div></section>' +

'<section><h2>The Influence Facts sheet</h2><p class="lede">What a visitor sees on tapping an app. Each line is computed from evidence, not scored by hand; the method is still open.</p><div class="cards">' +
F.facts_sheet.map((p) => '<div class="card"><h3>' + esc(p.part) + '</h3><dl>' + p.lines.map((l) => '<dt>' + esc(l.name) + '</dt><dd>' + esc(l.term) + '</dd>').join('') + '</dl></div>').join('') + '</div></section>' +

'<section><h2>Narratives</h2><p class="lede">Storylines in circulation that link paths sharing no contract. Each is recorded only when a source names it, and worded as a claim, not judged true or false.</p>' +
'<div class="scroll"><table><thead><tr><th>Claim in circulation</th><th>Carried by</th><th>Evidence</th></tr></thead><tbody>' +
D.narratives.map((n) => '<tr><td><b>' + esc(n.title) + '</b><br><span class="mono" style="color:var(--muted)">' + n.id + '</span></td><td>' + n.carriers.map(esc).join('<br>') + '</td><td class="mono">' + n.evidence.join(' ') + '</td></tr>').join('') + '</tbody></table></div></section>' +

'<section><h2>Frameworks it builds on</h2><div class="scroll"><table><thead><tr><th>Framework</th><th>Layers L1 to L7</th></tr></thead><tbody>' + frameworkRows + '</tbody></table></div></section>' +

'<section><h2>Not covered yet</h2><p class="lede">' + D.proposals.filter((p) => isOpen(p)).length + ' of ' + D.proposals.length + ' proposed changes are still open; the rest are ruled on. Numbers match docs/proposed-changes.md.</p>' +
'<div class="cards">' + proposalCards + '</div>' +
'<div class="cards"><div class="card"><h3>Balance gaps</h3><ul class="plain">' + F.balance_gaps.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' +
'<div class="card"><h3>Open questions</h3><ul class="plain">' + F.open_questions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul></div></div></section>' +
'<footer>Generated from data/ and docs/ in the project repository on every build.</footer>';

function pick(id) {
  const c = caseById[id];
  const p = document.getElementById('pipeline');
  p.classList.toggle('picked', !!c);
  p.querySelectorAll('.layer').forEach((el) => el.classList.toggle('on', !!c && c.layers.includes(el.dataset.layer)));
  p.querySelectorAll('.mech').forEach((el) => {
    el.classList.toggle('key', !!c && c.key_mechanisms.includes(el.dataset.mech));
    el.classList.toggle('path', !!c && c.path_mechanisms.includes(el.dataset.mech));
  });
  document.querySelectorAll('#picker button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.case === (c ? id : ''))));
  document.querySelectorAll('.caserow').forEach((r) => r.classList.toggle('sel', !!c && r.dataset.case === id));
}
document.getElementById('picker').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(b.dataset.case); });
document.querySelectorAll('.caserow').forEach((r) => {
  const go = () => { pick(r.classList.contains('sel') ? '' : r.dataset.case); document.getElementById('picker').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  r.addEventListener('click', go);
  r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});
</script>
</body>
</html>
`;

const out = join(root, 'app', 'public', 'framework.html');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html.replace('__DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c')));
console.log(`Wrote ${out}`);
console.log(`${data.totals.evidence} evidence rows, ${proposals.length} proposals, ${data.groups.length} evidence groups.`);
