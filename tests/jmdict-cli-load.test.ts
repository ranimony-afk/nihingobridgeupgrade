/**
 * Process-level CLI load check. The child is plain tsx, not the Vitest alias,
 * and is not given a database URL.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const checkpointPath = resolve(process.cwd(), "data/jmdict-checkpoint.json");
const preservedCheckpoint = resolve(process.cwd(), "data/test-checkpoint.json");
const officialXml = resolve(process.cwd(), "data/JMdict.xml");

function fingerprint(path: string) {
  if (!fs.existsSync(path)) return null;
  const bytes = fs.readFileSync(path);
  return { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

describe("14.3D CLI dry-run load", () => {
  it("loads without the server-only failure and does not use a database", () => {
    const beforeCheckpoint = fingerprint(checkpointPath);
    const beforePreserved = fingerprint(preservedCheckpoint);
    const env: NodeJS.ProcessEnv = { ...process.env, DOTENV_CONFIG_PATH: "/dev/null" };
    delete env.DATABASE_URL;
    delete env.NIHONGO_DB_TARGET_CLASS;
    delete env.NIHONGO_DB_EXPECTED_DATABASE;
    delete env.NIHONGO_DB_EXPECTED_HOST;
    delete env.NIHONGO_DB_READONLY_INSPECTION;
    const result = spawnSync("npx", ["tsx", "scripts/ingest-full-jmdict.ts", "--dry-run"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
      timeout: 120000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.error).toBeUndefined();
    expect(output).not.toMatch(/server-only|Client Component module/);
    expect(output).not.toMatch(/INGESTION_COMPLETE|connected to|postgresql:\/\//i);
    expect(output).toContain("PHASE 14.3D");
    if (!fs.existsSync(officialXml)) {
      expect(result.status).not.toBe(0);
      expect(output).toMatch(/ENOENT|JMdict\.xml/);
    } else {
      expect(result.status).toBe(0);
      expect(output).toContain("DRY_RUN_COMPLETE");
      expect(output).toContain("\"processedCount\": 206717");
      expect(output).toContain("\"checkpointMutated\": false");
      expect(output).not.toMatch(/BATCH_COMMIT|Checkpoint saved/);
    }
    expect(fingerprint(checkpointPath)).toEqual(beforeCheckpoint);
    expect(fingerprint(preservedCheckpoint)).toEqual(beforePreserved);
  }, 120000);
});
