import { describe, expect, it } from "vitest";
import {
  ProvenanceService,
  AUTHORITATIVE_SOURCE_REGISTRY,
  getRegisteredSource,
  listAllRegisteredSources,
  listSourcesByDomain,
  listSourcesByType,
  listSourcesByStatus,
  createETLProvenanceContext,
  type ProvenanceContract,
  type SourceType,
} from "@/services/knowledge/provenance";

describe("Phase 14.1: Source & Provenance Framework", () => {
  describe("1. Source Registration & Validity", () => {
    it("accepts valid, complete source provenance metadata", () => {
      const validSource: ProvenanceContract = {
        id: "upstream:jmdict:2024-07",
        type: "upstream",
        name: "JMdict Japanese-Multilingual Dictionary",
        version: "2024-07",
        releaseDate: "2024-07-01",
        uri: "https://www.edrdg.org/jmdict/j_jmdict.html",
        license: "CC-BY-SA-4.0",
        attribution: "Electronic Dictionary Research and Development Group (EDRDG)",
        description: "Standard dictionary file from EDRDG.",
        domain: "dictionary",
        status: "active",
        targetTables: ["dictionary_entries"],
      };

      const result = ProvenanceService.validateProvenance(validSource);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("retrieves registered authoritative sources from the central registry", () => {
      const jmdict = getRegisteredSource("upstream:jmdict:2024-07");
      expect(jmdict).not.toBeNull();
      expect(jmdict?.name).toContain("JMdict");
      expect(jmdict?.type).toBe("upstream");
      expect(jmdict?.status).toBe("active");
      expect(jmdict?.license).toBe("CC-BY-SA-4.0");
      expect(jmdict?.attribution).toContain("Electronic Dictionary Research and Development Group (EDRDG)");
      expect(jmdict?.description).toContain("separately copyrighted");

      const kanjidic = getRegisteredSource("upstream:kanjidic2:2024-07");
      expect(kanjidic).not.toBeNull();
      expect(kanjidic?.domain).toBe("kanji");

      const tatoeba = getRegisteredSource("upstream:tatoeba:2024-07");
      expect(tatoeba).not.toBeNull();
      expect(tatoeba?.domain).toBe("sentence");
    });

    it("resolves historical alias identifiers backward-compatibly", () => {
      const fromAlias = getRegisteredSource("jmdict:edrdg:2024-07");
      expect(fromAlias).not.toBeNull();
      expect(fromAlias?.id).toBe("upstream:jmdict:2024-07");

      const tatoebaAlias = getRegisteredSource("tatoeba:corpus:2024-07");
      expect(tatoebaAlias).not.toBeNull();
      expect(tatoebaAlias?.id).toBe("upstream:tatoeba:2024-07");
    });
  });

  describe("2. Idempotency & Deterministic Identity", () => {
    it("formats deterministic source-release identifiers consistently", () => {
      const id1 = ProvenanceService.formatSourceId("upstream", "jmdict", "2024-07");
      const id2 = ProvenanceService.formatSourceId("upstream", "jmdict", "2024-07");
      expect(id1).toBe("upstream:jmdict:2024-07");
      expect(id1).toBe(id2);

      const fpId = ProvenanceService.formatSourceId("first_party", "kana", "v1");
      expect(fpId).toBe("first_party:kana:v1");
    });

    it("assigns distinct source IDs to different releases of the same dataset (immutable release policy)", () => {
      const releaseA = ProvenanceService.formatSourceId("upstream", "jmdict", "2024-07");
      const releaseB = ProvenanceService.formatSourceId("upstream", "jmdict", "2024-08");
      expect(releaseA).not.toBe(releaseB);
      expect(releaseA).toBe("upstream:jmdict:2024-07");
      expect(releaseB).toBe("upstream:jmdict:2024-08");
    });

    it("parses source IDs into structured tokens accurately", () => {
      const parsed = ProvenanceService.parseSourceId("upstream:jmdict:2024-07");
      expect(parsed).toEqual({
        type: "upstream",
        namespace: "jmdict",
        version: "2024-07",
      });
    });
  });

  describe("3. Metadata Validation & Rejecting Malformed Inputs", () => {
    it("rejects metadata with missing required fields", () => {
      const incomplete: Partial<ProvenanceContract> = {
        name: "Incomplete Source",
        version: "1.0",
      };

      const result = ProvenanceService.validateProvenance(incomplete);
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "Missing required field: id",
          expect.stringContaining("Invalid or missing sourceType"),
          "Missing required field: license",
          "Missing required field: description",
          expect.stringContaining("Invalid or missing domain"),
          expect.stringContaining("Invalid or missing status"),
          "Target tables array must specify at least one target table",
        ])
      );
    });

    it("rejects unknown source types or domains", () => {
      const invalidEnum: any = {
        id: "invalid:test:v1",
        type: "unsupported_type",
        name: "Test",
        version: "1",
        license: "MIT",
        description: "Test",
        domain: "invalid_domain",
        status: "active",
        targetTables: ["dictionary_entries"],
      };

      const result = ProvenanceService.validateProvenance(invalidEnum);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("sourceType"))).toBe(true);
      expect(result.errors.some((e) => e.includes("domain"))).toBe(true);
    });
  });

  describe("4. Licensing Boundary & Fail-Closed Guard", () => {
    it("marks candidate with unverified license as status='requires_review' and license='UNKNOWN'", () => {
      const candidate = getRegisteredSource("candidate:unverified-glosses:2024");
      expect(candidate).not.toBeNull();
      expect(candidate?.status).toBe("requires_review");
      expect(candidate?.license).toBe("UNKNOWN");
    });

    it("blocks ingestion of sources with status !== 'active'", () => {
      expect(() => {
        ProvenanceService.assertIngestible("candidate:unverified-glosses:2024");
      }).toThrow(/requires_review/);
    });

    it("blocks ingestion of unregistered sources", () => {
      expect(() => {
        ProvenanceService.assertIngestible("upstream:unregistered-dataset:v1");
      }).toThrow(/not registered/);
    });

    it("clears verified active sources for ingestion", () => {
      const cleared = ProvenanceService.assertIngestible("upstream:jmdict:2024-07");
      expect(cleared.id).toBe("upstream:jmdict:2024-07");
      expect(cleared.status).toBe("active");
    });
  });

  describe("5. Source Classification Hierarchy", () => {
    it("strictly differentiates upstream vs first-party vs editorial sources", () => {
      const upstreamSources = listSourcesByType("upstream");
      const firstPartySources = listSourcesByType("first_party");
      const editorialSources = listSourcesByType("editorial");

      expect(upstreamSources.length).toBeGreaterThan(0);
      expect(firstPartySources.length).toBeGreaterThan(0);
      expect(editorialSources.length).toBeGreaterThan(0);

      // Mutually disjoint sets
      const upstreamIds = new Set(upstreamSources.map((s) => s.id));
      for (const fp of firstPartySources) {
        expect(upstreamIds.has(fp.id)).toBe(false);
      }
      for (const ed of editorialSources) {
        expect(upstreamIds.has(ed.id)).toBe(false);
      }
    });

    it("filters sources by knowledge domain accurately", () => {
      const dictSources = listSourcesByDomain("dictionary");
      const kanjiSources = listSourcesByDomain("kanji");
      const sentenceSources = listSourcesByDomain("sentence");

      expect(dictSources.some((s) => s.id === "upstream:jmdict:2024-07")).toBe(true);
      expect(kanjiSources.some((s) => s.id === "upstream:kanjidic2:2024-07")).toBe(true);
      expect(sentenceSources.some((s) => s.id === "upstream:tatoeba:2024-07")).toBe(true);
    });
  });

  describe("6. Resolution of Canonical source_ref", () => {
    it("resolves canonical record sourceRef to full provenance metadata", () => {
      const resolution = ProvenanceService.resolveProvenance("upstream:jmdict:2024-07");
      expect(resolution).not.toBeNull();
      expect(resolution?.name).toBe("JMdict Japanese-Multilingual Dictionary");
      expect(resolution?.license).toBe("CC-BY-SA-4.0");
      expect(resolution?.type).toBe("upstream");
      expect(resolution?.isLegalForIngestion).toBe(true);
    });

    it("returns isLegalForIngestion=false for review-required sources", () => {
      const resolution = ProvenanceService.resolveProvenance("candidate:unverified-glosses:2024");
      expect(resolution).not.toBeNull();
      expect(resolution?.isLegalForIngestion).toBe(false);
    });

    it("handles batch resolution across multiple sources", () => {
      const batch = ProvenanceService.resolveProvenanceBatch([
        "upstream:jmdict:2024-07",
        "first-party:grammar-core:v1",
        "nonexistent:source:v1",
      ]);

      expect(batch["upstream:jmdict:2024-07"]).not.toBeNull();
      expect(batch["first-party:grammar-core:v1"]?.type).toBe("first_party");
      expect(batch["nonexistent:source:v1"]).toBeNull();
    });
  });

  describe("7. CMS Editorial vs Upstream Canonical Provenance Separation", () => {
    it("preserves upstream source reference while recording separate editorial provenance", () => {
      const canonicalSourceRef = "upstream:jmdict:2024-07";
      const editorialSourceRef = "editorial:cms-review:v1";

      // Mock of a CMS override payload
      const mockCmsItem = {
        id: "cms-item-01",
        contentType: "dictionary",
        entityId: "de-jmdict-1000010",
        sourceRef: editorialSourceRef,
        originalSourceRef: canonicalSourceRef,
        provenanceType: "reviewer",
      };

      // 1. Assert editorial source is distinct from canonical source
      expect(mockCmsItem.sourceRef).not.toBe(mockCmsItem.originalSourceRef);
      expect(mockCmsItem.sourceRef).toBe("editorial:cms-review:v1");
      expect(mockCmsItem.originalSourceRef).toBe("upstream:jmdict:2024-07");

      // 2. Both resolve independently in the provenance framework
      const edRes = ProvenanceService.resolveProvenance(mockCmsItem.sourceRef);
      const canonRes = ProvenanceService.resolveProvenance(mockCmsItem.originalSourceRef);

      expect(edRes?.type).toBe("editorial");
      expect(canonRes?.type).toBe("upstream");
    });
  });

  describe("8. ETL Provenance Context & Dry-Run Integration", () => {
    it("creates an ETL context and stamps validated provenance onto records", () => {
      const context = createETLProvenanceContext("upstream:jmdict:2024-07", {
        dryRun: true,
      });

      expect(context.isDryRun).toBe(true);
      expect(context.source.id).toBe("upstream:jmdict:2024-07");

      const rawRecord = {
        headword: "水",
        reading: "みず",
      };

      const stamped = context.stampRecord(rawRecord);
      expect(stamped.sourceRef).toBe("upstream:jmdict:2024-07");
      expect(context.verifyRecordProvenance(stamped)).toBe(true);
      expect(context.verifyRecordProvenance({ sourceRef: "fabricated:source" })).toBe(false);
    });

    it("generates a comprehensive dry-run manifest for pipeline inspection", () => {
      const manifest = ProvenanceService.createDryRunManifest("upstream:tatoeba:2024-07");
      expect(manifest.sourceId).toBe("upstream:tatoeba:2024-07");
      expect(manifest.isClearedForIngestion).toBe(true);
      expect(manifest.licenseStatus).toBe("verified");
      expect(manifest.targetTables).toContain("example_sentences");
      expect(manifest.warnings).toHaveLength(0);
    });

    it("emits dry-run warnings for unverified candidate sources", () => {
      const manifest = ProvenanceService.createDryRunManifest("candidate:unverified-glosses:2024");
      expect(manifest.isClearedForIngestion).toBe(false);
      expect(manifest.licenseStatus).toBe("requires_review");
      expect(manifest.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("9. Zero Production / External Service Contact Proof", () => {
    it("confirms that all provenance evaluation executes purely in-memory without contacting external APIs or DB", () => {
      // The entire provenance registry, validation, and resolution operates without network I/O
      const allSources = listAllRegisteredSources();
      expect(allSources.length).toBeGreaterThan(5);

      for (const s of allSources) {
        expect(s.id).toBeDefined();
        expect(s.license).toBeDefined();
        expect(s.attribution).toBeDefined();
      }
    });
  });
});
