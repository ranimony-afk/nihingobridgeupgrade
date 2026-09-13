import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  ComponentRef,
  KanjiDetail,
  KanjiReading,
  KanjiSearchResult,
  KanjiSummary,
  RadicalDetail,
  RadicalRef,
  VocabularyEntry,
} from "@/types/knowledge";

type Row = Record<string, unknown>;

/**
 * `db.execute()` returns a pg QueryResult in the node-postgres driver but some
 * drizzle versions return the row array directly. Normalise both shapes.
 */
function toRows<T extends Row>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const maybe = result as { rows?: T[] };
  return maybe?.rows ?? [];
}

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const strArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    // pg returns text[] as a postgres array literal when not parsed
    const trimmed = value.replace(/^\{|\}$/g, "");
    return trimmed.length ? trimmed.split(",").map((part) => part.replace(/^"|"$/g, "")) : [];
  }
  return [];
};

/* -------------------------------------------------------------------------- */
/* Kanji                                                                      */
/* -------------------------------------------------------------------------- */

const KANJI_SUMMARY_FIELDS = sql`
  k.id,
  k.literal,
  k.codepoint,
  k.stroke_count,
  k.grade,
  k.frequency,
  k.jlpt_level,
  k.jlpt_legacy_level,
  k.radical_number,
  k.heisig_index,
  k.skip_code,
  coalesce(m.meanings, '{}'::text[]) AS meanings,
  coalesce(rd.on_readings, '{}'::text[]) AS on_readings,
  coalesce(rd.kun_readings, '{}'::text[]) AS kun_readings
`;

const KANJI_SUMMARY_JOINS = sql`
  FROM kanji k
  LEFT JOIN (
    SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
    FROM kanji_meanings
    WHERE lang = 'en'
    GROUP BY kanji_id
  ) m ON m.kanji_id = k.id
  LEFT JOIN (
    SELECT
      kanji_id,
      coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_on'), '{}') AS on_readings,
      coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_kun'), '{}') AS kun_readings
    FROM kanji_readings
    GROUP BY kanji_id
  ) rd ON rd.kanji_id = k.id
`;

function mapKanjiSummary(row: Row): KanjiSummary {
  return {
    id: num(row.id) ?? 0,
    literal: String(row.literal ?? ""),
    strokeCount: num(row.stroke_count),
    grade: num(row.grade),
    frequency: num(row.frequency),
    jlptLevel: num(row.jlpt_level),
    radicalNumber: num(row.radical_number),
    meanings: strArray(row.meanings),
    onReadings: strArray(row.on_readings),
    kunReadings: strArray(row.kun_readings),
  };
}

export async function findKanjiByLiteral(literal: string): Promise<KanjiSummary | null> {
  const result = await getDb().execute(
    sql`SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS} WHERE k.literal = ${literal} LIMIT 1`,
  );
  const [row] = toRows<Row>(result);
  return row ? mapKanjiSummary(row) : null;
}

export interface KanjiRow extends KanjiSummary {
  codepoint: string | null;
  jlptLegacyLevel: number | null;
  heisigIndex: number | null;
  skipCode: string | null;
}

/** Full kanji row (summary + the less frequently used attribute columns). */
export async function findKanjiRowByLiteral(literal: string): Promise<KanjiRow | null> {
  const result = await getDb().execute(
    sql`SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS} WHERE k.literal = ${literal} LIMIT 1`,
  );
  const [row] = toRows<Row>(result);
  if (!row) return null;
  return {
    ...mapKanjiSummary(row),
    codepoint: row.codepoint ? String(row.codepoint) : null,
    jlptLegacyLevel: num(row.jlpt_legacy_level),
    heisigIndex: num(row.heisig_index),
    skipCode: row.skip_code ? String(row.skip_code) : null,
  };
}

export async function findKanjiById(id: number): Promise<KanjiSummary | null> {
  const result = await getDb().execute(
    sql`SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS} WHERE k.id = ${id} LIMIT 1`,
  );
  const [row] = toRows<Row>(result);
  return row ? mapKanjiSummary(row) : null;
}

