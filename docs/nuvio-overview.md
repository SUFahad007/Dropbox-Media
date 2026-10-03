# Nuvio Platform Overview

Research collected October 2026. Sources cited inline; companion to
[research-sources.md](research-sources.md) and the vendored
[Nuvio provider guide](nuvio-provider-guide.md).

## What Nuvio is

Open-source "bring your own sources" media hub (GPL-3.0-or-later,
GitHub org [NuvioMedia](https://github.com/NuvioMedia)). Where Stremio
calls remote addon web services, Nuvio runs scraper providers
**locally on-device** in an embedded JS runtime and turns their
results into a library with artwork, profiles, Trakt sync, and debrid
integration.

Clients:

| Repo | Platform | Player engine |
|---|---|---|
| [NuvioTV](https://github.com/NuvioMedia/NuvioTV) | Android TV / Google TV / Fire TV | VLCLib |
| [NuvioMobile](https://github.com/NuvioMedia/NuvioMobile) | Android + iOS | VLCLib (Android), KSPlayer (iOS/tvOS) |
| [NuvioDesktop](https://github.com/NuvioMedia/NuvioDesktop) | Windows, Linux (alpha) | MPV |
| [NuvioTVSmart](https://github.com/NuvioMedia/NuvioTVSmart) | Samsung Tizen, LG webOS | platform webview |
| [NuvioWeb](https://github.com/NuvioMedia/NuvioWeb) | browsers | browser |

Core features: TMDB/MDBList/AIOMetadata catalogs, custom collections,
2-way Trakt sync, multi-profile with independent watch history,
Real-Debrid/TorBox debrid manager, IPTV playlist support.

## Provider system

A provider is a JS module with the contract:

```javascript
async function getStreams(tmdbId, mediaType, season, episode)
```

returning stream objects (url, quality, headers like User-Agent/Referer,
optional bingeGroup). Provider repos publish a root `manifest.json`
listing each scraper's name, version, entry-point URL, and logo.
Users install by pasting the manifest URL into Settings > Plugins.

Development workflow ([yoruix guide](https://github.com/yoruix/nuvio-providers),
vendored here): write in `src/`, bundle with `build.js` (esbuild transpiles
async/await for the on-device runtime), test with a local HTTP server plus
the in-app **Plugin Tester** in debug builds.

### Runtime quirks (IMPORTANT for this project)

The yoruix guide documents a Hermes (React Native) runtime with no
Node.js built-ins and async/await needing transpilation. **Our own
on-device work (v1.1.5-v1.1.8) found QuickJS behavior instead**: no
setTimeout/setInterval, fetch bridge handles raw spaces in URLs,
subtitles top-level as `{url, language, name}`, `size` as string.
On-device results are ground truth - treat guide claims as secondary
to what the installed app actually does. Both may be true across
different Nuvio clients/versions; plugin.js guards with feature
detection rather than assuming either.

## Ecosystem

- [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers) -
  primary provider suite/template + the provider guide (vendored here)
- All-in-One-Nuvio ([NuvioPlugin org](https://github.com/NuvioPlugin/All-in-One-Nuvio)) -
  community provider bundles
- AIOMetadata - enriched catalog plugin (user uses this for catalog;
  our addon/plugin is stream-only)
- Community local-files addons, Termux-hosted media, debrid library
  managers (r/Nuvio)

## 2025-2026 developments

- NuvioTV 0.4.6 - major performance upgrade, fluid navigation
  (per community feedback on GitHub issues)
- NuvioMobile 1.2.0 - VLCLib on Android, KSPlayer default on iOS
- NuvioDesktop - top GitHub trending for Kotlin multiplatform,
  continuous playback routines
- NuvioTVSmart 0.9.0-beta - Tizen/webOS D-pad and keyboard improvements
- Users migrating from Stremio citing Stremio's move toward
  subscription-based accounts (r/Nuvio threads)

## Community

- [r/Nuvio](https://www.reddit.com/r/Nuvio/) and
  [r/nuvioaddons](https://www.reddit.com/r/nuvioaddons/) - main hubs
- [Patreon](https://www.patreon.com/cw/NuvioMedia) - community funding
- Key figures: yoruix/tapframe (providers + docs), Davako94
  (NuvioDesktop), NuvioMedia core team
- NuvioSync blog - installation guides (Linux, Samsung TV)
