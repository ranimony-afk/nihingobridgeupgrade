# Phase 6 — Enterprise dictionary

Extends the Phase 5 knowledge graph. `/dictionary` and `/api/v1/kg/*` remain.

## Entry card

- Grammar lookup (linked patterns)
- Cross references: synonym, antonym, related, variant
- Rare kanji flag (freq or stroke threshold) plus 鷹 / 鬱
- JLPT + frequency + pitch accent + TTS audio
- Stroke SVG animation and GIF-style frame play
- Definitions: `ja` `en` `hi` `ta` `ml`
- Keigo / humble / casual forms
- Collocations and example sentences
- Conjugation tables (godan / ichidan / irregular / i-adj)
- Bookmarks and SRS pins

## Offline / Flutter

`GET /api/v1/dict/offline` — compact N5 pack  
`GET /api/v1/dict/entries/:id` — full card  
`GET|POST /api/v1/dict/bookmarks`  

Web: **Cache N5 pack** writes `localStorage`. Flutter should persist the same JSON in SQLite.

## Admin

`/admin/kg` → **Enrich dictionary** (`POST /api/v1/admin/dict/enrich`)
