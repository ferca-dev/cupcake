# Cupcake Backend

Node.js + Express + Mongoose API for the Cupcake survey platform. This package is part of the pnpm workspace defined at the repository root.

## Prerequisites

- Node.js matching the root `.nvmrc` (Node 24 active LTS).
- pnpm 10+ (installed at the workspace root via Corepack).
- A reachable MongoDB instance. The repository ships a `docker compose` file that exposes Mongo on `localhost:27017` (`pnpm db:up` from the repo root).

## Setup

```bash
# From the repository root
pnpm install
cp backend/.env.example backend/.env
pnpm db:up
pnpm dev:backend
```

The development server reloads on file changes (`node --watch`). It listens on `APP_PORT` (default `4000`) and exposes the API under `/api/v1`.

## Scripts

| Script            | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `pnpm dev`        | Start the API with file watching and `.env` loaded. |
| `pnpm start`      | Start the API once (production-style local boot).   |
| `pnpm lint`       | Run ESLint over `src/`.                             |
| `pnpm lint:fix`   | ESLint with autofix.                                |
| `pnpm test`       | Run Vitest test suite once.                         |
| `pnpm test:watch` | Run Vitest in watch mode.                           |
| `pnpm seed`       | Run all seeders (idempotent).                       |

Run any script via the workspace from the repo root with `pnpm --filter ./backend run <script>` or use the root aliases (`pnpm dev:backend`, `pnpm lint:backend`, `pnpm test:backend`).

## Environment variables

All variables are validated at startup by `src/config/env.js`. The server **fails fast** with a readable error when a required variable is missing or invalid.

| Variable                 | Required | Default                 | Purpose                                                |
| ------------------------ | -------- | ----------------------- | ------------------------------------------------------ |
| `APP_NAME`               | no       | `Cupcake`               | Runtime product name (do not hardcode).                |
| `APP_ENV`                | no       | `development`           | One of `development`, `test`, `staging`, `production`. |
| `APP_PORT`               | no       | `4000`                  | HTTP port to listen on (0 lets the OS pick).           |
| `APP_URL`                | no       | `http://localhost:4000` | Public URL of the API.                                 |
| `FRONTEND_URL`           | no       | `http://localhost:5173` | Public URL of the SPA.                                 |
| `MONGODB_URI`            | **yes**  | —                       | MongoDB connection string.                             |
| `JWT_ACCESS_SECRET`      | **yes**  | —                       | Access-token signing secret (≥ 16 chars).              |
| `JWT_REFRESH_SECRET`     | **yes**  | —                       | Refresh-token signing secret (≥ 16 chars).             |
| `JWT_ACCESS_EXPIRES_IN`  | no       | `15m`                   | Access-token lifetime.                                 |
| `JWT_REFRESH_EXPIRES_IN` | no       | `7d`                    | Refresh-token lifetime.                                |
| `SUPER_ADMIN_*`          | no       | see `.env.example`      | Seeder defaults (Phase 02+).                           |
| `DEMO_CLIENT_*`          | no       | see `.env.example`      | Seeder defaults (Phase 02+).                           |
| `DEMO_TENANT_NAME`       | no       | `Demo Company`          | Seeder default (Phase 02+).                            |
| `EMAIL_PROVIDER`         | no       | `mock`                  | Email channel provider (`mock` or `sendgrid`).         |
| `SMS_PROVIDER`           | no       | `mock`                  | SMS channel provider (`mock` or `twilio`).             |
| `WHATSAPP_PROVIDER`      | no       | `mock`                  | WhatsApp channel provider (`mock` or `twilio`).        |
| `TWILIO_ACCOUNT_SID`     | conditional | —                    | Required when SMS or WhatsApp use `twilio`.            |
| `TWILIO_AUTH_TOKEN`      | conditional | —                    | Required when SMS or WhatsApp use `twilio`.            |
| `TWILIO_MESSAGING_SERVICE_SID` | no | —                       | Optional Twilio Messaging Service.                     |
| `TWILIO_SMS_FROM`        | conditional | —                    | Required for `SMS_PROVIDER=twilio` if no service SID.  |
| `TWILIO_WHATSAPP_FROM`   | conditional | —                    | Required for `WHATSAPP_PROVIDER=twilio` if no service SID. Format `whatsapp:+1...`. |
| `TWILIO_STATUS_CALLBACK_URL` | no   | —                       | Public URL of `/api/v1/webhooks/twilio/messages`.      |
| `TWILIO_SENDGRID_API_KEY`| conditional | —                    | Required when `EMAIL_PROVIDER=sendgrid`.               |
| `TWILIO_SENDGRID_FROM_EMAIL` | conditional | —                | Required when `EMAIL_PROVIDER=sendgrid`.               |
| `TWILIO_SENDGRID_FROM_NAME` | no    | `Cupcake`                | Friendly sender name for email.                        |
| `TWILIO_SENDGRID_EVENT_WEBHOOK_SECRET` | no | —              | Reserved for SendGrid webhook signature verification.  |
| `CORS_ORIGIN`            | no       | `http://localhost:5173` | Comma-separated allow list. `*` allows any.            |
| `LOG_LEVEL`              | no       | `info`                  | Pino log level.                                        |
| `REQUEST_BODY_LIMIT`     | no       | `100kb`                 | Maximum request body size.                             |
| `RATE_LIMIT_WINDOW_MS`   | no       | `900000`                | Global rate-limit window (15 min).                     |
| `RATE_LIMIT_MAX`         | no       | `300`                   | Global rate-limit request count per window.            |

