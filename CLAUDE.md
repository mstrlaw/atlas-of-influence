# Atlas of Influence

Maps how actors, institutions, platforms, AI models and crowds shape what appears on a phone screen. Two parts: a conceptual model (`docs/`, `data/`) and a 3D web app that will visualise it (`app/`). Read `HANDOVER.md` for full background, the model summary, open questions and the phased plan.

## Standing rules from the user

- **Discuss before changing the model.** When the user shares links, analyse how they fit or change the model and discuss; do not edit `docs/framework-spec.md` unprompted.
- **Do not edit the 3D atlas's content or visuals to reflect the model until the user gives the go-ahead for Phase 2.** Build, tooling and deployment work in `app/` is fine.
- **Log every source the user provides** in `data/evidence.json` (next ID: **E84**), graded (documented / reported / claimed / contested / opinion / pending text) and with a `visual_use` note. Regenerate `data/evidence.md` from the JSON; never hand-edit the markdown table.
- Academic grounding: reuse existing frameworks and their IDs (DISARM, ABC/ABCDE, etc.) rather than inventing vocabulary.
- Balance: mechanisms are ideology-agnostic; cases span actor origins and the political spectrum; name intermediaries without implying culpability unless a source does.
- Decided: the Joe Rogan Experience is classified as mainstream media (9 Nov 2026).
- The Claude Docs doc "Atlas of Influence — Framework Spec" is the master copy of the model until the user says otherwise; `docs/` and `data/` are mirrors. Model changes made here must be flagged so they can be synced back.
- `docs/proposed-changes.md` lists 40 proposed changes; none is applied or ruled on.

## Layout

```
HANDOVER.md              handover from the chat session (13 Nov 2026); background, not kept current
docs/framework-spec.md   model spec (mirror of the doc)
docs/proposed-changes.md 40 pending changes
data/evidence.json       evidence log, E01–E83 (edit this)
data/evidence.md         generated table of the same
app/                     3D Platform Atlas: Vite + TypeScript + three.js, gsap, d3-force-3d
app/data/*.json          app content (mostly placeholders), bundled at build time
app/src/                 see the code map in HANDOVER.md §4.3
```

New model data files (cases, actors, mechanisms, layers) go in the root `data/`, not `app/data/`, until Phase 2.

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

Cloudflare builds and deploys on every push to `main` on GitHub (Workers Builds, static assets only, no Worker script). Config is `app/wrangler.jsonc`; Cloudflare's root directory is `app`, build command `npm run build`, deploy command `npx wrangler deploy`. Only `app/dist/` is published; `docs/` and `data/` are not served. Node version is pinned in `app/.node-version`.
