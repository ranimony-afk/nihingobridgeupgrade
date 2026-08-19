import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, auditFindings, auditReports, auditRoadmap, staffUsers } from "@/db/schema";
import { PHASE1_FINDINGS, PHASE1_REPORT, PHASE1_ROADMAP } from "./catalog";
import { hashPassword } from "./crypto";
import { countBy, domainCoverage, readinessScore } from "./score";
import type { FindingStatus } from "./types";
import { canTransition } from "./score";
import { uid } from "../utils";

export async function ensureAuditSeed() {
  const existing = await db.select({ id: auditReports.id }).from(auditReports).where(eq(auditReports.id, PHASE1_REPORT.id));
  if (existing.length === 0) {
    await db.insert(auditReports).values(PHASE1_REPORT);
    await db.insert(auditFindings).values(
      PHASE1_FINDINGS.map((finding) => ({
        ...finding,
        reportId: PHASE1_REPORT.id,
        status: finding.status ?? "open",
      })),
    );
    await db.insert(auditRoadmap).values(
      PHASE1_ROADMAP.map((item) => ({
        ...item,
        reportId: PHASE1_REPORT.id,
        dependsOn: item.dependsOn ?? null,
      })),
    );
    await db.insert(auditEvents).values({
      id: uid("aev"),
      findingId: null,
      actorId: "system",
      action: "seed",
      detail: "Phase 1 audit catalog loaded",
    });
  }

  await db
    .insert(staffUsers)
    .values({
      id: "staff-sensei",
      email: "sensei@nihongobridge.local",
      name: "Lead Architect",
      passwordHash: hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD || "bridge-audit"),
      role: "architect",
    })
    .onConflictDoNothing();
}

export async function getAuditBundle(reportId = PHASE1_REPORT.id) {
  const [report] = await db.select().from(auditReports).where(eq(auditReports.id, reportId));
  const findings = await db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.reportId, reportId))
    .orderBy(auditFindings.priority);
  const roadmap = await db
    .select()
    .from(auditRoadmap)
    .where(eq(auditRoadmap.reportId, reportId))
    .orderBy(auditRoadmap.sortOrder);
  const events = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt));

  return {
    report,
    findings,
    roadmap,
    events: events.slice(0, 40),
    score: readinessScore(findings),
    coverage: domainCoverage(findings.map((item) => item.domain)),
    bySeverity: countBy(findings, "severity"),
    byStatus: countBy(findings, "status"),
    byCategory: countBy(findings, "category"),
  };
}

export async function listFindings(filters: { domain?: string; severity?: string; status?: string }) {
  const clauses = [eq(auditFindings.reportId, PHASE1_REPORT.id)];
  if (filters.domain) clauses.push(eq(auditFindings.domain, filters.domain));
  if (filters.severity) clauses.push(eq(auditFindings.severity, filters.severity));
  if (filters.status) clauses.push(eq(auditFindings.status, filters.status));
  return db
    .select()
    .from(auditFindings)
    .where(and(...clauses))
    .orderBy(auditFindings.priority);
}

export async function updateFindingStatus(id: string, status: FindingStatus, actorId: string | null) {
  const [current] = await db.select().from(auditFindings).where(eq(auditFindings.id, id));
  if (!current) return { ok: false as const, error: "Finding not found", status: 404 };
  if (!canTransition(current.status as FindingStatus, status)) {
    return { ok: false as const, error: `Cannot move ${current.status} → ${status}`, status: 400 };
  }
  await db.update(auditFindings).set({ status }).where(eq(auditFindings.id, id));
  await db.insert(auditEvents).values({
    id: uid("aev"),
    findingId: id,
    actorId,
    action: "status",
    detail: `${current.status} → ${status}`,
  });
  const [fresh] = await db.select().from(auditFindings).where(eq(auditFindings.id, id));
  return { ok: true as const, finding: fresh };
}
