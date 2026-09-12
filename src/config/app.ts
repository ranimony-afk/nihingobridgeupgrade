/**
 * Application-wide constants fixed by ARCHITECTURE_FREEZE v3.0.
 *
 * These encode frozen decisions. Changing a value here implies a new
 * decision-log entry, not a casual edit.
 */

export const APP_NAME = "NihongoBridge";

/** Canonical API namespaces (API_OWNERSHIP §1). */
export const API_NAMESPACE = {
  health: "/api/health",
  auth: "/api/auth",
  domain: "/api/v2",
  ai: "/api/ai",
  admin: "/api/admin",
} as const;

/**
 * JLPT is stored as a smallint where the number equals the N-level:
 * 5 = N5 (easiest) … 1 = N1 (hardest). NULL means unclassified.
 * Resolved from src/services/learning/jlpt-engine.ts section structure.
 */
export const JLPT_LEVELS = [5, 4, 3, 2, 1] as const;

export type JlptLevel = (typeof JLPT_LEVELS)[number];

export function isJlptLevel(value: unknown): value is JlptLevel {
  return typeof value === "number" && JLPT_LEVELS.some((level) => level === value);
}

/** Display label for a stored level, e.g. 5 -> "N5". Display layers only. */
export function jlptLabel(level: JlptLevel): `N${JlptLevel}` {
  return `N${level}`;
}

/** Parse an external "N5"-style label back to the stored smallint. */
export function parseJlptLabel(label: string): JlptLevel | null {
  const match = /^N([1-5])$/i.exec(label.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return isJlptLevel(value) ? value : null;
}

/** Supported UI/gloss languages. English is always available. */
export const SUPPORTED_LANGUAGES = ["en"] as const;
export const DEFAULT_LANGUAGE = "en";
