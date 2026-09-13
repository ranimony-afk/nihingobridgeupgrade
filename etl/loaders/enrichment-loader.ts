/**
 * Canonical enrichment persistence. Every write carries a source import-run id.
 */

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeEnrichments } from "@/db/schema";

export type EnrichmentKind =
  | "furigana"
  | "jlpt"
  | "frequency"
  | "radical"
  | "strokes"
  | "pitch"
  | "conjugation";

export type EnrichmentInput = {
  subjectType: "dictionary_entry" | "kanji_character";
  subjectId: number;
  kind: EnrichmentKind;
  variantKey?: string;
  value: Record<string, unknown>;
  sourceImportRunId: number;
  sourceRecordKey: string;
  derivationMethod: string;
  derivationVersion: string;
};

export type EnrichmentLoadResult = {
  inserted: number;
  updated: number;
  unchanged: number;
};

function contentHash(input: EnrichmentInput): string {
  // Import-run IDs are transient execution metadata, not semantic content.
  // Including them would make an identical re-import look changed and defeat
  // idempotency. The run ID remains persisted separately for provenance.
  return createHash("sha256")
    .update(
      JSON.stringify({
        value: input.value,
        sourceRecordKey: input.sourceRecordKey,
        derivationMethod: input.derivationMethod,
        derivationVersion: input.derivationVersion,
      }),
    )
    .digest("hex");
}

/**
 * Insert-or-update enrichment values. `contentHash` avoids no-op rewrites and
 * the unique key means there is one current value per exact derivation slot.
 */
export async function upsertEnrichments(
  inputs: EnrichmentInput[],
): Promise<EnrichmentLoadResult> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const input of inputs) {
    const hash = contentHash(input);
    const variantKey = input.variantKey ?? "";

    const [existing] = await db
      .select({ id: knowledgeEnrichments.id, contentHash: knowledgeEnrichments.contentHash })
      .from(knowledgeEnrichments)
      .where(
        and(
          eq(knowledgeEnrichments.subjectType, input.subjectType),
          eq(knowledgeEnrichments.subjectId, input.subjectId),
          eq(knowledgeEnrichments.kind, input.kind),
          eq(knowledgeEnrichments.variantKey, variantKey),
          eq(knowledgeEnrichments.derivationMethod, input.derivationMethod),
          eq(knowledgeEnrichments.derivationVersion, input.derivationVersion),
        ),
      )
      .limit(1);

    if (existing?.contentHash === hash) {
      unchanged += 1;
      continue;
    }

    const values = {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      kind: input.kind,
      variantKey,
      value: input.value,
      sourceImportRunId: input.sourceImportRunId,
      sourceRecordKey: input.sourceRecordKey,
      derivationMethod: input.derivationMethod,
      derivationVersion: input.derivationVersion,
      contentHash: hash,
      updatedAt: new Date(),
    };

    await db
      .insert(knowledgeEnrichments)
      .values(values)
      .onConflictDoUpdate({
        target: [
          knowledgeEnrichments.subjectType,
          knowledgeEnrichments.subjectId,
          knowledgeEnrichments.kind,
          knowledgeEnrichments.variantKey,
          knowledgeEnrichments.derivationMethod,
          knowledgeEnrichments.derivationVersion,
        ],
        set: {
          value: values.value,
          sourceImportRunId: values.sourceImportRunId,
          sourceRecordKey: values.sourceRecordKey,
          contentHash: values.contentHash,
          updatedAt: values.updatedAt,
        },
      });

    if (existing) updated += 1;
    else inserted += 1;
  }

  return { inserted, updated, unchanged };
}
