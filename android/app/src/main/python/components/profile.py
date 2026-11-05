"""
Artist & Album profiles
========================
Assemble RICH artist/album pages from multiple sources, best-effort merged.

Playable content comes JioSaavn-first (direct perma_urls — instantly playable).
When JioSaavn is thin (e.g. Western catalog where its artist/album lists come
back empty), we fall back to Last.fm top-tracks / iTunes discography and resolve
each name to a playable JioSaavn stream (the exact pattern radio.py uses).

Rich metadata (the "profile" feel) is merged across sources so a gap in one is
filled by another:
  - image  : TheAudioDB HD  > JioSaavn > iTunes
  - bio    : TheAudioDB EN  > Last.fm  > JioSaavn
  - genre  : TheAudioDB / Last.fm tags
  - founded/country : TheAudioDB
  - listeners / tags / similar artists : Last.fm
  - discography (albums grid) : JioSaavn topAlbums + iTunes albums

ponytail: networked best-effort assembly. Ceiling = source coverage gaps; every
field degrades to empty/None independently and never aborts the page. Upgrade
path: add a real ISRC/MusicBrainz link step for canonical discographies.
"""

import os
import re
import json
import html
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor


from components.fuzz_compat import fuzz
from components.source_merger import SourceMerger
# Reuse the shared singletons + helpers radio already battle-tested.
from components.radio import _lastfm, _resolve
from components.http import SESSION

# ponytail: TheAudioDB public test key "2". Ceiling: shared/rate-limited test key.
# Upgrade path: set TADB_API_KEY to a Patreon key for production.
TADB_KEY = os.getenv("TADB_API_KEY", "2")
TADB_URL = f"https://www.theaudiodb.com/api/v1/json/{TADB_KEY}"

_JS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Referer": "https://www.jiosaavn.com/",
    "Accept": "application/json",
}
_JS_API = "https://www.jiosaavn.com/api.php"

# ponytail: simple in-memory profile cache — profiles barely change, so this
# makes repeat visits instant. Ceiling: unbounded + lost on restart; fine for a
# desktop app session. Upgrade path: TTL + size cap if it ever grows large.
_cache = {}
_cache_lock = threading.Lock()


def _clean(s):
    """Unescape HTML entities JioSaavn returns (&quot;, &amp;, ...)."""
    if not s:
        return ""
    return html.unescape(str(s)).strip()


def _js_bio(raw):
    """JioSaavn artist `bio` arrives as a JSON-encoded list of
    {text, title, sequence} sections (sometimes already a list) — NOT plain
    text. Flatten the section texts in order. Falls back to a plain unescaped
    string for non-JSON bios."""
    if not raw:
        return ""
    data = raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s.startswith("[") and not s.startswith("{"):
            return _clean(s)
        try:
            data = json.loads(s)
        except (ValueError, TypeError):
            return _clean(s)
    if isinstance(data, dict):
        data = [data]
    if isinstance(data, list):
        parts = [_clean(sec.get("text")) for sec in data
                 if isinstance(sec, dict) and sec.get("text")]
        return "\n\n".join(p for p in parts if p)
    return _clean(data)


def _jcall(params):
    """Single JioSaavn api.php GET. Returns parsed dict/list or {} on failure."""
    import urllib.parse
    base = {"_format": "json", "_marker": "0", "ctx": "web6dot0"}
    url = f"{_JS_API}?{urllib.parse.urlencode({**base, **params})}"
    # JioSaavn ignores a "language" query parameter; the languages it serves
    # come from the L cookie, as on its website. Without this every language
    # got the same Hindi/English feed.
    lang = params.get("language")
    cookies = {"L": urllib.parse.quote(lang)} if lang else None
    try:
        return SESSION.get(url, headers=_JS_HEADERS, cookies=cookies, timeout=12).json()
    except Exception:
        return {}


def _ratio(a, b):
    """Fuzzy similarity 0..100 between two names (token-set, case-insensitive).

    Uses fuzz_compat — rapidfuzz on desktop, an equivalent pure-Python
    implementation on Android.

    This used to do `from rapidfuzz import fuzz` INSIDE the function. rapidfuzz
    has no Android wheel, so on-device that import ALWAYS raised — and Python
    does not negatively-cache a failed import, so every call re-walked the whole
    import path, which under Chaquopy means scanning the APK asset importer.
    _ratio runs in loops during artist resolution, album matching and Spotify
    import matching.

    The old fallback was also WRONG, not merely slow: it returned 100/60/0
    buckets, so artist and album matching on Android had been running on a
    three-valued similarity score this whole time.
    """
    return fuzz.token_set_ratio((a or "").lower(), (b or "").lower())


def _plain_ratio(a, b):
    """Length-sensitive ratio (penalizes extra words, unlike token_set)."""
    return fuzz.ratio((a or "").lower(), (b or "").lower())


def _score_artist(query, title):
    """Rank a JioSaavn artist hit against the query, penalizing collaborations
    so e.g. 'Arijit Singh' beats 'Pritam & Arijit Singh' and 'The Weeknd' beats
    'Gesaffelstein & The Weeknd'. token_set_ratio alone scores subsets as 100,
    which is exactly why the naive pick was wrong."""
    q = (query or "").lower().strip()
    t = (title or "").lower().strip()
    if not t:
        return -1
    if q == t:
        return 1000  # exact match always wins
    score = _plain_ratio(q, t)
    qtok, ttok = set(q.split()), set(t.split())
    if qtok and qtok <= ttok:
        score += 50  # all query words present (e.g. "the weeknd" ⊆ title)
    # Collaboration / extra-artist penalty: a "&" or "," in the title (but not
    # the query) signals a joint credit, rarely the canonical solo artist.
    collab = any(c in t for c in ["&", ",", " feat", " ft", " x "])
    q_collab = any(c in q for c in ["&", ",", " feat", " ft"])
    if collab and not q_collab:
        score -= 40
    return score


def _credits(name, artist_str):
    """True if `artist_str` plausibly credits the artist `name` (handles duets /
    multi-artist credit strings). Used to verify that resolved fallback songs
    actually belong to the artist: a SoundCloud uploader / compilation channel
    (e.g. "HouseNatic") resolves its scrobbled titles to real-but-unrelated
    JioSaavn songs whose credits never match the channel name, so they're
    correctly rejected instead of fabricating a profile from them."""
    a = (name or "").lower().strip()
    t = (artist_str or "").lower().strip()
    if not a or not t:
        return False
    if a in t or t in a:
        return True
    return _ratio(name, artist_str) >= 80


def _credits_exact(name, artist_str):
    """Strict version of _credits: one of the credited artists must BE the same
    artist (length-sensitive via _same_artist_name), not merely contain the name
    as a substring. Used for the Last.fm fallback blend so an ambiguous name
    ("Priya") can't be populated from a popular namesake's songs ("Priya
    Saraiya")."""
    for part in re.split(r"[,&/]| feat\.?| ft\.?| x ", artist_str or "", flags=re.IGNORECASE):
        if _same_artist_name(name, part.strip()):
            return True
    return False


def _strip_name(s):
    """Lowercase, strip diacritics, drop every non-alphanumeric char.
    'Beyoncé' → 'beyonce', 'A.R. Rahman' → 'arrahman', 'ColdPlay Wu' → 'coldplaywu'."""
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s)


def _same_artist_name(a, b):
    """True only if two names denote the SAME artist. Accent- and
    punctuation-insensitive, but otherwise EXACT — a one-letter difference is a
    DIFFERENT artist. This is the gate for resolving a credited name to a
    canonical artist (and for trusting a source's by-name lookup).

    Exactness matters: fuzzy matching merged distinct artists — "Codeplay",
    "Coolplay" and "ColdPlay Wu" all scored ~88 against "Coldplay" and wrongly
    inherited Coldplay's page/photo. "A.R. Rahman" == "AR Rahman" and "Beyoncé"
    == "Beyonce" still hold because diacritics/punctuation are normalized away."""
    na, nb = _strip_name(a), _strip_name(b)
    return bool(na) and na == nb


def _norm_title(t):
    """Aggressive title key for de-duping the SAME song repeated across
    compilations ('Oh! Carol' / 'Oh Carol' / 'Oh ! Carol' → 'ohcarol')."""
    return re.sub(r"[^a-z0-9]", "", (t or "").lower())


def _is_combo(name):
    """True if a name is a collaboration / combined credit ("A & B", "A, B",
    "A feat B", "A and B") rather than a standalone artist. Hyphenated duos like
    "Sachin-Jigar" are NOT combos (no separator below matches a bare hyphen)."""
    low = (name or "").lower()
    if any(sep in low for sep in [",", ";", "|", " & ", " feat", " ft.", " ft ", " x "]):
        return True
    # " and " usually joins two credited artists ("Hans Zimmer and Heitor
    # Pereira"), but it's also part of band names ("Florence and the Machine").
    # Treat as a combo only when the part after "and" is NOT an article-led band
    # fragment (the/his/her/their/los/las/le/la/der/die/das).
    # ponytail: word-level heuristic. Ceiling = article-less duos ("Hall and
    # Oates", "Simon and Garfunkel") are wrongly dropped; upgrade path is a
    # known-artist lookup to confirm both halves are real solo artists.
    m = re.search(r"\band\s+(.+)$", low)
    if m and not re.match(r"(the|his|her|their|los|las|le|la|der|die|das)\b", m.group(1).strip()):
        return True
    return False


def _token_from_url(url):
    """Last path segment of a JioSaavn entity URL = its API token."""
    return (url or "").rstrip("/").split("/")[-1]


def _int_or_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _song_to_raw(s):
    """Normalize a JioSaavn song object (from autocomplete / album-details /
    artist-topSongs — three different shapes) into the raw dict SourceMerger
    expects (JioSaavnSong.to_dict shape). Returns None if not a playable song."""
    if not isinstance(s, dict):
        return None
    mi = s.get("more_info") or {}
    am = mi.get("artistMap") or {}
    # title lives in 'title' (autocomplete/artist) or 'song' (album-details flat)
    title = _clean(s.get("title") or s.get("song"))
    album = _clean(s.get("album") or mi.get("album"))
    # Prefer explicit credits / artistMap. JioSaavn artist-page topSongs often
    # have NO primary_artists and only a 'subtitle' shaped "Artist - Album",
    # which previously polluted the artist field (e.g. "Neil Sedaka - Rockin'
    # With Sedaka") and broke "Go to artist". Use subtitle only as a last
    # resort, stripping a trailing "- <album>".
    map_artists = ", ".join(
        a.get("name", "") for a in (am.get("primary_artists") or am.get("artists") or [])
        if isinstance(a, dict) and a.get("name")
    )
    artist = _clean(
        s.get("primary_artists") or s.get("singers")
        or mi.get("primary_artists") or mi.get("artistMap_str") or map_artists
    )
    if not artist:
        sub = _clean(s.get("subtitle"))
        if album and sub.lower().endswith(album.lower()):
            sub = sub[: -len(album)].rstrip(" -–·\t").strip()
        artist = sub
    # Some JioSaavn titles carry a redundant leading "Artist - " prefix
    # ("Neil Sedaka - Oh Carol"). Strip it when it matches the credited artist
    # (also lets such entries de-dupe against the clean title).
    if artist and title.lower().startswith(artist.lower() + " - "):
        title = title[len(artist) + 3:].strip()
    url = s.get("perma_url") or s.get("url") or ""
    # Only /song/ URLs are directly playable; albums/playlists are not.
    if "/song/" not in url:
        return None
    duration = s.get("duration") or mi.get("duration")
    try:
        duration = int(duration) if duration is not None else None
    except (ValueError, TypeError):
        duration = None
    return {
        "source_type": "jiosaavn",
        "id": str(s.get("id", "")),
        "title": title,
        "artist": artist,
        "album": album,
        "image_url": s.get("image", ""),
        "url": url,
        "duration": duration,
        "duration_sec": duration,
        "year": s.get("year"),
        "language": s.get("language") or mi.get("language"),
    }


