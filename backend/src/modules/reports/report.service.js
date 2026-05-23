import mongoose from 'mongoose';

import { Survey } from '../surveys/survey.model.js';
import { SurveyVersion } from '../surveys/survey-version.model.js';
import { Response } from '../responses/response.model.js';
import { CampaignRecipient } from '../campaigns/campaign-recipient.model.js';
import { ValidationError, NotFoundError } from '../../common/errors/index.js';
import { buildCsv } from './report.csv.js';

const CAMPAIGN_CHANNELS = Object.freeze(['email', 'sms', 'whatsapp']);
const ALL_REPORT_CHANNELS = Object.freeze([...CAMPAIGN_CHANNELS, 'public_link']);
const RECIPIENT_STATUSES = Object.freeze([
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'failed',
  'skipped',
]);

const INPUT_FIELD_TYPES = Object.freeze([
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'date',
  'time',
  'select',
  'radio_group',
  'checkbox_group',
  'checkbox',
  'yes_no',
  'rating',
  'nps',
  'file_upload',
  'hidden',
]);

const NUMERIC_FIELD_TYPES = new Set(['number', 'rating', 'nps']);
const OPTIONED_FIELD_TYPES = new Set(['select', 'radio_group', 'checkbox_group']);
const SCALAR_BOOLEAN_FIELD_TYPES = new Set(['checkbox', 'yes_no']);
const TEXT_FIELD_TYPES = new Set(['short_text', 'long_text', 'email', 'phone', 'hidden']);

const toObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
};

const roundTo = (value, places = 4) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const safeToString = (value) => (value ? value.toString() : null);

const stableValueKey = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const valueIsEmpty = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const coerceNumeric = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
};

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const trimmedMean = (values, trimPct = 0.1) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (!trimmed.length) return sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
};

/**
 * Loads the survey under the caller's tenant scope. The tenantId is mandatory
 * for client reports — the service refuses to run without one so cross-tenant
 * lookups cannot happen by accident.
 */
export const loadSurveyForReport = async ({ surveyId, tenantId }) => {
  if (!tenantId) {
    throw new ValidationError('tenantId is required to read survey reports');
  }
  const survey = await Survey.findOne({
    _id: toObjectId(surveyId, 'surveyId'),
    tenantId: toObjectId(tenantId, 'tenantId'),
  }).lean();

  if (!survey) {
    throw new NotFoundError('Survey not found');
  }

  return survey;
};

/**
 * Returns the schema/version pair used to label answers. Order of preference:
 *   1. explicit `surveyVersionId` filter (and the version must belong to the
 *      same tenant + survey)
 *   2. the survey's published version
 *   3. the latest version on file (covers surveys that have been published
 *      and then unpublished)
 *   4. `currentDraftSchema` for never-published draft surveys, returned with
 *      a synthetic descriptor so the rest of the pipeline does not branch
 */
const resolveReportSchema = async ({ survey, surveyVersionId }) => {
  if (surveyVersionId) {
    const version = await SurveyVersion.findOne({
      _id: toObjectId(surveyVersionId, 'surveyVersionId'),
      surveyId: survey._id,
      tenantId: survey.tenantId,
    }).lean();
    if (!version) throw new NotFoundError('Survey version not found for this survey');
    return { version, schema: version.schema ?? null };
  }
  if (survey.publishedVersionId) {
    const version = await SurveyVersion.findById(survey.publishedVersionId).lean();
    if (version) return { version, schema: version.schema ?? null };
  }
  const latest = await SurveyVersion.findOne({
    surveyId: survey._id,
    tenantId: survey.tenantId,
  })
    .sort({ versionNumber: -1 })
    .lean();
  if (latest) return { version: latest, schema: latest.schema ?? null };
  return { version: null, schema: survey.currentDraftSchema ?? null };
};

const buildBaseResponseMatch = ({ survey, filters }) => {
  const match = {
    tenantId: survey.tenantId,
    surveyId: survey._id,
  };
  if (filters.surveyVersionId) {
    match.surveyVersionId = toObjectId(filters.surveyVersionId, 'surveyVersionId');
  }
  if (filters.campaignId) {
    match.campaignId = toObjectId(filters.campaignId, 'campaignId');
  }
  if (filters.from || filters.to) {
    const submittedAt = {};
    if (filters.from) submittedAt.$gte = new Date(filters.from);
    if (filters.to) submittedAt.$lte = new Date(filters.to);
    // `mongoose.trusted` opts past the global `sanitizeFilter` which strips
    // raw operator objects from filter values unless we declare them safe.
    match['metadata.submittedAt'] = mongoose.trusted(submittedAt);
  }
  if (filters.channel === 'public_link') {
    match.campaignRecipientId = null;
  }
  return match;
};

