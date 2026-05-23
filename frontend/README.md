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

| Variable                    | Required | Default                                               | Purpose                                                                                                                                                 |
| --------------------------- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_APP_NAME`             | no       | `Cupcake`                                             | Runtime product name (do not hardcode).                                                                                                                 |
| `VITE_API_BASE_URL`         | no       | `http://localhost:4000/api/v1`                        | Base URL for every backend API request.                                                                                                                 |
| `VITE_PUBLIC_FORM_BASE_URL` | no       | `window.location.origin` (or `http://localhost:5173`) | Public form origin used to build shareable survey links (`/f/:slug`). Set this when the public form is hosted on a different domain than the dashboard. |

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
      surveys/SurveyListView.vue
      surveys/SurveyBuilderView.vue
      contacts/ContactListView.vue       # Contacts table + filters + create/edit modal
      contacts/ContactFormModal.vue      # Contact draft modal (extracted)
      contacts/ContactGroupListView.vue  # Groups + membership management
      public/PublicFormPlaceholder.vue
      ForbiddenView.vue
      NotFoundView.vue
    stores/
      auth.store.js
      builder.store.js       # Drag-and-drop builder: draft schema + persistence
      contacts.store.js      # Contacts + groups (filters, pagination, CRUD, membership)
    services/
      apiClient.js
      auth.service.js
      survey.service.js      # /surveys/* REST wrapper
      contact.service.js     # /contacts and /contact-groups REST wrappers
    features/
      builder/
        builder.constants.js # Field type catalog (label, icon, defaults)
        builder.schema.js    # ID/key generators, validator, normaliser
    components/ui/           # Reusable primitives (button, input, modal, …)
    components/builder/      # Visual builder pieces (sidebar, canvas, inspector, …)
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

### Survey builder

The visual survey builder lives at `/app/surveys/:id/edit`. From the dashboard, the **Surveys** link opens the list view, and **New survey** creates a draft and routes straight into the builder. The builder has three panes:

- **Left palette** (`BuilderSidebar`) — every supported field type grouped by category. Click a card or drag it onto the canvas to append a field.
- **Center canvas** (`BuilderCanvas`) — the form preview. Fields can be selected, duplicated, removed, and reordered via the inline toolbar. Drag the handle on the left of any field to move it within the form; drop targets are highlighted while a drag is in flight.
- **Right inspector** (`BuilderInspector`) — edits the selected field's label, placeholder, help text, key, required flag, width, options, and basic validation rules. With no field selected, the inspector exposes survey-level metadata (title, description, slug) and layout (single page vs. paginated, progress bar).

State lives in `stores/builder.store.js`. The store exposes the actions required by the phase prompt: `addField`, `removeField`, `duplicateField`, `selectField`, `updateField`, `reorderFields`, `addOption`, `updateOption`, `removeOption`, `validateSchema`, `saveDraft`, and `publishSurvey`. Drag/drop transient state stays in the canvas component — the store is only mutated when a gesture lands.

#### Schema validation

`features/builder/builder.schema.js` mirrors the backend Zod validator in `backend/src/modules/surveys/form-schema.validator.js`. It provides:

- `generateFieldId()`, `generateOptionId()`, `generateSectionId()` — collision-resistant ids.
- `slugifyFieldKey(label)` — backend-safe field key (`/^[a-z0-9_]+$/`).
- `buildDefaultField(type, { existingKeys })` — a field shaped exactly like the API expects, with unique key.
- `validateFormSchema(schema)` — returns an array of `{ path, message }` issues; empty means the schema is safe to send.
- `normalizeSchemaForApi(schema)` — strips internal-only fields (option `id`, presentational `key`) and reassigns `order` from array position.

The backend remains the authoritative validator on save — the client-side pass exists to give immediate inline feedback and to avoid round-tripping a payload the backend is guaranteed to reject.

#### Unsaved changes

The builder tracks `isDirty` on every mutating action and warns the user before:

- navigating to another route (via `beforeRouteLeave`), and
- closing/reloading the tab (via `beforeunload`).

`saveDraft()` always runs the client validator first; `publishSurvey()` auto-saves dirty drafts before calling the backend publish endpoint. The publish endpoint is the real backend route — there is no fake local "published" state.

### Public form renderer

Public surveys are reachable at `/f/:slug` (canonical) and `/forms/:slug` (alias) without an auth session. The `/f/:slug/r/:submissionToken` and `/forms/:slug/r/:submissionToken` variants render the same form but carry a campaign submission token through to the response payload.

- `views/public/PublicFormView.vue` — loads the published schema via `publicFormService.get(slug)` (or `getByToken(slug, token)`), tracks per-field state and errors, validates on submit, and posts the response.
- `views/public/PublicThankYouView.vue` — success state showing the configured `thankYouMessage`.
- `components/public-form/PublicFieldRenderer.vue` — interactive renderer for the supported field types (text/long text/email/phone/number/date/time/select/radio/checkbox group/checkbox/yes-no/rating/nps/file/hidden) plus the presentational blocks (section title, text block, image, divider, page break).
- `features/public-form/answers.js` — `buildInitialAnswers`, `validateAnswers`, and `serializeAnswers` mirror the backend rules in `backend/src/modules/public-forms/answer.validator.js`. The backend stays authoritative — server-side validation errors are mapped back onto the same field-level keys.
- `services/survey.service.js` exports `publicFormService` (`get`, `getByToken`, `submit`). It uses the shared `apiClient`, so the unauthenticated public routes still benefit from the global error envelope.

