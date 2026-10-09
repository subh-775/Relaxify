"""
Fix_Spotify — on-device backend (Android / Chaquopy)
====================================================
A Flask port of api/main.py that runs INSIDE the APK.

Why Flask and not FastAPI
-------------------------
FastAPI depends on pydantic v2, whose `pydantic-core` is a compiled Rust
extension with no Android wheel. Flask + Werkzeug are pure Python, so Chaquopy
installs them straight from PyPI. Every route below keeps the EXACT request and
response shape of api/main.py, so frontend/src/api.js works unmodified.

Why the phone and not a server
------------------------------
JioSaavn geo-gates to India and YouTube bot-blocks datacenter IPs. Running the
backend on the handset means every outbound request carries the user's own
carrier/residential IP — the same IP the desktop app used. No proxies, no
hosting, no blocking.

Same-origin by design
---------------------
This server ALSO serves the React SPA. The WebView loads http://127.0.0.1:8765/,
so the app and the API share an origin: `apiUrl()` stays relative, CORS is moot,
and <audio src="/api/proxy_stream?..."> streams and seeks natively.

What is NOT here (vs. the desktop backend)
------------------------------------------
* YouTube    — needs Deno to solve the JS n-signature challenge; there is no
               Deno for Android. Disabled at the client factory (see below), so
               no YouTube result can ever reach the UI as an unplayable track.
* ffprobe    — /api/stream_info reported the true bitrate by shelling out to
               ffprobe. No ffmpeg on Android, so we report the bitrate the
               source advertises instead of probing the bytes.
"""

import hmac
import io
import json
import os
import re
import sys
import threading
import time
import urllib.parse
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, is_dataclass, replace
from html import unescape
from pathlib import Path
from typing import Any, Dict, List, Optional

import android_env

import requests as http_requests
from requests.adapters import HTTPAdapter
from flask import Flask, Response, jsonify, redirect, request, send_file, send_from_directory
import logging
from werkzeug.serving import make_server

# On Android, Gradle's `syncPythonSources` task copies components/ next to this
# file, so it is importable straight off Chaquopy's sys.path.
#
# On a desktop test run (`python mobile_server.py`) it is not — the real
# components/ lives two directories up. Add the repo root BEFORE the imports
# below, not in __main__, which would run far too late.
if not (Path(__file__).parent / "components").is_dir():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from components.fuzz_compat import fuzz
from components.unified_search import UnifiedSearchService
from components.source_merger import SourceType
from components.download_manager import DownloadManager, DownloadQueueConfig
from components.metadata_enricher import MetadataEnricher


# ──────────────────────────────────────────────────────────────────────────────
# YouTube kill-switch
# ──────────────────────────────────────────────────────────────────────────────
# components/ is vendored verbatim, and two places still ask for a YouTube
# client: unified_search's default `enabled_sources`, and profile.py's
# _fallback_search_service(), which hardcodes SourceType.YOUTUBE into a set
# literal we cannot override with config.
#
# Rather than fork those files, we neuter the one funnel they both go through.
# UnifiedSearchService._search_source() bails out with [] when _get_client()
# returns None, so refusing to build a YouTube client disables YouTube
# EVERYWHERE — search, radio, artist pages, album fallbacks — with one hook and
# zero edits to components/.
_DISABLED_SOURCES = {SourceType.YOUTUBE, SourceType.YOUTUBE_MUSIC}
_original_get_client = UnifiedSearchService._get_client

# YouTube via NewPipeExtractor (newpipe_yt). Off unless the user enables it in
# Settings AND an on-device self-test resolves a real stream. While False the
# kill-switch below is fully active and behaviour is identical to a build that
# never had this code — the default JioSaavn/SoundCloud path is untouched.
_youtube_enabled = False


def _yt_cookies_path() -> str:
    """Where the user-imported YouTube cookies.txt lives (app-private)."""
    return os.path.join(android_env.files_dir(), "youtube_cookies.txt")


def _drop_yt_client():
    """Forget the cached YouTube client so the next use picks up new cookies."""
    if _search_service is not None:
        for st in _DISABLED_SOURCES:
            _search_service._clients.pop(st, None)


class _NewPipeYouTubeClient:
    """Drop-in for YouTubeClient, backed by NewPipeExtractor instead of yt-dlp.

    unified_search only ever calls `.search(query, limit)` and reads `.to_dict()`
    off each hit, so duck-typing YouTubeTrack's shape is the whole contract — no
    change to components/unified_search.py.
    """

    def search(self, query: str, limit: int = 10):
        import newpipe_yt
        from components.youtube_downloader import YouTubeTrack

        out = []
        for r in newpipe_yt.search(query, limit):
            url = r.get("url") or ""
            if not url:
                continue
            out.append(
                YouTubeTrack(
                    # The watch URL is the id we resolve a stream from later.
                    id=url.rsplit("v=", 1)[-1],
                    title=r.get("title") or "",
                    artist=r.get("artist") or "",
                    uploader=r.get("artist") or "",
                    url=url,
                    duration_ms=int(r.get("duration_ms") or 0) or None,
                    thumbnail=r.get("artwork") or None,
                    is_music=True,
                )
            )
        return out


def _get_client_no_youtube(self, source_type):
    if source_type in _DISABLED_SOURCES:
        if not _youtube_enabled:
            return None
        with self._clients_lock:
            if source_type not in self._clients:
                self._clients[source_type] = _NewPipeYouTubeClient()
            return self._clients[source_type]
    return _original_get_client(self, source_type)


UnifiedSearchService._get_client = _get_client_no_youtube


# ──────────────────────────────────────────────────────────────────────────────
# YouTube downloads
# ──────────────────────────────────────────────────────────────────────────────
# DownloadManager sends every youtube.com URL to YouTubeClient, i.e. yt-dlp —
# which cannot extract YouTube on Android for the same reason searching couldn't:
# no JS runtime to solve the signature challenge. So "download" on a YouTube track
# just failed, even with the source enabled and playing fine.
#
# It plays because NewPipe hands us a direct, already-deobfuscated audio URL. That
# URL is an ordinary HTTP file — so downloading is a plain streamed GET. No yt-dlp,
# no ffmpeg (there is none on Android): we keep the container YouTube served, and
# the manager's existing tagging step embeds the metadata afterwards exactly as it
# does for JioSaavn.
_original_download_from_url = DownloadManager._download_from_url


def _is_youtube_url(url: str) -> bool:
    return any(d in url for d in ("youtube.com", "youtu.be", "music.youtube.com"))


