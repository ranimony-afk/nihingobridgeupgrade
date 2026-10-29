import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  kanaEntries as kanaTable,
  kanjiEntries as kanjiTable,
  srsCardTemplates as templatesTable,
  srsCards as cardsTable,
  srsDecks as decksTable,
  srsSystemDecks as systemDecksTable,
} from "@/db/schema";
import { ALL_SEED_QUESTIONS } from "@/services/quiz/seedData";
import type { SchedulerKey } from "@/types/srs";

/**
 * Phase 26F-B — SRS catalogue / learner-state separation.
 *
 * WHY THIS EXISTS (and what it does NOT do)
 * -----------------------------------------
 * The shared defect recorded across Phases 26D–26E is that seeded SRS content
 * and individual learners' rows are indistinguishable: `srs_decks.owner_id`
 * and `srs_cards.user_id` both default to the sentinel `'anonymous-user'`, and
 * the seeded cards are SINGLE SHARED ROWS, so one learner grading a card
 * advances every other learner's schedule.
 *
 * This module builds the storage split that makes a fix possible:
 *
 *   - `srs_system_decks` / `srs_card_templates`  = immutable, shared CONTENT.
 *     No scheduling columns, never graded, never owned by a learner.
 *   - `srs_decks` / `srs_cards`                  = LEARNER-OWNED STATE.
 *     A learner studying a system deck gets their own deck row (linked by
 *     `system_deck_id`) and their own card rows (linked by `template_id`), each
 *     with its own scheduling columns.
 *
 * THIS IS NOT AN AUTHORIZATION FIX. `POST /api/srs/review` still grades any
 * card id it is handed; `GET /api/srs/cards?userId=` still discloses another
 * learner's cards. Legacy shared rows remain shared and gradable. Route
 * authorization and the grading guard on `SrsService.gradeCard`,
 * `SessionService.undo` and `SyncService.push` are a LATER phase.
 *
 * Nothing here is reachable from a route yet: `materializeSystemDeck()` is a
 * service API that a later phase will call with a VERIFIED actor id. It must
 * never be handed a value read from a request body or query string.
 */

/* ------------------------------------------------------------------ *
 * Identity schemes
 * ------------------------------------------------------------------ */

/**
 * Deterministic template id for a legacy seeded card.
 *
 * `ensureSeeded()` created legacy cards with fixed ids (`card-n5-vocab-001`,
 * `card-kana-hira-a`, ...). Deriving the template id from that id gives an
 * auditable 1:1 map from existing content to catalogue content, so a later
 * backfill can prove which legacy row corresponds to which template.
 */
export function templateIdForLegacyCard(legacyCardId: string): string {
  return `tpl-${legacyCardId}`;
}

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

/**
 * Opaque, per-learner deck id.
 *
 * Deterministic in (learner, system deck) so repeated materialization is
 * idempotent, but it is a hash — never the catalogue id, and never derived from
 * content alone.
 */
export function learnerDeckIdFor(userId: string, systemDeckId: string): string {
  return `deck-m-${digest(userId, systemDeckId).slice(0, 20)}`;
}

/**
 * Opaque, per-learner card id.
 *
 * The primary key is deliberately NOT the template id: two learners studying
 * the same template must not collide (the legacy `card-kana-*` scheme did
 * collide, silently discarding the second learner's card).
 */
export function learnerCardIdFor(userId: string, templateId: string): string {
  return `card-m-${digest(userId, templateId).slice(0, 20)}`;
}

/* ------------------------------------------------------------------ *
 * Catalogue definition
 * ------------------------------------------------------------------ */

export interface CatalogueSystemDeck {
  id: string;
  name: string;
  description: string;
  jlptLevel: string;
  schedulerKey: SchedulerKey;
  schedulerParams: Record<string, unknown>;
}

