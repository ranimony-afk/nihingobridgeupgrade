# M2 — Kanji MindTree Vertical Slice: Implementation and Verification

**Date:** 2026-10-29
**Outcome:** **PASS WITH CONDITIONS** — bounded, locally renderable source-backed structure and learner route implemented; full dictionary verification, production build, database integration, and full-corpus coverage remain out of scope.

## 1. Foundation and implementation decision

The preflight was completed before edits, preserving the existing four untracked M1/M1-C files. The foundation was classified **PARTIAL REBUILD**: keep the 33-row first-party catalog, existing dictionary/MindTree routes and services, M1 structural-evidence contract, and SRS/lexical safeguards; add an isolated static KanjiVG adapter and a local learner route because the historical source artifacts were absent and the existing detail route is database-backed.

Implemented:

- `/mindtree` catalog and `/mindtree/[character]` character explorer, linked from the global navigation and existing Kanji pages;
- source SVG path rendering and keyboard-operable annotated occurrence selection/highlighting;
- source annotation details, first-party reading/meaning/examples, separately declared first-party radical note, explicitly non-etymological memory aid, bounded related characters, and provenance/hashes;
- a graceful unsupported-character state with no generated facts;
- a deterministic, dependency-free source adapter/generator plus source-derived artifact and attribution notice;
- focused adapter/catalog tests.

Two existing first-party mnemonic wordings (男 and 箸) were revised to remove unsupported historical narration while keeping them clearly in the memory-aid lane. No first-party seed row was reclassified as upstream truth.

No database schema, migration, persistence, SRS write, editorial workflow, authentication, production configuration, or package manifest changes were made.

## 2. Upstream acquisition and verification

- **Source:** official KanjiVG repository, tag `r20240807`, commit `a4b51d966d832544c371d566f9c84174e4beff3b`.
- **Archive:** `https://codeload.github.com/KanjiVG/kanjivg/tar.gz/refs/tags/r20240807`.
- **Observed archive:** 6,403,118 bytes; SHA-256 `a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd`. It matches the tracked historical Phase 14.4D archive digest.
- **License evidence:** inspected the pinned archive's README and COPYING; CC BY-SA 3.0, copyright Ulrich Apel, with the KanjiVG site requested for attribution. The derived slice is separately identified under that license in `src/data/kanji-mindtree/NOTICE.md`. This is not a legal clearance opinion.
- **Bounded input:** 33/33 exact primary SVGs for the current first-party character set. Raw source files and the full archive are not in Git; transient acquisition is under `/tmp/nihongobridge-upstreams/`.
- **Generated slice:** `src/data/kanji-mindtree/kanjivg-structure-slice.json`, 304,441 bytes, SHA-256 `554ef63b3d4bac29475e9b477f673c4275c14f8ef881dd05c8a8f1967946266c`; 33 glyphs, 307 paths, 157 source group records, 111 component occurrences, 248 structural nodes, and 222 typed edges. It contains all 33 observed raw SVG SHA-256 digests. For every record, the graph's declared source digest equals its observed `sourceFileSha256` value.
- **Reproducibility:** the generator re-hashed the archive, byte-compared each selected extracted file with that exact tar member, re-parsed it, validated each graph against its source/version/license/transform/digest pins, and regenerated a byte-identical JSON artifact. Result: **PASS**, same 304,441 bytes and digest above.
- The evidence graph represents literal visual group annotations only. `kvg:radical` and `kvg:phon` are shown as source annotations, not promoted to canonical radical/phonetic/semantic claims. Shared component identities are labeled as bounded source-annotation overlap, not etymology or semantic relation.

Research findings and license dispositions for the relevant listed repositories are in `docs/research/JAPANESE-UPSTREAM-RESOURCE-REGISTER.md`. In particular, no CJKVI IDS, CHISE, KANJIDIC2, JMdict, Tatoeba, Kanji alive, WaniKani, or third-party mnemonic data were copied. The register records the unresolved KANJIDIC2 CC BY-SA 3.0 versus 4.0 notice discrepancy; neither version is relied upon by this artifact.

## 3. Verification results

