// Dropbox Index — Stremio/Nuvio Addon v3.1.0
// Built from core.js + addon.js

// core.js
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var TMDB_BASE = "https://api.themoviedb.org/3";
var INDEX_URL = "https://dropbox-index.rumble2620.workers.dev";
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
function parseMetadata(filename, sizeBytes) {
  const name = filename.toLowerCase();
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";
  let quality = "Unknown";
  if (/2160p|4k|uhd/.test(name)) quality = "4K";
  else if (/1080p|fhd/.test(name)) quality = "1080p";
  else if (/720p|hd/.test(name)) quality = "720p";
  else if (/480p|sd/.test(name)) quality = "480p";
  else if (/576p/.test(name)) quality = "576p";
  else if (/360p/.test(name)) quality = "360p";
  if (quality === "Unknown") {
    let bytes = 0;
    if (typeof sizeBytes === "number") bytes = sizeBytes;
    else if (typeof sizeBytes === "string") {
      const m = sizeBytes.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)/i);
      if (m) {
        const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }[m[2].toUpperCase()];
        bytes = parseFloat(m[1]) * mult;
      }
    }
    if (bytes >= 6e9) quality = "4K";
    else if (bytes >= 12e8) quality = "1080p";
    else if (bytes >= 4e8) quality = "720p";
    else if (bytes > 0) quality = "480p";
  }
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
function qualityRank(quality) {
  const ranks = { "4K": 1, "1080p": 2, "720p": 3, "576p": 4, "480p": 5, "360p": 6 };
  return ranks[quality] || 9;
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
  if (!info) throw new Error('TMDB lookup failed for "' + id + '"');
  const label = '"' + info.title + (info.year ? " (" + info.year + ")" : "") + '"';
  try {
    const searchUrl = INDEX_URL + "/api/search?q=" + encodeURIComponent(info.title) + "&type=movie" + (info.year ? "&year=" + info.year : "");
    const r = await fetchWithTimeout(searchUrl, {}, INDEX_TIMEOUT);
    if (r.ok) {
      const data = await r.json();
      if (data.results && data.results.length) {
        const files2 = data.results[0].files || [];
        const videoFiles2 = files2.filter((f) => !f.isFolder && isVideo(f.name));
        if (videoFiles2.length) {
          const subs2 = findSubtitles(files2, videoFiles2[0].name);
          return videoFiles2.map((f) => makeStream2(f, subs2));
        }
      }
    }
  } catch {
  }
  const folders = await fetchListing2("/Movies/");
  const match = findFolder(folders, info.title, info.year);
  if (!match) throw new Error("No folder match for " + label + " in /Movies/");
  const files = await fetchListing2(match.path);
  const videoFiles = files.filter((f) => !f.isFolder && isVideo(f.name));
  if (!videoFiles.length) throw new Error('No video files in "' + match.path + '"');
  const subs = videoFiles.length ? findSubtitles(files, videoFiles[0].name) : [];
  return videoFiles.map((f) => makeStream2(f, subs));
}
async function resolveSeries(id, season, episode, fetchListing2, makeStream2) {
  const info = await tmdbTitle(id, "series");
  if (!info) throw new Error('TMDB lookup failed for "' + id + '"');
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
    if (!match) throw new Error('No show folder for "' + info.title + (info.year ? " (" + info.year + ")" : "") + '" in /Shows/');
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
  if (!streams.length) throw new Error("S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(2, "0") + ' not found for "' + info.title + '"');
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
  version: "3.3.1",
  name: "Addon",
  description: "Direct streams from your Dropbox library via Cloudflare",
  types: ["movie", "series"],
  resources: [
    { name: "stream", types: ["movie", "series"], idPrefixes: ["tmdb", "tt"] }
  ],
  catalogs: [],
  behaviorHints: { configurable: false }
};
async function fetchListing(path) {
  const resp = await fetch(INDEX_URL + "/api" + encodePath(path));
  const data = await resp.json();
  return data.entries || [];
}
function makeStream(file, subtitles) {
  const meta = parseMetadata(file.name, file.size);
  return {
    name: "Dropbox",
    title: file.name + buildStreamTitle(meta, file.size),
    url: streamUrl(file.path),
    quality: meta.quality,
    sequence: qualityRank(meta.quality),
    // stable per-quality → binge picks same quality
    ...subtitles && subtitles.length ? { subtitles } : {},
    // Stremio spec: top-level
    behaviorHints: {
      notWebReady: true,
      // library is HEVC/DTS — browser decoders can't play it; hide from Stremio Web
      proxyHeaders: { request: PLAYBACK_HEADERS }
    }
  };
}
function errorStream(message) {
  return {
    name: "Dropbox",
    title: "\u26A0\uFE0F " + message,
    externalUrl: INDEX_URL + "/"
  };
}
var addon_default = {
  async fetch(request, env) {
    if (env && env.INDEX && !globalThis.__indexBound) {
      globalThis.__indexBound = true;
      const realFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, init) => {
        const u = typeof input === "string" ? input : String(input && input.url || input);
        return u.startsWith(INDEX_URL) ? env.INDEX.fetch(u, init) : realFetch(input, init);
      };
    }
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
    if (path === "/plugin/manifest.json" || path === "/plugin/nuvio.js") {
      const isManifest = path === "/plugin/manifest.json";
      return new Response(isManifest ? "{\n  \"name\": \"elixir3847's Repo\",\n  \"version\": \"1.0.0\",\n  \"scrapers\": [\n    {\n      \"id\": \"cf-dropbox-index\",\n      \"name\": \"Plugin\",\n      \"description\": \"Direct streams from your Dropbox library via Cloudflare Workers\",\n      \"version\": \"1.1.5\",\n      \"author\": \"elixir3847\",\n      \"supportedTypes\": [\n        \"movie\",\n        \"tv\"\n      ],\n      \"filename\": \"nuvio.js\",\n      \"enabled\": true,\n      \"logo\": \"\",\n      \"contentLanguage\": [\n        \"en\"\n      ],\n      \"formats\": [\n        \"mp4\",\n        \"mkv\",\n        \"avi\",\n        \"mov\",\n        \"webm\",\n        \"ts\",\n        \"m4v\",\n        \"flv\",\n        \"wmv\"\n      ],\n      \"limited\": false,\n      \"disabledPlatforms\": [],\n      \"supportsExternalPlayer\": true,\n      \"hasSettings\": false\n    }\n  ]\n}" : "// Dropbox Index — Nuvio Plugin v1.0.0\n// Built from core.js + plugin.js\nvar __defProp = Object.defineProperty;\nvar __defProps = Object.defineProperties;\nvar __getOwnPropDescs = Object.getOwnPropertyDescriptors;\nvar __getOwnPropSymbols = Object.getOwnPropertySymbols;\nvar __hasOwnProp = Object.prototype.hasOwnProperty;\nvar __propIsEnum = Object.prototype.propertyIsEnumerable;\nvar __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;\nvar __spreadValues = (a, b) => {\n  for (var prop in b || (b = {}))\n    if (__hasOwnProp.call(b, prop))\n      __defNormalProp(a, prop, b[prop]);\n  if (__getOwnPropSymbols)\n    for (var prop of __getOwnPropSymbols(b)) {\n      if (__propIsEnum.call(b, prop))\n        __defNormalProp(a, prop, b[prop]);\n    }\n  return a;\n};\nvar __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));\nvar __async = (__this, __arguments, generator) => {\n  return new Promise((resolve, reject) => {\n    var fulfilled = (value) => {\n      try {\n        step(generator.next(value));\n      } catch (e) {\n        reject(e);\n      }\n    };\n    var rejected = (value) => {\n      try {\n        step(generator.throw(value));\n      } catch (e) {\n        reject(e);\n      }\n    };\n    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);\n    step((generator = generator.apply(__this, __arguments)).next());\n  });\n};\n\n// core.js\nvar TMDB_API_KEY = \"439c478a771f35c05022f9feabcca01c\";\nvar TMDB_BASE = \"https://api.themoviedb.org/3\";\nvar INDEX_URL = \"https://dropbox-index.rumble2620.workers.dev\";\nvar PLAYBACK_HEADERS = {\n  \"User-Agent\": \"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\",\n  \"Accept\": \"video/*,*/*;q=0.8\",\n  \"Accept-Language\": \"en-US,en;q=0.9\",\n  \"Accept-Encoding\": \"identity\",\n  \"Referer\": INDEX_URL + \"/\",\n  \"Origin\": INDEX_URL,\n  \"DNT\": \"1\"\n};\nvar TMDB_TIMEOUT = 8e3;\nvar INDEX_TIMEOUT = 12e3;\nfunction normalize(t) {\n  return t.toLowerCase().replace(/[:;'\",.!?()\\[\\]{}]/g, \" \").replace(/[^a-z0-9\\s]/g, \" \").replace(/\\s+/g, \" \").trim();\n}\nfunction isVideo(f) {\n  return /\\.(mkv|mp4|avi|ts|mov|webm|m4v|flv|wmv)$/i.test(f);\n}\nfunction isSubtitle(f) {\n  return /\\.(srt|vtt|ass|ssa|sub)$/i.test(f);\n}\nfunction encodePath(p) {\n  return p.split(\"/\").map((s) => {\n    try {\n      return encodeURIComponent(decodeURIComponent(s));\n    } catch (e) {\n      return encodeURIComponent(s);\n    }\n  }).join(\"/\");\n}\nfunction streamUrl(path) {\n  return path.startsWith(\"http\") ? path : INDEX_URL + encodePath(path);\n}\nfunction fetchWithTimeout(_0) {\n  return __async(this, arguments, function* (url, opts = {}, ms = 1e4) {\n    const canTime = typeof AbortController !== \"undefined\" && typeof setTimeout === \"function\";\n    if (!canTime) return fetch(url, opts);\n    const controller = new AbortController();\n    const timer = setTimeout(() => controller.abort(), ms);\n    try {\n      const resp = yield fetch(url, __spreadProps(__spreadValues({}, opts), { signal: controller.signal }));\n      return resp;\n    } finally {\n      clearTimeout(timer);\n    }\n  });\n}\nfunction parseMetadata(filename, sizeBytes) {\n  var _a;\n  const name = filename.toLowerCase();\n  const ext = ((_a = (filename.match(/\\.([a-z0-9]+)$/i) || [])[1]) == null ? void 0 : _a.toLowerCase()) || \"\";\n  let quality = \"Unknown\";\n  if (/2160p|4k|uhd/.test(name)) quality = \"4K\";\n  else if (/1080p|fhd/.test(name)) quality = \"1080p\";\n  else if (/720p|hd/.test(name)) quality = \"720p\";\n  else if (/480p|sd/.test(name)) quality = \"480p\";\n  else if (/576p/.test(name)) quality = \"576p\";\n  else if (/360p/.test(name)) quality = \"360p\";\n  if (quality === \"Unknown\") {\n    let bytes = 0;\n    if (typeof sizeBytes === \"number\") bytes = sizeBytes;\n    else if (typeof sizeBytes === \"string\") {\n      const m = sizeBytes.match(/^([\\d.]+)\\s*(B|KB|MB|GB|TB)/i);\n      if (m) {\n        const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 }[m[2].toUpperCase()];\n        bytes = parseFloat(m[1]) * mult;\n      }\n    }\n    if (bytes >= 6e9) quality = \"4K\";\n    else if (bytes >= 12e8) quality = \"1080p\";\n    else if (bytes >= 4e8) quality = \"720p\";\n    else if (bytes > 0) quality = \"480p\";\n  }\n  let codec = \"\";\n  if (/hevc|x265|h\\.?265|av1/.test(name)) codec = /av1/.test(name) ? \"AV1\" : \"HEVC\";\n  else if (/x264|h\\.?264/.test(name)) codec = \"H.264\";\n  let audio = \"\";\n  if (/truehd/.test(name)) {\n    audio = /7\\.1/.test(name) ? \"TrueHD 7.1\" : \"TrueHD\";\n  } else if (/ddp|dolby.digital.plus|e-?ac-?3/.test(name)) {\n    audio = /7\\.1/.test(name) ? \"DDP 7.1\" : /5\\.1/.test(name) ? \"DDP 5.1\" : \"DDP\";\n  } else if (/dts/.test(name)) {\n    audio = /hd/.test(name) ? \"DTS-HD\" : /5\\.1/.test(name) ? \"DTS 5.1\" : \"DTS\";\n  } else if (/dd\\+|dolby.digital|ac-?3/.test(name)) {\n    audio = /5\\.1/.test(name) ? \"DD 5.1\" : \"DD\";\n  } else if (/aac/.test(name)) {\n    audio = /5\\.1/.test(name) ? \"AAC 5.1\" : \"AAC\";\n  } else if (/flac/.test(name)) {\n    audio = \"FLAC\";\n  }\n  if (/atmos/.test(name)) audio += \" \\xB7 Atmos\";\n  let hdr = \"\";\n  if (/dolby.vision|dovi|dv\\b/.test(name)) hdr = \"Dolby Vision\";\n  else if (/hdr10\\+|hdr\\+/.test(name)) hdr = \"HDR10+\";\n  else if (/hdr10/.test(name)) hdr = \"HDR10\";\n  else if (/hdr/.test(name)) hdr = \"HDR\";\n  else if (/10.?bit|10bit|10-bit/.test(name)) hdr = \"10-bit\";\n  else if (/sdr/.test(name)) hdr = \"SDR\";\n  let source = \"\";\n  if (/blu-?ray|bdrip|bdremux|brrip/.test(name)) source = \"Blu-ray\";\n  else if (/web-?dl|webdl/.test(name)) source = \"WEB-DL\";\n  else if (/web-?rip|webrip/.test(name)) source = \"WEBRip\";\n  else if (/hdrip/.test(name)) source = \"HDRip\";\n  else if (/dvdrip|dvd/.test(name)) source = \"DVD\";\n  const parts = [quality];\n  if (source) parts.push(source);\n  if (hdr) parts.push(hdr);\n  if (audio) parts.push(audio);\n  if (codec) parts.push(codec);\n  return { quality, codec, audio, hdr, source, format: ext };\n}\nfunction humanSize(bytes) {\n  if (!bytes || bytes <= 0) return \"\";\n  const units = [\"B\", \"KB\", \"MB\", \"GB\", \"TB\"];\n  let i = 0, v = bytes;\n  while (v >= 1024 && i < units.length - 1) {\n    v /= 1024;\n    i++;\n  }\n  return v >= 100 ? Math.round(v) + \" \" + units[i] : v.toFixed(1) + \" \" + units[i];\n}\nfunction buildStreamTitle(meta, fileSize) {\n  const parts = [];\n  if (meta.quality && meta.quality !== \"Unknown\") parts.push(meta.quality);\n  if (meta.source) parts.push(meta.source);\n  if (meta.hdr) parts.push(meta.hdr);\n  if (meta.audio) parts.push(meta.audio);\n  if (meta.codec) parts.push(meta.codec);\n  const metaStr = parts.length ? \" \\xB7 \" + parts.join(\" \\xB7 \") : \"\";\n  const sizeStr = fileSize ? \" \\xB7 \" + (typeof fileSize === \"number\" ? humanSize(fileSize) : fileSize) : \"\";\n  return metaStr + sizeStr;\n}\nfunction tmdbTitle(id, type) {\n  return __async(this, null, function* () {\n    var _a, _b;\n    id = String(id);\n    const tmdbType = type === \"series\" ? \"tv\" : \"movie\";\n    let url, title, year;\n    try {\n      if (id.startsWith(\"tt\")) {\n        url = `${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=en-US`;\n        const r = yield fetchWithTimeout(url, {}, TMDB_TIMEOUT);\n        if (!r.ok) return null;\n        const d = yield r.json();\n        const item = tmdbType === \"movie\" ? (_a = d.movie_results) == null ? void 0 : _a[0] : (_b = d.tv_results) == null ? void 0 : _b[0];\n        if (!item) return null;\n        title = tmdbType === \"movie\" ? item.title : item.name;\n        year = parseInt((item.release_date || item.first_air_date || \"\").slice(0, 4)) || null;\n      } else {\n        const tmdbId = id.replace(/^tmdb:/, \"\");\n        url = `${TMDB_BASE}/${tmdbType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=alternative_titles`;\n        const r = yield fetchWithTimeout(url, {}, TMDB_TIMEOUT);\n        if (!r.ok) return null;\n        const d = yield r.json();\n        title = tmdbType === \"movie\" ? d.title : d.name;\n        year = parseInt((d.release_date || d.first_air_date || \"\").slice(0, 4)) || null;\n      }\n    } catch (e) {\n      return null;\n    }\n    return { title, year };\n  });\n}\nfunction jaccardSimilarity(a, b) {\n  const setA = new Set(normalize(a).split(\" \").filter(Boolean));\n  const setB = new Set(normalize(b).split(\" \").filter(Boolean));\n  if (setA.size === 0 || setB.size === 0) return 0;\n  let intersection = 0;\n  for (const w of setA) if (setB.has(w)) intersection++;\n  return intersection / (setA.size + setB.size - intersection);\n}\nfunction findFolder(folders, title, year) {\n  const norm = normalize(title);\n  for (const f of folders) {\n    if (!f.isFolder) continue;\n    const m = f.name.match(/^(.+?)\\s*\\((\\d{4})\\)/);\n    const fTitle = m ? m[1] : f.name;\n    const fYear = m ? parseInt(m[2]) : null;\n    if (normalize(fTitle) === norm) {\n      if (year && fYear && Math.abs(year - fYear) > 1) continue;\n      return f;\n    }\n  }\n  for (const f of folders) {\n    if (!f.isFolder) continue;\n    const m = f.name.match(/^(.+?)\\s*\\((\\d{4})\\)/);\n    const fTitle = m ? m[1] : f.name;\n    const fYear = m ? parseInt(m[2]) : null;\n    const nf = normalize(fTitle);\n    if (nf.includes(norm) || norm.includes(nf)) {\n      if (year && fYear && Math.abs(year - fYear) > 1) continue;\n      return f;\n    }\n  }\n  let best = null, bestScore = 0.6;\n  for (const f of folders) {\n    if (!f.isFolder) continue;\n    const m = f.name.match(/^(.+?)\\s*\\((\\d{4})\\)/);\n    const fTitle = m ? m[1] : f.name;\n    const fYear = m ? parseInt(m[2]) : null;\n    if (year && fYear && Math.abs(year - fYear) > 1) continue;\n    const score = jaccardSimilarity(fTitle, title);\n    if (score > bestScore) {\n      bestScore = score;\n      best = f;\n    }\n  }\n  return best;\n}\nfunction qualityRank(quality) {\n  const ranks = { \"4K\": 1, \"1080p\": 2, \"720p\": 3, \"576p\": 4, \"480p\": 5, \"360p\": 6 };\n  return ranks[quality] || 9;\n}\nfunction findSeason(entries, seasonNum) {\n  const sPad = String(seasonNum).padStart(2, \"0\");\n  const sPlain = String(seasonNum);\n  for (const e of entries) {\n    if (!e.isFolder) continue;\n    const t = e.name.toLowerCase();\n    if ([\"season \" + sPad, \"season \" + sPlain, \"s\" + sPad, \"s\" + sPlain].includes(t)) return e;\n    if (t.includes(\"season\") && (t.includes(sPad) || t.includes(\" \" + sPlain))) return e;\n  }\n  return null;\n}\nfunction matchEp(filename, season, episode) {\n  const m = String(filename).toUpperCase().match(new RegExp(\"S0?\" + season + \"E0?\" + episode));\n  if (!m) return false;\n  const rest = String(filename).toUpperCase().slice(m.index + m[0].length);\n  return !/^\\d/.test(rest);\n}\nfunction findSubtitles(files, videoName) {\n  const base = videoName.replace(/\\.[^.]+$/, \"\").toLowerCase();\n  return files.filter((f) => !f.isFolder && isSubtitle(f.name) && f.name.replace(/\\.[^.]+$/, \"\").toLowerCase() === base).map((f) => ({\n    url: streamUrl(f.path),\n    language: \"en\",\n    // Nuvio reads `language`\n    lang: \"en\",\n    // Stremio reads `lang`\n    name: f.name\n    // display name\n  }));\n}\nfunction resolveMovie(id, fetchListing2, makeStream2) {\n  return __async(this, null, function* () {\n    const info = yield tmdbTitle(id, \"movie\");\n    if (!info) throw new Error('TMDB lookup failed for \"' + id + '\"');\n    const label = '\"' + info.title + (info.year ? \" (\" + info.year + \")\" : \"\") + '\"';\n    try {\n      const searchUrl = INDEX_URL + \"/api/search?q=\" + encodeURIComponent(info.title) + \"&type=movie\" + (info.year ? \"&year=\" + info.year : \"\");\n      const r = yield fetchWithTimeout(searchUrl, {}, INDEX_TIMEOUT);\n      if (r.ok) {\n        const data = yield r.json();\n        if (data.results && data.results.length) {\n          const files2 = data.results[0].files || [];\n          const videoFiles2 = files2.filter((f) => !f.isFolder && isVideo(f.name));\n          if (videoFiles2.length) {\n            const subs2 = findSubtitles(files2, videoFiles2[0].name);\n            return videoFiles2.map((f) => makeStream2(f, subs2));\n          }\n        }\n      }\n    } catch (e) {\n    }\n    const folders = yield fetchListing2(\"/Movies/\");\n    const match = findFolder(folders, info.title, info.year);\n    if (!match) throw new Error(\"No folder match for \" + label + \" in /Movies/\");\n    const files = yield fetchListing2(match.path);\n    const videoFiles = files.filter((f) => !f.isFolder && isVideo(f.name));\n    if (!videoFiles.length) throw new Error('No video files in \"' + match.path + '\"');\n    const subs = videoFiles.length ? findSubtitles(files, videoFiles[0].name) : [];\n    return videoFiles.map((f) => makeStream2(f, subs));\n  });\n}\nfunction resolveSeries(id, season, episode, fetchListing2, makeStream2) {\n  return __async(this, null, function* () {\n    const info = yield tmdbTitle(id, \"series\");\n    if (!info) throw new Error('TMDB lookup failed for \"' + id + '\"');\n    let showEntries = null;\n    try {\n      const searchUrl = INDEX_URL + \"/api/search?q=\" + encodeURIComponent(info.title) + \"&type=tv\" + (info.year ? \"&year=\" + info.year : \"\");\n      const r = yield fetchWithTimeout(searchUrl, {}, INDEX_TIMEOUT);\n      if (r.ok) {\n        const data = yield r.json();\n        if (data.results && data.results.length) {\n          showEntries = data.results[0].files || [];\n        }\n      }\n    } catch (e) {\n    }\n    if (!showEntries) {\n      const folders = yield fetchListing2(\"/Shows/\");\n      const match = findFolder(folders, info.title, info.year);\n      if (!match) throw new Error('No show folder for \"' + info.title + (info.year ? \" (\" + info.year + \")\" : \"\") + '\" in /Shows/');\n      showEntries = yield fetchListing2(match.path);\n    }\n    const seasonFolder = findSeason(showEntries, season);\n    const eps = seasonFolder ? yield fetchListing2(seasonFolder.path) : showEntries;\n    let streams = eps.filter((f) => !f.isFolder && isVideo(f.name) && matchEp(f.name, season, episode)).map((f) => makeStream2(f, findSubtitles(eps, f.name)));\n    if (streams.length === 0 && !seasonFolder) {\n      const subfolders = showEntries.filter((e) => e.isFolder);\n      const results = yield Promise.allSettled(\n        subfolders.map((entry) => fetchListing2(entry.path))\n      );\n      for (let i = 0; i < results.length; i++) {\n        if (results[i].status !== \"fulfilled\") continue;\n        const sub = results[i].value;\n        const matched = sub.filter((f) => !f.isFolder && isVideo(f.name) && matchEp(f.name, season, episode));\n        if (matched.length) {\n          streams = matched.map((f) => makeStream2(f, findSubtitles(sub, f.name)));\n          break;\n        }\n      }\n    }\n    if (!streams.length) throw new Error(\"S\" + String(season).padStart(2, \"0\") + \"E\" + String(episode).padStart(2, \"0\") + ' not found for \"' + info.title + '\"');\n    return streams;\n  });\n}\n\n// plugin.js\nfunction fetchListing(path) {\n  return __async(this, null, function* () {\n    const resp = yield fetch(INDEX_URL + \"/api\" + path);\n    const data = yield resp.json();\n    return data.entries || [];\n  });\n}\nfunction makeStream(file, subtitles) {\n  const meta = parseMetadata(file.name, file.size);\n  return __spreadProps(__spreadValues({\n    name: \"Dropbox\",\n    title: file.name + buildStreamTitle(meta, file.size),\n    url: streamUrl(file.path),\n    quality: meta.quality,\n    sequence: qualityRank(meta.quality),\n    size: file.size != null ? String(file.size) : void 0,\n    // Nuvio expects a string\n    format: meta.format,\n    headers: PLAYBACK_HEADERS\n  }, subtitles && subtitles.length ? { subtitles } : {}), {\n    // Nuvio reads top-level\n    behaviorHints: { notWebReady: true }\n  });\n}\nfunction getStreams(tmdbId, mediaType, season, episode) {\n  return __async(this, null, function* () {\n    try {\n      if (mediaType === \"movie\") {\n        return yield resolveMovie(tmdbId, fetchListing, makeStream);\n      } else if (mediaType === \"tv\" || mediaType === \"series\") {\n        return yield resolveSeries(tmdbId, season, episode, fetchListing, makeStream);\n      }\n      return [];\n    } catch (error) {\n      console.error(\"[Dropbox] Error: \" + error.message);\n      return [];\n    }\n  });\n}\nif (typeof module !== \"undefined\" && module.exports) {\n  module.exports = { getStreams };\n} else {\n  const g = typeof global !== \"undefined\" ? global : globalThis;\n  g.getStreams = { getStreams };\n}\n", {
        headers: { ...cors, "Content-Type": isManifest ? "application/json" : "application/javascript; charset=utf-8" }
      });
    }
    if (path === "/test") {
      try {
        const m = await resolveMovie("tt1375666", fetchListing, makeStream);
        const s = await resolveSeries("tt0903747", 1, 1, fetchListing, makeStream);
        return new Response(JSON.stringify({
          version: "3.3.1",
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
      } catch (e) {
        return new Response(
          JSON.stringify({ streams: [errorStream(e.message)] }),
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
      } catch (e) {
        return new Response(
          JSON.stringify({ streams: [errorStream(e.message)] }),
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
