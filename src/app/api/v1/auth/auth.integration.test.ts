import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/v1/auth/login/route";
import { POST as register } from "@/app/api/v1/auth/register/route";

describe("authentication REST APIs", () => {
  it("rejects a weak registration password before external email delivery", async () => {
    const response = await register(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Akira", email: "akira@example.com", password: "weak" }),
      }),
    );
    const body = (await response.json()) as { code: string; issues: string[] };

    expect(response.status).toBe(400);
    expect(body.code).toBe("WEAK_PASSWORD");
    expect(body.issues).toContain("too_short");
  });

  it("returns a generic unauthorized response for invalid password sign-in", async () => {
    const response = await login(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "missing@example.com", password: "ValidPassword!42", client: "flutter" }),
      }),
    );
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(401);
    expect(body.code).toBe("INVALID_CREDENTIALS");
  });
});