export async function listKanjiByIds(ids: number[]): Promise<KanjiSummary[]> {
  if (ids.length === 0) return [];
  const unique = Array.from(new Set(ids));
  const result = await getDb().execute(
    sql`SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS}
        WHERE k.id IN (${sql.join(
          unique.map((id) => sql`${id}`),
          sql`, `,
        )})`,
  );
  return toRows<Row>(result).map(mapKanjiSummary);
}

export async function searchKanji(query: string, limit = 24): Promise<KanjiSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const like = `%${trimmed}%`;
  const prefix = `${trimmed}%`;

  const result = await getDb().execute(sql`
    SELECT
      ${KANJI_SUMMARY_FIELDS},
      (
        CASE
          WHEN k.literal = ${trimmed} THEN 100
          WHEN k.literal LIKE ${prefix} THEN 80
          WHEN coalesce(m.meanings, '{}'::text[]) @> ARRAY[${trimmed}]::text[] THEN 60
          WHEN EXISTS (
            SELECT 1 FROM kanji_meanings km
            WHERE km.kanji_id = k.id AND km.meaning ILIKE ${prefix}
          ) THEN 50
          WHEN EXISTS (
            SELECT 1 FROM kanji_readings kr
            WHERE kr.kanji_id = k.id AND kr.reading = ${trimmed}
          ) THEN 45
          WHEN k.literal LIKE ${like} THEN 30
          WHEN EXISTS (
            SELECT 1 FROM kanji_meanings km
            WHERE km.kanji_id = k.id AND km.meaning ILIKE ${like}
          ) THEN 20
          WHEN EXISTS (
            SELECT 1 FROM kanji_readings kr
            WHERE kr.kanji_id = k.id AND kr.reading LIKE ${prefix}
          ) THEN 15
          ELSE 5
        END
      ) AS score,
      (
        CASE
          WHEN k.literal = ${trimmed} OR k.literal LIKE ${prefix} OR k.literal LIKE ${like} THEN 'literal'
          WHEN EXISTS (
            SELECT 1 FROM kanji_meanings km
            WHERE km.kanji_id = k.id AND km.meaning ILIKE ${like}
          ) THEN 'meaning'
          ELSE 'reading'
        END
      ) AS matched_on
    ${KANJI_SUMMARY_JOINS}
    WHERE
      k.literal LIKE ${like}
      OR k.literal = ${trimmed}
      OR EXISTS (
        SELECT 1 FROM kanji_meanings km
        WHERE km.kanji_id = k.id AND km.meaning ILIKE ${like}
      )
      OR EXISTS (
        SELECT 1 FROM kanji_readings kr
        WHERE kr.kanji_id = k.id AND kr.reading LIKE ${like}
      )
    ORDER BY score DESC, k.frequency ASC NULLS LAST, k.literal ASC
    LIMIT ${limit}
  `);

  return toRows<Row>(result).map((row) => ({
    ...mapKanjiSummary(row),
    matchedOn: String(row.matched_on ?? "meaning") as KanjiSearchResult["matchedOn"],
    score: num(row.score) ?? 0,
  }));
}

