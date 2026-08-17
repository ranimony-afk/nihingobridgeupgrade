# REST API v1

Base path: `/api/v1`

All responses use the envelope:

```json
{ "ok": true, "data": ... }
```
or
```json
{ "ok": false, "error": "message", "code": "OPTIONAL_CODE" }
```

## Brands
- `GET /api/v1/brands` — list all brands.
- `GET /api/v1/brands/:slug` — single brand by slug (`ascend`, `nihongo`).

## Pages (CMS)
- `GET /api/v1/pages?brand=ascend&locale=en&status=published`
- `POST /api/v1/pages` — body: `{ brand, slug, title, body?, locale?, status? }`
- `POST /api/v1/pages/:id/transition` — body: `{ toStatus, actorId?, note? }`

Statuses: `draft | in_review | published | archived`. Every transition
writes to `editorial_events`.

## Courses (LMS)
- `GET /api/v1/courses?brand=ascend&locale=en&status=published`
- `GET /api/v1/courses/:slug?brand=ascend&locale=en` — returns the
  course with `modules[].lessons[]` pre-joined.

## Assets (DAM)
- `GET /api/v1/assets?brand=ascend&kind=image`
- `POST /api/v1/assets` — body: `{ brand?, kind, url, title?, altText?, mimeType?, bytes?, metadata? }`

Kinds: `image | video | audio | document`.

## Translations (i18n)
- `GET /api/v1/translations?entityType=page&entityId=1&locale=ja`
- `POST /api/v1/translations` — body: `{ entityType, entityId, locale, field, value }`
  (idempotent upsert on `(entityType, entityId, locale, field)`).

## Health
- `GET /api/health` — DB probe + seed check. Backwards compatible: still
  returns `{ ok: true }` on success.
