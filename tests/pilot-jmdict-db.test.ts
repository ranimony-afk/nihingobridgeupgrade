/**
 * Phase 14.3C — Controlled JMdict PostgreSQL Database Pilot Integration Tests
 *
 * Verifies that the production ETL path and Drizzle persistence adapter safely
 * persist a representative ~100-record pilot dataset into a disposable PostgreSQL
 * instance with verified idempotency, conflict, rollback, constraint, read-back,
 * and isolation guarantees.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { runControlledPilot, type PilotVerificationResults } from "../scripts/pilot-jmdict-db";

describe("Phase 14.3C: Controlled JMdict PostgreSQL Database Pilot", () => {
  let results: PilotVerificationResults;

  beforeAll(async () => {
    results = await runControlledPilot();
  }, 120_000);

  describe("Step 2: Database Safety & Disposable Target Probe", () => {
    it("proves target is a local loopback database and not production", () => {
      expect(results.safetyProbe.isLoopback).toBe(true);
      expect(results.safetyProbe.isProductionForbidden).toBe(false);
      expect(results.safetyProbe.host).not.toContain("supabase.com");
      expect(results.safetyProbe.host).not.toContain("aws-0-ap-northeast-1");
      expect(results.safetyProbe.classification).toBe("disposable-local-loopback");
    });

    it("verifies disposable database metadata", () => {
      expect(results.safetyProbe.currentUser).toBe("postgres");
      expect(results.safetyProbe.currentSchema).toBe("public");
      expect(results.safetyProbe.postgresVersion).toContain("PostgreSQL");
    });
  });

  describe("Step 3 & 4: Provenance Registration", () => {
    it("registers upstream:jmdict:2023-08 provenance in knowledge_sources", () => {
      expect(results.provenance.registeredId).toBe("upstream:jmdict:2023-08");
      expect(results.provenance.version).toBe("2023-08");
      expect(results.provenance.license).toBe("CC-BY-SA-3.0");
    });
  });

  describe("Step 5: Representative 100-Record Dataset Diversity", () => {
    it("exercises all 9 linguistic and structural dimensions in the pilot dataset", () => {
      expect(results.datasetMetrics.totalRecords).toBe(100);
      expect(results.datasetMetrics.kanjiKanaCount).toBeGreaterThan(40);
      expect(results.datasetMetrics.kanaOnlyCount).toBeGreaterThan(40);
      expect(results.datasetMetrics.multiReadingsCount).toBeGreaterThan(30);
      expect(results.datasetMetrics.readingRestrictionsCount).toBeGreaterThan(0);
      expect(results.datasetMetrics.multiSensesCount).toBeGreaterThan(50);
      expect(results.datasetMetrics.uniquePosCodesCount).toBeGreaterThan(20);
      expect(results.datasetMetrics.longVowelsCount).toBeGreaterThan(0);
      expect(results.datasetMetrics.classicalPosEntriesCount).toBeGreaterThan(0);
    });
  });

  describe("Step 6: Production ETL Ingestion & Database Reconciliation", () => {
    it("inserts all 100 records on Run 1 using real production ETL path", () => {
      expect(results.run1Persistence.inserted).toBe(100);
      expect(results.run1Persistence.updated).toBe(0);
      expect(results.run1Persistence.skipped).toBe(0);
    });

    it("reconciles database records with 0 missing, 0 unexpected, and 0 field mismatches", () => {
      expect(results.reconciliation.matchedRecords).toBe(100);
      expect(results.reconciliation.missingRecords).toBe(0);
      expect(results.reconciliation.unexpectedRecords).toBe(0);
      expect(results.reconciliation.fieldMismatches).toBe(0);
    });
  });

  describe("Step 7: Two-Run Persistence Idempotency", () => {
    it("skips 100% of records on Run 2 with zero row count drift", () => {
      expect(results.idempotencyRun2.inserted).toBe(0);
      expect(results.idempotencyRun2.updated).toBe(0);
      expect(results.idempotencyRun2.skipped).toBe(100);
      expect(results.idempotencyRun2.rowCountRun1).toBe(100);
      expect(results.idempotencyRun2.rowCountRun2).toBe(100);
      expect(results.idempotencyRun2.isIdempotent).toBe(true);
    });
  });

  describe("Step 8: Conflict / Update Handling", () => {
    it("updates mutated entry correctly and restores original baseline", () => {
      expect(results.conflictUpdateTest.updatedCount).toBe(1);
      expect(results.conflictUpdateTest.verifiedUpdatedValue).toBe(true);
      expect(results.conflictUpdateTest.revertedCount).toBe(1);
      expect(results.conflictUpdateTest.verifiedRevertedValue).toBe(true);
    });
  });

  describe("Step 9: Transaction Rollback & Atomicity", () => {
    it("rolls back failed transaction cleanly with zero partial writes", () => {
      expect(results.transactionRollbackTest.rollbackSuccessful).toBe(true);
      expect(results.transactionRollbackTest.preRollbackCount).toBe(100);
      expect(results.transactionRollbackTest.postRollbackCount).toBe(100);
      expect(results.transactionRollbackTest.zeroPartialWrites).toBe(true);
    });
  });

  describe("Step 10: Existing Constraint Enforcements", () => {
    it("enforces primary key uniqueness and NOT NULL constraints", () => {
      expect(results.constraintsTest.duplicatePkBlocked).toBe(true);
      expect(results.constraintsTest.notNullConstraintEnforced).toBe(true);
    });
  });

  describe("Step 11: Application Read-Back via DictionaryService", () => {
    it("successfully retrieves entry by ID, multi-script search, and links provenance", () => {
      expect(results.readBackTest.directIdLookup).toBe(true);
      expect(results.readBackTest.japaneseSearch).toBe(true);
      expect(results.readBackTest.readingSearch).toBe(true);
      expect(results.readBackTest.romajiSearch).toBe(true);
      expect(results.readBackTest.englishSearch).toBe(true);
      expect(results.readBackTest.provenanceLinked).toBe(true);
    });
  });

  describe("Step 12: Knowledge Layer & CMS Isolation", () => {
    it("guarantees 0 CMS records touched and multilingual translation isolation", () => {
      expect(results.isolationTest.cmsIsolated).toBe(true);
      expect(results.isolationTest.translationsIsolated).toBe(true);
    });
  });
});
