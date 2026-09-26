# Phase 14.4F-R — Security Remediation & Final Gate Report

**Report date:** 2026-09-26
**Phase:** 14.4F-R
**Acceptance:** Level A — mocked HTTP/service-contract acceptance
**Authoritative baseline:** `a7476cd94e1bb955a931848ca47548b96b3c1b2b`
**Branch:** `arena/01a0ddfd-nihingobridgeupgrade`
**HEAD / `origin/main`:** both remain `a7476cd94e1bb955a931848ca47548b96b3c1b2b`
**Working-tree state:** uncommitted changes; exact files are listed below. No commit was created.

## Scope and exclusions

This report closes only the bounded Level-A contract and its dependency-security remediation for these existing read-only routes:

1. `GET /api/dictionary/search`
2. `GET /api/dictionary/entry/[id]`
3. `GET /api/kanji/[character]/vocabulary`
4. `GET /api/kanji/[character]/readings`
5. `GET /api/kanji/[character]/components`

The completed route work retains existing service boundaries, validates bounded inputs, returns stable machine-readable errors, bounds list results, preserves best-effort dictionary graph enrichment, and has mocked route-contract tests.

Explicitly excluded: new UI/components; stroke-order or special-reading infrastructure; schema/migrations; canonical-data mutation; corpus acquisition/ingestion; search/index infrastructure; AI ranking; offline/mobile work; 14.5A/14.5B; and live corpus/provenance acceptance. No database configuration or data was changed.

## Security findings before remediation

Read-only inspection was performed before dependency changes. Environment: Node `v22.22.3`, npm `10.9.8`; `package-lock.json` lockfile v3. Direct versions were Next.js `16.2.6`, React `19.2.6`, and React-DOM `19.2.6`.

`npm audit --omit=dev --json` exited 1 and grouped **3 production dependency nodes** as **2 high and 1 critical**. This package-level count is not the number of individual advisories:

| Package / installed version | Directness and dependency path | Audit severity; affected ranges and advisory IDs | Reachability / notes |
|---|---|---|---|
| `next@16.2.6` | Direct production dependency (`node_modules/next`) | Aggregate critical. Audit listed GHSA-6gpp-xcg3-4w24, GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-p9j2-gv94-2wf4 (high, `>=16.0.0 <16.2.11`); GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-q8wf-6r8g-63ch, GHSA-955p-x3mx-jcvp (moderate, same range); and GHSA-p293-qw3h-jr36 plus GHSA-2xp9-vwfh-vxw4 (critical, `>=16.0.0 <16.3.3`). Independently checked the September 22 official advisory GHSA-vcvr-r3jv-pc5j, critical, `>=16.2.0 <16.3.6`, which was not included in that audit JSON. | Direct framework runtime and App Router are in use. Individual advisories have feature/deployment conditions (including Server Actions, Proxy/Turbopack, image optimization, or Windows); this review did not assume production deployment details or claim them unreachable. Official advisories and release notes identified patched releases; details below. |
| `postcss@8.4.31` | Transitive production dependency at `node_modules/next/node_modules/postcss` | Aggregate high; GHSA-qx2v-qp2m-jg93 (moderate, `<8.5.10`), GHSA-6g55-p6wh-862q (high, `<=8.5.11`), GHSA-fxqj-rqcc-2cmp (moderate, `<=8.5.22`), GHSA-r28c-9q8g-f849 (high, `<=8.5.17`). | Part of Next’s CSS processing dependency tree; attacker-controlled source-map input is a condition for the file-disclosure issues. Treated conservatively as production-relevant because it is in the production dependency graph. |
| `sharp@0.34.5` | Optional transitive production dependency of Next (`node_modules/sharp`) | Aggregate high; GHSA-f88m-g3jw-g9cj (`<0.35.0`) and GHSA-rgj7-g3m4-5g8c (`<0.35.4`). | Installed as Next’s optional image-optimization dependency. Image optimization can be requested; did not claim the library was unreachable merely because the source tree has no `next/image` import. |

