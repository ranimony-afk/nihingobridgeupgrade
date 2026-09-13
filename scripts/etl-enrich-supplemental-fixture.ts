/**
 * Test-only runner for the provenance-gated JLPT and pitch adapters.
 *
 * It uses synthetic records against the local JMdict fixture to prove the
 * adapter. Values are source-labelled fixtures, not production content.
 *
 * Run: npx tsx scripts/etl-enrich-supplemental-fixture.ts --allow-fixture-provenance
 */

import "dotenv/config";
import { applySupplementalFeed } from "../etl/enrichment/supplemental-feed";
import { pool } from "../src/db";

const CHECKSUM = "d".repeat(64);
const allowFixtureProvenance = process.argv.includes("--allow-fixture-provenance");

async function main() {
  const shared = {
    sourceUrl: "file://etl/fixtures/supplemental-enrichment-fixture.json",
    sourceVersion: "fixture-v1",
    license: "Synthetic test data — not for publication",
    attribution: "NihongoBridge deterministic enrichment test fixture",
    checksumSha256: CHECKSUM,
    checksumVerified: true,
    isFixture: true,
  } as const;

  const jlpt = await applySupplementalFeed(
    {
      manifest: { ...shared, source: "jlpt" },
      records: [
        { kind: "jlpt", dictionarySourceId: "1000000", level: "N5" },
        { kind: "jlpt", dictionarySourceId: "1000001", level: "N5" },
      ],
    },
    { allowFixtureProvenance },
  );

  const pitch = await applySupplementalFeed(
    {
      manifest: { ...shared, source: "pitch" },
      records: [
        { kind: "pitch", dictionarySourceId: "1000000", reading: "みず", patterns: [1] },
        { kind: "pitch", dictionarySourceId: "1000001", reading: "たべる", patterns: [2] },
      ],
    },
    { allowFixtureProvenance },
  );

  for (const [kind, result] of Object.entries({ jlpt, pitch })) {
    console.log(`${kind}: accepted=${result.accepted} run=${result.importRunId ?? "-"}`);
    console.log(
      `  ${result.reason}; inserted=${result.persisted.inserted} updated=${result.persisted.updated} unchanged=${result.persisted.unchanged}`,
    );
  }

  await pool.end();
  if (!jlpt.accepted || !pitch.accepted) process.exit(1);
}

main().catch(async (error) => {
  console.error("[supplemental-enrichment] FAILED:", error);
  await pool.end().catch(() => {});
  process.exit(1);
});
