# Phase 14.3D F1–F9 Safety Contract

**Status:** committed contract for Phase 14.3D-R. This is not production-ingestion authorization.
**Audit tree:** `94a247fce5af2a15396f2d0cebb3116e8ebced6e` plus the 14.3D-R safety closure on the same branch.
**Historical report:** `reports/gates/PHASE-14.3D-FULL-JMDICT-INGESTION.md` is historical evidence only.

F4 and F7 keep the meanings already named by `tests/jmdict-f4-f7.test.ts` and PR #12. The other gates are the safety properties Gate 0 showed were missing. They are not renamed to make the old code pass.

Evidence classes:

- **Implementation:** fixture or pure tests. Must pass without the official XML and without a network database.
- **Integration:** disposable PGlite or an explicitly classified loopback database. Never production.
- **Environment:** requires the external 2023-08 artifact or a classified disposable server. Absence is reported, not waived.
- **Production authorization:** a later gate. This contract does not grant it.

## Pinned source

| Field | Pin |
| :--- | :--- |
| Source id | `upstream:jmdict:2023-08` |
| Release | `2023-08-20` |
| Entries | `206717` |
| XML bytes | `115331197` |
| XML SHA-256 | `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162` |
| Archive SHA-256 | `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` |
| Archive bytes | `13383352` |
| Rejected substitute | `upstream:jmdict:2024-07` |

The archive hash is an acquisition pin. Ingestion verifies the XML bytes. The archive is not claimed verified unless those archive bytes are hashed in the session that acquires them.

## F1 — Source identity and content

**Requirement.** Before any write, the ingestion path hashes the retained snapshot and compares it to the pin. The official path also checks byte size, the `JMdict created:` header date, the registry `contentHash`, and the parsed entry count. `upstream:jmdict:2024-07` is refused. A fixture hash may be supplied only as an explicit expected hash for tests; the CLI does not accept a substitute hash.

**Pass.** Mismatch throws `SOURCE HASH MISMATCH`. Header/count/release helpers reject the wrong release. Registry `contentHash` equals the pin. The official file, when absent, is not described as verified.

**Fail.** Any write before a byte hash match, a stamped hash that was not computed, or substitution of 2024-07.

**Evidence.** Implementation: `tests/jmdict-safety-closure.test.ts`. Environment: official XML absent until acquired outside git.

## F2 — Authorization

**Requirement.** No-flag execution and `--pilot E` fail before source open, database connection, checkpoint mutation, or persistence. Stages A–D remain bounded at 10, 100, 1,000, and 10,000. Stage E is not a bound and is not authorization. Full-corpus execution requires `--authorize-full-ingestion` on both the CLI and `executeIngestion`. The same rule applies to `executeIngestion({ pilot: true, pilotStage: "E" })`.

**Pass.** Those rejections throw and perform no writes. Explicit authorization still does not skip target classification.

**Fail.** Pilot E, a missing flag, or an unknown alias reaches a write.

**Evidence.** Implementation tests in `tests/jmdict-safety-closure.test.ts`.

## F3 — CLI fail-closed

**Requirement.** Unknown flags, including the removed ambiguous alias `--authorized`, throw before any IO. Omitted supported flags keep their defaults: no dry-run, no pilot, pilot stage `B` only when `--pilot` is present and no stage is given, batch size applied later as 1,000, conflict policy applied later as `abort`.

**Pass.** `parseCliArgs([])` is `{}`. Unknown flags throw `Unknown flag`. No source, client, or checkpoint call occurs.

**Fail.** An unknown flag is ignored or reaches `executeIngestion`.

**Evidence.** Implementation tests. Existing malformed-value coverage remains in `tests/jmdict-f4-f7.test.ts`.

## F4 — Input validation before side effects

**Requirement.** Unchanged from PR #12. Malformed option objects, paths, and connection arguments are rejected before filesystem or database-client work. Omitted properties keep defaults. Explicit `undefined`, unknown keys, and accessors are rejected.

**Pass.** `tests/jmdict-f4-f7.test.ts` F4 cases pass.

**Fail.** A malformed option reaches `openSync`, checkpoint IO, or `pg.Client`.

**Evidence.** Existing F4 suite. Not duplicated.

## F5 — Deterministic transformation

**Requirement.** Accepted dictionary ids are `de-jmdict-${entSeq}` and repeat for the same `entSeq`. Provenance stamping uses the registry id, not a caller-invented source. This gate does not retarget the 14.2 pipeline default `JMDICT_SOURCE_REF`, which remains `upstream:jmdict:2024-07` for existing foundation tests. The 14.3D ingestion entry points refuse that id.

**Pass.** Existing foundation and full-ingestion id tests, plus the 14.3D refusal test.

**Fail.** A non-deterministic id, or a 14.3D entry point accepting 2024-07.

**Evidence.** `tests/dictionary-etl-foundation.test.ts`, `tests/full-jmdict-ingestion.test.ts` case 14, safety-closure pin test.

## F6 — Conflict handling and payload preflight

