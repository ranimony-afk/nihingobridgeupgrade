/**
 * §19 / §14 — Data quality framework tests.
 *
 * DB-independent: every check under test is a pure function over in-memory
 * values. No database, no fixtures from upstream, no I/O.
 */

import { describe, it, expect } from "vitest";

import {
  buildReport,
  compareFindings,
  checkDuplicateIds,
  checkDuplicateContent,
  checkOrphanReferences,
  checkRequiredFields,
  checkProvenanceRef,
  checkTextIntegrity,
  checkControlledVocabulary,
  checkTranslationConflicts,
  hasLoneSurrogate,
  PROVENANCE_PLACEHOLDERS,
  type QualityFinding,
} from "@/services/dataquality/checks";

import {
  VALID_JLPT_LEVELS,
  JLPT_LEVEL_UNKNOWN,
  isValidJlptLevel,
  classifyJlptLevel,
  checkJlptLevels,
  checkJlptLevelDerivation,
  checkSectionCategoryConsistency,
  checkSectionVocabulary,
  checkAnswers,
  checkDifficulty,
  checkExplanations,
  checkTestScoring,
  QUESTION_SECTIONS,
  TEST_SECTION_KEYS,
  CATEGORY_TO_SECTION,
} from "@/services/dataquality/jlptChecks";

import { READING_TYPES, type ReadingClassificationType } from "@/types/lexicalGraph";

const codes = (findings: QualityFinding[]) => findings.map((f) => f.code);

/**
 * The uppercase reading-classification set.
 *
 * `ReadingClassificationType` (src/types/lexicalGraph.ts:253) is a type union,
 * not a runtime value, so the members are restated here. The exhaustiveness
 * assertion below makes that restatement compile-checked: adding a member to the
 * union without adding it here is a type error, and removing one is too.
 */
const READING_CLASSIFICATION_TYPES = [
  "ON",
  "KUN",
  "NANORI",
  "SPECIAL",
  "JUKUJIKUN",
  "ATEJI",
  "IRREGULAR",
  "UNKNOWN",
] as const;

const _readingClassificationIsExhaustive: Record<ReadingClassificationType, true> =
  Object.fromEntries(READING_CLASSIFICATION_TYPES.map((t) => [t, true])) as Record<
    ReadingClassificationType,
    true
  >;

/* ================================================================== *
 * Generic primitives (§19)
 * ================================================================== */

