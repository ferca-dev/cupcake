import { purgeDeletedImages } from '../../media/media.service.js';
import { JOB_TYPES } from '../job.constants.js';
import { registerJobHandler } from '../job.registry.js';

/**
 * Runs the soft-delete purge: media assets marked `deleted` for longer than
 * the retention window are removed from object storage and Mongo. The
 * underlying service already handles missing storage objects gracefully, so
 * the job is naturally idempotent — a second run within the same window
 * simply finds an empty result set.
 */
const handler = async (payload = {}) => {
  const result = await purgeDeletedImages({ limit: payload.limit ?? 200 });
  return { purged: result.purged.length };
};

export const register = () => registerJobHandler(JOB_TYPES.MEDIA_CLEANUP, handler);

export const __testing = { handler };
