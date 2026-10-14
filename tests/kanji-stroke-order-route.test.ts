import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/knowledge/kanjiVisualService", () => ({
  kanjiVisualService: {
    renderStrokeOrderDiagram: vi.fn(),
  },
}));

import {
  GET,
  MAX_STROKE_ORDER_SVG_BYTES,
} from "@/app/api/kanji/[character]/stroke-order/route";
import { kanjiVisualService } from "@/services/knowledge/kanjiVisualService";

const renderStrokeOrderDiagram = vi.mocked(
  kanjiVisualService.renderStrokeOrderDiagram
);

function makeRequest(character = "水"): NextRequest {
  return new NextRequest(
    `http://localhost/api/kanji/${encodeURIComponent(character)}/stroke-order`
  );
}

function routeParams(character: string) {
  return { params: Promise.resolve({ character }) };
}

const SVG_PREFIX = '<svg xmlns="http://www.w3.org/2000/svg"><!--';
const SVG_SUFFIX = "--></svg>";

function svgWithByteLength(byteLength: number): string {
  const fillerBytes =
    byteLength - Buffer.byteLength(`${SVG_PREFIX}${SVG_SUFFIX}`, "utf8");
  if (fillerBytes < 0) throw new Error("Requested test SVG is too small");
  return `${SVG_PREFIX}${"x".repeat(fillerBytes)}${SVG_SUFFIX}`;
}

function svgWithCodeUnitsAtLimitAndBytesOverLimit(): string {
  const fillerBytes =
    MAX_STROKE_ORDER_SVG_BYTES -
    Buffer.byteLength(`${SVG_PREFIX}${SVG_SUFFIX}`, "utf8");
  return `${SVG_PREFIX}水${"x".repeat(fillerBytes - 1)}${SVG_SUFFIX}`;
}

describe("GET /api/kanji/[character]/stroke-order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and passes the requested character to the existing renderer", async () => {
    const diagramSvg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>';
    renderStrokeOrderDiagram.mockReturnValue(diagramSvg);

    const response = await GET(makeRequest(), routeParams("水"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      character: "水",
      diagramSvg,
    });
    expect(renderStrokeOrderDiagram).toHaveBeenCalledOnce();
    expect(renderStrokeOrderDiagram).toHaveBeenCalledWith("水");
  });

  it("accepts a diagram exactly at the UTF-8 byte limit", async () => {
    const diagramSvg = svgWithByteLength(MAX_STROKE_ORDER_SVG_BYTES);
    expect(Buffer.byteLength(diagramSvg, "utf8")).toBe(MAX_STROKE_ORDER_SVG_BYTES);
    renderStrokeOrderDiagram.mockReturnValue(diagramSvg);

    const response = await GET(makeRequest(), routeParams("水"));
    expect(response.status).toBe(200);
    expect((await response.json()).diagramSvg).toBe(diagramSvg);
  });

  it("rejects an SVG whose UTF-8 byte size exceeds the limit without returning it", async () => {
    const diagramSvg = svgWithCodeUnitsAtLimitAndBytesOverLimit();
    expect(diagramSvg.length).toBe(MAX_STROKE_ORDER_SVG_BYTES);
    expect(Buffer.byteLength(diagramSvg, "utf8")).toBe(
      MAX_STROKE_ORDER_SVG_BYTES + 2
    );
    renderStrokeOrderDiagram.mockReturnValue(diagramSvg);

    const response = await GET(makeRequest(), routeParams("水"));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: "STROKE_ORDER_TOO_LARGE" },
    });
    expect(body).not.toHaveProperty("diagramSvg");
    expect(JSON.stringify(body)).not.toContain(diagramSvg);
  });

  it("rejects invalid or multiple-character identifiers before visualization lookup", async () => {
    const response = await GET(makeRequest("水日"), routeParams("水日"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "INVALID_KANJI" },
    });
    expect(renderStrokeOrderDiagram).not.toHaveBeenCalled();
  });

  it("reports a valid character with no usable local visual asset as unavailable", async () => {
    renderStrokeOrderDiagram.mockReturnValue(null);

    const response = await GET(makeRequest("𠀀"), routeParams("𠀀"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "STROKE_ORDER_UNAVAILABLE" },
    });
    expect(renderStrokeOrderDiagram).toHaveBeenCalledWith("𠀀");
  });

  it("returns a generic recoverable server error if rendering throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderStrokeOrderDiagram.mockImplementation(() => {
      throw new Error("private renderer detail");
    });

    try {
      const response = await GET(makeRequest(), routeParams("水"));
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body).toMatchObject({
        success: false,
        error: { code: "STROKE_ORDER_RENDER_FAILED" },
      });
      expect(JSON.stringify(body)).not.toContain("private renderer detail");
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
