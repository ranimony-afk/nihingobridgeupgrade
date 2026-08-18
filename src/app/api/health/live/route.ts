export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      status: "live",
      timestamp: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
