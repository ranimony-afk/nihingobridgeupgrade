/**
 * Conjugation Enricher
 *
 * Generates verb and adjective conjugation forms for dictionary entries.
 *
 * DATA SOURCE RELIABILITY: HIGH
 *   - Japanese conjugation is highly regular and rule-based
 *   - Verb class (godan/ichidan/irregular) determines conjugation patterns
 *   - JMdict provides POS tags that identify verb class
 *   - The rules are well-documented and deterministic
 *   - Only ~10 irregular verbs exist (する, 来る, etc.)
 *   - Adjective conjugation (i-adj, na-adj) is similarly regular
 *
 * Adapted from Repo A: src/lib/dict/conjugate.ts
 */

import type { EnrichmentResult } from "./types";

// ─────────────────────────────────────────────
// Conjugation rules
// ─────────────────────────────────────────────

/** Godan verb ending → stem mapping for each conjugation. */
const GODAN_STEMS: Record<string, Record<string, string>> = {
  "う": { a: "わ", i: "い", e: "え", o: "お", t: "っ" },
  "く": { a: "か", i: "き", e: "け", o: "こ", t: "い" },
  "ぐ": { a: "が", i: "ぎ", e: "げ", o: "ご", t: "い" },
  "す": { a: "さ", i: "し", e: "せ", o: "そ", t: "し" },
  "つ": { a: "た", i: "ち", e: "て", o: "と", t: "っ" },
  "ぬ": { a: "な", i: "に", e: "ね", o: "の", t: "ん" },
  "ぶ": { a: "ば", i: "び", e: "べ", o: "ぼ", t: "ん" },
  "む": { a: "ま", i: "み", e: "め", o: "も", t: "ん" },
  "る": { a: "ら", i: "り", e: "れ", o: "ろ", t: "っ" },
};

/** Te-form connectors for godan verbs. */
const TE_CONNECTOR: Record<string, string> = {
  "う": "って", "く": "いて", "ぐ": "いで", "す": "して",
  "つ": "って", "ぬ": "んで", "ぶ": "んで", "む": "んで",
  "る": "って",
};

export interface ConjugationSet {
  dictionary: string;
  masu: string;
  te: string;
  ta: string;
  nai: string;
  potential: string;
  passive: string;
  causative: string;
  imperative: string;
  volitional: string;
  conditional: string;
}

/**
 * Generate conjugations for a verb given its dictionary form and class.
 *
 * @param reading - Dictionary form in hiragana (e.g., "たべる")
 * @param verbClass - "ichidan" | "godan" | "suru" | "kuru"
 */
export function conjugateVerb(
  reading: string,
  verbClass: "ichidan" | "godan" | "suru" | "kuru",
): ConjugationSet | null {
  if (!reading || reading.length < 2) return null;

  switch (verbClass) {
    case "ichidan": {
      const stem = reading.slice(0, -1); // Remove る
      return {
        dictionary: reading,
        masu: stem + "ます",
        te: stem + "て",
        ta: stem + "た",
        nai: stem + "ない",
        potential: stem + "られる",
        passive: stem + "られる",
        causative: stem + "させる",
        imperative: stem + "ろ",
        volitional: stem + "よう",
        conditional: stem + "れば",
      };
    }

    case "godan": {
      const ending = reading.slice(-1);
      const stem = reading.slice(0, -1);
      const map = GODAN_STEMS[ending];
      const te = TE_CONNECTOR[ending];
      if (!map || !te) return null;

      return {
        dictionary: reading,
        masu: stem + map.i + "ます",
        te: stem + te,
        ta: stem + te.replace("て", "た").replace("で", "だ"),
        nai: stem + map.a + "ない",
        potential: stem + map.e + "る",
        passive: stem + map.a + "れる",
        causative: stem + map.a + "せる",
        imperative: stem + map.e,
        volitional: stem + map.o + "う",
        conditional: stem + map.e + "ば",
      };
    }

    case "suru":
      return {
        dictionary: "する",
        masu: "します",
        te: "して",
        ta: "した",
        nai: "しない",
        potential: "できる",
        passive: "される",
        causative: "させる",
        imperative: "しろ",
        volitional: "しよう",
        conditional: "すれば",
      };

    case "kuru":
      return {
        dictionary: "くる",
        masu: "きます",
        te: "きて",
        ta: "きた",
        nai: "こない",
        potential: "こられる",
        passive: "こられる",
        causative: "こさせる",
        imperative: "こい",
        volitional: "こよう",
        conditional: "くれば",
      };

    default:
      return null;
  }
}

/**
 * Detect verb class from JMdict POS tags.
 * Handles both full POS names ("Ichidan verb") and short codes ("v1", "v5k").
 */
export function detectVerbClass(
  pos: string[],
): "ichidan" | "godan" | "suru" | "kuru" | null {
  const joined = pos.join(" ").toLowerCase();
  // Ichidan: "v1", "Ichidan verb"
  if (joined.includes("ichidan") || pos.some((p) => p === "v1")) return "ichidan";
  // Godan: "v5k", "v5m", "v5r", "Godan verb"
  if (joined.includes("godan") || pos.some((p) => /^v5/.test(p))) return "godan";
  // Suru: "vs", "suru verb"
  if (joined.includes("suru") || pos.some((p) => p === "vs" || p === "vs-i")) return "suru";
  // Kuru: "vk", "Kuru verb"
  if (joined.includes("kuru") || pos.some((p) => p === "vk")) return "kuru";
  return null;
}

/**
 * Enrich dictionary entries with conjugation data.
 *
 * Conjugations are deterministic and rule-based — this enricher
 * generates them on the fly rather than looking them up from a data source.
 * The results could be cached in a conjugations column on dictionary_entries
 * or served dynamically from the API.
 */
export async function enrichConjugations(): Promise<EnrichmentResult> {
  const start = Date.now();

  // Conjugation generation is pure logic — no external data source needed.
  // The functions above (conjugateVerb, detectVerbClass) are available
  // for use by the API layer to generate conjugations on demand.
  //
  // Batch pre-computation into the database is optional and would:
  //   1. Query all verb entries from dictionary_entries
  //   2. Detect verb class from POS tags
  //   3. Generate conjugation set
  //   4. Store as JSONB in a conjugations column or separate table
  //
  // This is deferred until the UI needs pre-computed conjugations.

  console.log(
    "[enrichment:conjugations] Conjugation rules loaded. " +
      "Conjugations are generated on-demand via conjugateVerb().",
  );

  return {
    enricher: "conjugations",
    enriched: 0,
    skipped: 0,
    errors: 0,
    durationMs: Date.now() - start,
    reliability: "high",
    sourceNote:
      "Rule-based conjugation generation. Japanese verb conjugation is " +
      "highly regular and deterministic. Only ~10 irregular verbs exist.",
  };
}
