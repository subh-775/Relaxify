"""Artist and album identity, offline (no network: the clients are stubbed).

Run: python components/test_artist_identity.py
"""
import os
import sys

# The engine root, in place of this folder: components/http.py would
# otherwise shadow the standard library's http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from components import profile as p
from components.itunes_client import iTunesClient


def test_same_song_reads_features_as_packaging():
    # iTunes names the feature in the title; JioSaavn in the credits.
    assert p._same_song("Loving You (feat. Lulu James)", "Lane 8",
                        {"title": "Loving You", "artist": "Lane 8"})
    # A live recording is not the studio one.
    assert not p._same_song("Diamonds (feat. Solomon Grey) [Live]", "Lane 8",
                            {"title": "Diamonds", "artist": "Lane 8"})
    # Same title, someone else's song.
    assert not p._same_song("The Great Divide (feat. Ara Scott)", "Lane 8",
                            {"title": "The Great Divide", "artist": "Noah Kahan"})


class _Resp:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


def test_deezer_takes_the_followed_page_of_a_name():
    real_get = p.SESSION.get
    p.SESSION.get = lambda *a, **k: _Resp({"data": [
        {"name": "Hans Zimmer", "nb_fan": 18, "picture_xl": "dup.jpg"},
        {"name": "Hans Zimmer", "nb_fan": 2144617, "picture_xl": "real.jpg"},
        {"name": "Hans Zimmer & Lorne Balfe", "nb_fan": 239, "picture_xl": "x.jpg"},
    ]})
    try:
        p._cache.pop(("deezer", "hans zimmer"), None)
        got = p._deezer_artist("Hans Zimmer")
    finally:
        p.SESSION.get = real_get
    assert got == {"image": "real.jpg", "fans": 2144617}, got


def test_itunes_album_lookup_lists_its_songs():
    asked = {}

    def fake_lookup(self, params):
        asked.update(params)
        return {"results": [
            {"wrapperType": "collection", "collectionId": 1, "collectionName": "Awake",
             "artistName": "Tycho", "trackCount": 2},
            {"wrapperType": "track", "kind": "song", "trackName": "Awake", "artistName": "Tycho"},
            {"wrapperType": "track", "kind": "song", "trackName": "Montana", "artistName": "Tycho"},
        ]}

    real = iTunesClient._lookup
    iTunesClient._lookup = fake_lookup
    try:
        album = iTunesClient().lookup_album("1", entity="albumTrack")
    finally:
        iTunesClient._lookup = real
    # "albumTrack" is not an entity the API knows (it answered 400).
    assert asked["entity"] == "song", asked
    assert [t.name for t in album.tracks] == ["Awake", "Montana"]


def test_fuller_release_of_a_name_wins():
    # The merge in _build_artist, on its own: JioSaavn has the single.
    albums = [{"name": "Awake", "source": "jiosaavn", "track_count": 1}]
    itunes = [{"name": "Awake", "source": "itunes", "track_count": 8},
              {"name": "Dive", "source": "itunes", "track_count": 10}]
    at = {a["name"].lower(): i for i, a in enumerate(albums)}
    for a in itunes:
        k = a["name"].lower()
        if k not in at:
            at[k] = len(albums)
            albums.append(a)
        elif (a.get("track_count") or 0) > (albums[at[k]].get("track_count") or 0) + 1:
            albums[at[k]] = a
    assert [(a["name"], a["source"]) for a in albums] == [("Awake", "itunes"), ("Dive", "itunes")]


def test_brief_bio_is_who_not_the_life_story():
    full = ("Simon Green, known by his stage name Bonobo, is a British musician. "
            "He was born in 1976 in St. Louis. " * 3 + "\n\nHis first album came in 2000.")
    brief = p._brief(full, 120)
    assert brief.startswith("Simon Green") and brief.endswith(".") and len(brief) <= 120, brief
    assert "St." not in brief or "St. Louis" in brief, brief       # never cut at "St."
    assert p._AMBIGUOUS_BIO.match("There are at least 3 artists named Cold Blue: 1) ...")
    assert p._clean_bio("Hi. <a href='x'>Read more on Last.fm</a>") == "Hi."


def test_compilations_are_not_the_album():
    for name in ["Non Stop Arijit Singh Hits", "Selected Works 1972-1999", "Epic",
                 "World Music Day - Best Of Bollywood Hits", "pov: you have good music taste"]:
        assert p._COMPILATION_RE.search(name), name
    for name in ["Currents", "Lover", "Bhediya (Original Motion Picture Soundtrack)", "Awake"]:
        assert not p._COMPILATION_RE.search(name), name


def test_song_core_reads_spotifys_dash_form():
    # Spotify's "Song - Film" is iTunes' "Song (Film)": the same song.
    assert p._song_core("Sunflower - Spider-Man: Into the Spider-Verse") ==         p._song_core("Sunflower (Spider-Man: Into the Spider-Verse)") == "sunflower"
    assert p._song_core("Creep - Remastered 2009") == "creep"
    # A version after the dash stays that version.
    assert p._song_core("Creep - Acoustic") != "creep"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("artist identity: OK")

# Each release once on an artist page, the fuller copy, JioSaavn's on a tie.
from components.profile import _one_per_release  # noqa: E402
_albums = _one_per_release([
    {"name": "When The Sun Goes Down", "source": "jiosaavn", "track_count": 3, "album_id": "a"},
    {"name": "Tranquility Base Hotel & Casino", "source": "jiosaavn", "track_count": 11, "album_id": "t"},
    {"name": "When The Sun Goes Down", "source": "jiosaavn", "track_count": 2, "album_id": "b"},
    {"name": "Tranquility Base Hotel + Casino", "source": "itunes", "track_count": 11, "album_id": "itunes:1"},
    {"name": "Brianstorm - Single", "source": "itunes", "track_count": 3, "album_id": "itunes:2"},
    {"name": "Brianstorm", "source": "jiosaavn", "track_count": 1, "album_id": "c"},
])
assert [a["album_id"] for a in _albums] == ["a", "t", "itunes:2"], _albums
print("one per release: OK")