export interface CatalogueTemplate {
  id: string;
  systemDeckId: string;
  cardType: string;
  front: string;
  back: string;
  reading?: string | null;
  meaning?: string | null;
  hint?: string | null;
  sourceType: string;
  sourceRef?: string | null;
  sourceQuestionId?: string | null;
}

/** The four curriculum decks created by `SrsService.ensureSeeded()`. */
export const CURRICULUM_SYSTEM_DECKS: readonly CatalogueSystemDeck[] = [
  {
    id: "deck-n5-core-sm2",
    name: "N5 Core Vocabulary — SM-2",
    description:
      "Foundational N5 vocabulary drawn from the NihongoBridge question bank, scheduled with the classic SM-2 easiness algorithm.",
    jlptLevel: "N5",
    schedulerKey: "sm2",
    schedulerParams: {},
  },
  {
    id: "deck-n5-grammar-fsrs",
    name: "N5 Grammar Points — FSRS-Lite",
    description:
      "Grammar knowledge cards scheduled with the 3-component FSRS memory model for long-term retention targeting 90% recall.",
    jlptLevel: "N5",
    schedulerKey: "fsrs-lite",
    schedulerParams: { requestRetention: 0.9 },
  },
  {
    id: "deck-n5-kanji-leitner",
    name: "N5 Kanji Reading — Leitner Boxes",
    description:
      "Kanji readings in transparent Leitner boxes. Intervals are declared per box so progress is always predictable.",
    jlptLevel: "N5",
    schedulerKey: "leitner-box",
    schedulerParams: {},
  },
  {
    id: "deck-n5-curriculum-ladder",
    name: "N5 Curriculum Sprint — Fixed Ladder",
    description:
      "Curriculum-locked pacing using a declared interval ladder (1 → 3 → 7 → 14 → 30 → 60 → 120 days).",
    jlptLevel: "N5",
    schedulerKey: "fixed-ladder",
    schedulerParams: {},
  },
];

const pad3 = (n: number) => String(n).padStart(3, "0");

/** Same predicate as `note0Kanji()` in srsService (module-private there). */
function singleKanjiNotes(notes: Array<{ word: string; reading: string; meaning: string }>) {
  return notes.filter(
    (n) => n.word && Array.from(n.word).every((ch) => /[\u4e00-\u9faf\u3005\u3006\u30fc]/.test(ch))
  );
}

/**
 * Curriculum templates, derived from the same question bank and with the same
 * iteration order and id scheme as `SrsService.ensureSeeded()`. Keeping the two
 * in lock-step is asserted by `tests/srs-catalogue-materialization.test.ts`
 * (every legacy seeded card must have exactly one template with identical
 * content), which is what protects against silent divergence.
 */
