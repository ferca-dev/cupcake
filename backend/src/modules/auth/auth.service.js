import mongoose from 'mongoose';

import { User } from '../users/user.model.js';
import { Tenant } from '../tenants/tenant.model.js';
import { RefreshToken } from './refresh-token.model.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashTokenValue,
  refreshTokenExpiryDate,
  ROLES,
  isSuperAdmin,
} from '../../common/auth/index.js';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/index.js';
import { uniqueSlug } from '../../common/utils/slug.js';
import { recordAuditEvent, AUDIT_ACTIONS } from '../audit/audit.service.js';

const toPublicUser = (user) => ({
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
  preferences: {
    locale: user.preferences?.locale ?? 'en',
    timezone: user.preferences?.timezone ?? 'UTC',
  },
  lastLoginAt: user.lastLoginAt ?? null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const toPublicTenant = (tenant) =>
  tenant
    ? {
        id: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        ownerUserId: tenant.ownerUserId ? tenant.ownerUserId.toString() : null,
        status: tenant.status,
        planId: tenant.planId ? tenant.planId.toString() : null,
        settings: tenant.settings,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      }
    : null;

const issueAccessToken = (user) =>
  signAccessToken({
    userId: user._id,
    role: user.role,
    tenantId: user.tenantId,
  });

/**
 * Creates and persists a new refresh token for the given user.
 * The plaintext token returned in `token` is sent to the client; only its
 * hash is stored, and revocation is performed by hash.
 */
const issueRefreshToken = async ({ user, ip = null, userAgent = null, session = undefined }) => {
  const docId = new mongoose.Types.ObjectId();
  const jti = docId.toString();
  const token = signRefreshToken({ userId: user._id, jti });
  const tokenHash = hashTokenValue(token);

  const [created] = await RefreshToken.create(
    [
      {
        _id: docId,
        userId: user._id,
        tenantId: user.tenantId ?? null,
        tokenHash,
        expiresAt: refreshTokenExpiryDate(),
        ip,
        userAgent,
      },
    ],
    session ? { session } : undefined,
  );

  return { token, document: created };
};

const findActiveRefreshTokenByValue = async (token) => {
  const tokenHash = hashTokenValue(token);
  return RefreshToken.findOne({ tokenHash });
};

/**
 * Registers a new client account. Creates the user, the tenant, and the
 * initial refresh token in a single transaction so partial state never
 * leaks if any step fails. Returns the public user, tenant, and tokens.
 */
export const register = async ({
  name,
  email,
  password,
  tenantName,
  tenantSlug,
  phone = null,
  whatsappPhone = null,
  ip = null,
  userAgent = null,
}) => {
  const normalisedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalisedEmail });
  if (existingUser) {
    throw new ConflictError('An account with this email already exists');
  }

  const desiredSlug = tenantSlug ?? tenantName;
  const slug = await uniqueSlug(desiredSlug, async (candidate) => {
    const found = await Tenant.exists({ slug: candidate });
    return Boolean(found);
  });

  const passwordHash = await hashPassword(password);

  const createWithSession = async (activeSession) => {
    const userId = new mongoose.Types.ObjectId();
    const tenantId = new mongoose.Types.ObjectId();

    const [tenant] = await Tenant.create(
      [
        {
          _id: tenantId,
          name: tenantName,
          slug,
          ownerUserId: userId,
          status: 'active',
        },
      ],
      activeSession ? { session: activeSession } : undefined,
    );

    const [user] = await User.create(
      [
        {
          _id: userId,
          tenantId,
          role: ROLES.CLIENT_ADMIN,
          name,
          email: normalisedEmail,
          passwordHash,
          phone,
          whatsappPhone,
          status: 'active',
          lastLoginAt: new Date(),
        },
      ],
      activeSession ? { session: activeSession } : undefined,
    );

    const refresh = await issueRefreshToken({
      user,
      ip,
      userAgent,
      session: activeSession ?? undefined,
    });
    return { user, tenant, refresh };
  };

  let result;
  let session = null;
  try {
    session = mongoose.connection.readyState === 1 ? await mongoose.startSession() : null;
  } catch {
    session = null;
  }

  if (session) {
    try {
      await session.withTransaction(async () => {
        result = await createWithSession(session);
      });
    } catch (err) {
      // Standalone Mongo (e.g. local dev or in-memory test server) returns
      // code 20 when a transaction is attempted. Fall back to sequential
      // creates with manual cleanup so the feature still works there.
      const standalone =
        err?.code === 20 ||
        /Transaction numbers are only allowed on a replica set/.test(err?.message ?? '');
      if (!standalone) throw err;
      await session.endSession();
      session = null;
    } finally {
      if (session) await session.endSession();
    }
  }

  if (!result) {
    // Non-transactional path. If user creation fails after the tenant has
    // been written, clean up the orphan tenant so the system stays
    // consistent.
    try {
      result = await createWithSession(null);
    } catch (err) {
      try {
        await Tenant.deleteOne({ slug });
      } catch {
        // best-effort cleanup
      }
      throw err;
    }
  }

  const accessToken = issueAccessToken(result.user);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.AUTH_REGISTER,
    entityType: 'user',
    entityId: result.user._id.toString(),
    userId: result.user._id,
    tenantId: result.tenant._id,
    ip,
    userAgent,
    metadata: { email: normalisedEmail },
  });

  return {
    user: toPublicUser(result.user),
    tenant: toPublicTenant(result.tenant),
    accessToken,
    refreshToken: result.refresh.token,
  };
};

