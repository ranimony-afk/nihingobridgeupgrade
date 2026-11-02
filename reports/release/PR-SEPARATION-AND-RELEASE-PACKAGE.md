# PR separation and release package — Kanji foundation (45 / 63 / 90)

Date: 2026-11-02
State: **engineering complete; branch/PR creation blocked by the engagement's branch policy** (§5).
Owner-approved canonical target: **45 Kanji / 63 elements / 90 composition edges**, kana fixed at 208.
Nothing here authorizes a production connection, write, migration, merge or deployment.

---

## 1. Verified start state

| Item | Value |
|---|---|
| Root / remote | `/home/user/nihingobridgeupgrade` · `https://github.com/ranimony-afk/nihingobridgeupgrade.git` |
| Branch | `arena/76b3ae66-nihingobridgeupgrade`, upstream `origin/arena/76b3ae66-nihingobridgeupgrade` |
| HEAD | `bde1811` (expanded PR #29 head), worktree clean |
| `main` | `dbeef97` |
| PR #29 | OPEN, not draft, not merged, `MERGEABLE`/`clean`, 5 commits, 17 files, 0 reviews |
| PR #27 | OPEN, not draft, not merged, `MERGEABLE`/`clean`, head `6fc5100`, unchanged |
| Ancestry | `dbeef97 → c52ea82 → 3a4c83a → 4c3bffd → dda9f10 → bde1811` |
| Prior backups | `/tmp/preexisting-backup/{tracked.patch,untracked.tgz}` still present (8 473 B / 29 077 B) |

## 2. What each commit owns

| Commit | Files | Concern |
|---|---|---|
| `c52ea82` | `.github/workflows/ci.yml`, `reports/security/CANONICAL-KANJI-WRITE-PATH-AUDIT.md`, `reports/security/READ-PATH-CANONICAL-WRITE-REMOVAL.md`, `src/app/api/ai/retrieve/route.ts`, `src/services/jlpt/knowledge/jlptKnowledgeService.ts`, `src/services/knowledge/knowledgeService.ts`, `tests/kanji-read-path-write-isolation.test.ts` | **Narrow PR #29** — remove request-time lazy seeding |
| `3a4c83a` | `+ canonicalBootstrapGuard.ts`, `+ canonicalDataset.ts`, `~ knowledgeService.ts` | Dataset-state model + bootstrap decision |
| `4c3bffd` | `+ canonicalStore.ts`, `+ provisioningTarget.ts`, `+ scripts/provision-kanji-corpus.ts` | Operator provisioning |
| `dda9f10` | `+ ADR-0002`, `+ runbook`, `+ data-gap report`, `+ tests/kanji-canonical-{dataset-state,provisioning}.test.ts`, `~ ci.yml` | Evidence, tests, docs |
| `bde1811` | `~ tests/kanji-read-path-write-isolation.test.ts` | Forward guard: no `src/app` file may import the provisioning writer |

## 3. Dependency matrix

Empirical trial: the four provisioning commits were cherry-picked onto `main` (`dbeef97`) in a
throwaway detached worktree (nothing pushed, worktree deleted afterwards).

| Commit | Applies to `main` textually | Depends on PR #29 code | Depends on PR #29 behaviour | Independent? |
|---|---|---|---|---|
| `3a4c83a` | **yes** (auto-merged) | only in `knowledgeService.ts` context | **yes — semantic**: the guard throws on a partial foundation. On `main` every read method still calls `ensureSeeded()`, so landing the guard before PR #29 turns anonymous reads of a partial database into 500s | **no** |
| `4c3bffd` | **yes** (new files only) | no | no (imports only `canonicalDataset`, `pg`) | yes in isolation |
| `dda9f10` | **conflict** in `.github/workflows/ci.yml` (both branches append to the Vitest list at the same anchor); the other six files are new | partial (`ci.yml`) | no | mostly |
| `bde1811` | **impossible** — `tests/kanji-read-path-write-isolation.test.ts` does not exist on `main`; that file is created by `c52ea82` | **yes — hard** | yes | **no** |

Decision: **Option B — stacked provisioning PR.** Recorded reasoning:

1. `bde1811` edits a file that only exists after `c52ea82`; shipping it independently would mean
   re-creating PR #29's test file inside the provisioning PR, which the brief explicitly forbids
   ("do not duplicate PR #29 changes ... to make the branch appear independent").
2. `3a4c83a` is behaviourally unsafe ahead of PR #29: its fail-closed guard is only acceptable
   once request paths no longer call `ensureSeeded()`.
3. Both remaining conflicts are mechanical, so Option A is *technically* reachable — but only by
   re-partitioning commits across the two PRs, which would move the isolation guard out of the PR
   that owns the isolation file. Rejected as cosmetic churn.

### Integration sequence (exact)

```
main (dbeef97)
  └─ #27 fix(kanji-etl): deny unapproved canonical writes        head 6fc5100
  └─ #29 fix(knowledge): stop seeding canonical Kanji from read paths
         narrow branch = c52ea82
         └─ provisioning PR (stacked)                            head bde1811
```

Merge order: **#27 → narrow #29 → provisioning**. The provisioning PR's base stays the narrow
branch until it merges, then it is retargeted to `main` (no rebase, no force-push) and re-run
through CI on the updated head before merging.

Why this order: PR #27 removes the unguarded ETL writer; PR #29 removes request-path seeding; only
then is an authorized write path the sole remaining way to change canonical Kanji data.

## 4. Verified trees (already tested)

| Tree | Contents | Commit | Result |
|---|---|---|---|
| **T-narrow** | `main + c52ea82` | `c52ea82` | typecheck, lint, build, isolation suite — see §6 |
| **T-prov** | `main + c52ea82 + 4 provisioning commits` | `bde1811` | full suite + CI run `41385812767` SUCCESS |
| **T-combined** | `T-prov + PR #27` | merge tree | typecheck, lint, 77 tests |

## 5. Branch/PR creation — blocked here, exact commands provided

This engagement runs on a single session branch (`arena/76b3ae66-nihingobridgeupgrade`) and may not
create, switch to, or push any other branch, **and may not force-push or rewrite an existing one**.
The separation therefore cannot be performed from inside this session without violating that
constraint. It is fully prepared below; the commands create new refs at existing commit objects and
touch nothing that already exists.

```bash
# 1. Narrow PR #29 replacement (new branch at the existing narrow commit)
git push origin c52ea82:refs/heads/release/pr29-narrow
gh pr create --base main --head release/pr29-narrow \
  --title "fix(knowledge): stop seeding canonical Kanji from read paths" \
  --body-file docs/release/PR29-NARROW-BODY.md

# 2. Provisioning PR, stacked on the narrow branch (new branch at the current expanded head)
git push origin bde1811:refs/heads/release/kanji-provisioning
gh pr create --base release/pr29-narrow --head release/kanji-provisioning \
  --title "feat(provisioning): controlled first-party Kanji foundation (45/63/90)" \
  --body-file docs/release/PROVISIONING-PR-BODY.md
```

Notes:
- `git push <sha>:refs/heads/<name>` creates a new branch; it does not modify or force-push any
  existing branch. No local checkout or worktree change is needed.
- The expanded PR #29 stays open and untouched; the owner decides when to close it as superseded
  (`gh pr close 29` only after the two replacements are reviewed).
- If the platform prefers to keep PR #29's number for the narrow change, the alternative is
  `gh api -X PATCH repos/…/pulls/29 -f head=release/pr29-narrow`, which changes a PR's head branch
  but leaves the old branch intact — an owner decision, not taken here.

## 6. Release gates (all must be green before the operator run)

| Gate | Requirement |
|---|---|
| G1 | PR #27 merged, `main` push CI green |
| G2 | Narrow #29 merged, `main` push CI green |
| G3 | Provisioning PR: full CI green on its exact head (currently `bde1811` → run `41385812767` SUCCESS) |
| G4 | Provisioning PR retargeted to `main` after G2 and CI re-run green on the updated head |
| G5 | Combined tree (#27 + #29 + provisioning) typecheck/lint/test green — verified locally at `3e4b9f1f` (re-verify after any new commit) |
| G6 | Operator preflight: `--mode=verify` on production returns `PARTIALLY_PROVISIONED` at exactly 208 / 33 / 55 / 71 with provenance `first-party:kanji-mindtree:v1 = 33` |
| G7 | Approved change record + verified least-privilege role + backup/PITR confirmation + dry-run review |

No production step is authorized by reaching G1–G5; G6–G7 are human gates.

## 7. Unwind

If the provisioning release must be reversed **before** execution: close the provisioning PR; nothing
in the database changed.
If it must be reversed **after** execution: the runbook documents recovery. The tool is insert-only,
so the reversal is the 12 headwords + 8 elements + 19 edges it inserted, identified by
`first-party:kanji-corpus:v1` and the recorded edge ids — a separate, separately authorized
destructive operation that this engagement does not design or authorize.