def _download_from_url_android(self, url: str, task):
    if not _is_youtube_url(url):
        return _original_download_from_url(self, url, task)

    from components.download_manager import DownloadResult
    import newpipe_yt

    info = newpipe_yt.stream_url(url)
    if not info or not info.get("url"):
        return DownloadResult(success=False, error="Could not resolve a YouTube audio stream")

    # Opus in a .webm container is what YouTube serves for its best audio-only
    # track; m4a otherwise. Keeping the served container is what lets us skip
    # transcoding — and the tagger reads both.
    codec = (info.get("codec") or "").lower()
    ext = "webm" if "opus" in codec or "webm" in codec else "m4a"
    out_path = f"{task.output_path}.{ext}"

    try:
        with _stream_session.get(info["url"], stream=True, timeout=60) as r:
            r.raise_for_status()
            total = int(r.headers.get("Content-Length") or 0)
            done = 0
            with open(out_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    f.write(chunk)
                    done += len(chunk)
                    task.downloaded_bytes = done
                    task.total_bytes = total
                    if total:
                        task.progress = min(99.0, done / total * 100.0)
                    self._emit_progress(task)
    except Exception as e:
        # A half-written file is worse than none: the library would list a track
        # that cannot play.
        try:
            os.remove(out_path)
        except OSError:
            pass
        return DownloadResult(success=False, error=f"YouTube download failed: {e}")

    return DownloadResult(
        success=True,
        file_path=out_path,
        file_size=os.path.getsize(out_path),
        bitrate=info.get("bitrate_kbps") or None,
        codec=info.get("codec") or None,
        source="youtube",
    )


DownloadManager._download_from_url = _download_from_url_android

# The sources a mobile search actually queries. iTunes/MusicBrainz are
# metadata-only (no stream URL) and would just slow the response down; clean
# metadata still arrives progressively through /api/enrich. YouTube is added
# only when the toggle turns it on (see /api/youtube/experimental).
PLAYABLE_SEARCH_SOURCES = {SourceType.JIOSAAVN, SourceType.SOUNDCLOUD}

# The same set, as the strings a track's `sources` dict is keyed by.
# _playable_source_name() gates on THIS one: a track whose only source isn't in
# here is treated as unplayable and dropped from the results entirely.
PLAYABLE_SOURCES = {"jiosaavn", "soundcloud"}


def _set_youtube(enabled: bool) -> None:
    """Turn the YouTube source on/off across EVERY switch that gates it.

    There are three, and they must move together:
      _youtube_enabled       — whether _get_client() will build a YouTube client
      PLAYABLE_SEARCH_SOURCES — whether search asks YouTube at all
      PLAYABLE_SOURCES        — whether a YouTube hit survives _playable_source_name

    Flipping the first two but not the third is exactly what "YouTube is on but no
    song ever shows a YouTube badge" was: search queried YouTube, got results, and
    then dropped every YouTube-only track on the floor on the way out — because
    the string set still said only JioSaavn and SoundCloud could play. Three call
    sites each flipped their own subset by hand; now they all come through here.
    """
    global _youtube_enabled
    _youtube_enabled = enabled
    for st, name in ((SourceType.YOUTUBE, "youtube"), (SourceType.YOUTUBE_MUSIC, "youtube_music")):
        if enabled:
            PLAYABLE_SOURCES.add(name)
        else:
            PLAYABLE_SOURCES.discard(name)
    if enabled:
        PLAYABLE_SEARCH_SOURCES.add(SourceType.YOUTUBE)
    else:
        PLAYABLE_SEARCH_SOURCES.discard(SourceType.YOUTUBE)


# ──────────────────────────────────────────────────────────────────────────────
# Globals
# ──────────────────────────────────────────────────────────────────────────────
_search_service: Optional[UnifiedSearchService] = None
_download_manager: Optional[DownloadManager] = None
_enricher: Optional[MetadataEnricher] = None
_server = None

_lyrics_cache: Dict[str, Dict[str, Any]] = {}
_lyrics_cache_lock = threading.Lock()
_LYRICS_CACHE_MAX = 1000


def _build_pooled_session(pool: int = 4, maxsize: int = 8) -> http_requests.Session:
    """A connection-reusing session.

    Mobile networks make a cold TLS handshake even more expensive than on
    desktop — 300-900ms on a carrier — so connection reuse matters more here
    than anywhere else in the app.
    """
    s = http_requests.Session()
    try:
        from urllib3.util.retry import Retry
        retry = Retry(total=1, connect=1, read=0, status=0, backoff_factor=0.2,
                      allowed_methods=frozenset(["GET", "HEAD"]))
        adapter = HTTPAdapter(max_retries=retry,
                              pool_connections=pool, pool_maxsize=maxsize)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
    except Exception:
        pass
    return s


_lyrics_session = _build_pooled_session()

# The audio path's own session.
#
# This existed for lyrics and never for the hottest path in the app: every play
# AND every seek called the bare `requests` module, which builds a throwaway
# Session and pays a full DNS + TCP + TLS handshake to a CDN we were talking to
# a second earlier. That was several hundred milliseconds of pure waste before
# the first audio byte, on every single seek.
#
# Separate from the lyrics pool on purpose: a stalled lyrics lookup must never
# be able to hold a connection slot the audio needs, and audio wants a deeper
# pool (a seek can overlap the previous response still closing).
_stream_session = _build_pooled_session(pool=8, maxsize=16)


def get_default_download_dir() -> str:
    """The user's custom folder if set, else Downloads/Relaxify/music, else
    the app-private dir. See android_env.downloads_dir() for why."""
    return android_env.downloads_dir()


# ──────────────────────────────────────────────────────────────────────────────
# Helpers (ported verbatim from api/main.py)
# ──────────────────────────────────────────────────────────────────────────────
def _clean_text(value: Optional[str]) -> Optional[str]:
    """Decode API/entity noise before it reaches the UI."""
    if value is None:
        return None
    cleaned = unescape(str(value))
    replacements = {
        "Â·": "·",
        "â€™": "'",
        "â€œ": '"',
        "â€": '"',
        "â€“": "-",
        "â€”": "-",
    }
    for bad, good in replacements.items():
        cleaned = cleaned.replace(bad, good)
    cleaned = cleaned.replace("Â·", "·")
    return " ".join(cleaned.split())


def _finalize_track_info(info: Dict[str, Any]) -> Dict[str, Any]:
    """FINAL clean metadata embedded into every downloaded file, regardless of
    which screen triggered the download. JioSaavn metadata is authoritative for
    its own catalog, so for a JioSaavn track we gap-fill only; artwork/genre/
    date/isrc always overlay (pure gain)."""
    if not isinstance(info, dict):
        return info
    out = dict(info)
    src = info.get("sources") if isinstance(info.get("sources"), dict) else {}
    from_jiosaavn = bool((src.get("jiosaavn") or {}).get("url")) \
        or info.get("playable_source") == "jiosaavn" \
        or info.get("primary_source") == "jiosaavn"
    try:
        meta = _enricher._lookup(
            info.get("title") or "",
            info.get("artist") or "",
            info.get("isrc"),
            info.get("duration_ms"),
        ) if _enricher else None
    except Exception:
        meta = None

    if meta:
        if meta.get("artist") and not (from_jiosaavn and out.get("artist")):
            out["artist"] = _clean_text(meta["artist"])
        if meta.get("album") and not (from_jiosaavn and out.get("album")):
            out["album"] = _clean_text(meta["album"])
        if meta.get("release_date"):
            out["release_date"] = meta["release_date"]
        if meta.get("genre"):
            out["genre"] = meta["genre"]
        if meta.get("isrc") and not out.get("isrc"):
            out["isrc"] = meta["isrc"]
        art = meta.get("artwork") or {}
        cover = art.get("600") or art.get("300") or art.get("100")
        if cover:
            au = dict(out.get("artwork_urls") or {})
            au["600"] = cover
            out["artwork_urls"] = au
            out["artwork_url"] = cover
    return out


def _source_to_dict(source: Any) -> Dict[str, Any]:
    if hasattr(source, "to_dict"):
        return source.to_dict()
    if is_dataclass(source):
        return asdict(source)
    if isinstance(source, dict):
        return source
    return {}


def _playable_source_name(track: Any) -> Optional[str]:
    primary = getattr(track, "primary_source", None)
    if primary and getattr(primary, "value", primary) in PLAYABLE_SOURCES:
        primary_name = getattr(primary, "value", primary)
        primary_data = _source_to_dict(getattr(track, "sources", {}).get(primary))
        if primary_data.get("url"):
            return primary_name

    for source_key, source in getattr(track, "sources", {}).items():
        source_name = getattr(source_key, "value", source_key)
        source_data = _source_to_dict(source)
        if source_name in PLAYABLE_SOURCES and source_data.get("url"):
            return source_name
    return None


def _clean_artwork_urls(artwork_urls: Dict[str, Any]) -> Dict[str, str]:
    return {
        str(size): url
        for size, url in (artwork_urls or {}).items()
        if isinstance(url, str) and url
    }


# Resolved stream URLs, cached briefly.
#
# Starting one song resolves its stream URL at least TWICE within a second:
# /api/stream_info (the quality badge) and /api/proxy_stream (the audio itself),
# plus once more per step if the proxy walks the bitrate ladder. Each resolve is
# a real network round trip — a JioSaavn auth-token call, or a full yt-dlp /
# NewPipe extraction for SoundCloud / YouTube — so the duplicate is pure latency
# on every play. The resolved URL is deterministic for a given (source, url,
# bitrate), so we memoise it.
#
# TTL, not permanent: these are time-limited signed CDN URLs.
#
# This was 300s, and that was a bug you could hear. The URLs live for HOURS, but
# any track longer than five minutes fell out of cache mid-song — so a seek near
# the end paid a FULL re-resolve (for JioSaavn, two sequential API round trips)
# at the exact moment the user was waiting on it. 30 minutes is still far inside
# their real lifetime, and the window now SLIDES on every hit, so the song you
# are actually listening to can never expire underneath you.
#
# On an upstream 4xx the proxy evicts the entry, so a genuinely dead URL is
# never re-served from cache no matter how long the TTL is.
_STREAM_CACHE: "OrderedDict[tuple, tuple]" = OrderedDict()  # (source, url, bitrate) -> (stream_url, expires_at)
_STREAM_TTL = 1800.0
_stream_cache_lock = threading.Lock()
_STREAM_CACHE_MAX = 256


# The bitrate rung that actually worked for a track, remembered.
#
# proxy_stream rebuilt [320, 160, 96] on EVERY request, so a track with no 320
# file paid a failed 320 resolve plus a failed 320 CDN request before falling to
# 160 — on every single seek. That is the "some songs are much worse than
# others" pattern.
#
# It was also a correctness bug: a seek that fell to a DIFFERENT rung than the
# initial play used is a different file of a different length, so the byte
# offsets the player computed are meaningless — garbled audio or a hard stall.
# Pinning makes every request for a track use the rung it started on.
_LADDER_PIN: Dict[tuple, int] = {}   # (source, url) -> bitrate that worked
_ladder_lock = threading.Lock()


def _pin_ladder(url: str, source: str, bitrate: int) -> None:
    with _ladder_lock:
        _LADDER_PIN[(source, url)] = bitrate
        if len(_LADDER_PIN) > _STREAM_CACHE_MAX:
            _LADDER_PIN.clear()  # cheap bound; a re-walk costs one request


def _unpin_ladder(url: str, source: str) -> None:
    """Forget the pin so a rung that has genuinely died can be re-walked."""
    with _ladder_lock:
        _LADDER_PIN.pop((source, url), None)


def _resolve_stream_url_cached(url: str, source: str, bitrate: int = 320) -> Optional[str]:
    key = (source, url, bitrate)
    now = time.monotonic()
    with _stream_cache_lock:
        hit = _STREAM_CACHE.get(key)
        if hit and hit[1] > now:
            # Sliding window: touching an entry renews it AND marks it
            # most-recently-used, so the currently-playing track is both the
            # last to expire and the last to be evicted.
            _STREAM_CACHE[key] = (hit[0], now + _STREAM_TTL)
            _STREAM_CACHE.move_to_end(key)
            return hit[0]
    # Resolve OUTSIDE the lock — it is a network round trip, and holding the
    # lock across it would serialise every concurrent play behind the slowest.
    resolved = _resolve_stream_url(url, source, bitrate)
    if resolved:
        with _stream_cache_lock:
            _STREAM_CACHE[key] = (resolved, now + _STREAM_TTL)
            _STREAM_CACHE.move_to_end(key)
            # Evict the OLDEST, not everything. The old code called .clear() on
            # overflow, so the 257th entry wiped the song you were listening to
            # and the next seek re-resolved from scratch. The check-then-clear
            # -then-set sequence was not atomic either, and the server is
            # threaded=True, so two concurrent resolves could interleave in it.
            while len(_STREAM_CACHE) > _STREAM_CACHE_MAX:
                _STREAM_CACHE.popitem(last=False)
    return resolved


# What each resolved stream ACTUALLY carries, in kbps, keyed like _STREAM_CACHE.
# Filled by _resolve_stream_url from the source's own answer — NewPipe's
# averageBitrate, the rung in a JioSaavn file name, SoundCloud's format abr —
# because the quality badge used to fall back to the SETTING, and the setting
# is a ceiling: on Auto every source read "320 kbps" whatever was playing.
_SERVED_KBPS: "OrderedDict[tuple, int]" = OrderedDict()


def _note_kbps(url: str, source: str, bitrate: int, kbps) -> None:
    try:
        kbps = int(round(float(kbps or 0)))
    except (TypeError, ValueError):
        kbps = 0
    if kbps <= 0:
        return
    with _stream_cache_lock:
        _SERVED_KBPS[(source, url, bitrate)] = kbps
        _SERVED_KBPS.move_to_end((source, url, bitrate))
        while len(_SERVED_KBPS) > _STREAM_CACHE_MAX:
            _SERVED_KBPS.popitem(last=False)


def _jiosaavn_rung(stream_url: str) -> int:
    """JioSaavn names the file by its bitrate: …_320.mp4, …_160.mp4, …_96.mp4."""
    m = re.search(r"_(\d{2,3})\.mp4(?:$|\?)", stream_url or "")
    return int(m.group(1)) if m else 0


def _evict_stream_url(url: str, source: str, bitrate: int) -> None:
    with _stream_cache_lock:
        _STREAM_CACHE.pop((source, url, bitrate), None)
    _unpin_ladder(url, source)


# One client per source, for the whole process.
#
# These were constructed fresh on every resolve — a new requests.Session each
# time, so a cold TLS handshake to the SOURCE stacked on top of the cold
# handshake to the CDN. JioSaavn's get_streaming_url makes two sequential API
# calls, so that was two wasted handshakes per play, every play.
_source_clients: Dict[str, Any] = {}
_source_client_lock = threading.Lock()


def _source_client(name: str):
    with _source_client_lock:
        client = _source_clients.get(name)
        if client is None:
            if name == "jiosaavn":
                from components.jiosaavn_downloader import JioSaavnClient
                client = JioSaavnClient()
            elif name == "soundcloud":
                from components.soundcloud_downloader import SoundCloudClient
                client = SoundCloudClient()
            elif name == "itunes":
                from components.itunes_client import iTunesClient
                client = iTunesClient()
            else:
                return None
            _source_clients[name] = client
        return client


def _resolve_stream_url(url: str, source: str, bitrate: int = 320) -> Optional[str]:
    """Resolve a source page URL into a direct, playable stream URL."""
    if source in ("youtube", "youtube_music"):
        # NewPipeExtractor returns a URL with the signature and throttling
        # parameter already solved, so it plays directly. yt-dlp cannot do this
        # on Android (no JS runtime) — see mobile/python/newpipe_yt.py.
        import newpipe_yt

        info = newpipe_yt.stream_url(url)
        if not info:
            return None
        _note_kbps(url, source, bitrate, info.get("bitrate_kbps"))
        return info.get("url")
    if source == "jiosaavn":
        # JioSaavn serves discrete bitrates only: 320 / 160 / 96.
        js_bitrate = 320 if bitrate >= 320 else (160 if bitrate >= 160 else 96)
        stream = _source_client("jiosaavn").get_streaming_url(url, js_bitrate)
        if stream:
            _note_kbps(url, source, bitrate, _jiosaavn_rung(stream) or js_bitrate)
        return stream
    if source == "soundcloud":
        fmt = _source_client("soundcloud").get_streaming_format(url, bitrate)
        if not fmt:
            return None
        _note_kbps(url, source, bitrate, fmt.get("abr") or fmt.get("tbr"))
        return fmt.get("url")
    return None


def _parse_lrc(synced: str):
    """Parse an LRC synced-lyrics string into [{time, text}] sorted by time."""
    lines = []
    for raw in (synced or "").splitlines():
        stamps = re.findall(r"\[(\d+):(\d+(?:\.\d+)?)\]", raw)
        text = re.sub(r"\[\d+:\d+(?:\.\d+)?\]", "", raw).strip()
        for m, s in stamps:
            t = int(m) * 60 + float(s)
            lines.append({"time": round(t, 2), "text": text})
    lines.sort(key=lambda x: x["time"])
    return lines


def _arg(name: str, default: str = "") -> str:
    return (request.args.get(name) or default).strip()


def _int_arg(name: str, default: int = 0) -> int:
    try:
        return int(request.args.get(name, default))
    except (TypeError, ValueError):
        return default


def _body() -> Dict[str, Any]:
    return request.get_json(silent=True) or {}


# ──────────────────────────────────────────────────────────────────────────────
# App
# ──────────────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=None)

# Set by start_server() from Kotlin. Empty on a desktop test run, which disables
# the check below so `python mobile_server.py` still works.
_API_TOKEN = ""


@app.before_request
def _require_token():
    """Gate /api/* on the per-launch token.

    Loopback is NOT a security boundary on Android: every other app on the phone
    can reach 127.0.0.1:8765. Unguarded, any installed app could drive this
    server — enqueue downloads, read the local library, or (now that the app can
    hold All-files access) repoint downloads at an arbitrary path via
    /api/downloads/dir.

    Only /api/* is gated. The SPA's own HTML/JS/CSS stay open because they are
    just our static assets and carry no secret — in particular the token is NOT
    in them; it reaches the page over the Kotlin JS bridge instead.

    The token rides in the query string rather than a header because <audio
    src="/api/proxy_stream?..."> cannot set headers, and it must be authorised
    like everything else.
    """
    if not _API_TOKEN:
        return None                                  # desktop test run
    if not request.path.startswith("/api/"):
        return None                                  # SPA assets
    if request.method == "OPTIONS":
        return None                                  # CORS preflight

    supplied = request.args.get("_t") or request.headers.get("X-Fix-Token") or ""
    # compare_digest: constant-time, so a caller can't time-probe the token.
    if not hmac.compare_digest(supplied, _API_TOKEN):
        return jsonify({"error": "forbidden"}), 403
    return None


@app.after_request
def _cors(resp):
    """Permissive CORS on the DESKTOP TEST RUN ONLY.

    It used to be unconditional, and on a phone that is a disclosure the app
    gains nothing from. Loopback is reachable from the device's browser, so
    `Access-Control-Allow-Origin: *` let any web page the user happened to open
    fetch http://127.0.0.1:<port>/health and READ the answer — a reliable
    "this person has Relaxify installed" fingerprint, and a port oracle for
    whatever else is listening. /api/* was never at risk (the token gate holds,
    and compare_digest is the right comparison), but a site should not be able
    to enumerate the apps on the phone either.

    The RN client is not a browser and never performs a preflight, so it does
    not need these headers at all. The one caller that does is a desktop
    browser pointed at the dev server over `adb forward`, and that run is
    exactly the one with no token set.
    """
    if not _API_TOKEN:
        resp.headers.setdefault("Access-Control-Allow-Origin", "*")
        resp.headers.setdefault("Access-Control-Allow-Headers", "*")
        resp.headers.setdefault("Access-Control-Allow-Methods", "*")
    return resp


@app.get("/health")
def health():
    return jsonify({"status": "healthy"})


@app.get("/api/connectivity")
def connectivity():
    """Distinguishes 'offline' from 'no results' for the UI's offline banner."""
    for url in ("https://www.google.com", "https://1.1.1.1"):
        try:
            _stream_session.head(url, timeout=4, allow_redirects=False)
            return jsonify({"online": True})
        except Exception:
            continue
    return jsonify({"online": False})


# ─── Search ───────────────────────────────────────────────────────────────────
@app.post("/api/search")
def search_tracks():
    body = _body()
    query = (body.get("query") or "").strip()
    if not query:
        return jsonify({"results": [], "total": 0, "query": ""})
    limit = max(1, min(int(body.get("limit") or 20), 100))

    if _search_service is None:
        return jsonify({"error": "Search service not ready"}), 503

    try:
        # Per-request config copy — /api/search and /api/search/suggestions share
        # one service, and suggestions fire on every keystroke. replace() keeps
        # them from racing each other on the shared config object.
        req_config = replace(
            _search_service.config,
            max_total_results=limit,
            enabled_sources=PLAYABLE_SEARCH_SOURCES,
            # 12 -> 8. This number used to be decorative: the search blocked on
            # the slowest source no matter what it said (see the executor in
            # unified_search.search). Now it is a real wall-clock cap on how long
            # a search can take, so it is worth setting to something a person
            # would actually wait — whatever has arrived by then ships.
            timeout_seconds=8.0,
        )
        results = _search_service.search(query, req_config)

        out = []
        for track in results:
            playable_source = _playable_source_name(track)
            if not playable_source:
                continue
            out.append({
                "title": _clean_text(track.title) or "",
                "artist": _clean_text(track.artist) or "",
                "album": _clean_text(track.album),
                "duration_ms": track.duration_ms,
                "isrc": track.isrc,
                "sources": {k.value: _source_to_dict(v) for k, v in track.sources.items()},
                "primary_source": playable_source,
                "search_score": track.search_score,
                "artwork_url": track.get_best_artwork() if hasattr(track, "get_best_artwork") else None,
                "artwork_urls": _clean_artwork_urls(getattr(track, "artwork_urls", {})),
                "is_playable": True,
                "playable_source": playable_source,
            })

        return jsonify({"results": out, "total": len(out), "query": query})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Autocomplete's artist lookup runs beside the song search. Shared, not one
# pool per keystroke; a slow lookup is abandoned (see below), never awaited.
_suggest_pool = ThreadPoolExecutor(max_workers=4)


@app.get("/api/search/suggestions")
def search_suggestions():
    q = _arg("q")
    limit = min(max(_int_arg("limit", 8), 1), 20)
    if len(q) < 2 or _search_service is None:
        return jsonify({"suggestions": []})

    try:
        # Suggestions must be CHEAP — they fire on every debounced keystroke.
        #
        # This called the full UnifiedSearchService.search(), which meant every
        # keystroke paid SourceMerger._resolve_key's fuzzy bucketing,
        # _merge_entries, _rank_by_relevance and the cache bookkeeping — to
        # produce a list of title strings. All of that exists to reconcile
        # results ACROSS sources, and this route deliberately queries exactly
        # one, so there was never anything to reconcile.
        #
        # Straight to the client: one source, so nothing to reconcile.
        from components.profile import top_artist_hint
        artist_f = _suggest_pool.submit(top_artist_hint, q)
        songs = _source_client("jiosaavn").search(q, limit)

        # JioSaavn's own order, which is its popularity ranking. It used to be
        # re-sorted here (title starts with the query, then shortest first),
        # which put the wanted song first for 24 of 35 typed searches; kept as
        # JioSaavn sends it, plus the artist row, 32 of 35.
        suggestions = []
        try:
            artist = artist_f.result(timeout=1.5)
        except Exception:
            artist = None  # slow or failed: the songs alone, as before
        if artist:
            suggestions.append({
                "kind": "artist",
                "title": artist["name"],
                "artist": "",
                "artwork_url": artist["image"] or None,
            })

        seen = set()
        for track in songs:
            key = f"{(track.title or '').lower()}|{(track.artist or '').lower()}"
            if key in seen:
                continue
            seen.add(key)
            suggestions.append({
                "kind": "song",
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                # Single-source by construction, so this is a constant rather
                # than something to read off a merged track.
                "sources": ["jiosaavn"],
                "isrc": None,
                # The suggestion list shows a cover next to each row. The search
                # result already carries artwork, so returning it here costs
                # nothing — whereas letting the client look it up would mean an
                # extra request per row, on every debounced keystroke.
                "artwork_url": track.image_url or None,
            })
            if len(suggestions) >= limit + (1 if artist else 0):
                break
        return jsonify({"suggestions": suggestions})
    except Exception:
        return jsonify({"suggestions": []})


@app.get("/api/search/lyric")
def search_lyric():
    """A typed line of lyrics -> the song it is from: {title, artist,
    artwork_url}, or {}.

    YouTube Music's song search, through NewPipe: the right song first for 20
    of 22 typed lines that do not contain the title (JioSaavn: 10), measured
    2026-10-09. It only NAMES the song; a tap searches for it as usual, so this
    works with the YouTube setting off. Lines of four words or more only."""
    q = _arg("q")
    if len(q.split()) < 4:
        return jsonify({})
    try:
        import newpipe_yt
        hits = newpipe_yt.search(q, 1, music=True)
    except Exception:
        hits = []
    hit = hits[0] if hits else None
    if not hit or not hit.get("title"):
        return jsonify({})
    return jsonify({
        "title": hit["title"],
        "artist": hit.get("artist") or "",
        "artwork_url": hit.get("artwork") or None,
    })


# ─── Streaming ────────────────────────────────────────────────────────────────
@app.post("/api/stream_url")
def get_stream_url():
    body = _body()
    url, source = body.get("url") or "", body.get("source") or ""
    try:
        # Cached, so this shares the entry stream_info/proxy_stream just filled
        # rather than paying its own resolve. (Not called by the RN app — it is
        # here for anything driving the backend directly.)
        stream_url = _resolve_stream_url_cached(url, source, 320)
        if stream_url:
            return jsonify({"stream_url": stream_url})
        return jsonify({
            "stream_url": None,
            "error": f"Could not extract streaming URL for source: {source}",
        })
    except Exception as e:
        return jsonify({"stream_url": None, "error": str(e)}), 500


@app.get("/api/stream_info")
def stream_info():
    """Live quality readout for the player.

    The desktop build shelled out to ffprobe to read the true bitrate off the
    wire. Android has no ffmpeg, so we report what the SOURCE says the stream it
    handed us carries (see _SERVED_KBPS) — and nothing when it says nothing,
    rather than a number that only looks like a measurement.

    For JioSaavn the rung the proxy actually pinned wins over the one asked
    for: a track with no 320 file is playing its 160 one, and the badge should
    say so.
    """
    source = _arg("source")
    url = _arg("url")
    bitrate = _int_arg("bitrate", 320)
    try:
        # Verified and pinned here, ahead of the skip: the next track's warm-up
        # comes through this, so proxy_stream only has to answer from cache.
        stream_url, _ = _verified_stream(url, source, bitrate)
        if not stream_url:
            return jsonify({"bitrate_kbps": None, "codec": None,
                            "error": "Could not resolve stream"})
        with _ladder_lock:
            bitrate = _LADDER_PIN.get((source, url)) or bitrate
        with _stream_cache_lock:
            kbps = _SERVED_KBPS.get((source, url, bitrate))
        return jsonify({"bitrate_kbps": kbps})
    except Exception as e:
        return jsonify({"bitrate_kbps": None, "codec": None, "error": str(e)})


# One User-Agent for every request that touches a stream, ours and the
# player's (player.ts STREAM_UA): the CDN sees a single client either way.
_STREAM_UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36"

# Upstream answers that mean "this URL is dead", not "try again".
_DEAD_STREAM = (403, 404, 410, 500, 502, 503)

# Auto quality's ceiling in kbps, set by the app after repeated stalls on a
# weak connection (see /api/quality_cap); 0 = none. Applies to tracks that
# start from now on: a track already pinned keeps its rung, or a seek would
# land on byte offsets of a different file.
_quality_cap = 0


def _stream_headers(source: str, range_header: Optional[str] = None) -> dict:
    headers = {"User-Agent": _STREAM_UA, "Accept": "*/*"}
    if range_header:
        headers["Range"] = range_header
    if source == "jiosaavn":
        headers["Referer"] = "https://www.jiosaavn.com/"
    return headers


def _verified_stream(url: str, source: str, bitrate: int):
    """The CDN URL for this track, known to answer. Returns (url, last_status).

    JioSaavn doesn't hold every track at every bitrate: a 320 file may 404
    while 160/96 exist. The ladder is walked ONCE per track: the rung that
    answers is pinned (_LADDER_PIN), and every later request for the track,
    every seek, goes straight to it without asking the CDN again.
    """
    with _ladder_lock:
        pinned = _LADDER_PIN.get((source, url))
    if pinned:
        s_url = _resolve_stream_url_cached(url, source, pinned)
        if s_url:
            return s_url, None
        _unpin_ladder(url, source)

    if _quality_cap:
        bitrate = min(bitrate, _quality_cap)
    if source == "jiosaavn":
        ladder = [b for b in dict.fromkeys((bitrate, 320, 160, 96)) if b <= bitrate]
    else:
        ladder = [bitrate]

    last_status = None
    for br in ladder or [bitrate]:
        s_url = _resolve_stream_url_cached(url, source, br)
        if not s_url:
            # The source had no full, progressive stream to hand us
            # (SoundCloud HLS/preview-only, or a dead page).
            print(f"[proxy] {source} could not resolve a stream for {url} (br={br})")
            continue
        # Two bytes, to learn whether the CDN serves this URL at all, before
        # the player is sent to it. 6s to connect: a dead host fails fast.
        r = _stream_session.get(s_url, headers=_stream_headers(source, "bytes=0-1"),
                                stream=True, timeout=(6, 10))
        code = r.status_code
        r.close()
        if code in _DEAD_STREAM:
            # A cached URL upstream now rejects is stale: drop it (and the
            # pin) so the next attempt re-resolves instead of reusing it.
            _evict_stream_url(url, source, br)
            print(f"[proxy] {source} upstream {code} for {url} (br={br})")
            last_status = code
            continue
        _pin_ladder(url, source, br)
        return s_url, None
    return None, last_status


@app.get("/api/proxy_stream")
def proxy_stream():
    """Send the player to the song's own CDN URL.

    This used to copy the whole stream through this server, 64 KB at a time.
    On a fast connection a new song or a seek pulls at line speed, and CPython
    under Chaquopy, holding the GIL for every chunk, was then too busy to answer
    anything else: search, lyrics and Home all stalled exactly when the data was
    flowing fastest. Now it finds and checks the URL and answers with a
    redirect; ExoPlayer (KotlinAudio allows cross-protocol redirects, and sends
    the track's own headers) streams from the CDN itself, with its own ranges
    and retries. Every seek still comes here first, and is answered from cache.

    `fresh=1` forgets the cached URL first (the app's retry after an error);
    `pipe=1` copies the stream through here as before (its last resort).
    """
    url, source = _arg("url"), _arg("source")
    bitrate = _int_arg("bitrate", 320)
    if _arg("fresh"):
        for br in {bitrate, 320, 160, 96}:
            _evict_stream_url(url, source, br)

    try:
        s_url, last_status = _verified_stream(url, source, bitrate)
    except Exception as e:
        return jsonify({"detail": str(e)}), 500
    if not s_url:
        detail = (f"Stream unavailable (upstream status {last_status})"
                  if last_status else "Could not resolve streaming URL")
        return jsonify({"detail": detail}), 502

    if _arg("pipe") != "1":
        resp = redirect(s_url, code=302)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    try:
        upstream = _stream_session.get(
            s_url, headers=_stream_headers(source, request.headers.get("Range", "bytes=0-")),
            stream=True, timeout=(6, 30))
    except Exception as e:
        return jsonify({"detail": str(e)}), 502
    resp_headers = {"Accept-Ranges": "bytes", "Cache-Control": "no-cache"}
    if upstream.status_code == 206 and upstream.headers.get("content-range"):
        resp_headers["Content-Range"] = upstream.headers["content-range"]
    if upstream.headers.get("content-length"):
        resp_headers["Content-Length"] = upstream.headers["content-length"]

    def stream_chunks():
        try:
            for chunk in upstream.iter_content(chunk_size=65536):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return Response(
        stream_chunks(),
        status=upstream.status_code,  # 200 or 206
        mimetype=upstream.headers.get("content-type", "audio/mp4"),
        headers=resp_headers,
        direct_passthrough=True,
    )


@app.get("/api/quality_cap")
def quality_cap():
    """Auto quality's ceiling: the app lowers it after stalls, 0 lifts it."""
    global _quality_cap
    _quality_cap = max(0, _int_arg("kbps", 0))
    return jsonify({"kbps": _quality_cap})


# ─── Downloads ────────────────────────────────────────────────────────────────
def _fit_bytes(text: str, max_bytes: int) -> str:
    """`text` cut to at most `max_bytes` of UTF-8, never mid-character."""
    raw = text.encode("utf-8")
    if len(raw) <= max_bytes:
        return text
    return raw[:max_bytes].decode("utf-8", "ignore").rstrip()


@app.post("/api/download")
def download_track():
    if not _download_manager:
        return jsonify({"detail": "Download manager not initialized"}), 500
    body = _body()
    url = (body.get("url") or "").strip()
    if not url:
        return jsonify({"detail": "URL must not be empty"}), 400

    track_info = body.get("track_info") or {}
    max_bitrate = max(64, min(int(body.get("max_bitrate") or 256), 320))

    # Android has no user-chosen output folder (scoped storage), so `output_dir`
    # from the frontend is ignored and everything lands in the app's Music dir.
    out_dir_path = Path(get_default_download_dir())
    try:
        out_dir_path.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    # Capped in BYTES: Android's file name limit is 255 bytes, and a Devanagari
    # character is three of them, so a long Hindi title (or a JioSaavn credit
    # listing a dozen singers) failed the download with "File name too long".
    # 140 + " - " + 80 + ".m4a.part" stays well under it; the full title and
    # artist still go into the tags, and the library scan reads them back.
    safe_title = _fit_bytes(re.sub(r'[<>:"/\\|?*]', "_", str(track_info.get("title") or "")).strip(), 140) or "unknown"
    safe_artist = _fit_bytes(re.sub(r'[<>:"/\\|?*]', "_", str(track_info.get("artist") or "")).strip(), 80) or "unknown"
    output_path = str(out_dir_path / f"{safe_title} - {safe_artist}")

    try:
        task_id = _download_manager.add_download(
            url=url,
            track_info=track_info,
            output_path=output_path,
            max_bitrate=max_bitrate,
        )
        return jsonify({"task_id": task_id, "status": "queued",
                        "message": "Download started in background"})
    except Exception as e:
        return jsonify({"detail": str(e)}), 500


@app.get("/api/download/<task_id>")
def get_download_status(task_id):
    if not _download_manager:
        return jsonify({"detail": "Download manager not initialized"}), 500
    task = _download_manager.get_task(task_id)
    if not task:
        return jsonify({"detail": "Task not found"}), 404
    return jsonify({
        "task_id": task.id,
        "status": task.status.value,
        "progress": task.progress,
        "downloaded_bytes": task.downloaded_bytes,
        "total_bytes": task.total_bytes,
        "file_path": task.file_path,
        "error": task.error,
    })


@app.get("/api/downloads")
def list_downloads():
    if not _download_manager:
        return jsonify({"tasks": []})
    tasks = _download_manager.get_all_tasks()
    tasks.sort(key=lambda t: t.created_at, reverse=True)
    return jsonify({"tasks": [t.to_dict() for t in tasks]})


@app.get("/api/downloads/info")
def downloads_info():
    # `download_dir` stays for the existing frontend contract; the rest tells the
    # Settings screen whether we actually landed in the folder the user asked for.
    return jsonify({
        "download_dir": get_default_download_dir(),
        **android_env.downloads_status(),
    })


@app.post("/api/downloads/dir")
def set_downloads_dir():
    """Choose a custom download folder (or clear it, restoring the default).

    Refuses a folder we cannot actually write to, rather than accepting it and
    letting every later download fail with no explanation.
    """
    path = (_body().get("path") or "").strip()

    settings = android_env.read_settings()
    if not path:
        settings.pop("download_dir", None)
        android_env.write_settings(settings)
        return jsonify({"ok": True, **android_env.downloads_status()})

    if not android_env.is_writable(path):
        return jsonify({
            "ok": False,
            "error": "Can't write to that folder. Grant “All files access” in "
                     "Android Settings, or pick a different folder.",
        }), 400

    settings["download_dir"] = path
    android_env.write_settings(settings)
    return jsonify({"ok": True, **android_env.downloads_status()})


@app.get("/api/downloads/local")
def scan_local_downloads():
    """Rebuild the offline library from the tags embedded in each file on disk.
    Disk is the source of truth, so downloads survive a cleared frontend registry
    or an app restart."""
    from components.download_manager import scan_downloads
    directory = get_default_download_dir()
    tracks = []
    for root in android_env.music_roots():
        try:
            tracks += scan_downloads(root)
        except Exception:
            pass
    return jsonify({"tracks": tracks, "download_dir": directory})


def _music_roots() -> list:
    """Resolved library folders; a path must sit inside one to be served or
    deleted. See android_env.music_roots."""
    return [Path(r).resolve() for r in android_env.music_roots()]


@app.post("/api/downloads/delete")
def delete_download_file():
    """Delete a downloaded file from disk (not just the app's registry).

    Guards against path traversal: the resolved target MUST sit inside the
    active download directory, so a caller can't ask us to delete arbitrary
    files elsewhere on the phone.
    """
    raw = (_body().get("path") or "").strip()
    if not raw:
        return jsonify({"ok": False, "error": "no path"}), 400

    roots = _music_roots()
    try:
        target = Path(raw).resolve()
        # A PARENT check, not a string prefix: "…/Relaxify-old/x.m4a" starts
        # with "…/Relaxify" and used to pass. Same rule /api/local applies.
        inside = any(root in target.parents for root in roots)
        if not inside or not target.is_file():
            return jsonify({"ok": False, "error": "not a managed download"}), 400
        target.unlink()
        # Clean up an emptied album subfolder, but never the root itself.
        parent = target.parent
        if parent not in roots and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.post("/api/download/<task_id>/cancel")
def cancel_download(task_id):
    if not _download_manager:
        return jsonify({"cancelled": False})
    return jsonify({"cancelled": _download_manager.cancel_task(task_id)})


@app.post("/api/download/<task_id>/retry")
def retry_download(task_id):
    if not _download_manager:
        return jsonify({"retried": False})
    return jsonify({"retried": _download_manager.retry_task(task_id)})


@app.post("/api/downloads/clear")
def clear_completed_downloads():
    if not _download_manager:
        return jsonify({"cleared": 0})
    return jsonify({"cleared": _download_manager.clear_completed()})


_LOCAL_AUDIO_EXTS = {".m4a", ".mp3", ".flac", ".opus", ".ogg", ".wav", ".aac", ".mp4"}


@app.get("/api/local")
def serve_local_file():
    """Serve a downloaded file for offline playback.

    Confined to the downloads directory and to audio extensions. The path comes
    from our own records, but it arrives over HTTP from the WebView, so it is
    still treated as untrusted input.
    """
    path = request.args.get("path") or ""
    try:
        real = Path(path).expanduser().resolve(strict=True)
    except Exception:
        return jsonify({"detail": "File not found"}), 404

    if not any(root in real.parents for root in _music_roots()):
        return jsonify({"detail": "Path not allowed"}), 403
    if real.suffix.lower() not in _LOCAL_AUDIO_EXTS:
        return jsonify({"detail": "Unsupported file type"}), 403
    if not real.is_file():
        return jsonify({"detail": "File not found"}), 404

    # conditional=True gives us Range/206 handling, so seeking works offline.
    return send_file(str(real), conditional=True)


@app.get("/api/local/artwork")
def serve_local_artwork():
    """Cover art embedded in a downloaded file's own tags.

    The library scan deliberately skips artwork (reading every file's tags for
    covers on every scan is heavy); this serves ONE file's embedded cover on
    demand, so downloads show art without the scan paying for it — including
    files downloaded before the app started remembering covers client-side.
    Same path confinement as /api/local.
    """
    path = request.args.get("path") or ""
    try:
        real = Path(path).expanduser().resolve(strict=True)
    except Exception:
        return jsonify({"detail": "File not found"}), 404

    if not any(root in real.parents for root in _music_roots()):
        return jsonify({"detail": "Path not allowed"}), 403
    if real.suffix.lower() not in _LOCAL_AUDIO_EXTS:
        return jsonify({"detail": "Unsupported file type"}), 403

    try:
        import mutagen
        audio = mutagen.File(str(real))
        data, mime = None, "image/jpeg"
        if audio is not None:
            tags = getattr(audio, "tags", None)
            # MP4/M4A: covr atoms.
            covr = None
            try:
                covr = (tags or {}).get("covr")
            except Exception:
                covr = None
            if covr:
                data = bytes(covr[0])
            # MP3: any APIC frame.
            if data is None and tags is not None:
                for key in getattr(tags, "keys", lambda: [])():
                    if str(key).startswith("APIC"):
                        pic = tags[key]
                        data, mime = pic.data, pic.mime or mime
                        break
            # FLAC/OGG: pictures list.
            if data is None:
                pics = getattr(audio, "pictures", None)
                if pics:
                    data, mime = pics[0].data, pics[0].mime or mime
        if not data:
            return jsonify({"detail": "No embedded artwork"}), 404
        resp = app.response_class(data, mimetype=mime)
        # Immutable per file — let the client cache it hard.
        resp.headers["Cache-Control"] = "public, max-age=604800"
        return resp
    except Exception:
        return jsonify({"detail": "No embedded artwork"}), 404


# ─── Lyrics ───────────────────────────────────────────────────────────────────
@app.get("/api/lyrics")
def get_lyrics():
    """Synced lyrics from lrclib, with a JioSaavn plain-text fallback.

    The matching gate is the important part: lrclib's fuzzy search happily
    returns a DIFFERENT song that merely shares a title. Wrong lyrics are worse
    than no lyrics, so a candidate must clear an artist + duration confidence
    check before we accept it.
    """
    title = _arg("title")
    artist = _arg("artist")
    duration = _int_arg("duration", 0)

    cache_key = f"{title.lower()}|{artist.lower()}"
    with _lyrics_cache_lock:
        hit = _lyrics_cache.get(cache_key)
    if hit is not None:
        return jsonify(hit)

    def _clean_for_search(text: str) -> str:
        cleaned = re.sub(r'\s*[\(\[\{].*?[\)\]\}]', '', text)
        cleaned = re.sub(r'\s*[-|].*(?:official|video|audio|lyric|full|hd|4k|visuali).*$',
                         '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s+(?:feat\.|ft\.).*$', '', cleaned, flags=re.IGNORECASE)
        return cleaned.strip()

    def _youtube_split(text: str, credit: str):
        """A YouTube upload titled "Artist - Song", credited to a channel.

        Searched as it stands, "Ritviz - Dha" by "Sony Music India" matches
        nothing. Returns (song, artist) to try first, or None when the title
        has no dash. Whichever side reads as the credited artist is the artist;
        with neither, the YouTube convention says it is the left."""
        parts = re.split(r"\s+[-–—]\s+", _clean_for_search(text), maxsplit=1)
        if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
            return None
        left, right = parts[0].strip(), parts[1].strip()
        who = _clean_for_search(credit).lower()
        if who and fuzz.token_set_ratio(who, right.lower()) >= 80:
            return left, credit
        if who and fuzz.token_set_ratio(who, left.lower()) >= 80:
            return right, credit
        return right, left

    def _fetch(title, artist, budget):
        headers = {"User-Agent": "Fix_Spotify/1.0 (music player)"}
        clean_title = _clean_for_search(title)
        clean_artist = _clean_for_search(artist)

        # A total miss can otherwise stack many slow calls; on a mobile network
        # those add up fast. Bound the whole lookup.
        start = time.monotonic()
        deadline = start + budget             # hard cap for the entire lookup
        ll_deadline = start + budget * 0.6    # favour lrclib (our only SYNCED source)

        def _http_get(url, *, timeout, **kw):
            left = deadline - time.monotonic()
            if left < 1.5:
                return None
            try:
                return _lyrics_session.get(url, timeout=min(timeout, left), **kw)
            except Exception:
                return None

        # Indian tracks often arrive credited as "Lyricist, Composer, Singer"
        # ("Sayeed Quadri, Pritam, KK") but lrclib indexes ONE artist name, so we
        # try each component separately.
        artist_candidates = []
        if clean_artist:
            artist_candidates.append(clean_artist)
            for sep in (",", "&", "feat.", "ft.", " x ", "/"):
                if sep in clean_artist.lower():
                    for part in re.split(r'[,&/]| feat\.| ft\.| x ', clean_artist,
                                         flags=re.IGNORECASE):
                        part = part.strip()
                        if part and part not in artist_candidates:
                            artist_candidates.append(part)
                    break
        if not artist_candidates:
            artist_candidates = [""]

        plain_fallback = {"value": None}

        # fuzz_compat is rapidfuzz on desktop and an equivalent pure-Python
        # implementation on Android, so this is ONE code path on both.
        #
        # It used to try `from rapidfuzz import fuzz` here and fall back to bare
        # difflib. rapidfuzz has no Android wheel, so on-device that import
        # always raised (re-walking the import path every call, since Python
        # does not negatively-cache failures) — and the difflib branch dropped
        # token_set_ratio entirely, losing exactly the extra-words tolerance
        # this matching depends on.
        def _sim(a, b):
            return max(fuzz.token_set_ratio(a, b), fuzz.partial_ratio(a, b))

        def _artist_cmp(a, b):
            # No partial_ratio here: it spuriously matches long multi-artist
            # credit strings.
            return max(fuzz.token_set_ratio(a, b),
                       fuzz.ratio(a.replace(" ", ""), b.replace(" ", "")))

        def _norm(s):
            s = re.sub(r"[^\w\s]", " ", (s or "").lower())
            return re.sub(r"\s+", " ", s).strip()

        def _artist_score(cand_artist):
            if not clean_artist or not cand_artist:
                return 0.0
            cand = _norm(cand_artist)
            best = _artist_cmp(_norm(clean_artist), cand)
            for part in re.split(r'[,&/]| feat\.| ft\.| x ', clean_artist, flags=re.IGNORECASE):
                part = part.strip()
                if len(part) >= 2:
                    best = max(best, _artist_cmp(_norm(part), cand))
            return best

        def _is_valid(item):
            title_score = _sim(_norm(clean_title), _norm(item.get("trackName") or ""))
            if title_score < 65:
                return False
            cand_dur = item.get("duration") or 0
            dur_known = bool(duration and duration > 0 and cand_dur)
            # Same title, far-off length = a different recording. Hard veto.
            if dur_known and abs(duration - float(cand_dur)) > 25:
                return False
            dur_ok = dur_known and abs(duration - float(cand_dur)) <= 8
            if clean_artist:
                # A tight duration match alone is NOT enough — different songs
                # share a title AND a runtime. Require artist corroboration.
                return _artist_score(item.get("artistName") or "") >= 55
            if dur_known:
                return title_score >= 80 and dur_ok
            return title_score >= 90

        # lrclib often hosts several uploads of one song with slightly different
        # masters. A set of timestamps only lines up with audio of the SAME
        # length, so collect every valid synced hit and take the closest duration.
        synced_candidates = []

        def _consider(item):
            if not _is_valid(item) or item.get("instrumental"):
                return
            synced = item.get("syncedLyrics") or ""
            plain = item.get("plainLyrics") or ""
            if synced:
                parsed = _parse_lrc(synced)
                if parsed:
                    cand_dur = item.get("duration") or 0
                    delta = abs(duration - float(cand_dur)) if duration and cand_dur else 1e9
                    synced_candidates.append(
                        (delta, {"plain": plain, "synced": parsed, "source": "lrclib"})
                    )
                    return
            if plain and plain_fallback["value"] is None:
                plain_fallback["value"] = {"plain": plain, "synced": [], "source": "lrclib"}

        def _best_synced():
            if not synced_candidates:
                return None
            synced_candidates.sort(key=lambda x: x[0])
            return synced_candidates[0][1]

        # Strategy 1 — fuzzy search: one call returns many ranked candidates, and
        # its queries cover multi-artist credits a single exact lookup can't.
        search_queries = []
        if clean_artist:
            search_queries.append(f"{clean_title} {artist_candidates[-1]}".strip())
            search_queries.append(f"{clean_title} {clean_artist}".strip())
        search_queries.append(clean_title)

        seen_queries = set()
        for q in search_queries:
            if not q or q in seen_queries or time.monotonic() > ll_deadline:
                continue
            seen_queries.add(q)
            r = _http_get("https://lrclib.net/api/search",
                          params={"q": q}, headers=headers, timeout=8)
            if r is not None and r.status_code == 200:
                try:
                    items = r.json()
                except Exception:
                    items = None
                if isinstance(items, list):
                    for item in items[:15]:
                        _consider(item)
                    best = _best_synced()
                    if best:
                        return best

        # Strategy 2 — exact /api/get per artist candidate, for songs whose fuzzy
        # ranking buries the right match.
        for art in artist_candidates[:4]:
            if time.monotonic() > ll_deadline:
                break
            r = _http_get("https://lrclib.net/api/get",
                          params={"track_name": clean_title, "artist_name": art},
                          headers=headers, timeout=8)
            if r is not None and r.status_code == 200:
                try:
                    _consider(r.json())
                except Exception:
                    pass
        best = _best_synced()
        if best:
            return best

        if plain_fallback["value"]:
            return plain_fallback["value"]

        # Strategy 3 — JioSaavn plain lyrics. Strong coverage for Indian/
        # Bollywood/regional tracks. Direct request so lrclib's deadline can't
        # starve it.
        try:
            js_base = "https://www.jiosaavn.com/api.php"
            js_headers = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
                "Referer": "https://www.jiosaavn.com/",
                "Accept": "application/json",
            }

            def _js_get(params):
                qs = urllib.parse.urlencode(
                    {**params, "_format": "json", "_marker": "0", "ctx": "web6dot0"}
                )
                r = _stream_session.get(f"{js_base}?{qs}", headers=js_headers, timeout=8)
                return r.json() if r.status_code == 200 else {}

            ac_data = _js_get({"__call": "autocomplete.get",
                               "query": f"{clean_title} {clean_artist}".strip()})
            song_id = None
            for hit in (ac_data.get("songs", {}) or {}).get("data", [])[:5]:
                if _sim(_norm(clean_title), _norm(hit.get("title", ""))) < 55:
                    continue
                # Verify the ARTIST too — title-only matching served a different
                # song's lyrics. With no corroboration we'd rather show nothing.
                if clean_artist:
                    mi = hit.get("more_info") or {}
                    hit_artist = mi.get("primary_artists") or mi.get("singers") or ""
                    if _artist_score(hit_artist) < 55:
                        continue
                song_id = hit.get("id")
                break

            if song_id:
                lyr_data = _js_get({"__call": "lyrics.getLyrics", "lyrics_id": song_id})
                raw_lyrics = lyr_data.get("lyrics", "")
                if raw_lyrics and len(raw_lyrics) > 20:
                    plain = (raw_lyrics.replace("<br>", "\n")
                                       .replace("<br/>", "\n")
                                       .replace("<br />", "\n"))
                    plain = re.sub(r"<[^>]+>", "", plain).strip()
                    if plain:
                        return {"plain": plain, "synced": [], "source": "jiosaavn"}
        except Exception:
            pass  # best-effort; never block on failure

        return {"plain": "", "synced": [], "source": None}

    try:
        # Both attempts together stay inside the app's 30s request timeout.
        result = None
        split = _youtube_split(title, artist)
        if split:
            result = _fetch(split[0], split[1], 9)
        if not (result and result.get("source")):
            result = _fetch(title, artist, 18 if split else 20)
        # Cache only real hits, so a transient miss can retry later.
        if result and result.get("source"):
            with _lyrics_cache_lock:
                if len(_lyrics_cache) >= _LYRICS_CACHE_MAX:
                    _lyrics_cache.pop(next(iter(_lyrics_cache)))
                _lyrics_cache[cache_key] = result
        return jsonify(result)
    except Exception as e:
        return jsonify({"plain": "", "synced": [], "source": None, "error": str(e)})


