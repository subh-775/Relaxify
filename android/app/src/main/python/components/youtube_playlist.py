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


def _key(text: str) -> str:
    return re.sub(r"[^0-9a-z]+", "", (text or "").casefold())


def _names(part: str, name: str) -> bool:
    """Whether a dash-part of a title is (or starts with) this artist's name:
    "Coldplay", "Coldplay played by 1000 Musicians" for Coldplay."""
    p, n = _key(part), _key(name)
    if len(n) < 3:
        return False
    return p == n or (p.startswith(n) and len(n) >= 5) or (n.startswith(p) and len(p) >= 5)


def clean_item(title: str, uploader: str, artists=()):
    """-> (song, artist) for one playlist entry or search result.

    "Artist - Song" titles are split at the dash. But "Song - Artist" is as
    common ("Yellow - Coldplay"), and read the first way it was the song
    "Coldplay" by "Yellow". So the side the channel names is the artist, or
    else the side naming an artist the caller already knows (a search's
    YouTube Music credits); only when neither says is it "Artist - Song".
    Otherwise the song is the title and the artist is the channel, minus the
    " - Topic" YouTube Music adds and a trailing "VEVO". A label channel
    ("T-Series") stays as the artist; the matcher knows that artist may be
    wrong (see is_good_match's weak_artist).
    """
    t = _NOISE.sub("", title or "").strip()
    # "Song | Film | Singer": the first part is the song.
    t = t.split("|")[0].strip()
    up = re.sub(r"\s*-\s*topic$", "", (uploader or "").strip(), flags=re.I)
    up = re.sub(r"\s*vevo$", "", up, flags=re.I).strip()
    parts = _DASH.split(t, maxsplit=1)
    if len(parts) == 2 and parts[0].strip() and parts[1].strip():
        first, second = parts[0].strip(), parts[1].strip()
        for names in ([up], [a for a in artists if a]):
            a1 = any(_names(first, n) for n in names)
            a2 = any(_names(second, n) for n in names)
            if a2 and not a1:
                return first, second
            if a1 and not a2:
                return second, first
        return second, first
    return (t or (title or "").strip()), up
