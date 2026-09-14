#!/usr/bin/env node
/**
 * PostgreSQL search projection ETL.
 *
 * Projects the canonical kanji, vocabulary and grammar tables into
 * `search_documents`, then creates/refreshes exact, full-text and pg_trgm
 * indexes. Source tables remain authoritative.
 *
 * Usage:
 *   node etl/run-search-index.mjs
 *   node etl/run-search-index.mjs --only kanji,grammar
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { connect, finishRun, insertBatch, startRun } from "./loaders/postgres.mjs";

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const requested = onlyIndex >= 0 && args[onlyIndex + 1]
  ? args[onlyIndex + 1].split(",").map((value) => value.trim())
  : ["kanji", "dictionary", "grammar", "sentence", "course", "lesson"];
const domains = new Set(requested);
const VALID_DOMAINS = new Set(["kanji", "dictionary", "grammar", "sentence", "course", "lesson"]);

for (const domain of domains) {
  if (!VALID_DOMAINS.has(domain)) {
    throw new Error(`Unknown search domain '${domain}' (expected dictionary, kanji, grammar, sentence, course or lesson)`);
  }
}

const log = (message) => console.log(`[search-etl] ${new Date().toISOString()} ${message}`);

const uniqueStrings = (values) =>
  [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))];

async function main() {
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "postgres-search-index", { domains: [...domains] });
    await client.query("BEGIN");

    // Soft deactivation means a renamed/retired source row cannot survive in
    // search, while history remains inspectable and no DELETE is needed.
    for (const domain of domains) {
      await client.query(
        `UPDATE search_documents SET active = false, indexed_at = now() WHERE entity_type = $1`,
        [domain],
      );
    }
    if (domains.has("dictionary")) {
      await client.query(
        `UPDATE search_documents SET active = false, indexed_at = now() WHERE entity_type = 'vocabulary'`,
      );
    }

    if (domains.has("kanji")) {
      const result = await client.query(`
        SELECT k.id, k.literal, k.frequency, k.jlpt_level, k.stroke_count,
               coalesce(m.meanings, '{}'::text[]) AS meanings,
               coalesce(r.readings, '{}'::text[]) AS readings
        FROM kanji k
        LEFT JOIN (
          SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
          FROM kanji_meanings WHERE lang = 'en' GROUP BY kanji_id
        ) m ON m.kanji_id = k.id
        LEFT JOIN (
          SELECT kanji_id, array_agg(reading ORDER BY reading_type, position) AS readings
          FROM kanji_readings
          WHERE reading_type IN ('ja_on', 'ja_kun', 'nanori')
          GROUP BY kanji_id
        ) r ON r.kanji_id = k.id
      `);

      const rows = result.rows.map((row) => {
        const meanings = uniqueStrings(row.meanings ?? []);
        const readings = uniqueStrings(row.readings ?? []);
        const aliases = uniqueStrings([...readings, ...meanings]);
        const description = meanings.slice(0, 5).join(", ") || null;
        return {
          entity_type: "kanji",
          entity_id: row.id,
          external_key: row.literal,
          route: `/kanji/${encodeURIComponent(row.literal)}`,
          primary_text: row.literal,
          secondary_text: readings.slice(0, 4).join(" / ") || null,
          description,
          aliases: JSON.stringify(aliases),
          search_text: uniqueStrings([
            row.literal,
            ...readings,
            ...meanings,
            row.jlpt_level ? `JLPT N${row.jlpt_level} N${row.jlpt_level}` : "",
            row.stroke_count ? `${row.stroke_count} strokes` : "",
          ]).join(" "),
          jlpt_level: row.jlpt_level,
          priority: row.frequency ?? 100000,
          active: true,
          source_updated_at: null,
          indexed_at: new Date(),
        };
      });
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`kanji: indexed ${rows.length} documents`);
    }

    if (domains.has("dictionary")) {
      const result = await client.query(`
        SELECT id, external_id, kanji_text, kana_text, meanings, parts_of_speech,
               priority, created_at
        FROM vocabulary
      `);
      const rows = result.rows.map((row) => {
        const meanings = uniqueStrings(row.meanings ?? []);
        const parts = uniqueStrings(row.parts_of_speech ?? []);
        const aliases = uniqueStrings([row.kana_text, ...meanings, ...parts]);
        return {
          entity_type: "dictionary",
          entity_id: row.id,
          external_key: row.external_id ?? String(row.id),
          route: `/dictionary?q=${encodeURIComponent(row.kanji_text)}`,
          primary_text: row.kanji_text,
          secondary_text: row.kana_text,
          description: meanings.slice(0, 5).join("; ") || null,
          aliases: JSON.stringify(aliases),
          search_text: uniqueStrings([
            row.kanji_text,
            row.kana_text,
            ...meanings,
            ...parts,
          ]).join(" "),
          jlpt_level: null,
          priority: row.priority ? row.priority * 100 : 1000,
          active: true,
          source_updated_at: row.created_at,
          indexed_at: new Date(),
        };
      });
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`dictionary: indexed ${rows.length} documents`);
    }

    if (domains.has("grammar")) {
      const result = await client.query(`
        SELECT gp.id, gp.slug, gp.title, gp.title_en, gp.summary,
               gp.explanation, gp.formation, gp.notes, gp.jlpt_level,
               gp.sort_order, gp.updated_at,
               coalesce(p.patterns, '{}'::text[]) AS patterns,
               coalesce(p.match_texts, '{}'::text[]) AS match_texts,
               coalesce(t.tags, '{}'::text[]) AS tags,
               coalesce(ms.mistakes, '{}'::text[]) AS mistakes
        FROM grammar_points gp
        LEFT JOIN (
          SELECT grammar_point_id,
                 array_agg(pattern ORDER BY position) AS patterns,
                 array_agg(match_text ORDER BY position) AS match_texts
          FROM grammar_patterns GROUP BY grammar_point_id
        ) p ON p.grammar_point_id = gp.id
        LEFT JOIN (
          SELECT gpt.grammar_point_id, array_agg(gt.slug ORDER BY gt.slug) AS tags
          FROM grammar_point_tags gpt
          JOIN grammar_tags gt ON gt.id = gpt.tag_id
          GROUP BY gpt.grammar_point_id
        ) t ON t.grammar_point_id = gp.id
        LEFT JOIN (
          SELECT grammar_point_id,
                 array_agg(incorrect || ' ' || correction || ' ' || explanation ORDER BY position) AS mistakes
          FROM grammar_mistakes GROUP BY grammar_point_id
        ) ms ON ms.grammar_point_id = gp.id
      `);
      const rows = result.rows.map((row) => {
        const patterns = uniqueStrings(row.patterns ?? []);
        const matches = uniqueStrings(row.match_texts ?? []);
        const tags = uniqueStrings(row.tags ?? []);
        const mistakes = uniqueStrings(row.mistakes ?? []);
        const aliases = uniqueStrings([...patterns, ...matches, ...tags, row.title_en]);
        return {
          entity_type: "grammar",
          entity_id: row.id,
          external_key: row.slug,
          route: `/grammar/${encodeURIComponent(row.slug)}`,
          primary_text: row.title,
          secondary_text: row.title_en,
          description: row.summary,
          aliases: JSON.stringify(aliases),
          search_text: uniqueStrings([
            row.title,
            row.title_en,
            row.summary,
            row.explanation,
            row.formation,
            row.notes,
            ...patterns,
            ...matches,
            ...tags,
            ...mistakes,
            row.jlpt_level ? `JLPT N${row.jlpt_level} N${row.jlpt_level}` : "",
          ]).join(" "),
          jlpt_level: row.jlpt_level,
          priority: (6 - (row.jlpt_level ?? 0)) * 1000 + (row.sort_order ?? 100),
          active: true,
          source_updated_at: row.updated_at,
          indexed_at: new Date(),
        };
      });
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`grammar: indexed ${rows.length} documents`);
    }

    if (domains.has("sentence")) {
      const result = await client.query(`
        SELECT s.id, s.external_id, s.japanese, s.english, s.length,
               s.jlpt_level, s.created_at,
               coalesce(g.patterns, '{}'::text[]) AS grammar_patterns,
               coalesce(g.grammar_titles, '{}'::text[]) AS grammar_titles
        FROM sentences s
        LEFT JOIN (
          SELECT sgp.sentence_id,
                 array_agg(DISTINCT gp.title) AS grammar_titles,
                 array_agg(DISTINCT coalesce(p.pattern, sgp.matched_text)) AS patterns
          FROM sentence_grammar_points sgp
          JOIN grammar_points gp ON gp.id = sgp.grammar_point_id
          LEFT JOIN grammar_patterns p ON p.id = sgp.grammar_pattern_id
          GROUP BY sgp.sentence_id
        ) g ON g.sentence_id = s.id
      `);
      const rows = result.rows.map((row) => {
        const patterns = uniqueStrings(row.grammar_patterns ?? []);
        const grammarTitles = uniqueStrings(row.grammar_titles ?? []);
        return {
          entity_type: "sentence",
          entity_id: row.id,
          external_key: row.external_id ?? String(row.id),
          route: `/sentences/${row.id}`,
          primary_text: row.japanese,
          secondary_text: row.english,
          description: grammarTitles.length ? `Grammar: ${grammarTitles.join(", ")}` : null,
          aliases: JSON.stringify(uniqueStrings([...patterns, ...grammarTitles])),
          search_text: uniqueStrings([
            row.japanese,
            row.english,
            ...patterns,
            ...grammarTitles,
          ]).join(" "),
          jlpt_level: row.jlpt_level,
          priority: 5000 + Math.min(row.length ?? 0, 500),
          active: true,
          source_updated_at: row.created_at,
          indexed_at: new Date(),
        };
      });
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`sentences: indexed ${rows.length} documents`);
    }

    if (domains.has("course")) {
      const result = await client.query(`
        SELECT c.id, c.slug, c.title, c.title_ja, c.summary, c.description,
               c.jlpt_level, c.difficulty, c.position, c.updated_at,
               count(l.id)::int AS lesson_count
        FROM courses c
        LEFT JOIN lessons l ON l.course_id = c.id AND l.published = true
        WHERE c.published = true
        GROUP BY c.id
      `);
      const rows = result.rows.map((row) => ({
        entity_type: "course",
        entity_id: row.id,
        external_key: row.slug,
        route: `/courses/${encodeURIComponent(row.slug)}`,
        primary_text: row.title,
        secondary_text: row.title_ja,
        description: row.summary,
        aliases: JSON.stringify(uniqueStrings([row.title_ja, row.difficulty])),
        search_text: uniqueStrings([
          row.title,
          row.title_ja,
          row.summary,
          row.description,
          row.difficulty,
          row.jlpt_level ? `JLPT N${row.jlpt_level} N${row.jlpt_level}` : "",
          `${row.lesson_count} lessons`,
        ]).join(" "),
        jlpt_level: row.jlpt_level,
        priority: 50 + (row.position ?? 0),
        active: true,
        source_updated_at: row.updated_at,
        indexed_at: new Date(),
      }));
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`courses: indexed ${rows.length} documents`);
    }

    if (domains.has("lesson")) {
      const result = await client.query(`
        SELECT l.id, l.slug, l.title, l.title_ja, l.summary, l.objectives,
               l.content, l.jlpt_level, l.position, l.estimated_minutes,
               l.updated_at, c.slug AS course_slug, c.title AS course_title,
               cm.title AS module_title, cm.title_ja AS module_title_ja,
               coalesce(g.grammar, '{}'::text[]) AS grammar,
               coalesce(k.kanji, '{}'::text[]) AS kanji
        FROM lessons l
        JOIN courses c ON c.id = l.course_id
        LEFT JOIN course_modules cm ON cm.id = l.module_id
        LEFT JOIN (
          SELECT lgp.lesson_id, array_agg(gp.title || ' ' || coalesce(gp.title_en, '')) AS grammar
          FROM lesson_grammar_points lgp JOIN grammar_points gp ON gp.id=lgp.grammar_point_id
          GROUP BY lgp.lesson_id
        ) g ON g.lesson_id=l.id
        LEFT JOIN (
          SELECT lk.lesson_id, array_agg(k.literal) AS kanji
          FROM lesson_kanji lk JOIN kanji k ON k.id=lk.kanji_id
          GROUP BY lk.lesson_id
        ) k ON k.lesson_id=l.id
        WHERE l.published = true AND c.published = true
      `);
      const rows = result.rows.map((row) => {
        const objectives = uniqueStrings(row.objectives ?? []);
        const grammar = uniqueStrings(row.grammar ?? []);
        const kanji = uniqueStrings(row.kanji ?? []);
        return {
          entity_type: "lesson",
          entity_id: row.id,
          external_key: row.slug,
          route: `/lessons/${encodeURIComponent(row.slug)}`,
          primary_text: row.title,
          secondary_text: row.title_ja,
          description: row.summary,
          aliases: JSON.stringify(
            uniqueStrings([
              row.title_ja,
              row.course_title,
              row.module_title,
              row.module_title_ja,
              ...objectives,
              ...grammar,
              ...kanji,
            ]),
          ),
          search_text: uniqueStrings([
            row.title,
            row.title_ja,
            row.summary,
            row.content,
            row.course_title,
            row.module_title,
            row.module_title_ja,
            ...objectives,
            ...grammar,
            ...kanji,
            row.jlpt_level ? `JLPT N${row.jlpt_level} N${row.jlpt_level}` : "",
          ]).join(" "),
          jlpt_level: row.jlpt_level,
          priority: 100 + (row.position ?? 0),
          active: true,
          source_updated_at: row.updated_at,
          indexed_at: new Date(),
        };
      });
      recordsRead += rows.length;
      recordsWritten += await upsertDocuments(client, rows);
      log(`lessons: indexed ${rows.length} documents`);
    }

    await client.query("COMMIT");

    // Index DDL cannot run inside the projection transaction on every hosted
    // provider. It is idempotent and only executes after committed documents.
    const ddl = fs.readFileSync(path.join(process.cwd(), "scripts", "search-indexes.sql"), "utf-8");
    await client.query(ddl);

    if (runId) {
      await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    }
    log(`done: ${recordsRead} records read, ${recordsWritten} documents upserted`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (runId) {
      await finishRun(client, runId, "failed", {
        recordsRead,
        recordsWritten,
        message: error instanceof Error ? error.message : String(error),
      }).catch(() => {});
    }
    log(`FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function upsertDocuments(client, rows) {
  return insertBatch(
    client,
    "search_documents",
    [
      "entity_type",
      "entity_id",
      "external_key",
      "route",
      "primary_text",
      "secondary_text",
      "description",
      "aliases",
      "search_text",
      "jlpt_level",
      "priority",
      "active",
      "source_updated_at",
      "indexed_at",
    ],
    rows,
    {
      conflict: "entity_type, external_key",
      update: `entity_id = EXCLUDED.entity_id,
               route = EXCLUDED.route,
               primary_text = EXCLUDED.primary_text,
               secondary_text = EXCLUDED.secondary_text,
               description = EXCLUDED.description,
               aliases = EXCLUDED.aliases,
               search_text = EXCLUDED.search_text,
               jlpt_level = EXCLUDED.jlpt_level,
               priority = EXCLUDED.priority,
               active = true,
               source_updated_at = EXCLUDED.source_updated_at,
               indexed_at = now()`,
      chunkSize: 300,
    },
  );
}

main();
