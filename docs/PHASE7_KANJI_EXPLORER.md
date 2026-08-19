# Phase 7 — Kanji Explorer

Upgrades `/kanji` without removing the grid. The new mind map is at `/kanji/explore`.

## Features

- D3 radial tree with zoom + pan
- Semantic branches: Nature, Humans, Numbers, Actions, Compass, Time
- Relations, radicals, compounds
- On / kun / nanori readings
- History, origin, mnemonics
- RTK index + keyword, WaniKani level
- JLPT + frequency
- Existing SVG/GIF stroke animator reused
- Search on the grid (`?q=`)
- CMS `/admin/kanji`
- REST `GET /api/v1/kanji/graph` and `GET /api/v1/kanji/explore/:char`

## Flutter

Fetch `/api/v1/kanji/graph` and render the same `{ name, children }` tree. Detail cards come from `/api/v1/kanji/explore/{char}`.
