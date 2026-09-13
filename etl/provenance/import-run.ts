/**
 * Provenance: every ingestion is recorded with source, version, license,
 * attribution, checksum and outcome (Rule 9 — license-aware, traceable).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { etlImportRuns } from "@/db/schema";

export type StartRunInput = {
  source: string;
  sourceUrl: string;
  sourceVersion: string;
  license: string;
  attribution: string;
  checksumSha256: string;
  checksumVerified: boolean;
  dryRun: boolean;
};

export async function startImportRun(input: StartRunInput): Promise<number> {
  const [row] = await db
    .insert(etlImportRuns)
    .values({ ...input, status: "running" })
    .returning({ id: etlImportRuns.id });
  return row.id;
}

export async function finishImportRun(
  id: number,
  status: "success" | "failed",
  stats: Record<string, unknown>,
  errorSample: unknown[],
): Promise<void> {
  await db
    .update(etlImportRuns)
    .set({ status, stats, errorSample, finishedAt: new Date() })
    .where(eq(etlImportRuns.id, id));
}
