import { describe, expect, it, vi } from 'vitest';

import { createTwilioSmsProvider } from '../modules/campaigns/providers/twilio-sms.provider.js';
import { createTwilioWhatsAppProvider } from '../modules/campaigns/providers/twilio-whatsapp.provider.js';
import { createTwilioSendGridEmailProvider } from '../modules/campaigns/providers/twilio-sendgrid-email.provider.js';
import { ProviderConfigurationError } from '../modules/campaigns/providers/twilio.shared.js';

const baseEnv = {
  TWILIO_ACCOUNT_SID: 'AC_TEST',
  TWILIO_AUTH_TOKEN: 'test-token',
  TWILIO_MESSAGING_SERVICE_SID: '',
  TWILIO_SMS_FROM: '+15555550100',
  TWILIO_WHATSAPP_FROM: 'whatsapp:+15555550100',
  TWILIO_STATUS_CALLBACK_URL: 'https://hooks.cupcake.local/api/v1/webhooks/twilio/messages',
  TWILIO_SENDGRID_API_KEY: 'SG.test',
  TWILIO_SENDGRID_FROM_EMAIL: 'no-reply@cupcake.local',
  TWILIO_SENDGRID_FROM_NAME: 'Cupcake Tests',
};

const samplePayload = (overrides = {}) => ({
  channel: overrides.channel ?? 'sms',
  recipient: overrides.recipient ?? '+15551112222',
  submissionToken: 'token-1234',
  publicUrl: 'https://example.com/f/customer-survey/r/token-1234',
  contact: { id: 'contact-1', fullName: 'Grace Hopper' },
  campaign: { id: 'campaign-1', name: 'Pulse Q3' },
  survey: { id: 'survey-1', title: 'Customer pulse', slug: 'customer-survey' },
  ...overrides,
});

describe('TwilioSmsProvider', () => {
  it('throws when required env vars are missing', () => {
    expect(() => createTwilioSmsProvider({ env: { ...baseEnv, TWILIO_ACCOUNT_SID: '' } })).toThrow(
      ProviderConfigurationError,
    );
  });

  it('requires either a From number or a messaging service', () => {
    expect(() =>
      createTwilioSmsProvider({
        env: { ...baseEnv, TWILIO_SMS_FROM: '', TWILIO_MESSAGING_SERVICE_SID: '' },
      }),
    ).toThrow(ProviderConfigurationError);
  });

  it('returns a success result with the SDK message sid', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ sid: 'SM_TEST_SUCCESS', status: 'queued', errorCode: null });
    const provider = createTwilioSmsProvider({
      env: baseEnv,
      client: { messages: { create } },
    });

    const result = await provider.send(samplePayload());

    expect(result).toEqual({
      success: true,
      provider: 'twilio-sms',
      providerMessageId: 'SM_TEST_SUCCESS',
      reason: null,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+15551112222',
        from: '+15555550100',
        body: expect.stringContaining('Customer pulse'),
        statusCallback: baseEnv.TWILIO_STATUS_CALLBACK_URL,
      }),
    );
    const params = create.mock.calls[0][0];
    expect(params.body).toContain('Grace Hopper');
    expect(params.body).toContain('https://example.com/f/customer-survey/r/token-1234');
    // The plain-text body must never carry tenant ids, sensitive metadata,
    // or survey-answer payloads — only the title, recipient name, and URL.
    expect(params.body).not.toContain('campaign-1');
    expect(params.body).not.toContain('survey-1');
  });

  it('normalises Twilio thrown errors into a stable reason code', async () => {
    const error = Object.assign(new Error('Invalid recipient'), { code: 21211, status: 400 });
    const create = vi.fn().mockRejectedValue(error);
    const provider = createTwilioSmsProvider({
      env: baseEnv,
      client: { messages: { create } },
    });

    const result = await provider.send(samplePayload());

    expect(result).toEqual({
      success: false,
      provider: 'twilio-sms',
      providerMessageId: null,
      reason: 'invalid_recipient',
    });
  });

  it('marks a successful API call as failed when the SDK reports an undelivered status', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ sid: 'SM_FAIL', status: 'undelivered', errorCode: 30007 });
    const provider = createTwilioSmsProvider({
      env: baseEnv,
      client: { messages: { create } },
    });

    const result = await provider.send(samplePayload());

    expect(result.success).toBe(false);
    expect(result.providerMessageId).toBe('SM_FAIL');
    expect(result.reason).toBe('twilio_delivery_failed');
  });
});

