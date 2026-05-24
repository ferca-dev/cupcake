import mongoose from 'mongoose';

import { API_SCOPE_VALUES } from './api-scopes.js';

const { Schema, Types } = mongoose;

export const API_KEY_STATUSES = Object.freeze(['active', 'revoked']);

/**
 * Tenant-scoped API keys.
 *
 * Keys are presented to the client as `{prefix}.{secret}` exactly once on
 * creation/rotation. The database only stores the prefix (for fast lookup)
 * and a HMAC-SHA-256 of the secret part — there is no way to recover the
 * full key from the row. Revoking a key flips `status` to `revoked` and
 * fills `revokedAt`; the row is kept for audit traceability.
 */
const apiKeySchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, trim: true, maxlength: 500 },
    prefix: { type: String, required: true, trim: true, maxlength: 24 },
    secretHash: { type: String, required: true },
    scopes: {
      type: [{ type: String, enum: API_SCOPE_VALUES }],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: 'At least one scope is required',
      },
    },
    status: { type: String, enum: API_KEY_STATUSES, default: 'active', index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    expiresAt: { type: Date, default: null, index: true },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Types.ObjectId, ref: 'User', default: null },
    rotatedFromId: { type: Types.ObjectId, ref: 'ApiKey', default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

apiKeySchema.index({ tenantId: 1, createdAt: -1 });
// Prefix must be globally unique so the auth middleware can find the row
// from the presented token without scanning the tenant set.
apiKeySchema.index({ prefix: 1 }, { unique: true });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  // Never echo the secret hash through the API.
  delete ret.secretHash;
  return ret;
};

apiKeySchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
apiKeySchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const ApiKey = mongoose.models.ApiKey ?? mongoose.model('ApiKey', apiKeySchema);