describe("§19 identifier integrity", () => {
  it("detects duplicate ids and ignores blanks", () => {
    const findings = checkDuplicateIds("dictionary_entries", ["a", "b", "a", null, "", undefined, "b"]);
    expect(codes(findings)).toEqual(["DUPLICATE_ID", "DUPLICATE_ID"]);
    expect(findings.every((f) => f.severity === "ERROR")).toBe(true);
    expect(findings.map((f) => f.ref).sort()).toEqual(["a", "b"]);
  });

  it("reports a clean set as clean", () => {
    expect(checkDuplicateIds("dictionary_entries", ["a", "b", "c"])).toEqual([]);
  });

  it("treats duplicate content as a warning, not an error", () => {
    const findings = checkDuplicateContent("dictionary_entries", [
      { id: "de-1", key: "水|みず" },
      { id: "de-2", key: "水|みず" },
      { id: "de-3", key: "火|ひ" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("DUPLICATE_CONTENT");
    expect(findings[0]!.severity).toBe("WARNING");
    expect(findings[0]!.detail).toContain("de-1, de-2");
  });

  it("lists colliding ids deterministically regardless of input order", () => {
    const forward = checkDuplicateContent("t", [
      { id: "b", key: "k" },
      { id: "a", key: "k" },
    ]);
    const reverse = checkDuplicateContent("t", [
      { id: "a", key: "k" },
      { id: "b", key: "k" },
    ]);
    expect(forward[0]!.detail).toBe(reverse[0]!.detail);
  });
});

describe("§19 referential integrity", () => {
  it("flags orphan references as ERROR", () => {
    const findings = checkOrphanReferences(
      "kanji_composition",
      [
        { from: "k-1", to: "k-2" },
        { from: "k-1", to: "k-999" },
      ],
      new Set(["k-1", "k-2"])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("ORPHAN_REFERENCE");
    expect(findings[0]!.detail).toContain("k-999");
  });
});

describe("§19 required fields", () => {
  it("treats null, undefined and empty string alike", () => {
    const findings = checkRequiredFields(
      "dictionary_entries",
      [
        { id: "de-1", fields: { headword: "水", reading: "みず" } },
        { id: "de-2", fields: { headword: "", reading: null } },
        { id: "de-3", fields: { headword: "火" } },
      ],
      ["headword", "reading"]
    );
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.code === "MISSING_REQUIRED_FIELD")).toBe(true);
    expect(findings.map((f) => f.ref)).toEqual(["de-2", "de-2", "de-3"]);
  });

  it("accepts zero and false as present values", () => {
    const findings = checkRequiredFields(
      "t",
      [{ id: "x", fields: { count: 0, flag: false } }],
      ["count", "flag"]
    );
    expect(findings).toEqual([]);
  });
});

describe("§19 provenance hygiene", () => {
  it("rejects every placeholder as ERROR", () => {
    const records = PROVENANCE_PLACEHOLDERS.map((p, i) => ({
      id: `r-${i}`,
      sourceRef: p.toUpperCase(),
    }));
    const findings = checkProvenanceRef("t", records);
    expect(findings).toHaveLength(PROVENANCE_PLACEHOLDERS.length);
    expect(findings.every((f) => f.code === "PLACEHOLDER_PROVENANCE")).toBe(true);
  });

  it("rejects absent provenance separately from placeholders", () => {
    const findings = checkProvenanceRef("t", [
      { id: "r-1", sourceRef: null },
      { id: "r-2", sourceRef: "   " },
      { id: "r-3", sourceRef: undefined },
    ]);
    expect(codes(findings)).toEqual(["MISSING_PROVENANCE", "MISSING_PROVENANCE", "MISSING_PROVENANCE"]);
  });

  it("accepts a real registered source reference", () => {
    expect(
      checkProvenanceRef("t", [{ id: "r-1", sourceRef: "upstream:jmdict:2023-08" }])
    ).toEqual([]);
    expect(
      checkProvenanceRef("t", [{ id: "r-2", sourceRef: "first-party:kanji-mindtree:v1" }])
    ).toEqual([]);
  });
});

describe("§19 text integrity", () => {
  it("detects paired surrogates correctly but flags lone ones", () => {
    expect(hasLoneSurrogate("水")).toBe(false);
    expect(hasLoneSurrogate("𠮷")).toBe(false); // valid surrogate pair
    expect(hasLoneSurrogate("\uD842")).toBe(true); // high surrogate alone
    expect(hasLoneSurrogate("a\uDC00b")).toBe(true); // low surrogate alone
    expect(hasLoneSurrogate("日本語の文")).toBe(false);
  });

  it("flags a truncated emoji as a corrupt string", () => {
    // Slicing UTF-16 [0,1) out of an astral character yields a lone surrogate.
    const truncated = "👍".slice(0, 1);
    expect(hasLoneSurrogate(truncated)).toBe(true);
    const findings = checkTextIntegrity("t", [{ id: "s-1", text: truncated }]);
    expect(codes(findings)).toEqual(["LONE_SURROGATE"]);
    expect(findings[0]!.severity).toBe("ERROR");
  });

  it("separates empty text from control characters from clean text", () => {
    const findings = checkTextIntegrity("t", [
      { id: "s-1", text: "" },
      { id: "s-2", text: "水\u0000火" },
      { id: "s-3", text: "普通の日本語" },
      { id: "s-4", text: null },
    ]);
    // Findings follow record order: s-1 is empty, s-2 carries a control char.
    expect(codes(findings)).toEqual(["EMPTY_TEXT", "CONTROL_CHARACTER"]);
    expect(codes(findings)).not.toContain("LONE_SURROGATE");
  });

  it("accepts tabs and newlines as legitimate whitespace", () => {
    expect(checkTextIntegrity("t", [{ id: "s-1", text: "行1\n行2\tおわり" }])).toEqual([]);
  });
});

describe("§19 controlled vocabularies", () => {
  it("documents that lowercase READING_TYPES and uppercase ReadingClassificationType are distinct sets", () => {
    // THREE vocabularies exist for the same concept, which is a live hazard:
    //   1. READING_TYPES ("onyomi_goon", "kunyomi_standard", ...)  — lowercase,
    //      used as KanjiReadingEdge.readingType
    //   2. ReadingClassificationType ("ON" | "KUN" | ...)          — uppercase,
    //      what the readings API filters on
    //   3. the query alias "on" | "kun" | "all"
    // Neither set is a superset of the other, so a value taken from one and
    // compared against the other silently matches nothing.
    expect(READING_TYPES).toContain("onyomi_goon");
    expect(READING_TYPES).toContain("kunyomi_standard");
    expect(READING_TYPES as readonly string[]).not.toContain("ON");
    expect(READING_TYPES as readonly string[]).not.toContain("KUN");
    expect(READING_CLASSIFICATION_TYPES as readonly string[]).toContain("ON");
    expect(READING_CLASSIFICATION_TYPES as readonly string[]).toContain("KUN");
    expect(READING_CLASSIFICATION_TYPES as readonly string[]).not.toContain("onyomi_goon");
  });

  it("accepts the uppercase classification set and rejects the lowercase edge set", () => {
    const ok = checkControlledVocabulary(
      "kanji_readings",
      [{ id: "r-1", field: "reading_type", value: "ON" }],
      READING_CLASSIFICATION_TYPES
    );
    expect(ok).toEqual([]);

    // Passing an edge readingType where a classification is expected is the
    // silent-zero-rows trap this guards against.
    const bad = checkControlledVocabulary(
      "kanji_readings",
      [{ id: "r-2", field: "reading_type", value: "onyomi_goon" }],
      READING_CLASSIFICATION_TYPES
    );
    expect(codes(bad)).toEqual(["INVALID_CONTROLLED_VALUE"]);
  });

  it("ignores absent values rather than inventing a violation", () => {
    expect(
      checkControlledVocabulary(
        "t",
        [{ id: "r-1", field: "f", value: null }, { id: "r-2", field: "f", value: undefined }],
        ["A", "B"]
      )
    ).toEqual([]);
  });
});

describe("§19 translation conflicts", () => {
  it("flags disagreeing translations for the same entity and language", () => {
    const findings = checkTranslationConflicts("entity_translations", [
      { id: "t-1", entityType: "dictionary", entityId: "de-1", language: "ta", text: "நீர்" },
      { id: "t-2", entityType: "dictionary", entityId: "de-1", language: "ta", text: "தண்ணீர்" },
    ]);
    expect(codes(findings)).toEqual(["TRANSLATION_CONFLICT"]);
    expect(findings[0]!.severity).toBe("WARNING");
    expect(findings[0]!.detail).toContain("2 translations disagree");
  });

  it("does not flag identical translations or different languages", () => {
    const findings = checkTranslationConflicts("entity_translations", [
      { id: "t-1", entityType: "dictionary", entityId: "de-1", language: "ta", text: "நீர்" },
      { id: "t-2", entityType: "dictionary", entityId: "de-1", language: "ta", text: "நீர்" },
      { id: "t-3", entityType: "dictionary", entityId: "de-1", language: "ml", text: "വെള്ളം" },
    ]);
    expect(findings).toEqual([]);
  });

  it("does not conflate different entities that happen to share a text", () => {
    const findings = checkTranslationConflicts("entity_translations", [
      { id: "t-1", entityType: "dictionary", entityId: "de-1", language: "en", text: "water" },
      { id: "t-2", entityType: "dictionary", entityId: "de-2", language: "en", text: "water" },
    ]);
    expect(findings).toEqual([]);
  });
});

describe("§19 report assembly", () => {
  it("sorts by severity then code then ref, and counts each severity", () => {
    const report = buildReport([
      { code: "Z_INFO", severity: "INFO", subject: "t", detail: "" },
      { code: "B_WARN", severity: "WARNING", subject: "t", detail: "" },
      { code: "A_ERR", severity: "ERROR", subject: "t", detail: "" },
      { code: "A_ERR", severity: "ERROR", subject: "t", ref: "a", detail: "" },
      { code: "A_ERR", severity: "ERROR", subject: "t", ref: "b", detail: "" },
    ]);
    // A finding with no ref sorts as the empty string, i.e. before any real ref.
    expect(report.findings.map((f) => `${f.code}:${f.ref ?? "-"}`)).toEqual([
      "A_ERR:-",
      "A_ERR:a",
      "A_ERR:b",
      "B_WARN:-",
      "Z_INFO:-",
    ]);
    expect(report.counts).toEqual({ ERROR: 3, WARNING: 1, INFO: 1 });
  });

  it("produces byte-identical output for shuffled input", () => {
    const a: QualityFinding[] = [
      { code: "X", severity: "WARNING", subject: "s", ref: "1", detail: "d" },
      { code: "Y", severity: "ERROR", subject: "s", ref: "2", detail: "d" },
    ];
    expect(buildReport(a).findings).toEqual(buildReport([...a].reverse()).findings);
  });

  it("compares findings by the documented precedence", () => {
    const mk = (code: string, severity: QualityFinding["severity"], ref?: string): QualityFinding => ({
      code,
      severity,
      subject: "s",
      ref,
      detail: "",
    });
    expect(compareFindings(mk("A", "ERROR"), mk("A", "WARNING"))).toBeLessThan(0);
    expect(compareFindings(mk("A", "ERROR"), mk("B", "ERROR"))).toBeLessThan(0);
    expect(compareFindings(mk("A", "ERROR", "a"), mk("A", "ERROR", "b"))).toBeLessThan(0);
    expect(compareFindings(mk("A", "ERROR", "a"), mk("A", "ERROR", "a"))).toBe(0);
  });
});

/* ================================================================== *
 * JLPT domain rules (§14)
 * ================================================================== */

describe("§14 JLPT level vocabulary", () => {
  it("accepts exactly N5..N1, uppercase", () => {
    expect([...VALID_JLPT_LEVELS]).toEqual(["N5", "N4", "N3", "N2", "N1"]);
    expect(isValidJlptLevel("N1")).toBe(true);
    expect(isValidJlptLevel("n1")).toBe(false);
    expect(isValidJlptLevel("N6")).toBe(false);
    expect(isValidJlptLevel("1")).toBe(false);
  });

  it("classifies the NONE sentinel as unknown, not as a level", () => {
    expect(classifyJlptLevel(JLPT_LEVEL_UNKNOWN)).toBe("unknown");
    expect(classifyJlptLevel(null)).toBe("unknown");
    expect(classifyJlptLevel("")).toBe("unknown");
    expect(classifyJlptLevel("N3")).toBe("known");
    expect(classifyJlptLevel("N7")).toBe("invalid");
    expect(classifyJlptLevel("none")).toBe("invalid"); // case matters
  });
});

describe("§14 stored level checks", () => {
  it("reports the NONE sentinel at INFO and bad values at ERROR", () => {
    const findings = checkJlptLevels("dictionary_entries", [
      { id: "de-1", jlptLevel: "N5" },
      { id: "de-2", jlptLevel: JLPT_LEVEL_UNKNOWN },
      { id: "de-3", jlptLevel: "N9" },
    ]);
    // Record order: de-2 (unknown) precedes de-3 (invalid).
    expect(codes(findings)).toEqual(["JLPT_LEVEL_UNKNOWN", "JLPT_LEVEL_INVALID"]);
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f.severity]));
    expect(byCode.JLPT_LEVEL_UNKNOWN).toBe("INFO");
    expect(byCode.JLPT_LEVEL_INVALID).toBe("ERROR");
  });

  it("does not emit an ERROR per unknown level", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `de-${i}`, jlptLevel: "NONE" }));
    const findings = checkJlptLevels("dictionary_entries", many);
    expect(findings).toHaveLength(500);
    expect(findings.every((f) => f.severity === "INFO")).toBe(true);
  });

  it("detects a level scavenged from a non-level source", () => {
    const findings = checkJlptLevelDerivation("dictionary_entries", [
      { id: "de-1", storedLevel: "N2", rawSource: "2024-07" },
      { id: "de-2", storedLevel: "N1", rawSource: "v1.5" },
      { id: "de-3", storedLevel: "N5", rawSource: "N5" },
      { id: "de-4", storedLevel: "N5", rawSource: "5" },
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.code === "JLPT_LEVEL_DERIVED_FROM_NON_LEVEL_SOURCE")).toBe(true);
    expect(findings.every((f) => f.severity === "ERROR")).toBe(true);
    expect(findings[0]!.detail).toContain("2024-07");
  });

  it("ignores records with no claimed source text", () => {
    expect(
      checkJlptLevelDerivation("t", [
        { id: "a", storedLevel: "N5", rawSource: null },
        { id: "b", storedLevel: "N5", rawSource: undefined },
        { id: "c", storedLevel: "N5", rawSource: "  " },
      ])
    ).toEqual([]);
  });
});