describe('TwilioWhatsAppProvider', () => {
  it('prefixes to/from addresses with the whatsapp: scheme', async () => {
    const create = vi.fn().mockResolvedValue({ sid: 'SM_WA', status: 'queued' });
    const provider = createTwilioWhatsAppProvider({
      env: baseEnv,
      client: { messages: { create } },
    });

    await provider.send(samplePayload({ channel: 'whatsapp', recipient: '+15553334444' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'whatsapp:+15553334444',
        from: 'whatsapp:+15555550100',
      }),
    );
  });

  it('validates contacts using the whatsappPhone field', () => {
    const provider = createTwilioWhatsAppProvider({
      env: baseEnv,
      client: { messages: { create: vi.fn() } },
    });

    expect(provider.validateRecipient({ status: 'active', whatsappPhone: null })).toEqual({
      ready: false,
      reason: 'missing_whatsapp_phone',
      recipient: null,
    });
    expect(provider.validateRecipient({ status: 'blocked', whatsappPhone: '5550001111' })).toEqual({
      ready: false,
      reason: 'contact_blocked',
      recipient: null,
    });
    expect(
      provider.validateRecipient({ status: 'active', whatsappPhone: '+1 555 222 3333' }),
    ).toEqual({ ready: true, reason: null, recipient: '+15552223333' });
  });
});

describe('TwilioSendGridEmailProvider', () => {
  it('throws when the API key is missing', () => {
    expect(() =>
      createTwilioSendGridEmailProvider({
        env: { ...baseEnv, TWILIO_SENDGRID_API_KEY: '' },
      }),
    ).toThrow(ProviderConfigurationError);
  });

  it('sends a structured email and captures the X-Message-Id header', async () => {
    const send = vi
      .fn()
      .mockResolvedValue([{ statusCode: 202, headers: { 'x-message-id': 'sg-test-1' } }]);
    const provider = createTwilioSendGridEmailProvider({
      env: baseEnv,
      client: { setApiKey: vi.fn(), send },
    });

    const result = await provider.send(
      samplePayload({ channel: 'email', recipient: 'grace@example.com' }),
    );

    expect(result).toEqual({
      success: true,
      provider: 'twilio-sendgrid-email',
      providerMessageId: 'sg-test-1',
      reason: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0];
    expect(message.to).toBe('grace@example.com');
    expect(message.from).toEqual({
      email: 'no-reply@cupcake.local',
      name: 'Cupcake Tests',
    });
    expect(message.subject).toContain('Customer pulse');
    expect(message.text).toContain('https://example.com/f/customer-survey/r/token-1234');
    expect(message.html).toContain('Customer pulse');
    expect(message.customArgs.submissionToken).toBe('token-1234');
    expect(message.customArgs.campaignId).toBe('campaign-1');
  });

  it('normalises SendGrid errors into a stable reason code', async () => {
    const error = Object.assign(new Error('Unauthorized'), {
      code: 401,
      response: { statusCode: 401 },
    });
    const send = vi.fn().mockRejectedValue(error);
    const provider = createTwilioSendGridEmailProvider({
      env: baseEnv,
      client: { setApiKey: vi.fn(), send },
    });

    const result = await provider.send(
      samplePayload({ channel: 'email', recipient: 'grace@example.com' }),
    );

    expect(result).toEqual({
      success: false,
      provider: 'twilio-sendgrid-email',
      providerMessageId: null,
      reason: 'authentication_failed',
    });
  });
});
