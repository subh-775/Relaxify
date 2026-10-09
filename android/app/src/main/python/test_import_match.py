"""Self-check for matching an imported song (Spotify or YouTube Music list).

Run it directly:  python test_import_match.py

Pins what made imports miss songs or take copies: a credit of several
artists must match one of them, accents must not matter, a lofi or slowed
upload is not the original, and a song JioSaavn and SoundCloud only have as
fan uploads comes from YouTube instead.
"""
from types import SimpleNamespace as Hit

import newpipe_yt
import mobile_server as m
from components.spotify_import import credited, clean_title, is_good_match

# ── the matcher's rules ──
film = {"title": 'Gehra Hua (From "Dhurandhar")',
        "artist": "Shashwat Sachdev, Arijit Singh, Irshad Kamil, Armaan Khan",
        "duration_ms": 362400}
assert credited(film["artist"]) == ["Shashwat Sachdev", "Arijit Singh", "Irshad Kamil", "Armaan Khan"]
assert clean_title(film["title"]) == "Gehra Hua"
# The right JioSaavn song, credited in another order: was rejected.
assert is_good_match(film, Hit(title="Gehra Hua", artist="Irshad Kamil, Arijit Singh, Shashwat Sachdev",
                               duration_ms=362000))
# A copy is not the song.
assert not is_good_match(film, Hit(title="Gehra Hua (Slowed + Reverb)", artist="Arijit Singh",
                                   duration_ms=380000))
# Accents: Spotify's "ADÉLA", JioSaavn's "Adela".
assert is_good_match({"title": "Nicole Kidman", "artist": "ADÉLA", "duration_ms": 181500},
                     Hit(title="Nicole Kidman", artist="Adela", duration_ms=181000))
# A version the original asks for is fine.
assert is_good_match({"title": "Tera Mera Rishta - New Version", "artist": "Mustafa Zahid", "duration_ms": 0},
                     Hit(title="Tera Mera Rishta (New Version)", artist="Mustafa Zahid", duration_ms=0))

# ── a song that is only on YouTube as itself ──
class NoHits:
    config = m.UnifiedSearchService().config if hasattr(m, "UnifiedSearchService") else None

    def search(self, query, cfg):
        # SoundCloud's fan upload under the uploader's name: not trusted.
        return [Hit(title="O Saathi - Baghi 2 - Atif Aslam", artist="fahad sattar", album=None,
                    duration_ms=251894, isrc=None, sources={})]


m._search_service = NoHits()
newpipe_yt.search = lambda q, limit: [
    {"title": "O Saathi (Slowed + Reverb)", "artist": "lofi world", "duration_ms": 290000,
     "url": "https://www.youtube.com/watch?v=copy", "artwork": ""},
    {"title": "O Saathi | Baaghi 2 | Atif Aslam | Arko | T-Series", "artist": "T-Series",
     "duration_ms": 252000, "url": "https://www.youtube.com/watch?v=official", "artwork": "a.jpg"},
    {"title": "O Saathi", "artist": "Atif Aslam", "duration_ms": 30000,
     "url": "https://www.youtube.com/watch?v=preview", "artwork": ""},
]
m.replace = lambda cfg, **kw: cfg  # the fake service has no real config
got = m._match_track({"title": "O Saathi", "artist": "Atif Aslam, Arko", "duration_ms": 251818})
assert got and got["sources"]["youtube"]["url"].endswith("official"), got
assert got["title"] == "O Saathi" and got["artist"] == "Atif Aslam, Arko", got
# A YouTube playlist's own songs keep their video instead (see _find).
assert m._match_track({"title": "O Saathi", "artist": "T-Series", "duration_ms": 251818}, weak_artist=True) is None
print("ok")