const buildBaseRecipientMatch = ({ survey, filters }) => {
  const match = {
    tenantId: survey.tenantId,
    surveyId: survey._id,
  };
  if (filters.surveyVersionId) {
    match.surveyVersionId = toObjectId(filters.surveyVersionId, 'surveyVersionId');
  }
  if (filters.campaignId) {
    match.campaignId = toObjectId(filters.campaignId, 'campaignId');
  }
  if (filters.channel && filters.channel !== 'public_link') {
    match.channel = filters.channel;
  }
  return match;
};

/**
 * For channel filters that target campaign-bound responses we need to look up
 * the recipient documents (so we can filter responses by `campaignRecipientId`
 * matching that channel). When the filter is `public_link` we already restrict
 * via `campaignRecipientId: null` in `buildBaseResponseMatch`.
 */
const resolveResponseMatch = async ({ survey, filters }) => {
  const match = buildBaseResponseMatch({ survey, filters });

  if (filters.channel && filters.channel !== 'public_link') {
    const recipientIds = await CampaignRecipient.find({
      tenantId: survey.tenantId,
      surveyId: survey._id,
      channel: filters.channel,
      ...(filters.campaignId ? { campaignId: toObjectId(filters.campaignId, 'campaignId') } : {}),
    })
      .select('_id')
      .lean();
    const ids = recipientIds.map((doc) => doc._id);
    if (ids.length === 0) {
      // No recipients on that channel — make the match return nothing rather
      // than silently dropping the filter.
      match._id = null;
    } else {
      match.campaignRecipientId = mongoose.trusted({ $in: ids });
    }
  }

  return match;
};

