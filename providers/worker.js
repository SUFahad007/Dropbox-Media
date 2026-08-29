// ============================================================================
// Cloudflare Index Scraper for Nuvio Local Scrapers
// ============================================================================
// Pulls movies, TV shows, and anime from a Cloudflare Workers directory index.
// React Native compatible — Promise-based only, NO async/await.
// Uses fetch() for HTTP requests, no Node.js modules required.
// ============================================================================

// ── Configuration ────────────────────────────────────────────────────────────

var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
var INDEX_URL = 'https://dropbox-index.rumble2620.workers.dev';

// Headers that make the Cloudflare Worker actually serve the file to the
// Nuvio player. Referer + Origin are critical for cross-origin media loading.
var WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Referer': INDEX_URL + '/',
    'Origin': INDEX_URL,
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1'
};

// Quality priority for sorting (higher = better)
var QUALITY_ORDER = {
    '4K': 5, '2160p': 5,
    '1080p': 4,
    '720p': 3,
    '480p': 2,
    'SD': 1,
    '360p': 0
};

// ── Utility Functions ────────────────────────────────────────────────────────

// Decode HTML entities (&#039; → ', &amp; → &, etc.)
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&#0?39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

// Parse a Cloudflare Worker directory listing HTML page.
// Returns array of { href, text, size, isFolder }.
function parseDirectoryListing(html) {
    var entries = [];
    var regex = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>([^<]*)<\/td>/gi;
    var match;
    while ((match = regex.exec(html)) !== null) {
        var href = match[1];
        var text = decodeHtmlEntities(match[2]).trim();
        var size = match[3] ? match[3].trim() : '';

        if (href === '../' || href === '/' || href === '..' || text === '../') continue;

        var isFolder = text.charAt(text.length - 1) === '/' || href.charAt(href.length - 1) === '/';
        entries.push({
            href: href,
            text: isFolder ? text.replace(/\/$/, '') : text,
            size: (size === '—' || size === '' || size === '\u2014') ? '' : size,
            isFolder: isFolder
        });
    }
    return entries;
}

// Normalize a title for fuzzy comparison
function normalizeTitle(title) {
    return title.toLowerCase()
        .replace(/[:;'",.!?()\[\]{}]/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Find the best matching folder for a given title + year
function matchFolder(folders, title, year, altTitle) {
    var normTitle = normalizeTitle(title);
    var normAlt = altTitle ? normalizeTitle(altTitle) : '';
    var bestMatch = null;
    var bestScore = 0;

    for (var i = 0; i < folders.length; i++) {
        if (!folders[i].isFolder) continue;
        var folderText = folders[i].text;

        var yearMatch = folderText.match(/^(.+?)\s*\((\d{4})\)\s*$/);
        var folderTitle, folderYear;
        if (yearMatch) {
            folderTitle = yearMatch[1];
            folderYear = yearMatch[2];
        } else {
            folderTitle = folderText;
            folderYear = '';
        }

        var normFolder = normalizeTitle(folderTitle);

        var titleMatched = false;
        if (normFolder === normTitle || (normAlt && normFolder === normAlt)) {
            titleMatched = true;
        } else if (normFolder.indexOf(normTitle) !== -1 || normTitle.indexOf(normFolder) !== -1) {
            titleMatched = true;
        } else if (normAlt && (normFolder.indexOf(normAlt) !== -1 || normAlt.indexOf(normFolder) !== -1)) {
            titleMatched = true;
        }

        if (titleMatched) {
            var score = 1;
            if (normFolder === normTitle || (normAlt && normFolder === normAlt)) score += 2;
            if (year && folderYear === year) {
                score += 3;
            } else if (year && folderYear && folderYear !== year) {
                score -= 2;
            }
            score -= normFolder.length * 0.001;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = folders[i];
            }
        }
    }
    return bestMatch;
}

// Find the season folder matching a season number
function findSeasonFolder(entries, seasonNum) {
    var sPadded = seasonNum < 10 ? '0' + seasonNum : '' + seasonNum;
    var sPlain = '' + seasonNum;

    for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isFolder) continue;
        var t = entries[i].text.toLowerCase();

        if (t === ('season ' + sPadded) ||
            t === ('season ' + sPlain) ||
            t === ('season' + sPadded) ||
            t === ('season' + sPlain) ||
            t === ('s' + sPadded) ||
            t === ('s' + sPlain)) {
            return entries[i];
        }

        if (t.indexOf('season') !== -1) {
            if (t.indexOf(sPadded) !== -1 || t.indexOf(' ' + sPlain + ' ') !== -1 || t.indexOf(' ' + sPlain + '/') !== -1) {
                return entries[i];
            }
        }
    }
    return null;
}

