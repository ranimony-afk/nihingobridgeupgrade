import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/auth/supabase/proxy";

/**
 * Next.js 16 proxy entry — Phase 13.4C-1 Supabase Auth foundation.
 *
 * Runs `updateSession` (auth-cookie refresh only; no gating, no redirects)
 * on app routes. Static assets and images are excluded by the matcher.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
