import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { dictionaryEntries } from "@/db/schema";
import { DrizzleDictionaryPersistenceAdapter } from "@/etl/dictionary/persistenceAdapter";
import {
  verifySourceContract, releaseVerifiedSource, openVerifiedSourceStream, readVerifiedRecords,
  acceptSourceBatch, commitSourceBatch, CheckpointManager, validateIngestionOptions,
  executeIngestion, runPreflight, validateEnvironmentSafety, parseCliArgs,
  type SourceMetadata,
} from "../scripts/ingest-full-jmdict";

const state = vi.hoisted(() => ({
  database: undefined as unknown,
  client: vi.fn(function () { throw new Error("External client forbidden in focused tests"); }),
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
beforeEach(() => {
  directory = fs.mkdtempSync(join(tmpdir(), "jmdict-f4-f7-test-"));
  sources = [];
  state.client.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const source of sources) releaseVerifiedSource(source);
  fs.rmSync(directory, { recursive: true, force: true });
  state.database = undefined;
});
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const xml = (id: number, gloss: string) => `<JMdict><entry><ent_seq>${id}</ent_seq><k_ele><keb>水</keb></k_ele><r_ele><reb>みず</reb></r_ele><sense><pos>&n;</pos><s_inf>source note</s_inf><gloss>${gloss}</gloss></sense></entry></JMdict>`;
function capture(text: string, name = "source.xml") {
  const path = join(directory, name);
  fs.writeFileSync(path, text);
  const source = verifySourceContract(path, sha(text));
  sources.push(source);
  return source;
}
async function batch(source: SourceMetadata) {
  const candidates = [];
  for await (const item of readVerifiedRecords(source)) {
    if (item.isValid && item.record) candidates.push(item.record);
  }
  return acceptSourceBatch(source, candidates);
}
const progress = {
  recordsProcessed: 1, recordsInserted: 0, recordsSkipped: 0, recordsUpdated: 0,
  recordsConflicted: 0, recordsRejected: 0, warningCount: 0, errorCount: 0,
};

function sideEffects() {
  return [vi.spyOn(fs, "existsSync"), vi.spyOn(fs, "openSync"), vi.spyOn(fs, "readFileSync"), vi.spyOn(fs, "mkdtempSync")];
}
function noEffects(spies: ReturnType<typeof sideEffects>) {
  for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  expect(state.client).not.toHaveBeenCalled();
}

describe("F4: existing public inputs reject before side effects", () => {
  it("keeps omitted defaults and valid explicit configuration", () => {
    expect(validateIngestionOptions({})).toEqual({});
    expect(validateIngestionOptions({ dryRun: true, pilot: true, pilotStage: "B", batchSize: 1000 }))
      .toEqual({ dryRun: true, pilot: true, pilotStage: "B", batchSize: 1000 });
    const open = vi.spyOn(fs, "openSync").mockImplementation(() => { throw new Error("default reached"); });
    expect(() => verifySourceContract()).toThrow("default reached");
    expect(open).toHaveBeenCalledWith(resolve("data/JMdict.xml"), "r");
  });
  it("keeps omitted CLI defaults and rejects explicit malformed CLI stage/batch values", () => {
    expect(parseCliArgs([])).toEqual({});
    expect(parseCliArgs(["--pilot"])).toEqual({ pilot: true, pilotStage: "B" });
    expect(parseCliArgs(["--pilot", "a", "--batch", "10"])).toEqual({ pilot: true, pilotStage: "A", batchSize: 10 });
    for (const args of [["--pilot", "invalid"], ["--pilot", ""], ["--batch", ""], ["--batch", "bad"], ["--batch", "0"], ["--batch"]]) {
      expect(() => parseCliArgs(args)).toThrow(/Invalid/);
    }
  });
  const invalid = [
    ...[null, "", 0, -1, 1.5, "100", NaN, Infinity, undefined].map(batchSize => ({ batchSize })),
    ...[null, "", "invalid", false, undefined].map(pilotStage => ({ pilot: true, pilotStage })),
    ...[null, "", 0, undefined].map(preflightOnly => ({ preflightOnly })),
    { dryRun: null }, { resume: 0 }, { conflictPolicy: "ignore" }, { checkpointPath: "" },
    { ingestion: null }, { xmlPath: null }, { connectionString: null },
    null, [], "", new Date(), Object.create({ dryRun: true }),
    Object.defineProperty({}, "batchSize", { get() { throw new Error("accessor read"); } }),
  ];
  it.each(invalid.map(value => [value]))("rejects malformed execution options %j", async value => {
    const spies = sideEffects();
    await expect(executeIngestion(value as never)).rejects.toThrow(/Invalid/);
    noEffects(spies);
  });
  it.each([null, "", false, 0, {}, []].map(value => [value]))("rejects invalid source %j", value => {
    const spies = sideEffects();
    expect(() => verifySourceContract(value as never)).toThrow(/Invalid xmlPath/);
    noEffects(spies);
  });
  it.each([null, "", false, 0, {}, []].map(value => [value]))("rejects invalid connection %j", async value => {
    const spies = sideEffects();
    await expect(validateEnvironmentSafety(value as never)).rejects.toThrow(/Invalid connStr/);
    noEffects(spies);
  });
  it.each([null, [], "", false, { xmlPath: null }, { xmlPath: "" }, { xmlPath: 2 },
    { connStr: null }, { connStr: "" }, { ingestion: null }, { connStr: undefined }, { xmlPath: undefined }]
    .map(value => [value]))("rejects preflight wrapper %j", async value => {
    const spies = sideEffects();
    await expect(runPreflight(value as never)).rejects.toThrow(/Invalid/);
    noEffects(spies);
  });
});

describe("F7: retained bytes, immutable accepted batches and real local persistence", () => {
  it.each(["replacement", "rewrite"])("commits A/checkpoint A after pathname %s and rejects B substitution", async mode => {
    const a = xml(9000001, "water A");
    const b = xml(9000002, "water B");
    const source = capture(a);
    if (mode === "replacement") {
      fs.renameSync(source.xmlPath, join(directory, "original.xml"));
    }
    fs.writeFileSync(source.xmlPath, b);
    const sourceB = capture(b, "b.xml");
    const open = vi.spyOn(fs, "openSync");
    const batchA = await batch(source);
    const batchB = await batch(sourceB);
    expect(open).not.toHaveBeenCalled(); // neither parser reopens any pathname
    open.mockRestore();
    expect(batchA.candidates[0].senses[0].glosses).toContain("water A");
    expect(() => {
      // @ts-expect-error Deliberately bypass compile-time readonly to test runtime protection.
      batchA.candidates = batchB.candidates;
    }).toThrow(TypeError);
    expect(() => { batchA.candidates[0].headword = "B"; }).toThrow(TypeError);
    expect(() => { batchA.candidates[0].senses[0].glosses.push("B"); }).toThrow(TypeError);
    expect(() => { batchA.candidates[0].senses[0].note = "B"; }).toThrow(TypeError);
    expect(() => { batchA.candidates[0].tags.push("B"); }).toThrow(TypeError);
    expect(() => { batchA.candidates[0].senses[0] = { glosses: ["B"] }; }).toThrow(TypeError);
    expect(() => Object.assign(batchA, { lastProcessedEntSeq: "B" })).toThrow(TypeError);
    expect(() => { batchA.source.xmlSha256 = sha(b); }).toThrow(TypeError);
    for (const key of Object.keys(batchA.candidates[0])) {
      expect(Reflect.set(batchA.candidates[0], key, "replacement")).toBe(false);
      expect(Reflect.deleteProperty(batchA.candidates[0], key)).toBe(false);
    }
    for (const key of Object.keys(batchA.source)) expect(Reflect.set(batchA.source, key, "replacement")).toBe(false);
    expect(() => batchA.candidates.push(batchB.candidates[0])).toThrow(TypeError);
    expect(() => acceptSourceBatch(source, batchB.candidates)).toThrow(/belong/);

    const client = new PGlite();
    const database = drizzle(client);
    state.database = database;
    try {
      // Disposable in-memory table only. No repository migration or external DB.
      await client.exec(`CREATE TABLE dictionary_entries (
        id text PRIMARY KEY, headword text NOT NULL, reading text NOT NULL, romaji text NOT NULL,
        jlpt_level text NOT NULL, is_common boolean NOT NULL, frequency_rank integer,
        parts_of_speech jsonb NOT NULL, senses jsonb NOT NULL, kanji_characters jsonb NOT NULL,
        tags jsonb NOT NULL, source_ref text NOT NULL)`);
      const existingAdapter = new DrizzleDictionaryPersistenceAdapter();
      let fail = false;
      const adapter = { upsertBatch: (candidates: typeof batchA.candidates) => database.transaction(async tx => {
        state.database = tx;
        try {
          const result = await existingAdapter.upsertBatch(candidates);
          if (fail) throw new Error("synthetic transaction failure");
          return result;
        } finally { state.database = database; }
      }) };
      const path = join(directory, "checkpoint.json");
      const checkpoint = { path, progress };
      await expect(commitSourceBatch(source, batchB, adapter, false, checkpoint)).rejects.toThrow(/wrong source/);
      await expect(commitSourceBatch(source, { ...batchA }, adapter, false, checkpoint)).rejects.toThrow(/Unaccepted/);
      expect(fs.existsSync(path)).toBe(false);
      const result = await commitSourceBatch(source, batchA, adapter, false, checkpoint);
      expect(result.inserted).toBe(1);
      const rows = await database.select().from(dictionaryEntries);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("de-jmdict-9000001");
      expect(rows[0].senses[0].glosses).toContain("water A");
      expect(rows[0].sourceRef).toBe(source.sourceId);
      const cp = CheckpointManager.loadCheckpoint(path)!;
      expect(cp.sourceHash).toBe(sha(a));
      expect(cp.lastProcessedEntSeq).toBe("9000001");
      const before = fs.readFileSync(path);
      const beforeStat = fs.statSync(path);
      fail = true;
      await expect(commitSourceBatch(sourceB, batchB, adapter, false, checkpoint)).rejects.toThrow("synthetic transaction failure");
      expect(await database.select().from(dictionaryEntries)).toEqual(rows);
      expect(fs.readFileSync(path)).toEqual(before);
      expect(fs.statSync(path).mtimeMs).toBe(beforeStat.mtimeMs);
      const newPath = join(directory, "failed.json");
      await expect(commitSourceBatch(sourceB, batchB, adapter, false, { ...checkpoint, path: newPath })).rejects.toThrow();
      expect(fs.existsSync(newPath)).toBe(false);
    } finally { await client.close(); }
    expect(state.client).not.toHaveBeenCalled();
  });

  it("uses bounded reads, removes snapshot paths, and releases the descriptor", async () => {
    const text = xml(9000001, "水".repeat(50000));
    const read = vi.spyOn(fs, "readSync");
    const mkdir = vi.spyOn(fs, "mkdtempSync");
    const wholeRead = vi.spyOn(fs, "readFileSync");
    const source = capture(text);
    expect(wholeRead).not.toHaveBeenCalled();
    const snapshotDir = mkdir.mock.results[0].value as string;
    expect(fs.existsSync(snapshotDir)).toBe(false);
    const stream = openVerifiedSourceStream(source);
    let parsed = "";
    for await (const chunk of stream) parsed += chunk;
    expect(parsed).toBe(text);
    for (const call of read.mock.calls) expect((call as unknown[])[3]).toBeLessThanOrEqual(65536);
    const close = vi.spyOn(fs, "closeSync");
    releaseVerifiedSource(source);
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => openVerifiedSourceStream(source)).toThrow(/live verified/);
  });

  it("captures progress before persistence and rejects a released source", async () => {
    const source = capture(xml(9000001, "A"));
    const accepted = await batch(source);
    const captured = { ...progress };
    const path = join(directory, "progress.json");
    const adapter = { upsertBatch: vi.fn(async () => {
      captured.recordsProcessed = 999;
      return { batchSize: 1, inserted: 1, skipped: 0, updated: 0 };
    }) };
    await commitSourceBatch(source, accepted, adapter, false, { path, progress: captured });
    expect(CheckpointManager.loadCheckpoint(path)?.recordsProcessed).toBe(1);
    releaseVerifiedSource(source);
    await expect(commitSourceBatch(source, accepted, adapter)).rejects.toThrow(/Unaccepted/);
    expect(adapter.upsertBatch).toHaveBeenCalledTimes(1);
  });

  it("cleans temporary resources after hash or snapshot write failure", () => {
    const path = join(directory, "bad.xml");
    fs.writeFileSync(path, xml(9000001, "A"));
    const mkdir = vi.spyOn(fs, "mkdtempSync");
    expect(() => verifySourceContract(path, "0".repeat(64))).toThrow(/HASH MISMATCH/);
    expect(fs.existsSync(mkdir.mock.results[0].value as string)).toBe(false);
    vi.spyOn(fs, "writeSync").mockImplementation(() => { throw new Error("disk failure"); });
    expect(() => verifySourceContract(path, "0".repeat(64))).toThrow("disk failure");
    expect(fs.existsSync(mkdir.mock.results[1].value as string)).toBe(false);
  });

  it("closes parser streams on failure and releases the source in the owning finally", async () => {
    const source = capture(xml(9000001, "A"));
    const close = vi.spyOn(fs, "closeSync");
    vi.spyOn(fs, "readSync").mockImplementation(() => { throw new Error("read failure"); });
    await expect((async () => {
      try { await batch(source); } finally { releaseVerifiedSource(source); }
    })()).rejects.toThrow("read failure");
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => openVerifiedSourceStream(source)).toThrow(/live verified/);
  });
});
