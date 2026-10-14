import { createElement, Fragment } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KanjiReferenceDetails, KanjiStoredExamples } from "@/components/kanji/KanjiReferenceDetails";
import {
  getKanjiStrokeOrderImageSource,
  KanjiStrokeOrderPanel,
  KanjiStrokeOrderPanelView,
  resolveKanjiStrokeOrderResponse,
} from "@/components/kanji/KanjiStrokeOrderPanel";
import { KanjiVocabularyLinks } from "@/components/kanji/KanjiVocabularyLinks";
import {
  buildDictionaryEntryHref,
  resolveDictionaryReturnHref,
} from "@/lib/dictionary/searchState";
import { KanjiVisualService } from "@/services/knowledge/kanjiVisualService";

const RETURN_TO = resolveDictionaryReturnHref(
  "/dictionary?q=%E6%B0%B4&level=N3&common=true"
);

function renderPanel(
  status: "loading" | "available" | "unavailable" | "error",
  imageSource?: string
): string {
  return renderToStaticMarkup(
    createElement(KanjiStrokeOrderPanelView, {
      character: "水",
      status,
      imageSource,
      onRetry: () => {},
      onImageError: () => {},
    })
  );
}

describe("KanjiVG stroke-order asset integration", () => {
  it("looks up 水 from the pinned index and renders its local SVG through KanjiVisualService", () => {
    const index = JSON.parse(
      readFileSync("data/kanjivg-index.json", "utf8")
    ) as Record<string, string[]>;
    expect(index["水"]).toEqual(["06c34.svg"]);

    const service = new KanjiVisualService();
    const asset = service.getVisualAsset("水");
    const diagram = service.renderStrokeOrderDiagram("水");

    expect(asset).not.toBeNull();
    expect(asset?.strokes.length).toBeGreaterThan(0);
    expect(diagram).toMatch(/^<svg\b/);
    expect(diagram).toContain("kvg:StrokePaths_水");
    expect((diagram?.match(/<path\b/g) ?? []).length).toBe(asset?.strokes.length);
    expect(diagram).not.toContain("<text");
  });

  it("returns no diagram for a valid unified ideograph without an indexed asset", () => {
    const service = new KanjiVisualService();
    expect(service.getVisualAsset("𠀀")).toBeNull();
    expect(service.renderStrokeOrderDiagram("𠀀")).toBeNull();
  });
});

describe("Kanji stroke-order response handling", () => {
  it("accepts a usable result only for the requested character", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>';
    const resolved = resolveKanjiStrokeOrderResponse(
      { ok: true, status: 200 },
      { success: true, character: "水", diagramSvg: svg },
      "水"
    );

    expect(resolved.status).toBe("available");
    if (resolved.status === "available") {
      expect(resolved.imageSource).toBe(getKanjiStrokeOrderImageSource(svg));
      expect(resolved.imageSource).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    }

    expect(
      resolveKanjiStrokeOrderResponse(
        { ok: true, status: 200 },
        { success: true, character: "本", diagramSvg: svg },
        "水"
      )
    ).toEqual({ status: "error" });
  });

  it("distinguishes an unavailable asset from malformed or failed results", () => {
    expect(
      resolveKanjiStrokeOrderResponse(
        { ok: false, status: 404 },
        {
          success: false,
          error: { code: "STROKE_ORDER_UNAVAILABLE" },
        },
        "𠀀"
      )
    ).toEqual({ status: "unavailable" });

    expect(
      resolveKanjiStrokeOrderResponse(
        { ok: true, status: 200 },
        { success: true, character: "水", diagramSvg: "<html>not an SVG</html>" },
        "水"
      )
    ).toEqual({ status: "error" });

    expect(
      resolveKanjiStrokeOrderResponse(
        { ok: false, status: 500 },
        { success: false, error: { code: "STROKE_ORDER_RENDER_FAILED" } },
        "水"
      )
    ).toEqual({ status: "error" });
  });

  it("fails closed for non-SVG or active/external markup before image rendering", () => {
    expect(getKanjiStrokeOrderImageSource(null)).toBeNull();
    expect(getKanjiStrokeOrderImageSource("<svg>broken")).toBeNull();
    expect(
      getKanjiStrokeOrderImageSource(
        '<svg><script>alert(1)</script><path d="M0 0" /></svg>'
      )
    ).toBeNull();
    expect(
      getKanjiStrokeOrderImageSource(
        '<svg><image href="https://example.invalid/a.png" /></svg>'
      )
    ).toBeNull();
  });
});

