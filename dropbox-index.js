/**
 * Dropbox Index — Cloudflare Worker
 *
 * Serves a Dropbox account as a clean, dark-mode directory index.
 * All traffic goes through Cloudflare — links never expose Dropbox.
 *
 * Setup:
 *   wrangler secret put DROPBOX_APP_KEY
 *   wrangler secret put DROPBOX_APP_SECRET
 *   wrangler secret put DROPBOX_REFRESH_TOKEN
 *
 * KV binding: DROPBOX_CACHE (tokens, folder listings, temp links)
 *
 * Routes:
 *   /path/              → folder listing HTML (human browsing)
 *   /api/path/          → JSON listing (scraper/addon consumption)
 *   /api/search?q=&type= → search folders by title, return matching folder + files
 *   /path/file          → file download or stream
 *
 * Caching layers (fastest → slowest):
 *   1. Edge cache (Cache API) — 60s fresh, 10 min SWR — zero worker execution
 *   2. Module memory          — 30s fresh, SWR         — zero I/O
 *   3. KV                     — 30s fresh, 1hr store    — ~10-50ms
 *   4. Dropbox API            — cold start only         — ~200-500ms
 *
 * Download speed:
 *   - Temp links pre-warmed in background after folder render
 *   - All files (not just media) go through cached temp links
 *   - Range support on every file for instant seek/scrub
 */

// ── Dropbox API endpoints ──

const API = {
  token: "https://api.dropboxapi.com/oauth2/token",
  list: "https://api.dropboxapi.com/2/files/list_folder",
  listMore: "https://api.dropboxapi.com/2/files/list_folder/continue",
  tempLink: "https://api.dropboxapi.com/2/files/get_temporary_link",
};

// TTLs (seconds)
const TTL = { token: 12600, folderFresh: 30, folderStore: 3600, link: 14400 };
const PREWARM_LIMIT = 20; // max temp links to pre-fetch per folder view

// Folders the scraper always hits first — pre-warmed by cron
const SCRAPER_ROOTS = ["", "Movies", "Shows"];

// ── Media detection ──

const MEDIA = new Set(["mp4","mkv","webm","avi","mov","m4v","ogv","mp3","wav","flac","ogg","m4a","aac","weba","opus","ts","m3u8","mpd"]);

const MIME = {
  mp4:"video/mp4", mkv:"video/x-matroska", webm:"video/webm", avi:"video/x-msvideo",
  mov:"video/quicktime", m4v:"video/x-m4v", ogv:"video/ogg", ts:"video/mp2t",
  m3u8:"application/vnd.apple.mpegurl", mpd:"application/dash+xml",
  mp3:"audio/mpeg", wav:"audio/wav", flac:"audio/flac", ogg:"audio/ogg",
  m4a:"audio/mp4", aac:"audio/aac", weba:"audio/webm", opus:"audio/opus",
};

const ext = f => f.split(".").pop().toLowerCase();
const isMedia = f => MEDIA.has(ext(f));
const mimeType = f => MIME[ext(f)] || "application/octet-stream";

// ── Module-level caches (persist across requests in same isolate) ──

let token = null, tokenExp = 0;
const memFolders = new Map();  // key → { data, ts } — max 16
const memLinks = new Map();    // path → { data, ts } — max 64

function memGet(map, key, freshMs) {
  const v = map.get(key);
  if (!v) return null;
  return { data: v.data, stale: Date.now() - v.ts > freshMs };
}

function memSet(map, key, data, max) {
  if (map.size >= max) { const oldest = map.keys().next().value; map.delete(oldest); }
  map.set(key, { data, ts: Date.now() });
}

// ── Normalize for matching ──

