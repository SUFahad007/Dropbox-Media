# Development Guide

Reference docs for building the two halves of this project, plus the
project-specific rules we've settled on.

## Official reference docs (vendored in this repo)

| Doc | Source | For |
|---|---|---|
| [docs/stremio/](docs/stremio/) | [Stremio/stremio-addon-guide](https://github.com/Stremio/stremio-addon-guide) (official) | `addon.js` - Stremio addon |
| [docs/nuvio-provider-guide.md](docs/nuvio-provider-guide.md) | [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers) | `plugin.js` - Nuvio provider |

Read them in this order:
- Stremio: `intro.md` -> `basics.md` -> `step1.md` ... `step8.md`
- Nuvio: the single guide covers the full provider lifecycle.

## What lives where

| File | Runs on | Serves |
|---|---|---|
| `dropbox-index.js` | Cloudflare worker `db-index` | JSON directory API over Dropbox (`/api/...`) |
| `addon.js` | Cloudflare worker `db-addon` | Stremio addon (`/manifest.json`, `/stream/...`) and the Nuvio plugin repo (`/plugin/manifest.json`, `/plugin/plugin.js`) |
| `plugin.js` | Nuvio on-device (QuickJS) | the Nuvio provider source of truth |

**The embedded plugin mirror inside `addon.js` must be an exact copy of `plugin.js`.**
After any change to `plugin.js`, regenerate the mirror from it before deploying.
The two files must never drift.

## Deployed endpoints

- Index: `https://db-index.gdrive3523.workers.dev` (Cloudflare account: Gdrive3523)
- Stremio addon: `https://db-addon.gdrive3523.workers.dev/manifest.json`
  (installed in Stremio WITH the `/manifest.json` suffix; without it Stremio rejects it)
- Nuvio repo: `https://db-addon.gdrive3523.workers.dev/plugin/manifest.json`

Worker-to-worker calls must go through the `INDEX` service binding in `db-addon`
(workers.dev workers cannot fetch each other's public URLs - Cloudflare error 1042).

## Project conventions (learned on-device, treat as law)

- Dropbox layout: `Stream/movie/` and `Stream/tv/` with `Title (Year)` folders,
  seasons as `Season 01` (zero-padded). Multiple copies of a season live as
  sibling subfolders inside the season folder - episodes directly inside them.
- The addon/plugin is stream-only: catalog and metadata come from other addons.
- Nuvio quirks (QuickJS on-device):
  - no `setTimeout`/`setInterval` - guard with feature detection
  - send URLs with raw spaces - do NOT encode paths in the plugin's fetch
  - subtitles go top-level: `{url, language, name}`; `size` must be a string
  - on-device results are ground truth over Node/curl simulations
- Stremio quirks:
  - supports HTTP Range on stream URLs; playback headers come from the addon
- Keep the aesthetic minimal: text-first, white background, no URL prefixes.

## Making changes

1. Edit `plugin.js` and/or `addon.js` (and `dropbox-index.js` for index changes).
2. `node --check` every changed file.
3. Regenerate the embedded mirror in `addon.js` from `plugin.js`.
4. Sync to GitHub and deploy both workers.
5. Verify against a real show/movie on-device - server-side curl is not enough.
