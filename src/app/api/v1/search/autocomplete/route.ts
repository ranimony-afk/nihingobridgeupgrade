import { autocomplete } from "@/lib/search/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const url = new URL(request.url);
  const data = await autocomplete(
    url.searchParams.get("q") ?? "",
    Number(url.searchParams.get("limit") ?? 8),
  );
  return Response.json({ ok: true, data });
}
