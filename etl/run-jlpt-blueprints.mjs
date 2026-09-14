#!/usr/bin/env node
/**
 * JLPT blueprint loader (phase 10.3).
 *
 * Loads `etl/data/jlpt-blueprints.json` into `jlpt_tests` + `jlpt_test_sections`.
 *
 * A blueprint is structure only (sections, limits, pass marks, which bank skills
 * each section samples). No question content is stored, so there is no second
 * question model and nothing to keep in sync with the bank.
 *
 * Additive/idempotent, keyed by `jlpt_tests.slug` / `(test_id, code)`.
 * No DELETE, DROP or TRUNCATE.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { connect, finishRun, startRun, upsertSources } from "./loaders/postgres.mjs";
import { ensureSources } from "./sources/registry.mjs";

const log = (message) => console.log(`[jlpt-etl] ${new Date().toISOString()} ${message}`);

const SKILLS = new Set(["grammar", "kanji", "vocabulary", "reading"]);
const KINDS = new Set(["multiple_choice", "cloze", "reading", "meaning"]);

function assertSection(section, testSlug) {
  const required = ["code", "title", "timeLimitSeconds", "questionCount", "skills"];
  for (const field of required) {
    if (section[field] === undefined || section[field] === null) {
      throw new Error(`Section of '${testSlug}' is missing '${field}'`);
    }
  }
  if (!Array.isArray(section.skills)) throw new Error(`Section '${section.code}' needs a skills array`);
  const badSkill = section.skills.filter((skill) => !SKILLS.has(skill));
  if (badSkill.length > 0) throw new Error(`Section '${section.code}' has unknown skills: ${badSkill}`);
  const badKind = (section.kinds ?? []).filter((kind) => !KINDS.has(kind));
  if (badKind.length > 0) throw new Error(`Section '${section.code}' has unknown kinds: ${badKind}`);
  if (section.questionCount < 1 || section.questionCount > 100) {
    throw new Error(`Section '${section.code}' questionCount must be 1..100`);
  }
  if (section.timeLimitSeconds < 60) {
    throw new Error(`Section '${section.code}' needs a time limit of at least 60s`);
  }
}

async function main() {
  const [source] = ensureSources(["jlpt-blueprints"]);
  const blueprints = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "etl", "data", "jlpt-blueprints.json"), "utf-8"),
  );

  const client = await connect();
  let runId = null;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "jlpt-blueprints", {
      tests: blueprints.tests.length,
    });
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, [source]);
    const sourceId = sourceIds.get("jlpt-blueprints");

    for (const test of blueprints.tests) {
      if (!test.slug || !test.title) throw new Error("Every blueprint needs a slug and a title");
      if (!(test.level >= 1 && test.level <= 5)) throw new Error(`'${test.slug}' level must be 1..5`);
      (test.sections ?? []).forEach((section) => assertSection(section, test.slug));

      const questionCount = (test.sections ?? []).reduce(
        (sum, section) => sum + Number(section.questionCount),
        0,
      );
      const sectionTime = (test.sections ?? []).reduce(
        (sum, section) => sum + Number(section.timeLimitSeconds),
        0,
      );
      const timeLimitSeconds = Number(test.timeLimitSeconds ?? sectionTime);
      if (timeLimitSeconds < sectionTime) {
        throw new Error(
          `'${test.slug}' timeLimitSeconds (${timeLimitSeconds}) is shorter than its sections (${sectionTime})`,
        );
      }
      if (questionCount !== Number(test.questionCount ?? questionCount)) {
        throw new Error(
          `'${test.slug}' questionCount (${test.questionCount}) does not match its sections (${questionCount})`,
        );
      }

      /* Availability is verified against the live bank so a blueprint can never
       * be published while a section cannot be filled. */
      const availability = [];
      for (const section of test.sections ?? []) {
        const params = [Number(test.level)];
        let bankSql = `SELECT count(*)::int AS total FROM questions
                        WHERE active = true AND jlpt_level = $1`;
        if (section.skills.length > 0) {
          params.push(section.skills);
          bankSql += ` AND skill = ANY($${params.length}::text[])`;
        }
        if ((section.kinds ?? []).length > 0) {
          params.push(section.kinds);
          bankSql += ` AND kind = ANY($${params.length}::text[])`;
        }
        const result = await client.query(bankSql, params);
        availability.push({ code: section.code, available: Number(result.rows[0].total) });
      }
      const shortfall = availability.filter(
        (entry) => entry.available < (test.sections ?? []).find((s) => s.code === entry.code).questionCount,
      );
      const available = shortfall.length === 0;

      const inserted = await client.query(
        `INSERT INTO jlpt_tests
           (slug, source_key, level, title, title_ja, subtitle, description, instructions,
            time_limit_seconds, question_count, total_points, passing_percent,
            section_minimum_percent, available, published, metadata, source_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (slug) DO UPDATE SET
           source_key = EXCLUDED.source_key,
           level = EXCLUDED.level,
           title = EXCLUDED.title,
           title_ja = EXCLUDED.title_ja,
           subtitle = EXCLUDED.subtitle,
           description = EXCLUDED.description,
           instructions = EXCLUDED.instructions,
           time_limit_seconds = EXCLUDED.time_limit_seconds,
           question_count = EXCLUDED.question_count,
           total_points = EXCLUDED.total_points,
           passing_percent = EXCLUDED.passing_percent,
           section_minimum_percent = EXCLUDED.section_minimum_percent,
           available = EXCLUDED.available,
           published = EXCLUDED.published,
           metadata = EXCLUDED.metadata,
           source_id = EXCLUDED.source_id,
           updated_at = now()
         RETURNING id`,
        [
          test.slug,
          test.sourceKey ?? test.slug,
          Number(test.level),
          test.title,
          test.titleJa ?? null,
          test.subtitle ?? null,
          test.description ?? null,
          test.instructions ?? null,
          timeLimitSeconds,
          questionCount,
          Number(test.totalPoints ?? questionCount),
          Number(test.passingPercent ?? 50),
          Number(test.sectionMinimumPercent ?? 35),
          available,
          test.published !== false,
          JSON.stringify(test.metadata ?? {}),
          sourceId ?? null,
        ],
      );
      const testId = inserted.rows[0].id;
      recordsWritten += 1;

      for (const section of test.sections ?? []) {
        await client.query(
          `INSERT INTO jlpt_test_sections
             (test_id, code, title, title_ja, instructions, position, time_limit_seconds,
              question_count, skills, kinds)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (test_id, code) DO UPDATE SET
             title = EXCLUDED.title,
             title_ja = EXCLUDED.title_ja,
             instructions = EXCLUDED.instructions,
             position = EXCLUDED.position,
             time_limit_seconds = EXCLUDED.time_limit_seconds,
             question_count = EXCLUDED.question_count,
             skills = EXCLUDED.skills,
             kinds = EXCLUDED.kinds,
             updated_at = now()`,
          [
            testId,
            section.code,
            section.title,
            section.titleJa ?? null,
            section.instructions ?? null,
            Number(section.position ?? 0),
            Number(section.timeLimitSeconds),
            Number(section.questionCount),
            JSON.stringify(section.skills ?? []),
            JSON.stringify(section.kinds ?? []),
          ],
        );
        recordsWritten += 1;
      }

      log(
        `${test.slug}: ${questionCount} questions / ${Math.round(timeLimitSeconds / 60)} min · ` +
          `${(test.sections ?? []).length} sections · available=${available}` +
          (shortfall.length
            ? ` · shortfalls: ${shortfall.map((entry) => `${entry.code}=${entry.available}`).join(", ")}`
            : ""),
      );
    }

    await client.query("COMMIT");
    await finishRun(client, runId, "success", { tests: blueprints.tests.length, recordsWritten });
    log(`done: ${blueprints.tests.length} blueprints, ${recordsWritten} rows written`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (runId) await finishRun(client, runId, "failed", { error: String(error.message ?? error) });
    log(`failed: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
