#!/usr/bin/env node
/**
 * Phase 10.1 gate — generic question engine.
 *
 *   node tests/question-engine-gate.mjs http://127.0.0.1:3000
 *
 * Asserts there is ONE canonical question bank and ONE grading authority that
 * lesson exercises, quizzes and JLPT tests can all consume.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
let failures = 0;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const json = async (path, init) => {
  const response = await fetch(`${BASE_URL}${path}`, init);
  return { status: response.status, body: await response.json().catch(() => null) };
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
    (SELECT count(*)::int FROM questions) total,
    (SELECT count(*)::int FROM questions WHERE active) active,
    (SELECT count(*)::int FROM question_options) options,
    (SELECT count(DISTINCT skill)::int FROM questions) skills,
    (SELECT count(DISTINCT jlpt_level)::int FROM questions WHERE jlpt_level IS NOT NULL) levels,
    (SELECT count(DISTINCT kind)::int FROM questions) kinds`);
  const c = counts.rows[0];
  check("db: bank populated", c.total >= 500, `${c.total} questions`);
  check("db: options stored", c.options >= 1000, `${c.options}`);
  check("db: multiple skills", c.skills >= 3, `${c.skills}`);
  check("db: JLPT levels covered", c.levels >= 4, `${c.levels} levels`);
  check("db: multiple question kinds", c.kinds >= 3, `${c.kinds}`);

  const integrity = await client.query(`SELECT
    (SELECT count(*) FROM (SELECT question_id FROM question_options GROUP BY question_id HAVING count(*) FILTER (WHERE is_correct) <> 1) x) bad_key,
    (SELECT count(*) FROM (SELECT question_id, lower(label) FROM question_options GROUP BY question_id, lower(label) HAVING count(*) > 1) y) dup,
    (SELECT count(*) FROM (SELECT question_id FROM question_options GROUP BY question_id HAVING count(*) < 4) z) too_few,
    (SELECT count(*) FROM questions WHERE answer_mode='option' AND NOT EXISTS (SELECT 1 FROM question_options o WHERE o.question_id=questions.id)) no_opts,
    (SELECT count(*) FROM questions WHERE answer_mode='text' AND (accepted_answers IS NULL OR jsonb_array_length(accepted_answers)=0)) no_ans,
    (SELECT count(*) FROM questions WHERE prompt IS NULL OR prompt='') no_prompt,
    (SELECT count(*) FROM questions WHERE grammar_point_id IS NULL AND kanji_id IS NULL AND vocabulary_id IS NULL AND sentence_id IS NULL) unanchored`);
  check("db: exactly one correct option per question", Number(integrity.rows[0].bad_key) === 0);
  check("db: no duplicate option labels", Number(integrity.rows[0].dup) === 0);
  check("db: at least four options per choice question", Number(integrity.rows[0].too_few) === 0);
  check("db: option questions have choices", Number(integrity.rows[0].no_opts) === 0);
  check("db: text questions have accepted answers", Number(integrity.rows[0].no_ans) === 0);
  check("db: every question has a prompt", Number(integrity.rows[0].no_prompt) === 0);
  check("db: every question anchors to canonical knowledge", Number(integrity.rows[0].unanchored) === 0);

  const refs = await client.query(`SELECT
    (SELECT count(*) FROM questions q LEFT JOIN grammar_points g ON g.id=q.grammar_point_id WHERE q.grammar_point_id IS NOT NULL AND g.id IS NULL) g,
    (SELECT count(*) FROM questions q LEFT JOIN kanji k ON k.id=q.kanji_id WHERE q.kanji_id IS NOT NULL AND k.id IS NULL) k,
    (SELECT count(*) FROM questions q LEFT JOIN vocabulary v ON v.id=q.vocabulary_id WHERE q.vocabulary_id IS NOT NULL AND v.id IS NULL) v`);
  check("db: knowledge refs resolve", Object.values(refs.rows[0]).every((x) => Number(x) === 0));

  /* No competing model: every lesson exercise is a placement of a bank question. */
  const linked = await client.query(`SELECT
    (SELECT count(*)::int FROM exercises) total,
    (SELECT count(*)::int FROM exercises WHERE question_id IS NOT NULL) linked`);
  check("db: every lesson exercise links to the bank",
    linked.rows[0].total === linked.rows[0].linked,
    `${linked.rows[0].linked}/${linked.rows[0].total}`);

  const origins = await client.query(
    `SELECT count(*)::int total FROM questions WHERE origin='lesson_exercise'`);
  check("db: lesson exercises backfilled into the bank", origins.rows[0].total >= 100,
    `${origins.rows[0].total}`);
}

