"""Ranking and de-duplicating search results.

Measured on 30 real searches (2026-11-02), the old ranking put the wanted song
first 28 times, but behind it came noise: 36% of all results were SoundCloud
uploads, half of those remixes, edits and slowed versions, and the same song
showed up again and again as fan re-uploads. Its title score was
token_set_ratio, which calls a title PERFECT when its words are a subset of the
query, so for "Tum Hi Ho Arijit Singh" an upload titled "Arijit Singh" scored
100.

Here a result must match the words of the query that are not its artist's
name, its title is marked down for words nobody typed, versions nobody asked
for (remix, slowed, cover, live...) sink, and uploads of the same song collapse
into one row whose other copies stay available as sources.
"""

import re
import unicodedata
from typing import Iterable, List, Optional, Set

from components.fuzz_compat import fuzz

# A different version of the song. Sinks unless the query asks for it.
VERSION_WORDS = {
    "remix", "remixed", "mix", "edit", "slowed", "reverb", "reverbed", "sped",
    "lofi", "mashup", "megamix", "nonstop", "karaoke", "8d", "boosted",
    "nightcore", "chopped", "screwed", "flip", "refix", "bootleg", "remake",
    "instrumental", "cover", "live", "acoustic", "unplugged", "reprise",
    "extended", "loop", "hour", "hours", "minutes",
    # A song played another way, as "acoustic" is ("Perfect (Piano Version)").
    "piano", "stripped", "orchestral", "demo",
}
# The release itself, however it is labelled: not a different version.
_RELEASE = re.compile(
    r"\b(radio edit|album version|single version|original mix|original version|"
    r"\d{4} remaster(ed)?( version)?|remaster(ed)?( version)?)\b"
)
# A credit that is not the song's artist: tribute bands, karaoke and lullaby
# labels, hits compilations. JioSaavn lists dozens under a famous title.
ARTIST_JUNK = re.compile(
    r"\b(tribute|karaoke|lullaby|lullabies|music box|covers?|hits|"
    r"piano players|string quartet|kids|baby|sleep|relaxing|cover band)\b"
)
COVER_ACT_PENALTY = 35.0
_SOUNDALIKE = re.compile(
    r"\b(in the style of|made famous by|originally performed by|"
    r"as performed by|performance track|backing track|sing like)\b")
# A video about the song rather than the recording.
VIDEO_WORDS = {"lyrics", "lyric", "lyrical", "status", "whatsapp", "shorts",
               "reaction", "tutorial", "karaoke", "dance", "choreography"}
# Never what anyone searched for.
JUNK_PHRASES = ("free download", "full album", "all songs", "jukebox",
                "back to back", "ringtone")
# Packaging, not part of the song's name.
_PACKAGING = re.compile(
    r"\b(official|full|video|audio|song|music|hd|4k|8k|hq|from|ost|the movie|"
    r"film|soundtrack|visualizer|visualiser)\b"
)

# Below this a result is about something else: a word the query shares with
# the uploader's name, or one word of several. Left out of the results,
# unless that would leave almost nothing.
RELEVANT = 60.0
MIN_KEPT = 3

# A live recording that does not say "live": a date or a stage in its
# brackets or after its dash ("Creep (Lollapalooza Berlin 11.09.2016)").
_LIVE_HINT = re.compile(
    r"\b(\d{1,2} \d{1,2} (19|20)?\d{2}|sessions?|festival|concert|tour|"
    r"glastonbury|lollapalooza|coachella|bbc|mtv|tiny desk|in the studio|kexp)\b"
)
# "(1 HOUR)", "10hrs": a loop, however it is written.
_HOURS = re.compile(r"\b\d+\s*(h|hr|hrs|hour|hours)\b")
# Longer than any song: a loop, a mix, a whole album as one video.
LONG_MS = 15 * 60 * 1000
LONG_WORDS = {"hour", "hours", "mix", "album", "full", "jukebox", "nonstop",
              "set", "loop", "playlist"}

VERSION_PENALTY = 30.0
VIDEO_PENALTY = 14.0
JUNK_PENALTY = 40.0


_NATIVE_CHAR = re.compile(
    r"[぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯]")


def fold(text: str) -> str:
    """Lowercase words: accents and punctuation go. Japanese, Chinese and
    Korean letters stay as they are: folded to ASCII they vanished, and a
    search for 光の方へ had no words to rank by."""
    out = []
    for c in unicodedata.normalize("NFKC", text or ""):
        if _NATIVE_CHAR.match(c):
            out.append(c)
        else:
            out.append(unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode())
    text = re.sub(r"[^a-z0-9 ぀-ヿㇰ-ㇿ㐀-䶿一-鿿가-힯]",
                  " ", "".join(out).lower())
    return re.sub(r"\s+", " ", text).strip()


