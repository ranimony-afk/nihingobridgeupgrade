import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * GET /auth/callback — Phase 13.4C-1 Supabase Auth foundation.
 *
 * AUTHENTICATION ONLY. Exchanges the single-use PKCE `code` (5-minute
 * validity) for a cookie-backed session via `exchangeCodeForSession`,
 * then redirects. No CMS logic, no user provisioning, no role handling.
 *
 * - `next` is restricted to same-origin paths (open-redirect safe).
 * - Missing/failed exchanges land on `/` unauthenticated (no error page
 *   exists yet by design; login UX arrives in a later phase).
 * - Missing Supabase configuration short-circuits home (dev-safe).
 */

export const dynamic = "force-dynamic";

function sanitizeNext(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = sanitizeNext(searchParams.get("next"));
  const home = `${origin}/`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const code = searchParams.get("code");
  if (!url || !key || !code) {
    return NextResponse.redirect(home);
  }

  let response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.redirect(`${origin}${next}`);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(home);
  }
  return response;
}
