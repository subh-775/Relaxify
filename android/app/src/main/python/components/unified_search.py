"""
Unified Search Service
======================
Main entry point for searching across all audio sources.

Features:
- Parallel search across all configured sources
- Automatic result merging and deduplication
- Async/await support for fast parallel execution
- Configurable source selection
- Result ranking and filtering
- Caching support
"""

import re
import time
from typing import List, Dict, Any, Set
from dataclasses import dataclass, field
from concurrent.futures import (
    ThreadPoolExecutor,
    TimeoutError as FuturesTimeoutError,
    as_completed,
)
import threading

from components.source_merger import SourceMerger, SourceType
from components.fuzzy_matcher import FuzzyMatcher
# Client imports are done lazily in _get_client() to avoid eagerly loading heavy modules


def dropword_variants(query: str, min_words: int = 2, max_words: int = 6) -> List[str]:
    """Every way of dropping exactly one word from `query`, in order.

    A typo in an N-word query still leaves N-1 correct words, and searching
    those against a source's own (typo-intolerant) search API is what recovers
    a match a raw retry never would. Pure and network-free on purpose, so it is
    testable without a live search service.
    """
    words = query.split()
    if not (min_words <= len(words) <= max_words):
        return []
    out, seen = [], set()
    for i in range(len(words)):
        variant = " ".join(words[:i] + words[i + 1 :])
        if variant and variant not in seen:
            seen.add(variant)
            out.append(variant)
    return out


@dataclass
class SearchConfig:
    """Configuration for search behavior."""

    enabled_sources: Set[SourceType] = field(
        default_factory=lambda: {
            SourceType.JIOSAAVN,
            SourceType.YOUTUBE,
            SourceType.ITUNES,
        }
    )
    max_results_per_source: int = 10
    max_total_results: int = 50
    timeout_seconds: float = 30.0
    enable_fuzzy_matching: bool = True
    fuzzy_score_cutoff: float = 70.0
    enable_metadata_enrichment: bool = True
    parallel_search: bool = True
    max_parallel_workers: int = 6
    cache_ttl_seconds: int = 3600


@dataclass
class SearchContext:
    """Context for a search request."""

    query: str
    config: SearchConfig
    fuzzy_matcher = None
    results_cache: Dict[str, Any] = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)

    def elapsed(self) -> float:
        return time.time() - self.start_time

    def is_timed_out(self) -> bool:
        return self.elapsed() > self.config.timeout_seconds


# Ranking by popularity (see composite in _rank_by_relevance).
TOP_SONG_BONUS = 15.0
FEW_PLAYS = 5000
MANY_PLAYS = 1_000_000
FEW_PLAYS_PENALTY = 15.0
# The query is this artist's name: their songs first, whatever else scores.
# Above anything relevance() gives (at most 110), which still takes penalties.
ARTIST_QUERY = 200.0


