#!/usr/bin/env node
/**
 * Canonical question bank loader (phase 10.1).
 *
 * Two responsibilities:
 *
 *  1. BACKFILL — every lesson exercise from 09.4 becomes a bank question and
 *     the exercise is linked to it (`exercises.question_id`). This removes the
 *     second question model rather than adding one.
 *
 *  2. GENERATE — level-tagged standalone questions drawn from the canonical
 *     knowledge graph, so quizzes and JLPT tests have a pool that is not tied
 *     to any lesson.
 *
 * Additive/idempotent, keyed by `questions.source_key`. No DELETE/DROP/TRUNCATE.
 */
import "dotenv/config";

import {
  connect,
  fetchIdMap,
  finishRun,
  insertBatch,
  startRun,
  upsertSources,
} from "./loaders/postgres.mjs";
import { buildOptions, normalizeAnswer } from "./lib/question-utils.mjs";
import { ensureSources } from "./sources/registry.mjs";

const log = (message) => console.log(`[question-etl] ${new Date().toISOString()} ${message}`);

const PER_LEVEL_KANJI = 120;
const PER_LEVEL_VOCAB = 120;

async function main() {
  const [source] = ensureSources(["lesson-architecture"]);
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "question-bank", {});
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, [source]);
    const sourceId = sourceIds.get("lesson-architecture");

    const questionRows = [];
    const optionsByKey = new Map();

    const addQuestion = (question, options) => {
      questionRows.push({
        source_key: question.sourceKey,
        origin: question.origin,
        skill: question.skill,
        kind: question.kind,
        answer_mode: question.answerMode ?? "option",
        prompt: question.prompt,
        prompt_ja: question.promptJa ?? null,
        instructions: question.instructions ?? null,
        explanation: question.explanation ?? null,
        jlpt_level: question.jlptLevel ?? null,
        difficulty: question.difficulty ?? 1,
        points: question.points ?? 1,
        accepted_answers: question.acceptedAnswers ? JSON.stringify(question.acceptedAnswers) : null,
        grammar_point_id: question.grammarPointId ?? null,
        kanji_id: question.kanjiId ?? null,
        vocabulary_id: question.vocabularyId ?? null,
        sentence_id: question.sentenceId ?? null,
        metadata: question.metadata ? JSON.stringify(question.metadata) : null,
        active: true,
        source_id: sourceId,
      });
      if (options) optionsByKey.set(question.sourceKey, options);
      recordsRead += 1;
    };

    /* ------------------------------------------------------------------ */
    /* 1. Backfill lesson exercises into the bank                          */
    /* ------------------------------------------------------------------ */
    const exerciseRows = (
      await client.query(`
        SELECT e.id, e.key, e.kind, e.answer_mode, e.prompt, e.prompt_ja, e.instructions,
               e.explanation, e.difficulty, e.points, e.accepted_answers,
               e.grammar_point_id, e.kanji_id, e.vocabulary_id, e.sentence_id, e.metadata,
               l.slug AS lesson_slug, l.jlpt_level
          FROM exercises e JOIN lessons l ON l.id = e.lesson_id
         ORDER BY e.id`)
    ).rows;

    const exerciseOptions = new Map();
    for (const row of (
      await client.query(
        `SELECT exercise_id, position, label, sub_label, is_correct, feedback
           FROM exercise_options ORDER BY exercise_id, position`,
      )
    ).rows) {
      const bucket = exerciseOptions.get(row.exercise_id) ?? [];
      bucket.push({
        label: row.label,
        subLabel: row.sub_label,
        isCorrect: row.is_correct,
        feedback: row.feedback,
      });
      exerciseOptions.set(row.exercise_id, bucket);
    }

    const skillFor = (kind) =>
      kind === "reading" ? "kanji" : kind === "meaning" ? "vocabulary" : "grammar";

    for (const row of exerciseRows) {
      const sourceKey = `lesson:${row.lesson_slug}:${row.key}`;
      addQuestion(
        {
          sourceKey,
          origin: "lesson_exercise",
          skill: skillFor(row.kind),
          kind: row.kind,
          answerMode: row.answer_mode,
          prompt: row.prompt,
          promptJa: row.prompt_ja,
          instructions: row.instructions,
          explanation: row.explanation,
          jlptLevel: row.jlpt_level,
          difficulty: row.difficulty,
          points: row.points,
          acceptedAnswers: Array.isArray(row.accepted_answers) ? row.accepted_answers : null,
          grammarPointId: row.grammar_point_id,
          kanjiId: row.kanji_id,
          vocabularyId: row.vocabulary_id,
          sentenceId: row.sentence_id,
          metadata: { lessonSlug: row.lesson_slug, exerciseKey: row.key },
        },
        exerciseOptions.get(row.id) ?? null,
      );
    }
    log(`backfilled ${exerciseRows.length} lesson exercises into the bank`);

    /* ------------------------------------------------------------------ */
    /* 2. Generate standalone, level-tagged questions                      */
    /* ------------------------------------------------------------------ */

    // 2a. Grammar meaning (one per grammar point).
    const grammar = (
      await client.query(
        `SELECT id, slug, title, title_en, summary, jlpt_level FROM grammar_points
          WHERE title_en IS NOT NULL ORDER BY id`,
      )
    ).rows;
    grammar.forEach((point, index) => {
      const siblings = grammar.filter(
        (row) => row.id !== point.id && row.jlpt_level === point.jlpt_level,
      );
      const pool = (siblings.length >= 3 ? siblings : grammar).map((row) => ({ label: row.title }));
      const options = buildOptions(point.title, pool, 7000 + index);
      if (!options) return;
      addQuestion(
        {
          sourceKey: `grammar-meaning:${point.slug}`,
          origin: "generated",
          skill: "grammar",
          kind: "multiple_choice",
          prompt: `Which pattern expresses “${point.title_en}”?`,
          explanation: point.summary,
          jlptLevel: point.jlpt_level,
          difficulty: 1,
          grammarPointId: point.id,
          metadata: { slug: point.slug },
        },
        options,
      );
    });

    // 2b. Kanji reading (typed) and kanji meaning (choice), per JLPT level.
    const kanjiRows = (
      await client.query(`
        SELECT k.id, k.literal, k.jlpt_level,
               coalesce(m.meanings, '{}'::text[]) AS meanings,
               coalesce(r.readings, '{}'::text[]) AS readings
          FROM kanji k
          LEFT JOIN (
            SELECT kanji_id, array_agg(meaning ORDER BY position) AS meanings
              FROM kanji_meanings WHERE lang='en' GROUP BY kanji_id
          ) m ON m.kanji_id = k.id
          LEFT JOIN (
            SELECT kanji_id, array_agg(reading ORDER BY reading_type, position) AS readings
              FROM kanji_readings WHERE reading_type IN ('ja_on','ja_kun') GROUP BY kanji_id
          ) r ON r.kanji_id = k.id
         WHERE k.jlpt_level IS NOT NULL
         ORDER BY k.jlpt_level DESC, k.frequency ASC NULLS LAST`)
    ).rows;

    const meaningPool = kanjiRows
      .filter((row) => (row.meanings ?? []).length > 0)
      .map((row) => ({ label: row.meanings[0] }));

    const perLevel = new Map();
    kanjiRows.forEach((row, index) => {
      const used = perLevel.get(row.jlpt_level) ?? 0;
      if (used >= PER_LEVEL_KANJI) return;
      const readings = (row.readings ?? [])
        .map((value) => normalizeAnswer(String(value).split(".")[0]))
        .filter(Boolean);
      const meanings = row.meanings ?? [];
      if (readings.length === 0 || meanings.length === 0) return;
      perLevel.set(row.jlpt_level, used + 1);

      addQuestion({
        sourceKey: `kanji-reading:${row.literal}`,
        origin: "generated",
        skill: "kanji",
        kind: "reading",
        answerMode: "text",
        prompt: `Type one reading for ${row.literal} in kana.`,
        promptJa: row.literal,
        instructions: `Meaning: ${meanings.slice(0, 3).join(", ")}`,
        explanation: `Accepted readings: ${(row.readings ?? []).slice(0, 6).join("、")}`,
        jlptLevel: row.jlpt_level,
        difficulty: 2,
        kanjiId: row.id,
        acceptedAnswers: [...new Set(readings)],
        metadata: { literal: row.literal },
      });

      const options = buildOptions(meanings[0], meaningPool, 9000 + index);
      if (options) {
        addQuestion(
          {
            sourceKey: `kanji-meaning:${row.literal}`,
            origin: "generated",
            skill: "kanji",
            kind: "meaning",
            prompt: `What does the kanji ${row.literal} mean?`,
            promptJa: row.literal,
            explanation: meanings.slice(0, 4).join(", "),
            jlptLevel: row.jlpt_level,
            difficulty: 1,
            kanjiId: row.id,
            metadata: { literal: row.literal },
          },
          options,
        );
      }
    });

    // 2c. Vocabulary meaning, levelled by the rarest kanji it contains.
    const vocabRows = (
      await client.query(`
        SELECT DISTINCT ON (v.id) v.id, v.kanji_text, v.kana_text, v.meanings,
               min(k.jlpt_level) OVER (PARTITION BY v.id) AS jlpt_level
          FROM vocabulary v
          JOIN kanji_vocabulary kv ON kv.vocabulary_id = v.id
          JOIN kanji k ON k.id = kv.kanji_id
         WHERE v.priority = 1 AND k.jlpt_level IS NOT NULL
           AND length(v.kanji_text) BETWEEN 2 AND 6
         ORDER BY v.id`)
    ).rows;
    const vocabPool = vocabRows
      .filter((row) => Array.isArray(row.meanings) && row.meanings[0])
      .map((row) => ({ label: row.meanings[0] }));

    const vocabPerLevel = new Map();
    vocabRows.forEach((row, index) => {
      const meanings = Array.isArray(row.meanings) ? row.meanings : [];
      if (!meanings[0]) return;
      const used = vocabPerLevel.get(row.jlpt_level) ?? 0;
      if (used >= PER_LEVEL_VOCAB) return;
      const options = buildOptions(meanings[0], vocabPool, 11000 + index);
      if (!options) return;
      vocabPerLevel.set(row.jlpt_level, used + 1);
      addQuestion(
        {
          sourceKey: `vocab-meaning:${row.id}`,
          origin: "generated",
          skill: "vocabulary",
          kind: "meaning",
          prompt: `What does ${row.kanji_text} mean?`,
          promptJa: row.kana_text,
          explanation: meanings.slice(0, 3).join("; "),
          jlptLevel: row.jlpt_level,
          difficulty: 1,
          vocabularyId: row.id,
          metadata: { word: row.kanji_text },
        },
        options,
      );
    });

    /* ------------------------------------------------------------------ */
    /* 3. Persist                                                          */
    /* ------------------------------------------------------------------ */
    recordsWritten += await insertBatch(
      client,
      "questions",
      [
        "source_key", "origin", "skill", "kind", "answer_mode", "prompt", "prompt_ja",
        "instructions", "explanation", "jlpt_level", "difficulty", "points",
        "accepted_answers", "grammar_point_id", "kanji_id", "vocabulary_id",
        "sentence_id", "metadata", "active", "source_id",
      ],
      questionRows,
      {
        conflict: "source_key",
        update: `origin=EXCLUDED.origin, skill=EXCLUDED.skill, kind=EXCLUDED.kind,
                 answer_mode=EXCLUDED.answer_mode, prompt=EXCLUDED.prompt,
                 prompt_ja=EXCLUDED.prompt_ja, instructions=EXCLUDED.instructions,
                 explanation=EXCLUDED.explanation, jlpt_level=EXCLUDED.jlpt_level,
                 difficulty=EXCLUDED.difficulty, points=EXCLUDED.points,
                 accepted_answers=EXCLUDED.accepted_answers,
                 grammar_point_id=EXCLUDED.grammar_point_id, kanji_id=EXCLUDED.kanji_id,
                 vocabulary_id=EXCLUDED.vocabulary_id, sentence_id=EXCLUDED.sentence_id,
                 metadata=EXCLUDED.metadata, active=true, source_id=EXCLUDED.source_id,
                 updated_at=now()`,
        chunkSize: 200,
      },
    );

    const questionIds = await fetchIdMap(client, "questions", "source_key");
    const optionRows = [];
    for (const [sourceKey, options] of optionsByKey) {
      const questionId = questionIds.get(sourceKey);
      if (!questionId) continue;
      options.forEach((option, position) => {
        optionRows.push({
          question_id: questionId,
          position,
          label: option.label,
          sub_label: option.subLabel ?? null,
          is_correct: Boolean(option.isCorrect),
          feedback: option.feedback ?? null,
        });
      });
    }
    recordsWritten += await insertBatch(
      client,
      "question_options",
      ["question_id", "position", "label", "sub_label", "is_correct", "feedback"],
      optionRows,
      {
        conflict: "question_id, position",
        update: `label=EXCLUDED.label, sub_label=EXCLUDED.sub_label,
                 is_correct=EXCLUDED.is_correct, feedback=EXCLUDED.feedback`,
        chunkSize: 500,
      },
    );

    // Link every lesson exercise to its bank question.
    await client.query(`
      UPDATE exercises e SET question_id = q.id
        FROM questions q, lessons l
       WHERE l.id = e.lesson_id
         AND q.source_key = 'lesson:' || l.slug || ':' || e.key
         AND e.question_id IS DISTINCT FROM q.id
    `);

    await client.query("COMMIT");
    if (runId) await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(`done: ${questionRows.length} questions, ${optionRows.length} options`);
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
