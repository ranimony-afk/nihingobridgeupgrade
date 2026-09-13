#!/usr/bin/env node
/**
 * Lesson architecture loader: lesson -> ordered sections -> ordered blocks.
 *
 * Authored prose comes from etl/data/lesson-architecture.json.
 * Knowledge blocks (grammar / kanji / vocabulary / sentence) are DERIVED from
 * the canonical graph created in earlier phases, so a lesson can never contain
 * a fact that the knowledge base does not have.
 *
 * Requires: knowledge, grammar, content and course-architecture pipelines.
 * Additive/idempotent. No DELETE, DROP or TRUNCATE.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import {
  connect,
  fetchIdMap,
  finishRun,
  insertBatch,
  startRun,
  upsertSources,
} from "./loaders/postgres.mjs";
import { ensureSources } from "./sources/registry.mjs";

const log = (message) => console.log(`[lesson-etl] ${new Date().toISOString()} ${message}`);

const MAX_SENTENCES_PER_LESSON = 4;
const MAX_VOCABULARY_PER_LESSON = 6;

async function main() {
  const [source] = ensureSources(["lesson-architecture"]);
  const seed = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "etl", "data", "lesson-architecture.json"), "utf-8"),
  );
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "lesson-architecture", {
      lessons: Object.keys(seed.lessons).length,
    });
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, [source]);
    const sourceId = sourceIds.get("lesson-architecture");

    const lessonRows = await client.query(
      `SELECT l.id, l.slug, l.title, l.module_id, l.position, l.course_id
         FROM lessons l JOIN courses c ON c.id = l.course_id
        WHERE l.published = true AND c.published = true
        ORDER BY l.course_id, l.position`,
    );
    const lessons = lessonRows.rows;
    const lessonBySlug = new Map(lessons.map((row) => [row.slug, row]));

    for (const slug of Object.keys(seed.lessons)) {
      if (!lessonBySlug.has(slug)) {
        throw new Error(`Lesson '${slug}' is missing; run the content/course pipelines first`);
      }
    }

    /* ---------------- knowledge already linked in phase 09.1 --------------- */
    const grammarByLesson = new Map();
    const grammarRows = await client.query(
      `SELECT lgp.lesson_id, lgp.position, gp.id, gp.title, gp.title_en, gp.slug
         FROM lesson_grammar_points lgp
         JOIN grammar_points gp ON gp.id = lgp.grammar_point_id
        ORDER BY lgp.lesson_id, lgp.position`,
    );
    for (const row of grammarRows.rows) {
      const bucket = grammarByLesson.get(row.lesson_id) ?? [];
      bucket.push(row);
      grammarByLesson.set(row.lesson_id, bucket);
    }

    const kanjiByLesson = new Map();
    const kanjiRows = await client.query(
      `SELECT lk.lesson_id, lk.position, k.id, k.literal
         FROM lesson_kanji lk JOIN kanji k ON k.id = lk.kanji_id
        ORDER BY lk.lesson_id, lk.position`,
    );
    for (const row of kanjiRows.rows) {
      const bucket = kanjiByLesson.get(row.lesson_id) ?? [];
      bucket.push(row);
      kanjiByLesson.set(row.lesson_id, bucket);
    }

    /* --------- derived evidence: sentences for the lesson's grammar -------- */
    const sentenceByLesson = new Map();
    const sentenceRows = await client.query(
      `SELECT DISTINCT ON (lgp.lesson_id, s.id)
              lgp.lesson_id, s.id, s.japanese, s.length, gp.title AS grammar_title
         FROM lesson_grammar_points lgp
         JOIN sentence_grammar_points sgp ON sgp.grammar_point_id = lgp.grammar_point_id
         JOIN sentences s ON s.id = sgp.sentence_id
         JOIN grammar_points gp ON gp.id = lgp.grammar_point_id
        ORDER BY lgp.lesson_id, s.id, s.length`,
    );
    for (const row of sentenceRows.rows) {
      const bucket = sentenceByLesson.get(row.lesson_id) ?? [];
      bucket.push(row);
      sentenceByLesson.set(row.lesson_id, bucket);
    }

    /* ------- derived vocabulary: common words using the lesson's kanji ----- */
    const vocabularyByLesson = new Map();
    const vocabularyRows = await client.query(
      `SELECT DISTINCT ON (lk.lesson_id, v.id)
              lk.lesson_id, v.id, v.kanji_text, v.priority, length(v.kanji_text) AS len
         FROM lesson_kanji lk
         JOIN kanji_vocabulary kv ON kv.kanji_id = lk.kanji_id
         JOIN vocabulary v ON v.id = kv.vocabulary_id
        WHERE v.priority IS NOT NULL
        ORDER BY lk.lesson_id, v.id, v.priority`,
    );
    for (const row of vocabularyRows.rows) {
      const bucket = vocabularyByLesson.get(row.lesson_id) ?? [];
      bucket.push(row);
      vocabularyByLesson.set(row.lesson_id, bucket);
    }

    /* ------------------------------ sections ------------------------------- */
    const sectionRows = [];
    for (const [slug, content] of Object.entries(seed.lessons)) {
      const lesson = lessonBySlug.get(slug);
      recordsRead += 1;
      for (const section of seed.defaults.sections) {
        // Only emit a knowledge section when that knowledge actually exists.
        if (section.kind === "grammar" && (grammarByLesson.get(lesson.id) ?? []).length === 0) continue;
        if (section.kind === "kanji" && (kanjiByLesson.get(lesson.id) ?? []).length === 0) continue;
        if (section.kind === "examples" && (sentenceByLesson.get(lesson.id) ?? []).length === 0) continue;
        sectionRows.push({
          lesson_id: lesson.id,
          key: section.key,
          kind: section.kind,
          title: section.title,
          title_ja: section.titleJa ?? null,
          summary:
            section.kind === "concept"
              ? content.intro
              : section.kind === "summary"
                ? content.summary
                : null,
          position: section.position,
          published: true,
          source_id: sourceId,
        });
      }
    }

    recordsWritten += await insertBatch(
      client,
      "lesson_sections",
      ["lesson_id", "key", "kind", "title", "title_ja", "summary", "position", "published", "source_id"],
      sectionRows,
      {
        conflict: "lesson_id, key",
        update: `kind=EXCLUDED.kind, title=EXCLUDED.title, title_ja=EXCLUDED.title_ja,
                 summary=EXCLUDED.summary, position=EXCLUDED.position, published=true,
                 source_id=EXCLUDED.source_id, updated_at=now()`,
      },
    );

    const sectionLookup = new Map();
    const storedSections = await client.query(
      `SELECT s.id, s.key, s.lesson_id FROM lesson_sections s`,
    );
    for (const row of storedSections.rows) {
      sectionLookup.set(`${row.lesson_id}:${row.key}`, row.id);
    }

    /* ------------------------------- blocks -------------------------------- */
    const blockRows = [];
    const pushBlock = (sectionId, lessonId, position, block) => {
      blockRows.push({
        section_id: sectionId,
        lesson_id: lessonId,
        position,
        kind: block.kind,
        title: block.title ?? null,
        body: block.body ?? null,
        grammar_point_id: block.grammarPointId ?? null,
        kanji_id: block.kanjiId ?? null,
        vocabulary_id: block.vocabularyId ?? null,
        sentence_id: block.sentenceId ?? null,
        metadata: block.metadata ? JSON.stringify(block.metadata) : null,
        source_id: sourceId,
      });
    };

    for (const [slug, content] of Object.entries(seed.lessons)) {
      const lesson = lessonBySlug.get(slug);

      const conceptId = sectionLookup.get(`${lesson.id}:concept`);
      if (conceptId) {
        let position = 0;
        pushBlock(conceptId, lesson.id, position++, { kind: "text", body: content.intro });
        for (const point of content.keyPoints ?? []) {
          pushBlock(conceptId, lesson.id, position++, { kind: "objective", body: point });
        }
        if (content.tip) {
          pushBlock(conceptId, lesson.id, position++, { kind: "tip", title: "Tip", body: content.tip });
        }
      }

      const grammarId = sectionLookup.get(`${lesson.id}:grammar`);
      if (grammarId) {
        (grammarByLesson.get(lesson.id) ?? []).forEach((row, index) => {
          pushBlock(grammarId, lesson.id, index, {
            kind: "grammar_ref",
            grammarPointId: row.id,
            metadata: { slug: row.slug },
          });
        });
      }

      const kanjiSectionId = sectionLookup.get(`${lesson.id}:kanji`);
      if (kanjiSectionId) {
        let position = 0;
        for (const row of kanjiByLesson.get(lesson.id) ?? []) {
          pushBlock(kanjiSectionId, lesson.id, position++, {
            kind: "kanji_ref",
            kanjiId: row.id,
            metadata: { literal: row.literal },
          });
        }
        const vocabulary = (vocabularyByLesson.get(lesson.id) ?? [])
          .sort((a, b) => a.priority - b.priority || a.len - b.len)
          .slice(0, MAX_VOCABULARY_PER_LESSON);
        for (const row of vocabulary) {
          pushBlock(kanjiSectionId, lesson.id, position++, {
            kind: "vocabulary_ref",
            vocabularyId: row.id,
            metadata: { word: row.kanji_text },
          });
        }
      }

      const examplesId = sectionLookup.get(`${lesson.id}:examples`);
      if (examplesId) {
        const sentences = (sentenceByLesson.get(lesson.id) ?? [])
          .sort((a, b) => a.length - b.length)
          .slice(0, MAX_SENTENCES_PER_LESSON);
        sentences.forEach((row, index) => {
          pushBlock(examplesId, lesson.id, index, {
            kind: "sentence_ref",
            sentenceId: row.id,
            metadata: { grammar: row.grammar_title },
          });
        });
      }

      const summaryId = sectionLookup.get(`${lesson.id}:summary`);
      if (summaryId) {
        let position = 0;
        pushBlock(summaryId, lesson.id, position++, { kind: "text", body: content.summary });
        if (content.checkpoint) {
          pushBlock(summaryId, lesson.id, position++, {
            kind: "checkpoint",
            title: "Check yourself",
            body: content.checkpoint,
          });
        }
      }
    }

    recordsWritten += await insertBatch(
      client,
      "lesson_blocks",
      [
        "section_id",
        "lesson_id",
        "position",
        "kind",
        "title",
        "body",
        "grammar_point_id",
        "kanji_id",
        "vocabulary_id",
        "sentence_id",
        "metadata",
        "source_id",
      ],
      blockRows,
      {
        conflict: "section_id, position",
        update: `kind=EXCLUDED.kind, title=EXCLUDED.title, body=EXCLUDED.body,
                 grammar_point_id=EXCLUDED.grammar_point_id, kanji_id=EXCLUDED.kanji_id,
                 vocabulary_id=EXCLUDED.vocabulary_id, sentence_id=EXCLUDED.sentence_id,
                 metadata=EXCLUDED.metadata, source_id=EXCLUDED.source_id`,
        chunkSize: 400,
      },
    );

    /* --------------------------- prerequisites ----------------------------- */
    // Sequential within a course: each lesson requires the previous one.
    const prerequisiteRows = [];
    const byCourse = new Map();
    for (const lesson of lessons) {
      const bucket = byCourse.get(lesson.course_id) ?? [];
      bucket.push(lesson);
      byCourse.set(lesson.course_id, bucket);
    }
    for (const bucket of byCourse.values()) {
      const ordered = bucket.sort((a, b) => a.position - b.position);
      for (let index = 1; index < ordered.length; index += 1) {
        prerequisiteRows.push({
          lesson_id: ordered[index].id,
          prerequisite_lesson_id: ordered[index - 1].id,
          required: true,
          note: "Sequential lesson order within the course.",
        });
      }
    }
    recordsWritten += await insertBatch(
      client,
      "lesson_prerequisites",
      ["lesson_id", "prerequisite_lesson_id", "required", "note"],
      prerequisiteRows,
      {
        conflict: "lesson_id, prerequisite_lesson_id",
        update: "required=EXCLUDED.required, note=EXCLUDED.note",
      },
    );

    await client.query("COMMIT");
    if (runId) await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(
      `done: ${sectionRows.length} sections, ${blockRows.length} blocks, ` +
        `${prerequisiteRows.length} lesson prerequisites`,
    );
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

main();
