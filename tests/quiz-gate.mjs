#!/usr/bin/env node
/**
 * Phase 10.2 gate — quiz runs on top of the generic question engine.
 *
 *   node tests/quiz-gate.mjs http://127.0.0.1:3000
 *
 * Asserts that a quiz run is sampled server-side, frozen with a seed, graded by
 * the shared engine (never by the client), and that the run model is the only
 * assessment model in the schema.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
let failures = 0;
let cookie = null;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const json = async (path, init) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init?.headers ?? {}) },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json().catch(() => null) };
};
const post = (path, payload) =>
  json(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

const grabCookie = async () => {
  const response = await fetch(`${BASE_URL}/api/progress`);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return Boolean(cookie);
};

async function databaseChecks() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const local = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();

  /* One run model, correctly linked to the canonical bank. */
  const structure = await client.query(`SELECT
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('quiz_runs','quiz_run_items')) run_tables,
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE '%attempt%') attempt_tables`);
  const s = structure.rows[0];
  check("db: run tables exist", Number(s.run_tables) === 2);
  check("db: no competing attempt model", Number(s.attempt_tables) === 0,
    `${s.attempt_tables} tables named *attempt*`);

  const keys = await client.query(`SELECT
    (SELECT count(*) FROM quiz_run_items i
       LEFT JOIN questions q ON q.id = i.question_id
      WHERE q.id IS NULL) orphan_questions,
    (SELECT count(*) FROM quiz_run_items i
       LEFT JOIN quiz_runs r ON r.id = i.run_id
      WHERE r.id IS NULL) orphan_runs,
    (SELECT count(*) FROM quiz_runs WHERE question_count <> (SELECT count(*) FROM quiz_run_items WHERE run_id = quiz_runs.id)) count_drift`);
  const k = keys.rows[0];
  check("db: every run item resolves to a bank question", Number(k.orphan_questions) === 0);
  check("db: every run item belongs to a run", Number(k.orphan_runs) === 0);
  check("db: run question_count matches its items", Number(k.count_drift) === 0);

  /* Answer-key secrecy at rest: an unanswered item must carry no key material. */
  const secrecy = await client.query(`SELECT
    (SELECT count(*) FROM quiz_run_items
      WHERE answered = false AND (correct IS NOT NULL OR correct_answer IS NOT NULL
                                  OR explanation IS NOT NULL OR feedback IS NOT NULL)) leaks,
    (SELECT count(*) FROM quiz_run_items
      WHERE answered = true AND correct IS NULL) ungraded`);
  check("db: unanswered items carry no answer key", Number(secrecy.rows[0].leaks) === 0);
  check("db: answered items are graded", Number(secrecy.rows[0].ungraded) === 0);

  const positions = await client.query(`SELECT count(*)::int AS bad FROM (
    SELECT run_id FROM quiz_run_items GROUP BY run_id
     HAVING count(DISTINCT position) <> count(*) OR min(position) <> 1
        OR max(position) <> count(*)) x`);
  check("db: item positions are dense and unique per run", Number(positions.rows[0].bad) === 0);

  const expiry = await client.query(`SELECT count(*)::int AS bad FROM quiz_runs
     WHERE (time_limit_seconds IS NULL AND expires_at IS NOT NULL)
        OR (time_limit_seconds IS NOT NULL AND expires_at IS NULL)`);
  check("db: timed runs always have an expiry", Number(expiry.rows[0].bad) === 0);

  await client.end();
}

