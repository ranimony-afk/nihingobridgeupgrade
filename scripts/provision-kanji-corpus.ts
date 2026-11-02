/**
 * Controlled provisioning of first-party canonical Kanji datasets.
 *
 *   npx tsx scripts/provision-kanji-corpus.ts --mode=verify
 *   npx tsx scripts/provision-kanji-corpus.ts --mode=dry-run
 *   npx tsx scripts/provision-kanji-corpus.ts --mode=execute \
 *     --accept-target-class=MANAGED \
 *     --confirm-target=<identityHash from dry-run> \
 *     --operator="<person>" --approval-ref="<approved change record>"
 *
 * SAFETY MODEL (read this before running it against any shared database)
 *   - `--mode=verify` and `--mode=dry-run` are read-only. Verify runs inside a
 *     READ ONLY transaction and rolls back; dry-run issues SELECTs only.
 *   - `--mode=execute` is insert-only, single transaction, advisory-locked, and
 *     re-reads + re-plans after taking the lock. Any conflict, drift, blocker or
 *     post-write invariant failure rolls the whole transaction back.
 *   - Existing rows are never updated or deleted. A content difference between
 *     the database and the canonical source is a stop condition, not an upsert.
 *   - The tool never prints the connection string, host, database, user or
 *     password. The only target detail it emits is a sha256 identity hash.
 *
 * The flags above gate *intent*, not identity. Real authorization is the
 * database role the operator holds (least privilege: INSERT on the four
 * canonical tables only) plus the approved change record named in
 * `--approval-ref`. See docs/operations/PRODUCTION-CANONICAL-PROVISIONING-RUNBOOK.md.
 *
 * Exit codes: 0 complete/success · 2 blocked or refused · 3 partially
 * provisioned · 4 undetermined/unsupported · 1 usage or connection error.
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { Client } from "pg";
import { buildKanaDataset } from "@/data/kana";
import {
  CanonicalProvisioningError,
  canonicalSchemaStatus,
  dryRunProvisioning,
  executeProvisioning,
  readCanonicalRows,
  readKanaCounts,
  verifyCanonicalFoundation,
} from "@/services/knowledge/canonicalStore";
import {
  buildCorpusPilotDataset,
  buildMindtreeDataset,
  classifyCanonicalState,
  expectedCanonicalTotals,
  type CanonicalDataset,
} from "@/services/knowledge/canonicalDataset";
import {
  authorizeProvisioning,
  classifyProvisioningTarget,
  ProvisioningTargetError,
} from "@/services/knowledge/provisioningTarget";

type Mode = "verify" | "dry-run" | "execute";

interface Options {
  mode: Mode;
  dataset: "kanji-corpus-pilot" | "kanji-mindtree";
  operator?: string;
  approvalRef?: string;
  acceptTargetClass?: string;
  confirmTarget?: string;
  expectedKana: number;
  json: boolean;
  auditOut?: string;
}

function usage(): string {
  return [
    "Controlled canonical Kanji provisioning",
    "",
    "  --mode=verify | dry-run | execute      (default: dry-run)",
    "  --dataset=kanji-corpus-pilot|kanji-mindtree (default: kanji-corpus-pilot)",
    "  --expected-kana=<n>                    (default: repository kana baseline)",
    "  --operator=<name>                      (execute only, required)",
    "  --approval-ref=<record>                (execute only, required)",
    "  --accept-target-class=LOCAL|REMOTE|MANAGED (execute only, required)",
    "  --confirm-target=<identityHash>        (execute only, required)",
    "  --json                                 (machine-readable output)",
    "  --audit-out=<path>                     (write the audit record to a file)",
    "",
    "DATABASE_URL must be set. Never paste it into a ticket or chat.",
  ].join("\n");
}

class UsageError extends Error {}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    mode: "dry-run",
    dataset: "kanji-corpus-pilot",
    expectedKana: buildKanaDataset().length,
    json: false,
  };

  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new UsageError(`Unrecognized argument: ${arg}`);
    const [, key, rawValue] = match;
    const value = rawValue ?? "";
    switch (key) {
      case "mode":
        if (!["verify", "dry-run", "execute"].includes(value)) {
          throw new UsageError(`Unsupported --mode=${value}`);
        }
        options.mode = value as Mode;
        break;
      case "dataset":
        if (!["kanji-corpus-pilot", "kanji-mindtree"].includes(value)) {
          throw new UsageError(`Unsupported --dataset=${value}`);
        }
        options.dataset = value as Options["dataset"];
        break;
      case "operator":
        options.operator = value;
        break;
      case "approval-ref":
        options.approvalRef = value;
        break;
      case "accept-target-class":
        options.acceptTargetClass = value;
        break;
      case "confirm-target":
        options.confirmTarget = value;
        break;
      case "expected-kana": {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new UsageError("--expected-kana must be a positive integer");
        }
        options.expectedKana = parsed;
        break;
      }
      case "json":
        options.json = true;
        break;
      case "audit-out":
        options.auditOut = value;
        break;
      case "help":
        throw new UsageError(usage());
      default:
        throw new UsageError(`Unrecognized argument: --${key}`);
    }
  }

  return options;
}

function selectDataset(name: Options["dataset"]): CanonicalDataset {
  return name === "kanji-mindtree" ? buildMindtreeDataset() : buildCorpusPilotDataset();
}

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new UsageError("DATABASE_URL is not set");
  if (process.env.PGOPTIONS) {
    throw new UsageError("PGOPTIONS must be unset: startup options can change the role or search_path");
  }
  return url;
}

interface AuditRecord {
  tool: "provision-kanji-corpus";
  version: 1;
  dataset: string;
  mode: Mode;
  targetClass: string;
  targetIdentityHash: string;
  operator: string | null;
  approvalRef: string | null;
  startedAt: string;
  finishedAt: string;
  outcome: string;
  exitCode: number;
  countsBefore: Record<string, number> | null;
  countsAfter: Record<string, number> | null;
  kana: Record<string, number> | null;
  inserted: Record<string, number> | null;
  blockers: string[];
  violations: string[];
  untouchedDigestBefore: string | null;
  untouchedDigestAfter: string | null;
}

function summarizeViolations(
  violations: Array<{ code: string; detail: string }>
): string[] {
  return violations.map((v) => `${v.code}: ${v.detail}`);
}

async function run(): Promise<number> {
  const startedAt = new Date().toISOString();
  const options = parseArgs(process.argv.slice(2));
  const url = connectionString();
  const target = classifyProvisioningTarget(url);
  const dataset = selectDataset(options.dataset);
  const totals = expectedCanonicalTotals();

  const audit: AuditRecord = {
    tool: "provision-kanji-corpus",
    version: 1,
    dataset: dataset.id,
    mode: options.mode,
    targetClass: target.targetClass,
    targetIdentityHash: target.identityHash,
    operator: options.mode === "execute" ? options.operator ?? null : null,
    approvalRef: options.mode === "execute" ? options.approvalRef ?? null : null,
    startedAt,
    finishedAt: "",
    outcome: "started",
    exitCode: 1,
    countsBefore: null,
    countsAfter: null,
    kana: null,
    inserted: null,
    blockers: [],
    violations: [],
    untouchedDigestBefore: null,
    untouchedDigestAfter: null,
  };

  const emit = (exitCode: number, lines: string[], outcome: string): number => {
    audit.exitCode = exitCode;
    audit.outcome = outcome;
    audit.finishedAt = new Date().toISOString();
    if (options.json) {
      process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    } else {
      for (const line of lines) process.stdout.write(`${line}\n`);
      process.stdout.write(`AUDIT ${JSON.stringify(audit)}\n`);
    }
    if (options.auditOut) {
      writeFileSync(options.auditOut, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    }
    return exitCode;
  };

  const header = [
    `canonical provisioning — dataset=${dataset.id} mode=${options.mode}`,
    `target class=${target.targetClass} identity=${target.identityHash}`,
    `expected full foundation: ${totals.kanji} kanji (${totals.provenance["first-party:kanji-mindtree:v1"]} mindtree + ${totals.provenance["first-party:kanji-corpus:v1"]} corpus), ` +
      `${totals.radicals} elements, ${totals.composition} composition edges, ${options.expectedKana} kana`,
  ];

  if (options.mode === "execute") {
    const authorization = authorizeProvisioning(target, {
      declaredClass: options.acceptTargetClass,
      confirmTarget: options.confirmTarget,
      operator: options.operator,
      approvalRef: options.approvalRef,
    });
    if (!authorization.allowed) {
      return emit(2, [...header, "REFUSED — execute preconditions are not met:", ...authorization.problems.map((p) => `  - ${p}`)], "refused");
    }
  }

  const client = new Client({
    connectionString: url,
    application_name: "nihongo-canonical-provisioning",
  });

  try {
    await client.connect();
  } catch (error) {
    const code = (error as { code?: string }).code ?? "unknown";
    return emit(
      1,
      [...header, `connection failed (code ${code}); no statement was executed`],
      "connection-failed"
    );
  }

  try {
    const schemaStatus = await canonicalSchemaStatus(client);
    if (schemaStatus.missing.length > 0) {
      return emit(
        4,
        [
          ...header,
          `schema incomplete — missing canonical table(s): ${schemaStatus.missing.join(", ")}`,
          "deploy the Drizzle migrations before provisioning; nothing was written",
        ],
        "schema-missing"
      );
    }

    if (options.mode === "verify") {
      const [observed, kana] = await Promise.all([
        readCanonicalRows(client),
        readKanaCounts(client),
      ]);
      const state = classifyCanonicalState({ kana, observed, expectedKana: options.expectedKana });
      const verification = await verifyCanonicalFoundation(client, {
        expectedKana: options.expectedKana,
      });
      audit.countsBefore = verification.counts;
      audit.kana = kana.provenance;
      audit.violations = summarizeViolations(verification.status);

      const exitCode =
        state.status === "FULLY_PROVISIONED" ? 0 : state.status === "UNKNOWN" ? 4 : state.status === "INCONSISTENT" ? 2 : 3;
      const lines = [
        ...header,
        `state: ${state.status}`,
        `counts: kanji=${verification.counts.kanji} elements=${verification.counts.radicals} composition=${verification.counts.composition} kana=${kana.total}`,
        `kana provenance: ${JSON.stringify(kana.provenance)}`,
        `kanji provenance: ${JSON.stringify(provenanceOf(observed))}`,
      ];
      for (const assessment of state.assessments) {
        lines.push(
          `dataset ${assessment.id}: ${assessment.status} (present ${assessment.present.kanji}/${assessment.expected.kanji} kanji, ${assessment.present.radicals}/${assessment.expected.radicals} elements, ${assessment.present.composition}/${assessment.expected.composition} edges)`
        );
      }
      if (verification.status.length > 0) {
        lines.push("violations:", ...verification.status.map((v) => `  - ${v.code}: ${v.detail}`));
        lines.push(`remediation: ${state.remediation ?? "none"}`);
      } else {
        lines.push("no invariant violations");
      }
      return emit(exitCode, lines, state.status.toLowerCase());
    }

    if (options.mode === "dry-run") {
      const { plan, counts } = await dryRunProvisioning(client, dataset);
      audit.countsBefore = counts;
      audit.blockers = plan.blockers;
      audit.inserted = {
        radicals: plan.inserts.radicals.length,
        kanji: plan.inserts.kanji.length,
        composition: plan.inserts.composition.length,
      };
      const lines = [
        ...header,
        `dry-run — no transaction opened, no row written`,
        `present: kanji=${counts.kanji} elements=${counts.radicals} composition=${counts.composition}`,
        `to insert: kanji=${plan.inserts.kanji.length} elements=${plan.inserts.radicals.length} composition=${plan.inserts.composition.length}`,
        `already present: kanji=${plan.alreadyPresent.kanji} elements=${plan.alreadyPresent.radicals} composition=${plan.alreadyPresent.composition}`,
        `expected after: kanji=${plan.expectedAfter.kanji} elements=${plan.expectedAfter.radicals} composition=${plan.expectedAfter.composition}`,
        `kanji to insert: ${plan.inserts.kanji.map((k) => `${k.character}(${k.id})`).join(" ")}`,
        `elements to insert: ${plan.inserts.radicals.map((r) => `${r.character}(${r.id})`).join(" ")}`,
      ];
      if (plan.blockers.length > 0) {
        lines.push("BLOCKED — the database does not match the canonical source:", ...plan.blockers.map((b) => `  - ${b}`));
        return emit(2, lines, "blocked");
      }
      lines.push("plan is executable: re-run with --mode=execute and the four authorization flags");
      return emit(0, lines, plan.inserts.kanji.length === 0 ? "already-complete" : "planned");
    }

    const result = await executeProvisioning(client, dataset, {
      expectedKana: options.expectedKana,
    });
    audit.countsBefore = result.countsBefore;
    audit.countsAfter = result.countsAfter;
    audit.inserted = result.inserted;
    audit.untouchedDigestBefore = result.untouchedDigestBefore;
    audit.untouchedDigestAfter = result.untouchedDigestAfter;

    const verification = await verifyCanonicalFoundation(client, {
      expectedKana: options.expectedKana,
    });
    audit.kana = verification.kana.provenance;
    audit.violations = summarizeViolations(verification.status);

    const lines = [
      ...header,
      `outcome: ${result.outcome}`,
      `inserted: kanji=${result.inserted.kanji} elements=${result.inserted.radicals} composition=${result.inserted.composition}`,
      `counts: before kanji=${result.countsBefore.kanji} elements=${result.countsBefore.radicals} composition=${result.countsBefore.composition}`,
      `        after  kanji=${result.countsAfter.kanji} elements=${result.countsAfter.radicals} composition=${result.countsAfter.composition}`,
      `untouched-row digest: ${result.untouchedDigestBefore === result.untouchedDigestAfter ? "unchanged" : "CHANGED"}`,
    ];
    if (verification.status.length > 0) {
      lines.push(
        "post-commit verification reported violations (investigate immediately):",
        ...verification.status.map((v) => `  - ${v.code}: ${v.detail}`)
      );
      return emit(2, lines, "post-commit-violations");
    }
    lines.push("post-commit verification: canonical foundation complete, no violations");
    return emit(0, lines, result.outcome);
  } catch (error) {
    if (error instanceof CanonicalProvisioningError) {
      audit.blockers = error.details;
      return emit(
        2,
        [...header, `REFUSED — ${error.message}`, ...error.details.map((d) => `  - ${d}`), "transaction rolled back; no row remains"],
        error.code.toLowerCase()
      );
    }
    const code = (error as { code?: string }).code;
    return emit(
      1,
      [...header, `failed${code ? ` (code ${code})` : ""}: the transaction was rolled back. Details are intentionally not echoed because driver errors can contain the connection string.`],
      "failed"
    );
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

function provenanceOf(rows: {
  kanji: Array<{ sourceRef: string }>;
}): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows.kanji) {
    result[row.sourceRef] = (result[row.sourceRef] ?? 0) + 1;
  }
  return result;
}

const invokedDirectly = (process.argv[1] ?? "").includes("provision-kanji-corpus");
if (invokedDirectly) {
  run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof ProvisioningTargetError || error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    const code = (error as { code?: string }).code;
    process.stderr.write(
      `provisioning failed${code ? ` (code ${code})` : ""}; details withheld to avoid echoing the connection string\n`
    );
    process.exitCode = 1;
  });
}
