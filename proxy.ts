import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSubscriptionAccess } from "@/lib/auth/identity";
import { roleAtLeast } from "@/lib/auth/permissions";

export default auth(async (request) => {
  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/premium");
  if (!isProtected) return NextResponse.next();

  if (!request.auth?.user?.id) {
    const signInUrl = new URL("/auth/sign-in", request.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  if (pathname.startsWith("/premium")) {
    const subscription = await getSubscriptionAccess(request.auth.user.id);
    if (!subscription.active && request.auth.user.role !== "super_admin") {
      return NextResponse.redirect(new URL("/pricing?locked=1", request.nextUrl.origin));
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!roleAtLeast(request.auth.user.role, "admin")) {
      return NextResponse.redirect(new URL("/unauthorized", request.nextUrl.origin));
    }

    const subscription = await getSubscriptionAccess(request.auth.user.id);
    if (!subscription.active && request.auth.user.role !== "super_admin") {
      return NextResponse.redirect(new URL("/account/subscription", request.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/premium/:path*"],
};
