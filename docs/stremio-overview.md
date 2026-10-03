# Stremio Platform Overview

Research collected October 2026. Sources cited inline; companion to
[research-sources.md](research-sources.md) and the vendored
[stremio addon guide](stremio/).

## What Stremio is

Open-source media center that streams video (movies, TV, anime, live TV)
through HTTP addons. The client itself hosts no content; addons supply
catalogs, metadata, streams, and subtitles. Core is a unified Rust engine
(stremio-core) shared across all clients, which is why library, watch
progress, and installed addons sync across devices.

Clients: Windows/macOS/Linux (v5 desktop), Android/iOS (iOS via PWA or
Stremio Lite due to App Store torrent restrictions), Android TV / Google TV,
Fire TV, LG webOS, Samsung Tizen, and Stremio Web (web.stremio.com).

## Addon architecture (resources)

An addon is a web service answering JSON over HTTP GET:

| Resource | Endpoint | Purpose |
|---|---|---|
| manifest | `/manifest.json` | id, types, resources, idPrefixes (`tt` IMDb, `kitsu`), config |
| catalog | `/catalog/{type}/{id}.json` | discovery grid, paginated, searchable |
| meta | `/meta/{type}/{id}.json` | per-title detail: poster, cast, episodes |
| stream | `/stream/{type}/{id}.json` | playable URLs / infohashes / HLS |
| subtitles | `/subtitles/{type}/{id}.json` | subtitle files with language tags |

Sources: [official addon guide](https://stremio.github.io/stremio-addon-guide/)
(vendored), [stremio-addon-sdk](https://github.com/Stremio/stremio-addon-sdk).

## Addon ecosystem (popular addons)

- **Cinemeta** - official default metadata addon (IMDb/TMDB/TVDB)
- **Torrentio** - dominant torrent scraper, integrates Real-Debrid,
  AllDebrid, Premiumize, TorBox, Offcloud
- **AIOStreams** (Viren070) - meta-addon aggregating Torrentio, Comet,
  MediaFusion, Knight Crawler into one sorted result list
- **Comet, Knight Crawler, MediaFusion** - alternative debrid scrapers
- **RPDB** - custom posters with IMDb/RT/Metacritic scores
- **OpenSubtitles v2023** - official subtitles
- Managed hosting exists (e.g. ElfHosted ~$9/mo for hosted AIOStreams/
  MediaFusion instances) alongside free self-hosting

Discovery: in-app Community addons, community catalogs
([stremio-addons.net](https://stremio-addons.net/)), or pasting a
`manifest.json` URL / `stremio://` link directly.

## Developer ecosystem

- Official guide: [stremio.github.io/stremio-addon-guide](https://stremio.github.io/stremio-addon-guide/)
  (vendored in [docs/stremio/](stremio/))
- Official SDK: NodeJS `stremio-addon-sdk` (addonBuilder, serveHTTP,
  publishToCentral); community ports exist for Deno/JSR
- Hosting patterns: Cloudflare Workers, Vercel/Netlify functions, Docker

### Gotchas (relevant to this project)

- Manifest URL must end in `/manifest.json`, return JSON with
  `Access-Control-Allow-Origin: *`
- Stremio Web is HTTPS-only: plain-HTTP addon URLs are blocked as
  mixed content
- Cloudflare Workers: no raw TCP/UDP, subrequest limits, and
  workers.dev workers cannot fetch other workers.dev subdomains
  (error 1042) - use Service Bindings, as db-addon does with INDEX

## 2025-2026 developments

- Stremio v5 desktop + Stremio Web refactor (tech updates #69-#85 on
  [blog.stremio.com](https://blog.stremio.com/))
- Android/Android TV engine overhaul (hardware acceleration,
  frame-rate switching); continued Stremio Lite on Apple platforms
- Client stays free; monetization lives in debrid services and managed
  addon hosting
- Recurring friction: Cloudflare bot-protection blocking third-party
  scrapers; community-vs-paid-hosting debates in r/StremioAddons

## Community

- [r/Stremio](https://www.reddit.com/r/Stremio/) - app support and updates
- [r/StremioAddons](https://www.reddit.com/r/StremioAddons/) - addon/debrid setups
- [blog.stremio.com](https://blog.stremio.com/) - tech updates; addon
  competitions with cash prizes
- Viren070's guides ([guides.viren070.me](https://guides.viren070.me/stremio/extras)) -
  de facto community documentation
