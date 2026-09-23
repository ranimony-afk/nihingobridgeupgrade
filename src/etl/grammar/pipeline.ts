import { GRAMMAR_MULTI_LEVEL_FIXTURE } from "./fixture";
import { transformGrammarPattern, type GrammarValidationIssue } from "./transformer";
import { GrammarLoader } from "./loader";
import { GRAMMAR_CORE_SOURCE_REF, type CanonicalGrammarPattern, type GrammarPatternInput } from "./types";

export interface GrammarPipelineOptions {
  patterns?: GrammarPatternInput[];
  dryRun?: boolean;
}

export interface GrammarPipelineExecutionReport {
  sourceRecords: number;
  parsed: number;
  valid: number;
  invalid: number;
  duplicates: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ slug?: string; issues: GrammarValidationIssue[] }>;
  isDryRun: boolean;
  sampleRecords: CanonicalGrammarPattern[];
}

export class GrammarPipeline {
  /**
   * Executes the grammar ingestion pipeline on pattern inputs.
   */
  static async run(
    options: GrammarPipelineOptions = {},
  ): Promise<GrammarPipelineExecutionReport> {
    const inputs = options.patterns || GRAMMAR_MULTI_LEVEL_FIXTURE;
    const dryRun = options.dryRun ?? false;

    let parsed = 0;
    let valid = 0;
    let invalid = 0;
    let duplicates = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const errors: Array<{ slug?: string; issues: GrammarValidationIssue[] }> = [];
    const validPatterns: CanonicalGrammarPattern[] = [];
    const seenSlugs = new Set<string>();
    const seenIds = new Set<string>();

    for (const input of inputs) {
      parsed++;
      const { record, isValid, errors: validationErrors } = transformGrammarPattern(
        input,
        GRAMMAR_CORE_SOURCE_REF,
      );

      if (!isValid || !record) {
        invalid++;
        errors.push({ slug: input.slug, issues: validationErrors });
        continue;
      }

      if (seenSlugs.has(record.slug) || seenIds.has(record.id)) {
        duplicates++;
        continue;
      }
      seenSlugs.add(record.slug);
      seenIds.add(record.id);

      valid++;
      validPatterns.push(record);
    }

    if (validPatterns.length > 0) {
      const result = await GrammarLoader.loadBatch(validPatterns, { dryRun });
      inserted = result.inserted;
      updated = result.updated;
      skipped = result.skipped;
    }

    return {
      sourceRecords: inputs.length,
      parsed,
      valid,
      invalid,
      duplicates,
      inserted,
      updated,
      skipped,
      errors,
      isDryRun: dryRun,
      sampleRecords: validPatterns.slice(0, 3),
    };
  }
}
