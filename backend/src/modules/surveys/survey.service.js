import mongoose from 'mongoose';

import * as repo from './survey.repository.js';
import { parseFormSchema, emptyFormSchema } from './form-schema.validator.js';
import { slugify, uniqueSlug, isValidSlug } from '../../common/utils/slug.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { getSurveyDashboardStats } from '../dashboard/dashboard.service.js';

export const SURVEY_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'survey.created',
  UPDATED: 'survey.updated',
  DELETED: 'survey.deleted',
  PUBLISHED: 'survey.published',
  PAUSED: 'survey.paused',
  ARCHIVED: 'survey.archived',
  DUPLICATED: 'survey.duplicated',
});

const ENTITY_TYPE = 'survey';

const toPublicSurvey = (survey) => ({
  id: survey._id.toString(),
  tenantId: survey.tenantId.toString(),
  title: survey.title,
  description: survey.description ?? null,
  slug: survey.slug,
  status: survey.status,
  currentDraftSchema: survey.currentDraftSchema ?? null,
  publishedVersionId: survey.publishedVersionId ? survey.publishedVersionId.toString() : null,
  settings: survey.settings,
  createdBy: survey.createdBy ? survey.createdBy.toString() : null,
  updatedBy: survey.updatedBy ? survey.updatedBy.toString() : null,
  publishedAt: survey.publishedAt ?? null,
  archivedAt: survey.archivedAt ?? null,
  createdAt: survey.createdAt,
  updatedAt: survey.updatedAt,
});

const toPublicVersion = (version) => ({
  id: version._id.toString(),
  tenantId: version.tenantId.toString(),
  surveyId: version.surveyId.toString(),
  versionNumber: version.versionNumber,
  schema: version.schema,
  settings: version.settings ?? null,
  publishedBy: version.publishedBy ? version.publishedBy.toString() : null,
  publishedAt: version.publishedAt,
  createdAt: version.createdAt,
  updatedAt: version.updatedAt,
});

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const resolveUniqueSlug = async ({ desired, fallbackSource, excludeId = null }) => {
  if (desired) {
    if (!isValidSlug(desired)) {
      throw new ValidationError('Slug must be lowercase letters, numbers, and hyphens');
    }
    const taken = await repo.slugExists(desired, { excludeId });
    if (taken) {
      throw new ConflictError('A survey with this slug already exists', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    return desired;
  }
  return uniqueSlug(slugify(fallbackSource), async (candidate) =>
    repo.slugExists(candidate, { excludeId }),
  );
};

const ensureTenant = (tenantId) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required');
  }
  return tenantId.toString();
};

const requireSurvey = async ({ id, tenantId, allowSuperAdminGlobal = false }) => {
  assertObjectId(id, 'survey id');
  const survey = await repo.findSurveyById({
    id,
    tenantId: allowSuperAdminGlobal && !tenantId ? null : tenantId,
  });
  if (!survey) {
    throw new NotFoundError('Survey not found');
  }
  return survey;
};

const audit = (action, { actor, survey, metadata = {}, ip = null, userAgent = null }) =>
  recordAuditEvent({
    action,
    entityType: ENTITY_TYPE,
    entityId: survey._id.toString(),
    userId: actor?.id ?? null,
    tenantId: survey.tenantId,
    ip,
    userAgent,
    metadata,
  });

/**
 * Lists surveys for the caller's tenant. Super admins can omit `tenantId`
 * (handled by the controller) — the repository only filters by tenant when a
 * value is supplied.
 */
export const listSurveys = async ({ tenantId, ...query }) => {
  const result = await repo.findSurveys({ tenantId, ...query });
  return {
    items: result.items.map(toPublicSurvey),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getSurvey = async ({ id, tenantId, allowSuperAdminGlobal = false }) => {
  const survey = await requireSurvey({ id, tenantId, allowSuperAdminGlobal });
  return toPublicSurvey(survey);
};

export const createSurvey = async ({ tenantId, actor, payload, ip = null, userAgent = null }) => {
  const tenant = ensureTenant(tenantId);
  const schema = payload.schema ? parseFormSchema(payload.schema) : emptyFormSchema();
  const slug = await resolveUniqueSlug({
    desired: payload.slug,
    fallbackSource: payload.title,
  });

  const survey = await repo.createSurvey({
    tenantId: tenant,
    title: payload.title,
    description: payload.description ?? null,
    slug,
    status: 'draft',
    currentDraftSchema: schema,
    settings: payload.settings ?? {},
    createdBy: actor.id,
  });

  await audit(SURVEY_AUDIT_ACTIONS.CREATED, {
    actor,
    survey,
    metadata: { title: survey.title, slug: survey.slug },
    ip,
    userAgent,
  });

  return toPublicSurvey(survey);
};

export const updateSurvey = async ({
  id,
  tenantId,
  actor,
  payload,
  ip = null,
  userAgent = null,
}) => {
  const survey = await requireSurvey({ id, tenantId });
  if (survey.status === 'archived') {
    throw new ConflictError('Archived surveys cannot be modified');
  }

  const updates = { updatedBy: actor.id };

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.settings !== undefined) {
    updates.settings = { ...(survey.settings ?? {}), ...payload.settings };
  }
  if (payload.slug !== undefined && payload.slug !== survey.slug) {
    updates.slug = await resolveUniqueSlug({
      desired: payload.slug,
      fallbackSource: payload.title ?? survey.title,
      excludeId: survey._id,
    });
  }
  if (payload.schema !== undefined) {
    updates.currentDraftSchema = parseFormSchema(payload.schema);
  }

  await repo.updateSurvey(survey, updates);

  await audit(SURVEY_AUDIT_ACTIONS.UPDATED, {
    actor,
    survey,
    metadata: { changedKeys: Object.keys(updates).filter((k) => k !== 'updatedBy') },
    ip,
    userAgent,
  });

  return toPublicSurvey(survey);
};

export const deleteSurvey = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const survey = await requireSurvey({ id, tenantId });
  if (survey.status === 'archived') {
    // Hard-delete on archived surveys is intentional — archive is the
    // reversible state, delete is the destructive escape hatch.
  }
  await audit(SURVEY_AUDIT_ACTIONS.DELETED, {
    actor,
    survey,
    metadata: { title: survey.title, slug: survey.slug, status: survey.status },
    ip,
    userAgent,
  });
  await repo.deleteSurvey(survey);
  return { id: survey._id.toString() };
};

