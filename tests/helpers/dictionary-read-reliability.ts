/**
 * Dictionary read integration regressions. This module is imported by the
 * CI-selected dictionary-kanji-navigation test because CI currently lists
 * test files explicitly. It owns a new in-memory PGlite database and a
 * loopback-only wire server; it never uses the operator's DATABASE_URL.
 *
 * Schema export is offline. The only writes are explicit test setup (first-
 * party fixtures, two synthetic CMS rows, and a temporary schema rename for
 * the overlay-failure test). Every GET is bracketed by schema + full-content
 * snapshots, including all user tables and sequences, not just row counts.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { AddressInfo, Server } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import { sql } from "drizzle-orm";
import { drizzle as drizzlePGlite } from "drizzle-orm/pglite";
import { Pool, type PoolClient } from "pg";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import DictionaryEntryError from "@/app/dictionary/[id]/error";
import DictionaryEntryNotFound from "@/app/dictionary/[id]/not-found";
import { DictionaryAutocompleteView } from "@/components/dictionary/DictionaryAutocomplete";
import { requestDictionaryAutocomplete } from "@/lib/dictionary/autocomplete";
import { requestDictionarySearch } from "@/lib/dictionary/searchRequest";
import { buildDictionaryEntryHref } from "@/lib/dictionary/searchState";

interface DatabaseSnapshot {
  schemas: unknown[];
  types: unknown[];
  extensions: unknown[];
  catalog: unknown[];
  columns: unknown[];
  constraints: unknown[];
  indexes: unknown[];
  triggers: unknown[];
  policies: unknown[];
  functions: unknown[];
  rows: Record<string, string[]>;
  sequences: Record<string, unknown[]>;
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const fingerprint = (snapshot: DatabaseSnapshot) =>
  createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

async function snapshotDatabase(database: PGlite): Promise<DatabaseSnapshot> {
  const schemas = (await database.query(`
    SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl::text AS privileges,
           obj_description(oid, 'pg_namespace') AS comment
    FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
    ORDER BY 1
  `)).rows;
  const types = (await database.query(`
    SELECT n.nspname AS schema_name, t.typname, t.typtype::text AS kind,
           t.typnotnull, t.typacl::text AS privileges,
           ARRAY(SELECT e.enumlabel::text FROM pg_enum e WHERE e.enumtypid = t.oid
                 ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2
  `)).rows;
  const extensions = (await database.query(`
    SELECT e.extname, e.extversion, n.nspname AS schema_name
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY 1
  `)).rows;
  const catalog = (await database.query<{
    schema_name: string;
    relation_name: string;
    kind: string;
    persistence: string;
    view_definition: string | null;
  }>(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           c.relkind::text AS kind, c.relpersistence::text AS persistence,
           pg_get_userbyid(c.relowner) AS owner, c.relacl::text AS privileges,
           obj_description(c.oid, 'pg_class') AS comment,
           CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END AS view_definition
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','S','i','f')
    ORDER BY 1, 2, 3
  `)).rows;
  const columns = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name, a.attnum,
           a.attname, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull, a.attidentity, pg_get_expr(d.adbin, d.adrelid) AS default_expression,
           col_description(c.oid, a.attnum) AS comment
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY 1, 2, 3
  `)).rows;
  const constraints = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           x.conname, pg_get_constraintdef(x.oid) AS definition, x.convalidated
    FROM pg_constraint x JOIN pg_class c ON c.oid = x.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const indexes = (await database.query(`
    SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname NOT LIKE 'pg_%' AND schemaname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const triggers = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name,
           t.tgname, pg_get_triggerdef(t.oid) AS definition, t.tgenabled
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const policies = (await database.query(`
    SELECT n.nspname AS schema_name, c.relname AS relation_name, p.polname,
           p.polcmd::text, p.polpermissive, pg_get_expr(p.polqual, p.polrelid) AS using_expression,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
    ORDER BY 1, 2, 3
  `)).rows;
  const functions = (await database.query(`
    SELECT n.nspname AS schema_name, p.proname,
           pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND p.prokind IN ('f', 'p')
    ORDER BY 1, 2, 3
  `)).rows;
  const rows: Record<string, string[]> = {};
  const sequences: Record<string, unknown[]> = {};
  for (const relation of catalog) {
    const name = `${relation.schema_name}.${relation.relation_name}`;
    const table = `${quote(relation.schema_name)}.${quote(relation.relation_name)}`;
    if (relation.kind === "r" || relation.kind === "p") {
      rows[name] = (await database.query<{ row: string }>(
        `SELECT to_jsonb(t)::text AS row FROM ${table} AS t ORDER BY 1`
      )).rows.map((item) => item.row);
    } else if (relation.kind === "S") {
      sequences[name] = (await database.query(`SELECT * FROM ${table}`)).rows;
    }
  }
  return { schemas, types, extensions, catalog, columns, constraints, indexes, triggers, policies, functions, rows, sequences };
}

function request(path: string): NextRequest {
  const nextUrl = new URL(path, "http://dictionary-test.invalid");
  return { nextUrl, url: nextUrl.toString(), method: "GET" } as NextRequest;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pageParams(id: string, returnTo = "/dictionary?q=water&level=N5&common=true") {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({ returnTo }) };
}

describe("dictionary reads: isolated database and visitor reliability", () => {
  let database: PGlite;
  let server: Server;
  let pool: Pool;
  let backingPool: Pool;
  let previousPool: Pool | undefined;
  const poolCache = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };
  let poolClosed = false;
  let disposableUrl: string;
  let service: typeof import("@/services/dictionary").DictionaryService;
  let webGET: typeof import("@/app/api/dictionary/route").GET;
  let searchGET: typeof import("@/app/api/dictionary/search/route").GET;
  let detailGET: typeof import("@/app/api/dictionary/[id]/route").GET;
  let enrichedGET: typeof import("@/app/api/dictionary/entry/[id]/route").GET;
  let mobileGET: typeof import("@/app/api/v1/mobile/dictionary/search/route").GET;
  let detailPage: typeof import("@/app/dictionary/[id]/page").default;

  beforeAll(async () => {
    // The export process receives no DATABASE_URL, target declaration, or
    // application credentials. It generates DDL from the checked-in schema.
    const schema = execFileSync(process.execPath, [
      "node_modules/drizzle-kit/bin.cjs", "export",
      "--dialect", "postgresql", "--schema", "./src/db/schema.ts",
    ], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
    database = new PGlite();
    await database.waitReady;
    await database.exec(schema);
    server = createServer(database);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    disposableUrl = `postgresql://postgres:disposable@127.0.0.1:${port}/postgres`;

    // Import the real lazy application client, not a mocked pool. Save and
    // restore any pre-existing test-worker cache so it cannot direct this suite
    // to an inherited database or be closed by our teardown.
    previousPool = poolCache.__arenaNextJsPostgresqlPool;
    delete poolCache.__arenaNextJsPostgresqlPool;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", disposableUrl);
    vi.stubEnv("NIHONGO_DB_TARGET_CLASS", "disposable");
    vi.stubEnv("NIHONGO_DB_EXPECTED_DATABASE", "postgres");
    pool = (await import("@/db")).pool;
    // Resolve only the locally configured backing pool; opening a socket is lazy.
    void pool.options;
    backingPool = poolCache.__arenaNextJsPostgresqlPool!;
    service = (await import("@/services/dictionary")).DictionaryService;
    webGET = (await import("@/app/api/dictionary/route")).GET;
    searchGET = (await import("@/app/api/dictionary/search/route")).GET;
    detailGET = (await import("@/app/api/dictionary/[id]/route")).GET;
    enrichedGET = (await import("@/app/api/dictionary/entry/[id]/route")).GET;
    mobileGET = (await import("@/app/api/v1/mobile/dictionary/search/route")).GET;
    detailPage = (await import("@/app/dictionary/[id]/page")).default;
  }, 120_000);

  afterAll(async () => {
    // Even if an assertion interrupted an environment-safety test, teardown
    // can only close the pool created for this suite's own loopback server.
    if (backingPool && !poolClosed) await backingPool.end();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (database) await database.close();
    delete poolCache.__arenaNextJsPostgresqlPool;
    if (previousPool) poolCache.__arenaNextJsPostgresqlPool = previousPool;
    vi.unstubAllEnvs();
    vi.doUnmock("@/services/dictionary/readTransaction");
    vi.resetModules();
  }, 120_000);

  it("leaves an empty database's schema, sequences, and every table unchanged across GETs", async () => {
    const before = await snapshotDatabase(database);
    expect(Object.keys(before.rows)).toHaveLength(30);
    expect(Object.values(before.rows).every((rows) => rows.length === 0)).toBe(true);

    const browse = await webGET(request("/api/dictionary"));
    expect(browse.status).toBe(200);
    expect((await browse.json()).data).toMatchObject({ entries: [], total: 0, limit: 25, offset: 0 });
    const search = await webGET(request("/api/dictionary?q=water"));
    expect((await search.json()).data).toMatchObject({ entries: [], total: 0 });
    const autocomplete = await webGET(request("/api/dictionary?q=water&autocomplete=true"));
    expect((await autocomplete.json()).data).toEqual([]);
    const explicitSearch = await searchGET(request("/api/dictionary/search?q=water"));
    expect((await explicitSearch.json()).data).toMatchObject({ entries: [], total: 0 });
    const mobile = await mobileGET(request("/api/v1/mobile/dictionary/search?q=water"));
    expect((await mobile.json()).data).toMatchObject({ entries: [], total: 0, hasMore: false });
    expect((await detailGET(request("/api/dictionary/de-mizu"), params("de-mizu"))).status).toBe(404);
    expect((await enrichedGET(request("/api/dictionary/entry/de-mizu"), params("de-mizu"))).status).toBe(404);
    await expect(detailPage(pageParams("de-mizu"))).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    for (const suffix of [
      `q=${"x".repeat(1001)}`,
      "q=water&limit=bad",
      "q=water&limit=0",
      "q=water&offset=-1",
      "q=water&common=TRUE",
      "q=water&level=N7",
      "q=water&autocomplete=perhaps",
      "q=water&limit=99999999999",
    ]) {
      expect((await webGET(request(`/api/dictionary?${suffix}`))).status).toBe(400);
    }
    expect((await searchGET(request("/api/dictionary/search"))).status).toBe(400);
    expect((await detailGET(request("/api/dictionary/bad"), params("bad\u0000id"))).status).toBe(400);
    await expect(service.searchEntries({ query: "x".repeat(1001) })).rejects.toThrow(RangeError);
    await expect(service.autocomplete("x".repeat(1001))).rejects.toThrow(RangeError);

    const after = await snapshotDatabase(database);
    expect(after).toEqual(before);
    console.log(`[dictionary-read] empty: ${Object.keys(before.rows).length} tables, 0 rows; unchanged SHA-256 ${fingerprint(before)}`);
  }, 120_000);

  it("allows fixture setup only for the explicitly named disposable pool", async () => {
    const before = await snapshotDatabase(database);
    vi.stubEnv("NIHONGO_DB_TARGET_CLASS", "");
    await expect(service.ensureInitialized()).rejects.toThrow("explicitly classified disposable database");
    vi.stubEnv("NIHONGO_DB_TARGET_CLASS", "disposable");
    const otherUrl = new URL(disposableUrl);
    otherUrl.port = String(Number(otherUrl.port) === 65535 ? 65534 : Number(otherUrl.port) + 1);
    vi.stubEnv("DATABASE_URL", otherUrl.toString());
    await expect(service.ensureInitialized()).rejects.toThrow("mismatched database pool");
    // node-postgres may override the authority using connection-string options;
    // both examples must be refused before any target could be contacted.
    vi.stubEnv("DATABASE_URL", `${disposableUrl}?host=nonloopback.invalid&port=5432`);
    await expect(service.ensureInitialized()).rejects.toThrow("plain, valid disposable");
    vi.stubEnv("DATABASE_URL", `${disposableUrl}/other-database`);
    await expect(service.ensureInitialized()).rejects.toThrow("plain, valid disposable");
    const implicitPort = new URL(disposableUrl);
    implicitPort.port = "";
    vi.stubEnv("DATABASE_URL", implicitPort.toString());
    await expect(service.ensureInitialized()).rejects.toThrow("plain, valid disposable");
    const implicitUser = new URL(disposableUrl);
    implicitUser.username = "";
    implicitUser.password = "";
    vi.stubEnv("DATABASE_URL", implicitUser.toString());
    await expect(service.ensureInitialized()).rejects.toThrow("plain, valid disposable");
    vi.stubEnv("DATABASE_URL", disposableUrl);
    const cachedUrl = backingPool.options.connectionString;
    try {
      backingPool.options.connectionString = `${disposableUrl}?host=nonloopback.invalid`;
      await expect(service.ensureInitialized()).rejects.toThrow("plain disposable database URL");
    } finally {
      backingPool.options.connectionString = cachedUrl;
    }
    vi.stubEnv("NODE_ENV", "production");
    await expect(service.ensureInitialized()).rejects.toThrow("unavailable in production");
    vi.stubEnv("NODE_ENV", "test");
    expect(await snapshotDatabase(database)).toEqual(before);
  }, 120_000);

  it("discards the checked-out client on failed BEGIN and failed reads without exposing errors", async () => {
    const before = await snapshotDatabase(database);
    const acquire = backingPool.connect.bind(backingPool) as () => Promise<PoolClient>;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const stage of ["begin", "select"] as const) {
        const statements: string[] = [];
        const releases: (Error | boolean | undefined)[] = [];
        const connectSpy = vi.spyOn(backingPool, "connect").mockImplementation((async () => {
          const client = await acquire();
          const query = client.query;
          const release = client.release;
          client.query = ((...args: unknown[]) => {
            const first = args[0] as string | { text?: string };
            const text = typeof first === "string" ? first : first.text ?? "";
            statements.push(text);
            if ((stage === "begin" && /^begin\b/i.test(text)) || (stage === "select" && /^select\b/i.test(text))) {
              return Promise.reject(new Error("synthetic SECRET_SQL_CONNECTION failure"));
            }
            return Reflect.apply(query, client, args);
          }) as typeof client.query;
          client.release = (error) => {
            releases.push(error);
            client.query = query;
            client.release = release;
            release.call(client, error);
          };
          return client;
        }) as unknown as typeof backingPool.connect);
        try {
          const response = await webGET(request("/api/dictionary?q=water"));
          expect(response.status).toBe(500);
          expect(JSON.stringify(await response.json())).not.toMatch(/SECRET_SQL_CONNECTION|select|stack/i);
          expect(connectSpy).toHaveBeenCalledTimes(1);
          expect(statements[0]).toMatch(/^begin read only/i);
          if (stage === "select") {
            expect(statements.some((text) => /^set local statement_timeout/i.test(text))).toBe(true);
            expect(statements.some((text) => /^rollback/i.test(text))).toBe(true);
          }
          expect(releases).toEqual([true]);
        } finally {
          connectSpy.mockRestore();
        }
      }
    } finally {
      errorLog.mockRestore();
    }
    expect(await snapshotDatabase(database)).toEqual(before);
  }, 120_000);

  it("preserves content, ranking, attribution, navigation, bounds and every seeded row across GETs", async () => {
    await service.ensureInitialized();
    // Synthetic first-party editorial fixtures, written only during explicit
    // setup. A draft must not become learner-visible; a published override
    // must still be read within the same bounded transaction.
    await pool.query(`
      INSERT INTO cms_content_items
        (id, content_type, entity_id, title, status, staged_payload, source_ref, provenance_type, author_id)
      VALUES
        ('reliability-published', 'dictionary', 'de-taberu', 'test fixture', 'published', $1::jsonb,
         'first-party:dictionary-core:v1', 'canonical_override', 'test-fixture'),
        ('reliability-draft', 'dictionary', 'de-mizu', 'test fixture', 'draft', $2::jsonb,
         'first-party:dictionary-core:v1', 'canonical_override', 'test-fixture')
    `, [
      JSON.stringify({ headword: "食べる", reading: "たべる", senses: [{ glosses: ["to eat (editorial test fixture)"] }] }),
      JSON.stringify({ headword: "DRAFT MUST NOT APPEAR", reading: "draft" }),
    ]);
    const before = await snapshotDatabase(database);
    expect(before.rows["public.dictionary_entries"].length).toBeGreaterThan(0);
    expect(before.rows["public.knowledge_sources"].length).toBeGreaterThan(0);
    expect(before.rows["public.cms_content_items"]).toHaveLength(2);

    // The lazy production pool must keep every statement on one checked-out
    // connection, with both transaction guards active during the CMS read.
    const connectSpy = vi.spyOn(backingPool, "connect");
    let settings: { readOnly: string; timeout: string } | undefined;
    try {
      await service.searchEntries({ query: "mizu" }, {
        async findPublishedDictionaryOverrides() {
          const client = await connectSpy.mock.results[0].value as unknown as PoolClient;
          const readOnly = await client.query("SHOW transaction_read_only");
          const timeout = await client.query("SHOW statement_timeout");
          settings = { readOnly: readOnly.rows[0].transaction_read_only, timeout: timeout.rows[0].statement_timeout };
          return [];
        },
      });
      expect(connectSpy).toHaveBeenCalledTimes(1);
      expect(settings).toEqual({ readOnly: "on", timeout: "10s" });
    } finally {
      connectSpy.mockRestore();
    }

    // Trace the *real* application pool for every dictionary read surface,
    // including the separate enrichment transaction. Each lease must start a
    // read-only transaction, apply the timeout on that same client, and release.
    const acquire = backingPool.connect.bind(backingPool) as () => Promise<PoolClient>;
    const traces: { statements: string[]; settings?: { readOnly: string; timeout: string }; releases: (Error | boolean | undefined)[] }[] = [];
    const traceSpy = vi.spyOn(backingPool, "connect").mockImplementation((async () => {
      const client = await acquire();
      const query = client.query;
      const release = client.release;
      const trace: typeof traces[number] = { statements: [], releases: [] };
      traces.push(trace);
      client.query = ((...args: unknown[]) => {
        const first = args[0] as string | { text?: string };
        const text = typeof first === "string" ? first : first.text ?? "";
        trace.statements.push(text);
        const result = Reflect.apply(query, client, args);
        if (/^set local statement_timeout/i.test(text)) {
          return Promise.resolve(result).then(async (value) => {
            const readOnly = await Reflect.apply(query, client, ["SHOW transaction_read_only"]);
            const timeout = await Reflect.apply(query, client, ["SHOW statement_timeout"]);
            trace.settings = { readOnly: readOnly.rows[0].transaction_read_only, timeout: timeout.rows[0].statement_timeout };
            return value;
          });
        }
        return result;
      }) as typeof client.query;
      client.release = (error) => {
        trace.releases.push(error);
        client.query = query;
        client.release = release;
        release.call(client, error);
      };
      return client;
    }) as unknown as typeof backingPool.connect);
    try {
      expect((await webGET(request("/api/dictionary?q=water"))).status).toBe(200);
      expect((await webGET(request("/api/dictionary?q=water&autocomplete=true"))).status).toBe(200);
      expect((await searchGET(request("/api/dictionary/search?q=water"))).status).toBe(200);
      expect((await mobileGET(request("/api/v1/mobile/dictionary/search?q=water"))).status).toBe(200);
      expect((await detailGET(request("/api/dictionary/de-mizu"), params("de-mizu"))).status).toBe(200);
      expect(await detailPage(pageParams("de-mizu"))).toBeTruthy();
      expect((await enrichedGET(request("/api/dictionary/entry/de-mizu"), params("de-mizu"))).status).toBe(200);
    } finally {
      traceSpy.mockRestore();
    }
    expect(traces).toHaveLength(8); // enrichment has a detail transaction and a graph transaction
    for (const trace of traces) {
      expect(trace.statements[0]).toMatch(/^begin read only/i);
      expect(trace.statements[1]).toMatch(/^set local statement_timeout/i);
      expect(trace.statements.some((text) => /^select/i.test(text))).toBe(true);
      expect(trace.statements.at(-1)).toMatch(/^commit/i);
      expect(trace.settings).toEqual({ readOnly: "on", timeout: "10s" });
      expect(trace.releases).toEqual([undefined]);
    }
    expect(traces.at(-1)!.statements.filter((text) => /^select/i.test(text))).toHaveLength(2);

    for (const query of ["水", "みず", "mizu", "water"]) {
      const response = await webGET(request(`/api/dictionary?q=${encodeURIComponent(query)}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.entries[0]).toMatchObject({ id: "de-mizu", headword: "水", reading: "みず" });
      expect(JSON.stringify(body)).not.toContain("DRAFT MUST NOT APPEAR");
    }
    const noMatches = await webGET(request("/api/dictionary?q=definitely-no-match-xyz"));
    expect((await noMatches.json()).data).toMatchObject({ entries: [], total: 0 });
    const filtered = await webGET(request("/api/dictionary?q=water&level=N5&common=true"));
    expect((await filtered.json()).data.entries[0]).toMatchObject({ id: "de-mizu", jlptLevel: "N5", isCommon: true });
    const falseCommon = await webGET(request("/api/dictionary?q=water&common=false"));
    expect((await falseCommon.json()).data.entries).toEqual([]);
    const paged = await webGET(request("/api/dictionary?limit=999999&offset=999999"));
    expect((await paged.json()).data).toMatchObject({ limit: 100, offset: 100000, entries: [] });
    const directBounds = await service.searchEntries({ limit: Number.POSITIVE_INFINITY, offset: Number.NaN });
    expect(directBounds).toMatchObject({ limit: 25, offset: 0 });
    const directClamped = await service.searchEntries({ limit: 999999, offset: 999999 });
    expect(directClamped).toMatchObject({ limit: 100, offset: 100000 });

    const suggestions = await webGET(request("/api/dictionary?q=mizu&autocomplete=true&limit=999999"));
    expect((await suggestions.json()).data[0]).toMatchObject({ id: "de-mizu", gloss: "water" });
    expect((await service.autocomplete("a", 999999)).length).toBeLessThanOrEqual(20);
    const cappedSuggestions = await webGET(request("/api/dictionary?q=a&autocomplete=true&limit=2"));
    expect((await cappedSuggestions.json()).data.length).toBeLessThanOrEqual(2);

    const publishedSearch = await webGET(request("/api/dictionary?q=taberu"));
    expect((await publishedSearch.json()).data.entries[0].senses[0].glosses)
      .toContain("to eat (editorial test fixture)");
    const publishedDetail = await service.getEntryDetail("de-taberu");
    expect(publishedDetail?.entry.senses[0].glosses).toContain("to eat (editorial test fixture)");
    expect(publishedDetail?.source?.name).toBe("NihongoBridge Core Dictionary");

    const detail = await detailGET(request("/api/dictionary/de-mizu"), params("de-mizu"));
    const detailBody = await detail.json();
    expect(detailBody.data.entry).toMatchObject({ id: "de-mizu", headword: "水", sourceRef: "first-party:dictionary-core:v1" });
    expect(detailBody.data.source.name).toBe("NihongoBridge Core Dictionary");
    // This first-party fixture has no 水 row in kanji_entries; do not fabricate it.
    expect(detailBody.data.kanji).toEqual([]);
    expect(detailBody.data.sentences.length).toBeGreaterThan(0);
    const enriched = await enrichedGET(request("/api/dictionary/entry/de-mizu"), params("de-mizu"));
    const enrichedBody = await enriched.json();
    expect(enrichedBody.data.kanjiEdges[0]).toMatchObject({ entryId: "de-mizu", kanji: "水" });
    expect(enrichedBody.data.headwordKanji).toContain("水");
    expect((await detailGET(request("/api/dictionary/missing"), params("missing"))).status).toBe(404);
    // '%' is a valid already-decoded identifier, not a malformed URI to decode again.
    expect((await detailGET(request("/api/dictionary/%25"), params("%"))).status).toBe(404);
    const identifierSpy = vi.spyOn(service, "getEntryDetail");
    await detailGET(request("/api/dictionary/literal%252Fid"), params("literal%2Fid"));
    expect(identifierSpy).toHaveBeenCalledWith("literal%2Fid");
    identifierSpy.mockRestore();

    const mobile = await mobileGET(request("/api/v1/mobile/dictionary/search?q=water&limit=999"));
    const mobileBody = await mobile.json();
    expect(mobileBody.data).toMatchObject({ limit: 100, offset: 0 });
    expect(mobileBody.data.entries[0].headword).toBe("水");
    expect(Object.keys(mobileBody.data.entries[0]).sort()).toEqual([
      "headword", "id", "isCommon", "jlptLevel", "jlptStatus", "kanjiCharacters", "primaryGlosses", "reading", "romaji",
    ].sort());

    const returnTo = "/dictionary?q=water&level=N5&common=true";
    const href = buildDictionaryEntryHref("de-mizu", returnTo);
    expect(href).toContain("returnTo=");
    const html = renderToStaticMarkup(await detailPage(pageParams("de-mizu", returnTo)));
    expect(html).toContain("NihongoBridge Core Dictionary");
    expect(html).toContain("water");
    expect(html).toContain("Back to Dictionary Search");
    expect(html).toContain("/dictionary?q=water&amp;level=N5&amp;common=true");

    const canonicalDetail = await service.getEntryDetail("de-mizu");
    expect(canonicalDetail).not.toBeNull();
    const noSource = vi.spyOn(service, "getEntryDetail").mockResolvedValueOnce({
      ...canonicalDetail!, source: null, entry: { ...canonicalDetail!.entry, sourceRef: "" },
    });
    const noSourceHtml = renderToStaticMarkup(await detailPage(pageParams("de-mizu")));
    expect(noSourceHtml).toContain("Source details unavailable");
    expect(noSourceHtml).not.toContain("First-party lexical database");
    noSource.mockRestore();

    const after = await snapshotDatabase(database);
    expect(after).toEqual(before);
    const totalRows = Object.values(before.rows).reduce((sum, rows) => sum + rows.length, 0);
    console.log(`[dictionary-read] seeded: ${Object.keys(before.rows).length} tables, ${totalRows} rows; unchanged SHA-256 ${fingerprint(before)}`);
  }, 120_000);

  it("serves canonical data after a real optional CMS SQL failure without changing state", async () => {
    const original = await snapshotDatabase(database);
    await database.exec("ALTER TABLE cms_content_items RENAME TO cms_content_items_test_unavailable");
    const renamed = await snapshotDatabase(database);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // The PGlite wire adapter mishandles protocol recovery after SQL errors.
      // Exercise this failure with Drizzle's native PGlite driver instead, so
      // the real PostgreSQL transaction/savepoint is tested without that shim.
      vi.resetModules();
      vi.doMock("@/services/dictionary/readTransaction", () => ({
        withDictionaryRead: (read: (tx: unknown) => Promise<unknown>) =>
          drizzlePGlite(database).transaction(async (tx) => {
            await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
            return read(tx);
          }, { accessMode: "read only" }),
      }));
      const nativeService = (await import("@/services/dictionary")).DictionaryService;
      const nativeWebGET = (await import("@/app/api/dictionary/route")).GET;
      const response = await nativeWebGET(request("/api/dictionary?q=taberu"));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.entries[0].senses[0].glosses).toContain("to eat");
      expect(JSON.stringify(body)).not.toContain("editorial test fixture");
      const detail = await nativeService.getEntryDetail("de-taberu");
      expect(detail?.entry.senses[0].glosses).toContain("to eat");
      expect(detail?.source?.name).toBe("NihongoBridge Core Dictionary");
      expect(await snapshotDatabase(database)).toEqual(renamed);
    } finally {
      warning.mockRestore();
      vi.doUnmock("@/services/dictionary/readTransaction");
      await database.exec("ALTER TABLE cms_content_items_test_unavailable RENAME TO cms_content_items");
    }
    expect(await snapshotDatabase(database)).toEqual(original);
  }, 120_000);

  it("reports an unavailable database safely and makes no changes on failure", async () => {
    const before = await snapshotDatabase(database);
    await backingPool.end();
    poolClosed = true;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const responses = [
        await webGET(request("/api/dictionary?q=water")),
        await webGET(request("/api/dictionary?q=water&autocomplete=true")),
        await searchGET(request("/api/dictionary/search?q=water")),
        await detailGET(request("/api/dictionary/de-mizu"), params("de-mizu")),
        await enrichedGET(request("/api/dictionary/entry/de-mizu"), params("de-mizu")),
        await mobileGET(request("/api/v1/mobile/dictionary/search?q=water")),
      ];
      for (const response of responses) {
        expect(response.status).toBe(500);
        const body = JSON.stringify(await response.json());
        expect(body).toContain("INTERNAL_ERROR");
        expect(body).not.toMatch(/postgresql:\/\/|disposable|pool|select |stack/i);
      }
      const unavailableHtml = renderToStaticMarkup(await detailPage(pageParams("de-mizu")));
      expect(unavailableHtml).toContain("temporarily unavailable");
      expect(unavailableHtml).toContain("Retry");
      expect(unavailableHtml).toContain("/dictionary/de-mizu?returnTo=");
      expect(unavailableHtml).not.toMatch(/postgresql:\/\/|disposable|select |stack/i);
    } finally {
      errorLog.mockRestore();
    }
    expect(await snapshotDatabase(database)).toEqual(before);
    console.log(`[dictionary-read] database failure: schema and full contents unchanged SHA-256 ${fingerprint(before)}`);
  }, 120_000);
});

describe("dictionary visitor failure and validation states", () => {
  it("rejects an overlong query locally without sending search or suggestion requests", async () => {
    const fetchMock = vi.fn();
    const query = "水".repeat(1001);
    const options = { fetchImpl: fetchMock as unknown as typeof fetch };
    expect(await requestDictionarySearch({ query, level: "ALL", commonOnly: false }, options))
      .toEqual({ ok: false, reason: "query_too_long" });
    expect(await requestDictionaryAutocomplete(query, options))
      .toEqual({ ok: false, reason: "query_too_long" });
    expect(fetchMock).not.toHaveBeenCalled();

    const html = renderToStaticMarkup(createElement(DictionaryAutocompleteView, {
      query, onQueryChange: vi.fn(), onSearch: vi.fn(), listboxId: "suggestions",
      popupOpen: true, status: "invalid-query", suggestions: [], activeIndex: -1,
      onInputFocus: vi.fn(), onInputKeyDown: vi.fn(), onSuggestionActive: vi.fn(), onSuggestionSelect: vi.fn(),
      onRetrySuggestions: vi.fn(),
    }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="suggestions-query-error"');
    expect(html).toContain("1,000 characters or fewer");
  });

  it("times out stalled searches and suggestions as recoverable network failures", async () => {
    vi.useFakeTimers();
    try {
      const stalledFetch: typeof fetch = (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
      const search = requestDictionarySearch({ query: "water", level: "ALL", commonOnly: false }, { fetchImpl: stalledFetch });
      const autocomplete = requestDictionaryAutocomplete("water", { fetchImpl: stalledFetch });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await search).toEqual({ ok: false, reason: "network" });
      expect(await autocomplete).toEqual({ ok: false, reason: "network" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders honest missing-detail and safe retry states without diagnostic text", () => {
    const missing = renderToStaticMarkup(createElement(DictionaryEntryNotFound));
    expect(missing).toContain("Dictionary entry not found");
    expect(missing).toContain('href="/dictionary"');
    const retry = vi.fn();
    const error = new Error("postgresql://user:secret@private/SELECT stack");
    const view = DictionaryEntryError({ error, reset: retry });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
    expect(html).toContain('href="/dictionary"');
    expect(html).not.toMatch(/secret|postgresql|SELECT|stack/);
    const actions = view.props.children[2] as ReactElement<{ children: ReactElement[] }>;
    const retryButton = actions.props.children[0] as ReactElement<{ onClick: () => void }>;
    retryButton.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });
});
