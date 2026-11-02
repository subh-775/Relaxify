"""Ranking and de-duplication of search results.

Run: python components/test_search_rank.py

Each case is a real result list seen on 2026-11-02. No network.
"""
import os
import sys

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from components.search_rank import (  # noqa: E402
    collapse, core_title, penalty, relevance, same_song,
)


def rank(query, results):
    return sorted(results, key=lambda r: -(relevance(query, *r) - penalty(query, r[0])))


# The song beats an upload named after its artist ("Tum Hi Ho Arijit Singh"
# used to score "Arijit Singh" by "Arijit Music- Sk" at 100).
top = rank("Tum Hi Ho Mithoon, Arijit Singh", [
    ("Arijit Singh", "Arijit Music- Sk"),
    ("Heeriye", "Dulquer Salmaan, Jasleen Royal, Arijit Singh"),
    ("Tum Hi Ho", "Mithoon, Arijit Singh"),
])
assert top[0][0] == "Tum Hi Ho", top
assert top[-1][0] != "Tum Hi Ho"

# A typo still finds the song, and the song beats a longer title.
top = rank("kesriya", [("Kesriya Safa", "Sangita Mali"), ("Kesariya", "Pritam, Arijit Singh")])
assert top[0][0] == "Kesariya", top

# A shared word in the uploader's name, or a film named like the song, is
# not a match (both seen in "kesariya" results on the phone).
assert relevance("kesariya", "RIP JAGJIT SINGH...", "Nakul Kesariya") < 60
assert relevance("kesariya", "Ve Maahi | Kesari | Akshay Kumar", "Dharma Productions") < 60

# Cover acts: a tribute credit, or a title borrowing the artist's name.
assert penalty("karma police radiohead", "Karma Police", "Piano Tribute Players") >= 35
assert penalty("bags clairo", "Bags Clairo", "Dreamy Dynamics", {"clairo"}) >= 35
assert penalty("bags clairo", "Bags", "Clairo", {"clairo"}) == 0
assert penalty("space song beach house", "Space House", "XCXNX", {"beach", "house"}) == 0
# Two songs joined with an x is a mashup, though it never says so; unless
# the search has the x itself.
assert penalty("summertime sadness", "Hiltz Simple x Summertime Sadness") >= 30
assert penalty("summertime sadness", "HOODS HOTTEST X SUMMERTIME SADNESS") >= 30
assert penalty("hiltz simple x summertime", "Hiltz Simple x Summertime Sadness") == 0
assert penalty("x gon give it", "X Gon' Give It to Ya") == 0
assert penalty("one kiss", "One Kiss") == 0
# The release, however labelled, is not a version.
for label in ("Heroes (Single Version)", "Heroes (2017 Remaster)",
              "Mr. Blue Sky (Album Version)", "Blinding Lights (Radio Edit)"):
    assert penalty("heroes", label) < 30, label
# A real upload is not swallowed by a cover act's row of the same name.
assert not same_song("Karma Police", "Sweet Little Band",
                     "Radiohead - Karma Police", "Radiohead", True, False)
assert same_song("Karma Police", "Radiohead",
                 "Radiohead - Karma Police", "Radiohead", True, False)

# Versions nobody asked for sink; asked for, they rise.
top = rank("blinding lights", [
    ("Blinding Lights (Chromatics Remix)", "The Weeknd"),
    ("The Weeknd - Blinding Lights (10 Minutes Version)", "Music Beat"),
    ("Blinding Lights", "The Weeknd"),
])
assert top[0] == ("Blinding Lights", "The Weeknd"), top
top = rank("blinding lights remix", [
    ("Blinding Lights", "The Weeknd"),
    ("Blinding Lights (Chromatics Remix)", "The Weeknd"),
])
assert "Remix" in top[0][0], top

# A video about the song sinks below the song.
top = rank("dynamite bts", [
    ("BTS Dynamite Lyrics (Color Coded Lyrics)", "Jaeguchi"),
    ("Dynamite", "BTS"),
])
assert top[0] == ("Dynamite", "BTS"), top

