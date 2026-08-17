import { desc } from "drizzle-orm";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { uid } from "@/lib/utils";

export async function trackEvent(input: {
  name: string;
  path?: string;
  actorId?: string;
  meta?: Record<string, string | number | boolean | null>;
}) {
  await db.insert(analyticsEvents).values({
    id: uid("anl"),
    name: input.name.slice(0, 80),
    path: input.path?.slice(0, 200) ?? null,
    actorId: input.actorId ?? null,
    meta: input.meta ?? null,
  });
}

export async function listEvents(limit = 50) {
  return db.select().from(analyticsEvents).orderBy(desc(analyticsEvents.createdAt)).limit(limit);
}

export async function eventCounts() {
  const rows = await db.select().from(analyticsEvents);
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.name] = (counts[row.name] ?? 0) + 1;
  }
  return { total: rows.length, counts };
}
