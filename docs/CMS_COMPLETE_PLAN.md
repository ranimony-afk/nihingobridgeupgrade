# Enterprise Headless CMS Completion - Implementation Plan

**Version:** 4.2.0  
**Status:** PROPOSED & READY FOR INTEGRATION  

---

## 1. Executive Summary

This plan outlines the conversion of all remaining static, hardcoded frontend elements in the Nihongo Bridge platform into fully CMS-managed content. Under this model, administrators will be able to manage the entirety of the platform (from general homepage text and custom sub-pages like Privacy Policies to utility pages like Maintenance banners and custom 404 pages) directly through the relational PostgreSQL database via the Headless CMS Admin Workspace.

---

## 2. Core Enhancements & Schema Utilization

All content is managed through the existing normalized database tables:
- `content_sections`: Handles the individual sections (e.g., `hero`, `announcement_bar`, `about`, `privacy_policy`, `maintenance`).
- `pages`: Dynamic routing lookup entries.
- `brand_settings`: Dynamic group settings for `navigation` (Mega Menu quick-links) and `footer` (copyright and taglines).

### 2.1 Dynamic Layout Coverage in `CmsSection.tsx`
We will expand the section visual parser in `src/shared/components/CmsSection.tsx` to explicitly style and render the following components from JSONB content:
1. **`hero`**: Prominent title and subtitle layout with dynamic call-to-action (CTA) button arrays and highlight badges.
2. **`about` / `vision` / `mission` / `founder` / `admissions`**: Two-column responsive blocks supporting custom media assets, body paragraphs, and action links.
3. **`statistics` / `achievements`**: Grids of numerical statistics and milestones rendered in large, bold accented fonts.
4. **`gallery`**: Image showcase grids with hover zoom overlays and description captions.
5. **`social_links`**: Interactive rows of social media badges with custom category icons and URLs.
6. **`contact` / `privacy_policy` / `terms_of_service` / `cookie_policy`**: Clean readable layouts with inline support cards.
7. **`not_found`**: Standardized custom 404 placeholder with "Go Back Home" redirects.
8. **`maintenance`**: Full-page dark system upgrade alert with estimated restoral clocks.

---

## 3. Dynamic Page Routing Upgrade

To support the creation and rendering of custom sub-pages (e.g. `/nihongo/privacy` or `/nihongo/about`):
1. **Dynamic Catch-All Route (`src/app/[brand]/[slug]/page.tsx`)**:
   We will create a dynamic route loader under `[brand]/[slug]`. It will dynamically query the `pages` table for the matching slug (e.g., `privacy_policy`, `about`) and render its constituent CMS sections.
2. **Backwards Compatibility**:
   Static routes (like `/nihongo/jobs` or `/nihongo/study-japan`) are handled by Next.js file-system routing priority first. Any unregistered sub-paths fall back to the dynamic CMS catch-all page, which queries PostgreSQL, or raises a custom CMS-driven 404 if the page doesn't exist.

---

## 4. Execution Plan (Step-by-Step)

### Step 1: Update `CmsSection.tsx` with Dynamic Layout Renderers
Add the custom layout render blocks for the extended 22+ sections inside `src/shared/components/CmsSection.tsx`.

### Step 2: Establish Dynamic Catch-All Route `src/app/[brand]/[slug]/page.tsx`
Write the Next.js Server Component to fetch the localized page and render its CMS sections dynamically.

### Step 3: Remove Double-Rendering of Hero in `src/app/[brand]/page.tsx`
Clean up the hardcoded hero block and allow the top section to be completely driven by the database-managed `hero` section of the CMS pages array.

### Step 4: Run Seeding & Build Checks
Execute the idempotent seed command to initialize the new custom sub-pages (e.g. `privacy_policy`, `terms_of_service`, `maintenance`) in the database, and verify the build passes.
