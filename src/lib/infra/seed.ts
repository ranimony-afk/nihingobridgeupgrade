import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, auditFindings, auditRoadmap, systemSettings } from "@/db/schema";
import { uid } from "@/lib/utils";

const defaults: Record<string, string> = {
  infra_phase: "2",
  rate_limit_game: "80",
  analytics_enabled: "true",
  error_tracking: "database",
};

export async function ensureInfraSeed() {
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await db.select({ key: systemSettings.key }).from(systemSettings).where(eq(systemSettings.key, key));
    if (existing.length === 0) {
      await db.insert(systemSettings).values({ key, value });
    }
  }

  await db
    .update(auditRoadmap)
    .set({ status: "done" })
    .where(and(eq(auditRoadmap.id, "rm-2"), eq(auditRoadmap.status, "planned")));

  const progressIds = ["f-middleware-absent", "f-deploy-no-pipeline", "f-deps-gap", "f-sec-no-ratelimit", "f-drizzle-push-only"];
  for (const id of progressIds) {
    await db
      .update(auditFindings)
      .set({ status: "in_progress" })
      .where(and(eq(auditFindings.id, id), eq(auditFindings.status, "open")));
  }

  const marked = await db.select({ key: systemSettings.key }).from(systemSettings).where(eq(systemSettings.key, "phase2_event"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase2_event", value: "1" });
    await db.insert(auditEvents).values({
      id: uid("aev"),
      findingId: null,
      actorId: "system",
      action: "phase2",
      detail: "Infrastructure layer seeded (Auth.js, rate limits, health, backups)",
    });
  }
}
