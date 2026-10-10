import { describe, expect, it } from "vitest";

import {
  buildDictionarySearchHref,
  DICTIONARY_JLPT_LEVELS,
  parseDictionarySearchState,
  planDictionarySearchUpdate,
} from "@/lib/dictionary/searchState";

function parse(queryString: string) {
  return parseDictionarySearchState(new URLSearchParams(queryString));
}

describe("dictionary search URL state", () => {
  it("parses a shareable query with canonical filters", () => {
    expect(parse("q=%20water%20&level=N3&common=true")).toEqual({
      query: "water",
      level: "N3",
      commonOnly: true,
    });
  });

  it("accepts every canonical JLPT URL filter", () => {
    for (const level of DICTIONARY_JLPT_LEVELS) {
      expect(parse(`level=${level}`).level).toBe(level);
    }
  });

  it("does not infer JLPT filters from noncanonical or malformed values", () => {
    for (const level of ["5", "n5", "NONE", "N0", "N6", "N10", "2024-07", "level N5"]) {
      expect(parse(`level=${encodeURIComponent(level)}`).level).toBe("ALL");
    }
  });

  it("accepts only the literal true value for the common-only filter", () => {
    expect(parse("common=true").commonOnly).toBe(true);
    for (const value of ["", "false", "TRUE", "1", "yes"]) {
      expect(parse(`common=${value}`).commonOnly).toBe(false);
    }
  });

  it("builds a deterministic Unicode-safe URL and omits defaults", () => {
    expect(
      buildDictionarySearchHref({
        query: "  水 曜日  ",
        level: "N5",
        commonOnly: true,
      })
    ).toBe("/dictionary?q=%E6%B0%B4+%E6%9B%9C%E6%97%A5&level=N5&common=true");

    expect(
      buildDictionarySearchHref({
        query: "   ",
        level: "ALL",
        commonOnly: false,
      })
    ).toBe("/dictionary");
  });

  it("round-trips the supported state without retaining unrelated parameters", () => {
    const source = new URLSearchParams(
      "q=taberu&level=N2&common=true&limit=999&unknown=value"
    );
    const href = buildDictionarySearchHref(parseDictionarySearchState(source));
    const serialized = href.split("?")[1] ?? "";

    expect(href).toBe("/dictionary?q=taberu&level=N2&common=true");
    expect(parse(serialized)).toEqual({
      query: "taberu",
      level: "N2",
      commonOnly: true,
    });
  });

  it("refreshes an unchanged committed search while canonicalizing its URL", () => {
    const state = {
      query: "water",
      level: "N5" as const,
      commonOnly: true,
    };

    expect(
      planDictionarySearchUpdate(
        "/dictionary?common=true&utm_source=lesson&level=N5&q=water",
        state,
        state,
        true
      )
    ).toEqual({
      state,
      href: "/dictionary?q=water&level=N5&common=true",
      shouldNavigate: true,
      shouldRefresh: true,
    });
  });
});
