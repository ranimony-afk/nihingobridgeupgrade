import { listCollocations, listGrammar, listIdioms } from "@/lib/kg/search";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const [grammar, idioms, collocations] = await Promise.all([listGrammar(), listIdioms(), listCollocations()]);
  return Response.json({ ok: true, data: { grammar, idioms, collocations } });
}
