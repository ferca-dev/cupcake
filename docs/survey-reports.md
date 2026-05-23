# Survey Statistical Reports

Phase 20 introduces per-survey statistical reports: a tenant-safe aggregation
layer that turns campaign, recipient, response, and version data into the
funnel, distribution, drop-off, timing, and version views that clients need
to evaluate a survey's performance.

## Goals

- Build on top of the existing collections (`campaigns`, `campaign_recipients`,
  `responses`, `survey_versions`) without introducing a new analytics pipeline.
- Make every report endpoint tenant-safe at the service layer — the controller
  is not the boundary that protects against cross-tenant reads.
- Use the immutable published-version schema to label historical answers, so
  rolling out a new version never silently re-interprets old responses.
- Return stable, zero-filled shapes when no data exists so the frontend can
  render the same component tree from empty state through to high-volume.
- Avoid leaking contact-level identifying data from aggregate endpoints;
  detailed exports stay behind the `responses.view` permission.

## REST Surface

All endpoints sit under `/api/v1/surveys/:id/reports/` and require the
`responses.view` permission. Super admins must impersonate a tenant via
`x-impersonate-tenant: <tenantId>` — the reports router enforces
`requireTenantContext({ allowSuperAdminGlobal: false })`.

| Method | Path                     | Notes                                                                                             |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| GET    | `/:id/reports/overview`  | Top-line totals, funnel counts, completion rate, duration stats, first/last response.             |
| GET    | `/:id/reports/channels`  | Per-channel funnel (attempted, sent, delivered, opened, clicked, failed, skipped) plus responses. |
| GET    | `/:id/reports/questions` | Per-question response/skip counts, option distributions, numeric stats, NPS, rating breakdowns.   |
| GET    | `/:id/reports/trends`    | Daily response totals plus per-channel breakdown.                                                 |
| GET    | `/:id/reports/drop-off`  | Page-level and field-level reach counts based on the published schema.                            |
| GET    | `/:id/reports/timing`    | Average, median, min, max, p25, p75, trimmed mean, duration buckets, hourly/weekday distribution. |
| GET    | `/:id/reports/versions`  | List of versions with response counts and current-published flag.                                 |
| GET    | `/:id/reports/export`    | CSV or JSON download (responses or aggregate question summaries).                                 |

## Shared Filters

Every endpoint accepts the same filter set as query parameters:

| Param              | Type | Behaviour                                                                                                                                                               |
| ------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `from`             | date | ISO timestamp; filters `metadata.submittedAt >= from`.                                                                                                                  |
| `to`               | date | ISO timestamp; filters `metadata.submittedAt <= to`. Must be greater than or equal to `from`.                                                                           |
| `channel`          | enum | `email`, `sms`, `whatsapp`, or `public_link`. Campaign channels resolve through `campaign_recipients`; `public_link` matches responses without a `campaignRecipientId`. |
| `campaignId`       | id   | Restrict to a specific campaign.                                                                                                                                        |
| `surveyVersionId`  | id   | Pin reports to a specific published version. The schema for that version is used to label answers.                                                                      |
| `completionStatus` | enum | Currently `all` or `completed` (the data model only persists completed responses; `partial` is reserved for future use).                                                |

## Tenant Isolation

`loadSurveyForReport` requires `tenantId` and pulls the survey using a
tenant-scoped filter before any other query runs. Every downstream
aggregation (`buildBaseResponseMatch`, `buildBaseRecipientMatch`,
`resolveResponseMatch`) inherits `survey.tenantId` from that lookup, so
cross-tenant data cannot be reached by:

- Guessing a `surveyId` from another tenant (returns `404`).
- Passing a `surveyVersionId` from another survey (the resolver only accepts
  versions whose `surveyId` and `tenantId` match the loaded survey).
- Passing a `campaignId` from another tenant (the filter is layered on top
  of the `tenantId` constraint, so a foreign campaign returns zero rows
  rather than leaking).

## Schema Labelling and Versions

`resolveReportSchema` returns a `{ version, schema }` pair using this order
of preference:

1. The version requested via `surveyVersionId` (constrained to the survey).
2. The survey's current `publishedVersionId`.
3. The latest version on file (so previously-published surveys still report).
4. The current draft schema (for never-published surveys; the report shape
   stays stable but `surveyVersion` is `null`).

Answers whose `fieldId` doesn't exist in the resolved schema appear with a
synthetic descriptor in the question report — the data is preserved and
flagged rather than silently dropped, so analysts can spot answers from old
schemas.

## Computed Metrics

- **Response rate**: `totalResponses / audienceSize` (or `null` when there is
  no audience, e.g. anonymous-only surveys).
- **Completion rate**: `completedResponses / startedCount`. Until partial
  responses are persisted by a future phase, `startedCount` equals the larger
  of `sentCount` and `totalResponses` when an audience exists, otherwise
  `totalResponses` itself.
- **Delivery / open / click / failure / skip rates**: divided by the relevant
  funnel denominator (`sentCount` or `audienceSize`).
- **NPS score**: `(promoters - detractors) / total * 100`. Promoters are
  responses with value ≥ 9, passives are 7–8, detractors are 0–6.
- **Drop-off** uses the published schema's `page_break` boundaries to group
  fields into pages, and reports how many responses have any answer on each
  page. Field-level drop-off is computed by walking the schema in order.

## Limitations

- The current data model only persists _completed_ responses, so completion
  rate is necessarily a function of `audienceSize` and `sentCount`, not of
  partial response tracking. Drop-off based on per-field non-response should
  be read as "non-response by question" rather than "true abandonment".
- The `field_count` in the drop-off report counts schema-defined input fields
  only; presentational blocks (text, image, dividers, section titles, page
  breaks) are excluded.
- Reports query the live collections directly. For very large datasets the
  caller should rely on filters (date range, channel, version) to keep the
  working set bounded — there is no materialised report cache yet.
- The `export` endpoint streams a single in-memory CSV/JSON document and is
  capped at `limit` rows (default 10000, max 50000). A streaming export
  pipeline is a candidate for a future phase.

## CSV Export

The CSV serialiser lives in `report.csv.js` and follows RFC-4180: quoted
cells, doubled internal quotes, CRLF line endings, and JSON-stringified
arrays/objects so checkbox group answers survive the round trip.

- `?type=responses` (default) produces one row per response with one column
  per schema field plus delivery/channel metadata.
- `?type=questions` produces a long-format table with one row per (question,
  option) pair, suitable for pivoting in spreadsheets.

`?format=json` returns the same column/row pair as a JSON document for
clients that need a structured download.

## Frontend

`SurveyReportsView` (mounted at `/app/surveys/:id/reports`) drives every
report through the `reports` Pinia store. The view ships with reusable
visual primitives (`ReportBarChart`, `ReportSparkLine`, `ReportFilters`)
implemented with plain SVG/CSS so no chart library is required. The export
buttons open the backend download URL in a new tab so the browser handles
the file natively.
