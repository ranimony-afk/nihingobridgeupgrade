/**
 * Gate A11 — `GET /api/v1/mobile/dictionary/search`.
 *
 * Three layers, deliberately:
 *
 * 1. **Contract layer (DB-free).** The route handler is exercised against a mocked
 *    `DictionaryService`, exactly as the A8/A9/A10 suites do, so the transport, parameter,
 *    envelope, projection and error contracts are pinned without a database.
 * 2. **Adapter layer (DB-free).** The pure projection/validation helpers in `../_lib` are unit
 *    tested, including the `{ ...row }` regression that must be impossible.
 * 3. **Live layer (disposable database).** The seeded first-party corpus
 *    (`src/data/lexicon.ts` → `dictionary_entries`) is searched through the real route and the real
 *    service. This layer skips with an explicit reason when no database is reachable — it never
 *    fabricates rows to manufacture a pass.
 *
 * Every expectation is read from the frozen contract (`docs/api/MOBILE-DICTIONARY-API-CONTRACT.md`
 * §A10.1–§A10.18), the declared types (`src/types/mobileDictionary.ts`) or the implementing
 * modules. The clamp formula used by the mock mirrors `DictionaryService.searchEntries` verbatim
 * (`limit = min(max(limit, 1), 100)`, `offset = max(offset, 0)`) so that "the response echoes the
 * *applied* values" is a real assertion rather than a restatement of the request.
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

import { GET as mobileSearchGET } from "@/app/api/v1/mobile/dictionary/search/route";
import {
  flattenGlosses,
  isQueryLengthValid,
  MAX_QUERY_LENGTH,
  parseTargetLanguage,
  projectEntry,
} from "@/app/api/v1/mobile/dictionary/search/_lib";
import { DictionaryService } from "@/services/dictionary";
import type { CanonicalDictionaryRow } from "@/services/publication";
import { classifyJlptLevel } from "@/services/dataquality/jlptChecks";

const mockSearchEntries = vi.mocked(DictionaryService.searchEntries);

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** A complete canonical row: all 12 `dictionary_entries` columns, as `db.select()` returns them. */
function canonicalRow(overrides: Partial<CanonicalDictionaryRow> = {}): CanonicalDictionaryRow {
  return {
    id: "de-jmdict-1395600",
    headword: "水",
    reading: "みず",
    romaji: "mizu",
    jlptLevel: "N5",
    isCommon: true,
    frequencyRank: 512,
    partsOfSpeech: ["n"],
    senses: [{ glosses: ["water", "cold water"], note: "hot water is お湯" }],
    kanjiCharacters: ["水"],
    tags: ["nature", "daily-life"],
    sourceRef: "upstream:jmdict:2023-08",
    ...overrides,
  };
}

/** The exact frozen projection (A10 §A10.6) — the 9 fields, nothing else. */
const FROZEN_ITEM_KEYS = [
  "headword",
  "id",
  "isCommon",
  "jlptLevel",
  "jlptStatus",
  "kanjiCharacters",
  "primaryGlosses",
  "reading",
  "romaji",
];

/** Column names that exist on the row but must never reach a mobile client. */
const ROW_ONLY_KEYS = [
  "frequencyRank",
  "partsOfSpeech",
  "senses",
  "tags",
  "sourceRef",
  "ent_seq",
  "entSeq",
  "internalNotes",
];

/**
 * Fields declared by the *unimplemented* detail/sync shapes in `src/types/mobileDictionary.ts`
 * (`MobileDictionaryDetailResponse`, `MobileSwipeSection*`) that A12 classified as no-producer,
 * forbidden or unresolved (D-5/D-7/D-8/D-9). They must not leak into the search item either —
 * the summary DTO is a projection, never a detail shape (§A10.7).
 */
const DETAIL_ONLY_KEYS = [
  "alternativeHeadwords",
  "alternativeReadings",
  "meanings",
  "conjugations",
  "keigo",
  "kanjiList",
  "exampleSentences",
  "synonyms",
  "antonyms",
  "phrases",
  "collocations",
  "userState",
  "provenance",
  "sourceId",
  "attribution",
  "license",
  "isBookmarked",
  "userLists",
  "hasPersonalNote",
  "srsStatus",
];

function getRequest(pathWithQuery: string): NextRequest {
  const url = new URL(pathWithQuery, "http://localhost");
  return { nextUrl: url, url: url.toString(), method: "GET" } as unknown as NextRequest;
}

/** Mock the service the way the real one behaves: it clamps and echoes what it applied. */
function mockSearch(options: {
  entries?: CanonicalDictionaryRow[];
  total?: number;
} = {}) {
  const entries = options.entries ?? [canonicalRow()];
  const total = options.total ?? entries.length;
  mockSearchEntries.mockImplementation(async (opts = {}) => ({
    entries,
    total,
    limit: Math.min(Math.max(opts.limit ?? 25, 1), 100),
    offset: Math.max(opts.offset ?? 0, 0),
  }));
  return { entries, total };
}

