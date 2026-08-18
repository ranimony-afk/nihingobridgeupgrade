import { getLearnerId } from "@/lib/learner";
import { listSrs, pinToSrs, reviewSrs } from "@/lib/kg/srs";

export const dynamic = "force-dynamic";

export async function GET() {
  const learnerId = await getLearnerId();
  if (!learnerId) return Response.json({ ok: false, error: "Learner required" }, { status: 401 });
  return Response.json({ ok: true, data: await listSrs(learnerId) });
}

export async function POST(request: Request) {
  const learnerId = await getLearnerId();
  if (!learnerId) return Response.json({ ok: false, error: "Learner required" }, { status: 401 });
  const body = (await request.json()) as { targetType?: string; targetId?: string; id?: string; remembered?: boolean };
  if (body.id) {
    return Response.json({ ok: true, data: await reviewSrs(body.id, learnerId, Boolean(body.remembered)) });
  }
  if (!body.targetType || !body.targetId) return Response.json({ ok: false, error: "target required" }, { status: 400 });
  await pinToSrs(learnerId, body.targetType, body.targetId);
  return Response.json({ ok: true });
}