def words(text: str) -> List[str]:
    return fold(text).split()


_SEP = r"\s+[-–—|]\s+"


def title_parts(title: str) -> List[str]:
    """An upload's title in its pieces: "Kesariya - Brahmastra | Ranbir" is
    song, film, star; "The Weeknd - Blinding Lights" is artist, song. Which
    piece is the song differs, so callers try the first two."""
    parts = [p.strip() for p in re.split(_SEP, title or "") if p.strip()]
    return parts[:3] or [title or ""]


def split_upload(title: str, artist: str):
    """("Artist - Song", uploader) -> (song, artist): SoundCloud and YouTube
    give the uploader as the artist, and the real one is often in the title."""
    parts = title_parts(title)
    if len(parts) >= 2:
        return parts[1], f"{parts[0]} {artist or ''}"
    return title or "", artist or ""


def core_title(title: str) -> str:
    """The song's name, without brackets that only package it ("(From Aashiqui
    2)", "[Official Video]") but WITH the ones naming a version, so a remix
    stays a different song from the original."""
    def bracket(m):
        inside = fold(m.group(1))
        if set(inside.split()) & VERSION_WORDS:
            return f" {inside} "
        # "(Lollapalooza Berlin 11.09.2016)" is a live recording that never
        # says so; dropped as packaging, it was the studio song and took its
        # row.
        return " live " if _LIVE_HINT.search(inside) else " "

    t = re.sub(r"[\(\[\{]([^\)\]\}]*)[\)\]\}]", bracket, title or "")
    t = re.split(r"\s(?:feat\.?|ft\.?|featuring)\s", t, flags=re.I)[0]
    return re.sub(r"\s+", " ", _PACKAGING.sub(" ", fold(t))).strip()


def _same_word(a: str, b: str) -> bool:
    """One word, allowing a typo in a long one ("kesriya", "kesariya")."""
    if a == b:
        return True
    # 88: "kesriya" is "kesariya" (93), "kesari" is not (86), a different film.
    return min(len(a), len(b)) >= 5 and fuzz.ratio(a, b) >= 88


def _covered(want: Iterable[str], have: List[str]) -> float:
    """How many of `want` are in `have`; a word there only with a typo
    counts 0.9, so a near spelling ("Alfaazo") never ties the exact title
    ("Alfaaz") and wins it on popularity."""
    return sum(1.0 if w in have else 0.9 if any(_same_word(w, h) for h in have) else 0.0
               for w in want)


def _relevance(q: List[str], song: str, credit: str) -> float:
    t = core_title(song).split() or words(song)
    if not t:
        return 0.0
    a = words(credit)
    q_artist = [w for w in q if any(_same_word(w, x) for x in a)]
    rest = [w for w in q if w not in q_artist] or q
    # Asked-for words count wherever the title has them, brackets too: in
    # "Sunflower (Spider-Man: Into the Spider-Verse)" the "spiderman" typed
    # is the bracket's ("spider man" joined). Only the core counts against
    # a title for words it adds.
    full = words(song)
    full = full + ["".join(p) for p in zip(full, full[1:])]
    coverage = max(_covered(rest, t), _covered(rest, full)) / len(rest)
    precision = _covered(t, rest) / len(t)
    score = 100.0 * (0.65 * coverage + 0.35 * precision)
    if q_artist and rest is not q:
        score += 10.0  # the right artist, named in the query
    return score


def relevance(query: str, title: str, artist: str) -> float:
    """How well a result answers the query, 0..100+.

    The query's words that are the artist's name count for the artist; the
    rest must be in the title. A title is also marked down for words beyond
    the ones asked for, which is what kept "Arijit Singh" (an upload by
    someone else) from scoring like the song. An upload's title is tried
    whole and piece by piece, as "Song - Film" and "Artist - Song" both
    occur, and the best reading counts."""
    q = words(query)
    if not q:
        return 0.0
    parts = title_parts(title)
    readings = [(title, artist)] + [
        (p, " ".join([*parts[:i], *parts[i + 1:], artist or ""]))
        for i, p in enumerate(parts) if len(parts) > 1
    ]
    return max(_relevance(q, song, credit) for song, credit in readings)


def _extras(title: str) -> str:
    """What a title adds after the song's name: its brackets and the parts
    after a dash, folded."""
    inside = re.findall(r"[\(\[\{]([^\)\]\}]*)[\)\]\}]", title or "")
    parts = title_parts(title)[1:]
    return fold(" ".join([*inside, *parts]))


