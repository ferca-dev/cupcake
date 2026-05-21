# Troubleshooting

Practical fixes for the most common issues encountered while running Cupcake
locally or smoke-testing a deploy.

## Backend will not start

### `EnvValidationError: Invalid environment configuration`

The backend uses Zod to validate every environment variable at boot. A missing
or malformed value aborts startup with a per-variable error message. The most
common offenders:

- `MONGODB_URI` is empty. Run `pnpm db:up` and confirm `mongodb://localhost:27017/cupcake` is reachable.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` shorter than 16 characters.
- `APP_PORT` is already in use. Either free the port or set `APP_PORT=4001`.

Re-copy `backend/.env.example` to `backend/.env` if the file drifted away
from the template, then fill in any local-only values.

### `MongoServerSelectionError` / `Connect ECONNREFUSED`

Mongo is not running, or it is running on a different host/port than
`MONGODB_URI` expects.

```bash
pnpm db:up         # start the Docker container
pnpm db:logs       # tail the container output
pnpm db:reset      # nuke the volume and start fresh
```

If you are not using the bundled `docker-compose.yml`, set `MONGODB_URI` to
the connection string your cluster exposes.

### Port 27017 already in use

Another Mongo install is listening. Either stop it (`brew services stop
mongodb-community` on macOS) or remap the container port in
`docker-compose.yml` and update `MONGODB_URI` accordingly.

## Frontend will not start

### `Cannot find package '@vue/test-utils' / vite`

You ran `pnpm install` only in one workspace. From the repo root:

```bash
pnpm install
```

### Empty page / 404 on every API call

The frontend cannot reach the backend.

- Confirm the backend is up: `curl http://localhost:4000/api/v1/health`.
- Confirm `frontend/.env` has `VITE_API_BASE_URL=http://localhost:4000/api/v1`.
- If the backend runs on a different port, restart the frontend dev server
  after editing the env file — Vite does not hot-reload env changes.

### CORS error in the browser console

`CORS_ORIGIN` in `backend/.env` must include the frontend origin. The default
(`http://localhost:5173`) matches the Vite dev server. For other origins (a
LAN IP, a tunnel URL), add them as comma-separated values, then restart the
backend.

## Seeders

### Seeders fail with `JWT_ACCESS_SECRET must be at least 16 characters`

The seeder loads the same env schema as the backend. Fix `.env` before
running `pnpm --filter ./backend run seed`.

### "I ran the seeders twice and got duplicates"

You shouldn't. Every seeder is idempotent (`upsert`-style behaviour). If you
do see duplicates, file a bug — it is a regression, not expected. As a
recovery step you can wipe the database (`pnpm db:reset`) and re-seed.

### Demo data is not appearing in the UI

Confirm the seeder actually ran:

```bash
pnpm --filter ./backend run seed
```

Then refresh the browser. The demo client admin credentials live in
`backend/.env` (`DEMO_CLIENT_EMAIL`, `DEMO_CLIENT_PASSWORD`).

## Tests

### Backend tests hang at "starting MongoDB memory server"

`mongodb-memory-server` downloads the right Mongo binary on first run and
caches it under `~/.cache/mongodb-binaries/`. The first invocation can take a
minute. If it stalls behind a corporate proxy, set `HTTP_PROXY` /
`HTTPS_PROXY` before running `pnpm test`.

### `expect(received).toEqual(expected)` with a timestamp mismatch

The test helpers seed fresh data between cases. If you see a flaky timestamp
assertion, it usually means the test is comparing `Date` objects across a
clock-tick boundary. Wrap the assertion in `expect.objectContaining({ ... })`
or compare ISO strings only.

### Frontend test fails with `localStorage is not defined`

You added code that touches `window.localStorage` at module evaluation. Move
the access into a function or guard it with `typeof window !== 'undefined'`.
Vitest uses jsdom; SSR-style guards are still required.

## First-deploy smoke test

After deploying both services, walk through this list. Each step is a manual
confirmation that the corresponding feature does not throw or 5xx.

1. `GET /api/v1/health` returns `success: true`, the configured `APP_NAME`,
   and `dependencies.database = "connected"`.
2. Sign in with the demo client admin. The dashboard renders. The role
   label shows the translated string (not `client_admin`).
3. Create a draft survey, add at least one field, publish it. The
   `survey_versions` collection gains a new row with `versionNumber: 1`.
4. Open the public form URL (`/f/<slug>`) in an incognito window. Fill it
   in and submit. The `responses` collection gains a new row.
5. Create a contact with both an email and a phone, and one with only an
   email. Create a campaign targeting both. Send it. The campaign report
   should show one `sent` and one `skipped` recipient (the email-only
   contact, for whichever channel does not match).
6. Open the dashboard. The summary, channel performance, and recent
   activity panels should display non-zero counts.
7. As a super admin, open the admin panel and create a new tenant. Sign in
   as that tenant's admin from another browser. The seeded data should
   never leak.
8. Suspend the new tenant from the admin panel. The other browser session
   should be locked out on the next request (or on token refresh).

If any step fails, capture the relevant response/log and file a bug before
running real traffic.
