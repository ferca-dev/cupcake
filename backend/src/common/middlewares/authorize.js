import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { roleHasPermission } from '../auth/index.js';

const ensureAuthenticated = (req) => {
  if (!req.user) {
    throw new AuthenticationError('Authentication required');
  }
};

/**
 * Requires the authenticated user's role to be in the supplied list.
 */
export const requireRole = (...roles) => {
  const allowed = roles.flat();
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      if (!allowed.includes(req.user.role)) {
        throw new AuthorizationError('Insufficient role to perform this action');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Requires the authenticated user to have every permission in the list.
 */
export const requirePermission = (...permissions) => {
  const required = permissions.flat();
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      const missing = required.filter((p) => !roleHasPermission(req.user.role, p));
      if (missing.length > 0) {
        throw new AuthorizationError(
          'Insufficient permissions',
          missing.map((p) => ({ permission: p })),
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Requires that any one of the given permissions is held by the user.
 */
export const requireAnyPermission = (...permissions) => {
  const allowed = permissions.flat();
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      const hasAny = allowed.some((p) => roleHasPermission(req.user.role, p));
      if (!hasAny) {
        throw new AuthorizationError('Insufficient permissions');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Ensures the route can rely on `req.tenantContext`. Super admins reach this
 * middleware without an inferred tenant — callers can opt them in via the
 * impersonation header so the access stays explicit.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.allowSuperAdminGlobal=true] - allow super admins
 *   without a tenant filter (true) or force them to pick one (false).
 */
export const requireTenantContext = ({ allowSuperAdminGlobal = true } = {}) => {
  return (req, _res, next) => {
    try {
      ensureAuthenticated(req);
      if (req.user.isSuperAdmin) {
        const impersonated = req.get('x-impersonate-tenant');
        if (impersonated) {
          req.tenantContext = { tenantId: impersonated, impersonated: true };
        } else if (!allowSuperAdminGlobal) {
          throw new AuthorizationError('Super admin must select a tenant for this action');
        }
        return next();
      }

      if (!req.tenantContext?.tenantId) {
        throw new AuthorizationError('Tenant context is required for this action');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};
