import { search } from "@/lib/search/service";
import { isKind, type SearchKind } from "@/lib/search/query";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    key: clientKey(request),
    bucket: "search",
    limit: 120,
    windowSec: 60,
  });
  if (!limited.allowed) {
    return Response.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  await seedReady();
  const url = new URL(request.url);
  const kinds = (url.searchParams.get("type") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is SearchKind => isKind(value));

  const difficulty = url.searchParams.get("difficulty");
  const data = await search(url.searchParams.get("q") ?? "", {
    limit: Number(url.searchParams.get("limit") ?? 20),
    offset: Number(url.searchParams.get("offset") ?? 0),
    filters: {
      kinds,
      jlpt: url.searchParams.get("jlpt")?.toUpperCase() || undefined,
      pos: url.searchParams.get("pos")?.toLowerCase() || undefined,
      maxDifficulty: difficulty ? Number(difficulty) : undefined,
    },
  });

  return Response.json({ ok: true, data });
}