Paused surveys render the configured paused message and disable the submit button. Draft/archived surveys show a "no longer available" state. Submission failures (validation/conflict/network/rate-limit) surface as a banner above the form and, for validation, are mapped to per-field error messages.

### Contacts and contact groups

The contacts module is reachable from the dashboard sidebar when the caller has the matching permission:

- `Contacts` (`/app/contacts`) — list view with filters (`search`, `status`, `channel`, `group`, `tag`), pagination, soft-archive and hard-delete actions, and a side-by-side modal for create/edit. Each row shows per-channel pills (Email / SMS / WhatsApp) coloured by the backend's `channels` block so users can see at a glance which contacts are eligible for which delivery type.
- `Contact groups` (`/app/contact-groups`) — create/rename/archive groups, plus a "Manage members" modal that toggles individual contacts in or out of the group. Member counts come straight from the backend so the table stays in sync after every change.

State lives in `stores/contacts.store.js`. The store wraps `services/contact.service.js` (which mirrors the `/contacts` and `/contact-groups` REST routes) and exposes actions for fetching, paging, creating, updating, archiving, hard-deleting, group membership management, and a placeholder bulk-import hook that matches the backend's "pending implementation" response shape. Routes are guarded by `meta.permissions: ['contacts.manage']` and `['groups.manage']`.

### Reusable UI components

`src/components/ui/` ships ten base primitives: `AppButton`, `AppInput`, `AppTextarea`, `AppSelect`, `AppModal`, `AppTable`, `AppCard`, `AppBadge`, `AppAlert`, `AppLoader`. Import them through the barrel:

```js
import { AppButton, AppCard, AppAlert } from '@/components/ui';
```

Props are documented inline at the top of each component file. Components rely on the theme tokens, so visual changes propagate from `theme.css`.

#### Responsive data tables

`AppTable` is the single table component every feature view consumes. It wraps a native `<table>` inside a scroll container so wide column sets scroll horizontally without breaking layout, long lists scroll vertically inside a bounded body (set via the `max-height` prop), and the header row stays pinned to the top while the body scrolls. It also exposes a unified loading, empty, and error state so feature views never roll their own placeholder rows.

```vue
<AppTable
  :columns="[
    { key: 'name', label: 'Name' },
    { key: 'actions', label: '', sticky: 'right' },
  ]"
  :rows="rows"
  :loading="isLoading"
  :error="errorMessage"
  empty="No contacts yet."
  max-height="65vh"
>
  <template #cell:actions="{ row }">
    <AppButton size="sm" @click="open(row)">Open</AppButton>
  </template>
</AppTable>
```

Column options: `key`, `label`, `align`, `width`, `minWidth`, and `sticky: 'left' | 'right'` for action columns that should remain reachable during horizontal scrolling. Override any cell with the `#cell:<key>` scoped slot; the slot receives `{ row, value }`.

### Authenticated shell

`DashboardLayout` provides the topbar + sidebar chrome that hosts every authenticated view.

- The topbar uses `position: sticky` so it stays visible while users scroll long pages and data tables. The z-index hierarchy is centralised in `theme.css` (`--layout-z-topbar`, `--layout-z-sidebar`, `--layout-z-dropdown`, `--layout-z-modal`) so modals and table headers stack predictably above the topbar.
- The sidebar is collapsible. The dedicated collapse toggle (desktop only) shrinks the nav to icon-only, and the preference persists in `localStorage` under `cupcake.layout.sidebarCollapsed`. The collapsed state never affects route resolution or active-route highlighting.
- On mobile (≤768px) the sidebar slides in over the content via the existing hamburger button; the desktop collapse toggle is hidden.
- Nav items honour the existing role/permission guards, so only the routes the user can reach are rendered.

### Centered fill-width layout system

Every authenticated view renders inside a centered `.app-page` shell so the dashboard never sticks to the left edge on wide monitors and never overflows on phones. The shell is owned by `DashboardLayout` (and mirrored by `PublicFormLayout` for unauthenticated surveys); individual views must not declare a page-level `max-width`.

The width cap is driven by `route.meta.layout`:

| `meta.layout` | Max width                             | Use for                                              |
| ------------- | ------------------------------------- | ---------------------------------------------------- |
| _(omitted)_   | `--layout-content-max-width` (110rem) | Default lists, dashboards, reports, data-heavy views |
| `'reading'`   | `--layout-reading-max-width` (64rem)  | Settings, single-record forms, tenant edit screens   |
| `'narrow'`    | `--layout-narrow-max-width` (36rem)   | Single-column forms (public form layout uses this)   |
| `'full'`      | unbounded                             | Builder / multi-pane workspaces                      |

