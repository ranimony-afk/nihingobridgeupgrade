# Implementation roadmap

Ordered for **extension over replacement**. Each phase must keep the lesson path playable.

| Phase | Title | Why this order | Status |
| --- | --- | --- | --- |
| 1 | Repository audit registry | You cannot sequence work you have not measured | Done |
| 2 | Infrastructure + identity dual-stack | Auth.js, Redis, health, CI, backups around the live LMS | Done |
| 3 | Enterprise authentication | OAuth, magic link, 2FA, JWT/refresh, RBAC, subscriptions | Done |
| 4 | Payments | Stripe, Razorpay, GST invoices, coupons, refunds | Done |
| 5 | Japanese knowledge graph | JMdict-scale schema, ETL, FTS, dictionary/kanji/grammar | Done |
| 6 | Enterprise dictionary | Multilingual cards, conjugations, bookmarks, stroke animation | Done |
| 7 | Kanji explorer | D3 radial mind map, radicals, RTK/WK, compounds | Done |
| 8 | Grammar engine | Graph, difficulty, timeline, sentence builder | Done |
| 9 | AI tutor | Claude/OpenAI streaming, corrections, scoring | Done |
| 10 | Flutter + CMS | Offline mobile client, content workspace, SEO | Done |
| 11 | Flutter platform build | Runners, SSE streaming, downloads, Dart tests, CI | Done |
| 12 | Search | Postgres FTS, fuzzy, autocomplete, facets, ranking | Done |
| 13 | Payments hardening | Affiliate program, referral ledger, subscription lifecycle | Done |
| 14 | Analytics | Dashboard, learning + business metrics, retention, funnels, revenue | Active |
| 6 | Grammar engine | Pure functions + tables, then UI | Planned |
| 7 | Conversation lab | New streaming routes, provider interface | Planned |
| 8 | CMS + i18n + DAM | Grow `/admin`, do not rebuild `/learn` | Planned |
| 9 | Exam simulator | Reuse `exercises` | Planned |
| 10 | Flutter offline client | Consumer of `/api/v1` | Planned |
| 11 | SEO / a11y / perf / security | Hardening after contracts stabilize | Planned |
| 12 | Billing + multi-brand | Last; requires identity | Planned |

Dependencies are stored in `audit_roadmap.depends_on`.
