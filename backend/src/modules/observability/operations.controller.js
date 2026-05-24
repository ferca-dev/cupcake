import mongoose from 'mongoose';

import { Job } from '../jobs/job.model.js';
import { WebhookDelivery } from '../developer/webhook-delivery.model.js';
import { PaymentTransaction } from '../payments/payment-transaction.model.js';
import { PaymentWebhookEvent } from '../payments/payment-webhook-event.model.js';
import { MediaAsset } from '../media/media-asset.model.js';
import { getMetricsSnapshot, renderPrometheusMetrics } from './metrics.service.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { sendSuccess } from '../../common/responses/index.js';

const sinceDate = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000);

export const getOperationalSummary = asyncHandler(async (_req, res) => {
  const since24h = sinceDate(24);
  const [
    queuedJobs,
    runningJobs,
    failedJobs,
    deadLetterJobs,
    failedWebhookDeliveries,
    deadWebhookDeliveries,
    failedPaymentWebhooks,
    failedPayments,
    deletedMediaAssets,
  ] = await Promise.all([
    Job.countDocuments({ status: 'queued' }),
    Job.countDocuments({ status: 'running' }),
    Job.countDocuments({ status: 'failed' }),
    Job.countDocuments({ status: 'dead_letter' }),
    WebhookDelivery.countDocuments({
      status: 'failed',
      updatedAt: mongoose.trusted({ $gte: since24h }),
    }),
    WebhookDelivery.countDocuments({
      status: 'dead_letter',
      updatedAt: mongoose.trusted({ $gte: since24h }),
    }),
    PaymentWebhookEvent.countDocuments({
      status: 'failed',
      updatedAt: mongoose.trusted({ $gte: since24h }),
    }),
    PaymentTransaction.countDocuments({
      status: mongoose.trusted({ $in: ['failed', 'rejected', 'charged_back'] }),
      updatedAt: mongoose.trusted({ $gte: since24h }),
    }),
    MediaAsset.countDocuments({
      status: 'deleted',
      updatedAt: mongoose.trusted({ $gte: since24h }),
    }),
  ]);

  return sendSuccess(res, {
    data: {
      window: { hours: 24, since: since24h.toISOString() },
      jobs: {
        queued: queuedJobs,
        running: runningJobs,
        failed: failedJobs,
        deadLetter: deadLetterJobs,
      },
      webhooks: { failed: failedWebhookDeliveries, deadLetter: deadWebhookDeliveries },
      payments: { failedWebhooks: failedPaymentWebhooks, failedPayments },
      storage: { deletedMediaAssets },
      metrics: getMetricsSnapshot(),
    },
    message: 'Operational summary fetched',
  });
});

export const getMetrics = asyncHandler(async (req, res) => {
  const accept = req.get('accept') ?? '';
  if (accept.includes('text/plain')) {
    return res.type('text/plain').send(renderPrometheusMetrics());
  }
  return sendSuccess(res, { data: getMetricsSnapshot(), message: 'Metrics fetched' });
});
