import * as repo from './payment.repository.js';
import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { resolveTransactionalEmailSender } from './transactional-email.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Templates for every payment-related email. They are intentionally compact
 * so they can be edited without touching the dispatcher. Each template is a
 * pure function of the `data` argument so the same input always produces the
 * same body, which keeps idempotent retries safe.
 */
const TEMPLATES = {
  token_payment_pending: (d) => ({
    subject: `Your token purchase is pending`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your purchase of ${d.tokens} tokens (${d.formattedPrice}) is pending payment confirmation.\n` +
      `We'll email you again once it's processed.\n\nReference: ${d.reference}`,
  }),
  token_payment_approved: (d) => ({
    subject: `Token purchase approved`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your payment was approved and ${d.tokens} tokens have been credited to your workspace.\n` +
      `Amount: ${d.formattedPrice}\nReference: ${d.reference}`,
  }),
  token_payment_rejected: (d) => ({
    subject: `Token purchase rejected`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Mercado Pago rejected the payment for ${d.tokens} tokens (${d.formattedPrice}).\n` +
      `Reason: ${d.reason ?? 'unspecified'}.\nReference: ${d.reference}`,
  }),
  token_payment_cancelled: (d) => ({
    subject: `Token purchase cancelled`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `The token purchase ${d.reference} was cancelled. No tokens were credited.`,
  }),
  token_payment_refunded: (d) => ({
    subject: `Token purchase refunded`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Mercado Pago issued a refund for ${d.formattedPrice}. The tokens credited for purchase ${d.reference} are no longer available.`,
  }),
  token_payment_manual_review: (d) => ({
    subject: `Token purchase under manual review`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Mercado Pago flagged purchase ${d.reference} for manual review. We'll notify you once it resolves.`,
  }),
  subscription_created: (d) => ({
    subject: `Subscription created: ${d.planName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your subscription to the ${d.planName} plan has been created and is waiting for your authorisation on Mercado Pago.`,
  }),
  subscription_activated: (d) => ({
    subject: `Subscription activated: ${d.planName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your subscription to the ${d.planName} plan is now active. Tokens will be credited on each renewal.`,
  }),
  subscription_paused: (d) => ({
    subject: `Subscription paused`,
    text: `Hi ${d.recipientName ?? ''},\n\nYour ${d.planName} subscription has been paused.`,
  }),
  subscription_cancelled: (d) => ({
    subject: `Subscription cancelled`,
    text: `Hi ${d.recipientName ?? ''},\n\nYour ${d.planName} subscription has been cancelled.`,
  }),
  subscription_renewal_upcoming: (d) => ({
    subject: `Subscription renewal upcoming`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your ${d.planName} subscription will renew on ${d.nextChargeAt} for ${d.formattedPrice}.`,
  }),
  subscription_payment_approved: (d) => ({
    subject: `Subscription payment processed`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `We processed your subscription payment of ${d.formattedPrice} and credited ${d.tokens} tokens.\nReference: ${d.reference}`,
  }),
  subscription_payment_failed: (d) => ({
    subject: `Subscription payment failed`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Mercado Pago could not process your subscription payment for ${d.planName}. We'll retry shortly.`,
  }),
  subscription_payment_retry: (d) => ({
    subject: `Subscription payment retry scheduled`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Mercado Pago has scheduled a retry of your subscription payment for ${d.planName}.`,
  }),
  low_token_balance: (d) => ({
    subject: `Token balance is low`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your token balance is ${d.balance}, below the configured threshold of ${d.threshold}.\n` +
      `Buy a new token package to keep sending campaigns.`,
  }),
};

const renderTemplate = (type, data) => {
  const template = TEMPLATES[type];
  if (!template) {
    throw new Error(`Unknown payment notification type: ${type}`);
  }
  const rendered = template(data);
  return {
    subject: rendered.subject,
    text: rendered.text,
    html: `<pre>${rendered.text.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))}</pre>`,
  };
};

