import mongoose from 'mongoose';

import { Campaign } from './campaign.model.js';
import { CampaignRecipient } from './campaign-recipient.model.js';

export const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

export const findCampaigns = async ({
  tenantId,
  status,
  surveyId,
  search,
  page = 1,
  limit = 20,
  sort = '-createdAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (surveyId) filter.surveyId = surveyId;
  if (search) {
    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = { $regex: escaped, $options: 'i' };
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Campaign.find(filter).sort(sort).skip(skip).limit(limit),
    Campaign.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findCampaignById = async ({ id, tenantId = null }) =>
  Campaign.findOne(tenantFilter({ _id: id }, tenantId));

export const createCampaign = async (payload) => Campaign.create(payload);

export const updateCampaign = async (campaign, updates) => {
  Object.assign(campaign, updates);
  await campaign.save();
  return campaign;
};

export const insertRecipients = async (recipients) => {
  if (!recipients.length) return [];
  return CampaignRecipient.insertMany(recipients);
};

export const removeRecipientsByCampaign = async ({ campaignId, tenantId }) =>
  CampaignRecipient.deleteMany(tenantFilter({ campaignId }, tenantId));

/**
 * Bulk transition recipients matching `fromStatus` to `toStatus`, optionally
 * stamping a `failureReason`. Used by the preflight-blocked path to flip
 * every pending recipient to `failed` in a single write rather than
 * iterating, so no partial state leaks if the request is cancelled.
 */
export const markCampaignRecipientsStatus = async ({
  campaignId,
  tenantId,
  fromStatus,
  toStatus,
  failureReason = null,
}) =>
  CampaignRecipient.updateMany(
    tenantFilter({ campaignId, status: fromStatus }, tenantId),
    {
      $set: {
        status: toStatus,
        failureReason,
      },
    },
  );

export const findRecipientByProviderMessageId = async ({ providerMessageId, channel = null }) => {
  if (!providerMessageId) return null;
  const filter = { providerMessageId };
  if (channel) filter.channel = channel;
  return CampaignRecipient.findOne(filter);
};

export const findRecipients = async ({
  campaignId,
  tenantId,
  status,
  channel,
  page = 1,
  limit = 50,
  sort = 'createdAt',
} = {}) => {
  const filter = tenantFilter({ campaignId }, tenantId);
  if (status) filter.status = status;
  if (channel) filter.channel = channel;
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    CampaignRecipient.find(filter).sort(sort).skip(skip).limit(limit),
    CampaignRecipient.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findRecipientById = async ({ id, tenantId = null }) =>
  CampaignRecipient.findOne(tenantFilter({ _id: id }, tenantId));

export const findRecipientByToken = async ({ submissionToken, tenantId = null }) =>
  CampaignRecipient.findOne(tenantFilter({ submissionToken }, tenantId));

const matchScope = ({ campaignId, tenantId, extra = {} }) => {
  const match = {
    campaignId: new mongoose.Types.ObjectId(campaignId),
    ...extra,
  };
  if (tenantId) match.tenantId = new mongoose.Types.ObjectId(tenantId);
  return match;
};

export const aggregateRecipientCounts = async ({ campaignId, tenantId }) => {
  const rows = await CampaignRecipient.aggregate([
    { $match: matchScope({ campaignId, tenantId }) },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = {};
  for (const row of rows) {
    counts[row._id] = row.count;
  }
  return counts;
};

export const aggregateSkipReasons = async ({ campaignId, tenantId }) => {
  const rows = await CampaignRecipient.aggregate([
    {
      $match: matchScope({
        campaignId,
        tenantId,
        extra: { status: 'skipped', skippedReason: { $ne: null } },
      }),
    },
    { $group: { _id: '$skippedReason', count: { $sum: 1 } } },
  ]);
  const reasons = {};
  for (const row of rows) {
    reasons[row._id] = row.count;
  }
  return reasons;
};