/**
 * Authenticates an email/password pair, records the login, and issues a new
 * pair of tokens. Failures never reveal whether the email exists.
 */
export const login = async ({ email, password, ip = null, userAgent = null }) => {
  const normalisedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalisedEmail }).select('+passwordHash');

  const invalidCredentials = () => new AuthenticationError('Invalid email or password');

  if (!user) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      entityType: 'user',
      ip,
      userAgent,
      metadata: { email: normalisedEmail, reason: 'unknown_email' },
    });
    throw invalidCredentials();
  }

  if (user.status !== 'active') {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      tenantId: user.tenantId,
      ip,
      userAgent,
      metadata: { reason: `user_status_${user.status}` },
    });
    throw new AuthenticationError('Your account is not currently active');
  }

  // Tenant gate: a user attached to a suspended/cancelled tenant cannot log in.
  // We surface a tenant-specific failure reason so the audit trail makes the
  // distinction between "user inactive" and "tenant disabled" explicit.
  if (user.tenantId) {
    const tenant = await Tenant.findById(user.tenantId).select('status');
    if (!tenant || tenant.status !== 'active') {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
        entityType: 'user',
        entityId: user._id.toString(),
        userId: user._id,
        tenantId: user.tenantId,
        ip,
        userAgent,
        metadata: { reason: `tenant_status_${tenant?.status ?? 'missing'}` },
      });
      throw new AuthenticationError('Your workspace is not currently active');
    }
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      entityType: 'user',
      entityId: user._id.toString(),
      userId: user._id,
      tenantId: user.tenantId,
      ip,
      userAgent,
      metadata: { reason: 'bad_password' },
    });
    throw invalidCredentials();
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = issueAccessToken(user);
  const refresh = await issueRefreshToken({ user, ip, userAgent });

  const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
    entityType: 'user',
    entityId: user._id.toString(),
    userId: user._id,
    tenantId: user.tenantId,
    ip,
    userAgent,
    metadata: { role: user.role },
  });

  return {
    user: toPublicUser(user),
    tenant: toPublicTenant(tenant),
    accessToken,
    refreshToken: refresh.token,
  };
};

/**
 * Rotates a refresh token. The presented token is consumed (revoked) and
 * replaced with a new one. If the presented token is already revoked, we
 * defensively revoke every active token for the user — this catches token
 * reuse from a stolen refresh secret.
 */
