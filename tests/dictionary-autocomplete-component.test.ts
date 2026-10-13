import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DictionaryAutocompleteOption,
  DictionaryAutocompleteView,
  type DictionaryAutocompleteViewProps,
} from "@/components/dictionary/DictionaryAutocomplete";
import {
  planDictionaryAutocompleteKey,
  type DictionaryAutocompleteSuggestion,
} from "@/lib/dictionary/autocomplete";

const WATER: DictionaryAutocompleteSuggestion = {
  id: "de-jmdict-1000010",
  headword: "水",
  reading: "みず",
  romaji: "mizu",
  jlptLevel: "N5",
  gloss: "water",
};

const WEDNESDAY: DictionaryAutocompleteSuggestion = {
  id: "entry/水曜日",
  headword: "水曜日",
  reading: "すいようび",
  romaji: "suiyoubi",
  jlptLevel: "N4",
  gloss: "Wednesday",
};

function renderView(overrides: Partial<DictionaryAutocompleteViewProps> = {}): string {
  const props: DictionaryAutocompleteViewProps = {
    query: "水",
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    listboxId: "dictionary-suggestions",
    popupOpen: true,
    status: "success",
    suggestions: [WATER, WEDNESDAY],
    activeIndex: 1,
    onInputFocus: vi.fn(),
    onInputKeyDown: vi.fn(),
    onSuggestionActive: vi.fn(),
    onSuggestionSelect: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(createElement(DictionaryAutocompleteView, props));
}

describe("DictionaryAutocomplete accessibility and interaction", () => {
  it("renders a controlled combobox with a labelled listbox and consistent active option", () => {
    const html = renderView();

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Search dictionary"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="dictionary-suggestions"');
    expect(html).toContain(
      'aria-activedescendant="dictionary-suggestions-option-1"'
    );
    expect(html).toContain('id="dictionary-suggestions"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Dictionary suggestions"');
    expect(html).toContain(
      'id="dictionary-suggestions-option-0" role="option" aria-selected="false"'
    );
    expect(html).toContain(
      'id="dictionary-suggestions-option-1" role="option" aria-selected="true"'
    );
    expect(html).toContain("水曜日");
    expect(html).toContain("すいようび");
    expect(html).toContain("Wednesday");
    expect(html).toContain('href="/dictionary/entry%2F%E6%B0%B4%E6%9B%9C%E6%97%A5"');
  });

  it("removes popup references when the rendered list is dismissed", () => {
    const html = renderView({ popupOpen: false });

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("aria-controls=");
    expect(html).not.toContain("aria-activedescendant=");
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
  });

  it("moves and wraps the active option with Arrow Down and Arrow Up", () => {
    const first = planDictionaryAutocompleteKey("ArrowDown", {
      isOpen: true,
      activeIndex: -1,
      suggestionCount: 2,
    });
    const second = planDictionaryAutocompleteKey("ArrowDown", {
      isOpen: true,
      activeIndex: first.nextActiveIndex ?? -1,
      suggestionCount: 2,
    });
    const wrapped = planDictionaryAutocompleteKey("ArrowDown", {
      isOpen: true,
      activeIndex: second.nextActiveIndex ?? -1,
      suggestionCount: 2,
    });
    const previous = planDictionaryAutocompleteKey("ArrowUp", {
      isOpen: true,
      activeIndex: wrapped.nextActiveIndex ?? -1,
      suggestionCount: 2,
    });

    expect(first).toEqual({ handled: true, nextActiveIndex: 0 });
    expect(second).toEqual({ handled: true, nextActiveIndex: 1 });
    expect(wrapped).toEqual({ handled: true, nextActiveIndex: 0 });
    expect(previous).toEqual({ handled: true, nextActiveIndex: 1 });
  });

  it("selects only the active rendered suggestion on Enter", () => {
    expect(
      planDictionaryAutocompleteKey("Enter", {
        isOpen: true,
        activeIndex: 1,
        suggestionCount: 2,
      })
    ).toEqual({ handled: true, selectedIndex: 1 });

    expect(
      planDictionaryAutocompleteKey("Enter", {
        isOpen: true,
        activeIndex: -1,
        suggestionCount: 2,
      })
    ).toEqual({ handled: false });
  });

  it("dismisses an open suggestion list on Escape", () => {
    expect(
      planDictionaryAutocompleteKey("Escape", {
        isOpen: true,
        activeIndex: 0,
        suggestionCount: 2,
      })
    ).toEqual({ handled: true, shouldDismiss: true });
  });

  it("supports pointer activation and native link selection for mouse and touch", () => {
    const onActive = vi.fn();
    const onSelect = vi.fn();
    const option = DictionaryAutocompleteOption({
      suggestion: WEDNESDAY,
      index: 1,
      listboxId: "dictionary-suggestions",
      active: false,
      onActive,
      onSelect,
    }) as ReactElement<{
      href: string;
      onPointerDown: () => void;
      onClick: () => void;
    }>;

    option.props.onPointerDown();
    option.props.onClick();

    expect(option.props.href).toBe("/dictionary/entry%2F%E6%B0%B4%E6%9B%9C%E6%97%A5");
    expect(onActive).toHaveBeenCalledWith(1);
    expect(onSelect).toHaveBeenCalledWith(WEDNESDAY);
  });

  it("announces loading, empty, and safe recoverable failure states locally", () => {
    const loading = renderView({ status: "loading", suggestions: [], activeIndex: -1 });
    const empty = renderView({ status: "success", suggestions: [], activeIndex: -1 });
    const failed = renderView({ status: "error", suggestions: [], activeIndex: -1 });

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain("Loading suggestions…");
    expect(empty).toContain("No dictionary suggestions found.");
    expect(failed).toContain("Suggestions are temporarily unavailable");
    expect(failed).toContain("Edit your search to try again");
    expect(failed).not.toContain("stack");
    expect(failed).not.toContain("postgres://");
  });
});
