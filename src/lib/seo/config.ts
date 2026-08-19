/** Single source of truth for canonical URLs and site-wide SEO defaults. */

export const SITE = {
  name: "Nihongo Bridge",
  shortName: "NihongoBridge",
  tagline: "Learn Japanese like play",
  description:
    "Learn Japanese with a Duolingo-style lesson path, a JMdict-scale dictionary, a kanji mind map, a grammar engine, and an AI conversation tutor.",
  locale: "en_US",
  twitter: "@nihongobridge",
  logo: "/images/mochi.png",
  defaultImage: "/images/mochi-wave.png",
} as const;

export function siteUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/**
 * Builds an absolute canonical URL.
 *
 * Canonicals must be byte-identical across pages that render the same content,
 * otherwise crawlers treat `/blog/x`, `/blog/x/` and `/blog/x?utm=1` as three
 * competing URLs and split ranking signals between them.
 */
export function canonical(path = "/") {
  const base = siteUrl();
  if (!path || path === "/") return `${base}/`;

  // Drop query strings and fragments — tracking params must never canonicalise.
  const clean = path.split("#")[0]!.split("?")[0]!;
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  // No trailing slash except on the root, so there is exactly one spelling.
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  return `${base}${trimmed}`;
}

export function absoluteImage(src?: string | null) {
  if (!src) return `${siteUrl()}${SITE.defaultImage}`;
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  return `${siteUrl()}${src.startsWith("/") ? src : `/${src}`}`;
}

/** Paths that must never be indexed or appear in the sitemap. */
export const PRIVATE_PREFIXES = [
  "/admin",
  "/api",
  "/account",
  "/billing",
  "/login",
  "/register",
  "/reset-password",
  "/forgot-password",
  "/verify-email",
  "/onboarding",
] as const;

export function isPrivatePath(path: string) {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Public routes worth crawling, with crawl hints. */
export const PUBLIC_ROUTES: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/learn", changeFrequency: "weekly", priority: 0.9 },
  { path: "/dictionary", changeFrequency: "daily", priority: 0.9 },
  { path: "/kanji", changeFrequency: "weekly", priority: 0.8 },
  { path: "/kanji/explore", changeFrequency: "weekly", priority: 0.7 },
  { path: "/grammar", changeFrequency: "weekly", priority: 0.8 },
  { path: "/conversation", changeFrequency: "monthly", priority: 0.6 },
  { path: "/stories", changeFrequency: "weekly", priority: 0.7 },
  { path: "/kana", changeFrequency: "monthly", priority: 0.6 },
  { path: "/search", changeFrequency: "weekly", priority: 0.5 },
  { path: "/blog", changeFrequency: "daily", priority: 0.8 },
];
