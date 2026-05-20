# Phase 01 - Backend Foundation

## Required Context

Read `prompts/00-shared-context.md` and inspect the repository output from Phase 00.

## Goal

Create a working Node.js backend connected to MongoDB with security middleware, consistent responses, centralized errors, logging, configuration, and a health endpoint.

## Scope

Do not implement authentication, users, tenants, or domain modules yet except for shared infrastructure.

## Tasks

- Initialize the backend package with Express, Mongoose, validation tooling, test tooling, linting, and formatting.
- Create `src/app.js` and `src/server.js` with clean separation between app creation and process startup.
- Implement environment loading and validation in `src/config/env.js`.
- Implement MongoDB connection management in `src/config/database.js`.
- Add security middleware: Helmet, CORS from env, request size limits, basic input hardening, and rate limit primitives.
- Add a global error type hierarchy and global error handler.
- Add a consistent API response helper.
- Add request logging appropriate for development without logging secrets.
- Add `GET /api/v1/health`.
- Add `GET /api/v1` or equivalent API metadata endpoint if useful.
- Add test harness and at least one test for the health endpoint and error response shape.
- Update backend README or root README with backend setup, scripts, and env requirements.

## Required Backend Shape

```txt
backend/
  src/
    app.js
    server.js
    config/
      env.js
      database.js
      security.js
    common/
      errors/
      middlewares/
      responses/
      utils/
      constants/
    modules/
      health/
        health.routes.js
        health.controller.js
    tests/
  package.json
  .env.example
```

## Infrastructure Details Not To Miss

- Server startup must fail fast when required env vars are missing.
- Tests must be runnable without requiring a production database.
- Database connection errors must be handled clearly.
- API responses must follow the shared success/error envelope.
- CORS must allow the configured frontend URL.
- Health must report application status without leaking secrets.
- Add graceful shutdown for server and MongoDB connection.

## Verification

- Run install if dependencies changed.
- Run backend lint if configured.
- Run backend tests.
- Start MongoDB with Docker Compose.
- Start the backend and verify `GET /api/v1/health`.
- Confirm production error responses do not expose stack traces.

## Definition of Done

- Backend starts locally.
- MongoDB connection works.
- `GET /api/v1/health` returns a consistent success response.
- Unknown routes and thrown errors return a consistent error response.
- Backend setup is documented in English.
