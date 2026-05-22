# Phase 19 - Token Wallet, Send Limits, and Admin Pricing

## Required Context

Read `prompts/00-shared-context.md` and inspect the complete implementation from Phases 00-18.

## Goal

Implement an admin-configurable token wallet and send-limit system for email, SMS, and WhatsApp sends. Clients buy tokens, tokens are spent per recipient/channel, and super admins control pricing, channel token costs, limits, and manual adjustments.

## Scope

Build the internal token economy and enforcement around campaign sending. Real payment provider capture can remain manual/pending unless a payment provider already exists.

## Tasks

- Create data models for token wallets, ledger entries, token packages, channel pricing rules, tenant send limits, and token purchases.
- Add super admin APIs to configure token packages and channel token costs.
- Add super admin APIs to configure global, monthly, and per-channel tenant send limits.
- Add super admin APIs for manual credit/debit adjustments with audit logs.
- Add client APIs to view token balance, token usage history, token packages, and purchase history.
- Add a client token purchase flow that creates a pending purchase record when real payment is not available.
- Add admin approval/rejection flow for manual pending purchases.
- Add atomic token preflight checks before campaign sends.
- Add atomic token debits during campaign send execution.
- Ensure skipped recipients never consume tokens.
- Add failed-provider refund behavior using `TOKEN_FAILED_SEND_POLICY`, defaulting to refund.
- Update campaign report summaries with token cost, tokens charged, tokens refunded, and remaining balance.
- Add admin UI for packages, channel pricing, tenant limits, and manual adjustments.
- Add client UI for balance, usage, packages, and purchases.
- Add tests for balance checks, atomic debits, skipped recipients, provider failures, refunds, limit enforcement, and admin-only configuration.
- Update billing and campaign documentation in English.

## Suggested API Endpoints

Admin:

- `GET /api/v1/admin/token-packages`
- `POST /api/v1/admin/token-packages`
- `PUT /api/v1/admin/token-packages/:id`
- `PATCH /api/v1/admin/token-packages/:id/status`
- `GET /api/v1/admin/channel-pricing`
- `PUT /api/v1/admin/channel-pricing`
- `GET /api/v1/admin/tenants/:tenantId/send-limits`
- `PUT /api/v1/admin/tenants/:tenantId/send-limits`
- `POST /api/v1/admin/tenants/:tenantId/token-adjustments`
- `POST /api/v1/admin/token-purchases/:id/approve`
- `POST /api/v1/admin/token-purchases/:id/reject`

Client:

- `GET /api/v1/billing/tokens/balance`
- `GET /api/v1/billing/tokens/ledger`
- `GET /api/v1/billing/token-packages`
- `POST /api/v1/billing/token-purchases`
- `GET /api/v1/billing/token-purchases`

## Suggested Data Rules

- Token ledger entries are immutable.
- Wallet balance is derived from or reconciled with ledger entries.
- Ledger entries include `tenantId`, `type`, `channel`, `amount`, `balanceAfter`, `referenceType`, `referenceId`, `createdBy`, and metadata.
- Channel pricing rules include `channel`, `tokensPerRecipient`, `effectiveFrom`, `status`, and admin metadata.
- Tenant limits include monthly total sends, monthly per-channel sends, and optional hard/soft limit behavior.
- Purchase records include package, token amount, price, currency, status, payment provider fields, and admin approval fields.

## Infrastructure Details Not To Miss

- Use database transactions where available, or a documented atomic update strategy if MongoDB transactions are not available locally.
- Campaign preflight must calculate cost per channel and recipient count before provider calls.
- Sending must fail before provider calls when balance or limits are insufficient.
- Avoid race conditions when two campaigns send at the same time.
- Do not charge skipped recipients.
- Keep refunds traceable as separate ledger entries.
- Admin pricing changes should affect new sends only and must not rewrite historical ledger entries.
- Admin changes must be audited.
- Token package prices must store currency explicitly.
- Tokens are internal prepaid credits, not cryptocurrency.

## Verification

- Run backend and frontend tests.
- Configure email, SMS, and WhatsApp token costs as super admin.
- Configure a tenant send limit as super admin.
- Add tokens manually to a tenant wallet.
- Send a campaign and verify tokens are debited only for valid recipients.
- Send with insufficient balance and verify no provider calls are made.
- Send with skipped recipients and verify skipped recipients are not charged.
- Simulate provider failure and verify refund behavior.
- Create a client purchase request and approve it as admin.

## Definition of Done

- Super admins can configure token packages, channel costs, and tenant send limits.
- Clients can view balance, usage, packages, and purchase history.
- Campaign sending enforces token balance and send limits before provider calls.
- Token debits, credits, refunds, purchases, and manual adjustments are ledger-backed and auditable.
