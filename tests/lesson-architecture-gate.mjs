#!/usr/bin/env node
/** Phase 09.2 gate — canonical lesson architecture (sections + blocks). */
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
  const client = new pg.Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
  await client.connect();

  const counts = await client.query(`SELECT
    (SELECT count(*) FROM lesson_sections WHERE published) sections,
    (SELECT count(*) FROM lesson_blocks) blocks,
    (SELECT count(*) FROM lesson_prerequisites) prerequisites,
    (SELECT count(DISTINCT lesson_id) FROM lesson_sections) lessons_with_sections,
    (SELECT count(*) FROM lessons WHERE published) lessons`);
  const c = counts.rows[0];
  check("db: sections created", Number(c.sections) >= 90, `${c.sections}`);
  check("db: practice sections added by the exercise engine",
    Number(c.sections) >= Number(c.lessons) * 5, `${c.sections} sections / ${c.lessons} lessons`);
  check("db: blocks created", Number(c.blocks) >= 400, `${c.blocks}`);
  check("db: every published lesson has sections", c.lessons === c.lessons_with_sections, `${c.lessons_with_sections}/${c.lessons}`);
  check("db: lesson prerequisites", Number(c.prerequisites) === 15, `${c.prerequisites}`);

  const kinds = await client.query(`SELECT kind, count(*)::int total FROM lesson_blocks GROUP BY kind`);
  const kindMap = new Map(kinds.rows.map((row) => [row.kind, row.total]));
  for (const kind of ["text", "objective", "tip", "checkpoint", "grammar_ref", "kanji_ref", "vocabulary_ref", "sentence_ref"]) {
    check(`db: ${kind} blocks exist`, (kindMap.get(kind) ?? 0) > 0, `${kindMap.get(kind) ?? 0}`);
  }

  const integrity = await client.query(`SELECT
    (SELECT count(*) FROM lesson_blocks b JOIN lesson_sections s ON s.id=b.section_id WHERE s.lesson_id<>b.lesson_id) wrong_lesson,
    (SELECT count(*) FROM lesson_blocks b LEFT JOIN grammar_points g ON g.id=b.grammar_point_id WHERE b.grammar_point_id IS NOT NULL AND g.id IS NULL) bad_grammar,
    (SELECT count(*) FROM lesson_blocks b LEFT JOIN kanji k ON k.id=b.kanji_id WHERE b.kanji_id IS NOT NULL AND k.id IS NULL) bad_kanji,
    (SELECT count(*) FROM lesson_blocks b LEFT JOIN vocabulary v ON v.id=b.vocabulary_id WHERE b.vocabulary_id IS NOT NULL AND v.id IS NULL) bad_vocabulary,
    (SELECT count(*) FROM lesson_blocks b LEFT JOIN sentences s ON s.id=b.sentence_id WHERE b.sentence_id IS NOT NULL AND s.id IS NULL) bad_sentence,
    (SELECT count(*) FROM lesson_prerequisites WHERE lesson_id=prerequisite_lesson_id) self_prerequisite,
    (SELECT count(*) FROM lesson_blocks WHERE kind LIKE '%_ref' AND grammar_point_id IS NULL AND kanji_id IS NULL AND vocabulary_id IS NULL AND sentence_id IS NULL) empty_ref,
    (SELECT count(*) FROM lesson_blocks WHERE kind NOT LIKE '%_ref' AND (body IS NULL OR body='')) empty_prose`);
  check("db: block graph integrity", Object.values(integrity.rows[0]).every((value) => Number(value) === 0), JSON.stringify(integrity.rows[0]));

  const ordering = await client.query(`
    SELECT count(*)::int total FROM (
      SELECT section_id, position, row_number() OVER (PARTITION BY section_id ORDER BY position) - 1 AS expected
      FROM lesson_blocks
    ) x WHERE position <> expected`);
  check("db: block positions are contiguous from 0", Number(ordering.rows[0].total) === 0);

  const sectionOrder = await client.query(`
    SELECT count(*)::int total FROM (
      SELECT lesson_id, position, lag(position) OVER (PARTITION BY lesson_id ORDER BY position) prev
      FROM lesson_sections
    ) x WHERE prev IS NOT NULL AND position <= prev`);
  check("db: section positions strictly increase", Number(sectionOrder.rows[0].total) === 0);

  const cycles = await client.query(`
    WITH RECURSIVE walk(lesson_id, prerequisite_id, path, cycle) AS (
      SELECT lesson_id, prerequisite_lesson_id, ARRAY[lesson_id, prerequisite_lesson_id], false
      FROM lesson_prerequisites
      UNION ALL
      SELECT w.lesson_id, lp.prerequisite_lesson_id, w.path || lp.prerequisite_lesson_id,
             lp.prerequisite_lesson_id = ANY(w.path)
      FROM walk w JOIN lesson_prerequisites lp ON lp.lesson_id = w.prerequisite_id
      WHERE NOT w.cycle
    ) SELECT count(*)::int total FROM walk WHERE cycle`);
  check("db: lesson prerequisite graph is acyclic", Number(cycles.rows[0].total) === 0);

  const derived = await client.query(`
    SELECT count(*)::int total FROM lesson_blocks b
    JOIN lesson_grammar_points lgp ON lgp.lesson_id=b.lesson_id AND lgp.grammar_point_id=b.grammar_point_id
    WHERE b.kind='grammar_ref'`);
  const grammarBlocks = kindMap.get("grammar_ref") ?? 0;
  check("db: grammar blocks derive from course knowledge links", Number(derived.rows[0].total) === grammarBlocks,
    `${derived.rows[0].total}/${grammarBlocks}`);

  const provenance = await client.query(`SELECT count(*)::int total FROM sources WHERE code='lesson-architecture'`);
  check("db: lesson architecture provenance", Number(provenance.rows[0].total) === 1);
  await client.end();
}