def _track_art(track):
    """Best artwork URL from a track dict (SourceMerger to_dict uses the
    `artwork_urls` size->URL map; there is no single `artwork_url` key)."""
    au = (track or {}).get("artwork_urls") or {}
    for v in au.values():
        if isinstance(v, str) and v:
            return v
    return (track or {}).get("artwork_url") or ""


def _album_tracks(songs):
    """A JioSaavn album's songs as playable tracks, every one in its place.

    One at a time, not through one merge: SourceMerger folds what it takes
    for the same song together, and inside an album that is the original
    and its remaster, the song and its live take (RÜFÜS DU SOL's "Atlas
    (10 Year Anniversary)" opened with 11 of its 26). A song JioSaavn lists
    without a stream is found elsewhere (YouTube) by name, in its place."""
    slots, missing = [], []
    for s in songs:
        raw = _song_to_raw(s)
        made = _make_playable([raw]) if raw else []
        if made:
            slots.append(made[0])
        else:
            title = _clean((s or {}).get("title") or (s or {}).get("song"))
            mi = (s or {}).get("more_info") or {}
            artist = _clean((s or {}).get("primary_artists") or mi.get("artistMap_str")
                            or ", ".join(a.get("name", "") for a in
                                         ((mi.get("artistMap") or {}).get("primary_artists") or [])
                                         if isinstance(a, dict)))
            slots.append(None)
            if title:
                missing.append((len(slots) - 1, title, artist))
    if missing:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for (i, _, _), d in zip(missing, ex.map(lambda m: _resolve_multi(m[1], m[2]), missing)):
                slots[i] = d
    return [t for t in slots if t]


def _make_playable(raw_songs):
    """Run raw JioSaavn song dicts through SourceMerger → frontend track dicts."""
    raw = [r for r in (raw_songs or []) if r]
    if not raw:
        return []
    merged = SourceMerger().merge_search_results(jiosaavn_results=raw)
    return [t.to_dict() for t in merged if getattr(t, "primary_source", None)]


# ── Multi-source fallback (used only AFTER a JioSaavn miss) ──────────────────
# A lazily-built search service restricted to the PLAYABLE sources, so a track
# JioSaavn doesn't have can still be found on SoundCloud / YouTube. YouTube
# *search* needs no cookies; streaming uses the user's connected cookies at
# playback time (see _resolve_stream_url) — so this works regardless.
_fb_service = None
_fb_lock = threading.Lock()


def _fallback_search_service():
    global _fb_service
    with _fb_lock:
        if _fb_service is None:
            from components.unified_search import UnifiedSearchService, SearchConfig
            from components.source_merger import SourceType
            cfg = SearchConfig(
                # No SoundCloud: previews, DRM and copies (mobile_server _rematch).
                enabled_sources={SourceType.JIOSAAVN, SourceType.YOUTUBE},
                max_results_per_source=5,
                max_total_results=8,
                timeout_seconds=12.0,
            )
            _fb_service = UnifiedSearchService(config=cfg)
        return _fb_service


def _same_song(name, artist, d):
    """Guard against the fallback substituting a WRONG same-ish song: the found
    track's title must (fuzzily / by-substring) match the requested name AND,
    when both artists are known, share at least one word. Mirrors the frontend
    matchesTrack safety net so an album never fills with imposters."""
    from components import search_rank as sr
    title = d.get("title") or ""
    # The same song's name once packaging brackets go ("(feat. Lulu James)",
    # "(From ...)") and version ones stay ("[Live]"): iTunes lists features
    # in the title, JioSaavn in the credits, and half of an album (Lane 8's
    # "Rise", 5 of 11) failed this check while JioSaavn had every song.
    same_core = bool(sr.core_title(name)) and sr.core_title(name) == sr.core_title(title)
    if (not same_core and _plain_ratio(name, title) < 80
            and _norm_title(name) not in _norm_title(title)):
        return False
    # Another version is another recording: "Alfaaz" is not "Alfaaz -
    # Acoustic", though one name holds the other. An album opened with the
    # acoustic take in place of its song.
    if sr.version_words(name) != sr.version_words(title):
        return False
    da = d.get("artist") or ""
    if not artist or not da:
        return True  # no artist to corroborate → trust the title match
    aw = {w for w in re.split(r"[^a-z0-9]+", artist.lower()) if len(w) > 1}
    dw = {w for w in re.split(r"[^a-z0-9]+", da.lower()) if len(w) > 1}
    return bool(aw & dw)


def _resolve_multi(name, artist):
    """Fallback resolver for ONE (name, artist) JioSaavn couldn't find: full
    multi-source search → the best PLAYABLE match as a finished frontend track
    dict, or None. Called only after _resolve (JioSaavn) misses."""
    q = f"{name} {artist}".strip()
    if not q:
        return None
    try:
        results = _fallback_search_service().search(q)
    except Exception:
        return None
    for t in results:
        d = t.to_dict() if hasattr(t, "to_dict") else t
        srcs = d.get("sources") or {}
        if not any((srcs.get(s) or {}).get("url")
                   for s in ("jiosaavn", "soundcloud", "youtube", "youtube_music")):
            continue
        if _same_song(name, artist, d):
            return d
    return None


def _resolve_names(pairs, limit, shown=None):
    """Resolve (name, artist) pairs to playable tracks, preserving order.

    JioSaavn first (fast, our primary source — UNCHANGED happy path). For any
    pair JioSaavn can't find, fall back to a full multi-source search
    (SoundCloud/YouTube) — but ONLY after the JioSaavn miss, so tracks that ARE
    on JioSaavn pay zero extra latency. This is what lets Western/electronic
    albums whose songs aren't on JioSaavn (e.g. anjunadeep releases) resolve via
    YouTube/SoundCloud instead of coming back empty.

    ponytail: the fallback adds one multi-source search per missed track (capped
    by `limit + 6` and parallelized). Ceiling: a fully-non-JioSaavn album of N
    tracks does N searches (~slower first load, then cached). Happy path (all on
    JioSaavn) is byte-for-byte the old behavior plus a no-op empty-misses check."""
    if not pairs:
        return []
    sub = pairs[: limit + 6]
    with ThreadPoolExecutor(max_workers=8) as ex:
        js_raw = list(ex.map(_resolve, sub))   # raw jiosaavn dict | None, aligned with sub

    # Accept a JioSaavn hit ONLY if it's actually THIS song. JioSaavn's search
    # returns an arbitrary top match for off-catalog names (e.g. "In Peace /
    # Cold Blue" → "Blue Flags / Cold Like Minnesota"), which would silently fill
    # an album with imposters. A mismatch counts as a MISS → multi-source
    # fallback finds the real track on SoundCloud/YouTube.
    slots = [None] * len(sub)
    missed = []
    for i, (r, (name, artist)) in enumerate(zip(js_raw, sub)):
        if r:
            m = _make_playable([r])
            if m and _same_song(name, artist, m[0]):
                slots[i] = m[0]
                continue
        missed.append(i)

    # Multi-source fallback for the misses (parallel). Only runs AFTER JioSaavn
    # missed (or returned the wrong song), so on-JioSaavn tracks pay nothing.
    if missed:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for i, d in zip(missed, ex.map(lambda i: _resolve_multi(*sub[i]), missed)):
                if d:
                    slots[i] = d

    # Each song by its name as written, when it was found by another
    # (a Japanese album's songs, found by their romaji names: see
    # _itunes_lookup).
    if shown:
        for i, t in enumerate(slots):
            if t and i < len(shown) and shown[i]:
                t["title"] = shown[i]
    # Preserve original (tracklist) order; drop unresolved slots.
    return [t for t in slots if t][:limit]


# ──────────────────────────── enrichment sources ────────────────────────────

def _audiodb_artist(name):
    """TheAudioDB artist lookup → HD images, bio, genre, founded year, country."""
    try:
        d = SESSION.get(f"{TADB_URL}/search.php", params={"s": name}, timeout=10).json()
    except Exception:
        return {}
    arts = (d or {}).get("artists") or []
    if not arts:
        return {}
    a = arts[0]
    return {
        "image": a.get("strArtistThumb") or "",
        "banner": a.get("strArtistFanart") or a.get("strArtistWideThumb") or "",
        "logo": a.get("strArtistLogo") or "",
        "bio": (a.get("strBiographyEN") or "").strip(),
        "genre": a.get("strGenre") or a.get("strStyle") or "",
        "founded": a.get("intFormedYear") or a.get("intBornYear") or "",
        "country": a.get("strCountry") or "",
    }


def _lastfm_artist(name):
    """Last.fm artist.getInfo → listeners, tags, bio, similar artists."""
    d = _lastfm("artist.getinfo", artist=name)
    a = (d or {}).get("artist") or {}
    if not a:
        return {}
    # Last.fm autocorrects "Codeplay" → "Coldplay" and returns a DIFFERENT
    # artist's bio/listeners/similar. Trust it only on an exact-name match.
    if not _same_artist_name(name, a.get("name", "")):
        return {}
    stats = a.get("stats") or {}
    tags = [t["name"] for t in (a.get("tags") or {}).get("tag", []) if t.get("name")]
    similar = [
        {"name": s.get("name", ""),
         "image": next((i.get("#text") for i in s.get("image", []) if i.get("size") == "large" and i.get("#text")), "")}
        for s in (a.get("similar") or {}).get("artist", []) if s.get("name")
    ]
    bio = ((a.get("bio") or {}).get("content") or "").split("<a ")[0].strip()
    return {
        "listeners": int(stats["listeners"]) if str(stats.get("listeners", "")).isdigit() else None,
        "tags": tags,
        "bio": bio,
        "similar": similar,
    }


