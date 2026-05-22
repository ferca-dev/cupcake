import mongoose from 'mongoose';

import { User } from '../users/user.model.js';
import { RefreshToken } from '../auth/refresh-token.model.js';
import { hashPassword, verifyPassword } from '../../common/auth/passwords.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './supported-locales.js';

/**
 * Audit codes for the account-settings flows. Centralised here so any future
 * notification or webhook can subscribe by code instead of by free-text.
 */
export const SETTINGS_AUDIT_ACTIONS = Object.freeze({
  PROFILE_UPDATED: 'settings.profile.updated',
  PASSWORD_CHANGED: 'settings.password.changed',
  PREFERENCES_UPDATED: 'settings.preferences.updated',
});

const ENTITY_TYPE = 'user';

const toPublicProfile = (user) => ({
  id: user._id.toString(),
  tenantId: user.tenantId ? user.tenantId.toString() : null,
  role: user.role,
  name: user.name,
  email: user.email,
  pendingEmail: user.pendingEmail ?? null,
  phone: user.phone ?? null,
  whatsappPhone: user.whatsappPhone ?? null,
  status: user.status,
  emailVerifiedAt: user.emailVerifiedAt ?? null,
  lastLoginAt: user.lastLoginAt ?? null,
  preferences: {
    locale: user.preferences?.locale ?? DEFAULT_LOCALE,
    timezone: user.preferences?.timezone ?? 'UTC',
  },
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const requireUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new ValidationError('Invalid user id');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user;
};

export const getProfile = async (userId) => {
  const user = await requireUser(userId);
  return toPublicProfile(user);
};

/**
 * Updates non-privileged profile fields. Role, tenant, status, and any other
 * field that grants additional access intentionally cannot be set here — the
 * settings surface must never become a privilege-escalation path.
 */
export const updateProfile = async ({ userId, payload, ip = null, userAgent = null }) => {
  const user = await requireUser(userId);
  const changedKeys = [];

  if (payload.name !== undefined && payload.name !== user.name) {
    user.name = payload.name;
    changedKeys.push('name');
  }

  if (payload.email !== undefined) {
    const nextEmail = payload.email.toLowerCase().trim();
    if (nextEmail !== user.email) {
      const conflict = await User.findOne({ email: nextEmail });
      if (conflict && !conflict._id.equals(user._id)) {
        throw new ConflictError('An account with this email already exists', [
          { path: ['email'], message: 'Email is already in use' },
        ]);
      }
      // Email changes are staged in `pendingEmail` so the active address only
      // moves once a future verification flow confirms ownership.
      user.pendingEmail = nextEmail;
      changedKeys.push('pendingEmail');
    } else if (user.pendingEmail) {
      user.pendingEmail = null;
      changedKeys.push('pendingEmail');
    }
  }

  if (payload.phone !== undefined && payload.phone !== user.phone) {
    user.phone = payload.phone ?? null;
    changedKeys.push('phone');
  }

  if (payload.whatsappPhone !== undefined && payload.whatsappPhone !== user.whatsappPhone) {
    user.whatsappPhone = payload.whatsappPhone ?? null;
    changedKeys.push('whatsappPhone');
  }

  if (changedKeys.length > 0) {
    await user.save();
    await recordAuditEvent({
      action: SETTINGS_AUDIT_ACTIONS.PROFILE_UPDATED,
      entityType: ENTITY_TYPE,
      entityId: user._id.toString(),
      userId: user._id,
      tenantId: user.tenantId,
      ip,
      userAgent,
      metadata: { changedKeys },
    });
  }

  return toPublicProfile(user);
};

/**
 * Verifies the current password, swaps in the new hash, and revokes every
 * active refresh token for the user. The active access token continues to
 * work until its short expiry — that is acceptable because access tokens are
 * stateless; the refresh-token revocation guarantees the new password is
 * required to obtain a new session anywhere else.
 */
export const updatePassword = async ({
  userId,
  payload,
  ip = null,
  userAgent = null,
  exemptRefreshTokenId = null,
}) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new ValidationError('Invalid user id');
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const valid = await verifyPassword(payload.currentPassword, user.passwordHash);
  if (!valid) {
    throw new AuthenticationError('Current password is incorrect');
  }

  user.passwordHash = await hashPassword(payload.newPassword);
  await user.save();

  const revocationFilter = { userId: user._id, revokedAt: null };
  if (exemptRefreshTokenId && mongoose.isValidObjectId(exemptRefreshTokenId)) {
    revocationFilter._id = { $ne: exemptRefreshTokenId };
  }
  await RefreshToken.updateMany(revocationFilter, { $set: { revokedAt: new Date() } });

  await recordAuditEvent({
    action: SETTINGS_AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: ENTITY_TYPE,
    entityId: user._id.toString(),
    userId: user._id,
    tenantId: user.tenantId,
    ip,
    userAgent,
  });

  return { passwordChangedAt: new Date() };
};

export const updatePreferences = async ({ userId, payload, ip = null, userAgent = null }) => {
  const user = await requireUser(userId);
  const changedKeys = [];

  if (!user.preferences) {
    user.preferences = {};
  }

  if (payload.locale !== undefined) {
    if (!SUPPORTED_LOCALES.includes(payload.locale)) {
      throw new ValidationError('Locale is not supported', [
        { path: ['locale'], message: 'Unsupported locale' },
      ]);
    }
    if (user.preferences.locale !== payload.locale) {
      user.preferences.locale = payload.locale;
      changedKeys.push('locale');
    }
  }

  if (payload.timezone !== undefined && payload.timezone !== user.preferences.timezone) {
    user.preferences.timezone = payload.timezone;
    changedKeys.push('timezone');
  }

  if (changedKeys.length > 0) {
    // Mongoose only picks up nested mutations when explicitly marked, otherwise
    // a freshly-loaded document with no prior preferences subdoc may skip the
    // write entirely.
    user.markModified('preferences');
    await user.save();
    await recordAuditEvent({
      action: SETTINGS_AUDIT_ACTIONS.PREFERENCES_UPDATED,
      entityType: ENTITY_TYPE,
      entityId: user._id.toString(),
      userId: user._id,
      tenantId: user.tenantId,
      ip,
      userAgent,
      metadata: { changedKeys },
    });
  }

  return toPublicProfile(user);
};

export const __testing = { toPublicProfile };
