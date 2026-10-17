# Cupcake on Vercel

The installation uses two independent Vercel projects in
`fernando-cardenas-projects-82febed7`:

| Component | Project            | Public URL                                                 |
| --------- | ------------------ | ---------------------------------------------------------- |
| Frontend  | `cupcake-frontend` | <https://cupcake-frontend.vercel.app>                      |
| Backend   | `cupcake-backend`  | <https://cupcake-backend-chi.vercel.app>                   |
| MongoDB   | `cupcake-db`       | MongoDB Atlas Free, provisioned through Vercel Marketplace |
| Images    | `cupcake-media`    | Public Vercel Blob store connected only to the backend     |

MongoDB is hosted by Atlas and managed through its native Vercel integration.
It is not a MongoDB process running inside a Vercel Function. The application's
MongoDB database name is explicitly `cupcake`.

## Restricted configuration

Vercel's production deployment target runs with `APP_ENV=staging`. This is an
intentional installation with messaging, payments and CAPTCHA disabled, rather
than the complete production configuration required by the original validator.

- `SURVEYS_ONLY=true` blocks campaign, billing mutation, payment, provider webhook,
  invitation and outbound webhook endpoints. Plan/usage reads remain available.
- Messaging and payment provider factories also enforce the restriction; real
  provider credentials are not copied into this installation.
- Transactional email reports disabled/skipped delivery instead of simulated success.
- `PUBLIC_FORM_CAPTCHA_PROVIDER=none` and `PUBLIC_FORM_CAPTCHA_DISABLED=true`
  disable challenges even for a survey whose published schema required CAPTCHA.
  Honeypot validation and response rate limits remain enabled.
- `VITE_SURVEYS_ONLY=true` hides campaign/payment navigation and rejects direct
  navigation to those pages. `VITE_CAPTCHA_DISABLED=true` hides CAPTCHA settings.
- `STORAGE_DRIVER=vercel-blob` stores uploads durably in Vercel Blob.
- `JOB_QUEUE_DRIVER=inline` performs supported jobs during the request; no
  persistent worker process or scheduler is deployed.

## Redeployment

Install workspace dependencies first with `pnpm install --frozen-lockfile`.
The root `vercel.json` and Vercel link target the frontend. Its `.vercelignore`
excludes the backend/API and all local environment files.

Use isolated snapshots for independent deployments. They contain source and
lockfiles but exclude local secrets, test files, upload directories and seeders:

```sh
node scripts/stage-vercel.mjs frontend
pnpm exec vercel deploy --prod --yes --cwd .deploy/vercel-frontend --local-config "$PWD/.deploy/vercel-frontend/vercel.json" --scope fernando-cardenas-projects-82febed7

node scripts/stage-vercel.mjs backend
pnpm exec vercel deploy --prod --yes --cwd .deploy/vercel-backend --local-config "$PWD/.deploy/vercel-backend/vercel.json" --scope fernando-cardenas-projects-82febed7
```

Explicit `--local-config` prevents configuration from another workspace root
being selected by the CLI. Each component has its own ignored `.vercel` link.
No Git repository connection or automatic Git deployment was configured.

## Environment and access

Environment variables are stored on their respective Vercel projects.
Database and Blob credentials belong only to the backend. Frontend variables
contain public URLs and deployment feature flags only.

The initial administrator and workspace administrator have generated passwords.
Their local access details are in `.deploy/access.txt` (ignored, owner-readable).
The local backend environment is `backend/.env.cupcake-vercel.local` (ignored).
Do not commit or upload either file.

To bootstrap the same restricted installation idempotently:

```sh
node --env-file=backend/.env.cupcake-vercel.local scripts/bootstrap-vercel.mjs
```

This creates initial accounts, the workspace, plans and system templates.
It does not create campaigns, payment records or mock transactions.

## Verification

Use `/api/v1/health/ready` to check MongoDB and Vercel Blob connectivity.
Application verification should include administrator/workspace login, creating
and publishing a survey, a public response without CAPTCHA, reading results,
and uploading/retrieving an image. Messaging and payment mutation endpoints
must return `403 FEATURE_DISABLED`.

The pre-existing local `seed-mediciones.spec.js` currently has three failures
because its corresponding seeder expects environment fields absent from the
validated configuration. That local seeder is excluded from deployment.