const aggregateRecipientFunnel = async ({ survey, filters }) => {
  const match = buildBaseRecipientMatch({ survey, filters });
  const rows = await CampaignRecipient.aggregate([
    { $match: match },
    {
      $group: {
        _id: { channel: '$channel', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);
  const skippedRows = await CampaignRecipient.aggregate([
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
  ]);

  const empty = () => Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0]));
  const grid = {};
  for (const channel of CAMPAIGN_CHANNELS) grid[channel] = empty();
  for (const row of rows) {
    const channel = row?._id?.channel;
    const status = row?._id?.status;
    if (!channel || !status) continue;
    if (!grid[channel]) grid[channel] = empty();
    grid[channel][status] = (grid[channel][status] ?? 0) + (row.count ?? 0);
  }

  const skippedReasons = {};
  for (const channel of CAMPAIGN_CHANNELS) skippedReasons[channel] = {};
  for (const row of skippedRows) {
    const channel = row?._id?.channel;
    const reason = row?._id?.reason;
    if (!channel || !reason) continue;
    if (!skippedReasons[channel]) skippedReasons[channel] = {};
    skippedReasons[channel][reason] = (skippedReasons[channel][reason] ?? 0) + (row.count ?? 0);
  }

  return { grid, skippedReasons };
};

const aggregateResponseCountsByChannel = async ({ survey, filters }) => {
  // Map every response in scope onto its delivery channel by joining
  // campaign_recipients. Responses without a recipient document are counted
  // as `public_link` — the synthetic channel for anonymous public access.
  const match = buildBaseResponseMatch({ survey, filters });
  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: CampaignRecipient.collection.collectionName,
        localField: 'campaignRecipientId',
        foreignField: '_id',
        as: 'recipient',
        pipeline: [{ $project: { channel: 1 } }],
      },
    },
    {
      $addFields: {
        resolvedChannel: {
          $cond: [
            { $eq: [{ $size: '$recipient' }, 0] },
            'public_link',
            { $arrayElemAt: ['$recipient.channel', 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$resolvedChannel',
        count: { $sum: 1 },
      },
    },
  ];
  const rows = await Response.aggregate(pipeline);
  const byChannel = Object.fromEntries(ALL_REPORT_CHANNELS.map((c) => [c, 0]));
  for (const row of rows) {
    const channel = row?._id;
    if (!channel) continue;
    if (!Object.prototype.hasOwnProperty.call(byChannel, channel)) byChannel[channel] = 0;
    byChannel[channel] += row.count ?? 0;
  }
  return byChannel;
};

const aggregateDurationStats = async ({ survey, filters }) => {
  const match = await resolveResponseMatch({ survey, filters });
  if (match._id === null) {
    return {
      count: 0,
      averageSeconds: null,
      medianSeconds: null,
      minSeconds: null,
      maxSeconds: null,
      p25Seconds: null,
      p75Seconds: null,
      trimmedMeanSeconds: null,
    };
  }
  const durations = await Response.find(
    {
      ...match,
      'metadata.completionTimeSeconds': mongoose.trusted({ $ne: null, $gte: 0 }),
    },
    { 'metadata.completionTimeSeconds': 1, _id: 0 },
  )
    .lean()
    .then((rows) =>
      rows
        .map((row) => Number(row?.metadata?.completionTimeSeconds))
        .filter((n) => Number.isFinite(n) && n >= 0),
    );

  if (durations.length === 0) {
    return {
      count: 0,
      averageSeconds: null,
      medianSeconds: null,
      minSeconds: null,
      maxSeconds: null,
      p25Seconds: null,
      p75Seconds: null,
      trimmedMeanSeconds: null,
    };
  }

  const sum = durations.reduce((a, b) => a + b, 0);
  return {
    count: durations.length,
    averageSeconds: roundTo(sum / durations.length, 2),
    medianSeconds: roundTo(median(durations), 2),
    minSeconds: roundTo(Math.min(...durations), 2),
    maxSeconds: roundTo(Math.max(...durations), 2),
    p25Seconds: roundTo(percentile(durations, 25), 2),
    p75Seconds: roundTo(percentile(durations, 75), 2),
    trimmedMeanSeconds: roundTo(trimmedMean(durations, 0.1), 2),
  };
};

/**
 * Returns an array of field descriptors derived from the version schema. The
 * descriptors keep the original order so drop-off and funnel views can walk
 * them sequentially.
 */
const enumerateSchemaFields = (schema) => {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return fields
    .filter((field) => INPUT_FIELD_TYPES.includes(field.type))
    .map((field, index) => ({
      id: field.id,
      key: field.key ?? null,
      label: field.label ?? field.key ?? field.id,
      type: field.type,
      order: typeof field.order === 'number' ? field.order : index,
      options: Array.isArray(field.options) ? field.options : [],
      sectionId: field.sectionId ?? null,
    }))
    .sort((a, b) => a.order - b.order);
};

/**
 * Walks the schema's fields and groups them into pages bounded by
 * `page_break` blocks. Returns a list of `{ pageIndex, label, fieldIds }`.
 * Used by drop-off analysis to count respondents who reached each page.
 */
const enumerateSchemaPages = (schema) => {
  const allFields = Array.isArray(schema?.fields) ? schema.fields : [];
  const ordered = [...allFields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const pages = [{ pageIndex: 1, label: 'Page 1', fieldIds: [] }];
  for (const field of ordered) {
    if (field.type === 'page_break') {
      pages.push({
        pageIndex: pages.length + 1,
        label: field.label?.trim() || `Page ${pages.length + 1}`,
        fieldIds: [],
      });
      continue;
    }
    if (INPUT_FIELD_TYPES.includes(field.type)) {
      pages[pages.length - 1].fieldIds.push(field.id);
    }
  }
  return pages;
};

const fetchResponsesForJsLevel = async ({ survey, filters, limit = 50000 }) => {
  const match = await resolveResponseMatch({ survey, filters });
  if (match._id === null) return [];
  return Response.find(match)
    .select(
      '_id surveyVersionId answers campaignRecipientId campaignId contactId metadata createdAt',
    )
    .limit(limit)
    .sort({ 'metadata.submittedAt': 1, createdAt: 1 })
    .lean();
};

const buildEmptyOverview = (survey) => ({
  surveyId: safeToString(survey._id),
  tenantId: safeToString(survey.tenantId),
  title: survey.title,
  slug: survey.slug,
  status: survey.status,
  publishedAt: survey.publishedAt ?? null,
  generatedAt: new Date().toISOString(),
  totals: {
    totalResponses: 0,
    completedResponses: 0,
    partialResponses: 0,
    audienceSize: 0,
    started: 0,
    completed: 0,
    sentCount: 0,
    deliveredCount: 0,
    openedCount: 0,
    clickedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    pendingCount: 0,
    anonymousResponses: 0,
  },
  rates: {
    responseRate: null,
    completionRate: null,
    deliveryRate: null,
    openRate: null,
    clickRate: null,
    failureRate: null,
    skipRate: null,
  },
  duration: {
    count: 0,
    averageSeconds: null,
    medianSeconds: null,
    minSeconds: null,
    maxSeconds: null,
    p25Seconds: null,
    p75Seconds: null,
    trimmedMeanSeconds: null,
  },
  firstResponseAt: null,
  lastResponseAt: null,
});

export const getOverviewReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const baseShape = buildEmptyOverview(survey);

  const responseMatch = await resolveResponseMatch({ survey, filters });

  const [recipientFunnel, responseAggregate, byChannelResponses, duration, audienceCount] =
    await Promise.all([
      aggregateRecipientFunnel({ survey, filters }),
      responseMatch._id === null
        ? Promise.resolve([])
        : Response.aggregate([
            { $match: responseMatch },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                firstSubmittedAt: { $min: '$metadata.submittedAt' },
                lastSubmittedAt: { $max: '$metadata.submittedAt' },
              },
            },
          ]),
      aggregateResponseCountsByChannel({ survey, filters }),
      aggregateDurationStats({ survey, filters }),
      CampaignRecipient.countDocuments(buildBaseRecipientMatch({ survey, filters })),
    ]);

  const grid = recipientFunnel.grid;
  const totalsByStatus = Object.fromEntries(RECIPIENT_STATUSES.map((s) => [s, 0]));
  for (const channel of CAMPAIGN_CHANNELS) {
    const row = grid[channel] ?? {};
    for (const status of RECIPIENT_STATUSES) {
      totalsByStatus[status] += row[status] ?? 0;
    }
  }
  const sentCount =
    totalsByStatus.sent + totalsByStatus.delivered + totalsByStatus.opened + totalsByStatus.clicked;
  const deliveredCount = totalsByStatus.delivered + totalsByStatus.opened + totalsByStatus.clicked;
  const openedCount = totalsByStatus.opened + totalsByStatus.clicked;
  const clickedCount = totalsByStatus.clicked;
  const failedCount = totalsByStatus.failed;
  const skippedCount = totalsByStatus.skipped;
  const pendingCount = totalsByStatus.pending;

  const responseRow = responseAggregate[0] ?? null;
  const totalResponses = responseRow?.count ?? 0;
  const anonymousResponses = byChannelResponses.public_link ?? 0;

  // The current data model only persists completed responses, so completed
  // equals total. Started is approximated by audience size when audience
  // exists; otherwise by totalResponses so the funnel reads sensibly.
  const audienceSize = audienceCount ?? 0;
  const startedCount = audienceSize > 0 ? Math.max(sentCount, totalResponses) : totalResponses;

  const safeRate = (num, denom) => (denom > 0 ? roundTo(num / denom, 4) : null);

  return {
    ...baseShape,
    generatedAt: new Date().toISOString(),
    totals: {
      ...baseShape.totals,
      totalResponses,
      completedResponses: totalResponses,
      partialResponses: 0,
      audienceSize,
      started: startedCount,
      completed: totalResponses,
      sentCount,
      deliveredCount,
      openedCount,
      clickedCount,
      failedCount,
      skippedCount,
      pendingCount,
      anonymousResponses,
    },
    rates: {
      responseRate: safeRate(totalResponses, audienceSize),
      completionRate: safeRate(totalResponses, startedCount),
      deliveryRate: safeRate(deliveredCount, sentCount),
      openRate: safeRate(openedCount, sentCount),
      clickRate: safeRate(clickedCount, sentCount),
      failureRate: safeRate(failedCount, audienceSize),
      skipRate: safeRate(skippedCount, audienceSize),
    },
    duration,
    firstResponseAt: responseRow?.firstSubmittedAt ?? null,
    lastResponseAt: responseRow?.lastSubmittedAt ?? null,
    filters: { ...filters },
  };
};