# A genre named as an add-on is a remix that never says so: "Blinding Lights
# (Afro House)", "Blinding Lights (Techno)" sat in the song list under the
# real one. Only in the brackets or after a dash: "Uptown Funk" is the song.
_GENRE_TAG = re.compile(
    r"\b(afro ?house|deep house|tech house|house|techno|trance|trap|drill|"
    r"phonk|edm|dnb|drum (and|n) bass|dubstep|hardstyle|jersey club|amapiano|"
    r"afrobeats?|reggaeton|bossa nova|jazz|funk|disco|hyperpop|uk garage)\b")
# A film or show a song is from ("(From \"House of the Dragon\")"), or who
# is on it, says nothing about its version.
_CREDIT_BRACKET = re.compile(r"^\s*(from|feat|ft|with|featuring)\b", re.I)


def _genre_tagged(title: str) -> bool:
    inside = [b for b in re.findall(r"[\(\[\{]([^\)\]\}]*)[\)\]\}]", title or "")
              if not _CREDIT_BRACKET.match(b)]
    bare = re.sub(r"[\(\[\{][^\)\]\}]*[\)\]\}]", " ", title or "")
    return bool(_GENRE_TAG.search(fold(" ".join([*inside, *title_parts(bare)[1:]]))))


def _told(title: str) -> Set[str]:
    """A title's words, with the versions it implies without the word: a
    dated or staged recording is "live", "(1 HOUR)" is "hour"."""
    folded = _RELEASE.sub(" ", fold(title))
    told = set(folded.split())
    # "燦々 @ SHIBUYA全感覚祭": a venue after an @, or ライブ ("live").
    if _LIVE_HINT.search(_extras(title)) or re.search(r"\s@\s|ライブ", title or ""):
        told.add("live")
    if _HOURS.search(folded):
        told.add("hour")
    if _genre_tagged(title):
        told.add("remix")
    return told


def version_words(title: str) -> Set[str]:
    """The version a title names (remix, live, slowed...), as a set; empty for
    the release itself, however it is labelled."""
    return _told(title) & VERSION_WORDS


def penalty(query: str, title: str, artist: str = "",
            artist_words: Set[str] = frozenset(), duration_ms: int = 0) -> float:
    """Versions, videos, cover acts and junk the query did not ask for.

    `artist_words`: the query's words that name the artist it wants. A title
    carrying them while the credit does not ("Bags Clairo" by Dreamy Dynamics)
    is a cover act borrowing the name."""
    asked = set(words(query))
    told = _told(title)
    pen = VERSION_PENALTY * len((told & VERSION_WORDS) - asked)
    if (duration_ms or 0) > LONG_MS and not asked & LONG_WORDS:
        pen += JUNK_PENALTY
    if _mashup(title) and "x" not in asked:
        pen += VERSION_PENALTY
    pen += VIDEO_PENALTY * len((told & VIDEO_WORDS) - asked)
    folded = fold(title)
    if any(p in folded for p in JUNK_PHRASES):
        pen += JUNK_PENALTY
    if cover_act(query, title, artist, artist_words):
        pen += COVER_ACT_PENALTY
    return pen


_COMPILATION = re.compile(
    r"\b(top \d+|\d+ (songs|hits|tracks)|hits of|non ?stop|back to back|"
    r"jukebox|full album|all songs|collection|compilation)\b")
_ASKED_FOR_MANY = LONG_WORDS | {"best", "top", "hits", "collection", "compilation",
                                "songs", "non", "nonstop"}


def compilation(query: str, title: str, artist_words: Set[str] = frozenset(),
                duration_ms: int = 0) -> bool:
    """Many songs as one upload: "Best Of Arijit Singh 2024", "Top 20 Songs",
    a jukebox, a nonstop mix, anything longer than a song. Penalised, it
    still filled the end of the song list. Kept when the query asks for one.

    "Best of" counts only before the artist asked for or a year: "Best of
    You" is a song."""
    asked = set(words(query))
    if asked & _ASKED_FOR_MANY:
        return False
    if (duration_ms or 0) > LONG_MS:
        return True
    t = fold(title)
    if _COMPILATION.search(t):
        return True
    m = re.search(r"\bbest of\b(.*)", t)
    if m:
        rest = set(m.group(1).split())
        return bool(rest & set(artist_words)) or bool(re.search(r"\b(19|20)\d{2}\b", m.group(1)))
    return False


def _mashup(title: str) -> bool:
    """Two songs joined with an x: "Hiltz Simple x Summertime Sadness",
    "Fuck rap x summertime sadness". A mashup in all but name; the word is
    never said."""
    return bool(re.search(r"\S\s+x\s+\S", fold(title)))


