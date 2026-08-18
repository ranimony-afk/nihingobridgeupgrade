import { kanjiDetail } from "@/lib/kg/search";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ char: string }> }) {
  const { char } = await params;
  const data = await kanjiDetail(decodeURIComponent(char));
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}
