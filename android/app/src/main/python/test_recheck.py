"""Saved copies re-checked by their own credit (/api/recheck), offline.

Run: python test_recheck.py
"""
import types
import sys

sys.modules.setdefault("newpipe_yt", types.ModuleType("newpipe_yt"))
import mobile_server as m  # noqa: E402

KARAOKE = "https://www.jiosaavn.com/song/creep-radio-version/OVkbWANlYXU"
REAL = "https://www.jiosaavn.com/song/tum-hi-ho/real"
OFFICIAL = {"title": "Creep", "artist": "Radiohead", "playable_source": "youtube",
            "sources": {"youtube": {"url": "https://www.youtube.com/watch?v=XFkzRNyygfk"}}}

own = {
    KARAOKE: ("Creep (Radio Version) [In The Style Of Radiohead]", "Done Again", 234000),
    REAL: ("Tum Hi Ho", "Mithoon, Arijit Singh", 262000),
}
m._saavn_copy = lambda url: own.get(url)
asked = []
m._match_track = lambda item, weak_artist=False: asked.append(item["title"]) or OFFICIAL

c = m.app.test_client()
res = c.post("/api/recheck", json={"tracks": [
    {"key": "a", "title": "Creep", "artist": "Radiohead", "duration_ms": 238000, "url": KARAOKE},
    {"key": "b", "title": "Tum Hi Ho", "artist": "Mithoon, Arijit Singh",
     "duration_ms": 262000, "url": REAL},
    # Saved as the karaoke track itself: that is what was wanted.
    {"key": "c", "title": "Creep (Radio Version) [In The Style Of Radiohead]",
     "artist": "Done Again", "duration_ms": 234000, "url": KARAOKE},
]}).get_json()["results"]
by = {r["key"]: r for r in res}

# Radiohead's song saved as a karaoke label's copy: replaced by the real one.
assert by["a"]["ok"] is False and by["a"]["track"]["artist"] == "Radiohead", by["a"]
# The real song, and a soundalike saved as itself, are left alone.
assert by["b"]["ok"] is True and by["c"]["ok"] is True, res
assert asked == ["Creep"], asked

# Nothing better found: the song stays as it is.
m._match_track = lambda item, weak_artist=False: None
res = c.post("/api/recheck", json={"tracks": [
    {"key": "a", "title": "Creep", "artist": "Radiohead", "duration_ms": 238000, "url": KARAOKE},
]}).get_json()["results"]
assert res == [{"key": "a", "ok": True}], res
print("recheck: OK")
