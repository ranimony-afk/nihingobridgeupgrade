import assert from "node:assert/strict";
import { test } from "node:test";
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/index.ts";
import { auditFindings, auditReports } from "../../src/db/schema.ts";
import { getAuditBundle, listFindings, updateFindingStatus } from "../../src/lib/audit/repo.ts";
import { seedReady } from "../../src/lib/seed.ts";

test("audit seed persists the Phase 1 report and findings", async () => {
  const ready = await seedReady();
  assert.equal(ready, true);
  const [report] = await db.select().from(auditReports).where(eq(auditReports.id, "phase-1"));
  assert.ok(report);
  assert.equal(report.title.includes("Audit"), true);
  const rows = await db.select().from(auditFindings).where(eq(auditFindings.reportId, "phase-1"));
  assert.ok(rows.length >= 20);
});

test("bundle score and filters stay consistent", async () => {
  await seedReady();
  const bundle = await getAuditBundle();
  assert.ok(bundle.report);
  assert.ok(bundle.score >= 0 && bundle.score <= 100);
  assert.ok(bundle.roadmap.length >= 12);
  const critical = await listFindings({ severity: "critical" });
  assert.ok(critical.every((row) => row.severity === "critical"));
});

test("status updates reject illegal transitions then accept legal ones", async () => {
  await seedReady();
  const [open] = await listFindings({ status: "open" });
  assert.ok(open);
  const denied = await updateFindingStatus(open.id, "resolved", "test");
  assert.equal(denied.ok, false);
  const started = await updateFindingStatus(open.id, "in_progress", "test");
  assert.equal(started.ok, true);
  const reopened = await updateFindingStatus(open.id, "open", "test");
  assert.equal(reopened.ok, true);
});
