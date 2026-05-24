/**
 * Job lifecycle statuses. Jobs transition forward only:
 *   queued -> running -> (completed | failed | dead_letter)
 * A `failed` row is scheduled for retry; once it has exhausted its attempt
 * budget it moves to `dead_letter` and stays there until an operator retries
 * or deletes it.
 */
export const JOB_STATUSES = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
});

export const JOB_STATUS_VALUES = Object.freeze(Object.values(JOB_STATUSES));

/**
 * Canonical job types. Centralising the strings keeps producers and consumers
 * in sync and makes documentation/auditing easier. New job types must be
 * registered here AND in the processor registry before they can be enqueued.
 */
export const JOB_TYPES = Object.freeze({
  CAMPAIGN_SEND: 'campaign.send',
  CONTACT_IMPORT: 'contact.import',
  CONTACT_EXPORT: 'contact.export',
  RESPONSE_EXPORT: 'response.export',
  PAYMENT_REMINDER_LOW_BALANCE: 'payment.reminder.low_balance',
  PAYMENT_REMINDER_RENEWAL: 'payment.reminder.renewal',
  WEBHOOK_RETRY: 'webhook.retry',
  MEDIA_CLEANUP: 'media.cleanup',
  REPORT_GENERATE: 'report.generate',
});

export const JOB_TYPE_VALUES = Object.freeze(Object.values(JOB_TYPES));

/**
 * Recurring schedule identifiers used by `scheduler.js` to dedupe runs in
 * the job table and avoid stampedes from multiple scheduler instances.
 */
export const SCHEDULED_JOB_KEYS = Object.freeze({
  PAYMENT_REMINDER_LOW_BALANCE_DAILY: 'scheduler:payment.reminder.low_balance:daily',
  PAYMENT_REMINDER_RENEWAL_DAILY: 'scheduler:payment.reminder.renewal:daily',
  MEDIA_CLEANUP_WEEKLY: 'scheduler:media.cleanup:weekly',
});
