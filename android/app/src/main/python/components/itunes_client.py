"""
iTunes Search API Client
=========================
Metadata enrichment via Apple's iTunes Search API.

Features:
- No authentication required
- Worldwide access (no regional restrictions)
- 600x600 high-resolution artwork
- 30-second preview URLs
- Genre, release date, track pricing
- Global music catalog
- Rate limiting: ~20 requests/second (respectful)

API Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
"""

import time
import requests
from typing import Optional, Dict, List, Any, Literal
from dataclasses import dataclass, field


@dataclass
class iTunesTrack:
    """Track metadata from iTunes Search API."""

    track_id: str
    name: str
    artist_name: str
    artist_id: str
    collection_name: str
    collection_id: str
    collection_type: str  # 'Album', 'Single', etc.
    artwork_url_100: str
    artwork_url_600: str  # Generated from 100
    artwork_url_300: str
    preview_url: Optional[str] = None
    track_time_ms: Optional[int] = None
    track_price: Optional[float] = None
    collection_price: Optional[float] = None
    currency: str = "USD"
    primary_genre_name: Optional[str] = None
    release_date: Optional[str] = None
    track_number: Optional[int] = None
    track_count: Optional[int] = None
    disc_number: Optional[int] = None
    disc_count: Optional[int] = None
    is_streamable: bool = True
    content_advisory_rating: Optional[str] = None  # 'Explicit' or 'Clean'
    country: str = "US"

    @property
    def search_query(self) -> str:
        return f"{self.name} {self.artist_name}"

    @property
    def duration_sec(self) -> Optional[int]:
        if self.track_time_ms:
            return round(self.track_time_ms / 1000)
        return None

    @property
    def duration_formatted(self) -> str:
        if self.track_time_ms:
            ms = self.track_time_ms
            m = ms // 60000
            s = (ms % 60000) // 1000
            return f"{m}:{s:02d}"
        return "?:??"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "track_id": self.track_id,
            "name": self.name,
            "artist_name": self.artist_name,
            "artist_id": self.artist_id,
            "album": self.collection_name,
            "album_id": self.collection_id,
            "duration_ms": self.track_time_ms,
            "duration_sec": self.duration_sec,
            "duration_formatted": self.duration_formatted,
            "artwork_100": self.artwork_url_100,
            "artwork_300": self.artwork_url_300,
            "artwork_600": self.artwork_url_600,
            "preview_url": self.preview_url,
            "price": self.track_price,
            "album_price": self.collection_price,
            "currency": self.currency,
            "genre": self.primary_genre_name,
            "release_date": self.release_date,
            "track_number": self.track_number,
            "explicit": self.content_advisory_rating == "Explicit",
            "country": self.country,
            "search_query": self.search_query,
        }


@dataclass
class iTunesArtist:
    """Artist info from iTunes."""

    artist_id: str
    name: str
    artist_link_url: str
    primary_genre_name: Optional[str] = None
    genres: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "artist_id": self.artist_id,
            "name": self.name,
            "link": self.artist_link_url,
            "primary_genre": self.primary_genre_name,
            "genres": self.genres,
        }


@dataclass
class iTunesAlbum:
    """Album info from iTunes."""

    collection_id: str
    name: str
    artist_name: str
    artist_id: str
    artwork_url_100: str
    artwork_url_600: str
    release_date: Optional[str] = None
    primary_genre_name: Optional[str] = None
    track_count: Optional[int] = None
    price: Optional[float] = None
    currency: str = "USD"
    copyright: Optional[str] = None
    release_year: Optional[int] = None

    @property
    def artwork_url_300(self) -> str:
        return self.artwork_url_100.replace("100x100", "300x300")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "album_id": self.collection_id,
            "name": self.name,
            "artist_name": self.artist_name,
            "artist_id": self.artist_id,
            "artwork_100": self.artwork_url_100,
            "artwork_600": self.artwork_url_600,
            "release_date": self.release_date,
            "genre": self.primary_genre_name,
            "track_count": self.track_count,
            "price": self.price,
            "currency": self.currency,
        }


