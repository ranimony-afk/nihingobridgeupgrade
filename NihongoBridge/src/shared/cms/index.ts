/**
 * Shared Headless CMS Page, Section Registry & Metadata Helpers
 */

export interface PageContent {
  id: number;
  brandId: number;
  slug: string;
  title: string;
  body: string;
  status: string;
  locale: string;
  publishedAt: Date | null;
}

export function buildPageSeo(page: { title: string; body: string }, brandName: string) {
  const snippet = page.body.slice(0, 160).replace(/\s+/g, " ").trim();
  return {
    title: `${page.title} | ${brandName}`,
    description: snippet || `Learn more with ${brandName}`,
  };
}

/* ------------------------------------------------------------------ */
/* Reusable Page Section Type Registry (22 Full Homepage Sections)    */
/* ------------------------------------------------------------------ */

export type CmsSectionKind =
  | "announcement"
  | "hero"
  | "countdown"
  | "feature_grid"
  | "learning_paths"
  | "vocabulary"
  | "kanji"
  | "news"
  | "cards"
  | "download"
  | "testimonial"
  | "events"
  | "spotlight"
  | "newsletter"
  | "logos"
  | "faq"
  | "cta"
  | "footer"
  | "generic";

export interface CmsSectionTypeDef {
  key: string;
  label: string;
  kind: CmsSectionKind;
  description: string;
}

export const SECTION_TYPES: CmsSectionTypeDef[] = [
  { key: "announcement_bar", label: "Announcement Bar", kind: "announcement", description: "Top notification alert with badge and link." },
  { key: "hero", label: "Hero", kind: "hero", description: "Page hero with badge, heading, subtitle and CTA buttons." },
  { key: "jlpt_countdown", label: "JLPT Countdown", kind: "countdown", description: "Live exam countdown clock and registration timeline." },
  { key: "featured_courses", label: "Featured Courses", kind: "feature_grid", description: "Grid of featured courses and tracks." },
  { key: "learning_paths", label: "Learning Paths", kind: "learning_paths", description: "N5 to N1 career & conversational mastery paths." },
  { key: "daily_vocab", label: "Daily Vocabulary", kind: "vocabulary", description: "Rotating daily vocabulary cards." },
  { key: "daily_kanji", label: "Today's Kanji", kind: "kanji", description: "Rotating daily kanji with stroke order and radicals." },
  { key: "news", label: "Japanese News", kind: "news", description: "Daily TODAI-style news feed with furigana." },
  { key: "popular_articles", label: "Popular Articles", kind: "cards", description: "High-engagement guides and cultural articles." },
  { key: "practice_tests", label: "Practice Tests", kind: "cards", description: "Timed JLPT simulator practice exams." },
  { key: "downloads", label: "Download Center", kind: "download", description: "PDFs, workbooks, and resource downloads." },
  { key: "study_japan", label: "Study in Japan", kind: "cards", description: "School directory, scholarship, and student visa portal." },
  { key: "success_stories", label: "Success Stories", kind: "cards", description: "Graduate career and JLPT pass achievements." },
  { key: "testimonials", label: "Testimonials", kind: "testimonial", description: "Learner quotes with attribution." },
  { key: "upcoming_events", label: "Upcoming Events", kind: "events", description: "Live webinars, JLPT workshops, and speaking clubs." },
  { key: "teacher_spotlight", label: "Teacher Spotlight", kind: "spotlight", description: "Native instructor profiles, credentials, and bios." },
  { key: "recent_blog", label: "Recent Blog", kind: "cards", description: "Editorial learning tips and grammatical deep-dives." },
  { key: "latest_resources", label: "Latest Resources", kind: "cards", description: "Cheat sheets, vocabulary decks, and podcasts." },
  { key: "newsletter", label: "Newsletter", kind: "newsletter", description: "Email subscription for daily Japanese lessons." },
  { key: "partner_logos", label: "Partner Logos", kind: "logos", description: "Accredited language schools and corporate partners." },
  { key: "faqs", label: "FAQ", kind: "faq", description: "Question & answer accordion items." },
  { key: "footer", label: "Footer", kind: "footer", description: "Brand copyright, legal links, and social links." },

  // Preserved backwards-compatible keys
  { key: "about", label: "About / Intro", kind: "generic", description: "Intro body copy with stats." },
  { key: "jlpt", label: "JLPT Levels", kind: "feature_grid", description: "JLPT N5–N1 level cards." },
  { key: "faculty", label: "Faculty", kind: "spotlight", description: "Instructor directory." },
  { key: "contact", label: "Contact Information", kind: "generic", description: "Email and phone contact." },
  { key: "cta", label: "Call-to-Action", kind: "cta", description: "Conversion banner." },
  { key: "social_links", label: "Social Links", kind: "generic", description: "Social media links." },
  { key: "practice", label: "Conversation Practice", kind: "generic", description: "Dialogue scripts." },
];

export const SECTION_TYPE_KIND: Record<string, CmsSectionKind> = Object.fromEntries(
  SECTION_TYPES.map((s) => [s.key, s.kind]),
) as Record<string, CmsSectionKind>;

export function sectionKindFor(key: string): CmsSectionKind {
  return SECTION_TYPE_KIND[key] ?? "generic";
}

/** Workflow statuses supported by the CMS editor. */
export const CMS_STATUSES = ["draft", "preview", "published", "archived"] as const;
export type CmsStatus = (typeof CMS_STATUSES)[number];

export function isCmsStatus(v: unknown): v is CmsStatus {
  return typeof v === "string" && (CMS_STATUSES as readonly string[]).includes(v);
}
