import { offlinePack } from "@/lib/dict/enrich";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const pack = await offlinePack();
  return Response.json({ ok: true, data: pack });
}
