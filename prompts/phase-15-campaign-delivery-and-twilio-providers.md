# Phase 15 - Campaign Delivery and Twilio Providers

## Required Context

Read `prompts/00-shared-context.md` and inspect Phases 00-14.

## Goal

Make campaign delivery production-ready enough to send one published survey per campaign through provider adapters, with real Twilio SMS/WhatsApp support and Twilio SendGrid email support prepared behind environment-driven providers.

## Scope

This phase improves campaign delivery and provider infrastructure. Do not build a marketing automation suite or complex scheduling system unless it already exists.

## Tasks

- Enforce that every campaign sends exactly one survey.
- Ensure campaign creation requires a valid `surveyId`.
- Ensure campaign sending uses the current immutable `surveyVersionId` from a published survey.
- Reject sends for draft, paused, archived, or missing-version surveys.
- Review and update campaign creation UI so users explicitly choose the survey being sent.
- Generate public survey links for each recipient using configured frontend/public form base URL values.
- Preserve mock providers for local development and tests.
- Implement provider factory selection through `EMAIL_PROVIDER`, `SMS_PROVIDER`, and `WHATSAPP_PROVIDER`.
- Implement `TwilioSmsProvider`.
- Implement `TwilioWhatsAppProvider`.
- Implement `TwilioSendGridEmailProvider` for email through Twilio SendGrid.
- Add environment validation for all Twilio and SendGrid variables.
- Normalize Twilio/SendGrid responses into internal recipient statuses and failure reasons.
- Add optional prepared webhook routes for Twilio status callbacks and SendGrid events if practical.
- Add provider-level unit tests with mocked SDK calls.
- Add campaign integration tests for survey selection, published-version locking, provider selection, and failed provider responses.
- Update `.env.example` files and provider documentation in English.

## Required Environment Variables

Backend `.env.example` must include:

```env
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
```

## Infrastructure Details Not To Miss

- Twilio and SendGrid SDKs must be isolated behind provider classes, not called directly from campaign services.
- Provider initialization must fail clearly when a real provider is selected without required env vars.
- Mock providers must remain the default for local development.
- Message payloads must include survey title, recipient name when available, and the unique public response URL.
- Do not include sensitive survey answers or private tenant data in outbound messages.
- Do not log provider secrets or full outbound payloads.
- Each campaign recipient must keep provider name, provider message id when available, status, failure reason, and sent timestamp.
- A send should be retry-safe enough to avoid duplicate recipient records for the same campaign/contact/channel.
- Existing skipped recipient behavior must remain intact.

## Verification

- Run backend and frontend tests.
- Run provider unit tests with mocked Twilio and SendGrid clients.
- Create a campaign for a published survey and send it with mock providers.
- Attempt to send a campaign for a draft or paused survey and verify rejection.
- Set provider env vars to Twilio/SendGrid test values or mocks and verify provider factory selection.
- Verify generated public links open the correct survey in a new tab.
- Verify campaign reports still show sent, failed, skipped, and skipped reasons correctly.

## Definition of Done

- Every campaign sends one explicit published survey.
- Campaign sends lock onto an immutable survey version.
- Twilio SMS and WhatsApp providers are implemented behind adapters.
- Twilio SendGrid email provider is implemented behind an adapter.
- Environment variables and provider setup are documented in English.
