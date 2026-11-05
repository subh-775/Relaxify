"""Albums and playlists in search, offline: the sources are stubbed.

Run: python test_collection_search.py
"""
import sys
import types

sys.modules.setdefault("newpipe_yt", types.ModuleType("newpipe_yt"))
from components import collection_search as cs  # noqa: E402


def album(name, artist, songs, source, lead=15.0):
    return {"name": name, "artist": artist, "image": "", "year": "2020",
            "songs": songs, "album_id": f"{source}:{name}:{artist}",
            "source": source, "_lead": lead}


def run(query, jiosaavn, itunes, playlists=()):
    cs._jiosaavn_albums = lambda q, n: [dict(a) for a in jiosaavn]
    cs._itunes_albums = lambda q, n: [dict(a) for a in itunes]
    cs._jiosaavn_playlists = lambda q, n: list(playlists)
    return cs.search_collections(query)


# The album, over a stranger's single of its name and over its own Deluxe.
r = run("after hours",
        [album("After Hours", "Charlieonnafriday", 1, "jiosaavn", 6.0),
         album("After Hours (Deluxe)", "The Weeknd", 18, "jiosaavn", 6.0),
         album("After Hours", "The Weeknd", 14, "jiosaavn", 6.0)],
        [album("After Hours", "The Weeknd", 14, "itunes")])
assert r["albums"][0]["artist"] == "The Weeknd" and r["albums"][0]["name"] == "After Hours", r
assert r["albums"][0]["exact"] and r["albums"][0]["source"] == "jiosaavn"
# Kept once: JioSaavn's copy, which plays by its id.
assert sum(a["name"] == "After Hours" and a["artist"] == "The Weeknd" for a in r["albums"]) == 1

# Dubs of the same name from one source are no sign the release is known.
r = run("aashiqui 2",
        [album("Aashiqui 2", "Jeet Gannguli, Mithoon", 10, "jiosaavn"),
         album("Aashiqui 2", "Various Artists", 2, "jiosaavn"),
         album("Aashiqui 2", "Various Artists", 4, "jiosaavn"),
         album("Aashiqui 2", "Various Artists", 2, "jiosaavn")], [])
assert r["albums"][0]["artist"] == "Jeet Gannguli, Mithoon", r

# Karaoke and tributes are not the album.
r = run("燦々",
        [album("燦々(カラオケ)[原曲歌手:三浦大知]", "歌っちゃ王", 1, "jiosaavn")],
        [album("燦々", "カネコアヤノ", 12, "itunes")])
assert [a["artist"] for a in r["albums"]] == ["カネコアヤノ"], r

# A query that is an artist: their records, and none borrowing the name.
r = run("radiohead",
        [album("Radiohead", "Dreamy Dynamics", 15, "jiosaavn")],
        [album("OK Computer", "Radiohead", 12, "itunes"),
         album("In Rainbows", "Radiohead", 10, "itunes")])
assert [a["name"] for a in r["albums"]] == ["OK Computer", "In Rainbows"], r

# Nothing that does not carry the query.
r = run("after hours", [album("Happy Hours", "Someone", 10, "jiosaavn")], [])
assert r["albums"] == [], r

# Playlists: relevant names only, no scratch lists, entities unescaped. The
# module is reloaded to undo the stubs above.
import importlib  # noqa: E402
importlib.reload(cs)
from components import profile  # noqa: E402
profile_jcall = profile._jcall
profile._jcall = lambda params: {"results": [
    {"title": "Temp_playlist_lofi", "perma_url": "u1", "more_info": {"song_count": "20"}},
    {"title": "Happy Hours", "perma_url": "u2", "more_info": {"song_count": "30"}},
    {"title": "Lofi &amp;amp; Chill", "perma_url": "u3", "image": "x-150x150.jpg",
     "more_info": {"song_count": "25"}},
]}
try:
    got = cs._jiosaavn_playlists("lofi", 10)
finally:
    profile._jcall = profile_jcall
assert [p["name"] for p in got] == ["Lofi & Chill"], got
assert got[0]["subtitle"] == "25 songs" and got[0]["image"] == "x-500x500.jpg"
assert got[0]["type"] == "playlist" and got[0]["perma_url"] == "u3"

assert cs.search_collections("  ") == {"albums": [], "playlists": []}
print("collection search: OK")
