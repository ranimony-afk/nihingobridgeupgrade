import { graphStats } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  return Response.json({ ok: true, data: await graphStats() });
}
