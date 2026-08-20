import { unstable_cache } from "next/cache";

/**
 * Caching helpers.
 *
 * Two layers are in play:
 *  - `unstable_cache` for server-side data, keyed and tag-invalidated.
 *  - `Cache-Control` headers for responses a CDN can hold.
 *
 * Anything personalised (learner XP, hearts, billing) must never be cached at
 * the CDN, or one user's data would be served to another.
 */

export const CACHE_TAGS = {
  dictionary: "dictionary",
  kanji: "kanji",
  grammar: "grammar",
  posts: "posts",
  search: "search",
} as const;

/** Revalidation windows, in seconds. */
export const REVALIDATE = {
  /** Reference content changes only when an admin imports. */
  reference: 60 * 60,
  /** Blog index and posts. */
  content: 60 * 15,
  /** Marketing pages. */
  marketing: 60 * 30,
} as const;

/** Wraps an async loader in the Next.js data cache. */
export function cached<Args extends unknown[], Result>(
  loader: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate?: number; tags?: string[] } = {},
) {
  return unstable_cache(loader, keyParts, {
    revalidate: options.revalidate ?? REVALIDATE.reference,
    tags: options.tags,
  });
}

/**
 * Cache-Control for public, non-personalised responses.
 * `stale-while-revalidate` lets a CDN serve the old copy while refreshing,
 * so a cache miss never blocks the user.
 */
export function publicCacheHeaders(maxAge = 300, swr = 3600) {
  return {
    "Cache-Control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${swr}`,
  };
}

/** Explicitly prevents any shared cache from storing a personalised response. */
export function privateCacheHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
