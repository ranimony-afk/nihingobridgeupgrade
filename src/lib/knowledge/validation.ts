import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  knowledgeImportRuns,
  knowledgeKanji,
  knowledgeKanjiMeanings,
  knowledgeLexemeReadings,
  knowledgeLexemeSenses,
  knowledgeLexemes,
  knowledgeSentences,
  knowledgeValidationIssues,
} from "@/db/schema";
import { env } from "@/lib/env";

export type KnowledgeValidationResult = {
  importRunId: string;
  checked: number;
  issues: number;
};

export async function validateKnowledgeImportRun(importRunId: string): Promise<KnowledgeValidationResult> {
  const [run] = await db.select().from(knowledgeImportRuns).where(eq(knowledgeImportRuns.id, importRunId)).limit(1);
  if (!run) throw new Error("Knowledge import run was not found.");

  const issues: Array<{ severity: string; code: string; recordLocator: string; message: string }> = [];
  const datasetId = run.datasetId;

  const lexemesWithoutSenses = await db
    .select({ id: knowledgeLexemes.id })
    .from(knowledgeLexemes)
    .where(
      and(
        eq(knowledgeLexemes.datasetId, datasetId),
        sql`NOT EXISTS (SELECT 1 FROM knowledge_lexeme_senses WHERE knowledge_lexeme_senses.lexeme_id = ${knowledgeLexemes.id})`,
      ),
    )
    .limit(env.KNOWLEDGE_MAX_VALIDATION_ISSUES);
  issues.push(...lexemesWithoutSenses.map((row) => ({ severity: "warning", code: "LEXEME_WITHOUT_SENSE", recordLocator: row.id, message: "Lexeme has no normalized sense records." })));

  const lexemesWithoutReadings = await db
    .select({ id: knowledgeLexemes.id })
    .from(knowledgeLexemes)
    .where(
      and(
        eq(knowledgeLexemes.datasetId, datasetId),
        eq(knowledgeLexemes.primaryReading, null as never),
        sql`NOT EXISTS (SELECT 1 FROM knowledge_lexeme_readings WHERE knowledge_lexeme_readings.lexeme_id = ${knowledgeLexemes.id})`,
      ),
    )
    .limit(Math.max(0, env.KNOWLEDGE_MAX_VALIDATION_ISSUES - issues.length));
  issues.push(...lexemesWithoutReadings.map((row) => ({ severity: "warning", code: "LEXEME_WITHOUT_READING", recordLocator: row.id, message: "Lexeme has no reading and no primary reading." })));

  const kanjiWithoutMeanings = await db
    .select({ id: knowledgeKanji.id })
    .from(knowledgeKanji)
    .where(
      and(
        eq(knowledgeKanji.datasetId, datasetId),
        sql`NOT EXISTS (SELECT 1 FROM knowledge_kanji_meanings WHERE knowledge_kanji_meanings.kanji_id = ${knowledgeKanji.id})`,
      ),
    )
    .limit(Math.max(0, env.KNOWLEDGE_MAX_VALIDATION_ISSUES - issues.length));
  issues.push(...kanjiWithoutMeanings.map((row) => ({ severity: "warning", code: "KANJI_WITHOUT_MEANING", recordLocator: row.id, message: "Kanji has no normalized meaning records." })));

  const emptySentences = await db
    .select({ id: knowledgeSentences.id })
    .from(knowledgeSentences)
    .where(and(eq(knowledgeSentences.datasetId, datasetId), sql`length(trim(${knowledgeSentences.text})) = 0`))
    .limit(Math.max(0, env.KNOWLEDGE_MAX_VALIDATION_ISSUES - issues.length));
  issues.push(...emptySentences.map((row) => ({ severity: "error", code: "EMPTY_SENTENCE", recordLocator: row.id, message: "Sentence text is empty after persistence." })));

  if (issues.length > 0) {
    await db.insert(knowledgeValidationIssues).values(
      issues.map((issue) => ({ importRunId, ...issue })),
    );
  }

  await db
    .update(knowledgeImportRuns)
    .set({
      summary: {
        ...run.summary,
        postImportValidation: { checkedAt: new Date().toISOString(), issues: issues.length },
      },
    })
    .where(eq(knowledgeImportRuns.id, importRunId));

  return {
    importRunId,
    checked: lexemesWithoutSenses.length + lexemesWithoutReadings.length + kanjiWithoutMeanings.length + emptySentences.length,
    issues: issues.length,
  };
}
