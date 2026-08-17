import { getPublicLearner } from "@/lib/learner";

export const dynamic = "force-dynamic";

export async function GET() {
  const learner = await getPublicLearner();
  if (!learner) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, learner });
}