export function curriculumTemplates(): CatalogueTemplate[] {
  const out: CatalogueTemplate[] = [];
  const vocabSeen = new Set<string>();
  const grammarSeen = new Set<string>();
  const kanjiSeen = new Set<string>();
  let vocabIdx = 0;
  let grammarIdx = 0;
  let kanjiIdx = 0;

  for (const q of ALL_SEED_QUESTIONS) {
    for (const note of q.explanationBreakdown?.vocabNotes ?? []) {
      if (!note.word || vocabSeen.has(note.word)) continue;
      vocabSeen.add(note.word);
      if (vocabIdx >= 24) continue;
      vocabIdx += 1;
      out.push({
        id: templateIdForLegacyCard(`card-n5-vocab-${pad3(vocabIdx)}`),
        systemDeckId: "deck-n5-core-sm2",
        cardType: "vocabulary",
        front: note.word,
        back: `${note.reading} — ${note.meaning}`,
        reading: note.reading,
        meaning: note.meaning,
        sourceType: "question_bank.vocab_note",
        sourceQuestionId: q.id,
        sourceRef: `jlpt:${q.jlptLevel}:${q.category}`,
      });
    }

    for (const gp of q.explanationBreakdown?.grammarPoints ?? []) {
      if (!gp.title || grammarSeen.has(gp.title)) continue;
      grammarSeen.add(gp.title);
      if (grammarIdx >= 10) continue;
      grammarIdx += 1;
      out.push({
        id: templateIdForLegacyCard(`card-n5-grammar-${pad3(grammarIdx)}`),
        systemDeckId: "deck-n5-grammar-fsrs",
        cardType: "grammar",
        front: gp.title,
        back: gp.explanation,
        meaning: gp.example ? `例: ${gp.example}` : null,
        sourceType: "question_bank.grammar_point",
        sourceQuestionId: q.id,
        sourceRef: `jlpt:${q.jlptLevel}:${q.category}`,
      });
    }

    for (const k of singleKanjiNotes(q.explanationBreakdown?.vocabNotes ?? [])) {
      if (kanjiSeen.has(k.word)) continue;
      kanjiSeen.add(k.word);
      if (kanjiIdx >= 8) continue;
      kanjiIdx += 1;
      out.push({
        id: templateIdForLegacyCard(`card-n5-kanji-${pad3(kanjiIdx)}`),
        systemDeckId: "deck-n5-kanji-leitner",
        cardType: "kanji",
        front: k.word,
        back: k.reading,
        reading: k.reading,
        meaning: k.meaning,
        sourceType: "question_bank.kanji_reading",
        sourceQuestionId: q.id,
        sourceRef: `jlpt:${q.jlptLevel}:kanji_reading`,
      });
    }
  }

  out.push({
    id: templateIdForLegacyCard("card-n5-ladder-001"),
    systemDeckId: "deck-n5-curriculum-ladder",
    cardType: "vocabulary",
    front: "勉強する",
    back: "べんきょうする — to study",
    reading: "べんきょうする",
    meaning: "to study",
    sourceType: "curriculum.manual",
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * Seeding
 * ------------------------------------------------------------------ */

export interface CatalogueSeedResult {
  systemDecksInserted: number;
  templatesInserted: number;
  systemDeckIds: string[];
}

/**
 * Idempotent, self-healing catalogue seeding.
 *
 * Every record is upserted by its deterministic id with `ON CONFLICT DO
 * NOTHING`, so:
 *   - a partially seeded catalogue is REPAIRED (missing rows are inserted);
 *   - already-present rows are never duplicated and never overwritten;
 *   - re-running is a no-op.
 *
 * It deliberately does NOT short-circuit on "a catalogue deck already exists" —
 * that early return is what let the legacy seeder ignore partial state.
 *
 * It writes ONLY to the catalogue tables. It never touches `srs_decks` or
 * `srs_cards`, so current reads and the legacy demo rows are unaffected.
 */
export async function seedCatalogue(): Promise<CatalogueSeedResult> {
  const decks = await desiredSystemDecks();
  const templates = [...curriculumTemplates(), ...(await knowledgeTemplates(decks))];

  const existingDeckIds = new Set(
    (
      await db
        .select({ id: systemDecksTable.id })
        .from(systemDecksTable)
        .where(inArray(systemDecksTable.id, decks.map((d) => d.id)))
    ).map((r) => r.id)
  );

  const missingDecks = decks.filter((d) => !existingDeckIds.has(d.id));
  if (missingDecks.length > 0) {
    await db
      .insert(systemDecksTable)
      .values(
        missingDecks.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          jlptLevel: d.jlptLevel,
          schedulerKey: d.schedulerKey,
          schedulerParams: d.schedulerParams,
        }))
      )
      .onConflictDoNothing();
  }

  const templateIds = templates.map((t) => t.id);
  const existingTemplateIds = new Set(
    templateIds.length === 0
      ? []
      : (
          await db
            .select({ id: templatesTable.id })
            .from(templatesTable)
            .where(inArray(templatesTable.id, templateIds))
        ).map((r) => r.id)
  );

  const missingTemplates = templates.filter((t) => !existingTemplateIds.has(t.id));
  if (missingTemplates.length > 0) {
    await db
      .insert(templatesTable)
      .values(
        missingTemplates.map((t) => ({
          id: t.id,
          systemDeckId: t.systemDeckId,
          cardType: t.cardType,
          front: t.front,
          back: t.back,
          reading: t.reading ?? null,
          meaning: t.meaning ?? null,
          hint: t.hint ?? null,
          sourceType: t.sourceType,
          sourceRef: t.sourceRef ?? null,
          sourceQuestionId: t.sourceQuestionId ?? null,
        }))
      )
      .onConflictDoNothing();
  }

  return {
    systemDecksInserted: missingDecks.length,
    templatesInserted: missingTemplates.length,
    systemDeckIds: decks.map((d) => d.id),
  };
}