def _lastfm_top_tracks(name, limit):
    """Last.fm artist.getTopTracks → (track, artist) name pairs (Western fallback)."""
    d = _lastfm("artist.gettoptracks", artist=name, limit=limit)
    return [(t.get("name"), name) for t in (d.get("toptracks", {}) or {}).get("track", []) if t.get("name")]


def _itunes_albums(name, limit=12):
    """iTunes artist→albums (clean Western discography). Returns album card dicts."""
    try:
        from components.itunes_client import iTunesClient
        c = iTunesClient()
        artists = c.search_artists(name, limit=1)
        if not artists:
            return []
        # Name-gate: iTunes fuzzy-matches "Codeplay"/"Coolplay" → "Coldplay" and
        # would return the WRONG artist's whole discography. Only trust an
        # exact-name match.
        if not _same_artist_name(name, artists[0].name):
            return []
        aid = artists[0].artist_id

        def albums_in(country):
            try:
                return [r for r in c._lookup({"id": aid, "entity": "album", "limit": limit,
                                              "country": country}).get("results", [])
                        if r.get("wrapperType") == "collection"]
            except Exception:
                return []

        def native_names(country):
            """{album id: its name as written} from the store's song search:
            a lookup gives albums in romaji even in their own store, a
            search's songs carry the album's real name."""
            try:
                hits = c._search({"term": name, "entity": "song", "limit": 200,
                                  "country": country}).get("results", [])
            except Exception:
                return {}
            return {r.get("collectionId"): r.get("collectionName") for r in hits
                    if str(r.get("artistId")) == str(aid)
                    and _native_store(r.get("collectionName"))}

        with ThreadPoolExecutor(max_workers=3) as ex:
            us_f = ex.submit(albums_in, "US")
            jp_f = ex.submit(native_names, "JP")
            kr_f = ex.submit(native_names, "KR")
            rows = us_f.result()
            native = jp_f.result() or kr_f.result()
        out = []
        for r in rows:
            if native.get(r.get("collectionId")):
                r = {**r, "collectionName": native[r.get("collectionId")]}
            if r.get("wrapperType") != "collection":
                continue
            art100 = r.get("artworkUrl100", "")
            out.append({
                "name": _clean(r.get("collectionName")),
                "artist": _clean(r.get("artistName")),
                "image": art100.replace("100x100", "600x600"),
                # The exact release, opened by it (_build_album): by name, "Awake"
                # found Tycho's single of that name, not the album.
                "album_id": f"itunes:{r.get('collectionId')}" if r.get("collectionId") else "",
                "track_count": r.get("trackCount"),
                "year": (r.get("releaseDate") or "")[:4],
                "source": "itunes",
            })
        return out
    except Exception:
        return []


def _url_ok(url):
    """True if an image URL is actually reachable. Some JioSaavn CDN cover
    links are dead 404s (e.g. older soundtracks), so we validate before trusting
    them. Fetches a single byte to stay cheap."""
    if not url:
        return False
    try:
        r = SESSION.get(url, headers={"User-Agent": "Mozilla/5.0", "Range": "bytes=0-0"},
                         timeout=5, stream=True)
        ok = r.status_code in (200, 206)
        r.close()
        return ok
    except Exception:
        return False


def _itunes_album_cover(name, artist=""):
    """Best 600px album cover from iTunes for (name, artist), or '' — a reliable
    fallback when JioSaavn returns a dead/low-res cover link. Name-match gated."""
    try:
        from components.itunes_client import iTunesClient
        c = iTunesClient()
        for al in c.search_albums(f"{name} {artist}".strip(), limit=5):
            if _ratio(name, al.name) >= 65 and al.artwork_url_100:
                return al.artwork_url_100.replace("100x100", "600x600")
    except Exception:
        pass
    return ""


# Derivative / not-the-artist names: tribute bands, karaoke, cover &
# instrumental renditions, etc. They have real catalog pages (a fan count alone
# won't filter them) but they're never the artist a user means when searching.
_NONARTIST_RE = re.compile(
    r"\b(tribute|karaoke|covers|cover band|instrumental|lullab(?:y|ies)|"
    r"piano (?:cover|version|tribute)|made famous|made popular|originally performed|"
    r"in the style of|8[\s-]?bit|ringtone|workout|meditation|mindfulness|"
    r"backing track|string quartet|"
    # Compilation / playlist / "various artists" accounts — real catalog
    # entities with fan counts, but NOT artists ("Pop Hits", "Top 40 Pop Hits",
    # "Ultimate Pop Hits", "Hits Variété Pop", "Various Artists", "Megamix"…).
    r"hits|various artists|compilation|mega ?mix|non[\s-]?stop|top \d+|"
    r"dance party|the collection)\b", re.I)


def _is_nonartist(name):
    """True for derivative 'artists' (tribute/karaoke/cover/instrumental/…) — real
    catalog entities, but never the artist the user searched for."""
    return bool(_NONARTIST_RE.search(name or ""))


def _jiosaavn_artist_real(name):
    """STRICT existence check: does JioSaavn list an artist whose name (near-)
    EQUALS `name`? Unlike _credits (which substring-matches both ways), this uses
    a length-sensitive ratio, so concatenated autocomplete junk like "Yellow
    Coldplay" / "Coldplay Chris Martin" — whose songs are merely credited
    "Coldplay" — is REJECTED, while a real artist JioSaavn lists by (almost) this
    exact name passes. ~1 network call; used to vet JioSaavn-only search hits."""
    name = (name or "").strip()
    if not name:
        return False
    sr = _jcall({"__call": "search.getResults", "q": name, "p": "1", "n": "4",
                 "api_version": "4"})
    results = sr.get("results", []) if isinstance(sr, dict) else []
    for s in results:
        mi = s.get("more_info") or {}
        am = mi.get("artistMap") or {}
        for a in (am.get("primary_artists") or am.get("artists") or []):
            if _plain_ratio(name, a.get("name", "")) >= 85:
                return True
    return False


def _artist_has_content(name):
    """Quick single-call check: does JioSaavn have songs that actually credit
    this artist? A cheap proxy for "we can open a real profile" — used to gate
    'Fans also like' so we never show dead-end cards (a Last.fm similar-artist
    edge can name someone we have zero playable data for). ~1 network call;
    keeps faceless-but-playable artists (e.g. "TM3"), drops empty names."""
    name = (name or "").strip()
    if not name:
        return False
    sr = _jcall({"__call": "search.getResults", "q": name, "p": "1", "n": "4", "api_version": "4"})
    results = sr.get("results", []) if isinstance(sr, dict) else []
    for s in results:
        mi = s.get("more_info") or {}
        am = mi.get("artistMap") or {}
        cand = [a.get("name", "") for a in (am.get("primary_artists") or am.get("artists") or [])]
        cand.append((s.get("subtitle") or "").split(" - ")[0])
        if any(_credits(name, c) for c in cand):
            return True
    return False


def _deezer_search_artists(query, limit):
    """Deezer artist index → [{name, image, fans}] (Western coverage + photos)."""
    try:
        r = SESSION.get("https://api.deezer.com/search/artist",
                         params={"q": query, "limit": limit + 8}, timeout=8)
        data = (r.json() or {}).get("data", [])
    except Exception:
        return []
    out = []
    for a in data:
        nm = _clean(a.get("name"))
        if nm:
            out.append({
                "name": nm,
                "image": a.get("picture_xl") or a.get("picture_big") or a.get("picture_medium") or "",
                "fans": a.get("nb_fan"),
            })
    return out


def _jiosaavn_search_artists(query, limit):
    """JioSaavn autocomplete artists → [{name, image, fans=None}]. Indian-catalog
    coverage + typo tolerance (matches "Shankar–Ehsaan–Loy" for "shankar ehsan
    loy"). No fan counts here — ranking handles that."""
    ac = _jcall({"__call": "autocomplete.get", "query": query})
    hits = (ac.get("artists", {}) or {}).get("data", []) if isinstance(ac, dict) else []
    out = []
    for h in hits[: limit + 4]:
        nm = _clean(h.get("title"))
        if nm:
            out.append({"name": nm, "image": h.get("image", ""), "fans": None})
    return out


def top_artist_hint(query):
    """JioSaavn's own top match for a half-typed search, when it is an artist:
    {name, image} or None. One row for the search-as-you-type list.

    Measured on 35 typed searches (2026-10-09): autocomplete's top match named
    the artist for all 7 artist searches ("arij" -> Arijit Singh) and was never
    an artist for the 28 song searches. Its songs and albums were worse than
    search.getResults (lofi / slowed copies, compilation pressings), so this
    one row is all that is taken from it."""
    ac = _jcall({"__call": "autocomplete.get", "query": query})
    data = ((ac.get("topquery") or {}).get("data") or []) if isinstance(ac, dict) else []
    top = data[0] if data and isinstance(data[0], dict) else None
    if not top or top.get("type") != "artist":
        return None
    name = _clean(top.get("title"))
    img = top.get("image") or ""
    img = "" if "artist-default" in img else re.sub(r"\d+x\d+(?=\.\w+$)", "150x150", img)
    return {"name": name, "image": img} if name else None


def _jiosaavn_artist_photos(query, limit):
    """{normalized name: official photo} from JioSaavn's artist search.

    Photos only, never new results. Deezer's index has same-name strangers
    (its only "Aditya Rikhari" is someone else, 883 fans), and the first
    search hit's photo is what the Recap and "Your artists" keep. JioSaavn's
    photo belongs to the artist whose songs we actually play. Its search puts
    the real artist first with a 50x50 photo (scaled up here); the junk
    entities behind it carry a placeholder, which is skipped."""
    sr = _jcall({"__call": "search.getArtistResults", "q": query, "p": "1",
                 "n": str(limit), "api_version": "4"})
    hits = sr.get("results", []) if isinstance(sr, dict) else []
    out = {}
    for h in hits:
        img = h.get("image") or ""
        key = re.sub(r"[^a-z0-9]", "", _clean(h.get("name") or h.get("title")).lower())
        if key and img and "artist-default" not in img and key not in out:
            out[key] = re.sub(r"\d+x\d+(?=\.\w+$)", "500x500", img)
    return out


