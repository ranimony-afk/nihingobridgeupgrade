import { explorerTree } from "@/lib/kanji/enrich";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  return Response.json({ ok: true, data: await explorerTree() });
}
