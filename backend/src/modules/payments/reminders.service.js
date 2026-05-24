import * as paymentService from './payment.service.js';
import { findUpcomingRenewals } from './subscription.service.js';
import { sendPaymentNotification } from './notification.service.js';
import { loadEnv } from '../../config/env.js';
import { publishWebhookEvent } from '../developer/webhook-publisher.js';
import { WEBHOOK_EVENT_TYPES } from '../developer/webhook-events.js';

/**
 * Scheduled-job entry points. The default deployment runs these from an
 * external scheduler (cron, Kubernetes CronJob, etc.). Operators can invoke
 * them manually through admin endpoints when debugging.
 *
 * Both reminders are idempotent: they rely on `PaymentNotification`'s unique
 * `idempotencyKey` index so re-running today produces no new emails.
 */

const yearMonthDay = (date) => date.toISOString().slice(0, 10);

export const runLowTokenBalanceReminders = async ({ env = loadEnv() } = {}) => {
  const wallets = await paymentService.findTenantsBelowBalanceThreshold({ env });
  const stamp = yearMonthDay(new Date());
  const results = [];
  for (const wallet of wallets) {
    const result = await sendPaymentNotification({
      type: 'low_token_balance',
      tenantId: wallet.tenantId,
      referenceType: 'token_wallet',
      referenceId: wallet._id.toString(),
      idempotencyKey: `low_token_balance:${wallet.tenantId.toString()}:${stamp}`,
      data: {
        balance: wallet.balance,
        threshold: env.LOW_TOKEN_BALANCE_THRESHOLD,
      },
    });
    // Outbound webhook for tenants who want to react automatically — e.g.
    // top up via Mercado Pago or alert their ops channel. The eventId
    // includes today's stamp so the same wallet does not produce duplicate
    // webhooks if the job is re-run within the same day.
    await publishWebhookEvent({
      type: WEBHOOK_EVENT_TYPES.LOW_TOKEN_BALANCE,
      tenantId: wallet.tenantId,
      eventId: `wallet.low_balance:${wallet.tenantId.toString()}:${stamp}`,
      data: {
        balance: wallet.balance,
        threshold: env.LOW_TOKEN_BALANCE_THRESHOLD,
        observedAt: new Date(),
      },
    });
    results.push(result);
  }
  return { processed: results.length, results };
};

export const runRenewalReminders = async ({ env = loadEnv() } = {}) => {
  const subscriptions = await findUpcomingRenewals({ env });
  const stamp = yearMonthDay(new Date());
  const results = [];
  for (const sub of subscriptions) {
    const result = await sendPaymentNotification({
      type: 'subscription_renewal_upcoming',
      tenantId: sub.tenantId,
      referenceType: 'tenant_subscription',
      referenceId: sub._id.toString(),
      idempotencyKey: `subscription_renewal_upcoming:${sub._id.toString()}:${stamp}`,
      recipientEmail: sub.mercadoPagoPayerEmail,
      data: {
        planName: sub.planNameSnapshot,
        nextChargeAt: sub.nextChargeAt ? sub.nextChargeAt.toISOString() : 'soon',
        formattedPrice: `${(Number(sub.priceMinor ?? 0) / 100).toFixed(2)} ${sub.currency}`,
      },
    });
    results.push(result);
  }
  return { processed: results.length, results };
};
