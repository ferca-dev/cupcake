import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { slugify, uniqueSlug } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const demoDraftSchema = () => ({
  fields: [
    {
      id: 'field_name',
      type: 'short_text',
      key: 'customer_name',
      label: 'Your name',
      placeholder: 'Write your name',
      helpText: '',
      required: true,
      order: 1,
      sectionId: null,
      options: [],
      validation: { minLength: 1, maxLength: 120, min: null, max: null, regex: null },
      visibility: { mode: 'always', rules: [] },
      settings: { width: 'full', imageUrl: null },
    },
    {
      id: 'field_feedback',
      type: 'long_text',
      key: 'feedback',
      label: 'How was your experience?',
      placeholder: '',
      helpText: '',
      required: false,
      order: 2,
      sectionId: null,
      options: [],
      validation: { minLength: null, maxLength: 1000, min: null, max: null, regex: null },
      visibility: { mode: 'always', rules: [] },
      settings: { width: 'full', imageUrl: null },
    },
  ],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const demoPublishedSchema = () => ({
  fields: [
    {
      id: 'field_rating',
      type: 'rating',
      key: 'rating',
      label: 'How would you rate us?',
      placeholder: '',
      helpText: '1 = bad, 5 = excellent',
      required: true,
      order: 1,
      sectionId: null,
      options: [],
      validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
      visibility: { mode: 'always', rules: [] },
      settings: { width: 'full', imageUrl: null },
    },
    {
      id: 'field_email',
      type: 'email',
      key: 'email',
      label: 'Your email (optional)',
      placeholder: 'name@example.com',
      helpText: '',
      required: false,
      order: 2,
      sectionId: null,
      options: [],
      validation: { minLength: null, maxLength: 200, min: null, max: null, regex: null },
      visibility: { mode: 'always', rules: [] },
      settings: { width: 'full', imageUrl: null },
    },
  ],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const ensureSurvey = async ({ tenant, owner, title, status, schema }) => {
  const baseSlug = slugify(title);
  let existing = await Survey.findOne({ tenantId: tenant._id, title });
  if (existing) {
    return existing;
  }
  const slug = await uniqueSlug(baseSlug, async (candidate) => {
    const found = await Survey.exists({ slug: candidate });
    return Boolean(found);
  });
  return Survey.create({
    tenantId: tenant._id,
    title,
    description: null,
    slug,
    status: status === 'published' ? 'draft' : status,
    currentDraftSchema: schema,
    settings: {},
    createdBy: owner._id,
  });
};

/**
 * Seeds the demo tenant with one draft survey and one published survey
 * (with its first immutable version). Idempotent on title — running again
 * does not duplicate documents.
 */
export const seedSurveys = async () => {
  const env = loadEnv();
  const tenantSlug = slugify(env.DEMO_TENANT_NAME);
  const tenant =
    (await Tenant.findOne({ slug: tenantSlug })) ??
    (await Tenant.findOne({ name: env.DEMO_TENANT_NAME }));
  if (!tenant) {
    logger.warn('Demo tenant missing — run seed-auth first');
    return { draft: null, published: null };
  }
  const owner = await User.findOne({ email: env.DEMO_CLIENT_EMAIL.toLowerCase() });
  if (!owner) {
    logger.warn('Demo client missing — run seed-auth first');
    return { draft: null, published: null };
  }

  const draft = await ensureSurvey({
    tenant,
    owner,
    title: 'Demo draft survey',
    status: 'draft',
    schema: demoDraftSchema(),
  });

  let published = await Survey.findOne({
    tenantId: tenant._id,
    title: 'Demo published survey',
  });

  if (!published) {
    published = await ensureSurvey({
      tenant,
      owner,
      title: 'Demo published survey',
      status: 'draft',
      schema: demoPublishedSchema(),
    });
  }

  if (published.status !== 'published') {
    const now = new Date();
    const version = await SurveyVersion.create({
      tenantId: tenant._id,
      surveyId: published._id,
      versionNumber: 1,
      schema: published.currentDraftSchema ?? demoPublishedSchema(),
      publishedBy: owner._id,
      publishedAt: now,
    });
    published.status = 'published';
    published.publishedAt = now;
    published.publishedVersionId = version._id;
    await published.save();
  }

  logger.info(
    {
      draft: { id: draft._id.toString(), slug: draft.slug, status: draft.status },
      published: {
        id: published._id.toString(),
        slug: published.slug,
        status: published.status,
        publishedVersionId: published.publishedVersionId?.toString() ?? null,
      },
    },
    'Survey seed complete',
  );

  return { draft, published };
};
