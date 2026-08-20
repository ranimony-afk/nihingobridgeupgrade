import { sql } from "drizzle-orm";
import { db } from "@/db";
import { authSecret, getEnv, hasOptionalService } from "./env";
import { pingRedis } from "./redis";
import { pingSupabase } from "./supabase";

export async function pingDatabase() {
  await db.execute(sql`select 1`);
}

export async function getInfraStatus() {
  const env = getEnv();
  let database: { ok: boolean; status: string } = { ok: false, status: "down" };
  try {
    await pingDatabase();
    database = { ok: true, status: "up" };
  } catch {
    database = { ok: false, status: "down" };
  }

  const redis = await pingRedis();
  const supabase = await pingSupabase();

  return {
    ok: database.ok,
    timestamp: new Date().toISOString(),
    services: {
      database,
      drizzle: { ok: database.ok, status: database.ok ? "pooled" : "down", max: 20 },
      redis,
      supabase,
      nextauth: {
        ok: Boolean(env.AUTH_SECRET || authSecret(env)),
        status: env.AUTH_SECRET ? "configured" : "derived_local_secret",
      },
      errorTracking: {
        ok: true,
        status: hasOptionalService(env, "sentry") ? "webhook_or_sentry" : "database",
      },
      analytics: { ok: true, status: "database" },
    },
  };
}
