import { OPENAPI_SPEC } from "@/shared/mobile";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(OPENAPI_SPEC, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
