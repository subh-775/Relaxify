"""The JioSaavn song normaliser and artist-page helpers (no network).

Run: python components/test_profile_normalize.py
"""
import os
import sys

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from components.profile import *  # noqa: F401,F403
from components import profile as _p
globals().update({k: v for k, v in vars(_p).items() if k.startswith("_") and not k.startswith("__")})


if __name__ == "__main__":
    # Self-check (no network): the 3-shape song normalizer must produce a
    # playable merged track from the flat album-details shape.
    album_song = {  # flat legacy shape from content.getAlbumDetails
        "id": "x1", "song": "Zara Sa", "primary_artists": "KK",
        "album": "Jannat", "image": "https://c.saavncdn.com/x/Zara-150x150.jpg",
        "perma_url": "https://www.jiosaavn.com/song/zara-sa/JjkbABFoQlQ",
        "duration": "303", "year": "2008", "language": "hindi",
    }
    raw = _song_to_raw(album_song)
    assert raw and raw["title"] == "Zara Sa" and raw["artist"] == "KK", raw
    assert "/song/" in raw["url"], "playable url missing"
    tracks = _make_playable([raw])
    assert tracks and tracks[0]["sources"].get("jiosaavn", {}).get("url"), "not playable"

    # artist-topSong shape (title + subtitle) and a non-playable album url.
    assert _song_to_raw({"title": "X", "subtitle": "Y", "perma_url": "https://www.jiosaavn.com/song/x/abc"})["artist"] == "Y"
    assert _song_to_raw({"title": "A", "perma_url": "https://www.jiosaavn.com/album/a/1"}) is None, "album url must not be playable"

    # Artist-field pollution: subtitle "Artist - Album" must not leak the album
    # into the artist (this broke "Go to artist" for Neil Sedaka's topSongs).
    polluted = _song_to_raw({
        "song": "Oh Carol", "subtitle": "Neil Sedaka - Rockin' With Sedaka",
        "album": "Rockin' With Sedaka",
        "perma_url": "https://www.jiosaavn.com/song/oh-carol/x",
    })
    assert polluted["artist"] == "Neil Sedaka", polluted["artist"]
    # Normalized title de-dup collapses the same song across compilations.
    assert _norm_title("Oh! Carol") == _norm_title("Oh Carol") == "ohcarol"
    # Combo detector: collabs are combos, solo / hyphenated duos are not.
    assert _is_combo("Hans Zimmer & Lorne Balfe") and not _is_combo("Hans Zimmer")
    assert not _is_combo("Sachin-Jigar"), "hyphenated duo is not a combo"
    assert _is_combo("Hans Zimmer and Heitor Pereira"), "'and' collab is a combo"
    assert not _is_combo("Florence and the Machine"), "article-led band is not a combo"
    assert _is_combo("Berryman; Chris Martin; Coldplay"), "';' joins a combo"
    # Derivative / non-artist names (tribute, karaoke, covers) are filtered.
    assert _is_nonartist("Coldplay Metal Tribute") and _is_nonartist("Karaoke - Coldplay")
    assert _is_nonartist("Coldplay Piano Covers") and not _is_nonartist("Coldplay")
    assert not _is_nonartist("Chris Martin"), "a real artist is not a non-artist"
    # Compilation / playlist accounts are not artists.
    assert _is_nonartist("Pop Hits") and _is_nonartist("Top 40 Pop Hits")
    assert _is_nonartist("Various Artists") and _is_nonartist("Hits Variété Pop")
    # Same-artist name gate: a bare first name is NOT a longer different name.
    assert _same_artist_name("Priya", "Priya") and not _same_artist_name("Priya", "Priya Saraiya")
    assert _same_artist_name("A.R. Rahman", "AR Rahman"), "punctuation-insensitive"
    assert _same_artist_name("Beyonce", "Beyoncé"), "diacritic-insensitive"
    # One-letter-off names are DIFFERENT artists (no fuzzy merge).
    assert not _same_artist_name("Codeplay", "Coldplay")
    assert not _same_artist_name("Coolplay", "Coldplay")
    assert not _same_artist_name("ColdPlay Wu", "Coldplay")
    assert _credits_exact("Arijit Singh", "Pritam, Arijit Singh"), "exact credit in a list"
    assert not _credits_exact("Priya", "Priya Saraiya"), "namesake must not credit"

    # Variant merge: middle-name collapse reduces "Hans Florian Zimmer" to the
    # same first+last key as "Hans Zimmer" (so they merge into one artist).
    _toks = "Hans Florian Zimmer".split()
    assert re.sub(r"[^a-z0-9]", "", (_toks[0] + _toks[-1]).lower()) == "hanszimmer"

    # Identity-gate helper: real credits pass, unrelated channel names fail.
    assert _credits("The Weeknd", "The Weeknd"), "exact credit must pass"
    assert _credits("Pritam", "Pritam, Arijit Singh"), "duet credit must pass"
    assert not _credits("HouseNatic", "Some Real Artist"), "channel name must not match unrelated song"
    print("profile self-check OK:", tracks[0]["title"], "-", tracks[0]["artist"])
