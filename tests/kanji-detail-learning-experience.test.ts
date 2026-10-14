import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  createKanjiCopyFeedback,
  getKanjiCopyText,
  KanjiCopyFeedbackView,
  KanjiReferenceDetails,
  KanjiStoredExamples,
  writeKanjiCopyText,
  type KanjiReferenceRadical,
  type KanjiReferenceRecord,
} from "@/components/kanji/KanjiReferenceDetails";
import { resolveDictionaryReturnHref } from "@/lib/dictionary/searchState";

const SITE_ORIGIN = "https://nihingobridge.invalid";
const RETURN_TO = resolveDictionaryReturnHref(
  "/dictionary?q=%E6%B0%B4&level=N3&common=true"
);

function renderDetails(
  record: KanjiReferenceRecord,
  radical?: KanjiReferenceRadical | null,
  returnTo?: string | null
): string {
  return renderToStaticMarkup(
    createElement(KanjiReferenceDetails, {
      record,
      radical,
      returnTo,
      onSpeak: () => {},
    })
  );
}

describe("Kanji Detail reference information", () => {
  it("renders canonical fields with On and Kun readings kept in separate groups", () => {
    const html = renderDetails(
      {
        character: "水",
        meaning: "water",
        readingsOn: [" スイ ", "ショウ"],
        readingsKun: ["みず", "かわ"],
        strokeCount: 4,
        jlptLevel: "N5",
        gradeLevel: 1,
        mnemonic: "A flowing stream.",
      },
      { character: "水", meaning: "water radical", category: "radical" },
      RETURN_TO
    );

    expect(html).toContain('<h1 id="kanji-reference-heading"');
    expect(html).toContain(">水</h1>");
    expect(html).toContain(">Meaning</h2>");
    expect(html).toContain(">water</p>");
    expect(html).toContain("JLPT");
    expect(html).toContain(">N5</dd>");
    expect(html).toContain("School grade");
    expect(html).toContain(">1</dd>");
    expect(html).toContain("Stroke count");
    expect(html).toContain(">4</dd>");
    expect(html).toContain("Primary radical");
    expect(html).toContain("water radical");
    expect(html).toContain("Memory aid");
    expect(html).toContain("A flowing stream.");

    const onIndex = html.indexOf("On&#x27;yomi");
    const kunIndex = html.indexOf("Kun&#x27;yomi");
    expect(onIndex).toBeGreaterThan(-1);
    expect(kunIndex).toBeGreaterThan(onIndex);
    const onGroupMarkup = html.slice(onIndex, kunIndex);
    const kunGroupMarkup = html.slice(kunIndex);
    expect(onGroupMarkup).toContain("スイ");
    expect(onGroupMarkup).not.toContain("みず");
    expect(kunGroupMarkup).toContain("みず");
    expect(kunGroupMarkup).not.toContain("スイ");
    expect((html.match(/スイ/g) ?? []).length).toBe(1);
    expect((html.match(/みず/g) ?? []).length).toBe(1);
  });

  it("does not label a non-radical primitive as a radical", () => {
    const html = renderDetails(
      { character: "時" },
      { character: "寺", meaning: "temple", category: "primitive" }
    );

    expect(html).toContain("Primary component");
    expect(html).not.toContain("Primary radical");
    expect(html).toContain("temple");
  });

  it("uses the canonical JLPT predicate and handles explicit unclassified values", () => {
    const known = renderDetails({ character: "水", jlptLevel: "N4" });
    const sentinel = renderDetails({ character: "水", jlptLevel: "NONE" });
    const invalid = renderDetails({ character: "水", jlptLevel: "N6" });

    expect(known).toContain(">N4</dd>");
    expect(known).not.toContain("Unclassified");
    expect(sentinel).toContain("Unclassified");
    expect(sentinel).not.toContain("NONE");
    expect(invalid).not.toContain("JLPT");
    expect(invalid).not.toContain("Unclassified");
    expect(invalid).not.toContain(">N6</dd>");
  });

  it("omits missing optional values and reports absent reading data honestly", () => {
    const html = renderDetails({
      character: "水",
      meaning: " ",
      readingsOn: null,
      readingsKun: [],
      strokeCount: null,
      jlptLevel: null,
      gradeLevel: 0,
      mnemonic: "",
    });

    expect(html).toContain("No reading data is available for this character.");
    expect(html).not.toContain(">Meaning</h2>");
    expect(html).not.toContain("JLPT");
    expect(html).not.toContain("School grade");
    expect(html).not.toContain("Stroke count");
    expect(html).not.toContain("Primary radical");
    expect(html).not.toContain("Memory aid");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("renders named native actions and visible focus styling", () => {
    const html = renderDetails({ character: "水", meaning: "water" }, null, RETURN_TO);

    expect(html).toContain('role="group" aria-label="Kanji reference actions"');
    expect(html).toContain(">Copy Kanji</button>");
    expect(html).toContain(">Copy Kanji Detail Link</button>");
    expect(html).toContain('aria-label="Listen to kanji 水"');
    expect(html).toContain("focus-visible:ring-2");
  });
});

describe("Stored kanji examples", () => {
  it("keeps JSON examples visibly separate and never turns their strings into links", () => {
    const html = renderToStaticMarkup(
      createElement(KanjiStoredExamples, {
        examples: [
          {
            word: "水曜日",
            reading: "すいようび",
            meaning: "Wednesday",
            entryId: "untrusted-display-only-id",
          },
          { word: " ", reading: null, meaning: undefined },
        ],
        onSpeak: () => {},
      })
    );

    expect(html).toContain("Example vocabulary stored on this kanji record");
    expect(html).toContain("These display-only examples are not dictionary links");
    expect(html).toContain('aria-label="Listen to example 水曜日, すいようび"');
    expect((html.match(/<button\s/g) ?? [])).toHaveLength(1);
    expect((html.match(/<a\s/g) ?? [])).toHaveLength(0);
    expect(html).not.toContain("untrusted-display-only-id");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(
      renderToStaticMarkup(
        createElement(KanjiStoredExamples, { examples: [], onSpeak: () => {} })
      )
    ).toBe("");
  });
});

describe("Kanji copy actions", () => {
  it("copies a Kanji and builds a same-origin encoded link with validated return context", () => {
    expect(getKanjiCopyText("kanji", "水", RETURN_TO, SITE_ORIGIN)).toBe("水");

    const linkText = getKanjiCopyText(
      "detail-link",
      "𠮷",
      RETURN_TO,
      SITE_ORIGIN
    );
    const detailUrl = new URL(linkText);
    expect(detailUrl.origin).toBe(SITE_ORIGIN);
    expect(detailUrl.pathname).toBe(`/kanji/${encodeURIComponent("𠮷")}`);
    expect(detailUrl.searchParams.get("returnTo")).toBe(RETURN_TO);

    const unsafeReturnLink = getKanjiCopyText(
      "detail-link",
      "水",
      "https://evil.example/redirect",
      SITE_ORIGIN
    );
    const safeUrl = new URL(unsafeReturnLink);
    expect(safeUrl.origin).toBe(SITE_ORIGIN);
    expect(safeUrl.searchParams.get("returnTo")).toBe("/dictionary");
    expect(unsafeReturnLink).not.toContain("evil.example");
    expect(() => getKanjiCopyText("detail-link", "水日", undefined, SITE_ORIGIN)).toThrow(
      "A valid Kanji character is required."
    );
  });

  it("reports copy success and failure and exposes a manual same-origin link fallback", () => {
    const success = createKanjiCopyFeedback("kanji", true);
    expect(success).toEqual({ message: "Kanji copied.", failed: false });
    const successMarkup = renderToStaticMarkup(
      createElement(KanjiCopyFeedbackView, { feedback: success })
    );
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain('aria-live="polite"');
    expect(successMarkup).toContain("Kanji copied.");

    const fallbackUrl = getKanjiCopyText(
      "detail-link",
      "水",
      RETURN_TO,
      SITE_ORIGIN
    );
    const failure = createKanjiCopyFeedback("detail-link", false, fallbackUrl);
    expect(failure.failed).toBe(true);
    expect(failure.message).toContain("copy it manually");
    expect(failure.fallbackValue).toBe(fallbackUrl);

    const markup = renderToStaticMarkup(
      createElement(KanjiCopyFeedbackView, { feedback: failure })
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("Kanji Detail URL to copy manually");
    expect(markup).toContain('readOnly=""');
    expect(markup).toContain(`value="${fallbackUrl.replace(/&/g, "&amp;")}"`);

    const characterFailure = createKanjiCopyFeedback("kanji", false);
    expect(characterFailure.failed).toBe(true);
    expect(characterFailure.message).toContain("Select the character above");
    expect(characterFailure.fallbackValue).toBeUndefined();
  });

  it("handles clipboard writers that resolve or reject", async () => {
    const writeText = vi.fn(async (_text: string): Promise<void> => {});
    expect(await writeKanjiCopyText("水", writeText)).toBe(true);
    expect(writeText).toHaveBeenCalledWith("水");

    const rejectedWrite = vi.fn(async (_text: string): Promise<void> => {
      throw new Error("clipboard denied");
    });
    expect(await writeKanjiCopyText("水", rejectedWrite)).toBe(false);
  });
});
