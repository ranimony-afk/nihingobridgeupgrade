import { describe, expect, it } from "vitest";
import { calculateSrsTransition } from "@/lib/knowledge/srs";

describe("knowledge SRS scheduler", () => {
  it("creates first and second successful review intervals", () => {
    const first = calculateSrsTransition({ intervalDays: 0, easeFactorBps: 250, repetitions: 0, lapses: 0 }, 5, new Date("2026-01-01T00:00:00Z"));
    const second = calculateSrsTransition(first, 4, new Date("2026-01-02T00:00:00Z"));

    expect(first.intervalDays).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(second.intervalDays).toBe(6);
    expect(second.repetitions).toBe(2);
  });

  it("resets repetition and records a lapse for unsuccessful recall", () => {
    const transition = calculateSrsTransition({ intervalDays: 21, easeFactorBps: 250, repetitions: 5, lapses: 1 }, 1, new Date("2026-01-01T00:00:00Z"));
    expect(transition.repetitions).toBe(0);
    expect(transition.lapses).toBe(2);
    expect(transition.intervalDays).toBe(1);
    expect(transition.easeFactorBps).toBeLessThan(250);
  });
});
