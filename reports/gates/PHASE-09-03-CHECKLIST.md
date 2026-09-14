# PHASE 09.3 — Lesson player

Status: **COMPLETE** (UI · SSR · navigation · tests · build · deployment gate)

Depends on 09.2 (lesson sections and blocks). The player adds **no new tables**:
it is a presentation layer over the canonical lesson architecture.

## Scope

| In scope | Deferred |
| --- | --- |
| step-through section player | server-side / user-owned progress (needs auth) |
| progress bar, step chips, completion state | exercises, grading, quiz engine |
| keyboard navigation, restart | SRS scheduling, XP, streaks |
| knowledge links inside each step | analytics events |

## Implementation

| Area | File | Evidence |
| --- | --- | --- |
| Player | `src/components/learning/lesson-player.tsx` | `LessonPlayer`: step index, per-section completion set, progress bar, step chips, prev/next, `←`/`→`/`Enter` keyboard nav, finish state, restart |
| Route | `src/app/lessons/[slug]/play/page.tsx` | server-rendered payload, prerequisite notice, `<noscript>` full-content fallback |
| Block rendering | same component | prose (`text`/`objective`), callouts (`tip`/`warning`/`checkpoint`) and reference cards linking to `/grammar/*`, `/kanji/*`, `/dictionary?q=*`, `/sentences/*` |
| Entry points | `src/app/lessons/[slug]/page.tsx`, `src/app/courses/[slug]/page.tsx` | "Start studying" button and per-lesson study links in the course outline |
| Ops | `scripts/provision.sh` | player gate wired into DB-only and HTTP verification |
| Docs | `docs/learning/course-architecture.md` | player behaviour and the client-only progress decision |

### Progress storage decision

Progress is stored in `localStorage` under `nb.player.v1.<lesson-slug>`, never on
the server. Rationale: there is no authentication system yet, and inventing an
anonymous server-side progress table would create a competing user model that a
later accounts phase would have to unwind. The version prefix makes the future
migration to authenticated progress explicit. The UI states this to the learner.

Restore/persist both run inside `setTimeout` callbacks so no `setState` happens
synchronously in an effect body (satisfies `react-hooks/set-state-in-effect`).

## Deployment gate

```bash
node tests/lesson-player-gate.mjs http://127.0.0.1:3000   # GATE PASSED (25 checks)
```

Verified:

* **DB** — all 20 published lessons are playable, no empty steps, every lesson
  has a first step;
* **SSR** — player mounts, step navigation, active section, progress bar,
  completion control, keyboard hint, client-only-progress disclosure;
* **completeness** — every section title and the first step's prose appear in the
  server HTML, plus a `<noscript>` fallback;
* **knowledge integrity** — all 15 reference routes for the sample lesson are
  rendered, and 6/6 sampled links return 200;
* **entry points** — lesson page and course outline both link into `/play`;
* **continuity** — the next lesson's player opens from the finish state;
* **404** — unknown lesson returns 404;
* **coverage** — 10/10 sampled lessons across all five courses are playable.

## Regression

09.2 lesson architecture, 09.1 course architecture, 08.2 unified search,
08.1 PostgreSQL search, 07.1–07.4 grammar, 06.4 Kanji Mind Tree — all re-run.
