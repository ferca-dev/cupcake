# Phase 03 - Frontend Foundation

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-02.

## Goal

Create a Vue 3 frontend foundation with routing, Pinia, authentication flow, layouts, global theme, and reusable UI components.

## Scope

Build the frontend shell and auth screens. Do not build survey, builder, contact, campaign, or analytics features yet except placeholder routes where needed.

## Tasks

- Initialize Vue 3 with Vite.
- Configure Vue Router.
- Configure Pinia.
- Create a centralized API client using `VITE_API_BASE_URL`.
- Create auth service and auth store.
- Implement token persistence and refresh behavior according to backend auth transport.
- Create route guards for authentication and role checks.
- Create `AuthLayout`, `DashboardLayout`, and `PublicFormLayout`.
- Create `LoginView`, `RegisterView`, and `ForgotPasswordView`.
- Create a dashboard shell route for authenticated users.
- Create base UI components: button, input, textarea, select, modal, table, card, badge, alert, loader.
- Create `theme.css`, `global.css`, `layout.css`, and `utilities.css`.
- Add i18n-ready string organization with `src/i18n/en.js` and `src/i18n/es.js` or a documented lightweight alternative.
- Add frontend tests for auth store behavior, route guards, and at least one UI component.
- Update frontend README or root README in English.

## Required Frontend Shape

```txt
frontend/
  src/
    main.js
    App.vue
    router/
      index.js
      guards.js
    stores/
      auth.store.js
    services/
      apiClient.js
      auth.service.js
    layouts/
      AuthLayout.vue
      DashboardLayout.vue
      PublicFormLayout.vue
    views/
      auth/
        LoginView.vue
        RegisterView.vue
        ForgotPasswordView.vue
      dashboard/
        DashboardView.vue
    components/
      ui/
    styles/
      theme.css
      global.css
      layout.css
      utilities.css
    i18n/
      en.js
      es.js
```

## Infrastructure Details Not To Miss

- Do not hardcode the API base URL.
- Do not hardcode the app name.
- Do not duplicate HTTP error handling in every view.
- Protect authenticated routes with guards.
- Show clear form validation and backend error messages.
- Use CSS variables from `theme.css`; avoid repeated hardcoded colors.
- Keep UI component props documented through code comments or component structure in English.
- Make layouts responsive from the start.

## Verification

- Run frontend lint if configured.
- Run frontend tests.
- Start backend and frontend together.
- Register a client account from the UI.
- Log in using seeded demo client.
- Refresh the browser and verify session behavior.
- Verify protected routes redirect unauthenticated users.

## Definition of Done

- Login works against the backend.
- Registration works against the backend.
- Session state persists according to the chosen token strategy.
- Protected routes and role guards are functional.
- Base UI and CSS foundation are ready for later phases.
