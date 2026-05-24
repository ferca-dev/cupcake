import { Survey } from './survey.model.js';
import { SurveyVersion } from './survey-version.model.js';

/**
 * Scopes a Mongo filter to the supplied tenant. `tenantId` may be `null` for
 * super-admin global lookups; callers that should *never* allow that case
 * must enforce it before delegating here.
 */
export const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

export const findSurveys = async ({
  tenantId,
  status,
  search,
  page = 1,
  limit = 20,
  sort = '-updatedAt',
} = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (search) {
    // Escape regex meta-characters so user input cannot turn into a pattern.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escaped, $options: 'i' };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Survey.find(filter).sort(sort).skip(skip).limit(limit),
    Survey.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const findSurveyById = async ({ id, tenantId = null }) =>
  Survey.findOne(tenantFilter({ _id: id }, tenantId));

export const findSurveyBySlug = async (slug, { tenantId = null } = {}) =>
  Survey.findOne(tenantFilter({ slug }, tenantId));

export const findVersionById = async ({ id, tenantId = null }) =>
  SurveyVersion.findOne(tenantFilter({ _id: id }, tenantId));

export const slugExists = async (slug, { excludeId = null } = {}) => {
  const filter = { slug };
  if (excludeId) filter._id = { $ne: excludeId };
  const doc = await Survey.exists(filter);
  return Boolean(doc);
};

export const createSurvey = async (payload) => Survey.create(payload);

export const updateSurvey = async (survey, updates) => {
  Object.assign(survey, updates);
  await survey.save();
  return survey;
};

export const deleteSurvey = async (survey) => survey.deleteOne();

export const findVersionsBySurvey = async ({ surveyId, tenantId = null }) =>
  SurveyVersion.find(tenantFilter({ surveyId }, tenantId)).sort({ versionNumber: -1 });

export const findLatestVersionNumber = async ({ surveyId }) => {
  const latest = await SurveyVersion.findOne({ surveyId })
    .sort({ versionNumber: -1 })
    .select({ versionNumber: 1 });
  return latest?.versionNumber ?? 0;
};

export const createSurveyVersion = async (payload) => SurveyVersion.create(payload);