async function httpChecks() {
  /* Bank query */
  const all = await json("/api/questions?limit=10");
  check("api: bank query 200", all.status === 200 && (all.body?.data?.questions ?? []).length === 10);
  check("api: reports matching total", all.body?.meta?.matching > 100, `${all.body?.meta?.matching}`);
  check("api: grading declared server-side", all.body?.meta?.grading === "server-side");

  /* Answer key must not leak */
  const raw = JSON.stringify(all.body);
  check("api: no isCorrect leaked", !raw.includes("isCorrect") && !raw.includes("is_correct"));
  check("api: no acceptedAnswers leaked", !raw.includes("acceptedAnswers") && !raw.includes("accepted_answers"));
  check("api: no explanation leaked pre-answer", !raw.includes("explanation"));
  check("api: options expose only safe fields",
    (all.body?.data?.questions ?? []).every((q) =>
      q.options.every((o) => Object.keys(o).sort().join(",") === "id,label,position,subLabel")));

  /* Filtering */
  const kanjiOnly = await json("/api/questions?skills=kanji&limit=15");
  check("api: skill filter", (kanjiOnly.body?.data?.questions ?? []).every((q) => q.skill === "kanji"));
  const n5 = await json("/api/questions?jlpt=5&limit=15");
  check("api: JLPT filter", (n5.body?.data?.questions ?? []).every((q) => q.jlptLevel === 5),
    `${n5.body?.data?.questions?.length ?? 0} N5`);
  const cloze = await json("/api/questions?kinds=meaning&limit=10");
  check("api: kind filter", (cloze.body?.data?.questions ?? []).every((q) => q.kind === "meaning"));
  const bad = await json("/api/questions?jlpt=9");
  check("api: invalid level rejected", bad.status === 400);

  /* Deterministic sampling for reproducible quizzes/tests */
  const seedA = await json("/api/questions?limit=8&seed=4242");
  const seedB = await json("/api/questions?limit=8&seed=4242");
  const idsA = (seedA.body?.data?.questions ?? []).map((q) => q.id).join(",");
  const idsB = (seedB.body?.data?.questions ?? []).map((q) => q.id).join(",");
  check("api: seeded sampling is deterministic", idsA === idsB && idsA.length > 0);
  const seedC = await json("/api/questions?limit=8&seed=777");
  check("api: different seed yields a different set",
    (seedC.body?.data?.questions ?? []).map((q) => q.id).join(",") !== idsA);

  /* Grading — option mode */
  const optionQ = (all.body?.data?.questions ?? []).find((q) => q.answerMode === "option");
  check("api: bank has option questions", Boolean(optionQ));
  const correct = await client.query(
    `SELECT id FROM question_options WHERE question_id=$1 AND is_correct LIMIT 1`, [optionQ.id]);
  const wrong = await client.query(
    `SELECT id FROM question_options WHERE question_id=$1 AND NOT is_correct LIMIT 1`, [optionQ.id]);

  const good = await post("/api/questions/check", {
    answers: [{ questionId: optionQ.id, optionId: correct.rows[0].id }],
  });
  check("api: correct option graded correct", good.body?.data?.grades?.[0]?.correct === true);
  check("api: points awarded", good.body?.data?.grades?.[0]?.awardedPoints === optionQ.points);
  check("api: score summary returned", good.body?.data?.percent === 100, `${good.body?.data?.percent}%`);

  const nope = await post("/api/questions/check", {
    answers: [{ questionId: optionQ.id, optionId: wrong.rows[0].id }],
  });
  check("api: wrong option graded incorrect", nope.body?.data?.grades?.[0]?.correct === false);
  check("api: no points when wrong", nope.body?.data?.grades?.[0]?.awardedPoints === 0);
  check("api: explanation revealed after grading",
    typeof nope.body?.data?.grades?.[0]?.explanation === "string");
  check("api: correct option revealed after grading",
    Number.isInteger(nope.body?.data?.grades?.[0]?.correctOptionId));

  /* Grading — text mode, with kana-script tolerance */
  const textRow = await client.query(
    `SELECT id, accepted_answers FROM questions WHERE answer_mode='text' AND active LIMIT 1`);
  const textId = textRow.rows[0].id;
  const accepted = textRow.rows[0].accepted_answers[0];
  const typed = await post("/api/questions/check", {
    answers: [{ questionId: textId, value: accepted }],
  });
  check("api: typed correct answer accepted", typed.body?.data?.grades?.[0]?.correct === true, accepted);

  const katakana = accepted.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60));
  const script = await post("/api/questions/check", {
    answers: [{ questionId: textId, value: katakana }],
  });
  check("api: katakana input normalised to hiragana",
    script.body?.data?.grades?.[0]?.correct === true, katakana);

  const typedBad = await post("/api/questions/check", {
    answers: [{ questionId: textId, value: "zzzz" }],
  });
  check("api: typed wrong answer rejected", typedBad.body?.data?.grades?.[0]?.correct === false);

  /* Anti-cheat + validation */
  const cheat = await post("/api/questions/check", {
    answers: [{ questionId: optionQ.id, optionId: wrong.rows[0].id }],
    percent: 100,
    score: 999,
  });
  check("anti-cheat: client score ignored", cheat.body?.data?.percent === 0,
    `${cheat.body?.data?.percent}%`);
  const empty = await post("/api/questions/check", { answers: [] });
  check("api: empty submission rejected", empty.status === 400);
  const unknown = await post("/api/questions/check", { answers: [{ questionId: 99999999, optionId: 1 }] });
  check("api: unknown question rejected", unknown.status === 400);

  /* Bank stats */
  const stats = await json("/api/questions/stats");
  check("api: stats expose skills", (stats.body?.data?.bySkill ?? []).length >= 3);
  check("api: stats expose levels", (stats.body?.data?.byLevel ?? []).length >= 4);
  check("api: stats expose origins", (stats.body?.data?.byOrigin ?? []).length >= 2);

  /* Consumer integration: lesson exercises still grade through the shared core */
  const lesson = await json("/api/lessons/n4-conditionals/exercises");
  const ex = (lesson.body?.data?.exercises ?? [])[0];
  check("integration: lesson exercise set still served", Boolean(ex));
  const exCorrect = await client.query(
    `SELECT id FROM exercise_options WHERE exercise_id=$1 AND is_correct LIMIT 1`, [ex.id]);
  const exGrade = await post("/api/exercises/check", {
    answers: [{ exerciseId: ex.id, optionId: exCorrect.rows[0].id }],
  });
  check("integration: lesson grading still correct via shared core",
    exGrade.body?.data?.grades?.[0]?.correct === true);

  const bankId = await client.query(`SELECT question_id FROM exercises WHERE id=$1`, [ex.id]);
  check("integration: exercise resolves to a bank question",
    Number.isInteger(bankId.rows[0].question_id));

  await client.end();
}

async function main() {
  console.log(`# Question engine gate — phase 10.1 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else {
    console.log("SKIP  API checks (no BASE_URL provided)");
    await client.end();
  }
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
