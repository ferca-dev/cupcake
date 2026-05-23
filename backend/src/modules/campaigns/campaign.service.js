import crypto from 'node:crypto';

import mongoose from 'mongoose';

import * as repo from './campaign.repository.js';
import * as surveyRepo from '../surveys/survey.repository.js';
import { Contact } from '../contacts/contact.model.js';
import { resolveProviders } from './providers/provider.factory.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { loadEnv } from '../../config/env.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import * as tokenService from '../tokens/token.service.js';
import { assertFeature, assertQuota, consumeMonthlyQuota } from '../plans/plan.service.js';
import { FEATURE_KEYS, QUOTA_KEYS } from '../plans/plan.constants.js';

// Maps a campaign channel to the plan feature flag that gates it.
const CHANNEL_FEATURE = Object.freeze({
  email: FEATURE_KEYS.CAMPAIGNS_EMAIL,
  sms: FEATURE_KEYS.CAMPAIGNS_SMS,
  whatsapp: FEATURE_KEYS.CAMPAIGNS_WHATSAPP,
});

const assertChannelFeatures = async ({ tenantId, channels }) => {
  const unique = Array.isArray(channels) ? [...new Set(channels)] : [];
  for (const channel of unique) {
    const featureKey = CHANNEL_FEATURE[channel];
    if (featureKey) {
      await assertFeature({ tenantId, feature: featureKey });
    }
  }
};

export const CAMPAIGN_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'campaign.created',
  SENT: 'campaign.sent',
});

const CAMPAIGN_ENTITY = 'campaign';

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

const generateSubmissionToken = () => crypto.randomBytes(24).toString('base64url').slice(0, 32);

