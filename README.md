# Cupcake

Cupcake is a multi-tenant SaaS platform for creating, sending, answering, and analyzing surveys and online forms. Tenants build surveys with a visual drag-and-drop editor, distribute them through email, SMS, and WhatsApp, collect public responses via unique slugs, and analyze results in dashboards.

> All source code, comments, and developer-facing documentation in this repository are written in English. User-facing strings are centralized for future internationalization (English and Spanish ship today).

## Status

Phase 24 — Mercado Pago online payments. The product foundation (auth, surveys, public forms, contacts, campaigns, dashboard, templates, billing, admin panel) is feature-complete for the closed beta. Phases 15–18 added the Twilio-backed campaign delivery surface (SMS, WhatsApp, SendGrid email), per-survey response limits enforced from the published snapshot, the authenticated account-settings area, and the responsive dashboard shell with a collapsible sticky sidenav and sticky-header data grids. Phases 19–22 layered the internal token wallet with admin-controlled pricing and tenant send limits, per-survey statistical reports with tenant-safe CSV/JSON exports, an interchangeable image storage layer (local for development, S3-compatible for production), and a centered fill-width layout system shared by the dashboard and public form shells. Phase 23 ran the final quality pass on those surfaces. Phase 24 wires Mercado Pago Checkout Pro for one-time token-package purchases and Mercado Pago Preapproval for recurring subscriptions, with idempotent webhook processing, signature verification, ledger-backed token crediting, and idempotent transactional emails for payment and subscription lifecycle events — see [docs/mercado-pago.md](docs/mercado-pago.md).

## Stack

| Layer           | Choice                                                               |
| --------------- | -------------------------------------------------------------------- |
| Frontend        | Vue 3 (Composition API) + Vite, Pinia, Vue Router                    |
| Backend         | Node.js (current Active LTS, Node 24) + Express                      |
| Database        | MongoDB via Mongoose                                                 |
| API style       | REST under `/api/v1`                                                 |
| Styling         | Global CSS: `theme.css`, `global.css`, `layout.css`, `utilities.css` |
| Infra (local)   | Docker Compose for MongoDB                                           |
| Package manager | pnpm workspaces                                                      |
| Formatting      | Prettier                                                             |

See [docs/architecture-decisions.md](docs/architecture-decisions.md) for the reasoning behind these choices.

## Prerequisites

- **Node.js** matching `.nvmrc` (Node 24, the current Active LTS). With `nvm`: `nvm use`.
- **pnpm** 10+. Install via `corepack enable && corepack prepare pnpm@10.25.0 --activate`, or `npm install -g pnpm`.
- **Docker Desktop** (or Docker Engine + Compose v2) for the local MongoDB container. Optional if you already run Mongo elsewhere.
- **Git**.

Default ports:

| Service  | Port    |
| -------- | ------- |
| Backend  | `4000`  |
| Frontend | `5173`  |
| MongoDB  | `27017` |

## Quickstart

From a fresh clone to a logged-in browser in five commands:

```bash
# 1. Install dependencies for the whole workspace.
pnpm install

# 2. Create environment files from the templates.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start MongoDB (Docker required).
pnpm db:up

# 4. Seed demo data (idempotent — safe to re-run).
pnpm --filter ./backend run seed

# 5. Run backend + frontend in parallel.
pnpm dev
```

While `pnpm dev` is running:

| Service        | URL                                 |
| -------------- | ----------------------------------- |
| Frontend (SPA) | http://localhost:5173               |
| Backend API    | http://localhost:4000/api/v1        |
| Health check   | http://localhost:4000/api/v1/health |
| Public form    | http://localhost:5173/f/`<slug>`    |

Open http://localhost:5173 and sign in with one of the [seeded accounts](#default-seeded-accounts) below. If anything fails, see [docs/troubleshooting.md](docs/troubleshooting.md).

## Detailed setup

Each Quickstart step explained.

### 1. Install dependencies

```bash
pnpm install
```

pnpm uses a content-addressable store at `node_modules/.pnpm/` shared across the workspace. The per-package `backend/node_modules` and `frontend/node_modules` directories contain only symlinks — there is no per-package `pnpm install`.

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

