"""
Fuzzy Matcher Module
====================
Replaces LLM-based title matching with fast, local fuzzy string matching.

Uses rapidfuzz for high-performance approximate string matching.
Supports multiple algorithms: Levenshtein, Jaro-Winkler, Token Sort, Token Set.
"""

import re
from typing import Optional
from dataclasses import dataclass
from enum import Enum

# rapidfuzz on desktop, a pure-Python equivalent on Android (rapidfuzz is a C++
# extension with no Android wheel). Either way `fuzz` honours the algorithm the
# caller selected — the old difflib fallback collapsed every algorithm into a
# plain character ratio, quietly discarding token-set and partial semantics.


class MatchAlgorithm(Enum):
    """Fuzzy matching algorithms available."""

    LEVENSHTEIN = "levenshtein"  # Classic edit distance
    JARO_WINKLER = "jaro_winkler"  # Good for short strings
    TOKEN_SORT = "token_sort"  # Token order independent
    TOKEN_SET = "token_set"  # Handles extra words well
    PARTIAL_RATIO = "partial_ratio"  # Substring matching
    WEIGHTED_RATIO = "weighted_ratio"  # Best overall (default)


@dataclass
class FuzzyMatchConfig:
    """Configuration for fuzzy matching behavior."""

    algorithm: MatchAlgorithm = MatchAlgorithm.WEIGHTED_RATIO
    score_cutoff: float = 60.0  # Minimum score (0-100)
    max_results: int = 5  # Max matches to return
    case_sensitive: bool = False
    ignore_punctuation: bool = True
    # Weights for multi-title matching
    title_weight: float = 1.0
    artist_weight: float = 0.8
    album_weight: float = 0.5


class FuzzyMatcher:
    """
    High-performance fuzzy string matching for music metadata.

    Replaces LLM-based matching with local algorithms:
    - 1000x faster than LLM calls
    - No API keys or network required
    - Works offline
    - Deterministic results
    """

    def __init__(self, config: Optional[FuzzyMatchConfig] = None):
        self.config = config or FuzzyMatchConfig()

    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison."""
        if not text:
            return ""

        text = str(text)

        if not self.config.case_sensitive:
            text = text.lower()

        if self.config.ignore_punctuation:
            # Remove punctuation but keep spaces
            text = re.sub(r"[^\w\s]", " ", text)
            # Normalize whitespace
            text = re.sub(r"\s+", " ", text).strip()

        return text

    # ==================== SINGLE MATCH ====================

    # ==================== STRUCTURED MATCH (Music) ====================

    # ==================== UTILITY ====================

# ==================== CONVENIENCE FUNCTIONS ====================

_default_matcher = None


# ==================== CLI ====================
