# Community Guides & Catalogs

Stremio/Nuvio ecosystem resources beyond the official docs - guides,
catalogs, and setup frameworks. Collected October 2026. Companion to
[research-sources.md](research-sources.md), [stremio-overview.md](stremio-overview.md),
and [nuvio-overview.md](nuvio-overview.md).

## Official sites

- [nuvio.tv](https://nuvio.tv/) - official Nuvio site: "watch your
  library, anywhere". Open-source media client with library, profiles,
  watch progress, rich details, playback across every screen. Also
  hosts the account dashboard (addons/plugins management, per the
  wiki) and [nuvio.tv/support](https://nuvio.tv/support)
- [stremio.com](https://www.stremio.com/) - official Stremio site

## Catalogs (find addons/plugins)

- [nuvio-plugin-library.vercel.app](https://nuvio-plugin-library.vercel.app/)
  - **Nuvio Plugin Library**: community plugins and add-ons for Nuvio.
  Browse providers, compare scrapers, one-click manifest copy.
  React SPA backed by a Notion database (/api/notion/); links to
  nuvioapp.space and a community Discord. The Stremio-addons.net
  equivalent for Nuvio
- [stremio-addons.net](https://stremio-addons.net/) - community Stremio
  addon list: search, new/recently-updated/top-rising/popular rankings,
  addon submission. Also promotes affiliated services (Torrin - open
  source usenet debrid, self-host free or $2.99/mo; NodStack - managed
  private AIOStreams, EUR 15/yr)

## Setup guides

- [numb3rs.stream](https://numb3rs.stream/) - **"Streaming Perfect
  Setup" (luckynumb3rs, v2.0)**: the de facto total-beginner guide for
  both Stremio and Nuvio. Automated wizard that builds an AIOStreams
  config from a template (by TamTaro, with Vidhin's quality regexes);
  covers debrid / P2P / HTTP stream types. Key fact for us: the
  recommended stack is **AIOStreams + AIOMetadata** as the two central
  addons, exactly what this repo's stream-only addon plugs into.
  Nuvio migration note: existing AIOStreams / AIOMetadata / Watchly
  manifest URLs from Stremio can be reused in Nuvio as-is (Nuvio
  supports more AIOMetadata catalogs than Stremio does)
- [guides.viren070.me/stremio](https://guides.viren070.me/stremio) -
  the AIOStreams author's guide: intro, technical details (how
  debrid + addons work), setup, extras, FAQ, troubleshooting. The
  de facto Stremio community documentation
- [stremio.ar0.eu](https://stremio.ar0.eu/) - "Sudo-Flix's Stremio
  Guide": step-by-step debrid (Real-Debrid / TorBox) + Torrentio
  setup, per-device install walkthroughs (FireStick, Android,
  Samsung/LG TV), usenet via TorBox, RPDB, troubleshooting. Slightly
  Torrentio-centric (vs the AIOStreams-centric guide above)

## Ecosystem roles (who builds what, per numb3rs.stream credits)

| Person | Project | Role |
|---|---|---|
| Viren070 | AIOStreams + guides | stream aggregation meta-addon |
| Cedya | AIOMetadata | metadata/catalog addon |
| Sanopandit | Watchly | watch-tracking lists |
| TamTaro | AIOStreams template base + SEL filters | config templates |
| Vidhin | quality regexes | release-quality sorting signals |
| Sonicx161 | AIOManager | addon config management |
| yoruix / tapframe | nuvio-providers + provider guide | Nuvio plugin suite |
| haaihond et al. | nuvio.wiki | community wiki |

## Where this repo fits

Our stack maps directly onto this ecosystem: the family uses
AIOMetadata for catalogs (meta), and db-addon (Stremio) / plugin.js
(Nuvio) provide **HTTP direct streams** from our Dropbox index - the
same role debrid scrapers play, but pointing at our own archive.
Nuvio installs the same addon manifest URLs where applicable, and
plugin.js ships through the plugin repository format this ecosystem
expects.
