/**
 * HTTP transport for sessions: cookie for web, Bearer for Flutter.
 *
 * Both carry the same opaque token and resolve to the same user, satisfying
 * "one identity, two transports" (ARCHITECTURE_FREEZE §3.1).
 */

import { cookies, headers } from "next/headers";

import { serverEnv } from "@/config/env";

import { bearerFromHeader } from "./tokens.ts";
import { resolveSession, type PublicUser } from "./service.ts";

export interface CookieAttributes {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

/**
 * Build the session cookie.
 *
 * - `httpOnly` keeps the token away from JavaScript, so XSS cannot read it.
 * - `sameSite: "lax"` blocks the browser from attaching this cookie to
 *   cross-site POST requests, which is our baseline CSRF defence; `strict`
 *   would additionally break ordinary inbound links.
 * - `secure` is on outside development so the token never crosses plain HTTP.
 */
export function buildSessionCookie(token: string, maxAgeSeconds: number): CookieAttributes {
  const { auth, app } = serverEnv();
  return {
    name: auth.cookieName,
    value: token,
    httpOnly: true,
    secure: app.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Serialise cookie attributes into a Set-Cookie header value. */
export function serializeCookie(attributes: CookieAttributes): string {
  const parts = [
    `${attributes.name}=${attributes.value}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAge}`,
    `SameSite=${attributes.sameSite === "lax" ? "Lax" : attributes.sameSite === "strict" ? "Strict" : "None"}`,
  ];
  if (attributes.httpOnly) parts.push("HttpOnly");
  if (attributes.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Set-Cookie value that clears the session cookie. */
export function clearedCookie(): string {
  const { auth, app } = serverEnv();
  return serializeCookie({
    name: auth.cookieName,
    value: "",
    httpOnly: true,
    secure: app.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Read the session token from the current request: Authorization header
 * first (mobile), then the cookie (web).
 */
export async function readRequestToken(): Promise<string | null> {
  const headerList = await headers();
  const bearer = bearerFromHeader(headerList.get("authorization"));
  if (bearer) return bearer;

  const cookieStore = await cookies();
  const { auth } = serverEnv();
  return cookieStore.get(auth.cookieName)?.value ?? null;
}

/**
 * The authenticated user for the current request, or null.
 * Safe to call from server components and route handlers.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const token = await readRequestToken();
  const resolved = await resolveSession(token);
  return resolved?.user ?? null;
}
