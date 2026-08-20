import { checkBuilder, grammarDetail } from "@/lib/grammar/engine";
import { seedReady } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await seedReady();
  const { slug } = await params;
  const data = await grammarDetail(slug);
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await seedReady();
  const { slug } = await params;
  const data = await grammarDetail(slug);
  if (!data?.builder) return Response.json({ ok: false, error: "No builder" }, { status: 404 });
  const body = (await request.json()) as { attempt?: string[] | string };
  const correct = checkBuilder(data.builder.answer, body.attempt ?? []);
  return Response.json({ ok: true, data: { correct, answer: data.builder.answer } });
}
