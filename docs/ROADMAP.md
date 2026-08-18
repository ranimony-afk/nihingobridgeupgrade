# Implementation roadmap

Ordered for **extension over replacement**. Each phase must keep the lesson path playable.

| Phase | Title | Why this order | Status |
| --- | --- | --- | --- |
| 1 | Repository audit registry | You cannot sequence work you have not measured | Done |
| 2 | Infrastructure + identity dual-stack | Auth.js, Redis, health, CI, backups around the live LMS | Done |
| 3 | Enterprise authentication | OAuth, magic link, 2FA, JWT/refresh, RBAC, subscriptions | Done |
| 4 | Payments | Stripe, Razorpay, GST invoices, coupons, refunds | Done |
| 5 | Japanese knowledge graph | JMdict-scale schema, ETL, FTS, dictionary/kanji/grammar | Active |
| 6 | Grammar engine | Pure functions + tables, then UI | Planned |
| 7 | Conversation lab | New streaming routes, provider interface | Planned |
| 8 | CMS + i18n + DAM | Grow `/admin`, do not rebuild `/learn` | Planned |
| 9 | Exam simulator | Reuse `exercises` | Planned |
| 10 | Flutter offline client | Consumer of `/api/v1` | Planned |
| 11 | SEO / a11y / perf / security | Hardening after contracts stabilize | Planned |
| 12 | Billing + multi-brand | Last; requires identity | Planned |

Dependencies are stored in `audit_roadmap.depends_on`.
