import { SITE, absoluteImage, canonical, siteUrl } from "./config";

/**
 * Schema.org builders. Each returns a plain object that is serialised into a
 * `<script type="application/ld+json">` tag.
 *
 * Structured data must describe what is actually visible on the page — marking
 * up content the user cannot see is a manual-action risk, so every builder
 * takes its values from real records rather than invented defaults.
 */

export type JsonLd = Record<string, unknown>;

export function organizationLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE.name,
    url: canonical("/"),
    logo: { "@type": "ImageObject", url: absoluteImage(SITE.logo) },
    description: SITE.description,
    sameAs: [] as string[],
  };
}

/** WebSite + SearchAction enables the sitelinks search box in results. */
export function websiteLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE.name,
    alternateName: SITE.shortName,
    url: canonical("/"),
    description: SITE.description,
    publisher: { "@id": `${siteUrl()}/#organization` },
    inLanguage: "en",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${canonical("/search")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(trail: { name: string; path: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: canonical(crumb.path),
    })),
  };
}

export function articleLd(input: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  published: string | Date;
  modified?: string | Date;
  tags?: string[];
  wordCount?: number;
}): JsonLd {
  const url = canonical(input.path);
  const published = new Date(input.published).toISOString();
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.title.slice(0, 110), // Google ignores headlines over 110 chars
    description: input.description,
    image: [absoluteImage(input.image)],
    datePublished: published,
    dateModified: input.modified ? new Date(input.modified).toISOString() : published,
    author: { "@type": "Organization", name: SITE.name, url: canonical("/") },
    publisher: { "@id": `${siteUrl()}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "en",
    isAccessibleForFree: true,
    ...(input.tags?.length ? { keywords: input.tags.join(", ") } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
  };
}

/** Dictionary entries are DefinedTerm inside a DefinedTermSet. */
export function definedTermLd(input: {
  term: string;
  reading: string;
  definitions: string[];
  path: string;
  partOfSpeech?: string | null;
  jlpt?: string | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${canonical(input.path)}#term`,
    name: input.term,
    alternateName: input.reading,
    description: input.definitions.join("; "),
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: `${SITE.name} Japanese Dictionary`,
      url: canonical("/dictionary"),
    },
    url: canonical(input.path),
    inLanguage: "ja",
    ...(input.partOfSpeech ? { termCode: input.partOfSpeech } : {}),
    ...(input.jlpt ? { educationalLevel: input.jlpt } : {}),
  };
}

export function courseLd(input: {
  name: string;
  description: string;
  path: string;
  level?: string | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description,
    url: canonical(input.path),
    provider: { "@id": `${siteUrl()}/#organization` },
    inLanguage: "en",
    teaches: "Japanese language",
    ...(input.level ? { educationalLevel: input.level } : {}),
    // Required by Google's Course rich result since 2023.
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "online",
      courseWorkload: "PT30M",
    },
  };
}

export function learningResourceLd(input: {
  name: string;
  description: string;
  path: string;
  level?: string | null;
  type: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: input.name,
    description: input.description,
    url: canonical(input.path),
    learningResourceType: input.type,
    provider: { "@id": `${siteUrl()}/#organization` },
    isAccessibleForFree: true,
    inLanguage: "ja",
    ...(input.level ? { educationalLevel: input.level } : {}),
  };
}

export function faqLd(items: { question: string; answer: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * Serialises JSON-LD for injection into HTML.
 * `<` is escaped so a value containing `</script>` cannot break out of the tag.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