export async function listKanji(options: {
  jlptLevel?: number;
  limit?: number;
  offset?: number;
}): Promise<KanjiSummary[]> {
  const limit = Math.min(options.limit ?? 48, 200);
  const offset = Math.max(options.offset ?? 0, 0);
  const jlpt = options.jlptLevel ?? null;

  const result = await getDb().execute(sql`
    SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS}
    WHERE (${jlpt}::int IS NULL OR k.jlpt_level = ${jlpt}::int)
    ORDER BY k.frequency ASC NULLS LAST, k.literal ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return toRows<Row>(result).map(mapKanjiSummary);
}

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export async function getKanjiReadings(kanjiId: number): Promise<KanjiReading[]> {
  const result = await getDb().execute(sql`
    SELECT reading, reading_type, position
    FROM kanji_readings
    WHERE kanji_id = ${kanjiId}
    ORDER BY reading_type, position
  `);
  return toRows<Row>(result).map((row) => ({
    reading: String(row.reading ?? ""),
    readingType: String(row.reading_type ?? "ja_on") as KanjiReading["readingType"],
    position: num(row.position) ?? 0,
  }));
}

export async function getRadicalsForKanji(kanjiId: number): Promise<RadicalRef[]> {
  const result = await getDb().execute(sql`
    SELECT r.id, r.literal, r.stroke_count, r.radical_number, r.is_kangxi, r.meanings,
           kr.is_primary, kr.relation
    FROM kanji_radicals kr
    JOIN radicals r ON r.id = kr.radical_id
    WHERE kr.kanji_id = ${kanjiId}
    ORDER BY kr.is_primary DESC, r.stroke_count ASC NULLS LAST, r.literal ASC
  `);
  return toRows<Row>(result).map((row) => ({
    id: num(row.id) ?? 0,
    literal: String(row.literal ?? ""),
    strokeCount: num(row.stroke_count),
    radicalNumber: num(row.radical_number),
    isKangxi: Boolean(row.is_kangxi),
    meanings: row.meanings ? strArray(row.meanings) : [],
    isPrimary: Boolean(row.is_primary),
    relation: String(row.relation ?? "radkfile"),
  }));
}

export async function getComponentsForKanji(kanjiId: number): Promise<ComponentRef[]> {
  const result = await getDb().execute(sql`
    SELECT
      c.id,
      c.literal,
      c.kind,
      c.stroke_count,
      c.usage_count,
      c.kanji_id,
      coalesce(
        cm.meanings,
        CASE WHEN r.meanings IS NULL THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(r.meanings)) END,
        '{}'::text[]) AS meanings,
      coalesce(crd.on_readings, '{}'::text[]) AS on_readings,
      coalesce(crd.kun_readings, '{}'::text[]) AS kun_readings
    FROM kanji_components kc
    JOIN components c ON c.id = kc.component_id
    LEFT JOIN radicals r ON r.id = c.radical_id
    LEFT JOIN (
      SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
      FROM kanji_meanings WHERE lang = 'en' GROUP BY kanji_id
    ) cm ON cm.kanji_id = c.kanji_id
    LEFT JOIN (
      SELECT
        kanji_id,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_on'), '{}') AS on_readings,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_kun'), '{}') AS kun_readings
      FROM kanji_readings GROUP BY kanji_id
    ) crd ON crd.kanji_id = c.kanji_id
    WHERE kc.kanji_id = ${kanjiId}
    ORDER BY kc.position ASC, c.literal ASC
  `);
  return toRows<Row>(result).map((row) => ({
    id: num(row.id) ?? 0,
    literal: String(row.literal ?? ""),
    kind: (row.kind === "kanji" ? "kanji" : "radical_variant") as ComponentRef["kind"],
    strokeCount: num(row.stroke_count),
    usageCount: num(row.usage_count) ?? 0,
    kanjiId: num(row.kanji_id),
    meanings: strArray(row.meanings),
    onReadings: strArray(row.on_readings),
    kunReadings: strArray(row.kun_readings),
  }));
}

/** Kanji that decompose into the given component glyph. */
export async function getKanjiUsingComponentLiteral(
  literal: string,
  limit = 24,
): Promise<KanjiSummary[]> {
  const result = await getDb().execute(sql`
    SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS}
    JOIN kanji_components kc ON kc.kanji_id = k.id
    JOIN components c ON c.id = kc.component_id
    WHERE c.literal = ${literal}
    ORDER BY k.frequency ASC NULLS LAST
    LIMIT ${limit}
  `);
  return toRows<Row>(result).map(mapKanjiSummary);
}

export async function getVocabularyForKanji(
  kanjiId: number,
  limit = 24,
): Promise<VocabularyEntry[]> {
  const result = await getDb().execute(sql`
    SELECT v.id, v.external_id, v.kanji_text, v.kana_text, v.meanings, v.parts_of_speech, v.priority,
           kv.position
    FROM kanji_vocabulary kv
    JOIN vocabulary v ON v.id = kv.vocabulary_id
    WHERE kv.kanji_id = ${kanjiId}
    ORDER BY v.priority ASC NULLS LAST, length(v.kanji_text) ASC, v.kanji_text ASC
    LIMIT ${limit}
  `);
  return toRows<Row>(result).map((row) => ({
    id: num(row.id) ?? 0,
    externalId: row.external_id ? String(row.external_id) : null,
    kanjiText: String(row.kanji_text ?? ""),
    kanaText: row.kana_text ? String(row.kana_text) : null,
    meanings: strArray(row.meanings),
    partsOfSpeech: strArray(row.parts_of_speech),
    priority: num(row.priority),
  }));
}

export async function getVocabularyById(id: number): Promise<VocabularyEntry | null> {
  const result = await getDb().execute(sql`
    SELECT id, external_id, kanji_text, kana_text, meanings, parts_of_speech, priority
    FROM vocabulary WHERE id = ${id} LIMIT 1
  `);
  const [row] = toRows<Row>(result);
  if (!row) return null;
  return {
    id: num(row.id) ?? 0,
    externalId: row.external_id ? String(row.external_id) : null,
    kanjiText: String(row.kanji_text ?? ""),
    kanaText: row.kana_text ? String(row.kana_text) : null,
    meanings: strArray(row.meanings),
    partsOfSpeech: strArray(row.parts_of_speech),
    priority: num(row.priority),
  };
}

export async function searchVocabulary(query: string, limit = 24): Promise<VocabularyEntry[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const like = `%${trimmed}%`;
  const prefix = `${trimmed}%`;

  const result = await getDb().execute(sql`
    SELECT id, external_id, kanji_text, kana_text, meanings, parts_of_speech, priority
    FROM vocabulary
    WHERE kanji_text LIKE ${like}
       OR kana_text LIKE ${like}
       OR meanings::text ILIKE ${like}
    ORDER BY
      CASE
        WHEN kanji_text = ${trimmed} THEN 100
        WHEN kana_text = ${trimmed} THEN 90
        WHEN kanji_text LIKE ${prefix} THEN 80
        WHEN kana_text LIKE ${prefix} THEN 70
        WHEN meanings::text ILIKE ${prefix} THEN 40
        ELSE 20
      END DESC,
      priority ASC NULLS LAST,
      length(kanji_text) ASC
    LIMIT ${limit}
  `);

  return toRows<Row>(result).map((row) => ({
    id: num(row.id) ?? 0,
    externalId: row.external_id ? String(row.external_id) : null,
    kanjiText: String(row.kanji_text ?? ""),
    kanaText: row.kana_text ? String(row.kana_text) : null,
    meanings: strArray(row.meanings),
    partsOfSpeech: strArray(row.parts_of_speech),
    priority: num(row.priority),
  }));
}

export async function countVocabularyForKanji(kanjiId: number): Promise<number> {
  const result = await getDb().execute(sql`
    SELECT count(*)::int AS total FROM kanji_vocabulary WHERE kanji_id = ${kanjiId}
  `);
  const [row] = toRows<Row>(result);
  return num(row?.total) ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Radicals                                                                   */
/* -------------------------------------------------------------------------- */

export async function getRadicalById(id: number): Promise<RadicalDetail | null> {
  const head = await getDb().execute(sql`
    SELECT r.id, r.literal, r.stroke_count, r.radical_number, r.is_kangxi, r.meanings,
           s.code AS source_code
    FROM radicals r
    LEFT JOIN sources s ON s.id = r.source_id
    WHERE r.id = ${id}
    LIMIT 1
  `);
  const [row] = toRows<Row>(head);
  if (!row) return null;

  const radicalId = num(row.id) ?? 0;
  const membership = await getDb().execute(sql`
    SELECT ${KANJI_SUMMARY_FIELDS} ${KANJI_SUMMARY_JOINS}
    JOIN kanji_radicals kr ON kr.kanji_id = k.id
    WHERE kr.radical_id = ${radicalId}
    ORDER BY k.frequency ASC NULLS LAST
    LIMIT 200
  `);
  const total = await getDb().execute(sql`
    SELECT count(*)::int AS total FROM kanji_radicals WHERE radical_id = ${radicalId}
  `);

  return {
    id: radicalId,
    literal: String(row.literal ?? ""),
    strokeCount: num(row.stroke_count),
    radicalNumber: num(row.radical_number),
    isKangxi: Boolean(row.is_kangxi),
    meanings: strArray(row.meanings),
    kanjiCount: num(toRows<Row>(total)[0]?.total) ?? 0,
    kanji: toRows<Row>(membership).map(mapKanjiSummary),
    source: row.source_code ? String(row.source_code) : null,
  };
}

export async function getRadicalByLiteral(literal: string): Promise<RadicalDetail | null> {
  const result = await getDb().execute(sql`
    SELECT id FROM radicals WHERE literal = ${literal} LIMIT 1
  `);
  const [row] = toRows<Row>(result);
  const id = num(row?.id);
  return id ? getRadicalById(id) : null;
}

/* -------------------------------------------------------------------------- */
/* Components                                                                 */
/* -------------------------------------------------------------------------- */

export async function getComponentByLiteral(literal: string): Promise<ComponentRef | null> {
  const result = await getDb().execute(sql`
    SELECT
      c.id, c.literal, c.kind, c.stroke_count, c.usage_count, c.kanji_id,
      coalesce(
        cm.meanings,
        CASE WHEN r.meanings IS NULL THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(r.meanings)) END,
        '{}'::text[]) AS meanings,
      coalesce(crd.on_readings, '{}'::text[]) AS on_readings,
      coalesce(crd.kun_readings, '{}'::text[]) AS kun_readings
    FROM components c
    LEFT JOIN radicals r ON r.id = c.radical_id
    LEFT JOIN (
      SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
      FROM kanji_meanings WHERE lang = 'en' GROUP BY kanji_id
    ) cm ON cm.kanji_id = c.kanji_id
    LEFT JOIN (
      SELECT
        kanji_id,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_on'), '{}') AS on_readings,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_kun'), '{}') AS kun_readings
      FROM kanji_readings GROUP BY kanji_id
    ) crd ON crd.kanji_id = c.kanji_id
    WHERE c.literal = ${literal}
    LIMIT 1
  `);
  const [row] = toRows<Row>(result);
  if (!row) return null;
  return {
    id: num(row.id) ?? 0,
    literal: String(row.literal ?? ""),
    kind: (row.kind === "kanji" ? "kanji" : "radical_variant") as ComponentRef["kind"],
    strokeCount: num(row.stroke_count),
    usageCount: num(row.usage_count) ?? 0,
    kanjiId: num(row.kanji_id),
    meanings: strArray(row.meanings),
    onReadings: strArray(row.on_readings),
    kunReadings: strArray(row.kun_readings),
  };
}

/** Direct decomposition of any kanji literal (used to grow the mind tree). */
export async function getComponentsForKanjiIds(
  kanjiIds: number[],
): Promise<Map<number, ComponentRef[]>> {
  const map = new Map<number, ComponentRef[]>();
  if (kanjiIds.length === 0) return map;
  const unique = Array.from(new Set(kanjiIds));
  const result = await getDb().execute(sql`
    SELECT
      kc.kanji_id,
      c.id, c.literal, c.kind, c.stroke_count, c.usage_count, c.kanji_id AS component_kanji_id,
      coalesce(
        cm.meanings,
        CASE WHEN r.meanings IS NULL THEN NULL
             ELSE ARRAY(SELECT jsonb_array_elements_text(r.meanings)) END,
        '{}'::text[]) AS meanings,
      coalesce(crd.on_readings, '{}'::text[]) AS on_readings,
      coalesce(crd.kun_readings, '{}'::text[]) AS kun_readings
    FROM kanji_components kc
    JOIN components c ON c.id = kc.component_id
    LEFT JOIN radicals r ON r.id = c.radical_id
    LEFT JOIN (
      SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
      FROM kanji_meanings WHERE lang = 'en' GROUP BY kanji_id
    ) cm ON cm.kanji_id = c.kanji_id
    LEFT JOIN (
      SELECT
        kanji_id,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_on'), '{}') AS on_readings,
        coalesce(array_agg(reading ORDER BY position) FILTER (WHERE reading_type = 'ja_kun'), '{}') AS kun_readings
      FROM kanji_readings GROUP BY kanji_id
    ) crd ON crd.kanji_id = c.kanji_id
    WHERE kc.kanji_id IN (${sql.join(
      unique.map((id) => sql`${id}`),
      sql`, `,
    )})
    ORDER BY kc.kanji_id, kc.position
  `);

  for (const row of toRows<Row>(result)) {
    const kanjiId = num(row.kanji_id) ?? 0;
    const bucket = map.get(kanjiId) ?? [];
    bucket.push({
      id: num(row.id) ?? 0,
      literal: String(row.literal ?? ""),
      kind: (row.kind === "kanji" ? "kanji" : "radical_variant") as ComponentRef["kind"],
      strokeCount: num(row.stroke_count),
      usageCount: num(row.usage_count) ?? 0,
      kanjiId: num(row.component_kanji_id),
      meanings: strArray(row.meanings),
      onReadings: strArray(row.on_readings),
      kunReadings: strArray(row.kun_readings),
    });
    map.set(kanjiId, bucket);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Provenance                                                                 */
/* -------------------------------------------------------------------------- */

export async function listSources() {
  const result = await getDb().execute(sql`
    SELECT code, name, version, license, license_url, source_url, retrieved_at, metadata
    FROM sources
    ORDER BY code
  `);
  return toRows<Row>(result).map((row) => ({
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    version: row.version ? String(row.version) : null,
    license: String(row.license ?? ""),
    licenseUrl: row.license_url ? String(row.license_url) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    retrievedAt: row.retrieved_at ? String(row.retrieved_at) : null,
  }));
}

export async function isKnowledgeSchemaProvisioned(): Promise<boolean> {
  try {
    const result = await getDb().execute(
      sql`SELECT to_regclass('public.kanji') IS NOT NULL AS provisioned`,
    );
    const [row] = toRows<Row>(result);
    return Boolean(row?.provisioned);
  } catch {
    return false;
  }
}

export async function getKnowledgeStats() {
  try {
    return await readKnowledgeStats();
  } catch {
    // An un-provisioned schema must never crash the web app.
    return {
      kanji: 0,
      radicals: 0,
      components: 0,
      componentLinks: 0,
      vocabulary: 0,
      vocabularyLinks: 0,
      readings: 0,
      sources: 0,
    };
  }
}

async function readKnowledgeStats() {
  const result = await getDb().execute(sql`
    SELECT
      (SELECT count(*)::int FROM kanji) AS kanji,
      (SELECT count(*)::int FROM radicals) AS radicals,
      (SELECT count(*)::int FROM components) AS components,
      (SELECT count(*)::int FROM kanji_components) AS component_links,
      (SELECT count(*)::int FROM vocabulary) AS vocabulary,
      (SELECT count(*)::int FROM kanji_vocabulary) AS vocabulary_links,
      (SELECT count(*)::int FROM kanji_readings) AS readings,
      (SELECT count(*)::int FROM sources) AS sources
  `);
  const [row] = toRows<Row>(result);
  return {
    kanji: num(row?.kanji) ?? 0,
    radicals: num(row?.radicals) ?? 0,
    components: num(row?.components) ?? 0,
    componentLinks: num(row?.component_links) ?? 0,
    vocabulary: num(row?.vocabulary) ?? 0,
    vocabularyLinks: num(row?.vocabulary_links) ?? 0,
    readings: num(row?.readings) ?? 0,
    sources: num(row?.sources) ?? 0,
  };
}

export type { KanjiDetail, KanjiSummary };
