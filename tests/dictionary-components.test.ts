import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DictionaryEntryCard,
  type DictionaryEntryCardEntry,
} from "@/components/dictionary/DictionaryEntryCard";

const BASE_ENTRY: DictionaryEntryCardEntry = {
  id: "de-jmdict-1000010",
  headword: "水",
  reading: "みず",
  romaji: "mizu",
  jlptLevel: "N5",
  isCommon: true,
  partsOfSpeech: ["noun"],
  senses: [{ glosses: ["water", "fluid"], note: "especially cool water" }],
  tags: ["common", "field:chemistry"],
};

function renderCard(overrides: Partial<DictionaryEntryCardEntry> = {}): string {
  return renderToStaticMarkup(
    createElement(DictionaryEntryCard, {
      entry: { ...BASE_ENTRY, ...overrides },
    })
  );
}

describe("DictionaryEntryCard", () => {
  it("renders the learner-facing entry summary and accessible details link", () => {
    const html = renderCard();

    expect(html).toContain('href="/dictionary/de-jmdict-1000010"');
    expect(html).toContain('aria-label="View dictionary entry 水 (みず)"');
    expect(html).toContain("水");
    expect(html).toContain("みず");
    expect(html).toContain("mizu");
    expect(html).toContain("water; fluid");
    expect(html).toContain("especially cool water");
    expect(html).toContain("Common");
    expect(html).toContain("JLPT N5");
    expect(html).toContain("[noun]");
    expect(html).toContain("#field:chemistry");
  });

  it("renders every canonical JLPT level as a classification", () => {
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
      expect(renderCard({ jlptLevel: level })).toContain(`JLPT ${level}`);
    }
  });

  it("does not present sentinels or malformed values as JLPT classifications", () => {
    for (const level of [null, "NONE", "2024-07", "n5", "N6"]) {
      const html = renderCard({ jlptLevel: level });
      expect(html).toContain("JLPT unclassified");
      expect(html).not.toContain(`JLPT ${level}`);
    }
  });

  it("encodes entry identifiers and keeps result previews bounded", () => {
    const html = renderCard({
      id: "entry/水",
      senses: [
        { glosses: ["first meaning"] },
        { glosses: ["second meaning"] },
        { glosses: ["third meaning"] },
      ],
      tags: ["one", "two", "three", "four"],
    });

    expect(html).toContain('href="/dictionary/entry%2F%E6%B0%B4"');
    expect(html).toContain("first meaning");
    expect(html).toContain("second meaning");
    expect(html).not.toContain("third meaning");
    expect(html).toContain("#three");
    expect(html).not.toContain("#four");
  });

  it("uses an explicit fallback without inventing a definition", () => {
    expect(renderCard({ senses: [] })).toContain("Definition unavailable");
    expect(renderCard({ senses: [{ glosses: [] }] })).toContain("Definition unavailable");
  });
});
