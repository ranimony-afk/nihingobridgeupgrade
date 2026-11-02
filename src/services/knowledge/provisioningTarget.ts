/**
 * Target classification for the controlled canonical provisioning tool.
 *
 * WHAT THIS IS
 *   An intent and accountability control. It answers "is this the database the
 *   operator said it is, and did they mean to write to a target of this class?"
 *   It is NOT authentication, and it must not be described as such: the real
 *   authorization is the database role the operator holds plus the approved
 *   change record. Possessing a write-capable credential is the permission; the
 *   flags here only make an accidental run against the wrong database hard.
 *
 * WHAT IT GUARANTEES
 *   - Refuses a connection string carrying options (`?host=`, `?options=`) that
 *     could redirect node-postgres away from the parsed authority.
 *   - Refuses when the operator's declared class does not match the observed
 *     class, or when the confirmation hash does not match the exact target.
 *   - Returns only a class and a hash. Host, database and user are never
 *     returned, so no caller can print them by accident.
 */

import { createHash } from "node:crypto";
import { FORBIDDEN_PRODUCTION_DOMAINS, isDomainOrSubdomain } from "@/etl/dictionary/targetClassification";

export type ProvisioningTargetClass = "LOCAL" | "MANAGED" | "REMOTE";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface ProvisioningTarget {
  targetClass: ProvisioningTargetClass;
  /** sha256 over host/port/database/user; the only target detail ever logged. */
  identityHash: string;
  /** Why the target was classified this way — never contains the values. */
  reason: string;
}

export class ProvisioningTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisioningTargetError";
  }
}

function targetHash(parts: {
  host: string;
  port: string;
  database: string;
  user: string;
}): string {
  return createHash("sha256")
    .update(
      ["nihongo-canonical-provisioning-target-v1", parts.host, parts.port, parts.database, parts.user].join("\0")
    )
    .digest("hex");
}

export function classifyProvisioningTarget(connectionString: string): ProvisioningTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ProvisioningTargetError("DATABASE target is not a valid connection URL");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new ProvisioningTargetError("DATABASE target must use the postgres protocol");
  }
  if (url.search || url.hash) {
    throw new ProvisioningTargetError(
      "DATABASE target must not carry query options or a fragment: they can override the parsed host, port or role"
    );
  }
  if (!url.hostname || !url.username || !url.pathname || url.pathname === "/") {
    throw new ProvisioningTargetError("DATABASE target must name an explicit host, user and database");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
  const user = decodeURIComponent(url.username);
  const identityHash = targetHash({ host, port, database, user });

  if (LOOPBACK_HOSTS.has(host)) {
    return {
      targetClass: "LOCAL",
      identityHash,
      reason: "loopback host: disposable or developer database",
    };
  }

  for (const domain of FORBIDDEN_PRODUCTION_DOMAINS) {
    if (isDomainOrSubdomain(host, domain)) {
      return {
        targetClass: "MANAGED",
        identityHash,
        reason: `host is under the managed/hosted domain ${domain}`,
      };
    }
  }

  return {
    targetClass: "REMOTE",
    identityHash,
    reason: "non-loopback host that is not a known hosted domain",
  };
}

export interface ProvisioningAuthorizationInput {
  declaredClass?: string;
  confirmTarget?: string;
  operator?: string;
  approvalRef?: string;
}

export interface ProvisioningAuthorization {
  allowed: boolean;
  problems: string[];
}

/**
 * Authorization inputs required for an execute run. Every failure is collected
 * so the operator sees the whole checklist at once, not one flag at a time.
 */
export function authorizeProvisioning(
  target: ProvisioningTarget,
  input: ProvisioningAuthorizationInput
): ProvisioningAuthorization {
  const problems: string[] = [];
  const declared = (input.declaredClass ?? "").trim().toUpperCase();

  if (!declared) {
    problems.push("--accept-target-class is required for an execute run");
  } else if (declared !== target.targetClass) {
    problems.push(
      `--accept-target-class=${declared} does not match the observed target class ${target.targetClass}`
    );
  }

  if (!input.confirmTarget) {
    problems.push("--confirm-target is required for an execute run");
  } else if (input.confirmTarget !== target.identityHash) {
    problems.push(
      "--confirm-target does not match this target's identity hash (obtain it from a verify/dry-run of the same database)"
    );
  }

  if (!input.operator || input.operator.trim().length < 3) {
    problems.push("--operator is required and must identify a person (>= 3 characters)");
  }

  if (!input.approvalRef || input.approvalRef.trim().length < 4) {
    problems.push("--approval-ref is required and must reference the approved change record");
  }

  return { allowed: problems.length === 0, problems };
}
