# KNOWLEDGE LAYER INTEGRATION — Kana Charts & Kanji Mind Tree

- **Status**: COMPLETE & VERIFIED
- **Target**: Repository A (`https://github.com/ranimony-afk/nihingobridgeupgrade`)
- **Scope**: Integrate kana-chart and kanji-component-mind-tree capabilities into the existing platform, wired into the Phase 11 SRS.

---

## 0. An important constraint, stated up front

The two referenced repositories could not be cloned in this environment, and the master prompt's
**Rule 9 (LICENSE-AWARE)** forbids reproducing proprietary datasets or copyrighted UI/content from
other products (Takoboto, Duolingo, Todaii, WaniKani, etc.).

So rather than port someone else's implementation, I built the **capabilities natively in Repository
A** with **first-party, authorable data** and **recorded provenance**. Kana readings, kanji strokes,
radicals and decomposition roles are standard, non-copyrightable language facts. Every row carries
`sourceRef` (`first-party:kana:v1`, `first-party:kanji-mindtree:v1`), so a *licensed* third-party
dataset can replace this data later **without a schema change** — which is the rule-compliant path to
"integrating" external sources if one is approved.

---

## 1. What Was Built

### 1.1 Kana Charts — `/kana`

Full interactive chart covering **208 entries** across both scripts:

| Group | Japanese | Count |
|---|---|---|
| Base | 五十音 (gojūon) | 46 per script |
| Dakuten | 濁音 | 20 |
| Handakuten | 半濁音 | 5 |
| Contracted | 拗音 (yōon) | 33 |

Features:
- Hiragana / katakana / both toggle; filter by any group
- Romaji show/hide (self-testing mode)
- Click any kana → Japanese TTS audio + expanded detail (derived-from base kana, row, mnemonic)
- Built-in **quiz mode**: randomised 4-choice reading drill with running score
- **Add row to SRS** (bulk) and **Add to SRS** (single) directly from the chart
- 46 original hand-written hiragana mnemonics

Data is authored as `[romaji, hiragana, katakana, columnKey]` rows, so both scripts derive from one
definition — no duplication drift.

### 1.2 Kanji Mind Tree — `/kanji` and `/kanji/[character]`

A component-graph explorer built on **33 kanji**, **55 elements** and **71 composition edges**.

The key modelling decision: the element table holds **classical radicals AND "primitive" whole
characters** (寺, 者, 每, 至, 召…). A kanji's meaningful parts are frequently full characters, and
this is exactly what makes the family graph useful:

```
時 = 日 (semantic) + 寺 (phonetic → supplies ジ)
      │
      └─ family via 寺:  持(hold)  待(wait)
      └─ family via 日:  明(bright)  間(interval)
```

- **Radial SVG graph**: centre kanji → components (ring 1) → sibling kanji sharing a component (ring 2)
- Every edge is **role-typed**: `semantic` (meaning), `phonetic` (reading), `positional` (frame), `structural` (shape)
- Each node is clickable — radicals speak, family kanji navigate to *their* tree
- Element palette on the index: click 水 → every kanji built on it (海, 洗, 汗)
- Per-kanji: readings (on/kun), stroke count, grade, vocabulary with TTS, and original mnemonics
- Composition table explains *how* each kanji is built, with role hints

---

## 2. Implementation Evidence

| Concern | Path |
|---|---|
| Schema | `src/db/schema.ts` — `kanaEntries`, `kanjiRadicals`, `kanjiEntries`, `kanjiComposition` |
| Kana dataset | `src/data/kana.ts` |
| Kanji dataset | `src/data/kanji.ts` |
| Service | `src/services/knowledge/knowledgeService.ts` |
| APIs | `src/app/api/kana`, `/api/kanji`, `/api/kanji/[character]`, `/api/knowledge/srs` |
| UI | `src/app/kana/page.tsx`, `src/app/kanji/page.tsx`, `src/app/kanji/[character]/page.tsx` |

---

