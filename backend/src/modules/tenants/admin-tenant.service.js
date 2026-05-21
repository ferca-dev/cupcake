import mongoose from 'mongoose';

import * as repo from './tenant.repository.js';
import { Tenant } from './tenant.model.js';
import { User } from '../users/user.model.js';
import { RefreshToken } from '../auth/refresh-token.model.js';
import { hashPassword } from '../../common/auth/passwords.js';
import { ROLES } from '../../common/auth/roles.js';
import { slugify, uniqueSlug } from '../../common/utils/slug.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

export const TENANT_AUDIT_ACTIONS = Object.freeze({
  CREATED: 'admin.tenant.created',
  UPDATED: 'admin.tenant.updated',
  STATUS_CHANGED: 'admin.tenant.status_changed',
});

const ENTITY_TYPE = 'tenant';

const assertObjectId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const toPublicTenant = (tenant, extras = {}) => ({
  id: tenant._id.toString(),
  name: tenant.name,
  slug: tenant.slug,
  ownerUserId: tenant.ownerUserId ? tenant.ownerUserId.toString() : null,
  status: tenant.status,
  planId: tenant.planId ? tenant.planId.toString() : null,
  settings: tenant.settings,
  createdAt: tenant.createdAt,
  updatedAt: tenant.updatedAt,
  ...extras,
});

const audit = (action, { actor, tenant, metadata = {}, ip = null, userAgent = null }) =>
  recordAuditEvent({
    action,
    entityType: ENTITY_TYPE,
    entityId: tenant._id.toString(),
    userId: actor?.id ?? null,
    tenantId: tenant._id,
    ip,
    userAgent,
    metadata,
  });

const resolveSlug = async ({ requested, source }) => {
  if (requested) {
    if (await repo.slugExists(requested)) {
      throw new ConflictError('Slug is already in use', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    return requested;
  }
  return uniqueSlug(slugify(source), (candidate) => repo.slugExists(candidate));
};

const ensureEmailIsFree = async (email) => {
  const normalised = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalised });
  if (existing) {
    throw new ConflictError('A user with this email already exists', [
      { path: ['admin', 'email'], message: 'Email is already in use' },
    ]);
  }
  return normalised;
};

const requireTenantDoc = async (id) => {
  assertObjectId(id, 'tenant id');
  const tenant = await repo.findTenantById(id);
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return tenant;
};

