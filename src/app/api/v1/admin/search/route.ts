import { getStaffSession } from "@/lib/audit/auth";
import { reindexSearch, searchIndexSize } from "@/lib/search/indexer";
import { popularQueries, zeroResultQueries } from "@/lib/search/service";
import { ensureSearchInfrastructure } from "@/lib/search/seed";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  await seedReady();
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  const [size, popular, zero] = await Promise.all([
    searchIndexSize(),
    popularQueries(10),
    zeroResultQueries(10),
  ]);
  return Response.json({ ok: true, data: { size, popular, zero } });
}

export async function POST() {
  const staff = await getStaffSession();
  if (!staff) return Response.json({ ok: false, error: "Staff login required" }, { status: 401 });
  await ensureSearchInfrastructure();
  const result = await reindexSearch();
  return Response.json({ ok: true, data: result });
}
