# Surveyor Access

Phase 35 adds a tenant-scoped `surveyor` role for field staff who submit
verified internal responses without going through the anonymous public form
path.

## Role and permissions

Surveyors receive only:

- `responses.submit_verified`
- `surveyor.responses.submit`

They do not receive survey management, contacts, campaigns, billing, token,
template, dashboard, admin, or team-management permissions by default. The
standard `/api/v1/surveys` management API is therefore unavailable to
surveyors; field work uses the dedicated `/api/v1/surveyor/*` surface.

## Team provisioning

Workspace admins can provision surveyors in two ways:

| Method | Endpoint                   | Notes                                                                |
| ------ | -------------------------- | -------------------------------------------------------------------- |
| `POST` | `/api/v1/team/invitations` | Invite with `role: "surveyor"` and let the user accept by token.     |
| `GET`  | `/api/v1/team/surveyors`   | List active/inactive surveyor users in the tenant.                   |
| `POST` | `/api/v1/team/surveyors`   | Create an active surveyor directly with `{ name, email, password }`. |

Both paths are tenant-scoped, require `users.manage`, enforce the tenant seat
quota, and emit audit logs. Role changes revoke the target user's refresh
tokens so updated permissions take effect at the next token refresh.

## Surveyor API

All routes require an authenticated surveyor session and tenant context.

| Method | Endpoint                                 | Notes                                                             |
| ------ | ---------------------------------------- | ----------------------------------------------------------------- |
| `GET`  | `/api/v1/surveyor/surveys`               | Lists only published surveys from the surveyor's own tenant.      |
| `GET`  | `/api/v1/surveyor/surveys/:id`           | Returns the published version schema needed to answer the survey. |
| `POST` | `/api/v1/surveyor/surveys/:id/responses` | Stores a verified surveyor response.                              |

The product rule for Phase 35 is tenant-available surveys: every published
survey in the surveyor's tenant is available to that surveyor. Assignment
granularity can be layered on top later without changing the response model.

## Response rules

Surveyor submissions are not fake public submissions. The service bypasses
public-only restrictions:

- anonymous-only link requirements (`allowAnonymous: false`)
- public CAPTCHA and honeypot checks
- public device/IP/contact response-limit dedupe
- campaign submission-token requirements

Surveyor submissions still enforce:

- tenant isolation
- `published` survey status
- immutable published version schema
- required fields and conditional visibility
- tenant monthly response quota

Stored responses are distinguishable:

```js
{
  respondentType: 'surveyor',
  submittedByUserId: ObjectId('<user id>')
}
```

Raw response exports include `Respondent type` and `Submitted by user ID`
columns so analysts can separate public and verified field responses.

## Audit trail

Relevant actions:

- `team.surveyor.created`
- `team.invitation.created` with `metadata.role: "surveyor"`
- `team.member.role_changed`
- `auth.login.success` with `metadata.role`
- `surveyor.response.submitted`

## Frontend

Surveyors use `/app/surveyor/surveys` to see available surveys and
`/app/surveyor/surveys/:id/respond` to submit a verified response. The view
uses the same schema renderer as public forms, but it does not render CAPTCHA,
honeypot, device-key, or campaign-token controls.
