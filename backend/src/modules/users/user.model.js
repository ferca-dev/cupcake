import mongoose from 'mongoose';

import { ROLE_VALUES } from '../../common/auth/roles.js';

const { Schema, Types } = mongoose;

const USER_STATUSES = ['active', 'inactive', 'suspended'];

const preferencesSchema = new Schema(
  {
    // Language preference is mirrored to the frontend on `/auth/me`. The
    // bundle keys live in `frontend/src/i18n`; keep this list in sync with
    // `backend/src/modules/settings/supported-locales.js`.
    locale: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    tenantId: {
      type: Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: null, trim: true },
    whatsappPhone: { type: String, default: null, trim: true },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'active',
      required: true,
      index: true,
    },
    emailVerifiedAt: { type: Date, default: null },
    // Pending email-verification candidate. Stored separately from `email`
    // so the active address is never updated until a future verification
    // round confirms ownership. Phase 16 surfaces this field on the API; the
    // verification email flow is deferred to a later phase.
    pendingEmail: { type: String, default: null, lowercase: true, trim: true },
    preferences: { type: preferencesSchema, default: () => ({}) },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ email: 1 }, { unique: true });

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

userSchema.set('toObject', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id?.toString();
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

export const USER_STATUS_VALUES = USER_STATUSES;

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
