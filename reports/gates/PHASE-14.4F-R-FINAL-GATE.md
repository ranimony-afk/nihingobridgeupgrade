# Phase 14.4F-R — Level A Route-Contract Final Gate (Historical Checkpoint)

> **Historical checkpoint only:** this report records the pre-remediation NO-GO state. It is superseded by [`PHASE-14.4F-R-FINAL-GATE-REPORT.md`](PHASE-14.4F-R-FINAL-GATE-REPORT.md), the current security-remediation and final-gate report.

**Phase:** 14.4F-R — Dictionary & Kanji Experience API gap closure
**Acceptance level:** Level A — mocked HTTP/service contract
**Baseline:** `a7476cd94e1bb955a931848ca47548b96b3c1b2b`
**Scope:** five existing PR #10 routes and shared route validation only

## Scope delivered

The five read-only route families remain in place:

1. `GET /api/dictionary/search`
2. `GET /api/dictionary/entry/[id]`
3. `GET /api/kanji/[character]/vocabulary`
4. `GET /api/kanji/[character]/readings`
5. `GET /api/kanji/[character]/components`

The contract hardening uses complete decimal integer parsing, retains the documented page bounds (limit 1–200, offset 0–100,000; dictionary service applies its own 100-item cap), rejects invalid numeric/filter input, caps dictionary search queries at 1,000 Unicode code points, and validates Kanji route values as one Unicode unified ideograph. The Unicode property accepts compatibility and supplementary-plane ideographs; route parameters are treated as already decoded and are not decoded a second time. Malformed/rejected route-parameter resolution maps to a 400 response.

Kanji vocabulary uses the service limit. Reading and component arrays are capped at 200 response items. Empty relationship collections are successful empty results; an absent dictionary entry is 404. Unknown reading filters are 400. Service failures return fixed machine-readable 500 envelopes without exception details. Dictionary-entry graph enrichment remains best-effort: failure does not suppress the canonical entry response. Special readings are not generated or inferred.

## Verification

Commands run:

- `npx vitest run tests/dictionary-kanji-experience-routes.test.ts` — **PASS**, 1 file, 60 passed, 0 failed, 0 skipped; 2.53s reported duration. Tests use mocked services.
- `npm run typecheck` — **PASS** (`tsc --noEmit`).
- `npm run lint` — **PASS**, 0 errors and 4 pre-existing warnings in unrelated UI files (`src/app/dictionary/page.tsx`, `src/app/layout.tsx`, `src/app/question-bank/page.tsx`, `src/app/review/session/[id]/page.tsx`).
- `npm run build` — **PASS**, Next.js production build compiled and generated static pages.
- Targeted neighboring service/architecture regression command: `npx vitest run tests/dictionary-ui.test.ts tests/dictionary-architecture.test.ts tests/kanji-expansion.test.ts tests/kanji-lexical-graph.test.ts` — **BLOCKED by unavailable local DB**, not a Level A contract failure: 21 tests failed, 12 passed, 13 skipped; dependent suites report missing `DATABASE_URL` / `127.0.0.1:5432`. No production or other database was contacted. No service implementation files were changed. The in-scope route regression is covered by the passing mocked route-contract suite.

`npm ci` was used to install the exact lockfile dependencies because dependencies were not installed initially. No dependency manifest or lockfile changes were made. It reported 7 audit advisories (4 moderate, 2 high, 1 critical). `npm audit --omit=dev --json` then reported 3 production dependency vulnerabilities (2 high, 1 critical), affecting Next.js `16.2.6` and transitive `postcss`/`sharp`; the audit lists Next.js `16.3.6` as a fix version. Dependency changes are outside this Level A authorization, so no upgrade or audit fix was made.

## Security and performance review

- Raw pagination is not passed through: numeric tokens must be complete integers; negative/invalid low values are rejected at route level, and valid over-limit values are clamped.
- Query size, list limits, offsets, and Kanji path shape are bounded/validated before service calls.
- Route errors use machine-readable envelopes; service exceptions are not returned to clients. No raw route error is logged with database details.
- Queries continue through existing service methods; no raw SQL construction, filesystem access, mutation, or new database-wide operation was introduced.
- **Security gate blocker:** production dependency audit found high/critical advisories in the existing Next.js runtime dependency tree. This is not caused by the route changes, but a full security PASS cannot be claimed while it remains unaddressed. Dependency remediation requires separate authorization.
- No latency benchmark is claimed. The checks establish bounded inputs/results only; database latency and corpus-scale behavior were not measured.

## Schema, data, and production

- No schema changes or migrations.
- No corpus was acquired or changed.
- No corpus bytes were validated.
- No production database was contacted.
- No live-data correctness was established.
- 14.4E source-version/count conflicts remain outside this gate.

> **Level A route-contract acceptance does not independently verify the underlying corpus, source bytes, live database state, or 14.4E provenance.**

## Final decision

**14.4F-R FINAL GATE: NO-GO.** The route-contract suite, typecheck, lint, and build pass. However, the mandatory security gate cannot pass while the production dependency audit reports high/critical vulnerabilities. Dependency remediation is outside this authorization and was not performed. The database-dependent historical regression suite also remains unverified because the authorized Level A environment does not include a disposable corpus/database. This NO-GO does not revalidate 14.4E, assert live-data correctness, or authorize production access or Phase 14.5A/14.5B.
