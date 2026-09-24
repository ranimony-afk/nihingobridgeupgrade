/**
 * Phase 14.6A — Grammar knowledge model.
 *
 * Builds on what already exists rather than replacing it:
 *   - `grammar_patterns` table          (src/db/schema.ts:730)
 *   - `src/etl/grammar/types.ts`        (GrammarPatternInput, CanonicalGrammarPattern, JLPT helpers)
 *   - `src/services/grammar/grammarService.ts`
 *
 * This module adds the *relationship* and *provenance* layer that the existing
 * canonical record does not express.
 *
 * ## Non-negotiable: no invented facts
 *
 * Nothing here is populated with grammar facts. In particular:
 *   - No JLPT level is assigned to a pattern without evidence. `jlptEvidence`
 *     records *where a level came from*, and "no evidence" is representable.
 *   - No AI-generated content may be marked authoritative. `provenance.authority`
 *     must be `"canonical"` only for records traceable to a registered source.
 *   - No large grammar corpus is authored here. The existing pilot fixture is
 *     what exists; this file types it, it does not multiply it.
 */

import type { JLPTLevel } from "@/etl/grammar/types";

export type { JLPTLevel };

/**
 * How much authority a grammar record carries.
 *
 * `"ai_suggested"` exists so AI output has somewhere legitimate to live that is
 * *visibly* not canonical. It must never be surfaced as canonical fact.
 */
export type GrammarAuthority = "canonical" | "verified_human" | "ai_suggested";

/** Where a JLPT level came from. Absence of evidence is representable. */
export interface JlptEvidence {
  level: JLPTLevel;
  /**
   * Basis for the assignment.
   *
   * `"unattested"` means someone asserted a level with no traceable source. Such
   * a record is admissible but must be treated as requiring review, never as
   * verified.
   */
  basis:
    | "registered_source"
    | "official_list"
    | "corpus_frequency"
    | "editorial"
    | "unattested";
  /** Source id when `basis` is `registered_source`. */
  sourceId?: string;
  /** Free-text note; never a substitute for `basis`. */
  note?: string;
}

export interface GrammarProvenance {
  authority: GrammarAuthority;
  /** Registered source id, e.g. `first-party:grammar-core:v1`. */
  sourceRef: string;
  /** Model/version when `authority` is `ai_suggested`; omitted otherwise. */
  generatedBy?: string;
  /** True when the record still needs human review before learner exposure. */
  requiresReview: boolean;
}

/** Register/politeness metadata. Distinct axes; not one scale. */
export interface GrammarRegister {
  /** e.g. `"polite" | "plain" | "formal" | "casual"`. */
  politeness?: string;
  /** Whether the pattern is appropriate in business/formal writing. */
  businessAppropriate?: boolean;
  /** `"spoken" | "written" | "both"`. */
  medium?: string;
}

/** Structural constraints on where a pattern may attach. */
export interface GrammarRestrictions {
  /** Required preceding form, e.g. `"Verb て-form"`. */
  precedingForm?: string;
  /** Required following form, when the pattern is not utterance-final. */
  followingForm?: string;
  /** Parts of speech the pattern attaches to. */
  attachesTo?: string[];
  /** Conditions under which the pattern is ungrammatical. */
  excludes?: string[];
}

/**
 * Typed relationships between grammar patterns.
 *
 * Deliberately closed: an open string would let unchecked categories into a
 * canonical graph.
 */
export const GRAMMAR_RELATION_TYPES = [
  "similar",
  "contrast",
  "preceded_by",
  "followed_by",
  "requires",
  "often_confused_with",
  "formal_variant",
  "casual_variant",
  "keigo_variant",
] as const;

export type GrammarRelationType = (typeof GRAMMAR_RELATION_TYPES)[number];

export function isGrammarRelationType(value: string): value is GrammarRelationType {
  return (GRAMMAR_RELATION_TYPES as readonly string[]).includes(value);
}

/**
 * A directed edge between two grammar patterns.
 *
 * `id` is deterministic (see `generateGrammarRelationId`) so the same edge
 * always produces the same identifier and repeated derivation is idempotent.
 *
 * Directionality matters: `contrast` is symmetric in meaning but the edge is
 * still stored directed, and both directions are written explicitly so a query
 * never has to guess.
 */
export interface GrammarRelation {
  id: string;
  fromPatternId: string;
  toPatternId: string;
  relation: GrammarRelationType;
  /** Why these are related. Required — an unexplained edge is not admissible. */
  rationale: string;
  provenance: GrammarProvenance;
}

/** Reference to an example sentence. Intentionally a pointer, not inline text. */
export interface GrammarExampleRef {
  /** Canonical sentence id, when one exists. */
  sentenceRef?: string;
  /** Grammar pattern this example demonstrates. */
  patternId: string;
}

/**
 * The full grammar knowledge model: the canonical record plus the layers the
 * database row does not express.
 */
export interface GrammarKnowledgeRecord {
  /** Canonical `grammar_patterns.id`. */
  id: string;
  slug: string;
  /** Display title, e.g. 〜てから. */
  title: string;
  /** Formation skeleton. */
  structure: string;
  meaning: string;
  explanation: string;
  /**
   * JLPT level, present only where evidence exists. `null` means "not
   * established" — never "assume N5".
   */
  jlpt: JlptEvidence | null;
  register: GrammarRegister;
  restrictions: GrammarRestrictions;
  relations: GrammarRelation[];
  examples: GrammarExampleRef[];
  commonMistakes: string[];
  tags: string[];
  provenance: GrammarProvenance;
}

/**
 * Deterministic relation id.
 *
 * Ordering follows the pattern pair and relation type, so re-deriving the same
 * edge yields the same id and cannot create duplicates. Purely a function of its
 * inputs — no UUIDs, no timestamps, no ordering dependence.
 */
export function generateGrammarRelationId(
  fromPatternId: string,
  relation: GrammarRelationType,
  toPatternId: string
): string {
  return `gr:${fromPatternId}:${relation}:${toPatternId}`;
}

/**
 * True when a record may be shown to learners without further review.
 *
 * Fails closed: AI-suggested content and anything flagged `requiresReview` is
 * excluded, and an unattested JLPT level does not by itself block the record
 * (the level is simply not displayed) — but a record whose only JLPT claim is
 * unattested must still be reviewed before the level is surfaced.
 */
export function isLearnerVisible(record: GrammarKnowledgeRecord): boolean {
  if (record.provenance.authority === "ai_suggested") return false;
  if (record.provenance.requiresReview) return false;
  return true;
}

/** True when the record's JLPT level is backed by traceable evidence. */
export function hasVerifiedJlpt(record: GrammarKnowledgeRecord): boolean {
  if (!record.jlpt) return false;
  return record.jlpt.basis !== "unattested";
}