// Check if a filename matches S{season}E{episode}
function matchEpisode(filename, seasonNum, episodeNum) {
    var s = '' + seasonNum;
    var e = '' + episodeNum;
    var regex = new RegExp('S0?' + s + 'E0?' + e + '(?!\\d)', 'i');
    return regex.test(filename);
}

// ── Quality Detection (from filename or inferred from file size) ─────────────

// Infer quality from file size when not in filename
// 8GB+ → 4K, 1.8GB+ → 1080p, 700MB+ → 720p, 250MB+ → 480p, else → SD
function inferQualityFromSize(sizeStr) {
    if (!sizeStr) return 'SD';
    var m = sizeStr.match(/([\d.]+)\s*(GB|MB|TB)/i);
    if (!m) return 'SD';
    var size = parseFloat(m[1]);
    var unit = m[2].toUpperCase();
    var sizeMB = unit === 'GB' ? size * 1024 : unit === 'TB' ? size * 1024 * 1024 : size;
    if (sizeMB > 6000) return '4K';
    if (sizeMB > 1800) return '1080p';
    if (sizeMB > 700) return '720p';
    if (sizeMB > 250) return '480p';
    return 'SD';
}

// Extract quality from filename, falling back to size inference
function extractQuality(filename, size) {
    var q = filename.match(/\b(2160p|4k|1080p|720p|480p|360p)\b/i);
    if (q) {
        var val = q[1].toLowerCase();
        if (val === '2160p') return '4K';
        return val;
    }
    // No quality marker in filename — infer from file size
    return inferQualityFromSize(size);
}

// Extract language info from a filename
function extractLanguage(filename) {
    var langs = [];
    if (/multi\s*audio/i.test(filename)) langs.push('Multi Audio');
    if (/dual\s*audio/i.test(filename)) langs.push('Dual Audio');
    if (/hindi/i.test(filename)) langs.push('Hindi');
    if (/english/i.test(filename)) langs.push('English');
    if (/japanese/i.test(filename)) langs.push('Japanese');
    if (/korean/i.test(filename)) langs.push('Korean');
    if (/spanish/i.test(filename)) langs.push('Spanish');
    if (/french/i.test(filename)) langs.push('French');
    if (/german/i.test(filename)) langs.push('German');
    if (/chinese|mandarin|cantonese/i.test(filename)) langs.push('Chinese');
    if (/tamil/i.test(filename)) langs.push('Tamil');
    if (/telugu/i.test(filename)) langs.push('Telugu');

    if (langs.length === 0) return '';
    return langs.join(' + ');
}

// Extract codec info from a filename
function extractCodec(filename) {
    if (/x265|hevc/i.test(filename)) return 'x265 HEVC';
    if (/x264|h264|avc/i.test(filename)) return 'x264';
    if (/av1/i.test(filename)) return 'AV1';
    return '';
}

// ── Filename Cleanup for Display ─────────────────────────────────────────────

// Clean a filename for display: remove extension, hash brackets, extra spaces
function cleanFilename(filename) {
    var clean = filename.replace(/\.(mkv|mp4|avi|ts|mov|webm|m4v|flv|wmv)$/i, '');
    // Remove hash brackets like [363B9913]
    clean = clean.replace(/\[[A-Fa-f0-9]{6,}\]/g, '');
    // Remove release group tags like [PSA], [ESub]
    clean = clean.replace(/\[[A-Z]{2,}\]/g, '');
    // Clean up extra spaces
    clean = clean.replace(/\s+/g, ' ').trim();
    // Remove trailing separator
    clean = clean.replace(/\s*[-–]\s*$/, '');
    return clean;
}

// ── URL/path helpers ─────────────────────────────────────────────────────────

function encodePath(path) {
    return path.split('/').map(function(seg) {
        try {
            return encodeURIComponent(decodeURIComponent(seg));
        } catch (e) {
            return encodeURIComponent(seg);
        }
    }).join('/');
}

