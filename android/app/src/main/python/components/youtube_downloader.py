"""A YouTube search result.

Search and streaming go through NewPipeExtractor (newpipe_yt.py), because
yt-dlp cannot solve YouTube's signature challenge on a phone. This is the shape
those results take on their way into the merger.
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class YouTubeTrack:
    """Represents a track from YouTube search results."""

    id: str
    title: str
    artist: str
    uploader: str
    url: str
    duration_ms: Optional[int] = None
    thumbnail: Optional[str] = None
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    upload_date: Optional[str] = None
    is_music: bool = False
    album: Optional[str] = None

    @property
    def search_query(self) -> str:
        return f"{self.title} {self.artist}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "uploader": self.uploader,
            "url": self.url,
            "duration_ms": self.duration_ms,
            "duration_sec": round(self.duration_ms / 1000)
            if self.duration_ms
            else None,
            "thumbnail": self.thumbnail,
            "view_count": self.view_count,
            "is_music": self.is_music,
            "album": self.album,
            "search_query": self.search_query,
        }