export const getChannelsReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const [{ grid, skippedReasons }, responsesByChannel] = await Promise.all([
    aggregateRecipientFunnel({ survey, filters }),
    aggregateResponseCountsByChannel({ survey, filters }),
  ]);

  const channels = ALL_REPORT_CHANNELS.map((channel) => {
    if (channel === 'public_link') {
      const responses = responsesByChannel.public_link ?? 0;
      return {
        channel,
        attempted: 0,
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        responses,
        responseRate: null,
        skippedReasons: {},
      };
    }
    const row = grid[channel] ?? {};
    const attempted = RECIPIENT_STATUSES.reduce((acc, s) => acc + (row[s] ?? 0), 0);
    const sent = (row.sent ?? 0) + (row.delivered ?? 0) + (row.opened ?? 0) + (row.clicked ?? 0);
    const delivered = (row.delivered ?? 0) + (row.opened ?? 0) + (row.clicked ?? 0);
    const opened = (row.opened ?? 0) + (row.clicked ?? 0);
    const clicked = row.clicked ?? 0;
    const failed = row.failed ?? 0;
    const skipped = row.skipped ?? 0;
    const pending = row.pending ?? 0;
    const responses = responsesByChannel[channel] ?? 0;
    return {
      channel,
      attempted,
      sent,
      delivered,
      opened,
      clicked,
      failed,
      skipped,
      pending,
      responses,
      responseRate: sent > 0 ? roundTo(responses / sent, 4) : null,
      skippedReasons: skippedReasons[channel] ?? {},
    };
  });

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    channels,
    filters: { ...filters },
  };
};