function normalize(t) {
  return t.toLowerCase()
    .replace(/[:;'",.!?()\[\]{}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardSimilarity(a, b) {
  const setA = new Set(normalize(a).split(" ").filter(Boolean));
  const setB = new Set(normalize(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// ── Main entry ──

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    if (path === "/favicon.ico") return new Response(null, { status: 204 });

    try {
      // /api/search?q=Title&type=movie|tv → search folders, return match + files
      if (path === "/api/search" || path === "/api/search/") {
        return handleSearch(env, url, ctx);
      }

      // /api/* → JSON listing for scraper/addon
      if (path.startsWith("/api/")) {
        const dbPath = path.replace(/^\/api\/+/, "").replace(/\/+$/, "");
        return handleApi(env, dbPath, ctx);
      }

      const isDir = path.endsWith("/") || path === "";
      const dbPath = path.replace(/^\/+/, "").replace(/\/+$/, "");

      if (isDir) {
        // Layer 1: Edge cache — 60s fresh, 10 min SWR (zero worker exec on hit)
        const cache = caches.default;
        const key = new Request(request.url, { method: "GET" });
        let res = await cache.match(key);
        if (res) return res;

        res = await renderListing(env, dbPath, ctx);
        const cached = new Response(res.body, res);
        cached.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
        ctx.waitUntil(cache.put(key, cached.clone()));
        return cached;
      }

      return handleFile(env, request, dbPath);
    } catch (err) {
      return errorPage(err);
    }
  },

  // Pre-warm: cron fires every 5 min, keeps root + scraper folders + temp links hot
  async scheduled(event, env, ctx) {
    ctx.waitUntil(prewarm(env));
  },
};

// ── Search API: find folder by title, return folder + files in one response ──
// GET /api/search?q=Inception&type=movie&year=2010
// Returns { query, type, results: [{ name, path, isFolder, files: [...] }] }
// This cuts addon requests from 2-3 (list + match + list files) to 1.

async function handleSearch(env, url, ctx) {
  const q = url.searchParams.get("q") || "";
  const type = url.searchParams.get("type") || "movie"; // movie → Movies/, tv → Shows/
  const year = parseInt(url.searchParams.get("year")) || null;

  if (!q) {
    return new Response(JSON.stringify({ error: "Missing q parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  const rootFolder = type === "tv" || type === "series" ? "Shows" : "Movies";
  const entries = await listFolder(env, rootFolder, ctx);
  const folders = entries.filter(e => e[".tag"] === "folder");

  // Match: exact → substring → Jaccard (same logic as core.js findFolder)
  const norm = normalize(q);
  let match = null;

  // Pass 1: exact (with year validation)
  for (const f of folders) {
    const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
    const fTitle = m ? m[1] : f.name;
    const fYear = m ? parseInt(m[2]) : null;
    if (normalize(fTitle) === norm) {
      if (year && fYear && Math.abs(year - fYear) > 1) continue;
      match = f; break;
    }
  }

  // Pass 2: substring
  if (!match) {
    for (const f of folders) {
      const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
      const fTitle = m ? m[1] : f.name;
      const fYear = m ? parseInt(m[2]) : null;
      const nf = normalize(fTitle);
      if (nf.includes(norm) || norm.includes(nf)) {
        if (year && fYear && Math.abs(year - fYear) > 1) continue;
        match = f; break;
      }
    }
  }

  // Pass 3: Jaccard fuzzy (threshold 0.6)
  if (!match) {
    let bestScore = 0.6;
    for (const f of folders) {
      const m = f.name.match(/^(.+?)\s*\((\d{4})\)/);
      const fTitle = m ? m[1] : f.name;
      const fYear = m ? parseInt(m[2]) : null;
      if (year && fYear && Math.abs(year - fYear) > 1) continue;
      const score = jaccardSimilarity(fTitle, q);
      if (score > bestScore) { bestScore = score; match = f; }
    }
  }

  if (!match) {
    return new Response(JSON.stringify({ query: q, type, results: [] }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      },
    });
  }

  // Fetch the matched folder's contents
  const matchPath = `${rootFolder}/${match.name}`;
  const files = await listFolder(env, matchPath, ctx);

  const json = JSON.stringify({
    query: q,
    type,
    results: [{
      name: match.name,
      path: `/${matchPath}/`,
      isFolder: true,
      files: files.map(e => {
        const dir = e[".tag"] === "folder";
        const full = `${matchPath}/${e.name}`;
        return {
          name: e.name,
          path: dir ? `/${full}/` : `/${full}`,
          size: (!dir && e.size != null) ? e.size : 0,
          sizeHuman: (!dir && e.size != null) ? fmtSize(e.size) : "",
          modified: e.client_modified || e.server_modified || "",
          mimeType: dir ? "application/x-directory" : mimeType(e.name),
          isFolder: dir,
        };
      }),
    }],
  });

  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}

// ── JSON API for scraper/addon ──
// Returns { path, entries: [{ name, path, size, sizeBytes, modified, mimeType, isFolder }] }

async function handleApi(env, dbPath, ctx) {
  const entries = await listFolder(env, dbPath, ctx);

  const json = JSON.stringify({
    path: dbPath ? `/${dbPath}/` : "/",
    entries: entries.map(e => {
      const dir = e[".tag"] === "folder";
      const full = dbPath ? `${dbPath}/${e.name}` : e.name;
      return {
        name: e.name,
        path: dir ? `/${full}/` : `/${full}`,
        size: (!dir && e.size != null) ? fmtSize(e.size) : "",
        sizeBytes: (!dir && e.size != null) ? e.size : 0,
        modified: e.client_modified || e.server_modified || "",
        mimeType: dir ? "application/x-directory" : mimeType(e.name),
        isFolder: dir,
      };
    }),
  });

  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      // Longer cache for API — scraper doesn't need fresh data as often
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
    },
  });
}

// ── Access token: memory → KV → refresh ──

async function getToken(env) {
  if (token && Date.now() < tokenExp) return token;

  const kv = await env.DROPBOX_CACHE.get("access_token");
  if (kv) { token = kv; tokenExp = Date.now() + TTL.token * 1000; return kv; }

  const res = await fetch(API.token, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(env.DROPBOX_APP_KEY + ":" + env.DROPBOX_APP_SECRET)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.DROPBOX_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);

  token = (await res.json()).access_token;
  tokenExp = Date.now() + TTL.token * 1000;
  await env.DROPBOX_CACHE.put("access_token", token, { expirationTtl: TTL.token });
  return token;
}

// ── Temp link: memory → KV → fetch (used for ALL downloads) ──

async function getTempLink(env, dbPath) {
  const freshMs = TTL.link * 1000;

  const mem = memGet(memLinks, dbPath, freshMs);
  if (mem) return mem.data;

  const key = `link:${dbPath}`;
  const kv = await env.DROPBOX_CACHE.get(key);
  if (kv) { memSet(memLinks, dbPath, kv, 64); return kv; }

  const res = await fetch(API.tempLink, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getToken(env)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: `/${dbPath}` }),
  });
  if (!res.ok) throw new Error(`Temp link failed (${res.status}): ${await res.text()}`);

  const link = (await res.json()).link;
  await env.DROPBOX_CACHE.put(key, link, { expirationTtl: TTL.link });
  memSet(memLinks, dbPath, link, 64);
  return link;
}

