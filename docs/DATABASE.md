# Database and migrations

One PostgreSQL database, one schema file, one migration chain
(`docs/architecture/DATABASE_OWNERSHIP.md`).

---

## Commands

```bash
npm run db:generate        # diff schema.ts → a new SQL migration
npm run db:migrate         # apply pending migrations
npm run db:status          # show applied vs pending
npm run db:test-migrations # gate: clean apply to empty + test databases
npm run db:studio          # browse data
```

`npm run verify` runs `db:test-migrations`, so a broken migration fails the
build rather than the deploy.

---

## Migrations, not push

`drizzle-kit push` diffs a live database against `schema.ts` and invents
whatever DDL closes the gap. That is useful while sketching and unacceptable
in production: it leaves no history, cannot be reviewed before it runs, and
will happily drop a column to make the shapes match.

Migrations are files. They are committed, reviewed, applied in order, and
recorded in `drizzle.__drizzle_migrations`.

`push` remains available as `db:push:unsafe` for local experiments. The name
is the warning. Never run it against a database anyone else uses.

### Workflow

1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — inspect the generated SQL. If it contains a `DROP`
   you did not intend, stop and rewrite the change as additive.
3. `npm run db:test-migrations` — proves it applies to an empty database.
4. `npm run db:migrate` — apply locally.
5. Commit the schema change **and** the generated SQL together.

### Data migrations

`drizzle-kit generate --custom --name <description>` creates an empty file for
hand-written SQL. Use it when a schema change needs existing rows fixed up —
for example `0002_backfill_profiles_preferences.sql`, which gives every
pre-existing user the profile and preferences rows the application assumes.

Write data migrations to be idempotent (`WHERE NOT EXISTS`), so a retry after a
partial failure is safe.

### Rollback

drizzle-kit generates forward SQL only. Every migration therefore has a
hand-written partner:

```
drizzle/0003_knowledge_schema.sql              forward
drizzle/rollback/0003_knowledge_schema.down.sql   back
```

Each down script declares its own safety metadata in a header comment:

```sql
-- @reversible: yes
-- @drops-data: knowledge tables (re-importable from source via ETL)
```

```bash
npm run db:status                    # shows which migrations are reversible
npm run db:rollback -- --yes         # roll back the most recent
node scripts/migrate.mjs --rollback --to 0001_profiles_and_preferences --yes
node scripts/migrate.mjs --rollback --all --yes
```

The runner refuses to proceed when:

- a down script is missing;
- the migration is declared `@reversible: no`;
- `--yes` was not passed.

Before running, it prints the plan and the **row count in every table it will
drop**, so the cost is visible rather than discovered afterwards.

`DATABASE_OWNERSHIP` forbids `DROP` without an authorising decision. A
reviewed down script *is* that authorisation, written and read at review time
rather than improvised during an incident — which is when improvising is worst.

#### Irreversible migrations

`0002_backfill_profiles_preferences` is declared irreversible, and the runner
refuses it. A mechanical rollback would delete profile and preference rows,
but learners have since edited them: there is no way to tell "row we
backfilled and nobody touched" from "row we backfilled and the learner then
configured".

Declaring that honestly is the correct answer. Rolling back past it means
rolling back `0001`, which drops the tables outright — a decision an operator
makes deliberately, not one a script makes for them.

#### What "verified" means here

`npm run db:test-migrations` does not just apply migrations. For each
database it:

1. applies the full chain to an empty database;
2. verifies tables, constraints, enums, indexes and the `pg_trgm` extension;
3. exercises the constraints with real inserts;
4. takes a **schema fingerprint** — every column, constraint, index and enum
   label, canonically ordered and SHA-256 hashed;
5. rolls the chain back and asserts nothing is left behind;
6. re-applies and asserts the fingerprint is **byte-identical**.

Step 6 is the real test. A rollback that leaves an orphaned enum, index, or
constraint changes the hash and fails the gate. It also proves the forward
chain is deterministic.

### Adopting migrations on a database built with push

```bash
node scripts/migrate.mjs --baseline 0000_identity_baseline
npm run db:migrate
```

`--baseline` records a migration as applied **without executing it**, for
objects that already exist. This is how the development database moved onto
migrations with no data loss — the alternative would have been dropping and
recreating live tables.

---

## Conventions

| Concern | Rule |
|---|---|
| Primary keys | application-generated `text`; imported rows use a deterministic id from `(source, sourceId)` |
| Timestamps | `timestamptz`, `created_at` + `updated_at` |
| JLPT levels | `smallint`, **5 = N5 … 1 = N1**, enforced by a check constraint |
| Destructive DDL | `DROP` / `TRUNCATE` require an authorising decision record |
| Extensions | `pg_trgm` will be required for search; `pgcrypto` is deliberately **not** a dependency |
| 1:1 tables | created in the same transaction as the parent row, and backfilled for existing rows |

Constraints belong in the database as well as the application. A check
constraint on JLPT levels means a bad write fails loudly at the source instead
of quietly corrupting level filtering for everyone downstream.

---

## Identity schema

| Table | Holds | Notes |
|---|---|---|
| `identity_users` | email, display name, status | unique on `lower(email)` |
| `identity_credentials` | scrypt password digest | separate table so a user row never carries a hash |
| `identity_sessions` | SHA-256 token digest, expiry, revocation | opaque tokens; revocation is immediate |
| `identity_user_roles` | role grants | ranked learner → super_admin |
| `identity_profiles` | timezone, locale, JLPT target, visibility | 1:1; timezone drives streak day boundaries |
| `identity_preferences` | theme, furigana mode, study limits, notifications | 1:1; every column `NOT NULL` with a default |

Everything cascades on user delete, so removing an account leaves nothing
behind.

### Why profile and preferences are separate tables

They have different lifecycles and privacy classes. A profile is
learner-editable and may be shown to other people; preferences are private,
change often, and are read on nearly every render. Splitting them keeps the
hot, private row small and lets the two be cached and authorised differently.

---

## Test databases

`npm run db:test-migrations` builds two databases from nothing:

- a throwaway scratch database, dropped afterwards
- `app_db_test`, kept for integration tests

Each one gets the full chain applied, its schema verified (tables, enums,
check constraints, cascade rules, the case-insensitive email index), its
constraints exercised with real inserts, and then the chain applied a second
time to prove re-running is a no-op.
