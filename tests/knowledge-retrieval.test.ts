/**
 * Phase 13.2 deployment gate: AI retrieval tests return source records.
 *
 * These tests run against PostgreSQL and assert that KnowledgeRetriever
 * returns real rows (not synthesised text) from all four knowledge
 * domains, each carrying resolvable provenance.
 */

import { beforeAll, describe, expect, it } from "vitest";
import {
  KnowledgeRetriever,
  type DictionaryRecord,
  type GrammarRecord,
  type KanjiRecord,
  type SentenceRecord,
} from "@/services/ai/knowledgeRetriever";
import { KnowledgeCorpusService } from "@/services/knowledge/corpusService";
import { KnowledgeService } from "@/services/knowledge/knowledgeService";

beforeAll(async () => {
  await KnowledgeCorpusService.ensureSeeded();
  await KnowledgeService.ensureSeeded();
});

describe("corpus availability", () => {
  it("has seeded all four knowledge domains", async () => {
    const stats = await KnowledgeCorpusService.getStats();
    expect(stats.dictionary).toBeGreaterThan(0);
    expect(stats.grammar).toBeGreaterThan(0);
    expect(stats.sentences).toBeGreaterThan(0);
    expect(stats.sources).toBeGreaterThan(0);
  });
});

describe("dictionary retrieval", () => {
  it("returns the dictionary source record for a Japanese headword", async () => {
    const result = await KnowledgeRetriever.retrieve("水", { domains: ["dictionary"] });

    expect(result.queryType).toBe("japanese");
    expect(result.totalChunks).toBeGreaterThan(0);

    const chunk = result.chunks.find((c) => c.id === "de-mizu");
    expect(chunk).toBeDefined();

    const record = chunk!.record as DictionaryRecord;
    expect(record.id).toBe("de-mizu");
    expect(record.headword).toBe("水");
    expect(record.reading).toBe("みず");
    expect(record.senses.flatMap((s) => s.glosses)).toContain("water");
    expect(record.sourceRef).toBe("first-party:dictionary-core:v1");
  });

  it("matches romaji and English glosses to the same record", async () => {
    const romaji = await KnowledgeRetriever.retrieve("mizu", { domains: ["dictionary"] });
    const english = await KnowledgeRetriever.retrieve("water", { domains: ["dictionary"] });

    expect(romaji.queryType).toBe("romaji");
    expect(romaji.chunks.map((c) => c.id)).toContain("de-mizu");
    expect(english.chunks.map((c) => c.id)).toContain("de-mizu");
  });
});

describe("kanji retrieval", () => {
  it("returns the canonical kanji source record", async () => {
    const result = await KnowledgeRetriever.retrieve("聞", { domains: ["kanji"] });

    const chunk = result.chunks.find((c) => c.domain === "kanji");
    expect(chunk).toBeDefined();

    const record = chunk!.record as KanjiRecord;
    expect(record.character).toBe("聞");
    expect(record.meaning.length).toBeGreaterThan(0);
    expect(Array.isArray(record.readingsOn)).toBe(true);
    expect(record.strokeCount).toBeGreaterThan(0);
    expect(record.sourceRef).toBeTruthy();
  });
});

describe("grammar retrieval", () => {
  it("returns the grammar source record with teaching fields", async () => {
    const result = await KnowledgeRetriever.retrieve("てから", { domains: ["grammar"] });

    const chunk = result.chunks.find((c) => c.id === "gp-te-kara");
    expect(chunk).toBeDefined();

    const record = chunk!.record as GrammarRecord;
    expect(record.slug).toBe("te-kara");
    expect(record.structure).toContain("から");
    expect(record.explanation.length).toBeGreaterThan(20);
    expect(record.commonMistakes.length).toBeGreaterThan(0);
    expect(record.sourceRef).toBe("first-party:grammar-core:v1");
  });
});

