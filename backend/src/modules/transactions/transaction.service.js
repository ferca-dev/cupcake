import mongoose from 'mongoose';

import * as repo from './transaction.repository.js';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { recordAuditEvent } from '../audit/audit.service.js';

const ENTITY_TYPE = 'transaction';

export const TRANSACTION_AUDIT_ACTIONS = Object.freeze({
  VIEWED_BY_SUPER_ADMIN: 'transaction.viewed_by_super_admin',
  LISTED_BY_SUPER_ADMIN: 'transaction.listed_by_super_admin',
});

const assertObjectId = (id, label = 'id') => {
  if (!mongoose.isValidObjectId(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
};

const toPublicTransaction = (transaction) => ({
  id: transaction._id.toString(),
  tenantId: transaction.tenantId.toString(),
  type: transaction.type,
  status: transaction.status,
  amount: transaction.amount,
  currency: transaction.currency,
  provider: transaction.provider ?? null,
  providerReference: transaction.providerReference ?? null,
  description: transaction.description ?? null,
  planCode: transaction.planCode ?? null,
  paidAt: transaction.paidAt ?? null,
  initiatedBy: transaction.initiatedBy ? transaction.initiatedBy.toString() : null,
  createdAt: transaction.createdAt,
  updatedAt: transaction.updatedAt,
});

/**
 * Resolves the tenant scope for a transaction query.
 *
 * - Tenant-bound users always see only their own tenant.
 * - Super admins may pass `tenantId` to filter (set by the
 *   `x-impersonate-tenant` header). If omitted, they see all tenants and the
 *   audit log records the global read so the access is traceable.
 */
const resolveScope = ({ actor, requestedTenantId }) => {
  if (actor?.isSuperAdmin) {
    return { tenantFilter: requestedTenantId ?? null, isSuperAdmin: true };
  }
  if (!requestedTenantId) {
    throw new AuthorizationError('Tenant context is required for transactions');
  }
  return { tenantFilter: requestedTenantId, isSuperAdmin: false };
};

export const listTransactions = async ({
  actor,
  requestedTenantId = null,
  query = {},
  ip = null,
  userAgent = null,
}) => {
  const { tenantFilter, isSuperAdmin } = resolveScope({ actor, requestedTenantId });
  const result = await repo.findTransactions({
    tenantId: tenantFilter,
    status: query.status,
    type: query.type,
    provider: query.provider,
    page: query.page ?? 1,
    limit: query.limit ?? 25,
    sort: query.sort ?? '-createdAt',
  });

  if (isSuperAdmin) {
    // Record a single audit entry per list call rather than per row. The
    // metadata captures the filter scope so reviewers know what was inspected.
    await recordAuditEvent({
      action: TRANSACTION_AUDIT_ACTIONS.LISTED_BY_SUPER_ADMIN,
      entityType: ENTITY_TYPE,
      entityId: null,
      userId: actor?.id ?? null,
      tenantId: tenantFilter,
      ip,
      userAgent,
      metadata: {
        scope: tenantFilter ? 'tenant' : 'global',
        filters: {
          status: query.status ?? null,
          type: query.type ?? null,
          provider: query.provider ?? null,
        },
        returned: result.items.length,
      },
    });
  }

  return {
    items: result.items.map(toPublicTransaction),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.limit > 0 ? Math.ceil(result.total / result.limit) : 1,
    },
  };
};

export const getTransaction = async ({
  id,
  actor,
  requestedTenantId = null,
  ip = null,
  userAgent = null,
}) => {
  assertObjectId(id, 'transaction id');
  const { tenantFilter, isSuperAdmin } = resolveScope({ actor, requestedTenantId });
  const transaction = await repo.findTransactionById({ id, tenantId: tenantFilter });
  if (!transaction) {
    throw new NotFoundError('Transaction not found');
  }

  if (isSuperAdmin) {
    await recordAuditEvent({
      action: TRANSACTION_AUDIT_ACTIONS.VIEWED_BY_SUPER_ADMIN,
      entityType: ENTITY_TYPE,
      entityId: transaction._id.toString(),
      userId: actor?.id ?? null,
      tenantId: transaction.tenantId,
      ip,
      userAgent,
      metadata: { scope: tenantFilter ? 'tenant' : 'global' },
    });
  }

  return toPublicTransaction(transaction);
};

export const __testing = { toPublicTransaction, resolveScope };