/**
 * The knowledge family (`deck-kana-*`, `deck-kanji-*`) enters the catalogue only
 * once its source tables are populated — those decks are created lazily today by
 * `KnowledgeService.ensureDeck()`, so there is no static list to seed from.
 * Absent source rows simply produce no catalogue rows; nothing is invented.
 */
async function desiredSystemDecks(): Promise<CatalogueSystemDeck[]> {
  const decks: CatalogueSystemDeck[] = [...CURRICULUM_SYSTEM_DECKS];

  for (const script of ["hiragana", "katakana"] as const) {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanaTable)
      .where(eq(kanaTable.script, script));
    if ((row?.count ?? 0) === 0) continue;
    decks.push({
      id: `deck-kana-${script}`,
      name: script === "hiragana" ? "Kana — Hiragana Chart" : "Kana — Katakana Chart",
      description:
        "Kana cards generated directly from the interactive kana chart. Reading recall, symbol → romaji.",
      jlptLevel: "N5",
      schedulerKey: "sm2",
      schedulerParams: {},
    });
  }

  const levels = await db
    .select({ level: kanjiTable.jlptLevel })
    .from(kanjiTable)
    .groupBy(kanjiTable.jlptLevel)
    .orderBy(kanjiTable.jlptLevel);
  for (const { level } of levels) {
    if (!level) continue;
    decks.push({
      id: `deck-kanji-${level.toLowerCase()}`,
      name: `Kanji ${level} — Mind Tree`,
      description:
        "Kanji cards generated from the mind tree. Front shows the character plus its components as a hint.",
      jlptLevel: level,
      schedulerKey: "sm2",
      schedulerParams: {},
    });
  }

  return decks;
}

