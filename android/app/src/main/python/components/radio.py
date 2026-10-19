"""
Radio / Autoplay
================
Given a seed (title + artist), return ~12 *similar* playable tracks.

Two recommenders built on millions of listeners do the choosing, asked in
parallel and dealt out in turn:
- JioSaavn's own station for the seed song (its app's autoplay). Endless: each
  call continues the station, so the same seed never repeats a list.
- YouTube Music's radio for the seed (the "Mix" after a song), through
  NewPipe. Wider: other artists, other labels. Its names are matched back to
  JioSaavn, and a name that does not match is dropped rather than guessed.
Last.fm's similar-songs pipeline below is the fallback when both are short.
It used to be the whole radio, and by October 2026 its track.getSimilar
answered nothing for 7 of 8 test seeds ("Blinding Lights" included), so
every seed by an artist got the same "similar artists' top four" songs.

Last.fm pipeline (on-demand, nothing pre-loaded):
1. Last.fm `track.getSimilar` gives song NAMES similar to the seed
   (collaborative-filtering from real listening data — works well for both
   Western and Indian/Bollywood music).
2. Each similar name is resolved to a streamable track — JioSaavn first (cleanest
   catalogue, 320k), then SoundCloud and YouTube for the names it doesn't carry.

Resolution used to be JioSaavn-only, which quietly made the radio a mirror of
JioSaavn's catalogue rather than of what you were listening to: every similar
song missing from it was dropped, so seeding from anything outside its library
returned a few tracks and then ran dry. The other sources are only queried for
the names JioSaavn missed, and only while we're still short of `limit`, so the
common case costs exactly what it did before.
"""

import os
import random
import re
import threading
from concurrent.futures import ThreadPoolExecutor

import requests

from components.source_merger import SourceMerger
from components.http import SESSION

# ponytail: shared public Last.fm demo key. Ceiling: rate-limited/shared.
# Upgrade path: set LASTFM_API_KEY env var with your own free key.
LASTFM_KEY = os.getenv("LASTFM_API_KEY", "b25b959554ed76058ac220b7b2e0a026")
LASTFM_URL = "http://ws.audioscrobbler.com/2.0/"

_js_client = None
_js_lock = threading.Lock()


def _jiosaavn():
    global _js_client
    with _js_lock:
        if _js_client is None:
            from components.jiosaavn_downloader import JioSaavnClient
            _js_client = JioSaavnClient()
        return _js_client


def _primary_artist(artist):
    """Take the first/primary artist from a mashed credit string so Last.fm
    (which indexes by a single artist) can match. e.g.
    'Iravu, Pranathi Varma & Sruthi Dhulipala' -> 'Iravu'."""
    if not artist:
        return ""
    import re
    first = re.split(r"\s*[,&/]|\s+feat\.?\s+|\s+ft\.?\s+|\s+x\s+", artist, maxsplit=1, flags=re.IGNORECASE)[0]
    return first.strip()


def _lastfm(method, **kw):
    """Single Last.fm GET. Returns parsed JSON dict, or {} on any failure."""
    common = {"api_key": LASTFM_KEY, "format": "json", "autocorrect": 1}
    try:
        return SESSION.get(LASTFM_URL, params={**common, "method": method, **kw}, timeout=8).json()
    except Exception:
        return {}


