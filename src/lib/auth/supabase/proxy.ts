import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth session refresh — Phase 13.4C-1.
 *
 * Official @supabase/ssr `updateSession` pattern, with two deliberate
 * foundation-scoped deviations, both documented:
 *
 * 1. NO redirects, NO route gating. The official example redirects
 *    unauthenticated users to /login; this foundation refreshes sessions
 *    only, so every existing route behaves exactly as before. Gating
 *    arrives with the CMS API/UI phases, through requirePermission().
 * 2. Missing Supabase configuration short-circuits to a plain pass-through
 *    response. Local/dev/test environments without a Supabase project must
 *    keep working (everyone simply resolves as unauthenticated, and the
 *    13.3A CMS boundary stays fail-closed).
 *
 * No `server-only` marker here by design: this module runs in the proxy
 * runtime. It is inherently server-side via its `next/server` import, which
 * cannot be bundled into a client component.
 */
export async function updateSession(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and getClaims(). Refreshes
  // the session when the access token is close to expiring, which is what
  // keeps server-rendered users signed in. Never the raw cookie-session
  // reader here: it reads the cookie without revalidating it.
  await supabase.auth.getClaims();

  // IMPORTANT: return the supabaseResponse object as built. An earlier
  // response doesn't carry refreshed cookies and signs users out.
  return supabaseResponse;
}
