import * as tokenService from './token.service.js';
import {
  listPackagesQuerySchema,
  createPackageSchema,
  updatePackageSchema,
  updatePackageStatusSchema,
  updateChannelPricingSchema,
  updateSendLimitsSchema,
  adjustmentSchema,
  listPurchasesQuerySchema,
  purchaseDecisionSchema,
} from './token.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';
import { ValidationError } from '../../common/errors/index.js';
import mongoose from 'mongoose';

const requestContext = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') ?? null,
});

const assertTenantParam = (req) => {
  const { tenantId } = req.params;
  if (!mongoose.isValidObjectId(tenantId)) {
    throw new ValidationError('Invalid tenant id');
  }
  return tenantId;
};

// Packages -------------------------------------------------------------

export const listPackages = asyncHandler(async (req, res) => {
  const query = listPackagesQuerySchema.parse(req.query ?? {});
  const result = await tokenService.listPackages(query);
  return sendSuccess(res, { data: result, message: 'Token packages fetched' });
});

export const createPackage = asyncHandler(async (req, res) => {
  const payload = createPackageSchema.parse(req.body ?? {});
  const pkg = await tokenService.createPackage({
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { package: pkg },
    message: 'Token package created',
  });
});

export const updatePackage = asyncHandler(async (req, res) => {
  const payload = updatePackageSchema.parse(req.body ?? {});
  const pkg = await tokenService.updatePackage({
    id: req.params.id,
    payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { package: pkg }, message: 'Token package updated' });
});

export const updatePackageStatus = asyncHandler(async (req, res) => {
  const { status } = updatePackageStatusSchema.parse(req.body ?? {});
  const pkg = await tokenService.updatePackageStatus({
    id: req.params.id,
    status,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { package: pkg }, message: 'Token package status updated' });
});

// Channel pricing ------------------------------------------------------

export const listChannelPricing = asyncHandler(async (_req, res) => {
  const items = await tokenService.listChannelPricing();
  return sendSuccess(res, { data: { items }, message: 'Channel pricing fetched' });
});

export const updateChannelPricing = asyncHandler(async (req, res) => {
  const payload = updateChannelPricingSchema.parse(req.body ?? {});
  const rule = await tokenService.updateChannelPricing({
    channel: payload.channel,
    tokensPerRecipient: payload.tokensPerRecipient,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { rule }, message: 'Channel pricing updated' });
});

// Tenant send limits ---------------------------------------------------

export const getTenantSendLimits = asyncHandler(async (req, res) => {
  const tenantId = assertTenantParam(req);
  const limits = await tokenService.getTenantSendLimits({ tenantId });
  const usage = await tokenService.getMonthlyUsage({ tenantId });
  return sendSuccess(res, {
    data: { limits, usage },
    message: 'Tenant send limits fetched',
  });
});

export const updateTenantSendLimits = asyncHandler(async (req, res) => {
  const tenantId = assertTenantParam(req);
  const payload = updateSendLimitsSchema.parse(req.body ?? {});
  const limits = await tokenService.updateTenantSendLimits({
    tenantId,
    ...payload,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { limits }, message: 'Tenant send limits updated' });
});

// Manual adjustments ---------------------------------------------------

export const adjustTenantWallet = asyncHandler(async (req, res) => {
  const tenantId = assertTenantParam(req);
  const payload = adjustmentSchema.parse(req.body ?? {});
  const result = await tokenService.adjustWallet({
    tenantId,
    direction: payload.direction,
    amount: payload.amount,
    reason: payload.reason,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Token wallet adjusted' });
});

export const getTenantWallet = asyncHandler(async (req, res) => {
  const tenantId = assertTenantParam(req);
  const wallet = await tokenService.getBalance({ tenantId });
  const usage = await tokenService.getMonthlyUsage({ tenantId });
  return sendSuccess(res, {
    data: { wallet, usage },
    message: 'Tenant wallet fetched',
  });
});

// Purchases -----------------------------------------------------------

export const listPurchases = asyncHandler(async (req, res) => {
  const query = listPurchasesQuerySchema.parse(req.query ?? {});
  const result = await tokenService.listPurchases({
    tenantId: null,
    status: query.status,
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
  return sendSuccess(res, { data: result, message: 'Token purchases fetched' });
});

export const approvePurchase = asyncHandler(async (req, res) => {
  const payload = purchaseDecisionSchema.parse(req.body ?? {});
  const result = await tokenService.approvePurchase({
    id: req.params.id,
    decisionNotes: payload.decisionNotes ?? null,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: result, message: 'Token purchase approved' });
});

export const rejectPurchase = asyncHandler(async (req, res) => {
  const payload = purchaseDecisionSchema.parse(req.body ?? {});
  const purchase = await tokenService.rejectPurchase({
    id: req.params.id,
    decisionNotes: payload.decisionNotes ?? null,
    actor: req.user,
    ...requestContext(req),
  });
  return sendSuccess(res, { data: { purchase }, message: 'Token purchase rejected' });
});
