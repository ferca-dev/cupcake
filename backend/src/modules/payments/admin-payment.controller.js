import * as paymentService from './payment.service.js';
import * as subscriptionService from './subscription.service.js';
import * as reminders from './reminders.service.js';
import {
  listTransactionsQuerySchema,
  listWebhookEventsQuerySchema,
  createPlanSchema,
  updatePlanSchema,
  updatePlanStatusSchema,
  listSubscriptionsQuerySchema,
} from './payment.validation.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';
import { HTTP_STATUS } from '../../common/constants/index.js';

// Payment records ----------------------------------------------------

export const listPayments = asyncHandler(async (req, res) => {
  const query = listTransactionsQuerySchema.parse(req.query ?? {});
  const data = await paymentService.listAdminTransactions({ query });
  return sendSuccess(res, { data, message: 'Payments fetched' });
});

export const getPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.getAdminTransaction({ id: req.params.id });
  return sendSuccess(res, { data: { payment: data }, message: 'Payment fetched' });
});

// Webhook events ----------------------------------------------------

export const listWebhookEvents = asyncHandler(async (req, res) => {
  const query = listWebhookEventsQuerySchema.parse(req.query ?? {});
  const data = await paymentService.listAdminWebhookEvents({ query });
  return sendSuccess(res, { data, message: 'Webhook events fetched' });
});

export const reconcilePayment = asyncHandler(async (req, res) => {
  const { paymentId } = req.body ?? {};
  const result = await paymentService.reconcilePayment({ paymentId });
  return sendSuccess(res, { data: { result }, message: 'Reconciliation processed' });
});

// Subscription plans ------------------------------------------------

export const listPlans = asyncHandler(async (req, res) => {
  const data = await subscriptionService.listPlans({
    status: req.query?.status,
    page: req.query?.page ? Number(req.query.page) : undefined,
    limit: req.query?.limit ? Number(req.query.limit) : undefined,
    sort: req.query?.sort,
  });
  return sendSuccess(res, { data, message: 'Subscription plans fetched' });
});

export const createPlan = asyncHandler(async (req, res) => {
  const payload = createPlanSchema.parse(req.body ?? {});
  const plan = await subscriptionService.createPlan({ payload, actor: req.user });
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    data: { plan },
    message: 'Subscription plan created',
  });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const payload = updatePlanSchema.parse(req.body ?? {});
  const plan = await subscriptionService.updatePlan({
    id: req.params.id,
    payload,
    actor: req.user,
  });
  return sendSuccess(res, { data: { plan }, message: 'Subscription plan updated' });
});

export const updatePlanStatus = asyncHandler(async (req, res) => {
  const payload = updatePlanStatusSchema.parse(req.body ?? {});
  const plan = await subscriptionService.updatePlanStatus({
    id: req.params.id,
    status: payload.status,
    actor: req.user,
  });
  return sendSuccess(res, { data: { plan }, message: 'Subscription plan status updated' });
});

// Subscriptions -----------------------------------------------------

export const listSubscriptions = asyncHandler(async (req, res) => {
  const query = listSubscriptionsQuerySchema.parse(req.query ?? {});
  const data = await subscriptionService.listAdminSubscriptions({ query });
  return sendSuccess(res, { data, message: 'Subscriptions fetched' });
});

export const syncSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.syncSubscription({
    id: req.params.id,
    actor: req.user,
  });
  return sendSuccess(res, { data: { subscription }, message: 'Subscription synced' });
});

export const cancelSubscriptionAsAdmin = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription({
    id: req.params.id,
    actor: req.user,
  });
  return sendSuccess(res, { data: { subscription }, message: 'Subscription cancelled' });
});

// Reminder job triggers --------------------------------------------

export const triggerLowBalanceReminders = asyncHandler(async (_req, res) => {
  const result = await reminders.runLowTokenBalanceReminders();
  return sendSuccess(res, { data: result, message: 'Low balance reminders processed' });
});

export const triggerRenewalReminders = asyncHandler(async (_req, res) => {
  const result = await reminders.runRenewalReminders();
  return sendSuccess(res, { data: result, message: 'Renewal reminders processed' });
});
