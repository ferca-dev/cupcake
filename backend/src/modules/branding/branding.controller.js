import * as brandingService from './branding.service.js';
import { updateBrandingSchema } from './branding.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? req.user?.tenantId ?? null;

export const getBranding = asyncHandler(async (req, res) => {
  const result = await brandingService.getBranding({ tenantId: resolveTenantId(req) });
  return sendSuccess(res, { data: result, message: 'Branding fetched' });
});

export const updateBranding = asyncHandler(async (req, res) => {
  const payload = updateBrandingSchema.parse(req.body ?? {});
  const result = await brandingService.updateBranding({
    tenantId: resolveTenantId(req),
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Branding updated' });
});
