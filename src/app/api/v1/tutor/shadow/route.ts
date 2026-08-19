import { pronunciationScore } from "@/lib/tutor/analyze";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { target?: string; heard?: string };
  if (!body.target || !body.heard) {
    return Response.json({ ok: false, error: "target and heard required" }, { status: 400 });
  }
  const score = pronunciationScore(body.target, body.heard);
  return Response.json({
    ok: true,
    data: {
      score,
      verdict: score >= 80 ? "excellent" : score >= 55 ? "good" : "keep practising",
    },
  });
}
