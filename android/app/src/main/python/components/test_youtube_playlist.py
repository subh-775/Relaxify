"""YouTube playlist URL parsing and title clean-up (no network).

Run: python components/test_youtube_playlist.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from components.youtube_playlist import clean_item, parse_url


if __name__ == "__main__":
    ok = "PLGo6V7qE3jPAabcdefghijklmnopqrstuv"
    assert parse_url(f"https://music.youtube.com/playlist?list={ok}&si=Ez5osjRN_N5") == ok
    assert parse_url(f"https://www.youtube.com/playlist?list={ok}") == ok
    assert parse_url(f"https://youtube.com/watch?v=abc123&list={ok}&index=2") == ok
    assert parse_url(f"https://youtu.be/abc123?list={ok}") == ok
    assert parse_url(f"music.youtube.com/playlist?list={ok}") == ok
    assert parse_url("https://www.youtube.com/watch?v=abc123") is None
    assert parse_url(f"https://evil.example/playlist?list={ok}") is None
    assert parse_url("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M") is None

    assert clean_item("Kesariya", "Arijit Singh - Topic") == ("Kesariya", "Arijit Singh")
    assert clean_item("Arijit Singh - Kesariya (Official Video)", "Sony Music India") == ("Kesariya", "Arijit Singh")
    assert clean_item("The Weeknd – Blinding Lights [Official Audio]", "TheWeekndVEVO") == ("Blinding Lights", "The Weeknd")
    assert clean_item("Kesariya | Brahmastra | Arijit Singh", "T-Series") == ("Kesariya", "T-Series")
    assert clean_item("Tum Hi Ho (Lyrics)", "Lyrics Hub") == ("Tum Hi Ho", "Lyrics Hub")
    # A hyphen inside a word is not a separator.
    assert clean_item("Anti-Hero", "Taylor Swift - Topic") == ("Anti-Hero", "Taylor Swift")
    print("youtube_playlist: OK")
