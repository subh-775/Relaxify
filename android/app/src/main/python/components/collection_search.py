"""
Albums and playlists for a search.
==================================
Search answered with songs and artists only: "after hours" found the songs
called that and never The Weeknd's album, and "aashiqui 2" never the
soundtrack. This finds the releases and playlists a query names.

Albums come from JioSaavn (it plays them whole, by id) and iTunes (what
JioSaavn lacks: much of the West, Japan and Korea, from the storefront that
writes the name as the artist does). The same release from both is kept once,
JioSaavn's. Playlists come from JioSaavn's editorial ones.

Both are judged as songs are, by search_rank: a name must carry what was
typed (JioSaavn answers "after hours" with "Happy Hours" and a stranger's
"Temp_playlist_kushaal_2"), and karaoke, tributes and covers of the album are
dropped rather than ranked low.
"""

import html
import re
from concurrent.futures import ThreadPoolExecutor

from components import search_rank as sr

# Kept: a release or playlist that carries the query this well.
ALBUM_RELEVANT = 70.0
PLAYLIST_RELEVANT = 80.0
# A record of four songs or more over a single, among equal matches.
ALBUM_BONUS = 15.0
# A name that IS the query (with or without the artist's): a Top result.
EXACT = 95.0
EXACT_EDGE = 6.0
# A record by the artist the query names.
BY_ARTIST = 85.0
# Popularity, from where a source places a release: the first is worth this
# much, each place after it STEP less. Neither source says how popular an
# album is; both list the popular ones first.
ITUNES_LEAD = 15.0
JIOSAAVN_LEAD = 15.0
JIOSAAVN_LEAD_EN = 6.0
STEP = 3.0
# Listed by both sources: known widely, not a stranger's upload.
BOTH = 5.0

# Karaoke, music-box and "in the style of" releases: other people's records
# of the album. カラオケ is karaoke, オルゴール a music box, 原曲歌手 "the
# original singer" (said only by the copy).
_COPY = re.compile(
    r"karaoke|カラオケ|オルゴール|原曲|tribute|in the style of|made famous|"
    r"originally performed|instrumental versions|lullaby versions|"
    r"piano versions|8[\s-]?bit|music box",
    re.I,
)
# Playlists made by accident or for a test, which JioSaavn's search lists.
_SCRATCH = re.compile(r"^(temp|test|untitled|new playlist)", re.I)
_SINGLE = re.compile(r"\s*-\s*(single|ep)\s*$", re.I)


def _clean(s):
    # JioSaavn escapes some names twice ("Lofi &amp;amp; New Age").
    return html.unescape(html.unescape(str(s or ""))).strip()


def _img(url):
    return (url or "").replace("150x150", "500x500")


def _year(s):
    m = re.match(r"(\d{4})", str(s or ""))
    return m.group(1) if m else ""


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _key(name, artist):
    """One release however a store titles it: no " - Single", no brackets'
    case, the first credited artist."""
    first = re.split(r",|&| and | x |feat\.", artist or "", flags=re.I)[0]
    return (sr.fold(_SINGLE.sub("", name)), sr.fold(first))


def _score(query, name, artist, songs):
    """-> (score, exact) for a release, or None when it is not what was asked."""
    bare = _SINGLE.sub("", name)
    if _COPY.search(bare) and not _COPY.search(query):
        return None
    rel = sr.relevance(query, bare, artist) - sr.penalty(query, bare, artist)
    q = sr.fold(query)
    named = sr.fold(bare)
    # The query is the artist: their records, whatever they are called ("the
    # weeknd" found none, no album being named after him).
    by_them = q == sr.fold(artist)
    if by_them:
        rel = max(rel, BY_ARTIST)
    if rel < ALBUM_RELEVANT:
        return None
    exact = q in (named, f"{named} {sr.fold(artist)}", f"{sr.fold(artist)} {named}")
    if exact:
        # Over its own Deluxe and Remixes, which match as well once their
        # brackets are set aside.
        rel = max(rel, EXACT) + EXACT_EDGE
    return rel + (ALBUM_BONUS if songs >= 4 else 0.0), exact


def _jiosaavn_albums(query, n):
    from components.profile import _jcall
    d = _jcall({"__call": "search.getAlbumResults", "q": query, "p": "1",
                "n": str(n), "api_version": "4"})
    out = []
    for it in (d.get("results") or []) if isinstance(d, dict) else []:
        mi = it.get("more_info") or {}
        name, aid = _clean(it.get("title")), str(it.get("id") or "")
        if not name or not aid:
            continue
        lang = (it.get("language") or "").lower()
        out.append({
            "name": name,
            "artist": _clean(it.get("subtitle") or mi.get("music")),
            "image": _img(it.get("image")),
            "year": _year(it.get("year")),
            "songs": _int(mi.get("song_count")),
            "album_id": aid,
            "source": "jiosaavn",
            # Its order is by popularity in India: telling for an Indian
            # release, much less for an English one (a stranger's "Ok
            # Computer" first, Radiohead's not carried at all).
            "_lead": JIOSAAVN_LEAD if lang not in ("english", "unknown", "") else JIOSAAVN_LEAD_EN,
        })
    return out


def _itunes_card(item, lead):
    from components.itunes_client import iTunesClient
    al = iTunesClient()._parse_album(item)
    if not al or not al.collection_id or not al.name:
        return None
    return {
        "name": al.name,
        "artist": al.artist_name or "",
        "image": al.artwork_url_600 or "",
        "year": _year(al.release_date),
        "songs": al.track_count or 0,
        "album_id": f"itunes:{al.collection_id}",
        "source": "itunes",
        "_lead": lead,
    }


