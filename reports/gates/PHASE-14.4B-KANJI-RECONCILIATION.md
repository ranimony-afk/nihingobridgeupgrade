# Phase 14.4B: Kanji Baseline vs KANJIDIC2 Reconciliation Report

**Generated At:** 2026-09-23T10:36:05.620Z
**Authoritative Upstream Release:** `upstream:kanjidic2:2023-08` (Database Version 2023-232, 2023-08-20)
**Baseline Target:** Local PostgreSQL (`kanji_entries` table)

## 1. Executive Summary

| Metric | Count | Percentage |
| :--- | :--- | :--- |
| Canonical Existing Records (Baseline) | 45 | 100% |
| KANJIDIC2 Matched Records (`KANJIDIC_MATCH`) | 44 | 97.8% |
| KANJIDIC2 Conflicting Records (`KANJIDIC_CONFLICT`) | 1 | 2.2% |
| Missing from KANJIDIC2 (`MISSING_FROM_KANJIDIC`) | 0 | 0.0% |
| Authoritative KANJIDIC2 Total Entries | 13108 | 100% |
| In KANJIDIC2, Missing from Canonical Baseline (`MISSING_FROM_CANONICAL`) | 13063 | 99.7% |

## 2. Invariant & Safety Guarantees
- **Zero DB Overwrite:** No existing baseline records were updated, altered, or deleted.
- **ID Collision Prevention:** Canonical IDs (such as `kj-mei`, `kanji-road`, `kanji-bind`) take precedence over synthesized IDs (`kanji-${char}`).
- **Data Classification Policy:** Existing 45 records remain strictly `CANONICAL_EXISTING` and are not overwritten during dry-run or future expansions.

## 3. Reconciliation Classification Details (Baseline Records)

