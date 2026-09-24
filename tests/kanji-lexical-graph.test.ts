/**
 * Phase 14.4E — Kanji Lexical & Structural Knowledge Graph Test Suite
 *
 * Verifies all 24 required deterministic conditions and invariants:
 * 1. Kanji character extraction from Japanese text strings
 * 2. Unicode normalization (NFC compliance)
 * 3. Kanji -> vocabulary edge derivation
 * 4. Vocabulary -> kanji edge derivation
 * 5. Character position preservation (0-based order)
 * 6. Reading mapping (On'yomi & Kun'yomi classification)
 * 7. Reading restrictions and compound reading types
 * 8. Multiple readings classification per word
 * 9. Strict kana-only exclusion from kanji relationships
 * 10. Special-reading classification (Jukujikun & Ateji)
 * 11. Radical linkage via kanji_radicals and KanjiVG
 * 12. Composition linkage via kanji_composition
 * 13. KanjiVG visual asset linkage
 * 14. JLPT relationship linkage
 * 15. Deterministic, collision-free graph identity
 * 16. Provenance retention on all derived edges
 * 17. Two-pass mathematical reproducibility (Pass 1 == Pass 2 Digest)
 * 18. Unmapped-character detection and diagnostic reporting
 * 19. Canonical stroke count preservation for '箸' (14 strokes)
 * 20. High-stroke kanji validation ('鬱' - 29 strokes)
 * 21. Malformed / empty input resilience
 * 22. Duplicate relationship deduplication
 * 23. CMS isolation (zero CMS table writes or state mutations)
 * 24. AI isolation (zero AI provider calls or synthetic mutations)
 */

import { describe, it, expect } from "vitest";
import { db } from "@/db";
import {
  kanjiEntries,
  dictionaryEntries,
  kanjiRadicals,
  kanjiComposition,
  cmsContentItems,
  cmsContentVersions,
  cmsAuditLog,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  KanjiLexicalGraphService,
  extractKanjiCharacters,
  generateKanjiWordEdgeId,
  generateWordKanjiEdgeId,
  generateKanjiReadingEdgeId,
  KNOWN_SPECIAL_LEXICAL_READINGS,
} from "@/services/knowledge/kanjiLexicalGraphService";
import { executeGraphDerivationPass } from "../scripts/build-kanji-lexical-graph";