function lastCallOptions() {
  return mockSearchEntries.mock.calls.at(-1)?.[0] as
    | { query?: string; jlptLevel?: string; isCommon?: boolean; limit?: number; offset?: number }
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * 1. Transport
 * ------------------------------------------------------------------ */

describe("A11 §2.1/§8 — transport", () => {
  it("exports GET and no other method (Next.js owns the 405)", async () => {
    const route = await import("@/app/api/v1/mobile/dictionary/search/route");

    expect(typeof route.GET).toBe("function");
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(route).not.toHaveProperty(method);
    }
  });

  it("implements the frozen path exactly once", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry === "route.ts") routes.push(full);
      }
    };
    walk("src/app/api/v1");

    expect(routes).toEqual(["src/app/api/v1/mobile/dictionary/search/route.ts"]);
  });

  it("is declared dynamic (never cached as static content)", async () => {
    const route = await import("@/app/api/v1/mobile/dictionary/search/route");
    expect(route.dynamic).toBe("force-dynamic");
  });
});

/* ------------------------------------------------------------------ *
 * 2. Query semantics
 * ------------------------------------------------------------------ */

describe("A11 §2.3/§10 — query semantics and sanitation", () => {
  it("searches with the sanitized query and echoes that, not the raw input", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=%20%20mizu%20%20"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.query).toBe("mizu");
    expect(lastCallOptions()?.query).toBe("mizu");
  });

  it("strips NUL bytes but adds no normalization", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mi%00zu"));
    expect((await res.json()).data.query).toBe("mizu");
  });

  it("rejects a missing, blank or NUL-only query with 400 MISSING_QUERY and never calls the service", async () => {
    for (const target of [
      "/api/v1/mobile/dictionary/search",
      "/api/v1/mobile/dictionary/search?q=",
      "/api/v1/mobile/dictionary/search?q=%20%20",
      "/api/v1/mobile/dictionary/search?q=%00%20%00",
    ]) {
      mockSearchEntries.mockClear();
      const res = await mobileSearchGET(getRequest(target));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toEqual({
        success: false,
        error: { code: "MISSING_QUERY", message: "Query parameter 'q' is required" },
      });
      expect(mockSearchEntries).not.toHaveBeenCalled();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2b. Defensive query length cap (A12/D-14)
 * ------------------------------------------------------------------ */

describe("A12 §D-14 — defensive `q` length cap", () => {
  it("freezes the cap at the repository's existing convention value", () => {
    // 1000 is not invented here: it mirrors the module-private `MAX_QUERY_LENGTH = 1000` in
    // `src/app/api/ai/answer/route.ts`. Asserted as a number so the contract's stated value is
    // enforceable rather than merely documented.
    expect(MAX_QUERY_LENGTH).toBe(1000);
  });

  it("accepts a query one code unit under the cap (boundary − 1)", async () => {
    mockSearch();
    const query = "a".repeat(MAX_QUERY_LENGTH - 1);
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${query}`)
    );

    expect(res.status).toBe(200);
    expect(lastCallOptions()?.query).toBe(query);
  });

  it("rejects an extremely large query (100 000 characters) before the service is reached", async () => {
    mockSearchEntries.mockClear();
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${"a".repeat(100_000)}`)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    // The bound is applied at the boundary, so an arbitrarily large `q` never builds an ILIKE pattern.
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("accepts a query of exactly the cap and passes it through unsanitized-but-intact", async () => {
    mockSearch();
    const query = "a".repeat(MAX_QUERY_LENGTH);
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${query}`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.query).toBe(query);
    expect(lastCallOptions()?.query).toBe(query);
  });

  it("rejects a query one code unit over the cap with 400 VALIDATION_ERROR and never calls the service", async () => {
    mockSearchEntries.mockClear();
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${"a".repeat(MAX_QUERY_LENGTH + 1)}`)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Query parameter 'q' must be at most 1000 characters",
      },
    });
    // Rejected, never truncated: the service must not see a shortened query either.
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("judges the cap on the sanitized value, after the emptiness check", async () => {
    // NUL padding is stripped before measurement, so it neither smuggles content past the cap nor
    // rejects a legitimate query — the same order in which emptiness is judged (§A10.16).
    mockSearch();
    const padded = `${"a".repeat(MAX_QUERY_LENGTH)}\u0000\u0000`;
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(padded)}`)
    );

    expect(res.status).toBe(200);
    expect(lastCallOptions()?.query).toBe("a".repeat(MAX_QUERY_LENGTH));
  });

  it("bounds `q` above the cap for the worst observed query class too", async () => {
    // LIKE metacharacters are escaped by the canonical service (`escapeLikePattern`), so `%` cannot
    // change matching semantics — but escaping expands the pattern, which was the slowest query class
    // measured in A12 (16.9 s at 1000 characters vs 8.9 s for plain latin). An over-limit
    // wildcard-laden query must therefore hit the same cap as any other.
    mockSearchEntries.mockClear();
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${"%25".repeat(MAX_QUERY_LENGTH + 1)}`)
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("measures the cap in UTF-16 code units, matching the existing convention (unit)", () => {
    expect(isQueryLengthValid("a".repeat(MAX_QUERY_LENGTH))).toBe(true);
    expect(isQueryLengthValid("a".repeat(MAX_QUERY_LENGTH + 1))).toBe(false);
    // An astral character (e.g. 𠮷) is two code units, so 500 of them are within the cap...
    expect(isQueryLengthValid("𠮷".repeat(500))).toBe(true);
    // ...and 501 are not. Documented behaviour, not an accident of the implementation.
    expect(isQueryLengthValid("𠮷".repeat(501))).toBe(false);
    expect(isQueryLengthValid("")).toBe(true);
  });

  /* ---------------------------------------------------------------- *
   * A13 — the A12 cap re-measured as a ladder over input classes the
   * A12 suite did not cover: non-Latin BMP scripts, astral input on the
   * wire, NUL-only and whitespace-only padding, and mixed scripts.
   * ---------------------------------------------------------------- */

  it("applies the same cap to BMP scripts at exactly 1000 code units (Tamil, Malayalam, Japanese)", async () => {
    // One code unit per character in these scripts, so the ladder position is exact and the cap
    // must behave identically to latin input — no script gets a different budget.
    const classes: Array<[string, string]> = [
      ["Tamil", "த"],
      ["Malayalam", "മ"],
      ["Japanese kana", "み"],
      ["Japanese kanji", "水"],
    ];

    for (const [label, unit] of classes) {
      const atCap = unit.repeat(MAX_QUERY_LENGTH);
      expect(atCap.length).toBe(MAX_QUERY_LENGTH);

      mockSearch();
      const accepted = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(atCap)}`)
      );
      const acceptedBody = await accepted.json();

      expect(accepted.status, `${label} at the cap`).toBe(200);
      // Intact end to end: the service and the echo both see the full string, never a truncation.
      expect(lastCallOptions()?.query, `${label} at the cap`).toBe(atCap);
      expect(acceptedBody.data.query, `${label} at the cap`).toBe(atCap);

      mockSearchEntries.mockClear();
      const rejected = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(unit.repeat(MAX_QUERY_LENGTH + 1))}`)
      );
      const rejectedBody = await rejected.json();

      expect(rejected.status, `${label} one unit over the cap`).toBe(400);
      expect(rejectedBody.error.code, `${label} one unit over the cap`).toBe("VALIDATION_ERROR");
      expect(mockSearchEntries, `${label} one unit over the cap`).not.toHaveBeenCalled();
    }
  });

  it("counts astral input as two code units on the wire, not one code point", async () => {
    // The unit test above pins `isQueryLengthValid`; this pins the transport path, including the
    // wire echo, so the convention cannot drift at the boundary while the helper stays correct.
    const astral = "𠮷";
    expect(astral.length).toBe(2);

    mockSearch();
    const accepted = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(astral.repeat(500))}`)
    );
    const acceptedBody = await accepted.json();

    expect(accepted.status).toBe(200);
    expect(acceptedBody.data.query).toBe(astral.repeat(500));
    expect(lastCallOptions()?.query).toBe(astral.repeat(500));

    mockSearchEntries.mockClear();
    const rejected = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(astral.repeat(501))}`)
    );
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.code).toBe("VALIDATION_ERROR");
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });

  it("answers NUL-only and whitespace-only padding as MISSING_QUERY, never as an over-long query", async () => {
    // Sanitization (NUL-strip + trim) runs before both the emptiness test and the cap. Input that is
    // *long* but empty *after* sanitization must therefore be judged empty — otherwise a client that
    // pads with a terminator or with spaces gets a length error for a query that has no content.
    for (const [label, raw] of [
      ["NUL-only", "\u0000".repeat(2_000)],
      ["whitespace-only", " ".repeat(1_500)],
      ["mixed NUL and whitespace", ` ${"\u0000 ".repeat(900)}`],
    ] as Array<[string, string]>) {
      mockSearchEntries.mockClear();
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(raw)}`)
      );
      const body = await res.json();

      expect(res.status, label).toBe(400);
      expect(body.error.code, label).toBe("MISSING_QUERY");
      expect(mockSearchEntries, label).not.toHaveBeenCalled();
    }

    // The same padding around *content* is stripped, not counted against the budget.
    mockSearch();
    const padded = ` ${"\u0000".repeat(2_000)}${"a".repeat(MAX_QUERY_LENGTH)}\u0000 `;
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(padded)}`)
    );

    expect(res.status).toBe(200);
    expect(lastCallOptions()?.query).toBe("a".repeat(MAX_QUERY_LENGTH));
  });

  it("rejects over-cap mixed-script input without echoing any of the payload", async () => {
    mockSearchEntries.mockClear();
    // Distinctive marker so a leak is detectable rather than assumed absent.
    const payload = `${"த்".repeat(600)}${"水み".repeat(200)}ZZQX`;
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(payload)}`)
    );
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Query parameter 'q' must be at most ${MAX_QUERY_LENGTH} characters`,
      },
    });
    expect(serialized).not.toContain("ZZQX");
    expect(serialized).not.toContain("த்");
    expect(serialized).not.toContain("水");
    expect(body.error).not.toHaveProperty("details");
    expect(body.error).not.toHaveProperty("stack");
    expect(mockSearchEntries).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ *
 * 3. Script classification
 * ------------------------------------------------------------------ */

