"""Clear cache (and the cache limit's auto-clear) leaves the caches that bound
themselves alone: the song cache ExoPlayer has open, Fresco's covers, and the
artwork HTTP cache. Deleting them cost a re-download of every cover, and left
ExoPlayer's index listing song files that were gone.

Run: python test_cache_clear.py
"""
import os
import tempfile

import android_env
import mobile_server as m


def touch(path: str, size: int = 10) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"x" * size)


def main() -> None:
    with tempfile.TemporaryDirectory() as root:
        cache = os.path.join(root, "cache")
        kept = [
            os.path.join(cache, "TrackPlayer", "0", "song.v3.exo"),
            os.path.join(cache, "image_cache", "v2.ols100.1", "cover.cnt"),
            os.path.join(cache, "http", "journal"),
            os.path.join(cache, "chaquopy", "AssetFinder", "x.py"),
        ]
        cleared = [
            os.path.join(cache, "lyrics", "a.json"),
            os.path.join(cache, "scratch.tmp"),
        ]
        for p in kept + cleared:
            touch(p)
        android_env._dirs["cache"] = cache
        android_env._dirs["downloads"] = os.path.join(root, "music")

        # Only the clearable part is counted against the limit.
        assert m._cache_bytes() == 20, m._cache_bytes()

        # No token on a desktop run: the route is open.
        res = m.app.test_client().post("/api/cache/clear")
        assert res.status_code == 200, res.status_code
        assert res.get_json()["freed"] == 20, res.get_json()

        for p in kept:
            assert os.path.exists(p), f"cleared a self-managed cache: {p}"
        for p in cleared:
            assert not os.path.exists(p), f"left a clearable file: {p}"
    print("ok")


if __name__ == "__main__":
    main()
