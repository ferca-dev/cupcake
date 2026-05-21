import mongoose from 'mongoose';

import * as repo from './template.repository.js';
import * as surveyRepo from '../surveys/survey.repository.js';
import { parseFormSchema } from '../surveys/form-schema.validator.js';
import { slugify, uniqueSlug, isValidSlug } from '../../common/utils/slug.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  AuthorizationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const TEMPLATE_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'template.created',
  UPDATED: 'template.updated',
  DELETED: 'template.deleted',
  SURVEY_CREATED: 'template.survey_created',
});

const ENTITY_TYPE = 'template';

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const toPublicTemplate = (template) => ({
  id: template._id.toString(),
  tenantId: template.tenantId ? template.tenantId.toString() : null,
  title: template.title,
  description: template.description ?? '',
  category: template.category,
  schema: template.schema,
  isSystemTemplate: Boolean(template.isSystemTemplate),
  status: template.status,
  createdBy: template.createdBy ? template.createdBy.toString() : null,
  updatedBy: template.updatedBy ? template.updatedBy.toString() : null,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
});

const audit = (action, { actor, template, metadata = {}, ip = null, userAgent = null }) =>
  recordAuditEvent({
    action,
    entityType: ENTITY_TYPE,
    entityId: template._id.toString(),
    userId: actor?.id ?? null,
    tenantId: template.tenantId ?? null,
    ip,
    userAgent,
    metadata,
  });

const ensureCallerCanRead = (template, { tenantId, isSuperAdmin }) => {
  if (isSuperAdmin) return;
  if (template.tenantId === null) {
    // System templates are visible to everyone, but only when active.
    if (template.status !== 'active') {
      throw new NotFoundError('Template not found');
    }
    return;
  }
  if (!tenantId || template.tenantId.toString() !== tenantId.toString()) {
    throw new NotFoundError('Template not found');
  }
};

const ensureCallerCanWrite = (template, { tenantId, isSuperAdmin }) => {
  if (template.isSystemTemplate || template.tenantId === null) {
    if (!isSuperAdmin) {
      throw new AuthorizationError('Only super admins can manage system templates');
    }
    return;
  }
  if (!tenantId || template.tenantId.toString() !== tenantId.toString()) {
    throw new NotFoundError('Template not found');
  }
};

const requireTemplate = async ({ id }) => {
  assertObjectId(id, 'template id');
  const template = await repo.findTemplateById({ id });
  if (!template) {
    throw new NotFoundError('Template not found');
  }
  return template;
};