describe("A11 §2.4/§20/§21 — script classification is delegated, never re-implemented", () => {
  const cases: Array<[string, string]> = [
    // Measured against `detectSearchScript` (charclass-based): kanji+kana → "japanese";
    // latin-only → "romaji"; anything else with no kanji/kana (e.g. Tamil) → "mixed".
    ["水", "kanji"],
    ["みず", "kana"],
    ["水みず", "japanese"],
    ["mizu", "romaji"],
    ["தண்ணீர்", "mixed"], // Tamil script: a script class, never a language
  ];

  it.each(cases)("classifies %j as %s", async (query, expected) => {
    mockSearch();
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(query)}`)
    );
    expect((await res.json()).data.detectedScript).toBe(expected);
  });

  it("never emits a language as a script", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=water"));
    const { detectedScript } = (await res.json()).data;

    expect(detectedScript).toBe("romaji");
    for (const forbidden of ["english", "tamil", "malayalam"]) {
      expect(detectedScript).not.toBe(forbidden);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 4. Pagination, limits, hasMore
 * ------------------------------------------------------------------ */

describe("A11 §2.7/§2.8/§24 — pagination and hasMore", () => {
  it("applies the frozen defaults and echoes them", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(lastCallOptions()?.limit).toBe(50);
    expect(lastCallOptions()?.offset).toBe(0);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);
  });

  it("echoes the APPLIED values, not the requested ones, when the service clamps", async () => {
    mockSearch();
    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=500&offset=7")
    );
    const { data } = await res.json();

    expect(lastCallOptions()?.limit).toBe(200); // route boundary clamp
    expect(data.limit).toBe(100); // service ceiling — the applied value
    expect(data.offset).toBe(7);
  });

  it("computes hasMore exactly as offset + entries.length < total over the applied window", async () => {
    // 30 matches, 10 returned from offset 0 → more; from offset 20 → none; clamped window stays exact.
    mockSearch({ entries: Array.from({ length: 10 }, (_, i) => canonicalRow({ id: `row-${i}` })), total: 30 });

    const first = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=10"));
    expect((await first.json()).data.hasMore).toBe(true);

    mockSearch({ entries: Array.from({ length: 10 }, (_, i) => canonicalRow({ id: `row-${i}` })), total: 30 });
    const last = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=10&offset=20")
    );
    expect((await last.json()).data.hasMore).toBe(false);

    // Exact boundary: offset(10) + returned(10) === total(20) → false.
    mockSearch({ entries: Array.from({ length: 10 }, (_, i) => canonicalRow({ id: `row-${i}` })), total: 20 });
    const boundary = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=10&offset=10")
    );
    expect((await boundary.json()).data.hasMore).toBe(false);

    // One row short of the boundary → true.
    mockSearch({ entries: Array.from({ length: 10 }, (_, i) => canonicalRow({ id: `row-${i}` })), total: 21 });
    const near = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=10&offset=10")
    );
    expect((await near.json()).data.hasMore).toBe(true);
  });

  it("returns an empty page as 200, never 404", async () => {
    mockSearch({ entries: [], total: 0 });
    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=nonexistent&offset=5")
    );
    const { data } = (await res.json());

    expect(res.status).toBe(200);
    expect(data.entries).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.hasMore).toBe(false);
  });

  it("clamps out-of-range and malformed pagination without erroring, and never emits NaN/Infinity", async () => {
    const cases: Array<[string, number, number]> = [
      // query, expected limit passed to the service, expected offset passed to the service
      ["limit=0", 50, 0], // below minimum → documented default
      ["limit=-5", 50, 0], // negative → default (shared parseLimit)
      ["limit=abc", 50, 0], // unparseable → default
      ["limit=Infinity", 50, 0],
      ["limit=999999999", 200, 0], // above boundary → clamped
      ["offset=-5", 50, 0], // negative offset → clamped to 0
      ["offset=abc", 50, 0],
      ["offset=NaN", 50, 0],
      ["offset=999999999", 50, 100000], // above MAX_OFFSET → clamped
    ];

    for (const [queryString, expectedLimit, expectedOffset] of cases) {
      mockSearch();
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=mizu&${queryString}`)
      );
      const { data } = await res.json();

      expect(res.status).toBe(200);
      expect(lastCallOptions()?.limit).toBe(expectedLimit);
      expect(lastCallOptions()?.offset).toBe(expectedOffset);
      expect(Number.isFinite(data.limit)).toBe(true);
      expect(Number.isFinite(data.offset)).toBe(true);
      expect(data.limit).toBeGreaterThanOrEqual(1);
      expect(data.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("honours the frozen boundary values exactly, at and beyond each edge", async () => {
    // A10 §A10.4 boundary table: limit 1…200 at the boundary / 1…100 applied;
    // offset 0…100 000. The edges are asserted at, just below and just above.
    const cases: Array<[string, number, number]> = [
      ["limit=1", 1, 0], // minimum boundary
      ["limit=50", 50, 0], // default value, explicitly sent
      ["limit=100", 100, 0], // the applied ceiling, requested exactly
      ["limit=200", 200, 0], // maximum boundary — passed to the service as-is
      ["limit=201", 200, 0], // just above the boundary → clamped to it
      ["offset=0", 50, 0], // minimum offset
      ["offset=100000", 50, 100000], // maximum offset, requested exactly
      ["offset=100001", 50, 100000], // just above → clamped
    ];

    for (const [queryString, expectedLimit, expectedOffset] of cases) {
      mockSearch();
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=mizu&${queryString}`)
      );
      const { data } = await res.json();

      expect(res.status).toBe(200);
      expect(lastCallOptions()?.limit).toBe(expectedLimit);
      expect(lastCallOptions()?.offset).toBe(expectedOffset);
    }
  });

  it("echoes the applied limit when the service applies its own tighter ceiling", async () => {
    // Requesting the 200 boundary succeeds, but the service applies 100 — and the response
    // must report what was applied, never restate the request (A10 §A10.4/§A10.9).
    for (const requested of [100, 150, 200]) {
      mockSearch();
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=mizu&limit=${requested}`)
      );
      const { data } = await res.json();

      expect(lastCallOptions()?.limit).toBe(requested); // the route honours the request…
      expect(data.limit).toBe(100); // …and the response reports the applied ceiling
    }
  });

  it("ignores `page` (retired) and every other unknown parameter", async () => {
    mockSearch();
    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&page=3&perPage=10&sort=desc")
    );
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(lastCallOptions()?.offset).toBe(0);
    expect(data).not.toHaveProperty("page");
    expect(data).not.toHaveProperty("pagination");
  });
});

