import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger, formatLog } from "../../src/lib/infra/logger.ts";

test("formatLog emits JSON with level and message", () => {
  const line = formatLog("info", "hello", { requestId: "abc" });
  const parsed = JSON.parse(line) as { level: string; msg: string; requestId: string };
  assert.equal(parsed.level, "info");
  assert.equal(parsed.msg, "hello");
  assert.equal(parsed.requestId, "abc");
});

test("logger respects minimum level", () => {
  const lines: string[] = [];
  const log = createLogger("warn", (line) => lines.push(line));
  log.info("skip");
  log.error("keep");
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("keep"));
});
