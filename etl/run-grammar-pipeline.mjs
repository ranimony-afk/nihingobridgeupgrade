#!/usr/bin/env node
/**
 * Grammar ETL — curated grammar points + corpus-harvested example sentences.
 *
 *   node etl/run-grammar-pipeline.mjs
 *   node etl/run-grammar-pipeline.mjs --max-examples 8 --max-length 45
 *
 * Additive only: every write is INSERT ... ON CONFLICT DO UPDATE.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { loadGrammarSeed, parseTanakaExamples } from "./parsers/tanaka-examples.mjs";
import {
  connect,
  fetchIdMap,
  finishRun,
  insertBatch,
  startRun,
  upsertSources,
} from "./loaders/postgres.mjs";
import { ensureSources } from "./sources/registry.mjs";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

const MAX_EXAMPLES = Number(argValue("--max-examples", "8"));
const MAX_LENGTH = Number(argValue("--max-length", "45"));
const SEED_FILE = path.join(process.cwd(), "etl", "data", "grammar-points.json");

const log = (message) => console.log(`[grammar-etl] ${new Date().toISOString()} ${message}`);

/** Loads a seed file whose payload is a `slug -> array` map. */
function loadSlottedSeed(file, key) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  return parsed[key] ?? {};
}

async function main() {
  const sources = ensureSources([
    "tanaka",
    "grammar-seed",
    "grammar-structures",
    "grammar-mistakes",
  ]);
  const seed = loadGrammarSeed(SEED_FILE);
  const structures = loadSlottedSeed(path.join(process.cwd(), "etl", "data", "grammar-structures.json"), "structures");
  const mistakes = loadSlottedSeed(path.join(process.cwd(), "etl", "data", "grammar-mistakes.json"), "mistakes");
  log(
    `seed contains ${seed.points.length} points · ${Object.keys(structures).length} structure sets · ${Object.keys(mistakes).length} mistake sets (${seed.license})`,
  );

  const client = await connect();
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    const runId = await startRun(client, "grammar-points", {
      points: seed.points.length,
      maxExamples: MAX_EXAMPLES,
      maxLength: MAX_LENGTH,
    });
    await client.query("BEGIN");

    const sourceIds = await upsertSources(client, sources);
    const tanakaId = sourceIds.get("tanaka");
    const seedId = sourceIds.get("grammar-seed");
    const structuresId = sourceIds.get("grammar-structures");
    const mistakesId = sourceIds.get("grammar-mistakes");

    /* ------------------------- points & patterns -------------------------- */
    const pointRows = seed.points.map((point) => ({
      slug: point.slug,
      title: point.title,
      title_en: point.titleEn ?? null,
      summary: point.summary ?? null,
      explanation: point.explanation ?? null,
      formation: point.formation ?? null,
      notes: point.notes ?? null,
      jlpt_level: point.jlptLevel ?? null,
      register: point.register ?? "neutral",
      sort_order: point.sortOrder ?? 100,
      source_id: seedId,
    }));

    recordsWritten += await insertBatch(
      client,
      "grammar_points",
      [
        "slug",
        "title",
        "title_en",
        "summary",
        "explanation",
        "formation",
        "notes",
        "jlpt_level",
        "register",
        "sort_order",
        "source_id",
      ],
      pointRows,
      {
        conflict: "slug",
        update: `title = EXCLUDED.title,
                 title_en = EXCLUDED.title_en,
                 summary = EXCLUDED.summary,
                 explanation = EXCLUDED.explanation,
                 formation = EXCLUDED.formation,
                 notes = EXCLUDED.notes,
                 jlpt_level = EXCLUDED.jlpt_level,
                 register = EXCLUDED.register,
                 sort_order = EXCLUDED.sort_order,
                 source_id = EXCLUDED.source_id,
                 updated_at = now()`,
      },
    );

    const pointIds = await fetchIdMap(client, "grammar_points", "slug");

    /* -------------------------------- tags -------------------------------- */
    const tagSlugs = [...new Set(seed.points.flatMap((point) => point.tags ?? []))];
    if (tagSlugs.length > 0) {
      recordsWritten += await insertBatch(
        client,
        "grammar_tags",
        ["slug", "label"],
        tagSlugs.map((slug) => ({ slug, label: slug.replace(/-/g, " ") })),
        { conflict: "slug", update: "label = EXCLUDED.label" },
      );
    }
    const tagIds = await fetchIdMap(client, "grammar_tags", "slug");

    const pointTagRows = [];
    for (const point of seed.points) {
      const pointId = pointIds.get(point.slug);
      for (const tag of point.tags ?? []) {
        const tagId = tagIds.get(tag);
        if (pointId && tagId) pointTagRows.push({ grammar_point_id: pointId, tag_id: tagId });
      }
    }
    recordsWritten += await insertBatch(
      client,
      "grammar_point_tags",
      ["grammar_point_id", "tag_id"],
      pointTagRows,
      { conflict: "grammar_point_id, tag_id" },
    );

    /* ------------------------------- patterns ----------------------------- */
    const patternRows = [];
    for (const point of seed.points) {
      const pointId = pointIds.get(point.slug);
      if (!pointId) continue;
      point.patterns.forEach((pattern, index) => {
        patternRows.push({
          grammar_point_id: pointId,
          pattern: pattern.pattern,
          match_text: pattern.match,
          is_core: pattern.isCore !== false,
          note: pattern.note ?? null,
          position: index,
          source_id: seedId,
        });
        recordsRead += 1;
      });
    }
    recordsWritten += await insertBatch(
      client,
      "grammar_patterns",
      ["grammar_point_id", "pattern", "match_text", "is_core", "note", "position", "source_id"],
      patternRows,
      {
        conflict: "grammar_point_id, pattern",
        update: `match_text = EXCLUDED.match_text,
                 is_core = EXCLUDED.is_core,
                 note = EXCLUDED.note,
                 position = EXCLUDED.position`,
      },
    );

    const patternRowsDb = await client.query(
      `SELECT id, grammar_point_id, pattern, match_text FROM grammar_patterns`,
    );
    const patterns = patternRowsDb.rows.map((row) => ({
      id: row.id,
      grammarPointId: row.grammar_point_id,
      pattern: row.pattern,
      matchText: row.match_text,
    }));

    /* ------------------------------ relations ----------------------------- */
    const relationRows = [];
    for (const point of seed.points) {
      const fromId = pointIds.get(point.slug);
      for (const relation of point.relations ?? []) {
        const toId = pointIds.get(relation.slug);
        if (fromId && toId) {
          relationRows.push({
            from_point_id: fromId,
            to_point_id: toId,
            relation: relation.relation,
            note: relation.note ?? null,
          });
        }
      }
    }
    recordsWritten += await insertBatch(
      client,
      "grammar_relations",
      ["from_point_id", "to_point_id", "relation", "note"],
      relationRows,
      { conflict: "from_point_id, to_point_id, relation", update: "note = EXCLUDED.note" },
    );

    /* --------------------- structures & mistakes -------------------------- */
    recordsWritten += await insertBatch(
      client,
      "grammar_structures",
      ["grammar_point_id", "position", "label", "content", "required", "note", "source_id"],
      Object.entries(structures).flatMap(([slug, slots]) => {
        const pointId = pointIds.get(slug);
        if (!pointId) return [];
        return slots.map((slot, index) => ({
          grammar_point_id: pointId,
          position: index,
          label: slot.label,
          content: slot.content,
          required: slot.required !== false,
          note: slot.note ?? null,
          source_id: structuresId,
        }));
      }),
      {
        conflict: "grammar_point_id, position",
        update: `label = EXCLUDED.label,
                 content = EXCLUDED.content,
                 required = EXCLUDED.required,
                 note = EXCLUDED.note,
                 source_id = EXCLUDED.source_id`,
      },
    );

    recordsWritten += await insertBatch(
      client,
      "grammar_mistakes",
      [
        "grammar_point_id",
        "position",
        "incorrect",
        "correction",
        "explanation",
        "severity",
        "source_id",
      ],
      Object.entries(mistakes).flatMap(([slug, items]) => {
        const pointId = pointIds.get(slug);
        if (!pointId) return [];
        return items.map((item, index) => ({
          grammar_point_id: pointId,
          position: index,
          incorrect: item.incorrect,
          correction: item.correction,
          explanation: item.explanation,
          severity: item.severity ?? "common",
          source_id: mistakesId,
        }));
      }),
      {
        conflict: "grammar_point_id, incorrect",
        update: `correction = EXCLUDED.correction,
                 explanation = EXCLUDED.explanation,
                 severity = EXCLUDED.severity,
                 position = EXCLUDED.position,
                 source_id = EXCLUDED.source_id`,
      },
    );
    log(
      `curated: ${Object.values(structures).flat().length} structure slots, ${Object.values(mistakes).flat().length} common mistakes`,
    );

    /* --------------------- harvest example sentences ---------------------- */
    const counts = new Map();
    const totalPoints = new Set(patterns.map((p) => p.grammarPointId)).size;
    const examples = [];
    const matches = [];
    const tanakaFile = sources.find((source) => source.code === "tanaka");

    outer: for await (const sentence of parseTanakaExamples(tanakaFile.path)) {
      if (sentence.japanese.length > MAX_LENGTH) continue;
      recordsRead += 1;
      for (const pattern of patterns) {
        const have = counts.get(pattern.grammarPointId) ?? 0;
        if (have >= MAX_EXAMPLES) continue;
        const index = sentence.japanese.indexOf(pattern.matchText);
        if (index === -1) continue;

        const key = `${pattern.grammarPointId}:${sentence.externalId}`;
        if (matches.some((match) => match.key === key)) continue;

        examples.push({
          grammar_point_id: pattern.grammarPointId,
          japanese: sentence.japanese,
          english: sentence.english,
          external_id: sentence.externalId,
          length: sentence.japanese.length,
          source_id: tanakaId,
        });
        matches.push({
          key,
          external_id: sentence.externalId,
          grammar_point_id: pattern.grammarPointId,
          grammar_pattern_id: pattern.id,
          matched_text: pattern.matchText,
          start_index: index,
          end_index: index + pattern.matchText.length,
        });
        counts.set(pattern.grammarPointId, have + 1);
      }
      if (
        counts.size === totalPoints &&
        [...counts.values()].every((value) => value >= MAX_EXAMPLES)
      ) {
        break outer;
      }
    }

    recordsWritten += await insertBatch(
      client,
      "grammar_examples",
      ["grammar_point_id", "japanese", "english", "external_id", "length", "source_id"],
      examples,
      { conflict: "grammar_point_id, external_id" },
    );
    log(`harvested ${examples.length} example sentences`);

    /* --------------------------- match evidence --------------------------- */
    const exampleRows = await client.query(
      `SELECT id, grammar_point_id, external_id FROM grammar_examples`,
    );
    const exampleKeyToId = new Map(
      exampleRows.rows.map((row) => [`${row.grammar_point_id}:${row.external_id}`, row.id]),
    );
    recordsWritten += await insertBatch(
      client,
      "grammar_example_matches",
      [
        "example_id",
        "grammar_point_id",
        "grammar_pattern_id",
        "matched_text",
        "start_index",
        "end_index",
      ],
      matches
        .map((match) => ({ ...match, example_id: exampleKeyToId.get(match.key) }))
        .filter((match) => match.example_id)
        .map((match) => ({
          example_id: match.example_id,
          grammar_point_id: match.grammar_point_id,
          grammar_pattern_id: match.grammar_pattern_id,
          matched_text: match.matched_text,
          start_index: match.start_index,
          end_index: match.end_index,
        })),
      { conflict: "example_id, matched_text, start_index" },
    );

    /* ------------------- grammar -> kanji / vocabulary -------------------- */
    const kanjiIds = await fetchIdMap(client, "kanji", "literal");
    const pointKanji = new Set();
    for (const example of examples) {
      for (const char of example.japanese) {
        const kanjiId = kanjiIds.get(char);
        if (kanjiId) pointKanji.add(`${example.grammar_point_id}:${kanjiId}`);
      }
    }
    recordsWritten += await insertBatch(
      client,
      "grammar_point_kanji",
      ["grammar_point_id", "kanji_id", "via"],
      [...pointKanji]
        .map((key) => key.split(":").map(Number))
        .map(([grammar_point_id, kanji_id]) => ({ grammar_point_id, kanji_id, via: "example" })),
      { conflict: "grammar_point_id, kanji_id, via" },
    );

    const vocabLinks = await client.query(
      `SELECT DISTINCT v.id AS vocabulary_id, p.grammar_point_id
         FROM grammar_patterns p
         JOIN vocabulary v ON v.kanji_text LIKE '%' || p.match_text || '%'
        WHERE length(p.match_text) >= 2`,
    );
    recordsWritten += await insertBatch(
      client,
      "grammar_point_vocabulary",
      ["grammar_point_id", "vocabulary_id", "via"],
      vocabLinks.rows.map((row) => ({
        grammar_point_id: row.grammar_point_id,
        vocabulary_id: row.vocabulary_id,
        via: "pattern",
      })),
      { conflict: "grammar_point_id, vocabulary_id, via" },
    );

    /* ----------------------------- maintenance ---------------------------- */
    await client.query(`
      UPDATE grammar_points gp
         SET example_count = sub.total
        FROM (SELECT grammar_point_id, count(*)::int AS total
                FROM grammar_examples GROUP BY grammar_point_id) sub
       WHERE gp.id = sub.grammar_point_id
    `);
    await client.query(`UPDATE grammar_points SET example_count = 0 WHERE example_count IS NULL`);

    await client.query("COMMIT");
    await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(`done: ${recordsRead} records read, ${recordsWritten} rows written`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    log(`FAILED: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
