#!/usr/bin/env node
/**
 * Phase 09.5 gate — progress tracking.
 *
 *   node tests/progress-gate.mjs http://127.0.0.1:3000
 *
 * Deployment gate chain:
 *   course → lesson → exercise → answer → score → progress
 *
 * The whole chain is walked with a single cookie jar, exactly like a browser.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
let failures = 0;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Minimal cookie jar so the learner session persists across requests. */
function makeJar() {
  const jar = new Map();
  return {
    header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb(response) {
      const raw = response.headers.getSetCookie?.() ?? [];
      for (const cookie of raw) {
        const [pair] = cookie.split(";");
        const index = pair.indexOf("=");
        if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    },
    has: (name) => jar.has(name),
    get: (name) => jar.get(name),
  };
}

async function call(jar, path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  jar.absorb(response);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("json")
    ? await response.json().catch(() => null)
    : await response.text();
  return { status: response.status, body };
}

const postJson = (jar, path, payload) =>
  call(jar, path, {
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

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('users','user_lesson_progress','user_exercise_attempts','user_course_progress')`);
  check("db: progress tables exist", tables.rows.length === 4, tables.rows.map((r) => r.table_name).join(","));

  const userModels = await client.query(`
    SELECT count(*)::int total FROM information_schema.tables
     WHERE table_schema='public' AND table_name IN ('accounts','profiles','learners','members')`);
  check("db: no competing user model introduced", userModels.rows[0].total === 0);
}

async function chainChecks() {
  const jar = makeJar();

  /* 1. COURSE */
  const courses = await call(jar, "/api/courses");
  const course = courses.body?.data?.courses?.[0];
  check("chain 1 — course: catalogue lists courses", courses.status === 200 && Boolean(course), course?.slug);

  const courseDetail = await call(jar, `/api/courses/${course.slug}`);
  const lessonRef = courseDetail.body?.data?.modules?.[0]?.lessons?.[0];
  check("chain 2 — lesson: course exposes a lesson", Boolean(lessonRef?.slug), lessonRef?.slug);
  const lessonSlug = lessonRef.slug;

  const before = await call(jar, `/api/progress/course/${course.slug}`);
  check("baseline: course progress starts empty", before.body?.data?.percent === 0,
    `${before.body?.data?.percent}%`);
  check("session: learner cookie issued", jar.has("nb_learner"));

  /* 3. EXERCISE */
  const set = await call(jar, `/api/lessons/${lessonSlug}/exercises`);
  const exercises = set.body?.data?.exercises ?? [];
  check("chain 3 — exercise: lesson has exercises", exercises.length > 0, `${exercises.length}`);

  /* 4. ANSWER (correct answers read from the DB, like a learner who knows them) */
  const answers = [];
  for (const exercise of exercises) {
    if (exercise.answerMode === "option") {
      const row = await client.query(
        `SELECT id FROM exercise_options WHERE exercise_id=$1 AND is_correct LIMIT 1`,
        [exercise.id],
      );
      answers.push({ exerciseId: exercise.id, optionId: row.rows[0].id });
    } else {
      const row = await client.query(`SELECT accepted_answers FROM exercises WHERE id=$1`, [exercise.id]);
      answers.push({ exerciseId: exercise.id, value: row.rows[0].accepted_answers[0] });
    }
  }
  const graded = await postJson(jar, "/api/exercises/check", { answers: [answers[0]] });
  check("chain 4 — answer: server grades the answer", graded.body?.data?.grades?.[0]?.correct === true);

  /* 5. SCORE */
  const submitted = await postJson(jar, `/api/lessons/${lessonSlug}/exercises/submit`, { answers });
  check("chain 5 — score: full set scores 100%", submitted.body?.data?.percent === 100,
    `${submitted.body?.data?.percent}%`);
  check("chain 5 — score: marked passed", submitted.body?.data?.passed === true);
  check("chain 5 — score: persisted flag set", submitted.body?.meta?.persisted === true);

  /* 6. PROGRESS */
  const lessonProgress = await call(jar, `/api/progress/lesson/${lessonSlug}`);
  check("chain 6 — progress: lesson best score recorded",
    lessonProgress.body?.data?.bestPercent === 100, `${lessonProgress.body?.data?.bestPercent}%`);
  check("chain 6 — progress: attempt counted", lessonProgress.body?.data?.attempts >= 1);

  const whoami = await call(jar, "/api/progress");
  const publicId = whoami.body?.data?.learner?.publicId;
  check("session: learner identified", typeof publicId === "string");
  const attemptRows = await client.query(
    `SELECT count(*)::int total, count(*) FILTER (WHERE correct)::int correct
       FROM user_exercise_attempts a
       JOIN users u ON u.id = a.user_id
      WHERE a.lesson_id = (SELECT id FROM lessons WHERE slug=$1) AND u.public_id = $2`,
    [lessonSlug, publicId],
  );
  check("chain 6 — progress: attempts persisted in the audit log",
    attemptRows.rows[0].total === exercises.length, `${attemptRows.rows[0].total}/${exercises.length}`);
  check("chain 6 — progress: attempts recorded as correct",
    attemptRows.rows[0].correct === exercises.length);

  /* Section progress → lesson completion → course rollup */
  const lessonDetail = await call(jar, `/api/lessons/${lessonSlug}`);
  const sections = lessonDetail.body?.data?.sections ?? [];
  for (const section of sections) {
    await postJson(jar, `/api/progress/lesson/${lessonSlug}`, { sectionKey: section.key });
  }
  const completed = await call(jar, `/api/progress/lesson/${lessonSlug}`);
  check("progress: all sections complete marks the lesson completed",
    completed.body?.data?.status === "completed", completed.body?.data?.status);
  check("progress: completed section list matches the lesson",
    completed.body?.data?.completedSections?.length === sections.length,
    `${completed.body?.data?.completedSections?.length}/${sections.length}`);

  const courseProgress = await call(jar, `/api/progress/course/${course.slug}`);
  check("progress: course rollup counts the completed lesson",
    courseProgress.body?.data?.lessonsCompleted >= 1, `${courseProgress.body?.data?.lessonsCompleted}`);
  check("progress: course percent advanced", courseProgress.body?.data?.percent > 0,
    `${courseProgress.body?.data?.percent}%`);

  const dashboard = await call(jar, "/api/progress");
  check("progress: dashboard reports the lesson", dashboard.body?.data?.lessons?.length >= 1);
  check("progress: dashboard totals include the attempts",
    dashboard.body?.data?.totals?.attempts >= exercises.length,
    `${dashboard.body?.data?.totals?.attempts}`);
  check("progress: accuracy computed", dashboard.body?.data?.totals?.accuracy === 100,
    `${dashboard.body?.data?.totals?.accuracy}%`);
  check("progress: points earned", dashboard.body?.data?.totals?.points > 0);

  /* Isolation: a different session must not see this learner's progress. */
  const otherJar = makeJar();
  const otherDashboard = await call(otherJar, "/api/progress");
  check("isolation: a new learner starts with no progress",
    (otherDashboard.body?.data?.lessons ?? []).length === 0);
  check("isolation: distinct learner identity issued",
    otherJar.get("nb_learner") !== jar.get("nb_learner"));

  /* Anti-cheat: a client-reported score cannot inflate progress. */
  const wrongAnswers = [];
  for (const exercise of exercises) {
    if (exercise.answerMode === "option") {
      const row = await client.query(
        `SELECT id FROM exercise_options WHERE exercise_id=$1 AND NOT is_correct LIMIT 1`,
        [exercise.id],
      );
      wrongAnswers.push({ exerciseId: exercise.id, optionId: row.rows[0].id });
    } else {
      wrongAnswers.push({ exerciseId: exercise.id, value: "zzzz" });
    }
  }
  const cheatJar = makeJar();
  const cheat = await postJson(cheatJar, `/api/lessons/${lessonSlug}/exercises/submit`, {
    answers: wrongAnswers,
    percent: 100,
    score: 999,
  });
  check("anti-cheat: server score ignores client-supplied values",
    cheat.body?.data?.percent === 0 && cheat.body?.data?.score === 0,
    `${cheat.body?.data?.percent}% / ${cheat.body?.data?.score}`);
  check("anti-cheat: failed attempt is not marked passed", cheat.body?.data?.passed === false);

  /* Persistence across requests */
  const reread = await call(jar, `/api/progress/lesson/${lessonSlug}`);
  check("persistence: progress survives new requests",
    reread.body?.data?.status === "completed" && reread.body?.data?.bestPercent === 100);

  /* UI */
  const dash = await call(jar, "/dashboard");
  check("ui: dashboard renders", dash.status === 200 && String(dash.body).includes('data-testid="dashboard"'));
  check("ui: dashboard shows course progress", String(dash.body).includes('data-testid="dashboard-courses"'));
  check("ui: dashboard shows the studied lesson", String(dash.body).includes(lessonRef.title));
  const player = await call(jar, `/lessons/${lessonSlug}/play`);
  check("ui: player renders with saved progress", player.status === 200);
  const practice = await call(jar, `/lessons/${lessonSlug}/practice`);
  check("ui: practice page renders", practice.status === 200 && String(practice.body).includes("exercise-runner"));

  /* Validation */
  const badSection = await postJson(jar, `/api/progress/lesson/${lessonSlug}`, { sectionKey: "" });
  check("api: invalid section rejected", badSection.status === 400);
  const missing = await call(jar, "/api/progress/lesson/not-a-lesson");
  check("api: unknown lesson returns 404", missing.status === 404);

  await client.end();
}

async function main() {
  console.log(`# Progress tracking gate — phase 09.5 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await chainChecks();
  else {
    console.log("SKIP  chain checks (no BASE_URL provided)");
    await client.end();
  }
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
