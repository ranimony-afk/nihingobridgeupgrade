import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  kgGrammar,
  kgGrammarBuilder,
  kgGrammarEdges,
  kgGrammarExamples,
  kgGrammarMeta,
  systemSettings,
} from "@/db/schema";
import { GRAMMAR_POINTS, generateFiller, type GrammarSeed } from "./corpus";
import { GRAMMAR_CAPACITY, aiExplanation, checkBuilder, timelineFor } from "./pure";

export { GRAMMAR_CAPACITY, aiExplanation, checkBuilder, timelineFor };

async function upsertPoint(seed: GrammarSeed) {
  const id = `gr-${seed.slug}`;
  await db
    .insert(kgGrammar)
    .values({
      id,
      slug: seed.slug,
      title: seed.title,
      structure: seed.structure,
      level: seed.level,
      explanation: seed.explanation,
    })
    .onConflictDoNothing();
  await db
    .insert(kgGrammarMeta)
    .values({
      grammarId: id,
      difficulty: seed.difficulty,
      formation: seed.formation,
      nuance: seed.nuance,
      aiExplanation: aiExplanation(seed),
      timeline: timelineFor(seed),
    })
    .onConflictDoNothing();
  for (const [index, example] of seed.examples.entries()) {
    await db
      .insert(kgGrammarExamples)
      .values({ id: `grx-${seed.slug}-${index}`, grammarId: id, ja: example.ja, en: example.en })
      .onConflictDoNothing();
  }
  if (seed.builder) {
    await db
      .insert(kgGrammarBuilder)
      .values({
        id: `grb-${seed.slug}`,
        grammarId: id,
        prompt: seed.builder.prompt,
        tiles: seed.builder.tiles,
        answer: seed.builder.answer,
      })
      .onConflictDoNothing();
  }
  for (const requirement of seed.requires ?? []) {
    await db
      .insert(kgGrammarEdges)
      .values({ id: `gre-${requirement}-${seed.slug}`, fromId: `gr-${requirement}`, toId: id, kind: "prerequisite" })
      .onConflictDoNothing();
  }
  return id;
}

export async function importGrammarCore() {
  let imported = 0;
  for (const seed of GRAMMAR_POINTS) {
    await upsertPoint(seed);
    imported += 1;
  }
  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase8_grammar"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase8_grammar", value: "1" });
  }
  return { imported };
}

export async function generateGrammarBatch(count: number) {
  const [existing] = await db.select({ n: sql<number>`count(*)` }).from(kgGrammar);
  const offset = Number(existing?.n ?? 0);
  const seeds = generateFiller(Math.min(Math.max(count, 1), 500), offset);
  for (const seed of seeds) {
    await upsertPoint(seed);
  }
  return { generated: seeds.length, total: offset + seeds.length, capacity: GRAMMAR_CAPACITY };
}

export async function listGrammarPoints(filters: { level?: string; maxDifficulty?: number; q?: string } = {}) {
  const rows = await db.select().from(kgGrammar).orderBy(asc(kgGrammar.level), asc(kgGrammar.slug));
  const metas = await db.select().from(kgGrammarMeta);
  const metaById = new Map(metas.map((row) => [row.grammarId, row]));
  return rows
    .map((row) => ({ ...row, meta: metaById.get(row.id) ?? null }))
    .filter((row) => (filters.level ? row.level === filters.level : true))
    .filter((row) => (filters.maxDifficulty ? (row.meta?.difficulty ?? 1) <= filters.maxDifficulty : true))
    .filter((row) =>
      filters.q
        ? `${row.title} ${row.structure} ${row.explanation}`.toLowerCase().includes(filters.q.toLowerCase())
        : true,
    );
}

export async function grammarDetail(slug: string) {
  const [point] = await db.select().from(kgGrammar).where(eq(kgGrammar.slug, slug));
  if (!point) return null;
  const [meta] = await db.select().from(kgGrammarMeta).where(eq(kgGrammarMeta.grammarId, point.id));
  const examples = await db.select().from(kgGrammarExamples).where(eq(kgGrammarExamples.grammarId, point.id));
  const [builder] = await db.select().from(kgGrammarBuilder).where(eq(kgGrammarBuilder.grammarId, point.id));
  const inbound = await db.select().from(kgGrammarEdges).where(eq(kgGrammarEdges.toId, point.id));
  const outbound = await db.select().from(kgGrammarEdges).where(eq(kgGrammarEdges.fromId, point.id));
  const related = [];
  for (const edge of [...inbound, ...outbound]) {
    const otherId = edge.fromId === point.id ? edge.toId : edge.fromId;
    const [other] = await db.select().from(kgGrammar).where(eq(kgGrammar.id, otherId));
    if (other) {
      related.push({ ...other, kind: edge.fromId === point.id ? "unlocks" : "requires" });
    }
  }
  return { point, meta: meta ?? null, examples, builder: builder ?? null, related };
}



export async function grammarStats() {
  const [total] = await db.select({ n: sql<number>`count(*)` }).from(kgGrammar);
  const rows = await db.select().from(kgGrammarMeta);
  const byDifficulty: Record<string, number> = {};
  for (const row of rows) {
    byDifficulty[row.difficulty] = (byDifficulty[row.difficulty] ?? 0) + 1;
  }
  return { total: Number(total?.n ?? 0), capacity: GRAMMAR_CAPACITY, byDifficulty };
}
