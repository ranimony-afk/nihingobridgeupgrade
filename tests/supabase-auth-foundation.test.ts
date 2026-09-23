/**
 * Phase 13.4C-1 — Supabase Auth foundation tests.
 *
 * The identity adapter is exercised through injected canned clients (the
 * `setSupabaseClientFactory` seam). No Supabase project is contacted, no
 * credentials exist in this repo, and the static checks prove no
 * caller-supplied value can reach the trust decision.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import type { ClaimsCapableClient } from "@/lib/auth";
import {
  getAuthenticatedIdentity,
  normalizeSupabaseIdentity,
  resetSupabaseClientFactory,
  setSupabaseClientFactory,
} from "@/lib/auth";

function cannedClient(
  result:
    | { data: { claims: unknown }; error: null }
    | { data: null; error: { message: string } }
    | { data: unknown; error: null }
): ClaimsCapableClient {
  return {
    auth: {
      getClaims: async () => result,
    },
  };
}

const VALID_CLAIMS = {
  sub: "provider-subject-123",
  email: "editor@example.com",
  user_metadata: { display_name: "Edi Tor" },
};

beforeEach(() => {
  resetSupabaseClientFactory();
});

afterEach(() => {
  resetSupabaseClientFactory();
});

describe("Phase 13.4C-1: Supabase Auth foundation", () => {
  it("1. unauthenticated request resolves to null", async () => {
    setSupabaseClientFactory(() =>
      cannedClient({ data: null, error: { message: "Auth session missing!" } })
    );
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("2. valid authenticated identity normalizes provider + subject", async () => {
    setSupabaseClientFactory(() =>
      cannedClient({ data: { claims: VALID_CLAIMS }, error: null })
    );
    await expect(getAuthenticatedIdentity()).resolves.toEqual({
      provider: "supabase",
      subject: "provider-subject-123",
      email: "editor@example.com",
      displayName: "Edi Tor",
    });
  });

  it("3. invalid/expired session resolves to null", async () => {
    setSupabaseClientFactory(() =>
      cannedClient({ data: null, error: { message: "invalid JWT: expired" } })
    );
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    // Null claims without an error are equally unauthenticated.
    setSupabaseClientFactory(() =>
      cannedClient({ data: { claims: null }, error: null })
    );
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("4. malformed provider responses resolve to null", async () => {
    for (const claims of [
      null,
      undefined,
      "not-an-object",
      42,
      [],
      {},
      { sub: "" },
      { sub: 123 },
      { email: "no-sub@example.com" },
    ]) {
      expect(normalizeSupabaseIdentity(claims)).toBeNull();
      setSupabaseClientFactory(() =>
        cannedClient({ data: { claims }, error: null })
      );
      await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    }
    // Malformed envelope (data not an object) also fails closed.
    setSupabaseClientFactory(() =>
      cannedClient({ data: "garbage", error: null })
    );
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("5. identity carries a stable subject", async () => {
    setSupabaseClientFactory(() =>
      cannedClient({ data: { claims: VALID_CLAIMS }, error: null })
    );
    const first = await getAuthenticatedIdentity();
    const second = await getAuthenticatedIdentity();
    expect(first).toEqual(second);
    expect(first?.subject).toBe("provider-subject-123");

    setSupabaseClientFactory(() =>
      cannedClient({
        data: { claims: { ...VALID_CLAIMS, sub: "different-subject" } },
        error: null,
      })
    );
    const third = await getAuthenticatedIdentity();
    expect(third?.subject).toBe("different-subject");
  });

  it("6. identity contains no CMS role", async () => {
    setSupabaseClientFactory(() =>
      cannedClient({ data: { claims: VALID_CLAIMS }, error: null })
    );
    const identity = (await getAuthenticatedIdentity()) as unknown as Record<
      string,
      unknown
    >;
    expect(identity).toBeTruthy();
    for (const forbidden of ["role", "cmsRole", "permissions", "isAdmin"]) {
      expect(forbidden in identity, `must not contain ${forbidden}`).toBe(
        false
      );
    }
    expect(Object.keys(identity).sort()).toEqual(
      ["displayName", "email", "provider", "subject"].sort()
    );
  });

  it("7. caller cannot supply an alternate identity (zero-arg boundary)", () => {
    expect(getAuthenticatedIdentity.length).toBe(0);
  });

  it("8+9. no request-body userId or role is consulted (static proof)", () => {
    const sources = [
      "src/lib/auth/identity.ts",
      "src/lib/auth/supabase/client.ts",
      "src/lib/auth/supabase/server.ts",
      "src/lib/auth/supabase/proxy.ts",
      "src/app/auth/callback/route.ts",
    ].map((file) => ({ file, text: readFileSync(file, "utf8") }));
    for (const { file, text } of sources) {
      expect(
        text,
        `${file} must not read request bodies/params for identity`
      ).not.toMatch(
        /request\.json|searchParams\.get\("userId"|body\.userId|body\.role/
      );
      expect(
        text,
        `${file} must not trust identity headers`
      ).not.toMatch(/x-user-id|x-role/i);
    }
    // The callback reads only the PKCE code + redirect target, never identity.
    const callback = sources.find((s) =>
      s.file.endsWith("callback/route.ts")
    )!.text;
    expect(callback).toContain('searchParams.get("code")');
  });

  it("display names fall back safely and ignore non-strings", () => {
    expect(
      normalizeSupabaseIdentity({
        sub: "s",
        user_metadata: { full_name: "Full Name" },
      })
    ).toMatchObject({ displayName: "Full Name" });
    expect(
      normalizeSupabaseIdentity({
        sub: "s",
        email: 42,
        user_metadata: { display_name: ["not", "a", "string"] },
      })
    ).toEqual({ provider: "supabase", subject: "s" });
    expect(
      normalizeSupabaseIdentity({ sub: "s", user_metadata: "nope" })
    ).toEqual({ provider: "supabase", subject: "s" });
  });

  it("provider exceptions fail closed to null", async () => {
    setSupabaseClientFactory(() => {
      throw new Error("network down");
    });
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    setSupabaseClientFactory(() => ({
      auth: {
        getClaims: async () => {
          throw new Error("auth server down");
        },
      },
    }));
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it("missing Supabase configuration resolves to null (dev-safe)", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    try {
      // Default factory (no override): must not throw, must not touch
      // cookie scope — plain unauthenticated.
      await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    } finally {
      if (url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      if (key !== undefined)
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    }
  });

  it("server/client modules respect their secrecy boundaries (static proof)", () => {
    const identity = readFileSync("src/lib/auth/identity.ts", "utf8");
    const server = readFileSync("src/lib/auth/supabase/server.ts", "utf8");
    const client = readFileSync("src/lib/auth/supabase/client.ts", "utf8");
    expect(identity).toContain("server-only");
    expect(server).toContain("server-only");
    for (const [name, text] of [
      ["identity.ts", identity],
      ["server.ts", server],
      ["client.ts", client],
    ] as const) {
      expect(text, `${name} must not mention a service-role key`).not.toMatch(
        /service[_-]?role/i
      );
    }
    // getSession() must never decide identity anywhere in the foundation.
    for (const [name, text] of [
      ["identity.ts", identity],
      ["proxy.ts", readFileSync("src/lib/auth/supabase/proxy.ts", "utf8")],
    ] as const) {
      expect(text, `${name} must not call getSession()`).not.toContain(
        "getSession()"
      );
    }
  });
});
