import { enqueueJob } from './job.service.js';
import { JOB_TYPES, SCHEDULED_JOB_KEYS } from './job.constants.js';
import { logger } from '../../common/utils/logger.js';
import { loadEnv } from '../../config/env.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Yields the date stamp used in scheduled dedupe keys. Using the calendar
 * day means re-running the scheduler within the same UTC day is a no-op,
 * which keeps multi-instance deployments safe.
 */
const todayStamp = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Recurring schedule the worker enqueues on boot and re-checks once per
 * hour. The cadence is intentionally simple: the dedupe keys collapse
 * duplicate enqueues, so a re-check 60 minutes after boot is cheap.
 *
 * Each entry resolves to either a "fire-and-forget" reminder enqueue or a
 * housekeeping task. Operators can also trigger any of these directly via
 * the admin API while debugging.
 */
const SCHEDULED = [
  {
    name: 'low-balance reminders',
    enqueue: () =>
      enqueueJob({
        type: JOB_TYPES.PAYMENT_REMINDER_LOW_BALANCE,
        payload: { triggeredBy: 'scheduler' },
        dedupeKey: `${SCHEDULED_JOB_KEYS.PAYMENT_REMINDER_LOW_BALANCE_DAILY}:${todayStamp()}`,
        recurrence: 'daily',
      }),
  },
  {
    name: 'renewal reminders',
    enqueue: () =>
      enqueueJob({
        type: JOB_TYPES.PAYMENT_REMINDER_RENEWAL,
        payload: { triggeredBy: 'scheduler' },
        dedupeKey: `${SCHEDULED_JOB_KEYS.PAYMENT_REMINDER_RENEWAL_DAILY}:${todayStamp()}`,
        recurrence: 'daily',
      }),
  },
  {
    name: 'media cleanup',
    enqueue: () =>
      enqueueJob({
        type: JOB_TYPES.MEDIA_CLEANUP,
        payload: { triggeredBy: 'scheduler' },
        // Weekly cadence: stamp by ISO week-anchored date so a re-boot mid
        // week does not re-enqueue.
        dedupeKey: `${SCHEDULED_JOB_KEYS.MEDIA_CLEANUP_WEEKLY}:${todayStamp().slice(0, 7)}`,
        recurrence: 'weekly',
      }),
  },
];

const tick = async () => {
  for (const entry of SCHEDULED) {
    try {
      await entry.enqueue();
    } catch (err) {
      logger.warn({ err, scheduled: entry.name }, 'Failed to enqueue scheduled job');
    }
  }
};

export const createJobScheduler = ({ env = loadEnv() } = {}) => {
  let timer = null;

  return {
    /** Enqueue every recurring job and arm the periodic re-check. */
    async start() {
      if (timer) return;
      logger.info({ tasks: SCHEDULED.map((s) => s.name) }, 'Job scheduler starting');
      await tick();
      timer = setInterval(() => {
        tick().catch((err) => logger.error({ err }, 'Scheduler tick failed'));
      }, ONE_HOUR_MS);
      timer.unref?.();
      // Test environments may want the scheduler to run faster. We keep the
      // configuration knob in env.js intentionally minimal — a future phase
      // can extend it if real cron expressions become necessary.
      if (env.isTest) {
        clearInterval(timer);
        timer = null;
      }
    },
    /** Force an immediate sweep, useful for tests and admin "run now" buttons. */
    async runNow() {
      await tick();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
};

export const __testing = { todayStamp, SCHEDULED_TASKS: SCHEDULED, ONE_DAY_MS };
