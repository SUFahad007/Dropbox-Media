# Research Sources

Every link analyzed while researching Stremio addon / Nuvio provider
development, with the verdict that led to the vendored docs in this repo.

## Stremio addon development

| Source | Verdict |
|---|---|
| [Stremio add-ons guide](https://stremio.github.io/stremio-addon-guide/) - official step-by-step (manifest, resources, stream, catalog, meta) | **WON - vendored** in [docs/stremio/](stremio/). Canonical, straight from Stremio, general-purpose (no SDK dependency, matches our vanilla-JS worker) |
| [Stremio/stremio-addon-guide](https://github.com/Stremio/stremio-addon-guide) - markdown source of the same guide | used to fetch the clean markdown copies |
| [stremio-addon-sdk docs](https://github.com/Stremio/stremio-addon-sdk/tree/master/docs/api) - official SDK API reference | rejected: we build addon.js in vanilla JS on Cloudflare Workers, no SDK |
| [@mkcfdc/stremio-addon-sdk (JSR)](https://jsr.io/@mkcfdc/stremio-addon-sdk) - Deno port of the SDK | rejected: same reason, Deno-specific |
| [docs.stremio.com](https://docs.stremio.com/) - user-facing docs | rejected: end-user focused, not addon development |

## Nuvio provider development

| Source | Verdict |
|---|---|
| [yoruix/nuvio-providers DOCUMENTATION.md](https://github.com/yoruix/nuvio-providers) - community provider guide | **WON - vendored** as [nuvio-provider-guide.md](nuvio-provider-guide.md). Covers the Provider API, subtitles, settings, transpilation quirks; matches every on-device behavior we verified ourselves (QuickJS, no setTimeout, raw spaces in URLs, top-level subtitles, size as string) |
| [john-nuvio DOCUMENTATION.md](https://git.janisslsm.id.lv/janisslsm/john-nuvio) - gitea copy | rejected: fork of the yoruix guide, older revision; says Hermes engine (outdated - on-device engine is QuickJS) |
| [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV), [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile), [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop) - official app repos | rejected as provider docs: no provider/plugin guide in any of them (docs folders cover app architecture only); useful for release notes and issue reports |
| [prneut/NuvioMobilePlus](https://github.com/prneut/NuvioMobilePlus) | rejected: NuvioMobilePlus repo, no provider documentation |
| [nuvio.wiki](https://nuvio.wiki/) - community wiki (haaihond/Nuvio-Wiki) | **best community hub** - installation, addons vs plugins, settings, stream badges, troubleshooting. Its [plugins page](https://nuvio.wiki/integrations/plugins) documents the QuickJS on-device runtime (settles the Hermes claim in the yoruix guide: wrong/outdated), streams-only scope, manifest repo format, and the app-store-vs-sideload plugin restriction. User-focused but the most accurate technical writing on Nuvio found anywhere |
| Nuvio blog/coverage (nuviosync.com, troypointinsider, geekextreme, scribd PDF overview) | rejected: installation/consumer guides, not development docs |

## Community guides and catalogs (analyzed October 2026)

Full write-up in [community-resources.md](community-resources.md).

| Source | Verdict |
|---|---|
| [nuvio.tv](https://nuvio.tv/) | official Nuvio site: clients, account dashboard, support |
| [nuvio-plugin-library.vercel.app](https://nuvio-plugin-library.vercel.app/) | community plugin/addon catalog for Nuvio (Notion-backed), one-click manifest copy |
| [numb3rs.stream](https://numb3rs.stream/) | best total-beginner guide for Stremio + Nuvio; wizard-built AIOStreams template; documents the AIOStreams + AIOMetadata stack this project plugs into |
| [guides.viren070.me/stremio](https://guides.viren070.me/stremio) | the AIOStreams author's Stremio guide; de facto community docs |
| [stremio-addons.net](https://stremio-addons.net/) | community addon catalog with rankings + submissions |
| [stremio.ar0.eu](https://stremio.ar0.eu/) | Sudo-Flix's Stremio guide: debrid + Torrentio setup, per-device walkthroughs |

## Platform and API reference (used throughout this project)

- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/) - runtime, module syntax, limits
- [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) - db-addon reaches db-index via the INDEX binding; direct workers.dev-to-workers.dev fetch is blocked (error 1042)
- [Workers Scripts API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/) - the upload/metadata API our deploy script uses
- [Dropbox API](https://www.dropbox.com/developers/documentation/http/documentation) - list_folder, get_temporary_link, Range support on content endpoints
- [TMDB API](https://developer.themoviedb.org/reference) - title lookup and search used by both addon and plugin
- [Stremio community](https://www.reddit.com/r/StremioAddons/) - addon ecosystem, de facto behavior (e.g. manifest URL must include /manifest.json)

## How the winners were applied

1. The official Stremio guide steps 1-8 were vendored under docs/stremio/.
2. The yoruix provider guide was vendored as docs/nuvio-provider-guide.md.
3. Project-specific rules learned on-device were written into DEVELOPMENT.md
   (mirror sync, service binding, QuickJS quirks, deploy flow).
4. The CI pipeline (.github/workflows/deploy.yml) deploys on push to main.