function buildStreamUrl(href) {
    if (href.indexOf('http') === 0) return href;
    return INDEX_URL + encodePath(href);
}

function isVideoFile(filename) {
    return /\.(mkv|mp4|avi|ts|mov|webm|m4v|flv|wmv)$/i.test(filename);
}

// ── Stream Builders ──────────────────────────────────────────────────────────

// Build stream objects for all video files in a movie folder
// Quality always shown — inferred from file size if not in filename
function buildMovieStreams(files, title, year) {
    var streams = [];

    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f.isFolder || !isVideoFile(f.text)) continue;

        var quality = extractQuality(f.text, f.size);
        var language = extractLanguage(f.text);
        var codec = extractCodec(f.text);
        var url = buildStreamUrl(f.href);

        // Quality-first naming: CF-Index · 1080p · x265 HEVC · Hindi + English
        var nameParts = ['CF-Index'];
        nameParts.push(quality);
        if (codec) nameParts.push(codec);
        if (language) nameParts.push(language);

        // Clean filename for display title
        var displayTitle = cleanFilename(f.text);
        if (f.size) displayTitle += ' · ' + f.size;

        streams.push({
            name: nameParts.join(' · '),
            title: displayTitle,
            url: url,
            quality: quality,
            size: f.size || '',
            headers: WORKING_HEADERS,
            provider: 'cloudflare-index'
        });
    }

    // Sort by quality (highest first)
    streams.sort(function(a, b) {
        return (QUALITY_ORDER[b.quality] || 0) - (QUALITY_ORDER[a.quality] || 0);
    });

    return streams;
}

// Build stream objects for a specific episode
function buildEpisodeStreams(files, title, year, seasonNum, episodeNum) {
    var streams = [];

    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (f.isFolder || !isVideoFile(f.text)) continue;
        if (!matchEpisode(f.text, seasonNum, episodeNum)) continue;

        var quality = extractQuality(f.text, f.size);
        var language = extractLanguage(f.text);
        var codec = extractCodec(f.text);
        var url = buildStreamUrl(f.href);

        var sPadded = seasonNum < 10 ? '0' + seasonNum : '' + seasonNum;
        var ePadded = episodeNum < 10 ? '0' + episodeNum : '' + episodeNum;
        var epLabel = 'S' + sPadded + 'E' + ePadded;

        // Quality-first naming
        var nameParts = ['CF-Index'];
        nameParts.push(quality);
        if (codec) nameParts.push(codec);
        if (language) nameParts.push(language);

        // Clean filename for display
        var displayTitle = cleanFilename(f.text);
        if (f.size) displayTitle += ' · ' + f.size;

        streams.push({
            name: nameParts.join(' · '),
            title: displayTitle,
            url: url,
            quality: quality,
            size: f.size || '',
            headers: WORKING_HEADERS,
            provider: 'cloudflare-index'
        });
    }

    streams.sort(function(a, b) {
        return (QUALITY_ORDER[b.quality] || 0) - (QUALITY_ORDER[a.quality] || 0);
    });

    return streams;
}

// ── TMDB Metadata ───────────────────────────────────────────────────────────

function fetchTmdbMetadata(tmdbId, mediaType) {
    var cleanId = tmdbId.replace(/^tmdb:/, '').replace(/^tt/, '');

    var endpoint, searchPath, isTv;

    if (mediaType === 'movie') {
        endpoint = TMDB_BASE_URL + '/movie/' + cleanId + '?api_key=' + TMDB_API_KEY + '&language=en-US';
        searchPath = '/Movies/';
        isTv = false;
    } else if (mediaType === 'tv' || mediaType === 'anime') {
        endpoint = TMDB_BASE_URL + '/tv/' + cleanId + '?api_key=' + TMDB_API_KEY + '&language=en-US';
        searchPath = '/Shows/';
        isTv = true;
    } else {
        return Promise.resolve(null);
    }

    return fetch(endpoint)
        .then(function(resp) { return resp.json(); })
        .then(function(data) {
            if (!data || data.success === false || data.status_code === 34) {
                if (mediaType === 'anime') {
                    return fetch(TMDB_BASE_URL + '/movie/' + cleanId + '?api_key=' + TMDB_API_KEY + '&language=en-US')
                        .then(function(r) { return r.json(); })
                        .then(function(d) {
                            if (!d || d.success === false) return null;
                            return extractTmdbInfo(d, false, '/Movies/');
                        });
                }
                return null;
            }
            return extractTmdbInfo(data, isTv, searchPath);
        })
        .catch(function(err) {
            console.error('[CF-Index] TMDB fetch error:', err.message);
            return null;
        });
}

