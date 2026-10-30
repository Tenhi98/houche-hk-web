# 候車 · 香港巴士（網頁版）

Standalone HTTPS static site — **no ChatGPT login**.

Built from private Android handoff branch `handoff/web-v2-20261030` @ `31a20ac7489b3a30ce1f5258213794e7d40d4a1f`.

## Features
- Nearby stops, live ETA (KMB/LWB, CTB, NLB, MTR Bus, GMB)
- Full route stop lists with direction / special / joint operators
- A→B rough journey time estimates (not live traffic)

## Data
- `network.json` snapshot blob `56dd53755ebc94904b5b6fa4e0dd0f48a12ebd1e` (2026-10-28 Android repo snapshot)
- 3783 routes, 15355 stops

## Local preview
Serve this directory over HTTP(S). No build step.

## License notes
Upstream Android app is GPL-3.0. Leaflet and data-project licenses are included in this tree.