describe("§14 section mapping", () => {
  it("keeps the two section vocabularies distinct", () => {
    expect([...QUESTION_SECTIONS]).toEqual(["vocab", "grammar", "reading", "listening"]);
    expect(TEST_SECTION_KEYS).toContain("language_knowledge_reading");
    expect(QUESTION_SECTIONS as readonly string[]).not.toContain("language_knowledge_reading");
  });

  it("maps every documented category to exactly one section", () => {
    for (const [category, section] of Object.entries(CATEGORY_TO_SECTION)) {
      expect(QUESTION_SECTIONS as readonly string[]).toContain(section);
      expect(category).toMatch(/^[a-z_]+$/);
    }
    expect(Object.keys(CATEGORY_TO_SECTION)).toHaveLength(15);
    expect(CATEGORY_TO_SECTION.kanji_reading).toBe("vocab");
    expect(CATEGORY_TO_SECTION.grammar_form).toBe("grammar");
    expect(CATEGORY_TO_SECTION.listening_quick).toBe("listening");
  });

  it("flags a category filed under the wrong section", () => {
    const findings = checkSectionCategoryConsistency("questions", [
      { id: "q-1", section: "vocab", category: "kanji_reading" },
      { id: "q-2", section: "reading", category: "listening_quick" },
      { id: "q-3", section: "vocab", category: "not_a_category" },
    ]);
    // Record order: q-2 (mismatch) precedes q-3 (unknown category).
    expect(codes(findings)).toEqual([
      "JLPT_SECTION_CATEGORY_MISMATCH",
      "JLPT_CATEGORY_UNKNOWN",
    ]);
    expect(findings[0]!.detail).toContain('"listening"');
  });

  it("validates a section key against the correct vocabulary per table", () => {
    const ok = checkSectionVocabulary(
      "jlpt_test_questions",
      [{ id: "tq-1", sectionKey: "language_knowledge_reading" }],
      TEST_SECTION_KEYS
    );
    expect(ok).toEqual([]);

    // The same value is invalid in the questions vocabulary.
    const bad = checkSectionVocabulary(
      "questions",
      [{ id: "q-1", sectionKey: "language_knowledge_reading" }],
      QUESTION_SECTIONS
    );
    expect(codes(bad)).toEqual(["JLPT_SECTION_UNKNOWN"]);
  });
});

