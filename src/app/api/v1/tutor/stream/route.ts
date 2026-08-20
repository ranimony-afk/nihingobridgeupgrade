import { analyzeTurn, getSession, recordTurn } from "@/lib/tutor/service";
import { streamTutor } from "@/lib/tutor/provider";
import { clientKey, enforceRateLimit } from "@/lib/infra/rate-limit";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await enforceRateLimit({ key: clientKey(request), bucket: "tutor", limit: 40, windowSec: 60 });
  if (!limited.allowed) return Response.json({ ok: false, error: "Too many requests" }, { status: 429 });
  await seedReady();

  const body = (await request.json()) as { sessionId?: string; text?: string };
  if (!body.sessionId || !body.text) {
    return Response.json({ ok: false, error: "sessionId and text required" }, { status: 400 });
  }
  const bundle = await getSession(body.sessionId);
  if (!bundle) return Response.json({ ok: false, error: "Session missing" }, { status: 404 });

  const analysis = await analyzeTurn(body.text);
  await recordTurn({ sessionId: body.sessionId, role: "user", content: body.text, analysis });

  const history = [
    ...bundle.messages.map((row) => ({ role: row.role as "user" | "assistant", content: row.content })),
    { role: "user" as const, content: body.text },
  ];

  const encoder = new TextEncoder();
  let reply = "";
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: analysis\ndata: ${JSON.stringify(analysis)}\n\n`));
      try {
        for await (const chunk of streamTutor({
          persona: bundle.session.persona,
          scenario: bundle.session.scenario,
          level: bundle.session.level,
          history,
        })) {
          reply += chunk;
          controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`));
        }
      } catch {
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: "すみません、もう一度お願いします。" })}\n\n`));
      }
      await recordTurn({ sessionId: body.sessionId as string, role: "assistant", content: reply });
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
