# Phase 20 - Survey Statistical Reports

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-19.

## Goal

Implement per-survey statistical reports that help clients understand distribution performance, completion behavior, question results, drop-off, and survey quality.

## Research Baseline

Use common survey reporting concepts as a baseline:

- Distribution reporting commonly includes audience size, surveys started, surveys finished, response rate, completion rate, and channel breakdowns.
- Survey stats commonly include duration, start times, start dates, question response rates, and completion percentage.
- Survey insight tools commonly expose drop rate, completes, incomplete responses, participant metadata, average completion time, response trends, and questions with high friction.

## Scope

Build statistical reporting from existing campaign, recipient, response, survey version, and metadata records. Do not add a full BI platform.

## Tasks

- Create survey report backend services with tenant-safe aggregations.
- Add report endpoints for overview, channels, questions, trends, drop-off, timing, versions, and exports.
- Calculate audience size, sent, skipped, failed, delivered/opened/clicked when available, started, completed, response rate, and completion rate.
- Calculate response trends over time by channel.
- Calculate channel performance for email, SMS, WhatsApp, anonymous/public link, and token-linked links.
- Calculate question-level counts, missing answers, option distributions, numeric summaries, rating averages, and checkbox selections.
- Calculate NPS metrics for NPS fields: promoters, passives, detractors, score, and distribution.
- Calculate duration metrics: average, median, min, max, and trimmed mean if practical.
- Calculate drop-off by page, section, step, or question based on available response progress metadata.
- Add version comparison by `surveyVersionId`.
- Add filters for date range, channel, campaign, survey version, and completion status.
- Add CSV export preparation for raw responses and aggregate question summaries.
- Build frontend report views with charts, tables, filters, and export actions.
- Add tests for aggregation accuracy, tenant isolation, version labeling, empty states, and filters.
- Update report documentation in English.

## Suggested API Endpoints

- `GET /api/v1/surveys/:surveyId/reports/overview`
- `GET /api/v1/surveys/:surveyId/reports/channels`
- `GET /api/v1/surveys/:surveyId/reports/questions`
- `GET /api/v1/surveys/:surveyId/reports/trends`
- `GET /api/v1/surveys/:surveyId/reports/drop-off`
- `GET /api/v1/surveys/:surveyId/reports/timing`
- `GET /api/v1/surveys/:surveyId/reports/versions`
- `GET /api/v1/surveys/:surveyId/reports/export`

## Required Metrics

- Total responses.
- Completed responses.
- Partial/incomplete responses if tracked.
- Audience size.
- Started count.
- Finished count.
- Response rate.
- Completion rate.
- Average completion time.
- Median completion time.
- Response trend by day.
- Response trend by channel.
- Send and failure counts by channel.
- Question response rate.
- Question skip/non-response count.
- Option distribution.
- Rating average and distribution.
- NPS score and category distribution.
- Drop-off point.
- Version comparison.

## Infrastructure Details Not To Miss

- Reports must use published version schemas to label answers correctly.
- Reports must handle schema changes between versions.
- Aggregate endpoints must not leak contact-level personal data unless explicitly permissioned.
- Empty surveys must return zero-filled report shapes.
- Large reports should use pagination or streaming exports where needed.
- Date filters must use tenant/user timezone consistently.
- Do not recompute expensive aggregates in the UI if the backend can provide stable summaries.
- Add indexes for report query patterns before large datasets become slow.

## Verification

- Run backend and frontend tests.
- Seed or create survey responses across multiple channels and versions.
- Verify overview metrics against raw database counts.
- Verify response and completion rates with known campaign audience data.
- Verify NPS and rating calculations with controlled test data.
- Verify question distributions match submitted answers.
- Verify filters by date, channel, campaign, and version.
- Verify report views work with no data and with enough data to scroll.

## Definition of Done

- Clients can view statistical reports per survey.
- Reports include distribution, channel, question, timing, drop-off, and version metrics.
- Aggregations are tenant-safe, tested, and documented.
