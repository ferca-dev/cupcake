import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { User } from '../modules/users/user.model.js';
import { Tenant } from '../modules/tenants/tenant.model.js';
import { Survey } from '../modules/surveys/survey.model.js';
import { SurveyVersion } from '../modules/surveys/survey-version.model.js';
import { Response } from '../modules/responses/response.model.js';
import { SuspiciousSubmission } from '../modules/public-forms/suspicious-submission.model.js';
import { hashPassword } from '../common/auth/passwords.js';
import { ROLES } from '../common/auth/roles.js';
import { resetAntiAbuseCounters } from '../modules/public-forms/anti-abuse.service.js';
import {
  setCaptchaProviderForTest,
  resetCaptchaProviderCache,
} from '../modules/public-forms/captcha/captcha.factory.js';
import { createTurnstileCaptchaProvider } from '../modules/public-forms/captcha/turnstile.provider.js';

let app;
const password = 'StrongPass123!';
const HONEYPOT_FIELD = 'website_url';

const baseField = (overrides = {}) => ({
  id: 'field_name',
  type: 'short_text',
  key: 'name',
  label: 'Your name',
  placeholder: '',
  helpText: '',
  required: true,
  order: 1,
  sectionId: null,
  options: [],
  validation: { minLength: null, maxLength: null, min: null, max: null, regex: null },
  visibility: { mode: 'always', conditionMode: 'all', conditions: [] },
  settings: { width: 'full', imageUrl: null },
  ...overrides,
});

const baseSchema = (fields) => ({
  fields: fields ?? [baseField()],
  sections: [],
  logicRules: [],
  layout: { mode: 'single_page', showProgress: true },
});

const createTenantWithAdmin = async () => {
  const tenant = await Tenant.create({
    name: 'Anti-Abuse Tenant',
    slug: 'anti-abuse-tenant',
    status: 'active',
  });
  const user = await User.create({
    tenantId: tenant._id,
    role: ROLES.CLIENT_ADMIN,
    name: 'Admin',
    email: 'antiabuse@test.local',
    passwordHash: await hashPassword(password),
    status: 'active',
  });
  tenant.ownerUserId = user._id;
  await tenant.save();
  return { tenant, user };
};

const publish = async ({ tenant, user, slug = 'anti-abuse', settings = {}, schemaFields }) => {
  const survey = await Survey.create({
    tenantId: tenant._id,
    title: 'Anti-abuse survey',
    slug,
    status: 'draft',
    currentDraftSchema: baseSchema(schemaFields),
    createdBy: user._id,
    settings,
  });
  const version = await SurveyVersion.create({
    tenantId: tenant._id,
    surveyId: survey._id,
    versionNumber: 1,
    schema: survey.currentDraftSchema,
    publishedBy: user._id,
    publishedAt: new Date(),
  });
  survey.status = 'published';
  survey.publishedVersionId = version._id;
  survey.publishedAt = new Date();
  await survey.save();
  return { survey, version };
};

const submitPayload = (overrides = {}) => ({
  answers: [{ fieldId: 'field_name', value: 'Jane Doe' }],
  ...overrides,
});

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
  resetAntiAbuseCounters();
  setCaptchaProviderForTest(null);
  resetCaptchaProviderCache();
});

describe('Public form anti-abuse: honeypot', () => {
  it('rejects submissions with a non-empty honeypot value', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'honeypot-survey',
      settings: { antiAbuse: { honeypotEnabled: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/honeypot-survey/responses')
      .send(submitPayload({ honeypot: { [HONEYPOT_FIELD]: 'http://spammer.example' } }));

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    const stored = await Response.findOne({});
    expect(stored).toBeNull();
    const log = await SuspiciousSubmission.findOne({});
    expect(log).not.toBeNull();
    expect(log.reason).toBe('honeypot_filled');
    expect(log.action).toBe('reject');
  });

  it('lets submissions through when the honeypot is empty', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'honeypot-clean',
      settings: { antiAbuse: { honeypotEnabled: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/honeypot-clean/responses')
      .send(submitPayload({ honeypot: { [HONEYPOT_FIELD]: '' } }));

    expect(response.status).toBe(201);
    const stored = await Response.findOne({});
    expect(stored).not.toBeNull();
    const log = await SuspiciousSubmission.findOne({});
    expect(log).toBeNull();
  });

  it('skips honeypot enforcement when the survey opts out', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'honeypot-off',
      settings: { antiAbuse: { honeypotEnabled: false } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/honeypot-off/responses')
      .send(submitPayload({ honeypot: { [HONEYPOT_FIELD]: 'something' } }));

    expect(response.status).toBe(201);
  });

  it('honeypot violations always reject even in flag mode', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'honeypot-flag-mode',
      settings: { antiAbuse: { honeypotEnabled: true, suspiciousAction: 'flag' } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/honeypot-flag-mode/responses')
      .send(submitPayload({ honeypot: { [HONEYPOT_FIELD]: 'bot' } }));

    expect(response.status).toBe(422);
    const stored = await Response.findOne({});
    expect(stored).toBeNull();
  });

  it('exposes the honeypot field name through the public metadata endpoint', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'honeypot-metadata',
      settings: { antiAbuse: { honeypotEnabled: true } },
    });

    const response = await request(app).get('/api/v1/public/forms/honeypot-metadata');
    expect(response.status).toBe(200);
    expect(response.body.data.survey.settings.antiAbuse.honeypot.enabled).toBe(true);
    expect(response.body.data.survey.settings.antiAbuse.honeypot.fieldName).toBe(HONEYPOT_FIELD);
  });
});

