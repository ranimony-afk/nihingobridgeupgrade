import { db } from "@/db";
import { featherProgress } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { reportException } from "@/lib/observability";
import {
  enforceRateLimit,
  featherRateLimitPolicy,
  getRequestIdentifier,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEMO_USER_ID = "akira-demo";

const completeLessonSchema = z.object({
  action: z.literal("complete-lesson"),
});

const defaults = {
  userId: DEMO_USER_ID,
  feathers: 126,
  weeklyFeathers: 38,
  streak: 12,
  lessonsCompleted: 8,
};

async function getProgress() {
  await db
    .insert(featherProgress)
    .values(defaults)
    .onConflictDoNothing({ target: featherProgress.userId });

  const [progress] = await db
    .select()
    .from(featherProgress)
    .where(eq(featherProgress.userId, DEMO_USER_ID))
    .limit(1);

  if (!progress) {
    throw new Error("Feather progress could not be initialized.");
  }

  return progress;
}

async function checkRateLimit(request: Request) {
  const result = await enforceRateLimit(
    getRequestIdentifier(request),
    featherRateLimitPolicy,
  );

  if (!result.allowed) {
    return Response.json(
      { error: "Too many reward requests. Please try again shortly." },
      { status: 429, headers: rateLimitHeaders(result) },
    );
  }

  return result;
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(request);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const progress = await getProgress();
    return Response.json(
      { progress },
      { headers: rateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    reportException(error, { route: "/api/feathers", method: "GET" }, "Could not load feather progress");
    return Response.json(
      { error: "Could not load feather progress." },
      { status: 500, headers: rateLimitHeaders(rateLimit) },
    );
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request);
  if (rateLimit instanceof Response) return rateLimit;

  try {
    const payload = completeLessonSchema.safeParse(await request.json());
    if (!payload.success) {
      return Response.json(
        { error: "Unknown feather action." },
        { status: 400, headers: rateLimitHeaders(rateLimit) },
      );
    }

    await getProgress();

    const [progress] = await db
      .update(featherProgress)
      .set({
        feathers: sql`${featherProgress.feathers} + 3`,
        weeklyFeathers: sql`${featherProgress.weeklyFeathers} + 3`,
        lessonsCompleted: sql`${featherProgress.lessonsCompleted} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(featherProgress.userId, DEMO_USER_ID))
      .returning();

    return Response.json(
      { progress, award: 3 },
      { headers: rateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    reportException(error, { route: "/api/feathers", method: "POST" }, "Could not award feathers");
    return Response.json(
      { error: "Could not award feathers. Please try again." },
      { status: 500, headers: rateLimitHeaders(rateLimit) },
    );
  }
}
