import { db } from "@/db";
import { translationMemory } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET  /api/v1/translations/memory?sourceLocale=en&targetLocale=ta
 * POST /api/v1/translations/memory  { sourceText, sourceLocale?, targetLocale, translatedText, context? }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sourceLocale = url.searchParams.get("sourceLocale") ?? "en";
    const targetLocale = url.searchParams.get("targetLocale");

    const filters = [eq(translationMemory.sourceLocale, sourceLocale)];
    if (targetLocale) filters.push(eq(translationMemory.targetLocale, targetLocale));

    const rows = await db.select().from(translationMemory).where(and(...filters));
    return ok(rows);
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      sourceText: string;
      sourceLocale?: string;
      targetLocale: string;
      translatedText: string;
      context?: string;
    };
    if (!body.sourceText || !body.targetLocale || !body.translatedText) {
      return fail("sourceText, targetLocale, translatedText are required", 400, "BAD_REQUEST");
    }

    const inserted = await db
      .insert(translationMemory)
      .values({
        sourceText: body.sourceText,
        sourceLocale: body.sourceLocale ?? "en",
        targetLocale: body.targetLocale,
        translatedText: body.translatedText,
        context: body.context ?? "general",
      })
      .returning();

    return ok(inserted[0], { status: 201 });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}
