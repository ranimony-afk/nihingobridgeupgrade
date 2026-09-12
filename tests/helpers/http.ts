/**
 * HTTP helpers for API, smoke, and end-to-end assertions.
 *
 * Requests go to the real running server over the network, so they exercise
 * routing, serialization, status codes, and headers exactly as a client would.
 */

import { baseUrl } from "./env.ts";

export interface HttpResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: T;
  text: string;
  /** Round-trip duration in milliseconds. */
  durationMs: number;
}

/** Issue a request and capture status, headers, timing, and parsed body. */
export async function request<T = unknown>(
  pathname: string,
  init?: RequestInit,
): Promise<HttpResult<T>> {
  const url = `${baseUrl()}${pathname}`;
  const startedAt = performance.now();
  const response = await fetch(url, { redirect: "manual", ...init });
  const text = await response.text();
  const durationMs = performance.now() - startedAt;

  let body: unknown = text;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    body: body as T,
    text,
    durationMs,
  };
}

/** GET a path. */
export async function get<T = unknown>(
  pathname: string,
  init?: RequestInit,
): Promise<HttpResult<T>> {
  return request<T>(pathname, init);
}

/** POST JSON to a path. */
export async function postJson<T = unknown>(
  pathname: string,
  body: unknown,
  init?: RequestInit,
): Promise<HttpResult<T>> {
  return request<T>(pathname, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

/**
 * Collect Set-Cookie values into a Cookie header, so a test can act as a
 * browser would across a sequence of requests.
 */
export function cookieHeaderFrom(result: HttpResult): string {
  return result.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .filter((pair): pair is string => Boolean(pair) && !pair.endsWith("="))
    .join("; ");
}

/** Read a single Set-Cookie entry by cookie name. */
export function setCookieEntry(result: HttpResult, name: string): string | null {
  return result.headers.getSetCookie().find((entry) => entry.startsWith(`${name}=`)) ?? null;
}

/** True when the document looks like a server-rendered HTML page. */
export function isHtmlDocument(result: HttpResult): boolean {
  const contentType = result.headers.get("content-type") ?? "";
  return contentType.includes("text/html") && /<html[\s>]/i.test(result.text);
}

/** Extract the text content of the first <title> element, if present. */
export function documentTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.trim() ?? null;
}

/** Strip tags so assertions can look for rendered copy rather than markup. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
