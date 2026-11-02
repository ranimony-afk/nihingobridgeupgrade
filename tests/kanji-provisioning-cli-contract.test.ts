/**
 * Provisioning security contract — DB-free.
 *
 * Covers the controls that do not need a database:
 *   - target classification and the execute preconditions (accountability, not
 *     authentication — the tests assert exactly that reading)
 *   - connection-string handling (options/fragments refused, no secret echo)
 *   - CLI argument validation
 *   - static proof that the provisioning path contains no UPDATE/DELETE/
 *     TRUNCATE/ALTER/DROP statement and no upsert, i.e. it cannot mutate an
 *     existing canonical row even if the role allows it
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  authorizeProvisioning,
  classifyProvisioningTarget,
  ProvisioningTargetError,
} from "@/services/knowledge/provisioningTarget";
import { parseArgs } from "../scripts/provision-kanji-corpus";

const repoRoot = resolve(__dirname, "..");

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("target classification", () => {
  it("classifies loopback, managed and other hosts without exposing them", () => {
    const loopback = classifyProvisioningTarget(
      "postgresql://app:pw@127.0.0.1:5432/nihongo"
    );
    expect(loopback.targetClass).toBe("LOCAL");

    const managed = classifyProvisioningTarget(
      "postgresql://app:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    );
    expect(managed.targetClass).toBe("MANAGED");

    const remote = classifyProvisioningTarget(
      "postgresql://app:pw@db.internal.example:5432/nihongo"
    );
    expect(remote.targetClass).toBe("REMOTE");

    for (const target of [loopback, managed, remote]) {
      // The only target detail returned is the hash: no host, database, user.
      expect(Object.keys(target).sort()).toEqual(
        ["identityHash", "reason", "targetClass"].sort()
      );
      expect(target.identityHash).toMatch(/^[0-9a-f]{64}$/);
      // No credential and no hostname: only the class, the hash and a reason.
      const serialized = JSON.stringify(target);
      expect(serialized).not.toContain("pw");
      expect(serialized).not.toContain("127.0.0.1");
      expect(serialized).not.toContain("aws-0-ap-south-1");
      expect(serialized).not.toContain("db.internal.example");
      // The reason may name the *public* managed-domain suffix, never the host.
      expect(target.reason).not.toContain("nihongo");
    }
  });

  it("is stable per target and differs across databases, ports and users", () => {
    const base = classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:5432/nihongo");
    const same = classifyProvisioningTarget("postgresql://app:other@127.0.0.1:5432/nihongo");
    const otherDb = classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:5432/other");
    const otherPort = classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:6543/nihongo");
    const otherUser = classifyProvisioningTarget("postgresql://other:pw@127.0.0.1:5432/nihongo");

    // The password is not part of the identity, so rotating it keeps the hash.
    expect(same.identityHash).toBe(base.identityHash);
    expect(otherDb.identityHash).not.toBe(base.identityHash);
    expect(otherPort.identityHash).not.toBe(base.identityHash);
    expect(otherUser.identityHash).not.toBe(base.identityHash);
  });

  it("refuses connection strings that can redirect the driver", () => {
    expect(() =>
      classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:5432/nihongo?host=elsewhere")
    ).toThrow(ProvisioningTargetError);
    expect(() =>
      classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:5432/nihongo?options=-c%20role%3Dadmin")
    ).toThrow(ProvisioningTargetError);
    expect(() =>
      classifyProvisioningTarget("postgresql://app:pw@127.0.0.1:5432/nihongo#frag")
    ).toThrow(ProvisioningTargetError);
    expect(() => classifyProvisioningTarget("mysql://app:pw@127.0.0.1/nihongo")).toThrow(
      ProvisioningTargetError
    );
    expect(() => classifyProvisioningTarget("not a url")).toThrow(ProvisioningTargetError);
    expect(() => classifyProvisioningTarget("postgresql://127.0.0.1:5432/nihongo")).toThrow(
      ProvisioningTargetError
    );
  });
});

describe("execute preconditions", () => {
  const target = classifyProvisioningTarget("postgresql://app:pw@db.internal.example:5432/nihongo");

  it("refuses when any accountability control is missing", () => {
    const result = authorizeProvisioning(target, {});
    expect(result.allowed).toBe(false);
    expect(result.problems.join(" ")).toMatch(/--accept-target-class/);
    expect(result.problems.join(" ")).toMatch(/--confirm-target/);
    expect(result.problems.join(" ")).toMatch(/--operator/);
    expect(result.problems.join(" ")).toMatch(/--approval-ref/);
  });

  it("refuses a mismatched declared class or confirmation hash", () => {
    const result = authorizeProvisioning(target, {
      declaredClass: "LOCAL",
      confirmTarget: "0".repeat(64),
      operator: "Operator",
      approvalRef: "CHG-1",
    });
    expect(result.allowed).toBe(false);
    expect(result.problems.join(" ")).toMatch(/does not match the observed target class/);
    expect(result.problems.join(" ")).toMatch(/identity hash/);
  });

  it("allows a complete, matching declaration", () => {
    const result = authorizeProvisioning(target, {
      declaredClass: "REMOTE",
      confirmTarget: target.identityHash,
      operator: "Operator",
      approvalRef: "CHG-2026-0142",
    });
    expect(result).toEqual({ allowed: true, problems: [] });
  });
});

describe("CLI argument validation", () => {
  it("defaults to the non-writing dry-run mode", () => {
    const options = parseArgs([]);
    expect(options.mode).toBe("dry-run");
    expect(options.dataset).toBe("kanji-corpus-pilot");
    expect(options.expectedKana).toBe(208);
  });

  it("rejects unknown flags, modes and datasets", () => {
    expect(() => parseArgs(["--force"])).toThrow(/Unrecognized argument/);
    expect(() => parseArgs(["--mode=apply"])).toThrow(/Unsupported --mode/);
    expect(() => parseArgs(["--dataset=everything"])).toThrow(/Unsupported --dataset/);
    expect(() => parseArgs(["--expected-kana=0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["dry-run"])).toThrow(/Unrecognized argument/);
  });

  it("parses a complete execute invocation", () => {
    const options = parseArgs([
      "--mode=execute",
      "--dataset=kanji-corpus-pilot",
      "--accept-target-class=MANAGED",
      "--confirm-target=abc",
      "--operator=A. Operator",
      "--approval-ref=CHG-1",
      "--audit-out=/tmp/audit.json",
    ]);
    expect(options).toMatchObject({
      mode: "execute",
      acceptTargetClass: "MANAGED",
      confirmTarget: "abc",
      operator: "A. Operator",
      approvalRef: "CHG-1",
      auditOut: "/tmp/audit.json",
    });
  });
});

describe("the provisioning path is insert-only by construction", () => {
  const files = [
    "src/services/knowledge/canonicalStore.ts",
    "scripts/provision-kanji-corpus.ts",
  ];

  it("contains no statement that can mutate or remove an existing canonical row", () => {
    const forbidden = [
      /\bUPDATE\s+kanji_/i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bALTER\s+TABLE\b/i,
      /\bDROP\s+TABLE\b/i,
      /\bINSERT\s+INTO\b[\s\S]{0,200}?\bON\s+CONFLICT\b/i,
    ];
    for (const file of files) {
      const code = stripComments(source(file));
      for (const pattern of forbidden) {
        expect(`${file}: ${String(pattern)}`).not.toMatch(pattern.test(code) ? pattern : /$^/);
      }
    }
  });

  it("uses no upsert helper that could overwrite canonical content", () => {
    for (const file of files) {
      const code = stripComments(source(file));
      expect(code).not.toMatch(/onConflictDoUpdate|\.update\(|\.delete\(/);
    }
  });

  it("takes an advisory lock before re-reading and writing", () => {
    const code = stripComments(source("src/services/knowledge/canonicalStore.ts"));
    const start = code.indexOf("export async function executeProvisioning");
    expect(start).toBeGreaterThan(-1);
    const body = code.slice(start, code.indexOf("async function verifyInsideTransaction"));

    const beginIndex = body.indexOf('db.query("BEGIN")');
    const lockIndex = body.indexOf("pg_advisory_xact_lock");
    const rereadIndex = body.indexOf("readCanonicalRows(db)");
    const insertIndex = body.indexOf("insertRadicals(db, plan.inserts.radicals)");

    expect(beginIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(beginIndex);
    expect(rereadIndex).toBeGreaterThan(lockIndex);
    expect(insertIndex).toBeGreaterThan(rereadIndex);
  });
});