describe("Kanji stroke-order panel presentation", () => {
  it("labels the image accessibly and keeps SVG markup out of the HTML DOM", () => {
    const imageSource = getKanjiStrokeOrderImageSource(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>'
    );
    expect(imageSource).not.toBeNull();

    const html = renderPanel("available", imageSource ?? undefined);
    expect(html).toContain('aria-labelledby="kanji-stroke-order-heading"');
    expect(html).toContain('alt="KanjiVG stroke-order diagram for 水"');
    expect(html).toContain("data:image/svg+xml;charset=utf-8,%3Csvg");
    expect(html).not.toContain("<path");
    expect(html).not.toContain("<svg");
    expect(html).toContain("structural component decomposition below");
    expect(html).toContain("does not display stroke numbers");
  });

  it("renders honest unavailable and recoverable error states with native controls", () => {
    const unavailable = renderPanel("unavailable");
    expect(unavailable).toContain('role="status"');
    expect(unavailable).toContain("No usable KanjiVG stroke-order asset is available for 水.");

    const error = renderPanel("error");
    expect(error).toContain('role="alert"');
    expect(error).toContain("could not be rendered or loaded");
    expect(error).toContain(">Retry stroke-order diagram</button>");
    expect(error).toContain("focus-visible:ring-2");

    const loading = renderToStaticMarkup(
      createElement(KanjiStrokeOrderPanel, { character: "水" })
    );
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading the stroke-order diagram for 水");
  });

  it("keeps summary actions, display-only examples, and ID-backed links distinct beside the panel", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(KanjiReferenceDetails, {
          record: {
            character: "水",
            meaning: "water",
            readingsOn: ["スイ"],
            readingsKun: ["みず"],
            strokeCount: 4,
          },
          returnTo: RETURN_TO,
          onSpeak: () => {},
        }),
        createElement(KanjiStoredExamples, {
          examples: [
            {
              word: "水曜日",
              reading: "すいようび",
              meaning: "Wednesday",
              entryId: "display-only-id",
            },
          ],
          onSpeak: () => {},
        }),
        createElement(KanjiStrokeOrderPanelView, {
          character: "水",
          status: "unavailable",
          onRetry: () => {},
          onImageError: () => {},
        }),
        createElement(KanjiVocabularyLinks, {
          character: "水",
          records: [
            {
              entryId: "entry-water",
              headword: "水道",
              wordReading: "すいどう",
              senses: [{ glosses: ["water supply"] }],
              jlptLevel: "N2",
              isCommon: true,
              frequencyRank: 10,
            },
          ],
          status: "loaded",
          returnTo: RETURN_TO,
        })
      )
    );

    expect(html).toContain(">Copy Kanji</button>");
    expect(html).toContain(">Copy Kanji Detail Link</button>");
    expect(html).toContain("Example vocabulary stored on this kanji record");
    expect(html).toContain("These display-only examples are not dictionary links");
    expect(html).not.toContain("display-only-id");
    expect(html).toContain("Dictionary entries containing 水");
    expect(html).toContain(buildDictionaryEntryHref("entry-water", RETURN_TO));
    expect(html).toContain("water supply");
    expect(html.match(/<a\s/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('href="/dictionary/display-only-id');
  });
});

describe("Kanji Detail page integration regression", () => {
  it("keeps the existing tree, 50-entry vocabulary request, and validated return-context wiring", () => {
    const page = readFileSync("src/app/kanji/[character]/page.tsx", "utf8");
    const panelIndex = page.indexOf("<KanjiStrokeOrderPanel");
    const vocabularyIndex = page.indexOf("<KanjiVocabularyLinks");
    const treeIndex = page.indexOf("Component Tree");

    expect(panelIndex).toBeGreaterThan(-1);
    expect(vocabularyIndex).toBeGreaterThan(panelIndex);
    expect(treeIndex).toBeGreaterThan(vocabularyIndex);
    expect(page).toContain("vocabulary?limit=50");
    expect(page).toContain("resolveKanjiDictionaryReturnHref(returnToValues)");
    expect(page).toContain("<KanjiReferenceDetails");
    expect(page).toContain("<KanjiStoredExamples");
  });
});