/* ------------------------------------------------------------------ *
 * 5. JLPT
 * ------------------------------------------------------------------ */

describe("A11 §2.6/§12/§23 — JLPT filtering", () => {
  it("applies `level` and echoes it as appliedJlptLevel", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu&level=N5"));
    const { data } = await res.json();

    expect(lastCallOptions()?.jlptLevel).toBe("N5");
    expect(data.appliedJlptLevel).toBe("N5");
  });

  it("uses the legacy `jlpt` alias only when `level` is absent, and prefers `level` when both are sent", async () => {
    mockSearch();
    const alias = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu&jlpt=N4"));
    expect((await alias.json()).data.appliedJlptLevel).toBe("N4");

    mockSearch();
    const both = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&level=N5&jlpt=N4")
    );
    const { data } = await both.json();
    expect(data.appliedJlptLevel).toBe("N5");
    expect(lastCallOptions()?.jlptLevel).toBe("N5");
  });

  it("defaults to null when no level is requested", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    expect((await res.json()).data.appliedJlptLevel).toBeNull();
  });

  it("does not validate the level server-side: an out-of-domain value filters, it does not 400", async () => {
    mockSearch({ entries: [], total: 0 });
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu&level=N9"));
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(lastCallOptions()?.jlptLevel).toBe("N9");
    expect(data.appliedJlptLevel).toBe("N9");
    expect(data.entries).toEqual([]);
  });

  it("keeps appliedJlptLevel and the item's jlptLevel as different fields, with no boolean", async () => {
    mockSearch({ entries: [canonicalRow({ jlptLevel: "NONE" })], total: 1 });
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu&level=N5"));
    const { data } = await res.json();

    // A filter echo and a per-row fact may legitimately disagree.
    expect(data.appliedJlptLevel).toBe("N5");
    expect(data.entries[0].jlptLevel).toBe("NONE");
    expect(data.entries[0].jlptStatus).toBe("unknown");
    expect(data.entries[0]).not.toHaveProperty("jlptKnown");
  });
});