export const listTenants = async (query = {}) => {
  const { items, total, page, limit } = await repo.findTenants(query);
  if (items.length === 0) {
    return {
      items: [],
      pagination: { page, limit, total, totalPages: 0 },
    };
  }

  // Pull user counts in a single grouped query so the list endpoint stays O(1)
  // round-trips regardless of page size.
  const ids = items.map((tenant) => tenant._id);
  const counts = await User.aggregate([
    { $match: { tenantId: { $in: ids } } },
    { $group: { _id: '$tenantId', total: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((row) => [row._id?.toString(), row.total ?? 0]));

  return {
    items: items.map((tenant) =>
      toPublicTenant(tenant, {
        userCount: countMap.get(tenant._id.toString()) ?? 0,
      }),
    ),
    pagination: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
};

export const getTenant = async ({ id }) => {
  const tenant = await requireTenantDoc(id);
  const [userCount, owner] = await Promise.all([
    User.countDocuments({ tenantId: tenant._id }),
    tenant.ownerUserId ? User.findById(tenant.ownerUserId) : Promise.resolve(null),
  ]);
  return toPublicTenant(tenant, {
    userCount,
    owner: owner
      ? {
          id: owner._id.toString(),
          name: owner.name,
          email: owner.email,
          status: owner.status,
        }
      : null,
  });
};

/**
 * Creates a new tenant from the admin panel. When `payload.admin` is provided
 * the service also provisions the first `client_admin` user inside the new
 * tenant and stamps it as `ownerUserId`. The two creations are *not* wrapped
 * in a Mongo transaction (local dev runs standalone), so we manually roll back
 * the tenant if user creation fails.
 */
export const createTenant = async ({ payload, actor, ip = null, userAgent = null }) => {
  if (payload.admin) {
    await ensureEmailIsFree(payload.admin.email);
  }

  const slug = await resolveSlug({ requested: payload.slug, source: payload.name });

  let tenant;
  try {
    tenant = await repo.createTenant({
      name: payload.name,
      slug,
      status: payload.status ?? 'active',
      planId: payload.planId ?? null,
      settings: payload.settings ?? undefined,
    });
  } catch (err) {
    // Slug collisions can race past the precheck; surface a clean 409.
    if (err?.code === 11000) {
      throw new ConflictError('Slug is already in use', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    throw err;
  }

  let adminUser = null;
  if (payload.admin) {
    try {
      const passwordHash = await hashPassword(payload.admin.password);
      adminUser = await User.create({
        tenantId: tenant._id,
        role: ROLES.CLIENT_ADMIN,
        name: payload.admin.name,
        email: payload.admin.email.toLowerCase().trim(),
        passwordHash,
        phone: payload.admin.phone ?? null,
        whatsappPhone: payload.admin.whatsappPhone ?? null,
        status: 'active',
        emailVerifiedAt: new Date(),
      });
      tenant.ownerUserId = adminUser._id;
      await tenant.save();
    } catch (err) {
      // Roll back the tenant so we never leave an orphaned record with a
      // partially-provisioned admin.
      try {
        await tenant.deleteOne();
      } catch {
        // best-effort cleanup
      }
      if (err?.code === 11000) {
        throw new ConflictError('A user with this email already exists', [
          { path: ['admin', 'email'], message: 'Email is already in use' },
        ]);
      }
      throw err;
    }
  }

  await audit(TENANT_AUDIT_ACTIONS.CREATED, {
    actor,
    tenant,
    metadata: {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAdminUserId: adminUser?._id?.toString() ?? null,
    },
    ip,
    userAgent,
  });

  return toPublicTenant(tenant, {
    userCount: adminUser ? 1 : 0,
    owner: adminUser
      ? {
          id: adminUser._id.toString(),
          name: adminUser.name,
          email: adminUser.email,
          status: adminUser.status,
        }
      : null,
  });
};

const toPlainObject = (value) =>
  value && typeof value.toObject === 'function' ? value.toObject() : value;

const mergeSettings = (current, incoming) => {
  const base = toPlainObject(current) || {};
  const merged = { ...base, ...incoming };
  if (incoming.branding !== undefined) {
    const baseBranding = toPlainObject(base.branding) || {};
    merged.branding = { ...baseBranding, ...incoming.branding };
  }
  return merged;
};

const applyTenantUpdates = async ({ tenant, payload }) => {
  const changes = [];
  if (payload.name !== undefined && payload.name !== tenant.name) {
    tenant.name = payload.name;
    changes.push('name');
  }
  if (payload.slug !== undefined && payload.slug !== tenant.slug) {
    if (await repo.slugExists(payload.slug)) {
      throw new ConflictError('Slug is already in use', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    tenant.slug = payload.slug;
    changes.push('slug');
  }
  if (payload.planId !== undefined) {
    const next = payload.planId ?? null;
    const current = tenant.planId ? tenant.planId.toString() : null;
    if (current !== (next?.toString?.() ?? next)) {
      tenant.planId = next;
      changes.push('planId');
    }
  }
  if (payload.settings !== undefined) {
    tenant.settings = mergeSettings(tenant.settings, payload.settings);
    changes.push('settings');
  }
  return changes;
};

export const updateTenant = async ({ id, payload, actor, ip = null, userAgent = null }) => {
  const tenant = await requireTenantDoc(id);
  const changes = await applyTenantUpdates({ tenant, payload });

  if (changes.length === 0) {
    return toPublicTenant(tenant);
  }

  try {
    await tenant.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ConflictError('Slug is already in use', [
        { path: ['slug'], message: 'Slug is already in use' },
      ]);
    }
    throw err;
  }

  await audit(TENANT_AUDIT_ACTIONS.UPDATED, {
    actor,
    tenant,
    metadata: { changedKeys: changes },
    ip,
    userAgent,
  });

  return toPublicTenant(tenant);
};

/**
 * Cascades a tenant status change into the access surface so the behavior
 * documented in `tenants` flows end-to-end:
 *
 *   - `suspended` → users keep their accounts but cannot log in. Active
 *     refresh tokens are revoked so existing sessions die at the next API
 *     call (the access token expires within minutes regardless).
 *   - `cancelled` → users are deactivated. They cannot log in and any saved
 *     refresh tokens are revoked.
 *   - `active`    → reactivate `inactive` users back to active. Users that
 *     were manually marked `suspended` stay that way, because that is a
 *     per-user decision rather than a cascade.
 */
const cascadeStatus = async ({ tenant, previousStatus, nextStatus }) => {
  if (previousStatus === nextStatus) return { affectedUsers: 0, revokedTokens: 0 };
  let affectedUsers = 0;
  let revokedTokens = 0;

  if (nextStatus === 'suspended') {
    const result = await RefreshToken.updateMany(
      { tenantId: tenant._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    revokedTokens = result.modifiedCount ?? 0;
  } else if (nextStatus === 'cancelled') {
    const usersResult = await User.updateMany(
      { tenantId: tenant._id, status: mongoose.trusted({ $ne: 'inactive' }) },
      { $set: { status: 'inactive' } },
    );
    affectedUsers = usersResult.modifiedCount ?? 0;
    const tokenResult = await RefreshToken.updateMany(
      { tenantId: tenant._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    revokedTokens = tokenResult.modifiedCount ?? 0;
  } else if (nextStatus === 'active') {
    const result = await User.updateMany(
      { tenantId: tenant._id, status: 'inactive' },
      { $set: { status: 'active' } },
    );
    affectedUsers = result.modifiedCount ?? 0;
  }

  return { affectedUsers, revokedTokens };
};

export const updateTenantStatus = async ({ id, payload, actor, ip = null, userAgent = null }) => {
  const tenant = await requireTenantDoc(id);
  const previousStatus = tenant.status;
  if (previousStatus === payload.status) {
    return {
      tenant: toPublicTenant(tenant),
      changed: false,
      affectedUsers: 0,
      revokedTokens: 0,
    };
  }

  tenant.status = payload.status;
  await tenant.save();

  const cascade = await cascadeStatus({
    tenant,
    previousStatus,
    nextStatus: payload.status,
  });

  await audit(TENANT_AUDIT_ACTIONS.STATUS_CHANGED, {
    actor,
    tenant,
    metadata: {
      previousStatus,
      nextStatus: payload.status,
      reason: payload.reason ?? null,
      affectedUsers: cascade.affectedUsers,
      revokedTokens: cascade.revokedTokens,
    },
    ip,
    userAgent,
  });

  return {
    tenant: toPublicTenant(tenant),
    changed: true,
    previousStatus,
    ...cascade,
  };
};

export const listTenantUsers = async ({ id }) => {
  const tenant = await requireTenantDoc(id);
  const users = await User.find({ tenantId: tenant._id })
    .sort({ createdAt: -1 })
    .select('_id name email role status lastLoginAt createdAt updatedAt');
  return {
    tenantId: tenant._id.toString(),
    items: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })),
  };
};

/**
 * Returns whether a tenant is allowed to perform business operations. Used by
 * the auth layer to keep suspended/cancelled tenants out of the system without
 * spreading the rule across every module.
 */
export const isTenantOperational = (tenant) => tenant?.status === 'active';

/**
 * Loads a tenant strictly for runtime access checks. Returns the bare doc or
 * null — callers decide the failure mode (auth vs. authorization).
 */
export const findTenantForRuntime = (id) => Tenant.findById(id);

export const __testing = { cascadeStatus, toPublicTenant };
