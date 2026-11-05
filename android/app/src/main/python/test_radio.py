"""The radio's seeds and picks, offline: every source is stubbed.

Run: python test_radio.py
"""
import sys
import types
from types import SimpleNamespace

np = types.ModuleType("newpipe_yt")
sys.modules["newpipe_yt"] = np
from components import radio as r  # noqa: E402


def song(id_, title, artist, secs=200):
    s = SimpleNamespace(id=id_, title=title, artist=artist, duration=secs)
    s.to_dict = lambda: {"id": id_, "title": title, "artist": artist,
                         "url": f"https://www.jiosaavn.com/song/x/{id_}", "duration": secs}
    return s


class FakeSaavn:
    def __init__(self, catalogue):
        self.catalogue = catalogue
        self.stations = []

    def search(self, q, limit=1):
        words = set(q.lower().split())
        return [s for s in self.catalogue
                if set(s.title.lower().split()) <= words][:limit]

    def station(self, sid, n):
        self.stations.append(sid)
        return [song("n1", "No Surprises", "Radiohead")]


# The first hit is not taken as it comes: "Never Young" by Loser is not a
# stranger's "Never Young".
r._js_client = FakeSaavn([song("1", "Never Young", "Kira Skov"),
                          song("2", "Never Young", "King Of Prussia")])
assert r._resolve(("Never Young", "Loser")) is None
r._js_client = FakeSaavn([song("1", "Never Young", "Kira Skov"),
                          song("3", "Never Young", "Loser")])
assert r._resolve(("Never Young", "Loser"))["id"] == "3"

# The station starts from the seed itself, found by title and artist even
# through a slash, and not from a cover of it.
fake = FakeSaavn([song("c", "Weird Fishes Arpeggi", "Some Cover Band"),
                  song("w", "Weird Fishes Arpeggi", "Radiohead")])
r._js_client = fake
assert r._saavn_seed_id("Weird Fishes/Arpeggi", "Radiohead") == "w"
assert r.jiosaavn_station("Weird Fishes/Arpeggi", "Radiohead", 5)[0]["title"] == "No Surprises"
assert fake.stations == ["w"]

# A mix song JioSaavn lacks stays, as its YouTube copy; a seed's own video is
# used without a search; an hour-long loop is not a song.
r._js_client = FakeSaavn([])
r._svc = lambda: SimpleNamespace(_get_client=lambda st: object())
asked = {}


def playlist(url, n=100):
    asked["url"] = url
    return {"tracks": [
        {"title": "光の方へ", "artist": "Kaneko Ayano - Topic", "duration_ms": 240000,
         "url": "https://www.youtube.com/watch?v=SEEDSEEDSEE"},
        {"title": "踊り子", "artist": "Vaundy - Topic", "duration_ms": 220000,
         "url": "https://www.youtube.com/watch?v=VAUNDYVAUND", "artwork": "a.jpg"},
        {"title": "Sezon", "artist": "カネコアヤノ / kanekoayano", "duration_ms": 200000,
         "url": "https://www.youtube.com/watch?v=SEZONSEZONS"},
        {"title": "Rain sounds 1 hour", "artist": "Calm - Topic", "duration_ms": 3600000,
         "url": "https://www.youtube.com/watch?v=LOOPLOOPLOO"},
    ]}


np.playlist = playlist
# The song's YouTube Music copy is looked up and wins over the video the
# phone has (an artist's own upload, whose mix is all them); here the lookup
# finds nothing, so the video is used.
np.search = lambda *a, **k: []
got = r.youtube_radio("光の方へ", "Kaneko Ayano", 5,
                      video_url="https://www.youtube.com/watch?v=SEEDSEEDSEE")
assert "v=SEEDSEEDSEE" in asked["url"]
assert [g["title"] for g in got] == ["踊り子", "Sezon"], got
# Her own channel's double name is her: one artist to the per-artist cap.
assert got[1]["artist"] == "Kaneko Ayano", got[1]
assert r._artist_key("Kaneko Ayano") == r._artist_key("kanekoayano")
got = got[:1]
assert got[0]["source_type"] == "youtube" and got[0]["artist"] == "Vaundy"
assert got[0]["url"].endswith("VAUNDYVAUND") and got[0]["thumbnail"] == "a.jpg"

# Both kinds come out of the radio playable, the YouTube one too.
r.jiosaavn_station = lambda *a, **k: [{"source_type": "jiosaavn", **song("n1", "No Surprises", "Radiohead").to_dict()}]
r.youtube_radio = lambda *a, **k: got
out = r.resolve_radio("Creep", "Radiohead", 4, shuffle=False)
assert {t["title"] for t in out} == {"No Surprises", "踊り子"}, out

# The seed and a song come back under other titles are not queued again.
same = r._same_song
assert same({"title": "光の方へ / Kaneko Ayano - Hikarinohoue", "artist": "カネコアヤノ"},
            {"title": "光の方へ - Hikari No Hou E", "artist": "Kaneko Ayano"})
assert same({"title": "Sezon", "artist": "カネコアヤノ / kanekoayano"},
            {"title": "Sezon", "artist": "Kaneko Ayano"})
assert same({"title": "愛のままを / Kaneko Ayano - Ainomamawo", "artist": "カネコアヤノ"},
            {"title": "Ai No Mama Wo", "artist": "Kaneko Ayano"})
assert not same({"title": "Creep", "artist": "Radiohead"},
                {"title": "Creep", "artist": "TLC"})
assert not same({"title": "No Surprises", "artist": "Radiohead"},
                {"title": "Creep", "artist": "Radiohead"})

# A mix of the seed's artist alone gets other artists from Last.fm's
# similar ones; the seed itself, retitled, does not come back.
mine = [{"source_type": "youtube", "id": f"k{i}", "title": f"Song {i}", "artist": "Kaneko Ayano",
         "url": f"https://www.youtube.com/watch?v=KANEKO{i:05d}", "duration_ms": 200000}
        for i in range(8)]
r.jiosaavn_station = lambda *a, **k: []
r.youtube_radio = lambda *a, **k: [dict(x) for x in mine]
r._lastfm_radio = lambda *a, **k: [
    {"source_type": "youtube", "id": "s1", "title": "光の方へ / Kaneko Ayano - Hikarinohoue",
     "artist": "カネコアヤノ", "url": "https://www.youtube.com/watch?v=SEEDAGAIN01", "duration_ms": 230000},
    {"source_type": "youtube", "id": "h1", "title": "more than words", "artist": "Hitsujibungaku",
     "url": "https://www.youtube.com/watch?v=HITSUJI0001", "duration_ms": 230000},
    {"source_type": "youtube", "id": "n1", "title": "Doudemo Iikedo", "artist": "never young beach",
     "url": "https://www.youtube.com/watch?v=NYBEACH0001", "duration_ms": 230000},
]

out = r.resolve_radio("光の方へ - Hikari No Hou E", "Kaneko Ayano", 8, shuffle=False)

names = [t["title"] for t in out]
assert "more than words" in names and "Doudemo Iikedo" in names, names
assert not any("Hikarinohoue" in n for n in names), names
# Her upload in her script's spelling counts as her, for the artist cap; a
# Latin-named stranger whose title names her (a cover) is left as it is.
ups = [{"title": "抱擁 / Kaneko Ayano - Houyo", "artist": "カネコアヤノ"},
       {"title": "Kaneko Ayano cover", "artist": "Some Fan"}]
r._credit_seed_artist(ups, "Kaneko Ayano")
assert [u["artist"] for u in ups] == ["Kaneko Ayano", "Some Fan"], ups
print("radio: OK")