describe('Public form anti-abuse: rate limits', () => {
  it('rejects bursts past the per-IP limit and logs the dimension', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'ip-burst',
      settings: { antiAbuse: { perIpPerMinute: 2 } },
    });

    const send = () =>
      request(app)
        .post('/api/v1/public/forms/ip-burst/responses')
        .set('X-Forwarded-For', '203.0.113.10')
        .send(submitPayload());

    const first = await send();
    const second = await send();
    const third = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    const log = await SuspiciousSubmission.findOne({ reason: 'rate_limit_ip' });
    expect(log).not.toBeNull();
    expect(log.details.dimension).toBe('ip');
  });

  it('rejects bursts past the per-token limit independently of IP', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'token-burst',
      settings: { antiAbuse: { perTokenPerMinute: 1, perIpPerMinute: 0 } },
    });

    const send = (ip) =>
      request(app)
        .post('/api/v1/public/forms/token-burst/responses')
        .set('X-Forwarded-For', ip)
        .send(submitPayload({ submissionToken: 'shared-token-1234' }));

    const first = await send('203.0.113.20');
    const second = await send('203.0.113.21');
    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    const log = await SuspiciousSubmission.findOne({ reason: 'rate_limit_token' });
    expect(log).not.toBeNull();
  });

  it('allows the same survey to be answered concurrently when limits are not exhausted', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'normal-flow',
      settings: { antiAbuse: { perIpPerMinute: 10 } },
    });

    const responses = await Promise.all(
      ['203.0.113.30', '203.0.113.31', '203.0.113.32'].map((ip) =>
        request(app)
          .post('/api/v1/public/forms/normal-flow/responses')
          .set('X-Forwarded-For', ip)
          .send(submitPayload()),
      ),
    );

    for (const r of responses) {
      expect(r.status).toBe(201);
    }
  });
});

