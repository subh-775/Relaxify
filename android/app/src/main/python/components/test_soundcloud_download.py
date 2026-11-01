"""A SoundCloud download reports progress, and saves what it was served.

Run: python components/test_soundcloud_download.py

yt-dlp is faked: this checks what is handed to it. No network.
"""
import os
import sys
import types

# Replaces the script's own folder: components/http.py would shadow stdlib http.
sys.path[0] = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

seen_opts = {}


class FakeYDL:
    def __init__(self, opts):
        self.opts = opts

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, url, download=False):
        return {"formats": [{"format_id": "aac", "url": "https://x/a.m4a", "ext": "m4a",
                             "acodec": "aac", "vcodec": "none", "abr": 128, "protocol": "https"}]}

    def download(self, urls):
        seen_opts.update(self.opts)
        for hook in self.opts.get("progress_hooks", []):
            # yt-dlp sends these keys with a None value, not without them.
            hook({"status": "downloading", "downloaded_bytes": None,
                  "total_bytes": None, "total_bytes_estimate": None})
            hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes": 100})
            hook({"status": "finished", "total_bytes": 100})


fake = types.ModuleType("yt_dlp")
fake.YoutubeDL = FakeYDL
fake.utils = types.SimpleNamespace(DownloadError=RuntimeError)
sys.modules["yt_dlp"] = fake

from components.soundcloud_downloader import SoundCloudClient  # noqa: E402

client = SoundCloudClient()
client._execute_download = (
    lambda url, opts, base, br, expected_ext=None:
    (FakeYDL(opts).download([url]), types.SimpleNamespace(success=False, file_path=""))[1]
)

reports = []
client.download_track("https://soundcloud.com/a/b", "/tmp/out", 320, lambda d, t: reports.append((d, t)))

assert reports == [(50, 100), (100, 100)], reports
assert not seen_opts.get("postprocessors"), "ffmpeg does not exist on a phone"
print("soundcloud download: OK")