def lastfm_similar(title, artist, limit=15):
    """Return (name, artist) tuples similar to the seed, blending multiple
    signals so the radio is both relevant AND keeps flowing for thin-data
    (new/regional) tracks:

      1. track.getSimilar  — tight, song-level similarity (best when present).
      2. artist.getSimilar → each similar artist's top tracks — discovery that
         fills the gap when track-level data is thin (e.g. brand-new songs that
         return nothing from track.getSimilar) and widens variety.
      3. seed artist's own top tracks — last resort so radio never dies.

    Insertion order preserves priority (tight matches first); the caller applies
    a diversity pass so one artist can't dominate the queue."""
    primary = _primary_artist(artist)
    pairs = []
    seen = set()

    def add(name, art):
        if not name:
            return
        key = (name.lower().strip(), (art or "").lower().strip())
        if key in seen:
            return
        seen.add(key)
        pairs.append((name, art or primary or artist))

    # 1. Tight song-level similarity.
    d = _lastfm("track.getsimilar", artist=primary or artist, track=title, limit=limit)
    for t in (d.get("similartracks", {}) or {}).get("track", []):
        add(t.get("name"), (t.get("artist") or {}).get("name"))

    # 2. Similar-artist discovery — top tracks of the closest artists. This is
    #    the fix for songs where track.getSimilar is empty: artist.getSimilar
    #    still returns strong neighbours, and their top tracks are real, playable
    #    similar music (not just "more of the same artist").
    d = _lastfm("artist.getsimilar", artist=primary or artist, limit=6)
    sim_artists = [a.get("name") for a in (d.get("similarartists", {}) or {}).get("artist", []) if a.get("name")][:4]

    def _top_tracks(a):
        dd = _lastfm("artist.gettoptracks", artist=a, limit=4)
        return [(t.get("name"), a) for t in (dd.get("toptracks", {}) or {}).get("track", []) if t.get("name")]

    if sim_artists:
        with ThreadPoolExecutor(max_workers=4) as ex:
            for lst in ex.map(_top_tracks, sim_artists):
                for name, a in lst:
                    add(name, a)

    # 3. Last resort: the seed artist's own top tracks.
    if len(pairs) < 5:
        d = _lastfm("artist.gettoptracks", artist=primary or artist, limit=limit)
        for t in (d.get("toptracks", {}) or {}).get("track", []):
            add(t.get("name"), primary or artist)

    return pairs


def _diversify(tracks, limit, max_per_artist=3):
    """Interleave tracks across artists (round-robin) and cap how many come
    from any one artist, so the radio feels curated instead of looping a single
    artist. Preserves each artist's internal order (most-similar first)."""
    from collections import OrderedDict, defaultdict
    buckets = OrderedDict()
    for t in tracks:
        a = (_primary_artist(t.get("artist", "")) or "?").lower()
        buckets.setdefault(a, []).append(t)

    out = []
    counts = defaultdict(int)
    # Round-robin: one pass takes (up to) one track per artist each loop, so the
    # output alternates artists. Stops when full or every bucket is exhausted/capped.
    progressed = True
    while len(out) < limit and progressed:
        progressed = False
        for a in buckets:
            if buckets[a] and counts[a] < max_per_artist:
                out.append(buckets[a].pop(0))
                counts[a] += 1
                progressed = True
                if len(out) >= limit:
                    break
    return out[:limit]


def _weighted_shuffle(items, rng=random, falloff=0.12):
    """A new order on every call that still leans to the front.

    Last.fm returns similar songs in a fixed order, and everything after it is
    deterministic, so the same seed always gave the same eight songs in the
    same order. This draws an order where each item's chance of coming early
    falls with its original rank (weighted sampling without replacement,
    Efraimidis-Spirakis: key = u ** (1 / w)). The closest matches still tend
    to lead; the tail gets its turn.
    """
    keyed = []
    for i, it in enumerate(items):
        w = 1.0 / (1.0 + falloff * i)
        keyed.append((rng.random() ** (1.0 / w), it))
    keyed.sort(key=lambda kv: kv[0], reverse=True)
    return [it for _, it in keyed]


def _in_order_of(raw, merged):
    """Merged tracks put back in the order their copies had in `raw`.

    The merger sorts by metadata quality, which would undo the shuffle and
    hand back the same order every time. A track's place is its earliest
    copy's; one with no known copy goes last.
    """
    at = {}
    for i, r in enumerate(raw):
        u = r.get("url")
        if u and u not in at:
            at[u] = i
    big = len(raw)

    def place(t):
        urls = [(v or {}).get("url") for v in (t.get("sources") or {}).values()]
        return min([at[u] for u in urls if u in at] or [big])

    return sorted(merged, key=place)


_service = None


