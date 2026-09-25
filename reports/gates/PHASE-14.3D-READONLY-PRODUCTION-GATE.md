# Phase 14.3D — Read-only Production Authorization Gate

**Verdict: BLOCKED**

**FULL INGESTION AUTHORIZED: NO**

**READY FOR EXPLICIT PRODUCTION AUTHORIZATION: NO**

**PHASE 14.4A AUTHORIZED: NO**

No database connection was opened. No rows were written. `--authorize-full-ingestion` was not passed.

## Repository

| Field | Value |
| :--- | :--- |
| Branch | `arena/01a0d755-nihingobridgeupgrade` |
| Local HEAD at inspection | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Remote `main` | `94a247fce5af2a15396f2d0cebb3116e8ebced6e` |
| Safety closure | `9dc8e3f9aa932709144708af80279918c7fb96f5`, preserved and not discarded |
| This gate commit | `be40c1ab7b25958047e74d0f1a24b1b69cdca447` |
| Claimed commit `04f34a579e7708791bd2ac79014d56926f86de6f` | Absent. Not treated as present. |

The write path still refuses production. The only code change is a separate read-only decision, `ALLOW_READONLY`. It is not `ALLOW`. Ingestion does not request it, and `--authorize-full-ingestion` does not grant it.

## Source

Reacquired this session from the documented Jitendex archive base `JMdict/JMdict.br`. The archive was hashed before decompression. Neither file was committed.

| Field | Value |
| :--- | :--- |
| Release | `2023-08-20` |
| Source id | `upstream:jmdict:2023-08` |
| Entries | `206717` |
| XML size | `115331197` |
| XML SHA-256 | `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162` |
| Archive size | `13383352` |
| Archive SHA-256 | `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` |
| Release offset | byte `22938` |
| First 8192 bytes contain the release marker | No |
| `2024-07` | Absent |

The repository source-contract test accepted the retained file. `data/test-checkpoint.json` was not modified.

## Production target

| Field | Value |
| :--- | :--- |
| Classification | `UNKNOWN` |
| Host | Not established |
| Port | Not established |
| Database | Not established |
| Role | Not established |
| Database identity | Not computed |
| `DATABASE_URL` secret | NOT PRESENT |
| Connection opened | No |

The session environment has no `DATABASE_URL`, no `NIHONGO_DB_*` variables, and no dotenv file. The secret was not placed in this report, source, or a committed env file. A Supabase hostname was not inferred.

Read-only inspection can connect only when all of these are supplied by the operator, and still only for `SELECT`:

- `DATABASE_URL` in the process environment, never printed
- `NIHONGO_DB_TARGET_CLASS=PRODUCTION`
- `NIHONGO_DB_EXPECTED_DATABASE` exactly equal to the URL database name
- `NIHONGO_DB_EXPECTED_HOST` exactly equal to the URL host
- `NIHONGO_DB_READONLY_INSPECTION=readonly-inspection`

`PRODUCTION` by itself is rejected. A forbidden-domain host without the named host and the confirmation token stays forbidden. The write classifier still returns `REJECT` for that host.

## Database

Not inspected. No client was constructed.

| Field | Value |
| :--- | :--- |
| Schema verified | No |
| `dictionary_entries` count | Unknown |
| `knowledge_sources` count | Unknown |
| Existing JMdict rows | Unknown |
| Migration | No |

## Preflight

Not run. The 206,717-row comparison requires the classified read-only connection. Planned inserts, skips, conflicts, and updates are unknown. The default conflict policy remains `abort`.

## Backup

| Field | Value |
| :--- | :--- |
| Backup type | Unavailable |
| Timestamp | Unavailable |
| Scope | Unavailable |
| Retention | Unavailable |
| Restore procedure | Unavailable |
| Recovery verification | Unavailable |

No backup evidence was manufactured from the existence of Supabase. This absence blocks authorization even if a later connection succeeds.

## Security

The ingestion adapter still writes only `dictionary_entries` and `knowledge_sources`, and only after a disposable `ALLOW` decision. `ALLOW_READONLY` does not satisfy that check. Conflict policy, batch size, and transaction boundaries were not changed. D-13 remains deferred and was not cleared. No secret was printed.

## Tests

`tests/jmdict-safety-closure.test.ts` and `tests/jmdict-source-contract.test.ts`: 17 passed. The new test checks that a fully named read-only classification is `ALLOW_READONLY`, that a missing or wrong confirmation does not connect, and that the write path still refuses the same host. `tsc --noEmit` passed.

## Final

```text
VERDICT: BLOCKED
FULL INGESTION AUTHORIZED: NO
READY FOR EXPLICIT PRODUCTION AUTHORIZATION: NO
PHASE 14.4A AUTHORIZED: NO
```

The corpus is verified. The production target, live schema, preflight, and backup evidence are not. Phase 14.4A was not started.
