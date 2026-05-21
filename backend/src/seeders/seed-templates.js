import { Template } from '../modules/templates/template.model.js';
import { logger } from '../common/utils/logger.js';

// Each schema below is intentionally complete (with default `validation`,
// `visibility`, and `settings`) so that it round-trips through the form
// schema validator without surprises when a tenant turns it into a survey.

const baseField = (overrides) => ({
  placeholder: '',
  helpText: '',
  required: false,
  sectionId: null,
  options: [],
  validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
  ...overrides,
});

const baseLayout = () => ({ mode: 'single_page', showProgress: true });

const customerSatisfactionSchema = () => ({
  fields: [
    baseField({
      id: 'field_overall',
      type: 'rating',
      key: 'overall_rating',
      label: 'How would you rate your overall experience?',
      required: true,
      order: 1,
      validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
    }),
    baseField({
      id: 'field_recommend',
      type: 'yes_no',
      key: 'would_recommend',
      label: 'Would you recommend us to a friend?',
      required: true,
      order: 2,
    }),
    baseField({
      id: 'field_comments',
      type: 'long_text',
      key: 'comments',
      label: 'Any additional comments?',
      placeholder: 'Tell us what we could do better',
      order: 3,
      validation: { minLength: null, maxLength: 1000, min: null, max: null, regex: null },
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const employeeFeedbackSchema = () => ({
  fields: [
    baseField({
      id: 'field_engagement',
      type: 'rating',
      key: 'engagement',
      label: 'How engaged do you feel at work this quarter?',
      required: true,
      order: 1,
      validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
    }),
    baseField({
      id: 'field_manager',
      type: 'rating',
      key: 'manager_support',
      label: 'How supported do you feel by your manager?',
      required: true,
      order: 2,
      validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
    }),
    baseField({
      id: 'field_topics',
      type: 'checkbox_group',
      key: 'topics',
      label: 'Which topics would you like to discuss in the next 1:1?',
      order: 3,
      options: [
        { key: 'career_growth', label: 'Career growth' },
        { key: 'workload', label: 'Workload' },
        { key: 'tooling', label: 'Tools and processes' },
        { key: 'wellbeing', label: 'Wellbeing' },
      ],
    }),
    baseField({
      id: 'field_open',
      type: 'long_text',
      key: 'open_feedback',
      label: 'Anything else you would like to share?',
      order: 4,
      validation: { minLength: null, maxLength: 2000, min: null, max: null, regex: null },
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const npsSchema = () => ({
  fields: [
    baseField({
      id: 'field_nps',
      type: 'nps',
      key: 'nps_score',
      label: 'How likely are you to recommend us to a friend or colleague?',
      required: true,
      order: 1,
      validation: { minLength: null, maxLength: null, min: 0, max: 10, regex: null },
    }),
    baseField({
      id: 'field_nps_reason',
      type: 'long_text',
      key: 'nps_reason',
      label: 'What is the main reason for your score?',
      order: 2,
      validation: { minLength: null, maxLength: 1000, min: null, max: null, regex: null },
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const eventRegistrationSchema = () => ({
  fields: [
    baseField({
      id: 'field_name',
      type: 'short_text',
      key: 'full_name',
      label: 'Full name',
      required: true,
      order: 1,
      validation: { minLength: 1, maxLength: 200, min: null, max: null, regex: null },
    }),
    baseField({
      id: 'field_email',
      type: 'email',
      key: 'email',
      label: 'Email',
      required: true,
      order: 2,
      validation: { minLength: null, maxLength: 320, min: null, max: null, regex: null },
    }),
    baseField({
      id: 'field_attendance',
      type: 'radio_group',
      key: 'attendance',
      label: 'How will you attend?',
      required: true,
      order: 3,
      options: [
        { key: 'in_person', label: 'In person' },
        { key: 'virtual', label: 'Virtual' },
      ],
    }),
    baseField({
      id: 'field_company',
      type: 'short_text',
      key: 'company',
      label: 'Company',
      order: 4,
      validation: { minLength: null, maxLength: 200, min: null, max: null, regex: null },
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const productFeedbackSchema = () => ({
  fields: [
    baseField({
      id: 'field_product',
      type: 'select',
      key: 'product',
      label: 'Which product is this about?',
      required: true,
      order: 1,
      options: [
        { key: 'core', label: 'Core platform' },
        { key: 'mobile', label: 'Mobile app' },
        { key: 'integrations', label: 'Integrations' },
      ],
    }),
    baseField({
      id: 'field_satisfaction',
      type: 'rating',
      key: 'satisfaction',
      label: 'How satisfied are you with this product?',
      required: true,
      order: 2,
      validation: { minLength: null, maxLength: null, min: 1, max: 5, regex: null },
    }),
    baseField({
      id: 'field_features',
      type: 'long_text',
      key: 'desired_features',
      label: 'Which features would you like to see next?',
      order: 3,
      validation: { minLength: null, maxLength: 1500, min: null, max: null, regex: null },
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const contactInfoSchema = () => ({
  fields: [
    baseField({
      id: 'field_first_name',
      type: 'short_text',
      key: 'first_name',
      label: 'First name',
      required: true,
      order: 1,
      validation: { minLength: 1, maxLength: 100, min: null, max: null, regex: null },
    }),
    baseField({
      id: 'field_last_name',
      type: 'short_text',
      key: 'last_name',
      label: 'Last name',
      required: true,
      order: 2,
      validation: { minLength: 1, maxLength: 100, min: null, max: null, regex: null },
    }),
    baseField({
      id: 'field_email',
      type: 'email',
      key: 'email',
      label: 'Email',
      required: true,
      order: 3,
    }),
    baseField({
      id: 'field_phone',
      type: 'phone',
      key: 'phone',
      label: 'Phone',
      order: 4,
    }),
  ],
  sections: [],
  logicRules: [],
  layout: baseLayout(),
});

const SYSTEM_TEMPLATES = [
  {
    title: 'Customer satisfaction survey',
    description: 'Capture overall satisfaction, NPS-style recommendation, and open comments.',
    category: 'customer_satisfaction',
    schema: customerSatisfactionSchema,
  },
  {
    title: 'Employee feedback survey',
    description:
      'Quarterly pulse covering engagement, manager support, and topics for the next 1:1.',
    category: 'employee_feedback',
    schema: employeeFeedbackSchema,
  },
  {
    title: 'NPS survey',
    description: 'Single-question Net Promoter Score with optional follow-up.',
    category: 'nps',
    schema: npsSchema,
  },
  {
    title: 'Event registration form',
    description: 'Collect attendee information including format and company.',
    category: 'event_registration',
    schema: eventRegistrationSchema,
  },
  {
    title: 'Product feedback survey',
    description: 'Product-specific satisfaction with a feature wishlist.',
    category: 'product_feedback',
    schema: productFeedbackSchema,
  },
  {
    title: 'Contact information form',
    description: 'Lightweight lead/contact capture for landing pages.',
    category: 'contact_info',
    schema: contactInfoSchema,
  },
];

/**
 * Seeds the platform's system templates. Idempotent on `(tenantId: null,
 * title)` — running twice updates the schema/description in place so future
 * tweaks to the canonical templates propagate without producing duplicates.
 */
export const seedTemplates = async () => {
  const results = [];
  for (const def of SYSTEM_TEMPLATES) {
    const existing = await Template.findOne({ tenantId: null, title: def.title });
    if (existing) {
      existing.description = def.description;
      existing.category = def.category;
      existing.schema = def.schema();
      existing.isSystemTemplate = true;
      existing.status = 'active';
      await existing.save();
      results.push(existing);
      continue;
    }
    const created = await Template.create({
      tenantId: null,
      title: def.title,
      description: def.description,
      category: def.category,
      schema: def.schema(),
      isSystemTemplate: true,
      status: 'active',
    });
    results.push(created);
  }

  logger.info(
    {
      count: results.length,
      titles: results.map((t) => t.title),
    },
    'System template seed complete',
  );

  return results;
};