def _svc():
    """The shared search service.

    Radio goes through it rather than importing source clients directly, so it
    inherits whatever gating the host has applied — most importantly, the Android
    build swaps in a NewPipe-backed YouTube client and refuses to build one at all
    while the user has YouTube switched off. Reaching for YouTubeClient here
    directly would bypass both and fall back to yt-dlp, which cannot extract
    YouTube on a phone.
    """
    global _service
    if _service is None:
        from components.unified_search import UnifiedSearchService

        _service = UnifiedSearchService()
    return _service


def _resolve(pair):
    """Resolve one (name, artist) to a raw JioSaavn result dict, or None."""
    name, art = pair
    try:
        songs = _jiosaavn().search(f"{name} {art}".strip(), limit=1)
        if songs:
            return {"source_type": "jiosaavn", **songs[0].to_dict()}
    except Exception:
        pass
    return None


def _resolve_elsewhere(pair):
    """A name JioSaavn didn't have — try the other sources before giving up.

    This is the difference between a radio that reflects what you're listening to
    and one that reflects JioSaavn's catalogue. Last.fm's similar-track list is
    genuinely good across Western and Indian music, but every name missing from
    JioSaavn used to be dropped on the floor — so seeding from, say, a metal track
    returned a handful of songs and then dried up.

    SoundCloud is tried before YouTube: it's cheaper to search and its hits are
    already direct streams. Either returns None when the host has it disabled.
    """
    from components.source_merger import SourceType

    name, art = pair
    q = f"{name} {art}".strip()
    for source_type, label in (
        (SourceType.SOUNDCLOUD, "soundcloud"),
        (SourceType.YOUTUBE, "youtube"),
    ):
        try:
            client = _svc()._get_client(source_type)
            if client is None:
                continue          # source switched off on this device
            hits = client.search(q, 1)
            if hits:
                return {"source_type": label, **hits[0].to_dict()}
        except Exception:
            continue
    return None


def _lastfm_radio(title, artist, limit=12, shuffle=True):
    """Raw result dicts (with `source_type`) from the Last.fm pipeline.

    `shuffle` (the default) draws a fresh, front-weighted order each call, so
    the same seed does not give the same list twice; see _weighted_shuffle."""
    pairs = lastfm_similar(title, artist, limit + 12)  # over-fetch for skips + diversity
    if shuffle:
        pairs = _weighted_shuffle(pairs)

    with ThreadPoolExecutor(max_workers=8) as ex:
        resolved = list(ex.map(_resolve, pairs)) if pairs else []

    raw = [r for r in resolved if r]

    # Only the names JioSaavn missed go to the slower sources, and only when we're
    # actually short — searching SoundCloud/YouTube for 20 names we don't need
    # would add seconds to every radio fetch for nothing.
    if len(raw) < limit:
        missed = [p for p, r in zip(pairs, resolved) if not r]
        need = limit - len(raw)
        if missed and need > 0:
            with ThreadPoolExecutor(max_workers=6) as ex:
                for extra in ex.map(_resolve_elsewhere, missed[: need + 4]):
                    if extra:
                        raw.append(extra)

    # Fallback: Last.fm had nothing (obscure/regional track). Pull more songs
    # by the same primary artist straight from JioSaavn so radio still flows.
    if len(raw) < 3:
        primary = _primary_artist(artist)
        if primary:
            try:
                extra = _jiosaavn().search(primary, limit=limit + 4)
                have = {r.get("url") for r in raw}
                for s in extra:
                    d = s.to_dict()
                    # skip the seed song itself and dups
                    if d.get("url") in have or (d.get("title", "").lower() == (title or "").lower()):
                        continue
                    raw.append({"source_type": "jiosaavn", **d})
            except Exception:
                pass

    return raw


def jiosaavn_station(title, artist, n=12):
    """The next `n` songs of JioSaavn's station for the seed, as raw dicts."""
    try:
        seed = _jiosaavn().search(f"{title} {_primary_artist(artist)}".strip(), limit=1)
        if not seed:
            return []
        songs = _jiosaavn().station(seed[0].id, n)
    except Exception:
        return []
    return [{"source_type": "jiosaavn", **s.to_dict()} for s in songs]


