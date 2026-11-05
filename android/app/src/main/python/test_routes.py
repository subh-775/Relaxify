"""The engine still imports, and answers on every route the app calls.

Run: python test_routes.py

Nothing here reaches the network. A route that exists answers with anything but
404; the app's client (src/backend.ts) is the list that matters, so a route
removed by mistake fails here rather than on a phone.
"""
import mobile_server as m

CALLED = [
    ("GET", "/health"),
    ("GET", "/api/connectivity"),
    ("POST", "/api/search"),
    ("GET", "/api/search/suggestions"),
    ("GET", "/api/search/lyric"),
    ("GET", "/api/search/artists"),
    ("GET", "/api/stream_info"),
    ("GET", "/api/proxy_stream"),
    ("GET", "/api/stream_by_name"),
    ("GET", "/api/rematch"),
    ("POST", "/api/recheck"),
    ("GET", "/api/quality_cap"),
    ("POST", "/api/download"),
    ("GET", "/api/download/x"),
    ("GET", "/api/downloads/info"),
    ("POST", "/api/downloads/dir"),
    ("GET", "/api/downloads/local"),
    ("POST", "/api/downloads/delete"),
    ("GET", "/api/local/artwork"),
    ("GET", "/api/lyrics"),
    ("GET", "/api/credits"),
    ("GET", "/api/artwork"),
    ("GET", "/api/radio"),
    ("GET", "/api/discover"),
    ("GET", "/api/artist"),
    ("GET", "/api/artists/releases"),
    ("GET", "/api/album"),
    ("GET", "/api/album_of"),
    ("GET", "/api/home"),
    ("GET", "/api/playlist"),
    ("GET", "/api/genres"),
    ("POST", "/api/import/sync"),
    ("GET", "/api/spotify/import"),
    ("GET", "/api/cache"),
    ("GET", "/api/storage"),
    ("POST", "/api/cache/clear"),
]

rules = {(method, rule.rule) for rule in m.app.url_map.iter_rules() for method in rule.methods}
for method, path in CALLED:
    wanted = "/api/download/<task_id>" if path == "/api/download/x" else path
    assert (method, wanted) in rules, f"{method} {path} is not routed"

for gone in ("/api/stream_url", "/api/enrich", "/api/search/albums", "/api/downloads"):
    assert not any(rule.rule == gone for rule in m.app.url_map.iter_rules()), gone

print("ok")
