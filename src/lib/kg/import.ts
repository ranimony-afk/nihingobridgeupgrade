import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  kgAiMeta,
  kgAudio,
  kgCollocations,
  kgFrequency,
  kgFurigana,
  kgGlosses,
  kgGrammar,
  kgIdioms,
  kgImportRuns,
  kgKanji,
  kgKanjiReadings,
  kgLexemes,
  kgNames,
  kgPitch,
  kgSenses,
  kgSentenceLexemes,
  kgSentences,
  kgSources,
  kgStrokes,
  kgTaggings,
  kgTags,
} from "@/db/schema";
import { uid } from "@/lib/utils";
import { COLLOCATIONS, GRAMMAR, IDIOMS, KANJI, LEXEMES, NAMES, SENTENCES } from "./corpus";
import { checksum, validateKanji, validateLexeme } from "./validate";

const SOURCES = [
  { id: "jmdict", name: "JMdict", version: "core-n5", license: "CC-BY-SA EDRDG" },
  { id: "kanjidic2", name: "KANJIDIC2", version: "core-n5", license: "CC-BY-SA EDRDG" },
  { id: "jmnedict", name: "JMnedict", version: "core", license: "CC-BY-SA EDRDG" },
  { id: "tatoeba", name: "Tatoeba", version: "core", license: "CC-BY 2.0" },
  { id: "unidic", name: "UniDic/Furigana", version: "core", license: "BSD/CC" },
  { id: "kanjivg", name: "KanjiVG", version: "core", license: "CC-BY-SA 3.0" },
  { id: "pitch", name: "Pitch accent", version: "core", license: "internal" },
  { id: "freq", name: "Frequency lists", version: "core", license: "internal" },
];

export async function ensureSources() {
  for (const source of SOURCES) {
    await db.insert(kgSources).values(source).onConflictDoNothing();
  }
}

async function tag(slug: string, kind: string, targetType: string, targetId: string) {
  await db.insert(kgTags).values({ id: `tag-${slug}`, slug, kind }).onConflictDoNothing();
  await db.insert(kgTaggings).values({ id: uid("kgt"), tagId: `tag-${slug}`, targetType, targetId }).onConflictDoNothing();
}

