/**
 * DictionaryService — Domain service for dictionary lookups.
 *
 * P27: Core dictionary methods.
 * P29: Exact / prefix / fuzzy search using PostgreSQL + pg_trgm.
 *
 * Search strategy (cascading):
 *   1. EXACT  — headword = query OR reading = query
 *   2. PREFIX — headword LIKE 'query%' OR reading LIKE 'query%'
 *   3. FUZZY  — pg_trgm similarity on headword, reading, and glosses
 *
 * Results are ranked: exact matches first, then prefix, then fuzzy
 * (ordered by similarity score descending, then frequency ascending).
 *
 * No external search engine — pure PostgreSQL.
 */

import { eq, ilike, and, sql, asc, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  dictionaryEntries,
  dictionarySenses,
  dictionaryReadings,
  sentences,
  sentenceTranslations,
} from "@/db/schema";
import {
  conjugateVerb,
  detectVerbClass,
  type ConjugationSet,
} from "../../../etl/enrichment/conjugations";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SearchMode = "exact" | "prefix" | "fuzzy" | "auto";

export interface DictionarySearchParams {
  query: string;
  mode?: SearchMode;
  lang?: string;
  jlpt?: number;
  common?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DictionarySearchResult {
  entries: DictionaryEntryView[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  searchMode: SearchMode;
  query: string;
}

export interface DictionaryEntryView {
  id: string;
  headword: string;
  reading: string;
  isCommon: boolean;
  jlptLevel: number | null;
  frequencyRank: number | null;
  pos: string[] | null;
  senses: SenseView[];
  readings: ReadingView[];
  /** Search relevance score (0–1). Present only when returned from search. */
  score?: number;
  /** Which search tier matched. Present only when returned from search. */
  matchType?: "exact" | "prefix" | "fuzzy";
}

export interface SenseView {
  position: number;
  glosses: Record<string, string[]>;
  pos: string[] | null;
  field: string[] | null;
  misc: string[] | null;
  info: string | null;
}

export interface ReadingView {
  reading: string;
  isPrimary: boolean;
  restrictions: string[] | null;
}

export interface ExampleView {
  id: string;
  japanese: string;
  reading: string | null;
  jlptLevel: number | null;
  translations: { lang: string; text: string }[];
}

// ─────────────────────────────────────────────
// Romaji → Kana
// ─────────────────────────────────────────────

const ROMAJI_MAP: Record<string, string> = {
  a: "あ", i: "い", u: "う", e: "え", o: "お",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", shi: "し", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", chi: "ち", ti: "ち", tsu: "つ", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", n: "ん",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  kya: "きゃ", kyu: "きゅ", kyo: "きょ",
  sha: "しゃ", shu: "しゅ", sho: "しょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ",
  nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ",
  mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ",
  gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ",
  bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
};

function romajiToHiragana(romaji: string): string {
  let result = "";
  let i = 0;
  const lower = romaji.toLowerCase();
  while (i < lower.length) {
    if (i + 1 < lower.length && lower[i] === lower[i + 1] && !"aeiouns".includes(lower[i]!)) {
      result += "っ";
      i++;
      continue;
    }
    let matched = false;
    for (const len of [3, 2, 1]) {
      const chunk = lower.slice(i, i + len);
      if (ROMAJI_MAP[chunk]) { result += ROMAJI_MAP[chunk]; i += len; matched = true; break; }
    }
    if (!matched) { result += lower[i]; i++; }
  }
  return result;
}

function isJapanese(text: string): boolean { return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text); }
function isKana(ch: string): boolean { const cp = ch.codePointAt(0)!; return (cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff); }

/**
 * Detect if ASCII text is likely romaji (Japanese reading) vs English.
 * Strategy: convert to hiragana and check if ≥50% of output is valid kana.
 * "taberu" → "たべる" (100% kana → romaji)
 * "study"  → "すつdy" (40% kana → English)
 */
function isLikelyRomaji(text: string): boolean {
  if (!/^[a-zA-Z]+$/.test(text)) return false;
  if (text.length <= 1) return false;
  const converted = romajiToHiragana(text);
  const kanaCount = Array.from(converted).filter(isKana).length;
  // Require 80%+ kana for romaji detection — prevents "effort", "safe", "study" false positives
  return kanaCount / converted.length >= 0.8;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const DictionaryService = {
  /**
   * Three-tier cascading search: exact → prefix → fuzzy.
   *
   * In "auto" mode (default):
   *   1. Try exact match. If results found, return immediately.
   *   2. Try prefix match. If results found, return.
   *   3. Fall back to fuzzy (pg_trgm similarity).
   *
   * Explicit modes ("exact", "prefix", "fuzzy") skip the cascade.
   * Input type is auto-detected: Japanese → headword/reading,
   * romaji → converted to kana, English → glosses.
   */
  async search(params: DictionarySearchParams): Promise<DictionarySearchResult> {
    const { query, mode = "auto", jlpt, common, page = 1, pageSize = 20 } = params;
    const offset = (page - 1) * pageSize;

    if (!query || query.trim().length === 0) {
      return this._listAll({ jlpt, common, page, pageSize });
    }

    const filters: SQL[] = [];
    if (jlpt) filters.push(eq(dictionaryEntries.jlptLevel, jlpt));
    if (common) filters.push(eq(dictionaryEntries.isCommon, true));

    // Detect input type
    const isJp = isJapanese(query);
    const isRm = !isJp && isLikelyRomaji(query);
    const searchReading = isRm ? romajiToHiragana(query) : isJp ? query : null;

    if (mode === "exact" || mode === "auto") {
      const result = await this._searchExact(query, searchReading, filters, page, pageSize, offset);
      if (result.total > 0 || mode === "exact") {
        return { ...result, searchMode: "exact", query };
      }
    }

    if (mode === "prefix" || mode === "auto") {
      const result = await this._searchPrefix(query, searchReading, filters, page, pageSize, offset);
      if (result.total > 0 || mode === "prefix") {
        return { ...result, searchMode: "prefix", query };
      }
    }

    // Fuzzy (always reached in auto mode if exact+prefix returned 0)
    const result = await this._searchFuzzy(query, searchReading, filters, page, pageSize, offset);
    return { ...result, searchMode: "fuzzy", query };
  },

  // ─── Exact Match ───

  async _searchExact(
    query: string, kana: string | null, filters: SQL[],
    page: number, pageSize: number, offset: number,
  ): Promise<Omit<DictionarySearchResult, "searchMode" | "query">> {
    const conditions: SQL[] = [...filters];

    if (kana) {
      // Japanese or romaji → exact on headword or reading
      conditions.push(
        or(
          eq(dictionaryEntries.headword, query),
          eq(dictionaryEntries.reading, query),
          eq(dictionaryEntries.reading, kana),
        )!,
      );
    } else {
      // English → exact word match in glosses
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${dictionarySenses}
          WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id}
          AND ${dictionarySenses.glosses}::text ILIKE ${"%" + query + "%"}
        )`,
      );
    }

    return this._executeSearch(and(...conditions)!, page, pageSize, offset, "exact");
  },

  // ─── Prefix Match ───

  async _searchPrefix(
    query: string, kana: string | null, filters: SQL[],
    page: number, pageSize: number, offset: number,
  ): Promise<Omit<DictionarySearchResult, "searchMode" | "query">> {
    const conditions: SQL[] = [...filters];

    if (kana) {
      conditions.push(
        or(
          sql`${dictionaryEntries.headword} LIKE ${query + "%"}`,
          sql`${dictionaryEntries.reading} LIKE ${query + "%"}`,
          sql`${dictionaryEntries.reading} LIKE ${kana + "%"}`,
        )!,
      );
    } else {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${dictionarySenses}
          WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id}
          AND ${dictionarySenses.glosses}::text ILIKE ${query + "%"}
        )`,
      );
    }