const computeQuestionStats = (descriptor, accumulator, totalResponses) => {
  const distribution = Array.from(accumulator.distribution, ([value, count]) => ({
    value,
    label: accumulator.optionLabels.get(value) ?? value,
    count,
  })).sort((a, b) => b.count - a.count);

  const responseCount = accumulator.count;
  const skipCount = Math.max(totalResponses - responseCount, 0);

  const base = {
    fieldId: descriptor.id,
    key: descriptor.key,
    label: descriptor.label,
    type: descriptor.type,
    order: descriptor.order,
    totalResponses,
    responseCount,
    skipCount,
    responseRate: totalResponses > 0 ? roundTo(responseCount / totalResponses, 4) : null,
  };

  if (
    OPTIONED_FIELD_TYPES.has(descriptor.type) ||
    SCALAR_BOOLEAN_FIELD_TYPES.has(descriptor.type)
  ) {
    base.distribution = distribution;
  }

  if (NUMERIC_FIELD_TYPES.has(descriptor.type) && accumulator.numericValues.length > 0) {
    const values = accumulator.numericValues;
    const sum = values.reduce((a, b) => a + b, 0);
    base.numericSummary = {
      count: values.length,
      sum: roundTo(sum, 2),
      average: roundTo(sum / values.length, 2),
      median: roundTo(median(values), 2),
      min: roundTo(Math.min(...values), 2),
      max: roundTo(Math.max(...values), 2),
    };
    if (descriptor.type === 'nps') {
      const buckets = { promoters: 0, passives: 0, detractors: 0 };
      for (const value of values) {
        if (value >= 9) buckets.promoters += 1;
        else if (value >= 7) buckets.passives += 1;
        else buckets.detractors += 1;
      }
      const total = values.length;
      base.nps = {
        promoters: buckets.promoters,
        passives: buckets.passives,
        detractors: buckets.detractors,
        promoterRate: total > 0 ? roundTo(buckets.promoters / total, 4) : null,
        passiveRate: total > 0 ? roundTo(buckets.passives / total, 4) : null,
        detractorRate: total > 0 ? roundTo(buckets.detractors / total, 4) : null,
        score:
          total > 0 ? roundTo(((buckets.promoters - buckets.detractors) / total) * 100, 2) : null,
      };
    }
    if (descriptor.type === 'rating') {
      base.rating = {
        average: base.numericSummary.average,
        median: base.numericSummary.median,
        min: base.numericSummary.min,
        max: base.numericSummary.max,
        distribution,
      };
    }
  }

  if (TEXT_FIELD_TYPES.has(descriptor.type) && distribution.length > 0) {
    base.topValues = distribution.slice(0, 10);
  }

  return base;
};

export const getQuestionsReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const { version, schema } = await resolveReportSchema({
    survey,
    surveyVersionId: filters.surveyVersionId,
  });

  const descriptors = enumerateSchemaFields(schema);
  const responses = await fetchResponsesForJsLevel({ survey, filters });
  const totalResponses = responses.length;

  // Pre-populate an accumulator per schema field so empty results still
  // produce a stable, zero-filled report shape.
  const accumulators = new Map();
  for (const descriptor of descriptors) {
    const optionLabels = new Map();
    for (const opt of descriptor.options) optionLabels.set(opt.key, opt.label);
    if (descriptor.type === 'yes_no') {
      optionLabels.set('yes', 'Yes');
      optionLabels.set('no', 'No');
    }
    if (descriptor.type === 'checkbox') {
      optionLabels.set('true', 'Checked');
      optionLabels.set('false', 'Unchecked');
    }
    accumulators.set(descriptor.id, {
      count: 0,
      distribution: new Map(),
      optionLabels,
      numericValues: [],
    });
  }

  for (const response of responses) {
    const answers = Array.isArray(response.answers) ? response.answers : [];
    for (const answer of answers) {
      if (!accumulators.has(answer.fieldId)) {
        // Answer belongs to a field that is not in the resolved schema —
        // either an older version field or a draft-only field. Register it
        // lazily so reports still surface the data, with a synthetic label.
        accumulators.set(answer.fieldId, {
          count: 0,
          distribution: new Map(),
          optionLabels: new Map(),
          numericValues: [],
        });
        descriptors.push({
          id: answer.fieldId,
          key: answer.key ?? null,
          label: answer.key ?? answer.fieldId,
          type: answer.type ?? 'unknown',
          order: descriptors.length + 1000,
          options: [],
          sectionId: null,
        });
      }
      if (valueIsEmpty(answer.value)) continue;
      const acc = accumulators.get(answer.fieldId);
      acc.count += 1;
      if (Array.isArray(answer.value)) {
        for (const entry of answer.value) {
          if (valueIsEmpty(entry)) continue;
          const key = stableValueKey(entry);
          if (key === null) continue;
          acc.distribution.set(key, (acc.distribution.get(key) ?? 0) + 1);
        }
      } else {
        const key = stableValueKey(answer.value);
        if (key !== null) {
          acc.distribution.set(key, (acc.distribution.get(key) ?? 0) + 1);
        }
        const numeric = coerceNumeric(answer.value);
        if (numeric !== null) acc.numericValues.push(numeric);
      }
    }
  }

  const questions = descriptors.map((descriptor) =>
    computeQuestionStats(descriptor, accumulators.get(descriptor.id), totalResponses),
  );

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    surveyVersion: version
      ? {
          id: safeToString(version._id),
          versionNumber: version.versionNumber,
          publishedAt: version.publishedAt ?? null,
        }
      : null,
    totalResponses,
    questions,
    filters: { ...filters },
  };
};