export async function importCoreCorpus() {
  await ensureSources();
  const counts: Record<string, number> = { lexemes: 0, kanji: 0, sentences: 0, grammar: 0, skipped: 0, errors: 0 };
  const lemmaIds = new Map<string, string>();

  for (const item of LEXEMES) {
    const issues = validateLexeme(item);
    if (issues.length) {
      counts.errors += 1;
      continue;
    }
    const sum = checksum([item.lemma, item.reading, item.glosses.join(",")]);
    const [existing] = await db
      .select({ id: kgLexemes.id, checksum: kgLexemes.checksum })
      .from(kgLexemes)
      .where(eq(kgLexemes.externalId, item.ext));
    if (existing?.checksum === sum) {
      counts.skipped += 1;
      lemmaIds.set(item.lemma, existing.id);
      continue;
    }
    const id = existing?.id ?? `lex-${item.ext}`;
    if (!existing) {
      await db.insert(kgLexemes).values({
        id,
        sourceId: "jmdict",
        externalId: item.ext,
        lemma: item.lemma,
        reading: item.reading,
        pos: item.pos,
        jlpt: item.jlpt,
        searchDocument: `${item.lemma} ${item.reading} ${item.glosses.join(" ")}`,
        checksum: sum,
      });
    } else {
      await db
        .update(kgLexemes)
        .set({
          lemma: item.lemma,
          reading: item.reading,
          searchDocument: `${item.lemma} ${item.reading} ${item.glosses.join(" ")}`,
          checksum: sum,
        })
        .where(eq(kgLexemes.id, id));
    }
    lemmaIds.set(item.lemma, id);
    const senseId = `sns-${item.ext}`;
    await db.insert(kgSenses).values({ id: senseId, lexemeId: id, senseIndex: 1 }).onConflictDoNothing();
    for (const gloss of item.glosses) {
      await db.insert(kgGlosses).values({ id: uid("gls"), senseId, lang: "en", text: gloss }).onConflictDoNothing();
    }
    await db.insert(kgPitch).values({ id: `pit-${item.ext}`, lexemeId: id, pattern: item.pitch, mora: item.reading }).onConflictDoNothing();
    await db.insert(kgFrequency).values({ id: `frq-${item.ext}`, targetType: "lexeme", targetId: id, corpus: "core", rank: item.freq }).onConflictDoNothing();
    await db.insert(kgFurigana).values({ id: `furi-${item.ext}`, targetType: "lexeme", targetId: id, surface: item.lemma, reading: item.reading }).onConflictDoNothing();
    await db.insert(kgAudio).values({ id: `aud-${item.ext}`, targetType: "lexeme", targetId: id, kind: "tts", value: item.lemma }).onConflictDoNothing();
    await db.insert(kgAiMeta).values({
      id: `ai-${item.ext}`,
      targetType: "lexeme",
      targetId: id,
      model: "nb-core",
      payload: { mnemonic: `${item.lemma} → ${item.glosses[0]}`, domain: item.tags[0] },
    }).onConflictDoNothing();
    for (const label of item.tags) await tag(label, "semantic", "lexeme", id);
    counts.lexemes += 1;
  }

  for (const item of KANJI) {
    const issues = validateKanji({ character: item.ch, strokes: item.strokes });
    if (issues.length) {
      counts.errors += 1;
      continue;
    }
    const sum = checksum([item.ch, String(item.strokes), item.meanings.join(",")]);
    const [existing] = await db.select({ id: kgKanji.id, checksum: kgKanji.checksum }).from(kgKanji).where(eq(kgKanji.character, item.ch));
    const id = existing?.id ?? `kj-${item.ch}`;
    if (existing?.checksum === sum) {
      counts.skipped += 1;
      continue;
    } else if (!existing) {
      await db.insert(kgKanji).values({
        id,
        character: item.ch,
        strokes: item.strokes,
        grade: 1,
        jlpt: item.jlpt,
        freq: item.freq,
        radical: item.radical,
        heisig: item.heisig,
        searchDocument: `${item.ch} ${item.on.join(" ")} ${item.kun.join(" ")} ${item.meanings.join(" ")}`,
        checksum: sum,
      });
      counts.kanji += 1;
    } else {
      await db.update(kgKanji).set({ checksum: sum, strokes: item.strokes }).where(eq(kgKanji.id, id));
      counts.kanji += 1;
    }
    for (const reading of item.on) {
      await db.insert(kgKanjiReadings).values({ id: uid("kjr"), kanjiId: id, kind: "on", reading }).onConflictDoNothing();
    }
    for (const reading of item.kun) {
      await db.insert(kgKanjiReadings).values({ id: uid("kjr"), kanjiId: id, kind: "kun", reading }).onConflictDoNothing();
    }
    for (let stroke = 1; stroke <= item.strokes; stroke += 1) {
      await db
        .insert(kgStrokes)
        .values({ id: `st-${item.ch}-${stroke}`, kanjiId: id, strokeNo: stroke, path: `M${stroke} ${stroke}h8` })
        .onConflictDoNothing();
    }
    await tag("kanji", "script", "kanji", id);
  }

  for (const item of SENTENCES) {
    const id = `stc-${item.ext}`;
    await db
      .insert(kgSentences)
      .values({
        id,
        externalId: item.ext,
        ja: item.ja,
        en: item.en,
        level: item.level,
        searchDocument: `${item.ja} ${item.en}`,
      })
      .onConflictDoNothing();
    for (const lemma of item.lemmas) {
      const lexemeId = lemmaIds.get(lemma);
      if (lexemeId) {
        await db.insert(kgSentenceLexemes).values({ sentenceId: id, lexemeId }).onConflictDoNothing();
      }
    }
    counts.sentences += 1;
  }

  for (const item of GRAMMAR) {
    await db.insert(kgGrammar).values({ id: `gr-${item.slug}`, ...item }).onConflictDoNothing();
    counts.grammar += 1;
  }
  for (const item of IDIOMS) {
    await db.insert(kgIdioms).values({ id: uid("idm"), ...item }).onConflictDoNothing();
  }
  for (const item of COLLOCATIONS) {
    await db.insert(kgCollocations).values({ id: uid("col"), leftJa: item.left, rightJa: item.right, en: item.en }).onConflictDoNothing();
  }
  for (const item of NAMES) {
    await db.insert(kgNames).values({ id: uid("nm"), ...item }).onConflictDoNothing();
  }

  await db.insert(kgImportRuns).values({
    id: uid("run"),
    sourceId: "jmdict",
    status: "ok",
    cursor: "core",
    counts,
    errors: counts.errors,
    checksum: checksum(Object.values(counts).map(String)),
  });
  return counts;
}

export async function importSimulated(limit: number) {
  await ensureSources();
  let created = 0;
  const start = Date.now();
  for (let index = 0; index < limit; index += 1) {
    const ext = `sim-${String(start + index).padStart(8, "0")}`;
    const lemma = `語${index}`;
    const reading = `ご${index}`;
    await db
      .insert(kgLexemes)
      .values({
        id: `lex-${ext}`,
        sourceId: "jmdict",
        externalId: ext,
        lemma,
        reading,
        pos: "noun",
        jlpt: "N5",
        searchDocument: `${lemma} ${reading} simulated lexeme ${index}`,
        checksum: checksum([ext]),
      })
      .onConflictDoNothing();
    created += 1;
  }
  await db.insert(kgImportRuns).values({
    id: uid("run"),
    sourceId: "jmdict",
    status: "ok",
    cursor: `sim-${start}`,
    counts: { simulated: created },
    errors: 0,
    checksum: checksum([String(created)]),
  });
  return { created };
}
