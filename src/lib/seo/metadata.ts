import type { Metadata } from "next";
import { SITE, absoluteImage, canonical } from "./config";

export type SeoInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  type?: "website" | "article";
  publishedTime?: string | Date;
  modifiedTime?: string | Date;
  tags?: string[];
  noindex?: boolean;
};

function iso(value?: string | Date) {
  if (!value) return undefined;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Titles over ~60 chars get truncated in results, so brand only when it fits. */
export function pageTitle(title: string) {
  const suffix = ` | ${SITE.name}`;
  if (!title) return SITE.name;
  if (title.includes(SITE.name)) return title;
  return title.length + suffix.length <= 60 ? `${title}${suffix}` : title;
}

/** Meta descriptions are truncated around 160 characters. */
export function clampDescription(description: string, max = 160) {
  const clean = description.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Builds Next.js metadata with a canonical URL, OpenGraph, Twitter cards, and
 * the crawler directives Google Discover requires.
 *
 * `max-image-preview:large` is the one that matters for Discover — without it
 * Google will not surface the page as an image card, which is the entire
 * surface. It is set even on noindex pages, where it is simply ignored.
 */
export function buildMetadata(input: SeoInput): Metadata {
  const url = canonical(input.path);
  const image = absoluteImage(input.image);
  const description = clampDescription(input.description);
  const title = pageTitle(input.title);

  return {
    metadataBase: new URL(canonical("/")),
    title,
    description,
    alternates: { canonical: url },
    keywords: input.tags,
    robots: input.noindex
      ? { index: false, follow: true, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    openGraph: {
      type: input.type ?? "website",
      siteName: SITE.name,
      locale: SITE.locale,
      url,
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
      ...(input.type === "article"
        ? {
            publishedTime: iso(input.publishedTime),
            modifiedTime: iso(input.modifiedTime) ?? iso(input.publishedTime),
            tags: input.tags,
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: SITE.twitter,
      title,
      description,
      images: [image],
    },
  };
}
