/**
 * Native-source enrichment orchestrator.
 *
 * Retains only values whose originating JMdict/KANJIDIC2 import run passes
 * the fail-closed reliability policy. The resulting record preserves both the
 * source record key and the source import run primary key.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionaryReadings,
  dictionarySenses,
  etlImportRuns,
  kanjiCharacters,
} from "@/db/schema";
import { upsertEnrichments, type EnrichmentInput, type EnrichmentLoadResult } from "../loaders/enrichment-loader";
import { assessNativeSource, type ProvenanceRun } from "../provenance/reliability";
import { deriveConjugations } from "./conjugation";
import { deriveFurigana } from "./furigana";

export type NativeEnrichmentOptions = {
  /** Test-only: permit provenance records explicitly marked as fixtures. */
  allowFixtureProvenance?: boolean;
};

export type NativeEnrichmentReport = {
  furigana: EnrichmentLoadResult;
  conjugation: EnrichmentLoadResult;
  frequency: EnrichmentLoadResult;
  radicals: EnrichmentLoadResult;
  strokes: EnrichmentLoadResult;
  skippedAmbiguousFurigana: number;
  skippedUnsupportedConjugation: number;
  skippedUntrustedJmdict: number;
  skippedUntrustedKanjidic: number;
};

const EMPTY_RESULT: EnrichmentLoadResult = { inserted: 0, updated: 0, unchanged: 0 };

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
}

async function sourceRunMap(ids: (number | null)[]): Promise<Map<number, ProvenanceRun>> {
  const resolved = [...new Set(ids.filter((id): id is number => id !== null))];
  if (resolved.length === 0) return new Map();
  const runs = await db
    .select({
      id: etlImportRuns.id,
      source: etlImportRuns.source,
      sourceUrl: etlImportRuns.sourceUrl,
      license: etlImportRuns.license,
      attribution: etlImportRuns.attribution,
      checksumSha256: etlImportRuns.checksumSha256,
      checksumVerified: etlImportRuns.checksumVerified,
      isFixture: etlImportRuns.isFixture,
      status: etlImportRuns.status,
    })
    .from(etlImportRuns)
    .where(inArray(etlImportRuns.id, resolved));
  return new Map(runs.map((run) => [run.id, run]));
}

