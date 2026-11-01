"""The library scan: names read back as they were asked for, and cached.

Run: python components/test_scan_downloads.py

mutagen is faked, so no audio files are needed. No network.
"""
import os
import sys
import tempfile
import types

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

import components.download_manager as dm  # noqa: E402

tags = {}
reads = []


def fake_file(path, easy=False):
    if easy:
        reads.append(path)
        return _Easy()
    return None


class _Easy(dict):
    info = types.SimpleNamespace(length=200, bitrate=320000)

    def __init__(self):
        super().__init__({k: [v] for k, v in tags.items()})


dm.MUTAGEN_AVAILABLE = True
dm.mutagen = types.SimpleNamespace(File=fake_file)

folder = tempfile.mkdtemp()


def song(stem):
    path = os.path.join(folder, stem + ".m4a")
    with open(path, "wb") as f:
        f.write(b"x")
    return path


# A title the file name cannot hold comes back whole from the tags.
tags.update(title='What? (Live: 2024)', artist="A - B")
path = song(dm.safe_stem(tags["title"], tags["artist"]))
cache = {}
t = dm.scan_downloads(folder, cache)[0]
assert (t["title"], t["artist"]) == ('What? (Live: 2024)', "A - B"), t

# Tags that do NOT match the name are a mis-embed: the name still wins.
os.remove(path)
tags.update(title="Wrong Song", artist="Wrong Artist")
path = song("Right Song - Right Artist")
t = dm.scan_downloads(folder, cache)[0]
assert (t["title"], t["artist"]) == ("Right Song", "Right Artist"), t

# An unchanged file is not read again; a changed one is.
reads.clear()
assert dm.scan_downloads(folder, cache)[0]["title"] == "Right Song"
assert not reads, "an unchanged file was parsed again"
with open(path, "ab") as f:
    f.write(b"more")
dm.scan_downloads(folder, cache)
assert reads, "a changed file kept its old answer"

# Long names stay inside Android's limit, and are not cut mid-character.
long = dm.safe_stem("तुम" * 200, "x" * 500)
assert len(long.encode("utf-8")) <= 223
long.encode("utf-8").decode("utf-8")
print("scan downloads: OK")
