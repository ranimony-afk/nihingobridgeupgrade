import type { FindingSeverity, FindingStatus } from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
};

export const ENTERPRISE_DOMAINS = [
  "architecture",
  "folder-structure",
  "api-routes",
  "database",
  "authentication",
  "middleware",
  "cms",
  "admin-dashboard",
  "localization",
  "dictionary",
  "kanji-explorer",
  "grammar",
  "quiz-engine",
  "conversation-lab",
  "leaderboards",
  "dam",
  "rest-api",
  "deployment",
  "supabase",
  "drizzle",
  "seo",
  "performance",
  "accessibility",
  "security",
] as const;

export function isOpenStatus(status: FindingStatus | string) {
  return status === "open" || status === "in_progress";
}

export function readinessScore(
  findings: { severity: string; status: string }[],
) {
  const penalty = findings.reduce((sum, finding) => {
    if (!isOpenStatus(finding.status)) return sum;
    const weight = SEVERITY_WEIGHT[finding.severity as FindingSeverity] ?? 3;
    return sum + weight;
  }, 0);
  return clamp(100 - penalty, 0, 100);
}

export function countBy<T extends string>(items: { [K in T]?: string }[], key: T) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = item[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function domainCoverage(presentDomains: string[]) {
  const set = new Set(presentDomains);
  const covered = ENTERPRISE_DOMAINS.filter((domain) => set.has(domain)).length;
  return Math.round((covered / ENTERPRISE_DOMAINS.length) * 100);
}

export function nextStatus(current: FindingStatus, action: "start" | "resolve" | "reopen" | "accept") {
  if (action === "start") return "in_progress" as const;
  if (action === "resolve") return "resolved" as const;
  if (action === "accept") return "accepted_risk" as const;
  return "open" as const;
}

export function canTransition(current: FindingStatus, next: FindingStatus) {
  if (current === next) return true;
  if (current === "open") return next === "in_progress" || next === "accepted_risk";
  if (current === "in_progress") return next === "resolved" || next === "open" || next === "accepted_risk";
  if (current === "resolved") return next === "open";
  if (current === "accepted_risk") return next === "open";
  return false;
}
