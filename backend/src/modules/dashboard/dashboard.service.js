import mongoose from 'mongoose';

import { Survey } from '../surveys/survey.model.js';
import { Campaign } from '../campaigns/campaign.model.js';
import { CampaignRecipient } from '../campaigns/campaign-recipient.model.js';
import { Response } from '../responses/response.model.js';
import { Contact } from '../contacts/contact.model.js';
import { ContactGroup } from '../contacts/contact-group.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { User } from '../users/user.model.js';
import { AuditLog } from '../audit/audit-log.model.js';
import { ValidationError, NotFoundError } from '../../common/errors/index.js';

const CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);
const SEND_STATUSES = Object.freeze(['sent', 'delivered', 'opened', 'clicked']);
const RECIPIENT_STATUSES = Object.freeze([
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'failed',
  'skipped',
]);

const toObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
};

/**
 * Returns a Mongoose-friendly tenant match object. When `tenantId` is provided
 * the queries scope to that tenant; when `null` they run globally — callers
 * decide which is appropriate.
 */
const tenantMatch = (tenantId) =>
  tenantId ? { tenantId: toObjectId(tenantId, 'tenantId') } : {};

const zeroChannelMap = (extra = {}) => {
  const base = {};
  for (const channel of CHANNELS) {
    base[channel] = { ...extra };
  }
  return base;
};

const buildChannelStatusGrid = (rows) => {
  const grid = zeroChannelMap(
    Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0])),
  );
  for (const row of rows) {
    const channel = row?._id?.channel;
    const status = row?._id?.status;
    if (!channel || !status) continue;
    if (!grid[channel]) grid[channel] = Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0]));
    grid[channel][status] = row.count ?? 0;
  }
  return grid;
};

const sumStatuses = (statusMap, statuses) =>
  statuses.reduce((acc, status) => acc + (statusMap[status] ?? 0), 0);

const safeToString = (value) => (value ? value.toString() : null);