# ─── Discovery / profiles ─────────────────────────────────────────────────────
@app.get("/api/artwork")
def get_artwork():
    # A JioSaavn song's own cover, by its song link (the app's cover repair).
    song_url = _arg("song_url")
    if song_url:
        try:
            return jsonify({"artwork_url": _source_client("jiosaavn").get_song_image(song_url) or ""})
        except Exception as e:
            return jsonify({"artwork_url": "", "error": str(e)})
    try:
        results = _source_client("itunes").search(
            f"{_arg('title')} {_arg('artist')}".strip(), limit=1)
        if results:
            art = getattr(results[0], "artwork_urls", {}) or {}
            return jsonify({"artwork_url": art.get("600") or art.get("300") or ""})
        return jsonify({"artwork_url": ""})
    except Exception as e:
        return jsonify({"artwork_url": "", "error": str(e)})


@app.get("/api/radio")
def radio():
    try:
        from components.radio import resolve_radio
        limit = min(max(_int_arg("limit", 12), 1), 20)
        return jsonify({"tracks": resolve_radio(_arg("title"), _arg("artist"), limit)})
    except Exception as e:
        return jsonify({"tracks": [], "error": str(e)})


@app.get("/api/artist")
def artist_profile():
    name = _arg("name")
    try:
        from components.profile import get_artist
        return jsonify(get_artist(name))
    except Exception as e:
        return jsonify({"name": name, "top_songs": [], "albums": [], "error": str(e)})


