import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessInstitution, canAccessTeacher, planAllows } from "@/lib/identity/rbac";
import { verifyJwtEdge } from "@/lib/identity/jwt-edge";

function hasStaffCookie(request: NextRequest) {
  return Boolean(
    request.cookies.get("nb_staff")?.value ||
      request.cookies.get("authjs.session-token")?.value ||
      request.cookies.get("__Secure-authjs.session-token")?.value,
  );
}

export async function middleware(request: NextRequest) {
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

  const claims = await verifyJwtEdge(request.cookies.get("nb_access")?.value);
  const role = claims?.role ?? "";
  const plan = claims?.plan ?? "free";
  if (pathname.startsWith("/teacher") && !canAccessTeacher(role)) {
    return NextResponse.redirect(new URL(`/login?from=${pathname}`, request.url));
  }
  if (pathname.startsWith("/institution") && !canAccessInstitution(role)) {
    return NextResponse.redirect(new URL(`/login?from=${pathname}`, request.url));
  }
  if (
    (pathname.startsWith("/plus") || pathname.startsWith("/premium")) &&
    !planAllows(plan, "plus") &&
    role !== "admin" &&
    role !== "super_admin"
  ) {
    return NextResponse.redirect(new URL("/billing", request.url));
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-nb-infra", "phase-3");
  if (claims) {
    response.headers.set("x-nb-role", claims.role);
    response.headers.set("x-nb-plan", claims.plan);
  }
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/audit",
    "/teacher",
    "/teacher/:path*",
    "/institution",
    "/institution/:path*",
    "/plus",
    "/plus/:path*",
    "/premium",
    "/premium/:path*",
    "/api/v1/:path*",
    "/api/game",
  ],
};
