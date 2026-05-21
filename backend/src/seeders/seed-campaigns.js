import crypto from 'node:crypto';

import { Tenant } from '../modules/tenants/tenant.model.js';
import { User } from '../modules/users/user.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { Contact } from '../modules/contacts/contact.model.js';
import { Campaign } from '../modules/campaigns/campaign.model.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import { slugify } from '../common/utils/slug.js';
import { logger } from '../common/utils/logger.js';
import { loadEnv } from '../config/env.js';

const DEMO_CAMPAIGN_NAME = 'Demo email outreach';

const generateSubmissionToken = () => crypto.randomBytes(24).toString('base64url').slice(0, 32);

const buildPublicUrl = ({ env, slug, submissionToken }) => {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/f/${slug}/r/${submissionToken}`;
};

/**
 * Seeds a single demo campaign attached to the demo published survey. The
 * campaign targets every demo contact via the `email` channel so the rendered
 * report shows a realistic mix of sent and skipped recipients.
 */
export const seedCampaigns = async () => {
  const env = loadEnv();
  const tenantSlug = slugify(env.DEMO_TENANT_NAME);
  const tenant =
    (await Tenant.findOne({ slug: tenantSlug })) ??
    (await Tenant.findOne({ name: env.DEMO_TENANT_NAME }));
  if (!tenant) {
    logger.warn('Demo tenant missing — run seed-auth first');
    return { campaign: null };
  }
  const owner = await User.findOne({ email: env.DEMO_CLIENT_EMAIL.toLowerCase() });
  if (!owner) {
    logger.warn('Demo client missing — run seed-auth first');
    return { campaign: null };
  }
  const survey = await Survey.findOne({
    tenantId: tenant._id,
    title: 'Demo published survey',
  });
  if (!survey || survey.status !== 'published' || !survey.publishedVersionId) {
    logger.warn('Demo published survey missing — run seed-surveys first');
    return { campaign: null };
  }

  const existing = await Campaign.findOne({ tenantId: tenant._id, name: DEMO_CAMPAIGN_NAME });
  if (existing) {
    return { campaign: existing };
  }

  const contacts = await Contact.find({ tenantId: tenant._id });
  const selectedCount = contacts.length;

  const campaign = await Campaign.create({
    tenantId: tenant._id,
    surveyId: survey._id,
    surveyVersionId: survey.publishedVersionId,
    name: DEMO_CAMPAIGN_NAME,
    channels: ['email'],
    target: {
      contactIds: contacts.map((c) => c._id),
      groupIds: [],
    },
    status: 'completed_with_errors',
    createdBy: owner._id,
    startedAt: new Date(),
    completedAt: new Date(),
    summary: {
      selectedCount,
      validCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      skippedReasons: {},
    },
  });

  const skippedReasons = {};
  let validCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const contact of contacts) {
    const submissionToken = generateSubmissionToken();
    const base = {
      tenantId: tenant._id,
      campaignId: campaign._id,
      surveyId: survey._id,
      surveyVersionId: survey.publishedVersionId,
      contactId: contact._id,
      channel: 'email',
      submissionToken,
      publicUrl: buildPublicUrl({ env, slug: survey.slug, submissionToken }),
    };
    if (contact.status === 'blocked') {
      await CampaignRecipient.create({
        ...base,
        recipient: null,
        status: 'skipped',
        skippedReason: 'contact_blocked',
      });
      skippedReasons.contact_blocked = (skippedReasons.contact_blocked ?? 0) + 1;
      skippedCount += 1;
    } else if (contact.status === 'archived') {
      await CampaignRecipient.create({
        ...base,
        recipient: null,
        status: 'skipped',
        skippedReason: 'contact_archived',
      });
      skippedReasons.contact_archived = (skippedReasons.contact_archived ?? 0) + 1;
      skippedCount += 1;
    } else if (!contact.email) {
      await CampaignRecipient.create({
        ...base,
        recipient: null,
        status: 'skipped',
        skippedReason: 'missing_email',
      });
      skippedReasons.missing_email = (skippedReasons.missing_email ?? 0) + 1;
      skippedCount += 1;
    } else {
      await CampaignRecipient.create({
        ...base,
        recipient: contact.email,
        status: 'sent',
        provider: 'mock-email',
        sentAt: new Date(),
      });
      validCount += 1;
      sentCount += 1;
    }
  }

  campaign.summary = {
    selectedCount,
    validCount,
    sentCount,
    failedCount: 0,
    skippedCount,
    skippedReasons,
  };
  campaign.status = skippedCount > 0 ? 'completed_with_errors' : 'completed';
  await campaign.save();

  logger.info(
    {
      campaignId: campaign._id.toString(),
      selectedCount,
      validCount,
      sentCount,
      skippedCount,
    },
    'Campaign seed complete',
  );

  return { campaign };
};
