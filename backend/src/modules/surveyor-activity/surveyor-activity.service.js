import mongoose from 'mongoose';

import { Response } from '../responses/response.model.js';
import { Survey } from '../surveys/survey.model.js';
import { User } from '../users/user.model.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { buildCsv } from '../reports/report.csv.js';
import { buildXlsx } from '../../common/utils/tabular-export.js';
import { ValidationError } from '../../common/errors/index.js';

export const SURVEYOR_ACTIVITY_AUDIT_ACTIONS = Object.freeze({
  LOCATION_VIEWED: 'surveyor_activity.location.viewed',
  LOCATION_EXPORTED: 'surveyor_activity.location.exported',
});

const LOW_ACCURACY_METERS = 100;
const REPEATED_LOCATION_THRESHOLD = 3;
const BURST_WINDOW_MINUTES = 10;
const BURST_THRESHOLD = 10;
const IMPOSSIBLE_SPEED_KMH = 200;

const toObjectId = (value, label) => {
  if (!value) return null;
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
};

const stringifyId = (value) => (value ? value.toString() : null);

const submittedAtOf = (response) =>
  response?.metadata?.submittedAt ?? response?.createdAt ?? response?.updatedAt ?? null;

const hasLocation = (response) => {
  const location = response?.metadata?.location ?? {};
  return typeof location.latitude === 'number' && typeof location.longitude === 'number';
};

const isLowAccuracy = (response) => {
  const accuracy = response?.metadata?.location?.accuracyMeters;
  return typeof accuracy === 'number' && accuracy > LOW_ACCURACY_METERS;
};

const locationKey = (response) => {
  if (!hasLocation(response)) return null;
  const { latitude, longitude } = response.metadata.location;
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
};

const dayKey = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
};

const buildMatch = ({ tenantId, filters = {}, surveyorId = null }) => {
  if (!tenantId) throw new ValidationError('tenantId is required');
  const match = {
    tenantId: toObjectId(tenantId, 'tenantId'),
    respondentType: 'surveyor',
  };
  if (surveyorId || filters.surveyorId) {
    match.submittedByUserId = toObjectId(surveyorId ?? filters.surveyorId, 'surveyorId');
  }
  if (filters.surveyId) match.surveyId = toObjectId(filters.surveyId, 'surveyId');
  if (filters.surveyVersionId) {
    match.surveyVersionId = toObjectId(filters.surveyVersionId, 'surveyVersionId');
  }
  if (filters.campaignId) match.campaignId = toObjectId(filters.campaignId, 'campaignId');
  if (filters.from || filters.to) {
    const submittedAt = {};
    if (filters.from) submittedAt.$gte = new Date(filters.from);
    if (filters.to) submittedAt.$lte = new Date(filters.to);
    match['metadata.submittedAt'] = mongoose.trusted(submittedAt);
  }
  if (filters.locationStatus === 'present') {
    match['metadata.location.latitude'] = mongoose.trusted({ $type: 'number' });
    match['metadata.location.longitude'] = mongoose.trusted({ $type: 'number' });
  } else if (filters.locationStatus === 'missing') {
    match.$or = [
      { 'metadata.location.latitude': null },
      { 'metadata.location.longitude': null },
      { 'metadata.location': null },
    ];
  } else if (filters.locationStatus === 'low_accuracy') {
    match['metadata.location.accuracyMeters'] = mongoose.trusted({ $gt: LOW_ACCURACY_METERS });
  }
  if (filters.completionStatus === 'completed') {
    match['metadata.submittedAt'] =
      match['metadata.submittedAt'] ?? mongoose.trusted({ $ne: null });
  } else if (filters.completionStatus === 'partial') {
    match['metadata.submittedAt'] = null;
  }
  return match;
};

const loadUsersAndSurveys = async ({ tenantId, responses }) => {
  const surveyorIds = [
    ...new Set(responses.map((item) => stringifyId(item.submittedByUserId)).filter(Boolean)),
  ];
  const surveyIds = [
    ...new Set(responses.map((item) => stringifyId(item.surveyId)).filter(Boolean)),
  ];

  const [users, surveys] = await Promise.all([
    User.find({ tenantId, _id: mongoose.trusted({ $in: surveyorIds }) })
      .select('_id name email role')
      .lean(),
    Survey.find({ tenantId, _id: mongoose.trusted({ $in: surveyIds }) })
      .select('_id title slug')
      .lean(),
  ]);

  return {
    usersById: new Map(users.map((user) => [user._id.toString(), user])),
    surveysById: new Map(surveys.map((survey) => [survey._id.toString(), survey])),
  };
};

