# Atlas of Influence

Maps how actors, institutions, platforms, AI models and crowds shape what appears on a phone screen. Two parts: a conceptual model (`docs/`, `data/`) and a 3D web app that will visualise it (`app/`). Read `HANDOVER.md` for full background, the model summary, open questions and the phased plan.

## Standing rules from the user

- **Discuss before changing the model.** When the user shares links, analyse how they fit or change the model and discuss; do not edit `docs/framework-spec.md` unprompted.
- **Phase 2 is under way** (user go-ahead, 14 Nov 2026): the 3D atlas is drawn from the model in `data/`. The renderer knows nothing about specific companies; to change what is shown, change the data.
- **Log every source the user provides** in `data/evidence.json` (next ID: **E190**), following `docs/source-analysis.md`: one grade (documented / reported / claimed / contested / opinion), a `read_status` (full / partial / secondhand / unread), an optional `note`, any `responses` from those named, and a `visual_use` note. Regenerate `data/evidence.md` with `node scripts/evidence-md.mjs`, then run `node scripts/sources-index.mjs`; never hand-edit the markdown table.
- Academic grounding: reuse existing frameworks and their IDs (DISARM, ABC/ABCDE, etc.) rather than inventing vocabulary.
- Balance: mechanisms are ideology-agnostic; cases span actor origins and the political spectrum; name intermediaries without implying culpability unless a source does.
- Decided 14 Nov 2026 (replaces 9 Nov): "mainstream" means an established news institution, not reach. The Joe Rogan Experience is an `influencer` with very large reach, not mainstream media.
- **The repo is the source of truth for the model** (decided 13 Nov 2026): `docs/framework-spec.md` is the master and `data/framework.json` mirrors its structure. Change the spec first, then the JSON.
- **Scope** (decided 13 Nov 2026): the whole network of influence, centred on the digital ecosystem; offline events are in scope when they cascade into it.
- `docs/proposed-changes.md` lists 44 proposed changes with a Decisions section; the user is ruling on them one at a time. Record each ruling there.

- **Never push to `main`.** All commits and pushes go to a branch; `main` deploys to production. Changes reach `main` by merging a branch.
- **The repo is public.** Never commit secrets, personal data or private links. Pasted article text stays in git-ignored `data/sources/*/text.md`.
- Phase 2 design decision (13 Nov 2026): cases, narratives and owners are selected from a UI control, not from 3D objects; the scene responds with colour and highlights.
- **One atlas, always whole** (user, 14 Nov 2026): every platform, sphere and actor is in the scene at all times, in a fixed place. Exploring an app, case, narrative or owner must never add, remove or move an object; it only changes what is highlighted and where the camera looks. The layout is computed once from all the data (`atlasGraph()` in `app/src/data/model.ts`, `layoutNetwork()` in `app/src/scene/layout.ts`).
- Working pattern (user, 14 Nov 2026): the 3D model shows who is connected to what and how. How sure we are, who knew, who attributed it, what it cost and what people replied live in the source details and case text.
- Phase 2 design decision (13 Nov 2026): confidence grades are not drawn in 3D. Evidence is the appendix a reader can open: sources, grades, their meaning and how each was analysed.
- Modelling preference (user, 13 Nov 2026): do not add a distinct shape, kind or layer for something that existing actors and mechanisms can carry; explain what makes it distinctive in the case's text. Things real but not worth drawing go under "Extended forms of influence" in the spec.

## Layout

```
HANDOVER.md              handover from the chat session (13 Nov 2026); background, not kept current
docs/framework-spec.md   model spec (source of truth)
docs/source-analysis.md  how sources are read and graded, with a reusable prompt (v0.1, to be strengthened)
docs/proposed-changes.md 44 proposed changes and the decisions taken
data/evidence.json       evidence log, E01–E189 (edit this)
data/evidence.md         generated table of the same
data/sources/            source snapshots, one folder per source (see its README); index.json is generated
data/narratives.json     narratives (rule: only when a source names one; worded as a claim in circulation)
data/framework.json      layers, mechanisms, actor groups, Influence Facts lines; mirror spec changes here
data/actors.json         actors (platforms on the phone carry an `app` block)
data/relations.json      standing relations (owns, funds, pays, regulates…), each citing evidence
data/cases.json          cases: ordered steps citing evidence rows; `@app` = the platform being viewed, `screen` = the phone
scripts/                 evidence-md, sources-index, framework-map, validate-model (plain Node, no dependencies)
app/public/framework.html generated framework map (git-ignored), served at /framework; built by `npm run dev` and `npm run build`
app/                     3D Platform Atlas: Vite + TypeScript + three.js, gsap, d3-force-3d
app/src/                 data/model.ts (reads /data), scene/ (stage, phone, platform, layout, network), ui/ (screen = phone sheet, panel = explore panel), state/store.ts (hash router)
```

All model data lives in the root `data/`; the app imports it from there. `npm run build` runs `scripts/validate-model.mjs` first and fails on a broken reference.

To check the atlas visually, build, run `npx vite preview`, and drive a headless browser in real time (the scene animates with real time; Chrome's `--virtual-time-budget` screenshots are unreliable for it).

## App commands (run in `app/`)

```bash
npm ci
npm run dev       # Vite dev server
npm run build     # tsc --noEmit && vite build → dist/index.html (one self-contained file)
npm run preview   # serve the built file
npm run deploy    # manual deploy via wrangler (normally not needed)
```

Always run `npm run build` before committing app changes: it type-checks, and a failing build fails the deployment.

Design rule: the renderer knows nothing about specific companies; everything comes from the JSON.

## Deployment

Cloudflare builds and deploys whenever `main` changes on GitHub, which happens only by merging a branch (Workers Builds, static assets only, no Worker script). Config is `app/wrangler.jsonc`; Cloudflare's root directory is `app`, build command `npm run build`, deploy command `npx wrangler deploy`. Only `app/dist/` is published: the 3D app (`index.html`) and the framework map (`framework.html`), which is generated from `data/` and `docs/` at build time. The raw `docs/` and `data/` files are not served. Do not restrict Cloudflare's build watch paths to `app/*`, or data changes will not redeploy the map. Node version is pinned in `app/.node-version`.
