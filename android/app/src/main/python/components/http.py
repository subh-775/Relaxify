"""One pooled HTTP session for the whole backend.

Every module here used to call `requests.get(...)` on the bare module. That
builds a throwaway Session per call, so each one paid a full DNS + TCP + TLS
handshake — 300-900ms on a mobile carrier — to a host we had just finished
talking to. It is the same waste the audio proxy had, spread across the Home
feed, artist and album pages, playlists, radio, cover-art fetches and the
Spotify importer. Opening the Home screen alone made several of these calls.

Import SESSION from here and use it exactly like the module (`SESSION.get(...)`)
and the connection is reused instead.

Deliberately separate from mobile_server's `_stream_session`: a stalled artwork
or Last.fm lookup must never be able to hold a connection slot the audio path
needs.
"""

import requests
from requests.adapters import HTTPAdapter


def build_session(pool: int = 8, maxsize: int = 16) -> requests.Session:
    s = requests.Session()
    try:
        from urllib3.util.retry import Retry

        # One retry, and only on connect. A read that fails half way through has
        # already handed us a partial body; replaying it is not free and not
        # obviously correct, so that stays the caller's problem.
        retry = Retry(total=1, connect=1, read=0, status=0, backoff_factor=0.2,
                      allowed_methods=frozenset(["GET", "HEAD"]))
        adapter = HTTPAdapter(max_retries=retry,
                              pool_connections=pool, pool_maxsize=maxsize)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
    except Exception:
        # urllib3 internals moved around between versions; a session with default
        # retries still pools connections, which is the point.
        pass
    return s


SESSION = build_session()

__all__ = ["SESSION", "build_session"]


def _clen(url: str) -> int:
    """The size a googlevideo address carries in its `clen`; 0 without one."""
    from urllib.parse import parse_qs, urlsplit

    clen = parse_qs(urlsplit(url).query).get("clen", [""])[0]
    return int(clen) if clen.isdigit() else 0


def _expected_size(response) -> int:
    """The whole file's size by the server's word; 0 when it does not say."""
    rng = response.headers.get("Content-Range") or ""
    if "/" in rng and rng.rsplit("/", 1)[1].isdigit():
        return int(rng.rsplit("/", 1)[1])
    if response.status_code == 200 and response.headers.get("Content-Length", "").isdigit():
        return int(response.headers["Content-Length"])
    return 0


def fetch_whole(session, url: str, out_path: str, on_progress=None,
                tries: int = 4, timeout: float = 60,
                piece: int = 1024 * 1024) -> int:
    """Download `url` to `out_path` and return its size — all of it, or raise.

    A YouTube stream can end early without an error: one download stopped at
    exactly 256 KB of a 2 MB song and was filed as finished, a track that
    played eight seconds. So the size is checked against what the server said
    it would be, and a short body is picked up again from where it stopped
    with a Range request — for as long as each one brings more, and `tries`
    times in a row that bring nothing before giving up.

    When the size is known up front it is asked for a `piece` at a time:
    googlevideo sends one open-ended request at about playback speed, a
    six-minute song took three minutes, and fixed ranges are served at full
    speed (yt-dlp downloads YouTube the same way).
    """
    done, idle = 0, 0
    total = _clen(url)
    with open(out_path, "wb") as f:
        while idle < tries:
            before = done
            if total:
                end = min(done + piece, total) - 1
                headers = {"Range": f"bytes={done}-{end}"}
            else:
                headers = {"Range": f"bytes={done}-"} if done else {}
            try:
                with session.get(url, stream=True, timeout=timeout, headers=headers) as r:
                    r.raise_for_status()
                    if done and r.status_code != 206:
                        # The server ignored the range and sent the file from
                        # the start: start the file again too.
                        f.seek(0)
                        f.truncate()
                        done = 0
                    total = total or _expected_size(r)
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            f.write(chunk)
                            done += len(chunk)
                            if on_progress:
                                on_progress(done, total)
            except (requests.ConnectionError, requests.Timeout,
                    requests.exceptions.ChunkedEncodingError):
                pass  # picked up from `done` on the next try
            if total and done >= total:
                return done
            if not total and done:
                return done  # nothing to check against
            idle = 0 if done > before else idle + 1
    raise IOError(f"stopped at {done} of {total or '?'} bytes")
