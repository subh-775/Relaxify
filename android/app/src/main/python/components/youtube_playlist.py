"""
YouTube / YouTube Music playlist links, for the playlist import.
===============================================================
Reading the playlist itself is NewPipeExtractor's job (YouTubeNP.playlist, via
newpipe_yt). This module is the pure part: which links are playlists, and how
a YouTube video title becomes a (song, artist) pair worth searching for.

YouTube titles are not song titles. "Arijit Singh - Kesariya (Official Video)"
from a label channel and "Kesariya" from "Arijit Singh - Topic" are the same
song; searching JioSaavn for either as-is finds nothing.
"""

import re

_HOSTS = ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")
_LIST_RE = re.compile(r"[?&]list=([A-Za-z0-9_-]+)")
_HOST_RE = re.compile(r"^(?:https?://)?([^/?#]+)", re.I)

# Your own lists: Liked videos, Liked music, Watch later. They need the
# owner's Google login, which Relaxify deliberately does not ask for.
PRIVATE_LISTS = {"LL", "LM", "WL"}

# "(Official Video)", "[Lyrics]", "(Audio)", "(4K Remaster)" and the like.
_NOISE = re.compile(
    r"\s*[(\[][^)\]]*?\b(?:official|video|audio|lyrics?|visuali[sz]er|hd|4k|"
    r"remaster(?:ed)?|full\s+song|music\s+video|mv|explicit)\b[^)\]]*[)\]]",
    re.I,
)
_DASH = re.compile(r"\s+[-–—]\s+")


def parse_url(url: str):
    """-> the playlist id of a YouTube / YouTube Music playlist link, or None.

    Also a watch link that carries a list (watch?v=...&list=...), and a
    youtu.be link with ?list=. The ?si= share token is ignored.
    """
    s = (url or "").strip()
    m = _HOST_RE.match(s)
    if not m or m.group(1).lower() not in _HOSTS:
        return None
    lm = _LIST_RE.search(s)
    return lm.group(1) if lm else None


def clean_item(title: str, uploader: str):
    """-> (song, artist) for one playlist entry.

    "Artist - Song" titles are split at the dash. Otherwise the song is the
    title and the artist is the channel, minus the " - Topic" YouTube Music
    adds and a trailing "VEVO". A label channel ("T-Series") stays as the
    artist; the matcher knows that artist may be wrong (see is_good_match's
    weak_artist).
    """
    t = _NOISE.sub("", title or "").strip()
    # "Song | Film | Singer": the first part is the song.
    t = t.split("|")[0].strip()
    up = re.sub(r"\s*-\s*topic$", "", (uploader or "").strip(), flags=re.I)
    up = re.sub(r"\s*vevo$", "", up, flags=re.I).strip()
    parts = _DASH.split(t, maxsplit=1)
    if len(parts) == 2 and parts[0].strip() and parts[1].strip():
        return parts[1].strip(), parts[0].strip()
    return (t or (title or "").strip()), up


if __name__ == "__main__":
    ok = "PLGo6V7qE3jPAabcdefghijklmnopqrstuv"
    assert parse_url(f"https://music.youtube.com/playlist?list={ok}&si=Ez5osjRN_N5") == ok
    assert parse_url(f"https://www.youtube.com/playlist?list={ok}") == ok
    assert parse_url(f"https://youtube.com/watch?v=abc123&list={ok}&index=2") == ok
    assert parse_url(f"https://youtu.be/abc123?list={ok}") == ok
    assert parse_url(f"music.youtube.com/playlist?list={ok}") == ok
    assert parse_url("https://www.youtube.com/watch?v=abc123") is None
    assert parse_url(f"https://evil.example/playlist?list={ok}") is None
    assert parse_url("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M") is None

    assert clean_item("Kesariya", "Arijit Singh - Topic") == ("Kesariya", "Arijit Singh")
    assert clean_item("Arijit Singh - Kesariya (Official Video)", "Sony Music India") == ("Kesariya", "Arijit Singh")
    assert clean_item("The Weeknd – Blinding Lights [Official Audio]", "TheWeekndVEVO") == ("Blinding Lights", "The Weeknd")
    assert clean_item("Kesariya | Brahmastra | Arijit Singh", "T-Series") == ("Kesariya", "T-Series")
    assert clean_item("Tum Hi Ho (Lyrics)", "Lyrics Hub") == ("Tum Hi Ho", "Lyrics Hub")
    # A hyphen inside a word is not a separator.
    assert clean_item("Anti-Hero", "Taylor Swift - Topic") == ("Anti-Hero", "Taylor Swift")
    print("youtube_playlist: OK")
