import * as tokenService from './token.service.js';
import {
  listLedgerQuerySchema,
  listPurchasesQuerySchema,
  requestPurchaseSchema,
} from './token.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

export const getBalance = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const wallet = await tokenService.getBalance({ tenantId });
  const usage = await tokenService.getMonthlyUsage({ tenantId });
  const limits = await tokenService.getTenantSendLimits({ tenantId });
  const pricing = await tokenService.getPricingMap();
  return sendSuccess(res, {
    data: { wallet, usage, limits, pricing },
    message: 'Token wallet fetched',
  });
});

export const listLedger = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const query = listLedgerQuerySchema.parse(req.query ?? {});
  const result = await tokenService.listLedger({ tenantId, query });
  return sendSuccess(res, { data: result, message: 'Token ledger fetched' });
});

export const listAvailablePackages = asyncHandler(async (_req, res) => {
  const result = await tokenService.listPackages({ status: 'active', limit: 100 });
  return sendSuccess(res, { data: result, message: 'Token packages fetched' });
});

export const listMyPurchases = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const query = listPurchasesQuerySchema.parse(req.query ?? {});
  const result = await tokenService.listPurchases({
    tenantId,
    status: query.status,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
  return sendSuccess(res, { data: result, message: 'Token purchases fetched' });
});

export const createPurchaseRequest = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const payload = requestPurchaseSchema.parse(req.body ?? {});
  const purchase = await tokenService.requestPurchase({
    tenantId,
    packageId: payload.packageId,
    notes: payload.notes ?? null,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { purchase },
    message: 'Token purchase requested',
  });
});
