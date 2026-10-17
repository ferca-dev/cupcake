import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadEnv, resetEnvCache } from '../config/env.js';
import { resolveProviders } from '../modules/campaigns/providers/provider.factory.js';
import { resolvePaymentProvider } from '../modules/payments/providers/provider.factory.js';
import { buildAntiAbuseConfigForPublic } from '../modules/public-forms/anti-abuse.service.js';

import { resolveTransactionalEmailSender } from '../modules/payments/transactional-email.js';

const original = { ...process.env };
let app;
beforeAll(async () => {
  process.env.SURVEYS_ONLY = 'true';
  process.env.PUBLIC_FORM_CAPTCHA_DISABLED = 'true';
  resetEnvCache();
  const { createApp } = await import('../app.js');
  app = createApp();
});
afterAll(() => {
  process.env = original;
  resetEnvCache();
});

describe('restricted Cupcake deployment', () => {
  it.each([
    ['post', '/campaigns/123/send'],
    ['post', '/BILLING/mercadopago/preferences'],
    ['post', '/billing/token-purchases'],
    ['post', '/billing/subscriptions'],
    ['post', '/webhooks/mercadopago'],
    ['post', '/team/invitations'],
    ['post', '/developer/webhooks/123/test'],
    ['post', '/admin/payments/reminders/renewals'],
    ['post', '/admin/tenants/123/invitations'],
  ])('blocks %s %s before any database or provider action', async (method, url) => {
    const response = await request(app)[method](`/api/v1${url}`).send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FEATURE_DISABLED');
  });

  it.each(['/surveys', '/billing/plan', '/billing/usage', '/team/members'])(
    'keeps %s behind normal authentication',
    async (url) => {
      expect((await request(app).get(`/api/v1${url}`)).status).toBe(401);
    },
  );

  it('blocks both real and mock providers at their boundary', () => {
    for (const payment of ['mock', 'mercadopago']) {
      expect(() =>
        resolvePaymentProvider({ env: { SURVEYS_ONLY: true, PAYMENT_PROVIDER: payment } }),
      ).toThrow(/disabled/);
    }
    expect(() => resolveProviders({ env: { SURVEYS_ONLY: true } })).toThrow(/disabled/);
  });

  it('never reports transactional messages as sent when messaging is disabled', async () => {
    const sender = resolveTransactionalEmailSender({
      env: { SURVEYS_ONLY: true, EMAIL_PROVIDER: 'sendgrid' },
    });
    expect(await sender.send({ to: 'test@example.com' })).toMatchObject({
      success: false,
      reason: 'messaging_disabled',
    });
  });

  it('disables CAPTCHA even when a published survey had required it', () => {
    const config = buildAntiAbuseConfigForPublic({
      effectiveSettings: { antiAbuse: { captchaRequired: true } },
    });
    expect(config.captcha).toMatchObject({ required: false, provider: 'none', siteKey: null });
    expect(config.honeypot.enabled).toBe(true);
  });

  it('parses the literal false flag correctly', () => {
    process.env.SURVEYS_ONLY = 'false';
    resetEnvCache();
    expect(loadEnv().SURVEYS_ONLY).toBe(false);
    process.env.SURVEYS_ONLY = 'true';
    resetEnvCache();
  });
});
