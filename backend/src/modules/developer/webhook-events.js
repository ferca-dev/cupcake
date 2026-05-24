/**
 * Outbound webhook event catalogue. Producers in other modules (responses,
 * campaigns, payments, tokens, subscriptions) emit these and the developer
 * module dispatches signed deliveries to every tenant endpoint that has
 * opted in.
 *
 * Adding a new event:
 *   1. Add the constant here so producers and the validation layer agree.
 *   2. Document the payload shape in `docs/client-api-and-webhooks.md`.
 *   3. Emit it from the producing service via `publishWebhookEvent(...)`.
 */
export const WEBHOOK_EVENT_TYPES = Object.freeze({
  RESPONSE_SUBMITTED: 'response.submitted',
  CAMPAIGN_COMPLETED: 'campaign.completed',
  CAMPAIGN_FAILED: 'campaign.failed',
  PAYMENT_APPROVED: 'payment.approved',
  LOW_TOKEN_BALANCE: 'wallet.low_balance',
  SUBSCRIPTION_FAILED: 'subscription.failed',
});

export const WEBHOOK_EVENT_TYPE_VALUES = Object.freeze(Object.values(WEBHOOK_EVENT_TYPES));

export const isValidWebhookEventType = (type) => WEBHOOK_EVENT_TYPE_VALUES.includes(type);
