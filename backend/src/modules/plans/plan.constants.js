/**
 * Catalogue of feature flags and quota keys recognised by the plan system.
 *
 * Each entry has:
 *   - `key`: the stable identifier persisted on plans and returned by the
 *     `/billing/plan` and `/billing/usage` endpoints. Renaming a key is a
 *     breaking change.
 *   - `label`: a human-readable name surfaced in the admin UI.
 *   - `description`: longer copy used in tooltips and on upgrade prompts.
 *
 * The plan service uses these catalogues to (a) validate plan payloads,
 * (b) normalise feature/quota maps, and (c) expose a discoverable list of
 * keys to the frontend so the admin can build a plan without hard-coding.
 */

const def = (key, label, description, extras = {}) => ({ key, label, description, ...extras });

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export const FEATURE_KEYS = Object.freeze({
  CAMPAIGNS_EMAIL: 'campaigns.email',
  CAMPAIGNS_SMS: 'campaigns.sms',
  CAMPAIGNS_WHATSAPP: 'campaigns.whatsapp',
  SURVEYS_PUBLISH: 'surveys.publish',
  SURVEYS_ADVANCED_REPORTS: 'surveys.advancedReports',
  SURVEYS_EXPORTS: 'surveys.exports',
  SURVEYS_CUSTOM_BRANDING: 'surveys.customBranding',
  SURVEYS_CAPTCHA: 'surveys.captcha',
  TEMPLATES_CUSTOM: 'templates.custom',
  MEDIA_UPLOAD: 'media.upload',
  TEAM_INVITATIONS: 'team.invitations',
  API_ACCESS: 'api.access',
});

export const FEATURE_DEFINITIONS = Object.freeze([
  def(FEATURE_KEYS.CAMPAIGNS_EMAIL, 'Email campaigns', 'Send surveys through email campaigns.'),
  def(FEATURE_KEYS.CAMPAIGNS_SMS, 'SMS campaigns', 'Send surveys through SMS campaigns.'),
  def(
    FEATURE_KEYS.CAMPAIGNS_WHATSAPP,
    'WhatsApp campaigns',
    'Send surveys through WhatsApp campaigns.',
  ),
  def(FEATURE_KEYS.SURVEYS_PUBLISH, 'Publish surveys', 'Publish surveys to the public form route.'),
  def(
    FEATURE_KEYS.SURVEYS_ADVANCED_REPORTS,
    'Advanced reports',
    'Trend, channel, version comparison and drop-off reports.',
  ),
  def(FEATURE_KEYS.SURVEYS_EXPORTS, 'Response exports', 'Download responses as CSV/XLSX.'),
  def(
    FEATURE_KEYS.SURVEYS_CUSTOM_BRANDING,
    'Custom branding',
    'Use tenant logo, colors and white-label on public forms.',
  ),
  def(
    FEATURE_KEYS.SURVEYS_CAPTCHA,
    'CAPTCHA protection',
    'Enable Turnstile / hCaptcha on public forms.',
  ),
  def(
    FEATURE_KEYS.TEMPLATES_CUSTOM,
    'Tenant templates',
    'Create reusable tenant templates beyond the system catalogue.',
  ),
  def(FEATURE_KEYS.MEDIA_UPLOAD, 'Media uploads', 'Upload images for use in surveys and branding.'),
  def(FEATURE_KEYS.TEAM_INVITATIONS, 'Invite team members', 'Invite additional admins and members.'),
  def(FEATURE_KEYS.API_ACCESS, 'API & webhooks', 'Use the tenant API keys and outbound webhooks.'),
]);

export const FEATURE_KEY_VALUES = Object.freeze(Object.values(FEATURE_KEYS));

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

/**
 * `period` semantics:
 *   - `lifetime`: usage is the live count of matching rows for the tenant
 *     (surveys, contacts, users, custom templates, storage MB). Cheap to
 *     compute and always accurate.
 *   - `monthly`: usage is an incrementing counter scoped to a calendar month
 *     ('YYYY-MM' in UTC). Increments are atomic so concurrent campaigns or
 *     responses cannot race past the cap.
 */
export const QUOTA_PERIODS = Object.freeze({ LIFETIME: 'lifetime', MONTHLY: 'monthly' });

