"""Self-check: one song found several times on one source keeps ONE copy.

Run it directly:  python components/test_merge_copies.py

JioSaavn returns a recording on its album and again on later compilations.
The merger used to let each later copy overwrite the source's URL and cover,
so search showed (and played) the last compilation under the album's title.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from components.source_merger import SourceMerger  # noqa: E402


def row(album, year, art, url):
    return {"title": "Kesariya", "artist": "Pritam, Arijit Singh", "album": album,
            "year": year, "image_url": art, "url": url, "duration": 268}


merged = SourceMerger().merge_search_results(jiosaavn_results=[
    row("Arijit Singh (All Time Hits)", 2023, "art/all-time", "u/all-time"),
    row("Brahmastra", 2022, "art/brahmastra", "u/brahmastra"),
    row("Best of Arijit Singh", 2024, "art/best-of", "u/best-of"),
])
assert len(merged) == 1, merged
t = merged[0].to_dict()
js = t["sources"]["jiosaavn"]
assert t["album"] == "Brahmastra", t["album"]
assert t["artwork_urls"]["source:jiosaavn"] == "art/brahmastra", t["artwork_urls"]
assert js["url"] == "u/brahmastra", js
print("ok")
