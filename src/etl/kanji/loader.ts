import { db } from "@/db";
import {
  kanjiEntries,
  kanjiRadicals,
  kanjiComposition,
  knowledgeSources,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TransformedKanjiData } from "./transformer";
import type { KanjiETLResult, KanjiRadicalInput, KanjiEntryInput, KanjiCompositionInput } from "./types";

function areStringArraysEqual(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

function areVocabulariesEqual(
  a: { word: string; reading: string; meaning: string }[] = [],
  b: { word: string; reading: string; meaning: string }[] = []
): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => {
    const o = b[i];
    return o && v.word === o.word && v.reading === o.reading && v.meaning === o.meaning;
  });
}

export async function ensureKanjiSource(): Promise<void> {
  const sourceId = "first-party:kanji-corpus:v1";
  const existing = await db
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.id, sourceId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(knowledgeSources).values({
      id: sourceId,
      name: "KANJIDIC2 / KanjiVG Approved Corpus",
      version: "2026.1",
      license: "CC BY-SA 3.0 / Creative Commons",
      url: "https://www.edrdg.org/wiki/index.php/KANJIDIC2",
      description: "Standard Electronic Dictionary Research and Development Group kanji dictionary and KanjiVG decomposition data.",
      domain: "kanji",
      recordCount: 13108,
    });
  }
}

export async function loadKanjiRadicals(
  radicals: KanjiRadicalInput[],
  result: KanjiETLResult
): Promise<void> {
  for (const rad of radicals) {
    result.radicalsProcessed++;
    // First lookup by ID
    let [existing] = await db
      .select()
      .from(kanjiRadicals)
      .where(eq(kanjiRadicals.id, rad.id))
      .limit(1);

    // If not found by ID, lookup by unique character
    if (!existing) {
      [existing] = await db
        .select()
        .from(kanjiRadicals)
        .where(eq(kanjiRadicals.character, rad.character))
        .limit(1);
    }

    if (!existing) {
      await db.insert(kanjiRadicals).values({
        id: rad.id,
        character: rad.character,
        altForms: rad.altForms ?? [],
        meaning: rad.meaning,
        readingKun: rad.readingKun,
        readingOn: rad.readingOn ?? null,
        strokeCount: rad.strokeCount,
        kangxiNumber: rad.kangxiNumber ?? null,
        category: rad.category,
        typicalRole: rad.typicalRole,
        mnemonic: rad.mnemonic ?? null,
        sourceRef: rad.sourceRef || "first-party:kanji-corpus:v1",
      });
      result.radicalsInserted++;
    } else {
      // Non-destructive check: only update if changed
      const altFormsEqual = areStringArraysEqual(existing.altForms ?? [], rad.altForms ?? []);
      const isUnchanged =
        existing.character === rad.character &&
        existing.meaning === rad.meaning &&
        existing.readingKun === rad.readingKun &&
        existing.readingOn === (rad.readingOn ?? null) &&
        existing.strokeCount === rad.strokeCount &&
        existing.kangxiNumber === (rad.kangxiNumber ?? null) &&
        existing.category === rad.category &&
        existing.typicalRole === rad.typicalRole &&
        altFormsEqual;

      if (isUnchanged) {
        result.radicalsSkipped++;
      } else {
        // Merge/enrich non-null fields
        await db
          .update(kanjiRadicals)
          .set({
            meaning: rad.meaning || existing.meaning,
            readingKun: rad.readingKun || existing.readingKun,
            readingOn: rad.readingOn ?? existing.readingOn,
            mnemonic: rad.mnemonic ?? existing.mnemonic,
            altForms: rad.altForms?.length ? rad.altForms : existing.altForms,
            sourceRef: rad.sourceRef || existing.sourceRef,
          })
          .where(eq(kanjiRadicals.id, existing.id));
        result.radicalsUpdated++;
      }
    }
  }
}

