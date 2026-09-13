import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getGrammarOverview } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

/** GET /api/grammar/stats — counts used by dashboards and the admin screen. */
export async function GET() {
  const stats = await getGrammarOverview();
  return jsonOk(stats);
}

export const OPTIONS = optionsHandler;
