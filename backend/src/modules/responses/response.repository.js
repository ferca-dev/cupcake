import { Response } from './response.model.js';
import { publishWebhookEvent } from '../developer/webhook-publisher.js';
import { WEBHOOK_EVENT_TYPES } from '../developer/webhook-events.js';

export const createResponse = async (payload) => {
  const doc = await Response.create(payload);
  // Emit the integration event after the insert is committed. Producers do
  // not await the actual HTTP delivery — `publishWebhookEvent` only enqueues
  // jobs — so a slow integration cannot back-pressure a public form
  // submission.
  await publishWebhookEvent({
    type: WEBHOOK_EVENT_TYPES.RESPONSE_SUBMITTED,
    tenantId: doc.tenantId,
    data: {
      responseId: doc._id.toString(),
      surveyId: doc.surveyId.toString(),
      surveyVersionId: doc.surveyVersionId.toString(),
      campaignId: doc.campaignId ? doc.campaignId.toString() : null,
      campaignRecipientId: doc.campaignRecipientId ? doc.campaignRecipientId.toString() : null,
      contactId: doc.contactId ? doc.contactId.toString() : null,
      submittedAt: doc.metadata?.submittedAt ?? doc.createdAt,
      // The full answer set is intentionally excluded so the webhook payload
      // stays small and avoids leaking PII to misconfigured receivers. The
      // tenant can fetch the response detail via the authenticated API.
      answerCount: Array.isArray(doc.answers) ? doc.answers.length : 0,
    },
  });
  return doc;
};

export const findResponseById = async ({ id, tenantId = null }) => {
  const filter = tenantId ? { _id: id, tenantId } : { _id: id };
  return Response.findOne(filter);
};

export const countResponsesByContact = async ({ surveyId, contactId }) =>
  Response.countDocuments({ surveyId, contactId });

export const countResponsesByRecipient = async ({ campaignRecipientId }) =>
  Response.countDocuments({ campaignRecipientId });

export const existsResponseByDeviceKey = async ({ surveyId, deviceKeyHash }) =>
  Response.exists({ surveyId, 'metadata.deviceKeyHash': deviceKeyHash });

export const existsResponseByIpHash = async ({ surveyId, ipHash }) =>
  Response.exists({ surveyId, 'metadata.ipHash': ipHash });

export const existsResponseByContactKey = async ({ surveyId, contactKeyHash }) =>
  Response.exists({ surveyId, 'metadata.contactKeyHash': contactKeyHash });