export const publishSurvey = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const survey = await requireSurvey({ id, tenantId });

  if (survey.status === 'archived') {
    throw new ConflictError('Archived surveys cannot be published');
  }
  const draftSchema = survey.currentDraftSchema;
  if (!draftSchema || !Array.isArray(draftSchema.fields) || draftSchema.fields.length === 0) {
    throw new ValidationError('Cannot publish a survey with an empty schema');
  }

  // Re-validate the draft so a malformed schema stored historically cannot
  // sneak into an immutable version record.
  const validatedSchema = parseFormSchema(draftSchema);

  const nextVersionNumber = (await repo.findLatestVersionNumber({ surveyId: survey._id })) + 1;

  const now = new Date();
  // Snapshot the live settings into the version so public submissions read a
  // frozen copy. Without this, editing settings after publish could silently
  // loosen response limits or change messaging mid-flight.
  const settingsSnapshot =
    typeof survey.settings?.toObject === 'function'
      ? survey.settings.toObject()
      : { ...(survey.settings ?? {}) };

  const version = await repo.createSurveyVersion({
    tenantId: survey.tenantId,
    surveyId: survey._id,
    versionNumber: nextVersionNumber,
    schema: validatedSchema,
    settings: settingsSnapshot,
    publishedBy: actor.id,
    publishedAt: now,
  });

  survey.status = 'published';
  survey.publishedVersionId = version._id;
  survey.publishedAt = now;
  survey.updatedBy = actor.id;
  await survey.save();

  await audit(SURVEY_AUDIT_ACTIONS.PUBLISHED, {
    actor,
    survey,
    metadata: {
      versionId: version._id.toString(),
      versionNumber: version.versionNumber,
    },
    ip,
    userAgent,
  });

  return { survey: toPublicSurvey(survey), version: toPublicVersion(version) };
};

export const pauseSurvey = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const survey = await requireSurvey({ id, tenantId });
  if (survey.status !== 'published') {
    throw new ConflictError('Only published surveys can be paused');
  }
  survey.status = 'paused';
  survey.updatedBy = actor.id;
  await survey.save();
  await audit(SURVEY_AUDIT_ACTIONS.PAUSED, { actor, survey, ip, userAgent });
  return toPublicSurvey(survey);
};

export const archiveSurvey = async ({ id, tenantId, actor, ip = null, userAgent = null }) => {
  const survey = await requireSurvey({ id, tenantId });
  if (survey.status === 'archived') {
    throw new ConflictError('Survey is already archived');
  }
  survey.status = 'archived';
  survey.archivedAt = new Date();
  survey.updatedBy = actor.id;
  await survey.save();
  await audit(SURVEY_AUDIT_ACTIONS.ARCHIVED, { actor, survey, ip, userAgent });
  return toPublicSurvey(survey);
};

export const duplicateSurvey = async ({
  id,
  tenantId,
  actor,
  payload = {},
  ip = null,
  userAgent = null,
}) => {
  const source = await requireSurvey({ id, tenantId });
  const tenant = ensureTenant(tenantId ?? source.tenantId);

  const newTitle = payload?.title?.trim() || `${source.title} (copy)`;
  const slug = await resolveUniqueSlug({
    desired: payload?.slug,
    fallbackSource: newTitle,
  });

  const duplicate = await repo.createSurvey({
    tenantId: tenant,
    title: newTitle,
    description: source.description ?? null,
    slug,
    status: 'draft',
    currentDraftSchema: source.currentDraftSchema ?? emptyFormSchema(),
    settings: source.settings,
    createdBy: actor.id,
  });

  await audit(SURVEY_AUDIT_ACTIONS.DUPLICATED, {
    actor,
    survey: duplicate,
    metadata: { sourceSurveyId: source._id.toString() },
    ip,
    userAgent,
  });

  return toPublicSurvey(duplicate);
};

export const listVersions = async ({ id, tenantId }) => {
  const survey = await requireSurvey({ id, tenantId });
  const versions = await repo.findVersionsBySurvey({
    surveyId: survey._id,
    tenantId: survey.tenantId,
  });
  return versions.map(toPublicVersion);
};

/**
 * Returns survey-level analytics powered by the dashboard aggregation layer.
 * The survey is loaded under the caller's tenant scope first so the dashboard
 * query cannot accidentally read across tenants.
 */
export const getSurveyStats = async ({ id, tenantId }) => {
  const survey = await requireSurvey({ id, tenantId });
  return getSurveyDashboardStats({
    tenantId: survey.tenantId.toString(),
    surveyId: survey._id.toString(),
  });
};

export const __testing = { toPublicSurvey, toPublicVersion };
