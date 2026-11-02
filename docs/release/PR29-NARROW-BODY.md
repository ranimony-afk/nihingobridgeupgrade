## What this PR is

**Narrow scope: remove request-time lazy seeding of canonical dictionary/Kanji data.**

This is the original `c52ea82` change, unchanged. It is the content that PR #29 carried before the
provisioning work was stacked on top of it; the provisioning implementation now lives in a separate,
dependent PR.

## What changes

- Every lazy `await this.ensureSeeded()` call in `KnowledgeService` read methods is removed. The
  seeder still exists — it is a bootstrap operation, not a read helper.
- `/api/ai/retrieve` no longer imports the Kanji knowledge service at all; only the
  non-canonical corpus bootstrap remains there.
- `JLPTKnowledgeService.ensureInitialized()` no longer reaches the canonical Kanji seeder.
- The only remaining production caller is the explicit, target-classified
  `seedDictionaryFixturesForDisposableDatabase()` (`src/services/dictionary/fixtureSetup.ts`), which
  refuses `NODE_ENV=production` and requires an explicitly classified disposable database.
- `tests/kanji-read-path-write-isolation.test.ts` (new) proves it three ways, database-free:
  static invariant, behavioural recording proxy over `@/db`, and boundary checks on the bootstrap.

## Why

An anonymous `GET` could seed `kanji_radicals` / `kanji_entries` / `kanji_composition` into whatever
database `DATABASE_URL` named, because the only precondition was "`kana_entries` is empty" — database
state, not authority. See `reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md` and
`reports/security/READ-PATH-CANONICAL-WRITE-REMOVAL.md`.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx eslint .` | 0 errors (3 pre-existing warnings) |
| `npm run build` | pass |
| `tests/kanji-read-path-write-isolation.test.ts` | 11/11 |
| CI on `c52ea82` | run `41186657480` SUCCESS |

## Compatibility

Merges cleanly with PR #27 (canonical write denial): `git merge-tree` of the two heads produced the
identical tree in both orders. Combined-tree CI is run and reported in the dependent provisioning PR.

## Not in this PR

- No provisioning CLI, no operator workflow, no dataset-state model, no `knowledgeService`
  bootstrap-guard change. Those are in the stacked provisioning PR.
- No merge, no deployment, no production access.
