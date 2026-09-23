# CMS API Request-Boundary Contract — Phase 13.5A

Normative boundary for the future CMS HTTP API, derived from the 13.4E
security gate over 13.3A → 13.4D-2. 13.5A implements routes; this document
fixes what those routes may and may not do. Any deviation requires a new
gate review.

## 1. Mandatory pipeline order (no stage may be skipped or reordered)

```
HTTP
→ authentication        (getAuthenticatedIdentity: getClaims-verified, else null)
→ application user      (resolveApplicationUser: find-or-provision learner)
→ CmsActor              (getCurrentActor: zero-arg, unknown role → learner)
→ requirePermission()   (401 unauthenticated / 403 unauthorized)
→ CmsService            (transition + version + policy + audit, transactional)
```

In practice stages 1–4 collapse to one call: instantiate `CmsService` and
invoke the method — `requirePermission()` inside every method runs the full
chain. Routes MUST NOT pre-resolve identity, MUST NOT pass identity into
the service (its inputs have no identity fields), and MUST NOT catch
`AuthorizationError` for any purpose other than shaping the 401/403
response.

## 2. Absolute prohibitions for route code

1. No `userId`/`user_id`/`actorId`/`authorId`/`reviewerId`/`role` accepted
   from body, query, headers, or cookies — for CMS operations. (Pre-existing
   learner routes that accept `userId` are out of CMS scope and MUST NEVER
   be wired to `CmsService` or `getCurrentActor` without migration + gate.)
2. No custom identity headers (`x-user-id`, `x-role`, `x-admin-key`, …).
3. No shared-secret bypass (`ADMIN_API_SECRET`, `service_role`, …).
4. No `getSession()` for auth decisions (it does not revalidate).
5. No provider metadata (`app_metadata`, `user_metadata`, JWT claims)
   consulted for role or permission — role comes ONLY from `users.role`.
6. No CMS mutation on GET (SameSite=Lax CSRF rule, §5).
7. No client-controlled `CmsRequestContext`: `ipAddress` comes ONLY from
   the hosting platform's verified client-IP signal, never the body.

## 3. Exact status mapping

| Situation | Status | Code | Source |
|---|---|---|---|
| No authenticated identity | 401 | `UNAUTHENTICATED` | `AuthorizationError` |
| Authenticated, insufficient permission | 403 | `FORBIDDEN` | `AuthorizationError` |
| Author approving own content | 403 | `SELF_APPROVAL_FORBIDDEN` | `CmsError` |
| Unknown item/version | 404 | `NOT_FOUND` | `CmsError` |
| Stale `expectedVersion` | 409 | `VERSION_CONFLICT` | `CmsError` |
| Validation failure (incl. bad transition, missing reason, bad timestamp) | 400 | `VALIDATION_ERROR` / `INVALID_TRANSITION` | `CmsError` |

Notes:

- This codebase uses **400, never 422**, for validation failures.
- Unknown permission strings throw a plain `Error` (programmer bug) and
  MUST surface as 500, never 403.
- `AuthorizationError` → `toErrorPayload()` gives the canonical body:
  `{ success: false, error: { code, message } }`. `CmsError` responses
  MUST use the same envelope (`error.details` optional, never secrets).

## 4. Concurrency and adapter rules (production `CmsDatabase`)

- `expectedVersion` is REQUIRED on every mutation input and is validated
  inside the transaction. The production adapter MUST enforce the
  version check atomically — e.g.
  `UPDATE … WHERE id = $1 AND current_version = $expected` asserting
  exactly one row — because check-then-update under READ COMMITTED can
  lost-update. The in-memory fake is single-threaded and cannot prove
  this; the adapter phase MUST prove it with a concurrent-write test.
- Rollback restores via a NEW version; history is never deleted.
- `archived → published` is reachable ONLY through admin `rollback`.

## 5. Session and CSRF rules

- Session cookies are `@supabase/ssr` defaults, consistent across all
  writers: `Path=/; SameSite=Lax`, JS-readable (`httpOnly: false` by
  vendor design — the browser client shares the cookie session),
  no `Secure` attribute.
- Consequences, all mandatory:
  1. Production MUST be HTTPS-only with HSTS (the missing `Secure`
     attribute is safe only when plaintext HTTP can never carry the
     cookie).
  2. Mutations MUST be POST/PUT/PATCH/DELETE via same-origin fetch and
     NEVER GET (Lax blocks cross-site credentialed POST/fetch, not
     top-level GET).
  3. NEVER override `cookieOptions` on one writer (server/proxy/callback)
     without all writers: `createBrowserClient` ignores all cookie
     options except `name`, so partial overrides fork the session into
     flag-mismatched duplicate cookies.
  4. No CORS `Access-Control-Allow-Origin: *` with credentials on CMS
     routes.
- Auth decisions verify via `getClaims()` server-side on every request;
  the proxy refreshes but never gates; the callback accepts only
  same-origin `next` paths.

## 6. Audit and output rules

- `actorId`, `authorId`, `reviewerId`, `createdById` are stamped from the
  verified actor only. Routes MUST NOT accept, forward, or log
  client-supplied identity values.
- Admin override requires reason + `admin` role and MUST keep the
  `adminOverride: true` audit marker.
- Audit `details` embed caller text (`changeSummary`, `reason`); future
  UI MUST output-encode them on render.

## 7. 13.5A acceptance checklist (all required)

- [ ] Every CMS route calls only `CmsService` methods (thin adapter).
- [ ] 401/403/404/409/400 mapping above, verified by route tests.
- [ ] Route tests prove hostile `userId`/`role`/header fields are ignored.
- [ ] Adapter proves atomic `expectedVersion` under concurrent writes.
- [ ] Production is HTTPS-only + HSTS; no mutation on GET.
- [ ] No new identity channel (re-run gate test `I`).