/* ------------------------------------------------------------------ *
 * 6. targetLanguage
 * ------------------------------------------------------------------ */

describe("A11 §2.5/§11/§22 — targetLanguage is validated and inert", () => {
  it("accepts every vocabulary member and never rejects a supported value", async () => {
    for (const language of ["en", "ta", "ml"]) {
      mockSearch();
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=mizu&targetLanguage=${language}`)
      );
      expect(res.status).toBe(200);
    }
  });

  it("does not change the search or the response (inert in v1)", async () => {
    mockSearch();
    const plain = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const plainBody = await plain.json();
    const plainOptions = lastCallOptions();

    for (const language of ["en", "ta", "ml", "fr", "english", ""]) {
      mockSearch();
      const res = await mobileSearchGET(
        getRequest(
          `/api/v1/mobile/dictionary/search?q=mizu&targetLanguage=${encodeURIComponent(language)}`
        )
      );
      const body = await res.json();

      expect(body).toEqual(plainBody);
      expect(lastCallOptions()).toEqual(plainOptions);
      // No localization is claimed and no fallback translation is invented.
      expect(body.data).not.toHaveProperty("localizedGlosses");
      expect(body.data).not.toHaveProperty("glosses");
      expect(body.data.entries[0]).not.toHaveProperty("localizedGlosses");
    }
  });

  it("is byte-identical, not merely deep-equal, with and without targetLanguage (A13/D-6)", async () => {
    // `toEqual` above compares parsed structures, which would still pass if key order changed.
    // D-6 is an inertness claim about the *response*, so it is pinned on the raw text: a mobile
    // client that caches or diffs the body must see no difference at all.
    mockSearch();
    const baseline = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=5&offset=0")
    );
    const baselineText = await baseline.text();
    const baselineOptions = lastCallOptions();

    for (const language of ["en", "ta", "ml", "fr", "english", "", " "]) {
      mockSearch();
      const variant = await mobileSearchGET(
        getRequest(
          `/api/v1/mobile/dictionary/search?q=mizu&limit=5&offset=0&targetLanguage=${encodeURIComponent(language)}`
        )
      );

      expect(await variant.text(), `targetLanguage=${JSON.stringify(language)}`).toBe(baselineText);
      expect(lastCallOptions(), `targetLanguage=${JSON.stringify(language)}`).toEqual(baselineOptions);
    }
  });

  it("validates the vocabulary at the boundary (unit)", () => {
    expect(parseTargetLanguage("en")).toBe("en");
    expect(parseTargetLanguage("ta")).toBe("ta");
    expect(parseTargetLanguage(" ml ")).toBe("ml");
    expect(parseTargetLanguage("fr")).toBeUndefined();
    expect(parseTargetLanguage("english")).toBeUndefined();
    expect(parseTargetLanguage("")).toBeUndefined();
    expect(parseTargetLanguage(null)).toBeUndefined();
    expect(parseTargetLanguage(undefined)).toBeUndefined();
  });

  it("treats an unsupported target language as ignored, not as an error", async () => {
    mockSearch();
    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&targetLanguage=klingon")
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 7. Entry projection — the security boundary
 * ------------------------------------------------------------------ */

describe("A11 §3/§26 — entry projection and DTO leakage (mandatory)", () => {
  it("returns exactly the 9 frozen fields for every entry", async () => {
    mockSearch({ entries: [canonicalRow(), canonicalRow({ id: "de-mizu", headword: "水" })] });
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(data.entries).toHaveLength(2);
    for (const entry of data.entries) {
      expect(Object.keys(entry).sort()).toEqual(FROZEN_ITEM_KEYS);
    }
  });

  it("deep-equals the frozen projection — no extra field can ride along", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(data.entries[0]).toEqual({
      id: "de-jmdict-1395600",
      headword: "水",
      reading: "みず",
      romaji: "mizu",
      primaryGlosses: ["water", "cold water"],
      jlptLevel: "N5",
      jlptStatus: "known",
      isCommon: true,
      kanjiCharacters: ["水"],
    });
  });

  it("never leaks a row-only or internal column", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    for (const key of ROW_ONLY_KEYS) {
      expect(data.entries[0]).not.toHaveProperty(key);
      expect(JSON.stringify(data)).not.toContain(`"${key}"`);
    }
    // The raw provenance string must not appear anywhere in the payload.
    expect(JSON.stringify(data)).not.toContain("upstream:jmdict");
  });

  it("cannot leak a column added to the table later", async () => {
    const rowWithFutureColumn = {
      ...canonicalRow(),
      internalNotes: "editor-only",
      nextReviewAt: "2030-01-01",
    } as unknown as CanonicalDictionaryRow;
    mockSearch({ entries: [rowWithFutureColumn] });

    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(data.entries[0]).not.toHaveProperty("internalNotes");
    expect(data.entries[0]).not.toHaveProperty("nextReviewAt");
    expect(JSON.stringify(data)).not.toContain("editor-only");
  });

  it("flattens the jsonb senses nesting into a flat string list", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    expect(data.entries[0].primaryGlosses).toEqual(["water", "cold water"]);
    expect(data.entries[0]).not.toHaveProperty("senses");
    for (const gloss of data.entries[0].primaryGlosses) {
      expect(typeof gloss).toBe("string");
    }
  });
});

/* ------------------------------------------------------------------ *
 * 8. Envelopes and errors
 * ------------------------------------------------------------------ */

describe("A11 §2.10/§2.11/§14/§27 — envelopes and errors", () => {
  it("emits exactly the frozen success envelope, with no retired key", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(Object.keys(body).sort()).toEqual(["data", "success"]);
    expect(Object.keys(body.data).sort()).toEqual([
      "appliedJlptLevel",
      "detectedScript",
      "entries",
      "hasMore",
      "limit",
      "offset",
      "query",
      "total",
    ]);

    for (const retired of [
      "results",
      "totalResults",
      "executionTimeMs",
      "page",
      "pagination",
      "returned",
      "queryEcho",
      "apiVersion",
      "meta",
      "warnings",
    ]) {
      expect(body.data).not.toHaveProperty(retired);
    }
  });

  it("returns a safe 500 on service failure — no message, stack, SQL or connection detail", async () => {
    mockSearchEntries.mockRejectedValue(
      new Error(
        "select * from dictionary_entries failed: connect ECONNREFUSED 10.0.0.5:5432 password=supersecret"
      )
    );

    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(res.status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Dictionary search failed" },
    });
    for (const leak of ["stack", "select", "ECONNREFUSED", "password", "supersecret", "5432", "/home/"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("logs the diagnostic server-side instead of discarding it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSearchEntries.mockRejectedValue(new Error("boom"));

    await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps the error envelope free of a `data` key and the success envelope free of `error`", async () => {
    const errorRes = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search"));
    expect(await errorRes.json()).not.toHaveProperty("data");

    mockSearch();
    const okRes = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    expect(await okRes.json()).not.toHaveProperty("error");
  });
});

/* ------------------------------------------------------------------ *
 * 9. Adapter unit boundaries
 * ------------------------------------------------------------------ */

describe("A11 §3/§5 — adapter helpers (unit)", () => {
  it("projectEntry is total over malformed jsonb", () => {
    const malformed = {
      ...canonicalRow(),
      senses: [
        { glosses: ["ok"] },
        null,
        { glosses: "not-an-array" },
        { glosses: [1, "kept", null] },
      ],
      kanjiCharacters: ["水", 5, null],
    } as unknown as CanonicalDictionaryRow;

    const item = projectEntry(malformed);
    expect(item.primaryGlosses).toEqual(["ok", "kept"]);
    expect(item.kanjiCharacters).toEqual(["水"]);
  });

  it("preserves the stored jlptLevel verbatim and derives the tri-state separately", () => {
    for (const stored of ["N5", "NONE", "", "N9"]) {
      const item = projectEntry(canonicalRow({ jlptLevel: stored }));
      expect(item.jlptLevel).toBe(stored);
      expect(item.jlptStatus).toBe(classifyJlptLevel(stored));
    }
    expect(projectEntry(canonicalRow({ jlptLevel: "NONE" })).jlptStatus).toBe("unknown");
    expect(projectEntry(canonicalRow({ jlptLevel: "N9" })).jlptStatus).toBe("invalid");
  });

  it("does not invent falsy values for fields with no producer", () => {
    const item = projectEntry(canonicalRow());
    for (const absent of ["isKeigo", "keigoType", "hasAudio", "audioUrl", "localizedGlosses"]) {
      expect(item).not.toHaveProperty(absent);
    }
  });

  it("flattenGlosses keeps stored order and tolerates empty storage", () => {
    expect(
      flattenGlosses([
        { glosses: ["a", "b"] },
        { glosses: ["c"] },
      ])
    ).toEqual(["a", "b", "c"]);
    expect(flattenGlosses([])).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 4b. A12 decision guards (D-4 / D-9 / D-12 / D-13)
 * ------------------------------------------------------------------ */

describe("A12 §D-9 — the search item is a summary, never a detail shape", () => {
  it("carries none of the declared-but-unproduced detail fields (§A10.7, §A12.6)", async () => {
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const { data } = await res.json();

    for (const entry of data.entries) {
      for (const key of DETAIL_ONLY_KEYS) {
        expect(entry).not.toHaveProperty(key);
      }
    }
  });

  it("never exposes a provenance identifier or the raw source row", async () => {
    // D-5 is unimplemented: the resolved provenance display form does not exist, so neither the raw
    // `sourceRef` nor the `knowledge_sources` identifier may appear in any form.
    mockSearch();
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const body = await res.json();

    expect(JSON.stringify(body)).not.toContain("upstream:");
    for (const entry of body.data.entries) {
      expect(entry).not.toHaveProperty("sourceRef");
      expect(entry).not.toHaveProperty("source");
      expect(entry).not.toHaveProperty("provenance");
      expect(entry).not.toHaveProperty("sourceId");
    }
  });
});

describe("A12 §D-4 — identifier semantics are unchanged (KEEP VERBATIM ID)", () => {
  it("emits the canonical id verbatim, with no aliasing, hashing or rewriting", async () => {
    // A12 audited D-4 and kept the existing identifier: it is already the repository's public
    // dictionary identifier (also accepted by the web detail routes), so no opaque alias was added.
    const ids = ["de-jmdict-1358280", "de-mizu", "de-jmdict-1000000"];
    mockSearch({ entries: ids.map((id) => canonicalRow({ id })) });
    const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
    const body = await res.json();

    expect(body.data.entries.map((e: { id: string }) => e.id)).toEqual(ids);
    for (const entry of body.data.entries) expect(Object.keys(entry)).not.toContain("ent_seq");
  });
});

describe("A12 §D-13 — no rate limiting is claimed or implied", () => {
  it("serves repeated identical requests without throttling (no limiter is wired in)", async () => {
    // This test documents the ABSENCE of a limiter. It is deliberately not a protection test: it
    // proves only that nothing in the route throttles, which is why A12 recorded D-13 as a
    // deployment gate rather than claiming production abuse protection.
    mockSearch();
    const statuses: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const res = await mobileSearchGET(getRequest("/api/v1/mobile/dictionary/search?q=mizu"));
      statuses.push(res.status);
    }
    expect(statuses).toEqual(Array.from({ length: 25 }, () => 200));
  });

  it("imports no rate-limit, middleware or provider mechanism (static)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/app/api/v1/mobile/dictionary/search/route.ts",
      "utf8"
    );
    for (const forbidden of [
      "rateLimit",
      "rate-limit",
      "upstash",
      "redis",
      "middleware",
      "throttle",
      "arcjet",
    ]) {
      expect(source.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("A12 §D-12/§D-14 — decisions are recorded, not implied", () => {
  it("records every A12 decision in the contract (docs-only guard)", async () => {
    const { readFileSync } = await import("node:fs");
    const contract = readFileSync("docs/api/MOBILE-DICTIONARY-API-CONTRACT.md", "utf8");

    // The A12 section must exist exactly once and name each decision with its verdict.
    expect(contract).toContain("# A12 — HARDENING DECISIONS");
    for (const token of [
      "D-12",
      "D-13",
      "D-14",
      "D-9",
      "DEFERRED",
      "IMPLEMENTED",
      "VALIDATION_ERROR",
      "1000",
    ]) {
      expect(contract).toContain(token);
    }
  });

  it("keeps the pagination surface offset-based (no cursor was introduced)", async () => {
    mockSearch();
    const res = await mobileSearchGET(
      getRequest("/api/v1/mobile/dictionary/search?q=mizu&limit=5&offset=10")
    );
    const body = await res.json();

    expect(body.data).not.toHaveProperty("nextCursor");
    expect(body.data).not.toHaveProperty("cursor");
    expect(Object.keys(body.data).sort()).toEqual(
      [
        "appliedJlptLevel",
        "detectedScript",
        "entries",
        "hasMore",
        "limit",
        "offset",
        "query",
        "total",
      ].sort()
    );
  });
});

/* ------------------------------------------------------------------ *
 * 5. A12 security inputs (SQL-injection-like, malformed numerics)
 * ------------------------------------------------------------------ */

describe("A12 §5 — injection-like input is forwarded, never interpreted", () => {
  it("passes an SQL-injection-like q through verbatim and returns a normal envelope", async () => {
    // The route performs no string surgery and no query construction: the value is handed to the
    // canonical service, which builds a *parameterised* `ilike()` predicate from an escaped pattern
    // (`dictionaryService.ts`: `escapeLikePattern(query)` → `ilike(column, pattern)`). This test pins
    // the route's half of that guarantee — no rewriting, no error, no leakage.
    mockSearch({ entries: [], total: 0 });
    const payload = "' OR 1=1 --";
    const res = await mobileSearchGET(
      getRequest(`/api/v1/mobile/dictionary/search?q=${encodeURIComponent(payload)}`)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.query).toBe(payload);
    expect(lastCallOptions()?.query).toBe(payload);
    const serialized = JSON.stringify(body);
    for (const leak of ["select", "SELECT", "syntax", "pg_", "stack"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("keeps malformed numeric parameters non-fatal (no 500, no NaN in the payload)", async () => {
    // A11 already covers `0` / `-5` / `abc` / `Infinity` / `NaN` / `999999999`. This adds the forms
    // those cases do not reach: exponent overflow, an empty value, and a percent-encoded space.
    mockSearch();
    for (const qs of ["limit=1e999", "offset=1e999", "limit=", "offset=%20", "limit=%2B5"]) {
      const res = await mobileSearchGET(
        getRequest(`/api/v1/mobile/dictionary/search?q=mizu&${qs}`)
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(Number.isFinite(body.data.limit)).toBe(true);
      expect(Number.isFinite(body.data.offset)).toBe(true);
    }
  });
});
