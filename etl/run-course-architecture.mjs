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
  const [source] = ensureSources(["course-architecture"]);
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
    const sourceIds = await upsertSources(client, [source]);
    const sourceId = sourceIds.get("course-architecture");

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

main();
