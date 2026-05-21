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
| `EMAIL_PROVIDER`         | no       | `mock`                  | Email channel provider.                                |
| `SMS_PROVIDER`           | no       | `mock`                  | SMS channel provider.                                  |
| `WHATSAPP_PROVIDER`      | no       | `mock`                  | WhatsApp channel provider.                             |
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
      tenants/            # tenant.model/routes/controller
      users/              # user.model.js
    routes/
      api-v1.js           # /api/v1 router, mounts modules
    seeders/              # index.js + seed-auth.js (idempotent)
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

| Method | Path                           | Auth    | Description                                                  |
| ------ | ------------------------------ | ------- | ------------------------------------------------------------ |
| POST   | `/api/v1/auth/register`        | public  | Create a tenant + `client_admin` user and issue tokens.      |
| POST   | `/api/v1/auth/login`           | public  | Exchange email/password for access + refresh tokens.         |
| POST   | `/api/v1/auth/refresh`         | refresh | Rotate the refresh token, issue a new access token.          |
| POST   | `/api/v1/auth/logout`          | public  | Revoke the supplied refresh token (idempotent).              |
| GET    | `/api/v1/auth/me`              | bearer  | Return the current user, tenant, permissions, super-admin.   |
| POST   | `/api/v1/auth/forgot-password` | public  | Always responds 200 (placeholder until email is wired).      |
| POST   | `/api/v1/auth/reset-password`  | public  | Reserved; currently rejects until tokens are implemented.    |
| GET    | `/api/v1/tenants/me`           | bearer  | The caller's tenant (super admin returns `null` by default). |
| GET    | `/api/v1/tenants/:id`          | bearer  | Returns the tenant if the caller is super admin or owner.    |

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
`src/seeders/index.js`. Phase 02 seeds:

- Super admin user (`SUPER_ADMIN_*` env vars).
- Demo tenant (`DEMO_TENANT_NAME`).
- Demo client admin (`DEMO_CLIENT_*` env vars), assigned as tenant owner.

The seeder is idempotent — running it twice updates the matched records in
place without creating duplicates.

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
