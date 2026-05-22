# Cupcake Shared Context

Use this file as mandatory context for every phase prompt.

## Product

Cupcake is a multi-tenant SaaS platform for creating, sending, answering, and analyzing surveys and online forms. Customers create surveys through a visual drag-and-drop builder, distribute them through email, SMS, and WhatsApp, collect public responses through unique slugs, and analyze results in dashboards.

The product must be built as a realistic commercial foundation, not a disposable prototype.

## Language Rules

- All source code must be written in English.
- Code comments must be written in English.
- README files, API documentation, seed documentation, developer docs, and inline technical docs must be written in English.
- User-facing strings must be centralized or prepared for future internationalization.
- Spanish can be used only in external planning conversations when requested by the user, not in committed project code or project documentation.

## Required Stack

- Frontend: Vue 3 with the Composition API and Vite.
- Frontend state: Pinia.
- Frontend router: Vue Router.
- Backend: Node.js using the current active LTS version at implementation time.
- Backend framework: Express unless there is a documented technical reason to choose another Node framework.
- Database: MongoDB using Mongoose.
- API style: REST-first under `/api/v1`.
- Styling: reusable global CSS with `theme.css`, `global.css`, `layout.css`, and `utilities.css`.
- Local infrastructure: Docker Compose for MongoDB.
- Package management: use one workspace package manager consistently and document it in the root README.

## Application Name

The product name must be configurable with environment variables.

- Backend: `APP_NAME`.
- Frontend: `VITE_APP_NAME`.
- Do not hardcode `Cupcake` in source code where the runtime app name should be used.
- Seed data may use the default name only through environment defaults or documented examples.

## Architecture Rules

- Use a modular architecture by domain.
- Keep business logic out of controllers and route files.
- Backend modules should separate routes, controllers, services, repositories, models, validation, and tests where applicable.
- Frontend features should separate views, stores, services, reusable components, and feature-specific components.
- Prefer small, cohesive Vue components.
- Avoid duplicated CSS and duplicated API request logic.
- Use structured validation instead of ad hoc checks.
- Use consistent API response envelopes.
- Keep modules tenant-safe by default.

## Security Rules

- Hash passwords with bcrypt or argon2.
- Use short-lived access tokens and secure refresh tokens.
- Store refresh tokens server-side as hashes or revocable records.
- Apply rate limiting to authentication and public form endpoints.
- Use Helmet/security headers when using Express.
- Sanitize and validate inputs.
- Validate MongoDB ObjectId values before querying.
- Configure CORS through environment variables.
- Never expose stack traces in production responses.
- Never log secrets, passwords, JWTs, refresh tokens, or full authorization headers.

## Multi-Tenancy Rules

- Every business entity must be associated with `tenantId` unless explicitly global.
- Super admins may have `tenantId: null`.
- Tenant isolation must be enforced in backend services/repositories, not only in frontend filters.
- A client user must never access another tenant's data.
- Super admin access must be explicit and permission-checked.
- Public form routes must resolve the survey and tenant safely through published slug/version data.

Entities that require `tenantId` unless explicitly global:

- Users, except super admins if `tenantId: null` is chosen.
- Surveys.
- Survey versions.
- Contacts.
- Contact groups.
- Campaigns.
- Campaign recipients.
- Responses.
- Transactions.
- Audit logs when applicable.
- Tenant-owned templates.

## Roles and Permissions

Initial roles:

- `super_admin`
- `client_admin`
- `client_member`

Initial permissions:

- `users.manage`
- `tenants.manage`
- `surveys.create`
- `surveys.update`
- `surveys.publish`
- `surveys.delete`
- `surveys.view`
- `responses.view`
- `contacts.manage`
- `groups.manage`
- `campaigns.send`
- `billing.view`
- `templates.manage`
- `dashboard.view`
- `admin.dashboard.view`

Authorization must be enforced in the backend.

## Survey Lifecycle

Survey statuses:

- `draft`: editable and not public.
- `published`: public and accepting responses.
- `paused`: public URL remains available but does not accept responses.
- `archived`: read-only and does not accept responses.

Rules:

- Only `published` surveys accept responses.
- Publishing a survey creates an immutable `survey_versions` record.
- Responses must reference the exact `surveyVersionId` used at submission time.
- Editing a published survey must not mutate historical published schemas.
- Duplicating any survey creates a new `draft` survey.