def _itunes_albums(query, n):
    """iTunes albums, most popular first. A Japanese or Korean query is also
    asked of the US store, whose order is the better one (it puts Kaneko
    Ayano's 燦々 first, the Japanese store four strangers' releases), each
    of its albums then named from the native store by id: the US store calls
    that album "Sansan"."""
    from components.itunes_client import iTunesClient
    from components.profile import _native_store
    c = iTunesClient()
    store = _native_store(query)

    def search(country):
        return c._search({"term": query, "media": "music", "entity": "album",
                          "limit": n, "country": country}).get("results", [])

    if not store:
        return [x for x in (_itunes_card(i, ITUNES_LEAD) for i in search("US")) if x]
    us, native = search("US"), search(store)
    ids = [str(i.get("collectionId")) for i in us if i.get("collectionId")]
    named = {}
    if ids:
        # Even the native store names a release "Sansan"; its SONGS carry the
        # album's real name (燦々), and the artist as written (カネコアヤノ).
        try:
            found = c._lookup({"id": ",".join(ids), "entity": "song",
                               "country": store, "limit": 200}).get("results", [])
        except Exception:
            found = []
        for r in found:
            cid = str(r.get("collectionId") or "")
            if r.get("wrapperType") == "collection":
                named.setdefault(cid, dict(r))
                named[cid]["artistName"] = r.get("artistName") or named[cid].get("artistName")
            elif r.get("wrapperType") == "track" and _native_store(r.get("collectionName")):
                named.setdefault(cid, {})["_native"] = r["collectionName"]
    first = []
    for i in us:
        n = named.get(str(i.get("collectionId")), {})
        first.append({**i, **{k: v for k, v in n.items() if k != "_native"},
                      **({"collectionName": n["_native"]} if n.get("_native") else {})})
    seen = {str(i.get("collectionId")) for i in first}
    rest = [i for i in native if str(i.get("collectionId")) not in seen]
    return [x for x in (_itunes_card(i, ITUNES_LEAD) for i in first + rest) if x]


def _jiosaavn_playlists(query, n):
    from components.profile import _jcall
    d = _jcall({"__call": "search.getPlaylistResults", "q": query, "p": "1",
                "n": str(n), "api_version": "4"})
    out = []
    for it in (d.get("results") or []) if isinstance(d, dict) else []:
        mi = it.get("more_info") or {}
        name, url = _clean(it.get("title")), it.get("perma_url") or ""
        if not name or not url or _SCRATCH.search(name):
            continue
        rel = sr.relevance(query, name, "")
        if rel < PLAYLIST_RELEVANT:
            continue
        count = _int(mi.get("song_count"))
        out.append({
            "type": "playlist",
            "name": name,
            "image": _img(it.get("image")),
            "subtitle": f"{count} songs" if count else "Playlist",
            "perma_url": url,
            "_score": rel,
        })
    out.sort(key=lambda p: -p["_score"])
    for p in out:
        p.pop("_score")
    return out


def search_collections(query, limit=10):
    """{albums: [...], playlists: [...]} for a query, best first.

    An album: {name, artist, image, year, songs, album_id, source, exact};
    `album_id` opens it ("itunes:<id>" for an iTunes one). `exact` is a name
    that is the query, which may stand as the Top result. A playlist:
    {type, name, image, subtitle, perma_url}, as Home's cards are."""
    query = (query or "").strip()
    if not query:
        return {"albums": [], "playlists": []}

    def safe(fn, *a):
        try:
            return fn(*a)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=3) as ex:
        js = ex.submit(safe, _jiosaavn_albums, query, 12)
        it = ex.submit(safe, _itunes_albums, query, 12)
        pl = ex.submit(safe, _jiosaavn_playlists, query, 12)
        sources = [js.result(), it.result()]
        playlists = pl.result()

    # The query names an artist who has records: then a record CALLED that by
    # someone else ("Radiohead" by Dreamy Dynamics) borrows the name.
    q = sr.fold(query)
    artist_query = any(sr.fold(a["artist"]) == q for listing in sources for a in listing)

    best = {}
    for listing in sources:
        for place, a in enumerate(listing):
            lead = a.pop("_lead", 0.0)
            if (artist_query and sr.fold(a["artist"]) != q
                    and sr.fold(_SINGLE.sub("", a["name"])) == q):
                continue
            scored = _score(query, a["name"], a["artist"], a["songs"])
            if not scored:
                continue
            score, exact = scored
            pop = max(0.0, lead - STEP * place)
            k = _key(a["name"], a["artist"])
            held = best.get(k)
            # The same release twice: JioSaavn's (listed first) plays whole by
            # its id; the iTunes listing adds its popularity and, when
            # JioSaavn's has none, its count.
            if held is None:
                best[k] = [score + pop, {**a, "exact": exact}, a["source"]]
            elif held[2] != a["source"]:
                # Another source's listing. A second from the same one is a
                # dub of the same name (Aashiqui 2 in Punjabi, in Bengali...),
                # which is no sign the release is known.
                held[0] = max(held[0], score + pop) + BOTH
                held[2] = "both"
                if not held[1]["songs"] and a["songs"]:
                    held[1]["songs"] = a["songs"]
    albums = [a for _, a, _ in sorted(best.values(), key=lambda x: -x[0])]
    return {"albums": albums[:limit], "playlists": playlists[:limit]}
