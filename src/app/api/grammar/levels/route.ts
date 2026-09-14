import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getGrammarLevelSummary } from "@/services/knowledge/grammar-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar/levels
 * JLPT level summary: how many points and corpus examples exist per level.
 */
export async function GET() {
  const levels = await getGrammarLevelSummary();
  return jsonOk(
    { levels },
    {
      meta: {
        levels: levels.length,
        totalPoints: levels.reduce((sum, level) => sum + level.total, 0),
      },
    },
  );
}

export const OPTIONS = optionsHandler;
