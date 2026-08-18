import { db } from "@/db";
import { env, isFeatureConfigured, productionReadinessIssues } from "@/lib/env";
import { logError } from "@/lib/logger";
import { checkRedisHealth } from "@/lib/redis";
import { sql } from "drizzle-orm";

export type HealthState = "ok" | "disabled" | "error";

export type HealthReport = {
  ok: boolean;
  status: "ok" | "degraded" | "error";
  timestamp: string;
  environment: string;
  checks: {
    database: HealthState;
    redis: HealthState;
    supabase: HealthState;
    auth: HealthState;
    sentry: HealthState;
  };
  readinessIssues: string[];
};

async function checkDatabase(): Promise<HealthState> {
  try {
    await db.execute(sql`select 1`);
    return "ok";
  } catch (error) {
    logError("Database health check failed", error, { component: "health" });
    return "error";
  }
}

async function checkSupabase(): Promise<HealthState> {
  if (!isFeatureConfigured("supabase")) return "disabled";

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      },
      signal: AbortSignal.timeout(1_500),
      cache: "no-store",
    });

    return response.ok ? "ok" : "error";
  } catch (error) {
    logError("Supabase health check failed", error, { component: "health" });
    return "error";
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, redis, supabase] = await Promise.all([
    checkDatabase(),
    checkRedisHealth(),
    checkSupabase(),
  ]);

  const auth = isFeatureConfigured("auth") ? "ok" : "disabled";
  const sentry = isFeatureConfigured("sentry") ? "ok" : "disabled";
  const readinessIssues = productionReadinessIssues();
  const requiredChecksPass = database === "ok";
  const externalCheckFailed = redis === "error" || supabase === "error";

  return {
    ok: requiredChecksPass,
    status: !requiredChecksPass ? "error" : externalCheckFailed ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    checks: { database, redis, supabase, auth, sentry },
    readinessIssues,
  };
}
