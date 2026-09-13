/**
 * Database integration gate for Phase 04.6.
 *
 * Proves the core production safety guarantee:
 *  1. a controlled interruption occurs after two durably committed batches;
 *  2. checkpoint/status/dead-letter/report records are durable;
 *  3. the next execution resumes the SAME logical import run at its cursor;
 *  4. all replayed data is idempotent (no duplicate dictionary rows).
 *
 * Run alone: npx tsx --test etl/tests/jmdict-resume.integration.test.ts
 */

import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { and, desc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import {
  dictionaryEntries,
  etlCheckpoints,
  etlDeadLetters,
  etlImportReports,
  etlValidationReports,
} from "@/db/schema";
import { runJmdictPipeline } from "../pipelines/jmdict-pipeline";
import { SimulatedInterruptionError } from "../runtime/operations";

// The run is serial by nature: it intentionally opens and resumes a database
// checkpoint against a shared fixture source identity.
test("an interrupted JMdict import resumes safely from its committed checkpoint", async () => {
  const before = await db
    .select({ id: dictionaryEntries.id })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.source, "jmdict"));
  const countBefore = before.length;

  let interrupted = false;
  let interruptedRunId: number | null = null;
  let sourceChecksum = "";

  try {
    await runJmdictPipeline({
      maxEntries: 500,
      batchSize: 100,
      resume: false, // force a fresh logical run for this test
      failAfterCommittedBatches: 2,
    });
  } catch (error) {
    assert.ok(error instanceof SimulatedInterruptionError);
    interrupted = true;
  }
  assert.equal(interrupted, true);

  const [failed] = await db
    .select({
      checkpointId: etlCheckpoints.id,
      importRunId: etlCheckpoints.importRunId,
      cursor: etlCheckpoints.lastCommittedCursor,
      batches: etlCheckpoints.batchesCommitted,
      status: etlCheckpoints.status,
      checksum: etlCheckpoints.sourceChecksumSha256,
    })
    .from(etlCheckpoints)
    .where(
      and(
        eq(etlCheckpoints.pipeline, "jmdict"),
        eq(etlCheckpoints.status, "failed"),
      ),
    )
    .orderBy(desc(etlCheckpoints.id))
    .limit(1);

  assert.ok(failed, "failed checkpoint must persist");
  interruptedRunId = failed.importRunId;
  sourceChecksum = failed.checksum;
  assert.equal(failed.cursor, 200, "cursor advances only after two committed 100-record batches");
  assert.equal(failed.batches, 2);
  assert.equal(failed.status, "failed");

  const resumed = await runJmdictPipeline({
    maxEntries: 500,
    batchSize: 100,
    resume: true,
    failAfterCommittedBatches: null,
  });

  assert.equal(resumed.importRunId, interruptedRunId, "resume uses same logical provenance run");
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.resumeCount, 1);
  assert.equal(resumed.checkpointCursor, 500);
  assert.equal(resumed.inserted, 0, "known fixture rows are not inserted twice");
  assert.equal(resumed.updated, 0, "unchanged content is never rewritten");
  assert.equal(resumed.unchanged, 500);

  const [completed] = await db
    .select({
      importRunId: etlCheckpoints.importRunId,
      cursor: etlCheckpoints.lastCommittedCursor,
      status: etlCheckpoints.status,
      resumeCount: etlCheckpoints.resumeCount,
      progress: etlCheckpoints.progress,
    })
    .from(etlCheckpoints)
    .where(eq(etlCheckpoints.id, failed.checkpointId))
    .limit(1);

  assert.equal(completed.importRunId, interruptedRunId);
  assert.equal(completed.status, "complete");
  assert.equal(completed.cursor, 500);
  assert.equal(completed.resumeCount, 1);

  const [report] = await db
    .select({ status: etlImportReports.status, resumed: etlImportReports.resumed })
    .from(etlImportReports)
    .where(eq(etlImportReports.importRunId, interruptedRunId))
    .limit(1);
  assert.equal(report.status, "success");
  assert.equal(report.resumed, true);

  const validation = await db
    .select({ id: etlValidationReports.id })
    .from(etlValidationReports)
    .where(eq(etlValidationReports.importRunId, interruptedRunId));
  // One failure snapshot + one final completed validation report.
  assert.equal(validation.length, 2);

  const failures = await db
    .select({ errorCode: etlDeadLetters.errorCode })
    .from(etlDeadLetters)
    .where(eq(etlDeadLetters.importRunId, interruptedRunId));
  assert.ok(failures.some((f) => f.errorCode === "PIPELINE_FAILURE"));

  const after = await db
    .select({ id: dictionaryEntries.id })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.source, "jmdict"));
  assert.equal(after.length, countBefore, "resume did not create duplicate knowledge rows");

  assert.match(sourceChecksum, /^[0-9a-f]{64}$/);
});

after(async () => {
  await pool.end();
});
