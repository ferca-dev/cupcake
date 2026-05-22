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
}) => {
  let sentCount = 0;
  let failedCount = 0;

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

    const contactId = doc.contactId ? doc.contactId.toString() : null;
    const contact = contactId ? contactsById.get(contactId) ?? null : null;
    try {
      const result = await provider.send({
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
      if (result.success) {
        doc.status = 'sent';
        doc.sentAt = new Date();
        doc.failureReason = null;
        doc.provider = result.provider ?? provider.getProviderName();
        doc.providerMessageId = result.providerMessageId ?? null;
        await doc.save();
        sentCount += 1;
      } else {
        doc.status = 'failed';
        doc.failureReason = result.reason ?? 'provider_failure';
        doc.provider = result.provider ?? provider.getProviderName();
        doc.providerMessageId = result.providerMessageId ?? null;
        await doc.save();
        failedCount += 1;
      }
    } catch (err) {
      doc.status = 'failed';
      doc.failureReason = err?.message ?? 'provider_error';
      await doc.save();
      failedCount += 1;
    }
  }

  return { sentCount, failedCount };
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
  const contactsById = new Map(contacts.map((contact) => [contact._id.toString(), contact]));
  const dispatch = await dispatchPendingRecipients({
    recipientDocs: insertedDocs,
    providers: providerSet,
    survey,
    campaign,
    contactsById,
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
  };
  await campaign.save();

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

  return {
    campaignId: campaign._id.toString(),
    status: campaign.status,
    selectedCount: campaign.summary?.selectedCount ?? 0,
    validCount: campaign.summary?.validCount ?? 0,
    counts,
    skippedReasons: skipReasons,
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
