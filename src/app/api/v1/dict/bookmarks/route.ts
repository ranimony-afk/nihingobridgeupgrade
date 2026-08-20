import { listBookmarks, toggleBookmark } from "@/lib/dict/enrich";
import { getLearnerId } from "@/lib/learner";

export const dynamic = "force-dynamic";

export async function GET() {
  const learnerId = await getLearnerId();
  if (!learnerId) return Response.json({ ok: false, error: "Learner required" }, { status: 401 });
  return Response.json({ ok: true, data: await listBookmarks(learnerId) });
}

export async function POST(request: Request) {
  const learnerId = await getLearnerId();
  if (!learnerId) return Response.json({ ok: false, error: "Learner required" }, { status: 401 });
  const body = (await request.json()) as { targetType?: string; targetId?: string };
  if (!body.targetType || !body.targetId) return Response.json({ ok: false, error: "target required" }, { status: 400 });
  return Response.json({ ok: true, data: await toggleBookmark(learnerId, body.targetType, body.targetId) });
}
