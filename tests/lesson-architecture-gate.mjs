#!/usr/bin/env node
/** Phase 09.2 gate — lesson internal architecture. */
import pg from "pg";

const BASE_URL = process.argv[2] || process.env.BASE_URL || null;
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
    (SELECT count(*) FROM lesson_sections) sections,
    (SELECT count(DISTINCT lesson_id) FROM lesson_sections) lessons_with_sections,
    (SELECT count(*) FROM lesson_objectives) objectives,
    (SELECT count(DISTINCT lesson_id) FROM lesson_objectives) lessons_with_objectives,
    (SELECT count(*) FROM lesson_vocabulary) vocabulary,
    (SELECT count(DISTINCT lesson_id) FROM lesson_vocabulary) lessons_with_vocabulary,
    (SELECT count(*) FROM lesson_sentences) sentences,
    (SELECT count(DISTINCT lesson_id) FROM lesson_sentences) lessons_with_sentences,
    (SELECT count(*) FROM lessons WHERE published) lessons`);
  const c = counts.rows[0];
  check("db: authored sections", Number(c.sections) >= 40, `${c.sections}`);
  check("db: every lesson has sections", c.lessons === c.lessons_with_sections, `${c.lessons_with_sections}/${c.lessons}`);
  check("db: objectives normalised", Number(c.objectives) >= 40, `${c.objectives}`);
  check("db: every lesson has objectives", c.lessons === c.lessons_with_objectives, `${c.lessons_with_objectives}/${c.lessons}`);
  check("db: derived vocabulary links", Number(c.vocabulary) >= 100, `${c.vocabulary}`);
  check("db: derived sentence links", Number(c.sentences) >= 40, `${c.sentences}`);

  const ordering = await client.query(`
    SELECT lesson_id, count(*)::int total, count(DISTINCT position)::int unique_positions,
           min(position) min_pos, max(position) max_pos
    FROM lesson_sections GROUP BY lesson_id`);
  check(
    "db: section positions are dense and unique",
    ordering.rows.every((row) => row.total === row.unique_positions && Number(row.min_pos) === 0),
    JSON.stringify(ordering.rows.filter((row) => row.total !== row.unique_positions)),
  );
  const objectiveOrdering = await client.query(`
    SELECT lesson_id, count(*)::int total, count(DISTINCT position)::int unique_positions
    FROM lesson_objectives GROUP BY lesson_id`);
  check(
    "db: objective positions are unique",
    objectiveOrdering.rows.every((row) => row.total === row.unique_positions),
  );

  const integrity = await client.query(`SELECT
    (SELECT count(*) FROM lesson_sections s LEFT JOIN lessons l ON l.id=s.lesson_id WHERE l.id IS NULL) orphan_section,
    (SELECT count(*) FROM lesson_objectives o LEFT JOIN lessons l ON l.id=o.lesson_id WHERE l.id IS NULL) orphan_objective,
    (SELECT count(*) FROM lesson_vocabulary v LEFT JOIN vocabulary x ON x.id=v.vocabulary_id WHERE x.id IS NULL) orphan_vocabulary,
    (SELECT count(*) FROM lesson_sentences s LEFT JOIN sentences x ON x.id=s.sentence_id WHERE x.id IS NULL) orphan_sentence,
    (SELECT count(*) FROM lesson_sentences s LEFT JOIN lessons l ON l.id=s.lesson_id WHERE l.id IS NULL) orphan_sentence_lesson,
    (SELECT count(*) FROM lesson_sections WHERE kind NOT IN ('explain','example','practice','note')) bad_kind`);
  check("db: no dangling lesson architecture edges", Object.values(integrity.rows[0]).every((v) => Number(v) === 0), JSON.stringify(integrity.rows[0]));

  // Derived links must reference canonical knowledge, never copy it.
  const derived = await client.query(`
    SELECT count(*)::int total FROM lesson_sentences ls
    JOIN sentence_grammar_points sgp ON sgp.sentence_id = ls.sentence_id
    JOIN lesson_grammar_points lgp ON lgp.lesson_id = ls.lesson_id AND lgp.grammar_point_id = sgp.grammar_point_id`);
  check("db: lesson sentences trace to taught grammar", Number(derived.rows[0].total) > 20, `${derived.rows[0].total}`);

  const derivedVocab = await client.query(`
    SELECT count(*)::int total FROM lesson_vocabulary lv
    JOIN kanji_vocabulary kv ON kv.vocabulary_id = lv.vocabulary_id
    JOIN lesson_kanji lk ON lk.lesson_id = lv.lesson_id AND lk.kanji_id = kv.kanji_id`);
  check("db: lesson vocabulary traces to taught kanji", Number(derivedVocab.rows[0].total) > 20, `${derivedVocab.rows[0].total}`);

  const source = await client.query(`SELECT count(*)::int total FROM sources WHERE code='lesson-architecture'`);
  check("db: lesson architecture provenance", Number(source.rows[0].total) === 1);
  await client.end();
}

async function httpChecks() {
  const lesson = await json("/api/lessons/n4-conditionals");
  const data = lesson.body?.data;
  check("api: lesson detail 200", lesson.status === 200);
  check("api: sections ordered", (data?.sections ?? []).length === 3 &&
    (data?.sections ?? []).every((section, index) => section.position === index), `${data?.sections?.length ?? 0}`);
  check("api: sections carry headings and examples", (data?.sections ?? []).every((section) => section.heading && Array.isArray(section.examples)));
  check("api: section kinds valid", (data?.sections ?? []).every((section) => ["explain","example","practice","note"].includes(section.kind)));
  check("api: objectives normalised", (data?.objectivesDetail ?? []).length >= 3, `${data?.objectivesDetail?.length ?? 0}`);
  check("api: objectives match compatibility view",
    (data?.objectivesDetail ?? []).map((item) => item.objective).join("|") === (data?.objectives ?? []).join("|"));
  check("api: derived vocabulary present", (data?.knowledge?.vocabulary ?? []).length > 0, `${data?.knowledge?.vocabulary?.length ?? 0}`);
  check("api: derived sentences present", (data?.knowledge?.sentences ?? []).length > 0, `${data?.knowledge?.sentences?.length ?? 0}`);
  check("api: structure summary consistent",
    data?.structure?.sectionCount === (data?.sections ?? []).length &&
      data?.structure?.grammarCount === (data?.knowledge?.grammar ?? []).length);
  const missing = await json("/api/lessons/not-a-lesson");
  check("api: missing lesson 404", missing.status === 404);

  const second = await json("/api/lessons/n5-sentence-order");
  check("api: second lesson complete", second.body?.data?.sections?.length === 3 &&
    second.body?.data?.knowledge?.vocabulary?.length > 0);

  const page = await html("/lessons/n4-conditionals");
  check("ui: lesson page 200", page.status === 200);
  check("ui: sections render", page.text.includes('data-testid="lesson-sections"'));
  check("ui: section headings render", page.text.includes("たら treats the condition as done"));
  check("ui: section kind chips render", page.text.includes(">explain<") || page.text.includes("explain"));
  check("ui: japanese section examples render", page.text.includes("雨が降ったら、行きません。"));
  check("ui: vocabulary section renders", page.text.includes('data-testid="lesson-content-links"'));
  check("ui: vocabulary links route to dictionary", page.text.includes("/dictionary?q="));
  check("ui: sentence links route to sentence detail", /\/sentences\/\d+/.test(page.text));
  check("ui: grammar links still resolve", page.text.includes("/grammar/tara"));
  check("ui: kanji links still resolve", page.text.includes("/kanji/"));

  const search = await json(`/api/search?q=${encodeURIComponent("たら treats the condition as done")}&mode=full_text&types=lesson`);
  check("search: authored section text is searchable",
    (search.body?.data?.hits ?? []).some((hit) => hit.externalKey === "n4-conditionals"),
    (search.body?.data?.hits ?? []).map((hit) => hit.externalKey).join(","));

  const byVocab = await json(`/api/search?q=${encodeURIComponent("Japanese Foundations")}&mode=auto&types=lesson&limit=10`);
  check("search: lesson domain still returns results", (byVocab.body?.data?.hits ?? []).length > 0);
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
