# Dropbox-Media

Stream your personal Dropbox media library in Stremio and Nuvio - direct
links, external players, no browser playback.

## How it fits together

```
Stremio ──→ db-addon (CF Worker, addon.js) ──INDEX service binding──→ db-index (CF Worker) ──→ Dropbox API
Nuvio   ──→ plugin.js (on-device QuickJS) ─────────────────────────→ db-index (CF Worker) ──→ Dropbox API
```

- **db-index** (`dropbox-index.js`) indexes the Dropbox library and serves
  a minimalist HTML directory browser, a JSON API (`/api/...`), and search.
  Direct Dropbox API calls per request - no KV, no cron.
- **db-addon** (`addon.js`) is the Stremio addon (TMDB id -> streams) and
  also hosts the Nuvio plugin repository (`/plugin/...`).
- **plugin.js** is the Nuvio provider source of truth; a byte-exact mirror
  of it is embedded inside `addon.js` and kept in sync automatically by CI.
- Streams download with `attachment` and support HTTP Range - they hand
  off to VLC/MPV or any external player, never inline browser playback.

## Repo map

| Path | What it is |
|---|---|
| `dropbox-index.js` | db-index worker source (HTML index + JSON API + search) |
| `addon.js` | db-addon worker source (Stremio addon + Nuvio plugin repo) |
| `plugin.js` | Nuvio provider (runs on-device in QuickJS) |
| `manifest.json` | Nuvio plugin repository manifest (points at plugin.js) |
| `scripts/sync_mirror.py` | regenerates the embedded plugin mirror in addon.js |
| `scripts/deploy_worker.py` | Cloudflare API deploy script (used by CI) |
| `.github/workflows/deploy.yml` | CI: check, sync, deploy, verify |
| `DEVELOPMENT.md` | conventions, endpoints, project rules (read before changing code) |
| [docs/](docs/) | vendored guides + platform research (see below) |

## Deploy

Push to `main` - GitHub Actions does the rest: syntax check, mirror sync,
deploys both workers, verifies the live endpoints. Manual runs work from
the Actions tab. Required repo secrets are listed in
[DEVELOPMENT.md](DEVELOPMENT.md).

- Stremio addon: `https://db-addon.gdrive3523.workers.dev/manifest.json`
- Nuvio plugin repo: `https://db-addon.gdrive3523.workers.dev/plugin/manifest.json`
- Web index: `https://db-index.gdrive3523.workers.dev/`

## Dropbox layout expected

```
Stream/movie/Movie Title (Year)/file.mkv
Stream/tv/Show Name (Year)/Season 01/Show S01E01.mkv
```

Series folders are scanned recursively (up to 3 levels) so release
subfolders under an episode folder are picked up too. Optional
`.srt`/`.vtt` subtitles next to a video file are attached automatically.

## Docs

| Doc | Contents |
|---|---|
| [DEVELOPMENT.md](DEVELOPMENT.md) | architecture, conventions, deploy flow, on-device rules |
| [docs/stremio/](docs/stremio/) | official Stremio addon guide (vendored) |
| [docs/nuvio-provider-guide.md](docs/nuvio-provider-guide.md) | Nuvio provider guide (vendored) |
| [docs/stremio-overview.md](docs/stremio-overview.md) | Stremio platform research |
| [docs/nuvio-overview.md](docs/nuvio-overview.md) | Nuvio platform research |
| [docs/community-resources.md](docs/community-resources.md) | community guides, catalogs, ecosystem roles |
| [docs/research-sources.md](docs/research-sources.md) | every source analyzed, with verdicts |
