import { validateKnowledgeImportRun } from "@/lib/knowledge/validation";
import { requirePermission } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const identity = await requirePermission(request, "knowledge:import");
  if (!identity.ok) return identity.response;
  const { runId } = await context.params;
  try {
    const result = await validateKnowledgeImportRun(runId);
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Knowledge import run was not found or validation failed.", code: "VALIDATION_FAILED" }, { status: 400 });
  }
}
