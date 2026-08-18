import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports a healthy database-backed readiness payload", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      ok: boolean;
      status: string;
      checks: { database: string };
      timestamp: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