const buildPublicUrl = ({ env, slug, submissionToken }) => {
  // The campaign send is delivered via the frontend renderer; the backend
  // route exists for token resolution but end users open the SPA URL.
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/f/${slug}/r/${submissionToken}`;
};

const toPublicCampaign = (campaign) => ({
  id: campaign._id.toString(),
  tenantId: campaign.tenantId.toString(),
  surveyId: campaign.surveyId.toString(),
  surveyVersionId: campaign.surveyVersionId.toString(),
  name: campaign.name,
  channels: [...(campaign.channels ?? [])],
  target: {
    contactIds: (campaign.target?.contactIds ?? []).map((id) => id.toString()),
    groupIds: (campaign.target?.groupIds ?? []).map((id) => id.toString()),
  },
  summary: {
    selectedCount: campaign.summary?.selectedCount ?? 0,
    validCount: campaign.summary?.validCount ?? 0,
    sentCount: campaign.summary?.sentCount ?? 0,
    failedCount: campaign.summary?.failedCount ?? 0,
    skippedCount: campaign.summary?.skippedCount ?? 0,
    skippedReasons: campaign.summary?.skippedReasons ? { ...campaign.summary.skippedReasons } : {},
    tokenCost: campaign.summary?.tokenCost ?? 0,
    tokensCharged: campaign.summary?.tokensCharged ?? 0,
    tokensRefunded: campaign.summary?.tokensRefunded ?? 0,
    tokensHeld: campaign.summary?.tokensHeld ?? 0,
  },
  status: campaign.status,
  createdBy: campaign.createdBy?.toString() ?? null,
  scheduledAt: campaign.scheduledAt ?? null,
  startedAt: campaign.startedAt ?? null,
  completedAt: campaign.completedAt ?? null,
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
});

const toPublicRecipient = (recipient) => ({
  id: recipient._id.toString(),
  campaignId: recipient.campaignId.toString(),
  surveyId: recipient.surveyId.toString(),
  surveyVersionId: recipient.surveyVersionId.toString(),
  contactId: recipient.contactId ? recipient.contactId.toString() : null,
  channel: recipient.channel,
  recipient: recipient.recipient ?? null,
  status: recipient.status,
  skippedReason: recipient.skippedReason ?? null,
  failureReason: recipient.failureReason ?? null,
  submissionToken: recipient.submissionToken,
  publicUrl: recipient.publicUrl,
  provider: recipient.provider ?? null,
  providerMessageId: recipient.providerMessageId ?? null,
  sentAt: recipient.sentAt ?? null,
  deliveredAt: recipient.deliveredAt ?? null,
  openedAt: recipient.openedAt ?? null,
  clickedAt: recipient.clickedAt ?? null,
  createdAt: recipient.createdAt,
  updatedAt: recipient.updatedAt,
});

const loadPublishedSurvey = async ({ surveyId, tenantId }) => {
  const survey = await surveyRepo.findSurveyById({ id: surveyId, tenantId });
  if (!survey) {
    throw new NotFoundError('Survey not found');
  }
  if (survey.status !== 'published' || !survey.publishedVersionId) {
    throw new ConflictError('Only published surveys can be used in a campaign');
  }
  const version = await surveyRepo.findVersionById({
    id: survey.publishedVersionId,
    tenantId,
  });
  if (!version) {
    throw new NotFoundError('Published survey version not found');
  }
  return { survey, version };
};

/**
 * Loads the survey + the exact version that a campaign was created against.
 * The version stored on the campaign is immutable: re-publishing the survey
 * creates a new SurveyVersion document, but a previously created campaign keeps
 * pointing at the snapshot the user explicitly selected.
 */
const loadCampaignSurveyForSend = async ({ campaign, tenantId }) => {
  const survey = await surveyRepo.findSurveyById({ id: campaign.surveyId, tenantId });
  if (!survey) {
    throw new NotFoundError('Survey not found');
  }
  if (survey.status !== 'published') {
    throw new ConflictError(
      `Survey is ${survey.status}; only published surveys can be sent through a campaign`,
    );
  }
  if (!campaign.surveyVersionId) {
    throw new ConflictError('Campaign is missing a locked survey version');
  }
  const version = await surveyRepo.findVersionById({
    id: campaign.surveyVersionId,
    tenantId,
  });
  if (!version) {
    throw new NotFoundError('Survey version locked to this campaign no longer exists');
  }
  return { survey, version };
};

const resolveTargetContacts = async ({ target, tenantId }) => {
  const contactIds = (target?.contactIds ?? []).map((id) => id.toString());
  const groupIds = (target?.groupIds ?? []).map((id) => id.toString());

  const orClauses = [];
  if (contactIds.length) {
    orClauses.push({ _id: mongoose.trusted({ $in: contactIds }) });
  }
  if (groupIds.length) {
    orClauses.push({ groupIds: mongoose.trusted({ $in: groupIds }) });
  }
  if (!orClauses.length) return [];

  const contacts = await Contact.find({
    tenantId,
    $or: orClauses,
  });

  // Dedupe by id (a contact may match both contactIds and a group).
  const seen = new Map();
  for (const contact of contacts) {
    seen.set(contact._id.toString(), contact);
  }
  return [...seen.values()];
};

const audit = (action, { actor, campaign, metadata = {}, tenantId, ip = null, userAgent = null }) =>
  recordAuditEvent({
    action,
    entityType: CAMPAIGN_ENTITY,
    entityId: campaign._id.toString(),
    userId: actor?.id ?? null,
    tenantId,
    ip,
    userAgent,
    metadata,
  });

export const listCampaigns = async ({ tenantId, ...query }) => {
  const tenant = ensureTenant(tenantId);
  const result = await repo.findCampaigns({ tenantId: tenant, ...query });
  return {
    items: result.items.map(toPublicCampaign),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getCampaign = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'campaign id');
  const campaign = await repo.findCampaignById({ id, tenantId: tenant });
  if (!campaign) throw new NotFoundError('Campaign not found');
  return toPublicCampaign(campaign);
};

export const createCampaign = async ({ tenantId, actor, payload, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  // Block channels that the plan does not include before any work happens.
  await assertChannelFeatures({ tenantId: tenant, channels: payload.channels });
  // Reserve a monthly campaign slot up-front so concurrent attempts cannot
  // double-spend the cap. The slot is only incremented at send time below.
  await assertQuota({ tenantId: tenant, quotaKey: QUOTA_KEYS.CAMPAIGNS_MONTHLY });
  const { survey, version } = await loadPublishedSurvey({
    surveyId: payload.surveyId,
    tenantId: tenant,
  });

  // We pre-resolve the selected contact pool so the saved campaign carries an
  // accurate selectedCount even before the send is triggered. A campaign with
  // no reachable contacts is still allowed — the validate/skip phase happens
  // when the campaign is dispatched.
  const contacts = await resolveTargetContacts({ target: payload.target, tenantId: tenant });

  const campaign = await repo.createCampaign({
    tenantId: tenant,
    surveyId: survey._id,
    surveyVersionId: version._id,
    name: payload.name,
    channels: payload.channels,
    target: {
      contactIds: payload.target?.contactIds ?? [],
      groupIds: payload.target?.groupIds ?? [],
    },
    status: 'draft',
    scheduledAt: payload.scheduledAt ?? null,
    createdBy: actor.id,
    summary: {
      selectedCount: contacts.length,
      validCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      skippedReasons: {},
    },
  });

  await audit(CAMPAIGN_AUDIT_ACTIONS.CREATED, {
    actor,
    campaign,
    tenantId: tenant,
    metadata: {
      surveyId: survey._id.toString(),
      surveyVersionId: version._id.toString(),
      channels: payload.channels,
      selectedCount: contacts.length,
    },
    ip,
    userAgent,
  });

  return toPublicCampaign(campaign);
};

const incrementReason = (reasons, key) => {
  if (!key) return;
  reasons[key] = (reasons[key] ?? 0) + 1;
};

/**
 * Builds the per-recipient plan for a campaign. Every contact × channel
 * combination becomes one recipient record so:
 *   - skipped reasons are visible in the report rather than disappearing,
 *   - duplicates are collapsed via the dedupe key (contact+channel) and a
 *     recipient-address dedupe (channel+address) for cases where two contacts
 *     share an email/phone.
 *
 * Returns `recipients` (the documents to persist) plus aggregate counts so the
 * caller can update the campaign summary in one round-trip.
 */
const planRecipients = ({ campaign, survey, version, contacts, providers, env }) => {
  const recipients = [];
  const summary = {
    selectedCount: contacts.length,
    validCount: 0,
    skippedCount: 0,
    skippedReasons: {},
  };
  const seenContactChannel = new Set();
  const seenChannelRecipient = new Set();

  for (const channel of campaign.channels) {
    const provider = providers[channel];
    if (!provider) continue;
    for (const contact of contacts) {
      const contactKey = `${channel}:${contact._id.toString()}`;
      if (seenContactChannel.has(contactKey)) {
        recipients.push({
          tenantId: campaign.tenantId,
          campaignId: campaign._id,
          surveyId: survey._id,
          surveyVersionId: version._id,
          contactId: contact._id,
          channel,
          recipient: null,
          status: 'skipped',
          skippedReason: 'duplicate_recipient',
          submissionToken: generateSubmissionToken(),
          publicUrl: buildPublicUrl({
            env,
            slug: survey.slug,
            submissionToken: 'duplicate',
          }),
        });
        summary.skippedCount += 1;
        incrementReason(summary.skippedReasons, 'duplicate_recipient');
        continue;
      }
      seenContactChannel.add(contactKey);

      const validation = provider.validateRecipient(contact);
      const submissionToken = generateSubmissionToken();
      const base = {
        tenantId: campaign.tenantId,
        campaignId: campaign._id,
        surveyId: survey._id,
        surveyVersionId: version._id,
        contactId: contact._id,
        channel,
        submissionToken,
        publicUrl: buildPublicUrl({ env, slug: survey.slug, submissionToken }),
      };

      if (!validation.ready) {
        recipients.push({
          ...base,
          recipient: null,
          status: 'skipped',
          skippedReason: validation.reason ?? 'invalid_recipient',
        });
        summary.skippedCount += 1;
        incrementReason(summary.skippedReasons, validation.reason ?? 'invalid_recipient');
        continue;
      }

      const dedupeKey = `${channel}:${validation.recipient}`;
      if (seenChannelRecipient.has(dedupeKey)) {
        recipients.push({
          ...base,
          recipient: validation.recipient,
          status: 'skipped',
          skippedReason: 'duplicate_recipient',
        });
        summary.skippedCount += 1;
        incrementReason(summary.skippedReasons, 'duplicate_recipient');
        continue;
      }
      seenChannelRecipient.add(dedupeKey);

      recipients.push({
        ...base,
        recipient: validation.recipient,
        status: 'pending',
        provider: provider.getProviderName(),
      });
      summary.validCount += 1;
    }
  }

  return { recipients, summary };
};

const contactDisplayName = (contact) => {
  if (!contact) return null;
  if (contact.fullName) return contact.fullName;
  const composed = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return composed.length > 0 ? composed : null;
};

const dispatchPendingRecipients = async ({
  recipientDocs,
  providers,
  survey,
  campaign,
  contactsById,
  pricing,
  tenantId,
  actor,
  failedSendPolicy,
}) => {
  let sentCount = 0;
  let failedCount = 0;
  let tokensCharged = 0;
  let tokensRefunded = 0;
  let tokensHeld = 0;

  for (const doc of recipientDocs) {
    if (doc.status !== 'pending') continue;
    const provider = providers[doc.channel];
    if (!provider) {
      doc.status = 'failed';
      doc.failureReason = 'provider_not_configured';
      doc.provider = doc.provider ?? null;
      await doc.save();
      failedCount += 1;
      continue;
    }

    // Atomically debit the wallet before any provider call. A concurrent
    // send may have drained the balance since the preflight check, so the
    // debit can still fail here — that is the only place we are allowed to
    // observe an insufficient balance during dispatch.
    const cost = pricing[doc.channel] ?? 0;
    let debitEntry = null;
    if (cost > 0) {
      const debit = await tokenService.debitForRecipient({
        tenantId,
        recipientId: doc._id,
        campaignId: campaign._id,
        channel: doc.channel,
        tokensPerRecipient: cost,
        actor,
      });
      if (!debit.debited) {
        doc.status = 'failed';
        doc.failureReason = 'insufficient_balance';
        doc.provider = provider.getProviderName();
        await doc.save();
        failedCount += 1;
        continue;
      }
      debitEntry = debit.entry;
      tokensCharged += cost;
    }

    const contactId = doc.contactId ? doc.contactId.toString() : null;
    const contact = contactId ? (contactsById.get(contactId) ?? null) : null;
    let providerResult = null;
    let providerError = null;
    try {
      providerResult = await provider.send({
        channel: doc.channel,
        recipient: doc.recipient,
        submissionToken: doc.submissionToken,
        publicUrl: doc.publicUrl,
        contact: {
          id: contactId,
          fullName: contactDisplayName(contact),
        },
        campaign: { id: campaign._id.toString(), name: campaign.name },
        survey: {
          id: survey._id.toString(),
          title: survey.title,
          slug: survey.slug,
        },
      });
    } catch (err) {
      providerError = err;
    }

    const isSuccess = providerResult?.success === true && !providerError;
    if (isSuccess) {
      doc.status = 'sent';
      doc.sentAt = new Date();
      doc.failureReason = null;
      doc.provider = providerResult.provider ?? provider.getProviderName();
      doc.providerMessageId = providerResult.providerMessageId ?? null;
      await doc.save();
      sentCount += 1;
      continue;
    }

    // Provider failure path. Apply the configured policy to decide whether
    // the previously debited tokens should be refunded, held, or kept.
    const reason = providerError
      ? (providerError.message ?? 'provider_error')
      : (providerResult?.reason ?? 'provider_failure');
    doc.status = 'failed';
    doc.failureReason = reason;
    doc.provider = providerResult?.provider ?? provider.getProviderName();
    doc.providerMessageId = providerResult?.providerMessageId ?? null;
    await doc.save();
    failedCount += 1;

    if (cost > 0 && debitEntry) {
      if (failedSendPolicy === 'refund') {
        await tokenService.refundForRecipient({
          tenantId,
          recipientId: doc._id,
          campaignId: campaign._id,
          channel: doc.channel,
          amount: cost,
          actor,
          reason,
          metadata: { originalLedgerEntryId: debitEntry._id?.toString?.() ?? null },
        });
        tokensRefunded += cost;
      } else if (failedSendPolicy === 'hold') {
        tokensHeld += cost;
      }
      // policy === 'charge' is a no-op: keep the debit.
    }
  }

  return { sentCount, failedCount, tokensCharged, tokensRefunded, tokensHeld };
};

export const sendCampaign = async ({
  id,
  tenantId,
  actor,
  ip = null,
  userAgent = null,
  providers = null,
  env = loadEnv(),
}) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'campaign id');
  const campaign = await repo.findCampaignById({ id, tenantId: tenant });
  if (!campaign) throw new NotFoundError('Campaign not found');

  if (!['draft', 'queued', 'failed'].includes(campaign.status)) {
    throw new ConflictError('Campaign has already been processed');
  }

  const { survey, version } = await loadCampaignSurveyForSend({
    campaign,
    tenantId: tenant,
  });

  const providerSet = providers ?? resolveProviders({ env });
  const contacts = await resolveTargetContacts({
    target: campaign.target,
    tenantId: tenant,
  });

  // Drop any prior recipient docs for this campaign so a retry produces a
  // fresh plan instead of duplicating contact/channel attempts. The campaign
  // summary is rebuilt at the end of the send.
  await repo.removeRecipientsByCampaign({ campaignId: campaign._id, tenantId: tenant });

  campaign.status = 'sending';
  campaign.startedAt = new Date();
  await campaign.save();

  const { recipients, summary } = planRecipients({
    campaign,
    survey,
    version,
    contacts,
    providers: providerSet,
    env,
  });

  const insertedDocs = await repo.insertRecipients(recipients);

  // Aggregate the per-channel pending count from the inserted plan. Skipped
  // recipients are excluded here so they never consume tokens or count
  // toward the tenant send limits.
  const pendingByChannel = { email: 0, sms: 0, whatsapp: 0 };
  for (const doc of insertedDocs) {
    if (doc.status === 'pending')
      pendingByChannel[doc.channel] = (pendingByChannel[doc.channel] ?? 0) + 1;
  }

  await tokenService.ensureWallet({ tenantId: tenant, env });
  const preflight = await tokenService.preflightCampaignSend({
    tenantId: tenant,
    channelCounts: pendingByChannel,
    env,
  });

  if (!preflight.allowed) {
    const blockReason =
      preflight.reasons.find((r) => r.code === 'send_limit_exceeded')?.code ??
      preflight.reasons[0]?.code ??
      'preflight_blocked';
    const failureReason =
      blockReason === 'send_limit_exceeded' ? 'send_limit_exceeded' : 'insufficient_balance';
    await repo.markCampaignRecipientsStatus({
      campaignId: campaign._id,
      tenantId: tenant,
      fromStatus: 'pending',
      toStatus: 'failed',
      failureReason,
    });
    campaign.status = 'failed';
    campaign.completedAt = new Date();
    campaign.summary = {
      selectedCount: summary.selectedCount,
      validCount: summary.validCount,
      sentCount: 0,
      failedCount: pendingByChannel.email + pendingByChannel.sms + pendingByChannel.whatsapp,
      skippedCount: summary.skippedCount,
      skippedReasons: summary.skippedReasons,
      tokenCost: preflight.totalCost,
      tokensCharged: 0,
      tokensRefunded: 0,
      tokensHeld: 0,
    };
    await campaign.save();

    throw new ConflictError('Campaign cannot be sent', [
      { reasons: preflight.reasons, balance: preflight.balance, totalCost: preflight.totalCost },
    ]);
  }

  const contactsById = new Map(contacts.map((contact) => [contact._id.toString(), contact]));
  const failedSendPolicy = tokenService.resolveFailedSendPolicy({ env });
  const dispatch = await dispatchPendingRecipients({
    recipientDocs: insertedDocs,
    providers: providerSet,
    survey,
    campaign,
    contactsById,
    pricing: preflight.pricing,
    tenantId: tenant,
    actor,
    failedSendPolicy,
  });

  const completedAt = new Date();
  const allValidSent = summary.validCount === 0 || dispatch.sentCount === summary.validCount;
  const hasIssues = dispatch.failedCount > 0 || summary.skippedCount > 0;
  let status;
  if (summary.validCount === 0 && summary.skippedCount === 0) {
    // No reachable contacts and nothing skipped — treat as a completed
    // no-op rather than masking an unrelated failure.
    status = 'completed';
  } else if (!hasIssues && allValidSent) {
    status = 'completed';
  } else {
    status = 'completed_with_errors';
  }

  campaign.status = status;
  campaign.completedAt = completedAt;
  campaign.summary = {
    selectedCount: summary.selectedCount,
    validCount: summary.validCount,
    sentCount: dispatch.sentCount,
    failedCount: dispatch.failedCount,
    skippedCount: summary.skippedCount,
    skippedReasons: summary.skippedReasons,
    tokenCost: preflight.totalCost,
    tokensCharged: dispatch.tokensCharged,
    tokensRefunded: dispatch.tokensRefunded,
    tokensHeld: dispatch.tokensHeld,
  };
  await campaign.save();

  // Count this send toward the monthly campaign quota. The pre-create check
  // already gated it; this increment is what closes the loop for future
  // sends. Stays a no-op when the campaign produced no `validCount` (which
  // covers the "completely skipped" path) so a tenant is not penalised for
  // a no-op send.
  if (summary.validCount > 0) {
    await consumeMonthlyQuota({ tenantId: tenant, quotaKey: QUOTA_KEYS.CAMPAIGNS_MONTHLY });
  }

  const balanceAfter = await tokenService.getBalance({ tenantId: tenant });

  await audit(CAMPAIGN_AUDIT_ACTIONS.SENT, {
    actor,
    campaign,
    tenantId: tenant,
    metadata: {
      selectedCount: summary.selectedCount,
      validCount: summary.validCount,
      sentCount: dispatch.sentCount,
      failedCount: dispatch.failedCount,
      skippedCount: summary.skippedCount,
      tokenCost: preflight.totalCost,
      tokensCharged: dispatch.tokensCharged,
      tokensRefunded: dispatch.tokensRefunded,
      tokensHeld: dispatch.tokensHeld,
      failedSendPolicy,
      status,
    },
    ip,
    userAgent,
  });

  return {
    campaign: toPublicCampaign(campaign),
    summary: {
      selectedCount: summary.selectedCount,
      validCount: summary.validCount,
      sentCount: dispatch.sentCount,
      failedCount: dispatch.failedCount,
      skippedCount: summary.skippedCount,
      skippedReasons: summary.skippedReasons,
      tokenCost: preflight.totalCost,
      tokensCharged: dispatch.tokensCharged,
      tokensRefunded: dispatch.tokensRefunded,
      tokensHeld: dispatch.tokensHeld,
    },
    tokens: {
      pricing: preflight.pricing,
      perChannelCost: preflight.perChannelCost,
      totalCost: preflight.totalCost,
      balanceBefore: preflight.balance,
      balanceAfter: balanceAfter.balance,
      limitWarnings: preflight.limitWarnings,
      failedSendPolicy,
    },
  };
};

export const listRecipients = async ({ id, tenantId, query }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'campaign id');
  const campaign = await repo.findCampaignById({ id, tenantId: tenant });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const result = await repo.findRecipients({
    campaignId: campaign._id,
    tenantId: tenant,
    ...query,
  });
  return {
    items: result.items.map(toPublicRecipient),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getReport = async ({ id, tenantId }) => {
  const tenant = ensureTenant(tenantId);
  assertObjectId(id, 'campaign id');
  const campaign = await repo.findCampaignById({ id, tenantId: tenant });
  if (!campaign) throw new NotFoundError('Campaign not found');

  const [statusCounts, skipReasons] = await Promise.all([
    repo.aggregateRecipientCounts({ campaignId: campaign._id, tenantId: tenant }),
    repo.aggregateSkipReasons({ campaignId: campaign._id, tenantId: tenant }),
  ]);

  const counts = {
    pending: statusCounts.pending ?? 0,
    sent: statusCounts.sent ?? 0,
    failed: statusCounts.failed ?? 0,
    skipped: statusCounts.skipped ?? 0,
    delivered: statusCounts.delivered ?? 0,
    opened: statusCounts.opened ?? 0,
    clicked: statusCounts.clicked ?? 0,
  };

  const wallet = await tokenService.getBalance({ tenantId: tenant });

  return {
    campaignId: campaign._id.toString(),
    status: campaign.status,
    selectedCount: campaign.summary?.selectedCount ?? 0,
    validCount: campaign.summary?.validCount ?? 0,
    counts,
    skippedReasons: skipReasons,
    tokens: {
      tokenCost: campaign.summary?.tokenCost ?? 0,
      tokensCharged: campaign.summary?.tokensCharged ?? 0,
      tokensRefunded: campaign.summary?.tokensRefunded ?? 0,
      tokensHeld: campaign.summary?.tokensHeld ?? 0,
      remainingBalance: wallet.balance,
    },
    startedAt: campaign.startedAt ?? null,
    completedAt: campaign.completedAt ?? null,
  };
};

export const __testing = {
  toPublicCampaign,
  toPublicRecipient,
  generateSubmissionToken,
  buildPublicUrl,
  planRecipients,
};
