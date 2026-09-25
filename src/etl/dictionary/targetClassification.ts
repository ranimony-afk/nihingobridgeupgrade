/**
 * Fail-closed database target classification for Phase 14.3D.
 *
 * Loopback is necessary for a disposable test target and is never sufficient.
 * A write-capable operation may proceed only when the operator has explicitly
 * classified the target as disposable AND named the expected database.
 * Production targets are recognized and refused by this phase even if a
 * separate authorization flag is present. This module does not open a socket
 * and never returns a password or connection string.
 */

import { createHash } from "crypto";

export const DISPOSABLE_CLASS = "disposable";
export const PRODUCTION_CLASS = "production";

/** Exact domain suffix matches. Not substring searches. */
export const FORBIDDEN_PRODUCTION_DOMAINS = [
  "supabase.co",
  "supabase.com",
  "pooler.supabase.com",
  "neon.tech",
  "vercel-storage.com",
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface TargetIdentity {
  classification: "DISPOSABLE";
  host: string;
  port: string;
  database: string;
  user: string;
  identityHash: string;
}

export interface TargetClassification {
  classification: "DISPOSABLE" | "PRODUCTION" | "UNKNOWN" | "FORBIDDEN" | "AMBIGUOUS";
  decision: "ALLOW" | "REJECT";
  host: string;
  port: string;
  database: string;
  user: string;
  identityHash: string;
  reason: string;
}

export interface ClassificationInput {
  connectionString: string;
  declaredClass?: string;
  expectedDatabase?: string;
  authorizeProduction?: boolean;
}

export function deriveTargetIdentityHash(parts: {
  host: string;
  port: string;
  database: string;
  user: string;
}): string {
  return createHash("sha256")
    .update(["nihongo-db-target-v1", parts.host, parts.port, parts.database, parts.user].join("\0"))
    .digest("hex");
}

export function isExactLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/** True only when host is exactly the domain or a dot-separated subdomain of it. */
export function isDomainOrSubdomain(host: string, domain: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.+$/, "");
  const normalizedDomain = domain.toLowerCase().replace(/\.+$/, "");
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function forbiddenProductionDomain(host: string): string | null {
  for (const domain of FORBIDDEN_PRODUCTION_DOMAINS) {
    if (isDomainOrSubdomain(host, domain)) return domain;
  }
  return null;
}

function rejected(partial: Omit<TargetClassification, "decision">): TargetClassification {
  return { ...partial, decision: "REJECT" };
}

/**
 * Classify a connection string without connecting and without echoing it.
 * ALLOW is returned only for an explicit disposable declaration whose host is
 * an exact loopback name and whose database name matches the expected name.
 */
export function classifyDatabaseTarget(input: ClassificationInput): TargetClassification {
  let url: URL;
  try {
    url = new URL(input.connectionString);
  } catch {
    return rejected({
      classification: "UNKNOWN",
      host: "",
      port: "",
      database: "",
      user: "",
      identityHash: "",
      reason: "TARGET DATABASE UNKNOWN: invalid connection URL",
    });
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const port = url.port || "5432";
  const database = decodeURIComponent(url.pathname.replace(/^\//, "").split("/")[0] ?? "");
  const user = decodeURIComponent(url.username || "");
  const identityHash = deriveTargetIdentityHash({ host, port, database, user });
  const base = { host, port, database, user, identityHash };
  const declared = (input.declaredClass ?? "").trim();

  const forbidden = forbiddenProductionDomain(host);
  if (forbidden) {
    return rejected({
      ...base,
      classification: "FORBIDDEN",
      reason: `TARGET DATABASE FORBIDDEN: Host "${host}" is under forbidden production domain "${forbidden}".`,
    });
  }

  if (declared === PRODUCTION_CLASS) {
    const authorized = input.authorizeProduction === true;
    return rejected({
      ...base,
      classification: "PRODUCTION",
      reason: authorized
        ? "PRODUCTION CONTACT REFUSED: explicit production authorization is a separate gate and does not open a connection in Phase 14.3D-R."
        : "PRODUCTION AUTHORIZATION REQUIRED: target is classified production and this phase will not contact it.",
    });
  }

  if (declared !== DISPOSABLE_CLASS) {
    if (!isExactLoopbackHost(host)) {
      return rejected({
        ...base,
        classification: "AMBIGUOUS",
        reason: `TARGET DATABASE AMBIGUOUS: Host "${host}" is not an explicitly classified disposable target.`,
      });
    }
    return rejected({
      ...base,
      classification: "UNKNOWN",
      reason: "TARGET DATABASE UNCLASSIFIED: loopback is not authorization. Set NIHONGO_DB_TARGET_CLASS=disposable and NIHONGO_DB_EXPECTED_DATABASE to the exact database name.",
    });
  }

  if (!isExactLoopbackHost(host)) {
    return rejected({
      ...base,
      classification: "AMBIGUOUS",
      reason: `TARGET DATABASE AMBIGUOUS: disposable classification refused for non-loopback host "${host}".`,
    });
  }
  if (!database) {
    return rejected({
      ...base,
      classification: "UNKNOWN",
      reason: "TARGET DATABASE UNKNOWN: database name is missing.",
    });
  }
  if (!input.expectedDatabase || input.expectedDatabase !== database) {
    return rejected({
      ...base,
      classification: "UNKNOWN",
      reason: "TARGET DATABASE UNCLASSIFIED: NIHONGO_DB_EXPECTED_DATABASE must exactly match the connection database name. Loopback alone is not authorization.",
    });
  }

  return {
    ...base,
    classification: "DISPOSABLE",
    decision: "ALLOW",
    reason: "Explicit disposable target. Loopback was required and was not treated as sufficient.",
  };
}
