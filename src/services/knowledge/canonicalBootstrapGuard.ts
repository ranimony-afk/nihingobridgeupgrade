/**
 * Bootstrap decision for the canonical Kanji tables.
 *
 * The previous guard asked one question — "are there kana rows?" — and treated
 * a positive answer as proof that the whole Kanji foundation was provisioned.
 * That is a database-state guess, not a dataset check, and it is exactly how a
 * database with 208 kana rows and only the 33-row Mind Tree dataset was left
 * silently incomplete.
 *
 * The guard now evaluates the canonical Kanji datasets themselves:
 *
 *   empty tables          -> seed (the documented bootstrap behaviour)
 *   Mind Tree complete    -> no-op (never rewrite, never repair)
 *   anything else         -> refuse and report
 *
 * "Refuse" is deliberate. A partially provisioned canonical database must reach
 * a human with an authorization decision, not be repaired by whichever request
 * happened to boot first.
 */

import { KANJI_SOURCE_REF } from "@/data/kanji";
import {
  buildCorpusPilotDataset,
  buildMindtreeDataset,
} from "./canonicalDataset";

const MINDTREE = buildMindtreeDataset();
const CORPUS = buildCorpusPilotDataset();

/** Rows the bootstrap datasets require in a fully provisioned first-party DB. */
export const BOOTSTRAP_EXPECTATIONS = {
  mindtreeKanji: MINDTREE.rows.kanji.length,
  mindtreeRadicals: MINDTREE.rows.radicals.length,
  mindtreeComposition: MINDTREE.rows.composition.length,
  corpusKanji: CORPUS.rows.kanji.length,
  corpusRadicals: CORPUS.rows.radicals.length,
  corpusComposition: CORPUS.rows.composition.length,
  firstPartyKanji: MINDTREE.rows.kanji.length + CORPUS.rows.kanji.length,
} as const;

export interface KanjiBootstrapCounts {
  kana: number;
  kanjiTotal: number;
  mindtreeKanji: number;
  corpusKanji: number;
  otherKanji: number;
  radicals: number;
  composition: number;
}

export type KanjiBootstrapDecision =
  | { action: "seed"; reason: string }
  | { action: "skip"; reason: string }
  | { action: "refuse"; reason: string };

export class CanonicalBootstrapStateError extends Error {
  readonly counts: KanjiBootstrapCounts;

  constructor(reason: string, counts: KanjiBootstrapCounts) {
    super(reason);
    this.name = "CanonicalBootstrapStateError";
    this.counts = counts;
  }
}

export function decideKanjiBootstrap(
  counts: KanjiBootstrapCounts
): KanjiBootstrapDecision {
  const { mindtreeKanji, mindtreeRadicals, mindtreeComposition } =
    BOOTSTRAP_EXPECTATIONS;

  const tablesEmpty =
    counts.kanjiTotal === 0 && counts.radicals === 0 && counts.composition === 0;

  if (tablesEmpty) {
    return {
      action: "seed",
      reason:
        "canonical Kanji tables are empty; kana_entries is not consulted because it is not evidence about Kanji provisioning",
    };
  }

  if (counts.mindtreeKanji > mindtreeKanji) {
    return {
      action: "refuse",
      reason:
        `kanji_entries contains ${counts.mindtreeKanji} rows with provenance ${KANJI_SOURCE_REF}, ` +
        `more than the ${mindtreeKanji} the Mind Tree dataset defines. Refusing to seed over an unexpected canonical state.`,
    };
  }

  const mindtreeComplete =
    counts.mindtreeKanji === mindtreeKanji &&
    counts.radicals >= mindtreeRadicals &&
    counts.composition >= mindtreeComposition;

  if (mindtreeComplete) {
    const corpusMissing = counts.corpusKanji < BOOTSTRAP_EXPECTATIONS.corpusKanji;
    return {
      action: "skip",
      reason: corpusMissing
        ? `Mind Tree dataset is provisioned (${counts.mindtreeKanji} kanji, ${counts.radicals} elements, ` +
          `${counts.composition} edges). The ${BOOTSTRAP_EXPECTATIONS.corpusKanji}-row corpus dataset is ` +
          `incomplete (${counts.corpusKanji} rows); bootstrap never repairs it — the operator provisioning ` +
          `procedure does.`
        : `canonical Kanji foundation is already provisioned (${counts.mindtreeKanji} Mind Tree + ` +
          `${counts.corpusKanji} corpus kanji).`,
    };
  }

  return {
    action: "refuse",
    reason:
      `canonical Kanji state is partial or inconsistent: ` +
      `mindtree=${counts.mindtreeKanji}/${mindtreeKanji}, corpus=${counts.corpusKanji}, ` +
      `elements=${counts.radicals}/${mindtreeRadicals}, composition=${counts.composition}/${mindtreeComposition}, ` +
      `foreign=${counts.otherKanji}. Bootstrap will not repair it. An authorized operator must run the ` +
      `controlled provisioning procedure (scripts/provision-kanji-corpus.ts) after reviewing the state.`,
  };
}
