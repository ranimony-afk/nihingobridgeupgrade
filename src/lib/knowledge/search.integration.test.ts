import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeDatasets, knowledgeLexemes } from "@/db/schema";
import { getLexemeDetail, searchKnowledge } from "@/lib/knowledge/service";

const datasetIds: string[] = [];
const lexemeIds: string[] = [];

afterEach(async () => {
  for (const lexemeId of lexemeIds.splice(0)) {
    await db.delete(knowledgeLexemes).where(eq(knowledgeLexemes.id, lexemeId));
  }
  for (const datasetId of datasetIds.splice(0)) {
    await db.delete(knowledgeDatasets).where(eq(knowledgeDatasets.id, datasetId));
  }
});

describe("knowledge graph search integration", () => {
  it("searches a normalized lexeme and returns source-backed detail", async () => {
    const key = `test_knowledge_${crypto.randomUUID().replace(/-/g, "")}`;
    const [dataset] = await db
      .insert(knowledgeDatasets)
      .values({ key, title: "Knowledge Test Dataset", sourceUrl: "https://example.test/source", license: "Test", attribution: "Test", format: "jsonl" })
      .returning();
    datasetIds.push(dataset.id);

    const [lexeme] = await db
      .insert(knowledgeLexemes)
      .values({
        datasetId: dataset.id,
        externalId: "lexeme-bridge",
        primarySpelling: "橋",
        primaryReading: "はし",
        primaryGloss: "bridge",
        common: true,
        searchText: "橋 はし bridge Japanese bridge",
        sourceHash: "test-hash",
      })
      .returning();
    lexemeIds.push(lexeme.id);

    const results = await searchKnowledge({ query: "bridge", kinds: ["lexeme"] });
    expect(results.some((result) => result.id === lexeme.id && result.title === "橋")).toBe(true);

    const detail = await getLexemeDetail(lexeme.id);
    expect(detail?.primaryReading).toBe("はし");
    expect(detail?.primaryGloss).toBe("bridge");
  });
});
