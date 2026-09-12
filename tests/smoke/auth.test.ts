/**
 * SMOKE — registration / login / session.
 *
 * This is the Phase 02.1 deployment gate. It exercises the full authentication
 * journey against a running server and a real database, for both transports.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { cookieHeaderFrom, get, postJson, setCookieEntry } from "../helpers/http.ts";

/** Unique per run so repeated runs never collide on the email index. */
function freshEmail(tag: string): string {
  return `smoke-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

const PASSWORD = "smoke test passphrase 2026";

interface AuthBody {
  success: boolean;
  data: {
    user: { id: string; email: string; displayName: string; roles: string[] } | null;
    token?: string;
    authenticated?: boolean;
    profile?: { timezone: string; locale: string; visibility: string } | null;
    preferences?: {
      theme: string;
      furiganaMode: string;
      showRomaji: boolean;
      dailyGoalMinutes: number;
    } | null;
  };
}

// ─────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────

test("smoke: registration creates an account and returns the user", async () => {
  const email = freshEmail("reg");
  const result = await postJson<AuthBody>("/api/auth/register", {
    email,
    password: PASSWORD,
    displayName: "Smoke Learner",
  });

  assert.equal(result.status, 201, `expected 201, got ${result.status}: ${result.text}`);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.user?.email, email);
  assert.equal(result.body.data.user?.displayName, "Smoke Learner");
  assert.deepEqual(result.body.data.user?.roles, ["learner"]);
  assert.ok(result.body.data.user?.id);
});

test("smoke: registration sets a hardened session cookie", async () => {
  const result = await postJson("/api/auth/register", {
    email: freshEmail("cookie"),
    password: PASSWORD,
  });

  const cookie = setCookieEntry(result, "nb_session");
  assert.ok(cookie, "no session cookie was set");
  assert.match(cookie, /HttpOnly/i, "cookie must be HttpOnly");
  assert.match(cookie, /SameSite=Lax/i, "cookie must be SameSite=Lax for CSRF defence");
  assert.match(cookie, /Path=\//);
});

test("smoke: a password hash is never returned to the client", async () => {
  const result = await postJson("/api/auth/register", {
    email: freshEmail("leak"),
    password: PASSWORD,
  });
  assert.equal(result.text.includes("scrypt"), false);
  assert.equal(result.text.toLowerCase().includes("passwordhash"), false);
  assert.equal(result.text.includes(PASSWORD), false);
});

test("smoke: duplicate registration is rejected", async () => {
  const email = freshEmail("dupe");
  const first = await postJson("/api/auth/register", { email, password: PASSWORD });
  assert.equal(first.status, 201);

  const second = await postJson<{ error: { code: string } }>("/api/auth/register", {
    email,
    password: PASSWORD,
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, "CONFLICT");
});

test("smoke: a weak password is rejected with guidance", async () => {
  const result = await postJson<{ error: { code: string; details?: unknown[] } }>(
    "/api/auth/register",
    { email: freshEmail("weak"), password: "short" },
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "VALIDATION_ERROR");
  assert.ok((result.body.error.details?.length ?? 0) > 0);
});

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────

test("smoke: login succeeds with correct credentials", async () => {
  const email = freshEmail("login");
  await postJson("/api/auth/register", { email, password: PASSWORD });

  const result = await postJson<AuthBody>("/api/auth/login", { email, password: PASSWORD });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.data.user?.email, email);
  assert.ok(setCookieEntry(result, "nb_session"));
});

test("smoke: login is case-insensitive on email", async () => {
  const email = freshEmail("case");
  await postJson("/api/auth/register", { email, password: PASSWORD });

  const result = await postJson<AuthBody>("/api/auth/login", {
    email: email.toUpperCase(),
    password: PASSWORD,
  });
  assert.equal(result.status, 200, "uppercase email should reach the same account");
});

test("smoke: login fails with a wrong password", async () => {
  const email = freshEmail("badpw");
  await postJson("/api/auth/register", { email, password: PASSWORD });

  const result = await postJson<{ error: { code: string } }>("/api/auth/login", {
    email,
    password: "definitely not the password",
  });
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, "UNAUTHENTICATED");
});

test("smoke: login does not reveal whether an email is registered", async () => {
  const email = freshEmail("enum");
  await postJson("/api/auth/register", { email, password: PASSWORD });

  const wrongPassword = await postJson<{ error: { message: string } }>("/api/auth/login", {
    email,
    password: "wrong password here",
  });
  const unknownEmail = await postJson<{ error: { message: string } }>("/api/auth/login", {
    email: freshEmail("nobody"),
    password: "wrong password here",
  });

  assert.equal(unknownEmail.status, wrongPassword.status);
  assert.equal(unknownEmail.body.error.message, wrongPassword.body.error.message);
});

// ─────────────────────────────────────────────
// Session
// ─────────────────────────────────────────────

test("smoke: an anonymous session request reports not authenticated", async () => {
  const result = await get<AuthBody>("/api/auth/session");
  assert.equal(result.status, 200);
  assert.equal(result.body.data.authenticated, false);
  assert.equal(result.body.data.user, null);
});

test("smoke: a cookie session identifies the user", async () => {
  const email = freshEmail("sess");
  const registered = await postJson("/api/auth/register", {
    email,
    password: PASSWORD,
    displayName: "Session User",
  });

  const result = await get<AuthBody>("/api/auth/session", {
    headers: { cookie: cookieHeaderFrom(registered) },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.authenticated, true);
  assert.equal(result.body.data.user?.email, email);
});

test("smoke: a bearer session identifies the same user", async () => {
  const email = freshEmail("bearer");
  const registered = await postJson<AuthBody>("/api/auth/register", {
    email,
    password: PASSWORD,
    transport: "bearer",
  });

  const token = registered.body.data.token;
  assert.ok(token, "bearer registration must return a token");

  const result = await get<AuthBody>("/api/auth/session", {
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.data.authenticated, true);
  assert.equal(result.body.data.user?.email, email);
});

test("smoke: session responses are never cached", async () => {
  const result = await get("/api/auth/session");
  assert.match(result.headers.get("cache-control") ?? "", /no-store/);
});

test("smoke: a forged token is rejected", async () => {
  const result = await get<AuthBody>("/api/auth/session", {
    headers: { authorization: `Bearer ${"f".repeat(43)}` },
  });
  assert.equal(result.body.data.authenticated, false);
});

// ─────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────

test("smoke: logout revokes the session immediately", async () => {
  const email = freshEmail("logout");
  const registered = await postJson("/api/auth/register", { email, password: PASSWORD });
  const cookie = cookieHeaderFrom(registered);

  const before = await get<AuthBody>("/api/auth/session", { headers: { cookie } });
  assert.equal(before.body.data.authenticated, true, "should start authenticated");

  const loggedOut = await postJson("/api/auth/logout", {}, { headers: { cookie } });
  assert.equal(loggedOut.status, 200);

  // The same token must now be useless — this is what opaque, database-backed
  // sessions buy us over self-contained tokens.
  const after = await get<AuthBody>("/api/auth/session", { headers: { cookie } });
  assert.equal(after.body.data.authenticated, false, "session survived logout");
});

test("smoke: a new account receives a profile and preferences", async () => {
  const email = freshEmail("prov");
  const registered = await postJson("/api/auth/register", { email, password: PASSWORD });

  const session = await get<AuthBody>("/api/auth/session", {
    headers: { cookie: cookieHeaderFrom(registered) },
  });

  // Both rows are created with the account, so a client never has to handle
  // a half-provisioned user.
  assert.ok(session.body.data.profile, "profile missing for a new account");
  assert.ok(session.body.data.preferences, "preferences missing for a new account");
  assert.equal(session.body.data.profile?.timezone, "UTC");
  assert.equal(session.body.data.profile?.visibility, "private");
  assert.equal(session.body.data.preferences?.theme, "system");
  assert.equal(session.body.data.preferences?.furiganaMode, "hover");
  assert.equal(session.body.data.preferences?.showRomaji, false);
  assert.equal(session.body.data.preferences?.dailyGoalMinutes, 15);
});

test("smoke: an anonymous session carries no profile or preferences", async () => {
  const result = await get<AuthBody>("/api/auth/session");
  assert.equal(result.body.data.profile, null);
  assert.equal(result.body.data.preferences, null);
});

test("smoke: full journey — register, login, session, logout", async () => {
  const email = freshEmail("journey");

  const registered = await postJson<AuthBody>("/api/auth/register", { email, password: PASSWORD });
  assert.equal(registered.status, 201, "register");

  const loggedIn = await postJson<AuthBody>("/api/auth/login", { email, password: PASSWORD });
  assert.equal(loggedIn.status, 200, "login");

  const cookie = cookieHeaderFrom(loggedIn);
  const session = await get<AuthBody>("/api/auth/session", { headers: { cookie } });
  assert.equal(session.body.data.authenticated, true, "session");
  assert.equal(session.body.data.user?.email, email);

  const loggedOut = await postJson("/api/auth/logout", {}, { headers: { cookie } });
  assert.equal(loggedOut.status, 200, "logout");

  const final = await get<AuthBody>("/api/auth/session", { headers: { cookie } });
  assert.equal(final.body.data.authenticated, false, "session ended");
});
