import { popularQueries, suggest } from "@/lib/search/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const [didYouMean, popular] = await Promise.all([q ? suggest(q) : null, popularQueries(8)]);
  return Response.json({ ok: true, data: { didYouMean, popular } });
}
