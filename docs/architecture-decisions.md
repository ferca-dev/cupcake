# Architecture Decisions

Short ADRs for foundational tooling choices. Decisions are revisited when constraints change, not as a matter of routine.

## ADR-001: Express as the backend framework

**Date**: Phase 00.
**Status**: Accepted.

### Context

The shared context requires Node.js + REST under `/api/v1` and instructs us to default to Express unless there is a documented technical reason to choose another framework.

### Decision

Use **Express 5** as the HTTP framework.

### Reasoning

- Largest ecosystem of middleware (helmet, express-rate-limit, cors, compression, multer, etc.), which directly maps to the security rules in the shared context.
- Familiar request/response model lowers onboarding cost for contributors who already know Node.
- First-class compatibility with `mongoose`, validation libraries (`zod`, `joi`, `express-validator`), and most observability tooling.
- No requirement in the product spec demands the performance or schema features of Fastify or NestJS that would offset their additional complexity.

### Alternatives considered

- **Fastify**: faster on synthetic benchmarks, but our workload is dominated by Mongo round-trips, not framework overhead. The plugin model is also less familiar to the team.
- **NestJS**: heavier framework with opinionated DI; conflicts with the "modular by domain, small cohesive units" rule and adds learning surface area for marginal benefit at this stage.
- **Koa / Hapi**: smaller ecosystems and less alignment with current best-practice middleware stacks.

### Consequences

- Backend modules will be plain Express routers grouped by domain (see `docs/naming-conventions.md`).
- Security middleware (Helmet, rate limiting, CORS, body parsers) is added once at the app composition layer and reused everywhere.
- If we later need streaming/SSE-heavy endpoints or strict schema-driven routing, we can host them in isolated modules or revisit this ADR.

## ADR-002: Mongoose as the MongoDB ODM

**Date**: Phase 00.
**Status**: Accepted.

### Context

The shared context mandates MongoDB and names Mongoose explicitly. The decision is recorded here for traceability.

### Decision

Use **Mongoose** as the ODM for all backend models.

### Reasoning

- Mature ODM with schema enforcement, middleware (hooks), and population — directly useful for the tenancy, lifecycle, and validation rules in the shared context.
- Mongoose schemas double as the source of truth for indexes, which the shared context requires per entity (unique `slug`, `tenantId`, compound `surveyId + versionNumber`, etc.).
- Strong community support, well-documented patterns for multi-tenant scoping.

### Alternatives considered

- **Native MongoDB driver only**: more performant per call but pushes schema, validation, and index management into hand-written code, increasing the risk of inconsistent tenant scoping.
- **Prisma (Mongo connector)**: schema-first and ergonomic, but the Mongo connector is still maturing and lacks some Mongoose features (population, middleware) that we rely on.
- **TypeORM**: weaker MongoDB story than Mongoose.

### Consequences

- Models live under `backend/src/modules/<domain>/model.js` and export a Mongoose model bound to a domain-scoped schema.
- Repositories wrap Mongoose queries so business code interacts with `find/findOne/create/update` style functions and never reaches into the driver layer.
- All multi-tenant collections add `tenantId` indexes at the schema level.

## ADR-003: pnpm workspaces as the package manager

**Date**: Phase 00.
**Status**: Accepted.

### Context

The shared context requires "one workspace package manager, consistently, documented in the root README".

### Decision

Use **pnpm** (`>=10`) with `pnpm-workspace.yaml`.

### Reasoning

- Content-addressed store avoids the duplicated dependency trees common with npm/yarn classic, which keeps CI installs fast even as both `backend/` and `frontend/` add dependencies.
- Strict node_modules layout surfaces accidental cross-package imports early.
- First-class workspace filtering (`pnpm --filter ./backend run dev`) maps cleanly onto the root scripts we expose.
- Already installed in the local dev environment.

### Consequences

- The package manager is pinned via `packageManager` in the root `package.json` and via `engines.pnpm`.
- All root scripts that dispatch to packages use `pnpm --filter ./<pkg> --if-present` or `pnpm -r --if-present`, so they are safe to run before later phases scaffold the packages.

## ADR-004: Docker Compose for local MongoDB

**Date**: Phase 00.
**Status**: Accepted.

### Context

The shared context requires that local MongoDB be startable without installing MongoDB directly on the host.

### Decision

Ship a `docker-compose.yml` at the repository root with a single `mongodb` service (image `mongo:7.0`), a named volume `cupcake_mongodb_data`, and a healthcheck.

### Reasoning

- Compose v2 is bundled with Docker Desktop and standard on Linux installs.
- A named volume keeps data persistent across `docker compose down` while still letting us nuke state with `pnpm db:reset`.
- Healthcheck enables future `depends_on: condition: service_healthy` wiring once we add the backend to Compose.

### Consequences

- Local connection string is the standard `mongodb://localhost:27017/cupcake`.
- We deliberately do not bind a host volume path; the named volume avoids permission surprises across operating systems and keeps Mongo's storage engine happy.

## ADR-005: CI runs `format:check`, `lint`, and `test` via GitHub Actions

**Date**: Phase 00.
**Status**: Accepted.

### Context

The phase checklist asks for a minimal CI workflow or an explanation of why CI is deferred.

### Decision

Add a single GitHub Actions workflow at `.github/workflows/ci.yml` that installs dependencies with pnpm (via `corepack`) and runs `pnpm format:check`, `pnpm lint`, and `pnpm test`.

### Reasoning

- The scripts already exist at the root and use `--if-present`, so the workflow is forward-compatible: it stays green while phases scaffold packages and starts enforcing real checks as the packages add scripts.
- One workflow is enough at this stage; we can split lint/test/build into a matrix once the test surface grows.

### Consequences

- Pushes to `main` and `develop`, and all pull requests, run the workflow on Node 24.
- Future phases that add new quality gates should extend this workflow rather than create a parallel one.