function extractTmdbInfo(data, isTv, searchPath) {
    var title, altTitle, year;

    if (isTv) {
        title = data.name || '';
        altTitle = data.original_name || '';
        if (data.first_air_date) {
            year = data.first_air_date.substring(0, 4);
        }
    } else {
        title = data.title || '';
        altTitle = data.original_title || '';
        if (data.release_date) {
            year = data.release_date.substring(0, 4);
        }
    }

    if (!title) return null;

    return {
        title: title,
        altTitle: altTitle && altTitle !== title ? altTitle : '',
        year: year || '',
        searchPath: searchPath
    };
}

// ── Directory Fetching ──────────────────────────────────────────────────────

function fetchDirectory(path) {
    var url = INDEX_URL + encodePath(path);
    return fetch(url, { headers: WORKING_HEADERS })
        .then(function(resp) { return resp.text(); })
        .then(function(html) { return parseDirectoryListing(html); });
}

// ── Main Scraper Function ───────────────────────────────────────────────────

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise(function(resolve, reject) {
        console.log('[CF-Index] getStreams called: tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + seasonNum + 'E' + episodeNum);

        fetchTmdbMetadata(tmdbId, mediaType)
            .then(function(meta) {
                if (!meta) {
                    console.log('[CF-Index] No TMDB metadata found for ' + tmdbId);
                    resolve([]);
                    return;
                }

                console.log('[CF-Index] TMDB match: ' + meta.title + ' (' + meta.year + ') alt: ' + (meta.altTitle || 'none'));

                fetchDirectory(meta.searchPath)
                    .then(function(folders) {
                        var matched = matchFolder(folders, meta.title, meta.year, meta.altTitle);

                        if (!matched) {
                            console.log('[CF-Index] No matching folder for "' + meta.title + '" in ' + meta.searchPath);
                            resolve([]);
                            return;
                        }

                        console.log('[CF-Index] Matched folder: ' + matched.text);

                        fetchDirectory(matched.href)
                            .then(function(contents) {
                                if (mediaType === 'movie') {
                                    var streams = buildMovieStreams(contents, meta.title, meta.year);
                                    console.log('[CF-Index] Found ' + streams.length + ' movie streams');
                                    resolve(streams);
                                } else {
                                    var seasonFolder = findSeasonFolder(contents, seasonNum);

                                    if (seasonFolder) {
                                        console.log('[CF-Index] Found season folder: ' + seasonFolder.text);
                                        fetchDirectory(seasonFolder.href)
                                            .then(function(episodes) {
                                                var streams = buildEpisodeStreams(
                                                    episodes, meta.title, meta.year, seasonNum, episodeNum
                                                );
                                                console.log('[CF-Index] Found ' + streams.length + ' episode streams');
                                                resolve(streams);
                                            })
                                            .catch(function(err) {
                                                console.error('[CF-Index] Error fetching season:', err.message);
                                                var streams = buildEpisodeStreams(
                                                    contents, meta.title, meta.year, seasonNum, episodeNum
                                                );
                                                resolve(streams);
                                            });
                                    } else {
                                        // No season subfolder — episodes might be directly in show root
                                        console.log('[CF-Index] No season folder, searching in show root');
                                        var streams = buildEpisodeStreams(
                                            contents, meta.title, meta.year, seasonNum, episodeNum
                                        );
                                        console.log('[CF-Index] Found ' + streams.length + ' episode streams (root)');
                                        resolve(streams);
                                    }
                                }
                            })
                            .catch(function(err) {
                                console.error('[CF-Index] Error fetching folder contents:', err.message);
                                resolve([]);
                            });
                    })
                    .catch(function(err) {
                        console.error('[CF-Index] Error fetching directory:', err.message);
                        resolve([]);
                    });
            })
            .catch(function(err) {
                console.error('[CF-Index] Error in getStreams:', err.message);
                resolve([]);
            });
    });
}

// ── Export ──────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
} else {
    global.getStreams = getStreams;
}
