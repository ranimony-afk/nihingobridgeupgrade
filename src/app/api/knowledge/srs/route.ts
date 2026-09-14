import { NextRequest, NextResponse } from "next/server";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { srsDecks as decksTable } from "@/db/schema";
import { getScheduler, resolveParams } from "@/services/srs/scheduler";

export const dynamic = "force-dynamic";

/** GET — knowledge-layer stats (how the two features are wired together). */
export async function GET() {
  try {
    const stats = await KnowledgeService.getKnowledgeStats();
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load knowledge stats";
    console.error("GET /api/knowledge/srs error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST — push a knowledge row into the SRS as a reviewable card.
 * Body: { target: "kana" | "kanji" | "kana-row", ... }
 *
 * Cards are linked back to their source via sourceType + sourceRef, so the
 * knowledge layer and the SRS stay one system rather than two.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const target = body?.target;

    if (target === "kana") {
      if (!body.kanaId) {
        return NextResponse.json({ success: false, error: "kanaId is required" }, { status: 400 });
      }
      const result = await KnowledgeService.addKanaToSrs({
        kanaId: body.kanaId,
        userId: body.userId,
      });
      if (!result) {
        return NextResponse.json({ success: false, error: "Kana not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, ...result });
    }

    if (target === "kana-row") {
      if (!body.rowKey || !body.script) {
        return NextResponse.json(
          { success: false, error: "rowKey and script are required" },
          { status: 400 }
        );
      }
      const result = await KnowledgeService.addKanaRowToSrs({
        rowKey: body.rowKey,
        script: body.script,
        userId: body.userId,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (target === "kanji") {
      if (!body.character) {
        return NextResponse.json({ success: false, error: "character is required" }, { status: 400 });
      }
      const result = await KnowledgeService.addKanjiToSrs({
        character: body.character,
        userId: body.userId,
      });
      if (!result) {
        return NextResponse.json({ success: false, error: "Kanji not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json(
      { success: false, error: "target must be 'kana', 'kana-row' or 'kanji'" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add to SRS";
    console.error("POST /api/knowledge/srs error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

/** PATCH — retune the algorithm binding on a knowledge-generated deck. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { deckId, schedulerKey } = body;

    if (!deckId || !schedulerKey) {
      return NextResponse.json(
        { success: false, error: "deckId and schedulerKey are required" },
        { status: 400 }
      );
    }

    const scheduler = getScheduler(schedulerKey);
    const [row] = await db
      .update(decksTable)
      .set({
        schedulerKey: scheduler.key,
        schedulerParams: resolveParams(scheduler, null) as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(decksTable.id, deckId))
      .returning();

    if (!row) {
      return NextResponse.json({ success: false, error: "Deck not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Deck bound to ${scheduler.name} v${scheduler.version}`,
      deck: row,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rebind deck";
    console.error("PATCH /api/knowledge/srs error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
