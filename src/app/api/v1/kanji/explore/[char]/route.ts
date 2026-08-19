import { explorerCard } from "@/lib/kanji/enrich";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ char: string }> }) {
  await seedReady();
  const { char } = await params;
  const data = await explorerCard(decodeURIComponent(char));
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}