async function httpChecks() {
  check("http: learner cookie available", await grabCookie());

  /* Start a small seeded quiz. */
  const start = await post("/api/quiz/runs", { kind: "quiz", title: "Gate quiz", jlpt: 5, skills: ["kanji"], limit: 4 });
  check("http: quiz starts", start.status === 200 && start.body?.data?.run?.publicId, `status ${start.status}`);
  const run = start.body?.data?.run;
  const items = start.body?.data?.items ?? [];
  check("http: server samples the requested length", items.length === 4, `${items.length} items`);
  check("http: run records the filters", run?.questionCount === 4 && run?.jlptLevel === 5 && run?.kind === "quiz");
  check("http: seed recorded for reproducibility", Number.isInteger(run?.seed));
  check("http: untimed quiz has no expiry", run?.timeLimitSeconds === null && run?.expiresAt === null);

  const raw = JSON.stringify(start.body);
  check("http: no answer key in the started run",
    !raw.includes("isCorrect") && !raw.includes("acceptedAnswers") && !raw.includes("correctAnswer"));
  check("http: items expose no answer",
    items.every((item) => item.answer === null));

  const publicId = run.publicId;

  /* Determinism: the same seed rebuilds the same run. */
  const replay = await post("/api/quiz/runs", { kind: "quiz", jlpt: 5, skills: ["kanji"], limit: 4, seed: run.seed });
  const a = (items ?? []).map((item) => item.question.id).join(",");
  const b = (replay.body?.data?.items ?? []).map((item) => item.question.id).join(",");
  check("http: seeded sampling reproduces the run", a === b && a.length > 0);

  /* Validation. */
  const badFilters = await post("/api/quiz/runs", { jlpt: 9, limit: 5 });
  check("http: invalid level rejected", badFilters.status === 400, `status ${badFilters.status}`);
  const tooBig = await post("/api/quiz/runs", { limit: 500 });
  check("http: oversized quiz rejected", tooBig.status === 400, `status ${tooBig.status}`);
  const empty = await post("/api/quiz/runs", { skills: ["reading"], jlpt: 4, limit: 5 });
  check("http: empty filter set rejected", empty.status === 422, `status ${empty.status}`);

  /* Ownership: a run cannot be read without the owning cookie. */
  const anonymous = await fetch(`${BASE_URL}/api/quiz/runs/${publicId}`);
  check("http: runs are not readable anonymously", anonymous.status !== 200 || (await anonymous.json())?.data?.items?.length === undefined,
    `status ${anonymous.status}`);

  /* Grade an option question through the shared engine. */
  const optionItem = items.find((item) => item.question.answerMode === "option");
  if (!optionItem) throw new Error("expected at least one option question");
  const answer1 = await post(`/api/quiz/runs/${publicId}/answers`, {
    position: optionItem.position,
    optionId: optionItem.question.options[0].id,
  });
  check("http: answer graded", answer1.status === 200 && answer1.body?.data?.grade, `status ${answer1.status}`);
  const grade1 = answer1.body?.data?.grade;
  check("http: grade reports points from the bank", Number.isInteger(grade1?.points));
  check("http: run counters advance", answer1.body?.data?.run?.answeredCount === 1);
  check("http: remaining decreases", answer1.body?.data?.remaining === 3);

  /* An item can only be answered once. */
  const again = await post(`/api/quiz/runs/${publicId}/answers`, {
    position: optionItem.position,
    optionId: optionItem.question.options[1]?.id ?? optionItem.question.options[0].id,
  });
  check("http: repeat submission does not double count",
    again.status === 200 && again.body?.data?.run?.answeredCount === 1,
    `status ${again.status}`);

  const bogus = await post(`/api/quiz/runs/${publicId}/answers`, { position: 999, optionId: 1 });
  check("http: unknown position rejected", bogus.status === 404, `status ${bogus.status}`);

  /* Text-mode grading (katakana normalisation is inherited from the engine). */
  const textItem = items.find((item) => item.question.answerMode === "text");
  if (textItem) {
    const textAnswer = await post(`/api/quiz/runs/${publicId}/answers`, {
      position: textItem.position,
      value: "not-a-real-answer",
    });
    check("http: text answer graded", textAnswer.status === 200 && textAnswer.body?.data?.grade?.correct === false);
  } else {
    console.log("SKIP  no text question in this sample");
  }

  /* Client-supplied scores must be ignored: complete and read server numbers. */
  const complete = await post(`/api/quiz/runs/${publicId}/complete`, { percent: 100, score: 9999 });
  check("http: run completes", complete.status === 200, `status ${complete.status}`);
  const resultRun = complete.body?.data?.run;
  const result = complete.body?.data?.result;
  check("http: completion sets status", resultRun?.status === "completed");
  check("http: score is server-computed", resultRun?.answeredCount === resultRun?.correctCount + (result?.incorrect ?? 0));
  check("http: percent is server-computed", resultRun?.percent === result?.percent);
  check("http: pass mark applied to quizzes", result?.passingPercent === 60 && typeof result?.passed === "boolean");
  check("http: skipped questions counted", (result?.skipped ?? 0) + (result?.answered ?? 0) === resultRun?.questionCount);

  const completeAgain = await post(`/api/quiz/runs/${publicId}/complete`, {});
  check("http: completion is idempotent",
    completeAgain.status === 200 && completeAgain.body?.data?.run?.answeredCount === resultRun?.answeredCount);

  const lateAnswer = await post(`/api/quiz/runs/${publicId}/answers`, {
    position: (items.find((item) => item.position !== optionItem.position && item.question.answerMode === "option") ?? items[1]).position,
    optionId: 1,
  });
  check("http: completed run refuses new answers", lateAnswer.status === 409, `status ${lateAnswer.status}`);

  /* History and stats. */
  const history = await json("/api/quiz/runs?limit=10");
  check("http: history lists the run",
    (history.body?.data?.runs ?? []).some((entry) => entry.publicId === publicId));
  const stats = await json("/api/quiz/stats");
  check("http: stats expose platform counters",
    Number.isInteger(stats.body?.data?.runs) && stats.body?.data?.runs > 0);
}

async function main() {
  console.log(`quiz-gate ${BASE_URL ? `against ${BASE_URL}` : "(database only)"}`);
  if (!BASE_URL) {
    console.log("FAIL  BASE_URL is required for the HTTP phase");
    process.exit(1);
  }
  await databaseChecks();
  await httpChecks();
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} failures)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