const resolveUniqueSurveySlug = async ({ desired, fallbackSource }) => {
  if (desired) {
    if (!isValidSlug(desired)) {
      throw new ValidationError('Slug must be lowercase letters, numbers, and hyphens');
    }
    const taken = await surveyRepo.slugExists(desired);
    if (taken) {
      throw new ConflictError('A survey with this slug already exists', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    return desired;
  }
  return uniqueSlug(slugify(fallbackSource), async (candidate) =>
    surveyRepo.slugExists(candidate),
  );
};

/**
 * Lists templates visible to the caller. Tenant-bound users see active system
 * templates plus their own tenant's templates. Super admins can browse all
 * templates and optionally filter to a tenant via `tenantId`.
 */
export const listTemplates = async ({ tenantId, isSuperAdmin = false, ...query } = {}) => {
  const result = await repo.findTemplates({ tenantId, isSuperAdmin, ...query });
  return {
    items: result.items.map(toPublicTemplate),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getTemplate = async ({ id, tenantId, isSuperAdmin = false }) => {
  const template = await requireTemplate({ id });
  ensureCallerCanRead(template, { tenantId, isSuperAdmin });
  return toPublicTemplate(template);
};

export const createTemplate = async ({
  tenantId,
  actor,
  payload,
  isSuperAdmin = false,
  ip = null,
  userAgent = null,
}) => {
  // Re-validate the schema explicitly: it must pass the same checks the
  // survey form schema enforces. We accept the parsed value so defaults
  // (visibility shape, layout) are applied uniformly.
  const schema = parseFormSchema(payload.schema);

  const wantsSystem = Boolean(payload.isSystemTemplate);
  if (wantsSystem && !isSuperAdmin) {
    throw new AuthorizationError('Only super admins can create system templates');
  }

  const isSystem = wantsSystem || (isSuperAdmin && !tenantId);
  if (!isSystem && !tenantId) {
    throw new AuthorizationError('Tenant context is required to create a template');
  }

  const template = await repo.createTemplate({
    tenantId: isSystem ? null : tenantId,
    title: payload.title,
    description: payload.description ?? '',
    category: payload.category ?? 'other',
    schema,
    status: payload.status ?? 'active',
    isSystemTemplate: isSystem,
    createdBy: actor?.id ?? null,
  });

  await audit(TEMPLATE_AUDIT_ACTIONS.CREATED, {
    actor,
    template,
    metadata: { title: template.title, isSystem },
    ip,
    userAgent,
  });

  return toPublicTemplate(template);
};

export const updateTemplate = async ({
  id,
  tenantId,
  actor,
  payload,
  isSuperAdmin = false,
  ip = null,
  userAgent = null,
}) => {
  const template = await requireTemplate({ id });
  ensureCallerCanWrite(template, { tenantId, isSuperAdmin });

  const updates = { updatedBy: actor?.id ?? null };

  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.category !== undefined) updates.category = payload.category;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.schema !== undefined) {
    updates.schema = parseFormSchema(payload.schema);
  }

  await repo.updateTemplate(template, updates);

  await audit(TEMPLATE_AUDIT_ACTIONS.UPDATED, {
    actor,
    template,
    metadata: { changedKeys: Object.keys(updates).filter((k) => k !== 'updatedBy') },
    ip,
    userAgent,
  });

  return toPublicTemplate(template);
};

export const deleteTemplate = async ({
  id,
  tenantId,
  actor,
  isSuperAdmin = false,
  ip = null,
  userAgent = null,
}) => {
  const template = await requireTemplate({ id });
  ensureCallerCanWrite(template, { tenantId, isSuperAdmin });

  await audit(TEMPLATE_AUDIT_ACTIONS.DELETED, {
    actor,
    template,
    metadata: { title: template.title, isSystem: template.isSystemTemplate },
    ip,
    userAgent,
  });
  await repo.deleteTemplate(template);
  return { id: template._id.toString() };
};

/**
 * Creates a new `draft` survey for the calling tenant from a template. The
 * template's schema is **duplicated** (cloned) into the survey — editing the
 * survey later must not mutate the template, and vice versa.
 */
export const createSurveyFromTemplate = async ({
  id,
  tenantId,
  actor,
  payload = {},
  isSuperAdmin = false,
  ip = null,
  userAgent = null,
}) => {
  if (!tenantId) {
    throw new AuthorizationError('Tenant context is required to create a survey from a template');
  }
  const template = await requireTemplate({ id });
  ensureCallerCanRead(template, { tenantId, isSuperAdmin });

  if (template.status !== 'active') {
    throw new ConflictError('Inactive templates cannot be used to create surveys');
  }

  // Re-validate the schema before duplicating: a template stored before a
  // validator tightening must not produce a malformed draft survey.
  const validatedSchema = parseFormSchema(template.schema);
  // Deep clone via JSON to break every reference and Mongoose-tracked
  // sub-document binding before persisting into the new survey.
  const clonedSchema = JSON.parse(JSON.stringify(validatedSchema));

  const title = payload?.title?.trim() || template.title;
  const slug = await resolveUniqueSurveySlug({
    desired: payload?.slug,
    fallbackSource: title,
  });

  const survey = await surveyRepo.createSurvey({
    tenantId,
    title,
    description:
      payload?.description !== undefined ? payload.description : template.description ?? null,
    slug,
    status: 'draft',
    currentDraftSchema: clonedSchema,
    settings: {},
    createdBy: actor.id,
  });

  await audit(TEMPLATE_AUDIT_ACTIONS.SURVEY_CREATED, {
    actor,
    template,
    metadata: { surveyId: survey._id.toString(), surveyTitle: survey.title },
    ip,
    userAgent,
  });

  // Mirror survey.created in audit log so dashboards still see the new
  // survey alongside hand-created ones.
  await recordAuditEvent({
    action: 'survey.created',
    entityType: 'survey',
    entityId: survey._id.toString(),
    userId: actor.id,
    tenantId: survey.tenantId,
    ip,
    userAgent,
    metadata: {
      title: survey.title,
      slug: survey.slug,
      templateId: template._id.toString(),
      source: 'template',
    },
  });

  return {
    survey: {
      id: survey._id.toString(),
      tenantId: survey.tenantId.toString(),
      title: survey.title,
      description: survey.description ?? null,
      slug: survey.slug,
      status: survey.status,
      currentDraftSchema: survey.currentDraftSchema,
      publishedVersionId: null,
      settings: survey.settings,
      createdBy: survey.createdBy.toString(),
      updatedBy: null,
      publishedAt: null,
      archivedAt: null,
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
    },
    template: { id: template._id.toString(), title: template.title },
  };
};

export const __testing = { toPublicTemplate };