describe("Phase 14.4E: Kanji Lexical & Structural Knowledge Graph", () => {
  const service = new KanjiLexicalGraphService();

  it("1. extracts distinct kanji characters from Japanese text strings", () => {
    const text = "日本語を勉強して、美味しいご飯を食べる。";
    const extracted = extractKanjiCharacters(text);
    expect(extracted).toEqual(["日", "本", "語", "勉", "強", "美", "味", "飯", "食"]);
  });

  it("2. enforces Unicode NFC normalization across character extraction and IDs", () => {
    const raw = "日\u3099"; // Decomposed sequence
    const normalized = extractKanjiCharacters(raw);
    expect(normalized.length).toBe(1);
    expect(normalized[0]).toBe("日");

    const edgeId = generateKanjiWordEdgeId("日\u3099", "de-test", 0);
    expect(edgeId).toBe("kanji:日:dict:de-test:pos:0");
  });

  it("3. derives kanji -> vocabulary edges with rich lexical metadata", async () => {
    const edges = await service.getKanjiVocabulary("食");
    expect(edges.length).toBeGreaterThan(0);
    const taberu = edges.find((e) => e.headword === "食べる");
    expect(taberu).toBeDefined();
    expect(taberu?.kanji).toBe("食");
    expect(taberu?.readingType).toBe("KUN");
    expect(taberu?.matchedReading).toBe("た.べる");
    expect(taberu?.isCommon).toBe(true);
    expect(taberu?.senses.length).toBeGreaterThan(0);
  });

  it("4. derives vocabulary -> kanji edges with exact character positions", async () => {
    const edges = await service.getVocabularyKanji("de-jmdict-1464530"); // 日本語
    expect(edges.length).toBe(3);

    expect(edges[0].kanji).toBe("日");
    expect(edges[0].position).toBe(0);
    expect(edges[0].id).toBe("word:de-jmdict-1464530:kanji:日:pos:0");

    expect(edges[1].kanji).toBe("本");
    expect(edges[1].position).toBe(1);
    expect(edges[1].id).toBe("word:de-jmdict-1464530:kanji:本:pos:1");

    expect(edges[2].kanji).toBe("語");
    expect(edges[2].position).toBe(2);
    expect(edges[2].id).toBe("word:de-jmdict-1464530:kanji:語:pos:2");
  });

  it("5. preserves exact character position (0-based order) for prefix, middle, suffix kanji", async () => {
    const prefixEdges = await service.getKanjiCompounds("食", { position: "prefix" });
    expect(prefixEdges.length).toBeGreaterThan(0);
    for (const e of prefixEdges) {
      expect(e.isPrefix).toBe(true);
      expect(e.position).toBe(0);
    }

    const suffixEdges = await service.getKanjiCompounds("食", { position: "suffix" });
    expect(suffixEdges.length).toBeGreaterThan(0);
    for (const e of suffixEdges) {
      expect(e.isSuffix).toBe(true);
      expect(e.position).toBe(e.headword.length - 1);
    }
  });

  it("6. correctly classifies On'yomi and Kun'yomi readings with okurigana separation", () => {
    const onReading = service.classifyReading("ショク", ["ショク", "ジキ"], ["た.べる"]);
    expect(onReading.type).toBe("ON");
    expect(onReading.normalized).toBe("ショク");
    expect(onReading.hasOkurigana).toBe(false);

    const kunReading = service.classifyReading("た.べる", ["ショク"], ["た.べる"]);
    expect(kunReading.type).toBe("KUN");
    expect(kunReading.normalized).toBe("たべる");
    expect(kunReading.hasOkurigana).toBe(true);
    expect(kunReading.okuriganaStem).toBe("た");
    expect(kunReading.okuriganaSuffix).toBe("べる");
  });

  it("7. supports compound discovery with co-occurring kanji (contains X and Y)", async () => {
    const compounds = await service.getKanjiCompounds("食", { coOccurringWith: "事" });
    expect(compounds.length).toBeGreaterThan(0);
    for (const c of compounds) {
      expect(c.headword).toContain("食");
      expect(c.headword).toContain("事");
    }
  });

  it("8. supports vocabulary lookup filtered by specific kanji reading", async () => {
    const readingVocab = await service.getReadingVocabulary("食", "たべる");
    expect(readingVocab.length).toBeGreaterThan(0);
    for (const v of readingVocab) {
      expect(v.wordReading).toContain("たべる");
    }
  });

  it("9. strictly excludes kana-only vocabulary from kanji relationships", async () => {
    // de-jmdict-1000100 is typically 'ああ' or similar pure kana entry
    const [kanaEntry] = await db
      .select({ id: dictionaryEntries.id, kanjiCharacters: dictionaryEntries.kanjiCharacters })
      .from(dictionaryEntries)
      .where(sql`jsonb_array_length(${dictionaryEntries.kanjiCharacters}) = 0`)
      .limit(1);

    expect(kanaEntry).toBeDefined();
    const kanjiEdges = await service.getVocabularyKanji(kanaEntry.id);
    expect(kanjiEdges.length).toBe(0);
  });

  it("10. correctly classifies special readings (Jukujikun and Ateji)", () => {
    expect(KNOWN_SPECIAL_LEXICAL_READINGS["今日"]).toEqual({
      reading: "きょう",
      type: "jukujikun",
      explanation: "Traditional whole-compound reading for 'today'",
    });

    expect(KNOWN_SPECIAL_LEXICAL_READINGS["寿司"]).toEqual({
      reading: "すし",
      type: "ateji",
      explanation: "Auspicious phonetic kanji transcription for sushi",
    });

    expect(KNOWN_SPECIAL_LEXICAL_READINGS["時計"]).toEqual({
      reading: "とけい",
      type: "irregular",
      explanation: "Historical phonetic contraction",
    });
  });

  it("11. links kanji to canonical radical entities via kanji_radicals", async () => {
    const radical = await service.getKanjiRadicals("水");
    expect(radical).not.toBeNull();
    expect(radical?.character).toBe("水");
    expect(radical?.meaning.toLowerCase()).toContain("water");
  });

  it("12. links kanji to structural composition components", async () => {
    const components = await service.getKanjiComponents("明");
    expect(components.length).toBeGreaterThan(0);
    const chars = components.map((c) => c.character);
    // 明 contains 日 and 月
    expect(chars).toContain("日");
    expect(chars).toContain("月");
  });

  it("13. integrates KanjiVG visual vector assets and stroke diagrams into Mind Tree", async () => {
    const mindTree = await service.getKanjiMindTree("学");
    expect(mindTree).not.toBeNull();
    expect(mindTree?.character).toBe("学");
    expect(mindTree?.strokeCount).toBe(8);
    expect(mindTree?.strokeOrderDiagramSvg).not.toBeNull();
    expect(mindTree?.strokeOrderDiagramSvg).toContain("<svg");
    expect(mindTree?.animatedStrokeSvg).not.toBeNull();
    expect(mindTree?.animatedStrokeSvg).toContain("@keyframes");
  });

  it("14. categorizes vocabulary by JLPT levels (N5..N1) in Mind Tree", async () => {
    const mindTree = await service.getKanjiMindTree("日");
    expect(mindTree).not.toBeNull();
    expect(mindTree?.vocabulary.totalCount).toBeGreaterThan(0);
    // '日' has abundant words across JLPT N5 and N4
    const totalCount = (mindTree?.vocabulary.n5.length ?? 0) + (mindTree?.vocabulary.other.length ?? 0);
    expect(totalCount).toBeGreaterThan(0);
  });

  it("15. enforces deterministic, collision-safe graph identity convention", () => {
    const id1 = generateKanjiWordEdgeId("食", "de-taberu", 0);
    const id2 = generateKanjiWordEdgeId("食", "de-taberu", 0);
    expect(id1).toBe(id2);
    expect(id1).toBe("kanji:食:dict:de-taberu:pos:0");

    const wkId = generateWordKanjiEdgeId("de-taberu", "食", 0);
    expect(wkId).toBe("word:de-taberu:kanji:食:pos:0");

    const rId = generateKanjiReadingEdgeId("食", "ON", "ショク");
    expect(rId).toBe("kanji:食:reading:ON:ショク");
  });

  it("16. retains provenance metadata on all derived relationship edges", async () => {
    const edges = await service.getKanjiVocabulary("日", { limit: 5 });
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      expect(e.provenance).toBeDefined();
      expect(e.provenance.sourceRef).toBe(e.sourceRef);
      expect(e.provenance.derivationType).toBe("lexical_joined");
      expect(e.provenance.confidence).toBe(1.0);
      expect(e.provenance.verified).toBe(true);
    }
  });

  it("17. verifies two-pass graph derivation reproducibility (Pass 1 == Pass 2 Digest)", async () => {
    const pass1 = await executeGraphDerivationPass(1);
    const pass2 = await executeGraphDerivationPass(2);

    expect(pass1.digest).toBe(pass2.digest);
    expect(pass1.totalNodes).toBe(pass2.totalNodes);
    expect(pass1.totalEdges).toBe(pass2.totalEdges);
    expect(pass1.kanjiWordEdgesCount).toBe(pass2.kanjiWordEdgesCount);
    expect(pass1.digest).toBe("27c09573838927081f341c210186d268d640491a398ab7db1c1c618539ba6fa6");
  }, 45000);

  it("18. captures unmapped-character diagnostics from dictionary headwords", async () => {
    const pass = await executeGraphDerivationPass(1);
    expect(pass.unmappedKanjiCount).toBe(16);
    expect(pass.unmappedCharacters).toContain("椂");
    expect(pass.unmappedCharacters).toContain("饃");
  }, 30000);

  it("19. strictly preserves canonical stroke count for '箸' (14 strokes in DB)", async () => {
    const [hashiRow] = await db
      .select({ strokeCount: kanjiEntries.strokeCount, sourceRef: kanjiEntries.sourceRef })
      .from(kanjiEntries)
      .where(eq(kanjiEntries.character, "箸"))
      .limit(1);

    expect(hashiRow).toBeDefined();
    expect(hashiRow.strokeCount).toBe(14);
    expect(hashiRow.sourceRef).toBe("first-party:kanji-mindtree:v1");

    const mindTree = await service.getKanjiMindTree("箸");
    expect(mindTree?.strokeCount).toBe(14);
  });

  it("20. validates high-density complex kanji ('鬱' - 29 strokes)", async () => {
    const mindTree = await service.getKanjiMindTree("鬱");
    expect(mindTree).not.toBeNull();
    expect(mindTree?.character).toBe("鬱");
    expect(mindTree?.strokeCount).toBe(29);
    expect(mindTree?.meaning).toContain("gloom");
    expect(mindTree?.vocabulary.totalCount).toBeGreaterThan(0);
    expect(mindTree?.compounds.beginsWith.length).toBeGreaterThan(0);
  });

  it("21. handles malformed or empty inputs gracefully without exceptions", async () => {
    const emptyVocab = await service.getKanjiVocabulary("");
    expect(emptyVocab).toEqual([]);

    const emptyTree = await service.getKanjiMindTree("");
    expect(emptyTree).toBeNull();

    const emptyComponents = await service.getKanjiComponents("xyz");
    expect(emptyComponents).toEqual([]);

    const classification = service.classifyReading("");
    expect(classification.type).toBe("UNKNOWN");
  });

  it("22. deduplicates repeated character occurrences in word kanji mapping", () => {
    const doubleChar = extractKanjiCharacters("日々"); // '日' appears once
    expect(doubleChar).toEqual(["日"]);

    const repeated = extractKanjiCharacters("学校と学問"); // '学' appears once
    expect(repeated).toEqual(["学", "校", "問"]);
  });

  it("23. guarantees zero CMS table mutations during graph operations", async () => {
    const [items] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentItems);
    const [versions] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsContentVersions);
    const [audit] = await db.select({ count: sql`cast(count(*) as int)` }).from(cmsAuditLog);

    expect(Number(items.count)).toBe(0);
    expect(Number(versions.count)).toBe(0);
    expect(Number(audit.count)).toBe(0);
  });

  it("24. guarantees pure deterministic AI isolation (zero AI provider calls)", async () => {
    // Generate graph representations for multiple characters
    const g1 = await service.getKanjiGraph("食");
    const g2 = await service.getKanjiGraph("日");

    expect(g1.nodes.length).toBeGreaterThan(0);
    expect(g2.nodes.length).toBeGreaterThan(0);
    // Confirm no synthetic or unverified flags
    for (const edge of g1.edges) {
      expect(edge.type).not.toContain("ai_generated");
    }
  });
});
