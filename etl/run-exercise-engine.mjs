#!/usr/bin/env node
/**
 * Exercise engine loader.
 *
 * Generates gradeable exercises for every published lesson **from the canonical
 * knowledge graph**:
 *
 *   lesson_grammar_points  -> "which pattern expresses X?" (multiple choice)
 *   sentence_grammar_points-> cloze over a real corpus sentence
 *   lesson_kanji           -> typed reading recall
 *   kanji_vocabulary       -> vocabulary meaning (multiple choice)
 *
 * Distractors are real siblings from the same domain (preferring the same JLPT
 * level), never invented text. Correct answers are stored server-side only.
 *
 * Additive/idempotent. No DELETE, DROP or TRUNCATE of source knowledge.
 */
import "dotenv/config";

import {
  connect,
  finishRun,
  insertBatch,
  startRun,
  upsertSources,
} from "./loaders/postgres.mjs";
import { ensureSources } from "./sources/registry.mjs";

const log = (message) => console.log(`[exercise-etl] ${new Date().toISOString()} ${message}`);

const MAX_GRAMMAR = 3;
const MAX_CLOZE = 2;
const MAX_KANJI = 2;
const MAX_VOCABULARY = 2;
const OPTION_COUNT = 4;

/** Katakana -> hiragana so typed answers match either script. */
const toHiragana = (value) =>
  value.replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

/** Canonical answer normalisation, mirrored by the grading service. */
export function normalizeAnswer(value) {
  return toHiragana(String(value ?? "").normalize("NFKC"))
    .toLowerCase()
    .replace(/[\s.,。、・.-]/g, "")
    .trim();
}

/** Deterministic shuffle so regenerating does not churn option order. */
function stableShuffle(items, seed) {
  const scored = items.map((item, index) => {
    let hash = seed * 31 + index * 17;
    const label = String(item.label ?? item);
    for (let i = 0; i < label.length; i += 1) {
      hash = (hash * 33 + label.charCodeAt(i)) % 100000;
    }
    return { item, hash };
  });
  scored.sort((a, b) => a.hash - b.hash);
  return scored.map((entry) => entry.item);
}

function pickDistractors(pool, correct, count, seed) {
  const correctKey = normalizeAnswer(correct);
  const unique = new Map();
  for (const candidate of pool) {
    const key = normalizeAnswer(candidate.label);
    if (!key || key === correctKey || unique.has(key)) continue;
    unique.set(key, candidate);
  }
  return stableShuffle([...unique.values()], seed).slice(0, count);
}

