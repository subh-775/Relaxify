"""Finding a song's lyrics: synced from lrclib, plain from JioSaavn.

The matching gate is the important part: lrclib's fuzzy search happily returns a
DIFFERENT song that merely shares a title. Wrong lyrics are worse than no lyrics,
so a candidate must clear an artist + duration confidence check before it is
accepted.
"""

import hashlib
import json
import os
import re
import threading
import time
import urllib.parse
from typing import Any, Dict

import android_env
from components.fuzz_compat import fuzz
from components.http import build_session

_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = threading.Lock()
_CACHE_MAX = 1000
# On disk too, so the words of a song heard or downloaded once are still there
# with no internet.
_DISK_MAX = 3000

# Its own session: a slow lyrics host must not hold a slot the audio path needs.
_session = build_session(pool=4, maxsize=8)


def _parse_lrc(synced: str):
    """Parse an LRC synced-lyrics string into [{time, text}] sorted by time."""
    lines = []
    for raw in (synced or "").splitlines():
        stamps = re.findall(r"\[(\d+):(\d+(?:\.\d+)?)\]", raw)
        text = re.sub(r"\[\d+:\d+(?:\.\d+)?\]", "", raw).strip()
        for m, s in stamps:
            t = int(m) * 60 + float(s)
            lines.append({"time": round(t, 2), "text": text})
    lines.sort(key=lambda x: x["time"])
    return lines


