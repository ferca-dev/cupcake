# Free-Tier Deployment Guide

This guide deploys Cupcake as a temporary staging/demo environment:

- Database: MongoDB Atlas M0 free cluster.
- Backend API: Render Free Web Service.
- Frontend: Vercel static Vite deployment.

This is not a full production posture yet. Use `APP_ENV=staging` for this
free-tier setup. `APP_ENV=production` intentionally fails unless real object
storage, email/SMS/WhatsApp providers, CAPTCHA, payments, and production
secrets are configured.

## 0. Current Project Review

The repository contains phase prompts from `phase-00` through `phase-38`.
Before deploying, run these checks locally from the repo root:

```bash
pnpm install
pnpm --filter ./backend test
pnpm --filter ./frontend test
pnpm lint
pnpm --filter ./frontend build
pnpm --filter ./backend run config:validate
```

Known note: `pnpm format:check` may report older formatting issues in files
outside the deployment path. Do not block a staging deploy on unrelated
pre-existing formatting unless you decide to normalize the whole repo.

## 1. Create MongoDB Atlas M0

1. Create a MongoDB Atlas account.
2. Create a new project, for example `cupcake-staging`.
3. Create a free shared cluster with tier `M0`.
4. Go to **Database Access** and create an app user:
   - Username: `cupcake_app`
   - Password: generate a strong password and store it in your password
     manager.
   - Role: read/write for one database, for example `cupcake`.
5. Go to **Network Access**.
   - For a quick free-tier deployment, add `0.0.0.0/0`.
   - Atlas warns that this allows access from anywhere. Only do this with a
     strong database password, and replace it later with fixed outbound IPs
     when you move to paid infrastructure.
6. Copy the connection string:

```text
mongodb+srv://cupcake_app:<password>@<cluster-host>/cupcake?retryWrites=true&w=majority
```

Replace `<password>` with the URL-encoded password if it contains special
characters.

## 2. Deploy Backend On Render

Render Free Web Services spin down after idle time and have an ephemeral
filesystem. This is acceptable for staging, but uploads stored locally are not
durable. Keep `STORAGE_DRIVER=local` only for this temporary environment.

1. Push the repository to GitHub.
2. In Render, choose **New > Web Service**.
3. Connect the GitHub repo.
4. Use these settings:

| Setting        | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Name           | `cupcake-api`                                              |
| Runtime        | `Node`                                                     |
| Branch         | your deploy branch                                         |
| Root Directory | leave empty                                                |
| Build Command  | `corepack enable && pnpm install --frozen-lockfile`        |
| Start Command  | `cd backend && APP_PORT=${PORT:-10000} node src/server.js` |
| Instance Type  | Free                                                       |

5. Add these environment variables in Render.

Required core variables:

```bash
NODE_VERSION=24
APP_NAME=Cupcake
APP_ENV=staging
APP_PORT=10000
APP_URL=https://cupcake-api.onrender.com
FRONTEND_URL=https://<your-vercel-app>.vercel.app
MONGODB_URI=mongodb+srv://cupcake_app:<password>@<cluster-host>/cupcake?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<random-64-char-secret>
JWT_REFRESH_SECRET=<different-random-64-char-secret>
WEBHOOK_SIGNING_SECRET=<different-random-64-char-secret>
UNSUBSCRIBE_TOKEN_SECRET=<different-random-64-char-secret>
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
LOG_LEVEL=info
REQUEST_BODY_LIMIT=100kb
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
```

Temporary staging providers:

```bash
EMAIL_PROVIDER=mock
SMS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
PAYMENT_PROVIDER=mock
TOKEN_PURCHASE_MODE=manual
MERCADOPAGO_ENV=sandbox
JOB_QUEUE_DRIVER=inline
PUBLIC_FORM_CAPTCHA_PROVIDER=none
STORAGE_DRIVER=local
STORAGE_PUBLIC_BASE_URL=https://cupcake-api.onrender.com/uploads
LOCAL_UPLOADS_DIR=./uploads
MAX_IMAGE_UPLOAD_MB=5
```

Seed credentials:

