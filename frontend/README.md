# Cupcake Frontend

Vue 3 + Vite single-page app for the Cupcake survey platform. This package is part of the pnpm workspace defined at the repository root.

## Prerequisites

- Node.js matching the root `.nvmrc` (Node 24 active LTS).
- pnpm 10+ (Corepack: `corepack enable && corepack prepare pnpm@10.25.0 --activate`).
- A running backend exposing `/api/v1` (defaults to `http://localhost:4000/api/v1`).

## Setup

```bash
# From the repository root
pnpm install
cp frontend/.env.example frontend/.env
pnpm dev:frontend
```

Vite serves the SPA on port `5173`. Run the backend in another terminal (`pnpm dev:backend`) or use `pnpm dev` from the repo root to run both packages in parallel.

## Scripts

| Script            | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `pnpm dev`        | Start the Vite dev server with HMR.                  |
| `pnpm build`      | Produce a production build under `dist/`.            |
| `pnpm preview`    | Preview the production build locally on port `4173`. |
| `pnpm lint`       | Run ESLint over the frontend sources.                |
| `pnpm lint:fix`   | ESLint with autofix.                                 |
| `pnpm test`       | Run the Vitest suite once.                           |
| `pnpm test:watch` | Vitest in watch mode while iterating.                |

Run any script from the repo root via `pnpm --filter ./frontend run <script>` or use the root aliases (`pnpm dev:frontend`, `pnpm lint:frontend`, `pnpm test:frontend`).

## Environment variables

The frontend reads only the variables listed below. They are exposed through `src/config/env.js`; views and services must import from there instead of reading `import.meta.env` directly.

| Variable            | Required | Default                        | Purpose                                 |
| ------------------- | -------- | ------------------------------ | --------------------------------------- |
| `VITE_APP_NAME`     | no       | `Cupcake`                      | Runtime product name (do not hardcode). |
| `VITE_API_BASE_URL` | no       | `http://localhost:4000/api/v1` | Base URL for every backend API request. |

The full template lives in [`.env.example`](./.env.example).

## Project layout

```
frontend/
  index.html
  vite.config.js
  vitest.config.js
  eslint.config.js
  src/
    main.js                  # Bootstrap: Pinia → auth.initialize() → router → mount
    App.vue                  # Top-level RouterView host
    config/env.js            # Single source of truth for VITE_* variables
    router/
      index.js               # Route table + per-navigation title handling
      guards.js              # auth/role/permission guard composition
    stores/
      auth.store.js          # Pinia store: session, tokens, refresh, permissions
    services/
      apiClient.js           # fetch wrapper with bearer + transparent refresh
      auth.service.js        # /auth/* endpoints
    layouts/
      AuthLayout.vue         # Sign-in / sign-up / forgot-password chrome
      DashboardLayout.vue    # Authenticated shell with sidebar + topbar
      PublicFormLayout.vue   # Public form chrome (Phase 06 will fill it)
    views/
      auth/{Login,Register,ForgotPassword}View.vue
      dashboard/DashboardView.vue
      public/PublicFormPlaceholder.vue
      ForbiddenView.vue
      NotFoundView.vue
    components/ui/           # Reusable primitives (button, input, modal, …)
    styles/
      theme.css              # CSS custom properties (colours, spacing, …)
      global.css             # Base element styles + resets
      layout.css             # Container, stack, grid, page helpers
      utilities.css          # Single-purpose utilities (.text-muted, .mt-3, …)
    i18n/
      en.js                  # English string bundle
      es.js                  # Spanish string bundle (mirrors en.js)
      index.js               # Lightweight `t(key, vars)` helper + `useI18n`
    tests/
      setup.js               # Vitest setup: clears Pinia/localStorage/mocks
      auth.store.test.js     # Auth store behaviour (login, refresh, persistence)
      guards.test.js         # Router guard outcomes by role/permission
      components/AppButton.test.js
```

## Architectural notes

### Auth transport

The backend issues two JWTs on every successful `/auth/register`, `/auth/login`, and `/auth/refresh` call:

- **Access token** — sent as `Authorization: Bearer <token>` on every request.
- **Refresh token** — sent in the `/auth/refresh` body (the backend also accepts it via `X-Refresh-Token`). Refresh rotation: each refresh revokes the presented token and issues a fresh pair, and replay of a revoked token invalidates all of the user's active sessions.

Tokens are persisted to `localStorage` under `cupcake.auth.session`. On boot, `main.js` awaits `useAuthStore().initialize()` before installing the router, so the very first guard evaluation has accurate session state. `initialize()` calls `/auth/me` to verify the persisted access token; if the call fails with 401 the API client transparently calls `/auth/refresh` and retries once.

### Centralised API client

`services/apiClient.js` is the single fetch wrapper used by every service. It:

- Resolves the base URL from `VITE_API_BASE_URL`.
- Attaches the bearer token via an injected `authProvider` so it does not import the store (avoiding a circular dependency).
- Normalises HTTP errors into `ApiError` with `status`, `code`, `message`, `details`, plus helpers (`isAuth`, `isValidation`, `isForbidden`, `isRateLimited`, `isNetwork`).
- Performs a single-flight refresh on 401 responses and retries the original request once.
- Returns the parsed JSON body (success envelope) — services pluck `data` and views never touch the envelope directly.

### Route guards

`router/guards.js` exposes three composable guards installed as a single `beforeEach`:

- `authGuard` — `meta.requiresAuth` blocks anonymous visitors (redirect to `/auth/login?redirect=...`). `meta.requiresGuest` blocks authenticated visitors (sends them to the dashboard).
- `roleGuard` — `meta.roles: ['client_admin', 'super_admin']` requires one of the listed roles. Super admin always passes.
- `permissionGuard` — `meta.permissions: ['surveys.view']` requires every listed permission. Super admin always passes.

Layouts and routes already wire this up: `/auth/*` carries `requiresGuest: true`, `/app/*` carries `requiresAuth: true`.

### Theming

All colours, spacing, radii, and shadows are CSS custom properties declared in `styles/theme.css`. Components style themselves through `var(--token)` references — never hardcode HEX values. Dark-mode tokens live alongside the light tokens under `[data-theme='dark']` so the app can later flip themes from a single attribute.

### Internationalisation

`i18n/en.js` and `i18n/es.js` mirror each other key-for-key. `i18n/index.js` exports `useI18n()` with a reactive `t(key, vars)` helper, falls back to English when a key is missing, and persists the selected locale in `localStorage`. Views never inline user-facing strings — they call `t('section.key')` so a future swap to `vue-i18n` can happen without touching the templates.

### Reusable UI components

`src/components/ui/` ships ten base primitives: `AppButton`, `AppInput`, `AppTextarea`, `AppSelect`, `AppModal`, `AppTable`, `AppCard`, `AppBadge`, `AppAlert`, `AppLoader`. Import them through the barrel:

```js
import { AppButton, AppCard, AppAlert } from '@/components/ui';
```

Props are documented inline at the top of each component file. Components rely on the theme tokens, so visual changes propagate from `theme.css`.

## Testing

Vitest runs the suite under `src/tests/`. The setup file clears Pinia/localStorage/global mocks between tests. The current coverage focuses on the auth store (login, logout, transparent refresh, persistence), the router guards (auth + role + permission resolution), and the `AppButton` UI primitive. Add new component tests under `src/tests/components/`.

## Building for production

```bash
pnpm build
pnpm preview # http://localhost:4173
```

The build emits to `dist/`. Configure `VITE_APP_NAME` and `VITE_API_BASE_URL` in the deployment environment before running `pnpm build` so the static bundle has the right base URL.