def _clean_for_search(text: str) -> str:
    cleaned = re.sub(r'\s*[\(\[\{].*?[\)\]\}]', '', text)
    cleaned = re.sub(r'\s*[-|].*(?:official|video|audio|lyric|full|hd|4k|visuali).*$',
                     '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+(?:feat\.|ft\.).*$', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

def _youtube_split(text: str, credit: str):
    """A YouTube upload titled "Artist - Song", credited to a channel.

    Searched as it stands, "Ritviz - Dha" by "Sony Music India" matches
    nothing. Returns (song, artist) to try first, or None when the title
    has no dash. Whichever side reads as the credited artist is the artist;
    with neither, the YouTube convention says it is the left."""
    parts = re.split(r"\s+[-–—]\s+", _clean_for_search(text), maxsplit=1)
    if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
        return None
    left, right = parts[0].strip(), parts[1].strip()
    who = _clean_for_search(credit).lower()
    if who and fuzz.token_set_ratio(who, right.lower()) >= 80:
        return left, credit
    if who and fuzz.token_set_ratio(who, left.lower()) >= 80:
        return right, credit
    return right, left

def _fetch(title, artist, duration, budget):
    headers = {"User-Agent": "Fix_Spotify/1.0 (music player)"}
    clean_title = _clean_for_search(title)
    clean_artist = _clean_for_search(artist)

    # A total miss can otherwise stack many slow calls; on a mobile network
    # those add up fast. Bound the whole lookup.
    start = time.monotonic()
    deadline = start + budget             # hard cap for the entire lookup
    ll_deadline = start + budget * 0.6    # favour lrclib (our only SYNCED source)

    def _http_get(url, *, timeout, **kw):
        left = deadline - time.monotonic()
        if left < 1.5:
            return None
        try:
            return _session.get(url, timeout=min(timeout, left), **kw)
        except Exception:
            return None

    # Indian tracks often arrive credited as "Lyricist, Composer, Singer"
    # ("Sayeed Quadri, Pritam, KK") but lrclib indexes ONE artist name, so we
    # try each component separately.
    artist_candidates = []
    if clean_artist:
        artist_candidates.append(clean_artist)
        for sep in (",", "&", "feat.", "ft.", " x ", "/"):
            if sep in clean_artist.lower():
                for part in re.split(r'[,&/]| feat\.| ft\.| x ', clean_artist,
                                     flags=re.IGNORECASE):
                    part = part.strip()
                    if part and part not in artist_candidates:
                        artist_candidates.append(part)
                break
    if not artist_candidates:
        artist_candidates = [""]

    plain_fallback = {"value": None}

    # fuzz_compat is rapidfuzz on desktop and an equivalent pure-Python
    # implementation on Android, so this is ONE code path on both.
    #
    # It used to try `from rapidfuzz import fuzz` here and fall back to bare
    # difflib. rapidfuzz has no Android wheel, so on-device that import
    # always raised (re-walking the import path every call, since Python
    # does not negatively-cache failures) — and the difflib branch dropped
    # token_set_ratio entirely, losing exactly the extra-words tolerance
    # this matching depends on.
    def _sim(a, b):
        return max(fuzz.token_set_ratio(a, b), fuzz.partial_ratio(a, b))

    def _artist_cmp(a, b):
        # No partial_ratio here: it spuriously matches long multi-artist
        # credit strings.
        return max(fuzz.token_set_ratio(a, b),
                   fuzz.ratio(a.replace(" ", ""), b.replace(" ", "")))

    def _norm(s):
        s = re.sub(r"[^\w\s]", " ", (s or "").lower())
        return re.sub(r"\s+", " ", s).strip()

    def _artist_score(cand_artist):
        if not clean_artist or not cand_artist:
            return 0.0
        cand = _norm(cand_artist)
        best = _artist_cmp(_norm(clean_artist), cand)
        for part in re.split(r'[,&/]| feat\.| ft\.| x ', clean_artist, flags=re.IGNORECASE):
            part = part.strip()
            if len(part) >= 2:
                best = max(best, _artist_cmp(_norm(part), cand))
        return best

    def _is_valid(item):
        title_score = _sim(_norm(clean_title), _norm(item.get("trackName") or ""))
        if title_score < 65:
            return False
        cand_dur = item.get("duration") or 0
        dur_known = bool(duration and duration > 0 and cand_dur)
        # Same title, far-off length = a different recording. Hard veto.
        if dur_known and abs(duration - float(cand_dur)) > 25:
            return False
        dur_ok = dur_known and abs(duration - float(cand_dur)) <= 8
        if clean_artist:
            # A tight duration match alone is NOT enough — different songs
            # share a title AND a runtime. Require artist corroboration.
            return _artist_score(item.get("artistName") or "") >= 55
        if dur_known:
            return title_score >= 80 and dur_ok
        return title_score >= 90

    # lrclib often hosts several uploads of one song with slightly different
    # masters. A set of timestamps only lines up with audio of the SAME
    # length, so collect every valid synced hit and take the closest duration.
    synced_candidates = []

    def _consider(item):
        if not _is_valid(item) or item.get("instrumental"):
            return
        synced = item.get("syncedLyrics") or ""
        plain = item.get("plainLyrics") or ""
        if synced:
            parsed = _parse_lrc(synced)
            if parsed:
                cand_dur = item.get("duration") or 0
                delta = abs(duration - float(cand_dur)) if duration and cand_dur else 1e9
                synced_candidates.append(
                    (delta, {"plain": plain, "synced": parsed, "source": "lrclib"})
                )
                return
        if plain and plain_fallback["value"] is None:
            plain_fallback["value"] = {"plain": plain, "synced": [], "source": "lrclib"}

    def _best_synced():
        if not synced_candidates:
            return None
        synced_candidates.sort(key=lambda x: x[0])
        return synced_candidates[0][1]

    # Strategy 1 — fuzzy search: one call returns many ranked candidates, and
    # its queries cover multi-artist credits a single exact lookup can't.
    search_queries = []
    if clean_artist:
        search_queries.append(f"{clean_title} {artist_candidates[-1]}".strip())
        search_queries.append(f"{clean_title} {clean_artist}".strip())
    search_queries.append(clean_title)

    seen_queries = set()
    for q in search_queries:
        if not q or q in seen_queries or time.monotonic() > ll_deadline:
            continue
        seen_queries.add(q)
        r = _http_get("https://lrclib.net/api/search",
                      params={"q": q}, headers=headers, timeout=8)
        if r is not None and r.status_code == 200:
            try:
                items = r.json()
            except Exception:
                items = None
            if isinstance(items, list):
                for item in items[:15]:
                    _consider(item)
                best = _best_synced()
                if best:
                    return best

    # Strategy 2 — exact /api/get per artist candidate, for songs whose fuzzy
    # ranking buries the right match.
    for art in artist_candidates[:4]:
        if time.monotonic() > ll_deadline:
            break
        r = _http_get("https://lrclib.net/api/get",
                      params={"track_name": clean_title, "artist_name": art},
                      headers=headers, timeout=8)
        if r is not None and r.status_code == 200:
            try:
                _consider(r.json())
            except Exception:
                pass
    best = _best_synced()
    if best:
        return best

    if plain_fallback["value"]:
        return plain_fallback["value"]

    # Strategy 3 — JioSaavn plain lyrics. Strong coverage for Indian/
    # Bollywood/regional tracks. Direct request so lrclib's deadline can't
    # starve it.
    try:
        js_base = "https://www.jiosaavn.com/api.php"
        js_headers = {
            "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
            "Referer": "https://www.jiosaavn.com/",
            "Accept": "application/json",
        }

        def _js_get(params):
            qs = urllib.parse.urlencode(
                {**params, "_format": "json", "_marker": "0", "ctx": "web6dot0"}
            )
            r = _session.get(f"{js_base}?{qs}", headers=js_headers, timeout=8)
            return r.json() if r.status_code == 200 else {}

        ac_data = _js_get({"__call": "autocomplete.get",
                           "query": f"{clean_title} {clean_artist}".strip()})
        song_id = None
        for hit in (ac_data.get("songs", {}) or {}).get("data", [])[:5]:
            if _sim(_norm(clean_title), _norm(hit.get("title", ""))) < 55:
                continue
            # Verify the ARTIST too — title-only matching served a different
            # song's lyrics. With no corroboration we'd rather show nothing.
            if clean_artist:
                mi = hit.get("more_info") or {}
                hit_artist = mi.get("primary_artists") or mi.get("singers") or ""
                if _artist_score(hit_artist) < 55:
                    continue
            song_id = hit.get("id")
            break

        if song_id:
            lyr_data = _js_get({"__call": "lyrics.getLyrics", "lyrics_id": song_id})
            raw_lyrics = lyr_data.get("lyrics", "")
            if raw_lyrics and len(raw_lyrics) > 20:
                plain = (raw_lyrics.replace("<br>", "\n")
                                   .replace("<br/>", "\n")
                                   .replace("<br />", "\n"))
                plain = re.sub(r"<[^>]+>", "", plain).strip()
                if plain:
                    return {"plain": plain, "synced": [], "source": "jiosaavn"}
    except Exception:
        pass  # best-effort; never block on failure

    return {"plain": "", "synced": [], "source": None}


def _disk_path(cache_key: str) -> str:
    folder = android_env.data_path("lyrics")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, hashlib.sha1(cache_key.encode("utf-8")).hexdigest() + ".json")