@app.get("/api/artists/releases")
def followed_releases():
    """Home's "From artists you love". `names` is "A|B|C"."""
    try:
        from components.profile import get_followed_releases
        return jsonify(get_followed_releases(_arg("names").split("|"), time.localtime().tm_year))
    except Exception as e:
        return jsonify({"releases": [], "error": str(e)})


@app.get("/api/search/artists")
def search_artists_ep():
    try:
        from components.profile import search_artists
        return jsonify({"artists": search_artists(_arg("q"), _int_arg("limit", 10))})
    except Exception as e:
        return jsonify({"artists": [], "error": str(e)})


@app.get("/api/album")
def album_profile():
    name, artist = _arg("name"), _arg("artist")
    try:
        from components.profile import get_album
        return jsonify(get_album(name, artist, _arg("song_url"), _arg("album_id")))
    except Exception as e:
        return jsonify({"name": name, "artist": artist, "tracks": [], "error": str(e)})


@app.get("/api/search/albums")
def search_albums_ep():
    try:
        from components.profile import search_albums
        return jsonify({"albums": search_albums(_arg("q"), _int_arg("limit", 10))})
    except Exception as e:
        return jsonify({"albums": [], "error": str(e)})


@app.get("/api/home")
def home_feed():
    try:
        from components.home import get_home
        return jsonify(get_home(_arg("language", "hindi,english")))
    except Exception as e:
        return jsonify({"rows": [], "error": str(e)})


