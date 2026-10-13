import { describe, expect, it, vi } from "vitest";

import {
  DICTIONARY_AUTOCOMPLETE_LIMIT,
  DictionaryAutocompleteRequestManager,
  buildDictionaryAutocompleteUrl,
  requestDictionaryAutocomplete,
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

const FIRE: DictionaryAutocompleteSuggestion = {
  id: "de-jmdict-1000020",
  headword: "火",
  reading: "ひ",
  romaji: "hi",
  jlptLevel: "N5",
  gloss: "fire",
};

function successResponse(suggestions: DictionaryAutocompleteSuggestion[]): Response {
  return new Response(JSON.stringify({ success: true, data: suggestions }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function asFetch(mock: ReturnType<typeof vi.fn>): typeof globalThis.fetch {
  return mock as unknown as typeof globalThis.fetch;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("dictionary autocomplete request lifecycle", () => {
  it("keeps the endpoint contract and six-result limit enforced", async () => {
    const suggestions = Array.from({ length: 8 }, (_, index) => ({
      ...WATER,
      id: `entry-${index}`,
      headword: `水${index}`,
    }));
    const fetchMock = vi.fn().mockResolvedValue(successResponse(suggestions));

    const outcome = await requestDictionaryAutocomplete("水 曜日", {
      fetchImpl: asFetch(fetchMock),
    });

    expect(DICTIONARY_AUTOCOMPLETE_LIMIT).toBe(6);
    expect(buildDictionaryAutocompleteUrl("水 曜日")).toBe(
      "/api/dictionary?q=%E6%B0%B4%20%E6%9B%9C%E6%97%A5&autocomplete=true&limit=6"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dictionary?q=%E6%B0%B4%20%E6%9B%9C%E6%97%A5&autocomplete=true&limit=6",
      expect.objectContaining({ signal: undefined })
    );
    expect(outcome).toEqual({ ok: true, suggestions: suggestions.slice(0, 6) });
  });

  it("an empty query aborts and invalidates outstanding work without another request", async () => {
    const olderResponse = deferred<Response>();
    const fetchMock = vi.fn().mockImplementation(() => olderResponse.promise);
    const manager = new DictionaryAutocompleteRequestManager(asFetch(fetchMock));

    const older = manager.search("water");
    const olderSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    const cleared = await manager.search("   ");

    expect(cleared).toEqual({
      isCurrent: true,
      outcome: { ok: true, suggestions: [] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(olderSignal.aborted).toBe(true);

    olderResponse.resolve(successResponse([WATER]));
    await expect(older).resolves.toEqual({
      isCurrent: false,
      outcome: { ok: true, suggestions: [WATER] },
    });
  });

  it("aborts superseded work and rejects an out-of-order older response", async () => {
    const olderResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockResolvedValueOnce(successResponse([FIRE]));
    const manager = new DictionaryAutocompleteRequestManager(asFetch(fetchMock));

    const older = manager.search("water");
    const newer = await manager.search("fire");
    const olderSignal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;

    olderResponse.resolve(successResponse([WATER]));
    const lateOlder = await older;

    expect(olderSignal.aborted).toBe(true);
    expect(newer).toEqual({
      isCurrent: true,
      outcome: { ok: true, suggestions: [FIRE] },
    });
    expect(lateOlder).toEqual({
      isCurrent: false,
      outcome: { ok: true, suggestions: [WATER] },
    });
  });

  it("explicit cancellation invalidates work dismissed by the UI or unmount", async () => {
    const pendingResponse = deferred<Response>();
    const fetchMock = vi.fn().mockImplementation(() => pendingResponse.promise);
    const manager = new DictionaryAutocompleteRequestManager(asFetch(fetchMock));

    const pending = manager.search("water");
    const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
    manager.cancel();

    expect(signal.aborted).toBe(true);

    pendingResponse.resolve(successResponse([WATER]));
    await expect(pending).resolves.toEqual({
      isCurrent: false,
      outcome: { ok: true, suggestions: [WATER] },
    });
  });

  it("returns a safe failure outcome without exposing request diagnostics", async () => {
    const outcome = await requestDictionaryAutocomplete("water", {
      fetchImpl: asFetch(
        vi.fn().mockRejectedValue(new Error("postgres://user:password@internal/database"))
      ),
    });

    expect(outcome).toEqual({ ok: false, reason: "network" });
    expect(JSON.stringify(outcome)).not.toContain("password");
    expect(JSON.stringify(outcome)).not.toContain("postgres://");
  });
});
