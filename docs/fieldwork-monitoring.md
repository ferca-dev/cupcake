# Surveyor Fieldwork Monitoring

Fieldwork monitoring is derived from submitted surveyor responses. The system
does not collect continuous GPS tracking; location data only exists when a
verified surveyor submits a response through the surveyor flow.

## Access Control

Monitoring endpoints require an authenticated tenant context and the
`surveyor.activity.view` permission. Client admins receive this permission by
default. Surveyor users do not receive it, so they cannot view other
surveyors' activity or response locations.

Super admins must explicitly select a tenant through the existing tenant
context mechanism before reading activity data.

## API

All routes are mounted under `/api/v1/surveyor-activity`.

| Method | Path                 | Description                                                                         |
| ------ | -------------------- | ----------------------------------------------------------------------------------- |
| `GET`  | `/summary`           | Aggregated response counts, location coverage, and suspicious indicators.           |
| `GET`  | `/responses`         | Paginated response-level activity with exact coordinates for authorized users.      |
| `GET`  | `/map`               | Map-ready response points with surveyor, survey, timestamp, coordinates, and flags. |
| `GET`  | `/export`            | CSV or XLSX export of response-level activity.                                      |
| `GET`  | `/surveyors/:userId` | Summary and recent activity for one surveyor.                                       |

Supported filters:

- `from`, `to`: inclusive ISO date/time bounds applied to submission time.
- `surveyorId`: surveyor user id.
- `surveyId`: survey id.
- `surveyVersionId`: published version id.
- `campaignId`: campaign id when a response is campaign-linked.
- `locationStatus`: `all`, `present`, `missing`, or `low_accuracy`.
- `completionStatus`: `all`, `completed`, or `partial`.

## Suspicious Indicators

The service currently flags:

- `missing_location`: no browser coordinates were stored.
- `low_accuracy`: stored accuracy is worse than 100 meters.
- `repeated_same_location`: the same rounded coordinate appears repeatedly
  for a surveyor.
- `impossible_travel_speed`: consecutive submissions imply travel faster than
  200 km/h.
- `unusual_submission_burst`: at least 10 submissions in a 10-minute window.

These indicators are operational hints for supervisors. They are not fraud
determinations.

## Privacy And Audit

Summary endpoints avoid exact coordinates. Response, map, and export endpoints
include exact coordinates because they are explicitly monitoring surfaces and
are protected by `surveyor.activity.view`.

Every response-level location view and export records an audit log:

- `surveyor_activity.location.viewed`
- `surveyor_activity.location.exported`

Exports include response metadata needed for fieldwork review: surveyor,
survey, version, submission time, completion time, location status,
coordinates, accuracy, permission status, source, and suspicious flags.