class UnifiedSearchService:
    """
    Main service for unified audio search across all sources.

    Usage:
        service = UnifiedSearchService()
        results = service.search("believer imagine dragons")
    """

    # Cache configuration
    MAX_CACHE_SIZE = 100  # Maximum number of cached queries

    def __init__(self, config: SearchConfig = None):
        self.config = config or SearchConfig()
        self.fuzzy_matcher = FuzzyMatcher()
        self.source_merger = SourceMerger(fuzzy_matcher=self.fuzzy_matcher)

        # Initialize clients lazily
        self._clients: Dict[SourceType, Any] = {}
        self._clients_lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=6)

        # Cache for search results
        self._cache: Dict[str, Dict] = {}
        self._cache_lock = threading.RLock()

    def _get_client(self, source_type: SourceType):
        """Lazily initialize and return client for source type."""
        with self._clients_lock:
            if source_type not in self._clients:
                if source_type == SourceType.JIOSAAVN:
                    from components.jiosaavn_downloader import JioSaavnClient

                    self._clients[source_type] = JioSaavnClient()
                elif source_type == SourceType.SOUNDCLOUD:
                    from components.soundcloud_downloader import SoundCloudClient

                    self._clients[source_type] = SoundCloudClient()
                elif source_type == SourceType.ITUNES:
                    from components.itunes_client import iTunesClient

                    self._clients[source_type] = iTunesClient()
        return self._clients.get(source_type)

    def _cleanup_cache(self, ttl_seconds: int):
        """Remove expired cache entries and enforce max cache size."""
        if ttl_seconds <= 0:
            return

        with self._cache_lock:
            now = time.time()
            # Remove expired entries
            expired_keys = [
                key
                for key, value in self._cache.items()
                if now >= value.get("expires", 0)
            ]
            for key in expired_keys:
                del self._cache[key]

            # Enforce max size (remove oldest by expiration time)
            if len(self._cache) >= self.MAX_CACHE_SIZE:
                # Sort by expiration time and remove oldest
                sorted_items = sorted(
                    self._cache.items(), key=lambda x: x[1].get("expires", 0)
                )
                # Keep only the newest MAX_CACHE_SIZE entries
                items_to_remove = len(self._cache) - self.MAX_CACHE_SIZE + 1
                for key, _ in sorted_items[:items_to_remove]:
                    del self._cache[key]

    def _search_source(
        self, source_type: SourceType, context: SearchContext
    ) -> List[Dict]:
        """Search a single source."""
        if context.is_timed_out():
            return []

        if source_type not in self.config.enabled_sources:
            return []

        client = self._get_client(source_type)
        if not client:
            return []

        try:
            query = context.query
            limit = context.config.max_results_per_source

            if source_type == SourceType.JIOSAAVN:
                client = self._clients[SourceType.JIOSAAVN]
                results = client.search(query, limit)
                # JioSaavn autocomplete is space-sensitive: "cold play" matches a
                # literal title ("A COLD PLAY") and MISSES the band "Coldplay",
                # losing our best (320k) source. Also query the de-spaced form
                # and merge (de-duped by id, original order first).
                squished = query.replace(" ", "")
                if squished and squished != query:
                    seen = {s.id for s in results}
                    try:
                        for s in client.search(squished, limit):
                            if s.id not in seen:
                                seen.add(s.id)
                                results.append(s)
                    except Exception:
                        pass
                # Convert to normalized format - JioSaavnSong has to_dict method
                return [
                    {"source_type": "jiosaavn", **song.to_dict()} for song in results
                ]

            elif source_type == SourceType.SOUNDCLOUD:
                client = self._clients[SourceType.SOUNDCLOUD]
                results = client.search(query, limit)
                return [
                    {"source_type": "soundcloud", **track.to_dict()}
                    for track in results
                ]

            elif source_type == SourceType.YOUTUBE:
                client = self._clients[SourceType.YOUTUBE]
                results = client.search(query, limit)
                # YouTubeTrack has to_dict method
                return [{"source_type": "youtube", **r.to_dict()} for r in results]

            elif source_type == SourceType.ITUNES:
                client = self._clients[SourceType.ITUNES]
                results = client.search_tracks(query, limit)
                return [
                    {"source_type": "itunes", **track.to_dict()} for track in results
                ]


        except Exception as e:
            # Log error but don't fail the whole search. None, not []: a
            # source that failed did not say "no such song".
            print(f"Error searching {source_type}: {e}")
            return None

        return []

    def search(self, query: str, config: SearchConfig = None,
               answered: Set = None) -> List:
        """
        Main search method.

        Args:
            query: Search query string
            config: Optional search configuration

        Returns:
            List of UnifiedTrack objects
        """
        config = config or self.config
        context = SearchContext(query=query, config=config)

        # Check cache. Repeat searches (same query + sources) return instantly.
        # The old code only cached the "comprehensive" path, so every search the
        # app actually ran (it always used the one "fast" mode) re-hit the
        # network even for an identical query.
        cache_key = (
            f"{query}:{hash(frozenset(config.enabled_sources))}:{config.max_total_results}"
        )
        if config.cache_ttl_seconds > 0:
            with self._cache_lock:
                if cache_key in self._cache:
                    cached = self._cache[cache_key]
                    if time.time() < cached.get("expires", 0):
                        return cached["results"]

        # Periodic cache cleanup (remove expired entries, enforce size limit)
        self._cleanup_cache(config.cache_ttl_seconds)

        all_results: Dict[SourceType, List[Dict]] = {}
        responded: Set = set()

        if config.parallel_search:
            # Parallel search across all sources, on ONE wall-clock deadline.
            #
            # Three things were wrong here and they compounded:
            #
            #  1. A brand-new ThreadPoolExecutor was built per search, so every
            #     debounced keystroke spun up threads — while self._executor,
            #     created in __init__ for exactly this, was never used at all.
            #
            #  2. The `break` on timeout sat INSIDE `with executor`, whose
            #     __exit__ calls shutdown(wait=True). So breaking out still
            #     blocked until the slowest source finished. The timeout was
            #     decorative: it changed which results were collected, never how
            #     long the user waited.
            #
            #  3. future.result(timeout=config.timeout_seconds) gave EACH future
            #     the full budget, so the worst case was timeout x sources, not
            #     timeout total.
            #
            # Now: shared pool, one deadline for the whole search, and whatever
            # has arrived when it expires is what ships. A slow source costs its
            # own results, not the user's search.
            deadline = time.time() + config.timeout_seconds
            futures = {
                self._executor.submit(self._search_source, source_type, context):
                    source_type
                for source_type in config.enabled_sources
            }
            try:
                for future in as_completed(
                    futures, timeout=max(0.1, deadline - time.time())
                ):
                    source_type = futures[future]
                    try:
                        # Already complete — as_completed only yields finished
                        # futures, so this cannot block.
                        results = future.result(timeout=0)
                        if results is not None:
                            responded.add(source_type)
                        if results:
                            all_results[source_type] = results
                    except Exception as e:
                        print(f"Search failed for {source_type}: {e}")
            except FuturesTimeoutError:
                slow = [s.value if hasattr(s, "value") else str(s)
                        for f, s in futures.items() if not f.done()]
                print(f"Search deadline hit; still running: {slow}")
            finally:
                # Cancel anything not started. A source already mid-request keeps
                # going on the shared pool and simply has its result dropped —
                # we do not wait for it.
                for f in futures:
                    f.cancel()
        else:
            # Sequential search
            for source_type in config.enabled_sources:
                if context.is_timed_out():
                    break
                results = self._search_source(source_type, context)
                if results is not None:
                    responded.add(source_type)
                if results:
                    all_results[source_type] = results

        # Merge results
        # Which sources answered at all, empty or not: none means the network,
        # not the query, and the app must not say "no songs matched".
        if answered is not None:
            answered.update(responded)
        if not any(all_results.values()):
            return []

        # ONE search algorithm: collect every source's hits, dedup to the best
        # entry per unique track (source priority JioSaavn → SoundCloud →
        # YouTube → …), then rank by relevance to the query. There used to be a
        # "fast" vs "comprehensive" split, but both took the SAME time (the cost
        # is the network wait for the sources, not the merge) and comprehensive's
        # only theoretical edge — merging one track across sources — never
        # actually fired in practice while it returned FEWER results. So there's
        # a single path now.
        merged = self._rank_by_relevance(self._merge_results(all_results), query)

        # One typo anywhere in a multi-word query (a transliterated Hindi/Urdu
        # title especially — "ars kiya hai" for "Arz Kiya Hai") can make every
        # source's own search API return nothing at all, because their spelling
        # tolerance is on THEM, not us: we only rank what comes back, and a
        # zero-result response leaves nothing to rank. There's no dictionary
        # here — the trick is that a typo lives in exactly one word, so the
        # query with THAT word dropped still matches on the rest. Try each
        # single-word-dropped variant against JioSaavn only (fastest, and the
        # deepest catalogue for the titles this actually happens to) and merge
        # anything found back into the pool, still ranked against the ORIGINAL
        # query — so a variant's junk doesn't outrank a genuine near-match.
        if len(merged) < 5 and SourceType.JIOSAAVN in config.enabled_sources:
            variants = dropword_variants(query)
            found_any = False
            for variant in variants:
                if context.is_timed_out():
                    break
                extra = self._search_source(
                    SourceType.JIOSAAVN, SearchContext(query=variant, config=config)
                )
                if extra:
                    all_results.setdefault(SourceType.JIOSAAVN, []).extend(extra)
                    found_any = True
            if found_any:
                merged = self._rank_by_relevance(
                    self._merge_results(all_results), query
                )

        merged = merged[: config.max_total_results]

        if config.cache_ttl_seconds > 0:
            with self._cache_lock:
                self._cache[cache_key] = {
                    "results": merged,
                    "expires": time.time() + config.cache_ttl_seconds,
                }
        return merged

    def _rank_by_relevance(self, tracks: List, query: str) -> List:  # noqa: C901
        """Most relevant first, then one row per song (search_rank.py says how
        and why). Ties keep the sources' own order, which is their popularity.
        CPU only: no extra network."""
        if not tracks or not query:
            return tracks

        from components import search_rank as sr

        qd = sr.fold(query).replace(" ", "")

        def base_of(t) -> float:
            title = getattr(t, "title", "") or ""
            artist = getattr(t, "artist", "") or ""
            src_vals = {getattr(k, "value", k) for k in getattr(t, "sources", {})}
            # The query IS an artist's name, and the artist is one we trust
            # (JioSaavn's; SoundCloud and YouTube give the uploader): that
            # artist's songs first.
            if len(qd) >= 4 and "jiosaavn" in src_vals:
                for part in re.split(r"[,&/]|feat|ft| x ", artist.lower()):
                    if sr.fold(part).replace(" ", "") == qd:
                        return ARTIST_QUERY
            return sr.relevance(query, title, artist)

        # The query's words that name an artist: in a JioSaavn credit (an
        # uploader's name proves nothing), or before the dash of an upload
        # ("Radiohead - Karma Police") when no JioSaavn title has the word,
        # since "Kesariya - Brahmastra" is the song first.
        q_words = set(sr.words(query))
        # YouTube Music's songs too: the label's upload, under the real name.
        trusted_rows = [t for t in tracks
                        if SourceType.JIOSAAVN in getattr(t, "sources", {})
                        or getattr(t, "official", False)]
        in_titles = set()
        for t in trusted_rows:
            in_titles |= set(sr.core_title(t.title or "").split())
        artist_words = set()
        for t in tracks:
            if t in trusted_rows:
                artist_words |= q_words & set(sr.words(t.artist or ""))
            else:
                parts = sr.title_parts(t.title or "")
                if len(parts) >= 2:
                    artist_words |= (q_words & set(sr.words(parts[0]))) - in_titles

        bases = {id(t): base_of(t) for t in tracks}
        relevant = [t for t in tracks if bases[id(t)] >= sr.RELEVANT]
        if len(relevant) >= sr.MIN_KEPT:
            tracks = relevant
        # Compilations are not songs: left out, not just ranked last, where
        # they still filled the bottom of the list. The playlists shelf is
        # where "the best of" belongs. Uploads only: a label's release is a
        # song whatever it is called or however long (Drake's "Nonstop",
        # Pink Floyd's 23-minute "Echoes").
        songs = [t for t in tracks if t in trusted_rows or not sr.compilation(
            query, getattr(t, "title", "") or "", artist_words,
            getattr(t, "duration_ms", 0) or 0)]
        if len(songs) >= sr.MIN_KEPT:
            tracks = songs

        def composite(t) -> float:
            title = getattr(t, "title", "") or ""
            # A cover act goes with the versions, behind "More versions".
            # The borrowed-name test is for real credits only: an upload
            # always carries the artist in its title.
            t.is_cover = sr.cover_act(query, title, getattr(t, "artist", "") or "",
                                      artist_words if t in trusted_rows else frozenset())
            src_vals = {getattr(k, "value", k) for k in getattr(t, "sources", {})}
            base = bases[id(t)]
            if base >= ARTIST_QUERY:
                return base
            if base <= 0:
                return -1.0
            # Clean catalogue first: JioSaavn's own releases over uploads.
            sb = 0.0
            if "jiosaavn" in src_vals or getattr(t, "official", False):
                sb += 8.0
            if "youtube" in src_vals or "youtube_music" in src_vals:
                sb += 2.0
            if len(src_vals) >= 2:
                sb += 4.0
            # Popularity, the one thing a title cannot say. YouTube Music
            # lists its songs most played first, so its top song is usually
            # the one meant ("weird fishes" is Radiohead's, not the dozen
            # soundalikes JioSaavn has under that exact title). And a
            # JioSaavn song almost nobody played is rarely the one asked for.
            plays = getattr(t, "plays", None)
            # JioSaavn's own measure of the same: a song played a million
            # times there is the one meant as surely ("Kesariya" is Arijit's,
            # whatever YouTube Music's top song is).
            if getattr(t, "music_rank", None) == 0 or (plays or 0) >= MANY_PLAYS:
                sb += TOP_SONG_BONUS
            if plays is not None and plays < FEW_PLAYS and not getattr(t, "official", False):
                sb -= FEW_PLAYS_PENALTY
            return base + sb - sr.penalty(
                query, title, getattr(t, "artist", "") or "", artist_words,
                getattr(t, "duration_ms", 0) or 0)

        order = {id(t): i for i, t in enumerate(tracks)}
        ranked = sorted(tracks, key=lambda t: (-composite(t), order[id(t)]))

        def absorb(kept, copy):
            # The copy's source stays on the row, so "Wrong song?" and a dead
            # stream can still reach it.
            for source, audio in getattr(copy, "sources", {}).items():
                kept.sources.setdefault(source, audio)

        # Whose artist credit is real (JioSaavn's), fixed before any row
        # absorbs another's sources.
        trusted = {id(t) for t in ranked
                   if SourceType.JIOSAAVN in getattr(t, "sources", {})
                   or getattr(t, "official", False)}
        kept = sr.collapse(ranked, absorb=absorb, trusted=lambda t: id(t) in trusted)
        # A row that took in other copies plays the best of them: SoundCloud
        # offers only a 30-second preview of most official songs.
        for t in kept:
            full = [(k, v) for k, v in t.sources.items()
                    if v.url and v.is_playable and not v.requires_auth]
            if full:
                t.primary_source = max(
                    full, key=lambda kv: self.source_merger.priorities.get(kv[0], 0))[0]
        return kept

    def _merge_results(self, all_results: Dict[SourceType, List[Dict]]) -> List:
        """Merge ALL sources into unified tracks so each song carries EVERY
        source it's available from (JioSaavn + SoundCloud + YouTube).

        The old version pre-deduped by raw title|artist and kept only the single
        highest-priority source, DROPPING the alternates — so a song whose
        SoundCloud copy is dead/DRM had no YouTube fallback, and the same song
        showed as several rows. SourceMerger groups by a cross-source key
        (artist-prefix/noise-stripped title + artist, album-agnostic), so those
        rows collapse into one multi-source track that can fall back at play
        time."""
        mapping = {
            SourceType.JIOSAAVN: "jiosaavn_results",
            SourceType.SOUNDCLOUD: "soundcloud_results",
            SourceType.YOUTUBE: "youtube_results",
            SourceType.DEEZER: "deezer_results",
            SourceType.ITUNES: "itunes_results",
        }
        kwargs = {mapping[k]: v for k, v in all_results.items() if v and k in mapping}
        return self.source_merger.merge_search_results(**kwargs)

    def shutdown(self):
        """Shutdown the thread pool executor."""
        if hasattr(self, "_executor") and self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.shutdown()
        return False

    def __del__(self):
        self.shutdown()


# ==================== HIGH-LEVEL API ====================


# ==================== ASYNC VERSION ====================


# ==================== FACTORY FUNCTIONS ====================


# ==================== CLI ====================
