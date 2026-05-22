import * as mediaService from './media.service.js';
import { listImagesQuerySchema, uploadImageFieldsSchema } from './media.validation.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { sendSuccess } from '../../common/responses/index.js';
import { asyncHandler } from '../../common/utils/async-handler.js';

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const uploadImage = asyncHandler(async (req, res) => {
  const payload = uploadImageFieldsSchema.parse(req.body ?? {});
  const asset = await mediaService.uploadImage({
    tenantId: resolveTenantId(req),
    actor: req.user,
    file: req.file,
    purpose: payload.purpose,
  });

  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { asset },
    message: 'Image uploaded',
  });
});

export const listImages = asyncHandler(async (req, res) => {
  const query = listImagesQuerySchema.parse(req.query ?? {});
  const result = await mediaService.listImages({
    tenantId: resolveTenantId(req),
    ...query,
  });
  return sendSuccess(res, { data: result, message: 'Images fetched' });
});

export const getImage = asyncHandler(async (req, res) => {
  const asset = await mediaService.getImage({
    id: req.params.id,
    tenantId: resolveTenantId(req),
  });
  return sendSuccess(res, { data: { asset }, message: 'Image fetched' });
});

export const getImageUrl = asyncHandler(async (req, res) => {
  const result = await mediaService.getImageUrl({
    id: req.params.id,
    tenantId: resolveTenantId(req),
  });
  return sendSuccess(res, { data: result, message: 'Image URL fetched' });
});

export const deleteImage = asyncHandler(async (req, res) => {
  const result = await mediaService.deleteImage({
    id: req.params.id,
    tenantId: resolveTenantId(req),
  });
  return sendSuccess(res, { data: result, message: 'Image deleted' });
});
