"""Self-check for how each source's stream is chosen and verified.

Run it directly:  python test_stream_sources.py

- SoundCloud serves HLS only since October 2026; streaming must pick it (and
  never Opus, which ExoPlayer's HLS reader can't play), while downloads still
  refuse it.
- A YouTube extraction now and then comes back with URLs YouTube refuses; the
  verifier extracts once more before giving up. Other sources do not.
- A SoundCloud download (fragmented MP4) is rebuilt as a plain MP4 with a
  real length.
- A JioSaavn song's token is read from both shapes of its page URL: search's
  and the station's (radio), which carries the language and album too.
- A JioSaavn song's credits: each artist's role, composer and lyricist, label.
"""

import os
import struct
import tempfile

import mobile_server as m
from components.jiosaavn_downloader import JioSaavnClient
from components.soundcloud_downloader import _box, _boxes, defragment_mp4, pick_audio_format

hls_aac = {"format_id": "hls_aac_160k", "protocol": "m3u8_native",
           "acodec": "mp4a.40.2", "vcodec": "none", "abr": 160, "url": "a"}
hls_opus = {"format_id": "hls_opus_64k", "protocol": "m3u8_native",
            "acodec": "opus", "vcodec": "none", "abr": 64, "url": "b"}
preview = dict(hls_aac, format_id="hls_aac_preview", url="https://x/preview/0/30/")
assert pick_audio_format([hls_aac, hls_opus], 320, hls=True) is hls_aac
assert pick_audio_format([hls_opus], 320, hls=True) is None
assert pick_audio_format([preview], 320, hls=True) is None
assert pick_audio_format([hls_aac], 320) is None  # a download needs a file

calls = []


class _Answer:
    def __init__(self, code):
        self.status_code = code

    def close(self):
        pass


def _resolver(found):
    it = iter(found)

    def resolve(url, source, bitrate=320):
        calls.append(source)
        return next(it)
    return resolve


m._stream_session.get = lambda u, **k: _Answer(403 if "dead" in u else 206)

m._resolve_stream_url = _resolver(["https://dead/1", "https://good/2"])
assert m._verified_stream("https://youtube.com/watch?v=a", "youtube", 160) == ("https://good/2", None)
assert len(calls) == 2

calls.clear()
m._resolve_stream_url = _resolver(["https://dead/3", "https://good/4"])
assert m._verified_stream("https://soundcloud.com/a/b", "soundcloud", 160) == (None, 403)
assert len(calls) == 1


# Two fragments of 3 and 2 samples, 1024 ticks each at 44100 Hz, sizes from
# trun, durations from tfhd: the shape SoundCloud's AAC fragments have.
def full(typ, payload, version=0, flags=0):
    return _box(typ, struct.pack(">I", (version << 24) | flags) + payload)


hd = struct.pack(">IIII", 0, 0, 44100, 0)                 # times, scale, duration
moov = _box(b"moov", full(b"mvhd", hd + b"\0" * 80) + _box(b"trak",
    full(b"tkhd", struct.pack(">IIIII", 0, 0, 1, 0, 0) + b"\0" * 60)
    + _box(b"mdia", full(b"mdhd", hd + b"\0" * 4) + _box(b"minf", _box(b"stbl",
        full(b"stsd", struct.pack(">I", 0)) + full(b"stts", b"\0" * 4)
        + full(b"stsc", b"\0" * 4) + full(b"stsz", b"\0" * 8) + full(b"stco", b"\0" * 4)))))
    + _box(b"mvex", full(b"trex", struct.pack(">IIIII", 1, 1, 0, 0, 0))))


def fragment(samples):
    trun = lambda off: full(b"trun", struct.pack(">Ii", len(samples), off)
                            + b"".join(struct.pack(">I", len(x)) for x in samples), flags=0x201)
    traf = lambda off: _box(b"traf", full(b"tfhd", struct.pack(">II", 1, 1024), flags=0x020008) + trun(off))
    size = len(_box(b"moof", traf(0)))
    return _box(b"moof", traf(size + 8)) + _box(b"mdat", b"".join(samples))


frags = [[b"aa", b"bbb", b"c"], [b"dddd", b"ee"]]
path = os.path.join(tempfile.mkdtemp(), "t.m4a")
with open(path, "wb") as f:
    f.write(_box(b"ftyp", b"iso6" + b"\0" * 4) + moov + fragment(frags[0]) + fragment(frags[1]))
defragment_mp4(path)
d = open(path, "rb").read()
top = [b[0] for b in _boxes(d, 0, len(d))]
assert top == [b"ftyp", b"moov", b"mdat"], top


def find(start, end, *path):
    for typ, _, p, e in _boxes(d, start, end):
        if typ == path[0]:
            return (p, e) if len(path) == 1 else find(p, e, *path[1:])


stbl = (b"moov", b"trak", b"mdia", b"minf", b"stbl")
p, _ = find(0, len(d), *stbl, b"stsz")
assert struct.unpack_from(">7I", d, p + 4) == (0, 5, 2, 3, 1, 4, 2)
p, _ = find(0, len(d), *stbl, b"stts")
assert struct.unpack_from(">3I", d, p + 4) == (1, 5, 1024)
p, _ = find(0, len(d), b"moov", b"trak", b"mdia", b"mdhd")
assert struct.unpack_from(">I", d, p + 16)[0] == 5 * 1024
p, _ = find(0, len(d), *stbl, b"stco")
assert d[struct.unpack_from(">I", d, p + 8)[0]:][:12] == b"aabbbcddddee"
assert find(0, len(d), b"moov", b"mvex") is None

token = JioSaavnClient.song_token
assert token("https://www.jiosaavn.com/song/last-night-on-earth/MTEcdEVyUV4") == "MTEcdEVyUV4"
assert token("https://www.jiosaavn.com/s/song/english/bones/bones/CSwOcCcIcls") == "CSwOcCcIcls"
assert token("https://www.jiosaavn.com/song/idea-10/HjAfWBJ,TXA/?ref=x") == "HjAfWBJ,TXA"
assert token("https://www.jiosaavn.com/album/bones/abc") is None
assert token("") is None

record = {"more_info": {"label": " T-Series ", "artistMap": {
    "primary_artists": [{"name": "Mohammed Irfan"}, {"name": "Gajendra Verma"}],
    "featured_artists": [{"name": "Guest"}],
    "artists": [{"name": "Mithoon", "role": "music"}, {"name": "Mohammed Irfan", "role": "singer"},
                {"name": "Backing", "role": "singer"}, {"name": "Writer", "role": "lyricist"},
                {"name": "Actor", "role": "starring"}]}}}
client = JioSaavnClient.__new__(JioSaavnClient)
client._song_record = lambda t: record if t == "JDgyeENGYFI" else None
c = client.credits("https://www.jiosaavn.com/s/song/hindi/yaariyan/baarish/JDgyeENGYFI")
assert c["roles"] == {"Mohammed Irfan": "Main artist", "Gajendra Verma": "Main artist",
                      "Guest": "Featured artist", "Backing": "Singer"}, c["roles"]
assert c["writers"] == [{"name": "Mithoon", "role": "Composer"}, {"name": "Writer", "role": "Lyricist"}]
assert c["label"] == "T-Series"
assert client.credits("https://www.jiosaavn.com/song/x/NOPE") == {"roles": {}, "writers": [], "label": ""}

print("ok")