@app.get("/api/playlist")
def playlist_detail():
    try:
        from components.home import get_playlist
        return jsonify(get_playlist(_arg("url")))
    except Exception as e:
        return jsonify({"name": "", "tracks": [], "error": str(e)})


@app.get("/api/genres")
def genre_tiles():
    try:
        from components.home import get_genres
        return jsonify(get_genres(_arg("language", "hindi,english")))
    except Exception as e:
        return jsonify({"tiles": [], "error": str(e)})


@app.post("/api/enrich")
def enrich_batch():
    """Batch iTunes enrichment. Called AFTER search results render, so search
    stays instant while clean metadata fills in a moment later."""
    tracks = (_body().get("tracks") or [])
    if _enricher is None or not tracks:
        return jsonify({"results": [None] * len(tracks)})

    def lookup_one(item):
        try:
            meta = _enricher._lookup(
                item.get("title") or "",
                item.get("artist") or "",
                item.get("isrc"),
                item.get("duration_ms"),
            )
        except Exception:
            meta = None
        if not meta:
            return None
        return {
            "artist": _clean_text(meta.get("artist")) or None,
            "album": _clean_text(meta.get("album")) or None,
            "isrc": meta.get("isrc"),
            "release_date": meta.get("release_date"),
            "genre": meta.get("genre"),
            "duration_ms": meta.get("duration_ms"),
            "artwork": meta.get("artwork") or {},
        }

    try:
        # executor.map preserves input order, which the frontend relies on to
        # align results with the tracks it sent.
        with ThreadPoolExecutor(max_workers=6) as executor:
            results = list(executor.map(lookup_one, tracks))
        return jsonify({"results": results})
    except Exception as e:
        return jsonify({"results": [None] * len(tracks), "error": str(e)})