const getClientSummary = async ({ tenantId }) => {
  if (!tenantId) {
    throw new ValidationError('tenantId is required for client summary');
  }
  const tenantOid = toObjectId(tenantId, 'tenantId');
  const tenantFilter = { tenantId: tenantOid };

  const [
    totalSurveys,
    surveysByStatusRows,
    totalResponses,
    totalCampaigns,
    campaignsByStatusRows,
    totalContacts,
    totalGroups,
    channelStatusRows,
    skippedReasonRows,
  ] = await Promise.all([
    Survey.countDocuments(tenantFilter),
    Survey.aggregate([
      { $match: tenantFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Response.countDocuments(tenantFilter),
    Campaign.countDocuments(tenantFilter),
    Campaign.aggregate([
      { $match: tenantFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Contact.countDocuments(tenantFilter),
    ContactGroup.countDocuments(tenantFilter),
    CampaignRecipient.aggregate([
      { $match: tenantFilter },
      {
        $group: {
          _id: { channel: '$channel', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    CampaignRecipient.aggregate([
      {
        $match: {
          ...tenantFilter,
          status: 'skipped',
          skippedReason: { $ne: null },
        },
      },
      { $group: { _id: '$skippedReason', count: { $sum: 1 } } },
    ]),
  ]);

  const surveysByStatus = {
    draft: 0,
    published: 0,
    paused: 0,
    archived: 0,
  };
  for (const row of surveysByStatusRows) {
    if (row._id && surveysByStatus[row._id] !== undefined) {
      surveysByStatus[row._id] = row.count;
    }
  }

  const campaignsByStatus = {};
  for (const row of campaignsByStatusRows) {
    if (!row?._id) continue;
    campaignsByStatus[row._id] = row.count;
  }

  const channelGrid = buildChannelStatusGrid(channelStatusRows);
  const channelTotals = {};
  for (const channel of CHANNELS) {
    const statuses = channelGrid[channel];
    channelTotals[channel] = {
      attempted: RECIPIENT_STATUSES.reduce((acc, s) => acc + (statuses[s] ?? 0), 0),
      sent: sumStatuses(statuses, SEND_STATUSES),
      failed: statuses.failed ?? 0,
      skipped: statuses.skipped ?? 0,
      pending: statuses.pending ?? 0,
    };
  }

  const skippedReasons = {};
  for (const row of skippedReasonRows) {
    if (!row?._id) continue;
    skippedReasons[row._id] = row.count;
  }

  return {
    surveys: {
      total: totalSurveys,
      active: surveysByStatus.published,
      byStatus: surveysByStatus,
    },
    responses: { total: totalResponses },
    campaigns: { total: totalCampaigns, byStatus: campaignsByStatus },
    contacts: { total: totalContacts, groups: totalGroups },
    channels: {
      totals: channelTotals,
      skippedReasons,
    },
  };
};

const getRecentSurveys = async ({ tenantId, limit = 5 }) => {
  const surveys = await Survey.find(tenantMatch(tenantId))
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('_id title slug status publishedAt updatedAt createdAt tenantId')
    .lean();
  return surveys.map((s) => ({
    id: safeToString(s._id),
    tenantId: safeToString(s.tenantId),
    title: s.title,
    slug: s.slug,
    status: s.status,
    publishedAt: s.publishedAt ?? null,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
  }));
};

const aggregateResponsesPerSurvey = async ({ tenantId, surveyIds = null }) => {
  const match = { ...tenantMatch(tenantId) };
  if (Array.isArray(surveyIds) && surveyIds.length > 0) {
    match.surveyId = { $in: surveyIds.map((id) => toObjectId(id, 'surveyId')) };
  }
  const rows = await Response.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$surveyId',
        totalResponses: { $sum: 1 },
        lastResponseAt: { $max: '$metadata.submittedAt' },
      },
    },
  ]);
  const map = new Map();
  for (const row of rows) {
    if (!row?._id) continue;
    map.set(row._id.toString(), {
      totalResponses: row.totalResponses ?? 0,
      lastResponseAt: row.lastResponseAt ?? null,
    });
  }
  return map;
};

const aggregateSendsPerSurvey = async ({ tenantId, surveyIds = null }) => {
  const match = { ...tenantMatch(tenantId), status: { $in: SEND_STATUSES } };
  if (Array.isArray(surveyIds) && surveyIds.length > 0) {
    match.surveyId = { $in: surveyIds.map((id) => toObjectId(id, 'surveyId')) };
  }
  const rows = await CampaignRecipient.aggregate([
    { $match: match },
    { $group: { _id: '$surveyId', sentCount: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const row of rows) {
    if (!row?._id) continue;
    map.set(row._id.toString(), row.sentCount ?? 0);
  }
  return map;
};

/**
 * Returns response-rate rows per survey. The "rate" is responses / sends —
 * surveys with no campaign sends fall back to null so the UI can show "—"
 * instead of an artificial 0%.
 */
const buildSurveyPerformanceRows = ({ surveys, responseMap, sendsMap }) =>
  surveys.map((survey) => {
    const id = safeToString(survey._id);
    const responseInfo = responseMap.get(id) ?? { totalResponses: 0, lastResponseAt: null };
    const sentCount = sendsMap.get(id) ?? 0;
    const rate = sentCount > 0 ? responseInfo.totalResponses / sentCount : null;
    return {
      id,
      title: survey.title,
      slug: survey.slug,
      status: survey.status,
      totalResponses: responseInfo.totalResponses,
      sentCount,
      responseRate: rate === null ? null : Math.round(rate * 10000) / 10000,
      lastResponseAt: responseInfo.lastResponseAt ?? null,
      publishedAt: survey.publishedAt ?? null,
    };
  });

const getSurveyPerformance = async ({ tenantId, limit = 5 }) => {
  // Limit candidate surveys to a reasonable working set so the dashboard does
  // not pull thousands of surveys for a small "best/worst N" list.
  // `mongoose.trusted` opts past the global `sanitizeFilter` which strips raw
  // `$in` operators from filter objects unless we declare them trusted.
  const surveys = await Survey.find({
    ...tenantMatch(tenantId),
    status: mongoose.trusted({ $in: ['published', 'paused', 'archived'] }),
  })
    .sort({ updatedAt: -1 })
    .limit(200)
    .select('_id title slug status publishedAt tenantId')
    .lean();

  if (surveys.length === 0) {
    return { best: [], low: [] };
  }

  const ids = surveys.map((s) => s._id);
  const [responseMap, sendsMap] = await Promise.all([
    aggregateResponsesPerSurvey({ tenantId, surveyIds: ids }),
    aggregateSendsPerSurvey({ tenantId, surveyIds: ids }),
  ]);

  const rows = buildSurveyPerformanceRows({ surveys, responseMap, sendsMap });
  const ranked = [...rows].sort((a, b) => {
    if (b.totalResponses !== a.totalResponses) return b.totalResponses - a.totalResponses;
    return (b.responseRate ?? 0) - (a.responseRate ?? 0);
  });

  const best = ranked.slice(0, limit);
  const low = ranked
    .filter((row) => row.status === 'published')
    .slice(-limit)
    .reverse();

  return { best, low };
};

const getLatestResponses = async ({ tenantId, limit = 10 }) => {
  const responses = await Response.find(tenantMatch(tenantId))
    .sort({ 'metadata.submittedAt': -1, createdAt: -1 })
    .limit(limit)
    .select('_id tenantId surveyId surveyVersionId campaignId contactId metadata createdAt')
    .lean();

  if (responses.length === 0) return [];

  const surveyIds = [...new Set(responses.map((r) => r.surveyId?.toString()).filter(Boolean))];
  const surveys = await Survey.find({ _id: mongoose.trusted({ $in: surveyIds }) })
    .select('_id title slug')
    .lean();
  const surveyMap = new Map(surveys.map((s) => [s._id.toString(), s]));

  return responses.map((response) => {
    const surveyKey = response.surveyId?.toString();
    const survey = surveyKey ? surveyMap.get(surveyKey) : null;
    return {
      id: safeToString(response._id),
      tenantId: safeToString(response.tenantId),
      survey: survey
        ? { id: safeToString(survey._id), title: survey.title, slug: survey.slug }
        : { id: surveyKey, title: null, slug: null },
      submittedAt: response.metadata?.submittedAt ?? response.createdAt ?? null,
      completionTimeSeconds: response.metadata?.completionTimeSeconds ?? null,
      campaignId: safeToString(response.campaignId),
      hasContact: Boolean(response.contactId),
    };
  });
};

export const getClientDashboardSummary = async ({ tenantId }) => {
  const [summary, recentSurveys, performance, latestResponses] = await Promise.all([
    getClientSummary({ tenantId }),
    getRecentSurveys({ tenantId, limit: 5 }),
    getSurveyPerformance({ tenantId, limit: 5 }),
    getLatestResponses({ tenantId, limit: 10 }),
  ]);

  return {
    ...summary,
    recentSurveys,
    bestResponseSurveys: performance.best,
    lowResponseSurveys: performance.low,
    latestResponses,
  };
};

export const getSurveyDashboardStats = async ({ tenantId, surveyId }) => {
  if (!tenantId) {
    throw new ValidationError('tenantId is required for survey stats');
  }
  const survey = await Survey.findOne({
    _id: toObjectId(surveyId, 'surveyId'),
    tenantId: toObjectId(tenantId, 'tenantId'),
  })
    .select('_id title slug status publishedAt createdAt updatedAt tenantId')
    .lean();

  if (!survey) {
    throw new NotFoundError('Survey not found');
  }

  const surveyOid = survey._id;
  const tenantOid = survey.tenantId;
  const match = { tenantId: tenantOid, surveyId: surveyOid };

  const [totalResponses, completionAgg, latest, dailyRows, channelRows, lastResponseDoc] =
    await Promise.all([
      Response.countDocuments(match),
      Response.aggregate([
        {
          $match: {
            ...match,
            'metadata.completionTimeSeconds': { $ne: null, $gte: 0 },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgSeconds: { $avg: '$metadata.completionTimeSeconds' },
          },
        },
      ]),
      Response.find(match)
        .sort({ 'metadata.submittedAt': -1, createdAt: -1 })
        .limit(10)
        .select('_id metadata campaignId contactId createdAt')
        .lean(),
      Response.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$metadata.submittedAt',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      CampaignRecipient.aggregate([
        { $match: { tenantId: tenantOid, surveyId: surveyOid } },
        {
          $group: {
            _id: { channel: '$channel', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      Response.findOne(match)
        .sort({ 'metadata.submittedAt': -1, createdAt: -1 })
        .select('metadata.submittedAt createdAt')
        .lean(),
    ]);

  const completionStats = completionAgg[0] ?? { count: 0, avgSeconds: null };
  const channelGrid = buildChannelStatusGrid(channelRows);
  const channelTotals = {};
  for (const channel of CHANNELS) {
    const statuses = channelGrid[channel];
    const sent = sumStatuses(statuses, SEND_STATUSES);
    channelTotals[channel] = {
      sent,
      failed: statuses.failed ?? 0,
      skipped: statuses.skipped ?? 0,
      attempted: RECIPIENT_STATUSES.reduce((acc, s) => acc + (statuses[s] ?? 0), 0),
    };
  }
  const totalSent = CHANNELS.reduce((acc, ch) => acc + channelTotals[ch].sent, 0);
  const responseRate = totalSent > 0 ? Math.round((totalResponses / totalSent) * 10000) / 10000 : null;

  return {
    surveyId: survey._id.toString(),
    tenantId: survey.tenantId.toString(),
    title: survey.title,
    slug: survey.slug,
    status: survey.status,
    publishedAt: survey.publishedAt ?? null,
    totalResponses,
    completedResponses: totalResponses,
    lastResponseAt: lastResponseDoc?.metadata?.submittedAt ?? lastResponseDoc?.createdAt ?? null,
    avgCompletionTimeSeconds:
      completionStats.count > 0 && completionStats.avgSeconds !== null
        ? Math.round(completionStats.avgSeconds * 100) / 100
        : null,
    responsesByDay: dailyRows
      .filter((row) => row?._id)
      .map((row) => ({ date: row._id, count: row.count })),
    channels: channelTotals,
    totalSent,
    responseRate,
    latestResponses: latest.map((doc) => ({
      id: safeToString(doc._id),
      submittedAt: doc.metadata?.submittedAt ?? doc.createdAt ?? null,
      completionTimeSeconds: doc.metadata?.completionTimeSeconds ?? null,
      campaignId: safeToString(doc.campaignId),
      hasContact: Boolean(doc.contactId),
    })),
  };
};

export const getChannelMetrics = async ({ tenantId }) => {
  if (!tenantId) {
    throw new ValidationError('tenantId is required for channel metrics');
  }
  const tenantOid = toObjectId(tenantId, 'tenantId');
  const match = { tenantId: tenantOid };

  const [statusRows, skippedRows, providerRows] = await Promise.all([
    CampaignRecipient.aggregate([
      { $match: match },
      {
        $group: {
          _id: { channel: '$channel', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    CampaignRecipient.aggregate([
      {
        $match: {
          ...match,
          status: 'skipped',
          skippedReason: { $ne: null },
        },
      },
      {
        $group: {
          _id: { channel: '$channel', reason: '$skippedReason' },
          count: { $sum: 1 },
        },
      },
    ]),
    CampaignRecipient.aggregate([
      { $match: { ...match, provider: { $ne: null } } },
      {
        $group: {
          _id: { channel: '$channel', provider: '$provider' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const channelGrid = buildChannelStatusGrid(statusRows);
  const skippedReasons = zeroChannelMap();
  for (const row of skippedRows) {
    const channel = row?._id?.channel;
    const reason = row?._id?.reason;
    if (!channel || !reason) continue;
    skippedReasons[channel][reason] = (skippedReasons[channel][reason] ?? 0) + row.count;
  }
  const providers = zeroChannelMap();
  for (const row of providerRows) {
    const channel = row?._id?.channel;
    const provider = row?._id?.provider;
    if (!channel || !provider) continue;
    providers[channel][provider] = (providers[channel][provider] ?? 0) + row.count;
  }

  const channels = CHANNELS.map((channel) => {
    const statuses = channelGrid[channel];
    const attempted = RECIPIENT_STATUSES.reduce((acc, s) => acc + (statuses[s] ?? 0), 0);
    const sent = sumStatuses(statuses, SEND_STATUSES);
    return {
      channel,
      attempted,
      pending: statuses.pending ?? 0,
      sent,
      delivered: statuses.delivered ?? 0,
      opened: statuses.opened ?? 0,
      clicked: statuses.clicked ?? 0,
      failed: statuses.failed ?? 0,
      skipped: statuses.skipped ?? 0,
      skippedReasons: skippedReasons[channel],
      providers: providers[channel],
    };
  });

  return { channels };
};

const summarizeAuditLog = (log) => ({
  id: safeToString(log._id),
  action: log.action,
  entityType: log.entityType,
  entityId: log.entityId ?? null,
  tenantId: safeToString(log.tenantId),
  userId: safeToString(log.userId),
  createdAt: log.createdAt,
});

export const getRecentActivity = async ({ tenantId, limit = 20, includeGlobal = false }) => {
  const filter = tenantId ? { tenantId: toObjectId(tenantId, 'tenantId') } : {};
  if (tenantId && includeGlobal) {
    // When the caller is allowed to see both tenant-scoped activity and
    // platform-wide actions (super admin metrics), match either branch.
    delete filter.tenantId;
    filter.$or = [{ tenantId: toObjectId(tenantId, 'tenantId') }, { tenantId: null }];
  }
  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('_id action entityType entityId tenantId userId createdAt')
    .lean();
  return logs.map(summarizeAuditLog);
};

export const getAdminMetrics = async ({ limit = 10 } = {}) => {
  const [
    totalClients,
    clientStatusRows,
    totalUsers,
    userRoleRows,
    totalSurveys,
    surveyStatusRows,
    totalResponses,
    totalCampaigns,
    campaignStatusRows,
    channelStatusRows,
    recentTenants,
    recentActivity,
  ] = await Promise.all([
    Tenant.countDocuments({}),
    Tenant.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments({}),
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Survey.countDocuments({}),
    Survey.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Response.countDocuments({}),
    Campaign.countDocuments({}),
    Campaign.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    CampaignRecipient.aggregate([
      {
        $group: {
          _id: { channel: '$channel', status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]),
    Tenant.find({}).sort({ createdAt: -1 }).limit(limit).select('_id name slug status createdAt').lean(),
    getRecentActivity({ tenantId: null, limit }),
  ]);

  const clientsByStatus = { active: 0, suspended: 0, cancelled: 0 };
  for (const row of clientStatusRows) {
    if (row._id && clientsByStatus[row._id] !== undefined) {
      clientsByStatus[row._id] = row.count;
    }
  }

  const usersByRole = {};
  for (const row of userRoleRows) {
    if (!row?._id) continue;
    usersByRole[row._id] = row.count;
  }

  const surveysByStatus = { draft: 0, published: 0, paused: 0, archived: 0 };
  for (const row of surveyStatusRows) {
    if (row._id && surveysByStatus[row._id] !== undefined) {
      surveysByStatus[row._id] = row.count;
    }
  }

  const campaignsByStatus = {};
  for (const row of campaignStatusRows) {
    if (!row?._id) continue;
    campaignsByStatus[row._id] = row.count;
  }

  const channelGrid = buildChannelStatusGrid(channelStatusRows);
  const channels = CHANNELS.map((channel) => {
    const statuses = channelGrid[channel];
    return {
      channel,
      sent: sumStatuses(statuses, SEND_STATUSES),
      failed: statuses.failed ?? 0,
      skipped: statuses.skipped ?? 0,
      attempted: RECIPIENT_STATUSES.reduce((acc, s) => acc + (statuses[s] ?? 0), 0),
    };
  });

  return {
    clients: {
      total: totalClients,
      active: clientsByStatus.active,
      suspended: clientsByStatus.suspended,
      cancelled: clientsByStatus.cancelled,
      inactive: clientsByStatus.suspended + clientsByStatus.cancelled,
      byStatus: clientsByStatus,
    },
    users: { total: totalUsers, byRole: usersByRole },
    surveys: {
      total: totalSurveys,
      active: surveysByStatus.published,
      byStatus: surveysByStatus,
    },
    responses: { total: totalResponses },
    campaigns: { total: totalCampaigns, byStatus: campaignsByStatus },
    channels,
    // Transactions are introduced in a later phase. The shape stays stable so
    // the frontend can render a placeholder section without conditional logic.
    recentTransactions: [],
    recentTenants: recentTenants.map((tenant) => ({
      id: safeToString(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
    })),
    recentActivity,
  };
};

export const __testing = {
  buildChannelStatusGrid,
  buildSurveyPerformanceRows,
  CHANNELS,
  SEND_STATUSES,
  RECIPIENT_STATUSES,
};
