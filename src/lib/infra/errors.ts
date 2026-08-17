import { db } from "@/db";
import { errorEvents } from "@/db/schema";
import { uid } from "@/lib/utils";
import { logger } from "./logger";

export async function reportError(error: unknown, source = "app", meta?: Record<string, string | number | boolean | null>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? null : null;
  logger.error("error.captured", { source, message });

  try {
    await db.insert(errorEvents).values({
      id: uid("err"),
      source,
      message: message.slice(0, 2000),
      stack,
      meta: meta ?? null,
    });
  } catch (persistError) {
    logger.warn("error.persist_failed", {
      message: persistError instanceof Error ? persistError.message : "unknown",
    });
  }

  const webhook = process.env.ERROR_WEBHOOK_URL || process.env.SENTRY_DSN;
  if (webhook && webhook.startsWith("http") && !webhook.includes("sentry.io")) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, message, meta }),
      });
    } catch {
      logger.warn("error.webhook_failed", { source });
    }
  }

  return { message };
}

export async function listErrors(limit = 25) {
  const { desc } = await import("drizzle-orm");
  return db.select().from(errorEvents).orderBy(desc(errorEvents.createdAt)).limit(limit);
}
