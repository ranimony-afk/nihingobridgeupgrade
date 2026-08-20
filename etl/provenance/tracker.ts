/**
 * Provenance tracker — logs import runs to the source_provenance table.
 * Every ETL pipeline run creates or updates a provenance record.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../adapters/db";
import type { SourceRegistration } from "../sources/registry";
import type { ImportRunReport } from "../types";

/**
 * Ensure a source_provenance record exists for this source.
 * Creates on first import, updates on subsequent imports.
 */
export async function registerSource(
  source: SourceRegistration,
  pipelineVersion: string,
): Promise<void> {
  const db = getDb();

  const existing = await db
    .select()
    .from(schema.sourceProvenance)
    .where(eq(schema.sourceProvenance.id, source.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(schema.sourceProvenance).values({
      id: source.id,
      name: source.name,
      version: source.version,
      license: source.license,
      url: source.downloadUrl || source.licenseUrl,
      importPipelineVersion: pipelineVersion,
    });
    console.log(`[provenance] Registered new source: ${source.name}`);
  } else {
    console.log(`[provenance] Source already registered: ${source.name}`);
  }
}

/**
 * Update the source_provenance record after an import run completes.
 */
export async function recordImportRun(
  report: ImportRunReport,
): Promise<void> {
  const db = getDb();

  await db
    .update(schema.sourceProvenance)
    .set({
      version: report.sourceVersion,
      importPipelineVersion: report.pipelineVersion,
      lastImportCount:
        report.counts.inserted + report.counts.updated,
      lastImportStatus: report.status,
      lastImportedAt: report.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.sourceProvenance.id, report.sourceId));

  console.log(
    `[provenance] Recorded import run for ${report.sourceName}: ` +
      `${report.counts.inserted} inserted, ${report.counts.updated} updated, ` +
      `${report.counts.skippedUnchanged} unchanged, ${report.counts.errors} errors`,
  );
}