# ─── Spotify playlist import ──────────────────────────────────────────────────
# Spotify itself is NOT a playable source — we never stream from it. We only read
# a public playlist's TRACK LIST (title + artist), then find each song on
# JioSaavn/SoundCloud so it becomes playable here.
#
# Spotify fetch (URL parsing + embed scrape) lives in components/spotify_import.py.
from components.spotify_import import (
    parse_url as parse_spotify_url,
    fetch_tracklist as _spotify_tracklist,
    is_good_match as _title_artist_ok,   # title + artist + duration gate
    match_rank as _match_rank,
    clean_title as _clean_import_title,
    credited as _credited,
)
# YouTube / YouTube Music playlists go through the same job: NewPipe reads the
# list, each song is matched on JioSaavn/SoundCloud first, and a song with no
# match keeps its YouTube original (see _youtube_original).
from components.youtube_playlist import (
    parse_url as parse_youtube_list,
    clean_item as _clean_youtube_item,
    PRIVATE_LISTS as _PRIVATE_YT_LISTS,
)

# Songs read from one playlist, whichever service it came from: each costs a
# real search.
_IMPORT_MAX = 100


def _youtube_tracklist(url: str) -> Optional[Dict[str, Any]]:
    """{name, image, tracks:[{title, artist, duration_ms, url, artwork}]} with
    each title cleaned into song + artist, or {error}."""
    import newpipe_yt

    if not url.lower().startswith("http"):
        url = "https://" + url  # the extractor rejects a link without a scheme
    meta = newpipe_yt.playlist(url, _IMPORT_MAX)
    if not meta or meta.get("error"):
        return meta
    tracks = []
    for t in meta.get("tracks") or []:
        song, artist = _clean_youtube_item(t.get("title", ""), t.get("artist", ""))
        if song and t.get("url"):
            tracks.append({**t, "title": song, "artist": artist})
    return {"name": meta.get("name") or "YouTube playlist",
            "image": meta.get("image") or "", "tracks": tracks}


def _youtube_original(item: Dict[str, Any]) -> Dict[str, Any]:
    """The YouTube video itself as a playable track, for a song with no match
    elsewhere. It streams through NewPipe whether or not YouTube search is
    switched on (that switch only decides what search asks)."""
    return {
        "title": item["title"],
        "artist": item["artist"],
        "album": None,
        "duration_ms": item.get("duration_ms") or None,
        "isrc": None,
        "sources": {"youtube": {"source": "youtube", "url": item["url"]}},
        "primary_source": "youtube",
        "playable_source": "youtube",
        "artwork_url": item.get("artwork") or None,
        "artwork_urls": {"source:youtube": item["artwork"]} if item.get("artwork") else {},
        "is_playable": True,
    }


def _youtube_match(item: Dict[str, Any], title: str, names: List[str]):
    """The song on YouTube: (hit, playable track) or None. A label's channel
    ("T-Series") is not the singer, so the weak-artist rule applies: a
    near-exact title and the original's length within five seconds, or a
    credited artist as the channel. Searched through NewPipe whatever the
    YouTube switch says, as a YouTube playlist's originals are."""
    from types import SimpleNamespace
    try:
        import newpipe_yt
        hits = newpipe_yt.search(f"{title} {names[0] if names else ''}".strip(), 6)
    except Exception:
        return None
    good = []
    for h in hits or []:
        if not h.get("url"):
            continue
        t = SimpleNamespace(title=h.get("title") or "", artist=h.get("artist") or "",
                            duration_ms=h.get("duration_ms") or 0, sources={})
        if _title_artist_ok(item, t, True):
            good.append((t, h))
    if not good:
        return None
    t, h = max(good, key=lambda g: _match_rank(item, g[0]))
    return t, _youtube_original({**item, "url": h["url"], "artwork": h.get("artwork"),
                                 "duration_ms": item.get("duration_ms") or h.get("duration_ms")})


def _settled(item: Dict[str, Any], track) -> bool:
    """A hit good enough to stop searching: the title near-exact and, when
    both are known, the length within five seconds of the original's."""
    exact, close = _match_rank(item, track)[:2]
    want = int(item.get("duration_ms") or 0)
    return bool(exact) and (not want or close >= -5_000)


def _match_track(item: Dict[str, Any], weak_artist: bool = False) -> Optional[Dict[str, Any]]:
    """Find a PLAYABLE version of one imported song on our own sources.

    `weak_artist`: the item's artist is a YouTube channel name, which may be
    a label rather than the singer (see is_good_match)."""
    if _search_service is None:
        return None
    # The song's own name with its main artists first: the full credit of a
    # film song (six names) and its '(From "Film")' buried the right hit. The
    # title as written is the last try.
    title = _clean_import_title(item["title"])
    names = _credited(item["artist"])
    queries = []
    for q in (f"{title} {names[0]}" if names else title,
              f"{title} {names[1]}" if len(names) > 1 else "",
              f"{item['title']} {item['artist']}"):
        q = q.strip()
        if q and q not in queries:
            queries.append(q)
    try:
        cfg = replace(
            _search_service.config,
            max_total_results=5,           # look past a wrong #1 to a right #2
            max_results_per_source=5,
            enabled_sources=PLAYABLE_SEARCH_SOURCES,
            timeout_seconds=10.0,
        )
        best = None
        for query in queries:
            # The BEST hit that passes, not the first: an exact title and the
            # original's length beat a copy that happened to rank higher.
            good = [t for t in _search_service.search(query, cfg)
                    if _playable_source_name(t) and _title_artist_ok(item, t, weak_artist)]
            if best is not None:
                good.append(best)
            if good:
                best = max(good, key=lambda t: _match_rank(item, t))
                # Settled only by a near-exact title within a few seconds of
                # the original; anything less ("O Saathiya" for "O Saathi", a
                # DJ upload 30 s short) lets the next search try for better.
                if _settled(item, best):
                    break
        # Not on JioSaavn or SoundCloud as itself (T-Series' catalogue is the
        # big one: only fan uploads there): the original on YouTube, when it
        # is closer than anything found. Not for a YouTube playlist, whose
        # songs already keep their own video (see _find).
        if not weak_artist and (best is None or not _settled(item, best)):
            yt = _youtube_match(item, title, names)
            if yt is not None and (best is None or _match_rank(item, yt[0]) > _match_rank(item, best)):
                return yt[1]
        if best is not None:
            track = best
            source = _playable_source_name(track)
            return {
                "title": _clean_text(track.title) or item["title"],
                "artist": _clean_text(track.artist) or item["artist"],
                "album": _clean_text(track.album),
                "duration_ms": track.duration_ms,
                "isrc": track.isrc,
                "sources": {k.value: _source_to_dict(v) for k, v in track.sources.items()},
                "primary_source": source,
                "playable_source": source,
                "artwork_url": track.get_best_artwork() if hasattr(track, "get_best_artwork") else None,
                "artwork_urls": _clean_artwork_urls(getattr(track, "artwork_urls", {})),
                "is_playable": True,
            }
    except Exception:
        pass
    return None


# ─── Spotify import as a background job ───────────────────────────────────────
# Matching a long playlist takes a while (a real search per track). Running it in
# a thread keyed by URL means the work CONTINUES even if the user leaves the
# import screen — the WebView can unmount and come back and pick up exact
# progress, because the job lives here in the server process, not in the page.
#
# The client polls /api/spotify/import for a snapshot; the first call starts the
# job. Desktop passes wait=1 to block for the finished result (its old one-shot
# behaviour, unchanged).
_import_jobs: Dict[str, Dict[str, Any]] = {}
_import_lock = threading.Lock()
_IMPORT_JOBS_MAX = 8