```bash
SUPER_ADMIN_NAME=Super Admin
SUPER_ADMIN_EMAIL=<your-admin-email>
SUPER_ADMIN_PASSWORD=<temporary-strong-password>
DEMO_CLIENT_NAME=Demo Client
DEMO_CLIENT_EMAIL=<demo-client-email>
DEMO_CLIENT_PASSWORD=<temporary-strong-password>
DEMO_TENANT_NAME=Demo Company
DEFAULT_TOKEN_BALANCE=1000
```

Empty optional provider values are fine for staging:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
TWILIO_SMS_FROM=
TWILIO_WHATSAPP_FROM=
TWILIO_STATUS_CALLBACK_URL=
TWILIO_SENDGRID_API_KEY=
TWILIO_SENDGRID_FROM_EMAIL=
TWILIO_SENDGRID_FROM_NAME=Cupcake
TWILIO_SENDGRID_EVENT_WEBHOOK_SECRET=
MERCADOPAGO_PUBLIC_KEY=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_SUCCESS_URL=https://<your-vercel-app>.vercel.app/billing/payment/success
MERCADOPAGO_FAILURE_URL=https://<your-vercel-app>.vercel.app/billing/payment/failure
MERCADOPAGO_PENDING_URL=https://<your-vercel-app>.vercel.app/billing/payment/pending
MERCADOPAGO_NOTIFICATION_URL=https://cupcake-api.onrender.com/api/v1/webhooks/mercadopago
MERCADOPAGO_STATEMENT_DESCRIPTOR=CUPCAKE
PAYMENT_REMINDER_DAYS_BEFORE=3
LOW_TOKEN_BALANCE_THRESHOLD=100
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
PUBLIC_FORM_HONEYPOT_FIELD=website_url
PUBLIC_FORM_RATE_LIMIT_PER_IP_PER_MINUTE=30
PUBLIC_FORM_RATE_LIMIT_PER_SURVEY_PER_MINUTE=120
PUBLIC_FORM_RATE_LIMIT_PER_TENANT_PER_MINUTE=600
PUBLIC_FORM_RATE_LIMIT_PER_TOKEN_PER_MINUTE=10
PUBLIC_FORM_MIN_FILL_SECONDS=0
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
ERROR_MONITORING_DSN=
ERROR_MONITORING_ENVIRONMENT=staging
OPERATIONS_ALERT_EMAIL=
API_KEY_DEFAULT_RATE_LIMIT_PER_MINUTE=60
```

6. Deploy the Render service.
7. Verify the backend:

```bash
curl https://cupcake-api.onrender.com/api/v1/health/live
curl https://cupcake-api.onrender.com/api/v1/health/ready
curl https://cupcake-api.onrender.com/api/v1
```

## 3. Seed The Database

Run the seed once after MongoDB Atlas and the backend environment values are
ready. The easiest free-tier option is to seed from your local machine against
Atlas.

1. Create a local file `backend/.env.deploy` and paste the same backend
   environment values you used in Render.
2. Run:

```bash
cd backend
node --env-file=.env.deploy src/seeders/index.js
rm .env.deploy
```

3. Sign in with the `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` you configured.
4. Immediately rotate the password from the application UI or by updating the
   user in the database.

## 4. Deploy Frontend On Vercel

Use Vercel for the static Vue/Vite frontend only. Do not deploy the Express
backend to Vercel for this project; the backend expects a long-running process
and, in non-inline mode, a worker process.

1. In Vercel, choose **Add New > Project** and import the GitHub repo.
2. Use these project settings:

| Setting          | Value                                               |
| ---------------- | --------------------------------------------------- |
| Framework Preset | Vite                                                |
| Root Directory   | leave empty                                         |
| Install Command  | `corepack enable && pnpm install --frozen-lockfile` |
| Build Command    | `pnpm --filter ./frontend build`                    |
| Output Directory | `frontend/dist`                                     |

3. Add these Vercel environment variables:

```bash
VITE_APP_NAME=Cupcake
VITE_API_BASE_URL=https://cupcake-api.onrender.com/api/v1
VITE_PUBLIC_FORM_BASE_URL=https://<your-vercel-app>.vercel.app
VITE_MERCADOPAGO_PUBLIC_KEY=
```

4. Deploy.
5. If direct refreshes like `/app` or `/f/some-survey` return 404, add this
   `vercel.json` at the repository root and redeploy:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

6. After Vercel gives you the final frontend URL, go back to Render and update:

```bash
FRONTEND_URL=https://<your-vercel-app>.vercel.app
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
MERCADOPAGO_SUCCESS_URL=https://<your-vercel-app>.vercel.app/billing/payment/success
MERCADOPAGO_FAILURE_URL=https://<your-vercel-app>.vercel.app/billing/payment/failure
MERCADOPAGO_PENDING_URL=https://<your-vercel-app>.vercel.app/billing/payment/pending
```

Redeploy the backend after changing those values.

## 5. Smoke Test

1. Open the Vercel URL.
2. Sign in as the seeded super admin.
3. Create or inspect the demo tenant.
4. Sign in as the demo client.
5. Create a survey, publish it, and open the public form URL.
6. Submit one public response.
7. Create a surveyor from **Team**.
8. Sign in as the surveyor and submit a verified response with geolocation.
9. Sign back in as client admin and open fieldwork monitoring.
10. Check backend health:

```bash
curl https://cupcake-api.onrender.com/api/v1/health/dependencies
```

Optional automated smoke test:

```bash
SMOKE_API_BASE_URL="https://cupcake-api.onrender.com/api/v1" \
SMOKE_EMAIL="<demo-client-email>" \
SMOKE_PASSWORD="<demo-client-password>" \
pnpm smoke:critical
```

## 6. Free-Tier Limitations To Expect

- Render Free Web Services spin down after idle time. The first request after
  sleeping can take about a minute.
- Render Free Web Services have an ephemeral filesystem. Uploaded media stored
  with `STORAGE_DRIVER=local` can disappear after restarts, redeploys, or
  spin-downs.
- `JOB_QUEUE_DRIVER=inline` avoids paying for a background worker, but campaign
  sends and scheduled work run inside request flow. This is fine for staging,
  not for production.
- MongoDB Atlas M0 is suitable for demos and validation, not heavy traffic.
- `EMAIL_PROVIDER=mock`, `SMS_PROVIDER=mock`, `WHATSAPP_PROVIDER=mock`, and
  `PAYMENT_PROVIDER=mock` mean no real messages or real payments are sent.
- `PUBLIC_FORM_CAPTCHA_PROVIDER=none` is acceptable for a private staging
  environment only.

## 7. Path From Free Tier To Real Production

Before switching to `APP_ENV=production`:

1. Use durable S3-compatible object storage:
   - `STORAGE_DRIVER=s3`
   - `S3_REGION`
   - `S3_BUCKET`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `STORAGE_PUBLIC_BASE_URL` or `S3_PUBLIC_BASE_URL`
2. Enable real email/SMS/WhatsApp providers:
   - `EMAIL_PROVIDER=sendgrid`
   - `SMS_PROVIDER=twilio`
   - `WHATSAPP_PROVIDER=twilio`
3. Enable CAPTCHA:
   - `PUBLIC_FORM_CAPTCHA_PROVIDER=turnstile`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
4. Enable real payments:
   - `PAYMENT_PROVIDER=mercadopago`
   - `TOKEN_PURCHASE_MODE=mercadopago`
   - Mercado Pago credentials and webhook secret.
5. Replace `JOB_QUEUE_DRIVER=inline` with `JOB_QUEUE_DRIVER=memory` and run a
   separate worker process:

```bash
cd backend && node src/worker.js
```

6. Replace Atlas `0.0.0.0/0` with fixed outbound IPs or private networking.
7. Add monitoring, alerts, backups, restore drills, and log retention.
8. Run:

```bash
APP_ENV=production pnpm --filter ./backend run config:validate
pnpm --filter ./backend test
pnpm --filter ./frontend test
pnpm lint
pnpm --filter ./frontend build
```

## References Checked

- MongoDB Atlas M0 free cluster and cluster creation:
  <https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/>
- MongoDB Atlas IP access list behavior and `0.0.0.0/0` warning:
  <https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/>
- Render Free Web Service limits, spin-down, free hours, and ephemeral
  filesystem:
  <https://render.com/free>
- Render web service port binding and `PORT` behavior:
  <https://render.com/docs/web-services/>
- Render Node/Express deployment settings:
  <https://render.com/docs/deploy-node-express-app>
- Render environment variables:
  <https://render.com/docs/configure-environment-variables/>
- Vercel Vite deployment:
  <https://vercel.com/docs/frameworks/vite>
- Vercel environment variables:
  <https://vercel.com/docs/projects/environment-variables>
