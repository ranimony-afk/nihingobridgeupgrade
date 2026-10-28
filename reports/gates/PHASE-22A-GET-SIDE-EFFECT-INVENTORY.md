# Phase 22A — Read-only GET side-effect inventory (secondary objective)

**Scope:** bounded, read-only inventory of application `GET` routes that may
initialize, seed, or otherwise mutate persistent state. Every verdict comes from
tracing the actual handler to the service method and then to the write — never
from judging a route by its name.

**Status:** COMPLETE. All 53 `GET` route handlers under `src/app` plus the
homepage server component are accounted for: **25 can seed or write**,
**29 are verified read-only**, **0 remain unresolved**.

**This document changes no code.** Phase 22A's implementation work is the
server-log disclosure fix; every route listed here is a *follow-up* item and
was deliberately not remediated in that change.

**Method:** every `route.ts` exporting `GET` was enumerated (53 files),
extracted at the handler level, its imported service modules resolved, and each
handler's service call traced down to an `ensureSeeded` / `ensureInitialized`
call or an `INSERT`/`UPDATE`/`DELETE`. Verdict vocabulary: `CONFIRMED`
(a write path is reachable from the GET), `NOT CONFIRMED` (positive evidence of
no write path), `UNRESOLVED` (not established — never guessed).

No database was contacted, no credential was read, and no production data
appears in this inventory.

---

## 1. Seeding and initialization primitives

Five entry points produce every side effect found on the read path:

| Primitive | Location | Effect |
|---|---|---|
| `TestService.ensureSeeded` | `src/services/jlpt/testService.ts:29` | Inserts `questions`, `jlpt_tests`, `jlpt_test_questions` when `questions` is empty |
| `KnowledgeService.ensureSeeded` | `src/services/knowledge/knowledgeService.ts:131` | Inserts kana, radicals, kanji, composition rows |
| `KnowledgeCorpusService.ensureSeeded` | `src/services/knowledge/corpusService.ts:80` | Inserts dictionary, grammar, sentence, source rows |
| `SrsService.ensureSeeded` | `src/services/srs/srsService.ts:141` | Inserts default SRS decks/cards |
| `XpService.syncRegistry` | `src/services/gamification/xpService.ts:38` | `INSERT … ON CONFLICT DO UPDATE` into `xp_rules` **on every call** |

`XpService.syncRegistry` is the only primitive that writes unconditionally even
when the target table is already correct. The other four are guarded by an
emptiness check and are therefore no-ops on a populated database — but they are
still reads that can write on a fresh or partially-provisioned instance.

Two aggregators fan these out:

- `AnalyticsService.ensureInitialized` (`analyticsService.ts:47`) runs
  `XpService.syncRegistry()` **and** `TestService.ensureSeeded()` in parallel.
- `JLPTKnowledgeService.ensureInitialized`
  (`src/services/jlpt/knowledge/jlptKnowledgeService.ts:49`) runs
  `KnowledgeCorpusService.ensureSeeded()`, `KnowledgeService.ensureSeeded()`
  and `TestService.ensureSeeded()`.

## 2. CONFIRMED — GET requests that can seed or write (25)

