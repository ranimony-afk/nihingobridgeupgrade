#!/usr/bin/env node
/**
 * Phase 09.3 gate — lesson player.
 *
 *   node tests/lesson-player-gate.mjs http://127.0.0.1:3000
 *
 * The player must be driven entirely by the canonical 09.2 section/block data,
 * render server-side, expose navigation controls, and link every knowledge
 * block to a route that actually resolves.
 */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
const SAMPLE = "n4-conditionals";
let failures = 0;

const check = (name, condition, detail = "") => {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const json = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, body: await response.json().catch(() => null) };
};
const html = async (path) => {
  const response = await fetch(`${BASE_URL}${path}`);
  return { status: response.status, text: await response.text() };
};

async function databaseChecks() {
  const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
  const local = /@(localhost|127\.0\.0\.1|::1)(:|\/|$)/.test(url);
  const client = new pg.Client({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  const playable = await client.query(`
    SELECT count(*)::int total FROM lessons l
    WHERE l.published = true
      AND EXISTS (SELECT 1 FROM lesson_sections s WHERE s.lesson_id = l.id AND s.published)
      AND EXISTS (SELECT 1 FROM lesson_blocks b WHERE b.lesson_id = l.id)`);
  const lessons = await client.query(`SELECT count(*)::int total FROM lessons WHERE published`);
  check(
    "db: every published lesson is playable",
    playable.rows[0].total === lessons.rows[0].total,
    `${playable.rows[0].total}/${lessons.rows[0].total}`,
  );

  const empty = await client.query(`
    SELECT count(*)::int total FROM lesson_sections s
    WHERE s.published AND NOT EXISTS (SELECT 1 FROM lesson_blocks b WHERE b.section_id = s.id)`);
  check("db: no empty player steps", empty.rows[0].total === 0, `${empty.rows[0].total} empty`);

  const firstStep = await client.query(`
    SELECT count(*)::int total FROM lessons l
    WHERE l.published AND NOT EXISTS (
      SELECT 1 FROM lesson_sections s WHERE s.lesson_id=l.id AND s.published AND s.position = 1)`);
  check("db: every lesson has a first step", firstStep.rows[0].total === 0);

  await client.end();
}

async function httpChecks() {
  const api = await json(`/api/lessons/${SAMPLE}`);
  const lesson = api.body?.data;
  check("api: player payload available", api.status === 200 && lesson?.sections?.length > 0);

  const page = await html(`/lessons/${SAMPLE}/play`);
  check("ui: player route 200", page.status === 200);
  check("ui: player mounted", page.text.includes('data-testid="lesson-player"'));
  check("ui: step navigation rendered", page.text.includes('data-testid="player-steps"'));
  check("ui: active section rendered", page.text.includes('data-testid="player-section"'));
  check("ui: progress bar", page.text.includes('role="progressbar"'));
  check("ui: completion control", page.text.includes("Mark complete &amp; continue") || page.text.includes("Mark complete"));
  check("ui: keyboard hint documented", page.text.includes("Keyboard:"));
  check("ui: practice step available in the player",
    lesson.sections.some((section) => section.kind === "practice"));
  // Phase 09.5 replaced browser-only progress with the learner profile.
  check("ui: progress storage disclosed", page.text.includes("saved to your learner profile"));

  // Every section title must be present in the server HTML (SSR completeness).
  const missingTitles = lesson.sections.filter((section) => !page.text.includes(section.title));
  check("ui: all step titles server-rendered", missingTitles.length === 0,
    missingTitles.map((section) => section.key).join(",") || "all present");

  // First step content must be visible without JS.
  const first = lesson.sections[0];
  const firstProse = first.blocks.find((block) => block.kind === "text" && block.body);
  check("ui: first step content server-rendered",
    Boolean(firstProse) && page.text.includes(firstProse.body.slice(0, 40)));

  check("ui: noscript fallback present", page.text.includes("<noscript>"));

  // Knowledge links inside the player must resolve.
  const refs = lesson.sections.flatMap((section) =>
    section.blocks.filter((block) => block.reference),
  );
  check("ui: player exposes knowledge links", refs.length > 0, `${refs.length} refs`);
  const inHtml = refs.filter((block) => page.text.includes(block.reference.href));
  check("ui: reference routes rendered in player", inHtml.length === refs.length,
    `${inHtml.length}/${refs.length}`);

  let opened = 0;
  for (const block of refs.slice(0, 6)) {
    const target = await html(block.reference.href);
    if (target.status === 200) opened += 1;
  }
  check("journey: sampled player links open", opened === Math.min(refs.length, 6),
    `${opened}/${Math.min(refs.length, 6)}`);

  // Entry points.
  const lessonPage = await html(`/lessons/${SAMPLE}`);
  check("ui: lesson page offers the player", lessonPage.text.includes('data-testid="start-player"'));
  check("ui: lesson page links to /play", lessonPage.text.includes(`/lessons/${SAMPLE}/play`));
  const coursePage = await html("/courses/jlpt-n4-grammar-path");
  check("ui: course outline offers study links", coursePage.text.includes("/play"));

  // Continuity between lessons.
  const next = lesson.next;
  check("api: next lesson available for continuation", Boolean(next?.slug));
  if (next?.slug) {
    const nextPlayer = await html(`/lessons/${next.slug}/play`);
    check("journey: next lesson player opens", nextPlayer.status === 200);
  }

  const missing = await html("/lessons/not-a-lesson/play");
  check("ui: unknown lesson returns 404", missing.status === 404);

  // Every published lesson must have a working player route.
  const courses = await json("/api/courses");
  let checked = 0;
  let ok = 0;
  for (const course of courses.body?.data?.courses ?? []) {
    const detail = await json(`/api/courses/${course.slug}`);
    for (const courseModule of detail.body?.data?.modules ?? []) {
      for (const item of courseModule.lessons.slice(0, 1)) {
        checked += 1;
        const player = await html(`/lessons/${item.slug}/play`);
        if (player.status === 200 && player.text.includes('data-testid="lesson-player"')) ok += 1;
      }
    }
  }
  check("journey: sampled lessons across all courses are playable", checked > 0 && ok === checked,
    `${ok}/${checked}`);
}

async function main() {
  console.log(`# Lesson player gate — phase 09.3 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else console.log("SKIP  API/UI checks (no BASE_URL provided)");
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
