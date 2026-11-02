import { PILOT_KANJI_ENTRIES, PILOT_RADICALS } from "./fixture";
import { validateAndTransformKanjiData } from "./transformer";
import { loadTransformedKanji } from "./loader";
import { denyCanonicalKanjiWrite } from "./canonicalWriteGate";
import type { KanjiETLResult, KanjiEntryInput, KanjiRadicalInput } from "./types";

export interface KanjiPipelineOptions {
  kanji?: KanjiEntryInput[];
  radicals?: KanjiRadicalInput[];
  dryRun?: boolean;
}

export async function runKanjiETLPipeline(
  options: KanjiPipelineOptions = {}
): Promise<KanjiETLResult> {
  /*
   * R1S — canonical-write denial.
   *
   * Non-dry-run execution is refused BEFORE the transformer runs, BEFORE the
   * loader is invoked and BEFORE `options.kanji` / `options.radicals` are
   * traversed. The only permitted mode is an explicitly requested dry run.
   *
   * `dryRun` must be the literal boolean `true`. Truthy values ("true", 1,
   * an approval object, a token) do not open the gate, and nothing else in
   * `options` is consulted — there is no caller-generated approval path.
   */
  if (options?.dryRun !== true) {
    denyCanonicalKanjiWrite("runKanjiETLPipeline");
  }

  const rawKanji = options.kanji ?? PILOT_KANJI_ENTRIES;
  const rawRadicals = options.radicals ?? PILOT_RADICALS;

  const transformed = validateAndTransformKanjiData(rawKanji, rawRadicals);

  if (options.dryRun) {
    return {
      radicalsProcessed: transformed.radicals.length,
      radicalsInserted: 0,
      radicalsUpdated: 0,
      radicalsSkipped: transformed.radicals.length,
      kanjiProcessed: transformed.kanji.length,
      kanjiInserted: 0,
      kanjiUpdated: 0,
      kanjiSkipped: transformed.kanji.length,
      compositionProcessed: transformed.compositions.length,
      compositionInserted: 0,
      compositionUpdated: 0,
      compositionSkipped: transformed.compositions.length,
      errors: [],
    };
  }

  return await loadTransformedKanji(transformed);
}
