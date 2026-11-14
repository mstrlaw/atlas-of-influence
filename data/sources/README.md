# Source snapshots

Screenshots of the web pages cited in the evidence log, kept so each source can be shown inside the atlas and still be checked if the link dies or the page changes.

## Layout

```
data/sources/
  index.json        one entry per unique source URL (generated, see below)
  S001/             one folder per source, named by its ID in index.json
    screenshot.png  the snapshot (any name; several files are fine)
    text.md         optional pasted article text, for reading only (not committed)
```

## Adding a snapshot

1. Find the source in `index.json` by its URL and note its ID, for example `S014`.
2. Create the folder `data/sources/S014/` and save the screenshot in it. Use a full-page capture as PNG, JPEG or WebP; a saved PDF also works. For a long page, several files named in reading order (`1.png`, `2.png`) are fine.
3. In `index.json`, set `captured` to the date the screenshot was taken (`YYYY-MM-DD`). Optionally set `archive_url` to a Wayback Machine or archive.today copy.
4. Run `node scripts/sources-index.mjs` from the repo root. It lists the new files under the source and reports how many sources still lack a snapshot.

## index.json

Run `node scripts/sources-index.mjs` after any change to `data/evidence.json`. A new URL gets the next free ID; existing IDs never change.

| Field | Meaning | Maintained by |
|---|---|---|
| `id` | Stable source ID, also the folder name | script |
| `url` | The cited page | script, from `evidence.json` |
| `publisher` | Site hostname | script |
| `evidence` | Evidence rows (`E##`) that cite this URL | script |
| `files` | Snapshot files found in the source's folder | script |
| `captured` | Date the snapshot was taken | by hand |
| `archive_url` | Public archive copy of the page | by hand |
| `notes` | Anything worth knowing: paywall, partial capture, page since changed | by hand |

## Copyright

The snapshots reproduce third-party pages. They are kept as a record of what a source said on a given date. They remain the property of their publishers and are **not** covered by this repository's CC BY 4.0 licence.
