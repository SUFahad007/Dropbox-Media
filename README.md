# dropbox-media

Stream your Dropbox media library in Stremio and Nuvio.

Three components, one folder:

## Files

| File | What it is | Where it goes |
|------|-----------|---------------|
| `dropbox-index.js` | Cloudflare Worker — indexes your Dropbox, serves HTML browsing + JSON API + search | Cloudflare Worker (`dropbox-index`) |
| `stremio.js` | Stremio addon — resolves TMDB ids to Dropbox streams | Cloudflare Worker (addon) |
| `nuvio.js` | Nuvio plugin — same streams, direct fetch, no proxy | GitHub repo → Nuvio sideload |
| `manifest.json` | Nuvio plugin manifest | GitHub repo root, next to `nuvio.js` |

## How it fits together

```
Stremio ──→ stremio.js (CF Worker) ──→ dropbox-index.js (CF Worker) ──→ Dropbox API
Nuvio   ─────────────────────────────→ dropbox-index.js (CF Worker) ──→ Dropbox API
```

- `dropbox-index.js` maps TMDB titles to your `Movies/` and `Shows/` folders
  and returns direct stream URLs. Uses `/api/search` (1 request) with
  fallback to folder listing + fuzzy matching (2 requests).
- `stremio.js` goes through a proxy (same-account CF Workers can't fetch
  each other directly); `nuvio.js` fetches the index directly — no proxy hop.
- Streams are marked `notWebReady` — they hand off to VLC/MPV or your
  external player instead of browser playback.

## Which file for which app

- **Stremio** → `stremio.js` (deployed to a Cloudflare Worker)
- **Nuvio** → `nuvio.js` (native plugin, preferred — direct fetch, no proxy)
- **Nuvio also supports Stremio addons**, so `stremio.js` works there as a
  fallback — but it re-adds the proxy hop, so `nuvio.js` is the better
  choice in Nuvio.

## Deploy

1. **Index worker** — paste `dropbox-index.js` into your `dropbox-index`
   Cloudflare Worker. Secrets: `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
   `DROPBOX_REFRESH_TOKEN`. KV binding: `DROPBOX_CACHE`. Cron: `*/5 * * * *`.
2. **Stremio addon** — paste `stremio.js` into your addon Cloudflare Worker.
3. **Nuvio plugin** — push `nuvio.js` + `manifest.json` to your GitHub repo,
   install it in Nuvio via Install Plugin Repository.

Deploy the index worker first — the addon/plugin fall back to the old
listing approach if `/api/search` isn't there yet, but search is faster.

## Folder structure expected in Dropbox

```
/Movies/Movie Title (Year)/file.mkv
/Shows/Show Name (Year)/Season 01/Show S01E01.mkv
```

Optional `.srt`/`.vtt` subtitles next to a video file are picked up
automatically (same filename, different extension).
