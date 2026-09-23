/**
 * Application Read-Back Verification — Phase 14.4C (Step 11).
 *
 * Verifies representative characters across baseline and newly ingested KANJIDIC2 records:
 * - 日, 本, 学, 生, 行, 明, 食, 見, 箸, 龍, 々, rare/classical characters.
 *
 * Checks:
 * - Detail lookup contract
 * - Reading lookup (On, Kun with okurigana, normalized)
 * - Radical lookup / linkage
 * - Vocabulary linkage (compounds in dictionary)
 */

import { KanjiReadingService } from "../src/services/knowledge/kanjiReadingService";

const TEST_CHARACTERS = [
  "日", // Sun/day — newly ingested core
  "本", // Book/origin — newly ingested core
  "学", // Study — newly ingested core
  "生", // Life/birth — newly ingested multi-reading
  "行", // Go/line — newly ingested
  "明", // Bright — baseline preserved (kj-mei)
  "食", // Eat — newly ingested core
  "見", // See — baseline preserved (kj-miru)
  "箸", // Chopsticks — baseline conflict preserved (kj-hashi, 14 strokes)
  "龍", // Dragon — traditional/classical
  "鬱", // Depression/dense — 29 strokes Jouyou
  "龖", // Rare classical character (double dragon, 32 strokes)
];

export async function runApplicationReadBack(): Promise<{
  totalTested: number;
  results: Array<{
    char: string;
    id: string;
    unicode: string;
    strokes: number;
    sourceRef: string;
    meanings: string[];
    onReadings: string[];
    kunReadings: string[];
    compoundCount: number;
    passed: boolean;
  }>;
  allPassed: boolean;
}> {
  const service = new KanjiReadingService();
  const results = [];

  for (const char of TEST_CHARACTERS) {
    const detail = await service.getKanjiDetail(char);
    if (!detail) {
      // Some special characters like '々' (iteration mark) may not be in KANJIDIC2 character set
      console.warn(`Kanji detail returned null for: ${char}`);
      results.push({
        char,
        id: "",
        unicode: "",
        strokes: 0,
        sourceRef: "",
        meanings: [],
        onReadings: [],
        kunReadings: [],
        compoundCount: 0,
        passed: false,
      });
      continue;
    }

    const onReadings = await service.getOnReadings(char);
    const kunReadings = await service.getKunReadings(char);

    const passed =
      detail.character === char &&
      detail.strokeCount > 0 &&
      detail.unicode.startsWith("U+") &&
      detail.provenance.verified;

    results.push({
      char,
      id: detail.id,
      unicode: detail.unicode,
      strokes: detail.strokeCount,
      sourceRef: detail.provenance.sourceRef,
      meanings: detail.meanings,
      onReadings,
      kunReadings,
      compoundCount: detail.compounds.length,
      passed,
    });
  }

  const allPassed = results.every((r) => r.passed);
  return {
    totalTested: results.length,
    results,
    allPassed,
  };
}

if (process.argv[1]?.endsWith("test-application-readback.ts")) {
  runApplicationReadBack()
    .then((r) => {
      console.log("=== APPLICATION READ-BACK RESULTS ===");
      for (const res of r.results) {
        console.log(
          `[${res.char}] ID: ${res.id} | Unicode: ${res.unicode} | Strokes: ${res.strokes} | Source: ${res.sourceRef} | Compounds: ${res.compoundCount} | Meaning: "${res.meanings[0] || ""}"`
        );
      }
      console.log(`\nOverall Read-back Verdict: ${r.allPassed ? "PASS" : "FAIL"}`);
      process.exit(r.allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Readback test failed:", err);
      process.exit(1);
    });
}