## 3. Integration with Phase 11 SRS (the actual "integration")

Knowledge rows become first-class SRS cards via `POST /api/knowledge/srs`:

| Target | Behaviour |
|---|---|
| `kana` | Single kana → `deck-kana-hiragana` / `deck-kana-katakana`, mnemonic carried into `hint` |
| `kana-row` | Bulk: a whole chart row → same deck |
| `kanji` | Kanji → `deck-kanji-<level>`, **component list becomes the card hint** (e.g. "Built from: 日 + 月") |

Provenance is preserved on the card via `sourceType` (`kana_chart` | `kanji_mindtree`) and
`sourceRef`. Because the cards are ordinary `srs_cards`, they inherit **everything** built in Phase 11
for free — no new scheduling, session, or analytics code:

- ✅ Studyable through the 11.2 session engine (verified: `あ → 12m`, `は → 12m`, `ひ → 12m`)
- ✅ Algorithm re-binding per deck (verified: `deck-kanji-n5` → FSRS-Lite v1.3.0)
- ✅ Visible in 11.3 daily due queue and 11.5 personalization weakness profile
- ✅ Idempotent — re-adding returns `created: false` instead of duplicating

---

## 4. Verification Results

### 4.1 Validation commands
| Command | Result |
|---|---|
| `npx drizzle-kit push` | ✅ 4 new tables (additive) |
| `npx next typegen` | ✅ |
| `tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ new routes compiled |
| `build_and_start` + `/api/health` | ✅ `{"ok":true}` |

### 4.2 Kana chart
```
total entries: 208 | groups: 27 | sourceRef: first-party:kana:v1
hiragana cells: 104 | katakana cells: 104
by category: { gojuon: 46, dakuten: 20, handakuten: 5, yoon: 33 }
```

### 4.3 Mind tree traversal
```
明 = 日 + 月        (semantic ×2)  → family: 時, 間
時 = 日 + 寺        (semantic + phonetic ジ) → family: 明, 間, 持, 待
element 水 filter   → 汗, 洗, 海
```

### 4.4 Knowledge → SRS
```
kana      あ → created: True,  deck-kana-hiragana
kanji     明 → created: True,  deck-kanji-n5
row       H    → created: 5, skipped: 0
re-add    明 → created: False   (idempotent)
```
Studied through the session engine — three cards graded by `sm2@1.2.0`, progress advanced correctly.

### 4.5 Regression — all green
| Feature | Result |
|---|---|
| `/api/health` | ✅ ok |
| 11.1 scheduler registry | ✅ 4 plugins |
| 11.3 daily queue + streak | ✅ buckets reporting (44 new available) |
| 11.4 sync registry | ✅ `reg-1r952uooqf9b-4` |
| 11.5 personalization | ✅ 48 cards tracked, 6 weak areas |
| 11.5 lifecycle gate | ✅ `allPassed: true` |
| Phase 10 JLPT / question bank | ✅ 3 tests, 32 questions |
| All 9 UI pages | ✅ HTTP 200 |

---

## 5. Deployment

```bash
npx drizzle-kit push      # additive: four new tables, no existing table altered
npx next typegen
npm exec tsc -- --noEmit
npm run build
npm run start             # or: vercel --prod
```

**Environment:** no new env vars. `DATABASE_URL` only.
**Breaking changes:** none.

---

## 6. Deliberate Limits & Follow-ups

- **Coverage is intentionally a seed, not a corpus.** 33 kanji / 55 elements / 208 kana proves the
  architecture end-to-end. Scaling the data is a content task, not an engineering one — the schema,
  service and UI need no change.
- **No stroke-order diagrams.** SVG stroke animation needs licensed path data; added as a follow-up
  pending a properly licensed source.
- **Katakana mnemonics** are not yet authored (hiragana are). The chart degrades gracefully.
- **Future:** auto-generate JLPT questions *from* the knowledge graph (e.g. "which component supplies
  the reading ジ in 時?"), and a cross-links table so grammar points can join the same mind tree.
