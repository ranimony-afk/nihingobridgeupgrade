/**
 * Integration — the learning schema against the real database.
 *
 * The deployment gate for Phase 03.2. Every test runs inside a transaction
 * that is rolled back, so the suite leaves no residue and can run repeatedly.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { openTestDb, type TestDb } from "../helpers/db.ts";

let db: TestDb;

before(() => {
  db = openTestDb();
});

after(async () => {
  await db.close();
});

type Client = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const LEARNING_TABLES = [
  "courses",
  "units",
  "lessons",
  "lesson_items",
  "exercises",
  "questions",
  "answers",
  "attempts",
  "progress",
];

/** Build a course → unit → lesson → exercise → question → answers chain. */
async function seedCurriculum(client: Client) {
  await client.query(
    `insert into courses (id, slug, title, jlpt_level, status)
     values ('c1', 'n5-complete', 'JLPT N5 Complete', 5, 'published')`,
  );
  await client.query(
    `insert into units (id, course_id, slug, title, position, status)
     values ('u1', 'c1', 'greetings', 'Greetings', 0, 'published')`,
  );
  await client.query(
    `insert into lessons (id, unit_id, slug, title, kind, position, status)
     values ('l1', 'u1', 'basic-greetings', 'Basic Greetings', 'vocabulary', 0, 'published')`,
  );
  await client.query(
    `insert into exercises (id, lesson_id, slug, title, kind, position, status)
     values ('x1', 'l1', 'greetings-quiz', 'Greetings Quiz', 'quiz', 0, 'published')`,
  );
  await client.query(
    `insert into questions (id, exercise_id, type, position, prompt, points)
     values ('q1', 'x1', 'multiple_choice', 0, 'How do you say "good morning"?', 2)`,
  );
  await client.query(
    `insert into answers (id, question_id, position, text, normalized, is_correct)
     values ('a1', 'q1', 0, 'おはようございます', 'おはようございます', true),
            ('a2', 'q1', 1, 'こんばんは', 'こんばんは', false)`,
  );
}

/** A learner to attribute attempts and progress to. */
async function seedUser(client: Client, id = "usr_test") {
  await client.query(
    `insert into identity_users (id, email, display_name)
     values ($1, $2, 'Test Learner')`,
    [id, `${id}-${Date.now()}@test.invalid`],
  );
  return id;
}

// ─────────────────────────────────────────────
// Structure
// ─────────────────────────────────────────────