The full template lives in [`.env.example`](./.env.example).

## Project layout

```
backend/
  src/
    app.js                # Express app factory (no process concerns)
    server.js             # Process bootstrap: env, DB, listen, signals
    config/
      env.js              # Zod-validated env loader, frozen on success
      database.js         # Mongoose connect/disconnect, connection state
      security.js         # Helmet + CORS configuration
    common/
      auth/               # Roles, permissions, password + JWT helpers
      constants/          # Error codes, HTTP statuses, API prefix
      errors/             # AppError + typed subclasses
      middlewares/        # Request logger, error handler, sanitizer, rate limiters,
                          # authenticate, authorize (role/permission/tenant)
      responses/          # Success/error envelope helpers
      utils/              # Logger, async-handler, slug
    modules/
      audit/              # audit-log.model.js, audit.service.js (stub)
      auth/               # auth.routes/controller/service/validation, refresh-token.model
      health/             # health.routes.js, health.controller.js
      surveys/            # survey.model, survey-version.model, survey.routes/controller/service/repository/validation,
                          # form-schema.validator.js
      contacts/           # contact.model, contact-group.model, contact.routes/controller/service/repository/validation
      tenants/            # tenant.model/routes/controller
      users/              # user.model.js
    routes/
      api-v1.js           # /api/v1 router, mounts modules
    seeders/              # index.js + seed-auth.js + seed-surveys.js + seed-contacts.js (idempotent)
    tests/                # Vitest suites + helpers + setup
```

Each future domain module follows the `<domain>.<file>.js` pattern (`<domain>.routes.js`, `<domain>.controller.js`, `<domain>.service.js`, `<domain>.repository.js`, `<domain>.model.js`, `<domain>.validation.js`).

## API response envelope

Success:

```json
{ "success": true, "data": {}, "message": "Operation completed successfully" }
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload",
    "details": []
  }
}
```

The error envelope is produced by `common/responses/api-response.js`. The global error handler (`common/middlewares/error-handler.js`) translates `AppError` subclasses, Zod errors, Mongoose validation/cast errors, duplicate-key (E11000), and payload-too-large errors into this shape. Stack traces are only appended to `error.details` outside `APP_ENV=production`.

## Endpoints implemented in Phase 01

| Method | Path             | Description                                 |
| ------ | ---------------- | ------------------------------------------- |
| GET    | `/api/v1`        | API metadata (name, version, environment).  |
| GET    | `/api/v1/health` | Liveness check + database dependency state. |

