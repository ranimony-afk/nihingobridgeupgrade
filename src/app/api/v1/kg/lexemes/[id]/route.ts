import { lexemeDetail } from "@/lib/kg/search";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await lexemeDetail(id);
  if (!data) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  return Response.json({ ok: true, data });
}
