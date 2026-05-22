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

export const existsResponseByDeviceKey = async ({ surveyId, deviceKeyHash }) =>
  Response.exists({ surveyId, 'metadata.deviceKeyHash': deviceKeyHash });

export const existsResponseByIpHash = async ({ surveyId, ipHash }) =>
  Response.exists({ surveyId, 'metadata.ipHash': ipHash });

export const existsResponseByContactKey = async ({ surveyId, contactKeyHash }) =>
  Response.exists({ surveyId, 'metadata.contactKeyHash': contactKeyHash });