export const getTrendsReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const responseMatch = await resolveResponseMatch({ survey, filters });

  if (responseMatch._id === null) {
    return {
      surveyId: safeToString(survey._id),
      tenantId: safeToString(survey.tenantId),
      byDay: [],
      byDayChannel: [],
      filters: { ...filters },
    };
  }

  const dailyRows = await Response.aggregate([
    { $match: responseMatch },
    {
      $lookup: {
        from: CampaignRecipient.collection.collectionName,
        localField: 'campaignRecipientId',
        foreignField: '_id',
        as: 'recipient',
        pipeline: [{ $project: { channel: 1 } }],
      },
    },
    {
      $addFields: {
        resolvedChannel: {
          $cond: [
            { $eq: [{ $size: '$recipient' }, 0] },
            'public_link',
            { $arrayElemAt: ['$recipient.channel', 0] },
          ],
        },
        day: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$metadata.submittedAt',
          },
        },
      },
    },
    {
      $group: {
        _id: { day: '$day', channel: '$resolvedChannel' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.day': 1 } },
  ]);

  const totalsByDay = new Map();
  const byDayChannel = [];
  for (const row of dailyRows) {
    const day = row?._id?.day;
    const channel = row?._id?.channel;
    if (!day || !channel) continue;
    if (!totalsByDay.has(day)) {
      totalsByDay.set(day, {
        date: day,
        total: 0,
        channels: Object.fromEntries(ALL_REPORT_CHANNELS.map((c) => [c, 0])),
      });
    }
    const entry = totalsByDay.get(day);
    entry.total += row.count ?? 0;
    if (Object.prototype.hasOwnProperty.call(entry.channels, channel)) {
      entry.channels[channel] += row.count ?? 0;
    }
    byDayChannel.push({ date: day, channel, count: row.count ?? 0 });
  }

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    byDay: Array.from(totalsByDay.values()).sort((a, b) => (a.date < b.date ? -1 : 1)),
    byDayChannel,
    filters: { ...filters },
  };
};

export const getDropOffReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const { version, schema } = await resolveReportSchema({
    survey,
    surveyVersionId: filters.surveyVersionId,
  });

  const fieldDescriptors = enumerateSchemaFields(schema);
  const pages = enumerateSchemaPages(schema);
  const responses = await fetchResponsesForJsLevel({ survey, filters });
  const totalResponses = responses.length;

  const fieldCounts = new Map();
  for (const descriptor of fieldDescriptors) fieldCounts.set(descriptor.id, 0);
  const pageCounts = new Array(pages.length).fill(0);

  for (const response of responses) {
    const answeredIds = new Set();
    for (const answer of response.answers ?? []) {
      if (!valueIsEmpty(answer.value)) answeredIds.add(answer.fieldId);
    }
    for (const descriptor of fieldDescriptors) {
      if (answeredIds.has(descriptor.id)) {
        fieldCounts.set(descriptor.id, (fieldCounts.get(descriptor.id) ?? 0) + 1);
      }
    }
    for (let i = 0; i < pages.length; i += 1) {
      const reached = pages[i].fieldIds.some((id) => answeredIds.has(id));
      if (reached) pageCounts[i] += 1;
    }
  }

  let previousFieldCount = totalResponses;
  const fields = fieldDescriptors.map((descriptor) => {
    const count = fieldCounts.get(descriptor.id) ?? 0;
    const droppedFromPrevious = Math.max(previousFieldCount - count, 0);
    const dropRate =
      previousFieldCount > 0 ? roundTo(droppedFromPrevious / previousFieldCount, 4) : null;
    const row = {
      fieldId: descriptor.id,
      key: descriptor.key,
      label: descriptor.label,
      type: descriptor.type,
      order: descriptor.order,
      reached: count,
      droppedFromPrevious,
      dropRateFromPrevious: dropRate,
    };
    previousFieldCount = count;
    return row;
  });

  let previousPageCount = totalResponses;
  const pagesOut = pages.map((page, index) => {
    const reached = pageCounts[index];
    const droppedFromPrevious = Math.max(previousPageCount - reached, 0);
    const dropRate =
      previousPageCount > 0 ? roundTo(droppedFromPrevious / previousPageCount, 4) : null;
    previousPageCount = reached;
    return {
      pageIndex: page.pageIndex,
      label: page.label,
      fieldCount: page.fieldIds.length,
      reached,
      droppedFromPrevious,
      dropRateFromPrevious: dropRate,
    };
  });

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    surveyVersion: version
      ? {
          id: safeToString(version._id),
          versionNumber: version.versionNumber,
          publishedAt: version.publishedAt ?? null,
        }
      : null,
    totalResponses,
    pages: pagesOut,
    fields,
    filters: { ...filters },
  };
};

