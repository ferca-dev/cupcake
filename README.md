# Cupcake

Cupcake is a multi-tenant SaaS platform for creating, sending, answering, and analyzing surveys and online forms. Tenants build surveys with a visual drag-and-drop editor, distribute them through email, SMS, and WhatsApp, collect public responses via unique slugs, and analyze results in dashboards.

> All source code, comments, and developer-facing documentation in this repository are written in English. User-facing strings are centralized or prepared for future internationalization.

## Status

Phase 00 — repository foundation. The `backend/` and `frontend/` application packages will be initialized in later phases. See [Phase workflow](#phase-workflow) below.

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

- **Node.js** matching `.nvmrc` (Node 24, the current Active LTS as of project start). With `nvm`: `nvm use`.
- **pnpm** version 10 or later. Install via `corepack enable && corepack prepare pnpm@10.25.0 --activate` or `npm install -g pnpm`.
- **Docker Desktop** (or Docker Engine + Compose v2) for the local MongoDB container.
- **Git**.

Default ports used by the project:

| Service  | Port    |
| -------- | ------- |
| Backend  | `4000`  |
| Frontend | `5173`  |
| MongoDB  | `27017` |

## Local setup

```bash
# 1. Install root dev dependencies and any workspace packages that exist.
pnpm install

# 2. Copy environment templates (do this for each workspace package once it exists).
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start local MongoDB in the background.
pnpm db:up

# 4. (Later phases) Start the apps.
pnpm dev
```

Stop infrastructure with `pnpm db:down`. Reset the local database (drops the named volume) with `pnpm db:reset`.

MongoDB connection string for local development:

```
mongodb://localhost:27017/cupcake
```

## Root scripts

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
  .prettierrc.json                  # Prettier configuration
  .prettierignore
  .eslintignore
  docker-compose.yml                # Local MongoDB
  package.json                      # Root workspace scripts and devDependencies
  pnpm-workspace.yaml               # pnpm workspace definition
  README.md                         # This file
  backend/                          # Backend package (initialized in Phase 01)
    .env.example                    # Required backend environment variables
  frontend/                         # Frontend package (initialized in Phase 03)
    .env.example                    # Required frontend environment variables
  docs/
    architecture-decisions.md       # ADRs for stack and tooling choices
    naming-conventions.md           # File, module, route, component, store, env naming
  prompts/                          # Phase prompts and shared context
  .github/workflows/                # CI workflows
```

## Environment variables

Backend (`backend/.env.example`) and frontend (`frontend/.env.example`) are kept separate. Always commit the `*.env.example` templates; never commit a populated `.env`.

The shared product name is configurable:

- Backend reads `APP_NAME`.
- Frontend reads `VITE_APP_NAME`.

Source code MUST NOT hardcode `Cupcake` where the runtime app name is intended. The default value lives only in environment defaults or documented examples.

See [prompts/00-shared-context.md](prompts/00-shared-context.md) for the full list of required environment variables.

## Naming conventions

The full reference lives in [docs/naming-conventions.md](docs/naming-conventions.md). Summary:

- **Files**: `kebab-case` for general files (`survey-service.js`), `PascalCase` for Vue components (`SurveyBuilder.vue`), `kebab-case.spec.js` or `*.test.js` for tests.
- **Backend modules**: one directory per domain under `backend/src/modules/<domain>/` containing `routes.js`, `controller.js`, `service.js`, `repository.js`, `model.js`, `validation.js`, and `__tests__/`.
- **Backend routes**: REST under `/api/v1/<resource>` with kebab-case segments (`/api/v1/contact-groups`).
- **Frontend features**: directories under `frontend/src/features/<feature>/` with `views/`, `components/`, `stores/`, `services/`, and `composables/` subfolders as needed.
- **Vue components**: PascalCase, multi-word (`SurveyCard.vue`, not `Card.vue`).
- **Pinia stores**: file `use-<name>-store.js`, exported as `useXStore`.
- **Frontend services**: file `<resource>-service.js` exporting a single object with one method per endpoint.
- **Environment variables**: `SCREAMING_SNAKE_CASE`. Frontend variables exposed to the client MUST be prefixed `VITE_`.

## Phase workflow

Implementation is broken into numbered phases under [prompts/](prompts/). To execute a phase:

1. Open `prompts/00-shared-context.md` and the target phase file (e.g. `prompts/phase-01-backend-foundation.md`).
2. Run the phase top to bottom, in order, satisfying every task and verification check.
3. Do not start the next phase until the current phase Definition of Done is verified.
4. If a phase reveals that a previous phase missed infrastructure or a cross-cutting concern, fix the earlier foundation in the same branch before continuing. Do not work around missing architecture with duplicated code.
5. Keep source code, code comments, README files, API docs, inline docs, seed labels, and developer-facing documentation in English.

Phase index:

- `00` — Project planning and repository setup (this phase).
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

## Continuous integration

A minimal GitHub Actions workflow is defined at [.github/workflows/ci.yml](.github/workflows/ci.yml). It installs dependencies with pnpm, runs `pnpm format:check`, `pnpm lint`, and `pnpm test`. Because most workspace scripts use `--if-present`, the workflow is forward-compatible: it does nothing until packages add the matching scripts.

## License

UNLICENSED. Internal project; do not distribute outside the organization without authorization.
