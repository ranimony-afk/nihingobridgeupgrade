/**
 * Phase 14.4F-R — Dictionary & Kanji Experience route contract tests.
 *
 * These tests are deliberately DATABASE-INDEPENDENT. The services are mocked, so
 * the suite exercises the HTTP contract — status codes, error envelopes, query
 * parameter handling, response shape, and degradation behaviour — rather than
 * requiring a seeded canonical corpus.
 *
 * That is a deliberate departure from the older dictionary/kanji suites, which
 * call services against a live PostgreSQL instance and therefore cannot run in a
 * provisioning-free environment. Route contracts and data availability are
 * separate concerns and are tested separately.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/services/dictionary", () => ({
  DictionaryService: {
    searchEntries: vi.fn(),
    getEntryDetail: vi.fn(),
    autocomplete: vi.fn(),
    ensureInitialized: vi.fn(),
  },
}));

vi.mock("@/services/knowledge/kanjiLexicalGraphService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/knowledge/kanjiLexicalGraphService")>();
  return {
    ...actual,
    kanjiLexicalGraphService: {
      getKanjiVocabulary: vi.fn(),
      getKanjiReadings: vi.fn(),
      getKanjiComponents: vi.fn(),
      getKanjiRadicals: vi.fn(),
      getVocabularyKanji: vi.fn(),
      getKeigoRelations: vi.fn(),
    },
  };
});

import { GET as dictionarySearchGET } from "@/app/api/dictionary/search/route";
import { GET as dictionaryEntryGET } from "@/app/api/dictionary/entry/[id]/route";
import { GET as kanjiVocabularyGET } from "@/app/api/kanji/[character]/vocabulary/route";
import { GET as kanjiReadingsGET } from "@/app/api/kanji/[character]/readings/route";
import { GET as kanjiComponentsGET } from "@/app/api/kanji/[character]/components/route";

import { DictionaryService } from "@/services/dictionary";
import {
  kanjiLexicalGraphService,
  extractKanjiCharacters,
} from "@/services/knowledge/kanjiLexicalGraphService";
import {
  parseBoundedInt,
  parseLimit,
  parseOffset,
  parseBooleanFlag,
  MAX_PAGE_LIMIT,
} from "@/lib/api/routeParams";

const mockSearchEntries = vi.mocked(DictionaryService.searchEntries);
const mockGetEntryDetail = vi.mocked(DictionaryService.getEntryDetail);
const mockGetKanjiVocabulary = vi.mocked(kanjiLexicalGraphService.getKanjiVocabulary);
const mockGetKanjiReadings = vi.mocked(kanjiLexicalGraphService.getKanjiReadings);
const mockGetKanjiComponents = vi.mocked(kanjiLexicalGraphService.getKanjiComponents);
const mockGetKanjiRadicals = vi.mocked(kanjiLexicalGraphService.getKanjiRadicals);
const mockGetVocabularyKanji = vi.mocked(kanjiLexicalGraphService.getVocabularyKanji);
const mockGetKeigoRelations = vi.mocked(kanjiLexicalGraphService.getKeigoRelations);

/**
 * Minimal NextRequest stub. The handlers under test read only `nextUrl`, so a
 * partial object is sufficient and avoids depending on Next's request runtime.
 */
function getRequest(pathWithQuery: string): NextRequest {
  const url = new URL(pathWithQuery, "http://localhost");
  return { nextUrl: url, url: url.toString(), method: "GET" } as unknown as NextRequest;
}

function asyncParams<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Section 1 — Query parameter hardening (pure functions)
 * ------------------------------------------------------------------ */