export async function loadKanjiEntries(
  entries: KanjiEntryInput[],
  result: KanjiETLResult
): Promise<void> {
  for (const k of entries) {
    result.kanjiProcessed++;
    // First lookup by ID
    let [existing] = await db
      .select()
      .from(kanjiEntries)
      .where(eq(kanjiEntries.id, k.id))
      .limit(1);

    // If not found by ID, lookup by character
    if (!existing) {
      [existing] = await db
        .select()
        .from(kanjiEntries)
        .where(eq(kanjiEntries.character, k.character))
        .limit(1);
    }

    if (!existing) {
      await db.insert(kanjiEntries).values({
        id: k.id,
        character: k.character,
        meaning: k.meaning,
        readingsKun: k.readingsKun,
        readingsOn: k.readingsOn,
        strokeCount: k.strokeCount,
        jlptLevel: k.jlptLevel,
        gradeLevel: k.gradeLevel ?? null,
        primaryRadicalId: k.primaryRadicalId ?? null,
        mnemonic: k.mnemonic ?? null,
        vocabulary: k.vocabulary,
        sourceRef: k.sourceRef || "first-party:kanji-corpus:v1",
      });
      result.kanjiInserted++;
    } else {
      // Check if content matches
      const kunEqual = areStringArraysEqual(existing.readingsKun, k.readingsKun);
      const onEqual = areStringArraysEqual(existing.readingsOn, k.readingsOn);
      const vocabEqual = areVocabulariesEqual(
        existing.vocabulary as any,
        k.vocabulary
      );

      const isUnchanged =
        existing.character === k.character &&
        existing.meaning === k.meaning &&
        existing.strokeCount === k.strokeCount &&
        existing.jlptLevel === k.jlptLevel &&
        existing.gradeLevel === (k.gradeLevel ?? null) &&
        existing.primaryRadicalId === (k.primaryRadicalId ?? null) &&
        kunEqual &&
        onEqual &&
        vocabEqual;

      if (isUnchanged) {
        result.kanjiSkipped++;
      } else {
        // Non-destructive enrichment: update vocabulary, readings, or mnemonic without breaking existing fields
        await db
          .update(kanjiEntries)
          .set({
            meaning: k.meaning || existing.meaning,
            readingsKun: k.readingsKun?.length ? k.readingsKun : existing.readingsKun,
            readingsOn: k.readingsOn?.length ? k.readingsOn : existing.readingsOn,
            primaryRadicalId: k.primaryRadicalId ?? existing.primaryRadicalId,
            mnemonic: k.mnemonic ?? existing.mnemonic,
            vocabulary: k.vocabulary?.length ? k.vocabulary : existing.vocabulary,
            sourceRef: k.sourceRef || existing.sourceRef,
          })
          .where(eq(kanjiEntries.id, existing.id));
        result.kanjiUpdated++;
      }
    }
  }
}

export async function loadKanjiComposition(
  compositions: KanjiCompositionInput[],
  result: KanjiETLResult
): Promise<void> {
  for (const c of compositions) {
    result.compositionProcessed++;
    const compId = `comp-${c.kanjiId}-${c.elementId}-${c.orderIndex}`;
    const [existing] = await db
      .select()
      .from(kanjiComposition)
      .where(eq(kanjiComposition.id, compId))
      .limit(1);

    const renderedAs = c.renderedAs || c.rendering || "";

    if (!existing) {
      await db.insert(kanjiComposition).values({
        id: compId,
        kanjiId: c.kanjiId,
        elementId: c.elementId,
        role: c.role,
        position: c.position ?? null,
        renderedAs,
        orderIndex: c.orderIndex,
      });
      result.compositionInserted++;
    } else {
      const isUnchanged =
        existing.kanjiId === c.kanjiId &&
        existing.elementId === c.elementId &&
        existing.role === c.role &&
        existing.position === (c.position ?? null) &&
        existing.renderedAs === renderedAs &&
        existing.orderIndex === c.orderIndex;

      if (isUnchanged) {
        result.compositionSkipped++;
      } else {
        await db
          .update(kanjiComposition)
          .set({
            role: c.role,
            position: c.position ?? null,
            renderedAs,
          })
          .where(eq(kanjiComposition.id, compId));
        result.compositionUpdated++;
      }
    }
  }
}

export async function loadTransformedKanji(
  data: TransformedKanjiData
): Promise<KanjiETLResult> {
  const result: KanjiETLResult = {
    radicalsProcessed: 0,
    radicalsInserted: 0,
    radicalsUpdated: 0,
    radicalsSkipped: 0,
    kanjiProcessed: 0,
    kanjiInserted: 0,
    kanjiUpdated: 0,
    kanjiSkipped: 0,
    compositionProcessed: 0,
    compositionInserted: 0,
    compositionUpdated: 0,
    compositionSkipped: 0,
    errors: [],
  };

  try {
    // 1. Ensure source reference
    await ensureKanjiSource();

    // 2. Load Radicals first to satisfy foreign keys
    await loadKanjiRadicals(data.radicals, result);

    // 3. Load Kanji entries
    await loadKanjiEntries(data.kanji, result);

    // 4. Load Composition relationships
    await loadKanjiComposition(data.compositions, result);
  } catch (err: any) {
    result.errors.push(err.message || String(err));
    throw err;
  }

  return result;
}