export const getTimingReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const responseMatch = await resolveResponseMatch({ survey, filters });

  if (responseMatch._id === null) {
    return {
      surveyId: safeToString(survey._id),
      tenantId: safeToString(survey.tenantId),
      duration: {
        count: 0,
        averageSeconds: null,
        medianSeconds: null,
        minSeconds: null,
        maxSeconds: null,
        p25Seconds: null,
        p75Seconds: null,
        trimmedMeanSeconds: null,
      },
      distribution: [],
      hourlyDistribution: [],
      weekdayDistribution: [],
      filters: { ...filters },
    };
  }

  const responses = await Response.find(responseMatch)
    .select('metadata.submittedAt metadata.completionTimeSeconds')
    .lean();

  const durations = responses
    .map((row) => Number(row?.metadata?.completionTimeSeconds))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const duration = (() => {
    if (durations.length === 0) {
      return {
        count: 0,
        averageSeconds: null,
        medianSeconds: null,
        minSeconds: null,
        maxSeconds: null,
        p25Seconds: null,
        p75Seconds: null,
        trimmedMeanSeconds: null,
      };
    }
    const sum = durations.reduce((a, b) => a + b, 0);
    return {
      count: durations.length,
      averageSeconds: roundTo(sum / durations.length, 2),
      medianSeconds: roundTo(median(durations), 2),
      minSeconds: roundTo(Math.min(...durations), 2),
      maxSeconds: roundTo(Math.max(...durations), 2),
      p25Seconds: roundTo(percentile(durations, 25), 2),
      p75Seconds: roundTo(percentile(durations, 75), 2),
      trimmedMeanSeconds: roundTo(trimmedMean(durations, 0.1), 2),
    };
  })();

  // Bucket durations into a handful of human-friendly bands so the UI can
  // render a histogram without inferring its own buckets.
  const buckets = [
    { label: '0-30s', min: 0, max: 30 },
    { label: '30s-1m', min: 30, max: 60 },
    { label: '1-2m', min: 60, max: 120 },
    { label: '2-5m', min: 120, max: 300 },
    { label: '5-10m', min: 300, max: 600 },
    { label: '10m+', min: 600, max: Infinity },
  ];
  const distribution = buckets.map((bucket) => ({
    label: bucket.label,
    minSeconds: bucket.min,
    maxSeconds: Number.isFinite(bucket.max) ? bucket.max : null,
    count: durations.filter((d) => d >= bucket.min && d < bucket.max).length,
  }));

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const weekday = Array.from({ length: 7 }, (_, day) => ({ weekday: day, count: 0 }));
  for (const response of responses) {
    const ts = response?.metadata?.submittedAt;
    if (!ts) continue;
    const date = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(date.getTime())) continue;
    hourly[date.getUTCHours()].count += 1;
    weekday[date.getUTCDay()].count += 1;
  }

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    duration,
    distribution,
    hourlyDistribution: hourly,
    weekdayDistribution: weekday,
    filters: { ...filters },
  };
};

