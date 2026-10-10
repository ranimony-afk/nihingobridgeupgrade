import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.params,
}));

import DictionarySearchPage from "@/app/dictionary/page";

function renderPage(queryString: string): string {
  navigation.params = new URLSearchParams(queryString);
  return renderToStaticMarkup(createElement(DictionarySearchPage));
}

beforeEach(() => {
  navigation.push.mockReset();
  navigation.params = new URLSearchParams();
});

describe("dictionary page shareable search state", () => {
  it("initializes the search controls from canonical URL parameters", () => {
    const html = renderPage("q=water&level=N3&common=true");

    expect(html).toContain('value="water"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>N3<\/button>/);
    expect(html).toMatch(
      /<button[^>]*aria-label="Common words only"[^>]*aria-pressed="true"/
    );
  });

  it("does not activate a malformed JLPT level from the URL", () => {
    const html = renderPage("q=water&level=2024-07&common=TRUE");

    expect(html).toMatch(/aria-pressed="true"[^>]*>ALL<\/button>/);
    expect(html).not.toContain("2024-07");
    expect(html).toMatch(
      /<button[^>]*aria-label="Common words only"[^>]*aria-pressed="false"/
    );
  });
});
