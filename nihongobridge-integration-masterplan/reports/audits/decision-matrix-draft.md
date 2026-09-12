# INTEGRATION DECISION MATRIX — Draft v1

**Date:** 2025-07-16
**Phase:** Phase 00 — Discovery & Audit
**Status:** DRAFT — Will be finalized when Repository B is inspected

---

## Classification Legend

| Classification | Definition | Action Required |
|---|---|---|
| **KEEP** | Preserve exactly as-is | None — do not modify |
| **MODIFY** | Change carefully, preserving intent | Document changes, test before/after |
| **MERGE** | Combine implementations from both repos | Design merged version, test thoroughly |
| **MOVE** | Relocate to different path/module | Update imports, verify no broken refs |
| **DEPRECATE** | Phase out gradually | Add deprecation notice, provide replacement |
| **REPLACE** | Swap with new implementation | Ensure feature parity, test replacement |
| **ARCHIVE** | Store for reference, remove from production | Move to archive, document reason |
| **EVALUATE** | Cannot classify yet — needs inspection | Inspect when available, then classify |
| **CREATE** | Does not exist yet — must be built | Design, implement, test |

---

## Section 1: Repository A Components (Inspected)

### Infrastructure — KEEP

These components form the stable foundation. Do not change unless a specific phase requires it.

| Component | File Path | Classification | Confidence | Risk | Rationale |
|---|---|---|---|---|---|
| Database connection | `src/db/index.ts` | **KEEP** | HIGH | NONE | Correct singleton pool pattern, Drizzle configured properly |
| Health check API | `src/app/api/health/route.ts` | **KEEP** | HIGH | NONE | Standard health check — required by infrastructure |
| TypeScript config | `tsconfig.json` | **KEEP** | HIGH | NONE | Strict mode, path aliases, Next.js plugin — all correct |
| Drizzle config | `drizzle.config.json` | **KEEP** | HIGH | NONE | Points to correct schema path and DB URL |
| ESLint config | `eslint.config.mjs` | **KEEP** | HIGH | NONE | Modern flat config with Next.js rules |
| PostCSS config | `postcss.config.mjs` | **KEEP** | HIGH | NONE | Standard Tailwind v4 setup |
| Next.js env types | `next-env.d.ts` | **KEEP** | HIGH | NONE | Auto-managed by Next.js |

### Infrastructure — MODIFY

These components need extension as features are added.

| Component | File Path | Classification | Confidence | Risk | Rationale |
|---|---|---|---|---|---|
| Database schema | `src/db/schema.ts` | **MODIFY** | HIGH | LOW | Empty placeholder — will be populated with full domain model in Phase 01 |
| Root layout | `src/app/layout.tsx` | **MODIFY** | HIGH | LOW | Update metadata, add providers (auth, theme) as needed |
| Global styles | `src/app/globals.css` | **MODIFY** | HIGH | LOW | Add NihongoBridge design tokens, keep Tailwind base |
| Next.js config | `next.config.ts` | **MODIFY** | HIGH | LOW | Add config as features require (images, redirects, etc.) |
| Environment vars | `.env` | **MODIFY** | HIGH | LOW | Add auth, AI, and service-specific variables |
| Package manifest | `package.json` | **MODIFY** | HIGH | LOW | New dependencies will be added per phase |

### Control Tower — ARCHIVE

These components serve the integration dashboard. They are not production application code and should be archived when the real application UI is built.

| Component | File Path | Classification | Confidence | Risk | Rationale |
|---|---|---|---|---|---|
| Dashboard home | `src/app/page.tsx` | **REPLACE** | HIGH | NONE | Control tower UI — will become NihongoBridge home page |
| Masterplan API | `src/app/api/masterplan/route.ts` | **ARCHIVE** | HIGH | NONE | Reads masterplan files from disk — not production functionality |
| Docs index | `src/app/docs/page.tsx` | **ARCHIVE** | HIGH | NONE | Masterplan document listing — not production functionality |
| Doc viewer | `src/app/docs/[slug]/page.tsx` | **ARCHIVE** | HIGH | NONE | Masterplan document reader — not production functionality |

