import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware — security headers and a sign-in redirect.
 *
 * THIS IS NOT THE AUTHORIZATION BOUNDARY.
 *
 * Next.js has shipped two authorization-bypass advisories where middleware
 * could be skipped entirely: CVE-2025-29927 (`x-middleware-subrequest`) and
 * GHSA-6gpp-xcg3-4w24 (App Router + Turbopack, which is our exact build
 * configuration). In both cases applications that enforced auth *only* in
 * middleware were exploitable while their code looked correct.
 *
 * Enforcement therefore lives in the route handlers and server components
 * themselves, via `src/lib/auth-guard.ts`. What happens here is:
 *
 *   1. security headers on every response;
 *   2. an early redirect to /login for signed-out browsers, so they get a
 *      useful page instead of a protected route that redirects a moment later.
 *
 * Step 2 only inspects whether a session cookie is *present*. It does not
 * validate it — validation needs the database, and middleware may run on a
 * runtime without it. If this check is bypassed, the page's own guard still
 * rejects the request. Defence in depth, with the depth in the right place.
 */

/** Paths a signed-out browser should be redirected away from. */
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/admin"];

const SECURITY_HEADERS: Record<string, string> = {
  // Block MIME sniffing, which can turn an upload into a script.
  "x-content-type-options": "nosniff",
  // Disallow framing entirely; we have no legitimate embedder.
  "x-frame-options": "DENY",
  // Send the origin only on cross-origin requests, never the full path.
  "referrer-policy": "strict-origin-when-cross-origin",
  // Deny powerful device APIs the platform does not use.
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  // Isolate the browsing context from cross-origin popups.
  "cross-origin-opener-policy": "same-origin",
};

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedPage) {
    // Cookie name must match config.auth.cookieName. Middleware cannot import
    // the config module, which reaches for the database, so the default is
    // duplicated here and covered by a test.
    const hasSessionCookie = Boolean(
      request.cookies.get(process.env.AUTH_COOKIE_NAME ?? "nb_session")?.value,
    );

    if (!hasSessionCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return withSecurityHeaders(NextResponse.redirect(url));
    }
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  // Skip static assets; every dynamic response gets headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
