import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DictionaryRelatedKanji } from "@/components/dictionary/DictionaryRelatedKanji";
import { KanjiVocabularyLinks } from "@/components/kanji/KanjiVocabularyLinks";
import {
  buildDictionaryEntryHref,
  resolveDictionaryReturnHref,
} from "@/lib/dictionary/searchState";
import {
  buildKanjiDetailHref,
  resolveKanjiDictionaryReturnHref,
} from "@/lib/kanji/navigation";

const SITE_ORIGIN = "https://nihingobridge.invalid";

function renderRelatedKanji(records: unknown, returnTo: string): string {
  return renderToStaticMarkup(
    createElement(DictionaryRelatedKanji, { records, returnTo })
  );
}

function renderVocabularyLinks(
  records: unknown,
  status: "loading" | "loaded" | "error",
  returnTo?: string | null
): string {
  return renderToStaticMarkup(
    createElement(KanjiVocabularyLinks, {
      character: "水",
      records,
      status,
      returnTo,
    })
  );
}

describe("Kanji Detail navigation helpers", () => {
  it("builds encoded canonical Kanji Detail paths for BMP and supplementary ideographs", () => {
    expect(buildKanjiDetailHref("水")).toBe("/kanji/%E6%B0%B4");
    expect(buildKanjiDetailHref("𠮷")).toBe(
      `/kanji/${encodeURIComponent("𠮷")}`
    );
  });

  it("rejects characters that do not satisfy the existing Kanji route contract", () => {
    for (const character of [undefined, null, "", "水日", "かな", "🙂", "/"]) {
      expect(buildKanjiDetailHref(character)).toBeNull();
    }
  });

  it("carries only the canonical Dictionary Search return path", () => {
    const returnTo = resolveDictionaryReturnHref(
      "/dictionary?q=%E6%B0%B4+%E6%9B%9C%E6%97%A5&level=N3&common=true"
    );
    const href = buildKanjiDetailHref("水", returnTo);
    expect(href).not.toBeNull();

    const parsed = new URL(href as string, SITE_ORIGIN);
    expect(parsed.pathname).toBe("/kanji/%E6%B0%B4");
    expect(parsed.searchParams.get("returnTo")).toBe(returnTo);
    expect(buildKanjiDetailHref("水", "https://evil.example/kanji")).toBe(
      "/kanji/%E6%B0%B4?returnTo=%2Fdictionary"
    );
  });

  it("resolves exactly one safe Dictionary Search return and rejects duplicate values", () => {
    expect(
      resolveKanjiDictionaryReturnHref([
        "/dictionary?common=true&level=N2&q=water",
      ])
    ).toBe("/dictionary?q=water&level=N2&common=true");
    expect(resolveKanjiDictionaryReturnHref(["https://evil.example/path"])).toBe(
      "/dictionary"
    );
    expect(resolveKanjiDictionaryReturnHref([])).toBeNull();
    expect(
      resolveKanjiDictionaryReturnHref([
        "/dictionary?q=water",
        "/dictionary?q=fire",
      ])
    ).toBeNull();
  });
});

describe("Dictionary Detail related-kanji navigation", () => {
  const returnTo = "/dictionary?q=%E6%B0%B4&level=N5&common=true";

  it("renders multiple canonical characters as accessible, keyboard-focusable links", () => {
    const html = renderRelatedKanji(
      [
        {
          id: "kanji-water",
          character: "水",
          meaning: "water",
          readingsKun: ["みず"],
          jlptLevel: "N5",
          strokeCount: 4,
          sourceRef: "upstream:kanjidic2:test",
        },
        {
          id: "kanji-good-fortune",
          character: "𠮷",
          meaning: "good fortune",
          readingsKun: ["よし"],
          jlptLevel: "NONE",
          strokeCount: 6,
          sourceRef: "",
        },
      ],
      returnTo
    );

    expect((html.match(/<a\s/g) ?? [])).toHaveLength(2);
    expect(html).toContain(`href="${buildKanjiDetailHref("水", returnTo)}"`);
    expect(html).toContain(`href="${buildKanjiDetailHref("𠮷", returnTo)}"`);
    expect(html).toContain('aria-label="Open Kanji Detail for 水 (water)"');
    expect(html).toContain('aria-label="Open Kanji Detail for 𠮷 (good fortune)"');
    expect(html).toContain("Kanji used in this word");
    expect(html).toContain(
      "This is a character match, not a structural decomposition."
    );
    expect(html).toContain("Source reference: upstream:kanjidic2:test");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain("JLPT NONE");
    expect(html).not.toContain("undefined");
  });

  it("omits missing or invalid destinations and hides an empty section", () => {
    const mixed = renderRelatedKanji(
      [
        { character: "水", meaning: "water" },
        { character: "水日", meaning: "invalid multi-character destination" },
        { character: "", meaning: "missing destination" },
        { character: "かな" },
        null,
        {},
      ],
      returnTo
    );

    expect((mixed.match(/<a\s/g) ?? [])).toHaveLength(1);
    expect(mixed).toContain('aria-label="Open Kanji Detail for 水 (water)"');
    expect(mixed).not.toContain("invalid multi-character destination");
    expect(mixed).not.toContain("missing destination");
    expect(renderRelatedKanji([], returnTo)).toBe("");
    expect(renderRelatedKanji(null, returnTo)).toBe("");
  });
});

