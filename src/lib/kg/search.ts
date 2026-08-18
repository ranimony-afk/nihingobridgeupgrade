import { desc, eq, or, sql } from "drizzle-orm";
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
  kgSentences,
  kgStrokes,
} from "@/db/schema";

export async function searchGraph(query: string, limit = 20) {
  const q = query.trim();
  if (!q) return { lexemes: [], kanji: [], sentences: [], grammar: [] };
  const like = `%${q}%`;
  const [lexemes, kanji, sentences, grammar] = await Promise.all([
    db
      .select()
      .from(kgLexemes)
      .where(
        or(
          sql`to_tsvector('simple', ${kgLexemes.searchDocument}) @@ plainto_tsquery('simple', ${q})`,
          sql`${kgLexemes.lemma} ilike ${like}`,
          sql`${kgLexemes.reading} ilike ${like}`,
        ),
      )
      .limit(limit),
    db
      .select()
      .from(kgKanji)
      .where(
        or(
          eq(kgKanji.character, q),
          sql`to_tsvector('simple', ${kgKanji.searchDocument}) @@ plainto_tsquery('simple', ${q})`,
          sql`${kgKanji.searchDocument} ilike ${like}`,
        ),
      )
      .limit(12),
    db
      .select()
      .from(kgSentences)
      .where(or(sql`${kgSentences.ja} ilike ${like}`, sql`${kgSentences.en} ilike ${like}`))
      .limit(12),
    db
      .select()
      .from(kgGrammar)
      .where(or(sql`${kgGrammar.title} ilike ${like}`, sql`${kgGrammar.explanation} ilike ${like}`))
      .limit(8),
  ]);
  return { lexemes, kanji, sentences, grammar };
}

export async function lexemeDetail(id: string) {
  const [lexeme] = await db.select().from(kgLexemes).where(eq(kgLexemes.id, id));
  if (!lexeme) return null;
  const senses = await db.select().from(kgSenses).where(eq(kgSenses.lexemeId, id));
  const glosses = [];
  for (const sense of senses) {
    const rows = await db.select().from(kgGlosses).where(eq(kgGlosses.senseId, sense.id));
    glosses.push(...rows);
  }
  const [pitch] = await db.select().from(kgPitch).where(eq(kgPitch.lexemeId, id));
  const [freq] = await db.select().from(kgFrequency).where(eq(kgFrequency.targetId, id));
  const [audio] = await db.select().from(kgAudio).where(eq(kgAudio.targetId, id));
  const [furi] = await db.select().from(kgFurigana).where(eq(kgFurigana.targetId, id));
  const [ai] = await db.select().from(kgAiMeta).where(eq(kgAiMeta.targetId, id));
  return { lexeme, senses, glosses, pitch, freq, audio, furi, ai };
}

export async function kanjiDetail(character: string) {
  const [kanji] = await db.select().from(kgKanji).where(eq(kgKanji.character, character));
  if (!kanji) return null;
  const readings = await db.select().from(kgKanjiReadings).where(eq(kgKanjiReadings.kanjiId, kanji.id));
  const strokes = await db.select().from(kgStrokes).where(eq(kgStrokes.kanjiId, kanji.id));
  return { kanji, readings, strokes };
}

export async function graphStats() {
  const [lexemes] = await db.select({ n: sql<number>`count(*)` }).from(kgLexemes);
  const [kanji] = await db.select({ n: sql<number>`count(*)` }).from(kgKanji);
  const [sentences] = await db.select({ n: sql<number>`count(*)` }).from(kgSentences);
  const [grammar] = await db.select({ n: sql<number>`count(*)` }).from(kgGrammar);
  const [idioms] = await db.select({ n: sql<number>`count(*)` }).from(kgIdioms);
  const [collocations] = await db.select({ n: sql<number>`count(*)` }).from(kgCollocations);
  const [names] = await db.select({ n: sql<number>`count(*)` }).from(kgNames);
  const runs = await db.select().from(kgImportRuns).orderBy(desc(kgImportRuns.createdAt)).limit(8);
  return {
    lexemes: Number(lexemes?.n ?? 0),
    kanji: Number(kanji?.n ?? 0),
    sentences: Number(sentences?.n ?? 0),
    grammar: Number(grammar?.n ?? 0),
    idioms: Number(idioms?.n ?? 0),
    collocations: Number(collocations?.n ?? 0),
    names: Number(names?.n ?? 0),
    capacity: {
      lexemes: 250_000,
      kanji: 13_000,
      sentences: 1_000_000,
      grammar: 10_000,
      idioms: 30_000,
      collocations: 50_000,
    },
    runs,
  };
}

export async function listGrammar() {
  return db.select().from(kgGrammar);
}

export async function listIdioms() {
  return db.select().from(kgIdioms);
}

export async function listCollocations() {
  return db.select().from(kgCollocations);
}

export async function listKanji() {
  return db.select().from(kgKanji);
}