def _yt_song(title, channel):
    """A YouTube Music radio item's (song, artist), without the video dressing:
    "LYRICAL: Kaise Hua | Kabir Singh | ..." is "Kaise Hua", "Talwiinder -
    KHAYAAL (prod. by NDS) | Official Music Video" is "KHAYAAL", and a channel
    "Javed - Mohsin - Topic" is the artist "Javed - Mohsin"."""
    from components.spotify_import import clean_title

    artist = re.sub(r"\s*-\s*topic$|vevo$", "", channel or "", flags=re.I).strip()
    t = re.sub(r"^\s*(lyrical|lyric video|full video|full song|video)\s*:\s*", "", title or "", flags=re.I)
    t = re.sub(r"[\(\[][^\)\]]*[\)\]]", " ", t.split("|")[0])
    if " - " in t:
        left, right = (x.strip() for x in t.split(" - ", 1))
        if artist and artist.lower() in left.lower():
            t = right
        elif artist and artist.lower() in right.lower():
            t = left
    t = re.sub(r"\s+(ft|feat)\.?\s.*$", "", t, flags=re.I)
    t = re.sub(r"[\"']", "", re.sub(r"\s{2,}", " ", t)).strip(" -")
    return clean_title(t), artist


def _on_saavn(item):
    """`item` ({title, artist, duration_ms}) as a JioSaavn result, only when
    it is that song: the importer's own check (title, length and a credited
    artist; no lofi or slowed copies). The artist is required: a mix's
    "Jhol" by Maanu matched a different "Jhol" on title and length alone."""
    from types import SimpleNamespace
    from components.spotify_import import is_good_match

    try:
        hits = _jiosaavn().search(f"{item['title']} {item['artist']}".strip(), limit=3)
    except Exception:
        return None
    for h in hits:
        cand = SimpleNamespace(title=h.title, artist=h.artist, duration_ms=(h.duration or 0) * 1000)
        if is_good_match(item, cand):
            return {"source_type": "jiosaavn", **h.to_dict()}
    return None


def youtube_radio(title, artist, n=12):
    """YouTube Music's radio for the seed, matched to JioSaavn, as raw dicts.
    Nothing when YouTube is switched off on the phone, or off the phone (no
    NewPipe)."""
    try:
        from components.source_merger import SourceType
        import newpipe_yt

        if _svc()._get_client(SourceType.YOUTUBE) is None:
            return []
        hits = newpipe_yt.search(f"{title} {_primary_artist(artist)}".strip(), 1, music=True)
        vid = re.search(r"[?&]v=([\w-]{11})", (hits[0].get("url") or "") if hits else "")
        if not vid:
            return []
        v = vid.group(1)
        mix = newpipe_yt.playlist(f"https://www.youtube.com/watch?v={v}&list=RDAMVM{v}", n + 8) or {}
    except Exception:
        return []
    items = []
    for t in (mix.get("tracks") or [])[1:]:          # the first is the seed itself
        name, art = _yt_song(t.get("title"), t.get("artist"))
        if name:
            items.append({"title": name, "artist": art, "duration_ms": t.get("duration_ms") or 0})
    with ThreadPoolExecutor(max_workers=8) as ex:
        return [r for r in ex.map(_on_saavn, items[: n + 4]) if r]


def _deal(*lists):
    """One from each list in turn, then the rest."""
    out = []
    for i in range(max((len(x) for x in lists), default=0)):
        out += [x[i] for x in lists if i < len(x)]
    return out


