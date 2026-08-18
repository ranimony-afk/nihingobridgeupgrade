# Flutter compatibility

The web app uses httpOnly cookies. Flutter (Dio) should ignore cookies and use headers.

```
POST /api/v1/auth/login
{ "email": "...", "password": "..." }

→ { ok, data: { accessToken, refreshToken, expiresIn, user } }

Authorization: Bearer <accessToken>
X-Refresh-Token: <refreshToken>

POST /api/v1/auth/refresh
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

If `requires2fa` is true, POST the same login URL with `{ challengeId, otp }`.

SQLite can persist `refreshToken` only. Treat `accessToken` as memory-only.
