# Contact Import and Export

Contact import/export is tenant-scoped and requires the `contacts.manage`
permission. Response exports require `responses.view` and stay scoped to a
single tenant-owned survey.

## Contact Import Flow

Imports use a persisted `contact_import_jobs` record so the UI can show status,
counts, file metadata, detected headers, sample rows, mapping, and row-level
errors.

| Step    | Endpoint                                    | Notes                                                                               |
| ------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Upload  | `POST /api/v1/contacts/imports`             | Multipart upload with field `file`. CSV and XLSX are accepted up to 10 MB.          |
| Fetch   | `GET /api/v1/contacts/imports/:id`          | Returns job status, headers, sample rows, mapping, counts, and error availability.  |
| Preview | `POST /api/v1/contacts/imports/:id/preview` | Returns the detected headers/sample rows and suggested mapping.                     |
| Mapping | `PUT /api/v1/contacts/imports/:id/mapping`  | Saves column mapping, dedupe keys, and whether existing contacts should be updated. |
| Confirm | `POST /api/v1/contacts/imports/:id/confirm` | Validates rows and creates or updates contacts.                                     |
| Errors  | `GET /api/v1/contacts/imports/:id/errors`   | Downloads a CSV error report with row number, field, message, and value.            |

Supported mapping fields:

- `fullName`, `firstName`, `lastName`
- `email`, `phone`, `whatsappPhone`
- `tags`
- `groups`
- `metadata`
- `status`
- `emailConsent`, `smsConsent`, `whatsappConsent`

`tags` and `groups` accept comma, semicolon, or pipe separated values.
`groups` may contain group names or group IDs, but the group must already
belong to the caller's tenant. Import never creates cross-tenant group
associations.

`metadata` accepts either a JSON object or `key=value` pairs separated by comma,
semicolon, or pipe.

## Validation and Dedupe

Every row is validated independently. A rejected row does not block other rows.

Rows are rejected when:

- no reachable channel is present;
- email, phone, or WhatsApp values are malformed;
- a mapped status or consent value is unknown;
- a group cannot be resolved inside the caller's tenant;
- the row duplicates another row by the configured dedupe keys;
- the row matches an existing contact and `updateExisting` is false.

Default dedupe keys are `email`, `phone`, and `whatsappPhone`. Existing
contacts are updated by default. When updating, blank cells do not clear
existing values.

## Consent and Suppression

Imports preserve suppression state. If a row contains an address or number that
is already actively suppressed for the tenant, the imported contact's matching
consent channel remains `unsubscribed` even when the file says `subscribed`.

Rows that explicitly import `unsubscribed` consent create or reuse the matching
suppression entry with source `import`.

## Contact Exports

`GET /api/v1/contacts/export` downloads tenant-scoped contacts using the same
filters as the contacts list:

- `search`
- `status`
- `tag`
- `groupId`
- `channel`
- `email`
- `phone`
- `whatsappPhone`
- `sort`

Query parameters:

| Param    | Values         | Default |
| -------- | -------------- | ------- |
| `format` | `csv`, `xlsx`  | `csv`   |
| `limit`  | `1` to `50000` | `50000` |

The export includes contact identifiers, channel values, tags, groups,
metadata, status, consent statuses/sources, and timestamps. It never includes
contacts from another tenant.

## Response Exports

Response exports now support CSV, XLSX, and JSON:

- `GET /api/v1/surveys/:id/reports/export`
- `GET /api/v1/surveys/:id/responses/export`

Supported query parameters:

- `type=responses|questions`
- `format=csv|xlsx|json`
- report filters (`from`, `to`, `channel`, `campaignId`, `surveyVersionId`)
- `limit` up to `50000`

Raw response exports include schema-derived field labels and the survey version
number in JSON output. Aggregate endpoints still avoid exposing personal data.

## Queue Integration Note

The import job model is durable and shaped for the Phase 29 queue layer. While
Phase 29 is being finalized, this phase does not edit the job processor module
owned by that workstream. The confirm endpoint processes the persisted rows
inline today; production queue handoff should replace that call with a
`contact.import` processor once the Phase 29 processor registry is stable.