def resolve_radio(title, artist, limit=12, shuffle=True):
    """Return up to `limit` playable similar tracks as plain dicts
    (UnifiedTrack.to_dict shape, ready for the frontend to queue)."""
    with ThreadPoolExecutor(max_workers=2) as ex:
        station = ex.submit(jiosaavn_station, title, artist, limit)
        mix = ex.submit(youtube_radio, title, artist, limit)
        raw = _deal(station.result(), mix.result())

    seed_key = ((title or "").lower().strip(), _primary_artist(artist).lower())
    seen, picks = {seed_key}, []
    for r in raw:
        key = ((r.get("title") or "").lower().strip(), _primary_artist(r.get("artist", "")).lower())
        if key not in seen:
            seen.add(key)
            picks.append(r)
    raw = picks
    if len(raw) < limit // 2:
        raw += _lastfm_radio(title, artist, limit, shuffle)

    if not raw:
        return []

    # The merger takes one list per source, so bucket by where each hit came from.
    # Passing a SoundCloud dict in as jiosaavn_results would mis-key its URL and
    # the track would come out unplayable.
    buckets = {}
    for r in raw:
        buckets.setdefault(f"{r.get('source_type', 'jiosaavn')}_results", []).append(r)

    merged = SourceMerger().merge_search_results(**buckets)
    # Keep only tracks that ended up with a real playable source
    out = [t.to_dict() for t in merged if getattr(t, "primary_source", None)]
    if shuffle:
        out = _in_order_of(raw, out)
    # Interleave artists + cap per-artist so the radio doesn't loop one artist.
    picked = _diversify(out, limit)
    # The cap is a preference, not a filter: a station that is all one artist
    # (Talwiinder's is) with nothing to mix in fills up with that artist
    # rather than handing back three songs and letting the music stop.
    if len(picked) < limit:
        taken = {id(t) for t in picked}
        picked += [t for t in out if id(t) not in taken][: limit - len(picked)]
    return picked


def _lastfm_discover(seeds, limit):
    """Discover's old source: Last.fm's similar songs per seed, resolved on
    JioSaavn. Now only the fallback, for when both radios come back short."""
    with ThreadPoolExecutor(max_workers=3) as ex:
        pools = list(ex.map(lambda sa: lastfm_similar(sa[0], sa[1], 12), seeds))

    seen_seed = {(t.lower().strip(), _primary_artist(a).lower()) for t, a in seeds}
    pairs, seen = [], set()
    for rank in range(max((len(p) for p in pools), default=0)):
        for pool in pools:
            if rank >= len(pool):
                continue
            name, art = pool[rank]
            key = (name.lower().strip(), _primary_artist(art).lower())
            if key in seen or key in seen_seed:
                continue
            seen.add(key)
            pairs.append((name, art))

    pairs = _weighted_shuffle(pairs, falloff=0.06)[: limit + 6]
    with ThreadPoolExecutor(max_workers=8) as ex:
        return [r for r in ex.map(_resolve, pairs) if r]


def resolve_discover(seeds, limit=16):
    """Home's Discover: songs similar to a few of the listener's own, in a new
    order every time.

    `seeds` is a short list of (title, artist), chosen on the phone from what
    they play most, played last and liked. Each seed gets the radio's own two
    recommenders, JioSaavn's station and YouTube Music's mix, all asked at
    once and dealt out in turn (seed 1's station, seed 2's, ..., then the
    mixes) so no one seed or source fills the grid.

    It used to be Last.fm's similar songs alone, which by October 2026 answer
    nothing for most seeds (see the top of this file): Discover came back
    nearly empty, and the phone filled the grid with the listener's own
    most-played, so it showed mostly songs they already knew. Last.fm stays as
    the fallback when both radios are short.

    The phone filters out what the listener has already heard, so this
    over-fetches; `limit` is what it asks for, not what it shows.
    """
    seeds = [(t, a) for t, a in (seeds or []) if t][:3]
    if not seeds:
        return []

    with ThreadPoolExecutor(max_workers=6) as ex:
        stations = [ex.submit(jiosaavn_station, t, a, 10) for t, a in seeds]
        mixes = [ex.submit(youtube_radio, t, a, 8) for t, a in seeds]
        raw = _deal(*[f.result() for f in stations + mixes])

    seen = {(t.lower().strip(), _primary_artist(a).lower()) for t, a in seeds}
    picks = []
    for r in raw:
        key = ((r.get("title") or "").lower().strip(), _primary_artist(r.get("artist", "")).lower())
        if key not in seen:
            seen.add(key)
            picks.append(r)
    raw = _weighted_shuffle(picks, falloff=0.06)
    if len(raw) < limit // 2:
        raw += _lastfm_discover(seeds, limit)
    if not raw:
        return []

    merged = SourceMerger().merge_search_results(jiosaavn_results=raw)
    out = [t.to_dict() for t in merged if getattr(t, "primary_source", None)]
    # Two per artist, not radio's three: nine tiles with three by one artist
    # read as that artist's page.
    return _diversify(_in_order_of(raw, out), limit, max_per_artist=2)