const distanceKm = (a, b) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const radius = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
};

const suspiciousFlagsFor = (response, context) => {
  const flags = [];
  if (!hasLocation(response)) flags.push('missing_location');
  if (isLowAccuracy(response)) flags.push('low_accuracy');
  const repeatedCount = context.repeatedLocationCounts.get(locationKey(response)) ?? 0;
  if (repeatedCount >= REPEATED_LOCATION_THRESHOLD) flags.push('repeated_same_location');
  if (context.impossibleTravelIds.has(response._id.toString()))
    flags.push('impossible_travel_speed');
  if (context.burstIds.has(response._id.toString())) flags.push('unusual_submission_burst');
  return flags;
};

const buildSuspiciousContext = (responses) => {
  const repeatedLocationCounts = new Map();
  const burstIds = new Set();
  const impossibleTravelIds = new Set();
  const bySurveyor = new Map();

  for (const response of responses) {
    const key = `${stringifyId(response.submittedByUserId)}:${locationKey(response) ?? 'missing'}`;
    if (locationKey(response)) {
      repeatedLocationCounts.set(key, (repeatedLocationCounts.get(key) ?? 0) + 1);
    }
    const surveyorId = stringifyId(response.submittedByUserId) ?? 'unknown';
    bySurveyor.set(surveyorId, [...(bySurveyor.get(surveyorId) ?? []), response]);
  }

  for (const group of bySurveyor.values()) {
    const sorted = [...group].sort(
      (a, b) => new Date(submittedAtOf(a)) - new Date(submittedAtOf(b)),
    );
    for (let index = 0; index < sorted.length; index += 1) {
      const current = sorted[index];
      const currentAt = new Date(submittedAtOf(current));
      const windowStart = currentAt.getTime() - BURST_WINDOW_MINUTES * 60 * 1000;
      const inWindow = sorted.filter((candidate) => {
        const at = new Date(submittedAtOf(candidate)).getTime();
        return at >= windowStart && at <= currentAt.getTime();
      });
      if (inWindow.length >= BURST_THRESHOLD) {
        for (const item of inWindow) burstIds.add(item._id.toString());
      }

      const previous = sorted[index - 1];
      if (previous && hasLocation(previous) && hasLocation(current)) {
        const previousAt = new Date(submittedAtOf(previous));
        const hours = (currentAt.getTime() - previousAt.getTime()) / 3_600_000;
        if (hours > 0) {
          const kmh = distanceKm(previous.metadata.location, current.metadata.location) / hours;
          if (kmh > IMPOSSIBLE_SPEED_KMH) impossibleTravelIds.add(current._id.toString());
        }
      }
    }
  }

  return { repeatedLocationCounts, burstIds, impossibleTravelIds };
};

const toActivityRow = ({ response, usersById, surveysById, suspiciousContext }) => {
  const surveyor = usersById.get(stringifyId(response.submittedByUserId)) ?? null;
  const survey = surveysById.get(stringifyId(response.surveyId)) ?? null;
  const location = response.metadata?.location ?? {};
  const hasCoords = hasLocation(response);
  const submittedAt = submittedAtOf(response);
  return {
    id: response._id.toString(),
    tenantId: response.tenantId.toString(),
    surveyId: stringifyId(response.surveyId),
    surveyTitle: survey?.title ?? null,
    surveySlug: survey?.slug ?? null,
    surveyVersionId: stringifyId(response.surveyVersionId),
    surveyorId: stringifyId(response.submittedByUserId),
    surveyorName: surveyor?.name ?? null,
    surveyorEmail: surveyor?.email ?? null,
    campaignId: stringifyId(response.campaignId),
    submittedAt,
    completionStatus: submittedAt ? 'completed' : 'partial',
    completionTimeSeconds: response.metadata?.completionTimeSeconds ?? null,
    answerCount: response.answers?.length ?? 0,
    locationStatus: !hasCoords ? 'missing' : isLowAccuracy(response) ? 'low_accuracy' : 'present',
    location: hasCoords
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracyMeters ?? null,
          permissionStatus: location.permissionStatus ?? null,
          source: location.source ?? null,
          capturedAt: location.capturedAt ?? null,
        }
      : null,
    suspiciousFlags: suspiciousFlagsFor(response, {
      ...suspiciousContext,
      repeatedLocationCounts: new Map(
        [...suspiciousContext.repeatedLocationCounts].map(([key, count]) => [
          key.split(':').slice(1).join(':'),
          count,
        ]),
      ),
    }),
  };
};

