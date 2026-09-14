import { jsonOk, optionsHandler } from "@/lib/api/http";
import { getBankStats } from "@/services/questions/engine";

export const dynamic = "force-dynamic";

/** GET /api/questions/stats — question bank coverage by skill, level and origin. */
export async function GET() {
  const stats = await getBankStats();
  return jsonOk(stats, { cacheSeconds: 30, staleSeconds: 120 });
}

export const OPTIONS = optionsHandler;