describe("§14 answer validation", () => {
  it("accepts a resolvable multiple-choice answer", () => {
    expect(
      checkAnswers("questions", [
        { id: "q-1", optionIds: ["1", "2", "3", "4"], correctAnswer: "2" },
      ])
    ).toEqual([]);
  });

  it("flags an answer that matches no option — unanswerable", () => {
    const findings = checkAnswers("questions", [
      { id: "q-1", optionIds: ["1", "2", "3", "4"], correctAnswer: "5" },
    ]);
    expect(codes(findings)).toEqual(["JLPT_ANSWER_NOT_AN_OPTION"]);
    expect(findings[0]!.detail).toContain("unanswerable");
  });

  it("flags duplicate option ids that make the answer ambiguous", () => {
    const findings = checkAnswers("questions", [
      { id: "q-1", optionIds: ["1", "2", "2", "4"], correctAnswer: "2" },
    ]);
    expect(codes(findings)).toEqual(["JLPT_ANSWER_AMBIGUOUS"]);
  });

  it("flags a question with no options", () => {
    const findings = checkAnswers("questions", [
      { id: "q-1", optionIds: [], correctAnswer: "1" },
    ]);
    expect(codes(findings).sort()).toEqual(["JLPT_ANSWER_NOT_AN_OPTION", "JLPT_NO_OPTIONS"]);
  });

  it("accepts a well-formed star-order question", () => {
    expect(
      checkAnswers("questions", [
        {
          id: "q-1",
          optionIds: ["1", "2", "3", "4"],
          correctAnswer: "3",
          starOrder: { partIds: ["1", "2", "3", "4"], correctOrder: ["2", "4", "1", "3"], starPosition: 3 },
        },
      ])
    ).toEqual([]);
  });

  it("flags a star order that is not a permutation of its parts", () => {
    const findings = checkAnswers("questions", [
      {
        id: "q-1",
        optionIds: ["1", "2", "3", "4"],
        correctAnswer: "3",
        starOrder: {
          partIds: ["1", "2", "3", "4"],
          correctOrder: ["2", "4", "1", "9"],
          starPosition: 3,
        },
      },
    ]);
    // Length matches (4 parts, 4 entries), so LENGTH is not raised; the order
    // both references a stranger ("9") and omits a real part ("3").
    const found = codes(findings).sort();
    expect(found).toEqual(["JLPT_STAR_ORDER_MISSING_PART", "JLPT_STAR_ORDER_UNKNOWN_PART"]);
  });

  it("flags a correctOrder whose length differs from the part count", () => {
    const findings = checkAnswers("questions", [
      {
        id: "q-1",
        optionIds: ["1", "2", "3"],
        correctAnswer: "1",
        starOrder: { partIds: ["1", "2", "3"], correctOrder: ["1", "2"], starPosition: 1 },
      },
    ]);
    expect(codes(findings)).toContain("JLPT_STAR_ORDER_LENGTH");
  });

  it("flags a repeated part and an out-of-range star position", () => {
    const findings = checkAnswers("questions", [
      {
        id: "q-1",
        optionIds: ["1", "2", "3"],
        correctAnswer: "1",
        starOrder: { partIds: ["1", "2", "3"], correctOrder: ["1", "1", "2"], starPosition: 5 },
      },
    ]);
    const found = codes(findings).sort();
    expect(found).toEqual([
      "JLPT_STAR_ORDER_DUPLICATE",
      "JLPT_STAR_ORDER_MISSING_PART",
      "JLPT_STAR_POSITION_OUT_OF_RANGE",
    ]);
    const pos = findings.find((f) => f.code === "JLPT_STAR_POSITION_OUT_OF_RANGE")!;
    expect(pos.detail).toContain("1..3");
  });

  it("accepts star position 1 and the top of the range, rejects 0", () => {
    const mk = (starPosition: number) => ({
      id: "q-1",
      optionIds: ["1", "2"],
      correctAnswer: "1",
      starOrder: { partIds: ["1", "2"], correctOrder: ["1", "2"], starPosition },
    });
    expect(checkAnswers("questions", [mk(1)])).toEqual([]);
    expect(checkAnswers("questions", [mk(2)])).toEqual([]);
    expect(codes(checkAnswers("questions", [mk(0)]))).toEqual(["JLPT_STAR_POSITION_OUT_OF_RANGE"]);
  });
});

