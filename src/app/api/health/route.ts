import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Infrastructure healthcheck.
 *
 * Frozen contract (API_OWNERSHIP §3.1): the body is exactly `{ ok: true }`
 * when the application can reach PostgreSQL, and `{ ok: false }` with status
 * 500 when it cannot.
 *
 * `no-store` is required: a cached health response would let a proxy or load
 * balancer report a healthy service after the database had already failed.
 */
const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
} as const;

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
