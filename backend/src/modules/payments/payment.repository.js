import mongoose from 'mongoose';

import { PaymentTransaction } from './payment-transaction.model.js';
import { PaymentWebhookEvent } from './payment-webhook-event.model.js';
import { SubscriptionPlan } from './subscription-plan.model.js';
import { TenantSubscription } from './tenant-subscription.model.js';
import { SubscriptionInvoice } from './subscription-invoice.model.js';
import { PaymentNotification } from './payment-notification.model.js';

const tenantFilter = (filter = {}, tenantId = null) =>
  tenantId ? { ...filter, tenantId } : filter;

const paginate = async (Model, filter, { page = 1, limit = 25, sort = '-createdAt' }) => {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skip).limit(limit),
    Model.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

// Payment transactions -------------------------------------------------

export const createTransaction = (payload) => PaymentTransaction.create(payload);

export const findTransactionById = ({ id, tenantId = null }) =>
  PaymentTransaction.findOne(tenantFilter({ _id: id }, tenantId));

export const findTransactionByExternalReference = (externalReference) =>
  PaymentTransaction.findOne({ externalReference });

export const findTransactionByPaymentId = (providerPaymentId) =>
  PaymentTransaction.findOne({ providerPaymentId });

export const findTransactions = ({ tenantId = null, status, purpose, page, limit, sort } = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  if (purpose) filter.purpose = purpose;
  return paginate(PaymentTransaction, filter, { page, limit, sort });
};

export const saveTransaction = async (doc, updates) => {
  Object.assign(doc, updates);
  await doc.save();
  return doc;
};

// Webhook events -------------------------------------------------------

export const createWebhookEvent = (payload) => PaymentWebhookEvent.create(payload);

export const findWebhookEventByProviderEventId = ({ provider, providerEventId }) =>
  PaymentWebhookEvent.findOne({ provider, providerEventId });

export const findWebhookEvents = ({ provider, status, page, limit, sort } = {}) => {
  const filter = {};
  if (provider) filter.provider = provider;
  if (status) filter.status = status;
  return paginate(PaymentWebhookEvent, filter, { page, limit, sort });
};

export const saveWebhookEvent = async (doc, updates) => {
  Object.assign(doc, updates);
  await doc.save();
  return doc;
};

// Subscription plans ---------------------------------------------------

export const findPlans = ({ status, page, limit, sort } = {}) => {
  const filter = {};
  if (status) filter.status = status;
  return paginate(SubscriptionPlan, filter, { page, limit, sort });
};

export const findPlanById = (id) => SubscriptionPlan.findById(id);
export const findPlanByCode = (code) => SubscriptionPlan.findOne({ code });

export const createPlan = (payload) => SubscriptionPlan.create(payload);

export const savePlan = async (plan, updates) => {
  Object.assign(plan, updates);
  await plan.save();
  return plan;
};

// Tenant subscriptions -------------------------------------------------

export const createSubscription = (payload) => TenantSubscription.create(payload);

export const findSubscriptionById = ({ id, tenantId = null }) =>
  TenantSubscription.findOne(tenantFilter({ _id: id }, tenantId));

export const findSubscriptionByExternalReference = (externalReference) =>
  TenantSubscription.findOne({ externalReference });

export const findSubscriptionByPreapprovalId = (preapprovalId) =>
  TenantSubscription.findOne({ mercadoPagoPreapprovalId: preapprovalId });

export const findActiveSubscriptionForTenant = (tenantId) =>
  TenantSubscription.findOne({
    tenantId,
    status: mongoose.trusted({ $in: ['authorized', 'paused', 'pending'] }),
  });

export const findSubscriptions = ({ tenantId, status, page, limit, sort } = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (status) filter.status = status;
  return paginate(TenantSubscription, filter, { page, limit, sort });
};

export const findSubscriptionsDueForRenewalReminder = ({ before }) =>
  TenantSubscription.find({
    status: 'authorized',
    nextChargeAt: mongoose.trusted({ $ne: null, $lte: before }),
  });

export const saveSubscription = async (sub, updates) => {
  Object.assign(sub, updates);
  await sub.save();
  return sub;
};

// Subscription invoices ------------------------------------------------

export const createInvoice = (payload) => SubscriptionInvoice.create(payload);

export const findInvoiceByAuthorizedPaymentId = (id) =>
  SubscriptionInvoice.findOne({ mercadoPagoAuthorizedPaymentId: id });

export const findInvoicesForSubscription = (subscriptionId) =>
  SubscriptionInvoice.find({ subscriptionId }).sort('-createdAt');

export const findInvoicesForTenant = ({ tenantId, page, limit, sort } = {}) =>
  paginate(SubscriptionInvoice, tenantFilter({}, tenantId), { page, limit, sort });

export const saveInvoice = async (invoice, updates) => {
  Object.assign(invoice, updates);
  await invoice.save();
  return invoice;
};

// Payment notifications -----------------------------------------------

export const createNotification = (payload) => PaymentNotification.create(payload);

export const findNotificationByIdempotencyKey = (idempotencyKey) =>
  PaymentNotification.findOne({ idempotencyKey });

export const findNotifications = ({ tenantId, type, page, limit, sort } = {}) => {
  const filter = tenantFilter({}, tenantId);
  if (type) filter.type = type;
  return paginate(PaymentNotification, filter, { page, limit, sort });
};

export const saveNotification = async (notification, updates) => {
  Object.assign(notification, updates);
  await notification.save();
  return notification;
};