describe("§14 difficulty", () => {
  it("accepts 1..5 inclusive and rejects everything else", () => {
    const findings = checkDifficulty("questions", [
      { id: "q-1", difficulty: 1 },
      { id: "q-2", difficulty: 5 },
      { id: "q-3", difficulty: 0 },
      { id: "q-4", difficulty: 6 },
      { id: "q-5", difficulty: 2.5 },
      { id: "q-6", difficulty: null },
    ]);
    expect(codes(findings)).toEqual([
      "JLPT_DIFFICULTY_INVALID",
      "JLPT_DIFFICULTY_INVALID",
      "JLPT_DIFFICULTY_INVALID",
      "JLPT_DIFFICULTY_MISSING",
    ]);
    expect(findings[3]!.severity).toBe("WARNING");
  });
});

describe("§14 explanations and translations", () => {
  it("distinguishes empty from present", () => {
    const findings = checkExplanations("questions", [
      { id: "q-1", promptTranslation: "What does this mean?", explanation: "Because..." },
      { id: "q-2", promptTranslation: "", explanation: "   " },
    ]);
    // Translation is checked before explanation within each record.
    expect(codes(findings)).toEqual(["JLPT_TRANSLATION_MISSING", "JLPT_EXPLANATION_MISSING"]);
  });
});