async function httpChecks() {
  const lesson = await json(`/api/lessons/${SAMPLE}`);
  const data = lesson.body?.data;
  check("api: lesson detail 200", lesson.status === 200);
  check("api: sections returned", data?.sections?.length === 6, `${data?.sections?.length ?? 0}`);
  check("api: section order", data?.sections?.map((s) => s.key).join(",") === "concept,grammar,kanji,examples,summary,practice",
    data?.sections?.map((s) => s.key).join(","));
  check("api: blockCount matches blocks", data?.blockCount === data?.sections?.reduce((sum, s) => sum + s.blocks.length, 0));
  check("api: lesson prerequisites", data?.prerequisites?.length >= 1);

  const grammarSection = data?.sections?.find((s) => s.kind === "grammar");
  check("api: grammar refs resolve", grammarSection?.blocks?.every((b) => b.reference?.kind === "grammar" && b.reference.href.startsWith("/grammar/")));
  const kanjiSection = data?.sections?.find((s) => s.kind === "kanji");
  check("api: kanji + vocabulary refs resolve", kanjiSection?.blocks?.some((b) => b.reference?.kind === "kanji") && kanjiSection?.blocks?.some((b) => b.reference?.kind === "vocabulary"));
  const examples = data?.sections?.find((s) => s.kind === "examples");
  check("api: sentence refs resolve to canonical routes", examples?.blocks?.every((b) => b.reference?.kind === "sentence" && /^\/sentences\/\d+$/.test(b.reference.href)));
  const concept = data?.sections?.find((s) => s.kind === "concept");
  check("api: concept prose present", concept?.blocks?.some((b) => b.kind === "text" && b.body));
  check("api: objectives as blocks", concept?.blocks?.some((b) => b.kind === "objective"));
  const summary = data?.sections?.find((s) => s.kind === "summary");
  check("api: checkpoint block", summary?.blocks?.some((b) => b.kind === "checkpoint"));

  // Every reference must open a real page.
  const refs = data.sections.flatMap((s) => s.blocks.filter((b) => b.reference)).slice(0, 8);
  let opened = 0;
  for (const block of refs) {
    const page = await html(block.reference.href);
    if (page.status === 200) opened += 1;
  }
  check("journey: sampled reference routes open", opened === refs.length, `${opened}/${refs.length}`);

  const page = await html(`/lessons/${SAMPLE}`);
  check("ui: lesson page 200", page.status === 200);
  check("ui: sections rendered", page.text.includes('data-testid="lesson-sections"'));
  check("ui: section navigation", page.text.includes('data-testid="lesson-outline"'));
  check("ui: prerequisites rendered", page.text.includes('data-testid="lesson-prerequisites"'));
  check("ui: grammar link rendered", page.text.includes("/grammar/tara"));
  check("ui: sentence link rendered", /\/sentences\/\d+/.test(page.text));
  check("ui: checkpoint rendered", page.text.includes("Check yourself"));

  const first = await json("/api/lessons/n5-sentence-order");
  check("api: first lesson has no prerequisite", (first.body?.data?.prerequisites ?? []).length === 0);
  const course = await json("/api/courses/jlpt-n4-grammar-path");
  check("regression: course outline intact", course.body?.data?.modules?.length === 2);
}

async function main() {
  console.log(`# Lesson architecture gate — phase 09.2 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else console.log("SKIP  API/UI checks (no BASE_URL provided)");
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
