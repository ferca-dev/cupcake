import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { ApiKey } from './api-key.model.js';
import { API_SCOPE_VALUES, isValidScope } from './api-scopes.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { loadEnv } from '../../config/env.js';
import { recordAuditEvent } from '../audit/audit.service.js';

const PREFIX_LENGTH = 12;
const SECRET_BYTE_LENGTH = 32; // 256 bits of entropy
const KEY_LABEL = 'cup_live';

/**
 * Returns the HMAC secret used to hash API key secret parts. Falls back to
 * the JWT access secret when WEBHOOK_SIGNING_SECRET is not configured so
 * existing local deployments keep working. Production must set the dedicated
 * value to scope rotation independently from auth.
 */
const apiKeyHashSecret = () => {
  const env = loadEnv();
  return env.WEBHOOK_SIGNING_SECRET && env.WEBHOOK_SIGNING_SECRET.length > 0
    ? env.WEBHOOK_SIGNING_SECRET
    : env.JWT_ACCESS_SECRET;
};

export const hashApiKeySecret = (secret) =>
  createHmac('sha256', apiKeyHashSecret()).update(String(secret)).digest('hex');

const generatePrefix = () => {
  // Use a URL-safe base32-style alphabet so the prefix can appear in logs
  // without escaping. `0`/`O`/`1`/`I` are dropped to avoid visual collisions.
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(PREFIX_LENGTH);
  let out = '';
  for (let i = 0; i < PREFIX_LENGTH; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return `${KEY_LABEL}_${out}`;
};

const generateSecret = () => randomBytes(SECRET_BYTE_LENGTH).toString('base64url');

const safeEqualHex = (expectedHex, providedHex) => {
  if (typeof expectedHex !== 'string' || typeof providedHex !== 'string') return false;
  if (expectedHex.length !== providedHex.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(providedHex, 'hex'));
  } catch {
    return false;
  }
};

export const splitPresentedKey = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.includes('.')) return null;
  const idx = trimmed.lastIndexOf('.');
  const prefix = trimmed.slice(0, idx);
  const secret = trimmed.slice(idx + 1);
  if (!prefix.startsWith(`${KEY_LABEL}_`)) return null;
  if (prefix.length === 0 || secret.length === 0) return null;
  return { prefix, secret };
};

const sanitiseScopes = (scopes) => {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ValidationError('At least one scope is required');
  }
  const seen = new Set();
  const out = [];
  for (const scope of scopes) {
    if (typeof scope !== 'string') continue;
    const trimmed = scope.trim();
    if (!isValidScope(trimmed)) {
      throw new ValidationError(`Unknown API scope: ${trimmed}`, [
        { field: 'scopes', value: scope, allowed: API_SCOPE_VALUES },
      ]);
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  if (out.length === 0) throw new ValidationError('At least one scope is required');
  return out;
};

const sanitiseExpiry = (expiresAt) => {
  if (expiresAt === undefined || expiresAt === null || expiresAt === '') return null;
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('expiresAt must be a valid date');
  }
  if (date.getTime() <= Date.now()) {
    throw new ValidationError('expiresAt must be in the future');
  }
  return date;
};

const ensureTenant = (tenantId) => {
  if (!tenantId) throw new ValidationError('Tenant context is required');
  return tenantId.toString();
};

export const toPublicApiKey = (doc, { rawKey = null } = {}) => {
  const data = {
    id: doc._id.toString(),
    tenantId: doc.tenantId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    prefix: doc.prefix,
    scopes: [...doc.scopes],
    status: doc.status,
    createdBy: doc.createdBy?.toString() ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastUsedAt: doc.lastUsedAt ?? null,
    lastUsedIp: doc.lastUsedIp ?? null,
    expiresAt: doc.expiresAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    revokedBy: doc.revokedBy?.toString() ?? null,
    rotatedFromId: doc.rotatedFromId?.toString() ?? null,
  };
  if (rawKey) data.rawKey = rawKey;
  return data;
};

/**
 * Generate, persist, and return a new API key. The raw key is returned in
 * `result.rawKey` exactly once — the caller is responsible for displaying it
 * to the user and dropping the variable.
 */
