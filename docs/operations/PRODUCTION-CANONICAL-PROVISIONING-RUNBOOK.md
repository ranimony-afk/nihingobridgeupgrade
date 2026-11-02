# Production runbook — controlled canonical Kanji provisioning

Status: **design + tooling ready; execution is a separately authorized operator action.**
Nothing in this document authorizes a production write by itself.

Scope of the tool: `scripts/provision-kanji-corpus.ts`. It inserts the missing rows of
one first-party dataset (`kanji-corpus-pilot` by default). It never updates, deletes or
truncates a row, never runs migrations, and never touches `kana_entries`,
`dictionary_entries` or any non-canonical table.

---

## 1. What the gap is, precisely

| Dataset | Source of truth | Headwords | Elements | Composition edges | Written by |
|---|---|---:|---:|---:|---|
| `kanji-mindtree` | `src/data/kanji.ts` (`ELEMENTS` 30, `EXTRA_ELEMENTS` 235, `KANJI` 103, `COMPOSITION` 158) | 33 | 55 | 71 | `KnowledgeService.ensureSeeded()`, `knowledgeService.ts:180` |
| `kanji-corpus-pilot` | `src/etl/kanji/fixture.ts` (`PILOT_RADICALS` 10, `PILOT_KANJI_ENTRIES` 126) | 12 | 8 | 19 | nothing on a seeded production database |

A fully provisioned first-party foundation is therefore **45 headwords, 63 elements,
90 composition edges**. A database provisioned only by the bootstrap path holds
**33 / 55 / 71** — which is exactly the state the production counts reported
(208 kana, 33 kanji, 55 radicals, 71 composition, all `first-party:kanji-mindtree:v1`).

> The 12 headwords cannot be added on their own. Two of them (`kanji-road`,
> `kanji-new`) name a primary element (`el-shinnyou`, `el-kin`) that the Mind Tree
> dataset does not define, and 8 distinct elements are referenced by the 19 corpus
> composition edges. Inserting only `kanji_entries` would satisfy a row count while
> creating 12 headwords with dangling `primary_radical_id` values and no decomposition.
> The tool therefore provisions the dataset as one unit: 12 + 8 + 19.

---

## 2. Preconditions (all must be true)

1. **Approved change record** exists and states the exact target environment and the
   expected before/after counts (33/55/71 → 45/63/90). Its identifier is passed as
   `--approval-ref`.
2. **Named operator** — a human accountable for the run. Passed as `--operator`.
3. **Least-privilege database role.** The role used for the run must not be the
   application's runtime role. Minimum privileges:
   `SELECT, INSERT` on `kanji_radicals`, `kanji_entries`, `kanji_composition`;
   `SELECT` on `kana_entries`; and `SELECT` on `to_regclass` (default for public).
   It must **not** hold `UPDATE`, `DELETE`, `TRUNCATE`, `CREATE`, or ownership of the
   schema. Do **not** use a Supabase `service_role` key or any general admin credential.
4. **Backup / recovery expectation verified by the operator** — see §3. This runbook
   does not assert that a backup exists.
5. **Read-only preflight passed** (§4) against the exact target, with the flags recorded
   in the change record.

### 2.1 Preconditions this repository cannot verify for you

- Whether the deployed production schema matches `src/db/schema.ts`. The tool refuses to
  run when the canonical tables are absent, but it does not diff the full schema.
- Whether the target database has `UPDATE`/`DELETE` triggers, row-level security, or a
  connection pooler that rewrites transactions.
- Whether a point-in-time-recovery snapshot exists and when it was taken.

---

## 3. Backup and recovery expectations

No backup procedure is invented here, and no backup is claimed to exist.

The operator must establish, before writing:

1. The platform's PITR / snapshot window covering the run window (Supabase: database
   backups + PITR status in the project dashboard; self-managed: `pg_dump` of the four
   canonical tables or a base backup).
2. That a restore can be performed by someone other than the person running the
   provisioner, if the platform requires a support ticket.
3. That the backup was taken **after** the preflight counts in §4 and **before** the
   execute step — record its timestamp in the change record.

Recovery does not depend on the backup in the normal failure case: the tool is
single-transaction and rolls back on any failure (§6). The backup exists for the
abnormal case (operator error outside the tool, or a platform-side failure between the
commit and the post-commit verification).

---

## 4. Read-only preflight (no writes)

```bash
export DATABASE_URL='<least-privilege DSN — never paste into a ticket or chat>'
npx tsx scripts/provision-kanji-corpus.ts --mode=verify
```

Exit codes: `0` fully provisioned · `3` partially provisioned · `2` inconsistent ·
`4` undetermined/schema missing · `1` usage or connection error.

Expected output on the reported production state:

```
state: PARTIALLY_PROVISIONED
counts: kanji=33 elements=55 composition=71 kana=208
kanji provenance: {"first-party:kanji-mindtree:v1":33}
dataset kanji-mindtree: COMPLETE (present 33/33 kanji, 55/55 elements, 71/71 edges)
dataset kanji-corpus-pilot: EMPTY (present 0/12 kanji, 0/8 elements, 0/19 edges)
```

If the counts differ from the change record, **stop** and return to review: the
production state changed since it was approved.

