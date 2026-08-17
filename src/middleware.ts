import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasStaffCookie(request: NextRequest) {
  return Boolean(
    request.cookies.get("nb_staff")?.value ||
      request.cookies.get("authjs.session-token")?.value ||
      request.cookies.get("__Secure-authjs.session-token")?.value,
  );
}

export function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  if (isAdminPage && !hasStaffCookie(request)) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-nb-infra", "phase-2");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/audit", "/api/v1/:path*", "/api/game"],
};