async function knowledgeTemplates(decks: CatalogueSystemDeck[]): Promise<CatalogueTemplate[]> {
  const present = new Set(decks.map((d) => d.id));
  const out: CatalogueTemplate[] = [];

  if (present.has("deck-kana-hiragana") || present.has("deck-kana-katakana")) {
    const rows = await db
      .select({
        id: kanaTable.id,
        character: kanaTable.character,
        script: kanaTable.script,
        romaji: kanaTable.romaji,
        category: kanaTable.category,
        rowKey: kanaTable.rowKey,
        mnemonic: kanaTable.mnemonic,
        sourceRef: kanaTable.sourceRef,
      })
      .from(kanaTable)
      .orderBy(kanaTable.id);
    for (const k of rows) {
      const deckId = `deck-kana-${k.script}`;
      if (!present.has(deckId)) continue;
      out.push({
        id: templateIdForLegacyCard(`card-kana-${k.id}`),
        systemDeckId: deckId,
        cardType: "kana",
        front: k.character,
        back: k.romaji,
        reading: k.romaji,
        meaning: `${k.category} kana, ${k.rowKey} row`,
        hint: k.mnemonic,
        sourceType: "kana_chart",
        sourceRef: k.sourceRef,
        sourceQuestionId: k.id,
      });
    }
  }

  for (const deck of decks) {
    if (!deck.id.startsWith("deck-kanji-")) continue;
    const rows = await db
      .select({
        id: kanjiTable.id,
        character: kanjiTable.character,
        meaning: kanjiTable.meaning,
        readingsOn: kanjiTable.readingsOn,
        readingsKun: kanjiTable.readingsKun,
      })
      .from(kanjiTable)
      .where(eq(kanjiTable.jlptLevel, deck.jlptLevel))
      .orderBy(kanjiTable.id);
    for (const k of rows) {
      const on = k.readingsOn ?? [];
      const kun = k.readingsKun ?? [];
      out.push({
        id: templateIdForLegacyCard(`card-kanji-${k.id}`),
        systemDeckId: deck.id,
        cardType: "kanji",
        front: k.character,
        back: `${on.join(", ") || "—"} · ${kun.join(", ") || "—"} — ${k.meaning}`,
        reading: on[0] ?? kun[0] ?? null,
        meaning: k.meaning,
        // Component-derived hint is not loaded here; see the phase report.
        hint: null,
        sourceType: "kanji_mindtree",
        sourceQuestionId: k.id,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Materialization
 * ------------------------------------------------------------------ */

export interface MaterializationResult {
  deckId: string;
  systemDeckId: string;
  userId: string;
  cardsCreated: number;
  cardsTotal: number;
}

/**
 * Give ONE learner their own deck + card rows for a system catalogue deck.
 *
 * Atomic (single transaction), idempotent (deterministic ids + partial unique
 * indexes on `(owner_id, system_deck_id)` and `(user_id, template_id)`), and
 * always creates FRESH scheduling state — a template carries content only, so
 * two learners never share a due date.
 *
 * `userId` must be a VERIFIED actor id supplied by the caller. This function
 * performs no authentication of its own and must never receive a value taken
 * from a request body, query string or device id.
 */
export async function materializeSystemDeck(
  userId: string,
  systemDeckId: string
): Promise<MaterializationResult | null> {
  const actor = typeof userId === "string" ? userId.trim() : "";
  if (actor.length === 0) return null;
  if (actor === "anonymous-user") return null; // never materialize into the shared sentinel

  const [systemDeck] = await db
    .select()
    .from(systemDecksTable)
    .where(eq(systemDecksTable.id, systemDeckId))
    .limit(1);
  if (!systemDeck) return null;

  const templates = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.systemDeckId, systemDeckId))
    .orderBy(templatesTable.id);

  const deckId = learnerDeckIdFor(actor, systemDeckId);

  return db.transaction(async (tx) => {
    await tx
      .insert(decksTable)
      .values({
        id: deckId,
        name: systemDeck.name,
        description: systemDeck.description,
        jlptLevel: systemDeck.jlptLevel,
        ownerId: actor,
        systemDeckId: systemDeck.id,
        schedulerKey: systemDeck.schedulerKey,
        schedulerParams: systemDeck.schedulerParams,
      })
      .onConflictDoNothing();

    const now = new Date();
    const created =
      templates.length === 0
        ? []
        : await tx
            .insert(cardsTable)
            .values(
              templates.map((t) => ({
                id: learnerCardIdFor(actor, t.id),
                deckId,
                userId: actor,
                templateId: t.id,
                cardType: t.cardType,
                front: t.front,
                back: t.back,
                reading: t.reading,
                meaning: t.meaning,
                hint: t.hint,
                sourceType: t.sourceType,
                sourceRef: t.sourceRef,
                sourceQuestionId: t.sourceQuestionId,
                schedulerKey: systemDeck.schedulerKey,
                dueAt: now,
              }))
            )
            .onConflictDoNothing()
            .returning({ id: cardsTable.id });

    const cardsTotal = await tx
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(cardsTable)
      .where(and(eq(cardsTable.userId, actor), eq(cardsTable.deckId, deckId)));

    return {
      deckId,
      systemDeckId: systemDeck.id,
      userId: actor,
      cardsCreated: created.length,
      cardsTotal: cardsTotal[0]?.count ?? 0,
    };
  });
}
