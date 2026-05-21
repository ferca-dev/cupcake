import { Response } from './response.model.js';

export const createResponse = async (payload) => Response.create(payload);

export const findResponseById = async ({ id, tenantId = null }) => {
  const filter = tenantId ? { _id: id, tenantId } : { _id: id };
  return Response.findOne(filter);
};

export const countResponsesByContact = async ({ surveyId, contactId }) =>
  Response.countDocuments({ surveyId, contactId });

export const countResponsesByRecipient = async ({ campaignRecipientId }) =>
  Response.countDocuments({ campaignRecipientId });
