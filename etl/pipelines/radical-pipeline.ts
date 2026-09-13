/**
 * Radical & component relationship pipeline (Phase 06.3).
 *
 * Two stages, each with its own provenance run:
 *
 *  1. SEED RADICALS — load the 214 Kangxi radicals as a reference table so a
 *     radical is an entity (character, variants, strokes, meaning) rather than
 *     a bare integer on kanji_characters.
 *
 *  2. PROMOTE COMPONENTS — project KRADFILE component enrichments out of their
 *     JSON blob into first-class kanji_components rows, resolving each
 *     component to a Kangxi radical where one matches.
 *
 * Stage 2 reads only from enrichment rows whose source import run is visible
 * under the caller's provenance policy, so fixture data cannot leak into a
 * production relationship graph by accident.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  etlImportRuns,
  kanjiCharacters,
  kanjiComponents,
  knowledgeEnrichments,
  radicals,
} from "@/db/schema";
import {
  KANGXI_RADICALS,
  RADICAL_CHARACTER_TO_NUMBER,
} from "../data/kangxi-radicals";
import { finishImportRun, startImportRun } from "../provenance/import-run";

const RADICAL_SOURCE = "kangxi-radicals";
const RADICAL_LICENSE =
  "Kangxi radical system: public domain (康熙字典, 1716). English labels curated by NihongoBridge.";
const RADICAL_ATTRIBUTION =
  "Kangxi radical reference (numbers, characters, variants, stroke counts are standardised factual data); English descriptors curated by NihongoBridge, not imported from a third-party database.";

export type RadicalSeedReport = {
  importRunId: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

export type ComponentPromotionReport = {
  importRunId: number;
  kanjiProcessed: number;
  relationshipsInserted: number;
  relationshipsUnchanged: number;
  linkedToRadical: number;
  unlinkedComponents: string[];
};

/** Stage 1 — seed/refresh the 214 Kangxi radicals. Idempotent. */
export async function seedRadicals(): Promise<RadicalSeedReport> {
  const importRunId = await startImportRun({
    source: RADICAL_SOURCE,
    sourceUrl: "internal://etl/data/kangxi-radicals.ts",
    sourceVersion: `kangxi-214-v1`,
    license: RADICAL_LICENSE,
    attribution: RADICAL_ATTRIBUTION,
    // Reference data is generated, not downloaded: there is no upstream
    // artifact to checksum, and claiming one would be dishonest.
    checksumSha256: "",
    checksumVerified: false,
    isFixture: false,
    dryRun: false,
  });

  const existing = await db
    .select({ number: radicals.number, character: radicals.character, meaning: radicals.meaning })
    .from(radicals);
  const existingByNumber = new Map(existing.map((row) => [row.number, row]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const radical of KANGXI_RADICALS) {
    const prior = existingByNumber.get(radical.number);
    if (
      prior &&
      prior.character === radical.character &&
      prior.meaning === radical.meaning
    ) {
      unchanged += 1;
      continue;
    }

    await db
      .insert(radicals)
      .values({
        number: radical.number,
        character: radical.character,
        variants: radical.variants,
        strokeCount: radical.strokeCount,
        meaning: radical.meaning,
        reading: radical.reading,
        importRunId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: radicals.number,
        set: {
          character: radical.character,
          variants: radical.variants,
          strokeCount: radical.strokeCount,
          meaning: radical.meaning,
          reading: radical.reading,
          importRunId,
          updatedAt: new Date(),
        },
      });

    if (prior) updated += 1;
    else inserted += 1;
  }

  const stats = { inserted, updated, unchanged, total: KANGXI_RADICALS.length };
  await finishImportRun(importRunId, "success", stats, []);

  return { importRunId, ...{ inserted, updated, unchanged } };
}

/**
 * Stage 2 — promote KRADFILE component enrichments into kanji_components.
 *
 * `allowFixtureProvenance` mirrors the enrichment visibility policy: fixture
 * derived components are only promoted when the caller opts in explicitly.
 */
export async function promoteComponents(
  options: { allowFixtureProvenance?: boolean } = {},
): Promise<ComponentPromotionReport> {
  const allowFixture = options.allowFixtureProvenance === true;

  const importRunId = await startImportRun({
    source: "kanji-components",
    sourceUrl: "internal://knowledge_enrichments/kradfile-components",
    sourceVersion: "promotion-v1",
    license:
      "Derived from KRADFILE component enrichment; inherits the licence of its source import run.",
    attribution:
      "Component relationships projected from KRADFILE enrichment records; see the originating enrichment run for upstream attribution.",
    checksumSha256: "",
    checksumVerified: false,
    isFixture: allowFixture,
    dryRun: false,
  });

  // Radical resolution map: canonical character AND variants both resolve.
  const radicalRows = await db
    .select({ id: radicals.id, number: radicals.number })
    .from(radicals);
  const radicalIdByNumber = new Map(radicalRows.map((row) => [row.number, row.id]));

  const fixturePredicate = allowFixture
    ? sql<boolean>`true`
    : eq(etlImportRuns.isFixture, false);

  const enrichmentRows = await db
    .select({
      kanjiId: knowledgeEnrichments.subjectId,
      value: knowledgeEnrichments.value,
    })
    .from(knowledgeEnrichments)
    .innerJoin(
      etlImportRuns,
      eq(knowledgeEnrichments.sourceImportRunId, etlImportRuns.id),
    )
    .where(
      and(
        eq(knowledgeEnrichments.subjectType, "kanji_character"),
        eq(knowledgeEnrichments.kind, "radical"),
        eq(knowledgeEnrichments.variantKey, "kradfile-components"),
        eq(etlImportRuns.status, "success"),
        fixturePredicate,
      ),
    );

  // Only attach relationships to kanji that actually exist.
  const kanjiIds = [...new Set(enrichmentRows.map((row) => row.kanjiId))];
  const presentKanji =
    kanjiIds.length === 0
      ? []
      : await db
          .select({ id: kanjiCharacters.id })
          .from(kanjiCharacters)
          .where(inArray(kanjiCharacters.id, kanjiIds));
  const presentKanjiIds = new Set(presentKanji.map((row) => row.id));

  const existingPairs = await db
    .select({ kanjiId: kanjiComponents.kanjiId, component: kanjiComponents.component })
    .from(kanjiComponents);
  const existingKeys = new Set(
    existingPairs.map((row) => `${row.kanjiId}::${row.component}`),
  );

  let kanjiProcessed = 0;
  let relationshipsInserted = 0;
  let relationshipsUnchanged = 0;
  let linkedToRadical = 0;
  const unlinked = new Set<string>();

  for (const row of enrichmentRows) {
    if (!presentKanjiIds.has(row.kanjiId)) continue;

    const value = row.value as { components?: unknown };
    const components = Array.isArray(value?.components)
      ? value.components.filter((item): item is string => typeof item === "string")
      : [];
    if (components.length === 0) continue;

    kanjiProcessed += 1;

    const rowsToInsert: {
      kanjiId: number;
      component: string;
      radicalId: number | null;
      position: number;
      sourceImportRunId: number;
    }[] = [];

    components.forEach((component, index) => {
      if (existingKeys.has(`${row.kanjiId}::${component}`)) {
        relationshipsUnchanged += 1;
        return;
      }

      const radicalNumber = RADICAL_CHARACTER_TO_NUMBER.get(component);
      const radicalId =
        radicalNumber !== undefined ? (radicalIdByNumber.get(radicalNumber) ?? null) : null;
      if (radicalId !== null) linkedToRadical += 1;
      else unlinked.add(component);

      rowsToInsert.push({
        kanjiId: row.kanjiId,
        component,
        radicalId,
        position: index,
        sourceImportRunId: importRunId,
      });
      existingKeys.add(`${row.kanjiId}::${component}`);
    });

    if (rowsToInsert.length > 0) {
      await db.insert(kanjiComponents).values(rowsToInsert).onConflictDoNothing();
      relationshipsInserted += rowsToInsert.length;
    }
  }

  const stats = {
    kanjiProcessed,
    relationshipsInserted,
    relationshipsUnchanged,
    linkedToRadical,
    unlinkedComponents: [...unlinked],
  };
  await finishImportRun(importRunId, "success", stats, []);

  return { importRunId, ...stats, unlinkedComponents: [...unlinked] };
}

/** Convenience: run both stages in order. */
export async function runRadicalPipeline(
  options: { allowFixtureProvenance?: boolean } = {},
) {
  const radicalReport = await seedRadicals();
  const componentReport = await promoteComponents(options);
  return { radicalReport, componentReport };
}
