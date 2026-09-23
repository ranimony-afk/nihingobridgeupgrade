/**
 * Translation proposal payload shaping — Phase 13.5D-2.
 *
 * Pure client-safe, tolerant read of the staged proposal the 13.5C
 * contract validates server-side (entityType, language, translatedText
 * plus optional secondaryText/contextNotes/sourceRef). Returns null for
 * unusable shapes so the UI can fall back to the generic panel.
 */
import type { TranslationProposal } from "./types";

/** Staged keys the translation preview understands. */
export const KNOWN_TRANSLATION_KEYS: ReadonlySet<string> = new Set([
  "entityType",
  "language",
  "translatedText",
  "secondaryText",
  "contextNotes",
  "sourceRef",
  "verifiedTextHash",
]);

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim() === "" ? null : value;
}

export function parseTranslationProposal(
  payload: unknown
): TranslationProposal | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const translatedText = asNonEmptyString(record.translatedText);
  if (!translatedText) return null;
  return {
    entityType: asNonEmptyString(record.entityType) ?? "dictionary",
    language: asNonEmptyString(record.language) ?? "—",
    translatedText,
    secondaryText: asOptionalString(record.secondaryText),
    contextNotes: asOptionalString(record.contextNotes),
    sourceRef: asOptionalString(record.sourceRef),
  };
}

/** Staged keys outside the known vocabulary (shown under Additional data). */
export function extraTranslationKeys(
  payload: Record<string, unknown>
): string[] {
  return Object.keys(payload)
    .filter((key) => !KNOWN_TRANSLATION_KEYS.has(key))
    .sort();
}