def search_artists(query, limit=10):
    """Real artist search for the search page's Artists section.

    Two complementary sources, merged + de-duped:
      • Deezer artist index — Western coverage, photos, fan counts.
      • JioSaavn autocomplete artists — Indian catalog + typo tolerance.
    Collaboration entities ("A & B") are dropped, and the SAME artist written
    with different punctuation ("Shankar Ehsaan Loy" / "Shankar-Ehsaan-Loy" /
    "Shankar - Ehsaan - Loy") is collapsed to one (normalized-name key).

    A popular song's title answers with that song's artists first
    (_song_artists); otherwise names that ARE what was typed, exact before
    fans. Measured on 21 searches (2026-11-05): "blinding lights" was three
    acts named after the song and no Weeknd, "kesariya" a "Mariya Takeuchi",
    "natalie holt" Natalie Cole first; all now answer with the artist meant.
    Never raises."""
    query = (query or "").strip()
    if not query:
        return []
    with ThreadPoolExecutor(max_workers=4) as ex:
        f_dz = ex.submit(_deezer_search_artists, query, limit)
        f_js = ex.submit(_jiosaavn_search_artists, query, limit)
        f_ph = ex.submit(_jiosaavn_artist_photos, query, limit)
        f_song = ex.submit(_song_artists, query)
        f_hint = ex.submit(top_artist_hint, query)
        dz, js, photos = f_dz.result(), f_js.result(), f_ph.result()
        song_artists = f_song.result()
        hint = f_hint.result()
    # JioSaavn's own top match is this artist: an artist search, whatever a
    # song titled with their name ("Cold Blue" by R Denham) suggests.
    if hint and _fold_name(hint.get("name")) == _fold_name(query):
        song_artists = []

    merged = {}
    _noise = lambda s: sum(1 for c in s if not c.isalnum() and not c.isspace())

    def _absorb(dst, a):
        """Fold variant `a` into kept entry `dst`: max fans, best image, and the
        more popular spelling (tie → the one with less punctuation)."""
        fa, fb = dst.get("fans"), a.get("fans")
        more_popular = (fb or 0) > (fa or 0)
        tie = (fb or 0) == (fa or 0)
        if more_popular or (tie and _noise(a["name"]) < _noise(dst["name"])):
            dst["name"] = a["name"]
        if not dst.get("image") and a.get("image"):
            dst["image"] = a["image"]
        if fa is None:
            dst["fans"] = fb
        elif fb is not None:
            dst["fans"] = max(fa, fb)

    for a in dz + js:  # Deezer first → its image/fans seed the entry
        nm = a["name"]
        if not nm or _is_combo(nm):
            continue
        key = re.sub(r"[^a-z0-9]", "", nm.lower())
        if not key:
            continue
        if key in merged:
            _absorb(merged[key], a)
        else:
            merged[key] = dict(a)

    # Collapse "First Middle Last" into an existing "First Last" — the same
    # person written with a middle name ("Hans Florian Zimmer" → "Hans Zimmer",
    # "John Towner Williams" → "John Williams"). Conservative: only when the
    # first+last of a 3+-token name exactly matches a kept 2-token artist.
    for key in list(merged.keys()):
        if key not in merged:
            continue
        toks = merged[key]["name"].split()
        if len(toks) >= 3:
            fl = re.sub(r"[^a-z0-9]", "", (toks[0] + toks[-1]).lower())
            if fl != key and fl in merged:
                _absorb(merged[fl], merged.pop(key))

    # The official JioSaavn photo wins over Deezer's (see _jiosaavn_artist_photos).
    for key, a in merged.items():
        if key in photos:
            a["image"] = photos[key]

    # ── Who is shown, in this order:
    #   1. The artists of the SONG typed. A search is a song's name far more
    #      often than an artist's, and the old section answered "blinding
    #      lights" with acts NAMED "Blinding Lights" (a cover account, a noise
    #      channel) and no Weeknd. JioSaavn's song search says who sang it.
    #   2. Artists whose name IS what was typed: near-equal, or the typed
    #      words as the start of the name ("arijit" -> Arijit Singh). A name
    #      that merely contains the words ("Too Close To The Weeknd") or is
    #      only famous ("Faye Wong" for "the weeknd", the old 10k-fans rule)
    #      no longer qualifies.
    # When the query is a song's title, a same-named act also needs a real
    # following to stand beside the song's own artists.
    # Ordered by how well the name matches before fans: "natalie holt" put
    # Natalie Cole (158k fans) above Natalie Holt.
    qf = _fold_name(query)
    song_query = bool(song_artists)
    SONG_QUERY_FANS = 50000

    def _key(nm):
        return re.sub(r"[^a-z0-9]", "", (nm or "").lower())

    out, seen = [], set()
    for a in song_artists:
        key = _key(a["name"])
        if not key or key in seen:
            continue
        seen.add(key)
        known = merged.get(key) or {}
        out.append({
            "name": a["name"],
            "image": photos.get(key) or known.get("image") or a.get("image") or "",
            "fans": known.get("fans"),
        })

    has_exact = any(_fold_name(a["name"]) == qf for a in merged.values())
    candidates = []  # (artist, exact, needs_jiosaavn_check)
    for key, a in merged.items():
        name = a["name"]
        if key in seen or _is_combo(name) or _is_nonartist(name):
            continue
        nf = _fold_name(name)
        exact = nf == qf
        prefix = len(qf) >= 3 and nf.startswith(qf + " ")
        # A misspelling's lookalikes ("Codeplay" for "coldplay") only when
        # nothing is called exactly what was typed: then they are the typo's
        # best guesses, otherwise they are noise.
        near = not has_exact and _plain_ratio(qf, nf) >= 85
        if not (exact or prefix or near):
            continue
        fans = a.get("fans")
        if not exact and fans is not None and fans < 100:
            continue               # "Arijit Dey", 6 fans: not who was meant
        if song_query and exact:
            # Named like a popular song: shown beside its artists only with a
            # following of its own ("Starboy", "Perfect"), and only if JioSaavn
            # has it as an artist (a page with its own photo, or credits on
            # songs) and not as a cover account named after the song
            # ("Blinding Lights": JioSaavn's entry is a placeholder face).
            if (fans or 0) < 10000:
                continue
            candidates.append((a, True, key not in photos))
            continue
        if song_query and (fans or 0) < SONG_QUERY_FANS:
            continue
        candidates.append((a, exact, fans is None))

    # Names with no fan count, and same-named acts of a song query, are
    # checked to be real artists: autocomplete also returns junk like
    # "Yellow Coldplay".
    need = [i for i, (_, _, n) in enumerate(candidates) if n]
    drop = set()
    if need:
        with ThreadPoolExecutor(max_workers=min(6, len(need))) as ex:
            oks = list(ex.map(lambda i: _jiosaavn_artist_real(candidates[i][0]["name"]), need))
        drop = {need[k] for k, ok in enumerate(oks) if not ok}
    named = [(a, exact) for i, (a, exact, _) in enumerate(candidates) if i not in drop]

    # An exact name counts ten times its fans: "Arijit" (62 fans) stays
    # below Arijit Singh, Natalie Holt above Natalie Cole. Unknown fans (a
    # JioSaavn-only artist, checked real above) count as a modest following.
    def weight(ae):
        a, exact = ae
        f = a.get("fans")
        return (f if f is not None else 1000) * (10 if exact else 1)
    named.sort(key=weight, reverse=True)
    # The artist named exactly leads. For a song query the song's own artists
    # come first instead, unless that act is well known in its own right
    # ("Starboy"); a small same-named act ("Hymn for the Weekend", 454 fans;
    # "Running Touch") follows the song's credits.
    top = named[0] if named else None
    lead = ([top[0]] if top and top[1]
            and (not song_query or (top[0].get("fans") or 0) >= SONG_QUERY_FANS)
            else [])
    rest = [a for a, _ in named if not lead or a is not lead[0]]
    return (lead + out + rest)[:limit]