How it works:

- `DashboardLayout.__main` is a flex row with `justify-content: center` and responsive `padding-inline` (`--layout-page-padding-x` desktop, `--layout-page-padding-x-sm` mobile). The `full` layout drops inline padding so the builder fills the screen.
- The inner `dashboard-layout__shell` always carries `.app-page` plus the modifier derived from `route.meta.layout`. An unknown value falls back to default.
- Views render their flex column inside the shell with `width: 100%` (default flex behaviour) so they always fill the centered band.
- `PublicFormLayout` reuses the same `.app-page` primitive with the `narrow` modifier and applies its own background; `AuthLayout` keeps its bespoke 28rem auth panel since it predates the system and serves a different chrome.

To pick a layout, set the meta on the route definition:

```js
{
  path: 'surveys/:id/edit',
  name: 'surveys.builder',
  component: SurveyBuilderView,
  meta: { layout: 'full', requiresAuth: true, permissions: ['surveys.update'] },
}
```

### Responsive layout QA notes

Verified visually and via component tests at the canonical breakpoints:

| Breakpoint      | Width band      | Expectation                                                                                                           |
| --------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Mobile          | ≤480px          | Single column; sidebar hidden behind the hamburger; main padding shrinks to `--space-4`.                              |
| Small tablet    | 481px – 768px   | Same mobile chrome; tables scroll horizontally inside their container.                                                |
| Tablet / laptop | 769px – 1199px  | Sidebar visible; content fills available width up to 110rem; default and reading layouts visibly centered.            |
| Desktop         | 1200px – 1599px | Default layout still tracks viewport width minus padding; reading layout caps at 64rem.                               |
| Large desktop   | ≥1600px         | Default layout caps at 110rem with auto gutters; builder (`full`) breaks out and uses full width minus block padding. |

Manual checks per surface:

- **Dashboard / list views** (default) — header row stays right-aligned with the action button on the right; data tables scroll horizontally inside their card.
- **Builder** (`full`) — three-pane workspace fills the viewport; collapsing the sidebar increases the canvas width as before.
- **Settings / tenant create / tenant detail** (`reading`) — forms stay centered with readable line lengths even at 2560px.
- **Public form** (`narrow`) — the form card stays centered with breathing room above the footer at any viewport.
- **NotFound / Forbidden** — render outside the dashboard shell (top-level routes); kept as-is.

`tests/components/DashboardLayout.test.js` asserts that the `app-page` modifier follows `route.meta.layout` for default, full, reading, and unknown values so accidental layout regressions surface in CI.

### Public survey links

Authenticated views build shareable public form URLs via `buildPublicSurveyUrl(slug, { status })` from `src/config/env.js`. The helper:

- Reads `VITE_PUBLIC_FORM_BASE_URL` and falls back to `window.location.origin`.
- Validates the slug against the same lowercase/`-` pattern the backend enforces.
- Returns `null` for surveys that should not expose a public link (`draft`/`archived` or missing slug), so call sites can render a disabled "unavailable" state instead of a broken URL.

The surveys list uses this helper to render a "Open public form" action that opens the survey in a new tab with `target="_blank"` and `rel="noopener noreferrer"`.

## Testing

Vitest runs the suite under `src/tests/`. The setup file clears Pinia/localStorage/global mocks between tests. The current coverage includes:

- `auth.store.test.js` — login, logout, transparent refresh, persistence.
- `guards.test.js` — auth + role + permission resolution.
- `components/AppButton.test.js` — UI primitive behaviour.
- `components/AppTable.test.js` — responsive table empty/loading/error states, max-height scroll, sticky column markers, and scoped cell slots.
- `components/DashboardLayout.test.js` — sidebar collapse toggle, localStorage persistence, restoration on mount, and super-admin nav links.
- `components/SurveyListView.test.js` — public-open survey action wires the configured base URL with `target="_blank"` and disables the action for drafts.
- `config-env.test.js` — `buildPublicSurveyUrl` slug validation, status gating, and base URL handling.
- `builder.schema.test.js` — id/key generation, validator rules, schema normalisation.
- `builder.store.test.js` — add/remove/duplicate/reorder/option actions, validation gate, save and publish round-trips against a mocked `fetch`.
- `public-form-answers.test.js` — public-form `buildInitialAnswers`, `validateAnswers`, and `serializeAnswers` helpers.
- `contacts.store.test.js` — contact store fetch/filter/create/archive/group-delete flows against a mocked `fetch`.
- `components/PublicFormView.test.js` — load/render/submit/error flows for `PublicFormView` against a mocked `fetch`.

Add new component tests under `src/tests/components/` and new store tests alongside the existing files.

## Building for production

```bash
pnpm build
pnpm preview # http://localhost:4173
```

The build emits to `dist/`. Configure `VITE_APP_NAME` and `VITE_API_BASE_URL` in the deployment environment before running `pnpm build` so the static bundle has the right base URL.
