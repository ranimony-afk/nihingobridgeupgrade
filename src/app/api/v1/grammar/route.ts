import { grammarStats, listGrammarPoints } from "@/lib/grammar/engine";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const url = new URL(request.url);
  const points = await listGrammarPoints({
    level: url.searchParams.get("level") ?? undefined,
    maxDifficulty: url.searchParams.get("maxDifficulty") ? Number(url.searchParams.get("maxDifficulty")) : undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  return Response.json({ ok: true, data: { points: points.slice(0, 200), stats: await grammarStats() } });
}
