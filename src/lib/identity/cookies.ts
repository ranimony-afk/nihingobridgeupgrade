import { cookies } from "next/headers";
import { setLearnerCookie } from "@/lib/learner";

export const ACCESS_COOKIE = "nb_access";
export const REFRESH_COOKIE = "nb_refresh";

export async function setIdentityCookies(input: { accessToken: string; refreshToken: string; learnerId: string | null }) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, input.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });
  jar.set(REFRESH_COOKIE, input.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  if (input.learnerId) await setLearnerCookie(input.learnerId);
}

export async function clearIdentityCookies() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function readAccessToken(request?: Request) {
  const header = request?.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const jar = await cookies();
  return jar.get(ACCESS_COOKIE)?.value ?? null;
}

export async function readRefreshToken(request?: Request) {
  const header = request?.headers.get("x-refresh-token");
  if (header) return header;
  const jar = await cookies();
  return jar.get(REFRESH_COOKIE)?.value ?? null;
}
