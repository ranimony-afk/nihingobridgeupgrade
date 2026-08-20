/**
 * NihongoBridge ETL — Pipeline Orchestrator
 *
 * P25: Full 9-stage ETL pipeline:
 *
 *   Source        — identify and configure the data source
 *     ↓
 *   Raw           — download / locate the raw file
 *     ↓
 *   Parse         — stream raw file into typed records
 *     ↓
 *   Normalize     — transform raw records to canonical schema
 *     ↓
 *   Match         — link entities across domains (sentences↔entries, kanji↔radicals)
 *     ↓
 *   Enrich        — add JLPT, frequency, furigana, etc.
 *     ↓
 *   Validate      — verify every record before write
 *     ↓
 *   Provenance    — stamp source, version, checksum, import metadata
 *     ↓
 *   Postgres      — upsert into database (idempotent, batched)
 *
 * Every concrete pipeline extends this class and implements the abstract
 * stage methods. Stages can be skipped by returning passthrough values.
 */

import { loadConfig, type EtlConfig } from "../config";
import type { SourceRegistration } from "../sources/registry";
import type { ImportRunReport, ValidationError } from "../types";
import { registerSource, recordImportRun } from "../provenance/tracker";
import { closePool } from "../adapters/db";
import type { EnrichmentResult } from "../enrichment/types";

// ─────────────────────────────────────────────
// Stage result types
// ─────────────────────────────────────────────

export interface NormalizeResult<TCanonical> {
  record: TCanonical | null;
  errors: ValidationError[];
}

export interface MatchResult {
  linksCreated: number;
  linksUpdated: number;
  errors: number;
}

export interface ValidateResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface LoadResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface PipelineStageTimings {
  source: number;
  raw: number;
  parse: number;
  normalize: number;
  match: number;
  enrich: number;
  validate: number;
  provenance: number;
  postgres: number;
}

// ─────────────────────────────────────────────
// Abstract Pipeline
// ─────────────────────────────────────────────

export abstract class Pipeline<TRaw, TCanonical> {
  protected config: EtlConfig;
  protected source: SourceRegistration;
  protected report: ImportRunReport;
  protected timings: PipelineStageTimings;

