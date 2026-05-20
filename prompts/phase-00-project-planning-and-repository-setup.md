# Phase 00 - Project Planning and Repository Setup

## Required Context

Read `prompts/00-shared-context.md` before starting.

## Goal

Create the initial monorepo foundation for Cupcake with repeatable local development infrastructure, shared project conventions, and clear English documentation.

## Scope

Set up only the repository foundation. Do not implement product features yet.

## Tasks

- Create `frontend/` and `backend/` directories.
- Create a root README in English with project overview, stack, prerequisites, local setup, scripts, and phase workflow.
- Create `.context` in the repository root using the shared product and architecture rules.
- Create `.gitignore`, `.editorconfig`, and formatting/linting defaults.
- Choose and document one package manager for the workspace.
- Add root workspace scripts for installing, linting, testing, formatting, and running frontend/backend when those packages exist.
- Add `.nvmrc` or equivalent Node version documentation using the current active LTS at implementation time.
- Add Docker Compose for local MongoDB, including a named volume and a documented connection string.
- Add `backend/.env.example` and `frontend/.env.example` with all required variables from shared context.
- Add an explicit naming convention section for files, modules, routes, components, stores, services, and environment variables.
- Add a short architecture decision note explaining the backend framework and ODM choice.
- Add a minimal CI workflow if the repository uses GitHub Actions or document why CI is deferred.

## Infrastructure Details Not To Miss

- Local MongoDB must be startable without installing MongoDB directly on the host.
- Environment examples must not contain real secrets.
- The root README must explain how future phases should be executed.
- `.context` must state that code and developer docs are English-only.
- Keep frontend and backend environment variables separate.
- Document default ports: backend `4000`, frontend `5173`, MongoDB `27017`.

## Expected File Shape

```txt
.
  .context
  .editorconfig
  .env.example optional only if useful at root
  .gitignore
  .nvmrc
  docker-compose.yml
  README.md
  package.json
  backend/
    .env.example
  frontend/
    .env.example
  prompts/
```

## Verification

- Confirm Docker Compose configuration is syntactically valid.
- Confirm root scripts do not fail because of missing packages; placeholder scripts are acceptable only if clearly documented.
- Confirm all created documentation is in English.
- Confirm no source code hardcodes the product name outside documented defaults.

## Definition of Done

- Repository structure is clear and ready for implementation phases.
- Local infrastructure expectations are documented.
- `.context` exists and summarizes the product, stack, architecture, and critical rules.
- Environment variables are documented for backend and frontend.
- The next phase can initialize the backend without revisiting repository setup.
