import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-Cupcake-Signature';
export const EVENT_ID_HEADER = 'X-Cupcake-Event-Id';
export const EVENT_TYPE_HEADER = 'X-Cupcake-Event-Type';
export const TIMESTAMP_HEADER = 'X-Cupcake-Timestamp';

/**
 * Generate a cryptographically strong secret for a new webhook endpoint.
 * Tenant-visible value — store as-is on the endpoint document and never
 * log it.
 */
export const generateWebhookSecret = () => `whsec_${randomBytes(32).toString('base64url')}`;

const canonical = (timestamp, body) => `${timestamp}.${body}`;

/**
 * Compute the signature header value for an outbound delivery. We use the
 * `t=<unix>,v1=<hex>` format Stripe popularised: the timestamp is part of
 * the signed string so a static replay against a different time window is
 * detectable, and `v1` leaves room for algorithm migrations.
 */
export const signWebhookPayload = ({ secret, body, timestamp = Date.now() }) => {
  const ts = Math.floor(Number(timestamp) / 1000);
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  const v1 = createHmac('sha256', String(secret)).update(canonical(ts, serialized)).digest('hex');
  return { header: `t=${ts},v1=${v1}`, timestamp: ts, signature: v1, body: serialized };
};

const parseHeader = (header) => {
  if (typeof header !== 'string' || header.length === 0) return null;
  const parts = header.split(',').map((entry) => entry.trim());
  const result = { t: null, v1: null };
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (key === 't') result.t = Number(value);
    if (key === 'v1') result.v1 = value;
  }
  if (!result.t || !result.v1) return null;
  return result;
};

/**
 * Receiver-side signature verification. Returns true when the header value
 * matches the body using the supplied secret and falls inside the optional
 * `toleranceSeconds` window. Exported so the test event endpoint and any
 * external SDK reference can share the same implementation.
 */
export const verifyWebhookSignature = ({ secret, body, header, toleranceSeconds = 300 }) => {
  const parsed = parseHeader(header);
  if (!parsed) return false;
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  const expected = createHmac('sha256', String(secret))
    .update(canonical(parsed.t, serialized))
    .digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(parsed.v1, 'hex');
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  if (toleranceSeconds && Number.isFinite(toleranceSeconds)) {
    const drift = Math.abs(Math.floor(Date.now() / 1000) - parsed.t);
    if (drift > toleranceSeconds) return false;
  }
  return true;
};
