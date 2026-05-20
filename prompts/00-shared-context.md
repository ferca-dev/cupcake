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
