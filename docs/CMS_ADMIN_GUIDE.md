# CMS admin guide (Phase 1)

The Phase 1 CMS is an **audit operations desk**, not a lesson editor. Lesson content still lives in `src/lib/curriculum.ts` and the seeded LMS tables.

## Sign in

1. Open `/admin/login`
2. Default bootstrap: `sensei@nihongobridge.local` / `bridge-audit`
3. Override the password with `ADMIN_BOOTSTRAP_PASSWORD` **before first seed** (hash is written once)

## What you can do

- Read the readiness score and domain coverage
- Browse the 12-phase roadmap
- Open a finding, review evidence + recommendation
- Move status: `open → in_progress → resolved` (or accept risk)
- See the activity log

## What you must not do here yet

- Edit units, exercises, or stories (no catalog editor in Phase 1)
- Delete learners
- Change `/api/game` contracts

## Public mirror

`/audit` is the read-only report for the rest of the team. It uses the same tables.
