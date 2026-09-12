# Components

Presentational React components for the canonical web client
(Next.js App Router, React 19, Tailwind v4).

```
components/
├── ui/          primitives (button, modal, field)
├── japanese/    furigana ruby text, stroke order, kana input
├── dictionary/  search box, entry card
├── learn/       lesson player, quiz question renderers
├── review/      SRS card + rating controls
└── layout/      shell, navigation
```

## Rules

1. Components render and handle interaction. They contain **no** business
   logic: no grading, scheduling, scoring, or authorization decisions.
2. Data comes from server components or `/api/v2`; components never query
   the database directly.
3. Japanese text containing `<ruby>` markup must be sanitised before render.
4. Repository B's React 18 / Next 14 components are adapted, never copied
   (`docs/architecture/INTEGRATION_BOUNDARIES.md` §3.6).

Subdirectories are created by the UI phase that needs them.
