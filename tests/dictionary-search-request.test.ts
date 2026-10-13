import { describe, expect, it, vi } from "vitest";

import {
  DictionarySearchRequestManager,
  buildDictionarySearchRequestUrl,
  requestDictionarySearch,
  type DictionarySearchEntry,
} from "@/lib/dictionary/searchRequest";
import type { DictionarySearchState } from "@/lib/dictionary/searchState";

const WATER: DictionarySearchEntry = {
  id: "de-jmdict-1000010",
  headword: "水",
  reading: "みず",
  romaji: "mizu",
  jlptLevel: "N5",
  isCommon: true,
  partsOfSpeech: ["noun"],
  senses: [{ glosses: ["water"] }],
  tags: ["common"],
};

const FIRE: DictionarySearchEntry = {
  ...WATER,
  id: "de-jmdict-1000020",
  headword: "火",
  reading: "ひ",
  romaji: "hi",
  senses: [{ glosses: ["fire"] }],
};

const SEARCH: DictionarySearchState = {
  query: "water",
  level: "N5",
  commonOnly: true,
};

function successResponse(entries: DictionarySearchEntry[], total = entries.length): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: { entries, total, limit: 40, offset: 0 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
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

describe("dictionary search request lifecycle", () => {
  it("returns a validated successful search with results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse([WATER], 1));
    const manager = new DictionarySearchRequestManager(asFetch(fetchMock));

    const completion = await manager.search(SEARCH);

    expect(completion).toEqual({
      isCurrent: true,
      outcome: { ok: true, entries: [WATER], total: 1 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dictionary?q=water&level=N5&common=true&limit=40",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("keeps a successful zero-result search distinct from failure", async () => {
    const outcome = await requestDictionarySearch(SEARCH, {
      fetchImpl: asFetch(vi.fn().mockResolvedValue(successResponse([], 0))),
    });

    expect(outcome).toEqual({ ok: true, entries: [], total: 0 });
  });

  it("maps a network rejection to a safe failure without diagnostic text", async () => {
    const outcome = await requestDictionarySearch(SEARCH, {
      fetchImpl: asFetch(
        vi.fn().mockRejectedValue(new Error("postgres://user:password@internal/database"))
      ),
    });

    expect(outcome).toEqual({ ok: false, reason: "network" });
    expect(JSON.stringify(outcome)).not.toContain("password");
  });

  it("rejects a non-success HTTP response without parsing or exposing its body", async () => {
    const response = new Response(
      JSON.stringify({ error: "SQL constraint and secret connection details" }),
      { status: 503 }
    );
    const jsonSpy = vi.spyOn(response, "json");

    const outcome = await requestDictionarySearch(SEARCH, {
      fetchImpl: asFetch(vi.fn().mockResolvedValue(response)),
    });

    expect(outcome).toEqual({ ok: false, reason: "http" });
    expect(jsonSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(outcome)).not.toContain("constraint");
  });

  it("rejects invalid JSON and malformed success payloads", async () => {
    const responses = [
      new Response("not-json", { status: 200 }),
      new Response(JSON.stringify({ success: true, data: { entries: "invalid", total: 0 } })),
      new Response(JSON.stringify({ success: true, data: { entries: [null], total: 1 } })),
      new Response(JSON.stringify({ success: true, data: { entries: [], total: -1 } })),
    ];

    for (const response of responses) {
      const outcome = await requestDictionarySearch(SEARCH, {
        fetchImpl: asFetch(vi.fn().mockResolvedValue(response)),
      });
      expect(outcome).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("allows an explicit retry to succeed after a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(successResponse([WATER], 1));
    const manager = new DictionarySearchRequestManager(asFetch(fetchMock));

    const failed = await manager.search(SEARCH);
    const retried = await manager.search(SEARCH);

    expect(failed).toEqual({
      isCurrent: true,
      outcome: { ok: false, reason: "network" },
    });
    expect(retried).toEqual({
      isCurrent: true,
      outcome: { ok: true, entries: [WATER], total: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries the same committed query and active filters", async () => {
    const committed: DictionarySearchState = {
      query: " 水曜日 ",
      level: "N2",
      commonOnly: true,
    };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(successResponse([], 0));
    const manager = new DictionarySearchRequestManager(asFetch(fetchMock));

    await manager.search(committed);
    await manager.search(committed);

    const expectedUrl =
      "/api/dictionary?q=%E6%B0%B4%E6%9B%9C%E6%97%A5&level=N2&common=true&limit=40";
    expect(buildDictionarySearchRequestUrl(committed)).toBe(expectedUrl);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([expectedUrl, expectedUrl]);
  });

  it("marks a late successful result stale after a newer request fails", async () => {
    const olderResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const manager = new DictionarySearchRequestManager(asFetch(fetchMock));

    const older = manager.search({ ...SEARCH, query: "water" });
    const newer = await manager.search({ ...SEARCH, query: "fire" });
    olderResponse.resolve(successResponse([WATER], 1));
    const lateOlder = await older;

    expect(newer).toEqual({
      isCurrent: true,
      outcome: { ok: false, reason: "http" },
    });
    expect(lateOlder).toEqual({
      isCurrent: false,
      outcome: { ok: true, entries: [WATER], total: 1 },
    });
    expect((fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal).aborted).toBe(true);
  });

  it("marks a late rejection aborted and stale after a newer request succeeds", async () => {
    const olderResponse = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => olderResponse.promise)
      .mockResolvedValueOnce(successResponse([FIRE], 1));
    const manager = new DictionarySearchRequestManager(asFetch(fetchMock));

    const older = manager.search({ ...SEARCH, query: "water" });
    const newer = await manager.search({ ...SEARCH, query: "fire" });
    olderResponse.reject(new Error("late private diagnostic"));
    const lateOlder = await older;

    expect(newer).toEqual({
      isCurrent: true,
      outcome: { ok: true, entries: [FIRE], total: 1 },
    });
    expect(lateOlder).toEqual({
      isCurrent: false,
      outcome: { ok: false, reason: "aborted" },
    });
  });
});
