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

/**
 * Counts are aggregated in SQL. The previous implementation selected every
 * analytics row into memory just to tally names, which grows unbounded.
 */
export async function eventCounts() {
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute<{ name: string; n: string }>(
    sql`SELECT name, count(*)::text AS n FROM analytics_events GROUP BY name ORDER BY count(*) DESC`,
  );
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows.rows) {
    const value = Number(row.n);
    counts[row.name] = value;
    total += value;
  }
  return { total, counts };
}