---

## Section 2: Repository B Components (Not Yet Inspected)

All Repository B components are classified as **EVALUATE** until direct inspection is possible. Below is the expected classification based on the master integration instruction.

### Knowledge Data — Expected: MERGE or MOVE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| JMdict dictionary data | `[knowledge]/dictionary/` | **MOVE** → Repo A ETL pipeline | Phase 02 | Core knowledge asset — import with provenance |
| KANJIDIC2 kanji data | `[knowledge]/kanji/` | **MOVE** → Repo A ETL pipeline | Phase 02 | Core knowledge asset — import with provenance |
| Radical data | `[knowledge]/radicals/` | **MOVE** → Repo A ETL pipeline | Phase 02 | Supplementary knowledge — import with provenance |
| Grammar points | `[knowledge]/grammar/` | **MOVE** → Repo A ETL pipeline | Phase 02 | Knowledge asset — may need editorial review |
| Example sentences | `[knowledge]/sentences/` | **MOVE** → Repo A ETL pipeline | Phase 02 | Knowledge asset — check source licensing |

### ETL Scripts — Expected: MERGE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Dictionary parser | `[etl]/jmdict/` | **MERGE** | Phase 02 | Evaluate parser quality, adapt to Drizzle schema |
| Kanji parser | `[etl]/kanjidic/` | **MERGE** | Phase 02 | Evaluate parser quality, adapt to Drizzle schema |
| Import scripts | `[etl]/import/` | **MERGE** | Phase 02 | Evaluate for idempotency and provenance tracking |

### Authentication — Expected: DEPRECATE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Auth provider | `[auth]/` | **DEPRECATE** | Phase 01 | Repo A auth is authoritative (DEC-0003) — but since Repo A has no auth, evaluate Repo B auth as *potential foundation* |
| User model | `[auth]/user/` | **EVALUATE** | Phase 01 | May inform Repo A user schema design |
| Session management | `[auth]/session/` | **EVALUATE** | Phase 01 | May inform Repo A session design |

**⚠️ Special Note on Auth:** The master instruction says Repo A auth is authoritative, but Repo A has no auth. This creates a nuanced situation:
- If Repo B auth is well-designed and compatible with Next.js App Router, it may be *adopted as* Repo A auth
- If Repo B auth is tightly coupled to a different framework, build fresh in Repo A
- Decision DEC-0005 will resolve this

### UI Components — Expected: EVALUATE → MERGE or REPLACE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Dictionary UI | `[ui]/dictionary/` | **EVALUATE** | Phase 03-04 | Evaluate quality, adapt to Repo A Tailwind stack |
| Kanji browser | `[ui]/kanji/` | **EVALUATE** | Phase 03-04 | Evaluate quality, adapt to Repo A Tailwind stack |
| Learning UI | `[ui]/learning/` | **EVALUATE** | Phase 04 | Evaluate course/lesson/quiz components |
| SRS UI | `[ui]/srs/` | **EVALUATE** | Phase 05 | Evaluate review session components |
| AI chat UI | `[ui]/ai/` | **EVALUATE** | Phase 06 | Evaluate chat interface |
| Admin UI | `[ui]/admin/` | **EVALUATE** | Phase 04+ | Evaluate admin dashboard |

### Database Schema — Expected: EVALUATE → MERGE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Schema definitions | `[db]/schema/` | **EVALUATE** | Phase 01 | Compare with DOMAIN_MODEL.md, adapt to Drizzle |
| Migrations | `[db]/migrations/` | **EVALUATE** | Phase 01 | Reference only — do not apply directly |

### Mobile — Expected: EVALUATE → MODIFY

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Flutter project | `[mobile]/flutter/` | **EVALUATE** | Phase 08 | Full mobile client — evaluate architecture |
| Flutter auth | `[mobile]/flutter/auth/` | **EVALUATE** | Phase 08 | Must use Repo A auth |
| Flutter API client | `[mobile]/flutter/api/` | **EVALUATE** | Phase 08 | Must point to Repo A API |
| Offline cache | `[mobile]/flutter/offline/` | **EVALUATE** | Phase 08 | Evaluate sync strategy |