const loadRows = async ({ tenantId, filters = {}, limit = 10000, page = 1, surveyorId = null }) => {
  const match = buildMatch({ tenantId, filters, surveyorId });
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Response.find(match)
      .sort({ 'metadata.submittedAt': -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Response.countDocuments(match),
  ]);
  const allForFlags = await Response.find(match)
    .sort({ 'metadata.submittedAt': 1, createdAt: 1 })
    .select('_id submittedByUserId metadata.location metadata.submittedAt createdAt')
    .lean();
  const lookup = await loadUsersAndSurveys({ tenantId, responses: items });
  const suspiciousContext = buildSuspiciousContext(allForFlags);
  return {
    items: items.map((response) => toActivityRow({ response, ...lookup, suspiciousContext })),
    total,
    page,
    limit,
  };
};

const countFlags = (rows) => {
  const counts = {
    missingLocation: 0,
    lowAccuracy: 0,
    repeatedSameLocation: 0,
    impossibleTravelSpeed: 0,
    unusualSubmissionBurst: 0,
  };
  for (const row of rows) {
    if (row.suspiciousFlags.includes('missing_location')) counts.missingLocation += 1;
    if (row.suspiciousFlags.includes('low_accuracy')) counts.lowAccuracy += 1;
    if (row.suspiciousFlags.includes('repeated_same_location')) counts.repeatedSameLocation += 1;
    if (row.suspiciousFlags.includes('impossible_travel_speed')) counts.impossibleTravelSpeed += 1;
    if (row.suspiciousFlags.includes('unusual_submission_burst'))
      counts.unusualSubmissionBurst += 1;
  }
  return counts;
};