| # | Route | Handler | Traced path | Writes when populated? | Tests | Next action |
|---|---|---|---|---|---|---|
| 1 | `GET /api/ai/retrieve` | `api/ai/retrieve/route.ts:34` | Direct `KnowledgeCorpusService.ensureSeeded()` + `KnowledgeService.ensureSeeded()` | No | `knowledge-retrieval.test.ts` | **P1** — unit 22B-1 |
| 2 | `GET /api/quiz/analytics` | `api/quiz/analytics/route.ts:10` | Direct `TestService.ensureSeeded()` | No | none direct | **P1** — unit 22B-2 |
| 3 | `GET /api/questions` | `api/questions/route.ts` | `TestService.queryQuestions` (`:601`) → `ensureSeeded` | No | `questions-*.test.ts` | **P1** — unit 22B-2 |
| 4 | `GET /api/questions/[id]` | `api/questions/[id]/route.ts` | `TestService.getQuestionById` (`:671`) → `ensureSeeded` | No | `questions-*.test.ts` | **P1** — unit 22B-2 |
| 5 | `GET /api/jlpt/tests` | `api/jlpt/tests/route.ts` | `TestService.listTests` (`:122`) → `ensureSeeded` | No | `jlpt-integration.test.ts` (skips without DB) | **P1** — unit 22B-2 |
| 6 | `GET /api/jlpt/tests/[id]` | `api/jlpt/tests/[id]/route.ts` | `TestService.getTestById` (`:156`) → `ensureSeeded` | No | same | **P1** — unit 22B-2 |
| 7 | `GET /api/jlpt/session/[id]` | `api/jlpt/session/[id]/route.ts` | `TestService.getSessionState` (`:317`) → `ensureSeeded` | No | same | **P1** — unit 22B-2 |
| 8 | `GET /api/jlpt/session/[id]/results` | `api/jlpt/session/[id]/results/route.ts` | `TestService.getTestById` (`:156`) + `getSessionState` (`:317`) | No | same | **P1** — unit 22B-2 |
| 9 | `GET /` (homepage) | `src/app/page.tsx` | `TestService.ensureSeeded()` + `listTests` | No | observed in `VERCEL-BUILD-RECOVERY-GATE.md` | **P1** — unit 22B-2 |
| 10 | `GET /api/jlpt/overview` | `api/jlpt/overview/route.ts:7` | `JLPTKnowledgeService.getLevelOverview` (`:60`) → `ensureInitialized` (`:49`) → 3 seeders | No | none direct | **P1** — unit 22B-4 |
| 11 | `GET /api/jlpt/progress` | `api/jlpt/progress/route.ts` | `JLPTKnowledgeService.getUserProgress` (`:153`) → `ensureInitialized` | No | none direct | **P1** — unit 22B-4 |
| 12 | `GET /api/analytics` | `api/analytics/route.ts:6` | `AnalyticsService.getUserProgressSummary` (`:89`) → `ensureInitialized` (`:47`) → `syncRegistry` + `ensureSeeded` | **Yes — `xp_rules` upsert on every request** | `analytics-progress.test.ts` (skips without DB) | **P0** — unit 22B-5 |
| 13 | `GET /api/xp` | `api/xp/route.ts` | `XpService.getSummary` (`:339`) → `syncRegistry` (`:340`) | **Yes — `xp_rules` upsert on every request** | none direct | **P0** — unit 22B-5 |
| 14 | `GET /api/kana` | `api/kana/route.ts:10` | `KnowledgeService.searchKana` (`:256`) / `getKanaChart` (`:207`) → `ensureSeeded` | No | none direct | **P1** — unit 22B-3 |
| 15 | `GET /api/kanji` | `api/kanji/route.ts:7` | `KnowledgeService.listKanji` (`:276`) / `listElements` (`:366`) → `ensureSeeded` | No | `dictionary-kanji-*` | **P1** — unit 22B-3 |
| 16 | `GET /api/kanji/[character]` | `api/kanji/[character]/route.ts` | `KnowledgeService.getKanjiDetail` (`:559`) → `ensureSeeded` | No | `kanji-detail-learning-experience.test.ts` | **P1** — unit 22B-3 |
| 17 | `GET /api/knowledge/srs` | `api/knowledge/srs/route.ts:12` | `KnowledgeService.getKnowledgeStats` (`:810`) → `ensureSeeded` | No | none direct | **P1** — unit 22B-3 |
| 18 | `GET /api/srs/decks` | `api/srs/decks/route.ts` | `SrsService.listDecks` (`:330`) → `ensureSeeded` | No | `srs-activation.test.ts` (skips without DB) | **P1** — unit 22B-6 |
| 19 | `GET /api/srs/decks/[id]` | `api/srs/decks/[id]/route.ts` | `SrsService.listDecks` (`:330`) / `previewDeckScheduler` (`:837`) | No | same | **P1** — unit 22B-6 |
| 20 | `GET /api/srs/cards` | `api/srs/cards/route.ts` | `SrsService.queryCards` (`:493`) → `ensureSeeded` | No | same | **P1** — unit 22B-6 |
| 21 | `GET /api/srs/queue` | `api/srs/queue/route.ts` | `SrsService.getDueQueue` (`:534`) → `ensureSeeded` | No | same | **P1** — unit 22B-6 |
| 22 | `GET /api/srs/stats` | `api/srs/stats/route.ts` | `SrsService.getStats` (`:710`) → `ensureSeeded` | No | same | **P1** — unit 22B-6 |
| 23 | `GET /api/srs/sessions` | `api/srs/sessions/route.ts` | `SessionService.listSessions` (`:742`) → `ensureSeeded` | No | same | **P1** — unit 22B-6 |
| 24 | `GET /api/srs/sync` | `api/srs/sync/route.ts` | `SyncService.getStatus` (`:749`) → `SrsService.ensureSeeded` (`:750`) | No | same | **P1** — unit 22B-6 |
| 25 | `GET /api/srs/sync/pull` | `api/srs/sync/pull/route.ts` | `SyncService.pull` (`:578`) → `SrsService.ensureSeeded` (`:585`) | No | same | **P1** — unit 22B-6 |