The independent four-table check can also be run in the provider's SQL console:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT 'kana_entries' AS t, count(*) FROM kana_entries
UNION ALL SELECT 'kanji_entries', count(*) FROM kanji_entries
UNION ALL SELECT 'kanji_radicals', count(*) FROM kanji_radicals
UNION ALL SELECT 'kanji_composition', count(*) FROM kanji_composition;
SELECT source_ref, count(*) FROM kanji_entries GROUP BY 1 ORDER BY 1;
ROLLBACK;
```

---

## 5. Dry-run and approval checkpoint

```bash
npx tsx scripts/provision-kanji-corpus.ts --mode=dry-run
```

The dry-run opens no transaction and writes no row. It prints the exact ids/characters
that would be inserted, the already-present counts, the expected before/after counts,
and any blocker (content drift, unique-character collision, dangling reference).

**Approval checkpoint.** Attach the dry-run audit line to the change record and obtain
explicit approval. The dry-run output is the authorization artifact: the execute step
plans from live state again and refuses if anything differs.

---

## 6. Execute

```bash
npx tsx scripts/provision-kanji-corpus.ts --mode=execute \
  --accept-target-class=MANAGED \
  --confirm-target=<identityHash printed by verify/dry-run> \
  --operator="<full name>" \
  --approval-ref="<change record id>" \
  --audit-out=/secure/audit/canonical-provision-$(date -u +%Y%m%dT%H%M%SZ).json
```

`--accept-target-class` must equal the observed class (`LOCAL`, `REMOTE`, `MANAGED`).
`--confirm-target` must equal the full identity hash printed by the read-only step; it is
a sha256 over host/port/database/user and is the only target detail the tool ever emits.

Mechanics, in order, inside one transaction:

1. `BEGIN`
2. `pg_advisory_xact_lock(7416299504429250983)` — serializes concurrent operators.
3. Re-read all canonical rows and re-plan against live state.
4. Refuse on any blocker (no writes performed).
5. Verify the pre-write invariants, including the kana baseline (`--expected-kana`,
   default 208).
6. Insert only the missing rows: 8 elements → 12 headwords → 19 edges.
7. Re-read and validate: dataset complete, no duplicate ids/characters, no dangling
   composition edge, no dangling `primary_radical_id`, provenance present.
8. Prove untouched rows are byte-identical (sha256 over every pre-existing row that was
   not part of the plan).
9. `COMMIT` only if every check passes; `ROLLBACK` on any failure or exception.
10. Post-commit verification runs again in a read-only transaction.

### Safe abort conditions

Abort (Ctrl-C before the COMMIT, or let the tool refuse) if any of these appear:

- `REFUSED — PLAN_BLOCKED`: state differs from the canonical source. Nothing was written.
- `REFUSED — INVARIANTS_FAILED`: rolled back. Nothing was written.
- Counts different from the change record at step 3.
- Any `--confirm-target` mismatch, or an unexpected target class.

---

## 7. Post-write verification

```bash
npx tsx scripts/provision-kanji-corpus.ts --mode=verify     # expect exit 0, FULLY_PROVISIONED
```

Expected: `kanji=45 elements=63 composition=90 kana=208`, both datasets `COMPLETE`,
`no invariant violations`. Optionally re-run the SQL console query from §4.

Application-level smoke checks after verification (read-only):

- `/api/kana` still returns the 208-row chart.
- `/api/kanji/道` returns a detail record (this character was previously absent).
- `/api/kanji` catalogue includes the 12 new headwords.
- Mind Tree `/kanji/道` shows the shinnyou/kubi decomposition.

---

## 8. Audit evidence to retain

Keep, in the change record (never in a chat or ticket):

- the `--audit-out` JSON for the verify, dry-run and execute runs;
- the change-record id, operator name, UTC timestamps;
- the `targetIdentityHash` (safe to store), counts before/after, inserted counts;
- the untouched-row digest pair (must be equal);
- the backup timestamp from §3.

The audit record contains no host, database name, user, password, or connection string.

---

## 9. Recovery from interrupted execution

| Symptom | State of the database | Action |
|---|---|---|
| Connection lost during execute | Transaction aborted by the server; nothing committed | Re-run `--mode=verify`. If still `PARTIALLY_PROVISIONED` at 33/55/71, re-run the dry-run and execute. |
| Tool crashed after `COMMIT` but before post-commit verification | Rows committed | Re-run `--mode=verify`. If `FULLY_PROVISIONED` with no violations, the run succeeded; record it. |
| `--mode=verify` shows a mix (e.g. 38/58/75) | Should be impossible with this tool | **Do not re-run execute.** Capture counts and stop; the dataset is not in a state the planner accepts, and the tool will refuse. Escalate to review with the last audit JSON. |
| Duplicate character collision reported | Nothing written | Investigate the foreign row by hand (read-only). If it is an `upstream:` row, the canonical source needs an id/character decision — that is an owner decision, not an operator one. |

The tool has no "force" mode. There is no bypass flag, environment variable or query
parameter that permits partial or conflicting provisioning.

---

## 10. What the application does — and does not do — during all of this

- Read paths never seed canonical tables. `tests/kanji-read-path-write-isolation.test.ts`
  enforces this statically and behaviourally.
- `KnowledgeService.ensureSeeded()` (`knowledgeService.ts:180`) now decides from the Kanji
  tables: empty → seed; Mind Tree complete → no-op; anything else → throw
  `CanonicalBootstrapStateError`. It does **not** repair a partial database, and the
  partial corpus dataset does not make it write.
- `KnowledgeService.getCanonicalKanjiState()` (`knowledgeService.ts:324`) reports
  `FULLY_PROVISIONED` / `EMPTY` / `PARTIALLY_PROVISIONED` / `INCONSISTENT` / `UNKNOWN`
  read-only, so the partial state is observable without a write.

## 11. Environment separation

| Environment | Who runs it | Database |
|---|---|---|
| Arena / CI / developer | automated tests and the operator rehearsing the procedure | disposable only (PGlite in-process, or a throwaway container). Never a shared database. |
| Production | a separately authorized human operator, outside this engagement | the production database, with the least-privilege role from §2.3 |

No step in this repository runs the provisioner automatically. It is not wired into CI,
a route handler, a cron job or a deployment hook.
