/**
 * Phase 14.3D-R safety closure. Fixture-only. Does not open data/JMdict.xml,
 * data/test-checkpoint.json, or any network database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { dictionaryEntries } from "@/db/schema";
import {
  DrizzleDictionaryPersistenceAdapter,
  InMemoryDictionaryPersistenceAdapter,
} from "@/etl/dictionary/persistenceAdapter";
import { planPersistence, summarizePlan } from "@/etl/dictionary/persistencePlan";
import {
  assertOfficialEntryCount,
  assertOfficialJmdictHeader,
  assertPinnedJmdictSource,
  EXPECTED_JMDICT_SHA256,
  JMDICT_SOURCE_ID,
} from "@/etl/dictionary/jmdictContract";
import { classifyDatabaseTarget, classifyReadOnlyProductionInspection, READONLY_INSPECTION_CONFIRMATION, deriveTargetIdentityHash } from "@/etl/dictionary/targetClassification";
import { getRegisteredSource } from "@/services/knowledge/provenance";
import {
  CheckpointManager,
  acceptSourceBatch,
  buildPreflightReport,
  commitSourceBatch,
  executeIngestion,
  inspectReadOnlyProduction,
  loadResumeCheckpoint,
  PILOT_BOUNDS,
  parseCliArgs,
  prepareCli,
  readVerifiedRecords,
  releaseVerifiedSource,
  validateEnvironmentSafety,
  verifySourceContract,
  type EnvironmentSafetyResult,
  type IngestionCheckpoint,
  type SourceMetadata,
} from "../scripts/ingest-full-jmdict";

const state = vi.hoisted(() => ({
  database: undefined as unknown,
  client: vi.fn(function Client() { throw new Error("External client forbidden"); }),
}));
vi.mock("pg", () => ({ Client: state.client }));
vi.mock("@/db", () => ({ db: new Proxy({}, {
  get(_target, key) {
    if (!state.database) throw new Error("Database access forbidden outside PGlite test");
    const value = Reflect.get(state.database as object, key);
    return typeof value === "function" ? value.bind(state.database) : value;
  },
}) }));

let directory: string;
let sources: SourceMetadata[];
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const entry = (id: number, gloss: string) =>
  `<entry><ent_seq>${id}</ent_seq><k_ele><keb>水</keb></k_ele><r_ele><reb>みず</reb></r_ele><sense><pos>&n;</pos><gloss>${gloss}</gloss></sense></entry>`;
const xml = (id: number, gloss: string) => `<JMdict>${entry(id, gloss)}</JMdict>`;

beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), "jmdict-safety-"));
  sources = [];
  state.client.mockClear();
  state.database = undefined;
  delete process.env.DATABASE_URL;
  delete process.env.NIHONGO_DB_TARGET_CLASS;
  delete process.env.NIHONGO_DB_EXPECTED_DATABASE;
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const source of sources) releaseVerifiedSource(source);
  fs.rmSync(directory, { recursive: true, force: true });
});

function capture(text: string, name = "source.xml") {
  const path = join(directory, name);
  fs.writeFileSync(path, text);
  const source = verifySourceContract(path, sha(text));
  sources.push(source);
  return source;
}
async function accepted(source: SourceMetadata) {
  const candidates = [];
  for await (const item of readVerifiedRecords(source, true)) {
    if (item.isValid && item.record) candidates.push(item.record);
  }
  return acceptSourceBatch(source, candidates);
}
const progress = {
  recordsProcessed: 1, recordsInserted: 0, recordsSkipped: 0, recordsUpdated: 0,
  recordsConflicted: 0, recordsRejected: 0, warningCount: 0, errorCount: 0,
};
function noIo() {
  const open = vi.spyOn(fs, "openSync");
  const write = vi.spyOn(fs, "writeFileSync");
  return { open, write, assert() {
    expect(open).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(state.client).not.toHaveBeenCalled();
  } };
}

const target = {
  classification: "DISPOSABLE" as const,
  host: "127.0.0.1",
  port: "5432",
  database: "nihongo_test",
  user: "nihongo",
  identityHash: deriveTargetIdentityHash({
    host: "127.0.0.1", port: "5432", database: "nihongo_test", user: "nihongo",
  }),
};
function sourceMeta(hash = EXPECTED_JMDICT_SHA256): SourceMetadata {
  return {
    sourceId: JMDICT_SOURCE_ID,
    releaseVersion: "2023-08-20",
    license: "CC-BY-SA-3.0",
    attribution: "EDRDG",
    xmlPath: join(directory, "absent.xml"),
    xmlSizeBytes: 1,
    xmlSha256: hash,
    expectedEntries: 206717,
    transformationVersion: "jmdict-v1",
    schemaContract: "dictionary_entries",
    deterministicIdStrategy: "de-jmdict-${entSeq}",
  };
}
function checkpoint(overrides: Partial<IngestionCheckpoint> = {}): IngestionCheckpoint {
  return {
    checkpointVersion: 2,
    origin: "ingestion",
    targetIdentity: target,
    sourceId: JMDICT_SOURCE_ID,
    sourceHash: EXPECTED_JMDICT_SHA256,
    releaseVersion: "2023-08-20",
    transformationVersion: "jmdict-v1",
    schemaContract: "dictionary_entries",
    deterministicIdStrategy: "de-jmdict-${entSeq}",
    lastProcessedEntSeq: "100",
    recordsProcessed: 1,
    recordsInserted: 1,
    recordsSkipped: 0,
    recordsUpdated: 0,
    recordsConflicted: 0,
    recordsRejected: 0,
    warningCount: 0,
    errorCount: 0,
    timestamp: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("14.3D-R authorization and CLI", () => {
  it("rejects no-flag and pilot E before any side effect", async () => {
    const io = noIo();
    await expect(executeIngestion({})).rejects.toThrow(/authorize-full-ingestion/);
    await expect(executeIngestion({ pilot: true, pilotStage: "E" })).rejects.toThrow(/Pilot stage E is not full-ingestion/);
    expect(() => prepareCli([])).toThrow(/authorize-full-ingestion/);
    expect(() => prepareCli(["--pilot", "E"])).toThrow(/Pilot stage E is not full-ingestion/);
    io.assert();
  });

  it("does not treat pilot E plus the explicit flag as an implicit bound, and still does not open a source before classification", async () => {
    const open = vi.spyOn(fs, "openSync");
    await expect(executeIngestion({ pilot: true, pilotStage: "E", authorizeFullIngestion: true }))
      .rejects.toThrow(/DATABASE_URL is missing/);
    expect(open).not.toHaveBeenCalled();
    expect(state.client).not.toHaveBeenCalled();
  });

  it("keeps omitted defaults and rejects unknown flags before IO", () => {
    const io = noIo();
    expect(parseCliArgs([])).toEqual({});
    expect(parseCliArgs(["--pilot"])).toEqual({ pilot: true, pilotStage: "B" });
    expect(parseCliArgs(["--pilot", "a", "--batch", "10"])).toEqual({ pilot: true, pilotStage: "A", batchSize: 10 });
    expect(() => parseCliArgs(["--no-such-flag"])).toThrow(/Unknown flag/);
    expect(() => parseCliArgs(["--authorized"])).toThrow(/Unknown flag/);
    expect(() => prepareCli(["--mystery"])).toThrow(/Unknown flag/);
    io.assert();
  });

  it("keeps stages A-D bounded constants", async () => {
    expect(PILOT_BOUNDS).toEqual({ A: 10, B: 100, C: 1000, D: 10000 });
    const open = vi.spyOn(fs, "openSync");
    await expect(executeIngestion({ pilot: true, pilotStage: "A" })).rejects.toThrow(/DATABASE_URL is missing/);
    await expect(executeIngestion({ pilot: true, pilotStage: "D" })).rejects.toThrow(/DATABASE_URL is missing/);
    expect(open).not.toHaveBeenCalled();
  });
});

describe("14.3D-R conflict policy and preflight comparison", () => {
  const row = {
    id: "de-jmdict-1",
    headword: "水",
    reading: "みず",
    romaji: "mizu",
    jlptLevel: "NONE",
    isCommon: false,
    frequencyRank: null,
    partsOfSpeech: ["noun"],
    senses: [{ glosses: ["water"], note: null }],
    kanjiCharacters: ["水"],
    tags: [],
    sourceRef: JMDICT_SOURCE_ID,
  };

  it("plans inserts, identical rows, and payload conflicts", () => {
    const changed = { ...row, senses: [{ glosses: ["changed"], note: null }] };
    const other = { ...row, id: "de-jmdict-2", sourceRef: "first-party:dictionary-core:v1" };
    const fresh = { ...row, id: "de-jmdict-3" };
    const existing = new Map([[row.id, row], [other.id, { ...row, id: other.id }]]);
    const plan = planPersistence([row, changed, other, fresh], existing);
    expect(summarizePlan(plan, "abort")).toEqual({
      expectedInserts: 1, expectedSkips: 1, conflictingIdCount: 2, expectedUpdates: 0,
    });
    expect(summarizePlan(plan, "update").expectedUpdates).toBe(2);
    expect(summarizePlan(planPersistence([fresh], new Map()), "abort").conflictingIdCount).toBe(0);
  });

  it("aborts by default, leaves the row unchanged, and updates only when asked", async () => {
    const adapter = new InMemoryDictionaryPersistenceAdapter();
    await adapter.upsertBatch([row]);
    await expect(adapter.upsertBatch([{ ...row, headword: "changed" }])).rejects.toThrow(/CONFLICT] ABORT/);
    expect((await adapter.getExistingByIds([row.id])).get(row.id)?.headword).toBe("水");
    const updated = await adapter.upsertBatch([{ ...row, headword: "changed" }], { conflictPolicy: "update" });
    expect(updated.updated).toBe(1);
    expect((await adapter.getExistingByIds([row.id])).get(row.id)?.headword).toBe("changed");
    const again = await adapter.upsertBatch([{ ...row, headword: "changed" }]);
    expect(again.skipped).toBe(1);
    expect(again.updated).toBe(0);
  });
});

describe("14.3D-R transactional adapter and preflight", () => {
  it("rolls back a failed batch and aborts a conflicting payload without partial rows", async () => {
    const client = new PGlite();
    const database = drizzle(client);
    state.database = database;
    try {
      await client.exec(`CREATE TABLE dictionary_entries (
        id text PRIMARY KEY, headword text NOT NULL, reading text NOT NULL, romaji text NOT NULL,
        jlpt_level text NOT NULL, is_common boolean NOT NULL, frequency_rank integer,
        parts_of_speech jsonb NOT NULL, senses jsonb NOT NULL, kanji_characters jsonb NOT NULL,
        tags jsonb NOT NULL, source_ref text NOT NULL)`);
      const adapter = new DrizzleDictionaryPersistenceAdapter();
      const source = capture(xml(9000001, "water A"));
      const batch = await accepted(source);
      const inserted = await adapter.upsertBatch(batch.candidates);
      expect(inserted.inserted).toBe(1);
      const path = join(directory, "checkpoint.json");
      fs.writeFileSync(path, "frozen-checkpoint");
      const before = fs.readFileSync(path);
      await expect(adapter.upsertBatch([{
        ...batch.candidates[0],
        id: "de-jmdict-9000099",
        headword: "新規",
      }], { injectFailureAfterWrites: true })).rejects.toThrow(/injected persistence failure/);
      const rows = await database.select().from(dictionaryEntries);
      expect(rows.map((row) => row.id)).toEqual(["de-jmdict-9000001"]);
      expect(fs.readFileSync(path)).toEqual(before);
      await expect(adapter.upsertBatch([{ ...batch.candidates[0], headword: "改変" }])).rejects.toThrow(/CONFLICT] ABORT/);
      expect((await database.select().from(dictionaryEntries))[0].headword).toBe(rows[0].headword);
    } finally {
      await client.close();
    }
  });

  it("reports real preflight conflicts instead of hardcoded zeros", async () => {
    const text = `<JMdict>${entry(1, "same")}${entry(2, "changed")}${entry(3, "new")}</JMdict>`;
    const source = capture(text, "preflight.xml");
    const records = [];
    for await (const item of readVerifiedRecords(source, true)) {
      if (item.record) records.push(item.record);
    }
    const client = new PGlite();
    const database = drizzle(client);
    state.database = database;
    try {
      await client.exec(`CREATE TABLE dictionary_entries (
        id text PRIMARY KEY, headword text NOT NULL, reading text NOT NULL, romaji text NOT NULL,
        jlpt_level text NOT NULL, is_common boolean NOT NULL, frequency_rank integer,
        parts_of_speech jsonb NOT NULL, senses jsonb NOT NULL, kanji_characters jsonb NOT NULL,
        tags jsonb NOT NULL, source_ref text NOT NULL)`);
      await database.insert(dictionaryEntries).values([records[0], { ...records[1], headword: "別" }]);
      const env = { classification: "DISPOSABLE", host: "127.0.0.1", port: "5432", databaseName: "postgres",
        currentUser: "postgres", currentSchema: "public", postgresVersion: "pglite", identityHash: "abc",
        isLoopback: true, serverAddress: null } as EnvironmentSafetyResult;
      const report = await buildPreflightReport(env, source, "abort");
      expect(report.conflictingIdCount).toBe(1);
      expect(report.expectedInserts).toBe(1);
      expect(report.expectedSkips).toBe(1);
      expect(report.expectedUpdates).toBe(0);
      expect(report.isReadOnly).toBe(true);
      const updating = await buildPreflightReport(env, source, "update");
      expect(updating.expectedUpdates).toBe(1);
      expect(updating.conflictingIdCount).toBe(1);
    } finally {
      await client.close();
    }
  });
});

describe("14.3D-R checkpoint, resume, source, and classification", () => {
  it("does not create or modify a checkpoint during dry-run, including failure", async () => {
    const source = capture(xml(9000001, "A"));
    const batch = await accepted(source);
    const missing = join(directory, "missing.json");
    const adapter = { upsertBatch: async () => ({ batchSize: 1, inserted: 1, updated: 0, skipped: 0 }) };
    await commitSourceBatch(source, batch, adapter, true, { path: missing, progress });
    expect(fs.existsSync(missing)).toBe(false);
    const existing = join(directory, "existing.json");
    fs.writeFileSync(existing, "byte-identical");
    const before = fs.readFileSync(existing);
    const failing = { upsertBatch: async () => { throw new Error("dry-run failed"); } };
    await expect(commitSourceBatch(source, batch, failing, true, { path: existing, progress })).rejects.toThrow(/dry-run failed/);
    expect(fs.readFileSync(existing)).toEqual(before);
    const persisted = { upsertBatch: async () => { throw new Error("batch failed"); } };
    await expect(commitSourceBatch(source, batch, persisted, false, { path: existing, progress, targetIdentity: target })).rejects.toThrow(/batch failed/);
    expect(fs.readFileSync(existing)).toEqual(before);
  });

  it("fails closed on missing, corrupt, dry-run, and cross-target checkpoints", () => {
    const source = sourceMeta();
    const missing = join(directory, "nope.json");
    expect(() => loadResumeCheckpoint(missing, source, target)).toThrow(/missing/);
    const corrupt = join(directory, "corrupt.json");
    fs.writeFileSync(corrupt, "{");
    expect(() => CheckpointManager.loadCheckpoint(corrupt)).toThrow(/Corrupt checkpoint/);
    expect(() => loadResumeCheckpoint(corrupt, source, target)).toThrow(/Corrupt checkpoint/);
    const path = join(directory, "cp.json");
    fs.writeFileSync(path, JSON.stringify(checkpoint({ origin: undefined, checkpointVersion: 1 })));
    expect(() => loadResumeCheckpoint(path, source, target)).toThrow(/incompatible|origin/);
    fs.writeFileSync(path, JSON.stringify(checkpoint({
      targetIdentity: { ...target, database: "other", identityHash: "different" },
    })));
    expect(() => loadResumeCheckpoint(path, source, target)).toThrow(/target identity mismatch/);
    fs.writeFileSync(path, JSON.stringify(checkpoint({ sourceHash: "f".repeat(64) })));
    expect(() => loadResumeCheckpoint(path, source, target)).toThrow(/sourceHash mismatch/);
    fs.writeFileSync(path, JSON.stringify(checkpoint()));
    expect(loadResumeCheckpoint(path, source, target).lastProcessedEntSeq).toBe("100");
  });

  it("verifies fixture bytes and refuses an unpinned or misdated release without claiming the official file is present", () => {
    const text = xml(9000001, "A");
    const path = join(directory, "fixture.xml");
    fs.writeFileSync(path, text);
    expect(() => verifySourceContract(path, "0".repeat(64))).toThrow(/SOURCE HASH MISMATCH/);
    const source = verifySourceContract(path, sha(text));
    sources.push(source);
    expect(source.xmlSha256).toBe(sha(text));
    expect(source.xmlSha256).not.toBe(EXPECTED_JMDICT_SHA256);
    expect(() => assertPinnedJmdictSource("upstream:jmdict:2024-07")).toThrow(/2024-07/);
    expect(() => assertOfficialJmdictHeader("<!-- JMdict created: 2024-07-01 -->")).toThrow(/SOURCE RELEASE MISMATCH/);
    expect(() => assertOfficialJmdictHeader("<!-- JMdict created: 2023-08-20 -->")).not.toThrow();
    expect(() => assertOfficialEntryCount(1)).toThrow(/SOURCE COUNT MISMATCH/);
    expect(() => assertOfficialEntryCount(206717)).not.toThrow();
    expect(getRegisteredSource(JMDICT_SOURCE_ID)?.contentHash).toBe(EXPECTED_JMDICT_SHA256);
    const official = join(process.cwd(), "data/JMdict.xml");
    if (fs.existsSync(official)) {
      expect(fs.statSync(official).size).toBe(115331197);
    }
  });

  it("rejects unknown, forbidden, loopback-only, and production targets before connecting", async () => {
    const forbidden = "postgresql://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
    await expect(validateEnvironmentSafety(forbidden)).rejects.toThrow(/TARGET DATABASE FORBIDDEN/);
    await expect(validateEnvironmentSafety("postgresql://user:pass@192.168.1.100:5432/production_db"))
      .rejects.toThrow(/TARGET DATABASE AMBIGUOUS/);
    await expect(validateEnvironmentSafety("postgresql://nihongo:secret@127.0.0.1:5432/nihongo_test"))
      .rejects.toThrow(/loopback is not authorization/);
    await expect(validateEnvironmentSafety("postgresql://nihongo:secret@127.0.0.1:5432/nihongo_test", {
      declaredClass: "disposable",
      expectedDatabase: "other",
    })).rejects.toThrow(/EXPECTED_DATABASE/);
    await expect(validateEnvironmentSafety("postgresql://nihongo:secret@db.example.com:5432/prod", {
      declaredClass: "production",
      authorizeProduction: true,
    })).rejects.toThrow(/PRODUCTION CONTACT REFUSED/);
    expect(state.client).not.toHaveBeenCalled();
    expect(classifyDatabaseTarget({
      connectionString: "postgresql://u@notsupabase.co:5432/db",
    }).classification).toBe("AMBIGUOUS");
    expect(classifyDatabaseTarget({
      connectionString: "postgresql://u@pooler.supabase.com.example:5432/db",
    }).classification).toBe("AMBIGUOUS");
    expect(classifyDatabaseTarget({
      connectionString: "postgresql://u:secret@127.0.0.1:5432/nihongo_test",
      declaredClass: "disposable",
      expectedDatabase: "nihongo_test",
    }).decision).toBe("ALLOW");
  });

  it("allows only an explicitly named read-only production inspection and still refuses writes", async () => {
    const url = "postgresql://postgres:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
    const named = {
      connectionString: url,
      declaredClass: "PRODUCTION",
      expectedDatabase: "postgres",
      expectedHost: "aws-0-ap-northeast-1.pooler.supabase.com",
      readOnlyConfirmation: READONLY_INSPECTION_CONFIRMATION,
    };
    const inspected = classifyReadOnlyProductionInspection(named);
    expect(inspected.decision).toBe("ALLOW_READONLY");
    expect(inspected.classification).toBe("PRODUCTION");
    expect(inspected.decision).not.toBe("ALLOW");
    expect(classifyReadOnlyProductionInspection({ ...named, readOnlyConfirmation: "PRODUCTION" }).decision).toBe("REJECT");
    expect(classifyReadOnlyProductionInspection({ ...named, expectedHost: "db.example.com" }).decision).toBe("REJECT");
    expect(classifyReadOnlyProductionInspection({ ...named, expectedDatabase: "other" }).decision).toBe("REJECT");
    expect(classifyDatabaseTarget({
      connectionString: url,
      declaredClass: "PRODUCTION",
      expectedDatabase: "postgres",
      expectedHost: "aws-0-ap-northeast-1.pooler.supabase.com",
      authorizeProduction: true,
    }).decision).toBe("REJECT");
    await expect(validateEnvironmentSafety(url, { declaredClass: "production", authorizeProduction: true }))
      .rejects.toThrow(/FORBIDDEN|PRODUCTION CONTACT REFUSED/);
    await expect(inspectReadOnlyProduction({ ...named, readOnlyConfirmation: "PRODUCTION" }))
      .rejects.toThrow(/READONLY\] STOP/);
    expect(state.client).not.toHaveBeenCalled();
  });
});
