# 候車 · 香港巴士（網頁版）

**Live HTTPS (no ChatGPT login):** https://tenhi98.github.io/

Also mirrored at https://github.com/Tenhi98/houche-hk-web

Built from private Android handoff `handoff/web-v2-20261030` @ `31a20ac7489b3a30ce1f5258213794e7d40d4a1f`.

## Features
- Nearby stops, live ETA (KMB/LWB, CTB, NLB, MTR Bus, GMB)
- Full route stop lists with direction / special / joint operators
- A→B rough journey time estimates (not live traffic)

## Data
- Snapshot blob `56dd53755ebc94904b5b6fa4e0dd0f48a12ebd1e` (2026-10-28 Android `network.json`)
- Served as `parts/network.part00.txt` … `part09.txt` (assembled in `app.js`) because a single 8MB file exceeds some push limits
- 3783 routes, 15355 stops
- Falls back to HK Bus Crawling CDN when reachable

## China / company network notes
- Site host is `github.io` (Cloudflare-backed GitHub Pages). Often reachable, but some mainland/corp filters still block `*.github.io` — please test on the company PC.
- Live ETA calls HK government / operator APIs (`data.gov.hk`, etagmb, etc.); those may be blocked separately even if the static UI loads.
- Google Fonts removed (system CJK stack). OSM map tiles may also be filtered.

## License
Upstream Android app GPL-3.0. Leaflet and data-project licenses included.