export const getVersionsReport = async ({ surveyId, tenantId, filters = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const versions = await SurveyVersion.find({
    tenantId: survey.tenantId,
    surveyId: survey._id,
  })
    .sort({ versionNumber: -1 })
    .lean();

  const responseCounts = await Response.aggregate([
    { $match: { tenantId: survey.tenantId, surveyId: survey._id } },
    { $group: { _id: '$surveyVersionId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map();
  for (const row of responseCounts) {
    if (!row?._id) continue;
    countMap.set(row._id.toString(), row.count ?? 0);
  }

  return {
    surveyId: safeToString(survey._id),
    tenantId: safeToString(survey.tenantId),
    publishedVersionId: safeToString(survey.publishedVersionId),
    versions: versions.map((version) => ({
      id: safeToString(version._id),
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt ?? null,
      publishedBy: safeToString(version.publishedBy),
      fieldCount: Array.isArray(version.schema?.fields) ? version.schema.fields.length : 0,
      responseCount: countMap.get(version._id.toString()) ?? 0,
      isCurrentlyPublished: survey.publishedVersionId?.toString() === version._id.toString(),
    })),
    filters: { ...filters },
  };
};

/**
 * Builds an export payload. Honours `type` (responses vs question summaries)
 * and `format` (csv vs json). For raw response exports each schema field
 * becomes a column so analysts can pivot or filter downstream.
 */
export const buildExport = async ({ surveyId, tenantId, filters = {}, options = {} }) => {
  const survey = await loadSurveyForReport({ surveyId, tenantId });
  const { schema, version } = await resolveReportSchema({
    survey,
    surveyVersionId: filters.surveyVersionId,
  });

  const limit = options.limit ?? 10000;

  if (options.type === 'questions') {
    const report = await getQuestionsReport({ surveyId, tenantId, filters });
    const rows = report.questions.flatMap((question) => {
      const baseRow = {
        fieldId: question.fieldId,
        key: question.key ?? '',
        label: question.label ?? '',
        type: question.type,
        totalResponses: question.totalResponses,
        responseCount: question.responseCount,
        skipCount: question.skipCount,
        responseRate: question.responseRate ?? '',
      };
      if (Array.isArray(question.distribution) && question.distribution.length > 0) {
        return question.distribution.map((dist) => ({
          ...baseRow,
          optionValue: dist.value,
          optionLabel: dist.label ?? dist.value,
          optionCount: dist.count,
        }));
      }
      return [{ ...baseRow, optionValue: '', optionLabel: '', optionCount: '' }];
    });
    const columns = [
      { key: 'fieldId', label: 'Field ID' },
      { key: 'key', label: 'Key' },
      { key: 'label', label: 'Label' },
      { key: 'type', label: 'Type' },
      { key: 'totalResponses', label: 'Total responses' },
      { key: 'responseCount', label: 'Responses' },
      { key: 'skipCount', label: 'Skipped' },
      { key: 'responseRate', label: 'Response rate' },
      { key: 'optionValue', label: 'Option value' },
      { key: 'optionLabel', label: 'Option label' },
      { key: 'optionCount', label: 'Option count' },
    ];
    if (options.format === 'json') {
      return {
        format: 'json',
        filename: `survey-${survey.slug}-questions-${Date.now()}.json`,
        body: JSON.stringify({ columns, rows }, null, 2),
      };
    }
    return {
      format: 'csv',
      filename: `survey-${survey.slug}-questions-${Date.now()}.csv`,
      body: buildCsv(columns, rows),
    };
  }

  // Default: raw responses export.
  const descriptors = enumerateSchemaFields(schema);
  const responses = await fetchResponsesForJsLevel({ survey, filters, limit });

  // Resolve channels for the responses in a single batch query so each row
  // can carry its delivery channel without N+1 lookups.
  const recipientIds = [
    ...new Set(
      responses
        .map((r) => r.campaignRecipientId?.toString())
        .filter((id) => typeof id === 'string'),
    ),
  ];
  const recipientChannelMap = new Map();
  if (recipientIds.length > 0) {
    const recipients = await CampaignRecipient.find({
      _id: mongoose.trusted({ $in: recipientIds.map((id) => new mongoose.Types.ObjectId(id)) }),
    })
      .select('_id channel')
      .lean();
    for (const recipient of recipients) {
      recipientChannelMap.set(recipient._id.toString(), recipient.channel);
    }
  }

  const baseColumns = [
    { key: 'responseId', label: 'Response ID' },
    { key: 'submittedAt', label: 'Submitted at' },
    { key: 'channel', label: 'Channel' },
    { key: 'surveyVersionId', label: 'Survey version' },
    { key: 'campaignId', label: 'Campaign ID' },
    { key: 'campaignRecipientId', label: 'Campaign recipient ID' },
    { key: 'contactId', label: 'Contact ID' },
    { key: 'completionTimeSeconds', label: 'Completion time (s)' },
  ];

  const fieldColumns = descriptors.map((descriptor) => ({
    key: `field:${descriptor.id}`,
    label: descriptor.label || descriptor.key || descriptor.id,
  }));

  const columns = [...baseColumns, ...fieldColumns];

  const rows = responses.map((response) => {
    const row = {
      responseId: safeToString(response._id),
      submittedAt: response.metadata?.submittedAt
        ? new Date(response.metadata.submittedAt).toISOString()
        : '',
      channel:
        recipientChannelMap.get(response.campaignRecipientId?.toString() ?? '') ?? 'public_link',
      surveyVersionId: safeToString(response.surveyVersionId),
      campaignId: safeToString(response.campaignId) ?? '',
      campaignRecipientId: safeToString(response.campaignRecipientId) ?? '',
      contactId: safeToString(response.contactId) ?? '',
      completionTimeSeconds: response.metadata?.completionTimeSeconds ?? '',
    };
    const answerByField = new Map();
    for (const answer of response.answers ?? []) {
      answerByField.set(answer.fieldId, answer.value);
    }
    for (const descriptor of descriptors) {
      const value = answerByField.get(descriptor.id);
      row[`field:${descriptor.id}`] = value ?? '';
    }
    return row;
  });

  if (options.format === 'json') {
    return {
      format: 'json',
      filename: `survey-${survey.slug}-responses-${Date.now()}.json`,
      body: JSON.stringify({ columns, rows, version: version?.versionNumber ?? null }, null, 2),
    };
  }
  return {
    format: 'csv',
    filename: `survey-${survey.slug}-responses-${Date.now()}.csv`,
    body: buildCsv(columns, rows),
  };
};

export const __testing = {
  ALL_REPORT_CHANNELS,
  enumerateSchemaFields,
  enumerateSchemaPages,
  median,
  percentile,
  trimmedMean,
  roundTo,
  valueIsEmpty,
  coerceNumeric,
  stableValueKey,
};
