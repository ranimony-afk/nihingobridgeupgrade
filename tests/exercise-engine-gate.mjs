#!/usr/bin/env node
/**
 * Phase 09.4 gate — exercise engine.
 *
 *   node tests/exercise-engine-gate.mjs http://127.0.0.1:3000
 *
 * The engine must generate valid exercises from canonical knowledge, keep the
 * answer key server-side, and grade correctly.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
const SAMPLE = "n4-conditionals";
let failures = 0;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const json = async (path, init) => {
  const response = await fetch(`${BASE_URL}${path}`, init);
  return { status: response.status, body: await response.json().catch(() => null) };
};
const html = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
};
const post = (path, payload) =>
  json(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

let client;

async function databaseChecks() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const local = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();

  const counts = await client.query(`SELECT
    (SELECT count(*)::int FROM exercises) exercises,
    (SELECT count(*)::int FROM exercise_options) options,
    (SELECT count(DISTINCT lesson_id)::int FROM exercises) covered,
    (SELECT count(*)::int FROM lessons WHERE published) lessons,
    (SELECT count(DISTINCT kind)::int FROM exercises) kinds`);
  const c = counts.rows[0];
  check("db: exercises generated", c.exercises >= 100, `${c.exercises}`);
  check("db: every published lesson has exercises", c.covered === c.lessons, `${c.covered}/${c.lessons}`);
  check("db: multiple exercise kinds", c.kinds >= 4, `${c.kinds} kinds`);

  const integrity = await client.query(`SELECT
    (SELECT count(*) FROM (SELECT exercise_id FROM exercise_options GROUP BY exercise_id HAVING count(*) FILTER (WHERE is_correct) <> 1) x) bad_key,
    (SELECT count(*) FROM (SELECT exercise_id, lower(label) FROM exercise_options GROUP BY exercise_id, lower(label) HAVING count(*) > 1) y) dup_options,
    (SELECT count(*) FROM (SELECT exercise_id FROM exercise_options GROUP BY exercise_id HAVING count(*) < 4) z) too_few,
    (SELECT count(*) FROM exercises WHERE answer_mode='option' AND NOT EXISTS (SELECT 1 FROM exercise_options o WHERE o.exercise_id=exercises.id)) no_options,
    (SELECT count(*) FROM exercises WHERE answer_mode='text' AND (accepted_answers IS NULL OR jsonb_array_length(accepted_answers)=0)) no_answers,
    (SELECT count(*) FROM exercises WHERE prompt IS NULL OR prompt='') no_prompt`);
  check("db: exactly one correct option per exercise", Number(integrity.rows[0].bad_key) === 0);
  check("db: no duplicate option labels", Number(integrity.rows[0].dup_options) === 0);
  check("db: at least four options per choice exercise", Number(integrity.rows[0].too_few) === 0);
  check("db: option exercises have choices", Number(integrity.rows[0].no_options) === 0);
  check("db: text exercises have accepted answers", Number(integrity.rows[0].no_answers) === 0);
  check("db: every exercise has a prompt", Number(integrity.rows[0].no_prompt) === 0);

  const refs = await client.query(`SELECT
    (SELECT count(*) FROM exercises e LEFT JOIN grammar_points g ON g.id=e.grammar_point_id WHERE e.grammar_point_id IS NOT NULL AND g.id IS NULL) bad_grammar,
    (SELECT count(*) FROM exercises e LEFT JOIN kanji k ON k.id=e.kanji_id WHERE e.kanji_id IS NOT NULL AND k.id IS NULL) bad_kanji,
    (SELECT count(*) FROM exercises e LEFT JOIN vocabulary v ON v.id=e.vocabulary_id WHERE e.vocabulary_id IS NOT NULL AND v.id IS NULL) bad_vocab,
    (SELECT count(*) FROM exercises e LEFT JOIN sentences s ON s.id=e.sentence_id WHERE e.sentence_id IS NOT NULL AND s.id IS NULL) bad_sentence,
    (SELECT count(*) FROM exercises WHERE grammar_point_id IS NULL AND kanji_id IS NULL AND vocabulary_id IS NULL AND sentence_id IS NULL) unanchored`);
  check("db: exercise knowledge refs resolve", Object.values(refs.rows[0]).every((v) => Number(v) === 0),
    JSON.stringify(refs.rows[0]));

  const cloze = await client.query(`SELECT count(*)::int total FROM exercises WHERE kind='cloze' AND prompt_ja NOT LIKE '%＿＿%'`);
  check("db: cloze prompts contain a blank", cloze.rows[0].total === 0);

  const practice = await client.query(`
    SELECT count(*)::int total FROM exercises e
    LEFT JOIN lesson_sections s ON s.id = e.section_id
    WHERE s.id IS NULL OR s.kind <> 'practice'`);
  check("db: exercises attach to a practice section", practice.rows[0].total === 0);
}

async function httpChecks() {
  const set = await json(`/api/lessons/${SAMPLE}/exercises`);
  const exercises = set.body?.data?.exercises ?? [];
  check("api: exercise set 200", set.status === 200 && exercises.length > 0, `${exercises.length}`);
  check("api: grading declared server-side", set.body?.meta?.grading === "server-side");

  // The answer key must not leak in any form.
  const raw = JSON.stringify(set.body);
  check("api: no isCorrect field leaked", !raw.includes("isCorrect") && !raw.includes("is_correct"));
  check("api: no acceptedAnswers leaked", !raw.includes("acceptedAnswers") && !raw.includes("accepted_answers"));
  check("api: no correctOptionId leaked", !raw.includes("correctOptionId"));
  check("api: no explanation leaked pre-answer", !raw.includes("explanation"));

  const optionExercise = exercises.find((item) => item.answerMode === "option");
  const textExercise = exercises.find((item) => item.answerMode === "text");
  check("api: has option-mode exercise", Boolean(optionExercise));
  check("api: has text-mode exercise", Boolean(textExercise));
  check("api: options carry no correctness hint",
    optionExercise?.options?.every((option) => Object.keys(option).sort().join(",") === "id,label,position,subLabel"));

  // Grade using the real answer key from the database.
  const correctOption = await client.query(
    `SELECT id FROM exercise_options WHERE exercise_id=$1 AND is_correct LIMIT 1`,
    [optionExercise.id],
  );
  const wrongOption = await client.query(
    `SELECT id FROM exercise_options WHERE exercise_id=$1 AND NOT is_correct LIMIT 1`,
    [optionExercise.id],
  );

  const good = await post("/api/exercises/check", {
    answers: [{ exerciseId: optionExercise.id, optionId: correctOption.rows[0].id }],
  });
  check("api: correct option graded correct", good.body?.data?.grades?.[0]?.correct === true);
  check("api: awards points when correct", good.body?.data?.grades?.[0]?.awardedPoints === optionExercise.points);
  check("api: reveals correct option after grading", Number.isInteger(good.body?.data?.grades?.[0]?.correctOptionId));

  const bad = await post("/api/exercises/check", {
    answers: [{ exerciseId: optionExercise.id, optionId: wrongOption.rows[0].id }],
  });
  check("api: wrong option graded incorrect", bad.body?.data?.grades?.[0]?.correct === false);
  check("api: no points when wrong", bad.body?.data?.grades?.[0]?.awardedPoints === 0);
  check("api: explanation returned after grading", typeof bad.body?.data?.grades?.[0]?.explanation === "string");

  // Text grading, including kana-script tolerance.
  const accepted = await client.query(`SELECT accepted_answers FROM exercises WHERE id=$1`, [textExercise.id]);
  const answer = accepted.rows[0].accepted_answers[0];
  const typed = await post("/api/exercises/check", {
    answers: [{ exerciseId: textExercise.id, value: answer }],
  });
  check("api: typed correct answer accepted", typed.body?.data?.grades?.[0]?.correct === true, answer);
  const typedWrong = await post("/api/exercises/check", {
    answers: [{ exerciseId: textExercise.id, value: "zzzz" }],
  });
  check("api: typed wrong answer rejected", typedWrong.body?.data?.grades?.[0]?.correct === false);
  check("api: reveals accepted answer after grading", typeof typedWrong.body?.data?.grades?.[0]?.correctAnswer === "string");

  // Validation and abuse guards.
  const empty = await post("/api/exercises/check", { answers: [] });
  check("api: empty submission rejected", empty.status === 400);
  const unknown = await post("/api/exercises/check", { answers: [{ exerciseId: 99999999, optionId: 1 }] });
  check("api: unknown exercise rejected", unknown.status === 400);

  // Whole-set submission and scoring.
  const allCorrect = [];
  for (const exercise of exercises) {
    if (exercise.answerMode === "option") {
      const row = await client.query(
        `SELECT id FROM exercise_options WHERE exercise_id=$1 AND is_correct LIMIT 1`,
        [exercise.id],
      );
      allCorrect.push({ exerciseId: exercise.id, optionId: row.rows[0].id });
    } else {
      const row = await client.query(`SELECT accepted_answers FROM exercises WHERE id=$1`, [exercise.id]);
      allCorrect.push({ exerciseId: exercise.id, value: row.rows[0].accepted_answers[0] });
    }
  }
  const perfect = await post(`/api/lessons/${SAMPLE}/exercises/submit`, { answers: allCorrect });
  check("api: full correct submission scores 100%", perfect.body?.data?.percent === 100,
    `${perfect.body?.data?.percent}%`);
  check("api: submission marked passed", perfect.body?.data?.passed === true);
  // Phase 09.5 made submissions durable against the learner profile.
  check("api: submission persisted to progress", perfect.body?.meta?.persisted === true);
  check("api: score equals max", perfect.body?.data?.score === perfect.body?.data?.maxScore);

  const blank = await post(`/api/lessons/${SAMPLE}/exercises/submit`, { answers: [] });
  check("api: empty set scores zero and fails", blank.body?.data?.percent === 0 && blank.body?.data?.passed === false);

  const missing = await post("/api/lessons/not-a-lesson/exercises/submit", { answers: [] });
  check("api: unknown lesson returns 404", missing.status === 404);

  // UI.
  const page = await html(`/lessons/${SAMPLE}/practice`);
  check("ui: practice page 200", page.status === 200);
  check("ui: runner mounted", page.text.includes('data-testid="exercise-runner"'));
  check("ui: exercise cards rendered", (page.text.match(/data-testid="exercise-card"/g) ?? []).length === exercises.length,
    `${(page.text.match(/data-testid="exercise-card"/g) ?? []).length}/${exercises.length}`);
  check("ui: answer key absent from HTML", !page.text.includes("isCorrect") && !page.text.includes("correctOptionId"));
  check("ui: server grading disclosed", page.text.includes("graded on the server"));

  const lessonPage = await html(`/lessons/${SAMPLE}`);
  check("ui: lesson links to practice", lessonPage.text.includes('data-testid="start-practice"'));
  const playerPage = await html(`/lessons/${SAMPLE}/play`);
  check("ui: player has a practice step", playerPage.text.includes("Practice"));

  // Coverage across courses.
  let checked = 0;
  let ok = 0;
  const courses = await json("/api/courses");
  for (const course of courses.body?.data?.courses ?? []) {
    const detail = await json(`/api/courses/${course.slug}`);
    const first = detail.body?.data?.modules?.[0]?.lessons?.[0];
    if (!first) continue;
    checked += 1;
    const lessonSet = await json(`/api/lessons/${first.slug}/exercises`);
    if ((lessonSet.body?.data?.exercises ?? []).length > 0) ok += 1;
  }
  check("journey: sampled lessons across courses have exercises", checked > 0 && ok === checked, `${ok}/${checked}`);

  await client.end();
}

async function main() {
  console.log(`# Exercise engine gate — phase 09.4 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else {
    console.log("SKIP  API/UI checks (no BASE_URL provided)");
    await client.end();
  }
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
