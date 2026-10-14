import { isKanjiRouteCharacter } from "@/lib/api/routeParams";
import { resolveDictionaryReturnHref } from "@/lib/dictionary/searchState";

/** Resolve one supplied search-return value using the dictionary's existing allowlist. */
export function resolveKanjiDictionaryReturnHref(
  returnToValues: readonly string[]
): string | null {
  if (returnToValues.length !== 1) {
    return null;
  }

  return resolveDictionaryReturnHref(returnToValues[0]);
}

/**
 * Build a same-origin Kanji Detail link using the route's single-character
 * identifier and its established URI-encoding convention. Invalid characters
 * never produce a destination.
 */
export function buildKanjiDetailHref(
  character: unknown,
  returnTo?: unknown
): string | null {
  if (!isKanjiRouteCharacter(character)) {
    return null;
  }

  const href = `/kanji/${encodeURIComponent(character)}`;
  if (returnTo === undefined) {
    return href;
  }

  const params = new URLSearchParams({
    returnTo: resolveDictionaryReturnHref(returnTo),
  });
  return `${href}?${params.toString()}`;
}