## 3. NOT CONFIRMED — verified read-only (29)

| Route | Evidence |
|---|---|
| `GET /api/ai/answer` | Handler body is `return methodNotAllowed()`; no service call |
| `GET /api/health` | No service import |
| `GET /auth/callback` | Session exchange only; no first-party service write |
| `GET /api/search` | `UnifiedSearchService.search`; zero `insert`/`update`/`delete`/`ensure*` in the service file, plus the full schema/row fingerprint suite `tests/unified-search.test.ts` (PR #19) |
| `GET /api/dictionary` | `DictionaryService.searchEntries` / `autocomplete`; service has zero `insert`/`update`/`delete`, and `ensureInitialized` (`:84`) has no caller outside fixtures |
| `GET /api/dictionary/search` | `searchEntries` — same |
| `GET /api/dictionary/[id]` | `getEntryDetail` — same |
| `GET /api/dictionary/entry/[id]` | `getEntryDetail` + `kanjiLexicalGraphService` reads; no writes in either service |
| `GET /api/v1/mobile/dictionary/search` | `DictionaryService.searchEntries` — same |
| `GET /api/kanji/[character]/components` | `kanjiLexicalGraphService.getKanjiComponents` / `getKanjiRadicals`; service has no write call |
| `GET /api/kanji/[character]/readings` | `getKanjiReadings` — same |
| `GET /api/kanji/[character]/vocabulary` | `getKanjiVocabulary` — same |
| `GET /api/kanji/[character]/stroke-order` | `kanjiVisualService.renderStrokeOrderDiagram`; only write-adjacent call is an in-memory `assetCache.delete` |
| `GET /api/srs/settings` | `DailyQueueService.getSettings` (`:143`); returns `DEFAULT_DAILY_SETTINGS` when absent; the only `INSERT` is in `updateSettings` (`:164`, PATCH path) |
| `GET /api/srs/daily` | `getDailyQueue` (`:666`) → `getSettings` + private readers |
| `GET /api/srs/schedulers` | `SrsService.listAvailableSchedulers` is not one of the seven `ensureSeeded` call sites |
| `GET /api/srs/sessions/[id]` | `SessionService.getSessionState` (`:482`); only `planSession` (`:99`) and `listSessions` (`:742`) seed |
| `GET /api/srs/sessions/[id]/summary` | `SessionService.getSummary` (`:809`); same |
| `GET /api/srs/personal` | `PersonalizationService.getPersonalizedView` (`:776`); the only write in the service is `updatePrefs` (`:93`), reachable only from `PUT` (`api/srs/personal/route.ts:36`) |
| `GET /api/srs/personal/lifecycle` | `PersonalizationService.buildProfile` (`:171`); no write in body, no `SrsService` / seeder call |
| `GET /api/xp/ledger` | `XpService.getLedger` (`:502`) + `getTotalXp` (`:324`) are pure SELECTs; `syncRegistry` is not on this path |
| `GET /api/cms/dictionary` | `getCmsService().listItems` (`cmsService.ts:160`) — permission-gated `listContentItems` only |
| `GET /api/cms/dictionary/[id]` | `getItem` (`:134`) — `getContentItem` only |
| `GET /api/cms/dictionary/[id]/versions` | `getVersions` (`:142`) — `listContentVersions` only |
| `GET /api/cms/dictionary/[id]/audit` | `getAuditTrail` (`:149`) — `listAuditEvents` only |
| `GET /api/cms/translations` | `listItems` — as above |
| `GET /api/cms/translations/[id]` | `getItem` — as above |
| `GET /api/cms/translations/[id]/versions` | `getVersions` — as above |
| `GET /api/cms/translations/[id]/audit` | `getAuditTrail` — as above |

`CmsService`'s read methods are documented in-source as "Pure read: no state
machine, no versioning, no audit", the constructor performs no DDL, and
`createDrizzleCmsStore` issues no migration on construction. All eight CMS GETs
are therefore genuinely read-only.

**Accounting:** 24 `route.ts` GETs confirmed side-effecting + 29 verified
read-only = 53 = every `GET` route in `src/app`. The homepage
(`src/app/page.tsx`, #9) is a server component outside that set.

## 4. Prioritisation

| Priority | Finding | Bounded remediation unit |
|---|---|---|
| **P0** | `GET /api/xp` and `GET /api/analytics` upsert `xp_rules` **on every request**, even when the table is already correct: unbounded write amplification from an anonymous read | 22B-5 — move `syncRegistry` to an explicit startup/CLI step; acceptance test asserts a byte-identical `xp_rules` fingerprint across the GET |
| **P1** | 23 GET routes seed first-party fixtures on an anonymous read when the database is empty | 22B-1..22B-4, 22B-6 — one unit per service family; acceptance test = full schema/row fingerprint unchanged across the GET, reusing `tests/helpers/pglite-full-snapshot.ts` (PR #19) |
| **P2** | Cache/CDN behaviour in front of the P0 routes was not established | Audit-only; no code change until evidence exists |

## 5. Adjacent defect observed but **not** remediated here

While tracing handlers, 57 `console.error/warn(…, error)` sites were counted
across `src/app/api/**/route.ts` — each one has the same disclosure class that
Phase 22A fixed in `TestService.ensureSeeded` (raw driver error serialised into
the server log). Examples: `api/kana/route.ts:28`, `api/srs/personal/route.ts:25`.

These are **out of Phase 22A's scope** (the phase targeted the seeding error
path) and are recorded here as the natural Phase 22C candidate: apply
`logOperationFailure` consistently, one service family per PR. Do not widen
Phase 22A to cover them.

## 6. Notes

- The seeded content is *first-party fixture* data (`src/services/quiz/seedData.ts`,
  `src/data/*`), not attacker-controlled. The risk is unauthenticated write
  amplification and read-path reliability, not content injection.
- Seeding runs inside the request that triggered it, so a burst of anonymous
  GETs amplifies writes. This compounds with the absent rate limiting (D-13).
- The correct end state is the one PR #19 established for `/api/search`: a read
  path must not initialise. The fingerprint test pattern already exists — reuse
  it rather than inventing another.
- Public beta remains **BLOCKED**; this inventory does not change that.
