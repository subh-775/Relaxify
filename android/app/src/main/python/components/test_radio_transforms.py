"""Radio's pure transforms: merging a raw result, and diversifying (no network).

Run: python components/test_radio_transforms.py
"""
import os
import sys

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from components.radio import *  # noqa: F401,F403
from components import radio as _r
globals().update({k: v for k, v in vars(_r).items() if k.startswith("_") and not k.startswith("__")})


if __name__ == "__main__":
    # Runnable self-check for the non-trivial transform: a raw JioSaavn result
    # must merge into a playable track dict (no network needed).
    raw = [{
        "source_type": "jiosaavn",
        "id": "abc", "title": "Channa Mereya", "artist": "Arijit Singh",
        "album": "Ae Dil Hai Mushkil",
        "image_url": "https://c.saavncdn.com/x/Channa-500x500.jpg",
        "url": "https://www.jiosaavn.com/song/channa-mereya/xyz",
        "duration": 289, "duration_sec": 289,
    }]
    merged = SourceMerger().merge_search_results(jiosaavn_results=raw)
    dicts = [t.to_dict() for t in merged if getattr(t, "primary_source", None)]
    assert dicts, "merge produced no playable track"
    t = dicts[0]
    assert t["sources"].get("jiosaavn", {}).get("url"), "missing jiosaavn stream url"
    assert t["primary_source"] == "jiosaavn", "primary_source not set"
    print("radio self-check OK:", t["title"], "-", t["artist"])

    # _diversify: must interleave artists and cap per-artist (no network).
    sample = (
        [{"title": f"A{i}", "artist": "Artist A"} for i in range(5)] +
        [{"title": f"B{i}", "artist": "Artist B"} for i in range(5)] +
        [{"title": f"C{i}", "artist": "Artist C"} for i in range(5)]
    )
    div = _diversify(sample, limit=9, max_per_artist=3)
    assert len(div) == 9, f"expected 9, got {len(div)}"
    from collections import Counter as _C
    counts = _C(_primary_artist(x["artist"]) for x in div)
    assert all(v <= 3 for v in counts.values()), f"per-artist cap violated: {counts}"
    assert div[0]["artist"] != div[1]["artist"], "not interleaved"
    print("diversify self-check OK:", [x["title"] for x in div])

    # _weighted_shuffle: a permutation, varies between calls, leans to the front.
    import random as _r
    items = list(range(20))
    rng = _r.Random(7)
    orders = [_weighted_shuffle(items, rng) for _ in range(200)]
    assert all(sorted(o) == items for o in orders), "not a permutation"
    assert len({tuple(o) for o in orders}) > 150, "orders barely vary"
    firsts = [o[0] for o in orders]
    assert sum(f < 5 for f in firsts) > sum(f >= 15 for f in firsts), "no lean to the front"
    print("weighted shuffle self-check OK")

    # _in_order_of: the merger's quality sort must not undo the shuffle.
    raw_o = [{"url": "u2"}, {"url": "u1"}, {"url": "u3"}]
    merged_o = [{"title": n, "sources": {"jiosaavn": {"url": u}}}
                for n, u in (("one", "u1"), ("two", "u2"), ("x", "zz"), ("three", "u3"))]
    assert [t["title"] for t in _in_order_of(raw_o, merged_o)] == ["two", "one", "three", "x"]
    print("order restore self-check OK")

    # _yt_song: a YouTube Music radio item's song and artist, undressed.
    assert _yt_song("Talwiinder - KHAYAAL (prod. by NDS) | Official Music Video", "Talwiinder") == ("KHAYAAL", "Talwiinder")
    assert _yt_song("LYRICAL: Kaise Hua | Kabir Singh | Shahid K", "T-Series") == ("Kaise Hua", "T-Series")
    assert _yt_song("Hasan Raheem - Wishes ft Talwiinder | Prod by Umair", "Hasan Raheem") == ("Wishes", "Hasan Raheem")
    assert _yt_song("Pal", "Javed - Mohsin - Topic") == ("Pal", "Javed - Mohsin")
    # _deal: one from each source in turn.
    assert _deal([1, 2, 3], ["a"]) == [1, "a", 2, 3]
    # Radio after a song leaves out its remixes, lofi and covers, unless the
    # song playing is one.
    assert _other_version("Kesariya", {"title": "Kesariya (Lofi Flip)", "artist": "VIBIE"})
    assert _other_version("Karma Police", {"title": "Karma Police", "artist": "Piano Tribute Players"})
    assert not _other_version("Kesariya", {"title": "Heeriye", "artist": "Arijit Singh"})
    assert not _other_version("Kesariya (Lofi Flip)", {"title": "Heeriye (Lofi)", "artist": "VIBIE"})
    print("youtube radio helpers self-check OK")