The backend validates every variable on boot via Zod and **fails fast** with a readable error if anything is missing or malformed. The defaults in `.env.example` are valid for local development. Never commit a populated `.env`. Full reference: [backend/README.md](backend/README.md#environment-variables).

The variables to know first:

| Variable                                   | Where    | Why it matters                                                                         |
| ------------------------------------------ | -------- | -------------------------------------------------------------------------------------- |
| `MONGODB_URI`                              | backend  | Mongo connection string. Defaults to the Docker container.                             |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | backend  | Token signing. Random ≥16-char values required in any non-local env.                   |
| `APP_NAME`                                 | backend  | Brand string at runtime. Never hardcode "Cupcake".                                     |
| `VITE_APP_NAME`                            | frontend | Brand string in the UI.                                                                |
| `VITE_API_BASE_URL`                        | frontend | Where the SPA calls the API. Defaults to localhost:4000.                               |
| `STORAGE_DRIVER` / `S3_*`                  | backend  | Image storage. Local is for development; production uses S3-compatible object storage. |
| `CORS_ORIGIN`                              | backend  | Comma-separated allow list for SPA origins.                                            |
| `SUPER_ADMIN_*` / `DEMO_CLIENT_*`          | backend  | Credentials the seeder uses. **Rotate them before exposing the app.**                  |

### 3. Start MongoDB

```bash
pnpm db:up           # start the bundled Mongo container
pnpm db:logs         # tail container output
pnpm db:down         # stop the container, keep the volume
pnpm db:reset        # stop, drop the volume, start fresh — destroys local data
```

If you already have a Mongo running on `localhost:27017`, you can skip Docker and point `MONGODB_URI` at it instead.

### 4. Seed demo data

```bash
pnpm --filter ./backend run seed
```

The seeder is **idempotent**: re-running it never duplicates records. It creates:

- One super admin and one demo client admin.
- A demo tenant (workspace) owned by the client admin.
- Five demo contacts mixing complete and intentionally incomplete channels.
- Three contact groups.
- System templates (NPS, CSAT, etc.).
- One draft survey and one published survey (with a `survey_versions` record).
- A demo campaign and demo responses.
- Demo transactions for the billing history view.

### 5. Run the servers

```bash
pnpm dev             # backend + frontend in parallel
pnpm dev:backend     # backend only (port 4000)
pnpm dev:frontend    # frontend only (port 5173)
```

`Ctrl+C` stops the running script. MongoDB keeps running until `pnpm db:down`.

Verify the backend with:

```bash
curl http://localhost:4000/api/v1/health
```

It returns the shared success envelope with the app name, environment, uptime, and the live database connection state.

## Default seeded accounts

The seeder reads `backend/.env` and creates these users. **Rotate the passwords before exposing the instance to anyone else.**

| Role         | Email                  | Password       | Access                                                   |
| ------------ | ---------------------- | -------------- | -------------------------------------------------------- |
| Super admin  | `admin@cupcake.local`  | `ChangeMe123!` | Admin panel, every tenant, platform-wide metrics.        |
| Client admin | `client@cupcake.local` | `ChangeMe123!` | Demo tenant: surveys, contacts, campaigns, billing view. |

The `Demo Company` workspace is owned by the client admin.

## Using the application

Typical workflow once you have signed in:

1. **Dashboard** — http://localhost:5173. The client admin lands on the workspace dashboard with live KPIs. The super admin lands on the platform-wide overview and can drill into any tenant from the admin panel.
2. **Surveys** — sidebar → "Surveys". The drag-and-drop builder lets you add fields, configure validation, and define conditional logic. Drafts can be edited freely; publishing snapshots the schema into an immutable `survey_versions` record.
3. **Publish a survey** — the "Publish" button validates the schema and exposes the public form at `/f/<slug>` (e.g. http://localhost:5173/f/customer-feedback). Anyone with the link can answer it, no authentication required.
4. **Contacts and groups** — under "Contacts". Each contact needs at least one of email, phone, or WhatsApp to be reachable. Group contacts to target several at once.
5. **Campaigns** — sidebar → "Campaigns". Pick a published survey, target contacts/groups, choose channels (email / SMS / WhatsApp). Bulk sends are tolerant: unreachable recipients are marked `skipped` with a clear reason, the rest are sent. The default `mock` provider runs offline; set `EMAIL_PROVIDER=sendgrid`, `SMS_PROVIDER=twilio`, and/or `WHATSAPP_PROVIDER=twilio` plus the matching credentials to switch to real delivery — see [docs/provider-architecture.md](docs/provider-architecture.md).
6. **Public responses** — open the form URL in an incognito window, fill it in, submit. The response shows up in the survey's stats and on the dashboard.
7. **Templates** — start a new survey from a pre-built schema (NPS, customer satisfaction, etc.).
8. **Billing** — buy token packages through Mercado Pago Checkout Pro,
   manage recurring subscriptions, and review invoices, refunds, reversals,
   and credits for the workspace.
9. **Admin panel** (super admin only) — "Admin panel" → "Clients". Create, edit, suspend, or cancel tenant workspaces. Suspending a tenant immediately revokes refresh tokens and blocks already-issued access tokens.

A step-by-step smoke test that exercises every feature lives in [docs/troubleshooting.md](docs/troubleshooting.md#first-deploy-smoke-test).

## Running tests and quality checks

```bash
pnpm test              # all workspaces
pnpm test:backend      # backend only (Vitest + supertest + in-memory Mongo)
pnpm test:frontend     # frontend only (Vitest + jsdom)
pnpm lint              # ESLint across both workspaces
pnpm format:check      # verify Prettier formatting
pnpm format            # apply Prettier
```

Tests do not require Docker. The backend suite uses `mongodb-memory-server`, which downloads the right Mongo binary on first run and caches it under `~/.cache/mongodb-binaries/`.

Current coverage: 309 backend tests, 147 frontend tests.

## Workspace scripts

The root `package.json` exposes workspace-wide commands. Each command uses `--if-present`, so it is safe to run before all workspace packages are scaffolded.

| Script              | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `pnpm install:all`  | Install dependencies for the whole workspace.                     |
| `pnpm dev`          | Run all workspace packages' `dev` scripts in parallel.            |
| `pnpm dev:backend`  | Run only the backend dev server.                                  |
| `pnpm dev:frontend` | Run only the frontend dev server.                                 |
| `pnpm build`        | Build all workspace packages.                                     |
| `pnpm lint`         | Lint all workspace packages.                                      |
| `pnpm test`         | Run tests across all workspace packages.                          |
| `pnpm format`       | Apply Prettier to the entire repo.                                |
| `pnpm format:check` | Verify formatting without writing.                                |
| `pnpm db:up`        | Start the MongoDB container (`docker compose up -d mongodb`).     |
| `pnpm db:down`      | Stop the MongoDB container.                                       |
| `pnpm db:logs`      | Tail MongoDB logs.                                                |
| `pnpm db:reset`     | Stop and remove the container and named volume, then start again. |

## Repository layout

```
.
  .context                          # Compact product/architecture summary
  .editorconfig                     # Cross-editor formatting baseline
  .gitignore
  .nvmrc                            # Node 24 (current Active LTS)
  .prettierrc.json
  .prettierignore
  .eslintignore
  docker-compose.yml                # Local MongoDB
  package.json                      # Root workspace scripts and devDependencies
  pnpm-workspace.yaml
  README.md                         # This file
  backend/                          # Express + Mongoose API
    .env.example
    README.md                       # Backend reference: env vars, endpoints, modules
    src/                            # app.js, server.js, config/, common/, modules/, routes/, seeders/, tests/
  frontend/                         # Vue 3 + Vite SPA
    .env.example
    README.md                       # Frontend reference
    index.html
    vite.config.js
    vitest.config.js
    src/                            # main.js, App.vue, router/, stores/, services/,
                                    # layouts/, views/, components/, features/, styles/, i18n/, tests/
  docs/
    admin-panel.md                  # Admin panel contract (Phase 13)
    architecture-decisions.md       # ADRs for stack and tooling choices
    billing-architecture.md         # Transactions, token wallet, send limits
    mercado-pago.md                 # Mercado Pago online payments (Phase 24)
    dashboard-analytics.md          # Dashboard endpoints and aggregations (Phase 10)
    known-limitations.md            # Deferred features
    media-storage.md                # Image upload/storage driver contract
    naming-conventions.md           # File, module, route, component, store, env naming
    production-readiness.md         # Pre-deploy checklist
    provider-architecture.md        # Campaign messaging adapter contract
    response-limits-and-settings.md # Response-limit settings (Phase 16)
    survey-reports.md               # Per-survey statistical reports (Phase 20)
    templates.md                    # Templates module (Phase 11)
    troubleshooting.md              # Local issues, env, seeders, smoke test
  prompts/                          # Phase prompts and shared context
  .github/workflows/                # CI workflows
```

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

Stack traces are appended to `error.details` outside `APP_ENV=production`. The full route map is exposed at `GET /api/v1` and detailed in [backend/README.md](backend/README.md).

## Naming conventions

The full reference lives in [docs/naming-conventions.md](docs/naming-conventions.md). Summary:

- **Files**: `kebab-case` for general files (`survey-service.js`), `PascalCase` for Vue components (`SurveyBuilder.vue`), `kebab-case.spec.js` or `*.test.js` for tests.
- **Backend modules**: one directory per domain under `backend/src/modules/<domain>/` containing `<domain>.routes.js`, `<domain>.controller.js`, `<domain>.service.js`, `<domain>.repository.js`, `<domain>.model.js`, `<domain>.validation.js`. Cross-cutting helpers live under `backend/src/common/`.
- **Backend routes**: REST under `/api/v1/<resource>` with kebab-case segments (`/api/v1/contact-groups`).
- **Frontend features**: directories under `frontend/src/features/<feature>/` with `views/`, `components/`, `stores/`, `services/`, and `composables/` subfolders as needed.
- **Vue components**: PascalCase, multi-word (`SurveyCard.vue`, not `Card.vue`).
- **Pinia stores**: file `use-<name>-store.js`, exported as `useXStore`.
- **Frontend services**: file `<resource>-service.js` exporting a single object with one method per endpoint.
- **Environment variables**: `SCREAMING_SNAKE_CASE`. Frontend variables exposed to the client MUST be prefixed `VITE_`.

## Troubleshooting and operational docs

- [docs/troubleshooting.md](docs/troubleshooting.md) — common local issues, seeder, env, and first-deploy smoke test.
- [docs/known-limitations.md](docs/known-limitations.md) — features intentionally deferred past Phase 23.
- [docs/production-readiness.md](docs/production-readiness.md) — pre-deploy checklist.
- [docs/response-limits-and-settings.md](docs/response-limits-and-settings.md) — response-limit configuration and account-settings API.
- [docs/survey-reports.md](docs/survey-reports.md) — per-survey statistical reports, filters, exports.
- [docs/media-storage.md](docs/media-storage.md) — image upload validation, local/S3 storage, and cleanup policy.
- [docs/team-management.md](docs/team-management.md) — tenant team membership, invitations, and ownership transfer.
- [docs/plans-and-quotas.md](docs/plans-and-quotas.md) — plan catalogue, feature gates, quota enforcement, and tenant assignment history.

## Phase workflow

Implementation was broken into numbered phases under [prompts/](prompts/). To execute or re-execute a phase:

1. Open `prompts/00-shared-context.md` and the target phase file (e.g. `prompts/phase-01-backend-foundation.md`).
2. Run the phase top to bottom, satisfying every task and verification check.
3. Do not start the next phase until the current phase Definition of Done is verified.
4. If a phase reveals that an earlier phase missed infrastructure, fix the earlier foundation in the same branch — do not work around missing architecture with duplicated code.
5. Keep code, comments, READMEs, API docs, seed labels, and developer docs in English.

Phase index:

- `00` — Project planning and repository setup.
- `01` — Backend foundation.
- `02` — Auth, users, and tenants.
- `03` — Frontend foundation.
- `04` — Surveys backend.
- `05` — Builder frontend MVP.
- `06` — Public form renderer and responses.
- `07` — Conditional logic engine.
- `08` — Contacts and groups.
- `09` — Campaigns and sending adapters.
- `10` — Dashboard and analytics.
- `11` — Templates.
- `12` — Transactions and billing history.
- `13` — Admin panel.
- `14` — Hardening.
- `15` — Campaign delivery and Twilio providers.
- `16` — Response limits and account settings.
- `17` — Navigation and responsive data grids.
- `18` — Final post-delivery hardening.
- `19` — Token wallet, send limits, and admin pricing.
- `20` — Survey statistical reports.
- `21` — Media storage for images.
- `22` — Centered fill-width layout system.
- `23` — Post billing, reports, media, and layout hardening.
- `24` — Mercado Pago online payments.
- `25` — Survey response IP and geolocation tracking.
- `26` — Team management and invitations.

## Continuous integration

A minimal GitHub Actions workflow is defined at [.github/workflows/ci.yml](.github/workflows/ci.yml). It installs dependencies with pnpm and runs `pnpm format:check`, `pnpm lint`, and `pnpm test`. Because most workspace scripts use `--if-present`, the workflow is forward-compatible.

## License

UNLICENSED. Internal project; do not distribute outside the organization without authorization.
