import { db } from "@/db";
import { downloadableResources, downloadHistory, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/downloads?category=vocab_list&jlptLevel=N5&sortBy=popularity
 * POST /api/v1/downloads { resourceId, email } (Requires user registration, tracks download history)
 */
export async function GET(req: Request) {
  try {
    await ensureSeed();
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const jlptLevel = url.searchParams.get("jlptLevel");
    const sortBy = url.searchParams.get("sortBy") ?? "popularity";

    const filters = [] as ReturnType<typeof eq>[];
    if (category && category !== "all") filters.push(eq(downloadableResources.category, category));
    if (jlptLevel && jlptLevel !== "all") filters.push(eq(downloadableResources.jlptLevel, jlptLevel));

    let rows = filters.length
      ? await db.select().from(downloadableResources).where(and(...filters))
      : await db.select().from(downloadableResources);

    if (sortBy === "popularity" || sortBy === "downloads") {
      rows = rows.sort((a, b) => b.downloadCount - a.downloadCount);
    } else if (sortBy === "rating") {
      rows = rows.sort((a, b) => b.rating - a.rating);
    }

    return ok(rows, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { resourceId?: number; email?: string };
    if (!body.resourceId || !body.email) {
      return fail("resourceId and user registration email are required to download", 400, "REGISTRATION_REQUIRED");
    }

    const email = body.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return fail("Please provide a valid email address for free learner registration", 400, "INVALID_EMAIL");
    }

    // Ensure user exists in database
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length === 0) {
      await db.insert(users).values({
        email,
        displayName: email.split("@")[0],
        role: "learner",
      });
    }

    // Find resource
    const resRows = await db
      .select()
      .from(downloadableResources)
      .where(eq(downloadableResources.id, body.resourceId))
      .limit(1);

    if (resRows.length === 0) return fail("Resource not found", 404, "NOT_FOUND");
    const item = resRows[0];

    // Increment download count
    const updated = await db
      .update(downloadableResources)
      .set({ downloadCount: item.downloadCount + 1 })
      .where(eq(downloadableResources.id, item.id))
      .returning();

    // Record download history
    await db.insert(downloadHistory).values({
      resourceId: item.id,
      userEmail: email,
    });

    return ok({
      downloadUrl: item.fileUrl,
      fileTitle: item.title,
      downloadCount: updated[0].downloadCount,
      userEmail: email,
      downloadedAt: new Date().toISOString(),
    });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
