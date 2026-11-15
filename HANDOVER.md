# Atlas of Influence — project handover

Handover date: 13 Nov 2026. From: Claude chat/cowork session. To: a code session taking over the project.

> Historical background, not kept current. Since 13 Nov 2026 the repository is the source of truth for the model (`docs/framework-spec.md`); the working document described in §3.1 is retired. See `CLAUDE.md` and `README.md` for the current state.

## 1. What this project is

The **Atlas of Influence** maps how actors, institutions, platforms, AI models and crowds shape what appears on a phone screen, and what that does to the mind of the person reading it. It is a learning tool: every claim is a sourced path through a shared model, never an accusation.

It has two parts:

1. **A conceptual model/framework** (seven-layer pipeline, mechanism catalogue, data model, cases, evidence). This is where all current work is. It lives in a Claude Docs doc and is mirrored in `docs/` and `data/`.
2. **A 3D "Platform Atlas" web app** (three.js + Vite + TypeScript) that visualises it. It was built first, with placeholder content, and is **not yet driven by the model**. It is in `app/`.

## 2. The user's standing instructions (keep following these)

- Academically grounded cataloguing; reuse existing frameworks and their IDs rather than inventing vocabulary.
- **Discuss before changing the model.** When the user shares links, analyse how they fit or change the model and discuss; do not edit the model unprompted.
- **Log everything the user provides** in the evidence log (next ID is **E84**), graded and tagged for visual use.
- **Do not edit the 3D atlas until the model is settled.** The user said: "We're just refining the model/framework itself." Phase 2 (below) starts only on their go-ahead.
- Keep cases and evidence stored so they can later be represented visually in the 3D model.
- Classification decision: **the Joe Rogan Experience is mainstream media** (decided 9 Nov 2026).
- Balance matters: mechanisms are ideology-agnostic; cases should span actor origins and the political spectrum; name intermediaries without implying culpability unless a source does.

## 3. Current state

### 3.1 The living doc (source of truth for the model)

A private working document, "Atlas of Influence — Framework Spec", with two tabs:

- Main tab: the framework spec. Mirrored in `docs/framework-spec.md` (the embedded pipeline diagram widget is described in text there).
- Evidence log: 83 rows. Mirrored in `data/evidence.json` and `data/evidence.md`.

One doc comment is open: rename the Influence Facts groups (see open question 2).

If the code session cannot reach the doc, the mirrors in this package are the working copy; any model changes made there should be pasted back into the doc once access is restored.

### 3.2 The model in brief

