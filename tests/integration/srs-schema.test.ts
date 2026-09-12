/**
 * Integration — the SRS schema, and the create → review → reschedule cycle.
 *
 * This is the Phase 03.3 deployment gate.
 *
 * Scope note: the FSRS algorithm itself lands in Phase 05 per the dependency
 * gates. These tests supply scheduler-shaped values directly so the SCHEMA's
 * support for the cycle is proven now, without standing up a second scheduler
 * that would later have to be reconciled with the canonical one
 * (ARCHITECTURE_FREEZE §9: exactly one scheduler).
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

/** A learner, a knowledge item to study, and a deck to file it in. */
async function seed(client: Client, suffix = "1") {
  const userId = `srs_user_${suffix}`;
  await client.query(
    `insert into identity_users (id, email, display_name)
     values ($1, $2, 'SRS Learner')`,
    [userId, `${userId}-${Date.now()}@test.invalid`],
  );
  await client.query(
    `insert into knowledge_sources
       (id, name, license, attribution, version, status, license_verified)
     values ('srs_src', 'Test', 'CC-BY-SA-4.0', 'x', '1', 'active', true)
     on conflict (id) do nothing`,
  );
  await client.query(
    `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
     values ('srs_de1', 'srs_src', 'w1', '食べる', 'たべる')
     on conflict (id) do nothing`,
  );
  await client.query(
    `insert into srs_decks (id, user_id, name, is_default)
     values ('srs_deck1', $1, 'Default', true)`,
    [userId],
  );
  return userId;
}

/** Create a card together with its schedule, as the service will. */
async function createCard(client: Client, userId: string) {
  await client.query(
    `insert into srs_cards
       (id, user_id, deck_id, target_kind, direction, dictionary_entry_id)
     values ('srs_card1', $1, 'srs_deck1', 'dictionary_entry', 'recognition', 'srs_de1')`,
    [userId],
  );
  await client.query(
    `insert into srs_schedule (id, card_id, user_id, state, due)
     values ('srs_sched1', 'srs_card1', $1, 'new', now())`,
    [userId],
  );
}

// ═════════════════════════════════════════════
// GATE: create → review → reschedule
// ═════════════════════════════════════════════

