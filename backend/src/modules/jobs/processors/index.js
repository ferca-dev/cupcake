import { register as registerCampaignSend } from './campaign-send.processor.js';
import { register as registerPaymentReminders } from './payment-reminders.processor.js';
import { register as registerMediaCleanup } from './media-cleanup.processor.js';
import { register as registerDeferred } from './deferred.processors.js';
import { clearJobHandlers } from '../job.registry.js';

/**
 * Wires every processor up to the job registry. Called by `server.js`
 * (so HTTP handlers can enqueue jobs and have them run via the inline driver
 * during tests) and by `worker.js` (so the polling worker can claim and run
 * the same handlers).
 */
export const registerAllProcessors = () => {
  // Re-registering is safe because the registry overwrites by type, but we
  // clear it first so a partial reload (e.g. a test that mocks one
  // processor) leaves no stale handlers behind.
  clearJobHandlers();
  registerCampaignSend();
  registerPaymentReminders();
  registerMediaCleanup();
  registerDeferred();
};