The official Next.js August security release identifies the AVIF optimization RCE and Windows-hosted RCE and patches them in 16.3.3; the September 22 security update identifies GHSA-vcvr-r3jv-pc5j and patches it in 16.3.6. Sources: [August 2026 security release](https://nextjs.org/blog/august-2026-security-release), [September 22, 2026 security update](https://nextjs.org/blog/nextjs-security-update-september-22-2026), and [GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j). npm’s audit remediation metadata also named Next.js `16.3.6` as the non-major fix.

## Minimum remediation plan and performed change

| Package | Current | Vulnerable | Target | Reason |
|---|---:|---|---:|---|
| `next` | `16.2.6` | Yes; advisories above, including September advisory through `<16.3.6` | `16.3.6` | Smallest version consistent with the latest applicable official Next.js fix and npm’s suggested non-major fix. It also updates Next’s vulnerable transitive PostCSS and sharp dependencies. |

Only the direct exact Next.js version was changed in `package.json`; `package-lock.json` was regenerated for Next.js `16.3.6`, its SWC/helper packages, nested PostCSS `8.5.23`, and optional sharp `0.35.4` plus platform packages. React and React-DOM remain `19.2.6`. Registry metadata confirms Next.js 16.3.6 supports Node `>=20.9.0` and React/React-DOM `^18.2.0` or `^19.0.0`; this environment and project versions satisfy those constraints. No application compatibility edits were necessary. No force audit fix, unrelated upgrade, wholesale lockfile replacement, or dependency override was used.

## Security verification after remediation

- `npm audit --omit=dev --json` — **PASS**, exit 0; **0 production vulnerabilities** (0 critical, 0 high, 0 moderate, 0 low).
- `npm ls --omit=dev next postcss sharp react react-dom --all` confirms `next@16.3.6`, nested `postcss@8.5.23`, optional `sharp@0.35.4`, and unchanged React/React-DOM `19.2.6`.
- Full `npm audit --json` still exits 1 with **5 development-only findings** (0 critical, 1 high, 4 moderate). These are outside the production audit and were not changed under this bounded remediation:
  - `postcss@8.5.8` (direct dev dependency used by `@tailwindcss/postcss`): 1 high and 2 moderate advisories (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849; GHSA-qx2v-qp2m-jg93, GHSA-fxqj-rqcc-2cmp). The package-level high severity is from the source-map file-disclosure advisories; affected vulnerable ranges are as listed above. Audit metadata offers `postcss@8.5.28`. Disposition: development/build-tool dependency, not in `npm audit --omit=dev` or the production dependency tree; retain as a separate dev-dependency remediation item rather than broadening this runtime remediation.
  - `esbuild@0.18.20` nested under `@esbuild-kit/core-utils@3.3.2` → `@esbuild-kit/esm-loader@2.6.5` → direct dev dependency `drizzle-kit@0.31.10`: moderate GHSA-67mh-4wv8-2f99, affected `<=0.24.2`. The audit also reports the transitive `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, and `drizzle-kit` nodes at moderate severity through that same chain. Disposition: development-only database tooling; no database task was run and no production package path contains this chain. Remediation is separate because npm’s suggested `drizzle-kit@0.18.1` is a major-version change and unrelated to resolving the production gate.

These remaining dev-tool findings are explicitly disclosed and not represented as clean. They do not reintroduce any of the original production findings. No production exploitability claim is made for any advisory.

## Functional and build validation

Commands run after dependency installation:

- `npx vitest run tests/dictionary-kanji-experience-routes.test.ts` — **PASS**, 1 file, **60 passed, 0 failed, 0 skipped**, 1.50s reported duration on the pre-publication verification run. The suite uses mocked services. Vitest emitted an existing Vite config-loader warning.
- `npm run typecheck` — **PASS** (`tsc --noEmit`).
- `npm run lint` — **PASS**, 0 errors, 4 warnings in unrelated existing UI files: `src/app/dictionary/page.tsx`, `src/app/layout.tsx`, `src/app/question-bank/page.tsx`, and `src/app/review/session/[id]/page.tsx`.
- `npm run build` — **PASS** with Next.js `16.3.6`; production build compiled and generated routes successfully.
- `git diff --check` — **PASS**.

### Contract/security review

The existing Level-A route tests cover strict complete-integer parsing (including malformed partial numerics), bounds and query validation, invalid inputs not invoking services, Kanji path validation, machine-readable 400/404/500 behavior, empty results, service failures, result caps, and best-effort dictionary graph enrichment. The implemented Kanji check follows the application’s unified-ideograph model and accepts compatibility/supplementary-plane ideographs; route params are treated as already decoded. No production database, raw-input SQL, filesystem/path operation, mutation, secret/error-detail leakage, or unbounded result was added. No latency claim is made.

## Database, production, data, and provenance limits

**DATABASE REGRESSION: BLOCKED — LOCAL DATABASE UNAVAILABLE.** The earlier database-dependent regression suite was blocked by missing `DATABASE_URL` / local `127.0.0.1:5432`; it is not represented as passing. The required Level-A mocked route suite passed. No database was configured or contacted during this remediation.

**PRODUCTION: NOT CONTACTED.** No production command, database, or environment was used.

**SCHEMA: UNCHANGED.** No schema or migration changes.

KANJIDIC2 2023-08 vs 2024-03 and KanjiVG `r20240807` vs `0.99` remain unresolved historical 14.4E discrepancies; they are outside this gate and were not reconciled. No corpus, source bytes, live data, or provenance was validated.

> **Level A route-contract acceptance does not independently verify the underlying corpus, source bytes, live database state, or 14.4E provenance.**

## Pre-publication working-tree snapshot

Immediately before the separately authorized publication workflow, `HEAD` and `origin/main` were both `a7476cd94e1bb955a931848ca47548b96b3c1b2b`; the current branch was `arena/01a0ddfd-nihingobridgeupgrade`. At that verification snapshot, the worktree was intentionally **uncommitted** and contained the previously authorized route/helper/test changes, the dependency fix, and the gate reports only:

- `package.json`
- `package-lock.json`
- `src/app/api/dictionary/entry/[id]/route.ts`
- `src/app/api/dictionary/search/route.ts`
- `src/app/api/kanji/[character]/components/route.ts`
- `src/app/api/kanji/[character]/readings/route.ts`
- `src/app/api/kanji/[character]/vocabulary/route.ts`
- `src/lib/api/routeParams.ts`
- `tests/dictionary-kanji-experience-routes.test.ts`
- `reports/gates/PHASE-14.4F-R-FINAL-GATE.md` (previous checkpoint, marked superseded)
- `reports/gates/PHASE-14.4F-R-FINAL-GATE-REPORT.md` (this final report)

No schema/migration files changed. This report records the pre-publication snapshot; the commit SHA, pushed remote state, PR number, and CI results are reported after the authorized publication workflow. No merge is authorized.

## Final decision

**14.4F-R FINAL GATE: GO** for the explicitly bounded Level-A route-contract scope and production dependency-security gate: all original production HIGH/CRITICAL findings and their vulnerable production dependency paths are remediated at a supported non-major Next.js version; the production-only audit is clean; route tests, typecheck, lint, build, and diff check pass. Remaining development-tool audit findings are disclosed and dispositioned as outside the production dependency gate, not silently treated as fixed. Database-dependent regression, production correctness, 14.4E provenance, and corpus/source verification remain unaccepted/unverified.

**Publication status at report snapshot:** no PR had yet been created. The user subsequently authorized this commit → push → PR workflow in the session. Merge remains unauthorized; 14.5A and 14.5B remain unauthorized.
