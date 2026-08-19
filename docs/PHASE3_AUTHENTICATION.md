# Phase 3 — Authentication

Enterprise identity layered on the existing dual-stack. Guest `nb_learner` cookies, HMAC staff, and Auth.js staff JWT remain valid.

## Capabilities

| Feature | Implementation |
| --- | --- |
| Email login / register | `/login` `/register` → `/api/v1/auth/*` |
| Magic link | Mail outbox + `/login?magic=` |
| Password reset | `/forgot-password` `/reset-password` |
| Email verification | `/verify-email` |
| Google / GitHub OAuth | Auth.js providers when env keys exist |
| 2FA TOTP | RFC 6238 in `src/lib/identity/totp.ts` |
| JWT + refresh | HS256 access 15m, refresh 30d |
| Sessions | List/revoke refresh rows |
| RBAC | student, teacher, admin, super_admin, institution |
| Subscriptions | free / plus / institution; `/plus` gated |
| CMS | `/admin/identity` |
| Flutter | Bearer + `X-Refresh-Token` (see FLUTTER_AUTH.md) |

## Demo accounts

Password: `bridge-audit` (or `ADMIN_BOOTSTRAP_PASSWORD`)

- `student@nihongobridge.local` — student / free
- `teacher@nihongobridge.local` — teacher / plus
- `institution@nihongobridge.local` — institution
- `sensei@nihongobridge.local` — super_admin (also staff CMS)

## OAuth env

`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
