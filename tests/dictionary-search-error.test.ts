import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DictionarySearchError } from "@/components/dictionary/DictionarySearchError";

describe("DictionarySearchError", () => {
  it("renders an accessible, generic explanation and visible retry action", () => {
    const html = renderToStaticMarkup(
      createElement(DictionarySearchError, { onRetry: vi.fn() })
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("Dictionary search is temporarily unavailable");
    expect(html).toContain("Check your connection and try again");
    expect(html).toMatch(/<button[^>]*>[\s\S]*Retry<\/button>/);
  });

  it("has no channel for raw server diagnostics", () => {
    const html = renderToStaticMarkup(
      createElement(DictionarySearchError, { onRetry: vi.fn() })
    );

    expect(html).not.toContain("stack");
    expect(html).not.toContain("postgres://");
    expect(html).not.toContain("INTERNAL_ERROR");
  });
});
