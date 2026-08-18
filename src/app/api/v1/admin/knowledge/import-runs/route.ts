import { getKnowledgeAdminOverview, getValidationIssues } from "@/lib/knowledge/service";
import { requirePermission } from "@/lib/auth/guard";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ runId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(50).optional() });

export async function GET(request: Request) {
  const identity = await requirePermission(request, "knowledge:manage");
  if (!identity.ok) return identity.response;
  const url = new URL(request.url);
  const parsed = schema.safeParse({ runId: url.searchParams.get("runId") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return Response.json({ error: "Knowledge import filters are invalid.", code: "VALIDATION_ERROR" }, { status: 400 });
  const [overview, validationIssues] = await Promise.all([
    getKnowledgeAdminOverview(),
    getValidationIssues({ importRunId: parsed.data.runId, limit: parsed.data.limit }),
  ]);
  return Response.json({ ok: true, ...overview, validationIssues }, { headers: { "Cache-Control": "no-store" } });
}