describe("14.4F-R route parameter hardening", () => {
  it("falls back when a value is absent, blank, or non-numeric", () => {
    expect(parseBoundedInt(null, { fallback: 7 })).toBe(7);
    expect(parseBoundedInt(undefined, { fallback: 7 })).toBe(7);
    expect(parseBoundedInt("   ", { fallback: 7 })).toBe(7);
    expect(parseBoundedInt("abc", { fallback: 7 })).toBe(7);
    expect(parseBoundedInt("NaN", { fallback: 7 })).toBe(7);
  });

  it("clamps oversized values instead of passing them through", () => {
    // A caller must not be able to request an unbounded scan.
    expect(parseLimit("999999999")).toBe(MAX_PAGE_LIMIT);
    expect(parseLimit("201")).toBe(MAX_PAGE_LIMIT);
    expect(parseLimit("200")).toBe(200);
  });

  it("rejects out-of-range low values by falling back", () => {
    expect(parseLimit("0")).toBe(50);
    expect(parseLimit("-5")).toBe(50);
    expect(parseOffset("-1")).toBe(0);
  });

  it("accepts only the literal boolean strings", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("TRUE")).toBeUndefined();
    expect(parseBooleanFlag("1")).toBeUndefined();
    expect(parseBooleanFlag(null)).toBeUndefined();
  });

  it("never returns NaN or Infinity", () => {
    for (const raw of ["", "abc", "Infinity", "-Infinity", "1e999"]) {
      const parsed = parseLimit(raw);
      expect(Number.isFinite(parsed)).toBe(true);
      expect(Number.isNaN(parsed)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Section 2 — GET /api/dictionary/search
 * ------------------------------------------------------------------ */

describe("GET /api/dictionary/search", () => {
  it("returns 400 with a machine-readable code when q is missing", async () => {
    const res = await dictionarySearchGET(getRequest("/api/dictionary/search"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("MISSING_QUERY");
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("returns 400 when q is only whitespace or null bytes", async () => {
    const res = await dictionarySearchGET(getRequest("/api/dictionary/search?q=%00%20%20"));
    expect(res.status).toBe(400);
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("echoes the query classification so clients need not re-derive it", async () => {
    mockSearchEntries.mockResolvedValue({
      entries: [],
      total: 0,
      limit: 50,
      offset: 0,
    } as never);

    const res = await dictionarySearchGET(getRequest("/api/dictionary/search?q=%E6%B0%B4"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.query).toBe("水");
    expect(body.data.detectedScript).toBe("kanji");
  });

  it("classifies kana, mixed Japanese, and latin queries", async () => {
    mockSearchEntries.mockResolvedValue({ entries: [], total: 0, limit: 25, offset: 0 } as never);

    const cases: Array<[string, string]> = [
      ["%E3%81%BF%E3%81%9A", "kana"], // みず
      ["%E9%A3%9F%E3%81%B9%E3%82%8B", "japanese"], // 食べる
      ["taberu", "romaji"],
    ];

    for (const [encoded, expected] of cases) {
      const res = await dictionarySearchGET(
        getRequest(`/api/dictionary/search?q=${encoded}`)
      );
      const body = await res.json();
      expect(body.data.detectedScript).toBe(expected);
    }
  });

  it("strips null bytes before querying the service", async () => {
    mockSearchEntries.mockResolvedValue({ entries: [], total: 0, limit: 25, offset: 0 } as never);

    await dictionarySearchGET(
      getRequest("/api/dictionary/search?q=ta%00be%00ru")
    );

    expect(mockSearchEntries).toHaveBeenCalledTimes(1);
    const [arg] = mockSearchEntries.mock.calls[0] ?? [];
    expect(arg?.query).toBe("taberu");
  });

  it("passes the JLPT level and common filter through to the service", async () => {
    mockSearchEntries.mockResolvedValue({ entries: [], total: 0, limit: 25, offset: 0 } as never);

    await dictionarySearchGET(
      getRequest("/api/dictionary/search?q=water&level=N5&common=true")
    );

    const [arg] = mockSearchEntries.mock.calls[0] ?? [];
    expect(arg?.jlptLevel).toBe("N5");
    expect(arg?.isCommon).toBe(true);
  });

  it("reports the service-applied pagination rather than the requested values", async () => {
    // The service clamps limit and echoes what it actually applied. The route
    // must not restate the request, or clients would believe 200 was honoured.
    mockSearchEntries.mockResolvedValue({
      entries: [],
      total: 0,
      limit: 100,
      offset: 0,
    } as never);

    const res = await dictionarySearchGET(
      getRequest("/api/dictionary/search?q=water&limit=200")
    );
    const body = await res.json();

    expect(body.data.limit).toBe(100);
  });

  it("returns a 500 INTERNAL_ERROR envelope when the service throws", async () => {
    mockSearchEntries.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await dictionarySearchGET(getRequest("/api/dictionary/search?q=water"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

/* ------------------------------------------------------------------ *
 * Section 3 — GET /api/dictionary/entry/[id]
 * ------------------------------------------------------------------ */

const ENTRY_DETAIL = {
  entry: { id: "de-jmdict-1000000", headword: "水曜日", reading: "すいようび" },
  source: null,
  kanji: [],
  sentences: [],
  relatedGrammar: [],
};

describe("GET /api/dictionary/entry/[id]", () => {
  it("returns 404 when the entry does not exist", async () => {
    mockGetEntryDetail.mockResolvedValue(null);

    const res = await dictionaryEntryGET(
      getRequest("/api/dictionary/entry/de-jmdict-000"),
      asyncParams({ id: "de-jmdict-000" })
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns the entry enriched with graph edges and headword kanji", async () => {
    mockGetEntryDetail.mockResolvedValue(ENTRY_DETAIL as never);
    mockGetVocabularyKanji.mockResolvedValue([
      { id: "word:x", entryId: "de-jmdict-1000000", kanji: "水", position: 0 },
    ] as never);
    mockGetKeigoRelations.mockResolvedValue([] as never);

    const res = await dictionaryEntryGET(
      getRequest("/api/dictionary/entry/de-jmdict-1000000"),
      asyncParams({ id: "de-jmdict-1000000" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.entry.id).toBe("de-jmdict-1000000");
    expect(body.data.kanjiEdges).toHaveLength(1);
    // Distinct kanji from 水曜日, in order of appearance.
    expect(body.data.headwordKanji).toEqual(["水", "曜", "日"]);
  });

  it("decodes a percent-encoded headword identifier", async () => {
    mockGetEntryDetail.mockResolvedValue(ENTRY_DETAIL as never);
    mockGetVocabularyKanji.mockResolvedValue([] as never);
    mockGetKeigoRelations.mockResolvedValue([] as never);

    await dictionaryEntryGET(
      getRequest("/api/dictionary/entry/%E6%B0%B4"),
      asyncParams({ id: "%E6%B0%B4" })
    );

    expect(mockGetEntryDetail).toHaveBeenCalledWith("水");
  });

  it("degrades gracefully when the graph layer fails", async () => {
    // The canonical entry must still be served — graph enrichment is additive.
    mockGetEntryDetail.mockResolvedValue(ENTRY_DETAIL as never);
    mockGetVocabularyKanji.mockRejectedValue(new Error("graph unavailable"));
    mockGetKeigoRelations.mockRejectedValue(new Error("graph unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await dictionaryEntryGET(
      getRequest("/api/dictionary/entry/de-jmdict-1000000"),
      asyncParams({ id: "de-jmdict-1000000" })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entry.id).toBe("de-jmdict-1000000");
    expect(body.data.kanjiEdges).toEqual([]);
    expect(body.data.keigo).toEqual([]);
  });

  it("returns 400 when the identifier segment is empty", async () => {
    const res = await dictionaryEntryGET(
      getRequest("/api/dictionary/entry/"),
      asyncParams({ id: "" })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_ID");
  });
});

/* ------------------------------------------------------------------ *
 * Section 4 — GET /api/kanji/[character]/vocabulary
 * ------------------------------------------------------------------ */

describe("GET /api/kanji/[character]/vocabulary", () => {
  it("returns vocabulary edges with character positions", async () => {
    mockGetKanjiVocabulary.mockResolvedValue([
      { id: "e1", kanji: "水", entryId: "de-1", headword: "水", position: 0 },
    ] as never);

    const res = await kanjiVocabularyGET(getRequest("/api/kanji/%E6%B0%B4/vocabulary"), {
      params: Promise.resolve({ character: "%E6%B0%B4" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.character).toBe("水");
    expect(body.total).toBe(1);
    expect(body.vocabulary[0].position).toBe(0);
  });

  it("passes bounded limit and commonOnly through to the graph service", async () => {
    mockGetKanjiVocabulary.mockResolvedValue([] as never);

    await kanjiVocabularyGET(
      getRequest("/api/kanji/%E6%B0%B4/vocabulary?limit=10&commonOnly=true"),
      { params: Promise.resolve({ character: "%E6%B0%B4" }) }
    );

    expect(mockGetKanjiVocabulary).toHaveBeenCalledWith("水", {
      limit: 10,
      isCommonOnly: true,
    });
  });

  it("clamps an oversized limit before it reaches the query", async () => {
    mockGetKanjiVocabulary.mockResolvedValue([] as never);

    await kanjiVocabularyGET(
      getRequest("/api/kanji/%E6%B0%B4/vocabulary?limit=99999999"),
      { params: Promise.resolve({ character: "%E6%B0%B4" }) }
    );

    expect(mockGetKanjiVocabulary).toHaveBeenCalledWith("水", {
      limit: MAX_PAGE_LIMIT,
      isCommonOnly: undefined,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Section 5 — GET /api/kanji/[character]/readings
 * ------------------------------------------------------------------ */

describe("GET /api/kanji/[character]/readings", () => {
  const READINGS = [
    { reading: "スイ", normalized: "すい", type: "ON", hasOkurigana: false },
    { reading: "みず", normalized: "みず", type: "KUN", hasOkurigana: false },
  ];

  it("returns all readings by default", async () => {
    mockGetKanjiReadings.mockResolvedValue(READINGS as never);

    const res = await kanjiReadingsGET(getRequest("/api/kanji/%E6%B0%B4/readings"), {
      params: Promise.resolve({ character: "%E6%B0%B4" }),
    });

    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.appliedTypeFilter).toBe("all");
  });

  it("maps the friendly 'on' filter onto the controlled ON type", async () => {
    mockGetKanjiReadings.mockResolvedValue(READINGS as never);

    const res = await kanjiReadingsGET(
      getRequest("/api/kanji/%E6%B0%B4/readings?type=on"),
      { params: Promise.resolve({ character: "%E6%B0%B4" }) }
    );

    const body = await res.json();
    expect(body.appliedTypeFilter).toBe("ON");
    expect(body.total).toBe(1);
    expect(body.readings[0].type).toBe("ON");
  });

  it("maps the friendly 'kun' filter onto the controlled KUN type", async () => {
    mockGetKanjiReadings.mockResolvedValue(READINGS as never);

    const res = await kanjiReadingsGET(
      getRequest("/api/kanji/%E6%B0%B4/readings?type=kun"),
      { params: Promise.resolve({ character: "%E6%B0%B4" }) }
    );

    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.readings[0].type).toBe("KUN");
  });

  it("treats an unrecognised filter as no filter rather than erroring", async () => {
    mockGetKanjiReadings.mockResolvedValue(READINGS as never);

    const res = await kanjiReadingsGET(
      getRequest("/api/kanji/%E6%B0%B4/readings?type=nonsense"),
      { params: Promise.resolve({ character: "%E6%B0%B4" }) }
    );

    const body = await res.json();
    expect(body.appliedTypeFilter).toBe("all");
    expect(body.total).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * Section 6 — GET /api/kanji/[character]/components
 * ------------------------------------------------------------------ */

describe("GET /api/kanji/[character]/components", () => {
  it("returns both structural components and canonical radicals", async () => {
    mockGetKanjiComponents.mockResolvedValue([
      { id: "c1", character: "木", role: "left" },
    ] as never);
    mockGetKanjiRadicals.mockResolvedValue({ radicals: [] } as never);

    const res = await kanjiComponentsGET(getRequest("/api/kanji/%E6%A0%97/components"), {
      params: Promise.resolve({ character: "%E6%A0%97" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.componentCount).toBe(1);
    expect(body.components[0].character).toBe("木");
    // Radicals are a distinct relationship from components, so both are present.
    expect(body).toHaveProperty("radicals");
  });

  it("returns a 500 INTERNAL_ERROR envelope when the graph layer throws", async () => {
    mockGetKanjiComponents.mockRejectedValue(new Error("boom"));
    mockGetKanjiRadicals.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await kanjiComponentsGET(getRequest("/api/kanji/%E6%A0%97/components"), {
      params: Promise.resolve({ character: "%E6%A0%97" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});

/* ------------------------------------------------------------------ *
 * Section 7 — Reused kanji extraction primitive
 * ------------------------------------------------------------------ */

describe("extractKanjiCharacters (reused by the entry route)", () => {
  it("returns distinct kanji in order of appearance", () => {
    expect(extractKanjiCharacters("水曜日")).toEqual(["水", "曜", "日"]);
  });

  it("de-duplicates repeated kanji", () => {
    expect(extractKanjiCharacters("日々日")).toEqual(["日"]);
  });

  it("ignores kana and latin", () => {
    expect(extractKanjiCharacters("taberu たべる")).toEqual([]);
  });

  it("returns an empty array for empty input rather than throwing", () => {
    expect(extractKanjiCharacters("")).toEqual([]);
  });
});
