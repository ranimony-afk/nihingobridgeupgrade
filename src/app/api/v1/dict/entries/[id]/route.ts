import { dictionaryCard } from "@/lib/dict/enrich";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await seedReady();
  const { id } = await params;
  const data = await dictionaryCard(id);
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}