class iTunesClient:
    """
    iTunes Search API client for metadata enrichment.

    No authentication required, worldwide access, generous rate limits.
    """

    BASE_URL = "https://itunes.apple.com"
    SEARCH_URL = f"{BASE_URL}/search"
    LOOKUP_URL = f"{BASE_URL}/lookup"

    # Entity types for search
    ENTITY_TRACK = "musicTrack"
    ENTITY_ALBUM = "album"
    ENTITY_ARTIST = "musicArtist"
    ENTITY_MIX = "mix"
    ENTITY_SONG = "song"

    # Media types
    MEDIA_MUSIC = "music"
    MEDIA_PODCAST = "podcast"
    MEDIA_MUSIC_VIDEO = "musicVideo"

    # Attributes for search
    ATTRIBUTE_TRACK = "trackTerm"
    ATTRIBUTE_ARTIST = "artistTerm"
    ATTRIBUTE_ALBUM = "albumTerm"
    ATTRIBUTE_GENRE = "genreTerm"
    ATTRIBUTE_COMPOSER = "composerTerm"

    def __init__(
        self,
        default_country: str = "US",
        default_media: str = "music",
        timeout: int = 10,
        max_retries: int = 3,
        rate_limit: float = 0.05,  # ~20 req/sec
    ):
        self.default_country = default_country
        self.default_media = default_media
        self.timeout = timeout
        self.max_retries = max_retries
        self.rate_limit = rate_limit

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "MusicDownloader/1.0 (iTunes Search API Client)",
                "Accept": "application/json",
            }
        )

        self._last_request_time = 0

    def _rate_limit_wait(self):
        """Enforce rate limiting."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self.rate_limit:
            time.sleep(self.rate_limit - elapsed)

    def _request(
        self, endpoint: str, params: Optional[Dict] = None
    ) -> requests.Response:
        """Make HTTP request with retry logic and rate limiting."""
        self._rate_limit_wait()

        url = f"{self.BASE_URL}{endpoint}"

        last_error = Exception("Request failed")
        for attempt in range(3):
            try:
                self._last_request_time = time.time()
                response = self.session.get(url, params=params, timeout=self.timeout)

                if response.status_code == 429:
                    wait_time = 2**attempt
                    time.sleep(wait_time)
                    continue

                response.raise_for_status()
                return response

            except requests.RequestException as e:
                if attempt < 2:
                    time.sleep(2**attempt)
                else:
                    raise e

        raise last_error

    def _search(self, params: Dict) -> Dict[str, Any]:
        """Execute search request."""
        response = self._request("/search", params=params)
        return response.json()

    def _lookup(self, params: Dict) -> Dict[str, Any]:
        """Execute lookup request."""
        response = self._request("/lookup", params=params)
        return response.json()

    # ==================== SEARCH METHODS ====================

    def search_tracks(
        self,
        query: str,
        limit: int = 20,
        country: Optional[str] = None,
        attribute: Optional[str] = None,
        explicit: Literal["Yes", "No"] = "Yes",
    ) -> List:
        """
        Search for tracks.

        Args:
            query: Search query
            limit: Max results (1-200)
            country: Two-letter country code (default: US)
            attribute: Search attribute (trackTerm, artistTerm, etc.)
            explicit: "Yes" or "No" for explicit content

        Returns:
            List of iTunesTrack objects
        """
        params = {
            "term": query,
            "media": self.MEDIA_MUSIC,
            "entity": self.ENTITY_TRACK,
            "limit": min(limit, 200),
            "explicit": explicit,
        }

        if country:
            params["country"] = country
        else:
            params["country"] = self.default_country

        if attribute:
            params["attribute"] = attribute

        data = self._search(params)
        tracks = []

        for item in data.get("results", []):
            # iTunes returns kind="song" for tracks with wrapperType="track"
            if item.get("kind") != "song" or item.get("wrapperType") != "track":
                continue

            track = self._parse_track(item)
            if track:
                tracks.append(track)

        return tracks

    def search_artists(
        self,
        query: str,
        limit: int = 20,
        country: Optional[str] = None,
    ) -> List:
        """Search for artists."""
        params = {
            "term": query,
            "media": self.MEDIA_MUSIC,
            "entity": self.ENTITY_ARTIST,
            "limit": min(limit, 200),
            "country": country or self.default_country,
        }

        data = self._search(params)
        return [self._parse_artist(item) for item in data.get("results", [])]

    def search_albums(
        self,
        query: str,
        limit: int = 20,
        country: Optional[str] = None,
    ) -> List:
        """Search for albums."""
        params = {
            "term": query,
            "media": self.MEDIA_MUSIC,
            "entity": self.ENTITY_ALBUM,
            "limit": min(limit, 200),
            "country": country or self.default_country,
        }

        data = self._search(params)
        return [self._parse_album(item) for item in data.get("results", [])]

    # ==================== LOOKUP METHODS ====================

    def lookup_album(
        self, album_id: str, country: Optional[str] = None, entity: str = "album"
    ) -> Optional[Any]:
        """Get album details by ID, optionally with tracks."""
        params = {"id": album_id, "entity": entity}
        if country:
            params["country"] = country

        data = self._lookup(params)
        results = data.get("results", [])
        if results:
            # First result is the album
            album = self._parse_album(results[0])
            if entity == "albumTrack":
                # Remaining results are tracks
                album.tracks = [
                    self._parse_track(t)
                    for t in results[1:]
                    if t.get("kind") == "track"
                ]
            return album
        return None

    # ==================== ENRICHMENT HELPERS ====================

    def enrich_track(
        self, title: str, artist: str, country: Optional[str] = None
    ) -> Optional[Any]:
        """
        Best-effort track enrichment from title + artist.
        """
        # Try exact match first
        query = f'"{title}" "{artist}"'
        tracks = self.search_tracks(query, limit=5, country=country)

        if tracks:
            # Return best match (first result for exact query)
            return tracks[0]

        # Fallback to loose search
        tracks = self.search_tracks(f"{title} {artist}", limit=10, country=country)
        if tracks:
            return tracks[0]

        return None

    # ==================== PARSERS ====================

    def _parse_track(self, item: Dict) -> Optional[Any]:
        """Parse track from iTunes search result."""
        try:
            # Check if this is a track (kind=song, wrapperType=track)
            if item.get("kind") != "song" or item.get("wrapperType") != "track":
                return None

            # Get artwork URLs at different sizes
            artwork_100 = item.get("artworkUrl100", "")
            artwork_300 = artwork_100.replace("100x100", "300x300")
            artwork_600 = artwork_100.replace("100x100", "600x600")

            return iTunesTrack(
                track_id=str(item.get("trackId", "")),
                name=item.get("trackName", ""),
                artist_name=item.get("artistName", ""),
                artist_id=str(item.get("artistId", "")),
                collection_name=item.get("collectionName", ""),
                collection_id=str(item.get("collectionId", "")),
                collection_type=item.get("collectionType", ""),
                artwork_url_100=artwork_100,
                artwork_url_300=artwork_300,
                artwork_url_600=artwork_600,
                preview_url=item.get("previewUrl"),
                track_time_ms=item.get("trackTimeMillis"),
                track_price=item.get("trackPrice"),
                collection_price=item.get("collectionPrice"),
                currency=item.get("currency", "USD"),
                primary_genre_name=item.get("primaryGenreName"),
                release_date=item.get("releaseDate"),
                track_number=item.get("trackNumber"),
                track_count=item.get("trackCount"),
                disc_number=item.get("discNumber"),
                disc_count=item.get("discCount"),
                is_streamable=item.get("isStreamable", True),
                content_advisory_rating=item.get("contentAdvisoryRating"),
                country=item.get("country", "US"),
            )
        except Exception:
            return None

    def _parse_artist(self, item: Dict) -> Optional[Any]:
        """Parse artist from iTunes search result."""
        try:
            return iTunesArtist(
                artist_id=str(item.get("artistId", "")),
                name=item.get("artistName", ""),
                artist_link_url=item.get("artistLinkUrl", ""),
                primary_genre_name=item.get("primaryGenreName"),
            )
        except Exception:
            return None

    def _parse_album(self, item: Dict) -> Optional[Any]:
        """Parse album from iTunes search result."""
        try:
            artwork_100 = item.get("artworkUrl100", "")
            artwork_600 = artwork_100.replace("100x100", "600x600")

            release_year = None
            if item.get("releaseDate"):
                try:
                    release_year = int(item.get("releaseDate", "")[:4])
                except ValueError:
                    pass

            return iTunesAlbum(
                collection_id=str(item.get("collectionId", "")),
                name=item.get("collectionName", ""),
                artist_name=item.get("artistName", ""),
                artist_id=str(item.get("artistId", "")),
                artwork_url_100=artwork_100,
                artwork_url_600=artwork_600,
                release_date=item.get("releaseDate"),
                primary_genre_name=item.get("primaryGenreName"),
                track_count=item.get("trackCount"),
                price=item.get("collectionPrice"),
                currency=item.get("currency", "USD"),
                copyright=item.get("copyright"),
                release_year=release_year,
            )
        except Exception:
            return None


# ==================== CONVENIENCE FUNCTIONS ====================


def search_tracks(query: str, limit: int = 20, country: str = "US") -> List:
    """Quick track search."""
    client = iTunesClient(default_country=country)
    return client.search_tracks(query, limit, country)


def enrich_track(title: str, artist: str, country: str = "US") -> Optional[Any]:
    """Quick track enrichment."""
    client = iTunesClient(default_country=country)
    return client.enrich_track(title, artist, country)


# ==================== CLI ====================
