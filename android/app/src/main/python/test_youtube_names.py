"""A YouTube search hit becomes (song, artist), not (video title, channel).

Run: python test_youtube_names.py
"""
import mobile_server as m


def main() -> None:
    ys = m._youtube_song
    # YouTube Music's own channel: the title is the song as released.
    assert ys("Glorious Purpose", "Natalie Holt - Topic") == ("Glorious Purpose", "Natalie Holt")
    assert ys("Neon Escapism - Edit", "Melezz - Topic") == ("Neon Escapism - Edit", "Melezz")
    # An artist's or label's upload: tags dropped, "Artist - Song" split.
    assert ys("The Weeknd - Blinding Lights (Official Audio)", "TheWeekndVEVO") == ("Blinding Lights", "The Weeknd")
    assert ys("Anti-Hero (Official Music Video)", "TaylorSwiftVEVO") == ("Anti-Hero", "TaylorSwift")
    # Nothing to clean stays as it is.
    assert ys("Starboy", "The Weeknd") == ("Starboy", "The Weeknd")
    print("ok")


if __name__ == "__main__":
    main()
