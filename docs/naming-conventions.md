# Naming Conventions

A single, enforceable set of rules for files, modules, routes, components, stores, services, and environment variables. When a phase prompt and this document disagree, fix the conflict in both places rather than silently diverging.

## Casing

| Style                  | Example                 | Used for                                          |
| ---------------------- | ----------------------- | ------------------------------------------------- |
| `kebab-case`           | `survey-service.js`     | File and folder names (except Vue components).    |
| `PascalCase`           | `SurveyBuilder.vue`     | Vue component files and exported component names. |
| `camelCase`            | `getSurveyById`         | Variables, functions, methods, object keys in JS. |
| `SCREAMING_SNAKE_CASE` | `JWT_ACCESS_EXPIRES_IN` | Environment variables and module-level constants. |

## Files and folders

- General source files use `kebab-case`: `auth-controller.js`, `tenant-repository.js`.
- Test files mirror the file under test and append `.spec.js` or `.test.js`: `survey-service.spec.js`.
- Vue single-file components use `PascalCase`: `SurveyCard.vue`, `EmptyState.vue`. Use multi-word component names; never `Card.vue` or `Header.vue` alone.
- Global CSS files: `theme.css`, `global.css`, `layout.css`, `utilities.css`. Feature-scoped CSS uses `kebab-case`.
- One concept per file. If a file is starting to host two unrelated exports, split it.

## Backend modules

Backend domains live under `backend/src/modules/<domain>/`. A complete domain module has the following files (omit any that have nothing to do yet):

```
backend/src/modules/<domain>/
  routes.js          # Express router; binds HTTP verbs to controller methods
  controller.js      # Thin HTTP-layer functions; no business logic
  service.js         # Business logic and orchestration
  repository.js      # Data-access functions; only place that touches Mongoose
  model.js           # Mongoose schema and model
  validation.js      # Request schemas (zod/joi/etc.) and reusable validators
  __tests__/         # Module-scoped unit and integration tests
```

Cross-cutting helpers (logger, error classes, response envelope, auth middleware) live under `backend/src/shared/` or `backend/src/middleware/`, never duplicated inside modules.

## REST routes

- All routes live under `/api/v1/`.
- Resource segments are `kebab-case` and plural: `/api/v1/surveys`, `/api/v1/contact-groups`, `/api/v1/campaigns/:id/recipients`.
- IDs in paths use the resource singular suffix `Id` only inside code (`req.params.surveyId`); URLs keep the bare segment `:id`.
- Verb usage:
  - `GET /surveys` — list
  - `GET /surveys/:id` — fetch one
  - `POST /surveys` — create
  - `PATCH /surveys/:id` — partial update
  - `PUT /surveys/:id` — full replacement (rare; prefer PATCH)
  - `DELETE /surveys/:id` — delete (soft delete where the domain calls for it)
  - `POST /surveys/:id/<action>` — domain actions (`/publish`, `/pause`, `/archive`, `/duplicate`).
- Public form routes live outside `/api/v1` because they are accessed by anonymous browsers: `/f/:slug` and `/forms/:slug`.

## Mongoose models

- Collection names are lowercase snake_case plural (Mongoose defaults from PascalCase model names work — `Survey` -> `surveys`).
- Compound entities use snake_case: `survey_versions`, `contact_groups`, `campaign_recipients`, `audit_logs`.
- Every multi-tenant model adds an index on `tenantId`. Compound indexes are declared on the schema, not added imperatively.

## Frontend features

Frontend features live under `frontend/src/features/<feature>/`. A complete feature has:

```
frontend/src/features/<feature>/
  views/            # Route-level components (one per route)
  components/       # Feature-specific reusable components
  composables/      # Composition API hooks (use<X>.js)
  stores/           # Pinia stores (use-<x>-store.js)
  services/         # API clients for this feature (<resource>-service.js)
```

Cross-feature primitives (buttons, inputs, modals, tables, layouts) live under `frontend/src/components/` and are imported by features. Avoid importing one feature's components from another feature; promote the shared piece to `frontend/src/components/` instead.

## Vue components

- File and exported name are PascalCase and identical: `SurveyBuilder.vue` exports a component named `SurveyBuilder`.
- Always multi-word — including views (`DashboardHome.vue`, not `Dashboard.vue`).
- Component prop names use camelCase in `<script setup>` and kebab-case in template attributes: `<survey-card :survey-id="id" />`.
- Emit names use kebab-case: `emit('update:model-value', value)`.

## Pinia stores

- File: `use-<name>-store.js` (kebab-case).
- Export: `useXStore` (camelCase, prefixed with `use`).
- One store per domain on the frontend (auth, surveys, campaigns, contacts, etc.). Stores own state and orchestrate services; they never make `fetch` calls directly.

Example: `frontend/src/features/auth/stores/use-auth-store.js` exports `useAuthStore`.

## Frontend services

- File: `<resource>-service.js` under the feature's `services/` directory.
- Exports a single object with one async method per endpoint, returning the unwrapped `data` from the API envelope.
- Centralize the HTTP client (axios/fetch wrapper) in `frontend/src/services/http-client.js`. Feature services import the shared client; they never call `fetch` or `axios` directly.

## Environment variables

- Always `SCREAMING_SNAKE_CASE`.
- Backend variables are unprefixed (`APP_PORT`, `MONGODB_URI`, `JWT_ACCESS_SECRET`).
- Frontend variables that must be available in the browser MUST be prefixed `VITE_` (Vite enforces this); other variables stay server-side only.
- Never check in `.env`. Always update `*.env.example` when adding or renaming variables.
- The product name is configurable: backend reads `APP_NAME`, frontend reads `VITE_APP_NAME`. Do not hardcode `Cupcake` where the runtime name is intended.

## Tests

- Test file names mirror the file under test: `survey-service.spec.js` for `survey-service.js`.
- Tests for a backend module live in `backend/src/modules/<domain>/__tests__/`.
- Tests for a frontend feature live alongside the file under test as `<file>.spec.js` (Vitest) or in a sibling `__tests__/` directory.

## Database identifiers

- Collection: snake_case plural (`survey_versions`).
- Field: camelCase (`tenantId`, `surveyId`, `versionNumber`).
- Index names: let Mongoose generate them unless a phase prompt explicitly names one.

## Imports and aliases

- Backend uses relative paths within a module and `#shared/...`-style imports (or path aliases configured in `package.json`/`tsconfig.json`) for cross-cutting helpers, once introduced in Phase 01.
- Frontend uses the `@/` alias for `frontend/src/`, configured in `vite.config.js`.

## Documentation and copy

- Source code, code comments, README files, API docs, seed labels, and developer-facing docs are written in English.
- User-facing strings live in a single i18n location (or are clearly marked for future extraction) — never inline in components.
