import { resolveTransactionalEmailSender } from '../payments/transactional-email.js';
import { loadEnv } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';

/**
 * Templates for team management emails. Each template is a pure function of
 * its `data` argument so the same input always produces the same body, which
 * keeps idempotent retries safe. User-facing strings live here so they can be
 * swapped for an i18n template engine later without touching the call sites.
 */
const TEMPLATES = {
  invitation_sent: (d) => ({
    subject: `You're invited to join ${d.tenantName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `${d.inviterName} invited you to join ${d.tenantName} on ${d.appName} as ${d.roleLabel}.\n` +
      `Accept the invitation by following this link:\n\n${d.acceptUrl}\n\n` +
      `The link expires on ${d.expiresAt.toISOString()}.`,
  }),
  invitation_revoked: (d) => ({
    subject: `Your invitation to ${d.tenantName} was revoked`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `The invitation to join ${d.tenantName} on ${d.appName} has been revoked.\n` +
      `You no longer have access to that workspace through this invitation.`,
  }),
  invitation_accepted: (d) => ({
    subject: `${d.acceptedByName} joined ${d.tenantName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `${d.acceptedByName} (${d.acceptedByEmail}) accepted the invitation to join ${d.tenantName} as ${d.roleLabel}.`,
  }),
  member_disabled: (d) => ({
    subject: `Your access to ${d.tenantName} has been paused`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your account on ${d.tenantName} (${d.appName}) has been ${d.statusLabel}. ` +
      `Contact your workspace admin if you believe this is a mistake.`,
  }),
  member_reactivated: (d) => ({
    subject: `Your access to ${d.tenantName} has been restored`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your account on ${d.tenantName} (${d.appName}) has been reactivated. ` +
      `You can sign in again.`,
  }),
  member_removed: (d) => ({
    subject: `You were removed from ${d.tenantName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Your account on ${d.tenantName} (${d.appName}) has been removed by an admin. ` +
      `If you believe this is a mistake, contact the workspace owner.`,
  }),
  ownership_transferred_previous: (d) => ({
    subject: `Ownership of ${d.tenantName} was transferred`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `Ownership of ${d.tenantName} has been transferred to ${d.newOwnerName} (${d.newOwnerEmail}). ` +
      `You remain an administrator unless explicitly changed.`,
  }),
  ownership_transferred_new: (d) => ({
    subject: `You are now the owner of ${d.tenantName}`,
    text:
      `Hi ${d.recipientName ?? ''},\n\n` +
      `${d.previousOwnerName} transferred ownership of ${d.tenantName} on ${d.appName} to you. ` +
      `You now have owner-level privileges, including ownership transfer rights.`,
  }),
};

const renderTemplate = (type, data) => {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown team notification type: ${type}`);
  const rendered = template(data);
  return {
    subject: rendered.subject,
    text: rendered.text,
    html: `<pre>${rendered.text.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))}</pre>`,
  };
};

/**
 * Best-effort transactional email. The team module never blocks user-visible
 * flows on email delivery — a failed send is logged and reported back so the
 * caller can record an audit metadata entry, but mutation results are still
 * surfaced to the API consumer.
 */
export const sendTeamNotification = async ({ type, to, data = {}, env = loadEnv() }) => {
  if (!to) return { status: 'skipped', reason: 'no_recipient_email' };
  const enriched = { appName: env.APP_NAME, ...data };
  const { subject, text, html } = renderTemplate(type, enriched);
  try {
    const sender = resolveTransactionalEmailSender({ env });
    const result = await sender.send({
      to,
      subject,
      text,
      html,
      customArgs: { notificationType: type },
    });
    if (result.success) return { status: 'sent' };
    return { status: 'failed', reason: result.reason ?? 'provider_failure' };
  } catch (err) {
    logger.warn({ err, type }, 'Team notification dispatch failed');
    return { status: 'failed', reason: 'send_threw' };
  }
};

export const renderTeamTemplateForTest = renderTemplate;