| Check | Result | Exact scope / notes |
|---|---|---|
| Locked dependency install | **PASS** | `npm ci --ignore-scripts --no-audit --no-fund`; existing lockfile only; no manifest changes. |
| TypeScript | **PASS** | `npm run typecheck` (`tsc --noEmit`). The M1 graph validator received a narrow explicit discriminant guard so TypeScript can prove the existing node-kind union; no contract behavior was broadened. |
| New vertical-slice tests | **PASS** | `npx vitest run --config /tmp/kanji-mindtree-vitest.config.mjs tests/kanji-mindtree-product.test.ts`: 1 file, 6 tests passed. The temporary config sets `setupFiles: []` so the DB-oriented `tests/setup.ts` and `.env` are not loaded. |
| M1 structural-contract tests | **PASS** | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/kanji-mindtree-contract.test.mjs`: 21 passed, 0 failed. |
| ESLint | **PASS** | `npx eslint` over the changed route, component, adapter, generator, catalog, seed, M1 contract, and focused test files. |
| Deterministic rebuild | **PASS** | `node --import tsx scripts/build-kanji-mindtree-slice.ts --archive /tmp/nihongobridge-upstreams/kanjivg-r20240807.tar.gz --source-dir /tmp/nihongobridge-upstreams/kanjivg-r20240807/kanji --out /tmp/kanjivg-structure-slice-final.json`; byte comparison with the checked-in slice passed. |
| Local route smoke | **PASS** | With Next dev bound to `0.0.0.0:3000`: `GET /mindtree` = 200; `GET /mindtree/%E6%98%8E` = 200 with source structure/meaning/memory-aid content; `GET /mindtree/%E9%BE%8D` = 200 with graceful unsupported notice. The supported and unsupported route responses were served without a database query. |
| Existing root route | **BLOCKED / unchanged** | The dev preview's initial `GET /` returned 500 because the existing home route queries the database and `DATABASE_URL` is absent. The database adapter threw “DATABASE_URL is required” before a connection; no production endpoint was contacted. The new `/mindtree` routes themselves returned 200. |
| Full `npm test` | **NOT RUN** | The repository's default test setup loads dotenv and documents real-PostgreSQL retrieval tests. To avoid `.env`/database access, only the isolated, DB-free tests above were run. |
| `npm run build` | **NOT RUN** | The full application includes build-time routes that may query the database; no local database was configured and no build was attempted. |
| Migrations / DB seed / production access | **NOT RUN / prohibited** | No DB connection, migration, seed script, production endpoint, or secret was accessed. |

The development server is available on port 3000 for the direct `/mindtree` route. The application root's pre-existing database dependency remains visible; it was not altered to mask the missing local database.

## 4. Worktree and delivery audit

- Branch: `arena/40788dd5-nihingobridgeupgrade` (active); HEAD remains `cf7a4c673236af2f507af8529dae0946fbed3bdf`.
- No staged changes, commit, push, force-push, amend, branch switch, PR, merge, deployment, or production access.
- `package.json` and `package-lock.json` remain unchanged. `npm ci` installed only locked dependencies.
- The full KanjiVG archive and extracted SVGs are transient `/tmp` files and are not Git paths. The bounded 304 KB source-derived data slice is the only acquired source payload in the worktree, and it has a separate notice.
- `.next/`, `node_modules/`, and `tsconfig.tsbuildinfo` are ignored local build/test output. `next-env.d.ts` was restored to its preflight contents after Next dev rewrote it.
- `git diff --check` and a separate trailing-whitespace/final-newline scan for untracked text files: **PASS**.
- Existing M1/M1-C untracked files were preserved; no staging was used.

## 5. Remaining limitations

1. First-party meaning, reading, radical selection, vocabulary and mnemonic content have not been independently verified against KANJIDIC2/JMdict or editorial review; the UI says so.
2. The source-file digest is an observed generation-time value. The original SVG bytes are intentionally not shipped, so runtime validation checks graph integrity and declared pins, not the original source host or linguistic correctness.
3. KanjiVG group labels do not prove canonical decomposition, historical derivation, semantic roles, or phonetic function.
4. The pilot covers 33 characters, not the whole corpus. No AI draft overlay, new lexical import, SRS action, or persistence path was added.
5. Legal status and the practical share-alike treatment of downstream distribution should receive appropriate review before production distribution; this register is not legal advice.
