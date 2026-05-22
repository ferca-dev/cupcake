import { createHash } from 'node:crypto';

import { loadEnv } from '../../config/env.js';

const env = loadEnv();

// Stable salt for response-limit dedupe hashes. Defaults to the JWT access
// secret so existing deployments do not require a new env var; production can
// override with RESPONSE_HASH_SECRET to rotate the keyspace independently.
const RESPONSE_HASH_SECRET = process.env.RESPONSE_HASH_SECRET || env.JWT_ACCESS_SECRET || 'cupcake';

/**
 * Deterministic one-way digest used to deduplicate response submitters by
 * device key, IP, or contact identifier without storing the raw value.
 * Including the survey id in the input means the same browser key cannot be
 * correlated across surveys, while the secret prevents reversal via lookup.
 */
export const hashResponseKey = ({ kind, surveyId, value }) => {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (!surveyId) return null;
  const normalised = value.trim();
  if (normalised.length === 0) return null;
  return createHash('sha256')
    .update(`${RESPONSE_HASH_SECRET}|${kind}|${String(surveyId)}|${normalised}`)
    .digest('hex');
};
