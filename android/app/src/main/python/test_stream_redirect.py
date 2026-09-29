"""Self-check for proxy_stream's redirect.

Run it directly:  python test_stream_redirect.py

The player is sent to the CDN instead of the audio being copied through the
server. These pin the parts that make that safe: the JioSaavn ladder is walked
once and pinned, a seek goes straight to the pinned URL without asking the CDN
again, the Auto quality cap only applies to tracks that have not started, and
pipe=1 still streams through as the last resort.
"""

import mobile_server as m


class Resp:
    def __init__(self, code):
        self.status_code = code
        self.headers = {}

    def close(self):
        pass

    def iter_content(self, chunk_size):
        yield b"ab"


probes = []


def fake_get(url, headers=None, stream=None, timeout=None):
    probes.append((url, headers.get("Range")))
    # This track has no 320 file.
    return Resp(404 if url.endswith("_320.mp4") else 206)


m._stream_session.get = fake_get
m._resolve_stream_url_cached = lambda url, source, br: f"https://cdn.example/t_{br}.mp4"
client = m.app.test_client()

# First play walks 320 (dead) -> 160, and redirects there.
r = client.get("/api/proxy_stream?url=song1&source=jiosaavn&bitrate=320")
assert r.status_code == 302, r.status_code
assert r.headers["Location"] == "https://cdn.example/t_160.mp4"
assert [p[0] for p in probes] == ["https://cdn.example/t_320.mp4", "https://cdn.example/t_160.mp4"]
assert all(p[1] == "bytes=0-1" for p in probes)

# A seek: straight to the pinned rung, no probe.
probes.clear()
r = client.get("/api/proxy_stream?url=song1&source=jiosaavn&bitrate=320")
assert r.headers["Location"].endswith("t_160.mp4") and probes == []

# The Auto cap: a new track starts at the cap; the started one keeps its rung.
client.get("/api/quality_cap?kbps=96")
r = client.get("/api/proxy_stream?url=song2&source=jiosaavn&bitrate=320")
assert r.headers["Location"].endswith("t_96.mp4")
r = client.get("/api/proxy_stream?url=song1&source=jiosaavn&bitrate=320")
assert r.headers["Location"].endswith("t_160.mp4")
client.get("/api/quality_cap?kbps=0")

# The last resort still copies the stream through.
r = client.get("/api/proxy_stream?url=song1&source=jiosaavn&bitrate=320&pipe=1")
assert r.status_code == 206 and r.data == b"ab"

print("ok")
