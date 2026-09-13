#!/usr/bin/env node
/**
 * Course architecture loader: course -> modules -> lessons, prerequisites,
 * tags, and explicit lesson -> knowledge links.
 *
 * Requires the knowledge, grammar and content pipelines to have run first.
 * Additive/idempotent; no DELETE, DROP or TRUNCATE.
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

const log = (message) => console.log(`[course-etl] ${new Date().toISOString()} ${message}`);

async function main() {
  const sources = ensureSources(["course-architecture", "lesson-architecture"]);
  const architecture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "etl", "data", "course-architecture.json"), "utf-8"),
  );
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "course-architecture", {
      courses: Object.keys(architecture.courses).length,
    });
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, sources);
    const sourceId = sourceIds.get("course-architecture");
    const architectureSourceId = sourceIds.get("lesson-architecture");
    if (!architectureSourceId) throw new Error("lesson-architecture source was not registered");

    const courseIds = await fetchIdMap(client, "courses", "slug");
    const lessonIds = await fetchIdMap(client, "lessons", "slug");
    const grammarIds = await fetchIdMap(client, "grammar_points", "slug");
    const kanjiIds = await fetchIdMap(client, "kanji", "literal");

    for (const slug of Object.keys(architecture.courses)) {
      if (!courseIds.has(slug)) throw new Error(`Course '${slug}' is missing; run the content pipeline first`);
    }

    const moduleRows = [];
    const lessonToModule = new Map();
    const tagSlugs = new Set();
    const prerequisiteRows = [];
    const grammarLinks = [];
    const kanjiLinks = [];

    for (const [courseSlug, course] of Object.entries(architecture.courses)) {
      const courseId = courseIds.get(courseSlug);
      for (const tag of course.tags ?? []) tagSlugs.add(tag);
      for (const prerequisite of course.prerequisites ?? []) {
        const prerequisiteId = courseIds.get(prerequisite.slug);
        if (!prerequisiteId) throw new Error(`Prerequisite course '${prerequisite.slug}' is missing`);
        if (prerequisiteId === courseId) throw new Error(`Course '${courseSlug}' cannot require itself`);
        prerequisiteRows.push({
          course_id: courseId,
          prerequisite_course_id: prerequisiteId,
          required: prerequisite.required !== false,
          note: prerequisite.note ?? null,
        });
      }

      for (const courseModule of course.modules ?? []) {
        moduleRows.push({
          course_id: courseId,
          slug: courseModule.slug,
          title: courseModule.title,
          title_ja: courseModule.titleJa ?? null,
          summary: courseModule.summary ?? null,
          position: courseModule.position,
          published: true,
          source_id: sourceId,
        });
        recordsRead += 1;
        for (const lessonSlug of courseModule.lessons ?? []) {
          if (!lessonIds.has(lessonSlug)) throw new Error(`Lesson '${lessonSlug}' is missing`);
          if (lessonToModule.has(lessonSlug)) throw new Error(`Lesson '${lessonSlug}' is assigned twice`);
          lessonToModule.set(lessonSlug, courseModule.slug);
        }
      }

      for (const [lessonSlug, knowledge] of Object.entries(course.knowledge ?? {})) {
        const lessonId = lessonIds.get(lessonSlug);
        if (!lessonId) throw new Error(`Knowledge mapping references missing lesson '${lessonSlug}'`);
        (knowledge.grammar ?? []).forEach((grammarSlug, position) => {
          const grammarPointId = grammarIds.get(grammarSlug);
          if (!grammarPointId) throw new Error(`Lesson '${lessonSlug}' references missing grammar '${grammarSlug}'`);
          grammarLinks.push({ lesson_id: lessonId, grammar_point_id: grammarPointId, position });
        });
        (knowledge.kanji ?? []).forEach((literal, position) => {
          const kanjiId = kanjiIds.get(literal);
          if (!kanjiId) throw new Error(`Lesson '${lessonSlug}' references missing kanji '${literal}'`);
          kanjiLinks.push({ lesson_id: lessonId, kanji_id: kanjiId, position });
        });
      }
    }

    recordsWritten += await insertBatch(
      client,
      "course_modules",
      ["course_id", "slug", "title", "title_ja", "summary", "position", "published", "source_id"],
      moduleRows,
      {
        conflict: "slug",
        update: `course_id=EXCLUDED.course_id, title=EXCLUDED.title, title_ja=EXCLUDED.title_ja,
                 summary=EXCLUDED.summary, position=EXCLUDED.position, published=true,
                 source_id=EXCLUDED.source_id, updated_at=now()`,
      },
    );

    const moduleIds = await fetchIdMap(client, "course_modules", "slug");
    for (const [lessonSlug, moduleSlug] of lessonToModule) {
      await client.query(
        `UPDATE lessons SET module_id=$1, updated_at=now() WHERE id=$2`,
        [moduleIds.get(moduleSlug), lessonIds.get(lessonSlug)],
      );
      recordsWritten += 1;
    }

    recordsWritten += await insertBatch(
      client,
      "course_prerequisites",
      ["course_id", "prerequisite_course_id", "required", "note"],
      prerequisiteRows,
      {
        conflict: "course_id, prerequisite_course_id",
        update: "required=EXCLUDED.required, note=EXCLUDED.note",
      },
    );

    const tagRows = [...tagSlugs].map((slug) => ({ slug, label: slug.replace(/-/g, " ") }));
    recordsWritten += await insertBatch(client, "course_tags", ["slug", "label"], tagRows, {
      conflict: "slug",
      update: "label=EXCLUDED.label",
    });
    const tagIds = await fetchIdMap(client, "course_tags", "slug");
    const tagLinks = Object.entries(architecture.courses).flatMap(([courseSlug, course]) =>
      (course.tags ?? []).map((tag) => ({
        course_id: courseIds.get(courseSlug),
        tag_id: tagIds.get(tag),
      })),
    );
    recordsWritten += await insertBatch(
      client,
      "course_tag_links",
      ["course_id", "tag_id"],
      tagLinks,
      { conflict: "course_id, tag_id" },
    );

    recordsWritten += await insertBatch(
      client,
      "lesson_grammar_points",
      ["lesson_id", "grammar_point_id", "position"],
      grammarLinks,
      {
        conflict: "lesson_id, grammar_point_id",
        update: "position=EXCLUDED.position",
      },
    );
    recordsWritten += await insertBatch(
      client,
      "lesson_kanji",
      ["lesson_id", "kanji_id", "position"],
      kanjiLinks,
      { conflict: "lesson_id, kanji_id", update: "position=EXCLUDED.position" },
    );

    /* ------------------- lesson internal architecture ---------------------- */
    recordsWritten += await loadLessonArchitecture(client, {
      sourceIds,
      architectureSourceId,
      lessonIds,
      recordsRead: () => recordsRead,
    });

    await client.query("COMMIT");
    if (runId) await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(
      `done: ${moduleRows.length} modules, ${lessonToModule.size} lesson assignments, ` +
        `${prerequisiteRows.length} prerequisites, ${tagLinks.length} tags, ` +
        `${grammarLinks.length} grammar links, ${kanjiLinks.length} kanji links`,
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

/**
 * Loads authored lesson sections, normalises objectives, and derives
 * vocabulary/sentence links from canonical knowledge rows.
 *
 * Derivation keeps the knowledge graph the single source of truth: dictionary
 * entries and sentences are never copied into a lesson, only referenced.
 */
async function loadLessonArchitecture(client, context) {
  const architecture = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "etl", "data", "lesson-architecture.json"), "utf-8"),
  );
  let written = 0;

  for (const slug of Object.keys(architecture.lessons)) {
    if (!context.lessonIds.has(slug)) {
      throw new Error(`Lesson '${slug}' is missing; run the content pipeline first`);
    }
  }

  /* --------------------------- authored sections -------------------------- */
  const sectionRows = Object.entries(architecture.lessons).flatMap(([lessonSlug, lesson]) => {
    const lessonId = context.lessonIds.get(lessonSlug);
    // The seed maps a slug directly to its ordered section array.
    const sections = Array.isArray(lesson) ? lesson : (lesson.sections ?? []);
    return sections.map((section, position) => ({
      lesson_id: lessonId,
      position,
      kind: section.kind ?? "explain",
      heading: section.heading,
      heading_ja: section.headingJa ?? null,
      body: section.body,
      examples: JSON.stringify(section.examples ?? []),
      source_id: context.architectureSourceId,
    }));
  });
  written += await insertBatch(
    client,
    "lesson_sections",
    ["lesson_id", "position", "kind", "heading", "heading_ja", "body", "examples", "source_id"],
    sectionRows,
    {
      conflict: "lesson_id, position",
      update: `kind=EXCLUDED.kind, heading=EXCLUDED.heading, heading_ja=EXCLUDED.heading_ja,
               body=EXCLUDED.body, examples=EXCLUDED.examples, source_id=EXCLUDED.source_id,
               updated_at=now()`,
    },
  );
  console.log(`[course-etl] sections: ${sectionRows.length}`);

  /* --------------------- normalise lesson objectives ---------------------- */
  // lessons.objectives (JSONB) stays for compatibility; the normalised table is
  // canonical so objectives become queryable and individually referenceable.
  await client.query(`
    INSERT INTO lesson_objectives (lesson_id, position, objective)
    SELECT l.id, ord.position, obj.value
    FROM lessons l
    CROSS JOIN LATERAL jsonb_array_elements_text(l.objectives) WITH ORDINALITY AS obj(value, ord)
    CROSS JOIN LATERAL (SELECT obj.ord - 1 AS position) ord
    ON CONFLICT (lesson_id, position) DO UPDATE SET objective = EXCLUDED.objective
  `);
  const objectiveCount = await client.query(`SELECT count(*)::int AS total FROM lesson_objectives`);
  written += Number(objectiveCount.rows[0].total);
  console.log(`[course-etl] objectives: ${objectiveCount.rows[0].total}`);

  /* ---------------- derived vocabulary from lesson kanji ------------------ */
  await client.query(`
    INSERT INTO lesson_vocabulary (lesson_id, vocabulary_id, via, position)
    WITH ranked AS (
      SELECT lk.lesson_id, kv.vocabulary_id, 'kanji' AS via,
             row_number() OVER (
               PARTITION BY lk.lesson_id
               ORDER BY min(coalesce(kv.vocabulary_priority, 99)), min(v.kanji_text)
             ) AS position
      FROM lesson_kanji lk
      JOIN kanji_vocabulary kv ON kv.kanji_id = lk.kanji_id
      JOIN vocabulary v ON v.id = kv.vocabulary_id
      GROUP BY lk.lesson_id, kv.vocabulary_id
    )
    SELECT lesson_id, vocabulary_id, via, position FROM ranked WHERE position <= 12
    ON CONFLICT (lesson_id, vocabulary_id) DO NOTHING
  `);
  const vocabularyCount = await client.query(`SELECT count(*)::int AS total FROM lesson_vocabulary`);
  written += Number(vocabularyCount.rows[0].total);
  console.log(`[course-etl] derived vocabulary links: ${vocabularyCount.rows[0].total}`);

  /* ------------- derived sentences from lesson grammar points ------------- */
  await client.query(`
    INSERT INTO lesson_sentences (lesson_id, sentence_id, grammar_point_id, via, position)
    WITH ranked AS (
      SELECT lgp.lesson_id, s.id AS sentence_id, lgp.grammar_point_id,
             row_number() OVER (
               PARTITION BY lgp.lesson_id, lgp.grammar_point_id ORDER BY s.length, s.id
             ) AS grammar_rank
      FROM lesson_grammar_points lgp
      JOIN grammar_examples ge ON ge.grammar_point_id = lgp.grammar_point_id
      JOIN sentences s ON s.external_id = ge.external_id
    ), deduped AS (
      SELECT lesson_id, sentence_id, grammar_point_id,
             row_number() OVER (PARTITION BY lesson_id ORDER BY grammar_rank, sentence_id) AS position
      FROM (SELECT *, row_number() OVER (PARTITION BY lesson_id, sentence_id ORDER BY grammar_rank) AS first_rank
            FROM ranked WHERE grammar_rank <= 2) top
      WHERE first_rank = 1
    )
    SELECT lesson_id, sentence_id, grammar_point_id, 'grammar-example', position
    FROM deduped WHERE position <= 8
    ON CONFLICT (lesson_id, sentence_id) DO NOTHING
  `);
  const sentenceCount = await client.query(`SELECT count(*)::int AS total FROM lesson_sentences`);
  written += Number(sentenceCount.rows[0].total);
  console.log(`[course-etl] derived sentence links: ${sentenceCount.rows[0].total}`);

  return written;
}

main();
