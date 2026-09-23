import { PILOT_KANJI_ENTRIES, PILOT_RADICALS } from "./fixture";
import { validateAndTransformKanjiData } from "./transformer";
import { loadTransformedKanji } from "./loader";
import type { KanjiETLResult, KanjiEntryInput, KanjiRadicalInput } from "./types";

export interface KanjiPipelineOptions {
  kanji?: KanjiEntryInput[];
  radicals?: KanjiRadicalInput[];
  dryRun?: boolean;
}

export async function runKanjiETLPipeline(
  options: KanjiPipelineOptions = {}
): Promise<KanjiETLResult> {
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
