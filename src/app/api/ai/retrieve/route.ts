import { NextRequest, NextResponse } from "next/server";
import {
  KNOWLEDGE_DOMAINS,
  KnowledgeRetriever,
  type KnowledgeDomain,
} from "@/services/ai/knowledgeRetriever";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

export const dynamic = "force-dynamic";

function parseDomains(raw: string | null): KnowledgeDomain[] | undefined {
  if (!raw) return undefined;
  const requested = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const valid = requested.filter((value): value is KnowledgeDomain =>
    (KNOWLEDGE_DOMAINS as readonly string[]).includes(value),
  );
  return valid.length > 0 ? valid : undefined;
}

/**
 * Knowledge retrieval for the AI layer.
 *
 * GET /api/ai/retrieve?q=水
 * GET /api/ai/retrieve?q=てから&domains=grammar,sentence&level=N5&limit=8
 * GET /api/ai/retrieve?domain=grammar&id=gp-te-kara   (entity mode)
 *
 * Returns the matched source records plus their provenance. No AI provider
 * is involved — this endpoint is deterministic database retrieval.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";
  const entityDomain = parseDomains(params.get("domain"))?.[0];
  const entityId = params.get("id")?.trim();
  const level = params.get("level")?.trim() || undefined;
  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const maxTotal = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 50)
    : undefined;

  try {
    // Knowledge must exist before it can be retrieved.
    await Promise.all([
      KnowledgeCorpusService.ensureSeeded(),
      KnowledgeService.ensureSeeded(),
    ]);

    if (entityDomain && entityId) {
      const entityResult = await KnowledgeRetriever.retrieveEntity(entityDomain, entityId);
      return NextResponse.json({ success: true, mode: "entity", ...entityResult });
    }

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Provide ?q= for a search, or ?domain= and ?id= for an entity lookup.",
          },
        },
        { status: 400 },
      );
    }

    const result = await KnowledgeRetriever.retrieve(query, {
      domains: parseDomains(params.get("domains")),
      maxTotal,
      jlptLevel: level,
    });

    return NextResponse.json({ success: true, mode: "search", ...result });
  } catch (error) {
    console.error("Knowledge retrieval failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Knowledge retrieval failed",
        },
      },
      { status: 500 },
    );
  }
}
