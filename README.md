# Nuvio Cloudflare Index Scraper

A local scraper pack for [Nuvio](https://nuvioapp.com) that pulls movies, TV shows, and anime from a Cloudflare Workers directory index site.

## Features

- **TMDB auto-matching** — looks up titles and years via the TMDB API, then finds the matching folder on your index
- **Movies, TV & Anime** — supports all three content types in one scraper
- **Multi-quality** — detects 720p, 1080p, 4K (2160p) and other qualities from filenames, sorted highest first
- **Multi-language** — extracts Hindi, English, Japanese, Korean, Tamil, Telugu and more from filenames
- **Proper headers** — Referer + Origin set to the index site so streams actually load in the player
- **Season/episode matching** — handles `Season 01` subfolders and `S01E01` episode patterns with variations
- **React Native compatible** — Promise-based only, no async/await, no Node.js modules

## Installation

### Option A: Direct URL (fastest)

1. Open Nuvio → **Settings → Local Scrapers**
2. Add the repository URL provided below
3. Enable the "Cloudflare Index" scraper

### Option B: Self-host on GitHub (recommended for long-term)

1. Create a new public GitHub repository
2. Upload all files from this folder, preserving the directory structure:
   ```
   manifest.json
   src/providers/cloudflare-index.js
   ```
3. In Nuvio → **Settings → Local Scrapers**, add:
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/
   ```
4. Enable the scraper

## Configuration

The scraper is pre-configured for the index at:
```
https://dropbox-index.rumble2620.workers.dev
```

To point it at a different Cloudflare Workers index, edit `src/providers/cloudflare-index.js` and change the `INDEX_URL` variable.

## Index Structure Expected

```
/Movies/
  Movie Title (Year)/
    Movie Title (Year) 1080p x265 HEVC [Audio] ESub.mkv

/Shows/
  Show Name (Year)/
    Season 01/
      S01E01 - Episode Title.mkv
    Season 02/
      S02E01 - Episode Title.mkv
```

## How It Works

1. Nuvio passes a TMDB ID + content type (movie/tv/anime) + season/episode numbers
2. The scraper queries the TMDB API for the title and release year
3. It fetches the `/Movies/` or `/Shows/` directory listing from your index
4. Fuzzy-matches the folder name against the TMDB title + year
5. For movies: returns all video files (multiple qualities if available)
6. For TV/anime: navigates to the season folder, finds the matching episode
7. Returns stream objects with quality, language, file size, and playback headers

## Stream Object Format

Each stream returns:
- `name` — provider · codec · language · quality
- `title` — full descriptive title with year, language, and quality
- `url` — direct stream URL from the index
- `quality` — 720p, 1080p, 4K, or Unknown
- `size` — file size from the directory listing
- `headers` — Referer/Origin/User-Agent headers for playback
- `provider` — `cloudflare-index`

## Notes

- The TMDB API key used is a shared public key commonly used across Nuvio/Stremio addons
- All requests use `fetch()` — no external dependencies
- Streams are sorted by quality (4K → 1080p → 720p → 480p)
- If no match is found, the scraper returns an empty array (no error)
- Fuzzy matching handles title variations (punctuation, alternate titles, subtitles in folder names)
