# Phase 09 - Campaigns and Sending Adapters

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-08.

## Goal

Implement campaign creation and mock email/SMS/WhatsApp sending with recipient-level tracking, skipped recipient reporting, and provider abstraction ready for real integrations.

## Scope

Use mock providers only unless real provider credentials are explicitly available. Do not integrate real billing or messaging providers in this phase.

## Tasks

- Create `Campaign` and `CampaignRecipient` Mongoose models with indexes.
- Implement campaign CRUD/list/detail APIs.
- Implement recipient listing and campaign report APIs.
- Implement provider interface for email, SMS, and WhatsApp.
- Implement mock providers for email, SMS, and WhatsApp.
- Implement channel-specific recipient validation.
- Implement send service for selected contacts and groups.
- Generate submission tokens and public URLs per recipient where applicable.
- Record recipient statuses: pending, sent, failed, skipped, delivered, opened, clicked.
- Record skipped reasons and failure reasons.
- Build campaign summary counts.
- Create frontend campaign list/detail/send flow.
- Add tests for skipped contacts, duplicate recipients, provider failures, token generation, and tenant isolation.
- Update provider architecture documentation in English.

## API Endpoints

- `GET /api/v1/campaigns`
- `POST /api/v1/campaigns`
- `GET /api/v1/campaigns/:id`
- `POST /api/v1/campaigns/:id/send`
- `GET /api/v1/campaigns/:id/recipients`
- `GET /api/v1/campaigns/:id/report`

## Provider Interface

```js
{
  send(messagePayload) {},
  validateRecipient(contact) {},
  getProviderName() {}
}
```

## Infrastructure Details Not To Miss

- A campaign send must not fail completely because some contacts are incomplete.
- Every contact/channel attempt must create an individual recipient record.
- Skipped recipients count as processed records, not invisible omissions.
- Deduplicate recipients per campaign/channel/contact or recipient address.
- Only published surveys with a published version can be sent.
- Generated public URLs must use configured frontend/app URL values, not hardcoded hosts.
- Provider selection must come from env variables.
- Mock providers should behave predictably for tests.
- Design provider boundaries so real providers can be added without rewriting campaign domain logic.

## Verification

- Run backend and frontend tests.
- Create a campaign for a published survey.
- Send to contacts/groups with mixed valid and incomplete data.
- Verify valid recipients are sent through mock providers.
- Verify incomplete recipients are marked skipped with reasons.
- Verify report summary counts match recipient records.
- Open a token-linked public URL and verify response association if Phase 06 supports it.

## Definition of Done

- Clients can create and send campaigns through mock providers.
- Incomplete contacts are skipped without breaking the bulk send.
- Campaign reports show selected, valid, sent, failed, skipped, and skipped reason counts.
- Provider abstraction is ready for real integrations.