export const QUOTA_KEYS = Object.freeze({
  USERS: 'users',
  SURVEYS: 'surveys',
  CONTACTS: 'contacts',
  TEMPLATES: 'templates',
  STORAGE_MB: 'storageMb',
  RESPONSES_MONTHLY: 'responsesPerMonth',
  CAMPAIGNS_MONTHLY: 'campaignsPerMonth',
  EXPORTS_MONTHLY: 'exportsPerMonth',
  REPORTS_MONTHLY: 'reportsPerMonth',
});

export const QUOTA_DEFINITIONS = Object.freeze([
  def(QUOTA_KEYS.USERS, 'Team members', 'Maximum active members and pending invitations.', {
    period: QUOTA_PERIODS.LIFETIME,
  }),
  def(QUOTA_KEYS.SURVEYS, 'Surveys', 'Maximum total surveys (any status, excluding archived).', {
    period: QUOTA_PERIODS.LIFETIME,
  }),
  def(QUOTA_KEYS.CONTACTS, 'Contacts', 'Maximum active contacts stored.', {
    period: QUOTA_PERIODS.LIFETIME,
  }),
  def(QUOTA_KEYS.TEMPLATES, 'Custom templates', 'Maximum tenant-owned templates.', {
    period: QUOTA_PERIODS.LIFETIME,
  }),
  def(QUOTA_KEYS.STORAGE_MB, 'Storage (MB)', 'Maximum media storage in megabytes.', {
    period: QUOTA_PERIODS.LIFETIME,
  }),
  def(QUOTA_KEYS.RESPONSES_MONTHLY, 'Responses / month', 'Maximum survey responses per month.', {
    period: QUOTA_PERIODS.MONTHLY,
  }),
  def(QUOTA_KEYS.CAMPAIGNS_MONTHLY, 'Campaigns / month', 'Maximum campaign launches per month.', {
    period: QUOTA_PERIODS.MONTHLY,
  }),
  def(QUOTA_KEYS.EXPORTS_MONTHLY, 'Exports / month', 'Maximum CSV/XLSX exports per month.', {
    period: QUOTA_PERIODS.MONTHLY,
  }),
  def(
    QUOTA_KEYS.REPORTS_MONTHLY,
    'Report runs / month',
    'Maximum on-demand report executions per month.',
    { period: QUOTA_PERIODS.MONTHLY },
  ),
]);

export const QUOTA_KEY_VALUES = Object.freeze(Object.values(QUOTA_KEYS));

export const getQuotaPeriod = (quotaKey) => {
  const found = QUOTA_DEFINITIONS.find((q) => q.key === quotaKey);
  return found?.period ?? QUOTA_PERIODS.LIFETIME;
};

// ---------------------------------------------------------------------------
// Plan statuses + default fallback plan
// ---------------------------------------------------------------------------

export const PLAN_STATUSES = Object.freeze(['draft', 'active', 'archived']);

/**
 * Plan returned for a tenant that has no explicit assignment.
 *
 * Permissive by design — tenants only get gated once an admin actively
 * assigns a paid/restricted plan. This keeps backwards compatibility for
 * pre-plan tenants and ensures existing test fixtures keep working without
 * needing every test to seed a plan. Admins seeking a free tier should
 * create an explicit `free` plan and mark it as `isDefault`.
 */
export const DEFAULT_PLAN = Object.freeze({
  id: null,
  code: 'unmanaged',
  name: 'Unmanaged',
  description:
    'No explicit plan is assigned to this tenant. All product features are available with no quotas.',
  status: 'active',
  isFallback: true,
  price: { amountMinor: 0, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
  features: Object.freeze(
    Object.fromEntries(Object.values(FEATURE_KEYS).map((key) => [key, true])),
  ),
  quotas: Object.freeze(Object.fromEntries(Object.values(QUOTA_KEYS).map((key) => [key, null]))),
});

// ---------------------------------------------------------------------------
// Error codes returned by the feature gate
// ---------------------------------------------------------------------------

export const PLAN_ERROR_CODES = Object.freeze({
  FEATURE_BLOCKED: 'FEATURE_BLOCKED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const currentMonthlyPeriodKey = (date = new Date()) => {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

export const buildPeriodKey = (period, date = new Date()) =>
  period === QUOTA_PERIODS.MONTHLY ? currentMonthlyPeriodKey(date) : 'lifetime';
