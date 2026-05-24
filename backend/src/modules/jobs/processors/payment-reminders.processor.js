import { runLowTokenBalanceReminders, runRenewalReminders } from '../../payments/reminders.service.js';
import { JOB_TYPES } from '../job.constants.js';
import { registerJobHandler } from '../job.registry.js';

/**
 * Both reminder jobs delegate to the existing reminder service which is
 * already idempotent via the `payment_notifications.idempotencyKey` unique
 * index. A re-run on the same UTC day produces zero duplicate emails.
 */
const lowBalanceHandler = async () => {
  const result = await runLowTokenBalanceReminders();
  return { processed: result.processed };
};

const renewalHandler = async () => {
  const result = await runRenewalReminders();
  return { processed: result.processed };
};

export const register = () => {
  registerJobHandler(JOB_TYPES.PAYMENT_REMINDER_LOW_BALANCE, lowBalanceHandler);
  registerJobHandler(JOB_TYPES.PAYMENT_REMINDER_RENEWAL, renewalHandler);
};

export const __testing = { lowBalanceHandler, renewalHandler };