- **Five dimensions** (the early sketch's single axis was split): Actor, Mechanism, Layer, Effect, Case. A Case is an ordered path actor → mechanism → layer → … → screen → effect.
- **Seven layers:** L1 Structure (ownership, funding), L2 Production, L3 Entry (direct posting or web, later scraped), L4 Mediation (ranking, search, moderation, ads; for LLMs: corpus, retrieval, owner tuning, output loop), L5 Crowd, L6 Interface, L7 Mind. Two feedback loops: crowd → ranking, LLM output → re-scrape.
- **Four attributes per case step:** Intent (structural / ideological / adversarial), Transparency (overt / undisclosed / deceptive), Coordination, Origin.
- **30 mechanisms** with stable IDs (`llm.retrieval`, `fund.covert`, `prod.front`, …) and framework references. DISARM technique IDs are not filled in yet.
- **Data model:** Layer, Actor, Mechanism, Venue, Effect, Source, Relation, Case (see `docs/framework-spec.md`). Confidence is per step: documented / reported / claimed (+ contested, opinion, pending text in the log).
- **Frameworks:** DISARM, ABC/ABCDE, Wardle & Derakhshan, Herman & Chomsky, Entman, McCombs & Shaw, DiResta, Giussani, Benkler/Faris/Roberts, Starbird, Woolley & Howard.
- **Seven seed cases:** Hanover Institute, Clock Tower X, Pravda network, Tenet Media, STOIC/Zero Zeno, Sinclair must-runs, Grok tuning. The first five are evidenced; Sinclair and Grok are only partly sourced.

### 3.3 Evidence log

83 entries (E01–E83) in `data/evidence.json`, fields: `id, case, fact, source, url, source_type, confidence, visual_use`. Grades: documented / reported / claimed / contested / opinion / pending text. Notes:

- Entries marked "unread" or "pending text" rest on second-hand coverage or a blocked page: E33, E39, E40, E48, E52, E55, E62, E65, E66, E70, E74, E81 (the Washington Post Loomer article, blocked), and several Guardian/NPR items (E67, E77, E78). Read the primary text when possible and regrade.
- E01 ($100,000, Politico) and E11 ($1M, Guardian) are reconciled: $100,000 covers a dozen-plus articles in one disclosure; $1M is Piro's total across two work orders.
- E81–E83 (Loomer) were added 13 Nov 2026 and are the newest.
- Balance gaps already noted: China (only E48), Iran's own operations, the Pentagon's fake-account campaign, left-leaning ownership directives.

### 3.4 Proposed changes (decisions pending)

`docs/proposed-changes.md` lists 40 proposed changes across structure, entities, attributes, evidence, effects, scope and catalogue. **None has been applied and the user has not yet ruled on them.** The last question put to the user was whether to add the list to the doc as a "Proposed changes" section so each item can be marked accept / reject / defer. Recommended first batch: 8 (Narrative entity), 1 (suppression family), 14 (merge concept spheres into actor kinds), 9–10 (sources as actors; countervailing actors), 22–24 (confidence values, read status, actor response); then 34–35 (granularity, time).

### 3.5 Open questions

1. Giussani's chapter-level attack-vector list is not yet shared or mapped.
2. Influence Facts taxonomy: Attention / Perception / Autonomy + Trust (Giussani) or Harms / Polarization / Incentives (current)?
3. Drop Site's chatbot-query methodology, to grade Clock Tower X's effect evidence.
4. Should countervailing actors appear as cases of their own?
5. Link directionality and nested concepts in the JSON.
6. Score aggregation for the Facts sheet; "mainstream" criteria; scope boundary (information influence only, or broader harms?).

## 4. The 3D app (`app/`)

### 4.1 Run it

```bash
cd app
npm install
npm run dev        # Vite dev server
npm run build      # tsc --noEmit && vite build → dist/index.html (single self-contained file, ~760 kB)
```

Verified on 13 Nov 2026: `npm run build` passes. `app/platform-atlas.built.html` is the last delivered build (7 Nov 2026). Stack: TypeScript, Vite, three.js 0.187, gsap, d3-force-3d, vite-plugin-singlefile. No git repo exists yet; initialise one.

### 4.2 What it does

A phone sits at the origin showing a home screen of app icons (TikTok, YouTube, Instagram, Facebook, X, ChatGPT, Google, NYT). Tapping one shows that app's **Influence Facts** sheet (scored 0–3 on six criteria in three groups: harms = attention, addiction; polarization = reality-warping, isolation; incentives = financial, ownership). "Explore what's behind" animates a transition: the phone turns slightly, the camera eases back and aside, and behind the phone the platform cube (with docked algorithm cubes and projection beams to the screen) and a force-directed **network** of entities appear hop by hop. Entities are cubes, concepts are emergent spheres drawn as outline rings around their members, and links feed into the platform through two entry gateways: "Direct posting" slab and a "WWW"/website sphere (scraping). Focusing an entity shows a caption.

State machine: HOME → APP → EXPLORE → FOCUS, mirrored in the URL hash (`#app-tiktok`, `#explore-x`, `#focus-x--entity`).

### 4.3 Code map (1,730 lines)

| File | Role |
|---|---|
| `src/main.ts` | Boot, camera/pose layouts, one-progress-value transition driving everything (GSAP), HUD, view-change handling |
| `src/state/store.ts` | View state machine + URL hash router |
| `src/data/types.ts`, `loader.ts` | Generic graph types (Entity, Concept, Link, Criteria, Atlas); JSON imported at build time with reference validation warnings |
| `src/scene/stage.ts` | Renderer, camera, resize, render loop |
| `src/scene/phone.ts` | Phone mesh; screen rect; `SCREEN_PX` 390×845 |
| `src/scene/domPainter.ts` | Paints the live DOM screen onto a canvas texture so the 3D screen matches the HTML pixel for pixel |
| `src/scene/platform.ts` | Platform cube, algorithm cubes, beams |
| `src/scene/layout.ts` | d3-force-3d layout; only entities are simulated, concept spheres are derived from member centroids; gateways, WWW sphere; seeded PRNG for deterministic pictures |
| `src/scene/network.ts` | Renders the layout: cubes, rings, links, billboard sprite labels; reveal by hop |
| `src/ui/screen.ts`, `styles.css` | Phone's DOM screen (home grid, facts sheet) |
| `data/entities.json` (18), `concepts.json` (5), `links.json` (26), `criteria.json` | Content |

Design rule: the renderer knows nothing about specific companies; everything comes from the JSON.

### 4.4 Data state: mostly placeholders

- 8 real entities: seven platforms and `nytimes` (all marked `draft: true`; scores are placeholders).
- 10 fictional placeholders (`government-a`, `regulator-a`, `agency-a`, `think-tank-a/b/c`, `publication-a/b`, `outlet-a/b`), and all 26 links are `placeholder: true`. Link kinds: content, syndication, oversight, affiliation, policy, cooperation.
- Entity fields: `id, name, kind, concepts[], onPhone, glyph, tint, algorithms[], summary, sheet{}, draft, ingest['publish'|'scrape'], hasWebsite, placeholder`. `sources[]` exists in the types but is unused.
- The 5 concepts (platforms, publications, mainstream-media, think-tanks, institutions) all have position `[0,0,0]`; the layout derives their placement.

## 5. Plan for the code session

### Phase 1: finish the model (no 3D edits)

1. Walk the user through `docs/proposed-changes.md`; record accept / reject / defer per item (suggested: put it in the doc as a "Proposed changes" section).
2. Apply accepted changes to the spec, one discussion at a time. Update `data/evidence.json` when new links arrive (IDs from E84; keep graded, with a "visual use" note).
3. Fill DISARM IDs; source the Sinclair and Grok rows; add Chinese and Iranian cases; read the "pending text" sources.
4. Encode the seven seed cases as `Case` records in JSON (new files, e.g. `data/cases.json`, `data/actors.json`, `data/mechanisms.json`, `data/layers.json`), validated by a schema. Do this inside the handover repo, not in `app/data`, until the user approves Phase 2.

### Phase 2: wire the model into the 3D atlas (only on the user's go-ahead)

Intended mapping (from the spec): layers become **depth bands** behind the phone; mechanisms **light up on edges**; a selected case **plays as an animated path** from L1 to the screen (money flowing down contract chains with `fund.disclosure_gap` edges dashed); **fronts** sit inside their concept sphere but are drawn as **hollow cubes**; proximate vs ultimate effects shown as two stages at the screen end; countervailing loops shown as returning edges; evidence rows with `visual_use` notes drive what is drawn. Needed engineering: extend `types.ts` (Actor kinds, Relation with covert/weight/sources, Case/steps), extend `layout.ts` for layer-banded z positions, add case playback to `network.ts`/`main.ts`, replace placeholder entities with real actors, add a sources panel (link out, show confidence grade), and a Facts sheet scoring derived from cases (needs the aggregation rule).

Open design questions carried over from the 3D work: link directionality, nested concepts, real logos vs icons.

## 6. Package contents

```
HANDOVER.md                this file
docs/framework-spec.md     snapshot of the main doc tab
docs/proposed-changes.md   the 40 pending changes
data/evidence.json         83 evidence rows, structured (edit this; regenerate evidence.md from it)
data/evidence.md           same, as a markdown table
app/                       the 3D app source (no node_modules/dist) + platform-atlas.built.html
```

Caveat: rows E01–E27 were transcribed by hand from the doc export and E28–E83 from the scripts used to insert them, so a quick diff against the doc's Evidence log is worthwhile. The doc itself is still the master until the user says otherwise.