export async function runNativeEnrichment(
  options: NativeEnrichmentOptions = {},
): Promise<NativeEnrichmentReport> {
  const [entryRows, readingRows, senseRows, characterRows] = await Promise.all([
    db
      .select({
        id: dictionaryEntries.id,
        source: dictionaryEntries.source,
        sourceId: dictionaryEntries.sourceId,
        headword: dictionaryEntries.headword,
        importRunId: dictionaryEntries.importRunId,
      })
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.source, "jmdict")),
    db
      .select({ entryId: dictionaryReadings.entryId, text: dictionaryReadings.text })
      .from(dictionaryReadings),
    db
      .select({ entryId: dictionarySenses.entryId, partsOfSpeech: dictionarySenses.partsOfSpeech })
      .from(dictionarySenses),
    db
      .select({
        id: kanjiCharacters.id,
        source: kanjiCharacters.source,
        literal: kanjiCharacters.literal,
        importRunId: kanjiCharacters.importRunId,
        frequencyRank: kanjiCharacters.frequencyRank,
        radicalClassical: kanjiCharacters.radicalClassical,
        radicalNelson: kanjiCharacters.radicalNelson,
        strokeCount: kanjiCharacters.strokeCount,
        strokeMiscounts: kanjiCharacters.strokeMiscounts,
      })
      .from(kanjiCharacters)
      .where(eq(kanjiCharacters.source, "kanjidic2")),
  ]);

  const [entryRuns, characterRuns] = await Promise.all([
    sourceRunMap(entryRows.map((r) => r.importRunId)),
    sourceRunMap(characterRows.map((r) => r.importRunId)),
  ]);

  const readingsByEntry = new Map<number, string[]>();
  for (const row of readingRows) {
    const list = readingsByEntry.get(row.entryId) ?? [];
    list.push(row.text);
    readingsByEntry.set(row.entryId, list);
  }

  const posByEntry = new Map<number, string[]>();
  for (const row of senseRows) {
    const list = posByEntry.get(row.entryId) ?? [];
    list.push(...stringArray(row.partsOfSpeech));
    posByEntry.set(row.entryId, list);
  }

  const furiganaInputs: EnrichmentInput[] = [];
  const conjugationInputs: EnrichmentInput[] = [];
  const frequencyInputs: EnrichmentInput[] = [];
  const radicalInputs: EnrichmentInput[] = [];
  const strokeInputs: EnrichmentInput[] = [];
  let skippedAmbiguousFurigana = 0;
  let skippedUnsupportedConjugation = 0;
  let skippedUntrustedJmdict = 0;
  let skippedUntrustedKanjidic = 0;

  for (const entry of entryRows) {
    const sourceRun = entry.importRunId === null ? null : entryRuns.get(entry.importRunId);
    const trusted = assessNativeSource(sourceRun, "jmdict", {
      allowFixture: options.allowFixtureProvenance,
    });
    if (!trusted.trusted || !sourceRun) {
      skippedUntrustedJmdict += 1;
      continue;
    }

    const readings = readingsByEntry.get(entry.id) ?? [];
    const furigana = deriveFurigana(entry.headword, readings);
    if (furigana.ok) {
      furiganaInputs.push({
        subjectType: "dictionary_entry",
        subjectId: entry.id,
        kind: "furigana",
        value: { segments: furigana.segments, confidence: "deterministic" },
        sourceImportRunId: sourceRun.id,
        sourceRecordKey: `jmdict:${entry.sourceId}`,
        derivationMethod: "jmdict-unambiguous-reading-alignment",
        derivationVersion: "1",
      });
    } else {
      skippedAmbiguousFurigana += 1;
    }

    const conjugation = deriveConjugations(
      entry.headword,
      readings[0] ?? "",
      [...new Set(posByEntry.get(entry.id) ?? [])],
    );
    if (conjugation.ok) {
      conjugationInputs.push({
        subjectType: "dictionary_entry",
        subjectId: entry.id,
        kind: "conjugation",
        value: { verbClass: conjugation.class, forms: conjugation.forms },
        sourceImportRunId: sourceRun.id,
        sourceRecordKey: `jmdict:${entry.sourceId}`,
        derivationMethod: "jmdict-pos-conjugation",
        derivationVersion: "1",
      });
    } else {
      skippedUnsupportedConjugation += 1;
    }
  }

  for (const character of characterRows) {
    const sourceRun =
      character.importRunId === null ? null : characterRuns.get(character.importRunId);
    const trusted = assessNativeSource(sourceRun, "kanjidic2", {
      allowFixture: options.allowFixtureProvenance,
    });
    if (!trusted.trusted || !sourceRun) {
      skippedUntrustedKanjidic += 1;
      continue;
    }

    const base = {
      subjectType: "kanji_character" as const,
      subjectId: character.id,
      sourceImportRunId: sourceRun.id,
      sourceRecordKey: `kanjidic2:${character.literal}`,
      derivationVersion: "1",
    };

    if (character.frequencyRank !== null) {
      frequencyInputs.push({
        ...base,
        kind: "frequency",
        value: {
          rank: character.frequencyRank,
          scale: "kanjidic2-newspaper-frequency-rank",
        },
        derivationMethod: "kanjidic2-direct-frequency-projection",
      });
    }

    // Both systems are retained as separate, explicitly named values.
    if (character.radicalClassical !== null) {
      radicalInputs.push({
        ...base,
        kind: "radical",
        variantKey: "classical",
        value: { system: "kangxi-classical", number: character.radicalClassical },
        derivationMethod: "kanjidic2-direct-radical-projection",
      });
    }
    if (character.radicalNelson !== null) {
      radicalInputs.push({
        ...base,
        kind: "radical",
        variantKey: "nelson_c",
        value: { system: "nelson_c", number: character.radicalNelson },
        derivationMethod: "kanjidic2-direct-radical-projection",
      });
    }
    if (character.strokeCount !== null) {
      strokeInputs.push({
        ...base,
        kind: "strokes",
        value: {
          count: character.strokeCount,
          miscounts: numberArray(character.strokeMiscounts),
        },
        derivationMethod: "kanjidic2-direct-stroke-projection",
      });
    }
  }

  const [furigana, conjugation, frequency, radicals, strokes] = await Promise.all([
    furiganaInputs.length ? upsertEnrichments(furiganaInputs) : EMPTY_RESULT,
    conjugationInputs.length ? upsertEnrichments(conjugationInputs) : EMPTY_RESULT,
    frequencyInputs.length ? upsertEnrichments(frequencyInputs) : EMPTY_RESULT,
    radicalInputs.length ? upsertEnrichments(radicalInputs) : EMPTY_RESULT,
    strokeInputs.length ? upsertEnrichments(strokeInputs) : EMPTY_RESULT,
  ]);

  return {
    furigana,
    conjugation,
    frequency,
    radicals,
    strokes,
    skippedAmbiguousFurigana,
    skippedUnsupportedConjugation,
    skippedUntrustedJmdict,
    skippedUntrustedKanjidic,
  };
}