| Kanji | Existing ID | Status | Stroke Count (DB / KANJIDIC) | JLPT (DB / KANJIDIC) | Meaning (DB / KANJIDIC) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **結** | `kanji-bind` | `KANJIDIC_MATCH` | 12 / 12 | N3 / N2 | "tie, bind, contract, join" / "tie" |
| **晴** | `kanji-clear-weather` | `KANJIDIC_MATCH` | 12 / 12 | N4 / N2 | "clear weather, fair skies" / "clear up" |
| **鑑** | `kanji-discern` | `KANJIDIC_MATCH` | 23 / 23 | N1 / N1 | "specimen, take warning from, mirror, inspect, judge" / "specimen" |
| **心** | `kanji-heart` | `KANJIDIC_MATCH` | 4 / 4 | N4 / N4 | "heart, mind, spirit" / "heart" |
| **新** | `kanji-new` | `KANJIDIC_MATCH` | 13 / 13 | N5 / N5 | "new, fresh" / "new" |
| **観** | `kanji-observe` | `KANJIDIC_MATCH` | 18 / 18 | N2 / N2 | "look, view, observe, sight" / "outlook" |
| **紙** | `kanji-paper` | `KANJIDIC_MATCH` | 10 / 10 | N4 / N4 | "paper" / "paper" |
| **道** | `kanji-road` | `KANJIDIC_MATCH` | 12 / 12 | N5 / N5 | "road, path, way, teachings" / "road-way" |
| **話** | `kanji-talk` | `KANJIDIC_MATCH` | 13 / 13 | N5 / N5 | "talk, speech, conversation, story" / "tale" |
| **念** | `kanji-thought` | `KANJIDIC_MATCH` | 8 / 8 | N3 / N2 | "thought, sentiment, desire, attention" / "wish" |
| **間** | `kj-aida` | `KANJIDIC_MATCH` | 12 / 12 | N5 / N5 | "interval, between" / "interval" |
| **灯** | `kj-akari` | `KANJIDIC_MATCH` | 6 / 6 | N2 / N2 | "lamp, light" / "lamp" |
| **洗** | `kj-arau` | `KANJIDIC_MATCH` | 9 / 9 | N3 / N4 | "wash" / "wash" |
| **汗** | `kj-ase` | `KANJIDIC_MATCH` | 6 / 6 | N2 / N2 | "sweat" / "sweat" |
| **茶** | `kj-cha` | `KANJIDIC_MATCH` | 9 / 9 | N4 / N4 | "tea" / "tea" |
| **電** | `kj-den` | `KANJIDIC_MATCH` | 13 / 13 | N5 / N5 | "electricity" / "electricity" |
| **語** | `kj-go` | `KANJIDIC_MATCH` | 14 / 14 | N5 / N5 | "language, speak" / "word" |
| **箱** | `kj-hako` | `KANJIDIC_MATCH` | 15 / 15 | N3 / N2 | "box" / "box" |
| **花** | `kj-hana` | `KANJIDIC_MATCH` | 7 / 7 | N5 / N5 | "flower" / "flower" |
| **箸** | `kj-hashi` | `KANJIDIC_CONFLICT` | 14 / 15 | N4 / NONE | "chopsticks" / "chopsticks" |
| **走** | `kj-hashiru` | `KANJIDIC_MATCH` | 7 / 7 | N4 / N4 | "run" / "run" |
| **林** | `kj-hayashi` | `KANJIDIC_MATCH` | 8 / 8 | N5 / N4 | "woods, grove" / "grove" |
| **火** | `kj-hi` | `KANJIDIC_MATCH` | 4 / 4 | N5 / N5 | "fire" / "fire" |
| **息** | `kj-iki` | `KANJIDIC_MATCH` | 10 / 10 | N3 / N2 | "breath, son" / "breath" |
| **員** | `kj-in` | `KANJIDIC_MATCH` | 10 / 10 | N3 / N4 | "member, employee" / "employee" |
| **字** | `kj-ji` | `KANJIDIC_MATCH` | 6 / 6 | N5 / N4 | "character, letter" / "character" |
| **買** | `kj-kau` | `KANJIDIC_MATCH` | 12 / 12 | N5 / N5 | "buy" / "buy" |
| **聞** | `kj-kiku` | `KANJIDIC_MATCH` | 14 / 14 | N5 / N5 | "hear, listen" / "hear" |
| **招** | `kj-maneku` | `KANJIDIC_MATCH` | 8 / 8 | N1 / N2 | "beckon, invite" / "beckon" |
| **待** | `kj-matsu` | `KANJIDIC_MATCH` | 9 / 9 | N4 / N4 | "wait" / "wait" |
| **明** | `kj-mei` | `KANJIDIC_MATCH` | 8 / 8 | N5 / N4 | "bright, clear" / "bright" |
| **見** | `kj-miru` | `KANJIDIC_MATCH` | 7 / 7 | N5 / N5 | "see, look" / "see" |
| **水** | `kj-mizu` | `KANJIDIC_MATCH` | 4 / 4 | N5 / N5 | "water" / "water" |
| **森** | `kj-mori` | `KANJIDIC_MATCH` | 12 / 12 | N5 / N4 | "forest" / "forest" |
| **持** | `kj-motsu` | `KANJIDIC_MATCH` | 9 / 9 | N4 / N4 | "hold, have" / "hold" |
| **男** | `kj-otoko` | `KANJIDIC_MATCH` | 7 / 7 | N5 / N5 | "man, male" / "male" |
| **室** | `kj-shitsu` | `KANJIDIC_MATCH` | 9 / 9 | N4 / N4 | "room" / "room" |
| **好** | `kj-suki` | `KANJIDIC_MATCH` | 6 / 6 | N4 / N4 | "like, fond of" / "fond" |
| **時** | `kj-toki` | `KANJIDIC_MATCH` | 10 / 10 | N5 / N5 | "time, hour" / "time" |
| **取** | `kj-toru` | `KANJIDIC_MATCH` | 8 / 8 | N3 / N2 | "take, get" / "take" |
| **峠** | `kj-touge` | `KANJIDIC_MATCH` | 9 / 9 | N1 / N1 | "mountain pass" / "mountain peak" |
| **海** | `kj-umi` | `KANJIDIC_MATCH` | 9 / 9 | N5 / N4 | "sea, ocean" / "sea" |
| **安** | `kj-yasui` | `KANJIDIC_MATCH` | 6 / 6 | N5 / N5 | "cheap, peaceful" / "relax" |
| **休** | `kj-yasumu` | `KANJIDIC_MATCH` | 6 / 6 | N5 / N5 | "rest, take a break" / "rest" |
| **雪** | `kj-yuki` | `KANJIDIC_MATCH` | 11 / 11 | N4 / N2 | "snow" / "snow" |

## 4. Expansion Eligibility
The 13063 entries classified as `MISSING_FROM_CANONICAL` constitute the future expansion corpus. All entries have verified Unicode scalars, classical radical mappings, stroke counts, and deterministic IDs ready for ingestion subject to explicit phase approval.

**Verdict:** `PASS — RECONCILIATION VERIFIED ZERO OVERWRITE RISK`