  constructor(source: SourceRegistration) {
    this.config = loadConfig();
    this.source = source;
    this.timings = { source: 0, raw: 0, parse: 0, normalize: 0, match: 0, enrich: 0, validate: 0, provenance: 0, postgres: 0 };
    this.report = {
      runId: `${source.id}-${Date.now()}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceVersion: source.version,
      pipelineVersion: this.config.pipelineVersion,
      status: "failed",
      startedAt: new Date(),
      completedAt: new Date(),
      counts: { parsed: 0, validated: 0, skippedUnchanged: 0, inserted: 0, updated: 0, errors: 0 },
      errors: [],
      durationMs: 0,
    };
  }

  /** Human-readable pipeline name. */
  abstract readonly name: string;

  // ── Stage 1: SOURCE ──
  // Identify and configure the data source. Default uses the SourceRegistration.
  // Override if source selection requires runtime logic.

  // ── Stage 2: RAW ──
  /** Download or locate the raw data file. Returns local file path. */
  protected abstract stageRaw(): Promise<string>;

  // ── Stage 3: PARSE ──
  /** Stream raw file into typed records. Memory-bounded via async generator. */
  protected abstract stageParse(filePath: string): AsyncGenerator<TRaw, void, undefined>;

  // ── Stage 4: NORMALIZE ──
  /** Transform one raw record into canonical schema form with validation. */
  protected abstract stageNormalize(raw: TRaw): NormalizeResult<TCanonical>;

  // ── Stage 5: MATCH ──
  /** Link entities across domains. Runs once after all records are loaded. */
  protected stageMatch(): Promise<MatchResult> {
    // Default: no cross-domain matching. Override in pipeline if needed.
    return Promise.resolve({ linksCreated: 0, linksUpdated: 0, errors: 0 });
  }

  // ── Stage 6: ENRICH ──
  /** Run post-import enrichment. Runs once after matching. */
  protected stageEnrich(): Promise<EnrichmentResult[]> {
    // Default: no enrichment. Override in pipeline to call enrichers.
    return Promise.resolve([]);
  }

  // ── Stage 7: VALIDATE ──
  /** Final validation on a canonical record before database write. */
  protected stageValidate(record: TCanonical): ValidateResult {
    // Default: accept all records that passed normalization.
    void record;
    return { valid: true, errors: [] };
  }

  // ── Stage 8: PROVENANCE ──
  // Handled automatically by the orchestrator. Every record gets source,
  // sourceVersion, importVersion, and checksum stamped during normalization.
  // The source_provenance table is updated at start and end of pipeline.

  // ── Stage 9: POSTGRES ──
  /** Write a batch of validated records to PostgreSQL. Idempotent upsert. */
  protected abstract stagePostgres(batch: TCanonical[]): Promise<LoadResult>;

  // ─────────────────────────────────────────────
  // Orchestrator
  // ─────────────────────────────────────────────

  async run(): Promise<ImportRunReport> {
    const totalStart = Date.now();

    this.printBanner();

    try {
      // ── STAGE 1: SOURCE ──
      let t = Date.now();
      console.log("[1/9] SOURCE — Registering data source…");
      await registerSource(this.source, this.config.pipelineVersion);
      console.log(`       ✓ ${this.source.name} v${this.source.version} (${this.source.license})`);
      this.timings.source = Date.now() - t;

      // ── STAGE 2: RAW ──
      t = Date.now();
      console.log("[2/9] RAW — Acquiring source file…");
      const filePath = await this.stageRaw();
      console.log(`       ✓ ${filePath}`);
      this.timings.raw = Date.now() - t;

      // ── STAGES 3-4-7-9: PARSE → NORMALIZE → VALIDATE → POSTGRES (streaming batch) ──
      t = Date.now();
      console.log("[3/9] PARSE + [4/9] NORMALIZE + [7/9] VALIDATE + [9/9] POSTGRES — Streaming…");
      let batch: TCanonical[] = [];
      let batchNum = 0;

      for await (const raw of this.stageParse(filePath)) {
        this.report.counts.parsed++;

        // Stage 4: Normalize
        const { record, errors: normErrors } = this.stageNormalize(raw);
        if (normErrors.length > 0) {
          this.report.counts.errors += normErrors.length;
          this.collectErrors(normErrors);
        }
        if (!record) continue;

        // Stage 7: Validate
        const { valid, errors: valErrors } = this.stageValidate(record);
        if (valErrors.length > 0) {
          this.report.counts.errors += valErrors.length;
          this.collectErrors(valErrors);
        }
        if (!valid) continue;

        this.report.counts.validated++;
        batch.push(record);

        // Stage 9: Postgres (batched)
        if (batch.length >= this.config.batchSize) {
          const result = await this.stagePostgres(batch);
          this.applyLoadResult(result);
          batch = [];
          batchNum++;
          if (batchNum % 10 === 0) this.logProgress();
        }
      }

      // Flush remaining batch
      if (batch.length > 0) {
        const result = await this.stagePostgres(batch);
        this.applyLoadResult(result);
      }

      this.timings.parse = Date.now() - t; // Combined parse+normalize+validate+load timing

      // ── STAGE 5: MATCH ──
      t = Date.now();
      console.log("[5/9] MATCH — Cross-domain entity linking…");
      const matchResult = await this.stageMatch();
      if (matchResult.linksCreated > 0 || matchResult.errors > 0) {
        console.log(
          `       ✓ ${matchResult.linksCreated} links created, ${matchResult.errors} errors`,
        );
      } else {
        console.log("       ○ No matching configured for this pipeline");
      }
      this.timings.match = Date.now() - t;

      // ── STAGE 6: ENRICH ──
      t = Date.now();
      console.log("[6/9] ENRICH — Post-import enrichment…");
      const enrichResults = await this.stageEnrich();
      if (enrichResults.length > 0) {
        for (const er of enrichResults) {
          console.log(`       ✓ ${er.enricher}: ${er.enriched} enriched (${er.reliability})`);
        }
      } else {
        console.log("       ○ No enrichment configured for this pipeline");
      }
      this.timings.enrich = Date.now() - t;

      // ── STAGE 8: PROVENANCE ──
      t = Date.now();
      console.log("[8/9] PROVENANCE — Recording import run…");
      this.report.status = this.report.counts.errors > 0 ? "partial" : "success";
      this.report.completedAt = new Date();
      this.report.durationMs = Date.now() - totalStart;
      await recordImportRun(this.report);
      console.log(`       ✓ Run ${this.report.runId} recorded`);
      this.timings.provenance = Date.now() - t;

    } catch (err) {
      this.report.status = "failed";
      const message = err instanceof Error ? err.message : String(err);
      this.report.errors.push({
        sourceId: "pipeline",
        field: "execution",
        message: `Pipeline failed: ${message}`,
      });
      console.error(`\n[FATAL] ${message}`);
    } finally {
      this.report.completedAt = new Date();
      this.report.durationMs = Date.now() - totalStart;
      this.printSummary();
      await closePool();
    }

    return this.report;
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private collectErrors(errors: ValidationError[]): void {
    const remaining = this.config.validationErrorSampleLimit - this.report.errors.length;
    if (remaining > 0) {
      this.report.errors.push(...errors.slice(0, remaining));
    }
  }

  private applyLoadResult(result: LoadResult): void {
    this.report.counts.inserted += result.inserted;
    this.report.counts.updated += result.updated;
    this.report.counts.skippedUnchanged += result.skipped;
  }

  private logProgress(): void {
    const c = this.report.counts;
    console.log(
      `       … ${c.parsed} parsed → ${c.validated} valid → ` +
        `${c.inserted} ins / ${c.updated} upd / ${c.skippedUnchanged} skip / ${c.errors} err`,
    );
  }

  private printBanner(): void {
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ${this.name}`);
    console.log(`  Source:   ${this.source.name} v${this.source.version}`);
    console.log(`  License:  ${this.source.license}`);
    console.log(`  Pipeline: v${this.config.pipelineVersion}`);
    console.log(`  Stages:   Source → Raw → Parse → Normalize → Match → Enrich → Validate → Provenance → Postgres`);
    console.log(`${"═".repeat(70)}\n`);
  }