export const refresh = async ({ refreshToken, ip = null, userAgent = null }) => {
  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required');
  }

  const payload = verifyRefreshToken(refreshToken);

  const stored = await findActiveRefreshTokenByValue(refreshToken);
  if (!stored) {
    throw new AuthenticationError('Refresh token is invalid');
  }

  if (stored.revokedAt) {
    // Reuse detected — revoke every active session for this user.
    await RefreshToken.updateMany(
      { userId: stored.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    await recordAuditEvent({
      action: AUDIT_ACTIONS.AUTH_REFRESH_REUSE_DETECTED,
      entityType: 'refresh_token',
      entityId: stored._id.toString(),
      userId: stored.userId,
      tenantId: stored.tenantId,
      ip,
      userAgent,
    });
    throw new AuthenticationError('Refresh token has been revoked');
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw new AuthenticationError('Refresh token has expired');
  }

  if (payload.sub && payload.sub !== stored.userId.toString()) {
    throw new AuthenticationError('Refresh token does not match user');
  }

  const user = await User.findById(stored.userId);
  if (!user || user.status !== 'active') {
    throw new AuthenticationError('User is no longer active');
  }

  const newRefresh = await issueRefreshToken({ user, ip, userAgent });

  stored.revokedAt = new Date();
  stored.replacedByTokenHash = newRefresh.document.tokenHash;
  await stored.save();

  const accessToken = issueAccessToken(user);
  const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.AUTH_REFRESH,
    entityType: 'refresh_token',
    entityId: newRefresh.document._id.toString(),
    userId: user._id,
    tenantId: user.tenantId,
    ip,
    userAgent,
  });

  return {
    user: toPublicUser(user),
    tenant: toPublicTenant(tenant),
    accessToken,
    refreshToken: newRefresh.token,
  };
};

/**
 * Revokes the supplied refresh token if it exists. Idempotent — logging out
 * without a token still succeeds so clients can safely call /logout to
 * clear cookies even when the server token is unknown.
 */
export const logout = async ({ refreshToken, user = null, ip = null, userAgent = null }) => {
  if (!refreshToken) {
    if (user) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.AUTH_LOGOUT,
        entityType: 'user',
        entityId: user.id.toString(),
        userId: user.id,
        tenantId: user.tenantId,
        ip,
        userAgent,
        metadata: { reason: 'no_token_provided' },
      });
    }
    return { revoked: false };
  }

  const stored = await findActiveRefreshTokenByValue(refreshToken);
  if (!stored || stored.revokedAt) {
    return { revoked: false };
  }

  stored.revokedAt = new Date();
  await stored.save();

  await recordAuditEvent({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    entityType: 'refresh_token',
    entityId: stored._id.toString(),
    userId: stored.userId,
    tenantId: stored.tenantId,
    ip,
    userAgent,
  });

  return { revoked: true };
};

/**
 * Returns the current user envelope used by /auth/me.
 */
export const getCurrentUser = async (userId) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new ValidationError('Invalid user id');
  }
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;

  return {
    user: toPublicUser(user),
    tenant: toPublicTenant(tenant),
    permissions: undefined,
    isSuperAdmin: isSuperAdmin(user.role),
  };
};

/**
 * Records a password-reset request without leaking whether the email is
 * registered. Sending the actual reset email is intentionally deferred and
 * tracked in docs/known-limitations.md; the response shape is stable so
 * frontend and tests can rely on it. The audit trail captures every attempt.
 */
export const requestPasswordReset = async ({ email, ip = null, userAgent = null }) => {
  const normalised = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalised });
  await recordAuditEvent({
    action: AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUESTED,
    entityType: 'user',
    entityId: user?._id?.toString() ?? null,
    userId: user?._id ?? null,
    tenantId: user?.tenantId ?? null,
    ip,
    userAgent,
    metadata: { email: normalised, delivered: false },
  });
  return { delivered: false };
};

/**
 * Fails closed: this endpoint exists so the frontend route is reachable, but
 * the reset-token store and email delivery are intentionally deferred and
 * documented in docs/known-limitations.md. No password can ever be changed
 * through this code path until that store is implemented.
 */
export const resetPassword = async () => {
  throw new ValidationError('Password reset is temporarily unavailable');
};

export const __testing = {
  toPublicUser,
  toPublicTenant,
};
