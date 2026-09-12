/**
 * SMOKE — protected routes and pages.
 *
 * The Phase 02.3 deployment gate: unauthenticated access must be rejected.
 *
 * Coverage is deliberately adversarial. It is easy to write a test that signs
 * in and confirms access works; the interesting cases are the ones where an
 * attacker is actively trying to get in without a session.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { cookieHeaderFrom, get, postJson, request } from "../helpers/http.ts";

const PASSWORD = "protected route passphrase 2026";

function freshEmail(tag: string): string {
  return `prot-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Register a learner and return a browser-style Cookie header. */
async function signedInCookie(tag: string): Promise<string> {
  const registered = await postJson("/api/auth/register", {
    email: freshEmail(tag),
    password: PASSWORD,
  });
  assert.equal(registered.status, 201, "setup: registration failed");
  return cookieHeaderFrom(registered);
}

/** Every protected API route, with the method used to reach it. */
const PROTECTED_API = [
  { method: "GET", path: "/api/v2/me/profile" },
  { method: "PATCH", path: "/api/v2/me/profile" },
  { method: "GET", path: "/api/v2/me/preferences" },
  { method: "PATCH", path: "/api/v2/me/preferences" },
  { method: "GET", path: "/api/admin/users" },
] as const;

// ─────────────────────────────────────────────
// Unauthenticated API access
// ─────────────────────────────────────────────

test("smoke: every protected API route rejects an anonymous request with 401", async () => {
  for (const route of PROTECTED_API) {
    const result = await request(route.path, {
      method: route.method,
      headers: { "content-type": "application/json" },
      ...(route.method === "PATCH" ? { body: JSON.stringify({ theme: "dark" }) } : {}),
    });
    assert.equal(
      result.status,
      401,
      `${route.method} ${route.path} returned ${result.status}, expected 401`,
    );
  }
});

test("smoke: rejection uses the frozen error envelope", async () => {
  const result = await get<{ success: boolean; error: { code: string; message: string } }>(
    "/api/v2/me/profile",
  );
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
  assert.ok(result.body.error.message.length > 0);
});

test("smoke: a rejected request returns no user data whatsoever", async () => {
  const result = await get("/api/v2/me/profile");
  const body = result.text.toLowerCase();
  for (const leak of ["@example.test", "timezone", "scrypt", "password", "nb_session"]) {
    assert.equal(body.includes(leak), false, `response leaked "${leak}"`);
  }
});

// ─────────────────────────────────────────────
// Forged and malformed credentials
// ─────────────────────────────────────────────

test("smoke: a forged bearer token is rejected", async () => {
  const result = await get("/api/v2/me/profile", {
    headers: { authorization: `Bearer ${"a".repeat(43)}` },
  });
  assert.equal(result.status, 401);
});

test("smoke: a forged session cookie is rejected", async () => {
  const result = await get("/api/v2/me/profile", {
    headers: { cookie: `nb_session=${"b".repeat(43)}` },
  });
  assert.equal(result.status, 401);
});

test("smoke: malformed authorization headers are rejected", async () => {
  for (const value of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "nonsense", "Bearer ../../etc"]) {
    const result = await get("/api/v2/me/profile", { headers: { authorization: value } });
    assert.equal(result.status, 401, `header "${value}" was not rejected`);
  }
});

test("smoke: a revoked session cannot be replayed", async () => {
  const cookie = await signedInCookie("revoke");

  const before = await get("/api/v2/me/profile", { headers: { cookie } });
  assert.equal(before.status, 200, "should start authorized");

  await postJson("/api/auth/logout", {}, { headers: { cookie } });

  // Opaque database-backed sessions revoke immediately; a JWT would still work.
  const after = await get("/api/v2/me/profile", { headers: { cookie } });
  assert.equal(after.status, 401, "revoked session still granted access");
});

// ─────────────────────────────────────────────
// Header-forgery bypass attempts
// ─────────────────────────────────────────────

test("smoke: middleware-bypass headers do not grant access", async () => {
  // CVE-2025-29927 / GHSA-6gpp-xcg3-4w24 skipped middleware with these headers.
  // Authorization lives in the handler, so skipping middleware changes nothing.
  const bypassHeaders = [
    { "x-middleware-subrequest": "middleware" },
    { "x-middleware-subrequest": "src/middleware" },
    { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" },
  ];

  for (const headers of bypassHeaders) {
    const api = await get("/api/v2/me/profile", { headers });
    assert.equal(api.status, 401, `bypass header granted API access: ${JSON.stringify(headers)}`);

    const page = await get("/dashboard", { headers });
    assert.notEqual(page.status, 200, "bypass header rendered a protected page");
  }
});

test("smoke: forged identity headers are ignored", async () => {
  // Repository B trusted headers like these; this platform must not.
  const result = await get("/api/admin/users", {
    headers: {
      "x-user-id": "usr_fake",
      "x-admin-user-id": "usr_fake",
      "x-admin-role": "super_admin",
      "x-user-roles": "admin,super_admin",
    },
  });
  assert.equal(result.status, 401, "forged identity headers were honoured");
});

// ─────────────────────────────────────────────
// Authenticated access and privilege separation
// ─────────────────────────────────────────────

test("smoke: an authenticated learner can read their own profile", async () => {
  const cookie = await signedInCookie("self");
  const result = await get<{ data: { profile: { timezone: string } } }>("/api/v2/me/profile", {
    headers: { cookie },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.profile.timezone, "UTC");
});

test("smoke: an authenticated learner can update their own preferences", async () => {
  const cookie = await signedInCookie("pref");
  const result = await request<{ data: { preferences: { theme: string } } }>(
    "/api/v2/me/preferences",
    {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ theme: "dark", dailyGoalMinutes: 30 }),
    },
  );
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.data.preferences.theme, "dark");
});

