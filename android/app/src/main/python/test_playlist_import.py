"""Self-check for importing a YouTube / YouTube Music playlist.

Run it directly:  python test_playlist_import.py

Pins the parts that make it the same import as Spotify's: the link is
recognised (and your own private lists refused with a reason), titles are
cleaned before matching, a song matched on our sources is used, a song with
no match keeps its YouTube original, and the internal marker never reaches a
saved track.
"""

import newpipe_yt
import mobile_server as m

VIDEO = "https://www.youtube.com/watch?v="
newpipe_yt.playlist = lambda url, limit: {
    "name": "Indie evenings",
    "image": "https://i.ytimg.com/cover.jpg",
    "tracks": [
        {"title": "Kesariya", "artist": "Arijit Singh - Topic", "duration_ms": 268000,
         "url": VIDEO + "a1", "artwork": "https://i.ytimg.com/a1.jpg"},
        {"title": "Anuv Jain - Baarishein (Live)", "artist": "Anuv Jain", "duration_ms": 240000,
         "url": VIDEO + "b2", "artwork": "https://i.ytimg.com/b2.jpg"},
    ],
}

seen = []


def fake_match(item, weak_artist=False):
    seen.append((item["title"], item["artist"], weak_artist))
    if item["title"] == "Kesariya":
        return {"title": "Kesariya", "artist": "Arijit Singh", "primary_source": "jiosaavn",
                "playable_source": "jiosaavn", "sources": {"jiosaavn": {"url": "js"}}}
    return None


m._match_track = fake_match
client = m.app.test_client()

# Not a playlist, and a private list: refused before any work starts.
assert client.get("/api/spotify/import?url=https://www.youtube.com/watch?v=x").status_code == 400
r = client.get("/api/spotify/import?url=https://music.youtube.com/playlist?list=LM")
assert r.status_code == 400 and "Private" in r.get_json()["error"]

job = {"name": "", "image": "", "total": 0, "done": 0, "matched": 0,
       "tracks": [], "missing": [], "finished": False, "error": None, "checked": []}
m._run_import("youtube", "music.youtube.com/playlist?list=PLx&si=abc", job)

assert job["finished"] and not job["error"], job
assert job["name"] == "Indie evenings" and job["source"] == "youtube"
# Titles cleaned, and the artist treated as possibly a channel name.
assert ("Kesariya", "Arijit Singh", True) in seen, seen
assert ("Baarishein (Live)", "Anuv Jain", True) in seen, seen
# Both songs kept, in playlist order: one matched, one YouTube original.
assert [t["playable_source"] for t in job["tracks"]] == ["jiosaavn", "youtube"]
assert job["matched"] == 2 and job["kept"] == 1 and job["missing"] == []
yt = job["tracks"][1]
assert yt["sources"]["youtube"]["url"] == VIDEO + "b2" and yt["artwork_url"].endswith("b2.jpg")
assert all("kept_from_youtube" not in t for t in job["tracks"])

# The weak-artist rule itself: a label channel can't vouch for the singer,
# so a near-exact title and length carry the match, and only then.
class Hit:
    title, artist, duration_ms = "Kesariya", "Arijit Singh", 269000


label = {"title": "Kesariya", "artist": "T-Series", "duration_ms": 268000}
assert not m._title_artist_ok(label, Hit())
assert m._title_artist_ok(label, Hit(), True)
assert not m._title_artist_ok({**label, "duration_ms": 200000}, Hit(), True)

print("ok")
