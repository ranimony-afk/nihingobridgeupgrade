# MOBILE DICTIONARY SEARCH — PRODUCTION STATUS GUARD

**Scope:** the single mobile dictionary read endpoint `GET /api/v1/mobile/dictionary/search`
(Gate A11 implementation, hardened by A12, decision-gated by A13).
**Nature of this document:** a *status declaration*. It changes **no runtime behaviour**, adds no
guard, no auth, no limiter and no feature flag. It exists so that a merge, a deployment and a public
exposure can be judged separately instead of being conflated.

---

```text
MOBILE DICTIONARY SEARCH PRODUCTION STATUS

Endpoint:
GET /api/v1/mobile/dictionary/search

Status:
MERGEABLE: YES
DEPLOYABLE TO NON-PRODUCTION: YES
PUBLIC PRODUCTION EXPOSURE: NO

Reason:
D-13 rate limiting / abuse protection has not been approved.

Required before public exposure:
- deployment-layer abuse protection
- documented request threshold
- documented failure behavior
- monitoring/alerting
- rollback procedure
```

## 1. Why these three verdicts differ

| Verdict | Basis |
| :--- | :--- |
| **MERGEABLE: YES** | The implementation is complete for its frozen contract, leak-free under a 17-term audit, **byte-stable** with respect to `targetLanguage`, bounded at its input cap, covered by 64 DB-free + 9 live tests, typechecked, lint-clean and building. D-13 was recorded as a *deployment condition*, not an implementation defect — merging the code and exposing the endpoint are different decisions. |
| **DEPLOYABLE TO NON-PRODUCTION: YES** | Nothing in the code requires a production database, a secret, an env flag or a network egress. It runs against a loopback PostgreSQL instance and degrades to a safe `500 INTERNAL_ERROR` with no internal detail when the database is unavailable. |
| **PUBLIC PRODUCTION EXPOSURE: NO** | The endpoint is public, unauthenticated and performs an unbounded-cost-per-request `ILIKE` scan. Measured worst case on a 100 030-row corpus: **9.1 s** of database work for a 1 000-character query and **17.1 s** for 1 000 wildcard characters, paid as two scans per request. The `q` cap bounds a single request's work; it is **not** abuse protection, and no limiter exists in the application. |

`DEPLOYABLE TO NON-PRODUCTION: YES` is **not** a weaker way of saying "safe to expose". It means: a
preview/CI/staging environment that is not publicly reachable may host this build.

## 2. What is deliberately absent from the code

There is no in-process rate limiter, no IP store, no Redis, no auth, no feature flag and no
`middleware.ts`. This is intentional: an in-process limiter is ineffective on multi-instance hosting
while *appearing* to be protection, and inventing one would have made the endpoint look defended
without being defended. Contract §A12.7 records the delegation; A13 §16 and A13 §28 supply the
measured residual cost and the proposed thresholds. **No code in this repository claims production
protection.**

## 3. Required before public exposure (owner: deployment/platform)

| # | Requirement | Measurable form |
| :-: | :--- | :--- |
| 1 | Deployment-layer abuse protection | enforced at the edge/proxy, not in-process |
| 2 | Documented request threshold | a concurrency cap and a per-client rate, both published |
| 3 | Documented failure behaviour | over-limit answers `429` with `Retry-After`, before the route runs, never a partial payload; the limiter must fail **closed** |
| 4 | Monitoring / alerting | alert on sustained cap-length `q` and on sustained 17 s-class service times |
| 5 | Rollback procedure | a documented, rehearsed way to withdraw public exposure |

Additional thresholds (T1–T6) proposed by A13 §28 remain **unaccepted**; they become binding only if
the deployment gate adopts them.

## 4. Measurement ledger (documentation-number reconciliation)

Successive gates measured different totals as tests were added. Only the newest measured state is
current; every earlier figure is historical and must be labelled as such.

| Measurement point | Files | Executed | Failed | Skipped | Total |
| :--- | --: | --: | --: | --: | --: |
| A11 close | 56 | 1 124 | 0 | 55 | 1 179 |
| A12 first pass | 56 | 1 130 | 0 | 55 | 1 185 |
| **A12 third issuance** (the figure quoted in the release brief) | 56 | **1 137** | 0 | 55 | **1 192** |
| A12 fifth issuance | 56 | 1 141 | 0 | 55 | 1 196 |
| **A13 / current HEAD of this work** | 56 | **1 148** | 0 | 55 | **1 203** |

* `1 122 / 1 177` and `1 124 / 1 179` are **superseded historical measurements** — never to be quoted
  as the current state.
* `1 137 / 1 192` is authoritative **for the A12-third-issuance state only**. The release brief's
  figure is therefore correct as a historical record, not as the current status: A12's fifth issuance
  added four tests and A13 added seven more of its own.
* Arithmetic: `1 203 − 55 = 1 148`; `1 196 + 7 = 1 203`; `1 141 + 7 = 1 148`.

**Test-group bookkeeping in the modified DB-free suite** (the textual `it(` count undercounts because
tests are registered inside loops; the executed Vitest count is authoritative):

| State | Executed in `tests/mobile-dictionary-search-api.test.ts` | Groups |
| :--- | --: | :--- |
| A12 third issuance | 55 | 42 A11 + 13 A12 |
| Current | **64** | 42 A11 + 17 A12 + 5 A13 |

The live suite (`tests/mobile-dictionary-search-api-live.test.ts`) executes **9** (7 A11 + 2 A13).

## 5. CI status — recorded honestly

`CI: NOT GREEN FOR THIS BRANCH, FOR REASONS OUTSIDE THIS SLICE.` Every recent CI run fails, including
runs on `main` itself (most recent main run `35964546020`, conclusion `failure`). The failing step is
`Test (P3/P4 — real Vitest run against PostgreSQL)`; `Typecheck`, `Lint` and `Production build` never
execute because the job stops there. The failing assertions, read from the check-run annotations:

| Failing test | Message |
| :--- | :--- |
| `tests/full-jmdict-ingestion.test.ts` | `SOURCE FILE MISSING: data/JMdict.xml not found`; `expected +0 to be 206717` |
| `tests/dictionary-architecture.test.ts:48` | `expected +0 to be 206717` |
| `tests/dry-run-jmdict.test.ts:11` | `expected false to be true` |
| `tests/kanji-expansion.test.ts:74` | `expected 11 to be 12` |

Two root causes, both pre-existing on `main` and both outside the mobile dictionary surface:

1. **JMdict corpus bytes are absent in the runner.** The archives are LFS-hosted and the media hosts
   are unreachable from this environment (the same condition that leaves 14.5A blocked). Locally the
   equivalent tests skip with an explicit reason (55 skips, 0 failures); in CI they execute and fail.
2. **A kanji-count assertion** (`11` vs `12`) fails on `main` independently of the dictionary work.

Consequence for the PR: the acceptance criterion *"CI passes on PR branch"* **cannot be satisfied
today** without either supplying the corpus bytes to CI (ingestion is not authorized for this gate) or
weakening those tests (never permitted). **PR merge-readiness is therefore NO under the stated gate**,
and this is a property of `main`, not of this change.

## 6. What this document does not do

It does not change the frozen API contract (the contract's §A12.7 and §A13.4 already state that the
endpoint is not approved for production exposure). It does not add, remove or alter any payload field,
route, header, status code or limit. It is documentation only, and it is intentionally separate from
the contract so that the contract stays a pure description of the wire format.
