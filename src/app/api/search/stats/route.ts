import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getSearchHealth } from "@/services/search/postgres-search";

export const dynamic = "force-dynamic";

/** GET /api/search/stats — search projection and PostgreSQL index health. */
export async function GET() {
  const stats = await getSearchHealth();
  return jsonOk(
    { ...stats, engine: "postgresql" as const },
    { cacheSeconds: 30, staleSeconds: 120 },
  );
}

export const OPTIONS = optionsHandler;