The health response includes `status`, `app.name`, `app.env`, `app.version`, `uptimeSeconds`, `dependencies.database`, and `timestamp`. It never includes connection strings, secrets, or environment variable values.

## Endpoints implemented in Phase 02

All authentication endpoints live under `/api/v1/auth`. Tokens are exchanged as
bearer tokens — the access token belongs in the `Authorization: Bearer <token>`
header, the refresh token can be sent in the request body or via the
`X-Refresh-Token` header. Refresh tokens are persisted as SHA-256 hashes and
are revocable; logging out revokes the current token, and re-using a revoked
token invalidates every active session for that user (replay-detection).

| Method | Path                           | Auth    | Description                                                                                                                                          |
| ------ | ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/register`        | public  | Create a tenant + `client_admin` user and issue tokens.                                                                                              |
| POST   | `/api/v1/auth/login`           | public  | Exchange email/password for access + refresh tokens.                                                                                                 |
| POST   | `/api/v1/auth/refresh`         | refresh | Rotate the refresh token, issue a new access token.                                                                                                  |
| POST   | `/api/v1/auth/logout`          | public  | Revoke the supplied refresh token (idempotent).                                                                                                      |
| GET    | `/api/v1/auth/me`              | bearer  | Return the current user, tenant, permissions, super-admin.                                                                                           |
| POST   | `/api/v1/auth/forgot-password` | public  | Always responds 200 without revealing account existence. Email delivery is deferred — see [docs/known-limitations.md](../docs/known-limitations.md). |
| POST   | `/api/v1/auth/reset-password`  | public  | Rejects every call until a reset-token store exists — see [docs/known-limitations.md](../docs/known-limitations.md).                                 |
| GET    | `/api/v1/tenants/me`           | bearer  | The caller's tenant (super admin returns `null` by default).                                                                                         |
| GET    | `/api/v1/tenants/:id`          | bearer  | Returns the tenant if the caller is super admin or owner.                                                                                            |

### Roles and permissions

Roles ship with a fixed default permission set (`common/auth/roles.js`):

- `super_admin` — every permission, including `admin.dashboard.view`.
- `client_admin` — full management of their tenant's surveys, contacts,
  campaigns, billing view, templates, and dashboards.
- `client_member` — survey authoring, contacts/groups, response viewing,
  dashboard access.

`requireRole(...roles)` and `requirePermission(...permissions)` (plus
`requireAnyPermission` and `requireTenantContext`) live in
`common/middlewares/authorize.js`. They expect `authenticate` to have run
first, which populates `req.user` and `req.tenantContext`.

### Tenant context

- `authenticate` populates `req.user.tenantId` and a `req.tenantContext` of
  `{ tenantId }`.
- **Super admins** never inherit a tenant filter implicitly. `req.tenantContext`
  is `null` until they explicitly opt in by sending an `X-Impersonate-Tenant`
  header. This prevents an accidental query from a super-admin session
  leaking another tenant's data.
- `requireTenantContext({ allowSuperAdminGlobal: false })` forces super admins
  to pick a tenant for endpoints that have no global semantics.

### Refresh tokens

`modules/auth/refresh-token.model.js` stores `{ userId, tenantId, tokenHash,
expiresAt, revokedAt, replacedByTokenHash, ip, userAgent }`. A TTL index on
`expiresAt` lets Mongo purge expired records. Only the SHA-256 hash of the
opaque token value is stored, so a database leak does not expose live
sessions.

### Seeders

`pnpm seed` (or `pnpm --filter ./backend run seed`) executes
`src/seeders/index.js`. Current seeders:

- Super admin user (`SUPER_ADMIN_*` env vars).
- Demo tenant (`DEMO_TENANT_NAME`).
- Demo client admin (`DEMO_CLIENT_*` env vars), assigned as tenant owner.
- One demo draft survey and one demo published survey (with `survey_versions`
  record `versionNumber: 1`) belonging to the demo tenant.
- Three demo contact groups (`Customers`, `Leads`, `VIPs`) and five demo
  contacts that mix complete and intentionally incomplete channels (email-only,
  phone-only, WhatsApp-only, and one archived record).

The seeder is idempotent — running it twice updates the matched records in
place without creating duplicates.

## Endpoints implemented in Phase 04

All survey endpoints live under `/api/v1/surveys`. They require an
authenticated bearer token and apply the tenant filter from `req.tenantContext`
(set by `authenticate` + `requireTenantContext`). Super admins must use the
`X-Impersonate-Tenant` header to scope mutations to a specific tenant.

| Method | Path                            | Permission                              | Description                                                                                          |
| ------ | ------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/surveys`               | `surveys.view`                          | Paginated list of surveys for the caller's tenant.                                                   |
| POST   | `/api/v1/surveys`               | `surveys.create`                        | Create a new draft survey.                                                                           |
| GET    | `/api/v1/surveys/:id`           | `surveys.view`                          | Return one survey (404 if not in tenant).                                                            |
| PUT    | `/api/v1/surveys/:id`           | `surveys.update`                        | Update title, description, slug, settings, draft schema.                                             |
| DELETE | `/api/v1/surveys/:id`           | `surveys.delete`                        | Permanently remove a survey.                                                                         |
| POST   | `/api/v1/surveys/:id/publish`   | `surveys.publish`                       | Validate the draft, snapshot it as an immutable version, set `status=published`.                     |
| POST   | `/api/v1/surveys/:id/pause`     | `surveys.publish`                       | Transition `published → paused`. Public URL still resolves but later phases will reject submissions. |
| POST   | `/api/v1/surveys/:id/archive`   | `surveys.publish` _or_ `surveys.delete` | Lock the survey read-only and stamp `archivedAt`.                                                    |
| POST   | `/api/v1/surveys/:id/duplicate` | `surveys.create`                        | Create a new `draft` with the same schema and a unique slug.                                         |
| GET    | `/api/v1/surveys/:id/versions`  | `surveys.view`                          | Return published versions (descending `versionNumber`).                                              |
| GET    | `/api/v1/surveys/:id/stats`     | `surveys.view`                          | Survey-level analytics powered by the dashboard module (Phase 10).                                   |