describe("Kanji Detail dictionary-entry navigation", () => {
  const returnTo = "/dictionary?q=%E6%B0%B4&level=N4&common=true";

  it("links ID-backed dictionary associations using encoded entry IDs and preserves search context", () => {
    const html = renderVocabularyLinks(
      [
        {
          entryId: "de-jmdict/水",
          headword: "水",
          wordReading: "みず",
          senses: [{ glosses: ["water"] }],
          jlptLevel: "N5",
          isCommon: true,
          frequencyRank: 0,
          sourceRef: "upstream:jmdict:test",
        },
        {
          entryId: "entry/水曜日",
          headword: "水曜日",
          wordReading: "すいようび",
          senses: [{ glosses: ["Wednesday"] }],
          jlptLevel: "N4",
          isCommon: false,
          frequencyRank: null,
          sourceRef: "upstream:jmdict:test",
        },
        {
          entryId: "bad\u0000id",
          headword: "must not link",
        },
        {
          entryId: "missing-headword",
          headword: " ",
        },
      ],
      "loaded",
      returnTo
    );

    expect((html.match(/<a\s/g) ?? [])).toHaveLength(2);
    expect(html).toContain(
      `href="${buildDictionaryEntryHref("de-jmdict/水", returnTo)}"`
    );
    expect(html).toContain(
      `href="${buildDictionaryEntryHref("entry/水曜日", returnTo)}"`
    );
    expect(html).toContain('aria-label="Open dictionary entry for 水 (みず)"');
    expect(html).toContain("Frequency #0");
    expect(html).toContain("Source reference: upstream:jmdict:test");
    expect(html).toContain(
      "They indicate character usage, not structural decomposition. Up to 50"
    );
    expect(html).not.toContain("must not link");
    expect(html).not.toContain("missing-headword");
    expect(html).toContain("focus-visible:ring-2");
  });

  it("does not turn display-only kanji examples into dictionary links", () => {
    const html = renderVocabularyLinks(
      [
        {
          word: "水曜日",
          reading: "すいようび",
          meaning: "Wednesday",
        },
      ],
      "loaded",
      returnTo
    );

    expect((html.match(/<a\s/g) ?? [])).toHaveLength(0);
    expect(html).toContain("No linked dictionary entries are available");
    expect(html).not.toContain("/dictionary/");
  });

  it("provides clear loading, unavailable, and empty states", () => {
    expect(renderVocabularyLinks([], "loading")).toContain(
      "Loading linked dictionary entries"
    );
    expect(renderVocabularyLinks([], "error")).toContain(
      "Linked dictionary entries are temporarily unavailable"
    );
    expect(renderVocabularyLinks([], "loaded")).toContain(
      "No linked dictionary entries are available for this character"
    );
  });

  it("validates return context again at the dictionary-link boundary", () => {
    const html = renderVocabularyLinks(
      [{ entryId: "entry/water", headword: "水" }],
      "loaded",
      "https://evil.example/dictionary?q=water"
    );
    expect(html).toContain(
      'href="/dictionary/entry%2Fwater?returnTo=%2Fdictionary"'
    );
    expect(html).not.toContain("evil.example");
  });
});
