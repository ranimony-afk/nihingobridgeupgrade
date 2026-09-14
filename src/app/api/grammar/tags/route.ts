import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getGrammarTagCloud } from "@/services/knowledge/grammar";

export const dynamic = "force-dynamic";

/** GET /api/grammar/tags — tag cloud with point counts. */
export async function GET() {
  const tags = await getGrammarTagCloud(200);
  return jsonOk({ tags }, { meta: { total: tags.length } });
}

export const OPTIONS = optionsHandler;
