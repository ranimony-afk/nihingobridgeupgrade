import { getLearnerId } from "@/lib/learner";
import { getSession, startSession, tutorStats } from "@/lib/tutor/service";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await seedReady();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ ok: true, data: await tutorStats() });
  const data = await getSession(id);
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}

export async function POST(request: Request) {
  await seedReady();
  const body = (await request.json()) as { scenario?: string; level?: string };
  const learnerId = await getLearnerId();
  const session = await startSession({
    learnerId,
    scenario: body.scenario ?? "cafe",
    level: body.level ?? "N5",
  });
  return Response.json({ ok: true, data: session });
}