describe('Public form anti-abuse: CAPTCHA', () => {
  const stubProvider = (overrides = {}) => ({
    name: 'turnstile',
    siteKey: 'fake-site-key',
    isEnabled: () => true,
    verify: vi.fn(async () => ({ ok: true })),
    ...overrides,
  });

  it('rejects submissions missing the captcha token when required', async () => {
    setCaptchaProviderForTest(stubProvider());
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'captcha-required',
      settings: { antiAbuse: { captchaRequired: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/captcha-required/responses')
      .send(submitPayload());

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    const log = await SuspiciousSubmission.findOne({ reason: 'captcha_missing' });
    expect(log).not.toBeNull();
  });

  it('rejects submissions with an invalid captcha token', async () => {
    const verify = vi.fn(async () => ({ ok: false, errorCodes: ['invalid-input-response'] }));
    setCaptchaProviderForTest(stubProvider({ verify }));
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'captcha-invalid',
      settings: { antiAbuse: { captchaRequired: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/captcha-invalid/responses')
      .send(submitPayload({ captchaToken: 'bogus-token' }));

    expect(response.status).toBe(429);
    expect(verify).toHaveBeenCalledOnce();
    const log = await SuspiciousSubmission.findOne({ reason: 'captcha_invalid' });
    expect(log).not.toBeNull();
  });

  it('accepts submissions with a valid captcha token', async () => {
    const verify = vi.fn(async () => ({ ok: true }));
    setCaptchaProviderForTest(stubProvider({ verify }));
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'captcha-ok',
      settings: { antiAbuse: { captchaRequired: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/captcha-ok/responses')
      .send(submitPayload({ captchaToken: 'good-token' }));

    expect(response.status).toBe(201);
    expect(verify).toHaveBeenCalledOnce();
  });

  it('rejects when CAPTCHA is required but the provider is disabled', async () => {
    setCaptchaProviderForTest({
      name: 'none',
      siteKey: null,
      isEnabled: () => false,
      verify: async () => ({ ok: true }),
    });
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'captcha-misconfigured',
      settings: { antiAbuse: { captchaRequired: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/captcha-misconfigured/responses')
      .send(submitPayload({ captchaToken: 'whatever' }));

    expect(response.status).toBe(429);
    const log = await SuspiciousSubmission.findOne({ reason: 'captcha_misconfigured' });
    expect(log).not.toBeNull();
  });

  it('skips CAPTCHA verification when the survey does not require it', async () => {
    const verify = vi.fn(async () => ({ ok: true }));
    setCaptchaProviderForTest(stubProvider({ verify }));
    const { tenant, user } = await createTenantWithAdmin();
    await publish({ tenant, user, slug: 'captcha-not-required' });

    const response = await request(app)
      .post('/api/v1/public/forms/captcha-not-required/responses')
      .send(submitPayload());

    expect(response.status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('Public form anti-abuse: bypass prevention', () => {
  it('cannot bypass anti-abuse by submitting with no body', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'no-body',
      settings: { antiAbuse: { honeypotEnabled: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/no-body/responses')
      .send({ honeypot: { [HONEYPOT_FIELD]: 'still spam' } });

    // Honeypot fires before answer-schema validation, so a malformed body
    // that includes a filled honeypot is rejected with the generic 422.
    expect(response.status).toBe(422);
    expect(await Response.countDocuments()).toBe(0);
  });

  it('honeypot rejection uses a generic message that does not name the trap', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'opaque-rejection',
      settings: { antiAbuse: { honeypotEnabled: true } },
    });

    const response = await request(app)
      .post('/api/v1/public/forms/opaque-rejection/responses')
      .send(submitPayload({ honeypot: { [HONEYPOT_FIELD]: 'spam' } }));

    expect(response.status).toBe(422);
    // The message must not leak the honeypot field name or the word "honeypot".
    expect(response.body.error.message).not.toMatch(/honeypot/i);
    expect(response.body.error.message).not.toMatch(/website_url/i);
  });

  it('flag mode lets a rate-limited submission through while recording the audit', async () => {
    const { tenant, user } = await createTenantWithAdmin();
    await publish({
      tenant,
      user,
      slug: 'flag-mode',
      settings: { antiAbuse: { perIpPerMinute: 1, suspiciousAction: 'flag' } },
    });

    const send = () =>
      request(app)
        .post('/api/v1/public/forms/flag-mode/responses')
        .set('X-Forwarded-For', '203.0.113.99')
        .send(submitPayload());

    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    // Flag mode keeps the request alive but records the suspicious entry.
    expect(second.status).toBe(201);
    const flagged = await SuspiciousSubmission.findOne({ reason: 'rate_limit_ip' });
    expect(flagged).not.toBeNull();
    expect(flagged.action).toBe('flag');
  });
});

describe('Turnstile provider (unit)', () => {
  it('returns ok=true when Cloudflare reports success', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    }));
    const provider = createTurnstileCaptchaProvider({
      siteKey: 'pub',
      secretKey: 'sec',
      fetchImpl,
    });
    const result = await provider.verify({ token: 'abc', ip: '203.0.113.1' });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body.get('secret')).toBe('sec');
    expect(init.body.get('response')).toBe('abc');
    expect(init.body.get('remoteip')).toBe('203.0.113.1');
  });

  it('returns ok=false when the provider reports failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    }));
    const provider = createTurnstileCaptchaProvider({
      siteKey: 'pub',
      secretKey: 'sec',
      fetchImpl,
    });
    const result = await provider.verify({ token: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.errorCodes).toContain('timeout-or-duplicate');
  });

  it('returns ok=false on network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const provider = createTurnstileCaptchaProvider({
      siteKey: 'pub',
      secretKey: 'sec',
      fetchImpl,
    });
    const result = await provider.verify({ token: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.errorCodes).toContain('provider-network-error');
  });

  it('rejects requests with a missing token without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const provider = createTurnstileCaptchaProvider({
      siteKey: 'pub',
      secretKey: 'sec',
      fetchImpl,
    });
    const result = await provider.verify({ token: '' });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