def _import_snapshot(job: Dict[str, Any]) -> Dict[str, Any]:
    with _import_lock:
        return {
            "name": job["name"], "image": job["image"],
            "total": job["total"], "done": job["done"], "matched": job["matched"],
            "tracks": job["tracks"], "missing": job["missing"],
            "finished": job["finished"], "error": job["error"],
            "cancelled": job.get("cancelled", False),
            # Where the list came from ("spotify" / "youtube"), and how many
            # songs are YouTube originals because nothing else matched.
            "source": job.get("source", ""),
            "kept": job.get("kept", 0),
            # Each song as it is checked, in the order the checks finish, so
            # the import screen can fill in live instead of all at the end.
            "checked": list(job.get("checked", [])),
            # Every song of the original list, for Sync to tell new from old.
            "keys": list(job.get("keys", [])),
        }


def _source_key(item: Dict[str, Any]) -> str:
    """One song of the ORIGINAL list (Spotify / YouTube), as Sync remembers it."""
    return f"{_clean_text(item.get('title')) or ''}|{_clean_text(item.get('artist')) or ''}".lower()


def _find(item: Dict[str, Any], youtube: bool) -> Optional[Dict[str, Any]]:
    """One imported song -> a playable track. A YouTube song with no match on
    our own sources keeps its YouTube original rather than being dropped."""
    found = _match_track(item, weak_artist=youtube)
    if found or not youtube:
        return found
    kept = _youtube_original(item)
    kept["kept_from_youtube"] = True
    return kept


def _run_import(kind: str, ref: str, job: Dict[str, Any]) -> None:
    """`kind` is "youtube" (ref = the link) or a Spotify kind (ref = its id)."""
    youtube = kind == "youtube"
    try:
        meta = _youtube_tracklist(ref) if youtube else _spotify_tracklist(kind, ref)
    except Exception as e:
        with _import_lock:
            job["error"] = f"Could not read that playlist: {e}"
            job["finished"] = True
        return
    if not meta or meta.get("error"):
        with _import_lock:
            job["error"] = "Could not read that playlist — is it public?"
            job["finished"] = True
        return

    items = meta["tracks"][:_IMPORT_MAX]   # cap the work: a real search per track
    with _import_lock:
        job["name"] = meta["name"]
        job["image"] = meta.get("image", "")
        job["total"] = len(items)
        job["source"] = kind if youtube else "spotify"
        job["keys"] = [_source_key(it) for it in items]

    matched: List[Optional[Dict[str, Any]]] = [None] * len(items)
    with ThreadPoolExecutor(max_workers=6) as ex:
        fut_to_i = {ex.submit(_find, it, youtube): i for i, it in enumerate(items)}
        for fut in as_completed(fut_to_i):
            if job.get("cancelled"):
                # Songs not started yet are dropped; the six in flight finish
                # on their own and are ignored.
                for f in fut_to_i:
                    f.cancel()
                break
            i = fut_to_i[fut]
            try:
                matched[i] = fut.result()
            except Exception:
                matched[i] = None
            with _import_lock:
                if job["finished"]:
                    break  # cancelled while this one was being checked
                job["done"] += 1
                job["matched"] += 1 if matched[i] else 0
                # Counted, then dropped: the marker is not part of a track.
                if matched[i] and matched[i].pop("kept_from_youtube", False):
                    job["kept"] = job.get("kept", 0) + 1
                if matched[i]:
                    job.setdefault("found_at", {})[i] = matched[i]
                job.setdefault("checked", []).append({
                    "title": items[i]["title"],
                    "artist": items[i]["artist"],
                    "found": bool(matched[i]),
                    "artwork_url": (matched[i] or {}).get("artwork_url"),
                })

    with _import_lock:
        if job.get("finished"):
            return  # cancelled: the cancel call already settled the snapshot
        job["tracks"] = [t for t in matched if t]          # original order preserved
        job["missing"] = [f"{items[i]['title']} — {items[i]['artist']}"
                          for i, t in enumerate(matched) if not t]
        job["matched"] = len(job["tracks"])
        job["finished"] = True


def _import_ref(url: str):
    """(kind, ref) for a playlist link, as the import reads it, or an error."""
    kind, ref = parse_spotify_url(url)
    if kind:
        return kind, ref, None
    yt_list = parse_youtube_list(url)
    if not yt_list:
        return None, None, "Not a playlist link"
    if yt_list in _PRIVATE_YT_LISTS:
        return None, None, "Private playlist: your own likes and Watch later need a Google login"
    return "youtube", url, None


def _already_have(item: Dict[str, Any], have: List[Dict[str, str]]) -> bool:
    """A playlist imported before Sync existed remembers no original list:
    an original song counts as already there when a song in the playlist has
    its title and shares an artist (titles differ between services a little)."""
    t = (item.get("title") or "").lower()
    a = (item.get("artist") or "").lower()
    for h in have:
        if fuzz.token_set_ratio(t, (h.get("title") or "").lower()) >= 88 and (
                not a or fuzz.token_set_ratio(a, (h.get("artist") or "").lower()) >= 60):
            return True
    return False


@app.post("/api/import/sync")
def import_sync():
    """Sync an imported playlist with its original. Body: {url, keys, have}.

    `keys` are the original's songs as last seen (empty for a playlist
    imported before Sync); `have` is the playlist's songs now. Reads the
    original again, matches ONLY the songs that are new on it, and returns
    them with the original's current keys. Nothing is ever removed: a song you
    took out stays out, because its key is still known."""
    body = _body()
    url = str(body.get("url") or "").strip()
    known = set(body.get("keys") or [])
    have = [h for h in (body.get("have") or []) if isinstance(h, dict)]
    kind, ref, err = _import_ref(url)
    if err:
        return jsonify({"error": err}), 400
    youtube = kind == "youtube"
    try:
        meta = _youtube_tracklist(ref) if youtube else _spotify_tracklist(kind, ref)
    except Exception as e:
        return jsonify({"error": f"Could not read that playlist: {e}"})
    if not meta or meta.get("error"):
        return jsonify({"error": "Could not read that playlist — is it public?"})
    items = meta["tracks"][:_IMPORT_MAX]
    keys = [_source_key(it) for it in items]
    new = [it for it, k in zip(items, keys)
           if k not in known and not (not known and _already_have(it, have))]
    found: List[Optional[Dict[str, Any]]] = [None] * len(new)
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(_find, it, youtube): i for i, it in enumerate(new)}
        for fut in as_completed(futs):
            try:
                found[futs[fut]] = fut.result()
            except Exception:
                found[futs[fut]] = None
    tracks = []
    for t in found:
        if t:
            t.pop("kept_from_youtube", None)
            tracks.append(t)
    return jsonify({"name": meta.get("name", ""), "keys": keys, "tracks": tracks,
                    "new": len(new), "missing": len(new) - len(tracks)})


@app.get("/api/spotify/import")
def spotify_import():
    """Resolve a public Spotify playlist/album URL into playable tracks.

    Runs as a background job so progress survives the user leaving the screen.
    Returns a snapshot; the first call starts the job. `wait=1` blocks for the
    finished result (desktop's original one-shot behaviour).
    """
    url = _arg("url")
    kind, ref = parse_spotify_url(url)
    if not kind:
        # Not Spotify: a YouTube / YouTube Music playlist runs the same job.
        yt_list = parse_youtube_list(url)
        if not yt_list:
            return jsonify({"error": "Not a playlist link"}), 400
        if yt_list in _PRIVATE_YT_LISTS:
            return jsonify({"error": "Private playlist: your own likes and Watch later need a Google login"}), 400
        kind, ref = "youtube", url

    if _arg("cancel"):
        # Stop where it is and keep what was found, so the app can offer to
        # save those songs or throw them away.
        with _import_lock:
            job = _import_jobs.get(url)
            if job and not job["finished"]:
                job["cancelled"] = True
                found = job.get("found_at", {})
                job["tracks"] = [found[i] for i in sorted(found)]  # playlist order
                job["matched"] = len(job["tracks"])
                job["finished"] = True
        return jsonify(_import_snapshot(job) if job else {"error": "No import running"})

    with _import_lock:
        job = _import_jobs.get(url)
        # Start a fresh job if none exists, or if the last one failed, found
        # nothing or was cancelled: asking again means trying again.
        if job is None or (job["finished"] and (
                job["error"] or job["matched"] <= 0 or job.get("cancelled"))):
            job = {"name": "", "image": "", "total": 0, "done": 0, "matched": 0,
                   "tracks": [], "missing": [], "finished": False, "error": None,
                   "checked": []}
            _import_jobs[url] = job
            # Evict oldest finished jobs so the dict can't grow without bound.
            if len(_import_jobs) > _IMPORT_JOBS_MAX:
                for k in [k for k, v in list(_import_jobs.items())
                          if v["finished"] and k != url][: len(_import_jobs) - _IMPORT_JOBS_MAX]:
                    _import_jobs.pop(k, None)
            threading.Thread(target=_run_import, args=(kind, ref, job), daemon=True).start()

    if _arg("wait"):
        deadline = time.monotonic() + 120
        while not _import_snapshot(job)["finished"] and time.monotonic() < deadline:
            time.sleep(0.2)

    return jsonify(_import_snapshot(job))


@app.get("/api/sources/status")
def sources_status():
    sources = {
        "jiosaavn": {"status": "ready", "type": "audio", "quality": "320kbps AAC"},
        "soundcloud": {"status": "ready", "type": "audio", "quality": "128kbps MP3"},
        "itunes": {"status": "ready", "type": "metadata", "quality": "artwork/tags"},
        "musicbrainz": {"status": "ready", "type": "metadata", "quality": "ISRC/lookup"},
    }

    # YouTube is real on THIS build: NewPipeExtractor bundles Rhino and solves
    # the signature challenge on-device, so the old "needs Deno" copy was a
    # leftover from the desktop build and simply untrue here. Report what the
    # extractor actually says, and whether the user has switched it on.
    try:
        import newpipe_yt
        yt_ok = newpipe_yt.is_supported()
    except Exception:
        yt_ok = False

    sources["youtube"] = {
        "status": "ready" if (yt_ok and _youtube_enabled) else
                  "off" if yt_ok else "unavailable",
        "type": "audio",
        "quality": "up to 160kbps Opus" if yt_ok else "n/a",
        "error": None if yt_ok else "Not supported on this device.",
    }
    return jsonify({"sources": sources})


# ─── YouTube endpoints: permanent stubs ───────────────────────────────────────
# SettingsView still calls these. They must answer (never 404) or the settings
# screen shows a spinner forever — but they always report "not connected".
@app.get("/api/youtube/status")
def youtube_status():
    return jsonify({"connected": False, "method": None, "browser": None,
                    "browsers": [], "supported": False,
                    "reason": "YouTube is not supported on mobile."})


@app.post("/api/youtube/connect")
@app.post("/api/youtube/connect_file")
def youtube_connect():
    return jsonify({"connected": False,
                    "error": "YouTube is not supported on the mobile build."})


@app.post("/api/youtube/disconnect")
def youtube_disconnect():
    return jsonify({"connected": False})


# ─── YouTube via NewPipeExtractor ─────────────────────────────────────────────
@app.get("/api/youtube/experimental")
def youtube_experimental_status():
    """Report whether YouTube extraction is available on this device, and whether
    it is currently enabled. Cheap — no extraction — so Settings shows it live."""
    try:
        import newpipe_yt
        supported = newpipe_yt.is_supported()
    except Exception:
        supported = False
    return jsonify({
        "supported": supported,
        "enabled": _youtube_enabled,
        "saved": bool(android_env.read_settings().get("youtube_experimental")),
    })


