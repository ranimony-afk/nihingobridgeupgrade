import { searchGraph } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const data = await searchGraph(q);
  return Response.json({ ok: true, data });
}
