#!/usr/bin/env node
/**
 * Canonical sentence + learning-catalogue loader.
 *
 *   node etl/run-content-pipeline.mjs
 *   node etl/run-content-pipeline.mjs --only sentences
 *   node etl/run-content-pipeline.mjs --only learning
 *
 * Additive and idempotent. No DROP / TRUNCATE / destructive statements.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { connect, finishRun, insertBatch, startRun, upsertSources } from "./loaders/postgres.mjs";
import { parseTanakaExamples } from "./parsers/tanaka-examples.mjs";
import { ensureSources } from "./sources/registry.mjs";

const args = process.argv.slice(2);
const onlyAt = args.indexOf("--only");
const stages = new Set(
  onlyAt >= 0 && args[onlyAt + 1]
    ? args[onlyAt + 1].split(",").map((part) => part.trim())
    : ["sentences", "learning"],
);
const log = (message) => console.log(`[content-etl] ${new Date().toISOString()} ${message}`);

async function main() {
  const sourceCodes = [
    ...(stages.has("sentences") ? ["tanaka"] : []),
    ...(stages.has("learning") ? ["learning-seed"] : []),
  ];
  const sources = ensureSources(sourceCodes);
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "sentences-learning-catalogue", { stages: [...stages] });
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, sources);

    if (stages.has("sentences")) {
      const tanaka = sources.find((source) => source.code === "tanaka");
      const sourceId = sourceIds.get("tanaka");
      let batch = [];
      for await (const sentence of parseTanakaExamples(tanaka.path)) {
        if (!sentence.externalId) continue;
        batch.push({
          external_id: sentence.externalId,
          japanese: sentence.japanese,
          english: sentence.english,
          length: [...sentence.japanese].length,
          jlpt_level: null,
          source_id: sourceId,
        });
        recordsRead += 1;
        if (batch.length >= 1000) {
          recordsWritten += await upsertSentences(client, batch);
          batch = [];
        }
      }
      if (batch.length > 0) recordsWritten += await upsertSentences(client, batch);
      log(`sentences: loaded ${recordsRead} Tanaka sentence pairs`);

      // Reconnect grammar evidence to canonical sentence rows. This edge keeps
      // sentence search independent while preserving the grammar match proof.
      await client.query(`
        INSERT INTO sentence_grammar_points
          (sentence_id, grammar_point_id, grammar_pattern_id, matched_text, start_index, end_index)
        SELECT DISTINCT ON (s.id, gm.grammar_point_id)
          s.id, gm.grammar_point_id, gm.grammar_pattern_id,
          gm.matched_text, gm.start_index, gm.end_index
        FROM grammar_example_matches gm
        JOIN grammar_examples ge ON ge.id = gm.example_id
        JOIN sentences s ON s.external_id = ge.external_id
        ORDER BY s.id, gm.grammar_point_id, gm.id
        ON CONFLICT (sentence_id, grammar_point_id) DO UPDATE SET
          grammar_pattern_id = EXCLUDED.grammar_pattern_id,
          matched_text = EXCLUDED.matched_text,
          start_index = EXCLUDED.start_index,
          end_index = EXCLUDED.end_index
      `);
    }

    if (stages.has("learning")) {
      const sourceId = sourceIds.get("learning-seed");
      const catalog = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "etl", "data", "learning-catalog.json"), "utf-8"),
      );
      const courseRows = catalog.courses.map((course) => ({
        slug: course.slug,
        title: course.title,
        title_ja: course.titleJa ?? null,
        summary: course.summary,
        description: course.description ?? null,
        jlpt_level: course.jlptLevel ?? null,
        difficulty: course.difficulty ?? "beginner",
        position: course.position ?? 0,
        published: true,
        source_id: sourceId,
      }));
      recordsRead += courseRows.length;
      recordsWritten += await insertBatch(
        client,
        "courses",
        [
          "slug",
          "title",
          "title_ja",
          "summary",
          "description",
          "jlpt_level",
          "difficulty",
          "position",
          "published",
          "source_id",
        ],
        courseRows,
        {
          conflict: "slug",
          update: `title = EXCLUDED.title,
                   title_ja = EXCLUDED.title_ja,
                   summary = EXCLUDED.summary,
                   description = EXCLUDED.description,
                   jlpt_level = EXCLUDED.jlpt_level,
                   difficulty = EXCLUDED.difficulty,
                   position = EXCLUDED.position,
                   published = EXCLUDED.published,
                   source_id = EXCLUDED.source_id,
                   updated_at = now()`,
        },
      );

      const courseResult = await client.query(`SELECT id, slug FROM courses`);
      const courseIds = new Map(courseResult.rows.map((row) => [row.slug, row.id]));
      const lessonRows = catalog.courses.flatMap((course) =>
        course.lessons.map((lesson) => ({
          course_id: courseIds.get(course.slug),
          slug: lesson.slug,
          title: lesson.title,
          title_ja: lesson.titleJa ?? null,
          summary: lesson.summary,
          objectives: JSON.stringify(lesson.objectives ?? []),
          content: lesson.content ?? null,
          jlpt_level: course.jlptLevel ?? null,
          position: lesson.position ?? 0,
          estimated_minutes: lesson.estimatedMinutes ?? 10,
          published: true,
          source_id: sourceId,
        })),
      );
      recordsRead += lessonRows.length;
      recordsWritten += await insertBatch(
        client,
        "lessons",
        [
          "course_id",
          "slug",
          "title",
          "title_ja",
          "summary",
          "objectives",
          "content",
          "jlpt_level",
          "position",
          "estimated_minutes",
          "published",
          "source_id",
        ],
        lessonRows,
        {
          conflict: "slug",
          update: `course_id = EXCLUDED.course_id,
                   title = EXCLUDED.title,
                   title_ja = EXCLUDED.title_ja,
                   summary = EXCLUDED.summary,
                   objectives = EXCLUDED.objectives,
                   content = EXCLUDED.content,
                   jlpt_level = EXCLUDED.jlpt_level,
                   position = EXCLUDED.position,
                   estimated_minutes = EXCLUDED.estimated_minutes,
                   published = EXCLUDED.published,
                   source_id = EXCLUDED.source_id,
                   updated_at = now()`,
        },
      );
      log(`learning: loaded ${courseRows.length} courses and ${lessonRows.length} lessons`);
    }

    await client.query("COMMIT");
    if (runId) await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(`done: ${recordsRead} records read, ${recordsWritten} rows upserted`);
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

async function upsertSentences(client, rows) {
  return insertBatch(
    client,
    "sentences",
    ["external_id", "japanese", "english", "length", "jlpt_level", "source_id"],
    rows,
    {
      conflict: "external_id",
      update: `japanese = EXCLUDED.japanese,
               english = EXCLUDED.english,
               length = EXCLUDED.length,
               source_id = EXCLUDED.source_id`,
      chunkSize: 500,
    },
  );
}

main();