export const getSummary = async ({ actor, tenantId, filters }) => {
  const result = await loadRows({ tenantId, filters, limit: 50000, page: 1 });
  const rows = result.items;
  const bySurveyor = new Map();
  const bySurvey = new Map();
  const byDate = new Map();
  const byLocationStatus = new Map([
    ['present', 0],
    ['missing', 0],
    ['low_accuracy', 0],
  ]);

  for (const row of rows) {
    const surveyorKey = row.surveyorId ?? 'unknown';
    const surveyor = bySurveyor.get(surveyorKey) ?? {
      surveyorId: row.surveyorId,
      surveyorName: row.surveyorName,
      surveyorEmail: row.surveyorEmail,
      totalResponses: 0,
      withLocation: 0,
      missingLocation: 0,
      lowAccuracy: 0,
    };
    surveyor.totalResponses += 1;
    if (row.locationStatus === 'missing') surveyor.missingLocation += 1;
    else surveyor.withLocation += 1;
    if (row.locationStatus === 'low_accuracy') surveyor.lowAccuracy += 1;
    bySurveyor.set(surveyorKey, surveyor);

    const surveyKey = row.surveyId ?? 'unknown';
    const survey = bySurvey.get(surveyKey) ?? {
      surveyId: row.surveyId,
      surveyTitle: row.surveyTitle,
      totalResponses: 0,
    };
    survey.totalResponses += 1;
    bySurvey.set(surveyKey, survey);

    const date = dayKey(row.submittedAt);
    byDate.set(date, (byDate.get(date) ?? 0) + 1);
    byLocationStatus.set(row.locationStatus, (byLocationStatus.get(row.locationStatus) ?? 0) + 1);
  }

  return {
    totals: {
      responses: rows.length,
      surveyors: bySurveyor.size,
      surveys: bySurvey.size,
      withLocation: rows.filter((row) => row.locationStatus !== 'missing').length,
      missingLocation: rows.filter((row) => row.locationStatus === 'missing').length,
      lowAccuracy: rows.filter((row) => row.locationStatus === 'low_accuracy').length,
    },
    suspicious: countFlags(rows),
    bySurveyor: [...bySurveyor.values()].sort((a, b) => b.totalResponses - a.totalResponses),
    bySurvey: [...bySurvey.values()].sort((a, b) => b.totalResponses - a.totalResponses),
    byDate: [...byDate.entries()]
      .map(([date, totalResponses]) => ({ date, totalResponses }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byLocationStatus: [...byLocationStatus.entries()].map(([status, totalResponses]) => ({
      status,
      totalResponses,
    })),
    requestedBy: actor?.id ?? null,
  };
};

export const listResponses = async ({ actor, tenantId, filters, page, limit, ip, userAgent }) => {
  const result = await loadRows({ tenantId, filters, page, limit });
  await recordAuditEvent({
    action: SURVEYOR_ACTIVITY_AUDIT_ACTIONS.LOCATION_VIEWED,
    entityType: 'surveyor_activity',
    userId: actor.id,
    tenantId,
    ip,
    userAgent,
    metadata: { view: 'responses', filters, resultCount: result.items.length },
  });
  return {
    items: result.items,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 0,
    },
  };
};

export const getMapData = async ({ actor, tenantId, filters, limit, ip, userAgent }) => {
  const result = await loadRows({
    tenantId,
    filters,
    page: 1,
    limit,
  });
  const points = result.items
    .filter((row) => row.location)
    .map((row) => ({
      responseId: row.id,
      surveyorId: row.surveyorId,
      surveyorName: row.surveyorName,
      surveyId: row.surveyId,
      surveyTitle: row.surveyTitle,
      submittedAt: row.submittedAt,
      latitude: row.location.latitude,
      longitude: row.location.longitude,
      accuracyMeters: row.location.accuracyMeters,
      suspiciousFlags: row.suspiciousFlags,
    }));

  await recordAuditEvent({
    action: SURVEYOR_ACTIVITY_AUDIT_ACTIONS.LOCATION_VIEWED,
    entityType: 'surveyor_activity',
    userId: actor.id,
    tenantId,
    ip,
    userAgent,
    metadata: { view: 'map', filters, resultCount: points.length },
  });

  return { points, total: points.length };
};

const exportColumns = Object.freeze([
  { key: 'submittedAt', label: 'Submitted at' },
  { key: 'surveyorName', label: 'Surveyor name' },
  { key: 'surveyorEmail', label: 'Surveyor email' },
  { key: 'surveyTitle', label: 'Survey' },
  { key: 'surveyVersionId', label: 'Survey version ID' },
  { key: 'campaignId', label: 'Campaign ID' },
  { key: 'completionStatus', label: 'Completion status' },
  { key: 'completionTimeSeconds', label: 'Completion time seconds' },
  { key: 'answerCount', label: 'Answer count' },
  { key: 'locationStatus', label: 'Location status' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'accuracyMeters', label: 'Accuracy meters' },
  { key: 'permissionStatus', label: 'Location permission' },
  { key: 'source', label: 'Location source' },
  { key: 'suspiciousFlags', label: 'Suspicious flags' },
]);

const exportRows = (rows) =>
  rows.map((row) => ({
    ...row,
    submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : '',
    latitude: row.location?.latitude ?? null,
    longitude: row.location?.longitude ?? null,
    accuracyMeters: row.location?.accuracyMeters ?? null,
    permissionStatus: row.location?.permissionStatus ?? null,
    source: row.location?.source ?? null,
    suspiciousFlags: row.suspiciousFlags.join('|'),
  }));

export const buildExport = async ({ actor, tenantId, filters, format, limit, ip, userAgent }) => {
  const result = await loadRows({ tenantId, filters, page: 1, limit });
  const rows = exportRows(result.items);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const body =
    format === 'xlsx'
      ? await buildXlsx(exportColumns, rows, { sheetName: 'Surveyor Activity' })
      : buildCsv(exportColumns, rows);

  await recordAuditEvent({
    action: SURVEYOR_ACTIVITY_AUDIT_ACTIONS.LOCATION_EXPORTED,
    entityType: 'surveyor_activity',
    userId: actor.id,
    tenantId,
    ip,
    userAgent,
    metadata: { filters, format, resultCount: rows.length },
  });

  return {
    body,
    format,
    filename: `surveyor-activity-${timestamp}.${format}`,
    rowCount: rows.length,
  };
};

export const getSurveyorDetail = async ({ tenantId, filters, surveyorId }) => {
  const result = await loadRows({ tenantId, filters, surveyorId, page: 1, limit: 50000 });
  return {
    surveyorId,
    summary: await getSummary({ tenantId, filters: { ...filters, surveyorId } }),
    recentResponses: result.items.slice(0, 25),
  };
};
