# Headless CMS — Admin Dashboard Guide

Phase 1 of the roadmap makes every visible part of Nihongo Bridge (and
Ascend Academy) editable from the Admin Dashboard **without redesigning the
UI or changing existing routes**.

## Routes

| Route | Purpose |
| :--- | :--- |
| `/admin` | Brand workspace overview (sections, pages, unpublished counts). |
| `/admin/[brand]?page=home` | Section editor for a page (edit / status / reorder / duplicate). |
| `/admin/[brand]/preview?page=home` | Full-page preview including drafts & archived content (badged). |
| `/admin/[brand]/section/[id]/versions` | Version history timeline with one-click restore. |

## Editable content (Nihongo Bridge)

- Homepage hero · Featured courses · JLPT sections · Daily vocabulary ·
  Daily kanji · News section · Downloadable materials · Testimonials ·
  Contact information · Social links · CTA banners
- New CMS pages: `/nihongo/study-japan`, `/nihongo/jobs`, `/nihongo/conversation` —
  each composed of reusable sections (hero, feature grid, FAQ, downloads, CTA).
- Navigation, footer, SEO metadata via **brand settings** (shown on editor page).

## Reusable page sections

`SECTION_TYPES` in `src/shared/cms/index.ts` is the shared registry used by the
Admin Dashboard, the live brand pages, and the preview renderer:

`hero · about · featured_courses · jlpt · daily_vocab · daily_kanji · faculty ·
testimonials · news · faqs · downloads · contact · cta · social_links · practice`

The single renderer is `src/shared/components/CmsSection.tsx`; both live pages
and preview consume it — zero duplication.

## Lifecycle

`Draft → Preview → Published → Archived`
- Every save creates an immutable `content_versions` snapshot.
- `Restore` points any section back to any previous snapshot.
- `Duplicate` clones a section as a draft (`*-copy-*` key).
- `↑ / ↓` reorder swaps positions with the neighbor section.
- All actions are recorded in `audit_logs`.

## Backwards compatibility

- Existing brand routes and visual output are preserved.
- Live pages render only `published` sections (service-layer filter).
- The `/api/v1/cms/*` REST surface remains available for headless consumers.