def _read_disk(cache_key: str):
    try:
        with open(_disk_path(cache_key), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_disk(cache_key: str, result: Dict[str, Any]) -> None:
    try:
        path = _disk_path(cache_key)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        folder = os.path.dirname(path)
        names = os.listdir(folder)
        if len(names) > _DISK_MAX:
            paths = sorted((os.path.join(folder, n) for n in names), key=os.path.getmtime)
            for old in paths[: len(paths) - _DISK_MAX]:
                os.remove(old)
    except OSError:
        pass


def find_lyrics(title: str, artist: str, duration: int) -> Dict[str, Any]:
    cache_key = f"{title.lower()}|{artist.lower()}"
    with _cache_lock:
        hit = _cache.get(cache_key)
    if hit is None:
        hit = _read_disk(cache_key)
    if hit is not None:
        return hit

    # Both attempts together stay inside the app's 30s request timeout.
    result = None
    split = _youtube_split(title, artist)
    if split:
        result = _fetch(split[0], split[1], duration, 9)
    if not (result and result.get("source")):
        result = _fetch(title, artist, duration, 18 if split else 20)
    # Cache only real hits, so a transient miss can retry later.
    if result and result.get("source"):
        with _cache_lock:
            if len(_cache) >= _CACHE_MAX:
                _cache.pop(next(iter(_cache)))
            _cache[cache_key] = result
        _write_disk(cache_key, result)
    return result


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
