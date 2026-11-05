"""Japanese titles, YouTube Music titles, classical names and plain uploads,
offline.

Run: python test_native_titles.py
"""
import sys
import types
from types import SimpleNamespace

sys.modules.setdefault("newpipe_yt", types.ModuleType("newpipe_yt"))
import mobile_server as m  # noqa: E402
from components import profile as p  # noqa: E402
from components.search_rank import fold  # noqa: E402
from components.spotify_import import match_rank  # noqa: E402

# A Japanese title keeps its letters (it came out empty, so no album was
# looked for), and its version stays a different song.
assert p._song_core("光の方へ") == "光の方へ"
assert p._song_core("光の方へ (Live)") == "光の方へ live"
assert p._native_store("光の方へ") == "JP" and p._native_store("다이너마이트") == "KR"
assert p._native_store("Creep") is None
assert p._mostly_native(["燦々", "光の方へ", "Sansan"], "JP")
assert not p._mostly_native(["Ghost Stories", "Mylo Xyloto", "ゴースト"], "JP")

# Search ranks Japanese words instead of dropping them; accents still fold.
assert fold("光の方へ - Hikari No Hou E") == "光の方へ hikari no hou e"
assert fold("Beyoncé") == "beyonce"

# A YouTube Music song's title is not "Artist - Song": its artist is real.
assert m._youtube_song("花ひらくまで - Hana Hiraku Made", "Kaneko Ayano", True) == \
    ("花ひらくまで - Hana Hiraku Made", "Kaneko Ayano")
assert m._youtube_song("Creep", "Radiohead - Topic", True) == ("Creep", "Radiohead")

# "Einaudi: Experience" is "Experience" by Einaudi: an exact title.
item = {"title": "Experience", "artist": "Ludovico Einaudi, Daniel Hope", "duration_ms": 315000}
hit = SimpleNamespace(title="Einaudi: Experience", artist="Daniel Hope, Ludovico Einaudi",
                      duration_ms=315000, sources={"jiosaavn": {}})
assert match_rank(item, hit)[0] is True

# A plain upload split the wrong way round is still the song...
item = {"title": "twirling", "artist": "savemesamudio", "duration_ms": 122000}
upload = SimpleNamespace(title="savemesamudio", artist="Twirling", duration_ms=123000,
                         sources={}, official=False, upload=True)
assert m._is_real(item, upload)
# ...and a label's channel uploading it does not make it a borrowed name.
item = {"title": "Choix de vie - Remix", "artist": "RANDALL, Anas, Nassi", "duration_ms": 215000}
upload = SimpleNamespace(title="Choix de vie (feat. Anas & Nassi) [Remix] Randall",
                         artist="MaD DoG Records", duration_ms=216000, sources={},
                         official=False, upload=True)
assert m._is_real(item, upload, True)
print("native titles: OK")
