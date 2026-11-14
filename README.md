# Atlas of Influence

A map of how actors, platforms, AI models and crowds shape what appears on a phone screen, and what that does to the person reading it. Every claim in it is a sourced path through a shared model, not an accusation.

Live at [atlas.criticalfuture.tech](https://atlas.criticalfuture.tech).

## What you can do in it

1. **Tap an app** on the phone. Its *Influence Facts* sheet shows what the atlas holds on that app, line by line: how many cases, and how many sources behind them. A line with nothing reads "Not yet examined".
2. **Explore what's behind it.** The camera pulls back to show the whole atlas behind the phone: a wall of platforms, then everything that feeds them. Crowds are nearest, media and the influence industry in the middle, owners and states furthest back, regulators and researchers above. Every platform and actor is always there, in the same place. What you explore decides what is lit, not what exists.
3. **Choose what to follow** in the panel: a *case* (an example of influence, played step by step as a path), a *narrative* (a storyline carried by actors who may be unrelated) or an *owner* (everything one actor controls). The scene lights up what you chose, everything else turns pale, and the camera moves to it.
4. **Check the sources.** Every step lists the evidence it rests on. Each source shows a link, a grade for what the fact rests on, and whether the source was read in full.

There is also a [framework page](https://atlas.criticalfuture.tech/framework) that shows the whole model on one screen: layers, mechanisms, cases, evidence and open questions.

## How it is built

The model is data. The 3D atlas and the framework page are two views of it.

```
docs/framework-spec.md     the model, in words: the source of truth
docs/source-analysis.md    how sources are read and graded, with a reusable prompt
docs/proposed-changes.md   every proposed change to the model and how it was decided

data/evidence.json         the evidence log: one fact per row, with source, grade and read status
data/evidence.md           the same as a table (generated)
data/framework.json        layers, mechanisms, actor groups, Influence Facts lines (mirrors the spec)
data/actors.json           who appears in the atlas
data/relations.json        who owns, funds, pays or regulates whom
data/cases.json            the cases: ordered steps, each citing evidence rows
data/narratives.json       storylines that sources name
data/sources/              one folder per source, for screenshots (see its README)

scripts/                   generators and checks (plain Node, no dependencies)
app/                       the 3D atlas: Vite, TypeScript, three.js
```

Reading order for someone new: this file, then `docs/framework-spec.md`, then one case in `data/cases.json` next to the rows it cites in `data/evidence.md`.

## Run it

Requires Node 22.12 or later.

```bash
cd app
npm ci
npm run dev      # checks the model, builds the framework page, starts the dev server
npm run build    # the same checks, a type-check, then app/dist/
```

`npm run build` fails if a case refers to an actor, mechanism or evidence row that does not exist.

## Add to it

**A source.** Add rows to `data/evidence.json` following `docs/source-analysis.md` (one fact per row, one grade, a read status). Then run:

```bash
node scripts/evidence-md.mjs      # regenerates data/evidence.md
node scripts/sources-index.mjs    # gives a new URL its source ID
```

**A case.** Add a record to `data/cases.json`: a summary in plain words and an ordered list of steps. Each step names an actor, the mechanism it uses, whom it acts on, and the evidence rows that support it. New actors go in `data/actors.json`. Run `node scripts/validate-model.mjs` to check every reference.

**A change to the model itself** (a layer, a mechanism, a rule) starts in `docs/framework-spec.md`, and is then mirrored in `data/framework.json`.

## What it does not claim

- **Grades describe the basis of a fact, not its truth.** A denial is graded "claimed" for the same reason an unverified accusation is.
- **Counts measure the atlas, not the platform.** A platform with many cases has been studied and sued more; one with none has not been examined yet.
- **Being named is not an accusation.** Many actors in a path did not know what they were carrying, and each case says what the sources establish about that.
- **Sources are read by an AI model** working with the maintainer. `docs/source-analysis.md` describes the method and its limits.

## Deploy

The site is static and hosted on Cloudflare, which rebuilds it whenever `main` changes. Work happens on branches; `main` changes only by merging one.

Cloudflare settings: root directory `app`, build command `npm run build`, deploy command `npx wrangler deploy`. Leave build watch paths at the default, because the site is built from `data/` and `docs/` as well as `app/`. Only `app/dist/` is published.

## Licence

[Creative Commons Attribution 4.0 International](LICENSE) (CC BY 4.0). Screenshots of third-party pages under `data/sources/` remain the property of their publishers and are not covered by this licence.