test("smoke: invalid values are rejected even when authenticated", async () => {
  const cookie = await signedInCookie("invalid");
  const result = await request<{ error: { code: string } }>("/api/v2/me/preferences", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ dailyGoalMinutes: 0 }),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "VALIDATION_ERROR");
});

test("smoke: a learner receives 403 — not 401 — on an admin route", async () => {
  const cookie = await signedInCookie("role");
  const result = await get<{ error: { code: string } }>("/api/admin/users", {
    headers: { cookie },
  });
  // 401 would tell the client to sign in again, which would not help.
  assert.equal(result.status, 403, "expected forbidden, not unauthenticated");
  assert.equal(result.body.error.code, "FORBIDDEN");
});

test("smoke: profile responses are marked private and uncacheable", async () => {
  const cookie = await signedInCookie("cache");
  const result = await get("/api/v2/me/profile", { headers: { cookie } });
  const cacheControl = result.headers.get("cache-control") ?? "";
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-store/);
});

// ─────────────────────────────────────────────
// Protected pages
// ─────────────────────────────────────────────

test("smoke: an anonymous browser is redirected away from protected pages", async () => {
  for (const path of ["/dashboard", "/admin"]) {
    const result = await get(path);
    assert.equal(result.status, 307, `${path} returned ${result.status}, expected a redirect`);
    const location = result.headers.get("location") ?? "";
    assert.match(location, /\/login/, `${path} did not redirect to /login`);
  }
});

test("smoke: the redirect preserves the intended destination", async () => {
  const result = await get("/dashboard");
  const location = result.headers.get("location") ?? "";
  assert.match(location, /next=%2Fdashboard/, `lost destination: ${location}`);
});

test("smoke: protected page markup is never sent to an anonymous visitor", async () => {
  const result = await get("/dashboard");
  assert.equal(result.text.includes("Welcome back"), false);
  assert.equal(result.text.includes("Study settings"), false);
});

test("smoke: an authenticated learner can load the dashboard", async () => {
  const cookie = await signedInCookie("page");
  const result = await get("/dashboard", { headers: { cookie } });
  assert.equal(result.status, 200);
  assert.ok(result.text.includes("Welcome back"), "dashboard did not render");
});

test("smoke: a learner sees a 403 view on the admin page, not a login loop", async () => {
  const cookie = await signedInCookie("adminpage");
  const result = await get("/admin", { headers: { cookie } });
  assert.equal(result.status, 200, "should render a page, not redirect");
  assert.ok(result.text.includes("Admin access required"), "expected the forbidden view");
});

test("smoke: the login page does not open-redirect to another origin", async () => {
  for (const hostile of [
    "https://evil.example.com",
    "//evil.example.com",
    "http://evil.example.com/steal",
  ]) {
    const result = await get(`/login?next=${encodeURIComponent(hostile)}`);

    // The real vulnerability would be issuing a redirect to the foreign origin
    // or rendering it as the post-login destination. Next echoes the request
    // URL inside its RSC payload regardless, so asserting the raw string is
    // absent would test the framework's serialisation rather than our guard.
    assert.equal(result.status, 200, `${hostile} produced a redirect`);
    assert.equal(result.headers.get("location"), null, `${hostile} set a Location header`);

    // The guard falls back to the safe default destination.
    assert.ok(result.text.includes("/dashboard"), `${hostile} did not fall back to /dashboard`);
    assert.equal(
      /href=["'][^"']*evil\.example\.com/.test(result.text),
      false,
      `${hostile} was rendered as a link target`,
    );
  }
});

// ─────────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────────

test("smoke: security headers are present on responses", async () => {
  const result = await get("/");
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");
  assert.equal(result.headers.get("x-frame-options"), "DENY");
  assert.match(result.headers.get("referrer-policy") ?? "", /strict-origin/);
});

// ─────────────────────────────────────────────
// Public routes stay public
// ─────────────────────────────────────────────

test("smoke: public routes are unaffected by the guards", async () => {
  const health = await get<{ ok: boolean }>("/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, { ok: true });

  const home = await get("/");
  assert.equal(home.status, 200);

  const session = await get<{ data: { authenticated: boolean } }>("/api/auth/session");
  assert.equal(session.status, 200);
  assert.equal(session.body.data.authenticated, false);
});
