#!/usr/bin/env node
/**
 * Phase 10.3 gate — JLPT N5 timed tests.
 *
 *   node tests/jlpt-gate.mjs http://127.0.0.1:3000
 *
 * Asserts that a blueprint is structure only, that the bank can fill every
 * section, that an attempt is timed server-side, that section gates are
 * enforced, and that scoring happens through the shared run engine.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
let failures = 0;
let cookie = null;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const json = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const post = async (path, payload) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(payload),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: response.status, body: await response.json().catch(() => null) };
};

async function databaseChecks() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const local = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();

  const blueprint = await client.query(`SELECT
    (SELECT count(*) FROM jlpt_tests) tests,
    (SELECT count(*) FROM jlpt_tests WHERE published) published,
    (SELECT count(*) FROM jlpt_tests WHERE published AND NOT available) unavailable,
    (SELECT count(*) FROM jlpt_tests WHERE level = 5 AND published) n5,
    (SELECT count(*) FROM jlpt_test_sections) sections`);
  const b = blueprint.rows[0];
  check("db: blueprint loaded", Number(b.tests) >= 1, `${b.tests} blueprints`);
  check("db: blueprint published", Number(b.published) >= 1);
  check("db: published blueprints are bank-satisfiable", Number(b.unavailable) === 0);
  check("db: N5 blueprint published", Number(b.n5) >= 1);
  check("db: sections stored", Number(b.sections) >= 2, `${b.sections} sections`);

  /* Blueprint consistency: counts, limits and coverage. */
  const consistent = await client.query(`
    SELECT t.slug,
           t.question_count AS declared,
           coalesce((SELECT sum(s.question_count) FROM jlpt_test_sections s WHERE s.test_id = t.id), 0) AS sections_total,
           t.time_limit_seconds AS total_limit,
           coalesce((SELECT sum(s.time_limit_seconds) FROM jlpt_test_sections s WHERE s.test_id = t.id), 0) AS section_limit,
           (SELECT count(*) FROM jlpt_test_sections s WHERE s.test_id = t.id AND (s.skills IS NULL OR jsonb_array_length(s.skills) = 0)) skillless
      FROM jlpt_tests t WHERE t.published`);
  for (const row of consistent.rows) {
    check(`db: ${row.slug} counts match its sections`, Number(row.declared) === Number(row.sections_total),
      `${row.declared} vs ${row.sections_total}`);
    check(`db: ${row.slug} time limit covers its sections`,
      Number(row.total_limit) >= Number(row.section_limit),
      `${row.total_limit}s vs ${row.section_limit}s`);
    check(`db: ${row.slug} every section samples skills`, Number(row.skillless) === 0);
  }

  /* Live coverage: each published section must be fillable from the bank. */
  const coverage = await client.query(`
    SELECT t.slug, s.code, s.question_count,
           (SELECT count(*)::int FROM questions q
             WHERE q.active AND q.jlpt_level = t.level
               AND (jsonb_array_length(s.skills) = 0 OR q.skill = ANY(SELECT jsonb_array_elements_text(s.skills)))
               AND (s.kinds IS NULL OR jsonb_array_length(s.kinds) = 0
                    OR q.kind = ANY(SELECT jsonb_array_elements_text(s.kinds)))) AS available
      FROM jlpt_tests t JOIN jlpt_test_sections s ON s.test_id = t.id
     WHERE t.published ORDER BY t.slug, s.position`);
  for (const row of coverage.rows) {
    check(`db: ${row.slug}/${row.code} bank covers the section`,
      Number(row.available) >= Number(row.question_count),
      `${row.available} available / ${row.question_count} needed`);
  }

  /* Attempts are runs — never a second model. */
  const attempts = await client.query(`SELECT
    (SELECT count(*) FROM quiz_runs WHERE kind = 'jlpt') jlpt_runs,
    (SELECT count(*) FROM quiz_runs r LEFT JOIN jlpt_tests t ON t.id = r.jlpt_test_id
       WHERE r.kind = 'jlpt' AND t.id IS NULL) unlinked`);
  check("db: JLPT attempts live in the run model", Number(attempts.rows[0].unlinked) === 0);

  await client.end();
}