const resolveTenantOwnerEmail = async (tenantId) => {
  if (!tenantId) return null;
  const tenant = await Tenant.findById(tenantId).select('ownerUserId name').lean();
  if (!tenant?.ownerUserId) return null;
  const user = await User.findById(tenant.ownerUserId).select('email name').lean();
  if (!user?.email) return null;
  return { email: user.email, name: user.name, userId: user._id, tenantName: tenant.name };
};

/**
 * Idempotent dispatcher. Returns one of:
 *   - { status: 'sent', notification }
 *   - { status: 'duplicate', notification } when the same key already produced a notification row
 *   - { status: 'failed', notification, reason } when the email provider rejected the send
 *
 * The caller never has to deduplicate manually — we rely on the unique index
 * on `idempotencyKey`.
 */
export const sendPaymentNotification = async ({
  type,
  tenantId,
  referenceType = null,
  referenceId = null,
  idempotencyKey,
  data = {},
  recipientEmail = null,
  recipientName = null,
  userId = null,
  env = loadEnv(),
}) => {
  if (!idempotencyKey) {
    throw new Error('sendPaymentNotification requires an idempotencyKey');
  }

  const existing = await repo.findNotificationByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { status: 'duplicate', notification: existing };
  }

  // Resolve recipient: explicit arg wins, otherwise fall back to the tenant
  // owner. If we have no email at all, we still write a `skipped` log row so
  // operators can see the attempt.
  let resolvedEmail = recipientEmail;
  let resolvedName = recipientName;
  if (!resolvedEmail) {
    const owner = await resolveTenantOwnerEmail(tenantId);
    if (owner) {
      resolvedEmail = owner.email;
      resolvedName = resolvedName ?? owner.name;
      userId = userId ?? owner.userId;
    }
  }

  if (!resolvedEmail) {
    let notification;
    try {
      notification = await repo.createNotification({
        tenantId,
        userId,
        type,
        referenceType,
        referenceId,
        recipientEmail: 'unknown@cupcake.local',
        status: 'skipped',
        idempotencyKey,
        failureReason: 'no_recipient_email',
        metadata: data,
      });
    } catch (err) {
      if (err?.code === 11000) {
        const dup = await repo.findNotificationByIdempotencyKey(idempotencyKey);
        return { status: 'duplicate', notification: dup };
      }
      throw err;
    }
    return { status: 'skipped', notification };
  }

  const { subject, text, html } = renderTemplate(type, {
    recipientName: resolvedName,
    ...data,
  });

  let notification;
  try {
    notification = await repo.createNotification({
      tenantId,
      userId,
      type,
      referenceType,
      referenceId,
      recipientEmail: resolvedEmail,
      subject,
      status: 'pending',
      idempotencyKey,
      metadata: data,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const dup = await repo.findNotificationByIdempotencyKey(idempotencyKey);
      return { status: 'duplicate', notification: dup };
    }
    throw err;
  }

  // Best-effort delivery: failures are stored on the notification row so a
  // future reconciliation job can retry without resending duplicates that did
  // succeed.
  try {
    const sender = resolveTransactionalEmailSender({ env });
    const result = await sender.send({
      to: resolvedEmail,
      subject,
      text,
      html,
      customArgs: {
        notificationType: type,
        idempotencyKey,
      },
    });

    if (result.success) {
      await repo.saveNotification(notification, {
        status: 'sent',
        sentAt: new Date(),
      });
      return { status: 'sent', notification };
    }
    await repo.saveNotification(notification, {
      status: 'failed',
      failureReason: result.reason ?? 'provider_failure',
    });
    return { status: 'failed', notification, reason: result.reason ?? 'provider_failure' };
  } catch (err) {
    logger.warn({ err, type, idempotencyKey }, 'Payment notification dispatch failed');
    await repo.saveNotification(notification, {
      status: 'failed',
      failureReason: err?.message?.slice(0, 200) ?? 'send_threw',
    });
    return { status: 'failed', notification, reason: 'send_threw' };
  }
};

export const renderTemplateForTest = renderTemplate;
