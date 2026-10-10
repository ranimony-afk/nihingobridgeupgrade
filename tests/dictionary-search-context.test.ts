import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dictionaryService = vi.hoisted(() => ({
  getEntryDetail: vi.fn(),
}));
const notFound = vi.hoisted(() => vi.fn());

vi.mock("@/services/dictionary", () => ({
  DictionaryService: dictionaryService,
}));
vi.mock("next/navigation", () => ({ notFound }));

import DictionaryEntryPage from "@/app/dictionary/[id]/page";
import {
  DictionaryAutocompleteView,
  type DictionaryAutocompleteViewProps,
} from "@/components/dictionary/DictionaryAutocomplete";
import {
  DictionaryEntryCard,
  type DictionaryEntryCardEntry,
} from "@/components/dictionary/DictionaryEntryCard";
import type { DictionaryAutocompleteSuggestion } from "@/lib/dictionary/autocomplete";
import {
  DICTIONARY_SEARCH_FALLBACK_HREF,
  buildDictionaryEntryHref,
  buildDictionarySearchHref,
  resolveDictionaryReturnHref,
} from "@/lib/dictionary/searchState";

const WATER_ENTRY: DictionaryEntryCardEntry = {
  id: "entry/水",
  headword: "水",
  reading: "みず",
  romaji: "mizu",
  jlptLevel: "N5",
  isCommon: true,
  partsOfSpeech: ["noun"],
  senses: [{ glosses: ["water"] }],
  tags: ["common"],
};

const WATER_SUGGESTION: DictionaryAutocompleteSuggestion = {
  id: WATER_ENTRY.id,
  headword: WATER_ENTRY.headword,
  reading: WATER_ENTRY.reading,
  romaji: WATER_ENTRY.romaji,
  jlptLevel: WATER_ENTRY.jlptLevel,
  gloss: "water",
};

function dictionaryDetail() {
  return {
    entry: {
      ...WATER_ENTRY,
      frequencyRank: 10,
      kanjiCharacters: ["水"],
      sourceRef: "upstream:jmdict:test",
    },
    source: null,
    kanji: [],
    sentences: [],
    relatedGrammar: [],
  };
}

async function renderDetail(returnTo?: string | string[]): Promise<string> {
  const element = await DictionaryEntryPage({
    params: Promise.resolve({ id: "entry/水" }),
    searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }),
  });
  return renderToStaticMarkup(element);
}

function renderAutocomplete(returnTo: string): string {
  const props: DictionaryAutocompleteViewProps = {
    query: "水",
    returnTo,
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    listboxId: "dictionary-context-suggestions",
    popupOpen: true,
    status: "success",
    suggestions: [WATER_SUGGESTION],
    activeIndex: 0,
    onInputFocus: vi.fn(),
    onInputKeyDown: vi.fn(),
    onSuggestionActive: vi.fn(),
    onSuggestionSelect: vi.fn(),
  };
  return renderToStaticMarkup(createElement(DictionaryAutocompleteView, props));
}

beforeEach(() => {
  dictionaryService.getEntryDetail.mockReset();
  dictionaryService.getEntryDetail.mockResolvedValue(dictionaryDetail());
  notFound.mockReset();
});

describe("dictionary search-context navigation", () => {
  it("preserves canonical query, JLPT, and common-word filters in an encoded detail link", () => {
    const returnTo = buildDictionarySearchHref({
      query: "水 曜日",
      level: "N3",
      commonOnly: true,
    });
    const detailHref = buildDictionaryEntryHref(WATER_ENTRY.id, returnTo);
    const parsedDetail = new URL(detailHref, "https://nihingobridge.invalid");

    expect(returnTo).toBe(
      "/dictionary?q=%E6%B0%B4+%E6%9B%9C%E6%97%A5&level=N3&common=true"
    );
    expect(parsedDetail.pathname).toBe("/dictionary/entry%2F%E6%B0%B4");
    expect(parsedDetail.searchParams.get("returnTo")).toBe(returnTo);
    expect(resolveDictionaryReturnHref(parsedDetail.searchParams.get("returnTo"))).toBe(
      returnTo
    );
    expect(detailHref).toContain("q%3D%25E6%25B0%25B4%2B%25E6%259B%259C");
  });

  it("canonicalizes parameter order and excludes unsupported return parameters", () => {
    expect(
      resolveDictionaryReturnHref(
        "/dictionary?common=true&utm_source=lesson&level=N2&q=%E6%B0%B4"
      )
    ).toBe("/dictionary?q=%E6%B0%B4&level=N2&common=true");
    expect(resolveDictionaryReturnHref("/dictionary?q=water")).toBe(
      "/dictionary?q=water"
    );
  });

  it("rejects external, protocol-relative, malformed, ambiguous, and unsupported returns", () => {
    const rejected: unknown[] = [
      undefined,
      null,
      "",
      "dictionary?q=water",
      "https://evil.example/dictionary?q=water",
      "//evil.example/dictionary?q=water",
      "/kanji?q=water",
      "/dictionary/entry?q=water",
      "/dictionary?q=%E0%A4%A",
      "/dictionary?q=water&level=N6",
      "/dictionary?q=water&common=TRUE",
      "/dictionary?q=water#results",
      "/dictionary\\@evil.example?q=water",
      "/dictionary?q=water\u0001",
      "/dictionary?level=N3&level=N2",
      "/dictionary?common=true&common=false",
      "/dictionary?q=water&q=fire",
      ["/dictionary?q=water"],
    ];

    for (const value of rejected) {
      expect(resolveDictionaryReturnHref(value)).toBe(DICTIONARY_SEARCH_FALLBACK_HREF);
    }
  });

  it("uses the canonical return URL on detail pages and falls back for direct visits", async () => {
    const contextual = await renderDetail(
      "/dictionary?common=true&campaign=ignored&level=N2&q=water"
    );
    const direct = await renderDetail();
    const unsafe = await renderDetail("https://evil.example/dictionary?q=water");

    expect(contextual).toContain(
      'href="/dictionary?q=water&amp;level=N2&amp;common=true"'
    );
    expect(direct).toContain('href="/dictionary"');
    expect(unsafe).toContain('href="/dictionary"');
    expect(dictionaryService.getEntryDetail).toHaveBeenCalledWith("entry/水");
  });

  it("adds the same validated return context to result and autocomplete links", () => {
    const returnTo = "/dictionary?q=%E6%B0%B4&level=N5&common=true";
    const expectedHref = buildDictionaryEntryHref(WATER_ENTRY.id, returnTo);
    const card = renderToStaticMarkup(
      createElement(DictionaryEntryCard, { entry: WATER_ENTRY, returnTo })
    );
    const autocomplete = renderAutocomplete(returnTo);

    expect(card).toContain(`href="${expectedHref}"`);
    expect(autocomplete).toContain(`href="${expectedHref}"`);
  });
});
