import * as paymentService from './payment.service.js';
import * as subscriptionService from './subscription.service.js';
import {
  createTokenPreferenceSchema,
  listTransactionsQuerySchema,
  listSubscriptionsQuerySchema,
  createSubscriptionSchema,
} from './payment.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

const resolveTenantId = (req) => req.tenantContext?.tenantId ?? null;

// Token package preference / payment lookups -------------------------

export const createTokenPackagePreference = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const payload = createTokenPreferenceSchema.parse(req.body ?? {});
  const result = await paymentService.createTokenPackagePreference({
    tenantId,
    packageId: payload.packageId,
    payerEmail: payload.payerEmail ?? null,
    actor: req.user,
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: result,
    message: 'Mercado Pago preference created',
  });
});

export const listClientPayments = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const query = listTransactionsQuerySchema.parse(req.query ?? {});
  const data = await paymentService.listClientTransactions({ tenantId, query });
  return sendSuccess(res, { data, message: 'Payments fetched' });
});

export const getClientPayment = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const data = await paymentService.getClientTransaction({ tenantId, id: req.params.id });
  return sendSuccess(res, { data: { payment: data }, message: 'Payment fetched' });
});

// Subscriptions ------------------------------------------------------

export const listClientSubscriptionPlans = asyncHandler(async (_req, res) => {
  const data = await subscriptionService.listActivePlans();
  return sendSuccess(res, { data, message: 'Subscription plans fetched' });
});

export const listClientSubscriptions = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const query = listSubscriptionsQuerySchema.parse(req.query ?? {});
  const data = await subscriptionService.listSubscriptionsForTenant({ tenantId, query });
  return sendSuccess(res, { data, message: 'Subscriptions fetched' });
});

export const createSubscription = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const payload = createSubscriptionSchema.parse(req.body ?? {});
  const result = await subscriptionService.createSubscription({
    tenantId,
    planId: payload.planId,
    payerEmail: payload.payerEmail ?? null,
    actor: req.user,
  });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: result,
    message: 'Subscription created',
  });
});

export const cancelClientSubscription = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const subscription = await subscriptionService.cancelSubscription({
    id: req.params.id,
    tenantId,
    actor: req.user,
  });
  return sendSuccess(res, { data: { subscription }, message: 'Subscription cancelled' });
});

export const resumeClientSubscription = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const subscription = await subscriptionService.resumeSubscription({
    id: req.params.id,
    tenantId,
    actor: req.user,
  });
  return sendSuccess(res, { data: { subscription }, message: 'Subscription resumed' });
});

export const listClientInvoices = asyncHandler(async (req, res) => {
  const tenantId = resolveTenantId(req);
  const data = await subscriptionService.listInvoicesForTenant({
    tenantId,
    query: req.query ?? {},
  });
  return sendSuccess(res, { data, message: 'Invoices fetched' });
});
