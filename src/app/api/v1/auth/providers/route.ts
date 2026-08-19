import { oauthEnabled } from "@/lib/identity/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, data: oauthEnabled() });
}