  private printSummary(): void {
    const c = this.report.counts;
    const s = this.report.status.toUpperCase();
    const icon = s === "SUCCESS" ? "✅" : s === "PARTIAL" ? "⚠️" : "❌";

    console.log(`\n${"─".repeat(70)}`);
    console.log(`  ${icon} ${this.name} — ${s}`);
    console.log(`${"─".repeat(70)}`);
    console.log(`  Duration:    ${(this.report.durationMs / 1000).toFixed(1)}s`);
    console.log(`  Parsed:      ${c.parsed}`);
    console.log(`  Validated:   ${c.validated}`);
    console.log(`  Inserted:    ${c.inserted}`);
    console.log(`  Updated:     ${c.updated}`);
    console.log(`  Unchanged:   ${c.skippedUnchanged}`);
    console.log(`  Errors:      ${c.errors}`);

    // Stage timings
    const stages = Object.entries(this.timings).filter(([, ms]) => ms > 0);
    if (stages.length > 0) {
      console.log(`  Stage timings:`);
      for (const [stage, ms] of stages) {
        console.log(`    ${stage.padEnd(12)} ${(ms / 1000).toFixed(2)}s`);
      }
    }

    // Error sample
    if (this.report.errors.length > 0) {
      console.log(`  Error sample (${Math.min(this.report.errors.length, 5)} of ${this.report.counts.errors}):`);
      for (const e of this.report.errors.slice(0, 5)) {
        console.log(`    [${e.sourceId}] ${e.field}: ${e.message}`);
      }
    }

    console.log(`${"─".repeat(70)}\n`);
  }
}
