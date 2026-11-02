/**
 * Controlled canonical provisioning — disposable-database integration test.
 *
 * Runs the real code path (bootstrap, plan, transaction, invariants) against
 * in-process PGlite. No DATABASE_URL, no shared database, no network.
 *
 * The fixture deliberately reproduces the production observation:
 *   208 kana, 33 mindtree kanji, 55 elements, 71 composition edges.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import { KnowledgeService } from "@/services/knowledge/knowledgeService";
import { CanonicalBootstrapStateError } from "@/services/knowledge/canonicalBootstrapGuard";
import {
  CanonicalProvisioningError,
  type Queryable,
  dryRunProvisioning,
  executeProvisioning,
  readCanonicalRows,
  readKanaCounts,
  verifyCanonicalFoundation,
} from "@/services/knowledge/canonicalStore";
import {
  buildCorpusPilotDataset,
  classifyCanonicalState,
} from "@/services/knowledge/canonicalDataset";
import { buildKanaDataset } from "@/data/kana";

const EXPECTED_KANA = buildKanaDataset().length;

const DDL = `
CREATE TABLE kana_entries (
  id text PRIMARY KEY,
  character text NOT NULL,
  script text NOT NULL,
  romaji text NOT NULL,
  category text NOT NULL,
  row_key text NOT NULL,
  column_key text NOT NULL,
  base_character text,
  is_archaic boolean NOT NULL DEFAULT false,
  mnemonic text,
  source_ref text NOT NULL,
  order_index integer NOT NULL
);
CREATE TABLE kanji_radicals (
  id text PRIMARY KEY,
  character text NOT NULL UNIQUE,
  alt_forms jsonb NOT NULL DEFAULT '[]'::jsonb,
  meaning text NOT NULL,
  reading_kun text,
  reading_on text,
  stroke_count integer NOT NULL,
  kangxi_number integer,
  category text NOT NULL,
  typical_role text NOT NULL,
  mnemonic text,
  source_ref text NOT NULL
);
CREATE TABLE kanji_entries (
  id text PRIMARY KEY,
  character text NOT NULL UNIQUE,
  meaning text NOT NULL,
  readings_kun jsonb NOT NULL DEFAULT '[]'::jsonb,
  readings_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  stroke_count integer NOT NULL,
  jlpt_level text NOT NULL,
  grade_level integer,
  primary_radical_id text,
  mnemonic text,
  vocabulary jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_ref text NOT NULL
);
CREATE TABLE kanji_composition (
  id text PRIMARY KEY,
  kanji_id text NOT NULL,
  element_id text NOT NULL,
  role text NOT NULL,
  position text,
  rendered_as text NOT NULL,
  order_index integer NOT NULL DEFAULT 0
);
`;

let client: PGlite;

async function counts(db: Queryable) {
  const rows = await db.query<{ table_name: string; n: number | string }>(`
    SELECT 'kana_entries' AS table_name, count(*)::int AS n FROM kana_entries
    UNION ALL SELECT 'kanji_entries', count(*)::int FROM kanji_entries
    UNION ALL SELECT 'kanji_radicals', count(*)::int FROM kanji_radicals
    UNION ALL SELECT 'kanji_composition', count(*)::int FROM kanji_composition
  `);
  const result: Record<string, number> = {};
  for (const row of rows.rows) result[row.table_name] = Number(row.n);
  return result;
}

async function bootstrapMindtree() {
  // The documented bootstrap path, exercised unchanged.
  await KnowledgeService.ensureSeeded(
    drizzle(client) as unknown as Parameters<typeof KnowledgeService.ensureSeeded>[0]
  );
}

beforeEach(async () => {
  client = new PGlite();
  await client.exec(DDL);
});

afterEach(async () => {
  await client.close();
});

describe("bootstrap state is derived from the Kanji tables, not from kana", () => {
  it("reproduces the production shape and keeps it classified as partial", async () => {
    await bootstrapMindtree();
    const before = await counts(client);
    expect(before).toEqual({
      kana_entries: EXPECTED_KANA,
      kanji_entries: 33,
      kanji_radicals: 55,
      kanji_composition: 71,
    });

    const observed = await readCanonicalRows(client);
    const kana = await readKanaCounts(client);
    const state = classifyCanonicalState({ kana, observed, expectedKana: EXPECTED_KANA });
    expect(state.status).toBe("PARTIALLY_PROVISIONED");
    expect(state.assessments.find((a) => a.id === "kanji-corpus-pilot")?.missing.kanji)
      .toHaveLength(12);
  });

  it("is a no-op when re-run on the provisioned Mind Tree dataset", async () => {
    await bootstrapMindtree();
    const before = await counts(client);
    await bootstrapMindtree();
    expect(await counts(client)).toEqual(before);
  });

  it("refuses to repair a partially deleted foundation and writes nothing", async () => {
    await bootstrapMindtree();
    await client.query("DELETE FROM kanji_radicals WHERE id IN (SELECT id FROM kanji_radicals ORDER BY id LIMIT 5)");
    const before = await counts(client);

    await expect(bootstrapMindtree()).rejects.toBeInstanceOf(CanonicalBootstrapStateError);
    expect(await counts(client)).toEqual(before);
  });
});

describe("dry-run", () => {
  it("plans 12 kanji / 8 elements / 19 edges and writes nothing", async () => {
    await bootstrapMindtree();
    const before = await counts(client);

    const { plan } = await dryRunProvisioning(client, buildCorpusPilotDataset());
    expect(plan.blockers).toEqual([]);
    expect(plan.inserts.kanji).toHaveLength(12);
    expect(plan.inserts.radicals).toHaveLength(8);
    expect(plan.inserts.composition).toHaveLength(19);
    expect(plan.expectedAfter).toEqual({ radicals: 63, kanji: 45, composition: 90 });

    expect(await counts(client)).toEqual(before);
  });
});

describe("execute", () => {
  it("provisions the corpus inside one transaction and leaves existing rows untouched", async () => {
    await bootstrapMindtree();
    const result = await executeProvisioning(client, buildCorpusPilotDataset(), {
      expectedKana: EXPECTED_KANA,
    });

    expect(result.outcome).toBe("provisioned");
    expect(result.inserted).toEqual({ radicals: 8, kanji: 12, composition: 19 });
    expect(result.countsAfter).toEqual({ radicals: 63, kanji: 45, composition: 90 });
    expect(result.untouchedDigestBefore).toBe(result.untouchedDigestAfter);

    const observed = await readCanonicalRows(client);
    const kana = await readKanaCounts(client);
    expect(classifyCanonicalState({ kana, observed, expectedKana: EXPECTED_KANA }).status)
      .toBe("FULLY_PROVISIONED");

    const verification = await verifyCanonicalFoundation(client, {
      expectedKana: EXPECTED_KANA,
    });
    expect(verification.status).toEqual([]);

    // Provenance landed on the corpus rows and nowhere else.
    const provenance = await client.query<{ source_ref: string; n: number }>(
      "SELECT source_ref, count(*)::int AS n FROM kanji_entries GROUP BY 1 ORDER BY 1"
    );
    expect(provenance.rows).toEqual([
      { source_ref: "first-party:kanji-corpus:v1", n: 12 },
      { source_ref: "first-party:kanji-mindtree:v1", n: 33 },
    ]);

    // The 12 headwords resolved their primary radical: no dangling reference.
    const dangling = await client.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM kanji_entries k
       WHERE k.primary_radical_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM kanji_radicals r WHERE r.id = k.primary_radical_id)
    `);
    expect(Number(dangling.rows[0].n)).toBe(0);
  });

  it("is idempotent on a second run", async () => {
    await bootstrapMindtree();
    await executeProvisioning(client, buildCorpusPilotDataset(), { expectedKana: EXPECTED_KANA });
    const before = await counts(client);

    const second = await executeProvisioning(client, buildCorpusPilotDataset(), {
      expectedKana: EXPECTED_KANA,
    });
    expect(second.outcome).toBe("already-complete");
    expect(second.inserted).toEqual({ radicals: 0, kanji: 0, composition: 0 });
    expect(await counts(client)).toEqual(before);
  });

  it("stops without writing when a canonical character is already taken", async () => {
    await bootstrapMindtree();
    await client.query(
      `INSERT INTO kanji_entries
         (id, character, meaning, readings_kun, readings_on, stroke_count, jlpt_level,
          grade_level, primary_radical_id, mnemonic, vocabulary, source_ref)
       VALUES ('legacy-road', '道', 'road', '[]'::jsonb, '[]'::jsonb, 12, 'N5',
               NULL, NULL, NULL, '[]'::jsonb, 'upstream:kanjidic2:2023-08')`
    );
    const before = await counts(client);

    await expect(
      executeProvisioning(client, buildCorpusPilotDataset(), { expectedKana: EXPECTED_KANA })
    ).rejects.toBeInstanceOf(CanonicalProvisioningError);
    expect(await counts(client)).toEqual(before);
  });

  it("rolls the whole transaction back when a write fails mid-run", async () => {
    await bootstrapMindtree();
    const before = await counts(client);

    let insertedKanji = 0;
    const failing: Queryable = {
      query: async (text, values) => {
        if (text.includes("INSERT INTO kanji_entries")) {
          insertedKanji += 1;
          if (insertedKanji === 3) {
            throw new Error("simulated connection loss mid-write");
          }
        }
        return client.query(text, values);
      },
    };

    await expect(
      executeProvisioning(failing, buildCorpusPilotDataset(), { expectedKana: EXPECTED_KANA })
    ).rejects.toThrow(/simulated connection loss/);

    // Two kanji were inserted before the failure; the rollback removed them and
    // every element/edge written before them.
    expect(insertedKanji).toBe(3);
    expect(await counts(client)).toEqual(before);
  });

  it("refuses when the kana baseline is wrong", async () => {
    await bootstrapMindtree();
    const before = await counts(client);
    await expect(
      executeProvisioning(client, buildCorpusPilotDataset(), {
        expectedKana: EXPECTED_KANA + 1,
      })
    ).rejects.toBeInstanceOf(CanonicalProvisioningError);
    expect(await counts(client)).toEqual(before);
  });
});

describe("least-privilege database role", () => {
  /** The role the runbook prescribes: SELECT + INSERT on the canonical tables only. */
  async function createProvisioningRole() {
    await client.exec(`
      CREATE ROLE nihongo_provisioner LOGIN PASSWORD 'not-a-real-credential';
      GRANT SELECT, INSERT ON kana_entries, kanji_radicals, kanji_entries, kanji_composition
        TO nihongo_provisioner;
    `);
  }

  it("is sufficient for the whole operation", async () => {
    await bootstrapMindtree();
    await createProvisioningRole();

    await client.exec("SET ROLE nihongo_provisioner");
    try {
      const result = await executeProvisioning(client, buildCorpusPilotDataset(), {
        expectedKana: EXPECTED_KANA,
      });
      expect(result.outcome).toBe("provisioned");
      expect(result.inserted).toEqual({ radicals: 8, kanji: 12, composition: 19 });

      const verification = await verifyCanonicalFoundation(client, {
        expectedKana: EXPECTED_KANA,
      });
      expect(verification.status).toEqual([]);
    } finally {
      await client.exec("RESET ROLE");
    }
  });

  it("cannot update, delete, truncate or alter canonical rows", async () => {
    await bootstrapMindtree();
    await createProvisioningRole();
    await client.exec("SET ROLE nihongo_provisioner");
    try {
      await expect(
        client.query("UPDATE kanji_entries SET meaning = 'tampered' WHERE id = 'kj-mei'")
      ).rejects.toThrow(/permission denied/i);
      await expect(
        client.query("DELETE FROM kanji_entries WHERE id = 'kj-mei'")
      ).rejects.toThrow(/permission denied/i);
      await expect(client.query("TRUNCATE kanji_entries")).rejects.toThrow(/permission denied/i);
      await expect(
        client.query("ALTER TABLE kanji_entries ADD COLUMN smuggled integer")
      ).rejects.toThrow(/must be owner|permission denied/i);
    } finally {
      await client.exec("RESET ROLE");
    }

    // Nothing moved: the bootstrap rows are intact.
    expect(await counts(client)).toEqual({
      kana_entries: EXPECTED_KANA,
      kanji_entries: 33,
      kanji_radicals: 55,
      kanji_composition: 71,
    });
  });

  it("fails closed — with no rows written — when the role can only read", async () => {
    await bootstrapMindtree();
    await client.exec(`
      CREATE ROLE nihongo_reader LOGIN PASSWORD 'not-a-real-credential';
      GRANT SELECT ON kana_entries, kanji_radicals, kanji_entries, kanji_composition
        TO nihongo_reader;
    `);
    const before = await counts(client);

    await client.exec("SET ROLE nihongo_reader");
    try {
      await expect(
        executeProvisioning(client, buildCorpusPilotDataset(), { expectedKana: EXPECTED_KANA })
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.exec("RESET ROLE");
    }

    expect(await counts(client)).toEqual(before);
  });
});

describe("read-only verification", () => {
  it("reports violations on the partial production shape without writing", async () => {
    await bootstrapMindtree();
    const before = await counts(client);
    const verification = await verifyCanonicalFoundation(client, {
      expectedKana: EXPECTED_KANA,
    });
    expect(verification.status.map((v) => v.code)).toContain("DATASET_INCOMPLETE");
    expect(verification.counts).toEqual({ radicals: 55, kanji: 33, composition: 71 });
    expect(await counts(client)).toEqual(before);
  });
});