export const createApiKey = async ({ tenantId, name, description, scopes, expiresAt, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('API key name is required');
  }
  if (!actor?.id) throw new ValidationError('Actor is required to create an API key');

  const normalisedScopes = sanitiseScopes(scopes);
  const expiry = sanitiseExpiry(expiresAt);

  const prefix = generatePrefix();
  const secret = generateSecret();
  const rawKey = `${prefix}.${secret}`;

  let doc;
  try {
    doc = await ApiKey.create({
      tenantId: tenant,
      name: name.trim(),
      description: description?.trim() ?? null,
      prefix,
      secretHash: hashApiKeySecret(secret),
      scopes: normalisedScopes,
      status: 'active',
      createdBy: actor.id,
      expiresAt: expiry,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Astronomically unlikely prefix collision — retry with a fresh prefix.
      return createApiKey({ tenantId, name, description, scopes, expiresAt, actor });
    }
    throw err;
  }

  await recordAuditEvent({
    action: 'api_key.created',
    entityType: 'api_key',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { name: doc.name, scopes: doc.scopes, prefix: doc.prefix },
  });

  return toPublicApiKey(doc, { rawKey });
};

export const listApiKeys = async ({ tenantId }) => {
  const tenant = ensureTenant(tenantId);
  const docs = await ApiKey.find({ tenantId: tenant }).sort({ createdAt: -1 });
  return docs.map((doc) => toPublicApiKey(doc));
};

export const getApiKey = async ({ tenantId, id }) => {
  const tenant = ensureTenant(tenantId);
  const doc = await ApiKey.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('API key not found');
  return toPublicApiKey(doc);
};

export const rotateApiKey = async ({ tenantId, id, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to rotate an API key');

  const previous = await ApiKey.findOne({ _id: id, tenantId: tenant });
  if (!previous) throw new NotFoundError('API key not found');
  if (previous.status !== 'active') {
    throw new ConflictError('Only active keys can be rotated');
  }

  // The rotated key inherits scopes, name, and expiry. Marking the previous
  // row as revoked (instead of deleting) keeps the audit trail intact and
  // lets the UI surface "rotated from" history.
  previous.status = 'revoked';
  previous.revokedAt = new Date();
  previous.revokedBy = actor.id;
  await previous.save();

  const replacement = await createApiKey({
    tenantId: tenant,
    name: previous.name,
    description: previous.description,
    scopes: previous.scopes,
    expiresAt: previous.expiresAt,
    actor,
  });

  // Backfill the rotation link on the new key.
  await ApiKey.updateOne({ _id: replacement.id }, { rotatedFromId: previous._id });
  replacement.rotatedFromId = previous._id.toString();

  await recordAuditEvent({
    action: 'api_key.rotated',
    entityType: 'api_key',
    entityId: previous._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { newKeyId: replacement.id, prefix: replacement.prefix },
  });

  return { previous: toPublicApiKey(previous), replacement };
};

export const revokeApiKey = async ({ tenantId, id, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to revoke an API key');

  const doc = await ApiKey.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('API key not found');
  if (doc.status === 'revoked') {
    return toPublicApiKey(doc);
  }
  doc.status = 'revoked';
  doc.revokedAt = new Date();
  doc.revokedBy = actor.id;
  await doc.save();

  await recordAuditEvent({
    action: 'api_key.revoked',
    entityType: 'api_key',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { prefix: doc.prefix },
  });

  return toPublicApiKey(doc);
};

export const deleteApiKey = async ({ tenantId, id, actor }) => {
  const tenant = ensureTenant(tenantId);
  if (!actor?.id) throw new ValidationError('Actor is required to delete an API key');
  const doc = await ApiKey.findOne({ _id: id, tenantId: tenant });
  if (!doc) throw new NotFoundError('API key not found');
  await ApiKey.deleteOne({ _id: doc._id });

  await recordAuditEvent({
    action: 'api_key.deleted',
    entityType: 'api_key',
    entityId: doc._id.toString(),
    tenantId: tenant,
    userId: actor.id,
    metadata: { prefix: doc.prefix },
  });

  return { id: doc._id.toString(), deleted: true };
};

/**
 * Find and verify an API key given the raw `{prefix}.{secret}` value. Returns
 * the document and sanitised user payload, or throws AuthenticationError.
 *
 * Records `lastUsedAt`/`lastUsedIp` opportunistically so subsequent failures
 * do not block the verification path.
 */
export const authenticateApiKey = async ({ raw, ip = null }) => {
  const parts = splitPresentedKey(raw);
  if (!parts) {
    throw new AuthenticationError('Invalid API key');
  }
  const doc = await ApiKey.findOne({ prefix: parts.prefix });
  if (!doc) {
    throw new AuthenticationError('Invalid API key');
  }
  if (doc.status !== 'active') {
    throw new AuthenticationError('API key has been revoked');
  }
  if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationError('API key has expired');
  }
  if (!safeEqualHex(doc.secretHash, hashApiKeySecret(parts.secret))) {
    throw new AuthenticationError('Invalid API key');
  }

  // Stamp last-used asynchronously — failure to update is non-fatal.
  ApiKey.updateOne(
    { _id: doc._id },
    { lastUsedAt: new Date(), lastUsedIp: ip ? String(ip).slice(0, 64) : null },
  ).catch(() => {});

  return doc;
};
