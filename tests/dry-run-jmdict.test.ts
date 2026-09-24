import { describe, expect, it } from "vitest";
import { executeJMdictFullDryRun } from "../scripts/dry-run-jmdict";
import { resolve } from "path";
import { existsSync, writeFileSync } from "fs";

describe("Phase 14.3A-B: JMdict Full-Corpus Dry Run", () => {
  it(
    "executes two independent streaming dry runs across the full 206k+ JMdict corpus with verified idempotency",
    async () => {
      const xmlPath = resolve(process.cwd(), "data/JMdict.xml");
      expect(existsSync(xmlPath)).toBe(true);

      console.log("Starting Full Dry Run 1...");
      const run1 = await executeJMdictFullDryRun(xmlPath, "upstream:jmdict:2023-08");

      console.log("Run 1 complete in", run1.timing.durationMs, "ms");
      console.log("Processed entries:", run1.counts.totalXmlEntries);
      console.log("Accepted canonical:", run1.counts.acceptedCanonical);
      console.log("Duplicates identical:", run1.counts.duplicatesIdentical);
      console.log("Duplicates conflicting:", run1.counts.duplicatesConflicting);

      expect(run1.counts.totalXmlEntries).toBeGreaterThan(200_000);
      expect(run1.counts.acceptedCanonical).toBeGreaterThan(190_000);
      expect(run1.ids.collisions).toBe(0);
      expect(run1.ids.uniqueIds).toBe(run1.counts.acceptedCanonical);
      expect(run1.provenance.mismatchCount).toBe(0);
      expect(run1.provenance.verifiedCount).toBe(run1.counts.acceptedCanonical);
      expect(run1.romaji.failures).toBe(0);

      console.log("Starting Full Dry Run 2 (Idempotency Check)...");
      const run2 = await executeJMdictFullDryRun(xmlPath, "upstream:jmdict:2023-08");
      console.log("Run 2 complete in", run2.timing.durationMs, "ms");

      // Verify Run 1 == Run 2
      expect(run1.counts).toEqual(run2.counts);
      expect(run1.ids).toEqual(run2.ids);
      expect(run1.provenance).toEqual(run2.provenance);
      expect(run1.romaji).toEqual(run2.romaji);
      expect(run1.jlptDistribution).toEqual(run2.jlptDistribution);
      expect(run1.diagnostics.byCode).toEqual(run2.diagnostics.byCode);

      // Save summary JSON for report generation
      writeFileSync(
        resolve(process.cwd(), "reports/gates/jmdict-dry-run-stats.json"),
        JSON.stringify(run1, null, 2)
      );
    },
    180_000 // 3 minutes timeout for 2 full corpus runs
  );
});
