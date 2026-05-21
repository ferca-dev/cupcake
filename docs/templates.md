# Templates

Templates capture a survey form schema that can be re-used to bootstrap new
draft surveys. Cupcake ships with a curated set of **system templates**
(visible to every tenant) and lets each tenant author its own private
**tenant templates**.

This document describes the data model, API surface, permissions, and
duplication semantics that the templates module guarantees.

## Data model

```js
{
  tenantId: ObjectId | null, // null marks a system template
  title: String,
  description: String,
  category: String,          // see TEMPLATE_CATEGORIES
  schema: Object,            // same shape as currentDraftSchema / survey_versions.schema
  isSystemTemplate: Boolean,
  status: 'active' | 'inactive',
  createdBy: ObjectId | null,
  updatedBy: ObjectId | null,
  createdAt: Date,
  updatedAt: Date
}
```

Indexes:

- `(tenantId, status)` and `(tenantId, createdAt DESC)` keep the most
  common listing query (templates for "my tenant or system") cheap.
- `(isSystemTemplate, status)` powers the platform-wide system listing for
  super admins.

Categories live in `backend/src/modules/templates/template.model.js`:

| Key                     | Description                   |
| ----------------------- | ----------------------------- |
| `customer_satisfaction` | Customer satisfaction surveys |
| `employee_feedback`     | Internal employee feedback    |
| `event_registration`    | Event/registration forms      |
| `product_feedback`      | Product-specific feedback     |
| `nps`                   | Net Promoter Score            |
| `contact_info`          | Contact/lead capture          |
| `post_service`          | Post-service follow-ups       |
| `lead_capture`          | Lead generation               |
| `other`                 | Catch-all                     |

The `schema` field is validated by the same `parseFormSchema` validator
used for surveys (`backend/src/modules/surveys/form-schema.validator.js`),
so a template can never carry rules that would fail on publish.

## Visibility rules

Tenant-bound users see:

- All **active** system templates (`tenantId: null`, `status: 'active'`).
- Every template owned by their tenant — both active and inactive.

Cross-tenant access is impossible: requests for another tenant's
template id return `404 NOT_FOUND`. Super admins can browse every
template; impersonating a tenant via `X-Impersonate-Tenant` narrows
results to that tenant. Filtering by scope (`?scope=system` /
`?scope=tenant`) is also supported.

## Permissions

| Action                            | Permission required                  | Notes                                                               |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| List / read templates             | `surveys.view` or `templates.manage` | Members can browse templates to start surveys without write access. |
| Create a tenant template          | `templates.manage`                   | `isSystemTemplate` is silently ignored for non-super-admins.        |
| Create a **system** template      | `templates.manage` + `super_admin`   | Tenant admins receive `403 AUTHORIZATION_ERROR`.                    |
| Update / delete a tenant template | `templates.manage`                   | Only inside the caller's tenant.                                    |
| Update / delete a system template | `templates.manage` + `super_admin`   | Tenant admins receive `403`.                                        |
| Create a survey from a template   | `surveys.create`                     | Inactive templates refuse the request.                              |

By default `client_admin` carries `templates.manage`; `client_member` does
not — members can browse and instantiate templates but cannot author them.

## API

All endpoints live under `/api/v1/templates`, require a bearer token, and
respect tenant context the same way as the surveys module.

| Method | Path                                  | Description                                                                              |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/v1/templates`                   | List visible templates. Query: `page`, `limit`, `status`, `category`, `search`, `scope`. |
| POST   | `/api/v1/templates`                   | Create a template. Super admins may pass `isSystemTemplate: true`.                       |
| GET    | `/api/v1/templates/:id`               | Return a single template visible to the caller.                                          |
| PUT    | `/api/v1/templates/:id`               | Update a template the caller is allowed to edit.                                         |
| DELETE | `/api/v1/templates/:id`               | Delete a template the caller is allowed to edit.                                         |
| POST   | `/api/v1/templates/:id/create-survey` | Create a `draft` survey from the template. Body: `{ title?, slug?, description? }`.      |

## Schema duplication

`POST /api/v1/templates/:id/create-survey` produces a brand-new survey
document whose `currentDraftSchema` is a **deep clone** of the template's
schema (via `JSON.parse(JSON.stringify(...))`). Editing the resulting
draft survey can never mutate the template, and editing the template can
never mutate previously-created surveys. The template's schema is also
re-validated on instantiation: a template stored before a validator
tightening would not be allowed to leak a malformed draft.

A successful instantiation also writes two audit log entries:

- `template.survey_created` on the template (`entityType: 'template'`),
  carrying `metadata.surveyId`.
- `survey.created` on the new survey, with
  `metadata.source: 'template'` and `metadata.templateId` so dashboards
  attribute it correctly.

## Seeding

`pnpm seed` runs `backend/src/seeders/seed-templates.js`, which is
idempotent on `(tenantId: null, title)`. It currently provisions six
system templates: customer satisfaction, employee feedback, NPS, event
registration, product feedback, and a contact information form. Updating
the canonical schema in the seeder and re-running `pnpm seed` updates
existing rows in place — no duplicates are produced.

## Frontend

Templates are listed at `/app/templates`. The view (`src/views/templates/TemplateListView.vue`)
is powered by `src/stores/templates.store.js` and the thin client at
`src/services/template.service.js`. From the list a user can:

- Search and filter by category or origin (system vs. workspace).
- Click **Use template** to open a confirmation dialog that creates a
  draft survey and routes the user straight into the survey builder.
- (With `templates.manage`) create, edit, or delete workspace templates
  from the same view.

I18n strings live under the `templates.*` namespace in `src/i18n/en.js`
and `src/i18n/es.js`.
