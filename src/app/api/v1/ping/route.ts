/**
 * Edge-runtime liveness probe.
 *
 * Runs at the CDN edge with no database access, so it answers in single-digit
 * milliseconds worldwide. This is for uptime pings and load-balancer checks.
 *
 * `/api/health` stays on the Node runtime because it deliberately verifies the
 * PostgreSQL connection — the two probes answer different questions and both
 * are needed.
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { ok: true, runtime: "edge", ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
