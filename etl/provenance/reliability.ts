/**
 * Provenance admission policy for enrichments (Phase 04.5).
 *
 * The policy is intentionally fail-closed:
 * - Native EDRDG data (JMdict/KANJIDIC2) is accepted in production only from
 *   a successful, checksummed run at a recognised EDRDG host and CC BY-SA.
 * - Fixtures are accepted only when a caller passes allowFixture=true, which
 *   is solely for the deterministic test gate.
 * - JLPT and pitch have no default external source because the research did
 *   not establish an appropriately licensed, production-safe feed. They need
 *   an explicit approval record in a later source-review phase.
 */

export type ProvenanceRun = {
  id: number;
  source: string;
  sourceUrl: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  isFixture: boolean;
  status: string;
};

export type ReliabilityDecision = {
  trusted: boolean;
  mode: "fixture-test" | "production" | "rejected";
  reason: string;
};

function hasChecksum(run: ProvenanceRun): boolean {
  return /^[0-9a-f]{64}$/.test(run.checksumSha256) && run.checksumVerified;
}

function allowedEdrdgHost(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ["www.edrdg.org", "edrdg.org", "ftp.edrdg.org"].includes(url.hostname);
  } catch {
    return false;
  }
}

function compatibleShareAlikeLicense(license: string): boolean {
  return /CC\s*BY-SA\s*(3\.0|4\.0)/i.test(license);
}

export function assessNativeSource(
  run: ProvenanceRun | null | undefined,
  expectedSource: "jmdict" | "kanjidic2" | "kradfile",
  options: { allowFixture?: boolean } = {},
): ReliabilityDecision {
  if (!run) {
    return { trusted: false, mode: "rejected", reason: "missing source import run" };
  }
  if (run.source !== expectedSource) {
    return {
      trusted: false,
      mode: "rejected",
      reason: `expected ${expectedSource} source, got ${run.source}`,
    };
  }
  if (run.status !== "success") {
    return { trusted: false, mode: "rejected", reason: `source run status is ${run.status}` };
  }

  if (run.isFixture) {
    if (options.allowFixture === true) {
      return {
        trusted: true,
        mode: "fixture-test",
        reason: "explicit fixture-mode test provenance",
      };
    }
    return {
      trusted: false,
      mode: "rejected",
      reason: "fixture provenance is prohibited outside explicit test mode",
    };
  }

  if (!hasChecksum(run)) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "production source run lacks a verified SHA-256 checksum",
    };
  }
  if (!allowedEdrdgHost(run.sourceUrl)) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "production source URL is not an approved EDRDG host",
    };
  }
  if (!compatibleShareAlikeLicense(run.license)) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "source licence is not a supported EDRDG CC BY-SA licence",
    };
  }

  return { trusted: true, mode: "production", reason: "verified EDRDG source run" };
}

/**
 * Supplemental source check for no-default-source enrichments (JLPT, pitch).
 * They can only be admitted after a source review explicitly passes an
 * allow-list of source IDs; self-attesting a URL/license in a feed is never
 * sufficient by itself.
 */
export function assessSupplementalSource(
  run: ProvenanceRun | null | undefined,
  expectedSource: "jlpt" | "pitch",
  approvedSourceIds: readonly string[],
  options: { allowFixture?: boolean } = {},
): ReliabilityDecision {
  if (!run) {
    return { trusted: false, mode: "rejected", reason: "missing supplemental source run" };
  }
  if (run.source !== expectedSource) {
    return {
      trusted: false,
      mode: "rejected",
      reason: `expected ${expectedSource} source, got ${run.source}`,
    };
  }
  if (run.status !== "success") {
    return { trusted: false, mode: "rejected", reason: `source run status is ${run.status}` };
  }
  if (run.isFixture && options.allowFixture) {
    if (!hasChecksum(run)) {
      return {
        trusted: false,
        mode: "rejected",
        reason: "fixture source lacks a verified SHA-256 checksum",
      };
    }
    return { trusted: true, mode: "fixture-test", reason: "explicit fixture-mode test provenance" };
  }
  if (run.isFixture) {
    return { trusted: false, mode: "rejected", reason: "fixture provenance outside test mode" };
  }
  if (!approvedSourceIds.includes(run.sourceUrl)) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "supplemental source has not passed the explicit approval allow-list",
    };
  }
  if (!hasChecksum(run)) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "supplemental source lacks a verified SHA-256 checksum",
    };
  }
  if (run.license.trim().length === 0 || run.attribution.trim().length === 0) {
    return {
      trusted: false,
      mode: "rejected",
      reason: "supplemental source omits licence or attribution",
    };
  }
  return { trusted: true, mode: "production", reason: "explicitly approved supplemental source" };
}