def cover_act(query: str, title: str, artist: str,
              artist_words: Set[str] = frozenset()) -> bool:
    """Someone else's recording sold under the song's name: a tribute,
    karaoke or lullaby credit, or a title borrowing the artist's name that
    the credit does not have."""
    credit = fold(artist)
    if credit and ARTIST_JUNK.search(credit) and not ARTIST_JUNK.search(fold(query)):
        return True
    # A karaoke label's own words for "not the original".
    if _SOUNDALIKE.search(fold(title)) and not _SOUNDALIKE.search(fold(query)):
        return True
    # The whole name, borrowed: "Space House" does not borrow "Beach House".
    told = set(fold(title).split())
    # The query must ask for more than the name ("radiohead creep"): asked
    # only "alfaaz", a title of "Alfaaz" is the song, though an act of that
    # name exists, not a borrowing of it.
    rest = set(words(query)) - set(artist_words)
    return (bool(artist_words) and bool(rest) and artist_words <= told
            and not artist_words & set(credit.split()))


def song_key(title: str, artist: str) -> str:
    """Which song this is, read as an upload: its core title."""
    song, _ = split_upload(title, artist)
    return core_title(song)


def _keys(title: str) -> Set[str]:
    """Every name an upload's title could be giving the song."""
    parts = title_parts(title)
    return {k for k in (core_title(title), *map(core_title, parts[:2])) if k}


def _artists(title: str, artist: str) -> Set[str]:
    _, credit = split_upload(title, artist)
    # Split before folding: folding turns the commas into spaces.
    names = re.split(r",|&|/| x | and |\bfeat\.?|\bft\.?", credit, flags=re.I)
    return {fold(n) for n in names if len(fold(n)) >= 3}


def _featured(title: str) -> str:
    """The artists a title features: what follows "feat."/"ft."/"with" up to
    the bracket's end, or ''."""
    return " ".join(m.group(1) for m in re.finditer(
        r"(?:feat\.?|ft\.?|featuring|with)\s+([^\)\]\}]+)", title or "", re.I))


def same_song(a_title: str, a_artist: str, b_title: str, b_artist: str,
              a_trusted: bool = True, b_trusted: bool = True) -> bool:
    """The same recording, listed twice.

    A trusted credit (JioSaavn's) names the real artists, so two of those must
    share one: Taio Cruz's "Dynamite" is not BTS's. An upload's "artist" is
    whoever uploaded it, so it matches on the song's name alone, read from
    either side of a dash ("Kesariya - Brahmastra", "BTS - Dynamite")."""
    if a_trusted and b_trusted:
        key = core_title(a_title)
        if not key or key != core_title(b_title):
            return False
        a, b = _artists(a_title, a_artist), _artists(b_title, b_artist)
        if a & b:
            return True
        # A name the other credits only in its title counts as a feature
        # ("Heeriye (feat. Arijit Singh)"), and only there: "Creep [In The
        # Style Of Radiohead]" by a karaoke label is not Radiohead's, and as
        # "the same song" it was played in place of the real one.
        told_b = fold(f"{_featured(b_title)} {b_artist}")
        told_a = fold(f"{_featured(a_title)} {a_artist}")
        return any(n in told_b for n in a) or any(n in told_a for n in b)
    if a_trusted or b_trusted:
        known, upload = (a_title, b_title) if a_trusted else (b_title, a_title)
        known_artist, upload_by = (a_artist, b_artist) if a_trusted else (b_artist, a_artist)
        key = core_title(known)
        if not key or key not in _keys(upload):
            return False
        # The upload names an artist ("Radiohead - Karma Police"): it must be
        # this one, or a cover act's row would swallow the real song.
        parts = title_parts(upload)
        if len(parts) >= 2 and core_title(parts[0]) != key:
            told = fold(f"{upload} {upload_by}")
            return any(n in told for n in _artists(known, known_artist))
        return True
    # Two uploads: the same whole name, or the same first two pieces, so
    # "BTS - Dynamite" and "BTS - Butter" stay apart.
    pa, pb = title_parts(a_title), title_parts(b_title)
    if core_title(a_title) and core_title(a_title) == core_title(b_title):
        return True
    return len(pa) >= 2 and len(pb) >= 2 and \
        [core_title(x) for x in pa[:2]] == [core_title(x) for x in pb[:2]]


def collapse(tracks: List, title=lambda t: t.title, artist=lambda t: t.artist,
             absorb: Optional[callable] = None,
             trusted=lambda t: True) -> List:
    """Keep the first of each song, in order. Each later copy is handed to
    `absorb(kept, copy)`, so its source can stay on the row as another copy.
    `trusted(t)`: whether t's artist is the real one (see same_song)."""
    kept: List = []
    for t in tracks:
        twin = next((k for k in kept
                     if same_song(title(k), artist(k), title(t), artist(t),
                                  trusted(k), trusted(t))), None)
        if twin is None:
            kept.append(t)
        elif absorb:
            absorb(twin, t)
    return kept
