import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KANJIVG_ATTRIBUTION,
  KANJIVG_LICENSE,
  KANJIVG_SOURCE_REF,
  KANJIVG_SOURCE_VERSION,
  KANJIVG_TRANSFORMATION_VERSION,
  parseKanjiVgSvg,
} from "../src/lib/kanji/kanjiVgSvgAdapter";
import {
  getMindTreeEntry,
  listMindTreeCatalog,
  validateMindTreeSlice,
} from "../src/lib/kanji/kanjiMindtreeCatalog";
import {
  KANJIDIC2_MINDTREE_LICENSE,
  KANJIDIC2_MINDTREE_SLICE_SHA256,
  validateKanjidic2MindTreeFacts,
} from "../src/lib/kanji/kanjidic2MindtreeFacts";
import { MINDTREE_LEARNING_GRAPH_LIMITS } from "../src/lib/kanji/learningGraph";
import {
  INITIAL_MINDTREE_JOURNEY_STATE,
  mindTreeJourneyReducer,
  segmentMnemonicStory,
} from "../src/lib/kanji/mindtreeLearningJourney";
import { validateStructuralEvidenceGraph } from "../src/lib/kanji/structuralEvidenceGraph";

const digest = "a".repeat(64);
const fixtureSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg [<!ATTLIST g kvg:element CDATA #IMPLIED>]>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 109 109" width="109" height="109">
<g id="kvg:StrokePaths_04f11" style="fill:none;stroke:#000000;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;">
  <g id="kvg:04f11" kvg:element="休">
    <g id="left" kvg:element="亻" kvg:position="left" kvg:radical="general">
      <path id="kvg:04f11-s1" kvg:type="㇑" d="M10,10L20,30"/>
    </g>
    <g id="right" kvg:element="木" kvg:position="right">
      <g id="right-detail"><path id="kvg:04f11-s2" d="M30,10L40,30"/></g>
    </g>
  </g>
</g>
<g id="kvg:StrokeNumbers_04f11"><text>1</text></g>
</svg>`;

const fixtureExpected = {
  sourceRef: KANJIVG_SOURCE_REF,
  sourceVersion: KANJIVG_SOURCE_VERSION,
  declaredContentDigest: digest,
  transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
  license: KANJIVG_LICENSE,
  attribution: KANJIVG_ATTRIBUTION,
};

describe("KanjiVG SVG adapter", () => {
  it("preserves exact annotated occurrences, nested grouping, and path association", () => {
    const result = parseKanjiVgSvg({ character: "休", sourceFile: "kanji/04f11.svg", sourceFileSha256: digest, svgText: fixtureSvg });
    expect(result.rootGroupId).toBe("kvg:04f11");
    expect(result.viewBox).toBe("0 0 109 109");
    expect(result.sourceStrokeWidth).toBe(3);
    expect(result.groups.map((group) => group.element)).toEqual(["休", "亻", "木", null]);
    expect(result.groups[1]).toMatchObject({ position: "left", radicalMarker: "general", phoneticMarker: null });
    expect(result.groups[3]).toMatchObject({ parentOccurrenceId: result.groups[2].occurrenceId });
    expect(result.paths).toHaveLength(2);
    expect(result.paths[0]).toMatchObject({ sourcePathId: "kvg:04f11-s1", componentOccurrenceId: result.groups[1].occurrenceId });
    expect(result.paths[1]).toMatchObject({ sourcePathId: "kvg:04f11-s2", componentOccurrenceId: result.groups[2].occurrenceId });
    expect(validateStructuralEvidenceGraph(result.graph, fixtureExpected)).toEqual({ valid: true, issues: [] });
  });

  it("rejects codepoint/file/root mismatches and unsafe SVG content", () => {
    expect(() => parseKanjiVgSvg({ character: "明", sourceFile: "kanji/04f11.svg", sourceFileSha256: digest, svgText: fixtureSvg })).toThrow(/filename code point/);
    expect(() => parseKanjiVgSvg({ character: "休", sourceFile: "kanji/04f11.svg", sourceFileSha256: digest, svgText: fixtureSvg.replace('kvg:element="休"', 'kvg:element="体"') })).toThrow(/root kvg:element/);
    expect(() => parseKanjiVgSvg({ character: "休", sourceFile: "kanji/04f11.svg", sourceFileSha256: "bad", svgText: fixtureSvg })).toThrow(/SHA-256/);
    expect(() => parseKanjiVgSvg({ character: "休", sourceFile: "kanji/04f11.svg", sourceFileSha256: digest, svgText: fixtureSvg.replace("<g id=\"right-detail\">", "<foreignObject id=\"right-detail\">") })).toThrow(/unsafe or unsupported/);
  });
});

describe("M3 source-backed MindTree slice", () => {
  it("validates matching 100-record KANJIDIC2 and KanjiVG artifacts and stable indexes", () => {
    expect(validateKanjidic2MindTreeFacts()).toEqual({ valid: true, issues: [] });
    expect(validateMindTreeSlice()).toEqual({ valid: true, issues: [] });
    expect(KANJIDIC2_MINDTREE_LICENSE).toBe("CC-BY-SA-4.0");
    expect(KANJIDIC2_MINDTREE_SLICE_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const catalog = listMindTreeCatalog();
    expect(catalog).toHaveLength(100);
    expect(new Set(catalog.map((item) => item.character)).size).toBe(100);
    expect(catalog.map((item) => item.character)).toEqual([...catalog.map((item) => item.character)].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!));
    expect(catalog.filter((item) => item.hasFirstPartyMnemonic)).toHaveLength(31);
  });

  it("keeps dictionary facts, first-party study content, and the mnemonic in typed separate lanes", () => {
    const entry = getMindTreeEntry("明");
    expect(entry).not.toBeNull();
    expect(entry).toMatchObject({
      character: "明",
      meaning: "bright, clear",
      meaningSourceRef: "first-party:kanji-mindtree:v1",
      firstPartySourceRef: "first-party:kanji-mindtree:v1",
      dictionaryFacts: { sourceRef: "upstream:kanjidic2:2023-08", license: "CC-BY-SA-4.0" },
      mnemonic: null,
      mnemonicAvailability: "draft",
    });
    expect(entry?.evidence.graph.provenance.sourceRef).toBe(KANJIVG_SOURCE_REF);
    expect(entry?.annotations.map((item) => item.renderedAs)).toEqual(["日", "月"]);
    expect(entry?.annotations.every((item) => item.firstPartyElement?.sourceRef === "first-party:kanji-mindtree:v1")).toBe(true);
  });

  it("supports added grade-one characters from source facts without inventing first-party stories or vocabulary", () => {
    const entry = getMindTreeEntry("一");
    expect(entry).toMatchObject({
      character: "一",
      meaningSourceRef: "upstream:kanjidic2:2023-08",
      readingSourceRef: "upstream:kanjidic2:2023-08",
      firstPartySourceRef: null,
      mnemonic: null,
      mnemonicAvailability: "draft",
      vocabulary: [],
    });
    expect(entry?.dictionaryFacts.meaningsEnglish).toContain("one");
    expect(entry?.dictionaryFacts.gradeLevel).toBe(1);
    expect(entry?.learningGraph.nodes.length).toBeLessThanOrEqual(MINDTREE_LEARNING_GRAPH_LIMITS.maxNodes);
  });

  it("uses deterministic reverse component and reading indexes with explainable, non-semantic relations", () => {
    const bright = getMindTreeEntry("明");
    expect(bright?.related.length).toBeLessThanOrEqual(10);
    expect(bright?.related.some((item) => item.character === "時" && item.sharedAnnotations.includes("日"))).toBe(true);
    expect(bright?.related.some((item) => item.character === "間" && item.sharedAnnotations.includes("日"))).toBe(true);
    const sunAnnotation = bright?.annotations.find((item) => item.renderedAs === "日");
    expect(sunAnnotation?.familyMembers.some((item) => ["時", "間"].includes(item.character))).toBe(true);
    expect(bright?.related.every((item) => item.explanation.includes("does not imply"))).toBe(true);
    expect(bright?.learningGraph.graphVersion).toBe("nihongobridge-learning-neighborhood@1");
    expect(bright?.learningGraph).not.toHaveProperty("contractVersion");
    expect(bright?.learningGraph.nodes.length).toBeLessThanOrEqual(80);
    expect(bright?.learningGraph.edges.some((edge) => edge.relation === "shares-visual-annotation" && edge.evidenceLane === "derived-component-index")).toBe(true);
    expect(bright?.learningGraph.edges.every((edge) => Boolean(edge.explanation && edge.sourceRef))).toBe(true);

    const language = getMindTreeEntry("語");
    expect(language?.sameOnReading.some((item) => item.character === "五" && item.sharedReadings.includes("ゴ"))).toBe(true);
    expect(language?.sameOnReading.every((item) => item.explanation.includes("not a claim"))).toBe(true);
  });

  it("keeps learning relationships in a bounded composition rather than the structural evidence graph", () => {
    const entry = getMindTreeEntry("休");
    expect(entry?.learningGraph.nodes.length).toBeLessThanOrEqual(80);
    expect(entry?.learningGraph.edges.length).toBeLessThanOrEqual(96);
    expect(entry?.learningGraph.maxDepth).toBe(2);
    expect(entry?.learningGraph.nodes.some((node) => node.kind === "reading")).toBe(true);
    expect(entry?.learningGraph.nodes.some((node) => node.kind === "vocabulary")).toBe(true);
    expect(entry?.learningGraph.edges.some((edge) => edge.relation === "has-visual-annotation" && edge.evidenceLane === "kanjivg-source-markup")).toBe(true);
    expect(entry?.learningGraph.edges.some((edge) => edge.relation === "has-recorded-reading" && edge.evidenceLane === "kanjidic2-dictionary-fact")).toBe(true);
    expect(entry?.learningGraph.edges.some((edge) => edge.relation === "has-first-party-example" && edge.evidenceLane === "first-party-study-example")).toBe(true);
  });

  it("returns a graceful unsupported result without fabricating a record", () => {
    expect(getMindTreeEntry("龍")).toBeNull();
    expect(getMindTreeEntry("日本")).toBeNull();
    expect(getMindTreeEntry("")).toBeNull();
  });
});

describe("accessible, responsive interaction contracts", () => {
  it("uses native search, pressed/current states, live feedback, and visible keyboard focus", () => {
    const catalogUi = readFileSync("src/components/kanji/KanjiMindTreeCatalog.tsx", "utf8");
    const explorerUi = readFileSync("src/components/kanji/KanjiMindTreeExplorer.tsx", "utf8");
    const journeyUi = readFileSync("src/components/kanji/KanjiMindTreeLearningJourney.tsx", "utf8");
    expect(catalogUi).toContain('type="search"');
    expect(catalogUi).toContain("aria-pressed={level === item}");
    expect(explorerUi).toContain('role="img" aria-labelledby="kanji-svg-title"');
    expect(explorerUi).toContain("<details");
    expect(explorerUi).toContain("aria-pressed={isSelected}");
    expect(explorerUi).toContain("mindTreeExploreHref(entry.character");
    expect(journeyUi).toContain('aria-current={stage === item ? "step" : undefined}');
    expect(journeyUi).toContain('aria-live="polite"');
    expect(journeyUi).toContain("focus-visible:ring-2");
  });
});

describe("ephemeral learning journey state", () => {
  it("progressively reveals only existing first-party story text", () => {
    expect(segmentMnemonicStory("First cue. Second cue!")).toEqual(["First cue.", "Second cue!"]);
    const initial = INITIAL_MINDTREE_JOURNEY_STATE;
    const onePart = mindTreeJourneyReducer(initial, { type: "reveal-next-story-part", partCount: 2 });
    expect(onePart.revealedStoryParts).toBe(1);
    const allParts = mindTreeJourneyReducer(onePart, { type: "reveal-next-story-part", partCount: 2 });
    expect(allParts.revealedStoryParts).toBe(2);
    expect(mindTreeJourneyReducer(allParts, { type: "reveal-next-story-part", partCount: 2 }).revealedStoryParts).toBe(2);
  });

  it("advances Observe → Explore through Recall, toggles story visibility, and resets ephemeral recall state on activity change", () => {
    let state = INITIAL_MINDTREE_JOURNEY_STATE;
    for (const expected of ["Break down", "Associate", "Remember", "Recall", "Explore"] as const) {
      state = mindTreeJourneyReducer(state, { type: "advance-stage" });
      expect(state.stage).toBe(expected);
    }
    state = mindTreeJourneyReducer(state, { type: "toggle-story", visible: true });
    expect(state.storyVisible).toBe(true);
    state = mindTreeJourneyReducer(state, { type: "reveal-answer" });
    state = mindTreeJourneyReducer(state, { type: "self-check", result: "recalled" });
    expect(state).toMatchObject({ answerVisible: true, selfCheck: "recalled" });
    state = mindTreeJourneyReducer(state, { type: "set-recall-mode", mode: "components" });
    expect(state).toMatchObject({ recallMode: "components", answerVisible: false, selfCheck: null });
    expect(mindTreeJourneyReducer(state, { type: "advance-stage" }).stage).toBe("Explore");
  });
});