// ── Pre-warm temp links: batch fetch in background after folder render ──

async function prewarmLinks(env, entries, dbPath) {
  const files = entries.filter(e => e[".tag"] === "file").slice(0, PREWARM_LIMIT);
  await Promise.all(files.map(async e => {
    const full = dbPath ? `${dbPath}/${e.name}` : e.name;
    if (memLinks.has(full) && Date.now() - memLinks.get(full).ts < TTL.link * 1000) return;
    try { await getTempLink(env, full); } catch (_) {}
  }));
}

// ── Folder listing: memory → KV → Dropbox (SWR at every layer) ──

async function listFolder(env, dbPath, ctx) {
  const key = `folder:${dbPath || "/"}`;
  const freshMs = TTL.folderFresh * 1000;

  const mem = memGet(memFolders, key, freshMs);
  if (mem) {
    if (mem.stale) ctx.waitUntil(fetchAndCacheFolder(env, dbPath, key));
    return mem.data;
  }

  const raw = await env.DROPBOX_CACHE.get(key, "json");
  if (raw) {
    memSet(memFolders, key, raw.entries, 16);
    if (Date.now() - raw.ts > freshMs) {
      ctx.waitUntil(fetchAndCacheFolder(env, dbPath, key));
    }
    return raw.entries;
  }

  return fetchAndCacheFolder(env, dbPath, key);
}