# Packaging is not part of the name; a version is.
assert core_title('Tum Hi Ho (From "Aashiqui 2")') == "tum hi ho"
assert core_title("Kesariya [Official Video] 4K") == "kesariya"
assert core_title("Kesariya (Dance Mix)") == "kesariya dance mix"

# Re-uploads of one song are one song; same-named songs by others are not.
# (True, False): the first credit is JioSaavn's, the second an uploader's.
assert same_song("Dynamite", "BTS", "BTS - DYNAMITE", "JayTheShadow", True, False)
assert same_song('Tum Hi Ho (From "Aashiqui 2")', "Arijit Singh, Mithoon",
                 "Tum Hi Ho", "Mithoon, Arijit Singh")
assert not same_song("Tum Ho", "Papon", "Tum Ho", "A.R. Rahman, Suzanne D'Mello")
assert not same_song("Kesariya", "Pritam, Arijit Singh", "Kesariya (Dance Mix)", "Pritam")
assert not same_song("Dynamite", "BTS", "Dynamite", "Taio Cruz")

# "Song - Film" uploads, as YouTube lists Kesariya five times (seen on the
# phone): each is the JioSaavn song, and they are one another.
for upload in ("Kesariya - Brahmastra", "Kesariya - Brahmastra | Ranbir Kapoor",
               "Kesariya 8K/4K Music Video"):
    assert same_song("Kesariya", "Pritam, Arijit Singh", upload, "Sony Music India", True, False), upload
assert same_song("Kesariya - Brahmastra", "Sony Music India",
                 "Kesariya - Brahmastra", "Sachin Kumar Editor", False, False)
# ...but another song from the same film is not, nor another song by one artist.
assert not same_song("Kesariya", "Pritam", "Deva Deva - Brahmastra", "Sony Music India", True, False)
assert not same_song("BTS - Dynamite", "x", "BTS - Butter", "y", False, False)

# An upload's title is read from either side of the dash.
assert relevance("kesariya", "Kesariya - Brahmastra", "Sony Music India") >= 99

# Collapsing keeps the first and hands each copy over.
handed = []
kept = collapse(
    [("Dynamite", "BTS"), ("BTS - Dynamite", "JayTheShadow"), ("Dynamite", "Taio Cruz")],
    title=lambda t: t[0], artist=lambda t: t[1],
    absorb=lambda keep, copy: handed.append((keep, copy)),
    trusted=lambda t: t[1] in ("BTS", "Taio Cruz"),
)
assert kept == [("Dynamite", "BTS"), ("Dynamite", "Taio Cruz")], kept
assert handed == [(("Dynamite", "BTS"), ("BTS - Dynamite", "JayTheShadow"))]
from components.search_rank import version_words  # noqa: E402
assert version_words("Believer (Kaskade Remix)") == {"remix"}
assert version_words("Heroes (2017 Remaster)") == set()

# The merger keeps a remix apart from its song, and a cover act's row from
# the real artist's upload (both seen on 2026-11-02).
from components.source_merger import SourceMerger, SourceType  # noqa: E402
merged = SourceMerger()._resolve_key
buckets = []
k1 = merged({"title": "Believer", "artist": "Imagine Dragons", "duration": 204}, SourceType.JIOSAAVN, buckets)
k2 = merged({"title": "Believer (Kaskade Remix)", "artist": "Imagine Dragons, Kaskade", "duration": 200}, SourceType.JIOSAAVN, buckets)
assert k1 != k2
buckets = []
k1 = merged({"title": "Karma Police", "artist": "Sweet Little Band", "duration": 260}, SourceType.JIOSAAVN, buckets)
k2 = merged({"title": "Radiohead - Karma Police", "artist": "Radiohead", "duration": 262}, SourceType.YOUTUBE, buckets)
assert k1 != k2
buckets = []
k1 = merged({"title": "Kesariya", "artist": "Pritam, Arijit Singh", "duration": 268}, SourceType.JIOSAAVN, buckets)
k2 = merged({"title": "Kesariya - Brahmastra", "artist": "Sony Music India", "duration": 270}, SourceType.YOUTUBE, buckets)
assert k1 == k2
print("search rank: OK")