async function main() {
  const [source] = ensureSources(["lesson-architecture"]);
  const client = await connect();
  let runId = null;
  let recordsRead = 0;
  let recordsWritten = 0;

  try {
    runId = await startRun(client, "exercise-engine", {});
    await client.query("BEGIN");
    const sourceIds = await upsertSources(client, [source]);
    const sourceId = sourceIds.get("lesson-architecture");

    const lessons = (
      await client.query(
        `SELECT l.id, l.slug, l.title, l.jlpt_level,
                (SELECT s.id FROM lesson_sections s
                  WHERE s.lesson_id = l.id AND s.kind = 'practice' AND s.published
                  LIMIT 1) AS practice_section_id
           FROM lessons l JOIN courses c ON c.id = l.course_id
          WHERE l.published = true AND c.published = true
          ORDER BY l.id`,
      )
    ).rows;

    /* ----------------------------- source pools ---------------------------- */
    const grammarPool = (
      await client.query(
        `SELECT id, slug, title, title_en, summary, jlpt_level FROM grammar_points`,
      )
    ).rows;
    const grammarById = new Map(grammarPool.map((row) => [row.id, row]));

    const patternPool = (
      await client.query(
        `SELECT DISTINCT p.match_text AS label, gp.jlpt_level
           FROM grammar_patterns p JOIN grammar_points gp ON gp.id = p.grammar_point_id
          WHERE length(p.match_text) BETWEEN 2 AND 8`,
      )
    ).rows;

    const kanjiReadings = new Map();
    for (const row of (
      await client.query(
        `SELECT k.id, k.literal, r.reading, r.reading_type
           FROM lesson_kanji lk
           JOIN kanji k ON k.id = lk.kanji_id
           JOIN kanji_readings r ON r.kanji_id = k.id
          WHERE r.reading_type IN ('ja_on','ja_kun')`,
      )
    ).rows) {
      const bucket = kanjiReadings.get(row.id) ?? { literal: row.literal, readings: [] };
      bucket.readings.push({ reading: row.reading, type: row.reading_type });
      kanjiReadings.set(row.id, bucket);
    }

    const kanjiMeanings = new Map(
      (
        await client.query(
          `SELECT km.kanji_id, array_agg(km.meaning ORDER BY km.position) AS meanings
             FROM kanji_meanings km WHERE km.lang='en' GROUP BY km.kanji_id`,
        )
      ).rows.map((row) => [row.kanji_id, row.meanings]),
    );

    const vocabularyPool = (
      await client.query(
        `SELECT DISTINCT ON (v.id) v.id, v.kanji_text, v.kana_text, v.meanings
           FROM lesson_kanji lk
           JOIN kanji_vocabulary kv ON kv.kanji_id = lk.kanji_id
           JOIN vocabulary v ON v.id = kv.vocabulary_id
          WHERE v.priority = 1 AND length(v.kanji_text) BETWEEN 2 AND 6`,
      )
    ).rows;

    const lessonGrammar = new Map();
    for (const row of (
      await client.query(
        `SELECT lesson_id, grammar_point_id, position FROM lesson_grammar_points
          ORDER BY lesson_id, position`,
      )
    ).rows) {
      const bucket = lessonGrammar.get(row.lesson_id) ?? [];
      bucket.push(row.grammar_point_id);
      lessonGrammar.set(row.lesson_id, bucket);
    }

    const lessonKanji = new Map();
    for (const row of (
      await client.query(
        `SELECT lesson_id, kanji_id, position FROM lesson_kanji ORDER BY lesson_id, position`,
      )
    ).rows) {
      const bucket = lessonKanji.get(row.lesson_id) ?? [];
      bucket.push(row.kanji_id);
      lessonKanji.set(row.lesson_id, bucket);
    }

    const lessonSentences = new Map();
    for (const row of (
      await client.query(
        `SELECT DISTINCT ON (lgp.lesson_id, s.id)
                lgp.lesson_id, s.id, s.japanese, s.english,
                sgp.matched_text, sgp.start_index, sgp.end_index,
                gp.id AS grammar_point_id, gp.title AS grammar_title
           FROM lesson_grammar_points lgp
           JOIN sentence_grammar_points sgp ON sgp.grammar_point_id = lgp.grammar_point_id
           JOIN sentences s ON s.id = sgp.sentence_id
           JOIN grammar_points gp ON gp.id = lgp.grammar_point_id
          WHERE sgp.matched_text IS NOT NULL
            AND sgp.start_index IS NOT NULL
            AND s.length <= 40
          ORDER BY lgp.lesson_id, s.id, s.length`,
      )
    ).rows) {
      const bucket = lessonSentences.get(row.lesson_id) ?? [];
      bucket.push(row);
      lessonSentences.set(row.lesson_id, bucket);
    }

    const lessonVocabulary = new Map();
    for (const row of (
      await client.query(
        `SELECT DISTINCT ON (lk.lesson_id, v.id)
                lk.lesson_id, v.id, v.kanji_text, v.kana_text, v.meanings
           FROM lesson_kanji lk
           JOIN kanji_vocabulary kv ON kv.kanji_id = lk.kanji_id
           JOIN vocabulary v ON v.id = kv.vocabulary_id
          WHERE v.priority = 1 AND length(v.kanji_text) BETWEEN 2 AND 6
          ORDER BY lk.lesson_id, v.id, length(v.kanji_text)`,
      )
    ).rows) {
      const bucket = lessonVocabulary.get(row.lesson_id) ?? [];
      bucket.push(row);
      lessonVocabulary.set(row.lesson_id, bucket);
    }

    /* ------------------------------ generation ----------------------------- */
    const exerciseRows = [];
    const optionsByKey = new Map();

    const addExercise = (lesson, exercise, options) => {
      const position = exerciseRows.filter((row) => row.lesson_id === lesson.id).length;
      const key = exercise.key;
      exerciseRows.push({
        lesson_id: lesson.id,
        section_id: lesson.practice_section_id ?? null,
        key,
        kind: exercise.kind,
        answer_mode: exercise.answerMode ?? "option",
        prompt: exercise.prompt,
        prompt_ja: exercise.promptJa ?? null,
        instructions: exercise.instructions ?? null,
        explanation: exercise.explanation ?? null,
        difficulty: exercise.difficulty ?? 1,
        position,
        points: exercise.points ?? 1,
        accepted_answers: exercise.acceptedAnswers
          ? JSON.stringify(exercise.acceptedAnswers)
          : null,
        grammar_point_id: exercise.grammarPointId ?? null,
        kanji_id: exercise.kanjiId ?? null,
        vocabulary_id: exercise.vocabularyId ?? null,
        sentence_id: exercise.sentenceId ?? null,
        metadata: exercise.metadata ? JSON.stringify(exercise.metadata) : null,
        source_id: sourceId,
      });
      if (options) optionsByKey.set(`${lesson.id}:${key}`, options);
      recordsRead += 1;
    };

    for (const lesson of lessons) {
      const seed = lesson.id;

      /* 1. grammar meaning -> pattern */
      const grammarIds = (lessonGrammar.get(lesson.id) ?? []).slice(0, MAX_GRAMMAR);
      grammarIds.forEach((grammarPointId, index) => {
        const point = grammarById.get(grammarPointId);
        if (!point?.title_en && !point?.summary) return;
        const sameLevel = grammarPool.filter(
          (row) => row.jlpt_level === point.jlpt_level && row.id !== point.id,
        );
        const pool = (sameLevel.length >= 3 ? sameLevel : grammarPool).map((row) => ({
          label: row.title,
        }));
        const distractors = pickDistractors(pool, point.title, OPTION_COUNT - 1, seed + index);
        if (distractors.length < OPTION_COUNT - 1) return;
        const options = stableShuffle(
          [{ label: point.title, isCorrect: true }, ...distractors.map((d) => ({ ...d, isCorrect: false }))],
          seed + index,
        );
        addExercise(
          lesson,
          {
            key: `grammar-meaning-${index + 1}`,
            kind: "multiple_choice",
            prompt: `Which pattern expresses “${point.title_en ?? point.summary}”?`,
            explanation: point.summary,
            difficulty: 1,
            grammarPointId,
            metadata: { slug: point.slug },
          },
          options,
        );
      });

      /* 2. cloze over a real corpus sentence */
      const sentences = (lessonSentences.get(lesson.id) ?? []).slice(0, MAX_CLOZE);
      sentences.forEach((sentence, index) => {
        const text = sentence.japanese;
        const start = sentence.start_index;
        const end = sentence.end_index;
        if (typeof start !== "number" || typeof end !== "number") return;
        if (text.slice(start, end) !== sentence.matched_text) return;
        const blanked = `${text.slice(0, start)}＿＿${text.slice(end)}`;
        const pool = patternPool.map((row) => ({ label: row.label }));
        const distractors = pickDistractors(
          pool,
          sentence.matched_text,
          OPTION_COUNT - 1,
          seed + 100 + index,
        );
        if (distractors.length < OPTION_COUNT - 1) return;
        const options = stableShuffle(
          [
            { label: sentence.matched_text, isCorrect: true },
            ...distractors.map((d) => ({ ...d, isCorrect: false })),
          ],
          seed + 100 + index,
        );
        addExercise(
          lesson,
          {
            key: `cloze-${index + 1}`,
            kind: "cloze",
            prompt: "Choose the expression that completes the sentence.",
            promptJa: blanked,
            instructions: sentence.english,
            explanation: `This sentence uses ${sentence.grammar_title}.`,
            difficulty: 2,
            points: 2,
            grammarPointId: sentence.grammar_point_id,
            sentenceId: sentence.id,
            metadata: { english: sentence.english },
          },
          options,
        );
      });

      /* 3. typed kanji reading */
      const kanjiIds = (lessonKanji.get(lesson.id) ?? []).slice(0, MAX_KANJI);
      kanjiIds.forEach((kanjiId, index) => {
        const entry = kanjiReadings.get(kanjiId);
        if (!entry || entry.readings.length === 0) return;
        const accepted = [
          ...new Set(
            entry.readings
              .map((item) => normalizeAnswer(item.reading.split(".")[0]))
              .filter((value) => value.length > 0),
          ),
        ];
        if (accepted.length === 0) return;
        const meanings = kanjiMeanings.get(kanjiId) ?? [];
        addExercise(
          lesson,
          {
            key: `kanji-reading-${index + 1}`,
            kind: "reading",
            answerMode: "text",
            prompt: `Type one reading for ${entry.literal} in kana.`,
            promptJa: entry.literal,
            instructions: meanings.length ? `Meaning: ${meanings.slice(0, 3).join(", ")}` : null,
            explanation: `Accepted readings: ${entry.readings
              .map((item) => item.reading)
              .slice(0, 6)
              .join("、")}`,
            difficulty: 2,
            kanjiId,
            acceptedAnswers: accepted,
            metadata: { literal: entry.literal },
          },
          null,
        );
      });

      /* 4. vocabulary meaning */
      const vocabulary = (lessonVocabulary.get(lesson.id) ?? []).slice(0, MAX_VOCABULARY);
      vocabulary.forEach((word, index) => {
        const meanings = Array.isArray(word.meanings) ? word.meanings : [];
        const correct = meanings[0];
        if (!correct) return;
        const pool = vocabularyPool
          .filter((row) => row.id !== word.id && Array.isArray(row.meanings) && row.meanings[0])
          .map((row) => ({ label: row.meanings[0] }));
        const distractors = pickDistractors(pool, correct, OPTION_COUNT - 1, seed + 200 + index);
        if (distractors.length < OPTION_COUNT - 1) return;
        const options = stableShuffle(
          [{ label: correct, isCorrect: true }, ...distractors.map((d) => ({ ...d, isCorrect: false }))],
          seed + 200 + index,
        );
        addExercise(
          lesson,
          {
            key: `vocabulary-meaning-${index + 1}`,
            kind: "meaning",
            prompt: `What does ${word.kanji_text} mean?`,
            promptJa: word.kana_text,
            explanation: meanings.slice(0, 3).join("; "),
            difficulty: 1,
            vocabularyId: word.id,
            metadata: { word: word.kanji_text },
          },
          options,
        );
      });
    }

    recordsWritten += await insertBatch(
      client,
      "exercises",
      [
        "lesson_id",
        "section_id",
        "key",
        "kind",
        "answer_mode",
        "prompt",
        "prompt_ja",
        "instructions",
        "explanation",
        "difficulty",
        "position",
        "points",
        "accepted_answers",
        "grammar_point_id",
        "kanji_id",
        "vocabulary_id",
        "sentence_id",
        "metadata",
        "source_id",
      ],
      exerciseRows,
      {
        conflict: "lesson_id, key",
        update: `section_id=EXCLUDED.section_id, kind=EXCLUDED.kind,
                 answer_mode=EXCLUDED.answer_mode, prompt=EXCLUDED.prompt,
                 prompt_ja=EXCLUDED.prompt_ja, instructions=EXCLUDED.instructions,
                 explanation=EXCLUDED.explanation, difficulty=EXCLUDED.difficulty,
                 position=EXCLUDED.position, points=EXCLUDED.points,
                 accepted_answers=EXCLUDED.accepted_answers,
                 grammar_point_id=EXCLUDED.grammar_point_id, kanji_id=EXCLUDED.kanji_id,
                 vocabulary_id=EXCLUDED.vocabulary_id, sentence_id=EXCLUDED.sentence_id,
                 metadata=EXCLUDED.metadata, source_id=EXCLUDED.source_id, updated_at=now()`,
        chunkSize: 200,
      },
    );

    const stored = await client.query(`SELECT id, lesson_id, key FROM exercises`);
    const optionRows = [];
    for (const row of stored.rows) {
      const options = optionsByKey.get(`${row.lesson_id}:${row.key}`);
      if (!options) continue;
      options.forEach((option, position) => {
        optionRows.push({
          exercise_id: row.id,
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
      "exercise_options",
      ["exercise_id", "position", "label", "sub_label", "is_correct", "feedback"],
      optionRows,
      {
        conflict: "exercise_id, position",
        update: `label=EXCLUDED.label, sub_label=EXCLUDED.sub_label,
                 is_correct=EXCLUDED.is_correct, feedback=EXCLUDED.feedback`,
        chunkSize: 400,
      },
    );

    /* --------------------- practice sections for the UI -------------------- */
    // Every lesson with exercises gets a `practice` section so the player shows
    // a study step in the canonical order.
    await client.query(`
      INSERT INTO lesson_sections (lesson_id, key, kind, title, title_ja, summary, position, published, source_id)
      SELECT DISTINCT e.lesson_id, 'practice', 'practice', 'Practice', '練習',
             'Check what you learned in this lesson.', 6, true, $1::int
        FROM exercises e
      ON CONFLICT (lesson_id, key) DO UPDATE SET
        kind='practice', title=EXCLUDED.title, title_ja=EXCLUDED.title_ja,
        summary=EXCLUDED.summary, position=EXCLUDED.position, published=true, updated_at=now()
    `, [sourceId]);

    await client.query(`
      UPDATE exercises e SET section_id = s.id
        FROM lesson_sections s
       WHERE s.lesson_id = e.lesson_id AND s.key = 'practice' AND e.section_id IS DISTINCT FROM s.id
    `);

    // A practice section must never be an empty player step: give it a prose
    // block describing the set, so the 09.2 "no empty section" invariant holds.
    await client.query(`
      INSERT INTO lesson_blocks (section_id, lesson_id, position, kind, title, body, source_id)
      SELECT s.id, s.lesson_id, 0, 'checkpoint', 'Practice set',
             'This lesson has ' || counts.total || ' exercises worth ' || counts.points ||
             ' points, generated from its grammar, kanji, vocabulary and example sentences.',
             $1::int
        FROM lesson_sections s
        JOIN (
          SELECT lesson_id, count(*) AS total, sum(points) AS points
            FROM exercises GROUP BY lesson_id
        ) counts ON counts.lesson_id = s.lesson_id
       WHERE s.key = 'practice'
      ON CONFLICT (section_id, position) DO UPDATE SET
        kind='checkpoint', title=EXCLUDED.title, body=EXCLUDED.body
    `, [sourceId]);

    await client.query("COMMIT");
    if (runId) await finishRun(client, runId, "success", { recordsRead, recordsWritten });
    log(`done: ${exerciseRows.length} exercises, ${optionRows.length} options`);
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