def _fold_name(s):
    """A name for comparing: lower case, accents and punctuation gone."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s.lower())).strip()


# Plays a JioSaavn song needs before a search for its title is taken to mean
# it (see _song_artists): measured 2026-11-05, songs people mean have 1M+, a
# title that only matches has none or under 100k.
SONG_MIN_PLAYS = 250_000


def _song_artists(query, songs=1):
    """The credited artists of the song `query` names, or [] when it names no
    song: [{name, image}], main artists of the best matches, in credit order.

    A JioSaavn song counts when the query is plainly that song (its title,
    or its title and artist: search_rank.relevance >= 90). "kesariya" is
    Pritam, Arijit Singh and Amitabh Bhattacharya; "coldplay" names no song."""
    from components import search_rank as sr
    res = _jcall({"__call": "search.getResults", "q": query, "p": "1", "n": "6",
                  "api_version": "4"})
    results = res.get("results", []) if isinstance(res, dict) else []
    out, seen, used = [], set(), 0
    for s in results:
        if used >= songs:
            break
        mi = s.get("more_info") or {}
        am = mi.get("artistMap") or {}
        primary = [a for a in (am.get("primary_artists") or []) if isinstance(a, dict)]
        credit = ", ".join(_clean(a.get("name")) for a in primary)
        if not primary or sr.relevance(query, _clean(s.get("title")), credit) < 90:
            continue
        # A song people mean has plays: Anti-Hero 1.9M, Blinding Lights 39M.
        # A title that only happens to be the query ("Running Touch" by Adam
        # Marsh, none; an "atif aslam" upload, 75k) is not the song asked for.
        try:
            plays = int(s.get("play_count") or 0)
        except (TypeError, ValueError):
            plays = 0
        if plays < SONG_MIN_PLAYS:
            continue
        # The query is one of the song's artists ("melezz", "atif aslam"):
        # an artist search, whose own name section answers it. Their
        # collaborators are not who was asked for.
        if any(_fold_name(a.get("name")) == _fold_name(query) for a in primary):
            return []
        used += 1
        for a in primary:
            nm = _clean(a.get("name"))
            if nm and not _is_combo(nm) and nm.lower() not in seen:
                seen.add(nm.lower())
                img = a.get("image") or ""
                img = "" if "artist-default" in img else re.sub(r"\d+x\d+(?=\.\w+$)", "500x500", img)
                out.append({"name": nm, "image": img})
    return out[:4]


def _deezer_artist(name):
    """Deezer artist search → HD image (picture_xl) + fan count. Deezer's track
    search is geo-blocked for us, but artist search works and has the best free
    artist photos — so we use it purely for imagery + fan stats. Cached."""
    key = ("deezer", (name or "").lower().strip())
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    out = {}
    try:
        r = SESSION.get("https://api.deezer.com/search/artist",
                         params={"q": name, "limit": 8}, timeout=8)
        # Strict same-artist name match (length-sensitive) so an ambiguous
        # bare name ("Priya") never borrows the popular namesake's photo
        # ("Priya Saraiya"). Of those, the most followed: Deezer keeps
        # duplicate pages, and its first was often one ("Hans Zimmer", 18
        # fans, before the real one's 2.1M; "Bonobo" 75 before 366k), whose
        # photo and count the page showed.
        same = [a for a in (r.json() or {}).get("data", [])[:8]
                if _same_artist_name(name, a.get("name", ""))]
        if same:
            a = max(same, key=lambda a: a.get("nb_fan") or 0)
            out = {
                "image": a.get("picture_xl") or a.get("picture_big") or "",
                "fans": a.get("nb_fan"),
            }
    except Exception:
        pass
    with _cache_lock:
        _cache[key] = out
    return out


# Last.fm's page for a name several artists share lists them all.
_AMBIGUOUS_BIO = re.compile(r"\s*(there (are|is) (at least )?(\d+|several|multiple|two|three)\b)", re.I)


def _clean_bio(text):
    """A biography as plain prose: no links, no "Read more on Last.fm"."""
    t = re.sub(r"<[^>]+>", " ", text or "")
    t = re.sub(r"Read more on Last\.fm.*$", "", t, flags=re.I | re.S)
    t = re.sub(r"\(?https?://\S+\)?", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def _brief(text, limit=320):
    """The first sentences of `text`, whole, up to about `limit` characters:
    who the artist is, not their life story. At least one sentence."""
    first = (text or "").split("\n\n")[0].strip()
    # A full stop that ends a sentence: not "St. ", "Mr. " or an initial.
    parts = re.split(r"(?<!\bSt\.)(?<!\bMr\.)(?<!\bDr\.)(?<!\bJr\.)(?<!\bSr\.)"
                     r"(?<!\bMrs\.)(?<!\bvs\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+(?=[A-Z\"'(])", first)
    out = ""
    for p in parts:
        if out and len(out) + len(p) + 1 > limit:
            break
        out = f"{out} {p}".strip()
    return out


def _vet_similar(similar):
    """Filter 'Fans also like' to artists we can actually open + give a photo.

    Each similar artist gets a quick existence check (so we never show dead-end
    cards — a Last.fm similar edge can name someone with no openable profile)
    and, if it survives, its photo is filled from Deezer (Last.fm artist images
    are deprecated placeholders). Both run in one parallel pass. A faceless but
    playable artist (e.g. "TM3") is KEPT — we only drop the truly empty ones."""
    if not similar:
        return []
    def _vet(s):
        if not _artist_has_content(s["name"]):
            return None
        if not s.get("image"):
            s["image"] = _deezer_artist(s["name"]).get("image", "")
        return s
    with ThreadPoolExecutor(max_workers=8) as ex:
        return [r for r in ex.map(_vet, similar) if r]


# ──────────────────────────── public: ARTIST ────────────────────────────────

def _jiosaavn_artist_token(name):
    """Find the CANONICAL JioSaavn artist token for `name`.

    JioSaavn's autocomplete artist results are unreliable — they return
    collaboration entities ("Pritam & Arijit Singh" for "Arijit Singh",
    "Sunidhi Chauhan & Neeraj Shridhar" for "Neeraj Shridhar"). But a SONG
    search returns `more_info.artistMap` with each artist's real canonical id +
    perma_url. So we search songs and pull the best-matching artist's token.
    Returns '' when no confident match is found."""
    sr = _jcall({"__call": "search.getResults", "q": name, "p": "1", "n": "8", "api_version": "4"})
    results = sr.get("results", []) if isinstance(sr, dict) else []
    best_tok, best_name, best_score = "", "", -1
    for s in results:
        am = (s.get("more_info") or {}).get("artistMap") or {}
        candidates = (am.get("primary_artists") or []) + (am.get("artists") or [])
        for a in candidates:
            sc = _score_artist(name, a.get("name", ""))
            if sc > best_score:
                best_score = sc
                best_tok = _token_from_url(a.get("perma_url", ""))
                best_name = a.get("name", "")
    # Accept only a same-artist NAME match (length-sensitive). A bare "Priya"
    # must never resolve to a different, longer "Priya Saraiya" just because it's
    # a subset — that opened a stranger's profile. The credited name we navigate
    # from is JioSaavn's own, so the real artist matches near-exactly.
    if best_score >= 85 and _same_artist_name(name, best_name):
        return best_tok
    return ""


def _artist_token_from_song(name, song_url):
    """The JioSaavn token of the artist called `name` ON THIS SONG, or ''.

    Exact where the name search guesses: the song's own credits (artistMap)
    carry every credited artist's page, so the artist tapped on a song opens
    that artist and never a same-named stranger or a variant spelling
    ("Natalie Ann Holt"). One call; '' when the song is not JioSaavn's or
    does not credit the name, and the name search takes over."""
    tok = _token_from_url(song_url) if "jiosaavn.com/song/" in (song_url or "") else ""
    if not tok or not name:
        return ""
    d = _jcall({"__call": "webapi.get", "token": tok, "type": "song", "api_version": "4"})
    songs = (d.get("songs") if isinstance(d, dict) else None) or []
    song = songs[0] if songs and isinstance(songs[0], dict) else (d if isinstance(d, dict) else {})
    am = ((song.get("more_info") or {}).get("artistMap") or {})
    best, best_score = "", -1
    for a in (am.get("primary_artists") or []) + (am.get("featured_artists") or []) + (am.get("artists") or []):
        if not isinstance(a, dict):
            continue
        sc = _score_artist(name, _clean(a.get("name", "")))
        if sc > best_score:
            best, best_score = _token_from_url(a.get("perma_url", "")), sc
    return best if best_score >= 85 else ""


def _artist_token_from_title(name, title):
    """For a song that is not JioSaavn's (a YouTube one): the same song on
    JioSaavn, and from its credits the artist called `name`. '' unless a
    JioSaavn song has the same title AND credits that name, so a cover or a
    remix on YouTube never borrows the original's artist; the name search
    takes over then."""
    if not name or not title:
        return ""
    from components import search_rank as sr
    want = sr.core_title(title)
    res = _jcall({"__call": "search.getResults", "q": f"{title} {name}", "p": "1",
                  "n": "5", "api_version": "4"})
    for s in (res.get("results", []) if isinstance(res, dict) else []):
        # JioSaavn's title may run on past the song's ("Glorious Purpose
        # (From "Loki: Vol. 1 ..."/Score)" reads "glorious purpose score"):
        # it must start with it. The credit below is what proves the artist.
        got = sr.core_title(_clean(s.get("title")))
        if not want or not (got == want or got.startswith(want + " ")):
            continue
        am = (s.get("more_info") or {}).get("artistMap") or {}
        for a in (am.get("primary_artists") or []) + (am.get("featured_artists") or []):
            if not isinstance(a, dict):
                continue
            cand = _clean(a.get("name", ""))
            if _score_artist(name, cand) >= 85 and _same_artist_name(name, cand):
                return _token_from_url(a.get("perma_url", ""))
    return ""


def _fetch_jiosaavn_artist(name, song_url="", song_title=""):
    """Resolve `name` to its canonical JioSaavn artist page dict (or {}).
    The song it was tapped on first (exact): its own credits when it is a
    JioSaavn song, its JioSaavn copy's when it is not. Then the song→artistMap
    search by name, then autocomplete."""
    token = (_artist_token_from_song(name, song_url)
             or _artist_token_from_title(name, song_title)
             or _jiosaavn_artist_token(name))
    if not token:
        ac = _jcall({"__call": "autocomplete.get", "query": name})
        hits = (ac.get("artists", {}) or {}).get("data", []) if isinstance(ac, dict) else []
        if hits:
            best = max(hits, key=lambda h: _score_artist(name, h.get("title", "")))
            # Same strict same-artist-name gate as the song path — never accept a
            # subset/collab autocomplete hit ("Priya Saraiya" for "Priya",
            # "Pritam & Arijit Singh" for "Arijit Singh").
            if _same_artist_name(name, best.get("title", "")):
                token = _token_from_url(best.get("url", ""))
    if not token:
        return {}
    d = _jcall({
        "__call": "webapi.get", "token": token, "type": "artist",
        "p": "0", "n_song": "15", "n_album": "20", "api_version": "4",
    })
    return d if isinstance(d, dict) else {}


def _parse_albums(raw_albums):
    """JioSaavn topAlbums entries → album card dicts."""
    out = []
    for al in raw_albums or []:
        if not isinstance(al, dict):
            continue
        url = al.get("perma_url") or ""
        out.append({
            "name": _clean(al.get("title")),
            "artist": _clean(al.get("subtitle") or al.get("primary_artists")),
            "image": al.get("image", ""),
            "album_id": str(al.get("id", "")),
            "track_count": _int_or_none((al.get("more_info") or {}).get("song_count")),
            "year": al.get("year") or "",
            "perma_url": url,
            "source": "jiosaavn",
        })
    return out


_RELEASES_TTL = 6 * 3600


def _artist_releases(name, this_year):
    """One followed artist's newest releases: JioSaavn's own "latest release"
    first, then singles and albums by year."""
    key = ("releases", (name or "").strip().lower())
    with _cache_lock:
        hit = _cache.get(key)
        # Six hours, unlike the rest of _cache: a profile does not change, an
        # artist's newest release does, and the music service keeps this
        # process alive for days, so "From artists you love" stayed as it was
        # the first time it loaded.
        if hit and time.time() - hit[0] < _RELEASES_TTL:
            return hit[1]
    d = _fetch_jiosaavn_artist(name)
    releases, seen = [], set()
    for group, latest in (("latest_release", True), ("singles", False), ("topAlbums", False)):
        items = d.get(group)
        if isinstance(items, dict):
            items = items.get("albums") or []
        for it in items if isinstance(items, list) else []:
            if not isinstance(it, dict) or not it.get("perma_url") or it.get("id") in seen:
                continue
            # Theirs, not a compilation they appear on ("Best Hindi Love
            # Songs" by Various Artists sits in an artist's album list too).
            am = (it.get("more_info") or {}).get("artistMap") or {}
            if not any(_score_artist(name, a.get("name", "")) >= 85
                       for a in am.get("primary_artists") or []):
                continue
            seen.add(it.get("id"))
            year = int(it["year"]) if str(it.get("year", "")).isdigit() else 0
            count = str((it.get("more_info") or {}).get("song_count", ""))
            count = int(count) if count.isdigit() else 0
            releases.append({
                "type": "album",
                "title": _clean(it.get("title")),
                # By its song count when JioSaavn gives one, the same field the
                # tap goes by (one song plays, more open), so the word and what
                # a tap does agree. The group is only a guess without it: a
                # one-song latest release was labelled "album" and played.
                "subtitle": f"{name} · {'single' if (count == 1 or (not count and group == 'singles')) else 'album'}",
                "image": it.get("image", ""),
                "perma_url": it["perma_url"],
                # Opened by id (its link is an album page, which the playlist
                # lookup cannot read); one song plays straight away.
                "album_id": str(it.get("id", "")),
                "songs": count,
                "artist": name,
                "year": year,
                "new": latest or year >= this_year,
            })
    releases.sort(key=lambda r: (r["new"], r["year"]), reverse=True)
    result = releases[:2]
    if d:
        with _cache_lock:
            _cache[key] = (time.time(), result)
    return result


def get_followed_releases(names, this_year):
    """Home's "From artists you love": newest first, two per artist, at
    most 12."""
    names = [n for n in names if n][:10]
    if not names:
        return {"releases": []}
    with ThreadPoolExecutor(max_workers=5) as ex:
        per = list(ex.map(lambda n: _artist_releases(n, this_year), names))
    releases = sorted((r for p in per for r in p),
                      key=lambda r: (r["new"], r["year"]), reverse=True)
    return {"releases": releases[:12]}


def get_artist(name, song_url="", song_title=""):
    """Cached artist profile (see _build_artist)."""
    # The song it was tapped on is part of the identity: a name alone may be
    # someone else; the song pins down which artist (_artist_token_from_song).
    key = ("artist", (name or "").strip().lower(),
           _token_from_url(song_url) if song_url else "", (song_title or "").strip().lower())
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    result = _build_artist(name, song_url, song_title)
    if result.get("name"):  # cache any real profile (incl. data-less ones); skip empty failures
        with _cache_lock:
            _cache[key] = result
    return result


def _release_key(name):
    """A release's name with case, marks and a store's " - Single" / " - EP"
    set aside; "&" and "+" and "and" read alike."""
    from components.search_rank import fold
    n = re.sub(r"\s*[-–(\[]\s*(single|ep)\s*[)\]]?\s*$", "", name or "", flags=re.I)
    n = re.sub(r"\s*(&|\+)\s*", " and ", n)
    return re.sub(r"[\W_]+", "", fold(n))


def _one_per_release(albums):
    """Each release once, in the order first listed: the copy with the most
    songs, JioSaavn's on a tie."""
    best, order = {}, []
    for a in albums:
        k = _release_key(a.get("name")) or id(a)
        held = best.get(k)
        if held is None:
            best[k] = a
            order.append(k)
            continue
        mine, theirs = a.get("track_count") or 0, held.get("track_count") or 0
        if mine > theirs or (mine == theirs and a.get("source") == "jiosaavn"
                             and held.get("source") != "jiosaavn"):
            best[k] = a
    return [best[k] for k in order]