### Survey lifecycle

| Status      | Public?      | Mutable schema?            | Notes                                                                                      |
| ----------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------------ |
| `draft`     | No           | Yes (`currentDraftSchema`) | Newly created or duplicated surveys start here.                                            |
| `published` | Yes          | Draft only                 | Publishing copies the draft into a new `survey_versions` record; the version is immutable. |
| `paused`    | URL resolves | Draft only                 | Public submissions will be rejected in later phases.                                       |
| `archived`  | No           | No                         | Stamped with `archivedAt`. Update and lifecycle endpoints return `409 CONFLICT`.           |

Republishing a survey creates a new `survey_versions` record with an
incremented `versionNumber`; existing versions are never mutated. Responses
captured in later phases must reference the `surveyVersionId` that was active
at submission time.

### Slug rules

- Globally unique across the database (Mongo unique index on `surveys.slug`).
- Lowercase letters, numbers, and hyphens; `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
- When the caller omits `slug`, the service slugifies the title and appends a
  short random suffix until a free value is found.
- Supplying a slug that is already taken returns `409 CONFLICT`.

### Form schema

The draft schema sent in `POST` / `PUT` is validated by
`modules/surveys/form-schema.validator.js`. It is the source of truth for
field types (`FIELD_TYPES`), logic operators (`LOGIC_OPERATORS`), and
duplicate-detection rules (field ids, field keys, option keys, section ids,
logic rule ids). Validation errors come back as `422 VALIDATION_ERROR` with
issue paths, so the builder UI can render inline messages later.

The schema shape is:

```jsonc
{
  "fields": [
    {
      "id": "field_satisfaction",
      "type": "select",
      "key": "satisfaction",
      "label": "How satisfied are you?",
      "required": true,
      "options": [
        { "key": "high", "label": "High" },
        { "key": "low", "label": "Low" },
      ],
      "validation": {
        "minLength": null,
        "maxLength": null,
        "min": null,
        "max": null,
        "regex": null,
      },
      "visibility": {
        "mode": "always", // "always" | "show_when" | "hide_when"
        "conditionMode": "all", // "all" | "any" when mode != "always"
        "conditions": [],
      },
      "settings": { "width": "full", "imageUrl": null },
    },
  ],
  "sections": [],
  "logicRules": [
    {
      "id": "rule_show_comments",
      "name": "Ask for comments when satisfaction is low",
      "type": "visibility", // "visibility" | "navigation" | "end"
      "targetFieldId": "field_comments",
      "conditions": [{ "fieldId": "field_satisfaction", "operator": "equals", "value": "low" }],
      "conditionMode": "all",
      "action": { "type": "show", "target": null },
    },
  ],
  "layout": { "mode": "single_page", "showProgress": true },
}
```

### Conditional logic

Conditional logic is evaluated by `modules/surveys/logic-engine.service.js`
(pure functions, no I/O). The same semantics are mirrored in the frontend
at `frontend/src/features/logic/logic-engine.js`; backend remains
authoritative on submit.

- A field is **visible** when:
  - its `visibility.mode === 'always'`, or
  - its `visibility.mode === 'show_when'` and the condition group is satisfied, or
  - its `visibility.mode === 'hide_when'` and the condition group is **not** satisfied;
  - AND no matching top-level `logicRules` of `type: 'visibility'` overrides it.
- Top-level visibility rules override the per-field shortcut; the last
  matching rule wins.
- Navigation rules (`type: 'navigation'`, action `jump_to_field` /
  `jump_to_section` / `jump_to_page`) are advisory in single-page layouts
  and authoritative once paginated layouts are wired through.
- End rules (`type: 'end'`, action `end_survey`) short-circuit the
  remainder of the survey.

The schema validator prevents stored rules from:

- Referencing deleted/unknown field ids (in either conditions or targets).
- Using operators incompatible with the source field type (for example
  `greater_than` on a checkbox group).
- Letting a field reference itself in its own visibility conditions.
- Forming a navigation cycle (`A → B → A`).

The public-form answer validator evaluates visibility against the incoming
answer snapshot and **drops** any answer for a hidden field. Hidden
required fields therefore never block submission, and a malicious client
cannot smuggle an answer for a field that is not actually visible.

## Endpoints implemented in Phase 06

Public form routes live under `/api/v1/public/forms/*` and **do not require
authentication**. They expose only the immutable published schema (never the
draft) and submit responses against that exact version.

| Method | Path                                                | Auth   | Description                                                                 |
| ------ | --------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/api/v1/public/forms/:slug`                        | public | Return the published schema + display settings for the survey slug.         |
| GET    | `/api/v1/public/forms/:slug/token/:submissionToken` | public | Same payload, scoped to a campaign submission token.                        |
| POST   | `/api/v1/public/forms/:slug/responses`              | public | Submit answers. Returns the response id + the configured thank-you message. |

Response shape for the GET endpoints:

```json
{
  "success": true,
  "data": {
    "survey": {
      "id": "...",
      "slug": "feedback",
      "title": "Feedback",
      "description": "Tell us how it went",
      "status": "published",
      "settings": {
        "allowAnonymous": true,
        "requireContactData": false,
        "thankYouMessage": "Thanks!",
        "closeMessage": "...",
        "pausedMessage": "...",
        "oneResponsePerContact": false,
        "collectIp": false
      }
    },
    "version": { "id": "...", "versionNumber": 1, "schema": { "fields": [] } },
    "acceptingResponses": true,
    "pausedMessage": null
  }
}
```

Submission request body:

```json
{
  "answers": [{ "fieldId": "field_name", "value": "Ada" }],
  "metadata": { "startedAt": "2026-05-20T10:00:00.000Z" },
  "submissionToken": "optional-campaign-token"
}
```

### Public form rules

- Draft surveys, archived surveys, and surveys without a published version return `404 NOT_FOUND`.
- Paused surveys return their schema on `GET` (so the frontend can render the configured paused message) but reject submissions with `409 CONFLICT` and the `pausedMessage`.
- Anonymous submissions are rejected with `409 CONFLICT` when `settings.allowAnonymous` is `false` and no `submissionToken` is supplied.
- Submissions are validated against the published schema via `modules/public-forms/answer.validator.js`. Failures come back as `422 VALIDATION_ERROR` with `details[].path = ['answers', '<fieldId>']`.
- IP addresses are only persisted when `settings.collectIp` is `true`.
- Submissions are rate-limited (30/minute/IP) by `createPublicFormRateLimiter`. The limiter is skipped in tests.
- Every response stores `tenantId`, `surveyId`, `surveyVersionId`, the supplied `submissionToken`, the normalised answers, and `metadata { ip, userAgent, startedAt, submittedAt, completionTimeSeconds }`.

### Response model

`modules/responses/response.model.js` stores responses with indexes on:

- `tenantId` (single)
- `surveyId` (single)
- `surveyVersionId` (single)
- `submissionToken` (single)
- `(tenantId, surveyId, createdAt DESC)`
- `(surveyVersionId, createdAt DESC)`
- `(campaignId, createdAt DESC)`
- `campaignRecipientId`

Campaign and contact linkage columns (`campaignId`, `campaignRecipientId`, `contactId`) ship empty for Phase 06 and will be wired up when the campaign module lands.

### Audit events

`survey.service.js` records the following actions (entity type `survey`):

- `survey.created`
- `survey.updated`
- `survey.deleted`
- `survey.published`
- `survey.paused`
- `survey.archived`
- `survey.duplicated`

## Endpoints implemented in Phase 08

All contact and contact-group endpoints require an authenticated bearer
token and a non-super-admin tenant context (super admins must supply
`X-Impersonate-Tenant` to act on a tenant). All queries are scoped to the
caller's tenant; cross-tenant ids never resolve.

| Method | Path                                             | Permission        | Description                                                                                                      |
| ------ | ------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/contacts`                               | `contacts.manage` | Paginated list with filters: `search`, `status`, `tag`, `groupId`, `channel`, `email`, `phone`, `whatsappPhone`. |
| POST   | `/api/v1/contacts`                               | `contacts.manage` | Create a contact. Requires at least one of `email`, `phone`, `whatsappPhone`.                                    |
| GET    | `/api/v1/contacts/:id`                           | `contacts.manage` | Fetch a single contact (404 outside tenant).                                                                     |
| PUT    | `/api/v1/contacts/:id`                           | `contacts.manage` | Partial update. Updates that would leave the contact unreachable are rejected.                                   |
| DELETE | `/api/v1/contacts/:id`                           | `contacts.manage` | Soft-archive by default. Pass `?hard=true` to remove the record.                                                 |
| POST   | `/api/v1/contacts/import`                        | `contacts.manage` | Bulk import placeholder. Returns `202` with a `pending_implementation` job.                                      |
| GET    | `/api/v1/contacts/imports/:id/report`            | `contacts.manage` | Bulk import report placeholder. Returns the empty schema with `placeholder: true`.                               |
| GET    | `/api/v1/contact-groups`                         | `groups.manage`   | Paginated list with member counts.                                                                               |
| POST   | `/api/v1/contact-groups`                         | `groups.manage`   | Create a group. Names must be unique per tenant.                                                                 |
| GET    | `/api/v1/contact-groups/:id`                     | `groups.manage`   | Fetch a single group with the current member count.                                                              |
| PUT    | `/api/v1/contact-groups/:id`                     | `groups.manage`   | Update name, description, or status.                                                                             |
| DELETE | `/api/v1/contact-groups/:id`                     | `groups.manage`   | Delete the group; pulls the group id from every member contact.                                                  |
| POST   | `/api/v1/contact-groups/:id/contacts`            | `groups.manage`   | Add a contact to a group. Body: `{ "contactId": "<id>" }`.                                                       |
| DELETE | `/api/v1/contact-groups/:id/contacts/:contactId` | `groups.manage`   | Remove a contact from a group.                                                                                   |

### Contact data model

- `tenantId` (required), `firstName`, `lastName`, `fullName` (auto-derived when missing).
- `email`, `phone`, `whatsappPhone` — normalised at the service layer: emails are
  trimmed/lower-cased, phone-like values are reduced to digits while preserving
  the leading `+` when present.
- `tags: [String]` and `groupIds: [ObjectId]` — group ids are validated to belong
  to the caller's tenant before assignment.
- `status: 'active' | 'archived' | 'blocked'` — `archived` is the soft-delete state;
  `blocked` is reserved for explicit suppression and is treated as unreachable on
  every channel.

Each contact response includes a `channels` block with per-channel readiness:

```json
"channels": {
  "email":          { "ready": true,  "reason": null },
  "phone":          { "ready": false, "reason": "missing_phone" },
  "whatsapp_phone": { "ready": false, "reason": "invalid_whatsapp_phone" }
}
```

Reasons use the campaign-skip vocabulary defined in `00-shared-context.md`
(`missing_email`, `invalid_email`, `missing_phone`, `invalid_phone`,
`missing_whatsapp_phone`, `invalid_whatsapp_phone`, `contact_blocked`,
`contact_archived`). The frontend uses these to render channel pills and
explain why a contact is incomplete for a given delivery method.

### Audit events (contacts)

`contact.service.js` records the following actions:

- `contact.created`, `contact.updated`, `contact.archived`, `contact.deleted`,
  `contact.import.requested`
- `contact_group.created`, `contact_group.updated`, `contact_group.deleted`
- `contact_group.contact_added`, `contact_group.contact_removed`

## Endpoints implemented in Phase 10

Dashboard endpoints aggregate existing operational data (surveys, responses,
campaigns, recipients, audit logs) into tenant-safe analytics. All routes
require an authenticated bearer token and the `dashboard.view` permission
(super admins also receive these implicitly via `admin.dashboard.view`).

| Method | Path                                | Permission             | Description                                                                                                                                         |
| ------ | ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/dashboard/summary`         | `dashboard.view`       | Tenant overview (surveys, responses, campaigns, channels, recent activity). Returns global metrics when a super admin omits `X-Impersonate-Tenant`. |
| GET    | `/api/v1/dashboard/surveys/:id`     | `dashboard.view`       | Per-survey response totals, channel breakdown, daily trend, and latest responses.                                                                   |
| GET    | `/api/v1/dashboard/channels`        | `dashboard.view`       | Per-channel send/failure/skip aggregations with skipped reasons and provider counts.                                                                |
| GET    | `/api/v1/dashboard/recent-activity` | `dashboard.view`       | Latest audit-log entries scoped to the tenant.                                                                                                      |
| GET    | `/api/v1/admin/metrics`             | `admin.dashboard.view` | Global tenants/users/surveys/responses/campaigns/channels and recent activity. Refused (`403`) for tenant-bound clients.                            |

Implementation lives in `modules/dashboard`. The service runs aggregation
pipelines in parallel with `Promise.all`, uses `mongoose.trusted({ $in: ... })`
for `find()` filters that need operators past the global `sanitizeFilter`, and
relies on existing indexes (`tenantId+createdAt`, `tenantId+surveyId+createdAt`,
`tenantId+status`) to keep queries cheap. See
[`docs/dashboard-analytics.md`](../docs/dashboard-analytics.md) for the full
shape of each response and the testing strategy.

## Endpoints implemented in Phase 11

Template endpoints power the survey-from-template flow. All routes
require an authenticated bearer token. Tenant-bound users see active
system templates plus their own; super admins see everything (or an
impersonated tenant's templates via `X-Impersonate-Tenant`).

| Method | Path                                  | Permission                             | Description                                                                             |
| ------ | ------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/v1/templates`                   | `surveys.view` _or_ `templates.manage` | List visible templates with optional `category` / `scope` filters.                      |
| POST   | `/api/v1/templates`                   | `templates.manage`                     | Create a template. `isSystemTemplate: true` requires `super_admin`.                     |
| GET    | `/api/v1/templates/:id`               | `surveys.view` _or_ `templates.manage` | Fetch a single template the caller can see.                                             |
| PUT    | `/api/v1/templates/:id`               | `templates.manage`                     | Update title/description/category/status/schema (system templates require super admin). |
| DELETE | `/api/v1/templates/:id`               | `templates.manage`                     | Delete a template (system templates require super admin).                               |
| POST   | `/api/v1/templates/:id/create-survey` | `surveys.create`                       | Create a draft survey from the template, with a deep-cloned schema.                     |

The full data model, visibility rules, permissions matrix, audit events,
and duplication semantics are documented in
[`docs/templates.md`](../docs/templates.md). The same form-schema
validator (`form-schema.validator.js`) is used for templates and
surveys, so a template can never store a schema that would fail to
publish later.

## Endpoints implemented in Phase 15

Phase 15 makes campaign delivery production-ready by adding real provider
adapters behind the existing factory and prepares webhook routes for
delivery-status callbacks.

| Method | Path                                  | Auth   | Description                                                                                                     |
| ------ | ------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/webhooks/twilio/messages`    | public | Receives Twilio SMS/WhatsApp status callbacks (`MessageSid`, `MessageStatus`, optional `ErrorCode`).            |
| POST   | `/api/v1/webhooks/sendgrid/events`    | public | Receives SendGrid Event Webhook batches and forwards delivered/opened/clicked/bounce events to recipient docs.  |

### Campaign send rules (Phase 15)

- A campaign sends exactly **one** survey. `surveyId` is required at creation
  and `surveyVersionId` is captured as an immutable snapshot of the survey's
  current published version.
- Sending re-validates that the survey is still `published` and that the
  locked `surveyVersionId` document still exists. Draft, paused, archived, or
  missing-version surveys are refused with `409 CONFLICT` / `404 NOT_FOUND`.
- Re-sending a `failed` campaign is retry-safe — prior recipient documents are
  cleared before the new plan is built, so the campaign report never grows
  duplicate `(channel, contactId)` rows.

### Provider selection (Phase 15)

`resolveProviders({ env })` picks one adapter per channel and fails fast at
construction time when the selected real provider is missing credentials
(e.g. `EMAIL_PROVIDER=sendgrid` with no `TWILIO_SENDGRID_API_KEY`). Mock
providers remain the default for local development and the test suite. See
[`docs/provider-architecture.md`](../docs/provider-architecture.md) for the
full configuration matrix and webhook contract.

## Security middleware

Mounted in `src/app.js` in this order:

1. `requestLogger` — pino-http with redaction for authorization headers, cookies, passwords, and tokens.
2. `helmet` — secure HTTP headers.
3. `cors` — origin allow list driven by `CORS_ORIGIN`.
4. `compression` — gzip responses.
5. `express.json` / `express.urlencoded` — body parsing with `REQUEST_BODY_LIMIT`.
6. `sanitizeInput` — strips `$`-prefixed keys (Mongo operators) and prototype-pollution vectors from `req.body`, `req.query`, and `req.params`.
7. `createGlobalRateLimiter` — IP rate limiting under `/api/v1` (skipped under `APP_ENV=test`).

Stricter rate limiters for `/auth` and public form routes are exported from `common/middlewares/rate-limiters.js` and will be mounted in later phases.

## Graceful shutdown

`src/server.js` listens for `SIGTERM`, `SIGINT`, and `uncaughtException`. On signal it closes the HTTP server, disconnects Mongoose, and exits. A 10-second forced-exit timer prevents zombie processes.

## Testing

Vitest runs the suite under `src/tests/`. Tests **do not** require a real database — `src/tests/setup.js` populates the minimum env vars and the suite avoids `connectDatabase`. Use `pnpm test` for a single run or `pnpm test:watch` while iterating.
