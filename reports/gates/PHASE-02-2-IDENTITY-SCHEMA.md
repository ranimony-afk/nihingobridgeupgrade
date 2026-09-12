# Phase 02.2 — Users, Profiles, Sessions, Roles, Preferences

**Date:** 2026-03-25
**Scope:** the five identity entities, delivered as reviewable migrations
**Gate status:** PASS

---

## Deployment gate: migration applies cleanly to an empty database and test database

```
npm run db:test-migrations
```

Two databases are built from nothing on every run:

| Target | Result |
|---|---|
| `nb_migrate_scratch_<ts>` — throwaway, dropped afterwards | 3 migrations applied clean |
| `app_db_test` — named test database, kept for integration tests | 3 migrations applied clean |

For each one the gate verifies **34 checks**: 6 tables, 6 enums, 5 check
constraints, the `lower(email)` unique index, 5 cascade rules, and 10
behavioural assertions that exercise the constraints with real inserts.

```
Migration gate passed: clean apply, correct schema, idempotent re-run.
```

The gate is wired into `npm run verify`, so a broken migration fails the build
rather than the deployment.

---

## The five entities

| Entity | Table | Status |
|---|---|---|
| Users | `identity_users` | 02.1, now migration-managed |
| Sessions | `identity_sessions` | 02.1, now migration-managed |
| Roles | `identity_user_roles` | 02.1, now migration-managed |
| **Profiles** | `identity_profiles` | **new** |
| **Preferences** | `identity_preferences` | **new** |

### Profiles

Timezone, locale, native language, JLPT target and current level, avatar, bio,
visibility. 1:1 with the user.

Timezone is required with a `UTC` default rather than inferred per request,
because `DOMAIN_OWNERSHIP` §8 specifies streaks are evaluated against the
learner's local day. Inferring it from a request header would make a learner's
streak depend on where they happened to open the app.

### Preferences

Theme, furigana mode, romaji visibility, reduced motion, sound, daily goal,
SRS new/review caps, email digest, review reminders.

Every column is `NOT NULL` with a default, so a client never has to render
against a half-configured account. Romaji defaults **off** — showing it by
default slows kana acquisition, which is the opposite of what a Japanese
learning platform should do.

### Why two tables rather than one

Different lifecycles and privacy classes. A profile is learner-editable and
may be shown to other people; preferences are private, change frequently, and
are read on nearly every render. Splitting them keeps the hot private row
small and lets the two be authorised and cached independently.

---

## Migrations established

This phase replaced `drizzle-kit push` with a reviewable migration chain.
`push` diffs a live database and invents whatever DDL closes the gap — no
history, no review, and it will drop a column to make shapes match.

| Migration | Contents |
|---|---|
| `0000_identity_baseline` | users, credentials, sessions, roles |
| `0001_profiles_and_preferences` | profiles, preferences, 3 enums, 5 check constraints |
| `0002_backfill_profiles_preferences` | hand-written data migration |

`push` survives only as `db:push:unsafe`. The name is the warning.

### Adopting migrations without data loss

The development database already had four tables created by `push`, 48 user
accounts, and no migration history. Running the baseline would have failed on
`already exists`; dropping and recreating would have destroyed the data and
required an authorising decision under the freeze.

Instead I added `--baseline`, which records a migration as applied **without
executing it**:

```
node scripts/migrate.mjs --baseline 0000_identity_baseline   # recorded, not run
npm run db:migrate                                           # applies 0001, 0002
```

Result: 48 users before, 48 users after, full history from here on. No
destructive DDL was needed, so no authorisation was required.

### The backfill nobody asks for until it breaks

Adding a 1:1 table leaves every pre-existing row without a partner. Those 48
accounts would have read `profile: null` forever, forcing a "might be missing"
branch into every consumer.

`0002` is a hand-written data migration that provisions the missing rows. It
is idempotent (`WHERE NOT EXISTS`), so a retry after partial failure is safe:

```
before:  48 users |  0 profiles |  0 preferences
after:   48 users | 48 profiles | 48 preferences
re-run:  "up to date" — no duplicates
```

It also avoids a dependency I nearly introduced by accident: my first draft
used `gen_random_bytes()`, which needs `pgcrypto`. That extension is not
installed and `DATABASE_OWNERSHIP` says it is deliberately not a dependency.
Switched to core `gen_random_uuid()`, which needs no extension and happens to
produce exactly the 32-hex-character format the application's `newId()` uses.

---

## Constraints live in the database

Five check constraints, not just TypeScript validation:

| Constraint | Enforces |
|---|---|
| `identity_profiles_target_level_check` | JLPT 1–5 or NULL |
| `identity_profiles_current_level_check` | JLPT 1–5 or NULL |
| `identity_preferences_daily_goal_check` | 1–1440 minutes |
| `identity_preferences_srs_new_check` | 0–500 new cards |
| `identity_preferences_srs_review_check` | 0–10000 reviews |

The JLPT constraints encode the frozen `5 = N5 … 1 = N1` decision at the
storage layer. Application code can be bypassed by a migration, an admin
script, or a future service; the constraint cannot. A bad write now fails
loudly at the source instead of quietly corrupting level filtering.

---

## Application wiring

Registration creates user, credential, roles, profile, and preferences **in
one transaction**, so a partially provisioned account cannot exist.

`GET /api/auth/session` now returns profile and preferences alongside the
user, so a client can render theme, furigana mode, and locale on first paint
without a second round trip or a flash of default styling.

---

## Test coverage

| Layer | Before | After |
|---|---|---|
| Unit | 89 | 89 |
| Integration | 11 | **20** (+9 schema) |
| API | 9 | 9 |
| Smoke | 27 | **29** (+2 provisioning) |
| Migration gate | — | **34 checks × 2 databases** |
| **Total** | 136 | **147 + gate** |

Integration tests assert against the real database, so they catch drift
between `schema.ts` and the SQL that was actually applied — including that no
user anywhere lacks a profile or preferences row.

---

## Files

| File | Purpose |
|---|---|
| `drizzle.config.ts` | replaces the JSON config; reads `DATABASE_URL` from env instead of hardcoding a DSN |
| `drizzle/0000…0002` | the migration chain plus snapshots |
| `scripts/migrate.mjs` | runner with `--status`, `--baseline`, `--url`; each migration atomic |
| `scripts/test-migrations.mjs` | the gate |
| `src/db/schema.ts` | profiles, preferences, 3 enums, 5 constraints, relations |
| `src/repositories/identity.ts` | transactional provisioning, accessors, partial updates |
| `docs/DATABASE.md` | migration workflow and conventions |

---

## Gate approval

- [x] Users, profiles, sessions, roles, preferences implemented
- [x] Delivered as reviewable, ordered migrations
- [x] **Applies cleanly to an empty database** (scratch, verified)
- [x] **Applies cleanly to a test database** (`app_db_test`, verified)
- [x] Idempotent — second run is a no-op
- [x] Existing data preserved (48 users, backfilled not recreated)
- [x] Zero destructive DDL
- [x] `npm run verify` passes end to end
- [x] **APPROVED**