def _build_artist(name, song_url="", song_title=""):
    """Assemble a rich artist profile. Returns a dict (never raises).

    Strategy (rebuilt on real data): the canonical JioSaavn artist — resolved via
    song→artistMap tokens, NOT the unreliable autocomplete — is the primary
    source for playable top songs + albums and works great for Indian artists.
    Deezer provides the best free artist photos (incl. for "fans also like",
    where Last.fm images are dead). TheAudioDB/Last.fm fill bio + genre +
    similar-artist names + listeners. Western artists fall back to Last.fm top
    tracks resolved to playable streams. Every field degrades independently."""
    name = (name or "").strip()
    if not name:
        return {}

    # Fetch all sources in parallel — JioSaavn page, Deezer image/fans,
    # TheAudioDB bio, Last.fm info + top tracks, and iTunes discography. iTunes
    # doesn't depend on the JioSaavn result, so running it here (rather than
    # after) makes its richer data free latency-wise.
    with ThreadPoolExecutor(max_workers=6) as ex:
        f_js = ex.submit(_fetch_jiosaavn_artist, name, song_url, song_title)
        f_dz = ex.submit(_deezer_artist, name)
        f_tadb = ex.submit(_audiodb_artist, name)
        f_lfm = ex.submit(_lastfm_artist, name)
        f_top = ex.submit(_lastfm_top_tracks, name, 18)
        f_it = ex.submit(_itunes_albums, name, 14)
        js, dz, tadb, lfm, lfm_top, itunes_albums = (
            f_js.result(), f_dz.result(), f_tadb.result(),
            f_lfm.result(), f_top.result(), f_it.result())

    display_name = _clean(js.get("name")) or _clean(name)

    # ── playable top songs ──────────────────────────────────────
    # Primary: canonical JioSaavn topSongs (correct + directly playable, fast).
    js_top_raw = js.get("topSongs")
    js_top_raw = js_top_raw if isinstance(js_top_raw, list) else (js_top_raw or {}).get("songs", []) if isinstance(js_top_raw, dict) else []
    page_songs = _make_playable([_song_to_raw(s) for s in js_top_raw])
    # A canonical JioSaavn artist page is proof this is a real artist; its songs
    # are the artist's by definition (incl. music-director pages credited to the
    # singers), so they are NOT credit-filtered below.
    canonical = bool(page_songs)

    # De-dupe the SAME song repeated across compilations (normalized title key).
    # Some entities return 15× "Oh Carol" from different hits albums — collapse
    # them so the page isn't all one song.
    top_songs, seen_titles = [], set()
    for t in page_songs:
        k = _norm_title(t["title"])
        if k and k not in seen_titles:
            seen_titles.add(k)
            top_songs.append(t)

    # If the canonical page is thin OR collapsed to a few distinct songs (junk /
    # compilation entity like Neil Sedaka's), blend Last.fm popularity (resolved
    # to playable JioSaavn) for real variety. Credit-filtered so a mis-scrobbled
    # name (e.g. the "HouseNatic" channel) can't sneak unrelated songs in.
    if len(top_songs) < 8 and lfm_top:
        for t in _resolve_names(lfm_top, 16):
            k = _norm_title(t["title"])
            if k and k not in seen_titles and _credits_exact(display_name, t.get("artist")):
                seen_titles.add(k)
                top_songs.append(t)
    top_songs = top_songs[:16]

    # Identity gate: no canonical JioSaavn artist AND nothing we resolved
    # actually credits this name. Before giving up, check for a CONFIDENT
    # real-artist identity: an EXACT-name Deezer artist with a real fanbase
    # (e.g. "ColdPlay Wu", an independent act we have no playable songs for).
    # If present, fall through and return a minimal profile (name + photo +
    # followers) so the artist is still browsable. Otherwise it's an
    # unverifiable name (a SoundCloud uploader / compilation channel) → return
    # empty so the UI shows "Artist not available".
    # ponytail: trusts a canonical JioSaavn token OR an exact-name Deezer artist
    # as proof-of-real. Ceiling: a real artist absent from BOTH JioSaavn and
    # Deezer reads as unavailable. Upgrade path: a MusicBrainz existence check.
    if not canonical and not top_songs:
        if not (dz.get("image") and (dz.get("fans") or 0) > 0):
            return {}

    # ── albums (discography): JioSaavn canonical + iTunes (clean) ──
    js_alb = js.get("topAlbums")
    js_alb = js_alb if isinstance(js_alb, list) else (js_alb or {}).get("albums", []) if isinstance(js_alb, dict) else []
    albums = _parse_albums(js_alb)
    # Always merge iTunes' clean discography (fetched in parallel above → no
    # extra latency): richer covers + Western releases JioSaavn misses.
    # Keyed without iTunes's " - EP" / " - Single" suffix: "Ved - EP" is the
    # JioSaavn "Ved" again, and only the JioSaavn copy opens by its id.
    def _album_key(n):
        return re.sub(r"\s*-\s*(ep|single)$", "", (n or "").strip().lower())
    # Both list it: the fuller release wins. JioSaavn often has only the
    # single of an album's name (Tycho's "Awake", 1 song for the album's 8)
    # or a part of it ("InnerSpeaker (10 Year Anniversary ...)", 2 songs).
    at = {_album_key(a["name"]): i for i, a in enumerate(albums)}
    for a in itunes_albums:
        k = _album_key(a["name"])
        if k not in at:
            at[k] = len(albums)
            albums.append(a)
        elif (a.get("track_count") or 0) > (albums[at[k]].get("track_count") or 0) + 1:
            albums[at[k]] = a

    # Once per release, however each source spelled it: JioSaavn lists some
    # twice ("When The Sun Goes Down", 2006, two ids), and iTunes's copy of
    # one it has slipped past the key above (Tranquility Base Hotel & Casino
    # showed twice). The fuller one stays, JioSaavn's on a tie (it plays by
    # its id).
    albums = _one_per_release(albums)

    # ── merged header metadata (best of each source) ────────────
    # The first good one, not the longest: the longest was a page of
    # biography in a section meant to be glanced at, and Last.fm's own page
    # for a shared name is a list of strangers ("There are 3 artists...").
    bios = [_clean_bio(b) for b in (tadb.get("bio"), lfm.get("bio"), _js_bio(js.get("bio")))]
    bios = [b for b in bios if len(b) > 40 and not _AMBIGUOUS_BIO.match(b)]
    bio_full = bios[0] if bios else ""
    bio = _brief(bio_full)

    # Image: JioSaavn first — its artist page is resolved via song→artistMap
    # tokens, so the identity is CERTAIN; Deezer/TheAudioDB match by NAME and
    # can borrow a same-named artist's photo (seen with "Aditya Rikhari").
    # JioSaavn's at 500px: it hands out 150x150, which the page's full-width
    # header blew up into a pixelated blur. The CDN has every size.
    js_img = re.sub(r"\d+x\d+(?=\.\w+$)", "500x500", js.get("image") or "")
    if "artist-default" in js_img:
        js_img = ""   # JioSaavn's placeholder face, not a photo
    # JioSaavn's photos live under /artists/; otherwise its "photo" is one of
    # the artist's album covers (Boards of Canada's was a Peel Session
    # sleeve). Deezer's photo then, when its page is surely theirs: the
    # most followed of the name (_deezer_artist), with a real following.
    if (js_img and "/artists/" not in js_img and dz.get("image")
            and (dz.get("fans") or 0) >= 10000):
        js_img = ""
    image = (js_img or dz.get("image") or tadb.get("image")
             or _track_art(top_songs[0] if top_songs else None))

    # Similar artists: Last.fm names, JioSaavn fallback; images filled via Deezer.
    similar = lfm.get("similar") or []
    if not similar:
        for sa in (js.get("similarArtists") or [])[:10]:
            if isinstance(sa, dict) and sa.get("name"):
                similar.append({"name": _clean(sa.get("name")), "image": sa.get("image", "")})
    similar = similar[:10]
    # Drop combined / collaboration entries ("A & B", "A, B", "A feat B") and
    # derivative pages (tribute/karaoke/covers): they aren't standalone artists,
    # and clicking one opened a fabricated / empty page.
    similar = [s for s in similar
               if not _is_combo(s.get("name")) and not _is_nonartist(s.get("name"))]
    # Last.fm images are dead placeholders — drop them (filled from Deezer in
    # the vet step below).
    for s in similar:
        if "lastfm" in (s.get("image") or "") or "2a96cbd8b46e442fc41c2b" in (s.get("image") or ""):
            s["image"] = ""
    similar = _vet_similar(similar)

    genre = tadb.get("genre") or (lfm.get("tags") or [""])[0] or ""

    return {
        "name": display_name,
        "image": image,
        "banner": tadb.get("banner") or "",
        "bio": bio,
        # All of it, for "Read more"; empty when the brief is the whole.
        "bio_full": bio_full if bio_full != bio else "",
        "genre": genre,
        "country": tadb.get("country") or "",
        "founded": tadb.get("founded") or "",
        "verified": bool(js.get("isVerified")),
        "followers": dz.get("fans") if dz.get("fans") else (int(js["follower_count"]) if str(js.get("follower_count", "")).isdigit() else None),
        "listeners": lfm.get("listeners"),
        "tags": (lfm.get("tags") or [])[:6],
        "top_songs": top_songs,
        "albums": albums[:20],
        "similar_artists": similar,
    }