test("gate: a card is created in the new state and is immediately due", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    const row = await client.query(
      `select s.state, s.reps, s.lapses, s.interval_days, s.stability,
              s.last_reviewed_at, s.due <= now() as is_due
         from srs_schedule s where s.card_id = 'srs_card1'`,
    );
    const schedule = row.rows[0];
    assert.equal(schedule.state, "new");
    assert.equal(Number(schedule.reps), 0);
    assert.equal(Number(schedule.lapses), 0);
    assert.equal(schedule.stability, null);
    assert.equal(schedule.last_reviewed_at, null);
    assert.equal(schedule.is_due, true, "a new card should be available at once");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("gate: reviewing a card logs the review and reschedules it", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    // Values a scheduler would produce for a "good" grade on a new card.
    await client.query(
      `insert into srs_reviews
         (id, card_id, user_id, rating, state_before, state_after,
          stability_before, stability_after, difficulty_before, difficulty_after,
          interval_before, interval_after, elapsed_days, duration_ms, scheduled_for)
       values ('srs_rev1', 'srs_card1', $1, 'good', 'new', 'learning',
               null, 3.17, null, 5.2, 0, 1, 0, 4200, now() + interval '1 day')`,
      [userId],
    );
    await client.query(
      `update srs_schedule
          set state = 'learning', stability = 3.17, difficulty = 5.2,
              interval_days = 1, reps = reps + 1,
              last_reviewed_at = now(), due = now() + interval '1 day',
              updated_at = now()
        where card_id = 'srs_card1'`,
    );

    const schedule = (
      await client.query(
        `select state, reps, interval_days, stability, difficulty,
                due > now() as is_future, last_reviewed_at is not null as reviewed
           from srs_schedule where card_id = 'srs_card1'`,
      )
    ).rows[0];

    assert.equal(schedule.state, "learning", "state should advance from new");
    assert.equal(Number(schedule.reps), 1);
    assert.equal(Number(schedule.interval_days), 1);
    assert.equal(Number(schedule.stability), 3.17);
    assert.equal(schedule.reviewed, true);
    // Rescheduled into the future: the card leaves the due queue.
    assert.equal(schedule.is_future, true, "card should no longer be due");

    const review = (
      await client.query(
        `select rating, state_before, state_after, interval_after
           from srs_reviews where card_id = 'srs_card1'`,
      )
    ).rows[0];
    assert.equal(review.rating, "good");
    assert.equal(review.state_before, "new");
    assert.equal(review.state_after, "learning");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("gate: successive reviews grow the interval and accumulate history", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    // Three "good" grades: intervals lengthen as stability rises.
    const steps = [
      { from: "new", to: "learning", stability: 3.17, interval: 1 },
      { from: "learning", to: "review", stability: 8.4, interval: 4 },
      { from: "review", to: "review", stability: 21.9, interval: 11 },
    ];

    let index = 0;
    for (const step of steps) {
      index += 1;
      await client.query(
        `insert into srs_reviews
           (id, card_id, user_id, rating, state_before, state_after,
            stability_after, difficulty_after, interval_after, scheduled_for)
         values ($1, 'srs_card1', $2, 'good', $3, $4, $5, 5.2, $6,
                 now() + make_interval(days => $6))`,
        [`srs_rev${index}`, userId, step.from, step.to, step.stability, step.interval],
      );
      await client.query(
        `update srs_schedule
            set state = $1, stability = $2, difficulty = 5.2, interval_days = $3,
                reps = reps + 1, last_reviewed_at = now(),
                due = now() + make_interval(days => $3)
          where card_id = 'srs_card1'`,
        [step.to, step.stability, step.interval],
      );
    }

    const schedule = (
      await client.query(
        `select state, reps, interval_days, stability
           from srs_schedule where card_id = 'srs_card1'`,
      )
    ).rows[0];
    assert.equal(schedule.state, "review");
    assert.equal(Number(schedule.reps), 3);
    assert.equal(Number(schedule.interval_days), 11);

    // The full history is retained, which is what FSRS optimisation replays.
    const history = await client.query(
      `select interval_after from srs_reviews
        where card_id = 'srs_card1' order by reviewed_at, id`,
    );
    assert.equal(history.rows.length, 3);
    assert.deepEqual(
      history.rows.map((row) => Number(row.interval_after)),
      [1, 4, 11],
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("gate: forgetting a card records a lapse and shortens the interval", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    // Establish a mature card.
    await client.query(
      `update srs_schedule
          set state = 'review', stability = 21.9, difficulty = 5.2,
              interval_days = 11, reps = 3, last_reviewed_at = now() - interval '11 days',
              due = now()
        where card_id = 'srs_card1'`,
    );

    // "again" — the learner forgot it.
    await client.query(
      `insert into srs_reviews
         (id, card_id, user_id, rating, state_before, state_after,
          stability_before, stability_after, difficulty_before, difficulty_after,
          interval_before, interval_after, elapsed_days, scheduled_for)
       values ('srs_rev1', 'srs_card1', $1, 'again', 'review', 'relearning',
               21.9, 4.2, 5.2, 6.4, 11, 1, 11, now() + interval '10 minutes')`,
      [userId],
    );
    await client.query(
      `update srs_schedule
          set state = 'relearning', stability = 4.2, difficulty = 6.4,
              interval_days = 1, reps = reps + 1, lapses = lapses + 1,
              last_reviewed_at = now(), due = now() + interval '10 minutes'
        where card_id = 'srs_card1'`,
    );

    const schedule = (
      await client.query(
        `select state, reps, lapses, interval_days, stability, difficulty
           from srs_schedule where card_id = 'srs_card1'`,
      )
    ).rows[0];
    assert.equal(schedule.state, "relearning");
    assert.equal(Number(schedule.lapses), 1);
    assert.equal(Number(schedule.interval_days), 1, "interval should collapse");
    // Stability falls and difficulty rises after a lapse.
    assert.ok(Number(schedule.stability) < 21.9);
    assert.ok(Number(schedule.difficulty) > 5.2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("gate: the due queue returns only cards that are actually due", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await client.query(
      `insert into dictionary_entries (id, source_id, source_ref, headword, reading)
       values ('de_b', 'srs_src', 'w2', '飲む', 'のむ'),
              ('de_c', 'srs_src', 'w3', '見る', 'みる')`,
    );
    await client.query(
      `insert into srs_cards (id, user_id, deck_id, target_kind, dictionary_entry_id)
       values ('card_due', $1, 'srs_deck1', 'dictionary_entry', 'srs_de1'),
              ('card_future', $1, 'srs_deck1', 'dictionary_entry', 'de_b'),
              ('card_susp', $1, 'srs_deck1', 'dictionary_entry', 'de_c')`,
      [userId],
    );
    await client.query(
      `insert into srs_schedule
         (id, card_id, user_id, state, due, suspended, reps, last_reviewed_at,
          stability, difficulty)
       values ('s_due', 'card_due', $1, 'review', now() - interval '1 hour', false, 2, now(), 5, 5),
              ('s_future', 'card_future', $1, 'review', now() + interval '3 days', false, 2, now(), 5, 5),
              ('s_susp', 'card_susp', $1, 'review', now() - interval '1 day', true, 2, now(), 5, 5)`,
      [userId],
    );

    // The hot path, served by the partial index that excludes suspended rows.
    const due = await client.query(
      `select card_id from srs_schedule
        where user_id = $1 and due <= now() and suspended = false
        order by due`,
      [userId],
    );
    assert.deepEqual(
      due.rows.map((row) => row.card_id),
      ["card_due"],
      "only the past-due, unsuspended card should surface",
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

// ═════════════════════════════════════════════
// Integrity
// ═════════════════════════════════════════════

test("the review log cannot be rewritten", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);
    await client.query(
      `insert into srs_reviews
         (id, card_id, user_id, rating, state_before, state_after, scheduled_for)
       values ('srs_rev1', 'srs_card1', $1, 'good', 'new', 'learning', now())`,
      [userId],
    );

    // Editing history would silently corrupt FSRS parameter optimisation,
    // so the database refuses it outright.
    await client.query("savepoint before_update");
    await assert.rejects(
      () => client.query(`update srs_reviews set rating = 'easy' where id = 'srs_rev1'`),
      /append-only/i,
    );
    await client.query("rollback to savepoint before_update");

    const unchanged = await client.query(
      `select rating from srs_reviews where id = 'srs_rev1'`,
    );
    assert.equal(unchanged.rows[0].rating, "good");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a card cannot be filed into another learner's deck", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const alice = await seed(client, "alice");
    await client.query(
      `insert into identity_users (id, email, display_name)
       values ('srs_bob', $1, 'Bob')`,
      [`bob-${Date.now()}@test.invalid`],
    );

    // Bob tries to put a card in Alice's deck. The composite foreign key on
    // (deck_id, user_id) makes this impossible rather than merely unlikely.
    await assert.rejects(() =>
      client.query(
        `insert into srs_cards (id, user_id, deck_id, target_kind, dictionary_entry_id)
         values ('bad_card', 'srs_bob', 'srs_deck1', 'dictionary_entry', 'srs_de1')`,
      ),
    );
    assert.ok(alice);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a learner cannot hold two identical cards", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    await client.query("savepoint before_dupe");
    await assert.rejects(() =>
      client.query(
        `insert into srs_cards
           (id, user_id, deck_id, target_kind, direction, dictionary_entry_id)
         values ('dupe', $1, 'srs_deck1', 'dictionary_entry', 'recognition', 'srs_de1')`,
        [userId],
      ),
    );
    await client.query("rollback to savepoint before_dupe");

    // A different direction is a genuinely different card, so it is allowed.
    await client.query(
      `insert into srs_cards
         (id, user_id, deck_id, target_kind, direction, dictionary_entry_id)
       values ('recall', $1, 'srs_deck1', 'dictionary_entry', 'recall', 'srs_de1')`,
      [userId],
    );
    const count = await client.query(
      `select count(*)::int as n from srs_cards where user_id = $1`,
      [userId],
    );
    assert.equal(Number(count.rows[0].n), 2);
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("an incoherent schedule state is rejected", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    // 'new' must mean genuinely unreviewed.
    await client.query("savepoint sp1");
    await assert.rejects(() =>
      client.query(`update srs_schedule set reps = 5 where card_id = 'srs_card1'`),
    );
    await client.query("rollback to savepoint sp1");

    // A reviewed card cannot claim to be new.
    await client.query("savepoint sp2");
    await assert.rejects(() =>
      client.query(
        `update srs_schedule set last_reviewed_at = now() where card_id = 'srs_card1'`,
      ),
    );
    await client.query("rollback to savepoint sp2");

    // Cannot have lapsed more often than reviewed.
    await client.query("savepoint sp3");
    await assert.rejects(() =>
      client.query(
        `update srs_schedule set state = 'review', reps = 2, lapses = 5,
                stability = 5, difficulty = 5, last_reviewed_at = now()
          where card_id = 'srs_card1'`,
      ),
    );
    await client.query("rollback to savepoint sp3");

    // A review-state card must carry the memory parameters that put it there.
    await client.query("savepoint sp4");
    await assert.rejects(() =>
      client.query(
        `update srs_schedule set state = 'review', reps = 2, last_reviewed_at = now()
          where card_id = 'srs_card1'`,
      ),
    );
    await client.query("rollback to savepoint sp4");
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("difficulty and stability are bounded", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);

    for (const [column, value] of [
      ["difficulty", 0],
      ["difficulty", 11],
      ["stability", 0],
      ["stability", -3],
    ] as const) {
      await client.query("savepoint sp");
      await assert.rejects(
        () =>
          client.query(`update srs_schedule set ${column} = $1 where card_id = 'srs_card1'`, [
            value,
          ]),
        `${column} = ${value} should be rejected`,
      );
      await client.query("rollback to savepoint sp");
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a learner has at most one default deck", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await client.query("savepoint before_second_default");
    await assert.rejects(() =>
      client.query(
        `insert into srs_decks (id, user_id, name, is_default)
         values ('deck2', $1, 'Second', true)`,
        [userId],
      ),
    );
    await client.query("rollback to savepoint before_second_default");
    // A non-default second deck is fine.
    await client.query(
      `insert into srs_decks (id, user_id, name) values ('deck2', $1, 'Second')`,
      [userId],
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("a card must reference exactly one knowledge item", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await assert.rejects(() =>
      client.query(
        `insert into srs_cards (id, user_id, deck_id, target_kind)
         values ('empty', $1, 'srs_deck1', 'dictionary_entry')`,
        [userId],
      ),
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});

test("deleting a learner removes their decks, cards, schedules and reviews", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    const userId = await seed(client);
    await createCard(client, userId);
    await client.query(
      `insert into srs_reviews
         (id, card_id, user_id, rating, state_before, state_after, scheduled_for)
       values ('srs_rev1', 'srs_card1', $1, 'good', 'new', 'learning', now())`,
      [userId],
    );

    await client.query(`delete from identity_users where id = $1`, [userId]);

    const counts = await client.query(
      `select (select count(*) from srs_decks)    as decks,
              (select count(*) from srs_cards)    as cards,
              (select count(*) from srs_schedule) as schedules,
              (select count(*) from srs_reviews)  as reviews`,
    );
    for (const [key, value] of Object.entries(counts.rows[0])) {
      assert.equal(Number(value), 0, `${key} were not removed`);
    }
  } finally {
    await client.query("rollback");
    client.release();
  }
});
