# Security notes

## Current LMS session

`nb_learner` is an httpOnly, SameSite=lax cookie whose value is the raw learner id. It is **not** a credential. Treat impersonation as a known critical finding (`f-auth-unsigned-cookie`). Phase 2 must dual-read a signed session without dropping this cookie on day one.

## Staff session (Phase 1)

`nb_staff` is `staffId.hmac-sha256(secret)`. Secret falls back to `ADMIN_SESSION_SECRET` then `DATABASE_URL`. This is an interim control so the CMS is not world-writable. It is not NextAuth.

## Quiz integrity

`completeLesson`, `completePractice`, and `completeStory` trust client numeric fields. Do not expose `/api/game` to untrusted native clients until the attempt ledger ships.

## Bootstrap password

Change `ADMIN_BOOTSTRAP_PASSWORD` in the environment. If the staff row already exists, update `staff_users.password_hash` with a new `hashPassword()` result.

## Healthcheck

`/api/health` stays unauthenticated and side-effect free.
