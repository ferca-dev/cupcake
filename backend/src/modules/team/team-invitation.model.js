import mongoose from 'mongoose';

import { TENANT_INVITABLE_ROLES } from '../../common/auth/roles.js';

const { Schema, Types } = mongoose;

export const INVITATION_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

/**
 * Pending invitations a tenant has sent. The opaque acceptance token is only
 * stored as a SHA-256 hash so a leaked database row never grants account
 * takeover — the plaintext lives in the email body and is shown once.
 *
 * Lifecycle: `pending` → (`accepted` | `revoked` | `expired`). Accepted /
 * revoked invitations are kept for audit visibility but can never be reused
 * (the unique partial index only constrains pending rows).
 */
const invitationSchema = new Schema(
  {
    tenantId: { type: Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    name: { type: String, default: null, trim: true },
    role: { type: String, enum: TENANT_INVITABLE_ROLES, required: true },
    tokenHash: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: INVITATION_STATUSES,
      default: 'pending',
      required: true,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    invitedByUserId: { type: Types.ObjectId, ref: 'User', required: true },
    acceptedByUserId: { type: Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
    revokedByUserId: { type: Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    resendCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Only one pending invitation may exist per (tenant, email). Resending replaces
// the token on the same row, and we only constrain `pending` so historical
// revoked/accepted rows do not block re-invitation later.
invitationSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
invitationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const toPublic = (_doc, ret) => {
  ret.id = ret._id?.toString();
  delete ret._id;
  delete ret.tokenHash;
  return ret;
};

invitationSchema.set('toJSON', { virtuals: true, versionKey: false, transform: toPublic });
invitationSchema.set('toObject', { virtuals: true, versionKey: false, transform: toPublic });

export const TeamInvitation =
  mongoose.models.TeamInvitation ?? mongoose.model('TeamInvitation', invitationSchema);