### Tests — Expected: EVALUATE → MERGE

| Component | Expected Path Pattern | Expected Classification | Priority | Rationale |
|---|---|---|---|---|
| Test suites | `[tests]/` | **EVALUATE** | All phases | Valuable for coverage — adapt test framework |
| Test fixtures | `[tests]/fixtures/` | **EVALUATE** | All phases | Sample data for testing |

---

## Section 3: Components That Must Be Created (Neither Repo)

These components do not exist in either repository and must be built from scratch:

| Component | Target Path | Phase | Priority | Dependencies |
|---|---|---|---|---|
| Auth middleware | `src/middleware.ts` | Phase 01 | HIGH | Auth provider decision (DEC-0005) |
| Auth API routes | `src/app/api/auth/` | Phase 01 | HIGH | Auth provider |
| Domain services layer | `src/services/` | Phase 01+ | HIGH | Schema |
| Knowledge service | `src/services/knowledge/` | Phase 02 | HIGH | Schema, ETL |
| Search service | `src/services/search/` | Phase 03 | HIGH | Knowledge data |
| Learning service | `src/services/learning/` | Phase 04 | HIGH | Schema |
| SRS service | `src/services/srs/` | Phase 05 | HIGH | Schema, FSRS/SM-2 |
| AI service | `src/services/ai/` | Phase 06 | MEDIUM | Search, knowledge |
| Gamification service | `src/services/gamification/` | Phase 07 | MEDIUM | Learning, SRS |
| ETL pipeline runner | `etl/` | Phase 02 | HIGH | Schema |
| Test infrastructure | `tests/` or `__tests__/` | Phase 01 | HIGH | Test framework |
| API v2 routes | `src/app/api/v2/` | Phase 02+ | HIGH | Services |
| Admin routes | `src/app/api/admin/` | Phase 04+ | MEDIUM | Auth, RBAC |
| AI routes | `src/app/api/ai/` | Phase 06 | MEDIUM | AI service |
| Shared components | `src/components/` | Phase 01+ | MEDIUM | Design system |
| Shared types | `src/types/` | Phase 01 | HIGH | Domain model |
| Shared utilities | `src/lib/` | Phase 01 | MEDIUM | None |

---

## Section 4: Decision Requirements

The following decisions must be made before or during Phase 01:

| Decision ID | Title | Blocking Phase | Options |
|---|---|---|---|
| DEC-0005 | Auth implementation strategy | Phase 01 | NextAuth.js / Lucia / Custom / Repo B auth |
| DEC-0006 | Test framework selection | Phase 01 | Vitest / Jest / Playwright |
| DEC-0007 | Component library strategy | Phase 01 | Headless (Radix) / shadcn/ui / Custom |
| DEC-0008 | State management (client) | Phase 01 | React Server Components / Zustand / None |
| DEC-0009 | AI provider selection | Phase 06 | OpenAI / Anthropic / Both |
| DEC-0010 | SRS algorithm selection | Phase 05 | FSRS primary + SM-2 fallback / FSRS only |

---

## Section 5: Summary Statistics

### By Classification

| Classification | Repo A Count | Repo B Count (Expected) | To Create |
|---|---|---|---|
| KEEP | 7 | 0 | 0 |
| MODIFY | 6 | 0 | 0 |
| REPLACE | 1 | 0 | 0 |
| ARCHIVE | 3 | 0 | 0 |
| EVALUATE | 0 | 25+ | 0 |
| CREATE | 0 | 0 | 16+ |
| DEPRECATE | 0 | 1-3 | 0 |
| MERGE | 0 | 5-10 | 0 |
| MOVE | 0 | 5-8 | 0 |

### By Risk Level

| Risk Level | Count |
|---|---|
| NONE | 8 |
| LOW | 6 |
| MEDIUM | 10+ |
| HIGH | 5+ |

---

## Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| DRAFT v1 | 2025-07-16 | Integration Team | Initial matrix based on Repo A inspection + Repo B specification |
| | | | Pending: Repo B direct inspection will trigger v2 |