async function httpChecks() {
  const progress = await fetch(`${BASE_URL}/api/progress`);
  const setCookie = progress.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  check("http: learner cookie available", Boolean(cookie));

  const list = await json("/api/jlpt/tests");
  check("http: published tests listed", list.status === 200 && (list.body?.data?.tests ?? []).length > 0);
  const n5 = (list.body?.data?.tests ?? []).find((test) => test.level === 5);
  check("http: N5 blueprint published and available", Boolean(n5?.available), n5?.slug ?? "missing");
  check("http: blueprint exposes pass gates", n5?.passingPercent >= 1 && n5?.sectionMinimumPercent >= 1);
  check("http: blueprint exposes per-section limits",
    n5?.sections?.length >= 2 && n5.sections.every((section) => section.timeLimitSeconds >= 60));

  const detail = await json(`/api/jlpt/tests/${n5.slug}`);
  check("http: blueprint detail 200", detail.status === 200 && detail.body?.data?.test?.slug === n5.slug);
  check("http: blueprint detail reports bank availability",
    detail.body?.data?.test?.sections?.every((section) => section.satisfiable));
  const missing = await json("/api/jlpt/tests/does-not-exist");
  check("http: unknown blueprint 404", missing.status === 404, `status ${missing.status}`);

  /* Start an attempt. */
  const started = await post(`/api/jlpt/tests/${n5.slug}/attempts`, {});
  check("http: attempt starts", started.status === 200, `status ${started.status}`);
  const run = started.body?.data?.run;
  const items = started.body?.data?.items ?? [];
  check("http: attempt is timed server-side",
    run?.timeLimitSeconds === n5.timeLimitSeconds && Boolean(run?.expiresAt));
  check("http: attempt items match the blueprint", items.length === n5.questionCount,
    `${items.length}/${n5.questionCount}`);
  check("http: attempt kind is jlpt", run?.kind === "jlpt" && run?.jlptSlug === n5.slug);
  check("http: no answer key in the attempt",
    !JSON.stringify(started.body).includes("isCorrect") &&
      items.every((item) => item.answer === null));

  const sectionCounts = new Map();
  for (const item of items) sectionCounts.set(item.sectionCode, (sectionCounts.get(item.sectionCode) ?? 0) + 1);
  check("http: sections sized per blueprint",
    n5.sections.every((section) => sectionCounts.get(section.code) === section.questionCount),
    [...sectionCounts.entries()].map(([code, count]) => `${code}=${count}`).join(","));
  check("http: item positions are dense",
    items.map((item) => item.position).join(",") === items.map((_, index) => index + 1).join(","));

  const replay = await post(`/api/jlpt/tests/${n5.slug}/attempts`, { seed: run.seed });
  const a = items.map((item) => item.question.id).join(",");
  const b = (replay.body?.data?.items ?? []).map((item) => item.question.id).join(",");
  check("http: seeded attempt is reproducible", a === b && a.length > 0);

  /* Answer everything by guessing the first option, then submit. */
  for (const item of items) {
    await post(`/api/quiz/runs/${run.publicId}/answers`, {
      position: item.position,
      optionId: item.question.options[0]?.id ?? null,
      value: item.question.answerMode === "text" ? "x" : null,
    });
  }
  const submitted = await post(`/api/quiz/runs/${run.publicId}/complete`, { percent: 100, passed: true });
  check("http: attempt submits", submitted.status === 200, `status ${submitted.status}`);
  const result = submitted.body?.data?.result;
  const graded = submitted.body?.data?.run;
  check("http: every item graded", graded?.answeredCount === graded?.questionCount);
  check("http: section results computed",
    result?.sections?.length === n5.sections.length &&
      result.sections.every((section) => section.questionCount > 0 && Number.isInteger(section.percent)));
  check("http: skill breakdown computed", (result?.skills ?? []).length >= 1);
  check("http: section gates evaluated",
    result.sections.every((section) => typeof section.passed === "boolean"));
  check("http: overall pass decision is server-side", typeof result?.passed === "boolean");
  check("http: client-supplied score ignored", graded?.percent === result?.percent);

  const attempts = await json("/api/jlpt/attempts");
  check("http: attempt history lists the attempt",
    (attempts.body?.data?.attempts ?? []).some((entry) => entry.publicId === run.publicId));

  const stats = await json("/api/jlpt/stats");
  check("http: stats report attempts", Number(stats.body?.data?.attempts) >= 1);
  check("http: stats report bank coverage by level",
    (stats.body?.data?.bankQuestionsByLevel ?? []).some((entry) => entry.level === 5));
}

async function main() {
  console.log(`jlpt-gate ${BASE_URL ? `against ${BASE_URL}` : "(database only)"}`);
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
