#!/usr/bin/env node
/** Phase 09.1 gate — canonical course architecture. */
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
    (SELECT count(*) FROM courses WHERE published) courses,
    (SELECT count(*) FROM course_modules WHERE published) modules,
    (SELECT count(*) FROM lessons WHERE published) lessons,
    (SELECT count(*) FROM lessons WHERE published AND module_id IS NOT NULL) structured_lessons,
    (SELECT count(*) FROM course_prerequisites) prerequisites,
    (SELECT count(*) FROM course_tag_links) tags,
    (SELECT count(*) FROM lesson_grammar_points) grammar_links,
    (SELECT count(*) FROM lesson_kanji) kanji_links`);
  const c = counts.rows[0];
  check("db: published courses", Number(c.courses) === 5, `${c.courses}`);
  check("db: course modules", Number(c.modules) === 10, `${c.modules}`);
  check("db: published lessons", Number(c.lessons) === 20, `${c.lessons}`);
  check("db: every lesson assigned to a module", c.lessons === c.structured_lessons, `${c.structured_lessons}/${c.lessons}`);
  check("db: prerequisite edges", Number(c.prerequisites) === 3, `${c.prerequisites}`);
  check("db: course tag links", Number(c.tags) >= 15, `${c.tags}`);
  check("db: lesson grammar links", Number(c.grammar_links) >= 40, `${c.grammar_links}`);
  check("db: lesson kanji links", Number(c.kanji_links) >= 60, `${c.kanji_links}`);

  const integrity = await client.query(`SELECT
    (SELECT count(*) FROM lessons l JOIN course_modules m ON m.id=l.module_id WHERE l.course_id<>m.course_id) wrong_module,
    (SELECT count(*) FROM course_prerequisites WHERE course_id=prerequisite_course_id) self_prerequisite,
    (SELECT count(*) FROM course_modules m LEFT JOIN courses c ON c.id=m.course_id WHERE c.id IS NULL) orphan_module,
    (SELECT count(*) FROM lesson_grammar_points x LEFT JOIN grammar_points g ON g.id=x.grammar_point_id WHERE g.id IS NULL) orphan_grammar,
    (SELECT count(*) FROM lesson_kanji x LEFT JOIN kanji k ON k.id=x.kanji_id WHERE k.id IS NULL) orphan_kanji`);
  check("db: hierarchy edges valid", Object.values(integrity.rows[0]).every((value) => Number(value) === 0), JSON.stringify(integrity.rows[0]));

  const courseCoverage = await client.query(`
    SELECT c.slug, count(DISTINCT m.id)::int modules, count(DISTINCT l.id)::int lessons
    FROM courses c LEFT JOIN course_modules m ON m.course_id=c.id AND m.published
    LEFT JOIN lessons l ON l.course_id=c.id AND l.published
    WHERE c.published GROUP BY c.id ORDER BY c.position`);
  check("db: every course has modules", courseCoverage.rows.every((row) => row.modules >= 1));
  check("db: every course has lessons", courseCoverage.rows.every((row) => row.lessons >= 1));

  const cycles = await client.query(`
    WITH RECURSIVE walk(course_id, prerequisite_id, path, cycle) AS (
      SELECT course_id, prerequisite_course_id, ARRAY[course_id, prerequisite_course_id], false
      FROM course_prerequisites
      UNION ALL
      SELECT w.course_id, cp.prerequisite_course_id, w.path || cp.prerequisite_course_id,
             cp.prerequisite_course_id = ANY(w.path)
      FROM walk w JOIN course_prerequisites cp ON cp.course_id=w.prerequisite_id
      WHERE NOT w.cycle
    ) SELECT count(*)::int total FROM walk WHERE cycle`);
  check("db: prerequisite graph is acyclic", Number(cycles.rows[0].total) === 0);

  const source = await client.query(`SELECT count(*)::int total FROM sources WHERE code='course-architecture'`);
  check("db: architecture provenance", Number(source.rows[0].total) === 1);
  await client.end();
}

async function httpChecks() {
  const catalog = await json("/api/courses");
  check("api: course catalogue", catalog.status === 200 && catalog.body?.data?.courses?.length === 5);
  const filtered = await json("/api/courses?jlpt=4");
  check("api: JLPT filter", filtered.body?.data?.courses?.every((course) => course.jlptLevel === 4));

  const course = await json("/api/courses/jlpt-n4-grammar-path");
  const data = course.body?.data;
  check("api: course detail 200", course.status === 200);
  check("api: modules nested", data?.modules?.length === 2, `${data?.modules?.length ?? 0}`);
  check("api: lessons nested under modules", data?.modules?.every((module) => module.lessons.length === 2));
  check("api: flat compatibility lessons", data?.lessons?.length === 4);
  check("api: prerequisite exposed", data?.prerequisites?.[0]?.slug === "japanese-foundations-n5");
  check("api: tags exposed", data?.tags?.includes("grammar"));

  const lesson = await json("/api/lessons/n4-conditionals");
  check("api: lesson detail 200", lesson.status === 200);
  check("api: module context", lesson.body?.data?.moduleSlug === "n4-connecting-ideas");
  check("api: linked grammar", lesson.body?.data?.knowledge?.grammar?.length === 3);
  check("api: linked kanji", lesson.body?.data?.knowledge?.kanji?.length >= 2);
  check("api: course route stable", lesson.body?.data?.courseSlug === "jlpt-n4-grammar-path");
  const missing = await json("/api/courses/not-a-course");
  check("api: missing course 404", missing.status === 404);

  const coursesPage = await html("/courses");
  check("ui: courses catalogue", coursesPage.status === 200 && coursesPage.text.includes("Japanese Foundations"));
  const coursePage = await html("/courses/jlpt-n4-grammar-path");
  check("ui: canonical outline", coursePage.status === 200 && coursePage.text.includes('data-testid="course-outline"'));
  check("ui: modules render", coursePage.text.includes("Connecting ideas") && coursePage.text.includes("Action, aspect and modality"));
  check("ui: prerequisite renders", coursePage.text.includes("Before you begin"));
  const lessonPage = await html("/lessons/n4-conditionals");
  check("ui: lesson knowledge section", lessonPage.status === 200 && lessonPage.text.includes('data-testid="lesson-knowledge"'));
  check("ui: grammar links resolve", lessonPage.text.includes("/grammar/tara"));
  check("ui: kanji links resolve", lessonPage.text.includes("/kanji/"));

  const searchCourse = await json("/api/search?q=JLPT%20N4%20Grammar%20Path&mode=exact&types=course");
  check("search: course discoverable", searchCourse.body?.data?.hits?.[0]?.route === "/courses/jlpt-n4-grammar-path");
  const searchLesson = await json("/api/search?q=Conditionals%3A%20%E3%81%9F%E3%82%89%2C%20%E3%81%B0%20and%20%E3%81%AA%E3%82%89&mode=exact&types=lesson");
  check("search: lesson discoverable", searchLesson.body?.data?.hits?.[0]?.route === "/lessons/n4-conditionals");
}

async function main() {
  console.log(`# Course architecture gate — phase 09.1 (${new Date().toISOString()})`);
  await databaseChecks();
  if (BASE_URL) await httpChecks();
  else console.log("SKIP  API/UI checks (no BASE_URL provided)");
  console.log(failures === 0 ? "\nGATE PASSED" : `\nGATE FAILED (${failures} check(s))`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((error) => { console.error(error); process.exit(1); });
