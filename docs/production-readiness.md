# Production Readiness Checklist

This document is the gate between a clean Phase 14 verification and a real
deployment. Every item must be either checked off or explicitly waived
(`Acknowledged`) before standing up a production instance.

## Infrastructure

- [ ] MongoDB replica set with TLS-protected connection. The application
      supports transactions (used during `register`) and falls back gracefully
      on standalone Mongo, but production should run on a replica set.
- [ ] Backups: automated daily snapshots of the Mongo cluster with
      verified restore drills.
- [ ] Monitoring and alerting on backend uptime, error rate, request latency
      (p95), Mongo connection health, and disk usage.
- [ ] Logs shipped off-host (`LOG_LEVEL=info` minimum). The application logs
      JSON via pino with sensitive fields already redacted.
- [ ] Outbound provider credentials (email/SMS/WhatsApp) stored in a secrets
      manager, never in plain `.env` on the host. See
      [docs/known-limitations.md](known-limitations.md) for which providers
      remain mock-only today.

## Application configuration

- [ ] `APP_ENV=production`. Verified by inspecting `/api/v1/health` — it
      reports the live environment string.
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are random values of
      at least 32 bytes. Never reuse the `replace-me-*` placeholders shipped
      in `.env.example`.
- [ ] `CORS_ORIGIN` is restricted to the production frontend origin. Never
      ship with `*` enabled.
- [ ] `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX` calibrated to expected
      legitimate traffic. The defaults (15 min / 300 requests per IP) are
      conservative starting points; raise them only with traffic data.
- [ ] `REQUEST_BODY_LIMIT` left at `100kb` unless a measured use case (CSV
      uploads, large form schemas) requires a higher value.
- [ ] `APP_URL` and `FRONTEND_URL` point at the public, HTTPS-terminated
      domains. Public form URLs (`/f/:slug`) and campaign tracking URLs are
      generated from these values.
- [ ] `STORAGE_DRIVER=s3` with a configured bucket, credentials, and optional
      CDN base URL. Production startup refuses the local storage driver.
- [ ] Image retention policy decided before enabling physical purge of
      deleted media assets. See [docs/media-storage.md](media-storage.md).

## Frontend build

- [ ] `VITE_API_BASE_URL` set to the production backend (HTTPS).
- [ ] `VITE_APP_NAME` matches the brand the customer wants displayed.
- [ ] `pnpm --filter ./frontend run build` produces a clean `dist/`. The
      build is fully static and can be served behind any CDN.
- [ ] Static assets served with `Cache-Control: immutable` for hashed bundles
      and `no-cache` for `index.html`.

## Security

- [ ] Helmet, CORS, sanitiseInput, and rate limiting are enabled (defaults
      from `app.js`). Confirm with a single curl against a known endpoint —
      Helmet response headers must be present.
- [ ] Refresh-token reuse triggers full revocation. Covered by the automated
      test in `auth.spec.js` ("revokes every active refresh token for the
      user when a reuse is detected").
- [ ] Tenant suspension immediately revokes all refresh tokens and blocks
      already-issued access tokens. Covered by tests in `admin.spec.js`.
- [ ] No real secrets in the repository. Grep `.env.example`,
      `docker-compose.yml`, seeders, and tests if in doubt.
- [ ] Default super-admin credentials rotated immediately after seeding.

## Database

- [ ] Indexes verified after the first deploy. Mongoose autoIndex should be
      disabled in production (`mongoose.connection.options.autoIndex = false`)
      once indexes are confirmed; run `db.collection.getIndexes()` for each
      collection to compare against the model definitions.
- [ ] TTL index on `refresh_tokens.expiresAt` is active. Expired records are
      purged automatically.

## Background workers

- [ ] At least one `pnpm worker` process is running per host. The API alone
      cannot send campaigns or fire scheduled reminders.
- [ ] Worker process is supervised (systemd, Kubernetes Deployment,
      PM2…) so SIGTERM/SIGKILL trigger a restart. The worker reclaims
      crashed locks automatically after `JOB_LOCK_TIMEOUT_MS`.
- [ ] Monitor `GET /api/v1/admin/jobs/stats` (or the underlying Mongo
      collection) for `dead_letter` growth. A non-empty dead-letter queue
      requires operator triage.
- [ ] Scheduled jobs (low-balance / renewal reminders, media cleanup) are
      visible in the jobs collection with a `recurrence` value. If they
      disappear after a redeploy, verify the worker process is running and
      that no incompatible env override is masking the calendar-day dedupe
      key.

See [`docs/background-jobs.md`](background-jobs.md) for the full
operations runbook.

## Smoke test

After every deploy, run the manual checks described in
[`docs/troubleshooting.md`](troubleshooting.md#first-deploy-smoke-test).

## Open limitations

The deferred features documented in
[`docs/known-limitations.md`](known-limitations.md) are not blockers — but
their workarounds must be communicated to whoever runs the workspace so they
are not surprised by, for example, the password-reset endpoint failing.
