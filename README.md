# Atlas of Influence

A learning tool that maps how actors, institutions, platforms, AI models and crowds shape what appears on a phone screen, and what that does to the reader.

- `docs/`, `data/`: the conceptual model and its evidence log.
- `app/`: the 3D "Platform Atlas" web app (Vite, TypeScript, three.js). Its content is still placeholder data.

See `HANDOVER.md` for background and `CLAUDE.md` for working rules.

## Develop

Requires Node 22.12 or later.

```bash
cd app
npm ci
npm run dev
```

`npm run build` type-checks and writes a single self-contained `app/dist/index.html`.

## Deploy

The app is a static site on Cloudflare, rebuilt by Cloudflare on every push to `main`.

One-time setup in the Cloudflare dashboard:

1. Workers & Pages → Create → Import a repository, and pick this GitHub repository.
2. Project name: `atlas-of-influence` (must match `name` in `app/wrangler.jsonc`).
3. Root directory: `app`
4. Build command: `npm run build`
5. Deploy command: `npx wrangler deploy`
6. Optional: under Build → Build watch paths, include only `app/*` so edits to `docs/` and `data/` do not trigger a deploy.

Only `app/dist/` is published.

## Licence

[Creative Commons Attribution 4.0 International](LICENSE) (CC BY 4.0).
