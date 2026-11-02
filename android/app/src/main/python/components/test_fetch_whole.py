"""fetch_whole: a download that ends early is finished, or fails — never kept.

Run: python components/test_fetch_whole.py

The session is faked. No network.
"""
import os
import sys
import tempfile

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

from components.http import fetch_whole  # noqa: E402

BODY = bytes(range(256)) * 8192  # 2 MB
CUT = 256 * 1024


class _Response:
    def __init__(self, status, headers, body):
        self.status_code, self.headers, self.body = status, headers, body

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size):
        for i in range(0, len(self.body), chunk_size):
            yield self.body[i:i + chunk_size]

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


class Server:
    """Sends at most `cut` bytes per request, without saying so."""

    def __init__(self, cut, ranges=True, length=True):
        self.cut, self.ranges, self.length, self.calls = cut, ranges, length, 0
        self.asked = []

    def get(self, url, stream, timeout, headers):
        self.calls += 1
        self.asked.append(headers.get("Range"))
        start, end = 0, len(BODY) - 1
        ranged = self.ranges and "Range" in headers
        if ranged:
            first, last = headers["Range"][6:].split("-")
            start, end = int(first), int(last or end)
        part = BODY[start:end + 1]
        h = {}
        if self.length:
            h["Content-Length"] = str(len(part))
        if ranged:
            h["Content-Range"] = f"bytes {start}-{end}/{len(BODY)}"
        return _Response(206 if ranged else 200, h, part[:self.cut])


out = os.path.join(tempfile.mkdtemp(), "song.webm")


def read():
    with open(out, "rb") as f:
        return f.read()


# Cut at 256 KB each time: picked up again until whole.
s = Server(CUT)
assert fetch_whole(s, "https://x/videoplayback?a=1", out) == len(BODY)
assert read() == BODY and s.calls == 8, s.calls

# No Content-Length: the address's clen is the size to reach.
s = Server(CUT, length=False)
assert fetch_whole(s, f"https://x/videoplayback?clen={len(BODY)}", out) == len(BODY)
assert read() == BODY

# With clen, it is asked for in fixed pieces, the last one ending at the end.
s = Server(len(BODY))
assert fetch_whole(s, f"https://x/videoplayback?clen={len(BODY)}", out, piece=900_000) == len(BODY)
assert read() == BODY
assert s.asked == ["bytes=0-899999", "bytes=900000-1799999",
                   f"bytes=1800000-{len(BODY) - 1}"], s.asked

# A server that ignores Range: the file starts over rather than repeating.
s = Server(CUT, ranges=False)
try:
    fetch_whole(s, "https://x/videoplayback", out)
    raise AssertionError("a file that never completed was kept")
except IOError:
    pass

# A whole file in one go is one request.
s = Server(len(BODY))
assert fetch_whole(s, "https://x/videoplayback", out) == len(BODY) and s.calls == 1
assert read() == BODY
print("fetch whole: OK")
