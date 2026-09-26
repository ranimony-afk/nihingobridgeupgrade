import { describe, expect, it } from "vitest";
import {
  DictionaryPipeline,
  InMemoryDictionaryPersistenceAdapter,
  DrizzleDictionaryPersistenceAdapter,
  parseJMdictEntryXml,
  parseJMdictXmlString,
  SYNTHETIC_JMDICT_RECORDS,
  SYNTHETIC_JMDICT_XML_FIXTURE,
  transformJMdictEntry,
  kanaToRomaji,
  normalizePosWithDiagnostics,
  extractKanjiCharacters,
  JMDICT_SOURCE_REF,
} from "@/etl/dictionary";

describe("Phase 14.2: Dictionary ETL Foundation", () => {
  describe("1. JMdict XML Parsing Engine", () => {
    it("parses single <entry> XML block into structured raw record", () => {
      const entryXml = `
        <entry>
          <ent_seq>1000010</ent_seq>
          <k_ele>
            <keb>水</keb>
            <ke_pri>ichi1</ke_pri>
            <ke_pri>nf01</ke_pri>
          </k_ele>
          <r_ele>
            <reb>みず</reb>
            <re_pri>ichi1</re_pri>
          </r_ele>
          <sense>
            <pos>&n;</pos>
            <gloss xml:lang="eng">water</gloss>
            <gloss xml:lang="eng">fluid</gloss>
            <s_inf>cool water</s_inf>
          </sense>
        </entry>
      `;

      const parsed = parseJMdictEntryXml(entryXml);
      expect(parsed.entSeq).toBe("1000010");
      expect(parsed.kanji).toHaveLength(1);
      expect(parsed.kanji[0].keb).toBe("水");
      expect(parsed.kanji[0].kePri).toContain("ichi1");
      expect(parsed.readings).toHaveLength(1);
      expect(parsed.readings[0].reb).toBe("みず");
      expect(parsed.senses).toHaveLength(1);
      expect(parsed.senses[0].pos).toContain("n");
      expect(parsed.senses[0].glosses).toEqual([
        { lang: "eng", text: "water" },
        { lang: "eng", text: "fluid" },
      ]);
      expect(parsed.senses[0].sInf).toBe("cool water");
    });

    it("parses multi-entry JMdict XML document stream/string", () => {
      const entries = parseJMdictXmlString(SYNTHETIC_JMDICT_XML_FIXTURE);
      expect(entries.length).toBe(3);
      expect(entries[0].entSeq).toBe("9000001");
      expect(entries[1].entSeq).toBe("9000004"); // kana-only
      expect(entries[2].entSeq).toBe("9000015"); // custom pos
    });
  });

  describe("2. Synthetic Fixture: 15 JMdict Boundary Conditions", () => {
    it("Case 1: handles single orthography and single reading", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[0];
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.id).toBe("de-jmdict-9000001");
      expect(entry.headword).toBe("水");
      expect(entry.reading).toBe("みず");
      expect(entry.romaji).toBe("mizu");
      expect(entry.jlptLevel).toBe("N5");
      expect(entry.isCommon).toBe(true);
      expect(entry.partsOfSpeech).toContain("noun");
    });

    it("Case 2: handles multiple orthographies, designating primary and preserving variants", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[1]; // 引っ越す, 引越す, 引き越す
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.headword).toBe("引っ越す");
      expect(entry.tags).toContain("alt:引越す");
      expect(entry.tags).toContain("alt:引き越す");
      expect(entry.kanjiCharacters).toEqual(expect.arrayContaining(["引", "越"]));
    });

    it("Case 3: handles multiple readings, designating primary and preserving variants", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[2]; // 明日 (あした, あす, みょうにち)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.headword).toBe("明日");
      expect(entry.reading).toBe("あした");
      expect(entry.tags).toContain("alt-reading:あす");
      expect(entry.tags).toContain("alt-reading:みょうにち");
    });

    it("Case 4: handles kana-only entries with no kanji element", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[3]; // きれい
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.headword).toBe("きれい");
      expect(entry.reading).toBe("きれい");
      expect(entry.romaji).toBe("kirei");
      expect(entry.kanjiCharacters).toHaveLength(0);
      expect(entry.tags).toContain("kana-only");
    });

    it("Case 5: captures reading restrictions (re_restr)", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[4]; // 角/隅 (かど, つの, すみ)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.tags).toContain("restr:かど->角");
      expect(entry.tags).toContain("restr:つの->角");
      expect(entry.tags).toContain("restr:すみ->隅");
    });

    it("Case 6: handles multi-sense entries preserving order and glosses", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[5]; // 取る (3 senses)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.senses).toHaveLength(3);
      expect(entry.senses[0].glosses).toContain("to take");
      expect(entry.senses[1].glosses).toContain("to catch (e.g. fish)");
      expect(entry.senses[2].glosses).toContain("to harvest");
    });

    it("Case 7: maps multiple POS tags coexisting on an entry", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[6]; // 勉強 (n, vs)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.partsOfSpeech).toEqual(expect.arrayContaining(["noun", "suru verb"]));
    });

    it("Case 8: extracts field, dialect, and misc tags", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[7]; // 大気 (meteor, uk, ksb)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.tags).toContain("field:meteor");
      expect(entry.tags).toContain("misc:uk");
      expect(entry.tags).toContain("dialect:ksb");
    });

    it("Case 9: preserves multilingual glosses in tags", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[8]; // 猫 (eng, ger, fre)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.senses[0].glosses).toContain("cat");
      expect(entry.tags).toContain("gloss:ger:Katze");
      expect(entry.tags).toContain("gloss:fre:chat");
    });

    it("Case 10: parses priority metadata into commonness and frequency rank", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[9]; // 首相 (news1, spec1, nf02)
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true);
      const entry = result.record!;
      expect(entry.isCommon).toBe(true);
      expect(entry.tags).toContain("common");
      expect(entry.frequencyRank).toBe(1000); // nf02 -> 2 * 500
    });

    it("Case 11 & 12: detects duplicate ent_seq and handles identical vs conflicting duplicates", async () => {
      const recordsWithDuplicates = [
        SYNTHETIC_JMDICT_RECORDS[0], // #9000001
        SYNTHETIC_JMDICT_RECORDS[10], // #9000001 (identical duplicate)
        SYNTHETIC_JMDICT_RECORDS[11], // #9000001 (conflicting duplicate)
      ];

      const report = await DictionaryPipeline.run({
        sourceRecords: recordsWithDuplicates,
        dryRun: true,
      });

      expect(report.sourceRecords).toBe(3);
      expect(report.parsed).toBe(3);
      expect(report.valid).toBe(1); // Only 1 unique entry retained
      expect(report.duplicates).toBe(2);

      // Diagnostic checks
      const diagIdentical = report.diagnostics.find(
        (d) => d.code === "DUPLICATE_IDENTICAL"
      );
      expect(diagIdentical).toBeDefined();

      const diagConflict = report.diagnostics.find(
        (d) => d.code === "DUPLICATE_CONFLICT"
      );
      expect(diagConflict).toBeDefined();
    });

    it("Case 13: rejects malformed entry missing senses", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[12]; // missing senses
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "senses")).toBe(true);
      expect(result.diagnostics.some((d) => d.code === "EMPTY_SENSES")).toBe(true);
    });

    it("Case 14: rejects entry missing ent_seq", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[13]; // missing entSeq
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "entSeq")).toBe(true);
    });

    it("Case 15: safely surfaces unknown POS code as diagnostic warning without crashing", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[14]; // unknown POS "custom-experimental-pos"
      const result = transformJMdictEntry(raw);
      expect(result.isValid).toBe(true); // Entry itself is valid
      const entry = result.record!;
      expect(entry.partsOfSpeech).toContain("custom-experimental-pos");

      const posWarning = result.diagnostics.find(
        (d) => d.code === "UNKNOWN_POS_CODE"
      );
      expect(posWarning).toBeDefined();
      expect(posWarning?.severity).toBe("warning");
    });
  });

  describe("3. Deterministic Dictionary IDs", () => {
    it("strictly follows de-jmdict-${entSeq} pattern", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[0];
      const result = transformJMdictEntry(raw);
      expect(result.record?.id).toBe("de-jmdict-9000001");
    });

    it("produces identical IDs on repeated runs", () => {
      const raw = SYNTHETIC_JMDICT_RECORDS[0];
      const run1 = transformJMdictEntry(raw);
      const run2 = transformJMdictEntry(raw);
      expect(run1.record?.id).toBe(run2.record?.id);
    });
  });

  describe("4. Provenance Integration & Fail-Closed Guard", () => {
    it("stamps verified provenance context from authoritative registry", async () => {
      const report = await DictionaryPipeline.run({
        sourceRecords: [SYNTHETIC_JMDICT_RECORDS[0]],
        sourceId: "upstream:jmdict:2024-07",
        dryRun: true,
      });

      expect(report.sourceId).toBe("upstream:jmdict:2024-07");
      expect(report.sampleRecords[0].sourceRef).toBe("upstream:jmdict:2024-07");
      expect(report.dryRunManifest?.licenseStatus).toBe("verified");
    });

    it("fails closed when an unverified candidate source is specified", async () => {
      await expect(
        DictionaryPipeline.run({
          sourceRecords: [SYNTHETIC_JMDICT_RECORDS[0]],
          sourceId: "candidate:unverified-glosses:2024",
          dryRun: true,
        })
      ).rejects.toThrow(/requires_review|unverified/);
    });

    it("fails closed when an unregistered source is specified", async () => {
      await expect(
        DictionaryPipeline.run({
          sourceRecords: [SYNTHETIC_JMDICT_RECORDS[0]],
          sourceId: "nonexistent:source:v99",
          dryRun: true,
        })
      ).rejects.toThrow(/not registered/);
    });
  });

  describe("5. Dry-Run Mode & Manifest Generation", () => {
    it("fails closed if DrizzleDictionaryPersistenceAdapter is accidentally supplied during dry-run", async () => {
      const drizzleAdapter = new DrizzleDictionaryPersistenceAdapter();
      await expect(
        DictionaryPipeline.run({
          sourceRecords: SYNTHETIC_JMDICT_RECORDS.slice(0, 1),
          adapter: drizzleAdapter,
          dryRun: true,
        })
      ).rejects.toThrow(/Database safety violation/);
    });

    it("executes dry-run pipeline with zero persistence writes", async () => {
      const adapter = new InMemoryDictionaryPersistenceAdapter();
      const report = await DictionaryPipeline.run({
        sourceRecords: SYNTHETIC_JMDICT_RECORDS.slice(0, 5),
        adapter,
        dryRun: true,
      });

      expect(report.isDryRun).toBe(true);
      expect(report.sourceRecords).toBe(5);
      expect(report.valid).toBe(5);
      expect(report.invalid).toBe(0);
      expect(report.dryRunManifest).toBeDefined();
      expect(report.dryRunManifest?.targetTables).toContain("dictionary_entries");

      // Verify ZERO records written to adapter
      expect(await adapter.count()).toBe(0);
    });
  });

  describe("6. Persistence Adapter & Idempotency", () => {
    it("proves complete idempotency on re-run: insert on 1st run, skip on 2nd run", async () => {
      const adapter = new InMemoryDictionaryPersistenceAdapter();
      const cleanRecords = SYNTHETIC_JMDICT_RECORDS.filter(
        (r) => r.entSeq !== "" && r.senses.length > 0
      ).slice(0, 5);

      // Run 1: initial insertion
      const report1 = await DictionaryPipeline.run({
        sourceRecords: cleanRecords,
        adapter,
        dryRun: false,
      });

      expect(report1.inserted).toBe(5);
      expect(report1.updated).toBe(0);
      expect(report1.skipped).toBe(0);
      expect(await adapter.count()).toBe(5);

      // Run 2: re-run identical records
      const report2 = await DictionaryPipeline.run({
        sourceRecords: cleanRecords,
        adapter,
        dryRun: false,
      });

      expect(report2.inserted).toBe(0);
      expect(report2.updated).toBe(0);
      expect(report2.skipped).toBe(5);
      expect(await adapter.count()).toBe(5);
    });

    it("detects and applies updates when records change semantically", async () => {
      const adapter = new InMemoryDictionaryPersistenceAdapter();
      const record = { ...SYNTHETIC_JMDICT_RECORDS[0] };

      // Initial insert
      await DictionaryPipeline.run({
        sourceRecords: [record],
        adapter,
        dryRun: false,
      });

      // Modify sense
      const modifiedRecord = {
        ...record,
        senses: [
          {
            pos: ["n"],
            glosses: [{ lang: "eng", text: "water (updated meaning)" }],
          },
        ],
      };

      // Explicit update policy. The default ingestion policy is abort.
      const report = await DictionaryPipeline.run({
        sourceRecords: [modifiedRecord],
        adapter,
        dryRun: false,
        conflictPolicy: "update",
      });

      expect(report.inserted).toBe(0);
      expect(report.updated).toBe(1);
      expect(report.skipped).toBe(0);

      const existingMap = await adapter.getExistingByIds(["de-jmdict-9000001"]);
      const stored = existingMap.get("de-jmdict-9000001");
      expect(stored?.senses[0].glosses).toContain("water (updated meaning)");
    });
  });

  describe("7. Zero Production Database Contact", () => {
    it("confirms that the entire ETL engine operates in-memory with zero network or database queries", async () => {
      const adapter = new InMemoryDictionaryPersistenceAdapter();
      const report = await DictionaryPipeline.run({
        sourceRecords: SYNTHETIC_JMDICT_RECORDS,
        adapter,
        dryRun: true,
      });

      expect(report.valid).toBeGreaterThan(0);
      expect(report.invalid).toBeGreaterThan(0);
      expect(report.duplicates).toBeGreaterThan(0);
      expect(await adapter.count()).toBe(0);
    });
  });
});
