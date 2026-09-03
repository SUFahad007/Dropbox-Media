// Dropbox Index — Stremio/Nuvio Addon v3.1.0
// Built from core.js + addon.js

// core.js
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE = "https://api.themoviedb.org/3";
var INDEX_URL = "https://dropbox-index.rumble2620.workers.dev";
var PROXY_URL = "https://base44.app/api/apps/6a8af559368095676af79aa0/functions/nuvioProxy";
var PLAYBACK_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "video/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Referer": INDEX_URL + "/",
  "Origin": INDEX_URL,
  "DNT": "1"
};
var TMDB_TIMEOUT = 8e3;
var INDEX_TIMEOUT = 12e3;
function normalize(t) {
  return t.toLowerCase().replace(/[:;'",.!?()\[\]{}]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function isVideo(f) {
  return /\.(mkv|mp4|avi|ts|mov|webm|m4v|flv|wmv)$/i.test(f);
}
function isSubtitle(f) {
  return /\.(srt|vtt|ass|ssa|sub)$/i.test(f);
}
function encodePath(p) {
  return p.split("/").map((s) => {
    try {
      return encodeURIComponent(decodeURIComponent(s));
    } catch {
      return encodeURIComponent(s);
    }
  }).join("/");
}
function streamUrl(path) {
  return path.startsWith("http") ? path : INDEX_URL + encodePath(path);
}
async function fetchWithTimeout(url, opts = {}, ms = 1e4) {
  const canTime = typeof AbortController !== "undefined" && typeof setTimeout === "function";
  if (!canTime) return fetch(url, opts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}
function parseMetadata(filename) {
  const name = filename.toLowerCase();
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  let quality = "Unknown";
  if (/2160p|4k|uhd/.test(name)) quality = "4K";
  else if (/1080p|fhd/.test(name)) quality = "1080p";
  else if (/720p|hd/.test(name)) quality = "720p";
  else if (/480p|sd/.test(name)) quality = "480p";
  else if (/576p/.test(name)) quality = "576p";
  else if (/360p/.test(name)) quality = "360p";
  let codec = "";
  if (/hevc|x265|h\.?265|av1/.test(name)) codec = /av1/.test(name) ? "AV1" : "HEVC";
  else if (/x264|h\.?264/.test(name)) codec = "H.264";
  let audio = "";
  if (/truehd/.test(name)) {
    audio = /7\.1/.test(name) ? "TrueHD 7.1" : "TrueHD";
  } else if (/ddp|dolby.digital.plus|e-?ac-?3/.test(name)) {
    audio = /7\.1/.test(name) ? "DDP 7.1" : /5\.1/.test(name) ? "DDP 5.1" : "DDP";
  } else if (/dts/.test(name)) {
    audio = /hd/.test(name) ? "DTS-HD" : /5\.1/.test(name) ? "DTS 5.1" : "DTS";
  } else if (/dd\+|dolby.digital|ac-?3/.test(name)) {
    audio = /5\.1/.test(name) ? "DD 5.1" : "DD";
  } else if (/aac/.test(name)) {
    audio = /5\.1/.test(name) ? "AAC 5.1" : "AAC";
  } else if (/flac/.test(name)) {
    audio = "FLAC";
  }
  if (/atmos/.test(name)) audio += " \xB7 Atmos";
  let hdr = "";
  if (/dolby.vision|dovi|dv\b/.test(name)) hdr = "Dolby Vision";
  else if (/hdr10\+|hdr\+/.test(name)) hdr = "HDR10+";
  else if (/hdr10/.test(name)) hdr = "HDR10";
  else if (/hdr/.test(name)) hdr = "HDR";
  else if (/10.?bit|10bit|10-bit/.test(name)) hdr = "10-bit";
  else if (/sdr/.test(name)) hdr = "SDR";
  let source = "";
  if (/blu-?ray|bdrip|bdremux|brrip/.test(name)) source = "Blu-ray";
  else if (/web-?dl|webdl/.test(name)) source = "WEB-DL";
  else if (/web-?rip|webrip/.test(name)) source = "WEBRip";
  else if (/hdrip/.test(name)) source = "HDRip";
  else if (/dvdrip|dvd/.test(name)) source = "DVD";
  const parts = [quality];
  if (source) parts.push(source);
  if (hdr) parts.push(hdr);
  if (audio) parts.push(audio);
  if (codec) parts.push(codec);
  return { quality, codec, audio, hdr, source, format: ext };
}
function humanSize(bytes) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return v >= 100 ? Math.round(v) + " " + units[i] : v.toFixed(1) + " " + units[i];
}
function buildStreamTitle(meta, fileSize) {
  const parts = [];
  if (meta.quality && meta.quality !== "Unknown") parts.push(meta.quality);
  if (meta.source) parts.push(meta.source);
  if (meta.hdr) parts.push(meta.hdr);
  if (meta.audio) parts.push(meta.audio);
  if (meta.codec) parts.push(meta.codec);
  const metaStr = parts.length ? " \xB7 " + parts.join(" \xB7 ") : "";
  const sizeStr = fileSize ? " \xB7 " + (typeof fileSize === "number" ? humanSize(fileSize) : fileSize) : "";
  return metaStr + sizeStr;
}
async function tmdbTitle(id, type) {
  id = String(id);
  const tmdbType = type === "series" ? "tv" : "movie";
  let url, title, year;
  try {
    if (id.startsWith("tt")) {
      url = `${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=en-US`;
      const r = await fetchWithTimeout(url, {}, TMDB_TIMEOUT);
      if (!r.ok) return null;
      const d = await r.json();
      const item = tmdbType === "movie" ? d.movie_results?.[0] : d.tv_results?.[0];
      if (!item) return null;
      title = tmdbType === "movie" ? item.title : item.name;
      year = parseInt((item.release_date || item.first_air_date || "").slice(0, 4)) || null;
    } else {
      const tmdbId = id.replace(/^tmdb:/, "");
      url = `${TMDB_BASE}/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=alternative_titles`;
      const r = await fetchWithTimeout(url, {}, TMDB_TIMEOUT);
      if (!r.ok) return null;
      const d = await r.json();
      title = tmdbType === "movie" ? d.title : d.name;
      year = parseInt((d.release_date || d.first_air_date || "").slice(0, 4)) || null;
    }
  } catch {
    return null;
  }
  return { title, year };
}
function jaccardSimilarity(a, b) {
  const setA = new Set(normalize(a).split(" ").filter(Boolean));
  const setB = new Set(normalize(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
function findFolder(folders, title, year) {
  const norm = normalize(title);
  for (const f of folders) {
    if (!f.isFolder) continue;
    const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
    const fTitle = m ? m[1] : f.name;
    const fYear = m ? parseInt(m[2]) : null;
    if (normalize(fTitle) === norm) {
      if (year && fYear && Math.abs(year - fYear) > 1) continue;
      return f;
    }
  }
  for (const f of folders) {
    if (!f.isFolder) continue;
    const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
    const fTitle = m ? m[1] : f.name;
    const fYear = m ? parseInt(m[2]) : null;
    const nf = normalize(fTitle);
    if (nf.includes(norm) || norm.includes(nf)) {
      if (year && fYear && Math.abs(year - fYear) > 1) continue;
      return f;
    }
  }
  let best = null, bestScore = 0.6;
  for (const f of folders) {
    if (!f.isFolder) continue;
    const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
    const fTitle = m ? m[1] : f.name;
    const fYear = m ? parseInt(m[2]) : null;
    if (year && fYear && Math.abs(year - fYear) > 1) continue;
    const score = jaccardSimilarity(fTitle, title);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}
function findSeason(entries, seasonNum) {
  const sPad = String(seasonNum).padStart(2, "0");
  const sPlain = String(seasonNum);
  for (const e of entries) {
    if (!e.isFolder) continue;
    const t = e.name.toLowerCase();
    if (["season " + sPad, "season " + sPlain, "s" + sPad, "s" + sPlain].includes(t)) return e;
    if (t.includes("season") && (t.includes(sPad) || t.includes(" " + sPlain))) return e;
  }
  return null;
}
function matchEp(filename, season, episode) {
  const m = String(filename).toUpperCase().match(new RegExp("S0?" + season + "E0?" + episode));
  if (!m) return false;
  const rest = String(filename).toUpperCase().slice(m.index + m[0].length);
  return !/^\d/.test(rest);
}
function findSubtitles(files, videoName) {
  const base = videoName.replace(/\.[^.]+$/, "").toLowerCase();
  return files.filter((f) => !f.isFolder && isSubtitle(f.name) && f.name.replace(/\.[^.]+$/, "").toLowerCase() === base).map((f) => ({
    url: streamUrl(f.path),
    language: "en",
    // Nuvio reads `language`
    lang: "en",
    // Stremio reads `lang`
    name: f.name
    // display name
  }));
}
async function resolveMovie(id, fetchListing2, makeStream2) {
  const info = await tmdbTitle(id, "movie");
  if (!info) return [];
  try {
    const searchUrl = INDEX_URL + "/api/search?q=" + encodeURIComponent(info.title) + "&type=movie" + (info.year ? "&year=" + info.year : "");
    const r = await fetchWithTimeout(searchUrl, {}, INDEX_TIMEOUT);
    if (r.ok) {
      const data = await r.json();
      if (data.results && data.results.length) {
        const files2 = data.results[0].files || [];
        const videoFiles2 = files2.filter((f) => !f.isFolder && isVideo(f.name));
        const subs2 = videoFiles2.length ? findSubtitles(files2, videoFiles2[0].name) : [];
        return videoFiles2.map((f) => makeStream2(f, subs2));
      }
    }
  } catch {
  }
  const folders = await fetchListing2("/Movies/");
  const match = findFolder(folders, info.title, info.year);
  if (!match) return [];
  const files = await fetchListing2(match.path);
  const videoFiles = files.filter((f) => !f.isFolder && isVideo(f.name));
  const subs = videoFiles.length ? findSubtitles(files, videoFiles[0].name) : [];
  return videoFiles.map((f) => makeStream2(f, subs));
}
async function resolveSeries(id, season, episode, fetchListing2, makeStream2) {
  const info = await tmdbTitle(id, "series");
  if (!info) return [];
  let showEntries = null;
  try {
    const searchUrl = INDEX_URL + "/api/search?q=" + encodeURIComponent(info.title) + "&type=tv" + (info.year ? "&year=" + info.year : "");
    const r = await fetchWithTimeout(searchUrl, {}, INDEX_TIMEOUT);
    if (r.ok) {
      const data = await r.json();
      if (data.results && data.results.length) {
        showEntries = data.results[0].files || [];
      }
    }
  } catch {
  }
  if (!showEntries) {
    const folders = await fetchListing2("/Shows/");
    const match = findFolder(folders, info.title, info.year);
    if (!match) return [];
    showEntries = await fetchListing2(match.path);
  }
  const seasonFolder = findSeason(showEntries, season);
  const eps = seasonFolder ? await fetchListing2(seasonFolder.path) : showEntries;
  let streams = eps.filter((f) => !f.isFolder && isVideo(f.name) && matchEp(f.name, season, episode)).map((f) => makeStream2(f, findSubtitles(eps, f.name)));
  if (streams.length === 0 && !seasonFolder) {
    const subfolders = showEntries.filter((e) => e.isFolder);
    const results = await Promise.allSettled(
      subfolders.map((entry) => fetchListing2(entry.path))
    );
    for (let i = 0; i < results.length; i++) {
      if (results[i].status !== "fulfilled") continue;
      const sub = results[i].value;
      const matched = sub.filter((f) => !f.isFolder && isVideo(f.name) && matchEp(f.name, season, episode));
      if (matched.length) {
        streams = matched.map((f) => makeStream2(f, findSubtitles(sub, f.name)));
        break;
      }
    }
  }
  return streams;
}
function parseSeriesId(rawId) {
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
  }
  const parts = id.split(":");
  let showId, season = 1, episode = 1;
  if (id.startsWith("tmdb:")) {
    if (parts.length >= 4) {
      showId = parts[0] + ":" + parts[1];
      season = +parts[2] || 1;
      episode = +parts[3] || 1;
    } else if (parts.length === 3) {
      showId = parts[0] + ":" + parts[1];
      season = +parts[2] || 1;
    } else showId = id;
  } else if (id.startsWith("tt")) {
    if (parts.length >= 3) {
      showId = parts[0];
      season = +parts[1] || 1;
      episode = +parts[2] || 1;
    } else showId = id;
  } else {
    showId = parts[0];
    if (parts.length >= 3) {
      season = +parts[1] || 1;
      episode = +parts[2] || 1;
    }
  }
  return { showId, season, episode };
}

// addon.js
var MANIFEST = {
  id: "cf-index-addon",
  version: "3.2.0",
  name: "Dropbox Index",
  description: "Direct streams from your Dropbox library via Cloudflare",
  types: ["movie", "series"],
  resources: [
    { name: "stream", types: ["movie", "series"], idPrefixes: ["tmdb", "tt"] }
  ],
  catalogs: [],
  behaviorHints: { configurable: false }
};
async function fetchListing(path) {
  const resp = await fetch(PROXY_URL + "?path=" + encodeURIComponent("/api" + path));
  const data = await resp.json();
  return data.entries || [];
}
function makeStream(file, subtitles) {
  const meta = parseMetadata(file.name);
  return {
    name: "Dropbox",
    title: file.name + buildStreamTitle(meta, file.size),
    url: streamUrl(file.path),
    ...subtitles && subtitles.length ? { subtitles } : {},
    // Stremio spec: top-level
    behaviorHints: {
      notWebReady: true,
      headers: PLAYBACK_HEADERS
    }
  };
}
var addon_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (path === "/manifest.json" || path === "/") {
      return new Response(
        JSON.stringify(MANIFEST, null, 2),
        { headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
    if (path === "/test") {
      try {
        const m = await resolveMovie("tt1375666", fetchListing, makeStream);
        const s = await resolveSeries("tt0903747", 1, 1, fetchListing, makeStream);
        return new Response(JSON.stringify({
          version: "3.2.0",
          movie: { count: m.length, sample: m[0] },
          series: { count: s.length, sample: s[0] }
        }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e.message }, null, 2),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }
    const movieMatch = path.match(/^\/stream\/movie\/(.+)\.json$/);
    if (movieMatch) {
      try {
        const streams = await resolveMovie(movieMatch[1], fetchListing, makeStream);
        return new Response(
          JSON.stringify({ streams }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ streams: [] }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }
    const seriesMatch = path.match(/^\/stream\/series\/(.+)\.json$/);
    if (seriesMatch) {
      try {
        const p = parseSeriesId(seriesMatch[1]);
        const streams = await resolveSeries(p.showId, p.season, p.episode, fetchListing, makeStream);
        return new Response(
          JSON.stringify({ streams }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ streams: [] }),
          { headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
    }
    return new Response(JSON.stringify({ error: "Not found", path }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
};
export {
  addon_default as default
};
