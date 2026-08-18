import { syncKnowledgeDatasetRegistry } from "@/lib/knowledge/datasets";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await requirePermission(request, "knowledge:manage");
  if (!identity.ok) return identity.response;
  const datasets = await syncKnowledgeDatasetRegistry();
  return Response.json({ ok: true, datasets }, { headers: { "Cache-Control": "no-store" } });
}