if __name__ == "__main__":
    # Runnable self-check for the non-trivial transform: a raw JioSaavn result
    # must merge into a playable track dict (no network needed).
    raw = [{
        "source_type": "jiosaavn",
        "id": "abc", "title": "Channa Mereya", "artist": "Arijit Singh",
        "album": "Ae Dil Hai Mushkil",
        "image_url": "https://c.saavncdn.com/x/Channa-500x500.jpg",
        "url": "https://www.jiosaavn.com/song/channa-mereya/xyz",
        "duration": 289, "duration_sec": 289,
    }]
    merged = SourceMerger().merge_search_results(jiosaavn_results=raw)
    dicts = [t.to_dict() for t in merged if getattr(t, "primary_source", None)]
    assert dicts, "merge produced no playable track"
    t = dicts[0]
    assert t["sources"].get("jiosaavn", {}).get("url"), "missing jiosaavn stream url"
    assert t["primary_source"] == "jiosaavn", "primary_source not set"
    print("radio self-check OK:", t["title"], "-", t["artist"])

    # _diversify: must interleave artists and cap per-artist (no network).
    sample = (
        [{"title": f"A{i}", "artist": "Artist A"} for i in range(5)] +
        [{"title": f"B{i}", "artist": "Artist B"} for i in range(5)] +
        [{"title": f"C{i}", "artist": "Artist C"} for i in range(5)]
    )
    div = _diversify(sample, limit=9, max_per_artist=3)
    assert len(div) == 9, f"expected 9, got {len(div)}"
    from collections import Counter as _C
    counts = _C(_primary_artist(x["artist"]) for x in div)
    assert all(v <= 3 for v in counts.values()), f"per-artist cap violated: {counts}"
    assert div[0]["artist"] != div[1]["artist"], "not interleaved"
    print("diversify self-check OK:", [x["title"] for x in div])

    # _weighted_shuffle: a permutation, varies between calls, leans to the front.
    import random as _r
    items = list(range(20))
    rng = _r.Random(7)
    orders = [_weighted_shuffle(items, rng) for _ in range(200)]
    assert all(sorted(o) == items for o in orders), "not a permutation"
    assert len({tuple(o) for o in orders}) > 150, "orders barely vary"
    firsts = [o[0] for o in orders]
    assert sum(f < 5 for f in firsts) > sum(f >= 15 for f in firsts), "no lean to the front"
    print("weighted shuffle self-check OK")

    # _in_order_of: the merger's quality sort must not undo the shuffle.
    raw_o = [{"url": "u2"}, {"url": "u1"}, {"url": "u3"}]
    merged_o = [{"title": n, "sources": {"jiosaavn": {"url": u}}}
                for n, u in (("one", "u1"), ("two", "u2"), ("x", "zz"), ("three", "u3"))]
    assert [t["title"] for t in _in_order_of(raw_o, merged_o)] == ["two", "one", "three", "x"]
    print("order restore self-check OK")

    # _yt_song: a YouTube Music radio item's song and artist, undressed.
    assert _yt_song("Talwiinder - KHAYAAL (prod. by NDS) | Official Music Video", "Talwiinder") == ("KHAYAAL", "Talwiinder")
    assert _yt_song("LYRICAL: Kaise Hua | Kabir Singh | Shahid K", "T-Series") == ("Kaise Hua", "T-Series")
    assert _yt_song("Hasan Raheem - Wishes ft Talwiinder | Prod by Umair", "Hasan Raheem") == ("Wishes", "Hasan Raheem")
    assert _yt_song("Pal", "Javed - Mohsin - Topic") == ("Pal", "Javed - Mohsin")
    # _deal: one from each source in turn.
    assert _deal([1, 2, 3], ["a"]) == [1, "a", 2, 3]
    print("youtube radio helpers self-check OK")
