# Testing

Four layers, each answering a different question. A test belongs in the
cheapest layer that can prove the behaviour.

| Layer | Location | Needs | Answers |
|---|---|---|---|
| **Unit** | `tests/unit/` | nothing | Is this function correct? |
| **Integration** | `tests/integration/` | PostgreSQL | Do we talk to the database correctly? |
| **API** | `tests/api/` | running server | Does the HTTP contract hold? |
| **E2E** | `tests/e2e/` | running server + browser | Does it work for a user? |
| **Smoke** | `tests/smoke/` | server + PostgreSQL | Is this deployment alive? |

Smoke is not a fifth layer — it is a fast subset spanning all three tiers,
used as the deployment gate.

---

## Commands

```bash
npm test                 # unit + integration (fast, no server)
npm run test:unit        # pure functions only
npm run test:integration # real PostgreSQL
npm run test:api         # builds, starts server, runs API tests, stops server
npm run test:smoke       # the deployment gate
npm run test:server      # api + smoke in one server session
npm run test:all         # everything except the browser layer

npm run test:e2e:install # once: download Chromium (~150MB)
npm run test:e2e         # browser end-to-end

npm run verify           # structure → env → lint → typecheck → test:all
```

---

## Runners

**`node:test`** powers unit, integration, API, and smoke. Node 22 executes
TypeScript natively, so these layers need **no test dependency** — no Jest,
no Vitest, nothing to keep in step with the bundler.

**Playwright** powers the browser layer only, where a real engine is the
point.

---

## Server lifecycle

Test files never spawn servers. `scripts/run-server-tests.mjs` owns the
lifecycle — one place, so a crashed suite cannot orphan a process:

1. build if `.next/BUILD_ID` is missing
2. bind port `0` to obtain a free port (no fixed-port collisions)
3. start `next start`
4. poll `/api/health` until it answers
5. run the suites with `NB_TEST_BASE_URL` set
6. `SIGTERM`, then `SIGKILL` after a grace period — in a `finally`, and on `SIGINT`

Tests read the URL via `tests/helpers/env.ts`. Run a server-backed file
directly and it fails with instructions instead of hanging.

Playwright manages its own server through the `webServer` option, and reuses
an existing one when `NB_TEST_BASE_URL` is already set.

---

## Why the browser layer is not in the gate

`npm run verify` must be hermetic. Browser binaries are a ~150MB prerequisite
a clean runner may not have, and a gate that fails on a missing download
teaches people to ignore it. The browser layer is therefore explicit and
opt-in; the smoke layer guarantees the deployment is serving traffic without
it.

---

## Conventions

- `*.test.ts` for `node:test`, `*.spec.ts` for Playwright. The globs cannot
  collide, so neither runner picks up the other's files.
- Name a test after the behaviour it protects, not the function it calls.
- Assert on observable behaviour — status codes, bodies, headers, rendered
  text — not on internals.
- Integration tests use temporary tables and transactions, and leave no
  residue.
- Never weaken a test to make it pass. If a test fails, either the code is
  wrong or the test encodes the wrong expectation; decide which, and say so.

---

## Adding a layer for a new domain

When a phase introduces a domain, add tests in this order:

1. **Unit** for pure rules (scheduling maths, grading, validation).
2. **Integration** for the repository against real tables.
3. **API** for the route contract: success shape, error codes, authorization.
4. **E2E** only for journeys a user actually performs.

Extend `tests/smoke/` only when a new tier becomes critical to "is this
deployment alive" — it must stay fast.