@app.post("/api/youtube/experimental")
def youtube_experimental_toggle():
    """Turn experimental YouTube on/off.

    Turning ON runs a real on-device self-test (extract a known video). Only if
    that SUCCEEDS do we flip the source on — so the UI can honestly say whether
    it works on THIS phone rather than promising something that silently fails.
    """
    want = bool(_body().get("enabled"))

    settings = android_env.read_settings()

    if not want:
        _set_youtube(False)
        settings["youtube_experimental"] = False
        android_env.write_settings(settings)
        return jsonify({"enabled": False, "ok": True})

    try:
        import newpipe_yt
        if not newpipe_yt.is_supported():
            return jsonify({"enabled": False, "ok": False,
                            "error": "The YouTube extractor could not start on "
                                     "this device."}), 200
        # Resolves a REAL audio URL — the step that needs the signature and
        # throttling deobfuscation. Searching alone would prove nothing.
        passed = newpipe_yt.self_test()
    except Exception as e:
        return jsonify({"enabled": False, "ok": False, "error": str(e)}), 200

    if not passed:
        return jsonify({"enabled": False, "ok": False,
                        "error": "Couldn't get a playable YouTube stream on this "
                                 "device. Leaving YouTube off."}), 200

    _set_youtube(True)
    settings["youtube_experimental"] = True
    android_env.write_settings(settings)
    return jsonify({"enabled": True, "ok": True})


@app.get("/api/youtube/cookies")
def youtube_cookies_status():
    return jsonify({"present": os.path.exists(_yt_cookies_path())})


@app.post("/api/youtube/cookies")
def youtube_cookies_set():
    """Import (or remove, with empty content) the user's YouTube cookies.txt.

    Cookies are the auth fallback for "sign in to confirm you're not a bot" —
    exported from a logged-in browser on a PC. Stored app-private; never leaves
    the device (yt-dlp sends them to YouTube only).
    """
    content = (_body().get("content") or "").strip()
    path = _yt_cookies_path()
    if not content:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        _drop_yt_client()
        return jsonify({"present": False, "ok": True})
    if "youtube.com" not in content:
        return jsonify({"ok": False, "present": os.path.exists(path),
                        "error": "That file has no YouTube cookies — export "
                                 "cookies.txt from a browser signed in to YouTube."})
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    _drop_yt_client()   # rebuilt with cookies on next use
    return jsonify({"present": True, "ok": True})


# ─── Cache ────────────────────────────────────────────────────────────────────
# Subdirectories of the cache dir that are app MACHINERY, not the user's cache.
# `chaquopy` holds the Python runtime's extracted assets — deleting it under a
# live interpreter is asking for a broken backend, and it only forces a slow
# re-extract on the next launch. Excluded from the clear AND from the size, so
# the number on the button is exactly what pressing it frees.
_CACHE_KEEP = {"chaquopy"}


def _cache_walk():
    """(dirpath, filenames) for the parts of the cache dir we own."""
    root = android_env.cache_dir()
    if not root or not os.path.isdir(root):
        return
    downloads = os.path.realpath(android_env.downloads_dir() or "")
    for dirpath, dirnames, filenames in os.walk(root):
        if dirpath == root:
            # Prune in place so os.walk never descends into them.
            dirnames[:] = [d for d in dirnames if d not in _CACHE_KEEP]
        # Belt and braces: if the cache dir ever overlapped the downloads dir,
        # skip it rather than touch music.
        if downloads and os.path.realpath(dirpath).startswith(downloads):
            dirnames[:] = []
            continue
        yield dirpath, filenames


def _cache_bytes() -> int:
    """Size of the clearable cache. Walks it rather than trusting a running
    total, because Android can evict from this directory on its own."""
    total = 0
    for dirpath, filenames in _cache_walk():
        for name in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                pass
    return total


@app.get("/api/cache")
def cache_info():
    return jsonify({"bytes": _cache_bytes()})


@app.get("/api/storage")
def storage_info():
    """What Relaxify takes up on the phone, and what the phone has left.

    Downloads are the audio files in the download folder (the same files the
    Downloaded collection lists); the cache is exactly what Clear cache frees;
    total and free are the whole phone's, read from the download folder's
    volume, so the Settings bar can show Relaxify against everything else.
    """
    import shutil

    folder = get_default_download_dir()
    songs = 0
    song_bytes = 0
    if folder and os.path.isdir(folder):
        for dirpath, _dirs, filenames in os.walk(folder):
            for name in filenames:
                if os.path.splitext(name)[1].lower() in _LOCAL_AUDIO_EXTS:
                    try:
                        song_bytes += os.path.getsize(os.path.join(dirpath, name))
                        songs += 1
                    except OSError:
                        pass
    total = free = 0
    for probe in (folder, android_env.cache_dir()):
        if probe and os.path.isdir(probe):
            try:
                usage = shutil.disk_usage(probe)
                total, free = usage.total, usage.free
                break
            except OSError:
                pass
    return jsonify({
        "downloads_bytes": song_bytes,
        "downloads_count": songs,
        "cache_bytes": _cache_bytes(),
        "total_bytes": total,
        "free_bytes": free,
    })


@app.post("/api/cache/clear")
def cache_clear():
    """Drop everything re-fetchable: resolved stream URLs, lyrics, home rows,
    and the scratch files on disk.

    Explicitly NOT touched: the downloads directory, playlists, or likes. Those
    are the user's own data and live elsewhere — a cache clear that eats a
    downloaded song is a bug report, not a feature.
    """
    before = _cache_bytes()

    with _stream_cache_lock:
        _STREAM_CACHE.clear()
    with _ladder_lock:
        _LADDER_PIN.clear()
    with _lyrics_cache_lock:
        _lyrics_cache.clear()
    try:
        from components import home as home_mod
        with home_mod._cache_lock:
            home_mod._cache.clear()
    except Exception:
        pass

    for dirpath, filenames in _cache_walk():
        for name in filenames:
            try:
                os.remove(os.path.join(dirpath, name))
            except OSError:
                # In use, or Android holds it open. Nothing to do about it, and
                # the reported figure is measured after the fact so it stays
                # honest either way.
                pass

    return jsonify({"freed": max(0, before - _cache_bytes())})


# ─── SPA ──────────────────────────────────────────────────────────────────────
# Serving the React bundle from the SAME origin as the API is what lets
# frontend/src/utils/config.js keep its relative base: fetch('/api/...') and
# <audio src="/api/proxy_stream?..."> both resolve here with no CORS and with
# working Range requests.
@app.get("/")
def spa_index():
    return send_from_directory(android_env.web_dir(), "index.html")


@app.get("/<path:filename>")
def spa_assets(filename):
    root = android_env.web_dir()
    if os.path.isfile(os.path.join(root, filename)):
        return send_from_directory(root, filename)
    # Unknown non-API path → let the client-side router handle it.
    return send_from_directory(root, "index.html")


# ──────────────────────────────────────────────────────────────────────────────
# Lifecycle — called from Kotlin
# ──────────────────────────────────────────────────────────────────────────────
def _restore_youtube() -> None:
    """Re-apply the saved YouTube toggle. Cheap: is_supported() only checks that
    the extractor class loads — no network, no extraction — so this runs BEFORE
    the server starts serving rather than on the warm-up thread.

    It used to sit at the END of _warm_up(), behind an lrclib request (10s
    timeout) and a full test search (15s). For up to ~25s after every backend
    start, GET /api/youtube/experimental honestly reported enabled=False — so
    opening Settings inside that window showed the switch OFF, and the user
    turned "back on" something that was never off in their settings file. That
    window is the whole bug: it explains why it looked random (it depended only
    on how fast Settings was opened) and why it recurred without them changing
    anything.
    """
    try:
        if not android_env.read_settings().get("youtube_experimental"):
            return
        import newpipe_yt
        if newpipe_yt.is_supported():
            _set_youtube(True)
            print("[backend] YouTube restored")
    except Exception as e:
        print(f"[backend] YouTube restore skipped: {e}")


def _warm_up():
    """Pay the cold-start IMPORT costs in the background, so the user's first
    search doesn't also pay for loading the source clients. Best-effort; never
    blocks startup.

    This used to run a real cross-source search for "hello" — a 15s-budget
    network call to JioSaavn AND SoundCloud on every single backend start. It
    warmed the clients, but it did so by competing with the user's own first
    search for the same connections and spending their data on a result nobody
    would ever see. Constructing the clients gets the expensive part (the lazy
    module imports) for free; the connection warms itself on the first real
    query a moment later.
    """
    for source in PLAYABLE_SEARCH_SOURCES:
        try:
            _search_service._get_client(source)
        except Exception:
            pass


def start_server(files_dir: str, downloads_dir: str, web_dir: str,
                 cache_dir: str, port: int = 8765, public_dir: str = "",
                 api_token: str = "") -> int:
    """Entry point invoked from BackendService.kt.

    Blocks forever serving requests, so Kotlin must call it on a background
    thread. Returns only if the server is shut down.
    """
    global _search_service, _download_manager, _enricher, _server

    global _API_TOKEN
    _API_TOKEN = api_token or ""

    # A RESTART (BackendModule.restart, after the previous run died) must not
    # leave the old run's services behind: its download manager's worker
    # threads are still alive, and a second one next to it would run every
    # queued download twice. The old server is not shut down here — shutdown()
    # blocks until serve_forever returns, and on this path it already has.
    _server = None
    if _download_manager:
        try:
            _download_manager.stop(wait=False)
        except Exception:
            pass
    if _search_service:
        try:
            _search_service.shutdown()
        except Exception:
            pass

    android_env.configure(files_dir, downloads_dir, web_dir, cache_dir, public_dir)
    android_env.install_stdio_logging()
    try:
        print(f"[backend] legacy downloads: {android_env.migrate_legacy_downloads()}")
    except Exception as e:
        print(f"[backend] legacy downloads: {e}")

    print(f"[backend] starting on 127.0.0.1:{port}")
    print(f"[backend] downloads -> {android_env.downloads_dir()}")
    print(f"[backend] web root  -> {android_env.web_dir()}")

    _search_service = UnifiedSearchService()
    # 2 concurrent downloads, not the desktop's 3: phones have less bandwidth
    # headroom and Android is quicker to throttle a chatty background process.
    _download_manager = DownloadManager(
        config=DownloadQueueConfig(max_concurrent=2),
        download_dir=get_default_download_dir(),
    )
    _download_manager.start()
    _enricher = MetadataEnricher()
    _download_manager.set_finalizer(_finalize_track_info)

    # Before the first request can be served, so the toggle never reads as OFF
    # while the saved setting says ON.
    _restore_youtube()

    threading.Thread(target=_warm_up, daemon=True).start()

    # Werkzeug's production-grade WSGI server. Threaded so a long proxy_stream
    # (which holds its connection open for the whole song) can't block search,
    # lyrics, or the download queue.
    # No per-request access log. Werkzeug printed one line per request to
    # logcat, URL included, so the per-launch API token (_t=) sat in the
    # system log, and every proxied stream and poll cost a write.
    logging.getLogger("werkzeug").setLevel(logging.ERROR)
    _server = make_server("127.0.0.1", port, app, threaded=True)
    print(f"[backend] ready on 127.0.0.1:{port}")
    _server.serve_forever()
    return port


def stop_server() -> None:
    global _server
    if _server is not None:
        _server.shutdown()
        _server = None
    if _download_manager:
        _download_manager.stop()
    if _search_service:
        _search_service.shutdown()


if __name__ == "__main__":
    # Desktop smoke test:
    #   cd mobile/python && python mobile_server.py [--port 8765]
    # Serves the mobile UI + API on localhost using throwaway local folders, so
    # you can iterate on the whole app in a browser without an emulator.
    import argparse

    parser = argparse.ArgumentParser(description="Fix_Spotify mobile backend")
    parser.add_argument("--port", type=int, default=8765)
    args, _ = parser.parse_known_args()

    base = Path(__file__).resolve().parent / ".devroot"
    web = Path(__file__).resolve().parents[2] / "frontend" / "dist-mobile"
    start_server(
        files_dir=str(base / "files"),
        downloads_dir=str(base / "downloads"),
        web_dir=str(web),
        cache_dir=str(base / "cache"),
        port=args.port,
    )