test("all nine learning tables exist", async () => {
  const result = await db.pool.query(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows.map((row: { tablename: string }) => row.tablename);
  for (const table of LEARNING_TABLES) {
    assert.ok(tables.includes(table), `missing table: ${table}`);
  }
  assert.equal(LEARNING_TABLES.length, 9);
});

test("the full curriculum chain can be built and traversed", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);

    const row = await client.query(
      `select c.title as course, u.title as unit, l.title as lesson,
              x.title as exercise, q.prompt as question, count(a.id)::int as answers
         from courses c
         join units u      on u.course_id = c.id
         join lessons l    on l.unit_id = u.id
         join exercises x  on x.lesson_id = l.id
         join questions q  on q.exercise_id = x.id
         join answers a    on a.question_id = q.id
        where c.id = 'c1'
        group by c.title, u.title, l.title, x.title, q.prompt`,
    );
    assert.equal(row.rows[0].course, "JLPT N5 Complete");
    assert.equal(row.rows[0].lesson, "Basic Greetings");
    assert.equal(Number(row.rows[0].answers), 2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("deleting a course cascades through the whole curriculum", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(`delete from courses where id = 'c1'`);

    const counts = await client.query(
      `select (select count(*) from units)     as units,
              (select count(*) from lessons)   as lessons,
              (select count(*) from exercises) as exercises,
              (select count(*) from questions) as questions,
              (select count(*) from answers)   as answers`,
    );
    for (const [key, value] of Object.entries(counts.rows[0])) {
      assert.equal(Number(value), 0, `${key} were not removed`);
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ─────────────────────────────────────────────
// Ordering integrity
// ─────────────────────────────────────────────

test("two units cannot occupy the same position in a course", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    // Ambiguous ordering would make the curriculum render nondeterministically.
    await assert.rejects(() =>
      client.query(
        `insert into units (id, course_id, slug, title, position)
         values ('u2', 'c1', 'other', 'Other', 0)`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("the same position is allowed in different courses", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(
      `insert into courses (id, slug, title) values ('c2', 'n4', 'N4')`,
    );
    await client.query(
      `insert into units (id, course_id, slug, title, position)
       values ('u2', 'c2', 'greetings', 'Greetings', 0)`,
    );
    const count = await client.query(`select count(*)::int as n from units`);
    assert.equal(Number(count.rows[0].n), 2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ─────────────────────────────────────────────
// Lesson items and the knowledge join
// ─────────────────────────────────────────────

test("a lesson item links a lesson to real knowledge", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(
      `insert into knowledge_sources
         (id, name, license, attribution, version, status, license_verified)
       values ('src', 'Test', 'CC-BY-SA-4.0', 'x', '1', 'active', true)`,
    );
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('de1', 'src', '1', 'おはよう', 'おはよう')`,
    );
    await client.query(
      `insert into lesson_items (id, lesson_id, kind, position, dictionary_entry_id)
       values ('li1', 'l1', 'dictionary_entry', 0, 'de1')`,
    );

    // The lesson teaches actual dictionary content rather than duplicating it.
    const joined = await client.query(
      `select d.headword from lesson_items li
         join dictionary_entries d on d.id = li.dictionary_entry_id
        where li.lesson_id = 'l1'`,
    );
    assert.equal(joined.rows[0].headword, "おはよう");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a lesson item must reference exactly one thing", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    // Claims to be a dictionary item but references nothing.
    await assert.rejects(() =>
      client.query(
        `insert into lesson_items (id, lesson_id, kind, position)
         values ('li1', 'l1', 'dictionary_entry', 0)`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a lesson item's reference must match the kind it declares", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(
      `insert into knowledge_sources
         (id, name, license, attribution, version, status, license_verified)
       values ('src', 'Test', 'CC-BY-SA-4.0', 'x', '1', 'active', true)`,
    );
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('de1', 'src', '1', 'x', 'x')`,
    );
    // Declares "kanji_entry" but points at a dictionary entry. Without this
    // constraint every reader would need defensive code.
    await assert.rejects(() =>
      client.query(
        `insert into lesson_items (id, lesson_id, kind, position, dictionary_entry_id)
         values ('li1', 'l1', 'kanji_entry', 0, 'de1')`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a note item carries text and references nothing", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(
      `insert into lesson_items (id, lesson_id, kind, position, note)
       values ('li1', 'l1', 'note', 0, 'Greetings change with the time of day.')`,
    );
    const row = await client.query(`select note from lesson_items where id = 'li1'`);
    assert.match(String(row.rows[0].note), /time of day/);

    // A note with no text would be an empty slot in the lesson.
    await assert.rejects(() =>
      client.query(
        `insert into lesson_items (id, lesson_id, kind, position)
         values ('li2', 'l1', 'note', 1)`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ─────────────────────────────────────────────
// Attempts
// ─────────────────────────────────────────────

test("an attempt records a learner's answer to a question", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);

    await client.query(
      `insert into attempts
         (id, user_id, question_id, exercise_id, submission_id,
          selected_answer_id, is_correct, points_awarded, duration_ms)
       values ('at1', $1, 'q1', 'x1', 'sub1', 'a1', true, 2, 4200)`,
      [userId],
    );

    const row = await client.query(
      `select a.is_correct, a.points_awarded, ans.text as chosen
         from attempts a join answers ans on ans.id = a.selected_answer_id
        where a.id = 'at1'`,
    );
    assert.equal(row.rows[0].is_correct, true);
    assert.equal(row.rows[0].chosen, "おはようございます");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an attempt must belong to a real user", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    // RISK-0013: the inherited schema allowed learner ids that referenced
    // nothing. This must now be impossible.
    await assert.rejects(() =>
      client.query(
        `insert into attempts
           (id, user_id, question_id, exercise_id, submission_id, response_text, is_correct)
         values ('at1', 'ghost_user', 'q1', 'x1', 'sub1', 'x', false)`,
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an attempt must contain a response", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await assert.rejects(() =>
      client.query(
        `insert into attempts
           (id, user_id, question_id, exercise_id, submission_id, is_correct)
         values ('at1', $1, 'q1', 'x1', 'sub1', false)`,
        [userId],
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a question with recorded attempts cannot be deleted", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into attempts
         (id, user_id, question_id, exercise_id, submission_id, selected_answer_id, is_correct)
       values ('at1', $1, 'q1', 'x1', 'sub1', 'a1', true)`,
      [userId],
    );

    // RESTRICT, not CASCADE: deleting content must not silently erase the
    // history of learners who answered it. Archive the exercise instead.
    await assert.rejects(() => client.query(`delete from questions where id = 'q1'`));
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("deleting a learner removes their attempts and progress", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into attempts
         (id, user_id, question_id, exercise_id, submission_id, selected_answer_id, is_correct)
       values ('at1', $1, 'q1', 'x1', 'sub1', 'a1', true)`,
      [userId],
    );
    await client.query(
      `insert into progress (id, user_id, lesson_id, course_id, status)
       values ('p1', $1, 'l1', 'c1', 'in_progress')`,
      [userId],
    );

    await client.query(`delete from identity_users where id = $1`, [userId]);
    const counts = await client.query(
      `select (select count(*) from attempts) as attempts,
              (select count(*) from progress) as progress`,
    );
    assert.equal(Number(counts.rows[0].attempts), 0);
    assert.equal(Number(counts.rows[0].progress), 0);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an exercise score is an aggregate over per-question attempts", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into questions (id, exercise_id, type, position, prompt, points)
       values ('q2', 'x1', 'type_answer', 1, 'Write "good evening"', 2)`,
    );
    await client.query(
      `insert into attempts
         (id, user_id, question_id, exercise_id, submission_id, selected_answer_id,
          response_text, is_correct, points_awarded)
       values ('at1', $1, 'q1', 'x1', 'sub1', 'a1', null, true, 2),
              ('at2', $1, 'q2', 'x1', 'sub1', null, 'こんばんは', false, 0)`,
      [userId],
    );

    // Storing attempts per question means the sitting score is derived, so it
    // cannot disagree with the answers it is built from.
    const score = await client.query(
      `select sum(points_awarded)::int as earned,
              count(*) filter (where is_correct)::int as correct,
              count(*)::int as total
         from attempts where submission_id = 'sub1'`,
    );
    assert.equal(Number(score.rows[0].earned), 2);
    assert.equal(Number(score.rows[0].correct), 1);
    assert.equal(Number(score.rows[0].total), 2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("repeated attempts at one question are all retained", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into attempts
         (id, user_id, question_id, exercise_id, submission_id, selected_answer_id,
          attempt_number, is_correct)
       values ('at1', $1, 'q1', 'x1', 'sub1', 'a2', 1, false),
              ('at2', $1, 'q1', 'x1', 'sub1', 'a1', 2, true)`,
      [userId],
    );

    // SRS needs the whole history, not only the final answer.
    const history = await client.query(
      `select attempt_number, is_correct from attempts
        where user_id = $1 and question_id = 'q1' order by attempt_number`,
      [userId],
    );
    assert.equal(history.rows.length, 2);
    assert.equal(history.rows[0].is_correct, false);
    assert.equal(history.rows[1].is_correct, true);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ─────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────

test("a learner has at most one progress row per lesson", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into progress (id, user_id, lesson_id, course_id)
       values ('p1', $1, 'l1', 'c1')`,
      [userId],
    );
    await assert.rejects(() =>
      client.query(
        `insert into progress (id, user_id, lesson_id, course_id)
         values ('p2', $1, 'l1', 'c1')`,
        [userId],
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a lesson cannot be completed without a completion time and 100 percent", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);

    // "completed" but half done, with no timestamp, is a state the UI would
    // render incoherently. The database refuses it.
    //
    // A rejected statement aborts the enclosing transaction, so the failure is
    // isolated in a savepoint and the valid insert below still runs.
    await client.query("savepoint before_invalid");
    await assert.rejects(() =>
      client.query(
        `insert into progress (id, user_id, lesson_id, course_id, status, completion_percent)
         values ('p1', $1, 'l1', 'c1', 'completed', 50)`,
        [userId],
      ),
    );
    await client.query("rollback to savepoint before_invalid");

    await client.query(
      `insert into progress
         (id, user_id, lesson_id, course_id, status, completion_percent, completed_at)
       values ('p1', $1, 'l1', 'c1', 'completed', 100, now())`,
      [userId],
    );
    const row = await client.query(`select status from progress where id = 'p1'`);
    assert.equal(row.rows[0].status, "completed");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("completion percentage cannot exceed 100", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await assert.rejects(() =>
      client.query(
        `insert into progress (id, user_id, lesson_id, course_id, completion_percent)
         values ('p1', $1, 'l1', 'c1', 150)`,
        [userId],
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("course progress is derived from lesson progress", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    const userId = await seedUser(client);
    await client.query(
      `insert into lessons (id, unit_id, slug, title, position)
       values ('l2', 'u1', 'numbers', 'Numbers', 1),
              ('l3', 'u1', 'days', 'Days', 2)`,
    );
    await client.query(
      `insert into progress
         (id, user_id, lesson_id, course_id, status, completion_percent, completed_at)
       values ('p1', $1, 'l1', 'c1', 'completed', 100, now()),
              ('p2', $1, 'l2', 'c1', 'in_progress', 40, null),
              ('p3', $1, 'l3', 'c1', 'not_started', 0, null)`,
      [userId],
    );

    // Course progress is never stored, so it cannot drift from the lessons.
    const summary = await client.query(
      `select count(*)::int as lessons,
              count(*) filter (where status = 'completed')::int as completed,
              round(avg(completion_percent))::int as percent
         from progress where user_id = $1 and course_id = 'c1'`,
      [userId],
    );
    assert.equal(Number(summary.rows[0].lessons), 3);
    assert.equal(Number(summary.rows[0].completed), 1);
    assert.equal(Number(summary.rows[0].percent), 47);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ─────────────────────────────────────────────
// Content validity
// ─────────────────────────────────────────────

test("question difficulty and points are bounded", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    for (const [column, value] of [
      ["difficulty", 0],
      ["difficulty", 6],
      ["points", 0],
    ] as const) {
      await assert.rejects(
        () => client.query(`update questions set ${column} = $1 where id = 'q1'`, [value]),
        `${column} = ${value} should be rejected`,
      );
      await client.query("rollback");
      await client.query("begin");
      await seedCurriculum(client);
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a pass threshold outside 0–100 is rejected", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await assert.rejects(() =>
      client.query(`update exercises set pass_threshold = 120 where id = 'x1'`),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("typed answers are graded by an indexed normalised lookup", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await seedCurriculum(client);
    await client.query(
      `insert into questions (id, exercise_id, type, position, prompt)
       values ('q2', 'x1', 'type_answer', 1, 'Write "to eat"')`,
    );
    // Several spellings can be correct, which is why correctness is per row.
    await client.query(
      `insert into answers (id, question_id, position, text, normalized, is_correct)
       values ('a3', 'q2', 0, '食べる', 'たべる', true),
              ('a4', 'q2', 1, 'たべる', 'たべる', true)`,
    );

    const graded = await client.query(
      `select bool_or(is_correct) as accepted from answers
        where question_id = 'q2' and normalized = 'たべる'`,
    );
    assert.equal(graded.rows[0].accepted, true);
  } finally {
    await client.query("rollback");
    client.release();
  }
});