async function fetchAndCacheFolder(env, dbPath, key) {
  const t = await getToken(env);
  let entries = [], hasMore = true, cursor = null;

  while (hasMore) {
    const url = cursor ? API.listMore : API.list;
    const body = cursor ? JSON.stringify({ cursor }) : JSON.stringify({
      path: dbPath ? `/${dbPath}` : "", include_deleted: false, include_mounted_folders: true,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error(`Not found: ${dbPath || "/"}`);
      throw new Error(`List failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    entries = entries.concat(data.entries);
    hasMore = data.has_more;
    cursor = data.cursor;
  }

  entries.sort((a, b) =>
    a[".tag"] !== b[".tag"] ? (a[".tag"] === "folder" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  await env.DROPBOX_CACHE.put(key, JSON.stringify({ entries, ts: Date.now() }), { expirationTtl: TTL.folderStore });
  memSet(memFolders, key, entries, 16);
  return entries;
}

// ── File handler: all downloads via cached temp links ──

async function handleFile(env, request, dbPath) {
  if (!dbPath) return new Response("No file specified", { status: 400 });

  const name = dbPath.split("/").pop();
  const link = await getTempLink(env, dbPath);
  const range = request.headers.get("Range");
  const headers = range ? { Range: range } : {};

  let res = await fetch(link, { headers });

  // Retry once if temp link expired
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    await env.DROPBOX_CACHE.delete(`link:${dbPath}`);
    memLinks.delete(dbPath);
    const link2 = await getTempLink(env, dbPath);
    res = await fetch(link2, { headers: range ? { Range: range } : {} });
  }

  const out = {
    "Content-Type": mimeType(name),
    "Content-Disposition": `attachment; filename="${name.replace(/"/g, "_")}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };
  const cl = res.headers.get("Content-Length");
  if (cl) out["Content-Length"] = cl;
  const cr = res.headers.get("Content-Range");
  if (cr) out["Content-Range"] = cr;

  return new Response(res.body, { status: res.status, headers: out });
}

// ── Render directory listing (HTML for humans) ──

async function renderListing(env, dbPath, ctx) {
  const entries = await listFolder(env, dbPath, ctx);
  const display = dbPath ? `/${dbPath}/` : "/";
  const parts = dbPath ? dbPath.split("/") : [];

  let parent = "";
  if (parts.length) {
    const up = parts.slice(0, -1).join("/");
    parent = `<tr class="up"><td><a href="${up ? `/${up}/` : "/"}">../</a></td><td></td></tr>`;
  }

  const rows = entries.map(e => {
    const dir = e[".tag"] === "folder";
    const full = dbPath ? `${dbPath}/${e.name}` : e.name;
    const href = dir ? `/${full}/` : `/${full}`;
    const size = (!dir && e.size != null) ? fmtSize(e.size) : "—";
    return `  <tr><td><a href="${href}">${esc(dir ? e.name + "/" : e.name)}</a></td><td style="text-align:right">${size}</td></tr>`;
  }).join("\n");

  // Pre-warm temp links in background — by the time user clicks, link is cached
  ctx.waitUntil(prewarmLinks(env, entries, dbPath));

  return new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Index of ${esc(display)}</title>
<style>
  body{background:#0D0D0D;color:#E0E0E0;font-family:"Times New Roman",Times,serif;margin:40px auto;max-width:800px;padding:0 24px;line-height:1.5;font-weight:bold}
  h1{font-size:22px;font-weight:bold;margin:0 0 20px}
  hr{border:none;border-top:1px solid #333;margin:0 0 4px}
  table{font-family:monospace;font-size:14px;border-collapse:collapse;width:100%}
  td{padding:6px 12px 6px 0;vertical-align:top;border-bottom:1px solid #222}
  td:last-child{white-space:nowrap;text-align:right;color:#888;font-weight:normal}
  tr:last-child td{border-bottom:none}
  a{color:#7AA2F7;text-decoration:underline}
  a:visited{color:#B294BB}
  .up td{border-bottom:1px solid #333;padding-bottom:10px}
  @media(max-width:600px){body{margin:24px auto}h1{font-size:18px}table{font-size:13px}}
</style>
</head><body>
<h1>Index of ${esc(display)}</h1>
<hr>
<table><tbody>
${parent}
${rows || '<tr><td style="color:#666;font-weight:normal">Empty folder</td><td></td></tr>'}
</tbody></table>
</body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ── Pre-warm: root + scraper folders + temp links, all kept hot ──

async function prewarm(env) {
  try {
    await getToken(env);
    // Pre-warm all scraper entry points in parallel
    const allEntries = await Promise.all(
      SCRAPER_ROOTS.map(r => fetchAndCacheFolder(env, r, `folder:${r || "/"}`))
    );
    // Pre-warm temp links for root folder files
    await prewarmLinks(env, allEntries[0], "");
  } catch (_) {}
}

// ── Utils ──

function fmtSize(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(1) + " GB";
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function errorPage(err) {
  return new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error</title>
<style>
  body{background:#0D0D0D;color:#E0E0E0;font-family:"Times New Roman",Times,serif;margin:40px auto;max-width:800px;padding:0 24px}
  h1{font-size:22px;font-weight:bold}pre{font-family:monospace;font-size:14px;white-space:pre-wrap}
  a{color:#7AA2F7}hr{border:none;border-top:1px solid #333}
</style>
</head><body>
<h1>Error</h1><hr><pre>${esc(err.message || err)}</pre><hr><a href="/">Back to index</a>
</body></html>`, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