# ──────────────────────────── public: ALBUM ─────────────────────────────────

def _find_jiosaavn_album(name, artist):
    """Find best-matching JioSaavn album id for name(+artist). Returns id or ''.

    Title score (length-sensitive + exact-title bonus) picks the right release
    of a given title ("Sky High" beats "Sky High pt.II"). But title alone is not
    enough: a fuzzy NEAR-title by a DIFFERENT artist must never win ("Winter" by
    Cold Blue was grabbing "Blue Winter" by Urban Concept). So when an artist is
    known we verify the candidate's primary_artists actually credits them and
    return '' if none does — the caller then falls back to iTunes / shows the
    album as unavailable rather than opening a stranger's record."""
    q = f"{name} {artist}".strip()
    ac = _jcall({"__call": "autocomplete.get", "query": q})
    hits = (ac.get("albums", {}) or {}).get("data", []) if isinstance(ac, dict) else []
    if not hits:
        return ""
    nkey = _strip_name(name)

    def title_score(h):
        title = h.get("title", "")
        s = _plain_ratio(name, title)               # penalizes "... pt.II" / "... 2"
        if _strip_name(title) == nkey:
            s += 200                                 # exact title is a near-sure win
        return s

    hits = sorted(hits, key=title_score, reverse=True)

    # No artist to corroborate → trust the title alone.
    if not artist:
        return str(hits[0].get("id", ""))

    # With an artist: verify the candidate is actually theirs. Check exact-title
    # candidates first (the usual case), else the top few fuzzy ones; accept the
    # best whose album artist credits the requested artist. (ponytail: up to a
    # few extra detail calls — album views aren't a hot path.)
    exact = [h for h in hits if _strip_name(h.get("title", "")) == nkey]
    pool = (exact or hits)[:4]
    best_id, best = "", -1.0
    for h in pool:
        aid = str(h.get("id", ""))
        if not aid:
            continue
        d = _jcall({"__call": "content.getAlbumDetails", "albumid": aid})
        alb_artist = (d or {}).get("primary_artists") or (d or {}).get("subtitle") or ""
        if not _credits(artist, alb_artist):
            continue                                 # wrong artist — skip it
        sc = _ratio(artist, alb_artist) + title_score(h)
        if sc > best:
            best, best_id = sc, aid
    return best_id                                   # '' if nobody credits the artist


def _album_id_from_song(song_url):
    """A JioSaavn song page URL → the exact id of the album it belongs to (or '').

    This is the RELIABLE path for "Go to album": the track string carries the
    album NAME, which for variant releases is ambiguous ("Memory Reboot" the
    track is tagged album "Memory Reboot (Slowed)"), so resolving by name opened
    the wrong release. The song's own details point at exactly one album id."""
    if "/song/" not in (song_url or ""):
        return ""
    d = _jcall({"__call": "webapi.get", "token": _token_from_url(song_url),
                "type": "song", "api_version": "4"})
    songs = d.get("songs") if isinstance(d, dict) else None
    if songs:
        mi = songs[0].get("more_info") or {}
        return str(mi.get("album_id") or mi.get("albumid") or "")
    return ""


# A release that collects songs from elsewhere, by its name: "Epic",
# "Selected Works 1972-1999", "World Music Day - Best Of Bollywood Hits".
_COMPILATION_RE = re.compile(
    r"\b(hits|best of|greatest|collection|selected works|essentials|"
    r"the highlights|anthology|vibes|playlist|presents|mixed|focus|workout|"
    r"party|top \d+|love songs|world music day|lo-?fi|chill|now that'?s|"
    r"romance|monsoon|wedding|epic|classics|evergreen|jukebox|non ?stop|"
    r"pov|music taste)\b", re.I)


# Japanese (kana, kanji) and Korean (hangul) script.
_KANA = re.compile(r"[぀-ヿㇰ-ㇿ]")
_HAN = re.compile(r"[㐀-䶿一-鿿]")
_HANGUL = re.compile(r"[가-힯ᄀ-ᇿ]")


def _native_store(text):
    """The iTunes storefront that lists a song by its name as written: JP for
    Japanese, KR for Korean, None for anything else. The US store gives
    Japanese songs in romaji ("Hikari No Hou E" for its real title), and a
    search for the song as written finds nothing there to match it."""
    text = text or ""
    if _HANGUL.search(text):
        return "KR"
    if _KANA.search(text) or _HAN.search(text):
        return "JP"
    return None


def _song_core(title):
    """A song's core title, also from Spotify's dash form: "Sunflower -
    Spider-Man: Into the Spider-Verse" is iTunes' "Sunflower (Spider-Man: ...)"
    and "Creep - Remastered" is "Creep". A part after the dash that names a
    version ("- Live", "- Acoustic") stays, so it is still that version.

    A title in Japanese or Korean keeps its own letters: core_title is ASCII
    only, and a Japanese title came out empty, so no album was looked for."""
    from components import search_rank as sr
    parts = sr.title_parts(title or "")
    if len(parts) > 1 and not any(sr.version_words(p) for p in parts[1:]):
        title = parts[0]
    core = sr.core_title(title or "")
    if not _native_store(title):
        return core
    native = unicodedata.normalize("NFKC", title or "").casefold()
    native = re.sub(r"[\(\[【「][^\)\]】」]*[\)\]】」]", " ", native)
    native = re.sub(r"\s(?:feat\.?|ft\.?|featuring)\s.*$", "", native)
    native = re.sub(r"[^\w]+", "", native)
    # The ASCII words left are the version a bracket named ("(Live)").
    extra = " ".join(w for w in core.split() if w in sr.VERSION_WORDS)
    return f"{native} {extra}".strip()


def _store_artist_ids(name, country):
    """iTunes ids of the artist called `name` in a storefront: the JP store
    credits Kaneko Ayano in katakana, so a song there is theirs by id."""
    try:
        from components.itunes_client import iTunesClient
        found = iTunesClient()._search({"term": name, "entity": "musicArtist",
                                        "limit": 5, "country": country}).get("results", [])
    except Exception:
        return set()
    return {r.get("artistId") for r in found
            if r.get("artistId") and _same_artist_name(name, r.get("artistName") or "")}


