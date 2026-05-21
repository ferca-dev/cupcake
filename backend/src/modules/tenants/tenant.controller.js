import mongoose from 'mongoose';

import { Tenant } from './tenant.model.js';
import { sendSuccess } from '../../common/responses/index.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/index.js';

const toPublicTenant = (tenant) => ({
  id: tenant._id.toString(),
  name: tenant.name,
  slug: tenant.slug,
  ownerUserId: tenant.ownerUserId ? tenant.ownerUserId.toString() : null,
  status: tenant.status,
  planId: tenant.planId ? tenant.planId.toString() : null,
  settings: tenant.settings,
  createdAt: tenant.createdAt,
  updatedAt: tenant.updatedAt,
});

/**
 * Returns the authenticated user's tenant. Super admins have no tenant by
 * default; for them this endpoint returns `null` unless they impersonate one.
 */
export const getMyTenant = asyncHandler(async (req, res) => {
  if (req.user.isSuperAdmin && !req.tenantContext?.tenantId) {
    return sendSuccess(res, {
      data: { tenant: null },
      message: 'Super admin has no implicit tenant',
    });
  }

  const tenantId = req.tenantContext?.tenantId ?? req.user.tenantId;
  if (!tenantId) {
    throw new AuthorizationError('No tenant context available');
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }
  return sendSuccess(res, {
    data: { tenant: toPublicTenant(tenant) },
    message: 'Tenant fetched',
  });
});

/**
 * Fetches a tenant by id. Clients can only fetch their own tenant; super
 * admins can fetch any tenant. This route exists to verify tenant isolation
 * end-to-end in Phase 02 — Phase 13 will add full tenant administration.
 */
export const getTenantById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError('Invalid tenant id');
  }

  if (!req.user.isSuperAdmin && id !== req.user.tenantId) {
    throw new AuthorizationError('You cannot access this tenant');
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return sendSuccess(res, {
    data: { tenant: toPublicTenant(tenant) },
    message: 'Tenant fetched',
  });
});
