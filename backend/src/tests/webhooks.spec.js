import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { createApp } from '../app.js';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './helpers/mongo.js';
import { CampaignRecipient } from '../modules/campaigns/campaign-recipient.model.js';
import mongoose from 'mongoose';

let app;

beforeAll(async () => {
  await startInMemoryMongo();
  app = createApp();
});

afterAll(async () => {
  await stopInMemoryMongo();
});

beforeEach(async () => {
  await clearCollections();
});

const seedRecipient = async (overrides = {}) => {
  const tenantId = new mongoose.Types.ObjectId();
  const campaignId = new mongoose.Types.ObjectId();
  return CampaignRecipient.create({
    tenantId,
    campaignId,
    surveyId: new mongoose.Types.ObjectId(),
    surveyVersionId: new mongoose.Types.ObjectId(),
    channel: 'sms',
    status: 'sent',
    recipient: '+15551112222',
    submissionToken: 'sub-token-1',
    publicUrl: 'http://localhost/f/x/r/sub-token-1',
    provider: 'twilio-sms',
    providerMessageId: 'SM_TEST_1',
    sentAt: new Date(),
    ...overrides,
  });
};

describe('Twilio status webhook', () => {
  it('promotes a sent recipient to delivered on a status callback', async () => {
    const recipient = await seedRecipient();
    const response = await request(app)
      .post('/api/v1/webhooks/twilio/messages')
      .type('form')
      .send({ MessageSid: 'SM_TEST_1', MessageStatus: 'delivered' });
    expect(response.status).toBe(200);

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('delivered');
    expect(reloaded.deliveredAt).toBeInstanceOf(Date);
  });

  it('records a Twilio error code as the failure reason', async () => {
    const recipient = await seedRecipient();
    await request(app)
      .post('/api/v1/webhooks/twilio/messages')
      .type('form')
      .send({ MessageSid: 'SM_TEST_1', MessageStatus: 'failed', ErrorCode: '30007' });

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('failed');
    expect(reloaded.failureReason).toBe('twilio_30007');
  });

  it('does not regress a clicked recipient back to delivered', async () => {
    const recipient = await seedRecipient({
      status: 'clicked',
      clickedAt: new Date(),
      deliveredAt: new Date(),
    });
    await request(app)
      .post('/api/v1/webhooks/twilio/messages')
      .type('form')
      .send({ MessageSid: 'SM_TEST_1', MessageStatus: 'delivered' });

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('clicked');
  });
});

describe('SendGrid events webhook', () => {
  it('promotes recipients to opened/clicked using the submission token custom arg', async () => {
    const recipient = await seedRecipient({
      channel: 'email',
      provider: 'twilio-sendgrid-email',
      submissionToken: 'sg-token-1',
      status: 'sent',
    });
    const response = await request(app)
      .post('/api/v1/webhooks/sendgrid/events')
      .send([
        { event: 'open', submissionToken: 'sg-token-1' },
        { event: 'click', submissionToken: 'sg-token-1' },
      ]);
    expect(response.status).toBe(200);
    expect(response.body.data.processed).toBe(2);

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('clicked');
    expect(reloaded.openedAt).toBeInstanceOf(Date);
    expect(reloaded.clickedAt).toBeInstanceOf(Date);
  });

  it('marks recipients as failed on bounce events', async () => {
    const recipient = await seedRecipient({
      channel: 'email',
      provider: 'twilio-sendgrid-email',
      providerMessageId: 'sg-msg-1',
    });
    await request(app)
      .post('/api/v1/webhooks/sendgrid/events')
      .send([{ event: 'bounce', sg_message_id: 'sg-msg-1' }]);

    const reloaded = await CampaignRecipient.findById(recipient._id);
    expect(reloaded.status).toBe('failed');
    expect(reloaded.failureReason).toBe('sendgrid_bounce');
  });
});