def _itunes_album_scan(artist, want, close, unwanted, limit=6, country="US"):
    """The artist's own studio albums, earliest first, opened one by one until
    one lists the song: iTunes' song search does not have every track its
    albums do (Radiohead's "Creep" is on Pablo Honey there, and no search for
    it finds it). Only when that search came up empty."""
    from components.itunes_client import iTunesClient
    client = iTunesClient()
    # By the artist's id: a search for their albums leaves some out (Pablo
    # Honey, again), their own catalogue does not.
    try:
        found = client._search({"term": artist, "entity": "musicArtist",
                                "limit": 5, "country": country}).get("results", [])
        aid = next((r.get("artistId") for r in found
                    if _same_artist_name(artist, r.get("artistName") or "")), None)
        if not aid:
            return None
        raw = client._lookup({"id": aid, "entity": "album", "limit": 200,
                              "country": country}).get("results", [])
    except Exception:
        return None
    raw = [r for r in raw if r.get("wrapperType") == "collection"]
    albums = [r for r in raw
              if (_same_artist_name(artist, r.get("artistName") or "") or r.get("artistId") == aid)
              and (r.get("trackCount") or 0) >= 4
              and not re.search(r"\s-\s(ep|single)$", r.get("collectionName") or "", re.I)
              and not unwanted(r.get("collectionName") or "")
              and r.get("collectionId")]
    albums.sort(key=lambda r: r.get("releaseDate") or "9999")
    seen = set()
    for r in albums:
        name = sr_fold(r.get("collectionName") or "")
        if name in seen:          # a deluxe or a reissue of one already looked at
            continue
        seen.add(name)
        if len(seen) > limit:
            break
        try:
            songs = client._lookup({"id": r["collectionId"], "entity": "song",
                                    "country": country}).get("results", [])
        except Exception:
            continue
        for t in songs:
            if (t.get("wrapperType") == "track" and _song_core(t.get("trackName") or "") == want
                    and close((t.get("trackTimeMillis") or 0) // 1000)):
                return {"name": _clean(r.get("collectionName")),
                        "artist": _clean(r.get("artistName")),
                        "album_id": f"itunes:{r['collectionId']}"}
    return None


def sr_fold(text):
    from components import search_rank as sr
    return sr.fold(re.sub(r"\s*[\(\[].*$", "", text or ""))


def album_of(title, artist, duration_ms=0):
    """The album a song is on, for a song that does not say (a YouTube one):
    {name, artist, album_id} or None.

    "The same song" is a song of the same title (search_rank.core_title: a
    "(feat.)" is packaging, a "(Live)" is not) credited to the artist, within
    10 s when both lengths are known; a cover or a remix finds no album
    rather than the original's.

    Of the releases the song is on, the one meant: the earliest studio album,
    else its single or EP; never a compilation or a live album (unless the
    song is the live one). Taking the first hit, as JioSaavn lists them, gave
    "Epic" for Bohemian Rhapsody and a "Best Of Bollywood Hits" for Kun Faya
    Kun: 18 of 36 right on a mixed test, niche to famous (2026-11-05).
    iTunes first, which says what each release is (its track count, whether
    it is various artists'); JioSaavn's catalogue after, by name alone."""
    from components import search_rank as sr
    want = _song_core(title)
    if not want or not artist:
        return None
    names = [n for n in _credits_list(artist) if n]
    live_song = "live" in want.split()

    def credits(credit):
        return any(_score_artist(n, c) >= 85 and _same_artist_name(n, c)
                   for n in names for c in _credits_list(credit))

    def close(secs):
        return not duration_ms or not secs or abs(secs * 1000 - duration_ms) <= 10_000

    def unwanted(release):
        words = sr.fold(release).split()
        return bool(_COMPILATION_RE.search(release or "")) or (
            "live" in words and not live_song)

    picks = []   # (kind, date, album): kind 0 album, 1 single/EP
    # A song named in Japanese or Korean is looked for in that country's
    # store, where it has that name, and its artist by id (the credit there is
    # in the same script).
    store = _native_store(title) or "US"
    ids = _store_artist_ids(names[0], store) if store != "US" and names else set()
    try:
        from components.itunes_client import iTunesClient
        raw = iTunesClient()._search({"term": f"{title} {artist}", "entity": "song",
                                      "limit": 25, "country": store}).get("results", [])
    except Exception:
        raw = []
    for r in raw:
        if (_song_core(r.get("trackName") or "") != want
                or not (credits(r.get("artistName") or "") or r.get("artistId") in ids)
                or not close((r.get("trackTimeMillis") or 0) // 1000)
                or not r.get("collectionId")):
            continue
        release = r.get("collectionName") or ""
        if "various" in (r.get("collectionArtistName") or "").lower() or unwanted(release):
            continue
        # An album: four songs or more, and not named as an EP or a single
        # ("I'm Sorry... - EP" came before "I Love You." for Sweater Weather).
        short = re.search(r"\s-\s(ep|single)$", release, re.I)
        kind = 0 if (r.get("trackCount") or 0) >= 4 and not short else 1
        picks.append((kind, r.get("releaseDate") or "9999", {
            "name": _clean(release), "artist": _clean(r.get("artistName")),
            "album_id": f"itunes:{r.get('collectionId')}"}))
    if not picks and ids:
        # A copy whose length is off (a YouTube video with an intro: 2:59 for
        # a 2:29 song) still names the song exactly, and the artist is
        # theirs by id: the length is not asked of it.
        for r in raw:
            release = r.get("collectionName") or ""
            if (_song_core(r.get("trackName") or "") == want and r.get("artistId") in ids
                    and r.get("collectionId") and not unwanted(release)
                    and "various" not in (r.get("collectionArtistName") or "").lower()):
                short = re.search(r"\s-\s(ep|single)$", release, re.I)
                kind = 0 if (r.get("trackCount") or 0) >= 4 and not short else 1
                picks.append((kind, r.get("releaseDate") or "9999", {
                    "name": _clean(release), "artist": _clean(r.get("artistName")),
                    "album_id": f"itunes:{r.get('collectionId')}"}))
    if picks:
        return min(picks, key=lambda p: (p[0], p[1]))[2]
    if names:
        found = _itunes_album_scan(names[0], want, close, unwanted, country=store)
        if found:
            return found

    res = _jcall({"__call": "search.getResults", "q": f"{title} {artist}", "p": "1",
                  "n": "10", "api_version": "4"})
    for s in (res.get("results", []) if isinstance(res, dict) else []):
        mi = s.get("more_info") or {}
        credit = ", ".join(_clean(a.get("name", "")) for a in
                           ((mi.get("artistMap") or {}).get("primary_artists") or [])
                           if isinstance(a, dict))
        try:
            secs = int(mi.get("duration") or 0)
        except (TypeError, ValueError):
            secs = 0
        release = _clean(mi.get("album"))
        if (_song_core(_clean(s.get("title"))) == want and credits(credit)
                and close(secs) and mi.get("album_id") and not unwanted(release)):
            picks.append((0, str(s.get("year") or "9999"), {
                "name": release, "artist": credit, "album_id": str(mi.get("album_id"))}))
    return min(picks, key=lambda p: p[1])[2] if picks else None


def _credits_list(credit):
    """"A, B & C feat. D" as its names."""
    return [p.strip() for p in re.split(r",|&| feat\.? | ft\.? | x |/", credit or "", flags=re.I)
            if p.strip()]


def get_album(name, artist="", song_url="", album_id=""):
    """Cached album profile (see _build_album)."""
    if album_id:
        key = ("album", "id:" + str(album_id))
    elif song_url:
        key = ("album", (song_url or "").strip())
    else:
        key = ("album", (name or "").strip().lower(), (artist or "").strip().lower())
    with _cache_lock:
        if key in _cache:
            return _cache[key]
    result = _build_album(name, artist, song_url, album_id)
    if result.get("tracks"):  # don't cache empty failures
        with _cache_lock:
            _cache[key] = result
    return result


def _build_album(name, artist="", song_url="", album_id=""):
    """Assemble an album profile with playable tracks. Returns dict (never raises).

    Album identity is, in priority order: an explicit JioSaavn `album_id` (exact —
    from a search-result card); else the SONG when a song_url is supplied (exact —
    handles variant releases like "... (Slowed)"); else a name+artist search
    (artist-disambiguated)."""
    name = (name or "").strip()
    if not name and not song_url and not album_id:
        return {}

    # An iTunes release, by its id (an artist page's album the JioSaavn
    # catalogue lacks): its exact tracklist, each song found where it plays.
    itunes_full, itunes_want = None, 0
    if str(album_id or "").startswith("itunes:"):
        full = _itunes_lookup(str(album_id)[len("itunes:"):])
        album_id = ""
        if full:
            # JioSaavn's own copy when it is the same release (its title, and
            # about as many songs): already playable, at JioSaavn's quality,
            # where song-by-song matching missed some (Bonobo, Lane 8). Else
            # the iTunes tracklist, each song found where it plays.
            from components import search_rank as sr
            it_titles = {sr.core_title(t.name or "") for t in (getattr(full, "tracks", []) or [])}
            it_titles.discard("")
            want = len(it_titles)
            # Its name as JioSaavn would have it: without iTunes's " - Single".
            base = re.sub(r"\s*-\s*(single|ep)$", "", _clean(full.name), flags=re.I)
            aid = _find_jiosaavn_album(base, _clean(full.artist_name))
            d = _jcall({"__call": "content.getAlbumDetails", "albumid": aid}) if aid else {}
            js_songs = (d.get("songs") or d.get("list") or []) if isinstance(d, dict) else []
            # The SAME release: most of its songs are the iTunes tracklist's.
            # A count alone let a one-song single take any album of its name
            # (Alfaaz - Single opened as "Alfaaz - Acoustic", someone else's).
            same = sum(1 for s in js_songs
                       if sr.core_title(_clean(s.get("title") or s.get("song"))) in it_titles)
            if aid and want and same >= max(1, -(-want * 3 // 5)) and len(js_songs) >= want - 1:
                album_id = aid
                itunes_full, itunes_want = full, want
            else:
                found = _itunes_album_from(full)
                if found:
                    return found

    album_id = str(album_id or "") or _album_id_from_song(song_url) or (_find_jiosaavn_album(name, artist) if name else "")
    if album_id:
        d = _jcall({"__call": "content.getAlbumDetails", "albumid": album_id})
        if isinstance(d, dict) and (d.get("songs") or d.get("list")):
            songs = d.get("songs") or d.get("list") or []
            tracks = _album_tracks(songs)
            # An iTunes release's JioSaavn copy with songs that do not play
            # (Loki Vol. 2: 9 of 23): the iTunes tracklist, found song by
            # song, when that finds more.
            if itunes_full is not None and len(tracks) < itunes_want - 1:
                alt = _itunes_album_from(itunes_full)
                if len(alt.get("tracks") or []) > len(tracks):
                    return alt
            if tracks:
                # JioSaavn sometimes hands back a dead cover link (404). Validate
                # it; if broken/missing, fall back to iTunes' reliable 600px art
                # and stamp it onto every track so now-playing / recently-played
                # show a cover too (all album tracks share the album cover).
                js_img = _clean(d.get("image") or "")
                img = js_img if _url_ok(js_img) else ""
                if not img:
                    img = _itunes_album_cover(name or d.get("title", ""), artist or d.get("primary_artists", ""))
                    if img:
                        for t in tracks:
                            t.setdefault("artwork_urls", {})["600"] = img
                            t["artwork_url"] = img
                if not img and tracks:
                    img = tracks[0].get("artwork_url", "")
                return {
                    "name": _clean(d.get("title") or d.get("name")) or name,
                    "artist": _clean(d.get("primary_artists") or d.get("subtitle")) or artist,
                    "image": img,
                    "year": d.get("year") or "",
                    "release_date": d.get("release_date") or "",
                    "tracks": tracks,
                    "track_count": len(tracks),
                    "source": "jiosaavn",
                }

    # Western fallback: iTunes album tracklist → resolve each to playable.
    try:
        from components.itunes_client import iTunesClient
        albums = iTunesClient().search_albums(f"{name} {artist}".strip(), limit=1)
        if albums:
            found = _itunes_album_from(_itunes_lookup(albums[0].collection_id))
            if found:
                return found
    except Exception:
        pass

    return {"name": name, "artist": artist, "image": "", "tracks": [], "track_count": 0}


def _itunes_lookup(collection_id):
    """An iTunes release with its tracklist, by id; None when unreachable.

    From the store that names it as its artist does: a Japanese or Korean
    release, asked of the US store, comes back in romaji ("Sansan", "Hikari
    No Hou E"), and its songs as written could not be found to play. The
    three stores are asked at once; the native one wins when it has it."""
    from components.itunes_client import iTunesClient

    def one(country):
        try:
            return iTunesClient().lookup_album(str(collection_id), country=country,
                                               entity="song")
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=3) as ex:
        us, jp, kr = ex.map(one, ("US", "JP", "KR"))
    for native, store in ((jp, "JP"), (kr, "KR")):
        if native and _mostly_native([t.name for t in (native.tracks or [])], store):
            # The album's own name is in its tracks (the lookup gives the
            # album in romaji even there), and each song keeps its romaji
            # name too: YouTube's copies go by it ("Hikari No Hou E"), and
            # found by the name as written, an album played none of its songs.
            names = [t.collection_name for t in native.tracks if t.collection_name]
            if names and _native_store(names[0]):
                native.name = names[0]
            us_tracks = (us.tracks or []) if us else []
            if len(us_tracks) == len(native.tracks):
                native.romaji = [(t.name, t.artist_name) for t in us_tracks]
            return native
    return us or jp or kr


def _mostly_native(names, store):
    """Most of `names` written in the store's own script: a Japanese
    artist's release, not a Western one's Japanese edition with a bonus
    track named in Japanese."""
    names = [n for n in names if n]
    return bool(names) and sum(_native_store(n) == store for n in names) * 2 >= len(names)


def _itunes_album_from(full):
    """An iTunes release (_itunes_lookup), each of its songs found where it
    plays (JioSaavn, else YouTube: _resolve_names). {} when it has none."""
    if not full:
        return {}
    songs = [t for t in getattr(full, "tracks", []) or [] if getattr(t, "name", None)]
    romaji = getattr(full, "romaji", None)
    if romaji and len(romaji) == len(songs):
        # Found by the names YouTube's copies have, shown as written.
        pairs = [(r[0] or t.name, r[1] or t.artist_name) for r, t in zip(romaji, songs)]
        tracks = _resolve_names(pairs, max(len(pairs), 20), [t.name for t in songs])
    else:
        pairs = [(t.name, t.artist_name) for t in songs]
        tracks = _resolve_names(pairs, max(len(pairs), 20))
    if not tracks:
        return {}
    art100 = full.artwork_url_100 or ""
    return {
        "name": _clean(full.name),
        "artist": _clean(full.artist_name),
        "image": art100.replace("100x100", "600x600"),
        "year": str(full.release_year or ""),
        "release_date": full.release_date or "",
        "tracks": tracks,
        "track_count": len(tracks),
        "source": "itunes",
    }
