import crypto from 'node:crypto';

import mongoose from 'mongoose';

import { SuppressionListEntry } from './suppression-list.model.js';
import {
  normalizeSuppressionAddress,
  validateSuppressionAddress,
} from './suppression.validation.js';
import { Contact } from '../contacts/contact.model.js';
import { CampaignRecipient } from '../campaigns/campaign-recipient.model.js';
import {
  CHANNEL_ADDRESS_FIELDS,
  CHANNEL_CONSENT_KEYS,
  CONTACT_CONSENT_SOURCES,
  CONTACT_CONSENT_STATUSES,
  CONSENT_CHANNELS,
  normalizeConsentState,
} from '../contacts/consent.utils.js';
import { normalisePhone } from '../contacts/contact.validation.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { loadEnv } from '../../config/env.js';

export const SUPPRESSION_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'suppression.created',
  RELEASED: 'suppression.released',
  EMAIL_UNSUBSCRIBED: 'suppression.email_unsubscribed',
  OPT_OUT_RECEIVED: 'suppression.opt_out.received',
  OPT_IN_RECEIVED: 'suppression.opt_in.received',
});

export const CONSENT_AUDIT_ACTIONS = Object.freeze({
  UPDATED: 'contact.consent.updated',
});

const SUPPRESSION_ENTITY = 'suppression_list_entry';
const CONTACT_ENTITY = 'contact';
const PROTECTED_SOURCES = new Set([
  'email_unsubscribe',
  'twilio',
  'sendgrid',
  'provider',
  'system',
]);
const PROTECTED_REASONS = new Set([
  'unsubscribe',
  'sms_stop',
  'whatsapp_opt_out',
  'provider',
  'legal',
  'bounce',
  'complaint',
]);
const OPT_OUT_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN_KEYWORDS = new Set(['START', 'YES', 'UNSTOP']);

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId.toString();
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPublicSuppression = (entry) => ({
  id: entry._id.toString(),
  tenantId: entry.tenantId.toString(),
  channel: entry.channel,
  value: entry.value,
  email: entry.email ?? null,
  phone: entry.phone ?? null,
  whatsappPhone: entry.whatsappPhone ?? null,
  reason: entry.reason,
  source: entry.source,
  status: entry.status,
  suppressedAt: entry.suppressedAt ?? null,
  releasedAt: entry.releasedAt ?? null,
  createdBy: entry.createdBy ? entry.createdBy.toString() : null,
  releasedBy: entry.releasedBy ? entry.releasedBy.toString() : null,
  metadata: entry.metadata ?? {},
  protected: isProtectedSuppression(entry),
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const auditSuppression = async (
  action,
  { entry, tenantId, actor = null, metadata = {}, ip = null, userAgent = null },
) =>
  recordAuditEvent({
    action,
    entityType: SUPPRESSION_ENTITY,
    entityId: entry?._id?.toString?.() ?? null,
    userId: actor?.id ?? null,
    tenantId,
    ip,
    userAgent,
    metadata,
  });

const auditConsent = async ({
  contact,
  tenantId,
  actor = null,
  channel,
  status,
  source,
  metadata = {},
  ip = null,
  userAgent = null,
}) =>
  recordAuditEvent({
    action: CONSENT_AUDIT_ACTIONS.UPDATED,
    entityType: CONTACT_ENTITY,
    entityId: contact._id.toString(),
    userId: actor?.id ?? null,
    tenantId,
    ip,
    userAgent,
    metadata: { channel, status, source, ...metadata },
  });

const fieldsForAddress = ({ channel, address }) => ({
  email: channel === 'email' ? address : null,
  phone: channel === 'sms' ? address : null,
  whatsappPhone: channel === 'whatsapp' ? address : null,
});

export const isProtectedSuppression = (entry) =>
  PROTECTED_SOURCES.has(entry.source) || PROTECTED_REASONS.has(entry.reason);

export const normalizeSuppressionPayload = (payload) => {
  const channel = payload.channel;
  const address = normalizeSuppressionAddress(payload);
  if (!address || !validateSuppressionAddress({ channel, address })) {
    throw new ValidationError('Invalid suppression address', [
      { path: [CHANNEL_ADDRESS_FIELDS[channel] ?? 'value'], message: 'Invalid address' },
    ]);
  }
  return {
    channel,
    value: address,
    ...fieldsForAddress({ channel, address }),
  };
};

export const listSuppressionEntries = async ({ tenantId, ...query }) => {
  const tenant = ensureTenant(tenantId);
  const filter = { tenantId: tenant };
  if (query.channel) filter.channel = query.channel;
  if (query.status) filter.status = query.status;
  if (query.reason) filter.reason = query.reason;
  if (query.source) filter.source = query.source;
  if (query.search) {
    filter.value = { $regex: escapeRegex(query.search), $options: 'i' };
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;
  const sort = query.sort ?? '-createdAt';
  const [items, total] = await Promise.all([
    SuppressionListEntry.find(filter).sort(sort).skip(skip).limit(limit),
    SuppressionListEntry.countDocuments(filter),
  ]);

  return {
    items: items.map(toPublicSuppression),
    pagination: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
    },
  };
};

export const upsertSuppressionEntry = async ({
  tenantId,
  channel,
  value,
  reason = 'manual',
  source = 'manual',
  actor = null,
  metadata = {},
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  const address = normalizeSuppressionAddress({ channel, value });
  if (!address || !validateSuppressionAddress({ channel, address })) {
    throw new ValidationError('Invalid suppression address');
  }

  let entry = await SuppressionListEntry.findOne({
    tenantId: tenant,
    channel,
    value: address,
    status: 'active',
  });
  if (entry) return { entry, created: false };

  try {
    entry = await SuppressionListEntry.create({
      tenantId: tenant,
      channel,
      value: address,
      ...fieldsForAddress({ channel, address }),
      reason,
      source,
      status: 'active',
      suppressedAt: new Date(),
      createdBy: actor?.id ?? null,
      metadata,
    });
  } catch (err) {
    if (err?.code === 11000 || err?.code === 11001) {
      entry = await SuppressionListEntry.findOne({
        tenantId: tenant,
        channel,
        value: address,
        status: 'active',
      });
      return { entry, created: false };
    }
    throw err;
  }

  await auditSuppression(SUPPRESSION_AUDIT_ACTIONS.CREATED, {
    entry,
    tenantId: tenant,
    actor,
    metadata: { channel, value: address, reason, source },
    ip,
    userAgent,
  });
  return { entry, created: true };
};

export const createSuppressionEntry = async ({
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  const normalized = normalizeSuppressionPayload(payload);
  const { entry } = await upsertSuppressionEntry({
    tenantId: tenant,
    channel: normalized.channel,
    value: normalized.value,
    reason: payload.reason ?? 'manual',
    source: 'manual',
    actor,
    metadata: payload.metadata ?? {},
    ip,
    userAgent,
  });
  return toPublicSuppression(entry);
};

export const releaseSuppressionEntry = async ({
  id,
  tenantId,
  actor,
  ip = null,
  userAgent = null,
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'suppression id');
  const entry = await SuppressionListEntry.findOne({ _id: id, tenantId: tenant });
  if (!entry) throw new NotFoundError('Suppression entry not found');

  if (entry.status === 'inactive') return toPublicSuppression(entry);
  if (isProtectedSuppression(entry) && !actor?.isSuperAdmin) {
    throw new AuthorizationError('Only a super admin can release provider or legal suppression');
  }

  entry.status = 'inactive';
  entry.releasedAt = new Date();
  entry.releasedBy = actor?.id ?? null;
  await entry.save();
  await auditSuppression(SUPPRESSION_AUDIT_ACTIONS.RELEASED, {
    entry,
    tenantId: tenant,
    actor,
    metadata: { channel: entry.channel, value: entry.value, reason: entry.reason },
    ip,
    userAgent,
  });
  return toPublicSuppression(entry);
};

export const buildSuppressionLookup = async ({ tenantId, valuesByChannel = {} }) => {
  const tenant = ensureTenant(tenantId);
  const or = [];
  for (const [channel, values] of Object.entries(valuesByChannel)) {
    const unique = [...new Set(values)].filter(Boolean);
    if (unique.length > 0) or.push({ channel, value: mongoose.trusted({ $in: unique }) });
  }
  if (!or.length) return new Set();
  const entries = await SuppressionListEntry.find({
    tenantId: tenant,
    status: 'active',
    $or: or,
  }).select('channel value');
  return new Set(entries.map((entry) => `${entry.channel}:${entry.value}`));
};

export const suppressionSkipReason = (channel) => `${channel}_suppressed`;

const unsubscribeSecret = (env = loadEnv()) =>
  env.UNSUBSCRIBE_TOKEN_SECRET || env.JWT_ACCESS_SECRET;

const signPayload = (encoded, secret) =>
  crypto.createHmac('sha256', secret).update(encoded).digest('base64url');

export const createEmailUnsubscribeToken = ({
  tenantId,
  contactId = null,
  email,
  env = loadEnv(),
}) => {
  const payload = {
    tenantId: tenantId?.toString?.() ?? String(tenantId),
    contactId: contactId?.toString?.() ?? (contactId ? String(contactId) : null),
    email: String(email ?? '')
      .trim()
      .toLowerCase(),
    iat: Math.floor(Date.now() / 1000),
  };
  if (!mongoose.isValidObjectId(payload.tenantId) || !payload.email) {
    throw new ValidationError('Cannot build unsubscribe token');
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(encoded, unsubscribeSecret(env));
  return `${encoded}.${signature}`;
};

export const verifyEmailUnsubscribeToken = ({ token, env = loadEnv() }) => {
  const [encoded, signature] = String(token ?? '').split('.');
  if (!encoded || !signature) {
    throw new ValidationError('Invalid unsubscribe token');
  }
  const expected = signPayload(encoded, unsubscribeSecret(env));
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
    throw new ValidationError('Invalid unsubscribe token');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid unsubscribe token');
  }
  if (!mongoose.isValidObjectId(payload.tenantId) || !payload.email) {
    throw new ValidationError('Invalid unsubscribe token');
  }
  return {
    tenantId: payload.tenantId,
    contactId: mongoose.isValidObjectId(payload.contactId) ? payload.contactId : null,
    email: String(payload.email).toLowerCase(),
    issuedAt: payload.iat ? new Date(payload.iat * 1000) : null,
  };
};

export const buildEmailUnsubscribeUrl = ({
  tenantId,
  contactId = null,
  email,
  env = loadEnv(),
}) => {
  const token = createEmailUnsubscribeToken({ tenantId, contactId, email, env });
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/unsubscribe/email/${token}`;
};

export const previewEmailUnsubscribe = async ({ token, env = loadEnv() }) => {
  const payload = verifyEmailUnsubscribeToken({ token, env });
  const contact = payload.contactId
    ? await Contact.findOne({ _id: payload.contactId, tenantId: payload.tenantId })
    : await Contact.findOne({ tenantId: payload.tenantId, email: payload.email });
  const existing = await SuppressionListEntry.findOne({
    tenantId: payload.tenantId,
    channel: 'email',
    value: payload.email,
    status: 'active',
  });
  return {
    email: payload.email,
    alreadyUnsubscribed:
      Boolean(existing) || normalizeConsentState(contact?.consent?.email).status === 'unsubscribed',
  };
};

const setContactConsent = async ({
  contact,
  channel,
  status,
  source,
  metadata = {},
  actor = null,
  ip = null,
  userAgent = null,
}) => {
  if (!CONSENT_CHANNELS.includes(channel)) {
    throw new ValidationError('Invalid consent channel');
  }
  if (!CONTACT_CONSENT_STATUSES.includes(status)) {
    throw new ValidationError('Invalid consent status');
  }
  if (!CONTACT_CONSENT_SOURCES.includes(source)) {
    throw new ValidationError('Invalid consent source');
  }
  const key = CHANNEL_CONSENT_KEYS[channel];
  const current = normalizeConsentState(contact.consent?.[key]);
  const next = { status, source, changedAt: new Date(), metadata };
  const changed =
    current.status !== next.status ||
    current.source !== next.source ||
    JSON.stringify(current.metadata ?? {}) !== JSON.stringify(next.metadata ?? {});
  if (!contact.consent) contact.consent = {};
  contact.consent[key] = next;
  if (changed) {
    await contact.save();
    await auditConsent({
      contact,
      tenantId: contact.tenantId.toString(),
      actor,
      channel,
      status,
      source,
      metadata,
      ip,
      userAgent,
    });
  }
  return { contact, changed };
};

export const processEmailUnsubscribe = async ({
  token,
  ip = null,
  userAgent = null,
  env = loadEnv(),
}) => {
  const payload = verifyEmailUnsubscribeToken({ token, env });
  const { entry } = await upsertSuppressionEntry({
    tenantId: payload.tenantId,
    channel: 'email',
    value: payload.email,
    reason: 'unsubscribe',
    source: 'email_unsubscribe',
    metadata: {
      tokenIssuedAt: payload.issuedAt?.toISOString?.() ?? null,
      contactId: payload.contactId,
    },
    ip,
    userAgent,
  });

  const contact = payload.contactId
    ? await Contact.findOne({ _id: payload.contactId, tenantId: payload.tenantId })
    : await Contact.findOne({ tenantId: payload.tenantId, email: payload.email });
  if (contact) {
    await setContactConsent({
      contact,
      channel: 'email',
      status: 'unsubscribed',
      source: 'email_unsubscribe',
      metadata: { suppressionEntryId: entry._id.toString() },
      ip,
      userAgent,
    });
  }

  await auditSuppression(SUPPRESSION_AUDIT_ACTIONS.EMAIL_UNSUBSCRIBED, {
    entry,
    tenantId: payload.tenantId,
    metadata: { email: payload.email, contactId: contact?._id?.toString?.() ?? payload.contactId },
    ip,
    userAgent,
  });

  return {
    email: payload.email,
    unsubscribed: true,
    suppression: toPublicSuppression(entry),
  };
};

const optKeyword = (body) =>
  String(body ?? '')
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase() ?? '';

const normalizeTwilioAddress = (value) =>
  normalisePhone(String(value ?? '').replace(/^whatsapp:/i, ''));

const resolveOptOutChannel = ({ from, to, bodyChannel }) => {
  const normalized = String(bodyChannel ?? '').toLowerCase();
  if (normalized === 'sms' || normalized === 'whatsapp') return normalized;
  const combined = `${from ?? ''} ${to ?? ''}`.toLowerCase();
  return combined.includes('whatsapp:') ? 'whatsapp' : 'sms';
};

const resolveTenantsForInboundAddress = async ({ tenantId, channel, address }) => {
  if (tenantId) {
    assertObjectId(tenantId, 'tenant id');
    return [tenantId.toString()];
  }
  const recipients = await CampaignRecipient.find({
    channel,
    recipient: address,
  })
    .select('tenantId')
    .sort('-createdAt')
    .limit(50);
  return [...new Set(recipients.map((recipient) => recipient.tenantId.toString()))];
};

const updateMatchingContactConsent = async ({
  tenantId,
  channel,
  address,
  status,
  source,
  metadata = {},
  ip = null,
  userAgent = null,
}) => {
  const field = CHANNEL_ADDRESS_FIELDS[channel];
  const contacts = await Contact.find({ tenantId, [field]: address });
  for (const contact of contacts) {
    await setContactConsent({
      contact,
      channel,
      status,
      source,
      metadata,
      ip,
      userAgent,
    });
  }
  return contacts.length;
};

const deactivateSuppressionByValue = async ({ tenantId, channel, address, source }) => {
  const entries = await SuppressionListEntry.find({
    tenantId,
    channel,
    value: address,
    status: 'active',
    source,
  });
  for (const entry of entries) {
    entry.status = 'inactive';
    entry.releasedAt = new Date();
    await entry.save();
  }
  return entries.length;
};

export const recordTwilioOptOutEvent = async ({
  from,
  to = null,
  body,
  messageSid = null,
  tenantId = null,
  channel = null,
  ip = null,
  userAgent = null,
}) => {
  const keyword = optKeyword(body);
  const address = normalizeTwilioAddress(from);
  if (!address || !keyword) return { processed: false, action: 'ignored', tenants: [] };
  const resolvedChannel = resolveOptOutChannel({ from, to, bodyChannel: channel });
  const tenants = await resolveTenantsForInboundAddress({
    tenantId,
    channel: resolvedChannel,
    address,
  });
  if (!tenants.length) return { processed: false, action: 'no_tenant_match', tenants: [] };

  const action = OPT_OUT_KEYWORDS.has(keyword)
    ? 'opt_out'
    : OPT_IN_KEYWORDS.has(keyword)
      ? 'opt_in'
      : 'ignored';
  if (action === 'ignored') return { processed: false, action, tenants };

  const reason = resolvedChannel === 'whatsapp' ? 'whatsapp_opt_out' : 'sms_stop';
  const results = [];
  for (const tenant of tenants) {
    if (action === 'opt_out') {
      const { entry, created } = await upsertSuppressionEntry({
        tenantId: tenant,
        channel: resolvedChannel,
        value: address,
        reason,
        source: 'twilio',
        metadata: { keyword, messageSid, to },
        ip,
        userAgent,
      });
      const contactCount = await updateMatchingContactConsent({
        tenantId: tenant,
        channel: resolvedChannel,
        address,
        status: 'unsubscribed',
        source: 'twilio',
        metadata: { keyword, messageSid, suppressionEntryId: entry._id.toString() },
        ip,
        userAgent,
      });
      if (created) {
        await auditSuppression(SUPPRESSION_AUDIT_ACTIONS.OPT_OUT_RECEIVED, {
          entry,
          tenantId: tenant,
          metadata: { channel: resolvedChannel, value: address, keyword, messageSid },
          ip,
          userAgent,
        });
      }
      results.push({ tenantId: tenant, suppressionId: entry._id.toString(), contactCount });
    } else {
      const releasedCount = await deactivateSuppressionByValue({
        tenantId: tenant,
        channel: resolvedChannel,
        address,
        source: 'twilio',
      });
      const contactCount = await updateMatchingContactConsent({
        tenantId: tenant,
        channel: resolvedChannel,
        address,
        status: 'subscribed',
        source: 'twilio',
        metadata: { keyword, messageSid },
        ip,
        userAgent,
      });
      await recordAuditEvent({
        action: SUPPRESSION_AUDIT_ACTIONS.OPT_IN_RECEIVED,
        entityType: SUPPRESSION_ENTITY,
        entityId: address,
        tenantId: tenant,
        ip,
        userAgent,
        metadata: { channel: resolvedChannel, value: address, keyword, messageSid, releasedCount },
      });
      results.push({ tenantId: tenant, releasedCount, contactCount });
    }
  }

  return {
    processed: true,
    action,
    channel: resolvedChannel,
    value: address,
    tenants,
    results,
  };
};

export const __testing = {
  toPublicSuppression,
  setContactConsent,
  normalizeTwilioAddress,
  optKeyword,
};