    return this._executeSearch(and(...conditions)!, page, pageSize, offset, "prefix");
  },

  // ─── Fuzzy Match (pg_trgm) ───

  async _searchFuzzy(
    query: string, kana: string | null, filters: SQL[],
    page: number, pageSize: number, offset: number,
  ): Promise<Omit<DictionarySearchResult, "searchMode" | "query">> {
    // pg_trgm similarity threshold (0.0–1.0, lower = more permissive)
    const threshold = 0.15;
    const conditions: SQL[] = [...filters];
    let orderExpr: SQL;

    if (kana) {
      // Fuzzy on headword + reading using GREATEST similarity
      const searchTerm = kana || query;
      conditions.push(
        sql`(
          similarity(${dictionaryEntries.headword}, ${query}) > ${threshold}
          OR similarity(${dictionaryEntries.reading}, ${searchTerm}) > ${threshold}
        )`,
      );
      orderExpr = sql`GREATEST(
        similarity(${dictionaryEntries.headword}, ${query}),
        similarity(${dictionaryEntries.reading}, ${searchTerm})
      ) DESC`;
    } else {
      // Fuzzy on glosses text
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM ${dictionarySenses}
          WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id}
          AND similarity(${dictionarySenses.glosses}::text, ${query}) > ${threshold}
        )`,
      );
      orderExpr = sql`(
        SELECT MAX(similarity(${dictionarySenses.glosses}::text, ${query}))
        FROM ${dictionarySenses}
        WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id}
      ) DESC`;
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dictionaryEntries)
      .where(where);
    const total = countResult[0]?.count ?? 0;

    const entries = await db
      .select()
      .from(dictionaryEntries)
      .where(where)
      .orderBy(orderExpr)
      .limit(pageSize)
      .offset(offset);

    const views = await Promise.all(
      entries.map(async (e) => {
        const view = await this._hydrateEntry(e);
        // Compute similarity score for the result
        const searchTerm = kana || query;
        const simResult = await db.execute(
          sql`SELECT GREATEST(
            similarity(${e.headword}, ${query}),
            similarity(${e.reading}, ${searchTerm})
          ) AS score`,
        );
        const score = Number((simResult.rows[0] as Record<string, unknown>)?.score ?? 0);
        return { ...view, score: Math.round(score * 1000) / 1000, matchType: "fuzzy" as const };
      }),
    );

    return {
      entries: views,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  // ─── List all (no query) ───

  async _listAll(params: {
    jlpt?: number; common?: boolean; page: number; pageSize: number;
  }): Promise<DictionarySearchResult> {
    const { jlpt, common, page, pageSize } = params;
    const offset = (page - 1) * pageSize;
    const conditions: SQL[] = [];
    if (jlpt) conditions.push(eq(dictionaryEntries.jlptLevel, jlpt));
    if (common) conditions.push(eq(dictionaryEntries.isCommon, true));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dictionaryEntries)
      .where(where);
    const total = countResult[0]?.count ?? 0;

    const entries = await db
      .select()
      .from(dictionaryEntries)
      .where(where)
      .orderBy(asc(dictionaryEntries.frequencyRank))
      .limit(pageSize)
      .offset(offset);

    const views = await Promise.all(entries.map((e) => this._hydrateEntry(e)));
    return { entries: views, total, page, pageSize, totalPages: Math.ceil(total / pageSize), searchMode: "auto", query: "" };
  },

  // ─── Shared execute ───

  async _executeSearch(
    where: SQL, page: number, pageSize: number, offset: number,
    matchType: "exact" | "prefix",
  ): Promise<Omit<DictionarySearchResult, "searchMode" | "query">> {
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(dictionaryEntries)
      .where(where);
    const total = countResult[0]?.count ?? 0;

    const entries = await db
      .select()
      .from(dictionaryEntries)
      .where(where)
      .orderBy(asc(dictionaryEntries.frequencyRank))
      .limit(pageSize)
      .offset(offset);

    const views = await Promise.all(
      entries.map(async (e) => {
        const view = await this._hydrateEntry(e);
        return { ...view, score: matchType === "exact" ? 1.0 : 0.9, matchType };
      }),
    );

    return { entries: views, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  // ─────────────────────────────────────────────
  // Non-search methods (unchanged from P27)
  // ─────────────────────────────────────────────

  async getById(id: string): Promise<DictionaryEntryView | null> {
    const entry = await db.select().from(dictionaryEntries).where(eq(dictionaryEntries.id, id)).limit(1);
    if (entry.length === 0) return null;
    return this._hydrateEntry(entry[0]!);
  },

  async getByReading(reading: string): Promise<DictionaryEntryView[]> {
    const entries = await db.select().from(dictionaryEntries)
      .where(ilike(dictionaryEntries.reading, `%${reading}%`))
      .orderBy(asc(dictionaryEntries.frequencyRank)).limit(50);
    return Promise.all(entries.map((e) => this._hydrateEntry(e)));
  },

  async getByKanji(kanji: string): Promise<DictionaryEntryView[]> {
    const entries = await db.select().from(dictionaryEntries)
      .where(ilike(dictionaryEntries.headword, `%${kanji}%`))
      .orderBy(asc(dictionaryEntries.frequencyRank)).limit(50);
    return Promise.all(entries.map((e) => this._hydrateEntry(e)));
  },

  async getByRomaji(romaji: string): Promise<DictionaryEntryView[]> {
    return this.getByReading(romajiToHiragana(romaji));
  },

  async getByEnglish(english: string): Promise<DictionaryEntryView[]> {
    const entries = await db.select().from(dictionaryEntries)
      .where(sql`EXISTS (SELECT 1 FROM ${dictionarySenses} WHERE ${dictionarySenses.entryId} = ${dictionaryEntries.id} AND ${dictionarySenses.glosses}::text ILIKE ${"%" + english + "%"})`)
      .orderBy(asc(dictionaryEntries.frequencyRank)).limit(50);
    return Promise.all(entries.map((e) => this._hydrateEntry(e)));
  },

  async getExamples(entryId: string, limit = 10): Promise<ExampleView[]> {
    const rows = await db.select().from(sentences).where(eq(sentences.dictionaryEntryId, entryId)).limit(limit);
    const result: ExampleView[] = [];
    for (const row of rows) {
      const trans = await db.select({ lang: sentenceTranslations.lang, text: sentenceTranslations.translation })
        .from(sentenceTranslations).where(eq(sentenceTranslations.sentenceId, row.id));
      result.push({ id: row.id, japanese: row.japanese, reading: row.reading, jlptLevel: row.jlptLevel, translations: trans });
    }
    return result;
  },

  async getConjugations(entryId: string): Promise<ConjugationSet | null> {
    const entry = await db.select({ reading: dictionaryEntries.reading, pos: dictionaryEntries.pos })
      .from(dictionaryEntries).where(eq(dictionaryEntries.id, entryId)).limit(1);
    if (entry.length === 0 || !entry[0]!.pos) return null;
    const verbClass = detectVerbClass(entry[0]!.pos);
    if (!verbClass) return null;
    return conjugateVerb(entry[0]!.reading, verbClass);
  },

  async getJLPT(level: number, page = 1, pageSize = 50): Promise<DictionarySearchResult> {
    return this.search({ query: "", jlpt: level, page, pageSize });
  },

  // ─── Internal ───

  async _hydrateEntry(entry: typeof dictionaryEntries.$inferSelect): Promise<DictionaryEntryView> {
    const [senseRows, readingRows] = await Promise.all([
      db.select().from(dictionarySenses).where(eq(dictionarySenses.entryId, entry.id)).orderBy(asc(dictionarySenses.position)),
      db.select().from(dictionaryReadings).where(eq(dictionaryReadings.entryId, entry.id)),
    ]);
    return {
      id: entry.id, headword: entry.headword, reading: entry.reading,
      isCommon: entry.isCommon, jlptLevel: entry.jlptLevel,
      frequencyRank: entry.frequencyRank, pos: entry.pos,
      senses: senseRows.map((s) => ({
        position: s.position, glosses: s.glosses as Record<string, string[]>,
        pos: s.pos, field: s.field, misc: s.misc, info: s.info,
      })),
      readings: readingRows.map((r) => ({
        reading: r.reading, isPrimary: r.isPrimary, restrictions: r.restrictions,
      })),
    };
  },
};