## Survey Response Limit Rules

Surveys must support configurable response limits:

- `unlimited`: respondents may submit multiple responses unless other rules prevent it.
- `one_per_contact`: a campaign-linked contact or recipient token may submit once.
- `one_per_device`: one response per browser/device key.
- `one_per_ip`: one response per IP address.

Rules:

- Response limits are configured per survey and copied into published versions.
- Backend validation is authoritative.
- Device-based limits should use a generated anonymous device key stored client-side and sent to the backend. Hash persisted device identifiers server-side.
- IP-based limits must respect `collectIp`; if IP limits are enabled, the setting must clearly require IP collection.
- Token-linked campaign responses must still be associated with `campaignRecipientId` when available.
- Return clear public form errors when a response limit has already been reached.
- Avoid invasive fingerprinting. Do not collect hardware/browser entropy beyond a generated device key unless a later compliance review explicitly approves it.

## Core Data Model Reference

Use these shapes as the baseline for MongoDB/Mongoose models. Add implementation-specific fields only when they support a documented requirement.

### users

```js
{
  tenantId: ObjectId | null,
  role: 'super_admin' | 'client_admin' | 'client_member',
  name: String,
  email: String,
  passwordHash: String,
  phone: String | null,
  whatsappPhone: String | null,
  status: 'active' | 'inactive' | 'suspended',
  emailVerifiedAt: Date | null,
  lastLoginAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: unique `email`, `tenantId`, `role`, `status`.

### tenants

```js
{
  name: String,
  slug: String,
  ownerUserId: ObjectId,
  status: 'active' | 'suspended' | 'cancelled',
  planId: ObjectId | null,
  settings: {
    timezone: String,
    locale: String,
    branding: {
      logoUrl: String | null,
      primaryColor: String | null
    }
  },
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: unique `slug`, `ownerUserId`, `status`.

### surveys

```js
{
  tenantId: ObjectId,
  title: String,
  description: String | null,
  slug: String,
  status: 'draft' | 'published' | 'paused' | 'archived',
  currentDraftSchema: Object,
  publishedVersionId: ObjectId | null,
  settings: {
    allowAnonymous: Boolean,
    requireContactData: Boolean,
    thankYouMessage: String,
    closeMessage: String,
    pausedMessage: String,
    oneResponsePerContact: Boolean,
    collectIp: Boolean
  },
  createdBy: ObjectId,
  updatedBy: ObjectId | null,
  publishedAt: Date | null,
  archivedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `tenantId`, unique `slug`, `status`, `createdBy`.

### survey_versions

```js
{
  tenantId: ObjectId,
  surveyId: ObjectId,
  versionNumber: Number,
  schema: Object,
  publishedBy: ObjectId,
  publishedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `tenantId`, `surveyId`, unique compound `surveyId + versionNumber`.

### contacts

```js
{
  tenantId: ObjectId,
  firstName: String | null,
  lastName: String | null,
  fullName: String | null,
  email: String | null,
  phone: String | null,
  whatsappPhone: String | null,
  tags: [String],
  groupIds: [ObjectId],
  metadata: Object,
  status: 'active' | 'archived' | 'blocked',
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `tenantId`, `email`, `phone`, `whatsappPhone`, `groupIds`, `status`.

### contact_groups

```js
{
  tenantId: ObjectId,
  name: String,
  description: String | null,
  status: 'active' | 'archived',
  createdAt: Date,
  updatedAt: Date
}
```

Indexes: `tenantId`, `status`.

### campaigns

```js
{
  tenantId: ObjectId,
  surveyId: ObjectId,
  surveyVersionId: ObjectId,
  name: String,
  channels: ['email', 'sms', 'whatsapp'],
  target: {
    contactIds: [ObjectId],
    groupIds: [ObjectId]
  },
  summary: {
    selectedCount: Number,
    validCount: Number,
    sentCount: Number,
    failedCount: Number,
    skippedCount: Number,
    skippedReasons: Object
  },
  status: 'draft' | 'queued' | 'sending' | 'completed' | 'completed_with_errors' | 'failed',
  createdBy: ObjectId,
  scheduledAt: Date | null,
  startedAt: Date | null,
  completedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### campaign_recipients

```js
{
  tenantId: ObjectId,
  campaignId: ObjectId,
  surveyId: ObjectId,
  surveyVersionId: ObjectId,
  contactId: ObjectId | null,
  channel: 'email' | 'sms' | 'whatsapp',
  recipient: String | null,
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'delivered' | 'opened' | 'clicked',
  skippedReason: String | null,
  failureReason: String | null,
  submissionToken: String,
  publicUrl: String,
  provider: String | null,
  sentAt: Date | null,
  deliveredAt: Date | null,
  openedAt: Date | null,
  clickedAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### responses

```js
{
  tenantId: ObjectId,
  surveyId: ObjectId,
  surveyVersionId: ObjectId,
  campaignId: ObjectId | null,
  campaignRecipientId: ObjectId | null,
  contactId: ObjectId | null,
  submissionToken: String | null,
  answers: [
    {
      fieldId: String,
      key: String,
      type: String,
      value: Mixed
    }
  ],
  metadata: {
    ip: String | null,
    userAgent: String | null,
    startedAt: Date | null,
    submittedAt: Date,
    completionTimeSeconds: Number | null
  },
  createdAt: Date,
  updatedAt: Date
}
```

### templates

```js
{
  tenantId: ObjectId | null,
  title: String,
  description: String,
  category: String,
  schema: Object,
  isSystemTemplate: Boolean,
  status: 'active' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
```

### transactions

```js
{
  tenantId: ObjectId,
  type: 'payment' | 'refund' | 'credit' | 'adjustment',
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled',
  amount: Number,
  currency: String,
  provider: String | null,
  providerReference: String | null,
  description: String | null,
  paidAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```

### audit_logs

```js
{
  tenantId: ObjectId | null,
  userId: ObjectId | null,
  action: String,
  entityType: String,
  entityId: String | null,
  metadata: Object,
  ip: String | null,
  userAgent: String | null,
  createdAt: Date
}
```

## Public Slugs

- Public forms are available through `/f/:slug` and/or `/forms/:slug`.
- Use globally unique slugs unless a phase documents and implements a consistent tenant-scoped alternative.
- Slugs must be lowercase.
- Slugs may contain only letters, numbers, and hyphens.
- If a custom slug already exists, return a clear validation error.
- If no slug is provided, generate one from the title and fall back to a unique identifier when needed.

## Form Schema

Use a schema equivalent to:

```js
{
  fields: [
    {
      id: 'field_abc123',
      type: 'short_text',
      key: 'customer_name',
      label: 'Customer name',
      placeholder: 'Write your name',
      helpText: '',
      required: true,
      order: 1,
      sectionId: null,
      options: [],
      validation: {
        minLength: null,
        maxLength: null,
        min: null,
        max: null,
        regex: null
      },
      visibility: {
        mode: 'always',
        rules: []
      },
      settings: {
        width: 'full',
        imageUrl: null
      }
    }
  ],
  sections: [],
  logicRules: [],
  layout: {
    mode: 'single_page',
    showProgress: true
  }
}
```

Supported field types:

- `short_text`
- `long_text`
- `email`
- `phone`
- `number`
- `date`
- `time`
- `select`
- `radio_group`
- `checkbox_group`
- `checkbox`
- `yes_no`
- `rating`
- `nps`
- `file_upload`
- `image_block`
- `text_block`
- `divider`
- `section_title`
- `page_break`
- `hidden`

## Conditional Logic

The system must support:

- Visibility rules: show or hide fields/sections.
- Navigation rules: jump to field, section, or page.
- Early ending rules.
- Compound conditions with `all` and `any`.

Minimum operators:

- `equals`
- `not_equals`
- `contains`
- `not_contains`
- `greater_than`
- `greater_than_or_equal`
- `less_than`
- `less_than_or_equal`
- `is_empty`
- `is_not_empty`

Validation must respect conditional visibility. A hidden required field must not block submission.

## Contacts and Bulk Sending

A contact is useful only if it has at least one of:

- `email`
- `phone`
- `whatsappPhone`

Bulk sends must be tolerant of incomplete contacts:

- Do not fail an entire campaign because some contacts are missing channel-specific data.
- Create one `campaign_recipients` record per contact/channel attempt.
- Mark incomplete or invalid recipients as `skipped`.
- Return a campaign report with skipped counts and reasons.

Skipped reasons:

- `missing_email`
- `invalid_email`
- `missing_phone`
- `invalid_phone`
- `missing_whatsapp_phone`
- `invalid_whatsapp_phone`
- `contact_blocked`
- `contact_archived`
- `duplicate_recipient`

## Campaign Delivery Rules

- A campaign sends exactly one survey.
- A campaign must reference `surveyId` and the immutable `surveyVersionId` that will be sent.
- Campaigns can target contacts, groups, or both.
- Only published surveys with a published version can be sent.
- Generated delivery links must point to the public form route and include a submission token when the campaign recipient is known.
- Campaign reports must be based on recipient records, not only provider responses.
- Mock providers remain available for local development and tests.
- Real provider implementations must live behind provider interfaces and factories.

## Twilio Provider Rules

Twilio will be used for SMS and WhatsApp. Email must be prepared through Twilio SendGrid.

Provider requirements:

- `TwilioSmsProvider` sends SMS through Twilio.
- `TwilioWhatsAppProvider` sends WhatsApp messages through Twilio.
- `TwilioSendGridEmailProvider` sends email through Twilio SendGrid.
- Provider selection is environment-driven.
- Provider code must validate required environment variables at startup or provider initialization.
- Provider responses must be normalized into the campaign recipient status model.
- Webhook/status callback routes may be prepared, but must be clearly documented if not fully active.
- Never log Twilio auth tokens, SendGrid API keys, message bodies containing sensitive respondent data, or full recipient lists.

## Token Wallet, Send Limits, and Admin Pricing Rules

Cupcake must include an admin-controlled token system for paid message sending.

Terminology:

- Tokens are internal prepaid credits, not cryptocurrency.
- Tenants buy tokens.
- Tokens can be spent on email, SMS, and WhatsApp sends.
- Admins configure how many tokens each channel costs.
- Admins configure token package prices and tenant send limits.

Rules:

- Only super admins can configure channel token costs, token package pricing, tenant limits, and manual token adjustments.
- Clients can view token balance, token usage, package history, and purchase options.
- Clients can pay for more tokens when a payment provider is available; until then, the purchase flow can create pending purchase records for admin/manual approval.
- Sending must perform a preflight balance and limit check before provider calls.
- Token debit must be atomic and ledger-backed to avoid double-spending.
- Skipped recipients must not consume tokens.
- Failed provider sends should have an explicit configurable policy: charge, refund, or hold for review. Default to refunding provider failures unless documentation says otherwise.
- Every debit, credit, refund, manual adjustment, and purchase must create an immutable ledger entry.
- Campaign reports must include token cost, charged recipients, skipped recipients, refunded sends, and remaining balance.
- Tenant send limits can be global, monthly, or per-channel.
- Admins must be able to override limits for a tenant with audited changes.

Suggested token entities:

- `token_wallets`
- `token_ledger_entries`
- `token_packages`
- `channel_pricing_rules`
- `tenant_send_limits`
- `token_purchases`

## Mercado Pago Online Payment Rules

Cupcake must use Mercado Pago for online payments.

Payment use cases:

- One-time token package purchases.
- Recurring subscriptions for plans or token allowances.
- Subscription payment retries and failed-payment handling.
- Payment confirmation emails.
- Payment reminder emails.
- Low-token balance and renewal reminder emails.

Integration rules:

- Use Mercado Pago Checkout Pro for one-time token package purchases unless a later phase documents a stronger reason for another Mercado Pago product.
- Use Mercado Pago Subscriptions/Preapproval for recurring subscriptions.
- Use Mercado Pago webhooks for payment, subscription, preapproval plan, and authorized payment events where supported.
- Backend must be the source of truth for payment state, token crediting, and subscription status.
- Never credit tokens from a frontend redirect alone.
- Credit tokens only after a trusted backend confirmation, normally via webhook plus payment status verification through Mercado Pago API.
- Webhook processing must be idempotent.
- Payment records must store Mercado Pago IDs, status, external reference, tenant, package/subscription reference, amount, currency, and raw normalized metadata.
- The `external_reference` or equivalent reference must map Mercado Pago events back to Cupcake tenant purchases or subscriptions.
- Use official Mercado Pago SDKs or direct API calls documented by Mercado Pago.
- Keep test/sandbox credentials separate from production credentials.
- Never log Mercado Pago access tokens, webhook secrets, payer full payment details, card data, or raw authorization headers.

Payment email rules:

- Payment emails must use the configured email provider, preferably the Twilio SendGrid provider from the campaign delivery phase.
- Send email when a token purchase is pending, approved, rejected, cancelled, refunded, or requires manual review.
- Send email for subscription created, activated, paused, cancelled, renewal upcoming, payment approved, payment failed, and retry reminders.
- Send low-token balance reminders based on admin-configurable thresholds.
- Emails must be idempotent and backed by a notification log so webhooks do not send duplicates.
- User-facing email content must be i18n-ready.

Suggested payment entities:

- `payment_providers`
- `payment_transactions`
- `payment_webhook_events`
- `subscription_plans`
- `tenant_subscriptions`
- `subscription_invoices`
- `payment_notifications`

## Survey Statistical Reporting Rules

Cupcake must provide per-survey statistical reports.

Minimum report areas:

- Response funnel: audience size, sent, delivered when available, opened/clicked when available, started, completed, and completion rate.
- Response rate: started divided by audience size when campaign audience exists.
- Completion rate: completed divided by started.
- Channel performance: email, SMS, WhatsApp, public/anonymous link, and token-linked links.
- Response trends over time by day and channel.
- Question-level response counts and non-response counts.
- Question-level distributions for select, radio, checkbox, yes/no, rating, NPS, and numeric fields.
- NPS summary: promoters, passives, detractors, score, and distribution.
- Rating averages and distributions.
- Text answer exports and simple text frequency/sentiment-ready preparation.
- Drop-off analysis by page, step, section, or question where the data exists.
- Duration analysis: average, median, min, max, and outlier-resistant trimmed mean if practical.
- Device/browser and geographic metadata only when collected and privacy settings allow it.
- Version comparison by `surveyVersionId`.
- CSV export preparation for reports and raw responses.

Rules:

- Reports must be tenant-safe.
- Reports must distinguish anonymous public links from campaign channels.
- Reports must use immutable published schema versions to label historical answers correctly.
- Reports must return stable zero-filled shapes when data is missing.
- Do not expose personally sensitive contact data in aggregate reports unless the endpoint is explicitly for detailed response exports and permission-checked.

## Media Storage Rules

Cupcake must include a media storage system for images used in surveys, templates, branding, and content blocks.

Rules:

- Do not store uploaded image binaries inside MongoDB.
- Do not rely on permanent local server disk storage for production.
- Use a storage adapter interface so local development and object storage providers are interchangeable.
- Local development may store files under an ignored uploads directory.
- Production should be ready for S3-compatible object storage, Cloudflare R2, DigitalOcean Spaces, or another configured object storage provider.
- Store only metadata and URLs/keys in MongoDB.
- Validate file type, file size, dimensions where practical, and tenant ownership.
- Generate safe object keys with tenant scoping.
- Support deletion or orphan cleanup when media is no longer referenced.
- Serve public assets through signed URLs or public CDN URLs depending on privacy requirements.
- Do not let image upload traffic saturate the application server.

Suggested media entities:

- `media_assets`
- `media_references` if reference tracking is needed.

## Centered Fill-Width Layout Rules

Application content should be centered and fill the available width intentionally.

Rules:

- Main content containers should use `width: 100%`.
- Content should be centered within the available app shell.
- Large screens should use responsive max-widths, grid tracks, and full-width sections where appropriate.
- Avoid narrow content stuck to the left edge on desktop.
- Avoid unlimited line lengths for forms, paragraphs, and settings screens.
- Data-heavy views may use full available width while keeping table content readable.
- Public forms should remain centered and readable while filling the viewport gracefully.
- Builder and dashboard layouts may use full-width multi-column layouts.
- Mobile behavior must remain intact.

## Account Settings Rules

The application must include a settings area for authenticated users.

Minimum settings:

- Profile data: name, email display, phone, WhatsApp phone, timezone.
- Password change with current password verification.
- Language preference.
- Basic notification/channel preferences if the data model already supports them.
- Account/tenant display information for client admins where appropriate.

Rules:

- Email changes should be prepared for verification even if real email verification is deferred.
- Password changes must revoke or rotate active refresh tokens according to the auth strategy.
- Language preference must update the frontend locale and persist server-side.
- User-facing settings labels must be i18n-ready.

## Navigation and Responsive UI Rules

- The dashboard shell must include a collapsible sidenav.
- The top navigation must remain visible using sticky positioning.
- Data tables must support horizontal and vertical scrolling.
- Data table headers must remain fixed while scrolling vertically.
- Large desktop screens must use space intentionally instead of stretching narrow mobile layouts.
- Mobile behavior must remain intact after desktop responsiveness changes.
- Survey lists must include an action or column to open the public survey in a new browser tab when a public slug is available.

## API Response Format

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payload",
    "details": []
  }
}
```

## Required Environment Variables

Backend `.env.example` must include:

```env
APP_NAME="Cupcake"
APP_ENV="development"
APP_PORT=4000
APP_URL="http://localhost:4000"
FRONTEND_URL="http://localhost:5173"
MONGODB_URI="mongodb://localhost:27017/cupcake"
JWT_ACCESS_SECRET="replace-me-access-secret"
JWT_REFRESH_SECRET="replace-me-refresh-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
SUPER_ADMIN_NAME="Super Admin"
SUPER_ADMIN_EMAIL="admin@cupcake.local"
SUPER_ADMIN_PASSWORD="ChangeMe123!"
DEMO_CLIENT_NAME="Demo Client"
DEMO_CLIENT_EMAIL="client@cupcake.local"
DEMO_CLIENT_PASSWORD="ChangeMe123!"
DEMO_TENANT_NAME="Demo Company"
EMAIL_PROVIDER="mock"
SMS_PROVIDER="mock"
WHATSAPP_PROVIDER="mock"

TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_MESSAGING_SERVICE_SID=""
TWILIO_SMS_FROM=""
TWILIO_WHATSAPP_FROM="whatsapp:+10000000000"
TWILIO_STATUS_CALLBACK_URL=""

TWILIO_SENDGRID_API_KEY=""
TWILIO_SENDGRID_FROM_EMAIL="no-reply@cupcake.local"
TWILIO_SENDGRID_FROM_NAME="Cupcake"
TWILIO_SENDGRID_EVENT_WEBHOOK_SECRET=""

TOKEN_PURCHASE_MODE="manual"
DEFAULT_TOKEN_BALANCE=0
DEFAULT_EMAIL_TOKEN_COST=1
DEFAULT_SMS_TOKEN_COST=2
DEFAULT_WHATSAPP_TOKEN_COST=3
TOKEN_FAILED_SEND_POLICY="refund"

MERCADOPAGO_ENV="sandbox"
MERCADOPAGO_PUBLIC_KEY=""
MERCADOPAGO_ACCESS_TOKEN=""
MERCADOPAGO_WEBHOOK_SECRET=""
MERCADOPAGO_SUCCESS_URL="http://localhost:5173/billing/payment/success"
MERCADOPAGO_FAILURE_URL="http://localhost:5173/billing/payment/failure"
MERCADOPAGO_PENDING_URL="http://localhost:5173/billing/payment/pending"
MERCADOPAGO_NOTIFICATION_URL="http://localhost:4000/api/v1/webhooks/mercadopago"
MERCADOPAGO_STATEMENT_DESCRIPTOR="CUPCAKE"
PAYMENT_REMINDER_DAYS_BEFORE=3
LOW_TOKEN_BALANCE_THRESHOLD=100

STORAGE_DRIVER="local"
STORAGE_PUBLIC_BASE_URL="http://localhost:4000/uploads"
LOCAL_UPLOADS_DIR="./uploads"
MAX_IMAGE_UPLOAD_MB=5
S3_ENDPOINT=""
S3_REGION=""
S3_BUCKET=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
S3_PUBLIC_BASE_URL=""

CORS_ORIGIN="http://localhost:5173"
```

Frontend `.env.example` must include:

```env
VITE_APP_NAME="Cupcake"
VITE_API_BASE_URL="http://localhost:4000/api/v1"
```

## Required Seed Data

Seeders must be idempotent and create:

- One super admin.
- One demo tenant.
- One demo client admin.
- Demo contacts with mixed email, phone, WhatsApp, and intentionally incomplete records.
- Demo contact groups.
- System templates.
- One draft survey.
- One published survey with a published version.
- One demo campaign.
- Demo responses.
- Demo transactions.

## Verification Rules

Every phase must finish with:

- Commands run and their result.
- Manual verification notes when UI behavior is involved.
- Updated README or docs when setup, APIs, or workflows change.
- No known failing tests unless explicitly documented with a reason.
- No next phase work hidden behind TODO comments unless the phase prompt explicitly permits future placeholders.