describe("sentence retrieval", () => {
  it("returns example sentence source records", async () => {
    const result = await KnowledgeRetriever.retrieve("毎日", { domains: ["sentence"] });

    expect(result.totalChunks).toBeGreaterThan(0);
    const chunk = result.chunks[0]!;
    const record = chunk.record as SentenceRecord;

    expect(chunk.domain).toBe("sentence");
    expect(record.japanese).toContain("毎日");
    expect(record.reading.length).toBeGreaterThan(0);
    expect(record.english.length).toBeGreaterThan(0);
    expect(["first-party:sentences-core:v1", "tatoeba:corpus:2024-07"]).toContain(record.sourceRef);
  });
});

describe("cross-domain retrieval", () => {
  it("retrieves records from multiple domains for one query", async () => {
    const result = await KnowledgeRetriever.retrieve("聞", { maxTotal: 20 });

    expect(result.domainCounts.kanji).toBeGreaterThan(0);
    expect(result.domainCounts.dictionary).toBeGreaterThan(0);
    expect(result.domainCounts.sentence).toBeGreaterThan(0);

    // Chunks stay ordered by relevance.
    const scores = result.chunks.map((c) => c.relevance);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("honours the JLPT level filter", async () => {
    const result = await KnowledgeRetriever.retrieve("水", { jlptLevel: "N5" });
    expect(result.totalChunks).toBeGreaterThan(0);
    for (const chunk of result.chunks) {
      expect(chunk.jlptLevel).toBe("N5");
    }
  });

  it("returns an empty, well-formed result for a blank query", async () => {
    const result = await KnowledgeRetriever.retrieve("   ");
    expect(result.queryType).toBe("empty");
    expect(result.chunks).toEqual([]);
    expect(result.contextText).toBe("");
  });
});

describe("provenance", () => {
  it("resolves every retrieved record to a licensed source", async () => {
    const result = await KnowledgeRetriever.retrieve("聞", { maxTotal: 20 });

    expect(result.sources.length).toBeGreaterThan(0);
    const refs = new Set(result.sources.map((s) => s.sourceRef));

    for (const chunk of result.chunks) {
      expect(chunk.sourceRef).toBeTruthy();
      expect(refs.has(chunk.sourceRef)).toBe(true);
    }

    for (const source of result.sources) {
      expect(source.name.length).toBeGreaterThan(0);
      expect(source.version.length).toBeGreaterThan(0);
      expect(source.license.length).toBeGreaterThan(0);
    }
  });

  it("emits citation-tagged context for prompt grounding", async () => {
    const result = await KnowledgeRetriever.retrieve("水", { maxTotal: 5 });

    expect(result.contextText).toContain("KNOWLEDGE CONTEXT");
    expect(result.contextText).toContain("source=");
    expect(result.contextText).toContain("dictionary:de-mizu");
    expect(result.estimatedTokens).toBeGreaterThan(0);
  });
});

describe("entity retrieval", () => {
  it("returns a grammar pattern with its linked example sentences", async () => {
    const result = await KnowledgeRetriever.retrieveEntity("grammar", "gp-te-kara");

    const grammar = result.chunks.find((c) => c.domain === "grammar");
    expect((grammar!.record as GrammarRecord).id).toBe("gp-te-kara");

    const sentences = result.chunks.filter((c) => c.domain === "sentence");
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      expect((sentence.record as SentenceRecord).grammarId).toBe("gp-te-kara");
    }
  });

  it("resolves a grammar pattern by slug", async () => {
    const result = await KnowledgeRetriever.retrieveEntity("grammar", "te-kara");
    expect(result.chunks.some((c) => c.id === "gp-te-kara")).toBe(true);
  });

  it("returns linked sentences and kanji for a dictionary entry", async () => {
    const result = await KnowledgeRetriever.retrieveEntity("dictionary", "de-jikan");

    expect(result.chunks.some((c) => c.id === "de-jikan")).toBe(true);
    const kanji = result.chunks.filter((c) => c.domain === "kanji");
    expect(kanji.length).toBeGreaterThan(0);
    expect(kanji.map((c) => (c.record as KanjiRecord).character)).toContain("時");
  });
});
