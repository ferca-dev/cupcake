import { recordAuditEvent } from '../../audit/audit.service.js';
import { JOB_TYPES } from '../job.constants.js';
import { registerJobHandler } from '../job.registry.js';

/**
 * Placeholder processors for workflows whose business logic is intentionally
 * deferred in earlier phases (contact import/export, response export,
 * outbound webhook delivery, report generation). Wiring the job handlers
 * now means the queue infrastructure is exercised end-to-end and the
 * future implementation only needs to fill in the work — no new producer
 * code has to be added.
 *
 * Each handler:
 *   - Records an audit event so operators can see the attempt.
 *   - Returns a `pending_implementation` flag so consumers cannot
 *     accidentally rely on completed semantics.
 */
const buildPlaceholderHandler = (jobType, entityType, action) => async (payload, { job }) => {
  await recordAuditEvent({
    action,
    entityType,
    entityId: job._id.toString(),
    tenantId: payload?.tenantId ?? null,
    userId: payload?.actor?.id ?? job.enqueuedBy?.toString() ?? null,
    metadata: { jobType, ...payload, placeholder: true },
  });
  return { status: 'pending_implementation', jobType };
};

export const register = () => {
  registerJobHandler(
    JOB_TYPES.CONTACT_IMPORT,
    buildPlaceholderHandler(JOB_TYPES.CONTACT_IMPORT, 'contact_import', 'job.contact.import.run'),
  );
  registerJobHandler(
    JOB_TYPES.CONTACT_EXPORT,
    buildPlaceholderHandler(JOB_TYPES.CONTACT_EXPORT, 'contact_export', 'job.contact.export.run'),
  );
  registerJobHandler(
    JOB_TYPES.RESPONSE_EXPORT,
    buildPlaceholderHandler(JOB_TYPES.RESPONSE_EXPORT, 'response_export', 'job.response.export.run'),
  );
  registerJobHandler(
    JOB_TYPES.WEBHOOK_RETRY,
    buildPlaceholderHandler(JOB_TYPES.WEBHOOK_RETRY, 'webhook_delivery', 'job.webhook.retry.run'),
  );
  registerJobHandler(
    JOB_TYPES.REPORT_GENERATE,
    buildPlaceholderHandler(JOB_TYPES.REPORT_GENERATE, 'report', 'job.report.generate.run'),
  );
};

export const __testing = { buildPlaceholderHandler };
