import { explorerTree } from "@/lib/kanji/enrich";
import { publicCacheHeaders } from "@/lib/perf/cache";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  return Response.json(
    { ok: true, data: await explorerTree() },
    { headers: publicCacheHeaders(600) },
  );
}
