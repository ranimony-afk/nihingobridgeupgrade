# Enterprise Monetization & Product Strategic Roadmap (v4.0+)

**Version:** 4.20.0 (Launch Gold Edition)  
**Target Platform:** Nihongo Bridge Unified Learning Portal  
**Indian Market Focus:** Hindi/Tamil Explanations, Razorpay UPI, and Career Placements  
**Prepared:** August 2026  

---

## 1. Executive Summary & Gaps Audit

This strategic roadmap outlines the immediate and long-term monetization, authentication, payment integration, and AI-tutor expansion tracks for the Nihongo Bridge platform. Based on our comprehensive repository audit, we identify the following feature milestones:

| Feature Domain | Existing Codebase Status | v4.0+ Hardening Action | Location |
| :--- | :--- | :--- | :--- |
| **Multi-Brand CMS** | ✅ 100% Dynamic & Seeding | Active public & admin CMS panels | `/apps/website/src/app/[brand]/` |
| **Takoboto Dictionary** | ✅ Search & Fallback Emitter | Dynamic lookup fallback engine | `/apps/website/src/app/dictionary/` |
| **Kanji Study explorer** | ✅ KANJI60 Mindmap & Canvas | Clickable Semantic branches | `/apps/website/src/app/kanji/` |
| **Exam simulator** | ✅ Graded Section Timers & CAT | Adaptive test streak mechanics | `/apps/website/src/app/jlpt/mock-exam/` |
| **Dialogue Lab** | ✅ 9-Situation Speaking mic reviews | Speech verifiers and audio shadowing | `/apps/website/src/app/conversation/` |
| **LMS curriculum** | ✅ Relational Courses & Lessons | Pre-joined modular study decks | `/apps/website/src/app/vocabulary/` |
| **Admin dashboard** | ✅ 11 Sidebar Manager Panels | Persistent PostgreSQL Settings controllers | `/apps/website/src/app/admin/` |
| **Multi-Locale explanations** | ✅ 7 Languages Selectors | English, Tamil, Malayalam, Vietnamese, Thai, Korean, Chinese | `/apps/website/src/app/conversation/` |
| **Asset DAM** | ✅ Checksums & srcset variants | Media library and alt tag inspector | `/apps/website/src/app/api/v1/assets/` |
| **Automated Tests** | ✅ 26 Suites (A11y, E2E, Stress) | Native Node test runner integration | `/tests/` & `/apps/website/tests/` |
| **Billing & Affiliates** | ✅ Admin Coupons Ledger (UI ready) | Future Stripe/Razorpay webhooks | `/apps/website/src/app/admin/[brand]/?tab=monetization` |
| **Mobile REST API** | ✅ 15 Secure Bearer JWT endpoints | OpenAPI schemas & Swagger sandboxes | `/apps/website/src/app/api/v1/mobile/` |

---

## 2. Phase 1 — Authentication & UPI Payments Activation

### 2.1 NextAuth.js Integration
To secure premium paywalled courses, mock tests, and custom deck bookmarks, NextAuth.js with Google OAuth is configured as the primary zero-friction provider for Indian learners. Database session adapters are provisioned using our newly appended NextAuth PostgreSQL tables:
- `users`: Core learner data.
- `accounts`: Google/Social login credentials maps.
- `sessions`: Active user database-session tokens.
- `verification_tokens`: Secure email signup verifications.

### 2.2 Razorpay India-First Integration
Since Stripe lacks UPI and local card support in India, **Razorpay** is the mandatory, primary payment gateway. The billing tiers are optimized as follows:

| Subscription Tier | Targeted Price | Target Content |
| :--- | :--- | :--- |
| **Free Tier** | ₹0 | N5 vocabulary lists, basic KANJI60 map, 3 practice exams/month |
| **Pro Monthly** | ₹199 / month | All JLPT N5-N2 mock exams, unlimited dictionary searches, and AI-Tutor turns |
| **Pro Yearly** | ₹1499 / year | Annual billing saver, full grammar conjugation access, and verified certifications |
| **JLPT Pack** | ₹499 one-time | Life-time access to N5-N2 full exam question banks & PDF certificates download |

---

## 3. Phase 2 — JMdict & Tatoeba Datasets Ingestions

### 3.1 Vocabulary & Example Sentences Enrichment
To make the dictionary completely self-contained without external API dependencies:
- **JMdict JSON**: Seeds the first 50,000 high-frequency Japanese words into the `nihongoLearningItems` table.
- **Tatoeba example sentences**: Maps Japanese sentences, readings, and multilingual (Hindi/English) explanations inside the dictionary detail cards.

---

## 4. Phase 3 — Graphical D3-Powered Mindmaps

### 4.1 Interactive Radial Trees
- Integrates D3.js inside `src/app/kanji/KanjiMindMapTree.tsx` to render clickable radial mindmaps connecting central radical roots (e.g. `水` - water, `木` - tree) to corresponding character leaves (e.g., `海`, `泳`, `森`).
- Free users can browse the N5 KANJI60 tree, while Pro/Premium unlocks all 1,000+ JLPT N5-N2 characters.

---

## 5. Phase 4 — AI Hana Tutor & Speech Phonics

### 5.1 Conversational AI hana Partner
- Deploys Claude (Anthropic API) as a friendly tutor "Hana" (はな) specialized for bilingual Indian students.
- Translates conversational speech inputs on-the-fly and generates friendly grammatical corrections in Hindi/Tamil.