describe("§14 test scoring", () => {
  const good = {
    id: "jlpt-n5-sample-01",
    totalScore: 180,
    passingScore: 80,
    sectionConfigs: {
      language_knowledge_reading: { maxScore: 120, passScore: 38, mondaiList: [1, 2, 3, 4, 5, 6, 7] },
      listening: { maxScore: 60, passScore: 19, mondaiList: [1, 2, 3, 4] },
    },
  };

  it("accepts a consistent configuration", () => {
    expect(checkTestScoring("jlpt_tests", [good])).toEqual([]);
  });

  it("flags section maxima that do not sum to the total", () => {
    const findings = checkTestScoring("jlpt_tests", [
      {
        ...good,
        sectionConfigs: {
          ...good.sectionConfigs,
          listening: { maxScore: 60, passScore: 19, mondaiList: [] },
        },
      },
    ]);
    expect(codes(findings)).toEqual(["JLPT_TEST_SECTION_NO_MONDAI"]);
  });

  it("flags a real total mismatch", () => {
    const findings = checkTestScoring("jlpt_tests", [{ ...good, totalScore: 200 }]);
    expect(codes(findings)).toEqual(["JLPT_TEST_SECTION_TOTAL_MISMATCH"]);
    expect(findings[0]!.detail).toContain("sum to 180");
  });

  it("flags out-of-range pass marks and non-positive maxima", () => {
    const findings = checkTestScoring("jlpt_tests", [
      {
        id: "bad",
        totalScore: 100,
        passingScore: 0,
        sectionConfigs: {
          a: { maxScore: 100, passScore: 150, mondaiList: [1] },
        },
      },
    ]);
    // The oversized sectional pass mark also pushes the sectional sum past the
    // total, which is reported separately as a WARNING.
    const found = codes(findings).sort();
    expect(found).toEqual([
      "JLPT_TEST_PASS_MARK_OUT_OF_RANGE",
      "JLPT_TEST_SECTION_PASS_OUT_OF_RANGE",
      "JLPT_TEST_SECTION_PASS_SUM_EXCEEDS_TOTAL",
    ]);
    const sum = findings.find((f) => f.code === "JLPT_TEST_SECTION_PASS_SUM_EXCEEDS_TOTAL")!;
    expect(sum.severity).toBe("WARNING");
  });

  it("flags a test with no sections", () => {
    const findings = checkTestScoring("jlpt_tests", [
      { id: "empty", totalScore: 180, passingScore: 80, sectionConfigs: {} },
    ]);
    expect(codes(findings)).toEqual(["JLPT_TEST_NO_SECTIONS"]);
  });

  it("flags non-positive mondai numbers", () => {
    const findings = checkTestScoring("jlpt_tests", [
      {
        id: "bad-mondai",
        totalScore: 30,
        passingScore: 20,
        sectionConfigs: { x: { maxScore: 30, passScore: 10, mondaiList: [1, 0, 2] } },
      },
    ]);
    expect(codes(findings)).toEqual(["JLPT_TEST_SECTION_INVALID_MONDAI"]);
  });
});