**Requirement.** Default `conflictPolicy` is `abort`. Identical canonical payload: skip. Absent id: insert. Differing payload, including `sourceRef`: abort, and the stored row remains unchanged. Update happens only when `conflictPolicy: "update"` is explicit. Preflight counts inserts, identical rows, conflicts, and intended updates from that same comparison. It must not hardcode `conflictingIdCount: 0` or `expectedUpdates: 0`.

**Pass.** Default abort leaves the row unchanged. Explicit update changes it. Preflight on a fixture reports one insert, one identical row, and one conflict, with `expectedUpdates` 0 under abort and 1 under update.

**Fail.** A differing row is written without `update`, or preflight reports a hardcoded zero while a payload differs.

**Evidence.** Implementation and PGlite integration in `tests/jmdict-safety-closure.test.ts`.

## F7 — Snapshot, batch immutability, and checkpoint-after-success

**Requirement.** Unchanged snapshot rules from PR #12, plus a dry-run rule: dry-run may hash, parse, and transform the retained snapshot, and must not create, advance, or overwrite a checkpoint. An existing checkpoint stays byte-identical, including when the dry-run fails. A failed persistence call does not write a checkpoint.

**Pass.** Existing F7 cases pass. New cases show no checkpoint file created, an existing file unchanged, and a failed batch leaving the checkpoint bytes unchanged.

**Fail.** Dry-run writes `data/jmdict-checkpoint.json` or any other resume checkpoint, or a failed batch still advances one.

**Evidence.** `tests/jmdict-f4-f7.test.ts` and the safety-closure checkpoint cases.

## F8 — Transactional batch atomicity

**Requirement.** `DrizzleDictionaryPersistenceAdapter.upsertBatch` performs the reads and writes of one batch in one transaction. A failure after a candidate row has been written leaves zero rows from that batch and does not change previously committed rows. The checkpoint is written only after the adapter returns. The existing scratch rollback helper is not this proof.

**Pass.** A disposable PGlite transaction inserts a prior row, then a later batch throws after its own insert. The new id is absent and the prior row is unchanged.

**Fail.** A partial row from the failed batch remains, or the checkpoint advances.

**Evidence.** PGlite integration in `tests/jmdict-safety-closure.test.ts`. Not a production database.

## F9 — Resume identity and reconciliation

**Requirement.** A resume checkpoint is version 2, origin `ingestion`, and bound to source id, release, content hash, transformation version, schema contract, id strategy, and database identity. Database identity is `sha256("nihongo-db-target-v1" + NUL + host + NUL + port + NUL + database + NUL + role)`. The password and connection string are not stored. A missing file, corrupt JSON, incompatible version, non-ingestion origin, different source, or different target fails closed and does not restart at zero. Dry-run never produces an ingestion checkpoint.

**Pass.** Matching identity loads. Each incompatible case throws. Corrupt JSON throws rather than returning null.

**Fail.** Resume starts at zero, accepts another database, or accepts a checkpoint that was not produced by a committed ingestion.

**Evidence.** Implementation tests against temporary checkpoint files. Not `data/test-checkpoint.json`.

## Target classification

Unknown or missing class: reject. Exact loopback without `NIHONGO_DB_TARGET_CLASS=disposable` and an exact `NIHONGO_DB_EXPECTED_DATABASE`: reject. Forbidden production domains (`supabase.co`, `supabase.com`, `pooler.supabase.com`, `neon.tech`, `vercel-storage.com`) are matched as exact domain suffixes, not substrings, and reject before connect. Class `production` rejects before connect even if a separate authorization flag is set. This phase does not contact production.

Residual risk: an operator can mislabel a loopback tunnel as disposable by setting both explicit variables to the tunneled database. The engine does not treat loopback as sufficient, and it does not claim a tunnel is cryptographically impossible. `inet_server_addr()` is recorded when available and is not an allow signal, because a published container port is not the same as a production tunnel.

## Acquisition procedure

Do not commit `data/JMdict.xml` or the Brotli archive. Both are gitignored.

1. Obtain the EDRDG JMdict release whose XML header says `JMdict created: 2023-08-20`. The project documentation URI is `https://www.edrdg.org/jmdict/j_jmdict.html`. Do not download a current weekly file and call it 2023-08.
2. Place the XML only in a gitignored path, conventionally `data/JMdict.xml`. Keep the archive beside it, outside git.
3. Hash the XML with SHA-256 and compare it to `a9be8a98c0d5597c32bea755214901d195aa7612e4ed27787463c9e084130162`. Compare the size to `115331197`.
4. If the archive is present, hash it and compare it to `608800cfaff7806ad6642d68bf4aba3abb25d872030021a47faf8731f902eb16` and size `13383352`. A mismatch rejects the archive. Do not decompress a mismatched archive over the pinned XML.
5. Confirm the header date and, through the ingestion verifier, the entry count `206717`.
6. Reject any file whose header or source id is 2024-07.
7. Do not start ingestion from this procedure. Ingestion still requires a classified disposable target and, for the full corpus, `--authorize-full-ingestion`. Production contact remains a separate gate.

## What this contract does not authorize

Production ingestion, Supabase contact, Kanji/KANJIDIC2, Tatoeba, grammar, search, SRS, AI, or Flutter.
